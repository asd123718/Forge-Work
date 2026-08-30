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
import { basename } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { SymbolKinds } from "../../../../../editor/common/languages.js";
import { localize } from "../../../../../nls.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { MarkerSeverity } from "../../../../../platform/markers/common/markers.js";
import { isUntitledResourceEditorInput } from "../../../../common/editor.js";
import { EditorInput } from "../../../../common/editor/editorInput.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IExtensionService, isProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import { UntitledTextEditorInput } from "../../../../services/untitled/common/untitledTextEditorInput.js";
import { createNotebookOutputVariableEntry, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST } from "../../../notebook/browser/contrib/chat/notebookChatUtils.js";
import { getOutputViewModelFromId } from "../../../notebook/browser/controller/cellOutputActions.js";
import { getNotebookEditorFromEditorPane } from "../../../notebook/browser/notebookBrowser.js";
import { CHAT_ATTACHABLE_IMAGE_MIME_TYPES, getAttachableImageExtension } from "../../common/model/chatModel.js";
import { OmittedState, IDiagnosticVariableEntryFilterData } from "../../common/attachments/chatVariableEntries.js";
import { imageToHash } from "../widget/input/editor/chatPasteProviders.js";
import { resizeImage } from "../chatImageUtils.js";
import { BrowserViewUri } from "../../../../../platform/browserView/common/browserViewUri.js";
import { BrowserEditorInput } from "../../../browserView/common/browserEditorInput.js";
import { BrowserViewSharingState, IBrowserViewWorkbenchService } from "../../../browserView/common/browserView.js";
const IChatAttachmentResolveService = createDecorator("IChatAttachmentResolveService");
let ChatAttachmentResolveService = class {
  constructor(fileService, editorService, extensionService, dialogService, browserViewService) {
    this.fileService = fileService;
    this.editorService = editorService;
    this.extensionService = extensionService;
    this.dialogService = dialogService;
    this.browserViewService = browserViewService;
  }
  // --- EDITORS ---
  async resolveEditorAttachContext(editor) {
    if (!(editor instanceof EditorInput) && editor.options?.override === BrowserEditorInput.EDITOR_ID) {
      const browserEditor = [...this.browserViewService.getKnownBrowserViews().values()].find((candidate) => candidate.matches(editor));
      if (!browserEditor) {
        return void 0;
      }
      editor = browserEditor;
    }
    if (isUntitledResourceEditorInput(editor)) {
      return await this.resolveUntitledEditorAttachContext(editor);
    }
    if (!editor.resource) {
      return void 0;
    }
    const browser = BrowserViewUri.parse(editor.resource);
    if (browser) {
      return await this.resolveBrowserViewAttachContext(browser.id);
    }
    let stat;
    try {
      stat = await this.fileService.stat(editor.resource);
    } catch {
      return void 0;
    }
    if (!stat.isDirectory && !stat.isFile) {
      return void 0;
    }
    const imageContext = await this.resolveImageEditorAttachContext(editor.resource);
    if (imageContext) {
      return this.extensionService.extensions.some((ext) => isProposedApiEnabled(ext, "chatReferenceBinaryData")) ? imageContext : void 0;
    }
    return await this.resolveResourceAttachContext(editor.resource, stat.isDirectory);
  }
  async resolveUntitledEditorAttachContext(editor) {
    if (editor.resource) {
      return await this.resolveResourceAttachContext(editor.resource, false);
    }
    const openUntitledEditors = this.editorService.editors.filter((editor2) => editor2 instanceof UntitledTextEditorInput);
    for (const canidate of openUntitledEditors) {
      const model = await canidate.resolve();
      const contents = model.textEditorModel?.getValue();
      if (contents === editor.contents) {
        return await this.resolveResourceAttachContext(canidate.resource, false);
      }
    }
    return void 0;
  }
  async resolveResourceAttachContext(resource, isDirectory) {
    let omittedState = OmittedState.NotOmitted;
    if (!isDirectory) {
      if (/\.(svg)$/i.test(resource.path)) {
        omittedState = OmittedState.Full;
      }
    }
    return {
      kind: isDirectory ? "directory" : "file",
      value: resource,
      id: resource.toString(),
      name: basename(resource),
      omittedState
    };
  }
  async resolveBrowserViewAttachContext(browserId) {
    const views = this.browserViewService.getKnownBrowserViews();
    const editor = views.get(browserId);
    if (!editor) {
      return void 0;
    }
    if (!editor.model) {
      await editor.resolve();
    }
    const model = editor.model;
    if (!model) {
      return void 0;
    }
    if (model.sharingState === BrowserViewSharingState.NotShared) {
      if (!await model.setSharedWithAgent(true)) {
        return void 0;
      }
    }
    return {
      kind: "browserView",
      id: editor.resource.toString(),
      name: editor.getName(),
      value: editor.resource,
      browserId: editor.id,
      modelDescription: `Browser page: ${editor.getTitle()}. The pageId is "${editor.id}".`
    };
  }
  // --- IMAGES ---
  async resolveImageEditorAttachContext(resource, data, mimeType) {
    if (!resource) {
      return void 0;
    }
    if (mimeType) {
      if (!getAttachableImageExtension(mimeType)) {
        return void 0;
      }
    } else {
      const match = SUPPORTED_IMAGE_EXTENSIONS_REGEX.exec(resource.path);
      if (!match) {
        return void 0;
      }
      mimeType = getMimeTypeFromPath(match);
    }
    const fileName = basename(resource);
    let dataBuffer;
    if (data) {
      dataBuffer = data;
    } else {
      let stat;
      try {
        stat = await this.fileService.stat(resource);
      } catch {
        return void 0;
      }
      const readFile = await this.fileService.readFile(resource);
      if (stat.size > 30 * 1024 * 1024) {
        this.dialogService.error(localize("imageTooLarge", "Image is too large"), localize("imageTooLargeMessage", "The image {0} is too large to be attached.", fileName));
        throw new Error("Image is too large");
      }
      dataBuffer = readFile.value;
    }
    const isPartiallyOmitted = /\.gif$/i.test(resource.path);
    const imageFileContext = await this.resolveImageAttachContext([{
      id: resource.toString(),
      name: fileName,
      data: dataBuffer.buffer,
      icon: Codicon.fileMedia,
      resource,
      mimeType,
      omittedState: isPartiallyOmitted ? OmittedState.Partial : OmittedState.NotOmitted
    }]);
    return imageFileContext[0];
  }
  resolveImageAttachContext(images) {
    return Promise.all(images.map(async (image) => ({
      id: image.id || await imageToHash(image.data),
      name: image.name,
      fullName: image.resource ? image.resource.path : void 0,
      value: await resizeImage(image.data, image.mimeType),
      icon: image.icon,
      kind: "image",
      isFile: false,
      isDirectory: false,
      omittedState: image.omittedState || OmittedState.NotOmitted,
      references: image.resource ? [{ reference: image.resource, kind: "reference" }] : []
    })));
  }
  // --- MARKERS ---
  resolveMarkerAttachContext(markers) {
    return markers.map((marker) => {
      let filter;
      if (!("severity" in marker)) {
        filter = { filterUri: URI.revive(marker.uri), filterSeverity: MarkerSeverity.Warning };
      } else {
        filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
      }
      return IDiagnosticVariableEntryFilterData.toEntry(filter);
    });
  }
  // --- SYMBOLS ---
  resolveSymbolsAttachContext(symbols) {
    return symbols.map((symbol) => {
      const resource = URI.file(symbol.fsPath);
      return {
        kind: "symbol",
        id: symbolId(resource, symbol.range),
        value: { uri: resource, range: symbol.range },
        symbolKind: symbol.kind,
        icon: SymbolKinds.toIcon(symbol.kind),
        fullName: symbol.name,
        name: symbol.name
      };
    });
  }
  // --- NOTEBOOKS ---
  resolveNotebookOutputAttachContext(data) {
    const notebookEditor = getNotebookEditorFromEditorPane(this.editorService.activeEditorPane);
    if (!notebookEditor) {
      return [];
    }
    const outputViewModel = getOutputViewModelFromId(data.outputId, notebookEditor);
    if (!outputViewModel) {
      return [];
    }
    const mimeType = outputViewModel.pickedMimeType?.mimeType;
    if (mimeType && NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST.includes(mimeType)) {
      const entry = createNotebookOutputVariableEntry(outputViewModel, mimeType, notebookEditor);
      if (!entry) {
        return [];
      }
      return [entry];
    }
    return [];
  }
  // --- DIRECTORIES ---
  async resolveDirectoryImages(directoryUri) {
    const imageEntries = [];
    await this._collectDirectoryImages(directoryUri, imageEntries);
    return imageEntries;
  }
  async _collectDirectoryImages(directoryUri, results) {
    let stat;
    try {
      stat = await this.fileService.resolve(directoryUri);
    } catch {
      return;
    }
    if (!stat.children) {
      return;
    }
    const childPromises = [];
    for (const child of stat.children) {
      if (child.isDirectory && !child.isSymbolicLink) {
        childPromises.push(this._collectDirectoryImages(child.resource, results));
      } else if (child.isFile && !child.isSymbolicLink && SUPPORTED_IMAGE_EXTENSIONS_REGEX.test(child.resource.path)) {
        childPromises.push(
          this.resolveImageEditorAttachContext(child.resource).then((entry) => {
            if (entry) {
              results.push(entry);
            }
          }).catch(() => {
          })
        );
      }
    }
    await Promise.all(childPromises);
  }
  // --- SOURCE CONTROL ---
  resolveSourceControlHistoryItemAttachContext(data) {
    return data.map((d) => ({
      id: d.historyItem.id,
      name: d.name,
      value: URI.revive(d.resource),
      historyItem: {
        ...d.historyItem,
        references: []
      },
      kind: "scmHistoryItem"
    }));
  }
};
ChatAttachmentResolveService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IBrowserViewWorkbenchService)
], ChatAttachmentResolveService);
function symbolId(resource, range) {
  let rangePart = "";
  if (range) {
    rangePart = `:${range.startLineNumber}`;
    if (range.startLineNumber !== range.endLineNumber) {
      rangePart += `-${range.endLineNumber}`;
    }
  }
  return resource.fsPath + rangePart;
}
const SUPPORTED_IMAGE_EXTENSIONS_REGEX = new RegExp(`\\.(${Object.keys(CHAT_ATTACHABLE_IMAGE_MIME_TYPES).join("|")})$`, "i");
function getMimeTypeFromPath(match) {
  const ext = match[1].toLowerCase();
  return CHAT_ATTACHABLE_IMAGE_MIME_TYPES[ext];
}
export {
  ChatAttachmentResolveService,
  IChatAttachmentResolveService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGF0dGFjaG1lbnRzXFxjaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFN5bWJvbEtpbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElEcmFnZ2VkUmVzb3VyY2VFZGl0b3JJbnB1dCwgTWFya2VyVHJhbnNmZXJEYXRhLCBEb2N1bWVudFN5bWJvbFRyYW5zZmVyRGF0YSwgTm90ZWJvb2tDZWxsT3V0cHV0VHJhbnNmZXJEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBpc1VudGl0bGVkUmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgY3JlYXRlTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5LCBOT1RFQk9PS19DRUxMX09VVFBVVF9NSU1FX1RZUEVfTElTVF9GT1JfQ0hBVF9DT05TVCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9jaGF0L25vdGVib29rQ2hhdFV0aWxzLmpzJztcbmltcG9ydCB7IGdldE91dHB1dFZpZXdNb2RlbEZyb21JZCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvY29udHJvbGxlci9jZWxsT3V0cHV0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgU0NNSGlzdG9yeUl0ZW1UcmFuc2ZlckRhdGEgfSBmcm9tICcuLi8uLi8uLi9zY20vYnJvd3Nlci9zY21IaXN0b3J5Q2hhdENvbnRleHQuanMnO1xuaW1wb3J0IHsgQ0hBVF9BVFRBQ0hBQkxFX0lNQUdFX01JTUVfVFlQRVMsIGdldEF0dGFjaGFibGVJbWFnZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3VmFyaWFibGVFbnRyeSwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgT21pdHRlZFN0YXRlLCBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnksIElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEsIElTeW1ib2xWYXJpYWJsZUVudHJ5LCBJU0NNSGlzdG9yeUl0ZW1WYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgaW1hZ2VUb0hhc2ggfSBmcm9tICcuLi93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRQYXN0ZVByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyByZXNpemVJbWFnZSB9IGZyb20gJy4uL2NoYXRJbWFnZVV0aWxzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3VXJpLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUsIElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuXG5leHBvcnQgY29uc3QgSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2U+KCdJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlc29sdmVFZGl0b3JBdHRhY2hDb250ZXh0KGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJRHJhZ2dlZFJlc291cmNlRWRpdG9ySW5wdXQpOiBQcm9taXNlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQ+O1xuXHRyZXNvbHZlVW50aXRsZWRFZGl0b3JBdHRhY2hDb250ZXh0KGVkaXRvcjogSURyYWdnZWRSZXNvdXJjZUVkaXRvcklucHV0KTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPjtcblx0cmVzb2x2ZVJlc291cmNlQXR0YWNoQ29udGV4dChyZXNvdXJjZTogVVJJLCBpc0RpcmVjdG9yeTogYm9vbGVhbik6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZD47XG5cdHJlc29sdmVCcm93c2VyVmlld0F0dGFjaENvbnRleHQoYnJvd3NlcklkOiBzdHJpbmcpOiBQcm9taXNlPElCcm93c2VyVmlld1ZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQ+O1xuXG5cdHJlc29sdmVJbWFnZUVkaXRvckF0dGFjaENvbnRleHQocmVzb3VyY2U6IFVSSSwgZGF0YT86IFZTQnVmZmVyLCBtaW1lVHlwZT86IHN0cmluZyk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZD47XG5cdHJlc29sdmVJbWFnZUF0dGFjaENvbnRleHQoaW1hZ2VzOiBJbWFnZVRyYW5zZmVyRGF0YVtdKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10+O1xuXHRyZXNvbHZlTWFya2VyQXR0YWNoQ29udGV4dChtYXJrZXJzOiBNYXJrZXJUcmFuc2ZlckRhdGFbXSk6IElEaWFnbm9zdGljVmFyaWFibGVFbnRyeVtdO1xuXHRyZXNvbHZlU3ltYm9sc0F0dGFjaENvbnRleHQoc3ltYm9sczogRG9jdW1lbnRTeW1ib2xUcmFuc2ZlckRhdGFbXSk6IElTeW1ib2xWYXJpYWJsZUVudHJ5W107XG5cdHJlc29sdmVOb3RlYm9va091dHB1dEF0dGFjaENvbnRleHQoZGF0YTogTm90ZWJvb2tDZWxsT3V0cHV0VHJhbnNmZXJEYXRhKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xuXHRyZXNvbHZlU291cmNlQ29udHJvbEhpc3RvcnlJdGVtQXR0YWNoQ29udGV4dChkYXRhOiBTQ01IaXN0b3J5SXRlbVRyYW5zZmVyRGF0YVtdKTogSVNDTUhpc3RvcnlJdGVtVmFyaWFibGVFbnRyeVtdO1xuXHRyZXNvbHZlRGlyZWN0b3J5SW1hZ2VzKGRpcmVjdG9yeVVyaTogVVJJKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10+O1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSBpbXBsZW1lbnRzIElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgYnJvd3NlclZpZXdTZXJ2aWNlOiBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdC8vIC0tLSBFRElUT1JTIC0tLVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlRWRpdG9yQXR0YWNoQ29udGV4dChlZGl0b3I6IEVkaXRvcklucHV0IHwgSURyYWdnZWRSZXNvdXJjZUVkaXRvcklucHV0KTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCEoZWRpdG9yIGluc3RhbmNlb2YgRWRpdG9ySW5wdXQpICYmIGVkaXRvci5vcHRpb25zPy5vdmVycmlkZSA9PT0gQnJvd3NlckVkaXRvcklucHV0LkVESVRPUl9JRCkge1xuXHRcdFx0Y29uc3QgYnJvd3NlckVkaXRvciA9IFsuLi50aGlzLmJyb3dzZXJWaWV3U2VydmljZS5nZXRLbm93bkJyb3dzZXJWaWV3cygpLnZhbHVlcygpXS5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUubWF0Y2hlcyhlZGl0b3IpKTtcblx0XHRcdGlmICghYnJvd3NlckVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0ZWRpdG9yID0gYnJvd3NlckVkaXRvcjtcblx0XHR9XG5cblx0XHQvLyB1bnRpdGxlZCBlZGl0b3Jcblx0XHRpZiAoaXNVbnRpdGxlZFJlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMucmVzb2x2ZVVudGl0bGVkRWRpdG9yQXR0YWNoQ29udGV4dChlZGl0b3IpO1xuXHRcdH1cblxuXHRcdGlmICghZWRpdG9yLnJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJyb3dzZXIgPSBCcm93c2VyVmlld1VyaS5wYXJzZShlZGl0b3IucmVzb3VyY2UpO1xuXHRcdGlmIChicm93c2VyKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5yZXNvbHZlQnJvd3NlclZpZXdBdHRhY2hDb250ZXh0KGJyb3dzZXIuaWQpO1xuXHRcdH1cblxuXHRcdGxldCBzdGF0O1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KGVkaXRvci5yZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghc3RhdC5pc0RpcmVjdG9yeSAmJiAhc3RhdC5pc0ZpbGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW1hZ2VDb250ZXh0ID0gYXdhaXQgdGhpcy5yZXNvbHZlSW1hZ2VFZGl0b3JBdHRhY2hDb250ZXh0KGVkaXRvci5yZXNvdXJjZSk7XG5cdFx0aWYgKGltYWdlQ29udGV4dCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLnNvbWUoZXh0ID0+IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dCwgJ2NoYXRSZWZlcmVuY2VCaW5hcnlEYXRhJykpID8gaW1hZ2VDb250ZXh0IDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBhd2FpdCB0aGlzLnJlc29sdmVSZXNvdXJjZUF0dGFjaENvbnRleHQoZWRpdG9yLnJlc291cmNlLCBzdGF0LmlzRGlyZWN0b3J5KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlVW50aXRsZWRFZGl0b3JBdHRhY2hDb250ZXh0KGVkaXRvcjogSURyYWdnZWRSZXNvdXJjZUVkaXRvcklucHV0KTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gSWYgdGhlIHJlc291cmNlIGlzIGtub3duLCB3ZSBjYW4gdXNlIGl0IGRpcmVjdGx5XG5cdFx0aWYgKGVkaXRvci5yZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMucmVzb2x2ZVJlc291cmNlQXR0YWNoQ29udGV4dChlZGl0b3IucmVzb3VyY2UsIGZhbHNlKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UsIHdlIG5lZWQgdG8gY2hlY2sgaWYgdGhlIGNvbnRlbnRzIGFyZSBhbHJlYWR5IG9wZW4gaW4gYW5vdGhlciBlZGl0b3Jcblx0XHRjb25zdCBvcGVuVW50aXRsZWRFZGl0b3JzID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiBlZGl0b3IgaW5zdGFuY2VvZiBVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCkgYXMgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXRbXTtcblx0XHRmb3IgKGNvbnN0IGNhbmlkYXRlIG9mIG9wZW5VbnRpdGxlZEVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgY2FuaWRhdGUucmVzb2x2ZSgpO1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSBtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LmdldFZhbHVlKCk7XG5cdFx0XHRpZiAoY29udGVudHMgPT09IGVkaXRvci5jb250ZW50cykge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5yZXNvbHZlUmVzb3VyY2VBdHRhY2hDb250ZXh0KGNhbmlkYXRlLnJlc291cmNlLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlUmVzb3VyY2VBdHRhY2hDb250ZXh0KHJlc291cmNlOiBVUkksIGlzRGlyZWN0b3J5OiBib29sZWFuKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IG9taXR0ZWRTdGF0ZSA9IE9taXR0ZWRTdGF0ZS5Ob3RPbWl0dGVkO1xuXG5cdFx0aWYgKCFpc0RpcmVjdG9yeSkge1xuXHRcdFx0aWYgKC9cXC4oc3ZnKSQvaS50ZXN0KHJlc291cmNlLnBhdGgpKSB7XG5cdFx0XHRcdG9taXR0ZWRTdGF0ZSA9IE9taXR0ZWRTdGF0ZS5GdWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiBpc0RpcmVjdG9yeSA/ICdkaXJlY3RvcnknIDogJ2ZpbGUnLFxuXHRcdFx0dmFsdWU6IHJlc291cmNlLFxuXHRcdFx0aWQ6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRuYW1lOiBiYXNlbmFtZShyZXNvdXJjZSksXG5cdFx0XHRvbWl0dGVkU3RhdGVcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc29sdmVCcm93c2VyVmlld0F0dGFjaENvbnRleHQoYnJvd3NlcklkOiBzdHJpbmcpOiBQcm9taXNlPElCcm93c2VyVmlld1ZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB2aWV3cyA9IHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmdldEtub3duQnJvd3NlclZpZXdzKCk7XG5cdFx0Y29uc3QgZWRpdG9yID0gdmlld3MuZ2V0KGJyb3dzZXJJZCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRoZSBtb2RlbCBpcyByZXNvbHZlZCBzbyB3ZSBjYW4gcHJvbXB0IGZvciBzaGFyaW5nXG5cdFx0aWYgKCFlZGl0b3IubW9kZWwpIHtcblx0XHRcdGF3YWl0IGVkaXRvci5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLm1vZGVsO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvbXB0IHVzZXIgdG8gc2hhcmUgdGhlIHBhZ2Ugd2l0aCB0aGUgYWdlbnQgaWYgbm90IGFscmVhZHkgc2hhcmVkXG5cdFx0aWYgKG1vZGVsLnNoYXJpbmdTdGF0ZSA9PT0gQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuTm90U2hhcmVkKSB7XG5cdFx0XHRpZiAoIShhd2FpdCBtb2RlbC5zZXRTaGFyZWRXaXRoQWdlbnQodHJ1ZSkpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIFVzZXIgZGVuaWVkIHNoYXJpbmdcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2Jyb3dzZXJWaWV3Jyxcblx0XHRcdGlkOiBlZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdG5hbWU6IGVkaXRvci5nZXROYW1lKCksXG5cdFx0XHR2YWx1ZTogZWRpdG9yLnJlc291cmNlLFxuXHRcdFx0YnJvd3NlcklkOiBlZGl0b3IuaWQsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBgQnJvd3NlciBwYWdlOiAke2VkaXRvci5nZXRUaXRsZSgpfS4gVGhlIHBhZ2VJZCBpcyBcIiR7ZWRpdG9yLmlkfVwiLmBcblx0XHR9O1xuXHR9XG5cblx0Ly8gLS0tIElNQUdFUyAtLS1cblxuXHRwdWJsaWMgYXN5bmMgcmVzb2x2ZUltYWdlRWRpdG9yQXR0YWNoQ29udGV4dChyZXNvdXJjZTogVVJJLCBkYXRhPzogVlNCdWZmZXIsIG1pbWVUeXBlPzogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAobWltZVR5cGUpIHtcblx0XHRcdGlmICghZ2V0QXR0YWNoYWJsZUltYWdlRXh0ZW5zaW9uKG1pbWVUeXBlKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IFNVUFBPUlRFRF9JTUFHRV9FWFRFTlNJT05TX1JFR0VYLmV4ZWMocmVzb3VyY2UucGF0aCk7XG5cdFx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdG1pbWVUeXBlID0gZ2V0TWltZVR5cGVGcm9tUGF0aChtYXRjaCk7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbGVOYW1lID0gYmFzZW5hbWUocmVzb3VyY2UpO1xuXG5cdFx0bGV0IGRhdGFCdWZmZXI6IFZTQnVmZmVyIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHRkYXRhQnVmZmVyID0gZGF0YTtcblx0XHR9IGVsc2Uge1xuXG5cdFx0XHRsZXQgc3RhdDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQocmVzb3VyY2UpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlYWRGaWxlID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cblx0XHRcdGlmIChzdGF0LnNpemUgPiAzMCAqIDEwMjQgKiAxMDI0KSB7IC8vIDMwIE1CXG5cdFx0XHRcdHRoaXMuZGlhbG9nU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnaW1hZ2VUb29MYXJnZScsICdJbWFnZSBpcyB0b28gbGFyZ2UnKSwgbG9jYWxpemUoJ2ltYWdlVG9vTGFyZ2VNZXNzYWdlJywgJ1RoZSBpbWFnZSB7MH0gaXMgdG9vIGxhcmdlIHRvIGJlIGF0dGFjaGVkLicsIGZpbGVOYW1lKSk7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW1hZ2UgaXMgdG9vIGxhcmdlJyk7XG5cdFx0XHR9XG5cblx0XHRcdGRhdGFCdWZmZXIgPSByZWFkRmlsZS52YWx1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBpc1BhcnRpYWxseU9taXR0ZWQgPSAvXFwuZ2lmJC9pLnRlc3QocmVzb3VyY2UucGF0aCk7XG5cdFx0Y29uc3QgaW1hZ2VGaWxlQ29udGV4dCA9IGF3YWl0IHRoaXMucmVzb2x2ZUltYWdlQXR0YWNoQ29udGV4dChbe1xuXHRcdFx0aWQ6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRuYW1lOiBmaWxlTmFtZSxcblx0XHRcdGRhdGE6IGRhdGFCdWZmZXIuYnVmZmVyLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5maWxlTWVkaWEsXG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRtaW1lVHlwZTogbWltZVR5cGUsXG5cdFx0XHRvbWl0dGVkU3RhdGU6IGlzUGFydGlhbGx5T21pdHRlZCA/IE9taXR0ZWRTdGF0ZS5QYXJ0aWFsIDogT21pdHRlZFN0YXRlLk5vdE9taXR0ZWRcblx0XHR9XSk7XG5cblx0XHRyZXR1cm4gaW1hZ2VGaWxlQ29udGV4dFswXTtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlSW1hZ2VBdHRhY2hDb250ZXh0KGltYWdlczogSW1hZ2VUcmFuc2ZlckRhdGFbXSk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdPiB7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKGltYWdlcy5tYXAoYXN5bmMgaW1hZ2UgPT4gKHtcblx0XHRcdGlkOiBpbWFnZS5pZCB8fCBhd2FpdCBpbWFnZVRvSGFzaChpbWFnZS5kYXRhKSxcblx0XHRcdG5hbWU6IGltYWdlLm5hbWUsXG5cdFx0XHRmdWxsTmFtZTogaW1hZ2UucmVzb3VyY2UgPyBpbWFnZS5yZXNvdXJjZS5wYXRoIDogdW5kZWZpbmVkLFxuXHRcdFx0dmFsdWU6IGF3YWl0IHJlc2l6ZUltYWdlKGltYWdlLmRhdGEsIGltYWdlLm1pbWVUeXBlKSxcblx0XHRcdGljb246IGltYWdlLmljb24sXG5cdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0aXNGaWxlOiBmYWxzZSxcblx0XHRcdGlzRGlyZWN0b3J5OiBmYWxzZSxcblx0XHRcdG9taXR0ZWRTdGF0ZTogaW1hZ2Uub21pdHRlZFN0YXRlIHx8IE9taXR0ZWRTdGF0ZS5Ob3RPbWl0dGVkLFxuXHRcdFx0cmVmZXJlbmNlczogaW1hZ2UucmVzb3VyY2UgPyBbeyByZWZlcmVuY2U6IGltYWdlLnJlc291cmNlLCBraW5kOiAncmVmZXJlbmNlJyB9XSA6IFtdXG5cdFx0fSkpKTtcblx0fVxuXG5cdC8vIC0tLSBNQVJLRVJTIC0tLVxuXG5cdHB1YmxpYyByZXNvbHZlTWFya2VyQXR0YWNoQ29udGV4dChtYXJrZXJzOiBNYXJrZXJUcmFuc2ZlckRhdGFbXSk6IElEaWFnbm9zdGljVmFyaWFibGVFbnRyeVtdIHtcblx0XHRyZXR1cm4gbWFya2Vycy5tYXAoKG1hcmtlcik6IElEaWFnbm9zdGljVmFyaWFibGVFbnRyeSA9PiB7XG5cdFx0XHRsZXQgZmlsdGVyOiBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhO1xuXHRcdFx0aWYgKCEoJ3NldmVyaXR5JyBpbiBtYXJrZXIpKSB7XG5cdFx0XHRcdGZpbHRlciA9IHsgZmlsdGVyVXJpOiBVUkkucmV2aXZlKG1hcmtlci51cmkpLCBmaWx0ZXJTZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuV2FybmluZyB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZmlsdGVyID0gSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YS5mcm9tTWFya2VyKG1hcmtlcik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhLnRvRW50cnkoZmlsdGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLSBTWU1CT0xTIC0tLVxuXG5cdHB1YmxpYyByZXNvbHZlU3ltYm9sc0F0dGFjaENvbnRleHQoc3ltYm9sczogRG9jdW1lbnRTeW1ib2xUcmFuc2ZlckRhdGFbXSk6IElTeW1ib2xWYXJpYWJsZUVudHJ5W10ge1xuXHRcdHJldHVybiBzeW1ib2xzLm1hcChzeW1ib2wgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShzeW1ib2wuZnNQYXRoKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdzeW1ib2wnLFxuXHRcdFx0XHRpZDogc3ltYm9sSWQocmVzb3VyY2UsIHN5bWJvbC5yYW5nZSksXG5cdFx0XHRcdHZhbHVlOiB7IHVyaTogcmVzb3VyY2UsIHJhbmdlOiBzeW1ib2wucmFuZ2UgfSxcblx0XHRcdFx0c3ltYm9sS2luZDogc3ltYm9sLmtpbmQsXG5cdFx0XHRcdGljb246IFN5bWJvbEtpbmRzLnRvSWNvbihzeW1ib2wua2luZCksXG5cdFx0XHRcdGZ1bGxOYW1lOiBzeW1ib2wubmFtZSxcblx0XHRcdFx0bmFtZTogc3ltYm9sLm5hbWUsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tIE5PVEVCT09LUyAtLS1cblxuXHRwdWJsaWMgcmVzb2x2ZU5vdGVib29rT3V0cHV0QXR0YWNoQ29udGV4dChkYXRhOiBOb3RlYm9va0NlbGxPdXRwdXRUcmFuc2ZlckRhdGEpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10ge1xuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0aWYgKCFub3RlYm9va0VkaXRvcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IG91dHB1dFZpZXdNb2RlbCA9IGdldE91dHB1dFZpZXdNb2RlbEZyb21JZChkYXRhLm91dHB1dElkLCBub3RlYm9va0VkaXRvcik7XG5cdFx0aWYgKCFvdXRwdXRWaWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBtaW1lVHlwZSA9IG91dHB1dFZpZXdNb2RlbC5waWNrZWRNaW1lVHlwZT8ubWltZVR5cGU7XG5cdFx0aWYgKG1pbWVUeXBlICYmIE5PVEVCT09LX0NFTExfT1VUUFVUX01JTUVfVFlQRV9MSVNUX0ZPUl9DSEFUX0NPTlNULmluY2x1ZGVzKG1pbWVUeXBlKSkge1xuXG5cdFx0XHRjb25zdCBlbnRyeSA9IGNyZWF0ZU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeShvdXRwdXRWaWV3TW9kZWwsIG1pbWVUeXBlLCBub3RlYm9va0VkaXRvcik7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFtlbnRyeV07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Ly8gLS0tIERJUkVDVE9SSUVTIC0tLVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlRGlyZWN0b3J5SW1hZ2VzKGRpcmVjdG9yeVVyaTogVVJJKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10+IHtcblx0XHRjb25zdCBpbWFnZUVudHJpZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdGF3YWl0IHRoaXMuX2NvbGxlY3REaXJlY3RvcnlJbWFnZXMoZGlyZWN0b3J5VXJpLCBpbWFnZUVudHJpZXMpO1xuXHRcdHJldHVybiBpbWFnZUVudHJpZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb2xsZWN0RGlyZWN0b3J5SW1hZ2VzKGRpcmVjdG9yeVVyaTogVVJJLCByZXN1bHRzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgc3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShkaXJlY3RvcnlVcmkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoaWxkUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoY2hpbGQuaXNEaXJlY3RvcnkgJiYgIWNoaWxkLmlzU3ltYm9saWNMaW5rKSB7XG5cdFx0XHRcdGNoaWxkUHJvbWlzZXMucHVzaCh0aGlzLl9jb2xsZWN0RGlyZWN0b3J5SW1hZ2VzKGNoaWxkLnJlc291cmNlLCByZXN1bHRzKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNoaWxkLmlzRmlsZSAmJiAhY2hpbGQuaXNTeW1ib2xpY0xpbmsgJiYgU1VQUE9SVEVEX0lNQUdFX0VYVEVOU0lPTlNfUkVHRVgudGVzdChjaGlsZC5yZXNvdXJjZS5wYXRoKSkge1xuXHRcdFx0XHRjaGlsZFByb21pc2VzLnB1c2goXG5cdFx0XHRcdFx0dGhpcy5yZXNvbHZlSW1hZ2VFZGl0b3JBdHRhY2hDb250ZXh0KGNoaWxkLnJlc291cmNlKS50aGVuKGVudHJ5ID0+IHtcblx0XHRcdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHRzLnB1c2goZW50cnkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pLmNhdGNoKCgpID0+IHsgLyogc2tpcCB1bnJlYWRhYmxlIGltYWdlcyAqLyB9KVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKGNoaWxkUHJvbWlzZXMpO1xuXHR9XG5cblx0Ly8gLS0tIFNPVVJDRSBDT05UUk9MIC0tLVxuXG5cdHB1YmxpYyByZXNvbHZlU291cmNlQ29udHJvbEhpc3RvcnlJdGVtQXR0YWNoQ29udGV4dChkYXRhOiBTQ01IaXN0b3J5SXRlbVRyYW5zZmVyRGF0YVtdKTogSVNDTUhpc3RvcnlJdGVtVmFyaWFibGVFbnRyeVtdIHtcblx0XHRyZXR1cm4gZGF0YS5tYXAoZCA9PiAoe1xuXHRcdFx0aWQ6IGQuaGlzdG9yeUl0ZW0uaWQsXG5cdFx0XHRuYW1lOiBkLm5hbWUsXG5cdFx0XHR2YWx1ZTogVVJJLnJldml2ZShkLnJlc291cmNlKSxcblx0XHRcdGhpc3RvcnlJdGVtOiB7XG5cdFx0XHRcdC4uLmQuaGlzdG9yeUl0ZW0sXG5cdFx0XHRcdHJlZmVyZW5jZXM6IFtdXG5cdFx0XHR9LFxuXHRcdFx0a2luZDogJ3NjbUhpc3RvcnlJdGVtJ1xuXHRcdH0gc2F0aXNmaWVzIElTQ01IaXN0b3J5SXRlbVZhcmlhYmxlRW50cnkpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzeW1ib2xJZChyZXNvdXJjZTogVVJJLCByYW5nZT86IElSYW5nZSk6IHN0cmluZyB7XG5cdGxldCByYW5nZVBhcnQgPSAnJztcblx0aWYgKHJhbmdlKSB7XG5cdFx0cmFuZ2VQYXJ0ID0gYDoke3JhbmdlLnN0YXJ0TGluZU51bWJlcn1gO1xuXHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJhbmdlUGFydCArPSBgLSR7cmFuZ2UuZW5kTGluZU51bWJlcn1gO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzb3VyY2UuZnNQYXRoICsgcmFuZ2VQYXJ0O1xufVxuXG5leHBvcnQgdHlwZSBJbWFnZVRyYW5zZmVyRGF0YSA9IHtcblx0ZGF0YTogVWludDhBcnJheTtcblx0bmFtZTogc3RyaW5nO1xuXHRpY29uPzogVGhlbWVJY29uO1xuXHRyZXNvdXJjZT86IFVSSTtcblx0aWQ/OiBzdHJpbmc7XG5cdG1pbWVUeXBlPzogc3RyaW5nO1xuXHRvbWl0dGVkU3RhdGU/OiBPbWl0dGVkU3RhdGU7XG59O1xuY29uc3QgU1VQUE9SVEVEX0lNQUdFX0VYVEVOU0lPTlNfUkVHRVggPSBuZXcgUmVnRXhwKGBcXFxcLigke09iamVjdC5rZXlzKENIQVRfQVRUQUNIQUJMRV9JTUFHRV9NSU1FX1RZUEVTKS5qb2luKCd8Jyl9KSRgLCAnaScpO1xuXG5mdW5jdGlvbiBnZXRNaW1lVHlwZUZyb21QYXRoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBleHQgPSBtYXRjaFsxXS50b0xvd2VyQ2FzZSgpO1xuXHRyZXR1cm4gQ0hBVF9BVFRBQ0hBQkxFX0lNQUdFX01JTUVfVFlQRVNbZXh0XTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsV0FBVztBQUVwQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQiw0QkFBNEI7QUFDeEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQ0FBbUMsMERBQTBEO0FBQ3RHLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUNBQXVDO0FBRWhELFNBQVMsa0NBQWtDLG1DQUFtQztBQUM5RSxTQUErRCxjQUF3QywwQ0FBOEY7QUFDck0sU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQkFBbUI7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
