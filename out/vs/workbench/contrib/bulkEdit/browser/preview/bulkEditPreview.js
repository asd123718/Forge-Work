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
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { URI } from "../../../../../base/common/uri.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { createTextBufferFactoryFromSnapshot } from "../../../../../editor/common/model/textModel.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { coalesceInPlace } from "../../../../../base/common/arrays.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { EditOperation } from "../../../../../editor/common/core/editOperation.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { ConflictDetector } from "../conflicts.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { localize } from "../../../../../nls.js";
import { extUri } from "../../../../../base/common/resources.js";
import { ResourceFileEdit, ResourceTextEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { SnippetParser } from "../../../../../editor/contrib/snippet/browser/snippetParser.js";
import { MicrotaskDelay } from "../../../../../base/common/symbols.js";
import { Schemas } from "../../../../../base/common/network.js";
class CheckedStates {
  constructor() {
    this._states = /* @__PURE__ */ new WeakMap();
    this._checkedCount = 0;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
  }
  dispose() {
    this._onDidChange.dispose();
  }
  get checkedCount() {
    return this._checkedCount;
  }
  isChecked(obj) {
    return this._states.get(obj) ?? false;
  }
  updateChecked(obj, value) {
    const valueNow = this._states.get(obj);
    if (valueNow === value) {
      return;
    }
    if (valueNow === void 0) {
      if (value) {
        this._checkedCount += 1;
      }
    } else {
      if (value) {
        this._checkedCount += 1;
      } else {
        this._checkedCount -= 1;
      }
    }
    this._states.set(obj, value);
    this._onDidChange.fire(obj);
  }
}
class BulkTextEdit {
  constructor(parent, textEdit) {
    this.parent = parent;
    this.textEdit = textEdit;
  }
}
var BulkFileOperationType = /* @__PURE__ */ ((BulkFileOperationType2) => {
  BulkFileOperationType2[BulkFileOperationType2["TextEdit"] = 1] = "TextEdit";
  BulkFileOperationType2[BulkFileOperationType2["Create"] = 2] = "Create";
  BulkFileOperationType2[BulkFileOperationType2["Delete"] = 4] = "Delete";
  BulkFileOperationType2[BulkFileOperationType2["Rename"] = 8] = "Rename";
  return BulkFileOperationType2;
})(BulkFileOperationType || {});
class BulkFileOperation {
  constructor(uri, parent) {
    this.uri = uri;
    this.parent = parent;
    this.type = 0;
    this.textEdits = [];
    this.originalEdits = /* @__PURE__ */ new Map();
  }
  addEdit(index, type, edit) {
    this.type |= type;
    this.originalEdits.set(index, edit);
    if (edit instanceof ResourceTextEdit) {
      this.textEdits.push(new BulkTextEdit(this, edit));
    } else if (type === 8 /* Rename */) {
      this.newUri = edit.newResource;
    }
  }
  needsConfirmation() {
    for (const [, edit] of this.originalEdits) {
      if (!this.parent.checked.isChecked(edit)) {
        return true;
      }
    }
    return false;
  }
}
const _BulkCategory = class _BulkCategory {
  constructor(metadata = _BulkCategory._defaultMetadata) {
    this.metadata = metadata;
    this.operationByResource = /* @__PURE__ */ new Map();
  }
  static keyOf(metadata) {
    return metadata?.label || "<default>";
  }
  get fileOperations() {
    return this.operationByResource.values();
  }
};
_BulkCategory._defaultMetadata = Object.freeze({
  label: localize("default", "Other"),
  icon: Codicon.symbolFile,
  needsConfirmation: false
});
let BulkCategory = _BulkCategory;
let BulkFileOperations = class {
  constructor(_bulkEdit, _fileService, instaService) {
    this._bulkEdit = _bulkEdit;
    this._fileService = _fileService;
    this.checked = new CheckedStates();
    this.fileOperations = [];
    this.categories = [];
    this.conflicts = instaService.createInstance(ConflictDetector, _bulkEdit);
  }
  static async create(accessor, bulkEdit) {
    const result = accessor.get(IInstantiationService).createInstance(BulkFileOperations, bulkEdit);
    return await result._init();
  }
  dispose() {
    this.checked.dispose();
    this.conflicts.dispose();
  }
  async _init() {
    const operationByResource = /* @__PURE__ */ new Map();
    const operationByCategory = /* @__PURE__ */ new Map();
    const newToOldUri = new ResourceMap();
    for (let idx = 0; idx < this._bulkEdit.length; idx++) {
      const edit = this._bulkEdit[idx];
      let uri;
      let type;
      this.checked.updateChecked(edit, !edit.metadata?.needsConfirmation);
      if (edit instanceof ResourceTextEdit) {
        type = 1 /* TextEdit */;
        uri = edit.resource;
      } else if (edit instanceof ResourceFileEdit) {
        if (edit.newResource && edit.oldResource) {
          type = 8 /* Rename */;
          uri = edit.oldResource;
          if (edit.options?.overwrite === void 0 && edit.options?.ignoreIfExists && await this._fileService.exists(uri)) {
            continue;
          }
          newToOldUri.set(edit.newResource, uri);
        } else if (edit.oldResource) {
          type = 4 /* Delete */;
          uri = edit.oldResource;
          if (edit.options?.ignoreIfNotExists && !await this._fileService.exists(uri)) {
            continue;
          }
        } else if (edit.newResource) {
          type = 2 /* Create */;
          uri = edit.newResource;
          if (edit.options?.overwrite === void 0 && edit.options?.ignoreIfExists && await this._fileService.exists(uri)) {
            continue;
          }
        } else {
          continue;
        }
      } else {
        continue;
      }
      const insert = (uri2, map) => {
        let key2 = extUri.getComparisonKey(uri2, true);
        let operation = map.get(key2);
        if (!operation && newToOldUri.has(uri2)) {
          uri2 = newToOldUri.get(uri2);
          key2 = extUri.getComparisonKey(uri2, true);
          operation = map.get(key2);
        }
        if (!operation) {
          operation = new BulkFileOperation(uri2, this);
          map.set(key2, operation);
        }
        operation.addEdit(idx, type, edit);
      };
      insert(uri, operationByResource);
      const key = BulkCategory.keyOf(edit.metadata);
      let category = operationByCategory.get(key);
      if (!category) {
        category = new BulkCategory(edit.metadata);
        operationByCategory.set(key, category);
      }
      insert(uri, category.operationByResource);
    }
    operationByResource.forEach((value) => this.fileOperations.push(value));
    operationByCategory.forEach((value) => this.categories.push(value));
    for (const file of this.fileOperations) {
      if (file.type !== 1 /* TextEdit */) {
        let checked = true;
        for (const edit of file.originalEdits.values()) {
          if (edit instanceof ResourceFileEdit) {
            checked = checked && this.checked.isChecked(edit);
          }
        }
        if (!checked) {
          for (const edit of file.originalEdits.values()) {
            this.checked.updateChecked(edit, checked);
          }
        }
      }
    }
    this.categories.sort((a, b) => {
      if (a.metadata.needsConfirmation === b.metadata.needsConfirmation) {
        return a.metadata.label.localeCompare(b.metadata.label);
      } else if (a.metadata.needsConfirmation) {
        return -1;
      } else {
        return 1;
      }
    });
    return this;
  }
  getWorkspaceEdit() {
    const result = [];
    let allAccepted = true;
    for (let i = 0; i < this._bulkEdit.length; i++) {
      const edit = this._bulkEdit[i];
      if (this.checked.isChecked(edit)) {
        result[i] = edit;
        continue;
      }
      allAccepted = false;
    }
    if (allAccepted) {
      return this._bulkEdit;
    }
    coalesceInPlace(result);
    return result;
  }
  async getFileEditOperation(edit) {
    const content = await edit.options.contents;
    if (!content) {
      return void 0;
    }
    return EditOperation.replaceMove(Range.lift({ startLineNumber: 0, startColumn: 0, endLineNumber: Number.MAX_VALUE, endColumn: 0 }), content.toString());
  }
  async getFileEdits(uri) {
    for (const file of this.fileOperations) {
      if (file.uri.toString() === uri.toString()) {
        const result = [];
        let ignoreAll = false;
        for (const edit of file.originalEdits.values()) {
          if (edit instanceof ResourceFileEdit) {
            result.push(this.getFileEditOperation(edit));
          } else if (edit instanceof ResourceTextEdit) {
            if (this.checked.isChecked(edit)) {
              result.push(Promise.resolve(EditOperation.replaceMove(Range.lift(edit.textEdit.range), !edit.textEdit.insertAsSnippet ? edit.textEdit.text : SnippetParser.asInsertText(edit.textEdit.text))));
            }
          } else if (!this.checked.isChecked(edit)) {
            ignoreAll = true;
          }
        }
        if (ignoreAll) {
          return [];
        }
        return (await Promise.all(result)).filter((r) => r !== void 0).sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
      }
    }
    return [];
  }
  getUriOfEdit(edit) {
    for (const file of this.fileOperations) {
      for (const value of file.originalEdits.values()) {
        if (value === edit) {
          return file.uri;
        }
      }
    }
    throw new Error("invalid edit");
  }
};
BulkFileOperations = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IInstantiationService)
], BulkFileOperations);
let BulkEditPreviewProvider = class {
  constructor(_operations, _languageService, _modelService, _textModelResolverService) {
    this._operations = _operations;
    this._languageService = _languageService;
    this._modelService = _modelService;
    this._textModelResolverService = _textModelResolverService;
    this._disposables = new DisposableStore();
    this._modelPreviewEdits = /* @__PURE__ */ new Map();
    this._instanceId = generateUuid();
    this._disposables.add(this._textModelResolverService.registerTextModelContentProvider(BulkEditPreviewProvider.Schema, this));
    this._ready = this._init();
  }
  static fromPreviewUri(uri) {
    return URI.parse(uri.query);
  }
  dispose() {
    this._disposables.dispose();
  }
  asPreviewUri(uri) {
    const path = uri.scheme === Schemas.untitled ? `/${uri.path}` : uri.path;
    return URI.from({ scheme: BulkEditPreviewProvider.Schema, authority: this._instanceId, path, query: uri.toString() });
  }
  async _init() {
    for (const operation of this._operations.fileOperations) {
      await this._applyTextEditsToPreviewModel(operation.uri);
    }
    this._disposables.add(Event.debounce(this._operations.checked.onDidChange, (_last, e) => e, MicrotaskDelay)((e) => {
      const uri = this._operations.getUriOfEdit(e);
      this._applyTextEditsToPreviewModel(uri);
    }));
  }
  async _applyTextEditsToPreviewModel(uri) {
    const model = await this._getOrCreatePreviewModel(uri);
    const undoEdits = this._modelPreviewEdits.get(model.id);
    if (undoEdits) {
      model.applyEdits(undoEdits);
    }
    const newEdits = await this._operations.getFileEdits(uri);
    const newUndoEdits = model.applyEdits(newEdits, true);
    this._modelPreviewEdits.set(model.id, newUndoEdits);
  }
  async _getOrCreatePreviewModel(uri) {
    const previewUri = this.asPreviewUri(uri);
    let model = this._modelService.getModel(previewUri);
    if (!model) {
      try {
        const ref = await this._textModelResolverService.createModelReference(uri);
        const sourceModel = ref.object.textEditorModel;
        model = this._modelService.createModel(
          createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()),
          this._languageService.createById(sourceModel.getLanguageId()),
          previewUri
        );
        ref.dispose();
      } catch {
        model = this._modelService.createModel(
          "",
          this._languageService.createByFilepathOrFirstLine(previewUri),
          previewUri
        );
      }
      queueMicrotask(async () => {
        this._disposables.add(await this._textModelResolverService.createModelReference(model.uri));
      });
    }
    return model;
  }
  async provideTextContent(previewUri) {
    if (previewUri.toString() === BulkEditPreviewProvider.emptyPreview.toString()) {
      return this._modelService.createModel("", null, previewUri);
    }
    await this._ready;
    return this._modelService.getModel(previewUri);
  }
};
BulkEditPreviewProvider.Schema = "vscode-bulkeditpreview-editor";
BulkEditPreviewProvider.emptyPreview = URI.from({ scheme: BulkEditPreviewProvider.Schema, fragment: "empty" });
BulkEditPreviewProvider = __decorateClass([
  __decorateParam(1, ILanguageService),
  __decorateParam(2, IModelService),
  __decorateParam(3, ITextModelService)
], BulkEditPreviewProvider);
export {
  BulkCategory,
  BulkEditPreviewProvider,
  BulkFileOperation,
  BulkFileOperationType,
  BulkFileOperations,
  BulkTextEdit,
  CheckedStates
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJ1bGtFZGl0XFxicm93c2VyXFxwcmV2aWV3XFxidWxrRWRpdFByZXZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VFZGl0TWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29hbGVzY2VJblBsYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24sIElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDb25mbGljdERldGVjdG9yIH0gZnJvbSAnLi4vY29uZmxpY3RzLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGV4dFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUVkaXQsIFJlc291cmNlRmlsZUVkaXQsIFJlc291cmNlVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgU25pcHBldFBhcnNlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0UGFyc2VyLmpzJztcbmltcG9ydCB7IE1pY3JvdGFza0RlbGF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3ltYm9scy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGVja2VkU3RhdGVzPFQgZXh0ZW5kcyBvYmplY3Q+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZXMgPSBuZXcgV2Vha01hcDxULCBib29sZWFuPigpO1xuXHRwcml2YXRlIF9jaGVja2VkQ291bnQ6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxUPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8VD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldCBjaGVja2VkQ291bnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoZWNrZWRDb3VudDtcblx0fVxuXG5cdGlzQ2hlY2tlZChvYmo6IFQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGVzLmdldChvYmopID8/IGZhbHNlO1xuXHR9XG5cblx0dXBkYXRlQ2hlY2tlZChvYmo6IFQsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWVOb3cgPSB0aGlzLl9zdGF0ZXMuZ2V0KG9iaik7XG5cdFx0aWYgKHZhbHVlTm93ID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodmFsdWVOb3cgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX2NoZWNrZWRDb3VudCArPSAxO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0dGhpcy5fY2hlY2tlZENvdW50ICs9IDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jaGVja2VkQ291bnQgLT0gMTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fc3RhdGVzLnNldChvYmosIHZhbHVlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKG9iaik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJ1bGtUZXh0RWRpdCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcGFyZW50OiBCdWxrRmlsZU9wZXJhdGlvbixcblx0XHRyZWFkb25seSB0ZXh0RWRpdDogUmVzb3VyY2VUZXh0RWRpdFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBCdWxrRmlsZU9wZXJhdGlvblR5cGUge1xuXHRUZXh0RWRpdCA9IDEsXG5cdENyZWF0ZSA9IDIsXG5cdERlbGV0ZSA9IDQsXG5cdFJlbmFtZSA9IDgsXG59XG5cbmV4cG9ydCBjbGFzcyBCdWxrRmlsZU9wZXJhdGlvbiB7XG5cblx0dHlwZSA9IDA7XG5cdHRleHRFZGl0czogQnVsa1RleHRFZGl0W10gPSBbXTtcblx0b3JpZ2luYWxFZGl0cyA9IG5ldyBNYXA8bnVtYmVyLCBSZXNvdXJjZVRleHRFZGl0IHwgUmVzb3VyY2VGaWxlRWRpdD4oKTtcblx0bmV3VXJpPzogVVJJO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHVyaTogVVJJLFxuXHRcdHJlYWRvbmx5IHBhcmVudDogQnVsa0ZpbGVPcGVyYXRpb25zXG5cdCkgeyB9XG5cblx0YWRkRWRpdChpbmRleDogbnVtYmVyLCB0eXBlOiBCdWxrRmlsZU9wZXJhdGlvblR5cGUsIGVkaXQ6IFJlc291cmNlVGV4dEVkaXQgfCBSZXNvdXJjZUZpbGVFZGl0KSB7XG5cdFx0dGhpcy50eXBlIHw9IHR5cGU7XG5cdFx0dGhpcy5vcmlnaW5hbEVkaXRzLnNldChpbmRleCwgZWRpdCk7XG5cdFx0aWYgKGVkaXQgaW5zdGFuY2VvZiBSZXNvdXJjZVRleHRFZGl0KSB7XG5cdFx0XHR0aGlzLnRleHRFZGl0cy5wdXNoKG5ldyBCdWxrVGV4dEVkaXQodGhpcywgZWRpdCkpO1xuXG5cdFx0fSBlbHNlIGlmICh0eXBlID09PSBCdWxrRmlsZU9wZXJhdGlvblR5cGUuUmVuYW1lKSB7XG5cdFx0XHR0aGlzLm5ld1VyaSA9IGVkaXQubmV3UmVzb3VyY2U7XG5cdFx0fVxuXHR9XG5cblx0bmVlZHNDb25maXJtYXRpb24oKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBbLCBlZGl0XSBvZiB0aGlzLm9yaWdpbmFsRWRpdHMpIHtcblx0XHRcdGlmICghdGhpcy5wYXJlbnQuY2hlY2tlZC5pc0NoZWNrZWQoZWRpdCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnVsa0NhdGVnb3J5IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfZGVmYXVsdE1ldGFkYXRhID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0bGFiZWw6IGxvY2FsaXplKCdkZWZhdWx0JywgXCJPdGhlclwiKSxcblx0XHRpY29uOiBDb2RpY29uLnN5bWJvbEZpbGUsXG5cdFx0bmVlZHNDb25maXJtYXRpb246IGZhbHNlXG5cdH0pO1xuXG5cdHN0YXRpYyBrZXlPZihtZXRhZGF0YT86IFdvcmtzcGFjZUVkaXRNZXRhZGF0YSkge1xuXHRcdHJldHVybiBtZXRhZGF0YT8ubGFiZWwgfHwgJzxkZWZhdWx0Pic7XG5cdH1cblxuXHRyZWFkb25seSBvcGVyYXRpb25CeVJlc291cmNlID0gbmV3IE1hcDxzdHJpbmcsIEJ1bGtGaWxlT3BlcmF0aW9uPigpO1xuXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IG1ldGFkYXRhOiBXb3Jrc3BhY2VFZGl0TWV0YWRhdGEgPSBCdWxrQ2F0ZWdvcnkuX2RlZmF1bHRNZXRhZGF0YSkgeyB9XG5cblx0Z2V0IGZpbGVPcGVyYXRpb25zKCk6IEl0ZXJhYmxlSXRlcmF0b3I8QnVsa0ZpbGVPcGVyYXRpb24+IHtcblx0XHRyZXR1cm4gdGhpcy5vcGVyYXRpb25CeVJlc291cmNlLnZhbHVlcygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCdWxrRmlsZU9wZXJhdGlvbnMge1xuXG5cdHN0YXRpYyBhc3luYyBjcmVhdGUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJ1bGtFZGl0OiBSZXNvdXJjZUVkaXRbXSk6IFByb21pc2U8QnVsa0ZpbGVPcGVyYXRpb25zPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoQnVsa0ZpbGVPcGVyYXRpb25zLCBidWxrRWRpdCk7XG5cdFx0cmV0dXJuIGF3YWl0IHJlc3VsdC5faW5pdCgpO1xuXHR9XG5cblx0cmVhZG9ubHkgY2hlY2tlZCA9IG5ldyBDaGVja2VkU3RhdGVzPFJlc291cmNlRWRpdD4oKTtcblxuXHRyZWFkb25seSBmaWxlT3BlcmF0aW9uczogQnVsa0ZpbGVPcGVyYXRpb25bXSA9IFtdO1xuXHRyZWFkb25seSBjYXRlZ29yaWVzOiBCdWxrQ2F0ZWdvcnlbXSA9IFtdO1xuXHRyZWFkb25seSBjb25mbGljdHM6IENvbmZsaWN0RGV0ZWN0b3I7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYnVsa0VkaXQ6IFJlc291cmNlRWRpdFtdLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmNvbmZsaWN0cyA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb25mbGljdERldGVjdG9yLCBfYnVsa0VkaXQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNoZWNrZWQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY29uZmxpY3RzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzeW5jIF9pbml0KCkge1xuXHRcdGNvbnN0IG9wZXJhdGlvbkJ5UmVzb3VyY2UgPSBuZXcgTWFwPHN0cmluZywgQnVsa0ZpbGVPcGVyYXRpb24+KCk7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uQnlDYXRlZ29yeSA9IG5ldyBNYXA8c3RyaW5nLCBCdWxrQ2F0ZWdvcnk+KCk7XG5cblx0XHRjb25zdCBuZXdUb09sZFVyaSA9IG5ldyBSZXNvdXJjZU1hcDxVUkk+KCk7XG5cblx0XHRmb3IgKGxldCBpZHggPSAwOyBpZHggPCB0aGlzLl9idWxrRWRpdC5sZW5ndGg7IGlkeCsrKSB7XG5cdFx0XHRjb25zdCBlZGl0ID0gdGhpcy5fYnVsa0VkaXRbaWR4XTtcblxuXHRcdFx0bGV0IHVyaTogVVJJO1xuXHRcdFx0bGV0IHR5cGU6IEJ1bGtGaWxlT3BlcmF0aW9uVHlwZTtcblxuXHRcdFx0Ly8gc3RvcmUgaW5pdGFsIGNoZWNrZWQgc3RhdGVcblx0XHRcdHRoaXMuY2hlY2tlZC51cGRhdGVDaGVja2VkKGVkaXQsICFlZGl0Lm1ldGFkYXRhPy5uZWVkc0NvbmZpcm1hdGlvbik7XG5cblx0XHRcdGlmIChlZGl0IGluc3RhbmNlb2YgUmVzb3VyY2VUZXh0RWRpdCkge1xuXHRcdFx0XHR0eXBlID0gQnVsa0ZpbGVPcGVyYXRpb25UeXBlLlRleHRFZGl0O1xuXHRcdFx0XHR1cmkgPSBlZGl0LnJlc291cmNlO1xuXG5cdFx0XHR9IGVsc2UgaWYgKGVkaXQgaW5zdGFuY2VvZiBSZXNvdXJjZUZpbGVFZGl0KSB7XG5cdFx0XHRcdGlmIChlZGl0Lm5ld1Jlc291cmNlICYmIGVkaXQub2xkUmVzb3VyY2UpIHtcblx0XHRcdFx0XHR0eXBlID0gQnVsa0ZpbGVPcGVyYXRpb25UeXBlLlJlbmFtZTtcblx0XHRcdFx0XHR1cmkgPSBlZGl0Lm9sZFJlc291cmNlO1xuXHRcdFx0XHRcdGlmIChlZGl0Lm9wdGlvbnM/Lm92ZXJ3cml0ZSA9PT0gdW5kZWZpbmVkICYmIGVkaXQub3B0aW9ucz8uaWdub3JlSWZFeGlzdHMgJiYgYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHVyaSkpIHtcblx0XHRcdFx0XHRcdC8vIG5vb3AgLT4gXCJzb2Z0XCIgcmVuYW1lIHRvIHNvbWV0aGluZyB0aGF0IGFscmVhZHkgZXhpc3RzXG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gbWFwIG5ld1Jlc291cmNlIG9udG8gb2xkUmVzb3VyY2Ugc28gdGhhdCB0ZXh0LWVkaXQgYXBwZWFyIGZvclxuXHRcdFx0XHRcdC8vIHRoZSBzYW1lIGZpbGUgZWxlbWVudFxuXHRcdFx0XHRcdG5ld1RvT2xkVXJpLnNldChlZGl0Lm5ld1Jlc291cmNlLCB1cmkpO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoZWRpdC5vbGRSZXNvdXJjZSkge1xuXHRcdFx0XHRcdHR5cGUgPSBCdWxrRmlsZU9wZXJhdGlvblR5cGUuRGVsZXRlO1xuXHRcdFx0XHRcdHVyaSA9IGVkaXQub2xkUmVzb3VyY2U7XG5cdFx0XHRcdFx0aWYgKGVkaXQub3B0aW9ucz8uaWdub3JlSWZOb3RFeGlzdHMgJiYgIWF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpKSB7XG5cdFx0XHRcdFx0XHQvLyBub29wIC0+IFwic29mdFwiIGRlbGV0ZSBzb21ldGhpbmcgdGhhdCBkb2Vzbid0IGV4aXN0XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSBlbHNlIGlmIChlZGl0Lm5ld1Jlc291cmNlKSB7XG5cdFx0XHRcdFx0dHlwZSA9IEJ1bGtGaWxlT3BlcmF0aW9uVHlwZS5DcmVhdGU7XG5cdFx0XHRcdFx0dXJpID0gZWRpdC5uZXdSZXNvdXJjZTtcblx0XHRcdFx0XHRpZiAoZWRpdC5vcHRpb25zPy5vdmVyd3JpdGUgPT09IHVuZGVmaW5lZCAmJiBlZGl0Lm9wdGlvbnM/Lmlnbm9yZUlmRXhpc3RzICYmIGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpKSB7XG5cdFx0XHRcdFx0XHQvLyBub29wIC0+IFwic29mdFwiIGNyZWF0ZSBzb21ldGhpbmcgdGhhdCBhbHJlYWR5IGV4aXN0c1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gaW52YWxpZCBlZGl0IC0+IHNraXBcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB1bnN1cHBvcnRlZCBlZGl0XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbnNlcnQgPSAodXJpOiBVUkksIG1hcDogTWFwPHN0cmluZywgQnVsa0ZpbGVPcGVyYXRpb24+KSA9PiB7XG5cdFx0XHRcdGxldCBrZXkgPSBleHRVcmkuZ2V0Q29tcGFyaXNvbktleSh1cmksIHRydWUpO1xuXHRcdFx0XHRsZXQgb3BlcmF0aW9uID0gbWFwLmdldChrZXkpO1xuXG5cdFx0XHRcdC8vIHJlbmFtZVxuXHRcdFx0XHRpZiAoIW9wZXJhdGlvbiAmJiBuZXdUb09sZFVyaS5oYXModXJpKSkge1xuXHRcdFx0XHRcdHVyaSA9IG5ld1RvT2xkVXJpLmdldCh1cmkpITtcblx0XHRcdFx0XHRrZXkgPSBleHRVcmkuZ2V0Q29tcGFyaXNvbktleSh1cmksIHRydWUpO1xuXHRcdFx0XHRcdG9wZXJhdGlvbiA9IG1hcC5nZXQoa2V5KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghb3BlcmF0aW9uKSB7XG5cdFx0XHRcdFx0b3BlcmF0aW9uID0gbmV3IEJ1bGtGaWxlT3BlcmF0aW9uKHVyaSwgdGhpcyk7XG5cdFx0XHRcdFx0bWFwLnNldChrZXksIG9wZXJhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3BlcmF0aW9uLmFkZEVkaXQoaWR4LCB0eXBlLCBlZGl0KTtcblx0XHRcdH07XG5cblx0XHRcdGluc2VydCh1cmksIG9wZXJhdGlvbkJ5UmVzb3VyY2UpO1xuXG5cdFx0XHQvLyBpbnNlcnQgaW50byBcInRoaXNcIiBjYXRlZ29yeVxuXHRcdFx0Y29uc3Qga2V5ID0gQnVsa0NhdGVnb3J5LmtleU9mKGVkaXQubWV0YWRhdGEpO1xuXHRcdFx0bGV0IGNhdGVnb3J5ID0gb3BlcmF0aW9uQnlDYXRlZ29yeS5nZXQoa2V5KTtcblx0XHRcdGlmICghY2F0ZWdvcnkpIHtcblx0XHRcdFx0Y2F0ZWdvcnkgPSBuZXcgQnVsa0NhdGVnb3J5KGVkaXQubWV0YWRhdGEpO1xuXHRcdFx0XHRvcGVyYXRpb25CeUNhdGVnb3J5LnNldChrZXksIGNhdGVnb3J5KTtcblx0XHRcdH1cblx0XHRcdGluc2VydCh1cmksIGNhdGVnb3J5Lm9wZXJhdGlvbkJ5UmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdG9wZXJhdGlvbkJ5UmVzb3VyY2UuZm9yRWFjaCh2YWx1ZSA9PiB0aGlzLmZpbGVPcGVyYXRpb25zLnB1c2godmFsdWUpKTtcblx0XHRvcGVyYXRpb25CeUNhdGVnb3J5LmZvckVhY2godmFsdWUgPT4gdGhpcy5jYXRlZ29yaWVzLnB1c2godmFsdWUpKTtcblxuXHRcdC8vIFwiY29ycmVjdFwiIGludmFsaWQgcGFyZW50LWNoZWNrIGNoaWxkIHN0YXRlcyB0aGF0IGlzXG5cdFx0Ly8gdW5jaGVja2VkIGZpbGUgZWRpdHMgKHJlbmFtZSwgY3JlYXRlLCBkZWxldGUpIHVuY2hlY2tcblx0XHQvLyBhbGwgZWRpdHMgZm9yIGEgZmlsZSwgZS5nIG5vIHRleHQgY2hhbmdlIHdpdGhvdXQgcmVuYW1lXG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIHRoaXMuZmlsZU9wZXJhdGlvbnMpIHtcblx0XHRcdGlmIChmaWxlLnR5cGUgIT09IEJ1bGtGaWxlT3BlcmF0aW9uVHlwZS5UZXh0RWRpdCkge1xuXHRcdFx0XHRsZXQgY2hlY2tlZCA9IHRydWU7XG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBmaWxlLm9yaWdpbmFsRWRpdHMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRpZiAoZWRpdCBpbnN0YW5jZW9mIFJlc291cmNlRmlsZUVkaXQpIHtcblx0XHRcdFx0XHRcdGNoZWNrZWQgPSBjaGVja2VkICYmIHRoaXMuY2hlY2tlZC5pc0NoZWNrZWQoZWRpdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghY2hlY2tlZCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBmaWxlLm9yaWdpbmFsRWRpdHMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuY2hlY2tlZC51cGRhdGVDaGVja2VkKGVkaXQsIGNoZWNrZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHNvcnQgKG9uY2UpIGNhdGVnb3JpZXMgYXRvcCB3aGljaCBoYXZlIHVuY29uZmlybWVkIGVkaXRzXG5cdFx0dGhpcy5jYXRlZ29yaWVzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLm1ldGFkYXRhLm5lZWRzQ29uZmlybWF0aW9uID09PSBiLm1ldGFkYXRhLm5lZWRzQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBhLm1ldGFkYXRhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5tZXRhZGF0YS5sYWJlbCk7XG5cdFx0XHR9IGVsc2UgaWYgKGEubWV0YWRhdGEubmVlZHNDb25maXJtYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGdldFdvcmtzcGFjZUVkaXQoKTogUmVzb3VyY2VFZGl0W10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUmVzb3VyY2VFZGl0W10gPSBbXTtcblx0XHRsZXQgYWxsQWNjZXB0ZWQgPSB0cnVlO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9idWxrRWRpdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZWRpdCA9IHRoaXMuX2J1bGtFZGl0W2ldO1xuXHRcdFx0aWYgKHRoaXMuY2hlY2tlZC5pc0NoZWNrZWQoZWRpdCkpIHtcblx0XHRcdFx0cmVzdWx0W2ldID0gZWRpdDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRhbGxBY2NlcHRlZCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChhbGxBY2NlcHRlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2J1bGtFZGl0O1xuXHRcdH1cblxuXHRcdC8vIG5vdCBhbGwgZWRpdHMgaGF2ZSBiZWVuIGFjY2VwdGVkXG5cdFx0Y29hbGVzY2VJblBsYWNlKHJlc3VsdCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RmlsZUVkaXRPcGVyYXRpb24oZWRpdDogUmVzb3VyY2VGaWxlRWRpdCk6IFByb21pc2U8SVNpbmdsZUVkaXRPcGVyYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZWRpdC5vcHRpb25zLmNvbnRlbnRzO1xuXHRcdGlmICghY29udGVudCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0cmV0dXJuIEVkaXRPcGVyYXRpb24ucmVwbGFjZU1vdmUoUmFuZ2UubGlmdCh7IHN0YXJ0TGluZU51bWJlcjogMCwgc3RhcnRDb2x1bW46IDAsIGVuZExpbmVOdW1iZXI6IE51bWJlci5NQVhfVkFMVUUsIGVuZENvbHVtbjogMCB9KSwgY29udGVudC50b1N0cmluZygpKTtcblx0fVxuXG5cdGFzeW5jIGdldEZpbGVFZGl0cyh1cmk6IFVSSSk6IFByb21pc2U8SVNpbmdsZUVkaXRPcGVyYXRpb25bXT4ge1xuXG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIHRoaXMuZmlsZU9wZXJhdGlvbnMpIHtcblx0XHRcdGlmIChmaWxlLnVyaS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSkge1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogUHJvbWlzZTxJU2luZ2xlRWRpdE9wZXJhdGlvbiB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdFx0XHRsZXQgaWdub3JlQWxsID0gZmFsc2U7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0IG9mIGZpbGUub3JpZ2luYWxFZGl0cy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdGlmIChlZGl0IGluc3RhbmNlb2YgUmVzb3VyY2VGaWxlRWRpdCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5nZXRGaWxlRWRpdE9wZXJhdGlvbihlZGl0KSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChlZGl0IGluc3RhbmNlb2YgUmVzb3VyY2VUZXh0RWRpdCkge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuY2hlY2tlZC5pc0NoZWNrZWQoZWRpdCkpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goUHJvbWlzZS5yZXNvbHZlKEVkaXRPcGVyYXRpb24ucmVwbGFjZU1vdmUoUmFuZ2UubGlmdChlZGl0LnRleHRFZGl0LnJhbmdlKSwgIWVkaXQudGV4dEVkaXQuaW5zZXJ0QXNTbmlwcGV0ID8gZWRpdC50ZXh0RWRpdC50ZXh0IDogU25pcHBldFBhcnNlci5hc0luc2VydFRleHQoZWRpdC50ZXh0RWRpdC50ZXh0KSkpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuY2hlY2tlZC5pc0NoZWNrZWQoZWRpdCkpIHtcblx0XHRcdFx0XHRcdC8vIFVOQ0hFQ0tFRCBXb3Jrc3BhY2VGaWxlRWRpdCBkaXNhYmxlcyBhbGwgdGV4dCBlZGl0c1xuXHRcdFx0XHRcdFx0aWdub3JlQWxsID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaWdub3JlQWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIChhd2FpdCBQcm9taXNlLmFsbChyZXN1bHQpKS5maWx0ZXIociA9PiByICE9PSB1bmRlZmluZWQpLnNvcnQoKGEsIGIpID0+IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhhLnJhbmdlLCBiLnJhbmdlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGdldFVyaU9mRWRpdChlZGl0OiBSZXNvdXJjZUVkaXQpOiBVUkkge1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiB0aGlzLmZpbGVPcGVyYXRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIGZpbGUub3JpZ2luYWxFZGl0cy52YWx1ZXMoKSkge1xuXHRcdFx0XHRpZiAodmFsdWUgPT09IGVkaXQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmlsZS51cmk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGVkaXQnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnVsa0VkaXRQcmV2aWV3UHJvdmlkZXIgaW1wbGVtZW50cyBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTY2hlbWEgPSAndnNjb2RlLWJ1bGtlZGl0cHJldmlldy1lZGl0b3InO1xuXG5cdHN0YXRpYyBlbXB0eVByZXZpZXcgPSBVUkkuZnJvbSh7IHNjaGVtZTogdGhpcy5TY2hlbWEsIGZyYWdtZW50OiAnZW1wdHknIH0pO1xuXG5cblx0c3RhdGljIGZyb21QcmV2aWV3VXJpKHVyaTogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKHVyaS5xdWVyeSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVhZHk6IFByb21pc2U8YW55Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxQcmV2aWV3RWRpdHMgPSBuZXcgTWFwPHN0cmluZywgSVNpbmdsZUVkaXRPcGVyYXRpb25bXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFuY2VJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wZXJhdGlvbnM6IEJ1bGtGaWxlT3BlcmF0aW9ucyxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoQnVsa0VkaXRQcmV2aWV3UHJvdmlkZXIuU2NoZW1hLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVhZHkgPSB0aGlzLl9pbml0KCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzUHJldmlld1VyaSh1cmk6IFVSSSk6IFVSSSB7XG5cdFx0Y29uc3QgcGF0aCA9IHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgPyBgLyR7dXJpLnBhdGh9YCA6IHVyaS5wYXRoO1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogQnVsa0VkaXRQcmV2aWV3UHJvdmlkZXIuU2NoZW1hLCBhdXRob3JpdHk6IHRoaXMuX2luc3RhbmNlSWQsIHBhdGgsIHF1ZXJ5OiB1cmkudG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2luaXQoKSB7XG5cdFx0Zm9yIChjb25zdCBvcGVyYXRpb24gb2YgdGhpcy5fb3BlcmF0aW9ucy5maWxlT3BlcmF0aW9ucykge1xuXHRcdFx0YXdhaXQgdGhpcy5fYXBwbHlUZXh0RWRpdHNUb1ByZXZpZXdNb2RlbChvcGVyYXRpb24udXJpKTtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmRlYm91bmNlKHRoaXMuX29wZXJhdGlvbnMuY2hlY2tlZC5vbkRpZENoYW5nZSwgKF9sYXN0LCBlKSA9PiBlLCBNaWNyb3Rhc2tEZWxheSkoZSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSB0aGlzLl9vcGVyYXRpb25zLmdldFVyaU9mRWRpdChlKTtcblx0XHRcdHRoaXMuX2FwcGx5VGV4dEVkaXRzVG9QcmV2aWV3TW9kZWwodXJpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseVRleHRFZGl0c1RvUHJldmlld01vZGVsKHVyaTogVVJJKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVByZXZpZXdNb2RlbCh1cmkpO1xuXG5cdFx0Ly8gdW5kbyBlZGl0cyB0aGF0IGhhdmUgYmVlbiBkb25lIGJlZm9yZVxuXHRcdGNvbnN0IHVuZG9FZGl0cyA9IHRoaXMuX21vZGVsUHJldmlld0VkaXRzLmdldChtb2RlbC5pZCk7XG5cdFx0aWYgKHVuZG9FZGl0cykge1xuXHRcdFx0bW9kZWwuYXBwbHlFZGl0cyh1bmRvRWRpdHMpO1xuXHRcdH1cblx0XHQvLyBhcHBseSBuZXcgZWRpdHMgYW5kIGtlZXAgKGZ1dHVyZSkgdW5kbyBlZGl0c1xuXHRcdGNvbnN0IG5ld0VkaXRzID0gYXdhaXQgdGhpcy5fb3BlcmF0aW9ucy5nZXRGaWxlRWRpdHModXJpKTtcblx0XHRjb25zdCBuZXdVbmRvRWRpdHMgPSBtb2RlbC5hcHBseUVkaXRzKG5ld0VkaXRzLCB0cnVlKTtcblx0XHR0aGlzLl9tb2RlbFByZXZpZXdFZGl0cy5zZXQobW9kZWwuaWQsIG5ld1VuZG9FZGl0cyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRPckNyZWF0ZVByZXZpZXdNb2RlbCh1cmk6IFVSSSkge1xuXHRcdGNvbnN0IHByZXZpZXdVcmkgPSB0aGlzLmFzUHJldmlld1VyaSh1cmkpO1xuXHRcdGxldCBtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChwcmV2aWV3VXJpKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyB0cnk6IGNvcHkgZXhpc3Rpbmdcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSk7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZU1vZGVsID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRcdG1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKFxuXHRcdFx0XHRcdGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVNuYXBzaG90KHNvdXJjZU1vZGVsLmNyZWF0ZVNuYXBzaG90KCkpLFxuXHRcdFx0XHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKHNvdXJjZU1vZGVsLmdldExhbmd1YWdlSWQoKSksXG5cdFx0XHRcdFx0cHJldmlld1VyaVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gY3JlYXRlIE5FVyBtb2RlbFxuXHRcdFx0XHRtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbChcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHR0aGlzLl9sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHByZXZpZXdVcmkpLFxuXHRcdFx0XHRcdHByZXZpZXdVcmlcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdC8vIHRoaXMgaXMgYSBsaXR0bGUgd2VpcmQgYnV0IG90aGVyd2lzZSBlZGl0b3JzIGFuZCBvdGhlciBjdXNvbWVyc1xuXHRcdFx0Ly8gd2lsbCBkaXNwb3NlIG15IG1vZGVscyBiZWZvcmUgdGhleSBzaG91bGQgYmUgZGlzcG9zZWQuLi5cblx0XHRcdC8vIEFuZCBhbGwgb2YgdGhpcyBpcyBvZmYgdGhlIGV2ZW50bG9vcCB0byBwcmV2ZW50IGVuZGxlc3MgcmVjdXJzaW9uXG5cdFx0XHRxdWV1ZU1pY3JvdGFzayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChhd2FpdCB0aGlzLl90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UobW9kZWwhLnVyaSkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVUZXh0Q29udGVudChwcmV2aWV3VXJpOiBVUkkpIHtcblx0XHRpZiAocHJldmlld1VyaS50b1N0cmluZygpID09PSBCdWxrRWRpdFByZXZpZXdQcm92aWRlci5lbXB0eVByZXZpZXcudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgbnVsbCwgcHJldmlld1VyaSk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3JlYWR5O1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocHJldmlld1VyaSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBb0MseUJBQXlCO0FBQzdELFNBQVMsV0FBVztBQUNwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDJDQUEyQztBQUVwRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxxQkFBMkM7QUFDcEQsU0FBMkIsNkJBQTZCO0FBQ3hELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUF1QixrQkFBa0Isd0JBQXdCO0FBQ2pFLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFFakIsTUFBTSxjQUFnQztBQUFBLEVBQXRDO0FBRU4sU0FBaUIsVUFBVSxvQkFBSSxRQUFvQjtBQUNuRCxTQUFRLGdCQUF3QjtBQUVoQyxTQUFpQixlQUFlLElBQUksUUFBVztBQUMvQyxTQUFTLGNBQXdCLEtBQUssYUFBYTtBQUFBO0FBQUEsRUFFbkQsVUFBZ0I7QUFDZixTQUFLLGFBQWEsUUFBUTtBQUFBLEVBQzNCO0FBQUEsRUFFQSxJQUFJLGVBQWU7QUFDbEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsVUFBVSxLQUFpQjtBQUMxQixXQUFPLEtBQUssUUFBUSxJQUFJLEdBQUcsS0FBSztBQUFBLEVBQ2pDO0FBQUEsRUFFQSxjQUFjLEtBQVEsT0FBc0I7QUFDM0MsVUFBTSxXQUFXLEtBQUssUUFBUSxJQUFJLEdBQUc7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QUFDdEQsUUFBSSxXQUFXO0FBQ2QsWUFBTSxXQUFXLFNBQVM7QUFBQSxJQUMzQjtBQUVBLFVBQU0sV0FBVyxNQUFNLEtBQUssWUFBWSxhQUFhLEdBQUc7QUFDeEQsVUFBTSxlQUFlLE1BQU0sV0FBVyxVQUFVLElBQUk7QUFDcEQsU0FBSyxtQkFBbUIsSUFBSSxNQUFNLElBQUksWUFBWTtBQUFBLEVBQ25EO0FBQUEsRUFFQSxNQUFjLHlCQUF5QixLQUFVO0FBQ2hELFVBQU0sYUFBYSxLQUFLLGFBQWEsR0FBRztBQUN4QyxRQUFJLFFBQVEsS0FBSyxjQUFjLFNBQVMsVUFBVTtBQUNsRCxRQUFJLENBQUMsT0FBTztBQUNYLFVBQUk7QUFFSCxjQUFNLE1BQU0sTUFBTSxLQUFLLDBCQUEwQixxQkFBcUIsR0FBRztBQUN6RSxjQUFNLGNBQWMsSUFBSSxPQUFPO0FBQy9CLGdCQUFRLEtBQUssY0FBYztBQUFBLFVBQzFCLG9DQUFvQyxZQUFZLGVBQWUsQ0FBQztBQUFBLFVBQ2hFLEtBQUssaUJBQWlCLFdBQVcsWUFBWSxjQUFjLENBQUM7QUFBQSxVQUM1RDtBQUFBLFFBQ0Q7QUFDQSxZQUFJLFFBQVE7QUFBQSxNQUViLFFBQVE7QUFFUCxnQkFBUSxLQUFLLGNBQWM7QUFBQSxVQUMxQjtBQUFBLFVBQ0EsS0FBSyxpQkFBaUIsNEJBQTRCLFVBQVU7QUFBQSxVQUM1RDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBSUEscUJBQWUsWUFBWTtBQUMxQixhQUFLLGFBQWEsSUFBSSxNQUFNLEtBQUssMEJBQTBCLHFCQUFxQixNQUFPLEdBQUcsQ0FBQztBQUFBLE1BQzVGLENBQUM7QUFBQSxJQUNGO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sbUJBQW1CLFlBQWlCO0FBQ3pDLFFBQUksV0FBVyxTQUFTLE1BQU0sd0JBQXdCLGFBQWEsU0FBUyxHQUFHO0FBQzlFLGFBQU8sS0FBSyxjQUFjLFlBQVksSUFBSSxNQUFNLFVBQVU7QUFBQSxJQUMzRDtBQUNBLFVBQU0sS0FBSztBQUNYLFdBQU8sS0FBSyxjQUFjLFNBQVMsVUFBVTtBQUFBLEVBQzlDO0FBQ0Q7QUFuR2Esd0JBRVksU0FBUztBQUZyQix3QkFJTCxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsd0JBQUssUUFBUSxVQUFVLFFBQVEsQ0FBQztBQUo3RCwwQkFBTjtBQUFBLEVBa0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBCVTsiLAogICJuYW1lcyI6IFsiQnVsa0ZpbGVPcGVyYXRpb25UeXBlIiwgInVyaSIsICJrZXkiXQp9Cg==
