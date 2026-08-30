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
import { Event } from "../../../base/common/event.js";
import { combinedDisposable, DisposableStore, DisposableMap } from "../../../base/common/lifecycle.js";
import { isCodeEditor, isDiffEditor } from "../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../editor/browser/services/codeEditorService.js";
import { shouldSynchronizeModel } from "../../../editor/common/model.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ITextModelService } from "../../../editor/common/services/resolverService.js";
import { IFileService } from "../../../platform/files/common/files.js";
import { extHostCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainThreadDocuments } from "./mainThreadDocuments.js";
import { MainThreadTextEditor } from "./mainThreadEditor.js";
import { MainThreadTextEditors } from "./mainThreadEditors.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { AbstractTextEditor } from "../../browser/parts/editor/textEditor.js";
import { editorGroupToColumn } from "../../services/editor/common/editorGroupColumn.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { ITextFileService } from "../../services/textfile/common/textfiles.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { IWorkingCopyFileService } from "../../services/workingCopy/common/workingCopyFileService.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { IPathService } from "../../services/path/common/pathService.js";
import { diffSets, diffMaps } from "../../../base/common/collections.js";
import { IPaneCompositePartService } from "../../services/panecomposite/browser/panecomposite.js";
import { ViewContainerLocation } from "../../common/views.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IQuickDiffModelService } from "../../contrib/scm/browser/quickDiffModel.js";
class TextEditorSnapshot {
  constructor(editor) {
    this.editor = editor;
    this.id = `${editor.getId()},${editor.getModel().id}`;
  }
}
class DocumentAndEditorStateDelta {
  constructor(removedDocuments, addedDocuments, removedEditors, addedEditors, oldActiveEditor, newActiveEditor) {
    this.removedDocuments = removedDocuments;
    this.addedDocuments = addedDocuments;
    this.removedEditors = removedEditors;
    this.addedEditors = addedEditors;
    this.oldActiveEditor = oldActiveEditor;
    this.newActiveEditor = newActiveEditor;
    this.isEmpty = this.removedDocuments.length === 0 && this.addedDocuments.length === 0 && this.removedEditors.length === 0 && this.addedEditors.length === 0 && oldActiveEditor === newActiveEditor;
  }
  toString() {
    let ret = "DocumentAndEditorStateDelta\n";
    ret += `	Removed Documents: [${this.removedDocuments.map((d) => d.uri.toString(true)).join(", ")}]
`;
    ret += `	Added Documents: [${this.addedDocuments.map((d) => d.uri.toString(true)).join(", ")}]
`;
    ret += `	Removed Editors: [${this.removedEditors.map((e) => e.id).join(", ")}]
`;
    ret += `	Added Editors: [${this.addedEditors.map((e) => e.id).join(", ")}]
`;
    ret += `	New Active Editor: ${this.newActiveEditor}
`;
    return ret;
  }
}
class DocumentAndEditorState {
  constructor(documents, textEditors, activeEditor) {
    this.documents = documents;
    this.textEditors = textEditors;
    this.activeEditor = activeEditor;
  }
  static compute(before, after) {
    if (!before) {
      return new DocumentAndEditorStateDelta(
        [],
        [...after.documents.values()],
        [],
        [...after.textEditors.values()],
        void 0,
        after.activeEditor
      );
    }
    const documentDelta = diffSets(before.documents, after.documents);
    const editorDelta = diffMaps(before.textEditors, after.textEditors);
    const oldActiveEditor = before.activeEditor !== after.activeEditor ? before.activeEditor : void 0;
    const newActiveEditor = before.activeEditor !== after.activeEditor ? after.activeEditor : void 0;
    return new DocumentAndEditorStateDelta(
      documentDelta.removed,
      documentDelta.added,
      editorDelta.removed,
      editorDelta.added,
      oldActiveEditor,
      newActiveEditor
    );
  }
}
var ActiveEditorOrder = /* @__PURE__ */ ((ActiveEditorOrder2) => {
  ActiveEditorOrder2[ActiveEditorOrder2["Editor"] = 0] = "Editor";
  ActiveEditorOrder2[ActiveEditorOrder2["Panel"] = 1] = "Panel";
  return ActiveEditorOrder2;
})(ActiveEditorOrder || {});
let MainThreadDocumentAndEditorStateComputer = class {
  constructor(_onDidChangeState, _modelService, _codeEditorService, _editorService, _paneCompositeService) {
    this._onDidChangeState = _onDidChangeState;
    this._modelService = _modelService;
    this._codeEditorService = _codeEditorService;
    this._editorService = _editorService;
    this._paneCompositeService = _paneCompositeService;
    this._toDispose = new DisposableStore();
    this._toDisposeOnEditorRemove = new DisposableMap();
    this._activeEditorOrder = 0 /* Editor */;
    this._modelService.onModelAdded(this._updateStateOnModelAdd, this, this._toDispose);
    this._modelService.onModelRemoved((_) => this._updateState(), this, this._toDispose);
    this._editorService.onDidActiveEditorChange((_) => this._updateState(), this, this._toDispose);
    this._codeEditorService.onCodeEditorAdd(this._onDidAddEditor, this, this._toDispose);
    this._codeEditorService.onCodeEditorRemove(this._onDidRemoveEditor, this, this._toDispose);
    this._codeEditorService.listCodeEditors().forEach(this._onDidAddEditor, this);
    Event.filter(this._paneCompositeService.onDidPaneCompositeOpen, (event) => event.viewContainerLocation === ViewContainerLocation.Panel)((_) => this._activeEditorOrder = 1 /* Panel */, void 0, this._toDispose);
    Event.filter(this._paneCompositeService.onDidPaneCompositeClose, (event) => event.viewContainerLocation === ViewContainerLocation.Panel)((_) => this._activeEditorOrder = 0 /* Editor */, void 0, this._toDispose);
    this._editorService.onDidVisibleEditorsChange((_) => this._activeEditorOrder = 0 /* Editor */, void 0, this._toDispose);
    this._updateState();
  }
  dispose() {
    this._toDispose.dispose();
    this._toDisposeOnEditorRemove.dispose();
  }
  _onDidAddEditor(e) {
    this._toDisposeOnEditorRemove.set(e.getId(), combinedDisposable(
      e.onDidChangeModel(() => this._updateState()),
      e.onDidFocusEditorText(() => this._updateState()),
      e.onDidFocusEditorWidget(() => this._updateState(e))
    ));
    this._updateState();
  }
  _onDidRemoveEditor(e) {
    const id = e.getId();
    if (this._toDisposeOnEditorRemove.has(id)) {
      this._toDisposeOnEditorRemove.deleteAndDispose(id);
      this._updateState();
    }
  }
  _updateStateOnModelAdd(model) {
    if (!shouldSynchronizeModel(model)) {
      return;
    }
    if (!this._currentState) {
      this._updateState();
      return;
    }
    this._currentState = new DocumentAndEditorState(
      this._currentState.documents.add(model),
      this._currentState.textEditors,
      this._currentState.activeEditor
    );
    this._onDidChangeState(new DocumentAndEditorStateDelta(
      [],
      [model],
      [],
      [],
      void 0,
      void 0
    ));
  }
  _updateState(widgetFocusCandidate) {
    const models = /* @__PURE__ */ new Set();
    for (const model of this._modelService.getModels()) {
      if (shouldSynchronizeModel(model)) {
        models.add(model);
      }
    }
    const editors = /* @__PURE__ */ new Map();
    let activeEditor = null;
    for (const editor of this._codeEditorService.listCodeEditors()) {
      if (editor.isSimpleWidget) {
        continue;
      }
      const model = editor.getModel();
      if (editor.hasModel() && model && shouldSynchronizeModel(model) && !model.isDisposed() && Boolean(this._modelService.getModel(model.uri))) {
        const apiEditor = new TextEditorSnapshot(editor);
        editors.set(apiEditor.id, apiEditor);
        if (editor.hasTextFocus() || widgetFocusCandidate === editor && editor.hasWidgetFocus()) {
          activeEditor = apiEditor.id;
        }
      }
    }
    if (!activeEditor) {
      let candidate;
      if (this._activeEditorOrder === 0 /* Editor */) {
        candidate = this._getActiveEditorFromEditorPart() || this._getActiveEditorFromPanel();
      } else {
        candidate = this._getActiveEditorFromPanel() || this._getActiveEditorFromEditorPart();
      }
      if (candidate) {
        for (const snapshot of editors.values()) {
          if (candidate === snapshot.editor) {
            activeEditor = snapshot.id;
          }
        }
      }
    }
    const newState = new DocumentAndEditorState(models, editors, activeEditor);
    const delta = DocumentAndEditorState.compute(this._currentState, newState);
    if (!delta.isEmpty) {
      this._currentState = newState;
      this._onDidChangeState(delta);
    }
  }
  _getActiveEditorFromPanel() {
    const panel = this._paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
    if (panel instanceof AbstractTextEditor) {
      const control = panel.getControl();
      if (isCodeEditor(control)) {
        return control;
      }
    }
    return void 0;
  }
  _getActiveEditorFromEditorPart() {
    let activeTextEditorControl = this._editorService.activeTextEditorControl;
    if (isDiffEditor(activeTextEditorControl)) {
      activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
    }
    return activeTextEditorControl;
  }
};
MainThreadDocumentAndEditorStateComputer = __decorateClass([
  __decorateParam(1, IModelService),
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IPaneCompositePartService)
], MainThreadDocumentAndEditorStateComputer);
let MainThreadDocumentsAndEditors = class {
  constructor(extHostContext, _modelService, _textFileService, _editorService, codeEditorService, fileService, textModelResolverService, _editorGroupService, paneCompositeService, environmentService, workingCopyFileService, uriIdentityService, _clipboardService, pathService, configurationService, quickDiffModelService) {
    this._modelService = _modelService;
    this._textFileService = _textFileService;
    this._editorService = _editorService;
    this._editorGroupService = _editorGroupService;
    this._clipboardService = _clipboardService;
    this._toDispose = new DisposableStore();
    this._textEditors = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocumentsAndEditors);
    this._mainThreadDocuments = this._toDispose.add(new MainThreadDocuments(extHostContext, this._modelService, this._textFileService, fileService, textModelResolverService, environmentService, uriIdentityService, workingCopyFileService, pathService));
    extHostContext.set(MainContext.MainThreadDocuments, this._mainThreadDocuments);
    this._mainThreadEditors = this._toDispose.add(new MainThreadTextEditors(this, extHostContext, codeEditorService, this._editorService, this._editorGroupService, configurationService, quickDiffModelService, uriIdentityService));
    extHostContext.set(MainContext.MainThreadTextEditors, this._mainThreadEditors);
    this._toDispose.add(new MainThreadDocumentAndEditorStateComputer((delta) => this._onDelta(delta), _modelService, codeEditorService, this._editorService, paneCompositeService));
  }
  dispose() {
    this._toDispose.dispose();
  }
  _onDelta(delta) {
    const removedEditors = [];
    const addedEditors = [];
    const removedDocuments = delta.removedDocuments.map((m) => m.uri);
    for (const apiEditor of delta.addedEditors) {
      const mainThreadEditor = new MainThreadTextEditor(
        apiEditor.id,
        apiEditor.editor.getModel(),
        apiEditor.editor,
        { onGainedFocus() {
        }, onLostFocus() {
        } },
        this._mainThreadDocuments,
        this._modelService,
        this._clipboardService
      );
      this._textEditors.set(apiEditor.id, mainThreadEditor);
      addedEditors.push(mainThreadEditor);
    }
    for (const { id } of delta.removedEditors) {
      const mainThreadEditor = this._textEditors.get(id);
      if (mainThreadEditor) {
        mainThreadEditor.dispose();
        this._textEditors.delete(id);
        removedEditors.push(id);
      }
    }
    const extHostDelta = /* @__PURE__ */ Object.create(null);
    let empty = true;
    if (delta.newActiveEditor !== void 0) {
      empty = false;
      extHostDelta.newActiveEditor = delta.newActiveEditor;
    }
    if (removedDocuments.length > 0) {
      empty = false;
      extHostDelta.removedDocuments = removedDocuments;
    }
    if (removedEditors.length > 0) {
      empty = false;
      extHostDelta.removedEditors = removedEditors;
    }
    if (delta.addedDocuments.length > 0) {
      empty = false;
      extHostDelta.addedDocuments = delta.addedDocuments.map((m) => this._toModelAddData(m));
    }
    if (delta.addedEditors.length > 0) {
      empty = false;
      extHostDelta.addedEditors = addedEditors.map((e) => this._toTextEditorAddData(e));
    }
    if (!empty) {
      this._proxy.$acceptDocumentsAndEditorsDelta(extHostDelta);
      removedDocuments.forEach(this._mainThreadDocuments.handleModelRemoved, this._mainThreadDocuments);
      delta.addedDocuments.forEach(this._mainThreadDocuments.handleModelAdded, this._mainThreadDocuments);
      removedEditors.forEach(this._mainThreadEditors.handleTextEditorRemoved, this._mainThreadEditors);
      addedEditors.forEach(this._mainThreadEditors.handleTextEditorAdded, this._mainThreadEditors);
    }
  }
  _toModelAddData(model) {
    return {
      uri: model.uri,
      versionId: model.getVersionId(),
      lines: model.getLinesContent(),
      EOL: model.getEOL(),
      languageId: model.getLanguageId(),
      isDirty: this._textFileService.isDirty(model.uri),
      encoding: this._textFileService.getEncoding(model.uri)
    };
  }
  _toTextEditorAddData(textEditor) {
    const props = textEditor.getProperties();
    return {
      id: textEditor.getId(),
      documentUri: textEditor.getModel().uri,
      options: props.options,
      selections: props.selections,
      visibleRanges: props.visibleRanges,
      editorPosition: this._findEditorPosition(textEditor)
    };
  }
  _findEditorPosition(editor) {
    for (const editorPane of this._editorService.visibleEditorPanes) {
      if (editor.matches(editorPane)) {
        return editorGroupToColumn(this._editorGroupService, editorPane.group);
      }
    }
    return void 0;
  }
  findTextEditorIdFor(editorPane) {
    for (const [id, editor] of this._textEditors) {
      if (editor.matches(editorPane)) {
        return id;
      }
    }
    return void 0;
  }
  getIdOfCodeEditor(codeEditor) {
    for (const [id, editor] of this._textEditors) {
      if (editor.getCodeEditor() === codeEditor) {
        return id;
      }
    }
    return void 0;
  }
  getEditor(id) {
    return this._textEditors.get(id);
  }
};
MainThreadDocumentsAndEditors = __decorateClass([
  extHostCustomer,
  __decorateParam(1, IModelService),
  __decorateParam(2, ITextFileService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, IPaneCompositePartService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IWorkingCopyFileService),
  __decorateParam(11, IUriIdentityService),
  __decorateParam(12, IClipboardService),
  __decorateParam(13, IPathService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IQuickDiffModelService)
], MainThreadDocumentsAndEditors);
export {
  MainThreadDocumentsAndEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZERvY3VtZW50c0FuZEVkaXRvcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IsIGlzRGlmZkVkaXRvciwgSUFjdGl2ZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsLCBzaG91bGRTeW5jaHJvbml6ZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBleHRIb3N0Q3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZERvY3VtZW50cyB9IGZyb20gJy4vbWFpblRocmVhZERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkVGV4dEVkaXRvciB9IGZyb20gJy4vbWFpblRocmVhZEVkaXRvci5qcyc7XG5pbXBvcnQgeyBJTWFpblRocmVhZEVkaXRvckxvY2F0b3IsIE1haW5UaHJlYWRUZXh0RWRpdG9ycyB9IGZyb20gJy4vbWFpblRocmVhZEVkaXRvcnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzU2hhcGUsIElEb2N1bWVudHNBbmRFZGl0b3JzRGVsdGEsIElNb2RlbEFkZGVkRGF0YSwgSVRleHRFZGl0b3JBZGREYXRhLCBNYWluQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEFic3RyYWN0VGV4dEVkaXRvciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3RleHRFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwQ29sdW1uLCBlZGl0b3JHcm91cFRvQ29sdW1uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGlmZlNldHMsIGRpZmZNYXBzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0RpZmZNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3NjbS9icm93c2VyL3F1aWNrRGlmZk1vZGVsLmpzJztcblxuXG5jbGFzcyBUZXh0RWRpdG9yU25hcHNob3Qge1xuXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0KSB7XG5cdFx0dGhpcy5pZCA9IGAke2VkaXRvci5nZXRJZCgpfSwke2VkaXRvci5nZXRNb2RlbCgpLmlkfWA7XG5cdH1cbn1cblxuY2xhc3MgRG9jdW1lbnRBbmRFZGl0b3JTdGF0ZURlbHRhIHtcblxuXHRyZWFkb25seSBpc0VtcHR5OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlbW92ZWREb2N1bWVudHM6IElUZXh0TW9kZWxbXSxcblx0XHRyZWFkb25seSBhZGRlZERvY3VtZW50czogSVRleHRNb2RlbFtdLFxuXHRcdHJlYWRvbmx5IHJlbW92ZWRFZGl0b3JzOiBUZXh0RWRpdG9yU25hcHNob3RbXSxcblx0XHRyZWFkb25seSBhZGRlZEVkaXRvcnM6IFRleHRFZGl0b3JTbmFwc2hvdFtdLFxuXHRcdHJlYWRvbmx5IG9sZEFjdGl2ZUVkaXRvcjogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSBuZXdBY3RpdmVFZGl0b3I6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHRoaXMuaXNFbXB0eSA9IHRoaXMucmVtb3ZlZERvY3VtZW50cy5sZW5ndGggPT09IDBcblx0XHRcdCYmIHRoaXMuYWRkZWREb2N1bWVudHMubGVuZ3RoID09PSAwXG5cdFx0XHQmJiB0aGlzLnJlbW92ZWRFZGl0b3JzLmxlbmd0aCA9PT0gMFxuXHRcdFx0JiYgdGhpcy5hZGRlZEVkaXRvcnMubGVuZ3RoID09PSAwXG5cdFx0XHQmJiBvbGRBY3RpdmVFZGl0b3IgPT09IG5ld0FjdGl2ZUVkaXRvcjtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0bGV0IHJldCA9ICdEb2N1bWVudEFuZEVkaXRvclN0YXRlRGVsdGFcXG4nO1xuXHRcdHJldCArPSBgXFx0UmVtb3ZlZCBEb2N1bWVudHM6IFske3RoaXMucmVtb3ZlZERvY3VtZW50cy5tYXAoZCA9PiBkLnVyaS50b1N0cmluZyh0cnVlKSkuam9pbignLCAnKX1dXFxuYDtcblx0XHRyZXQgKz0gYFxcdEFkZGVkIERvY3VtZW50czogWyR7dGhpcy5hZGRlZERvY3VtZW50cy5tYXAoZCA9PiBkLnVyaS50b1N0cmluZyh0cnVlKSkuam9pbignLCAnKX1dXFxuYDtcblx0XHRyZXQgKz0gYFxcdFJlbW92ZWQgRWRpdG9yczogWyR7dGhpcy5yZW1vdmVkRWRpdG9ycy5tYXAoZSA9PiBlLmlkKS5qb2luKCcsICcpfV1cXG5gO1xuXHRcdHJldCArPSBgXFx0QWRkZWQgRWRpdG9yczogWyR7dGhpcy5hZGRlZEVkaXRvcnMubWFwKGUgPT4gZS5pZCkuam9pbignLCAnKX1dXFxuYDtcblx0XHRyZXQgKz0gYFxcdE5ldyBBY3RpdmUgRWRpdG9yOiAke3RoaXMubmV3QWN0aXZlRWRpdG9yfVxcbmA7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxufVxuXG5jbGFzcyBEb2N1bWVudEFuZEVkaXRvclN0YXRlIHtcblxuXHRzdGF0aWMgY29tcHV0ZShiZWZvcmU6IERvY3VtZW50QW5kRWRpdG9yU3RhdGUgfCB1bmRlZmluZWQsIGFmdGVyOiBEb2N1bWVudEFuZEVkaXRvclN0YXRlKTogRG9jdW1lbnRBbmRFZGl0b3JTdGF0ZURlbHRhIHtcblx0XHRpZiAoIWJlZm9yZSkge1xuXHRcdFx0cmV0dXJuIG5ldyBEb2N1bWVudEFuZEVkaXRvclN0YXRlRGVsdGEoXG5cdFx0XHRcdFtdLCBbLi4uYWZ0ZXIuZG9jdW1lbnRzLnZhbHVlcygpXSxcblx0XHRcdFx0W10sIFsuLi5hZnRlci50ZXh0RWRpdG9ycy52YWx1ZXMoKV0sXG5cdFx0XHRcdHVuZGVmaW5lZCwgYWZ0ZXIuYWN0aXZlRWRpdG9yXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRjb25zdCBkb2N1bWVudERlbHRhID0gZGlmZlNldHMoYmVmb3JlLmRvY3VtZW50cywgYWZ0ZXIuZG9jdW1lbnRzKTtcblx0XHRjb25zdCBlZGl0b3JEZWx0YSA9IGRpZmZNYXBzKGJlZm9yZS50ZXh0RWRpdG9ycywgYWZ0ZXIudGV4dEVkaXRvcnMpO1xuXHRcdGNvbnN0IG9sZEFjdGl2ZUVkaXRvciA9IGJlZm9yZS5hY3RpdmVFZGl0b3IgIT09IGFmdGVyLmFjdGl2ZUVkaXRvciA/IGJlZm9yZS5hY3RpdmVFZGl0b3IgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbmV3QWN0aXZlRWRpdG9yID0gYmVmb3JlLmFjdGl2ZUVkaXRvciAhPT0gYWZ0ZXIuYWN0aXZlRWRpdG9yID8gYWZ0ZXIuYWN0aXZlRWRpdG9yIDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIG5ldyBEb2N1bWVudEFuZEVkaXRvclN0YXRlRGVsdGEoXG5cdFx0XHRkb2N1bWVudERlbHRhLnJlbW92ZWQsIGRvY3VtZW50RGVsdGEuYWRkZWQsXG5cdFx0XHRlZGl0b3JEZWx0YS5yZW1vdmVkLCBlZGl0b3JEZWx0YS5hZGRlZCxcblx0XHRcdG9sZEFjdGl2ZUVkaXRvciwgbmV3QWN0aXZlRWRpdG9yXG5cdFx0KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGRvY3VtZW50czogU2V0PElUZXh0TW9kZWw+LFxuXHRcdHJlYWRvbmx5IHRleHRFZGl0b3JzOiBNYXA8c3RyaW5nLCBUZXh0RWRpdG9yU25hcHNob3Q+LFxuXHRcdHJlYWRvbmx5IGFjdGl2ZUVkaXRvcjogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0Ly9cblx0fVxufVxuXG5jb25zdCBlbnVtIEFjdGl2ZUVkaXRvck9yZGVyIHtcblx0RWRpdG9yLCBQYW5lbFxufVxuXG5jbGFzcyBNYWluVGhyZWFkRG9jdW1lbnRBbmRFZGl0b3JTdGF0ZUNvbXB1dGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvRGlzcG9zZU9uRWRpdG9yUmVtb3ZlID0gbmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpO1xuXHRwcml2YXRlIF9jdXJyZW50U3RhdGU/OiBEb2N1bWVudEFuZEVkaXRvclN0YXRlO1xuXHRwcml2YXRlIF9hY3RpdmVFZGl0b3JPcmRlcjogQWN0aXZlRWRpdG9yT3JkZXIgPSBBY3RpdmVFZGl0b3JPcmRlci5FZGl0b3I7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0ZTogKGRlbHRhOiBEb2N1bWVudEFuZEVkaXRvclN0YXRlRGVsdGEpID0+IHZvaWQsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGFuZUNvbXBvc2l0ZVNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX21vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQodGhpcy5fdXBkYXRlU3RhdGVPbk1vZGVsQWRkLCB0aGlzLCB0aGlzLl90b0Rpc3Bvc2UpO1xuXHRcdHRoaXMuX21vZGVsU2VydmljZS5vbk1vZGVsUmVtb3ZlZChfID0+IHRoaXMuX3VwZGF0ZVN0YXRlKCksIHRoaXMsIHRoaXMuX3RvRGlzcG9zZSk7XG5cdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZShfID0+IHRoaXMuX3VwZGF0ZVN0YXRlKCksIHRoaXMsIHRoaXMuX3RvRGlzcG9zZSk7XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5vbkNvZGVFZGl0b3JBZGQodGhpcy5fb25EaWRBZGRFZGl0b3IsIHRoaXMsIHRoaXMuX3RvRGlzcG9zZSk7XG5cdFx0dGhpcy5fY29kZUVkaXRvclNlcnZpY2Uub25Db2RlRWRpdG9yUmVtb3ZlKHRoaXMuX29uRGlkUmVtb3ZlRWRpdG9yLCB0aGlzLCB0aGlzLl90b0Rpc3Bvc2UpO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpLmZvckVhY2godGhpcy5fb25EaWRBZGRFZGl0b3IsIHRoaXMpO1xuXG5cdFx0RXZlbnQuZmlsdGVyKHRoaXMuX3BhbmVDb21wb3NpdGVTZXJ2aWNlLm9uRGlkUGFuZUNvbXBvc2l0ZU9wZW4sIGV2ZW50ID0+IGV2ZW50LnZpZXdDb250YWluZXJMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKShfID0+IHRoaXMuX2FjdGl2ZUVkaXRvck9yZGVyID0gQWN0aXZlRWRpdG9yT3JkZXIuUGFuZWwsIHVuZGVmaW5lZCwgdGhpcy5fdG9EaXNwb3NlKTtcblx0XHRFdmVudC5maWx0ZXIodGhpcy5fcGFuZUNvbXBvc2l0ZVNlcnZpY2Uub25EaWRQYW5lQ29tcG9zaXRlQ2xvc2UsIGV2ZW50ID0+IGV2ZW50LnZpZXdDb250YWluZXJMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKShfID0+IHRoaXMuX2FjdGl2ZUVkaXRvck9yZGVyID0gQWN0aXZlRWRpdG9yT3JkZXIuRWRpdG9yLCB1bmRlZmluZWQsIHRoaXMuX3RvRGlzcG9zZSk7XG5cdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlKF8gPT4gdGhpcy5fYWN0aXZlRWRpdG9yT3JkZXIgPSBBY3RpdmVFZGl0b3JPcmRlci5FZGl0b3IsIHVuZGVmaW5lZCwgdGhpcy5fdG9EaXNwb3NlKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVN0YXRlKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlT25FZGl0b3JSZW1vdmUuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRBZGRFZGl0b3IoZTogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHR0aGlzLl90b0Rpc3Bvc2VPbkVkaXRvclJlbW92ZS5zZXQoZS5nZXRJZCgpLCBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHRlLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdGhpcy5fdXBkYXRlU3RhdGUoKSksXG5cdFx0XHRlLm9uRGlkRm9jdXNFZGl0b3JUZXh0KCgpID0+IHRoaXMuX3VwZGF0ZVN0YXRlKCkpLFxuXHRcdFx0ZS5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHRoaXMuX3VwZGF0ZVN0YXRlKGUpKVxuXHRcdCkpO1xuXHRcdHRoaXMuX3VwZGF0ZVN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZFJlbW92ZUVkaXRvcihlOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGlkID0gZS5nZXRJZCgpO1xuXHRcdGlmICh0aGlzLl90b0Rpc3Bvc2VPbkVkaXRvclJlbW92ZS5oYXMoaWQpKSB7XG5cdFx0XHR0aGlzLl90b0Rpc3Bvc2VPbkVkaXRvclJlbW92ZS5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVN0YXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU3RhdGVPbk1vZGVsQWRkKG1vZGVsOiBJVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0aWYgKCFzaG91bGRTeW5jaHJvbml6ZU1vZGVsKG1vZGVsKSkge1xuXHRcdFx0Ly8gaWdub3JlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50U3RhdGUpIHtcblx0XHRcdC8vIHRvbyBlYXJseVxuXHRcdFx0dGhpcy5fdXBkYXRlU3RhdGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBzbWFsbCAoZmFzdCkgZGVsdGFcblx0XHR0aGlzLl9jdXJyZW50U3RhdGUgPSBuZXcgRG9jdW1lbnRBbmRFZGl0b3JTdGF0ZShcblx0XHRcdHRoaXMuX2N1cnJlbnRTdGF0ZS5kb2N1bWVudHMuYWRkKG1vZGVsKSxcblx0XHRcdHRoaXMuX2N1cnJlbnRTdGF0ZS50ZXh0RWRpdG9ycyxcblx0XHRcdHRoaXMuX2N1cnJlbnRTdGF0ZS5hY3RpdmVFZGl0b3Jcblx0XHQpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZShuZXcgRG9jdW1lbnRBbmRFZGl0b3JTdGF0ZURlbHRhKFxuXHRcdFx0W10sIFttb2RlbF0sXG5cdFx0XHRbXSwgW10sXG5cdFx0XHR1bmRlZmluZWQsIHVuZGVmaW5lZFxuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU3RhdGUod2lkZ2V0Rm9jdXNDYW5kaWRhdGU/OiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXG5cdFx0Ly8gbW9kZWxzOiBpZ25vcmUgdG9vIGxhcmdlIG1vZGVsc1xuXHRcdGNvbnN0IG1vZGVscyA9IG5ldyBTZXQ8SVRleHRNb2RlbD4oKTtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbHMoKSkge1xuXHRcdFx0aWYgKHNob3VsZFN5bmNocm9uaXplTW9kZWwobW9kZWwpKSB7XG5cdFx0XHRcdG1vZGVscy5hZGQobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGVkaXRvcjogb25seSB0YWtlIHRob3NlIHRoYXQgaGF2ZSBhIG5vdCB0b28gbGFyZ2UgbW9kZWxcblx0XHRjb25zdCBlZGl0b3JzID0gbmV3IE1hcDxzdHJpbmcsIFRleHRFZGl0b3JTbmFwc2hvdD4oKTtcblx0XHRsZXQgYWN0aXZlRWRpdG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDsgLy8gU3RyaWN0IG51bGwgd29yay4gVGhpcyBkb2Vzbid0IGxpa2UgYmVpbmcgdW5kZWZpbmVkIVxuXG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgdGhpcy5fY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCkpIHtcblx0XHRcdGlmIChlZGl0b3IuaXNTaW1wbGVXaWRnZXQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKGVkaXRvci5oYXNNb2RlbCgpICYmIG1vZGVsICYmIHNob3VsZFN5bmNocm9uaXplTW9kZWwobW9kZWwpXG5cdFx0XHRcdCYmICFtb2RlbC5pc0Rpc3Bvc2VkKCkgLy8gbW9kZWwgZGlzcG9zZWRcblx0XHRcdFx0JiYgQm9vbGVhbih0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwobW9kZWwudXJpKSkgLy8gbW9kZWwgZGlzcG9zaW5nLCB0aGUgZmxhZyBkaWRuJ3QgZmxpcCB5ZXQgYnV0IHRoZSBtb2RlbCBzZXJ2aWNlIGFscmVhZHkgcmVtb3ZlZCBpdFxuXHRcdFx0KSB7XG5cdFx0XHRcdGNvbnN0IGFwaUVkaXRvciA9IG5ldyBUZXh0RWRpdG9yU25hcHNob3QoZWRpdG9yKTtcblx0XHRcdFx0ZWRpdG9ycy5zZXQoYXBpRWRpdG9yLmlkLCBhcGlFZGl0b3IpO1xuXHRcdFx0XHRpZiAoZWRpdG9yLmhhc1RleHRGb2N1cygpIHx8ICh3aWRnZXRGb2N1c0NhbmRpZGF0ZSA9PT0gZWRpdG9yICYmIGVkaXRvci5oYXNXaWRnZXRGb2N1cygpKSkge1xuXHRcdFx0XHRcdC8vIHRleHQgZm9jdXMgaGFzIHByaW9yaXR5LCB3aWRnZXQgZm9jdXMgaXMgdHJpY2t5IGJlY2F1c2UgbXVsdGlwbGVcblx0XHRcdFx0XHQvLyBlZGl0b3JzIG1pZ2h0IGNsYWltIHdpZGdldCBmb2N1cyBhdCB0aGUgc2FtZSB0aW1lLiB0aGVyZWZvcmUgd2UgdXNlIGFcblx0XHRcdFx0XHQvLyBjYW5kaWRhdGUgKHdoaWNoIGlzIHRoZSBlZGl0b3IgdGhhdCBoYXMgcmFpc2VkIGFuIHdpZGdldCBmb2N1cyBldmVudClcblx0XHRcdFx0XHQvLyBpbiBhZGRpdGlvbiB0byB0aGUgd2lkZ2V0IGZvY3VzIGNoZWNrXG5cdFx0XHRcdFx0YWN0aXZlRWRpdG9yID0gYXBpRWRpdG9yLmlkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYWN0aXZlIGVkaXRvcjogaWYgbm9uZSBvZiB0aGUgcHJldmlvdXMgZWRpdG9ycyBoYWQgZm9jdXMgd2UgdHJ5XG5cdFx0Ly8gdG8gbWF0Y2ggb3V0cHV0IHBhbmVscyBvciB0aGUgYWN0aXZlIHdvcmtiZW5jaCBlZGl0b3Igd2l0aFxuXHRcdC8vIG9uZSBvZiBlZGl0b3Igd2UgaGF2ZSBqdXN0IGNvbXB1dGVkXG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdGxldCBjYW5kaWRhdGU6IElFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGhpcy5fYWN0aXZlRWRpdG9yT3JkZXIgPT09IEFjdGl2ZUVkaXRvck9yZGVyLkVkaXRvcikge1xuXHRcdFx0XHRjYW5kaWRhdGUgPSB0aGlzLl9nZXRBY3RpdmVFZGl0b3JGcm9tRWRpdG9yUGFydCgpIHx8IHRoaXMuX2dldEFjdGl2ZUVkaXRvckZyb21QYW5lbCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2FuZGlkYXRlID0gdGhpcy5fZ2V0QWN0aXZlRWRpdG9yRnJvbVBhbmVsKCkgfHwgdGhpcy5fZ2V0QWN0aXZlRWRpdG9yRnJvbUVkaXRvclBhcnQoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNuYXBzaG90IG9mIGVkaXRvcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRpZiAoY2FuZGlkYXRlID09PSBzbmFwc2hvdC5lZGl0b3IpIHtcblx0XHRcdFx0XHRcdGFjdGl2ZUVkaXRvciA9IHNuYXBzaG90LmlkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGNvbXB1dGUgbmV3IHN0YXRlIGFuZCBjb21wYXJlIGFnYWluc3Qgb2xkXG5cdFx0Y29uc3QgbmV3U3RhdGUgPSBuZXcgRG9jdW1lbnRBbmRFZGl0b3JTdGF0ZShtb2RlbHMsIGVkaXRvcnMsIGFjdGl2ZUVkaXRvcik7XG5cdFx0Y29uc3QgZGVsdGEgPSBEb2N1bWVudEFuZEVkaXRvclN0YXRlLmNvbXB1dGUodGhpcy5fY3VycmVudFN0YXRlLCBuZXdTdGF0ZSk7XG5cdFx0aWYgKCFkZWx0YS5pc0VtcHR5KSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50U3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUoZGVsdGEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldEFjdGl2ZUVkaXRvckZyb21QYW5lbCgpOiBJRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwYW5lbCA9IHRoaXMuX3BhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKTtcblx0XHRpZiAocGFuZWwgaW5zdGFuY2VvZiBBYnN0cmFjdFRleHRFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGNvbnRyb2wgPSBwYW5lbC5nZXRDb250cm9sKCk7XG5cdFx0XHRpZiAoaXNDb2RlRWRpdG9yKGNvbnRyb2wpKSB7XG5cdFx0XHRcdHJldHVybiBjb250cm9sO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBY3RpdmVFZGl0b3JGcm9tRWRpdG9yUGFydCgpOiBJRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgPSB0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdGlmIChpc0RpZmZFZGl0b3IoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpKSB7XG5cdFx0XHRhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0fVxufVxuXG5AZXh0SG9zdEN1c3RvbWVyXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZERvY3VtZW50c0FuZEVkaXRvcnMgaW1wbGVtZW50cyBJTWFpblRocmVhZEVkaXRvckxvY2F0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21haW5UaHJlYWREb2N1bWVudHM6IE1haW5UaHJlYWREb2N1bWVudHM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21haW5UaHJlYWRFZGl0b3JzOiBNYWluVGhyZWFkVGV4dEVkaXRvcnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHRFZGl0b3JzID0gbmV3IE1hcDxzdHJpbmcsIE1haW5UaHJlYWRUZXh0RWRpdG9yPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSBwYW5lQ29tcG9zaXRlU2VydmljZTogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHdvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrRGlmZk1vZGVsU2VydmljZSBxdWlja0RpZmZNb2RlbFNlcnZpY2U6IElRdWlja0RpZmZNb2RlbFNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyk7XG5cblx0XHR0aGlzLl9tYWluVGhyZWFkRG9jdW1lbnRzID0gdGhpcy5fdG9EaXNwb3NlLmFkZChuZXcgTWFpblRocmVhZERvY3VtZW50cyhleHRIb3N0Q29udGV4dCwgdGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl90ZXh0RmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCB3b3JraW5nQ29weUZpbGVTZXJ2aWNlLCBwYXRoU2VydmljZSkpO1xuXHRcdGV4dEhvc3RDb250ZXh0LnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkRG9jdW1lbnRzLCB0aGlzLl9tYWluVGhyZWFkRG9jdW1lbnRzKTtcblxuXHRcdHRoaXMuX21haW5UaHJlYWRFZGl0b3JzID0gdGhpcy5fdG9EaXNwb3NlLmFkZChuZXcgTWFpblRocmVhZFRleHRFZGl0b3JzKHRoaXMsIGV4dEhvc3RDb250ZXh0LCBjb2RlRWRpdG9yU2VydmljZSwgdGhpcy5fZWRpdG9yU2VydmljZSwgdGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcXVpY2tEaWZmTW9kZWxTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpKTtcblx0XHRleHRIb3N0Q29udGV4dC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFRleHRFZGl0b3JzLCB0aGlzLl9tYWluVGhyZWFkRWRpdG9ycyk7XG5cblx0XHQvLyBJdCBpcyBleHBlY3RlZCB0aGF0IHRoZSBjdG9yIG9mIHRoZSBzdGF0ZSBjb21wdXRlciBjYWxscyBvdXIgYF9vbkRlbHRhYC5cblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKG5ldyBNYWluVGhyZWFkRG9jdW1lbnRBbmRFZGl0b3JTdGF0ZUNvbXB1dGVyKGRlbHRhID0+IHRoaXMuX29uRGVsdGEoZGVsdGEpLCBfbW9kZWxTZXJ2aWNlLCBjb2RlRWRpdG9yU2VydmljZSwgdGhpcy5fZWRpdG9yU2VydmljZSwgcGFuZUNvbXBvc2l0ZVNlcnZpY2UpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGVsdGEoZGVsdGE6IERvY3VtZW50QW5kRWRpdG9yU3RhdGVEZWx0YSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgcmVtb3ZlZEVkaXRvcnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgYWRkZWRFZGl0b3JzOiBNYWluVGhyZWFkVGV4dEVkaXRvcltdID0gW107XG5cblx0XHQvLyByZW1vdmVkIG1vZGVsc1xuXHRcdGNvbnN0IHJlbW92ZWREb2N1bWVudHMgPSBkZWx0YS5yZW1vdmVkRG9jdW1lbnRzLm1hcChtID0+IG0udXJpKTtcblxuXHRcdC8vIGFkZGVkIGVkaXRvcnNcblx0XHRmb3IgKGNvbnN0IGFwaUVkaXRvciBvZiBkZWx0YS5hZGRlZEVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IG1haW5UaHJlYWRFZGl0b3IgPSBuZXcgTWFpblRocmVhZFRleHRFZGl0b3IoYXBpRWRpdG9yLmlkLCBhcGlFZGl0b3IuZWRpdG9yLmdldE1vZGVsKCksXG5cdFx0XHRcdGFwaUVkaXRvci5lZGl0b3IsIHsgb25HYWluZWRGb2N1cygpIHsgfSwgb25Mb3N0Rm9jdXMoKSB7IH0gfSwgdGhpcy5fbWFpblRocmVhZERvY3VtZW50cywgdGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlKTtcblxuXHRcdFx0dGhpcy5fdGV4dEVkaXRvcnMuc2V0KGFwaUVkaXRvci5pZCwgbWFpblRocmVhZEVkaXRvcik7XG5cdFx0XHRhZGRlZEVkaXRvcnMucHVzaChtYWluVGhyZWFkRWRpdG9yKTtcblx0XHR9XG5cblx0XHQvLyByZW1vdmVkIGVkaXRvcnNcblx0XHRmb3IgKGNvbnN0IHsgaWQgfSBvZiBkZWx0YS5yZW1vdmVkRWRpdG9ycykge1xuXHRcdFx0Y29uc3QgbWFpblRocmVhZEVkaXRvciA9IHRoaXMuX3RleHRFZGl0b3JzLmdldChpZCk7XG5cdFx0XHRpZiAobWFpblRocmVhZEVkaXRvcikge1xuXHRcdFx0XHRtYWluVGhyZWFkRWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fdGV4dEVkaXRvcnMuZGVsZXRlKGlkKTtcblx0XHRcdFx0cmVtb3ZlZEVkaXRvcnMucHVzaChpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0SG9zdERlbHRhOiBJRG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRsZXQgZW1wdHkgPSB0cnVlO1xuXHRcdGlmIChkZWx0YS5uZXdBY3RpdmVFZGl0b3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW1wdHkgPSBmYWxzZTtcblx0XHRcdGV4dEhvc3REZWx0YS5uZXdBY3RpdmVFZGl0b3IgPSBkZWx0YS5uZXdBY3RpdmVFZGl0b3I7XG5cdFx0fVxuXHRcdGlmIChyZW1vdmVkRG9jdW1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVtcHR5ID0gZmFsc2U7XG5cdFx0XHRleHRIb3N0RGVsdGEucmVtb3ZlZERvY3VtZW50cyA9IHJlbW92ZWREb2N1bWVudHM7XG5cdFx0fVxuXHRcdGlmIChyZW1vdmVkRWRpdG9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRlbXB0eSA9IGZhbHNlO1xuXHRcdFx0ZXh0SG9zdERlbHRhLnJlbW92ZWRFZGl0b3JzID0gcmVtb3ZlZEVkaXRvcnM7XG5cdFx0fVxuXHRcdGlmIChkZWx0YS5hZGRlZERvY3VtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRlbXB0eSA9IGZhbHNlO1xuXHRcdFx0ZXh0SG9zdERlbHRhLmFkZGVkRG9jdW1lbnRzID0gZGVsdGEuYWRkZWREb2N1bWVudHMubWFwKG0gPT4gdGhpcy5fdG9Nb2RlbEFkZERhdGEobSkpO1xuXHRcdH1cblx0XHRpZiAoZGVsdGEuYWRkZWRFZGl0b3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVtcHR5ID0gZmFsc2U7XG5cdFx0XHRleHRIb3N0RGVsdGEuYWRkZWRFZGl0b3JzID0gYWRkZWRFZGl0b3JzLm1hcChlID0+IHRoaXMuX3RvVGV4dEVkaXRvckFkZERhdGEoZSkpO1xuXHRcdH1cblxuXHRcdGlmICghZW1wdHkpIHtcblx0XHRcdC8vIGZpcnN0IHVwZGF0ZSBleHQgaG9zdFxuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YShleHRIb3N0RGVsdGEpO1xuXG5cdFx0XHQvLyBzZWNvbmQgdXBkYXRlIGRlcGVuZGVudCBkb2N1bWVudC9lZGl0b3Igc3RhdGVzXG5cdFx0XHRyZW1vdmVkRG9jdW1lbnRzLmZvckVhY2godGhpcy5fbWFpblRocmVhZERvY3VtZW50cy5oYW5kbGVNb2RlbFJlbW92ZWQsIHRoaXMuX21haW5UaHJlYWREb2N1bWVudHMpO1xuXHRcdFx0ZGVsdGEuYWRkZWREb2N1bWVudHMuZm9yRWFjaCh0aGlzLl9tYWluVGhyZWFkRG9jdW1lbnRzLmhhbmRsZU1vZGVsQWRkZWQsIHRoaXMuX21haW5UaHJlYWREb2N1bWVudHMpO1xuXG5cdFx0XHRyZW1vdmVkRWRpdG9ycy5mb3JFYWNoKHRoaXMuX21haW5UaHJlYWRFZGl0b3JzLmhhbmRsZVRleHRFZGl0b3JSZW1vdmVkLCB0aGlzLl9tYWluVGhyZWFkRWRpdG9ycyk7XG5cdFx0XHRhZGRlZEVkaXRvcnMuZm9yRWFjaCh0aGlzLl9tYWluVGhyZWFkRWRpdG9ycy5oYW5kbGVUZXh0RWRpdG9yQWRkZWQsIHRoaXMuX21haW5UaHJlYWRFZGl0b3JzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90b01vZGVsQWRkRGF0YShtb2RlbDogSVRleHRNb2RlbCk6IElNb2RlbEFkZGVkRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogbW9kZWwudXJpLFxuXHRcdFx0dmVyc2lvbklkOiBtb2RlbC5nZXRWZXJzaW9uSWQoKSxcblx0XHRcdGxpbmVzOiBtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSxcblx0XHRcdEVPTDogbW9kZWwuZ2V0RU9MKCksXG5cdFx0XHRsYW5ndWFnZUlkOiBtb2RlbC5nZXRMYW5ndWFnZUlkKCksXG5cdFx0XHRpc0RpcnR5OiB0aGlzLl90ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eShtb2RlbC51cmkpLFxuXHRcdFx0ZW5jb2Rpbmc6IHRoaXMuX3RleHRGaWxlU2VydmljZS5nZXRFbmNvZGluZyhtb2RlbC51cmkpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RvVGV4dEVkaXRvckFkZERhdGEodGV4dEVkaXRvcjogTWFpblRocmVhZFRleHRFZGl0b3IpOiBJVGV4dEVkaXRvckFkZERhdGEge1xuXHRcdGNvbnN0IHByb3BzID0gdGV4dEVkaXRvci5nZXRQcm9wZXJ0aWVzKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiB0ZXh0RWRpdG9yLmdldElkKCksXG5cdFx0XHRkb2N1bWVudFVyaTogdGV4dEVkaXRvci5nZXRNb2RlbCgpLnVyaSxcblx0XHRcdG9wdGlvbnM6IHByb3BzLm9wdGlvbnMsXG5cdFx0XHRzZWxlY3Rpb25zOiBwcm9wcy5zZWxlY3Rpb25zLFxuXHRcdFx0dmlzaWJsZVJhbmdlczogcHJvcHMudmlzaWJsZVJhbmdlcyxcblx0XHRcdGVkaXRvclBvc2l0aW9uOiB0aGlzLl9maW5kRWRpdG9yUG9zaXRpb24odGV4dEVkaXRvcilcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEVkaXRvclBvc2l0aW9uKGVkaXRvcjogTWFpblRocmVhZFRleHRFZGl0b3IpOiBFZGl0b3JHcm91cENvbHVtbiB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3JQYW5lIG9mIHRoaXMuX2VkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvclBhbmVzKSB7XG5cdFx0XHRpZiAoZWRpdG9yLm1hdGNoZXMoZWRpdG9yUGFuZSkpIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRvckdyb3VwVG9Db2x1bW4odGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLCBlZGl0b3JQYW5lLmdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGZpbmRUZXh0RWRpdG9ySWRGb3IoZWRpdG9yUGFuZTogSUVkaXRvclBhbmUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgW2lkLCBlZGl0b3JdIG9mIHRoaXMuX3RleHRFZGl0b3JzKSB7XG5cdFx0XHRpZiAoZWRpdG9yLm1hdGNoZXMoZWRpdG9yUGFuZSkpIHtcblx0XHRcdFx0cmV0dXJuIGlkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0SWRPZkNvZGVFZGl0b3IoY29kZUVkaXRvcjogSUNvZGVFZGl0b3IpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgW2lkLCBlZGl0b3JdIG9mIHRoaXMuX3RleHRFZGl0b3JzKSB7XG5cdFx0XHRpZiAoZWRpdG9yLmdldENvZGVFZGl0b3IoKSA9PT0gY29kZUVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm4gaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRFZGl0b3IoaWQ6IHN0cmluZyk6IE1haW5UaHJlYWRUZXh0RWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGV4dEVkaXRvcnMuZ2V0KGlkKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxvQkFBb0IsaUJBQWlCLHFCQUFxQjtBQUNuRSxTQUFzQixjQUFjLG9CQUF1QztBQUMzRSxTQUFTLDBCQUEwQjtBQUVuQyxTQUFxQiw4QkFBOEI7QUFDbkQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBd0M7QUFDakQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBbUMsNkJBQTZCO0FBQ2hFLFNBQVMsZ0JBQWlILG1CQUFtQjtBQUM3SSxTQUFTLDBCQUEwQjtBQUVuQyxTQUE0QiwyQkFBMkI7QUFDdkQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDhCQUE4QjtBQUd2QyxNQUFNLG1CQUFtQjtBQUFBLEVBSXhCLFlBQ1UsUUFDUjtBQURRO0FBRVQsU0FBSyxLQUFLLEdBQUcsT0FBTyxNQUFNLENBQUMsSUFBSSxPQUFPLFNBQVMsRUFBRSxFQUFFO0FBQUEsRUFDcEQ7QUFDRDtBQUVBLE1BQU0sNEJBQTRCO0FBQUEsRUFJakMsWUFDVSxrQkFDQSxnQkFDQSxnQkFDQSxjQUNBLGlCQUNBLGlCQUNSO0FBTlE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRVQsU0FBSyxVQUFV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LGtCQUFrQjtBQUFBLElBQzVGO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLE9BQW9DO0FBQzNELFdBQU87QUFBQSxNQUNOLEtBQUssTUFBTTtBQUFBLE1BQ1gsV0FBVyxNQUFNLGFBQWE7QUFBQSxNQUM5QixPQUFPLE1BQU0sZ0JBQWdCO0FBQUEsTUFDN0IsS0FBSyxNQUFNLE9BQU87QUFBQSxNQUNsQixZQUFZLE1BQU0sY0FBYztBQUFBLE1BQ2hDLFNBQVMsS0FBSyxpQkFBaUIsUUFBUSxNQUFNLEdBQUc7QUFBQSxNQUNoRCxVQUFVLEtBQUssaUJBQWlCLFlBQVksTUFBTSxHQUFHO0FBQUEsSUFDdEQ7QUFBQSxFQUNEO0FBQUEsRUFFUSxxQkFBcUIsWUFBc0Q7QUFDbEYsVUFBTSxRQUFRLFdBQVcsY0FBYztBQUN2QyxXQUFPO0FBQUEsTUFDTixJQUFJLFdBQVcsTUFBTTtBQUFBLE1BQ3JCLGFBQWEsV0FBVyxTQUFTLEVBQUU7QUFBQSxNQUNuQyxTQUFTLE1BQU07QUFBQSxNQUNmLFlBQVksTUFBTTtBQUFBLE1BQ2xCLGVBQWUsTUFBTTtBQUFBLE1BQ3JCLGdCQUFnQixLQUFLLG9CQUFvQixVQUFVO0FBQUEsSUFDcEQ7QUFBQSxFQUNEO0FBQUEsRUFFUSxvQkFBb0IsUUFBNkQ7QUFDeEYsZUFBVyxjQUFjLEtBQUssZUFBZSxvQkFBb0I7QUFDaEUsVUFBSSxPQUFPLFFBQVEsVUFBVSxHQUFHO0FBQy9CLGVBQU8sb0JBQW9CLEtBQUsscUJBQXFCLFdBQVcsS0FBSztBQUFBLE1BQ3RFO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxvQkFBb0IsWUFBNkM7QUFDaEUsZUFBVyxDQUFDLElBQUksTUFBTSxLQUFLLEtBQUssY0FBYztBQUM3QyxVQUFJLE9BQU8sUUFBUSxVQUFVLEdBQUc7QUFDL0IsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGtCQUFrQixZQUE2QztBQUM5RCxlQUFXLENBQUMsSUFBSSxNQUFNLEtBQUssS0FBSyxjQUFjO0FBQzdDLFVBQUksT0FBTyxjQUFjLE1BQU0sWUFBWTtBQUMxQyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsVUFBVSxJQUE4QztBQUN2RCxXQUFPLEtBQUssYUFBYSxJQUFJLEVBQUU7QUFBQSxFQUNoQztBQUNEO0FBL0phLGdDQUFOO0FBQUEsRUFETjtBQUFBLEVBV0U7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeEJVOyIsCiAgIm5hbWVzIjogWyJBY3RpdmVFZGl0b3JPcmRlciJdCn0K
