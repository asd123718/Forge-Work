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
import { illegalArgument } from "../../../base/common/errors.js";
import { dispose, DisposableStore } from "../../../base/common/lifecycle.js";
import { equals as objectEquals } from "../../../base/common/objects.js";
import { URI } from "../../../base/common/uri.js";
import { ICodeEditorService } from "../../../editor/browser/services/codeEditorService.js";
import { CommandsRegistry } from "../../../platform/commands/common/commands.js";
import { EditorActivation, EditorResolution, isTextEditorDiffInformationEqual } from "../../../platform/editor/common/editor.js";
import { ExtHostContext } from "../common/extHost.protocol.js";
import { editorGroupToColumn, columnToEditorGroup } from "../../services/editor/common/editorGroupColumn.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { IWorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { getCodeEditor } from "../../../editor/browser/editorBrowser.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IQuickDiffModelService } from "../../contrib/scm/browser/quickDiffModel.js";
import { autorun, constObservable, derived, derivedOpts, observableFromEvent } from "../../../base/common/observable.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { isITextModel } from "../../../editor/common/model.js";
import { equals } from "../../../base/common/arrays.js";
import { Event } from "../../../base/common/event.js";
let MainThreadTextEditors = class {
  constructor(_editorLocator, extHostContext, _codeEditorService, _editorService, _editorGroupService, _configurationService, _quickDiffModelService, _uriIdentityService) {
    this._editorLocator = _editorLocator;
    this._codeEditorService = _codeEditorService;
    this._editorService = _editorService;
    this._editorGroupService = _editorGroupService;
    this._configurationService = _configurationService;
    this._quickDiffModelService = _quickDiffModelService;
    this._uriIdentityService = _uriIdentityService;
    this._toDispose = new DisposableStore();
    this._instanceId = String(++MainThreadTextEditors.INSTANCE_COUNT);
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditors);
    this._textEditorsListenersMap = /* @__PURE__ */ Object.create(null);
    this._editorPositionData = null;
    this._toDispose.add(this._editorService.onDidVisibleEditorsChange(() => this._updateActiveAndVisibleTextEditors()));
    this._toDispose.add(this._editorGroupService.onDidRemoveGroup(() => this._updateActiveAndVisibleTextEditors()));
    this._toDispose.add(this._editorGroupService.onDidMoveGroup(() => this._updateActiveAndVisibleTextEditors()));
    this._registeredDecorationTypes = /* @__PURE__ */ Object.create(null);
  }
  dispose() {
    Object.keys(this._textEditorsListenersMap).forEach((editorId) => {
      dispose(this._textEditorsListenersMap[editorId]);
    });
    this._textEditorsListenersMap = /* @__PURE__ */ Object.create(null);
    this._toDispose.dispose();
    for (const decorationType in this._registeredDecorationTypes) {
      this._codeEditorService.removeDecorationType(decorationType);
    }
    this._registeredDecorationTypes = /* @__PURE__ */ Object.create(null);
  }
  handleTextEditorAdded(textEditor) {
    const id = textEditor.getId();
    const toDispose = [];
    toDispose.push(textEditor.onPropertiesChanged((data) => {
      this._proxy.$acceptEditorPropertiesChanged(id, data);
    }));
    const diffInformationObs = this._getTextEditorDiffInformation(textEditor, toDispose);
    toDispose.push(autorun((reader) => {
      const diffInformation = diffInformationObs.read(reader);
      this._proxy.$acceptEditorDiffInformation(id, diffInformation);
    }));
    this._textEditorsListenersMap[id] = toDispose;
  }
  handleTextEditorRemoved(id) {
    dispose(this._textEditorsListenersMap[id]);
    delete this._textEditorsListenersMap[id];
  }
  _updateActiveAndVisibleTextEditors() {
    const editorPositionData = this._getTextEditorPositionData();
    if (!objectEquals(this._editorPositionData, editorPositionData)) {
      this._editorPositionData = editorPositionData;
      this._proxy.$acceptEditorPositionData(this._editorPositionData);
    }
  }
  _getTextEditorPositionData() {
    const result = /* @__PURE__ */ Object.create(null);
    for (const editorPane of this._editorService.visibleEditorPanes) {
      const id = this._editorLocator.findTextEditorIdFor(editorPane);
      if (id) {
        result[id] = editorGroupToColumn(this._editorGroupService, editorPane.group);
      }
    }
    return result;
  }
  _getTextEditorDiffInformation(textEditor, toDispose) {
    const codeEditor = textEditor.getCodeEditor();
    if (!codeEditor) {
      return constObservable(void 0);
    }
    const [diffEditor] = this._codeEditorService.listDiffEditors().filter((d) => d.getOriginalEditor().getId() === codeEditor.getId() || d.getModifiedEditor().getId() === codeEditor.getId());
    const editorModelObs = diffEditor ? observableFromEvent(this, diffEditor.onDidChangeModel, () => diffEditor.getModel()) : observableFromEvent(this, codeEditor.onDidChangeModel, () => codeEditor.getModel());
    const editorChangesObs = derived((reader) => {
      const editorModel = editorModelObs.read(reader);
      if (!editorModel) {
        return constObservable(void 0);
      }
      if (isITextModel(editorModel)) {
        const quickDiffModelRef2 = this._quickDiffModelService.createQuickDiffModelReference(editorModel.uri);
        if (!quickDiffModelRef2) {
          return constObservable(void 0);
        }
        toDispose.push(quickDiffModelRef2);
        return observableFromEvent(this, quickDiffModelRef2.object.onDidChange, () => {
          return quickDiffModelRef2.object.getQuickDiffResults().map((result) => ({
            original: result.original,
            modified: result.modified,
            changes: result.changes2
          }));
        });
      }
      const diffAlgorithm = this._configurationService.getValue("diffEditor.diffAlgorithm");
      const quickDiffModelRef = this._quickDiffModelService.createQuickDiffModelReference(editorModel.modified.uri, { algorithm: diffAlgorithm });
      if (!quickDiffModelRef) {
        return constObservable(void 0);
      }
      toDispose.push(quickDiffModelRef);
      return observableFromEvent(Event.any(quickDiffModelRef.object.onDidChange, diffEditor.onDidUpdateDiff), () => {
        const diffChanges = diffEditor.getDiffComputationResult()?.changes2 ?? [];
        const diffInformation = [{
          original: editorModel.original.uri,
          modified: editorModel.modified.uri,
          changes: diffChanges.map((change) => change)
        }];
        const quickDiffInformation = quickDiffModelRef.object.getQuickDiffResults().filter((result) => result.providerKind !== "primary").map((result) => ({
          original: result.original,
          modified: result.modified,
          changes: result.changes2
        }));
        return diffInformation.concat(quickDiffInformation);
      });
    });
    return derivedOpts({
      owner: this,
      equalsFn: (diff1, diff2) => equals(diff1, diff2, (a, b) => isTextEditorDiffInformationEqual(this._uriIdentityService, a, b))
    }, (reader) => {
      const editorModel = editorModelObs.read(reader);
      const editorChanges = editorChangesObs.read(reader).read(reader);
      if (!editorModel || !editorChanges) {
        return void 0;
      }
      const documentVersion = isITextModel(editorModel) ? editorModel.getVersionId() : editorModel.modified.getVersionId();
      return editorChanges.map((change) => {
        const changes = change.changes.map((change2) => [
          change2.original.startLineNumber,
          change2.original.endLineNumberExclusive,
          change2.modified.startLineNumber,
          change2.modified.endLineNumberExclusive
        ]);
        return {
          documentVersion,
          original: change.original,
          modified: change.modified,
          changes
        };
      });
    });
  }
  // --- from extension host process
  async $tryShowTextDocument(resource, options) {
    const uri = URI.revive(resource);
    const editorOptions = {
      preserveFocus: options.preserveFocus,
      pinned: options.pinned,
      selection: options.selection,
      // preserve pre 1.38 behaviour to not make group active when preserveFocus: true
      // but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
      activation: options.preserveFocus ? EditorActivation.RESTORE : void 0,
      override: EditorResolution.EXCLUSIVE_ONLY
    };
    const input = {
      resource: uri,
      options: editorOptions
    };
    const editor = await this._editorService.openEditor(input, columnToEditorGroup(this._editorGroupService, this._configurationService, options.position));
    if (!editor) {
      return void 0;
    }
    const editorControl = editor.getControl();
    const codeEditor = getCodeEditor(editorControl);
    return codeEditor ? this._editorLocator.getIdOfCodeEditor(codeEditor) : void 0;
  }
  async $tryShowEditor(id, position) {
    const mainThreadEditor = this._editorLocator.getEditor(id);
    if (mainThreadEditor) {
      const model = mainThreadEditor.getModel();
      await this._editorService.openEditor({
        resource: model.uri,
        options: { preserveFocus: false }
      }, columnToEditorGroup(this._editorGroupService, this._configurationService, position));
      return;
    }
  }
  async $tryHideEditor(id) {
    const mainThreadEditor = this._editorLocator.getEditor(id);
    if (mainThreadEditor) {
      const editorPanes = this._editorService.visibleEditorPanes;
      for (const editorPane of editorPanes) {
        if (mainThreadEditor.matches(editorPane)) {
          await editorPane.group.closeEditor(editorPane.input);
          return;
        }
      }
    }
  }
  $trySetSelections(id, selections) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.setSelections(selections);
    return Promise.resolve(void 0);
  }
  $trySetDecorations(id, key, ranges) {
    key = `${this._instanceId}-${key}`;
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.setDecorations(key, ranges);
    return Promise.resolve(void 0);
  }
  $trySetDecorationsFast(id, key, ranges) {
    key = `${this._instanceId}-${key}`;
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.setDecorationsFast(key, ranges);
    return Promise.resolve(void 0);
  }
  $tryRevealRange(id, range, revealType) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.revealRange(range, revealType);
    return Promise.resolve();
  }
  $trySetOptions(id, options) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    editor.setConfiguration(options);
    return Promise.resolve(void 0);
  }
  $tryApplyEdits(id, modelVersionId, edits, opts) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    return Promise.resolve(editor.applyEdits(modelVersionId, edits, opts));
  }
  $tryInsertSnippet(id, modelVersionId, template, ranges, opts) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(illegalArgument(`TextEditor(${id})`));
    }
    return Promise.resolve(editor.insertSnippet(modelVersionId, template, ranges, opts));
  }
  $registerTextEditorDecorationType(extensionId, key, options) {
    key = `${this._instanceId}-${key}`;
    this._registeredDecorationTypes[key] = true;
    this._codeEditorService.registerDecorationType(`exthost-api-${extensionId}`, key, options);
  }
  $removeTextEditorDecorationType(key) {
    key = `${this._instanceId}-${key}`;
    delete this._registeredDecorationTypes[key];
    this._codeEditorService.removeDecorationType(key);
  }
  $getDiffInformation(id) {
    const editor = this._editorLocator.getEditor(id);
    if (!editor) {
      return Promise.reject(new Error("No such TextEditor"));
    }
    const codeEditor = editor.getCodeEditor();
    if (!codeEditor) {
      return Promise.reject(new Error("No such CodeEditor"));
    }
    const codeEditorId = codeEditor.getId();
    const diffEditors = this._codeEditorService.listDiffEditors();
    const [diffEditor] = diffEditors.filter((d) => d.getOriginalEditor().getId() === codeEditorId || d.getModifiedEditor().getId() === codeEditorId);
    if (diffEditor) {
      return Promise.resolve(diffEditor.getLineChanges() || []);
    }
    if (!codeEditor.hasModel()) {
      return Promise.resolve([]);
    }
    const quickDiffModelRef = this._quickDiffModelService.createQuickDiffModelReference(codeEditor.getModel().uri);
    if (!quickDiffModelRef) {
      return Promise.resolve([]);
    }
    try {
      const primaryQuickDiff = quickDiffModelRef.object.quickDiffs.find((quickDiff) => quickDiff.kind === "primary");
      const primaryQuickDiffChanges = quickDiffModelRef.object.changes.filter((change) => change.providerId === primaryQuickDiff?.id);
      return Promise.resolve(primaryQuickDiffChanges.map((change) => change.change) ?? []);
    } finally {
      quickDiffModelRef.dispose();
    }
  }
};
MainThreadTextEditors.INSTANCE_COUNT = 0;
MainThreadTextEditors = __decorateClass([
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IQuickDiffModelService),
  __decorateParam(7, IUriIdentityService)
], MainThreadTextEditors);
CommandsRegistry.registerCommand("_workbench.revertAllDirty", async function(accessor) {
  const environmentService = accessor.get(IEnvironmentService);
  if (!environmentService.extensionTestsLocationURI) {
    throw new Error("Command is only available when running extension tests.");
  }
  const workingCopyService = accessor.get(IWorkingCopyService);
  for (const workingCopy of workingCopyService.dirtyWorkingCopies) {
    await workingCopy.revert({ soft: true });
  }
});
export {
  MainThreadTextEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZEVkaXRvcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpbGxlZ2FsQXJndW1lbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgYXMgb2JqZWN0RXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uT3B0aW9ucywgSURlY29yYXRpb25SZW5kZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucywgSVJlc291cmNlRWRpdG9ySW5wdXQsIEVkaXRvckFjdGl2YXRpb24sIEVkaXRvclJlc29sdXRpb24sIElUZXh0RWRpdG9yRGlmZkluZm9ybWF0aW9uLCBpc1RleHRFZGl0b3JEaWZmSW5mb3JtYXRpb25FcXVhbCwgSVRleHRFZGl0b3JDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkVGV4dEVkaXRvciB9IGZyb20gJy4vbWFpblRocmVhZEVkaXRvci5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgRXh0SG9zdEVkaXRvcnNTaGFwZSwgSUFwcGx5RWRpdHNPcHRpb25zLCBJVGV4dERvY3VtZW50U2hvd09wdGlvbnMsIElUZXh0RWRpdG9yQ29uZmlndXJhdGlvblVwZGF0ZSwgSVRleHRFZGl0b3JQb3NpdGlvbkRhdGEsIElVbmRvU3RvcE9wdGlvbnMsIE1haW5UaHJlYWRUZXh0RWRpdG9yc1NoYXBlLCBUZXh0RWRpdG9yUmV2ZWFsVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGVkaXRvckdyb3VwVG9Db2x1bW4sIGNvbHVtblRvRWRpdG9yR3JvdXAsIEVkaXRvckdyb3VwQ29sdW1uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvbGVnYWN5TGluZXNEaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJvbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgZ2V0Q29kZUVkaXRvciwgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrRGlmZk1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2NtL2Jyb3dzZXIvcXVpY2tEaWZmTW9kZWwuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgaXNJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaWZmQWxnb3JpdGhtTmFtZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTWFpblRocmVhZEVkaXRvckxvY2F0b3Ige1xuXHRnZXRFZGl0b3IoaWQ6IHN0cmluZyk6IE1haW5UaHJlYWRUZXh0RWRpdG9yIHwgdW5kZWZpbmVkO1xuXHRmaW5kVGV4dEVkaXRvcklkRm9yKGVkaXRvckNvbnRyb2w6IElFZGl0b3JDb250cm9sKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXRJZE9mQ29kZUVkaXRvcihjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcik6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRUZXh0RWRpdG9ycyBpbXBsZW1lbnRzIE1haW5UaHJlYWRUZXh0RWRpdG9yc1NoYXBlIHtcblxuXHRwcml2YXRlIHN0YXRpYyBJTlNUQU5DRV9DT1VOVDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW5jZUlkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0RWRpdG9yc1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgX3RleHRFZGl0b3JzTGlzdGVuZXJzTWFwOiB7IFtlZGl0b3JJZDogc3RyaW5nXTogSURpc3Bvc2FibGVbXSB9O1xuXHRwcml2YXRlIF9lZGl0b3JQb3NpdGlvbkRhdGE6IElUZXh0RWRpdG9yUG9zaXRpb25EYXRhIHwgbnVsbDtcblx0cHJpdmF0ZSBfcmVnaXN0ZXJlZERlY29yYXRpb25UeXBlczogeyBbZGVjb3JhdGlvblR5cGU6IHN0cmluZ106IGJvb2xlYW4gfTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JMb2NhdG9yOiBJTWFpblRocmVhZEVkaXRvckxvY2F0b3IsXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrRGlmZk1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0RpZmZNb2RlbFNlcnZpY2U6IElRdWlja0RpZmZNb2RlbFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2luc3RhbmNlSWQgPSBTdHJpbmcoKytNYWluVGhyZWFkVGV4dEVkaXRvcnMuSU5TVEFOQ0VfQ09VTlQpO1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdEVkaXRvcnMpO1xuXG5cdFx0dGhpcy5fdGV4dEVkaXRvcnNMaXN0ZW5lcnNNYXAgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX2VkaXRvclBvc2l0aW9uRGF0YSA9IG51bGw7XG5cblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSgoKSA9PiB0aGlzLl91cGRhdGVBY3RpdmVBbmRWaXNpYmxlVGV4dEVkaXRvcnMoKSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkUmVtb3ZlR3JvdXAoKCkgPT4gdGhpcy5fdXBkYXRlQWN0aXZlQW5kVmlzaWJsZVRleHRFZGl0b3JzKCkpKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvckdyb3VwU2VydmljZS5vbkRpZE1vdmVHcm91cCgoKSA9PiB0aGlzLl91cGRhdGVBY3RpdmVBbmRWaXNpYmxlVGV4dEVkaXRvcnMoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJlZERlY29yYXRpb25UeXBlcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdE9iamVjdC5rZXlzKHRoaXMuX3RleHRFZGl0b3JzTGlzdGVuZXJzTWFwKS5mb3JFYWNoKChlZGl0b3JJZCkgPT4ge1xuXHRcdFx0ZGlzcG9zZSh0aGlzLl90ZXh0RWRpdG9yc0xpc3RlbmVyc01hcFtlZGl0b3JJZF0pO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3RleHRFZGl0b3JzTGlzdGVuZXJzTWFwID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdGZvciAoY29uc3QgZGVjb3JhdGlvblR5cGUgaW4gdGhpcy5fcmVnaXN0ZXJlZERlY29yYXRpb25UeXBlcykge1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvclNlcnZpY2UucmVtb3ZlRGVjb3JhdGlvblR5cGUoZGVjb3JhdGlvblR5cGUpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3RlcmVkRGVjb3JhdGlvblR5cGVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdGhhbmRsZVRleHRFZGl0b3JBZGRlZCh0ZXh0RWRpdG9yOiBNYWluVGhyZWFkVGV4dEVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGlkID0gdGV4dEVkaXRvci5nZXRJZCgpO1xuXHRcdGNvbnN0IHRvRGlzcG9zZTogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRcdHRvRGlzcG9zZS5wdXNoKHRleHRFZGl0b3Iub25Qcm9wZXJ0aWVzQ2hhbmdlZCgoZGF0YSkgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdEVkaXRvclByb3BlcnRpZXNDaGFuZ2VkKGlkLCBkYXRhKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaWZmSW5mb3JtYXRpb25PYnMgPSB0aGlzLl9nZXRUZXh0RWRpdG9yRGlmZkluZm9ybWF0aW9uKHRleHRFZGl0b3IsIHRvRGlzcG9zZSk7XG5cdFx0dG9EaXNwb3NlLnB1c2goYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZkluZm9ybWF0aW9uID0gZGlmZkluZm9ybWF0aW9uT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRFZGl0b3JEaWZmSW5mb3JtYXRpb24oaWQsIGRpZmZJbmZvcm1hdGlvbik7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdGV4dEVkaXRvcnNMaXN0ZW5lcnNNYXBbaWRdID0gdG9EaXNwb3NlO1xuXHR9XG5cblx0aGFuZGxlVGV4dEVkaXRvclJlbW92ZWQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5fdGV4dEVkaXRvcnNMaXN0ZW5lcnNNYXBbaWRdKTtcblx0XHRkZWxldGUgdGhpcy5fdGV4dEVkaXRvcnNMaXN0ZW5lcnNNYXBbaWRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQWN0aXZlQW5kVmlzaWJsZVRleHRFZGl0b3JzKCk6IHZvaWQge1xuXG5cdFx0Ly8gZWRpdG9yIGNvbHVtbnNcblx0XHRjb25zdCBlZGl0b3JQb3NpdGlvbkRhdGEgPSB0aGlzLl9nZXRUZXh0RWRpdG9yUG9zaXRpb25EYXRhKCk7XG5cdFx0aWYgKCFvYmplY3RFcXVhbHModGhpcy5fZWRpdG9yUG9zaXRpb25EYXRhLCBlZGl0b3JQb3NpdGlvbkRhdGEpKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3JQb3NpdGlvbkRhdGEgPSBlZGl0b3JQb3NpdGlvbkRhdGE7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RWRpdG9yUG9zaXRpb25EYXRhKHRoaXMuX2VkaXRvclBvc2l0aW9uRGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGV4dEVkaXRvclBvc2l0aW9uRGF0YSgpOiBJVGV4dEVkaXRvclBvc2l0aW9uRGF0YSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVGV4dEVkaXRvclBvc2l0aW9uRGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3JQYW5lIG9mIHRoaXMuX2VkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvclBhbmVzKSB7XG5cdFx0XHRjb25zdCBpZCA9IHRoaXMuX2VkaXRvckxvY2F0b3IuZmluZFRleHRFZGl0b3JJZEZvcihlZGl0b3JQYW5lKTtcblx0XHRcdGlmIChpZCkge1xuXHRcdFx0XHRyZXN1bHRbaWRdID0gZWRpdG9yR3JvdXBUb0NvbHVtbih0aGlzLl9lZGl0b3JHcm91cFNlcnZpY2UsIGVkaXRvclBhbmUuZ3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGV4dEVkaXRvckRpZmZJbmZvcm1hdGlvbih0ZXh0RWRpdG9yOiBNYWluVGhyZWFkVGV4dEVkaXRvciwgdG9EaXNwb3NlOiBJRGlzcG9zYWJsZVtdKTogSU9ic2VydmFibGU8SVRleHRFZGl0b3JEaWZmSW5mb3JtYXRpb25bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvZGVFZGl0b3IgPSB0ZXh0RWRpdG9yLmdldENvZGVFZGl0b3IoKTtcblx0XHRpZiAoIWNvZGVFZGl0b3IpIHtcblx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgVGV4dE1vZGVsIGJlbG9uZ3MgdG8gYSBEaWZmRWRpdG9yXG5cdFx0Y29uc3QgW2RpZmZFZGl0b3JdID0gdGhpcy5fY29kZUVkaXRvclNlcnZpY2UubGlzdERpZmZFZGl0b3JzKClcblx0XHRcdC5maWx0ZXIoZCA9PlxuXHRcdFx0XHRkLmdldE9yaWdpbmFsRWRpdG9yKCkuZ2V0SWQoKSA9PT0gY29kZUVkaXRvci5nZXRJZCgpIHx8XG5cdFx0XHRcdGQuZ2V0TW9kaWZpZWRFZGl0b3IoKS5nZXRJZCgpID09PSBjb2RlRWRpdG9yLmdldElkKCkpO1xuXG5cdFx0Y29uc3QgZWRpdG9yTW9kZWxPYnMgPSBkaWZmRWRpdG9yXG5cdFx0XHQ/IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgZGlmZkVkaXRvci5vbkRpZENoYW5nZU1vZGVsLCAoKSA9PiBkaWZmRWRpdG9yLmdldE1vZGVsKCkpXG5cdFx0XHQ6IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgY29kZUVkaXRvci5vbkRpZENoYW5nZU1vZGVsLCAoKSA9PiBjb2RlRWRpdG9yLmdldE1vZGVsKCkpO1xuXG5cdFx0Y29uc3QgZWRpdG9yQ2hhbmdlc09icyA9IGRlcml2ZWQ8SU9ic2VydmFibGU8eyBvcmlnaW5hbDogVVJJOyBtb2RpZmllZDogVVJJOyBjaGFuZ2VzOiByZWFkb25seSBMaW5lUmFuZ2VNYXBwaW5nW10gfVtdIHwgdW5kZWZpbmVkPj4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvck1vZGVsID0gZWRpdG9yTW9kZWxPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFlZGl0b3JNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRleHRFZGl0b3Jcblx0XHRcdGlmIChpc0lUZXh0TW9kZWwoZWRpdG9yTW9kZWwpKSB7XG5cdFx0XHRcdGNvbnN0IHF1aWNrRGlmZk1vZGVsUmVmID0gdGhpcy5fcXVpY2tEaWZmTW9kZWxTZXJ2aWNlLmNyZWF0ZVF1aWNrRGlmZk1vZGVsUmVmZXJlbmNlKGVkaXRvck1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghcXVpY2tEaWZmTW9kZWxSZWYpIHtcblx0XHRcdFx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0b0Rpc3Bvc2UucHVzaChxdWlja0RpZmZNb2RlbFJlZik7XG5cdFx0XHRcdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHF1aWNrRGlmZk1vZGVsUmVmLm9iamVjdC5vbkRpZENoYW5nZSwgKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBxdWlja0RpZmZNb2RlbFJlZi5vYmplY3QuZ2V0UXVpY2tEaWZmUmVzdWx0cygpXG5cdFx0XHRcdFx0XHQubWFwKHJlc3VsdCA9PiAoe1xuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbDogcmVzdWx0Lm9yaWdpbmFsLFxuXHRcdFx0XHRcdFx0XHRtb2RpZmllZDogcmVzdWx0Lm1vZGlmaWVkLFxuXHRcdFx0XHRcdFx0XHRjaGFuZ2VzOiByZXN1bHQuY2hhbmdlczJcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERpZmZFZGl0b3IgLSB3ZSBjcmVhdGUgYSBxdWljayBkaWZmIG1vZGVsICh1c2luZyB0aGUgZGlmZiBhbGdvcml0aG0gdXNlZCBieSB0aGUgZGlmZiBlZGl0b3IpXG5cdFx0XHQvLyBldmVuIGZvciBkaWZmIGVkaXRvciBzbyB0aGF0IHdlIGNhbiBwcm92aWRlIG11bHRpcGxlIFwib3JpZ2luYWwgcmVzb3VyY2VzXCIgdG8gZGlmZiB3aXRoIHRoZSBvcmlnaW5hbFxuXHRcdFx0Ly8gYW5kIG1vZGlmaWVkIHJlc291cmNlcy5cblx0XHRcdGNvbnN0IGRpZmZBbGdvcml0aG0gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxEaWZmQWxnb3JpdGhtTmFtZT4oJ2RpZmZFZGl0b3IuZGlmZkFsZ29yaXRobScpO1xuXHRcdFx0Y29uc3QgcXVpY2tEaWZmTW9kZWxSZWYgPSB0aGlzLl9xdWlja0RpZmZNb2RlbFNlcnZpY2UuY3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2UoZWRpdG9yTW9kZWwubW9kaWZpZWQudXJpLCB7IGFsZ29yaXRobTogZGlmZkFsZ29yaXRobSB9KTtcblx0XHRcdGlmICghcXVpY2tEaWZmTW9kZWxSZWYpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0b0Rpc3Bvc2UucHVzaChxdWlja0RpZmZNb2RlbFJlZik7XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YWJsZUZyb21FdmVudChFdmVudC5hbnkocXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0Lm9uRGlkQ2hhbmdlLCBkaWZmRWRpdG9yLm9uRGlkVXBkYXRlRGlmZiksICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZGlmZkNoYW5nZXMgPSBkaWZmRWRpdG9yLmdldERpZmZDb21wdXRhdGlvblJlc3VsdCgpPy5jaGFuZ2VzMiA/PyBbXTtcblx0XHRcdFx0Y29uc3QgZGlmZkluZm9ybWF0aW9uID0gW3tcblx0XHRcdFx0XHRvcmlnaW5hbDogZWRpdG9yTW9kZWwub3JpZ2luYWwudXJpLFxuXHRcdFx0XHRcdG1vZGlmaWVkOiBlZGl0b3JNb2RlbC5tb2RpZmllZC51cmksXG5cdFx0XHRcdFx0Y2hhbmdlczogZGlmZkNoYW5nZXMubWFwKGNoYW5nZSA9PiBjaGFuZ2UgYXMgTGluZVJhbmdlTWFwcGluZylcblx0XHRcdFx0fV07XG5cblx0XHRcdFx0Ly8gQWRkIHF1aWNrIGRpZmYgaW5mb3JtYXRpb24gZnJvbSBzZWNvbmRhcnkvY29udHJpYnV0ZWQgcHJvdmlkZXJzXG5cdFx0XHRcdGNvbnN0IHF1aWNrRGlmZkluZm9ybWF0aW9uID0gcXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0LmdldFF1aWNrRGlmZlJlc3VsdHMoKVxuXHRcdFx0XHRcdC5maWx0ZXIocmVzdWx0ID0+IHJlc3VsdC5wcm92aWRlcktpbmQgIT09ICdwcmltYXJ5Jylcblx0XHRcdFx0XHQubWFwKHJlc3VsdCA9PiAoe1xuXHRcdFx0XHRcdFx0b3JpZ2luYWw6IHJlc3VsdC5vcmlnaW5hbCxcblx0XHRcdFx0XHRcdG1vZGlmaWVkOiByZXN1bHQubW9kaWZpZWQsXG5cdFx0XHRcdFx0XHRjaGFuZ2VzOiByZXN1bHQuY2hhbmdlczJcblx0XHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gQ29tYmluZSBkaWZmIGFuZCBxdWljayBkaWZmIGluZm9ybWF0aW9uXG5cdFx0XHRcdHJldHVybiBkaWZmSW5mb3JtYXRpb24uY29uY2F0KHF1aWNrRGlmZkluZm9ybWF0aW9uKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGRlcml2ZWRPcHRzKHtcblx0XHRcdG93bmVyOiB0aGlzLFxuXHRcdFx0ZXF1YWxzRm46IChkaWZmMSwgZGlmZjIpID0+IGVxdWFscyhkaWZmMSwgZGlmZjIsIChhLCBiKSA9PlxuXHRcdFx0XHRpc1RleHRFZGl0b3JEaWZmSW5mb3JtYXRpb25FcXVhbCh0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UsIGEsIGIpKVxuXHRcdH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IGVkaXRvck1vZGVsT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVkaXRvckNoYW5nZXMgPSBlZGl0b3JDaGFuZ2VzT2JzLnJlYWQocmVhZGVyKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWVkaXRvck1vZGVsIHx8ICFlZGl0b3JDaGFuZ2VzKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRvY3VtZW50VmVyc2lvbiA9IGlzSVRleHRNb2RlbChlZGl0b3JNb2RlbClcblx0XHRcdFx0PyBlZGl0b3JNb2RlbC5nZXRWZXJzaW9uSWQoKVxuXHRcdFx0XHQ6IGVkaXRvck1vZGVsLm1vZGlmaWVkLmdldFZlcnNpb25JZCgpO1xuXG5cdFx0XHRyZXR1cm4gZWRpdG9yQ2hhbmdlcy5tYXAoY2hhbmdlID0+IHtcblx0XHRcdFx0Y29uc3QgY2hhbmdlczogSVRleHRFZGl0b3JDaGFuZ2VbXSA9IGNoYW5nZS5jaGFuZ2VzXG5cdFx0XHRcdFx0Lm1hcChjaGFuZ2UgPT4gW1xuXHRcdFx0XHRcdFx0Y2hhbmdlLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdGNoYW5nZS5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLFxuXHRcdFx0XHRcdFx0Y2hhbmdlLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdGNoYW5nZS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlXG5cdFx0XHRcdFx0XSk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRkb2N1bWVudFZlcnNpb24sXG5cdFx0XHRcdFx0b3JpZ2luYWw6IGNoYW5nZS5vcmlnaW5hbCxcblx0XHRcdFx0XHRtb2RpZmllZDogY2hhbmdlLm1vZGlmaWVkLFxuXHRcdFx0XHRcdGNoYW5nZXNcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tIGZyb20gZXh0ZW5zaW9uIGhvc3QgcHJvY2Vzc1xuXG5cdGFzeW5jICR0cnlTaG93VGV4dERvY3VtZW50KHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBvcHRpb25zOiBJVGV4dERvY3VtZW50U2hvd09wdGlvbnMpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUocmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0cHJlc2VydmVGb2N1czogb3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0cGlubmVkOiBvcHRpb25zLnBpbm5lZCxcblx0XHRcdHNlbGVjdGlvbjogb3B0aW9ucy5zZWxlY3Rpb24sXG5cdFx0XHQvLyBwcmVzZXJ2ZSBwcmUgMS4zOCBiZWhhdmlvdXIgdG8gbm90IG1ha2UgZ3JvdXAgYWN0aXZlIHdoZW4gcHJlc2VydmVGb2N1czogdHJ1ZVxuXHRcdFx0Ly8gYnV0IG1ha2Ugc3VyZSB0byByZXN0b3JlIHRoZSBlZGl0b3IgdG8gZml4IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83OTYzM1xuXHRcdFx0YWN0aXZhdGlvbjogb3B0aW9ucy5wcmVzZXJ2ZUZvY3VzID8gRWRpdG9yQWN0aXZhdGlvbi5SRVNUT1JFIDogdW5kZWZpbmVkLFxuXHRcdFx0b3ZlcnJpZGU6IEVkaXRvclJlc29sdXRpb24uRVhDTFVTSVZFX09OTFlcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5wdXQ6IElSZXNvdXJjZUVkaXRvcklucHV0ID0ge1xuXHRcdFx0cmVzb3VyY2U6IHVyaSxcblx0XHRcdG9wdGlvbnM6IGVkaXRvck9wdGlvbnNcblx0XHR9O1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCBjb2x1bW5Ub0VkaXRvckdyb3VwKHRoaXMuX2VkaXRvckdyb3VwU2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIG9wdGlvbnMucG9zaXRpb24pKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gQ29tcG9zaXRlIGVkaXRvcnMgYXJlIG1hZGUgdXAgb2YgbWFueSBlZGl0b3JzIHNvIHdlIHJldHVybiB0aGUgYWN0aXZlIG9uZSBhdCB0aGUgdGltZSBvZiBvcGVuaW5nXG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvci5nZXRDb250cm9sKCk7XG5cdFx0Y29uc3QgY29kZUVkaXRvciA9IGdldENvZGVFZGl0b3IoZWRpdG9yQ29udHJvbCk7XG5cdFx0cmV0dXJuIGNvZGVFZGl0b3IgPyB0aGlzLl9lZGl0b3JMb2NhdG9yLmdldElkT2ZDb2RlRWRpdG9yKGNvZGVFZGl0b3IpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgJHRyeVNob3dFZGl0b3IoaWQ6IHN0cmluZywgcG9zaXRpb24/OiBFZGl0b3JHcm91cENvbHVtbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1haW5UaHJlYWRFZGl0b3IgPSB0aGlzLl9lZGl0b3JMb2NhdG9yLmdldEVkaXRvcihpZCk7XG5cdFx0aWYgKG1haW5UaHJlYWRFZGl0b3IpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbWFpblRocmVhZEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IG1vZGVsLnVyaSxcblx0XHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9XG5cdFx0XHR9LCBjb2x1bW5Ub0VkaXRvckdyb3VwKHRoaXMuX2VkaXRvckdyb3VwU2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHBvc2l0aW9uKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHRyeUhpZGVFZGl0b3IoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1haW5UaHJlYWRFZGl0b3IgPSB0aGlzLl9lZGl0b3JMb2NhdG9yLmdldEVkaXRvcihpZCk7XG5cdFx0aWYgKG1haW5UaHJlYWRFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGVkaXRvclBhbmVzID0gdGhpcy5fZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9yUGFuZXM7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvclBhbmUgb2YgZWRpdG9yUGFuZXMpIHtcblx0XHRcdFx0aWYgKG1haW5UaHJlYWRFZGl0b3IubWF0Y2hlcyhlZGl0b3JQYW5lKSkge1xuXHRcdFx0XHRcdGF3YWl0IGVkaXRvclBhbmUuZ3JvdXAuY2xvc2VFZGl0b3IoZWRpdG9yUGFuZS5pbnB1dCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0JHRyeVNldFNlbGVjdGlvbnMoaWQ6IHN0cmluZywgc2VsZWN0aW9uczogSVNlbGVjdGlvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yTG9jYXRvci5nZXRFZGl0b3IoaWQpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoaWxsZWdhbEFyZ3VtZW50KGBUZXh0RWRpdG9yKCR7aWR9KWApKTtcblx0XHR9XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0JHRyeVNldERlY29yYXRpb25zKGlkOiBzdHJpbmcsIGtleTogc3RyaW5nLCByYW5nZXM6IElEZWNvcmF0aW9uT3B0aW9uc1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0a2V5ID0gYCR7dGhpcy5faW5zdGFuY2VJZH0tJHtrZXl9YDtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JMb2NhdG9yLmdldEVkaXRvcihpZCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChpbGxlZ2FsQXJndW1lbnQoYFRleHRFZGl0b3IoJHtpZH0pYCkpO1xuXHRcdH1cblx0XHRlZGl0b3Iuc2V0RGVjb3JhdGlvbnMoa2V5LCByYW5nZXMpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdCR0cnlTZXREZWNvcmF0aW9uc0Zhc3QoaWQ6IHN0cmluZywga2V5OiBzdHJpbmcsIHJhbmdlczogbnVtYmVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRrZXkgPSBgJHt0aGlzLl9pbnN0YW5jZUlkfS0ke2tleX1gO1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvckxvY2F0b3IuZ2V0RWRpdG9yKGlkKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGlsbGVnYWxBcmd1bWVudChgVGV4dEVkaXRvcigke2lkfSlgKSk7XG5cdFx0fVxuXHRcdGVkaXRvci5zZXREZWNvcmF0aW9uc0Zhc3Qoa2V5LCByYW5nZXMpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdCR0cnlSZXZlYWxSYW5nZShpZDogc3RyaW5nLCByYW5nZTogSVJhbmdlLCByZXZlYWxUeXBlOiBUZXh0RWRpdG9yUmV2ZWFsVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvckxvY2F0b3IuZ2V0RWRpdG9yKGlkKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGlsbGVnYWxBcmd1bWVudChgVGV4dEVkaXRvcigke2lkfSlgKSk7XG5cdFx0fVxuXHRcdGVkaXRvci5yZXZlYWxSYW5nZShyYW5nZSwgcmV2ZWFsVHlwZSk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0JHRyeVNldE9wdGlvbnMoaWQ6IHN0cmluZywgb3B0aW9uczogSVRleHRFZGl0b3JDb25maWd1cmF0aW9uVXBkYXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yTG9jYXRvci5nZXRFZGl0b3IoaWQpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoaWxsZWdhbEFyZ3VtZW50KGBUZXh0RWRpdG9yKCR7aWR9KWApKTtcblx0XHR9XG5cdFx0ZWRpdG9yLnNldENvbmZpZ3VyYXRpb24ob3B0aW9ucyk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0JHRyeUFwcGx5RWRpdHMoaWQ6IHN0cmluZywgbW9kZWxWZXJzaW9uSWQ6IG51bWJlciwgZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10sIG9wdHM6IElBcHBseUVkaXRzT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvckxvY2F0b3IuZ2V0RWRpdG9yKGlkKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGlsbGVnYWxBcmd1bWVudChgVGV4dEVkaXRvcigke2lkfSlgKSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZWRpdG9yLmFwcGx5RWRpdHMobW9kZWxWZXJzaW9uSWQsIGVkaXRzLCBvcHRzKSk7XG5cdH1cblxuXHQkdHJ5SW5zZXJ0U25pcHBldChpZDogc3RyaW5nLCBtb2RlbFZlcnNpb25JZDogbnVtYmVyLCB0ZW1wbGF0ZTogc3RyaW5nLCByYW5nZXM6IHJlYWRvbmx5IElSYW5nZVtdLCBvcHRzOiBJVW5kb1N0b3BPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yTG9jYXRvci5nZXRFZGl0b3IoaWQpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoaWxsZWdhbEFyZ3VtZW50KGBUZXh0RWRpdG9yKCR7aWR9KWApKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlZGl0b3IuaW5zZXJ0U25pcHBldChtb2RlbFZlcnNpb25JZCwgdGVtcGxhdGUsIHJhbmdlcywgb3B0cykpO1xuXHR9XG5cblx0JHJlZ2lzdGVyVGV4dEVkaXRvckRlY29yYXRpb25UeXBlKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBrZXk6IHN0cmluZywgb3B0aW9uczogSURlY29yYXRpb25SZW5kZXJPcHRpb25zKTogdm9pZCB7XG5cdFx0a2V5ID0gYCR7dGhpcy5faW5zdGFuY2VJZH0tJHtrZXl9YDtcblx0XHR0aGlzLl9yZWdpc3RlcmVkRGVjb3JhdGlvblR5cGVzW2tleV0gPSB0cnVlO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoYGV4dGhvc3QtYXBpLSR7ZXh0ZW5zaW9uSWR9YCwga2V5LCBvcHRpb25zKTtcblx0fVxuXG5cdCRyZW1vdmVUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUoa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRrZXkgPSBgJHt0aGlzLl9pbnN0YW5jZUlkfS0ke2tleX1gO1xuXHRcdGRlbGV0ZSB0aGlzLl9yZWdpc3RlcmVkRGVjb3JhdGlvblR5cGVzW2tleV07XG5cdFx0dGhpcy5fY29kZUVkaXRvclNlcnZpY2UucmVtb3ZlRGVjb3JhdGlvblR5cGUoa2V5KTtcblx0fVxuXG5cdCRnZXREaWZmSW5mb3JtYXRpb24oaWQ6IHN0cmluZyk6IFByb21pc2U8SUNoYW5nZVtdPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yTG9jYXRvci5nZXRFZGl0b3IoaWQpO1xuXG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ05vIHN1Y2ggVGV4dEVkaXRvcicpKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlRWRpdG9yID0gZWRpdG9yLmdldENvZGVFZGl0b3IoKTtcblx0XHRpZiAoIWNvZGVFZGl0b3IpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ05vIHN1Y2ggQ29kZUVkaXRvcicpKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlRWRpdG9ySWQgPSBjb2RlRWRpdG9yLmdldElkKCk7XG5cdFx0Y29uc3QgZGlmZkVkaXRvcnMgPSB0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5saXN0RGlmZkVkaXRvcnMoKTtcblx0XHRjb25zdCBbZGlmZkVkaXRvcl0gPSBkaWZmRWRpdG9ycy5maWx0ZXIoZCA9PiBkLmdldE9yaWdpbmFsRWRpdG9yKCkuZ2V0SWQoKSA9PT0gY29kZUVkaXRvcklkIHx8IGQuZ2V0TW9kaWZpZWRFZGl0b3IoKS5nZXRJZCgpID09PSBjb2RlRWRpdG9ySWQpO1xuXG5cdFx0aWYgKGRpZmZFZGl0b3IpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZGlmZkVkaXRvci5nZXRMaW5lQ2hhbmdlcygpIHx8IFtdKTtcblx0XHR9XG5cblx0XHRpZiAoIWNvZGVFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVpY2tEaWZmTW9kZWxSZWYgPSB0aGlzLl9xdWlja0RpZmZNb2RlbFNlcnZpY2UuY3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2UoY29kZUVkaXRvci5nZXRNb2RlbCgpLnVyaSk7XG5cdFx0aWYgKCFxdWlja0RpZmZNb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByaW1hcnlRdWlja0RpZmYgPSBxdWlja0RpZmZNb2RlbFJlZi5vYmplY3QucXVpY2tEaWZmcy5maW5kKHF1aWNrRGlmZiA9PiBxdWlja0RpZmYua2luZCA9PT0gJ3ByaW1hcnknKTtcblx0XHRcdGNvbnN0IHByaW1hcnlRdWlja0RpZmZDaGFuZ2VzID0gcXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0LmNoYW5nZXMuZmlsdGVyKGNoYW5nZSA9PiBjaGFuZ2UucHJvdmlkZXJJZCA9PT0gcHJpbWFyeVF1aWNrRGlmZj8uaWQpO1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHByaW1hcnlRdWlja0RpZmZDaGFuZ2VzLm1hcChjaGFuZ2UgPT4gY2hhbmdlLmNoYW5nZSkgPz8gW10pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRxdWlja0RpZmZNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbi8vIC0tLSBjb21tYW5kc1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX3dvcmtiZW5jaC5yZXZlcnRBbGxEaXJ0eScsIGFzeW5jIGZ1bmN0aW9uIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVudmlyb25tZW50U2VydmljZSk7XG5cdGlmICghZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvbW1hbmQgaXMgb25seSBhdmFpbGFibGUgd2hlbiBydW5uaW5nIGV4dGVuc2lvbiB0ZXN0cy4nKTtcblx0fVxuXG5cdGNvbnN0IHdvcmtpbmdDb3B5U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlTZXJ2aWNlKTtcblx0Zm9yIChjb25zdCB3b3JraW5nQ29weSBvZiB3b3JraW5nQ29weVNlcnZpY2UuZGlydHlXb3JraW5nQ29waWVzKSB7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmV2ZXJ0KHsgc29mdDogdHJ1ZSB9KTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXNCLFNBQVMsdUJBQXVCO0FBQ3RELFNBQVMsVUFBVSxvQkFBb0I7QUFDdkMsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUtuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFtRCxrQkFBa0Isa0JBQThDLHdDQUEyRDtBQUc5SyxTQUFTLHNCQUFzTjtBQUMvTixTQUFTLHFCQUFxQiwyQkFBOEM7QUFDNUUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFLcEMsU0FBUyxxQkFBa0M7QUFDM0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFTLGlCQUFpQixTQUFTLGFBQTBCLDJCQUEyQjtBQUNqRyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxhQUFhO0FBU2YsSUFBTSx3QkFBTixNQUFrRTtBQUFBLEVBV3hFLFlBQ2tCLGdCQUNqQixnQkFDcUMsb0JBQ0osZ0JBQ00scUJBQ0MsdUJBQ0Msd0JBQ0gscUJBQ3JDO0FBUmdCO0FBRW9CO0FBQ0o7QUFDTTtB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
