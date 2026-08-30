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
import { Emitter } from "../../../../base/common/event.js";
import { mark } from "../../../../base/common/performance.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { EncodingMode, ITextFileService, TextFileEditorModelState, TextFileResolveReason } from "./textfiles.js";
import { SaveReason, SaveSourceRegistry } from "../../../common/editor.js";
import { BaseTextEditorModel } from "../../../common/editor/textEditorModel.js";
import { IWorkingCopyBackupService } from "../../workingCopy/common/workingCopyBackup.js";
import { IFileService, FileOperationResult, FileChangeType, ETAG_DISABLED, NotModifiedSinceFileOperationError } from "../../../../platform/files/common/files.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { timeout, TaskSequentializer } from "../../../../base/common/async.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { basename } from "../../../../base/common/path.js";
import { IWorkingCopyService } from "../../workingCopy/common/workingCopyService.js";
import { WorkingCopyCapabilities, NO_TYPE_ID } from "../../workingCopy/common/workingCopy.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { UTF16be, UTF16le, UTF8, UTF8_with_bom } from "./encoding.js";
import { createTextBufferFactoryFromStream } from "../../../../editor/common/model/textModel.js";
import { ILanguageDetectionService } from "../../languageDetection/common/languageDetectionWorkerService.js";
import { IPathService } from "../../path/common/pathService.js";
import { extUri } from "../../../../base/common/resources.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { EditSources } from "../../../../editor/common/textModelEditSource.js";
let TextFileEditorModel = class extends BaseTextEditorModel {
  constructor(resource, preferredEncoding, preferredLanguageId, languageService, modelService, fileService, textFileService, workingCopyBackupService, logService, workingCopyService, filesConfigurationService, labelService, languageDetectionService, accessibilityService, pathService, extensionService, progressService) {
    super(modelService, languageService, languageDetectionService, accessibilityService);
    this.resource = resource;
    this.preferredEncoding = preferredEncoding;
    this.preferredLanguageId = preferredLanguageId;
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.workingCopyBackupService = workingCopyBackupService;
    this.logService = logService;
    this.workingCopyService = workingCopyService;
    this.filesConfigurationService = filesConfigurationService;
    this.labelService = labelService;
    this.pathService = pathService;
    this.extensionService = extensionService;
    this.progressService = progressService;
    //#region Events
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
    this._onDidChangeEncoding = this._register(new Emitter());
    this.onDidChangeEncoding = this._onDidChangeEncoding.event;
    this._onDidChangeOrphaned = this._register(new Emitter());
    this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
    this._onDidChangeReadonly = this._register(new Emitter());
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    //#endregion
    this.typeId = NO_TYPE_ID;
    // IMPORTANT: never change this to not break existing assumptions (e.g. backups)
    this.capabilities = WorkingCopyCapabilities.None;
    // encoding as reported from disk
    this.versionId = 0;
    this.ignoreDirtyOnModelContentChange = false;
    this.ignoreSaveFromSaveParticipants = false;
    this.lastModelContentChangeFromUndoRedo = void 0;
    // !!! DO NOT MARK PRIVATE! USED IN TESTS !!!
    this.saveSequentializer = new TaskSequentializer();
    this.dirty = false;
    this.inConflictMode = false;
    this.inOrphanMode = false;
    this.inErrorMode = false;
    this.hasEncodingSetExplicitly = false;
    this.name = basename(this.labelService.getUriLabel(this.resource));
    this.resourceHasExtension = !!extUri.extname(this.resource);
    this._register(this.workingCopyService.registerWorkingCopy(this));
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
    this._register(this.filesConfigurationService.onDidChangeFilesAssociation(() => this.onDidChangeFilesAssociation()));
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
  }
  async onDidFilesChange(e) {
    let fileEventImpactsModel = false;
    let newInOrphanModeGuess;
    if (this.inOrphanMode) {
      const modelFileAdded = e.contains(this.resource, FileChangeType.ADDED);
      if (modelFileAdded) {
        newInOrphanModeGuess = false;
        fileEventImpactsModel = true;
      }
    } else {
      const modelFileDeleted = e.contains(this.resource, FileChangeType.DELETED);
      if (modelFileDeleted) {
        newInOrphanModeGuess = true;
        fileEventImpactsModel = true;
      }
    }
    if (fileEventImpactsModel && this.inOrphanMode !== newInOrphanModeGuess) {
      let newInOrphanModeValidated = false;
      if (newInOrphanModeGuess) {
        await timeout(100, CancellationToken.None);
        if (this.isDisposed()) {
          newInOrphanModeValidated = true;
        } else {
          const exists = await this.fileService.exists(this.resource);
          newInOrphanModeValidated = !exists;
        }
      }
      if (this.inOrphanMode !== newInOrphanModeValidated && !this.isDisposed()) {
        this.setOrphaned(newInOrphanModeValidated);
      }
    }
  }
  setOrphaned(orphaned) {
    if (this.inOrphanMode !== orphaned) {
      this.inOrphanMode = orphaned;
      this._onDidChangeOrphaned.fire();
    }
  }
  onDidChangeFilesAssociation() {
    if (!this.isResolved()) {
      return;
    }
    const firstLineText = this.getFirstLineText(this.textEditorModel);
    const languageSelection = this.getOrCreateLanguage(this.resource, this.languageService, this.preferredLanguageId, firstLineText);
    this.textEditorModel.setLanguage(languageSelection);
  }
  setLanguageId(languageId, source) {
    super.setLanguageId(languageId, source);
    this.preferredLanguageId = languageId;
  }
  //#region Backup
  async backup(token) {
    let meta = void 0;
    if (this.lastResolvedFileStat) {
      meta = {
        mtime: this.lastResolvedFileStat.mtime,
        ctime: this.lastResolvedFileStat.ctime,
        size: this.lastResolvedFileStat.size,
        etag: this.lastResolvedFileStat.etag,
        orphaned: this.inOrphanMode
      };
    }
    const content = await this.textFileService.getEncodedReadable(this.resource, this.createSnapshot() ?? void 0, { encoding: UTF8 });
    return { meta, content };
  }
  //#endregion
  //#region Revert
  async revert(options) {
    if (!this.isResolved()) {
      return;
    }
    const wasDirty = this.dirty;
    const undo = this.doSetDirty(false);
    const softUndo = options?.soft;
    if (!softUndo) {
      try {
        await this.forceResolveFromFile();
      } catch (error) {
        if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
          undo();
          throw error;
        }
      }
    }
    this._onDidRevert.fire();
    if (wasDirty) {
      this._onDidChangeDirty.fire();
    }
  }
  //#endregion
  //#region Resolve
  async resolve(options) {
    this.trace("resolve() - enter");
    mark("code/willResolveTextFileEditorModel");
    if (this.isDisposed()) {
      this.trace("resolve() - exit - without resolving because model is disposed");
      return;
    }
    if (!options?.contents && (this.dirty || this.saveSequentializer.isRunning())) {
      this.trace("resolve() - exit - without resolving because model is dirty or being saved");
      return;
    }
    await this.doResolve(options);
    mark("code/didResolveTextFileEditorModel");
  }
  async doResolve(options) {
    if (options?.contents) {
      return this.resolveFromBuffer(options.contents, options);
    }
    const isNewModel = !this.isResolved();
    if (isNewModel) {
      const resolvedFromBackup = await this.resolveFromBackup(options);
      if (resolvedFromBackup) {
        return;
      }
    }
    return this.resolveFromFile(options);
  }
  async resolveFromBuffer(buffer, options) {
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
    const preferredEncoding = await this.textFileService.encoding.getPreferredWriteEncoding(this.resource, this.preferredEncoding);
    this.resolveFromContent({
      resource: this.resource,
      name: this.name,
      mtime,
      ctime,
      size,
      etag,
      value: buffer,
      encoding: preferredEncoding.encoding,
      readonly: false,
      locked: false,
      executable: false
    }, true, options);
  }
  async resolveFromBackup(options) {
    const backup = await this.workingCopyBackupService.resolve(this);
    let encoding = UTF8;
    if (backup) {
      encoding = (await this.textFileService.encoding.getPreferredWriteEncoding(this.resource, this.preferredEncoding)).encoding;
    }
    const isNewModel = !this.isResolved();
    if (!isNewModel) {
      this.trace("resolveFromBackup() - exit - without resolving because previously new model got created meanwhile");
      return true;
    }
    if (backup) {
      await this.doResolveFromBackup(backup, encoding, options);
      return true;
    }
    return false;
  }
  async doResolveFromBackup(backup, encoding, options) {
    this.trace("doResolveFromBackup()");
    this.resolveFromContent({
      resource: this.resource,
      name: this.name,
      mtime: backup.meta ? backup.meta.mtime : Date.now(),
      ctime: backup.meta ? backup.meta.ctime : Date.now(),
      size: backup.meta ? backup.meta.size : 0,
      etag: backup.meta ? backup.meta.etag : ETAG_DISABLED,
      // etag disabled if unknown!
      value: await createTextBufferFactoryFromStream(await this.textFileService.getDecodedStream(this.resource, backup.value, { encoding: UTF8 })),
      encoding,
      readonly: false,
      locked: false,
      executable: false
    }, true, options);
    if (backup.meta?.orphaned) {
      this.setOrphaned(true);
    }
  }
  async resolveFromFile(options) {
    this.trace("resolveFromFile()");
    const forceReadFromFile = options?.forceReadFromFile;
    const allowBinary = this.isResolved() || options?.allowBinary;
    let etag;
    if (forceReadFromFile) {
      etag = ETAG_DISABLED;
    } else if (this.lastResolvedFileStat) {
      etag = this.lastResolvedFileStat.etag;
    }
    const currentVersionId = this.versionId;
    try {
      const content = await this.textFileService.readStream(this.resource, {
        acceptTextOnly: !allowBinary,
        etag,
        encoding: this.preferredEncoding,
        limits: options?.limits
      });
      this.setOrphaned(false);
      if (currentVersionId !== this.versionId) {
        this.trace("resolveFromFile() - exit - without resolving because model content changed");
        return;
      }
      return this.resolveFromContent(content, false, options);
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
  resolveFromContent(content, dirty, options) {
    this.trace("resolveFromContent() - enter");
    if (this.isDisposed()) {
      this.trace("resolveFromContent() - exit - because model is disposed");
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
    const oldEncoding = this.contentEncoding;
    this.contentEncoding = content.encoding;
    if (this.preferredEncoding) {
      this.updatePreferredEncoding(this.contentEncoding);
    } else if (oldEncoding !== this.contentEncoding) {
      this._onDidChangeEncoding.fire();
    }
    if (this.textEditorModel) {
      this.doUpdateTextModel(content.value, EditSources.reloadFromDisk());
    } else {
      this.doCreateTextModel(content.resource, content.value);
    }
    this.setDirty(!!dirty);
    this._onDidResolve.fire(options?.reason ?? TextFileResolveReason.OTHER);
  }
  doCreateTextModel(resource, value) {
    this.trace("doCreateTextModel()");
    const textModel = this.createTextEditorModel(value, resource, this.preferredLanguageId);
    this.installModelListeners(textModel);
    this.autoDetectLanguage();
  }
  doUpdateTextModel(value, reason) {
    this.trace("doUpdateTextModel()");
    this.ignoreDirtyOnModelContentChange = true;
    try {
      this.updateTextEditorModel(value, this.preferredLanguageId, reason);
    } finally {
      this.ignoreDirtyOnModelContentChange = false;
    }
  }
  installModelListeners(model) {
    this._register(model.onDidChangeContent((e) => this.onModelContentChanged(model, e.isUndoing || e.isRedoing)));
    this._register(model.onDidChangeLanguage(() => this.onMaybeShouldChangeEncoding()));
    super.installModelListeners(model);
  }
  onModelContentChanged(model, isUndoingOrRedoing) {
    this.trace(`onModelContentChanged() - enter`);
    this.versionId++;
    this.trace(`onModelContentChanged() - new versionId ${this.versionId}`);
    if (isUndoingOrRedoing) {
      this.lastModelContentChangeFromUndoRedo = Date.now();
    }
    if (!this.ignoreDirtyOnModelContentChange && !this.isReadonly()) {
      if (model.getAlternativeVersionId() === this.bufferSavedVersionId) {
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
    this.autoDetectLanguage();
  }
  async autoDetectLanguage() {
    await this.extensionService?.whenInstalledExtensionsRegistered();
    const languageId = this.getLanguageId();
    if (this.resource.scheme === this.pathService.defaultUriScheme && // make sure to not detect language for non-user visible documents
    (!languageId || languageId === PLAINTEXT_LANGUAGE_ID) && // only run on files with plaintext language set or no language set at all
    !this.resourceHasExtension) {
      return super.autoDetectLanguage();
    }
  }
  async forceResolveFromFile() {
    if (this.isDisposed()) {
      return;
    }
    await this.textFileService.files.resolve(this.resource, {
      reload: { async: false },
      forceReadFromFile: true
    });
  }
  //#endregion
  //#region Dirty
  isDirty() {
    return this.dirty;
  }
  isModified() {
    return this.isDirty();
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
    const oldBufferSavedVersionId = this.bufferSavedVersionId;
    if (!dirty) {
      this.dirty = false;
      this.inConflictMode = false;
      this.inErrorMode = false;
      this.updateSavedVersionId();
    } else {
      this.dirty = true;
    }
    return () => {
      this.dirty = wasDirty;
      this.inConflictMode = wasInConflictMode;
      this.inErrorMode = wasInErrorMode;
      this.bufferSavedVersionId = oldBufferSavedVersionId;
    };
  }
  //#endregion
  //#region Save
  async save(options = /* @__PURE__ */ Object.create(null)) {
    if (!this.isResolved()) {
      return false;
    }
    if (this.isReadonly()) {
      this.trace("save() - ignoring request for readonly resource");
      return false;
    }
    if ((this.hasState(TextFileEditorModelState.CONFLICT) || this.hasState(TextFileEditorModelState.ERROR)) && (options.reason === SaveReason.AUTO || options.reason === SaveReason.FOCUS_CHANGE || options.reason === SaveReason.WINDOW_CHANGE)) {
      this.trace("save() - ignoring auto save request for model that is in conflict or error");
      return false;
    }
    this.trace("save() - enter");
    await this.doSave(options);
    this.trace("save() - exit");
    return this.hasState(TextFileEditorModelState.SAVED);
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
      this.textEditorModel.pushStackElement();
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
      if (this.isResolved() && !options.skipSaveParticipants) {
        try {
          if (options.reason === SaveReason.AUTO && typeof this.lastModelContentChangeFromUndoRedo === "number") {
            const timeFromUndoRedoToSave = Date.now() - this.lastModelContentChangeFromUndoRedo;
            if (timeFromUndoRedoToSave < TextFileEditorModel.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD) {
              await timeout(TextFileEditorModel.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD - timeFromUndoRedoToSave);
            }
          }
          if (!saveCancellation.token.isCancellationRequested) {
            this.ignoreSaveFromSaveParticipants = true;
            try {
              await this.textFileService.files.runSaveParticipants(this, { reason: options.reason ?? SaveReason.EXPLICIT, savedFrom: options.from }, progress, saveCancellation.token);
            } catch (err) {
              if (isCancellationError(err) && !saveCancellation.token.isCancellationRequested) {
                saveCancellation.cancel();
              }
            } finally {
              this.ignoreSaveFromSaveParticipants = false;
            }
          }
        } catch (error) {
          this.logService.error(`[text file model] runSaveParticipants(${versionId}) - resulted in an error: ${error.toString()}`, this.resource.toString());
        }
      }
      if (saveCancellation.token.isCancellationRequested) {
        return;
      } else {
        saveCancellation.dispose();
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
      const resolvedTextFileEditorModel = this;
      return this.saveSequentializer.run(versionId, (async () => {
        try {
          const stat = await this.textFileService.write(lastResolvedFileStat.resource, resolvedTextFileEditorModel.createSnapshot(), {
            mtime: lastResolvedFileStat.mtime,
            encoding: this.getEncoding(),
            etag: options.ignoreModifiedSince || !this.filesConfigurationService.preventSaveConflicts(lastResolvedFileStat.resource, resolvedTextFileEditorModel.getLanguageId()) ? ETAG_DISABLED : lastResolvedFileStat.etag,
            unlock: options.writeUnlock,
            writeElevated: options.writeElevated
          });
          this.handleSaveSuccess(stat, versionId, options);
        } catch (error) {
          this.handleSaveError(error, versionId, options);
        }
      })());
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
    (options.ignoreErrorHandler ? this.logService.trace : this.logService.error).apply(this.logService, [`[text file model] handleSaveError(${versionId}) - exit - resulted in a save error: ${error.toString()}`, this.resource.toString()]);
    if (options.ignoreErrorHandler) {
      throw error;
    }
    this.setDirty(true);
    this.inErrorMode = true;
    if (error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
      this.inConflictMode = true;
    }
    this.textFileService.files.saveErrorHandler.onSaveError(error, this, options);
    this._onDidSaveError.fire();
  }
  updateSavedVersionId() {
    if (this.isResolved()) {
      this.bufferSavedVersionId = this.textEditorModel.getAlternativeVersionId();
    }
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
  hasState(state) {
    switch (state) {
      case TextFileEditorModelState.CONFLICT:
        return this.inConflictMode;
      case TextFileEditorModelState.DIRTY:
        return this.dirty;
      case TextFileEditorModelState.ERROR:
        return this.inErrorMode;
      case TextFileEditorModelState.ORPHAN:
        return this.inOrphanMode;
      case TextFileEditorModelState.PENDING_SAVE:
        return this.saveSequentializer.isRunning();
      case TextFileEditorModelState.SAVED:
        return !this.dirty;
    }
  }
  async joinState(state) {
    return this.saveSequentializer.running;
  }
  getLanguageId() {
    if (this.textEditorModel) {
      return this.textEditorModel.getLanguageId();
    }
    return this.preferredLanguageId;
  }
  //#region Encoding
  async onMaybeShouldChangeEncoding() {
    if (this.hasEncodingSetExplicitly) {
      this.trace("onMaybeShouldChangeEncoding() - ignoring because encoding was set explicitly");
      return;
    }
    if (this.contentEncoding === UTF8_with_bom || this.contentEncoding === UTF16be || this.contentEncoding === UTF16le) {
      this.trace("onMaybeShouldChangeEncoding() - ignoring because content encoding has a BOM");
      return;
    }
    const { encoding } = await this.textFileService.encoding.getPreferredReadEncoding(this.resource);
    if (typeof encoding !== "string" || !this.isNewEncoding(encoding)) {
      this.trace(`onMaybeShouldChangeEncoding() - ignoring because preferred encoding ${encoding} is not new`);
      return;
    }
    if (this.isDirty()) {
      this.trace("onMaybeShouldChangeEncoding() - ignoring because model is dirty");
      return;
    }
    this.logService.info(`Adjusting encoding based on configured language override to '${encoding}' for ${this.resource.toString(true)}.`);
    return this.forceResolveFromFile();
  }
  setEncoding(encoding, mode) {
    this.hasEncodingSetExplicitly = true;
    return this.setEncodingInternal(encoding, mode);
  }
  async setEncodingInternal(encoding, mode) {
    if (mode === EncodingMode.Encode) {
      this.updatePreferredEncoding(encoding);
      if (!this.isDirty()) {
        this.versionId++;
        this.setDirty(true);
      }
      if (!this.inConflictMode) {
        await this.save({ source: TextFileEditorModel.TEXTFILE_SAVE_ENCODING_SOURCE });
      }
    } else {
      if (!this.isNewEncoding(encoding)) {
        return;
      }
      if (this.isDirty()) {
        throw new Error("Cannot re-open a dirty text document with different encoding. Save it first.");
      }
      this.updatePreferredEncoding(encoding);
      await this.forceResolveFromFile();
    }
  }
  updatePreferredEncoding(encoding) {
    if (!this.isNewEncoding(encoding)) {
      return;
    }
    this.preferredEncoding = encoding;
    this._onDidChangeEncoding.fire();
  }
  isNewEncoding(encoding) {
    if (this.preferredEncoding === encoding) {
      return false;
    }
    if (!this.preferredEncoding && this.contentEncoding === encoding) {
      return false;
    }
    return true;
  }
  getEncoding() {
    return this.preferredEncoding || this.contentEncoding;
  }
  //#endregion
  trace(msg) {
    this.logService.trace(`[text file model] ${msg}`, this.resource.toString());
  }
  isResolved() {
    return !!this.textEditorModel;
  }
  isReadonly() {
    return this.filesConfigurationService.isReadonly(this.resource, this.lastResolvedFileStat);
  }
  dispose() {
    this.trace("dispose()");
    this.inConflictMode = false;
    this.inOrphanMode = false;
    this.inErrorMode = false;
    super.dispose();
  }
};
TextFileEditorModel.TEXTFILE_SAVE_ENCODING_SOURCE = SaveSourceRegistry.registerSource("textFileEncoding.source", localize("textFileCreate.source", "File Encoding Changed"));
TextFileEditorModel.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD = 500;
TextFileEditorModel = __decorateClass([
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextFileService),
  __decorateParam(7, IWorkingCopyBackupService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IWorkingCopyService),
  __decorateParam(10, IFilesConfigurationService),
  __decorateParam(11, ILabelService),
  __decorateParam(12, ILanguageDetectionService),
  __decorateParam(13, IAccessibilityService),
  __decorateParam(14, IPathService),
  __decorateParam(15, IExtensionService),
  __decorateParam(16, IProgressService)
], TextFileEditorModel);
export {
  TextFileEditorModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0ZmlsZVxcY29tbW9uXFx0ZXh0RmlsZUVkaXRvck1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBFbmNvZGluZ01vZGUsIElUZXh0RmlsZVNlcnZpY2UsIFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZSwgSVRleHRGaWxlRWRpdG9yTW9kZWwsIElUZXh0RmlsZVN0cmVhbUNvbnRlbnQsIElUZXh0RmlsZVJlc29sdmVPcHRpb25zLCBJUmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsLCBUZXh0RmlsZVJlc29sdmVSZWFzb24sIElUZXh0RmlsZUVkaXRvck1vZGVsU2F2ZUV2ZW50LCBJVGV4dEZpbGVTYXZlQXNPcHRpb25zIH0gZnJvbSAnLi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSVJldmVydE9wdGlvbnMsIFNhdmVSZWFzb24sIFNhdmVTb3VyY2VSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQmFzZVRleHRFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvdGV4dEVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UsIElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwIH0gZnJvbSAnLi4vLi4vd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5QmFja3VwLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlQ2hhbmdlVHlwZSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCBFVEFHX0RJU0FCTEVELCBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0LCBUYXNrU2VxdWVudGlhbGl6ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJVGV4dEJ1ZmZlckZhY3RvcnksIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUJhY2t1cCwgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMsIE5PX1RZUEVfSUQsIElXb3JraW5nQ29weUJhY2t1cE1ldGEgfSBmcm9tICcuLi8uLi93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVVRGMTZiZSwgVVRGMTZsZSwgVVRGOCwgVVRGOF93aXRoX2JvbSB9IGZyb20gJy4vZW5jb2RpbmcuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2xhbmd1YWdlRGV0ZWN0aW9uL2NvbW1vbi9sYW5ndWFnZURldGVjdGlvbldvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTZXJ2aWNlLCBJUHJvZ3Jlc3NTdGVwLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsRWRpdFNvdXJjZSwgRWRpdFNvdXJjZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuXG5pbnRlcmZhY2UgSUJhY2t1cE1ldGFEYXRhIGV4dGVuZHMgSVdvcmtpbmdDb3B5QmFja3VwTWV0YSB7XG5cdG10aW1lOiBudW1iZXI7XG5cdGN0aW1lOiBudW1iZXI7XG5cdHNpemU6IG51bWJlcjtcblx0ZXRhZzogc3RyaW5nO1xuXHRvcnBoYW5lZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBUaGUgdGV4dCBmaWxlIGVkaXRvciBtb2RlbCBsaXN0ZW5zIHRvIGNoYW5nZXMgdG8gaXRzIHVuZGVybHlpbmcgY29kZSBlZGl0b3IgbW9kZWwgYW5kIHNhdmVzIHRoZXNlIGNoYW5nZXMgdGhyb3VnaCB0aGUgZmlsZSBzZXJ2aWNlIGJhY2sgdG8gdGhlIGRpc2suXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXh0RmlsZUVkaXRvck1vZGVsIGV4dGVuZHMgQmFzZVRleHRFZGl0b3JNb2RlbCBpbXBsZW1lbnRzIElUZXh0RmlsZUVkaXRvck1vZGVsIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBURVhURklMRV9TQVZFX0VOQ09ESU5HX1NPVVJDRSA9IFNhdmVTb3VyY2VSZWdpc3RyeS5yZWdpc3RlclNvdXJjZSgndGV4dEZpbGVFbmNvZGluZy5zb3VyY2UnLCBsb2NhbGl6ZSgndGV4dEZpbGVDcmVhdGUuc291cmNlJywgXCJGaWxlIEVuY29kaW5nIENoYW5nZWRcIikpO1xuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVzb2x2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRleHRGaWxlUmVzb2x2ZVJlYXNvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVzb2x2ZSA9IHRoaXMuX29uRGlkUmVzb2x2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURpcnR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHkgPSB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2F2ZUVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZUVycm9yID0gdGhpcy5fb25EaWRTYXZlRXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRleHRGaWxlRWRpdG9yTW9kZWxTYXZlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNhdmUgPSB0aGlzLl9vbkRpZFNhdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXZlcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXZlcnQgPSB0aGlzLl9vbkRpZFJldmVydC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVuY29kaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW5jb2RpbmcgPSB0aGlzLl9vbkRpZENoYW5nZUVuY29kaW5nLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlT3JwaGFuZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPcnBoYW5lZCA9IHRoaXMuX29uRGlkQ2hhbmdlT3JwaGFuZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlYWRvbmx5ID0gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRyZWFkb25seSB0eXBlSWQgPSBOT19UWVBFX0lEOyAvLyBJTVBPUlRBTlQ6IG5ldmVyIGNoYW5nZSB0aGlzIHRvIG5vdCBicmVhayBleGlzdGluZyBhc3N1bXB0aW9ucyAoZS5nLiBiYWNrdXBzKVxuXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllcyA9IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLk5vbmU7XG5cblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHJlc291cmNlSGFzRXh0ZW5zaW9uOiBib29sZWFuO1xuXG5cdHByaXZhdGUgY29udGVudEVuY29kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQ7IC8vIGVuY29kaW5nIGFzIHJlcG9ydGVkIGZyb20gZGlza1xuXG5cdHByaXZhdGUgdmVyc2lvbklkID0gMDtcblx0cHJpdmF0ZSBidWZmZXJTYXZlZFZlcnNpb25JZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgaWdub3JlRGlydHlPbk1vZGVsQ29udGVudENoYW5nZSA9IGZhbHNlO1xuXHRwcml2YXRlIGlnbm9yZVNhdmVGcm9tU2F2ZVBhcnRpY2lwYW50cyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVORE9fUkVET19TQVZFX1BBUlRJQ0lQQU5UU19BVVRPX1NBVkVfVEhST1RUTEVfVEhSRVNIT0xEID0gNTAwO1xuXHRwcml2YXRlIGxhc3RNb2RlbENvbnRlbnRDaGFuZ2VGcm9tVW5kb1JlZG86IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRsYXN0UmVzb2x2ZWRGaWxlU3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkOyAvLyAhISEgRE8gTk9UIE1BUksgUFJJVkFURSEgVVNFRCBJTiBURVNUUyAhISFcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNhdmVTZXF1ZW50aWFsaXplciA9IG5ldyBUYXNrU2VxdWVudGlhbGl6ZXIoKTtcblxuXHRwcml2YXRlIGRpcnR5ID0gZmFsc2U7XG5cdHByaXZhdGUgaW5Db25mbGljdE1vZGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBpbk9ycGhhbk1vZGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBpbkVycm9yTW9kZSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc291cmNlOiBVUkksXG5cdFx0cHJpdmF0ZSBwcmVmZXJyZWRFbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkLFx0XHQvLyBlbmNvZGluZyBhcyBjaG9zZW4gYnkgdGhlIHVzZXJcblx0XHRwcml2YXRlIHByZWZlcnJlZExhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcdC8vIGxhbmd1YWdlIGlkIGFzIGNob3NlbiBieSB0aGUgdXNlclxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weUJhY2t1cFNlcnZpY2U6IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZURldGVjdGlvblNlcnZpY2UgbGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgbGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlLCBhY2Nlc3NpYmlsaXR5U2VydmljZSk7XG5cblx0XHR0aGlzLm5hbWUgPSBiYXNlbmFtZSh0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh0aGlzLnJlc291cmNlKSk7XG5cdFx0dGhpcy5yZXNvdXJjZUhhc0V4dGVuc2lvbiA9ICEhZXh0VXJpLmV4dG5hbWUodGhpcy5yZXNvdXJjZSk7XG5cblx0XHQvLyBNYWtlIGtub3duIHRvIHdvcmtpbmcgY29weSBzZXJ2aWNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weVNlcnZpY2UucmVnaXN0ZXJXb3JraW5nQ29weSh0aGlzKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHRoaXMub25EaWRGaWxlc0NoYW5nZShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUZpbGVzQXNzb2NpYXRpb24oKCkgPT4gdGhpcy5vbkRpZENoYW5nZUZpbGVzQXNzb2NpYXRpb24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZVJlYWRvbmx5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlUmVhZG9ubHkuZmlyZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkRmlsZXNDaGFuZ2UoZTogRmlsZUNoYW5nZXNFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBmaWxlRXZlbnRJbXBhY3RzTW9kZWwgPSBmYWxzZTtcblx0XHRsZXQgbmV3SW5PcnBoYW5Nb2RlR3Vlc3M6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBJZiB3ZSBhcmUgY3VycmVudGx5IG9ycGhhbmVkLCB3ZSBjaGVjayBpZiB0aGUgbW9kZWwgZmlsZSB3YXMgYWRkZWQgYmFja1xuXHRcdGlmICh0aGlzLmluT3JwaGFuTW9kZSkge1xuXHRcdFx0Y29uc3QgbW9kZWxGaWxlQWRkZWQgPSBlLmNvbnRhaW5zKHRoaXMucmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRcdGlmIChtb2RlbEZpbGVBZGRlZCkge1xuXHRcdFx0XHRuZXdJbk9ycGhhbk1vZGVHdWVzcyA9IGZhbHNlO1xuXHRcdFx0XHRmaWxlRXZlbnRJbXBhY3RzTW9kZWwgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSB3ZSBjaGVjayBpZiB0aGUgbW9kZWwgZmlsZSB3YXMgZGVsZXRlZFxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgbW9kZWxGaWxlRGVsZXRlZCA9IGUuY29udGFpbnModGhpcy5yZXNvdXJjZSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0XHRpZiAobW9kZWxGaWxlRGVsZXRlZCkge1xuXHRcdFx0XHRuZXdJbk9ycGhhbk1vZGVHdWVzcyA9IHRydWU7XG5cdFx0XHRcdGZpbGVFdmVudEltcGFjdHNNb2RlbCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGZpbGVFdmVudEltcGFjdHNNb2RlbCAmJiB0aGlzLmluT3JwaGFuTW9kZSAhPT0gbmV3SW5PcnBoYW5Nb2RlR3Vlc3MpIHtcblx0XHRcdGxldCBuZXdJbk9ycGhhbk1vZGVWYWxpZGF0ZWQgPSBmYWxzZTtcblx0XHRcdGlmIChuZXdJbk9ycGhhbk1vZGVHdWVzcykge1xuXHRcdFx0XHQvLyBXZSBoYXZlIHJlY2VpdmVkIHJlcG9ydHMgb2YgdXNlcnMgc2VlaW5nIGRlbGV0ZSBldmVudHMgZXZlbiB0aG91Z2ggdGhlIGZpbGUgc3RpbGxcblx0XHRcdFx0Ly8gZXhpc3RzIChuZXR3b3JrIHNoYXJlcyBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzNjY1KS5cblx0XHRcdFx0Ly8gU2luY2Ugd2UgZG8gbm90IHdhbnQgdG8gbWFyayB0aGUgbW9kZWwgYXMgb3JwaGFuZWQsIHdlIGhhdmUgdG8gY2hlY2sgaWYgdGhlXG5cdFx0XHRcdC8vIGZpbGUgaXMgcmVhbGx5IGdvbmUgYW5kIG5vdCBqdXN0IGEgZmF1bHR5IGZpbGUgZXZlbnQuXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRuZXdJbk9ycGhhbk1vZGVWYWxpZGF0ZWQgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHRoaXMucmVzb3VyY2UpO1xuXHRcdFx0XHRcdG5ld0luT3JwaGFuTW9kZVZhbGlkYXRlZCA9ICFleGlzdHM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuaW5PcnBoYW5Nb2RlICE9PSBuZXdJbk9ycGhhbk1vZGVWYWxpZGF0ZWQgJiYgIXRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdHRoaXMuc2V0T3JwaGFuZWQobmV3SW5PcnBoYW5Nb2RlVmFsaWRhdGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldE9ycGhhbmVkKG9ycGhhbmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaW5PcnBoYW5Nb2RlICE9PSBvcnBoYW5lZCkge1xuXHRcdFx0dGhpcy5pbk9ycGhhbk1vZGUgPSBvcnBoYW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlT3JwaGFuZWQuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VGaWxlc0Fzc29jaWF0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdExpbmVUZXh0ID0gdGhpcy5nZXRGaXJzdExpbmVUZXh0KHRoaXMudGV4dEVkaXRvck1vZGVsKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlbGVjdGlvbiA9IHRoaXMuZ2V0T3JDcmVhdGVMYW5ndWFnZSh0aGlzLnJlc291cmNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSwgdGhpcy5wcmVmZXJyZWRMYW5ndWFnZUlkLCBmaXJzdExpbmVUZXh0KTtcblxuXHRcdHRoaXMudGV4dEVkaXRvck1vZGVsLnNldExhbmd1YWdlKGxhbmd1YWdlU2VsZWN0aW9uKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldExhbmd1YWdlSWQobGFuZ3VhZ2VJZDogc3RyaW5nLCBzb3VyY2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRzdXBlci5zZXRMYW5ndWFnZUlkKGxhbmd1YWdlSWQsIHNvdXJjZSk7XG5cblx0XHR0aGlzLnByZWZlcnJlZExhbmd1YWdlSWQgPSBsYW5ndWFnZUlkO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEJhY2t1cFxuXG5cdGFzeW5jIGJhY2t1cCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElXb3JraW5nQ29weUJhY2t1cD4ge1xuXG5cdFx0Ly8gRmlsbCBpbiBtZXRhZGF0YSBpZiB3ZSBhcmUgcmVzb2x2ZWRcblx0XHRsZXQgbWV0YTogSUJhY2t1cE1ldGFEYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0KSB7XG5cdFx0XHRtZXRhID0ge1xuXHRcdFx0XHRtdGltZTogdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdC5tdGltZSxcblx0XHRcdFx0Y3RpbWU6IHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQuY3RpbWUsXG5cdFx0XHRcdHNpemU6IHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQuc2l6ZSxcblx0XHRcdFx0ZXRhZzogdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdC5ldGFnLFxuXHRcdFx0XHRvcnBoYW5lZDogdGhpcy5pbk9ycGhhbk1vZGVcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gRmlsbCBpbiBjb250ZW50IHRoZSBzYW1lIHdheSB3ZSB3b3VsZCBkbyB3aGVuXG5cdFx0Ly8gc2F2aW5nIHRoZSBmaWxlIHZpYSB0aGUgdGV4dCBmaWxlIHNlcnZpY2Vcblx0XHQvLyBlbmNvZGluZyBzdXBwb3J0IChoYXJkY29kZSBVVEYtOClcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UuZ2V0RW5jb2RlZFJlYWRhYmxlKHRoaXMucmVzb3VyY2UsIHRoaXMuY3JlYXRlU25hcHNob3QoKSA/PyB1bmRlZmluZWQsIHsgZW5jb2Rpbmc6IFVURjggfSk7XG5cblx0XHRyZXR1cm4geyBtZXRhLCBjb250ZW50IH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUmV2ZXJ0XG5cblx0YXN5bmMgcmV2ZXJ0KG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVbnNldCBmbGFnc1xuXHRcdGNvbnN0IHdhc0RpcnR5ID0gdGhpcy5kaXJ0eTtcblx0XHRjb25zdCB1bmRvID0gdGhpcy5kb1NldERpcnR5KGZhbHNlKTtcblxuXHRcdC8vIEZvcmNlIHJlYWQgZnJvbSBkaXNrIHVubGVzcyByZXZlcnRpbmcgc29mdFxuXHRcdGNvbnN0IHNvZnRVbmRvID0gb3B0aW9ucz8uc29mdDtcblx0XHRpZiAoIXNvZnRVbmRvKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZvcmNlUmVzb2x2ZUZyb21GaWxlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHRcdC8vIEZpbGVOb3RGb3VuZCBtZWFucyB0aGUgZmlsZSBnb3QgZGVsZXRlZCBtZWFud2hpbGUsIHNvIGlnbm9yZSBpdFxuXHRcdFx0XHRpZiAoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblxuXHRcdFx0XHRcdC8vIFNldCBmbGFncyBiYWNrIHRvIHByZXZpb3VzIHZhbHVlcywgd2UgYXJlIHN0aWxsIGRpcnR5IGlmIHJldmVydCBmYWlsZWRcblx0XHRcdFx0XHR1bmRvKCk7XG5cblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEVtaXQgZmlsZSBjaGFuZ2UgZXZlbnRcblx0XHR0aGlzLl9vbkRpZFJldmVydC5maXJlKCk7XG5cblx0XHQvLyBFbWl0IGRpcnR5IGNoYW5nZSBldmVudFxuXHRcdGlmICh3YXNEaXJ0eSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJlc29sdmVcblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlKG9wdGlvbnM/OiBJVGV4dEZpbGVSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ3Jlc29sdmUoKSAtIGVudGVyJyk7XG5cdFx0bWFyaygnY29kZS93aWxsUmVzb2x2ZVRleHRGaWxlRWRpdG9yTW9kZWwnKTtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB3ZSBhcmUgZGlzcG9zZWRcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3Jlc29sdmUoKSAtIGV4aXQgLSB3aXRob3V0IHJlc29sdmluZyBiZWNhdXNlIG1vZGVsIGlzIGRpc3Bvc2VkJyk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVbmxlc3MgdGhlcmUgYXJlIGV4cGxpY2l0IGNvbnRlbnRzIHByb3ZpZGVkLCBpdCBpcyBpbXBvcnRhbnQgdGhhdCB3ZSBkbyBub3Rcblx0XHQvLyByZXNvbHZlIGEgbW9kZWwgdGhhdCBpcyBkaXJ0eSBvciBpcyBpbiB0aGUgcHJvY2VzcyBvZiBzYXZpbmcgdG8gcHJldmVudCBkYXRhXG5cdFx0Ly8gbG9zcy5cblx0XHRpZiAoIW9wdGlvbnM/LmNvbnRlbnRzICYmICh0aGlzLmRpcnR5IHx8IHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLmlzUnVubmluZygpKSkge1xuXHRcdFx0dGhpcy50cmFjZSgncmVzb2x2ZSgpIC0gZXhpdCAtIHdpdGhvdXQgcmVzb2x2aW5nIGJlY2F1c2UgbW9kZWwgaXMgZGlydHkgb3IgYmVpbmcgc2F2ZWQnKTtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgZWl0aGVyIGZyb20gYmFja3VwIG9yIGZyb20gZmlsZVxuXHRcdGF3YWl0IHRoaXMuZG9SZXNvbHZlKG9wdGlvbnMpO1xuXG5cdFx0bWFyaygnY29kZS9kaWRSZXNvbHZlVGV4dEZpbGVFZGl0b3JNb2RlbCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Jlc29sdmUob3B0aW9ucz86IElUZXh0RmlsZVJlc29sdmVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBGaXJzdCBjaGVjayBpZiB3ZSBoYXZlIGNvbnRlbnRzIHRvIHVzZSBmb3IgdGhlIG1vZGVsXG5cdFx0aWYgKG9wdGlvbnM/LmNvbnRlbnRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRnJvbUJ1ZmZlcihvcHRpb25zLmNvbnRlbnRzLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBTZWNvbmQsIGNoZWNrIGlmIHdlIGhhdmUgYSBiYWNrdXAgdG8gcmVzb2x2ZSBmcm9tIChvbmx5IGZvciBuZXcgbW9kZWxzKVxuXHRcdGNvbnN0IGlzTmV3TW9kZWwgPSAhdGhpcy5pc1Jlc29sdmVkKCk7XG5cdFx0aWYgKGlzTmV3TW9kZWwpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkRnJvbUJhY2t1cCA9IGF3YWl0IHRoaXMucmVzb2x2ZUZyb21CYWNrdXAob3B0aW9ucyk7XG5cdFx0XHRpZiAocmVzb2x2ZWRGcm9tQmFja3VwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaW5hbGx5LCByZXNvbHZlIGZyb20gZmlsZSByZXNvdXJjZVxuXHRcdHJldHVybiB0aGlzLnJlc29sdmVGcm9tRmlsZShvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUZyb21CdWZmZXIoYnVmZmVyOiBJVGV4dEJ1ZmZlckZhY3RvcnksIG9wdGlvbnM/OiBJVGV4dEZpbGVSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ3Jlc29sdmVGcm9tQnVmZmVyKCknKTtcblxuXHRcdC8vIFRyeSB0byByZXNvbHZlIG1ldGRhdGEgZnJvbSBkaXNrXG5cdFx0bGV0IG10aW1lOiBudW1iZXI7XG5cdFx0bGV0IGN0aW1lOiBudW1iZXI7XG5cdFx0bGV0IHNpemU6IG51bWJlcjtcblx0XHRsZXQgZXRhZzogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uuc3RhdCh0aGlzLnJlc291cmNlKTtcblx0XHRcdG10aW1lID0gbWV0YWRhdGEubXRpbWU7XG5cdFx0XHRjdGltZSA9IG1ldGFkYXRhLmN0aW1lO1xuXHRcdFx0c2l6ZSA9IG1ldGFkYXRhLnNpemU7XG5cdFx0XHRldGFnID0gbWV0YWRhdGEuZXRhZztcblxuXHRcdFx0Ly8gQ2xlYXIgb3JwaGFuZWQgc3RhdGUgd2hlbiByZXNvbHZpbmcgd2FzIHN1Y2Nlc3NmdWxcblx0XHRcdHRoaXMuc2V0T3JwaGFuZWQoZmFsc2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIFB1dCBzb21lIGZhbGxiYWNrIHZhbHVlcyBpbiBlcnJvciBjYXNlXG5cdFx0XHRtdGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRjdGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRzaXplID0gMDtcblx0XHRcdGV0YWcgPSBFVEFHX0RJU0FCTEVEO1xuXG5cdFx0XHQvLyBBcHBseSBvcnBoYW5lZCBzdGF0ZSBiYXNlZCBvbiBlcnJvciBjb2RlXG5cdFx0XHR0aGlzLnNldE9ycGhhbmVkKGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZWZlcnJlZEVuY29kaW5nID0gYXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UuZW5jb2RpbmcuZ2V0UHJlZmVycmVkV3JpdGVFbmNvZGluZyh0aGlzLnJlc291cmNlLCB0aGlzLnByZWZlcnJlZEVuY29kaW5nKTtcblxuXHRcdC8vIFJlc29sdmUgd2l0aCBidWZmZXJcblx0XHR0aGlzLnJlc29sdmVGcm9tQ29udGVudCh7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXNvdXJjZSxcblx0XHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRcdG10aW1lLFxuXHRcdFx0Y3RpbWUsXG5cdFx0XHRzaXplLFxuXHRcdFx0ZXRhZyxcblx0XHRcdHZhbHVlOiBidWZmZXIsXG5cdFx0XHRlbmNvZGluZzogcHJlZmVycmVkRW5jb2RpbmcuZW5jb2RpbmcsXG5cdFx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdFx0ZXhlY3V0YWJsZTogZmFsc2Vcblx0XHR9LCB0cnVlIC8qIGRpcnR5IChyZXNvbHZlZCBmcm9tIGJ1ZmZlcikgKi8sIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlRnJvbUJhY2t1cChvcHRpb25zPzogSVRleHRGaWxlUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIFJlc29sdmUgYmFja3VwIGlmIGFueVxuXHRcdGNvbnN0IGJhY2t1cCA9IGF3YWl0IHRoaXMud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLnJlc29sdmU8SUJhY2t1cE1ldGFEYXRhPih0aGlzKTtcblxuXHRcdC8vIFJlc29sdmUgcHJlZmVycmVkIGVuY29kaW5nIGlmIHdlIG5lZWQgaXRcblx0XHRsZXQgZW5jb2RpbmcgPSBVVEY4O1xuXHRcdGlmIChiYWNrdXApIHtcblx0XHRcdGVuY29kaW5nID0gKGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmVuY29kaW5nLmdldFByZWZlcnJlZFdyaXRlRW5jb2RpbmcodGhpcy5yZXNvdXJjZSwgdGhpcy5wcmVmZXJyZWRFbmNvZGluZykpLmVuY29kaW5nO1xuXHRcdH1cblxuXHRcdC8vIEFib3J0IGlmIHNvbWVvbmUgZWxzZSBtYW5hZ2VkIHRvIHJlc29sdmUgdGhlIG1vZGVsIGJ5IG5vd1xuXHRcdGNvbnN0IGlzTmV3TW9kZWwgPSAhdGhpcy5pc1Jlc29sdmVkKCk7XG5cdFx0aWYgKCFpc05ld01vZGVsKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdyZXNvbHZlRnJvbUJhY2t1cCgpIC0gZXhpdCAtIHdpdGhvdXQgcmVzb2x2aW5nIGJlY2F1c2UgcHJldmlvdXNseSBuZXcgbW9kZWwgZ290IGNyZWF0ZWQgbWVhbndoaWxlJyk7XG5cblx0XHRcdHJldHVybiB0cnVlOyAvLyBpbXBseSB0aGF0IHJlc29sdmluZyBoYXMgaGFwcGVuZWQgaW4gYW5vdGhlciBvcGVyYXRpb25cblx0XHR9XG5cblx0XHQvLyBUcnkgdG8gcmVzb2x2ZSBmcm9tIGJhY2t1cCBpZiB3ZSBoYXZlIGFueVxuXHRcdGlmIChiYWNrdXApIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9SZXNvbHZlRnJvbUJhY2t1cChiYWNrdXAsIGVuY29kaW5nLCBvcHRpb25zKTtcblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHNpZ25hbCBiYWNrIHRoYXQgcmVzb2x2aW5nIGRpZCBub3QgaGFwcGVuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Jlc29sdmVGcm9tQmFja3VwKGJhY2t1cDogSVJlc29sdmVkV29ya2luZ0NvcHlCYWNrdXA8SUJhY2t1cE1ldGFEYXRhPiwgZW5jb2Rpbmc6IHN0cmluZywgb3B0aW9ucz86IElUZXh0RmlsZVJlc29sdmVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgnZG9SZXNvbHZlRnJvbUJhY2t1cCgpJyk7XG5cblx0XHQvLyBSZXNvbHZlIHdpdGggYmFja3VwXG5cdFx0dGhpcy5yZXNvbHZlRnJvbUNvbnRlbnQoe1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRtdGltZTogYmFja3VwLm1ldGEgPyBiYWNrdXAubWV0YS5tdGltZSA6IERhdGUubm93KCksXG5cdFx0XHRjdGltZTogYmFja3VwLm1ldGEgPyBiYWNrdXAubWV0YS5jdGltZSA6IERhdGUubm93KCksXG5cdFx0XHRzaXplOiBiYWNrdXAubWV0YSA/IGJhY2t1cC5tZXRhLnNpemUgOiAwLFxuXHRcdFx0ZXRhZzogYmFja3VwLm1ldGEgPyBiYWNrdXAubWV0YS5ldGFnIDogRVRBR19ESVNBQkxFRCwgLy8gZXRhZyBkaXNhYmxlZCBpZiB1bmtub3duIVxuXHRcdFx0dmFsdWU6IGF3YWl0IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVN0cmVhbShhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5nZXREZWNvZGVkU3RyZWFtKHRoaXMucmVzb3VyY2UsIGJhY2t1cC52YWx1ZSwgeyBlbmNvZGluZzogVVRGOCB9KSksXG5cdFx0XHRlbmNvZGluZyxcblx0XHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRcdGxvY2tlZDogZmFsc2UsXG5cdFx0XHRleGVjdXRhYmxlOiBmYWxzZVxuXHRcdH0sIHRydWUgLyogZGlydHkgKHJlc29sdmVkIGZyb20gYmFja3VwKSAqLywgb3B0aW9ucyk7XG5cblx0XHQvLyBSZXN0b3JlIG9ycGhhbmVkIGZsYWcgYmFzZWQgb24gc3RhdGVcblx0XHRpZiAoYmFja3VwLm1ldGE/Lm9ycGhhbmVkKSB7XG5cdFx0XHR0aGlzLnNldE9ycGhhbmVkKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUZyb21GaWxlKG9wdGlvbnM/OiBJVGV4dEZpbGVSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ3Jlc29sdmVGcm9tRmlsZSgpJyk7XG5cblx0XHRjb25zdCBmb3JjZVJlYWRGcm9tRmlsZSA9IG9wdGlvbnM/LmZvcmNlUmVhZEZyb21GaWxlO1xuXHRcdGNvbnN0IGFsbG93QmluYXJ5ID0gdGhpcy5pc1Jlc29sdmVkKCkgLyogYWx3YXlzIGFsbG93IGlmIHdlIHJlc29sdmVkIHByZXZpb3VzbHkgKi8gfHwgb3B0aW9ucz8uYWxsb3dCaW5hcnk7XG5cblx0XHQvLyBEZWNpZGUgb24gZXRhZ1xuXHRcdGxldCBldGFnOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGZvcmNlUmVhZEZyb21GaWxlKSB7XG5cdFx0XHRldGFnID0gRVRBR19ESVNBQkxFRDsgLy8gZGlzYWJsZSBFVGFnIGlmIHdlIGVuZm9yY2UgdG8gcmVhZCBmcm9tIGRpc2tcblx0XHR9IGVsc2UgaWYgKHRoaXMubGFzdFJlc29sdmVkRmlsZVN0YXQpIHtcblx0XHRcdGV0YWcgPSB0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0LmV0YWc7IC8vIG90aGVyd2lzZSByZXNwZWN0IGV0YWcgdG8gc3VwcG9ydCBjYWNoaW5nXG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgY3VycmVudCB2ZXJzaW9uIGJlZm9yZSBkb2luZyBhbnkgbG9uZyBydW5uaW5nIG9wZXJhdGlvblxuXHRcdC8vIHRvIGVuc3VyZSB3ZSBhcmUgbm90IGNoYW5naW5nIGEgbW9kZWwgdGhhdCB3YXMgY2hhbmdlZCBtZWFud2hpbGVcblx0XHRjb25zdCBjdXJyZW50VmVyc2lvbklkID0gdGhpcy52ZXJzaW9uSWQ7XG5cblx0XHQvLyBSZXNvbHZlIENvbnRlbnRcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLnJlYWRTdHJlYW0odGhpcy5yZXNvdXJjZSwge1xuXHRcdFx0XHRhY2NlcHRUZXh0T25seTogIWFsbG93QmluYXJ5LFxuXHRcdFx0XHRldGFnLFxuXHRcdFx0XHRlbmNvZGluZzogdGhpcy5wcmVmZXJyZWRFbmNvZGluZyxcblx0XHRcdFx0bGltaXRzOiBvcHRpb25zPy5saW1pdHNcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBDbGVhciBvcnBoYW5lZCBzdGF0ZSB3aGVuIHJlc29sdmluZyB3YXMgc3VjY2Vzc2Z1bFxuXHRcdFx0dGhpcy5zZXRPcnBoYW5lZChmYWxzZSk7XG5cblx0XHRcdC8vIFJldHVybiBlYXJseSBpZiB0aGUgbW9kZWwgY29udGVudCBoYXMgY2hhbmdlZFxuXHRcdFx0Ly8gbWVhbndoaWxlIHRvIHByZXZlbnQgbG9vc2luZyBhbnkgY2hhbmdlc1xuXHRcdFx0aWYgKGN1cnJlbnRWZXJzaW9uSWQgIT09IHRoaXMudmVyc2lvbklkKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoJ3Jlc29sdmVGcm9tRmlsZSgpIC0gZXhpdCAtIHdpdGhvdXQgcmVzb2x2aW5nIGJlY2F1c2UgbW9kZWwgY29udGVudCBjaGFuZ2VkJyk7XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRnJvbUNvbnRlbnQoY29udGVudCwgZmFsc2UgLyogbm90IGRpcnR5IChyZXNvbHZlZCBmcm9tIGZpbGUpICovLCBvcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdDtcblxuXHRcdFx0Ly8gQXBwbHkgb3JwaGFuZWQgc3RhdGUgYmFzZWQgb24gZXJyb3IgY29kZVxuXHRcdFx0dGhpcy5zZXRPcnBoYW5lZChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXG5cdFx0XHQvLyBOb3RNb2RpZmllZCBzdGF0dXMgaXMgZXhwZWN0ZWQgYW5kIGNhbiBiZSBoYW5kbGVkIGdyYWNlZnVsbHlcblx0XHRcdC8vIGlmIHdlIGFyZSByZXNvbHZlZC4gV2Ugc3RpbGwgd2FudCB0byB1cGRhdGUgb3VyIGxhc3QgcmVzb2x2ZWRcblx0XHRcdC8vIHN0YXQgdG8gZS5nLiBkZXRlY3QgY2hhbmdlcyB0byB0aGUgZmlsZSdzIHJlYWRvbmx5IHN0YXRlXG5cdFx0XHRpZiAodGhpcy5pc1Jlc29sdmVkKCkgJiYgcmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX01PRElGSUVEX1NJTkNFKSB7XG5cdFx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUxhc3RSZXNvbHZlZEZpbGVTdGF0KGVycm9yLnN0YXQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVbmxlc3Mgd2UgYXJlIGZvcmNlZCB0byByZWFkIGZyb20gdGhlIGZpbGUsIElnbm9yZSB3aGVuIGEgbW9kZWwgaGFzIGJlZW4gcmVzb2x2ZWQgb25jZVxuXHRcdFx0Ly8gYW5kIHRoZSBmaWxlIHdhcyBkZWxldGVkIG1lYW53aGlsZS4gU2luY2Ugd2UgYWxyZWFkeSBoYXZlIHRoZSBtb2RlbCByZXNvbHZlZCwgd2UgY2FuIHJldHVyblxuXHRcdFx0Ly8gdG8gdGhpcyBzdGF0ZSBhbmQgdXBkYXRlIHRoZSBvcnBoYW5lZCBmbGFnIHRvIGluZGljYXRlIHRoYXQgdGhpcyBtb2RlbCBoYXMgbm8gdmVyc2lvbiBvblxuXHRcdFx0Ly8gZGlzayBhbnltb3JlLlxuXHRcdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpICYmIHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCAmJiAhZm9yY2VSZWFkRnJvbUZpbGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UgYnViYmxlIHVwIHRoZSBlcnJvclxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlRnJvbUNvbnRlbnQoY29udGVudDogSVRleHRGaWxlU3RyZWFtQ29udGVudCwgZGlydHk6IGJvb2xlYW4sIG9wdGlvbnM/OiBJVGV4dEZpbGVSZXNvbHZlT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2UoJ3Jlc29sdmVGcm9tQ29udGVudCgpIC0gZW50ZXInKTtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB3ZSBhcmUgZGlzcG9zZWRcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3Jlc29sdmVGcm9tQ29udGVudCgpIC0gZXhpdCAtIGJlY2F1c2UgbW9kZWwgaXMgZGlzcG9zZWQnKTtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBvdXIgcmVzb2x2ZWQgZGlzayBzdGF0IG1vZGVsXG5cdFx0dGhpcy51cGRhdGVMYXN0UmVzb2x2ZWRGaWxlU3RhdCh7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXNvdXJjZSxcblx0XHRcdG5hbWU6IGNvbnRlbnQubmFtZSxcblx0XHRcdG10aW1lOiBjb250ZW50Lm10aW1lLFxuXHRcdFx0Y3RpbWU6IGNvbnRlbnQuY3RpbWUsXG5cdFx0XHRzaXplOiBjb250ZW50LnNpemUsXG5cdFx0XHRldGFnOiBjb250ZW50LmV0YWcsXG5cdFx0XHRyZWFkb25seTogY29udGVudC5yZWFkb25seSxcblx0XHRcdGxvY2tlZDogY29udGVudC5sb2NrZWQsXG5cdFx0XHRleGVjdXRhYmxlOiBmYWxzZSxcblx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdGlzRGlyZWN0b3J5OiBmYWxzZSxcblx0XHRcdGlzU3ltYm9saWNMaW5rOiBmYWxzZSxcblx0XHRcdGNoaWxkcmVuOiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdC8vIEtlZXAgdGhlIG9yaWdpbmFsIGVuY29kaW5nIHRvIG5vdCBsb29zZSBpdCB3aGVuIHNhdmluZ1xuXHRcdGNvbnN0IG9sZEVuY29kaW5nID0gdGhpcy5jb250ZW50RW5jb2Rpbmc7XG5cdFx0dGhpcy5jb250ZW50RW5jb2RpbmcgPSBjb250ZW50LmVuY29kaW5nO1xuXG5cdFx0Ly8gSGFuZGxlIGV2ZW50cyBpZiBlbmNvZGluZyBjaGFuZ2VkXG5cdFx0aWYgKHRoaXMucHJlZmVycmVkRW5jb2RpbmcpIHtcblx0XHRcdHRoaXMudXBkYXRlUHJlZmVycmVkRW5jb2RpbmcodGhpcy5jb250ZW50RW5jb2RpbmcpOyAvLyBtYWtlIHN1cmUgdG8gcmVmbGVjdCB0aGUgcmVhbCBlbmNvZGluZyBvZiB0aGUgZmlsZSAobmV2ZXIgb3V0IG9mIHN5bmMpXG5cdFx0fSBlbHNlIGlmIChvbGRFbmNvZGluZyAhPT0gdGhpcy5jb250ZW50RW5jb2RpbmcpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRW5jb2RpbmcuZmlyZSgpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBFeGlzdGluZyBNb2RlbFxuXHRcdGlmICh0aGlzLnRleHRFZGl0b3JNb2RlbCkge1xuXHRcdFx0dGhpcy5kb1VwZGF0ZVRleHRNb2RlbChjb250ZW50LnZhbHVlLCBFZGl0U291cmNlcy5yZWxvYWRGcm9tRGlzaygpKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgTmV3IE1vZGVsXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmRvQ3JlYXRlVGV4dE1vZGVsKGNvbnRlbnQucmVzb3VyY2UsIGNvbnRlbnQudmFsdWUpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBtb2RlbCBkaXJ0eSBmbGFnLiBUaGlzIGlzIHZlcnkgaW1wb3J0YW50IHRvIGNhbGxcblx0XHQvLyBpbiBib3RoIGNhc2VzIG9mIGRpcnR5IG9yIG5vdCBiZWNhdXNlIGl0IGNvbmRpdGlvbmFsbHlcblx0XHQvLyB1cGRhdGVzIHRoZSBgYnVmZmVyU2F2ZWRWZXJzaW9uSWRgIHRvIGRldGVybWluZSB0aGVcblx0XHQvLyB2ZXJzaW9uIHdoZW4gdG8gY29uc2lkZXIgdGhlIG1vZGVsIGFzIHNhdmVkIGFnYWluIChlLmcuXG5cdFx0Ly8gd2hlbiB1bmRvaW5nIGJhY2sgdG8gdGhlIHNhdmVkIHN0YXRlKVxuXHRcdHRoaXMuc2V0RGlydHkoISFkaXJ0eSk7XG5cblx0XHQvLyBFbWl0IGFzIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRSZXNvbHZlLmZpcmUob3B0aW9ucz8ucmVhc29uID8/IFRleHRGaWxlUmVzb2x2ZVJlYXNvbi5PVEhFUik7XG5cdH1cblxuXHRwcml2YXRlIGRvQ3JlYXRlVGV4dE1vZGVsKHJlc291cmNlOiBVUkksIHZhbHVlOiBJVGV4dEJ1ZmZlckZhY3RvcnkpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNlKCdkb0NyZWF0ZVRleHRNb2RlbCgpJyk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWxcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLmNyZWF0ZVRleHRFZGl0b3JNb2RlbCh2YWx1ZSwgcmVzb3VyY2UsIHRoaXMucHJlZmVycmVkTGFuZ3VhZ2VJZCk7XG5cblx0XHQvLyBNb2RlbCBMaXN0ZW5lcnNcblx0XHR0aGlzLmluc3RhbGxNb2RlbExpc3RlbmVycyh0ZXh0TW9kZWwpO1xuXG5cdFx0Ly8gRGV0ZWN0IGxhbmd1YWdlIGZyb20gY29udGVudFxuXHRcdHRoaXMuYXV0b0RldGVjdExhbmd1YWdlKCk7XG5cdH1cblxuXHRwcml2YXRlIGRvVXBkYXRlVGV4dE1vZGVsKHZhbHVlOiBJVGV4dEJ1ZmZlckZhY3RvcnksIHJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2UoJ2RvVXBkYXRlVGV4dE1vZGVsKCknKTtcblxuXHRcdC8vIFVwZGF0ZSBtb2RlbCB2YWx1ZSBpbiBhIGJsb2NrIHRoYXQgaWdub3JlcyBjb250ZW50IGNoYW5nZSBldmVudHMgZm9yIGRpcnR5IHRyYWNraW5nXG5cdFx0dGhpcy5pZ25vcmVEaXJ0eU9uTW9kZWxDb250ZW50Q2hhbmdlID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy51cGRhdGVUZXh0RWRpdG9yTW9kZWwodmFsdWUsIHRoaXMucHJlZmVycmVkTGFuZ3VhZ2VJZCwgcmVhc29uKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5pZ25vcmVEaXJ0eU9uTW9kZWxDb250ZW50Q2hhbmdlID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGluc3RhbGxNb2RlbExpc3RlbmVycyhtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMDE4OVxuXHRcdC8vIFRoaXMgY29kZSBoYXMgYmVlbiBleHRyYWN0ZWQgdG8gYSBkaWZmZXJlbnQgbWV0aG9kIGJlY2F1c2UgaXQgY2F1c2VkIGEgbWVtb3J5IGxlYWtcblx0XHQvLyB3aGVyZSBgdmFsdWVgIHdhcyBjYXB0dXJlZCBpbiB0aGUgY29udGVudCBjaGFuZ2UgbGlzdGVuZXIgY2xvc3VyZSBzY29wZS5cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudChlID0+IHRoaXMub25Nb2RlbENvbnRlbnRDaGFuZ2VkKG1vZGVsLCBlLmlzVW5kb2luZyB8fCBlLmlzUmVkb2luZykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZUxhbmd1YWdlKCgpID0+IHRoaXMub25NYXliZVNob3VsZENoYW5nZUVuY29kaW5nKCkpKTsgLy8gZGV0ZWN0IHBvc3NpYmxlIGVuY29kaW5nIGNoYW5nZSB2aWEgbGFuZ3VhZ2Ugc3BlY2lmaWMgc2V0dGluZ3NcblxuXHRcdHN1cGVyLmluc3RhbGxNb2RlbExpc3RlbmVycyhtb2RlbCk7XG5cdH1cblxuXHRwcml2YXRlIG9uTW9kZWxDb250ZW50Q2hhbmdlZChtb2RlbDogSVRleHRNb2RlbCwgaXNVbmRvaW5nT3JSZWRvaW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy50cmFjZShgb25Nb2RlbENvbnRlbnRDaGFuZ2VkKCkgLSBlbnRlcmApO1xuXG5cdFx0Ly8gSW4gYW55IGNhc2UgaW5jcmVtZW50IHRoZSB2ZXJzaW9uIGlkIGJlY2F1c2UgaXQgdHJhY2tzIHRoZSB0ZXh0dWFsIGNvbnRlbnQgc3RhdGUgb2YgdGhlIG1vZGVsIGF0IGFsbCB0aW1lc1xuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cdFx0dGhpcy50cmFjZShgb25Nb2RlbENvbnRlbnRDaGFuZ2VkKCkgLSBuZXcgdmVyc2lvbklkICR7dGhpcy52ZXJzaW9uSWR9YCk7XG5cblx0XHQvLyBSZW1lbWJlciB3aGVuIHRoZSB1c2VyIGNoYW5nZWQgdGhlIG1vZGVsIHRocm91Z2ggYSB1bmRvL3JlZG8gb3BlcmF0aW9uLlxuXHRcdC8vIFdlIG5lZWQgdGhpcyBpbmZvcm1hdGlvbiB0byB0aHJvdHRsZSBzYXZlIHBhcnRpY2lwYW50cyB0byBmaXhcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTAyNTQyXG5cdFx0aWYgKGlzVW5kb2luZ09yUmVkb2luZykge1xuXHRcdFx0dGhpcy5sYXN0TW9kZWxDb250ZW50Q2hhbmdlRnJvbVVuZG9SZWRvID0gRGF0ZS5ub3coKTtcblx0XHR9XG5cblx0XHQvLyBXZSBtYXJrIGNoZWNrIGZvciBhIGRpcnR5LXN0YXRlIGNoYW5nZSB1cG9uIG1vZGVsIGNvbnRlbnQgY2hhbmdlLCB1bmxlc3M6XG5cdFx0Ly8gLSBleHBsaWNpdGx5IGluc3RydWN0ZWQgdG8gaWdub3JlIGl0IChlLmcuIGZyb20gbW9kZWwucmVzb2x2ZSgpKVxuXHRcdC8vIC0gdGhlIG1vZGVsIGlzIHJlYWRvbmx5IChpbiB0aGF0IGNhc2Ugd2UgbmV2ZXIgYXNzdW1lIHRoZSBjaGFuZ2Ugd2FzIGRvbmUgYnkgdGhlIHVzZXIpXG5cdFx0aWYgKCF0aGlzLmlnbm9yZURpcnR5T25Nb2RlbENvbnRlbnRDaGFuZ2UgJiYgIXRoaXMuaXNSZWFkb25seSgpKSB7XG5cblx0XHRcdC8vIFRoZSBjb250ZW50cyBjaGFuZ2VkIGFzIGEgbWF0dGVyIG9mIFVuZG8gYW5kIHRoZSB2ZXJzaW9uIHJlYWNoZWQgbWF0Y2hlcyB0aGUgc2F2ZWQgb25lXG5cdFx0XHQvLyBJbiB0aGlzIGNhc2Ugd2UgY2xlYXIgdGhlIGRpcnR5IGZsYWcgYW5kIGVtaXQgYSBTQVZFRCBldmVudCB0byBpbmRpY2F0ZSB0aGlzIHN0YXRlLlxuXHRcdFx0aWYgKG1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCkgPT09IHRoaXMuYnVmZmVyU2F2ZWRWZXJzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy50cmFjZSgnb25Nb2RlbENvbnRlbnRDaGFuZ2VkKCkgLSBtb2RlbCBjb250ZW50IGNoYW5nZWQgYmFjayB0byBsYXN0IHNhdmVkIHZlcnNpb24nKTtcblxuXHRcdFx0XHQvLyBDbGVhciBmbGFnc1xuXHRcdFx0XHRjb25zdCB3YXNEaXJ0eSA9IHRoaXMuZGlydHk7XG5cdFx0XHRcdHRoaXMuc2V0RGlydHkoZmFsc2UpO1xuXG5cdFx0XHRcdC8vIEVtaXQgcmV2ZXJ0IGV2ZW50IGlmIHdlIHdlcmUgZGlydHlcblx0XHRcdFx0aWYgKHdhc0RpcnR5KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXZlcnQuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE90aGVyd2lzZSB0aGUgY29udGVudCBoYXMgY2hhbmdlZCBhbmQgd2Ugc2lnbmFsIHRoaXMgYXMgYmVjb21pbmcgZGlydHlcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyYWNlKCdvbk1vZGVsQ29udGVudENoYW5nZWQoKSAtIG1vZGVsIGNvbnRlbnQgY2hhbmdlZCBhbmQgbWFya2VkIGFzIGRpcnR5Jyk7XG5cblx0XHRcdFx0Ly8gTWFyayBhcyBkaXJ0eVxuXHRcdFx0XHR0aGlzLnNldERpcnR5KHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEVtaXQgYXMgZXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgpO1xuXG5cdFx0Ly8gRGV0ZWN0IGxhbmd1YWdlIGZyb20gY29udGVudFxuXHRcdHRoaXMuYXV0b0RldGVjdExhbmd1YWdlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgYXV0b0RldGVjdExhbmd1YWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gV2FpdCB0byBiZSByZWFkeSB0byBkZXRlY3QgbGFuZ3VhZ2Vcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2U/LndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0Ly8gT25seSBwZXJmb3JtIGxhbmd1YWdlIGRldGVjdGlvbiBjb25kaXRpb25hbGx5XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdGlmIChcblx0XHRcdHRoaXMucmVzb3VyY2Uuc2NoZW1lID09PSB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUgJiZcdC8vIG1ha2Ugc3VyZSB0byBub3QgZGV0ZWN0IGxhbmd1YWdlIGZvciBub24tdXNlciB2aXNpYmxlIGRvY3VtZW50c1xuXHRcdFx0KCFsYW5ndWFnZUlkIHx8IGxhbmd1YWdlSWQgPT09IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCkgJiZcdFx0Ly8gb25seSBydW4gb24gZmlsZXMgd2l0aCBwbGFpbnRleHQgbGFuZ3VhZ2Ugc2V0IG9yIG5vIGxhbmd1YWdlIHNldCBhdCBhbGxcblx0XHRcdCF0aGlzLnJlc291cmNlSGFzRXh0ZW5zaW9uXHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBvbmx5IHJ1biBpZiB0aGlzIHBhcnRpY3VsYXIgZmlsZSBkb2Vzbid0IGhhdmUgYW4gZXh0ZW5zaW9uXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuYXV0b0RldGVjdExhbmd1YWdlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmb3JjZVJlc29sdmVGcm9tRmlsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGVhcmx5IHdoZW4gdGhlIG1vZGVsIGlzIGludmFsaWRcblx0XHR9XG5cblx0XHQvLyBXZSBnbyB0aHJvdWdoIHRoZSB0ZXh0IGZpbGUgc2VydmljZSB0byBtYWtlXG5cdFx0Ly8gc3VyZSB0aGlzIGtpbmQgb2YgYHJlc29sdmVgIGlzIHByb3Blcmx5XG5cdFx0Ly8gcnVubmluZyBpbiBzZXF1ZW5jZSB3aXRoIGFueSBvdGhlciBydW5uaW5nXG5cdFx0Ly8gYHJlc29sdmVgIGlmIGFueSwgaW5jbHVkaW5nIHN1YnNlcXVlbnQgcnVuc1xuXHRcdC8vIHRoYXQgYXJlIHRyaWdnZXJlZCByaWdodCBhZnRlci5cblxuXHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLnJlc29sdmUodGhpcy5yZXNvdXJjZSwge1xuXHRcdFx0cmVsb2FkOiB7IGFzeW5jOiBmYWxzZSB9LFxuXHRcdFx0Zm9yY2VSZWFkRnJvbUZpbGU6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBEaXJ0eVxuXG5cdGlzRGlydHkoKTogdGhpcyBpcyBJUmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5kaXJ0eTtcblx0fVxuXG5cdGlzTW9kaWZpZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNEaXJ0eSgpO1xuXHR9XG5cblx0c2V0RGlydHkoZGlydHk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgcmVzb2x2ZWQgbW9kZWxzIGNhbiBiZSBtYXJrZWQgZGlydHlcblx0XHR9XG5cblx0XHQvLyBUcmFjayBkaXJ0eSBzdGF0ZSBhbmQgdmVyc2lvbiBpZFxuXHRcdGNvbnN0IHdhc0RpcnR5ID0gdGhpcy5kaXJ0eTtcblx0XHR0aGlzLmRvU2V0RGlydHkoZGlydHkpO1xuXG5cdFx0Ly8gRW1pdCBhcyBFdmVudCBpZiBkaXJ0eSBjaGFuZ2VkXG5cdFx0aWYgKGRpcnR5ICE9PSB3YXNEaXJ0eSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1NldERpcnR5KGRpcnR5OiBib29sZWFuKTogKCkgPT4gdm9pZCB7XG5cdFx0Y29uc3Qgd2FzRGlydHkgPSB0aGlzLmRpcnR5O1xuXHRcdGNvbnN0IHdhc0luQ29uZmxpY3RNb2RlID0gdGhpcy5pbkNvbmZsaWN0TW9kZTtcblx0XHRjb25zdCB3YXNJbkVycm9yTW9kZSA9IHRoaXMuaW5FcnJvck1vZGU7XG5cdFx0Y29uc3Qgb2xkQnVmZmVyU2F2ZWRWZXJzaW9uSWQgPSB0aGlzLmJ1ZmZlclNhdmVkVmVyc2lvbklkO1xuXG5cdFx0aWYgKCFkaXJ0eSkge1xuXHRcdFx0dGhpcy5kaXJ0eSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5pbkNvbmZsaWN0TW9kZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5pbkVycm9yTW9kZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy51cGRhdGVTYXZlZFZlcnNpb25JZCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRpcnR5ID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gZnVuY3Rpb24gdG8gcmV2ZXJ0IHRoaXMgY2FsbFxuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHR0aGlzLmRpcnR5ID0gd2FzRGlydHk7XG5cdFx0XHR0aGlzLmluQ29uZmxpY3RNb2RlID0gd2FzSW5Db25mbGljdE1vZGU7XG5cdFx0XHR0aGlzLmluRXJyb3JNb2RlID0gd2FzSW5FcnJvck1vZGU7XG5cdFx0XHR0aGlzLmJ1ZmZlclNhdmVkVmVyc2lvbklkID0gb2xkQnVmZmVyU2F2ZWRWZXJzaW9uSWQ7XG5cdFx0fTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTYXZlXG5cblx0YXN5bmMgc2F2ZShvcHRpb25zOiBJVGV4dEZpbGVTYXZlQXNPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghdGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1JlYWRvbmx5KCkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3NhdmUoKSAtIGlnbm9yaW5nIHJlcXVlc3QgZm9yIHJlYWRvbmx5IHJlc291cmNlJyk7XG5cblx0XHRcdHJldHVybiBmYWxzZTsgLy8gaWYgbW9kZWwgaXMgcmVhZG9ubHkgd2UgZG8gbm90IGF0dGVtcHQgdG8gc2F2ZSBhdCBhbGxcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHQodGhpcy5oYXNTdGF0ZShUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuQ09ORkxJQ1QpIHx8IHRoaXMuaGFzU3RhdGUoVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLkVSUk9SKSkgJiZcblx0XHRcdChvcHRpb25zLnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPIHx8IG9wdGlvbnMucmVhc29uID09PSBTYXZlUmVhc29uLkZPQ1VTX0NIQU5HRSB8fCBvcHRpb25zLnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5XSU5ET1dfQ0hBTkdFKVxuXHRcdCkge1xuXHRcdFx0dGhpcy50cmFjZSgnc2F2ZSgpIC0gaWdub3JpbmcgYXV0byBzYXZlIHJlcXVlc3QgZm9yIG1vZGVsIHRoYXQgaXMgaW4gY29uZmxpY3Qgb3IgZXJyb3InKTtcblxuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBpZiBtb2RlbCBpcyBpbiBzYXZlIGNvbmZsaWN0IG9yIGVycm9yLCBkbyBub3Qgc2F2ZSB1bmxlc3Mgc2F2ZSByZWFzb24gaXMgZXhwbGljaXRcblx0XHR9XG5cblx0XHQvLyBBY3R1YWxseSBkbyBzYXZlIGFuZCBsb2dcblx0XHR0aGlzLnRyYWNlKCdzYXZlKCkgLSBlbnRlcicpO1xuXHRcdGF3YWl0IHRoaXMuZG9TYXZlKG9wdGlvbnMpO1xuXHRcdHRoaXMudHJhY2UoJ3NhdmUoKSAtIGV4aXQnKTtcblxuXHRcdHJldHVybiB0aGlzLmhhc1N0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5TQVZFRCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2F2ZShvcHRpb25zOiBJVGV4dEZpbGVTYXZlQXNPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLnJlYXNvbiAhPT0gJ251bWJlcicpIHtcblx0XHRcdG9wdGlvbnMucmVhc29uID0gU2F2ZVJlYXNvbi5FWFBMSUNJVDtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJzaW9uSWQgPSB0aGlzLnZlcnNpb25JZDtcblx0XHR0aGlzLnRyYWNlKGBkb1NhdmUoJHt2ZXJzaW9uSWR9KSAtIGVudGVyIHdpdGggdmVyc2lvbklkICR7dmVyc2lvbklkfWApO1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHNhdmVkIGZyb20gd2l0aGluIHNhdmUgcGFydGljaXBhbnQgdG8gYnJlYWsgcmVjdXJzaW9uXG5cdFx0Ly9cblx0XHQvLyBTY2VuYXJpbzogYSBzYXZlIHBhcnRpY2lwYW50IHRyaWdnZXJzIGEgc2F2ZSgpIG9uIHRoZSBtb2RlbFxuXHRcdGlmICh0aGlzLmlnbm9yZVNhdmVGcm9tU2F2ZVBhcnRpY2lwYW50cykge1xuXHRcdFx0dGhpcy50cmFjZShgZG9TYXZlKCR7dmVyc2lvbklkfSkgLSBleGl0IC0gcmVmdXNpbmcgdG8gc2F2ZSgpIHJlY3Vyc2l2ZWx5IGZyb20gc2F2ZSBwYXJ0aWNpcGFudGApO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTG9va3VwIGFueSBydW5uaW5nIHNhdmUgZm9yIHRoaXMgdmVyc2lvbklkIGFuZCByZXR1cm4gaXQgaWYgZm91bmRcblx0XHQvL1xuXHRcdC8vIFNjZW5hcmlvOiB1c2VyIGludm9rZWQgdGhlIHNhdmUgYWN0aW9uIG11bHRpcGxlIHRpbWVzIHF1aWNrbHkgZm9yIHRoZSBzYW1lIGNvbnRlbnRzXG5cdFx0Ly8gICAgICAgICAgIHdoaWxlIHRoZSBzYXZlIHdhcyBub3QgeWV0IGZpbmlzaGVkIHRvIGRpc2tcblx0XHQvL1xuXHRcdGlmICh0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5pc1J1bm5pbmcodmVyc2lvbklkKSkge1xuXHRcdFx0dGhpcy50cmFjZShgZG9TYXZlKCR7dmVyc2lvbklkfSkgLSBleGl0IC0gZm91bmQgYSBydW5uaW5nIHNhdmUgZm9yIHZlcnNpb25JZCAke3ZlcnNpb25JZH1gKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLnJ1bm5pbmc7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIG5vdCBkaXJ0eSAodW5sZXNzIGZvcmNlZClcblx0XHQvL1xuXHRcdC8vIFNjZW5hcmlvOiB1c2VyIGludm9rZWQgc2F2ZSBhY3Rpb24gZXZlbiB0aG91Z2ggdGhlIG1vZGVsIGlzIG5vdCBkaXJ0eVxuXHRcdGlmICghb3B0aW9ucy5mb3JjZSAmJiAhdGhpcy5kaXJ0eSkge1xuXHRcdFx0dGhpcy50cmFjZShgZG9TYXZlKCR7dmVyc2lvbklkfSkgLSBleGl0IC0gYmVjYXVzZSBub3QgZGlydHkgYW5kL29yIHZlcnNpb25JZCBpcyBkaWZmZXJlbnQgKHRoaXMuaXNEaXJ0eTogJHt0aGlzLmRpcnR5fSwgdGhpcy52ZXJzaW9uSWQ6ICR7dGhpcy52ZXJzaW9uSWR9KWApO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGlmIGN1cnJlbnRseSBzYXZpbmcgYnkgc3RvcmluZyB0aGlzIHNhdmUgcmVxdWVzdCBhcyB0aGUgbmV4dCBzYXZlIHRoYXQgc2hvdWxkIGhhcHBlbi5cblx0XHQvLyBOZXZlciBldmVyIG11c3QgMiBzYXZlcyBleGVjdXRlIGF0IHRoZSBzYW1lIHRpbWUgYmVjYXVzZSB0aGlzIGNhbiBsZWFkIHRvIGRpcnR5IHdyaXRlcyBhbmQgcmFjZSBjb25kaXRpb25zLlxuXHRcdC8vXG5cdFx0Ly8gU2NlbmFyaW8gQTogYXV0byBzYXZlIHdhcyB0cmlnZ2VyZWQgYW5kIGlzIGN1cnJlbnRseSBidXN5IHNhdmluZyB0byBkaXNrLiB0aGlzIHRha2VzIGxvbmcgZW5vdWdoIHRoYXQgYW5vdGhlciBhdXRvIHNhdmVcblx0XHQvLyAgICAgICAgICAgICBraWNrcyBpbi5cblx0XHQvLyBTY2VuYXJpbyBCOiBzYXZlIGlzIHZlcnkgc2xvdyAoZS5nLiBuZXR3b3JrIHNoYXJlKSBhbmQgdGhlIHVzZXIgbWFuYWdlcyB0byBjaGFuZ2UgdGhlIGJ1ZmZlciBhbmQgdHJpZ2dlciBhbm90aGVyIHNhdmVcblx0XHQvLyAgICAgICAgICAgICB3aGlsZSB0aGUgZmlyc3Qgc2F2ZSBoYXMgbm90IHJldHVybmVkIHlldC5cblx0XHQvL1xuXHRcdGlmICh0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoKSkge1xuXHRcdFx0dGhpcy50cmFjZShgZG9TYXZlKCR7dmVyc2lvbklkfSkgLSBleGl0IC0gYmVjYXVzZSBidXN5IHNhdmluZ2ApO1xuXG5cdFx0XHQvLyBJbmRpY2F0ZSB0byB0aGUgc2F2ZSBzZXF1ZW50aWFsaXplciB0aGF0IHdlIHdhbnQgdG9cblx0XHRcdC8vIGNhbmNlbCB0aGUgcnVubmluZyBvcGVyYXRpb24gc28gdGhhdCBvdXJzIGNhbiBydW5cblx0XHRcdC8vIGJlZm9yZSB0aGUgcnVubmluZyBvbmUgZmluaXNoZXMuXG5cdFx0XHQvLyBDdXJyZW50bHkgdGhpcyB3aWxsIHRyeSB0byBjYW5jZWwgcnVubmluZyBzYXZlXG5cdFx0XHQvLyBwYXJ0aWNpcGFudHMgYnV0IG5ldmVyIGEgcnVubmluZyBzYXZlLlxuXHRcdFx0dGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIuY2FuY2VsUnVubmluZygpO1xuXG5cdFx0XHQvLyBRdWV1ZSB0aGlzIGFzIHRoZSB1cGNvbWluZyBzYXZlIGFuZCByZXR1cm5cblx0XHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5xdWV1ZSgoKSA9PiB0aGlzLmRvU2F2ZShvcHRpb25zKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUHVzaCBhbGwgZWRpdCBvcGVyYXRpb25zIHRvIHRoZSB1bmRvIHN0YWNrIHNvIHRoYXQgdGhlIHVzZXIgaGFzIGEgY2hhbmNlIHRvXG5cdFx0Ly8gQ3RybCtaIGJhY2sgdG8gdGhlIHNhdmVkIHZlcnNpb24uXG5cdFx0aWYgKHRoaXMuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHR0aGlzLnRleHRFZGl0b3JNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZUNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0cmV0dXJuIHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NhdmVQYXJ0aWNpcGFudHMnLCBcIlNhdmluZyAnezB9J1wiLCB0aGlzLm5hbWUpLFxuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LFxuXHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsXG5cdFx0XHRkZWxheTogdGhpcy5pc0RpcnR5KCkgPyAzMDAwIDogNTAwMFxuXHRcdH0sIHByb2dyZXNzID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmRvU2F2ZVNlcXVlbnRpYWwodmVyc2lvbklkLCBvcHRpb25zLCBwcm9ncmVzcywgc2F2ZUNhbmNlbGxhdGlvbik7XG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0c2F2ZUNhbmNlbGxhdGlvbi5jYW5jZWwoKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHNhdmVDYW5jZWxsYXRpb24uZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NhdmVTZXF1ZW50aWFsKHZlcnNpb25JZDogbnVtYmVyLCBvcHRpb25zOiBJVGV4dEZpbGVTYXZlQXNPcHRpb25zLCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCBzYXZlQ2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5ydW4odmVyc2lvbklkLCAoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHQvLyBBIHNhdmUgcGFydGljaXBhbnQgY2FuIHN0aWxsIGNoYW5nZSB0aGUgbW9kZWwgbm93IGFuZCBzaW5jZSB3ZSBhcmUgc28gY2xvc2UgdG8gc2F2aW5nXG5cdFx0XHQvLyB3ZSBkbyBub3Qgd2FudCB0byB0cmlnZ2VyIGFub3RoZXIgYXV0byBzYXZlIG9yIHNpbWlsYXIsIHNvIHdlIGJsb2NrIHRoaXNcblx0XHRcdC8vIEluIGFkZGl0aW9uIHdlIHVwZGF0ZSBvdXIgdmVyc2lvbiByaWdodCBhZnRlciBpbiBjYXNlIGl0IGNoYW5nZWQgYmVjYXVzZSBvZiBhIG1vZGVsIGNoYW5nZVxuXHRcdFx0Ly9cblx0XHRcdC8vIFNhdmUgcGFydGljaXBhbnRzIGNhbiBhbHNvIGJlIHNraXBwZWQgdGhyb3VnaCBBUEkuXG5cdFx0XHRpZiAodGhpcy5pc1Jlc29sdmVkKCkgJiYgIW9wdGlvbnMuc2tpcFNhdmVQYXJ0aWNpcGFudHMpIHtcblx0XHRcdFx0dHJ5IHtcblxuXHRcdFx0XHRcdC8vIE1lYXN1cmUgdGhlIHRpbWUgaXQgdG9vayBmcm9tIHRoZSBsYXN0IHVuZG8vcmVkbyBvcGVyYXRpb24gdG8gdGhpcyBzYXZlLiBJZiB0aGlzXG5cdFx0XHRcdFx0Ly8gdGltZSBpcyBiZWxvdyBgVU5ET19SRURPX1NBVkVfUEFSVElDSVBBTlRTX1RIUk9UVExFX1RIUkVTSE9MRGAsIHdlIG1ha2Ugc3VyZSB0b1xuXHRcdFx0XHRcdC8vIGRlbGF5IHRoZSBzYXZlIHBhcnRpY2lwYW50IGZvciB0aGUgcmVtYWluaW5nIHRpbWUgaWYgdGhlIHJlYXNvbiBpcyBhdXRvIHNhdmUuXG5cdFx0XHRcdFx0Ly9cblx0XHRcdFx0XHQvLyBUaGlzIGZpeGVzIHRoZSBmb2xsb3dpbmcgaXNzdWU6XG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciBoYXMgY29uZmlndXJlZCBhdXRvIHNhdmUgd2l0aCBkZWxheSBvZiAxMDBtcyBvciBzaG9ydGVyXG5cdFx0XHRcdFx0Ly8gLSB0aGUgdXNlciBoYXMgYSBzYXZlIHBhcnRpY2lwYW50IGVuYWJsZWQgdGhhdCBtb2RpZmllcyB0aGUgZmlsZSBvbiBlYWNoIHNhdmVcblx0XHRcdFx0XHQvLyAtIHRoZSB1c2VyIHR5cGVzIGludG8gdGhlIGZpbGUgYW5kIHRoZSBmaWxlIGdldHMgc2F2ZWRcblx0XHRcdFx0XHQvLyAtIHRoZSB1c2VyIHRyaWdnZXJzIHVuZG8gb3BlcmF0aW9uXG5cdFx0XHRcdFx0Ly8gLSB0aGlzIHdpbGwgdW5kbyB0aGUgc2F2ZSBwYXJ0aWNpcGFudCBjaGFuZ2UgYnV0IHRyaWdnZXIgdGhlIHNhdmUgcGFydGljaXBhbnQgcmlnaHQgYWZ0ZXJcblx0XHRcdFx0XHQvLyAtIHRoZSB1c2VyIGhhcyBubyBjaGFuY2UgdG8gdW5kbyBvdmVyIHRoZSBzYXZlIHBhcnRpY2lwYW50XG5cdFx0XHRcdFx0Ly9cblx0XHRcdFx0XHQvLyBSZXBvcnRlZCBhczogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwMjU0MlxuXHRcdFx0XHRcdGlmIChvcHRpb25zLnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPICYmIHR5cGVvZiB0aGlzLmxhc3RNb2RlbENvbnRlbnRDaGFuZ2VGcm9tVW5kb1JlZG8gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0aW1lRnJvbVVuZG9SZWRvVG9TYXZlID0gRGF0ZS5ub3coKSAtIHRoaXMubGFzdE1vZGVsQ29udGVudENoYW5nZUZyb21VbmRvUmVkbztcblx0XHRcdFx0XHRcdGlmICh0aW1lRnJvbVVuZG9SZWRvVG9TYXZlIDwgVGV4dEZpbGVFZGl0b3JNb2RlbC5VTkRPX1JFRE9fU0FWRV9QQVJUSUNJUEFOVFNfQVVUT19TQVZFX1RIUk9UVExFX1RIUkVTSE9MRCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KFRleHRGaWxlRWRpdG9yTW9kZWwuVU5ET19SRURPX1NBVkVfUEFSVElDSVBBTlRTX0FVVE9fU0FWRV9USFJPVFRMRV9USFJFU0hPTEQgLSB0aW1lRnJvbVVuZG9SZWRvVG9TYXZlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSdW4gc2F2ZSBwYXJ0aWNpcGFudHMgdW5sZXNzIHNhdmUgd2FzIGNhbmNlbGxlZCBtZWFud2hpbGVcblx0XHRcdFx0XHRpZiAoIXNhdmVDYW5jZWxsYXRpb24udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuaWdub3JlU2F2ZUZyb21TYXZlUGFydGljaXBhbnRzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLnJ1blNhdmVQYXJ0aWNpcGFudHModGhpcywgeyByZWFzb246IG9wdGlvbnMucmVhc29uID8/IFNhdmVSZWFzb24uRVhQTElDSVQsIHNhdmVkRnJvbTogb3B0aW9ucy5mcm9tIH0sIHByb2dyZXNzLCBzYXZlQ2FuY2VsbGF0aW9uLnRva2VuKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpICYmICFzYXZlQ2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gcGFydGljaXBhbnQgd2FudHMgdG8gY2FuY2VsIHRoaXMgb3BlcmF0aW9uXG5cdFx0XHRcdFx0XHRcdFx0c2F2ZUNhbmNlbGxhdGlvbi5jYW5jZWwoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5pZ25vcmVTYXZlRnJvbVNhdmVQYXJ0aWNpcGFudHMgPSBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbdGV4dCBmaWxlIG1vZGVsXSBydW5TYXZlUGFydGljaXBhbnRzKCR7dmVyc2lvbklkfSkgLSByZXN1bHRlZCBpbiBhbiBlcnJvcjogJHtlcnJvci50b1N0cmluZygpfWAsIHRoaXMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSXQgaXMgcG9zc2libGUgdGhhdCBhIHN1YnNlcXVlbnQgc2F2ZSBpcyBjYW5jZWxsaW5nIHRoaXNcblx0XHRcdC8vIHJ1bm5pbmcgc2F2ZS4gQXMgc3VjaCB3ZSByZXR1cm4gZWFybHkgd2hlbiB3ZSBkZXRlY3QgdGhhdFxuXHRcdFx0Ly8gSG93ZXZlciwgd2UgZG8gbm90IHBhc3MgdGhlIHRva2VuIGludG8gdGhlIGZpbGUgc2VydmljZVxuXHRcdFx0Ly8gYmVjYXVzZSB0aGF0IGlzIGFuIGF0b21pYyBvcGVyYXRpb24gY3VycmVudGx5IHdpdGhvdXRcblx0XHRcdC8vIGNhbmNlbGxhdGlvbiBzdXBwb3J0LCBzbyB3ZSBkaXNwb3NlIHRoZSBjYW5jZWxsYXRpb24gaWZcblx0XHRcdC8vIGl0IHdhcyBub3QgY2FuY2VsbGVkIHlldC5cblx0XHRcdGlmIChzYXZlQ2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNhdmVDYW5jZWxsYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBoYXZlIHRvIHByb3RlY3QgYWdhaW5zdCBiZWluZyBkaXNwb3NlZCBhdCB0aGlzIHBvaW50LiBJdCBjb3VsZCBiZSB0aGF0IHRoZSBzYXZlKCkgb3BlcmF0aW9uXG5cdFx0XHQvLyB3YXMgdHJpZ2dlcmQgZm9sbG93ZWQgYnkgYSBkaXNwb3NlKCkgb3BlcmF0aW9uIHJpZ2h0IGFmdGVyIHdpdGhvdXQgd2FpdGluZy4gVHlwaWNhbGx5IHdlIGNhbm5vdFxuXHRcdFx0Ly8gYmUgZGlzcG9zZWQgaWYgd2UgYXJlIGRpcnR5LCBidXQgaWYgd2UgYXJlIG5vdCBkaXJ0eSwgc2F2ZSgpIGFuZCBkaXNwb3NlKCkgY2FuIHN0aWxsIGJlIHRyaWdnZXJlZFxuXHRcdFx0Ly8gb25lIGFmdGVyIHRoZSBvdGhlciB3aXRob3V0IHdhaXRpbmcgZm9yIHRoZSBzYXZlKCkgdG8gY29tcGxldGUuIElmIHdlIGFyZSBkaXNwb3NlZCgpLCB3ZSByaXNrXG5cdFx0XHQvLyBzYXZpbmcgY29udGVudHMgdG8gZGlzayB0aGF0IGFyZSBzdGFsZSAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy81MDk0MikuXG5cdFx0XHQvLyBUbyBmaXggdGhpcyBpc3N1ZSwgd2Ugd2lsbCBub3Qgc3RvcmUgdGhlIGNvbnRlbnRzIHRvIGRpc2sgd2hlbiB3ZSBnb3QgZGlzcG9zZWQuXG5cdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSByZXF1aXJlIGEgcmVzb2x2ZWQgbW9kZWwgZnJvbSB0aGlzIHBvaW50IG9uLCBzaW5jZSB3ZSBhcmUgYWJvdXQgdG8gd3JpdGUgZGF0YSB0byBkaXNrLlxuXHRcdFx0aWYgKCF0aGlzLmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIHVwZGF0ZSB2ZXJzaW9uSWQgd2l0aCBpdHMgbmV3IHZhbHVlIChpZiBwcmUtc2F2ZSBjaGFuZ2VzIGhhcHBlbmVkKVxuXHRcdFx0dmVyc2lvbklkID0gdGhpcy52ZXJzaW9uSWQ7XG5cblx0XHRcdC8vIENsZWFyIGVycm9yIGZsYWcgc2luY2Ugd2UgYXJlIHRyeWluZyB0byBzYXZlIGFnYWluXG5cdFx0XHR0aGlzLmluRXJyb3JNb2RlID0gZmFsc2U7XG5cblx0XHRcdC8vIFNhdmUgdG8gRGlzay4gV2UgbWFyayB0aGUgc2F2ZSBvcGVyYXRpb24gYXMgY3VycmVudGx5IHJ1bm5pbmcgd2l0aFxuXHRcdFx0Ly8gdGhlIGxhdGVzdCB2ZXJzaW9uSWQgYmVjYXVzZSBpdCBtaWdodCBoYXZlIGNoYW5nZWQgZnJvbSBhIHNhdmVcblx0XHRcdC8vIHBhcnRpY2lwYW50IHRyaWdnZXJpbmdcblx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdzYXZlVGV4dEZpbGUnLCBcIldyaXRpbmcgaW50byBmaWxlLi4uXCIpIH0pO1xuXHRcdFx0dGhpcy50cmFjZShgZG9TYXZlKCR7dmVyc2lvbklkfSkgLSBiZWZvcmUgd3JpdGUoKWApO1xuXHRcdFx0Y29uc3QgbGFzdFJlc29sdmVkRmlsZVN0YXQgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0KTtcblx0XHRcdGNvbnN0IHJlc29sdmVkVGV4dEZpbGVFZGl0b3JNb2RlbCA9IHRoaXM7XG5cdFx0XHRyZXR1cm4gdGhpcy5zYXZlU2VxdWVudGlhbGl6ZXIucnVuKHZlcnNpb25JZCwgKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2Uud3JpdGUobGFzdFJlc29sdmVkRmlsZVN0YXQucmVzb3VyY2UsIHJlc29sdmVkVGV4dEZpbGVFZGl0b3JNb2RlbC5jcmVhdGVTbmFwc2hvdCgpLCB7XG5cdFx0XHRcdFx0XHRtdGltZTogbGFzdFJlc29sdmVkRmlsZVN0YXQubXRpbWUsXG5cdFx0XHRcdFx0XHRlbmNvZGluZzogdGhpcy5nZXRFbmNvZGluZygpLFxuXHRcdFx0XHRcdFx0ZXRhZzogKG9wdGlvbnMuaWdub3JlTW9kaWZpZWRTaW5jZSB8fCAhdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnByZXZlbnRTYXZlQ29uZmxpY3RzKGxhc3RSZXNvbHZlZEZpbGVTdGF0LnJlc291cmNlLCByZXNvbHZlZFRleHRGaWxlRWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKSkgPyBFVEFHX0RJU0FCTEVEIDogbGFzdFJlc29sdmVkRmlsZVN0YXQuZXRhZyxcblx0XHRcdFx0XHRcdHVubG9jazogb3B0aW9ucy53cml0ZVVubG9jayxcblx0XHRcdFx0XHRcdHdyaXRlRWxldmF0ZWQ6IG9wdGlvbnMud3JpdGVFbGV2YXRlZFxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVTYXZlU3VjY2VzcyhzdGF0LCB2ZXJzaW9uSWQsIG9wdGlvbnMpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlU2F2ZUVycm9yKGVycm9yLCB2ZXJzaW9uSWQsIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpKTtcblx0XHR9KSgpLCAoKSA9PiBzYXZlQ2FuY2VsbGF0aW9uLmNhbmNlbCgpKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlU2F2ZVN1Y2Nlc3Moc3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCB2ZXJzaW9uSWQ6IG51bWJlciwgb3B0aW9uczogSVRleHRGaWxlU2F2ZUFzT3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlZCByZXNvbHZlZCBzdGF0IHdpdGggdXBkYXRlZCBzdGF0XG5cdFx0dGhpcy51cGRhdGVMYXN0UmVzb2x2ZWRGaWxlU3RhdChzdGF0KTtcblxuXHRcdC8vIFVwZGF0ZSBkaXJ0eSBzdGF0ZSB1bmxlc3MgbW9kZWwgaGFzIGNoYW5nZWQgbWVhbndoaWxlXG5cdFx0aWYgKHZlcnNpb25JZCA9PT0gdGhpcy52ZXJzaW9uSWQpIHtcblx0XHRcdHRoaXMudHJhY2UoYGhhbmRsZVNhdmVTdWNjZXNzKCR7dmVyc2lvbklkfSkgLSBzZXR0aW5nIGRpcnR5IHRvIGZhbHNlIGJlY2F1c2UgdmVyc2lvbklkIGRpZCBub3QgY2hhbmdlYCk7XG5cdFx0XHR0aGlzLnNldERpcnR5KGZhbHNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmFjZShgaGFuZGxlU2F2ZVN1Y2Nlc3MoJHt2ZXJzaW9uSWR9KSAtIG5vdCBzZXR0aW5nIGRpcnR5IHRvIGZhbHNlIGJlY2F1c2UgdmVyc2lvbklkIGRpZCBjaGFuZ2UgbWVhbndoaWxlYCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIG9ycGhhbiBzdGF0ZSBnaXZlbiBzYXZlIHdhcyBzdWNjZXNzZnVsXG5cdFx0dGhpcy5zZXRPcnBoYW5lZChmYWxzZSk7XG5cblx0XHQvLyBFbWl0IFNhdmUgRXZlbnRcblx0XHR0aGlzLl9vbkRpZFNhdmUuZmlyZSh7IHJlYXNvbjogb3B0aW9ucy5yZWFzb24sIHN0YXQsIHNvdXJjZTogb3B0aW9ucy5zb3VyY2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVNhdmVFcnJvcihlcnJvcjogRXJyb3IsIHZlcnNpb25JZDogbnVtYmVyLCBvcHRpb25zOiBJVGV4dEZpbGVTYXZlQXNPcHRpb25zKTogdm9pZCB7XG5cdFx0KG9wdGlvbnMuaWdub3JlRXJyb3JIYW5kbGVyID8gdGhpcy5sb2dTZXJ2aWNlLnRyYWNlIDogdGhpcy5sb2dTZXJ2aWNlLmVycm9yKS5hcHBseSh0aGlzLmxvZ1NlcnZpY2UsIFtgW3RleHQgZmlsZSBtb2RlbF0gaGFuZGxlU2F2ZUVycm9yKCR7dmVyc2lvbklkfSkgLSBleGl0IC0gcmVzdWx0ZWQgaW4gYSBzYXZlIGVycm9yOiAke2Vycm9yLnRvU3RyaW5nKCl9YCwgdGhpcy5yZXNvdXJjZS50b1N0cmluZygpXSk7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIHNhdmUoKSBjYWxsIHdhcyBtYWRlIGFza2luZyB0b1xuXHRcdC8vIGhhbmRsZSB0aGUgc2F2ZSBlcnJvciBpdHNlbGYuXG5cdFx0aWYgKG9wdGlvbnMuaWdub3JlRXJyb3JIYW5kbGVyKSB7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHQvLyBJbiBhbnkgY2FzZSBvZiBhbiBlcnJvciwgd2UgbWFyayB0aGUgbW9kZWwgYXMgZGlydHkgdG8gcHJldmVudCBkYXRhIGxvc3Ncblx0XHQvLyBJdCBjb3VsZCBiZSBwb3NzaWJsZSB0aGF0IHRoZSB3cml0ZSBjb3JydXB0ZWQgdGhlIGZpbGUgb24gZGlzayAoZS5nLiB3aGVuXG5cdFx0Ly8gYW4gZXJyb3IgaGFwcGVuZWQgYWZ0ZXIgdHJ1bmNhdGluZyB0aGUgZmlsZSkgYW5kIGFzIHN1Y2ggd2Ugd2FudCB0byBwcmVzZXJ2ZVxuXHRcdC8vIHRoZSBtb2RlbCBjb250ZW50cyB0byBwcmV2ZW50IGRhdGEgbG9zcy5cblx0XHR0aGlzLnNldERpcnR5KHRydWUpO1xuXG5cdFx0Ly8gRmxhZyBhcyBlcnJvciBzdGF0ZSBpbiB0aGUgbW9kZWxcblx0XHR0aGlzLmluRXJyb3JNb2RlID0gdHJ1ZTtcblxuXHRcdC8vIExvb2sgb3V0IGZvciBhIHNhdmUgY29uZmxpY3Rcblx0XHRpZiAoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSkge1xuXHRcdFx0dGhpcy5pbkNvbmZsaWN0TW9kZSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyB0byB1c2VyXG5cdFx0dGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMuc2F2ZUVycm9ySGFuZGxlci5vblNhdmVFcnJvcihlcnJvciwgdGhpcywgb3B0aW9ucyk7XG5cblx0XHQvLyBFbWl0IGFzIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRTYXZlRXJyb3IuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTYXZlZFZlcnNpb25JZCgpOiB2b2lkIHtcblx0XHQvLyB3ZSByZW1lbWJlciB0aGUgbW9kZWxzIGFsdGVybmF0ZSB2ZXJzaW9uIGlkIHRvIHJlbWVtYmVyIHdoZW4gdGhlIHZlcnNpb25cblx0XHQvLyBvZiB0aGUgbW9kZWwgbWF0Y2hlcyB3aXRoIHRoZSBzYXZlZCB2ZXJzaW9uIG9uIGRpc2suIHdlIG5lZWQgdG8ga2VlcCB0aGlzXG5cdFx0Ly8gaW4gb3JkZXIgdG8gZmluZCBvdXQgaWYgdGhlIG1vZGVsIGNoYW5nZWQgYmFjayB0byBhIHNhdmVkIHZlcnNpb24gKGUuZy5cblx0XHQvLyB3aGVuIHVuZG9pbmcgbG9uZyBlbm91Z2ggdG8gcmVhY2ggdG8gYSB2ZXJzaW9uIHRoYXQgaXMgc2F2ZWQgYW5kIHRoZW4gdG9cblx0XHQvLyBjbGVhciB0aGUgZGlydHkgZmxhZylcblx0XHRpZiAodGhpcy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHRoaXMuYnVmZmVyU2F2ZWRWZXJzaW9uSWQgPSB0aGlzLnRleHRFZGl0b3JNb2RlbC5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGFzdFJlc29sdmVkRmlsZVN0YXQobmV3RmlsZVN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZFJlYWRvbmx5ID0gdGhpcy5pc1JlYWRvbmx5KCk7XG5cblx0XHQvLyBGaXJzdCByZXNvbHZlIC0ganVzdCB0YWtlXG5cdFx0aWYgKCF0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0KSB7XG5cdFx0XHR0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0ID0gbmV3RmlsZVN0YXQ7XG5cdFx0fVxuXG5cdFx0Ly8gU3Vic2VxdWVudCByZXNvbHZlIC0gbWFrZSBzdXJlIHRoYXQgd2Ugb25seSBhc3NpZ24gaXQgaWYgdGhlIG10aW1lIGlzIGVxdWFsIG9yIGhhcyBhZHZhbmNlZC5cblx0XHQvLyBUaGlzIHByZXZlbnRzIHJhY2UgY29uZGl0aW9ucyBmcm9tIHJlc29sdmluZyBhbmQgc2F2aW5nLiBJZiBhIHNhdmUgY29tZXMgaW4gbGF0ZSBhZnRlciBhIHJldmVydFxuXHRcdC8vIHdhcyBjYWxsZWQsIHRoZSBtdGltZSBjb3VsZCBiZSBvdXQgb2Ygc3luYy5cblx0XHRlbHNlIGlmICh0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0Lm10aW1lIDw9IG5ld0ZpbGVTdGF0Lm10aW1lKSB7XG5cdFx0XHR0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0ID0gbmV3RmlsZVN0YXQ7XG5cdFx0fVxuXG5cdFx0Ly8gSW4gYWxsIG90aGVyIGNhc2VzIHVwZGF0ZSBvbmx5IHRoZSByZWFkb25seSBhbmQgbG9ja2VkIGZsYWdzXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0ID0geyAuLi50aGlzLmxhc3RSZXNvbHZlZEZpbGVTdGF0LCByZWFkb25seTogbmV3RmlsZVN0YXQucmVhZG9ubHksIGxvY2tlZDogbmV3RmlsZVN0YXQubG9ja2VkIH07XG5cdFx0fVxuXG5cdFx0Ly8gU2lnbmFsIHRoYXQgdGhlIHJlYWRvbmx5IHN0YXRlIGNoYW5nZWRcblx0XHRpZiAodGhpcy5pc1JlYWRvbmx5KCkgIT09IG9sZFJlYWRvbmx5KSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRoYXNTdGF0ZShzdGF0ZTogVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlKTogYm9vbGVhbiB7XG5cdFx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdFx0Y2FzZSBUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuQ09ORkxJQ1Q6XG5cdFx0XHRcdHJldHVybiB0aGlzLmluQ29uZmxpY3RNb2RlO1xuXHRcdFx0Y2FzZSBUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuRElSVFk6XG5cdFx0XHRcdHJldHVybiB0aGlzLmRpcnR5O1xuXHRcdFx0Y2FzZSBUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuRVJST1I6XG5cdFx0XHRcdHJldHVybiB0aGlzLmluRXJyb3JNb2RlO1xuXHRcdFx0Y2FzZSBUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuT1JQSEFOOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbk9ycGhhbk1vZGU7XG5cdFx0XHRjYXNlIFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5QRU5ESU5HX1NBVkU6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNhdmVTZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoKTtcblx0XHRcdGNhc2UgVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLlNBVkVEOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuZGlydHk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgam9pblN0YXRlKHN0YXRlOiBUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuUEVORElOR19TQVZFKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2F2ZVNlcXVlbnRpYWxpemVyLnJ1bm5pbmc7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRMYW5ndWFnZUlkKHRoaXM6IElSZXNvbHZlZFRleHRGaWxlRWRpdG9yTW9kZWwpOiBzdHJpbmc7XG5cdG92ZXJyaWRlIGdldExhbmd1YWdlSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRvdmVycmlkZSBnZXRMYW5ndWFnZUlkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMudGV4dEVkaXRvck1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50ZXh0RWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnByZWZlcnJlZExhbmd1YWdlSWQ7XG5cdH1cblxuXHQvLyNyZWdpb24gRW5jb2RpbmdcblxuXHRwcml2YXRlIGFzeW5jIG9uTWF5YmVTaG91bGRDaGFuZ2VFbmNvZGluZygpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFRoaXMgaXMgYSBiaXQgb2YgYSBoYWNrIGJ1dCB0aGVyZSBpcyBhIG5hcnJvdyBjYXNlIHdoZXJlXG5cdFx0Ly8gcGVyLWxhbmd1YWdlIGNvbmZpZ3VyZWQgZW5jb2RpbmdzIGFyZSBub3Qgd29ya2luZzpcblx0XHQvL1xuXHRcdC8vIE9uIHN0YXJ0dXAgd2UgbWF5IG5vdCB5ZXQgaGF2ZSBhbGwgbGFuZ3VhZ2VzIHJlc29sdmVkIHNvXG5cdFx0Ly8gd2UgcGljayBhIHdyb25nIGVuY29kaW5nLiBXZSBuZXZlciB1c2VkIHRvIHJlLWFwcGx5IHRoZVxuXHRcdC8vIGVuY29kaW5nIHdoZW4gdGhlIGxhbmd1YWdlIHdhcyB0aGVuIHJlc29sdmVkLCBiZWNhdXNlIHRoYXRcblx0XHQvLyBpcyBhbiBvcGVyYXRpb24gdGhhdCBpcyB3aWxsIGhhdmUgdG8gZmV0Y2ggdGhlIGNvbnRlbnRzXG5cdFx0Ly8gYWdhaW4gZnJvbSBkaXNrLlxuXHRcdC8vXG5cdFx0Ly8gVG8gbWl0aWdhdGUgdGhpcyBpc3N1ZSwgd2hlbiB3ZSBkZXRlY3QgdGhlIG1vZGVsIGxhbmd1YWdlXG5cdFx0Ly8gY2hhbmdlcywgd2Ugc2VlIGlmIHRoZXJlIGlzIGEgc3BlY2lmaWMgZW5jb2RpbmcgY29uZmlndXJlZFxuXHRcdC8vIGZvciB0aGUgbmV3IGxhbmd1YWdlIGFuZCBhcHBseSBpdCwgb25seSBpZiB0aGUgbW9kZWwgaXNcblx0XHQvLyBub3QgZGlydHkgYW5kIG9ubHkgaWYgdGhlIGVuY29kaW5nIHdhcyBub3QgZXhwbGljaXRseSBzZXQuXG5cdFx0Ly9cblx0XHQvLyAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjc5MzYpXG5cblx0XHRpZiAodGhpcy5oYXNFbmNvZGluZ1NldEV4cGxpY2l0bHkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ29uTWF5YmVTaG91bGRDaGFuZ2VFbmNvZGluZygpIC0gaWdub3JpbmcgYmVjYXVzZSBlbmNvZGluZyB3YXMgc2V0IGV4cGxpY2l0bHknKTtcblxuXHRcdFx0cmV0dXJuOyAvLyBuZXZlciBjaGFuZ2UgdGhlIHVzZXIncyBjaG9pY2Ugb2YgZW5jb2Rpbmdcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb250ZW50RW5jb2RpbmcgPT09IFVURjhfd2l0aF9ib20gfHwgdGhpcy5jb250ZW50RW5jb2RpbmcgPT09IFVURjE2YmUgfHwgdGhpcy5jb250ZW50RW5jb2RpbmcgPT09IFVURjE2bGUpIHtcblx0XHRcdHRoaXMudHJhY2UoJ29uTWF5YmVTaG91bGRDaGFuZ2VFbmNvZGluZygpIC0gaWdub3JpbmcgYmVjYXVzZSBjb250ZW50IGVuY29kaW5nIGhhcyBhIEJPTScpO1xuXG5cdFx0XHRyZXR1cm47IC8vIG5ldmVyIGNoYW5nZSBhbiBlbmNvZGluZyB0aGF0IHdlIGNhbiBkZXRlY3QgMTAwJSB2aWEgQk9Nc1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZW5jb2RpbmcgfSA9IGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmVuY29kaW5nLmdldFByZWZlcnJlZFJlYWRFbmNvZGluZyh0aGlzLnJlc291cmNlKTtcblx0XHRpZiAodHlwZW9mIGVuY29kaW5nICE9PSAnc3RyaW5nJyB8fCAhdGhpcy5pc05ld0VuY29kaW5nKGVuY29kaW5nKSkge1xuXHRcdFx0dGhpcy50cmFjZShgb25NYXliZVNob3VsZENoYW5nZUVuY29kaW5nKCkgLSBpZ25vcmluZyBiZWNhdXNlIHByZWZlcnJlZCBlbmNvZGluZyAke2VuY29kaW5nfSBpcyBub3QgbmV3YCk7XG5cblx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGVhcmx5IGlmIGVuY29kaW5nIGlzIGludmFsaWQgb3IgZGlkIG5vdCBjaGFuZ2Vcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc0RpcnR5KCkpIHtcblx0XHRcdHRoaXMudHJhY2UoJ29uTWF5YmVTaG91bGRDaGFuZ2VFbmNvZGluZygpIC0gaWdub3JpbmcgYmVjYXVzZSBtb2RlbCBpcyBkaXJ0eScpO1xuXG5cdFx0XHRyZXR1cm47IC8vIHJldHVybiBlYXJseSB0byBwcmV2ZW50IGFjY2lkZW50IHNhdmVzIGluIHRoaXMgY2FzZVxuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBBZGp1c3RpbmcgZW5jb2RpbmcgYmFzZWQgb24gY29uZmlndXJlZCBsYW5ndWFnZSBvdmVycmlkZSB0byAnJHtlbmNvZGluZ30nIGZvciAke3RoaXMucmVzb3VyY2UudG9TdHJpbmcodHJ1ZSl9LmApO1xuXG5cdFx0Ly8gRm9yY2UgcmVzb2x2ZSB0byBwaWNrIHVwIHRoZSBuZXcgZW5jb2Rpbmdcblx0XHRyZXR1cm4gdGhpcy5mb3JjZVJlc29sdmVGcm9tRmlsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNFbmNvZGluZ1NldEV4cGxpY2l0bHkgPSBmYWxzZTtcblxuXHRzZXRFbmNvZGluZyhlbmNvZGluZzogc3RyaW5nLCBtb2RlOiBFbmNvZGluZ01vZGUpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFJlbWVtYmVyIHRoYXQgYW4gZXhwbGljaXQgZW5jb2Rpbmcgd2FzIHNldFxuXHRcdHRoaXMuaGFzRW5jb2RpbmdTZXRFeHBsaWNpdGx5ID0gdHJ1ZTtcblxuXHRcdHJldHVybiB0aGlzLnNldEVuY29kaW5nSW50ZXJuYWwoZW5jb2RpbmcsIG1vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZXRFbmNvZGluZ0ludGVybmFsKGVuY29kaW5nOiBzdHJpbmcsIG1vZGU6IEVuY29kaW5nTW9kZSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gRW5jb2RlOiBTYXZlIHdpdGggZW5jb2Rpbmdcblx0XHRpZiAobW9kZSA9PT0gRW5jb2RpbmdNb2RlLkVuY29kZSkge1xuXHRcdFx0dGhpcy51cGRhdGVQcmVmZXJyZWRFbmNvZGluZyhlbmNvZGluZyk7XG5cblx0XHRcdC8vIFNhdmVcblx0XHRcdGlmICghdGhpcy5pc0RpcnR5KCkpIHtcblx0XHRcdFx0dGhpcy52ZXJzaW9uSWQrKzsgLy8gbmVlZHMgdG8gaW5jcmVtZW50IGJlY2F1c2Ugd2UgY2hhbmdlIHRoZSBtb2RlbCBwb3RlbnRpYWxseVxuXHRcdFx0XHR0aGlzLnNldERpcnR5KHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuaW5Db25mbGljdE1vZGUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zYXZlKHsgc291cmNlOiBUZXh0RmlsZUVkaXRvck1vZGVsLlRFWFRGSUxFX1NBVkVfRU5DT0RJTkdfU09VUkNFIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERlY29kZTogUmVzb2x2ZSB3aXRoIGVuY29kaW5nXG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMuaXNOZXdFbmNvZGluZyhlbmNvZGluZykpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gZWFybHkgaWYgdGhlIGVuY29kaW5nIGlzIGFscmVhZHkgdGhlIHNhbWVcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlLW9wZW4gYSBkaXJ0eSB0ZXh0IGRvY3VtZW50IHdpdGggZGlmZmVyZW50IGVuY29kaW5nLiBTYXZlIGl0IGZpcnN0LicpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZVByZWZlcnJlZEVuY29kaW5nKGVuY29kaW5nKTtcblxuXHRcdFx0YXdhaXQgdGhpcy5mb3JjZVJlc29sdmVGcm9tRmlsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZVByZWZlcnJlZEVuY29kaW5nKGVuY29kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNOZXdFbmNvZGluZyhlbmNvZGluZykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnByZWZlcnJlZEVuY29kaW5nID0gZW5jb2Rpbmc7XG5cblx0XHQvLyBFbWl0XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFbmNvZGluZy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGlzTmV3RW5jb2RpbmcoZW5jb2Rpbmc6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnByZWZlcnJlZEVuY29kaW5nID09PSBlbmNvZGluZykge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyByZXR1cm4gZWFybHkgaWYgdGhlIGVuY29kaW5nIGlzIGFscmVhZHkgdGhlIHNhbWVcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMucHJlZmVycmVkRW5jb2RpbmcgJiYgdGhpcy5jb250ZW50RW5jb2RpbmcgPT09IGVuY29kaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGFsc28gcmV0dXJuIGlmIHdlIGRvbid0IGhhdmUgYSBwcmVmZXJyZWQgZW5jb2RpbmcgYnV0IHRoZSBjb250ZW50IGVuY29kaW5nIGlzIGFscmVhZHkgdGhlIHNhbWVcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGdldEVuY29kaW5nKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucHJlZmVycmVkRW5jb2RpbmcgfHwgdGhpcy5jb250ZW50RW5jb2Rpbmc7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHRyYWNlKG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdGV4dCBmaWxlIG1vZGVsXSAke21zZ31gLCB0aGlzLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaXNSZXNvbHZlZCgpOiB0aGlzIGlzIElSZXNvbHZlZFRleHRGaWxlRWRpdG9yTW9kZWwge1xuXHRcdHJldHVybiAhIXRoaXMudGV4dEVkaXRvck1vZGVsO1xuXHR9XG5cblx0b3ZlcnJpZGUgaXNSZWFkb25seSgpOiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzUmVhZG9ubHkodGhpcy5yZXNvdXJjZSwgdGhpcy5sYXN0UmVzb2x2ZWRGaWxlU3RhdCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2UoJ2Rpc3Bvc2UoKScpO1xuXG5cdFx0dGhpcy5pbkNvbmZsaWN0TW9kZSA9IGZhbHNlO1xuXHRcdHRoaXMuaW5PcnBoYW5Nb2RlID0gZmFsc2U7XG5cdFx0dGhpcy5pbkVycm9yTW9kZSA9IGZhbHNlO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUV4QixTQUFTLFlBQVk7QUFDckIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUFjLGtCQUFrQiwwQkFBK0gsNkJBQW9GO0FBQzVQLFNBQXlCLFlBQVksMEJBQTBCO0FBQy9ELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUNBQTZEO0FBQ3RFLFNBQVMsY0FBa0MscUJBQXVDLGdCQUF1QyxlQUFlLDBDQUEwQztBQUNsTCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtB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
