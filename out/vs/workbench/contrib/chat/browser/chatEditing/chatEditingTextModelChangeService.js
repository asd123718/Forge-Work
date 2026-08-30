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
import { addDisposableListener, getWindow } from "../../../../../base/browser/dom.js";
import { assert } from "../../../../../base/common/assert.js";
import { DeferredPromise, RunOnceScheduler, timeout } from "../../../../../base/common/async.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { themeColorFromId } from "../../../../../base/common/themables.js";
import { assertType } from "../../../../../base/common/types.js";
import { EditOperation } from "../../../../../editor/common/core/editOperation.js";
import { StringEdit } from "../../../../../editor/common/core/edits/stringEdit.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { LineRange } from "../../../../../editor/common/core/ranges/lineRange.js";
import { nullDocumentDiff } from "../../../../../editor/common/diff/documentDiffProvider.js";
import { TextEdit, VersionedExtensionId } from "../../../../../editor/common/languages.js";
import { MinimapPosition, OverviewRulerLane } from "../../../../../editor/common/model.js";
import { ModelDecorationOptions } from "../../../../../editor/common/model/textModel.js";
import { offsetEditFromContentChanges, offsetEditFromLineRangeMapping, offsetEditToEditOperations } from "../../../../../editor/common/model/textModelStringEdit.js";
import { IEditorWorkerService } from "../../../../../editor/common/services/editorWorker.js";
import { EditSources } from "../../../../../editor/common/textModelEditSource.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { editorSelectionBackground } from "../../../../../platform/theme/common/colorRegistry.js";
import { ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { pendingRewriteMinimap } from "./chatEditingModifiedFileEntry.js";
import { chatSessionResourceToId } from "../../common/model/chatUri.js";
let ChatEditingTextModelChangeService = class extends Disposable {
  constructor(originalModel, modifiedModel, state, isExternalEditInProgress, _editorWorkerService, _accessibilitySignalService) {
    super();
    this.originalModel = originalModel;
    this.modifiedModel = modifiedModel;
    this.state = state;
    this._editorWorkerService = _editorWorkerService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._isEditFromUs = false;
    this._allEditsAreFromUs = true;
    this._diffOperationIds = 0;
    this._diffInfo = observableValue(this, nullDocumentDiff);
    this._editDecorationClear = this._register(new RunOnceScheduler(() => {
      this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []);
    }, 500));
    this._editDecorations = [];
    this._didAcceptOrRejectAllHunks = this._register(new Emitter());
    this.onDidAcceptOrRejectAllHunks = this._didAcceptOrRejectAllHunks.event;
    this._didAcceptOrRejectLines = this._register(new Emitter());
    this.onDidAcceptOrRejectLines = this._didAcceptOrRejectLines.event;
    this._didUserEditModelFired = false;
    this._didUserEditModel = this._register(new Emitter());
    this.onDidUserEditModel = this._didUserEditModel.event;
    this._originalToModifiedEdit = StringEdit.empty;
    this.lineChangeCount = 0;
    this.linesAdded = 0;
    this.linesRemoved = 0;
    this._isExternalEditInProgress = isExternalEditInProgress;
    this._register(this.modifiedModel.onDidChangeContent((e) => {
      this._mirrorEdits(e);
    }));
    this._register(toDisposable(() => {
      this.clearCurrentEditLineDecoration();
    }));
    this._register(autorun((r) => this.updateLineChangeCount(this._diffInfo.read(r))));
    if (!originalModel.equalsTextBuffer(modifiedModel.getTextBuffer())) {
      this._updateDiffInfoSeq();
    }
  }
  get isEditFromUs() {
    return this._isEditFromUs;
  }
  get allEditsAreFromUs() {
    return this._allEditsAreFromUs;
  }
  get diffInfo() {
    return this._diffInfo.map((value) => {
      return {
        ...value,
        originalModel: this.originalModel,
        modifiedModel: this.modifiedModel,
        keep: (changes) => this._keepHunk(changes),
        undo: (changes) => this._undoHunk(changes)
      };
    });
  }
  notifyHunkAction(state, affectedLines) {
    if (affectedLines.lineCount > 0) {
      this._didAcceptOrRejectLines.fire({ state, ...affectedLines });
    }
  }
  updateLineChangeCount(diff) {
    this.lineChangeCount = 0;
    this.linesAdded = 0;
    this.linesRemoved = 0;
    for (const change of diff.changes) {
      const modifiedRange = change.modified.endLineNumberExclusive - change.modified.startLineNumber;
      this.linesAdded += Math.max(0, modifiedRange);
      const originalRange = change.original.endLineNumberExclusive - change.original.startLineNumber;
      this.linesRemoved += Math.max(0, originalRange);
      this.lineChangeCount += Math.max(modifiedRange, originalRange);
    }
  }
  clearCurrentEditLineDecoration() {
    if (!this.modifiedModel.isDisposed()) {
      this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []);
    }
  }
  async areOriginalAndModifiedIdentical() {
    const diff = await this._diffOperation;
    return diff ? diff.identical : false;
  }
  async acceptAgentEdits(resource, textEdits, isLastEdits, responseModel) {
    assertType(textEdits.every(TextEdit.isTextEdit), "INVALID args, can only handle text edits");
    assert(isEqual(resource, this.modifiedModel.uri), " INVALID args, can only edit THIS document");
    const isAtomicEdits = textEdits.length > 0 && isLastEdits;
    let maxLineNumber = 0;
    let rewriteRatio = 0;
    const source = this._createEditSource(responseModel);
    if (isAtomicEdits) {
      const minimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(this.modifiedModel.uri, textEdits) ?? textEdits;
      const ops = minimalEdits.map(TextEdit.asEditOperation);
      const undoEdits = this._applyEdits(ops, source);
      if (undoEdits.length > 0) {
        let range;
        for (let i = 0; i < undoEdits.length; i++) {
          const op = undoEdits[i];
          if (!range) {
            range = Range.lift(op.range);
          } else {
            range = Range.plusRange(range, op.range);
          }
        }
        if (range) {
          const defer = new DeferredPromise();
          const listener = addDisposableListener(getWindow(void 0), "animationend", (e) => {
            if (e.animationName === "kf-chat-editing-atomic-edit") {
              defer.complete();
              listener.dispose();
            }
          });
          this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, [{
            options: ChatEditingTextModelChangeService._atomicEditDecorationOptions,
            range
          }]);
          await Promise.any([defer.p, timeout(500)]);
          listener.dispose();
        }
      }
    } else {
      const ops = textEdits.map(TextEdit.asEditOperation);
      const undoEdits = this._applyEdits(ops, source);
      maxLineNumber = undoEdits.reduce((max, op) => Math.max(max, op.range.startLineNumber), 0);
      rewriteRatio = Math.min(1, maxLineNumber / this.modifiedModel.getLineCount());
      const newDecorations = [
        // decorate pending edit (region)
        {
          options: ChatEditingTextModelChangeService._pendingEditDecorationOptions,
          range: new Range(maxLineNumber + 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
        }
      ];
      if (maxLineNumber > 0) {
        newDecorations.push({
          options: ChatEditingTextModelChangeService._lastEditDecorationOptions,
          range: new Range(maxLineNumber, 1, maxLineNumber, Number.MAX_SAFE_INTEGER)
        });
      }
      this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, newDecorations);
    }
    if (isLastEdits) {
      this._updateDiffInfoSeq();
      this._editDecorationClear.schedule();
    }
    return { rewriteRatio, maxLineNumber };
  }
  _createEditSource(responseModel) {
    if (!responseModel) {
      return EditSources.unknown({ name: "editSessionUndoRedo" });
    }
    const sessionId = chatSessionResourceToId(responseModel.session.sessionResource);
    const request = responseModel.session.getRequests().at(-1);
    const languageId = this.modifiedModel.getLanguageId();
    const agent = responseModel.agent;
    const extensionId = VersionedExtensionId.tryCreate(agent?.extensionId.value, agent?.extensionVersion);
    if (responseModel.request?.locationData?.type === ChatAgentLocation.EditorInline) {
      return EditSources.inlineChatApplyEdit({
        modelId: request?.modelId,
        requestId: request?.id,
        sessionId,
        languageId,
        extensionId
      });
    }
    return EditSources.chatApplyEdits({
      modelId: request?.modelId,
      requestId: request?.id,
      sessionId,
      languageId,
      mode: request?.modeInfo?.telemetryModeId,
      extensionId,
      codeBlockSuggestionId: request?.modeInfo?.applyCodeBlockSuggestionId
    });
  }
  _applyEdits(edits, source) {
    if (edits.length === 0) {
      return [];
    }
    try {
      this._isEditFromUs = true;
      let result = [];
      this.modifiedModel.pushEditOperations(null, edits, (undoEdits) => {
        result = undoEdits;
        return null;
      }, void 0, source);
      return result;
    } finally {
      this._isEditFromUs = false;
    }
  }
  /**
   * Keeps the current modified document as the final contents.
   */
  keep() {
    this.notifyHunkAction("accepted", { linesAdded: this.linesAdded, linesRemoved: this.linesRemoved, lineCount: this.lineChangeCount, hasRemainingEdits: false });
    this.originalModel.setValue(this.modifiedModel.createSnapshot());
    this._reset();
  }
  /**
   * Undoes the current modified document as the final contents.
   */
  undo() {
    this.notifyHunkAction("rejected", { linesAdded: this.linesAdded, linesRemoved: this.linesRemoved, lineCount: this.lineChangeCount, hasRemainingEdits: false });
    this.modifiedModel.pushStackElement();
    this._applyEdits([EditOperation.replace(this.modifiedModel.getFullModelRange(), this.originalModel.getValue())], EditSources.chatUndoEdits());
    this.modifiedModel.pushStackElement();
    this._reset();
  }
  _reset() {
    this._originalToModifiedEdit = StringEdit.empty;
    this._diffInfo.set(nullDocumentDiff, void 0);
    this._didUserEditModelFired = false;
  }
  async resetDocumentValues(newOriginal, newModified) {
    let didChange = false;
    if (newOriginal !== void 0) {
      this.originalModel.setValue(newOriginal);
      didChange = true;
    }
    if (newModified !== void 0 && this.modifiedModel.getValue() !== newModified) {
      this.modifiedModel.pushStackElement();
      this._applyEdits([EditOperation.replace(this.modifiedModel.getFullModelRange(), newModified)], EditSources.chatReset());
      this.modifiedModel.pushStackElement();
      didChange = true;
    }
    if (didChange) {
      await this._updateDiffInfoSeq();
    }
  }
  _mirrorEdits(event) {
    const edit = offsetEditFromContentChanges(event.changes);
    const isExternalEdit = this._isExternalEditInProgress?.();
    if (this._isEditFromUs || isExternalEdit) {
      const e_sum = this._originalToModifiedEdit;
      const e_ai = edit;
      this._originalToModifiedEdit = e_sum.compose(e_ai);
      if (isExternalEdit) {
        this._updateDiffInfoSeq();
      }
    } else {
      const e_ai = this._originalToModifiedEdit;
      const e_user = edit;
      const e_user_r = e_user.tryRebase(e_ai.inverse(this.originalModel.getValue()));
      if (e_user_r === void 0) {
        this._originalToModifiedEdit = e_ai.compose(e_user);
      } else {
        const edits = offsetEditToEditOperations(e_user_r, this.originalModel);
        this.originalModel.applyEdits(edits);
        this._originalToModifiedEdit = e_ai.rebaseSkipConflicting(e_user_r);
      }
      this._allEditsAreFromUs = false;
      this._updateDiffInfoSeq();
      if (!this._didUserEditModelFired) {
        this._didUserEditModelFired = true;
        this._didUserEditModel.fire();
      }
    }
  }
  async _keepHunk(change) {
    if (!this._diffInfo.get().changes.includes(change)) {
      return false;
    }
    const edits = [];
    for (const edit of change.innerChanges ?? []) {
      const newText = this.modifiedModel.getValueInRange(edit.modifiedRange);
      edits.push(EditOperation.replace(edit.originalRange, newText));
    }
    this.originalModel.pushEditOperations(null, edits, (_) => null);
    await this._updateDiffInfoSeq("accepted");
    if (this._diffInfo.get().identical) {
      this._didAcceptOrRejectAllHunks.fire(ModifiedFileEntryState.Accepted);
    }
    this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
    return true;
  }
  async _undoHunk(change) {
    if (!this._diffInfo.get().changes.includes(change)) {
      return false;
    }
    const edits = [];
    for (const edit of change.innerChanges ?? []) {
      const newText = this.originalModel.getValueInRange(edit.originalRange);
      edits.push(EditOperation.replace(edit.modifiedRange, newText));
    }
    this.modifiedModel.pushEditOperations(null, edits, (_) => null);
    await this._updateDiffInfoSeq("rejected");
    if (this._diffInfo.get().identical) {
      this._didAcceptOrRejectAllHunks.fire(ModifiedFileEntryState.Rejected);
    }
    this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
    return true;
  }
  async getDiffInfo() {
    if (!this._diffOperation) {
      this._updateDiffInfoSeq();
    }
    await this._diffOperation;
    return this._diffInfo.get();
  }
  async _updateDiffInfoSeq(notifyAction = void 0) {
    const myDiffOperationId = ++this._diffOperationIds;
    await Promise.resolve(this._diffOperation);
    const previousCount = this.lineChangeCount;
    const previousAdded = this.linesAdded;
    const previousRemoved = this.linesRemoved;
    if (this._diffOperationIds === myDiffOperationId) {
      const thisDiffOperation = this._updateDiffInfo();
      this._diffOperation = thisDiffOperation;
      await thisDiffOperation;
      if (notifyAction) {
        const affectedLines = {
          linesAdded: previousAdded - this.linesAdded,
          linesRemoved: previousRemoved - this.linesRemoved,
          lineCount: previousCount - this.lineChangeCount,
          hasRemainingEdits: this.lineChangeCount > 0
        };
        this.notifyHunkAction(notifyAction, affectedLines);
      }
    }
  }
  hasHunkAt(range) {
    return this._diffInfo.get().changes.some((c) => c.modified.intersectsStrict(LineRange.fromRangeInclusive(range)));
  }
  async _updateDiffInfo() {
    if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed() || this._store.isDisposed) {
      return void 0;
    }
    if (this.state.get() !== ModifiedFileEntryState.Modified) {
      this._diffInfo.set(nullDocumentDiff, void 0);
      this._originalToModifiedEdit = StringEdit.empty;
      return nullDocumentDiff;
    }
    const docVersionNow = this.modifiedModel.getVersionId();
    const snapshotVersionNow = this.originalModel.getVersionId();
    const diff = await this._editorWorkerService.computeDiff(
      this.originalModel.uri,
      this.modifiedModel.uri,
      {
        ignoreTrimWhitespace: false,
        // NEVER ignore whitespace so that undo/accept edits are correct and so that all changes (1 of 2) are spelled out
        computeMoves: false,
        maxComputationTimeMs: 3e3
      },
      "advanced"
    );
    if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed() || this._store.isDisposed) {
      return void 0;
    }
    if (this.modifiedModel.getVersionId() === docVersionNow && this.originalModel.getVersionId() === snapshotVersionNow) {
      const diff2 = diff ?? nullDocumentDiff;
      this._diffInfo.set(diff2, void 0);
      this._originalToModifiedEdit = offsetEditFromLineRangeMapping(this.originalModel, this.modifiedModel, diff2.changes);
      return diff2;
    }
    return void 0;
  }
};
ChatEditingTextModelChangeService._lastEditDecorationOptions = ModelDecorationOptions.register({
  isWholeLine: true,
  description: "chat-last-edit",
  className: "chat-editing-last-edit-line",
  marginClassName: "chat-editing-last-edit",
  overviewRuler: {
    position: OverviewRulerLane.Full,
    color: themeColorFromId(editorSelectionBackground)
  }
});
ChatEditingTextModelChangeService._pendingEditDecorationOptions = ModelDecorationOptions.register({
  isWholeLine: true,
  description: "chat-pending-edit",
  className: "chat-editing-pending-edit",
  minimap: {
    position: MinimapPosition.Inline,
    color: themeColorFromId(pendingRewriteMinimap)
  }
});
ChatEditingTextModelChangeService._atomicEditDecorationOptions = ModelDecorationOptions.register({
  isWholeLine: true,
  description: "chat-atomic-edit",
  className: "chat-editing-atomic-edit",
  minimap: {
    position: MinimapPosition.Inline,
    color: themeColorFromId(pendingRewriteMinimap)
  }
});
ChatEditingTextModelChangeService = __decorateClass([
  __decorateParam(4, IEditorWorkerService),
  __decorateParam(5, IAccessibilitySignalService)
], ChatEditingTextModelChangeService);
export {
  ChatEditingTextModelChangeService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ1RleHRNb2RlbENoYW5nZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgUnVuT25jZVNjaGVkdWxlciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiwgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBTdHJpbmdFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmLCBudWxsRG9jdW1lbnREaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2RvY3VtZW50RGlmZlByb3ZpZGVyLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQsIFZlcnNpb25lZEV4dGVuc2lvbklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsLCBJVGV4dFNuYXBzaG90LCBNaW5pbWFwUG9zaXRpb24sIE92ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgb2Zmc2V0RWRpdEZyb21Db250ZW50Q2hhbmdlcywgb2Zmc2V0RWRpdEZyb21MaW5lUmFuZ2VNYXBwaW5nLCBvZmZzZXRFZGl0VG9FZGl0T3BlcmF0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsU3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IEVkaXRTb3VyY2VzLCBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZWRpdG9yU2VsZWN0aW9uQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDZWxsRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElEb2N1bWVudERpZmYyIH0gZnJvbSAnLi9jaGF0RWRpdGluZ0NvZGVFZGl0b3JJbnRlZ3JhdGlvbi5qcyc7XG5pbXBvcnQgeyBwZW5kaW5nUmV3cml0ZU1pbmltYXAgfSBmcm9tICcuL2NoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnkuanMnO1xuaW1wb3J0IHsgY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5cbnR5cGUgYWZmZWN0ZWRMaW5lcyA9IHsgbGluZXNBZGRlZDogbnVtYmVyOyBsaW5lc1JlbW92ZWQ6IG51bWJlcjsgbGluZUNvdW50OiBudW1iZXI7IGhhc1JlbWFpbmluZ0VkaXRzOiBib29sZWFuIH07XG50eXBlIGFjY2VwdGVkT3JSZWplY3RlZExpbmVzID0gYWZmZWN0ZWRMaW5lcyAmIHsgc3RhdGU6ICdhY2NlcHRlZCcgfCAncmVqZWN0ZWQnIH07XG5cbmV4cG9ydCBjbGFzcyBDaGF0RWRpdGluZ1RleHRNb2RlbENoYW5nZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfbGFzdEVkaXREZWNvcmF0aW9uT3B0aW9ucyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdGRlc2NyaXB0aW9uOiAnY2hhdC1sYXN0LWVkaXQnLFxuXHRcdGNsYXNzTmFtZTogJ2NoYXQtZWRpdGluZy1sYXN0LWVkaXQtbGluZScsXG5cdFx0bWFyZ2luQ2xhc3NOYW1lOiAnY2hhdC1lZGl0aW5nLWxhc3QtZWRpdCcsXG5cdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0cG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkZ1bGwsXG5cdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChlZGl0b3JTZWxlY3Rpb25CYWNrZ3JvdW5kKVxuXHRcdH0sXG5cdH0pO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9wZW5kaW5nRWRpdERlY29yYXRpb25PcHRpb25zID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0aXNXaG9sZUxpbmU6IHRydWUsXG5cdFx0ZGVzY3JpcHRpb246ICdjaGF0LXBlbmRpbmctZWRpdCcsXG5cdFx0Y2xhc3NOYW1lOiAnY2hhdC1lZGl0aW5nLXBlbmRpbmctZWRpdCcsXG5cdFx0bWluaW1hcDoge1xuXHRcdFx0cG9zaXRpb246IE1pbmltYXBQb3NpdGlvbi5JbmxpbmUsXG5cdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChwZW5kaW5nUmV3cml0ZU1pbmltYXApXG5cdFx0fVxuXHR9KTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfYXRvbWljRWRpdERlY29yYXRpb25PcHRpb25zID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0aXNXaG9sZUxpbmU6IHRydWUsXG5cdFx0ZGVzY3JpcHRpb246ICdjaGF0LWF0b21pYy1lZGl0Jyxcblx0XHRjbGFzc05hbWU6ICdjaGF0LWVkaXRpbmctYXRvbWljLWVkaXQnLFxuXHRcdG1pbmltYXA6IHtcblx0XHRcdHBvc2l0aW9uOiBNaW5pbWFwUG9zaXRpb24uSW5saW5lLFxuXHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQocGVuZGluZ1Jld3JpdGVNaW5pbWFwKVxuXHRcdH1cblx0fSk7XG5cblx0cHJpdmF0ZSBfaXNFZGl0RnJvbVVzOiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpYyBnZXQgaXNFZGl0RnJvbVVzKCkge1xuXHRcdHJldHVybiB0aGlzLl9pc0VkaXRGcm9tVXM7XG5cdH1cblx0cHJpdmF0ZSBfYWxsRWRpdHNBcmVGcm9tVXM6IGJvb2xlYW4gPSB0cnVlO1xuXHRwdWJsaWMgZ2V0IGFsbEVkaXRzQXJlRnJvbVVzKCkge1xuXHRcdHJldHVybiB0aGlzLl9hbGxFZGl0c0FyZUZyb21Vcztcblx0fVxuXHRwcml2YXRlIF9pc0V4dGVybmFsRWRpdEluUHJvZ3Jlc3M6ICgoKSA9PiBib29sZWFuKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlmZk9wZXJhdGlvbjogUHJvbWlzZTxJRG9jdW1lbnREaWZmIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlmZk9wZXJhdGlvbklkczogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmSW5mbyA9IG9ic2VydmFibGVWYWx1ZTxJRG9jdW1lbnREaWZmPih0aGlzLCBudWxsRG9jdW1lbnREaWZmKTtcblx0cHVibGljIGdldCBkaWZmSW5mbygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlmZkluZm8ubWFwKHZhbHVlID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnZhbHVlLFxuXHRcdFx0XHRvcmlnaW5hbE1vZGVsOiB0aGlzLm9yaWdpbmFsTW9kZWwsXG5cdFx0XHRcdG1vZGlmaWVkTW9kZWw6IHRoaXMubW9kaWZpZWRNb2RlbCxcblx0XHRcdFx0a2VlcDogY2hhbmdlcyA9PiB0aGlzLl9rZWVwSHVuayhjaGFuZ2VzKSxcblx0XHRcdFx0dW5kbzogY2hhbmdlcyA9PiB0aGlzLl91bmRvSHVuayhjaGFuZ2VzKVxuXHRcdFx0fSBzYXRpc2ZpZXMgSURvY3VtZW50RGlmZjI7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0RGVjb3JhdGlvbkNsZWFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4geyB0aGlzLl9lZGl0RGVjb3JhdGlvbnMgPSB0aGlzLm1vZGlmaWVkTW9kZWwuZGVsdGFEZWNvcmF0aW9ucyh0aGlzLl9lZGl0RGVjb3JhdGlvbnMsIFtdKTsgfSwgNTAwKSk7XG5cdHByaXZhdGUgX2VkaXREZWNvcmF0aW9uczogc3RyaW5nW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWRBY2NlcHRPclJlamVjdEFsbEh1bmtzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCB8IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuUmVqZWN0ZWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRBY2NlcHRPclJlamVjdEFsbEh1bmtzID0gdGhpcy5fZGlkQWNjZXB0T3JSZWplY3RBbGxIdW5rcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWRBY2NlcHRPclJlamVjdExpbmVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8YWNjZXB0ZWRPclJlamVjdGVkTGluZXM+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRBY2NlcHRPclJlamVjdExpbmVzID0gdGhpcy5fZGlkQWNjZXB0T3JSZWplY3RMaW5lcy5ldmVudDtcblxuXHRwcml2YXRlIG5vdGlmeUh1bmtBY3Rpb24oc3RhdGU6ICdhY2NlcHRlZCcgfCAncmVqZWN0ZWQnLCBhZmZlY3RlZExpbmVzOiBhZmZlY3RlZExpbmVzKSB7XG5cdFx0aWYgKGFmZmVjdGVkTGluZXMubGluZUNvdW50ID4gMCkge1xuXHRcdFx0dGhpcy5fZGlkQWNjZXB0T3JSZWplY3RMaW5lcy5maXJlKHsgc3RhdGUsIC4uLmFmZmVjdGVkTGluZXMgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlkVXNlckVkaXRNb2RlbEZpcmVkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpZFVzZXJFZGl0TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkVXNlckVkaXRNb2RlbCA9IHRoaXMuX2RpZFVzZXJFZGl0TW9kZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb3JpZ2luYWxUb01vZGlmaWVkRWRpdDogU3RyaW5nRWRpdCA9IFN0cmluZ0VkaXQuZW1wdHk7XG5cblx0cHJpdmF0ZSBsaW5lQ2hhbmdlQ291bnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgbGluZXNBZGRlZDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBsaW5lc1JlbW92ZWQ6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcmlnaW5hbE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbW9kaWZpZWRNb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0YXRlOiBJT2JzZXJ2YWJsZTxNb2RpZmllZEZpbGVFbnRyeVN0YXRlPixcblx0XHRpc0V4dGVybmFsRWRpdEluUHJvZ3Jlc3M6ICgoKSA9PiBib29sZWFuKSB8IHVuZGVmaW5lZCxcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yV29ya2VyU2VydmljZTogSUVkaXRvcldvcmtlclNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2lzRXh0ZXJuYWxFZGl0SW5Qcm9ncmVzcyA9IGlzRXh0ZXJuYWxFZGl0SW5Qcm9ncmVzcztcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGlmaWVkTW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGUgPT4ge1xuXHRcdFx0dGhpcy5fbWlycm9yRWRpdHMoZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuY2xlYXJDdXJyZW50RWRpdExpbmVEZWNvcmF0aW9uKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHRoaXMudXBkYXRlTGluZUNoYW5nZUNvdW50KHRoaXMuX2RpZmZJbmZvLnJlYWQocikpKSk7XG5cblx0XHRpZiAoIW9yaWdpbmFsTW9kZWwuZXF1YWxzVGV4dEJ1ZmZlcihtb2RpZmllZE1vZGVsLmdldFRleHRCdWZmZXIoKSkpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZURpZmZJbmZvU2VxKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVMaW5lQ2hhbmdlQ291bnQoZGlmZjogSURvY3VtZW50RGlmZikge1xuXHRcdHRoaXMubGluZUNoYW5nZUNvdW50ID0gMDtcblx0XHR0aGlzLmxpbmVzQWRkZWQgPSAwO1xuXHRcdHRoaXMubGluZXNSZW1vdmVkID0gMDtcblxuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGRpZmYuY2hhbmdlcykge1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRSYW5nZSA9IGNoYW5nZS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gY2hhbmdlLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdHRoaXMubGluZXNBZGRlZCArPSBNYXRoLm1heCgwLCBtb2RpZmllZFJhbmdlKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsUmFuZ2UgPSBjaGFuZ2Uub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIGNoYW5nZS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHR0aGlzLmxpbmVzUmVtb3ZlZCArPSBNYXRoLm1heCgwLCBvcmlnaW5hbFJhbmdlKTtcblxuXHRcdFx0dGhpcy5saW5lQ2hhbmdlQ291bnQgKz0gTWF0aC5tYXgobW9kaWZpZWRSYW5nZSwgb3JpZ2luYWxSYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNsZWFyQ3VycmVudEVkaXRMaW5lRGVjb3JhdGlvbigpIHtcblx0XHRpZiAoIXRoaXMubW9kaWZpZWRNb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHRoaXMuX2VkaXREZWNvcmF0aW9ucyA9IHRoaXMubW9kaWZpZWRNb2RlbC5kZWx0YURlY29yYXRpb25zKHRoaXMuX2VkaXREZWNvcmF0aW9ucywgW10pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBhcmVPcmlnaW5hbEFuZE1vZGlmaWVkSWRlbnRpY2FsKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGRpZmYgPSBhd2FpdCB0aGlzLl9kaWZmT3BlcmF0aW9uO1xuXHRcdHJldHVybiBkaWZmID8gZGlmZi5pZGVudGljYWwgOiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIGFjY2VwdEFnZW50RWRpdHMocmVzb3VyY2U6IFVSSSwgdGV4dEVkaXRzOiAoVGV4dEVkaXQgfCBJQ2VsbEVkaXRPcGVyYXRpb24pW10sIGlzTGFzdEVkaXRzOiBib29sZWFuLCByZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwgfCB1bmRlZmluZWQpOiBQcm9taXNlPHsgcmV3cml0ZVJhdGlvOiBudW1iZXI7IG1heExpbmVOdW1iZXI6IG51bWJlciB9PiB7XG5cblx0XHRhc3NlcnRUeXBlKHRleHRFZGl0cy5ldmVyeShUZXh0RWRpdC5pc1RleHRFZGl0KSwgJ0lOVkFMSUQgYXJncywgY2FuIG9ubHkgaGFuZGxlIHRleHQgZWRpdHMnKTtcblx0XHRhc3NlcnQoaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5tb2RpZmllZE1vZGVsLnVyaSksICcgSU5WQUxJRCBhcmdzLCBjYW4gb25seSBlZGl0IFRISVMgZG9jdW1lbnQnKTtcblxuXHRcdGNvbnN0IGlzQXRvbWljRWRpdHMgPSB0ZXh0RWRpdHMubGVuZ3RoID4gMCAmJiBpc0xhc3RFZGl0cztcblx0XHRsZXQgbWF4TGluZU51bWJlciA9IDA7XG5cdFx0bGV0IHJld3JpdGVSYXRpbyA9IDA7XG5cblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLl9jcmVhdGVFZGl0U291cmNlKHJlc3BvbnNlTW9kZWwpO1xuXG5cdFx0aWYgKGlzQXRvbWljRWRpdHMpIHtcblx0XHRcdC8vIEVESVQgYW5kIERPTkVcblx0XHRcdGNvbnN0IG1pbmltYWxFZGl0cyA9IGF3YWl0IHRoaXMuX2VkaXRvcldvcmtlclNlcnZpY2UuY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHModGhpcy5tb2RpZmllZE1vZGVsLnVyaSwgdGV4dEVkaXRzKSA/PyB0ZXh0RWRpdHM7XG5cdFx0XHRjb25zdCBvcHMgPSBtaW5pbWFsRWRpdHMubWFwKFRleHRFZGl0LmFzRWRpdE9wZXJhdGlvbik7XG5cdFx0XHRjb25zdCB1bmRvRWRpdHMgPSB0aGlzLl9hcHBseUVkaXRzKG9wcywgc291cmNlKTtcblxuXHRcdFx0aWYgKHVuZG9FZGl0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGxldCByYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdW5kb0VkaXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3AgPSB1bmRvRWRpdHNbaV07XG5cdFx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdFx0cmFuZ2UgPSBSYW5nZS5saWZ0KG9wLnJhbmdlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmFuZ2UgPSBSYW5nZS5wbHVzUmFuZ2UocmFuZ2UsIG9wLnJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJhbmdlKSB7XG5cblx0XHRcdFx0XHRjb25zdCBkZWZlciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IGFkZERpc3Bvc2FibGVMaXN0ZW5lcihnZXRXaW5kb3codW5kZWZpbmVkKSwgJ2FuaW1hdGlvbmVuZCcsIGUgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGUuYW5pbWF0aW9uTmFtZSA9PT0gJ2tmLWNoYXQtZWRpdGluZy1hdG9taWMtZWRpdCcpIHsgLy8gQ0hFQ0sgd2l0aCBjaGF0LmNzc1xuXHRcdFx0XHRcdFx0XHRkZWZlci5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHR0aGlzLl9lZGl0RGVjb3JhdGlvbnMgPSB0aGlzLm1vZGlmaWVkTW9kZWwuZGVsdGFEZWNvcmF0aW9ucyh0aGlzLl9lZGl0RGVjb3JhdGlvbnMsIFt7XG5cdFx0XHRcdFx0XHRvcHRpb25zOiBDaGF0RWRpdGluZ1RleHRNb2RlbENoYW5nZVNlcnZpY2UuX2F0b21pY0VkaXREZWNvcmF0aW9uT3B0aW9ucyxcblx0XHRcdFx0XHRcdHJhbmdlXG5cdFx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbnkoW2RlZmVyLnAsIHRpbWVvdXQoNTAwKV0pOyAvLyB3YWl0IGZvciBhbmltYXRpb24gdG8gZmluaXNoIGJ1dCBhbHNvIHRpbWUtY2FwIGl0XG5cdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBFRElUIGEgYml0LCB0aGVuIERPTkVcblx0XHRcdGNvbnN0IG9wcyA9IHRleHRFZGl0cy5tYXAoVGV4dEVkaXQuYXNFZGl0T3BlcmF0aW9uKTtcblx0XHRcdGNvbnN0IHVuZG9FZGl0cyA9IHRoaXMuX2FwcGx5RWRpdHMob3BzLCBzb3VyY2UpO1xuXHRcdFx0bWF4TGluZU51bWJlciA9IHVuZG9FZGl0cy5yZWR1Y2UoKG1heCwgb3ApID0+IE1hdGgubWF4KG1heCwgb3AucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSwgMCk7XG5cdFx0XHRyZXdyaXRlUmF0aW8gPSBNYXRoLm1pbigxLCBtYXhMaW5lTnVtYmVyIC8gdGhpcy5tb2RpZmllZE1vZGVsLmdldExpbmVDb3VudCgpKTtcblxuXHRcdFx0Y29uc3QgbmV3RGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW1xuXHRcdFx0XHQvLyBkZWNvcmF0ZSBwZW5kaW5nIGVkaXQgKHJlZ2lvbilcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wdGlvbnM6IENoYXRFZGl0aW5nVGV4dE1vZGVsQ2hhbmdlU2VydmljZS5fcGVuZGluZ0VkaXREZWNvcmF0aW9uT3B0aW9ucyxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKG1heExpbmVOdW1iZXIgKyAxLCAxLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cblx0XHRcdGlmIChtYXhMaW5lTnVtYmVyID4gMCkge1xuXHRcdFx0XHQvLyBkZWNvcmF0ZSBsYXN0IGVkaXRcblx0XHRcdFx0bmV3RGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0b3B0aW9uczogQ2hhdEVkaXRpbmdUZXh0TW9kZWxDaGFuZ2VTZXJ2aWNlLl9sYXN0RWRpdERlY29yYXRpb25PcHRpb25zLFxuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UobWF4TGluZU51bWJlciwgMSwgbWF4TGluZU51bWJlciwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZWRpdERlY29yYXRpb25zID0gdGhpcy5tb2RpZmllZE1vZGVsLmRlbHRhRGVjb3JhdGlvbnModGhpcy5fZWRpdERlY29yYXRpb25zLCBuZXdEZWNvcmF0aW9ucyk7XG5cblx0XHR9XG5cblx0XHRpZiAoaXNMYXN0RWRpdHMpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZURpZmZJbmZvU2VxKCk7XG5cdFx0XHR0aGlzLl9lZGl0RGVjb3JhdGlvbkNsZWFyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgcmV3cml0ZVJhdGlvLCBtYXhMaW5lTnVtYmVyIH07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVFZGl0U291cmNlKHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZCkge1xuXG5cdFx0aWYgKCFyZXNwb25zZU1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gRWRpdFNvdXJjZXMudW5rbm93bih7IG5hbWU6ICdlZGl0U2Vzc2lvblVuZG9SZWRvJyB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChyZXNwb25zZU1vZGVsLnNlc3Npb24uc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gcmVzcG9uc2VNb2RlbC5zZXNzaW9uLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLm1vZGlmaWVkTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdGNvbnN0IGFnZW50ID0gcmVzcG9uc2VNb2RlbC5hZ2VudDtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9IFZlcnNpb25lZEV4dGVuc2lvbklkLnRyeUNyZWF0ZShhZ2VudD8uZXh0ZW5zaW9uSWQudmFsdWUsIGFnZW50Py5leHRlbnNpb25WZXJzaW9uKTtcblxuXHRcdGlmIChyZXNwb25zZU1vZGVsLnJlcXVlc3Q/LmxvY2F0aW9uRGF0YT8udHlwZSA9PT0gQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKSB7XG5cblx0XHRcdHJldHVybiBFZGl0U291cmNlcy5pbmxpbmVDaGF0QXBwbHlFZGl0KHtcblx0XHRcdFx0bW9kZWxJZDogcmVxdWVzdD8ubW9kZWxJZCxcblx0XHRcdFx0cmVxdWVzdElkOiByZXF1ZXN0Py5pZCxcblx0XHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0XHRleHRlbnNpb25JZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBFZGl0U291cmNlcy5jaGF0QXBwbHlFZGl0cyh7XG5cdFx0XHRtb2RlbElkOiByZXF1ZXN0Py5tb2RlbElkLFxuXHRcdFx0cmVxdWVzdElkOiByZXF1ZXN0Py5pZCxcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdGxhbmd1YWdlSWQsXG5cdFx0XHRtb2RlOiByZXF1ZXN0Py5tb2RlSW5mbz8udGVsZW1ldHJ5TW9kZUlkLFxuXHRcdFx0ZXh0ZW5zaW9uSWQsXG5cdFx0XHRjb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHJlcXVlc3Q/Lm1vZGVJbmZvPy5hcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5RWRpdHMoZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10sIHNvdXJjZTogVGV4dE1vZGVsRWRpdFNvdXJjZSkge1xuXG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pc0VkaXRGcm9tVXMgPSB0cnVlO1xuXHRcdFx0Ly8gbWFrZSB0aGUgYWN0dWFsIGVkaXRcblx0XHRcdGxldCByZXN1bHQ6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblxuXHRcdFx0dGhpcy5tb2RpZmllZE1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBlZGl0cywgKHVuZG9FZGl0cykgPT4ge1xuXHRcdFx0XHRyZXN1bHQgPSB1bmRvRWRpdHM7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fSwgdW5kZWZpbmVkLCBzb3VyY2UpO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc0VkaXRGcm9tVXMgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogS2VlcHMgdGhlIGN1cnJlbnQgbW9kaWZpZWQgZG9jdW1lbnQgYXMgdGhlIGZpbmFsIGNvbnRlbnRzLlxuXHQgKi9cblx0cHVibGljIGtlZXAoKSB7XG5cdFx0dGhpcy5ub3RpZnlIdW5rQWN0aW9uKCdhY2NlcHRlZCcsIHsgbGluZXNBZGRlZDogdGhpcy5saW5lc0FkZGVkLCBsaW5lc1JlbW92ZWQ6IHRoaXMubGluZXNSZW1vdmVkLCBsaW5lQ291bnQ6IHRoaXMubGluZUNoYW5nZUNvdW50LCBoYXNSZW1haW5pbmdFZGl0czogZmFsc2UgfSk7XG5cdFx0dGhpcy5vcmlnaW5hbE1vZGVsLnNldFZhbHVlKHRoaXMubW9kaWZpZWRNb2RlbC5jcmVhdGVTbmFwc2hvdCgpKTtcblx0XHR0aGlzLl9yZXNldCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVuZG9lcyB0aGUgY3VycmVudCBtb2RpZmllZCBkb2N1bWVudCBhcyB0aGUgZmluYWwgY29udGVudHMuXG5cdCAqL1xuXHRwdWJsaWMgdW5kbygpIHtcblx0XHR0aGlzLm5vdGlmeUh1bmtBY3Rpb24oJ3JlamVjdGVkJywgeyBsaW5lc0FkZGVkOiB0aGlzLmxpbmVzQWRkZWQsIGxpbmVzUmVtb3ZlZDogdGhpcy5saW5lc1JlbW92ZWQsIGxpbmVDb3VudDogdGhpcy5saW5lQ2hhbmdlQ291bnQsIGhhc1JlbWFpbmluZ0VkaXRzOiBmYWxzZSB9KTtcblx0XHR0aGlzLm1vZGlmaWVkTW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdHRoaXMuX2FwcGx5RWRpdHMoWyhFZGl0T3BlcmF0aW9uLnJlcGxhY2UodGhpcy5tb2RpZmllZE1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHRoaXMub3JpZ2luYWxNb2RlbC5nZXRWYWx1ZSgpKSldLCBFZGl0U291cmNlcy5jaGF0VW5kb0VkaXRzKCkpO1xuXHRcdHRoaXMubW9kaWZpZWRNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0dGhpcy5fcmVzZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0KCkge1xuXHRcdHRoaXMuX29yaWdpbmFsVG9Nb2RpZmllZEVkaXQgPSBTdHJpbmdFZGl0LmVtcHR5O1xuXHRcdHRoaXMuX2RpZmZJbmZvLnNldChudWxsRG9jdW1lbnREaWZmLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2RpZFVzZXJFZGl0TW9kZWxGaXJlZCA9IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc2V0RG9jdW1lbnRWYWx1ZXMobmV3T3JpZ2luYWw6IHN0cmluZyB8IElUZXh0U25hcHNob3QgfCB1bmRlZmluZWQsIG5ld01vZGlmaWVkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cdFx0aWYgKG5ld09yaWdpbmFsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMub3JpZ2luYWxNb2RlbC5zZXRWYWx1ZShuZXdPcmlnaW5hbCk7XG5cdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAobmV3TW9kaWZpZWQgIT09IHVuZGVmaW5lZCAmJiB0aGlzLm1vZGlmaWVkTW9kZWwuZ2V0VmFsdWUoKSAhPT0gbmV3TW9kaWZpZWQpIHtcblx0XHRcdC8vIE5PVEUgdGhhdCB0aGlzIGlzbid0IGRvbmUgdmlhIGBzZXRWYWx1ZWAgc28gdGhhdCB0aGUgdW5kbyBzdGFjayBpcyBwcmVzZXJ2ZWRcblx0XHRcdHRoaXMubW9kaWZpZWRNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHR0aGlzLl9hcHBseUVkaXRzKFsoRWRpdE9wZXJhdGlvbi5yZXBsYWNlKHRoaXMubW9kaWZpZWRNb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCBuZXdNb2RpZmllZCkpXSwgRWRpdFNvdXJjZXMuY2hhdFJlc2V0KCkpO1xuXHRcdFx0dGhpcy5tb2RpZmllZE1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChkaWRDaGFuZ2UpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZURpZmZJbmZvU2VxKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWlycm9yRWRpdHMoZXZlbnQ6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQpIHtcblx0XHRjb25zdCBlZGl0ID0gb2Zmc2V0RWRpdEZyb21Db250ZW50Q2hhbmdlcyhldmVudC5jaGFuZ2VzKTtcblx0XHRjb25zdCBpc0V4dGVybmFsRWRpdCA9IHRoaXMuX2lzRXh0ZXJuYWxFZGl0SW5Qcm9ncmVzcz8uKCk7XG5cblx0XHRpZiAodGhpcy5faXNFZGl0RnJvbVVzIHx8IGlzRXh0ZXJuYWxFZGl0KSB7XG5cdFx0XHRjb25zdCBlX3N1bSA9IHRoaXMuX29yaWdpbmFsVG9Nb2RpZmllZEVkaXQ7XG5cdFx0XHRjb25zdCBlX2FpID0gZWRpdDtcblx0XHRcdHRoaXMuX29yaWdpbmFsVG9Nb2RpZmllZEVkaXQgPSBlX3N1bS5jb21wb3NlKGVfYWkpO1xuXHRcdFx0aWYgKGlzRXh0ZXJuYWxFZGl0KSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZURpZmZJbmZvU2VxKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0Ly8gICAgICAgICAgIGVfYWlcblx0XHRcdC8vICAgZDAgLS0tLS0tLS0tLS0tLS0tPiBzMFxuXHRcdFx0Ly8gICB8ICAgICAgICAgICAgICAgICAgIHxcblx0XHRcdC8vICAgfCAgICAgICAgICAgICAgICAgICB8XG5cdFx0XHQvLyAgIHwgZV91c2VyX3IgICAgICAgICAgfCBlX3VzZXJcblx0XHRcdC8vICAgfCAgICAgICAgICAgICAgICAgICB8XG5cdFx0XHQvLyAgIHwgICAgICAgICAgICAgICAgICAgfFxuXHRcdFx0Ly8gICB2ICAgICAgIGVfYWlfciAgICAgIHZcblx0XHRcdC8vLyAgZDEgLS0tLS0tLS0tLS0tLS0tPiBzMVxuXHRcdFx0Ly9cblx0XHRcdC8vIGQwIC0gZG9jdW1lbnQgc25hcHNob3Rcblx0XHRcdC8vIHMwIC0gZG9jdW1lbnRcblx0XHRcdC8vIGVfYWkgLSBhaSBlZGl0c1xuXHRcdFx0Ly8gZV91c2VyIC0gdXNlciBlZGl0c1xuXHRcdFx0Ly9cblx0XHRcdGNvbnN0IGVfYWkgPSB0aGlzLl9vcmlnaW5hbFRvTW9kaWZpZWRFZGl0O1xuXHRcdFx0Y29uc3QgZV91c2VyID0gZWRpdDtcblxuXHRcdFx0Y29uc3QgZV91c2VyX3IgPSBlX3VzZXIudHJ5UmViYXNlKGVfYWkuaW52ZXJzZSh0aGlzLm9yaWdpbmFsTW9kZWwuZ2V0VmFsdWUoKSkpO1xuXG5cdFx0XHRpZiAoZV91c2VyX3IgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyB1c2VyIGVkaXRzIG92ZXJsYXBzL2NvbmZsaWN0cyB3aXRoIEFJIGVkaXRzXG5cdFx0XHRcdHRoaXMuX29yaWdpbmFsVG9Nb2RpZmllZEVkaXQgPSBlX2FpLmNvbXBvc2UoZV91c2VyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRzID0gb2Zmc2V0RWRpdFRvRWRpdE9wZXJhdGlvbnMoZV91c2VyX3IsIHRoaXMub3JpZ2luYWxNb2RlbCk7XG5cdFx0XHRcdHRoaXMub3JpZ2luYWxNb2RlbC5hcHBseUVkaXRzKGVkaXRzKTtcblx0XHRcdFx0dGhpcy5fb3JpZ2luYWxUb01vZGlmaWVkRWRpdCA9IGVfYWkucmViYXNlU2tpcENvbmZsaWN0aW5nKGVfdXNlcl9yKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fYWxsRWRpdHNBcmVGcm9tVXMgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3VwZGF0ZURpZmZJbmZvU2VxKCk7XG5cdFx0XHRpZiAoIXRoaXMuX2RpZFVzZXJFZGl0TW9kZWxGaXJlZCkge1xuXHRcdFx0XHR0aGlzLl9kaWRVc2VyRWRpdE1vZGVsRmlyZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9kaWRVc2VyRWRpdE1vZGVsLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9rZWVwSHVuayhjaGFuZ2U6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghdGhpcy5fZGlmZkluZm8uZ2V0KCkuY2hhbmdlcy5pbmNsdWRlcyhjaGFuZ2UpKSB7XG5cdFx0XHQvLyBkaWZmSW5mbyBzaG91bGQgaGF2ZSBtb2RlbCB2ZXJzaW9uIGlkcyBhbmQgY2hlY2sgdGhlbSAoaW5zdGVhZCBvZiB0aGUgY2FsbGVyIGRvaW5nIHRoYXQpXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIGNoYW5nZS5pbm5lckNoYW5nZXMgPz8gW10pIHtcblx0XHRcdGNvbnN0IG5ld1RleHQgPSB0aGlzLm1vZGlmaWVkTW9kZWwuZ2V0VmFsdWVJblJhbmdlKGVkaXQubW9kaWZpZWRSYW5nZSk7XG5cdFx0XHRlZGl0cy5wdXNoKEVkaXRPcGVyYXRpb24ucmVwbGFjZShlZGl0Lm9yaWdpbmFsUmFuZ2UsIG5ld1RleHQpKTtcblx0XHR9XG5cdFx0dGhpcy5vcmlnaW5hbE1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBlZGl0cywgXyA9PiBudWxsKTtcblx0XHRhd2FpdCB0aGlzLl91cGRhdGVEaWZmSW5mb1NlcSgnYWNjZXB0ZWQnKTtcblx0XHRpZiAodGhpcy5fZGlmZkluZm8uZ2V0KCkuaWRlbnRpY2FsKSB7XG5cdFx0XHR0aGlzLl9kaWRBY2NlcHRPclJlamVjdEFsbEh1bmtzLmZpcmUoTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCk7XG5cdFx0fVxuXHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5lZGl0c0tlcHQsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VuZG9IdW5rKGNoYW5nZTogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLl9kaWZmSW5mby5nZXQoKS5jaGFuZ2VzLmluY2x1ZGVzKGNoYW5nZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgY2hhbmdlLmlubmVyQ2hhbmdlcyA/PyBbXSkge1xuXHRcdFx0Y29uc3QgbmV3VGV4dCA9IHRoaXMub3JpZ2luYWxNb2RlbC5nZXRWYWx1ZUluUmFuZ2UoZWRpdC5vcmlnaW5hbFJhbmdlKTtcblx0XHRcdGVkaXRzLnB1c2goRWRpdE9wZXJhdGlvbi5yZXBsYWNlKGVkaXQubW9kaWZpZWRSYW5nZSwgbmV3VGV4dCkpO1xuXHRcdH1cblx0XHR0aGlzLm1vZGlmaWVkTW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIGVkaXRzLCBfID0+IG51bGwpO1xuXHRcdGF3YWl0IHRoaXMuX3VwZGF0ZURpZmZJbmZvU2VxKCdyZWplY3RlZCcpO1xuXHRcdGlmICh0aGlzLl9kaWZmSW5mby5nZXQoKS5pZGVudGljYWwpIHtcblx0XHRcdHRoaXMuX2RpZEFjY2VwdE9yUmVqZWN0QWxsSHVua3MuZmlyZShNb2RpZmllZEZpbGVFbnRyeVN0YXRlLlJlamVjdGVkKTtcblx0XHR9XG5cdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmVkaXRzVW5kb25lLCB7IGFsbG93TWFueUluUGFyYWxsZWw6IHRydWUgfSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0RGlmZkluZm8oKSB7XG5cdFx0aWYgKCF0aGlzLl9kaWZmT3BlcmF0aW9uKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVEaWZmSW5mb1NlcSgpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2RpZmZPcGVyYXRpb247XG5cdFx0cmV0dXJuIHRoaXMuX2RpZmZJbmZvLmdldCgpO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVEaWZmSW5mb1NlcShub3RpZnlBY3Rpb246ICdhY2NlcHRlZCcgfCAncmVqZWN0ZWQnIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgbXlEaWZmT3BlcmF0aW9uSWQgPSArK3RoaXMuX2RpZmZPcGVyYXRpb25JZHM7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuX2RpZmZPcGVyYXRpb24pO1xuXHRcdGNvbnN0IHByZXZpb3VzQ291bnQgPSB0aGlzLmxpbmVDaGFuZ2VDb3VudDtcblx0XHRjb25zdCBwcmV2aW91c0FkZGVkID0gdGhpcy5saW5lc0FkZGVkO1xuXHRcdGNvbnN0IHByZXZpb3VzUmVtb3ZlZCA9IHRoaXMubGluZXNSZW1vdmVkO1xuXHRcdGlmICh0aGlzLl9kaWZmT3BlcmF0aW9uSWRzID09PSBteURpZmZPcGVyYXRpb25JZCkge1xuXHRcdFx0Y29uc3QgdGhpc0RpZmZPcGVyYXRpb24gPSB0aGlzLl91cGRhdGVEaWZmSW5mbygpO1xuXHRcdFx0dGhpcy5fZGlmZk9wZXJhdGlvbiA9IHRoaXNEaWZmT3BlcmF0aW9uO1xuXHRcdFx0YXdhaXQgdGhpc0RpZmZPcGVyYXRpb247XG5cdFx0XHRpZiAobm90aWZ5QWN0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGFmZmVjdGVkTGluZXMgPSB7XG5cdFx0XHRcdFx0bGluZXNBZGRlZDogcHJldmlvdXNBZGRlZCAtIHRoaXMubGluZXNBZGRlZCxcblx0XHRcdFx0XHRsaW5lc1JlbW92ZWQ6IHByZXZpb3VzUmVtb3ZlZCAtIHRoaXMubGluZXNSZW1vdmVkLFxuXHRcdFx0XHRcdGxpbmVDb3VudDogcHJldmlvdXNDb3VudCAtIHRoaXMubGluZUNoYW5nZUNvdW50LFxuXHRcdFx0XHRcdGhhc1JlbWFpbmluZ0VkaXRzOiB0aGlzLmxpbmVDaGFuZ2VDb3VudCA+IDBcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5ub3RpZnlIdW5rQWN0aW9uKG5vdGlmeUFjdGlvbiwgYWZmZWN0ZWRMaW5lcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGhhc0h1bmtBdChyYW5nZTogSVJhbmdlKSB7XG5cdFx0Ly8gcmV0dXJuIHRydWUgaWYgdGhlIHJhbmdlIG92ZXJsYXBzIGEgZGlmZiByYW5nZVxuXHRcdHJldHVybiB0aGlzLl9kaWZmSW5mby5nZXQoKS5jaGFuZ2VzLnNvbWUoYyA9PiBjLm1vZGlmaWVkLmludGVyc2VjdHNTdHJpY3QoTGluZVJhbmdlLmZyb21SYW5nZUluY2x1c2l2ZShyYW5nZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZURpZmZJbmZvKCk6IFByb21pc2U8SURvY3VtZW50RGlmZiB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0aWYgKHRoaXMub3JpZ2luYWxNb2RlbC5pc0Rpc3Bvc2VkKCkgfHwgdGhpcy5tb2RpZmllZE1vZGVsLmlzRGlzcG9zZWQoKSB8fCB0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0YXRlLmdldCgpICE9PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSB7XG5cdFx0XHR0aGlzLl9kaWZmSW5mby5zZXQobnVsbERvY3VtZW50RGlmZiwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX29yaWdpbmFsVG9Nb2RpZmllZEVkaXQgPSBTdHJpbmdFZGl0LmVtcHR5O1xuXHRcdFx0cmV0dXJuIG51bGxEb2N1bWVudERpZmY7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZG9jVmVyc2lvbk5vdyA9IHRoaXMubW9kaWZpZWRNb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCBzbmFwc2hvdFZlcnNpb25Ob3cgPSB0aGlzLm9yaWdpbmFsTW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cblx0XHRjb25zdCBkaWZmID0gYXdhaXQgdGhpcy5fZWRpdG9yV29ya2VyU2VydmljZS5jb21wdXRlRGlmZihcblx0XHRcdHRoaXMub3JpZ2luYWxNb2RlbC51cmksXG5cdFx0XHR0aGlzLm1vZGlmaWVkTW9kZWwudXJpLFxuXHRcdFx0e1xuXHRcdFx0XHRpZ25vcmVUcmltV2hpdGVzcGFjZTogZmFsc2UsIC8vIE5FVkVSIGlnbm9yZSB3aGl0ZXNwYWNlIHNvIHRoYXQgdW5kby9hY2NlcHQgZWRpdHMgYXJlIGNvcnJlY3QgYW5kIHNvIHRoYXQgYWxsIGNoYW5nZXMgKDEgb2YgMikgYXJlIHNwZWxsZWQgb3V0XG5cdFx0XHRcdGNvbXB1dGVNb3ZlczogZmFsc2UsXG5cdFx0XHRcdG1heENvbXB1dGF0aW9uVGltZU1zOiAzMDAwXG5cdFx0XHR9LFxuXHRcdFx0J2FkdmFuY2VkJ1xuXHRcdCk7XG5cblx0XHRpZiAodGhpcy5vcmlnaW5hbE1vZGVsLmlzRGlzcG9zZWQoKSB8fCB0aGlzLm1vZGlmaWVkTW9kZWwuaXNEaXNwb3NlZCgpIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gb25seSB1cGRhdGUgdGhlIGRpZmYgaWYgdGhlIGRvY3VtZW50cyBkaWRuJ3QgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuXHRcdGlmICh0aGlzLm1vZGlmaWVkTW9kZWwuZ2V0VmVyc2lvbklkKCkgPT09IGRvY1ZlcnNpb25Ob3cgJiYgdGhpcy5vcmlnaW5hbE1vZGVsLmdldFZlcnNpb25JZCgpID09PSBzbmFwc2hvdFZlcnNpb25Ob3cpIHtcblx0XHRcdGNvbnN0IGRpZmYyID0gZGlmZiA/PyBudWxsRG9jdW1lbnREaWZmO1xuXHRcdFx0dGhpcy5fZGlmZkluZm8uc2V0KGRpZmYyLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fb3JpZ2luYWxUb01vZGlmaWVkRWRpdCA9IG9mZnNldEVkaXRGcm9tTGluZVJhbmdlTWFwcGluZyh0aGlzLm9yaWdpbmFsTW9kZWwsIHRoaXMubW9kaWZpZWRNb2RlbCwgZGlmZjIuY2hhbmdlcyk7XG5cdFx0XHRyZXR1cm4gZGlmZjI7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUIsaUJBQWlCO0FBQ2pELFNBQVMsY0FBYztBQUN2QixTQUFTLGlCQUFpQixrQkFBa0IsZUFBZTtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLFNBQXNCLHVCQUF1QjtBQUN0RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxxQkFBMkM7QUFDcEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGlCQUFpQjtBQUMxQixTQUF3Qix3QkFBd0I7QUFFaEQsU0FBUyxVQUFVLDRCQUE0QjtBQUMvQyxTQUEyRCxpQkFBaUIseUJBQXlCO0FBQ3JHLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsOEJBQThCLGdDQUFnQyxrQ0FBa0M7QUFDekcsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtQkFBd0M7QUFFakQsU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBS2pDLElBQU0sb0NBQU4sY0FBZ0QsV0FBVztBQUFBLEVBbUZqRSxZQUNrQixlQUNBLGVBQ0EsT0FDakIsMEJBQ3VDLHNCQUNPLDZCQUM3QztBQUNELFVBQU07QUFQVztBQUNBO0FBQ0E7QUFFc0I7QUFDTztBQXhEL0MsU0FBUSxnQkFBeUI7QUFJakMsU0FBUSxxQkFBOEI7QUFNdEMsU0FBUSxvQkFBNEI7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
