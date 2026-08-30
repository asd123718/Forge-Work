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
import { streamToBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { StringSHA1 } from "../../../../../base/common/hash.js";
import { DisposableStore, thenRegisterOrDispose } from "../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun, ObservablePromise, observableValue, transaction } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { assertType } from "../../../../../base/common/types.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { LineRange } from "../../../../../editor/common/core/ranges/lineRange.js";
import { nullDocumentDiff } from "../../../../../editor/common/diff/documentDiffProvider.js";
import { DetailedLineRangeMapping, RangeMapping } from "../../../../../editor/common/diff/rangeMapping.js";
import { TextEdit } from "../../../../../editor/common/languages.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IUndoRedoService, UndoRedoElementType } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { SaveReason } from "../../../../common/editor.js";
import { IFilesConfigurationService } from "../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { SnapshotContext } from "../../../../services/workingCopy/common/fileWorkingCopy.js";
import { IAiEditTelemetryService } from "../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { NotebookTextDiffEditor } from "../../../notebook/browser/diff/notebookDiffEditor.js";
import { getNotebookEditorFromEditorPane } from "../../../notebook/browser/notebookBrowser.js";
import { CellEditType, NotebookCellsChangeType, NotebookSetting } from "../../../notebook/common/notebookCommon.js";
import { computeDiff } from "../../../notebook/common/notebookDiff.js";
import { INotebookEditorModelResolverService } from "../../../notebook/common/notebookEditorModelResolverService.js";
import { INotebookLoggingService } from "../../../notebook/common/notebookLoggingService.js";
import { INotebookService } from "../../../notebook/common/notebookService.js";
import { INotebookEditorWorkerService } from "../../../notebook/common/services/notebookWorkerService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { AbstractChatEditingModifiedFileEntry } from "./chatEditingModifiedFileEntry.js";
import { createSnapshot, deserializeSnapshot, getNotebookSnapshotFileURI, restoreSnapshot, SnapshotComparer } from "./notebook/chatEditingModifiedNotebookSnapshot.js";
import { ChatEditingNewNotebookContentEdits } from "./notebook/chatEditingNewNotebookContentEdits.js";
import { ChatEditingNotebookCellEntry } from "./notebook/chatEditingNotebookCellEntry.js";
import { ChatEditingNotebookDiffEditorIntegration, ChatEditingNotebookEditorIntegration } from "./notebook/chatEditingNotebookEditorIntegration.js";
import { ChatEditingNotebookFileSystemProvider } from "./notebook/chatEditingNotebookFileSystemProvider.js";
import { adjustCellDiffAndOriginalModelBasedOnCellAddDelete, adjustCellDiffAndOriginalModelBasedOnCellMovements, adjustCellDiffForKeepingAnInsertedCell, adjustCellDiffForRevertingADeletedCell, adjustCellDiffForRevertingAnInsertedCell, calculateNotebookRewriteRatio, getCorrespondingOriginalCellIndex, isTransientIPyNbExtensionEvent } from "./notebook/helpers.js";
import { countChanges, sortCellChanges } from "./notebook/notebookCellChanges.js";
const SnapshotLanguageId = "VSCodeChatNotebookSnapshotLanguage";
let ChatEditingModifiedNotebookEntry = class extends AbstractChatEditingModifiedFileEntry {
  constructor(modifiedResourceRef, originalResourceRef, _multiDiffEntryDelegate, transientOptions, telemetryInfo, kind, initialContent, configurationService, fileConfigService, chatService, fileService, instantiationService, textModelService, modelService, undoRedoService, notebookEditorWorkerService, loggingService, notebookResolver, aiEditTelemetryService) {
    super(modifiedResourceRef.object.notebook.uri, telemetryInfo, kind, configurationService, fileConfigService, chatService, fileService, undoRedoService, instantiationService, aiEditTelemetryService);
    this.modifiedResourceRef = modifiedResourceRef;
    this._multiDiffEntryDelegate = _multiDiffEntryDelegate;
    this.transientOptions = transientOptions;
    this.configurationService = configurationService;
    this.textModelService = textModelService;
    this.modelService = modelService;
    this.notebookEditorWorkerService = notebookEditorWorkerService;
    this.loggingService = loggingService;
    this.notebookResolver = notebookResolver;
    /**
     * Whether we're still generating diffs from a response.
     */
    this._isProcessingResponse = observableValue("isProcessingResponse", false);
    this._isEditFromUs = false;
    /**
     * Whether all edits are from us, e.g. is possible a user has made edits, then this will be false.
     */
    this._allEditsAreFromUs = true;
    this._changesCount = observableValue(this, 0);
    this.changesCount = this._changesCount;
    this.cellEntryMap = new ResourceMap();
    this.modifiedToOriginalCell = new ResourceMap();
    this._cellsDiffInfo = observableValue("diffInfo", []);
    /**
     * List of Cell URIs that are edited,
     * Will be cleared once all edits have been accepted.
     * I.e. this will only contain URIS while acceptAgentEdits is being called & before `isLastEdit` is sent.
     * I.e. this is populated only when edits are being streamed.
     */
    this.editedCells = new ResourceSet();
    this.computeRequestId = 0;
    this.cellTextModelMap = new ResourceMap();
    this.initialContentComparer = new SnapshotComparer(initialContent);
    this.modifiedModel = this._register(modifiedResourceRef).object.notebook;
    this.originalModel = this._register(originalResourceRef).object.notebook;
    this.originalURI = this.originalModel.uri;
    this.initialContent = initialContent;
    this.initializeModelsFromDiff();
    this._register(this.modifiedModel.onDidChangeContent(this.mirrorNotebookEdits, this));
  }
  get isProcessingResponse() {
    return this._isProcessingResponse;
  }
  get cellsDiffInfo() {
    return this._cellsDiffInfo;
  }
  get viewType() {
    return this.modifiedModel.viewType;
  }
  static async create(uri, _multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent, instantiationService) {
    return instantiationService.invokeFunction(async (accessor) => {
      const notebookService = accessor.get(INotebookService);
      const resolver = accessor.get(INotebookEditorModelResolverService);
      const configurationServie = accessor.get(IConfigurationService);
      const resourceRef = await resolver.resolve(uri);
      const notebook = resourceRef.object.notebook;
      const originalUri = getNotebookSnapshotFileURI(telemetryInfo.sessionResource, telemetryInfo.requestId, generateUuid(), notebook.uri.scheme === Schemas.untitled ? `/${notebook.uri.path}` : notebook.uri.path, notebook.viewType);
      const [options, buffer] = await Promise.all([
        notebookService.withNotebookDataProvider(resourceRef.object.notebook.notebookType),
        notebookService.createNotebookTextDocumentSnapshot(notebook.uri, SnapshotContext.Backup, CancellationToken.None).then((s) => streamToBuffer(s))
      ]);
      const disposables = new DisposableStore();
      disposables.add(ChatEditingNotebookFileSystemProvider.registerFile(originalUri, buffer));
      const originalRef = await resolver.resolve(originalUri, notebook.viewType);
      if (initialContent !== void 0) {
        try {
          restoreSnapshot(originalRef.object.notebook, initialContent);
        } catch (ex) {
          console.error(`Error restoring snapshot: ${initialContent}`, ex);
          initialContent = createSnapshot(notebook, options.serializer.options, configurationServie);
        }
      } else {
        initialContent = createSnapshot(notebook, options.serializer.options, configurationServie);
        restoreSnapshot(originalRef.object.notebook, initialContent);
        const edits = [];
        notebook.cells.forEach((cell, index) => {
          const internalId = generateCellHash(cell.uri);
          edits.push({ editType: CellEditType.PartialInternalMetadata, index, internalMetadata: { internalId } });
        });
        resourceRef.object.notebook.applyEdits(edits, true, void 0, () => void 0, void 0, false);
        originalRef.object.notebook.applyEdits(edits, true, void 0, () => void 0, void 0, false);
      }
      const instance = instantiationService.createInstance(ChatEditingModifiedNotebookEntry, resourceRef, originalRef, _multiDiffEntryDelegate, options.serializer.options, telemetryInfo, chatKind, initialContent);
      instance._register(disposables);
      return instance;
    });
  }
  static canHandleSnapshotContent(initialContent) {
    if (!initialContent) {
      return false;
    }
    try {
      deserializeSnapshot(initialContent);
      return true;
    } catch (ex) {
      return false;
    }
  }
  static canHandleSnapshot(snapshot) {
    if (snapshot.languageId === SnapshotLanguageId && ChatEditingModifiedNotebookEntry.canHandleSnapshotContent(snapshot.current)) {
      return true;
    }
    return false;
  }
  initializeModelsFromDiffImpl(cellsDiffInfo) {
    this.cellEntryMap.forEach((entry) => entry.dispose());
    this.cellEntryMap.clear();
    const diffs = cellsDiffInfo.map((cellDiff, i) => {
      switch (cellDiff.type) {
        case "delete":
          return this.createDeleteCellDiffInfo(cellDiff.originalCellIndex);
        case "insert":
          return this.createInsertedCellDiffInfo(cellDiff.modifiedCellIndex);
        default:
          return this.createModifiedCellDiffInfo(cellDiff.modifiedCellIndex, cellDiff.originalCellIndex);
      }
    });
    this._cellsDiffInfo.set(diffs, void 0);
    this._changesCount.set(countChanges(diffs), void 0);
  }
  getIndexOfCellHandle(handle) {
    return this.modifiedModel.cells.findIndex((c) => c.handle === handle);
  }
  async initializeModelsFromDiff() {
    const id = ++this.computeRequestId;
    if (this._areOriginalAndModifiedIdenticalImpl()) {
      const cellsDiffInfo2 = this.modifiedModel.cells.map((_, index) => {
        return { type: "unchanged", originalCellIndex: index, modifiedCellIndex: index };
      });
      this.initializeModelsFromDiffImpl(cellsDiffInfo2);
      return;
    }
    const cellsDiffInfo = [];
    try {
      this._isProcessingResponse.set(true, void 0);
      const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.originalURI, this.modifiedURI);
      if (id !== this.computeRequestId || this._store.isDisposed) {
        return;
      }
      const result = computeDiff(this.originalModel, this.modifiedModel, notebookDiff);
      if (result.cellDiffInfo.length) {
        cellsDiffInfo.push(...result.cellDiffInfo);
      }
    } catch (ex) {
      this.loggingService.error("Notebook Chat", "Error computing diff:\n" + ex);
    } finally {
      this._isProcessingResponse.set(false, void 0);
    }
    this.initializeModelsFromDiffImpl(cellsDiffInfo);
  }
  updateCellDiffInfo(cellsDiffInfo, transcation) {
    this._cellsDiffInfo.set(sortCellChanges(cellsDiffInfo), transcation);
    this._changesCount.set(countChanges(cellsDiffInfo), transcation);
  }
  mirrorNotebookEdits(e) {
    if (this._isEditFromUs || this._isExternalEditInProgress || Array.from(this.cellEntryMap.values()).some((entry) => entry.isEditFromUs)) {
      return;
    }
    let didResetToOriginalContent = this.initialContentComparer.isEqual(this.modifiedModel);
    const currentState = this._stateObs.get();
    if (currentState === ModifiedFileEntryState.Modified && didResetToOriginalContent) {
      this._stateObs.set(ModifiedFileEntryState.Rejected, void 0);
      this.updateCellDiffInfo([], void 0);
      this.initializeModelsFromDiff();
      this._notifySessionAction("rejected");
      return;
    }
    if (!e.rawEvents.length) {
      return;
    }
    if (currentState === ModifiedFileEntryState.Rejected) {
      return;
    }
    if (isTransientIPyNbExtensionEvent(this.modifiedModel.notebookType, e)) {
      return;
    }
    this._allEditsAreFromUs = false;
    this._userEditScheduler.schedule();
    for (const event of e.rawEvents.filter((event2) => event2.kind !== NotebookCellsChangeType.ChangeCellContent)) {
      switch (event.kind) {
        case NotebookCellsChangeType.ChangeDocumentMetadata: {
          const edit = {
            editType: CellEditType.DocumentMetadata,
            metadata: this.modifiedModel.metadata
          };
          this.originalModel.applyEdits([edit], true, void 0, () => void 0, void 0, false);
          break;
        }
        case NotebookCellsChangeType.ModelChange: {
          let cellDiffs = sortCellChanges(this._cellsDiffInfo.get());
          this._applyEditsSync(() => {
            event.changes.forEach((change) => {
              change[2].forEach((cell, i) => {
                if (cell.internalMetadata.internalId) {
                  return;
                }
                const index = change[0] + i;
                const internalId = generateCellHash(cell.uri);
                const edits = [{ editType: CellEditType.PartialInternalMetadata, index, internalMetadata: { internalId } }];
                this.modifiedModel.applyEdits(edits, true, void 0, () => void 0, void 0, false);
                cell.internalMetadata ??= {};
                cell.internalMetadata.internalId = internalId;
              });
            });
          });
          event.changes.forEach((change) => {
            cellDiffs = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(
              change,
              cellDiffs,
              this.modifiedModel.cells.length,
              this.originalModel.cells.length,
              this.originalModel.applyEdits.bind(this.originalModel),
              this.createModifiedCellDiffInfo.bind(this)
            );
          });
          this.updateCellDiffInfo(cellDiffs, void 0);
          this.disposeDeletedCellEntries();
          break;
        }
        case NotebookCellsChangeType.ChangeCellLanguage: {
          const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
          if (typeof index === "number") {
            const edit = {
              editType: CellEditType.CellLanguage,
              index,
              language: event.language
            };
            this.originalModel.applyEdits([edit], true, void 0, () => void 0, void 0, false);
          }
          break;
        }
        case NotebookCellsChangeType.ChangeCellMetadata: {
          const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
          if (typeof index === "number") {
            const edit = {
              editType: CellEditType.Metadata,
              index,
              metadata: event.metadata
            };
            this.originalModel.applyEdits([edit], true, void 0, () => void 0, void 0, false);
          }
          break;
        }
        case NotebookCellsChangeType.ChangeCellMime:
          break;
        case NotebookCellsChangeType.ChangeCellInternalMetadata: {
          const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
          if (typeof index === "number") {
            const edit = {
              editType: CellEditType.PartialInternalMetadata,
              index,
              internalMetadata: event.internalMetadata
            };
            this.originalModel.applyEdits([edit], true, void 0, () => void 0, void 0, false);
          }
          break;
        }
        case NotebookCellsChangeType.Output: {
          const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
          if (typeof index === "number") {
            const edit = {
              editType: CellEditType.Output,
              index,
              append: event.append,
              outputs: event.outputs
            };
            this.originalModel.applyEdits([edit], true, void 0, () => void 0, void 0, false);
          }
          break;
        }
        case NotebookCellsChangeType.OutputItem: {
          break;
        }
        case NotebookCellsChangeType.Move: {
          const result = adjustCellDiffAndOriginalModelBasedOnCellMovements(event, this._cellsDiffInfo.get().slice());
          if (result) {
            this.originalModel.applyEdits(result[1], true, void 0, () => void 0, void 0, false);
            this._cellsDiffInfo.set(result[0], void 0);
          }
          break;
        }
        default: {
          break;
        }
      }
    }
    didResetToOriginalContent = this.initialContentComparer.isEqual(this.modifiedModel);
    if (currentState === ModifiedFileEntryState.Modified && didResetToOriginalContent) {
      this._stateObs.set(ModifiedFileEntryState.Rejected, void 0);
      this.updateCellDiffInfo([], void 0);
      this.initializeModelsFromDiff();
      return;
    }
  }
  async _doAccept() {
    this.updateCellDiffInfo([], void 0);
    const snapshot = createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService);
    restoreSnapshot(this.originalModel, snapshot);
    this.initializeModelsFromDiff();
    await this._collapse(void 0);
    const config = this._fileConfigService.getAutoSaveConfiguration(this.modifiedURI);
    if (this.modifiedModel.uri.scheme !== Schemas.untitled && (!config.autoSave || !this.notebookResolver.isDirty(this.modifiedURI))) {
      await this._applyEdits(async () => {
        try {
          await this.modifiedResourceRef.object.save({
            reason: SaveReason.EXPLICIT,
            force: true
          });
        } catch {
        }
      });
    }
  }
  async _doReject() {
    this.updateCellDiffInfo([], void 0);
    if (this.createdInRequestId === this._telemetryInfo.requestId) {
      await this._applyEdits(async () => {
        await this.modifiedResourceRef.object.revert({ soft: true });
        await this._fileService.del(this.modifiedURI);
      });
      this._onDidDelete.fire();
    } else {
      await this._applyEdits(async () => {
        const snapshot = createSnapshot(this.originalModel, this.transientOptions, this.configurationService);
        this.restoreSnapshotInModifiedModel(snapshot);
        if (this._allEditsAreFromUs && Array.from(this.cellEntryMap.values()).every((entry) => entry.allEditsAreFromUs)) {
          await this.modifiedResourceRef.object.save({ reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
        }
      });
      this.initializeModelsFromDiff();
      await this._collapse(void 0);
    }
  }
  async _collapse(transaction2) {
    this._multiDiffEntryDelegate.collapse(transaction2);
  }
  _createEditorIntegration(editor) {
    const notebookEditor = getNotebookEditorFromEditorPane(editor);
    if (!notebookEditor && editor.getId() === NotebookTextDiffEditor.ID) {
      const diffEditor = editor.getControl();
      return this._instantiationService.createInstance(ChatEditingNotebookDiffEditorIntegration, diffEditor, this._cellsDiffInfo);
    }
    assertType(notebookEditor);
    return this._instantiationService.createInstance(ChatEditingNotebookEditorIntegration, this, editor, this.modifiedModel, this.originalModel, this._cellsDiffInfo);
  }
  _resetEditsState(tx) {
    super._resetEditsState(tx);
    this.cellEntryMap.forEach((entry) => !entry.isDisposed && entry.clearCurrentEditLineDecoration());
  }
  _createUndoRedoElement(response) {
    const request = response.session.getRequests().find((req) => req.id === response.requestId);
    const label = request?.message.text ? localize("chatNotebookEdit1", "Chat Edit: '{0}'", request.message.text) : localize("chatNotebookEdit2", "Chat Edit");
    const transientOptions = this.transientOptions;
    const outputSizeLimit = this.configurationService.getValue(NotebookSetting.outputBackupSizeLimit) * 1024;
    let initial = createSnapshot(this.modifiedModel, transientOptions, outputSizeLimit);
    let last = "";
    let redoState = ModifiedFileEntryState.Rejected;
    return {
      type: UndoRedoElementType.Resource,
      resource: this.modifiedURI,
      label,
      code: "chat.edit",
      confirmBeforeUndo: false,
      undo: async () => {
        last = createSnapshot(this.modifiedModel, transientOptions, outputSizeLimit);
        this._isEditFromUs = true;
        try {
          restoreSnapshot(this.modifiedModel, initial);
          restoreSnapshot(this.originalModel, initial);
        } finally {
          this._isEditFromUs = false;
        }
        redoState = this._stateObs.get() === ModifiedFileEntryState.Accepted ? ModifiedFileEntryState.Accepted : ModifiedFileEntryState.Rejected;
        this._stateObs.set(ModifiedFileEntryState.Rejected, void 0);
        this.updateCellDiffInfo([], void 0);
        this.initializeModelsFromDiff();
        this._notifySessionAction("userModified");
      },
      redo: async () => {
        initial = createSnapshot(this.modifiedModel, transientOptions, outputSizeLimit);
        this._isEditFromUs = true;
        try {
          restoreSnapshot(this.modifiedModel, last);
          restoreSnapshot(this.originalModel, last);
        } finally {
          this._isEditFromUs = false;
        }
        this._stateObs.set(redoState, void 0);
        this.updateCellDiffInfo([], void 0);
        this.initializeModelsFromDiff();
        this._notifySessionAction("userModified");
      }
    };
  }
  async _areOriginalAndModifiedIdentical() {
    return this._areOriginalAndModifiedIdenticalImpl();
  }
  _areOriginalAndModifiedIdenticalImpl() {
    const snapshot = createSnapshot(this.originalModel, this.transientOptions, this.configurationService);
    return new SnapshotComparer(snapshot).isEqual(this.modifiedModel);
  }
  async acceptAgentEdits(resource, edits, isLastEdits, responseModel) {
    const isCellUri = resource.scheme === Schemas.vscodeNotebookCell;
    const cell = isCellUri && this.modifiedModel.cells.find((cell2) => isEqual(cell2.uri, resource));
    let cellEntry;
    if (cell) {
      const index = this.modifiedModel.cells.indexOf(cell);
      const entry = this._cellsDiffInfo.get().slice().find((entry2) => entry2.modifiedCellIndex === index);
      if (!entry) {
        console.error("Original cell model not found");
        return;
      }
      cellEntry = this.getOrCreateModifiedTextFileEntryForCell(cell, await entry.modifiedModel.promise, await entry.originalModel.promise);
    }
    const finishPreviousCells = async () => {
      await Promise.all(Array.from(this.editedCells).map(async (uri) => {
        const cell2 = this.modifiedModel.cells.find((cell3) => isEqual(cell3.uri, uri));
        const cellEntry2 = cell2 && this.cellEntryMap.get(cell2.uri);
        await cellEntry2?.acceptAgentEdits([], true, responseModel);
      }));
      this.editedCells.clear();
    };
    await this._applyEdits(async () => {
      await Promise.all(edits.map(async (edit, idx) => {
        const last = isLastEdits && idx === edits.length - 1;
        if (TextEdit.isTextEdit(edit)) {
          if (isEqual(resource, this.modifiedModel.uri)) {
            this.newNotebookEditGenerator ??= this._instantiationService.createInstance(ChatEditingNewNotebookContentEdits, this.modifiedModel);
            this.newNotebookEditGenerator.acceptTextEdits([edit]);
          } else {
            this.newNotebookEditGenerator = void 0;
            if (!this.editedCells.has(resource)) {
              await finishPreviousCells();
              this.editedCells.add(resource);
            }
            await cellEntry?.acceptAgentEdits([edit], last, responseModel);
          }
        } else {
          this.newNotebookEditGenerator = void 0;
          this.acceptNotebookEdit(edit);
        }
      }));
    });
    if (isLastEdits) {
      await finishPreviousCells();
    }
    isLastEdits = !isCellUri && isLastEdits;
    if (isLastEdits && this.newNotebookEditGenerator) {
      const notebookEdits = await this.newNotebookEditGenerator.generateEdits();
      this.newNotebookEditGenerator = void 0;
      notebookEdits.forEach((edit) => this.acceptNotebookEdit(edit));
    }
    transaction((tx) => {
      this._waitsForLastEdits.set(!isLastEdits, tx);
      this._stateObs.set(ModifiedFileEntryState.Modified, tx);
      if (!isLastEdits) {
        const newRewriteRation = Math.max(this._rewriteRatioObs.get(), calculateNotebookRewriteRatio(this._cellsDiffInfo.get(), this.originalModel, this.modifiedModel));
        this._rewriteRatioObs.set(Math.min(1, newRewriteRation), tx);
      } else {
        this.editedCells.clear();
        this._resetEditsState(tx);
        this._rewriteRatioObs.set(1, tx);
      }
    });
    if (isLastEdits && this._shouldAutoSave()) {
      await this.modifiedResourceRef.object.save({
        reason: SaveReason.AUTO,
        skipSaveParticipants: true
      });
    }
  }
  disposeDeletedCellEntries() {
    const cellsUris = new ResourceSet(this.modifiedModel.cells.map((cell) => cell.uri));
    Array.from(this.cellEntryMap.keys()).forEach((uri) => {
      if (cellsUris.has(uri)) {
        return;
      }
      this.cellEntryMap.get(uri)?.dispose();
      this.cellEntryMap.delete(uri);
    });
  }
  acceptNotebookEdit(edit) {
    this.modifiedModel.applyEdits([edit], true, void 0, () => void 0, void 0, false);
    this.disposeDeletedCellEntries();
    if (edit.editType !== CellEditType.Replace) {
      return;
    }
    edit.cells.forEach((_, i) => {
      const index = edit.index + i;
      const cell = this.modifiedModel.cells[index];
      if (cell.internalMetadata.internalId) {
        return;
      }
      const internalId = generateCellHash(cell.uri);
      const edits = [{ editType: CellEditType.PartialInternalMetadata, index, internalMetadata: { internalId } }];
      this.modifiedModel.applyEdits(edits, true, void 0, () => void 0, void 0, false);
    });
    let diff = [];
    if (edit.count === 0) {
      diff = sortCellChanges(this._cellsDiffInfo.get());
      diff.forEach((d) => {
        if (d.type !== "delete" && d.modifiedCellIndex >= edit.index) {
          d.modifiedCellIndex += edit.cells.length;
        }
      });
      const diffInsert = edit.cells.map((_, i) => this.createInsertedCellDiffInfo(edit.index + i));
      diff.splice(edit.index, 0, ...diffInsert);
    } else {
      diff = sortCellChanges(this._cellsDiffInfo.get()).map((d) => {
        if (d.type === "unchanged" && d.modifiedCellIndex >= edit.index && d.modifiedCellIndex <= edit.index + edit.count - 1) {
          return this.createDeleteCellDiffInfo(d.originalCellIndex);
        }
        if (d.type !== "delete" && d.modifiedCellIndex >= edit.index + edit.count) {
          d.modifiedCellIndex -= edit.count;
          return d;
        }
        return d;
      });
    }
    this.updateCellDiffInfo(diff, void 0);
  }
  computeStateAfterAcceptingRejectingChanges(accepted) {
    const currentSnapshot = createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService);
    if (new SnapshotComparer(currentSnapshot).isEqual(this.originalModel)) {
      const state = accepted ? ModifiedFileEntryState.Accepted : ModifiedFileEntryState.Rejected;
      this._stateObs.set(state, void 0);
      this._notifySessionAction(accepted ? "accepted" : "rejected");
    }
  }
  createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
    const modifiedCell = this.modifiedModel.cells[modifiedCellIndex];
    const originalCell = this.originalModel.cells[originalCellIndex];
    this.modifiedToOriginalCell.set(modifiedCell.uri, originalCell.uri);
    const modifiedCellModelPromise = this.resolveCellModel(modifiedCell.uri);
    const originalCellModelPromise = this.resolveCellModel(originalCell.uri);
    Promise.all([modifiedCellModelPromise, originalCellModelPromise]).then(([modifiedCellModel, originalCellModel]) => {
      this.getOrCreateModifiedTextFileEntryForCell(modifiedCell, modifiedCellModel, originalCellModel);
    });
    const diff = observableValue("diff", nullDocumentDiff);
    const unchangedCell = {
      type: "unchanged",
      modifiedCellIndex,
      originalCellIndex,
      keep: async (changes) => {
        const [modifiedCellModel, originalCellModel] = await Promise.all([modifiedCellModelPromise, originalCellModelPromise]);
        const entry = this.getOrCreateModifiedTextFileEntryForCell(modifiedCell, modifiedCellModel, originalCellModel);
        return entry ? entry.keep(changes) : false;
      },
      undo: async (changes) => {
        const [modifiedCellModel, originalCellModel] = await Promise.all([modifiedCellModelPromise, originalCellModelPromise]);
        const entry = this.getOrCreateModifiedTextFileEntryForCell(modifiedCell, modifiedCellModel, originalCellModel);
        return entry ? entry.undo(changes) : false;
      },
      modifiedModel: new ObservablePromise(modifiedCellModelPromise),
      originalModel: new ObservablePromise(originalCellModelPromise),
      diff
    };
    return unchangedCell;
  }
  createInsertedCellDiffInfo(modifiedCellIndex) {
    const cell = this.modifiedModel.cells[modifiedCellIndex];
    const lines = cell.getValue().split(/\r?\n/);
    const originalRange = new Range(1, 0, 1, 0);
    const modifiedRange = new Range(1, 0, lines.length, lines[lines.length - 1].length);
    const innerChanges = new RangeMapping(originalRange, modifiedRange);
    const changes = [new DetailedLineRangeMapping(new LineRange(1, 1), new LineRange(1, lines.length), [innerChanges])];
    const originalModelUri = this.modifiedModel.uri.with({ query: (ChatEditingModifiedNotebookEntry.NewModelCounter++).toString(), scheme: "emptyCell" });
    const originalModel = this.modelService.getModel(originalModelUri) || this._register(this.modelService.createModel("", null, originalModelUri));
    this.modifiedToOriginalCell.set(cell.uri, originalModelUri);
    const keep = async () => {
      this._applyEditsSync(() => this.keepPreviouslyInsertedCell(cell));
      this.computeStateAfterAcceptingRejectingChanges(true);
      return true;
    };
    const undo = async () => {
      this._applyEditsSync(() => this.undoPreviouslyInsertedCell(cell));
      this.computeStateAfterAcceptingRejectingChanges(false);
      return true;
    };
    this.resolveCellModel(cell.uri).then((modifiedModel) => {
      if (this._store.isDisposed) {
        return;
      }
      this.getOrCreateModifiedTextFileEntryForCell(cell, modifiedModel, originalModel);
    });
    return {
      type: "insert",
      originalCellIndex: void 0,
      modifiedCellIndex,
      keep,
      undo,
      modifiedModel: new ObservablePromise(this.resolveCellModel(cell.uri)),
      originalModel: new ObservablePromise(Promise.resolve(originalModel)),
      diff: observableValue("deletedCellDiff", {
        changes,
        identical: false,
        moves: [],
        quitEarly: false
      })
    };
  }
  createDeleteCellDiffInfo(originalCellIndex) {
    const originalCell = this.originalModel.cells[originalCellIndex];
    const lines = new Array(originalCell.textBuffer.getLineCount()).fill(0).map((_, i) => originalCell.textBuffer.getLineContent(i + 1));
    const originalRange = new Range(1, 0, lines.length, lines[lines.length - 1].length);
    const modifiedRange = new Range(1, 0, 1, 0);
    const innerChanges = new RangeMapping(modifiedRange, originalRange);
    const changes = [new DetailedLineRangeMapping(new LineRange(1, lines.length), new LineRange(1, 1), [innerChanges])];
    const modifiedModelUri = this.modifiedModel.uri.with({ query: (ChatEditingModifiedNotebookEntry.NewModelCounter++).toString(), scheme: "emptyCell" });
    const modifiedModel = this.modelService.getModel(modifiedModelUri) || this._register(this.modelService.createModel("", null, modifiedModelUri));
    const keep = async () => {
      this._applyEditsSync(() => this.keepPreviouslyDeletedCell(this.originalModel.cells.indexOf(originalCell)));
      this.computeStateAfterAcceptingRejectingChanges(true);
      return true;
    };
    const undo = async () => {
      this._applyEditsSync(() => this.undoPreviouslyDeletedCell(this.originalModel.cells.indexOf(originalCell), originalCell));
      this.computeStateAfterAcceptingRejectingChanges(false);
      return true;
    };
    return {
      type: "delete",
      modifiedCellIndex: void 0,
      originalCellIndex,
      originalModel: new ObservablePromise(this.resolveCellModel(originalCell.uri)),
      modifiedModel: new ObservablePromise(Promise.resolve(modifiedModel)),
      keep,
      undo,
      diff: observableValue("cellDiff", {
        changes,
        identical: false,
        moves: [],
        quitEarly: false
      })
    };
  }
  undoPreviouslyInsertedCell(cell) {
    let diffs = [];
    this._applyEditsSync(() => {
      const index = this.modifiedModel.cells.indexOf(cell);
      diffs = adjustCellDiffForRevertingAnInsertedCell(
        index,
        this._cellsDiffInfo.get(),
        this.modifiedModel.applyEdits.bind(this.modifiedModel)
      );
    });
    this.disposeDeletedCellEntries();
    this.updateCellDiffInfo(diffs, void 0);
  }
  keepPreviouslyInsertedCell(cell) {
    const modifiedCellIndex = this.modifiedModel.cells.indexOf(cell);
    if (modifiedCellIndex === -1) {
      return;
    }
    const cellToInsert = {
      cellKind: cell.cellKind,
      language: cell.language,
      metadata: cell.metadata,
      outputs: cell.outputs,
      source: cell.getValue(),
      mime: cell.mime,
      internalMetadata: {
        internalId: cell.internalMetadata.internalId
      }
    };
    this.cellEntryMap.get(cell.uri)?.dispose();
    this.cellEntryMap.delete(cell.uri);
    const cellDiffs = adjustCellDiffForKeepingAnInsertedCell(
      modifiedCellIndex,
      this._cellsDiffInfo.get().slice(),
      cellToInsert,
      this.originalModel.applyEdits.bind(this.originalModel),
      this.createModifiedCellDiffInfo.bind(this)
    );
    this.updateCellDiffInfo(cellDiffs, void 0);
  }
  undoPreviouslyDeletedCell(deletedOriginalIndex, originalCell) {
    const cellToInsert = {
      cellKind: originalCell.cellKind,
      language: originalCell.language,
      metadata: originalCell.metadata,
      outputs: originalCell.outputs,
      source: originalCell.getValue(),
      mime: originalCell.mime,
      internalMetadata: {
        internalId: originalCell.internalMetadata.internalId
      }
    };
    let cellDiffs = [];
    this._applyEditsSync(() => {
      cellDiffs = adjustCellDiffForRevertingADeletedCell(
        deletedOriginalIndex,
        this._cellsDiffInfo.get(),
        cellToInsert,
        this.modifiedModel.applyEdits.bind(this.modifiedModel),
        this.createModifiedCellDiffInfo.bind(this)
      );
    });
    this.updateCellDiffInfo(cellDiffs, void 0);
  }
  keepPreviouslyDeletedCell(deletedOriginalIndex) {
    const edit = { cells: [], count: 1, editType: CellEditType.Replace, index: deletedOriginalIndex };
    this.originalModel.applyEdits([edit], true, void 0, () => void 0, void 0, false);
    const diffs = sortCellChanges(this._cellsDiffInfo.get()).filter((d) => !(d.type === "delete" && d.originalCellIndex === deletedOriginalIndex)).map((diff) => {
      if (diff.type !== "insert" && diff.originalCellIndex > deletedOriginalIndex) {
        return {
          ...diff,
          originalCellIndex: diff.originalCellIndex - 1
        };
      }
      return diff;
    });
    this.updateCellDiffInfo(diffs, void 0);
  }
  async _applyEdits(operation) {
    this._isEditFromUs = true;
    try {
      await operation();
    } finally {
      this._isEditFromUs = false;
    }
  }
  _applyEditsSync(operation) {
    this._isEditFromUs = true;
    try {
      operation();
    } finally {
      this._isEditFromUs = false;
    }
  }
  _safeCreateSnapshot(model) {
    try {
      return createSnapshot(model, this.transientOptions, this.configurationService);
    } catch (e) {
      this.loggingService.error("Notebook Chat", `Error creating snapshot: ${e instanceof Error ? e.message : e}`);
      return this.initialContent;
    }
  }
  getCurrentSnapshot() {
    return this._safeCreateSnapshot(this.modifiedModel);
  }
  createSnapshot(chatSessionResource, requestId, undoStop) {
    const original = this._safeCreateSnapshot(this.originalModel);
    const current = this.getCurrentSnapshot();
    return {
      resource: this.modifiedURI,
      languageId: SnapshotLanguageId,
      snapshotUri: getNotebookSnapshotFileURI(chatSessionResource, requestId, undoStop, this.modifiedURI.path, this.modifiedModel.viewType),
      original,
      current,
      state: this.state.get(),
      telemetryInfo: this.telemetryInfo
    };
  }
  equalsSnapshot(snapshot) {
    return !!snapshot && isEqual(this.modifiedURI, snapshot.resource) && this.state.get() === snapshot.state && new SnapshotComparer(snapshot.original).isEqual(this.originalModel) && new SnapshotComparer(snapshot.current).isEqual(this.modifiedModel);
  }
  async restoreFromSnapshot(snapshot, restoreToDisk = true) {
    this.updateCellDiffInfo([], void 0);
    this._stateObs.set(snapshot.state, void 0);
    restoreSnapshot(this.originalModel, snapshot.original);
    if (restoreToDisk) {
      this.restoreSnapshotInModifiedModel(snapshot.current);
    }
    this.initializeModelsFromDiff();
  }
  async resetEditTrackerToInitialContent() {
    if (this.initialContent) {
      restoreSnapshot(this.originalModel, this.initialContent);
    }
    this.updateCellDiffInfo([], void 0);
    this.initializeModelsFromDiff();
  }
  async resetToInitialContent() {
    this.updateCellDiffInfo([], void 0);
    this.restoreSnapshotInModifiedModel(this.initialContent);
    this.initializeModelsFromDiff();
  }
  restoreModifiedModelFromSnapshot(snapshot) {
    this.restoreSnapshotInModifiedModel(snapshot);
    return this.initializeModelsFromDiff();
  }
  restoreSnapshotInModifiedModel(snapshot) {
    if (snapshot === createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService)) {
      return;
    }
    this._applyEditsSync(() => {
      this.modifiedModel.pushStackElement();
      restoreSnapshot(this.modifiedModel, snapshot);
      this.modifiedModel.pushStackElement();
    });
  }
  async resolveCellModel(cellURI) {
    const cell = this.originalModel.cells.concat(this.modifiedModel.cells).find((cell2) => isEqual(cell2.uri, cellURI));
    if (!cell) {
      throw new Error("Cell not found");
    }
    const model = this.cellTextModelMap.get(cell.uri);
    if (model) {
      this.cellTextModelMap.set(cell.uri, model);
      return model;
    } else {
      const textEditorModel = await thenRegisterOrDispose(this.textModelService.createModelReference(cell.uri), this._store);
      const model2 = textEditorModel.object.textEditorModel;
      this.cellTextModelMap.set(cell.uri, model2);
      return model2;
    }
  }
  getOrCreateModifiedTextFileEntryForCell(cell, modifiedCellModel, originalCellModel) {
    let cellEntry = this.cellEntryMap.get(cell.uri);
    if (cellEntry) {
      return cellEntry;
    }
    if (this._store.isDisposed) {
      return;
    }
    const disposables = new DisposableStore();
    cellEntry = this._register(this._instantiationService.createInstance(ChatEditingNotebookCellEntry, this.modifiedResourceRef.object.resource, cell, modifiedCellModel, originalCellModel, () => this._isExternalEditInProgress, disposables));
    this.cellEntryMap.set(cell.uri, cellEntry);
    disposables.add(autorun((r) => {
      if (this.modifiedModel.cells.indexOf(cell) === -1) {
        return;
      }
      const diffs = this.cellsDiffInfo.read(void 0).slice();
      const index = this.modifiedModel.cells.indexOf(cell);
      let entry = diffs.find((entry2) => entry2.modifiedCellIndex === index);
      if (!entry) {
        return;
      }
      const entryIndex = diffs.indexOf(entry);
      entry.diff.set(cellEntry.diffInfo.read(r), void 0);
      if (cellEntry.diffInfo.read(void 0).identical && entry.type === "modified") {
        entry = {
          ...entry,
          type: "unchanged"
        };
      }
      if (!cellEntry.diffInfo.read(void 0).identical && entry.type === "unchanged") {
        entry = {
          ...entry,
          type: "modified"
        };
      }
      diffs.splice(entryIndex, 1, { ...entry });
      transaction((tx) => {
        this.updateCellDiffInfo(diffs, tx);
      });
    }));
    disposables.add(autorun((r) => {
      if (this.modifiedModel.cells.indexOf(cell) === -1) {
        return;
      }
      const cellState = cellEntry.state.read(r);
      if (cellState === ModifiedFileEntryState.Accepted) {
        this.computeStateAfterAcceptingRejectingChanges(true);
      } else if (cellState === ModifiedFileEntryState.Rejected) {
        this.computeStateAfterAcceptingRejectingChanges(false);
      }
    }));
    return cellEntry;
  }
  async computeEditsFromSnapshots(beforeSnapshot, afterSnapshot) {
    const beforeData = deserializeSnapshot(beforeSnapshot);
    const afterData = deserializeSnapshot(afterSnapshot);
    const edits = [];
    if (beforeData.data.cells.length > 0) {
      edits.push({
        editType: CellEditType.Replace,
        index: 0,
        count: beforeData.data.cells.length,
        cells: afterData.data.cells
      });
    } else if (afterData.data.cells.length > 0) {
      edits.push({
        editType: CellEditType.Replace,
        index: 0,
        count: 0,
        cells: afterData.data.cells
      });
    }
    return edits;
  }
  _shouldAutoSave() {
    return this.modifiedURI.scheme !== Schemas.untitled;
  }
  async save() {
    if (this.modifiedModel.uri.scheme === Schemas.untitled) {
      return;
    }
    if (this.notebookResolver.isDirty(this.modifiedModel.uri)) {
      await this.modifiedResourceRef.object.save({
        reason: SaveReason.EXPLICIT,
        skipSaveParticipants: true
      });
    }
  }
  async revertToDisk() {
    if (this.modifiedModel.uri.scheme === Schemas.untitled) {
      return;
    }
    await this.modifiedResourceRef.object.revert({ soft: false });
  }
};
ChatEditingModifiedNotebookEntry.NewModelCounter = 0;
ChatEditingModifiedNotebookEntry = __decorateClass([
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IFilesConfigurationService),
  __decorateParam(9, IChatService),
  __decorateParam(10, IFileService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, ITextModelService),
  __decorateParam(13, IModelService),
  __decorateParam(14, IUndoRedoService),
  __decorateParam(15, INotebookEditorWorkerService),
  __decorateParam(16, INotebookLoggingService),
  __decorateParam(17, INotebookEditorModelResolverService),
  __decorateParam(18, IAiEditTelemetryService)
], ChatEditingModifiedNotebookEntry);
function generateCellHash(cellUri) {
  const hash = new StringSHA1();
  hash.update(cellUri.toString());
  return hash.digest().substring(0, 8);
}
export {
  ChatEditingModifiedNotebookEntry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHN0cmVhbVRvQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFN0cmluZ1NIQTEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgdGhlblJlZ2lzdGVyT3JEaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBPYnNlcnZhYmxlUHJvbWlzZSwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgbnVsbERvY3VtZW50RGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9kb2N1bWVudERpZmZQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcsIFJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvRWxlbWVudCwgSVVuZG9SZWRvU2VydmljZSwgVW5kb1JlZG9FbGVtZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZSwgU2F2ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU25hcHNob3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL2ZpbGVXb3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvYWlFZGl0VGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0RGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvZGlmZi9ub3RlYm9va0RpZmZFZGl0b3IuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rVGV4dERpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL2RpZmYvbm90ZWJvb2tEaWZmRWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsRGlmZkluZm8gfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL2RpZmYvbm90ZWJvb2tEaWZmVmlld01vZGVsLmpzJztcbmltcG9ydCB7IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgSUNlbGxEdG8yLCBJQ2VsbEVkaXRPcGVyYXRpb24sIElDZWxsUmVwbGFjZUVkaXQsIElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWwsIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLCBOb3RlYm9va1NldHRpbmcsIE5vdGVib29rVGV4dE1vZGVsQ2hhbmdlZEV2ZW50LCBUcmFuc2llbnRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IGNvbXB1dGVEaWZmIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rRGlmZi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rTG9nZ2luZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9zZXJ2aWNlcy9ub3RlYm9va1dvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFZGl0S2luZCwgSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLCBJTW9kaWZpZWRGaWxlRW50cnlFZGl0b3JJbnRlZ3JhdGlvbiwgSVNuYXBzaG90RW50cnksIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZU1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdENoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnkgfSBmcm9tICcuL2NoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnkuanMnO1xuaW1wb3J0IHsgY3JlYXRlU25hcHNob3QsIGRlc2VyaWFsaXplU25hcHNob3QsIGdldE5vdGVib29rU25hcHNob3RGaWxlVVJJLCByZXN0b3JlU25hcHNob3QsIFNuYXBzaG90Q29tcGFyZXIgfSBmcm9tICcuL25vdGVib29rL2NoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va1NuYXBzaG90LmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nTmV3Tm90ZWJvb2tDb250ZW50RWRpdHMgfSBmcm9tICcuL25vdGVib29rL2NoYXRFZGl0aW5nTmV3Tm90ZWJvb2tDb250ZW50RWRpdHMuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdOb3RlYm9va0NlbGxFbnRyeSB9IGZyb20gJy4vbm90ZWJvb2svY2hhdEVkaXRpbmdOb3RlYm9va0NlbGxFbnRyeS5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ05vdGVib29rRGlmZkVkaXRvckludGVncmF0aW9uLCBDaGF0RWRpdGluZ05vdGVib29rRWRpdG9ySW50ZWdyYXRpb24gfSBmcm9tICcuL25vdGVib29rL2NoYXRFZGl0aW5nTm90ZWJvb2tFZGl0b3JJbnRlZ3JhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ05vdGVib29rRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi9ub3RlYm9vay9jaGF0RWRpdGluZ05vdGVib29rRmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsQWRkRGVsZXRlLCBhZGp1c3RDZWxsRGlmZkFuZE9yaWdpbmFsTW9kZWxCYXNlZE9uQ2VsbE1vdmVtZW50cywgYWRqdXN0Q2VsbERpZmZGb3JLZWVwaW5nQW5JbnNlcnRlZENlbGwsIGFkanVzdENlbGxEaWZmRm9yUmV2ZXJ0aW5nQURlbGV0ZWRDZWxsLCBhZGp1c3RDZWxsRGlmZkZvclJldmVydGluZ0FuSW5zZXJ0ZWRDZWxsLCBjYWxjdWxhdGVOb3RlYm9va1Jld3JpdGVSYXRpbywgZ2V0Q29ycmVzcG9uZGluZ09yaWdpbmFsQ2VsbEluZGV4LCBpc1RyYW5zaWVudElQeU5iRXh0ZW5zaW9uRXZlbnQgfSBmcm9tICcuL25vdGVib29rL2hlbHBlcnMuanMnO1xuaW1wb3J0IHsgY291bnRDaGFuZ2VzLCBJQ2VsbERpZmZJbmZvLCBzb3J0Q2VsbENoYW5nZXMgfSBmcm9tICcuL25vdGVib29rL25vdGVib29rQ2VsbENoYW5nZXMuanMnO1xuXG5cbmNvbnN0IFNuYXBzaG90TGFuZ3VhZ2VJZCA9ICdWU0NvZGVDaGF0Tm90ZWJvb2tTbmFwc2hvdExhbmd1YWdlJztcblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5IGV4dGVuZHMgQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHtcblx0c3RhdGljIE5ld01vZGVsQ291bnRlcjogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RpZmllZE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBvcmlnaW5hbE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbDtcblx0b3ZlcnJpZGUgb3JpZ2luYWxVUkk6IFVSSTtcblx0LyoqXG5cdCAqIEpTT04gc3RyaW5naWZpZWQgdmVyc2lvbiBvZiB0aGUgb3JpZ2luYWwgbm90ZWJvb2suXG5cdCAqL1xuXHRvdmVycmlkZSBpbml0aWFsQ29udGVudDogc3RyaW5nO1xuXHQvKipcblx0ICogV2hldGhlciB3ZSdyZSBzdGlsbCBnZW5lcmF0aW5nIGRpZmZzIGZyb20gYSByZXNwb25zZS5cblx0ICovXG5cdHByaXZhdGUgX2lzUHJvY2Vzc2luZ1Jlc3BvbnNlID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdpc1Byb2Nlc3NpbmdSZXNwb25zZScsIGZhbHNlKTtcblx0Z2V0IGlzUHJvY2Vzc2luZ1Jlc3BvbnNlKCk6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5faXNQcm9jZXNzaW5nUmVzcG9uc2U7XG5cdH1cblx0cHJpdmF0ZSBfaXNFZGl0RnJvbVVzOiBib29sZWFuID0gZmFsc2U7XG5cdC8qKlxuXHQgKiBXaGV0aGVyIGFsbCBlZGl0cyBhcmUgZnJvbSB1cywgZS5nLiBpcyBwb3NzaWJsZSBhIHVzZXIgaGFzIG1hZGUgZWRpdHMsIHRoZW4gdGhpcyB3aWxsIGJlIGZhbHNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWxsRWRpdHNBcmVGcm9tVXM6IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzQ291bnQgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAwKTtcblx0b3ZlcnJpZGUgY2hhbmdlc0NvdW50OiBJT2JzZXJ2YWJsZTxudW1iZXI+ID0gdGhpcy5fY2hhbmdlc0NvdW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2VsbEVudHJ5TWFwID0gbmV3IFJlc291cmNlTWFwPENoYXRFZGl0aW5nTm90ZWJvb2tDZWxsRW50cnk+KCk7XG5cdHByaXZhdGUgbW9kaWZpZWRUb09yaWdpbmFsQ2VsbCA9IG5ldyBSZXNvdXJjZU1hcDxVUkk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NlbGxzRGlmZkluZm8gPSBvYnNlcnZhYmxlVmFsdWU8SUNlbGxEaWZmSW5mb1tdPignZGlmZkluZm8nLCBbXSk7XG5cblx0Z2V0IGNlbGxzRGlmZkluZm8oKTogSU9ic2VydmFibGU8SUNlbGxEaWZmSW5mb1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NlbGxzRGlmZkluZm87XG5cdH1cblxuXHRnZXQgdmlld1R5cGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kaWZpZWRNb2RlbC52aWV3VHlwZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaXN0IG9mIENlbGwgVVJJcyB0aGF0IGFyZSBlZGl0ZWQsXG5cdCAqIFdpbGwgYmUgY2xlYXJlZCBvbmNlIGFsbCBlZGl0cyBoYXZlIGJlZW4gYWNjZXB0ZWQuXG5cdCAqIEkuZS4gdGhpcyB3aWxsIG9ubHkgY29udGFpbiBVUklTIHdoaWxlIGFjY2VwdEFnZW50RWRpdHMgaXMgYmVpbmcgY2FsbGVkICYgYmVmb3JlIGBpc0xhc3RFZGl0YCBpcyBzZW50LlxuXHQgKiBJLmUuIHRoaXMgaXMgcG9wdWxhdGVkIG9ubHkgd2hlbiBlZGl0cyBhcmUgYmVpbmcgc3RyZWFtZWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRlZENlbGxzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0cHVibGljIHN0YXRpYyBhc3luYyBjcmVhdGUodXJpOiBVUkksIF9tdWx0aURpZmZFbnRyeURlbGVnYXRlOiB7IGNvbGxhcHNlOiAodHJhbnNhY3Rpb246IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkgPT4gdm9pZCB9LCB0ZWxlbWV0cnlJbmZvOiBJTW9kaWZpZWRFbnRyeVRlbGVtZXRyeUluZm8sIGNoYXRLaW5kOiBDaGF0RWRpdEtpbmQsIGluaXRpYWxDb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQsIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQcm9taXNlPEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeT4ge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBub3RlYm9va1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGVib29rU2VydmljZSk7XG5cdFx0XHRjb25zdCByZXNvbHZlciA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSk7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmllID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCByZXNvdXJjZVJlZjogSVJlZmVyZW5jZTxJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsPiA9IGF3YWl0IHJlc29sdmVyLnJlc29sdmUodXJpKTtcblx0XHRcdGNvbnN0IG5vdGVib29rID0gcmVzb3VyY2VSZWYub2JqZWN0Lm5vdGVib29rO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxVcmkgPSBnZXROb3RlYm9va1NuYXBzaG90RmlsZVVSSSh0ZWxlbWV0cnlJbmZvLnNlc3Npb25SZXNvdXJjZSwgdGVsZW1ldHJ5SW5mby5yZXF1ZXN0SWQsIGdlbmVyYXRlVXVpZCgpLCBub3RlYm9vay51cmkuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkID8gYC8ke25vdGVib29rLnVyaS5wYXRofWAgOiBub3RlYm9vay51cmkucGF0aCwgbm90ZWJvb2sudmlld1R5cGUpO1xuXHRcdFx0Y29uc3QgW29wdGlvbnMsIGJ1ZmZlcl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdG5vdGVib29rU2VydmljZS53aXRoTm90ZWJvb2tEYXRhUHJvdmlkZXIocmVzb3VyY2VSZWYub2JqZWN0Lm5vdGVib29rLm5vdGVib29rVHlwZSksXG5cdFx0XHRcdG5vdGVib29rU2VydmljZS5jcmVhdGVOb3RlYm9va1RleHREb2N1bWVudFNuYXBzaG90KG5vdGVib29rLnVyaSwgU25hcHNob3RDb250ZXh0LkJhY2t1cCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihzID0+IHN0cmVhbVRvQnVmZmVyKHMpKVxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdC8vIFJlZ2lzdGVyIHNvIHRoYXQgd2UgY2FuIGxvYWQgdGhpcyBmcm9tIGZpbGUgc3lzdGVtLlxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKENoYXRFZGl0aW5nTm90ZWJvb2tGaWxlU3lzdGVtUHJvdmlkZXIucmVnaXN0ZXJGaWxlKG9yaWdpbmFsVXJpLCBidWZmZXIpKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVmID0gYXdhaXQgcmVzb2x2ZXIucmVzb2x2ZShvcmlnaW5hbFVyaSwgbm90ZWJvb2sudmlld1R5cGUpO1xuXHRcdFx0aWYgKGluaXRpYWxDb250ZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXN0b3JlU25hcHNob3Qob3JpZ2luYWxSZWYub2JqZWN0Lm5vdGVib29rLCBpbml0aWFsQ29udGVudCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGV4KSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihgRXJyb3IgcmVzdG9yaW5nIHNuYXBzaG90OiAke2luaXRpYWxDb250ZW50fWAsIGV4KTtcblx0XHRcdFx0XHRpbml0aWFsQ29udGVudCA9IGNyZWF0ZVNuYXBzaG90KG5vdGVib29rLCBvcHRpb25zLnNlcmlhbGl6ZXIub3B0aW9ucywgY29uZmlndXJhdGlvblNlcnZpZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluaXRpYWxDb250ZW50ID0gY3JlYXRlU25hcHNob3Qobm90ZWJvb2ssIG9wdGlvbnMuc2VyaWFsaXplci5vcHRpb25zLCBjb25maWd1cmF0aW9uU2VydmllKTtcblx0XHRcdFx0Ly8gQm90aCBtb2RlbHMgYXJlIHRoZSBzYW1lLCBlbnN1cmUgdGhlIGNlbGwgaWRzIGFyZSB0aGUgc2FtZSwgdGhpcyB3YXkgd2UgZ2V0IGEgcGVyZmVjdCBkaWZmaW5nLlxuXHRcdFx0XHQvLyBObyBuZWVkIHRvIGdlbmVyYXRlIGVkaXRzIGZvciB0aGlzLlxuXHRcdFx0XHQvLyBXZSB3YW50IHRvIGVuc3VyZSB0aGV5IGFyZSBpZGVudGl0Y2FsLCBwb3NzaWJsZSBvcmlnaW5hbCBub3RlYm9vayB3YXMgb3BlbiBhbmQgZ290IG1vZGlmaWVkLlxuXHRcdFx0XHQvLyBPciBzb21ldGhpbmcgZ2V0cyBjaGFuZ2VkIGJldHdlZW4gc2VyaWFsaXphdGlvbiAmIGRlc2VyaWFsaXphdGlvbiBvZiB0aGUgc25hcHNob3QgaW50byB0aGUgb3JpZ2luYWwuXG5cdFx0XHRcdC8vIEUuZy4gaW4ganVweXRlciBub3RlYm9va3MgdGhlIG1ldGFkYXRhIGNvbnRhaW5zIHRyYW5zaWVudCBkYXRhIHRoYXQgZ2V0cyB1cGRhdGVkIGFmdGVyIGRlc2VyaWFsaXphdGlvbi5cblx0XHRcdFx0cmVzdG9yZVNuYXBzaG90KG9yaWdpbmFsUmVmLm9iamVjdC5ub3RlYm9vaywgaW5pdGlhbENvbnRlbnQpO1xuXHRcdFx0XHRjb25zdCBlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRcdFx0bm90ZWJvb2suY2VsbHMuZm9yRWFjaCgoY2VsbCwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbnRlcm5hbElkID0gZ2VuZXJhdGVDZWxsSGFzaChjZWxsLnVyaSk7XG5cdFx0XHRcdFx0ZWRpdHMucHVzaCh7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUGFydGlhbEludGVybmFsTWV0YWRhdGEsIGluZGV4LCBpbnRlcm5hbE1ldGFkYXRhOiB7IGludGVybmFsSWQgfSB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlc291cmNlUmVmLm9iamVjdC5ub3RlYm9vay5hcHBseUVkaXRzKGVkaXRzLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0XHRcdG9yaWdpbmFsUmVmLm9iamVjdC5ub3RlYm9vay5hcHBseUVkaXRzKGVkaXRzLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5LCByZXNvdXJjZVJlZiwgb3JpZ2luYWxSZWYsIF9tdWx0aURpZmZFbnRyeURlbGVnYXRlLCBvcHRpb25zLnNlcmlhbGl6ZXIub3B0aW9ucywgdGVsZW1ldHJ5SW5mbywgY2hhdEtpbmQsIGluaXRpYWxDb250ZW50KTtcblx0XHRcdGluc3RhbmNlLl9yZWdpc3RlcihkaXNwb3NhYmxlcyk7XG5cdFx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNhbkhhbmRsZVNuYXBzaG90Q29udGVudChpbml0aWFsQ29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFpbml0aWFsQ29udGVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRkZXNlcmlhbGl6ZVNuYXBzaG90KGluaXRpYWxDb250ZW50KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGV4KSB7XG5cdFx0XHQvLyBub3QgYSB2YWxpZCBzbmFwc2hvdFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY2FuSGFuZGxlU25hcHNob3Qoc25hcHNob3Q6IElTbmFwc2hvdEVudHJ5KTogYm9vbGVhbiB7XG5cdFx0aWYgKHNuYXBzaG90Lmxhbmd1YWdlSWQgPT09IFNuYXBzaG90TGFuZ3VhZ2VJZCAmJiBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeS5jYW5IYW5kbGVTbmFwc2hvdENvbnRlbnQoc25hcHNob3QuY3VycmVudCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGluaXRpYWxDb250ZW50Q29tcGFyZXI6IFNuYXBzaG90Q29tcGFyZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RpZmllZFJlc291cmNlUmVmOiBJUmVmZXJlbmNlPElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWw+LFxuXHRcdG9yaWdpbmFsUmVzb3VyY2VSZWY6IElSZWZlcmVuY2U8SVJlc29sdmVkTm90ZWJvb2tFZGl0b3JNb2RlbD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbXVsdGlEaWZmRW50cnlEZWxlZ2F0ZTogeyBjb2xsYXBzZTogKHRyYW5zYWN0aW9uOiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpID0+IHZvaWQgfSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRyYW5zaWVudE9wdGlvbnM6IFRyYW5zaWVudE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0dGVsZW1ldHJ5SW5mbzogSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLFxuXHRcdGtpbmQ6IENoYXRFZGl0S2luZCxcblx0XHRpbml0aWFsQ29udGVudDogc3RyaW5nLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBmaWxlQ29uZmlnU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ2dpbmdTZXJ2aWNlOiBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSxcblx0XHRASU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va1Jlc29sdmVyOiBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSxcblx0XHRASUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UgYWlFZGl0VGVsZW1ldHJ5U2VydmljZTogSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG1vZGlmaWVkUmVzb3VyY2VSZWYub2JqZWN0Lm5vdGVib29rLnVyaSwgdGVsZW1ldHJ5SW5mbywga2luZCwgY29uZmlndXJhdGlvblNlcnZpY2UsIGZpbGVDb25maWdTZXJ2aWNlLCBjaGF0U2VydmljZSwgZmlsZVNlcnZpY2UsIHVuZG9SZWRvU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGFpRWRpdFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHRoaXMuaW5pdGlhbENvbnRlbnRDb21wYXJlciA9IG5ldyBTbmFwc2hvdENvbXBhcmVyKGluaXRpYWxDb250ZW50KTtcblx0XHR0aGlzLm1vZGlmaWVkTW9kZWwgPSB0aGlzLl9yZWdpc3Rlcihtb2RpZmllZFJlc291cmNlUmVmKS5vYmplY3Qubm90ZWJvb2s7XG5cdFx0dGhpcy5vcmlnaW5hbE1vZGVsID0gdGhpcy5fcmVnaXN0ZXIob3JpZ2luYWxSZXNvdXJjZVJlZikub2JqZWN0Lm5vdGVib29rO1xuXHRcdHRoaXMub3JpZ2luYWxVUkkgPSB0aGlzLm9yaWdpbmFsTW9kZWwudXJpO1xuXHRcdHRoaXMuaW5pdGlhbENvbnRlbnQgPSBpbml0aWFsQ29udGVudDtcblx0XHR0aGlzLmluaXRpYWxpemVNb2RlbHNGcm9tRGlmZigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kaWZpZWRNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQodGhpcy5taXJyb3JOb3RlYm9va0VkaXRzLCB0aGlzKSk7XG5cdH1cblxuXHRpbml0aWFsaXplTW9kZWxzRnJvbURpZmZJbXBsKGNlbGxzRGlmZkluZm86IENlbGxEaWZmSW5mb1tdKSB7XG5cdFx0dGhpcy5jZWxsRW50cnlNYXAuZm9yRWFjaChlbnRyeSA9PiBlbnRyeS5kaXNwb3NlKCkpO1xuXHRcdHRoaXMuY2VsbEVudHJ5TWFwLmNsZWFyKCk7XG5cdFx0Y29uc3QgZGlmZnMgPSBjZWxsc0RpZmZJbmZvLm1hcCgoY2VsbERpZmYsIGkpID0+IHtcblx0XHRcdHN3aXRjaCAoY2VsbERpZmYudHlwZSkge1xuXHRcdFx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZURlbGV0ZUNlbGxEaWZmSW5mbyhjZWxsRGlmZi5vcmlnaW5hbENlbGxJbmRleCk7XG5cdFx0XHRcdGNhc2UgJ2luc2VydCc6XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlSW5zZXJ0ZWRDZWxsRGlmZkluZm8oY2VsbERpZmYubW9kaWZpZWRDZWxsSW5kZXgpO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvKGNlbGxEaWZmLm1vZGlmaWVkQ2VsbEluZGV4LCBjZWxsRGlmZi5vcmlnaW5hbENlbGxJbmRleCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fY2VsbHNEaWZmSW5mby5zZXQoZGlmZnMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fY2hhbmdlc0NvdW50LnNldChjb3VudENoYW5nZXMoZGlmZnMpLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Z2V0SW5kZXhPZkNlbGxIYW5kbGUoaGFuZGxlOiBudW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RpZmllZE1vZGVsLmNlbGxzLmZpbmRJbmRleChjID0+IGMuaGFuZGxlID09PSBoYW5kbGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlUmVxdWVzdElkOiBudW1iZXIgPSAwO1xuXHRhc3luYyBpbml0aWFsaXplTW9kZWxzRnJvbURpZmYoKSB7XG5cdFx0Y29uc3QgaWQgPSArK3RoaXMuY29tcHV0ZVJlcXVlc3RJZDtcblx0XHRpZiAodGhpcy5fYXJlT3JpZ2luYWxBbmRNb2RpZmllZElkZW50aWNhbEltcGwoKSkge1xuXHRcdFx0Y29uc3QgY2VsbHNEaWZmSW5mbzogQ2VsbERpZmZJbmZvW10gPSB0aGlzLm1vZGlmaWVkTW9kZWwuY2VsbHMubWFwKChfLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAndW5jaGFuZ2VkJywgb3JpZ2luYWxDZWxsSW5kZXg6IGluZGV4LCBtb2RpZmllZENlbGxJbmRleDogaW5kZXggfSBzYXRpc2ZpZXMgQ2VsbERpZmZJbmZvO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVNb2RlbHNGcm9tRGlmZkltcGwoY2VsbHNEaWZmSW5mbyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNlbGxzRGlmZkluZm86IENlbGxEaWZmSW5mb1tdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lzUHJvY2Vzc2luZ1Jlc3BvbnNlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tEaWZmID0gYXdhaXQgdGhpcy5ub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UuY29tcHV0ZURpZmYodGhpcy5vcmlnaW5hbFVSSSwgdGhpcy5tb2RpZmllZFVSSSk7XG5cdFx0XHRpZiAoaWQgIT09IHRoaXMuY29tcHV0ZVJlcXVlc3RJZCB8fCB0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVEaWZmKHRoaXMub3JpZ2luYWxNb2RlbCwgdGhpcy5tb2RpZmllZE1vZGVsLCBub3RlYm9va0RpZmYpO1xuXHRcdFx0aWYgKHJlc3VsdC5jZWxsRGlmZkluZm8ubGVuZ3RoKSB7XG5cdFx0XHRcdGNlbGxzRGlmZkluZm8ucHVzaCguLi5yZXN1bHQuY2VsbERpZmZJbmZvKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0dGhpcy5sb2dnaW5nU2VydmljZS5lcnJvcignTm90ZWJvb2sgQ2hhdCcsICdFcnJvciBjb21wdXRpbmcgZGlmZjpcXG4nICsgZXgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc1Byb2Nlc3NpbmdSZXNwb25zZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHRoaXMuaW5pdGlhbGl6ZU1vZGVsc0Zyb21EaWZmSW1wbChjZWxsc0RpZmZJbmZvKTtcblx0fVxuXHR1cGRhdGVDZWxsRGlmZkluZm8oY2VsbHNEaWZmSW5mbzogSUNlbGxEaWZmSW5mb1tdLCB0cmFuc2NhdGlvbjogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fY2VsbHNEaWZmSW5mby5zZXQoc29ydENlbGxDaGFuZ2VzKGNlbGxzRGlmZkluZm8pLCB0cmFuc2NhdGlvbik7XG5cdFx0dGhpcy5fY2hhbmdlc0NvdW50LnNldChjb3VudENoYW5nZXMoY2VsbHNEaWZmSW5mbyksIHRyYW5zY2F0aW9uKTtcblx0fVxuXG5cdG1pcnJvck5vdGVib29rRWRpdHMoZTogTm90ZWJvb2tUZXh0TW9kZWxDaGFuZ2VkRXZlbnQpIHtcblx0XHRpZiAodGhpcy5faXNFZGl0RnJvbVVzIHx8IHRoaXMuX2lzRXh0ZXJuYWxFZGl0SW5Qcm9ncmVzcyB8fCBBcnJheS5mcm9tKHRoaXMuY2VsbEVudHJ5TWFwLnZhbHVlcygpKS5zb21lKGVudHJ5ID0+IGVudHJ5LmlzRWRpdEZyb21VcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQb3NzaWJsZSB1c2VyIHJldmVydGVkIHRoZSBjaGFuZ2VzIGZyb20gU0NNIG9yIHRoZSBsaWtlLlxuXHRcdC8vIE9yIHVzZXIganVzdCByZXZlcnRlZCB0aGUgY2hhbmdlcyBtYWRlIHZpYSBlZGl0cyAoZS5nLiBlZGl0IG1hZGUgYSBjaGFuZ2UgaW4gYSBjZWxsIGFuZCB1c2VyIHVuZGlkIHRoYXQgY2hhbmdlIGVpdGhlciBieSB0eXBpbmcgb3ZlciBvciBvdGhlcikuXG5cdFx0Ly8gQ29tcHV0aW5nIHNuYXBzaG90IGlzIHRvbyBzbG93LCBhcyB0aGlzIGV2ZW50IGdldHMgdHJpZ2dlcmVkIGZvciBldmVyeSBrZXkgc3Ryb2tlIGluIGEgY2VsbCxcblx0XHQvLyBjb25zdCBkaWRSZXNldFRvT3JpZ2luYWxDb250ZW50ID0gY3JlYXRlU25hcHNob3QodGhpcy5tb2RpZmllZE1vZGVsLCB0aGlzLnRyYW5zaWVudE9wdGlvbnMsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpID09PSB0aGlzLmluaXRpYWxDb250ZW50O1xuXHRcdGxldCBkaWRSZXNldFRvT3JpZ2luYWxDb250ZW50ID0gdGhpcy5pbml0aWFsQ29udGVudENvbXBhcmVyLmlzRXF1YWwodGhpcy5tb2RpZmllZE1vZGVsKTtcblx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZU9icy5nZXQoKTtcblx0XHRpZiAoY3VycmVudFN0YXRlID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkICYmIGRpZFJlc2V0VG9PcmlnaW5hbENvbnRlbnQpIHtcblx0XHRcdHRoaXMuX3N0YXRlT2JzLnNldChNb2RpZmllZEZpbGVFbnRyeVN0YXRlLlJlamVjdGVkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy51cGRhdGVDZWxsRGlmZkluZm8oW10sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVNb2RlbHNGcm9tRGlmZigpO1xuXHRcdFx0dGhpcy5fbm90aWZ5U2Vzc2lvbkFjdGlvbigncmVqZWN0ZWQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWUucmF3RXZlbnRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50U3RhdGUgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuUmVqZWN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNUcmFuc2llbnRJUHlOYkV4dGVuc2lvbkV2ZW50KHRoaXMubW9kaWZpZWRNb2RlbC5ub3RlYm9va1R5cGUsIGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWxsRWRpdHNBcmVGcm9tVXMgPSBmYWxzZTtcblx0XHR0aGlzLl91c2VyRWRpdFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXG5cdFx0Ly8gQ2hhbmdlcyB0byBjZWxsIHRleHQgaXMgc3luYydlZCBhbmQgaGFuZGxlZCBzZXBhcmF0ZWx5LlxuXHRcdC8vIFNlZSBDaGF0RWRpdGluZ05vdGVib29rQ2VsbEVudHJ5Ll9taXJyb3JFZGl0c1xuXHRcdGZvciAoY29uc3QgZXZlbnQgb2YgZS5yYXdFdmVudHMuZmlsdGVyKGV2ZW50ID0+IGV2ZW50LmtpbmQgIT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxDb250ZW50KSkge1xuXHRcdFx0c3dpdGNoIChldmVudC5raW5kKSB7XG5cdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlRG9jdW1lbnRNZXRhZGF0YToge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXQ6IElDZWxsRWRpdE9wZXJhdGlvbiA9IHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuRG9jdW1lbnRNZXRhZGF0YSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB0aGlzLm1vZGlmaWVkTW9kZWwubWV0YWRhdGFcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMub3JpZ2luYWxNb2RlbC5hcHBseUVkaXRzKFtlZGl0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2U6IHtcblx0XHRcdFx0XHRsZXQgY2VsbERpZmZzID0gc29ydENlbGxDaGFuZ2VzKHRoaXMuX2NlbGxzRGlmZkluZm8uZ2V0KCkpO1xuXHRcdFx0XHRcdC8vIEVuc3VyZSB0aGUgbmV3IG5vdGVib29rIGNlbGxzIGhhdmUgaW50ZXJuYWxJZHNcblx0XHRcdFx0XHR0aGlzLl9hcHBseUVkaXRzU3luYygoKSA9PiB7XG5cdFx0XHRcdFx0XHRldmVudC5jaGFuZ2VzLmZvckVhY2goY2hhbmdlID0+IHtcblx0XHRcdFx0XHRcdFx0Y2hhbmdlWzJdLmZvckVhY2goKGNlbGwsIGkpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoY2VsbC5pbnRlcm5hbE1ldGFkYXRhLmludGVybmFsSWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBjaGFuZ2VbMF0gKyBpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGludGVybmFsSWQgPSBnZW5lcmF0ZUNlbGxIYXNoKGNlbGwudXJpKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbeyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhLCBpbmRleCwgaW50ZXJuYWxNZXRhZGF0YTogeyBpbnRlcm5hbElkIH0gfV07XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5tb2RpZmllZE1vZGVsLmFwcGx5RWRpdHMoZWRpdHMsIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0XHRjZWxsLmludGVybmFsTWV0YWRhdGEgPz89IHt9O1xuXHRcdFx0XHRcdFx0XHRcdGNlbGwuaW50ZXJuYWxNZXRhZGF0YS5pbnRlcm5hbElkID0gaW50ZXJuYWxJZDtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRldmVudC5jaGFuZ2VzLmZvckVhY2goY2hhbmdlID0+IHtcblx0XHRcdFx0XHRcdGNlbGxEaWZmcyA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsQWRkRGVsZXRlKGNoYW5nZSxcblx0XHRcdFx0XHRcdFx0Y2VsbERpZmZzLFxuXHRcdFx0XHRcdFx0XHR0aGlzLm1vZGlmaWVkTW9kZWwuY2VsbHMubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHR0aGlzLm9yaWdpbmFsTW9kZWwuY2VsbHMubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHR0aGlzLm9yaWdpbmFsTW9kZWwuYXBwbHlFZGl0cy5iaW5kKHRoaXMub3JpZ2luYWxNb2RlbCksXG5cdFx0XHRcdFx0XHRcdHRoaXMuY3JlYXRlTW9kaWZpZWRDZWxsRGlmZkluZm8uYmluZCh0aGlzKSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDZWxsRGlmZkluZm8oY2VsbERpZmZzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMuZGlzcG9zZURlbGV0ZWRDZWxsRW50cmllcygpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbExhbmd1YWdlOiB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBnZXRDb3JyZXNwb25kaW5nT3JpZ2luYWxDZWxsSW5kZXgoZXZlbnQuaW5kZXgsIHRoaXMuX2NlbGxzRGlmZkluZm8uZ2V0KCkpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0OiBJQ2VsbEVkaXRPcGVyYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuQ2VsbExhbmd1YWdlLFxuXHRcdFx0XHRcdFx0XHRpbmRleCxcblx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2U6IGV2ZW50Lmxhbmd1YWdlXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0dGhpcy5vcmlnaW5hbE1vZGVsLmFwcGx5RWRpdHMoW2VkaXRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbE1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0Ly8gaXB5bmIgYW5kIG90aGVyIGV4dGVuc2lvbnMgY2FuIGFsdGVyIG1ldGFkYXRhLCBlbnN1cmUgd2UgdXBkYXRlIHRoZSBvcmlnaW5hbCBtb2RlbCBpbiB0aGUgY29ycmVzcG9uZGluZyBjZWxsLlxuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gZ2V0Q29ycmVzcG9uZGluZ09yaWdpbmFsQ2VsbEluZGV4KGV2ZW50LmluZGV4LCB0aGlzLl9jZWxsc0RpZmZJbmZvLmdldCgpKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdDogSUNlbGxFZGl0T3BlcmF0aW9uID0ge1xuXHRcdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLFxuXHRcdFx0XHRcdFx0XHRpbmRleCxcblx0XHRcdFx0XHRcdFx0bWV0YWRhdGE6IGV2ZW50Lm1ldGFkYXRhXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0dGhpcy5vcmlnaW5hbE1vZGVsLmFwcGx5RWRpdHMoW2VkaXRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbE1pbWU6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbEludGVybmFsTWV0YWRhdGE6IHtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IGdldENvcnJlc3BvbmRpbmdPcmlnaW5hbENlbGxJbmRleChldmVudC5pbmRleCwgdGhpcy5fY2VsbHNEaWZmSW5mby5nZXQoKSk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXQ6IElDZWxsRWRpdE9wZXJhdGlvbiA9IHtcblx0XHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5QYXJ0aWFsSW50ZXJuYWxNZXRhZGF0YSxcblx0XHRcdFx0XHRcdFx0aW5kZXgsXG5cdFx0XHRcdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IGV2ZW50LmludGVybmFsTWV0YWRhdGFcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR0aGlzLm9yaWdpbmFsTW9kZWwuYXBwbHlFZGl0cyhbZWRpdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5PdXRwdXQ6IHtcblx0XHRcdFx0XHQvLyBVc2VyIGNhbiBydW4gY2VsbHMuXG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBnZXRDb3JyZXNwb25kaW5nT3JpZ2luYWxDZWxsSW5kZXgoZXZlbnQuaW5kZXgsIHRoaXMuX2NlbGxzRGlmZkluZm8uZ2V0KCkpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0OiBJQ2VsbEVkaXRPcGVyYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LFxuXHRcdFx0XHRcdFx0XHRpbmRleCxcblx0XHRcdFx0XHRcdFx0YXBwZW5kOiBldmVudC5hcHBlbmQsXG5cdFx0XHRcdFx0XHRcdG91dHB1dHM6IGV2ZW50Lm91dHB1dHNcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR0aGlzLm9yaWdpbmFsTW9kZWwuYXBwbHlFZGl0cyhbZWRpdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5PdXRwdXRJdGVtOiB7XG5cdFx0XHRcdFx0Ly8gb3V0cHV0cyBhcmUgc2hhcmVkIGJldHdlZW4gb3JpZ2luYWwgYW5kIG1vZGlmaWVkIG1vZGVsLCBzbyB0aGUgb3JpZ2luYWwgbW9kZWwgaXMgYWxyZWFkeSB1cGRhdGVkLlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZToge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkanVzdENlbGxEaWZmQW5kT3JpZ2luYWxNb2RlbEJhc2VkT25DZWxsTW92ZW1lbnRzKGV2ZW50LCB0aGlzLl9jZWxsc0RpZmZJbmZvLmdldCgpLnNsaWNlKCkpO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRcdHRoaXMub3JpZ2luYWxNb2RlbC5hcHBseUVkaXRzKHJlc3VsdFsxXSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0dGhpcy5fY2VsbHNEaWZmSW5mby5zZXQocmVzdWx0WzBdLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRkaWRSZXNldFRvT3JpZ2luYWxDb250ZW50ID0gdGhpcy5pbml0aWFsQ29udGVudENvbXBhcmVyLmlzRXF1YWwodGhpcy5tb2RpZmllZE1vZGVsKTtcblx0XHRpZiAoY3VycmVudFN0YXRlID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkICYmIGRpZFJlc2V0VG9PcmlnaW5hbENvbnRlbnQpIHtcblx0XHRcdHRoaXMuX3N0YXRlT2JzLnNldChNb2RpZmllZEZpbGVFbnRyeVN0YXRlLlJlamVjdGVkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy51cGRhdGVDZWxsRGlmZkluZm8oW10sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVNb2RlbHNGcm9tRGlmZigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfZG9BY2NlcHQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy51cGRhdGVDZWxsRGlmZkluZm8oW10sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBjcmVhdGVTbmFwc2hvdCh0aGlzLm1vZGlmaWVkTW9kZWwsIHRoaXMudHJhbnNpZW50T3B0aW9ucywgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0cmVzdG9yZVNuYXBzaG90KHRoaXMub3JpZ2luYWxNb2RlbCwgc25hcHNob3QpO1xuXHRcdHRoaXMuaW5pdGlhbGl6ZU1vZGVsc0Zyb21EaWZmKCk7XG5cdFx0YXdhaXQgdGhpcy5fY29sbGFwc2UodW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2ZpbGVDb25maWdTZXJ2aWNlLmdldEF1dG9TYXZlQ29uZmlndXJhdGlvbih0aGlzLm1vZGlmaWVkVVJJKTtcblx0XHRpZiAodGhpcy5tb2RpZmllZE1vZGVsLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMudW50aXRsZWQgJiYgKCFjb25maWcuYXV0b1NhdmUgfHwgIXRoaXMubm90ZWJvb2tSZXNvbHZlci5pc0RpcnR5KHRoaXMubW9kaWZpZWRVUkkpKSkge1xuXHRcdFx0Ly8gU0FWRSBhZnRlciBhY2NlcHQgZm9yIG1hbnVhbC1zYXZlcnMsIGZvciBhdXRvLXNhdmVyc1xuXHRcdFx0Ly8gdHJpZ2dlciBleHBsaWN0IHNhdmUgdG8gZ2V0IHNhdmUgcGFydGljaXBhbnRzIGdvaW5nXG5cdFx0XHRhd2FpdCB0aGlzLl9hcHBseUVkaXRzKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLm1vZGlmaWVkUmVzb3VyY2VSZWYub2JqZWN0LnNhdmUoe1xuXHRcdFx0XHRcdFx0cmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lULFxuXHRcdFx0XHRcdFx0Zm9yY2U6IHRydWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIGlnbm9yZWRcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9kb1JlamVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnVwZGF0ZUNlbGxEaWZmSW5mbyhbXSwgdW5kZWZpbmVkKTtcblx0XHRpZiAodGhpcy5jcmVhdGVkSW5SZXF1ZXN0SWQgPT09IHRoaXMuX3RlbGVtZXRyeUluZm8ucmVxdWVzdElkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hcHBseUVkaXRzKGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5tb2RpZmllZFJlc291cmNlUmVmLm9iamVjdC5yZXZlcnQoeyBzb2Z0OiB0cnVlIH0pO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwodGhpcy5tb2RpZmllZFVSSSk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX29uRGlkRGVsZXRlLmZpcmUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5fYXBwbHlFZGl0cyhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gY3JlYXRlU25hcHNob3QodGhpcy5vcmlnaW5hbE1vZGVsLCB0aGlzLnRyYW5zaWVudE9wdGlvbnMsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHR0aGlzLnJlc3RvcmVTbmFwc2hvdEluTW9kaWZpZWRNb2RlbChzbmFwc2hvdCk7XG5cdFx0XHRcdGlmICh0aGlzLl9hbGxFZGl0c0FyZUZyb21VcyAmJiBBcnJheS5mcm9tKHRoaXMuY2VsbEVudHJ5TWFwLnZhbHVlcygpKS5ldmVyeShlbnRyeSA9PiBlbnRyeS5hbGxFZGl0c0FyZUZyb21VcykpIHtcblx0XHRcdFx0XHQvLyBzYXZlIHRoZSBmaWxlIGFmdGVyIGRpc2NhcmRpbmcgc28gdGhhdCB0aGUgZGlydHkgaW5kaWNhdG9yIGdvZXMgYXdheVxuXHRcdFx0XHRcdC8vIGFuZCBzbyB0aGF0IGFuIGludGVybWVkaWF0ZSBzYXZlZCBzdGF0ZSBnZXRzIHJldmVydGVkXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5tb2RpZmllZFJlc291cmNlUmVmLm9iamVjdC5zYXZlKHsgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lULCBza2lwU2F2ZVBhcnRpY2lwYW50czogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVNb2RlbHNGcm9tRGlmZigpO1xuXHRcdFx0YXdhaXQgdGhpcy5fY29sbGFwc2UodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb2xsYXBzZSh0cmFuc2FjdGlvbjogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbXVsdGlEaWZmRW50cnlEZWxlZ2F0ZS5jb2xsYXBzZSh0cmFuc2FjdGlvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2NyZWF0ZUVkaXRvckludGVncmF0aW9uKGVkaXRvcjogSUVkaXRvclBhbmUpOiBJTW9kaWZpZWRGaWxlRW50cnlFZGl0b3JJbnRlZ3JhdGlvbiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvcik7XG5cdFx0aWYgKCFub3RlYm9va0VkaXRvciAmJiBlZGl0b3IuZ2V0SWQoKSA9PT0gTm90ZWJvb2tUZXh0RGlmZkVkaXRvci5JRCkge1xuXHRcdFx0Y29uc3QgZGlmZkVkaXRvciA9IChlZGl0b3IuZ2V0Q29udHJvbCgpIGFzIElOb3RlYm9va1RleHREaWZmRWRpdG9yKTtcblx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdGluZ05vdGVib29rRGlmZkVkaXRvckludGVncmF0aW9uLCBkaWZmRWRpdG9yLCB0aGlzLl9jZWxsc0RpZmZJbmZvKTtcblx0XHR9XG5cdFx0YXNzZXJ0VHlwZShub3RlYm9va0VkaXRvcik7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0aW5nTm90ZWJvb2tFZGl0b3JJbnRlZ3JhdGlvbiwgdGhpcywgZWRpdG9yLCB0aGlzLm1vZGlmaWVkTW9kZWwsIHRoaXMub3JpZ2luYWxNb2RlbCwgdGhpcy5fY2VsbHNEaWZmSW5mbyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3Jlc2V0RWRpdHNTdGF0ZSh0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0c3VwZXIuX3Jlc2V0RWRpdHNTdGF0ZSh0eCk7XG5cdFx0dGhpcy5jZWxsRW50cnlNYXAuZm9yRWFjaChlbnRyeSA9PiAhZW50cnkuaXNEaXNwb3NlZCAmJiBlbnRyeS5jbGVhckN1cnJlbnRFZGl0TGluZURlY29yYXRpb24oKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2NyZWF0ZVVuZG9SZWRvRWxlbWVudChyZXNwb25zZTogSUNoYXRSZXNwb25zZU1vZGVsKTogSVVuZG9SZWRvRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHJlc3BvbnNlLnNlc3Npb24uZ2V0UmVxdWVzdHMoKS5maW5kKHJlcSA9PiByZXEuaWQgPT09IHJlc3BvbnNlLnJlcXVlc3RJZCk7XG5cdFx0Y29uc3QgbGFiZWwgPSByZXF1ZXN0Py5tZXNzYWdlLnRleHQgPyBsb2NhbGl6ZSgnY2hhdE5vdGVib29rRWRpdDEnLCBcIkNoYXQgRWRpdDogJ3swfSdcIiwgcmVxdWVzdC5tZXNzYWdlLnRleHQpIDogbG9jYWxpemUoJ2NoYXROb3RlYm9va0VkaXQyJywgXCJDaGF0IEVkaXRcIik7XG5cdFx0Y29uc3QgdHJhbnNpZW50T3B0aW9ucyA9IHRoaXMudHJhbnNpZW50T3B0aW9ucztcblx0XHRjb25zdCBvdXRwdXRTaXplTGltaXQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dEJhY2t1cFNpemVMaW1pdCkgKiAxMDI0O1xuXG5cdFx0Ly8gY3JlYXRlIGEgc25hcHNob3Qgb2YgdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIG1vZGVsLCBiZWZvcmUgdGhlIG5leHQgc2V0IG9mIGVkaXRzXG5cdFx0bGV0IGluaXRpYWwgPSBjcmVhdGVTbmFwc2hvdCh0aGlzLm1vZGlmaWVkTW9kZWwsIHRyYW5zaWVudE9wdGlvbnMsIG91dHB1dFNpemVMaW1pdCk7XG5cdFx0bGV0IGxhc3QgPSAnJztcblx0XHRsZXQgcmVkb1N0YXRlID0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5SZWplY3RlZDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IHRoaXMubW9kaWZpZWRVUkksXG5cdFx0XHRsYWJlbCxcblx0XHRcdGNvZGU6ICdjaGF0LmVkaXQnLFxuXHRcdFx0Y29uZmlybUJlZm9yZVVuZG86IGZhbHNlLFxuXHRcdFx0dW5kbzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsYXN0ID0gY3JlYXRlU25hcHNob3QodGhpcy5tb2RpZmllZE1vZGVsLCB0cmFuc2llbnRPcHRpb25zLCBvdXRwdXRTaXplTGltaXQpO1xuXHRcdFx0XHR0aGlzLl9pc0VkaXRGcm9tVXMgPSB0cnVlO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJlc3RvcmVTbmFwc2hvdCh0aGlzLm1vZGlmaWVkTW9kZWwsIGluaXRpYWwpO1xuXHRcdFx0XHRcdHJlc3RvcmVTbmFwc2hvdCh0aGlzLm9yaWdpbmFsTW9kZWwsIGluaXRpYWwpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuX2lzRWRpdEZyb21VcyA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlZG9TdGF0ZSA9IHRoaXMuX3N0YXRlT2JzLmdldCgpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLkFjY2VwdGVkID8gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCA6IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuUmVqZWN0ZWQ7XG5cdFx0XHRcdHRoaXMuX3N0YXRlT2JzLnNldChNb2RpZmllZEZpbGVFbnRyeVN0YXRlLlJlamVjdGVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNlbGxEaWZmSW5mbyhbXSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5pbml0aWFsaXplTW9kZWxzRnJvbURpZmYoKTtcblx0XHRcdFx0dGhpcy5fbm90aWZ5U2Vzc2lvbkFjdGlvbigndXNlck1vZGlmaWVkJyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVkbzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpbml0aWFsID0gY3JlYXRlU25hcHNob3QodGhpcy5tb2RpZmllZE1vZGVsLCB0cmFuc2llbnRPcHRpb25zLCBvdXRwdXRTaXplTGltaXQpO1xuXHRcdFx0XHR0aGlzLl9pc0VkaXRGcm9tVXMgPSB0cnVlO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJlc3RvcmVTbmFwc2hvdCh0aGlzLm1vZGlmaWVkTW9kZWwsIGxhc3QpO1xuXHRcdFx0XHRcdHJlc3RvcmVTbmFwc2hvdCh0aGlzLm9yaWdpbmFsTW9kZWwsIGxhc3QpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuX2lzRWRpdEZyb21VcyA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N0YXRlT2JzLnNldChyZWRvU3RhdGUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ2VsbERpZmZJbmZvKFtdLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLmluaXRpYWxpemVNb2RlbHNGcm9tRGlmZigpO1xuXHRcdFx0XHR0aGlzLl9ub3RpZnlTZXNzaW9uQWN0aW9uKCd1c2VyTW9kaWZpZWQnKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9hcmVPcmlnaW5hbEFuZE1vZGlmaWVkSWRlbnRpY2FsKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9hcmVPcmlnaW5hbEFuZE1vZGlmaWVkSWRlbnRpY2FsSW1wbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXJlT3JpZ2luYWxBbmRNb2RpZmllZElkZW50aWNhbEltcGwoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBjcmVhdGVTbmFwc2hvdCh0aGlzLm9yaWdpbmFsTW9kZWwsIHRoaXMudHJhbnNpZW50T3B0aW9ucywgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0cmV0dXJuIG5ldyBTbmFwc2hvdENvbXBhcmVyKHNuYXBzaG90KS5pc0VxdWFsKHRoaXMubW9kaWZpZWRNb2RlbCk7XG5cdH1cblxuXHRwcml2YXRlIG5ld05vdGVib29rRWRpdEdlbmVyYXRvcj86IENoYXRFZGl0aW5nTmV3Tm90ZWJvb2tDb250ZW50RWRpdHM7XG5cdG92ZXJyaWRlIGFzeW5jIGFjY2VwdEFnZW50RWRpdHMocmVzb3VyY2U6IFVSSSwgZWRpdHM6IChUZXh0RWRpdCB8IElDZWxsRWRpdE9wZXJhdGlvbilbXSwgaXNMYXN0RWRpdHM6IGJvb2xlYW4sIHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGlzQ2VsbFVyaSA9IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGw7XG5cdFx0Y29uc3QgY2VsbCA9IGlzQ2VsbFVyaSAmJiB0aGlzLm1vZGlmaWVkTW9kZWwuY2VsbHMuZmluZChjZWxsID0+IGlzRXF1YWwoY2VsbC51cmksIHJlc291cmNlKSk7XG5cdFx0bGV0IGNlbGxFbnRyeTogQ2hhdEVkaXRpbmdOb3RlYm9va0NlbGxFbnRyeSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY2VsbCkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vZGlmaWVkTW9kZWwuY2VsbHMuaW5kZXhPZihjZWxsKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fY2VsbHNEaWZmSW5mby5nZXQoKS5zbGljZSgpLmZpbmQoZW50cnkgPT4gZW50cnkubW9kaWZpZWRDZWxsSW5kZXggPT09IGluZGV4KTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0Ly8gTm90IHBvc3NpYmxlLlxuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdPcmlnaW5hbCBjZWxsIG1vZGVsIG5vdCBmb3VuZCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNlbGxFbnRyeSA9IHRoaXMuZ2V0T3JDcmVhdGVNb2RpZmllZFRleHRGaWxlRW50cnlGb3JDZWxsKGNlbGwsIGF3YWl0IGVudHJ5Lm1vZGlmaWVkTW9kZWwucHJvbWlzZSwgYXdhaXQgZW50cnkub3JpZ2luYWxNb2RlbC5wcm9taXNlKTtcblx0XHR9XG5cblx0XHQvLyBGb3IgYWxsIGNlbGxzIHRoYXQgd2VyZSBlZGl0ZWQsIHNlbmQgdGhlIGBpc0xhc3RFZGl0c2AgZmxhZy5cblx0XHRjb25zdCBmaW5pc2hQcmV2aW91c0NlbGxzID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoQXJyYXkuZnJvbSh0aGlzLmVkaXRlZENlbGxzKS5tYXAoYXN5bmMgKHVyaSkgPT4ge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5tb2RpZmllZE1vZGVsLmNlbGxzLmZpbmQoY2VsbCA9PiBpc0VxdWFsKGNlbGwudXJpLCB1cmkpKTtcblx0XHRcdFx0Y29uc3QgY2VsbEVudHJ5ID0gY2VsbCAmJiB0aGlzLmNlbGxFbnRyeU1hcC5nZXQoY2VsbC51cmkpO1xuXHRcdFx0XHRhd2FpdCBjZWxsRW50cnk/LmFjY2VwdEFnZW50RWRpdHMoW10sIHRydWUsIHJlc3BvbnNlTW9kZWwpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5lZGl0ZWRDZWxscy5jbGVhcigpO1xuXHRcdH07XG5cblx0XHRhd2FpdCB0aGlzLl9hcHBseUVkaXRzKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGVkaXRzLm1hcChhc3luYyAoZWRpdCwgaWR4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxhc3QgPSBpc0xhc3RFZGl0cyAmJiBpZHggPT09IGVkaXRzLmxlbmd0aCAtIDE7XG5cdFx0XHRcdGlmIChUZXh0RWRpdC5pc1RleHRFZGl0KGVkaXQpKSB7XG5cdFx0XHRcdFx0Ly8gUG9zc2libGUgd2UncmUgZ2V0dGluZyB0aGUgcmF3IGNvbnRlbnQgZm9yIHRoZSBub3RlYm9vay5cblx0XHRcdFx0XHRpZiAoaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5tb2RpZmllZE1vZGVsLnVyaSkpIHtcblx0XHRcdFx0XHRcdHRoaXMubmV3Tm90ZWJvb2tFZGl0R2VuZXJhdG9yID8/PSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdGluZ05ld05vdGVib29rQ29udGVudEVkaXRzLCB0aGlzLm1vZGlmaWVkTW9kZWwpO1xuXHRcdFx0XHRcdFx0dGhpcy5uZXdOb3RlYm9va0VkaXRHZW5lcmF0b3IuYWNjZXB0VGV4dEVkaXRzKFtlZGl0XSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIElmIHdlIGdldCBjZWxsIGVkaXRzLCBpdHMgaW1wb3NzaWJsZSB0byBnZXQgdGV4dCBlZGl0cyBmb3IgdGhlIG5vdGVib29rIHVyaS5cblx0XHRcdFx0XHRcdHRoaXMubmV3Tm90ZWJvb2tFZGl0R2VuZXJhdG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0aWYgKCF0aGlzLmVkaXRlZENlbGxzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgZmluaXNoUHJldmlvdXNDZWxscygpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmVkaXRlZENlbGxzLmFkZChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhd2FpdCBjZWxsRW50cnk/LmFjY2VwdEFnZW50RWRpdHMoW2VkaXRdLCBsYXN0LCByZXNwb25zZU1vZGVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gSWYgd2Ugbm90ZWJvb2sgZWRpdHMsIGl0cyBpbXBvc3NpYmxlIHRvIGdldCB0ZXh0IGVkaXRzIGZvciB0aGUgbm90ZWJvb2sgdXJpLlxuXHRcdFx0XHRcdHRoaXMubmV3Tm90ZWJvb2tFZGl0R2VuZXJhdG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuYWNjZXB0Tm90ZWJvb2tFZGl0KGVkaXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHQvLyBJZiB0aGUgbGFzdCBlZGl0IGZvciBhIGNlbGwgd2FzIHNlbnQsIHRoZW4gaGFuZGxlIGl0XG5cdFx0aWYgKGlzTGFzdEVkaXRzKSB7XG5cdFx0XHRhd2FpdCBmaW5pc2hQcmV2aW91c0NlbGxzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gaXNMYXN0RWRpdHMgY2FuIGJlIHRydWUgZm9yIGNlbGwgVXJpcywgYnV0IHdoZW4gaXRzIHRydWUgZm9yIENlbGxzIGVkaXRzLlxuXHRcdC8vIEl0IGNhbm5vdCBiZSB0cnVlIGZvciB0aGUgbm90ZWJvb2sgaXRzZWxmLlxuXHRcdGlzTGFzdEVkaXRzID0gIWlzQ2VsbFVyaSAmJiBpc0xhc3RFZGl0cztcblxuXHRcdC8vIElmIHRoaXMgaXMgdGhlIGxhc3QgZWRpdCBhbmQgJiB3ZSBnb3QgcmVndWxhciB0ZXh0IGVkaXRzIGZvciBnZW5lcmF0aW5nIG5ldyBub3RlYm9vayBjb250ZW50XG5cdFx0Ly8gVGhlbiBnZW5lcmF0ZSBub3RlYm9vayBlZGl0cyBmcm9tIHRob3NlIHRleHQgZWRpdHMgJiBhcHBseSB0aG9zZSBub3RlYm9vayBlZGl0cy5cblx0XHRpZiAoaXNMYXN0RWRpdHMgJiYgdGhpcy5uZXdOb3RlYm9va0VkaXRHZW5lcmF0b3IpIHtcblx0XHRcdGNvbnN0IG5vdGVib29rRWRpdHMgPSBhd2FpdCB0aGlzLm5ld05vdGVib29rRWRpdEdlbmVyYXRvci5nZW5lcmF0ZUVkaXRzKCk7XG5cdFx0XHR0aGlzLm5ld05vdGVib29rRWRpdEdlbmVyYXRvciA9IHVuZGVmaW5lZDtcblx0XHRcdG5vdGVib29rRWRpdHMuZm9yRWFjaChlZGl0ID0+IHRoaXMuYWNjZXB0Tm90ZWJvb2tFZGl0KGVkaXQpKTtcblx0XHR9XG5cblx0XHR0cmFuc2FjdGlvbigodHgpID0+IHtcblx0XHRcdHRoaXMuX3dhaXRzRm9yTGFzdEVkaXRzLnNldCghaXNMYXN0RWRpdHMsIHR4KTtcblx0XHRcdHRoaXMuX3N0YXRlT2JzLnNldChNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkLCB0eCk7XG5cdFx0XHRpZiAoIWlzTGFzdEVkaXRzKSB7XG5cdFx0XHRcdGNvbnN0IG5ld1Jld3JpdGVSYXRpb24gPSBNYXRoLm1heCh0aGlzLl9yZXdyaXRlUmF0aW9PYnMuZ2V0KCksIGNhbGN1bGF0ZU5vdGVib29rUmV3cml0ZVJhdGlvKHRoaXMuX2NlbGxzRGlmZkluZm8uZ2V0KCksIHRoaXMub3JpZ2luYWxNb2RlbCwgdGhpcy5tb2RpZmllZE1vZGVsKSk7XG5cdFx0XHRcdHRoaXMuX3Jld3JpdGVSYXRpb09icy5zZXQoTWF0aC5taW4oMSwgbmV3UmV3cml0ZVJhdGlvbiksIHR4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZWRpdGVkQ2VsbHMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fcmVzZXRFZGl0c1N0YXRlKHR4KTtcblx0XHRcdFx0dGhpcy5fcmV3cml0ZVJhdGlvT2JzLnNldCgxLCB0eCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoaXNMYXN0RWRpdHMgJiYgdGhpcy5fc2hvdWxkQXV0b1NhdmUoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5tb2RpZmllZFJlc291cmNlUmVmLm9iamVjdC5zYXZlKHtcblx0XHRcdFx0cmVhc29uOiBTYXZlUmVhc29uLkFVVE8sXG5cdFx0XHRcdHNraXBTYXZlUGFydGljaXBhbnRzOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkaXNwb3NlRGVsZXRlZENlbGxFbnRyaWVzKCkge1xuXHRcdGNvbnN0IGNlbGxzVXJpcyA9IG5ldyBSZXNvdXJjZVNldCh0aGlzLm1vZGlmaWVkTW9kZWwuY2VsbHMubWFwKGNlbGwgPT4gY2VsbC51cmkpKTtcblx0XHRBcnJheS5mcm9tKHRoaXMuY2VsbEVudHJ5TWFwLmtleXMoKSkuZm9yRWFjaCh1cmkgPT4ge1xuXHRcdFx0aWYgKGNlbGxzVXJpcy5oYXModXJpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNlbGxFbnRyeU1hcC5nZXQodXJpKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5jZWxsRW50cnlNYXAuZGVsZXRlKHVyaSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhY2NlcHROb3RlYm9va0VkaXQoZWRpdDogSUNlbGxFZGl0T3BlcmF0aW9uKTogdm9pZCB7XG5cdFx0Ly8gbWFrZSB0aGUgYWN0dWFsIGVkaXRcblx0XHR0aGlzLm1vZGlmaWVkTW9kZWwuYXBwbHlFZGl0cyhbZWRpdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHR0aGlzLmRpc3Bvc2VEZWxldGVkQ2VsbEVudHJpZXMoKTtcblxuXG5cdFx0aWYgKGVkaXQuZWRpdFR5cGUgIT09IENlbGxFZGl0VHlwZS5SZXBsYWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEVuc3VyZSBjZWxscyBoYXZlIGludGVybmFsIElkcy5cblx0XHRlZGl0LmNlbGxzLmZvckVhY2goKF8sIGkpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gZWRpdC5pbmRleCArIGk7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5tb2RpZmllZE1vZGVsLmNlbGxzW2luZGV4XTtcblx0XHRcdGlmIChjZWxsLmludGVybmFsTWV0YWRhdGEuaW50ZXJuYWxJZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnRlcm5hbElkID0gZ2VuZXJhdGVDZWxsSGFzaChjZWxsLnVyaSk7XG5cdFx0XHRjb25zdCBlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbeyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhLCBpbmRleCwgaW50ZXJuYWxNZXRhZGF0YTogeyBpbnRlcm5hbElkIH0gfV07XG5cdFx0XHR0aGlzLm1vZGlmaWVkTW9kZWwuYXBwbHlFZGl0cyhlZGl0cywgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGRpZmY6IElDZWxsRGlmZkluZm9bXSA9IFtdO1xuXHRcdGlmIChlZGl0LmNvdW50ID09PSAwKSB7XG5cdFx0XHQvLyBBbGwgZXhpc3RpbmcgaW5kZXhlcyBhcmUgc2hpZnRlZCBieSBudW1iZXIgb2YgY2VsbHMgYWRkZWQuXG5cdFx0XHRkaWZmID0gc29ydENlbGxDaGFuZ2VzKHRoaXMuX2NlbGxzRGlmZkluZm8uZ2V0KCkpO1xuXHRcdFx0ZGlmZi5mb3JFYWNoKGQgPT4ge1xuXHRcdFx0XHRpZiAoZC50eXBlICE9PSAnZGVsZXRlJyAmJiBkLm1vZGlmaWVkQ2VsbEluZGV4ID49IGVkaXQuaW5kZXgpIHtcblx0XHRcdFx0XHRkLm1vZGlmaWVkQ2VsbEluZGV4ICs9IGVkaXQuY2VsbHMubGVuZ3RoO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGRpZmZJbnNlcnQgPSBlZGl0LmNlbGxzLm1hcCgoXywgaSkgPT4gdGhpcy5jcmVhdGVJbnNlcnRlZENlbGxEaWZmSW5mbyhlZGl0LmluZGV4ICsgaSkpO1xuXHRcdFx0ZGlmZi5zcGxpY2UoZWRpdC5pbmRleCwgMCwgLi4uZGlmZkluc2VydCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEFsbCBleGlzdGluZyBpbmRleGVzIGFyZSBzaGlmdGVkIGJ5IG51bWJlciBvZiBjZWxscyByZW1vdmVkLlxuXHRcdFx0Ly8gQW5kIHVuY2hhbmdlZCBjZWxscyBzaG91bGQgYmUgY29udmVydGVkIHRvIGRlbGV0ZWQgY2VsbHMuXG5cdFx0XHRkaWZmID0gc29ydENlbGxDaGFuZ2VzKHRoaXMuX2NlbGxzRGlmZkluZm8uZ2V0KCkpLm1hcCgoZCkgPT4ge1xuXHRcdFx0XHRpZiAoZC50eXBlID09PSAndW5jaGFuZ2VkJyAmJiBkLm1vZGlmaWVkQ2VsbEluZGV4ID49IGVkaXQuaW5kZXggJiYgZC5tb2RpZmllZENlbGxJbmRleCA8PSAoZWRpdC5pbmRleCArIGVkaXQuY291bnQgLSAxKSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZURlbGV0ZUNlbGxEaWZmSW5mbyhkLm9yaWdpbmFsQ2VsbEluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZC50eXBlICE9PSAnZGVsZXRlJyAmJiBkLm1vZGlmaWVkQ2VsbEluZGV4ID49IChlZGl0LmluZGV4ICsgZWRpdC5jb3VudCkpIHtcblx0XHRcdFx0XHRkLm1vZGlmaWVkQ2VsbEluZGV4IC09IGVkaXQuY291bnQ7XG5cdFx0XHRcdFx0cmV0dXJuIGQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVDZWxsRGlmZkluZm8oZGlmZiwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZVN0YXRlQWZ0ZXJBY2NlcHRpbmdSZWplY3RpbmdDaGFuZ2VzKGFjY2VwdGVkOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgY3VycmVudFNuYXBzaG90ID0gY3JlYXRlU25hcHNob3QodGhpcy5tb2RpZmllZE1vZGVsLCB0aGlzLnRyYW5zaWVudE9wdGlvbnMsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChuZXcgU25hcHNob3RDb21wYXJlcihjdXJyZW50U25hcHNob3QpLmlzRXF1YWwodGhpcy5vcmlnaW5hbE1vZGVsKSkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhY2NlcHRlZCA/IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuQWNjZXB0ZWQgOiBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLlJlamVjdGVkO1xuXHRcdFx0dGhpcy5fc3RhdGVPYnMuc2V0KHN0YXRlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fbm90aWZ5U2Vzc2lvbkFjdGlvbihhY2NlcHRlZCA/ICdhY2NlcHRlZCcgOiAncmVqZWN0ZWQnKTtcblx0XHR9XG5cdH1cblxuXHRjcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mbyhtb2RpZmllZENlbGxJbmRleDogbnVtYmVyLCBvcmlnaW5hbENlbGxJbmRleDogbnVtYmVyKTogSUNlbGxEaWZmSW5mbyB7XG5cdFx0Y29uc3QgbW9kaWZpZWRDZWxsID0gdGhpcy5tb2RpZmllZE1vZGVsLmNlbGxzW21vZGlmaWVkQ2VsbEluZGV4XTtcblx0XHRjb25zdCBvcmlnaW5hbENlbGwgPSB0aGlzLm9yaWdpbmFsTW9kZWwuY2VsbHNbb3JpZ2luYWxDZWxsSW5kZXhdO1xuXHRcdHRoaXMubW9kaWZpZWRUb09yaWdpbmFsQ2VsbC5zZXQobW9kaWZpZWRDZWxsLnVyaSwgb3JpZ2luYWxDZWxsLnVyaSk7XG5cdFx0Y29uc3QgbW9kaWZpZWRDZWxsTW9kZWxQcm9taXNlID0gdGhpcy5yZXNvbHZlQ2VsbE1vZGVsKG1vZGlmaWVkQ2VsbC51cmkpO1xuXHRcdGNvbnN0IG9yaWdpbmFsQ2VsbE1vZGVsUHJvbWlzZSA9IHRoaXMucmVzb2x2ZUNlbGxNb2RlbChvcmlnaW5hbENlbGwudXJpKTtcblxuXHRcdFByb21pc2UuYWxsKFttb2RpZmllZENlbGxNb2RlbFByb21pc2UsIG9yaWdpbmFsQ2VsbE1vZGVsUHJvbWlzZV0pLnRoZW4oKFttb2RpZmllZENlbGxNb2RlbCwgb3JpZ2luYWxDZWxsTW9kZWxdKSA9PiB7XG5cdFx0XHR0aGlzLmdldE9yQ3JlYXRlTW9kaWZpZWRUZXh0RmlsZUVudHJ5Rm9yQ2VsbChtb2RpZmllZENlbGwsIG1vZGlmaWVkQ2VsbE1vZGVsLCBvcmlnaW5hbENlbGxNb2RlbCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaWZmID0gb2JzZXJ2YWJsZVZhbHVlKCdkaWZmJywgbnVsbERvY3VtZW50RGlmZik7XG5cdFx0Y29uc3QgdW5jaGFuZ2VkQ2VsbDogSUNlbGxEaWZmSW5mbyA9IHtcblx0XHRcdHR5cGU6ICd1bmNoYW5nZWQnLFxuXHRcdFx0bW9kaWZpZWRDZWxsSW5kZXgsXG5cdFx0XHRvcmlnaW5hbENlbGxJbmRleCxcblx0XHRcdGtlZXA6IGFzeW5jIChjaGFuZ2VzOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgW21vZGlmaWVkQ2VsbE1vZGVsLCBvcmlnaW5hbENlbGxNb2RlbF0gPSBhd2FpdCBQcm9taXNlLmFsbChbbW9kaWZpZWRDZWxsTW9kZWxQcm9taXNlLCBvcmlnaW5hbENlbGxNb2RlbFByb21pc2VdKTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLmdldE9yQ3JlYXRlTW9kaWZpZWRUZXh0RmlsZUVudHJ5Rm9yQ2VsbChtb2RpZmllZENlbGwsIG1vZGlmaWVkQ2VsbE1vZGVsLCBvcmlnaW5hbENlbGxNb2RlbCk7XG5cdFx0XHRcdHJldHVybiBlbnRyeSA/IGVudHJ5LmtlZXAoY2hhbmdlcykgOiBmYWxzZTtcblx0XHRcdH0sXG5cdFx0XHR1bmRvOiBhc3luYyAoY2hhbmdlczogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IFttb2RpZmllZENlbGxNb2RlbCwgb3JpZ2luYWxDZWxsTW9kZWxdID0gYXdhaXQgUHJvbWlzZS5hbGwoW21vZGlmaWVkQ2VsbE1vZGVsUHJvbWlzZSwgb3JpZ2luYWxDZWxsTW9kZWxQcm9taXNlXSk7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5nZXRPckNyZWF0ZU1vZGlmaWVkVGV4dEZpbGVFbnRyeUZvckNlbGwobW9kaWZpZWRDZWxsLCBtb2RpZmllZENlbGxNb2RlbCwgb3JpZ2luYWxDZWxsTW9kZWwpO1xuXHRcdFx0XHRyZXR1cm4gZW50cnkgPyBlbnRyeS51bmRvKGNoYW5nZXMpIDogZmFsc2U7XG5cdFx0XHR9LFxuXHRcdFx0bW9kaWZpZWRNb2RlbDogbmV3IE9ic2VydmFibGVQcm9taXNlKG1vZGlmaWVkQ2VsbE1vZGVsUHJvbWlzZSksXG5cdFx0XHRvcmlnaW5hbE1vZGVsOiBuZXcgT2JzZXJ2YWJsZVByb21pc2Uob3JpZ2luYWxDZWxsTW9kZWxQcm9taXNlKSxcblx0XHRcdGRpZmZcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHVuY2hhbmdlZENlbGw7XG5cblx0fVxuXHRjcmVhdGVJbnNlcnRlZENlbGxEaWZmSW5mbyhtb2RpZmllZENlbGxJbmRleDogbnVtYmVyKTogSUNlbGxEaWZmSW5mbyB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMubW9kaWZpZWRNb2RlbC5jZWxsc1ttb2RpZmllZENlbGxJbmRleF07XG5cdFx0Y29uc3QgbGluZXMgPSBjZWxsLmdldFZhbHVlKCkuc3BsaXQoL1xccj9cXG4vKTtcblx0XHRjb25zdCBvcmlnaW5hbFJhbmdlID0gbmV3IFJhbmdlKDEsIDAsIDEsIDApO1xuXHRcdGNvbnN0IG1vZGlmaWVkUmFuZ2UgPSBuZXcgUmFuZ2UoMSwgMCwgbGluZXMubGVuZ3RoLCBsaW5lc1tsaW5lcy5sZW5ndGggLSAxXS5sZW5ndGgpO1xuXHRcdGNvbnN0IGlubmVyQ2hhbmdlcyA9IG5ldyBSYW5nZU1hcHBpbmcob3JpZ2luYWxSYW5nZSwgbW9kaWZpZWRSYW5nZSk7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IFtuZXcgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKG5ldyBMaW5lUmFuZ2UoMSwgMSksIG5ldyBMaW5lUmFuZ2UoMSwgbGluZXMubGVuZ3RoKSwgW2lubmVyQ2hhbmdlc10pXTtcblx0XHQvLyBXaGVuIGEgbmV3IGNlbGwgaXMgaW5zZXJ0ZWQsIHdlIHVzZSB0aGUgQ2hhdEVkaXRpbmdDb2RlRWRpdG9ySW50ZWdyYXRpb24gdG8gaGFuZGxlIHRoZSBlZGl0cy5cblx0XHQvLyAmIHRvIGFsc28gZGlzcGxheSB1bmRvL3JlZG8gYW5kIGRlY29yYXRpb25zLlxuXHRcdC8vIEhvd2V2ZXIgdGhhdCBuZWVkcyBhIG1vZGlmaWVkIGFuZCBvcmlnaW5hbCBtb2RlbC5cblx0XHQvLyBGb3IgaW5zZXJ0ZWQgY2VsbHMgdGhlcmUncyBubyBvcmlnaW5hbCBtb2RlbCwgc28gd2UgY3JlYXRlIGEgbmV3IGVtcHR5IHRleHQgbW9kZWwgYW5kIHBhc3MgdGhhdCBhcyB0aGUgb3JpZ2luYWwuXG5cdFx0Y29uc3Qgb3JpZ2luYWxNb2RlbFVyaSA9IHRoaXMubW9kaWZpZWRNb2RlbC51cmkud2l0aCh7IHF1ZXJ5OiAoQ2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkuTmV3TW9kZWxDb3VudGVyKyspLnRvU3RyaW5nKCksIHNjaGVtZTogJ2VtcHR5Q2VsbCcgfSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxNb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKG9yaWdpbmFsTW9kZWxVcmkpIHx8IHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCBudWxsLCBvcmlnaW5hbE1vZGVsVXJpKSk7XG5cdFx0dGhpcy5tb2RpZmllZFRvT3JpZ2luYWxDZWxsLnNldChjZWxsLnVyaSwgb3JpZ2luYWxNb2RlbFVyaSk7XG5cdFx0Y29uc3Qga2VlcCA9IGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX2FwcGx5RWRpdHNTeW5jKCgpID0+IHRoaXMua2VlcFByZXZpb3VzbHlJbnNlcnRlZENlbGwoY2VsbCkpO1xuXHRcdFx0dGhpcy5jb21wdXRlU3RhdGVBZnRlckFjY2VwdGluZ1JlamVjdGluZ0NoYW5nZXModHJ1ZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9O1xuXHRcdGNvbnN0IHVuZG8gPSBhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl9hcHBseUVkaXRzU3luYygoKSA9PiB0aGlzLnVuZG9QcmV2aW91c2x5SW5zZXJ0ZWRDZWxsKGNlbGwpKTtcblx0XHRcdHRoaXMuY29tcHV0ZVN0YXRlQWZ0ZXJBY2NlcHRpbmdSZWplY3RpbmdDaGFuZ2VzKGZhbHNlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cdFx0dGhpcy5yZXNvbHZlQ2VsbE1vZGVsKGNlbGwudXJpKS50aGVuKG1vZGlmaWVkTW9kZWwgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gV2Ugd2FudCBkZWNvcmF0b3JzIGZvciB0aGUgY2VsbCBqdXN0IGFzIHdlIGRpc3BsYXkgZGVjb3JhdG9ycyBmb3IgbW9kaWZpZWQgY2VsbHMuXG5cdFx0XHQvLyBUaGlzIHdheSB3ZSBoYXZlIHRoZSBhYmlsaXR5IHRvIGFjY2VwdC9yZWplY3QgdGhlIGVudGlyZSBjZWxsLlxuXHRcdFx0dGhpcy5nZXRPckNyZWF0ZU1vZGlmaWVkVGV4dEZpbGVFbnRyeUZvckNlbGwoY2VsbCwgbW9kaWZpZWRNb2RlbCwgb3JpZ2luYWxNb2RlbCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdpbnNlcnQnIGFzIGNvbnN0LFxuXHRcdFx0b3JpZ2luYWxDZWxsSW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4OiBtb2RpZmllZENlbGxJbmRleCxcblx0XHRcdGtlZXAsXG5cdFx0XHR1bmRvLFxuXHRcdFx0bW9kaWZpZWRNb2RlbDogbmV3IE9ic2VydmFibGVQcm9taXNlKHRoaXMucmVzb2x2ZUNlbGxNb2RlbChjZWxsLnVyaSkpLFxuXHRcdFx0b3JpZ2luYWxNb2RlbDogbmV3IE9ic2VydmFibGVQcm9taXNlKFByb21pc2UucmVzb2x2ZShvcmlnaW5hbE1vZGVsKSksXG5cdFx0XHRkaWZmOiBvYnNlcnZhYmxlVmFsdWUoJ2RlbGV0ZWRDZWxsRGlmZicsIHtcblx0XHRcdFx0Y2hhbmdlcyxcblx0XHRcdFx0aWRlbnRpY2FsOiBmYWxzZSxcblx0XHRcdFx0bW92ZXM6IFtdLFxuXHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlLFxuXHRcdFx0fSlcblx0XHR9IHNhdGlzZmllcyBJQ2VsbERpZmZJbmZvO1xuXHR9XG5cdGNyZWF0ZURlbGV0ZUNlbGxEaWZmSW5mbyhvcmlnaW5hbENlbGxJbmRleDogbnVtYmVyKTogSUNlbGxEaWZmSW5mbyB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxDZWxsID0gdGhpcy5vcmlnaW5hbE1vZGVsLmNlbGxzW29yaWdpbmFsQ2VsbEluZGV4XTtcblx0XHRjb25zdCBsaW5lcyA9IG5ldyBBcnJheShvcmlnaW5hbENlbGwudGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKSkuZmlsbCgwKS5tYXAoKF8sIGkpID0+IG9yaWdpbmFsQ2VsbC50ZXh0QnVmZmVyLmdldExpbmVDb250ZW50KGkgKyAxKSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxSYW5nZSA9IG5ldyBSYW5nZSgxLCAwLCBsaW5lcy5sZW5ndGgsIGxpbmVzW2xpbmVzLmxlbmd0aCAtIDFdLmxlbmd0aCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRSYW5nZSA9IG5ldyBSYW5nZSgxLCAwLCAxLCAwKTtcblx0XHRjb25zdCBpbm5lckNoYW5nZXMgPSBuZXcgUmFuZ2VNYXBwaW5nKG1vZGlmaWVkUmFuZ2UsIG9yaWdpbmFsUmFuZ2UpO1xuXHRcdGNvbnN0IGNoYW5nZXMgPSBbbmV3IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyhuZXcgTGluZVJhbmdlKDEsIGxpbmVzLmxlbmd0aCksIG5ldyBMaW5lUmFuZ2UoMSwgMSksIFtpbm5lckNoYW5nZXNdKV07XG5cdFx0Y29uc3QgbW9kaWZpZWRNb2RlbFVyaSA9IHRoaXMubW9kaWZpZWRNb2RlbC51cmkud2l0aCh7IHF1ZXJ5OiAoQ2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkuTmV3TW9kZWxDb3VudGVyKyspLnRvU3RyaW5nKCksIHNjaGVtZTogJ2VtcHR5Q2VsbCcgfSk7XG5cdFx0Y29uc3QgbW9kaWZpZWRNb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKG1vZGlmaWVkTW9kZWxVcmkpIHx8IHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCBudWxsLCBtb2RpZmllZE1vZGVsVXJpKSk7XG5cdFx0Y29uc3Qga2VlcCA9IGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX2FwcGx5RWRpdHNTeW5jKCgpID0+IHRoaXMua2VlcFByZXZpb3VzbHlEZWxldGVkQ2VsbCh0aGlzLm9yaWdpbmFsTW9kZWwuY2VsbHMuaW5kZXhPZihvcmlnaW5hbENlbGwpKSk7XG5cdFx0XHR0aGlzLmNvbXB1dGVTdGF0ZUFmdGVyQWNjZXB0aW5nUmVqZWN0aW5nQ2hhbmdlcyh0cnVlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cdFx0Y29uc3QgdW5kbyA9IGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX2FwcGx5RWRpdHNTeW5jKCgpID0+IHRoaXMudW5kb1ByZXZpb3VzbHlEZWxldGVkQ2VsbCh0aGlzLm9yaWdpbmFsTW9kZWwuY2VsbHMuaW5kZXhPZihvcmlnaW5hbENlbGwpLCBvcmlnaW5hbENlbGwpKTtcblx0XHRcdHRoaXMuY29tcHV0ZVN0YXRlQWZ0ZXJBY2NlcHRpbmdSZWplY3RpbmdDaGFuZ2VzKGZhbHNlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cblx0XHQvLyBUaGlzIHdpbGwgYmUgZGVsZXRlZC5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2RlbGV0ZScgYXMgY29uc3QsXG5cdFx0XHRtb2RpZmllZENlbGxJbmRleDogdW5kZWZpbmVkLFxuXHRcdFx0b3JpZ2luYWxDZWxsSW5kZXgsXG5cdFx0XHRvcmlnaW5hbE1vZGVsOiBuZXcgT2JzZXJ2YWJsZVByb21pc2UodGhpcy5yZXNvbHZlQ2VsbE1vZGVsKG9yaWdpbmFsQ2VsbC51cmkpKSxcblx0XHRcdG1vZGlmaWVkTW9kZWw6IG5ldyBPYnNlcnZhYmxlUHJvbWlzZShQcm9taXNlLnJlc29sdmUobW9kaWZpZWRNb2RlbCkpLFxuXHRcdFx0a2VlcCxcblx0XHRcdHVuZG8sXG5cdFx0XHRkaWZmOiBvYnNlcnZhYmxlVmFsdWUoJ2NlbGxEaWZmJywge1xuXHRcdFx0XHRjaGFuZ2VzLFxuXHRcdFx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdFx0XHRtb3ZlczogW10sXG5cdFx0XHRcdHF1aXRFYXJseTogZmFsc2UsXG5cdFx0XHR9KVxuXHRcdH0gc2F0aXNmaWVzIElDZWxsRGlmZkluZm87XG5cdH1cblxuXHRwcml2YXRlIHVuZG9QcmV2aW91c2x5SW5zZXJ0ZWRDZWxsKGNlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCkge1xuXHRcdGxldCBkaWZmczogSUNlbGxEaWZmSW5mb1tdID0gW107XG5cdFx0dGhpcy5fYXBwbHlFZGl0c1N5bmMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vZGlmaWVkTW9kZWwuY2VsbHMuaW5kZXhPZihjZWxsKTtcblx0XHRcdGRpZmZzID0gYWRqdXN0Q2VsbERpZmZGb3JSZXZlcnRpbmdBbkluc2VydGVkQ2VsbChpbmRleCxcblx0XHRcdFx0dGhpcy5fY2VsbHNEaWZmSW5mby5nZXQoKSxcblx0XHRcdFx0dGhpcy5tb2RpZmllZE1vZGVsLmFwcGx5RWRpdHMuYmluZCh0aGlzLm1vZGlmaWVkTW9kZWwpKTtcblx0XHR9KTtcblx0XHR0aGlzLmRpc3Bvc2VEZWxldGVkQ2VsbEVudHJpZXMoKTtcblx0XHR0aGlzLnVwZGF0ZUNlbGxEaWZmSW5mbyhkaWZmcywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUga2VlcFByZXZpb3VzbHlJbnNlcnRlZENlbGwoY2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsKSB7XG5cdFx0Y29uc3QgbW9kaWZpZWRDZWxsSW5kZXggPSB0aGlzLm1vZGlmaWVkTW9kZWwuY2VsbHMuaW5kZXhPZihjZWxsKTtcblx0XHRpZiAobW9kaWZpZWRDZWxsSW5kZXggPT09IC0xKSB7XG5cdFx0XHQvLyBOb3QgcG9zc2libGUuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNlbGxUb0luc2VydDogSUNlbGxEdG8yID0ge1xuXHRcdFx0Y2VsbEtpbmQ6IGNlbGwuY2VsbEtpbmQsXG5cdFx0XHRsYW5ndWFnZTogY2VsbC5sYW5ndWFnZSxcblx0XHRcdG1ldGFkYXRhOiBjZWxsLm1ldGFkYXRhLFxuXHRcdFx0b3V0cHV0czogY2VsbC5vdXRwdXRzLFxuXHRcdFx0c291cmNlOiBjZWxsLmdldFZhbHVlKCksXG5cdFx0XHRtaW1lOiBjZWxsLm1pbWUsXG5cdFx0XHRpbnRlcm5hbE1ldGFkYXRhOiB7XG5cdFx0XHRcdGludGVybmFsSWQ6IGNlbGwuaW50ZXJuYWxNZXRhZGF0YS5pbnRlcm5hbElkXG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLmNlbGxFbnRyeU1hcC5nZXQoY2VsbC51cmkpPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jZWxsRW50cnlNYXAuZGVsZXRlKGNlbGwudXJpKTtcblx0XHRjb25zdCBjZWxsRGlmZnMgPSBhZGp1c3RDZWxsRGlmZkZvcktlZXBpbmdBbkluc2VydGVkQ2VsbChcblx0XHRcdG1vZGlmaWVkQ2VsbEluZGV4LFxuXHRcdFx0dGhpcy5fY2VsbHNEaWZmSW5mby5nZXQoKS5zbGljZSgpLFxuXHRcdFx0Y2VsbFRvSW5zZXJ0LFxuXHRcdFx0dGhpcy5vcmlnaW5hbE1vZGVsLmFwcGx5RWRpdHMuYmluZCh0aGlzLm9yaWdpbmFsTW9kZWwpLFxuXHRcdFx0dGhpcy5jcmVhdGVNb2RpZmllZENlbGxEaWZmSW5mby5iaW5kKHRoaXMpXG5cdFx0KTtcblx0XHR0aGlzLnVwZGF0ZUNlbGxEaWZmSW5mbyhjZWxsRGlmZnMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHVuZG9QcmV2aW91c2x5RGVsZXRlZENlbGwoZGVsZXRlZE9yaWdpbmFsSW5kZXg6IG51bWJlciwgb3JpZ2luYWxDZWxsOiBOb3RlYm9va0NlbGxUZXh0TW9kZWwpIHtcblx0XHRjb25zdCBjZWxsVG9JbnNlcnQ6IElDZWxsRHRvMiA9IHtcblx0XHRcdGNlbGxLaW5kOiBvcmlnaW5hbENlbGwuY2VsbEtpbmQsXG5cdFx0XHRsYW5ndWFnZTogb3JpZ2luYWxDZWxsLmxhbmd1YWdlLFxuXHRcdFx0bWV0YWRhdGE6IG9yaWdpbmFsQ2VsbC5tZXRhZGF0YSxcblx0XHRcdG91dHB1dHM6IG9yaWdpbmFsQ2VsbC5vdXRwdXRzLFxuXHRcdFx0c291cmNlOiBvcmlnaW5hbENlbGwuZ2V0VmFsdWUoKSxcblx0XHRcdG1pbWU6IG9yaWdpbmFsQ2VsbC5taW1lLFxuXHRcdFx0aW50ZXJuYWxNZXRhZGF0YToge1xuXHRcdFx0XHRpbnRlcm5hbElkOiBvcmlnaW5hbENlbGwuaW50ZXJuYWxNZXRhZGF0YS5pbnRlcm5hbElkXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRsZXQgY2VsbERpZmZzOiBJQ2VsbERpZmZJbmZvW10gPSBbXTtcblx0XHR0aGlzLl9hcHBseUVkaXRzU3luYygoKSA9PiB7XG5cdFx0XHRjZWxsRGlmZnMgPSBhZGp1c3RDZWxsRGlmZkZvclJldmVydGluZ0FEZWxldGVkQ2VsbChcblx0XHRcdFx0ZGVsZXRlZE9yaWdpbmFsSW5kZXgsXG5cdFx0XHRcdHRoaXMuX2NlbGxzRGlmZkluZm8uZ2V0KCksXG5cdFx0XHRcdGNlbGxUb0luc2VydCxcblx0XHRcdFx0dGhpcy5tb2RpZmllZE1vZGVsLmFwcGx5RWRpdHMuYmluZCh0aGlzLm1vZGlmaWVkTW9kZWwpLFxuXHRcdFx0XHR0aGlzLmNyZWF0ZU1vZGlmaWVkQ2VsbERpZmZJbmZvLmJpbmQodGhpcylcblx0XHRcdCk7XG5cdFx0fSk7XG5cdFx0dGhpcy51cGRhdGVDZWxsRGlmZkluZm8oY2VsbERpZmZzLCB1bmRlZmluZWQpO1xuXHR9XG5cblxuXHRwcml2YXRlIGtlZXBQcmV2aW91c2x5RGVsZXRlZENlbGwoZGVsZXRlZE9yaWdpbmFsSW5kZXg6IG51bWJlcikge1xuXHRcdC8vIERlbGV0ZSB0aGlzIGNlbGwgZnJvbSBvcmlnaW5hbCBhcyB3ZWxsLlxuXHRcdGNvbnN0IGVkaXQ6IElDZWxsUmVwbGFjZUVkaXQgPSB7IGNlbGxzOiBbXSwgY291bnQ6IDEsIGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IGRlbGV0ZWRPcmlnaW5hbEluZGV4LCB9O1xuXHRcdHRoaXMub3JpZ2luYWxNb2RlbC5hcHBseUVkaXRzKFtlZGl0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGNvbnN0IGRpZmZzID0gc29ydENlbGxDaGFuZ2VzKHRoaXMuX2NlbGxzRGlmZkluZm8uZ2V0KCkpXG5cdFx0XHQuZmlsdGVyKGQgPT4gIShkLnR5cGUgPT09ICdkZWxldGUnICYmIGQub3JpZ2luYWxDZWxsSW5kZXggPT09IGRlbGV0ZWRPcmlnaW5hbEluZGV4KSlcblx0XHRcdC5tYXAoZGlmZiA9PiB7XG5cdFx0XHRcdGlmIChkaWZmLnR5cGUgIT09ICdpbnNlcnQnICYmIGRpZmYub3JpZ2luYWxDZWxsSW5kZXggPiBkZWxldGVkT3JpZ2luYWxJbmRleCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHQuLi5kaWZmLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxDZWxsSW5kZXg6IGRpZmYub3JpZ2luYWxDZWxsSW5kZXggLSAxLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGRpZmY7XG5cdFx0XHR9KTtcblx0XHR0aGlzLnVwZGF0ZUNlbGxEaWZmSW5mbyhkaWZmcywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5RWRpdHMob3BlcmF0aW9uOiAoKSA9PiBQcm9taXNlPHZvaWQ+KSB7XG5cdFx0Ly8gbWFrZSB0aGUgYWN0dWFsIGVkaXRcblx0XHR0aGlzLl9pc0VkaXRGcm9tVXMgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBvcGVyYXRpb24oKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNFZGl0RnJvbVVzID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlFZGl0c1N5bmMob3BlcmF0aW9uOiAoKSA9PiB2b2lkKSB7XG5cdFx0Ly8gbWFrZSB0aGUgYWN0dWFsIGVkaXRcblx0XHR0aGlzLl9pc0VkaXRGcm9tVXMgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRvcGVyYXRpb24oKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNFZGl0RnJvbVVzID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2FmZUNyZWF0ZVNuYXBzaG90KG1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCk6IHN0cmluZyB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBjcmVhdGVTbmFwc2hvdChtb2RlbCwgdGhpcy50cmFuc2llbnRPcHRpb25zLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ2dpbmdTZXJ2aWNlLmVycm9yKCdOb3RlYm9vayBDaGF0JywgYEVycm9yIGNyZWF0aW5nIHNuYXBzaG90OiAke2UgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IGV9YCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbml0aWFsQ29udGVudDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q3VycmVudFNuYXBzaG90KCkge1xuXHRcdHJldHVybiB0aGlzLl9zYWZlQ3JlYXRlU25hcHNob3QodGhpcy5tb2RpZmllZE1vZGVsKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZVNuYXBzaG90KGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHVuZG9TdG9wOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJU25hcHNob3RFbnRyeSB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSB0aGlzLl9zYWZlQ3JlYXRlU25hcHNob3QodGhpcy5vcmlnaW5hbE1vZGVsKTtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5nZXRDdXJyZW50U25hcHNob3QoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMubW9kaWZpZWRVUkksXG5cdFx0XHRsYW5ndWFnZUlkOiBTbmFwc2hvdExhbmd1YWdlSWQsXG5cdFx0XHRzbmFwc2hvdFVyaTogZ2V0Tm90ZWJvb2tTbmFwc2hvdEZpbGVVUkkoY2hhdFNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdElkLCB1bmRvU3RvcCwgdGhpcy5tb2RpZmllZFVSSS5wYXRoLCB0aGlzLm1vZGlmaWVkTW9kZWwudmlld1R5cGUpLFxuXHRcdFx0b3JpZ2luYWwsXG5cdFx0XHRjdXJyZW50LFxuXHRcdFx0c3RhdGU6IHRoaXMuc3RhdGUuZ2V0KCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiB0aGlzLnRlbGVtZXRyeUluZm8sXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGVxdWFsc1NuYXBzaG90KHNuYXBzaG90OiBJU25hcHNob3RFbnRyeSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXNuYXBzaG90ICYmXG5cdFx0XHRpc0VxdWFsKHRoaXMubW9kaWZpZWRVUkksIHNuYXBzaG90LnJlc291cmNlKSAmJlxuXHRcdFx0dGhpcy5zdGF0ZS5nZXQoKSA9PT0gc25hcHNob3Quc3RhdGUgJiZcblx0XHRcdG5ldyBTbmFwc2hvdENvbXBhcmVyKHNuYXBzaG90Lm9yaWdpbmFsKS5pc0VxdWFsKHRoaXMub3JpZ2luYWxNb2RlbCkgJiZcblx0XHRcdG5ldyBTbmFwc2hvdENvbXBhcmVyKHNuYXBzaG90LmN1cnJlbnQpLmlzRXF1YWwodGhpcy5tb2RpZmllZE1vZGVsKTtcblxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzdG9yZUZyb21TbmFwc2hvdChzbmFwc2hvdDogSVNuYXBzaG90RW50cnksIHJlc3RvcmVUb0Rpc2sgPSB0cnVlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy51cGRhdGVDZWxsRGlmZkluZm8oW10sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc3RhdGVPYnMuc2V0KHNuYXBzaG90LnN0YXRlLCB1bmRlZmluZWQpO1xuXHRcdHJlc3RvcmVTbmFwc2hvdCh0aGlzLm9yaWdpbmFsTW9kZWwsIHNuYXBzaG90Lm9yaWdpbmFsKTtcblx0XHRpZiAocmVzdG9yZVRvRGlzaykge1xuXHRcdFx0dGhpcy5yZXN0b3JlU25hcHNob3RJbk1vZGlmaWVkTW9kZWwoc25hcHNob3QuY3VycmVudCk7XG5cdFx0fVxuXHRcdHRoaXMuaW5pdGlhbGl6ZU1vZGVsc0Zyb21EaWZmKCk7XG5cdH1cblxuXHRhc3luYyByZXNldEVkaXRUcmFja2VyVG9Jbml0aWFsQ29udGVudCgpIHtcblx0XHRpZiAodGhpcy5pbml0aWFsQ29udGVudCkge1xuXHRcdFx0cmVzdG9yZVNuYXBzaG90KHRoaXMub3JpZ2luYWxNb2RlbCwgdGhpcy5pbml0aWFsQ29udGVudCk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVDZWxsRGlmZkluZm8oW10sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5pbml0aWFsaXplTW9kZWxzRnJvbURpZmYoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc2V0VG9Jbml0aWFsQ29udGVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnVwZGF0ZUNlbGxEaWZmSW5mbyhbXSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLnJlc3RvcmVTbmFwc2hvdEluTW9kaWZpZWRNb2RlbCh0aGlzLmluaXRpYWxDb250ZW50KTtcblx0XHR0aGlzLmluaXRpYWxpemVNb2RlbHNGcm9tRGlmZigpO1xuXHR9XG5cblx0cHVibGljIHJlc3RvcmVNb2RpZmllZE1vZGVsRnJvbVNuYXBzaG90KHNuYXBzaG90OiBzdHJpbmcpIHtcblx0XHR0aGlzLnJlc3RvcmVTbmFwc2hvdEluTW9kaWZpZWRNb2RlbChzbmFwc2hvdCk7XG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZU1vZGVsc0Zyb21EaWZmKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVTbmFwc2hvdEluTW9kaWZpZWRNb2RlbChzbmFwc2hvdDogc3RyaW5nKSB7XG5cdFx0aWYgKHNuYXBzaG90ID09PSBjcmVhdGVTbmFwc2hvdCh0aGlzLm1vZGlmaWVkTW9kZWwsIHRoaXMudHJhbnNpZW50T3B0aW9ucywgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9hcHBseUVkaXRzU3luYygoKSA9PiB7XG5cdFx0XHQvLyBTZWUgcHJpdmF0ZSBfc2V0RG9jVmFsdWUgaW4gY2hhdEVkaXRpbmdNb2RpZmllZERvY3VtZW50RW50cnkudHNcblx0XHRcdHRoaXMubW9kaWZpZWRNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHRyZXN0b3JlU25hcHNob3QodGhpcy5tb2RpZmllZE1vZGVsLCBzbmFwc2hvdCk7XG5cdFx0XHR0aGlzLm1vZGlmaWVkTW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBjZWxsVGV4dE1vZGVsTWFwID0gbmV3IFJlc291cmNlTWFwPElUZXh0TW9kZWw+KCk7XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlQ2VsbE1vZGVsKGNlbGxVUkk6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbD4ge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLm9yaWdpbmFsTW9kZWwuY2VsbHMuY29uY2F0KHRoaXMubW9kaWZpZWRNb2RlbC5jZWxscykuZmluZChjZWxsID0+IGlzRXF1YWwoY2VsbC51cmksIGNlbGxVUkkpKTtcblx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2VsbCBub3QgZm91bmQnKTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNlbGxUZXh0TW9kZWxNYXAuZ2V0KGNlbGwudXJpKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHRoaXMuY2VsbFRleHRNb2RlbE1hcC5zZXQoY2VsbC51cmksIG1vZGVsKTtcblx0XHRcdHJldHVybiBtb2RlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdGV4dEVkaXRvck1vZGVsID0gYXdhaXQgdGhlblJlZ2lzdGVyT3JEaXNwb3NlKHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShjZWxsLnVyaSksIHRoaXMuX3N0b3JlKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGV4dEVkaXRvck1vZGVsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHR0aGlzLmNlbGxUZXh0TW9kZWxNYXAuc2V0KGNlbGwudXJpLCBtb2RlbCk7XG5cdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0fVxuXHR9XG5cblx0Z2V0T3JDcmVhdGVNb2RpZmllZFRleHRGaWxlRW50cnlGb3JDZWxsKGNlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCwgbW9kaWZpZWRDZWxsTW9kZWw6IElUZXh0TW9kZWwsIG9yaWdpbmFsQ2VsbE1vZGVsOiBJVGV4dE1vZGVsKTogQ2hhdEVkaXRpbmdOb3RlYm9va0NlbGxFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGNlbGxFbnRyeSA9IHRoaXMuY2VsbEVudHJ5TWFwLmdldChjZWxsLnVyaSk7XG5cdFx0aWYgKGNlbGxFbnRyeSkge1xuXHRcdFx0cmV0dXJuIGNlbGxFbnRyeTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y2VsbEVudHJ5ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdOb3RlYm9va0NlbGxFbnRyeSwgdGhpcy5tb2RpZmllZFJlc291cmNlUmVmLm9iamVjdC5yZXNvdXJjZSwgY2VsbCwgbW9kaWZpZWRDZWxsTW9kZWwsIG9yaWdpbmFsQ2VsbE1vZGVsLCAoKSA9PiB0aGlzLl9pc0V4dGVybmFsRWRpdEluUHJvZ3Jlc3MsIGRpc3Bvc2FibGVzKSk7XG5cdFx0dGhpcy5jZWxsRW50cnlNYXAuc2V0KGNlbGwudXJpLCBjZWxsRW50cnkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0aWYgKHRoaXMubW9kaWZpZWRNb2RlbC5jZWxscy5pbmRleE9mKGNlbGwpID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaWZmcyA9IHRoaXMuY2VsbHNEaWZmSW5mby5yZWFkKHVuZGVmaW5lZCkuc2xpY2UoKTtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5tb2RpZmllZE1vZGVsLmNlbGxzLmluZGV4T2YoY2VsbCk7XG5cdFx0XHRsZXQgZW50cnkgPSBkaWZmcy5maW5kKGVudHJ5ID0+IGVudHJ5Lm1vZGlmaWVkQ2VsbEluZGV4ID09PSBpbmRleCk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdC8vIE5vdCBwb3NzaWJsZS5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW50cnlJbmRleCA9IGRpZmZzLmluZGV4T2YoZW50cnkpO1xuXHRcdFx0ZW50cnkuZGlmZi5zZXQoY2VsbEVudHJ5LmRpZmZJbmZvLnJlYWQociksIHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAoY2VsbEVudHJ5LmRpZmZJbmZvLnJlYWQodW5kZWZpbmVkKS5pZGVudGljYWwgJiYgZW50cnkudHlwZSA9PT0gJ21vZGlmaWVkJykge1xuXHRcdFx0XHRlbnRyeSA9IHtcblx0XHRcdFx0XHQuLi5lbnRyeSxcblx0XHRcdFx0XHR0eXBlOiAndW5jaGFuZ2VkJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGlmICghY2VsbEVudHJ5LmRpZmZJbmZvLnJlYWQodW5kZWZpbmVkKS5pZGVudGljYWwgJiYgZW50cnkudHlwZSA9PT0gJ3VuY2hhbmdlZCcpIHtcblx0XHRcdFx0ZW50cnkgPSB7XG5cdFx0XHRcdFx0Li4uZW50cnksXG5cdFx0XHRcdFx0dHlwZTogJ21vZGlmaWVkJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGRpZmZzLnNwbGljZShlbnRyeUluZGV4LCAxLCB7IC4uLmVudHJ5IH0pO1xuXG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ2VsbERpZmZJbmZvKGRpZmZzLCB0eCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGlmICh0aGlzLm1vZGlmaWVkTW9kZWwuY2VsbHMuaW5kZXhPZihjZWxsKSA9PT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjZWxsU3RhdGUgPSBjZWxsRW50cnkuc3RhdGUucmVhZChyKTtcblx0XHRcdGlmIChjZWxsU3RhdGUgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuQWNjZXB0ZWQpIHtcblx0XHRcdFx0dGhpcy5jb21wdXRlU3RhdGVBZnRlckFjY2VwdGluZ1JlamVjdGluZ0NoYW5nZXModHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNlbGxTdGF0ZSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5SZWplY3RlZCkge1xuXHRcdFx0XHR0aGlzLmNvbXB1dGVTdGF0ZUFmdGVyQWNjZXB0aW5nUmVqZWN0aW5nQ2hhbmdlcyhmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGNlbGxFbnRyeTtcblx0fVxuXG5cdGFzeW5jIGNvbXB1dGVFZGl0c0Zyb21TbmFwc2hvdHMoYmVmb3JlU25hcHNob3Q6IHN0cmluZywgYWZ0ZXJTbmFwc2hvdDogc3RyaW5nKTogUHJvbWlzZTwoVGV4dEVkaXQgfCBJQ2VsbEVkaXRPcGVyYXRpb24pW10+IHtcblx0XHQvLyBGb3Igbm90ZWJvb2tzLCB3ZSByZXN0b3JlIHRoZSBzbmFwc2hvdCBhbmQgY29tcHV0ZSB0aGUgY2VsbC1sZXZlbCBlZGl0c1xuXHRcdC8vIFRoaXMgaXMgYSBzaW1wbGlmaWVkIGFwcHJvYWNoIHRoYXQgcmVwbGFjZXMgY2VsbHMgYXMgbmVlZGVkXG5cblx0XHRjb25zdCBiZWZvcmVEYXRhID0gZGVzZXJpYWxpemVTbmFwc2hvdChiZWZvcmVTbmFwc2hvdCk7XG5cdFx0Y29uc3QgYWZ0ZXJEYXRhID0gZGVzZXJpYWxpemVTbmFwc2hvdChhZnRlclNuYXBzaG90KTtcblxuXHRcdGNvbnN0IGVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXG5cdFx0Ly8gU2ltcGxlIGFwcHJvYWNoOiByZXBsYWNlIGFsbCBjZWxsc1xuXHRcdC8vIEEgbW9yZSBzb3BoaXN0aWNhdGVkIGFwcHJvYWNoIHdvdWxkIGRpZmYgaW5kaXZpZHVhbCBjZWxsc1xuXHRcdGlmIChiZWZvcmVEYXRhLmRhdGEuY2VsbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZWRpdHMucHVzaCh7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdGNvdW50OiBiZWZvcmVEYXRhLmRhdGEuY2VsbHMubGVuZ3RoLFxuXHRcdFx0XHRjZWxsczogYWZ0ZXJEYXRhLmRhdGEuY2VsbHNcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoYWZ0ZXJEYXRhLmRhdGEuY2VsbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZWRpdHMucHVzaCh7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdGNvdW50OiAwLFxuXHRcdFx0XHRjZWxsczogYWZ0ZXJEYXRhLmRhdGEuY2VsbHNcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0cztcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZEF1dG9TYXZlKCkge1xuXHRcdHJldHVybiB0aGlzLm1vZGlmaWVkVVJJLnNjaGVtZSAhPT0gU2NoZW1hcy51bnRpdGxlZDtcblx0fVxuXG5cdGFzeW5jIHNhdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMubW9kaWZpZWRNb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2F2ZSB0aGUgbm90ZWJvb2sgaWYgZGlydHlcblx0XHRpZiAodGhpcy5ub3RlYm9va1Jlc29sdmVyLmlzRGlydHkodGhpcy5tb2RpZmllZE1vZGVsLnVyaSkpIHtcblx0XHRcdGF3YWl0IHRoaXMubW9kaWZpZWRSZXNvdXJjZVJlZi5vYmplY3Quc2F2ZSh7XG5cdFx0XHRcdHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCxcblx0XHRcdFx0c2tpcFNhdmVQYXJ0aWNpcGFudHM6IHRydWVcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJldmVydFRvRGlzaygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5tb2RpZmllZE1vZGVsLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXZlcnQgdG8gcmVsb2FkIGZyb20gZGlza1xuXHRcdGF3YWl0IHRoaXMubW9kaWZpZWRSZXNvdXJjZVJlZi5vYmplY3QucmV2ZXJ0KHsgc29mdDogZmFsc2UgfSk7XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBnZW5lcmF0ZUNlbGxIYXNoKGNlbGxVcmk6IFVSSSkge1xuXHRjb25zdCBoYXNoID0gbmV3IFN0cmluZ1NIQTEoKTtcblx0aGFzaC51cGRhdGUoY2VsbFVyaS50b1N0cmluZygpKTtcblx0cmV0dXJuIGhhc2guZGlnZXN0KCkuc3Vic3RyaW5nKDAsIDgpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUE2Qiw2QkFBNkI7QUFDbkUsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFvQyxtQkFBbUIsaUJBQWlCLG1CQUFtQjtBQUNwRyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCLG9CQUFvQjtBQUN2RCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUEyQixrQkFBa0IsMkJBQTJCO0FBQ3hFLFNBQXNCLGtCQUFrQjtBQUN4QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDhCQUE4QjtBQUd2QyxTQUFTLHVDQUF1QztBQUdoRCxTQUFTLGNBQTZGLHlCQUF5Qix1QkFBd0U7QUFDdk0sU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxvQkFBb0I7QUFDN0IsU0FBeUcsOEJBQThCO0FBRXZJLFNBQVMsNENBQTRDO0FBQ3JELFNBQVMsZ0JBQWdCLHFCQUFxQiw0QkFBNEIsaUJBQWlCLHdCQUF3QjtBQUNuSCxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDBDQUEwQyw0Q0FBNEM7QUFDL0YsU0FBUyw2Q0FBNkM7QUFDdEQsU0FBUyxvREFBb0Qsb0RBQW9ELHdDQUF3Qyx3Q0FBd0MsMENBQTBDLCtCQUErQixtQ0FBbUMsc0NBQXNDO0FBQ25WLFNBQVMsY0FBNkIsdUJBQXVCO0FBRzdELE1BQU0scUJBQXFCO0FBRXBCLElBQU0sbUNBQU4sY0FBK0MscUNBQXFDO0FBQUEsRUFnSDFGLFlBQ2tCLHFCQUNqQixxQkFDaUIseUJBQ0Esa0JBQ2pCLGVBQ0EsTUFDQSxnQkFDd0Msc0JBQ1osbUJBQ2QsYUFDQSxhQUNTLHNCQUNhLGtCQUNKLGNBQ2QsaUJBQzZCLDZCQUNMLGdCQUNZLGtCQUM3Qix3QkFDeEI7QUFDRCxVQUFNLG9CQUFvQixPQUFPLFNBQVMsS0FBSyxlQUFlLE1BQU0sc0JBQXNCLG1CQUFtQixhQUFhLGFBQWEsaUJBQWlCLHNCQUFzQixzQkFBc0I7QUFwQm5MO0FBRUE7QUFDQTtBQUl1QjtBQUtKO0FBQ0o7QUFFZTtBQUNMO0FBQ1k7QUF0SHZEO0FBQUE7QUFBQTtBQUFBLFNBQVEsd0JBQXdCLGdCQUF5Qix3QkFBd0IsS0FBSztBQUl0RixTQUFRLGdCQUF5QjtBQUlqQztBQUFBO0FBQUE7QUFBQSxTQUFRLHFCQUE4QjtBQUN0QyxTQUFpQixnQkFBZ0IsZ0JBQXdCLE1BQU0sQ0FBQztBQUNoRSxTQUFTLGVBQW9DLEtBQUs7QUFFbEQsU0FBaUIsZUFBZSxJQUFJLFlBQTBDO0FBQzlFLFNBQVEseUJBQXlCLElBQUksWUFBaUI7QUFDdEQsU0FBaUIsaUJBQWlCLGdCQUFpQyxZQUFZLENBQUMsQ0FBQztBQWdCakY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsY0FBYyxJQUFJLFlBQVk7QUEwSC9DLFNBQVEsbUJBQTJCO0FBd3dCbkMsU0FBaUIsbUJBQW1CLElBQUksWUFBd0I7QUF0eUIvRCxTQUFLLHlCQUF5QixJQUFJLGlCQUFpQixjQUFjO0FBQ2pFLFNBQUssZ0JBQWdCLEtBQUssVUFBVSxtQkFBbUIsRUFBRSxPQUFPO0FBQ2hFLFNBQUssZ0JBQWdCLEtBQUssVUFBVSxtQkFBbUIsRUFBRSxPQUFPO0FBQ2hFLFNBQUssY0FBYyxLQUFLLGNBQWM7QUFDdEMsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyx5QkFBeUI7QUFDOUIsU0FBSyxVQUFVLEtBQUssY0FBYyxtQkFBbUIsS0FBSyxxQkFBcUIsSUFBSSxDQUFDO0FBQUEsRUFDckY7QUFBQSxFQWhJQSxJQUFJLHVCQUE2QztBQUNoRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFhQSxJQUFJLGdCQUE4QztBQUNqRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFdBQVc7QUFDZCxXQUFPLEtBQUssY0FBYztBQUFBLEVBQzNCO0FBQUEsRUFVQSxhQUFvQixPQUFPLEtBQVUseUJBQXdGLGVBQTRDLFVBQXdCLGdCQUFvQyxzQkFBNEY7QUFDaFUsV0FBTyxxQkFBcUIsZUFBZSxPQUFNLGFBQVk7QUFDNUQsWUFBTSxrQkFBa0IsU0FBUyxJQUFJLGdCQUFnQjtBQUNyRCxZQUFNLFdBQVcsU0FBUyxJQUFJLG1DQUFtQztBQUNqRSxZQUFNLHNCQUFzQixTQUFTLElBQUkscUJBQXFCO0FBQzlELFlBQU0sY0FBd0QsTUFBTSxTQUFTLFFBQVEsR0FBRztBQUN4RixZQUFNLFdBQVcsWUFBWSxPQUFPO0FBQ3BDLFlBQU0sY0FBYywyQkFBMkIsY0FBYyxpQkFBaUIsY0FBYyxXQUFXLGFBQWEsR0FBRyxTQUFTLElBQUksV0FBVyxRQUFRLFdBQVcsSUFBSSxTQUFTLElBQUksSUFBSSxLQUFLLFNBQVMsSUFBSSxNQUFNLFNBQVMsUUFBUTtBQUNoTyxZQUFNLENBQUMsU0FBUyxNQUFNLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxRQUMzQyxnQkFBZ0IseUJBQXlCLFlBQVksT0FBTyxTQUFTLFlBQVk7QUFBQSxRQUNqRixnQkFBZ0IsbUNBQW1DLFNBQVMsS0FBSyxnQkFBZ0IsUUFBUSxrQkFBa0IsSUFBSSxFQUFFLEtBQUssT0FBSyxlQUFlLENBQUMsQ0FBQztBQUFBLE1BQzdJLENBQUM7QUFDRCxZQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsa0JBQVksSUFBSSxzQ0FBc0MsYUFBYSxhQUFhLE1BQU0sQ0FBQztBQUN2RixZQUFNLGNBQWMsTUFBTSxTQUFTLFFBQVEsYUFBYSxTQUFTLFFBQVE7QUFDekUsVUFBSSxtQkFBbUIsUUFBVztBQUNqQyxZQUFJO0FBQ0gsMEJBQWdCLFlBQVksT0FBTyxVQUFVLGNBQWM7QUFBQSxRQUM1RCxTQUFTLElBQUk7QUFDWixrQkFBUSxNQUFNLDZCQUE2QixjQUFjLElBQUksRUFBRTtBQUMvRCwyQkFBaUIsZUFBZSxVQUFVLFFBQVEsV0FBVyxTQUFTLG1CQUFtQjtBQUFBLFFBQzFGO0FBQUEsTUFDRCxPQUFPO0FBQ04seUJBQWlCLGVBQWUsVUFBVSxRQUFRLFdBQVcsU0FBUyxtQkFBbUI7QUFNekYsd0JBQWdCLFlBQVksT0FBTyxVQUFVLGNBQWM7QUFDM0QsY0FBTSxRQUE4QixDQUFDO0FBQ3JDLGlCQUFTLE1BQU0sUUFBUSxDQUFDLE1BQU0sVUFBVTtBQUN2QyxnQkFBTSxhQUFhLGlCQUFpQixLQUFLLEdBQUc7QUFDNUMsZ0JBQU0sS0FBSyxFQUFFLFVBQVUsYUFBYSx5QkFBeUIsT0FBTyxrQkFBa0IsRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUFBLFFBQ3ZHLENBQUM7QUFDRCxvQkFBWSxPQUFPLFNBQVMsV0FBVyxPQUFPLE1BQU0sUUFBVyxNQUFNLFFBQVcsUUFBVyxLQUFLO0FBQ2hHLG9CQUFZLE9BQU8sU0FBUyxXQUFXLE9BQU8sTUFBTSxRQUFXLE1BQU0sUUFBVyxRQUFXLEtBQUs7QUFBQSxNQUNqRztBQUNBLFlBQU0sV0FBVyxxQkFBcUIsZUFBZSxrQ0FBa0MsYUFBYSxhQUFhLHlCQUF5QixRQUFRLFdBQVcsU0FBUyxlQUFlLFVBQVUsY0FBYztBQUM3TSxlQUFTLFVBQVUsV0FBVztBQUM5QixhQUFPO0FBQUEsSUFDUixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsT0FBYyx5QkFBeUIsZ0JBQTZDO0FBQ25GLFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJO0FBQ0gsMEJBQW9CLGNBQWM7QUFDbEMsYUFBTztBQUFBLElBQ1IsU0FBUyxJQUFJO0FBRVosYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFjLGtCQUFrQixVQUFtQztBQUNsRSxRQUFJLFNBQVMsZUFBZSxzQkFBc0IsaUNBQWlDLHlCQUF5QixTQUFTLE9BQU8sR0FBRztBQUM5SCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFtQ0EsNkJBQTZCLGVBQStCO0FBQzNELFNBQUssYUFBYSxRQUFRLFdBQVMsTUFBTSxRQUFRLENBQUM7QUFDbEQsU0FBSyxhQUFhLE1BQU07QUFDeEIsVUFBTSxRQUFRLGNBQWMsSUFBSSxDQUFDLFVBQVUsTUFBTTtBQUNoRCxjQUFRLFNBQVMsTUFBTTtBQUFBLFFBQ3RCLEtBQUs7QUFDSixpQkFBTyxLQUFLLHlCQUF5QixTQUFTLGlCQUFpQjtBQUFBLFFBQ2hFLEtBQUs7QUFDSixpQkFBTyxLQUFLLDJCQUEyQixTQUFTLGlCQUFpQjtBQUFBLFFBQ2xFO0FBQ0MsaUJBQU8sS0FBSywyQkFBMkIsU0FBUyxtQkFBbUIsU0FBUyxpQkFBaUI7QUFBQSxNQUMvRjtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssZUFBZSxJQUFJLE9BQU8sTUFBUztBQUN4QyxTQUFLLGNBQWMsSUFBSSxhQUFhLEtBQUssR0FBRyxNQUFTO0FBQUEsRUFDdEQ7QUFBQSxFQUVBLHFCQUFxQixRQUFnQjtBQUNwQyxXQUFPLEtBQUssY0FBYyxNQUFNLFVBQVUsT0FBSyxFQUFFLFdBQVcsTUFBTTtBQUFBLEVBQ25FO0FBQUEsRUFHQSxNQUFNLDJCQUEyQjtBQUNoQyxVQUFNLEtBQUssRUFBRSxLQUFLO0FBQ2xCLFFBQUksS0FBSyxxQ0FBcUMsR0FBRztBQUNoRCxZQUFNQSxpQkFBZ0MsS0FBSyxjQUFjLE1BQU0sSUFBSSxDQUFDLEdBQUcsVUFBVTtBQUNoRixlQUFPLEVBQUUsTUFBTSxhQUFhLG1CQUFtQixPQUFPLG1CQUFtQixNQUFNO0FBQUEsTUFDaEYsQ0FBQztBQUNELFdBQUssNkJBQTZCQSxjQUFhO0FBQy9DO0FBQUEsSUFDRDtBQUNBLFVBQU0sZ0JBQWdDLENBQUM7QUFDdkMsUUFBSTtBQUNILFdBQUssc0JBQXNCLElBQUksTUFBTSxNQUFTO0FBQzlDLFlBQU0sZUFBZSxNQUFNLEtBQUssNEJBQTRCLFlBQVksS0FBSyxhQUFhLEtBQUssV0FBVztBQUMxRyxVQUFJLE9BQU8sS0FBSyxvQkFBb0IsS0FBSyxPQUFPLFlBQVk7QUFDM0Q7QUFBQSxNQUNEO0FBQ0EsWUFBTSxTQUFTLFlBQVksS0FBSyxlQUFlLEtBQUssZUFBZSxZQUFZO0FBQy9FLFVBQUksT0FBTyxhQUFhLFFBQVE7QUFDL0Isc0JBQWMsS0FBSyxHQUFHLE9BQU8sWUFBWTtBQUFBLE1BQzFDO0FBQUEsSUFDRCxTQUFTLElBQUk7QUFDWixXQUFLLGVBQWUsTUFBTSxpQkFBaUIsNEJBQTRCLEVBQUU7QUFBQSxJQUMxRSxVQUFFO0FBQ0QsV0FBSyxzQkFBc0IsSUFBSSxPQUFPLE1BQVM7QUFBQSxJQUNoRDtBQUNBLFNBQUssNkJBQTZCLGFBQWE7QUFBQSxFQUNoRDtBQUFBLEVBQ0EsbUJBQW1CLGVBQWdDLGFBQXVDO0FBQ3pGLFNBQUssZUFBZSxJQUFJLGdCQUFnQixhQUFhLEdBQUcsV0FBVztBQUNuRSxTQUFLLGNBQWMsSUFBSSxhQUFhLGFBQWEsR0FBRyxXQUFXO0FBQUEsRUFDaEU7QUFBQSxFQUVBLG9CQUFvQixHQUFrQztBQUNyRCxRQUFJLEtBQUssaUJBQWlCLEtBQUssNkJBQTZCLE1BQU0sS0FBSyxLQUFLLGFBQWEsT0FBTyxDQUFDLEVBQUUsS0FBSyxXQUFTLE1BQU0sWUFBWSxHQUFHO0FBQ3JJO0FBQUEsSUFDRDtBQU1BLFFBQUksNEJBQTRCLEtBQUssdUJBQXVCLFFBQVEsS0FBSyxhQUFhO0FBQ3RGLFVBQU0sZUFBZSxLQUFLLFVBQVUsSUFBSTtBQUN4QyxRQUFJLGlCQUFpQix1QkFBdUIsWUFBWSwyQkFBMkI7QUFDbEYsV0FBSyxVQUFVLElBQUksdUJBQXVCLFVBQVUsTUFBUztBQUM3RCxXQUFLLG1CQUFtQixDQUFDLEdBQUcsTUFBUztBQUNyQyxXQUFLLHlCQUF5QjtBQUM5QixXQUFLLHFCQUFxQixVQUFVO0FBQ3BDO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxFQUFFLFVBQVUsUUFBUTtBQUN4QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLGlCQUFpQix1QkFBdUIsVUFBVTtBQUNyRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLCtCQUErQixLQUFLLGNBQWMsY0FBYyxDQUFDLEdBQUc7QUFDdkU7QUFBQSxJQUNEO0FBRUEsU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyxtQkFBbUIsU0FBUztBQUlqQyxlQUFXLFNBQVMsRUFBRSxVQUFVLE9BQU8sQ0FBQUMsV0FBU0EsT0FBTSxTQUFTLHdCQUF3QixpQkFBaUIsR0FBRztBQUMxRyxjQUFRLE1BQU0sTUFBTTtBQUFBLFFBQ25CLEtBQUssd0JBQXdCLHdCQUF3QjtBQUNwRCxnQkFBTSxPQUEyQjtBQUFBLFlBQ2hDLFVBQVUsYUFBYTtBQUFBLFlBQ3ZCLFVBQVUsS0FBSyxjQUFjO0FBQUEsVUFDOUI7QUFDQSxlQUFLLGNBQWMsV0FBVyxDQUFDLElBQUksR0FBRyxNQUFNLFFBQVcsTUFBTSxRQUFXLFFBQVcsS0FBSztBQUN4RjtBQUFBLFFBQ0Q7QUFBQSxRQUNBLEtBQUssd0JBQXdCLGFBQWE7QUFDekMsY0FBSSxZQUFZLGdCQUFnQixLQUFLLGVBQWUsSUFBSSxDQUFDO0FBRXpELGVBQUssZ0JBQWdCLE1BQU07QUFDMUIsa0JBQU0sUUFBUSxRQUFRLFlBQVU7QUFDL0IscUJBQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxNQUFNLE1BQU07QUFDOUIsb0JBQUksS0FBSyxpQkFBaUIsWUFBWTtBQUNyQztBQUFBLGdCQUNEO0FBQ0Esc0JBQU0sUUFBUSxPQUFPLENBQUMsSUFBSTtBQUMxQixzQkFBTSxhQUFhLGlCQUFpQixLQUFLLEdBQUc7QUFDNUMsc0JBQU0sUUFBOEIsQ0FBQyxFQUFFLFVBQVUsYUFBYSx5QkFBeUIsT0FBTyxrQkFBa0IsRUFBRSxXQUFXLEVBQUUsQ0FBQztBQUNoSSxxQkFBSyxjQUFjLFdBQVcsT0FBTyxNQUFNLFFBQVcsTUFBTSxRQUFXLFFBQVcsS0FBSztBQUN2RixxQkFBSyxxQkFBcUIsQ0FBQztBQUMzQixxQkFBSyxpQkFBaUIsYUFBYTtBQUFBLGNBQ3BDLENBQUM7QUFBQSxZQUNGLENBQUM7QUFBQSxVQUNGLENBQUM7QUFDRCxnQkFBTSxRQUFRLFFBQVEsWUFBVTtBQUMvQix3QkFBWTtBQUFBLGNBQW1EO0FBQUEsY0FDOUQ7QUFBQSxjQUNBLEtBQUssY0FBYyxNQUFNO0FBQUEsY0FDekIsS0FBSyxjQUFjLE1BQU07QUFBQSxjQUN6QixLQUFLLGNBQWMsV0FBVyxLQUFLLEtBQUssYUFBYTtBQUFBLGNBQ3JELEtBQUssMkJBQTJCLEtBQUssSUFBSTtBQUFBLFlBQUM7QUFBQSxVQUM1QyxDQUFDO0FBQ0QsZUFBSyxtQkFBbUIsV0FBVyxNQUFTO0FBQzVDLGVBQUssMEJBQTBCO0FBQy9CO0FBQUEsUUFDRDtBQUFBLFFBQ0EsS0FBSyx3QkFBd0Isb0JBQW9CO0FBQ2hELGdCQUFNLFFBQVEsa0NBQWtDLE1BQU0sT0FBTyxLQUFLLGVBQWUsSUFBSSxDQUFDO0FBQ3RGLGNBQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsa0JBQU0sT0FBMkI7QUFBQSxjQUNoQyxVQUFVLGFBQWE7QUFBQSxjQUN2QjtBQUFBLGNBQ0EsVUFBVSxNQUFNO0FBQUEsWUFDakI7QUFDQSxpQkFBSyxjQUFjLFdBQVcsQ0FBQyxJQUFJLEdBQUcsTUFBTSxRQUFXLE1BQU0sUUFBVyxRQUFXLEtBQUs7QUFBQSxVQUN6RjtBQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0EsS0FBSyx3QkFBd0Isb0JBQW9CO0FBRWhELGdCQUFNLFFBQVEsa0NBQWtDLE1BQU0sT0FBTyxLQUFLLGVBQWUsSUFBSSxDQUFDO0FBQ3RGLGNBQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsa0JBQU0sT0FBMkI7QUFBQSxjQUNoQyxVQUFVLGFBQWE7QUFBQSxjQUN2QjtBQUFBLGNBQ0EsVUFBVSxNQUFNO0FBQUEsWUFDakI7QUFDQSxpQkFBSyxjQUFjLFdBQVcsQ0FBQyxJQUFJLEdBQUcsTUFBTSxRQUFXLE1BQU0sUUFBVyxRQUFXLEtBQUs7QUFBQSxVQUN6RjtBQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0EsS0FBSyx3QkFBd0I7QUFDNUI7QUFBQSxRQUNELEtBQUssd0JBQXdCLDRCQUE0QjtBQUN4RCxnQkFBTSxRQUFRLGtDQUFrQyxNQUFNLE9BQU8sS0FBSyxlQUFlLElBQUksQ0FBQztBQUN0RixjQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGtCQUFNLE9BQTJCO0FBQUEsY0FDaEMsVUFBVSxhQUFhO0FBQUEsY0FDdkI7QUFBQSxjQUNBLGtCQUFrQixNQUFNO0FBQUEsWUFDekI7QUFDQSxpQkFBSyxjQUFjLFdBQVcsQ0FBQyxJQUFJLEdBQUcsTUFBTSxRQUFXLE1BQU0sUUFBVyxRQUFXLEtBQUs7QUFBQSxVQUN6RjtBQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0EsS0FBSyx3QkFBd0IsUUFBUTtBQUVwQyxnQkFBTSxRQUFRLGtDQUFrQyxNQUFNLE9BQU8sS0FBSyxlQUFlLElBQUksQ0FBQztBQUN0RixjQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGtCQUFNLE9BQTJCO0FBQUEsY0FDaEMsVUFBVSxhQUFhO0FBQUEsY0FDdkI7QUFBQSxjQUNBLFFBQVEsTUFBTTtBQUFBLGNBQ2QsU0FBUyxNQUFNO0FBQUEsWUFDaEI7QUFDQSxpQkFBSyxjQUFjLFdBQVcsQ0FBQyxJQUFJLEdBQUcsTUFBTSxRQUFXLE1BQU0sUUFBVyxRQUFXLEtBQUs7QUFBQSxVQUN6RjtBQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0EsS0FBSyx3QkFBd0IsWUFBWTtBQUV4QztBQUFBLFFBQ0Q7QUFBQSxRQUNBLEtBQUssd0JBQXdCLE1BQU07QUFDbEMsZ0JBQU0sU0FBUyxtREFBbUQsT0FBTyxLQUFLLGVBQWUsSUFBSSxFQUFFLE1BQU0sQ0FBQztBQUMxRyxjQUFJLFFBQVE7QUFDWCxpQkFBSyxjQUFjLFdBQVcsT0FBTyxDQUFDLEdBQUcsTUFBTSxRQUFXLE1BQU0sUUFBVyxRQUFXLEtBQUs7QUFDM0YsaUJBQUssZUFBZSxJQUFJLE9BQU8sQ0FBQyxHQUFHLE1BQVM7QUFBQSxVQUM3QztBQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0EsU0FBUztBQUNSO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsZ0NBQTRCLEtBQUssdUJBQXVCLFFBQVEsS0FBSyxhQUFhO0FBQ2xGLFFBQUksaUJBQWlCLHVCQUF1QixZQUFZLDJCQUEyQjtBQUNsRixXQUFLLFVBQVUsSUFBSSx1QkFBdUIsVUFBVSxNQUFTO0FBQzdELFdBQUssbUJBQW1CLENBQUMsR0FBRyxNQUFTO0FBQ3JDLFdBQUsseUJBQXlCO0FBQzlCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQXlCLFlBQTJCO0FBQ25ELFNBQUssbUJBQW1CLENBQUMsR0FBRyxNQUFTO0FBQ3JDLFVBQU0sV0FBVyxlQUFlLEtBQUssZUFBZSxLQUFLLGtCQUFrQixLQUFLLG9CQUFvQjtBQUNwRyxvQkFBZ0IsS0FBSyxlQUFlLFFBQVE7QUFDNUMsU0FBSyx5QkFBeUI7QUFDOUIsVUFBTSxLQUFLLFVBQVUsTUFBUztBQUU5QixVQUFNLFNBQVMsS0FBSyxtQkFBbUIseUJBQXlCLEtBQUssV0FBVztBQUNoRixRQUFJLEtBQUssY0FBYyxJQUFJLFdBQVcsUUFBUSxhQUFhLENBQUMsT0FBTyxZQUFZLENBQUMsS0FBSyxpQkFBaUIsUUFBUSxLQUFLLFdBQVcsSUFBSTtBQUdqSSxZQUFNLEtBQUssWUFBWSxZQUFZO0FBQ2xDLFlBQUk7QUFDSCxnQkFBTSxLQUFLLG9CQUFvQixPQUFPLEtBQUs7QUFBQSxZQUMxQyxRQUFRLFdBQVc7QUFBQSxZQUNuQixPQUFPO0FBQUEsVUFDUixDQUFDO0FBQUEsUUFDRixRQUFRO0FBQUEsUUFFUjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUF5QixZQUEyQjtBQUNuRCxTQUFLLG1CQUFtQixDQUFDLEdBQUcsTUFBUztBQUNyQyxRQUFJLEtBQUssdUJBQXVCLEtBQUssZUFBZSxXQUFXO0FBQzlELFlBQU0sS0FBSyxZQUFZLFlBQVk7QUFDbEMsY0FBTSxLQUFLLG9CQUFvQixPQUFPLE9BQU8sRUFBRSxNQUFNLEtBQUssQ0FBQztBQUMzRCxjQUFNLEtBQUssYUFBYSxJQUFJLEtBQUssV0FBVztBQUFBLE1BQzdDLENBQUM7QUFDRCxXQUFLLGFBQWEsS0FBSztBQUFBLElBQ3hCLE9BQU87QUFDTixZQUFNLEtBQUssWUFBWSxZQUFZO0FBQ2xDLGNBQU0sV0FBVyxlQUFlLEtBQUssZUFBZSxLQUFLLGtCQUFrQixLQUFLLG9CQUFvQjtBQUNwRyxhQUFLLCtCQUErQixRQUFRO0FBQzVDLFlBQUksS0FBSyxzQkFBc0IsTUFBTSxLQUFLLEtBQUssYUFBYSxPQUFPLENBQUMsRUFBRSxNQUFNLFdBQVMsTUFBTSxpQkFBaUIsR0FBRztBQUc5RyxnQkFBTSxLQUFLLG9CQUFvQixPQUFPLEtBQUssRUFBRSxRQUFRLFdBQVcsVUFBVSxzQkFBc0IsS0FBSyxDQUFDO0FBQUEsUUFDdkc7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHlCQUF5QjtBQUM5QixZQUFNLEtBQUssVUFBVSxNQUFTO0FBQUEsSUFDL0I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFVBQVVDLGNBQXNEO0FBQzdFLFNBQUssd0JBQXdCLFNBQVNBLFlBQVc7QUFBQSxFQUNsRDtBQUFBLEVBRW1CLHlCQUF5QixRQUEwRDtBQUNyRyxVQUFNLGlCQUFpQixnQ0FBZ0MsTUFBTTtBQUM3RCxRQUFJLENBQUMsa0JBQWtCLE9BQU8sTUFBTSxNQUFNLHVCQUF1QixJQUFJO0FBQ3BFLFlBQU0sYUFBYyxPQUFPLFdBQVc7QUFDdEMsYUFBTyxLQUFLLHNCQUFzQixlQUFlLDBDQUEwQyxZQUFZLEtBQUssY0FBYztBQUFBLElBQzNIO0FBQ0EsZUFBVyxjQUFjO0FBQ3pCLFdBQU8sS0FBSyxzQkFBc0IsZUFBZSxzQ0FBc0MsTUFBTSxRQUFRLEtBQUssZUFBZSxLQUFLLGVBQWUsS0FBSyxjQUFjO0FBQUEsRUFDaks7QUFBQSxFQUVtQixpQkFBaUIsSUFBd0I7QUFDM0QsVUFBTSxpQkFBaUIsRUFBRTtBQUN6QixTQUFLLGFBQWEsUUFBUSxXQUFTLENBQUMsTUFBTSxjQUFjLE1BQU0sK0JBQStCLENBQUM7QUFBQSxFQUMvRjtBQUFBLEVBRW1CLHVCQUF1QixVQUE0RDtBQUNyRyxVQUFNLFVBQVUsU0FBUyxRQUFRLFlBQVksRUFBRSxLQUFLLFNBQU8sSUFBSSxPQUFPLFNBQVMsU0FBUztBQUN4RixVQUFNLFFBQVEsU0FBUyxRQUFRLE9BQU8sU0FBUyxxQkFBcUIsb0JBQW9CLFFBQVEsUUFBUSxJQUFJLElBQUksU0FBUyxxQkFBcUIsV0FBVztBQUN6SixVQUFNLG1CQUFtQixLQUFLO0FBQzlCLFVBQU0sa0JBQWtCLEtBQUsscUJBQXFCLFNBQWlCLGdCQUFnQixxQkFBcUIsSUFBSTtBQUc1RyxRQUFJLFVBQVUsZUFBZSxLQUFLLGVBQWUsa0JBQWtCLGVBQWU7QUFDbEYsUUFBSSxPQUFPO0FBQ1gsUUFBSSxZQUFZLHVCQUF1QjtBQUV2QyxXQUFPO0FBQUEsTUFDTixNQUFNLG9CQUFvQjtBQUFBLE1BQzFCLFVBQVUsS0FBSztBQUFBLE1BQ2Y7QUFBQSxNQUNBLE1BQU07QUFBQSxNQUNOLG1CQUFtQjtBQUFBLE1BQ25CLE1BQU0sWUFBWTtBQUNqQixlQUFPLGVBQWUsS0FBSyxlQUFlLGtCQUFrQixlQUFlO0FBQzNFLGFBQUssZ0JBQWdCO0FBQ3JCLFlBQUk7QUFDSCwwQkFBZ0IsS0FBSyxlQUFlLE9BQU87QUFDM0MsMEJBQWdCLEtBQUssZUFBZSxPQUFPO0FBQUEsUUFDNUMsVUFBRTtBQUNELGVBQUssZ0JBQWdCO0FBQUEsUUFDdEI7QUFDQSxvQkFBWSxLQUFLLFVBQVUsSUFBSSxNQUFNLHVCQUF1QixXQUFXLHVCQUF1QixXQUFXLHVCQUF1QjtBQUNoSSxhQUFLLFVBQVUsSUFBSSx1QkFBdUIsVUFBVSxNQUFTO0FBQzdELGFBQUssbUJBQW1CLENBQUMsR0FBRyxNQUFTO0FBQ3JDLGFBQUsseUJBQXlCO0FBQzlCLGFBQUsscUJBQXFCLGNBQWM7QUFBQSxNQUN6QztBQUFBLE1BQ0EsTUFBTSxZQUFZO0FBQ2pCLGtCQUFVLGVBQWUsS0FBSyxlQUFlLGtCQUFrQixlQUFlO0FBQzlFLGFBQUssZ0JBQWdCO0FBQ3JCLFlBQUk7QUFDSCwwQkFBZ0IsS0FBSyxlQUFlLElBQUk7QUFDeEMsMEJBQWdCLEtBQUssZUFBZSxJQUFJO0FBQUEsUUFDekMsVUFBRTtBQUNELGVBQUssZ0JBQWdCO0FBQUEsUUFDdEI7QUFDQSxhQUFLLFVBQVUsSUFBSSxXQUFXLE1BQVM7QUFDdkMsYUFBSyxtQkFBbUIsQ0FBQyxHQUFHLE1BQVM7QUFDckMsYUFBSyx5QkFBeUI7QUFDOUIsYUFBSyxxQkFBcUIsY0FBYztBQUFBLE1BQ3pDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQXlCLG1DQUFxRDtBQUM3RSxXQUFPLEtBQUsscUNBQXFDO0FBQUEsRUFDbEQ7QUFBQSxFQUVRLHVDQUFnRDtBQUN2RCxVQUFNLFdBQVcsZUFBZSxLQUFLLGVBQWUsS0FBSyxrQkFBa0IsS0FBSyxvQkFBb0I7QUFDcEcsV0FBTyxJQUFJLGlCQUFpQixRQUFRLEVBQUUsUUFBUSxLQUFLLGFBQWE7QUFBQSxFQUNqRTtBQUFBLEVBR0EsTUFBZSxpQkFBaUIsVUFBZSxPQUEwQyxhQUFzQixlQUE4RDtBQUM1SyxVQUFNLFlBQVksU0FBUyxXQUFXLFFBQVE7QUFDOUMsVUFBTSxPQUFPLGFBQWEsS0FBSyxjQUFjLE1BQU0sS0FBSyxDQUFBQyxVQUFRLFFBQVFBLE1BQUssS0FBSyxRQUFRLENBQUM7QUFDM0YsUUFBSTtBQUNKLFFBQUksTUFBTTtBQUNULFlBQU0sUUFBUSxLQUFLLGNBQWMsTUFBTSxRQUFRLElBQUk7QUFDbkQsWUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQUMsV0FBU0EsT0FBTSxzQkFBc0IsS0FBSztBQUMvRixVQUFJLENBQUMsT0FBTztBQUVYLGdCQUFRLE1BQU0sK0JBQStCO0FBQzdDO0FBQUEsTUFDRDtBQUVBLGtCQUFZLEtBQUssd0NBQXdDLE1BQU0sTUFBTSxNQUFNLGNBQWMsU0FBUyxNQUFNLE1BQU0sY0FBYyxPQUFPO0FBQUEsSUFDcEk7QUFHQSxVQUFNLHNCQUFzQixZQUFZO0FBQ3ZDLFlBQU0sUUFBUSxJQUFJLE1BQU0sS0FBSyxLQUFLLFdBQVcsRUFBRSxJQUFJLE9BQU8sUUFBUTtBQUNqRSxjQUFNRCxRQUFPLEtBQUssY0FBYyxNQUFNLEtBQUssQ0FBQUEsVUFBUSxRQUFRQSxNQUFLLEtBQUssR0FBRyxDQUFDO0FBQ3pFLGNBQU1FLGFBQVlGLFNBQVEsS0FBSyxhQUFhLElBQUlBLE1BQUssR0FBRztBQUN4RCxjQUFNRSxZQUFXLGlCQUFpQixDQUFDLEdBQUcsTUFBTSxhQUFhO0FBQUEsTUFDMUQsQ0FBQyxDQUFDO0FBQ0YsV0FBSyxZQUFZLE1BQU07QUFBQSxJQUN4QjtBQUVBLFVBQU0sS0FBSyxZQUFZLFlBQVk7QUFDbEMsWUFBTSxRQUFRLElBQUksTUFBTSxJQUFJLE9BQU8sTUFBTSxRQUFRO0FBQ2hELGNBQU0sT0FBTyxlQUFlLFFBQVEsTUFBTSxTQUFTO0FBQ25ELFlBQUksU0FBUyxXQUFXLElBQUksR0FBRztBQUU5QixjQUFJLFFBQVEsVUFBVSxLQUFLLGNBQWMsR0FBRyxHQUFHO0FBQzlDLGlCQUFLLDZCQUE2QixLQUFLLHNCQUFzQixlQUFlLG9DQUFvQyxLQUFLLGFBQWE7QUFDbEksaUJBQUsseUJBQXlCLGdCQUFnQixDQUFDLElBQUksQ0FBQztBQUFBLFVBQ3JELE9BQU87QUFFTixpQkFBSywyQkFBMkI7QUFDaEMsZ0JBQUksQ0FBQyxLQUFLLFlBQVksSUFBSSxRQUFRLEdBQUc7QUFDcEMsb0JBQU0sb0JBQW9CO0FBQzFCLG1CQUFLLFlBQVksSUFBSSxRQUFRO0FBQUEsWUFDOUI7QUFDQSxrQkFBTSxXQUFXLGlCQUFpQixDQUFDLElBQUksR0FBRyxNQUFNLGFBQWE7QUFBQSxVQUM5RDtBQUFBLFFBQ0QsT0FBTztBQUVOLGVBQUssMkJBQTJCO0FBQ2hDLGVBQUssbUJBQW1CLElBQUk7QUFBQSxRQUM3QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBR0QsUUFBSSxhQUFhO0FBQ2hCLFlBQU0sb0JBQW9CO0FBQUEsSUFDM0I7QUFJQSxrQkFBYyxDQUFDLGFBQWE7QUFJNUIsUUFBSSxlQUFlLEtBQUssMEJBQTBCO0FBQ2pELFlBQU0sZ0JBQWdCLE1BQU0sS0FBSyx5QkFBeUIsY0FBYztBQUN4RSxXQUFLLDJCQUEyQjtBQUNoQyxvQkFBYyxRQUFRLFVBQVEsS0FBSyxtQkFBbUIsSUFBSSxDQUFDO0FBQUEsSUFDNUQ7QUFFQSxnQkFBWSxDQUFDLE9BQU87QUFDbkIsV0FBSyxtQkFBbUIsSUFBSSxDQUFDLGFBQWEsRUFBRTtBQUM1QyxXQUFLLFVBQVUsSUFBSSx1QkFBdUIsVUFBVSxFQUFFO0FBQ3RELFVBQUksQ0FBQyxhQUFhO0FBQ2pCLGNBQU0sbUJBQW1CLEtBQUssSUFBSSxLQUFLLGlCQUFpQixJQUFJLEdBQUcsOEJBQThCLEtBQUssZUFBZSxJQUFJLEdBQUcsS0FBSyxlQUFlLEtBQUssYUFBYSxDQUFDO0FBQy9KLGFBQUssaUJBQWlCLElBQUksS0FBSyxJQUFJLEdBQUcsZ0JBQWdCLEdBQUcsRUFBRTtBQUFBLE1BQzVELE9BQU87QUFDTixhQUFLLFlBQVksTUFBTTtBQUN2QixhQUFLLGlCQUFpQixFQUFFO0FBQ3hCLGFBQUssaUJBQWlCLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDaEM7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLGVBQWUsS0FBSyxnQkFBZ0IsR0FBRztBQUMxQyxZQUFNLEtBQUssb0JBQW9CLE9BQU8sS0FBSztBQUFBLFFBQzFDLFFBQVEsV0FBVztBQUFBLFFBQ25CLHNCQUFzQjtBQUFBLE1BQ3ZCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsNEJBQTRCO0FBQ25DLFVBQU0sWUFBWSxJQUFJLFlBQVksS0FBSyxjQUFjLE1BQU0sSUFBSSxVQUFRLEtBQUssR0FBRyxDQUFDO0FBQ2hGLFVBQU0sS0FBSyxLQUFLLGFBQWEsS0FBSyxDQUFDLEVBQUUsUUFBUSxTQUFPO0FBQ25ELFVBQUksVUFBVSxJQUFJLEdBQUcsR0FBRztBQUN2QjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGFBQWEsSUFBSSxHQUFHLEdBQUcsUUFBUTtBQUNwQyxXQUFLLGFBQWEsT0FBTyxHQUFHO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLG1CQUFtQixNQUFnQztBQUVsRCxTQUFLLGNBQWMsV0FBVyxDQUFDLElBQUksR0FBRyxNQUFNLFFBQVcsTUFBTSxRQUFXLFFBQVcsS0FBSztBQUN4RixTQUFLLDBCQUEwQjtBQUcvQixRQUFJLEtBQUssYUFBYSxhQUFhLFNBQVM7QUFDM0M7QUFBQSxJQUNEO0FBRUEsU0FBSyxNQUFNLFFBQVEsQ0FBQyxHQUFHLE1BQU07QUFDNUIsWUFBTSxRQUFRLEtBQUssUUFBUTtBQUMzQixZQUFNLE9BQU8sS0FBSyxjQUFjLE1BQU0sS0FBSztBQUMzQyxVQUFJLEtBQUssaUJBQWlCLFlBQVk7QUFDckM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxhQUFhLGlCQUFpQixLQUFLLEdBQUc7QUFDNUMsWUFBTSxRQUE4QixDQUFDLEVBQUUsVUFBVSxhQUFhLHlCQUF5QixPQUFPLGtCQUFrQixFQUFFLFdBQVcsRUFBRSxDQUFDO0FBQ2hJLFdBQUssY0FBYyxXQUFXLE9BQU8sTUFBTSxRQUFXLE1BQU0sUUFBVyxRQUFXLEtBQUs7QUFBQSxJQUN4RixDQUFDO0FBRUQsUUFBSSxPQUF3QixDQUFDO0FBQzdCLFFBQUksS0FBSyxVQUFVLEdBQUc7QUFFckIsYUFBTyxnQkFBZ0IsS0FBSyxlQUFlLElBQUksQ0FBQztBQUNoRCxXQUFLLFFBQVEsT0FBSztBQUNqQixZQUFJLEVBQUUsU0FBUyxZQUFZLEVBQUUscUJBQXFCLEtBQUssT0FBTztBQUM3RCxZQUFFLHFCQUFxQixLQUFLLE1BQU07QUFBQSxRQUNuQztBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sYUFBYSxLQUFLLE1BQU0sSUFBSSxDQUFDLEdBQUcsTUFBTSxLQUFLLDJCQUEyQixLQUFLLFFBQVEsQ0FBQyxDQUFDO0FBQzNGLFdBQUssT0FBTyxLQUFLLE9BQU8sR0FBRyxHQUFHLFVBQVU7QUFBQSxJQUN6QyxPQUFPO0FBR04sYUFBTyxnQkFBZ0IsS0FBSyxlQUFlLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNO0FBQzVELFlBQUksRUFBRSxTQUFTLGVBQWUsRUFBRSxxQkFBcUIsS0FBSyxTQUFTLEVBQUUscUJBQXNCLEtBQUssUUFBUSxLQUFLLFFBQVEsR0FBSTtBQUN4SCxpQkFBTyxLQUFLLHlCQUF5QixFQUFFLGlCQUFpQjtBQUFBLFFBQ3pEO0FBQ0EsWUFBSSxFQUFFLFNBQVMsWUFBWSxFQUFFLHFCQUFzQixLQUFLLFFBQVEsS0FBSyxPQUFRO0FBQzVFLFlBQUUscUJBQXFCLEtBQUs7QUFDNUIsaUJBQU87QUFBQSxRQUNSO0FBQ0EsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0Y7QUFDQSxTQUFLLG1CQUFtQixNQUFNLE1BQVM7QUFBQSxFQUN4QztBQUFBLEVBRVEsMkNBQTJDLFVBQW1CO0FBQ3JFLFVBQU0sa0JBQWtCLGVBQWUsS0FBSyxlQUFlLEtBQUssa0JBQWtCLEtBQUssb0JBQW9CO0FBQzNHLFFBQUksSUFBSSxpQkFBaUIsZUFBZSxFQUFFLFFBQVEsS0FBSyxhQUFhLEdBQUc7QUFDdEUsWUFBTSxRQUFRLFdBQVcsdUJBQXVCLFdBQVcsdUJBQXVCO0FBQ2xGLFdBQUssVUFBVSxJQUFJLE9BQU8sTUFBUztBQUNuQyxXQUFLLHFCQUFxQixXQUFXLGFBQWEsVUFBVTtBQUFBLElBQzdEO0FBQUEsRUFDRDtBQUFBLEVBRUEsMkJBQTJCLG1CQUEyQixtQkFBMEM7QUFDL0YsVUFBTSxlQUFlLEtBQUssY0FBYyxNQUFNLGlCQUFpQjtBQUMvRCxVQUFNLGVBQWUsS0FBSyxjQUFjLE1BQU0saUJBQWlCO0FBQy9ELFNBQUssdUJBQXVCLElBQUksYUFBYSxLQUFLLGFBQWEsR0FBRztBQUNsRSxVQUFNLDJCQUEyQixLQUFLLGlCQUFpQixhQUFhLEdBQUc7QUFDdkUsVUFBTSwyQkFBMkIsS0FBSyxpQkFBaUIsYUFBYSxHQUFHO0FBRXZFLFlBQVEsSUFBSSxDQUFDLDBCQUEwQix3QkFBd0IsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLG1CQUFtQixpQkFBaUIsTUFBTTtBQUNsSCxXQUFLLHdDQUF3QyxjQUFjLG1CQUFtQixpQkFBaUI7QUFBQSxJQUNoRyxDQUFDO0FBRUQsVUFBTSxPQUFPLGdCQUFnQixRQUFRLGdCQUFnQjtBQUNyRCxVQUFNLGdCQUErQjtBQUFBLE1BQ3BDLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0EsTUFBTSxPQUFPLFlBQXNDO0FBQ2xELGNBQU0sQ0FBQyxtQkFBbUIsaUJBQWlCLElBQUksTUFBTSxRQUFRLElBQUksQ0FBQywwQkFBMEIsd0JBQXdCLENBQUM7QUFDckgsY0FBTSxRQUFRLEtBQUssd0NBQXdDLGNBQWMsbUJBQW1CLGlCQUFpQjtBQUM3RyxlQUFPLFFBQVEsTUFBTSxLQUFLLE9BQU8sSUFBSTtBQUFBLE1BQ3RDO0FBQUEsTUFDQSxNQUFNLE9BQU8sWUFBc0M7QUFDbEQsY0FBTSxDQUFDLG1CQUFtQixpQkFBaUIsSUFBSSxNQUFNLFFBQVEsSUFBSSxDQUFDLDBCQUEwQix3QkFBd0IsQ0FBQztBQUNySCxjQUFNLFFBQVEsS0FBSyx3Q0FBd0MsY0FBYyxtQkFBbUIsaUJBQWlCO0FBQzdHLGVBQU8sUUFBUSxNQUFNLEtBQUssT0FBTyxJQUFJO0FBQUEsTUFDdEM7QUFBQSxNQUNBLGVBQWUsSUFBSSxrQkFBa0Isd0JBQXdCO0FBQUEsTUFDN0QsZUFBZSxJQUFJLGtCQUFrQix3QkFBd0I7QUFBQSxNQUM3RDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFFUjtBQUFBLEVBQ0EsMkJBQTJCLG1CQUEwQztBQUNwRSxVQUFNLE9BQU8sS0FBSyxjQUFjLE1BQU0saUJBQWlCO0FBQ3ZELFVBQU0sUUFBUSxLQUFLLFNBQVMsRUFBRSxNQUFNLE9BQU87QUFDM0MsVUFBTSxnQkFBZ0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDMUMsVUFBTSxnQkFBZ0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxNQUFNLFFBQVEsTUFBTSxNQUFNLFNBQVMsQ0FBQyxFQUFFLE1BQU07QUFDbEYsVUFBTSxlQUFlLElBQUksYUFBYSxlQUFlLGFBQWE7QUFDbEUsVUFBTSxVQUFVLENBQUMsSUFBSSx5QkFBeUIsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLE1BQU0sTUFBTSxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7QUFLbEgsVUFBTSxtQkFBbUIsS0FBSyxjQUFjLElBQUksS0FBSyxFQUFFLFFBQVEsaUNBQWlDLG1CQUFtQixTQUFTLEdBQUcsUUFBUSxZQUFZLENBQUM7QUFDcEosVUFBTSxnQkFBZ0IsS0FBSyxhQUFhLFNBQVMsZ0JBQWdCLEtBQUssS0FBSyxVQUFVLEtBQUssYUFBYSxZQUFZLElBQUksTUFBTSxnQkFBZ0IsQ0FBQztBQUM5SSxTQUFLLHVCQUF1QixJQUFJLEtBQUssS0FBSyxnQkFBZ0I7QUFDMUQsVUFBTSxPQUFPLFlBQVk7QUFDeEIsV0FBSyxnQkFBZ0IsTUFBTSxLQUFLLDJCQUEyQixJQUFJLENBQUM7QUFDaEUsV0FBSywyQ0FBMkMsSUFBSTtBQUNwRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sT0FBTyxZQUFZO0FBQ3hCLFdBQUssZ0JBQWdCLE1BQU0sS0FBSywyQkFBMkIsSUFBSSxDQUFDO0FBQ2hFLFdBQUssMkNBQTJDLEtBQUs7QUFDckQsYUFBTztBQUFBLElBQ1I7QUFDQSxTQUFLLGlCQUFpQixLQUFLLEdBQUcsRUFBRSxLQUFLLG1CQUFpQjtBQUNyRCxVQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCO0FBQUEsTUFDRDtBQUdBLFdBQUssd0NBQXdDLE1BQU0sZUFBZSxhQUFhO0FBQUEsSUFDaEYsQ0FBQztBQUNELFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLG1CQUFtQjtBQUFBLE1BQ25CO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLGVBQWUsSUFBSSxrQkFBa0IsS0FBSyxpQkFBaUIsS0FBSyxHQUFHLENBQUM7QUFBQSxNQUNwRSxlQUFlLElBQUksa0JBQWtCLFFBQVEsUUFBUSxhQUFhLENBQUM7QUFBQSxNQUNuRSxNQUFNLGdCQUFnQixtQkFBbUI7QUFBQSxRQUN4QztBQUFBLFFBQ0EsV0FBVztBQUFBLFFBQ1gsT0FBTyxDQUFDO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUNBLHlCQUF5QixtQkFBMEM7QUFDbEUsVUFBTSxlQUFlLEtBQUssY0FBYyxNQUFNLGlCQUFpQjtBQUMvRCxVQUFNLFFBQVEsSUFBSSxNQUFNLGFBQWEsV0FBVyxhQUFhLENBQUMsRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxNQUFNLGFBQWEsV0FBVyxlQUFlLElBQUksQ0FBQyxDQUFDO0FBQ25JLFVBQU0sZ0JBQWdCLElBQUksTUFBTSxHQUFHLEdBQUcsTUFBTSxRQUFRLE1BQU0sTUFBTSxTQUFTLENBQUMsRUFBRSxNQUFNO0FBQ2xGLFVBQU0sZ0JBQWdCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQzFDLFVBQU0sZUFBZSxJQUFJLGFBQWEsZUFBZSxhQUFhO0FBQ2xFLFVBQU0sVUFBVSxDQUFDLElBQUkseUJBQXlCLElBQUksVUFBVSxHQUFHLE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQ2xILFVBQU0sbUJBQW1CLEtBQUssY0FBYyxJQUFJLEtBQUssRUFBRSxRQUFRLGlDQUFpQyxtQkFBbUIsU0FBUyxHQUFHLFFBQVEsWUFBWSxDQUFDO0FBQ3BKLFVBQU0sZ0JBQWdCLEtBQUssYUFBYSxTQUFTLGdCQUFnQixLQUFLLEtBQUssVUFBVSxLQUFLLGFBQWEsWUFBWSxJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFDOUksVUFBTSxPQUFPLFlBQVk7QUFDeEIsV0FBSyxnQkFBZ0IsTUFBTSxLQUFLLDBCQUEwQixLQUFLLGNBQWMsTUFBTSxRQUFRLFlBQVksQ0FBQyxDQUFDO0FBQ3pHLFdBQUssMkNBQTJDLElBQUk7QUFDcEQsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLE9BQU8sWUFBWTtBQUN4QixXQUFLLGdCQUFnQixNQUFNLEtBQUssMEJBQTBCLEtBQUssY0FBYyxNQUFNLFFBQVEsWUFBWSxHQUFHLFlBQVksQ0FBQztBQUN2SCxXQUFLLDJDQUEyQyxLQUFLO0FBQ3JELGFBQU87QUFBQSxJQUNSO0FBR0EsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sbUJBQW1CO0FBQUEsTUFDbkI7QUFBQSxNQUNBLGVBQWUsSUFBSSxrQkFBa0IsS0FBSyxpQkFBaUIsYUFBYSxHQUFHLENBQUM7QUFBQSxNQUM1RSxlQUFlLElBQUksa0JBQWtCLFFBQVEsUUFBUSxhQUFhLENBQUM7QUFBQSxNQUNuRTtBQUFBLE1BQ0E7QUFBQSxNQUNBLE1BQU0sZ0JBQWdCLFlBQVk7QUFBQSxRQUNqQztBQUFBLFFBQ0EsV0FBVztBQUFBLFFBQ1gsT0FBTyxDQUFDO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDJCQUEyQixNQUE2QjtBQUMvRCxRQUFJLFFBQXlCLENBQUM7QUFDOUIsU0FBSyxnQkFBZ0IsTUFBTTtBQUMxQixZQUFNLFFBQVEsS0FBSyxjQUFjLE1BQU0sUUFBUSxJQUFJO0FBQ25ELGNBQVE7QUFBQSxRQUF5QztBQUFBLFFBQ2hELEtBQUssZUFBZSxJQUFJO0FBQUEsUUFDeEIsS0FBSyxjQUFjLFdBQVcsS0FBSyxLQUFLLGFBQWE7QUFBQSxNQUFDO0FBQUEsSUFDeEQsQ0FBQztBQUNELFNBQUssMEJBQTBCO0FBQy9CLFNBQUssbUJBQW1CLE9BQU8sTUFBUztBQUFBLEVBQ3pDO0FBQUEsRUFFUSwyQkFBMkIsTUFBNkI7QUFDL0QsVUFBTSxvQkFBb0IsS0FBSyxjQUFjLE1BQU0sUUFBUSxJQUFJO0FBQy9ELFFBQUksc0JBQXNCLElBQUk7QUFFN0I7QUFBQSxJQUNEO0FBQ0EsVUFBTSxlQUEwQjtBQUFBLE1BQy9CLFVBQVUsS0FBSztBQUFBLE1BQ2YsVUFBVSxLQUFLO0FBQUEsTUFDZixVQUFVLEtBQUs7QUFBQSxNQUNmLFNBQVMsS0FBSztBQUFBLE1BQ2QsUUFBUSxLQUFLLFNBQVM7QUFBQSxNQUN0QixNQUFNLEtBQUs7QUFBQSxNQUNYLGtCQUFrQjtBQUFBLFFBQ2pCLFlBQVksS0FBSyxpQkFBaUI7QUFBQSxNQUNuQztBQUFBLElBQ0Q7QUFDQSxTQUFLLGFBQWEsSUFBSSxLQUFLLEdBQUcsR0FBRyxRQUFRO0FBQ3pDLFNBQUssYUFBYSxPQUFPLEtBQUssR0FBRztBQUNqQyxVQUFNLFlBQVk7QUFBQSxNQUNqQjtBQUFBLE1BQ0EsS0FBSyxlQUFlLElBQUksRUFBRSxNQUFNO0FBQUEsTUFDaEM7QUFBQSxNQUNBLEtBQUssY0FBYyxXQUFXLEtBQUssS0FBSyxhQUFhO0FBQUEsTUFDckQsS0FBSywyQkFBMkIsS0FBSyxJQUFJO0FBQUEsSUFDMUM7QUFDQSxTQUFLLG1CQUFtQixXQUFXLE1BQVM7QUFBQSxFQUM3QztBQUFBLEVBRVEsMEJBQTBCLHNCQUE4QixjQUFxQztBQUNwRyxVQUFNLGVBQTBCO0FBQUEsTUFDL0IsVUFBVSxhQUFhO0FBQUEsTUFDdkIsVUFBVSxhQUFhO0FBQUEsTUFDdkIsVUFBVSxhQUFhO0FBQUEsTUFDdkIsU0FBUyxhQUFhO0FBQUEsTUFDdEIsUUFBUSxhQUFhLFNBQVM7QUFBQSxNQUM5QixNQUFNLGFBQWE7QUFBQSxNQUNuQixrQkFBa0I7QUFBQSxRQUNqQixZQUFZLGFBQWEsaUJBQWlCO0FBQUEsTUFDM0M7QUFBQSxJQUNEO0FBQ0EsUUFBSSxZQUE2QixDQUFDO0FBQ2xDLFNBQUssZ0JBQWdCLE1BQU07QUFDMUIsa0JBQVk7QUFBQSxRQUNYO0FBQUEsUUFDQSxLQUFLLGVBQWUsSUFBSTtBQUFBLFFBQ3hCO0FBQUEsUUFDQSxLQUFLLGNBQWMsV0FBVyxLQUFLLEtBQUssYUFBYTtBQUFBLFFBQ3JELEtBQUssMkJBQTJCLEtBQUssSUFBSTtBQUFBLE1BQzFDO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxtQkFBbUIsV0FBVyxNQUFTO0FBQUEsRUFDN0M7QUFBQSxFQUdRLDBCQUEwQixzQkFBOEI7QUFFL0QsVUFBTSxPQUF5QixFQUFFLE9BQU8sQ0FBQyxHQUFHLE9BQU8sR0FBRyxVQUFVLGFBQWEsU0FBUyxPQUFPLHFCQUFzQjtBQUNuSCxTQUFLLGNBQWMsV0FBVyxDQUFDLElBQUksR0FBRyxNQUFNLFFBQVcsTUFBTSxRQUFXLFFBQVcsS0FBSztBQUN4RixVQUFNLFFBQVEsZ0JBQWdCLEtBQUssZUFBZSxJQUFJLENBQUMsRUFDckQsT0FBTyxPQUFLLEVBQUUsRUFBRSxTQUFTLFlBQVksRUFBRSxzQkFBc0IscUJBQXFCLEVBQ2xGLElBQUksVUFBUTtBQUNaLFVBQUksS0FBSyxTQUFTLFlBQVksS0FBSyxvQkFBb0Isc0JBQXNCO0FBQzVFLGVBQU87QUFBQSxVQUNOLEdBQUc7QUFBQSxVQUNILG1CQUFtQixLQUFLLG9CQUFvQjtBQUFBLFFBQzdDO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRixTQUFLLG1CQUFtQixPQUFPLE1BQVM7QUFBQSxFQUN6QztBQUFBLEVBRUEsTUFBYyxZQUFZLFdBQWdDO0FBRXpELFNBQUssZ0JBQWdCO0FBQ3JCLFFBQUk7QUFDSCxZQUFNLFVBQVU7QUFBQSxJQUNqQixVQUFFO0FBQ0QsV0FBSyxnQkFBZ0I7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFnQixXQUF1QjtBQUU5QyxTQUFLLGdCQUFnQjtBQUNyQixRQUFJO0FBQ0gsZ0JBQVU7QUFBQSxJQUNYLFVBQUU7QUFDRCxXQUFLLGdCQUFnQjtBQUFBLElBQ3RCO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQW9CLE9BQWtDO0FBQzdELFFBQUk7QUFDSCxhQUFPLGVBQWUsT0FBTyxLQUFLLGtCQUFrQixLQUFLLG9CQUFvQjtBQUFBLElBQzlFLFNBQVMsR0FBRztBQUNYLFdBQUssZUFBZSxNQUFNLGlCQUFpQiw0QkFBNEIsYUFBYSxRQUFRLEVBQUUsVUFBVSxDQUFDLEVBQUU7QUFDM0csYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLHFCQUFxQjtBQUMzQixXQUFPLEtBQUssb0JBQW9CLEtBQUssYUFBYTtBQUFBLEVBQ25EO0FBQUEsRUFFUyxlQUFlLHFCQUEwQixXQUErQixVQUE4QztBQUM5SCxVQUFNLFdBQVcsS0FBSyxvQkFBb0IsS0FBSyxhQUFhO0FBQzVELFVBQU0sVUFBVSxLQUFLLG1CQUFtQjtBQUN4QyxXQUFPO0FBQUEsTUFDTixVQUFVLEtBQUs7QUFBQSxNQUNmLFlBQVk7QUFBQSxNQUNaLGFBQWEsMkJBQTJCLHFCQUFxQixXQUFXLFVBQVUsS0FBSyxZQUFZLE1BQU0sS0FBSyxjQUFjLFFBQVE7QUFBQSxNQUNwSTtBQUFBLE1BQ0E7QUFBQSxNQUNBLE9BQU8sS0FBSyxNQUFNLElBQUk7QUFBQSxNQUN0QixlQUFlLEtBQUs7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFBQSxFQUVTLGVBQWUsVUFBK0M7QUFDdEUsV0FBTyxDQUFDLENBQUMsWUFDUixRQUFRLEtBQUssYUFBYSxTQUFTLFFBQVEsS0FDM0MsS0FBSyxNQUFNLElBQUksTUFBTSxTQUFTLFNBQzlCLElBQUksaUJBQWlCLFNBQVMsUUFBUSxFQUFFLFFBQVEsS0FBSyxhQUFhLEtBQ2xFLElBQUksaUJBQWlCLFNBQVMsT0FBTyxFQUFFLFFBQVEsS0FBSyxhQUFhO0FBQUEsRUFFbkU7QUFBQSxFQUVBLE1BQWUsb0JBQW9CLFVBQTBCLGdCQUFnQixNQUFxQjtBQUNqRyxTQUFLLG1CQUFtQixDQUFDLEdBQUcsTUFBUztBQUNyQyxTQUFLLFVBQVUsSUFBSSxTQUFTLE9BQU8sTUFBUztBQUM1QyxvQkFBZ0IsS0FBSyxlQUFlLFNBQVMsUUFBUTtBQUNyRCxRQUFJLGVBQWU7QUFDbEIsV0FBSywrQkFBK0IsU0FBUyxPQUFPO0FBQUEsSUFDckQ7QUFDQSxTQUFLLHlCQUF5QjtBQUFBLEVBQy9CO0FBQUEsRUFFQSxNQUFNLG1DQUFtQztBQUN4QyxRQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLHNCQUFnQixLQUFLLGVBQWUsS0FBSyxjQUFjO0FBQUEsSUFDeEQ7QUFFQSxTQUFLLG1CQUFtQixDQUFDLEdBQUcsTUFBUztBQUNyQyxTQUFLLHlCQUF5QjtBQUFBLEVBQy9CO0FBQUEsRUFFQSxNQUFlLHdCQUF1QztBQUNyRCxTQUFLLG1CQUFtQixDQUFDLEdBQUcsTUFBUztBQUNyQyxTQUFLLCtCQUErQixLQUFLLGNBQWM7QUFDdkQsU0FBSyx5QkFBeUI7QUFBQSxFQUMvQjtBQUFBLEVBRU8saUNBQWlDLFVBQWtCO0FBQ3pELFNBQUssK0JBQStCLFFBQVE7QUFDNUMsV0FBTyxLQUFLLHlCQUF5QjtBQUFBLEVBQ3RDO0FBQUEsRUFFUSwrQkFBK0IsVUFBa0I7QUFDeEQsUUFBSSxhQUFhLGVBQWUsS0FBSyxlQUFlLEtBQUssa0JBQWtCLEtBQUssb0JBQW9CLEdBQUc7QUFDdEc7QUFBQSxJQUNEO0FBRUEsU0FBSyxnQkFBZ0IsTUFBTTtBQUUxQixXQUFLLGNBQWMsaUJBQWlCO0FBQ3BDLHNCQUFnQixLQUFLLGVBQWUsUUFBUTtBQUM1QyxXQUFLLGNBQWMsaUJBQWlCO0FBQUEsSUFDckMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUlBLE1BQWMsaUJBQWlCLFNBQW1DO0FBQ2pFLFVBQU0sT0FBTyxLQUFLLGNBQWMsTUFBTSxPQUFPLEtBQUssY0FBYyxLQUFLLEVBQUUsS0FBSyxDQUFBRixVQUFRLFFBQVFBLE1BQUssS0FBSyxPQUFPLENBQUM7QUFDOUcsUUFBSSxDQUFDLE1BQU07QUFDVixZQUFNLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxJQUNqQztBQUNBLFVBQU0sUUFBUSxLQUFLLGlCQUFpQixJQUFJLEtBQUssR0FBRztBQUNoRCxRQUFJLE9BQU87QUFDVixXQUFLLGlCQUFpQixJQUFJLEtBQUssS0FBSyxLQUFLO0FBQ3pDLGFBQU87QUFBQSxJQUNSLE9BQU87QUFDTixZQUFNLGtCQUFrQixNQUFNLHNCQUFzQixLQUFLLGlCQUFpQixxQkFBcUIsS0FBSyxHQUFHLEdBQUcsS0FBSyxNQUFNO0FBQ3JILFlBQU1HLFNBQVEsZ0JBQWdCLE9BQU87QUFDckMsV0FBSyxpQkFBaUIsSUFBSSxLQUFLLEtBQUtBLE1BQUs7QUFDekMsYUFBT0E7QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsd0NBQXdDLE1BQTZCLG1CQUErQixtQkFBeUU7QUFDNUssUUFBSSxZQUFZLEtBQUssYUFBYSxJQUFJLEtBQUssR0FBRztBQUM5QyxRQUFJLFdBQVc7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxPQUFPLFlBQVk7QUFDM0I7QUFBQSxJQUNEO0FBQ0EsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLGdCQUFZLEtBQUssVUFBVSxLQUFLLHNCQUFzQixlQUFlLDhCQUE4QixLQUFLLG9CQUFvQixPQUFPLFVBQVUsTUFBTSxtQkFBbUIsbUJBQW1CLE1BQU0sS0FBSywyQkFBMkIsV0FBVyxDQUFDO0FBQzNPLFNBQUssYUFBYSxJQUFJLEtBQUssS0FBSyxTQUFTO0FBQ3pDLGdCQUFZLElBQUksUUFBUSxPQUFLO0FBQzVCLFVBQUksS0FBSyxjQUFjLE1BQU0sUUFBUSxJQUFJLE1BQU0sSUFBSTtBQUNsRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFFBQVEsS0FBSyxjQUFjLEtBQUssTUFBUyxFQUFFLE1BQU07QUFDdkQsWUFBTSxRQUFRLEtBQUssY0FBYyxNQUFNLFFBQVEsSUFBSTtBQUNuRCxVQUFJLFFBQVEsTUFBTSxLQUFLLENBQUFGLFdBQVNBLE9BQU0sc0JBQXNCLEtBQUs7QUFDakUsVUFBSSxDQUFDLE9BQU87QUFFWDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGFBQWEsTUFBTSxRQUFRLEtBQUs7QUFDdEMsWUFBTSxLQUFLLElBQUksVUFBVSxTQUFTLEtBQUssQ0FBQyxHQUFHLE1BQVM7QUFDcEQsVUFBSSxVQUFVLFNBQVMsS0FBSyxNQUFTLEVBQUUsYUFBYSxNQUFNLFNBQVMsWUFBWTtBQUM5RSxnQkFBUTtBQUFBLFVBQ1AsR0FBRztBQUFBLFVBQ0gsTUFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLFVBQVUsU0FBUyxLQUFLLE1BQVMsRUFBRSxhQUFhLE1BQU0sU0FBUyxhQUFhO0FBQ2hGLGdCQUFRO0FBQUEsVUFDUCxHQUFHO0FBQUEsVUFDSCxNQUFNO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLE9BQU8sWUFBWSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUM7QUFFeEMsa0JBQVksUUFBTTtBQUNqQixhQUFLLG1CQUFtQixPQUFPLEVBQUU7QUFBQSxNQUNsQyxDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFFRixnQkFBWSxJQUFJLFFBQVEsT0FBSztBQUM1QixVQUFJLEtBQUssY0FBYyxNQUFNLFFBQVEsSUFBSSxNQUFNLElBQUk7QUFDbEQ7QUFBQSxNQUNEO0FBRUEsWUFBTSxZQUFZLFVBQVUsTUFBTSxLQUFLLENBQUM7QUFDeEMsVUFBSSxjQUFjLHVCQUF1QixVQUFVO0FBQ2xELGFBQUssMkNBQTJDLElBQUk7QUFBQSxNQUNyRCxXQUFXLGNBQWMsdUJBQXVCLFVBQVU7QUFDekQsYUFBSywyQ0FBMkMsS0FBSztBQUFBLE1BQ3REO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSwwQkFBMEIsZ0JBQXdCLGVBQW1FO0FBSTFILFVBQU0sYUFBYSxvQkFBb0IsY0FBYztBQUNyRCxVQUFNLFlBQVksb0JBQW9CLGFBQWE7QUFFbkQsVUFBTSxRQUE4QixDQUFDO0FBSXJDLFFBQUksV0FBVyxLQUFLLE1BQU0sU0FBUyxHQUFHO0FBQ3JDLFlBQU0sS0FBSztBQUFBLFFBQ1YsVUFBVSxhQUFhO0FBQUEsUUFDdkIsT0FBTztBQUFBLFFBQ1AsT0FBTyxXQUFXLEtBQUssTUFBTTtBQUFBLFFBQzdCLE9BQU8sVUFBVSxLQUFLO0FBQUEsTUFDdkIsQ0FBQztBQUFBLElBQ0YsV0FBVyxVQUFVLEtBQUssTUFBTSxTQUFTLEdBQUc7QUFDM0MsWUFBTSxLQUFLO0FBQUEsUUFDVixVQUFVLGFBQWE7QUFBQSxRQUN2QixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxPQUFPLFVBQVUsS0FBSztBQUFBLE1BQ3ZCLENBQUM7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGtCQUFrQjtBQUN6QixXQUFPLEtBQUssWUFBWSxXQUFXLFFBQVE7QUFBQSxFQUM1QztBQUFBLEVBRUEsTUFBTSxPQUFzQjtBQUMzQixRQUFJLEtBQUssY0FBYyxJQUFJLFdBQVcsUUFBUSxVQUFVO0FBQ3ZEO0FBQUEsSUFDRDtBQUdBLFFBQUksS0FBSyxpQkFBaUIsUUFBUSxLQUFLLGNBQWMsR0FBRyxHQUFHO0FBQzFELFlBQU0sS0FBSyxvQkFBb0IsT0FBTyxLQUFLO0FBQUEsUUFDMUMsUUFBUSxXQUFXO0FBQUEsUUFDbkIsc0JBQXNCO0FBQUEsTUFDdkIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGVBQThCO0FBQ25DLFFBQUksS0FBSyxjQUFjLElBQUksV0FBVyxRQUFRLFVBQVU7QUFDdkQ7QUFBQSxJQUNEO0FBR0EsVUFBTSxLQUFLLG9CQUFvQixPQUFPLE9BQU8sRUFBRSxNQUFNLE1BQU0sQ0FBQztBQUFBLEVBQzdEO0FBQ0Q7QUFsakNhLGlDQUNMLGtCQUEwQjtBQURyQixtQ0FBTjtBQUFBLEVBd0hKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQW5JVTtBQXFqQ2IsU0FBUyxpQkFBaUIsU0FBYztBQUN2QyxRQUFNLE9BQU8sSUFBSSxXQUFXO0FBQzVCLE9BQUssT0FBTyxRQUFRLFNBQVMsQ0FBQztBQUM5QixTQUFPLEtBQUssT0FBTyxFQUFFLFVBQVUsR0FBRyxDQUFDO0FBQ3BDOyIsCiAgIm5hbWVzIjogWyJjZWxsc0RpZmZJbmZvIiwgImV2ZW50IiwgInRyYW5zYWN0aW9uIiwgImNlbGwiLCAiZW50cnkiLCAiY2VsbEVudHJ5IiwgIm1vZGVsIl0KfQo=
