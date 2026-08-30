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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { rename } from "../../../../../editor/contrib/rename/browser/rename.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../common/tools/languageModelToolsService.js";
import { createToolSimpleTextResult } from "../../common/tools/builtinTools/toolHelpers.js";
import { errorResult, findLineNumber, findSymbolColumn, resolveSymbolToolFileUri } from "./toolHelpers.js";
const RenameToolId = "vscode_renameSymbol";
const BaseModelDescription = `Rename a code symbol across the workspace using the language server's rename functionality. This performs a precise, semantics-aware rename that updates all references.

Input:
- "symbol": The exact current name of the symbol to rename.
- "newName": The new name for the symbol.
- "uri": A full URI (e.g. "file:///path/to/file.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "filePath": A workspace-relative file path (e.g. "src/utils/helpers.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "lineContent": A substring of the line of code where the symbol appears. This is used to locate the exact position in the file. Must be the actual text from the file - do NOT fabricate it.

IMPORTANT: The file and line do NOT need to be the definition of the symbol. Any occurrence works - a usage, an import, a call site, etc. You can pick whichever occurrence is most convenient.

If the tool returns an error, retry with corrected input - ensure the file path is correct, the line content matches the actual file content, and the symbol name appears in that line.`;
const StaticModelDescription = BaseModelDescription + `

If the file's language has no rename provider registered, the tool returns an error.`;
let RenameTool = class extends Disposable {
  constructor(_languageFeaturesService, _textModelService, _workspaceContextService, _chatService, _bulkEditService) {
    super();
    this._languageFeaturesService = _languageFeaturesService;
    this._textModelService = _textModelService;
    this._workspaceContextService = _workspaceContextService;
    this._chatService = _chatService;
    this._bulkEditService = _bulkEditService;
  }
  getToolData() {
    return this._buildToolData(
      StaticModelDescription,
      localize("tool.rename.userDescription", "Rename a symbol across the workspace")
    );
  }
  _buildToolData(modelDescription, userDescription) {
    return {
      id: RenameToolId,
      toolReferenceName: "rename",
      canBeReferencedInPrompt: false,
      icon: ThemeIcon.fromId(Codicon.rename.id),
      displayName: localize("tool.rename.displayName", "Rename Symbol"),
      userDescription,
      modelDescription,
      source: ToolDataSource.Internal,
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "The exact current name of the symbol to rename."
          },
          newName: {
            type: "string",
            description: "The new name for the symbol."
          },
          uri: {
            type: "string",
            description: 'A full URI of a file where the symbol appears (e.g. "file:///path/to/file.ts"). Provide either "uri" or "filePath".'
          },
          filePath: {
            type: "string",
            description: 'A workspace-relative file path where the symbol appears (e.g. "src/utils/helpers.ts"). Provide either "uri" or "filePath".'
          },
          lineContent: {
            type: "string",
            description: "A substring of the line of code where the symbol appears. Used to locate the exact position. Must be actual text from the file."
          }
        },
        required: ["symbol", "newName", "lineContent"]
      }
    };
  }
  async prepareToolInvocation(context, _token) {
    const input = context.parameters;
    return {
      invocationMessage: localize("tool.rename.invocationMessage", "Renaming `{0}` to `{1}`", input.symbol, input.newName)
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const input = invocation.parameters;
    const uri = resolveSymbolToolFileUri(input, this._workspaceContextService, invocation.context?.workingDirectory);
    if (!uri) {
      return errorResult('Provide either "uri" (a full URI) or "filePath" (a workspace-relative path) to identify the file.');
    }
    const ref = await this._textModelService.createModelReference(uri);
    try {
      const model = ref.object.textEditorModel;
      if (!this._languageFeaturesService.renameProvider.has(model)) {
        return errorResult(`No rename provider available for this file's language. The rename tool may not support this language.`);
      }
      const lineNumber = findLineNumber(model, input.lineContent);
      if (lineNumber === void 0) {
        return errorResult(`Could not find line content "${input.lineContent}" in ${uri.toString()}. Provide the exact text from the line where the symbol appears.`);
      }
      const lineText = model.getLineContent(lineNumber);
      const column = findSymbolColumn(lineText, input.symbol);
      if (column === void 0) {
        return errorResult(`Could not find symbol "${input.symbol}" in the matched line. Ensure the symbol name is correct and appears in the provided line content.`);
      }
      const position = new Position(lineNumber, column);
      const renameResult = await rename(this._languageFeaturesService.renameProvider, model, position, input.newName);
      if (renameResult.rejectReason) {
        return errorResult(`Rename rejected: ${renameResult.rejectReason}`);
      }
      if (renameResult.edits.length === 0) {
        return errorResult(`Rename produced no edits.`);
      }
      if (invocation.context) {
        const chatModel = this._chatService.getSession(invocation.context.sessionResource);
        const request = chatModel?.getRequests().at(-1);
        if (chatModel && request) {
          const editsByUri = new ResourceMap();
          for (const edit of renameResult.edits) {
            if (ResourceTextEdit.is(edit)) {
              let edits = editsByUri.get(edit.resource);
              if (!edits) {
                edits = [];
                editsByUri.set(edit.resource, edits);
              }
              edits.push(edit.textEdit);
            }
          }
          for (const [editUri, edits] of editsByUri) {
            chatModel.acceptResponseProgress(request, {
              kind: "textEdit",
              uri: editUri,
              edits: []
            });
            chatModel.acceptResponseProgress(request, {
              kind: "textEdit",
              uri: editUri,
              edits
            });
            chatModel.acceptResponseProgress(request, {
              kind: "textEdit",
              uri: editUri,
              edits: [],
              done: true
            });
          }
          return this._successResult(input, editsByUri.size, renameResult.edits.length);
        }
      }
      await this._bulkEditService.apply(renameResult);
      const fileCount = new ResourceSet(renameResult.edits.filter(ResourceTextEdit.is).map((e) => e.resource)).size;
      return this._successResult(input, fileCount, renameResult.edits.length);
    } finally {
      ref.dispose();
    }
  }
  _successResult(input, fileCount, editCount) {
    const text = editCount === 1 ? localize("tool.rename.oneEdit", "Renamed `{0}` to `{1}` - 1 edit in {2} file.", input.symbol, input.newName, fileCount) : localize("tool.rename.edits", "Renamed `{0}` to `{1}` - {2} edits across {3} files.", input.symbol, input.newName, editCount, fileCount);
    const result = createToolSimpleTextResult(text);
    result.toolResultMessage = new MarkdownString(text);
    return result;
  }
};
RenameTool = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, ITextModelService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IBulkEditService)
], RenameTool);
let RenameToolContribution = class extends Disposable {
  constructor(toolsService, instantiationService) {
    super();
    const renameTool = this._store.add(instantiationService.createInstance(RenameTool));
    this._store.add(toolsService.registerTool(renameTool.getToolData(), renameTool));
  }
};
RenameToolContribution.ID = "chat.renameTool";
RenameToolContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IInstantiationService)
], RenameToolContribution);
export {
  RenameTool,
  RenameToolContribution,
  RenameToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHRvb2xzXFxyZW5hbWVUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSwgUmVzb3VyY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyByZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9yZW5hbWUvYnJvd3Nlci9yZW5hbWUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ291bnRUb2tlbnNDYWxsYmFjaywgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVG9vbFNpbXBsZVRleHRSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL3Rvb2xIZWxwZXJzLmpzJztcbmltcG9ydCB7IGVycm9yUmVzdWx0LCBmaW5kTGluZU51bWJlciwgZmluZFN5bWJvbENvbHVtbiwgSVN5bWJvbFRvb2xJbnB1dCwgcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpIH0gZnJvbSAnLi90b29sSGVscGVycy5qcyc7XG5cbmV4cG9ydCBjb25zdCBSZW5hbWVUb29sSWQgPSAndnNjb2RlX3JlbmFtZVN5bWJvbCc7XG5cbmludGVyZmFjZSBJUmVuYW1lVG9vbElucHV0IGV4dGVuZHMgSVN5bWJvbFRvb2xJbnB1dCB7XG5cdG5ld05hbWU6IHN0cmluZztcbn1cblxuY29uc3QgQmFzZU1vZGVsRGVzY3JpcHRpb24gPSBgUmVuYW1lIGEgY29kZSBzeW1ib2wgYWNyb3NzIHRoZSB3b3Jrc3BhY2UgdXNpbmcgdGhlIGxhbmd1YWdlIHNlcnZlcidzIHJlbmFtZSBmdW5jdGlvbmFsaXR5LiBUaGlzIHBlcmZvcm1zIGEgcHJlY2lzZSwgc2VtYW50aWNzLWF3YXJlIHJlbmFtZSB0aGF0IHVwZGF0ZXMgYWxsIHJlZmVyZW5jZXMuXG5cbklucHV0OlxuLSBcInN5bWJvbFwiOiBUaGUgZXhhY3QgY3VycmVudCBuYW1lIG9mIHRoZSBzeW1ib2wgdG8gcmVuYW1lLlxuLSBcIm5ld05hbWVcIjogVGhlIG5ldyBuYW1lIGZvciB0aGUgc3ltYm9sLlxuLSBcInVyaVwiOiBBIGZ1bGwgVVJJIChlLmcuIFwiZmlsZTovLy9wYXRoL3RvL2ZpbGUudHNcIikgb2YgYSBmaWxlIHdoZXJlIHRoZSBzeW1ib2wgYXBwZWFycy4gUHJvdmlkZSBlaXRoZXIgXCJ1cmlcIiBvciBcImZpbGVQYXRoXCIuXG4tIFwiZmlsZVBhdGhcIjogQSB3b3Jrc3BhY2UtcmVsYXRpdmUgZmlsZSBwYXRoIChlLmcuIFwic3JjL3V0aWxzL2hlbHBlcnMudHNcIikgb2YgYSBmaWxlIHdoZXJlIHRoZSBzeW1ib2wgYXBwZWFycy4gUHJvdmlkZSBlaXRoZXIgXCJ1cmlcIiBvciBcImZpbGVQYXRoXCIuXG4tIFwibGluZUNvbnRlbnRcIjogQSBzdWJzdHJpbmcgb2YgdGhlIGxpbmUgb2YgY29kZSB3aGVyZSB0aGUgc3ltYm9sIGFwcGVhcnMuIFRoaXMgaXMgdXNlZCB0byBsb2NhdGUgdGhlIGV4YWN0IHBvc2l0aW9uIGluIHRoZSBmaWxlLiBNdXN0IGJlIHRoZSBhY3R1YWwgdGV4dCBmcm9tIHRoZSBmaWxlIC0gZG8gTk9UIGZhYnJpY2F0ZSBpdC5cblxuSU1QT1JUQU5UOiBUaGUgZmlsZSBhbmQgbGluZSBkbyBOT1QgbmVlZCB0byBiZSB0aGUgZGVmaW5pdGlvbiBvZiB0aGUgc3ltYm9sLiBBbnkgb2NjdXJyZW5jZSB3b3JrcyAtIGEgdXNhZ2UsIGFuIGltcG9ydCwgYSBjYWxsIHNpdGUsIGV0Yy4gWW91IGNhbiBwaWNrIHdoaWNoZXZlciBvY2N1cnJlbmNlIGlzIG1vc3QgY29udmVuaWVudC5cblxuSWYgdGhlIHRvb2wgcmV0dXJucyBhbiBlcnJvciwgcmV0cnkgd2l0aCBjb3JyZWN0ZWQgaW5wdXQgLSBlbnN1cmUgdGhlIGZpbGUgcGF0aCBpcyBjb3JyZWN0LCB0aGUgbGluZSBjb250ZW50IG1hdGNoZXMgdGhlIGFjdHVhbCBmaWxlIGNvbnRlbnQsIGFuZCB0aGUgc3ltYm9sIG5hbWUgYXBwZWFycyBpbiB0aGF0IGxpbmUuYDtcblxuLyoqXG4gKiBTdGF0aWMgZGVzY3JpcHRpb24gdGhhdCBkb2VzIG5vdCBkZXBlbmQgb24gdGhlIHNldCBvZiByZWdpc3RlcmVkIHJlbmFtZVxuICogcHJvdmlkZXJzLCBzbyBpdCBzdGF5cyBieXRlLXN0YWJsZSBhY3Jvc3MgcmVxdWVzdHMgYXMgbGFuZ3VhZ2UgZXh0ZW5zaW9uc1xuICogYWN0aXZhdGUgZHVyaW5nIGEgdHVybi5cbiAqL1xuY29uc3QgU3RhdGljTW9kZWxEZXNjcmlwdGlvbiA9IEJhc2VNb2RlbERlc2NyaXB0aW9uICsgYFxuXG5JZiB0aGUgZmlsZSdzIGxhbmd1YWdlIGhhcyBubyByZW5hbWUgcHJvdmlkZXIgcmVnaXN0ZXJlZCwgdGhlIHRvb2wgcmV0dXJucyBhbiBlcnJvci5gO1xuXG5leHBvcnQgY2xhc3MgUmVuYW1lVG9vbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9idWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRnZXRUb29sRGF0YSgpOiBJVG9vbERhdGEge1xuXHRcdHJldHVybiB0aGlzLl9idWlsZFRvb2xEYXRhKFxuXHRcdFx0U3RhdGljTW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdGxvY2FsaXplKCd0b29sLnJlbmFtZS51c2VyRGVzY3JpcHRpb24nLCAnUmVuYW1lIGEgc3ltYm9sIGFjcm9zcyB0aGUgd29ya3NwYWNlJyksXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkVG9vbERhdGEobW9kZWxEZXNjcmlwdGlvbjogc3RyaW5nLCB1c2VyRGVzY3JpcHRpb246IHN0cmluZyk6IElUb29sRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBSZW5hbWVUb29sSWQsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3JlbmFtZScsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogZmFsc2UsXG5cdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ucmVuYW1lLmlkKSxcblx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbC5yZW5hbWUuZGlzcGxheU5hbWUnLCAnUmVuYW1lIFN5bWJvbCcpLFxuXHRcdFx0dXNlckRlc2NyaXB0aW9uLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHN5bWJvbDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBleGFjdCBjdXJyZW50IG5hbWUgb2YgdGhlIHN5bWJvbCB0byByZW5hbWUuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bmV3TmFtZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBuZXcgbmFtZSBmb3IgdGhlIHN5bWJvbC4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR1cmk6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBIGZ1bGwgVVJJIG9mIGEgZmlsZSB3aGVyZSB0aGUgc3ltYm9sIGFwcGVhcnMgKGUuZy4gXCJmaWxlOi8vL3BhdGgvdG8vZmlsZS50c1wiKS4gUHJvdmlkZSBlaXRoZXIgXCJ1cmlcIiBvciBcImZpbGVQYXRoXCIuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZmlsZVBhdGg6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBIHdvcmtzcGFjZS1yZWxhdGl2ZSBmaWxlIHBhdGggd2hlcmUgdGhlIHN5bWJvbCBhcHBlYXJzIChlLmcuIFwic3JjL3V0aWxzL2hlbHBlcnMudHNcIikuIFByb3ZpZGUgZWl0aGVyIFwidXJpXCIgb3IgXCJmaWxlUGF0aFwiLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGxpbmVDb250ZW50OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQSBzdWJzdHJpbmcgb2YgdGhlIGxpbmUgb2YgY29kZSB3aGVyZSB0aGUgc3ltYm9sIGFwcGVhcnMuIFVzZWQgdG8gbG9jYXRlIHRoZSBleGFjdCBwb3NpdGlvbi4gTXVzdCBiZSBhY3R1YWwgdGV4dCBmcm9tIHRoZSBmaWxlLidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ3N5bWJvbCcsICduZXdOYW1lJywgJ2xpbmVDb250ZW50J11cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBpbnB1dCA9IGNvbnRleHQucGFyYW1ldGVycyBhcyBJUmVuYW1lVG9vbElucHV0O1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2wucmVuYW1lLmludm9jYXRpb25NZXNzYWdlJywgJ1JlbmFtaW5nIGB7MH1gIHRvIGB7MX1gJywgaW5wdXQuc3ltYm9sLCBpbnB1dC5uZXdOYW1lKSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGlucHV0ID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElSZW5hbWVUb29sSW5wdXQ7XG5cblx0XHQvLyAtLS0gcmVzb2x2ZSBVUkkgLS0tXG5cdFx0Y29uc3QgdXJpID0gcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpKGlucHV0LCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZSwgaW52b2NhdGlvbi5jb250ZXh0Py53b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXVyaSkge1xuXHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KCdQcm92aWRlIGVpdGhlciBcInVyaVwiIChhIGZ1bGwgVVJJKSBvciBcImZpbGVQYXRoXCIgKGEgd29ya3NwYWNlLXJlbGF0aXZlIHBhdGgpIHRvIGlkZW50aWZ5IHRoZSBmaWxlLicpO1xuXHRcdH1cblxuXHRcdC8vIC0tLSBvcGVuIHRleHQgbW9kZWwgLS0tXG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh1cmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXG5cdFx0XHRpZiAoIXRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlbmFtZVByb3ZpZGVyLmhhcyhtb2RlbCkpIHtcblx0XHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KGBObyByZW5hbWUgcHJvdmlkZXIgYXZhaWxhYmxlIGZvciB0aGlzIGZpbGUncyBsYW5ndWFnZS4gVGhlIHJlbmFtZSB0b29sIG1heSBub3Qgc3VwcG9ydCB0aGlzIGxhbmd1YWdlLmApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAtLS0gZmluZCBsaW5lIGNvbnRhaW5pbmcgbGluZUNvbnRlbnQgLS0tXG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gZmluZExpbmVOdW1iZXIobW9kZWwsIGlucHV0LmxpbmVDb250ZW50KTtcblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KGBDb3VsZCBub3QgZmluZCBsaW5lIGNvbnRlbnQgXCIke2lucHV0LmxpbmVDb250ZW50fVwiIGluICR7dXJpLnRvU3RyaW5nKCl9LiBQcm92aWRlIHRoZSBleGFjdCB0ZXh0IGZyb20gdGhlIGxpbmUgd2hlcmUgdGhlIHN5bWJvbCBhcHBlYXJzLmApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAtLS0gZmluZCBzeW1ib2wgaW4gdGhhdCBsaW5lIC0tLVxuXHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGNvbHVtbiA9IGZpbmRTeW1ib2xDb2x1bW4obGluZVRleHQsIGlucHV0LnN5bWJvbCk7XG5cdFx0XHRpZiAoY29sdW1uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KGBDb3VsZCBub3QgZmluZCBzeW1ib2wgXCIke2lucHV0LnN5bWJvbH1cIiBpbiB0aGUgbWF0Y2hlZCBsaW5lLiBFbnN1cmUgdGhlIHN5bWJvbCBuYW1lIGlzIGNvcnJlY3QgYW5kIGFwcGVhcnMgaW4gdGhlIHByb3ZpZGVkIGxpbmUgY29udGVudC5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblxuXHRcdFx0Ly8gLS0tIHBlcmZvcm0gcmVuYW1lIC0tLVxuXHRcdFx0Y29uc3QgcmVuYW1lUmVzdWx0ID0gYXdhaXQgcmVuYW1lKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlbmFtZVByb3ZpZGVyLCBtb2RlbCwgcG9zaXRpb24sIGlucHV0Lm5ld05hbWUpO1xuXG5cdFx0XHRpZiAocmVuYW1lUmVzdWx0LnJlamVjdFJlYXNvbikge1xuXHRcdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQoYFJlbmFtZSByZWplY3RlZDogJHtyZW5hbWVSZXN1bHQucmVqZWN0UmVhc29ufWApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVuYW1lUmVzdWx0LmVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQoYFJlbmFtZSBwcm9kdWNlZCBubyBlZGl0cy5gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gLS0tIGFwcGx5IGVkaXRzIHZpYSBjaGF0IHJlc3BvbnNlIHN0cmVhbSAtLS1cblx0XHRcdGlmIChpbnZvY2F0aW9uLmNvbnRleHQpIHtcblx0XHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihpbnZvY2F0aW9uLmNvbnRleHQuc2Vzc2lvblJlc291cmNlKSBhcyBDaGF0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3QgPSBjaGF0TW9kZWw/LmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXG5cdFx0XHRcdGlmIChjaGF0TW9kZWwgJiYgcmVxdWVzdCkge1xuXHRcdFx0XHRcdC8vIEdyb3VwIHRleHQgZWRpdHMgYnkgVVJJXG5cdFx0XHRcdFx0Y29uc3QgZWRpdHNCeVVyaSA9IG5ldyBSZXNvdXJjZU1hcDxUZXh0RWRpdFtdPigpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiByZW5hbWVSZXN1bHQuZWRpdHMpIHtcblx0XHRcdFx0XHRcdGlmIChSZXNvdXJjZVRleHRFZGl0LmlzKGVkaXQpKSB7XG5cdFx0XHRcdFx0XHRcdGxldCBlZGl0cyA9IGVkaXRzQnlVcmkuZ2V0KGVkaXQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIWVkaXRzKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZWRpdHMgPSBbXTtcblx0XHRcdFx0XHRcdFx0XHRlZGl0c0J5VXJpLnNldChlZGl0LnJlc291cmNlLCBlZGl0cyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0ZWRpdHMucHVzaChlZGl0LnRleHRFZGl0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBQdXNoIGVkaXRzIHRocm91Z2ggdGhlIGNoYXQgcmVzcG9uc2Ugc3RyZWFtXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBbZWRpdFVyaSwgZWRpdHNdIG9mIGVkaXRzQnlVcmkpIHtcblx0XHRcdFx0XHRcdGNoYXRNb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdFx0XHRcdFx0dXJpOiBlZGl0VXJpLFxuXHRcdFx0XHRcdFx0XHRlZGl0czogW10sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGNoYXRNb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdFx0XHRcdFx0dXJpOiBlZGl0VXJpLFxuXHRcdFx0XHRcdFx0XHRlZGl0cyxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0Y2hhdE1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwge1xuXHRcdFx0XHRcdFx0XHRraW5kOiAndGV4dEVkaXQnLFxuXHRcdFx0XHRcdFx0XHR1cmk6IGVkaXRVcmksXG5cdFx0XHRcdFx0XHRcdGVkaXRzOiBbXSxcblx0XHRcdFx0XHRcdFx0ZG9uZTogdHJ1ZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9zdWNjZXNzUmVzdWx0KGlucHV0LCBlZGl0c0J5VXJpLnNpemUsIHJlbmFtZVJlc3VsdC5lZGl0cy5sZW5ndGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZhbGxiYWNrOiBhcHBseSB2aWEgYnVsayBlZGl0IHNlcnZpY2Ugd2hlbiBubyBjaGF0IGNvbnRleHQgaXMgYXZhaWxhYmxlXG5cdFx0XHRhd2FpdCB0aGlzLl9idWxrRWRpdFNlcnZpY2UuYXBwbHkocmVuYW1lUmVzdWx0KTtcblx0XHRcdGNvbnN0IGZpbGVDb3VudCA9IG5ldyBSZXNvdXJjZVNldChyZW5hbWVSZXN1bHQuZWRpdHMuZmlsdGVyKFJlc291cmNlVGV4dEVkaXQuaXMpLm1hcChlID0+IGUucmVzb3VyY2UpKS5zaXplO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3N1Y2Nlc3NSZXN1bHQoaW5wdXQsIGZpbGVDb3VudCwgcmVuYW1lUmVzdWx0LmVkaXRzLmxlbmd0aCk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdWNjZXNzUmVzdWx0KGlucHV0OiBJUmVuYW1lVG9vbElucHV0LCBmaWxlQ291bnQ6IG51bWJlciwgZWRpdENvdW50OiBudW1iZXIpOiBJVG9vbFJlc3VsdCB7XG5cdFx0Y29uc3QgdGV4dCA9IGVkaXRDb3VudCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgndG9vbC5yZW5hbWUub25lRWRpdCcsIFwiUmVuYW1lZCBgezB9YCB0byBgezF9YCAtIDEgZWRpdCBpbiB7Mn0gZmlsZS5cIiwgaW5wdXQuc3ltYm9sLCBpbnB1dC5uZXdOYW1lLCBmaWxlQ291bnQpXG5cdFx0XHQ6IGxvY2FsaXplKCd0b29sLnJlbmFtZS5lZGl0cycsIFwiUmVuYW1lZCBgezB9YCB0byBgezF9YCAtIHsyfSBlZGl0cyBhY3Jvc3MgezN9IGZpbGVzLlwiLCBpbnB1dC5zeW1ib2wsIGlucHV0Lm5ld05hbWUsIGVkaXRDb3VudCwgZmlsZUNvdW50KTtcblx0XHRjb25zdCByZXN1bHQgPSBjcmVhdGVUb29sU2ltcGxlVGV4dFJlc3VsdCh0ZXh0KTtcblx0XHRyZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcodGV4dCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG59XG5cblxuXG5leHBvcnQgY2xhc3MgUmVuYW1lVG9vbENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnY2hhdC5yZW5hbWVUb29sJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCByZW5hbWVUb29sID0gdGhpcy5fc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbmFtZVRvb2wpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbChyZW5hbWVUb29sLmdldFRvb2xEYXRhKCksIHJlbmFtZVRvb2wpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQThCLDRCQUE0SSxzQkFBb0M7QUFDOU0sU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxhQUFhLGdCQUFnQixrQkFBb0MsZ0NBQWdDO0FBRW5HLE1BQU0sZUFBZTtBQU01QixNQUFNLHVCQUF1QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFrQjdCLE1BQU0seUJBQXlCLHVCQUF1QjtBQUFBO0FBQUE7QUFJL0MsSUFBTSxhQUFOLGNBQXlCLFdBQWdDO0FBQUEsRUFFL0QsWUFDNEMsMEJBQ1AsbUJBQ08sMEJBQ1osY0FDSSxrQkFDbEM7QUFDRCxVQUFNO0FBTnFDO0FBQ1A7QUFDTztBQUNaO0FBQ0k7QUFBQSxFQUdwQztBQUFBLEVBRUEsY0FBeUI7QUFDeEIsV0FBTyxLQUFLO0FBQUEsTUFDWDtBQUFBLE1BQ0EsU0FBUywrQkFBK0Isc0NBQXNDO0FBQUEsSUFDL0U7QUFBQSxFQUNEO0FBQUEsRUFFUSxlQUFlLGtCQUEwQixpQkFBb0M7QUFDcEYsV0FBTztBQUFBLE1BQ04sSUFBSTtBQUFBLE1BQ0osbUJBQW1CO0FBQUEsTUFDbkIseUJBQXlCO0FBQUEsTUFDekIsTUFBTSxVQUFVLE9BQU8sUUFBUSxP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
