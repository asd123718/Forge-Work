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
import { assertFn } from "../../../../base/common/assert.js";
import { BugIndicatingError, onUnexpectedError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { derived, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import Severity from "../../../../base/common/severity.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../nls.js";
import { ConfirmResult, IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { SaveSourceRegistry } from "../../../common/editor.js";
import { EditorModel } from "../../../common/editor/editorModel.js";
import { conflictMarkers } from "./mergeMarkers/mergeMarkersController.js";
import { MergeDiffComputer } from "./model/diffComputer.js";
import { MergeEditorModel } from "./model/mergeEditorModel.js";
import { StorageCloseWithConflicts } from "../common/mergeEditor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
let TempFileMergeEditorModeFactory = class {
  constructor(_mergeEditorTelemetry, _instantiationService, _textModelService, _modelService) {
    this._mergeEditorTelemetry = _mergeEditorTelemetry;
    this._instantiationService = _instantiationService;
    this._textModelService = _textModelService;
    this._modelService = _modelService;
  }
  async createInputModel(args) {
    const store = new DisposableStore();
    const [
      base,
      result,
      input1Data,
      input2Data
    ] = await Promise.all([
      this._textModelService.createModelReference(args.base),
      this._textModelService.createModelReference(args.result),
      toInputData(args.input1, this._textModelService, store),
      toInputData(args.input2, this._textModelService, store)
    ]);
    store.add(base);
    store.add(result);
    const tempResultUri = result.object.textEditorModel.uri.with({ scheme: "merge-result" });
    const temporaryResultModel = this._modelService.createModel(
      "",
      {
        languageId: result.object.textEditorModel.getLanguageId(),
        onDidChange: Event.None
      },
      tempResultUri
    );
    store.add(temporaryResultModel);
    const mergeDiffComputer = this._instantiationService.createInstance(MergeDiffComputer);
    const model = this._instantiationService.createInstance(
      MergeEditorModel,
      base.object.textEditorModel,
      input1Data,
      input2Data,
      temporaryResultModel,
      mergeDiffComputer,
      {
        resetResult: true
      },
      this._mergeEditorTelemetry
    );
    store.add(model);
    await model.onInitialized;
    return this._instantiationService.createInstance(TempFileMergeEditorInputModel, model, store, result.object, args.result);
  }
};
TempFileMergeEditorModeFactory = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IModelService)
], TempFileMergeEditorModeFactory);
let TempFileMergeEditorInputModel = class extends EditorModel {
  constructor(model, disposable, result, resultUri, textFileService, dialogService, editorService) {
    super();
    this.model = model;
    this.disposable = disposable;
    this.result = result;
    this.resultUri = resultUri;
    this.textFileService = textFileService;
    this.dialogService = dialogService;
    this.editorService = editorService;
    this.savedAltVersionId = observableValue(this, this.model.resultTextModel.getAlternativeVersionId());
    this.altVersionId = observableFromEvent(
      this,
      (e) => this.model.resultTextModel.onDidChangeContent(e),
      () => (
        /** @description getAlternativeVersionId */
        this.model.resultTextModel.getAlternativeVersionId()
      )
    );
    this.isDirty = derived(this, (reader) => this.altVersionId.read(reader) !== this.savedAltVersionId.read(reader));
    this.finished = false;
  }
  dispose() {
    this.disposable.dispose();
    super.dispose();
  }
  async accept() {
    const value = await this.model.resultTextModel.getValue();
    this.result.textEditorModel.setValue(value);
    this.savedAltVersionId.set(this.model.resultTextModel.getAlternativeVersionId(), void 0);
    await this.textFileService.save(this.result.textEditorModel.uri);
    this.finished = true;
  }
  async _discard() {
    await this.textFileService.revert(this.model.resultTextModel.uri);
    this.savedAltVersionId.set(this.model.resultTextModel.getAlternativeVersionId(), void 0);
    this.finished = true;
  }
  shouldConfirmClose() {
    return true;
  }
  async confirmClose(inputModels) {
    assertFn(
      () => inputModels.some((m) => m === this)
    );
    const someDirty = inputModels.some((m) => m.isDirty.get());
    let choice;
    if (someDirty) {
      const isMany = inputModels.length > 1;
      const message = isMany ? localize("messageN", "Do you want keep the merge result of {0} files?", inputModels.length) : localize("message1", "Do you want keep the merge result of {0}?", basename(inputModels[0].model.resultTextModel.uri));
      const hasUnhandledConflicts = inputModels.some((m) => m.model.hasUnhandledConflicts.get());
      const buttons = [
        {
          label: hasUnhandledConflicts ? localize({ key: "saveWithConflict", comment: ["&& denotes a mnemonic"] }, "&&Save With Conflicts") : localize({ key: "save", comment: ["&& denotes a mnemonic"] }, "&&Save"),
          run: () => ConfirmResult.SAVE
        },
        {
          label: localize({ key: "discard", comment: ["&& denotes a mnemonic"] }, "Do&&n't Save"),
          run: () => ConfirmResult.DONT_SAVE
        }
      ];
      choice = (await this.dialogService.prompt({
        type: Severity.Info,
        message,
        detail: hasUnhandledConflicts ? isMany ? localize("detailNConflicts", "The files contain unhandled conflicts. The merge results will be lost if you don't save them.") : localize("detail1Conflicts", "The file contains unhandled conflicts. The merge result will be lost if you don't save it.") : isMany ? localize("detailN", "The merge results will be lost if you don't save them.") : localize("detail1", "The merge result will be lost if you don't save it."),
        buttons,
        cancelButton: {
          run: () => ConfirmResult.CANCEL
        }
      })).result;
    } else {
      choice = ConfirmResult.DONT_SAVE;
    }
    if (choice === ConfirmResult.SAVE) {
      await Promise.all(inputModels.map((m) => m.accept()));
    } else if (choice === ConfirmResult.DONT_SAVE) {
      await Promise.all(inputModels.map((m) => m._discard()));
    } else {
    }
    return choice;
  }
  async save(options) {
    if (this.finished) {
      return;
    }
    (async () => {
      const { confirmed } = await this.dialogService.confirm({
        message: localize(
          "saveTempFile.message",
          "Do you want to accept the merge result?"
        ),
        detail: localize(
          "saveTempFile.detail",
          "This will write the merge result to the original file and close the merge editor."
        ),
        primaryButton: localize({ key: "acceptMerge", comment: ["&& denotes a mnemonic"] }, "&&Accept Merge")
      });
      if (confirmed) {
        await this.accept();
        const editors = this.editorService.findEditors(this.resultUri).filter((e) => e.editor.typeId === "mergeEditor.Input");
        await this.editorService.closeEditors(editors);
      }
    })();
  }
  async revert(options) {
  }
};
TempFileMergeEditorInputModel = __decorateClass([
  __decorateParam(4, ITextFileService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IEditorService)
], TempFileMergeEditorInputModel);
let WorkspaceMergeEditorModeFactory = class {
  constructor(_mergeEditorTelemetry, _instantiationService, _textModelService, textFileService, _modelService, _languageService) {
    this._mergeEditorTelemetry = _mergeEditorTelemetry;
    this._instantiationService = _instantiationService;
    this._textModelService = _textModelService;
    this.textFileService = textFileService;
    this._modelService = _modelService;
    this._languageService = _languageService;
  }
  async createInputModel(args) {
    const store = new DisposableStore();
    let [
      base,
      result,
      input1Data,
      input2Data
    ] = await Promise.all([
      this._textModelService.createModelReference(args.base).then((v) => ({
        object: v.object.textEditorModel,
        dispose: () => v.dispose()
      })).catch((e) => {
        onUnexpectedError(e);
        console.error(e);
        return void 0;
      }),
      this._textModelService.createModelReference(args.result),
      toInputData(args.input1, this._textModelService, store),
      toInputData(args.input2, this._textModelService, store)
    ]);
    if (base === void 0) {
      const tm = this._modelService.createModel("", this._languageService.createById(result.object.getLanguageId()));
      base = {
        dispose: () => {
          tm.dispose();
        },
        object: tm
      };
    }
    store.add(base);
    store.add(result);
    const resultTextFileModel = this.textFileService.files.models.find(
      (m) => m.resource.toString() === result.object.textEditorModel.uri.toString()
    );
    if (!resultTextFileModel) {
      throw new BugIndicatingError();
    }
    await resultTextFileModel.save({ source: WorkspaceMergeEditorModeFactory.FILE_SAVED_SOURCE });
    const lines = resultTextFileModel.textEditorModel.getLinesContent();
    const hasConflictMarkers = lines.some((l) => l.startsWith(conflictMarkers.start));
    const resetResult = hasConflictMarkers;
    const mergeDiffComputer = this._instantiationService.createInstance(MergeDiffComputer);
    const model = this._instantiationService.createInstance(
      MergeEditorModel,
      base.object,
      input1Data,
      input2Data,
      result.object.textEditorModel,
      mergeDiffComputer,
      {
        resetResult
      },
      this._mergeEditorTelemetry
    );
    store.add(model);
    await model.onInitialized;
    return this._instantiationService.createInstance(WorkspaceMergeEditorInputModel, model, store, resultTextFileModel, this._mergeEditorTelemetry);
  }
};
WorkspaceMergeEditorModeFactory.FILE_SAVED_SOURCE = SaveSourceRegistry.registerSource("merge-editor.source", localize("merge-editor.source", "Before Resolving Conflicts In Merge Editor"));
WorkspaceMergeEditorModeFactory = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, ITextFileService),
  __decorateParam(4, IModelService),
  __decorateParam(5, ILanguageService)
], WorkspaceMergeEditorModeFactory);
let WorkspaceMergeEditorInputModel = class extends EditorModel {
  constructor(model, disposableStore, resultTextFileModel, telemetry, _dialogService, _storageService) {
    super();
    this.model = model;
    this.disposableStore = disposableStore;
    this.resultTextFileModel = resultTextFileModel;
    this.telemetry = telemetry;
    this._dialogService = _dialogService;
    this._storageService = _storageService;
    this.isDirty = observableFromEvent(
      this,
      Event.any(this.resultTextFileModel.onDidChangeDirty, this.resultTextFileModel.onDidSaveError),
      () => (
        /** @description isDirty */
        this.resultTextFileModel.isDirty()
      )
    );
    this.reported = false;
    this.dateTimeOpened = /* @__PURE__ */ new Date();
  }
  dispose() {
    this.disposableStore.dispose();
    super.dispose();
    this.reportClose(false);
  }
  reportClose(accepted) {
    if (!this.reported) {
      const remainingConflictCount = this.model.unhandledConflictsCount.get();
      const durationOpenedMs = (/* @__PURE__ */ new Date()).getTime() - this.dateTimeOpened.getTime();
      this.telemetry.reportMergeEditorClosed({
        durationOpenedSecs: durationOpenedMs / 1e3,
        remainingConflictCount,
        accepted,
        conflictCount: this.model.conflictCount,
        combinableConflictCount: this.model.combinableConflictCount,
        conflictsResolvedWithBase: this.model.conflictsResolvedWithBase,
        conflictsResolvedWithInput1: this.model.conflictsResolvedWithInput1,
        conflictsResolvedWithInput2: this.model.conflictsResolvedWithInput2,
        conflictsResolvedWithSmartCombination: this.model.conflictsResolvedWithSmartCombination,
        manuallySolvedConflictCountThatEqualNone: this.model.manuallySolvedConflictCountThatEqualNone,
        manuallySolvedConflictCountThatEqualSmartCombine: this.model.manuallySolvedConflictCountThatEqualSmartCombine,
        manuallySolvedConflictCountThatEqualInput1: this.model.manuallySolvedConflictCountThatEqualInput1,
        manuallySolvedConflictCountThatEqualInput2: this.model.manuallySolvedConflictCountThatEqualInput2,
        manuallySolvedConflictCountThatEqualNoneAndStartedWithBase: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBase,
        manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1,
        manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2,
        manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart,
        manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart
      });
      this.reported = true;
    }
  }
  async accept() {
    this.reportClose(true);
    await this.resultTextFileModel.save();
  }
  get resultUri() {
    return this.resultTextFileModel.resource;
  }
  async save(options) {
    await this.resultTextFileModel.save(options);
  }
  /**
   * If save resets the dirty state, revert must do so too.
  */
  async revert(options) {
    await this.resultTextFileModel.revert(options);
  }
  shouldConfirmClose() {
    return true;
  }
  async confirmClose(inputModels) {
    const isMany = inputModels.length > 1;
    const someDirty = inputModels.some((m) => m.isDirty.get());
    const someUnhandledConflicts = inputModels.some((m) => m.model.hasUnhandledConflicts.get());
    if (someDirty) {
      const message = isMany ? localize("workspace.messageN", "Do you want to save the changes you made to {0} files?", inputModels.length) : localize("workspace.message1", "Do you want to save the changes you made to {0}?", basename(inputModels[0].resultUri));
      const { result } = await this._dialogService.prompt({
        type: Severity.Info,
        message,
        detail: someUnhandledConflicts ? isMany ? localize("workspace.detailN.unhandled", "The files contain unhandled conflicts. Your changes will be lost if you don't save them.") : localize("workspace.detail1.unhandled", "The file contains unhandled conflicts. Your changes will be lost if you don't save them.") : isMany ? localize("workspace.detailN.handled", "Your changes will be lost if you don't save them.") : localize("workspace.detail1.handled", "Your changes will be lost if you don't save them."),
        buttons: [
          {
            label: someUnhandledConflicts ? localize({ key: "workspace.saveWithConflict", comment: ["&& denotes a mnemonic"] }, "&&Save with Conflicts") : localize({ key: "workspace.save", comment: ["&& denotes a mnemonic"] }, "&&Save"),
            run: () => ConfirmResult.SAVE
          },
          {
            label: localize({ key: "workspace.doNotSave", comment: ["&& denotes a mnemonic"] }, "Do&&n't Save"),
            run: () => ConfirmResult.DONT_SAVE
          }
        ],
        cancelButton: {
          run: () => ConfirmResult.CANCEL
        }
      });
      return result;
    } else if (someUnhandledConflicts && !this._storageService.getBoolean(StorageCloseWithConflicts, StorageScope.PROFILE, false)) {
      const { confirmed, checkboxChecked } = await this._dialogService.confirm({
        message: isMany ? localize("workspace.messageN.nonDirty", "Do you want to close {0} merge editors?", inputModels.length) : localize("workspace.message1.nonDirty", "Do you want to close the merge editor for {0}?", basename(inputModels[0].resultUri)),
        detail: someUnhandledConflicts ? isMany ? localize("workspace.detailN.unhandled.nonDirty", "The files contain unhandled conflicts.") : localize("workspace.detail1.unhandled.nonDirty", "The file contains unhandled conflicts.") : void 0,
        primaryButton: someUnhandledConflicts ? localize({ key: "workspace.closeWithConflicts", comment: ["&& denotes a mnemonic"] }, "&&Close with Conflicts") : localize({ key: "workspace.close", comment: ["&& denotes a mnemonic"] }, "&&Close"),
        checkbox: { label: localize("noMoreWarn", "Do not ask me again") }
      });
      if (checkboxChecked) {
        this._storageService.store(StorageCloseWithConflicts, true, StorageScope.PROFILE, StorageTarget.USER);
      }
      return confirmed ? ConfirmResult.SAVE : ConfirmResult.CANCEL;
    } else {
      return ConfirmResult.SAVE;
    }
  }
};
WorkspaceMergeEditorInputModel = __decorateClass([
  __decorateParam(4, IDialogService),
  __decorateParam(5, IStorageService)
], WorkspaceMergeEditorInputModel);
async function toInputData(data, textModelService, store) {
  const ref = await textModelService.createModelReference(data.uri);
  store.add(ref);
  return {
    textModel: ref.object.textEditorModel,
    title: data.title,
    description: data.description,
    detail: data.detail
  };
}
export {
  TempFileMergeEditorModeFactory,
  WorkspaceMergeEditorModeFactory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFxtZXJnZUVkaXRvcklucHV0TW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhc3NlcnRGbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maXJtUmVzdWx0LCBJRGlhbG9nU2VydmljZSwgSVByb21wdEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVJldmVydE9wdGlvbnMsIFNhdmVTb3VyY2VSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9ySW5wdXREYXRhIH0gZnJvbSAnLi9tZXJnZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGNvbmZsaWN0TWFya2VycyB9IGZyb20gJy4vbWVyZ2VNYXJrZXJzL21lcmdlTWFya2Vyc0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgTWVyZ2VEaWZmQ29tcHV0ZXIgfSBmcm9tICcuL21vZGVsL2RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBJbnB1dERhdGEsIE1lcmdlRWRpdG9yTW9kZWwgfSBmcm9tICcuL21vZGVsL21lcmdlRWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgTWVyZ2VFZGl0b3JUZWxlbWV0cnkgfSBmcm9tICcuL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlQ2xvc2VXaXRoQ29uZmxpY3RzIH0gZnJvbSAnLi4vY29tbW9uL21lcmdlRWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZUVkaXRvck1vZGVsLCBJVGV4dEZpbGVTYXZlT3B0aW9ucywgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBNZXJnZUVkaXRvckFyZ3Mge1xuXHRiYXNlOiBVUkk7XG5cdGlucHV0MTogTWVyZ2VFZGl0b3JJbnB1dERhdGE7XG5cdGlucHV0MjogTWVyZ2VFZGl0b3JJbnB1dERhdGE7XG5cdHJlc3VsdDogVVJJO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZXJnZUVkaXRvcklucHV0TW9kZWxGYWN0b3J5IHtcblx0Y3JlYXRlSW5wdXRNb2RlbChhcmdzOiBNZXJnZUVkaXRvckFyZ3MpOiBQcm9taXNlPElNZXJnZUVkaXRvcklucHV0TW9kZWw+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZXJnZUVkaXRvcklucHV0TW9kZWwgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IHJlc3VsdFVyaTogVVJJO1xuXG5cdHJlYWRvbmx5IG1vZGVsOiBNZXJnZUVkaXRvck1vZGVsO1xuXHRyZWFkb25seSBpc0RpcnR5OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRzYXZlKG9wdGlvbnM/OiBJVGV4dEZpbGVTYXZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIElmIHNhdmUgcmVzZXRzIHRoZSBkaXJ0eSBzdGF0ZSwgcmV2ZXJ0IG11c3QgZG8gc28gdG9vLlxuXHQqL1xuXHRyZXZlcnQob3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblxuXHRzaG91bGRDb25maXJtQ2xvc2UoKTogYm9vbGVhbjtcblxuXHRjb25maXJtQ2xvc2UoaW5wdXRNb2RlbHM6IElNZXJnZUVkaXRvcklucHV0TW9kZWxbXSk6IFByb21pc2U8Q29uZmlybVJlc3VsdD47XG5cblx0LyoqXG5cdCAqIE1hcmtzIHRoZSBtZXJnZSBhcyBkb25lLiBUaGUgbWVyZ2UgZWRpdG9yIG11c3QgYmUgY2xvc2VkIGFmdGVyd2FyZHMuXG5cdCovXG5cdGFjY2VwdCgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG4vKiA9PT09PT09PT09PT09PT09IFRlbXAgRmlsZSA9PT09PT09PT09PT09PT09ICovXG5cbmV4cG9ydCBjbGFzcyBUZW1wRmlsZU1lcmdlRWRpdG9yTW9kZUZhY3RvcnkgaW1wbGVtZW50cyBJTWVyZ2VFZGl0b3JJbnB1dE1vZGVsRmFjdG9yeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21lcmdlRWRpdG9yVGVsZW1ldHJ5OiBNZXJnZUVkaXRvclRlbGVtZXRyeSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVJbnB1dE1vZGVsKGFyZ3M6IE1lcmdlRWRpdG9yQXJncyk6IFByb21pc2U8SU1lcmdlRWRpdG9ySW5wdXRNb2RlbD4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgW1xuXHRcdFx0YmFzZSxcblx0XHRcdHJlc3VsdCxcblx0XHRcdGlucHV0MURhdGEsXG5cdFx0XHRpbnB1dDJEYXRhLFxuXHRcdF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGFyZ3MuYmFzZSksXG5cdFx0XHR0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGFyZ3MucmVzdWx0KSxcblx0XHRcdHRvSW5wdXREYXRhKGFyZ3MuaW5wdXQxLCB0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLCBzdG9yZSksXG5cdFx0XHR0b0lucHV0RGF0YShhcmdzLmlucHV0MiwgdGhpcy5fdGV4dE1vZGVsU2VydmljZSwgc3RvcmUpLFxuXHRcdF0pO1xuXG5cdFx0c3RvcmUuYWRkKGJhc2UpO1xuXHRcdHN0b3JlLmFkZChyZXN1bHQpO1xuXG5cdFx0Y29uc3QgdGVtcFJlc3VsdFVyaSA9IHJlc3VsdC5vYmplY3QudGV4dEVkaXRvck1vZGVsLnVyaS53aXRoKHsgc2NoZW1lOiAnbWVyZ2UtcmVzdWx0JyB9KTtcblxuXHRcdGNvbnN0IHRlbXBvcmFyeVJlc3VsdE1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKFxuXHRcdFx0JycsXG5cdFx0XHR7XG5cdFx0XHRcdGxhbmd1YWdlSWQ6IHJlc3VsdC5vYmplY3QudGV4dEVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHR9LFxuXHRcdFx0dGVtcFJlc3VsdFVyaSxcblx0XHQpO1xuXHRcdHN0b3JlLmFkZCh0ZW1wb3JhcnlSZXN1bHRNb2RlbCk7XG5cblx0XHRjb25zdCBtZXJnZURpZmZDb21wdXRlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lcmdlRGlmZkNvbXB1dGVyKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWVyZ2VFZGl0b3JNb2RlbCxcblx0XHRcdGJhc2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCxcblx0XHRcdGlucHV0MURhdGEsXG5cdFx0XHRpbnB1dDJEYXRhLFxuXHRcdFx0dGVtcG9yYXJ5UmVzdWx0TW9kZWwsXG5cdFx0XHRtZXJnZURpZmZDb21wdXRlcixcblx0XHRcdHtcblx0XHRcdFx0cmVzZXRSZXN1bHQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5fbWVyZ2VFZGl0b3JUZWxlbWV0cnksXG5cdFx0KTtcblx0XHRzdG9yZS5hZGQobW9kZWwpO1xuXG5cdFx0YXdhaXQgbW9kZWwub25Jbml0aWFsaXplZDtcblxuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZW1wRmlsZU1lcmdlRWRpdG9ySW5wdXRNb2RlbCwgbW9kZWwsIHN0b3JlLCByZXN1bHQub2JqZWN0LCBhcmdzLnJlc3VsdCk7XG5cdH1cbn1cblxuY2xhc3MgVGVtcEZpbGVNZXJnZUVkaXRvcklucHV0TW9kZWwgZXh0ZW5kcyBFZGl0b3JNb2RlbCBpbXBsZW1lbnRzIElNZXJnZUVkaXRvcklucHV0TW9kZWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IHNhdmVkQWx0VmVyc2lvbklkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFsdFZlcnNpb25JZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNEaXJ0eTtcblxuXHRwcml2YXRlIGZpbmlzaGVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RlbDogTWVyZ2VFZGl0b3JNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVzdWx0OiBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc3VsdFVyaTogVVJJLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2F2ZWRBbHRWZXJzaW9uSWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdGhpcy5tb2RlbC5yZXN1bHRUZXh0TW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKSk7XG5cdFx0dGhpcy5hbHRWZXJzaW9uSWQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHRlID0+IHRoaXMubW9kZWwucmVzdWx0VGV4dE1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudChlKSxcblx0XHRcdCgpID0+IC8qKiBAZGVzY3JpcHRpb24gZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQgKi8gdGhpcy5tb2RlbC5yZXN1bHRUZXh0TW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKVxuXHRcdCk7XG5cdFx0dGhpcy5pc0RpcnR5ID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB0aGlzLmFsdFZlcnNpb25JZC5yZWFkKHJlYWRlcikgIT09IHRoaXMuc2F2ZWRBbHRWZXJzaW9uSWQucmVhZChyZWFkZXIpKTtcblx0XHR0aGlzLmZpbmlzaGVkID0gZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgYWNjZXB0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5tb2RlbC5yZXN1bHRUZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblx0XHR0aGlzLnJlc3VsdC50ZXh0RWRpdG9yTW9kZWwuc2V0VmFsdWUodmFsdWUpO1xuXHRcdHRoaXMuc2F2ZWRBbHRWZXJzaW9uSWQuc2V0KHRoaXMubW9kZWwucmVzdWx0VGV4dE1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2Uuc2F2ZSh0aGlzLnJlc3VsdC50ZXh0RWRpdG9yTW9kZWwudXJpKTtcblx0XHR0aGlzLmZpbmlzaGVkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc2NhcmQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UucmV2ZXJ0KHRoaXMubW9kZWwucmVzdWx0VGV4dE1vZGVsLnVyaSk7XG5cdFx0dGhpcy5zYXZlZEFsdFZlcnNpb25JZC5zZXQodGhpcy5tb2RlbC5yZXN1bHRUZXh0TW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmZpbmlzaGVkID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBzaG91bGRDb25maXJtQ2xvc2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY29uZmlybUNsb3NlKGlucHV0TW9kZWxzOiBUZW1wRmlsZU1lcmdlRWRpdG9ySW5wdXRNb2RlbFtdKTogUHJvbWlzZTxDb25maXJtUmVzdWx0PiB7XG5cdFx0YXNzZXJ0Rm4oXG5cdFx0XHQoKSA9PiBpbnB1dE1vZGVscy5zb21lKChtKSA9PiBtID09PSB0aGlzKVxuXHRcdCk7XG5cblx0XHRjb25zdCBzb21lRGlydHkgPSBpbnB1dE1vZGVscy5zb21lKChtKSA9PiBtLmlzRGlydHkuZ2V0KCkpO1xuXHRcdGxldCBjaG9pY2U6IENvbmZpcm1SZXN1bHQ7XG5cdFx0aWYgKHNvbWVEaXJ0eSkge1xuXHRcdFx0Y29uc3QgaXNNYW55ID0gaW5wdXRNb2RlbHMubGVuZ3RoID4gMTtcblxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGlzTWFueVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtZXNzYWdlTicsICdEbyB5b3Ugd2FudCBrZWVwIHRoZSBtZXJnZSByZXN1bHQgb2YgezB9IGZpbGVzPycsIGlucHV0TW9kZWxzLmxlbmd0aClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbWVzc2FnZTEnLCAnRG8geW91IHdhbnQga2VlcCB0aGUgbWVyZ2UgcmVzdWx0IG9mIHswfT8nLCBiYXNlbmFtZShpbnB1dE1vZGVsc1swXS5tb2RlbC5yZXN1bHRUZXh0TW9kZWwudXJpKSk7XG5cblx0XHRcdGNvbnN0IGhhc1VuaGFuZGxlZENvbmZsaWN0cyA9IGlucHV0TW9kZWxzLnNvbWUoKG0pID0+IG0ubW9kZWwuaGFzVW5oYW5kbGVkQ29uZmxpY3RzLmdldCgpKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uczogSVByb21wdEJ1dHRvbjxDb25maXJtUmVzdWx0PltdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGhhc1VuaGFuZGxlZENvbmZsaWN0cyA/XG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ3NhdmVXaXRoQ29uZmxpY3QnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTYXZlIFdpdGggQ29uZmxpY3RzXCIpIDpcblx0XHRcdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnc2F2ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNhdmVcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBDb25maXJtUmVzdWx0LlNBVkVcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ2Rpc2NhcmQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiRG8mJm4ndCBTYXZlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gQ29uZmlybVJlc3VsdC5ET05UX1NBVkVcblx0XHRcdFx0fVxuXHRcdFx0XTtcblxuXHRcdFx0Y2hvaWNlID0gKGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQ8Q29uZmlybVJlc3VsdD4oe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRkZXRhaWw6XG5cdFx0XHRcdFx0aGFzVW5oYW5kbGVkQ29uZmxpY3RzXG5cdFx0XHRcdFx0XHQ/IGlzTWFueVxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkZXRhaWxOQ29uZmxpY3RzJywgXCJUaGUgZmlsZXMgY29udGFpbiB1bmhhbmRsZWQgY29uZmxpY3RzLiBUaGUgbWVyZ2UgcmVzdWx0cyB3aWxsIGJlIGxvc3QgaWYgeW91IGRvbid0IHNhdmUgdGhlbS5cIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZGV0YWlsMUNvbmZsaWN0cycsIFwiVGhlIGZpbGUgY29udGFpbnMgdW5oYW5kbGVkIGNvbmZsaWN0cy4gVGhlIG1lcmdlIHJlc3VsdCB3aWxsIGJlIGxvc3QgaWYgeW91IGRvbid0IHNhdmUgaXQuXCIpXG5cdFx0XHRcdFx0XHQ6IGlzTWFueVxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkZXRhaWxOJywgXCJUaGUgbWVyZ2UgcmVzdWx0cyB3aWxsIGJlIGxvc3QgaWYgeW91IGRvbid0IHNhdmUgdGhlbS5cIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZGV0YWlsMScsIFwiVGhlIG1lcmdlIHJlc3VsdCB3aWxsIGJlIGxvc3QgaWYgeW91IGRvbid0IHNhdmUgaXQuXCIpLFxuXHRcdFx0XHRidXR0b25zLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0XHRydW46ICgpID0+IENvbmZpcm1SZXN1bHQuQ0FOQ0VMXG5cdFx0XHRcdH1cblx0XHRcdH0pKS5yZXN1bHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNob2ljZSA9IENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFO1xuXHRcdH1cblxuXHRcdGlmIChjaG9pY2UgPT09IENvbmZpcm1SZXN1bHQuU0FWRSkge1xuXHRcdFx0Ly8gc2F2ZSB3aXRoIGNvbmZsaWN0c1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoaW5wdXRNb2RlbHMubWFwKG0gPT4gbS5hY2NlcHQoKSkpO1xuXHRcdH0gZWxzZSBpZiAoY2hvaWNlID09PSBDb25maXJtUmVzdWx0LkRPTlRfU0FWRSkge1xuXHRcdFx0Ly8gZGlzY2FyZCBjaGFuZ2VzXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChpbnB1dE1vZGVscy5tYXAobSA9PiBtLl9kaXNjYXJkKCkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gY2FuY2VsOiBzdGF5IGluIGVkaXRvclxuXHRcdH1cblx0XHRyZXR1cm4gY2hvaWNlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNhdmUob3B0aW9ucz86IElUZXh0RmlsZVNhdmVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZmluaXNoZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gSXQgZG9lcyBub3QgbWFrZSBzZW5zZSB0byBzYXZlIGFueXRoaW5nIGluIHRoZSB0ZW1wIGZpbGUgbW9kZS5cblx0XHQvLyBUaGUgZmlsZSBzdGF5cyBkaXJ0eSBmcm9tIHRoZSBmaXJzdCBlZGl0IG9uLlxuXG5cdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKFxuXHRcdFx0XHRcdCdzYXZlVGVtcEZpbGUubWVzc2FnZScsXG5cdFx0XHRcdFx0XCJEbyB5b3Ugd2FudCB0byBhY2NlcHQgdGhlIG1lcmdlIHJlc3VsdD9cIlxuXHRcdFx0XHQpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKFxuXHRcdFx0XHRcdCdzYXZlVGVtcEZpbGUuZGV0YWlsJyxcblx0XHRcdFx0XHRcIlRoaXMgd2lsbCB3cml0ZSB0aGUgbWVyZ2UgcmVzdWx0IHRvIHRoZSBvcmlnaW5hbCBmaWxlIGFuZCBjbG9zZSB0aGUgbWVyZ2UgZWRpdG9yLlwiXG5cdFx0XHRcdCksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAnYWNjZXB0TWVyZ2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sICcmJkFjY2VwdCBNZXJnZScpXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmFjY2VwdCgpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JzID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKHRoaXMucmVzdWx0VXJpKS5maWx0ZXIoZSA9PiBlLmVkaXRvci50eXBlSWQgPT09ICdtZXJnZUVkaXRvci5JbnB1dCcpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2UuY2xvc2VFZGl0b3JzKGVkaXRvcnMpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmV2ZXJ0KG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vIG9wXG5cdH1cbn1cblxuLyogPT09PT09PT09PT09PT09PSBXb3Jrc3BhY2UgPT09PT09PT09PT09PT09PSAqL1xuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlTWVyZ2VFZGl0b3JNb2RlRmFjdG9yeSBpbXBsZW1lbnRzIElNZXJnZUVkaXRvcklucHV0TW9kZWxGYWN0b3J5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWVyZ2VFZGl0b3JUZWxlbWV0cnk6IE1lcmdlRWRpdG9yVGVsZW1ldHJ5LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBGSUxFX1NBVkVEX1NPVVJDRSA9IFNhdmVTb3VyY2VSZWdpc3RyeS5yZWdpc3RlclNvdXJjZSgnbWVyZ2UtZWRpdG9yLnNvdXJjZScsIGxvY2FsaXplKCdtZXJnZS1lZGl0b3Iuc291cmNlJywgXCJCZWZvcmUgUmVzb2x2aW5nIENvbmZsaWN0cyBJbiBNZXJnZSBFZGl0b3JcIikpO1xuXG5cdHB1YmxpYyBhc3luYyBjcmVhdGVJbnB1dE1vZGVsKGFyZ3M6IE1lcmdlRWRpdG9yQXJncyk6IFByb21pc2U8SU1lcmdlRWRpdG9ySW5wdXRNb2RlbD4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0bGV0IFtcblx0XHRcdGJhc2UsXG5cdFx0XHRyZXN1bHQsXG5cdFx0XHRpbnB1dDFEYXRhLFxuXHRcdFx0aW5wdXQyRGF0YSxcblx0XHRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShhcmdzLmJhc2UpLnRoZW48SVJlZmVyZW5jZTxJVGV4dE1vZGVsPj4odiA9PiAoe1xuXHRcdFx0XHRvYmplY3Q6IHYub2JqZWN0LnRleHRFZGl0b3JNb2RlbCxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gdi5kaXNwb3NlKCksXG5cdFx0XHR9KSkuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKGUpOyAvLyBPbmx5IGZpbGUgbm90IGZvdW5kIGVycm9yIHNob3VsZCBiZSBoYW5kbGVkIGlkZWFsbHlcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pLFxuXHRcdFx0dGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShhcmdzLnJlc3VsdCksXG5cdFx0XHR0b0lucHV0RGF0YShhcmdzLmlucHV0MSwgdGhpcy5fdGV4dE1vZGVsU2VydmljZSwgc3RvcmUpLFxuXHRcdFx0dG9JbnB1dERhdGEoYXJncy5pbnB1dDIsIHRoaXMuX3RleHRNb2RlbFNlcnZpY2UsIHN0b3JlKSxcblx0XHRdKTtcblxuXHRcdGlmIChiYXNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHRtID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChyZXN1bHQub2JqZWN0LmdldExhbmd1YWdlSWQoKSkpO1xuXHRcdFx0YmFzZSA9IHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB0bS5kaXNwb3NlKCk7IH0sXG5cdFx0XHRcdG9iamVjdDogdG1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0c3RvcmUuYWRkKGJhc2UpO1xuXHRcdHN0b3JlLmFkZChyZXN1bHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0VGV4dEZpbGVNb2RlbCA9IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLm1vZGVscy5maW5kKG0gPT5cblx0XHRcdG0ucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzdWx0Lm9iamVjdC50ZXh0RWRpdG9yTW9kZWwudXJpLnRvU3RyaW5nKClcblx0XHQpO1xuXHRcdGlmICghcmVzdWx0VGV4dEZpbGVNb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpO1xuXHRcdH1cblx0XHQvLyBTbyB0aGF0IFwiRG9uJ3Qgc2F2ZVwiIGRvZXMgcmV2ZXJ0IHRoZSBmaWxlXG5cdFx0YXdhaXQgcmVzdWx0VGV4dEZpbGVNb2RlbC5zYXZlKHsgc291cmNlOiBXb3Jrc3BhY2VNZXJnZUVkaXRvck1vZGVGYWN0b3J5LkZJTEVfU0FWRURfU09VUkNFIH0pO1xuXG5cdFx0Y29uc3QgbGluZXMgPSByZXN1bHRUZXh0RmlsZU1vZGVsLnRleHRFZGl0b3JNb2RlbCEuZ2V0TGluZXNDb250ZW50KCk7XG5cdFx0Y29uc3QgaGFzQ29uZmxpY3RNYXJrZXJzID0gbGluZXMuc29tZShsID0+IGwuc3RhcnRzV2l0aChjb25mbGljdE1hcmtlcnMuc3RhcnQpKTtcblx0XHRjb25zdCByZXNldFJlc3VsdCA9IGhhc0NvbmZsaWN0TWFya2VycztcblxuXHRcdGNvbnN0IG1lcmdlRGlmZkNvbXB1dGVyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVyZ2VEaWZmQ29tcHV0ZXIpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE1lcmdlRWRpdG9yTW9kZWwsXG5cdFx0XHRiYXNlLm9iamVjdCxcblx0XHRcdGlucHV0MURhdGEsXG5cdFx0XHRpbnB1dDJEYXRhLFxuXHRcdFx0cmVzdWx0Lm9iamVjdC50ZXh0RWRpdG9yTW9kZWwsXG5cdFx0XHRtZXJnZURpZmZDb21wdXRlcixcblx0XHRcdHtcblx0XHRcdFx0cmVzZXRSZXN1bHRcblx0XHRcdH0sXG5cdFx0XHR0aGlzLl9tZXJnZUVkaXRvclRlbGVtZXRyeSxcblx0XHQpO1xuXHRcdHN0b3JlLmFkZChtb2RlbCk7XG5cblx0XHRhd2FpdCBtb2RlbC5vbkluaXRpYWxpemVkO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZU1lcmdlRWRpdG9ySW5wdXRNb2RlbCwgbW9kZWwsIHN0b3JlLCByZXN1bHRUZXh0RmlsZU1vZGVsLCB0aGlzLl9tZXJnZUVkaXRvclRlbGVtZXRyeSk7XG5cdH1cbn1cblxuY2xhc3MgV29ya3NwYWNlTWVyZ2VFZGl0b3JJbnB1dE1vZGVsIGV4dGVuZHMgRWRpdG9yTW9kZWwgaW1wbGVtZW50cyBJTWVyZ2VFZGl0b3JJbnB1dE1vZGVsIHtcblx0cHVibGljIHJlYWRvbmx5IGlzRGlydHk7XG5cblx0cHJpdmF0ZSByZXBvcnRlZDtcblx0cHJpdmF0ZSByZWFkb25seSBkYXRlVGltZU9wZW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kZWw6IE1lcmdlRWRpdG9yTW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlc3VsdFRleHRGaWxlTW9kZWw6IElUZXh0RmlsZUVkaXRvck1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5OiBNZXJnZUVkaXRvclRlbGVtZXRyeSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuaXNEaXJ0eSA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdEV2ZW50LmFueSh0aGlzLnJlc3VsdFRleHRGaWxlTW9kZWwub25EaWRDaGFuZ2VEaXJ0eSwgdGhpcy5yZXN1bHRUZXh0RmlsZU1vZGVsLm9uRGlkU2F2ZUVycm9yKSxcblx0XHRcdCgpID0+IC8qKiBAZGVzY3JpcHRpb24gaXNEaXJ0eSAqLyB0aGlzLnJlc3VsdFRleHRGaWxlTW9kZWwuaXNEaXJ0eSgpXG5cdFx0KTtcblx0XHR0aGlzLnJlcG9ydGVkID0gZmFsc2U7XG5cdFx0dGhpcy5kYXRlVGltZU9wZW5lZCA9IG5ldyBEYXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5yZXBvcnRDbG9zZShmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydENsb3NlKGFjY2VwdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnJlcG9ydGVkKSB7XG5cdFx0XHRjb25zdCByZW1haW5pbmdDb25mbGljdENvdW50ID0gdGhpcy5tb2RlbC51bmhhbmRsZWRDb25mbGljdHNDb3VudC5nZXQoKTtcblx0XHRcdGNvbnN0IGR1cmF0aW9uT3BlbmVkTXMgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHRoaXMuZGF0ZVRpbWVPcGVuZWQuZ2V0VGltZSgpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnkucmVwb3J0TWVyZ2VFZGl0b3JDbG9zZWQoe1xuXHRcdFx0XHRkdXJhdGlvbk9wZW5lZFNlY3M6IGR1cmF0aW9uT3BlbmVkTXMgLyAxMDAwLFxuXHRcdFx0XHRyZW1haW5pbmdDb25mbGljdENvdW50LFxuXHRcdFx0XHRhY2NlcHRlZCxcblxuXHRcdFx0XHRjb25mbGljdENvdW50OiB0aGlzLm1vZGVsLmNvbmZsaWN0Q291bnQsXG5cdFx0XHRcdGNvbWJpbmFibGVDb25mbGljdENvdW50OiB0aGlzLm1vZGVsLmNvbWJpbmFibGVDb25mbGljdENvdW50LFxuXG5cdFx0XHRcdGNvbmZsaWN0c1Jlc29sdmVkV2l0aEJhc2U6IHRoaXMubW9kZWwuY29uZmxpY3RzUmVzb2x2ZWRXaXRoQmFzZSxcblx0XHRcdFx0Y29uZmxpY3RzUmVzb2x2ZWRXaXRoSW5wdXQxOiB0aGlzLm1vZGVsLmNvbmZsaWN0c1Jlc29sdmVkV2l0aElucHV0MSxcblx0XHRcdFx0Y29uZmxpY3RzUmVzb2x2ZWRXaXRoSW5wdXQyOiB0aGlzLm1vZGVsLmNvbmZsaWN0c1Jlc29sdmVkV2l0aElucHV0Mixcblx0XHRcdFx0Y29uZmxpY3RzUmVzb2x2ZWRXaXRoU21hcnRDb21iaW5hdGlvbjogdGhpcy5tb2RlbC5jb25mbGljdHNSZXNvbHZlZFdpdGhTbWFydENvbWJpbmF0aW9uLFxuXG5cdFx0XHRcdG1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbE5vbmU6IHRoaXMubW9kZWwubWFudWFsbHlTb2x2ZWRDb25mbGljdENvdW50VGhhdEVxdWFsTm9uZSxcblx0XHRcdFx0bWFudWFsbHlTb2x2ZWRDb25mbGljdENvdW50VGhhdEVxdWFsU21hcnRDb21iaW5lOiB0aGlzLm1vZGVsLm1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbFNtYXJ0Q29tYmluZSxcblx0XHRcdFx0bWFudWFsbHlTb2x2ZWRDb25mbGljdENvdW50VGhhdEVxdWFsSW5wdXQxOiB0aGlzLm1vZGVsLm1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbElucHV0MSxcblx0XHRcdFx0bWFudWFsbHlTb2x2ZWRDb25mbGljdENvdW50VGhhdEVxdWFsSW5wdXQyOiB0aGlzLm1vZGVsLm1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbElucHV0MixcblxuXHRcdFx0XHRtYW51YWxseVNvbHZlZENvbmZsaWN0Q291bnRUaGF0RXF1YWxOb25lQW5kU3RhcnRlZFdpdGhCYXNlOiB0aGlzLm1vZGVsLm1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbE5vbmVBbmRTdGFydGVkV2l0aEJhc2UsXG5cdFx0XHRcdG1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbE5vbmVBbmRTdGFydGVkV2l0aElucHV0MTogdGhpcy5tb2RlbC5tYW51YWxseVNvbHZlZENvbmZsaWN0Q291bnRUaGF0RXF1YWxOb25lQW5kU3RhcnRlZFdpdGhJbnB1dDEsXG5cdFx0XHRcdG1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbE5vbmVBbmRTdGFydGVkV2l0aElucHV0MjogdGhpcy5tb2RlbC5tYW51YWxseVNvbHZlZENvbmZsaWN0Q291bnRUaGF0RXF1YWxOb25lQW5kU3RhcnRlZFdpdGhJbnB1dDIsXG5cdFx0XHRcdG1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbE5vbmVBbmRTdGFydGVkV2l0aEJvdGhOb25TbWFydDogdGhpcy5tb2RlbC5tYW51YWxseVNvbHZlZENvbmZsaWN0Q291bnRUaGF0RXF1YWxOb25lQW5kU3RhcnRlZFdpdGhCb3RoTm9uU21hcnQsXG5cdFx0XHRcdG1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbE5vbmVBbmRTdGFydGVkV2l0aEJvdGhTbWFydDogdGhpcy5tb2RlbC5tYW51YWxseVNvbHZlZENvbmZsaWN0Q291bnRUaGF0RXF1YWxOb25lQW5kU3RhcnRlZFdpdGhCb3RoU21hcnQsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMucmVwb3J0ZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBhY2NlcHQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5yZXBvcnRDbG9zZSh0cnVlKTtcblx0XHRhd2FpdCB0aGlzLnJlc3VsdFRleHRGaWxlTW9kZWwuc2F2ZSgpO1xuXHR9XG5cblx0Z2V0IHJlc3VsdFVyaSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLnJlc3VsdFRleHRGaWxlTW9kZWwucmVzb3VyY2U7XG5cdH1cblxuXHRhc3luYyBzYXZlKG9wdGlvbnM/OiBJVGV4dEZpbGVTYXZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucmVzdWx0VGV4dEZpbGVNb2RlbC5zYXZlKG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIElmIHNhdmUgcmVzZXRzIHRoZSBkaXJ0eSBzdGF0ZSwgcmV2ZXJ0IG11c3QgZG8gc28gdG9vLlxuXHQqL1xuXHRhc3luYyByZXZlcnQob3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5yZXN1bHRUZXh0RmlsZU1vZGVsLnJldmVydChvcHRpb25zKTtcblx0fVxuXG5cdHNob3VsZENvbmZpcm1DbG9zZSgpOiBib29sZWFuIHtcblx0XHQvLyBBbHdheXMgY29uZmlybVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgY29uZmlybUNsb3NlKGlucHV0TW9kZWxzOiBJTWVyZ2VFZGl0b3JJbnB1dE1vZGVsW10pOiBQcm9taXNlPENvbmZpcm1SZXN1bHQ+IHtcblx0XHRjb25zdCBpc01hbnkgPSBpbnB1dE1vZGVscy5sZW5ndGggPiAxO1xuXHRcdGNvbnN0IHNvbWVEaXJ0eSA9IGlucHV0TW9kZWxzLnNvbWUobSA9PiBtLmlzRGlydHkuZ2V0KCkpO1xuXHRcdGNvbnN0IHNvbWVVbmhhbmRsZWRDb25mbGljdHMgPSBpbnB1dE1vZGVscy5zb21lKG0gPT4gbS5tb2RlbC5oYXNVbmhhbmRsZWRDb25mbGljdHMuZ2V0KCkpO1xuXHRcdGlmIChzb21lRGlydHkpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBpc01hbnlcblx0XHRcdFx0PyBsb2NhbGl6ZSgnd29ya3NwYWNlLm1lc3NhZ2VOJywgJ0RvIHlvdSB3YW50IHRvIHNhdmUgdGhlIGNoYW5nZXMgeW91IG1hZGUgdG8gezB9IGZpbGVzPycsIGlucHV0TW9kZWxzLmxlbmd0aClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnd29ya3NwYWNlLm1lc3NhZ2UxJywgJ0RvIHlvdSB3YW50IHRvIHNhdmUgdGhlIGNoYW5nZXMgeW91IG1hZGUgdG8gezB9PycsIGJhc2VuYW1lKGlucHV0TW9kZWxzWzBdLnJlc3VsdFVyaSkpO1xuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UucHJvbXB0PENvbmZpcm1SZXN1bHQ+KHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0ZGV0YWlsOlxuXHRcdFx0XHRcdHNvbWVVbmhhbmRsZWRDb25mbGljdHMgP1xuXHRcdFx0XHRcdFx0aXNNYW55XG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3dvcmtzcGFjZS5kZXRhaWxOLnVuaGFuZGxlZCcsIFwiVGhlIGZpbGVzIGNvbnRhaW4gdW5oYW5kbGVkIGNvbmZsaWN0cy4gWW91ciBjaGFuZ2VzIHdpbGwgYmUgbG9zdCBpZiB5b3UgZG9uJ3Qgc2F2ZSB0aGVtLlwiKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCd3b3Jrc3BhY2UuZGV0YWlsMS51bmhhbmRsZWQnLCBcIlRoZSBmaWxlIGNvbnRhaW5zIHVuaGFuZGxlZCBjb25mbGljdHMuIFlvdXIgY2hhbmdlcyB3aWxsIGJlIGxvc3QgaWYgeW91IGRvbid0IHNhdmUgdGhlbS5cIilcblx0XHRcdFx0XHRcdDogaXNNYW55XG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3dvcmtzcGFjZS5kZXRhaWxOLmhhbmRsZWQnLCBcIllvdXIgY2hhbmdlcyB3aWxsIGJlIGxvc3QgaWYgeW91IGRvbid0IHNhdmUgdGhlbS5cIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnd29ya3NwYWNlLmRldGFpbDEuaGFuZGxlZCcsIFwiWW91ciBjaGFuZ2VzIHdpbGwgYmUgbG9zdCBpZiB5b3UgZG9uJ3Qgc2F2ZSB0aGVtLlwiKSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBzb21lVW5oYW5kbGVkQ29uZmxpY3RzXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoeyBrZXk6ICd3b3Jrc3BhY2Uuc2F2ZVdpdGhDb25mbGljdCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgJyYmU2F2ZSB3aXRoIENvbmZsaWN0cycpXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoeyBrZXk6ICd3b3Jrc3BhY2Uuc2F2ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgJyYmU2F2ZScpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBDb25maXJtUmVzdWx0LlNBVkVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ3dvcmtzcGFjZS5kb05vdFNhdmUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiRG8mJm4ndCBTYXZlXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBDb25maXJtUmVzdWx0LkRPTlRfU0FWRVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBDb25maXJtUmVzdWx0LkNBTkNFTFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cblx0XHR9IGVsc2UgaWYgKHNvbWVVbmhhbmRsZWRDb25mbGljdHMgJiYgIXRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oU3RvcmFnZUNsb3NlV2l0aENvbmZsaWN0cywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGZhbHNlKSkge1xuXHRcdFx0Y29uc3QgeyBjb25maXJtZWQsIGNoZWNrYm94Q2hlY2tlZCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogaXNNYW55XG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnd29ya3NwYWNlLm1lc3NhZ2VOLm5vbkRpcnR5JywgJ0RvIHlvdSB3YW50IHRvIGNsb3NlIHswfSBtZXJnZSBlZGl0b3JzPycsIGlucHV0TW9kZWxzLmxlbmd0aClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCd3b3Jrc3BhY2UubWVzc2FnZTEubm9uRGlydHknLCAnRG8geW91IHdhbnQgdG8gY2xvc2UgdGhlIG1lcmdlIGVkaXRvciBmb3IgezB9PycsIGJhc2VuYW1lKGlucHV0TW9kZWxzWzBdLnJlc3VsdFVyaSkpLFxuXHRcdFx0XHRkZXRhaWw6IHNvbWVVbmhhbmRsZWRDb25mbGljdHMgP1xuXHRcdFx0XHRcdGlzTWFueVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnd29ya3NwYWNlLmRldGFpbE4udW5oYW5kbGVkLm5vbkRpcnR5JywgXCJUaGUgZmlsZXMgY29udGFpbiB1bmhhbmRsZWQgY29uZmxpY3RzLlwiKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnd29ya3NwYWNlLmRldGFpbDEudW5oYW5kbGVkLm5vbkRpcnR5JywgXCJUaGUgZmlsZSBjb250YWlucyB1bmhhbmRsZWQgY29uZmxpY3RzLlwiKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBzb21lVW5oYW5kbGVkQ29uZmxpY3RzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSh7IGtleTogJ3dvcmtzcGFjZS5jbG9zZVdpdGhDb25mbGljdHMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sICcmJkNsb3NlIHdpdGggQ29uZmxpY3RzJylcblx0XHRcdFx0XHQ6IGxvY2FsaXplKHsga2V5OiAnd29ya3NwYWNlLmNsb3NlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCAnJiZDbG9zZScpLFxuXHRcdFx0XHRjaGVja2JveDogeyBsYWJlbDogbG9jYWxpemUoJ25vTW9yZVdhcm4nLCBcIkRvIG5vdCBhc2sgbWUgYWdhaW5cIikgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChjaGVja2JveENoZWNrZWQpIHtcblx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU3RvcmFnZUNsb3NlV2l0aENvbmZsaWN0cywgdHJ1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjb25maXJtZWQgPyBDb25maXJtUmVzdWx0LlNBVkUgOiBDb25maXJtUmVzdWx0LkNBTkNFTDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVGhpcyBzaG91bGRuJ3QgZG8gYW55dGhpbmdcblx0XHRcdHJldHVybiBDb25maXJtUmVzdWx0LlNBVkU7XG5cdFx0fVxuXHR9XG59XG5cbi8qID09PT09PT09PT09PT09PT09IFV0aWxzID09PT09PT09PT09PT09PT09PSAqL1xuXG5hc3luYyBmdW5jdGlvbiB0b0lucHV0RGF0YShkYXRhOiBNZXJnZUVkaXRvcklucHV0RGF0YSwgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPElucHV0RGF0YT4ge1xuXHRjb25zdCByZWYgPSBhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGRhdGEudXJpKTtcblx0c3RvcmUuYWRkKHJlZik7XG5cdHJldHVybiB7XG5cdFx0dGV4dE1vZGVsOiByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbCxcblx0XHR0aXRsZTogZGF0YS50aXRsZSxcblx0XHRkZXNjcmlwdGlvbjogZGF0YS5kZXNjcmlwdGlvbixcblx0XHRkZXRhaWw6IGRhdGEuZGV0YWlsLFxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQix5QkFBeUI7QUFDdEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQWdEO0FBQ3pELFNBQVMsU0FBc0IscUJBQXFCLHVCQUF1QjtBQUMzRSxTQUFTLGdCQUFnQjtBQUN6QixPQUFPLGNBQWM7QUFFckIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBbUMseUJBQXlCO0FBQzVELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZSxzQkFBcUM7QUFDN0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBeUIsMEJBQTBCO0FBQ25ELFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQW9CLHdCQUF3QjtBQUU1QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFxRCx3QkFBd0I7QUFFN0UsU0FBUyx3QkFBd0I7QUFzQzFCLElBQU0saUNBQU4sTUFBOEU7QUFBQSxFQUNwRixZQUNrQix1QkFDdUIsdUJBQ0osbUJBQ0osZUFDL0I7QUFKZ0I7QUFDdUI7QUFDSjtBQUNKO0FBQUEsRUFFakM7QUFBQSxFQUVBLE1BQU0saUJBQWlCLE1BQXdEO0FBQzlFLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUVsQyxVQUFNO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLE1BQ3JCLEtBQUssa0JBQWtCLHFCQUFxQixLQUFLLElBQUk7QUFBQSxNQUNyRCxLQUFLLGtCQUFrQixxQkFBcUIsS0FBSyxNQUFNO0FBQUEsTUFDdkQsWUFBWSxLQUFLLFFBQVEsS0FBSyxtQkFBbUIsS0FBSztBQUFBLE1BQ3RELFlBQVksS0FBSyxRQUFRLEtBQUssbUJBQW1CLEtBQUs7QUFBQSxJQUN2RCxDQUFDO0FBRUQsVUFBTSxJQUFJLElBQUk7QUFDZCxVQUFNLElBQUksTUFBTTtBQUVoQixVQUFNLGdCQUFnQixPQUFPLE9BQU8sZ0JBQWdCLElBQUksS0FBSyxFQUFFLFFBQVEsZUFBZSxDQUFDO0FBRXZGLFVBQU0sdUJBQXVCLEtBQUssY0FBYztBQUFBLE1BQy9DO0FBQUEsTUFDQTtBQUFBLFFBQ0MsWUFBWSxPQUFPLE9BQU8sZ0JBQWdCLGNBQWM7QUFBQSxRQUN4RCxhQUFhLE1BQU07QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxJQUFJLG9CQUFvQjtBQUU5QixVQUFNLG9CQUFvQixLQUFLLHNCQUFzQixlQUFlLGlCQUFpQjtBQUNyRixVQUFNLFFBQVEsS0FBSyxzQkFBc0I7QUFBQSxNQUN4QztBQUFBLE1BQ0EsS0FBSyxPQUFPO0FBQUEsTUFDWjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxRQUNDLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxLQUFLO0FBQUEsSUFDTjtBQUNBLFVBQU0sSUFBSSxLQUFLO0FBRWYsVUFBTSxNQUFNO0FBRVosV0FBTyxLQUFLLHNCQUFzQixlQUFlLCtCQUErQixPQUFPLE9BQU8sT0FBTyxRQUFRLEtBQUssTUFBTTtBQUFBLEVBQ3pIO0FBQ0Q7QUExRGEsaUNBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxVO0FBNERiLElBQU0sZ0NBQU4sY0FBNEMsWUFBOEM7QUFBQSxFQVF6RixZQUNpQixPQUNDLFlBQ0EsUUFDRCxXQUNtQixpQkFDRixlQUNBLGVBQ2hDO0FBQ0QsVUFBTTtBQVJVO0FBQ0M7QUFDQTtBQUNEO0FBQ21CO0FBQ0Y7QUFDQTtBQUdqQyxTQUFLLG9CQUFvQixnQkFBZ0IsTUFBTSxLQUFLLE1BQU0sZ0JBQWdCLHdCQUF3QixDQUFDO0FBQ25HLFNBQUssZUFBZTtBQUFBLE1BQW9CO0FBQUEsTUFDdkMsT0FBSyxLQUFLLE1BQU0sZ0JBQWdCLG1CQUFtQixDQUFDO0FBQUEsTUFDcEQ7QUFBQTtBQUFBLFFBQWtELEtBQUssTUFBTSxnQkFBZ0Isd0JBQXdCO0FBQUE7QUFBQSxJQUN0RztBQUNBLFNBQUssVUFBVSxRQUFRLE1BQU0sQ0FBQyxXQUFXLEtBQUssYUFBYSxLQUFLLE1BQU0sTUFBTSxLQUFLLGtCQUFrQixLQUFLLE1BQU0sQ0FBQztBQUMvRyxTQUFLLFdBQVc7QUFBQSxFQUNqQjtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyxXQUFXLFFBQVE7QUFDeEIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRUEsTUFBTSxTQUF3QjtBQUM3QixVQUFNLFFBQVEsTUFBTSxLQUFLLE1BQU0sZ0JBQWdCLFNBQVM7QUFDeEQsU0FBSyxPQUFPLGdCQUFnQixTQUFTLEtBQUs7QUFDMUMsU0FBSyxrQkFBa0IsSUFBSSxLQUFLLE1BQU0sZ0JBQWdCLHdCQUF3QixHQUFHLE1BQVM7QUFDMUYsVUFBTSxLQUFLLGdCQUFnQixLQUFLLEtBQUssT0FBTyxnQkFBZ0IsR0FBRztBQUMvRCxTQUFLLFdBQVc7QUFBQSxFQUNqQjtBQUFBLEVBRUEsTUFBYyxXQUEwQjtBQUN2QyxVQUFNLEtBQUssZ0JBQWdCLE9BQU8sS0FBSyxNQUFNLGdCQUFnQixHQUFHO0FBQ2hFLFNBQUssa0JBQWtCLElBQUksS0FBSyxNQUFNLGdCQUFnQix3QkFBd0IsR0FBRyxNQUFTO0FBQzFGLFNBQUssV0FBVztBQUFBLEVBQ2pCO0FBQUEsRUFFTyxxQkFBOEI7QUFDcEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWEsYUFBYSxhQUFzRTtBQUMvRjtBQUFBLE1BQ0MsTUFBTSxZQUFZLEtBQUssQ0FBQyxNQUFNLE1BQU0sSUFBSTtBQUFBLElBQ3pDO0FBRUEsVUFBTSxZQUFZLFlBQVksS0FBSyxDQUFDLE1BQU0sRUFBRSxRQUFRLElBQUksQ0FBQztBQUN6RCxRQUFJO0FBQ0osUUFBSSxXQUFXO0FBQ2QsWUFBTSxTQUFTLFlBQVksU0FBUztBQUVwQyxZQUFNLFVBQVUsU0FDYixTQUFTLFlBQVksbURBQW1ELFlBQVksTUFBTSxJQUMxRixTQUFTLFlBQVksNkNBQTZDLFNBQVMsWUFBWSxDQUFDLEVBQUUsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDO0FBRXZILFlBQU0sd0JBQXdCLFlBQVksS0FBSyxDQUFDLE1BQU0sRUFBRSxNQUFNLHNCQUFzQixJQUFJLENBQUM7QUFFekYsWUFBTSxVQUEwQztBQUFBLFFBQy9DO0FBQUEsVUFDQyxPQUFPLHdCQUNOLFNBQVMsRUFBRSxLQUFLLG9CQUFvQixTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyx1QkFBdUIsSUFDakcsU0FBUyxFQUFFLEtBQUssUUFBUSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxRQUFRO0FBQUEsVUFDdkUsS0FBSyxNQUFNLGNBQWM7QUFBQSxRQUMxQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLE9BQU8sU0FBUyxFQUFFLEtBQUssV0FBVyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxjQUFjO0FBQUEsVUFDdEYsS0FBSyxNQUFNLGNBQWM7QUFBQSxRQUMxQjtBQUFBLE1BQ0Q7QUFFQSxnQkFBVSxNQUFNLEtBQUssY0FBYyxPQUFzQjtBQUFBLFFBQ3hELE1BQU0sU0FBUztBQUFBLFFBQ2Y7QUFBQSxRQUNBLFFBQ0Msd0JBQ0csU0FDQyxTQUFTLG9CQUFvQiwrRkFBK0YsSUFDNUgsU0FBUyxvQkFBb0IsNEZBQTRGLElBQzFILFNBQ0MsU0FBUyxXQUFXLHdEQUF3RCxJQUM1RSxTQUFTLFdBQVcscURBQXFEO0FBQUEsUUFDOUU7QUFBQSxRQUNBLGNBQWM7QUFBQSxVQUNiLEtBQUssTUFBTSxjQUFjO0FBQUEsUUFDMUI7QUFBQSxNQUNELENBQUMsR0FBRztBQUFBLElBQ0wsT0FBTztBQUNOLGVBQVMsY0FBYztBQUFBLElBQ3hCO0FBRUEsUUFBSSxXQUFXLGNBQWMsTUFBTTtBQUVsQyxZQUFNLFFBQVEsSUFBSSxZQUFZLElBQUksT0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDbkQsV0FBVyxXQUFXLGNBQWMsV0FBVztBQUU5QyxZQUFNLFFBQVEsSUFBSSxZQUFZLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDckQsT0FBTztBQUFBLElBRVA7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYSxLQUFLLFNBQStDO0FBQ2hFLFFBQUksS0FBSyxVQUFVO0FBQ2xCO0FBQUEsSUFDRDtBQUlBLEtBQUMsWUFBWTtBQUNaLFlBQU0sRUFBRSxVQUFVLElBQUksTUFBTSxLQUFLLGNBQWMsUUFBUTtBQUFBLFFBQ3RELFNBQVM7QUFBQSxVQUNSO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBLFFBQVE7QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBLGVBQWUsU0FBUyxFQUFFLEtBQUssZUFBZSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxnQkFBZ0I7QUFBQSxNQUNyRyxDQUFDO0FBRUQsVUFBSSxXQUFXO0FBQ2QsY0FBTSxLQUFLLE9BQU87QUFDbEIsY0FBTSxVQUFVLEtBQUssY0FBYyxZQUFZLEtBQUssU0FBUyxFQUFFLE9BQU8sT0FBSyxFQUFFLE9BQU8sV0FBVyxtQkFBbUI7QUFDbEgsY0FBTSxLQUFLLGNBQWMsYUFBYSxPQUFPO0FBQUEsTUFDOUM7QUFBQSxJQUNELEdBQUc7QUFBQSxFQUNKO0FBQUEsRUFFQSxNQUFhLE9BQU8sU0FBeUM7QUFBQSxFQUU3RDtBQUNEO0FBOUlNLGdDQUFOO0FBQUEsRUFhRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FmRztBQWtKQyxJQUFNLGtDQUFOLE1BQStFO0FBQUEsRUFDckYsWUFDa0IsdUJBQ3VCLHVCQUNKLG1CQUNELGlCQUNILGVBQ0csa0JBQ2xDO0FBTmdCO0FBQ3VCO0FBQ0o7QUFDRDtBQUNIO0FBQ0c7QUFBQSxFQUVwQztBQUFBLEVBSUEsTUFBYSxpQkFBaUIsTUFBd0Q7QUFDckYsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBRWxDLFFBQUk7QUFBQSxNQUNIO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDckIsS0FBSyxrQkFBa0IscUJBQXFCLEtBQUssSUFBSSxFQUFFLEtBQTZCLFFBQU07QUFBQSxRQUN6RixRQUFRLEVBQUUsT0FBTztBQUFBLFFBQ2pCLFNBQVMsTUFBTSxFQUFFLFFBQVE7QUFBQSxNQUMxQixFQUFFLEVBQUUsTUFBTSxPQUFLO0FBQ2QsMEJBQWtCLENBQUM7QUFDbkIsZ0JBQVEsTUFBTSxDQUFDO0FBQ2YsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLE1BQ0QsS0FBSyxrQkFBa0IscUJBQXFCLEtBQUssTUFBTTtBQUFBLE1BQ3ZELFlBQVksS0FBSyxRQUFRLEtBQUssbUJBQW1CLEtBQUs7QUFBQSxNQUN0RCxZQUFZLEtBQUssUUFBUSxLQUFLLG1CQUFtQixLQUFLO0FBQUEsSUFDdkQsQ0FBQztBQUVELFFBQUksU0FBUyxRQUFXO0FBQ3ZCLFlBQU0sS0FBSyxLQUFLLGNBQWMsWUFBWSxJQUFJLEtBQUssaUJBQWlCLFdBQVcsT0FBTyxPQUFPLGNBQWMsQ0FBQyxDQUFDO0FBQzdHLGFBQU87QUFBQSxRQUNOLFNBQVMsTUFBTTtBQUFFLGFBQUcsUUFBUTtBQUFBLFFBQUc7QUFBQSxRQUMvQixRQUFRO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFFQSxVQUFNLElBQUksSUFBSTtBQUNkLFVBQU0sSUFBSSxNQUFNO0FBRWhCLFVBQU0sc0JBQXNCLEtBQUssZ0JBQWdCLE1BQU0sT0FBTztBQUFBLE1BQUssT0FDbEUsRUFBRSxTQUFTLFNBQVMsTUFBTSxPQUFPLE9BQU8sZ0JBQWdCLElBQUksU0FBUztBQUFBLElBQ3RFO0FBQ0EsUUFBSSxDQUFDLHFCQUFxQjtBQUN6QixZQUFNLElBQUksbUJBQW1CO0FBQUEsSUFDOUI7QUFFQSxVQUFNLG9CQUFvQixLQUFLLEVBQUUsUUFBUSxnQ0FBZ0Msa0JBQWtCLENBQUM7QUFFNUYsVUFBTSxRQUFRLG9CQUFvQixnQkFBaUIsZ0JBQWdCO0FBQ25FLFVBQU0scUJBQXFCLE1BQU0sS0FBSyxPQUFLLEVBQUUsV0FBVyxnQkFBZ0IsS0FBSyxDQUFDO0FBQzlFLFVBQU0sY0FBYztBQUVwQixVQUFNLG9CQUFvQixLQUFLLHNCQUFzQixlQUFlLGlCQUFpQjtBQUVyRixVQUFNLFFBQVEsS0FBSyxzQkFBc0I7QUFBQSxNQUN4QztBQUFBLE1BQ0EsS0FBSztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsTUFDQSxPQUFPLE9BQU87QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLO0FBQUEsSUFDTjtBQUNBLFVBQU0sSUFBSSxLQUFLO0FBRWYsVUFBTSxNQUFNO0FBRVosV0FBTyxLQUFLLHNCQUFzQixlQUFlLGdDQUFnQyxPQUFPLE9BQU8scUJBQXFCLEtBQUsscUJBQXFCO0FBQUEsRUFDL0k7QUFDRDtBQS9FYSxnQ0FXWSxvQkFBb0IsbUJBQW1CLGVBQWUsdUJBQXVCLFNBQVMsdUJBQXVCLDRDQUE0QyxDQUFDO0FBWHRLLGtDQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVO0FBaUZiLElBQU0saUNBQU4sY0FBNkMsWUFBOEM7QUFBQSxFQU0xRixZQUNpQixPQUNDLGlCQUNBLHFCQUNBLFdBQ2dCLGdCQUNDLGlCQUNqQztBQUNELFVBQU07QUFQVTtBQUNDO0FBQ0E7QUFDQTtBQUNnQjtBQUNDO0FBR2xDLFNBQUssVUFBVTtBQUFBLE1BQW9CO0FBQUEsTUFDbEMsTUFBTSxJQUFJLEtBQUssb0JBQW9CLGtCQUFrQixLQUFLLG9CQUFvQixjQUFjO0FBQUEsTUFDNUY7QUFBQTtBQUFBLFFBQWtDLEtBQUssb0JBQW9CLFFBQVE7QUFBQTtBQUFBLElBQ3BFO0FBQ0EsU0FBSyxXQUFXO0FBQ2hCLFNBQUssaUJBQWlCLG9CQUFJLEtBQUs7QUFBQSxFQUNoQztBQUFBLEVBRWdCLFVBQWdCO0FBQy9CLFNBQUssZ0JBQWdCLFFBQVE7QUFDN0IsVUFBTSxRQUFRO0FBRWQsU0FBSyxZQUFZLEtBQUs7QUFBQSxFQUN2QjtBQUFBLEVBRVEsWUFBWSxVQUF5QjtBQUM1QyxRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CLFlBQU0seUJBQXlCLEtBQUssTUFBTSx3QkFBd0IsSUFBSTtBQUN0RSxZQUFNLG9CQUFtQixvQkFBSSxLQUFLLEdBQUUsUUFBUSxJQUFJLEtBQUssZUFBZSxRQUFRO0FBQzVFLFdBQUssVUFBVSx3QkFBd0I7QUFBQSxRQUN0QyxvQkFBb0IsbUJBQW1CO0FBQUEsUUFDdkM7QUFBQSxRQUNBO0FBQUEsUUFFQSxlQUFlLEtBQUssTUFBTTtBQUFBLFFBQzFCLHlCQUF5QixLQUFLLE1BQU07QUFBQSxRQUVwQywyQkFBMkIsS0FBSyxNQUFNO0FBQUEsUUFDdEMsNkJBQTZCLEtBQUssTUFBTTtBQUFBLFFBQ3hDLDZCQUE2QixLQUFLLE1BQU07QUFBQSxRQUN4Qyx1Q0FBdUMsS0FBSyxNQUFNO0FBQUEsUUFFbEQsMENBQTBDLEtBQUssTUFBTTtBQUFBLFFBQ3JELGtEQUFrRCxLQUFLLE1BQU07QUFBQSxRQUM3RCw0Q0FBNEMsS0FBSyxNQUFNO0FBQUEsUUFDdkQsNENBQTRDLEtBQUssTUFBTTtBQUFBLFFBRXZELDREQUE0RCxLQUFLLE1BQU07QUFBQSxRQUN2RSw4REFBOEQsS0FBSyxNQUFNO0FBQUEsUUFDekUsOERBQThELEtBQUssTUFBTTtBQUFBLFFBQ3pFLG9FQUFvRSxLQUFLLE1BQU07QUFBQSxRQUMvRSxpRUFBaUUsS0FBSyxNQUFNO0FBQUEsTUFDN0UsQ0FBQztBQUNELFdBQUssV0FBVztBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYSxTQUF3QjtBQUNwQyxTQUFLLFlBQVksSUFBSTtBQUNyQixVQUFNLEtBQUssb0JBQW9CLEtBQUs7QUFBQSxFQUNyQztBQUFBLEVBRUEsSUFBSSxZQUFpQjtBQUNwQixXQUFPLEtBQUssb0JBQW9CO0FBQUEsRUFDakM7QUFBQSxFQUVBLE1BQU0sS0FBSyxTQUErQztBQUN6RCxVQUFNLEtBQUssb0JBQW9CLEtBQUssT0FBTztBQUFBLEVBQzVDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxNQUFNLE9BQU8sU0FBeUM7QUFDckQsVUFBTSxLQUFLLG9CQUFvQixPQUFPLE9BQU87QUFBQSxFQUM5QztBQUFBLEVBRUEscUJBQThCO0FBRTdCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLGFBQWEsYUFBK0Q7QUFDakYsVUFBTSxTQUFTLFlBQVksU0FBUztBQUNwQyxVQUFNLFlBQVksWUFBWSxLQUFLLE9BQUssRUFBRSxRQUFRLElBQUksQ0FBQztBQUN2RCxVQUFNLHlCQUF5QixZQUFZLEtBQUssT0FBSyxFQUFFLE1BQU0sc0JBQXNCLElBQUksQ0FBQztBQUN4RixRQUFJLFdBQVc7QUFDZCxZQUFNLFVBQVUsU0FDYixTQUFTLHNCQUFzQiwwREFBMEQsWUFBWSxNQUFNLElBQzNHLFNBQVMsc0JBQXNCLG9EQUFvRCxTQUFTLFlBQVksQ0FBQyxFQUFFLFNBQVMsQ0FBQztBQUN4SCxZQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sS0FBSyxlQUFlLE9BQXNCO0FBQUEsUUFDbEUsTUFBTSxTQUFTO0FBQUEsUUFDZjtBQUFBLFFBQ0EsUUFDQyx5QkFDQyxTQUNHLFNBQVMsK0JBQStCLDBGQUEwRixJQUNsSSxTQUFTLCtCQUErQiwwRkFBMEYsSUFDbkksU0FDQyxTQUFTLDZCQUE2QixtREFBbUQsSUFDekYsU0FBUyw2QkFBNkIsbURBQW1EO0FBQUEsUUFDOUYsU0FBUztBQUFBLFVBQ1I7QUFBQSxZQUNDLE9BQU8seUJBQ0osU0FBUyxFQUFFLEtBQUssOEJBQThCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLHVCQUF1QixJQUMzRyxTQUFTLEVBQUUsS0FBSyxrQkFBa0IsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsUUFBUTtBQUFBLFlBQ25GLEtBQUssTUFBTSxjQUFjO0FBQUEsVUFDMUI7QUFBQSxVQUNBO0FBQUEsWUFDQyxPQUFPLFNBQVMsRUFBRSxLQUFLLHVCQUF1QixTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxjQUFjO0FBQUEsWUFDbEcsS0FBSyxNQUFNLGNBQWM7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBLGNBQWM7QUFBQSxVQUNiLEtBQUssTUFBTSxjQUFjO0FBQUEsUUFDMUI7QUFBQSxNQUNELENBQUM7QUFDRCxhQUFPO0FBQUEsSUFFUixXQUFXLDBCQUEwQixDQUFDLEtBQUssZ0JBQWdCLFdBQVcsMkJBQTJCLGFBQWEsU0FBUyxLQUFLLEdBQUc7QUFDOUgsWUFBTSxFQUFFLFdBQVcsZ0JBQWdCLElBQUksTUFBTSxLQUFLLGVBQWUsUUFBUTtBQUFBLFFBQ3hFLFNBQVMsU0FDTixTQUFTLCtCQUErQiwyQ0FBMkMsWUFBWSxNQUFNLElBQ3JHLFNBQVMsK0JBQStCLGtEQUFrRCxTQUFTLFlBQVksQ0FBQyxFQUFFLFNBQVMsQ0FBQztBQUFBLFFBQy9ILFFBQVEseUJBQ1AsU0FDRyxTQUFTLHdDQUF3Qyx3Q0FBd0MsSUFDekYsU0FBUyx3Q0FBd0Msd0NBQXdDLElBQzFGO0FBQUEsUUFDSCxlQUFlLHlCQUNaLFNBQVMsRUFBRSxLQUFLLGdDQUFnQyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyx3QkFBd0IsSUFDOUcsU0FBUyxFQUFFLEtBQUssbUJBQW1CLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLFNBQVM7QUFBQSxRQUNyRixVQUFVLEVBQUUsT0FBTyxTQUFTLGNBQWMscUJBQXFCLEVBQUU7QUFBQSxNQUNsRSxDQUFDO0FBRUQsVUFBSSxpQkFBaUI7QUFDcEIsYUFBSyxnQkFBZ0IsTUFBTSwyQkFBMkIsTUFBTSxhQUFhLFNBQVMsY0FBYyxJQUFJO0FBQUEsTUFDckc7QUFFQSxhQUFPLFlBQVksY0FBYyxPQUFPLGNBQWM7QUFBQSxJQUN2RCxPQUFPO0FBRU4sYUFBTyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQ0Q7QUF0Sk0saUNBQU47QUFBQSxFQVdHO0FBQUEsRUFDQTtBQUFBLEdBWkc7QUEwSk4sZUFBZSxZQUFZLE1BQTRCLGtCQUFxQyxPQUE0QztBQUN2SSxRQUFNLE1BQU0sTUFBTSxpQkFBaUIscUJBQXFCLEtBQUssR0FBRztBQUNoRSxRQUFNLElBQUksR0FBRztBQUNiLFNBQU87QUFBQSxJQUNOLFdBQVcsSUFBSSxPQUFPO0FBQUEsSUFDdEIsT0FBTyxLQUFLO0FBQUEsSUFDWixhQUFhLEtBQUs7QUFBQSxJQUNsQixRQUFRLEtBQUs7QUFBQSxFQUNkO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
