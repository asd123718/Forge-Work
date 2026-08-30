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
import { multibyteAwareBtoa } from "../../../base/common/strings.js";
import { createCancelablePromise, DeferredPromise } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { isCancellationError, onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { basename } from "../../../base/common/path.js";
import { isEqual, isEqualOrParent, toLocalResource } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { localize } from "../../../nls.js";
import { IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { FileOperation, IFileService } from "../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { IUndoRedoService, UndoRedoElementType } from "../../../platform/undoRedo/common/undoRedo.js";
import { reviveWebviewExtension } from "./mainThreadWebviews.js";
import * as extHostProtocol from "../common/extHost.protocol.js";
import { CustomEditorDiffInput, CustomEditorSideBySideDiffInput } from "../../contrib/customEditor/browser/customEditorDiffInput.js";
import { CustomEditorInput } from "../../contrib/customEditor/browser/customEditorInput.js";
import { ICustomEditorService } from "../../contrib/customEditor/common/customEditor.js";
import { CustomTextEditorModel } from "../../contrib/customEditor/common/customTextEditorModel.js";
import { ExtensionKeyedWebviewOriginStore } from "../../contrib/webview/browser/webview.js";
import { IWebviewWorkbenchService } from "../../contrib/webviewPanel/browser/webviewWorkbenchService.js";
import { editorGroupToColumn } from "../../services/editor/common/editorGroupColumn.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { IPathService } from "../../services/path/common/pathService.js";
import { ResourceWorkingCopy } from "../../services/workingCopy/common/resourceWorkingCopy.js";
import { NO_TYPE_ID, WorkingCopyCapabilities } from "../../services/workingCopy/common/workingCopy.js";
import { IWorkingCopyFileService } from "../../services/workingCopy/common/workingCopyFileService.js";
import { IWorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { IUntitledTextEditorService } from "../../services/untitled/common/untitledTextEditorService.js";
var CustomEditorModelType = /* @__PURE__ */ ((CustomEditorModelType2) => {
  CustomEditorModelType2[CustomEditorModelType2["Custom"] = 0] = "Custom";
  CustomEditorModelType2[CustomEditorModelType2["Text"] = 1] = "Text";
  return CustomEditorModelType2;
})(CustomEditorModelType || {});
let MainThreadCustomEditors = class extends Disposable {
  constructor(context, mainThreadWebview, mainThreadWebviewPanels, extensionService, storageService, workingCopyService, workingCopyFileService, _customEditorService, _editorGroupService, _editorService, _instantiationService, _webviewWorkbenchService, _uriIdentityService, _untitledTextEditorService) {
    super();
    this.mainThreadWebview = mainThreadWebview;
    this.mainThreadWebviewPanels = mainThreadWebviewPanels;
    this._customEditorService = _customEditorService;
    this._editorGroupService = _editorGroupService;
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._webviewWorkbenchService = _webviewWorkbenchService;
    this._uriIdentityService = _uriIdentityService;
    this._untitledTextEditorService = _untitledTextEditorService;
    this._editorProviders = this._register(new DisposableMap());
    this._editorRenameBackups = /* @__PURE__ */ new Map();
    this._pendingSideBySideDiffResolutions = /* @__PURE__ */ new Map();
    this._webviewOriginStore = new ExtensionKeyedWebviewOriginStore("mainThreadCustomEditors.origins", storageService);
    this._proxyCustomEditors = context.getProxy(extHostProtocol.ExtHostContext.ExtHostCustomEditors);
    this._register(workingCopyFileService.registerWorkingCopyProvider((editorResource) => {
      const matchedWorkingCopies = [];
      for (const workingCopy of workingCopyService.workingCopies) {
        if (workingCopy instanceof MainThreadCustomEditorModel) {
          if (isEqualOrParent(editorResource, workingCopy.editorResource)) {
            matchedWorkingCopies.push(workingCopy);
          }
        }
      }
      return matchedWorkingCopies;
    }));
    this._register(_webviewWorkbenchService.registerResolver({
      canResolve: (webview) => {
        if (webview instanceof CustomEditorInput || webview instanceof CustomEditorDiffInput || webview instanceof CustomEditorSideBySideDiffInput) {
          extensionService.activateByEvent(`onCustomEditor:${webview.viewType}`);
        }
        return false;
      },
      resolveWebview: () => {
        throw new Error("not implemented");
      }
    }));
    this._register(workingCopyFileService.onWillRunWorkingCopyFileOperation(async (e) => this.onWillRunWorkingCopyFileOperation(e)));
  }
  $registerTextEditorProvider(extensionData, viewType, options, capabilities, serializeBuffersForPostMessage) {
    this.registerEditorProvider(
      1 /* Text */,
      reviveWebviewExtension(extensionData),
      viewType,
      options,
      capabilities,
      true,
      serializeBuffersForPostMessage
    );
  }
  $registerCustomEditorProvider(extensionData, viewType, options, capabilities, supportsMultipleEditorsPerDocument, serializeBuffersForPostMessage) {
    this.registerEditorProvider(
      0 /* Custom */,
      reviveWebviewExtension(extensionData),
      viewType,
      options,
      capabilities,
      supportsMultipleEditorsPerDocument,
      serializeBuffersForPostMessage
    );
  }
  registerEditorProvider(modelType, extension, viewType, options, capabilities, supportsMultipleEditorsPerDocument, serializeBuffersForPostMessage) {
    if (this._editorProviders.has(viewType)) {
      throw new Error(`Provider for ${viewType} already registered`);
    }
    const disposables = new DisposableStore();
    disposables.add(this._customEditorService.registerCustomEditorCapabilities(viewType, {
      supportsMultipleEditorsPerDocument,
      isTextEditor: modelType === 1 /* Text */,
      supportsInlineDiff: capabilities.supportsInlineDiff,
      supportsSideBySideDiff: capabilities.supportsSideBySideDiff
    }));
    disposables.add(this._webviewWorkbenchService.registerResolver({
      canResolve: (webviewInput) => {
        return (webviewInput instanceof CustomEditorInput || webviewInput instanceof CustomEditorDiffInput || webviewInput instanceof CustomEditorSideBySideDiffInput) && webviewInput.viewType === viewType;
      },
      resolveWebview: async (webviewInput, cancellation) => {
        if (!(webviewInput instanceof CustomEditorInput || webviewInput instanceof CustomEditorDiffInput || webviewInput instanceof CustomEditorSideBySideDiffInput)) {
          return;
        }
        const handle = generateUuid();
        webviewInput.webview.origin = this._webviewOriginStore.getOrigin(viewType, extension.id);
        this.mainThreadWebviewPanels.addWebviewInput(handle, webviewInput, { serializeBuffersForPostMessage });
        webviewInput.webview.options = options;
        webviewInput.webview.extension = extension;
        const resource = webviewInput instanceof CustomEditorDiffInput ? webviewInput.modifiedResource : webviewInput.resource;
        let backupId;
        if (webviewInput instanceof CustomEditorInput) {
          backupId = webviewInput.backupId;
          if (webviewInput.oldResource && !webviewInput.backupId) {
            const backup = this._editorRenameBackups.get(webviewInput.oldResource.toString());
            backupId = backup?.backupId;
            this._editorRenameBackups.delete(webviewInput.oldResource.toString());
          }
        }
        let modelRef;
        const additionalModelRefs = new DisposableStore();
        try {
          modelRef = await this.getOrCreateCustomEditorModel(modelType, resource, viewType, { backupId }, cancellation);
          if (webviewInput instanceof CustomEditorDiffInput && !isEqual(webviewInput.originalResource, resource)) {
            additionalModelRefs.add(await this.getOrCreateCustomEditorModel(modelType, webviewInput.originalResource, viewType, {}, cancellation));
          } else if (modelType === 1 /* Text */ && webviewInput instanceof CustomEditorSideBySideDiffInput) {
            const otherResource = webviewInput.side === "original" ? webviewInput.modifiedResource : webviewInput.originalResource;
            if (!isEqual(otherResource, resource)) {
              additionalModelRefs.add(await this.getOrCreateCustomEditorModel(modelType, otherResource, viewType, {}, cancellation));
            }
          }
        } catch (error) {
          onUnexpectedError(error);
          webviewInput.webview.setHtml(this.mainThreadWebview.getWebviewResolvedFailedContent(viewType));
          additionalModelRefs.dispose();
          modelRef?.dispose();
          return;
        }
        if (!modelRef) {
          additionalModelRefs.dispose();
          return;
        }
        let resolvedModelRef = modelRef;
        if (cancellation.isCancellationRequested) {
          additionalModelRefs.dispose();
          resolvedModelRef.dispose();
          return;
        }
        const disposeModelRefs = () => {
          additionalModelRefs.dispose();
          if (resolvedModelRef.object.isDirty()) {
            const sub = resolvedModelRef.object.onDidChangeDirty(() => {
              if (!resolvedModelRef.object.isDirty()) {
                sub.dispose();
                resolvedModelRef.dispose();
              }
            });
            return;
          }
          resolvedModelRef.dispose();
        };
        const disposeSub = webviewInput.webview.onDidDispose(() => {
          disposeSub.dispose();
          inputDisposeSub.dispose();
          disposeModelRefs();
        });
        const inputDisposeSub = webviewInput.onWillDispose(() => {
          inputDisposeSub.dispose();
          disposeSub.dispose();
          disposeModelRefs();
        });
        if (webviewInput instanceof CustomEditorInput && capabilities.supportsMove) {
          webviewInput.onMove(async (newResource) => {
            const oldModel = resolvedModelRef;
            resolvedModelRef = await this.getOrCreateCustomEditorModel(modelType, newResource, viewType, {}, CancellationToken.None);
            this._proxyCustomEditors.$onMoveCustomEditor(handle, newResource, viewType);
            oldModel.dispose();
          });
        }
        try {
          const initData = {
            title: webviewInput.getTitle(),
            contentOptions: webviewInput.webview.contentOptions,
            options: webviewInput.webview.options,
            active: webviewInput === this._editorService.activeEditor
          };
          const position = editorGroupToColumn(this._editorGroupService, webviewInput.group || 0);
          if (webviewInput instanceof CustomEditorDiffInput) {
            const originalResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(webviewInput.originalResource) : webviewInput.originalResource;
            const modifiedResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(webviewInput.modifiedResource) : webviewInput.modifiedResource;
            await this._proxyCustomEditors.$resolveCustomEditorInlineDiff(
              originalResource,
              modifiedResource,
              handle,
              viewType,
              initData,
              position,
              cancellation
            );
          } else if (webviewInput instanceof CustomEditorSideBySideDiffInput) {
            await this.resolveCustomEditorSideBySideDiff(modelType, webviewInput, handle, viewType, initData, position, cancellation);
          } else {
            const actualResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(resource) : resource;
            await this._proxyCustomEditors.$resolveCustomEditor(actualResource, handle, viewType, initData, position, cancellation);
          }
        } catch (error) {
          onUnexpectedError(error);
          webviewInput.webview.setHtml(this.mainThreadWebview.getWebviewResolvedFailedContent(viewType));
          additionalModelRefs.dispose();
          resolvedModelRef.dispose();
          return;
        }
      }
    }));
    this._editorProviders.set(viewType, disposables);
  }
  resolveCustomEditorSideBySideDiff(modelType, webviewInput, handle, viewType, initData, position, cancellation) {
    let pending = this._pendingSideBySideDiffResolutions.get(webviewInput.diffId);
    if (!pending) {
      pending = {
        promise: new DeferredPromise(),
        cancellation: new CancellationTokenSource(),
        disposables: new DisposableStore()
      };
      this._pendingSideBySideDiffResolutions.set(webviewInput.diffId, pending);
    }
    const cleanup = () => {
      this._pendingSideBySideDiffResolutions.delete(webviewInput.diffId);
      pending.disposables.dispose();
      pending.cancellation.dispose();
    };
    pending.disposables.add(cancellation.onCancellationRequested(() => {
      pending.cancellation.cancel();
      if (!pending.started) {
        pending.promise.cancel();
        cleanup();
      }
    }));
    pending[webviewInput.side] = { handle, initData };
    if (pending.original && pending.modified && !pending.started) {
      pending.started = true;
      pending.promise.settleWith((async () => {
        try {
          const originalResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(webviewInput.originalResource) : webviewInput.originalResource;
          const modifiedResource = modelType === 1 /* Text */ ? this._uriIdentityService.asCanonicalUri(webviewInput.modifiedResource) : webviewInput.modifiedResource;
          await this._proxyCustomEditors.$resolveCustomEditorSideBySideDiff(
            originalResource,
            modifiedResource,
            {
              original: pending.original.handle,
              modified: pending.modified.handle
            },
            viewType,
            {
              original: pending.original.initData,
              modified: pending.modified.initData
            },
            position,
            pending.cancellation.token
          );
        } finally {
          cleanup();
        }
      })());
    }
    return pending.promise.p;
  }
  $unregisterEditorProvider(viewType) {
    if (!this._editorProviders.has(viewType)) {
      throw new Error(`No provider for ${viewType} registered`);
    }
    this._editorProviders.deleteAndDispose(viewType);
    this._customEditorService.models.disposeAllModelsForView(viewType);
  }
  async getOrCreateCustomEditorModel(modelType, resource, viewType, options, cancellation) {
    const existingModel = this._customEditorService.models.tryRetain(resource, viewType);
    if (existingModel) {
      return existingModel;
    }
    switch (modelType) {
      case 1 /* Text */: {
        const model = CustomTextEditorModel.create(this._instantiationService, viewType, resource);
        return this._customEditorService.models.add(resource, viewType, model);
      }
      case 0 /* Custom */: {
        const model = MainThreadCustomEditorModel.create(this._instantiationService, this._proxyCustomEditors, viewType, resource, options, this._untitledTextEditorService, () => {
          return Array.from(this.mainThreadWebviewPanels.webviewInputs).filter((editor) => editor instanceof CustomEditorInput && isEqual(editor.resource, resource) || editor instanceof CustomEditorDiffInput && (isEqual(editor.originalResource, resource) || isEqual(editor.modifiedResource, resource)) || editor instanceof CustomEditorSideBySideDiffInput && isEqual(editor.resource, resource));
        }, cancellation);
        return this._customEditorService.models.add(resource, viewType, model);
      }
    }
  }
  async $onDidEdit(resourceComponents, viewType, editId, label) {
    const model = await this.getCustomEditorModel(resourceComponents, viewType);
    model.pushEdit(editId, label);
  }
  async $onContentChange(resourceComponents, viewType) {
    const model = await this.getCustomEditorModel(resourceComponents, viewType);
    model.changeContent();
  }
  async getCustomEditorModel(resourceComponents, viewType) {
    const resource = URI.revive(resourceComponents);
    const model = await this._customEditorService.models.get(resource, viewType);
    if (!model || !(model instanceof MainThreadCustomEditorModel)) {
      throw new Error("Could not find model for webview editor");
    }
    return model;
  }
  //#region Working Copy
  async onWillRunWorkingCopyFileOperation(e) {
    if (e.operation !== FileOperation.MOVE) {
      return;
    }
    e.waitUntil((async () => {
      const models = [];
      for (const file of e.files) {
        if (file.source) {
          models.push(...await this._customEditorService.models.getAllModels(file.source));
        }
      }
      for (const model of models) {
        if (model instanceof MainThreadCustomEditorModel && model.isDirty()) {
          const workingCopy = await model.backup(CancellationToken.None);
          if (workingCopy.meta) {
            this._editorRenameBackups.set(model.editorResource.toString(), workingCopy.meta);
          }
        }
      }
    })());
  }
  //#endregion
};
MainThreadCustomEditors = __decorateClass([
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkingCopyService),
  __decorateParam(6, IWorkingCopyFileService),
  __decorateParam(7, ICustomEditorService),
  __decorateParam(8, IEditorGroupsService),
  __decorateParam(9, IEditorService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IWebviewWorkbenchService),
  __decorateParam(12, IUriIdentityService),
  __decorateParam(13, IUntitledTextEditorService)
], MainThreadCustomEditors);
var HotExitState;
((HotExitState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["Allowed"] = 0] = "Allowed";
    Type2[Type2["NotAllowed"] = 1] = "NotAllowed";
    Type2[Type2["Pending"] = 2] = "Pending";
  })(Type = HotExitState2.Type || (HotExitState2.Type = {}));
  HotExitState2.Allowed = Object.freeze({ type: 0 /* Allowed */ });
  HotExitState2.NotAllowed = Object.freeze({ type: 1 /* NotAllowed */ });
  class Pending {
    constructor(operation) {
      this.operation = operation;
      this.type = 2 /* Pending */;
    }
  }
  HotExitState2.Pending = Pending;
})(HotExitState || (HotExitState = {}));
let MainThreadCustomEditorModel = class extends ResourceWorkingCopy {
  constructor(_proxy, _viewType, _editorResource, fromBackup, _editable, startDirty, _getEditors, _fileDialogService, fileService, _labelService, _undoService, _environmentService, workingCopyService, _pathService, extensionService) {
    super(MainThreadCustomEditorModel.toWorkingCopyResource(_viewType, _editorResource), fileService);
    this._proxy = _proxy;
    this._viewType = _viewType;
    this._editorResource = _editorResource;
    this._editable = _editable;
    this._getEditors = _getEditors;
    this._fileDialogService = _fileDialogService;
    this._labelService = _labelService;
    this._undoService = _undoService;
    this._environmentService = _environmentService;
    this._pathService = _pathService;
    this._fromBackup = false;
    this._hotExitState = HotExitState.Allowed;
    this._currentEditIndex = -1;
    this._savePoint = -1;
    this._edits = [];
    // TODO@mjbvz consider to enable a `typeId` that is specific for custom
    // editors. Using a distinct `typeId` allows the working copy to have
    // any resource (including file based resources) even if other working
    // copies exist with the same resource.
    //
    // IMPORTANT: changing the `typeId` has an impact on backups for this
    // working copy. Any value that is not the empty string will be used
    // as seed to the backup. Only change the `typeId` if you have implemented
    // a fallback solution to resolve any existing backups that do not have
    // this seed.
    this.typeId = NO_TYPE_ID;
    this._onDidChangeDirty = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this.onDidChangeReadonly = Event.None;
    this._fromBackup = fromBackup;
    this._isDirtyFromContentChange = startDirty;
    if (_editable) {
      this._register(workingCopyService.registerWorkingCopy(this));
      this._register(extensionService.onWillStop((e) => {
        e.veto(true, localize("vetoExtHostRestart", "An extension provided editor for '{0}' is still open that would close otherwise.", this.name));
      }));
    }
  }
  static async create(instantiationService, proxy, viewType, resource, options, untitledTextEditorService, getEditors, cancellation) {
    const editors = getEditors();
    let untitledDocumentData;
    const primaryCustomEditorInput = editors.find((editor) => editor instanceof CustomEditorInput);
    if (primaryCustomEditorInput) {
      untitledDocumentData = primaryCustomEditorInput.untitledDocumentData;
    }
    const { editable } = await proxy.$createCustomDocument(resource, viewType, options.backupId, untitledDocumentData, cancellation);
    if (untitledDocumentData && resource.scheme === Schemas.untitled) {
      untitledTextEditorService.get(resource)?.revert();
    }
    return instantiationService.createInstance(MainThreadCustomEditorModel, proxy, viewType, resource, !!options.backupId, editable, !!untitledDocumentData, getEditors);
  }
  get editorResource() {
    return this._editorResource;
  }
  dispose() {
    if (this._editable) {
      this._undoService.removeElements(this._editorResource);
    }
    this._proxy.$disposeCustomDocument(this._editorResource, this._viewType);
    super.dispose();
  }
  //#region IWorkingCopy
  // Make sure each custom editor has a unique resource for backup and edits
  static toWorkingCopyResource(viewType, resource) {
    const authority = viewType.replace(/[^a-z0-9\-_]/gi, "-");
    const path = `/${multibyteAwareBtoa(resource.with({ query: null, fragment: null }).toString(true))}`;
    return URI.from({
      scheme: Schemas.vscodeCustomEditor,
      authority,
      path,
      query: JSON.stringify(resource.toJSON())
    });
  }
  get name() {
    return basename(this._labelService.getUriLabel(this._editorResource));
  }
  get capabilities() {
    return this.isUntitled() ? WorkingCopyCapabilities.Untitled : WorkingCopyCapabilities.None;
  }
  isDirty() {
    if (this._isDirtyFromContentChange) {
      return true;
    }
    if (this._edits.length > 0) {
      return this._savePoint !== this._currentEditIndex;
    }
    return this._fromBackup;
  }
  isUntitled() {
    return this._editorResource.scheme === Schemas.untitled;
  }
  //#endregion
  isReadonly() {
    return !this._editable;
  }
  get viewType() {
    return this._viewType;
  }
  get backupId() {
    return this._backupId;
  }
  pushEdit(editId, label) {
    if (!this._editable) {
      throw new Error("Document is not editable");
    }
    this.change(() => {
      this.spliceEdits(editId);
      this._currentEditIndex = this._edits.length - 1;
    });
    this._undoService.pushElement({
      type: UndoRedoElementType.Resource,
      resource: this._editorResource,
      label: label ?? localize("defaultEditLabel", "Edit"),
      code: "undoredo.customEditorEdit",
      undo: () => this.undo(),
      redo: () => this.redo()
    });
  }
  changeContent() {
    this.change(() => {
      this._isDirtyFromContentChange = true;
    });
  }
  async undo() {
    if (!this._editable) {
      return;
    }
    if (this._currentEditIndex < 0) {
      return;
    }
    const undoneEdit = this._edits[this._currentEditIndex];
    this.change(() => {
      --this._currentEditIndex;
    });
    await this._proxy.$undo(this._editorResource, this.viewType, undoneEdit, this.isDirty());
  }
  async redo() {
    if (!this._editable) {
      return;
    }
    if (this._currentEditIndex >= this._edits.length - 1) {
      return;
    }
    const redoneEdit = this._edits[this._currentEditIndex + 1];
    this.change(() => {
      ++this._currentEditIndex;
    });
    await this._proxy.$redo(this._editorResource, this.viewType, redoneEdit, this.isDirty());
  }
  spliceEdits(editToInsert) {
    const start = this._currentEditIndex + 1;
    const toRemove = this._edits.length - this._currentEditIndex;
    const removedEdits = typeof editToInsert === "number" ? this._edits.splice(start, toRemove, editToInsert) : this._edits.splice(start, toRemove);
    if (removedEdits.length) {
      this._proxy.$disposeEdits(this._editorResource, this._viewType, removedEdits);
    }
  }
  change(makeEdit) {
    const wasDirty = this.isDirty();
    makeEdit();
    this._onDidChangeContent.fire();
    if (this.isDirty() !== wasDirty) {
      this._onDidChangeDirty.fire();
    }
  }
  async revert(options) {
    if (!this._editable) {
      return;
    }
    if (this._currentEditIndex === this._savePoint && !this._isDirtyFromContentChange && !this._fromBackup) {
      return;
    }
    if (!options?.soft) {
      this._proxy.$revert(this._editorResource, this.viewType, CancellationToken.None);
    }
    this.change(() => {
      this._isDirtyFromContentChange = false;
      this._fromBackup = false;
      this._currentEditIndex = this._savePoint;
      this.spliceEdits();
    });
  }
  async save(options) {
    const result = !!await this.saveCustomEditor(options);
    if (result) {
      this._onDidSave.fire({ reason: options?.reason, source: options?.source });
    }
    return result;
  }
  async saveCustomEditor(options) {
    if (!this._editable) {
      return void 0;
    }
    if (this.isUntitled()) {
      const targetUri = await this.suggestUntitledSavePath(options);
      if (!targetUri) {
        return void 0;
      }
      await this.saveCustomEditorAs(this._editorResource, targetUri, options);
      return targetUri;
    }
    const savePromise = createCancelablePromise((token) => this._proxy.$onSave(this._editorResource, this.viewType, token));
    this._ongoingSave?.cancel();
    this._ongoingSave = savePromise;
    try {
      await savePromise;
      if (this._ongoingSave === savePromise) {
        this.change(() => {
          this._isDirtyFromContentChange = false;
          this._savePoint = this._currentEditIndex;
          this._fromBackup = false;
        });
      }
    } finally {
      if (this._ongoingSave === savePromise) {
        this._ongoingSave = void 0;
      }
    }
    return this._editorResource;
  }
  suggestUntitledSavePath(options) {
    if (!this.isUntitled()) {
      throw new Error("Resource is not untitled");
    }
    const remoteAuthority = this._environmentService.remoteAuthority;
    const localResource = toLocalResource(this._editorResource, remoteAuthority, this._pathService.defaultUriScheme);
    return this._fileDialogService.pickFileToSave(localResource, options?.availableFileSystems);
  }
  async saveCustomEditorAs(resource, targetResource, _options) {
    if (this._editable) {
      await createCancelablePromise((token) => this._proxy.$onSaveAs(this._editorResource, this.viewType, targetResource, token));
      this.change(() => {
        this._isDirtyFromContentChange = false;
        this._savePoint = this._currentEditIndex;
        this._fromBackup = false;
      });
      return true;
    } else {
      await this.fileService.copy(
        resource,
        targetResource,
        false
        /* overwrite */
      );
      return true;
    }
  }
  get canHotExit() {
    return typeof this._backupId === "string" && this._hotExitState.type === 0 /* Allowed */;
  }
  async backup(token) {
    const editors = this._getEditors();
    if (!editors.length) {
      throw new Error("No editors found for resource, cannot back up");
    }
    const primaryEditor = editors[0];
    const backupMeta = {
      viewType: this.viewType,
      editorResource: this._editorResource,
      customTitle: primaryEditor.getWebviewTitle(),
      iconPath: primaryEditor.iconPath,
      backupId: "",
      extension: primaryEditor.extension ? {
        id: primaryEditor.extension.id.value,
        location: primaryEditor.extension.location
      } : void 0,
      webview: {
        origin: primaryEditor.webview.origin,
        options: primaryEditor.webview.options,
        state: primaryEditor.webview.state
      }
    };
    const backupData = {
      meta: backupMeta
    };
    if (!this._editable) {
      return backupData;
    }
    if (this._hotExitState.type === 2 /* Pending */) {
      this._hotExitState.operation.cancel();
    }
    const pendingState = new HotExitState.Pending(
      createCancelablePromise((token2) => this._proxy.$backup(this._editorResource.toJSON(), this.viewType, token2))
    );
    this._hotExitState = pendingState;
    token.onCancellationRequested(() => {
      pendingState.operation.cancel();
    });
    let errorMessage = "";
    try {
      const backupId = await pendingState.operation;
      if (this._hotExitState === pendingState) {
        this._hotExitState = HotExitState.Allowed;
        backupData.meta.backupId = backupId;
        this._backupId = backupId;
      }
    } catch (e) {
      if (isCancellationError(e)) {
        throw e;
      }
      if (this._hotExitState === pendingState) {
        this._hotExitState = HotExitState.NotAllowed;
      }
      if (e.message) {
        errorMessage = e.message;
      }
    }
    if (this._hotExitState === HotExitState.Allowed) {
      return backupData;
    }
    throw new Error(`Cannot backup in this state: ${errorMessage}`);
  }
};
MainThreadCustomEditorModel = __decorateClass([
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, IFileService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IUndoRedoService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, IWorkingCopyService),
  __decorateParam(13, IPathService),
  __decorateParam(14, IExtensionService)
], MainThreadCustomEditorModel);
export {
  MainThreadCustomEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZEN1c3RvbUVkaXRvcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBtdWx0aWJ5dGVBd2FyZUJ0b2EgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsLCBpc0VxdWFsT3JQYXJlbnQsIHRvTG9jYWxSZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb24sIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlLCBVbmRvUmVkb0VsZW1lbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRXZWJ2aWV3UGFuZWxzIH0gZnJvbSAnLi9tYWluVGhyZWFkV2Vidmlld1BhbmVscy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkV2Vidmlld3MsIHJldml2ZVdlYnZpZXdFeHRlbnNpb24gfSBmcm9tICcuL21haW5UaHJlYWRXZWJ2aWV3cy5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0UHJvdG9jb2wgZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSVJldmVydE9wdGlvbnMsIElTYXZlT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQ3VzdG9tRWRpdG9yRGlmZklucHV0LCBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jdXN0b21FZGl0b3IvYnJvd3Nlci9jdXN0b21FZGl0b3JEaWZmSW5wdXQuanMnO1xuaW1wb3J0IHsgQ3VzdG9tRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb250cmliL2N1c3RvbUVkaXRvci9icm93c2VyL2N1c3RvbUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEN1c3RvbURvY3VtZW50QmFja3VwRGF0YSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY3VzdG9tRWRpdG9yL2Jyb3dzZXIvY3VzdG9tRWRpdG9ySW5wdXRGYWN0b3J5LmpzJztcbmltcG9ydCB7IElDdXN0b21FZGl0b3JNb2RlbCwgSUN1c3RvbUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2N1c3RvbUVkaXRvci9jb21tb24vY3VzdG9tRWRpdG9yLmpzJztcbmltcG9ydCB7IEN1c3RvbVRleHRFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY3VzdG9tRWRpdG9yL2NvbW1vbi9jdXN0b21UZXh0RWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uS2V5ZWRXZWJ2aWV3T3JpZ2luU3RvcmUsIFdlYnZpZXdFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvd2Vidmlldy9icm93c2VyL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgV2Vidmlld0lucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi93ZWJ2aWV3UGFuZWwvYnJvd3Nlci93ZWJ2aWV3RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi93ZWJ2aWV3UGFuZWwvYnJvd3Nlci93ZWJ2aWV3V29ya2JlbmNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cENvbHVtbiwgZWRpdG9yR3JvdXBUb0NvbHVtbiB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBDb2x1bW4uanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VXb3JraW5nQ29weSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi9yZXNvdXJjZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weSwgSVdvcmtpbmdDb3B5QmFja3VwLCBJV29ya2luZ0NvcHlTYXZlRXZlbnQsIE5PX1RZUEVfSUQsIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLCBXb3JraW5nQ29weUZpbGVFdmVudCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9yU2VydmljZS5qcyc7XG5cbmNvbnN0IGVudW0gQ3VzdG9tRWRpdG9yTW9kZWxUeXBlIHtcblx0Q3VzdG9tLFxuXHRUZXh0LFxufVxuXG50eXBlIEN1c3RvbUVkaXRvcldlYnZpZXdJbnB1dCA9IEN1c3RvbUVkaXRvcklucHV0IHwgQ3VzdG9tRWRpdG9yRGlmZklucHV0IHwgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dDtcblxuaW50ZXJmYWNlIEN1c3RvbUVkaXRvckRpZmZJbml0RGF0YSB7XG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbnRlbnRPcHRpb25zOiBleHRIb3N0UHJvdG9jb2wuSVdlYnZpZXdDb250ZW50T3B0aW9ucztcblx0cmVhZG9ubHkgb3B0aW9uczogZXh0SG9zdFByb3RvY29sLklXZWJ2aWV3UGFuZWxPcHRpb25zO1xuXHRyZWFkb25seSBhY3RpdmU6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZkRhdGEge1xuXHRyZWFkb25seSBoYW5kbGU6IGV4dEhvc3RQcm90b2NvbC5XZWJ2aWV3SGFuZGxlO1xuXHRyZWFkb25seSBpbml0RGF0YTogQ3VzdG9tRWRpdG9yRGlmZkluaXREYXRhO1xufVxuXG5pbnRlcmZhY2UgUGVuZGluZ0N1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmUmVzb2x1dGlvbiB7XG5cdG9yaWdpbmFsPzogQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZEYXRhO1xuXHRtb2RpZmllZD86IEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmRGF0YTtcblx0c3RhcnRlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByb21pc2U6IERlZmVycmVkUHJvbWlzZTx2b2lkPjtcblx0cmVhZG9ubHkgY2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRDdXN0b21FZGl0b3JzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIGV4dEhvc3RQcm90b2NvbC5NYWluVGhyZWFkQ3VzdG9tRWRpdG9yc1NoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eUN1c3RvbUVkaXRvcnM6IGV4dEhvc3RQcm90b2NvbC5FeHRIb3N0Q3VzdG9tRWRpdG9yc1NoYXBlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yUmVuYW1lQmFja3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBDdXN0b21Eb2N1bWVudEJhY2t1cERhdGE+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdTaWRlQnlTaWRlRGlmZlJlc29sdXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZlJlc29sdXRpb24+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2Vidmlld09yaWdpblN0b3JlOiBFeHRlbnNpb25LZXllZFdlYnZpZXdPcmlnaW5TdG9yZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYWluVGhyZWFkV2VidmlldzogTWFpblRocmVhZFdlYnZpZXdzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFpblRocmVhZFdlYnZpZXdQYW5lbHM6IE1haW5UaHJlYWRXZWJ2aWV3UGFuZWxzLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2Ugd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSB3b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSxcblx0XHRASUN1c3RvbUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3VzdG9tRWRpdG9yU2VydmljZTogSUN1c3RvbUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlOiBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlOiBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3dlYnZpZXdPcmlnaW5TdG9yZSA9IG5ldyBFeHRlbnNpb25LZXllZFdlYnZpZXdPcmlnaW5TdG9yZSgnbWFpblRocmVhZEN1c3RvbUVkaXRvcnMub3JpZ2lucycsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3Byb3h5Q3VzdG9tRWRpdG9ycyA9IGNvbnRleHQuZ2V0UHJveHkoZXh0SG9zdFByb3RvY29sLkV4dEhvc3RDb250ZXh0LkV4dEhvc3RDdXN0b21FZGl0b3JzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdvcmtpbmdDb3B5RmlsZVNlcnZpY2UucmVnaXN0ZXJXb3JraW5nQ29weVByb3ZpZGVyKChlZGl0b3JSZXNvdXJjZSkgPT4ge1xuXHRcdFx0Y29uc3QgbWF0Y2hlZFdvcmtpbmdDb3BpZXM6IElXb3JraW5nQ29weVtdID0gW107XG5cblx0XHRcdGZvciAoY29uc3Qgd29ya2luZ0NvcHkgb2Ygd29ya2luZ0NvcHlTZXJ2aWNlLndvcmtpbmdDb3BpZXMpIHtcblx0XHRcdFx0aWYgKHdvcmtpbmdDb3B5IGluc3RhbmNlb2YgTWFpblRocmVhZEN1c3RvbUVkaXRvck1vZGVsKSB7XG5cdFx0XHRcdFx0aWYgKGlzRXF1YWxPclBhcmVudChlZGl0b3JSZXNvdXJjZSwgd29ya2luZ0NvcHkuZWRpdG9yUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRtYXRjaGVkV29ya2luZ0NvcGllcy5wdXNoKHdvcmtpbmdDb3B5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBtYXRjaGVkV29ya2luZ0NvcGllcztcblx0XHR9KSk7XG5cblx0XHQvLyBUaGlzIHJldml2ZXIncyBvbmx5IGpvYiBpcyB0byBhY3RpdmF0ZSBjdXN0b20gZWRpdG9yIGV4dGVuc2lvbnMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3dlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLnJlZ2lzdGVyUmVzb2x2ZXIoe1xuXHRcdFx0Y2FuUmVzb2x2ZTogKHdlYnZpZXc6IFdlYnZpZXdJbnB1dCkgPT4ge1xuXHRcdFx0XHRpZiAod2VidmlldyBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0IHx8IHdlYnZpZXcgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JEaWZmSW5wdXQgfHwgd2VidmlldyBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQpIHtcblx0XHRcdFx0XHRleHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25DdXN0b21FZGl0b3I6JHt3ZWJ2aWV3LnZpZXdUeXBlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0sXG5cdFx0XHRyZXNvbHZlV2VidmlldzogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV29ya2luZyBjb3B5IG9wZXJhdGlvbnNcblx0XHR0aGlzLl9yZWdpc3Rlcih3b3JraW5nQ29weUZpbGVTZXJ2aWNlLm9uV2lsbFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihhc3luYyBlID0+IHRoaXMub25XaWxsUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGUpKSk7XG5cdH1cblxuXHRwdWJsaWMgJHJlZ2lzdGVyVGV4dEVkaXRvclByb3ZpZGVyKGV4dGVuc2lvbkRhdGE6IGV4dEhvc3RQcm90b2NvbC5XZWJ2aWV3RXh0ZW5zaW9uRGVzY3JpcHRpb24sIHZpZXdUeXBlOiBzdHJpbmcsIG9wdGlvbnM6IGV4dEhvc3RQcm90b2NvbC5JV2Vidmlld1BhbmVsT3B0aW9ucywgY2FwYWJpbGl0aWVzOiBleHRIb3N0UHJvdG9jb2wuQ3VzdG9tRWRpdG9yUHJvdmlkZXJDYXBhYmlsaXRpZXMsIHNlcmlhbGl6ZUJ1ZmZlcnNGb3JQb3N0TWVzc2FnZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JQcm92aWRlcihcblx0XHRcdEN1c3RvbUVkaXRvck1vZGVsVHlwZS5UZXh0LFxuXHRcdFx0cmV2aXZlV2Vidmlld0V4dGVuc2lvbihleHRlbnNpb25EYXRhKSxcblx0XHRcdHZpZXdUeXBlLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdGNhcGFiaWxpdGllcyxcblx0XHRcdHRydWUsXG5cdFx0XHRzZXJpYWxpemVCdWZmZXJzRm9yUG9zdE1lc3NhZ2Vcblx0XHQpO1xuXHR9XG5cblx0cHVibGljICRyZWdpc3RlckN1c3RvbUVkaXRvclByb3ZpZGVyKGV4dGVuc2lvbkRhdGE6IGV4dEhvc3RQcm90b2NvbC5XZWJ2aWV3RXh0ZW5zaW9uRGVzY3JpcHRpb24sIHZpZXdUeXBlOiBzdHJpbmcsIG9wdGlvbnM6IGV4dEhvc3RQcm90b2NvbC5JV2Vidmlld1BhbmVsT3B0aW9ucywgY2FwYWJpbGl0aWVzOiBleHRIb3N0UHJvdG9jb2wuQ3VzdG9tRWRpdG9yUHJvdmlkZXJDYXBhYmlsaXRpZXMsIHN1cHBvcnRzTXVsdGlwbGVFZGl0b3JzUGVyRG9jdW1lbnQ6IGJvb2xlYW4sIHNlcmlhbGl6ZUJ1ZmZlcnNGb3JQb3N0TWVzc2FnZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JQcm92aWRlcihcblx0XHRcdEN1c3RvbUVkaXRvck1vZGVsVHlwZS5DdXN0b20sXG5cdFx0XHRyZXZpdmVXZWJ2aWV3RXh0ZW5zaW9uKGV4dGVuc2lvbkRhdGEpLFxuXHRcdFx0dmlld1R5cGUsXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0Y2FwYWJpbGl0aWVzLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUVkaXRvcnNQZXJEb2N1bWVudCxcblx0XHRcdHNlcmlhbGl6ZUJ1ZmZlcnNGb3JQb3N0TWVzc2FnZVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRWRpdG9yUHJvdmlkZXIoXG5cdFx0bW9kZWxUeXBlOiBDdXN0b21FZGl0b3JNb2RlbFR5cGUsXG5cdFx0ZXh0ZW5zaW9uOiBXZWJ2aWV3RXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0dmlld1R5cGU6IHN0cmluZyxcblx0XHRvcHRpb25zOiBleHRIb3N0UHJvdG9jb2wuSVdlYnZpZXdQYW5lbE9wdGlvbnMsXG5cdFx0Y2FwYWJpbGl0aWVzOiBleHRIb3N0UHJvdG9jb2wuQ3VzdG9tRWRpdG9yUHJvdmlkZXJDYXBhYmlsaXRpZXMsXG5cdFx0c3VwcG9ydHNNdWx0aXBsZUVkaXRvcnNQZXJEb2N1bWVudDogYm9vbGVhbixcblx0XHRzZXJpYWxpemVCdWZmZXJzRm9yUG9zdE1lc3NhZ2U6IGJvb2xlYW4sXG5cdCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9lZGl0b3JQcm92aWRlcnMuaGFzKHZpZXdUeXBlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm92aWRlciBmb3IgJHt2aWV3VHlwZX0gYWxyZWFkeSByZWdpc3RlcmVkYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fY3VzdG9tRWRpdG9yU2VydmljZS5yZWdpc3RlckN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyh2aWV3VHlwZSwge1xuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUVkaXRvcnNQZXJEb2N1bWVudCxcblx0XHRcdGlzVGV4dEVkaXRvcjogbW9kZWxUeXBlID09PSBDdXN0b21FZGl0b3JNb2RlbFR5cGUuVGV4dCxcblx0XHRcdHN1cHBvcnRzSW5saW5lRGlmZjogY2FwYWJpbGl0aWVzLnN1cHBvcnRzSW5saW5lRGlmZixcblx0XHRcdHN1cHBvcnRzU2lkZUJ5U2lkZURpZmY6IGNhcGFiaWxpdGllcy5zdXBwb3J0c1NpZGVCeVNpZGVEaWZmLFxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl93ZWJ2aWV3V29ya2JlbmNoU2VydmljZS5yZWdpc3RlclJlc29sdmVyKHtcblx0XHRcdGNhblJlc29sdmU6ICh3ZWJ2aWV3SW5wdXQpID0+IHtcblx0XHRcdFx0cmV0dXJuICh3ZWJ2aWV3SW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JJbnB1dCB8fCB3ZWJ2aWV3SW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JEaWZmSW5wdXQgfHwgd2Vidmlld0lucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCkgJiYgd2Vidmlld0lucHV0LnZpZXdUeXBlID09PSB2aWV3VHlwZTtcblx0XHRcdH0sXG5cdFx0XHRyZXNvbHZlV2VidmlldzogYXN5bmMgKHdlYnZpZXdJbnB1dDogV2Vidmlld0lucHV0LCBjYW5jZWxsYXRpb246IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGlmICghKHdlYnZpZXdJbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0IHx8IHdlYnZpZXdJbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvckRpZmZJbnB1dCB8fCB3ZWJ2aWV3SW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0XHRcdHdlYnZpZXdJbnB1dC53ZWJ2aWV3Lm9yaWdpbiA9IHRoaXMuX3dlYnZpZXdPcmlnaW5TdG9yZS5nZXRPcmlnaW4odmlld1R5cGUsIGV4dGVuc2lvbi5pZCk7XG5cblx0XHRcdFx0dGhpcy5tYWluVGhyZWFkV2Vidmlld1BhbmVscy5hZGRXZWJ2aWV3SW5wdXQoaGFuZGxlLCB3ZWJ2aWV3SW5wdXQsIHsgc2VyaWFsaXplQnVmZmVyc0ZvclBvc3RNZXNzYWdlIH0pO1xuXHRcdFx0XHR3ZWJ2aWV3SW5wdXQud2Vidmlldy5vcHRpb25zID0gb3B0aW9ucztcblx0XHRcdFx0d2Vidmlld0lucHV0LndlYnZpZXcuZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gd2Vidmlld0lucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yRGlmZklucHV0ID8gd2Vidmlld0lucHV0Lm1vZGlmaWVkUmVzb3VyY2UgOiB3ZWJ2aWV3SW5wdXQucmVzb3VyY2U7XG5cblx0XHRcdFx0Ly8gSWYgdGhlcmUncyBhbiBvbGQgcmVzb3VyY2UgdGhpcyB3YXMgYSBtb3ZlIGFuZCB3ZSBtdXN0IHJlc29sdmUgdGhlIGJhY2t1cCBhdCB0aGUgc2FtZSB0aW1lIGFzIHRoZSB3ZWJ2aWV3XG5cdFx0XHRcdC8vIFRoaXMgaXMgYmVjYXVzZSB0aGUgYmFja3VwIG11c3QgYmUgcmVhZHkgdXBvbiBtb2RlbCBjcmVhdGlvbiwgYW5kIHRoZSBpbnB1dCByZXNvbHZlIG1ldGhvZCBjb21lcyBhZnRlclxuXHRcdFx0XHRsZXQgYmFja3VwSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHdlYnZpZXdJbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0YmFja3VwSWQgPSB3ZWJ2aWV3SW5wdXQuYmFja3VwSWQ7XG5cdFx0XHRcdFx0aWYgKHdlYnZpZXdJbnB1dC5vbGRSZXNvdXJjZSAmJiAhd2Vidmlld0lucHV0LmJhY2t1cElkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBiYWNrdXAgPSB0aGlzLl9lZGl0b3JSZW5hbWVCYWNrdXBzLmdldCh3ZWJ2aWV3SW5wdXQub2xkUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRiYWNrdXBJZCA9IGJhY2t1cD8uYmFja3VwSWQ7XG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JSZW5hbWVCYWNrdXBzLmRlbGV0ZSh3ZWJ2aWV3SW5wdXQub2xkUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IG1vZGVsUmVmOiBJUmVmZXJlbmNlPElDdXN0b21FZGl0b3JNb2RlbD4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGFkZGl0aW9uYWxNb2RlbFJlZnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0bW9kZWxSZWYgPSBhd2FpdCB0aGlzLmdldE9yQ3JlYXRlQ3VzdG9tRWRpdG9yTW9kZWwobW9kZWxUeXBlLCByZXNvdXJjZSwgdmlld1R5cGUsIHsgYmFja3VwSWQgfSwgY2FuY2VsbGF0aW9uKTtcblx0XHRcdFx0XHRpZiAod2Vidmlld0lucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yRGlmZklucHV0ICYmICFpc0VxdWFsKHdlYnZpZXdJbnB1dC5vcmlnaW5hbFJlc291cmNlLCByZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxNb2RlbFJlZnMuYWRkKGF3YWl0IHRoaXMuZ2V0T3JDcmVhdGVDdXN0b21FZGl0b3JNb2RlbChtb2RlbFR5cGUsIHdlYnZpZXdJbnB1dC5vcmlnaW5hbFJlc291cmNlLCB2aWV3VHlwZSwge30sIGNhbmNlbGxhdGlvbikpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAobW9kZWxUeXBlID09PSBDdXN0b21FZGl0b3JNb2RlbFR5cGUuVGV4dCAmJiB3ZWJ2aWV3SW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvdGhlclJlc291cmNlID0gd2Vidmlld0lucHV0LnNpZGUgPT09ICdvcmlnaW5hbCcgPyB3ZWJ2aWV3SW5wdXQubW9kaWZpZWRSZXNvdXJjZSA6IHdlYnZpZXdJbnB1dC5vcmlnaW5hbFJlc291cmNlO1xuXHRcdFx0XHRcdFx0aWYgKCFpc0VxdWFsKG90aGVyUmVzb3VyY2UsIHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsTW9kZWxSZWZzLmFkZChhd2FpdCB0aGlzLmdldE9yQ3JlYXRlQ3VzdG9tRWRpdG9yTW9kZWwobW9kZWxUeXBlLCBvdGhlclJlc291cmNlLCB2aWV3VHlwZSwge30sIGNhbmNlbGxhdGlvbikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0d2Vidmlld0lucHV0LndlYnZpZXcuc2V0SHRtbCh0aGlzLm1haW5UaHJlYWRXZWJ2aWV3LmdldFdlYnZpZXdSZXNvbHZlZEZhaWxlZENvbnRlbnQodmlld1R5cGUpKTtcblx0XHRcdFx0XHRhZGRpdGlvbmFsTW9kZWxSZWZzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRtb2RlbFJlZj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdFx0XHRhZGRpdGlvbmFsTW9kZWxSZWZzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IHJlc29sdmVkTW9kZWxSZWYgPSBtb2RlbFJlZjtcblxuXHRcdFx0XHRpZiAoY2FuY2VsbGF0aW9uLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0YWRkaXRpb25hbE1vZGVsUmVmcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZWRNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGlzcG9zZU1vZGVsUmVmcyA9ICgpID0+IHtcblx0XHRcdFx0XHRhZGRpdGlvbmFsTW9kZWxSZWZzLmRpc3Bvc2UoKTtcblxuXHRcdFx0XHRcdC8vIElmIHRoZSBtb2RlbCBpcyBzdGlsbCBkaXJ0eSwgbWFrZSBzdXJlIHdlIGhhdmUgdGltZSB0byBzYXZlIGl0XG5cdFx0XHRcdFx0aWYgKHJlc29sdmVkTW9kZWxSZWYub2JqZWN0LmlzRGlydHkoKSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3ViID0gcmVzb2x2ZWRNb2RlbFJlZi5vYmplY3Qub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICghcmVzb2x2ZWRNb2RlbFJlZi5vYmplY3QuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdFx0XHRcdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlZE1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVzb2x2ZWRNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgZGlzcG9zZVN1YiA9IHdlYnZpZXdJbnB1dC53ZWJ2aWV3Lm9uRGlkRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdFx0ZGlzcG9zZVN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0aW5wdXREaXNwb3NlU3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRkaXNwb3NlTW9kZWxSZWZzKCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIEFsc28gbGlzdGVuIGZvciB3aGVuIHRoZSBpbnB1dCBpcyBkaXNwb3NlZCAoZS5nLiwgZHVyaW5nIFNhdmVBcyB3aGVuIHRoZSB3ZWJ2aWV3IGlzIHRyYW5zZmVycmVkIHRvIGEgbmV3IGVkaXRvcikuXG5cdFx0XHRcdC8vIEluIHRoaXMgY2FzZSwgd2Vidmlldy5vbkRpZERpc3Bvc2Ugd29uJ3QgZmlyZSBiZWNhdXNlIHRoZSB3ZWJ2aWV3IGlzIHJldXNlZC5cblx0XHRcdFx0Y29uc3QgaW5wdXREaXNwb3NlU3ViID0gd2Vidmlld0lucHV0Lm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHRcdGlucHV0RGlzcG9zZVN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0ZGlzcG9zZVN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0ZGlzcG9zZU1vZGVsUmVmcygpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAod2Vidmlld0lucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXQgJiYgY2FwYWJpbGl0aWVzLnN1cHBvcnRzTW92ZSkge1xuXHRcdFx0XHRcdHdlYnZpZXdJbnB1dC5vbk1vdmUoYXN5bmMgKG5ld1Jlc291cmNlOiBVUkkpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IG9sZE1vZGVsID0gcmVzb2x2ZWRNb2RlbFJlZjtcblx0XHRcdFx0XHRcdHJlc29sdmVkTW9kZWxSZWYgPSBhd2FpdCB0aGlzLmdldE9yQ3JlYXRlQ3VzdG9tRWRpdG9yTW9kZWwobW9kZWxUeXBlLCBuZXdSZXNvdXJjZSwgdmlld1R5cGUsIHt9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5Q3VzdG9tRWRpdG9ycy4kb25Nb3ZlQ3VzdG9tRWRpdG9yKGhhbmRsZSwgbmV3UmVzb3VyY2UsIHZpZXdUeXBlKTtcblx0XHRcdFx0XHRcdG9sZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5pdERhdGEgPSB7XG5cdFx0XHRcdFx0XHR0aXRsZTogd2Vidmlld0lucHV0LmdldFRpdGxlKCksXG5cdFx0XHRcdFx0XHRjb250ZW50T3B0aW9uczogd2Vidmlld0lucHV0LndlYnZpZXcuY29udGVudE9wdGlvbnMsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB3ZWJ2aWV3SW5wdXQud2Vidmlldy5vcHRpb25zLFxuXHRcdFx0XHRcdFx0YWN0aXZlOiB3ZWJ2aWV3SW5wdXQgPT09IHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3JHcm91cFRvQ29sdW1uKHRoaXMuX2VkaXRvckdyb3VwU2VydmljZSwgd2Vidmlld0lucHV0Lmdyb3VwIHx8IDApO1xuXG5cdFx0XHRcdFx0aWYgKHdlYnZpZXdJbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvckRpZmZJbnB1dCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxSZXNvdXJjZSA9IG1vZGVsVHlwZSA9PT0gQ3VzdG9tRWRpdG9yTW9kZWxUeXBlLlRleHQgPyB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkod2Vidmlld0lucHV0Lm9yaWdpbmFsUmVzb3VyY2UpIDogd2Vidmlld0lucHV0Lm9yaWdpbmFsUmVzb3VyY2U7XG5cdFx0XHRcdFx0XHRjb25zdCBtb2RpZmllZFJlc291cmNlID0gbW9kZWxUeXBlID09PSBDdXN0b21FZGl0b3JNb2RlbFR5cGUuVGV4dCA/IHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaSh3ZWJ2aWV3SW5wdXQubW9kaWZpZWRSZXNvdXJjZSkgOiB3ZWJ2aWV3SW5wdXQubW9kaWZpZWRSZXNvdXJjZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5Q3VzdG9tRWRpdG9ycy4kcmVzb2x2ZUN1c3RvbUVkaXRvcklubGluZURpZmYoXG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdGhhbmRsZSxcblx0XHRcdFx0XHRcdFx0dmlld1R5cGUsXG5cdFx0XHRcdFx0XHRcdGluaXREYXRhLFxuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbixcblx0XHRcdFx0XHRcdFx0Y2FuY2VsbGF0aW9uXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAod2Vidmlld0lucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXNvbHZlQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmYobW9kZWxUeXBlLCB3ZWJ2aWV3SW5wdXQsIGhhbmRsZSwgdmlld1R5cGUsIGluaXREYXRhLCBwb3NpdGlvbiwgY2FuY2VsbGF0aW9uKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWN0dWFsUmVzb3VyY2UgPSBtb2RlbFR5cGUgPT09IEN1c3RvbUVkaXRvck1vZGVsVHlwZS5UZXh0ID8gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKHJlc291cmNlKSA6IHJlc291cmNlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcHJveHlDdXN0b21FZGl0b3JzLiRyZXNvbHZlQ3VzdG9tRWRpdG9yKGFjdHVhbFJlc291cmNlLCBoYW5kbGUsIHZpZXdUeXBlLCBpbml0RGF0YSwgcG9zaXRpb24sIGNhbmNlbGxhdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdFx0XHR3ZWJ2aWV3SW5wdXQud2Vidmlldy5zZXRIdG1sKHRoaXMubWFpblRocmVhZFdlYnZpZXcuZ2V0V2Vidmlld1Jlc29sdmVkRmFpbGVkQ29udGVudCh2aWV3VHlwZSkpO1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxNb2RlbFJlZnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmVkTW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2VkaXRvclByb3ZpZGVycy5zZXQodmlld1R5cGUsIGRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmKFxuXHRcdG1vZGVsVHlwZTogQ3VzdG9tRWRpdG9yTW9kZWxUeXBlLFxuXHRcdHdlYnZpZXdJbnB1dDogQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCxcblx0XHRoYW5kbGU6IGV4dEhvc3RQcm90b2NvbC5XZWJ2aWV3SGFuZGxlLFxuXHRcdHZpZXdUeXBlOiBzdHJpbmcsXG5cdFx0aW5pdERhdGE6IEN1c3RvbUVkaXRvckRpZmZJbml0RGF0YSxcblx0XHRwb3NpdGlvbjogRWRpdG9yR3JvdXBDb2x1bW4sXG5cdFx0Y2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nU2lkZUJ5U2lkZURpZmZSZXNvbHV0aW9ucy5nZXQod2Vidmlld0lucHV0LmRpZmZJZCk7XG5cdFx0aWYgKCFwZW5kaW5nKSB7XG5cdFx0XHRwZW5kaW5nID0ge1xuXHRcdFx0XHRwcm9taXNlOiBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCksXG5cdFx0XHRcdGNhbmNlbGxhdGlvbjogbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCksXG5cdFx0XHRcdGRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fcGVuZGluZ1NpZGVCeVNpZGVEaWZmUmVzb2x1dGlvbnMuc2V0KHdlYnZpZXdJbnB1dC5kaWZmSWQsIHBlbmRpbmcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2lkZUJ5U2lkZURpZmZSZXNvbHV0aW9ucy5kZWxldGUod2Vidmlld0lucHV0LmRpZmZJZCk7XG5cdFx0XHRwZW5kaW5nLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHBlbmRpbmcuY2FuY2VsbGF0aW9uLmRpc3Bvc2UoKTtcblx0XHR9O1xuXG5cdFx0cGVuZGluZy5kaXNwb3NhYmxlcy5hZGQoY2FuY2VsbGF0aW9uLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdHBlbmRpbmcuY2FuY2VsbGF0aW9uLmNhbmNlbCgpO1xuXHRcdFx0aWYgKCFwZW5kaW5nLnN0YXJ0ZWQpIHtcblx0XHRcdFx0cGVuZGluZy5wcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cGVuZGluZ1t3ZWJ2aWV3SW5wdXQuc2lkZV0gPSB7IGhhbmRsZSwgaW5pdERhdGEgfTtcblxuXHRcdGlmIChwZW5kaW5nLm9yaWdpbmFsICYmIHBlbmRpbmcubW9kaWZpZWQgJiYgIXBlbmRpbmcuc3RhcnRlZCkge1xuXHRcdFx0cGVuZGluZy5zdGFydGVkID0gdHJ1ZTtcblx0XHRcdHBlbmRpbmcucHJvbWlzZS5zZXR0bGVXaXRoKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxSZXNvdXJjZSA9IG1vZGVsVHlwZSA9PT0gQ3VzdG9tRWRpdG9yTW9kZWxUeXBlLlRleHQgPyB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkod2Vidmlld0lucHV0Lm9yaWdpbmFsUmVzb3VyY2UpIDogd2Vidmlld0lucHV0Lm9yaWdpbmFsUmVzb3VyY2U7XG5cdFx0XHRcdFx0Y29uc3QgbW9kaWZpZWRSZXNvdXJjZSA9IG1vZGVsVHlwZSA9PT0gQ3VzdG9tRWRpdG9yTW9kZWxUeXBlLlRleHQgPyB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkod2Vidmlld0lucHV0Lm1vZGlmaWVkUmVzb3VyY2UpIDogd2Vidmlld0lucHV0Lm1vZGlmaWVkUmVzb3VyY2U7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcHJveHlDdXN0b21FZGl0b3JzLiRyZXNvbHZlQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmYoXG5cdFx0XHRcdFx0XHRvcmlnaW5hbFJlc291cmNlLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRSZXNvdXJjZSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0b3JpZ2luYWw6IHBlbmRpbmcub3JpZ2luYWwhLmhhbmRsZSxcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHBlbmRpbmcubW9kaWZpZWQhLmhhbmRsZSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR2aWV3VHlwZSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0b3JpZ2luYWw6IHBlbmRpbmcub3JpZ2luYWwhLmluaXREYXRhLFxuXHRcdFx0XHRcdFx0XHRtb2RpZmllZDogcGVuZGluZy5tb2RpZmllZCEuaW5pdERhdGEsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cG9zaXRpb24sXG5cdFx0XHRcdFx0XHRwZW5kaW5nLmNhbmNlbGxhdGlvbi50b2tlblxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGVuZGluZy5wcm9taXNlLnA7XG5cdH1cblxuXHRwdWJsaWMgJHVucmVnaXN0ZXJFZGl0b3JQcm92aWRlcih2aWV3VHlwZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3JQcm92aWRlcnMuaGFzKHZpZXdUeXBlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBwcm92aWRlciBmb3IgJHt2aWV3VHlwZX0gcmVnaXN0ZXJlZGApO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VkaXRvclByb3ZpZGVycy5kZWxldGVBbmREaXNwb3NlKHZpZXdUeXBlKTtcblxuXHRcdHRoaXMuX2N1c3RvbUVkaXRvclNlcnZpY2UubW9kZWxzLmRpc3Bvc2VBbGxNb2RlbHNGb3JWaWV3KHZpZXdUeXBlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0T3JDcmVhdGVDdXN0b21FZGl0b3JNb2RlbChcblx0XHRtb2RlbFR5cGU6IEN1c3RvbUVkaXRvck1vZGVsVHlwZSxcblx0XHRyZXNvdXJjZTogVVJJLFxuXHRcdHZpZXdUeXBlOiBzdHJpbmcsXG5cdFx0b3B0aW9uczogeyBiYWNrdXBJZD86IHN0cmluZyB9LFxuXHRcdGNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8SVJlZmVyZW5jZTxJQ3VzdG9tRWRpdG9yTW9kZWw+PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdNb2RlbCA9IHRoaXMuX2N1c3RvbUVkaXRvclNlcnZpY2UubW9kZWxzLnRyeVJldGFpbihyZXNvdXJjZSwgdmlld1R5cGUpO1xuXHRcdGlmIChleGlzdGluZ01vZGVsKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmdNb2RlbDtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKG1vZGVsVHlwZSkge1xuXHRcdFx0Y2FzZSBDdXN0b21FZGl0b3JNb2RlbFR5cGUuVGV4dDpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gQ3VzdG9tVGV4dEVkaXRvck1vZGVsLmNyZWF0ZSh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgdmlld1R5cGUsIHJlc291cmNlKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY3VzdG9tRWRpdG9yU2VydmljZS5tb2RlbHMuYWRkKHJlc291cmNlLCB2aWV3VHlwZSwgbW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlIEN1c3RvbUVkaXRvck1vZGVsVHlwZS5DdXN0b206XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IE1haW5UaHJlYWRDdXN0b21FZGl0b3JNb2RlbC5jcmVhdGUodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuX3Byb3h5Q3VzdG9tRWRpdG9ycywgdmlld1R5cGUsIHJlc291cmNlLCBvcHRpb25zLCB0aGlzLl91bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLm1haW5UaHJlYWRXZWJ2aWV3UGFuZWxzLndlYnZpZXdJbnB1dHMpXG5cdFx0XHRcdFx0XHRcdC5maWx0ZXIoZWRpdG9yID0+XG5cdFx0XHRcdFx0XHRcdFx0KGVkaXRvciBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0ICYmIGlzRXF1YWwoZWRpdG9yLnJlc291cmNlLCByZXNvdXJjZSkpXG5cdFx0XHRcdFx0XHRcdFx0fHwgKGVkaXRvciBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvckRpZmZJbnB1dCAmJiAoaXNFcXVhbChlZGl0b3Iub3JpZ2luYWxSZXNvdXJjZSwgcmVzb3VyY2UpIHx8IGlzRXF1YWwoZWRpdG9yLm1vZGlmaWVkUmVzb3VyY2UsIHJlc291cmNlKSkpXG5cdFx0XHRcdFx0XHRcdFx0fHwgKGVkaXRvciBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQgJiYgaXNFcXVhbChlZGl0b3IucmVzb3VyY2UsIHJlc291cmNlKSkpIGFzIEN1c3RvbUVkaXRvcldlYnZpZXdJbnB1dFtdO1xuXHRcdFx0XHRcdH0sIGNhbmNlbGxhdGlvbik7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2N1c3RvbUVkaXRvclNlcnZpY2UubW9kZWxzLmFkZChyZXNvdXJjZSwgdmlld1R5cGUsIG1vZGVsKTtcblx0XHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkb25EaWRFZGl0KHJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZywgZWRpdElkOiBudW1iZXIsIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuZ2V0Q3VzdG9tRWRpdG9yTW9kZWwocmVzb3VyY2VDb21wb25lbnRzLCB2aWV3VHlwZSk7XG5cdFx0bW9kZWwucHVzaEVkaXQoZWRpdElkLCBsYWJlbCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJG9uQ29udGVudENoYW5nZShyZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHZpZXdUeXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuZ2V0Q3VzdG9tRWRpdG9yTW9kZWwocmVzb3VyY2VDb21wb25lbnRzLCB2aWV3VHlwZSk7XG5cdFx0bW9kZWwuY2hhbmdlQ29udGVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRDdXN0b21FZGl0b3JNb2RlbChyZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHZpZXdUeXBlOiBzdHJpbmcpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5yZXZpdmUocmVzb3VyY2VDb21wb25lbnRzKTtcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuX2N1c3RvbUVkaXRvclNlcnZpY2UubW9kZWxzLmdldChyZXNvdXJjZSwgdmlld1R5cGUpO1xuXHRcdGlmICghbW9kZWwgfHwgIShtb2RlbCBpbnN0YW5jZW9mIE1haW5UaHJlYWRDdXN0b21FZGl0b3JNb2RlbCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgbW9kZWwgZm9yIHdlYnZpZXcgZWRpdG9yJyk7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdC8vI3JlZ2lvbiBXb3JraW5nIENvcHlcblx0cHJpdmF0ZSBhc3luYyBvbldpbGxSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZTogV29ya2luZ0NvcHlGaWxlRXZlbnQpIHtcblx0XHRpZiAoZS5vcGVyYXRpb24gIT09IEZpbGVPcGVyYXRpb24uTU9WRSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlLndhaXRVbnRpbCgoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZS5maWxlcykge1xuXHRcdFx0XHRpZiAoZmlsZS5zb3VyY2UpIHtcblx0XHRcdFx0XHRtb2RlbHMucHVzaCguLi4oYXdhaXQgdGhpcy5fY3VzdG9tRWRpdG9yU2VydmljZS5tb2RlbHMuZ2V0QWxsTW9kZWxzKGZpbGUuc291cmNlKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIG1vZGVscykge1xuXHRcdFx0XHRpZiAobW9kZWwgaW5zdGFuY2VvZiBNYWluVGhyZWFkQ3VzdG9tRWRpdG9yTW9kZWwgJiYgbW9kZWwuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya2luZ0NvcHkgPSBhd2FpdCBtb2RlbC5iYWNrdXAoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0aWYgKHdvcmtpbmdDb3B5Lm1ldGEpIHtcblx0XHRcdFx0XHRcdC8vIFRoaXMgY2FzdCBpcyBzYWZlIGJlY2F1c2Ugd2UgZG8gYW4gaW5zdGFuY2VvZiBjaGVjayBhYm92ZSBhbmQgYSBjdXN0b20gZG9jdW1lbnQgYmFja3VwIGRhdGEgaXMgYWx3YXlzIHJldHVybmVkXG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JSZW5hbWVCYWNrdXBzLnNldChtb2RlbC5lZGl0b3JSZXNvdXJjZS50b1N0cmluZygpLCB3b3JraW5nQ29weS5tZXRhIGFzIEN1c3RvbURvY3VtZW50QmFja3VwRGF0YSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkoKSk7XG5cdH1cblx0Ly8jZW5kcmVnaW9uXG59XG5cbm5hbWVzcGFjZSBIb3RFeGl0U3RhdGUge1xuXHRleHBvcnQgY29uc3QgZW51bSBUeXBlIHtcblx0XHRBbGxvd2VkLFxuXHRcdE5vdEFsbG93ZWQsXG5cdFx0UGVuZGluZyxcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBBbGxvd2VkID0gT2JqZWN0LmZyZWV6ZSh7IHR5cGU6IFR5cGUuQWxsb3dlZCB9IGFzIGNvbnN0KTtcblx0ZXhwb3J0IGNvbnN0IE5vdEFsbG93ZWQgPSBPYmplY3QuZnJlZXplKHsgdHlwZTogVHlwZS5Ob3RBbGxvd2VkIH0gYXMgY29uc3QpO1xuXG5cdGV4cG9ydCBjbGFzcyBQZW5kaW5nIHtcblx0XHRyZWFkb25seSB0eXBlID0gVHlwZS5QZW5kaW5nO1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRwdWJsaWMgcmVhZG9ubHkgb3BlcmF0aW9uOiBDYW5jZWxhYmxlUHJvbWlzZTxzdHJpbmc+LFxuXHRcdCkgeyB9XG5cdH1cblxuXHRleHBvcnQgdHlwZSBTdGF0ZSA9IHR5cGVvZiBBbGxvd2VkIHwgdHlwZW9mIE5vdEFsbG93ZWQgfCBQZW5kaW5nO1xufVxuXG5cbmNsYXNzIE1haW5UaHJlYWRDdXN0b21FZGl0b3JNb2RlbCBleHRlbmRzIFJlc291cmNlV29ya2luZ0NvcHkgaW1wbGVtZW50cyBJQ3VzdG9tRWRpdG9yTW9kZWwge1xuXG5cdHByaXZhdGUgX2Zyb21CYWNrdXA6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaG90RXhpdFN0YXRlOiBIb3RFeGl0U3RhdGUuU3RhdGUgPSBIb3RFeGl0U3RhdGUuQWxsb3dlZDtcblx0cHJpdmF0ZSBfYmFja3VwSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9jdXJyZW50RWRpdEluZGV4OiBudW1iZXIgPSAtMTtcblx0cHJpdmF0ZSBfc2F2ZVBvaW50OiBudW1iZXIgPSAtMTtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdHM6IEFycmF5PG51bWJlcj4gPSBbXTtcblx0cHJpdmF0ZSBfaXNEaXJ0eUZyb21Db250ZW50Q2hhbmdlOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX29uZ29pbmdTYXZlPzogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD47XG5cblx0Ly8gVE9ET0BtamJ2eiBjb25zaWRlciB0byBlbmFibGUgYSBgdHlwZUlkYCB0aGF0IGlzIHNwZWNpZmljIGZvciBjdXN0b21cblx0Ly8gZWRpdG9ycy4gVXNpbmcgYSBkaXN0aW5jdCBgdHlwZUlkYCBhbGxvd3MgdGhlIHdvcmtpbmcgY29weSB0byBoYXZlXG5cdC8vIGFueSByZXNvdXJjZSAoaW5jbHVkaW5nIGZpbGUgYmFzZWQgcmVzb3VyY2VzKSBldmVuIGlmIG90aGVyIHdvcmtpbmdcblx0Ly8gY29waWVzIGV4aXN0IHdpdGggdGhlIHNhbWUgcmVzb3VyY2UuXG5cdC8vXG5cdC8vIElNUE9SVEFOVDogY2hhbmdpbmcgdGhlIGB0eXBlSWRgIGhhcyBhbiBpbXBhY3Qgb24gYmFja3VwcyBmb3IgdGhpc1xuXHQvLyB3b3JraW5nIGNvcHkuIEFueSB2YWx1ZSB0aGF0IGlzIG5vdCB0aGUgZW1wdHkgc3RyaW5nIHdpbGwgYmUgdXNlZFxuXHQvLyBhcyBzZWVkIHRvIHRoZSBiYWNrdXAuIE9ubHkgY2hhbmdlIHRoZSBgdHlwZUlkYCBpZiB5b3UgaGF2ZSBpbXBsZW1lbnRlZFxuXHQvLyBhIGZhbGxiYWNrIHNvbHV0aW9uIHRvIHJlc29sdmUgYW55IGV4aXN0aW5nIGJhY2t1cHMgdGhhdCBkbyBub3QgaGF2ZVxuXHQvLyB0aGlzIHNlZWQuXG5cdHJlYWRvbmx5IHR5cGVJZCA9IE5PX1RZUEVfSUQ7XG5cblx0cHVibGljIHN0YXRpYyBhc3luYyBjcmVhdGUoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRwcm94eTogZXh0SG9zdFByb3RvY29sLkV4dEhvc3RDdXN0b21FZGl0b3JzU2hhcGUsXG5cdFx0dmlld1R5cGU6IHN0cmluZyxcblx0XHRyZXNvdXJjZTogVVJJLFxuXHRcdG9wdGlvbnM6IHsgYmFja3VwSWQ/OiBzdHJpbmcgfSxcblx0XHR1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlOiBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSxcblx0XHRnZXRFZGl0b3JzOiAoKSA9PiBDdXN0b21FZGl0b3JXZWJ2aWV3SW5wdXRbXSxcblx0XHRjYW5jZWxsYXRpb246IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPE1haW5UaHJlYWRDdXN0b21FZGl0b3JNb2RlbD4ge1xuXHRcdGNvbnN0IGVkaXRvcnMgPSBnZXRFZGl0b3JzKCk7XG5cdFx0bGV0IHVudGl0bGVkRG9jdW1lbnREYXRhOiBWU0J1ZmZlciB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcmltYXJ5Q3VzdG9tRWRpdG9ySW5wdXQgPSBlZGl0b3JzLmZpbmQoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0KTtcblx0XHRpZiAocHJpbWFyeUN1c3RvbUVkaXRvcklucHV0KSB7XG5cdFx0XHR1bnRpdGxlZERvY3VtZW50RGF0YSA9IHByaW1hcnlDdXN0b21FZGl0b3JJbnB1dC51bnRpdGxlZERvY3VtZW50RGF0YTtcblx0XHR9XG5cdFx0Y29uc3QgeyBlZGl0YWJsZSB9ID0gYXdhaXQgcHJveHkuJGNyZWF0ZUN1c3RvbURvY3VtZW50KHJlc291cmNlLCB2aWV3VHlwZSwgb3B0aW9ucy5iYWNrdXBJZCwgdW50aXRsZWREb2N1bWVudERhdGEsIGNhbmNlbGxhdGlvbik7XG5cblx0XHQvLyBOb3cgdGhhdCB0aGUgZXh0ZW5zaW9uIGhhcyByZWNlaXZlZCB0aGUgdW50aXRsZWREb2N1bWVudERhdGEsIHJldmVydFxuXHRcdC8vIHRoZSB1bnRpdGxlZCB0ZXh0IG1vZGVsIHNvIGl0IGlzIG5vIGxvbmdlciB0cmFja2VkIGFzIGEgc2VwYXJhdGUgZGlydHlcblx0XHQvLyB3b3JraW5nIGNvcHkgKGF2b2lkcyBkb3VibGUtZGlydHkgcHJvbXB0cywgc2VlICMxMjUyOTMpLlxuXHRcdGlmICh1bnRpdGxlZERvY3VtZW50RGF0YSAmJiByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdHVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuZ2V0KHJlc291cmNlKT8ucmV2ZXJ0KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRDdXN0b21FZGl0b3JNb2RlbCwgcHJveHksIHZpZXdUeXBlLCByZXNvdXJjZSwgISFvcHRpb25zLmJhY2t1cElkLCBlZGl0YWJsZSwgISF1bnRpdGxlZERvY3VtZW50RGF0YSwgZ2V0RWRpdG9ycyk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogZXh0SG9zdFByb3RvY29sLkV4dEhvc3RDdXN0b21FZGl0b3JzU2hhcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld1R5cGU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JSZXNvdXJjZTogVVJJLFxuXHRcdGZyb21CYWNrdXA6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdGFibGU6IGJvb2xlYW4sXG5cdFx0c3RhcnREaXJ0eTogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRFZGl0b3JzOiAoKSA9PiBDdXN0b21FZGl0b3JXZWJ2aWV3SW5wdXRbXSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVVuZG9SZWRvU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91bmRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2Ugd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKE1haW5UaHJlYWRDdXN0b21FZGl0b3JNb2RlbC50b1dvcmtpbmdDb3B5UmVzb3VyY2UoX3ZpZXdUeXBlLCBfZWRpdG9yUmVzb3VyY2UpLCBmaWxlU2VydmljZSk7XG5cblx0XHR0aGlzLl9mcm9tQmFja3VwID0gZnJvbUJhY2t1cDtcblxuXHRcdC8vIE5vcm1hbGx5IG1lYW5zIHdlJ3JlIHJlLW9wZW5pbmcgYW4gdW50aXRsZWQgZmlsZSAoc2V0IHRoaXMgYmVmb3JlIHJlZ2lzdGVyaW5nIHRoZSB3b3JraW5nIGNvcHlcblx0XHQvLyBzbyB0aGF0IGRpcnR5IHN0YXRlIGlzIGNvcnJlY3Qgd2hlbiBmaXJzdCBxdWVyaWVkKS5cblx0XHR0aGlzLl9pc0RpcnR5RnJvbUNvbnRlbnRDaGFuZ2UgPSBzdGFydERpcnR5O1xuXG5cdFx0aWYgKF9lZGl0YWJsZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIod29ya2luZ0NvcHlTZXJ2aWNlLnJlZ2lzdGVyV29ya2luZ0NvcHkodGhpcykpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25TZXJ2aWNlLm9uV2lsbFN0b3AoZSA9PiB7XG5cdFx0XHRcdGUudmV0byh0cnVlLCBsb2NhbGl6ZSgndmV0b0V4dEhvc3RSZXN0YXJ0JywgXCJBbiBleHRlbnNpb24gcHJvdmlkZWQgZWRpdG9yIGZvciAnezB9JyBpcyBzdGlsbCBvcGVuIHRoYXQgd291bGQgY2xvc2Ugb3RoZXJ3aXNlLlwiLCB0aGlzLm5hbWUpKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgZWRpdG9yUmVzb3VyY2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvclJlc291cmNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRpZiAodGhpcy5fZWRpdGFibGUpIHtcblx0XHRcdHRoaXMuX3VuZG9TZXJ2aWNlLnJlbW92ZUVsZW1lbnRzKHRoaXMuX2VkaXRvclJlc291cmNlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wcm94eS4kZGlzcG9zZUN1c3RvbURvY3VtZW50KHRoaXMuX2VkaXRvclJlc291cmNlLCB0aGlzLl92aWV3VHlwZSk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvLyNyZWdpb24gSVdvcmtpbmdDb3B5XG5cblx0Ly8gTWFrZSBzdXJlIGVhY2ggY3VzdG9tIGVkaXRvciBoYXMgYSB1bmlxdWUgcmVzb3VyY2UgZm9yIGJhY2t1cCBhbmQgZWRpdHNcblx0cHJpdmF0ZSBzdGF0aWMgdG9Xb3JraW5nQ29weVJlc291cmNlKHZpZXdUeXBlOiBzdHJpbmcsIHJlc291cmNlOiBVUkkpIHtcblx0XHRjb25zdCBhdXRob3JpdHkgPSB2aWV3VHlwZS5yZXBsYWNlKC9bXmEtejAtOVxcLV9dL2dpLCAnLScpO1xuXHRcdGNvbnN0IHBhdGggPSBgLyR7bXVsdGlieXRlQXdhcmVCdG9hKHJlc291cmNlLndpdGgoeyBxdWVyeTogbnVsbCwgZnJhZ21lbnQ6IG51bGwgfSkudG9TdHJpbmcodHJ1ZSkpfWA7XG5cdFx0cmV0dXJuIFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVDdXN0b21FZGl0b3IsXG5cdFx0XHRhdXRob3JpdHk6IGF1dGhvcml0eSxcblx0XHRcdHBhdGg6IHBhdGgsXG5cdFx0XHRxdWVyeTogSlNPTi5zdHJpbmdpZnkocmVzb3VyY2UudG9KU09OKCkpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldCBuYW1lKCkge1xuXHRcdHJldHVybiBiYXNlbmFtZSh0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodGhpcy5fZWRpdG9yUmVzb3VyY2UpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY2FwYWJpbGl0aWVzKCk6IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzIHtcblx0XHRyZXR1cm4gdGhpcy5pc1VudGl0bGVkKCkgPyBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5VbnRpdGxlZCA6IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLk5vbmU7XG5cdH1cblxuXHRwdWJsaWMgaXNEaXJ0eSgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5faXNEaXJ0eUZyb21Db250ZW50Q2hhbmdlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2VkaXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0aGlzLl9zYXZlUG9pbnQgIT09IHRoaXMuX2N1cnJlbnRFZGl0SW5kZXg7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9mcm9tQmFja3VwO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1VudGl0bGVkKCkge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JSZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURpcnR5OiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHk6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnQ6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNhdmU6IEVtaXR0ZXI8SVdvcmtpbmdDb3B5U2F2ZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXb3JraW5nQ29weVNhdmVFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZTogRXZlbnQ8SVdvcmtpbmdDb3B5U2F2ZUV2ZW50PiA9IHRoaXMuX29uRGlkU2F2ZS5ldmVudDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlYWRvbmx5ID0gRXZlbnQuTm9uZTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRwdWJsaWMgaXNSZWFkb25seSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuX2VkaXRhYmxlO1xuXHR9XG5cblx0cHVibGljIGdldCB2aWV3VHlwZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld1R5cGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGJhY2t1cElkKCkge1xuXHRcdHJldHVybiB0aGlzLl9iYWNrdXBJZDtcblx0fVxuXG5cdHB1YmxpYyBwdXNoRWRpdChlZGl0SWQ6IG51bWJlciwgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICghdGhpcy5fZWRpdGFibGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRG9jdW1lbnQgaXMgbm90IGVkaXRhYmxlJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5zcGxpY2VFZGl0cyhlZGl0SWQpO1xuXHRcdFx0dGhpcy5fY3VycmVudEVkaXRJbmRleCA9IHRoaXMuX2VkaXRzLmxlbmd0aCAtIDE7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl91bmRvU2VydmljZS5wdXNoRWxlbWVudCh7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IHRoaXMuX2VkaXRvclJlc291cmNlLFxuXHRcdFx0bGFiZWw6IGxhYmVsID8/IGxvY2FsaXplKCdkZWZhdWx0RWRpdExhYmVsJywgXCJFZGl0XCIpLFxuXHRcdFx0Y29kZTogJ3VuZG9yZWRvLmN1c3RvbUVkaXRvckVkaXQnLFxuXHRcdFx0dW5kbzogKCkgPT4gdGhpcy51bmRvKCksXG5cdFx0XHRyZWRvOiAoKSA9PiB0aGlzLnJlZG8oKSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBjaGFuZ2VDb250ZW50KCkge1xuXHRcdHRoaXMuY2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2lzRGlydHlGcm9tQ29udGVudENoYW5nZSA9IHRydWU7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVuZG8oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0YWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jdXJyZW50RWRpdEluZGV4IDwgMCkge1xuXHRcdFx0Ly8gbm90aGluZyB0byB1bmRvXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdW5kb25lRWRpdCA9IHRoaXMuX2VkaXRzW3RoaXMuX2N1cnJlbnRFZGl0SW5kZXhdO1xuXHRcdHRoaXMuY2hhbmdlKCgpID0+IHtcblx0XHRcdC0tdGhpcy5fY3VycmVudEVkaXRJbmRleDtcblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLl9wcm94eS4kdW5kbyh0aGlzLl9lZGl0b3JSZXNvdXJjZSwgdGhpcy52aWV3VHlwZSwgdW5kb25lRWRpdCwgdGhpcy5pc0RpcnR5KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWRvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fZWRpdGFibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY3VycmVudEVkaXRJbmRleCA+PSB0aGlzLl9lZGl0cy5sZW5ndGggLSAxKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIHJlZG9cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZWRvbmVFZGl0ID0gdGhpcy5fZWRpdHNbdGhpcy5fY3VycmVudEVkaXRJbmRleCArIDFdO1xuXHRcdHRoaXMuY2hhbmdlKCgpID0+IHtcblx0XHRcdCsrdGhpcy5fY3VycmVudEVkaXRJbmRleDtcblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLl9wcm94eS4kcmVkbyh0aGlzLl9lZGl0b3JSZXNvdXJjZSwgdGhpcy52aWV3VHlwZSwgcmVkb25lRWRpdCwgdGhpcy5pc0RpcnR5KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzcGxpY2VFZGl0cyhlZGl0VG9JbnNlcnQ/OiBudW1iZXIpIHtcblx0XHRjb25zdCBzdGFydCA9IHRoaXMuX2N1cnJlbnRFZGl0SW5kZXggKyAxO1xuXHRcdGNvbnN0IHRvUmVtb3ZlID0gdGhpcy5fZWRpdHMubGVuZ3RoIC0gdGhpcy5fY3VycmVudEVkaXRJbmRleDtcblxuXHRcdGNvbnN0IHJlbW92ZWRFZGl0cyA9IHR5cGVvZiBlZGl0VG9JbnNlcnQgPT09ICdudW1iZXInXG5cdFx0XHQ/IHRoaXMuX2VkaXRzLnNwbGljZShzdGFydCwgdG9SZW1vdmUsIGVkaXRUb0luc2VydClcblx0XHRcdDogdGhpcy5fZWRpdHMuc3BsaWNlKHN0YXJ0LCB0b1JlbW92ZSk7XG5cblx0XHRpZiAocmVtb3ZlZEVkaXRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fcHJveHkuJGRpc3Bvc2VFZGl0cyh0aGlzLl9lZGl0b3JSZXNvdXJjZSwgdGhpcy5fdmlld1R5cGUsIHJlbW92ZWRFZGl0cyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjaGFuZ2UobWFrZUVkaXQ6ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCB3YXNEaXJ0eSA9IHRoaXMuaXNEaXJ0eSgpO1xuXHRcdG1ha2VFZGl0KCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmZpcmUoKTtcblxuXHRcdGlmICh0aGlzLmlzRGlydHkoKSAhPT0gd2FzRGlydHkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXZlcnQob3B0aW9ucz86IElSZXZlcnRPcHRpb25zKSB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0YWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jdXJyZW50RWRpdEluZGV4ID09PSB0aGlzLl9zYXZlUG9pbnQgJiYgIXRoaXMuX2lzRGlydHlGcm9tQ29udGVudENoYW5nZSAmJiAhdGhpcy5fZnJvbUJhY2t1cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghb3B0aW9ucz8uc29mdCkge1xuXHRcdFx0dGhpcy5fcHJveHkuJHJldmVydCh0aGlzLl9lZGl0b3JSZXNvdXJjZSwgdGhpcy52aWV3VHlwZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNEaXJ0eUZyb21Db250ZW50Q2hhbmdlID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9mcm9tQmFja3VwID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9jdXJyZW50RWRpdEluZGV4ID0gdGhpcy5fc2F2ZVBvaW50O1xuXHRcdFx0dGhpcy5zcGxpY2VFZGl0cygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNhdmUob3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9ICEhYXdhaXQgdGhpcy5zYXZlQ3VzdG9tRWRpdG9yKG9wdGlvbnMpO1xuXG5cdFx0Ly8gRW1pdCBTYXZlIEV2ZW50XG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0dGhpcy5fb25EaWRTYXZlLmZpcmUoeyByZWFzb246IG9wdGlvbnM/LnJlYXNvbiwgc291cmNlOiBvcHRpb25zPy5zb3VyY2UgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzYXZlQ3VzdG9tRWRpdG9yKG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fZWRpdGFibGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNVbnRpdGxlZCgpKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRVcmkgPSBhd2FpdCB0aGlzLnN1Z2dlc3RVbnRpdGxlZFNhdmVQYXRoKG9wdGlvbnMpO1xuXHRcdFx0aWYgKCF0YXJnZXRVcmkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5zYXZlQ3VzdG9tRWRpdG9yQXModGhpcy5fZWRpdG9yUmVzb3VyY2UsIHRhcmdldFVyaSwgb3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdGFyZ2V0VXJpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNhdmVQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gdGhpcy5fcHJveHkuJG9uU2F2ZSh0aGlzLl9lZGl0b3JSZXNvdXJjZSwgdGhpcy52aWV3VHlwZSwgdG9rZW4pKTtcblx0XHR0aGlzLl9vbmdvaW5nU2F2ZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fb25nb2luZ1NhdmUgPSBzYXZlUHJvbWlzZTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzYXZlUHJvbWlzZTtcblxuXHRcdFx0aWYgKHRoaXMuX29uZ29pbmdTYXZlID09PSBzYXZlUHJvbWlzZSkgeyAvLyBNYWtlIHN1cmUgd2UgYXJlIHN0aWxsIGRvaW5nIHRoZSBzYW1lIHNhdmVcblx0XHRcdFx0dGhpcy5jaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2lzRGlydHlGcm9tQ29udGVudENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuX3NhdmVQb2ludCA9IHRoaXMuX2N1cnJlbnRFZGl0SW5kZXg7XG5cdFx0XHRcdFx0dGhpcy5fZnJvbUJhY2t1cCA9IGZhbHNlO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMuX29uZ29pbmdTYXZlID09PSBzYXZlUHJvbWlzZSkgeyAvLyBNYWtlIHN1cmUgd2UgYXJlIHN0aWxsIGRvaW5nIHRoZSBzYW1lIHNhdmVcblx0XHRcdFx0dGhpcy5fb25nb2luZ1NhdmUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvclJlc291cmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdWdnZXN0VW50aXRsZWRTYXZlUGF0aChvcHRpb25zOiBJU2F2ZU9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5pc1VudGl0bGVkKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVzb3VyY2UgaXMgbm90IHVudGl0bGVkJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRjb25zdCBsb2NhbFJlc291cmNlID0gdG9Mb2NhbFJlc291cmNlKHRoaXMuX2VkaXRvclJlc291cmNlLCByZW1vdGVBdXRob3JpdHksIHRoaXMuX3BhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2ZpbGVEaWFsb2dTZXJ2aWNlLnBpY2tGaWxlVG9TYXZlKGxvY2FsUmVzb3VyY2UsIG9wdGlvbnM/LmF2YWlsYWJsZUZpbGVTeXN0ZW1zKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzYXZlQ3VzdG9tRWRpdG9yQXMocmVzb3VyY2U6IFVSSSwgdGFyZ2V0UmVzb3VyY2U6IFVSSSwgX29wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5fZWRpdGFibGUpIHtcblx0XHRcdC8vIFRPRE86IGhhbmRsZSBjYW5jZWxsYXRpb25cblx0XHRcdGF3YWl0IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHRoaXMuX3Byb3h5LiRvblNhdmVBcyh0aGlzLl9lZGl0b3JSZXNvdXJjZSwgdGhpcy52aWV3VHlwZSwgdGFyZ2V0UmVzb3VyY2UsIHRva2VuKSk7XG5cdFx0XHR0aGlzLmNoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2lzRGlydHlGcm9tQ29udGVudENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9zYXZlUG9pbnQgPSB0aGlzLl9jdXJyZW50RWRpdEluZGV4O1xuXHRcdFx0XHR0aGlzLl9mcm9tQmFja3VwID0gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTaW5jZSB0aGUgZWRpdG9yIGlzIHJlYWRvbmx5LCBqdXN0IGNvcHkgdGhlIGZpbGUgb3ZlclxuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jb3B5KHJlc291cmNlLCB0YXJnZXRSZXNvdXJjZSwgZmFsc2UgLyogb3ZlcndyaXRlICovKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgY2FuSG90RXhpdCgpIHsgcmV0dXJuIHR5cGVvZiB0aGlzLl9iYWNrdXBJZCA9PT0gJ3N0cmluZycgJiYgdGhpcy5faG90RXhpdFN0YXRlLnR5cGUgPT09IEhvdEV4aXRTdGF0ZS5UeXBlLkFsbG93ZWQ7IH1cblxuXHRwdWJsaWMgYXN5bmMgYmFja3VwKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVdvcmtpbmdDb3B5QmFja3VwPiB7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuX2dldEVkaXRvcnMoKTtcblx0XHRpZiAoIWVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGVkaXRvcnMgZm91bmQgZm9yIHJlc291cmNlLCBjYW5ub3QgYmFjayB1cCcpO1xuXHRcdH1cblx0XHRjb25zdCBwcmltYXJ5RWRpdG9yID0gZWRpdG9yc1swXTtcblxuXHRcdGNvbnN0IGJhY2t1cE1ldGE6IEN1c3RvbURvY3VtZW50QmFja3VwRGF0YSA9IHtcblx0XHRcdHZpZXdUeXBlOiB0aGlzLnZpZXdUeXBlLFxuXHRcdFx0ZWRpdG9yUmVzb3VyY2U6IHRoaXMuX2VkaXRvclJlc291cmNlLFxuXHRcdFx0Y3VzdG9tVGl0bGU6IHByaW1hcnlFZGl0b3IuZ2V0V2Vidmlld1RpdGxlKCksXG5cdFx0XHRpY29uUGF0aDogcHJpbWFyeUVkaXRvci5pY29uUGF0aCxcblx0XHRcdGJhY2t1cElkOiAnJyxcblx0XHRcdGV4dGVuc2lvbjogcHJpbWFyeUVkaXRvci5leHRlbnNpb24gPyB7XG5cdFx0XHRcdGlkOiBwcmltYXJ5RWRpdG9yLmV4dGVuc2lvbi5pZC52YWx1ZSxcblx0XHRcdFx0bG9jYXRpb246IHByaW1hcnlFZGl0b3IuZXh0ZW5zaW9uLmxvY2F0aW9uISxcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHR3ZWJ2aWV3OiB7XG5cdFx0XHRcdG9yaWdpbjogcHJpbWFyeUVkaXRvci53ZWJ2aWV3Lm9yaWdpbixcblx0XHRcdFx0b3B0aW9uczogcHJpbWFyeUVkaXRvci53ZWJ2aWV3Lm9wdGlvbnMsXG5cdFx0XHRcdHN0YXRlOiBwcmltYXJ5RWRpdG9yLndlYnZpZXcuc3RhdGUsXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGJhY2t1cERhdGE6IElXb3JraW5nQ29weUJhY2t1cCA9IHtcblx0XHRcdG1ldGE6IGJhY2t1cE1ldGFcblx0XHR9O1xuXG5cdFx0aWYgKCF0aGlzLl9lZGl0YWJsZSkge1xuXHRcdFx0cmV0dXJuIGJhY2t1cERhdGE7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2hvdEV4aXRTdGF0ZS50eXBlID09PSBIb3RFeGl0U3RhdGUuVHlwZS5QZW5kaW5nKSB7XG5cdFx0XHR0aGlzLl9ob3RFeGl0U3RhdGUub3BlcmF0aW9uLmNhbmNlbCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdTdGF0ZSA9IG5ldyBIb3RFeGl0U3RhdGUuUGVuZGluZyhcblx0XHRcdGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRiYWNrdXAodGhpcy5fZWRpdG9yUmVzb3VyY2UudG9KU09OKCksIHRoaXMudmlld1R5cGUsIHRva2VuKSkpO1xuXHRcdHRoaXMuX2hvdEV4aXRTdGF0ZSA9IHBlbmRpbmdTdGF0ZTtcblxuXHRcdHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdHBlbmRpbmdTdGF0ZS5vcGVyYXRpb24uY2FuY2VsKCk7XG5cdFx0fSk7XG5cblx0XHRsZXQgZXJyb3JNZXNzYWdlID0gJyc7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGJhY2t1cElkID0gYXdhaXQgcGVuZGluZ1N0YXRlLm9wZXJhdGlvbjtcblx0XHRcdC8vIE1ha2Ugc3VyZSBzdGF0ZSBoYXMgbm90IGNoYW5nZWQgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRpZiAodGhpcy5faG90RXhpdFN0YXRlID09PSBwZW5kaW5nU3RhdGUpIHtcblx0XHRcdFx0dGhpcy5faG90RXhpdFN0YXRlID0gSG90RXhpdFN0YXRlLkFsbG93ZWQ7XG5cdFx0XHRcdGJhY2t1cERhdGEubWV0YSEuYmFja3VwSWQgPSBiYWNrdXBJZDtcblx0XHRcdFx0dGhpcy5fYmFja3VwSWQgPSBiYWNrdXBJZDtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHQvLyBUaGlzIGlzIGV4cGVjdGVkXG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE90aGVyd2lzZSBpdCBjb3VsZCBiZSBhIHJlYWwgZXJyb3IuIE1ha2Ugc3VyZSBzdGF0ZSBoYXMgbm90IGNoYW5nZWQgaW4gdGhlIG1lYW50aW1lLlxuXHRcdFx0aWYgKHRoaXMuX2hvdEV4aXRTdGF0ZSA9PT0gcGVuZGluZ1N0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX2hvdEV4aXRTdGF0ZSA9IEhvdEV4aXRTdGF0ZS5Ob3RBbGxvd2VkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUubWVzc2FnZSkge1xuXHRcdFx0XHRlcnJvck1lc3NhZ2UgPSBlLm1lc3NhZ2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2hvdEV4aXRTdGF0ZSA9PT0gSG90RXhpdFN0YXRlLkFsbG93ZWQpIHtcblx0XHRcdHJldHVybiBiYWNrdXBEYXRhO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGJhY2t1cCBpbiB0aGlzIHN0YXRlOiAke2Vycm9yTWVzc2FnZX1gKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDBCQUEwQjtBQUNuQyxTQUE0Qix5QkFBeUIsdUJBQXVCO0FBRTVFLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLHFCQUFxQix5QkFBeUI7QUFDdkQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLGVBQWUsdUJBQW1DO0FBQ3ZFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUMxRCxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZSxvQkFBb0I7QUFDNUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQkFBa0IsMkJBQTJC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QyxVQUFVLGNBQWM7QUFBQSxNQUN4QixVQUFVO0FBQUEsTUFDVixXQUFXLGNBQWMsWUFBWTtBQUFBLFFBQ3BDLElBQUksY0FBYyxVQUFVLEdBQUc7QUFBQSxRQUMvQixVQUFVLGNBQWMsVUFBVTtBQUFBLE1BQ25DLElBQUk7QUFBQSxNQUNKLFNBQVM7QUFBQSxRQUNSLFFBQVEsY0FBYyxRQUFRO0FBQUEsUUFDOUIsU0FBUyxjQUFjLFFBQVE7QUFBQSxRQUMvQixPQUFPLGNBQWMsUUFBUTtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBaUM7QUFBQSxNQUN0QyxNQUFNO0FBQUEsSUFDUDtBQUVBLFFBQUksQ0FBQyxLQUFLLFdBQVc7QUFDcEIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEtBQUssY0FBYyxTQUFTLGlCQUEyQjtBQUMxRCxXQUFLLGNBQWMsVUFBVSxPQUFPO0FBQUEsSUFDckM7QUFFQSxVQUFNLGVBQWUsSUFBSSxhQUFhO0FBQUEsTUFDckMsd0JBQXdCLENBQUFFLFdBQ3ZCLEtBQUssT0FBTyxRQUFRLEtBQUssZ0JBQWdCLE9BQU8sR0FBRyxLQUFLLFVBQVVBLE1BQUssQ0FBQztBQUFBLElBQUM7QUFDM0UsU0FBSyxnQkFBZ0I7QUFFckIsVUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxtQkFBYSxVQUFVLE9BQU87QUFBQSxJQUMvQixDQUFDO0FBRUQsUUFBSSxlQUFlO0FBQ25CLFFBQUk7QUFDSCxZQUFNLFdBQVcsTUFBTSxhQUFhO0FBRXBDLFVBQUksS0FBSyxrQkFBa0IsY0FBYztBQUN4QyxhQUFLLGdCQUFnQixhQUFhO0FBQ2xDLG1CQUFXLEtBQU0sV0FBVztBQUM1QixhQUFLLFlBQVk7QUFBQSxNQUNsQjtBQUFBLElBQ0QsU0FBUyxHQUFHO0FBQ1gsVUFBSSxvQkFBb0IsQ0FBQyxHQUFHO0FBRTNCLGNBQU07QUFBQSxNQUNQO0FBR0EsVUFBSSxLQUFLLGtCQUFrQixjQUFjO0FBQ3hDLGFBQUssZ0JBQWdCLGFBQWE7QUFBQSxNQUNuQztBQUNBLFVBQUksRUFBRSxTQUFTO0FBQ2QsdUJBQWUsRUFBRTtBQUFBLE1BQ2xCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxrQkFBa0IsYUFBYSxTQUFTO0FBQ2hELGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxJQUFJLE1BQU0sZ0NBQWdDLFlBQVksRUFBRTtBQUFBLEVBQy9EO0FBQ0Q7QUFwYU0sOEJBQU47QUFBQSxFQTZERztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBFRzsiLAogICJuYW1lcyI6IFsiQ3VzdG9tRWRpdG9yTW9kZWxUeXBlIiwgIkhvdEV4aXRTdGF0ZSIsICJUeXBlIiwgInRva2VuIl0KfQo=
