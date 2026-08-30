import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import * as extHostTypeConverters from "./extHostTypeConverters.js";
import { NotebookRange } from "./extHostTypes.js";
import * as notebookCommon from "../../contrib/notebook/common/notebookCommon.js";
import { isTextStreamMime } from "../../../base/common/mime.js";
class RawContentChangeEvent {
  constructor(start, deletedCount, deletedItems, items) {
    this.start = start;
    this.deletedCount = deletedCount;
    this.deletedItems = deletedItems;
    this.items = items;
  }
  asApiEvent() {
    return {
      range: new NotebookRange(this.start, this.start + this.deletedCount),
      addedCells: this.items.map((cell) => cell.apiCell),
      removedCells: this.deletedItems
    };
  }
}
class ExtHostCell {
  constructor(notebook, _extHostDocument, _cellData) {
    this.notebook = notebook;
    this._extHostDocument = _extHostDocument;
    this._cellData = _cellData;
    this.handle = _cellData.handle;
    this.uri = URI.revive(_cellData.uri);
    this.cellKind = _cellData.cellKind;
    this._outputs = _cellData.outputs.map(extHostTypeConverters.NotebookCellOutput.to);
    this._internalMetadata = _cellData.internalMetadata ?? {};
    this._metadata = Object.freeze(_cellData.metadata ?? {});
    this._previousResult = Object.freeze(extHostTypeConverters.NotebookCellExecutionSummary.to(_cellData.internalMetadata ?? {}));
  }
  static asModelAddData(cell) {
    return {
      EOL: cell.eol,
      lines: cell.source,
      languageId: cell.language,
      uri: cell.uri,
      isDirty: false,
      versionId: 1,
      encoding: "utf8"
    };
  }
  get internalMetadata() {
    return this._internalMetadata;
  }
  get apiCell() {
    if (!this._apiCell) {
      const that = this;
      const data = this._extHostDocument.getDocument(this.uri);
      if (!data) {
        throw new Error(`MISSING extHostDocument for notebook cell: ${this.uri}`);
      }
      const apiCell = {
        get index() {
          return that.notebook.getCellIndex(that);
        },
        notebook: that.notebook.apiNotebook,
        kind: extHostTypeConverters.NotebookCellKind.to(this._cellData.cellKind),
        document: data.document,
        get mime() {
          return that._mime;
        },
        set mime(value) {
          that._mime = value;
        },
        get outputs() {
          return that._outputs.slice(0);
        },
        get metadata() {
          return that._metadata;
        },
        get executionSummary() {
          return that._previousResult;
        }
      };
      this._apiCell = Object.freeze(apiCell);
    }
    return this._apiCell;
  }
  setOutputs(newOutputs) {
    this._outputs = newOutputs.map(extHostTypeConverters.NotebookCellOutput.to);
  }
  setOutputItems(outputId, append, newOutputItems) {
    const newItems = newOutputItems.map(extHostTypeConverters.NotebookCellOutputItem.to);
    const output = this._outputs.find((op) => op.id === outputId);
    if (output) {
      if (!append) {
        output.items.length = 0;
      }
      output.items.push(...newItems);
      if (output.items.length > 1 && output.items.every((item) => isTextStreamMime(item.mime))) {
        const mimeOutputs = /* @__PURE__ */ new Map();
        const mimeTypes = [];
        output.items.forEach((item) => {
          let items;
          if (mimeOutputs.has(item.mime)) {
            items = mimeOutputs.get(item.mime);
          } else {
            items = [];
            mimeOutputs.set(item.mime, items);
            mimeTypes.push(item.mime);
          }
          items.push(item.data);
        });
        output.items.length = 0;
        mimeTypes.forEach((mime) => {
          const compressed = notebookCommon.compressOutputItemStreams(mimeOutputs.get(mime));
          output.items.push({
            mime,
            data: compressed.data.buffer
          });
        });
      }
    }
  }
  setMetadata(newMetadata) {
    this._metadata = Object.freeze(newMetadata);
  }
  setInternalMetadata(newInternalMetadata) {
    this._internalMetadata = newInternalMetadata;
    this._previousResult = Object.freeze(extHostTypeConverters.NotebookCellExecutionSummary.to(newInternalMetadata));
  }
  setMime(newMime) {
  }
}
const _ExtHostNotebookDocument = class _ExtHostNotebookDocument {
  constructor(_proxy, _textDocumentsAndEditors, _textDocuments, uri, data) {
    this._proxy = _proxy;
    this._textDocumentsAndEditors = _textDocumentsAndEditors;
    this._textDocuments = _textDocuments;
    this.uri = uri;
    this.handle = _ExtHostNotebookDocument._handlePool++;
    this._cells = [];
    this._versionId = 0;
    this._isDirty = false;
    this._disposed = false;
    this._notebookType = data.viewType;
    this._metadata = Object.freeze(data.metadata ?? /* @__PURE__ */ Object.create(null));
    this._spliceNotebookCells([[0, 0, data.cells]], true, void 0);
    this._versionId = data.versionId;
  }
  dispose() {
    this._disposed = true;
  }
  get versionId() {
    return this._versionId;
  }
  get apiNotebook() {
    if (!this._notebook) {
      const that = this;
      const apiObject = {
        get uri() {
          return that.uri;
        },
        get version() {
          return that._versionId;
        },
        get notebookType() {
          return that._notebookType;
        },
        get isDirty() {
          return that._isDirty;
        },
        get isUntitled() {
          return that.uri.scheme === Schemas.untitled;
        },
        get isClosed() {
          return that._disposed;
        },
        get metadata() {
          return that._metadata;
        },
        get cellCount() {
          return that._cells.length;
        },
        cellAt(index) {
          index = that._validateIndex(index);
          return that._cells[index].apiCell;
        },
        getCells(range) {
          const cells = range ? that._getCells(range) : that._cells;
          return cells.map((cell) => cell.apiCell);
        },
        save() {
          return that._save();
        },
        [/* @__PURE__ */ Symbol.for("debug.description")]() {
          return `NotebookDocument(${this.uri.toString()})`;
        }
      };
      this._notebook = Object.freeze(apiObject);
    }
    return this._notebook;
  }
  acceptDocumentPropertiesChanged(data) {
    if (data.metadata) {
      this._metadata = Object.freeze({ ...this._metadata, ...data.metadata });
    }
  }
  acceptDirty(isDirty) {
    this._isDirty = isDirty;
  }
  acceptModelChanged(event, isDirty, newMetadata) {
    this._versionId = event.versionId;
    this._isDirty = isDirty;
    this.acceptDocumentPropertiesChanged({ metadata: newMetadata });
    const result = {
      notebook: this.apiNotebook,
      metadata: newMetadata,
      cellChanges: [],
      contentChanges: []
    };
    const relaxedCellChanges = [];
    for (const rawEvent of event.rawEvents) {
      if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ModelChange) {
        this._spliceNotebookCells(rawEvent.changes, false, result.contentChanges);
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Move) {
        this._moveCells(rawEvent.index, rawEvent.length, rawEvent.newIdx, result.contentChanges);
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Output) {
        this._setCellOutputs(rawEvent.index, rawEvent.outputs);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, outputs: this._cells[rawEvent.index].apiCell.outputs });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.OutputItem) {
        this._setCellOutputItems(rawEvent.index, rawEvent.outputId, rawEvent.append, rawEvent.outputItems);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, outputs: this._cells[rawEvent.index].apiCell.outputs });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellLanguage) {
        this._changeCellLanguage(rawEvent.index, rawEvent.language);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, document: this._cells[rawEvent.index].apiCell.document });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellContent) {
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, document: this._cells[rawEvent.index].apiCell.document });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMime) {
        this._changeCellMime(rawEvent.index, rawEvent.mime);
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMetadata) {
        this._changeCellMetadata(rawEvent.index, rawEvent.metadata);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, metadata: this._cells[rawEvent.index].apiCell.metadata });
      } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellInternalMetadata) {
        this._changeCellInternalMetadata(rawEvent.index, rawEvent.internalMetadata);
        relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, executionSummary: this._cells[rawEvent.index].apiCell.executionSummary });
      }
    }
    const map = /* @__PURE__ */ new Map();
    for (let i = 0; i < relaxedCellChanges.length; i++) {
      const relaxedCellChange = relaxedCellChanges[i];
      const existing = map.get(relaxedCellChange.cell);
      if (existing === void 0) {
        const newLen = result.cellChanges.push({
          document: void 0,
          executionSummary: void 0,
          metadata: void 0,
          outputs: void 0,
          ...relaxedCellChange
        });
        map.set(relaxedCellChange.cell, newLen - 1);
      } else {
        result.cellChanges[existing] = {
          ...result.cellChanges[existing],
          ...relaxedCellChange
        };
      }
    }
    Object.freeze(result);
    Object.freeze(result.cellChanges);
    Object.freeze(result.contentChanges);
    return result;
  }
  _validateIndex(index) {
    index = index | 0;
    if (index < 0) {
      return 0;
    } else if (index >= this._cells.length) {
      return this._cells.length - 1;
    } else {
      return index;
    }
  }
  _validateRange(range) {
    let start = range.start | 0;
    let end = range.end | 0;
    if (start < 0) {
      start = 0;
    }
    if (end > this._cells.length) {
      end = this._cells.length;
    }
    return range.with({ start, end });
  }
  _getCells(range) {
    range = this._validateRange(range);
    const result = [];
    for (let i = range.start; i < range.end; i++) {
      result.push(this._cells[i]);
    }
    return result;
  }
  async _save() {
    if (this._disposed) {
      return Promise.reject(new Error("Notebook has been closed"));
    }
    return this._proxy.$trySaveNotebook(this.uri);
  }
  _spliceNotebookCells(splices, initialization, bucket) {
    if (this._disposed) {
      return;
    }
    const contentChangeEvents = [];
    const addedCellDocuments = [];
    const removedCellDocuments = [];
    splices.reverse().forEach((splice) => {
      const cellDtos = splice[2];
      const newCells = cellDtos.map((cell) => {
        const extCell = new ExtHostCell(this, this._textDocumentsAndEditors, cell);
        if (!initialization) {
          addedCellDocuments.push(ExtHostCell.asModelAddData(cell));
        }
        return extCell;
      });
      const changeEvent = new RawContentChangeEvent(splice[0], splice[1], [], newCells);
      const deletedItems = this._cells.splice(splice[0], splice[1], ...newCells);
      for (const cell of deletedItems) {
        removedCellDocuments.push(cell.uri);
        changeEvent.deletedItems.push(cell.apiCell);
      }
      contentChangeEvents.push(changeEvent);
    });
    this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
      addedDocuments: addedCellDocuments,
      removedDocuments: removedCellDocuments
    });
    if (bucket) {
      for (const changeEvent of contentChangeEvents) {
        bucket.push(changeEvent.asApiEvent());
      }
    }
  }
  _moveCells(index, length, newIdx, bucket) {
    const cells = this._cells.splice(index, length);
    this._cells.splice(newIdx, 0, ...cells);
    const changes = [
      new RawContentChangeEvent(index, length, cells.map((c) => c.apiCell), []),
      new RawContentChangeEvent(newIdx, 0, [], cells)
    ];
    for (const change of changes) {
      bucket.push(change.asApiEvent());
    }
  }
  _setCellOutputs(index, outputs) {
    const cell = this._cells[index];
    cell.setOutputs(outputs);
  }
  _setCellOutputItems(index, outputId, append, outputItems) {
    const cell = this._cells[index];
    cell.setOutputItems(outputId, append, outputItems);
  }
  _changeCellLanguage(index, newLanguageId) {
    const cell = this._cells[index];
    if (cell.apiCell.document.languageId !== newLanguageId) {
      this._textDocuments.$acceptModelLanguageChanged(cell.uri, newLanguageId);
    }
  }
  _changeCellMime(index, newMime) {
    const cell = this._cells[index];
    cell.apiCell.mime = newMime;
  }
  _changeCellMetadata(index, newMetadata) {
    const cell = this._cells[index];
    cell.setMetadata(newMetadata);
  }
  _changeCellInternalMetadata(index, newInternalMetadata) {
    const cell = this._cells[index];
    cell.setInternalMetadata(newInternalMetadata);
  }
  getCellFromApiCell(apiCell) {
    return this._cells.find((cell) => cell.apiCell === apiCell);
  }
  getCellFromIndex(index) {
    return this._cells[index];
  }
  getCell(cellHandle) {
    return this._cells.find((cell) => cell.handle === cellHandle);
  }
  getCellIndex(cell) {
    return this._cells.indexOf(cell);
  }
};
_ExtHostNotebookDocument._handlePool = 0;
let ExtHostNotebookDocument = _ExtHostNotebookDocument;
export {
  ExtHostCell,
  ExtHostNotebookDocument
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Tm90ZWJvb2tEb2N1bWVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0UHJvdG9jb2wgZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlQ29udmVydGVycyBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1JhbmdlIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0ICogYXMgbm90ZWJvb2tDb21tb24gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBpc1RleHRTdHJlYW1NaW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5cbmNsYXNzIFJhd0NvbnRlbnRDaGFuZ2VFdmVudCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc3RhcnQ6IG51bWJlcixcblx0XHRyZWFkb25seSBkZWxldGVkQ291bnQ6IG51bWJlcixcblx0XHRyZWFkb25seSBkZWxldGVkSXRlbXM6IHZzY29kZS5Ob3RlYm9va0NlbGxbXSxcblx0XHRyZWFkb25seSBpdGVtczogRXh0SG9zdENlbGxbXVxuXHQpIHsgfVxuXG5cdGFzQXBpRXZlbnQoKTogdnNjb2RlLk5vdGVib29rRG9jdW1lbnRDb250ZW50Q2hhbmdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IG5ldyBOb3RlYm9va1JhbmdlKHRoaXMuc3RhcnQsIHRoaXMuc3RhcnQgKyB0aGlzLmRlbGV0ZWRDb3VudCksXG5cdFx0XHRhZGRlZENlbGxzOiB0aGlzLml0ZW1zLm1hcChjZWxsID0+IGNlbGwuYXBpQ2VsbCksXG5cdFx0XHRyZW1vdmVkQ2VsbHM6IHRoaXMuZGVsZXRlZEl0ZW1zLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RDZWxsIHtcblxuXHRzdGF0aWMgYXNNb2RlbEFkZERhdGEoY2VsbDogZXh0SG9zdFByb3RvY29sLk5vdGVib29rQ2VsbER0byk6IGV4dEhvc3RQcm90b2NvbC5JTW9kZWxBZGRlZERhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRFT0w6IGNlbGwuZW9sLFxuXHRcdFx0bGluZXM6IGNlbGwuc291cmNlLFxuXHRcdFx0bGFuZ3VhZ2VJZDogY2VsbC5sYW5ndWFnZSxcblx0XHRcdHVyaTogY2VsbC51cmksXG5cdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdHZlcnNpb25JZDogMSxcblx0XHRcdGVuY29kaW5nOiAndXRmOCdcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfb3V0cHV0czogdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dFtdO1xuXHRwcml2YXRlIF9tZXRhZGF0YTogUmVhZG9ubHk8bm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsTWV0YWRhdGE+O1xuXHRwcml2YXRlIF9wcmV2aW91c1Jlc3VsdDogUmVhZG9ubHk8dnNjb2RlLk5vdGVib29rQ2VsbEV4ZWN1dGlvblN1bW1hcnkgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgX2ludGVybmFsTWV0YWRhdGE6IG5vdGVib29rQ29tbW9uLk5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE7XG5cdHJlYWRvbmx5IGhhbmRsZTogbnVtYmVyO1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgY2VsbEtpbmQ6IG5vdGVib29rQ29tbW9uLkNlbGxLaW5kO1xuXG5cdHByaXZhdGUgX2FwaUNlbGw6IHZzY29kZS5Ob3RlYm9va0NlbGwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21pbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBub3RlYm9vazogRXh0SG9zdE5vdGVib29rRG9jdW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdERvY3VtZW50OiBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jZWxsRGF0YTogZXh0SG9zdFByb3RvY29sLk5vdGVib29rQ2VsbER0byxcblx0KSB7XG5cdFx0dGhpcy5oYW5kbGUgPSBfY2VsbERhdGEuaGFuZGxlO1xuXHRcdHRoaXMudXJpID0gVVJJLnJldml2ZShfY2VsbERhdGEudXJpKTtcblx0XHR0aGlzLmNlbGxLaW5kID0gX2NlbGxEYXRhLmNlbGxLaW5kO1xuXHRcdHRoaXMuX291dHB1dHMgPSBfY2VsbERhdGEub3V0cHV0cy5tYXAoZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLk5vdGVib29rQ2VsbE91dHB1dC50byk7XG5cdFx0dGhpcy5faW50ZXJuYWxNZXRhZGF0YSA9IF9jZWxsRGF0YS5pbnRlcm5hbE1ldGFkYXRhID8/IHt9O1xuXHRcdHRoaXMuX21ldGFkYXRhID0gT2JqZWN0LmZyZWV6ZShfY2VsbERhdGEubWV0YWRhdGEgPz8ge30pO1xuXHRcdHRoaXMuX3ByZXZpb3VzUmVzdWx0ID0gT2JqZWN0LmZyZWV6ZShleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3VtbWFyeS50byhfY2VsbERhdGEuaW50ZXJuYWxNZXRhZGF0YSA/PyB7fSkpO1xuXHR9XG5cblx0Z2V0IGludGVybmFsTWV0YWRhdGEoKTogbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSB7XG5cdFx0cmV0dXJuIHRoaXMuX2ludGVybmFsTWV0YWRhdGE7XG5cdH1cblxuXHRnZXQgYXBpQ2VsbCgpOiB2c2NvZGUuTm90ZWJvb2tDZWxsIHtcblx0XHRpZiAoIXRoaXMuX2FwaUNlbGwpIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2V4dEhvc3REb2N1bWVudC5nZXREb2N1bWVudCh0aGlzLnVyaSk7XG5cdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNSVNTSU5HIGV4dEhvc3REb2N1bWVudCBmb3Igbm90ZWJvb2sgY2VsbDogJHt0aGlzLnVyaX1gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFwaUNlbGw6IHZzY29kZS5Ob3RlYm9va0NlbGwgPSB7XG5cdFx0XHRcdGdldCBpbmRleCgpIHsgcmV0dXJuIHRoYXQubm90ZWJvb2suZ2V0Q2VsbEluZGV4KHRoYXQpOyB9LFxuXHRcdFx0XHRub3RlYm9vazogdGhhdC5ub3RlYm9vay5hcGlOb3RlYm9vayxcblx0XHRcdFx0a2luZDogZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLk5vdGVib29rQ2VsbEtpbmQudG8odGhpcy5fY2VsbERhdGEuY2VsbEtpbmQpLFxuXHRcdFx0XHRkb2N1bWVudDogZGF0YS5kb2N1bWVudCxcblx0XHRcdFx0Z2V0IG1pbWUoKSB7IHJldHVybiB0aGF0Ll9taW1lOyB9LFxuXHRcdFx0XHRzZXQgbWltZSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7IHRoYXQuX21pbWUgPSB2YWx1ZTsgfSxcblx0XHRcdFx0Z2V0IG91dHB1dHMoKSB7IHJldHVybiB0aGF0Ll9vdXRwdXRzLnNsaWNlKDApOyB9LFxuXHRcdFx0XHRnZXQgbWV0YWRhdGEoKSB7IHJldHVybiB0aGF0Ll9tZXRhZGF0YTsgfSxcblx0XHRcdFx0Z2V0IGV4ZWN1dGlvblN1bW1hcnkoKSB7IHJldHVybiB0aGF0Ll9wcmV2aW91c1Jlc3VsdDsgfVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2FwaUNlbGwgPSBPYmplY3QuZnJlZXplKGFwaUNlbGwpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYXBpQ2VsbDtcblx0fVxuXG5cdHNldE91dHB1dHMobmV3T3V0cHV0czogZXh0SG9zdFByb3RvY29sLk5vdGVib29rT3V0cHV0RHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9vdXRwdXRzID0gbmV3T3V0cHV0cy5tYXAoZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLk5vdGVib29rQ2VsbE91dHB1dC50byk7XG5cdH1cblxuXHRzZXRPdXRwdXRJdGVtcyhvdXRwdXRJZDogc3RyaW5nLCBhcHBlbmQ6IGJvb2xlYW4sIG5ld091dHB1dEl0ZW1zOiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tPdXRwdXRJdGVtRHRvW10pIHtcblx0XHRjb25zdCBuZXdJdGVtcyA9IG5ld091dHB1dEl0ZW1zLm1hcChleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tDZWxsT3V0cHV0SXRlbS50byk7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gdGhpcy5fb3V0cHV0cy5maW5kKG9wID0+IG9wLmlkID09PSBvdXRwdXRJZCk7XG5cdFx0aWYgKG91dHB1dCkge1xuXHRcdFx0aWYgKCFhcHBlbmQpIHtcblx0XHRcdFx0b3V0cHV0Lml0ZW1zLmxlbmd0aCA9IDA7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQuaXRlbXMucHVzaCguLi5uZXdJdGVtcyk7XG5cblx0XHRcdGlmIChvdXRwdXQuaXRlbXMubGVuZ3RoID4gMSAmJiBvdXRwdXQuaXRlbXMuZXZlcnkoaXRlbSA9PiBpc1RleHRTdHJlYW1NaW1lKGl0ZW0ubWltZSkpKSB7XG5cdFx0XHRcdC8vIExvb2sgZm9yIHRoZSBtaW1lcyBpbiB0aGUgaXRlbXMsIGFuZCBrZWVwIHRyYWNrIG9mIHRoZWlyIG9yZGVyLlxuXHRcdFx0XHQvLyBNZXJnZSB0aGUgc3RyZWFtcyBpbnRvIG9uZSBvdXRwdXQgaXRlbSwgcGVyIG1pbWUgdHlwZS5cblx0XHRcdFx0Y29uc3QgbWltZU91dHB1dHMgPSBuZXcgTWFwPHN0cmluZywgVWludDhBcnJheVtdPigpO1xuXHRcdFx0XHRjb25zdCBtaW1lVHlwZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdG91dHB1dC5pdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuXHRcdFx0XHRcdGxldCBpdGVtczogVWludDhBcnJheVtdO1xuXHRcdFx0XHRcdGlmIChtaW1lT3V0cHV0cy5oYXMoaXRlbS5taW1lKSkge1xuXHRcdFx0XHRcdFx0aXRlbXMgPSBtaW1lT3V0cHV0cy5nZXQoaXRlbS5taW1lKSE7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGl0ZW1zID0gW107XG5cdFx0XHRcdFx0XHRtaW1lT3V0cHV0cy5zZXQoaXRlbS5taW1lLCBpdGVtcyk7XG5cdFx0XHRcdFx0XHRtaW1lVHlwZXMucHVzaChpdGVtLm1pbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpdGVtcy5wdXNoKGl0ZW0uZGF0YSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRvdXRwdXQuaXRlbXMubGVuZ3RoID0gMDtcblx0XHRcdFx0bWltZVR5cGVzLmZvckVhY2gobWltZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29tcHJlc3NlZCA9IG5vdGVib29rQ29tbW9uLmNvbXByZXNzT3V0cHV0SXRlbVN0cmVhbXMobWltZU91dHB1dHMuZ2V0KG1pbWUpISk7XG5cdFx0XHRcdFx0b3V0cHV0Lml0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0bWltZSxcblx0XHRcdFx0XHRcdGRhdGE6IGNvbXByZXNzZWQuZGF0YS5idWZmZXJcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2V0TWV0YWRhdGEobmV3TWV0YWRhdGE6IG5vdGVib29rQ29tbW9uLk5vdGVib29rQ2VsbE1ldGFkYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fbWV0YWRhdGEgPSBPYmplY3QuZnJlZXplKG5ld01ldGFkYXRhKTtcblx0fVxuXG5cdHNldEludGVybmFsTWV0YWRhdGEobmV3SW50ZXJuYWxNZXRhZGF0YTogbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX2ludGVybmFsTWV0YWRhdGEgPSBuZXdJbnRlcm5hbE1ldGFkYXRhO1xuXHRcdHRoaXMuX3ByZXZpb3VzUmVzdWx0ID0gT2JqZWN0LmZyZWV6ZShleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3VtbWFyeS50byhuZXdJbnRlcm5hbE1ldGFkYXRhKSk7XG5cdH1cblxuXHRzZXRNaW1lKG5ld01pbWU6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdE5vdGVib29rRG9jdW1lbnQge1xuXG5cdHByaXZhdGUgc3RhdGljIF9oYW5kbGVQb29sOiBudW1iZXIgPSAwO1xuXHRyZWFkb25seSBoYW5kbGUgPSBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudC5faGFuZGxlUG9vbCsrO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NlbGxzOiBFeHRIb3N0Q2VsbFtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tUeXBlOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSBfbm90ZWJvb2s6IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tZXRhZGF0YTogUmVjb3JkPHN0cmluZywgYW55Pjtcblx0cHJpdmF0ZSBfdmVyc2lvbklkOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9pc0RpcnR5OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2Rpc3Bvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IGV4dEhvc3RQcm90b2NvbC5NYWluVGhyZWFkTm90ZWJvb2tEb2N1bWVudHNTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXh0RG9jdW1lbnRzQW5kRWRpdG9yczogRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGV4dERvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRyZWFkb25seSB1cmk6IFVSSSxcblx0XHRkYXRhOiBleHRIb3N0UHJvdG9jb2wuSU5vdGVib29rTW9kZWxBZGRlZERhdGFcblx0KSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tUeXBlID0gZGF0YS52aWV3VHlwZTtcblx0XHR0aGlzLl9tZXRhZGF0YSA9IE9iamVjdC5mcmVlemUoZGF0YS5tZXRhZGF0YSA/PyBPYmplY3QuY3JlYXRlKG51bGwpKTtcblx0XHR0aGlzLl9zcGxpY2VOb3RlYm9va0NlbGxzKFtbMCwgMCwgZGF0YS5jZWxsc11dLCB0cnVlIC8qIGluaXQgLT4gbm8gZXZlbnQqLywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl92ZXJzaW9uSWQgPSBkYXRhLnZlcnNpb25JZDtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHR9XG5cblx0Z2V0IHZlcnNpb25JZCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl92ZXJzaW9uSWQ7XG5cdH1cblxuXHRnZXQgYXBpTm90ZWJvb2soKTogdnNjb2RlLk5vdGVib29rRG9jdW1lbnQge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2spIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0Y29uc3QgYXBpT2JqZWN0OiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudCA9IHtcblx0XHRcdFx0Z2V0IHVyaSgpIHsgcmV0dXJuIHRoYXQudXJpOyB9LFxuXHRcdFx0XHRnZXQgdmVyc2lvbigpIHsgcmV0dXJuIHRoYXQuX3ZlcnNpb25JZDsgfSxcblx0XHRcdFx0Z2V0IG5vdGVib29rVHlwZSgpIHsgcmV0dXJuIHRoYXQuX25vdGVib29rVHlwZTsgfSxcblx0XHRcdFx0Z2V0IGlzRGlydHkoKSB7IHJldHVybiB0aGF0Ll9pc0RpcnR5OyB9LFxuXHRcdFx0XHRnZXQgaXNVbnRpdGxlZCgpIHsgcmV0dXJuIHRoYXQudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZDsgfSxcblx0XHRcdFx0Z2V0IGlzQ2xvc2VkKCkgeyByZXR1cm4gdGhhdC5fZGlzcG9zZWQ7IH0sXG5cdFx0XHRcdGdldCBtZXRhZGF0YSgpIHsgcmV0dXJuIHRoYXQuX21ldGFkYXRhOyB9LFxuXHRcdFx0XHRnZXQgY2VsbENvdW50KCkgeyByZXR1cm4gdGhhdC5fY2VsbHMubGVuZ3RoOyB9LFxuXHRcdFx0XHRjZWxsQXQoaW5kZXgpIHtcblx0XHRcdFx0XHRpbmRleCA9IHRoYXQuX3ZhbGlkYXRlSW5kZXgoaW5kZXgpO1xuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll9jZWxsc1tpbmRleF0uYXBpQ2VsbDtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0Q2VsbHMocmFuZ2UpIHtcblx0XHRcdFx0XHRjb25zdCBjZWxscyA9IHJhbmdlID8gdGhhdC5fZ2V0Q2VsbHMocmFuZ2UpIDogdGhhdC5fY2VsbHM7XG5cdFx0XHRcdFx0cmV0dXJuIGNlbGxzLm1hcChjZWxsID0+IGNlbGwuYXBpQ2VsbCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNhdmUoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuX3NhdmUoKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0W1N5bWJvbC5mb3IoJ2RlYnVnLmRlc2NyaXB0aW9uJyldKCkge1xuXHRcdFx0XHRcdHJldHVybiBgTm90ZWJvb2tEb2N1bWVudCgke3RoaXMudXJpLnRvU3RyaW5nKCl9KWA7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9ub3RlYm9vayA9IE9iamVjdC5mcmVlemUoYXBpT2JqZWN0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rO1xuXHR9XG5cblx0YWNjZXB0RG9jdW1lbnRQcm9wZXJ0aWVzQ2hhbmdlZChkYXRhOiBleHRIb3N0UHJvdG9jb2wuSU5vdGVib29rRG9jdW1lbnRQcm9wZXJ0aWVzQ2hhbmdlRGF0YSkge1xuXHRcdGlmIChkYXRhLm1ldGFkYXRhKSB7XG5cdFx0XHR0aGlzLl9tZXRhZGF0YSA9IE9iamVjdC5mcmVlemUoeyAuLi50aGlzLl9tZXRhZGF0YSwgLi4uZGF0YS5tZXRhZGF0YSB9KTtcblx0XHR9XG5cdH1cblxuXHRhY2NlcHREaXJ0eShpc0RpcnR5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEaXJ0eSA9IGlzRGlydHk7XG5cdH1cblxuXHRhY2NlcHRNb2RlbENoYW5nZWQoZXZlbnQ6IGV4dEhvc3RQcm90b2NvbC5Ob3RlYm9va0NlbGxzQ2hhbmdlZEV2ZW50RHRvLCBpc0RpcnR5OiBib29sZWFuLCBuZXdNZXRhZGF0YTogbm90ZWJvb2tDb21tb24uTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhIHwgdW5kZWZpbmVkKTogdnNjb2RlLk5vdGVib29rRG9jdW1lbnRDaGFuZ2VFdmVudCB7XG5cdFx0dGhpcy5fdmVyc2lvbklkID0gZXZlbnQudmVyc2lvbklkO1xuXHRcdHRoaXMuX2lzRGlydHkgPSBpc0RpcnR5O1xuXHRcdHRoaXMuYWNjZXB0RG9jdW1lbnRQcm9wZXJ0aWVzQ2hhbmdlZCh7IG1ldGFkYXRhOiBuZXdNZXRhZGF0YSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHtcblx0XHRcdG5vdGVib29rOiB0aGlzLmFwaU5vdGVib29rLFxuXHRcdFx0bWV0YWRhdGE6IG5ld01ldGFkYXRhLFxuXHRcdFx0Y2VsbENoYW5nZXM6IDx2c2NvZGUuTm90ZWJvb2tEb2N1bWVudENlbGxDaGFuZ2VbXT5bXSxcblx0XHRcdGNvbnRlbnRDaGFuZ2VzOiA8dnNjb2RlLk5vdGVib29rRG9jdW1lbnRDb250ZW50Q2hhbmdlW10+W10sXG5cdFx0fTtcblxuXHRcdHR5cGUgUmVsYXhlZENlbGxDaGFuZ2UgPSBQYXJ0aWFsPHZzY29kZS5Ob3RlYm9va0RvY3VtZW50Q2VsbENoYW5nZT4gJiB7IGNlbGw6IHZzY29kZS5Ob3RlYm9va0NlbGwgfTtcblx0XHRjb25zdCByZWxheGVkQ2VsbENoYW5nZXM6IFJlbGF4ZWRDZWxsQ2hhbmdlW10gPSBbXTtcblxuXHRcdC8vIC0tIGFwcGx5IGNoYW5nZSBhbmQgcG9wdWxhdGUgY29udGVudCBjaGFuZ2VzXG5cblx0XHRmb3IgKGNvbnN0IHJhd0V2ZW50IG9mIGV2ZW50LnJhd0V2ZW50cykge1xuXHRcdFx0aWYgKHJhd0V2ZW50LmtpbmQgPT09IG5vdGVib29rQ29tbW9uLk5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlKSB7XG5cdFx0XHRcdHRoaXMuX3NwbGljZU5vdGVib29rQ2VsbHMocmF3RXZlbnQuY2hhbmdlcywgZmFsc2UsIHJlc3VsdC5jb250ZW50Q2hhbmdlcyk7XG5cblx0XHRcdH0gZWxzZSBpZiAocmF3RXZlbnQua2luZCA9PT0gbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSkge1xuXHRcdFx0XHR0aGlzLl9tb3ZlQ2VsbHMocmF3RXZlbnQuaW5kZXgsIHJhd0V2ZW50Lmxlbmd0aCwgcmF3RXZlbnQubmV3SWR4LCByZXN1bHQuY29udGVudENoYW5nZXMpO1xuXG5cdFx0XHR9IGVsc2UgaWYgKHJhd0V2ZW50LmtpbmQgPT09IG5vdGVib29rQ29tbW9uLk5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk91dHB1dCkge1xuXHRcdFx0XHR0aGlzLl9zZXRDZWxsT3V0cHV0cyhyYXdFdmVudC5pbmRleCwgcmF3RXZlbnQub3V0cHV0cyk7XG5cdFx0XHRcdHJlbGF4ZWRDZWxsQ2hhbmdlcy5wdXNoKHsgY2VsbDogdGhpcy5fY2VsbHNbcmF3RXZlbnQuaW5kZXhdLmFwaUNlbGwsIG91dHB1dHM6IHRoaXMuX2NlbGxzW3Jhd0V2ZW50LmluZGV4XS5hcGlDZWxsLm91dHB1dHMgfSk7XG5cblx0XHRcdH0gZWxzZSBpZiAocmF3RXZlbnQua2luZCA9PT0gbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuT3V0cHV0SXRlbSkge1xuXHRcdFx0XHR0aGlzLl9zZXRDZWxsT3V0cHV0SXRlbXMocmF3RXZlbnQuaW5kZXgsIHJhd0V2ZW50Lm91dHB1dElkLCByYXdFdmVudC5hcHBlbmQsIHJhd0V2ZW50Lm91dHB1dEl0ZW1zKTtcblx0XHRcdFx0cmVsYXhlZENlbGxDaGFuZ2VzLnB1c2goeyBjZWxsOiB0aGlzLl9jZWxsc1tyYXdFdmVudC5pbmRleF0uYXBpQ2VsbCwgb3V0cHV0czogdGhpcy5fY2VsbHNbcmF3RXZlbnQuaW5kZXhdLmFwaUNlbGwub3V0cHV0cyB9KTtcblxuXHRcdFx0fSBlbHNlIGlmIChyYXdFdmVudC5raW5kID09PSBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTGFuZ3VhZ2UpIHtcblx0XHRcdFx0dGhpcy5fY2hhbmdlQ2VsbExhbmd1YWdlKHJhd0V2ZW50LmluZGV4LCByYXdFdmVudC5sYW5ndWFnZSk7XG5cdFx0XHRcdHJlbGF4ZWRDZWxsQ2hhbmdlcy5wdXNoKHsgY2VsbDogdGhpcy5fY2VsbHNbcmF3RXZlbnQuaW5kZXhdLmFwaUNlbGwsIGRvY3VtZW50OiB0aGlzLl9jZWxsc1tyYXdFdmVudC5pbmRleF0uYXBpQ2VsbC5kb2N1bWVudCB9KTtcblxuXHRcdFx0fSBlbHNlIGlmIChyYXdFdmVudC5raW5kID09PSBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsQ29udGVudCkge1xuXHRcdFx0XHRyZWxheGVkQ2VsbENoYW5nZXMucHVzaCh7IGNlbGw6IHRoaXMuX2NlbGxzW3Jhd0V2ZW50LmluZGV4XS5hcGlDZWxsLCBkb2N1bWVudDogdGhpcy5fY2VsbHNbcmF3RXZlbnQuaW5kZXhdLmFwaUNlbGwuZG9jdW1lbnQgfSk7XG5cblx0XHRcdH0gZWxzZSBpZiAocmF3RXZlbnQua2luZCA9PT0gbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbE1pbWUpIHtcblx0XHRcdFx0dGhpcy5fY2hhbmdlQ2VsbE1pbWUocmF3RXZlbnQuaW5kZXgsIHJhd0V2ZW50Lm1pbWUpO1xuXHRcdFx0fSBlbHNlIGlmIChyYXdFdmVudC5raW5kID09PSBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTWV0YWRhdGEpIHtcblx0XHRcdFx0dGhpcy5fY2hhbmdlQ2VsbE1ldGFkYXRhKHJhd0V2ZW50LmluZGV4LCByYXdFdmVudC5tZXRhZGF0YSk7XG5cdFx0XHRcdHJlbGF4ZWRDZWxsQ2hhbmdlcy5wdXNoKHsgY2VsbDogdGhpcy5fY2VsbHNbcmF3RXZlbnQuaW5kZXhdLmFwaUNlbGwsIG1ldGFkYXRhOiB0aGlzLl9jZWxsc1tyYXdFdmVudC5pbmRleF0uYXBpQ2VsbC5tZXRhZGF0YSB9KTtcblxuXHRcdFx0fSBlbHNlIGlmIChyYXdFdmVudC5raW5kID09PSBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsSW50ZXJuYWxNZXRhZGF0YSkge1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VDZWxsSW50ZXJuYWxNZXRhZGF0YShyYXdFdmVudC5pbmRleCwgcmF3RXZlbnQuaW50ZXJuYWxNZXRhZGF0YSk7XG5cdFx0XHRcdHJlbGF4ZWRDZWxsQ2hhbmdlcy5wdXNoKHsgY2VsbDogdGhpcy5fY2VsbHNbcmF3RXZlbnQuaW5kZXhdLmFwaUNlbGwsIGV4ZWN1dGlvblN1bW1hcnk6IHRoaXMuX2NlbGxzW3Jhd0V2ZW50LmluZGV4XS5hcGlDZWxsLmV4ZWN1dGlvblN1bW1hcnkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gLS0gY29tcGFjdCBjZWxsQ2hhbmdlc1xuXG5cdFx0Y29uc3QgbWFwID0gbmV3IE1hcDx2c2NvZGUuTm90ZWJvb2tDZWxsLCBudW1iZXI+KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZWxheGVkQ2VsbENoYW5nZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHJlbGF4ZWRDZWxsQ2hhbmdlID0gcmVsYXhlZENlbGxDaGFuZ2VzW2ldO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBtYXAuZ2V0KHJlbGF4ZWRDZWxsQ2hhbmdlLmNlbGwpO1xuXHRcdFx0aWYgKGV4aXN0aW5nID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgbmV3TGVuID0gcmVzdWx0LmNlbGxDaGFuZ2VzLnB1c2goe1xuXHRcdFx0XHRcdGRvY3VtZW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZXhlY3V0aW9uU3VtbWFyeTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0b3V0cHV0czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdC4uLnJlbGF4ZWRDZWxsQ2hhbmdlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0bWFwLnNldChyZWxheGVkQ2VsbENoYW5nZS5jZWxsLCBuZXdMZW4gLSAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5jZWxsQ2hhbmdlc1tleGlzdGluZ10gPSB7XG5cdFx0XHRcdFx0Li4ucmVzdWx0LmNlbGxDaGFuZ2VzW2V4aXN0aW5nXSxcblx0XHRcdFx0XHQuLi5yZWxheGVkQ2VsbENoYW5nZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZyZWV6ZSBldmVudCBwcm9wZXJ0aWVzIHNvIGhhbmRsZXJzIGNhbm5vdCBhY2NpZGVudGFsbHkgbW9kaWZ5IHRoZW1cblx0XHRPYmplY3QuZnJlZXplKHJlc3VsdCk7XG5cdFx0T2JqZWN0LmZyZWV6ZShyZXN1bHQuY2VsbENoYW5nZXMpO1xuXHRcdE9iamVjdC5mcmVlemUocmVzdWx0LmNvbnRlbnRDaGFuZ2VzKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZUluZGV4KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGluZGV4ID0gaW5kZXggfCAwO1xuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH0gZWxzZSBpZiAoaW5kZXggPj0gdGhpcy5fY2VsbHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2VsbHMubGVuZ3RoIC0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlUmFuZ2UocmFuZ2U6IHZzY29kZS5Ob3RlYm9va1JhbmdlKTogdnNjb2RlLk5vdGVib29rUmFuZ2Uge1xuXHRcdGxldCBzdGFydCA9IHJhbmdlLnN0YXJ0IHwgMDtcblx0XHRsZXQgZW5kID0gcmFuZ2UuZW5kIHwgMDtcblx0XHRpZiAoc3RhcnQgPCAwKSB7XG5cdFx0XHRzdGFydCA9IDA7XG5cdFx0fVxuXHRcdGlmIChlbmQgPiB0aGlzLl9jZWxscy5sZW5ndGgpIHtcblx0XHRcdGVuZCA9IHRoaXMuX2NlbGxzLmxlbmd0aDtcblx0XHR9XG5cdFx0cmV0dXJuIHJhbmdlLndpdGgoeyBzdGFydCwgZW5kIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q2VsbHMocmFuZ2U6IHZzY29kZS5Ob3RlYm9va1JhbmdlKTogRXh0SG9zdENlbGxbXSB7XG5cdFx0cmFuZ2UgPSB0aGlzLl92YWxpZGF0ZVJhbmdlKHJhbmdlKTtcblx0XHRjb25zdCByZXN1bHQ6IEV4dEhvc3RDZWxsW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnQ7IGkgPCByYW5nZS5lbmQ7IGkrKykge1xuXHRcdFx0cmVzdWx0LnB1c2godGhpcy5fY2VsbHNbaV0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2F2ZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ05vdGVib29rIGhhcyBiZWVuIGNsb3NlZCcpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiR0cnlTYXZlTm90ZWJvb2sodGhpcy51cmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3BsaWNlTm90ZWJvb2tDZWxscyhzcGxpY2VzOiBub3RlYm9va0NvbW1vbi5Ob3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2U8ZXh0SG9zdFByb3RvY29sLk5vdGVib29rQ2VsbER0bz5bXSwgaW5pdGlhbGl6YXRpb246IGJvb2xlYW4sIGJ1Y2tldDogdnNjb2RlLk5vdGVib29rRG9jdW1lbnRDb250ZW50Q2hhbmdlW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50Q2hhbmdlRXZlbnRzOiBSYXdDb250ZW50Q2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGNvbnN0IGFkZGVkQ2VsbERvY3VtZW50czogZXh0SG9zdFByb3RvY29sLklNb2RlbEFkZGVkRGF0YVtdID0gW107XG5cdFx0Y29uc3QgcmVtb3ZlZENlbGxEb2N1bWVudHM6IFVSSVtdID0gW107XG5cblx0XHRzcGxpY2VzLnJldmVyc2UoKS5mb3JFYWNoKHNwbGljZSA9PiB7XG5cdFx0XHRjb25zdCBjZWxsRHRvcyA9IHNwbGljZVsyXTtcblx0XHRcdGNvbnN0IG5ld0NlbGxzID0gY2VsbER0b3MubWFwKGNlbGwgPT4ge1xuXG5cdFx0XHRcdGNvbnN0IGV4dENlbGwgPSBuZXcgRXh0SG9zdENlbGwodGhpcywgdGhpcy5fdGV4dERvY3VtZW50c0FuZEVkaXRvcnMsIGNlbGwpO1xuXHRcdFx0XHRpZiAoIWluaXRpYWxpemF0aW9uKSB7XG5cdFx0XHRcdFx0YWRkZWRDZWxsRG9jdW1lbnRzLnB1c2goRXh0SG9zdENlbGwuYXNNb2RlbEFkZERhdGEoY2VsbCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBleHRDZWxsO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNoYW5nZUV2ZW50ID0gbmV3IFJhd0NvbnRlbnRDaGFuZ2VFdmVudChzcGxpY2VbMF0sIHNwbGljZVsxXSwgW10sIG5ld0NlbGxzKTtcblx0XHRcdGNvbnN0IGRlbGV0ZWRJdGVtcyA9IHRoaXMuX2NlbGxzLnNwbGljZShzcGxpY2VbMF0sIHNwbGljZVsxXSwgLi4ubmV3Q2VsbHMpO1xuXHRcdFx0Zm9yIChjb25zdCBjZWxsIG9mIGRlbGV0ZWRJdGVtcykge1xuXHRcdFx0XHRyZW1vdmVkQ2VsbERvY3VtZW50cy5wdXNoKGNlbGwudXJpKTtcblx0XHRcdFx0Y2hhbmdlRXZlbnQuZGVsZXRlZEl0ZW1zLnB1c2goY2VsbC5hcGlDZWxsKTtcblx0XHRcdH1cblx0XHRcdGNvbnRlbnRDaGFuZ2VFdmVudHMucHVzaChjaGFuZ2VFdmVudCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl90ZXh0RG9jdW1lbnRzQW5kRWRpdG9ycy5hY2NlcHREb2N1bWVudHNBbmRFZGl0b3JzRGVsdGEoe1xuXHRcdFx0YWRkZWREb2N1bWVudHM6IGFkZGVkQ2VsbERvY3VtZW50cyxcblx0XHRcdHJlbW92ZWREb2N1bWVudHM6IHJlbW92ZWRDZWxsRG9jdW1lbnRzXG5cdFx0fSk7XG5cblx0XHRpZiAoYnVja2V0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZUV2ZW50IG9mIGNvbnRlbnRDaGFuZ2VFdmVudHMpIHtcblx0XHRcdFx0YnVja2V0LnB1c2goY2hhbmdlRXZlbnQuYXNBcGlFdmVudCgpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tb3ZlQ2VsbHMoaW5kZXg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIG5ld0lkeDogbnVtYmVyLCBidWNrZXQ6IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50Q29udGVudENoYW5nZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VsbHMgPSB0aGlzLl9jZWxscy5zcGxpY2UoaW5kZXgsIGxlbmd0aCk7XG5cdFx0dGhpcy5fY2VsbHMuc3BsaWNlKG5ld0lkeCwgMCwgLi4uY2VsbHMpO1xuXHRcdGNvbnN0IGNoYW5nZXMgPSBbXG5cdFx0XHRuZXcgUmF3Q29udGVudENoYW5nZUV2ZW50KGluZGV4LCBsZW5ndGgsIGNlbGxzLm1hcChjID0+IGMuYXBpQ2VsbCksIFtdKSxcblx0XHRcdG5ldyBSYXdDb250ZW50Q2hhbmdlRXZlbnQobmV3SWR4LCAwLCBbXSwgY2VsbHMpXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRidWNrZXQucHVzaChjaGFuZ2UuYXNBcGlFdmVudCgpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDZWxsT3V0cHV0cyhpbmRleDogbnVtYmVyLCBvdXRwdXRzOiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tPdXRwdXREdG9bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9jZWxsc1tpbmRleF07XG5cdFx0Y2VsbC5zZXRPdXRwdXRzKG91dHB1dHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q2VsbE91dHB1dEl0ZW1zKGluZGV4OiBudW1iZXIsIG91dHB1dElkOiBzdHJpbmcsIGFwcGVuZDogYm9vbGVhbiwgb3V0cHV0SXRlbXM6IGV4dEhvc3RQcm90b2NvbC5Ob3RlYm9va091dHB1dEl0ZW1EdG9bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9jZWxsc1tpbmRleF07XG5cdFx0Y2VsbC5zZXRPdXRwdXRJdGVtcyhvdXRwdXRJZCwgYXBwZW5kLCBvdXRwdXRJdGVtcyk7XG5cdH1cblxuXHRwcml2YXRlIF9jaGFuZ2VDZWxsTGFuZ3VhZ2UoaW5kZXg6IG51bWJlciwgbmV3TGFuZ3VhZ2VJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2NlbGxzW2luZGV4XTtcblx0XHRpZiAoY2VsbC5hcGlDZWxsLmRvY3VtZW50Lmxhbmd1YWdlSWQgIT09IG5ld0xhbmd1YWdlSWQpIHtcblx0XHRcdHRoaXMuX3RleHREb2N1bWVudHMuJGFjY2VwdE1vZGVsTGFuZ3VhZ2VDaGFuZ2VkKGNlbGwudXJpLCBuZXdMYW5ndWFnZUlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jaGFuZ2VDZWxsTWltZShpbmRleDogbnVtYmVyLCBuZXdNaW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fY2VsbHNbaW5kZXhdO1xuXHRcdGNlbGwuYXBpQ2VsbC5taW1lID0gbmV3TWltZTtcblx0fVxuXG5cdHByaXZhdGUgX2NoYW5nZUNlbGxNZXRhZGF0YShpbmRleDogbnVtYmVyLCBuZXdNZXRhZGF0YTogbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsTWV0YWRhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fY2VsbHNbaW5kZXhdO1xuXHRcdGNlbGwuc2V0TWV0YWRhdGEobmV3TWV0YWRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hhbmdlQ2VsbEludGVybmFsTWV0YWRhdGEoaW5kZXg6IG51bWJlciwgbmV3SW50ZXJuYWxNZXRhZGF0YTogbm90ZWJvb2tDb21tb24uTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9jZWxsc1tpbmRleF07XG5cdFx0Y2VsbC5zZXRJbnRlcm5hbE1ldGFkYXRhKG5ld0ludGVybmFsTWV0YWRhdGEpO1xuXHR9XG5cblx0Z2V0Q2VsbEZyb21BcGlDZWxsKGFwaUNlbGw6IHZzY29kZS5Ob3RlYm9va0NlbGwpOiBFeHRIb3N0Q2VsbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLmFwaUNlbGwgPT09IGFwaUNlbGwpO1xuXHR9XG5cblx0Z2V0Q2VsbEZyb21JbmRleChpbmRleDogbnVtYmVyKTogRXh0SG9zdENlbGwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jZWxsc1tpbmRleF07XG5cdH1cblxuXHRnZXRDZWxsKGNlbGxIYW5kbGU6IG51bWJlcik6IEV4dEhvc3RDZWxsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2VsbHMuZmluZChjZWxsID0+IGNlbGwuaGFuZGxlID09PSBjZWxsSGFuZGxlKTtcblx0fVxuXG5cdGdldENlbGxJbmRleChjZWxsOiBFeHRIb3N0Q2VsbCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NlbGxzLmluZGV4T2YoY2VsbCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFJcEIsWUFBWSwyQkFBMkI7QUFDdkMsU0FBUyxxQkFBcUI7QUFDOUIsWUFBWSxvQkFBb0I7QUFFaEMsU0FBUyx3QkFBd0I7QUFFakMsTUFBTSxzQkFBc0I7QUFBQSxFQUUzQixZQUNVLE9BQ0EsY0FDQSxjQUNBLE9BQ1I7QUFKUTtBQUNBO0FBQ0E7QUFDQTtBQUFBLEVBQ047QUFBQSxFQUVKLGFBQW1EO0FBQ2xELFdBQU87QUFBQSxNQUNOLE9BQU8sSUFBSSxjQUFjLEtBQUssT0FBTyxLQUFLLFFBQVEsS0FBSyxZQUFZO0FBQUEsTUFDbkUsWUFBWSxLQUFLLE1BQU0sSUFBSSxVQUFRLEtBQUssT0FB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
