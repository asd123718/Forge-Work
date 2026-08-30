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
import { dispose } from "../../../../base/common/lifecycle.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { SingleModelEditStackElement, MultiModelEditStackElement } from "../../../../editor/common/model/editStack.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ResourceTextEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { SnippetParser } from "../../../../editor/contrib/snippet/browser/snippetParser.js";
class ModelEditTask {
  constructor(_modelReference) {
    this._modelReference = _modelReference;
    this.model = this._modelReference.object.textEditorModel;
    this._edits = [];
  }
  dispose() {
    this._modelReference.dispose();
  }
  isNoOp() {
    if (this._edits.length > 0) {
      return false;
    }
    if (this._newEol !== void 0 && this._newEol !== this.model.getEndOfLineSequence()) {
      return false;
    }
    return true;
  }
  addEdit(resourceEdit) {
    this._expectedModelVersionId = resourceEdit.versionId;
    const { textEdit } = resourceEdit;
    if (typeof textEdit.eol === "number") {
      this._newEol = textEdit.eol;
    }
    if (!textEdit.range && !textEdit.text) {
      return;
    }
    if (Range.isEmpty(textEdit.range) && !textEdit.text) {
      return;
    }
    let range;
    if (!textEdit.range) {
      range = this.model.getFullModelRange();
    } else {
      range = Range.lift(textEdit.range);
    }
    this._edits.push({ ...EditOperation.replaceMove(range, textEdit.text), insertAsSnippet: textEdit.insertAsSnippet, keepWhitespace: textEdit.keepWhitespace });
  }
  validate() {
    if (typeof this._expectedModelVersionId === "undefined" || this.model.getVersionId() === this._expectedModelVersionId) {
      return { canApply: true };
    }
    return { canApply: false, reason: this.model.uri };
  }
  getBeforeCursorState() {
    return null;
  }
  apply(reason) {
    if (this._edits.length > 0) {
      this._edits = this._edits.map(this._transformSnippetStringToInsertText, this).sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
      this.model.pushEditOperations(null, this._edits, () => null, void 0, reason);
    }
    if (this._newEol !== void 0) {
      this.model.pushEOL(this._newEol);
    }
  }
  _transformSnippetStringToInsertText(edit) {
    if (!edit.insertAsSnippet) {
      return edit;
    }
    if (!edit.text) {
      return edit;
    }
    const text = SnippetParser.asInsertText(edit.text);
    return { ...edit, insertAsSnippet: false, text };
  }
}
class EditorEditTask extends ModelEditTask {
  constructor(modelReference, editor) {
    super(modelReference);
    this._editor = editor;
  }
  getBeforeCursorState() {
    return this._canUseEditor() ? this._editor.getSelections() : null;
  }
  apply(reason) {
    if (!this._canUseEditor()) {
      super.apply();
      return;
    }
    if (this._edits.length > 0) {
      const snippetCtrl = SnippetController2.get(this._editor);
      if (snippetCtrl && this._edits.some((edit) => edit.insertAsSnippet)) {
        const snippetEdits = [];
        for (const edit of this._edits) {
          if (edit.range && edit.text !== null) {
            snippetEdits.push({
              range: Range.lift(edit.range),
              template: edit.insertAsSnippet ? edit.text : SnippetParser.escape(edit.text),
              keepWhitespace: edit.keepWhitespace
            });
          }
        }
        snippetCtrl.apply(snippetEdits, { undoStopBefore: false, undoStopAfter: false });
      } else {
        this._edits = this._edits.map(this._transformSnippetStringToInsertText, this).sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
        this._editor.executeEdits(reason, this._edits);
      }
    }
    if (this._newEol !== void 0) {
      if (this._editor.hasModel()) {
        this._editor.getModel().pushEOL(this._newEol);
      }
    }
  }
  _canUseEditor() {
    return this._editor?.getModel()?.uri.toString() === this.model.uri.toString();
  }
}
let BulkTextEdits = class {
  constructor(_label, _code, _editor, _undoRedoGroup, _undoRedoSource, _progress, _token, edits, _editorWorker, _modelService, _textModelResolverService, _undoRedoService) {
    this._label = _label;
    this._code = _code;
    this._editor = _editor;
    this._undoRedoGroup = _undoRedoGroup;
    this._undoRedoSource = _undoRedoSource;
    this._progress = _progress;
    this._token = _token;
    this._editorWorker = _editorWorker;
    this._modelService = _modelService;
    this._textModelResolverService = _textModelResolverService;
    this._undoRedoService = _undoRedoService;
    this._edits = new ResourceMap();
    for (const edit of edits) {
      let array = this._edits.get(edit.resource);
      if (!array) {
        array = [];
        this._edits.set(edit.resource, array);
      }
      array.push(edit);
    }
  }
  _validateBeforePrepare() {
    for (const array of this._edits.values()) {
      for (const edit of array) {
        if (typeof edit.versionId === "number") {
          const model = this._modelService.getModel(edit.resource);
          if (model && model.getVersionId() !== edit.versionId) {
            throw new Error(`${model.uri.toString()} has changed in the meantime`);
          }
        }
      }
    }
  }
  async _createEditsTasks() {
    const tasks = [];
    const promises = [];
    for (const [key, edits] of this._edits) {
      const promise = this._textModelResolverService.createModelReference(key).then(async (ref) => {
        let task;
        let makeMinimal = false;
        if (this._editor?.getModel()?.uri.toString() === ref.object.textEditorModel.uri.toString()) {
          task = new EditorEditTask(ref, this._editor);
          makeMinimal = true;
        } else {
          task = new ModelEditTask(ref);
        }
        tasks.push(task);
        if (!makeMinimal) {
          edits.forEach(task.addEdit, task);
          return;
        }
        const makeGroupMoreMinimal = async (start2, end) => {
          const oldEdits = edits.slice(start2, end);
          const newEdits = await this._editorWorker.computeMoreMinimalEdits(ref.object.textEditorModel.uri, oldEdits.map((e) => e.textEdit), false);
          if (!newEdits) {
            oldEdits.forEach(task.addEdit, task);
          } else {
            const versionId = oldEdits[0]?.versionId;
            newEdits.forEach((edit) => task.addEdit(new ResourceTextEdit(ref.object.textEditorModel.uri, edit, versionId, void 0)));
          }
        };
        let start = 0;
        let i = 0;
        for (; i < edits.length; i++) {
          if (edits[i].textEdit.insertAsSnippet || edits[i].metadata) {
            await makeGroupMoreMinimal(start, i);
            task.addEdit(edits[i]);
            start = i + 1;
          }
        }
        await makeGroupMoreMinimal(start, i);
      });
      promises.push(promise);
    }
    await Promise.all(promises);
    return tasks;
  }
  _validateTasks(tasks) {
    for (const task of tasks) {
      const result = task.validate();
      if (!result.canApply) {
        return result;
      }
    }
    return { canApply: true };
  }
  async apply(reason) {
    this._validateBeforePrepare();
    const tasks = await this._createEditsTasks();
    try {
      if (this._token.isCancellationRequested) {
        return [];
      }
      const resources = [];
      const validation = this._validateTasks(tasks);
      if (!validation.canApply) {
        throw new Error(`${validation.reason.toString()} has changed in the meantime`);
      }
      if (tasks.length === 1) {
        const task = tasks[0];
        if (!task.isNoOp()) {
          const singleModelEditStackElement = new SingleModelEditStackElement(this._label, this._code, task.model, task.getBeforeCursorState());
          this._undoRedoService.pushElement(singleModelEditStackElement, this._undoRedoGroup, this._undoRedoSource);
          task.apply(reason);
          singleModelEditStackElement.close();
          resources.push(task.model.uri);
        }
        this._progress.report(void 0);
      } else {
        const multiModelEditStackElement = new MultiModelEditStackElement(
          this._label,
          this._code,
          tasks.map((t) => new SingleModelEditStackElement(this._label, this._code, t.model, t.getBeforeCursorState()))
        );
        this._undoRedoService.pushElement(multiModelEditStackElement, this._undoRedoGroup, this._undoRedoSource);
        for (const task of tasks) {
          task.apply();
          this._progress.report(void 0);
          resources.push(task.model.uri);
        }
        multiModelEditStackElement.close();
      }
      return resources;
    } finally {
      dispose(tasks);
    }
  }
};
BulkTextEdits = __decorateClass([
  __decorateParam(8, IEditorWorkerService),
  __decorateParam(9, IModelService),
  __decorateParam(10, ITextModelService),
  __decorateParam(11, IUndoRedoService)
], BulkTextEdits);
export {
  BulkTextEdits
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJ1bGtFZGl0XFxicm93c2VyXFxidWxrVGV4dEVkaXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzcG9zZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uLCBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlLCBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlLCBVbmRvUmVkb0dyb3VwLCBVbmRvUmVkb1NvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBTaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnQsIE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC9lZGl0U3RhY2suanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IFNuaXBwZXRQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldFBhcnNlci5qcyc7XG5pbXBvcnQgeyBJU25pcHBldEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldFNlc3Npb24uanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsRWRpdFNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5cbnR5cGUgVmFsaWRhdGlvblJlc3VsdCA9IHsgY2FuQXBwbHk6IHRydWUgfSB8IHsgY2FuQXBwbHk6IGZhbHNlOyByZWFzb246IFVSSSB9O1xuXG50eXBlIElTaW5nbGVTbmlwcGV0RWRpdE9wZXJhdGlvbiA9IElTaW5nbGVFZGl0T3BlcmF0aW9uICYgeyBpbnNlcnRBc1NuaXBwZXQ/OiBib29sZWFuOyBrZWVwV2hpdGVzcGFjZT86IGJvb2xlYW4gfTtcblxuY2xhc3MgTW9kZWxFZGl0VGFzayBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBtb2RlbDogSVRleHRNb2RlbDtcblxuXHRwcml2YXRlIF9leHBlY3RlZE1vZGVsVmVyc2lvbklkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBfZWRpdHM6IElTaW5nbGVTbmlwcGV0RWRpdE9wZXJhdGlvbltdO1xuXHRwcm90ZWN0ZWQgX25ld0VvbDogRW5kT2ZMaW5lU2VxdWVuY2UgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfbW9kZWxSZWZlcmVuY2U6IElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPikge1xuXHRcdHRoaXMubW9kZWwgPSB0aGlzLl9tb2RlbFJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdHRoaXMuX2VkaXRzID0gW107XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX21vZGVsUmVmZXJlbmNlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGlzTm9PcCgpIHtcblx0XHRpZiAodGhpcy5fZWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gY29udGFpbnMgdGV4dHVhbCBlZGl0c1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fbmV3RW9sICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fbmV3RW9sICE9PSB0aGlzLm1vZGVsLmdldEVuZE9mTGluZVNlcXVlbmNlKCkpIHtcblx0XHRcdC8vIGNvbnRhaW5zIGFuIGVvbCBjaGFuZ2UgdGhhdCBpcyBhIHJlYWwgY2hhbmdlXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YWRkRWRpdChyZXNvdXJjZUVkaXQ6IFJlc291cmNlVGV4dEVkaXQpOiB2b2lkIHtcblx0XHR0aGlzLl9leHBlY3RlZE1vZGVsVmVyc2lvbklkID0gcmVzb3VyY2VFZGl0LnZlcnNpb25JZDtcblx0XHRjb25zdCB7IHRleHRFZGl0IH0gPSByZXNvdXJjZUVkaXQ7XG5cblx0XHRpZiAodHlwZW9mIHRleHRFZGl0LmVvbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdC8vIGhvbm9yIGVvbC1jaGFuZ2Vcblx0XHRcdHRoaXMuX25ld0VvbCA9IHRleHRFZGl0LmVvbDtcblx0XHR9XG5cdFx0aWYgKCF0ZXh0RWRpdC5yYW5nZSAmJiAhdGV4dEVkaXQudGV4dCkge1xuXHRcdFx0Ly8gbGFja3MgYm90aCBhIHJhbmdlIGFuZCB0aGUgdGV4dFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoUmFuZ2UuaXNFbXB0eSh0ZXh0RWRpdC5yYW5nZSkgJiYgIXRleHRFZGl0LnRleHQpIHtcblx0XHRcdC8vIG5vLW9wIGVkaXQgKHJlcGxhY2UgZW1wdHkgcmFuZ2Ugd2l0aCBlbXB0eSB0ZXh0KVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGNyZWF0ZSBlZGl0IG9wZXJhdGlvblxuXHRcdGxldCByYW5nZTogUmFuZ2U7XG5cdFx0aWYgKCF0ZXh0RWRpdC5yYW5nZSkge1xuXHRcdFx0cmFuZ2UgPSB0aGlzLm1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJhbmdlID0gUmFuZ2UubGlmdCh0ZXh0RWRpdC5yYW5nZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRzLnB1c2goeyAuLi5FZGl0T3BlcmF0aW9uLnJlcGxhY2VNb3ZlKHJhbmdlLCB0ZXh0RWRpdC50ZXh0KSwgaW5zZXJ0QXNTbmlwcGV0OiB0ZXh0RWRpdC5pbnNlcnRBc1NuaXBwZXQsIGtlZXBXaGl0ZXNwYWNlOiB0ZXh0RWRpdC5rZWVwV2hpdGVzcGFjZSB9KTtcblx0fVxuXG5cdHZhbGlkYXRlKCk6IFZhbGlkYXRpb25SZXN1bHQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5fZXhwZWN0ZWRNb2RlbFZlcnNpb25JZCA9PT0gJ3VuZGVmaW5lZCcgfHwgdGhpcy5tb2RlbC5nZXRWZXJzaW9uSWQoKSA9PT0gdGhpcy5fZXhwZWN0ZWRNb2RlbFZlcnNpb25JZCkge1xuXHRcdFx0cmV0dXJuIHsgY2FuQXBwbHk6IHRydWUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgY2FuQXBwbHk6IGZhbHNlLCByZWFzb246IHRoaXMubW9kZWwudXJpIH07XG5cdH1cblxuXHRnZXRCZWZvcmVDdXJzb3JTdGF0ZSgpOiBTZWxlY3Rpb25bXSB8IG51bGwge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YXBwbHkocmVhc29uPzogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9lZGl0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9lZGl0cyA9IHRoaXMuX2VkaXRzXG5cdFx0XHRcdC5tYXAodGhpcy5fdHJhbnNmb3JtU25pcHBldFN0cmluZ1RvSW5zZXJ0VGV4dCwgdGhpcykgLy8gbm8gZWRpdG9yIC0+IG5vIHNuaXBwZXQgbW9kZVxuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpKTtcblx0XHRcdHRoaXMubW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIHRoaXMuX2VkaXRzLCAoKSA9PiBudWxsLCB1bmRlZmluZWQsIHJlYXNvbik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9uZXdFb2wgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tb2RlbC5wdXNoRU9MKHRoaXMuX25ld0VvbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF90cmFuc2Zvcm1TbmlwcGV0U3RyaW5nVG9JbnNlcnRUZXh0KGVkaXQ6IElTaW5nbGVTbmlwcGV0RWRpdE9wZXJhdGlvbik6IElTaW5nbGVTbmlwcGV0RWRpdE9wZXJhdGlvbiB7XG5cdFx0Ly8gdHJhbnNmb3JtIGEgc25pcHBldCBlZGl0IChhbmQgb25seSB0aG9zZSkgaW50byBhIG5vcm1hbCB0ZXh0IGVkaXRcblx0XHQvLyBmb3IgdGhhdCB3ZSBuZWVkIHRvIHBhcnNlIHRoZSBzbmlwcGV0IGFuZCBnZXQgaXRzIGFjdHVhbCB0ZXh0LCBlLmcgd2l0aG91dCBwbGFjZWhvbGRlclxuXHRcdC8vIG9yIHZhcmlhYmxlIHN5bnRheGVzXG5cdFx0aWYgKCFlZGl0Lmluc2VydEFzU25pcHBldCkge1xuXHRcdFx0cmV0dXJuIGVkaXQ7XG5cdFx0fVxuXHRcdGlmICghZWRpdC50ZXh0KSB7XG5cdFx0XHRyZXR1cm4gZWRpdDtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dCA9IFNuaXBwZXRQYXJzZXIuYXNJbnNlcnRUZXh0KGVkaXQudGV4dCk7XG5cdFx0cmV0dXJuIHsgLi4uZWRpdCwgaW5zZXJ0QXNTbmlwcGV0OiBmYWxzZSwgdGV4dCB9O1xuXHR9XG59XG5cbmNsYXNzIEVkaXRvckVkaXRUYXNrIGV4dGVuZHMgTW9kZWxFZGl0VGFzayB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcjtcblxuXHRjb25zdHJ1Y3Rvcihtb2RlbFJlZmVyZW5jZTogSVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+LCBlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0c3VwZXIobW9kZWxSZWZlcmVuY2UpO1xuXHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEJlZm9yZUN1cnNvclN0YXRlKCk6IFNlbGVjdGlvbltdIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhblVzZUVkaXRvcigpID8gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKSA6IG51bGw7XG5cdH1cblxuXHRvdmVycmlkZSBhcHBseShyZWFzb24/OiBUZXh0TW9kZWxFZGl0U291cmNlKTogdm9pZCB7XG5cblx0XHQvLyBDaGVjayB0aGF0IHRoZSBlZGl0b3IgaXMgc3RpbGwgZm9yIHRoZSB3YW50ZWQgbW9kZWwuIEl0IG1pZ2h0IGhhdmUgY2hhbmdlZCBpbiB0aGVcblx0XHQvLyBtZWFudGltZSBhbmQgdGhhdCBtZWFucyB3ZSBjYW5ub3QgdXNlIHRoZSBlZGl0b3IgYW55bW9yZSAoaW5zdGVhZCB3ZSBwZXJmb3JtIHRoZSBlZGl0IHRocm91Z2ggdGhlIG1vZGVsKVxuXHRcdGlmICghdGhpcy5fY2FuVXNlRWRpdG9yKCkpIHtcblx0XHRcdHN1cGVyLmFwcGx5KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2VkaXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNuaXBwZXRDdHJsID0gU25pcHBldENvbnRyb2xsZXIyLmdldCh0aGlzLl9lZGl0b3IpO1xuXHRcdFx0aWYgKHNuaXBwZXRDdHJsICYmIHRoaXMuX2VkaXRzLnNvbWUoZWRpdCA9PiBlZGl0Lmluc2VydEFzU25pcHBldCkpIHtcblx0XHRcdFx0Ly8gc29tZSBlZGl0IGlzIGEgc25pcHBldCBlZGl0IC0+IHVzZSBzbmlwcGV0IGNvbnRyb2xsZXIgYW5kIElTbmlwcGV0RWRpdHNcblx0XHRcdFx0Y29uc3Qgc25pcHBldEVkaXRzOiBJU25pcHBldEVkaXRbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5fZWRpdHMpIHtcblx0XHRcdFx0XHRpZiAoZWRpdC5yYW5nZSAmJiBlZGl0LnRleHQgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdHNuaXBwZXRFZGl0cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmxpZnQoZWRpdC5yYW5nZSksXG5cdFx0XHRcdFx0XHRcdHRlbXBsYXRlOiBlZGl0Lmluc2VydEFzU25pcHBldCA/IGVkaXQudGV4dCA6IFNuaXBwZXRQYXJzZXIuZXNjYXBlKGVkaXQudGV4dCksXG5cdFx0XHRcdFx0XHRcdGtlZXBXaGl0ZXNwYWNlOiBlZGl0LmtlZXBXaGl0ZXNwYWNlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0c25pcHBldEN0cmwuYXBwbHkoc25pcHBldEVkaXRzLCB7IHVuZG9TdG9wQmVmb3JlOiBmYWxzZSwgdW5kb1N0b3BBZnRlcjogZmFsc2UgfSk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG5vcm1hbCBlZGl0XG5cdFx0XHRcdHRoaXMuX2VkaXRzID0gdGhpcy5fZWRpdHNcblx0XHRcdFx0XHQubWFwKHRoaXMuX3RyYW5zZm9ybVNuaXBwZXRTdHJpbmdUb0luc2VydFRleHQsIHRoaXMpIC8vIG1peGVkIGVkaXRzIChzbmlwcGV0IGFuZCBub3JtYWwpIC0+IG5vIHNuaXBwZXQgbW9kZVxuXHRcdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYS5yYW5nZSwgYi5yYW5nZSkpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZXhlY3V0ZUVkaXRzKHJlYXNvbiwgdGhpcy5fZWRpdHMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fbmV3RW9sICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmICh0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKS5wdXNoRU9MKHRoaXMuX25ld0VvbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2FuVXNlRWRpdG9yKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3I/LmdldE1vZGVsKCk/LnVyaS50b1N0cmluZygpID09PSB0aGlzLm1vZGVsLnVyaS50b1N0cmluZygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCdWxrVGV4dEVkaXRzIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0cyA9IG5ldyBSZXNvdXJjZU1hcDxSZXNvdXJjZVRleHRFZGl0W10+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWw6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb2RlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvU291cmNlOiBVbmRvUmVkb1NvdXJjZSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzczogSVByb2dyZXNzPHZvaWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRlZGl0czogUmVzb3VyY2VUZXh0RWRpdFtdLFxuXHRcdEBJRWRpdG9yV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JXb3JrZXI6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVVuZG9SZWRvU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2Vcblx0KSB7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRcdGxldCBhcnJheSA9IHRoaXMuX2VkaXRzLmdldChlZGl0LnJlc291cmNlKTtcblx0XHRcdGlmICghYXJyYXkpIHtcblx0XHRcdFx0YXJyYXkgPSBbXTtcblx0XHRcdFx0dGhpcy5fZWRpdHMuc2V0KGVkaXQucmVzb3VyY2UsIGFycmF5KTtcblx0XHRcdH1cblx0XHRcdGFycmF5LnB1c2goZWRpdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVCZWZvcmVQcmVwYXJlKCk6IHZvaWQge1xuXHRcdC8vIEZpcnN0IGNoZWNrIGlmIGxvYWRlZCBtb2RlbHMgd2VyZSBub3QgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRmb3IgKGNvbnN0IGFycmF5IG9mIHRoaXMuX2VkaXRzLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgYXJyYXkpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBlZGl0LnZlcnNpb25JZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChlZGl0LnJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAobW9kZWwgJiYgbW9kZWwuZ2V0VmVyc2lvbklkKCkgIT09IGVkaXQudmVyc2lvbklkKSB7XG5cdFx0XHRcdFx0XHQvLyBtb2RlbCBjaGFuZ2VkIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke21vZGVsLnVyaS50b1N0cmluZygpfSBoYXMgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWVgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVFZGl0c1Rhc2tzKCk6IFByb21pc2U8TW9kZWxFZGl0VGFza1tdPiB7XG5cblx0XHRjb25zdCB0YXNrczogTW9kZWxFZGl0VGFza1tdID0gW107XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IFtrZXksIGVkaXRzXSBvZiB0aGlzLl9lZGl0cykge1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IHRoaXMuX3RleHRNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShrZXkpLnRoZW4oYXN5bmMgcmVmID0+IHtcblx0XHRcdFx0bGV0IHRhc2s6IE1vZGVsRWRpdFRhc2s7XG5cdFx0XHRcdGxldCBtYWtlTWluaW1hbCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAodGhpcy5fZWRpdG9yPy5nZXRNb2RlbCgpPy51cmkudG9TdHJpbmcoKSA9PT0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwudXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHR0YXNrID0gbmV3IEVkaXRvckVkaXRUYXNrKHJlZiwgdGhpcy5fZWRpdG9yKTtcblx0XHRcdFx0XHRtYWtlTWluaW1hbCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGFzayA9IG5ldyBNb2RlbEVkaXRUYXNrKHJlZik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGFza3MucHVzaCh0YXNrKTtcblxuXG5cdFx0XHRcdGlmICghbWFrZU1pbmltYWwpIHtcblx0XHRcdFx0XHRlZGl0cy5mb3JFYWNoKHRhc2suYWRkRWRpdCwgdGFzayk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gZ3JvdXAgZWRpdHMgYnkgdHlwZSAoc25pcHBldCwgbWV0YWRhdGEsIG9yIHNpbXBsZSkgYW5kIG1ha2Ugc2ltcGxlIGdyb3VwcyBtb3JlIG1pbmltYWxcblxuXHRcdFx0XHRjb25zdCBtYWtlR3JvdXBNb3JlTWluaW1hbCA9IGFzeW5jIChzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG9sZEVkaXRzID0gZWRpdHMuc2xpY2Uoc3RhcnQsIGVuZCk7XG5cdFx0XHRcdFx0Y29uc3QgbmV3RWRpdHMgPSBhd2FpdCB0aGlzLl9lZGl0b3JXb3JrZXIuY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMocmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwudXJpLCBvbGRFZGl0cy5tYXAoZSA9PiBlLnRleHRFZGl0KSwgZmFsc2UpO1xuXHRcdFx0XHRcdGlmICghbmV3RWRpdHMpIHtcblx0XHRcdFx0XHRcdG9sZEVkaXRzLmZvckVhY2godGFzay5hZGRFZGl0LCB0YXNrKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gQWxsIGVkaXRzIGluIHRoZSBncm91cCBoYXZlIHRoZSBzYW1lIHZlcnNpb24gaWQgc2luY2Ugd2UgZ3JvdXAgdGhlIGVkaXRzXG5cdFx0XHRcdFx0XHQvLyBpbiB0aGUgY29uc3RydWN0b3IgYnkgdGhlIHJlc291cmNlIFVSSS5cblx0XHRcdFx0XHRcdGNvbnN0IHZlcnNpb25JZCA9IG9sZEVkaXRzWzBdPy52ZXJzaW9uSWQ7XG5cdFx0XHRcdFx0XHRuZXdFZGl0cy5mb3JFYWNoKGVkaXQgPT4gdGFzay5hZGRFZGl0KG5ldyBSZXNvdXJjZVRleHRFZGl0KHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLnVyaSwgZWRpdCwgdmVyc2lvbklkLCB1bmRlZmluZWQpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGxldCBzdGFydCA9IDA7XG5cdFx0XHRcdGxldCBpID0gMDtcblx0XHRcdFx0Zm9yICg7IGkgPCBlZGl0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmIChlZGl0c1tpXS50ZXh0RWRpdC5pbnNlcnRBc1NuaXBwZXQgfHwgZWRpdHNbaV0ubWV0YWRhdGEpIHtcblx0XHRcdFx0XHRcdGF3YWl0IG1ha2VHcm91cE1vcmVNaW5pbWFsKHN0YXJ0LCBpKTsgLy8gZ3JvdXBlZCBlZGl0cyB1bnRpbCBub3dcblx0XHRcdFx0XHRcdHRhc2suYWRkRWRpdChlZGl0c1tpXSk7IC8vIHRoaXMgZWRpdFxuXHRcdFx0XHRcdFx0c3RhcnQgPSBpICsgMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgbWFrZUdyb3VwTW9yZU1pbmltYWwoc3RhcnQsIGkpO1xuXG5cdFx0XHR9KTtcblx0XHRcdHByb21pc2VzLnB1c2gocHJvbWlzZSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdHJldHVybiB0YXNrcztcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlVGFza3ModGFza3M6IE1vZGVsRWRpdFRhc2tbXSk6IFZhbGlkYXRpb25SZXN1bHQge1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGFzay52YWxpZGF0ZSgpO1xuXHRcdFx0aWYgKCFyZXN1bHQuY2FuQXBwbHkpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgY2FuQXBwbHk6IHRydWUgfTtcblx0fVxuXG5cdGFzeW5jIGFwcGx5KHJlYXNvbj86IFRleHRNb2RlbEVkaXRTb3VyY2UpOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cblx0XHR0aGlzLl92YWxpZGF0ZUJlZm9yZVByZXBhcmUoKTtcblx0XHRjb25zdCB0YXNrcyA9IGF3YWl0IHRoaXMuX2NyZWF0ZUVkaXRzVGFza3MoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5fdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXNvdXJjZXM6IFVSSVtdID0gW107XG5cdFx0XHRjb25zdCB2YWxpZGF0aW9uID0gdGhpcy5fdmFsaWRhdGVUYXNrcyh0YXNrcyk7XG5cdFx0XHRpZiAoIXZhbGlkYXRpb24uY2FuQXBwbHkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke3ZhbGlkYXRpb24ucmVhc29uLnRvU3RyaW5nKCl9IGhhcyBjaGFuZ2VkIGluIHRoZSBtZWFudGltZWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRhc2tzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQvLyBUaGlzIGVkaXQgdG91Y2hlcyBhIHNpbmdsZSBtb2RlbCA9PiBrZWVwIHRoaW5ncyBzaW1wbGVcblx0XHRcdFx0Y29uc3QgdGFzayA9IHRhc2tzWzBdO1xuXHRcdFx0XHRpZiAoIXRhc2suaXNOb09wKCkpIHtcblx0XHRcdFx0XHRjb25zdCBzaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnQgPSBuZXcgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50KHRoaXMuX2xhYmVsLCB0aGlzLl9jb2RlLCB0YXNrLm1vZGVsLCB0YXNrLmdldEJlZm9yZUN1cnNvclN0YXRlKCkpO1xuXHRcdFx0XHRcdHRoaXMuX3VuZG9SZWRvU2VydmljZS5wdXNoRWxlbWVudChzaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnQsIHRoaXMuX3VuZG9SZWRvR3JvdXAsIHRoaXMuX3VuZG9SZWRvU291cmNlKTtcblx0XHRcdFx0XHR0YXNrLmFwcGx5KHJlYXNvbik7XG5cdFx0XHRcdFx0c2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50LmNsb3NlKCk7XG5cdFx0XHRcdFx0cmVzb3VyY2VzLnB1c2godGFzay5tb2RlbC51cmkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Byb2dyZXNzLnJlcG9ydCh1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gcHJlcGFyZSBtdWx0aSBtb2RlbCB1bmRvIGVsZW1lbnRcblx0XHRcdFx0Y29uc3QgbXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQgPSBuZXcgTXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQoXG5cdFx0XHRcdFx0dGhpcy5fbGFiZWwsXG5cdFx0XHRcdFx0dGhpcy5fY29kZSxcblx0XHRcdFx0XHR0YXNrcy5tYXAodCA9PiBuZXcgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50KHRoaXMuX2xhYmVsLCB0aGlzLl9jb2RlLCB0Lm1vZGVsLCB0LmdldEJlZm9yZUN1cnNvclN0YXRlKCkpKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UucHVzaEVsZW1lbnQobXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQsIHRoaXMuX3VuZG9SZWRvR3JvdXAsIHRoaXMuX3VuZG9SZWRvU291cmNlKTtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdFx0dGFzay5hcHBseSgpO1xuXHRcdFx0XHRcdHRoaXMuX3Byb2dyZXNzLnJlcG9ydCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJlc291cmNlcy5wdXNoKHRhc2subW9kZWwudXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtdWx0aU1vZGVsRWRpdFN0YWNrRWxlbWVudC5jbG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VzO1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2UodGFza3MpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXdDO0FBR2pELFNBQVMscUJBQTJDO0FBQ3BELFNBQVMsYUFBYTtBQUd0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
