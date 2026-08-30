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
import { streamToBuffer } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { assertType, hasKey } from "../../../../base/common/types.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileOperationError, FileOperationResult } from "../../../../platform/files/common/files.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { EditorModel } from "../../../common/editor/editorModel.js";
import { NotebookCellsChangeType, NotebookSetting } from "./notebookCommon.js";
import { INotebookLoggingService } from "./notebookLoggingService.js";
import { INotebookService, SimpleNotebookProviderInfo } from "./notebookService.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { StoredFileWorkingCopyState } from "../../../services/workingCopy/common/storedFileWorkingCopy.js";
import { WorkingCopyCapabilities } from "../../../services/workingCopy/common/workingCopy.js";
let SimpleNotebookEditorModel = class extends EditorModel {
  constructor(resource, _hasAssociatedFilePath, viewType, _workingCopyManager, scratchpad, _filesConfigurationService) {
    super();
    this.resource = resource;
    this._hasAssociatedFilePath = _hasAssociatedFilePath;
    this.viewType = viewType;
    this._workingCopyManager = _workingCopyManager;
    this._filesConfigurationService = _filesConfigurationService;
    this._onDidChangeDirty = this._register(new Emitter());
    this._onDidSave = this._register(new Emitter());
    this._onDidChangeOrphaned = this._register(new Emitter());
    this._onDidChangeReadonly = this._register(new Emitter());
    this._onDidRevertUntitled = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this.onDidSave = this._onDidSave.event;
    this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    this.onDidRevertUntitled = this._onDidRevertUntitled.event;
    this._workingCopyListeners = this._register(new DisposableStore());
    this.scratchPad = scratchpad;
  }
  dispose() {
    this._workingCopy?.dispose();
    super.dispose();
  }
  get notebook() {
    return this._workingCopy?.model?.notebookModel;
  }
  isResolved() {
    return Boolean(this._workingCopy?.model?.notebookModel);
  }
  async canDispose() {
    if (!this._workingCopy) {
      return true;
    }
    if (SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy)) {
      return this._workingCopyManager.stored.canDispose(this._workingCopy);
    } else {
      return true;
    }
  }
  isDirty() {
    return this._workingCopy?.isDirty() ?? false;
  }
  isModified() {
    return this._workingCopy?.isModified() ?? false;
  }
  isOrphaned() {
    return SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && this._workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN);
  }
  hasAssociatedFilePath() {
    return !SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && !!this._workingCopy?.hasAssociatedFilePath;
  }
  isReadonly() {
    if (SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy)) {
      return this._workingCopy?.isReadonly();
    } else {
      return this._filesConfigurationService.isReadonly(this.resource);
    }
  }
  get hasErrorState() {
    if (this._workingCopy && hasKey(this._workingCopy, { hasState: true })) {
      return this._workingCopy.hasState(StoredFileWorkingCopyState.ERROR);
    }
    return false;
  }
  async revert(options) {
    assertType(this.isResolved());
    return this._workingCopy.revert(options);
  }
  async save(options) {
    assertType(this.isResolved());
    return this._workingCopy.save(options);
  }
  async load(options) {
    if (!this._workingCopy || !this._workingCopy.model) {
      if (this.resource.scheme === Schemas.untitled) {
        if (this._hasAssociatedFilePath) {
          this._workingCopy = await this._workingCopyManager.resolve({ associatedResource: this.resource });
        } else {
          this._workingCopy = await this._workingCopyManager.resolve({ untitledResource: this.resource, isScratchpad: this.scratchPad });
        }
        this._register(this._workingCopy.onDidRevert(() => this._onDidRevertUntitled.fire()));
      } else {
        this._workingCopy = await this._workingCopyManager.resolve(this.resource, {
          limits: options?.limits,
          reload: options?.forceReadFromFile ? { async: false, force: true } : void 0
        });
        this._workingCopyListeners.add(this._workingCopy.onDidSave((e) => this._onDidSave.fire(e)));
        this._workingCopyListeners.add(this._workingCopy.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire()));
        this._workingCopyListeners.add(this._workingCopy.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
      }
      this._workingCopyListeners.add(this._workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(), void 0));
      this._workingCopyListeners.add(this._workingCopy.onWillDispose(() => {
        this._workingCopyListeners.clear();
        this._workingCopy?.model?.dispose();
      }));
    } else {
      await this._workingCopyManager.resolve(this.resource, {
        reload: {
          async: !options?.forceReadFromFile,
          force: options?.forceReadFromFile
        },
        limits: options?.limits
      });
    }
    assertType(this.isResolved());
    return this;
  }
  async saveAs(target) {
    const newWorkingCopy = await this._workingCopyManager.saveAs(this.resource, target);
    if (!newWorkingCopy) {
      return void 0;
    }
    return { resource: newWorkingCopy.resource };
  }
  static _isStoredFileWorkingCopy(candidate) {
    const isUntitled = candidate && candidate.capabilities & WorkingCopyCapabilities.Untitled;
    return !isUntitled;
  }
};
SimpleNotebookEditorModel = __decorateClass([
  __decorateParam(5, IFilesConfigurationService)
], SimpleNotebookEditorModel);
class NotebookFileWorkingCopyModel extends Disposable {
  constructor(_notebookModel, _notebookService, _configurationService, _telemetryService, _notebookLogService) {
    super();
    this._notebookModel = _notebookModel;
    this._notebookService = _notebookService;
    this._configurationService = _configurationService;
    this._telemetryService = _telemetryService;
    this._notebookLogService = _notebookLogService;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this.configuration = void 0;
    this.onWillDispose = _notebookModel.onWillDispose.bind(_notebookModel);
    this._register(_notebookModel.onDidChangeContent((e) => {
      for (const rawEvent of e.rawEvents) {
        if (rawEvent.kind === NotebookCellsChangeType.Initialize) {
          continue;
        }
        if (rawEvent.transient) {
          continue;
        }
        this._onDidChangeContent.fire({
          isRedoing: false,
          //todo@rebornix forward this information from notebook model
          isUndoing: false,
          isInitial: false
          //_notebookModel.cells.length === 0 // todo@jrieken non transient metadata?
        });
        break;
      }
    }));
    const saveWithReducedCommunication = this._configurationService.getValue(NotebookSetting.remoteSaving);
    if (saveWithReducedCommunication || _notebookModel.uri.scheme === Schemas.vscodeRemote) {
      this.configuration = {
        // Intentionally pick a larger delay for triggering backups to allow auto-save
        // to complete first on the optimized save path
        backupDelay: 1e4
      };
    }
    if (saveWithReducedCommunication) {
      this.setSaveDelegate().catch((error) => this._notebookLogService.error("WorkingCopyModel", `Failed to set save delegate: ${error}`));
    }
  }
  async setSaveDelegate() {
    await this.getNotebookSerializer();
    this.save = async (options, token) => {
      try {
        let serializer = this._notebookService.tryGetDataProviderSync(this.notebookModel.viewType)?.serializer;
        if (!serializer) {
          this._notebookLogService.info("WorkingCopyModel", "No serializer found for notebook model, checking if provider still needs to be resolved");
          serializer = await this.getNotebookSerializer().catch((error) => {
            this._notebookLogService.error("WorkingCopyModel", `Failed to get notebook serializer: ${error}`);
            this.save = void 0;
            throw new NotebookSaveError("Failed to get notebook serializer");
          });
        }
        if (token.isCancellationRequested) {
          throw new CancellationError();
        }
        const stat = await serializer.save(this._notebookModel.uri, this._notebookModel.versionId, options, token);
        return stat;
      } catch (error) {
        if (!token.isCancellationRequested && error.name !== "Canceled") {
          const isIPynb = this._notebookModel.viewType === "jupyter-notebook" || this._notebookModel.viewType === "interactive";
          const errorMessage = getSaveErrorMessage(error);
          this._telemetryService.publicLogError2("notebook/SaveError", {
            isRemote: this._notebookModel.uri.scheme === Schemas.vscodeRemote,
            isIPyNbWorkerSerializer: isIPynb && this._configurationService.getValue("ipynb.experimental.serialization"),
            error: errorMessage
          });
        }
        throw error;
      }
    };
  }
  dispose() {
    this._notebookModel.dispose();
    super.dispose();
  }
  get notebookModel() {
    return this._notebookModel;
  }
  async snapshot(context, token) {
    return this._notebookService.createNotebookTextDocumentSnapshot(this._notebookModel.uri, context, token);
  }
  async update(stream, token) {
    const serializer = await this.getNotebookSerializer();
    const bytes = await streamToBuffer(stream);
    const data = await serializer.dataToNotebook(bytes);
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    this._notebookLogService.info("WorkingCopyModel", "Notebook content updated from file system - " + this._notebookModel.uri.toString());
    this._notebookModel.reset(data.cells, data.metadata, serializer.options);
  }
  async getNotebookSerializer() {
    const info = await this._notebookService.withNotebookDataProvider(this.notebookModel.viewType);
    if (!(info instanceof SimpleNotebookProviderInfo)) {
      const message = "CANNOT open notebook with this provider";
      throw new NotebookSaveError(message);
    }
    return info.serializer;
  }
  get versionId() {
    return this._notebookModel.alternativeVersionId;
  }
  pushStackElement() {
    this._notebookModel.pushStackElement();
  }
}
let NotebookFileWorkingCopyModelFactory = class {
  constructor(_viewType, _notebookService, _configurationService, _telemetryService, _notebookLogService) {
    this._viewType = _viewType;
    this._notebookService = _notebookService;
    this._configurationService = _configurationService;
    this._telemetryService = _telemetryService;
    this._notebookLogService = _notebookLogService;
  }
  async createModel(resource, stream, token) {
    const notebookModel = this._notebookService.getNotebookTextModel(resource) ?? await this._notebookService.createNotebookTextModel(this._viewType, resource, stream);
    return new NotebookFileWorkingCopyModel(notebookModel, this._notebookService, this._configurationService, this._telemetryService, this._notebookLogService);
  }
};
NotebookFileWorkingCopyModelFactory = __decorateClass([
  __decorateParam(1, INotebookService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, INotebookLoggingService)
], NotebookFileWorkingCopyModelFactory);
class NotebookSaveError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotebookSaveError";
  }
}
function getSaveErrorMessage(error) {
  if (error.name === "NotebookSaveError") {
    return error.message;
  } else if (error instanceof FileOperationError) {
    switch (error.fileOperationResult) {
      case FileOperationResult.FILE_IS_DIRECTORY:
        return "File is a directory";
      case FileOperationResult.FILE_NOT_FOUND:
        return "File not found";
      case FileOperationResult.FILE_NOT_MODIFIED_SINCE:
        return "File not modified since";
      case FileOperationResult.FILE_MODIFIED_SINCE:
        return "File modified since";
      case FileOperationResult.FILE_MOVE_CONFLICT:
        return "File move conflict";
      case FileOperationResult.FILE_WRITE_LOCKED:
        return "File write locked";
      case FileOperationResult.FILE_PERMISSION_DENIED:
        return "File permission denied";
      case FileOperationResult.FILE_TOO_LARGE:
        return "File too large";
      case FileOperationResult.FILE_INVALID_PATH:
        return "File invalid path";
      case FileOperationResult.FILE_NOT_DIRECTORY:
        return "File not directory";
      case FileOperationResult.FILE_OTHER_ERROR:
        return "File other error";
    }
  }
  return "Unknown error";
}
export {
  NotebookFileWorkingCopyModel,
  NotebookFileWorkingCopyModelFactory,
  SimpleNotebookEditorModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxjb21tb25cXG5vdGVib29rRWRpdG9yTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCBzdHJlYW1Ub0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlLCBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV3JpdGVGaWxlT3B0aW9ucywgSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJUmV2ZXJ0T3B0aW9ucywgSVNhdmVPcHRpb25zLCBJVW50eXBlZEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvck1vZGVsLCBJTm90ZWJvb2tMb2FkT3B0aW9ucywgSVJlc29sdmVkTm90ZWJvb2tFZGl0b3JNb2RlbCwgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUsIE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuL25vdGVib29rTG9nZ2luZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VyaWFsaXplciwgSU5vdGVib29rU2VydmljZSwgU2ltcGxlTm90ZWJvb2tQcm92aWRlckluZm8gfSBmcm9tICcuL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVdvcmtpbmdDb3B5TW9kZWxDb25maWd1cmF0aW9uLCBTbmFwc2hvdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vZmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElGaWxlV29ya2luZ0NvcHlNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL2ZpbGVXb3JraW5nQ29weU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JlZEZpbGVXb3JraW5nQ29weSwgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsLCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50LCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5LCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50LCBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi9zdG9yZWRGaWxlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5LCBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbCwgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50LCBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vdW50aXRsZWRGaWxlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuXG4vLyNyZWdpb24gLS0tIHNpbXBsZSBjb250ZW50IHByb3ZpZGVyXG5cbmV4cG9ydCBjbGFzcyBTaW1wbGVOb3RlYm9va0VkaXRvck1vZGVsIGV4dGVuZHMgRWRpdG9yTW9kZWwgaW1wbGVtZW50cyBJTm90ZWJvb2tFZGl0b3JNb2RlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEaXJ0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNhdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VPcnBoYW5lZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlYWRvbmx5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmV2ZXJ0VW50aXRsZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZURpcnR5OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZTogRXZlbnQ8SVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudD4gPSB0aGlzLl9vbkRpZFNhdmUuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3JwaGFuZWQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VPcnBoYW5lZC5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWFkb25seTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZFJldmVydFVudGl0bGVkOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkUmV2ZXJ0VW50aXRsZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfd29ya2luZ0NvcHk/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWw+IHwgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5PE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWw+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nQ29weUxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2NyYXRjaFBhZDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hhc0Fzc29jaWF0ZWRGaWxlUGF0aDogYm9vbGVhbixcblx0XHRyZWFkb25seSB2aWV3VHlwZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdDb3B5TWFuYWdlcjogSUZpbGVXb3JraW5nQ29weU1hbmFnZXI8Tm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbCwgTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbD4sXG5cdFx0c2NyYXRjaHBhZDogYm9vbGVhbixcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnNjcmF0Y2hQYWQgPSBzY3JhdGNocGFkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl93b3JraW5nQ29weT8uZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldCBub3RlYm9vaygpOiBOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdDb3B5Py5tb2RlbD8ubm90ZWJvb2tNb2RlbDtcblx0fVxuXG5cdG92ZXJyaWRlIGlzUmVzb2x2ZWQoKTogdGhpcyBpcyBJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsIHtcblx0XHRyZXR1cm4gQm9vbGVhbih0aGlzLl93b3JraW5nQ29weT8ubW9kZWw/Lm5vdGVib29rTW9kZWwpO1xuXHR9XG5cblx0YXN5bmMgY2FuRGlzcG9zZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMuX3dvcmtpbmdDb3B5KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoU2ltcGxlTm90ZWJvb2tFZGl0b3JNb2RlbC5faXNTdG9yZWRGaWxlV29ya2luZ0NvcHkodGhpcy5fd29ya2luZ0NvcHkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya2luZ0NvcHlNYW5hZ2VyLnN0b3JlZC5jYW5EaXNwb3NlKHRoaXMuX3dvcmtpbmdDb3B5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0aXNEaXJ0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd29ya2luZ0NvcHk/LmlzRGlydHkoKSA/PyBmYWxzZTtcblx0fVxuXG5cdGlzTW9kaWZpZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdDb3B5Py5pc01vZGlmaWVkKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRpc09ycGhhbmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBTaW1wbGVOb3RlYm9va0VkaXRvck1vZGVsLl9pc1N0b3JlZEZpbGVXb3JraW5nQ29weSh0aGlzLl93b3JraW5nQ29weSkgJiYgdGhpcy5fd29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuT1JQSEFOKTtcblx0fVxuXG5cdGhhc0Fzc29jaWF0ZWRGaWxlUGF0aCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIVNpbXBsZU5vdGVib29rRWRpdG9yTW9kZWwuX2lzU3RvcmVkRmlsZVdvcmtpbmdDb3B5KHRoaXMuX3dvcmtpbmdDb3B5KSAmJiAhIXRoaXMuX3dvcmtpbmdDb3B5Py5oYXNBc3NvY2lhdGVkRmlsZVBhdGg7XG5cdH1cblxuXHRpc1JlYWRvbmx5KCk6IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdGlmIChTaW1wbGVOb3RlYm9va0VkaXRvck1vZGVsLl9pc1N0b3JlZEZpbGVXb3JraW5nQ29weSh0aGlzLl93b3JraW5nQ29weSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl93b3JraW5nQ29weT8uaXNSZWFkb25seSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRoaXMucmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBoYXNFcnJvclN0YXRlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl93b3JraW5nQ29weSAmJiBoYXNLZXkodGhpcy5fd29ya2luZ0NvcHksIHsgaGFzU3RhdGU6IHRydWUgfSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl93b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5FUlJPUik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgcmV2ZXJ0KG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGFzc2VydFR5cGUodGhpcy5pc1Jlc29sdmVkKCkpO1xuXHRcdHJldHVybiB0aGlzLl93b3JraW5nQ29weSEucmV2ZXJ0KG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgc2F2ZShvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0YXNzZXJ0VHlwZSh0aGlzLmlzUmVzb2x2ZWQoKSk7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdDb3B5IS5zYXZlKG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgbG9hZChvcHRpb25zPzogSU5vdGVib29rTG9hZE9wdGlvbnMpOiBQcm9taXNlPElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWw+IHtcblx0XHRpZiAoIXRoaXMuX3dvcmtpbmdDb3B5IHx8ICF0aGlzLl93b3JraW5nQ29weS5tb2RlbCkge1xuXHRcdFx0aWYgKHRoaXMucmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9oYXNBc3NvY2lhdGVkRmlsZVBhdGgpIHtcblx0XHRcdFx0XHR0aGlzLl93b3JraW5nQ29weSA9IGF3YWl0IHRoaXMuX3dvcmtpbmdDb3B5TWFuYWdlci5yZXNvbHZlKHsgYXNzb2NpYXRlZFJlc291cmNlOiB0aGlzLnJlc291cmNlIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3dvcmtpbmdDb3B5ID0gYXdhaXQgdGhpcy5fd29ya2luZ0NvcHlNYW5hZ2VyLnJlc29sdmUoeyB1bnRpdGxlZFJlc291cmNlOiB0aGlzLnJlc291cmNlLCBpc1NjcmF0Y2hwYWQ6IHRoaXMuc2NyYXRjaFBhZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93b3JraW5nQ29weS5vbkRpZFJldmVydCgoKSA9PiB0aGlzLl9vbkRpZFJldmVydFVudGl0bGVkLmZpcmUoKSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fd29ya2luZ0NvcHkgPSBhd2FpdCB0aGlzLl93b3JraW5nQ29weU1hbmFnZXIucmVzb2x2ZSh0aGlzLnJlc291cmNlLCB7XG5cdFx0XHRcdFx0bGltaXRzOiBvcHRpb25zPy5saW1pdHMsXG5cdFx0XHRcdFx0cmVsb2FkOiBvcHRpb25zPy5mb3JjZVJlYWRGcm9tRmlsZSA/IHsgYXN5bmM6IGZhbHNlLCBmb3JjZTogdHJ1ZSB9IDogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl93b3JraW5nQ29weUxpc3RlbmVycy5hZGQodGhpcy5fd29ya2luZ0NvcHkub25EaWRTYXZlKGUgPT4gdGhpcy5fb25EaWRTYXZlLmZpcmUoZSkpKTtcblx0XHRcdFx0dGhpcy5fd29ya2luZ0NvcHlMaXN0ZW5lcnMuYWRkKHRoaXMuX3dvcmtpbmdDb3B5Lm9uRGlkQ2hhbmdlT3JwaGFuZWQoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VPcnBoYW5lZC5maXJlKCkpKTtcblx0XHRcdFx0dGhpcy5fd29ya2luZ0NvcHlMaXN0ZW5lcnMuYWRkKHRoaXMuX3dvcmtpbmdDb3B5Lm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5maXJlKCkpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3dvcmtpbmdDb3B5TGlzdGVuZXJzLmFkZCh0aGlzLl93b3JraW5nQ29weS5vbkRpZENoYW5nZURpcnR5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpLCB1bmRlZmluZWQpKTtcblxuXHRcdFx0dGhpcy5fd29ya2luZ0NvcHlMaXN0ZW5lcnMuYWRkKHRoaXMuX3dvcmtpbmdDb3B5Lm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl93b3JraW5nQ29weUxpc3RlbmVycy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl93b3JraW5nQ29weT8ubW9kZWw/LmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5fd29ya2luZ0NvcHlNYW5hZ2VyLnJlc29sdmUodGhpcy5yZXNvdXJjZSwge1xuXHRcdFx0XHRyZWxvYWQ6IHtcblx0XHRcdFx0XHRhc3luYzogIW9wdGlvbnM/LmZvcmNlUmVhZEZyb21GaWxlLFxuXHRcdFx0XHRcdGZvcmNlOiBvcHRpb25zPy5mb3JjZVJlYWRGcm9tRmlsZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsaW1pdHM6IG9wdGlvbnM/LmxpbWl0c1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0VHlwZSh0aGlzLmlzUmVzb2x2ZWQoKSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRhc3luYyBzYXZlQXModGFyZ2V0OiBVUkkpOiBQcm9taXNlPElVbnR5cGVkRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBuZXdXb3JraW5nQ29weSA9IGF3YWl0IHRoaXMuX3dvcmtpbmdDb3B5TWFuYWdlci5zYXZlQXModGhpcy5yZXNvdXJjZSwgdGFyZ2V0KTtcblx0XHRpZiAoIW5ld1dvcmtpbmdDb3B5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyB0aGlzIGlzIGEgbGl0dGxlIGhhY2t5IGJlY2F1c2Ugd2UgbGVhdmUgdGhlIG5ldyB3b3JraW5nIGNvcHkgYWxvbmUuIEJVVFxuXHRcdC8vIHRoZSBuZXdseSBjcmVhdGVkIGVkaXRvciBpbnB1dCB3aWxsIHBpY2sgaXQgdXAgYW5kIGNsYWltIG93bmVyc2hpcCBvZiBpdC5cblx0XHRyZXR1cm4geyByZXNvdXJjZTogbmV3V29ya2luZ0NvcHkucmVzb3VyY2UgfTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc1N0b3JlZEZpbGVXb3JraW5nQ29weShjYW5kaWRhdGU/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWw+IHwgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5PE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWw+KTogY2FuZGlkYXRlIGlzIElTdG9yZWRGaWxlV29ya2luZ0NvcHk8Tm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbD4ge1xuXHRcdGNvbnN0IGlzVW50aXRsZWQgPSBjYW5kaWRhdGUgJiYgY2FuZGlkYXRlLmNhcGFiaWxpdGllcyAmIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLlVudGl0bGVkO1xuXG5cdFx0cmV0dXJuICFpc1VudGl0bGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbCwgSVVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgJiBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQgPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZXZlbnQ7XG5cblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZTogRXZlbnQ8dm9pZD47XG5cblx0cmVhZG9ubHkgY29uZmlndXJhdGlvbjogSUZpbGVXb3JraW5nQ29weU1vZGVsQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0c2F2ZTogKChvcHRpb25zOiBJV3JpdGVGaWxlT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4pIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rTW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rTG9nU2VydmljZTogSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm9uV2lsbERpc3Bvc2UgPSBfbm90ZWJvb2tNb2RlbC5vbldpbGxEaXNwb3NlLmJpbmQoX25vdGVib29rTW9kZWwpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX25vdGVib29rTW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByYXdFdmVudCBvZiBlLnJhd0V2ZW50cykge1xuXHRcdFx0XHRpZiAocmF3RXZlbnQua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuSW5pdGlhbGl6ZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyYXdFdmVudC50cmFuc2llbnQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSh7XG5cdFx0XHRcdFx0aXNSZWRvaW5nOiBmYWxzZSwgLy90b2RvQHJlYm9ybml4IGZvcndhcmQgdGhpcyBpbmZvcm1hdGlvbiBmcm9tIG5vdGVib29rIG1vZGVsXG5cdFx0XHRcdFx0aXNVbmRvaW5nOiBmYWxzZSxcblx0XHRcdFx0XHRpc0luaXRpYWw6IGZhbHNlLCAvL19ub3RlYm9va01vZGVsLmNlbGxzLmxlbmd0aCA9PT0gMCAvLyB0b2RvQGpyaWVrZW4gbm9uIHRyYW5zaWVudCBtZXRhZGF0YT9cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNhdmVXaXRoUmVkdWNlZENvbW11bmljYXRpb24gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShOb3RlYm9va1NldHRpbmcucmVtb3RlU2F2aW5nKTtcblxuXHRcdGlmIChzYXZlV2l0aFJlZHVjZWRDb21tdW5pY2F0aW9uIHx8IF9ub3RlYm9va01vZGVsLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdC8vIEludGVudGlvbmFsbHkgcGljayBhIGxhcmdlciBkZWxheSBmb3IgdHJpZ2dlcmluZyBiYWNrdXBzIHRvIGFsbG93IGF1dG8tc2F2ZVxuXHRcdFx0XHQvLyB0byBjb21wbGV0ZSBmaXJzdCBvbiB0aGUgb3B0aW1pemVkIHNhdmUgcGF0aFxuXHRcdFx0XHRiYWNrdXBEZWxheTogMTAwMDBcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gT3ZlcnJpZGUgc2F2ZSBiZWhhdmlvciB0byBhdm9pZCB0cmFuc2ZlcnJpbmcgdGhlIGJ1ZmZlciBhY3Jvc3MgdGhlIHdpcmUgMyB0aW1lc1xuXHRcdGlmIChzYXZlV2l0aFJlZHVjZWRDb21tdW5pY2F0aW9uKSB7XG5cdFx0XHR0aGlzLnNldFNhdmVEZWxlZ2F0ZSgpLmNhdGNoKGVycm9yID0+IHRoaXMuX25vdGVib29rTG9nU2VydmljZS5lcnJvcignV29ya2luZ0NvcHlNb2RlbCcsIGBGYWlsZWQgdG8gc2V0IHNhdmUgZGVsZWdhdGU6ICR7ZXJyb3J9YCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0U2F2ZURlbGVnYXRlKCkge1xuXHRcdC8vIG1ha2Ugc3VyZSB3ZSB3YWl0IGZvciBhIHNlcmlhbGl6ZXIgdG8gcmVzb2x2ZSBiZWZvcmUgd2UgdHJ5IHRvIGhhbmRsZSBzYXZlcyBpbiB0aGUgRUhcblx0XHRhd2FpdCB0aGlzLmdldE5vdGVib29rU2VyaWFsaXplcigpO1xuXG5cdFx0dGhpcy5zYXZlID0gYXN5bmMgKG9wdGlvbnM6IElXcml0ZUZpbGVPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGxldCBzZXJpYWxpemVyID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLnRyeUdldERhdGFQcm92aWRlclN5bmModGhpcy5ub3RlYm9va01vZGVsLnZpZXdUeXBlKT8uc2VyaWFsaXplcjtcblxuXHRcdFx0XHRpZiAoIXNlcmlhbGl6ZXIpIHtcblx0XHRcdFx0XHR0aGlzLl9ub3RlYm9va0xvZ1NlcnZpY2UuaW5mbygnV29ya2luZ0NvcHlNb2RlbCcsICdObyBzZXJpYWxpemVyIGZvdW5kIGZvciBub3RlYm9vayBtb2RlbCwgY2hlY2tpbmcgaWYgcHJvdmlkZXIgc3RpbGwgbmVlZHMgdG8gYmUgcmVzb2x2ZWQnKTtcblx0XHRcdFx0XHRzZXJpYWxpemVyID0gYXdhaXQgdGhpcy5nZXROb3RlYm9va1NlcmlhbGl6ZXIoKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9ub3RlYm9va0xvZ1NlcnZpY2UuZXJyb3IoJ1dvcmtpbmdDb3B5TW9kZWwnLCBgRmFpbGVkIHRvIGdldCBub3RlYm9vayBzZXJpYWxpemVyOiAke2Vycm9yfWApO1xuXHRcdFx0XHRcdFx0Ly8gVGhlIHNlcmlhbGl6ZXIgd2FzIHNldCBpbml0aWFsbHkgYnV0IHNvbWVob3cgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZVxuXHRcdFx0XHRcdFx0dGhpcy5zYXZlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IE5vdGVib29rU2F2ZUVycm9yKCdGYWlsZWQgdG8gZ2V0IG5vdGVib29rIHNlcmlhbGl6ZXInKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHNlcmlhbGl6ZXIuc2F2ZSh0aGlzLl9ub3RlYm9va01vZGVsLnVyaSwgdGhpcy5fbm90ZWJvb2tNb2RlbC52ZXJzaW9uSWQsIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdFx0cmV0dXJuIHN0YXQ7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkICYmIGVycm9yLm5hbWUgIT09ICdDYW5jZWxlZCcpIHtcblx0XHRcdFx0XHR0eXBlIG5vdGVib29rU2F2ZUVycm9yRGF0YSA9IHtcblx0XHRcdFx0XHRcdGlzUmVtb3RlOiBib29sZWFuO1xuXHRcdFx0XHRcdFx0aXNJUHlOYldvcmtlclNlcmlhbGl6ZXI6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHRlcnJvcjogc3RyaW5nO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dHlwZSBub3RlYm9va1NhdmVFcnJvckNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdFx0b3duZXI6ICdhbXVuZ2VyJztcblx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdEZXRlY3QgaWYgd2UgYXJlIGhhdmluZyBpc3N1ZXMgc2F2aW5nIGEgbm90ZWJvb2sgb24gdGhlIEV4dGVuc2lvbiBIb3N0Jztcblx0XHRcdFx0XHRcdGlzUmVtb3RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnV2hldGhlciB0aGUgc2F2ZSBpcyBoYXBwZW5pbmcgb24gYSByZW1vdGUgZmlsZSBzeXN0ZW0nIH07XG5cdFx0XHRcdFx0XHRpc0lQeU5iV29ya2VyU2VyaWFsaXplcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1doZXRoZXIgdGhlIElQeW5iIGZpbGVzIGFyZSBzZXJpYWxpemVkIGluIHdvcmtlcnMnIH07XG5cdFx0XHRcdFx0XHRlcnJvcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0luZm8gYWJvdXQgdGhlIGVycm9yIHRoYXQgb2NjdXJyZWQnIH07XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjb25zdCBpc0lQeW5iID0gdGhpcy5fbm90ZWJvb2tNb2RlbC52aWV3VHlwZSA9PT0gJ2p1cHl0ZXItbm90ZWJvb2snIHx8IHRoaXMuX25vdGVib29rTW9kZWwudmlld1R5cGUgPT09ICdpbnRlcmFjdGl2ZSc7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gZ2V0U2F2ZUVycm9yTWVzc2FnZShlcnJvcik7XG5cdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2dFcnJvcjI8bm90ZWJvb2tTYXZlRXJyb3JEYXRhLCBub3RlYm9va1NhdmVFcnJvckNsYXNzaWZpY2F0aW9uPignbm90ZWJvb2svU2F2ZUVycm9yJywge1xuXHRcdFx0XHRcdFx0aXNSZW1vdGU6IHRoaXMuX25vdGVib29rTW9kZWwudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUsXG5cdFx0XHRcdFx0XHRpc0lQeU5iV29ya2VyU2VyaWFsaXplcjogaXNJUHluYiAmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignaXB5bmIuZXhwZXJpbWVudGFsLnNlcmlhbGl6YXRpb24nKSxcblx0XHRcdFx0XHRcdGVycm9yOiBlcnJvck1lc3NhZ2Vcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX25vdGVib29rTW9kZWwuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldCBub3RlYm9va01vZGVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va01vZGVsO1xuXHR9XG5cblx0YXN5bmMgc25hcHNob3QoY29udGV4dDogU25hcHNob3RDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFZTQnVmZmVyUmVhZGFibGVTdHJlYW0+IHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmNyZWF0ZU5vdGVib29rVGV4dERvY3VtZW50U25hcHNob3QodGhpcy5fbm90ZWJvb2tNb2RlbC51cmksIGNvbnRleHQsIHRva2VuKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZShzdHJlYW06IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcmlhbGl6ZXIgPSBhd2FpdCB0aGlzLmdldE5vdGVib29rU2VyaWFsaXplcigpO1xuXG5cdFx0Y29uc3QgYnl0ZXMgPSBhd2FpdCBzdHJlYW1Ub0J1ZmZlcihzdHJlYW0pO1xuXHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBzZXJpYWxpemVyLmRhdGFUb05vdGVib29rKGJ5dGVzKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90ZWJvb2tMb2dTZXJ2aWNlLmluZm8oJ1dvcmtpbmdDb3B5TW9kZWwnLCAnTm90ZWJvb2sgY29udGVudCB1cGRhdGVkIGZyb20gZmlsZSBzeXN0ZW0gLSAnICsgdGhpcy5fbm90ZWJvb2tNb2RlbC51cmkudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5fbm90ZWJvb2tNb2RlbC5yZXNldChkYXRhLmNlbGxzLCBkYXRhLm1ldGFkYXRhLCBzZXJpYWxpemVyLm9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Tm90ZWJvb2tTZXJpYWxpemVyKCk6IFByb21pc2U8SU5vdGVib29rU2VyaWFsaXplcj4ge1xuXHRcdGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLl9ub3RlYm9va1NlcnZpY2Uud2l0aE5vdGVib29rRGF0YVByb3ZpZGVyKHRoaXMubm90ZWJvb2tNb2RlbC52aWV3VHlwZSk7XG5cdFx0aWYgKCEoaW5mbyBpbnN0YW5jZW9mIFNpbXBsZU5vdGVib29rUHJvdmlkZXJJbmZvKSkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9ICdDQU5OT1Qgb3BlbiBub3RlYm9vayB3aXRoIHRoaXMgcHJvdmlkZXInO1xuXHRcdFx0dGhyb3cgbmV3IE5vdGVib29rU2F2ZUVycm9yKG1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbmZvLnNlcmlhbGl6ZXI7XG5cdH1cblxuXHRnZXQgdmVyc2lvbklkKCkge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va01vZGVsLmFsdGVybmF0aXZlVmVyc2lvbklkO1xuXHR9XG5cblx0cHVzaFN0YWNrRWxlbWVudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9ub3RlYm9va01vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnkgaW1wbGVtZW50cyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5PE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWw+LCBJVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3Rvcnk8Tm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdUeXBlOiBzdHJpbmcsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rTG9nU2VydmljZTogSU5vdGVib29rTG9nZ2luZ1NlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBjcmVhdGVNb2RlbChyZXNvdXJjZTogVVJJLCBzdHJlYW06IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Tm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbD4ge1xuXG5cdFx0Y29uc3Qgbm90ZWJvb2tNb2RlbCA9IHRoaXMuX25vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbChyZXNvdXJjZSkgPz9cblx0XHRcdGF3YWl0IHRoaXMuX25vdGVib29rU2VydmljZS5jcmVhdGVOb3RlYm9va1RleHRNb2RlbCh0aGlzLl92aWV3VHlwZSwgcmVzb3VyY2UsIHN0cmVhbSk7XG5cblx0XHRyZXR1cm4gbmV3IE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWwobm90ZWJvb2tNb2RlbCwgdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgdGhpcy5fbm90ZWJvb2tMb2dTZXJ2aWNlKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuY2xhc3MgTm90ZWJvb2tTYXZlRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdHN1cGVyKG1lc3NhZ2UpO1xuXHRcdHRoaXMubmFtZSA9ICdOb3RlYm9va1NhdmVFcnJvcic7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0U2F2ZUVycm9yTWVzc2FnZShlcnJvcjogRXJyb3IpOiBzdHJpbmcge1xuXHRpZiAoZXJyb3IubmFtZSA9PT0gJ05vdGVib29rU2F2ZUVycm9yJykge1xuXHRcdHJldHVybiBlcnJvci5tZXNzYWdlO1xuXHR9IGVsc2UgaWYgKGVycm9yIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yKSB7XG5cdFx0c3dpdGNoIChlcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0KSB7XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9JU19ESVJFQ1RPUlk6XG5cdFx0XHRcdHJldHVybiAnRmlsZSBpcyBhIGRpcmVjdG9yeSc7XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQ6XG5cdFx0XHRcdHJldHVybiAnRmlsZSBub3QgZm91bmQnO1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX01PRElGSUVEX1NJTkNFOlxuXHRcdFx0XHRyZXR1cm4gJ0ZpbGUgbm90IG1vZGlmaWVkIHNpbmNlJztcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PRElGSUVEX1NJTkNFOlxuXHRcdFx0XHRyZXR1cm4gJ0ZpbGUgbW9kaWZpZWQgc2luY2UnO1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVDpcblx0XHRcdFx0cmV0dXJuICdGaWxlIG1vdmUgY29uZmxpY3QnO1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfV1JJVEVfTE9DS0VEOlxuXHRcdFx0XHRyZXR1cm4gJ0ZpbGUgd3JpdGUgbG9ja2VkJztcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEOlxuXHRcdFx0XHRyZXR1cm4gJ0ZpbGUgcGVybWlzc2lvbiBkZW5pZWQnO1xuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfVE9PX0xBUkdFOlxuXHRcdFx0XHRyZXR1cm4gJ0ZpbGUgdG9vIGxhcmdlJztcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX0lOVkFMSURfUEFUSDpcblx0XHRcdFx0cmV0dXJuICdGaWxlIGludmFsaWQgcGF0aCc7XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRElSRUNUT1JZOlxuXHRcdFx0XHRyZXR1cm4gJ0ZpbGUgbm90IGRpcmVjdG9yeSc7XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9PVEhFUl9FUlJPUjpcblx0XHRcdFx0cmV0dXJuICdGaWxlIG90aGVyIGVycm9yJztcblx0XHR9XG5cdH1cblx0cmV0dXJuICdVbmtub3duIGVycm9yJztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBaUMsc0JBQXNCO0FBRXZELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGNBQWM7QUFFbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBbUQsb0JBQW9CLDJCQUEyQjtBQUNsRyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLG1CQUFtQjtBQUU1QixTQUFtRix5QkFBeUIsdUJBQXVCO0FBQ25JLFNBQVMsK0JBQStCO0FBQ3hDLFNBQThCLGtCQUFrQixrQ0FBa0M7QUFDbEYsU0FBUyxrQ0FBa0M7QUFHM0MsU0FBbUwsa0NBQWtDO0FBRXJOLFNBQVMsK0JBQStCO0FBSWpDLElBQU0sNEJBQU4sY0FBd0MsWUFBNEM7QUFBQSxFQWtCMUYsWUFDVSxVQUNRLHdCQUNSLFVBQ1EscUJBQ2pCLFlBQzZDLDRC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
