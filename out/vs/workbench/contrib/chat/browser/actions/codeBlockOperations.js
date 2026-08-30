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
import { AsyncIterableProducer } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { CharCode } from "../../../../../base/common/charCode.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import { isEqual } from "../../../../../base/common/resources.js";
import * as strings from "../../../../../base/common/strings.js";
import { URI } from "../../../../../base/common/uri.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { EditDeltaInfo } from "../../../../../editor/common/textModelEditSource.js";
import { localize } from "../../../../../nls.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProgressService, ProgressLocation } from "../../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { IAiEditTelemetryService } from "../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { reviewEdits, reviewNotebookEdits } from "./reviewEdits.js";
import { insertCell } from "../../../notebook/browser/controller/cellOperations.js";
import { CellKind, NOTEBOOK_EDITOR_ID } from "../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../notebook/common/notebookService.js";
import { ICodeMapperService } from "../../common/editing/chatCodeMapperService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
let InsertCodeBlockOperation = class {
  constructor(editorService, textFileService, bulkEditService, codeEditorService, chatService, languageService, dialogService, aiEditTelemetryService) {
    this.editorService = editorService;
    this.textFileService = textFileService;
    this.bulkEditService = bulkEditService;
    this.codeEditorService = codeEditorService;
    this.chatService = chatService;
    this.languageService = languageService;
    this.dialogService = dialogService;
    this.aiEditTelemetryService = aiEditTelemetryService;
  }
  async run(context) {
    const activeEditorControl = getEditableActiveCodeEditor(this.editorService);
    if (activeEditorControl) {
      await this.handleTextEditor(activeEditorControl, context);
    } else {
      const activeNotebookEditor = getActiveNotebookEditor(this.editorService);
      if (activeNotebookEditor) {
        await this.handleNotebookEditor(activeNotebookEditor, context);
      } else {
        this.notify(localize("insertCodeBlock.noActiveEditor", "To insert the code block, open a code editor or notebook editor and set the cursor at the location where to insert the code block."));
      }
    }
    if (isResponseVM(context.element)) {
      const requestId = context.element.requestId;
      const request = context.element.session.getItems().find((item) => item.id === requestId && isRequestVM(item));
      notifyUserAction(this.chatService, context, {
        kind: "insert",
        codeBlockIndex: context.codeBlockIndex,
        totalCharacters: context.code.length,
        totalLines: context.code.split("\n").length,
        languageId: context.languageId,
        modelId: request?.modelId ?? ""
      });
      const codeBlockInfo = context.element.model.codeBlockInfos?.at(context.codeBlockIndex);
      this.aiEditTelemetryService.handleCodeAccepted({
        acceptanceMethod: "insertAtCursor",
        suggestionId: codeBlockInfo?.suggestionId,
        editDeltaInfo: EditDeltaInfo.fromText(context.code),
        feature: "sideBarChat",
        languageId: context.languageId,
        modeId: context.element.model.request?.modeInfo?.telemetryModeId,
        modelId: request?.modelId,
        presentation: "codeBlock",
        applyCodeBlockSuggestionId: void 0,
        source: void 0,
        sourceRequestId: void 0
      });
    }
  }
  async handleNotebookEditor(notebookEditor, codeBlockContext) {
    if (notebookEditor.isReadOnly) {
      this.notify(localize("insertCodeBlock.readonlyNotebook", "Cannot insert the code block to read-only notebook editor."));
      return false;
    }
    const focusRange = notebookEditor.getFocus();
    const next = Math.max(focusRange.end - 1, 0);
    insertCell(this.languageService, notebookEditor, next, CellKind.Code, "below", codeBlockContext.code, true);
    return true;
  }
  async handleTextEditor(codeEditor, codeBlockContext) {
    const activeModel = codeEditor.getModel();
    if (isReadOnly(activeModel, this.textFileService)) {
      this.notify(localize("insertCodeBlock.readonly", "Cannot insert the code block to read-only code editor."));
      return false;
    }
    const range = codeEditor.getSelection() ?? new Range(activeModel.getLineCount(), 1, activeModel.getLineCount(), 1);
    const text = reindent(codeBlockContext.code, activeModel, range.startLineNumber);
    const edits = [new ResourceTextEdit(activeModel.uri, { range, text })];
    await this.bulkEditService.apply(edits);
    this.codeEditorService.listCodeEditors().find((editor) => isEqual(editor.getModel()?.uri, activeModel.uri))?.focus();
    return true;
  }
  notify(message) {
    this.dialogService.info(message);
  }
};
InsertCodeBlockOperation = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IBulkEditService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, IChatService),
  __decorateParam(5, ILanguageService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, IAiEditTelemetryService)
], InsertCodeBlockOperation);
let ApplyCodeBlockOperation = class {
  constructor(editorService, textFileService, chatService, fileService, dialogService, logService, codeMapperService, progressService, quickInputService, labelService, instantiationService, notebookService) {
    this.editorService = editorService;
    this.textFileService = textFileService;
    this.chatService = chatService;
    this.fileService = fileService;
    this.dialogService = dialogService;
    this.logService = logService;
    this.codeMapperService = codeMapperService;
    this.progressService = progressService;
    this.quickInputService = quickInputService;
    this.labelService = labelService;
    this.instantiationService = instantiationService;
    this.notebookService = notebookService;
  }
  async run(context) {
    let activeEditorControl = getEditableActiveCodeEditor(this.editorService);
    const codemapperUri = await this.evaluateURIToUse(context.codemapperUri, activeEditorControl);
    if (!codemapperUri) {
      return;
    }
    if (codemapperUri && !isEqual(activeEditorControl?.getModel().uri, codemapperUri) && !this.notebookService.hasSupportedNotebooks(codemapperUri)) {
      try {
        const editorPane = await this.editorService.openEditor({ resource: codemapperUri });
        const codeEditor = getCodeEditor(editorPane?.getControl());
        if (codeEditor && codeEditor.hasModel()) {
          this.tryToRevealCodeBlock(codeEditor, context.code);
          activeEditorControl = codeEditor;
        } else {
          this.notify(localize("applyCodeBlock.errorOpeningFile", "Failed to open {0} in a code editor.", codemapperUri.toString()));
          return;
        }
      } catch (e) {
        this.logService.info("[ApplyCodeBlockOperation] error opening code mapper file", codemapperUri, e);
        return;
      }
    }
    let codeBlockSuggestionId = void 0;
    if (isResponseVM(context.element)) {
      const codeBlockInfo = context.element.model.codeBlockInfos?.at(context.codeBlockIndex);
      if (codeBlockInfo) {
        codeBlockSuggestionId = codeBlockInfo.suggestionId;
      }
    }
    let result = void 0;
    if (activeEditorControl && !this.notebookService.hasSupportedNotebooks(codemapperUri)) {
      result = await this.handleTextEditor(activeEditorControl, context.chatSessionResource, context.code, codeBlockSuggestionId);
    } else {
      const activeNotebookEditor = getActiveNotebookEditor(this.editorService);
      if (activeNotebookEditor) {
        result = await this.handleNotebookEditor(activeNotebookEditor, context.chatSessionResource, context.code);
      } else {
        this.notify(localize("applyCodeBlock.noActiveEditor", "To apply this code block, open a code or notebook editor."));
      }
    }
    if (isResponseVM(context.element)) {
      const requestId = context.element.requestId;
      const request = context.element.session.getItems().find((item) => item.id === requestId && isRequestVM(item));
      notifyUserAction(this.chatService, context, {
        kind: "apply",
        codeBlockIndex: context.codeBlockIndex,
        totalCharacters: context.code.length,
        codeMapper: result?.codeMapper,
        editsProposed: !!result?.editsProposed,
        totalLines: context.code.split("\n").length,
        modelId: request?.modelId ?? "",
        languageId: context.languageId
      });
    }
  }
  async evaluateURIToUse(resource, activeEditorControl) {
    if (resource && await this.fileService.exists(resource)) {
      return resource;
    }
    const activeEditorOption = activeEditorControl?.getModel().uri ? { label: localize("activeEditor", "Active editor '{0}'", this.labelService.getUriLabel(activeEditorControl.getModel().uri, { relative: true })), id: "activeEditor" } : void 0;
    const untitledEditorOption = { label: localize("newUntitledFile", "New untitled editor"), id: "newUntitledFile" };
    const options = [];
    if (resource) {
      options.push({ label: localize("createFile", "New file '{0}'", this.labelService.getUriLabel(resource, { relative: true })), id: "createFile" });
      options.push(untitledEditorOption);
      if (activeEditorOption) {
        options.push(activeEditorOption);
      }
    } else {
      if (activeEditorOption) {
        options.push(activeEditorOption);
      }
      options.push(untitledEditorOption);
    }
    const selected = options.length > 1 ? await this.quickInputService.pick(options, { placeHolder: localize("selectOption", "Select where to apply the code block") }) : options[0];
    if (selected) {
      switch (selected.id) {
        case "createFile":
          if (resource) {
            try {
              await this.fileService.writeFile(resource, VSBuffer.fromString(""));
            } catch (error) {
              this.notify(localize("applyCodeBlock.fileWriteError", "Failed to create file: {0}", error.message));
              return URI.from({ scheme: "untitled", path: resource.path });
            }
          }
          return resource;
        case "newUntitledFile":
          return URI.from({ scheme: "untitled", path: resource ? resource.path : "Untitled-1" });
        case "activeEditor":
          return activeEditorControl?.getModel().uri;
      }
    }
    return void 0;
  }
  async handleNotebookEditor(notebookEditor, chatSessionResource, code) {
    if (notebookEditor.isReadOnly) {
      this.notify(localize("applyCodeBlock.readonlyNotebook", "Cannot apply code block to read-only notebook editor."));
      return void 0;
    }
    const uri = notebookEditor.textModel.uri;
    const codeBlock = { code, resource: uri, markdownBeforeBlock: void 0 };
    const codeMapper = this.codeMapperService.providers[0]?.displayName;
    if (!codeMapper) {
      this.notify(localize("applyCodeBlock.noCodeMapper", "No code mapper available."));
      return void 0;
    }
    let editsProposed = false;
    const cancellationTokenSource = new CancellationTokenSource();
    try {
      const iterable = await this.progressService.withProgress(
        { location: ProgressLocation.Notification, delay: 500, sticky: true, cancellable: true },
        async (progress) => {
          progress.report({ message: localize("applyCodeBlock.progress", "Applying code block using {0}...", codeMapper) });
          const editsIterable = this.getNotebookEdits(codeBlock, chatSessionResource, cancellationTokenSource.token);
          return await this.waitForFirstElement(editsIterable);
        },
        () => cancellationTokenSource.cancel()
      );
      editsProposed = await this.applyNotebookEditsWithInlinePreview(iterable, uri, cancellationTokenSource);
    } catch (e) {
      if (!isCancellationError(e)) {
        this.notify(localize("applyCodeBlock.error", "Failed to apply code block: {0}", e.message));
      }
    } finally {
      cancellationTokenSource.dispose();
    }
    return {
      editsProposed,
      codeMapper
    };
  }
  async handleTextEditor(codeEditor, chatSessionResource, code, applyCodeBlockSuggestionId) {
    const activeModel = codeEditor.getModel();
    if (isReadOnly(activeModel, this.textFileService)) {
      this.notify(localize("applyCodeBlock.readonly", "Cannot apply code block to read-only file."));
      return void 0;
    }
    const codeBlock = { code, resource: activeModel.uri, chatSessionResource, markdownBeforeBlock: void 0 };
    const codeMapper = this.codeMapperService.providers[0]?.displayName;
    if (!codeMapper) {
      this.notify(localize("applyCodeBlock.noCodeMapper", "No code mapper available."));
      return void 0;
    }
    let editsProposed = false;
    const cancellationTokenSource = new CancellationTokenSource();
    try {
      const iterable = await this.progressService.withProgress(
        { location: ProgressLocation.Notification, delay: 500, sticky: true, cancellable: true },
        async (progress) => {
          progress.report({ message: localize("applyCodeBlock.progress", "Applying code block using {0}...", codeMapper) });
          const editsIterable = this.getTextEdits(codeBlock, chatSessionResource, cancellationTokenSource.token);
          return await this.waitForFirstElement(editsIterable);
        },
        () => cancellationTokenSource.cancel()
      );
      editsProposed = await this.applyWithInlinePreview(iterable, codeEditor, cancellationTokenSource, applyCodeBlockSuggestionId);
    } catch (e) {
      if (!isCancellationError(e)) {
        this.notify(localize("applyCodeBlock.error", "Failed to apply code block: {0}", e.message));
      }
    } finally {
      cancellationTokenSource.dispose();
    }
    return {
      editsProposed,
      codeMapper
    };
  }
  getTextEdits(codeBlock, chatSessionResource, token) {
    return new AsyncIterableProducer(async (executor) => {
      const request = {
        codeBlocks: [codeBlock],
        chatSessionResource
      };
      const response = {
        textEdit: (target, edit) => {
          executor.emitOne(edit);
        },
        notebookEdit(_resource, _edit) {
        }
      };
      const result = await this.codeMapperService.mapCode(request, response, token);
      if (result?.errorMessage) {
        executor.reject(new Error(result.errorMessage));
      }
    });
  }
  getNotebookEdits(codeBlock, chatSessionResource, token) {
    return new AsyncIterableProducer(async (executor) => {
      const request = {
        codeBlocks: [codeBlock],
        chatSessionResource,
        location: "panel"
      };
      const response = {
        textEdit: (target, edits) => {
          executor.emitOne([target, edits]);
        },
        notebookEdit(_resource, edit) {
          executor.emitOne(edit);
        }
      };
      const result = await this.codeMapperService.mapCode(request, response, token);
      if (result?.errorMessage) {
        executor.reject(new Error(result.errorMessage));
      }
    });
  }
  async waitForFirstElement(iterable) {
    const iterator = iterable[Symbol.asyncIterator]();
    let result = await iterator.next();
    if (result.done) {
      return {
        async *[Symbol.asyncIterator]() {
          return;
        }
      };
    }
    return {
      async *[Symbol.asyncIterator]() {
        while (!result.done) {
          yield result.value;
          result = await iterator.next();
        }
      }
    };
  }
  async applyWithInlinePreview(edits, codeEditor, tokenSource, applyCodeBlockSuggestionId) {
    return this.instantiationService.invokeFunction(reviewEdits, codeEditor, edits, tokenSource.token, applyCodeBlockSuggestionId);
  }
  async applyNotebookEditsWithInlinePreview(edits, uri, tokenSource) {
    return this.instantiationService.invokeFunction(reviewNotebookEdits, uri, edits, tokenSource.token);
  }
  tryToRevealCodeBlock(codeEditor, codeBlock) {
    const match = codeBlock.match(/(\S[^\n]*)\n/);
    if (match && match[1].length > 10) {
      const findMatch = codeEditor.getModel().findNextMatch(match[1], { lineNumber: 1, column: 1 }, false, false, null, false);
      if (findMatch) {
        codeEditor.revealRangeInCenter(findMatch.range);
      }
    }
  }
  notify(message) {
    this.dialogService.info(message);
  }
};
ApplyCodeBlockOperation = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ICodeMapperService),
  __decorateParam(7, IProgressService),
  __decorateParam(8, IQuickInputService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, INotebookService)
], ApplyCodeBlockOperation);
function notifyUserAction(chatService, context, action) {
  if (isResponseVM(context.element)) {
    chatService.notifyUserAction({
      agentId: context.element.agent?.id,
      command: context.element.slashCommand?.name,
      sessionResource: context.element.sessionResource,
      requestId: context.element.requestId,
      result: context.element.result,
      action
    });
  }
}
function getActiveNotebookEditor(editorService) {
  const activeEditorPane = editorService.activeEditorPane;
  if (activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
    const notebookEditor = activeEditorPane.getControl();
    if (notebookEditor.hasModel()) {
      return notebookEditor;
    }
  }
  return void 0;
}
function getEditableActiveCodeEditor(editorService) {
  const activeCodeEditorInNotebook = getActiveNotebookEditor(editorService)?.activeCodeEditor;
  if (activeCodeEditorInNotebook && activeCodeEditorInNotebook.hasTextFocus() && activeCodeEditorInNotebook.hasModel()) {
    return activeCodeEditorInNotebook;
  }
  let codeEditor = getCodeEditor(editorService.activeTextEditorControl);
  if (!codeEditor) {
    for (const editor of editorService.visibleTextEditorControls) {
      codeEditor = getCodeEditor(editor);
      if (codeEditor) {
        break;
      }
    }
  }
  if (!codeEditor || !codeEditor.hasModel()) {
    return void 0;
  }
  return codeEditor;
}
function isReadOnly(model, textFileService) {
  const activeTextModel = textFileService.files.get(model.uri) ?? textFileService.untitled.get(model.uri);
  return !!activeTextModel?.isReadonly();
}
function reindent(codeBlockContent, model, seletionStartLine) {
  const newContent = strings.splitLines(codeBlockContent);
  if (newContent.length === 0) {
    return codeBlockContent;
  }
  const formattingOptions = model.getFormattingOptions();
  const codeIndentLevel = computeIndentation(model.getLineContent(seletionStartLine), formattingOptions.tabSize).level;
  const indents = newContent.map((line) => computeIndentation(line, formattingOptions.tabSize));
  const newContentIndentLevel = indents.reduce((min, indent, index) => {
    if (indent.length !== newContent[index].length) {
      return Math.min(indent.level, min);
    }
    return min;
  }, Number.MAX_VALUE);
  if (newContentIndentLevel === Number.MAX_VALUE || newContentIndentLevel === codeIndentLevel) {
    return codeBlockContent;
  }
  const newLines = [];
  for (let i = 0; i < newContent.length; i++) {
    const { level, length } = indents[i];
    const newLevel = Math.max(0, codeIndentLevel + level - newContentIndentLevel);
    const newIndentation = formattingOptions.insertSpaces ? " ".repeat(formattingOptions.tabSize * newLevel) : "	".repeat(newLevel);
    newLines.push(newIndentation + newContent[i].substring(length));
  }
  return newLines.join("\n");
}
function computeIndentation(line, tabSize) {
  let nSpaces = 0;
  let level = 0;
  let i = 0;
  let length = 0;
  const len = line.length;
  while (i < len) {
    const chCode = line.charCodeAt(i);
    if (chCode === CharCode.Space) {
      nSpaces++;
      if (nSpaces === tabSize) {
        level++;
        nSpaces = 0;
        length = i + 1;
      }
    } else if (chCode === CharCode.Tab) {
      level++;
      nSpaces = 0;
      length = i + 1;
    } else {
      break;
    }
    i++;
  }
  return { level, length };
}
export {
  ApplyCodeBlockOperation,
  InsertCodeBlockOperation,
  computeIndentation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNvZGVCbG9ja09wZXJhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZVByb2R1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2V0Q29kZUVkaXRvciwgSUFjdGl2ZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UsIFJlc291cmNlVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgRWRpdERlbHRhSW5mbywgRWRpdFN1Z2dlc3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvYWlFZGl0VGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmV2aWV3RWRpdHMsIHJldmlld05vdGVib29rRWRpdHMgfSBmcm9tICcuL3Jldmlld0VkaXRzLmpzJztcbmltcG9ydCB7IGluc2VydENlbGwgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvY2VsbE9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCwgSUNlbGxFZGl0T3BlcmF0aW9uLCBOT1RFQk9PS19FRElUT1JfSUQgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVNYXBwZXJDb2RlQmxvY2ssIElDb2RlTWFwcGVyUmVxdWVzdCwgSUNvZGVNYXBwZXJSZXNwb25zZSwgSUNvZGVNYXBwZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdENvZGVNYXBwZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRVc2VyQWN0aW9uLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0Vmlld01vZGVsLCBpc1JlcXVlc3RWTSwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQgfSBmcm9tICcuLi93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jb2RlQmxvY2tQYXJ0LmpzJztcblxuZXhwb3J0IGNsYXNzIEluc2VydENvZGVCbG9ja09wZXJhdGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJQnVsa0VkaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFpRWRpdFRlbGVtZXRyeVNlcnZpY2U6IElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oY29udGV4dDogSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQpIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDb250cm9sID0gZ2V0RWRpdGFibGVBY3RpdmVDb2RlRWRpdG9yKHRoaXMuZWRpdG9yU2VydmljZSk7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvckNvbnRyb2wpIHtcblx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlVGV4dEVkaXRvcihhY3RpdmVFZGl0b3JDb250cm9sLCBjb250ZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYWN0aXZlTm90ZWJvb2tFZGl0b3IgPSBnZXRBY3RpdmVOb3RlYm9va0VkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UpO1xuXHRcdFx0aWYgKGFjdGl2ZU5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlTm90ZWJvb2tFZGl0b3IoYWN0aXZlTm90ZWJvb2tFZGl0b3IsIGNvbnRleHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5ub3RpZnkobG9jYWxpemUoJ2luc2VydENvZGVCbG9jay5ub0FjdGl2ZUVkaXRvcicsIFwiVG8gaW5zZXJ0IHRoZSBjb2RlIGJsb2NrLCBvcGVuIGEgY29kZSBlZGl0b3Igb3Igbm90ZWJvb2sgZWRpdG9yIGFuZCBzZXQgdGhlIGN1cnNvciBhdCB0aGUgbG9jYXRpb24gd2hlcmUgdG8gaW5zZXJ0IHRoZSBjb2RlIGJsb2NrLlwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0SWQgPSBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IGNvbnRleHQuZWxlbWVudC5zZXNzaW9uLmdldEl0ZW1zKCkuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IHJlcXVlc3RJZCAmJiBpc1JlcXVlc3RWTShpdGVtKSkgYXMgSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0bm90aWZ5VXNlckFjdGlvbih0aGlzLmNoYXRTZXJ2aWNlLCBjb250ZXh0LCB7XG5cdFx0XHRcdGtpbmQ6ICdpbnNlcnQnLFxuXHRcdFx0XHRjb2RlQmxvY2tJbmRleDogY29udGV4dC5jb2RlQmxvY2tJbmRleCxcblx0XHRcdFx0dG90YWxDaGFyYWN0ZXJzOiBjb250ZXh0LmNvZGUubGVuZ3RoLFxuXHRcdFx0XHR0b3RhbExpbmVzOiBjb250ZXh0LmNvZGUuc3BsaXQoJ1xcbicpLmxlbmd0aCxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogY29udGV4dC5sYW5ndWFnZUlkLFxuXHRcdFx0XHRtb2RlbElkOiByZXF1ZXN0Py5tb2RlbElkID8/ICcnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvZGVCbG9ja0luZm8gPSBjb250ZXh0LmVsZW1lbnQubW9kZWwuY29kZUJsb2NrSW5mb3M/LmF0KGNvbnRleHQuY29kZUJsb2NrSW5kZXgpO1xuXG5cdFx0XHR0aGlzLmFpRWRpdFRlbGVtZXRyeVNlcnZpY2UuaGFuZGxlQ29kZUFjY2VwdGVkKHtcblx0XHRcdFx0YWNjZXB0YW5jZU1ldGhvZDogJ2luc2VydEF0Q3Vyc29yJyxcblx0XHRcdFx0c3VnZ2VzdGlvbklkOiBjb2RlQmxvY2tJbmZvPy5zdWdnZXN0aW9uSWQsXG5cdFx0XHRcdGVkaXREZWx0YUluZm86IEVkaXREZWx0YUluZm8uZnJvbVRleHQoY29udGV4dC5jb2RlKSxcblx0XHRcdFx0ZmVhdHVyZTogJ3NpZGVCYXJDaGF0Jyxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogY29udGV4dC5sYW5ndWFnZUlkLFxuXHRcdFx0XHRtb2RlSWQ6IGNvbnRleHQuZWxlbWVudC5tb2RlbC5yZXF1ZXN0Py5tb2RlSW5mbz8udGVsZW1ldHJ5TW9kZUlkLFxuXHRcdFx0XHRtb2RlbElkOiByZXF1ZXN0Py5tb2RlbElkLFxuXHRcdFx0XHRwcmVzZW50YXRpb246ICdjb2RlQmxvY2snLFxuXHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0c291cmNlUmVxdWVzdElkOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZU5vdGVib29rRWRpdG9yKG5vdGVib29rRWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIGNvZGVCbG9ja0NvbnRleHQ6IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKG5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRcdHRoaXMubm90aWZ5KGxvY2FsaXplKCdpbnNlcnRDb2RlQmxvY2sucmVhZG9ubHlOb3RlYm9vaycsIFwiQ2Fubm90IGluc2VydCB0aGUgY29kZSBibG9jayB0byByZWFkLW9ubHkgbm90ZWJvb2sgZWRpdG9yLlwiKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGZvY3VzUmFuZ2UgPSBub3RlYm9va0VkaXRvci5nZXRGb2N1cygpO1xuXHRcdGNvbnN0IG5leHQgPSBNYXRoLm1heChmb2N1c1JhbmdlLmVuZCAtIDEsIDApO1xuXHRcdGluc2VydENlbGwodGhpcy5sYW5ndWFnZVNlcnZpY2UsIG5vdGVib29rRWRpdG9yLCBuZXh0LCBDZWxsS2luZC5Db2RlLCAnYmVsb3cnLCBjb2RlQmxvY2tDb250ZXh0LmNvZGUsIHRydWUpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVUZXh0RWRpdG9yKGNvZGVFZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLCBjb2RlQmxvY2tDb250ZXh0OiBJQ29kZUJsb2NrQWN0aW9uQ29udGV4dCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGFjdGl2ZU1vZGVsID0gY29kZUVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChpc1JlYWRPbmx5KGFjdGl2ZU1vZGVsLCB0aGlzLnRleHRGaWxlU2VydmljZSkpIHtcblx0XHRcdHRoaXMubm90aWZ5KGxvY2FsaXplKCdpbnNlcnRDb2RlQmxvY2sucmVhZG9ubHknLCBcIkNhbm5vdCBpbnNlcnQgdGhlIGNvZGUgYmxvY2sgdG8gcmVhZC1vbmx5IGNvZGUgZWRpdG9yLlwiKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2UgPSBjb2RlRWRpdG9yLmdldFNlbGVjdGlvbigpID8/IG5ldyBSYW5nZShhY3RpdmVNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSwgYWN0aXZlTW9kZWwuZ2V0TGluZUNvdW50KCksIDEpO1xuXHRcdGNvbnN0IHRleHQgPSByZWluZGVudChjb2RlQmxvY2tDb250ZXh0LmNvZGUsIGFjdGl2ZU1vZGVsLCByYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3QgZWRpdHMgPSBbbmV3IFJlc291cmNlVGV4dEVkaXQoYWN0aXZlTW9kZWwudXJpLCB7IHJhbmdlLCB0ZXh0IH0pXTtcblx0XHRhd2FpdCB0aGlzLmJ1bGtFZGl0U2VydmljZS5hcHBseShlZGl0cyk7XG5cdFx0dGhpcy5jb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKS5maW5kKGVkaXRvciA9PiBpc0VxdWFsKGVkaXRvci5nZXRNb2RlbCgpPy51cmksIGFjdGl2ZU1vZGVsLnVyaSkpPy5mb2N1cygpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBub3RpZnkobWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0Ly90aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHsgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sIG1lc3NhZ2UgfSk7XG5cdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLmluZm8obWVzc2FnZSk7XG5cdH1cbn1cblxudHlwZSBJQ29tcHV0ZUVkaXRzUmVzdWx0ID0geyByZWFkb25seSBlZGl0c1Byb3Bvc2VkOiBib29sZWFuOyByZWFkb25seSBjb2RlTWFwcGVyPzogc3RyaW5nIH07XG5cbmV4cG9ydCBjbGFzcyBBcHBseUNvZGVCbG9ja09wZXJhdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb2RlTWFwcGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVNYXBwZXJTZXJ2aWNlOiBJQ29kZU1hcHBlclNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihjb250ZXh0OiBJQ29kZUJsb2NrQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBhY3RpdmVFZGl0b3JDb250cm9sID0gZ2V0RWRpdGFibGVBY3RpdmVDb2RlRWRpdG9yKHRoaXMuZWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCBjb2RlbWFwcGVyVXJpID0gYXdhaXQgdGhpcy5ldmFsdWF0ZVVSSVRvVXNlKGNvbnRleHQuY29kZW1hcHBlclVyaSwgYWN0aXZlRWRpdG9yQ29udHJvbCk7XG5cdFx0aWYgKCFjb2RlbWFwcGVyVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNvZGVtYXBwZXJVcmkgJiYgIWlzRXF1YWwoYWN0aXZlRWRpdG9yQ29udHJvbD8uZ2V0TW9kZWwoKS51cmksIGNvZGVtYXBwZXJVcmkpICYmICF0aGlzLm5vdGVib29rU2VydmljZS5oYXNTdXBwb3J0ZWROb3RlYm9va3MoY29kZW1hcHBlclVyaSkpIHtcblx0XHRcdC8vIHJldmVhbCB0aGUgdGFyZ2V0IGZpbGVcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBjb2RlbWFwcGVyVXJpIH0pO1xuXHRcdFx0XHRjb25zdCBjb2RlRWRpdG9yID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JQYW5lPy5nZXRDb250cm9sKCkpO1xuXHRcdFx0XHRpZiAoY29kZUVkaXRvciAmJiBjb2RlRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0XHR0aGlzLnRyeVRvUmV2ZWFsQ29kZUJsb2NrKGNvZGVFZGl0b3IsIGNvbnRleHQuY29kZSk7XG5cdFx0XHRcdFx0YWN0aXZlRWRpdG9yQ29udHJvbCA9IGNvZGVFZGl0b3I7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZnkobG9jYWxpemUoJ2FwcGx5Q29kZUJsb2NrLmVycm9yT3BlbmluZ0ZpbGUnLCBcIkZhaWxlZCB0byBvcGVuIHswfSBpbiBhIGNvZGUgZWRpdG9yLlwiLCBjb2RlbWFwcGVyVXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBcHBseUNvZGVCbG9ja09wZXJhdGlvbl0gZXJyb3Igb3BlbmluZyBjb2RlIG1hcHBlciBmaWxlJywgY29kZW1hcHBlclVyaSwgZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgY29kZUJsb2NrU3VnZ2VzdGlvbklkOiBFZGl0U3VnZ2VzdGlvbklkIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBjb2RlQmxvY2tJbmZvID0gY29udGV4dC5lbGVtZW50Lm1vZGVsLmNvZGVCbG9ja0luZm9zPy5hdChjb250ZXh0LmNvZGVCbG9ja0luZGV4KTtcblx0XHRcdGlmIChjb2RlQmxvY2tJbmZvKSB7XG5cdFx0XHRcdGNvZGVCbG9ja1N1Z2dlc3Rpb25JZCA9IGNvZGVCbG9ja0luZm8uc3VnZ2VzdGlvbklkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCByZXN1bHQ6IElDb21wdXRlRWRpdHNSZXN1bHQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoYWN0aXZlRWRpdG9yQ29udHJvbCAmJiAhdGhpcy5ub3RlYm9va1NlcnZpY2UuaGFzU3VwcG9ydGVkTm90ZWJvb2tzKGNvZGVtYXBwZXJVcmkpKSB7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLmhhbmRsZVRleHRFZGl0b3IoYWN0aXZlRWRpdG9yQ29udHJvbCwgY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlLCBjb250ZXh0LmNvZGUsIGNvZGVCbG9ja1N1Z2dlc3Rpb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGFjdGl2ZU5vdGVib29rRWRpdG9yID0gZ2V0QWN0aXZlTm90ZWJvb2tFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGlmIChhY3RpdmVOb3RlYm9va0VkaXRvcikge1xuXHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLmhhbmRsZU5vdGVib29rRWRpdG9yKGFjdGl2ZU5vdGVib29rRWRpdG9yLCBjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UsIGNvbnRleHQuY29kZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm5vdGlmeShsb2NhbGl6ZSgnYXBwbHlDb2RlQmxvY2subm9BY3RpdmVFZGl0b3InLCBcIlRvIGFwcGx5IHRoaXMgY29kZSBibG9jaywgb3BlbiBhIGNvZGUgb3Igbm90ZWJvb2sgZWRpdG9yLlwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0SWQgPSBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IGNvbnRleHQuZWxlbWVudC5zZXNzaW9uLmdldEl0ZW1zKCkuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IHJlcXVlc3RJZCAmJiBpc1JlcXVlc3RWTShpdGVtKSkgYXMgSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0bm90aWZ5VXNlckFjdGlvbih0aGlzLmNoYXRTZXJ2aWNlLCBjb250ZXh0LCB7XG5cdFx0XHRcdGtpbmQ6ICdhcHBseScsXG5cdFx0XHRcdGNvZGVCbG9ja0luZGV4OiBjb250ZXh0LmNvZGVCbG9ja0luZGV4LFxuXHRcdFx0XHR0b3RhbENoYXJhY3RlcnM6IGNvbnRleHQuY29kZS5sZW5ndGgsXG5cdFx0XHRcdGNvZGVNYXBwZXI6IHJlc3VsdD8uY29kZU1hcHBlcixcblx0XHRcdFx0ZWRpdHNQcm9wb3NlZDogISFyZXN1bHQ/LmVkaXRzUHJvcG9zZWQsXG5cdFx0XHRcdHRvdGFsTGluZXM6IGNvbnRleHQuY29kZS5zcGxpdCgnXFxuJykubGVuZ3RoLFxuXHRcdFx0XHRtb2RlbElkOiByZXF1ZXN0Py5tb2RlbElkID8/ICcnLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiBjb250ZXh0Lmxhbmd1YWdlSWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGV2YWx1YXRlVVJJVG9Vc2UocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgYWN0aXZlRWRpdG9yQ29udHJvbDogSUFjdGl2ZUNvZGVFZGl0b3IgfCB1bmRlZmluZWQpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChyZXNvdXJjZSAmJiBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JPcHRpb24gPSBhY3RpdmVFZGl0b3JDb250cm9sPy5nZXRNb2RlbCgpLnVyaSA/IHsgbGFiZWw6IGxvY2FsaXplKCdhY3RpdmVFZGl0b3InLCBcIkFjdGl2ZSBlZGl0b3IgJ3swfSdcIiwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoYWN0aXZlRWRpdG9yQ29udHJvbC5nZXRNb2RlbCgpLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSksIGlkOiAnYWN0aXZlRWRpdG9yJyB9IDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHVudGl0bGVkRWRpdG9yT3B0aW9uID0geyBsYWJlbDogbG9jYWxpemUoJ25ld1VudGl0bGVkRmlsZScsIFwiTmV3IHVudGl0bGVkIGVkaXRvclwiKSwgaWQ6ICduZXdVbnRpdGxlZEZpbGUnIH07XG5cblx0XHRjb25zdCBvcHRpb25zID0gW107XG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHQvLyBjb2RlIGJsb2NrIGhhZCBhbiBVUkksIGJ1dCBpdCBkb2Vzbid0IGV4aXN0XG5cdFx0XHRvcHRpb25zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ2NyZWF0ZUZpbGUnLCBcIk5ldyBmaWxlICd7MH0nXCIsIHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pKSwgaWQ6ICdjcmVhdGVGaWxlJyB9KTtcblx0XHRcdG9wdGlvbnMucHVzaCh1bnRpdGxlZEVkaXRvck9wdGlvbik7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yT3B0aW9uKSB7XG5cdFx0XHRcdG9wdGlvbnMucHVzaChhY3RpdmVFZGl0b3JPcHRpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBjb2RlIGJsb2NrIGhhZCBubyBVUklcblx0XHRcdGlmIChhY3RpdmVFZGl0b3JPcHRpb24pIHtcblx0XHRcdFx0b3B0aW9ucy5wdXNoKGFjdGl2ZUVkaXRvck9wdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRvcHRpb25zLnB1c2godW50aXRsZWRFZGl0b3JPcHRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGVkID0gb3B0aW9ucy5sZW5ndGggPiAxID8gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKG9wdGlvbnMsIHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzZWxlY3RPcHRpb24nLCBcIlNlbGVjdCB3aGVyZSB0byBhcHBseSB0aGUgY29kZSBibG9ja1wiKSB9KSA6IG9wdGlvbnNbMF07XG5cdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHRzd2l0Y2ggKHNlbGVjdGVkLmlkKSB7XG5cdFx0XHRcdGNhc2UgJ2NyZWF0ZUZpbGUnOlxuXHRcdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubm90aWZ5KGxvY2FsaXplKCdhcHBseUNvZGVCbG9jay5maWxlV3JpdGVFcnJvcicsIFwiRmFpbGVkIHRvIGNyZWF0ZSBmaWxlOiB7MH1cIiwgZXJyb3IubWVzc2FnZSkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICd1bnRpdGxlZCcsIHBhdGg6IHJlc291cmNlLnBhdGggfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiByZXNvdXJjZTtcblx0XHRcdFx0Y2FzZSAnbmV3VW50aXRsZWRGaWxlJzpcblx0XHRcdFx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICd1bnRpdGxlZCcsIHBhdGg6IHJlc291cmNlID8gcmVzb3VyY2UucGF0aCA6ICdVbnRpdGxlZC0xJyB9KTtcblx0XHRcdFx0Y2FzZSAnYWN0aXZlRWRpdG9yJzpcblx0XHRcdFx0XHRyZXR1cm4gYWN0aXZlRWRpdG9yQ29udHJvbD8uZ2V0TW9kZWwoKS51cmk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZU5vdGVib29rRWRpdG9yKG5vdGVib29rRWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgY29kZTogc3RyaW5nKTogUHJvbWlzZTxJQ29tcHV0ZUVkaXRzUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKG5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRcdHRoaXMubm90aWZ5KGxvY2FsaXplKCdhcHBseUNvZGVCbG9jay5yZWFkb25seU5vdGVib29rJywgXCJDYW5ub3QgYXBwbHkgY29kZSBibG9jayB0byByZWFkLW9ubHkgbm90ZWJvb2sgZWRpdG9yLlwiKSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB1cmkgPSBub3RlYm9va0VkaXRvci50ZXh0TW9kZWwudXJpO1xuXHRcdGNvbnN0IGNvZGVCbG9jayA9IHsgY29kZSwgcmVzb3VyY2U6IHVyaSwgbWFya2Rvd25CZWZvcmVCbG9jazogdW5kZWZpbmVkIH07XG5cdFx0Y29uc3QgY29kZU1hcHBlciA9IHRoaXMuY29kZU1hcHBlclNlcnZpY2UucHJvdmlkZXJzWzBdPy5kaXNwbGF5TmFtZTtcblx0XHRpZiAoIWNvZGVNYXBwZXIpIHtcblx0XHRcdHRoaXMubm90aWZ5KGxvY2FsaXplKCdhcHBseUNvZGVCbG9jay5ub0NvZGVNYXBwZXInLCBcIk5vIGNvZGUgbWFwcGVyIGF2YWlsYWJsZS5cIikpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGVkaXRzUHJvcG9zZWQgPSBmYWxzZTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpdGVyYWJsZSA9IGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzczxBc3luY0l0ZXJhYmxlPFtVUkksIFRleHRFZGl0W11dIHwgSUNlbGxFZGl0T3BlcmF0aW9uW10+Pihcblx0XHRcdFx0eyBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sIGRlbGF5OiA1MDAsIHN0aWNreTogdHJ1ZSwgY2FuY2VsbGFibGU6IHRydWUgfSxcblx0XHRcdFx0YXN5bmMgcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdhcHBseUNvZGVCbG9jay5wcm9ncmVzcycsIFwiQXBwbHlpbmcgY29kZSBibG9jayB1c2luZyB7MH0uLi5cIiwgY29kZU1hcHBlcikgfSk7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdHNJdGVyYWJsZSA9IHRoaXMuZ2V0Tm90ZWJvb2tFZGl0cyhjb2RlQmxvY2ssIGNoYXRTZXNzaW9uUmVzb3VyY2UsIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy53YWl0Rm9yRmlyc3RFbGVtZW50KGVkaXRzSXRlcmFibGUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQoKSA9PiBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5jYW5jZWwoKVxuXHRcdFx0KTtcblx0XHRcdGVkaXRzUHJvcG9zZWQgPSBhd2FpdCB0aGlzLmFwcGx5Tm90ZWJvb2tFZGl0c1dpdGhJbmxpbmVQcmV2aWV3KGl0ZXJhYmxlLCB1cmksIGNhbmNlbGxhdGlvblRva2VuU291cmNlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0dGhpcy5ub3RpZnkobG9jYWxpemUoJ2FwcGx5Q29kZUJsb2NrLmVycm9yJywgXCJGYWlsZWQgdG8gYXBwbHkgY29kZSBibG9jazogezB9XCIsIGUubWVzc2FnZSkpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVkaXRzUHJvcG9zZWQsXG5cdFx0XHRjb2RlTWFwcGVyXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVGV4dEVkaXRvcihjb2RlRWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvciwgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjb2RlOiBzdHJpbmcsIGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiBFZGl0U3VnZ2VzdGlvbklkIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJQ29tcHV0ZUVkaXRzUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWN0aXZlTW9kZWwgPSBjb2RlRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKGlzUmVhZE9ubHkoYWN0aXZlTW9kZWwsIHRoaXMudGV4dEZpbGVTZXJ2aWNlKSkge1xuXHRcdFx0dGhpcy5ub3RpZnkobG9jYWxpemUoJ2FwcGx5Q29kZUJsb2NrLnJlYWRvbmx5JywgXCJDYW5ub3QgYXBwbHkgY29kZSBibG9jayB0byByZWFkLW9ubHkgZmlsZS5cIikpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlQmxvY2sgPSB7IGNvZGUsIHJlc291cmNlOiBhY3RpdmVNb2RlbC51cmksIGNoYXRTZXNzaW9uUmVzb3VyY2UsIG1hcmtkb3duQmVmb3JlQmxvY2s6IHVuZGVmaW5lZCB9O1xuXG5cdFx0Y29uc3QgY29kZU1hcHBlciA9IHRoaXMuY29kZU1hcHBlclNlcnZpY2UucHJvdmlkZXJzWzBdPy5kaXNwbGF5TmFtZTtcblx0XHRpZiAoIWNvZGVNYXBwZXIpIHtcblx0XHRcdHRoaXMubm90aWZ5KGxvY2FsaXplKCdhcHBseUNvZGVCbG9jay5ub0NvZGVNYXBwZXInLCBcIk5vIGNvZGUgbWFwcGVyIGF2YWlsYWJsZS5cIikpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGVkaXRzUHJvcG9zZWQgPSBmYWxzZTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpdGVyYWJsZSA9IGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzczxBc3luY0l0ZXJhYmxlPFRleHRFZGl0W10+Pihcblx0XHRcdFx0eyBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sIGRlbGF5OiA1MDAsIHN0aWNreTogdHJ1ZSwgY2FuY2VsbGFibGU6IHRydWUgfSxcblx0XHRcdFx0YXN5bmMgcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdhcHBseUNvZGVCbG9jay5wcm9ncmVzcycsIFwiQXBwbHlpbmcgY29kZSBibG9jayB1c2luZyB7MH0uLi5cIiwgY29kZU1hcHBlcikgfSk7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdHNJdGVyYWJsZSA9IHRoaXMuZ2V0VGV4dEVkaXRzKGNvZGVCbG9jaywgY2hhdFNlc3Npb25SZXNvdXJjZSwgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLndhaXRGb3JGaXJzdEVsZW1lbnQoZWRpdHNJdGVyYWJsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCgpID0+IGNhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpXG5cdFx0XHQpO1xuXHRcdFx0ZWRpdHNQcm9wb3NlZCA9IGF3YWl0IHRoaXMuYXBwbHlXaXRoSW5saW5lUHJldmlldyhpdGVyYWJsZSwgY29kZUVkaXRvciwgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UsIGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0dGhpcy5ub3RpZnkobG9jYWxpemUoJ2FwcGx5Q29kZUJsb2NrLmVycm9yJywgXCJGYWlsZWQgdG8gYXBwbHkgY29kZSBibG9jazogezB9XCIsIGUubWVzc2FnZSkpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVkaXRzUHJvcG9zZWQsXG5cdFx0XHRjb2RlTWFwcGVyXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VGV4dEVkaXRzKGNvZGVCbG9jazogSUNvZGVNYXBwZXJDb2RlQmxvY2ssIGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogQXN5bmNJdGVyYWJsZTxUZXh0RWRpdFtdPiB7XG5cdFx0cmV0dXJuIG5ldyBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VGV4dEVkaXRbXT4oYXN5bmMgZXhlY3V0b3IgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdDogSUNvZGVNYXBwZXJSZXF1ZXN0ID0ge1xuXHRcdFx0XHRjb2RlQmxvY2tzOiBbY29kZUJsb2NrXSxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXNwb25zZTogSUNvZGVNYXBwZXJSZXNwb25zZSA9IHtcblx0XHRcdFx0dGV4dEVkaXQ6ICh0YXJnZXQ6IFVSSSwgZWRpdDogVGV4dEVkaXRbXSkgPT4ge1xuXHRcdFx0XHRcdGV4ZWN1dG9yLmVtaXRPbmUoZWRpdCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG5vdGVib29rRWRpdChfcmVzb3VyY2UsIF9lZGl0KSB7XG5cdFx0XHRcdFx0Ly9cblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvZGVNYXBwZXJTZXJ2aWNlLm1hcENvZGUocmVxdWVzdCwgcmVzcG9uc2UsIHRva2VuKTtcblx0XHRcdGlmIChyZXN1bHQ/LmVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHRleGVjdXRvci5yZWplY3QobmV3IEVycm9yKHJlc3VsdC5lcnJvck1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Tm90ZWJvb2tFZGl0cyhjb2RlQmxvY2s6IElDb2RlTWFwcGVyQ29kZUJsb2NrLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IEFzeW5jSXRlcmFibGU8W1VSSSwgVGV4dEVkaXRbXV0gfCBJQ2VsbEVkaXRPcGVyYXRpb25bXT4ge1xuXHRcdHJldHVybiBuZXcgQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFtVUkksIFRleHRFZGl0W11dIHwgSUNlbGxFZGl0T3BlcmF0aW9uW10+KGFzeW5jIGV4ZWN1dG9yID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3Q6IElDb2RlTWFwcGVyUmVxdWVzdCA9IHtcblx0XHRcdFx0Y29kZUJsb2NrczogW2NvZGVCbG9ja10sXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGxvY2F0aW9uOiAncGFuZWwnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzcG9uc2U6IElDb2RlTWFwcGVyUmVzcG9uc2UgPSB7XG5cdFx0XHRcdHRleHRFZGl0OiAodGFyZ2V0OiBVUkksIGVkaXRzOiBUZXh0RWRpdFtdKSA9PiB7XG5cdFx0XHRcdFx0ZXhlY3V0b3IuZW1pdE9uZShbdGFyZ2V0LCBlZGl0c10pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRub3RlYm9va0VkaXQoX3Jlc291cmNlLCBlZGl0KSB7XG5cdFx0XHRcdFx0ZXhlY3V0b3IuZW1pdE9uZShlZGl0KTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvZGVNYXBwZXJTZXJ2aWNlLm1hcENvZGUocmVxdWVzdCwgcmVzcG9uc2UsIHRva2VuKTtcblx0XHRcdGlmIChyZXN1bHQ/LmVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHRleGVjdXRvci5yZWplY3QobmV3IEVycm9yKHJlc3VsdC5lcnJvck1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2FpdEZvckZpcnN0RWxlbWVudDxUPihpdGVyYWJsZTogQXN5bmNJdGVyYWJsZTxUPik6IFByb21pc2U8QXN5bmNJdGVyYWJsZTxUPj4ge1xuXHRcdGNvbnN0IGl0ZXJhdG9yID0gaXRlcmFibGVbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk7XG5cdFx0bGV0IHJlc3VsdCA9IGF3YWl0IGl0ZXJhdG9yLm5leHQoKTtcblxuXHRcdGlmIChyZXN1bHQuZG9uZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YXN5bmMgKltTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRhc3luYyAqW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpIHtcblx0XHRcdFx0d2hpbGUgKCFyZXN1bHQuZG9uZSkge1xuXHRcdFx0XHRcdHlpZWxkIHJlc3VsdC52YWx1ZTtcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCBpdGVyYXRvci5uZXh0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhcHBseVdpdGhJbmxpbmVQcmV2aWV3KGVkaXRzOiBBc3luY0l0ZXJhYmxlPFRleHRFZGl0W10+LCBjb2RlRWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvciwgdG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlLCBhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogRWRpdFN1Z2dlc3Rpb25JZCB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJldmlld0VkaXRzLCBjb2RlRWRpdG9yLCBlZGl0cywgdG9rZW5Tb3VyY2UudG9rZW4sIGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlOb3RlYm9va0VkaXRzV2l0aElubGluZVByZXZpZXcoZWRpdHM6IEFzeW5jSXRlcmFibGU8W1VSSSwgVGV4dEVkaXRbXV0gfCBJQ2VsbEVkaXRPcGVyYXRpb25bXT4sIHVyaTogVVJJLCB0b2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXZpZXdOb3RlYm9va0VkaXRzLCB1cmksIGVkaXRzLCB0b2tlblNvdXJjZS50b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIHRyeVRvUmV2ZWFsQ29kZUJsb2NrKGNvZGVFZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLCBjb2RlQmxvY2s6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG1hdGNoID0gY29kZUJsb2NrLm1hdGNoKC8oXFxTW15cXG5dKilcXG4vKTsgLy8gc3Vic3RyaW5nIHRoYXQgc3RhcnRzIHdpdGggYSBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXIgYW5kIGVuZHMgd2l0aCBhIG5ld2xpbmVcblx0XHRpZiAobWF0Y2ggJiYgbWF0Y2hbMV0ubGVuZ3RoID4gMTApIHtcblx0XHRcdGNvbnN0IGZpbmRNYXRjaCA9IGNvZGVFZGl0b3IuZ2V0TW9kZWwoKS5maW5kTmV4dE1hdGNoKG1hdGNoWzFdLCB7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMSB9LCBmYWxzZSwgZmFsc2UsIG51bGwsIGZhbHNlKTtcblx0XHRcdGlmIChmaW5kTWF0Y2gpIHtcblx0XHRcdFx0Y29kZUVkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVyKGZpbmRNYXRjaC5yYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBub3RpZnkobWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0Ly90aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHsgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sIG1lc3NhZ2UgfSk7XG5cdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLmluZm8obWVzc2FnZSk7XG5cdH1cblxufVxuXG5mdW5jdGlvbiBub3RpZnlVc2VyQWN0aW9uKGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsIGNvbnRleHQ6IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0LCBhY3Rpb246IENoYXRVc2VyQWN0aW9uKSB7XG5cdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSkge1xuXHRcdGNoYXRTZXJ2aWNlLm5vdGlmeVVzZXJBY3Rpb24oe1xuXHRcdFx0YWdlbnRJZDogY29udGV4dC5lbGVtZW50LmFnZW50Py5pZCxcblx0XHRcdGNvbW1hbmQ6IGNvbnRleHQuZWxlbWVudC5zbGFzaENvbW1hbmQ/Lm5hbWUsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRyZXF1ZXN0SWQ6IGNvbnRleHQuZWxlbWVudC5yZXF1ZXN0SWQsXG5cdFx0XHRyZXN1bHQ6IGNvbnRleHQuZWxlbWVudC5yZXN1bHQsXG5cdFx0XHRhY3Rpb25cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVOb3RlYm9va0VkaXRvcihlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSk6IElBY3RpdmVOb3RlYm9va0VkaXRvciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdGlmIChhY3RpdmVFZGl0b3JQYW5lPy5nZXRJZCgpID09PSBOT1RFQk9PS19FRElUT1JfSUQpIHtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IGFjdGl2ZUVkaXRvclBhbmUuZ2V0Q29udHJvbCgpIGFzIElOb3RlYm9va0VkaXRvcjtcblx0XHRpZiAobm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIG5vdGVib29rRWRpdG9yO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRFZGl0YWJsZUFjdGl2ZUNvZGVFZGl0b3IoZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UpOiBJQWN0aXZlQ29kZUVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGFjdGl2ZUNvZGVFZGl0b3JJbk5vdGVib29rID0gZ2V0QWN0aXZlTm90ZWJvb2tFZGl0b3IoZWRpdG9yU2VydmljZSk/LmFjdGl2ZUNvZGVFZGl0b3I7XG5cdGlmIChhY3RpdmVDb2RlRWRpdG9ySW5Ob3RlYm9vayAmJiBhY3RpdmVDb2RlRWRpdG9ySW5Ob3RlYm9vay5oYXNUZXh0Rm9jdXMoKSAmJiBhY3RpdmVDb2RlRWRpdG9ySW5Ob3RlYm9vay5oYXNNb2RlbCgpKSB7XG5cdFx0cmV0dXJuIGFjdGl2ZUNvZGVFZGl0b3JJbk5vdGVib29rO1xuXHR9XG5cblx0bGV0IGNvZGVFZGl0b3IgPSBnZXRDb2RlRWRpdG9yKGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpO1xuXHRpZiAoIWNvZGVFZGl0b3IpIHtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JTZXJ2aWNlLnZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMpIHtcblx0XHRcdGNvZGVFZGl0b3IgPSBnZXRDb2RlRWRpdG9yKGVkaXRvcik7XG5cdFx0XHRpZiAoY29kZUVkaXRvcikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoIWNvZGVFZGl0b3IgfHwgIWNvZGVFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIGNvZGVFZGl0b3I7XG59XG5cbmZ1bmN0aW9uIGlzUmVhZE9ubHkobW9kZWw6IElUZXh0TW9kZWwsIHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSk6IGJvb2xlYW4ge1xuXHQvLyBDaGVjayBpZiBtb2RlbCBpcyBlZGl0YWJsZSwgY3VycmVudGx5IG9ubHkgc3VwcG9ydCB1bnRpdGxlZCBhbmQgdGV4dCBmaWxlXG5cdGNvbnN0IGFjdGl2ZVRleHRNb2RlbCA9IHRleHRGaWxlU2VydmljZS5maWxlcy5nZXQobW9kZWwudXJpKSA/PyB0ZXh0RmlsZVNlcnZpY2UudW50aXRsZWQuZ2V0KG1vZGVsLnVyaSk7XG5cdHJldHVybiAhIWFjdGl2ZVRleHRNb2RlbD8uaXNSZWFkb25seSgpO1xufVxuXG5mdW5jdGlvbiByZWluZGVudChjb2RlQmxvY2tDb250ZW50OiBzdHJpbmcsIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxldGlvblN0YXJ0TGluZTogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3QgbmV3Q29udGVudCA9IHN0cmluZ3Muc3BsaXRMaW5lcyhjb2RlQmxvY2tDb250ZW50KTtcblx0aWYgKG5ld0NvbnRlbnQubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGNvZGVCbG9ja0NvbnRlbnQ7XG5cdH1cblxuXHRjb25zdCBmb3JtYXR0aW5nT3B0aW9ucyA9IG1vZGVsLmdldEZvcm1hdHRpbmdPcHRpb25zKCk7XG5cdGNvbnN0IGNvZGVJbmRlbnRMZXZlbCA9IGNvbXB1dGVJbmRlbnRhdGlvbihtb2RlbC5nZXRMaW5lQ29udGVudChzZWxldGlvblN0YXJ0TGluZSksIGZvcm1hdHRpbmdPcHRpb25zLnRhYlNpemUpLmxldmVsO1xuXG5cdGNvbnN0IGluZGVudHMgPSBuZXdDb250ZW50Lm1hcChsaW5lID0+IGNvbXB1dGVJbmRlbnRhdGlvbihsaW5lLCBmb3JtYXR0aW5nT3B0aW9ucy50YWJTaXplKSk7XG5cblx0Ly8gZmluZCB0aGUgc21hbGxlc3QgaW5kZW50IGxldmVsIGluIHRoZSBjb2RlIGJsb2NrXG5cdGNvbnN0IG5ld0NvbnRlbnRJbmRlbnRMZXZlbCA9IGluZGVudHMucmVkdWNlPG51bWJlcj4oKG1pbiwgaW5kZW50LCBpbmRleCkgPT4ge1xuXHRcdGlmIChpbmRlbnQubGVuZ3RoICE9PSBuZXdDb250ZW50W2luZGV4XS5sZW5ndGgpIHsgLy8gaWdub3JlIGVtcHR5IGxpbmVzXG5cdFx0XHRyZXR1cm4gTWF0aC5taW4oaW5kZW50LmxldmVsLCBtaW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gbWluO1xuXHR9LCBOdW1iZXIuTUFYX1ZBTFVFKTtcblxuXHRpZiAobmV3Q29udGVudEluZGVudExldmVsID09PSBOdW1iZXIuTUFYX1ZBTFVFIHx8IG5ld0NvbnRlbnRJbmRlbnRMZXZlbCA9PT0gY29kZUluZGVudExldmVsKSB7XG5cdFx0Ly8gYWxsIGxpbmVzIGFyZSBlbXB0eSBvciB0aGUgaW5kZW50IGlzIGFscmVhZHkgY29ycmVjdFxuXHRcdHJldHVybiBjb2RlQmxvY2tDb250ZW50O1xuXHR9XG5cdGNvbnN0IG5ld0xpbmVzID0gW107XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbmV3Q29udGVudC5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IHsgbGV2ZWwsIGxlbmd0aCB9ID0gaW5kZW50c1tpXTtcblx0XHRjb25zdCBuZXdMZXZlbCA9IE1hdGgubWF4KDAsIGNvZGVJbmRlbnRMZXZlbCArIGxldmVsIC0gbmV3Q29udGVudEluZGVudExldmVsKTtcblx0XHRjb25zdCBuZXdJbmRlbnRhdGlvbiA9IGZvcm1hdHRpbmdPcHRpb25zLmluc2VydFNwYWNlcyA/ICcgJy5yZXBlYXQoZm9ybWF0dGluZ09wdGlvbnMudGFiU2l6ZSAqIG5ld0xldmVsKSA6ICdcXHQnLnJlcGVhdChuZXdMZXZlbCk7XG5cdFx0bmV3TGluZXMucHVzaChuZXdJbmRlbnRhdGlvbiArIG5ld0NvbnRlbnRbaV0uc3Vic3RyaW5nKGxlbmd0aCkpO1xuXHR9XG5cdHJldHVybiBuZXdMaW5lcy5qb2luKCdcXG4nKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zOlxuICogIC0gbGV2ZWw6IHRoZSBsaW5lJ3MgdGhlIGlkZW50IGxldmVsIGluIHRhYnNcbiAqICAtIGxlbmd0aDogdGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIG9mIHRoZSBsZWFkaW5nIHdoaXRlc3BhY2VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVJbmRlbnRhdGlvbihsaW5lOiBzdHJpbmcsIHRhYlNpemU6IG51bWJlcik6IHsgbGV2ZWw6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSB7XG5cdGxldCBuU3BhY2VzID0gMDtcblx0bGV0IGxldmVsID0gMDtcblx0bGV0IGkgPSAwO1xuXHRsZXQgbGVuZ3RoID0gMDtcblx0Y29uc3QgbGVuID0gbGluZS5sZW5ndGg7XG5cdHdoaWxlIChpIDwgbGVuKSB7XG5cdFx0Y29uc3QgY2hDb2RlID0gbGluZS5jaGFyQ29kZUF0KGkpO1xuXHRcdGlmIChjaENvZGUgPT09IENoYXJDb2RlLlNwYWNlKSB7XG5cdFx0XHRuU3BhY2VzKys7XG5cdFx0XHRpZiAoblNwYWNlcyA9PT0gdGFiU2l6ZSkge1xuXHRcdFx0XHRsZXZlbCsrO1xuXHRcdFx0XHRuU3BhY2VzID0gMDtcblx0XHRcdFx0bGVuZ3RoID0gaSArIDE7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChjaENvZGUgPT09IENoYXJDb2RlLlRhYikge1xuXHRcdFx0bGV2ZWwrKztcblx0XHRcdG5TcGFjZXMgPSAwO1xuXHRcdFx0bGVuZ3RoID0gaSArIDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRpKys7XG5cdH1cblx0cmV0dXJuIHsgbGV2ZWwsIGxlbmd0aCB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxlQUFlO0FBQ3hCLFlBQVksYUFBYTtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxxQkFBd0M7QUFDakQsU0FBUyxrQkFBa0Isd0JBQXdCO0FBQ25ELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsYUFBYTtBQUV0QixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFCQUF1QztBQUNoRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxhQUFhLDJCQUEyQjtBQUNqRCxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLFVBQThCLDBCQUEwQjtBQUNqRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUF3RSwwQkFBMEI7QUFDbEcsU0FBeUIsb0JBQW9CO0FBQzdDLFNBQWdDLGFBQWEsb0JBQW9CO0FBRzFELElBQU0sMkJBQU4sTUFBK0I7QUFBQSxFQUNyQyxZQUNrQyxlQUNFLGlCQUNBLGlCQUNFLG1CQUNOLGFBQ0ksaUJBQ0YsZUFDUyx3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
