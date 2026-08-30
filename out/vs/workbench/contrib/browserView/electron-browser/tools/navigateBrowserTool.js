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
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IPlaywrightService } from "../../../../../platform/browserView/common/playwrightService.js";
import { ToolDataSource } from "../../../chat/common/tools/languageModelToolsService.js";
import { IAgentNetworkFilterService } from "../../../../../platform/networkFilter/common/networkFilterService.js";
import { createBrowserPageLink, errorResult, getBrowserPageResourceNavigationError, getSessionId, playwrightInvoke, remoteUrlRewriteNotice, rewriteRemoteLocalhostUrl } from "./browserToolHelpers.js";
import { BrowserChatToolReferenceName } from "../../../../../platform/browserView/common/browserChatToolReferenceNames.js";
import { IBrowserViewWorkbenchService } from "../../common/browserView.js";
import { IRemoteExplorerService } from "../../../../services/remote/common/remoteExplorerService.js";
import { OpenPageToolId } from "./openBrowserTool.js";
const NavigateBrowserToolData = {
  id: "navigate_page",
  toolReferenceName: BrowserChatToolReferenceName.NavigatePage,
  displayName: localize("navigateBrowserTool.displayName", "Navigate Page"),
  userDescription: localize("navigateBrowserTool.userDescription", "Navigate or reload a browser page"),
  modelDescription: "Navigate a browser page by URL, history, or reload.",
  icon: Codicon.arrowRight,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: `The browser page ID to navigate, acquired from context or the open tool.`
      },
      type: {
        type: "string",
        enum: ["url", "back", "forward", "reload"],
        description: 'Navigation type: "url" to navigate to a URL (default, requires "url" param), "back" or "forward" for history, "reload" to refresh.'
      },
      url: {
        type: "string",
        description: 'The URL to navigate to. Required when type is "url".'
      }
    },
    required: ["pageId"]
  }
};
let NavigateBrowserTool = class {
  constructor(playwrightService, agentNetworkFilterService, browserViewService, remoteExplorerService) {
    this.playwrightService = playwrightService;
    this.agentNetworkFilterService = agentNetworkFilterService;
    this.browserViewService = browserViewService;
    this.remoteExplorerService = remoteExplorerService;
  }
  async prepareToolInvocation(context, _token) {
    const params = context.parameters;
    const link = createBrowserPageLink(params.pageId);
    switch (params.type) {
      case "reload":
        return {
          invocationMessage: new MarkdownString(localize("browser.reload.invocation", "Reloading {0}", link)),
          pastTenseMessage: new MarkdownString(localize("browser.reload.past", "Reloaded {0}", link)),
          icon: Codicon.refresh
        };
      case "back":
        return {
          invocationMessage: new MarkdownString(localize("browser.goBack.invocation", "Navigating backward in {0}", link)),
          pastTenseMessage: new MarkdownString(localize("browser.goBack.past", "Navigated backward in {0}", link)),
          icon: Codicon.arrowLeft
        };
      case "forward":
        return {
          invocationMessage: new MarkdownString(localize("browser.goForward.invocation", "Navigating forward in {0}", link)),
          pastTenseMessage: new MarkdownString(localize("browser.goForward.past", "Navigated forward in {0}", link)),
          icon: Codicon.arrowRight
        };
      default: {
        if (!params.url) {
          throw new Error('The "url" parameter is required when type is "url".');
        }
        const parsed = URL.parse(params.url);
        if (!parsed) {
          throw new Error("You must provide a complete, valid URL.");
        }
        const resourceNavigationError = this.getResourceNavigationError(params.pageId, params.url);
        if (resourceNavigationError) {
          throw new Error(resourceNavigationError);
        }
        const uri = URI.parse(params.url);
        if (!this.agentNetworkFilterService.isUriAllowed(uri)) {
          throw new Error(this.agentNetworkFilterService.formatError(uri));
        }
        return {
          invocationMessage: new MarkdownString(localize("browser.navigate.invocation", "Navigating to {0} in {1}", parsed.href, link)),
          pastTenseMessage: new MarkdownString(localize("browser.navigate.past", "Navigated to {0} in {1}", parsed.href, link)),
          confirmationMessages: {
            title: localize("browser.navigate.confirmTitle", "Navigate Browser?"),
            message: localize("browser.navigate.confirmMessage", "This will navigate the browser to {0} and allow the agent to access its contents.", parsed.href),
            allowAutoConfirm: true
          }
        };
      }
    }
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const params = invocation.parameters;
    const sessionId = getSessionId(invocation);
    if (!params.pageId) {
      return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
    }
    switch (params.type) {
      case "reload":
        return playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page) => page.reload({ waitUntil: "domcontentloaded" }));
      case "back":
        return playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page) => page.goBack({ waitUntil: "domcontentloaded" }));
      case "forward":
        return playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page) => page.goForward({ waitUntil: "domcontentloaded" }));
      default: {
        const resourceNavigationError = this.getResourceNavigationError(params.pageId, params.url);
        if (resourceNavigationError) {
          return errorResult(resourceNavigationError);
        }
        const rewrite = rewriteRemoteLocalhostUrl(params.url, this.browserViewService, this.remoteExplorerService);
        const result = await playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page, target) => {
          return page.goto(target, { waitUntil: "domcontentloaded" });
        }, rewrite.url);
        return rewrite.rewritten ? { ...result, content: [remoteUrlRewriteNotice(params.url, rewrite.url), ...result.content] } : result;
      }
    }
  }
  getResourceNavigationError(pageId, target) {
    const editor = this.browserViewService.getKnownBrowserViews().get(pageId);
    return getBrowserPageResourceNavigationError(editor, target);
  }
};
NavigateBrowserTool = __decorateClass([
  __decorateParam(0, IPlaywrightService),
  __decorateParam(1, IAgentNetworkFilterService),
  __decorateParam(2, IBrowserViewWorkbenchService),
  __decorateParam(3, IRemoteExplorerService)
], NavigateBrowserTool);
export {
  NavigateBrowserTool,
  NavigateBrowserToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xcbmF2aWdhdGVCcm93c2VyVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElQbGF5d3JpZ2h0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9wbGF5d3JpZ2h0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSwgdHlwZSBDb3VudFRva2Vuc0NhbGxiYWNrLCB0eXBlIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sRGF0YSwgdHlwZSBJVG9vbEltcGwsIHR5cGUgSVRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdHlwZSBJVG9vbFJlc3VsdCwgdHlwZSBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQnJvd3NlclBhZ2VMaW5rLCBlcnJvclJlc3VsdCwgZ2V0QnJvd3NlclBhZ2VSZXNvdXJjZU5hdmlnYXRpb25FcnJvciwgZ2V0U2Vzc2lvbklkLCBwbGF5d3JpZ2h0SW52b2tlLCByZW1vdGVVcmxSZXdyaXRlTm90aWNlLCByZXdyaXRlUmVtb3RlTG9jYWxob3N0VXJsIH0gZnJvbSAnLi9icm93c2VyVG9vbEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgQnJvd3NlckNoYXRUb29sUmVmZXJlbmNlTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lcy5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUV4cGxvcmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBPcGVuUGFnZVRvb2xJZCB9IGZyb20gJy4vb3BlbkJyb3dzZXJUb29sLmpzJztcblxuZXhwb3J0IGNvbnN0IE5hdmlnYXRlQnJvd3NlclRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiAnbmF2aWdhdGVfcGFnZScsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lLk5hdmlnYXRlUGFnZSxcblx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCduYXZpZ2F0ZUJyb3dzZXJUb29sLmRpc3BsYXlOYW1lJywgJ05hdmlnYXRlIFBhZ2UnKSxcblx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbmF2aWdhdGVCcm93c2VyVG9vbC51c2VyRGVzY3JpcHRpb24nLCAnTmF2aWdhdGUgb3IgcmVsb2FkIGEgYnJvd3NlciBwYWdlJyksXG5cdG1vZGVsRGVzY3JpcHRpb246ICdOYXZpZ2F0ZSBhIGJyb3dzZXIgcGFnZSBieSBVUkwsIGhpc3RvcnksIG9yIHJlbG9hZC4nLFxuXHRpY29uOiBDb2RpY29uLmFycm93UmlnaHQsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGlucHV0U2NoZW1hOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0cGFnZUlkOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYFRoZSBicm93c2VyIHBhZ2UgSUQgdG8gbmF2aWdhdGUsIGFjcXVpcmVkIGZyb20gY29udGV4dCBvciB0aGUgb3BlbiB0b29sLmBcblx0XHRcdH0sXG5cdFx0XHR0eXBlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ3VybCcsICdiYWNrJywgJ2ZvcndhcmQnLCAncmVsb2FkJ10sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnTmF2aWdhdGlvbiB0eXBlOiBcInVybFwiIHRvIG5hdmlnYXRlIHRvIGEgVVJMIChkZWZhdWx0LCByZXF1aXJlcyBcInVybFwiIHBhcmFtKSwgXCJiYWNrXCIgb3IgXCJmb3J3YXJkXCIgZm9yIGhpc3RvcnksIFwicmVsb2FkXCIgdG8gcmVmcmVzaC4nXG5cdFx0XHR9LFxuXHRcdFx0dXJsOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBVUkwgdG8gbmF2aWdhdGUgdG8uIFJlcXVpcmVkIHdoZW4gdHlwZSBpcyBcInVybFwiLidcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRyZXF1aXJlZDogWydwYWdlSWQnXSxcblx0fSxcbn07XG5cbmludGVyZmFjZSBJTmF2aWdhdGVCcm93c2VyVG9vbFBhcmFtcyB7XG5cdHBhZ2VJZDogc3RyaW5nO1xuXHR0eXBlPzogJ3VybCcgfCAnYmFjaycgfCAnZm9yd2FyZCcgfCAncmVsb2FkJztcblx0dXJsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgTmF2aWdhdGVCcm93c2VyVG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUGxheXdyaWdodFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbGF5d3JpZ2h0U2VydmljZTogSVBsYXl3cmlnaHRTZXJ2aWNlLFxuXHRcdEBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2U6IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlclZpZXdTZXJ2aWNlOiBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFyYW1zID0gY29udGV4dC5wYXJhbWV0ZXJzIGFzIElOYXZpZ2F0ZUJyb3dzZXJUb29sUGFyYW1zO1xuXHRcdGNvbnN0IGxpbmsgPSBjcmVhdGVCcm93c2VyUGFnZUxpbmsocGFyYW1zLnBhZ2VJZCk7XG5cdFx0c3dpdGNoIChwYXJhbXMudHlwZSkge1xuXHRcdFx0Y2FzZSAncmVsb2FkJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLnJlbG9hZC5pbnZvY2F0aW9uJywgXCJSZWxvYWRpbmcgezB9XCIsIGxpbmspKSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIucmVsb2FkLnBhc3QnLCBcIlJlbG9hZGVkIHswfVwiLCBsaW5rKSksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZWZyZXNoLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnYmFjayc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5nb0JhY2suaW52b2NhdGlvbicsIFwiTmF2aWdhdGluZyBiYWNrd2FyZCBpbiB7MH1cIiwgbGluaykpLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5nb0JhY2sucGFzdCcsIFwiTmF2aWdhdGVkIGJhY2t3YXJkIGluIHswfVwiLCBsaW5rKSksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd0xlZnQsXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdmb3J3YXJkJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLmdvRm9yd2FyZC5pbnZvY2F0aW9uJywgXCJOYXZpZ2F0aW5nIGZvcndhcmQgaW4gezB9XCIsIGxpbmspKSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIuZ29Gb3J3YXJkLnBhc3QnLCBcIk5hdmlnYXRlZCBmb3J3YXJkIGluIHswfVwiLCBsaW5rKSksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd1JpZ2h0LFxuXHRcdFx0XHR9O1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRpZiAoIXBhcmFtcy51cmwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoZSBcInVybFwiIHBhcmFtZXRlciBpcyByZXF1aXJlZCB3aGVuIHR5cGUgaXMgXCJ1cmxcIi4nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBVUkwucGFyc2UocGFyYW1zLnVybCk7XG5cdFx0XHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBwcm92aWRlIGEgY29tcGxldGUsIHZhbGlkIFVSTC4nKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlc291cmNlTmF2aWdhdGlvbkVycm9yID0gdGhpcy5nZXRSZXNvdXJjZU5hdmlnYXRpb25FcnJvcihwYXJhbXMucGFnZUlkLCBwYXJhbXMudXJsKTtcblx0XHRcdFx0aWYgKHJlc291cmNlTmF2aWdhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKHJlc291cmNlTmF2aWdhdGlvbkVycm9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShwYXJhbXMudXJsKTtcblx0XHRcdFx0aWYgKCF0aGlzLmFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UuaXNVcmlBbGxvd2VkKHVyaSkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5hZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLmZvcm1hdEVycm9yKHVyaSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLm5hdmlnYXRlLmludm9jYXRpb24nLCBcIk5hdmlnYXRpbmcgdG8gezB9IGluIHsxfVwiLCBwYXJzZWQuaHJlZiwgbGluaykpLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5uYXZpZ2F0ZS5wYXN0JywgXCJOYXZpZ2F0ZWQgdG8gezB9IGluIHsxfVwiLCBwYXJzZWQuaHJlZiwgbGluaykpLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Jyb3dzZXIubmF2aWdhdGUuY29uZmlybVRpdGxlJywgJ05hdmlnYXRlIEJyb3dzZXI/JyksXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnYnJvd3Nlci5uYXZpZ2F0ZS5jb25maXJtTWVzc2FnZScsICdUaGlzIHdpbGwgbmF2aWdhdGUgdGhlIGJyb3dzZXIgdG8gezB9IGFuZCBhbGxvdyB0aGUgYWdlbnQgdG8gYWNjZXNzIGl0cyBjb250ZW50cy4nLCBwYXJzZWQuaHJlZiksXG5cdFx0XHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJhbXMgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSU5hdmlnYXRlQnJvd3NlclRvb2xQYXJhbXM7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gZ2V0U2Vzc2lvbklkKGludm9jYXRpb24pO1xuXG5cdFx0aWYgKCFwYXJhbXMucGFnZUlkKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQoYE5vIHBhZ2UgSUQgcHJvdmlkZWQuIFVzZSAnJHtPcGVuUGFnZVRvb2xJZH0nIGZpcnN0LmApO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAocGFyYW1zLnR5cGUpIHtcblx0XHRcdGNhc2UgJ3JlbG9hZCc6XG5cdFx0XHRcdHJldHVybiBwbGF5d3JpZ2h0SW52b2tlKHRoaXMucGxheXdyaWdodFNlcnZpY2UsIHNlc3Npb25JZCwgcGFyYW1zLnBhZ2VJZCwgKHBhZ2UpID0+IHBhZ2UucmVsb2FkKHsgd2FpdFVudGlsOiAnZG9tY29udGVudGxvYWRlZCcgfSkpO1xuXHRcdFx0Y2FzZSAnYmFjayc6XG5cdFx0XHRcdHJldHVybiBwbGF5d3JpZ2h0SW52b2tlKHRoaXMucGxheXdyaWdodFNlcnZpY2UsIHNlc3Npb25JZCwgcGFyYW1zLnBhZ2VJZCwgKHBhZ2UpID0+IHBhZ2UuZ29CYWNrKHsgd2FpdFVudGlsOiAnZG9tY29udGVudGxvYWRlZCcgfSkpO1xuXHRcdFx0Y2FzZSAnZm9yd2FyZCc6XG5cdFx0XHRcdHJldHVybiBwbGF5d3JpZ2h0SW52b2tlKHRoaXMucGxheXdyaWdodFNlcnZpY2UsIHNlc3Npb25JZCwgcGFyYW1zLnBhZ2VJZCwgKHBhZ2UpID0+IHBhZ2UuZ29Gb3J3YXJkKHsgd2FpdFVudGlsOiAnZG9tY29udGVudGxvYWRlZCcgfSkpO1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU5hdmlnYXRpb25FcnJvciA9IHRoaXMuZ2V0UmVzb3VyY2VOYXZpZ2F0aW9uRXJyb3IocGFyYW1zLnBhZ2VJZCwgcGFyYW1zLnVybCEpO1xuXHRcdFx0XHRpZiAocmVzb3VyY2VOYXZpZ2F0aW9uRXJyb3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQocmVzb3VyY2VOYXZpZ2F0aW9uRXJyb3IpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSW4gYSByZW1vdGUgd29ya3NwYWNlIHdpdGhvdXQgdGhlIHJlbW90ZSBwcm94eSwgdGhlIGludGVncmF0ZWRcblx0XHRcdFx0Ly8gYnJvd3NlciBydW5zIGxvY2FsbHkgYW5kIGNhbm5vdCByZWFjaCB0aGUgcmVtb3RlJ3MgbG9jYWxob3N0IGRpcmVjdGx5LlxuXHRcdFx0XHQvLyBSZXdyaXRlIHRvIHRoZSBmb3J3YXJkZWQgbG9jYWwgYWRkcmVzcyAoaWYgYW55KSBzbyB0aGUgcGFnZSBjYW4gYmUgcmVhY2hlZC5cblx0XHRcdFx0Y29uc3QgcmV3cml0ZSA9IHJld3JpdGVSZW1vdGVMb2NhbGhvc3RVcmwocGFyYW1zLnVybCEsIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBsYXl3cmlnaHRJbnZva2UodGhpcy5wbGF5d3JpZ2h0U2VydmljZSwgc2Vzc2lvbklkLCBwYXJhbXMucGFnZUlkLCAocGFnZSwgdGFyZ2V0KSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhZ2UuZ290byh0YXJnZXQsIHsgd2FpdFVudGlsOiAnZG9tY29udGVudGxvYWRlZCcgfSk7XG5cdFx0XHRcdH0sIHJld3JpdGUudXJsKTtcblx0XHRcdFx0cmV0dXJuIHJld3JpdGUucmV3cml0dGVuXG5cdFx0XHRcdFx0PyB7IC4uLnJlc3VsdCwgY29udGVudDogW3JlbW90ZVVybFJld3JpdGVOb3RpY2UocGFyYW1zLnVybCEsIHJld3JpdGUudXJsKSwgLi4ucmVzdWx0LmNvbnRlbnRdIH1cblx0XHRcdFx0XHQ6IHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFJlc291cmNlTmF2aWdhdGlvbkVycm9yKHBhZ2VJZDogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5icm93c2VyVmlld1NlcnZpY2UuZ2V0S25vd25Ccm93c2VyVmlld3MoKS5nZXQocGFnZUlkKTtcblx0XHRyZXR1cm4gZ2V0QnJvd3NlclBhZ2VSZXNvdXJjZU5hdmlnYXRpb25FcnJvcihlZGl0b3IsIHRhcmdldCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFpTjtBQUMxTixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHVCQUF1QixhQUFhLHVDQUF1QyxjQUFjLGtCQUFrQix3QkFBd0IsaUNBQWlDO0FBQzdLLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBRXhCLE1BQU0sMEJBQXFDO0FBQUEsRUFDakQsSUFBSTtBQUFBLEVBQ0osbUJBQW1CLDZCQUE2QjtBQUFBLEVBQ2hELGFBQWEsU0FBUyxtQ0FBbUMsZUFBZTtBQUFBLEVBQ3hFLGlCQUFpQixTQUFTLHVDQUF1QyxtQ0FBbUM7QUFBQSxFQUNwRyxrQkFBa0I7QUFBQSxFQUNsQixNQUFNLFFBQVE7QUFBQSxFQUNkLFFBQVEsZUFBZTtBQUFBLEVBQ3ZCLGFBQWE7QUFBQSxJQUNaLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxNQUNYLFFBQVE7QUFBQSxRQUNQ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
