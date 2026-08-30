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
import { localize } from "../../../../nls.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ETAG_DISABLED, FileOperationResult, IFileService, NotModifiedSinceFileOperationError } from "../../../../platform/files/common/files.js";
import { SaveReason } from "../../../common/editor.js";
import { IWorkingCopyService } from "./workingCopyService.js";
import { WorkingCopyCapabilities } from "./workingCopy.js";
import { raceCancellation, TaskSequentializer, timeout } from "../../../../base/common/async.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IWorkingCopyFileService } from "./workingCopyFileService.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { IWorkingCopyBackupService } from "./workingCopyBackup.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { hash } from "../../../../base/common/hash.js";
import { isErrorWithActions, toErrorMessage } from "../../../../base/common/errorMessage.js";
import { toAction } from "../../../../base/common/actions.js";
import { isWindows } from "../../../../base/common/platform.js";
import { IWorkingCopyEditorService } from "./workingCopyEditorService.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IElevatedFileService } from "../../files/common/elevatedFileService.js";
import { ResourceWorkingCopy } from "./resourceWorkingCopy.js";
import { SnapshotContext } from "./fileWorkingCopy.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { isCancellationError } from "../../../../base/common/errors.js";
var StoredFileWorkingCopyState = /* @__PURE__ */ ((StoredFileWorkingCopyState2) => {
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["SAVED"] = 0] = "SAVED";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["DIRTY"] = 1] = "DIRTY";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["PENDING_SAVE"] = 2] = "PENDING_SAVE";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["CONFLICT"] = 3] = "CONFLICT";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["ORPHAN"] = 4] = "ORPHAN";
  StoredFileWorkingCopyState2[StoredFileWorkingCopyState2["ERROR"] = 5] = "ERROR";
  return StoredFileWorkingCopyState2;
})(StoredFileWorkingCopyState || {});
function isStoredFileWorkingCopySaveEvent(e) {
  const candidate = e;
  return !!candidate.stat;
}
let StoredFileWorkingCopy = class extends ResourceWorkingCopy {
  //#endregion
  constructor(typeId, resource, name, modelFactory, externalResolver, fileService, logService, workingCopyFileService, filesConfigurationService, workingCopyBackupService, workingCopyService, notificationService, workingCopyEditorService, editorService, elevatedFileService, progressService) {
    super(resource, fileService);
    this.typeId = typeId;
    this.name = name;
    this.modelFactory = modelFactory;
    this.externalResolver = externalResolver;
    this.logService = logService;
    this.workingCopyFileService = workingCopyFileService;
    this.filesConfigurationService = filesConfigurationService;
    this.workingCopyBackupService = workingCopyBackupService;
    this.notificationService = notificationService;
    this.workingCopyEditorService = workingCopyEditorService;
    this.editorService = editorService;
    this.elevatedFileService = elevatedFileService;
    this.progressService = progressService;
    this.capabilities = WorkingCopyCapabilities.None;
    this._model = void 0;
    //#region events
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidResolve = this._register(new Emitter());
    this.onDidResolve = this._onDidResolve.event;
    this._onDidChangeDirty = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this._onDidSaveError = this._register(new Emitter());
    this.onDidSaveError = this._onDidSaveError.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this._onDidRevert = this._register(new Emitter());
    this.onDidRevert = this._onDidRevert.event;
    this._onDidChangeReadonly = this._register(new Emitter());
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    //#region Dirty
    this.dirty = false;
    this.ignoreDirtyOnModelContentChange = false;
    //#endregion
    //#region Save
    this.versionId = 0;
    this.lastContentChangeFromUndoRedo = void 0;
    this.saveSequentializer = new TaskSequentializer();
    this.ignoreSaveFromSaveParticipants = false;
    //#endregion
    //#region State
    this.inConflictMode = false;
    this.inErrorMode = false;
    this._register(workingCopyService.registerWorkingCopy(this));
    this.registerListeners();
  }
  get model() {
    return this._model;
  }
  registerListeners() {
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
  }
  isDirty() {
    return this.dirty;
  }
  markModified() {
    this.setDirty(true);
  }
  setDirty(dirty) {
    if (!this.isResolved()) {
      return;
    }
    const wasDirty = this.dirty;
    this.doSetDirty(dirty);
    if (dirty !== wasDirty) {
      this._onDidChangeDirty.fire();
    }
  }
  doSetDirty(dirty) {
    const wasDirty = this.dirty;
    const wasInConflictMode = this.inConflictMode;
    const wasInErrorMode = this.inErrorMode;
    const oldSavedVersionId = this.savedVersionId;
    if (!dirty) {
      this.dirty = false;
      this.inConflictMode = false;
      this.inErrorMode = false;
      if (this.isResolved()) {
        this.savedVersionId = this.model.versionId;
      }
    } else {
      this.dirty = true;
    }
    return () => {
      this.dirty = wasDirty;
      this.inConflictMode = wasInConflictMode;
      this.inErrorMode = wasInErrorMode;
      this.savedVersionId = oldSavedVersionId;
    };
  }
  // !!! DO NOT MARK PRIVATE! USED IN TESTS !!!
  isResolved() {
    return !!this.model;
  }
  async resolve(options) {
    this.trace("resolve() - enter");
    if (this.isDisposed()) {
      this.trace("resolve() - exit - without resolving because file working copy is disposed");
      return;
    }
    if (!options?.contents && (this.dirty || this.saveSequentializer.isRunning())) {
      this.trace("resolve() - exit - without resolving because file working copy is dirty or being saved");
      return;
    }
    return this.doResolve(options);
  }
  async doResolve(options) {
    if (options?.contents) {
      return this.resolveFromBuffer(options.contents);
    }
    const isNew = !this.isResolved();
    if (isNew) {
      const resolvedFromBackup = await this.resolveFromBackup();
      if (resolvedFromBackup) {
        return;
      }
    }
    return this.resolveFromFile(options);
  }
  async resolveFromBuffer(buffer) {
    this.trace("resolveFromBuffer()");
    let mtime;
    let ctime;
    let size;
    let etag;
    try {
      const metadata = await this.fileService.stat(this.resource);
      mtime = metadata.mtime;
      ctime = metadata.ctime;
      size = metadata.size;
      etag = metadata.etag;
      this.setOrphaned(false);
    } catch (error) {
      mtime = Date.now();
      ctime = Date.now();
      size = 0;
      etag = ETAG_DISABLED;
      this.setOrphaned(error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND);
    }
    return this.resolveFromContent(
      {
        resource: this.resource,
        name: this.name,
        mtime,
        ctime,
        size,
        etag,
        value: buffer,
        readonly: false,
        locked: false,
        executable: false
      },
      true
      /* dirty (resolved from buffer) */
    );
  }
  async resolveFromBackup() {
    const backup = await this.workingCopyBackupService.resolve(this);
    const isNew = !this.isResolved();
    if (!isNew) {
      this.trace("resolveFromBackup() - exit - withoutresolving because previously new file working copy got created meanwhile");
      return true;
    }
    if (backup) {
      await this.doResolveFromBackup(backup);
      return true;
    }
    return false;
  }
  async doResolveFromBackup(backup) {
    this.trace("doResolveFromBackup()");
    await this.resolveFromContent(
      {
        resource: this.resource,
        name: this.name,
        mtime: backup.meta ? backup.meta.mtime : Date.now(),
        ctime: backup.meta ? backup.meta.ctime : Date.now(),
        size: backup.meta ? backup.meta.size : 0,
        etag: backup.meta ? backup.meta.etag : ETAG_DISABLED,
        // etag disabled if unknown!
        value: backup.value,
        readonly: false,
        locked: false,
        executable: false
      },
      true
      /* dirty (resolved from backup) */
    );
    if (backup.meta?.orphaned) {
      this.setOrphaned(true);
    }
  }
  async resolveFromFile(options) {
    this.trace("resolveFromFile()");
    const forceReadFromFile = options?.forceReadFromFile;
    let etag;
    if (forceReadFromFile) {
      etag = ETAG_DISABLED;
    } else if (this.lastResolvedFileStat) {
      etag = this.lastResolvedFileStat.etag;
    }
    const currentVersionId = this.versionId;
    try {
      const content = await this.fileService.readFileStream(this.resource, {
        etag,
        limits: options?.limits
      });
      this.setOrphaned(false);
      if (currentVersionId !== this.versionId) {
        this.trace("resolveFromFile() - exit - without resolving because file working copy content changed");
        return;
      }
      await this.resolveFromContent(
        content,
        false
        /* not dirty (resolved from file) */
      );
    } catch (error) {
      const result = error.fileOperationResult;
      this.setOrphaned(result === FileOperationResult.FILE_NOT_FOUND);
      if (this.isResolved() && result === FileOperationResult.FILE_NOT_MODIFIED_SINCE) {
        if (error instanceof NotModifiedSinceFileOperationError) {
          this.updateLastResolvedFileStat(error.stat);
        }
        return;
      }
      if (this.isResolved() && result === FileOperationResult.FILE_NOT_FOUND && !forceReadFromFile) {
        return;
      }
      throw error;
    }
  }
  async resolveFromContent(content, dirty) {
    this.trace("resolveFromContent() - enter");
    if (this.isDisposed()) {
      this.trace("resolveFromContent() - exit - because working copy is disposed");
      return;
    }
    this.updateLastResolvedFileStat({
      resource: this.resource,
      name: content.name,
      mtime: content.mtime,
      ctime: content.ctime,
      size: content.size,
      etag: content.etag,
      readonly: content.readonly,
      locked: content.locked,
      executable: false,
      isFile: true,
      isDirectory: false,
      isSymbolicLink: false,
      children: void 0
    });
    if (this.isResolved()) {
      await this.doUpdateModel(content.value);
    } else {
      await this.doCreateModel(content.value);
    }
    this.setDirty(!!dirty);
    this._onDidResolve.fire();
  }
  async doCreateModel(contents) {
    this.trace("doCreateModel()");
    this._model = this._register(await this.modelFactory.createModel(this.resource, contents, CancellationToken.None));
    this.installModelListeners(this._model);
  }
  async doUpdateModel(contents) {
    this.trace("doUpdateModel()");
    this.ignoreDirtyOnModelContentChange = true;
    try {
      await this.model?.update(contents, CancellationToken.None);
    } finally {
      this.ignoreDirtyOnModelContentChange = false;
    }
  }
  installModelListeners(model) {
    this._register(model.onDidChangeContent((e) => this.onModelContentChanged(model, e.isUndoing || e.isRedoing)));
    this._register(model.onWillDispose(() => this.dispose()));
  }
  onModelContentChanged(model, isUndoingOrRedoing) {
    this.trace(`onModelContentChanged() - enter`);
    this.versionId++;
    this.trace(`onModelContentChanged() - new versionId ${this.versionId}`);
    if (isUndoingOrRedoing) {
      this.lastContentChangeFromUndoRedo = Date.now();
    }
    if (!this.ignoreDirtyOnModelContentChange && !this.isReadonly()) {
      if (model.versionId === this.savedVersionId) {
        this.trace("onModelContentChanged() - model content changed back to last saved version");
        const wasDirty = this.dirty;
        this.setDirty(false);
        if (wasDirty) {
          this._onDidRevert.fire();
        }
      } else {
        this.trace("onModelContentChanged() - model content changed and marked as dirty");
        this.setDirty(true);
      }
    }
    this._onDidChangeContent.fire();
  }
  async forceResolveFromFile() {
    if (this.isDisposed()) {
      return;
    }
    await this.externalResolver({
      forceReadFromFile: true
    });
  }
  //#endregion
  //#region Backup
  get backupDelay() {
    return this.model?.configuration?.backupDelay;
  }
  async backup(token) {
    let meta = void 0;
    if (this.lastResolvedFileStat) {
      meta = {
        mtime: this.lastResolvedFileStat.mtime,
        ctime: this.lastResolvedFileStat.ctime,
        size: this.lastResolvedFileStat.size,
        etag: this.lastResolvedFileStat.etag,
        orphaned: this.isOrphaned()
      };
    }
    let content = void 0;
    if (this.isResolved()) {
      content = await raceCancellation(this.model.snapshot(SnapshotContext.Backup, token), token);
    }
    return { meta, content };
  }
  async save(options = /* @__PURE__ */ Object.create(null)) {
    if (!this.isResolved()) {
      return false;
    }
    if (this.isReadonly()) {
      this.trace("save() - ignoring request for readonly resource");
      return false;
    }
    if ((this.hasState(3 /* CONFLICT */) || this.hasState(5 /* ERROR */)) && (options.reason === SaveReason.AUTO || options.reason === SaveReason.FOCUS_CHANGE || options.reason === SaveReason.WINDOW_CHANGE)) {
      this.trace("save() - ignoring auto save request for file working copy that is in conflict or error");
      return false;
    }
    this.trace("save() - enter");
    await this.doSave(options);
    this.trace("save() - exit");
    return this.hasState(0 /* SAVED */);
  }
  async doSave(options) {
    if (typeof options.reason !== "number") {
      options.reason = SaveReason.EXPLICIT;
    }
    const versionId = this.versionId;
    this.trace(`doSave(${versionId}) - enter with versionId ${versionId}`);
    if (this.ignoreSaveFromSaveParticipants) {
      this.trace(`doSave(${versionId}) - exit - refusing to save() recursively from save participant`);
      return;
    }
    if (this.saveSequentializer.isRunning(versionId)) {
      this.trace(`doSave(${versionId}) - exit - found a running save for versionId ${versionId}`);
      return this.saveSequentializer.running;
    }
    if (!options.force && !this.dirty) {
      this.trace(`doSave(${versionId}) - exit - because not dirty and/or versionId is different (this.isDirty: ${this.dirty}, this.versionId: ${this.versionId})`);
      return;
    }
    if (this.saveSequentializer.isRunning()) {
      this.trace(`doSave(${versionId}) - exit - because busy saving`);
      this.saveSequentializer.cancelRunning();
      return this.saveSequentializer.queue(() => this.doSave(options));
    }
    if (this.isResolved()) {
      this.model.pushStackElement();
    }
    const saveCancellation = new CancellationTokenSource();
    return this.progressService.withProgress({
      title: localize("saveParticipants", "Saving '{0}'", this.name),
      location: ProgressLocation.Window,
      cancellable: true,
      delay: this.isDirty() ? 3e3 : 5e3
    }, (progress) => {
      return this.doSaveSequential(versionId, options, progress, saveCancellation);
    }, () => {
      saveCancellation.cancel();
    }).finally(() => {
      saveCancellation.dispose();
    });
  }
  doSaveSequential(versionId, options, progress, saveCancellation) {
    return this.saveSequentializer.run(versionId, (async () => {
      if (this.isResolved() && !options.skipSaveParticipants && this.workingCopyFileService.hasSaveParticipants) {
        try {
          if (options.reason === SaveReason.AUTO && typeof this.lastContentChangeFromUndoRedo === "number") {
            const timeFromUndoRedoToSave = Date.now() - this.lastContentChangeFromUndoRedo;
            if (timeFromUndoRedoToSave < StoredFileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD) {
              await timeout(StoredFileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD - timeFromUndoRedoToSave);
            }
          }
          if (!saveCancellation.token.isCancellationRequested) {
            this.ignoreSaveFromSaveParticipants = true;
            try {
              await this.workingCopyFileService.runSaveParticipants(this, { reason: options.reason ?? SaveReason.EXPLICIT, savedFrom: options.from }, progress, saveCancellation.token);
            } catch (err) {
              if (isCancellationError(err) && !saveCancellation.token.isCancellationRequested) {
                saveCancellation.cancel();
              }
            } finally {
              this.ignoreSaveFromSaveParticipants = false;
            }
          }
        } catch (error) {
          this.logService.error(`[stored file working copy] runSaveParticipants(${versionId}) - resulted in an error: ${error.toString()}`, this.resource.toString(), this.typeId);
        }
      }
      if (saveCancellation.token.isCancellationRequested) {
        return;
      }
      if (this.isDisposed()) {
        return;
      }
      if (!this.isResolved()) {
        return;
      }
      versionId = this.versionId;
      this.inErrorMode = false;
      progress.report({ message: localize("saveTextFile", "Writing into file...") });
      this.trace(`doSave(${versionId}) - before write()`);
      const lastResolvedFileStat = assertReturnsDefined(this.lastResolvedFileStat);
      const resolvedFileWorkingCopy = this;
      return this.saveSequentializer.run(versionId, (async () => {
        try {
          const writeFileOptions = {
            mtime: lastResolvedFileStat.mtime,
            etag: options.ignoreModifiedSince || !this.filesConfigurationService.preventSaveConflicts(lastResolvedFileStat.resource) ? ETAG_DISABLED : lastResolvedFileStat.etag,
            unlock: options.writeUnlock
          };
          let stat;
          if (typeof resolvedFileWorkingCopy.model.save === "function") {
            try {
              stat = await resolvedFileWorkingCopy.model.save(writeFileOptions, saveCancellation.token);
            } catch (error) {
              if (saveCancellation.token.isCancellationRequested) {
                return void 0;
              }
              throw error;
            }
          } else {
            const snapshot = await raceCancellation(resolvedFileWorkingCopy.model.snapshot(SnapshotContext.Save, saveCancellation.token), saveCancellation.token);
            if (saveCancellation.token.isCancellationRequested) {
              return;
            } else {
              saveCancellation.dispose();
            }
            if (options?.writeElevated && this.elevatedFileService.isSupported(lastResolvedFileStat.resource)) {
              stat = await this.elevatedFileService.writeFileElevated(lastResolvedFileStat.resource, assertReturnsDefined(snapshot), writeFileOptions);
            } else {
              stat = await this.fileService.writeFile(lastResolvedFileStat.resource, assertReturnsDefined(snapshot), writeFileOptions);
            }
          }
          this.handleSaveSuccess(stat, versionId, options);
        } catch (error) {
          this.handleSaveError(error, versionId, options);
        }
      })(), () => saveCancellation.cancel());
    })(), () => saveCancellation.cancel());
  }
  handleSaveSuccess(stat, versionId, options) {
    this.updateLastResolvedFileStat(stat);
    if (versionId === this.versionId) {
      this.trace(`handleSaveSuccess(${versionId}) - setting dirty to false because versionId did not change`);
      this.setDirty(false);
    } else {
      this.trace(`handleSaveSuccess(${versionId}) - not setting dirty to false because versionId did change meanwhile`);
    }
    this.setOrphaned(false);
    this._onDidSave.fire({ reason: options.reason, stat, source: options.source });
  }
  handleSaveError(error, versionId, options) {
    (options.ignoreErrorHandler ? this.logService.trace : this.logService.error).apply(this.logService, [`[stored file working copy] handleSaveError(${versionId}) - exit - resulted in a save error: ${error.toString()}`, this.resource.toString(), this.typeId]);
    if (options.ignoreErrorHandler) {
      throw error;
    }
    this.setDirty(true);
    this.inErrorMode = true;
    if (error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
      this.inConflictMode = true;
    }
    this.doHandleSaveError(error, options);
    this._onDidSaveError.fire();
  }
  doHandleSaveError(error, options) {
    const fileOperationError = error;
    const primaryActions = [];
    let message;
    if (fileOperationError.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
      message = localize("staleSaveError", "Failed to save '{0}': The content of the file is newer. Do you want to overwrite the file with your changes?", this.name);
      primaryActions.push(toAction({ id: "fileWorkingCopy.overwrite", label: localize("overwrite", "Overwrite"), run: () => this.save({ ...options, ignoreModifiedSince: true, reason: SaveReason.EXPLICIT }) }));
      primaryActions.push(toAction({ id: "fileWorkingCopy.revert", label: localize("revert", "Revert"), run: () => this.revert() }));
    } else {
      const isWriteLocked = fileOperationError.fileOperationResult === FileOperationResult.FILE_WRITE_LOCKED;
      const triedToUnlock = isWriteLocked && fileOperationError.options?.unlock;
      const isPermissionDenied = fileOperationError.fileOperationResult === FileOperationResult.FILE_PERMISSION_DENIED;
      const canSaveElevated = this.elevatedFileService.isSupported(this.resource);
      if (isErrorWithActions(error)) {
        primaryActions.push(...error.actions);
      }
      if (canSaveElevated && (isPermissionDenied || triedToUnlock)) {
        primaryActions.push(toAction({
          id: "fileWorkingCopy.saveElevated",
          label: triedToUnlock ? isWindows ? localize("overwriteElevated", "Overwrite as Admin...") : localize("overwriteElevatedSudo", "Overwrite as Sudo...") : isWindows ? localize("saveElevated", "Retry as Admin...") : localize("saveElevatedSudo", "Retry as Sudo..."),
          run: () => {
            this.save({ ...options, writeElevated: true, writeUnlock: triedToUnlock, reason: SaveReason.EXPLICIT });
          }
        }));
      } else if (isWriteLocked) {
        primaryActions.push(toAction({ id: "fileWorkingCopy.unlock", label: localize("overwrite", "Overwrite"), run: () => this.save({ ...options, writeUnlock: true, reason: SaveReason.EXPLICIT }) }));
      } else {
        primaryActions.push(toAction({ id: "fileWorkingCopy.retry", label: localize("retry", "Retry"), run: () => this.save({ ...options, reason: SaveReason.EXPLICIT }) }));
      }
      primaryActions.push(toAction({
        id: "fileWorkingCopy.saveAs",
        label: localize("saveAs", "Save As..."),
        run: async () => {
          const editor = this.workingCopyEditorService.findEditor(this);
          if (editor) {
            const result = await this.editorService.save(editor, { saveAs: true, reason: SaveReason.EXPLICIT });
            if (!result.success) {
              this.doHandleSaveError(error, options);
            }
          }
        }
      }));
      primaryActions.push(toAction({ id: "fileWorkingCopy.revert", label: localize("revert", "Revert"), run: () => this.revert() }));
      if (isWriteLocked) {
        if (triedToUnlock && canSaveElevated) {
          message = isWindows ? localize("readonlySaveErrorAdmin", "Failed to save '{0}': File is read-only. Select 'Overwrite as Admin' to retry as administrator.", this.name) : localize("readonlySaveErrorSudo", "Failed to save '{0}': File is read-only. Select 'Overwrite as Sudo' to retry as superuser.", this.name);
        } else {
          message = localize("readonlySaveError", "Failed to save '{0}': File is read-only. Select 'Overwrite' to attempt to make it writeable.", this.name);
        }
      } else if (canSaveElevated && isPermissionDenied) {
        message = isWindows ? localize("permissionDeniedSaveError", "Failed to save '{0}': Insufficient permissions. Select 'Retry as Admin' to retry as administrator.", this.name) : localize("permissionDeniedSaveErrorSudo", "Failed to save '{0}': Insufficient permissions. Select 'Retry as Sudo' to retry as superuser.", this.name);
      } else {
        message = localize({ key: "genericSaveError", comment: ["{0} is the resource that failed to save and {1} the error message"] }, "Failed to save '{0}': {1}", this.name, toErrorMessage(error, false));
      }
    }
    const handle = this.notificationService.notify({ id: `${hash(this.resource.toString())}`, severity: Severity.Error, message, actions: { primary: primaryActions } });
    const listener = this._register(Event.once(Event.any(this.onDidSave, this.onDidRevert))(() => handle.close()));
    this._register(Event.once(handle.onDidClose)(() => listener.dispose()));
  }
  updateLastResolvedFileStat(newFileStat) {
    const oldReadonly = this.isReadonly();
    if (!this.lastResolvedFileStat) {
      this.lastResolvedFileStat = newFileStat;
    } else if (this.lastResolvedFileStat.mtime <= newFileStat.mtime) {
      this.lastResolvedFileStat = newFileStat;
    } else {
      this.lastResolvedFileStat = { ...this.lastResolvedFileStat, readonly: newFileStat.readonly, locked: newFileStat.locked };
    }
    if (this.isReadonly() !== oldReadonly) {
      this._onDidChangeReadonly.fire();
    }
  }
  //#endregion
  //#region Revert
  async revert(options) {
    if (!this.isResolved() || !this.dirty && !options?.force) {
      return;
    }
    this.trace("revert()");
    const wasDirty = this.dirty;
    const undoSetDirty = this.doSetDirty(false);
    const softUndo = options?.soft;
    if (!softUndo) {
      try {
        await this.forceResolveFromFile();
      } catch (error) {
        if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
          undoSetDirty();
          throw error;
        }
      }
    }
    this._onDidRevert.fire();
    if (wasDirty) {
      this._onDidChangeDirty.fire();
    }
  }
  hasState(state) {
    switch (state) {
      case 3 /* CONFLICT */:
        return this.inConflictMode;
      case 1 /* DIRTY */:
        return this.dirty;
      case 5 /* ERROR */:
        return this.inErrorMode;
      case 4 /* ORPHAN */:
        return this.isOrphaned();
      case 2 /* PENDING_SAVE */:
        return this.saveSequentializer.isRunning();
      case 0 /* SAVED */:
        return !this.dirty;
    }
  }
  async joinState(state) {
    return this.saveSequentializer.running;
  }
  //#endregion
  //#region Utilities
  isReadonly() {
    return this.filesConfigurationService.isReadonly(this.resource, this.lastResolvedFileStat);
  }
  trace(msg) {
    this.logService.trace(`[stored file working copy] ${msg}`, this.resource.toString(), this.typeId);
  }
  //#endregion
  //#region Dispose
  dispose() {
    this.trace("dispose()");
    this.inConflictMode = false;
    this.inErrorMode = false;
    this._model = void 0;
    super.dispose();
  }
  //#endregion
};
StoredFileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD = 500;
StoredFileWorkingCopy = __decorateClass([
  __decorateParam(5, IFileService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IWorkingCopyFileService),
  __decorateParam(8, IFilesConfigurationService),
  __decorateParam(9, IWorkingCopyBackupService),
  __decorateParam(10, IWorkingCopyService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IWorkingCopyEditorService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IElevatedFileService),
  __decorateParam(15, IProgressService)
], StoredFileWorkingCopy);
export {
  StoredFileWorkingCopy,
  StoredFileWorkingCopyState,
  isStoredFileWorkingCopySaveEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcY29tbW9uXFxzdG9yZWRGaWxlV29ya2luZ0NvcHkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRVRBR19ESVNBQkxFRCwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVJlYWRMaW1pdHMsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCBJRmlsZVN0cmVhbUNvbnRlbnQsIElXcml0ZUZpbGVPcHRpb25zLCBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElTYXZlT3B0aW9ucywgSVJldmVydE9wdGlvbnMsIFNhdmVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXAsIElXb3JraW5nQ29weUJhY2t1cE1ldGEsIElXb3JraW5nQ29weVNhdmVFdmVudCwgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMgfSBmcm9tICcuL3dvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24sIFRhc2tTZXF1ZW50aWFsaXplciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlGaWxlU2VydmljZSB9IGZyb20gJy4vd29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UsIElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwIH0gZnJvbSAnLi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBpc0Vycm9yV2l0aEFjdGlvbnMsIHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi93b3JraW5nQ29weUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVsZXZhdGVkRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZWxldmF0ZWRGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VXb3JraW5nQ29weSwgUmVzb3VyY2VXb3JraW5nQ29weSB9IGZyb20gJy4vcmVzb3VyY2VXb3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJRmlsZVdvcmtpbmdDb3B5LCBJRmlsZVdvcmtpbmdDb3B5TW9kZWwsIElGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnksIFNuYXBzaG90Q29udGV4dCB9IGZyb20gJy4vZmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuLyoqXG4gKiBTdG9yZWQgZmlsZSBzcGVjaWZpYyB3b3JraW5nIGNvcHkgbW9kZWwgZmFjdG9yeS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5PE0gZXh0ZW5kcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+IGV4dGVuZHMgSUZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeTxNPiB7IH1cblxuLyoqXG4gKiBUaGUgdW5kZXJseWluZyBtb2RlbCBvZiBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBwcm92aWRlcyBzb21lXG4gKiBtZXRob2RzIGZvciB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHRvIGZ1bmN0aW9uLiBUaGUgbW9kZWwgaXNcbiAqIHR5cGljYWxseSBvbmx5IGF2YWlsYWJsZSBhZnRlciB0aGUgd29ya2luZyBjb3B5IGhhcyBiZWVuXG4gKiByZXNvbHZlZCB2aWEgaXQncyBgcmVzb2x2ZSgpYCBtZXRob2QuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsIGV4dGVuZHMgSUZpbGVXb3JraW5nQ29weU1vZGVsIHtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQ6IEV2ZW50PElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBBIHZlcnNpb24gSUQgb2YgdGhlIG1vZGVsLiBJZiBhIGBvbkRpZENoYW5nZUNvbnRlbnRgIGlzIGZpcmVkXG5cdCAqIGZyb20gdGhlIG1vZGVsIGFuZCB0aGUgbGFzdCBrbm93biBzYXZlZCBgdmVyc2lvbklkYCBtYXRjaGVzXG5cdCAqIHdpdGggdGhlIGBtb2RlbC52ZXJzaW9uSWRgLCB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdpbGxcblx0ICogZGlzY2FyZCBhbnkgZGlydHkgc3RhdGUuXG5cdCAqXG5cdCAqIEEgdXNlIGNhc2UgaXMgdGhlIGZvbGxvd2luZzpcblx0ICogLSBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBnZXRzIGVkaXRlZCBhbmQgdGh1cyBkaXJ0eVxuXHQgKiAtIHRoZSB1c2VyIHRyaWdnZXJzIHVuZG8gdG8gcmV2ZXJ0IHRoZSBjaGFuZ2VzXG5cdCAqIC0gYXQgdGhpcyBwb2ludCB0aGUgYHZlcnNpb25JZGAgc2hvdWxkIG1hdGNoIHRoZSBvbmUgd2UgaGFkIHNhdmVkXG5cdCAqXG5cdCAqIFRoaXMgcmVxdWlyZXMgdGhlIG1vZGVsIHRvIGJlIGF3YXJlIG9mIHVuZG8vcmVkbyBvcGVyYXRpb25zLlxuXHQgKi9cblx0cmVhZG9ubHkgdmVyc2lvbklkOiB1bmtub3duO1xuXG5cdC8qKlxuXHQgKiBDbG9zZSB0aGUgY3VycmVudCB1bmRvLXJlZG8gZWxlbWVudC4gVGhpcyBvZmZlcnMgYSB3YXlcblx0ICogdG8gY3JlYXRlIGFuIHVuZG8vcmVkbyBzdG9wIHBvaW50LlxuXHQgKlxuXHQgKiBUaGlzIG1ldGhvZCBtYXkgZm9yIGV4YW1wbGUgYmUgY2FsbGVkIHJpZ2h0IGJlZm9yZSB0aGVcblx0ICogc2F2ZSBpcyB0cmlnZ2VyZWQgc28gdGhhdCB0aGUgdXNlciBjYW4gYWx3YXlzIHVuZG8gYmFja1xuXHQgKiB0byB0aGUgc3RhdGUgYmVmb3JlIHNhdmluZy5cblx0ICovXG5cdHB1c2hTdGFja0VsZW1lbnQoKTogdm9pZDtcblxuXHQvKipcblx0ICogT3B0aW9uYWxseSBhbGxvd3MgYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgbW9kZWwgdG9cblx0ICogaW1wbGVtZW50IHRoZSBgc2F2ZWAgbWV0aG9kLiBUaGlzIGFsbG93cyB0byBpbXBsZW1lbnRcblx0ICogYSBtb3JlIGVmZmljaWVudCBzYXZlIGxvZ2ljIGNvbXBhcmVkIHRvIHRoZSBkZWZhdWx0XG5cdCAqIHdoaWNoIGlzIHRvIGFzayB0aGUgbW9kZWwgZm9yIGEgYHNuYXBzaG90YCBhbmQgdGhlblxuXHQgKiB3cml0aW5nIHRoYXQgdG8gdGhlIG1vZGVsJ3MgcmVzb3VyY2UuXG5cdCAqL1xuXHRzYXZlPyhvcHRpb25zOiBJV3JpdGVGaWxlT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQge1xuXG5cdC8qKlxuXHQgKiBGbGFnIHRoYXQgaW5kaWNhdGVzIHRoYXQgdGhpcyBldmVudCB3YXMgZ2VuZXJhdGVkIHdoaWxlIHVuZG9pbmcuXG5cdCAqL1xuXHRyZWFkb25seSBpc1VuZG9pbmc6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEZsYWcgdGhhdCBpbmRpY2F0ZXMgdGhhdCB0aGlzIGV2ZW50IHdhcyBnZW5lcmF0ZWQgd2hpbGUgcmVkb2luZy5cblx0ICovXG5cdHJlYWRvbmx5IGlzUmVkb2luZzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBBIHN0b3JlZCBmaWxlIGJhc2VkIGBJV29ya2luZ0NvcHlgIGlzIGJhY2tlZCBieSBhIGBVUklgIGZyb20gYVxuICoga25vd24gZmlsZSBzeXN0ZW0gcHJvdmlkZXIuIEdpdmVuIHRoaXMgYXNzdW1wdGlvbiwgYSBsb3RcbiAqIG9mIGZ1bmN0aW9uYWxpdHkgY2FuIGJlIGJ1aWx0IG9uIHRvcCwgc3VjaCBhcyBzYXZpbmcgaW5cbiAqIGEgc2VjdXJlIHdheSB0byBwcmV2ZW50IGRhdGEgbG9zcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0gZXh0ZW5kcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+IGV4dGVuZHMgSVJlc291cmNlV29ya2luZ0NvcHksIElGaWxlV29ya2luZ0NvcHk8TT4ge1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCBmb3Igd2hlbiBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB3YXMgcmVzb2x2ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFJlc29sdmU6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCBmb3Igd2hlbiBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB3YXMgc2F2ZWQgc3VjY2Vzc2Z1bGx5LlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTYXZlOiBFdmVudDxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgaW5kaWNhdGluZyB0aGF0IGEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHNhdmUgb3BlcmF0aW9uIGZhaWxlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkU2F2ZUVycm9yOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgZm9yIHdoZW4gdGhlIHJlYWRvbmx5IHN0YXRlIG9mIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgY2hhbmdlcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVhZG9ubHk6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weS5cblx0ICovXG5cdHJlc29sdmUob3B0aW9ucz86IElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIEV4cGxpY2l0bHkgc2V0cyB0aGUgd29ya2luZyBjb3B5IHRvIGJlIG1vZGlmaWVkLlxuXHQgKi9cblx0bWFya01vZGlmaWVkKCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpcyBpbiB0aGUgcHJvdmlkZWQgYHN0YXRlYFxuXHQgKiBvciBub3QuXG5cdCAqXG5cdCAqIEBwYXJhbSBzdGF0ZSB0aGUgYEZpbGVXb3JraW5nQ29weVN0YXRlYCB0byBjaGVjayBvbi5cblx0ICovXG5cdGhhc1N0YXRlKHN0YXRlOiBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZSk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byBqb2luIGEgc3RhdGUgY2hhbmdlIGF3YXkgZnJvbSB0aGUgcHJvdmlkZWQgYHN0YXRlYC5cblx0ICpcblx0ICogQHBhcmFtIHN0YXRlIGN1cnJlbnRseSBvbmx5IGBGaWxlV29ya2luZ0NvcHlTdGF0ZS5QRU5ESU5HX1NBVkVgXG5cdCAqIGNhbiBiZSBhd2FpdGVkIG9uIHRvIHJlc29sdmUuXG5cdCAqL1xuXHRqb2luU3RhdGUoc3RhdGU6IFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLlBFTkRJTkdfU0FWRSk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgd2UgaGF2ZSBhIHJlc29sdmVkIG1vZGVsIG9yIG5vdC5cblx0ICovXG5cdGlzUmVzb2x2ZWQoKTogdGhpcyBpcyBJUmVzb2x2ZWRTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpcyByZWFkb25seSBvciBub3QuXG5cdCAqL1xuXHRpc1JlYWRvbmx5KCk6IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmc7XG5cblx0LyoqXG5cdCAqIEFza3MgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB0byBzYXZlLiBJZiB0aGUgc3RvcmVkIGZpbGVcblx0ICogd29ya2luZyBjb3B5IHdhcyBkaXJ0eSwgaXQgaXMgZXhwZWN0ZWQgdG8gYmUgbm9uLWRpcnR5IGFmdGVyXG5cdCAqIHRoaXMgb3BlcmF0aW9uIGhhcyBmaW5pc2hlZC5cblx0ICpcblx0ICogQHJldHVybnMgYHRydWVgIGlmIHRoZSBvcGVyYXRpb24gd2FzIHN1Y2Nlc3NmdWwgYW5kIGBmYWxzZWAgb3RoZXJ3aXNlLlxuXHQgKi9cblx0c2F2ZShvcHRpb25zPzogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVBc09wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZFN0b3JlZEZpbGVXb3JraW5nQ29weTxNIGV4dGVuZHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiBleHRlbmRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4ge1xuXG5cdC8qKlxuXHQgKiBBIHJlc29sdmVkIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBoYXMgYSByZXNvbHZlZCBtb2RlbC5cblx0ICovXG5cdHJlYWRvbmx5IG1vZGVsOiBNO1xufVxuXG4vKipcbiAqIFN0YXRlcyB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGNhbiBiZSBpbi5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUge1xuXG5cdC8qKlxuXHQgKiBBIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpcyBzYXZlZC5cblx0ICovXG5cdFNBVkVELFxuXG5cdC8qKlxuXHQgKiBBIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpcyBkaXJ0eS5cblx0ICovXG5cdERJUlRZLFxuXG5cdC8qKlxuXHQgKiBBIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpcyBjdXJyZW50bHkgYmVpbmcgc2F2ZWQgYnV0XG5cdCAqIHRoaXMgb3BlcmF0aW9uIGhhcyBub3QgY29tcGxldGVkIHlldC5cblx0ICovXG5cdFBFTkRJTkdfU0FWRSxcblxuXHQvKipcblx0ICogQSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaXMgaW4gY29uZmxpY3QgbW9kZSB3aGVuIGNoYW5nZXNcblx0ICogY2Fubm90IGJlIHNhdmVkIGJlY2F1c2UgdGhlIHVuZGVybHlpbmcgZmlsZSBoYXMgY2hhbmdlZC5cblx0ICogU3RvcmVkIGZpbGUgd29ya2luZyBjb3BpZXMgaW4gY29uZmxpY3QgbW9kZSBhcmUgYWx3YXlzIGRpcnR5LlxuXHQgKi9cblx0Q09ORkxJQ1QsXG5cblx0LyoqXG5cdCAqIEEgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IGlzIGluIG9ycGhhbiBzdGF0ZSB3aGVuIHRoZSB1bmRlcmx5aW5nXG5cdCAqIGZpbGUgaGFzIGJlZW4gZGVsZXRlZC5cblx0ICovXG5cdE9SUEhBTixcblxuXHQvKipcblx0ICogQW55IGVycm9yIHRoYXQgaGFwcGVucyBkdXJpbmcgYSBzYXZlIHRoYXQgaXMgbm90IGNhdXNpbmdcblx0ICogdGhlIGBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5DT05GTElDVGAgc3RhdGUuXG5cdCAqIFN0b3JlZCBmaWxlIHdvcmtpbmcgY29waWVzIGluIGVycm9yIG1vZGUgYXJlIGFsd2F5cyBkaXJ0eS5cblx0ICovXG5cdEVSUk9SXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVPcHRpb25zIGV4dGVuZHMgSVNhdmVPcHRpb25zIHtcblxuXHQvKipcblx0ICogU2F2ZSB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdpdGggYW4gYXR0ZW1wdCB0byB1bmxvY2sgaXQuXG5cdCAqL1xuXHRyZWFkb25seSB3cml0ZVVubG9jaz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNhdmUgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB3aXRoIGVsZXZhdGVkIHByaXZpbGVnZXMuXG5cdCAqXG5cdCAqIE5vdGU6IFRoaXMgbWF5IG5vdCBiZSBzdXBwb3J0ZWQgaW4gYWxsIGVudmlyb25tZW50cy5cblx0ICovXG5cdHJlYWRvbmx5IHdyaXRlRWxldmF0ZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBBbGxvd3MgdG8gd3JpdGUgdG8gYSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgZXZlbiBpZiBpdCBoYXMgYmVlblxuXHQgKiBtb2RpZmllZCBvbiBkaXNrLiBUaGlzIHNob3VsZCBvbmx5IGJlIHRyaWdnZXJlZCBmcm9tIGFuXG5cdCAqIGV4cGxpY2l0IHVzZXIgYWN0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgaWdub3JlTW9kaWZpZWRTaW5jZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIElmIHNldCwgd2lsbCBidWJibGUgdXAgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBzYXZlIGVycm9yIHRvXG5cdCAqIHRoZSBjYWxsZXIgaW5zdGVhZCBvZiBoYW5kbGluZyBpdC5cblx0ICovXG5cdHJlYWRvbmx5IGlnbm9yZUVycm9ySGFuZGxlcj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVBc09wdGlvbnMgZXh0ZW5kcyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBVUkkgb2YgdGhlIHJlc291cmNlIHRoZSB0ZXh0IGZpbGUgaXMgc2F2ZWQgZnJvbSBpZiBrbm93bi5cblx0ICovXG5cdHJlYWRvbmx5IGZyb20/OiBVUkk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JlZEZpbGVXb3JraW5nQ29weVJlc29sdmVyIHtcblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIHdvcmtpbmcgY29weSBpbiBhIHNhZmUgd2F5IGZyb20gYW4gZXh0ZXJuYWxcblx0ICogd29ya2luZyBjb3B5IG1hbmFnZXIgdGhhdCBjYW4gbWFrZSBzdXJlIG11bHRpcGxlIHBhcmFsbGVsXG5cdCAqIHJlc29sdmVzIGV4ZWN1dGUgcHJvcGVybHkuXG5cdCAqL1xuXHQob3B0aW9ucz86IElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JlZEZpbGVXb3JraW5nQ29weVJlc29sdmVPcHRpb25zIHtcblxuXHQvKipcblx0ICogVGhlIGNvbnRlbnRzIHRvIHVzZSBmb3IgdGhlIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBpZiBrbm93bi4gSWYgbm90XG5cdCAqIHByb3ZpZGVkLCB0aGUgY29udGVudHMgd2lsbCBiZSByZXRyaWV2ZWQgZnJvbSB0aGUgdW5kZXJseWluZ1xuXHQgKiByZXNvdXJjZSBvciBiYWNrdXAgaWYgcHJlc2VudC5cblx0ICpcblx0ICogSWYgY29udGVudHMgYXJlIHByb3ZpZGVkLCB0aGUgc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5IHdpbGwgYmUgbWFya2VkXG5cdCAqIGFzIGRpcnR5IHJpZ2h0IGZyb20gdGhlIGJlZ2lubmluZy5cblx0ICovXG5cdHJlYWRvbmx5IGNvbnRlbnRzPzogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbTtcblxuXHQvKipcblx0ICogR28gdG8gZGlzayBieXBhc3NpbmcgYW55IGNhY2hlIG9mIHRoZSBzdG9yZWQgZmlsZSB3b3JraW5nIGNvcHkgaWYgYW55LlxuXHQgKi9cblx0cmVhZG9ubHkgZm9yY2VSZWFkRnJvbUZpbGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJZiBwcm92aWRlZCwgdGhlIHNpemUgb2YgdGhlIGZpbGUgd2lsbCBiZSBjaGVja2VkIGFnYWluc3QgdGhlIGxpbWl0c1xuXHQgKiBhbmQgYW4gZXJyb3Igd2lsbCBiZSB0aHJvd24gaWYgYW55IGxpbWl0IGlzIGV4Y2VlZGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgbGltaXRzPzogSUZpbGVSZWFkTGltaXRzO1xufVxuXG4vKipcbiAqIE1ldGFkYXRhIGFzc29jaWF0ZWQgd2l0aCBhIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSBiYWNrdXAuXG4gKi9cbmludGVyZmFjZSBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5QmFja3VwTWV0YURhdGEgZXh0ZW5kcyBJV29ya2luZ0NvcHlCYWNrdXBNZXRhIHtcblx0cmVhZG9ubHkgbXRpbWU6IG51bWJlcjtcblx0cmVhZG9ubHkgY3RpbWU6IG51bWJlcjtcblx0cmVhZG9ubHkgc2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBldGFnOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9ycGhhbmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQgZXh0ZW5kcyBJV29ya2luZ0NvcHlTYXZlRXZlbnQge1xuXG5cdC8qKlxuXHQgKiBUaGUgcmVzb2x2ZWQgc3RhdCBmcm9tIHRoZSBzYXZlIG9wZXJhdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IHN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50KGU6IElXb3JraW5nQ29weVNhdmVFdmVudCk6IGUgaXMgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGUgYXMgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudDtcblxuXHRyZXR1cm4gISFjYW5kaWRhdGUuc3RhdDtcbn1cblxuZXhwb3J0IGNsYXNzIFN0b3JlZEZpbGVXb3JraW5nQ29weTxNIGV4dGVuZHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiBleHRlbmRzIFJlc291cmNlV29ya2luZ0NvcHkgaW1wbGVtZW50cyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PE0+IHtcblxuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM6IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzID0gV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMuTm9uZTtcblxuXHRwcml2YXRlIF9tb2RlbDogTSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IG1vZGVsKCk6IE0gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbW9kZWw7IH1cblxuXHQvLyNyZWdpb24gZXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc29sdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXNvbHZlID0gdGhpcy5fb25EaWRSZXNvbHZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGlydHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eSA9IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlRXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTYXZlRXJyb3IgPSB0aGlzLl9vbkRpZFNhdmVFcnJvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNhdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTYXZlID0gdGhpcy5fb25EaWRTYXZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmV2ZXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmV2ZXJ0ID0gdGhpcy5fb25EaWRSZXZlcnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlYWRvbmx5ID0gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB0eXBlSWQ6IHN0cmluZyxcblx0XHRyZXNvdXJjZTogVVJJLFxuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsRmFjdG9yeTogSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeTxNPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVybmFsUmVzb2x2ZXI6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlcixcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlGaWxlU2VydmljZTogSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weUJhY2t1cFNlcnZpY2U6IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2Ugd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlOiBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWxldmF0ZWRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVsZXZhdGVkRmlsZVNlcnZpY2U6IElFbGV2YXRlZEZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHJlc291cmNlLCBmaWxlU2VydmljZSk7XG5cblx0XHQvLyBNYWtlIGtub3duIHRvIHdvcmtpbmcgY29weSBzZXJ2aWNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIod29ya2luZ0NvcHlTZXJ2aWNlLnJlZ2lzdGVyV29ya2luZ0NvcHkodGhpcykpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VSZWFkb25seSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmZpcmUoKSkpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIERpcnR5XG5cblx0cHJpdmF0ZSBkaXJ0eSA9IGZhbHNlO1xuXHRwcml2YXRlIHNhdmVkVmVyc2lvbklkOiB1bmtub3duO1xuXG5cdGlzRGlydHkoKTogdGhpcyBpcyBJUmVzb2x2ZWRTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4ge1xuXHRcdHJldHVybiB0aGlzLmRpcnR5O1xuXHR9XG5cblx0bWFya01vZGlmaWVkKCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0RGlydHkodHJ1ZSk7IC8vIHN0b3JlZCBmaWxlIHdvcmtpbmcgY29weSB0cmFja3MgbW9kaWZpZWQgdmlhIGRpcnR5XG5cdH1cblxuXHRwcml2YXRlIHNldERpcnR5KGRpcnR5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IHJlc29sdmVkIHdvcmtpbmcgY29waWVzIGNhbiBiZSBtYXJrZWQgZGlydHlcblx0XHR9XG5cblx0XHQvLyBUcmFjayBkaXJ0eSBzdGF0ZSBhbmQgdmVyc2lvbiBpZFxuXHRcdGNvbnN0IHdhc0RpcnR5ID0gdGhpcy5kaXJ0eTtcblx0XHR0aGlzLmRvU2V0RGlydHkoZGlydHkpO1xuXG5cdFx0Ly8gRW1pdCBhcyBFdmVudCBpZiBkaXJ0eSBjaGFuZ2VkXG5cdFx0aWYgKGRpcnR5ICE9PSB3YXNEaXJ0eSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1NldERpcnR5KGRpcnR5OiBib29sZWFuKTogKCkgPT4gdm9pZCB7XG5cdFx0Y29uc3Qgd2FzRGlydHkgPSB0aGlzLmRpcnR5O1xuXHRcdGNvbnN0IHdhc0luQ29uZmxpY3RNb2RlID0gdGhpcy5pbkNvbmZsaWN0TW9kZTtcblx0XHRjb25zdCB3YXNJbkVycm9yTW9kZSA9IHRoaXMuaW5FcnJvck1vZGU7XG5cdFx0Y29uc3Qgb2xkU2F2ZWRWZXJzaW9uSWQgPSB0aGlzLnNhdmVkVmVyc2lvbklkO1xuXG5cdFx0aWYgKCFkaXJ0eSkge1xuXHRcdFx0dGhpcy5kaXJ0eSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5pbkNvbmZsaWN0TW9kZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5pbkVycm9yTW9kZSA9IGZhbHNlO1xuXG5cdFx0XHQvLyB3ZSByZW1lbWJlciB0aGUgbW9kZWxzIGFsdGVybmF0ZSB2ZXJzaW9uIGlkIHRvIHJlbWVtYmVyIHdoZW4gdGhlIHZlcnNpb25cblx0XHRcdC8vIG9mIHRoZSBtb2RlbCBtYXRjaGVzIHdpdGggdGhlIHNhdmVkIHZlcnNpb24gb24gZGlzay4gd2UgbmVlZCB0byBrZWVwIHRoaXNcblx0XHRcdC8vIGluIG9yZGVyIHRvIGZpbmQgb3V0IGlmIHRoZSBtb2RlbCBjaGFuZ2VkIGJhY2sgdG8gYSBzYXZlZCB2ZXJzaW9uIChlLmcuXG5cdFx0XHQvLyB3aGVuIHVuZG9pbmcgbG9uZyBlbm91Z2ggdG8gcmVhY2ggdG8gYSB2ZXJzaW9uIHRoYXQgaXMgc2F2ZWQgYW5kIHRoZW4gdG9cblx0XHRcdC8vIGNsZWFyIHRoZSBkaXJ0eSBmbGFnKVxuXHRcdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRcdHRoaXMuc2F2ZWRWZXJzaW9uSWQgPSB0aGlzLm1vZGVsLnZlcnNpb25JZDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaXJ0eSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGZ1bmN0aW9uIHRvIHJldmVydCB0aGlzIGNhbGxcblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0dGhpcy5kaXJ0eSA9IHdhc0RpcnR5O1xuXHRcdFx0dGhpcy5pbkNvbmZsaWN0TW9kZSA9IHdhc0luQ29uZmxpY3RNb2RlO1xuXHRcdFx0dGhpcy5pbkVycm9yTW9kZSA9IHdhc0luRXJyb3JNb2RlO1xuXHRcdFx0dGhpcy5zYXZlZFZlcnNpb25JZCA9IG9sZFNhdmVkVmVyc2lvbklkO1xuXHRcdH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUmVzb2x2ZVxuXG5cdGxhc3RSZXNvbHZlZEZpbGVTdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEgfCB1bmRlZmluZWQ7IC8vICEhISBETyBOT1QgTUFSSyBQUklWQVRFISBVU0VEIElOIFRFU1RTICEhIVxuXG5cdGlzUmVzb2x2ZWQoKTogdGhpcyBpcyBJUmVzb2x2ZWRTdG9yZWRGaWxlV29ya2luZ0NvcHk8TT4ge1xuXHRcdHJldHVybiAhIXRoaXMubW9kZWw7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlKG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlKCkgLSBlbnRlcicpO1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHdlIGFyZSBkaXNwb3NlZFxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0dGhpcy50cmFjZSgncmVzb2x2ZSgpIC0gZXhpdCAtIHdpdGhvdXQgcmVzb2x2aW5nIGJlY2F1c2UgZmlsZSB3b3JraW5nIGNvcHkgaXMgZGlzcG9zZWQnKTtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVubGVzcyB0aGVyZSBhcmUgZXhwbGljaXQgY29udGVudHMgcHJvdmlkZWQsIGl0IGlzIGltcG9ydGFudCB0aGF0IHdlIGRvIG5vdFxuXHRcdC8vIHJlc29sdmUgYSB3b3JraW5nIGNvcHkgdGhhdCBpcyBkaXJ0eSBvciBpcyBpbiB0aGUgcHJvY2VzcyBvZiBzYXZpbmcgdG8gcHJldmVudFxuXHRcdC8vIGRhdGEgbG9zcy5cblx0XHRpZiAoIW9wdGlvbnM/LmNvbnRlbnRzICYmICh0aGlzLmRpcnR5IHx8IHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLmlzUnVubmluZygpKSkge1xuXHRcdFx0dGhpcy50cmFjZSgncmVzb2x2ZSgpIC0gZXhpdCAtIHdpdGhvdXQgcmVzb2x2aW5nIGJlY2F1c2UgZmlsZSB3b3JraW5nIGNvcHkgaXMgZGlydHkgb3IgYmVpbmcgc2F2ZWQnKTtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvUmVzb2x2ZShvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlKG9wdGlvbnM/OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5UmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEZpcnN0IGNoZWNrIGlmIHdlIGhhdmUgY29udGVudHMgdG8gdXNlIGZvciB0aGUgd29ya2luZyBjb3B5XG5cdFx0aWYgKG9wdGlvbnM/LmNvbnRlbnRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRnJvbUJ1ZmZlcihvcHRpb25zLmNvbnRlbnRzKTtcblx0XHR9XG5cblx0XHQvLyBTZWNvbmQsIGNoZWNrIGlmIHdlIGhhdmUgYSBiYWNrdXAgdG8gcmVzb2x2ZSBmcm9tIChvbmx5IGZvciBuZXcgd29ya2luZyBjb3BpZXMpXG5cdFx0Y29uc3QgaXNOZXcgPSAhdGhpcy5pc1Jlc29sdmVkKCk7XG5cdFx0aWYgKGlzTmV3KSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZEZyb21CYWNrdXAgPSBhd2FpdCB0aGlzLnJlc29sdmVGcm9tQmFja3VwKCk7XG5cdFx0XHRpZiAocmVzb2x2ZWRGcm9tQmFja3VwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaW5hbGx5LCByZXNvbHZlIGZyb20gZmlsZSByZXNvdXJjZVxuXHRcdHJldHVybiB0aGlzLnJlc29sdmVGcm9tRmlsZShvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUZyb21CdWZmZXIoYnVmZmVyOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgncmVzb2x2ZUZyb21CdWZmZXIoKScpO1xuXG5cdFx0Ly8gVHJ5IHRvIHJlc29sdmUgbWV0ZGF0YSBmcm9tIGRpc2tcblx0XHRsZXQgbXRpbWU6IG51bWJlcjtcblx0XHRsZXQgY3RpbWU6IG51bWJlcjtcblx0XHRsZXQgc2l6ZTogbnVtYmVyO1xuXHRcdGxldCBldGFnOiBzdHJpbmc7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHRoaXMucmVzb3VyY2UpO1xuXHRcdFx0bXRpbWUgPSBtZXRhZGF0YS5tdGltZTtcblx0XHRcdGN0aW1lID0gbWV0YWRhdGEuY3RpbWU7XG5cdFx0XHRzaXplID0gbWV0YWRhdGEuc2l6ZTtcblx0XHRcdGV0YWcgPSBtZXRhZGF0YS5ldGFnO1xuXG5cdFx0XHQvLyBDbGVhciBvcnBoYW5lZCBzdGF0ZSB3aGVuIHJlc29sdmluZyB3YXMgc3VjY2Vzc2Z1bFxuXHRcdFx0dGhpcy5zZXRPcnBoYW5lZChmYWxzZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0Ly8gUHV0IHNvbWUgZmFsbGJhY2sgdmFsdWVzIGluIGVycm9yIGNhc2Vcblx0XHRcdG10aW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdGN0aW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdHNpemUgPSAwO1xuXHRcdFx0ZXRhZyA9IEVUQUdfRElTQUJMRUQ7XG5cblx0XHRcdC8vIEFwcGx5IG9ycGhhbmVkIHN0YXRlIGJhc2VkIG9uIGVycm9yIGNvZGVcblx0XHRcdHRoaXMuc2V0T3JwaGFuZWQoZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB3aXRoIGJ1ZmZlclxuXHRcdHJldHVybiB0aGlzLnJlc29sdmVGcm9tQ29udGVudCh7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXNvdXJjZSxcblx0XHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRcdG10aW1lLFxuXHRcdFx0Y3RpbWUsXG5cdFx0XHRzaXplLFxuXHRcdFx0ZXRhZyxcblx0XHRcdHZhbHVlOiBidWZmZXIsXG5cdFx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdFx0ZXhlY3V0YWJsZTogZmFsc2Vcblx0XHR9LCB0cnVlIC8qIGRpcnR5IChyZXNvbHZlZCBmcm9tIGJ1ZmZlcikgKi8pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlRnJvbUJhY2t1cCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIFJlc29sdmUgYmFja3VwIGlmIGFueVxuXHRcdGNvbnN0IGJhY2t1cCA9IGF3YWl0IHRoaXMud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLnJlc29sdmU8SVN0b3JlZEZpbGVXb3JraW5nQ29weUJhY2t1cE1ldGFEYXRhPih0aGlzKTtcblxuXHRcdC8vIEFib3J0IGlmIHNvbWVvbmUgZWxzZSBtYW5hZ2VkIHRvIHJlc29sdmUgdGhlIHdvcmtpbmcgY29weSBieSBub3dcblx0XHRjb25zdCBpc05ldyA9ICF0aGlzLmlzUmVzb2x2ZWQoKTtcblx0XHRpZiAoIWlzTmV3KSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUJhY2t1cCgpIC0gZXhpdCAtIHdpdGhvdXRyZXNvbHZpbmcgYmVjYXVzZSBwcmV2aW91c2x5IG5ldyBmaWxlIHdvcmtpbmcgY29weSBnb3QgY3JlYXRlZCBtZWFud2hpbGUnKTtcblxuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGltcGx5IHRoYXQgcmVzb2x2aW5nIGhhcyBoYXBwZW5lZCBpbiBhbm90aGVyIG9wZXJhdGlvblxuXHRcdH1cblxuXHRcdC8vIFRyeSB0byByZXNvbHZlIGZyb20gYmFja3VwIGlmIHdlIGhhdmUgYW55XG5cdFx0aWYgKGJhY2t1cCkge1xuXHRcdFx0YXdhaXQgdGhpcy5kb1Jlc29sdmVGcm9tQmFja3VwKGJhY2t1cCk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBzaWduYWwgYmFjayB0aGF0IHJlc29sdmluZyBkaWQgbm90IGhhcHBlblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlRnJvbUJhY2t1cChiYWNrdXA6IElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwPElTdG9yZWRGaWxlV29ya2luZ0NvcHlCYWNrdXBNZXRhRGF0YT4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdkb1Jlc29sdmVGcm9tQmFja3VwKCknKTtcblxuXHRcdC8vIFJlc29sdmUgd2l0aCBiYWNrdXBcblx0XHRhd2FpdCB0aGlzLnJlc29sdmVGcm9tQ29udGVudCh7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXNvdXJjZSxcblx0XHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRcdG10aW1lOiBiYWNrdXAubWV0YSA/IGJhY2t1cC5tZXRhLm10aW1lIDogRGF0ZS5ub3coKSxcblx0XHRcdGN0aW1lOiBiYWNrdXAubWV0YSA/IGJhY2t1cC5tZXRhLmN0aW1lIDogRGF0ZS5ub3coKSxcblx0XHRcdHNpemU6IGJhY2t1cC5tZXRhID8gYmFja3VwLm1ldGEuc2l6ZSA6IDAsXG5cdFx0XHRldGFnOiBiYWNrdXAubWV0YSA/IGJhY2t1cC5tZXRhLmV0YWcgOiBFVEFHX0RJU0FCTEVELCAvLyBldGFnIGRpc2FibGVkIGlmIHVua25vd24hXG5cdFx0XHR2YWx1ZTogYmFja3VwLnZhbHVlLFxuXHRcdFx0cmVhZG9ubHk6IGZhbHNlLFxuXHRcdFx0bG9ja2VkOiBmYWxzZSxcblx0XHRcdGV4ZWN1dGFibGU6IGZhbHNlXG5cdFx0fSwgdHJ1ZSAvKiBkaXJ0eSAocmVzb2x2ZWQgZnJvbSBiYWNrdXApICovKTtcblxuXHRcdC8vIFJlc3RvcmUgb3JwaGFuZWQgZmxhZyBiYXNlZCBvbiBzdGF0ZVxuXHRcdGlmIChiYWNrdXAubWV0YT8ub3JwaGFuZWQpIHtcblx0XHRcdHRoaXMuc2V0T3JwaGFuZWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlRnJvbUZpbGUob3B0aW9ucz86IElTdG9yZWRGaWxlV29ya2luZ0NvcHlSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ3Jlc29sdmVGcm9tRmlsZSgpJyk7XG5cblx0XHRjb25zdCBmb3JjZVJlYWRGcm9tRmlsZSA9IG9wdGlvbnM/LmZvcmNlUmVhZEZyb21GaWxlO1xuXG5cdFx0Ly8gRGVjaWRlIG9uIGV0YWdcblx0XHRsZXQgZXRhZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChmb3JjZVJlYWRGcm9tRmlsZSkge1xuXHRcdFx0ZXRhZyA9IEVUQUdfRElTQUJMRUQ7IC8vIGRpc2FibGUgRVRhZyBpZiB3ZSBlbmZvcmNlIHRvIHJlYWQgZnJvbSBkaXNrXG5cdFx0fSBlbHNlIGlmICh0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0KSB7XG5cdFx0XHRldGFnID0gdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdC5ldGFnOyAvLyBvdGhlcndpc2UgcmVzcGVjdCBldGFnIHRvIHN1cHBvcnQgY2FjaGluZ1xuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyIGN1cnJlbnQgdmVyc2lvbiBiZWZvcmUgZG9pbmcgYW55IGxvbmcgcnVubmluZyBvcGVyYXRpb25cblx0XHQvLyB0byBlbnN1cmUgd2UgYXJlIG5vdCBjaGFuZ2luZyBhIHdvcmtpbmcgY29weSB0aGF0IHdhcyBjaGFuZ2VkXG5cdFx0Ly8gbWVhbndoaWxlXG5cdFx0Y29uc3QgY3VycmVudFZlcnNpb25JZCA9IHRoaXMudmVyc2lvbklkO1xuXG5cdFx0Ly8gUmVzb2x2ZSBDb250ZW50XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKHRoaXMucmVzb3VyY2UsIHtcblx0XHRcdFx0ZXRhZyxcblx0XHRcdFx0bGltaXRzOiBvcHRpb25zPy5saW1pdHNcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBDbGVhciBvcnBoYW5lZCBzdGF0ZSB3aGVuIHJlc29sdmluZyB3YXMgc3VjY2Vzc2Z1bFxuXHRcdFx0dGhpcy5zZXRPcnBoYW5lZChmYWxzZSk7XG5cblx0XHRcdC8vIFJldHVybiBlYXJseSBpZiB0aGUgd29ya2luZyBjb3B5IGNvbnRlbnQgaGFzIGNoYW5nZWRcblx0XHRcdC8vIG1lYW53aGlsZSB0byBwcmV2ZW50IGxvb3NpbmcgYW55IGNoYW5nZXNcblx0XHRcdGlmIChjdXJyZW50VmVyc2lvbklkICE9PSB0aGlzLnZlcnNpb25JZCkge1xuXHRcdFx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUZpbGUoKSAtIGV4aXQgLSB3aXRob3V0IHJlc29sdmluZyBiZWNhdXNlIGZpbGUgd29ya2luZyBjb3B5IGNvbnRlbnQgY2hhbmdlZCcpO1xuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5yZXNvbHZlRnJvbUNvbnRlbnQoY29udGVudCwgZmFsc2UgLyogbm90IGRpcnR5IChyZXNvbHZlZCBmcm9tIGZpbGUpICovKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdDtcblxuXHRcdFx0Ly8gQXBwbHkgb3JwaGFuZWQgc3RhdGUgYmFzZWQgb24gZXJyb3IgY29kZVxuXHRcdFx0dGhpcy5zZXRPcnBoYW5lZChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXG5cdFx0XHQvLyBOb3RNb2RpZmllZCBzdGF0dXMgaXMgZXhwZWN0ZWQgYW5kIGNhbiBiZSBoYW5kbGVkIGdyYWNlZnVsbHlcblx0XHRcdC8vIGlmIHdlIGFyZSByZXNvbHZlZC4gV2Ugc3RpbGwgd2FudCB0byB1cGRhdGUgb3VyIGxhc3QgcmVzb2x2ZWRcblx0XHRcdC8vIHN0YXQgdG8gZS5nLiBkZXRlY3QgY2hhbmdlcyB0byB0aGUgZmlsZSdzIHJlYWRvbmx5IHN0YXRlXG5cdFx0XHRpZiAodGhpcy5pc1Jlc29sdmVkKCkgJiYgcmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX01PRElGSUVEX1NJTkNFKSB7XG5cdFx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUxhc3RSZXNvbHZlZEZpbGVTdGF0KGVycm9yLnN0YXQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVbmxlc3Mgd2UgYXJlIGZvcmNlZCB0byByZWFkIGZyb20gdGhlIGZpbGUsIGlnbm9yZSB3aGVuIGEgd29ya2luZyBjb3B5IGhhc1xuXHRcdFx0Ly8gYmVlbiByZXNvbHZlZCBvbmNlIGFuZCB0aGUgZmlsZSB3YXMgZGVsZXRlZCBtZWFud2hpbGUuIFNpbmNlIHdlIGFscmVhZHkgaGF2ZVxuXHRcdFx0Ly8gdGhlIHdvcmtpbmcgY29weSByZXNvbHZlZCwgd2UgY2FuIHJldHVybiB0byB0aGlzIHN0YXRlIGFuZCB1cGRhdGUgdGhlIG9ycGhhbmVkXG5cdFx0XHQvLyBmbGFnIHRvIGluZGljYXRlIHRoYXQgdGhpcyB3b3JraW5nIGNvcHkgaGFzIG5vIHZlcnNpb24gb24gZGlzayBhbnltb3JlLlxuXHRcdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpICYmIHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCAmJiAhZm9yY2VSZWFkRnJvbUZpbGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UgYnViYmxlIHVwIHRoZSBlcnJvclxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlRnJvbUNvbnRlbnQoY29udGVudDogSUZpbGVTdHJlYW1Db250ZW50LCBkaXJ0eTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ3Jlc29sdmVGcm9tQ29udGVudCgpIC0gZW50ZXInKTtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB3ZSBhcmUgZGlzcG9zZWRcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3Jlc29sdmVGcm9tQ29udGVudCgpIC0gZXhpdCAtIGJlY2F1c2Ugd29ya2luZyBjb3B5IGlzIGRpc3Bvc2VkJyk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgb3VyIHJlc29sdmVkIGRpc2sgc3RhdFxuXHRcdHRoaXMudXBkYXRlTGFzdFJlc29sdmVkRmlsZVN0YXQoe1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiBjb250ZW50Lm5hbWUsXG5cdFx0XHRtdGltZTogY29udGVudC5tdGltZSxcblx0XHRcdGN0aW1lOiBjb250ZW50LmN0aW1lLFxuXHRcdFx0c2l6ZTogY29udGVudC5zaXplLFxuXHRcdFx0ZXRhZzogY29udGVudC5ldGFnLFxuXHRcdFx0cmVhZG9ubHk6IGNvbnRlbnQucmVhZG9ubHksXG5cdFx0XHRsb2NrZWQ6IGNvbnRlbnQubG9ja2VkLFxuXHRcdFx0ZXhlY3V0YWJsZTogZmFsc2UsXG5cdFx0XHRpc0ZpbGU6IHRydWUsXG5cdFx0XHRpc0RpcmVjdG9yeTogZmFsc2UsXG5cdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRjaGlsZHJlbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHQvLyBVcGRhdGUgZXhpc3RpbmcgbW9kZWwgaWYgd2UgaGFkIGJlZW4gcmVzb2x2ZWRcblx0XHRpZiAodGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9VcGRhdGVNb2RlbChjb250ZW50LnZhbHVlKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgbmV3IG1vZGVsIG90aGVyd2lzZVxuXHRcdGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5kb0NyZWF0ZU1vZGVsKGNvbnRlbnQudmFsdWUpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB3b3JraW5nIGNvcHkgZGlydHkgZmxhZy4gVGhpcyBpcyB2ZXJ5IGltcG9ydGFudCB0byBjYWxsXG5cdFx0Ly8gaW4gYm90aCBjYXNlcyBvZiBkaXJ0eSBvciBub3QgYmVjYXVzZSBpdCBjb25kaXRpb25hbGx5IHVwZGF0ZXNcblx0XHQvLyB0aGUgYHNhdmVkVmVyc2lvbklkYCB0byBkZXRlcm1pbmUgdGhlIHZlcnNpb24gd2hlbiB0byBjb25zaWRlclxuXHRcdC8vIHRoZSB3b3JraW5nIGNvcHkgYXMgc2F2ZWQgYWdhaW4gKGUuZy4gd2hlbiB1bmRvaW5nIGJhY2sgdG8gdGhlXG5cdFx0Ly8gc2F2ZWQgc3RhdGUpXG5cdFx0dGhpcy5zZXREaXJ0eSghIWRpcnR5KTtcblxuXHRcdC8vIEVtaXQgYXMgZXZlbnRcblx0XHR0aGlzLl9vbkRpZFJlc29sdmUuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0NyZWF0ZU1vZGVsKGNvbnRlbnRzOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgnZG9DcmVhdGVNb2RlbCgpJyk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWwgYW5kIGRpc3Bvc2UgaXQgd2hlbiB3ZSBnZXQgZGlzcG9zZWRcblx0XHR0aGlzLl9tb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKGF3YWl0IHRoaXMubW9kZWxGYWN0b3J5LmNyZWF0ZU1vZGVsKHRoaXMucmVzb3VyY2UsIGNvbnRlbnRzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cblx0XHQvLyBNb2RlbCBsaXN0ZW5lcnNcblx0XHR0aGlzLmluc3RhbGxNb2RlbExpc3RlbmVycyh0aGlzLl9tb2RlbCk7XG5cdH1cblxuXHRwcml2YXRlIGlnbm9yZURpcnR5T25Nb2RlbENvbnRlbnRDaGFuZ2UgPSBmYWxzZTtcblxuXHRwcml2YXRlIGFzeW5jIGRvVXBkYXRlTW9kZWwoY29udGVudHM6IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdkb1VwZGF0ZU1vZGVsKCknKTtcblxuXHRcdC8vIFVwZGF0ZSBtb2RlbCB2YWx1ZSBpbiBhIGJsb2NrIHRoYXQgaWdub3JlcyBjb250ZW50IGNoYW5nZSBldmVudHMgZm9yIGRpcnR5IHRyYWNraW5nXG5cdFx0dGhpcy5pZ25vcmVEaXJ0eU9uTW9kZWxDb250ZW50Q2hhbmdlID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5tb2RlbD8udXBkYXRlKGNvbnRlbnRzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5pZ25vcmVEaXJ0eU9uTW9kZWxDb250ZW50Q2hhbmdlID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbnN0YWxsTW9kZWxMaXN0ZW5lcnMobW9kZWw6IE0pOiB2b2lkIHtcblxuXHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzAxODlcblx0XHQvLyBUaGlzIGNvZGUgaGFzIGJlZW4gZXh0cmFjdGVkIHRvIGEgZGlmZmVyZW50IG1ldGhvZCBiZWNhdXNlIGl0IGNhdXNlZCBhIG1lbW9yeSBsZWFrXG5cdFx0Ly8gd2hlcmUgYHZhbHVlYCB3YXMgY2FwdHVyZWQgaW4gdGhlIGNvbnRlbnQgY2hhbmdlIGxpc3RlbmVyIGNsb3N1cmUgc2NvcGUuXG5cblx0XHQvLyBDb250ZW50IENoYW5nZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudChlID0+IHRoaXMub25Nb2RlbENvbnRlbnRDaGFuZ2VkKG1vZGVsLCBlLmlzVW5kb2luZyB8fCBlLmlzUmVkb2luZykpKTtcblxuXHRcdC8vIExpZmVjeWNsZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4gdGhpcy5kaXNwb3NlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25Nb2RlbENvbnRlbnRDaGFuZ2VkKG1vZGVsOiBNLCBpc1VuZG9pbmdPclJlZG9pbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNlKGBvbk1vZGVsQ29udGVudENoYW5nZWQoKSAtIGVudGVyYCk7XG5cblx0XHQvLyBJbiBhbnkgY2FzZSBpbmNyZW1lbnQgdGhlIHZlcnNpb24gaWQgYmVjYXVzZSBpdCB0cmFja3MgdGhlIGNvbnRlbnQgc3RhdGUgb2YgdGhlIG1vZGVsIGF0IGFsbCB0aW1lc1xuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cdFx0dGhpcy50cmFjZShgb25Nb2RlbENvbnRlbnRDaGFuZ2VkKCkgLSBuZXcgdmVyc2lvbklkICR7dGhpcy52ZXJzaW9uSWR9YCk7XG5cblx0XHQvLyBSZW1lbWJlciB3aGVuIHRoZSB1c2VyIGNoYW5nZWQgdGhlIG1vZGVsIHRocm91Z2ggYSB1bmRvL3JlZG8gb3BlcmF0aW9uLlxuXHRcdC8vIFdlIG5lZWQgdGhpcyBpbmZvcm1hdGlvbiB0byB0aHJvdHRsZSBzYXZlIHBhcnRpY2lwYW50cyB0byBmaXhcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTAyNTQyXG5cdFx0aWYgKGlzVW5kb2luZ09yUmVkb2luZykge1xuXHRcdFx0dGhpcy5sYXN0Q29udGVudENoYW5nZUZyb21VbmRvUmVkbyA9IERhdGUubm93KCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgbWFyayBjaGVjayBmb3IgYSBkaXJ0eS1zdGF0ZSBjaGFuZ2UgdXBvbiBtb2RlbCBjb250ZW50IGNoYW5nZSwgdW5sZXNzOlxuXHRcdC8vIC0gZXhwbGljaXRseSBpbnN0cnVjdGVkIHRvIGlnbm9yZSBpdCAoZS5nLiBmcm9tIG1vZGVsLnJlc29sdmUoKSlcblx0XHQvLyAtIHRoZSBtb2RlbCBpcyByZWFkb25seSAoaW4gdGhhdCBjYXNlIHdlIG5ldmVyIGFzc3VtZSB0aGUgY2hhbmdlIHdhcyBkb25lIGJ5IHRoZSB1c2VyKVxuXHRcdGlmICghdGhpcy5pZ25vcmVEaXJ0eU9uTW9kZWxDb250ZW50Q2hhbmdlICYmICF0aGlzLmlzUmVhZG9ubHkoKSkge1xuXG5cdFx0XHQvLyBUaGUgY29udGVudHMgY2hhbmdlZCBhcyBhIG1hdHRlciBvZiBVbmRvIGFuZCB0aGUgdmVyc2lvbiByZWFjaGVkIG1hdGNoZXMgdGhlIHNhdmVkIG9uZVxuXHRcdFx0Ly8gSW4gdGhpcyBjYXNlIHdlIGNsZWFyIHRoZSBkaXJ0eSBmbGFnIGFuZCBlbWl0IGEgU0FWRUQgZXZlbnQgdG8gaW5kaWNhdGUgdGhpcyBzdGF0ZS5cblx0XHRcdGlmIChtb2RlbC52ZXJzaW9uSWQgPT09IHRoaXMuc2F2ZWRWZXJzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy50cmFjZSgnb25Nb2RlbENvbnRlbnRDaGFuZ2VkKCkgLSBtb2RlbCBjb250ZW50IGNoYW5nZWQgYmFjayB0byBsYXN0IHNhdmVkIHZlcnNpb24nKTtcblxuXHRcdFx0XHQvLyBDbGVhciBmbGFnc1xuXHRcdFx0XHRjb25zdCB3YXNEaXJ0eSA9IHRoaXMuZGlydHk7XG5cdFx0XHRcdHRoaXMuc2V0RGlydHkoZmFsc2UpO1xuXG5cdFx0XHRcdC8vIEVtaXQgcmV2ZXJ0IGV2ZW50IGlmIHdlIHdlcmUgZGlydHlcblx0XHRcdFx0aWYgKHdhc0RpcnR5KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXZlcnQuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE90aGVyd2lzZSB0aGUgY29udGVudCBoYXMgY2hhbmdlZCBhbmQgd2Ugc2lnbmFsIHRoaXMgYXMgYmVjb21pbmcgZGlydHlcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyYWNlKCdvbk1vZGVsQ29udGVudENoYW5nZWQoKSAtIG1vZGVsIGNvbnRlbnQgY2hhbmdlZCBhbmQgbWFya2VkIGFzIGRpcnR5Jyk7XG5cblx0XHRcdFx0Ly8gTWFyayBhcyBkaXJ0eVxuXHRcdFx0XHR0aGlzLnNldERpcnR5KHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEVtaXQgYXMgZXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmb3JjZVJlc29sdmVGcm9tRmlsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGVhcmx5IHdoZW4gdGhlIHdvcmtpbmcgY29weSBpcyBpbnZhbGlkXG5cdFx0fVxuXG5cdFx0Ly8gV2UgZ28gdGhyb3VnaCB0aGUgcmVzb2x2ZXIgdG8gbWFrZVxuXHRcdC8vIHN1cmUgdGhpcyBraW5kIG9mIGByZXNvbHZlYCBpcyBwcm9wZXJseVxuXHRcdC8vIHJ1bm5pbmcgaW4gc2VxdWVuY2Ugd2l0aCBhbnkgb3RoZXIgcnVubmluZ1xuXHRcdC8vIGByZXNvbHZlYCBpZiBhbnksIGluY2x1ZGluZyBzdWJzZXF1ZW50IHJ1bnNcblx0XHQvLyB0aGF0IGFyZSB0cmlnZ2VyZWQgcmlnaHQgYWZ0ZXIuXG5cblx0XHRhd2FpdCB0aGlzLmV4dGVybmFsUmVzb2x2ZXIoe1xuXHRcdFx0Zm9yY2VSZWFkRnJvbUZpbGU6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBCYWNrdXBcblxuXHRnZXQgYmFja3VwRGVsYXkoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbD8uY29uZmlndXJhdGlvbj8uYmFja3VwRGVsYXk7XG5cdH1cblxuXHRhc3luYyBiYWNrdXAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJV29ya2luZ0NvcHlCYWNrdXA+IHtcblxuXHRcdC8vIEZpbGwgaW4gbWV0YWRhdGEgaWYgd2UgYXJlIHJlc29sdmVkXG5cdFx0bGV0IG1ldGE6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlCYWNrdXBNZXRhRGF0YSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCkge1xuXHRcdFx0bWV0YSA9IHtcblx0XHRcdFx0bXRpbWU6IHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQubXRpbWUsXG5cdFx0XHRcdGN0aW1lOiB0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0LmN0aW1lLFxuXHRcdFx0XHRzaXplOiB0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0LnNpemUsXG5cdFx0XHRcdGV0YWc6IHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQuZXRhZyxcblx0XHRcdFx0b3JwaGFuZWQ6IHRoaXMuaXNPcnBoYW5lZCgpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEZpbGwgaW4gY29udGVudCBpZiB3ZSBhcmUgcmVzb2x2ZWRcblx0XHRsZXQgY29udGVudDogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdGNvbnRlbnQgPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKHRoaXMubW9kZWwuc25hcHNob3QoU25hcHNob3RDb250ZXh0LkJhY2t1cCwgdG9rZW4pLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgbWV0YSwgY29udGVudCB9O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFNhdmVcblxuXHRwcml2YXRlIHZlcnNpb25JZCA9IDA7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVU5ET19SRURPX1NBVkVfUEFSVElDSVBBTlRTX0FVVE9fU0FWRV9USFJPVFRMRV9USFJFU0hPTEQgPSA1MDA7XG5cdHByaXZhdGUgbGFzdENvbnRlbnRDaGFuZ2VGcm9tVW5kb1JlZG86IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNhdmVTZXF1ZW50aWFsaXplciA9IG5ldyBUYXNrU2VxdWVudGlhbGl6ZXIoKTtcblxuXHRwcml2YXRlIGlnbm9yZVNhdmVGcm9tU2F2ZVBhcnRpY2lwYW50cyA9IGZhbHNlO1xuXG5cdGFzeW5jIHNhdmUob3B0aW9uczogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVBc09wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzUmVhZG9ubHkoKSkge1xuXHRcdFx0dGhpcy50cmFjZSgnc2F2ZSgpIC0gaWdub3JpbmcgcmVxdWVzdCBmb3IgcmVhZG9ubHkgcmVzb3VyY2UnKTtcblxuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBpZiB3b3JraW5nIGNvcHkgaXMgcmVhZG9ubHkgd2UgZG8gbm90IGF0dGVtcHQgdG8gc2F2ZSBhdCBhbGxcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHQodGhpcy5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5DT05GTElDVCkgfHwgdGhpcy5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5FUlJPUikpICYmXG5cdFx0XHQob3B0aW9ucy5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTyB8fCBvcHRpb25zLnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5GT0NVU19DSEFOR0UgfHwgb3B0aW9ucy5yZWFzb24gPT09IFNhdmVSZWFzb24uV0lORE9XX0NIQU5HRSlcblx0XHQpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3NhdmUoKSAtIGlnbm9yaW5nIGF1dG8gc2F2ZSByZXF1ZXN0IGZvciBmaWxlIHdvcmtpbmcgY29weSB0aGF0IGlzIGluIGNvbmZsaWN0IG9yIGVycm9yJyk7XG5cblx0XHRcdHJldHVybiBmYWxzZTsgLy8gaWYgd29ya2luZyBjb3B5IGlzIGluIHNhdmUgY29uZmxpY3Qgb3IgZXJyb3IsIGRvIG5vdCBzYXZlIHVubGVzcyBzYXZlIHJlYXNvbiBpcyBleHBsaWNpdFxuXHRcdH1cblxuXHRcdC8vIEFjdHVhbGx5IGRvIHNhdmVcblx0XHR0aGlzLnRyYWNlKCdzYXZlKCkgLSBlbnRlcicpO1xuXHRcdGF3YWl0IHRoaXMuZG9TYXZlKG9wdGlvbnMpO1xuXHRcdHRoaXMudHJhY2UoJ3NhdmUoKSAtIGV4aXQnKTtcblxuXHRcdHJldHVybiB0aGlzLmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLlNBVkVEKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TYXZlKG9wdGlvbnM6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlQXNPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLnJlYXNvbiAhPT0gJ251bWJlcicpIHtcblx0XHRcdG9wdGlvbnMucmVhc29uID0gU2F2ZVJlYXNvbi5FWFBMSUNJVDtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJzaW9uSWQgPSB0aGlzLnZlcnNpb25JZDtcblx0XHR0aGlzLnRyYWNlKGBkb1NhdmUoJHt2ZXJzaW9uSWR9KSAtIGVudGVyIHdpdGggdmVyc2lvbklkICR7dmVyc2lvbklkfWApO1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHNhdmVkIGZyb20gd2l0aGluIHNhdmUgcGFydGljaXBhbnQgdG8gYnJlYWsgcmVjdXJzaW9uXG5cdFx0Ly9cblx0XHQvLyBTY2VuYXJpbzogYSBzYXZlIHBhcnRpY2lwYW50IHRyaWdnZXJzIGEgc2F2ZSgpIG9uIHRoZSB3b3JraW5nIGNvcHlcblx0XHRpZiAodGhpcy5pZ25vcmVTYXZlRnJvbVNhdmVQYXJ0aWNpcGFudHMpIHtcblx0XHRcdHRoaXMudHJhY2UoYGRvU2F2ZSgke3ZlcnNpb25JZH0pIC0gZXhpdCAtIHJlZnVzaW5nIHRvIHNhdmUoKSByZWN1cnNpdmVseSBmcm9tIHNhdmUgcGFydGljaXBhbnRgKTtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIExvb2t1cCBhbnkgcnVubmluZyBzYXZlIGZvciB0aGlzIHZlcnNpb25JZCBhbmQgcmV0dXJuIGl0IGlmIGZvdW5kXG5cdFx0Ly9cblx0XHQvLyBTY2VuYXJpbzogdXNlciBpbnZva2VkIHRoZSBzYXZlIGFjdGlvbiBtdWx0aXBsZSB0aW1lcyBxdWlja2x5IGZvciB0aGUgc2FtZSBjb250ZW50c1xuXHRcdC8vICAgICAgICAgICB3aGlsZSB0aGUgc2F2ZSB3YXMgbm90IHlldCBmaW5pc2hlZCB0byBkaXNrXG5cdFx0Ly9cblx0XHRpZiAodGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKHZlcnNpb25JZCkpIHtcblx0XHRcdHRoaXMudHJhY2UoYGRvU2F2ZSgke3ZlcnNpb25JZH0pIC0gZXhpdCAtIGZvdW5kIGEgcnVubmluZyBzYXZlIGZvciB2ZXJzaW9uSWQgJHt2ZXJzaW9uSWR9YCk7XG5cblx0XHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5ydW5uaW5nO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiBub3QgZGlydHkgKHVubGVzcyBmb3JjZWQpXG5cdFx0Ly9cblx0XHQvLyBTY2VuYXJpbzogdXNlciBpbnZva2VkIHNhdmUgYWN0aW9uIGV2ZW4gdGhvdWdoIHRoZSB3b3JraW5nIGNvcHkgaXMgbm90IGRpcnR5XG5cdFx0aWYgKCFvcHRpb25zLmZvcmNlICYmICF0aGlzLmRpcnR5KSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBkb1NhdmUoJHt2ZXJzaW9uSWR9KSAtIGV4aXQgLSBiZWNhdXNlIG5vdCBkaXJ0eSBhbmQvb3IgdmVyc2lvbklkIGlzIGRpZmZlcmVudCAodGhpcy5pc0RpcnR5OiAke3RoaXMuZGlydHl9LCB0aGlzLnZlcnNpb25JZDogJHt0aGlzLnZlcnNpb25JZH0pYCk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gaWYgY3VycmVudGx5IHNhdmluZyBieSBzdG9yaW5nIHRoaXMgc2F2ZSByZXF1ZXN0IGFzIHRoZSBuZXh0IHNhdmUgdGhhdCBzaG91bGQgaGFwcGVuLlxuXHRcdC8vIE5ldmVyIGV2ZXIgbXVzdCAyIHNhdmVzIGV4ZWN1dGUgYXQgdGhlIHNhbWUgdGltZSBiZWNhdXNlIHRoaXMgY2FuIGxlYWQgdG8gZGlydHkgd3JpdGVzIGFuZCByYWNlIGNvbmRpdGlvbnMuXG5cdFx0Ly9cblx0XHQvLyBTY2VuYXJpbyBBOiBhdXRvIHNhdmUgd2FzIHRyaWdnZXJlZCBhbmQgaXMgY3VycmVudGx5IGJ1c3kgc2F2aW5nIHRvIGRpc2suIHRoaXMgdGFrZXMgbG9uZyBlbm91Z2ggdGhhdCBhbm90aGVyIGF1dG8gc2F2ZVxuXHRcdC8vICAgICAgICAgICAgIGtpY2tzIGluLlxuXHRcdC8vIFNjZW5hcmlvIEI6IHNhdmUgaXMgdmVyeSBzbG93IChlLmcuIG5ldHdvcmsgc2hhcmUpIGFuZCB0aGUgdXNlciBtYW5hZ2VzIHRvIGNoYW5nZSB0aGUgd29ya2luZyBjb3B5IGFuZCB0cmlnZ2VyIGFub3RoZXIgc2F2ZVxuXHRcdC8vICAgICAgICAgICAgIHdoaWxlIHRoZSBmaXJzdCBzYXZlIGhhcyBub3QgcmV0dXJuZWQgeWV0LlxuXHRcdC8vXG5cdFx0aWYgKHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLmlzUnVubmluZygpKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBkb1NhdmUoJHt2ZXJzaW9uSWR9KSAtIGV4aXQgLSBiZWNhdXNlIGJ1c3kgc2F2aW5nYCk7XG5cblx0XHRcdC8vIEluZGljYXRlIHRvIHRoZSBzYXZlIHNlcXVlbnRpYWxpemVyIHRoYXQgd2Ugd2FudCB0b1xuXHRcdFx0Ly8gY2FuY2VsIHRoZSBydW5uaW5nIG9wZXJhdGlvbiBzbyB0aGF0IG91cnMgY2FuIHJ1blxuXHRcdFx0Ly8gYmVmb3JlIHRoZSBydW5uaW5nIG9uZSBmaW5pc2hlcy5cblx0XHRcdC8vIEN1cnJlbnRseSB0aGlzIHdpbGwgdHJ5IHRvIGNhbmNlbCBydW5uaW5nIHNhdmVcblx0XHRcdC8vIHBhcnRpY2lwYW50cyBhbmQgcnVubmluZyBzbmFwc2hvdHMgZnJvbSB0aGVcblx0XHRcdC8vIHNhdmUgb3BlcmF0aW9uLCBidXQgbm90IHRoZSBhY3R1YWwgc2F2ZSB3aGljaCBkb2VzXG5cdFx0XHQvLyBub3Qgc3VwcG9ydCBjYW5jZWxsYXRpb24geWV0LlxuXHRcdFx0dGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIuY2FuY2VsUnVubmluZygpO1xuXG5cdFx0XHQvLyBRdWV1ZSB0aGlzIGFzIHRoZSB1cGNvbWluZyBzYXZlIGFuZCByZXR1cm5cblx0XHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5xdWV1ZSgoKSA9PiB0aGlzLmRvU2F2ZShvcHRpb25zKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUHVzaCBhbGwgZWRpdCBvcGVyYXRpb25zIHRvIHRoZSB1bmRvIHN0YWNrIHNvIHRoYXQgdGhlIHVzZXIgaGFzIGEgY2hhbmNlIHRvXG5cdFx0Ly8gQ3RybCtaIGJhY2sgdG8gdGhlIHNhdmVkIHZlcnNpb24uXG5cdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHR0aGlzLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzYXZlQ2FuY2VsbGF0aW9uID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2F2ZVBhcnRpY2lwYW50cycsIFwiU2F2aW5nICd7MH0nXCIsIHRoaXMubmFtZSksXG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHRjYW5jZWxsYWJsZTogdHJ1ZSxcblx0XHRcdGRlbGF5OiB0aGlzLmlzRGlydHkoKSA/IDMwMDAgOiA1MDAwXG5cdFx0fSwgcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9TYXZlU2VxdWVudGlhbCh2ZXJzaW9uSWQsIG9wdGlvbnMsIHByb2dyZXNzLCBzYXZlQ2FuY2VsbGF0aW9uKTtcblx0XHR9LCAoKSA9PiB7XG5cdFx0XHRzYXZlQ2FuY2VsbGF0aW9uLmNhbmNlbCgpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0c2F2ZUNhbmNlbGxhdGlvbi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGRvU2F2ZVNlcXVlbnRpYWwodmVyc2lvbklkOiBudW1iZXIsIG9wdGlvbnM6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlQXNPcHRpb25zLCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCBzYXZlQ2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5ydW4odmVyc2lvbklkLCAoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHQvLyBBIHNhdmUgcGFydGljaXBhbnQgY2FuIHN0aWxsIGNoYW5nZSB0aGUgd29ya2luZyBjb3B5IG5vd1xuXHRcdFx0Ly8gYW5kIHNpbmNlIHdlIGFyZSBzbyBjbG9zZSB0byBzYXZpbmcgd2UgZG8gbm90IHdhbnQgdG8gdHJpZ2dlclxuXHRcdFx0Ly8gYW5vdGhlciBhdXRvIHNhdmUgb3Igc2ltaWxhciwgc28gd2UgYmxvY2sgdGhpc1xuXHRcdFx0Ly8gSW4gYWRkaXRpb24gd2UgdXBkYXRlIG91ciB2ZXJzaW9uIHJpZ2h0IGFmdGVyIGluIGNhc2UgaXQgY2hhbmdlZFxuXHRcdFx0Ly8gYmVjYXVzZSBvZiBhIHdvcmtpbmcgY29weSBjaGFuZ2Vcblx0XHRcdC8vIFNhdmUgcGFydGljaXBhbnRzIGNhbiBhbHNvIGJlIHNraXBwZWQgdGhyb3VnaCBBUEkuXG5cdFx0XHRpZiAodGhpcy5pc1Jlc29sdmVkKCkgJiYgIW9wdGlvbnMuc2tpcFNhdmVQYXJ0aWNpcGFudHMgJiYgdGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmhhc1NhdmVQYXJ0aWNpcGFudHMpIHtcblx0XHRcdFx0dHJ5IHtcblxuXHRcdFx0XHRcdC8vIE1lYXN1cmUgdGhlIHRpbWUgaXQgdG9vayBmcm9tIHRoZSBsYXN0IHVuZG8vcmVkbyBvcGVyYXRpb24gdG8gdGhpcyBzYXZlLiBJZiB0aGlzXG5cdFx0XHRcdFx0Ly8gdGltZSBpcyBiZWxvdyBgVU5ET19SRURPX1NBVkVfUEFSVElDSVBBTlRTX1RIUk9UVExFX1RIUkVTSE9MRGAsIHdlIG1ha2Ugc3VyZSB0b1xuXHRcdFx0XHRcdC8vIGRlbGF5IHRoZSBzYXZlIHBhcnRpY2lwYW50IGZvciB0aGUgcmVtYWluaW5nIHRpbWUgaWYgdGhlIHJlYXNvbiBpcyBhdXRvIHNhdmUuXG5cdFx0XHRcdFx0Ly9cblx0XHRcdFx0XHQvLyBUaGlzIGZpeGVzIHRoZSBmb2xsb3dpbmcgaXNzdWU6XG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciBoYXMgY29uZmlndXJlZCBhdXRvIHNhdmUgd2l0aCBkZWxheSBvZiAxMDBtcyBvciBzaG9ydGVyXG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciBoYXMgYSBzYXZlIHBhcnRpY2lwYW50IGVuYWJsZWQgdGhhdCBtb2RpZmllcyB0aGUgZmlsZSBvbiBlYWNoIHNhdmVcblx0XHRcdFx0XHQvLyAtIHRoZSB1c2VyIHR5cGVzIGludG8gdGhlIGZpbGUgYW5kIHRoZSBmaWxlIGdldHMgc2F2ZWRcblx0XHRcdFx0XHQvLyAtIHRoZSB1c2VyIHRyaWdnZXJzIHVuZG8gb3BlcmF0aW9uXG5cdFx0XHRcdFx0Ly8gLSB0aGlzIHdpbGwgdW5kbyB0aGUgc2F2ZSBwYXJ0aWNpcGFudCBjaGFuZ2UgYnV0IHRyaWdnZXIgdGhlIHNhdmUgcGFydGljaXBhbnQgcmlnaHQgYWZ0ZXJcblx0XHRcdFx0XHQvLyAtIHRoZSB1c2VyIGhhcyBubyBjaGFuY2UgdG8gdW5kbyBvdmVyIHRoZSBzYXZlIHBhcnRpY2lwYW50XG5cdFx0XHRcdFx0Ly9cblx0XHRcdFx0XHQvLyBSZXBvcnRlZCBhczogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwMjU0MlxuXHRcdFx0XHRcdGlmIChvcHRpb25zLnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPICYmIHR5cGVvZiB0aGlzLmxhc3RDb250ZW50Q2hhbmdlRnJvbVVuZG9SZWRvID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGltZUZyb21VbmRvUmVkb1RvU2F2ZSA9IERhdGUubm93KCkgLSB0aGlzLmxhc3RDb250ZW50Q2hhbmdlRnJvbVVuZG9SZWRvO1xuXHRcdFx0XHRcdFx0aWYgKHRpbWVGcm9tVW5kb1JlZG9Ub1NhdmUgPCBTdG9yZWRGaWxlV29ya2luZ0NvcHkuVU5ET19SRURPX1NBVkVfUEFSVElDSVBBTlRTX0FVVE9fU0FWRV9USFJPVFRMRV9USFJFU0hPTEQpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGltZW91dChTdG9yZWRGaWxlV29ya2luZ0NvcHkuVU5ET19SRURPX1NBVkVfUEFSVElDSVBBTlRTX0FVVE9fU0FWRV9USFJPVFRMRV9USFJFU0hPTEQgLSB0aW1lRnJvbVVuZG9SZWRvVG9TYXZlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSdW4gc2F2ZSBwYXJ0aWNpcGFudHMgdW5sZXNzIHNhdmUgd2FzIGNhbmNlbGxlZCBtZWFud2hpbGVcblx0XHRcdFx0XHRpZiAoIXNhdmVDYW5jZWxsYXRpb24udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuaWdub3JlU2F2ZUZyb21TYXZlUGFydGljaXBhbnRzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5ydW5TYXZlUGFydGljaXBhbnRzKHRoaXMsIHsgcmVhc29uOiBvcHRpb25zLnJlYXNvbiA/PyBTYXZlUmVhc29uLkVYUExJQ0lULCBzYXZlZEZyb206IG9wdGlvbnMuZnJvbSB9LCBwcm9ncmVzcywgc2F2ZUNhbmNlbGxhdGlvbi50b2tlbik7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSAmJiAhc2F2ZUNhbmNlbGxhdGlvbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIHBhcnRpY2lwYW50IHdhbnRzIHRvIGNhbmNlbCB0aGlzIG9wZXJhdGlvblxuXHRcdFx0XHRcdFx0XHRcdHNhdmVDYW5jZWxsYXRpb24uY2FuY2VsKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuaWdub3JlU2F2ZUZyb21TYXZlUGFydGljaXBhbnRzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW3N0b3JlZCBmaWxlIHdvcmtpbmcgY29weV0gcnVuU2F2ZVBhcnRpY2lwYW50cygke3ZlcnNpb25JZH0pIC0gcmVzdWx0ZWQgaW4gYW4gZXJyb3I6ICR7ZXJyb3IudG9TdHJpbmcoKX1gLCB0aGlzLnJlc291cmNlLnRvU3RyaW5nKCksIHRoaXMudHlwZUlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJdCBpcyBwb3NzaWJsZSB0aGF0IGEgc3Vic2VxdWVudCBzYXZlIGlzIGNhbmNlbGxpbmcgdGhpc1xuXHRcdFx0Ly8gcnVubmluZyBzYXZlLiBBcyBzdWNoIHdlIHJldHVybiBlYXJseSB3aGVuIHdlIGRldGVjdCB0aGF0LlxuXHRcdFx0aWYgKHNhdmVDYW5jZWxsYXRpb24udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBoYXZlIHRvIHByb3RlY3QgYWdhaW5zdCBiZWluZyBkaXNwb3NlZCBhdCB0aGlzIHBvaW50LiBJdCBjb3VsZCBiZSB0aGF0IHRoZSBzYXZlKCkgb3BlcmF0aW9uXG5cdFx0XHQvLyB3YXMgdHJpZ2dlcmQgZm9sbG93ZWQgYnkgYSBkaXNwb3NlKCkgb3BlcmF0aW9uIHJpZ2h0IGFmdGVyIHdpdGhvdXQgd2FpdGluZy4gVHlwaWNhbGx5IHdlIGNhbm5vdFxuXHRcdFx0Ly8gYmUgZGlzcG9zZWQgaWYgd2UgYXJlIGRpcnR5LCBidXQgaWYgd2UgYXJlIG5vdCBkaXJ0eSwgc2F2ZSgpIGFuZCBkaXNwb3NlKCkgY2FuIHN0aWxsIGJlIHRyaWdnZXJlZFxuXHRcdFx0Ly8gb25lIGFmdGVyIHRoZSBvdGhlciB3aXRob3V0IHdhaXRpbmcgZm9yIHRoZSBzYXZlKCkgdG8gY29tcGxldGUuIElmIHdlIGFyZSBkaXNwb3NlZCgpLCB3ZSByaXNrXG5cdFx0XHQvLyBzYXZpbmcgY29udGVudHMgdG8gZGlzayB0aGF0IGFyZSBzdGFsZSAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy81MDk0MikuXG5cdFx0XHQvLyBUbyBmaXggdGhpcyBpc3N1ZSwgd2Ugd2lsbCBub3Qgc3RvcmUgdGhlIGNvbnRlbnRzIHRvIGRpc2sgd2hlbiB3ZSBnb3QgZGlzcG9zZWQuXG5cdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSByZXF1aXJlIGEgcmVzb2x2ZWQgd29ya2luZyBjb3B5IGZyb20gdGhpcyBwb2ludCBvbiwgc2luY2Ugd2UgYXJlIGFib3V0IHRvIHdyaXRlIGRhdGEgdG8gZGlzay5cblx0XHRcdGlmICghdGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB1cGRhdGUgdmVyc2lvbklkIHdpdGggaXRzIG5ldyB2YWx1ZSAoaWYgcHJlLXNhdmUgY2hhbmdlcyBoYXBwZW5lZClcblx0XHRcdHZlcnNpb25JZCA9IHRoaXMudmVyc2lvbklkO1xuXG5cdFx0XHQvLyBDbGVhciBlcnJvciBmbGFnIHNpbmNlIHdlIGFyZSB0cnlpbmcgdG8gc2F2ZSBhZ2FpblxuXHRcdFx0dGhpcy5pbkVycm9yTW9kZSA9IGZhbHNlO1xuXG5cdFx0XHQvLyBTYXZlIHRvIERpc2suIFdlIG1hcmsgdGhlIHNhdmUgb3BlcmF0aW9uIGFzIGN1cnJlbnRseSBydW5uaW5nIHdpdGhcblx0XHRcdC8vIHRoZSBsYXRlc3QgdmVyc2lvbklkIGJlY2F1c2UgaXQgbWlnaHQgaGF2ZSBjaGFuZ2VkIGZyb20gYSBzYXZlXG5cdFx0XHQvLyBwYXJ0aWNpcGFudCB0cmlnZ2VyaW5nXG5cdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnc2F2ZVRleHRGaWxlJywgXCJXcml0aW5nIGludG8gZmlsZS4uLlwiKSB9KTtcblx0XHRcdHRoaXMudHJhY2UoYGRvU2F2ZSgke3ZlcnNpb25JZH0pIC0gYmVmb3JlIHdyaXRlKClgKTtcblx0XHRcdGNvbnN0IGxhc3RSZXNvbHZlZEZpbGVTdGF0ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCk7XG5cdFx0XHRjb25zdCByZXNvbHZlZEZpbGVXb3JraW5nQ29weSA9IHRoaXM7XG5cdFx0XHRyZXR1cm4gdGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIucnVuKHZlcnNpb25JZCwgKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCB3cml0ZUZpbGVPcHRpb25zOiBJV3JpdGVGaWxlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRcdG10aW1lOiBsYXN0UmVzb2x2ZWRGaWxlU3RhdC5tdGltZSxcblx0XHRcdFx0XHRcdGV0YWc6IChvcHRpb25zLmlnbm9yZU1vZGlmaWVkU2luY2UgfHwgIXRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5wcmV2ZW50U2F2ZUNvbmZsaWN0cyhsYXN0UmVzb2x2ZWRGaWxlU3RhdC5yZXNvdXJjZSkpID8gRVRBR19ESVNBQkxFRCA6IGxhc3RSZXNvbHZlZEZpbGVTdGF0LmV0YWcsXG5cdFx0XHRcdFx0XHR1bmxvY2s6IG9wdGlvbnMud3JpdGVVbmxvY2tcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0bGV0IHN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YTtcblxuXHRcdFx0XHRcdC8vIERlbGVnYXRlIHRvIHdvcmtpbmcgY29weSBtb2RlbCBzYXZlIG1ldGhvZCBpZiBhbnlcblx0XHRcdFx0XHRpZiAodHlwZW9mIHJlc29sdmVkRmlsZVdvcmtpbmdDb3B5Lm1vZGVsLnNhdmUgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHN0YXQgPSBhd2FpdCByZXNvbHZlZEZpbGVXb3JraW5nQ29weS5tb2RlbC5zYXZlKHdyaXRlRmlsZU9wdGlvbnMsIHNhdmVDYW5jZWxsYXRpb24udG9rZW4pO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHNhdmVDYW5jZWxsYXRpb24udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBzYXZlIHdhcyBjYW5jZWxsZWRcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIE90aGVyd2lzZSBhc2sgZm9yIGEgc25hcHNob3QgYW5kIHNhdmUgdmlhIGZpbGUgc2VydmljZXNcblx0XHRcdFx0XHRlbHNlIHtcblxuXHRcdFx0XHRcdFx0Ly8gU25hcHNob3Qgd29ya2luZyBjb3B5IG1vZGVsIGNvbnRlbnRzXG5cdFx0XHRcdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb24ocmVzb2x2ZWRGaWxlV29ya2luZ0NvcHkubW9kZWwuc25hcHNob3QoU25hcHNob3RDb250ZXh0LlNhdmUsIHNhdmVDYW5jZWxsYXRpb24udG9rZW4pLCBzYXZlQ2FuY2VsbGF0aW9uLnRva2VuKTtcblxuXHRcdFx0XHRcdFx0Ly8gSXQgaXMgcG9zc2libGUgdGhhdCBhIHN1YnNlcXVlbnQgc2F2ZSBpcyBjYW5jZWxsaW5nIHRoaXNcblx0XHRcdFx0XHRcdC8vIHJ1bm5pbmcgc2F2ZS4gQXMgc3VjaCB3ZSByZXR1cm4gZWFybHkgd2hlbiB3ZSBkZXRlY3QgdGhhdFxuXHRcdFx0XHRcdFx0Ly8gSG93ZXZlciwgd2UgZG8gbm90IHBhc3MgdGhlIHRva2VuIGludG8gdGhlIGZpbGUgc2VydmljZVxuXHRcdFx0XHRcdFx0Ly8gYmVjYXVzZSB0aGF0IGlzIGFuIGF0b21pYyBvcGVyYXRpb24gY3VycmVudGx5IHdpdGhvdXRcblx0XHRcdFx0XHRcdC8vIGNhbmNlbGxhdGlvbiBzdXBwb3J0LCBzbyB3ZSBkaXNwb3NlIHRoZSBjYW5jZWxsYXRpb24gaWZcblx0XHRcdFx0XHRcdC8vIGl0IHdhcyBub3QgY2FuY2VsbGVkIHlldC5cblx0XHRcdFx0XHRcdGlmIChzYXZlQ2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNhdmVDYW5jZWxsYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBXcml0ZSB0aGVtIHRvIGRpc2tcblx0XHRcdFx0XHRcdGlmIChvcHRpb25zPy53cml0ZUVsZXZhdGVkICYmIHRoaXMuZWxldmF0ZWRGaWxlU2VydmljZS5pc1N1cHBvcnRlZChsYXN0UmVzb2x2ZWRGaWxlU3RhdC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuZWxldmF0ZWRGaWxlU2VydmljZS53cml0ZUZpbGVFbGV2YXRlZChsYXN0UmVzb2x2ZWRGaWxlU3RhdC5yZXNvdXJjZSwgYXNzZXJ0UmV0dXJuc0RlZmluZWQoc25hcHNob3QpLCB3cml0ZUZpbGVPcHRpb25zKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShsYXN0UmVzb2x2ZWRGaWxlU3RhdC5yZXNvdXJjZSwgYXNzZXJ0UmV0dXJuc0RlZmluZWQoc25hcHNob3QpLCB3cml0ZUZpbGVPcHRpb25zKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLmhhbmRsZVNhdmVTdWNjZXNzKHN0YXQsIHZlcnNpb25JZCwgb3B0aW9ucyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVTYXZlRXJyb3IoZXJyb3IsIHZlcnNpb25JZCwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKCksICgpID0+IHNhdmVDYW5jZWxsYXRpb24uY2FuY2VsKCkpO1xuXHRcdH0pKCksICgpID0+IHNhdmVDYW5jZWxsYXRpb24uY2FuY2VsKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVTYXZlU3VjY2VzcyhzdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIHZlcnNpb25JZDogbnVtYmVyLCBvcHRpb25zOiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUFzT3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlZCByZXNvbHZlZCBzdGF0IHdpdGggdXBkYXRlZCBzdGF0XG5cdFx0dGhpcy51cGRhdGVMYXN0UmVzb2x2ZWRGaWxlU3RhdChzdGF0KTtcblxuXHRcdC8vIFVwZGF0ZSBkaXJ0eSBzdGF0ZSB1bmxlc3Mgd29ya2luZyBjb3B5IGhhcyBjaGFuZ2VkIG1lYW53aGlsZVxuXHRcdGlmICh2ZXJzaW9uSWQgPT09IHRoaXMudmVyc2lvbklkKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBoYW5kbGVTYXZlU3VjY2Vzcygke3ZlcnNpb25JZH0pIC0gc2V0dGluZyBkaXJ0eSB0byBmYWxzZSBiZWNhdXNlIHZlcnNpb25JZCBkaWQgbm90IGNoYW5nZWApO1xuXHRcdFx0dGhpcy5zZXREaXJ0eShmYWxzZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJhY2UoYGhhbmRsZVNhdmVTdWNjZXNzKCR7dmVyc2lvbklkfSkgLSBub3Qgc2V0dGluZyBkaXJ0eSB0byBmYWxzZSBiZWNhdXNlIHZlcnNpb25JZCBkaWQgY2hhbmdlIG1lYW53aGlsZWApO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBvcnBoYW4gc3RhdGUgZ2l2ZW4gc2F2ZSB3YXMgc3VjY2Vzc2Z1bFxuXHRcdHRoaXMuc2V0T3JwaGFuZWQoZmFsc2UpO1xuXG5cdFx0Ly8gRW1pdCBTYXZlIEV2ZW50XG5cdFx0dGhpcy5fb25EaWRTYXZlLmZpcmUoeyByZWFzb246IG9wdGlvbnMucmVhc29uLCBzdGF0LCBzb3VyY2U6IG9wdGlvbnMuc291cmNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVTYXZlRXJyb3IoZXJyb3I6IEVycm9yLCB2ZXJzaW9uSWQ6IG51bWJlciwgb3B0aW9uczogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVBc09wdGlvbnMpOiB2b2lkIHtcblx0XHQob3B0aW9ucy5pZ25vcmVFcnJvckhhbmRsZXIgPyB0aGlzLmxvZ1NlcnZpY2UudHJhY2UgOiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IpLmFwcGx5KHRoaXMubG9nU2VydmljZSwgW2Bbc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5XSBoYW5kbGVTYXZlRXJyb3IoJHt2ZXJzaW9uSWR9KSAtIGV4aXQgLSByZXN1bHRlZCBpbiBhIHNhdmUgZXJyb3I6ICR7ZXJyb3IudG9TdHJpbmcoKX1gLCB0aGlzLnJlc291cmNlLnRvU3RyaW5nKCksIHRoaXMudHlwZUlkXSk7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIHNhdmUoKSBjYWxsIHdhcyBtYWRlIGFza2luZyB0b1xuXHRcdC8vIGhhbmRsZSB0aGUgc2F2ZSBlcnJvciBpdHNlbGYuXG5cdFx0aWYgKG9wdGlvbnMuaWdub3JlRXJyb3JIYW5kbGVyKSB7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHQvLyBJbiBhbnkgY2FzZSBvZiBhbiBlcnJvciwgd2UgbWFyayB0aGUgd29ya2luZyBjb3B5IGFzIGRpcnR5IHRvIHByZXZlbnQgZGF0YSBsb3NzXG5cdFx0Ly8gSXQgY291bGQgYmUgcG9zc2libGUgdGhhdCB0aGUgd3JpdGUgY29ycnVwdGVkIHRoZSBmaWxlIG9uIGRpc2sgKGUuZy4gd2hlblxuXHRcdC8vIGFuIGVycm9yIGhhcHBlbmVkIGFmdGVyIHRydW5jYXRpbmcgdGhlIGZpbGUpIGFuZCBhcyBzdWNoIHdlIHdhbnQgdG8gcHJlc2VydmVcblx0XHQvLyB0aGUgd29ya2luZyBjb3B5IGNvbnRlbnRzIHRvIHByZXZlbnQgZGF0YSBsb3NzLlxuXHRcdHRoaXMuc2V0RGlydHkodHJ1ZSk7XG5cblx0XHQvLyBGbGFnIGFzIGVycm9yIHN0YXRlXG5cdFx0dGhpcy5pbkVycm9yTW9kZSA9IHRydWU7XG5cblx0XHQvLyBMb29rIG91dCBmb3IgYSBzYXZlIGNvbmZsaWN0XG5cdFx0aWYgKChlcnJvciBhcyBGaWxlT3BlcmF0aW9uRXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSkge1xuXHRcdFx0dGhpcy5pbkNvbmZsaWN0TW9kZSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBzYXZlIGVycm9yIHRvIHVzZXIgZm9yIGhhbmRsaW5nXG5cdFx0dGhpcy5kb0hhbmRsZVNhdmVFcnJvcihlcnJvciwgb3B0aW9ucyk7XG5cblx0XHQvLyBFbWl0IGFzIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRTYXZlRXJyb3IuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0hhbmRsZVNhdmVFcnJvcihlcnJvcjogRXJyb3IsIG9wdGlvbnM6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlQXNPcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgZmlsZU9wZXJhdGlvbkVycm9yID0gZXJyb3IgYXMgRmlsZU9wZXJhdGlvbkVycm9yO1xuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cblx0XHQvLyBEaXJ0eSB3cml0ZSBwcmV2ZW50aW9uXG5cdFx0aWYgKGZpbGVPcGVyYXRpb25FcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UpIHtcblx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnc3RhbGVTYXZlRXJyb3InLCBcIkZhaWxlZCB0byBzYXZlICd7MH0nOiBUaGUgY29udGVudCBvZiB0aGUgZmlsZSBpcyBuZXdlci4gRG8geW91IHdhbnQgdG8gb3ZlcndyaXRlIHRoZSBmaWxlIHdpdGggeW91ciBjaGFuZ2VzP1wiLCB0aGlzLm5hbWUpO1xuXG5cdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHsgaWQ6ICdmaWxlV29ya2luZ0NvcHkub3ZlcndyaXRlJywgbGFiZWw6IGxvY2FsaXplKCdvdmVyd3JpdGUnLCBcIk92ZXJ3cml0ZVwiKSwgcnVuOiAoKSA9PiB0aGlzLnNhdmUoeyAuLi5vcHRpb25zLCBpZ25vcmVNb2RpZmllZFNpbmNlOiB0cnVlLCByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSkgfSkpO1xuXHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0b0FjdGlvbih7IGlkOiAnZmlsZVdvcmtpbmdDb3B5LnJldmVydCcsIGxhYmVsOiBsb2NhbGl6ZSgncmV2ZXJ0JywgXCJSZXZlcnRcIiksIHJ1bjogKCkgPT4gdGhpcy5yZXZlcnQoKSB9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQW55IG90aGVyIHNhdmUgZXJyb3Jcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IGlzV3JpdGVMb2NrZWQgPSBmaWxlT3BlcmF0aW9uRXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1dSSVRFX0xPQ0tFRDtcblx0XHRcdGNvbnN0IHRyaWVkVG9VbmxvY2sgPSBpc1dyaXRlTG9ja2VkICYmIChmaWxlT3BlcmF0aW9uRXJyb3Iub3B0aW9ucyBhcyBJV3JpdGVGaWxlT3B0aW9ucyB8IHVuZGVmaW5lZCk/LnVubG9jaztcblx0XHRcdGNvbnN0IGlzUGVybWlzc2lvbkRlbmllZCA9IGZpbGVPcGVyYXRpb25FcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQ7XG5cdFx0XHRjb25zdCBjYW5TYXZlRWxldmF0ZWQgPSB0aGlzLmVsZXZhdGVkRmlsZVNlcnZpY2UuaXNTdXBwb3J0ZWQodGhpcy5yZXNvdXJjZSk7XG5cblx0XHRcdC8vIEVycm9yIHdpdGggQWN0aW9uc1xuXHRcdFx0aWYgKGlzRXJyb3JXaXRoQWN0aW9ucyhlcnJvcikpIHtcblx0XHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCguLi5lcnJvci5hY3Rpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2F2ZSBFbGV2YXRlZFxuXHRcdFx0aWYgKGNhblNhdmVFbGV2YXRlZCAmJiAoaXNQZXJtaXNzaW9uRGVuaWVkIHx8IHRyaWVkVG9VbmxvY2spKSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiAnZmlsZVdvcmtpbmdDb3B5LnNhdmVFbGV2YXRlZCcsXG5cdFx0XHRcdFx0bGFiZWw6IHRyaWVkVG9VbmxvY2sgP1xuXHRcdFx0XHRcdFx0aXNXaW5kb3dzID8gbG9jYWxpemUoJ292ZXJ3cml0ZUVsZXZhdGVkJywgXCJPdmVyd3JpdGUgYXMgQWRtaW4uLi5cIikgOiBsb2NhbGl6ZSgnb3ZlcndyaXRlRWxldmF0ZWRTdWRvJywgXCJPdmVyd3JpdGUgYXMgU3Vkby4uLlwiKSA6XG5cdFx0XHRcdFx0XHRpc1dpbmRvd3MgPyBsb2NhbGl6ZSgnc2F2ZUVsZXZhdGVkJywgXCJSZXRyeSBhcyBBZG1pbi4uLlwiKSA6IGxvY2FsaXplKCdzYXZlRWxldmF0ZWRTdWRvJywgXCJSZXRyeSBhcyBTdWRvLi4uXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5zYXZlKHsgLi4ub3B0aW9ucywgd3JpdGVFbGV2YXRlZDogdHJ1ZSwgd3JpdGVVbmxvY2s6IHRyaWVkVG9VbmxvY2ssIHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVW5sb2NrXG5cdFx0XHRlbHNlIGlmIChpc1dyaXRlTG9ja2VkKSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2godG9BY3Rpb24oeyBpZDogJ2ZpbGVXb3JraW5nQ29weS51bmxvY2snLCBsYWJlbDogbG9jYWxpemUoJ292ZXJ3cml0ZScsIFwiT3ZlcndyaXRlXCIpLCBydW46ICgpID0+IHRoaXMuc2F2ZSh7IC4uLm9wdGlvbnMsIHdyaXRlVW5sb2NrOiB0cnVlLCByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSkgfSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXRyeVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2godG9BY3Rpb24oeyBpZDogJ2ZpbGVXb3JraW5nQ29weS5yZXRyeScsIGxhYmVsOiBsb2NhbGl6ZSgncmV0cnknLCBcIlJldHJ5XCIpLCBydW46ICgpID0+IHRoaXMuc2F2ZSh7IC4uLm9wdGlvbnMsIHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KSB9KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNhdmUgQXNcblx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ2ZpbGVXb3JraW5nQ29weS5zYXZlQXMnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NhdmVBcycsIFwiU2F2ZSBBcy4uLlwiKSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy53b3JraW5nQ29weUVkaXRvclNlcnZpY2UuZmluZEVkaXRvcih0aGlzKTtcblx0XHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uuc2F2ZShlZGl0b3IsIHsgc2F2ZUFzOiB0cnVlLCByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSk7XG5cdFx0XHRcdFx0XHRpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZG9IYW5kbGVTYXZlRXJyb3IoZXJyb3IsIG9wdGlvbnMpOyAvLyBzaG93IGVycm9yIGFnYWluIGdpdmVuIHRoZSBvcGVyYXRpb24gZmFpbGVkXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFJldmVydFxuXHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0b0FjdGlvbih7IGlkOiAnZmlsZVdvcmtpbmdDb3B5LnJldmVydCcsIGxhYmVsOiBsb2NhbGl6ZSgncmV2ZXJ0JywgXCJSZXZlcnRcIiksIHJ1bjogKCkgPT4gdGhpcy5yZXZlcnQoKSB9KSk7XG5cblx0XHRcdC8vIE1lc3NhZ2Vcblx0XHRcdGlmIChpc1dyaXRlTG9ja2VkKSB7XG5cdFx0XHRcdGlmICh0cmllZFRvVW5sb2NrICYmIGNhblNhdmVFbGV2YXRlZCkge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBpc1dpbmRvd3MgP1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlYWRvbmx5U2F2ZUVycm9yQWRtaW4nLCBcIkZhaWxlZCB0byBzYXZlICd7MH0nOiBGaWxlIGlzIHJlYWQtb25seS4gU2VsZWN0ICdPdmVyd3JpdGUgYXMgQWRtaW4nIHRvIHJldHJ5IGFzIGFkbWluaXN0cmF0b3IuXCIsIHRoaXMubmFtZSkgOlxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlYWRvbmx5U2F2ZUVycm9yU3VkbycsIFwiRmFpbGVkIHRvIHNhdmUgJ3swfSc6IEZpbGUgaXMgcmVhZC1vbmx5LiBTZWxlY3QgJ092ZXJ3cml0ZSBhcyBTdWRvJyB0byByZXRyeSBhcyBzdXBlcnVzZXIuXCIsIHRoaXMubmFtZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdyZWFkb25seVNhdmVFcnJvcicsIFwiRmFpbGVkIHRvIHNhdmUgJ3swfSc6IEZpbGUgaXMgcmVhZC1vbmx5LiBTZWxlY3QgJ092ZXJ3cml0ZScgdG8gYXR0ZW1wdCB0byBtYWtlIGl0IHdyaXRlYWJsZS5cIiwgdGhpcy5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChjYW5TYXZlRWxldmF0ZWQgJiYgaXNQZXJtaXNzaW9uRGVuaWVkKSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBpc1dpbmRvd3MgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCdwZXJtaXNzaW9uRGVuaWVkU2F2ZUVycm9yJywgXCJGYWlsZWQgdG8gc2F2ZSAnezB9JzogSW5zdWZmaWNpZW50IHBlcm1pc3Npb25zLiBTZWxlY3QgJ1JldHJ5IGFzIEFkbWluJyB0byByZXRyeSBhcyBhZG1pbmlzdHJhdG9yLlwiLCB0aGlzLm5hbWUpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgncGVybWlzc2lvbkRlbmllZFNhdmVFcnJvclN1ZG8nLCBcIkZhaWxlZCB0byBzYXZlICd7MH0nOiBJbnN1ZmZpY2llbnQgcGVybWlzc2lvbnMuIFNlbGVjdCAnUmV0cnkgYXMgU3VkbycgdG8gcmV0cnkgYXMgc3VwZXJ1c2VyLlwiLCB0aGlzLm5hbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKHsga2V5OiAnZ2VuZXJpY1NhdmVFcnJvcicsIGNvbW1lbnQ6IFsnezB9IGlzIHRoZSByZXNvdXJjZSB0aGF0IGZhaWxlZCB0byBzYXZlIGFuZCB7MX0gdGhlIGVycm9yIG1lc3NhZ2UnXSB9LCBcIkZhaWxlZCB0byBzYXZlICd7MH0nOiB7MX1cIiwgdGhpcy5uYW1lLCB0b0Vycm9yTWVzc2FnZShlcnJvciwgZmFsc2UpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTaG93IHRvIHRoZSB1c2VyIGFzIG5vdGlmaWNhdGlvblxuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoeyBpZDogYCR7aGFzaCh0aGlzLnJlc291cmNlLnRvU3RyaW5nKCkpfWAsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciwgbWVzc2FnZSwgYWN0aW9uczogeyBwcmltYXJ5OiBwcmltYXJ5QWN0aW9ucyB9IH0pO1xuXG5cdFx0Ly8gUmVtb3ZlIGF1dG9tYXRpY2FsbHkgd2hlbiB3ZSBnZXQgc2F2ZWQvcmV2ZXJ0ZWRcblx0XHRjb25zdCBsaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKEV2ZW50Lm9uY2UoRXZlbnQuYW55KHRoaXMub25EaWRTYXZlLCB0aGlzLm9uRGlkUmV2ZXJ0KSkoKCkgPT4gaGFuZGxlLmNsb3NlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKGhhbmRsZS5vbkRpZENsb3NlKSgoKSA9PiBsaXN0ZW5lci5kaXNwb3NlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGFzdFJlc29sdmVkRmlsZVN0YXQobmV3RmlsZVN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZFJlYWRvbmx5ID0gdGhpcy5pc1JlYWRvbmx5KCk7XG5cblx0XHQvLyBGaXJzdCByZXNvbHZlIC0ganVzdCB0YWtlXG5cdFx0aWYgKCF0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0KSB7XG5cdFx0XHR0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0ID0gbmV3RmlsZVN0YXQ7XG5cdFx0fVxuXG5cdFx0Ly8gU3Vic2VxdWVudCByZXNvbHZlIC0gbWFrZSBzdXJlIHRoYXQgd2Ugb25seSBhc3NpZ24gaXQgaWYgdGhlIG10aW1lXG5cdFx0Ly8gaXMgZXF1YWwgb3IgaGFzIGFkdmFuY2VkLlxuXHRcdC8vIFRoaXMgcHJldmVudHMgcmFjZSBjb25kaXRpb25zIGZyb20gcmVzb2x2aW5nIGFuZCBzYXZpbmcuIElmIGEgc2F2ZVxuXHRcdC8vIGNvbWVzIGluIGxhdGUgYWZ0ZXIgYSByZXZlcnQgd2FzIGNhbGxlZCwgdGhlIG10aW1lIGNvdWxkIGJlIG91dCBvZlxuXHRcdC8vIHN5bmMuXG5cdFx0ZWxzZSBpZiAodGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdC5tdGltZSA8PSBuZXdGaWxlU3RhdC5tdGltZSkge1xuXHRcdFx0dGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCA9IG5ld0ZpbGVTdGF0O1xuXHRcdH1cblxuXHRcdC8vIEluIGFsbCBvdGhlciBjYXNlcyB1cGRhdGUgb25seSB0aGUgcmVhZG9ubHkgYW5kIGxvY2tlZCBmbGFnc1xuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCA9IHsgLi4udGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCwgcmVhZG9ubHk6IG5ld0ZpbGVTdGF0LnJlYWRvbmx5LCBsb2NrZWQ6IG5ld0ZpbGVTdGF0LmxvY2tlZCB9O1xuXHRcdH1cblxuXHRcdC8vIFNpZ25hbCB0aGF0IHRoZSByZWFkb25seSBzdGF0ZSBjaGFuZ2VkXG5cdFx0aWYgKHRoaXMuaXNSZWFkb25seSgpICE9PSBvbGRSZWFkb25seSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJldmVydFxuXG5cdGFzeW5jIHJldmVydChvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaXNSZXNvbHZlZCgpIHx8ICghdGhpcy5kaXJ0eSAmJiAhb3B0aW9ucz8uZm9yY2UpKSB7XG5cdFx0XHRyZXR1cm47IC8vIGlnbm9yZSBpZiBub3QgcmVzb2x2ZWQgb3Igbm90IGRpcnR5IGFuZCBub3QgZW5mb3JjZWRcblx0XHR9XG5cblx0XHR0aGlzLnRyYWNlKCdyZXZlcnQoKScpO1xuXG5cdFx0Ly8gVW5zZXQgZmxhZ3Ncblx0XHRjb25zdCB3YXNEaXJ0eSA9IHRoaXMuZGlydHk7XG5cdFx0Y29uc3QgdW5kb1NldERpcnR5ID0gdGhpcy5kb1NldERpcnR5KGZhbHNlKTtcblxuXHRcdC8vIEZvcmNlIHJlYWQgZnJvbSBkaXNrIHVubGVzcyByZXZlcnRpbmcgc29mdFxuXHRcdGNvbnN0IHNvZnRVbmRvID0gb3B0aW9ucz8uc29mdDtcblx0XHRpZiAoIXNvZnRVbmRvKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZvcmNlUmVzb2x2ZUZyb21GaWxlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHRcdC8vIEZpbGVOb3RGb3VuZCBtZWFucyB0aGUgZmlsZSBnb3QgZGVsZXRlZCBtZWFud2hpbGUsIHNvIGlnbm9yZSBpdFxuXHRcdFx0XHRpZiAoKGVycm9yIGFzIEZpbGVPcGVyYXRpb25FcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXG5cdFx0XHRcdFx0Ly8gU2V0IGZsYWdzIGJhY2sgdG8gcHJldmlvdXMgdmFsdWVzLCB3ZSBhcmUgc3RpbGwgZGlydHkgaWYgcmV2ZXJ0IGZhaWxlZFxuXHRcdFx0XHRcdHVuZG9TZXREaXJ0eSgpO1xuXG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFbWl0IGZpbGUgY2hhbmdlIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRSZXZlcnQuZmlyZSgpO1xuXG5cdFx0Ly8gRW1pdCBkaXJ0eSBjaGFuZ2UgZXZlbnRcblx0XHRpZiAod2FzRGlydHkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTdGF0ZVxuXG5cdHByaXZhdGUgaW5Db25mbGljdE1vZGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBpbkVycm9yTW9kZSA9IGZhbHNlO1xuXG5cdGhhc1N0YXRlKHN0YXRlOiBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAoc3RhdGUpIHtcblx0XHRcdGNhc2UgU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuQ09ORkxJQ1Q6XG5cdFx0XHRcdHJldHVybiB0aGlzLmluQ29uZmxpY3RNb2RlO1xuXHRcdFx0Y2FzZSBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5ESVJUWTpcblx0XHRcdFx0cmV0dXJuIHRoaXMuZGlydHk7XG5cdFx0XHRjYXNlIFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLkVSUk9SOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbkVycm9yTW9kZTtcblx0XHRcdGNhc2UgU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuT1JQSEFOOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5pc09ycGhhbmVkKCk7XG5cdFx0XHRjYXNlIFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLlBFTkRJTkdfU0FWRTpcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLmlzUnVubmluZygpO1xuXHRcdFx0Y2FzZSBTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5TQVZFRDpcblx0XHRcdFx0cmV0dXJuICF0aGlzLmRpcnR5O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGpvaW5TdGF0ZShzdGF0ZTogU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLnJ1bm5pbmc7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gVXRpbGl0aWVzXG5cblx0aXNSZWFkb25seSgpOiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzUmVhZG9ubHkodGhpcy5yZXNvdXJjZSwgdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCk7XG5cdH1cblxuXHRwcml2YXRlIHRyYWNlKG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbc3RvcmVkIGZpbGUgd29ya2luZyBjb3B5XSAke21zZ31gLCB0aGlzLnJlc291cmNlLnRvU3RyaW5nKCksIHRoaXMudHlwZUlkKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBEaXNwb3NlXG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNlKCdkaXNwb3NlKCknKTtcblxuXHRcdC8vIFN0YXRlXG5cdFx0dGhpcy5pbkNvbmZsaWN0TW9kZSA9IGZhbHNlO1xuXHRcdHRoaXMuaW5FcnJvck1vZGUgPSBmYWxzZTtcblxuXHRcdC8vIEZyZWUgdXAgbW9kZWwgZm9yIEdDXG5cdFx0dGhpcy5fbW9kZWwgPSB1bmRlZmluZWQ7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBbUMscUJBQXNDLGNBQTRFLDBDQUEwQztBQUN4TSxTQUF1QyxrQkFBa0I7QUFDekQsU0FBUywyQkFBMkI7QUFDcEMsU0FBNEUsK0JBQStCO0FBQzNHLFNBQVMsa0JBQWtCLG9CQUFvQixlQUFlO0FBQzlELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsaUNBQTZEO0FBQ3RFLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxvQkFBb0Isc0JBQXNCO0FBQ25ELFNBQWtCLGdCQUFnQjtBQUNsQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUErQiwyQkFBMkI7QUFDMUQsU0FBZ0YsdUJBQXVCO0FBRXZHLFNBQW9CLGtCQUFpQyx3QkFBd0I7QUFDN0UsU0FBUywyQkFBMkI7QUFzSjdCLElBQVcsNkJBQVgsa0JBQVdBLGdDQUFYO0FBS04sRUFBQUEsd0RBQUE7QUFLQSxFQUFBQSx3REFBQTtBQU1BLEVBQUFBLHdEQUFBO0FBT0EsRUFBQUEsd0RBQUE7QUFNQSxFQUFBQSx3REFBQTtBQU9B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
