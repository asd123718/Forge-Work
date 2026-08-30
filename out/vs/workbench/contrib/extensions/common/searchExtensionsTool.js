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
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { SortBy } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { EXTENSION_CATEGORIES } from "../../../../platform/extensions/common/extensions.js";
import { ToolDataSource } from "../../chat/common/tools/languageModelToolsService.js";
import { ExtensionState, IExtensionsWorkbenchService } from "../common/extensions.js";
const SearchExtensionsToolId = "vscode_searchExtensions_internal";
const SearchExtensionsToolData = {
  id: SearchExtensionsToolId,
  toolReferenceName: "extensions",
  legacyToolReferenceFullNames: ["extensions"],
  icon: ThemeIcon.fromId(Codicon.extensions.id),
  displayName: localize("searchExtensionsTool.displayName", "Search Extensions"),
  modelDescription: "This is a tool for browsing Visual Studio Code Extensions Marketplace. It allows the model to search for extensions and retrieve detailed information about them. The model should use this tool whenever it needs to discover extensions or resolve information about known ones. To use the tool, the model has to provide the category of the extensions, relevant search keywords, or known extension IDs. Note that search results may include false positives, so reviewing and filtering is recommended.",
  userDescription: localize("searchExtensionsTool.userDescription", "Search for VS Code extensions"),
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "The category of extensions to search for",
        enum: EXTENSION_CATEGORIES
      },
      keywords: {
        type: "array",
        items: {
          type: "string"
        },
        description: "The keywords to search for"
      },
      ids: {
        type: "array",
        items: {
          type: "string"
        },
        description: "The ids of the extensions to search for"
      }
    }
  }
};
let SearchExtensionsTool = class {
  constructor(extensionWorkbenchService) {
    this.extensionWorkbenchService = extensionWorkbenchService;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const params = invocation.parameters;
    if (!params.keywords?.length && !params.category && !params.ids?.length) {
      return {
        content: [{
          kind: "text",
          value: localize("searchExtensionsTool.noInput", "Please provide a category or keywords or ids to search for.")
        }]
      };
    }
    const extensionsMap = /* @__PURE__ */ new Map();
    const addExtension = (extensions) => {
      for (const extension of extensions) {
        if (extension.deprecationInfo || extension.isMalicious) {
          continue;
        }
        extensionsMap.set(extension.identifier.id.toLowerCase(), {
          id: extension.identifier.id,
          name: extension.displayName,
          description: extension.description,
          installed: extension.state === ExtensionState.Installed,
          installCount: extension.installCount ?? 0,
          rating: extension.rating ?? 0,
          categories: extension.categories ?? [],
          tags: extension.gallery?.tags ?? []
        });
      }
    };
    const queryAndAddExtensions = async (text) => {
      const extensions = await this.extensionWorkbenchService.queryGallery({
        text,
        pageSize: 10,
        sortBy: SortBy.InstallCount
      }, token);
      if (extensions.firstPage.length) {
        addExtension(extensions.firstPage);
      }
    };
    if (params.ids?.length) {
      const extensions = await this.extensionWorkbenchService.getExtensions(params.ids.map((id) => ({ id })), token);
      addExtension(extensions);
    }
    if (params.keywords?.length) {
      for (const keyword of params.keywords ?? []) {
        if (keyword === "featured") {
          await queryAndAddExtensions("featured");
        } else {
          let text = params.category ? `category:"${params.category}"` : "";
          text = keyword ? `${text} ${keyword}`.trim() : text;
          await queryAndAddExtensions(text);
        }
      }
    } else {
      await queryAndAddExtensions(`category:"${params.category}"`);
    }
    const result = Array.from(extensionsMap.values());
    return {
      content: [{
        kind: "text",
        value: `Here are the list of extensions:
${JSON.stringify(result)}
. Important: Use the following format to display extensions to the user because there is a renderer available to parse these extensions in this format and display them with all details. So, do not describe about the extensions to the user.
\`\`\`vscode-extensions
extensionId1,extensionId2
\`\`\`
.`
      }],
      toolResultDetails: {
        input: JSON.stringify(params),
        output: [{ type: "embed", isText: true, value: JSON.stringify(result.map((extension) => extension.id)) }]
      }
    };
  }
};
SearchExtensionsTool = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService)
], SearchExtensionsTool);
export {
  SearchExtensionsTool,
  SearchExtensionsToolData,
  SearchExtensionsToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGNvbW1vblxcc2VhcmNoRXh0ZW5zaW9uc1Rvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFNvcnRCeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0NBVEVHT1JJRVMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElUb29sRGF0YSwgSVRvb2xJbXBsLCBJVG9vbEludm9jYXRpb24sIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25TdGF0ZSwgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuXG5leHBvcnQgY29uc3QgU2VhcmNoRXh0ZW5zaW9uc1Rvb2xJZCA9ICd2c2NvZGVfc2VhcmNoRXh0ZW5zaW9uc19pbnRlcm5hbCc7XG5cbmV4cG9ydCBjb25zdCBTZWFyY2hFeHRlbnNpb25zVG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0aWQ6IFNlYXJjaEV4dGVuc2lvbnNUb29sSWQsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiAnZXh0ZW5zaW9ucycsXG5cdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnZXh0ZW5zaW9ucyddLFxuXHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uZXh0ZW5zaW9ucy5pZCksXG5cdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgnc2VhcmNoRXh0ZW5zaW9uc1Rvb2wuZGlzcGxheU5hbWUnLCAnU2VhcmNoIEV4dGVuc2lvbnMnKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogJ1RoaXMgaXMgYSB0b29sIGZvciBicm93c2luZyBWaXN1YWwgU3R1ZGlvIENvZGUgRXh0ZW5zaW9ucyBNYXJrZXRwbGFjZS4gSXQgYWxsb3dzIHRoZSBtb2RlbCB0byBzZWFyY2ggZm9yIGV4dGVuc2lvbnMgYW5kIHJldHJpZXZlIGRldGFpbGVkIGluZm9ybWF0aW9uIGFib3V0IHRoZW0uIFRoZSBtb2RlbCBzaG91bGQgdXNlIHRoaXMgdG9vbCB3aGVuZXZlciBpdCBuZWVkcyB0byBkaXNjb3ZlciBleHRlbnNpb25zIG9yIHJlc29sdmUgaW5mb3JtYXRpb24gYWJvdXQga25vd24gb25lcy4gVG8gdXNlIHRoZSB0b29sLCB0aGUgbW9kZWwgaGFzIHRvIHByb3ZpZGUgdGhlIGNhdGVnb3J5IG9mIHRoZSBleHRlbnNpb25zLCByZWxldmFudCBzZWFyY2gga2V5d29yZHMsIG9yIGtub3duIGV4dGVuc2lvbiBJRHMuIE5vdGUgdGhhdCBzZWFyY2ggcmVzdWx0cyBtYXkgaW5jbHVkZSBmYWxzZSBwb3NpdGl2ZXMsIHNvIHJldmlld2luZyBhbmQgZmlsdGVyaW5nIGlzIHJlY29tbWVuZGVkLicsXG5cdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NlYXJjaEV4dGVuc2lvbnNUb29sLnVzZXJEZXNjcmlwdGlvbicsICdTZWFyY2ggZm9yIFZTIENvZGUgZXh0ZW5zaW9ucycpLFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRpbnB1dFNjaGVtYToge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBjYXRlZ29yeSBvZiBleHRlbnNpb25zIHRvIHNlYXJjaCBmb3InLFxuXHRcdFx0XHRlbnVtOiBFWFRFTlNJT05fQ0FURUdPUklFUyxcblx0XHRcdH0sXG5cdFx0XHRrZXl3b3Jkczoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBrZXl3b3JkcyB0byBzZWFyY2ggZm9yJyxcblx0XHRcdH0sXG5cdFx0XHRpZHM6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaGUgaWRzIG9mIHRoZSBleHRlbnNpb25zIHRvIHNlYXJjaCBmb3InLFxuXHRcdFx0fSxcblx0XHR9LFxuXHR9XG59O1xuXG50eXBlIElucHV0UGFyYW1zID0ge1xuXHRjYXRlZ29yeT86IHN0cmluZztcblx0a2V5d29yZHM/OiBzdHJpbmc7XG5cdGlkcz86IHN0cmluZ1tdO1xufTtcblxudHlwZSBFeHRlbnNpb25EYXRhID0ge1xuXHRpZDogc3RyaW5nO1xuXHRuYW1lOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGluc3RhbGxlZDogYm9vbGVhbjtcblx0aW5zdGFsbENvdW50OiBudW1iZXI7XG5cdHJhdGluZzogbnVtYmVyO1xuXHRjYXRlZ29yaWVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0dGFnczogcmVhZG9ubHkgc3RyaW5nW107XG59O1xuXG5leHBvcnQgY2xhc3MgU2VhcmNoRXh0ZW5zaW9uc1Rvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHBhcmFtcyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJbnB1dFBhcmFtcztcblx0XHRpZiAoIXBhcmFtcy5rZXl3b3Jkcz8ubGVuZ3RoICYmICFwYXJhbXMuY2F0ZWdvcnkgJiYgIXBhcmFtcy5pZHM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdzZWFyY2hFeHRlbnNpb25zVG9vbC5ub0lucHV0JywgJ1BsZWFzZSBwcm92aWRlIGEgY2F0ZWdvcnkgb3Iga2V5d29yZHMgb3IgaWRzIHRvIHNlYXJjaCBmb3IuJylcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc01hcCA9IG5ldyBNYXA8c3RyaW5nLCBFeHRlbnNpb25EYXRhPigpO1xuXG5cdFx0Y29uc3QgYWRkRXh0ZW5zaW9uID0gKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbyB8fCBleHRlbnNpb24uaXNNYWxpY2lvdXMpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRleHRlbnNpb25zTWFwLnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCB7XG5cdFx0XHRcdFx0aWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRcdG5hbWU6IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGluc3RhbGxlZDogZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQsXG5cdFx0XHRcdFx0aW5zdGFsbENvdW50OiBleHRlbnNpb24uaW5zdGFsbENvdW50ID8/IDAsXG5cdFx0XHRcdFx0cmF0aW5nOiBleHRlbnNpb24ucmF0aW5nID8/IDAsXG5cdFx0XHRcdFx0Y2F0ZWdvcmllczogZXh0ZW5zaW9uLmNhdGVnb3JpZXMgPz8gW10sXG5cdFx0XHRcdFx0dGFnczogZXh0ZW5zaW9uLmdhbGxlcnk/LnRhZ3MgPz8gW11cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHF1ZXJ5QW5kQWRkRXh0ZW5zaW9ucyA9IGFzeW5jICh0ZXh0OiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UucXVlcnlHYWxsZXJ5KHtcblx0XHRcdFx0dGV4dCxcblx0XHRcdFx0cGFnZVNpemU6IDEwLFxuXHRcdFx0XHRzb3J0Qnk6IFNvcnRCeS5JbnN0YWxsQ291bnRcblx0XHRcdH0sIHRva2VuKTtcblx0XHRcdGlmIChleHRlbnNpb25zLmZpcnN0UGFnZS5sZW5ndGgpIHtcblx0XHRcdFx0YWRkRXh0ZW5zaW9uKGV4dGVuc2lvbnMuZmlyc3RQYWdlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gU2VhcmNoIGZvciBleHRlbnNpb25zIGJ5IHRoZWlyIGlkc1xuXHRcdGlmIChwYXJhbXMuaWRzPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhwYXJhbXMuaWRzLm1hcChpZCA9PiAoeyBpZCB9KSksIHRva2VuKTtcblx0XHRcdGFkZEV4dGVuc2lvbihleHRlbnNpb25zKTtcblx0XHR9XG5cblx0XHRpZiAocGFyYW1zLmtleXdvcmRzPy5sZW5ndGgpIHtcblx0XHRcdGZvciAoY29uc3Qga2V5d29yZCBvZiBwYXJhbXMua2V5d29yZHMgPz8gW10pIHtcblx0XHRcdFx0aWYgKGtleXdvcmQgPT09ICdmZWF0dXJlZCcpIHtcblx0XHRcdFx0XHRhd2FpdCBxdWVyeUFuZEFkZEV4dGVuc2lvbnMoJ2ZlYXR1cmVkJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGV0IHRleHQgPSBwYXJhbXMuY2F0ZWdvcnkgPyBgY2F0ZWdvcnk6XCIke3BhcmFtcy5jYXRlZ29yeX1cImAgOiAnJztcblx0XHRcdFx0XHR0ZXh0ID0ga2V5d29yZCA/IGAke3RleHR9ICR7a2V5d29yZH1gLnRyaW0oKSA6IHRleHQ7XG5cdFx0XHRcdFx0YXdhaXQgcXVlcnlBbmRBZGRFeHRlbnNpb25zKHRleHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHF1ZXJ5QW5kQWRkRXh0ZW5zaW9ucyhgY2F0ZWdvcnk6XCIke3BhcmFtcy5jYXRlZ29yeX1cImApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IEFycmF5LmZyb20oZXh0ZW5zaW9uc01hcC52YWx1ZXMoKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHR2YWx1ZTogYEhlcmUgYXJlIHRoZSBsaXN0IG9mIGV4dGVuc2lvbnM6XFxuJHtKU09OLnN0cmluZ2lmeShyZXN1bHQpfVxcbi4gSW1wb3J0YW50OiBVc2UgdGhlIGZvbGxvd2luZyBmb3JtYXQgdG8gZGlzcGxheSBleHRlbnNpb25zIHRvIHRoZSB1c2VyIGJlY2F1c2UgdGhlcmUgaXMgYSByZW5kZXJlciBhdmFpbGFibGUgdG8gcGFyc2UgdGhlc2UgZXh0ZW5zaW9ucyBpbiB0aGlzIGZvcm1hdCBhbmQgZGlzcGxheSB0aGVtIHdpdGggYWxsIGRldGFpbHMuIFNvLCBkbyBub3QgZGVzY3JpYmUgYWJvdXQgdGhlIGV4dGVuc2lvbnMgdG8gdGhlIHVzZXIuXFxuXFxgXFxgXFxgdnNjb2RlLWV4dGVuc2lvbnNcXG5leHRlbnNpb25JZDEsZXh0ZW5zaW9uSWQyXFxuXFxgXFxgXFxgXFxuLmBcblx0XHRcdH1dLFxuXHRcdFx0dG9vbFJlc3VsdERldGFpbHM6IHtcblx0XHRcdFx0aW5wdXQ6IEpTT04uc3RyaW5naWZ5KHBhcmFtcyksXG5cdFx0XHRcdG91dHB1dDogW3sgdHlwZTogJ2VtYmVkJywgaXNUZXh0OiB0cnVlLCB2YWx1ZTogSlNPTi5zdHJpbmdpZnkocmVzdWx0Lm1hcChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkKSkgfV1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFDdkIsU0FBUyw0QkFBNEI7QUFDckMsU0FBa0Ysc0JBQW9DO0FBQ3RILFNBQVMsZ0JBQTRCLG1DQUFtQztBQUVqRSxNQUFNLHlCQUF5QjtBQUUvQixNQUFNLDJCQUFzQztBQUFBLEVBQ2xELElBQUk7QUFBQSxFQUNKLG1CQUFtQjtBQUFBLEVBQ25CLDhCQUE4QixDQUFDLFlBQVk7QUFBQSxFQUMzQyxNQUFNLFVBQVUsT0FBTyxRQUFRLFdBQVcsRUFBRTtBQUFBLEVBQzVDLGFBQWEsU0FBUyxvQ0FBb0MsbUJBQW1CO0FBQUEsRUFDN0Usa0JBQWtCO0FBQUEsRUFDbEIsaUJBQWlCLFNBQVMsd0NBQXdDLCtCQUErQjtBQUFBLEVBQ2pHLFFBQVEsZUFBZTtBQUFBLEVBQ3ZCLGFBQWE7QUFBQSxJQUNaLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxNQUNYLFVBQVU7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsUUFDUDtBQUFBLFFBQ0EsYUFBYTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNKLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxVQUNOLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxhQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFtQk8sSUFBTSx1QkFBTixNQUFnRDtBQUFBLEVBRXRELFlBQytDLDJC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
