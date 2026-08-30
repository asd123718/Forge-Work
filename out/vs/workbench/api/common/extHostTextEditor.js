import { ok } from "../../../base/common/assert.js";
import { ReadonlyError, illegalArgument } from "../../../base/common/errors.js";
import { IdGenerator } from "../../../base/common/idGenerator.js";
import * as TypeConverters from "./extHostTypeConverters.js";
import { EndOfLine, Position, Range, Selection, TextEditorRevealType } from "./extHostTypes.js";
const _TextEditorDecorationType = class _TextEditorDecorationType {
  constructor(proxy, extension, options) {
    const key = _TextEditorDecorationType._Keys.nextId();
    proxy.$registerTextEditorDecorationType(extension.identifier, key, TypeConverters.DecorationRenderOptions.from(options));
    this.value = Object.freeze({
      key,
      dispose() {
        proxy.$removeTextEditorDecorationType(key);
      }
    });
  }
};
_TextEditorDecorationType._Keys = new IdGenerator("TextEditorDecorationType");
let TextEditorDecorationType = _TextEditorDecorationType;
class TextEditorEdit {
  constructor(document, options) {
    this._collectedEdits = [];
    this._setEndOfLine = void 0;
    this._finalized = false;
    this._document = document;
    this._documentVersionId = document.version;
    this._undoStopBefore = options.undoStopBefore;
    this._undoStopAfter = options.undoStopAfter;
  }
  finalize() {
    this._finalized = true;
    return {
      documentVersionId: this._documentVersionId,
      edits: this._collectedEdits,
      setEndOfLine: this._setEndOfLine,
      undoStopBefore: this._undoStopBefore,
      undoStopAfter: this._undoStopAfter
    };
  }
  _throwIfFinalized() {
    if (this._finalized) {
      throw new Error("Edit is only valid while callback runs");
    }
  }
  replace(location, value) {
    this._throwIfFinalized();
    let range = null;
    if (location instanceof Position) {
      range = new Range(location, location);
    } else if (location instanceof Range) {
      range = location;
    } else {
      throw new Error("Unrecognized location");
    }
    this._pushEdit(range, value, false);
  }
  insert(location, value) {
    this._throwIfFinalized();
    this._pushEdit(new Range(location, location), value, true);
  }
  delete(location) {
    this._throwIfFinalized();
    let range = null;
    if (location instanceof Range) {
      range = location;
    } else {
      throw new Error("Unrecognized location");
    }
    this._pushEdit(range, null, true);
  }
  _pushEdit(range, text, forceMoveMarkers) {
    const validRange = this._document.validateRange(range);
    this._collectedEdits.push({
      range: validRange,
      text,
      forceMoveMarkers
    });
  }
  setEndOfLine(endOfLine) {
    this._throwIfFinalized();
    if (endOfLine !== EndOfLine.LF && endOfLine !== EndOfLine.CRLF) {
      throw illegalArgument("endOfLine");
    }
    this._setEndOfLine = endOfLine;
  }
}
class ExtHostTextEditorOptions {
  constructor(proxy, id, source, logService) {
    this._proxy = proxy;
    this._id = id;
    this._accept(source);
    this._logService = logService;
    const that = this;
    this.value = {
      get tabSize() {
        return that._tabSize;
      },
      set tabSize(value) {
        that._setTabSize(value);
      },
      get indentSize() {
        return that._indentSize;
      },
      set indentSize(value) {
        that._setIndentSize(value);
      },
      get insertSpaces() {
        return that._insertSpaces;
      },
      set insertSpaces(value) {
        that._setInsertSpaces(value);
      },
      get cursorStyle() {
        return that._cursorStyle;
      },
      set cursorStyle(value) {
        that._setCursorStyle(value);
      },
      get lineNumbers() {
        return that._lineNumbers;
      },
      set lineNumbers(value) {
        that._setLineNumbers(value);
      }
    };
  }
  _accept(source) {
    this._tabSize = source.tabSize;
    this._indentSize = source.indentSize;
    this._originalIndentSize = source.originalIndentSize;
    this._insertSpaces = source.insertSpaces;
    this._cursorStyle = source.cursorStyle;
    this._lineNumbers = TypeConverters.TextEditorLineNumbersStyle.to(source.lineNumbers);
  }
  // --- internal: tabSize
  _validateTabSize(value) {
    if (value === "auto") {
      return "auto";
    }
    if (typeof value === "number") {
      const r = Math.floor(value);
      return r > 0 ? r : null;
    }
    if (typeof value === "string") {
      const r = parseInt(value, 10);
      if (isNaN(r)) {
        return null;
      }
      return r > 0 ? r : null;
    }
    return null;
  }
  _setTabSize(value) {
    const tabSize = this._validateTabSize(value);
    if (tabSize === null) {
      return;
    }
    if (typeof tabSize === "number") {
      if (this._tabSize === tabSize) {
        return;
      }
      this._tabSize = tabSize;
    }
    this._warnOnError("setTabSize", this._proxy.$trySetOptions(this._id, {
      tabSize
    }));
  }
  // --- internal: indentSize
  _validateIndentSize(value) {
    if (value === "tabSize") {
      return "tabSize";
    }
    if (typeof value === "number") {
      const r = Math.floor(value);
      return r > 0 ? r : null;
    }
    if (typeof value === "string") {
      const r = parseInt(value, 10);
      if (isNaN(r)) {
        return null;
      }
      return r > 0 ? r : null;
    }
    return null;
  }
  _setIndentSize(value) {
    const indentSize = this._validateIndentSize(value);
    if (indentSize === null) {
      return;
    }
    if (typeof indentSize === "number") {
      if (this._originalIndentSize === indentSize) {
        return;
      }
      this._indentSize = indentSize;
      this._originalIndentSize = indentSize;
    }
    this._warnOnError("setIndentSize", this._proxy.$trySetOptions(this._id, {
      indentSize
    }));
  }
  // --- internal: insert spaces
  _validateInsertSpaces(value) {
    if (value === "auto") {
      return "auto";
    }
    return value === "false" ? false : Boolean(value);
  }
  _setInsertSpaces(value) {
    const insertSpaces = this._validateInsertSpaces(value);
    if (typeof insertSpaces === "boolean") {
      if (this._insertSpaces === insertSpaces) {
        return;
      }
      this._insertSpaces = insertSpaces;
    }
    this._warnOnError("setInsertSpaces", this._proxy.$trySetOptions(this._id, {
      insertSpaces
    }));
  }
  // --- internal: cursor style
  _setCursorStyle(value) {
    if (this._cursorStyle === value) {
      return;
    }
    this._cursorStyle = value;
    this._warnOnError("setCursorStyle", this._proxy.$trySetOptions(this._id, {
      cursorStyle: value
    }));
  }
  // --- internal: line number
  _setLineNumbers(value) {
    if (this._lineNumbers === value) {
      return;
    }
    this._lineNumbers = value;
    this._warnOnError("setLineNumbers", this._proxy.$trySetOptions(this._id, {
      lineNumbers: TypeConverters.TextEditorLineNumbersStyle.from(value)
    }));
  }
  assign(newOptions) {
    const bulkConfigurationUpdate = {};
    let hasUpdate = false;
    if (typeof newOptions.tabSize !== "undefined") {
      const tabSize = this._validateTabSize(newOptions.tabSize);
      if (tabSize === "auto") {
        hasUpdate = true;
        bulkConfigurationUpdate.tabSize = tabSize;
      } else if (typeof tabSize === "number" && this._tabSize !== tabSize) {
        this._tabSize = tabSize;
        hasUpdate = true;
        bulkConfigurationUpdate.tabSize = tabSize;
      }
    }
    if (typeof newOptions.indentSize !== "undefined") {
      const indentSize = this._validateIndentSize(newOptions.indentSize);
      if (indentSize === "tabSize") {
        hasUpdate = true;
        bulkConfigurationUpdate.indentSize = indentSize;
      } else if (typeof indentSize === "number" && this._originalIndentSize !== indentSize) {
        this._indentSize = indentSize;
        this._originalIndentSize = indentSize;
        hasUpdate = true;
        bulkConfigurationUpdate.indentSize = indentSize;
      }
    }
    if (typeof newOptions.insertSpaces !== "undefined") {
      const insertSpaces = this._validateInsertSpaces(newOptions.insertSpaces);
      if (insertSpaces === "auto") {
        hasUpdate = true;
        bulkConfigurationUpdate.insertSpaces = insertSpaces;
      } else if (this._insertSpaces !== insertSpaces) {
        this._insertSpaces = insertSpaces;
        hasUpdate = true;
        bulkConfigurationUpdate.insertSpaces = insertSpaces;
      }
    }
    if (typeof newOptions.cursorStyle !== "undefined") {
      if (this._cursorStyle !== newOptions.cursorStyle) {
        this._cursorStyle = newOptions.cursorStyle;
        hasUpdate = true;
        bulkConfigurationUpdate.cursorStyle = newOptions.cursorStyle;
      }
    }
    if (typeof newOptions.lineNumbers !== "undefined") {
      if (this._lineNumbers !== newOptions.lineNumbers) {
        this._lineNumbers = newOptions.lineNumbers;
        hasUpdate = true;
        bulkConfigurationUpdate.lineNumbers = TypeConverters.TextEditorLineNumbersStyle.from(newOptions.lineNumbers);
      }
    }
    if (hasUpdate) {
      this._warnOnError("setOptions", this._proxy.$trySetOptions(this._id, bulkConfigurationUpdate));
    }
  }
  _warnOnError(action, promise) {
    promise.catch((err) => {
      this._logService.warn(`ExtHostTextEditorOptions '${action}' failed:'`);
      this._logService.warn(err);
    });
  }
}
class ExtHostTextEditor {
  constructor(id, _proxy, _logService, document, selections, options, visibleRanges, viewColumn) {
    this.id = id;
    this._proxy = _proxy;
    this._logService = _logService;
    this._disposed = false;
    this._hasDecorationsForKey = /* @__PURE__ */ new Set();
    this._selections = selections;
    this._options = new ExtHostTextEditorOptions(this._proxy, this.id, options, _logService);
    this._visibleRanges = visibleRanges;
    this._viewColumn = viewColumn;
    const that = this;
    this.value = Object.freeze({
      get document() {
        return document.value;
      },
      set document(_value) {
        throw new ReadonlyError("document");
      },
      // --- selection
      get selection() {
        return that._selections && that._selections[0];
      },
      set selection(value) {
        if (!(value instanceof Selection)) {
          throw illegalArgument("selection");
        }
        that._selections = [value];
        that._trySetSelection();
      },
      get selections() {
        return that._selections;
      },
      set selections(value) {
        if (!Array.isArray(value) || value.some((a) => !(a instanceof Selection))) {
          throw illegalArgument("selections");
        }
        if (value.length === 0) {
          value = [new Selection(0, 0, 0, 0)];
        }
        that._selections = value;
        that._trySetSelection();
      },
      // --- visible ranges
      get visibleRanges() {
        return that._visibleRanges;
      },
      set visibleRanges(_value) {
        throw new ReadonlyError("visibleRanges");
      },
      get diffInformation() {
        return that._diffInformation;
      },
      // --- options
      get options() {
        return that._options.value;
      },
      set options(value) {
        if (!that._disposed) {
          that._options.assign(value);
        }
      },
      // --- view column
      get viewColumn() {
        return that._viewColumn;
      },
      set viewColumn(_value) {
        throw new ReadonlyError("viewColumn");
      },
      // --- edit
      edit(callback, options2 = { undoStopBefore: true, undoStopAfter: true }) {
        if (that._disposed) {
          return Promise.reject(new Error("TextEditor#edit not possible on closed editors"));
        }
        const edit = new TextEditorEdit(document.value, options2);
        callback(edit);
        return that._applyEdit(edit);
      },
      // --- snippet edit
      insertSnippet(snippet, where, options2 = { undoStopBefore: true, undoStopAfter: true }) {
        if (that._disposed) {
          return Promise.reject(new Error("TextEditor#insertSnippet not possible on closed editors"));
        }
        let ranges;
        if (!where || Array.isArray(where) && where.length === 0) {
          ranges = that._selections.map((range) => TypeConverters.Range.from(range));
        } else if (where instanceof Position) {
          const { lineNumber, column } = TypeConverters.Position.from(where);
          ranges = [{ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column }];
        } else if (where instanceof Range) {
          ranges = [TypeConverters.Range.from(where)];
        } else {
          ranges = [];
          for (const posOrRange of where) {
            if (posOrRange instanceof Range) {
              ranges.push(TypeConverters.Range.from(posOrRange));
            } else {
              const { lineNumber, column } = TypeConverters.Position.from(posOrRange);
              ranges.push({ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column });
            }
          }
        }
        if (options2.keepWhitespace === void 0) {
          options2.keepWhitespace = false;
        }
        return _proxy.$tryInsertSnippet(id, document.value.version, snippet.value, ranges, options2);
      },
      setDecorations(decorationType, ranges) {
        const willBeEmpty = ranges.length === 0;
        if (willBeEmpty && !that._hasDecorationsForKey.has(decorationType.key)) {
          return;
        }
        if (willBeEmpty) {
          that._hasDecorationsForKey.delete(decorationType.key);
        } else {
          that._hasDecorationsForKey.add(decorationType.key);
        }
        that._runOnProxy(() => {
          if (TypeConverters.isDecorationOptionsArr(ranges)) {
            return _proxy.$trySetDecorations(
              id,
              decorationType.key,
              TypeConverters.fromRangeOrRangeWithMessage(ranges)
            );
          } else {
            const _ranges = new Array(4 * ranges.length);
            for (let i = 0, len = ranges.length; i < len; i++) {
              const range = ranges[i];
              _ranges[4 * i] = range.start.line + 1;
              _ranges[4 * i + 1] = range.start.character + 1;
              _ranges[4 * i + 2] = range.end.line + 1;
              _ranges[4 * i + 3] = range.end.character + 1;
            }
            return _proxy.$trySetDecorationsFast(
              id,
              decorationType.key,
              _ranges
            );
          }
        });
      },
      revealRange(range, revealType) {
        that._runOnProxy(() => _proxy.$tryRevealRange(
          id,
          TypeConverters.Range.from(range),
          revealType || TextEditorRevealType.Default
        ));
      },
      show(column) {
        _proxy.$tryShowEditor(id, TypeConverters.ViewColumn.from(column));
      },
      hide() {
        _proxy.$tryHideEditor(id);
      },
      [/* @__PURE__ */ Symbol.for("debug.description")]() {
        return `TextEditor(${this.document.uri.toString()})`;
      }
    });
  }
  dispose() {
    ok(!this._disposed);
    this._disposed = true;
  }
  // --- incoming: extension host MUST accept what the renderer says
  _acceptOptions(options) {
    ok(!this._disposed);
    this._options._accept(options);
  }
  _acceptVisibleRanges(value) {
    ok(!this._disposed);
    this._visibleRanges = value;
  }
  _acceptViewColumn(value) {
    ok(!this._disposed);
    this._viewColumn = value;
  }
  _acceptSelections(selections) {
    ok(!this._disposed);
    this._selections = selections;
  }
  _acceptDiffInformation(diffInformation) {
    ok(!this._disposed);
    this._diffInformation = diffInformation;
  }
  async _trySetSelection() {
    const selection = this._selections.map(TypeConverters.Selection.from);
    await this._runOnProxy(() => this._proxy.$trySetSelections(this.id, selection));
    return this.value;
  }
  _applyEdit(editBuilder) {
    const editData = editBuilder.finalize();
    if (editData.edits.length === 0 && !editData.setEndOfLine) {
      return Promise.resolve(true);
    }
    const editRanges = editData.edits.map((edit) => edit.range);
    editRanges.sort((a, b) => {
      if (a.end.line === b.end.line) {
        if (a.end.character === b.end.character) {
          if (a.start.line === b.start.line) {
            return a.start.character - b.start.character;
          }
          return a.start.line - b.start.line;
        }
        return a.end.character - b.end.character;
      }
      return a.end.line - b.end.line;
    });
    for (let i = 0, count = editRanges.length - 1; i < count; i++) {
      const rangeEnd = editRanges[i].end;
      const nextRangeStart = editRanges[i + 1].start;
      if (nextRangeStart.isBefore(rangeEnd)) {
        return Promise.reject(
          new Error("Overlapping ranges are not allowed!")
        );
      }
    }
    const edits = editData.edits.map((edit) => {
      return {
        range: TypeConverters.Range.from(edit.range),
        text: edit.text,
        forceMoveMarkers: edit.forceMoveMarkers
      };
    });
    return this._proxy.$tryApplyEdits(this.id, editData.documentVersionId, edits, {
      setEndOfLine: typeof editData.setEndOfLine === "number" ? TypeConverters.EndOfLine.from(editData.setEndOfLine) : void 0,
      undoStopBefore: editData.undoStopBefore,
      undoStopAfter: editData.undoStopAfter
    });
  }
  _runOnProxy(callback) {
    if (this._disposed) {
      this._logService.warn("TextEditor is closed/disposed");
      return Promise.resolve(void 0);
    }
    return callback().then(() => this, (err) => {
      if (!(err instanceof Error && err.name === "DISPOSED")) {
        this._logService.warn(err);
      }
      return null;
    });
  }
}
export {
  ExtHostTextEditor,
  ExtHostTextEditorOptions,
  TextEditorDecorationType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VGV4dEVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9rIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IFJlYWRvbmx5RXJyb3IsIGlsbGVnYWxBcmd1bWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJZEdlbmVyYXRvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2lkR2VuZXJhdG9yLmpzJztcbmltcG9ydCB7IFRleHRFZGl0b3JDdXJzb3JTdHlsZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvckNvbmZpZ3VyYXRpb24sIElUZXh0RWRpdG9yQ29uZmlndXJhdGlvblVwZGF0ZSwgTWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0ICogYXMgVHlwZUNvbnZlcnRlcnMgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lLCBQb3NpdGlvbiwgUmFuZ2UsIFNlbGVjdGlvbiwgU25pcHBldFN0cmluZywgVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUsIFRleHRFZGl0b3JSZXZlYWxUeXBlIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9LZXlzID0gbmV3IElkR2VuZXJhdG9yKCdUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUnKTtcblxuXHRyZWFkb25seSB2YWx1ZTogdnNjb2RlLlRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZTtcblxuXHRjb25zdHJ1Y3Rvcihwcm94eTogTWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGUsIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBvcHRpb25zOiB2c2NvZGUuRGVjb3JhdGlvblJlbmRlck9wdGlvbnMpIHtcblx0XHRjb25zdCBrZXkgPSBUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUuX0tleXMubmV4dElkKCk7XG5cdFx0cHJveHkuJHJlZ2lzdGVyVGV4dEVkaXRvckRlY29yYXRpb25UeXBlKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBrZXksIFR5cGVDb252ZXJ0ZXJzLkRlY29yYXRpb25SZW5kZXJPcHRpb25zLmZyb20ob3B0aW9ucykpO1xuXHRcdHRoaXMudmFsdWUgPSBPYmplY3QuZnJlZXplKHtcblx0XHRcdGtleSxcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdHByb3h5LiRyZW1vdmVUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUoa2V5KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRFZGl0T3BlcmF0aW9uIHtcblx0cmFuZ2U6IHZzY29kZS5SYW5nZTtcblx0dGV4dDogc3RyaW5nIHwgbnVsbDtcblx0Zm9yY2VNb3ZlTWFya2VyczogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRWRpdERhdGEge1xuXHRkb2N1bWVudFZlcnNpb25JZDogbnVtYmVyO1xuXHRlZGl0czogSVRleHRFZGl0T3BlcmF0aW9uW107XG5cdHNldEVuZE9mTGluZTogRW5kT2ZMaW5lIHwgdW5kZWZpbmVkO1xuXHR1bmRvU3RvcEJlZm9yZTogYm9vbGVhbjtcblx0dW5kb1N0b3BBZnRlcjogYm9vbGVhbjtcbn1cblxuY2xhc3MgVGV4dEVkaXRvckVkaXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudFZlcnNpb25JZDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91bmRvU3RvcEJlZm9yZTogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfdW5kb1N0b3BBZnRlcjogYm9vbGVhbjtcblx0cHJpdmF0ZSBfY29sbGVjdGVkRWRpdHM6IElUZXh0RWRpdE9wZXJhdGlvbltdID0gW107XG5cdHByaXZhdGUgX3NldEVuZE9mTGluZTogRW5kT2ZMaW5lIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9maW5hbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCwgb3B0aW9uczogeyB1bmRvU3RvcEJlZm9yZTogYm9vbGVhbjsgdW5kb1N0b3BBZnRlcjogYm9vbGVhbiB9KSB7XG5cdFx0dGhpcy5fZG9jdW1lbnQgPSBkb2N1bWVudDtcblx0XHR0aGlzLl9kb2N1bWVudFZlcnNpb25JZCA9IGRvY3VtZW50LnZlcnNpb247XG5cdFx0dGhpcy5fdW5kb1N0b3BCZWZvcmUgPSBvcHRpb25zLnVuZG9TdG9wQmVmb3JlO1xuXHRcdHRoaXMuX3VuZG9TdG9wQWZ0ZXIgPSBvcHRpb25zLnVuZG9TdG9wQWZ0ZXI7XG5cdH1cblxuXHRmaW5hbGl6ZSgpOiBJRWRpdERhdGEge1xuXHRcdHRoaXMuX2ZpbmFsaXplZCA9IHRydWU7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRvY3VtZW50VmVyc2lvbklkOiB0aGlzLl9kb2N1bWVudFZlcnNpb25JZCxcblx0XHRcdGVkaXRzOiB0aGlzLl9jb2xsZWN0ZWRFZGl0cyxcblx0XHRcdHNldEVuZE9mTGluZTogdGhpcy5fc2V0RW5kT2ZMaW5lLFxuXHRcdFx0dW5kb1N0b3BCZWZvcmU6IHRoaXMuX3VuZG9TdG9wQmVmb3JlLFxuXHRcdFx0dW5kb1N0b3BBZnRlcjogdGhpcy5fdW5kb1N0b3BBZnRlclxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90aHJvd0lmRmluYWxpemVkKCkge1xuXHRcdGlmICh0aGlzLl9maW5hbGl6ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRWRpdCBpcyBvbmx5IHZhbGlkIHdoaWxlIGNhbGxiYWNrIHJ1bnMnKTtcblx0XHR9XG5cdH1cblxuXHRyZXBsYWNlKGxvY2F0aW9uOiBQb3NpdGlvbiB8IFJhbmdlIHwgU2VsZWN0aW9uLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdGhyb3dJZkZpbmFsaXplZCgpO1xuXHRcdGxldCByYW5nZTogUmFuZ2UgfCBudWxsID0gbnVsbDtcblxuXHRcdGlmIChsb2NhdGlvbiBpbnN0YW5jZW9mIFBvc2l0aW9uKSB7XG5cdFx0XHRyYW5nZSA9IG5ldyBSYW5nZShsb2NhdGlvbiwgbG9jYXRpb24pO1xuXHRcdH0gZWxzZSBpZiAobG9jYXRpb24gaW5zdGFuY2VvZiBSYW5nZSkge1xuXHRcdFx0cmFuZ2UgPSBsb2NhdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbnJlY29nbml6ZWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wdXNoRWRpdChyYW5nZSwgdmFsdWUsIGZhbHNlKTtcblx0fVxuXG5cdGluc2VydChsb2NhdGlvbjogUG9zaXRpb24sIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90aHJvd0lmRmluYWxpemVkKCk7XG5cdFx0dGhpcy5fcHVzaEVkaXQobmV3IFJhbmdlKGxvY2F0aW9uLCBsb2NhdGlvbiksIHZhbHVlLCB0cnVlKTtcblx0fVxuXG5cdGRlbGV0ZShsb2NhdGlvbjogUmFuZ2UgfCBTZWxlY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl90aHJvd0lmRmluYWxpemVkKCk7XG5cdFx0bGV0IHJhbmdlOiBSYW5nZSB8IG51bGwgPSBudWxsO1xuXG5cdFx0aWYgKGxvY2F0aW9uIGluc3RhbmNlb2YgUmFuZ2UpIHtcblx0XHRcdHJhbmdlID0gbG9jYXRpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5yZWNvZ25pemVkIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHVzaEVkaXQocmFuZ2UsIG51bGwsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVzaEVkaXQocmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcgfCBudWxsLCBmb3JjZU1vdmVNYXJrZXJzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsaWRSYW5nZSA9IHRoaXMuX2RvY3VtZW50LnZhbGlkYXRlUmFuZ2UocmFuZ2UpO1xuXHRcdHRoaXMuX2NvbGxlY3RlZEVkaXRzLnB1c2goe1xuXHRcdFx0cmFuZ2U6IHZhbGlkUmFuZ2UsXG5cdFx0XHR0ZXh0OiB0ZXh0LFxuXHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogZm9yY2VNb3ZlTWFya2Vyc1xuXHRcdH0pO1xuXHR9XG5cblx0c2V0RW5kT2ZMaW5lKGVuZE9mTGluZTogRW5kT2ZMaW5lKTogdm9pZCB7XG5cdFx0dGhpcy5fdGhyb3dJZkZpbmFsaXplZCgpO1xuXHRcdGlmIChlbmRPZkxpbmUgIT09IEVuZE9mTGluZS5MRiAmJiBlbmRPZkxpbmUgIT09IEVuZE9mTGluZS5DUkxGKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2VuZE9mTGluZScpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NldEVuZE9mTGluZSA9IGVuZE9mTGluZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdFRleHRFZGl0b3JPcHRpb25zIHtcblxuXHRwcml2YXRlIF9wcm94eTogTWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGU7XG5cdHByaXZhdGUgX2lkOiBzdHJpbmc7XG5cdHByaXZhdGUgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXG5cdHByaXZhdGUgX3RhYlNpemUhOiBudW1iZXI7XG5cdHByaXZhdGUgX2luZGVudFNpemUhOiBudW1iZXI7XG5cdHByaXZhdGUgX29yaWdpbmFsSW5kZW50U2l6ZSE6IG51bWJlciB8ICd0YWJTaXplJztcblx0cHJpdmF0ZSBfaW5zZXJ0U3BhY2VzITogYm9vbGVhbjtcblx0cHJpdmF0ZSBfY3Vyc29yU3R5bGUhOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGU7XG5cdHByaXZhdGUgX2xpbmVOdW1iZXJzITogVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGU7XG5cblx0cmVhZG9ubHkgdmFsdWU6IHZzY29kZS5UZXh0RWRpdG9yT3B0aW9ucztcblxuXHRjb25zdHJ1Y3Rvcihwcm94eTogTWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGUsIGlkOiBzdHJpbmcsIHNvdXJjZTogSVJlc29sdmVkVGV4dEVkaXRvckNvbmZpZ3VyYXRpb24sIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKSB7XG5cdFx0dGhpcy5fcHJveHkgPSBwcm94eTtcblx0XHR0aGlzLl9pZCA9IGlkO1xuXHRcdHRoaXMuX2FjY2VwdChzb3VyY2UpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UgPSBsb2dTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHR0aGlzLnZhbHVlID0ge1xuXHRcdFx0Z2V0IHRhYlNpemUoKTogbnVtYmVyIHwgc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3RhYlNpemU7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHRhYlNpemUodmFsdWU6IG51bWJlciB8IHN0cmluZykge1xuXHRcdFx0XHR0aGF0Ll9zZXRUYWJTaXplKHZhbHVlKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaW5kZW50U2l6ZSgpOiBudW1iZXIgfCBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5faW5kZW50U2l6ZTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgaW5kZW50U2l6ZSh2YWx1ZTogbnVtYmVyIHwgc3RyaW5nKSB7XG5cdFx0XHRcdHRoYXQuX3NldEluZGVudFNpemUodmFsdWUpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpbnNlcnRTcGFjZXMoKTogYm9vbGVhbiB8IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9pbnNlcnRTcGFjZXM7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGluc2VydFNwYWNlcyh2YWx1ZTogYm9vbGVhbiB8IHN0cmluZykge1xuXHRcdFx0XHR0aGF0Ll9zZXRJbnNlcnRTcGFjZXModmFsdWUpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBjdXJzb3JTdHlsZSgpOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fY3Vyc29yU3R5bGU7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGN1cnNvclN0eWxlKHZhbHVlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUpIHtcblx0XHRcdFx0dGhhdC5fc2V0Q3Vyc29yU3R5bGUodmFsdWUpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBsaW5lTnVtYmVycygpOiBUZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZSB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9saW5lTnVtYmVycztcblx0XHRcdH0sXG5cdFx0XHRzZXQgbGluZU51bWJlcnModmFsdWU6IFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlKSB7XG5cdFx0XHRcdHRoYXQuX3NldExpbmVOdW1iZXJzKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIF9hY2NlcHQoc291cmNlOiBJUmVzb2x2ZWRUZXh0RWRpdG9yQ29uZmlndXJhdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX3RhYlNpemUgPSBzb3VyY2UudGFiU2l6ZTtcblx0XHR0aGlzLl9pbmRlbnRTaXplID0gc291cmNlLmluZGVudFNpemU7XG5cdFx0dGhpcy5fb3JpZ2luYWxJbmRlbnRTaXplID0gc291cmNlLm9yaWdpbmFsSW5kZW50U2l6ZTtcblx0XHR0aGlzLl9pbnNlcnRTcGFjZXMgPSBzb3VyY2UuaW5zZXJ0U3BhY2VzO1xuXHRcdHRoaXMuX2N1cnNvclN0eWxlID0gc291cmNlLmN1cnNvclN0eWxlO1xuXHRcdHRoaXMuX2xpbmVOdW1iZXJzID0gVHlwZUNvbnZlcnRlcnMuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUudG8oc291cmNlLmxpbmVOdW1iZXJzKTtcblx0fVxuXG5cdC8vIC0tLSBpbnRlcm5hbDogdGFiU2l6ZVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlVGFiU2l6ZSh2YWx1ZTogbnVtYmVyIHwgc3RyaW5nKTogbnVtYmVyIHwgJ2F1dG8nIHwgbnVsbCB7XG5cdFx0aWYgKHZhbHVlID09PSAnYXV0bycpIHtcblx0XHRcdHJldHVybiAnYXV0byc7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCByID0gTWF0aC5mbG9vcih2YWx1ZSk7XG5cdFx0XHRyZXR1cm4gKHIgPiAwID8gciA6IG51bGwpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgciA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XG5cdFx0XHRpZiAoaXNOYU4ocikpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKHIgPiAwID8gciA6IG51bGwpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX3NldFRhYlNpemUodmFsdWU6IG51bWJlciB8IHN0cmluZykge1xuXHRcdGNvbnN0IHRhYlNpemUgPSB0aGlzLl92YWxpZGF0ZVRhYlNpemUodmFsdWUpO1xuXHRcdGlmICh0YWJTaXplID09PSBudWxsKSB7XG5cdFx0XHQvLyBpZ25vcmUgaW52YWxpZCBjYWxsXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgdGFiU2l6ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGlmICh0aGlzLl90YWJTaXplID09PSB0YWJTaXplKSB7XG5cdFx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gcmVmbGVjdCB0aGUgbmV3IHRhYlNpemUgdmFsdWUgaW1tZWRpYXRlbHlcblx0XHRcdHRoaXMuX3RhYlNpemUgPSB0YWJTaXplO1xuXHRcdH1cblx0XHR0aGlzLl93YXJuT25FcnJvcignc2V0VGFiU2l6ZScsIHRoaXMuX3Byb3h5LiR0cnlTZXRPcHRpb25zKHRoaXMuX2lkLCB7XG5cdFx0XHR0YWJTaXplOiB0YWJTaXplXG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIGludGVybmFsOiBpbmRlbnRTaXplXG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVJbmRlbnRTaXplKHZhbHVlOiBudW1iZXIgfCBzdHJpbmcpOiBudW1iZXIgfCAndGFiU2l6ZScgfCBudWxsIHtcblx0XHRpZiAodmFsdWUgPT09ICd0YWJTaXplJykge1xuXHRcdFx0cmV0dXJuICd0YWJTaXplJztcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IHIgPSBNYXRoLmZsb29yKHZhbHVlKTtcblx0XHRcdHJldHVybiAociA+IDAgPyByIDogbnVsbCk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCByID0gcGFyc2VJbnQodmFsdWUsIDEwKTtcblx0XHRcdGlmIChpc05hTihyKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiAociA+IDAgPyByIDogbnVsbCk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SW5kZW50U2l6ZSh2YWx1ZTogbnVtYmVyIHwgc3RyaW5nKSB7XG5cdFx0Y29uc3QgaW5kZW50U2l6ZSA9IHRoaXMuX3ZhbGlkYXRlSW5kZW50U2l6ZSh2YWx1ZSk7XG5cdFx0aWYgKGluZGVudFNpemUgPT09IG51bGwpIHtcblx0XHRcdC8vIGlnbm9yZSBpbnZhbGlkIGNhbGxcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBpbmRlbnRTaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0aWYgKHRoaXMuX29yaWdpbmFsSW5kZW50U2l6ZSA9PT0gaW5kZW50U2l6ZSkge1xuXHRcdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIHJlZmxlY3QgdGhlIG5ldyBpbmRlbnRTaXplIHZhbHVlIGltbWVkaWF0ZWx5XG5cdFx0XHR0aGlzLl9pbmRlbnRTaXplID0gaW5kZW50U2l6ZTtcblx0XHRcdHRoaXMuX29yaWdpbmFsSW5kZW50U2l6ZSA9IGluZGVudFNpemU7XG5cdFx0fVxuXHRcdHRoaXMuX3dhcm5PbkVycm9yKCdzZXRJbmRlbnRTaXplJywgdGhpcy5fcHJveHkuJHRyeVNldE9wdGlvbnModGhpcy5faWQsIHtcblx0XHRcdGluZGVudFNpemU6IGluZGVudFNpemVcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gaW50ZXJuYWw6IGluc2VydCBzcGFjZXNcblxuXHRwcml2YXRlIF92YWxpZGF0ZUluc2VydFNwYWNlcyh2YWx1ZTogYm9vbGVhbiB8IHN0cmluZyk6IGJvb2xlYW4gfCAnYXV0bycge1xuXHRcdGlmICh2YWx1ZSA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRyZXR1cm4gJ2F1dG8nO1xuXHRcdH1cblx0XHRyZXR1cm4gKHZhbHVlID09PSAnZmFsc2UnID8gZmFsc2UgOiBCb29sZWFuKHZhbHVlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRJbnNlcnRTcGFjZXModmFsdWU6IGJvb2xlYW4gfCBzdHJpbmcpIHtcblx0XHRjb25zdCBpbnNlcnRTcGFjZXMgPSB0aGlzLl92YWxpZGF0ZUluc2VydFNwYWNlcyh2YWx1ZSk7XG5cdFx0aWYgKHR5cGVvZiBpbnNlcnRTcGFjZXMgPT09ICdib29sZWFuJykge1xuXHRcdFx0aWYgKHRoaXMuX2luc2VydFNwYWNlcyA9PT0gaW5zZXJ0U3BhY2VzKSB7XG5cdFx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gcmVmbGVjdCB0aGUgbmV3IGluc2VydFNwYWNlcyB2YWx1ZSBpbW1lZGlhdGVseVxuXHRcdFx0dGhpcy5faW5zZXJ0U3BhY2VzID0gaW5zZXJ0U3BhY2VzO1xuXHRcdH1cblx0XHR0aGlzLl93YXJuT25FcnJvcignc2V0SW5zZXJ0U3BhY2VzJywgdGhpcy5fcHJveHkuJHRyeVNldE9wdGlvbnModGhpcy5faWQsIHtcblx0XHRcdGluc2VydFNwYWNlczogaW5zZXJ0U3BhY2VzXG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIGludGVybmFsOiBjdXJzb3Igc3R5bGVcblxuXHRwcml2YXRlIF9zZXRDdXJzb3JTdHlsZSh2YWx1ZTogVGV4dEVkaXRvckN1cnNvclN0eWxlKSB7XG5cdFx0aWYgKHRoaXMuX2N1cnNvclN0eWxlID09PSB2YWx1ZSkge1xuXHRcdFx0Ly8gbm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJzb3JTdHlsZSA9IHZhbHVlO1xuXHRcdHRoaXMuX3dhcm5PbkVycm9yKCdzZXRDdXJzb3JTdHlsZScsIHRoaXMuX3Byb3h5LiR0cnlTZXRPcHRpb25zKHRoaXMuX2lkLCB7XG5cdFx0XHRjdXJzb3JTdHlsZTogdmFsdWVcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gaW50ZXJuYWw6IGxpbmUgbnVtYmVyXG5cblx0cHJpdmF0ZSBfc2V0TGluZU51bWJlcnModmFsdWU6IFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlKSB7XG5cdFx0aWYgKHRoaXMuX2xpbmVOdW1iZXJzID09PSB2YWx1ZSkge1xuXHRcdFx0Ly8gbm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9saW5lTnVtYmVycyA9IHZhbHVlO1xuXHRcdHRoaXMuX3dhcm5PbkVycm9yKCdzZXRMaW5lTnVtYmVycycsIHRoaXMuX3Byb3h5LiR0cnlTZXRPcHRpb25zKHRoaXMuX2lkLCB7XG5cdFx0XHRsaW5lTnVtYmVyczogVHlwZUNvbnZlcnRlcnMuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuZnJvbSh2YWx1ZSlcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgYXNzaWduKG5ld09wdGlvbnM6IHZzY29kZS5UZXh0RWRpdG9yT3B0aW9ucykge1xuXHRcdGNvbnN0IGJ1bGtDb25maWd1cmF0aW9uVXBkYXRlOiBJVGV4dEVkaXRvckNvbmZpZ3VyYXRpb25VcGRhdGUgPSB7fTtcblx0XHRsZXQgaGFzVXBkYXRlID0gZmFsc2U7XG5cblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMudGFiU2l6ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGNvbnN0IHRhYlNpemUgPSB0aGlzLl92YWxpZGF0ZVRhYlNpemUobmV3T3B0aW9ucy50YWJTaXplKTtcblx0XHRcdGlmICh0YWJTaXplID09PSAnYXV0bycpIHtcblx0XHRcdFx0aGFzVXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0YnVsa0NvbmZpZ3VyYXRpb25VcGRhdGUudGFiU2l6ZSA9IHRhYlNpemU7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB0YWJTaXplID09PSAnbnVtYmVyJyAmJiB0aGlzLl90YWJTaXplICE9PSB0YWJTaXplKSB7XG5cdFx0XHRcdC8vIHJlZmxlY3QgdGhlIG5ldyB0YWJTaXplIHZhbHVlIGltbWVkaWF0ZWx5XG5cdFx0XHRcdHRoaXMuX3RhYlNpemUgPSB0YWJTaXplO1xuXHRcdFx0XHRoYXNVcGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRidWxrQ29uZmlndXJhdGlvblVwZGF0ZS50YWJTaXplID0gdGFiU2l6ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMuaW5kZW50U2l6ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGNvbnN0IGluZGVudFNpemUgPSB0aGlzLl92YWxpZGF0ZUluZGVudFNpemUobmV3T3B0aW9ucy5pbmRlbnRTaXplKTtcblx0XHRcdGlmIChpbmRlbnRTaXplID09PSAndGFiU2l6ZScpIHtcblx0XHRcdFx0aGFzVXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0YnVsa0NvbmZpZ3VyYXRpb25VcGRhdGUuaW5kZW50U2l6ZSA9IGluZGVudFNpemU7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBpbmRlbnRTaXplID09PSAnbnVtYmVyJyAmJiB0aGlzLl9vcmlnaW5hbEluZGVudFNpemUgIT09IGluZGVudFNpemUpIHtcblx0XHRcdFx0Ly8gcmVmbGVjdCB0aGUgbmV3IGluZGVudFNpemUgdmFsdWUgaW1tZWRpYXRlbHlcblx0XHRcdFx0dGhpcy5faW5kZW50U2l6ZSA9IGluZGVudFNpemU7XG5cdFx0XHRcdHRoaXMuX29yaWdpbmFsSW5kZW50U2l6ZSA9IGluZGVudFNpemU7XG5cdFx0XHRcdGhhc1VwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdGJ1bGtDb25maWd1cmF0aW9uVXBkYXRlLmluZGVudFNpemUgPSBpbmRlbnRTaXplO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5pbnNlcnRTcGFjZXMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjb25zdCBpbnNlcnRTcGFjZXMgPSB0aGlzLl92YWxpZGF0ZUluc2VydFNwYWNlcyhuZXdPcHRpb25zLmluc2VydFNwYWNlcyk7XG5cdFx0XHRpZiAoaW5zZXJ0U3BhY2VzID09PSAnYXV0bycpIHtcblx0XHRcdFx0aGFzVXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0YnVsa0NvbmZpZ3VyYXRpb25VcGRhdGUuaW5zZXJ0U3BhY2VzID0gaW5zZXJ0U3BhY2VzO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9pbnNlcnRTcGFjZXMgIT09IGluc2VydFNwYWNlcykge1xuXHRcdFx0XHQvLyByZWZsZWN0IHRoZSBuZXcgaW5zZXJ0U3BhY2VzIHZhbHVlIGltbWVkaWF0ZWx5XG5cdFx0XHRcdHRoaXMuX2luc2VydFNwYWNlcyA9IGluc2VydFNwYWNlcztcblx0XHRcdFx0aGFzVXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0YnVsa0NvbmZpZ3VyYXRpb25VcGRhdGUuaW5zZXJ0U3BhY2VzID0gaW5zZXJ0U3BhY2VzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5jdXJzb3JTdHlsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGlmICh0aGlzLl9jdXJzb3JTdHlsZSAhPT0gbmV3T3B0aW9ucy5jdXJzb3JTdHlsZSkge1xuXHRcdFx0XHR0aGlzLl9jdXJzb3JTdHlsZSA9IG5ld09wdGlvbnMuY3Vyc29yU3R5bGU7XG5cdFx0XHRcdGhhc1VwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdGJ1bGtDb25maWd1cmF0aW9uVXBkYXRlLmN1cnNvclN0eWxlID0gbmV3T3B0aW9ucy5jdXJzb3JTdHlsZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMubGluZU51bWJlcnMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRpZiAodGhpcy5fbGluZU51bWJlcnMgIT09IG5ld09wdGlvbnMubGluZU51bWJlcnMpIHtcblx0XHRcdFx0dGhpcy5fbGluZU51bWJlcnMgPSBuZXdPcHRpb25zLmxpbmVOdW1iZXJzO1xuXHRcdFx0XHRoYXNVcGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRidWxrQ29uZmlndXJhdGlvblVwZGF0ZS5saW5lTnVtYmVycyA9IFR5cGVDb252ZXJ0ZXJzLlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLmZyb20obmV3T3B0aW9ucy5saW5lTnVtYmVycyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGhhc1VwZGF0ZSkge1xuXHRcdFx0dGhpcy5fd2Fybk9uRXJyb3IoJ3NldE9wdGlvbnMnLCB0aGlzLl9wcm94eS4kdHJ5U2V0T3B0aW9ucyh0aGlzLl9pZCwgYnVsa0NvbmZpZ3VyYXRpb25VcGRhdGUpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93YXJuT25FcnJvcihhY3Rpb246IHN0cmluZywgcHJvbWlzZTogUHJvbWlzZTxhbnk+KTogdm9pZCB7XG5cdFx0cHJvbWlzZS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBFeHRIb3N0VGV4dEVkaXRvck9wdGlvbnMgJyR7YWN0aW9ufScgZmFpbGVkOidgKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihlcnIpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0VGV4dEVkaXRvciB7XG5cblx0cHJpdmF0ZSBfc2VsZWN0aW9uczogU2VsZWN0aW9uW107XG5cdHByaXZhdGUgX29wdGlvbnM6IEV4dEhvc3RUZXh0RWRpdG9yT3B0aW9ucztcblx0cHJpdmF0ZSBfdmlzaWJsZVJhbmdlczogUmFuZ2VbXTtcblx0cHJpdmF0ZSBfdmlld0NvbHVtbjogdnNjb2RlLlZpZXdDb2x1bW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Rpc3Bvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc0RlY29yYXRpb25zRm9yS2V5ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX2RpZmZJbmZvcm1hdGlvbjogdnNjb2RlLlRleHRFZGl0b3JEaWZmSW5mb3JtYXRpb25bXSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSB2YWx1ZTogdnNjb2RlLlRleHRFZGl0b3I7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0ZG9jdW1lbnQ6IExhenk8dnNjb2RlLlRleHREb2N1bWVudD4sXG5cdFx0c2VsZWN0aW9uczogU2VsZWN0aW9uW10sIG9wdGlvbnM6IElSZXNvbHZlZFRleHRFZGl0b3JDb25maWd1cmF0aW9uLFxuXHRcdHZpc2libGVSYW5nZXM6IFJhbmdlW10sIHZpZXdDb2x1bW46IHZzY29kZS5WaWV3Q29sdW1uIHwgdW5kZWZpbmVkXG5cdCkge1xuXHRcdHRoaXMuX3NlbGVjdGlvbnMgPSBzZWxlY3Rpb25zO1xuXHRcdHRoaXMuX29wdGlvbnMgPSBuZXcgRXh0SG9zdFRleHRFZGl0b3JPcHRpb25zKHRoaXMuX3Byb3h5LCB0aGlzLmlkLCBvcHRpb25zLCBfbG9nU2VydmljZSk7XG5cdFx0dGhpcy5fdmlzaWJsZVJhbmdlcyA9IHZpc2libGVSYW5nZXM7XG5cdFx0dGhpcy5fdmlld0NvbHVtbiA9IHZpZXdDb2x1bW47XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdHRoaXMudmFsdWUgPSBPYmplY3QuZnJlZXplKHtcblx0XHRcdGdldCBkb2N1bWVudCgpOiB2c2NvZGUuVGV4dERvY3VtZW50IHtcblx0XHRcdFx0cmV0dXJuIGRvY3VtZW50LnZhbHVlO1xuXHRcdFx0fSxcblx0XHRcdHNldCBkb2N1bWVudChfdmFsdWUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFJlYWRvbmx5RXJyb3IoJ2RvY3VtZW50Jyk7XG5cdFx0XHR9LFxuXHRcdFx0Ly8gLS0tIHNlbGVjdGlvblxuXHRcdFx0Z2V0IHNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fc2VsZWN0aW9ucyAmJiB0aGF0Ll9zZWxlY3Rpb25zWzBdO1xuXHRcdFx0fSxcblx0XHRcdHNldCBzZWxlY3Rpb24odmFsdWU6IFNlbGVjdGlvbikge1xuXHRcdFx0XHRpZiAoISh2YWx1ZSBpbnN0YW5jZW9mIFNlbGVjdGlvbikpIHtcblx0XHRcdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3NlbGVjdGlvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoYXQuX3NlbGVjdGlvbnMgPSBbdmFsdWVdO1xuXHRcdFx0XHR0aGF0Ll90cnlTZXRTZWxlY3Rpb24oKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgc2VsZWN0aW9ucygpOiBTZWxlY3Rpb25bXSB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9zZWxlY3Rpb25zO1xuXHRcdFx0fSxcblx0XHRcdHNldCBzZWxlY3Rpb25zKHZhbHVlOiBTZWxlY3Rpb25bXSkge1xuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpIHx8IHZhbHVlLnNvbWUoYSA9PiAhKGEgaW5zdGFuY2VvZiBTZWxlY3Rpb24pKSkge1xuXHRcdFx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnc2VsZWN0aW9ucycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR2YWx1ZSA9IFtuZXcgU2VsZWN0aW9uKDAsIDAsIDAsIDApXTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGF0Ll9zZWxlY3Rpb25zID0gdmFsdWU7XG5cdFx0XHRcdHRoYXQuX3RyeVNldFNlbGVjdGlvbigpO1xuXHRcdFx0fSxcblx0XHRcdC8vIC0tLSB2aXNpYmxlIHJhbmdlc1xuXHRcdFx0Z2V0IHZpc2libGVSYW5nZXMoKTogUmFuZ2VbXSB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll92aXNpYmxlUmFuZ2VzO1xuXHRcdFx0fSxcblx0XHRcdHNldCB2aXNpYmxlUmFuZ2VzKF92YWx1ZTogUmFuZ2VbXSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUmVhZG9ubHlFcnJvcigndmlzaWJsZVJhbmdlcycpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBkaWZmSW5mb3JtYXRpb24oKSB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9kaWZmSW5mb3JtYXRpb247XG5cdFx0XHR9LFxuXHRcdFx0Ly8gLS0tIG9wdGlvbnNcblx0XHRcdGdldCBvcHRpb25zKCk6IHZzY29kZS5UZXh0RWRpdG9yT3B0aW9ucyB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9vcHRpb25zLnZhbHVlO1xuXHRcdFx0fSxcblx0XHRcdHNldCBvcHRpb25zKHZhbHVlOiB2c2NvZGUuVGV4dEVkaXRvck9wdGlvbnMpIHtcblx0XHRcdFx0aWYgKCF0aGF0Ll9kaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRoYXQuX29wdGlvbnMuYXNzaWduKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdC8vIC0tLSB2aWV3IGNvbHVtblxuXHRcdFx0Z2V0IHZpZXdDb2x1bW4oKTogdnNjb2RlLlZpZXdDb2x1bW4gfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fdmlld0NvbHVtbjtcblx0XHRcdH0sXG5cdFx0XHRzZXQgdmlld0NvbHVtbihfdmFsdWUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFJlYWRvbmx5RXJyb3IoJ3ZpZXdDb2x1bW4nKTtcblx0XHRcdH0sXG5cdFx0XHQvLyAtLS0gZWRpdFxuXHRcdFx0ZWRpdChjYWxsYmFjazogKGVkaXQ6IFRleHRFZGl0b3JFZGl0KSA9PiB2b2lkLCBvcHRpb25zOiB7IHVuZG9TdG9wQmVmb3JlOiBib29sZWFuOyB1bmRvU3RvcEFmdGVyOiBib29sZWFuIH0gPSB7IHVuZG9TdG9wQmVmb3JlOiB0cnVlLCB1bmRvU3RvcEFmdGVyOiB0cnVlIH0pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRcdFx0aWYgKHRoYXQuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignVGV4dEVkaXRvciNlZGl0IG5vdCBwb3NzaWJsZSBvbiBjbG9zZWQgZWRpdG9ycycpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlZGl0ID0gbmV3IFRleHRFZGl0b3JFZGl0KGRvY3VtZW50LnZhbHVlLCBvcHRpb25zKTtcblx0XHRcdFx0Y2FsbGJhY2soZWRpdCk7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9hcHBseUVkaXQoZWRpdCk7XG5cdFx0XHR9LFxuXHRcdFx0Ly8gLS0tIHNuaXBwZXQgZWRpdFxuXHRcdFx0aW5zZXJ0U25pcHBldChzbmlwcGV0OiBTbmlwcGV0U3RyaW5nLCB3aGVyZT86IFBvc2l0aW9uIHwgcmVhZG9ubHkgUG9zaXRpb25bXSB8IFJhbmdlIHwgcmVhZG9ubHkgUmFuZ2VbXSwgb3B0aW9uczogeyB1bmRvU3RvcEJlZm9yZTogYm9vbGVhbjsgdW5kb1N0b3BBZnRlcjogYm9vbGVhbjsga2VlcFdoaXRlc3BhY2U/OiBib29sZWFuIH0gPSB7IHVuZG9TdG9wQmVmb3JlOiB0cnVlLCB1bmRvU3RvcEFmdGVyOiB0cnVlIH0pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRcdFx0aWYgKHRoYXQuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignVGV4dEVkaXRvciNpbnNlcnRTbmlwcGV0IG5vdCBwb3NzaWJsZSBvbiBjbG9zZWQgZWRpdG9ycycpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgcmFuZ2VzOiBJUmFuZ2VbXTtcblxuXHRcdFx0XHRpZiAoIXdoZXJlIHx8IChBcnJheS5pc0FycmF5KHdoZXJlKSAmJiB3aGVyZS5sZW5ndGggPT09IDApKSB7XG5cdFx0XHRcdFx0cmFuZ2VzID0gdGhhdC5fc2VsZWN0aW9ucy5tYXAocmFuZ2UgPT4gVHlwZUNvbnZlcnRlcnMuUmFuZ2UuZnJvbShyYW5nZSkpO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAod2hlcmUgaW5zdGFuY2VvZiBQb3NpdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHsgbGluZU51bWJlciwgY29sdW1uIH0gPSBUeXBlQ29udmVydGVycy5Qb3NpdGlvbi5mcm9tKHdoZXJlKTtcblx0XHRcdFx0XHRyYW5nZXMgPSBbeyBzdGFydExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBjb2x1bW4sIGVuZExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsIGVuZENvbHVtbjogY29sdW1uIH1dO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAod2hlcmUgaW5zdGFuY2VvZiBSYW5nZSkge1xuXHRcdFx0XHRcdHJhbmdlcyA9IFtUeXBlQ29udmVydGVycy5SYW5nZS5mcm9tKHdoZXJlKV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmFuZ2VzID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwb3NPclJhbmdlIG9mIHdoZXJlKSB7XG5cdFx0XHRcdFx0XHRpZiAocG9zT3JSYW5nZSBpbnN0YW5jZW9mIFJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdHJhbmdlcy5wdXNoKFR5cGVDb252ZXJ0ZXJzLlJhbmdlLmZyb20ocG9zT3JSYW5nZSkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSA9IFR5cGVDb252ZXJ0ZXJzLlBvc2l0aW9uLmZyb20ocG9zT3JSYW5nZSk7XG5cdFx0XHRcdFx0XHRcdHJhbmdlcy5wdXNoKHsgc3RhcnRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLCBzdGFydENvbHVtbjogY29sdW1uLCBlbmRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLCBlbmRDb2x1bW46IGNvbHVtbiB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wdGlvbnMua2VlcFdoaXRlc3BhY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdG9wdGlvbnMua2VlcFdoaXRlc3BhY2UgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gX3Byb3h5LiR0cnlJbnNlcnRTbmlwcGV0KGlkLCBkb2N1bWVudC52YWx1ZS52ZXJzaW9uLCBzbmlwcGV0LnZhbHVlLCByYW5nZXMsIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdHNldERlY29yYXRpb25zKGRlY29yYXRpb25UeXBlOiB2c2NvZGUuVGV4dEVkaXRvckRlY29yYXRpb25UeXBlLCByYW5nZXM6IFJhbmdlW10gfCB2c2NvZGUuRGVjb3JhdGlvbk9wdGlvbnNbXSk6IHZvaWQge1xuXHRcdFx0XHRjb25zdCB3aWxsQmVFbXB0eSA9IChyYW5nZXMubGVuZ3RoID09PSAwKTtcblx0XHRcdFx0aWYgKHdpbGxCZUVtcHR5ICYmICF0aGF0Ll9oYXNEZWNvcmF0aW9uc0ZvcktleS5oYXMoZGVjb3JhdGlvblR5cGUua2V5KSkge1xuXHRcdFx0XHRcdC8vIGF2b2lkIG5vLW9wIGNhbGwgdG8gdGhlIHJlbmRlcmVyXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh3aWxsQmVFbXB0eSkge1xuXHRcdFx0XHRcdHRoYXQuX2hhc0RlY29yYXRpb25zRm9yS2V5LmRlbGV0ZShkZWNvcmF0aW9uVHlwZS5rZXkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoYXQuX2hhc0RlY29yYXRpb25zRm9yS2V5LmFkZChkZWNvcmF0aW9uVHlwZS5rZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoYXQuX3J1bk9uUHJveHkoKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChUeXBlQ29udmVydGVycy5pc0RlY29yYXRpb25PcHRpb25zQXJyKHJhbmdlcykpIHtcblx0XHRcdFx0XHRcdHJldHVybiBfcHJveHkuJHRyeVNldERlY29yYXRpb25zKFxuXHRcdFx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblR5cGUua2V5LFxuXHRcdFx0XHRcdFx0XHRUeXBlQ29udmVydGVycy5mcm9tUmFuZ2VPclJhbmdlV2l0aE1lc3NhZ2UocmFuZ2VzKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgX3JhbmdlczogbnVtYmVyW10gPSBuZXcgQXJyYXk8bnVtYmVyPig0ICogcmFuZ2VzLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcmFuZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJhbmdlID0gcmFuZ2VzW2ldO1xuXHRcdFx0XHRcdFx0XHRfcmFuZ2VzWzQgKiBpXSA9IHJhbmdlLnN0YXJ0LmxpbmUgKyAxO1xuXHRcdFx0XHRcdFx0XHRfcmFuZ2VzWzQgKiBpICsgMV0gPSByYW5nZS5zdGFydC5jaGFyYWN0ZXIgKyAxO1xuXHRcdFx0XHRcdFx0XHRfcmFuZ2VzWzQgKiBpICsgMl0gPSByYW5nZS5lbmQubGluZSArIDE7XG5cdFx0XHRcdFx0XHRcdF9yYW5nZXNbNCAqIGkgKyAzXSA9IHJhbmdlLmVuZC5jaGFyYWN0ZXIgKyAxO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIF9wcm94eS4kdHJ5U2V0RGVjb3JhdGlvbnNGYXN0KFxuXHRcdFx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblR5cGUua2V5LFxuXHRcdFx0XHRcdFx0XHRfcmFuZ2VzXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0cmV2ZWFsUmFuZ2UocmFuZ2U6IFJhbmdlLCByZXZlYWxUeXBlOiB2c2NvZGUuVGV4dEVkaXRvclJldmVhbFR5cGUpOiB2b2lkIHtcblx0XHRcdFx0dGhhdC5fcnVuT25Qcm94eSgoKSA9PiBfcHJveHkuJHRyeVJldmVhbFJhbmdlKFxuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFR5cGVDb252ZXJ0ZXJzLlJhbmdlLmZyb20ocmFuZ2UpLFxuXHRcdFx0XHRcdChyZXZlYWxUeXBlIHx8IFRleHRFZGl0b3JSZXZlYWxUeXBlLkRlZmF1bHQpXG5cdFx0XHRcdCkpO1xuXHRcdFx0fSxcblx0XHRcdHNob3coY29sdW1uOiB2c2NvZGUuVmlld0NvbHVtbikge1xuXHRcdFx0XHRfcHJveHkuJHRyeVNob3dFZGl0b3IoaWQsIFR5cGVDb252ZXJ0ZXJzLlZpZXdDb2x1bW4uZnJvbShjb2x1bW4pKTtcblx0XHRcdH0sXG5cdFx0XHRoaWRlKCkge1xuXHRcdFx0XHRfcHJveHkuJHRyeUhpZGVFZGl0b3IoaWQpO1xuXHRcdFx0fSxcblx0XHRcdFtTeW1ib2wuZm9yKCdkZWJ1Zy5kZXNjcmlwdGlvbicpXSgpIHtcblx0XHRcdFx0cmV0dXJuIGBUZXh0RWRpdG9yKCR7dGhpcy5kb2N1bWVudC51cmkudG9TdHJpbmcoKX0pYDtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0b2soIXRoaXMuX2Rpc3Bvc2VkKTtcblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdH1cblxuXHQvLyAtLS0gaW5jb21pbmc6IGV4dGVuc2lvbiBob3N0IE1VU1QgYWNjZXB0IHdoYXQgdGhlIHJlbmRlcmVyIHNheXNcblxuXHRfYWNjZXB0T3B0aW9ucyhvcHRpb25zOiBJUmVzb2x2ZWRUZXh0RWRpdG9yQ29uZmlndXJhdGlvbik6IHZvaWQge1xuXHRcdG9rKCF0aGlzLl9kaXNwb3NlZCk7XG5cdFx0dGhpcy5fb3B0aW9ucy5fYWNjZXB0KG9wdGlvbnMpO1xuXHR9XG5cblx0X2FjY2VwdFZpc2libGVSYW5nZXModmFsdWU6IFJhbmdlW10pOiB2b2lkIHtcblx0XHRvayghdGhpcy5fZGlzcG9zZWQpO1xuXHRcdHRoaXMuX3Zpc2libGVSYW5nZXMgPSB2YWx1ZTtcblx0fVxuXG5cdF9hY2NlcHRWaWV3Q29sdW1uKHZhbHVlOiB2c2NvZGUuVmlld0NvbHVtbikge1xuXHRcdG9rKCF0aGlzLl9kaXNwb3NlZCk7XG5cdFx0dGhpcy5fdmlld0NvbHVtbiA9IHZhbHVlO1xuXHR9XG5cblx0X2FjY2VwdFNlbGVjdGlvbnMoc2VsZWN0aW9uczogU2VsZWN0aW9uW10pOiB2b2lkIHtcblx0XHRvayghdGhpcy5fZGlzcG9zZWQpO1xuXHRcdHRoaXMuX3NlbGVjdGlvbnMgPSBzZWxlY3Rpb25zO1xuXHR9XG5cblx0X2FjY2VwdERpZmZJbmZvcm1hdGlvbihkaWZmSW5mb3JtYXRpb246IHZzY29kZS5UZXh0RWRpdG9yRGlmZkluZm9ybWF0aW9uW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRvayghdGhpcy5fZGlzcG9zZWQpO1xuXHRcdHRoaXMuX2RpZmZJbmZvcm1hdGlvbiA9IGRpZmZJbmZvcm1hdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3RyeVNldFNlbGVjdGlvbigpOiBQcm9taXNlPHZzY29kZS5UZXh0RWRpdG9yIHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX3NlbGVjdGlvbnMubWFwKFR5cGVDb252ZXJ0ZXJzLlNlbGVjdGlvbi5mcm9tKTtcblx0XHRhd2FpdCB0aGlzLl9ydW5PblByb3h5KCgpID0+IHRoaXMuX3Byb3h5LiR0cnlTZXRTZWxlY3Rpb25zKHRoaXMuaWQsIHNlbGVjdGlvbikpO1xuXHRcdHJldHVybiB0aGlzLnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlFZGl0KGVkaXRCdWlsZGVyOiBUZXh0RWRpdG9yRWRpdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGVkaXREYXRhID0gZWRpdEJ1aWxkZXIuZmluYWxpemUoKTtcblxuXHRcdC8vIHJldHVybiB3aGVuIHRoZXJlIGlzIG5vdGhpbmcgdG8gZG9cblx0XHRpZiAoZWRpdERhdGEuZWRpdHMubGVuZ3RoID09PSAwICYmICFlZGl0RGF0YS5zZXRFbmRPZkxpbmUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgdGhhdCB0aGUgZWRpdHMgYXJlIG5vdCBvdmVybGFwcGluZyAoaS5lLiBpbGxlZ2FsKVxuXHRcdGNvbnN0IGVkaXRSYW5nZXMgPSBlZGl0RGF0YS5lZGl0cy5tYXAoZWRpdCA9PiBlZGl0LnJhbmdlKTtcblxuXHRcdC8vIHNvcnQgYXNjZW5kaW5nIChieSBlbmQgYW5kIHRoZW4gYnkgc3RhcnQpXG5cdFx0ZWRpdFJhbmdlcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5lbmQubGluZSA9PT0gYi5lbmQubGluZSkge1xuXHRcdFx0XHRpZiAoYS5lbmQuY2hhcmFjdGVyID09PSBiLmVuZC5jaGFyYWN0ZXIpIHtcblx0XHRcdFx0XHRpZiAoYS5zdGFydC5saW5lID09PSBiLnN0YXJ0LmxpbmUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBhLnN0YXJ0LmNoYXJhY3RlciAtIGIuc3RhcnQuY2hhcmFjdGVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYS5zdGFydC5saW5lIC0gYi5zdGFydC5saW5lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhLmVuZC5jaGFyYWN0ZXIgLSBiLmVuZC5jaGFyYWN0ZXI7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYS5lbmQubGluZSAtIGIuZW5kLmxpbmU7XG5cdFx0fSk7XG5cblx0XHQvLyBjaGVjayB0aGF0IG5vIGVkaXRzIGFyZSBvdmVybGFwcGluZ1xuXHRcdGZvciAobGV0IGkgPSAwLCBjb3VudCA9IGVkaXRSYW5nZXMubGVuZ3RoIC0gMTsgaSA8IGNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHJhbmdlRW5kID0gZWRpdFJhbmdlc1tpXS5lbmQ7XG5cdFx0XHRjb25zdCBuZXh0UmFuZ2VTdGFydCA9IGVkaXRSYW5nZXNbaSArIDFdLnN0YXJ0O1xuXG5cdFx0XHRpZiAobmV4dFJhbmdlU3RhcnQuaXNCZWZvcmUocmFuZ2VFbmQpKSB7XG5cdFx0XHRcdC8vIG92ZXJsYXBwaW5nIHJhbmdlc1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoXG5cdFx0XHRcdFx0bmV3IEVycm9yKCdPdmVybGFwcGluZyByYW5nZXMgYXJlIG5vdCBhbGxvd2VkIScpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gcHJlcGFyZSBkYXRhIGZvciBzZXJpYWxpemF0aW9uXG5cdFx0Y29uc3QgZWRpdHMgPSBlZGl0RGF0YS5lZGl0cy5tYXAoKGVkaXQpOiBJU2luZ2xlRWRpdE9wZXJhdGlvbiA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogVHlwZUNvbnZlcnRlcnMuUmFuZ2UuZnJvbShlZGl0LnJhbmdlKSxcblx0XHRcdFx0dGV4dDogZWRpdC50ZXh0LFxuXHRcdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBlZGl0LmZvcmNlTW92ZU1hcmtlcnNcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHRyeUFwcGx5RWRpdHModGhpcy5pZCwgZWRpdERhdGEuZG9jdW1lbnRWZXJzaW9uSWQsIGVkaXRzLCB7XG5cdFx0XHRzZXRFbmRPZkxpbmU6IHR5cGVvZiBlZGl0RGF0YS5zZXRFbmRPZkxpbmUgPT09ICdudW1iZXInID8gVHlwZUNvbnZlcnRlcnMuRW5kT2ZMaW5lLmZyb20oZWRpdERhdGEuc2V0RW5kT2ZMaW5lKSA6IHVuZGVmaW5lZCxcblx0XHRcdHVuZG9TdG9wQmVmb3JlOiBlZGl0RGF0YS51bmRvU3RvcEJlZm9yZSxcblx0XHRcdHVuZG9TdG9wQWZ0ZXI6IGVkaXREYXRhLnVuZG9TdG9wQWZ0ZXJcblx0XHR9KTtcblx0fVxuXHRwcml2YXRlIF9ydW5PblByb3h5KGNhbGxiYWNrOiAoKSA9PiBQcm9taXNlPGFueT4pOiBQcm9taXNlPEV4dEhvc3RUZXh0RWRpdG9yIHwgdW5kZWZpbmVkIHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdUZXh0RWRpdG9yIGlzIGNsb3NlZC9kaXNwb3NlZCcpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjYWxsYmFjaygpLnRoZW4oKCkgPT4gdGhpcywgZXJyID0+IHtcblx0XHRcdGlmICghKGVyciBpbnN0YW5jZW9mIEVycm9yICYmIGVyci5uYW1lID09PSAnRElTUE9TRUQnKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oZXJyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVU7QUFDbkIsU0FBUyxlQUFlLHVCQUF1QjtBQUMvQyxTQUFTLG1CQUFtQjtBQUs1QixZQUFZLG9CQUFvQjtBQUNoQyxTQUFTLFdBQVcsVUFBVSxPQUFPLFdBQXNELDRCQUE0QjtBQU1oSCxNQUFNLDRCQUFOLE1BQU0sMEJBQXlCO0FBQUEsRUFNckMsWUFBWSxPQUFtQyxXQUFrQyxTQUF5QztBQUN6SCxVQUFNLE1BQU0sMEJBQXlCLE1BQU0sT0FBTztBQUNsRCxVQUFNLGtDQUFrQyxVQUFVLFlBQVksS0FBSyxlQUFlLHdCQUF3QixLQUFLLE9BQU8sQ0FBQztBQUN2SCxTQUFLLFFBQVEsT0FBTyxPQUFPO0FBQUEsTUFDMUI7QUFBQSxNQUNBLFVBQVU7QUFDVCxjQUFNLGdDQUFnQyxHQUFHO0FBQUEsTUFDMUM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBRUQ7QUFqQmEsMEJBRVksUUFBUSxJ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
