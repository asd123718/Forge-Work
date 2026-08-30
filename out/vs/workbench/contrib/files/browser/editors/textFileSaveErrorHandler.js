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
import { localize } from "../../../../../nls.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { Action } from "../../../../../base/common/actions.js";
import { URI } from "../../../../../base/common/uri.js";
import { FileOperationResult } from "../../../../../platform/files/common/files.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { dispose, Disposable } from "../../../../../base/common/lifecycle.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { DiffEditorInput } from "../../../../common/editor/diffEditorInput.js";
import { IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { TextFileContentProvider } from "../../common/files.js";
import { FileEditorInput } from "./fileEditorInput.js";
import { SAVE_FILE_AS_LABEL } from "../fileConstants.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { Event } from "../../../../../base/common/event.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { Schemas } from "../../../../../base/common/network.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { SaveReason, SideBySideEditor } from "../../../../common/editor.js";
import { hash } from "../../../../../base/common/hash.js";
const CONFLICT_RESOLUTION_CONTEXT = "saveConflictResolutionContext";
const CONFLICT_RESOLUTION_SCHEME = "conflictResolution";
const LEARN_MORE_DIRTY_WRITE_IGNORE_KEY = "learnMoreDirtyWriteError";
const conflictEditorHelp = localize("userGuide", "Use the actions in the editor tool bar to either undo your changes or overwrite the content of the file with your changes.");
let TextFileSaveErrorHandler = class extends Disposable {
  constructor(notificationService, textFileService, contextKeyService, editorService, textModelService, instantiationService, storageService) {
    super();
    this.notificationService = notificationService;
    this.textFileService = textFileService;
    this.editorService = editorService;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.messages = new ResourceMap();
    this.activeConflictResolutionResource = void 0;
    this.conflictResolutionContext = new RawContextKey(CONFLICT_RESOLUTION_CONTEXT, false, true).bindTo(contextKeyService);
    const provider = this._register(instantiationService.createInstance(TextFileContentProvider));
    this._register(textModelService.registerTextModelContentProvider(CONFLICT_RESOLUTION_SCHEME, provider));
    this.textFileService.files.saveErrorHandler = this;
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.textFileService.files.onDidSave((e) => this.onFileSavedOrReverted(e.model.resource)));
    this._register(this.textFileService.files.onDidRevert((model) => this.onFileSavedOrReverted(model.resource)));
    this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChanged()));
  }
  onActiveEditorChanged() {
    let isActiveEditorSaveConflictResolution = false;
    let activeConflictResolutionResource;
    const activeInput = this.editorService.activeEditor;
    if (activeInput instanceof DiffEditorInput) {
      const resource = activeInput.original.resource;
      if (resource?.scheme === CONFLICT_RESOLUTION_SCHEME) {
        isActiveEditorSaveConflictResolution = true;
        activeConflictResolutionResource = activeInput.modified.resource;
      }
    }
    this.conflictResolutionContext.set(isActiveEditorSaveConflictResolution);
    this.activeConflictResolutionResource = activeConflictResolutionResource;
  }
  onFileSavedOrReverted(resource) {
    const messageHandle = this.messages.get(resource);
    if (messageHandle) {
      messageHandle.close();
      this.messages.delete(resource);
    }
  }
  onSaveError(error, model, options) {
    const fileOperationError = error;
    const resource = model.resource;
    let message;
    const primaryActions = [];
    const secondaryActions = [];
    if (fileOperationError.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
      if (this.activeConflictResolutionResource && isEqual(this.activeConflictResolutionResource, model.resource)) {
        if (this.storageService.getBoolean(LEARN_MORE_DIRTY_WRITE_IGNORE_KEY, StorageScope.APPLICATION)) {
          return;
        }
        message = conflictEditorHelp;
        primaryActions.push(this.instantiationService.createInstance(ResolveConflictLearnMoreAction));
        secondaryActions.push(this.instantiationService.createInstance(DoNotShowResolveConflictLearnMoreAction));
      } else {
        message = localize("staleSaveError", "Failed to save '{0}': The content of the file is newer. Please compare your version with the file contents or overwrite the content of the file with your changes.", basename(resource));
        primaryActions.push(this.instantiationService.createInstance(ResolveSaveConflictAction, model));
        primaryActions.push(this.instantiationService.createInstance(SaveModelIgnoreModifiedSinceAction, model, options));
        secondaryActions.push(this.instantiationService.createInstance(ConfigureSaveConflictAction));
      }
    } else {
      const isWriteLocked = fileOperationError.fileOperationResult === FileOperationResult.FILE_WRITE_LOCKED;
      const triedToUnlock = isWriteLocked && fileOperationError.options?.unlock;
      const isPermissionDenied = fileOperationError.fileOperationResult === FileOperationResult.FILE_PERMISSION_DENIED;
      const canSaveElevated = resource.scheme === Schemas.file;
      if (canSaveElevated && (isPermissionDenied || triedToUnlock)) {
        primaryActions.push(this.instantiationService.createInstance(SaveModelElevatedAction, model, options, !!triedToUnlock));
      } else if (isWriteLocked) {
        primaryActions.push(this.instantiationService.createInstance(UnlockModelAction, model, options));
      } else {
        primaryActions.push(this.instantiationService.createInstance(RetrySaveModelAction, model, options));
      }
      primaryActions.push(this.instantiationService.createInstance(SaveModelAsAction, model));
      primaryActions.push(this.instantiationService.createInstance(RevertModelAction, model));
      if (isWriteLocked) {
        if (triedToUnlock && canSaveElevated) {
          message = isWindows ? localize("readonlySaveErrorAdmin", "Failed to save '{0}': File is read-only. Select 'Overwrite as Admin' to retry as administrator.", basename(resource)) : localize("readonlySaveErrorSudo", "Failed to save '{0}': File is read-only. Select 'Overwrite as Sudo' to retry as superuser.", basename(resource));
        } else {
          message = localize("readonlySaveError", "Failed to save '{0}': File is read-only. Select 'Overwrite' to attempt to make it writeable.", basename(resource));
        }
      } else if (canSaveElevated && isPermissionDenied) {
        message = isWindows ? localize("permissionDeniedSaveError", "Failed to save '{0}': Insufficient permissions. Select 'Retry as Admin' to retry as administrator.", basename(resource)) : localize("permissionDeniedSaveErrorSudo", "Failed to save '{0}': Insufficient permissions. Select 'Retry as Sudo' to retry as superuser.", basename(resource));
      } else {
        message = localize({ key: "genericSaveError", comment: ["{0} is the resource that failed to save and {1} the error message"] }, "Failed to save '{0}': {1}", basename(resource), toErrorMessage(error, false));
      }
    }
    const actions = { primary: primaryActions, secondary: secondaryActions };
    const handle = this.notificationService.notify({
      id: `${hash(model.resource.toString())}`,
      // unique per model (https://github.com/microsoft/vscode/issues/121539)
      severity: Severity.Error,
      message,
      actions
    });
    Event.once(handle.onDidClose)(() => {
      dispose(primaryActions);
      dispose(secondaryActions);
    });
    this.messages.set(model.resource, handle);
  }
  dispose() {
    super.dispose();
    this.messages.clear();
  }
};
TextFileSaveErrorHandler.ID = "workbench.contrib.textFileSaveErrorHandler";
TextFileSaveErrorHandler = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, ITextModelService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IStorageService)
], TextFileSaveErrorHandler);
const pendingResolveSaveConflictMessages = [];
function clearPendingResolveSaveConflictMessages() {
  while (pendingResolveSaveConflictMessages.length > 0) {
    const item = pendingResolveSaveConflictMessages.pop();
    item?.close();
  }
}
let ResolveConflictLearnMoreAction = class extends Action {
  constructor(openerService) {
    super("workbench.files.action.resolveConflictLearnMore", localize("learnMore", "Learn More"));
    this.openerService = openerService;
  }
  async run() {
    await this.openerService.open(URI.parse("https://go.microsoft.com/fwlink/?linkid=868264"));
  }
};
ResolveConflictLearnMoreAction = __decorateClass([
  __decorateParam(0, IOpenerService)
], ResolveConflictLearnMoreAction);
let DoNotShowResolveConflictLearnMoreAction = class extends Action {
  constructor(storageService) {
    super("workbench.files.action.resolveConflictLearnMoreDoNotShowAgain", localize("dontShowAgain", "Don't Show Again"));
    this.storageService = storageService;
  }
  async run(notification) {
    this.storageService.store(LEARN_MORE_DIRTY_WRITE_IGNORE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
    notification.dispose();
  }
};
DoNotShowResolveConflictLearnMoreAction = __decorateClass([
  __decorateParam(0, IStorageService)
], DoNotShowResolveConflictLearnMoreAction);
let ResolveSaveConflictAction = class extends Action {
  constructor(model, editorService, notificationService, instantiationService, productService) {
    super("workbench.files.action.resolveConflict", localize("compareChanges", "Compare"));
    this.model = model;
    this.editorService = editorService;
    this.notificationService = notificationService;
    this.instantiationService = instantiationService;
    this.productService = productService;
  }
  async run() {
    if (!this.model.isDisposed()) {
      const resource = this.model.resource;
      const name = basename(resource);
      const editorLabel = localize("saveConflictDiffLabel", "{0} (in file) \u2194 {1} (in {2}) - Resolve save conflict", name, name, this.productService.nameLong);
      await TextFileContentProvider.open(resource, CONFLICT_RESOLUTION_SCHEME, editorLabel, this.editorService, { pinned: true });
      const actions = { primary: [this.instantiationService.createInstance(ResolveConflictLearnMoreAction)] };
      const handle = this.notificationService.notify({
        id: `${hash(resource.toString())}`,
        // unique per model
        severity: Severity.Info,
        message: conflictEditorHelp,
        actions,
        neverShowAgain: { id: LEARN_MORE_DIRTY_WRITE_IGNORE_KEY, isSecondary: true }
      });
      Event.once(handle.onDidClose)(() => dispose(actions.primary));
      pendingResolveSaveConflictMessages.push(handle);
    }
  }
};
ResolveSaveConflictAction = __decorateClass([
  __decorateParam(1, IEditorService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IProductService)
], ResolveSaveConflictAction);
class SaveModelElevatedAction extends Action {
  constructor(model, options, triedToUnlock) {
    super("workbench.files.action.saveModelElevated", triedToUnlock ? isWindows ? localize("overwriteElevated", "Overwrite as Admin...") : localize("overwriteElevatedSudo", "Overwrite as Sudo...") : isWindows ? localize("saveElevated", "Retry as Admin...") : localize("saveElevatedSudo", "Retry as Sudo..."));
    this.model = model;
    this.options = options;
    this.triedToUnlock = triedToUnlock;
  }
  async run() {
    if (!this.model.isDisposed()) {
      await this.model.save({
        ...this.options,
        writeElevated: true,
        writeUnlock: this.triedToUnlock,
        reason: SaveReason.EXPLICIT
      });
    }
  }
}
class RetrySaveModelAction extends Action {
  constructor(model, options) {
    super("workbench.files.action.saveModel", localize("retry", "Retry"));
    this.model = model;
    this.options = options;
  }
  async run() {
    if (!this.model.isDisposed()) {
      await this.model.save({ ...this.options, reason: SaveReason.EXPLICIT });
    }
  }
}
class RevertModelAction extends Action {
  constructor(model) {
    super("workbench.files.action.revertModel", localize("revert", "Revert"));
    this.model = model;
  }
  async run() {
    if (!this.model.isDisposed()) {
      await this.model.revert();
    }
  }
}
let SaveModelAsAction = class extends Action {
  constructor(model, editorService) {
    super("workbench.files.action.saveModelAs", SAVE_FILE_AS_LABEL.value);
    this.model = model;
    this.editorService = editorService;
  }
  async run() {
    if (!this.model.isDisposed()) {
      const editor = this.findEditor();
      if (editor) {
        await this.editorService.save(editor, { saveAs: true, reason: SaveReason.EXPLICIT });
      }
    }
  }
  findEditor() {
    let preferredMatchingEditor;
    const editors = this.editorService.findEditors(this.model.resource, { supportSideBySide: SideBySideEditor.PRIMARY });
    for (const identifier of editors) {
      if (identifier.editor instanceof FileEditorInput) {
        preferredMatchingEditor = identifier;
        break;
      } else if (!preferredMatchingEditor) {
        preferredMatchingEditor = identifier;
      }
    }
    return preferredMatchingEditor;
  }
};
SaveModelAsAction = __decorateClass([
  __decorateParam(1, IEditorService)
], SaveModelAsAction);
class UnlockModelAction extends Action {
  constructor(model, options) {
    super("workbench.files.action.unlock", localize("overwrite", "Overwrite"));
    this.model = model;
    this.options = options;
  }
  async run() {
    if (!this.model.isDisposed()) {
      await this.model.save({ ...this.options, writeUnlock: true, reason: SaveReason.EXPLICIT });
    }
  }
}
class SaveModelIgnoreModifiedSinceAction extends Action {
  constructor(model, options) {
    super("workbench.files.action.saveIgnoreModifiedSince", localize("overwrite", "Overwrite"));
    this.model = model;
    this.options = options;
  }
  async run() {
    if (!this.model.isDisposed()) {
      await this.model.save({ ...this.options, ignoreModifiedSince: true, reason: SaveReason.EXPLICIT });
    }
  }
}
let ConfigureSaveConflictAction = class extends Action {
  constructor(preferencesService) {
    super("workbench.files.action.configureSaveConflict", localize("configure", "Configure"));
    this.preferencesService = preferencesService;
  }
  async run() {
    this.preferencesService.openSettings({ query: "files.saveConflictResolution" });
  }
};
ConfigureSaveConflictAction = __decorateClass([
  __decorateParam(0, IPreferencesService)
], ConfigureSaveConflictAction);
const acceptLocalChangesCommand = (accessor, resource) => {
  return acceptOrRevertLocalChangesCommand(accessor, resource, true);
};
const revertLocalChangesCommand = (accessor, resource) => {
  return acceptOrRevertLocalChangesCommand(accessor, resource, false);
};
async function acceptOrRevertLocalChangesCommand(accessor, resource, accept) {
  const editorService = accessor.get(IEditorService);
  if (!URI.isUri(resource)) {
    return;
  }
  const editorPane = editorService.activeEditorPane;
  if (!editorPane) {
    return;
  }
  const editor = editorPane.input;
  const group = editorPane.group;
  clearPendingResolveSaveConflictMessages();
  if (accept) {
    const options = { ignoreModifiedSince: true, reason: SaveReason.EXPLICIT };
    await editorService.save({ editor, groupId: group.id }, options);
  } else {
    await editorService.revert({ editor, groupId: group.id });
  }
  await editorService.openEditor({ resource }, group);
  return group.closeEditor(editor);
}
export {
  CONFLICT_RESOLUTION_CONTEXT,
  CONFLICT_RESOLUTION_SCHEME,
  TextFileSaveErrorHandler,
  acceptLocalChangesCommand,
  revertLocalChangesCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxlZGl0b3JzXFx0ZXh0RmlsZVNhdmVFcnJvckhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElXcml0ZUZpbGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UsIElTYXZlRXJyb3JIYW5kbGVyLCBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgSVRleHRGaWxlU2F2ZUFzT3B0aW9ucywgSVRleHRGaWxlU2F2ZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9kaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgVGV4dEZpbGVDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRvcklucHV0IH0gZnJvbSAnLi9maWxlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgU0FWRV9GSUxFX0FTX0xBQkVMIH0gZnJvbSAnLi4vZmlsZUNvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgSU5vdGlmaWNhdGlvbkhhbmRsZSwgSU5vdGlmaWNhdGlvbkFjdGlvbnMsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElFZGl0b3JJZGVudGlmaWVyLCBTYXZlUmVhc29uLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5cbmV4cG9ydCBjb25zdCBDT05GTElDVF9SRVNPTFVUSU9OX0NPTlRFWFQgPSAnc2F2ZUNvbmZsaWN0UmVzb2x1dGlvbkNvbnRleHQnO1xuZXhwb3J0IGNvbnN0IENPTkZMSUNUX1JFU09MVVRJT05fU0NIRU1FID0gJ2NvbmZsaWN0UmVzb2x1dGlvbic7XG5cbmNvbnN0IExFQVJOX01PUkVfRElSVFlfV1JJVEVfSUdOT1JFX0tFWSA9ICdsZWFybk1vcmVEaXJ0eVdyaXRlRXJyb3InO1xuXG5jb25zdCBjb25mbGljdEVkaXRvckhlbHAgPSBsb2NhbGl6ZSgndXNlckd1aWRlJywgXCJVc2UgdGhlIGFjdGlvbnMgaW4gdGhlIGVkaXRvciB0b29sIGJhciB0byBlaXRoZXIgdW5kbyB5b3VyIGNoYW5nZXMgb3Igb3ZlcndyaXRlIHRoZSBjb250ZW50IG9mIHRoZSBmaWxlIHdpdGggeW91ciBjaGFuZ2VzLlwiKTtcblxuLy8gQSBoYW5kbGVyIGZvciB0ZXh0IGZpbGUgc2F2ZSBlcnJvciBoYXBwZW5pbmcgd2l0aCBjb25mbGljdCByZXNvbHV0aW9uIGFjdGlvbnNcbmV4cG9ydCBjbGFzcyBUZXh0RmlsZVNhdmVFcnJvckhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNhdmVFcnJvckhhbmRsZXIsIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi50ZXh0RmlsZVNhdmVFcnJvckhhbmRsZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZXMgPSBuZXcgUmVzb3VyY2VNYXA8SU5vdGlmaWNhdGlvbkhhbmRsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBjb25mbGljdFJlc29sdXRpb25Db250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBhY3RpdmVDb25mbGljdFJlc29sdXRpb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY29uZmxpY3RSZXNvbHV0aW9uQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KENPTkZMSUNUX1JFU09MVVRJT05fQ09OVEVYVCwgZmFsc2UsIHRydWUpLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlQ29udGVudFByb3ZpZGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGV4dE1vZGVsU2VydmljZS5yZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcihDT05GTElDVF9SRVNPTFVUSU9OX1NDSEVNRSwgcHJvdmlkZXIpKTtcblxuXHRcdC8vIFNldCBhcyBzYXZlIGVycm9yIGhhbmRsZXIgdG8gc2VydmljZSBmb3IgdGV4dCBmaWxlc1xuXHRcdHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLnNhdmVFcnJvckhhbmRsZXIgPSB0aGlzO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRleHRGaWxlU2VydmljZS5maWxlcy5vbkRpZFNhdmUoZSA9PiB0aGlzLm9uRmlsZVNhdmVkT3JSZXZlcnRlZChlLm1vZGVsLnJlc291cmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLm9uRGlkUmV2ZXJ0KG1vZGVsID0+IHRoaXMub25GaWxlU2F2ZWRPclJldmVydGVkKG1vZGVsLnJlc291cmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLm9uQWN0aXZlRWRpdG9yQ2hhbmdlZCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQWN0aXZlRWRpdG9yQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHRsZXQgaXNBY3RpdmVFZGl0b3JTYXZlQ29uZmxpY3RSZXNvbHV0aW9uID0gZmFsc2U7XG5cdFx0bGV0IGFjdGl2ZUNvbmZsaWN0UmVzb2x1dGlvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBhY3RpdmVJbnB1dCA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKGFjdGl2ZUlucHV0IGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGFjdGl2ZUlucHV0Lm9yaWdpbmFsLnJlc291cmNlO1xuXHRcdFx0aWYgKHJlc291cmNlPy5zY2hlbWUgPT09IENPTkZMSUNUX1JFU09MVVRJT05fU0NIRU1FKSB7XG5cdFx0XHRcdGlzQWN0aXZlRWRpdG9yU2F2ZUNvbmZsaWN0UmVzb2x1dGlvbiA9IHRydWU7XG5cdFx0XHRcdGFjdGl2ZUNvbmZsaWN0UmVzb2x1dGlvblJlc291cmNlID0gYWN0aXZlSW5wdXQubW9kaWZpZWQucmVzb3VyY2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5jb25mbGljdFJlc29sdXRpb25Db250ZXh0LnNldChpc0FjdGl2ZUVkaXRvclNhdmVDb25mbGljdFJlc29sdXRpb24pO1xuXHRcdHRoaXMuYWN0aXZlQ29uZmxpY3RSZXNvbHV0aW9uUmVzb3VyY2UgPSBhY3RpdmVDb25mbGljdFJlc29sdXRpb25SZXNvdXJjZTtcblx0fVxuXG5cdHByaXZhdGUgb25GaWxlU2F2ZWRPclJldmVydGVkKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBtZXNzYWdlSGFuZGxlID0gdGhpcy5tZXNzYWdlcy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChtZXNzYWdlSGFuZGxlKSB7XG5cdFx0XHRtZXNzYWdlSGFuZGxlLmNsb3NlKCk7XG5cdFx0XHR0aGlzLm1lc3NhZ2VzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0b25TYXZlRXJyb3IoZXJyb3I6IHVua25vd24sIG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgb3B0aW9uczogSVRleHRGaWxlU2F2ZU9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCBmaWxlT3BlcmF0aW9uRXJyb3IgPSBlcnJvciBhcyBGaWxlT3BlcmF0aW9uRXJyb3I7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBtb2RlbC5yZXNvdXJjZTtcblxuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnM6IEFjdGlvbltdID0gW107XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9uczogQWN0aW9uW10gPSBbXTtcblxuXHRcdC8vIERpcnR5IHdyaXRlIHByZXZlbnRpb25cblx0XHRpZiAoZmlsZU9wZXJhdGlvbkVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSkge1xuXG5cdFx0XHQvLyBJZiB0aGUgdXNlciB0cmllZCB0byBzYXZlIGZyb20gdGhlIG9wZW5lZCBjb25mbGljdCBlZGl0b3IsIHNob3cgaXRzIG1lc3NhZ2UgYWdhaW5cblx0XHRcdGlmICh0aGlzLmFjdGl2ZUNvbmZsaWN0UmVzb2x1dGlvblJlc291cmNlICYmIGlzRXF1YWwodGhpcy5hY3RpdmVDb25mbGljdFJlc29sdXRpb25SZXNvdXJjZSwgbW9kZWwucmVzb3VyY2UpKSB7XG5cdFx0XHRcdGlmICh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oTEVBUk5fTU9SRV9ESVJUWV9XUklURV9JR05PUkVfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gaWYgdGhpcyBtZXNzYWdlIGlzIGlnbm9yZWRcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1lc3NhZ2UgPSBjb25mbGljdEVkaXRvckhlbHA7XG5cblx0XHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc29sdmVDb25mbGljdExlYXJuTW9yZUFjdGlvbikpO1xuXHRcdFx0XHRzZWNvbmRhcnlBY3Rpb25zLnB1c2godGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEb05vdFNob3dSZXNvbHZlQ29uZmxpY3RMZWFybk1vcmVBY3Rpb24pKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlIHNob3cgdGhlIG1lc3NhZ2UgdGhhdCB3aWxsIGxlYWQgdGhlIHVzZXIgaW50byB0aGUgc2F2ZSBjb25mbGljdCBlZGl0b3IuXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdzdGFsZVNhdmVFcnJvcicsIFwiRmFpbGVkIHRvIHNhdmUgJ3swfSc6IFRoZSBjb250ZW50IG9mIHRoZSBmaWxlIGlzIG5ld2VyLiBQbGVhc2UgY29tcGFyZSB5b3VyIHZlcnNpb24gd2l0aCB0aGUgZmlsZSBjb250ZW50cyBvciBvdmVyd3JpdGUgdGhlIGNvbnRlbnQgb2YgdGhlIGZpbGUgd2l0aCB5b3VyIGNoYW5nZXMuXCIsIGJhc2VuYW1lKHJlc291cmNlKSk7XG5cblx0XHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc29sdmVTYXZlQ29uZmxpY3RBY3Rpb24sIG1vZGVsKSk7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2godGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTYXZlTW9kZWxJZ25vcmVNb2RpZmllZFNpbmNlQWN0aW9uLCBtb2RlbCwgb3B0aW9ucykpO1xuXG5cdFx0XHRcdHNlY29uZGFyeUFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpZ3VyZVNhdmVDb25mbGljdEFjdGlvbikpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFueSBvdGhlciBzYXZlIGVycm9yXG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBpc1dyaXRlTG9ja2VkID0gZmlsZU9wZXJhdGlvbkVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9XUklURV9MT0NLRUQ7XG5cdFx0XHRjb25zdCB0cmllZFRvVW5sb2NrID0gaXNXcml0ZUxvY2tlZCAmJiAoZmlsZU9wZXJhdGlvbkVycm9yLm9wdGlvbnMgYXMgSVdyaXRlRmlsZU9wdGlvbnMgfCB1bmRlZmluZWQpPy51bmxvY2s7XG5cdFx0XHRjb25zdCBpc1Blcm1pc3Npb25EZW5pZWQgPSBmaWxlT3BlcmF0aW9uRXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEO1xuXHRcdFx0Y29uc3QgY2FuU2F2ZUVsZXZhdGVkID0gcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLmZpbGU7IC8vIGN1cnJlbnRseSBvbmx5IHN1cHBvcnRlZCBmb3IgbG9jYWwgc2NoZW1lcyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzQ4NjU5KVxuXG5cdFx0XHQvLyBTYXZlIEVsZXZhdGVkXG5cdFx0XHRpZiAoY2FuU2F2ZUVsZXZhdGVkICYmIChpc1Blcm1pc3Npb25EZW5pZWQgfHwgdHJpZWRUb1VubG9jaykpIHtcblx0XHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNhdmVNb2RlbEVsZXZhdGVkQWN0aW9uLCBtb2RlbCwgb3B0aW9ucywgISF0cmllZFRvVW5sb2NrKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVubG9ja1xuXHRcdFx0ZWxzZSBpZiAoaXNXcml0ZUxvY2tlZCkge1xuXHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW5sb2NrTW9kZWxBY3Rpb24sIG1vZGVsLCBvcHRpb25zKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJldHJ5XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJldHJ5U2F2ZU1vZGVsQWN0aW9uLCBtb2RlbCwgb3B0aW9ucykpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTYXZlIEFzXG5cdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2F2ZU1vZGVsQXNBY3Rpb24sIG1vZGVsKSk7XG5cblx0XHRcdC8vIFJldmVydFxuXHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJldmVydE1vZGVsQWN0aW9uLCBtb2RlbCkpO1xuXG5cdFx0XHQvLyBNZXNzYWdlXG5cdFx0XHRpZiAoaXNXcml0ZUxvY2tlZCkge1xuXHRcdFx0XHRpZiAodHJpZWRUb1VubG9jayAmJiBjYW5TYXZlRWxldmF0ZWQpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gaXNXaW5kb3dzID8gbG9jYWxpemUoJ3JlYWRvbmx5U2F2ZUVycm9yQWRtaW4nLCBcIkZhaWxlZCB0byBzYXZlICd7MH0nOiBGaWxlIGlzIHJlYWQtb25seS4gU2VsZWN0ICdPdmVyd3JpdGUgYXMgQWRtaW4nIHRvIHJldHJ5IGFzIGFkbWluaXN0cmF0b3IuXCIsIGJhc2VuYW1lKHJlc291cmNlKSkgOiBsb2NhbGl6ZSgncmVhZG9ubHlTYXZlRXJyb3JTdWRvJywgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogRmlsZSBpcyByZWFkLW9ubHkuIFNlbGVjdCAnT3ZlcndyaXRlIGFzIFN1ZG8nIHRvIHJldHJ5IGFzIHN1cGVydXNlci5cIiwgYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ3JlYWRvbmx5U2F2ZUVycm9yJywgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogRmlsZSBpcyByZWFkLW9ubHkuIFNlbGVjdCAnT3ZlcndyaXRlJyB0byBhdHRlbXB0IHRvIG1ha2UgaXQgd3JpdGVhYmxlLlwiLCBiYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGNhblNhdmVFbGV2YXRlZCAmJiBpc1Blcm1pc3Npb25EZW5pZWQpIHtcblx0XHRcdFx0bWVzc2FnZSA9IGlzV2luZG93cyA/IGxvY2FsaXplKCdwZXJtaXNzaW9uRGVuaWVkU2F2ZUVycm9yJywgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogSW5zdWZmaWNpZW50IHBlcm1pc3Npb25zLiBTZWxlY3QgJ1JldHJ5IGFzIEFkbWluJyB0byByZXRyeSBhcyBhZG1pbmlzdHJhdG9yLlwiLCBiYXNlbmFtZShyZXNvdXJjZSkpIDogbG9jYWxpemUoJ3Blcm1pc3Npb25EZW5pZWRTYXZlRXJyb3JTdWRvJywgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogSW5zdWZmaWNpZW50IHBlcm1pc3Npb25zLiBTZWxlY3QgJ1JldHJ5IGFzIFN1ZG8nIHRvIHJldHJ5IGFzIHN1cGVydXNlci5cIiwgYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSh7IGtleTogJ2dlbmVyaWNTYXZlRXJyb3InLCBjb21tZW50OiBbJ3swfSBpcyB0aGUgcmVzb3VyY2UgdGhhdCBmYWlsZWQgdG8gc2F2ZSBhbmQgezF9IHRoZSBlcnJvciBtZXNzYWdlJ10gfSwgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogezF9XCIsIGJhc2VuYW1lKHJlc291cmNlKSwgdG9FcnJvck1lc3NhZ2UoZXJyb3IsIGZhbHNlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBtZXNzYWdlIGFuZCBrZWVwIGZ1bmN0aW9uIHRvIGhpZGUgaW4gY2FzZSB0aGUgZmlsZSBnZXRzIHNhdmVkL3JldmVydGVkXG5cdFx0Y29uc3QgYWN0aW9uczogSU5vdGlmaWNhdGlvbkFjdGlvbnMgPSB7IHByaW1hcnk6IHByaW1hcnlBY3Rpb25zLCBzZWNvbmRhcnk6IHNlY29uZGFyeUFjdGlvbnMgfTtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdGlkOiBgJHtoYXNoKG1vZGVsLnJlc291cmNlLnRvU3RyaW5nKCkpfWAsIC8vIHVuaXF1ZSBwZXIgbW9kZWwgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjE1MzkpXG5cdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0YWN0aW9uc1xuXHRcdH0pO1xuXHRcdEV2ZW50Lm9uY2UoaGFuZGxlLm9uRGlkQ2xvc2UpKCgpID0+IHsgZGlzcG9zZShwcmltYXJ5QWN0aW9ucyk7IGRpc3Bvc2Uoc2Vjb25kYXJ5QWN0aW9ucyk7IH0pO1xuXHRcdHRoaXMubWVzc2FnZXMuc2V0KG1vZGVsLnJlc291cmNlLCBoYW5kbGUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLm1lc3NhZ2VzLmNsZWFyKCk7XG5cdH1cbn1cblxuY29uc3QgcGVuZGluZ1Jlc29sdmVTYXZlQ29uZmxpY3RNZXNzYWdlczogSU5vdGlmaWNhdGlvbkhhbmRsZVtdID0gW107XG5mdW5jdGlvbiBjbGVhclBlbmRpbmdSZXNvbHZlU2F2ZUNvbmZsaWN0TWVzc2FnZXMoKTogdm9pZCB7XG5cdHdoaWxlIChwZW5kaW5nUmVzb2x2ZVNhdmVDb25mbGljdE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCBpdGVtID0gcGVuZGluZ1Jlc29sdmVTYXZlQ29uZmxpY3RNZXNzYWdlcy5wb3AoKTtcblx0XHRpdGVtPy5jbG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFJlc29sdmVDb25mbGljdExlYXJuTW9yZUFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC5maWxlcy5hY3Rpb24ucmVzb2x2ZUNvbmZsaWN0TGVhcm5Nb3JlJywgbG9jYWxpemUoJ2xlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKCdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9saW5raWQ9ODY4MjY0JykpO1xuXHR9XG59XG5cbmNsYXNzIERvTm90U2hvd1Jlc29sdmVDb25mbGljdExlYXJuTW9yZUFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC5maWxlcy5hY3Rpb24ucmVzb2x2ZUNvbmZsaWN0TGVhcm5Nb3JlRG9Ob3RTaG93QWdhaW4nLCBsb2NhbGl6ZSgnZG9udFNob3dBZ2FpbicsIFwiRG9uJ3QgU2hvdyBBZ2FpblwiKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4obm90aWZpY2F0aW9uOiBJRGlzcG9zYWJsZSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gUmVtZW1iZXIgdGhpcyBhcyBhcHBsaWNhdGlvbiBzdGF0ZVxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoTEVBUk5fTU9SRV9ESVJUWV9XUklURV9JR05PUkVfS0VZLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHQvLyBIaWRlIG5vdGlmaWNhdGlvblxuXHRcdG5vdGlmaWNhdGlvbi5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgUmVzb2x2ZVNhdmVDb25mbGljdEFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBtb2RlbDogSVRleHRGaWxlRWRpdG9yTW9kZWwsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC5maWxlcy5hY3Rpb24ucmVzb2x2ZUNvbmZsaWN0JywgbG9jYWxpemUoJ2NvbXBhcmVDaGFuZ2VzJywgXCJDb21wYXJlXCIpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMubW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMubW9kZWwucmVzb3VyY2U7XG5cdFx0XHRjb25zdCBuYW1lID0gYmFzZW5hbWUocmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgZWRpdG9yTGFiZWwgPSBsb2NhbGl6ZSgnc2F2ZUNvbmZsaWN0RGlmZkxhYmVsJywgXCJ7MH0gKGluIGZpbGUpIFx1MjE5NCB7MX0gKGluIHsyfSkgLSBSZXNvbHZlIHNhdmUgY29uZmxpY3RcIiwgbmFtZSwgbmFtZSwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZyk7XG5cblx0XHRcdGF3YWl0IFRleHRGaWxlQ29udGVudFByb3ZpZGVyLm9wZW4ocmVzb3VyY2UsIENPTkZMSUNUX1JFU09MVVRJT05fU0NIRU1FLCBlZGl0b3JMYWJlbCwgdGhpcy5lZGl0b3JTZXJ2aWNlLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdFx0Ly8gU2hvdyBhZGRpdGlvbmFsIGhlbHAgaG93IHRvIHJlc29sdmUgdGhlIHNhdmUgY29uZmxpY3Rcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB7IHByaW1hcnk6IFt0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc29sdmVDb25mbGljdExlYXJuTW9yZUFjdGlvbildIH07XG5cdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0aWQ6IGAke2hhc2gocmVzb3VyY2UudG9TdHJpbmcoKSl9YCwgLy8gdW5pcXVlIHBlciBtb2RlbFxuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZTogY29uZmxpY3RFZGl0b3JIZWxwLFxuXHRcdFx0XHRhY3Rpb25zLFxuXHRcdFx0XHRuZXZlclNob3dBZ2FpbjogeyBpZDogTEVBUk5fTU9SRV9ESVJUWV9XUklURV9JR05PUkVfS0VZLCBpc1NlY29uZGFyeTogdHJ1ZSB9XG5cdFx0XHR9KTtcblx0XHRcdEV2ZW50Lm9uY2UoaGFuZGxlLm9uRGlkQ2xvc2UpKCgpID0+IGRpc3Bvc2UoYWN0aW9ucy5wcmltYXJ5KSk7XG5cdFx0XHRwZW5kaW5nUmVzb2x2ZVNhdmVDb25mbGljdE1lc3NhZ2VzLnB1c2goaGFuZGxlKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgU2F2ZU1vZGVsRWxldmF0ZWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbW9kZWw6IElUZXh0RmlsZUVkaXRvck1vZGVsLFxuXHRcdHByaXZhdGUgb3B0aW9uczogSVRleHRGaWxlU2F2ZU9wdGlvbnMsXG5cdFx0cHJpdmF0ZSB0cmllZFRvVW5sb2NrOiBib29sZWFuXG5cdCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLnNhdmVNb2RlbEVsZXZhdGVkJywgdHJpZWRUb1VubG9jayA/IGlzV2luZG93cyA/IGxvY2FsaXplKCdvdmVyd3JpdGVFbGV2YXRlZCcsIFwiT3ZlcndyaXRlIGFzIEFkbWluLi4uXCIpIDogbG9jYWxpemUoJ292ZXJ3cml0ZUVsZXZhdGVkU3VkbycsIFwiT3ZlcndyaXRlIGFzIFN1ZG8uLi5cIikgOiBpc1dpbmRvd3MgPyBsb2NhbGl6ZSgnc2F2ZUVsZXZhdGVkJywgXCJSZXRyeSBhcyBBZG1pbi4uLlwiKSA6IGxvY2FsaXplKCdzYXZlRWxldmF0ZWRTdWRvJywgXCJSZXRyeSBhcyBTdWRvLi4uXCIpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMubW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm1vZGVsLnNhdmUoe1xuXHRcdFx0XHQuLi50aGlzLm9wdGlvbnMsXG5cdFx0XHRcdHdyaXRlRWxldmF0ZWQ6IHRydWUsXG5cdFx0XHRcdHdyaXRlVW5sb2NrOiB0aGlzLnRyaWVkVG9VbmxvY2ssXG5cdFx0XHRcdHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFJldHJ5U2F2ZU1vZGVsQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCxcblx0XHRwcml2YXRlIG9wdGlvbnM6IElUZXh0RmlsZVNhdmVPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLnNhdmVNb2RlbCcsIGxvY2FsaXplKCdyZXRyeScsIFwiUmV0cnlcIikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5tb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMubW9kZWwuc2F2ZSh7IC4uLnRoaXMub3B0aW9ucywgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSZXZlcnRNb2RlbEFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBtb2RlbDogSVRleHRGaWxlRWRpdG9yTW9kZWxcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC5maWxlcy5hY3Rpb24ucmV2ZXJ0TW9kZWwnLCBsb2NhbGl6ZSgncmV2ZXJ0JywgXCJSZXZlcnRcIikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5tb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMubW9kZWwucmV2ZXJ0KCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFNhdmVNb2RlbEFzQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcignd29ya2JlbmNoLmZpbGVzLmFjdGlvbi5zYXZlTW9kZWxBcycsIFNBVkVfRklMRV9BU19MQUJFTC52YWx1ZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5maW5kRWRpdG9yKCk7XG5cdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5zYXZlKGVkaXRvciwgeyBzYXZlQXM6IHRydWUsIHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpbmRFZGl0b3IoKTogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXHRcdGxldCBwcmVmZXJyZWRNYXRjaGluZ0VkaXRvcjogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBlZGl0b3JzID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKHRoaXMubW9kZWwucmVzb3VyY2UsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgZWRpdG9ycykge1xuXHRcdFx0aWYgKGlkZW50aWZpZXIuZWRpdG9yIGluc3RhbmNlb2YgRmlsZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdC8vIFdlIHByZWZlciBhIGBGaWxlRWRpdG9ySW5wdXRgIGZvciBcIlNhdmUgQXNcIiwgYnV0IGl0IGlzIHBvc3NpYmxlXG5cdFx0XHRcdC8vIHRoYXQgYSBjdXN0b20gZWRpdG9yIGlzIGxldmVyYWdpbmcgdGhlIHRleHQgZmlsZSBtb2RlbCBhbmQgYXNcblx0XHRcdFx0Ly8gc3VjaCB3ZSBuZWVkIHRvIGZhbGxiYWNrIHRvIGFueSBvdGhlciBlZGl0b3IgaGF2aW5nIHRoZSByZXNvdXJjZVxuXHRcdFx0XHQvLyBvcGVuZWQgZm9yIHJ1bm5pbmcgdGhlIHNhdmUuXG5cdFx0XHRcdHByZWZlcnJlZE1hdGNoaW5nRWRpdG9yID0gaWRlbnRpZmllcjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGVsc2UgaWYgKCFwcmVmZXJyZWRNYXRjaGluZ0VkaXRvcikge1xuXHRcdFx0XHRwcmVmZXJyZWRNYXRjaGluZ0VkaXRvciA9IGlkZW50aWZpZXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByZWZlcnJlZE1hdGNoaW5nRWRpdG9yO1xuXHR9XG59XG5cbmNsYXNzIFVubG9ja01vZGVsQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCxcblx0XHRwcml2YXRlIG9wdGlvbnM6IElUZXh0RmlsZVNhdmVPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLnVubG9jaycsIGxvY2FsaXplKCdvdmVyd3JpdGUnLCBcIk92ZXJ3cml0ZVwiKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5tb2RlbC5zYXZlKHsgLi4udGhpcy5vcHRpb25zLCB3cml0ZVVubG9jazogdHJ1ZSwgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTYXZlTW9kZWxJZ25vcmVNb2RpZmllZFNpbmNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCxcblx0XHRwcml2YXRlIG9wdGlvbnM6IElUZXh0RmlsZVNhdmVPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLnNhdmVJZ25vcmVNb2RpZmllZFNpbmNlJywgbG9jYWxpemUoJ292ZXJ3cml0ZScsIFwiT3ZlcndyaXRlXCIpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMubW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm1vZGVsLnNhdmUoeyAuLi50aGlzLm9wdGlvbnMsIGlnbm9yZU1vZGlmaWVkU2luY2U6IHRydWUsIHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQ29uZmlndXJlU2F2ZUNvbmZsaWN0QWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcignd29ya2JlbmNoLmZpbGVzLmFjdGlvbi5jb25maWd1cmVTYXZlQ29uZmxpY3QnLCBsb2NhbGl6ZSgnY29uZmlndXJlJywgXCJDb25maWd1cmVcIikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7IHF1ZXJ5OiAnZmlsZXMuc2F2ZUNvbmZsaWN0UmVzb2x1dGlvbicgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGFjY2VwdExvY2FsQ2hhbmdlc0NvbW1hbmQgPSAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlOiB1bmtub3duKSA9PiB7XG5cdHJldHVybiBhY2NlcHRPclJldmVydExvY2FsQ2hhbmdlc0NvbW1hbmQoYWNjZXNzb3IsIHJlc291cmNlLCB0cnVlKTtcbn07XG5cbmV4cG9ydCBjb25zdCByZXZlcnRMb2NhbENoYW5nZXNDb21tYW5kID0gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZTogdW5rbm93bikgPT4ge1xuXHRyZXR1cm4gYWNjZXB0T3JSZXZlcnRMb2NhbENoYW5nZXNDb21tYW5kKGFjY2Vzc29yLCByZXNvdXJjZSwgZmFsc2UpO1xufTtcblxuYXN5bmMgZnVuY3Rpb24gYWNjZXB0T3JSZXZlcnRMb2NhbENoYW5nZXNDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZTogdW5rbm93biwgYWNjZXB0OiBib29sZWFuKSB7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdGlmICghVVJJLmlzVXJpKHJlc291cmNlKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdGlmICghZWRpdG9yUGFuZSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGVkaXRvciA9IGVkaXRvclBhbmUuaW5wdXQ7XG5cdGNvbnN0IGdyb3VwID0gZWRpdG9yUGFuZS5ncm91cDtcblxuXHQvLyBIaWRlIGFueSBwcmV2aW91c2x5IHNob3duIG1lc3NhZ2UgYWJvdXQgaG93IHRvIHVzZSB0aGVzZSBhY3Rpb25zXG5cdGNsZWFyUGVuZGluZ1Jlc29sdmVTYXZlQ29uZmxpY3RNZXNzYWdlcygpO1xuXG5cdC8vIEFjY2VwdCBvciByZXZlcnRcblx0aWYgKGFjY2VwdCkge1xuXHRcdGNvbnN0IG9wdGlvbnM6IElUZXh0RmlsZVNhdmVBc09wdGlvbnMgPSB7IGlnbm9yZU1vZGlmaWVkU2luY2U6IHRydWUsIHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9O1xuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uuc2F2ZSh7IGVkaXRvciwgZ3JvdXBJZDogZ3JvdXAuaWQgfSwgb3B0aW9ucyk7XG5cdH0gZWxzZSB7XG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5yZXZlcnQoeyBlZGl0b3IsIGdyb3VwSWQ6IGdyb3VwLmlkIH0pO1xuXHR9XG5cblx0Ly8gUmVvcGVuIG9yaWdpbmFsIGVkaXRvclxuXHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSB9LCBncm91cCk7XG5cblx0Ly8gQ2xlYW4gdXBcblx0cmV0dXJuIGdyb3VwLmNsb3NlRWRpdG9yKGVkaXRvcik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMs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
