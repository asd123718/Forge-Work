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
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { CellUri } from "../../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../../notebook/common/notebookService.js";
import { ICodeMapperService } from "../../editing/chatCodeMapperService.js";
import { IChatService } from "../../chatService/chatService.js";
import { ToolDataSource, ToolInvocationPresentation } from "../languageModelToolsService.js";
const ExtensionEditToolId = "vscode_editFile";
const InternalEditToolId = "vscode_editFile_internal";
const EditToolData = {
  id: InternalEditToolId,
  displayName: "",
  // not used
  modelDescription: "",
  // Not used
  source: ToolDataSource.Internal
};
let EditTool = class {
  constructor(chatService, codeMapperService, notebookService) {
    this.chatService = chatService;
    this.codeMapperService = codeMapperService;
    this.notebookService = notebookService;
  }
  async invoke(invocation, countTokens, _progress, token) {
    if (!invocation.context) {
      throw new Error("toolInvocationToken is required for this tool");
    }
    const parameters = invocation.parameters;
    const fileUri = URI.revive(parameters.uri);
    const uri = CellUri.parse(fileUri)?.notebook || fileUri;
    const model = this.chatService.getSession(invocation.context.sessionResource);
    const request = model.getRequests().at(-1);
    model.acceptResponseProgress(request, {
      kind: "markdownContent",
      content: new MarkdownString("\n````\n")
    });
    model.acceptResponseProgress(request, {
      kind: "codeblockUri",
      uri,
      isEdit: true
    });
    model.acceptResponseProgress(request, {
      kind: "markdownContent",
      content: new MarkdownString("\n````\n")
    });
    if (this.notebookService.hasSupportedNotebooks(uri) && this.notebookService.getNotebookTextModel(uri)) {
      model.acceptResponseProgress(request, {
        kind: "notebookEdit",
        edits: [],
        uri
      });
    } else {
      model.acceptResponseProgress(request, {
        kind: "textEdit",
        edits: [],
        uri
      });
    }
    const editSession = model.editingSession;
    if (!editSession) {
      throw new Error("This tool must be called from within an editing session");
    }
    const result = await this.codeMapperService.mapCode({
      codeBlocks: [{ code: parameters.code, resource: uri, markdownBeforeBlock: parameters.explanation }],
      location: "tool",
      chatRequestId: invocation.chatRequestId,
      chatRequestModel: invocation.modelId,
      chatSessionResource: invocation.context.sessionResource
    }, {
      textEdit: (target, edits) => {
        model.acceptResponseProgress(request, { kind: "textEdit", uri: target, edits });
      },
      notebookEdit(target, edits) {
        model.acceptResponseProgress(request, { kind: "notebookEdit", uri: target, edits });
      }
    }, token);
    if (this.notebookService.hasSupportedNotebooks(uri) && this.notebookService.getNotebookTextModel(uri)) {
      model.acceptResponseProgress(request, { kind: "notebookEdit", uri, edits: [], done: true });
    } else {
      model.acceptResponseProgress(request, { kind: "textEdit", uri, edits: [], done: true });
    }
    if (result?.errorMessage) {
      throw new Error(result.errorMessage);
    }
    let dispose;
    await new Promise((resolve) => {
      let wasFileBeingModified = false;
      dispose = autorun((r) => {
        const entries = editSession.entries.read(r);
        const currentFile = entries?.find((e) => isEqual(e.modifiedURI, uri));
        if (currentFile) {
          if (currentFile.isCurrentlyBeingModifiedBy.read(r)) {
            wasFileBeingModified = true;
          } else if (wasFileBeingModified) {
            resolve(true);
          }
        }
      });
    }).finally(() => {
      dispose.dispose();
    });
    return {
      content: [{ kind: "text", value: "The file was edited successfully" }]
    };
  }
  async prepareToolInvocation(context, token) {
    return {
      presentation: ToolInvocationPresentation.Hidden
    };
  }
};
EditTool = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, ICodeMapperService),
  __decorateParam(2, INotebookService)
], EditTool);
export {
  EditTool,
  EditToolData,
  ExtensionEditToolId,
  InternalEditToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xcZWRpdEZpbGVUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlTWFwcGVyU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRpbmcvY2hhdENvZGVNYXBwZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IEV4dGVuc2lvbkVkaXRUb29sSWQgPSAndnNjb2RlX2VkaXRGaWxlJztcbmV4cG9ydCBjb25zdCBJbnRlcm5hbEVkaXRUb29sSWQgPSAndnNjb2RlX2VkaXRGaWxlX2ludGVybmFsJztcbmV4cG9ydCBjb25zdCBFZGl0VG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0aWQ6IEludGVybmFsRWRpdFRvb2xJZCxcblx0ZGlzcGxheU5hbWU6ICcnLCAvLyBub3QgdXNlZFxuXHRtb2RlbERlc2NyaXB0aW9uOiAnJywgLy8gTm90IHVzZWRcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdFRvb2xQYXJhbXMge1xuXHR1cmk6IFVyaUNvbXBvbmVudHM7XG5cdGV4cGxhbmF0aW9uOiBzdHJpbmc7XG5cdGNvZGU6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvZGVNYXBwZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZU1hcHBlclNlcnZpY2U6IElDb2RlTWFwcGVyU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBjb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRpZiAoIWludm9jYXRpb24uY29udGV4dCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd0b29sSW52b2NhdGlvblRva2VuIGlzIHJlcXVpcmVkIGZvciB0aGlzIHRvb2wnKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJhbWV0ZXJzID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIEVkaXRUb29sUGFyYW1zO1xuXHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkucmV2aXZlKHBhcmFtZXRlcnMudXJpKTtcblx0XHRjb25zdCB1cmkgPSBDZWxsVXJpLnBhcnNlKGZpbGVVcmkpPy5ub3RlYm9vayB8fCBmaWxlVXJpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oaW52b2NhdGlvbi5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKSE7XG5cblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdcXG5gYGBgXFxuJylcblx0XHR9KTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdGtpbmQ6ICdjb2RlYmxvY2tVcmknLFxuXHRcdFx0dXJpLFxuXHRcdFx0aXNFZGl0OiB0cnVlXG5cdFx0fSk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7XG5cdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnXFxuYGBgYFxcbicpXG5cdFx0fSk7XG5cdFx0Ly8gU2lnbmFsIHN0YXJ0LlxuXHRcdGlmICh0aGlzLm5vdGVib29rU2VydmljZS5oYXNTdXBwb3J0ZWROb3RlYm9va3ModXJpKSAmJiAodGhpcy5ub3RlYm9va1NlcnZpY2UuZ2V0Tm90ZWJvb2tUZXh0TW9kZWwodXJpKSkpIHtcblx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwge1xuXHRcdFx0XHRraW5kOiAnbm90ZWJvb2tFZGl0Jyxcblx0XHRcdFx0ZWRpdHM6IFtdLFxuXHRcdFx0XHR1cmlcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdFx0ZWRpdHM6IFtdLFxuXHRcdFx0XHR1cmlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRTZXNzaW9uID0gbW9kZWwuZWRpdGluZ1Nlc3Npb247XG5cdFx0aWYgKCFlZGl0U2Vzc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaGlzIHRvb2wgbXVzdCBiZSBjYWxsZWQgZnJvbSB3aXRoaW4gYW4gZWRpdGluZyBzZXNzaW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jb2RlTWFwcGVyU2VydmljZS5tYXBDb2RlKHtcblx0XHRcdGNvZGVCbG9ja3M6IFt7IGNvZGU6IHBhcmFtZXRlcnMuY29kZSwgcmVzb3VyY2U6IHVyaSwgbWFya2Rvd25CZWZvcmVCbG9jazogcGFyYW1ldGVycy5leHBsYW5hdGlvbiB9XSxcblx0XHRcdGxvY2F0aW9uOiAndG9vbCcsXG5cdFx0XHRjaGF0UmVxdWVzdElkOiBpbnZvY2F0aW9uLmNoYXRSZXF1ZXN0SWQsXG5cdFx0XHRjaGF0UmVxdWVzdE1vZGVsOiBpbnZvY2F0aW9uLm1vZGVsSWQsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBpbnZvY2F0aW9uLmNvbnRleHQuc2Vzc2lvblJlc291cmNlLFxuXHRcdH0sIHtcblx0XHRcdHRleHRFZGl0OiAodGFyZ2V0LCBlZGl0cykgPT4ge1xuXHRcdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsga2luZDogJ3RleHRFZGl0JywgdXJpOiB0YXJnZXQsIGVkaXRzIH0pO1xuXHRcdFx0fSxcblx0XHRcdG5vdGVib29rRWRpdCh0YXJnZXQsIGVkaXRzKSB7XG5cdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAnbm90ZWJvb2tFZGl0JywgdXJpOiB0YXJnZXQsIGVkaXRzIH0pO1xuXHRcdFx0fSxcblx0XHR9LCB0b2tlbik7XG5cblx0XHQvLyBTaWduYWwgZW5kLlxuXHRcdGlmICh0aGlzLm5vdGVib29rU2VydmljZS5oYXNTdXBwb3J0ZWROb3RlYm9va3ModXJpKSAmJiAodGhpcy5ub3RlYm9va1NlcnZpY2UuZ2V0Tm90ZWJvb2tUZXh0TW9kZWwodXJpKSkpIHtcblx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAnbm90ZWJvb2tFZGl0JywgdXJpLCBlZGl0czogW10sIGRvbmU6IHRydWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAndGV4dEVkaXQnLCB1cmksIGVkaXRzOiBbXSwgZG9uZTogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRpZiAocmVzdWx0Py5lcnJvck1lc3NhZ2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihyZXN1bHQuZXJyb3JNZXNzYWdlKTtcblx0XHR9XG5cblx0XHRsZXQgZGlzcG9zZTogSURpc3Bvc2FibGU7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcblx0XHRcdC8vIFRoZSBmaWxlIHdpbGwgbm90IGJlIG1vZGlmaWVkIHVudGlsIHRoZSBmaXJzdCBlZGl0cyBzdGFydCBzdHJlYW1pbmcgaW4sXG5cdFx0XHQvLyBzbyB3YWl0IHVudGlsIHdlIHNlZSB0aGF0IGl0IF93YXNfIG1vZGlmaWVkIGJlZm9yZSB3YWl0aW5nIGZvciBpdCB0byBiZSBkb25lLlxuXHRcdFx0bGV0IHdhc0ZpbGVCZWluZ01vZGlmaWVkID0gZmFsc2U7XG5cblx0XHRcdGRpc3Bvc2UgPSBhdXRvcnVuKChyKSA9PiB7XG5cblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IGVkaXRTZXNzaW9uLmVudHJpZXMucmVhZChyKTtcblx0XHRcdFx0Y29uc3QgY3VycmVudEZpbGUgPSBlbnRyaWVzPy5maW5kKChlKSA9PiBpc0VxdWFsKGUubW9kaWZpZWRVUkksIHVyaSkpO1xuXHRcdFx0XHRpZiAoY3VycmVudEZpbGUpIHtcblx0XHRcdFx0XHRpZiAoY3VycmVudEZpbGUuaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnkucmVhZChyKSkge1xuXHRcdFx0XHRcdFx0d2FzRmlsZUJlaW5nTW9kaWZpZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAod2FzRmlsZUJlaW5nTW9kaWZpZWQpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUodHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGRpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdUaGUgZmlsZSB3YXMgZWRpdGVkIHN1Y2Nlc3NmdWxseScgfV1cblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcmVzZW50YXRpb246IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlblxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUE4SSxnQkFBZ0Isa0NBQWdEO0FBRXZNLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0scUJBQXFCO0FBQzNCLE1BQU0sZUFBMEI7QUFBQSxFQUN0QyxJQUFJO0FBQUEsRUFDSixhQUFhO0FB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
