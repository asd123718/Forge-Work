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
import { raceCancellation } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { CancellationError } from "../../../../../base/common/errors.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { hasKey } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IPlaywrightService } from "../../../../../platform/browserView/common/playwrightService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IAgentNetworkFilterService } from "../../../../../platform/networkFilter/common/networkFilterService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IChatService } from "../../../chat/common/chatService/chatService.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../chat/common/constants.js";
import { ChatQuestionCarouselData } from "../../../chat/common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { ToolDataSource } from "../../../chat/common/tools/languageModelToolsService.js";
import { BrowserViewSharingState, IBrowserViewWorkbenchService } from "../../common/browserView.js";
import { BrowserChatToolReferenceName } from "../../../../../platform/browserView/common/browserChatToolReferenceNames.js";
import { createBrowserPageLink, findExistingPagesByHost, getExistingPagesResult, getSessionId, remoteUrlRewriteNotice, rewriteRemoteLocalhostUrl } from "./browserToolHelpers.js";
import { IRemoteExplorerService } from "../../../../services/remote/common/remoteExplorerService.js";
const OpenPageToolId = "open_browser_page";
const OpenBrowserToolData = {
  id: OpenPageToolId,
  toolReferenceName: BrowserChatToolReferenceName.OpenBrowserPage,
  displayName: localize("openBrowserTool.displayName", "Open Browser Page"),
  userDescription: localize("openBrowserTool.userDescription", "Open a URL in the integrated browser"),
  modelDescription: `Open a new browser page in the integrated browser at the given URL.
May prompt the user to share a page if there is a similar one already open, unless "forceNew" is true.
Returns a page ID that must be used with other browser tools to interact with the page, as well as an accessibility snapshot of the page.

Important: Prefer to reuse existing pages whenever possible and only call this tool if you do not already have access to a tab you can reuse.`,
  icon: Codicon.openInProduct,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to open in the browser. Must be an absolute URI with a scheme such as file:, http:, or https:. For local files, use the canonical absolute form, for example file:///path/to/file."
      },
      forceNew: {
        type: "boolean",
        description: "Whether to force opening a new page even if a page with the same host already exists. Default is false."
      }
    },
    $comment: 'If you omit "url", the user will be prompted to share an existing page instead. Use this if there are unshared pages that the user may be interested in sharing with you.'
  }
};
const DECLINE_OPTION_ID = "__decline__";
let OpenBrowserTool = class {
  constructor(playwrightService, editorService, browserViewService, remoteExplorerService, agentNetworkFilterService, chatService, configService, logService) {
    this.playwrightService = playwrightService;
    this.editorService = editorService;
    this.browserViewService = browserViewService;
    this.remoteExplorerService = remoteExplorerService;
    this.agentNetworkFilterService = agentNetworkFilterService;
    this.chatService = chatService;
    this.configService = configService;
    this.logService = logService;
  }
  async prepareToolInvocation(context, _token) {
    const params = context.parameters;
    if (!params.url) {
      return {
        invocationMessage: localize("browser.open.prompt.invocation", "Prompting user to share a browser tab"),
        pastTenseMessage: localize("browser.open.prompt.past", "Prompted user to share a browser tab")
      };
    }
    const parsed = URL.parse(params.url);
    if (!parsed) {
      throw new Error("You must provide a complete, valid URL.");
    }
    params.url = parsed.href;
    const uri = URI.parse(params.url);
    if (!this.agentNetworkFilterService.isUriAllowed(uri)) {
      throw new Error(this.agentNetworkFilterService.formatError(uri));
    }
    return {
      invocationMessage: localize("browser.open.invocation", "Opening browser page at {0}", parsed.href),
      pastTenseMessage: localize("browser.open.past", "Opened browser page at {0}", parsed.href),
      confirmationMessages: {
        title: localize("browser.open.confirmTitle", "Open Browser Page?"),
        message: localize("browser.open.confirmMessage", "This will open {0} in the integrated browser. The agent will be able to read and interact with its contents.", parsed.href),
        allowAutoConfirm: true
      }
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const params = invocation.parameters;
    const sessionId = getSessionId(invocation);
    const activeSessionId = invocation.context?.sessionResource.toString();
    if (!params.url) {
      const allPages = [...this.browserViewService.getContextualBrowserViews({ activeSessionId }).values()];
      if (allPages.length === 0) {
        return { content: [{ kind: "text", value: "No browser pages are currently open." }] };
      }
      const shareResult = await this._promptForUnsharedPages(invocation, allPages, params, token);
      if (shareResult) {
        return shareResult;
      } else {
        return { content: [{ kind: "text", value: "The user opted not to share an existing page." }] };
      }
    }
    const rewrite = rewriteRemoteLocalhostUrl(params.url, this.browserViewService, this.remoteExplorerService);
    const rewriteNotice = rewrite.rewritten ? remoteUrlRewriteNotice(params.url, rewrite.url) : void 0;
    params.url = rewrite.url;
    const withNotice = (result) => rewriteNotice ? { ...result, content: [rewriteNotice, ...result.content] } : result;
    if (!params.forceNew) {
      const shared = findExistingPagesByHost(this.browserViewService, params.url, { includeBlank: true, sharingState: BrowserViewSharingState.Shared, activeSessionId });
      const alreadyShared = await getExistingPagesResult(this.editorService, shared, { agentNetworkFilterService: this.agentNetworkFilterService });
      if (alreadyShared) {
        return withNotice(alreadyShared);
      }
      const unshared = findExistingPagesByHost(this.browserViewService, params.url, { includeBlank: false, sharingState: BrowserViewSharingState.NotShared, activeSessionId });
      if (unshared.length > 0) {
        const shareResult = await this._promptForUnsharedPages(invocation, unshared, params, token);
        if (shareResult) {
          return withNotice(shareResult);
        }
      }
    }
    return withNotice(await this._openNewPage(sessionId, params.url));
  }
  /**
   * Shows a carousel prompting the user to share one of the given unshared
   * browser pages instead of opening a new page. Returns `undefined` if the
   * prompt should be skipped or the user chose to open a new page.
   */
  async _promptForUnsharedPages(invocation, candidateEditors, params, token) {
    const chatSessionResource = invocation.context?.sessionResource;
    const chatRequestId = invocation.chatRequestId;
    const request = this._getRequest(chatSessionResource, chatRequestId);
    if (!request) {
      return void 0;
    }
    if (request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot || this.configService.getValue(ChatConfiguration.AutoReply)) {
      return void 0;
    }
    const carousel = this._buildShareCarousel(candidateEditors, params.url, invocation.chatStreamToolCallId ?? invocation.callId);
    this.chatService.appendProgress(request, carousel);
    const externalAnswerListener = this.chatService.onDidReceiveQuestionCarouselAnswer((event) => {
      if (event.resolveId !== carousel.resolveId || carousel.isUsed) {
        return;
      }
      carousel.dismiss(event.answers);
    });
    let answerResult;
    try {
      answerResult = await raceCancellation(carousel.completion.p, token);
    } catch (error) {
      if (error instanceof CancellationError) {
        carousel.dismiss(void 0);
      }
      throw error;
    } finally {
      externalAnswerListener.dispose();
    }
    if (!answerResult || token.isCancellationRequested) {
      carousel.dismiss(void 0);
      throw new CancellationError();
    }
    const selectedOptionId = this._extractSelectedOption(answerResult.answers);
    if (!selectedOptionId || selectedOptionId === DECLINE_OPTION_ID) {
      return void 0;
    }
    const editor = candidateEditors.find((e) => e.id === selectedOptionId);
    if (!editor) {
      this.logService.warn(`[OpenBrowserTool] Selected option '${selectedOptionId}' not found.`);
      return void 0;
    }
    return this._shareExistingPage(getSessionId(invocation), editor);
  }
  _buildShareCarousel(editors, url, resolveId) {
    const options = [];
    for (const editor of editors) {
      const editorTitle = (editor.title || editor.getName()).replaceAll(" - ", "\xA0-\xA0");
      const editorUrl = editor.url || "about:blank";
      const truncatedUrl = editorUrl.length > 40 ? editorUrl.substring(0, 40) + "\u2026" : editorUrl;
      options.push({
        id: editor.id,
        label: localize(
          { key: "browser.open.shareExistingOption", comment: ['{Locked=" - "}', "{0} is the editor title", "{1} is the truncated URL"] },
          'Yes, share "{0}" - {1}',
          editorTitle,
          truncatedUrl
        ),
        value: editor.id
      });
    }
    options.push({
      id: DECLINE_OPTION_ID,
      label: url ? localize("browser.open.newPageOption", "No, open a new page at {0}", url) : localize({ key: "browser.open.noPagesOption", comment: ['{Locked=" - "}'] }, "No - Do not share any tabs with the agent"),
      value: DECLINE_OPTION_ID
    });
    const question = {
      id: `${resolveId}:0`,
      type: "singleSelect",
      title: localize("browser.open.shareQuestion.title", "Share Browser Tab"),
      message: localize("browser.open.shareQuestion.message", "Share an existing browser tab?"),
      options,
      defaultValue: DECLINE_OPTION_ID,
      allowFreeformInput: false
    };
    return new ChatQuestionCarouselData([question], true, resolveId);
  }
  _extractSelectedOption(answers) {
    if (!answers) {
      return void 0;
    }
    for (const answer of Object.values(answers)) {
      if (typeof answer === "string") {
        return answer;
      }
      if (typeof answer === "object" && answer !== null && hasKey(answer, { selectedValue: true })) {
        return answer.selectedValue;
      }
    }
    return void 0;
  }
  async _openNewPage(sessionId, url) {
    const { pageId, summary } = await this.playwrightService.openPage(sessionId, url);
    return this._pageResult(pageId, summary, localize("browser.open.result", "Opened {0}", createBrowserPageLink(pageId)));
  }
  async _shareExistingPage(sessionId, editor) {
    const model = await editor.resolve();
    if (model.sharingState !== BrowserViewSharingState.Shared) {
      if (!await model.setSharedWithAgent(true)) {
        return { content: [{ kind: "text", value: "The user declined to share the page." }] };
      }
    }
    const summary = await this.playwrightService.getSummary(sessionId, editor.id);
    return this._pageResult(editor.id, summary, localize("browser.open.sharedResult", "User shared {0}", createBrowserPageLink(editor.id)));
  }
  _pageResult(pageId, summary, resultMessage) {
    return {
      content: [
        { kind: "text", value: `Page ID: ${pageId}

Summary:
` },
        { kind: "text", value: summary }
      ],
      toolResultMessage: new MarkdownString(resultMessage)
    };
  }
  _getRequest(chatSessionResource, chatRequestId) {
    if (!chatSessionResource) {
      return void 0;
    }
    const model = this.chatService.getSession(chatSessionResource);
    if (!model) {
      return void 0;
    }
    if (chatRequestId) {
      const request = model.getRequests().find((r) => r.id === chatRequestId);
      if (request) {
        return request;
      }
    }
    return model.getRequests().at(-1);
  }
};
OpenBrowserTool = __decorateClass([
  __decorateParam(0, IPlaywrightService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IBrowserViewWorkbenchService),
  __decorateParam(3, IRemoteExplorerService),
  __decorateParam(4, IAgentNetworkFilterService),
  __decorateParam(5, IChatService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILogService)
], OpenBrowserTool);
export {
  OpenBrowserTool,
  OpenBrowserToolData,
  OpenPageToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xcb3BlbkJyb3dzZXJUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB0eXBlIHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElQbGF5d3JpZ2h0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9wbGF5d3JpZ2h0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9uZXR3b3JrRmlsdGVyL2NvbW1vbi9uZXR3b3JrRmlsdGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFF1ZXN0aW9uLCBJQ2hhdFF1ZXN0aW9uQW5zd2VycywgSUNoYXRTZXJ2aWNlLCBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlciB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRRdWVzdGlvbkNhcm91c2VsRGF0YS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSwgdHlwZSBDb3VudFRva2Vuc0NhbGxiYWNrLCB0eXBlIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sRGF0YSwgdHlwZSBJVG9vbEltcGwsIHR5cGUgSVRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdHlwZSBJVG9vbFJlc3VsdCwgdHlwZSBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLCBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQnJvd3NlckNoYXRUb29sUmVmZXJlbmNlTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVCcm93c2VyUGFnZUxpbmssIGZpbmRFeGlzdGluZ1BhZ2VzQnlIb3N0LCBnZXRFeGlzdGluZ1BhZ2VzUmVzdWx0LCBnZXRTZXNzaW9uSWQsIHJlbW90ZVVybFJld3JpdGVOb3RpY2UsIHJld3JpdGVSZW1vdGVMb2NhbGhvc3RVcmwgfSBmcm9tICcuL2Jyb3dzZXJUb29sSGVscGVycy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVFeHBsb3JlclNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgT3BlblBhZ2VUb29sSWQgPSAnb3Blbl9icm93c2VyX3BhZ2UnO1xuXG5leHBvcnQgY29uc3QgT3BlbkJyb3dzZXJUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogT3BlblBhZ2VUb29sSWQsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lLk9wZW5Ccm93c2VyUGFnZSxcblx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdvcGVuQnJvd3NlclRvb2wuZGlzcGxheU5hbWUnLCAnT3BlbiBCcm93c2VyIFBhZ2UnKSxcblx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnb3BlbkJyb3dzZXJUb29sLnVzZXJEZXNjcmlwdGlvbicsICdPcGVuIGEgVVJMIGluIHRoZSBpbnRlZ3JhdGVkIGJyb3dzZXInKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogYE9wZW4gYSBuZXcgYnJvd3NlciBwYWdlIGluIHRoZSBpbnRlZ3JhdGVkIGJyb3dzZXIgYXQgdGhlIGdpdmVuIFVSTC5cbk1heSBwcm9tcHQgdGhlIHVzZXIgdG8gc2hhcmUgYSBwYWdlIGlmIHRoZXJlIGlzIGEgc2ltaWxhciBvbmUgYWxyZWFkeSBvcGVuLCB1bmxlc3MgXCJmb3JjZU5ld1wiIGlzIHRydWUuXG5SZXR1cm5zIGEgcGFnZSBJRCB0aGF0IG11c3QgYmUgdXNlZCB3aXRoIG90aGVyIGJyb3dzZXIgdG9vbHMgdG8gaW50ZXJhY3Qgd2l0aCB0aGUgcGFnZSwgYXMgd2VsbCBhcyBhbiBhY2Nlc3NpYmlsaXR5IHNuYXBzaG90IG9mIHRoZSBwYWdlLlxuXG5JbXBvcnRhbnQ6IFByZWZlciB0byByZXVzZSBleGlzdGluZyBwYWdlcyB3aGVuZXZlciBwb3NzaWJsZSBhbmQgb25seSBjYWxsIHRoaXMgdG9vbCBpZiB5b3UgZG8gbm90IGFscmVhZHkgaGF2ZSBhY2Nlc3MgdG8gYSB0YWIgeW91IGNhbiByZXVzZS5gLFxuXHRpY29uOiBDb2RpY29uLm9wZW5JblByb2R1Y3QsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGlucHV0U2NoZW1hOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0dXJsOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBVUkwgdG8gb3BlbiBpbiB0aGUgYnJvd3Nlci4gTXVzdCBiZSBhbiBhYnNvbHV0ZSBVUkkgd2l0aCBhIHNjaGVtZSBzdWNoIGFzIGZpbGU6LCBodHRwOiwgb3IgaHR0cHM6LiBGb3IgbG9jYWwgZmlsZXMsIHVzZSB0aGUgY2Fub25pY2FsIGFic29sdXRlIGZvcm0sIGZvciBleGFtcGxlIGZpbGU6Ly8vcGF0aC90by9maWxlLidcblx0XHRcdH0sXG5cdFx0XHRmb3JjZU5ldzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV2hldGhlciB0byBmb3JjZSBvcGVuaW5nIGEgbmV3IHBhZ2UgZXZlbiBpZiBhIHBhZ2Ugd2l0aCB0aGUgc2FtZSBob3N0IGFscmVhZHkgZXhpc3RzLiBEZWZhdWx0IGlzIGZhbHNlLidcblx0XHRcdH1cblx0XHR9LFxuXHRcdCRjb21tZW50OiAnSWYgeW91IG9taXQgXCJ1cmxcIiwgdGhlIHVzZXIgd2lsbCBiZSBwcm9tcHRlZCB0byBzaGFyZSBhbiBleGlzdGluZyBwYWdlIGluc3RlYWQuIFVzZSB0aGlzIGlmIHRoZXJlIGFyZSB1bnNoYXJlZCBwYWdlcyB0aGF0IHRoZSB1c2VyIG1heSBiZSBpbnRlcmVzdGVkIGluIHNoYXJpbmcgd2l0aCB5b3UuJ1xuXHR9LFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJT3BlbkJyb3dzZXJUb29sUGFyYW1zIHtcblx0dXJsPzogc3RyaW5nO1xuXHRmb3JjZU5ldz86IGJvb2xlYW47XG59XG5cbmNvbnN0IERFQ0xJTkVfT1BUSU9OX0lEID0gJ19fZGVjbGluZV9fJztcblxuZXhwb3J0IGNsYXNzIE9wZW5Ccm93c2VyVG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUGxheXdyaWdodFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbGF5d3JpZ2h0U2VydmljZTogSVBsYXl3cmlnaHRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlclZpZXdTZXJ2aWNlOiBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2U6IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwYXJhbXMgPSBjb250ZXh0LnBhcmFtZXRlcnMgYXMgSU9wZW5Ccm93c2VyVG9vbFBhcmFtcztcblxuXHRcdGlmICghcGFyYW1zLnVybCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdicm93c2VyLm9wZW4ucHJvbXB0Lmludm9jYXRpb24nLCBcIlByb21wdGluZyB1c2VyIHRvIHNoYXJlIGEgYnJvd3NlciB0YWJcIiksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCdicm93c2VyLm9wZW4ucHJvbXB0LnBhc3QnLCBcIlByb21wdGVkIHVzZXIgdG8gc2hhcmUgYSBicm93c2VyIHRhYlwiKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VkID0gVVJMLnBhcnNlKHBhcmFtcy51cmwpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IHByb3ZpZGUgYSBjb21wbGV0ZSwgdmFsaWQgVVJMLicpO1xuXHRcdH1cblxuXHRcdHBhcmFtcy51cmwgPSBwYXJzZWQuaHJlZjsgLy8gRW5zdXJlIFVSTCBpcyBpbiBhIG5vcm1hbGl6ZWQgZm9ybWF0XG5cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UocGFyYW1zLnVybCk7XG5cdFx0aWYgKCF0aGlzLmFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UuaXNVcmlBbGxvd2VkKHVyaSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLmFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UuZm9ybWF0RXJyb3IodXJpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnYnJvd3Nlci5vcGVuLmludm9jYXRpb24nLCBcIk9wZW5pbmcgYnJvd3NlciBwYWdlIGF0IHswfVwiLCBwYXJzZWQuaHJlZiksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgnYnJvd3Nlci5vcGVuLnBhc3QnLCBcIk9wZW5lZCBicm93c2VyIHBhZ2UgYXQgezB9XCIsIHBhcnNlZC5ocmVmKSxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYnJvd3Nlci5vcGVuLmNvbmZpcm1UaXRsZScsICdPcGVuIEJyb3dzZXIgUGFnZT8nKSxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Jyb3dzZXIub3Blbi5jb25maXJtTWVzc2FnZScsICdUaGlzIHdpbGwgb3BlbiB7MH0gaW4gdGhlIGludGVncmF0ZWQgYnJvd3Nlci4gVGhlIGFnZW50IHdpbGwgYmUgYWJsZSB0byByZWFkIGFuZCBpbnRlcmFjdCB3aXRoIGl0cyBjb250ZW50cy4nLCBwYXJzZWQuaHJlZiksXG5cdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IHRydWUsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgcGFyYW1zID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElPcGVuQnJvd3NlclRvb2xQYXJhbXM7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gZ2V0U2Vzc2lvbklkKGludm9jYXRpb24pO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25JZCA9IGludm9jYXRpb24uY29udGV4dD8uc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cblx0XHQvLyBJZiBubyBVUkwgaXMgc3BlY2lmaWVkLCBwcm9tcHQgdGhlIHVzZXIgZm9yIGEgcGFnZSB0byBzaGFyZS5cblx0XHRpZiAoIXBhcmFtcy51cmwpIHtcblx0XHRcdGNvbnN0IGFsbFBhZ2VzID0gWy4uLnRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmdldENvbnRleHR1YWxCcm93c2VyVmlld3MoeyBhY3RpdmVTZXNzaW9uSWQgfSkudmFsdWVzKCldO1xuXHRcdFx0aWYgKGFsbFBhZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnTm8gYnJvd3NlciBwYWdlcyBhcmUgY3VycmVudGx5IG9wZW4uJyB9XSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzaGFyZVJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb21wdEZvclVuc2hhcmVkUGFnZXMoaW52b2NhdGlvbiwgYWxsUGFnZXMsIHBhcmFtcywgdG9rZW4pO1xuXHRcdFx0aWYgKHNoYXJlUmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiBzaGFyZVJlc3VsdDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdUaGUgdXNlciBvcHRlZCBub3QgdG8gc2hhcmUgYW4gZXhpc3RpbmcgcGFnZS4nIH1dIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSW4gYSByZW1vdGUgd29ya3NwYWNlIHdpdGhvdXQgdGhlIHJlbW90ZSBwcm94eSwgdGhlIGludGVncmF0ZWQgYnJvd3NlclxuXHRcdC8vIHJ1bnMgbG9jYWxseSBhbmQgY2Fubm90IHJlYWNoIHRoZSByZW1vdGUncyBsb2NhbGhvc3QgZGlyZWN0bHkuIFJld3JpdGUgdG9cblx0XHQvLyB0aGUgZm9yd2FyZGVkIGxvY2FsIGFkZHJlc3MgKGlmIGFueSkgc28gdGhlIHBhZ2UgY2FuIGJlIHJlYWNoZWQuXG5cdFx0Y29uc3QgcmV3cml0ZSA9IHJld3JpdGVSZW1vdGVMb2NhbGhvc3RVcmwocGFyYW1zLnVybCwgdGhpcy5icm93c2VyVmlld1NlcnZpY2UsIHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlKTtcblx0XHRjb25zdCByZXdyaXRlTm90aWNlID0gcmV3cml0ZS5yZXdyaXR0ZW4gPyByZW1vdGVVcmxSZXdyaXRlTm90aWNlKHBhcmFtcy51cmwsIHJld3JpdGUudXJsKSA6IHVuZGVmaW5lZDtcblx0XHRwYXJhbXMudXJsID0gcmV3cml0ZS51cmw7XG5cblx0XHRjb25zdCB3aXRoTm90aWNlID0gKHJlc3VsdDogSVRvb2xSZXN1bHQpOiBJVG9vbFJlc3VsdCA9PlxuXHRcdFx0cmV3cml0ZU5vdGljZSA/IHsgLi4ucmVzdWx0LCBjb250ZW50OiBbcmV3cml0ZU5vdGljZSwgLi4ucmVzdWx0LmNvbnRlbnRdIH0gOiByZXN1bHQ7XG5cblx0XHRpZiAoIXBhcmFtcy5mb3JjZU5ldykge1xuXHRcdFx0Ly8gSWYgdGhlcmUgYXJlIGFscmVhZHktc2hhcmVkIHBhZ2VzLCB0ZWxsIHRoZSBtb2RlbCB0byByZXVzZSB0aGVtXG5cdFx0XHRjb25zdCBzaGFyZWQgPSBmaW5kRXhpc3RpbmdQYWdlc0J5SG9zdCh0aGlzLmJyb3dzZXJWaWV3U2VydmljZSwgcGFyYW1zLnVybCwgeyBpbmNsdWRlQmxhbms6IHRydWUsIHNoYXJpbmdTdGF0ZTogQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuU2hhcmVkLCBhY3RpdmVTZXNzaW9uSWQgfSk7XG5cdFx0XHRjb25zdCBhbHJlYWR5U2hhcmVkID0gYXdhaXQgZ2V0RXhpc3RpbmdQYWdlc1Jlc3VsdCh0aGlzLmVkaXRvclNlcnZpY2UsIHNoYXJlZCwgeyBhZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlOiB0aGlzLmFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgfSk7XG5cdFx0XHRpZiAoYWxyZWFkeVNoYXJlZCkge1xuXHRcdFx0XHRyZXR1cm4gd2l0aE5vdGljZShhbHJlYWR5U2hhcmVkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgdGhlcmUgYXJlIHVuc2hhcmVkIChidXQgc2hhcmVhYmxlKSBwYWdlcyBvbiB0aGUgc2FtZSBob3N0LCBwcm9tcHQgdXNlciB0byBzaGFyZSBvbmVcblx0XHRcdGNvbnN0IHVuc2hhcmVkID0gZmluZEV4aXN0aW5nUGFnZXNCeUhvc3QodGhpcy5icm93c2VyVmlld1NlcnZpY2UsIHBhcmFtcy51cmwsIHsgaW5jbHVkZUJsYW5rOiBmYWxzZSwgc2hhcmluZ1N0YXRlOiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5Ob3RTaGFyZWQsIGFjdGl2ZVNlc3Npb25JZCB9KTtcblx0XHRcdGlmICh1bnNoYXJlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHNoYXJlUmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJvbXB0Rm9yVW5zaGFyZWRQYWdlcyhpbnZvY2F0aW9uLCB1bnNoYXJlZCwgcGFyYW1zLCB0b2tlbik7XG5cdFx0XHRcdGlmIChzaGFyZVJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiB3aXRoTm90aWNlKHNoYXJlUmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB3aXRoTm90aWNlKGF3YWl0IHRoaXMuX29wZW5OZXdQYWdlKHNlc3Npb25JZCwgcGFyYW1zLnVybCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIGEgY2Fyb3VzZWwgcHJvbXB0aW5nIHRoZSB1c2VyIHRvIHNoYXJlIG9uZSBvZiB0aGUgZ2l2ZW4gdW5zaGFyZWRcblx0ICogYnJvd3NlciBwYWdlcyBpbnN0ZWFkIG9mIG9wZW5pbmcgYSBuZXcgcGFnZS4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiB0aGVcblx0ICogcHJvbXB0IHNob3VsZCBiZSBza2lwcGVkIG9yIHRoZSB1c2VyIGNob3NlIHRvIG9wZW4gYSBuZXcgcGFnZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Byb21wdEZvclVuc2hhcmVkUGFnZXMoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBjYW5kaWRhdGVFZGl0b3JzOiBCcm93c2VyRWRpdG9ySW5wdXRbXSwgcGFyYW1zOiBJT3BlbkJyb3dzZXJUb29sUGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBjaGF0U2Vzc2lvblJlc291cmNlID0gaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgY2hhdFJlcXVlc3RJZCA9IGludm9jYXRpb24uY2hhdFJlcXVlc3RJZDtcblx0XHRjb25zdCByZXF1ZXN0ID0gdGhpcy5fZ2V0UmVxdWVzdChjaGF0U2Vzc2lvblJlc291cmNlLCBjaGF0UmVxdWVzdElkKTtcblxuXHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gTm8gY2hhdCBjb250ZXh0IFx1MjAxNCBza2lwIHByb21wdCwgcHJvY2VlZCB0byBvcGVuXG5cdFx0fVxuXG5cdFx0Ly8gSW4gYXV0b3BpbG90L2F1dG8tcmVwbHksIGRvbid0IGJsb2NrIFx1MjAxNCBqdXN0IG9wZW4gdGhlIG5ldyBwYWdlXG5cdFx0aWYgKHJlcXVlc3QubW9kZUluZm8/LnBlcm1pc3Npb25MZXZlbCA9PT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QgfHwgdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkF1dG9SZXBseSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSB0aGlzLl9idWlsZFNoYXJlQ2Fyb3VzZWwoY2FuZGlkYXRlRWRpdG9ycywgcGFyYW1zLnVybCwgaW52b2NhdGlvbi5jaGF0U3RyZWFtVG9vbENhbGxJZCA/PyBpbnZvY2F0aW9uLmNhbGxJZCk7XG5cdFx0dGhpcy5jaGF0U2VydmljZS5hcHBlbmRQcm9ncmVzcyhyZXF1ZXN0LCBjYXJvdXNlbCk7XG5cblx0XHRjb25zdCBleHRlcm5hbEFuc3dlckxpc3RlbmVyID0gdGhpcy5jaGF0U2VydmljZS5vbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5yZXNvbHZlSWQgIT09IGNhcm91c2VsLnJlc29sdmVJZCB8fCBjYXJvdXNlbC5pc1VzZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y2Fyb3VzZWwuZGlzbWlzcyhldmVudC5hbnN3ZXJzKTtcblx0XHR9KTtcblxuXHRcdGxldCBhbnN3ZXJSZXN1bHQ6IHsgYW5zd2VyczogSUNoYXRRdWVzdGlvbkFuc3dlcnMgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YW5zd2VyUmVzdWx0ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbihjYXJvdXNlbC5jb21wbGV0aW9uLnAsIHRva2VuKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0Y2Fyb3VzZWwuZGlzbWlzcyh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGV4dGVybmFsQW5zd2VyTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGlmICghYW5zd2VyUmVzdWx0IHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRjYXJvdXNlbC5kaXNtaXNzKHVuZGVmaW5lZCk7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHQvLyBFeHRyYWN0IHRoZSBzZWxlY3RlZCBvcHRpb25cblx0XHRjb25zdCBzZWxlY3RlZE9wdGlvbklkID0gdGhpcy5fZXh0cmFjdFNlbGVjdGVkT3B0aW9uKGFuc3dlclJlc3VsdC5hbnN3ZXJzKTtcblxuXHRcdC8vIFVzZXIgc2tpcHBlZC9jYW5jZWxsZWQgb3IgY2hvc2UgXCJPcGVuIG5ldyBwYWdlXCIgXHUyMDE0IGZhbGwgdGhyb3VnaCB0byBvcGVuXG5cdFx0aWYgKCFzZWxlY3RlZE9wdGlvbklkIHx8IHNlbGVjdGVkT3B0aW9uSWQgPT09IERFQ0xJTkVfT1BUSU9OX0lEKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFVzZXIgc2VsZWN0ZWQgYW4gZXhpc3RpbmcgdGFiXG5cdFx0Y29uc3QgZWRpdG9yID0gY2FuZGlkYXRlRWRpdG9ycy5maW5kKGUgPT4gZS5pZCA9PT0gc2VsZWN0ZWRPcHRpb25JZCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbT3BlbkJyb3dzZXJUb29sXSBTZWxlY3RlZCBvcHRpb24gJyR7c2VsZWN0ZWRPcHRpb25JZH0nIG5vdCBmb3VuZC5gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3NoYXJlRXhpc3RpbmdQYWdlKGdldFNlc3Npb25JZChpbnZvY2F0aW9uKSwgZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkU2hhcmVDYXJvdXNlbChlZGl0b3JzOiBCcm93c2VyRWRpdG9ySW5wdXRbXSwgdXJsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlc29sdmVJZDogc3RyaW5nKTogQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIHtcblx0XHRjb25zdCBvcHRpb25zOiBJQ2hhdFF1ZXN0aW9uWydvcHRpb25zJ10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGVkaXRvclRpdGxlID0gKGVkaXRvci50aXRsZSB8fCBlZGl0b3IuZ2V0TmFtZSgpKS5yZXBsYWNlQWxsKCcgLSAnLCAnXFx1MDBBMC1cXHUwMEEwJyk7IC8vIG5ic3AgYXJvdW5kIGh5cGhlbnMgdG8gcHJldmVudCBmb3JtYXR0aW5nIGluIHRoZSBjYXJvdXNlbFxuXHRcdFx0Y29uc3QgZWRpdG9yVXJsID0gZWRpdG9yLnVybCB8fCAnYWJvdXQ6YmxhbmsnO1xuXHRcdFx0Y29uc3QgdHJ1bmNhdGVkVXJsID0gZWRpdG9yVXJsLmxlbmd0aCA+IDQwID8gZWRpdG9yVXJsLnN1YnN0cmluZygwLCA0MCkgKyAnXFx1MjAyNicgOiBlZGl0b3JVcmw7XG5cdFx0XHRvcHRpb25zLnB1c2goe1xuXHRcdFx0XHRpZDogZWRpdG9yLmlkLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdicm93c2VyLm9wZW4uc2hhcmVFeGlzdGluZ09wdGlvbicsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIiAtIFwifScsICd7MH0gaXMgdGhlIGVkaXRvciB0aXRsZScsICd7MX0gaXMgdGhlIHRydW5jYXRlZCBVUkwnXSB9LFxuXHRcdFx0XHRcdCdZZXMsIHNoYXJlIFwiezB9XCIgLSB7MX0nLFxuXHRcdFx0XHRcdGVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHRydW5jYXRlZFVybCxcblx0XHRcdFx0KSxcblx0XHRcdFx0dmFsdWU6IGVkaXRvci5pZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIERlZmF1bHQgb3B0aW9uOiBkZWNsaW5lIHNoYXJpbmdcblx0XHRvcHRpb25zLnB1c2goe1xuXHRcdFx0aWQ6IERFQ0xJTkVfT1BUSU9OX0lELFxuXHRcdFx0bGFiZWw6IHVybFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLm9wZW4ubmV3UGFnZU9wdGlvbicsIFwiTm8sIG9wZW4gYSBuZXcgcGFnZSBhdCB7MH1cIiwgdXJsKVxuXHRcdFx0XHQ6IGxvY2FsaXplKHsga2V5OiAnYnJvd3Nlci5vcGVuLm5vUGFnZXNPcHRpb24nLCBjb21tZW50OiBbJ3tMb2NrZWQ9XCIgLSBcIn0nXSB9LCBcIk5vIC0gRG8gbm90IHNoYXJlIGFueSB0YWJzIHdpdGggdGhlIGFnZW50XCIpLFxuXHRcdFx0dmFsdWU6IERFQ0xJTkVfT1BUSU9OX0lELFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcXVlc3Rpb246IElDaGF0UXVlc3Rpb24gPSB7XG5cdFx0XHRpZDogYCR7cmVzb2x2ZUlkfTowYCxcblx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdicm93c2VyLm9wZW4uc2hhcmVRdWVzdGlvbi50aXRsZScsIFwiU2hhcmUgQnJvd3NlciBUYWJcIiksXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnYnJvd3Nlci5vcGVuLnNoYXJlUXVlc3Rpb24ubWVzc2FnZScsIFwiU2hhcmUgYW4gZXhpc3RpbmcgYnJvd3NlciB0YWI/XCIpLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdGRlZmF1bHRWYWx1ZTogREVDTElORV9PUFRJT05fSUQsXG5cdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlLFxuXHRcdH07XG5cblx0XHRyZXR1cm4gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShbcXVlc3Rpb25dLCB0cnVlLCByZXNvbHZlSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXh0cmFjdFNlbGVjdGVkT3B0aW9uKGFuc3dlcnM6IElDaGF0UXVlc3Rpb25BbnN3ZXJzIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWFuc3dlcnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBhbnN3ZXIgb2YgT2JqZWN0LnZhbHVlcyhhbnN3ZXJzKSkge1xuXHRcdFx0aWYgKHR5cGVvZiBhbnN3ZXIgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybiBhbnN3ZXI7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGFuc3dlciA9PT0gJ29iamVjdCcgJiYgYW5zd2VyICE9PSBudWxsICYmIGhhc0tleShhbnN3ZXIsIHsgc2VsZWN0ZWRWYWx1ZTogdHJ1ZSB9KSkge1xuXHRcdFx0XHRyZXR1cm4gKGFuc3dlciBhcyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlcikuc2VsZWN0ZWRWYWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3Blbk5ld1BhZ2Uoc2Vzc2lvbklkOiBzdHJpbmcsIHVybDogc3RyaW5nKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHsgcGFnZUlkLCBzdW1tYXJ5IH0gPSBhd2FpdCB0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLm9wZW5QYWdlKHNlc3Npb25JZCwgdXJsKTtcblx0XHRyZXR1cm4gdGhpcy5fcGFnZVJlc3VsdChwYWdlSWQsIHN1bW1hcnksIGxvY2FsaXplKCdicm93c2VyLm9wZW4ucmVzdWx0JywgXCJPcGVuZWQgezB9XCIsIGNyZWF0ZUJyb3dzZXJQYWdlTGluayhwYWdlSWQpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaGFyZUV4aXN0aW5nUGFnZShzZXNzaW9uSWQ6IHN0cmluZywgZWRpdG9yOiBCcm93c2VyRWRpdG9ySW5wdXQpOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCBlZGl0b3IucmVzb2x2ZSgpO1xuXHRcdGlmIChtb2RlbC5zaGFyaW5nU3RhdGUgIT09IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlNoYXJlZCkge1xuXHRcdFx0aWYgKCEoYXdhaXQgbW9kZWwuc2V0U2hhcmVkV2l0aEFnZW50KHRydWUpKSkge1xuXHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnVGhlIHVzZXIgZGVjbGluZWQgdG8gc2hhcmUgdGhlIHBhZ2UuJyB9XSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLmdldFN1bW1hcnkoc2Vzc2lvbklkLCBlZGl0b3IuaWQpO1xuXHRcdHJldHVybiB0aGlzLl9wYWdlUmVzdWx0KGVkaXRvci5pZCwgc3VtbWFyeSwgbG9jYWxpemUoJ2Jyb3dzZXIub3Blbi5zaGFyZWRSZXN1bHQnLCBcIlVzZXIgc2hhcmVkIHswfVwiLCBjcmVhdGVCcm93c2VyUGFnZUxpbmsoZWRpdG9yLmlkKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFnZVJlc3VsdChwYWdlSWQ6IHN0cmluZywgc3VtbWFyeTogc3RyaW5nLCByZXN1bHRNZXNzYWdlOiBzdHJpbmcpOiBJVG9vbFJlc3VsdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0eyBraW5kOiAndGV4dCcsIHZhbHVlOiBgUGFnZSBJRDogJHtwYWdlSWR9XFxuXFxuU3VtbWFyeTpcXG5gIH0sXG5cdFx0XHRcdHsga2luZDogJ3RleHQnLCB2YWx1ZTogc3VtbWFyeSB9LFxuXHRcdFx0XSxcblx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcocmVzdWx0TWVzc2FnZSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlcXVlc3QoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjaGF0UmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYXRSZXF1ZXN0SWQpIHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5nZXRSZXF1ZXN0cygpLmZpbmQociA9PiByLmlkID09PSBjaGF0UmVxdWVzdElkKTtcblx0XHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdHJldHVybiByZXF1ZXN0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbC5nZXRSZXF1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
