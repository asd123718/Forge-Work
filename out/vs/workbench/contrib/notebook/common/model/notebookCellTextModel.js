import { Emitter } from "../../../../../base/common/event.js";
import { hash, StringSHA1 } from "../../../../../base/common/hash.js";
import { Disposable, DisposableStore, dispose } from "../../../../../base/common/lifecycle.js";
import * as UUID from "../../../../../base/common/uuid.js";
import { Range } from "../../../../../editor/common/core/range.js";
import * as model from "../../../../../editor/common/model.js";
import { PieceTreeTextBuffer } from "../../../../../editor/common/model/pieceTreeTextBuffer/pieceTreeTextBuffer.js";
import { createTextBuffer } from "../../../../../editor/common/model/textModel.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../editor/common/languages/modesRegistry.js";
import { NotebookCellOutputTextModel } from "./notebookCellOutputTextModel.js";
import { CellKind } from "../notebookCommon.js";
import { ThrottledDelayer } from "../../../../../base/common/async.js";
import { toFormattedString } from "../../../../../base/common/jsonFormatter.js";
import { splitLines } from "../../../../../base/common/strings.js";
const _NotebookCellTextModel = class _NotebookCellTextModel extends Disposable {
  constructor(uri, handle, cell, transientOptions, _languageService, _defaultEOL, defaultCollapseConfig, _languageDetectionService = void 0, _notebookLoggingService) {
    super();
    this.uri = uri;
    this.handle = handle;
    this.transientOptions = transientOptions;
    this._languageService = _languageService;
    this._defaultEOL = _defaultEOL;
    this._languageDetectionService = _languageDetectionService;
    this._notebookLoggingService = _notebookLoggingService;
    this._onDidChangeTextModel = this._register(new Emitter());
    this.onDidChangeTextModel = this._onDidChangeTextModel.event;
    this._onDidChangeOutputs = this._register(new Emitter());
    this.onDidChangeOutputs = this._onDidChangeOutputs.event;
    this._onDidChangeOutputItems = this._register(new Emitter());
    this.onDidChangeOutputItems = this._onDidChangeOutputItems.event;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidChangeMetadata = this._register(new Emitter());
    this.onDidChangeMetadata = this._onDidChangeMetadata.event;
    this._onDidChangeInternalMetadata = this._register(new Emitter());
    this.onDidChangeInternalMetadata = this._onDidChangeInternalMetadata.event;
    this._onDidChangeLanguage = this._register(new Emitter());
    this.onDidChangeLanguage = this._onDidChangeLanguage.event;
    this._textBufferHash = null;
    this._hash = null;
    this._versionId = 1;
    this._alternativeId = 1;
    this._textModelDisposables = this._register(new DisposableStore());
    this._textModel = void 0;
    this.autoDetectLanguageThrottler = this._register(new ThrottledDelayer(_NotebookCellTextModel.AUTO_DETECT_LANGUAGE_THROTTLE_DELAY));
    this._autoLanguageDetectionEnabled = false;
    this._hasLanguageSetExplicitly = false;
    this._source = cell.source;
    this._language = cell.language;
    this._mime = cell.mime;
    this.cellKind = cell.cellKind;
    const defaultConfig = cell.cellKind === CellKind.Code ? defaultCollapseConfig?.codeCell : defaultCollapseConfig?.markupCell;
    this.collapseState = cell.collapseState ?? (defaultConfig ?? void 0);
    this._outputs = cell.outputs.map((op) => new NotebookCellOutputTextModel(op));
    this._metadata = cell.metadata ?? {};
    this._internalMetadata = cell.internalMetadata ?? {};
  }
  get outputs() {
    return this._outputs;
  }
  get metadata() {
    return this._metadata;
  }
  set metadata(newMetadata) {
    this._metadata = newMetadata;
    this._hash = null;
    this._onDidChangeMetadata.fire();
  }
  get internalMetadata() {
    return this._internalMetadata;
  }
  set internalMetadata(newInternalMetadata) {
    const lastRunSuccessChanged = this._internalMetadata.lastRunSuccess !== newInternalMetadata.lastRunSuccess;
    newInternalMetadata = {
      ...newInternalMetadata,
      ...{ runStartTimeAdjustment: computeRunStartTimeAdjustment(this._internalMetadata, newInternalMetadata) }
    };
    this._internalMetadata = newInternalMetadata;
    this._hash = null;
    this._onDidChangeInternalMetadata.fire({ lastRunSuccessChanged });
  }
  get language() {
    return this._language;
  }
  set language(newLanguage) {
    if (this._textModel && this._textModel.getLanguageId() === this._languageService.getLanguageIdByLanguageName(newLanguage) && this._textModel.getLanguageId() === this._languageService.getLanguageIdByLanguageName(this.language)) {
      return;
    }
    this._hasLanguageSetExplicitly = true;
    this._setLanguageInternal(newLanguage);
  }
  get mime() {
    return this._mime;
  }
  set mime(newMime) {
    if (this._mime === newMime) {
      return;
    }
    this._mime = newMime;
    this._hash = null;
    this._onDidChangeContent.fire("mime");
  }
  get textBuffer() {
    if (this._textBuffer) {
      return this._textBuffer;
    }
    this._textBuffer = this._register(createTextBuffer(this._source, this._defaultEOL).textBuffer);
    this._register(this._textBuffer.onDidChangeContent(() => {
      this._hash = null;
      if (!this._textModel) {
        this._onDidChangeContent.fire("content");
      }
      this.autoDetectLanguage();
    }));
    return this._textBuffer;
  }
  get alternativeId() {
    return this._alternativeId;
  }
  get textModel() {
    return this._textModel;
  }
  set textModel(m) {
    if (this._textModel === m) {
      return;
    }
    this._textModelDisposables.clear();
    this._textModel = m;
    if (this._textModel) {
      this.setRegisteredLanguage(this._languageService, this._textModel.getLanguageId(), this.language);
      this._textModelDisposables.add(this._textModel.onDidChangeLanguage((e) => this.setRegisteredLanguage(this._languageService, e.newLanguage, this.language)));
      this._textModelDisposables.add(this._textModel.onWillDispose(() => this.textModel = void 0));
      this._textModelDisposables.add(this._textModel.onDidChangeContent((e) => {
        if (this._textModel) {
          this._versionId = this._textModel.getVersionId();
          this._alternativeId = this._textModel.getAlternativeVersionId();
        }
        this._textBufferHash = null;
        this._onDidChangeContent.fire("content");
        this._onDidChangeContent.fire({ type: "model", event: e });
      }));
      this._textModel._overwriteVersionId(this._versionId);
      this._textModel._overwriteAlternativeVersionId(this._versionId);
      this._onDidChangeTextModel.fire();
    }
  }
  setRegisteredLanguage(languageService, newLanguage, currentLanguage) {
    const isFallBackLanguage = newLanguage === PLAINTEXT_LANGUAGE_ID || newLanguage === "jupyter";
    if (!languageService.isRegisteredLanguageId(currentLanguage) && isFallBackLanguage) {
      this._onDidChangeLanguage.fire(currentLanguage);
    } else {
      this.language = newLanguage;
    }
  }
  get hasLanguageSetExplicitly() {
    return this._hasLanguageSetExplicitly;
  }
  enableAutoLanguageDetection() {
    this._autoLanguageDetectionEnabled = true;
    this.autoDetectLanguage();
  }
  async autoDetectLanguage() {
    if (this._autoLanguageDetectionEnabled) {
      this.autoDetectLanguageThrottler.trigger(() => this._doAutoDetectLanguage());
    }
  }
  async _doAutoDetectLanguage() {
    if (this.hasLanguageSetExplicitly) {
      return;
    }
    const newLanguage = await this._languageDetectionService?.detectLanguage(this.uri);
    if (!newLanguage) {
      return;
    }
    if (this._textModel && this._textModel.getLanguageId() === this._languageService.getLanguageIdByLanguageName(newLanguage) && this._textModel.getLanguageId() === this._languageService.getLanguageIdByLanguageName(this.language)) {
      return;
    }
    this._setLanguageInternal(newLanguage);
  }
  _setLanguageInternal(newLanguage) {
    const newLanguageId = this._languageService.getLanguageIdByLanguageName(newLanguage);
    if (newLanguageId === null) {
      return;
    }
    if (this._textModel) {
      const languageId = this._languageService.createById(newLanguageId);
      this._textModel.setLanguage(languageId.languageId);
    }
    if (this._language === newLanguage) {
      return;
    }
    this._language = newLanguage;
    this._hash = null;
    this._onDidChangeLanguage.fire(newLanguage);
    this._onDidChangeContent.fire("language");
  }
  resetTextBuffer(textBuffer) {
    this._textBuffer = textBuffer;
  }
  getValue() {
    const fullRange = this.getFullModelRange();
    const eol = this.textBuffer.getEOL();
    if (eol === "\n") {
      return this.textBuffer.getValueInRange(fullRange, model.EndOfLinePreference.LF);
    } else {
      return this.textBuffer.getValueInRange(fullRange, model.EndOfLinePreference.CRLF);
    }
  }
  getTextBufferHash() {
    if (this._textBufferHash !== null) {
      return this._textBufferHash;
    }
    const shaComputer = new StringSHA1();
    const snapshot = this.textBuffer.createSnapshot(false);
    let text;
    while (text = snapshot.read()) {
      shaComputer.update(text);
    }
    this._textBufferHash = shaComputer.digest();
    return this._textBufferHash;
  }
  getHashValue() {
    if (this._hash !== null) {
      return this._hash;
    }
    this._hash = hash([hash(this.language), this.getTextBufferHash(), this._getPersisentMetadata(), this.transientOptions.transientOutputs ? [] : this._outputs.map((op) => ({
      outputs: op.outputs.map((output) => ({
        mime: output.mime,
        data: Array.from(output.data.buffer)
      })),
      metadata: op.metadata
    }))]);
    return this._hash;
  }
  _getPersisentMetadata() {
    return getFormattedMetadataJSON(this.transientOptions.transientCellMetadata, this.metadata, this.language);
  }
  getTextLength() {
    return this.textBuffer.getLength();
  }
  getFullModelRange() {
    const lineCount = this.textBuffer.getLineCount();
    return new Range(1, 1, lineCount, this.textBuffer.getLineLength(lineCount) + 1);
  }
  spliceNotebookCellOutputs(splice) {
    this._notebookLoggingService.trace("textModelEdits", `splicing outputs at ${splice.start} length: ${splice.deleteCount} with ${splice.newOutputs.length} new outputs`);
    if (splice.deleteCount > 0 && splice.newOutputs.length > 0) {
      const commonLen = Math.min(splice.deleteCount, splice.newOutputs.length);
      for (let i = 0; i < commonLen; i++) {
        const currentOutput = this.outputs[splice.start + i];
        const newOutput = splice.newOutputs[i];
        this.replaceOutput(currentOutput.outputId, newOutput);
      }
      const removed = this.outputs.splice(splice.start + commonLen, splice.deleteCount - commonLen, ...splice.newOutputs.slice(commonLen));
      removed.forEach((output) => output.dispose());
      this._onDidChangeOutputs.fire({ start: splice.start + commonLen, deleteCount: splice.deleteCount - commonLen, newOutputs: splice.newOutputs.slice(commonLen) });
    } else {
      const removed = this.outputs.splice(splice.start, splice.deleteCount, ...splice.newOutputs);
      removed.forEach((output) => output.dispose());
      this._onDidChangeOutputs.fire(splice);
    }
  }
  replaceOutput(outputId, newOutputItem) {
    const outputIndex = this.outputs.findIndex((output2) => output2.outputId === outputId);
    if (outputIndex < 0) {
      return false;
    }
    this._notebookLoggingService.trace("textModelEdits", `replacing an output item at index ${outputIndex}`);
    const output = this.outputs[outputIndex];
    output.replaceData({
      outputs: newOutputItem.outputs,
      outputId: newOutputItem.outputId,
      metadata: newOutputItem.metadata
    });
    newOutputItem.dispose();
    this._onDidChangeOutputItems.fire();
    return true;
  }
  changeOutputItems(outputId, append, items) {
    const outputIndex = this.outputs.findIndex((output2) => output2.outputId === outputId);
    if (outputIndex < 0) {
      return false;
    }
    const output = this.outputs[outputIndex];
    this._notebookLoggingService.trace("textModelEdits", `${append ? "appending" : "replacing"} ${items.length} output items to for output index ${outputIndex}`);
    if (append) {
      output.appendData(items);
    } else {
      output.replaceData({ outputId, outputs: items, metadata: output.metadata });
    }
    this._onDidChangeOutputItems.fire();
    return true;
  }
  _outputNotEqualFastCheck(left, right) {
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < this.outputs.length; i++) {
      const l = left[i];
      const r = right[i];
      if (l.outputs.length !== r.outputs.length) {
        return false;
      }
      for (let k = 0; k < l.outputs.length; k++) {
        if (l.outputs[k].mime !== r.outputs[k].mime) {
          return false;
        }
        if (l.outputs[k].data.byteLength !== r.outputs[k].data.byteLength) {
          return false;
        }
      }
    }
    return true;
  }
  equal(b) {
    if (this.language !== b.language) {
      return false;
    }
    if (this.outputs.length !== b.outputs.length) {
      return false;
    }
    if (this.getTextLength() !== b.getTextLength()) {
      return false;
    }
    if (!this.transientOptions.transientOutputs) {
      if (!this._outputNotEqualFastCheck(this.outputs, b.outputs)) {
        return false;
      }
    }
    return this.getHashValue() === b.getHashValue();
  }
  /**
   * Only compares
   * - language
   * - mime
   * - cellKind
   * - internal metadata (conditionally)
   * - source
   */
  fastEqual(b, ignoreMetadata) {
    if (this.language !== b.language) {
      return false;
    }
    if (this.mime !== b.mime) {
      return false;
    }
    if (this.cellKind !== b.cellKind) {
      return false;
    }
    if (!ignoreMetadata) {
      if (this.internalMetadata?.executionOrder !== b.internalMetadata?.executionOrder || this.internalMetadata?.lastRunSuccess !== b.internalMetadata?.lastRunSuccess || this.internalMetadata?.runStartTime !== b.internalMetadata?.runStartTime || this.internalMetadata?.runStartTimeAdjustment !== b.internalMetadata?.runStartTimeAdjustment || this.internalMetadata?.runEndTime !== b.internalMetadata?.runEndTime) {
        return false;
      }
    }
    if (this._textBuffer) {
      if (!_NotebookCellTextModel.linesAreEqual(this.textBuffer.getLinesContent(), b.source)) {
        return false;
      }
    } else if (this._source !== b.source) {
      return false;
    }
    return true;
  }
  static linesAreEqual(aLines, b) {
    const bLines = splitLines(b);
    if (aLines.length !== bLines.length) {
      return false;
    }
    for (let i = 0; i < aLines.length; i++) {
      if (aLines[i] !== bLines[i]) {
        return false;
      }
    }
    return true;
  }
  dispose() {
    dispose(this._outputs);
    const emptyDisposedTextBuffer = new PieceTreeTextBuffer([], "", "\n", false, false, true, true);
    emptyDisposedTextBuffer.dispose();
    this._textBuffer = emptyDisposedTextBuffer;
    super.dispose();
  }
};
_NotebookCellTextModel.AUTO_DETECT_LANGUAGE_THROTTLE_DELAY = 600;
let NotebookCellTextModel = _NotebookCellTextModel;
function cloneNotebookCellTextModel(cell) {
  return {
    source: cell.getValue(),
    language: cell.language,
    mime: cell.mime,
    cellKind: cell.cellKind,
    outputs: cell.outputs.map((output) => ({
      outputs: output.outputs,
      /* paste should generate new outputId */
      outputId: UUID.generateUuid()
    })),
    metadata: {}
  };
}
function computeRunStartTimeAdjustment(oldMetadata, newMetadata) {
  if (oldMetadata.runStartTime !== newMetadata.runStartTime && typeof newMetadata.runStartTime === "number") {
    const offset = Date.now() - newMetadata.runStartTime;
    return offset < 0 ? Math.abs(offset) : 0;
  } else {
    return newMetadata.runStartTimeAdjustment;
  }
}
function getFormattedMetadataJSON(transientCellMetadata, metadata, language, sortKeys) {
  let filteredMetadata = {};
  if (transientCellMetadata) {
    const keys = /* @__PURE__ */ new Set([...Object.keys(metadata)]);
    for (const key of keys) {
      if (!transientCellMetadata[key]) {
        filteredMetadata[key] = metadata[key];
      }
    }
  } else {
    filteredMetadata = metadata;
  }
  const obj = {
    language,
    ...filteredMetadata
  };
  if (language) {
    obj.language = language;
  }
  const metadataSource = toFormattedString(sortKeys ? sortObjectPropertiesRecursively(obj) : obj, {});
  return metadataSource;
}
function sortObjectPropertiesRecursively(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectPropertiesRecursively);
  }
  if (obj !== void 0 && obj !== null && typeof obj === "object" && Object.keys(obj).length > 0) {
    return Object.keys(obj).sort().reduce((sortedObj, prop) => {
      sortedObj[prop] = sortObjectPropertiesRecursively(obj[prop]);
      return sortedObj;
    }, {});
  }
  return obj;
}
export {
  NotebookCellTextModel,
  cloneNotebookCellTextModel,
  getFormattedMetadataJSON,
  sortObjectPropertiesRecursively
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxjb21tb25cXG1vZGVsXFxub3RlYm9va0NlbGxUZXh0TW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2gsIFN0cmluZ1NIQTEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgVVVJRCBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCAqIGFzIG1vZGVsIGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgUGllY2VUcmVlVGV4dEJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvcGllY2VUcmVlVGV4dEJ1ZmZlci9waWVjZVRyZWVUZXh0QnVmZmVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRCdWZmZXIsIFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbE91dHB1dFRleHRNb2RlbCB9IGZyb20gJy4vbm90ZWJvb2tDZWxsT3V0cHV0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxJbnRlcm5hbE1ldGFkYXRhQ2hhbmdlZEV2ZW50LCBDZWxsS2luZCwgSUNlbGwsIElDZWxsRHRvMiwgSUNlbGxPdXRwdXQsIElPdXRwdXRJdGVtRHRvLCBOb3RlYm9va0NlbGxDb2xsYXBzZVN0YXRlLCBOb3RlYm9va0NlbGxEZWZhdWx0Q29sbGFwc2VDb25maWcsIE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEsIE5vdGVib29rQ2VsbE1ldGFkYXRhLCBOb3RlYm9va0NlbGxPdXRwdXRzU3BsaWNlLCBUcmFuc2llbnRDZWxsTWV0YWRhdGEsIFRyYW5zaWVudE9wdGlvbnMgfSBmcm9tICcuLi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xhbmd1YWdlRGV0ZWN0aW9uL2NvbW1vbi9sYW5ndWFnZURldGVjdGlvbldvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdG9Gb3JtYXR0ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRm9ybWF0dGVyLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSB9IGZyb20gJy4uL25vdGVib29rTG9nZ2luZ1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tDZWxsVGV4dE1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDZWxsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUZXh0TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUZXh0TW9kZWw6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VUZXh0TW9kZWwuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlT3V0cHV0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU91dHB1dHM6IEV2ZW50PE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2U+ID0gdGhpcy5fb25EaWRDaGFuZ2VPdXRwdXRzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlT3V0cHV0SXRlbXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPdXRwdXRJdGVtczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZU91dHB1dEl0ZW1zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPCdjb250ZW50JyB8ICdsYW5ndWFnZScgfCAnbWltZScgfCB7IHR5cGU6ICdtb2RlbCc7IGV2ZW50OiBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQ6IEV2ZW50PCdjb250ZW50JyB8ICdsYW5ndWFnZScgfCAnbWltZScgfCB7IHR5cGU6ICdtb2RlbCc7IGV2ZW50OiBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTWV0YWRhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNZXRhZGF0YTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZU1ldGFkYXRhLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW50ZXJuYWxNZXRhZGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENlbGxJbnRlcm5hbE1ldGFkYXRhQ2hhbmdlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJbnRlcm5hbE1ldGFkYXRhOiBFdmVudDxDZWxsSW50ZXJuYWxNZXRhZGF0YUNoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUludGVybmFsTWV0YWRhdGEuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYW5ndWFnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2U6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZENoYW5nZUxhbmd1YWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX291dHB1dHM6IE5vdGVib29rQ2VsbE91dHB1dFRleHRNb2RlbFtdO1xuXG5cdGdldCBvdXRwdXRzKCk6IElDZWxsT3V0cHV0W10ge1xuXHRcdHJldHVybiB0aGlzLl9vdXRwdXRzO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhO1xuXG5cdGdldCBtZXRhZGF0YSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbWV0YWRhdGE7XG5cdH1cblxuXHRzZXQgbWV0YWRhdGEobmV3TWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhKSB7XG5cdFx0dGhpcy5fbWV0YWRhdGEgPSBuZXdNZXRhZGF0YTtcblx0XHR0aGlzLl9oYXNoID0gbnVsbDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1ldGFkYXRhLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2ludGVybmFsTWV0YWRhdGE6IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE7XG5cblx0Z2V0IGludGVybmFsTWV0YWRhdGEoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2ludGVybmFsTWV0YWRhdGE7XG5cdH1cblxuXHRzZXQgaW50ZXJuYWxNZXRhZGF0YShuZXdJbnRlcm5hbE1ldGFkYXRhOiBOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhKSB7XG5cdFx0Y29uc3QgbGFzdFJ1blN1Y2Nlc3NDaGFuZ2VkID0gdGhpcy5faW50ZXJuYWxNZXRhZGF0YS5sYXN0UnVuU3VjY2VzcyAhPT0gbmV3SW50ZXJuYWxNZXRhZGF0YS5sYXN0UnVuU3VjY2Vzcztcblx0XHRuZXdJbnRlcm5hbE1ldGFkYXRhID0ge1xuXHRcdFx0Li4ubmV3SW50ZXJuYWxNZXRhZGF0YSxcblx0XHRcdC4uLnsgcnVuU3RhcnRUaW1lQWRqdXN0bWVudDogY29tcHV0ZVJ1blN0YXJ0VGltZUFkanVzdG1lbnQodGhpcy5faW50ZXJuYWxNZXRhZGF0YSwgbmV3SW50ZXJuYWxNZXRhZGF0YSkgfVxuXHRcdH07XG5cdFx0dGhpcy5faW50ZXJuYWxNZXRhZGF0YSA9IG5ld0ludGVybmFsTWV0YWRhdGE7XG5cdFx0dGhpcy5faGFzaCA9IG51bGw7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnRlcm5hbE1ldGFkYXRhLmZpcmUoeyBsYXN0UnVuU3VjY2Vzc0NoYW5nZWQgfSk7XG5cdH1cblxuXHRnZXQgbGFuZ3VhZ2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhbmd1YWdlO1xuXHR9XG5cblx0c2V0IGxhbmd1YWdlKG5ld0xhbmd1YWdlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fdGV4dE1vZGVsXG5cdFx0XHQvLyAxLiB0aGUgbGFuZ3VhZ2UgdXBkYXRlIGlzIGZyb20gd29ya3NwYWNlIGVkaXQsIGNoZWNraW5nIGlmIGl0J3MgdGhlIHNhbWUgYXMgdGV4dCBtb2RlbCdzIG1vZGVcblx0XHRcdCYmIHRoaXMuX3RleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCkgPT09IHRoaXMuX2xhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUobmV3TGFuZ3VhZ2UpXG5cdFx0XHQvLyAyLiB0aGUgdGV4dCBtb2RlbCdzIG1vZGUgbWlnaHQgYmUgdGhlIHNhbWUgYXMgdGhlIGB0aGlzLmxhbmd1YWdlYCwgZXZlbiBpZiB0aGUgbGFuZ3VhZ2UgZnJpZW5kbHkgbmFtZSBpcyBub3QgdGhlIHNhbWUsIHdlIHNob3VsZCBub3QgdHJpZ2dlciBhbiB1cGRhdGVcblx0XHRcdCYmIHRoaXMuX3RleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCkgPT09IHRoaXMuX2xhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUodGhpcy5sYW5ndWFnZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdHRoaXMuX2hhc0xhbmd1YWdlU2V0RXhwbGljaXRseSA9IHRydWU7XG5cdFx0dGhpcy5fc2V0TGFuZ3VhZ2VJbnRlcm5hbChuZXdMYW5ndWFnZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1pbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbWltZTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgbWltZShuZXdNaW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5fbWltZSA9PT0gbmV3TWltZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9taW1lID0gbmV3TWltZTtcblx0XHR0aGlzLl9oYXNoID0gbnVsbDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgnbWltZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdGV4dEJ1ZmZlciE6IG1vZGVsLklUZXh0QnVmZmVyO1xuXG5cdGdldCB0ZXh0QnVmZmVyKCkge1xuXHRcdGlmICh0aGlzLl90ZXh0QnVmZmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdGV4dEJ1ZmZlcjtcblx0XHR9XG5cblx0XHR0aGlzLl90ZXh0QnVmZmVyID0gdGhpcy5fcmVnaXN0ZXIoY3JlYXRlVGV4dEJ1ZmZlcih0aGlzLl9zb3VyY2UsIHRoaXMuX2RlZmF1bHRFT0wpLnRleHRCdWZmZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGV4dEJ1ZmZlci5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5faGFzaCA9IG51bGw7XG5cdFx0XHRpZiAoIXRoaXMuX3RleHRNb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgnY29udGVudCcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5hdXRvRGV0ZWN0TGFuZ3VhZ2UoKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gdGhpcy5fdGV4dEJ1ZmZlcjtcblx0fVxuXG5cdHByaXZhdGUgX3RleHRCdWZmZXJIYXNoOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfaGFzaDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSBfdmVyc2lvbklkOiBudW1iZXIgPSAxO1xuXHRwcml2YXRlIF9hbHRlcm5hdGl2ZUlkOiBudW1iZXIgPSAxO1xuXHRnZXQgYWx0ZXJuYXRpdmVJZCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9hbHRlcm5hdGl2ZUlkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF90ZXh0TW9kZWw6IFRleHRNb2RlbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IHRleHRNb2RlbCgpOiBUZXh0TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90ZXh0TW9kZWw7XG5cdH1cblxuXHRzZXQgdGV4dE1vZGVsKG06IFRleHRNb2RlbCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl90ZXh0TW9kZWwgPT09IG0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl90ZXh0TW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3RleHRNb2RlbCA9IG07XG5cdFx0aWYgKHRoaXMuX3RleHRNb2RlbCkge1xuXHRcdFx0dGhpcy5zZXRSZWdpc3RlcmVkTGFuZ3VhZ2UodGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLl90ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCB0aGlzLmxhbmd1YWdlKTtcblxuXHRcdFx0Ly8gTGlzdGVuIHRvIGxhbmd1YWdlIGNoYW5nZXMgb24gdGhlIG1vZGVsXG5cdFx0XHR0aGlzLl90ZXh0TW9kZWxEaXNwb3NhYmxlcy5hZGQodGhpcy5fdGV4dE1vZGVsLm9uRGlkQ2hhbmdlTGFuZ3VhZ2UoKGUpID0+IHRoaXMuc2V0UmVnaXN0ZXJlZExhbmd1YWdlKHRoaXMuX2xhbmd1YWdlU2VydmljZSwgZS5uZXdMYW5ndWFnZSwgdGhpcy5sYW5ndWFnZSkpKTtcblx0XHRcdHRoaXMuX3RleHRNb2RlbERpc3Bvc2FibGVzLmFkZCh0aGlzLl90ZXh0TW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiB0aGlzLnRleHRNb2RlbCA9IHVuZGVmaW5lZCkpO1xuXHRcdFx0dGhpcy5fdGV4dE1vZGVsRGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RleHRNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3RleHRNb2RlbCkge1xuXHRcdFx0XHRcdHRoaXMuX3ZlcnNpb25JZCA9IHRoaXMuX3RleHRNb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHRcdFx0XHR0aGlzLl9hbHRlcm5hdGl2ZUlkID0gdGhpcy5fdGV4dE1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdGV4dEJ1ZmZlckhhc2ggPSBudWxsO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgnY29udGVudCcpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSh7IHR5cGU6ICdtb2RlbCcsIGV2ZW50OiBlIH0pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl90ZXh0TW9kZWwuX292ZXJ3cml0ZVZlcnNpb25JZCh0aGlzLl92ZXJzaW9uSWQpO1xuXHRcdFx0dGhpcy5fdGV4dE1vZGVsLl9vdmVyd3JpdGVBbHRlcm5hdGl2ZVZlcnNpb25JZCh0aGlzLl92ZXJzaW9uSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUZXh0TW9kZWwuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0UmVnaXN0ZXJlZExhbmd1YWdlKGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgbmV3TGFuZ3VhZ2U6IHN0cmluZywgY3VycmVudExhbmd1YWdlOiBzdHJpbmcpIHtcblx0XHQvLyBUaGUgbGFuZ3VhZ2UgZGVmaW5lZCBpbiB0aGUgY2VsbCBtaWdodCBub3QgYmUgc3VwcG9ydGVkIGluIHRoZSBlZGl0b3Igc28gdGhlIHRleHQgbW9kZWwgbWlnaHQgYmUgdXNpbmcgdGhlIGRlZmF1bHQgZmFsbGJhY2tcblx0XHQvLyBJZiBzbyBsZXQncyBub3QgbW9kaWZ5IHRoZSBsYW5ndWFnZVxuXHRcdGNvbnN0IGlzRmFsbEJhY2tMYW5ndWFnZSA9IChuZXdMYW5ndWFnZSA9PT0gUExBSU5URVhUX0xBTkdVQUdFX0lEIHx8IG5ld0xhbmd1YWdlID09PSAnanVweXRlcicpO1xuXHRcdGlmICghbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQoY3VycmVudExhbmd1YWdlKSAmJiBpc0ZhbGxCYWNrTGFuZ3VhZ2UpIHtcblx0XHRcdC8vIG5vdGlmeSB0byBkaXNwbGF5IHdhcm5pbmcsIGJ1dCBkb24ndCBjaGFuZ2UgdGhlIGxhbmd1YWdlXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxhbmd1YWdlLmZpcmUoY3VycmVudExhbmd1YWdlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sYW5ndWFnZSA9IG5ld0xhbmd1YWdlO1xuXHRcdH1cblx0fVxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBBVVRPX0RFVEVDVF9MQU5HVUFHRV9USFJPVFRMRV9ERUxBWSA9IDYwMDtcblx0cHJpdmF0ZSByZWFkb25seSBhdXRvRGV0ZWN0TGFuZ3VhZ2VUaHJvdHRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcjx2b2lkPihOb3RlYm9va0NlbGxUZXh0TW9kZWwuQVVUT19ERVRFQ1RfTEFOR1VBR0VfVEhST1RUTEVfREVMQVkpKTtcblx0cHJpdmF0ZSBfYXV0b0xhbmd1YWdlRGV0ZWN0aW9uRW5hYmxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9oYXNMYW5ndWFnZVNldEV4cGxpY2l0bHk6IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IGhhc0xhbmd1YWdlU2V0RXhwbGljaXRseSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hhc0xhbmd1YWdlU2V0RXhwbGljaXRseTsgfVxuXG5cdHByaXZhdGUgX3NvdXJjZTogc3RyaW5nO1xuXHRwcml2YXRlIF9sYW5ndWFnZTogc3RyaW5nO1xuXHRwcml2YXRlIF9taW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBjZWxsS2luZDogQ2VsbEtpbmQ7XG5cdHB1YmxpYyByZWFkb25seSBjb2xsYXBzZVN0YXRlOiBOb3RlYm9va0NlbGxDb2xsYXBzZVN0YXRlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHVyaTogVVJJLFxuXHRcdHB1YmxpYyByZWFkb25seSBoYW5kbGU6IG51bWJlcixcblx0XHRjZWxsOiBJQ2VsbER0bzIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRyYW5zaWVudE9wdGlvbnM6IFRyYW5zaWVudE9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRFT0w6IG1vZGVsLkRlZmF1bHRFbmRPZkxpbmUsXG5cdFx0ZGVmYXVsdENvbGxhcHNlQ29uZmlnOiBOb3RlYm9va0NlbGxEZWZhdWx0Q29sbGFwc2VDb25maWcgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rTG9nZ2luZ1NlcnZpY2U6IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc291cmNlID0gY2VsbC5zb3VyY2U7XG5cdFx0dGhpcy5fbGFuZ3VhZ2UgPSBjZWxsLmxhbmd1YWdlO1xuXHRcdHRoaXMuX21pbWUgPSBjZWxsLm1pbWU7XG5cdFx0dGhpcy5jZWxsS2luZCA9IGNlbGwuY2VsbEtpbmQ7XG5cdFx0Ly8gQ29tcHV0ZSBjb2xsYXBzZSBzdGF0ZTogdXNlIGNlbGwncyBzdGF0ZSBpZiBwcm92aWRlZCwgb3RoZXJ3aXNlIHVzZSBkZWZhdWx0IGNvbmZpZyBmb3IgdGhpcyBjZWxsIGtpbmRcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlnID0gY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuQ29kZSA/IGRlZmF1bHRDb2xsYXBzZUNvbmZpZz8uY29kZUNlbGwgOiBkZWZhdWx0Q29sbGFwc2VDb25maWc/Lm1hcmt1cENlbGw7XG5cdFx0dGhpcy5jb2xsYXBzZVN0YXRlID0gY2VsbC5jb2xsYXBzZVN0YXRlID8/IChkZWZhdWx0Q29uZmlnID8/IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fb3V0cHV0cyA9IGNlbGwub3V0cHV0cy5tYXAob3AgPT4gbmV3IE5vdGVib29rQ2VsbE91dHB1dFRleHRNb2RlbChvcCkpO1xuXHRcdHRoaXMuX21ldGFkYXRhID0gY2VsbC5tZXRhZGF0YSA/PyB7fTtcblx0XHR0aGlzLl9pbnRlcm5hbE1ldGFkYXRhID0gY2VsbC5pbnRlcm5hbE1ldGFkYXRhID8/IHt9O1xuXHR9XG5cblx0ZW5hYmxlQXV0b0xhbmd1YWdlRGV0ZWN0aW9uKCkge1xuXHRcdHRoaXMuX2F1dG9MYW5ndWFnZURldGVjdGlvbkVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMuYXV0b0RldGVjdExhbmd1YWdlKCk7XG5cdH1cblxuXHRhc3luYyBhdXRvRGV0ZWN0TGFuZ3VhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2F1dG9MYW5ndWFnZURldGVjdGlvbkVuYWJsZWQpIHtcblx0XHRcdHRoaXMuYXV0b0RldGVjdExhbmd1YWdlVGhyb3R0bGVyLnRyaWdnZXIoKCkgPT4gdGhpcy5fZG9BdXRvRGV0ZWN0TGFuZ3VhZ2UoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9BdXRvRGV0ZWN0TGFuZ3VhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaGFzTGFuZ3VhZ2VTZXRFeHBsaWNpdGx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3TGFuZ3VhZ2UgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZURldGVjdGlvblNlcnZpY2U/LmRldGVjdExhbmd1YWdlKHRoaXMudXJpKTtcblx0XHRpZiAoIW5ld0xhbmd1YWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3RleHRNb2RlbFxuXHRcdFx0JiYgdGhpcy5fdGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSA9PT0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZShuZXdMYW5ndWFnZSlcblx0XHRcdCYmIHRoaXMuX3RleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCkgPT09IHRoaXMuX2xhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUodGhpcy5sYW5ndWFnZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXRMYW5ndWFnZUludGVybmFsKG5ld0xhbmd1YWdlKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldExhbmd1YWdlSW50ZXJuYWwobmV3TGFuZ3VhZ2U6IHN0cmluZykge1xuXHRcdGNvbnN0IG5ld0xhbmd1YWdlSWQgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKG5ld0xhbmd1YWdlKTtcblxuXHRcdGlmIChuZXdMYW5ndWFnZUlkID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3RleHRNb2RlbCkge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKG5ld0xhbmd1YWdlSWQpO1xuXHRcdFx0dGhpcy5fdGV4dE1vZGVsLnNldExhbmd1YWdlKGxhbmd1YWdlSWQubGFuZ3VhZ2VJZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2xhbmd1YWdlID09PSBuZXdMYW5ndWFnZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhbmd1YWdlID0gbmV3TGFuZ3VhZ2U7XG5cdFx0dGhpcy5faGFzaCA9IG51bGw7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VMYW5ndWFnZS5maXJlKG5ld0xhbmd1YWdlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgnbGFuZ3VhZ2UnKTtcblx0fVxuXG5cdHJlc2V0VGV4dEJ1ZmZlcih0ZXh0QnVmZmVyOiBtb2RlbC5JVGV4dEJ1ZmZlcikge1xuXHRcdHRoaXMuX3RleHRCdWZmZXIgPSB0ZXh0QnVmZmVyO1xuXHR9XG5cblx0Z2V0VmFsdWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBmdWxsUmFuZ2UgPSB0aGlzLmdldEZ1bGxNb2RlbFJhbmdlKCk7XG5cdFx0Y29uc3QgZW9sID0gdGhpcy50ZXh0QnVmZmVyLmdldEVPTCgpO1xuXHRcdGlmIChlb2wgPT09ICdcXG4nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50ZXh0QnVmZmVyLmdldFZhbHVlSW5SYW5nZShmdWxsUmFuZ2UsIG1vZGVsLkVuZE9mTGluZVByZWZlcmVuY2UuTEYpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50ZXh0QnVmZmVyLmdldFZhbHVlSW5SYW5nZShmdWxsUmFuZ2UsIG1vZGVsLkVuZE9mTGluZVByZWZlcmVuY2UuQ1JMRik7XG5cdFx0fVxuXHR9XG5cblx0Z2V0VGV4dEJ1ZmZlckhhc2goKSB7XG5cdFx0aWYgKHRoaXMuX3RleHRCdWZmZXJIYXNoICE9PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdGV4dEJ1ZmZlckhhc2g7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hhQ29tcHV0ZXIgPSBuZXcgU3RyaW5nU0hBMSgpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gdGhpcy50ZXh0QnVmZmVyLmNyZWF0ZVNuYXBzaG90KGZhbHNlKTtcblx0XHRsZXQgdGV4dDogc3RyaW5nIHwgbnVsbDtcblx0XHR3aGlsZSAoKHRleHQgPSBzbmFwc2hvdC5yZWFkKCkpKSB7XG5cdFx0XHRzaGFDb21wdXRlci51cGRhdGUodGV4dCk7XG5cdFx0fVxuXHRcdHRoaXMuX3RleHRCdWZmZXJIYXNoID0gc2hhQ29tcHV0ZXIuZGlnZXN0KCk7XG5cdFx0cmV0dXJuIHRoaXMuX3RleHRCdWZmZXJIYXNoO1xuXHR9XG5cblx0Z2V0SGFzaFZhbHVlKCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2hhc2ggIT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0aGlzLl9oYXNoO1xuXHRcdH1cblxuXHRcdHRoaXMuX2hhc2ggPSBoYXNoKFtoYXNoKHRoaXMubGFuZ3VhZ2UpLCB0aGlzLmdldFRleHRCdWZmZXJIYXNoKCksIHRoaXMuX2dldFBlcnNpc2VudE1ldGFkYXRhKCksIHRoaXMudHJhbnNpZW50T3B0aW9ucy50cmFuc2llbnRPdXRwdXRzID8gW10gOiB0aGlzLl9vdXRwdXRzLm1hcChvcCA9PiAoe1xuXHRcdFx0b3V0cHV0czogb3Aub3V0cHV0cy5tYXAob3V0cHV0ID0+ICh7XG5cdFx0XHRcdG1pbWU6IG91dHB1dC5taW1lLFxuXHRcdFx0XHRkYXRhOiBBcnJheS5mcm9tKG91dHB1dC5kYXRhLmJ1ZmZlcilcblx0XHRcdH0pKSxcblx0XHRcdG1ldGFkYXRhOiBvcC5tZXRhZGF0YVxuXHRcdH0pKV0pO1xuXHRcdHJldHVybiB0aGlzLl9oYXNoO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UGVyc2lzZW50TWV0YWRhdGEoKSB7XG5cdFx0cmV0dXJuIGdldEZvcm1hdHRlZE1ldGFkYXRhSlNPTih0aGlzLnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50Q2VsbE1ldGFkYXRhLCB0aGlzLm1ldGFkYXRhLCB0aGlzLmxhbmd1YWdlKTtcblx0fVxuXG5cdGdldFRleHRMZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50ZXh0QnVmZmVyLmdldExlbmd0aCgpO1xuXHR9XG5cblx0Z2V0RnVsbE1vZGVsUmFuZ2UoKSB7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gdGhpcy50ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpO1xuXHRcdHJldHVybiBuZXcgUmFuZ2UoMSwgMSwgbGluZUNvdW50LCB0aGlzLnRleHRCdWZmZXIuZ2V0TGluZUxlbmd0aChsaW5lQ291bnQpICsgMSk7XG5cdH1cblxuXHRzcGxpY2VOb3RlYm9va0NlbGxPdXRwdXRzKHNwbGljZTogTm90ZWJvb2tDZWxsT3V0cHV0c1NwbGljZSk6IHZvaWQge1xuXHRcdHRoaXMuX25vdGVib29rTG9nZ2luZ1NlcnZpY2UudHJhY2UoJ3RleHRNb2RlbEVkaXRzJywgYHNwbGljaW5nIG91dHB1dHMgYXQgJHtzcGxpY2Uuc3RhcnR9IGxlbmd0aDogJHtzcGxpY2UuZGVsZXRlQ291bnR9IHdpdGggJHtzcGxpY2UubmV3T3V0cHV0cy5sZW5ndGh9IG5ldyBvdXRwdXRzYCk7XG5cdFx0aWYgKHNwbGljZS5kZWxldGVDb3VudCA+IDAgJiYgc3BsaWNlLm5ld091dHB1dHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgY29tbW9uTGVuID0gTWF0aC5taW4oc3BsaWNlLmRlbGV0ZUNvdW50LCBzcGxpY2UubmV3T3V0cHV0cy5sZW5ndGgpO1xuXHRcdFx0Ly8gdXBkYXRlXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNvbW1vbkxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRPdXRwdXQgPSB0aGlzLm91dHB1dHNbc3BsaWNlLnN0YXJ0ICsgaV07XG5cdFx0XHRcdGNvbnN0IG5ld091dHB1dCA9IHNwbGljZS5uZXdPdXRwdXRzW2ldO1xuXG5cdFx0XHRcdHRoaXMucmVwbGFjZU91dHB1dChjdXJyZW50T3V0cHV0Lm91dHB1dElkLCBuZXdPdXRwdXQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZW1vdmVkID0gdGhpcy5vdXRwdXRzLnNwbGljZShzcGxpY2Uuc3RhcnQgKyBjb21tb25MZW4sIHNwbGljZS5kZWxldGVDb3VudCAtIGNvbW1vbkxlbiwgLi4uc3BsaWNlLm5ld091dHB1dHMuc2xpY2UoY29tbW9uTGVuKSk7XG5cdFx0XHRyZW1vdmVkLmZvckVhY2gob3V0cHV0ID0+IG91dHB1dC5kaXNwb3NlKCkpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VPdXRwdXRzLmZpcmUoeyBzdGFydDogc3BsaWNlLnN0YXJ0ICsgY29tbW9uTGVuLCBkZWxldGVDb3VudDogc3BsaWNlLmRlbGV0ZUNvdW50IC0gY29tbW9uTGVuLCBuZXdPdXRwdXRzOiBzcGxpY2UubmV3T3V0cHV0cy5zbGljZShjb21tb25MZW4pIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZW1vdmVkID0gdGhpcy5vdXRwdXRzLnNwbGljZShzcGxpY2Uuc3RhcnQsIHNwbGljZS5kZWxldGVDb3VudCwgLi4uc3BsaWNlLm5ld091dHB1dHMpO1xuXHRcdFx0cmVtb3ZlZC5mb3JFYWNoKG91dHB1dCA9PiBvdXRwdXQuZGlzcG9zZSgpKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlT3V0cHV0cy5maXJlKHNwbGljZSk7XG5cdFx0fVxuXHR9XG5cblx0cmVwbGFjZU91dHB1dChvdXRwdXRJZDogc3RyaW5nLCBuZXdPdXRwdXRJdGVtOiBJQ2VsbE91dHB1dCkge1xuXHRcdGNvbnN0IG91dHB1dEluZGV4ID0gdGhpcy5vdXRwdXRzLmZpbmRJbmRleChvdXRwdXQgPT4gb3V0cHV0Lm91dHB1dElkID09PSBvdXRwdXRJZCk7XG5cblx0XHRpZiAob3V0cHV0SW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90ZWJvb2tMb2dnaW5nU2VydmljZS50cmFjZSgndGV4dE1vZGVsRWRpdHMnLCBgcmVwbGFjaW5nIGFuIG91dHB1dCBpdGVtIGF0IGluZGV4ICR7b3V0cHV0SW5kZXh9YCk7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gdGhpcy5vdXRwdXRzW291dHB1dEluZGV4XTtcblx0XHQvLyBjb252ZXJ0IHRvIGR0byBhbmQgZGlzcG9zZSB0aGUgY2VsbCBvdXRwdXQgbW9kZWxcblx0XHRvdXRwdXQucmVwbGFjZURhdGEoe1xuXHRcdFx0b3V0cHV0czogbmV3T3V0cHV0SXRlbS5vdXRwdXRzLFxuXHRcdFx0b3V0cHV0SWQ6IG5ld091dHB1dEl0ZW0ub3V0cHV0SWQsXG5cdFx0XHRtZXRhZGF0YTogbmV3T3V0cHV0SXRlbS5tZXRhZGF0YVxuXHRcdH0pO1xuXHRcdG5ld091dHB1dEl0ZW0uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlT3V0cHV0SXRlbXMuZmlyZSgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y2hhbmdlT3V0cHV0SXRlbXMob3V0cHV0SWQ6IHN0cmluZywgYXBwZW5kOiBib29sZWFuLCBpdGVtczogSU91dHB1dEl0ZW1EdG9bXSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG91dHB1dEluZGV4ID0gdGhpcy5vdXRwdXRzLmZpbmRJbmRleChvdXRwdXQgPT4gb3V0cHV0Lm91dHB1dElkID09PSBvdXRwdXRJZCk7XG5cblx0XHRpZiAob3V0cHV0SW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3V0cHV0ID0gdGhpcy5vdXRwdXRzW291dHB1dEluZGV4XTtcblx0XHR0aGlzLl9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlLnRyYWNlKCd0ZXh0TW9kZWxFZGl0cycsIGAke2FwcGVuZCA/ICdhcHBlbmRpbmcnIDogJ3JlcGxhY2luZyd9ICR7aXRlbXMubGVuZ3RofSBvdXRwdXQgaXRlbXMgdG8gZm9yIG91dHB1dCBpbmRleCAke291dHB1dEluZGV4fWApO1xuXHRcdGlmIChhcHBlbmQpIHtcblx0XHRcdG91dHB1dC5hcHBlbmREYXRhKGl0ZW1zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3V0cHV0LnJlcGxhY2VEYXRhKHsgb3V0cHV0SWQ6IG91dHB1dElkLCBvdXRwdXRzOiBpdGVtcywgbWV0YWRhdGE6IG91dHB1dC5tZXRhZGF0YSB9KTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPdXRwdXRJdGVtcy5maXJlKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9vdXRwdXROb3RFcXVhbEZhc3RDaGVjayhsZWZ0OiBJQ2VsbE91dHB1dFtdLCByaWdodDogSUNlbGxPdXRwdXRbXSkge1xuXHRcdGlmIChsZWZ0Lmxlbmd0aCAhPT0gcmlnaHQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm91dHB1dHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGwgPSBsZWZ0W2ldO1xuXHRcdFx0Y29uc3QgciA9IHJpZ2h0W2ldO1xuXG5cdFx0XHRpZiAobC5vdXRwdXRzLmxlbmd0aCAhPT0gci5vdXRwdXRzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGsgPSAwOyBrIDwgbC5vdXRwdXRzLmxlbmd0aDsgaysrKSB7XG5cdFx0XHRcdGlmIChsLm91dHB1dHNba10ubWltZSAhPT0gci5vdXRwdXRzW2tdLm1pbWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobC5vdXRwdXRzW2tdLmRhdGEuYnl0ZUxlbmd0aCAhPT0gci5vdXRwdXRzW2tdLmRhdGEuYnl0ZUxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0ZXF1YWwoYjogTm90ZWJvb2tDZWxsVGV4dE1vZGVsKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMubGFuZ3VhZ2UgIT09IGIubGFuZ3VhZ2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vdXRwdXRzLmxlbmd0aCAhPT0gYi5vdXRwdXRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdldFRleHRMZW5ndGgoKSAhPT0gYi5nZXRUZXh0TGVuZ3RoKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMudHJhbnNpZW50T3B0aW9ucy50cmFuc2llbnRPdXRwdXRzKSB7XG5cdFx0XHQvLyBjb21wYXJlIG91dHB1dHNcblxuXHRcdFx0aWYgKCF0aGlzLl9vdXRwdXROb3RFcXVhbEZhc3RDaGVjayh0aGlzLm91dHB1dHMsIGIub3V0cHV0cykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldEhhc2hWYWx1ZSgpID09PSBiLmdldEhhc2hWYWx1ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9ubHkgY29tcGFyZXNcblx0ICogLSBsYW5ndWFnZVxuXHQgKiAtIG1pbWVcblx0ICogLSBjZWxsS2luZFxuXHQgKiAtIGludGVybmFsIG1ldGFkYXRhIChjb25kaXRpb25hbGx5KVxuXHQgKiAtIHNvdXJjZVxuXHQgKi9cblx0ZmFzdEVxdWFsKGI6IElDZWxsRHRvMiwgaWdub3JlTWV0YWRhdGE6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5sYW5ndWFnZSAhPT0gYi5sYW5ndWFnZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm1pbWUgIT09IGIubWltZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNlbGxLaW5kICE9PSBiLmNlbGxLaW5kKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCFpZ25vcmVNZXRhZGF0YSkge1xuXHRcdFx0aWYgKHRoaXMuaW50ZXJuYWxNZXRhZGF0YT8uZXhlY3V0aW9uT3JkZXIgIT09IGIuaW50ZXJuYWxNZXRhZGF0YT8uZXhlY3V0aW9uT3JkZXJcblx0XHRcdFx0fHwgdGhpcy5pbnRlcm5hbE1ldGFkYXRhPy5sYXN0UnVuU3VjY2VzcyAhPT0gYi5pbnRlcm5hbE1ldGFkYXRhPy5sYXN0UnVuU3VjY2Vzc1xuXHRcdFx0XHR8fCB0aGlzLmludGVybmFsTWV0YWRhdGE/LnJ1blN0YXJ0VGltZSAhPT0gYi5pbnRlcm5hbE1ldGFkYXRhPy5ydW5TdGFydFRpbWVcblx0XHRcdFx0fHwgdGhpcy5pbnRlcm5hbE1ldGFkYXRhPy5ydW5TdGFydFRpbWVBZGp1c3RtZW50ICE9PSBiLmludGVybmFsTWV0YWRhdGE/LnJ1blN0YXJ0VGltZUFkanVzdG1lbnRcblx0XHRcdFx0fHwgdGhpcy5pbnRlcm5hbE1ldGFkYXRhPy5ydW5FbmRUaW1lICE9PSBiLmludGVybmFsTWV0YWRhdGE/LnJ1bkVuZFRpbWUpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE9uY2Ugd2UgYXR0YWNoIHRoZSBjZWxsIHRleHQgYnVmZmVyIHRvIGFuIGVkaXRvciwgdGhlIHNvdXJjZSBvZiB0cnV0aCBpcyB0aGUgdGV4dCBidWZmZXIgaW5zdGVhZCBvZiB0aGUgb3JpZ2luYWwgc291cmNlXG5cdFx0aWYgKHRoaXMuX3RleHRCdWZmZXIpIHtcblx0XHRcdGlmICghTm90ZWJvb2tDZWxsVGV4dE1vZGVsLmxpbmVzQXJlRXF1YWwodGhpcy50ZXh0QnVmZmVyLmdldExpbmVzQ29udGVudCgpLCBiLnNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5fc291cmNlICE9PSBiLnNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgbGluZXNBcmVFcXVhbChhTGluZXM6IHN0cmluZ1tdLCBiOiBzdHJpbmcpIHtcblx0XHRjb25zdCBiTGluZXMgPSBzcGxpdExpbmVzKGIpO1xuXHRcdGlmIChhTGluZXMubGVuZ3RoICE9PSBiTGluZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoYUxpbmVzW2ldICE9PSBiTGluZXNbaV0pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0ZGlzcG9zZSh0aGlzLl9vdXRwdXRzKTtcblx0XHQvLyBNYW51YWxseSByZWxlYXNlIHJlZmVyZW5jZSB0byBwcmV2aW91cyB0ZXh0IGJ1ZmZlciB0byBhdm9pZCBsYXJnZSBsZWFrc1xuXHRcdC8vIGluIGNhc2Ugc29tZW9uZSBsZWFrcyBhIENlbGxUZXh0TW9kZWwgcmVmZXJlbmNlXG5cdFx0Y29uc3QgZW1wdHlEaXNwb3NlZFRleHRCdWZmZXIgPSBuZXcgUGllY2VUcmVlVGV4dEJ1ZmZlcihbXSwgJycsICdcXG4nLCBmYWxzZSwgZmFsc2UsIHRydWUsIHRydWUpO1xuXHRcdGVtcHR5RGlzcG9zZWRUZXh0QnVmZmVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl90ZXh0QnVmZmVyID0gZW1wdHlEaXNwb3NlZFRleHRCdWZmZXI7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZU5vdGVib29rQ2VsbFRleHRNb2RlbChjZWxsOiBOb3RlYm9va0NlbGxUZXh0TW9kZWwpIHtcblx0cmV0dXJuIHtcblx0XHRzb3VyY2U6IGNlbGwuZ2V0VmFsdWUoKSxcblx0XHRsYW5ndWFnZTogY2VsbC5sYW5ndWFnZSxcblx0XHRtaW1lOiBjZWxsLm1pbWUsXG5cdFx0Y2VsbEtpbmQ6IGNlbGwuY2VsbEtpbmQsXG5cdFx0b3V0cHV0czogY2VsbC5vdXRwdXRzLm1hcChvdXRwdXQgPT4gKHtcblx0XHRcdG91dHB1dHM6IG91dHB1dC5vdXRwdXRzLFxuXHRcdFx0LyogcGFzdGUgc2hvdWxkIGdlbmVyYXRlIG5ldyBvdXRwdXRJZCAqLyBvdXRwdXRJZDogVVVJRC5nZW5lcmF0ZVV1aWQoKVxuXHRcdH0pKSxcblx0XHRtZXRhZGF0YToge31cblx0fTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZVJ1blN0YXJ0VGltZUFkanVzdG1lbnQob2xkTWV0YWRhdGE6IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEsIG5ld01ldGFkYXRhOiBOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0aWYgKG9sZE1ldGFkYXRhLnJ1blN0YXJ0VGltZSAhPT0gbmV3TWV0YWRhdGEucnVuU3RhcnRUaW1lICYmIHR5cGVvZiBuZXdNZXRhZGF0YS5ydW5TdGFydFRpbWUgPT09ICdudW1iZXInKSB7XG5cdFx0Y29uc3Qgb2Zmc2V0ID0gRGF0ZS5ub3coKSAtIG5ld01ldGFkYXRhLnJ1blN0YXJ0VGltZTtcblx0XHRyZXR1cm4gb2Zmc2V0IDwgMCA/IE1hdGguYWJzKG9mZnNldCkgOiAwO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBuZXdNZXRhZGF0YS5ydW5TdGFydFRpbWVBZGp1c3RtZW50O1xuXHR9XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZvcm1hdHRlZE1ldGFkYXRhSlNPTih0cmFuc2llbnRDZWxsTWV0YWRhdGE6IFRyYW5zaWVudENlbGxNZXRhZGF0YSB8IHVuZGVmaW5lZCwgbWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhLCBsYW5ndWFnZT86IHN0cmluZywgc29ydEtleXM/OiBib29sZWFuKTogc3RyaW5nIHtcblx0bGV0IGZpbHRlcmVkTWV0YWRhdGE6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7fTtcblxuXHRpZiAodHJhbnNpZW50Q2VsbE1ldGFkYXRhKSB7XG5cdFx0Y29uc3Qga2V5cyA9IG5ldyBTZXQoWy4uLk9iamVjdC5rZXlzKG1ldGFkYXRhKV0pO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdGlmICghKHRyYW5zaWVudENlbGxNZXRhZGF0YVtrZXkgYXMga2V5b2YgTm90ZWJvb2tDZWxsTWV0YWRhdGFdKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGZpbHRlcmVkTWV0YWRhdGFba2V5XSA9IG1ldGFkYXRhW2tleSBhcyBrZXlvZiBOb3RlYm9va0NlbGxNZXRhZGF0YV07XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGZpbHRlcmVkTWV0YWRhdGEgPSBtZXRhZGF0YTtcblx0fVxuXG5cdGNvbnN0IG9iaiA9IHtcblx0XHRsYW5ndWFnZSxcblx0XHQuLi5maWx0ZXJlZE1ldGFkYXRhXG5cdH07XG5cdC8vIEdpdmUgcHJlZmVyZW5jZSB0byB0aGUgbGFuZ3VhZ2Ugd2UgaGF2ZSBiZWVuIGdpdmVuLlxuXHQvLyBNZXRhZGF0YSBjYW4gY29udGFpbiBgbGFuZ3VhZ2VgIGR1ZSB0byByb3VuZC10cmlwcGluZyBvZiBjZWxsIG1ldGFkYXRhLlxuXHQvLyBJLmUuIHdlIGFkZCBpdCBoZXJlLCBhbmQgdGhlbiBmcm9tIFNDTSB3aGVuIHdlIHJldmVydCB0aGUgY2VsbCwgd2UgZ2V0IHRoaXMgc2FtZSBtZXRhZGF0YSBiYWNrIHdpdGggdGhlIGBsYW5ndWFnZWAgcHJvcGVydHkuXG5cdGlmIChsYW5ndWFnZSkge1xuXHRcdG9iai5sYW5ndWFnZSA9IGxhbmd1YWdlO1xuXHR9XG5cdGNvbnN0IG1ldGFkYXRhU291cmNlID0gdG9Gb3JtYXR0ZWRTdHJpbmcoc29ydEtleXMgPyBzb3J0T2JqZWN0UHJvcGVydGllc1JlY3Vyc2l2ZWx5KG9iaikgOiBvYmosIHt9KTtcblxuXHRyZXR1cm4gbWV0YWRhdGFTb3VyY2U7XG59XG5cblxuLyoqXG4gKiBTb3J0IHRoZSBKU09OIHRvIGVuc3VyZSB3aGVuIGRpZmZpbmcsIHRoZSBKU09OIGtleXMgYXJlIHNvcnRlZCAmIG1hdGNoZWQgY29ycmVjdGx5IGluIGRpZmYgdmlldy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNvcnRPYmplY3RQcm9wZXJ0aWVzUmVjdXJzaXZlbHkob2JqOiBhbnkpOiBhbnkge1xuXHRpZiAoQXJyYXkuaXNBcnJheShvYmopKSB7XG5cdFx0cmV0dXJuIG9iai5tYXAoc29ydE9iamVjdFByb3BlcnRpZXNSZWN1cnNpdmVseSk7XG5cdH1cblx0aWYgKG9iaiAhPT0gdW5kZWZpbmVkICYmIG9iaiAhPT0gbnVsbCAmJiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA+IDApIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0T2JqZWN0LmtleXMob2JqKVxuXHRcdFx0XHQuc29ydCgpXG5cdFx0XHRcdC5yZWR1Y2U8UmVjb3JkPHN0cmluZywgYW55Pj4oKHNvcnRlZE9iaiwgcHJvcCkgPT4ge1xuXHRcdFx0XHRcdHNvcnRlZE9ialtwcm9wXSA9IHNvcnRPYmplY3RQcm9wZXJ0aWVzUmVjdXJzaXZlbHkob2JqW3Byb3BdKTtcblx0XHRcdFx0XHRyZXR1cm4gc29ydGVkT2JqO1xuXHRcdFx0XHR9LCB7fSlcblx0XHQpO1xuXHR9XG5cdHJldHVybiBvYmo7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsTUFBTSxrQkFBa0I7QUFDakMsU0FBUyxZQUFZLGlCQUFpQixlQUFlO0FBRXJELFlBQVksVUFBVTtBQUN0QixTQUFTLGFBQWE7QUFDdEIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQW1DO0FBQzVDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQTJDLGdCQUFxUDtBQUNoUyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHlCQUF5QjtBQUVs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
