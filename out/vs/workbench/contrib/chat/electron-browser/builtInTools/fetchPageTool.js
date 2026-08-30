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
import { assertNever } from "../../../../../base/common/assert.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { extname } from "../../../../../base/common/path.js";
import { normalizePath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IWebContentExtractorService } from "../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { detectEncodingFromBuffer } from "../../../../services/textfile/common/encoding.js";
import { ITrustedDomainService } from "../../../url/browser/trustedDomainService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatImageMimeType } from "../../common/languageModels.js";
import { ToolDataSource } from "../../common/tools/languageModelToolsService.js";
import { InternalFetchWebPageToolId } from "../../common/tools/builtinTools/tools.js";
import { IAgentNetworkFilterService } from "../../../../../platform/networkFilter/common/networkFilterService.js";
import { WorkingDirectory } from "../../common/workingDirectory.js";
const FetchWebPageToolData = {
  id: InternalFetchWebPageToolId,
  displayName: "Fetch Web Page",
  canBeReferencedInPrompt: false,
  modelDescription: "Fetches the main content from a web page. This tool is useful for summarizing or analyzing the content of a webpage.",
  source: ToolDataSource.Internal,
  canRequestPostApproval: true,
  canRequestPreApproval: true,
  inputSchema: {
    type: "object",
    properties: {
      urls: {
        type: "array",
        items: {
          type: "string"
        },
        description: localize("fetchWebPage.urlsDescription", "An array of URLs to fetch content from.")
      }
    },
    required: ["urls"]
  }
};
let FetchWebPageTool = class {
  constructor(_readerModeService, _fileService, _trustedDomainService, _chatService, _workspaceContextService, _agentNetworkFilterService) {
    this._readerModeService = _readerModeService;
    this._fileService = _fileService;
    this._trustedDomainService = _trustedDomainService;
    this._chatService = _chatService;
    this._workspaceContextService = _workspaceContextService;
    this._agentNetworkFilterService = _agentNetworkFilterService;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const urls = invocation.parameters.urls || [];
    const { webUris, fileUris, invalidUris, blockedUris } = this._parseUris(urls);
    const allValidUris = [...webUris.values(), ...fileUris.values()];
    if (!allValidUris.length && invalidUris.size === 0 && blockedUris.size === 0) {
      return {
        content: [{ kind: "text", value: localize("fetchWebPage.noValidUrls", "No valid URLs provided.") }]
      };
    }
    let webContents = [];
    if (webUris.size > 0) {
      const trustedDomains = this._trustedDomainService.trustedDomains;
      webContents = await this._readerModeService.extract([...webUris.values()], { trustedDomains });
    }
    const fileContents = [];
    const successfulFileUris = [];
    for (const uri of fileUris.values()) {
      try {
        const fileContent = await this._fileService.readFile(uri, void 0, token);
        const imageMimeType = this._getSupportedImageMimeType(uri);
        if (imageMimeType) {
          fileContents.push({
            type: "tooldata",
            value: {
              kind: "data",
              value: {
                mimeType: imageMimeType,
                data: fileContent.value
              }
            }
          });
        } else {
          const detected = detectEncodingFromBuffer({ buffer: fileContent.value, bytesRead: fileContent.value.byteLength });
          if (detected.seemsBinary) {
            fileContents.push(localize("fetchWebPage.binaryNotSupported", "Binary files are not supported at the moment."));
          } else {
            fileContents.push(fileContent.value.toString());
          }
        }
        successfulFileUris.push(uri);
      } catch (error) {
        fileContents.push(void 0);
      }
    }
    const results = [];
    let webIndex = 0;
    let fileIndex = 0;
    for (const url of urls) {
      if (blockedUris.has(url)) {
        results.push(this._agentNetworkFilterService.formatError(URI.parse(url)));
      } else if (invalidUris.has(url)) {
        results.push(void 0);
      } else if (webUris.has(url)) {
        results.push({ type: "extracted", value: webContents[webIndex] });
        webIndex++;
      } else if (fileUris.has(url)) {
        results.push(fileContents[fileIndex]);
        fileIndex++;
      } else {
        results.push(void 0);
      }
    }
    let confirmResults;
    if (webContents.every((e) => e.status === "error" || e.status === "redirect")) {
      confirmResults = false;
    }
    const actuallyValidUris = [...webUris.values(), ...successfulFileUris];
    return {
      content: this._getPromptPartsForResults(urls, results),
      toolResultDetails: actuallyValidUris,
      confirmResults
    };
  }
  async prepareToolInvocation(context, token) {
    const { webUris, fileUris, invalidUris, blockedUris } = this._parseUris(context.parameters.urls);
    const validFileUris = [];
    const additionalInvalidUrls = [];
    for (const [originalUrl, uri] of fileUris.entries()) {
      try {
        await this._fileService.stat(uri);
        validFileUris.push(uri);
      } catch (error) {
        additionalInvalidUrls.push(originalUrl);
      }
    }
    const invalid = [...Array.from(invalidUris), ...additionalInvalidUrls, ...Array.from(blockedUris)];
    const allFetchedUris = new ResourceSet([...webUris.values(), ...validFileUris]);
    const workingDir = new WorkingDirectory(this._workspaceContextService, context.workingDirectory);
    const fileUrisOutsideWorkspace = validFileUris.filter((uri) => !workingDir.getFolder(uri));
    const urlsNeedingConfirmation = new ResourceSet([...webUris.values(), ...fileUrisOutsideWorkspace]);
    const pastTenseMessage = invalid.length ? invalid.length > 1 ? new MarkdownString(
      localize(
        "fetchWebPage.pastTenseMessage.plural",
        "Fetched {0} resources, but the following were invalid URLs:\n\n{1}\n\n",
        allFetchedUris.size,
        invalid.map((url) => `- ${url}`).join("\n")
      )
    ) : new MarkdownString(
      localize(
        "fetchWebPage.pastTenseMessage.singular",
        "Fetched resource, but the following was an invalid URL:\n\n{0}\n\n",
        invalid[0]
      )
    ) : new MarkdownString();
    const invocationMessage = new MarkdownString();
    if (allFetchedUris.size > 1) {
      pastTenseMessage.appendMarkdown(localize("fetchWebPage.pastTenseMessageResult.plural", "Fetched {0} resources", allFetchedUris.size));
      invocationMessage.appendMarkdown(localize("fetchWebPage.invocationMessage.plural", "Fetching {0} resources", allFetchedUris.size));
    } else if (allFetchedUris.size === 1) {
      const url = Iterable.first(allFetchedUris).toString(true);
      if (url.length > 400 || validFileUris.length === 1) {
        pastTenseMessage.appendMarkdown(localize({
          key: "fetchWebPage.pastTenseMessageResult.singularAsLink",
          comment: [
            // Make sure the link syntax is correct
            '{Locked="]({0})"}'
          ]
        }, "Fetched [resource]({0})", url));
        invocationMessage.appendMarkdown(localize({
          key: "fetchWebPage.invocationMessage.singularAsLink",
          comment: [
            // Make sure the link syntax is correct
            '{Locked="]({0})"}'
          ]
        }, "Fetching [resource]({0})", url));
      } else {
        pastTenseMessage.appendMarkdown(localize("fetchWebPage.pastTenseMessageResult.singular", "Fetched {0}", url));
        invocationMessage.appendMarkdown(localize("fetchWebPage.invocationMessage.singular", "Fetching {0}", url));
      }
    }
    let confirmationNotNeededReason;
    if (context.chatSessionResource) {
      const model = this._chatService.getSession(context.chatSessionResource);
      const userMessages = model?.getRequests().map((r) => r.message.text) ?? [];
      const referencedResources = collectReferencedResources(userMessages);
      let urlsMentionedInPrompt = false;
      for (const uri of urlsNeedingConfirmation) {
        if (referencedResources.has(uri)) {
          urlsNeedingConfirmation.delete(uri);
          urlsMentionedInPrompt = true;
        }
      }
      if (urlsMentionedInPrompt && urlsNeedingConfirmation.size === 0) {
        confirmationNotNeededReason = localize("fetchWebPage.urlMentionedInPrompt", "Auto approved because URL was in prompt");
      }
    }
    const result = { invocationMessage, pastTenseMessage };
    const allDomainsTrusted = Iterable.every(urlsNeedingConfirmation, (u) => this._trustedDomainService.isValid(u));
    let confirmationTitle;
    let confirmationMessage;
    if (urlsNeedingConfirmation.size && !allDomainsTrusted) {
      if (urlsNeedingConfirmation.size === 1) {
        confirmationTitle = localize("fetchWebPage.confirmationTitle.singular", "Fetch web page?");
        confirmationMessage = new MarkdownString(
          Iterable.first(urlsNeedingConfirmation).toString(true),
          { supportThemeIcons: true }
        );
      } else {
        confirmationTitle = localize("fetchWebPage.confirmationTitle.plural", "Fetch web pages?");
        confirmationMessage = new MarkdownString(
          [...urlsNeedingConfirmation].map((uri) => `- ${uri.toString(true)}`).join("\n"),
          { supportThemeIcons: true }
        );
      }
    }
    result.confirmationMessages = {
      title: confirmationTitle,
      message: confirmationMessage,
      confirmResults: urlsNeedingConfirmation.size > 0,
      allowAutoConfirm: true,
      disclaimer: new MarkdownString("$(info) " + localize("fetchWebPage.confirmationMessage.plural", "Web content may contain malicious code or attempt prompt injection attacks."), { supportThemeIcons: true }),
      confirmationNotNeededReason
    };
    return result;
  }
  _parseUris(urls) {
    const webUris = /* @__PURE__ */ new Map();
    const fileUris = /* @__PURE__ */ new Map();
    const invalidUris = /* @__PURE__ */ new Set();
    const blockedUris = /* @__PURE__ */ new Set();
    urls?.forEach((url) => {
      try {
        const uriObj = URI.parse(url);
        if (uriObj.scheme === "http" || uriObj.scheme === "https") {
          if (!this._agentNetworkFilterService.isUriAllowed(uriObj)) {
            blockedUris.add(url);
          } else {
            webUris.set(url, uriObj);
          }
        } else {
          fileUris.set(url, normalizePath(uriObj));
        }
      } catch (e) {
        invalidUris.add(url);
      }
    });
    return { webUris, fileUris, invalidUris, blockedUris };
  }
  _getPromptPartsForResults(urls, results) {
    return results.map((value, i) => {
      const title = results.length > 1 ? localize("fetchWebPage.fetchedFrom", "Fetched from {0}", urls[i]) : void 0;
      if (!value) {
        return {
          kind: "text",
          title,
          value: localize("fetchWebPage.invalidUrl", "Invalid URL")
        };
      } else if (typeof value === "string") {
        return {
          kind: "text",
          title,
          value
        };
      } else if (value.type === "tooldata") {
        return { ...value.value, title };
      } else if (value.type === "extracted") {
        switch (value.value.status) {
          case "ok":
            return { kind: "text", title, value: value.value.result };
          case "redirect":
            return { kind: "text", title, value: `The webpage has redirected to "${value.value.toURI.toString(true)}". Use the ${InternalFetchWebPageToolId} again to get its contents.` };
          case "error":
            return { kind: "text", title, value: `An error occurred retrieving the fetch result: ${value.value.error}` };
          default:
            assertNever(value.value);
        }
      } else {
        throw new Error("unreachable");
      }
    });
  }
  _getSupportedImageMimeType(uri) {
    const ext = extname(uri.path).toLowerCase();
    switch (ext) {
      case ".png":
        return ChatImageMimeType.PNG;
      case ".jpg":
      case ".jpeg":
        return ChatImageMimeType.JPEG;
      case ".gif":
        return ChatImageMimeType.GIF;
      case ".webp":
        return ChatImageMimeType.WEBP;
      case ".bmp":
        return ChatImageMimeType.BMP;
      default:
        return void 0;
    }
  }
};
FetchWebPageTool = __decorateClass([
  __decorateParam(0, IWebContentExtractorService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ITrustedDomainService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IAgentNetworkFilterService)
], FetchWebPageTool);
const _schemePrefix = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
function collectReferencedResources(messages) {
  const resources = new ResourceSet();
  for (const message of messages) {
    for (const rawToken of message.split(/\s+/)) {
      const token = rawToken.replace(/^[<("'`[{]+/, "").replace(/[>)"'`\]},.;]+$/, "");
      if (!_schemePrefix.test(token)) {
        continue;
      }
      try {
        resources.add(URI.parse(token, true));
      } catch {
      }
    }
  }
  return resources;
}
export {
  FetchWebPageTool,
  FetchWebPageToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGVsZWN0cm9uLWJyb3dzZXJcXGJ1aWx0SW5Ub29sc1xcZmV0Y2hQYWdlVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBleHRuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlLCBXZWJDb250ZW50RXh0cmFjdFJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvY29tbW9uL3dlYkNvbnRlbnRFeHRyYWN0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL2VuY29kaW5nLmpzJztcbmltcG9ydCB7IElUcnVzdGVkRG9tYWluU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VybC9icm93c2VyL3RydXN0ZWREb21haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0SW1hZ2VNaW1lVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgSVRvb2xSZXN1bHREYXRhUGFydCwgSVRvb2xSZXN1bHRUZXh0UGFydCwgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEludGVybmFsRmV0Y2hXZWJQYWdlVG9vbElkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy90b29scy5qcyc7XG5pbXBvcnQgeyBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25ldHdvcmtGaWx0ZXIvY29tbW9uL25ldHdvcmtGaWx0ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdvcmtpbmdEaXJlY3RvcnkgfSBmcm9tICcuLi8uLi9jb21tb24vd29ya2luZ0RpcmVjdG9yeS5qcyc7XG5cbmV4cG9ydCBjb25zdCBGZXRjaFdlYlBhZ2VUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogSW50ZXJuYWxGZXRjaFdlYlBhZ2VUb29sSWQsXG5cdGRpc3BsYXlOYW1lOiAnRmV0Y2ggV2ViIFBhZ2UnLFxuXHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogZmFsc2UsXG5cdG1vZGVsRGVzY3JpcHRpb246ICdGZXRjaGVzIHRoZSBtYWluIGNvbnRlbnQgZnJvbSBhIHdlYiBwYWdlLiBUaGlzIHRvb2wgaXMgdXNlZnVsIGZvciBzdW1tYXJpemluZyBvciBhbmFseXppbmcgdGhlIGNvbnRlbnQgb2YgYSB3ZWJwYWdlLicsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGNhblJlcXVlc3RQb3N0QXBwcm92YWw6IHRydWUsXG5cdGNhblJlcXVlc3RQcmVBcHByb3ZhbDogdHJ1ZSxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHR1cmxzOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmV0Y2hXZWJQYWdlLnVybHNEZXNjcmlwdGlvbicsICdBbiBhcnJheSBvZiBVUkxzIHRvIGZldGNoIGNvbnRlbnQgZnJvbS4nKVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cmVxdWlyZWQ6IFsndXJscyddXG5cdH1cbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZldGNoV2ViUGFnZVRvb2xQYXJhbXMge1xuXHR1cmxzPzogc3RyaW5nW107XG59XG5cbnR5cGUgUmVzdWx0VHlwZSA9IHN0cmluZyB8IHsgdHlwZTogJ3Rvb2xkYXRhJzsgdmFsdWU6IElUb29sUmVzdWx0RGF0YVBhcnQgfSB8IHsgdHlwZTogJ2V4dHJhY3RlZCc7IHZhbHVlOiBXZWJDb250ZW50RXh0cmFjdFJlc3VsdCB9IHwgdW5kZWZpbmVkO1xuXG5leHBvcnQgY2xhc3MgRmV0Y2hXZWJQYWdlVG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZWFkZXJNb2RlU2VydmljZTogSVdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRydXN0ZWREb21haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RydXN0ZWREb21haW5TZXJ2aWNlOiBJVHJ1c3RlZERvbWFpblNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZTogSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHVybHMgPSAoaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElGZXRjaFdlYlBhZ2VUb29sUGFyYW1zKS51cmxzIHx8IFtdO1xuXHRcdGNvbnN0IHsgd2ViVXJpcywgZmlsZVVyaXMsIGludmFsaWRVcmlzLCBibG9ja2VkVXJpcyB9ID0gdGhpcy5fcGFyc2VVcmlzKHVybHMpO1xuXHRcdGNvbnN0IGFsbFZhbGlkVXJpcyA9IFsuLi53ZWJVcmlzLnZhbHVlcygpLCAuLi5maWxlVXJpcy52YWx1ZXMoKV07XG5cblx0XHRpZiAoIWFsbFZhbGlkVXJpcy5sZW5ndGggJiYgaW52YWxpZFVyaXMuc2l6ZSA9PT0gMCAmJiBibG9ja2VkVXJpcy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBsb2NhbGl6ZSgnZmV0Y2hXZWJQYWdlLm5vVmFsaWRVcmxzJywgJ05vIHZhbGlkIFVSTHMgcHJvdmlkZWQuJykgfV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IGNvbnRlbnRzIGZyb20gd2ViIFVSSXNcblx0XHRsZXQgd2ViQ29udGVudHM6IFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0W10gPSBbXTtcblx0XHRpZiAod2ViVXJpcy5zaXplID4gMCkge1xuXHRcdFx0Y29uc3QgdHJ1c3RlZERvbWFpbnMgPSB0aGlzLl90cnVzdGVkRG9tYWluU2VydmljZS50cnVzdGVkRG9tYWlucztcblx0XHRcdHdlYkNvbnRlbnRzID0gYXdhaXQgdGhpcy5fcmVhZGVyTW9kZVNlcnZpY2UuZXh0cmFjdChbLi4ud2ViVXJpcy52YWx1ZXMoKV0sIHsgdHJ1c3RlZERvbWFpbnMgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IGNvbnRlbnRzIGZyb20gZmlsZSBVUklzXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzOiAoc3RyaW5nIHwgeyB0eXBlOiAndG9vbGRhdGEnOyB2YWx1ZTogSVRvb2xSZXN1bHREYXRhUGFydCB9IHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Y29uc3Qgc3VjY2Vzc2Z1bEZpbGVVcmlzOiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIGZpbGVVcmlzLnZhbHVlcygpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhIHN1cHBvcnRlZCBpbWFnZSB0eXBlIGZpcnN0XG5cdFx0XHRcdGNvbnN0IGltYWdlTWltZVR5cGUgPSB0aGlzLl9nZXRTdXBwb3J0ZWRJbWFnZU1pbWVUeXBlKHVyaSk7XG5cdFx0XHRcdGlmIChpbWFnZU1pbWVUeXBlKSB7XG5cdFx0XHRcdFx0Ly8gRm9yIHN1cHBvcnRlZCBpbWFnZSBmaWxlcywgcmV0dXJuIGFzIElUb29sUmVzdWx0RGF0YVBhcnRcblx0XHRcdFx0XHRmaWxlQ29udGVudHMucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiAndG9vbGRhdGEnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2RhdGEnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0XHRcdG1pbWVUeXBlOiBpbWFnZU1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0XHRcdGRhdGE6IGZpbGVDb250ZW50LnZhbHVlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgY29udGVudCBpcyBiaW5hcnlcblx0XHRcdFx0XHRjb25zdCBkZXRlY3RlZCA9IGRldGVjdEVuY29kaW5nRnJvbUJ1ZmZlcih7IGJ1ZmZlcjogZmlsZUNvbnRlbnQudmFsdWUsIGJ5dGVzUmVhZDogZmlsZUNvbnRlbnQudmFsdWUuYnl0ZUxlbmd0aCB9KTtcblxuXHRcdFx0XHRcdGlmIChkZXRlY3RlZC5zZWVtc0JpbmFyeSkge1xuXHRcdFx0XHRcdFx0Ly8gRm9yIGJpbmFyeSBmaWxlcywgcmV0dXJuIGEgbWVzc2FnZSBpbmRpY2F0aW5nIHRoZXkncmUgbm90IHN1cHBvcnRlZFxuXHRcdFx0XHRcdFx0Ly8gV2UgZG8gdGhpcyBmb3Igbm93IHVudGlsIHRoZSB0b29scyB0aGF0IGxldmVyYWdlIHRoaXMgaW50ZXJuYWwgdG9vbCBjYW4gc3VwcG9ydCBiaW5hcnkgY29udGVudFxuXHRcdFx0XHRcdFx0ZmlsZUNvbnRlbnRzLnB1c2gobG9jYWxpemUoJ2ZldGNoV2ViUGFnZS5iaW5hcnlOb3RTdXBwb3J0ZWQnLCAnQmluYXJ5IGZpbGVzIGFyZSBub3Qgc3VwcG9ydGVkIGF0IHRoZSBtb21lbnQuJykpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBGb3IgdGV4dCBmaWxlcywgY29udmVydCB0byBzdHJpbmdcblx0XHRcdFx0XHRcdGZpbGVDb250ZW50cy5wdXNoKGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN1Y2Nlc3NmdWxGaWxlVXJpcy5wdXNoKHVyaSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBJZiBmaWxlIHNlcnZpY2UgY2FuJ3QgcmVhZCBpdCwgdHJlYXQgYXMgaW52YWxpZFxuXHRcdFx0XHRmaWxlQ29udGVudHMucHVzaCh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIHJlc3VsdHMgYXJyYXkgaW4gb3JpZ2luYWwgb3JkZXJcblx0XHRjb25zdCByZXN1bHRzOiBSZXN1bHRUeXBlW10gPSBbXTtcblx0XHRsZXQgd2ViSW5kZXggPSAwO1xuXHRcdGxldCBmaWxlSW5kZXggPSAwO1xuXHRcdGZvciAoY29uc3QgdXJsIG9mIHVybHMpIHtcblx0XHRcdGlmIChibG9ja2VkVXJpcy5oYXModXJsKSkge1xuXHRcdFx0XHRyZXN1bHRzLnB1c2godGhpcy5fYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZS5mb3JtYXRFcnJvcihVUkkucGFyc2UodXJsKSkpO1xuXHRcdFx0fSBlbHNlIGlmIChpbnZhbGlkVXJpcy5oYXModXJsKSkge1xuXHRcdFx0XHRyZXN1bHRzLnB1c2godW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSBpZiAod2ViVXJpcy5oYXModXJsKSkge1xuXHRcdFx0XHRyZXN1bHRzLnB1c2goeyB0eXBlOiAnZXh0cmFjdGVkJywgdmFsdWU6IHdlYkNvbnRlbnRzW3dlYkluZGV4XSB9KTtcblx0XHRcdFx0d2ViSW5kZXgrKztcblx0XHRcdH0gZWxzZSBpZiAoZmlsZVVyaXMuaGFzKHVybCkpIHtcblx0XHRcdFx0cmVzdWx0cy5wdXNoKGZpbGVDb250ZW50c1tmaWxlSW5kZXhdKTtcblx0XHRcdFx0ZmlsZUluZGV4Kys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHRzLnB1c2godW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTa2lwIGNvbmZpcm1pbmcgYW55IHJlc3VsdHMgaWYgZXZlcnkgd2ViIGNvbnRlbnQgd2UgZ290IHdhcyBhbiBlcnJvciBvciByZWRpcmVjdFxuXHRcdGxldCBjb25maXJtUmVzdWx0czogdW5kZWZpbmVkIHwgYm9vbGVhbjtcblx0XHRpZiAod2ViQ29udGVudHMuZXZlcnkoZSA9PiBlLnN0YXR1cyA9PT0gJ2Vycm9yJyB8fCBlLnN0YXR1cyA9PT0gJ3JlZGlyZWN0JykpIHtcblx0XHRcdGNvbmZpcm1SZXN1bHRzID0gZmFsc2U7XG5cdFx0fVxuXG5cblx0XHQvLyBPbmx5IGluY2x1ZGUgVVJJcyB0aGF0IGFjdHVhbGx5IGhhZCBjb250ZW50IHN1Y2Nlc3NmdWxseSBmZXRjaGVkXG5cdFx0Y29uc3QgYWN0dWFsbHlWYWxpZFVyaXMgPSBbLi4ud2ViVXJpcy52YWx1ZXMoKSwgLi4uc3VjY2Vzc2Z1bEZpbGVVcmlzXTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiB0aGlzLl9nZXRQcm9tcHRQYXJ0c0ZvclJlc3VsdHModXJscywgcmVzdWx0cyksXG5cdFx0XHR0b29sUmVzdWx0RGV0YWlsczogYWN0dWFsbHlWYWxpZFVyaXMsXG5cdFx0XHRjb25maXJtUmVzdWx0cyxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgd2ViVXJpcywgZmlsZVVyaXMsIGludmFsaWRVcmlzLCBibG9ja2VkVXJpcyB9ID0gdGhpcy5fcGFyc2VVcmlzKGNvbnRleHQucGFyYW1ldGVycy51cmxzKTtcblxuXHRcdC8vIENoZWNrIHdoaWNoIGZpbGUgVVJJcyBjYW4gYWN0dWFsbHkgYmUgcmVhZFxuXHRcdGNvbnN0IHZhbGlkRmlsZVVyaXM6IFVSSVtdID0gW107XG5cdFx0Y29uc3QgYWRkaXRpb25hbEludmFsaWRVcmxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW29yaWdpbmFsVXJsLCB1cmldIG9mIGZpbGVVcmlzLmVudHJpZXMoKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uuc3RhdCh1cmkpO1xuXHRcdFx0XHR2YWxpZEZpbGVVcmlzLnB1c2godXJpKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIElmIGZpbGUgc2VydmljZSBjYW4ndCBzdGF0IGl0LCB0cmVhdCBhcyBpbnZhbGlkXG5cdFx0XHRcdGFkZGl0aW9uYWxJbnZhbGlkVXJscy5wdXNoKG9yaWdpbmFsVXJsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbnZhbGlkID0gWy4uLkFycmF5LmZyb20oaW52YWxpZFVyaXMpLCAuLi5hZGRpdGlvbmFsSW52YWxpZFVybHMsIC4uLkFycmF5LmZyb20oYmxvY2tlZFVyaXMpXTtcblx0XHQvLyBBbGwgdmFsaWQgVVJJcyAod2ViICsgZmlsZSkgZm9yIGRpc3BsYXkgaW4gbWVzc2FnZXNcblx0XHRjb25zdCBhbGxGZXRjaGVkVXJpcyA9IG5ldyBSZXNvdXJjZVNldChbLi4ud2ViVXJpcy52YWx1ZXMoKSwgLi4udmFsaWRGaWxlVXJpc10pO1xuXHRcdC8vIEZpbGUgVVJJcyB0aGF0IGFyZSBpbnNpZGUgdGhlIHdvcmtzcGFjZSBkb24ndCBuZWVkIGNvbmZpcm1hdGlvbiBcdTIwMTQgdGhleSdyZSBhbHJlYWR5IGFjY2Vzc2libGVcblx0XHQvLyBhbmQgZG9uJ3QgY2FycnkgdGhlIHdlYiBjb250ZW50IHJpc2tzIChwcm9tcHQgaW5qZWN0aW9uLCBtYWxpY2lvdXMgcmVkaXJlY3RzKS5cblx0XHQvLyBXaGVuIGEgd29ya2luZyBkaXJlY3RvcnkgaXMgc2V0IChhZ2VudHMgd2luZG93KSwgaXQgaXMgdGhlIHNvdXJjZSBvZiB0cnV0aDtcblx0XHQvLyBvbmx5IGZhbGwgYmFjayB0byB3b3Jrc3BhY2UgZm9sZGVycyB3aGVuIG5vIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHNwZWNpZmllZC5cblx0XHRjb25zdCB3b3JraW5nRGlyID0gbmV3IFdvcmtpbmdEaXJlY3RvcnkodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIGNvbnRleHQud29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0Y29uc3QgZmlsZVVyaXNPdXRzaWRlV29ya3NwYWNlID0gdmFsaWRGaWxlVXJpcy5maWx0ZXIodXJpID0+ICF3b3JraW5nRGlyLmdldEZvbGRlcih1cmkpKTtcblx0XHRjb25zdCB1cmxzTmVlZGluZ0NvbmZpcm1hdGlvbiA9IG5ldyBSZXNvdXJjZVNldChbLi4ud2ViVXJpcy52YWx1ZXMoKSwgLi4uZmlsZVVyaXNPdXRzaWRlV29ya3NwYWNlXSk7XG5cblx0XHRjb25zdCBwYXN0VGVuc2VNZXNzYWdlID0gaW52YWxpZC5sZW5ndGhcblx0XHRcdD8gaW52YWxpZC5sZW5ndGggPiAxXG5cdFx0XHRcdC8vIElmIHRoZXJlIGFyZSBtdWx0aXBsZSBpbnZhbGlkIFVSTHMsIHNob3cgdGhlbSBhbGxcblx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0XHQnZmV0Y2hXZWJQYWdlLnBhc3RUZW5zZU1lc3NhZ2UucGx1cmFsJyxcblx0XHRcdFx0XHRcdCdGZXRjaGVkIHswfSByZXNvdXJjZXMsIGJ1dCB0aGUgZm9sbG93aW5nIHdlcmUgaW52YWxpZCBVUkxzOlxcblxcbnsxfVxcblxcbicsIGFsbEZldGNoZWRVcmlzLnNpemUsIGludmFsaWQubWFwKHVybCA9PiBgLSAke3VybH1gKS5qb2luKCdcXG4nKVxuXHRcdFx0XHRcdCkpXG5cdFx0XHRcdC8vIElmIHRoZXJlIGlzIG9ubHkgb25lIGludmFsaWQgVVJMLCBzaG93IGl0XG5cdFx0XHRcdDogbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J2ZldGNoV2ViUGFnZS5wYXN0VGVuc2VNZXNzYWdlLnNpbmd1bGFyJyxcblx0XHRcdFx0XHRcdCdGZXRjaGVkIHJlc291cmNlLCBidXQgdGhlIGZvbGxvd2luZyB3YXMgYW4gaW52YWxpZCBVUkw6XFxuXFxuezB9XFxuXFxuJywgaW52YWxpZFswXVxuXHRcdFx0XHRcdCkpXG5cdFx0XHQvLyBObyBpbnZhbGlkIFVSTHNcblx0XHRcdDogbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdGlmIChhbGxGZXRjaGVkVXJpcy5zaXplID4gMSkge1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnZmV0Y2hXZWJQYWdlLnBhc3RUZW5zZU1lc3NhZ2VSZXN1bHQucGx1cmFsJywgJ0ZldGNoZWQgezB9IHJlc291cmNlcycsIGFsbEZldGNoZWRVcmlzLnNpemUpKTtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdmZXRjaFdlYlBhZ2UuaW52b2NhdGlvbk1lc3NhZ2UucGx1cmFsJywgJ0ZldGNoaW5nIHswfSByZXNvdXJjZXMnLCBhbGxGZXRjaGVkVXJpcy5zaXplKSk7XG5cdFx0fSBlbHNlIGlmIChhbGxGZXRjaGVkVXJpcy5zaXplID09PSAxKSB7XG5cdFx0XHRjb25zdCB1cmwgPSBJdGVyYWJsZS5maXJzdChhbGxGZXRjaGVkVXJpcykhLnRvU3RyaW5nKHRydWUpO1xuXHRcdFx0Ly8gSWYgdGhlIFVSTCBpcyB0b28gbG9uZyBvciBpdCdzIGEgZmlsZSB1cmwsIHNob3cgaXQgYXMgYSBsaW5rLi4uIG90aGVyd2lzZSwgc2hvdyBpdCBhcyBwbGFpbiB0ZXh0XG5cdFx0XHRpZiAodXJsLmxlbmd0aCA+IDQwMCB8fCB2YWxpZEZpbGVVcmlzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICdmZXRjaFdlYlBhZ2UucGFzdFRlbnNlTWVzc2FnZVJlc3VsdC5zaW5ndWxhckFzTGluaycsXG5cdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBsaW5rIHN5bnRheCBpcyBjb3JyZWN0XG5cdFx0XHRcdFx0XHQne0xvY2tlZD1cIl0oezB9KVwifScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LCAnRmV0Y2hlZCBbcmVzb3VyY2VdKHswfSknLCB1cmwpKTtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ2ZldGNoV2ViUGFnZS5pbnZvY2F0aW9uTWVzc2FnZS5zaW5ndWxhckFzTGluaycsXG5cdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBsaW5rIHN5bnRheCBpcyBjb3JyZWN0XG5cdFx0XHRcdFx0XHQne0xvY2tlZD1cIl0oezB9KVwifScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LCAnRmV0Y2hpbmcgW3Jlc291cmNlXSh7MH0pJywgdXJsKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdmZXRjaFdlYlBhZ2UucGFzdFRlbnNlTWVzc2FnZVJlc3VsdC5zaW5ndWxhcicsICdGZXRjaGVkIHswfScsIHVybCkpO1xuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnZmV0Y2hXZWJQYWdlLmludm9jYXRpb25NZXNzYWdlLnNpbmd1bGFyJywgJ0ZldGNoaW5nIHswfScsIHVybCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBjb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IHVzZXJNZXNzYWdlcyA9IG1vZGVsPy5nZXRSZXF1ZXN0cygpLm1hcChyID0+IHIubWVzc2FnZS50ZXh0KSA/PyBbXTtcblx0XHRcdC8vIENvbGxlY3QgdGhlIHJlc291cmNlcyB0aGUgdXNlciBhY3R1YWxseSByZWZlcmVuY2VkIGJ5IHBhcnNpbmcgd2hvbGVcblx0XHRcdC8vIHdoaXRlc3BhY2UtZGVsaW1pdGVkIHRva2VucyBmcm9tIHRoZWlyIG1lc3NhZ2VzLiBQYXJzaW5nIGF0IHRva2VuIGdyYW51bGFyaXR5XG5cdFx0XHQvLyAocmF0aGVyIHRoYW4gYSBzdWJzdHJpbmcgbWF0Y2gpIGVuc3VyZXMgYSBgZmlsZTovL2AgVVJJIGVtYmVkZGVkIGluc2lkZSBhbm90aGVyXG5cdFx0XHQvLyBVUkwgdGhlIHVzZXIgcGFzdGVkIFx1MjAxNCBlLmcuIGBodHRwczovL2hvc3QvcD91PWZpbGU6Ly8vaG9tZS92aWN0aW0vLnNzaC9pZF9yc2FgIFx1MjAxNFxuXHRcdFx0Ly8gaXMgcGFyc2VkIGFzIHBhcnQgb2YgaXRzIGVuY2xvc2luZyB3ZWIgVVJMIGFuZCBpcyBub3QgbWlzdGFrZW4gZm9yIGFuIGV4cGxpY2l0XG5cdFx0XHQvLyByZXF1ZXN0IGZvciB0aGF0IGxvY2FsIGZpbGUsIHdoaWNoIHdvdWxkIG90aGVyd2lzZSBhdXRvLWFwcHJvdmUgdGhlIHJlYWQuXG5cdFx0XHRjb25zdCByZWZlcmVuY2VkUmVzb3VyY2VzID0gY29sbGVjdFJlZmVyZW5jZWRSZXNvdXJjZXModXNlck1lc3NhZ2VzKTtcblx0XHRcdGxldCB1cmxzTWVudGlvbmVkSW5Qcm9tcHQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgdXJpIG9mIHVybHNOZWVkaW5nQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdGlmIChyZWZlcmVuY2VkUmVzb3VyY2VzLmhhcyh1cmkpKSB7XG5cdFx0XHRcdFx0dXJsc05lZWRpbmdDb25maXJtYXRpb24uZGVsZXRlKHVyaSk7XG5cdFx0XHRcdFx0dXJsc01lbnRpb25lZEluUHJvbXB0ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHVybHNNZW50aW9uZWRJblByb21wdCAmJiB1cmxzTmVlZGluZ0NvbmZpcm1hdGlvbi5zaXplID09PSAwKSB7XG5cdFx0XHRcdGNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbiA9IGxvY2FsaXplKCdmZXRjaFdlYlBhZ2UudXJsTWVudGlvbmVkSW5Qcm9tcHQnLCAnQXV0byBhcHByb3ZlZCBiZWNhdXNlIFVSTCB3YXMgaW4gcHJvbXB0Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiA9IHsgaW52b2NhdGlvbk1lc3NhZ2UsIHBhc3RUZW5zZU1lc3NhZ2UgfTtcblx0XHRjb25zdCBhbGxEb21haW5zVHJ1c3RlZCA9IEl0ZXJhYmxlLmV2ZXJ5KHVybHNOZWVkaW5nQ29uZmlybWF0aW9uLCB1ID0+IHRoaXMuX3RydXN0ZWREb21haW5TZXJ2aWNlLmlzVmFsaWQodSkpO1xuXHRcdGxldCBjb25maXJtYXRpb25UaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjb25maXJtYXRpb25NZXNzYWdlOiBzdHJpbmcgfCBNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdGlmICh1cmxzTmVlZGluZ0NvbmZpcm1hdGlvbi5zaXplICYmICFhbGxEb21haW5zVHJ1c3RlZCkge1xuXHRcdFx0aWYgKHVybHNOZWVkaW5nQ29uZmlybWF0aW9uLnNpemUgPT09IDEpIHtcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGUgPSBsb2NhbGl6ZSgnZmV0Y2hXZWJQYWdlLmNvbmZpcm1hdGlvblRpdGxlLnNpbmd1bGFyJywgJ0ZldGNoIHdlYiBwYWdlPycpO1xuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRcdEl0ZXJhYmxlLmZpcnN0KHVybHNOZWVkaW5nQ29uZmlybWF0aW9uKSEudG9TdHJpbmcodHJ1ZSksXG5cdFx0XHRcdFx0eyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9XG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZSA9IGxvY2FsaXplKCdmZXRjaFdlYlBhZ2UuY29uZmlybWF0aW9uVGl0bGUucGx1cmFsJywgJ0ZldGNoIHdlYiBwYWdlcz8nKTtcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0XHRbLi4udXJsc05lZWRpbmdDb25maXJtYXRpb25dLm1hcCh1cmkgPT4gYC0gJHt1cmkudG9TdHJpbmcodHJ1ZSl9YCkuam9pbignXFxuJyksXG5cdFx0XHRcdFx0eyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJlc3VsdC5jb25maXJtYXRpb25NZXNzYWdlcyA9IHtcblx0XHRcdHRpdGxlOiBjb25maXJtYXRpb25UaXRsZSxcblx0XHRcdG1lc3NhZ2U6IGNvbmZpcm1hdGlvbk1lc3NhZ2UsXG5cdFx0XHRjb25maXJtUmVzdWx0czogdXJsc05lZWRpbmdDb25maXJtYXRpb24uc2l6ZSA+IDAsXG5cdFx0XHRhbGxvd0F1dG9Db25maXJtOiB0cnVlLFxuXHRcdFx0ZGlzY2xhaW1lcjogbmV3IE1hcmtkb3duU3RyaW5nKCckKGluZm8pICcgKyBsb2NhbGl6ZSgnZmV0Y2hXZWJQYWdlLmNvbmZpcm1hdGlvbk1lc3NhZ2UucGx1cmFsJywgJ1dlYiBjb250ZW50IG1heSBjb250YWluIG1hbGljaW91cyBjb2RlIG9yIGF0dGVtcHQgcHJvbXB0IGluamVjdGlvbiBhdHRhY2tzLicpLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pLFxuXHRcdFx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uXG5cdFx0fTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VVcmlzKHVybHM/OiBzdHJpbmdbXSk6IHsgd2ViVXJpczogTWFwPHN0cmluZywgVVJJPjsgZmlsZVVyaXM6IE1hcDxzdHJpbmcsIFVSST47IGludmFsaWRVcmlzOiBTZXQ8c3RyaW5nPjsgYmxvY2tlZFVyaXM6IFNldDxzdHJpbmc+IH0ge1xuXHRcdGNvbnN0IHdlYlVyaXMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRcdGNvbnN0IGZpbGVVcmlzID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0XHRjb25zdCBpbnZhbGlkVXJpcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGJsb2NrZWRVcmlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHR1cmxzPy5mb3JFYWNoKHVybCA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB1cmlPYmogPSBVUkkucGFyc2UodXJsKTtcblx0XHRcdFx0aWYgKHVyaU9iai5zY2hlbWUgPT09ICdodHRwJyB8fCB1cmlPYmouc2NoZW1lID09PSAnaHR0cHMnKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9hZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLmlzVXJpQWxsb3dlZCh1cmlPYmopKSB7XG5cdFx0XHRcdFx0XHRibG9ja2VkVXJpcy5hZGQodXJsKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0d2ViVXJpcy5zZXQodXJsLCB1cmlPYmopO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBOb3JtYWxpemUgYC4uYCBzbyB0aGUgY29uZmlybWF0aW9uLWdhdGluZyB3b3Jrc3BhY2UgY2hlY2sgYW5kIHRoZSBldmVudHVhbCByZWFkIGFncmVlIG9uIG9uZSBwYXRoLlxuXHRcdFx0XHRcdGZpbGVVcmlzLnNldCh1cmwsIG5vcm1hbGl6ZVBhdGgodXJpT2JqKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aW52YWxpZFVyaXMuYWRkKHVybCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4geyB3ZWJVcmlzLCBmaWxlVXJpcywgaW52YWxpZFVyaXMsIGJsb2NrZWRVcmlzIH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQcm9tcHRQYXJ0c0ZvclJlc3VsdHModXJsczogc3RyaW5nW10sIHJlc3VsdHM6IFJlc3VsdFR5cGVbXSk6IChJVG9vbFJlc3VsdFRleHRQYXJ0IHwgSVRvb2xSZXN1bHREYXRhUGFydClbXSB7XG5cdFx0cmV0dXJuIHJlc3VsdHMubWFwKCh2YWx1ZSwgaSkgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSByZXN1bHRzLmxlbmd0aCA+IDEgPyBsb2NhbGl6ZSgnZmV0Y2hXZWJQYWdlLmZldGNoZWRGcm9tJywgJ0ZldGNoZWQgZnJvbSB7MH0nLCB1cmxzW2ldKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdmZXRjaFdlYlBhZ2UuaW52YWxpZFVybCcsICdJbnZhbGlkIFVSTCcpXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0dmFsdWU6IHZhbHVlXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICd0b29sZGF0YScpIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4udmFsdWUudmFsdWUsIHRpdGxlIH07XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdleHRyYWN0ZWQnKSB7XG5cdFx0XHRcdHN3aXRjaCAodmFsdWUudmFsdWUuc3RhdHVzKSB7XG5cdFx0XHRcdFx0Y2FzZSAnb2snOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3RleHQnLCB0aXRsZSwgdmFsdWU6IHZhbHVlLnZhbHVlLnJlc3VsdCB9O1xuXHRcdFx0XHRcdGNhc2UgJ3JlZGlyZWN0Jzpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICd0ZXh0JywgdGl0bGUsIHZhbHVlOiBgVGhlIHdlYnBhZ2UgaGFzIHJlZGlyZWN0ZWQgdG8gXCIke3ZhbHVlLnZhbHVlLnRvVVJJLnRvU3RyaW5nKHRydWUpfVwiLiBVc2UgdGhlICR7SW50ZXJuYWxGZXRjaFdlYlBhZ2VUb29sSWR9IGFnYWluIHRvIGdldCBpdHMgY29udGVudHMuYCB9O1xuXHRcdFx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICd0ZXh0JywgdGl0bGUsIHZhbHVlOiBgQW4gZXJyb3Igb2NjdXJyZWQgcmV0cmlldmluZyB0aGUgZmV0Y2ggcmVzdWx0OiAke3ZhbHVlLnZhbHVlLmVycm9yfWAgfTtcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0YXNzZXJ0TmV2ZXIodmFsdWUudmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3VucmVhY2hhYmxlJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTdXBwb3J0ZWRJbWFnZU1pbWVUeXBlKHVyaTogVVJJKTogQ2hhdEltYWdlTWltZVR5cGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4dCA9IGV4dG5hbWUodXJpLnBhdGgpLnRvTG93ZXJDYXNlKCk7XG5cdFx0c3dpdGNoIChleHQpIHtcblx0XHRcdGNhc2UgJy5wbmcnOlxuXHRcdFx0XHRyZXR1cm4gQ2hhdEltYWdlTWltZVR5cGUuUE5HO1xuXHRcdFx0Y2FzZSAnLmpwZyc6XG5cdFx0XHRjYXNlICcuanBlZyc6XG5cdFx0XHRcdHJldHVybiBDaGF0SW1hZ2VNaW1lVHlwZS5KUEVHO1xuXHRcdFx0Y2FzZSAnLmdpZic6XG5cdFx0XHRcdHJldHVybiBDaGF0SW1hZ2VNaW1lVHlwZS5HSUY7XG5cdFx0XHRjYXNlICcud2VicCc6XG5cdFx0XHRcdHJldHVybiBDaGF0SW1hZ2VNaW1lVHlwZS5XRUJQO1xuXHRcdFx0Y2FzZSAnLmJtcCc6XG5cdFx0XHRcdHJldHVybiBDaGF0SW1hZ2VNaW1lVHlwZS5CTVA7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIE1hdGNoZXMgdGhlIHN0YXJ0IG9mIGEgVVJJIHNjaGVtZSAoUkZDIDM5ODY6IEFMUEhBICooIEFMUEhBIC8gRElHSVQgLyBcIitcIiAvIFwiLVwiIC8gXCIuXCIgKSBcIjpcIikuXG4gKiBVc2VkIGFzIGEgY2hlYXAgZmlsdGVyIHNvIG9ubHkgc2NoZW1lLXF1YWxpZmllZCB0b2tlbnMgYXJlIHBhcnNlZC5cbiAqL1xuY29uc3QgX3NjaGVtZVByZWZpeCA9IC9eW2EtekEtWl1bYS16QS1aMC05Ky4tXSo6LztcblxuLyoqXG4gKiBDb2xsZWN0cyB0aGUgVVJJcyBhIHVzZXIgZXhwbGljaXRseSByZWZlcmVuY2VkIGFjcm9zcyB0aGVpciBjaGF0IG1lc3NhZ2VzLCB1c2VkIHRvIGRlY2lkZVxuICogd2hldGhlciBhIGZldGNoIG1heSBza2lwIGl0cyBjb25maXJtYXRpb24gZGlhbG9nLiBFYWNoIG1lc3NhZ2UgaXMgc3BsaXQgb24gd2hpdGVzcGFjZSBhbmRcbiAqIHNjaGVtZS1xdWFsaWZpZWQgdG9rZW5zIGFyZSBwYXJzZWQgaW50byBVUklzOyBwYXJzaW5nIGF0IHRva2VuIGdyYW51bGFyaXR5IGlzIHdoYXQgbWFrZXNcbiAqIHRoaXMgc2FmZSBcdTIwMTQgYSBgZmlsZTovL2AgVVJJIGVtYmVkZGVkIGluc2lkZSBhbm90aGVyIFVSTCB0aGUgdXNlciBwYXN0ZWQgKGUuZy4gYVxuICogYD91PWZpbGU6Ly8vXHUyMDI2YCBxdWVyeSBwYXJhbWV0ZXIpIGlzIHBhcnNlZCBhcyBwYXJ0IG9mIGl0cyBlbmNsb3NpbmcgVVJMIGFuZCBuZXZlciBiZWNvbWVzIGFcbiAqIHN0YW5kYWxvbmUgcmVmZXJlbmNlLiBNZW1iZXJzaGlwIGlzIGNvbXBhcmVkIGJ5IHtAbGluayBSZXNvdXJjZVNldH0gKGtleWVkIG9uIGBVUkkudG9TdHJpbmcoKWApLlxuICovXG5mdW5jdGlvbiBjb2xsZWN0UmVmZXJlbmNlZFJlc291cmNlcyhtZXNzYWdlczogcmVhZG9ubHkgc3RyaW5nW10pOiBSZXNvdXJjZVNldCB7XG5cdGNvbnN0IHJlc291cmNlcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgbWVzc2FnZXMpIHtcblx0XHRmb3IgKGNvbnN0IHJhd1Rva2VuIG9mIG1lc3NhZ2Uuc3BsaXQoL1xccysvKSkge1xuXHRcdFx0Ly8gVHJpbSBjb21tb24gcHVuY3R1YXRpb24vYnJhY2tldHMgYSB1c2VyIG1pZ2h0IHR5cGUgYXJvdW5kIGEgVVJMLlxuXHRcdFx0Y29uc3QgdG9rZW4gPSByYXdUb2tlbi5yZXBsYWNlKC9eWzwoXCInYFt7XSsvLCAnJykucmVwbGFjZSgvWz4pXCInYFxcXX0sLjtdKyQvLCAnJyk7XG5cdFx0XHQvLyBDaGVhcCBwcmUtY2hlY2s6IG9ubHkgdG9rZW5zIHRoYXQgc3RhcnQgd2l0aCBhIFVSSSBzY2hlbWUgYXJlIHdvcnRoIHBhcnNpbmcuXG5cdFx0XHQvLyBUaGlzIGF2b2lkcyB1c2luZyBleGNlcHRpb25zIGZvciBjb250cm9sIGZsb3cgb24gZXZlcnkgcGxhaW4gd29yZCBpbiBhIG1lc3NhZ2UuXG5cdFx0XHRpZiAoIV9zY2hlbWVQcmVmaXgudGVzdCh0b2tlbikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBTdHJpY3QgcGFyc2luZyByZWplY3RzIHNjaGVtZS1sZXNzIHRva2Vucywgc28gb25seSBnZW51aW5lIGBzY2hlbWU6XHUyMDI2YFxuXHRcdFx0XHQvLyB0b2tlbnMgKGh0dHAsIGh0dHBzLCBmaWxlLCBcdTIwMjYpIGFyZSB0cmVhdGVkIGFzIHJlZmVyZW5jZXMuXG5cdFx0XHRcdHJlc291cmNlcy5hZGQoVVJJLnBhcnNlKHRva2VuLCB0cnVlKSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gU2NoZW1lLWxpa2UgYnV0IG5vdCBhIHZhbGlkIFVSSTsgaWdub3JlLlxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzb3VyY2VzO1xufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQ0FBNEQ7QUFDckUsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBd0wsc0JBQW9DO0FBQzVOLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBRTFCLE1BQU0sdUJBQWtDO0FBQUEsRUFDOUMsSUFBSTtBQUFBLEVBQ0osYUFBYTtBQUFBLEVBQ2IseUJBQXlCO0FBQUEsRUFDekIsa0JBQWtCO0FBQUEsRUFDbEIsUUFBUSxlQUFlO0FBQUEsRUFDdkIsd0JBQXdCO0FBQUEsRUFDeEIsdUJBQXVCO0FBQUEsRUFDdkIsYUFBYTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsTUFBTTtBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQ04sT0FBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLGFBQWEsU0FBUyxnQ0FBZ0MseUNBQXlDO0FBQUEsTUFDaEc7QUFBQSxJQUNEO0FBQUEsSUFDQSxVQUFVLENBQUMsTUFBTTtBQUFBLEVBQ2xCO0FBQ0Q7QUFRTyxJQUFNLG1CQUFOLE1BQTRDO0FBQUEsRUFFbEQsWUFDK0Msb0JBQ2YsY0FDUyx1QkFDVCxjQUNZLDBCQUNFLDRCQUM1QztBQU42QztBQUNmO0FBQ1M7QUFDVDtBQUNZO0FBQ0U7QUFBQSxFQUMxQztBQUFBLEVBRUosTUFBTSxPQUFPLFlBQTZCLGNBQW1DLFdBQXlCLE9BQWdEO0FBQ3JKLFVBQU0sT0FBUSxXQUFXLFdBQXVDLFFBQVEsQ0FBQztBQUN6RSxVQUFNLEVBQUUsU0FBUyxVQUFVLGFBQWEsWUFBWSxJQUFJLEtBQUssV0FBVyxJQUFJO0FBQzVFLFVBQU0sZUFBZSxDQUFDLEdBQUcsUUFBUSxPQUFPLEdBQUcsR0FBRyxTQUFTLE9BQU8sQ0FBQztBQUUvRCxRQUFJLENBQUMsYUFBYSxVQUFVLFlBQVksU0FBUyxLQUFLLFlBQVksU0FBUyxHQUFHO0FBQzdFLGFBQU87QUFBQSxRQUNOLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLFNBQVMsNEJBQTRCLHlCQUF5QixFQUFFLENBQUM7QUFBQSxNQUNuRztBQUFBLElBQ0Q7QUFHQSxRQUFJLGNBQXlDLENBQUM7QUFDOUMsUUFBSSxRQUFRLE9BQU8sR0FBRztBQUNyQixZQUFNLGlCQUFpQixLQUFLLHNCQUFzQjtBQUNsRCxvQkFBYyxNQUFNLEtBQUssbUJBQW1CLFFBQVEsQ0FBQyxHQUFHLFFBQVEsT0FBTyxDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUM7QUFBQSxJQUM5RjtBQUdBLFVBQU0sZUFBMEYsQ0FBQztBQUNqRyxVQUFNLHFCQUE0QixDQUFDO0FBQ25DLGVBQVcsT0FBTyxTQUFTLE9BQU8sR0FBRztBQUNwQyxVQUFJO0FBQ0gsY0FBTSxjQUFjLE1BQU0sS0FBSyxhQUFhLFNBQVMsS0FBSyxRQUFXLEtBQUs7QUFHMUUsY0FBTSxnQkFBZ0IsS0FBSywyQkFBMkIsR0FBRztBQUN6RCxZQUFJLGVBQWU7QUFFbEIsdUJBQWEsS0FBSztBQUFBLFlBQ2pCLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxjQUNOLE1BQU07QUFBQSxjQUNOLE9BQU87QUFBQSxnQkFDTixVQUFVO0FBQUEsZ0JBQ1YsTUFBTSxZQUFZO0FBQUEsY0FDbkI7QUFBQSxZQUNEO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRixPQUFPO0FBRU4sZ0JBQU0sV0FBVyx5QkFBeUIsRUFBRSxRQUFRLFlBQVksT0FBTyxXQUFXLFlBQVksTUFBTSxXQUFXLENBQUM7QUFFaEgsY0FBSSxTQUFTLGFBQWE7QUFHekIseUJBQWEsS0FBSyxTQUFTLG1DQUFtQywrQ0FBK0MsQ0FBQztBQUFBLFVBQy9HLE9BQU87QUFFTix5QkFBYSxLQUFLLFlBQVksTUFBTSxTQUFTLENBQUM7QUFBQSxVQUMvQztBQUFBLFFBQ0Q7QUFFQSwyQkFBbUIsS0FBSyxHQUFHO0FBQUEsTUFDNUIsU0FBUyxPQUFPO0FBRWYscUJBQWEsS0FBSyxNQUFTO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBR0EsVUFBTSxVQUF3QixDQUFDO0FBQy9CLFFBQUksV0FBVztBQUNmLFFBQUksWUFBWTtBQUNoQixlQUFXLE9BQU8sTUFBTTtBQUN2QixVQUFJLFlBQVksSUFBSSxHQUFHLEdBQUc7QUFDekIsZ0JBQVEsS0FBSyxLQUFLLDJCQUEyQixZQUFZLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3pFLFdBQVcsWUFBWSxJQUFJLEdBQUcsR0FBRztBQUNoQyxnQkFBUSxLQUFLLE1BQVM7QUFBQSxNQUN2QixXQUFXLFFBQVEsSUFBSSxHQUFHLEdBQUc7QUFDNUIsZ0JBQVEsS0FBSyxFQUFFLE1BQU0sYUFBYSxPQUFPLFlBQVksUUFBUSxFQUFFLENBQUM7QUFDaEU7QUFBQSxNQUNELFdBQVcsU0FBUyxJQUFJLEdBQUcsR0FBRztBQUM3QixnQkFBUSxLQUFLLGFBQWEsU0FBUyxDQUFDO0FBQ3BDO0FBQUEsTUFDRCxPQUFPO0FBQ04sZ0JBQVEsS0FBSyxNQUFTO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBR0EsUUFBSTtBQUNKLFFBQUksWUFBWSxNQUFNLE9BQUssRUFBRSxXQUFXLFdBQVcsRUFBRSxXQUFXLFVBQVUsR0FBRztBQUM1RSx1QkFBaUI7QUFBQSxJQUNsQjtBQUlBLFVBQU0sb0JBQW9CLENBQUMsR0FBRyxRQUFRLE9BQU8sR0FBRyxHQUFHLGtCQUFrQjtBQUVyRSxXQUFPO0FBQUEsTUFDTixTQUFTLEtBQUssMEJBQTBCLE1BQU0sT0FBTztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sc0JBQXNCLFNBQTRDLE9BQXdFO0FBQy9JLFVBQU0sRUFBRSxTQUFTLFVBQVUsYUFBYSxZQUFZLElBQUksS0FBSyxXQUFXLFFBQVEsV0FBVyxJQUFJO0FBRy9GLFVBQU0sZ0JBQXVCLENBQUM7QUFDOUIsVUFBTSx3QkFBa0MsQ0FBQztBQUN6QyxlQUFXLENBQUMsYUFBYSxHQUFHLEtBQUssU0FBUyxRQUFRLEdBQUc7QUFDcEQsVUFBSTtBQUNILGNBQU0sS0FBSyxhQUFhLEtBQUssR0FBRztBQUNoQyxzQkFBYyxLQUFLLEdBQUc7QUFBQSxNQUN2QixTQUFTLE9BQU87QUFFZiw4QkFBc0IsS0FBSyxXQUFXO0FBQUEsTUFDdkM7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLENBQUMsR0FBRyxNQUFNLEtBQUssV0FBVyxHQUFHLEdBQUcsdUJBQXVCLEdBQUcsTUFBTSxLQUFLLFdBQVcsQ0FBQztBQUVqRyxVQUFNLGlCQUFpQixJQUFJLFlBQVksQ0FBQyxHQUFHLFFBQVEsT0FBTyxHQUFHLEdBQUcsYUFBYSxDQUFDO0FBSzlFLFVBQU0sYUFBYSxJQUFJLGlCQUFpQixLQUFLLDBCQUEwQixRQUFRLGdCQUFnQjtBQUMvRixVQUFNLDJCQUEyQixjQUFjLE9BQU8sU0FBTyxDQUFDLFdBQVcsVUFBVSxHQUFHLENBQUM7QUFDdkYsVUFBTSwwQkFBMEIsSUFBSSxZQUFZLENBQUMsR0FBRyxRQUFRLE9BQU8sR0FBRyxHQUFHLHdCQUF3QixDQUFDO0FBRWxHLFVBQU0sbUJBQW1CLFFBQVEsU0FDOUIsUUFBUSxTQUFTLElBRWhCLElBQUk7QUFBQSxNQUNMO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUEwRSxlQUFlO0FBQUEsUUFBTSxRQUFRLElBQUksU0FBTyxLQUFLLEdBQUcsRUFBRSxFQUFFLEtBQUssSUFBSTtBQUFBLE1BQ3hJO0FBQUEsSUFBQyxJQUVBLElBQUk7QUFBQSxNQUNMO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUFzRSxRQUFRLENBQUM7QUFBQSxNQUNoRjtBQUFBLElBQUMsSUFFRCxJQUFJLGVBQWU7QUFFdEIsVUFBTSxvQkFBb0IsSUFBSSxlQUFlO0FBQzdDLFFBQUksZUFBZSxPQUFPLEdBQUc7QUFDNUIsdUJBQWlCLGVBQWUsU0FBUyw4Q0FBOEMseUJBQXlCLGVBQWUsSUFBSSxDQUFDO0FBQ3BJLHdCQUFrQixlQUFlLFNBQVMseUNBQXlDLDBCQUEwQixlQUFlLElBQUksQ0FBQztBQUFBLElBQ2xJLFdBQVcsZUFBZSxTQUFTLEdBQUc7QUFDckMsWUFBTSxNQUFNLFNBQVMsTUFBTSxjQUFjLEVBQUcsU0FBUyxJQUFJO0FBRXpELFVBQUksSUFBSSxTQUFTLE9BQU8sY0FBYyxXQUFXLEdBQUc7QUFDbkQseUJBQWlCLGVBQWUsU0FBUztBQUFBLFVBQ3hDLEtBQUs7QUFBQSxVQUNMLFNBQVM7QUFBQTtBQUFBLFlBRVI7QUFBQSxVQUNEO0FBQUEsUUFDRCxHQUFHLDJCQUEyQixHQUFHLENBQUM7QUFDbEMsMEJBQWtCLGVBQWUsU0FBUztBQUFBLFVBQ3pDLEtBQUs7QUFBQSxVQUNMLFNBQVM7QUFBQTtBQUFBLFlBRVI7QUFBQSxVQUNEO0FBQUEsUUFDRCxHQUFHLDRCQUE0QixHQUFHLENBQUM7QUFBQSxNQUNwQyxPQUFPO0FBQ04seUJBQWlCLGVBQWUsU0FBUyxnREFBZ0QsZUFBZSxHQUFHLENBQUM7QUFDNUcsMEJBQWtCLGVBQWUsU0FBUywyQ0FBMkMsZ0JBQWdCLEdBQUcsQ0FBQztBQUFBLE1BQzFHO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSixRQUFJLFFBQVEscUJBQXFCO0FBQ2hDLFlBQU0sUUFBUSxLQUFLLGFBQWEsV0FBVyxRQUFRLG1CQUFtQjtBQUN0RSxZQUFNLGVBQWUsT0FBTyxZQUFZLEVBQUUsSUFBSSxPQUFLLEVBQUUsUUFBUSxJQUFJLEtBQUssQ0FBQztBQU92RSxZQUFNLHNCQUFzQiwyQkFBMkIsWUFBWTtBQUNuRSxVQUFJLHdCQUF3QjtBQUM1QixpQkFBVyxPQUFPLHlCQUF5QjtBQUMxQyxZQUFJLG9CQUFvQixJQUFJLEdBQUcsR0FBRztBQUNqQyxrQ0FBd0IsT0FBTyxHQUFHO0FBQ2xDLGtDQUF3QjtBQUFBLFFBQ3pCO0FBQUEsTUFDRDtBQUNBLFVBQUkseUJBQXlCLHdCQUF3QixTQUFTLEdBQUc7QUFDaEUsc0NBQThCLFNBQVMscUNBQXFDLHlDQUF5QztBQUFBLE1BQ3RIO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBa0MsRUFBRSxtQkFBbUIsaUJBQWlCO0FBQzlFLFVBQU0sb0JBQW9CLFNBQVMsTUFBTSx5QkFBeUIsT0FBSyxLQUFLLHNCQUFzQixRQUFRLENBQUMsQ0FBQztBQUM1RyxRQUFJO0FBQ0osUUFBSTtBQUVKLFFBQUksd0JBQXdCLFFBQVEsQ0FBQyxtQkFBbUI7QUFDdkQsVUFBSSx3QkFBd0IsU0FBUyxHQUFHO0FBQ3ZDLDRCQUFvQixTQUFTLDJDQUEyQyxpQkFBaUI7QUFDekYsOEJBQXNCLElBQUk7QUFBQSxVQUN6QixTQUFTLE1BQU0sdUJBQXVCLEVBQUcsU0FBUyxJQUFJO0FBQUEsVUFDdEQsRUFBRSxtQkFBbUIsS0FBSztBQUFBLFFBQzNCO0FBQUEsTUFDRCxPQUFPO0FBQ04sNEJBQW9CLFNBQVMseUNBQXlDLGtCQUFrQjtBQUN4Riw4QkFBc0IsSUFBSTtBQUFBLFVBQ3pCLENBQUMsR0FBRyx1QkFBdUIsRUFBRSxJQUFJLFNBQU8sS0FBSyxJQUFJLFNBQVMsSUFBSSxDQUFDLEVBQUUsRUFBRSxLQUFLLElBQUk7QUFBQSxVQUM1RSxFQUFFLG1CQUFtQixLQUFLO0FBQUEsUUFDM0I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU8sdUJBQXVCO0FBQUEsTUFDN0IsT0FBTztBQUFBLE1BQ1AsU0FBUztBQUFBLE1BQ1QsZ0JBQWdCLHdCQUF3QixPQUFPO0FBQUEsTUFDL0Msa0JBQWtCO0FBQUEsTUFDbEIsWUFBWSxJQUFJLGVBQWUsYUFBYSxTQUFTLDJDQUEyQyw2RUFBNkUsR0FBRyxFQUFFLG1CQUFtQixLQUFLLENBQUM7QUFBQSxNQUMzTTtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsV0FBVyxNQUFnSTtBQUNsSixVQUFNLFVBQVUsb0JBQUksSUFBaUI7QUFDckMsVUFBTSxXQUFXLG9CQUFJLElBQWlCO0FBQ3RDLFVBQU0sY0FBYyxvQkFBSSxJQUFZO0FBQ3BDLFVBQU0sY0FBYyxvQkFBSSxJQUFZO0FBRXBDLFVBQU0sUUFBUSxTQUFPO0FBQ3BCLFVBQUk7QUFDSCxjQUFNLFNBQVMsSUFBSSxNQUFNLEdBQUc7QUFDNUIsWUFBSSxPQUFPLFdBQVcsVUFBVSxPQUFPLFdBQVcsU0FBUztBQUMxRCxjQUFJLENBQUMsS0FBSywyQkFBMkIsYUFBYSxNQUFNLEdBQUc7QUFDMUQsd0JBQVksSUFBSSxHQUFHO0FBQUEsVUFDcEIsT0FBTztBQUNOLG9CQUFRLElBQUksS0FBSyxNQUFNO0FBQUEsVUFDeEI7QUFBQSxRQUNELE9BQU87QUFFTixtQkFBUyxJQUFJLEtBQUssY0FBYyxNQUFNLENBQUM7QUFBQSxRQUN4QztBQUFBLE1BQ0QsU0FBUyxHQUFHO0FBQ1gsb0JBQVksSUFBSSxHQUFHO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLEVBQUUsU0FBUyxVQUFVLGFBQWEsWUFBWTtBQUFBLEVBQ3REO0FBQUEsRUFFUSwwQkFBMEIsTUFBZ0IsU0FBc0U7QUFDdkgsV0FBTyxRQUFRLElBQUksQ0FBQyxPQUFPLE1BQU07QUFDaEMsWUFBTSxRQUFRLFFBQVEsU0FBUyxJQUFJLFNBQVMsNEJBQTRCLG9CQUFvQixLQUFLLENBQUMsQ0FBQyxJQUFJO0FBQ3ZHLFVBQUksQ0FBQyxPQUFPO0FBQ1gsZUFBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ047QUFBQSxVQUNBLE9BQU8sU0FBUywyQkFBMkIsYUFBYTtBQUFBLFFBQ3pEO0FBQUEsTUFDRCxXQUFXLE9BQU8sVUFBVSxVQUFVO0FBQ3JDLGVBQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELFdBQVcsTUFBTSxTQUFTLFlBQVk7QUFDckMsZUFBTyxFQUFFLEdBQUcsTUFBTSxPQUFPLE1BQU07QUFBQSxNQUNoQyxXQUFXLE1BQU0sU0FBUyxhQUFhO0FBQ3RDLGdCQUFRLE1BQU0sTUFBTSxRQUFRO0FBQUEsVUFDM0IsS0FBSztBQUNKLG1CQUFPLEVBQUUsTUFBTSxRQUFRLE9BQU8sT0FBTyxNQUFNLE1BQU0sT0FBTztBQUFBLFVBQ3pELEtBQUs7QUFDSixtQkFBTyxFQUFFLE1BQU0sUUFBUSxPQUFPLE9BQU8sa0NBQWtDLE1BQU0sTUFBTSxNQUFNLFNBQVMsSUFBSSxDQUFDLGNBQWMsMEJBQTBCLDhCQUE4QjtBQUFBLFVBQzlLLEtBQUs7QUFDSixtQkFBTyxFQUFFLE1BQU0sUUFBUSxPQUFPLE9BQU8sa0RBQWtELE1BQU0sTUFBTSxLQUFLLEdBQUc7QUFBQSxVQUM1RztBQUNDLHdCQUFZLE1BQU0sS0FBSztBQUFBLFFBQ3pCO0FBQUEsTUFDRCxPQUFPO0FBQ04sY0FBTSxJQUFJLE1BQU0sYUFBYTtBQUFBLE1BQzlCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsMkJBQTJCLEtBQXlDO0FBQzNFLFVBQU0sTUFBTSxRQUFRLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDMUMsWUFBUSxLQUFLO0FBQUEsTUFDWixLQUFLO0FBQ0osZUFBTyxrQkFBa0I7QUFBQSxNQUMxQixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0osZUFBTyxrQkFBa0I7QUFBQSxNQUMxQixLQUFLO0FBQ0osZUFBTyxrQkFBa0I7QUFBQSxNQUMxQixLQUFLO0FBQ0osZUFBTyxrQkFBa0I7QUFBQSxNQUMxQixLQUFLO0FBQ0osZUFBTyxrQkFBa0I7QUFBQSxNQUMxQjtBQUNDLGVBQU87QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUNEO0FBelRhLG1CQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSVTtBQStUYixNQUFNLGdCQUFnQjtBQVV0QixTQUFTLDJCQUEyQixVQUEwQztBQUM3RSxRQUFNLFlBQVksSUFBSSxZQUFZO0FBQ2xDLGFBQVcsV0FBVyxVQUFVO0FBQy9CLGVBQVcsWUFBWSxRQUFRLE1BQU0sS0FBSyxHQUFHO0FBRTVDLFlBQU0sUUFBUSxTQUFTLFFBQVEsZUFBZSxFQUFFLEVBQUUsUUFBUSxtQkFBbUIsRUFBRTtBQUcvRSxVQUFJLENBQUMsY0FBYyxLQUFLLEtBQUssR0FBRztBQUMvQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJO0FBR0gsa0JBQVUsSUFBSSxJQUFJLE1BQU0sT0FBTyxJQUFJLENBQUM7QUFBQSxNQUNyQyxRQUFRO0FBQUEsTUFFUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogW10KfQo=
