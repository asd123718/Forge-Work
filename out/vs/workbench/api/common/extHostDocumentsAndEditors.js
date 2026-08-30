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
import * as assert from "../../../base/common/assert.js";
import { Emitter } from "../../../base/common/event.js";
import { dispose } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { MainContext } from "./extHost.protocol.js";
import { ExtHostDocumentData } from "./extHostDocumentData.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ExtHostTextEditor } from "./extHostTextEditor.js";
import * as typeConverters from "./extHostTypeConverters.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ResourceMap } from "../../../base/common/map.js";
import { Schemas } from "../../../base/common/network.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Lazy } from "../../../base/common/lazy.js";
class Reference {
  constructor(value) {
    this.value = value;
    this._count = 0;
  }
  ref() {
    this._count++;
  }
  unref() {
    return --this._count === 0;
  }
}
let ExtHostDocumentsAndEditors = class {
  constructor(_extHostRpc, _logService) {
    this._extHostRpc = _extHostRpc;
    this._logService = _logService;
    this._activeEditorId = null;
    this._editors = /* @__PURE__ */ new Map();
    this._documents = new ResourceMap();
    this._onDidAddDocuments = new Emitter();
    this._onDidRemoveDocuments = new Emitter();
    this._onDidChangeVisibleTextEditors = new Emitter();
    this._onDidChangeActiveTextEditor = new Emitter();
    this.onDidAddDocuments = this._onDidAddDocuments.event;
    this.onDidRemoveDocuments = this._onDidRemoveDocuments.event;
    this.onDidChangeVisibleTextEditors = this._onDidChangeVisibleTextEditors.event;
    this.onDidChangeActiveTextEditor = this._onDidChangeActiveTextEditor.event;
  }
  $acceptDocumentsAndEditorsDelta(delta) {
    this.acceptDocumentsAndEditorsDelta(delta);
  }
  acceptDocumentsAndEditorsDelta(delta) {
    const removedDocuments = [];
    const addedDocuments = [];
    const removedEditors = [];
    if (delta.removedDocuments) {
      for (const uriComponent of delta.removedDocuments) {
        const uri = URI.revive(uriComponent);
        const data = this._documents.get(uri);
        if (data?.unref()) {
          this._documents.delete(uri);
          removedDocuments.push(data.value);
        }
      }
    }
    if (delta.addedDocuments) {
      for (const data of delta.addedDocuments) {
        const resource = URI.revive(data.uri);
        let ref = this._documents.get(resource);
        if (ref) {
          if (resource.scheme !== Schemas.vscodeNotebookCell && resource.scheme !== Schemas.vscodeInteractiveInput) {
            throw new Error(`document '${resource} already exists!'`);
          }
        }
        if (!ref) {
          ref = new Reference(new ExtHostDocumentData(
            this._extHostRpc.getProxy(MainContext.MainThreadDocuments),
            resource,
            data.lines,
            data.EOL,
            data.versionId,
            data.languageId,
            data.isDirty,
            data.encoding
          ));
          this._documents.set(resource, ref);
          addedDocuments.push(ref.value);
        }
        ref.ref();
      }
    }
    if (delta.removedEditors) {
      for (const id of delta.removedEditors) {
        const editor = this._editors.get(id);
        this._editors.delete(id);
        if (editor) {
          removedEditors.push(editor);
        }
      }
    }
    if (delta.addedEditors) {
      for (const data of delta.addedEditors) {
        const resource = URI.revive(data.documentUri);
        assert.ok(this._documents.has(resource), `document '${resource}' does not exist`);
        assert.ok(!this._editors.has(data.id), `editor '${data.id}' already exists!`);
        const documentData = this._documents.get(resource).value;
        const editor = new ExtHostTextEditor(
          data.id,
          this._extHostRpc.getProxy(MainContext.MainThreadTextEditors),
          this._logService,
          new Lazy(() => documentData.document),
          data.selections.map(typeConverters.Selection.to),
          data.options,
          data.visibleRanges.map((range) => typeConverters.Range.to(range)),
          typeof data.editorPosition === "number" ? typeConverters.ViewColumn.to(data.editorPosition) : void 0
        );
        this._editors.set(data.id, editor);
      }
    }
    if (delta.newActiveEditor !== void 0) {
      assert.ok(delta.newActiveEditor === null || this._editors.has(delta.newActiveEditor), `active editor '${delta.newActiveEditor}' does not exist`);
      this._activeEditorId = delta.newActiveEditor;
    }
    dispose(removedDocuments);
    dispose(removedEditors);
    if (delta.removedDocuments) {
      this._onDidRemoveDocuments.fire(removedDocuments);
    }
    if (delta.addedDocuments) {
      this._onDidAddDocuments.fire(addedDocuments);
    }
    if (delta.removedEditors || delta.addedEditors) {
      this._onDidChangeVisibleTextEditors.fire(this.allEditors().map((editor) => editor.value));
    }
    if (delta.newActiveEditor !== void 0) {
      this._onDidChangeActiveTextEditor.fire(this.activeEditor());
    }
  }
  getDocument(uri) {
    return this._documents.get(uri)?.value;
  }
  allDocuments() {
    return Iterable.map(this._documents.values(), (ref) => ref.value);
  }
  getEditor(id) {
    return this._editors.get(id);
  }
  activeEditor(internal) {
    if (!this._activeEditorId) {
      return void 0;
    }
    const editor = this._editors.get(this._activeEditorId);
    if (internal) {
      return editor;
    } else {
      return editor?.value;
    }
  }
  allEditors() {
    return [...this._editors.values()];
  }
};
ExtHostDocumentsAndEditors = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService)
], ExtHostDocumentsAndEditors);
const IExtHostDocumentsAndEditors = createDecorator("IExtHostDocumentsAndEditors");
export {
  ExtHostDocumentsAndEditors,
  IExtHostDocumentsAndEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnNTaGFwZSwgSURvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSwgTWFpbkNvbnRleHQgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50RGF0YSB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50RGF0YS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RUZXh0RWRpdG9yIH0gZnJvbSAnLi9leHRIb3N0VGV4dEVkaXRvci5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydGVycyBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuXG5jbGFzcyBSZWZlcmVuY2U8VD4ge1xuXHRwcml2YXRlIF9jb3VudCA9IDA7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHZhbHVlOiBUKSB7IH1cblx0cmVmKCkge1xuXHRcdHRoaXMuX2NvdW50Kys7XG5cdH1cblx0dW5yZWYoKSB7XG5cdFx0cmV0dXJuIC0tdGhpcy5fY291bnQgPT09IDA7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIGltcGxlbWVudHMgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnNTaGFwZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2FjdGl2ZUVkaXRvcklkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JzID0gbmV3IE1hcDxzdHJpbmcsIEV4dEhvc3RUZXh0RWRpdG9yPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHMgPSBuZXcgUmVzb3VyY2VNYXA8UmVmZXJlbmNlPEV4dEhvc3REb2N1bWVudERhdGE+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWRkRG9jdW1lbnRzID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgRXh0SG9zdERvY3VtZW50RGF0YVtdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZURvY3VtZW50cyA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IEV4dEhvc3REb2N1bWVudERhdGFbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmxlVGV4dEVkaXRvcnMgPSBuZXcgRW1pdHRlcjxyZWFkb25seSB2c2NvZGUuVGV4dEVkaXRvcltdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZVRleHRFZGl0b3IgPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGV4dEVkaXRvciB8IHVuZGVmaW5lZD4oKTtcblxuXHRyZWFkb25seSBvbkRpZEFkZERvY3VtZW50czogRXZlbnQ8cmVhZG9ubHkgRXh0SG9zdERvY3VtZW50RGF0YVtdPiA9IHRoaXMuX29uRGlkQWRkRG9jdW1lbnRzLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZURvY3VtZW50czogRXZlbnQ8cmVhZG9ubHkgRXh0SG9zdERvY3VtZW50RGF0YVtdPiA9IHRoaXMuX29uRGlkUmVtb3ZlRG9jdW1lbnRzLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2libGVUZXh0RWRpdG9yczogRXZlbnQ8cmVhZG9ubHkgdnNjb2RlLlRleHRFZGl0b3JbXT4gPSB0aGlzLl9vbkRpZENoYW5nZVZpc2libGVUZXh0RWRpdG9ycy5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVUZXh0RWRpdG9yOiBFdmVudDx2c2NvZGUuVGV4dEVkaXRvciB8IHVuZGVmaW5lZD4gPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVRleHRFZGl0b3IuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkgeyB9XG5cblx0JGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YShkZWx0YTogSURvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSk6IHZvaWQge1xuXHRcdHRoaXMuYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKGRlbHRhKTtcblx0fVxuXG5cdGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YShkZWx0YTogSURvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgcmVtb3ZlZERvY3VtZW50czogRXh0SG9zdERvY3VtZW50RGF0YVtdID0gW107XG5cdFx0Y29uc3QgYWRkZWREb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudERhdGFbXSA9IFtdO1xuXHRcdGNvbnN0IHJlbW92ZWRFZGl0b3JzOiBFeHRIb3N0VGV4dEVkaXRvcltdID0gW107XG5cblx0XHRpZiAoZGVsdGEucmVtb3ZlZERvY3VtZW50cykge1xuXHRcdFx0Zm9yIChjb25zdCB1cmlDb21wb25lbnQgb2YgZGVsdGEucmVtb3ZlZERvY3VtZW50cykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKHVyaUNvbXBvbmVudCk7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kb2N1bWVudHMuZ2V0KHVyaSk7XG5cdFx0XHRcdGlmIChkYXRhPy51bnJlZigpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZG9jdW1lbnRzLmRlbGV0ZSh1cmkpO1xuXHRcdFx0XHRcdHJlbW92ZWREb2N1bWVudHMucHVzaChkYXRhLnZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZWx0YS5hZGRlZERvY3VtZW50cykge1xuXHRcdFx0Zm9yIChjb25zdCBkYXRhIG9mIGRlbHRhLmFkZGVkRG9jdW1lbnRzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnJldml2ZShkYXRhLnVyaSk7XG5cdFx0XHRcdGxldCByZWYgPSB0aGlzLl9kb2N1bWVudHMuZ2V0KHJlc291cmNlKTtcblxuXHRcdFx0XHQvLyBkb3VibGUgY2hlY2sgLT4gb25seSBub3RlYm9vayBjZWxsIGRvY3VtZW50cyBzaG91bGQgYmVcblx0XHRcdFx0Ly8gcmVmZXJlbmNlZC9vcGVuZWQgbW9yZSB0aGFuIG9uY2UuLi5cblx0XHRcdFx0aWYgKHJlZikge1xuXHRcdFx0XHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsICYmIHJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVJbnRlcmFjdGl2ZUlucHV0KSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGRvY3VtZW50ICcke3Jlc291cmNlfSBhbHJlYWR5IGV4aXN0cyEnYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcmVmKSB7XG5cdFx0XHRcdFx0cmVmID0gbmV3IFJlZmVyZW5jZShuZXcgRXh0SG9zdERvY3VtZW50RGF0YShcblx0XHRcdFx0XHRcdHRoaXMuX2V4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZERvY3VtZW50cyksXG5cdFx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHRcdGRhdGEubGluZXMsXG5cdFx0XHRcdFx0XHRkYXRhLkVPTCxcblx0XHRcdFx0XHRcdGRhdGEudmVyc2lvbklkLFxuXHRcdFx0XHRcdFx0ZGF0YS5sYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0ZGF0YS5pc0RpcnR5LFxuXHRcdFx0XHRcdFx0ZGF0YS5lbmNvZGluZ1xuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdHRoaXMuX2RvY3VtZW50cy5zZXQocmVzb3VyY2UsIHJlZik7XG5cdFx0XHRcdFx0YWRkZWREb2N1bWVudHMucHVzaChyZWYudmFsdWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVmLnJlZigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZWx0YS5yZW1vdmVkRWRpdG9ycykge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBkZWx0YS5yZW1vdmVkRWRpdG9ycykge1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JzLmdldChpZCk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMuZGVsZXRlKGlkKTtcblx0XHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRcdHJlbW92ZWRFZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZWx0YS5hZGRlZEVkaXRvcnMpIHtcblx0XHRcdGZvciAoY29uc3QgZGF0YSBvZiBkZWx0YS5hZGRlZEVkaXRvcnMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucmV2aXZlKGRhdGEuZG9jdW1lbnRVcmkpO1xuXHRcdFx0XHRhc3NlcnQub2sodGhpcy5fZG9jdW1lbnRzLmhhcyhyZXNvdXJjZSksIGBkb2N1bWVudCAnJHtyZXNvdXJjZX0nIGRvZXMgbm90IGV4aXN0YCk7XG5cdFx0XHRcdGFzc2VydC5vayghdGhpcy5fZWRpdG9ycy5oYXMoZGF0YS5pZCksIGBlZGl0b3IgJyR7ZGF0YS5pZH0nIGFscmVhZHkgZXhpc3RzIWApO1xuXG5cdFx0XHRcdGNvbnN0IGRvY3VtZW50RGF0YSA9IHRoaXMuX2RvY3VtZW50cy5nZXQocmVzb3VyY2UpIS52YWx1ZTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gbmV3IEV4dEhvc3RUZXh0RWRpdG9yKFxuXHRcdFx0XHRcdGRhdGEuaWQsXG5cdFx0XHRcdFx0dGhpcy5fZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkVGV4dEVkaXRvcnMpLFxuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UsXG5cdFx0XHRcdFx0bmV3IExhenkoKCkgPT4gZG9jdW1lbnREYXRhLmRvY3VtZW50KSxcblx0XHRcdFx0XHRkYXRhLnNlbGVjdGlvbnMubWFwKHR5cGVDb252ZXJ0ZXJzLlNlbGVjdGlvbi50byksXG5cdFx0XHRcdFx0ZGF0YS5vcHRpb25zLFxuXHRcdFx0XHRcdGRhdGEudmlzaWJsZVJhbmdlcy5tYXAocmFuZ2UgPT4gdHlwZUNvbnZlcnRlcnMuUmFuZ2UudG8ocmFuZ2UpKSxcblx0XHRcdFx0XHR0eXBlb2YgZGF0YS5lZGl0b3JQb3NpdGlvbiA9PT0gJ251bWJlcicgPyB0eXBlQ29udmVydGVycy5WaWV3Q29sdW1uLnRvKGRhdGEuZWRpdG9yUG9zaXRpb24pIDogdW5kZWZpbmVkXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMuc2V0KGRhdGEuaWQsIGVkaXRvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRlbHRhLm5ld0FjdGl2ZUVkaXRvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhc3NlcnQub2soZGVsdGEubmV3QWN0aXZlRWRpdG9yID09PSBudWxsIHx8IHRoaXMuX2VkaXRvcnMuaGFzKGRlbHRhLm5ld0FjdGl2ZUVkaXRvciksIGBhY3RpdmUgZWRpdG9yICcke2RlbHRhLm5ld0FjdGl2ZUVkaXRvcn0nIGRvZXMgbm90IGV4aXN0YCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVFZGl0b3JJZCA9IGRlbHRhLm5ld0FjdGl2ZUVkaXRvcjtcblx0XHR9XG5cblx0XHRkaXNwb3NlKHJlbW92ZWREb2N1bWVudHMpO1xuXHRcdGRpc3Bvc2UocmVtb3ZlZEVkaXRvcnMpO1xuXG5cdFx0Ly8gbm93IHRoYXQgdGhlIGludGVybmFsIHN0YXRlIGlzIGNvbXBsZXRlLCBmaXJlIGV2ZW50c1xuXHRcdGlmIChkZWx0YS5yZW1vdmVkRG9jdW1lbnRzKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFJlbW92ZURvY3VtZW50cy5maXJlKHJlbW92ZWREb2N1bWVudHMpO1xuXHRcdH1cblx0XHRpZiAoZGVsdGEuYWRkZWREb2N1bWVudHMpIHtcblx0XHRcdHRoaXMuX29uRGlkQWRkRG9jdW1lbnRzLmZpcmUoYWRkZWREb2N1bWVudHMpO1xuXHRcdH1cblxuXHRcdGlmIChkZWx0YS5yZW1vdmVkRWRpdG9ycyB8fCBkZWx0YS5hZGRlZEVkaXRvcnMpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJsZVRleHRFZGl0b3JzLmZpcmUodGhpcy5hbGxFZGl0b3JzKCkubWFwKGVkaXRvciA9PiBlZGl0b3IudmFsdWUpKTtcblx0XHR9XG5cdFx0aWYgKGRlbHRhLm5ld0FjdGl2ZUVkaXRvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVRleHRFZGl0b3IuZmlyZSh0aGlzLmFjdGl2ZUVkaXRvcigpKTtcblx0XHR9XG5cdH1cblxuXHRnZXREb2N1bWVudCh1cmk6IFVSSSk6IEV4dEhvc3REb2N1bWVudERhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kb2N1bWVudHMuZ2V0KHVyaSk/LnZhbHVlO1xuXHR9XG5cblx0YWxsRG9jdW1lbnRzKCk6IEl0ZXJhYmxlPEV4dEhvc3REb2N1bWVudERhdGE+IHtcblx0XHRyZXR1cm4gSXRlcmFibGUubWFwKHRoaXMuX2RvY3VtZW50cy52YWx1ZXMoKSwgcmVmID0+IHJlZi52YWx1ZSk7XG5cdH1cblxuXHRnZXRFZGl0b3IoaWQ6IHN0cmluZyk6IEV4dEhvc3RUZXh0RWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9ycy5nZXQoaWQpO1xuXHR9XG5cblx0YWN0aXZlRWRpdG9yKCk6IHZzY29kZS5UZXh0RWRpdG9yIHwgdW5kZWZpbmVkO1xuXHRhY3RpdmVFZGl0b3IoaW50ZXJuYWw6IHRydWUpOiBFeHRIb3N0VGV4dEVkaXRvciB8IHVuZGVmaW5lZDtcblx0YWN0aXZlRWRpdG9yKGludGVybmFsPzogdHJ1ZSk6IHZzY29kZS5UZXh0RWRpdG9yIHwgRXh0SG9zdFRleHRFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlRWRpdG9ySWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvcnMuZ2V0KHRoaXMuX2FjdGl2ZUVkaXRvcklkKTtcblx0XHRpZiAoaW50ZXJuYWwpIHtcblx0XHRcdHJldHVybiBlZGl0b3I7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBlZGl0b3I/LnZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdGFsbEVkaXRvcnMoKTogRXh0SG9zdFRleHRFZGl0b3JbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9lZGl0b3JzLnZhbHVlcygpXTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyBleHRlbmRzIEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIHsgfVxuZXhwb3J0IGNvbnN0IElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyA9IGNyZWF0ZURlY29yYXRvcjxJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnM+KCdJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMnKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxZQUFZO0FBRXhCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFxRSxtQkFBbUI7QUFDeEYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyww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
