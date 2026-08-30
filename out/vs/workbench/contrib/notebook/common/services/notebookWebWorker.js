import { LcsDiff } from "../../../../../base/common/diff/diff.js";
import { doHash, hash, numberHash } from "../../../../../base/common/hash.js";
import { URI } from "../../../../../base/common/uri.js";
import { PieceTreeTextBufferBuilder } from "../../../../../editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js";
import { CellKind, NotebookCellsChangeType } from "../notebookCommon.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { SearchParams } from "../../../../../editor/common/model/textModelSearch.js";
import { MirrorModel } from "../../../../../editor/common/services/textModelSync/textModelSync.impl.js";
import { DefaultEndOfLine } from "../../../../../editor/common/model.js";
import { filter } from "../../../../../base/common/objects.js";
import { matchCellBasedOnSimilarties } from "./notebookCellMatching.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { DiffChange } from "../../../../../base/common/diff/diffChange.js";
import { computeDiff } from "../notebookDiff.js";
const PREFIX_FOR_UNMATCHED_ORIGINAL_CELLS = `unmatchedOriginalCell`;
class MirrorCell {
  constructor(handle, uri, source, _eol, versionId, language, cellKind, outputs, metadata, internalMetadata) {
    this.handle = handle;
    this._eol = _eol;
    this.language = language;
    this.cellKind = cellKind;
    this.outputs = outputs;
    this.metadata = metadata;
    this.internalMetadata = internalMetadata;
    this.textModel = new MirrorModel(uri, source, _eol, versionId);
  }
  get eol() {
    return this._eol === "\r\n" ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF;
  }
  onEvents(e) {
    this.textModel.onEvents(e);
    this._hash = void 0;
  }
  getValue() {
    return this.textModel.getValue();
  }
  getLinesContent() {
    return this.textModel.getLinesContent();
  }
  getComparisonValue() {
    return this._hash ??= this._getHash();
  }
  _getHash() {
    let hashValue = numberHash(104579, 0);
    hashValue = doHash(this.language, hashValue);
    hashValue = doHash(this.getValue(), hashValue);
    hashValue = doHash(this.metadata, hashValue);
    hashValue = doHash(this.internalMetadata?.internalId || "", hashValue);
    for (const op of this.outputs) {
      hashValue = doHash(op.metadata, hashValue);
      for (const output of op.outputs) {
        hashValue = doHash(output.mime, hashValue);
      }
    }
    const digests = this.outputs.flatMap(
      (op) => op.outputs.map((o) => hash(Array.from(o.data.buffer)))
    );
    for (const digest of digests) {
      hashValue = numberHash(digest, hashValue);
    }
    return hashValue;
  }
}
class MirrorNotebookDocument {
  constructor(uri, cells, metadata, transientDocumentMetadata) {
    this.uri = uri;
    this.cells = cells;
    this.metadata = metadata;
    this.transientDocumentMetadata = transientDocumentMetadata;
  }
  acceptModelChanged(event) {
    event.rawEvents.forEach((e) => {
      if (e.kind === NotebookCellsChangeType.ModelChange) {
        this._spliceNotebookCells(e.changes);
      } else if (e.kind === NotebookCellsChangeType.Move) {
        const cells = this.cells.splice(e.index, 1);
        this.cells.splice(e.newIdx, 0, ...cells);
      } else if (e.kind === NotebookCellsChangeType.Output) {
        const cell = this.cells[e.index];
        cell.outputs = e.outputs;
      } else if (e.kind === NotebookCellsChangeType.ChangeCellLanguage) {
        this._assertIndex(e.index);
        const cell = this.cells[e.index];
        cell.language = e.language;
      } else if (e.kind === NotebookCellsChangeType.ChangeCellMetadata) {
        this._assertIndex(e.index);
        const cell = this.cells[e.index];
        cell.metadata = e.metadata;
      } else if (e.kind === NotebookCellsChangeType.ChangeCellInternalMetadata) {
        this._assertIndex(e.index);
        const cell = this.cells[e.index];
        cell.internalMetadata = e.internalMetadata;
      } else if (e.kind === NotebookCellsChangeType.ChangeDocumentMetadata) {
        this.metadata = e.metadata;
      }
    });
  }
  _assertIndex(index) {
    if (index < 0 || index >= this.cells.length) {
      throw new Error(`Illegal index ${index}. Cells length: ${this.cells.length}`);
    }
  }
  _spliceNotebookCells(splices) {
    splices.reverse().forEach((splice) => {
      const cellDtos = splice[2];
      const newCells = cellDtos.map((cell) => {
        return new MirrorCell(
          cell.handle,
          URI.parse(cell.url),
          cell.source,
          cell.eol,
          cell.versionId,
          cell.language,
          cell.cellKind,
          cell.outputs,
          cell.metadata
        );
      });
      this.cells.splice(splice[0], splice[1], ...newCells);
    });
  }
}
class CellSequence {
  constructor(hashValue) {
    this.hashValue = hashValue;
  }
  static create(textModel) {
    const hashValue = textModel.cells.map((c) => c.getComparisonValue());
    return new CellSequence(hashValue);
  }
  static createWithCellId(cells, includeCellContents) {
    const hashValue = cells.map((c) => {
      if (includeCellContents) {
        return `${doHash(c.internalMetadata?.internalId, numberHash(104579, 0))}#${c.getComparisonValue()}`;
      } else {
        return `${doHash(c.internalMetadata?.internalId, numberHash(104579, 0))}}`;
      }
    });
    return new CellSequence(hashValue);
  }
  getElements() {
    return this.hashValue;
  }
}
class NotebookWorker {
  constructor() {
    this._requestHandlerBrand = void 0;
    this._models = /* @__PURE__ */ Object.create(null);
  }
  dispose() {
  }
  $acceptNewModel(uri, metadata, transientDocumentMetadata, cells) {
    this._models[uri] = new MirrorNotebookDocument(URI.parse(uri), cells.map((dto) => new MirrorCell(
      dto.handle,
      URI.parse(dto.url),
      dto.source,
      dto.eol,
      dto.versionId,
      dto.language,
      dto.cellKind,
      dto.outputs,
      dto.metadata,
      dto.internalMetadata
    )), metadata, transientDocumentMetadata);
  }
  $acceptModelChanged(strURL, event) {
    const model = this._models[strURL];
    model?.acceptModelChanged(event);
  }
  $acceptCellModelChanged(strURL, handle, event) {
    const model = this._models[strURL];
    model.cells.find((cell) => cell.handle === handle)?.onEvents(event);
  }
  $acceptRemovedModel(strURL) {
    if (!this._models[strURL]) {
      return;
    }
    delete this._models[strURL];
  }
  async $computeDiff(originalUrl, modifiedUrl) {
    const original = this._getModel(originalUrl);
    const modified = this._getModel(modifiedUrl);
    const originalModel = new NotebookTextModelFacade(original);
    const modifiedModel = new NotebookTextModelFacade(modified);
    const originalMetadata = filter(original.metadata, (key) => !original.transientDocumentMetadata[key]);
    const modifiedMetadata = filter(modified.metadata, (key) => !modified.transientDocumentMetadata[key]);
    const metadataChanged = JSON.stringify(originalMetadata) !== JSON.stringify(modifiedMetadata);
    const originalDiff = new LcsDiff(CellSequence.create(original), CellSequence.create(modified)).ComputeDiff(false);
    if (originalDiff.changes.length === 0) {
      return {
        metadataChanged,
        cellsDiff: originalDiff
      };
    }
    const cellMapping = computeDiff(originalModel, modifiedModel, { cellsDiff: { changes: originalDiff.changes, quitEarly: false }, metadataChanged: false }).cellDiffInfo;
    if (cellMapping.every((c) => c.type === "modified" || c.type === "unchanged")) {
      return {
        metadataChanged,
        cellsDiff: originalDiff
      };
    }
    let diffUsingCellIds = this.canComputeDiffWithCellIds(original, modified);
    if (!diffUsingCellIds) {
      const result = matchCellBasedOnSimilarties(modified.cells, original.cells);
      if (result.some((c) => c.original !== -1)) {
        this.updateCellIdsBasedOnMappings(result, original.cells, modified.cells);
        diffUsingCellIds = true;
      }
    }
    if (!diffUsingCellIds) {
      return {
        metadataChanged,
        cellsDiff: originalDiff
      };
    }
    const cellsInsertedOrDeletedDiff = new LcsDiff(CellSequence.createWithCellId(original.cells), CellSequence.createWithCellId(modified.cells)).ComputeDiff(false);
    const cellDiffInfo = computeDiff(originalModel, modifiedModel, { cellsDiff: { changes: cellsInsertedOrDeletedDiff.changes, quitEarly: false }, metadataChanged: false }).cellDiffInfo;
    let processedIndex = 0;
    const changes = [];
    cellsInsertedOrDeletedDiff.changes.forEach((change) => {
      if (!change.originalLength && change.modifiedLength) {
        const changeIndex = cellDiffInfo.findIndex((c) => c.type === "insert" && c.modifiedCellIndex === change.modifiedStart);
        cellDiffInfo.slice(processedIndex, changeIndex).forEach((c) => {
          if (c.type === "unchanged" || c.type === "modified") {
            const originalCell = original.cells[c.originalCellIndex];
            const modifiedCell = modified.cells[c.modifiedCellIndex];
            const changed = c.type === "modified" || originalCell.getComparisonValue() !== modifiedCell.getComparisonValue();
            if (changed) {
              changes.push(new DiffChange(c.originalCellIndex, 1, c.modifiedCellIndex, 1));
            }
          }
        });
        changes.push(change);
        processedIndex = changeIndex + 1;
      } else if (change.originalLength && !change.modifiedLength) {
        const changeIndex = cellDiffInfo.findIndex((c) => c.type === "delete" && c.originalCellIndex === change.originalStart);
        cellDiffInfo.slice(processedIndex, changeIndex).forEach((c) => {
          if (c.type === "unchanged" || c.type === "modified") {
            const originalCell = original.cells[c.originalCellIndex];
            const modifiedCell = modified.cells[c.modifiedCellIndex];
            const changed = c.type === "modified" || originalCell.getComparisonValue() !== modifiedCell.getComparisonValue();
            if (changed) {
              changes.push(new DiffChange(c.originalCellIndex, 1, c.modifiedCellIndex, 1));
            }
          }
        });
        changes.push(change);
        processedIndex = changeIndex + 1;
      } else {
        const changeIndex = cellDiffInfo.findIndex((c) => c.type === "delete" && c.originalCellIndex === change.originalStart || c.type === "insert" && c.modifiedCellIndex === change.modifiedStart);
        cellDiffInfo.slice(processedIndex, changeIndex).forEach((c) => {
          if (c.type === "unchanged" || c.type === "modified") {
            const originalCell = original.cells[c.originalCellIndex];
            const modifiedCell = modified.cells[c.modifiedCellIndex];
            const changed = c.type === "modified" || originalCell.getComparisonValue() !== modifiedCell.getComparisonValue();
            if (changed) {
              changes.push(new DiffChange(c.originalCellIndex, 1, c.modifiedCellIndex, 1));
            }
          }
        });
        changes.push(change);
        processedIndex = changeIndex + 1;
      }
    });
    cellDiffInfo.slice(processedIndex).forEach((c) => {
      if (c.type === "unchanged" || c.type === "modified") {
        const originalCell = original.cells[c.originalCellIndex];
        const modifiedCell = modified.cells[c.modifiedCellIndex];
        const changed = c.type === "modified" || originalCell.getComparisonValue() !== modifiedCell.getComparisonValue();
        if (changed) {
          changes.push(new DiffChange(c.originalCellIndex, 1, c.modifiedCellIndex, 1));
        }
      }
    });
    return {
      metadataChanged,
      cellsDiff: {
        changes,
        quitEarly: false
      }
    };
  }
  canComputeDiffWithCellIds(original, modified) {
    return this.canComputeDiffWithCellInternalIds(original, modified) || this.canComputeDiffWithCellMetadataIds(original, modified);
  }
  canComputeDiffWithCellInternalIds(original, modified) {
    const originalCellIndexIds = original.cells.map((cell, index) => ({ index, id: cell.internalMetadata?.internalId || "" }));
    const modifiedCellIndexIds = modified.cells.map((cell, index) => ({ index, id: cell.internalMetadata?.internalId || "" }));
    if (originalCellIndexIds.some((c) => !c.id) || modifiedCellIndexIds.some((c) => !c.id)) {
      return false;
    }
    return originalCellIndexIds.some((c) => modifiedCellIndexIds.find((m) => m.id === c.id));
  }
  canComputeDiffWithCellMetadataIds(original, modified) {
    const originalCellIndexIds = original.cells.map((cell, index) => ({ index, id: cell.metadata?.id || "" }));
    const modifiedCellIndexIds = modified.cells.map((cell, index) => ({ index, id: cell.metadata?.id || "" }));
    if (originalCellIndexIds.some((c) => !c.id) || modifiedCellIndexIds.some((c) => !c.id)) {
      return false;
    }
    if (originalCellIndexIds.every((c) => !modifiedCellIndexIds.find((m) => m.id === c.id))) {
      return false;
    }
    original.cells.map((cell, index) => {
      cell.internalMetadata = cell.internalMetadata || {};
      cell.internalMetadata.internalId = cell.metadata?.id || "";
    });
    modified.cells.map((cell, index) => {
      cell.internalMetadata = cell.internalMetadata || {};
      cell.internalMetadata.internalId = cell.metadata?.id || "";
    });
    return true;
  }
  isOriginalCellMatchedWithModifiedCell(originalCell) {
    return (originalCell.internalMetadata?.internalId || "").startsWith(PREFIX_FOR_UNMATCHED_ORIGINAL_CELLS);
  }
  updateCellIdsBasedOnMappings(mappings, originalCells, modifiedCells) {
    const uuids = /* @__PURE__ */ new Map();
    originalCells.map((cell, index) => {
      cell.internalMetadata = cell.internalMetadata || { internalId: "" };
      cell.internalMetadata.internalId = `${PREFIX_FOR_UNMATCHED_ORIGINAL_CELLS}${generateUuid()}`;
      const found = mappings.find((r) => r.original === index);
      if (found) {
        cell.internalMetadata.internalId = generateUuid();
        uuids.set(found.modified, cell.internalMetadata.internalId);
      }
    });
    modifiedCells.map((cell, index) => {
      cell.internalMetadata = cell.internalMetadata || { internalId: "" };
      cell.internalMetadata.internalId = uuids.get(index) ?? generateUuid();
    });
    return true;
  }
  $canPromptRecommendation(modelUrl) {
    const model = this._getModel(modelUrl);
    const cells = model.cells;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.cellKind === CellKind.Markup) {
        continue;
      }
      if (cell.language !== "python") {
        continue;
      }
      const searchParams = new SearchParams("import\\s*pandas|from\\s*pandas", true, false, null);
      const searchData = searchParams.parseSearchRequest();
      if (!searchData) {
        continue;
      }
      const builder = new PieceTreeTextBufferBuilder();
      builder.acceptChunk(cell.getValue());
      const bufferFactory = builder.finish(true);
      const textBuffer = bufferFactory.create(cell.eol).textBuffer;
      const lineCount = textBuffer.getLineCount();
      const maxLineCount = Math.min(lineCount, 20);
      const range = new Range(1, 1, maxLineCount, textBuffer.getLineLength(maxLineCount) + 1);
      const cellMatches = textBuffer.findMatchesLineByLine(range, searchData, true, 1);
      if (cellMatches.length > 0) {
        return true;
      }
    }
    return false;
  }
  _getModel(uri) {
    return this._models[uri];
  }
}
function create() {
  return new NotebookWorker();
}
class NotebookTextModelFacade {
  constructor(notebook) {
    this.notebook = notebook;
    this.cells = notebook.cells.map((cell) => new NotebookCellTextModelFacade(cell));
  }
}
class NotebookCellTextModelFacade {
  constructor(cell) {
    this.cell = cell;
  }
  get cellKind() {
    return this.cell.cellKind;
  }
  getHashValue() {
    return this.cell.getComparisonValue();
  }
  equal(cell) {
    if (cell.cellKind !== this.cellKind) {
      return false;
    }
    return this.getHashValue() === cell.getHashValue();
  }
}
export {
  NotebookWorker,
  create
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxjb21tb25cXHNlcnZpY2VzXFxub3RlYm9va1dlYldvcmtlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBJRGlmZkNoYW5nZSwgSVNlcXVlbmNlLCBMY3NEaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGlmZi9kaWZmLmpzJztcbmltcG9ydCB7IGRvSGFzaCwgaGFzaCwgbnVtYmVySGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElXZWJXb3JrZXJTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3dvcmtlci93ZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgUGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3BpZWNlVHJlZVRleHRCdWZmZXIvcGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIElNYWluQ2VsbER0bywgSU5vdGVib29rRGlmZlJlc3VsdCwgSU91dHB1dER0bywgTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSwgTm90ZWJvb2tDZWxsTWV0YWRhdGEsIE5vdGVib29rQ2VsbHNDaGFuZ2VkRXZlbnREdG8sIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLCBOb3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2UsIE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YSwgVHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YSB9IGZyb20gJy4uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlYXJjaFBhcmFtcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsU2VhcmNoLmpzJztcbmltcG9ydCB7IE1pcnJvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0TW9kZWxTeW5jL3RleHRNb2RlbFN5bmMuaW1wbC5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0RW5kT2ZMaW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL21pcnJvclRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBmaWx0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IG1hdGNoQ2VsbEJhc2VkT25TaW1pbGFydGllcyB9IGZyb20gJy4vbm90ZWJvb2tDZWxsTWF0Y2hpbmcuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBEaWZmQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGlmZi9kaWZmQ2hhbmdlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVEaWZmIH0gZnJvbSAnLi4vbm90ZWJvb2tEaWZmLmpzJztcblxuY29uc3QgUFJFRklYX0ZPUl9VTk1BVENIRURfT1JJR0lOQUxfQ0VMTFMgPSBgdW5tYXRjaGVkT3JpZ2luYWxDZWxsYDtcblxuY2xhc3MgTWlycm9yQ2VsbCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsOiBNaXJyb3JNb2RlbDtcblx0cHJpdmF0ZSBfaGFzaD86IG51bWJlcjtcblx0cHVibGljIGdldCBlb2woKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VvbCA9PT0gJ1xcclxcbicgPyBEZWZhdWx0RW5kT2ZMaW5lLkNSTEYgOiBEZWZhdWx0RW5kT2ZMaW5lLkxGO1xuXHR9XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBoYW5kbGU6IG51bWJlcixcblx0XHR1cmk6IFVSSSxcblx0XHRzb3VyY2U6IHN0cmluZ1tdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VvbDogc3RyaW5nLFxuXHRcdHZlcnNpb25JZDogbnVtYmVyLFxuXHRcdHB1YmxpYyBsYW5ndWFnZTogc3RyaW5nLFxuXHRcdHB1YmxpYyBjZWxsS2luZDogQ2VsbEtpbmQsXG5cdFx0cHVibGljIG91dHB1dHM6IElPdXRwdXREdG9bXSxcblx0XHRwdWJsaWMgbWV0YWRhdGE/OiBOb3RlYm9va0NlbGxNZXRhZGF0YSxcblx0XHRwdWJsaWMgaW50ZXJuYWxNZXRhZGF0YT86IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEsXG5cblx0KSB7XG5cdFx0dGhpcy50ZXh0TW9kZWwgPSBuZXcgTWlycm9yTW9kZWwodXJpLCBzb3VyY2UsIF9lb2wsIHZlcnNpb25JZCk7XG5cdH1cblxuXHRvbkV2ZW50cyhlOiBJTW9kZWxDaGFuZ2VkRXZlbnQpIHtcblx0XHR0aGlzLnRleHRNb2RlbC5vbkV2ZW50cyhlKTtcblx0XHR0aGlzLl9oYXNoID0gdW5kZWZpbmVkO1xuXHR9XG5cdGdldFZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudGV4dE1vZGVsLmdldFZhbHVlKCk7XG5cdH1cblxuXHRnZXRMaW5lc0NvbnRlbnQoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLnRleHRNb2RlbC5nZXRMaW5lc0NvbnRlbnQoKTtcblx0fVxuXHRnZXRDb21wYXJpc29uVmFsdWUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5faGFzaCA/Pz0gdGhpcy5fZ2V0SGFzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SGFzaCgpIHtcblx0XHRsZXQgaGFzaFZhbHVlID0gbnVtYmVySGFzaCgxMDQ1NzksIDApO1xuXG5cdFx0aGFzaFZhbHVlID0gZG9IYXNoKHRoaXMubGFuZ3VhZ2UsIGhhc2hWYWx1ZSk7XG5cdFx0aGFzaFZhbHVlID0gZG9IYXNoKHRoaXMuZ2V0VmFsdWUoKSwgaGFzaFZhbHVlKTtcblx0XHRoYXNoVmFsdWUgPSBkb0hhc2godGhpcy5tZXRhZGF0YSwgaGFzaFZhbHVlKTtcblx0XHQvLyBGb3IgcHVycG9zZSBvZiBkaWZmaW5nIG9ubHkgY2VsbElkIG1hdHRlcnMsIHJlc3QgZG8gbm90XG5cdFx0aGFzaFZhbHVlID0gZG9IYXNoKHRoaXMuaW50ZXJuYWxNZXRhZGF0YT8uaW50ZXJuYWxJZCB8fCAnJywgaGFzaFZhbHVlKTtcblx0XHRmb3IgKGNvbnN0IG9wIG9mIHRoaXMub3V0cHV0cykge1xuXHRcdFx0aGFzaFZhbHVlID0gZG9IYXNoKG9wLm1ldGFkYXRhLCBoYXNoVmFsdWUpO1xuXHRcdFx0Zm9yIChjb25zdCBvdXRwdXQgb2Ygb3Aub3V0cHV0cykge1xuXHRcdFx0XHRoYXNoVmFsdWUgPSBkb0hhc2gob3V0cHV0Lm1pbWUsIGhhc2hWYWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlnZXN0cyA9IHRoaXMub3V0cHV0cy5mbGF0TWFwKG9wID0+XG5cdFx0XHRvcC5vdXRwdXRzLm1hcChvID0+IGhhc2goQXJyYXkuZnJvbShvLmRhdGEuYnVmZmVyKSkpXG5cdFx0KTtcblx0XHRmb3IgKGNvbnN0IGRpZ2VzdCBvZiBkaWdlc3RzKSB7XG5cdFx0XHRoYXNoVmFsdWUgPSBudW1iZXJIYXNoKGRpZ2VzdCwgaGFzaFZhbHVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaGFzaFZhbHVlO1xuXHR9XG59XG5cbmNsYXNzIE1pcnJvck5vdGVib29rRG9jdW1lbnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB1cmk6IFVSSSxcblx0XHRwdWJsaWMgY2VsbHM6IE1pcnJvckNlbGxbXSxcblx0XHRwdWJsaWMgbWV0YWRhdGE6IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YSxcblx0XHRwdWJsaWMgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YTogVHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YSxcblx0KSB7XG5cdH1cblxuXHRhY2NlcHRNb2RlbENoYW5nZWQoZXZlbnQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VkRXZlbnREdG8pIHtcblx0XHQvLyBub3RlIHRoYXQgdGhlIGNlbGwgY29udGVudCBjaGFuZ2UgaXMgbm90IGFwcGxpZWQgdG8gdGhlIE1pcnJvckNlbGxcblx0XHQvLyBidXQgaXQncyBmaW5lIGFzIGlmIGEgY2VsbCBjb250ZW50IGlzIG1vZGlmaWVkIGFmdGVyIHRoZSBmaXJzdCBkaWZmLCBpdHMgcG9zaXRpb24gd2lsbCBub3QgY2hhbmdlIGFueSBtb3JlXG5cdFx0Ly8gVE9ET0ByZWJvcm5peCwgYnV0IGl0IG1pZ2h0IGxlYWQgdG8gaW50ZXJlc3RpbmcgYnVncyBpbiB0aGUgZnV0dXJlLlxuXHRcdGV2ZW50LnJhd0V2ZW50cy5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UpIHtcblx0XHRcdFx0dGhpcy5fc3BsaWNlTm90ZWJvb2tDZWxscyhlLmNoYW5nZXMpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmUpIHtcblx0XHRcdFx0Y29uc3QgY2VsbHMgPSB0aGlzLmNlbGxzLnNwbGljZShlLmluZGV4LCAxKTtcblx0XHRcdFx0dGhpcy5jZWxscy5zcGxpY2UoZS5uZXdJZHgsIDAsIC4uLmNlbGxzKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5PdXRwdXQpIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuY2VsbHNbZS5pbmRleF07XG5cdFx0XHRcdGNlbGwub3V0cHV0cyA9IGUub3V0cHV0cztcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTGFuZ3VhZ2UpIHtcblx0XHRcdFx0dGhpcy5fYXNzZXJ0SW5kZXgoZS5pbmRleCk7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmNlbGxzW2UuaW5kZXhdO1xuXHRcdFx0XHRjZWxsLmxhbmd1YWdlID0gZS5sYW5ndWFnZTtcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTWV0YWRhdGEpIHtcblx0XHRcdFx0dGhpcy5fYXNzZXJ0SW5kZXgoZS5pbmRleCk7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmNlbGxzW2UuaW5kZXhdO1xuXHRcdFx0XHRjZWxsLm1ldGFkYXRhID0gZS5tZXRhZGF0YTtcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsSW50ZXJuYWxNZXRhZGF0YSkge1xuXHRcdFx0XHR0aGlzLl9hc3NlcnRJbmRleChlLmluZGV4KTtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuY2VsbHNbZS5pbmRleF07XG5cdFx0XHRcdGNlbGwuaW50ZXJuYWxNZXRhZGF0YSA9IGUuaW50ZXJuYWxNZXRhZGF0YTtcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VEb2N1bWVudE1ldGFkYXRhKSB7XG5cdFx0XHRcdHRoaXMubWV0YWRhdGEgPSBlLm1ldGFkYXRhO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXNzZXJ0SW5kZXgoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5jZWxscy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSWxsZWdhbCBpbmRleCAke2luZGV4fS4gQ2VsbHMgbGVuZ3RoOiAke3RoaXMuY2VsbHMubGVuZ3RofWApO1xuXHRcdH1cblx0fVxuXG5cdF9zcGxpY2VOb3RlYm9va0NlbGxzKHNwbGljZXM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFNwbGljZTxJTWFpbkNlbGxEdG8+W10pIHtcblx0XHRzcGxpY2VzLnJldmVyc2UoKS5mb3JFYWNoKHNwbGljZSA9PiB7XG5cdFx0XHRjb25zdCBjZWxsRHRvcyA9IHNwbGljZVsyXTtcblx0XHRcdGNvbnN0IG5ld0NlbGxzID0gY2VsbER0b3MubWFwKGNlbGwgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1pcnJvckNlbGwoXG5cdFx0XHRcdFx0Y2VsbC5oYW5kbGUsXG5cdFx0XHRcdFx0VVJJLnBhcnNlKGNlbGwudXJsKSxcblx0XHRcdFx0XHRjZWxsLnNvdXJjZSxcblx0XHRcdFx0XHRjZWxsLmVvbCxcblx0XHRcdFx0XHRjZWxsLnZlcnNpb25JZCxcblx0XHRcdFx0XHRjZWxsLmxhbmd1YWdlLFxuXHRcdFx0XHRcdGNlbGwuY2VsbEtpbmQsXG5cdFx0XHRcdFx0Y2VsbC5vdXRwdXRzLFxuXHRcdFx0XHRcdGNlbGwubWV0YWRhdGEsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5jZWxscy5zcGxpY2Uoc3BsaWNlWzBdLCBzcGxpY2VbMV0sIC4uLm5ld0NlbGxzKTtcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBDZWxsU2VxdWVuY2UgaW1wbGVtZW50cyBJU2VxdWVuY2Uge1xuXG5cdHN0YXRpYyBjcmVhdGUodGV4dE1vZGVsOiBNaXJyb3JOb3RlYm9va0RvY3VtZW50KSB7XG5cdFx0Y29uc3QgaGFzaFZhbHVlID0gdGV4dE1vZGVsLmNlbGxzLm1hcChjID0+IGMuZ2V0Q29tcGFyaXNvblZhbHVlKCkpO1xuXHRcdHJldHVybiBuZXcgQ2VsbFNlcXVlbmNlKGhhc2hWYWx1ZSk7XG5cdH1cblx0c3RhdGljIGNyZWF0ZVdpdGhDZWxsSWQoY2VsbHM6IE1pcnJvckNlbGxbXSwgaW5jbHVkZUNlbGxDb250ZW50cz86IGJvb2xlYW4pIHtcblx0XHRjb25zdCBoYXNoVmFsdWUgPSBjZWxscy5tYXAoKGMpID0+IHtcblx0XHRcdGlmIChpbmNsdWRlQ2VsbENvbnRlbnRzKSB7XG5cdFx0XHRcdHJldHVybiBgJHtkb0hhc2goYy5pbnRlcm5hbE1ldGFkYXRhPy5pbnRlcm5hbElkLCBudW1iZXJIYXNoKDEwNDU3OSwgMCkpfSMke2MuZ2V0Q29tcGFyaXNvblZhbHVlKCl9YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBgJHtkb0hhc2goYy5pbnRlcm5hbE1ldGFkYXRhPy5pbnRlcm5hbElkLCBudW1iZXJIYXNoKDEwNDU3OSwgMCkpfX1gO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBuZXcgQ2VsbFNlcXVlbmNlKGhhc2hWYWx1ZSk7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBoYXNoVmFsdWU6IG51bWJlcltdIHwgc3RyaW5nW10pIHsgfVxuXG5cdGdldEVsZW1lbnRzKCk6IHN0cmluZ1tdIHwgbnVtYmVyW10gfCBJbnQzMkFycmF5IHtcblx0XHRyZXR1cm4gdGhpcy5oYXNoVmFsdWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rV29ya2VyIGltcGxlbWVudHMgSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyLCBJRGlzcG9zYWJsZSB7XG5cdF9yZXF1ZXN0SGFuZGxlckJyYW5kOiB2b2lkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX21vZGVsczogeyBbdXJpOiBzdHJpbmddOiBNaXJyb3JOb3RlYm9va0RvY3VtZW50IH07XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fbW9kZWxzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHR9XG5cblx0cHVibGljICRhY2NlcHROZXdNb2RlbCh1cmk6IHN0cmluZywgbWV0YWRhdGE6IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YSwgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YTogVHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YSwgY2VsbHM6IElNYWluQ2VsbER0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxzW3VyaV0gPSBuZXcgTWlycm9yTm90ZWJvb2tEb2N1bWVudChVUkkucGFyc2UodXJpKSwgY2VsbHMubWFwKGR0byA9PiBuZXcgTWlycm9yQ2VsbChcblx0XHRcdGR0by5oYW5kbGUsXG5cdFx0XHRVUkkucGFyc2UoZHRvLnVybCksXG5cdFx0XHRkdG8uc291cmNlLFxuXHRcdFx0ZHRvLmVvbCxcblx0XHRcdGR0by52ZXJzaW9uSWQsXG5cdFx0XHRkdG8ubGFuZ3VhZ2UsXG5cdFx0XHRkdG8uY2VsbEtpbmQsXG5cdFx0XHRkdG8ub3V0cHV0cyxcblx0XHRcdGR0by5tZXRhZGF0YSxcblx0XHRcdGR0by5pbnRlcm5hbE1ldGFkYXRhXG5cdFx0KSksIG1ldGFkYXRhLCB0cmFuc2llbnREb2N1bWVudE1ldGFkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0TW9kZWxDaGFuZ2VkKHN0clVSTDogc3RyaW5nLCBldmVudDogTm90ZWJvb2tDZWxsc0NoYW5nZWRFdmVudER0bykge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxzW3N0clVSTF07XG5cdFx0bW9kZWw/LmFjY2VwdE1vZGVsQ2hhbmdlZChldmVudCk7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdENlbGxNb2RlbENoYW5nZWQoc3RyVVJMOiBzdHJpbmcsIGhhbmRsZTogbnVtYmVyLCBldmVudDogSU1vZGVsQ2hhbmdlZEV2ZW50KSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbHNbc3RyVVJMXTtcblx0XHRtb2RlbC5jZWxscy5maW5kKGNlbGwgPT4gY2VsbC5oYW5kbGUgPT09IGhhbmRsZSk/Lm9uRXZlbnRzKGV2ZW50KTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0UmVtb3ZlZE1vZGVsKHN0clVSTDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbHNbc3RyVVJMXSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRkZWxldGUgdGhpcy5fbW9kZWxzW3N0clVSTF07XG5cdH1cblxuXHRhc3luYyAkY29tcHV0ZURpZmYob3JpZ2luYWxVcmw6IHN0cmluZywgbW9kaWZpZWRVcmw6IHN0cmluZyk6IFByb21pc2U8SU5vdGVib29rRGlmZlJlc3VsdD4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gdGhpcy5fZ2V0TW9kZWwob3JpZ2luYWxVcmwpO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gdGhpcy5fZ2V0TW9kZWwobW9kaWZpZWRVcmwpO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxNb2RlbCA9IG5ldyBOb3RlYm9va1RleHRNb2RlbEZhY2FkZShvcmlnaW5hbCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRNb2RlbCA9IG5ldyBOb3RlYm9va1RleHRNb2RlbEZhY2FkZShtb2RpZmllZCk7XG5cblx0XHRjb25zdCBvcmlnaW5hbE1ldGFkYXRhID0gZmlsdGVyKG9yaWdpbmFsLm1ldGFkYXRhLCBrZXkgPT4gIW9yaWdpbmFsLnRyYW5zaWVudERvY3VtZW50TWV0YWRhdGFba2V5XSk7XG5cdFx0Y29uc3QgbW9kaWZpZWRNZXRhZGF0YSA9IGZpbHRlcihtb2RpZmllZC5tZXRhZGF0YSwga2V5ID0+ICFtb2RpZmllZC50cmFuc2llbnREb2N1bWVudE1ldGFkYXRhW2tleV0pO1xuXHRcdGNvbnN0IG1ldGFkYXRhQ2hhbmdlZCA9IEpTT04uc3RyaW5naWZ5KG9yaWdpbmFsTWV0YWRhdGEpICE9PSBKU09OLnN0cmluZ2lmeShtb2RpZmllZE1ldGFkYXRhKTtcblx0XHQvLyBUT0RPQERvbkpheWFtYW5uZVxuXHRcdC8vIEluIHRoZSBmdXR1cmUgd2UgbWlnaHQgd2FudCB0byBhdm9pZCBjb21wdXRpbmcgTENTIG9mIG91dHB1dHNcblx0XHQvLyBUaGF0IHdpbGwgbWFrZSB0aGlzIGZhc3Rlci5cblx0XHRjb25zdCBvcmlnaW5hbERpZmYgPSBuZXcgTGNzRGlmZihDZWxsU2VxdWVuY2UuY3JlYXRlKG9yaWdpbmFsKSwgQ2VsbFNlcXVlbmNlLmNyZWF0ZShtb2RpZmllZCkpLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRpZiAob3JpZ2luYWxEaWZmLmNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtZXRhZGF0YUNoYW5nZWQsXG5cdFx0XHRcdGNlbGxzRGlmZjogb3JpZ2luYWxEaWZmXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFRoaXMgd2lsbCByZXR1cm4gdGhlIG1hcHBpbmcgb2YgdGhlIGNlbGxzIGFuZCB3aGF0IGNlbGxzIHdlcmUgaW5zZXJ0ZWQvZGVsZXRlZC5cblx0XHQvLyBXZSBkbyBub3QgY2FyZSBtdWNoIGFib3V0IGFjY3VyYWN5IG9mIHRoZSBkaWZmLCBidXQgY2FyZSBhYm91dCB0aGUgbWFwcGluZyBvZiB1bm1vZGlmaWVkIGNlbGxzLlxuXHRcdC8vIFRoYXQgY2FuIGJlIHVzZWQgYXMgYW5jaG9yIHBvaW50cyB0byBmaW5kIHRoZSBjZWxscyB0aGF0IGhhdmUgY2hhbmdlZC5cblx0XHQvLyBBbmQgb24gY2VsbHMgdGhhdCBoYXZlIGNoYW5nZWQsIHdlIGNhbiB1c2Ugc2ltaWxhcml0eSBhbGdvcml0aG1zIHRvIGZpbmQgdGhlIG1hcHBpbmcuXG5cdFx0Ly8gRWcgYXMgbWVudGlvbmVkIGVhcmxpZXIsIGl0cyBwb3NzaWJsZSBhZnRlciBzaW1pbGFyaXR5IGFsZ29yaXRobXMgd2UgZmluZCB0aGF0IGNlbGxzIHdlcmVuJ3QgaW5zZXJ0ZWQvZGVsZXRlZCBidXQgd2VyZSBqdXN0IG1vZGlmaWVkLlxuXHRcdGNvbnN0IGNlbGxNYXBwaW5nID0gY29tcHV0ZURpZmYob3JpZ2luYWxNb2RlbCwgbW9kaWZpZWRNb2RlbCwgeyBjZWxsc0RpZmY6IHsgY2hhbmdlczogb3JpZ2luYWxEaWZmLmNoYW5nZXMsIHF1aXRFYXJseTogZmFsc2UgfSwgbWV0YWRhdGFDaGFuZ2VkOiBmYWxzZSwgfSkuY2VsbERpZmZJbmZvO1xuXG5cdFx0Ly8gSWYgd2UgaGF2ZSBubyBpbnNlcnRpb25zL2RlbGV0aW9ucywgdGhlbiB0aGlzIGlzIGEgZ29vZCBkaWZmaW5nLlxuXHRcdGlmIChjZWxsTWFwcGluZy5ldmVyeShjID0+IGMudHlwZSA9PT0gJ21vZGlmaWVkJyB8fCBjLnR5cGUgPT09ICd1bmNoYW5nZWQnKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bWV0YWRhdGFDaGFuZ2VkLFxuXHRcdFx0XHRjZWxsc0RpZmY6IG9yaWdpbmFsRGlmZlxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRsZXQgZGlmZlVzaW5nQ2VsbElkcyA9IHRoaXMuY2FuQ29tcHV0ZURpZmZXaXRoQ2VsbElkcyhvcmlnaW5hbCwgbW9kaWZpZWQpO1xuXHRcdGlmICghZGlmZlVzaW5nQ2VsbElkcykge1xuXHRcdFx0LyoqXG5cdFx0XHQgKiBBc3N1bWUgd2UgaGF2ZSBjZWxscyBhcyBmb2xsb3dzXG5cdFx0XHQgKiBPcmlnaW5hbCAgIE1vZGlmaWVkXG5cdFx0XHQgKiBBXHQgIFx0XHRBXG5cdFx0XHQgKiBCXHRcdFx0QlxuXHRcdFx0ICogQ1x0XHRcdGVcblx0XHRcdCAqIERcdFx0XHRGXG5cdFx0XHQgKiBFXG5cdFx0XHQgKiBGXG5cdFx0XHQgKlxuXHRcdFx0ICogVXNpbmcgTENTIHdlIGtub3cgZWFzaWx5IHRoYXQgQSwgQiBjZWxscyBtYXRjaC5cblx0XHRcdCAqIFVzaW5nIExDUyBpdCB3b3VsZCBsb29rIGxpa2UgQyBjaGFuZ2VkIHRvIGVcblx0XHRcdCAqIFVzaW5nIExDUyBEICYgRSB3ZXJlIHJlbW92ZWQuXG5cdFx0XHQgKlxuXHRcdFx0ICogQSBodW1hbiB3b3VsZCBiZSBhYmxlIHRvIHRlbGwgdGhhdCBjZWxsIEMsIEQgd2VyZSByZW1vdmVkLlxuXHRcdFx0ICogQSBodW1hbiBjYW4gdGVsbCB0aGF0IEUgY2hhbmdlZCB0byBlIGJlY2F1c2UgdGhlIGNvZGUgaW4gdGhlIGNlbGxzIGFyZSB2ZXJ5IHNpbWlsYXIuXG5cdFx0XHQgKiBOb3RlIHRoZSB3b3JkcyBgc2ltaWxhcmAsIGh1bWFucyB0cnkgdG8gbWF0Y2ggY2VsbHMgYmFzZWQgb24gY2VydGFpbiBoZXVyaXN0aWNzLlxuXHRcdFx0ICogJiB0aGUgbW9zdCBvYnZpb3VzIG9uZSBpcyB0aGUgc2ltaWxhcml0eSBvZiB0aGUgY29kZSBpbiB0aGUgY2VsbHMuXG5cdFx0XHQgKlxuXHRcdFx0ICogTENTIGhhcyBubyBub3Rpb24gb2Ygc2ltaWxhcml0eSwgaXQgb25seSBrbm93cyBhYm91dCBlcXVhbGl0eS5cblx0XHRcdCAqIFdlIGNhbiB1c2Ugb3RoZXIgYWxnb3JpdGhtcyB0byBmaW5kIHNpbWlsYXJpdHkuXG5cdFx0XHQgKiBTbyBpZiB3ZSBlbGltaW5hdGUgQSwgQiwgd2UgYXJlIGxlZnQgd2l0aCBDLCBELCBFLCBGIGFuZCB3ZSBuZWVkIHRvIGZpbmQgd2hhdCB0aGV5IG1hcCB0byBpbiBgZSwgRmAgaW4gbW9kaWZlZCBkb2N1bWVudC5cblx0XHRcdCAqIFdlIGNhbiB1c2UgYSBzaW1pbGFyaXR5IGFsZ29yaXRobSB0byBmaW5kIHRoYXQuXG5cdFx0XHQgKlxuXHRcdFx0ICogVGhlIHB1cnBvc2Ugb2YgdXNpbmcgTENTIGZpcnN0IGlzIHRvIGZpbmQgdGhlIGNlbGxzIHRoYXQgaGF2ZSBub3QgY2hhbmdlZC5cblx0XHRcdCAqIFRoaXMgYXZvaWRzIHRoZSBuZWVkIHRvIHVzZSBzaW1pbGFyaXR5IGFsZ29yaXRobXMgb24gYWxsIGNlbGxzLlxuXHRcdFx0ICpcblx0XHRcdCAqIEF0IHRoZSBlbmQgb2YgdGhlIGRheSB3aGF0IHdlIG5lZWQgaXMgYXMgZm9sbG93c1xuXHRcdFx0ICogQSA8PT4gQVxuXHRcdFx0ICogQiA8PT4gQlxuXHRcdFx0ICogQyA9PiBEZWxldGVkXG5cdFx0XHQgKiBEID0+IERlbGV0ZWRcblx0XHRcdCAqIEUgPT4gZVxuXHRcdFx0ICogRiA9PiBGXG5cdFx0XHQgKi9cblxuXG5cblx0XHRcdC8vIE5vdGUsIGlmIGNlbGxzIGFyZSBzd2FwcGVkLCB0aGVuIHRoaXMgY29tcGlsaWNhdGVzIHRoaW5nc1xuXHRcdFx0Ly8gVHJ5aW5nIHRvIHNvbHZlIGRpZmYgbWFudWFsbHkgaXMgbm90IGVhc3kuXG5cdFx0XHQvLyBMZXRzIGluc3RlYWQgdXNlIExDUyBmaW5kIHRoZSBjZWxscyB0aGF0IGhhdmVuJ3QgY2hhbmdlZCxcblx0XHRcdC8vICYgdGhlIGNlbGxzIHRoYXQgaGF2ZS5cblx0XHRcdC8vIEZvciB0aGUgcmFuZ2Ugb2YgY2VsbHMgdGhhdCBoYXZlIGNoYW5nZSwgbGV0cyBzZWUgaWYgd2UgY2FuIGdldCBiZXR0ZXIgcmVzdWx0cyB1c2luZyBzaW1pbGFyaXR5IGFsZ29yaXRobXMuXG5cdFx0XHQvLyBBc3N1bWUgd2UgaGF2ZVxuXHRcdFx0Ly8gQ29kZSBDZWxsID0gcHJpbnQoXCJIZWxsbyBXb3JsZFwiKVxuXHRcdFx0Ly8gQ29kZSBDZWxsID0gcHJpbnQoXCJGb28gQmFyXCIpXG5cdFx0XHQvLyBXZSBub3cgY2hhbmdlIHRoaXMgdG9cblx0XHRcdC8vIE1EIENlbGwgPSAjIERlc2NyaXB0aW9uXG5cdFx0XHQvLyBDb2RlIENlbGwgPSBwcmludChcIkhlbGxvIFdvcmxkWlwiKVxuXHRcdFx0Ly8gQ29kZSBDZWxsID0gcHJpbnQoXCJGb28gQmFyWlwiKVxuXHRcdFx0Ly8gTENTIHdpbGwgdGVsbCB1cyB0aGF0IGV2ZXJ5dGhpbmcgY2hhbmdlZC5cblx0XHRcdC8vIEJ1dCB1c2luZyBzaW1pbGFyaXR5IGFsZ29yaXRobXMgd2UgY2FuIHRlbGwgdGhhdCB0aGUgZmlyc3QgY2VsbCBpcyBuZXcgYW5kIGxhc3QgMiBjaGFuZ2VkLlxuXG5cblxuXHRcdFx0Ly8gTGV0cyB0cnkgdGhlIHNpbWlsYXJpdHkgYWxnb3JpdGhtcyBvbiBhbGwgY2VsbHMuXG5cdFx0XHQvLyBXZSBtaWdodCBmYXJlIGJldHRlci5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IG1hdGNoQ2VsbEJhc2VkT25TaW1pbGFydGllcyhtb2RpZmllZC5jZWxscywgb3JpZ2luYWwuY2VsbHMpO1xuXHRcdFx0Ly8gSWYgd2UgaGF2ZSBhdCBsZWFzdCBvbmUgbWF0Y2gsIHRoZW4gZ3JlYXQuXG5cdFx0XHRpZiAocmVzdWx0LnNvbWUoYyA9PiBjLm9yaWdpbmFsICE9PSAtMSkpIHtcblx0XHRcdFx0Ly8gV2UgaGF2ZSBtYW5hZ2VkIHRvIGZpbmQgc2ltaWxhcml0aWVzIGJldHdlZW4gY2VsbHMuXG5cdFx0XHRcdC8vIE5vdyB3ZSBjYW4gZGVmaW5pdGVseSBmaW5kIHdoYXQgY2VsbCBpcyBuZXcvcmVtb3ZlZC5cblx0XHRcdFx0dGhpcy51cGRhdGVDZWxsSWRzQmFzZWRPbk1hcHBpbmdzKHJlc3VsdCwgb3JpZ2luYWwuY2VsbHMsIG1vZGlmaWVkLmNlbGxzKTtcblx0XHRcdFx0ZGlmZlVzaW5nQ2VsbElkcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFkaWZmVXNpbmdDZWxsSWRzKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtZXRhZGF0YUNoYW5nZWQsXG5cdFx0XHRcdGNlbGxzRGlmZjogb3JpZ2luYWxEaWZmXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEF0IHRoaXMgc3RhZ2Ugd2UgY2FuIHVzZSBpbnRlcm5hbE1ldGFkYXRhLmNlbGxJZCBmb3IgdHJhY2tpbmcgY2hhbmdlcy5cblx0XHQvLyBJLmUuIHdlIGNvbXB1dGUgTENTIGRpZmYgYW5kIHRoZSBoYXNoZXMgb2Ygc29tZSBjZWxscyBmcm9tIG9yaWdpbmFsIHdpbGwgYmUgZXF1YWwgdG8gdGhhdCBpbiBtb2RpZmllZCBhcyB3ZSdyZSB1c2luZyBjZWxsSWQuXG5cdFx0Ly8gVGh1cyB3ZSBjYW4gZmluZCB3aGF0IGNlbGxzIGFyZSBuZXcvZGVsZXRlZC5cblx0XHQvLyBBZnRlciB0aGF0IHdlIGNhbiBmaW5kIHdoZXRoZXIgdGhlIGNvbnRlbnRzIG9mIHRoZSBjZWxscyBjaGFuZ2VkLlxuXHRcdGNvbnN0IGNlbGxzSW5zZXJ0ZWRPckRlbGV0ZWREaWZmID0gbmV3IExjc0RpZmYoQ2VsbFNlcXVlbmNlLmNyZWF0ZVdpdGhDZWxsSWQob3JpZ2luYWwuY2VsbHMpLCBDZWxsU2VxdWVuY2UuY3JlYXRlV2l0aENlbGxJZChtb2RpZmllZC5jZWxscykpLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRjb25zdCBjZWxsRGlmZkluZm8gPSBjb21wdXRlRGlmZihvcmlnaW5hbE1vZGVsLCBtb2RpZmllZE1vZGVsLCB7IGNlbGxzRGlmZjogeyBjaGFuZ2VzOiBjZWxsc0luc2VydGVkT3JEZWxldGVkRGlmZi5jaGFuZ2VzLCBxdWl0RWFybHk6IGZhbHNlIH0sIG1ldGFkYXRhQ2hhbmdlZDogZmFsc2UsIH0pLmNlbGxEaWZmSW5mbztcblxuXHRcdGxldCBwcm9jZXNzZWRJbmRleCA9IDA7XG5cdFx0Y29uc3QgY2hhbmdlczogSURpZmZDaGFuZ2VbXSA9IFtdO1xuXHRcdGNlbGxzSW5zZXJ0ZWRPckRlbGV0ZWREaWZmLmNoYW5nZXMuZm9yRWFjaChjaGFuZ2UgPT4ge1xuXHRcdFx0aWYgKCFjaGFuZ2Uub3JpZ2luYWxMZW5ndGggJiYgY2hhbmdlLm1vZGlmaWVkTGVuZ3RoKSB7XG5cdFx0XHRcdC8vIEluc2VydGVkLlxuXHRcdFx0XHQvLyBGaW5kIGFsbCBtb2RpZmllZCBjZWxscyBiZWZvcmUgdGhpcy5cblx0XHRcdFx0Y29uc3QgY2hhbmdlSW5kZXggPSBjZWxsRGlmZkluZm8uZmluZEluZGV4KGMgPT4gYy50eXBlID09PSAnaW5zZXJ0JyAmJiBjLm1vZGlmaWVkQ2VsbEluZGV4ID09PSBjaGFuZ2UubW9kaWZpZWRTdGFydCk7XG5cdFx0XHRcdGNlbGxEaWZmSW5mby5zbGljZShwcm9jZXNzZWRJbmRleCwgY2hhbmdlSW5kZXgpLmZvckVhY2goYyA9PiB7XG5cdFx0XHRcdFx0aWYgKGMudHlwZSA9PT0gJ3VuY2hhbmdlZCcgfHwgYy50eXBlID09PSAnbW9kaWZpZWQnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbENlbGwgPSBvcmlnaW5hbC5jZWxsc1tjLm9yaWdpbmFsQ2VsbEluZGV4XTtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkQ2VsbCA9IG1vZGlmaWVkLmNlbGxzW2MubW9kaWZpZWRDZWxsSW5kZXhdO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhbmdlZCA9IGMudHlwZSA9PT0gJ21vZGlmaWVkJyB8fCBvcmlnaW5hbENlbGwuZ2V0Q29tcGFyaXNvblZhbHVlKCkgIT09IG1vZGlmaWVkQ2VsbC5nZXRDb21wYXJpc29uVmFsdWUoKTtcblx0XHRcdFx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRcdGNoYW5nZXMucHVzaChuZXcgRGlmZkNoYW5nZShjLm9yaWdpbmFsQ2VsbEluZGV4LCAxLCBjLm1vZGlmaWVkQ2VsbEluZGV4LCAxKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y2hhbmdlcy5wdXNoKGNoYW5nZSk7XG5cdFx0XHRcdHByb2Nlc3NlZEluZGV4ID0gY2hhbmdlSW5kZXggKyAxO1xuXHRcdFx0fSBlbHNlIGlmIChjaGFuZ2Uub3JpZ2luYWxMZW5ndGggJiYgIWNoYW5nZS5tb2RpZmllZExlbmd0aCkge1xuXHRcdFx0XHQvLyBEZWxldGVkLlxuXHRcdFx0XHQvLyBGaW5kIGFsbCBtb2RpZmllZCBjZWxscyBiZWZvcmUgdGhpcy5cblx0XHRcdFx0Y29uc3QgY2hhbmdlSW5kZXggPSBjZWxsRGlmZkluZm8uZmluZEluZGV4KGMgPT4gYy50eXBlID09PSAnZGVsZXRlJyAmJiBjLm9yaWdpbmFsQ2VsbEluZGV4ID09PSBjaGFuZ2Uub3JpZ2luYWxTdGFydCk7XG5cdFx0XHRcdGNlbGxEaWZmSW5mby5zbGljZShwcm9jZXNzZWRJbmRleCwgY2hhbmdlSW5kZXgpLmZvckVhY2goYyA9PiB7XG5cdFx0XHRcdFx0aWYgKGMudHlwZSA9PT0gJ3VuY2hhbmdlZCcgfHwgYy50eXBlID09PSAnbW9kaWZpZWQnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbENlbGwgPSBvcmlnaW5hbC5jZWxsc1tjLm9yaWdpbmFsQ2VsbEluZGV4XTtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkQ2VsbCA9IG1vZGlmaWVkLmNlbGxzW2MubW9kaWZpZWRDZWxsSW5kZXhdO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhbmdlZCA9IGMudHlwZSA9PT0gJ21vZGlmaWVkJyB8fCBvcmlnaW5hbENlbGwuZ2V0Q29tcGFyaXNvblZhbHVlKCkgIT09IG1vZGlmaWVkQ2VsbC5nZXRDb21wYXJpc29uVmFsdWUoKTtcblx0XHRcdFx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRcdGNoYW5nZXMucHVzaChuZXcgRGlmZkNoYW5nZShjLm9yaWdpbmFsQ2VsbEluZGV4LCAxLCBjLm1vZGlmaWVkQ2VsbEluZGV4LCAxKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y2hhbmdlcy5wdXNoKGNoYW5nZSk7XG5cdFx0XHRcdHByb2Nlc3NlZEluZGV4ID0gY2hhbmdlSW5kZXggKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVGhpcyBjb3VsZCBiZSBhIHNpdHVhdGlvbiB3aGVyZSBhIGNlbGwgaGFzIGJlZW4gZGVsZXRlZCBvbiBsZWZ0IGFuZCBpbnNlcnRlZCBvbiB0aGUgcmlnaHQuXG5cdFx0XHRcdC8vIEUuZy4gbWFya2Rvd24gY2VsbCBkZWxldGVkIGFuZCBjb2RlIGNlbGwgaW5zZXJ0ZWQuXG5cdFx0XHRcdC8vIEJ1dCBMQ1Mgc2hvd3MgdGhlbSBhcyBhIG1vZGlmaWNhdGlvbi5cblx0XHRcdFx0Y29uc3QgY2hhbmdlSW5kZXggPSBjZWxsRGlmZkluZm8uZmluZEluZGV4KGMgPT4gKGMudHlwZSA9PT0gJ2RlbGV0ZScgJiYgYy5vcmlnaW5hbENlbGxJbmRleCA9PT0gY2hhbmdlLm9yaWdpbmFsU3RhcnQpIHx8IChjLnR5cGUgPT09ICdpbnNlcnQnICYmIGMubW9kaWZpZWRDZWxsSW5kZXggPT09IGNoYW5nZS5tb2RpZmllZFN0YXJ0KSk7XG5cdFx0XHRcdGNlbGxEaWZmSW5mby5zbGljZShwcm9jZXNzZWRJbmRleCwgY2hhbmdlSW5kZXgpLmZvckVhY2goYyA9PiB7XG5cdFx0XHRcdFx0aWYgKGMudHlwZSA9PT0gJ3VuY2hhbmdlZCcgfHwgYy50eXBlID09PSAnbW9kaWZpZWQnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbENlbGwgPSBvcmlnaW5hbC5jZWxsc1tjLm9yaWdpbmFsQ2VsbEluZGV4XTtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkQ2VsbCA9IG1vZGlmaWVkLmNlbGxzW2MubW9kaWZpZWRDZWxsSW5kZXhdO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhbmdlZCA9IGMudHlwZSA9PT0gJ21vZGlmaWVkJyB8fCBvcmlnaW5hbENlbGwuZ2V0Q29tcGFyaXNvblZhbHVlKCkgIT09IG1vZGlmaWVkQ2VsbC5nZXRDb21wYXJpc29uVmFsdWUoKTtcblx0XHRcdFx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRcdGNoYW5nZXMucHVzaChuZXcgRGlmZkNoYW5nZShjLm9yaWdpbmFsQ2VsbEluZGV4LCAxLCBjLm1vZGlmaWVkQ2VsbEluZGV4LCAxKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y2hhbmdlcy5wdXNoKGNoYW5nZSk7XG5cdFx0XHRcdHByb2Nlc3NlZEluZGV4ID0gY2hhbmdlSW5kZXggKyAxO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNlbGxEaWZmSW5mby5zbGljZShwcm9jZXNzZWRJbmRleCkuZm9yRWFjaChjID0+IHtcblx0XHRcdGlmIChjLnR5cGUgPT09ICd1bmNoYW5nZWQnIHx8IGMudHlwZSA9PT0gJ21vZGlmaWVkJykge1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbENlbGwgPSBvcmlnaW5hbC5jZWxsc1tjLm9yaWdpbmFsQ2VsbEluZGV4XTtcblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRDZWxsID0gbW9kaWZpZWQuY2VsbHNbYy5tb2RpZmllZENlbGxJbmRleF07XG5cdFx0XHRcdGNvbnN0IGNoYW5nZWQgPSBjLnR5cGUgPT09ICdtb2RpZmllZCcgfHwgb3JpZ2luYWxDZWxsLmdldENvbXBhcmlzb25WYWx1ZSgpICE9PSBtb2RpZmllZENlbGwuZ2V0Q29tcGFyaXNvblZhbHVlKCk7XG5cdFx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdFx0Y2hhbmdlcy5wdXNoKG5ldyBEaWZmQ2hhbmdlKGMub3JpZ2luYWxDZWxsSW5kZXgsIDEsIGMubW9kaWZpZWRDZWxsSW5kZXgsIDEpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1ldGFkYXRhQ2hhbmdlZCxcblx0XHRcdGNlbGxzRGlmZjoge1xuXHRcdFx0XHRjaGFuZ2VzLFxuXHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGNhbkNvbXB1dGVEaWZmV2l0aENlbGxJZHMob3JpZ2luYWw6IE1pcnJvck5vdGVib29rRG9jdW1lbnQsIG1vZGlmaWVkOiBNaXJyb3JOb3RlYm9va0RvY3VtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY2FuQ29tcHV0ZURpZmZXaXRoQ2VsbEludGVybmFsSWRzKG9yaWdpbmFsLCBtb2RpZmllZCkgfHwgdGhpcy5jYW5Db21wdXRlRGlmZldpdGhDZWxsTWV0YWRhdGFJZHMob3JpZ2luYWwsIG1vZGlmaWVkKTtcblx0fVxuXG5cdGNhbkNvbXB1dGVEaWZmV2l0aENlbGxJbnRlcm5hbElkcyhvcmlnaW5hbDogTWlycm9yTm90ZWJvb2tEb2N1bWVudCwgbW9kaWZpZWQ6IE1pcnJvck5vdGVib29rRG9jdW1lbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBvcmlnaW5hbENlbGxJbmRleElkcyA9IG9yaWdpbmFsLmNlbGxzLm1hcCgoY2VsbCwgaW5kZXgpID0+ICh7IGluZGV4LCBpZDogKGNlbGwuaW50ZXJuYWxNZXRhZGF0YT8uaW50ZXJuYWxJZCB8fCAnJykgYXMgc3RyaW5nIH0pKTtcblx0XHRjb25zdCBtb2RpZmllZENlbGxJbmRleElkcyA9IG1vZGlmaWVkLmNlbGxzLm1hcCgoY2VsbCwgaW5kZXgpID0+ICh7IGluZGV4LCBpZDogKGNlbGwuaW50ZXJuYWxNZXRhZGF0YT8uaW50ZXJuYWxJZCB8fCAnJykgYXMgc3RyaW5nIH0pKTtcblx0XHQvLyBJZiB3ZSBoYXZlIGEgY2VsbCB3aXRob3V0IGFuIGlkLCBkbyBub3QgdXNlIG1ldGFkYXRhLmlkIGZvciBkaWZmaW5nLlxuXHRcdGlmIChvcmlnaW5hbENlbGxJbmRleElkcy5zb21lKGMgPT4gIWMuaWQpIHx8IG1vZGlmaWVkQ2VsbEluZGV4SWRzLnNvbWUoYyA9PiAhYy5pZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gSWYgbm9uZSBvZiB0aGUgaWRzIGluIG9yaWdpbmFsIGNhbiBiZSBmb3VuZCBpbiBtb2RpZmllZCwgdGhlbiB3ZSBjYW4ndCB1c2UgbWV0YWRhdGEuaWQgZm9yIGRpZmZpbmcuXG5cdFx0Ly8gSS5lLiBldmVyeXRoaW5nIGlzIG5ldywgbm8gcG9pbnQgdHJ5aW5nLlxuXHRcdHJldHVybiBvcmlnaW5hbENlbGxJbmRleElkcy5zb21lKGMgPT4gbW9kaWZpZWRDZWxsSW5kZXhJZHMuZmluZChtID0+IG0uaWQgPT09IGMuaWQpKTtcblx0fVxuXG5cdGNhbkNvbXB1dGVEaWZmV2l0aENlbGxNZXRhZGF0YUlkcyhvcmlnaW5hbDogTWlycm9yTm90ZWJvb2tEb2N1bWVudCwgbW9kaWZpZWQ6IE1pcnJvck5vdGVib29rRG9jdW1lbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBvcmlnaW5hbENlbGxJbmRleElkcyA9IG9yaWdpbmFsLmNlbGxzLm1hcCgoY2VsbCwgaW5kZXgpID0+ICh7IGluZGV4LCBpZDogKGNlbGwubWV0YWRhdGE/LmlkIHx8ICcnKSBhcyBzdHJpbmcgfSkpO1xuXHRcdGNvbnN0IG1vZGlmaWVkQ2VsbEluZGV4SWRzID0gbW9kaWZpZWQuY2VsbHMubWFwKChjZWxsLCBpbmRleCkgPT4gKHsgaW5kZXgsIGlkOiAoY2VsbC5tZXRhZGF0YT8uaWQgfHwgJycpIGFzIHN0cmluZyB9KSk7XG5cdFx0Ly8gSWYgd2UgaGF2ZSBhIGNlbGwgd2l0aG91dCBhbiBpZCwgZG8gbm90IHVzZSBtZXRhZGF0YS5pZCBmb3IgZGlmZmluZy5cblx0XHRpZiAob3JpZ2luYWxDZWxsSW5kZXhJZHMuc29tZShjID0+ICFjLmlkKSB8fCBtb2RpZmllZENlbGxJbmRleElkcy5zb21lKGMgPT4gIWMuaWQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIElmIG5vbmUgb2YgdGhlIGlkcyBpbiBvcmlnaW5hbCBjYW4gYmUgZm91bmQgaW4gbW9kaWZpZWQsIHRoZW4gd2UgY2FuJ3QgdXNlIG1ldGFkYXRhLmlkIGZvciBkaWZmaW5nLlxuXHRcdC8vIEkuZS4gZXZlcnl0aGluZyBpcyBuZXcsIG5vIHBvaW50IHRyeWluZy5cblx0XHRpZiAob3JpZ2luYWxDZWxsSW5kZXhJZHMuZXZlcnkoYyA9PiAhbW9kaWZpZWRDZWxsSW5kZXhJZHMuZmluZChtID0+IG0uaWQgPT09IGMuaWQpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEludGVybmFsbHkgd2UgdXNlIGludGVybmFsTWV0YWRhdGEuY2VsbElkIGZvciBkaWZmaW5nLCBoZW5jZSB1cGRhdGUgdGhlIGludGVybmFsTWV0YWRhdGEuY2VsbElkXG5cdFx0b3JpZ2luYWwuY2VsbHMubWFwKChjZWxsLCBpbmRleCkgPT4ge1xuXHRcdFx0Y2VsbC5pbnRlcm5hbE1ldGFkYXRhID0gY2VsbC5pbnRlcm5hbE1ldGFkYXRhIHx8IHt9O1xuXHRcdFx0Y2VsbC5pbnRlcm5hbE1ldGFkYXRhLmludGVybmFsSWQgPSBjZWxsLm1ldGFkYXRhPy5pZCBhcyBzdHJpbmcgfHwgJyc7XG5cdFx0fSk7XG5cdFx0bW9kaWZpZWQuY2VsbHMubWFwKChjZWxsLCBpbmRleCkgPT4ge1xuXHRcdFx0Y2VsbC5pbnRlcm5hbE1ldGFkYXRhID0gY2VsbC5pbnRlcm5hbE1ldGFkYXRhIHx8IHt9O1xuXHRcdFx0Y2VsbC5pbnRlcm5hbE1ldGFkYXRhLmludGVybmFsSWQgPSBjZWxsLm1ldGFkYXRhPy5pZCBhcyBzdHJpbmcgfHwgJyc7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXG5cdGlzT3JpZ2luYWxDZWxsTWF0Y2hlZFdpdGhNb2RpZmllZENlbGwob3JpZ2luYWxDZWxsOiBNaXJyb3JDZWxsKSB7XG5cdFx0cmV0dXJuIChvcmlnaW5hbENlbGwuaW50ZXJuYWxNZXRhZGF0YT8uaW50ZXJuYWxJZCBhcyBzdHJpbmcgfHwgJycpLnN0YXJ0c1dpdGgoUFJFRklYX0ZPUl9VTk1BVENIRURfT1JJR0lOQUxfQ0VMTFMpO1xuXHR9XG5cdHVwZGF0ZUNlbGxJZHNCYXNlZE9uTWFwcGluZ3MobWFwcGluZ3M6IHsgbW9kaWZpZWQ6IG51bWJlcjsgb3JpZ2luYWw6IG51bWJlciB9W10sIG9yaWdpbmFsQ2VsbHM6IE1pcnJvckNlbGxbXSwgbW9kaWZpZWRDZWxsczogTWlycm9yQ2VsbFtdKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdXVpZHMgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xuXHRcdG9yaWdpbmFsQ2VsbHMubWFwKChjZWxsLCBpbmRleCkgPT4ge1xuXHRcdFx0Y2VsbC5pbnRlcm5hbE1ldGFkYXRhID0gY2VsbC5pbnRlcm5hbE1ldGFkYXRhIHx8IHsgaW50ZXJuYWxJZDogJycgfTtcblx0XHRcdGNlbGwuaW50ZXJuYWxNZXRhZGF0YS5pbnRlcm5hbElkID0gYCR7UFJFRklYX0ZPUl9VTk1BVENIRURfT1JJR0lOQUxfQ0VMTFN9JHtnZW5lcmF0ZVV1aWQoKX1gO1xuXHRcdFx0Y29uc3QgZm91bmQgPSBtYXBwaW5ncy5maW5kKHIgPT4gci5vcmlnaW5hbCA9PT0gaW5kZXgpO1xuXHRcdFx0aWYgKGZvdW5kKSB7XG5cdFx0XHRcdC8vIERvIG5vdCB1c2UgdGhlIGluZGV4ZXMgYXMgaWRzLlxuXHRcdFx0XHQvLyBJZiB3ZSBkbywgdGhlbiB0aGUgaGFzaGVzIHdpbGwgYmUgdmVyeSBzaW1pbGFyIGV4Y2VwdCBmb3IgbGFzdCBkaWdpdC5cblx0XHRcdFx0Y2VsbC5pbnRlcm5hbE1ldGFkYXRhLmludGVybmFsSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdFx0dXVpZHMuc2V0KGZvdW5kLm1vZGlmaWVkLCBjZWxsLmludGVybmFsTWV0YWRhdGEuaW50ZXJuYWxJZCBhcyBzdHJpbmcpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdG1vZGlmaWVkQ2VsbHMubWFwKChjZWxsLCBpbmRleCkgPT4ge1xuXHRcdFx0Y2VsbC5pbnRlcm5hbE1ldGFkYXRhID0gY2VsbC5pbnRlcm5hbE1ldGFkYXRhIHx8IHsgaW50ZXJuYWxJZDogJycgfTtcblx0XHRcdGNlbGwuaW50ZXJuYWxNZXRhZGF0YS5pbnRlcm5hbElkID0gdXVpZHMuZ2V0KGluZGV4KSA/PyBnZW5lcmF0ZVV1aWQoKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdCRjYW5Qcm9tcHRSZWNvbW1lbmRhdGlvbihtb2RlbFVybDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRNb2RlbChtb2RlbFVybCk7XG5cdFx0Y29uc3QgY2VsbHMgPSBtb2RlbC5jZWxscztcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2VsbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGNlbGwgPSBjZWxsc1tpXTtcblx0XHRcdGlmIChjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjZWxsLmxhbmd1YWdlICE9PSAncHl0aG9uJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnaW1wb3J0XFxcXHMqcGFuZGFzfGZyb21cXFxccypwYW5kYXMnLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cdFx0XHRjb25zdCBzZWFyY2hEYXRhID0gc2VhcmNoUGFyYW1zLnBhcnNlU2VhcmNoUmVxdWVzdCgpO1xuXG5cdFx0XHRpZiAoIXNlYXJjaERhdGEpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgUGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIoKTtcblx0XHRcdGJ1aWxkZXIuYWNjZXB0Q2h1bmsoY2VsbC5nZXRWYWx1ZSgpKTtcblx0XHRcdGNvbnN0IGJ1ZmZlckZhY3RvcnkgPSBidWlsZGVyLmZpbmlzaCh0cnVlKTtcblx0XHRcdGNvbnN0IHRleHRCdWZmZXIgPSBidWZmZXJGYWN0b3J5LmNyZWF0ZShjZWxsLmVvbCkudGV4dEJ1ZmZlcjtcblxuXHRcdFx0Y29uc3QgbGluZUNvdW50ID0gdGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGNvbnN0IG1heExpbmVDb3VudCA9IE1hdGgubWluKGxpbmVDb3VudCwgMjApO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoMSwgMSwgbWF4TGluZUNvdW50LCB0ZXh0QnVmZmVyLmdldExpbmVMZW5ndGgobWF4TGluZUNvdW50KSArIDEpO1xuXHRcdFx0Y29uc3QgY2VsbE1hdGNoZXMgPSB0ZXh0QnVmZmVyLmZpbmRNYXRjaGVzTGluZUJ5TGluZShyYW5nZSwgc2VhcmNoRGF0YSwgdHJ1ZSwgMSk7XG5cdFx0XHRpZiAoY2VsbE1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldE1vZGVsKHVyaTogc3RyaW5nKTogTWlycm9yTm90ZWJvb2tEb2N1bWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsc1t1cmldO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGUoKTogSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyIHtcblx0cmV0dXJuIG5ldyBOb3RlYm9va1dvcmtlcigpO1xufVxuXG5leHBvcnQgdHlwZSBDZWxsRGlmZkluZm8gPSB7XG5cdG9yaWdpbmFsQ2VsbEluZGV4OiBudW1iZXI7XG5cdG1vZGlmaWVkQ2VsbEluZGV4OiBudW1iZXI7XG5cdHR5cGU6ICd1bmNoYW5nZWQnIHwgJ21vZGlmaWVkJztcbn0gfFxue1xuXHRvcmlnaW5hbENlbGxJbmRleDogbnVtYmVyO1xuXHR0eXBlOiAnZGVsZXRlJztcbn0gfFxue1xuXHRtb2RpZmllZENlbGxJbmRleDogbnVtYmVyO1xuXHR0eXBlOiAnaW5zZXJ0Jztcbn07XG5cbmludGVyZmFjZSBJQ2VsbCB7XG5cdGNlbGxLaW5kOiBDZWxsS2luZDtcblx0Z2V0SGFzaFZhbHVlKCk6IG51bWJlcjtcblx0ZXF1YWwoY2VsbDogSUNlbGwpOiBib29sZWFuO1xufVxuXG5jbGFzcyBOb3RlYm9va1RleHRNb2RlbEZhY2FkZSB7XG5cdHB1YmxpYyByZWFkb25seSBjZWxsczogcmVhZG9ubHkgSUNlbGxbXTtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbm90ZWJvb2s6IE1pcnJvck5vdGVib29rRG9jdW1lbnRcblx0KSB7XG5cblx0XHR0aGlzLmNlbGxzID0gbm90ZWJvb2suY2VsbHMubWFwKGNlbGwgPT4gbmV3IE5vdGVib29rQ2VsbFRleHRNb2RlbEZhY2FkZShjZWxsKSk7XG5cdH1cblxufVxuY2xhc3MgTm90ZWJvb2tDZWxsVGV4dE1vZGVsRmFjYWRlIGltcGxlbWVudHMgSUNlbGwge1xuXHRnZXQgY2VsbEtpbmQoKTogQ2VsbEtpbmQge1xuXHRcdHJldHVybiB0aGlzLmNlbGwuY2VsbEtpbmQ7XG5cdH1cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjZWxsOiBNaXJyb3JDZWxsXG5cdCkge1xuXHR9XG5cdGdldEhhc2hWYWx1ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmNlbGwuZ2V0Q29tcGFyaXNvblZhbHVlKCk7XG5cdH1cblx0ZXF1YWwoY2VsbDogSUNlbGwpOiBib29sZWFuIHtcblx0XHRpZiAoY2VsbC5jZWxsS2luZCAhPT0gdGhpcy5jZWxsS2luZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRIYXNoVmFsdWUoKSA9PT0gY2VsbC5nZXRIYXNoVmFsdWUoKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxTQUFpQyxlQUFlO0FBQ2hELFNBQVMsUUFBUSxNQUFNLGtCQUFrQjtBQUV6QyxTQUFTLFdBQVc7QUFFcEIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxVQUEySSwrQkFBaUg7QUFDclEsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsY0FBYztBQUN2QixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMz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
