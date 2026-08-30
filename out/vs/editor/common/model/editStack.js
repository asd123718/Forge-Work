import * as nls from "../../../nls.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { Selection } from "../core/selection.js";
import { EndOfLineSequence } from "../model.js";
import { UndoRedoElementType } from "../../../platform/undoRedo/common/undoRedo.js";
import { URI } from "../../../base/common/uri.js";
import { TextChange, compressConsecutiveTextChanges } from "../core/textChange.js";
import * as buffer from "../../../base/common/buffer.js";
import { basename } from "../../../base/common/resources.js";
import { EditSources } from "../textModelEditSource.js";
function uriGetComparisonKey(resource) {
  return resource.toString();
}
class SingleModelEditStackData {
  constructor(beforeVersionId, afterVersionId, beforeEOL, afterEOL, beforeCursorState, afterCursorState, changes) {
    this.beforeVersionId = beforeVersionId;
    this.afterVersionId = afterVersionId;
    this.beforeEOL = beforeEOL;
    this.afterEOL = afterEOL;
    this.beforeCursorState = beforeCursorState;
    this.afterCursorState = afterCursorState;
    this.changes = changes;
  }
  static create(model, beforeCursorState) {
    const alternativeVersionId = model.getAlternativeVersionId();
    const eol = getModelEOL(model);
    return new SingleModelEditStackData(
      alternativeVersionId,
      alternativeVersionId,
      eol,
      eol,
      beforeCursorState,
      beforeCursorState,
      []
    );
  }
  append(model, textChanges, afterEOL, afterVersionId, afterCursorState) {
    if (textChanges.length > 0) {
      this.changes = compressConsecutiveTextChanges(this.changes, textChanges);
    }
    this.afterEOL = afterEOL;
    this.afterVersionId = afterVersionId;
    this.afterCursorState = afterCursorState;
  }
  static _writeSelectionsSize(selections) {
    return 4 + 4 * 4 * (selections ? selections.length : 0);
  }
  static _writeSelections(b, selections, offset) {
    buffer.writeUInt32BE(b, selections ? selections.length : 0, offset);
    offset += 4;
    if (selections) {
      for (const selection of selections) {
        buffer.writeUInt32BE(b, selection.selectionStartLineNumber, offset);
        offset += 4;
        buffer.writeUInt32BE(b, selection.selectionStartColumn, offset);
        offset += 4;
        buffer.writeUInt32BE(b, selection.positionLineNumber, offset);
        offset += 4;
        buffer.writeUInt32BE(b, selection.positionColumn, offset);
        offset += 4;
      }
    }
    return offset;
  }
  static _readSelections(b, offset, dest) {
    const count = buffer.readUInt32BE(b, offset);
    offset += 4;
    for (let i = 0; i < count; i++) {
      const selectionStartLineNumber = buffer.readUInt32BE(b, offset);
      offset += 4;
      const selectionStartColumn = buffer.readUInt32BE(b, offset);
      offset += 4;
      const positionLineNumber = buffer.readUInt32BE(b, offset);
      offset += 4;
      const positionColumn = buffer.readUInt32BE(b, offset);
      offset += 4;
      dest.push(new Selection(selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn));
    }
    return offset;
  }
  serialize() {
    let necessarySize = 4 + 4 + 1 + 1 + SingleModelEditStackData._writeSelectionsSize(this.beforeCursorState) + SingleModelEditStackData._writeSelectionsSize(this.afterCursorState) + 4;
    for (const change of this.changes) {
      necessarySize += change.writeSize();
    }
    const b = new Uint8Array(necessarySize);
    let offset = 0;
    buffer.writeUInt32BE(b, this.beforeVersionId, offset);
    offset += 4;
    buffer.writeUInt32BE(b, this.afterVersionId, offset);
    offset += 4;
    buffer.writeUInt8(b, this.beforeEOL, offset);
    offset += 1;
    buffer.writeUInt8(b, this.afterEOL, offset);
    offset += 1;
    offset = SingleModelEditStackData._writeSelections(b, this.beforeCursorState, offset);
    offset = SingleModelEditStackData._writeSelections(b, this.afterCursorState, offset);
    buffer.writeUInt32BE(b, this.changes.length, offset);
    offset += 4;
    for (const change of this.changes) {
      offset = change.write(b, offset);
    }
    return b.buffer;
  }
  static deserialize(source) {
    const b = new Uint8Array(source);
    let offset = 0;
    const beforeVersionId = buffer.readUInt32BE(b, offset);
    offset += 4;
    const afterVersionId = buffer.readUInt32BE(b, offset);
    offset += 4;
    const beforeEOL = buffer.readUInt8(b, offset);
    offset += 1;
    const afterEOL = buffer.readUInt8(b, offset);
    offset += 1;
    const beforeCursorState = [];
    offset = SingleModelEditStackData._readSelections(b, offset, beforeCursorState);
    const afterCursorState = [];
    offset = SingleModelEditStackData._readSelections(b, offset, afterCursorState);
    const changeCount = buffer.readUInt32BE(b, offset);
    offset += 4;
    const changes = [];
    for (let i = 0; i < changeCount; i++) {
      offset = TextChange.read(b, offset, changes);
    }
    return new SingleModelEditStackData(
      beforeVersionId,
      afterVersionId,
      beforeEOL,
      afterEOL,
      beforeCursorState,
      afterCursorState,
      changes
    );
  }
}
class SingleModelEditStackElement {
  constructor(label, code, model, beforeCursorState) {
    this.label = label;
    this.code = code;
    this.model = model;
    this._data = SingleModelEditStackData.create(model, beforeCursorState);
  }
  get type() {
    return UndoRedoElementType.Resource;
  }
  get resource() {
    if (URI.isUri(this.model)) {
      return this.model;
    }
    return this.model.uri;
  }
  toString() {
    const data = this._data instanceof SingleModelEditStackData ? this._data : SingleModelEditStackData.deserialize(this._data);
    return data.changes.map((change) => change.toString()).join(", ");
  }
  matchesResource(resource) {
    const uri = URI.isUri(this.model) ? this.model : this.model.uri;
    return uri.toString() === resource.toString();
  }
  setModel(model) {
    this.model = model;
  }
  canAppend(model) {
    return this.model === model && this._data instanceof SingleModelEditStackData;
  }
  append(model, textChanges, afterEOL, afterVersionId, afterCursorState) {
    if (this._data instanceof SingleModelEditStackData) {
      this._data.append(model, textChanges, afterEOL, afterVersionId, afterCursorState);
    }
  }
  close() {
    if (this._data instanceof SingleModelEditStackData) {
      this._data = this._data.serialize();
    }
  }
  open() {
    if (!(this._data instanceof SingleModelEditStackData)) {
      this._data = SingleModelEditStackData.deserialize(this._data);
    }
  }
  undo() {
    if (URI.isUri(this.model)) {
      throw new Error(`Invalid SingleModelEditStackElement`);
    }
    if (this._data instanceof SingleModelEditStackData) {
      this._data = this._data.serialize();
    }
    const data = SingleModelEditStackData.deserialize(this._data);
    this.model._applyUndo(data.changes, data.beforeEOL, data.beforeVersionId, data.beforeCursorState);
  }
  redo() {
    if (URI.isUri(this.model)) {
      throw new Error(`Invalid SingleModelEditStackElement`);
    }
    if (this._data instanceof SingleModelEditStackData) {
      this._data = this._data.serialize();
    }
    const data = SingleModelEditStackData.deserialize(this._data);
    this.model._applyRedo(data.changes, data.afterEOL, data.afterVersionId, data.afterCursorState);
  }
  heapSize() {
    if (this._data instanceof SingleModelEditStackData) {
      this._data = this._data.serialize();
    }
    return this._data.byteLength + 168;
  }
}
class MultiModelEditStackElement {
  constructor(label, code, editStackElements) {
    this.label = label;
    this.code = code;
    this.type = UndoRedoElementType.Workspace;
    this._isOpen = true;
    this._editStackElementsArr = editStackElements.slice(0);
    this._editStackElementsMap = /* @__PURE__ */ new Map();
    for (const editStackElement of this._editStackElementsArr) {
      const key = uriGetComparisonKey(editStackElement.resource);
      this._editStackElementsMap.set(key, editStackElement);
    }
    this._delegate = null;
  }
  get resources() {
    return this._editStackElementsArr.map((editStackElement) => editStackElement.resource);
  }
  setDelegate(delegate) {
    this._delegate = delegate;
  }
  prepareUndoRedo() {
    if (this._delegate) {
      return this._delegate.prepareUndoRedo(this);
    }
  }
  getMissingModels() {
    const result = [];
    for (const editStackElement of this._editStackElementsArr) {
      if (URI.isUri(editStackElement.model)) {
        result.push(editStackElement.model);
      }
    }
    return result;
  }
  matchesResource(resource) {
    const key = uriGetComparisonKey(resource);
    return this._editStackElementsMap.has(key);
  }
  setModel(model) {
    const key = uriGetComparisonKey(URI.isUri(model) ? model : model.uri);
    if (this._editStackElementsMap.has(key)) {
      this._editStackElementsMap.get(key).setModel(model);
    }
  }
  canAppend(model) {
    if (!this._isOpen) {
      return false;
    }
    const key = uriGetComparisonKey(model.uri);
    if (this._editStackElementsMap.has(key)) {
      const editStackElement = this._editStackElementsMap.get(key);
      return editStackElement.canAppend(model);
    }
    return false;
  }
  append(model, textChanges, afterEOL, afterVersionId, afterCursorState) {
    const key = uriGetComparisonKey(model.uri);
    const editStackElement = this._editStackElementsMap.get(key);
    editStackElement.append(model, textChanges, afterEOL, afterVersionId, afterCursorState);
  }
  close() {
    this._isOpen = false;
  }
  open() {
  }
  undo() {
    this._isOpen = false;
    for (const editStackElement of this._editStackElementsArr) {
      editStackElement.undo();
    }
  }
  redo() {
    for (const editStackElement of this._editStackElementsArr) {
      editStackElement.redo();
    }
  }
  heapSize(resource) {
    const key = uriGetComparisonKey(resource);
    if (this._editStackElementsMap.has(key)) {
      const editStackElement = this._editStackElementsMap.get(key);
      return editStackElement.heapSize();
    }
    return 0;
  }
  split() {
    return this._editStackElementsArr;
  }
  toString() {
    const result = [];
    for (const editStackElement of this._editStackElementsArr) {
      result.push(`${basename(editStackElement.resource)}: ${editStackElement}`);
    }
    return `{${result.join(", ")}}`;
  }
}
function getModelEOL(model) {
  const eol = model.getEOL();
  if (eol === "\n") {
    return EndOfLineSequence.LF;
  } else {
    return EndOfLineSequence.CRLF;
  }
}
function isEditStackElement(element) {
  if (!element) {
    return false;
  }
  return element instanceof SingleModelEditStackElement || element instanceof MultiModelEditStackElement;
}
class EditStack {
  constructor(model, undoRedoService) {
    this._model = model;
    this._undoRedoService = undoRedoService;
  }
  pushStackElement() {
    const lastElement = this._undoRedoService.getLastElement(this._model.uri);
    if (isEditStackElement(lastElement)) {
      lastElement.close();
    }
  }
  popStackElement() {
    const lastElement = this._undoRedoService.getLastElement(this._model.uri);
    if (isEditStackElement(lastElement)) {
      lastElement.open();
    }
  }
  clear() {
    this._undoRedoService.removeElements(this._model.uri);
  }
  _getOrCreateEditStackElement(beforeCursorState, group) {
    const lastElement = this._undoRedoService.getLastElement(this._model.uri);
    if (isEditStackElement(lastElement) && lastElement.canAppend(this._model)) {
      return lastElement;
    }
    const newElement = new SingleModelEditStackElement(nls.localize("edit", "Typing"), "undoredo.textBufferEdit", this._model, beforeCursorState);
    this._undoRedoService.pushElement(newElement, group);
    return newElement;
  }
  pushEOL(eol) {
    const editStackElement = this._getOrCreateEditStackElement(null, void 0);
    this._model.setEOL(eol);
    editStackElement.append(this._model, [], getModelEOL(this._model), this._model.getAlternativeVersionId(), null);
  }
  pushEditOperation(beforeCursorState, editOperations, cursorStateComputer, group, reason = EditSources.unknown({ name: "pushEditOperation" })) {
    const editStackElement = this._getOrCreateEditStackElement(beforeCursorState, group);
    const inverseEditOperations = this._model.applyEdits(editOperations, true, reason);
    const afterCursorState = EditStack._computeCursorState(cursorStateComputer, inverseEditOperations);
    const textChanges = inverseEditOperations.map((op, index) => ({ index, textChange: op.textChange }));
    textChanges.sort((a, b) => {
      if (a.textChange.oldPosition === b.textChange.oldPosition) {
        return a.index - b.index;
      }
      return a.textChange.oldPosition - b.textChange.oldPosition;
    });
    editStackElement.append(this._model, textChanges.map((op) => op.textChange), getModelEOL(this._model), this._model.getAlternativeVersionId(), afterCursorState);
    return afterCursorState;
  }
  static _computeCursorState(cursorStateComputer, inverseEditOperations) {
    try {
      return cursorStateComputer ? cursorStateComputer(inverseEditOperations) : null;
    } catch (e) {
      onUnexpectedError(e);
      return null;
    }
  }
}
export {
  EditStack,
  MultiModelEditStackElement,
  SingleModelEditStackData,
  SingleModelEditStackElement,
  isEditStackElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXGVkaXRTdGFjay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UsIElDdXJzb3JTdGF0ZUNvbXB1dGVyLCBJVmFsaWRFZGl0T3BlcmF0aW9uLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSwgSVJlc291cmNlVW5kb1JlZG9FbGVtZW50LCBVbmRvUmVkb0VsZW1lbnRUeXBlLCBJV29ya3NwYWNlVW5kb1JlZG9FbGVtZW50LCBVbmRvUmVkb0dyb3VwIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUZXh0Q2hhbmdlLCBjb21wcmVzc0NvbnNlY3V0aXZlVGV4dENoYW5nZXMgfSBmcm9tICcuLi9jb3JlL3RleHRDaGFuZ2UuanMnO1xuaW1wb3J0ICogYXMgYnVmZmVyIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlcywgVGV4dE1vZGVsRWRpdFNvdXJjZSB9IGZyb20gJy4uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuXG5mdW5jdGlvbiB1cmlHZXRDb21wYXJpc29uS2V5KHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRyZXR1cm4gcmVzb3VyY2UudG9TdHJpbmcoKTtcbn1cblxuZXhwb3J0IGNsYXNzIFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YSB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUobW9kZWw6IElUZXh0TW9kZWwsIGJlZm9yZUN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSB8IG51bGwpOiBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEge1xuXHRcdGNvbnN0IGFsdGVybmF0aXZlVmVyc2lvbklkID0gbW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKTtcblx0XHRjb25zdCBlb2wgPSBnZXRNb2RlbEVPTChtb2RlbCk7XG5cdFx0cmV0dXJuIG5ldyBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEoXG5cdFx0XHRhbHRlcm5hdGl2ZVZlcnNpb25JZCxcblx0XHRcdGFsdGVybmF0aXZlVmVyc2lvbklkLFxuXHRcdFx0ZW9sLFxuXHRcdFx0ZW9sLFxuXHRcdFx0YmVmb3JlQ3Vyc29yU3RhdGUsXG5cdFx0XHRiZWZvcmVDdXJzb3JTdGF0ZSxcblx0XHRcdFtdXG5cdFx0KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBiZWZvcmVWZXJzaW9uSWQ6IG51bWJlcixcblx0XHRwdWJsaWMgYWZ0ZXJWZXJzaW9uSWQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgYmVmb3JlRU9MOiBFbmRPZkxpbmVTZXF1ZW5jZSxcblx0XHRwdWJsaWMgYWZ0ZXJFT0w6IEVuZE9mTGluZVNlcXVlbmNlLFxuXHRcdHB1YmxpYyByZWFkb25seSBiZWZvcmVDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gfCBudWxsLFxuXHRcdHB1YmxpYyBhZnRlckN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSB8IG51bGwsXG5cdFx0cHVibGljIGNoYW5nZXM6IFRleHRDaGFuZ2VbXVxuXHQpIHsgfVxuXG5cdHB1YmxpYyBhcHBlbmQobW9kZWw6IElUZXh0TW9kZWwsIHRleHRDaGFuZ2VzOiBUZXh0Q2hhbmdlW10sIGFmdGVyRU9MOiBFbmRPZkxpbmVTZXF1ZW5jZSwgYWZ0ZXJWZXJzaW9uSWQ6IG51bWJlciwgYWZ0ZXJDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKHRleHRDaGFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuY2hhbmdlcyA9IGNvbXByZXNzQ29uc2VjdXRpdmVUZXh0Q2hhbmdlcyh0aGlzLmNoYW5nZXMsIHRleHRDaGFuZ2VzKTtcblx0XHR9XG5cdFx0dGhpcy5hZnRlckVPTCA9IGFmdGVyRU9MO1xuXHRcdHRoaXMuYWZ0ZXJWZXJzaW9uSWQgPSBhZnRlclZlcnNpb25JZDtcblx0XHR0aGlzLmFmdGVyQ3Vyc29yU3RhdGUgPSBhZnRlckN1cnNvclN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3dyaXRlU2VsZWN0aW9uc1NpemUoc2VsZWN0aW9uczogU2VsZWN0aW9uW10gfCBudWxsKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gNCArIDQgKiA0ICogKHNlbGVjdGlvbnMgPyBzZWxlY3Rpb25zLmxlbmd0aCA6IDApO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3dyaXRlU2VsZWN0aW9ucyhiOiBVaW50OEFycmF5LCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSB8IG51bGwsIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRidWZmZXIud3JpdGVVSW50MzJCRShiLCAoc2VsZWN0aW9ucyA/IHNlbGVjdGlvbnMubGVuZ3RoIDogMCksIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdGJ1ZmZlci53cml0ZVVJbnQzMkJFKGIsIHNlbGVjdGlvbi5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdFx0XHRidWZmZXIud3JpdGVVSW50MzJCRShiLCBzZWxlY3Rpb24uc2VsZWN0aW9uU3RhcnRDb2x1bW4sIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdFx0XHRidWZmZXIud3JpdGVVSW50MzJCRShiLCBzZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRcdFx0YnVmZmVyLndyaXRlVUludDMyQkUoYiwgc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1uLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG9mZnNldDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZWFkU2VsZWN0aW9ucyhiOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgZGVzdDogU2VsZWN0aW9uW10pOiBudW1iZXIge1xuXHRcdGNvbnN0IGNvdW50ID0gYnVmZmVyLnJlYWRVSW50MzJCRShiLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvblN0YXJ0TGluZU51bWJlciA9IGJ1ZmZlci5yZWFkVUludDMyQkUoYiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25TdGFydENvbHVtbiA9IGJ1ZmZlci5yZWFkVUludDMyQkUoYiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0XHRjb25zdCBwb3NpdGlvbkxpbmVOdW1iZXIgPSBidWZmZXIucmVhZFVJbnQzMkJFKGIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdFx0Y29uc3QgcG9zaXRpb25Db2x1bW4gPSBidWZmZXIucmVhZFVJbnQzMkJFKGIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdFx0ZGVzdC5wdXNoKG5ldyBTZWxlY3Rpb24oc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyLCBzZWxlY3Rpb25TdGFydENvbHVtbiwgcG9zaXRpb25MaW5lTnVtYmVyLCBwb3NpdGlvbkNvbHVtbikpO1xuXHRcdH1cblx0XHRyZXR1cm4gb2Zmc2V0O1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBBcnJheUJ1ZmZlciB7XG5cdFx0bGV0IG5lY2Vzc2FyeVNpemUgPSAoXG5cdFx0XHQrIDQgLy8gYmVmb3JlVmVyc2lvbklkXG5cdFx0XHQrIDQgLy8gYWZ0ZXJWZXJzaW9uSWRcblx0XHRcdCsgMSAvLyBiZWZvcmVFT0xcblx0XHRcdCsgMSAvLyBhZnRlckVPTFxuXHRcdFx0KyBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEuX3dyaXRlU2VsZWN0aW9uc1NpemUodGhpcy5iZWZvcmVDdXJzb3JTdGF0ZSlcblx0XHRcdCsgU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhLl93cml0ZVNlbGVjdGlvbnNTaXplKHRoaXMuYWZ0ZXJDdXJzb3JTdGF0ZSlcblx0XHRcdCsgNCAvLyBjaGFuZ2UgY291bnRcblx0XHQpO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIHRoaXMuY2hhbmdlcykge1xuXHRcdFx0bmVjZXNzYXJ5U2l6ZSArPSBjaGFuZ2Uud3JpdGVTaXplKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYiA9IG5ldyBVaW50OEFycmF5KG5lY2Vzc2FyeVNpemUpO1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGJ1ZmZlci53cml0ZVVJbnQzMkJFKGIsIHRoaXMuYmVmb3JlVmVyc2lvbklkLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRidWZmZXIud3JpdGVVSW50MzJCRShiLCB0aGlzLmFmdGVyVmVyc2lvbklkLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRidWZmZXIud3JpdGVVSW50OChiLCB0aGlzLmJlZm9yZUVPTCwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDE7XG5cdFx0YnVmZmVyLndyaXRlVUludDgoYiwgdGhpcy5hZnRlckVPTCwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDE7XG5cdFx0b2Zmc2V0ID0gU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhLl93cml0ZVNlbGVjdGlvbnMoYiwgdGhpcy5iZWZvcmVDdXJzb3JTdGF0ZSwgb2Zmc2V0KTtcblx0XHRvZmZzZXQgPSBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEuX3dyaXRlU2VsZWN0aW9ucyhiLCB0aGlzLmFmdGVyQ3Vyc29yU3RhdGUsIG9mZnNldCk7XG5cdFx0YnVmZmVyLndyaXRlVUludDMyQkUoYiwgdGhpcy5jaGFuZ2VzLmxlbmd0aCwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgdGhpcy5jaGFuZ2VzKSB7XG5cdFx0XHRvZmZzZXQgPSBjaGFuZ2Uud3JpdGUoYiwgb2Zmc2V0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGIuYnVmZmVyO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZXNlcmlhbGl6ZShzb3VyY2U6IEFycmF5QnVmZmVyKTogU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhIHtcblx0XHRjb25zdCBiID0gbmV3IFVpbnQ4QXJyYXkoc291cmNlKTtcblx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRjb25zdCBiZWZvcmVWZXJzaW9uSWQgPSBidWZmZXIucmVhZFVJbnQzMkJFKGIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdGNvbnN0IGFmdGVyVmVyc2lvbklkID0gYnVmZmVyLnJlYWRVSW50MzJCRShiLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRjb25zdCBiZWZvcmVFT0wgPSBidWZmZXIucmVhZFVJbnQ4KGIsIG9mZnNldCk7IG9mZnNldCArPSAxO1xuXHRcdGNvbnN0IGFmdGVyRU9MID0gYnVmZmVyLnJlYWRVSW50OChiLCBvZmZzZXQpOyBvZmZzZXQgKz0gMTtcblx0XHRjb25zdCBiZWZvcmVDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gPSBbXTtcblx0XHRvZmZzZXQgPSBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEuX3JlYWRTZWxlY3Rpb25zKGIsIG9mZnNldCwgYmVmb3JlQ3Vyc29yU3RhdGUpO1xuXHRcdGNvbnN0IGFmdGVyQ3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdID0gW107XG5cdFx0b2Zmc2V0ID0gU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhLl9yZWFkU2VsZWN0aW9ucyhiLCBvZmZzZXQsIGFmdGVyQ3Vyc29yU3RhdGUpO1xuXHRcdGNvbnN0IGNoYW5nZUNvdW50ID0gYnVmZmVyLnJlYWRVSW50MzJCRShiLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRjb25zdCBjaGFuZ2VzOiBUZXh0Q2hhbmdlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNoYW5nZUNvdW50OyBpKyspIHtcblx0XHRcdG9mZnNldCA9IFRleHRDaGFuZ2UucmVhZChiLCBvZmZzZXQsIGNoYW5nZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YShcblx0XHRcdGJlZm9yZVZlcnNpb25JZCxcblx0XHRcdGFmdGVyVmVyc2lvbklkLFxuXHRcdFx0YmVmb3JlRU9MLFxuXHRcdFx0YWZ0ZXJFT0wsXG5cdFx0XHRiZWZvcmVDdXJzb3JTdGF0ZSxcblx0XHRcdGFmdGVyQ3Vyc29yU3RhdGUsXG5cdFx0XHRjaGFuZ2VzXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElVbmRvUmVkb0RlbGVnYXRlIHtcblx0cHJlcGFyZVVuZG9SZWRvKGVsZW1lbnQ6IE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50KTogUHJvbWlzZTxJRGlzcG9zYWJsZT4gfCBJRGlzcG9zYWJsZSB8IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBTaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnQgaW1wbGVtZW50cyBJUmVzb3VyY2VVbmRvUmVkb0VsZW1lbnQge1xuXG5cdHB1YmxpYyBtb2RlbDogSVRleHRNb2RlbCB8IFVSSTtcblx0cHJpdmF0ZSBfZGF0YTogU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhIHwgQXJyYXlCdWZmZXI7XG5cblx0cHVibGljIGdldCB0eXBlKCk6IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2Uge1xuXHRcdHJldHVybiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlO1xuXHR9XG5cblx0cHVibGljIGdldCByZXNvdXJjZSgpOiBVUkkge1xuXHRcdGlmIChVUkkuaXNVcmkodGhpcy5tb2RlbCkpIHtcblx0XHRcdHJldHVybiB0aGlzLm1vZGVsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tb2RlbC51cmk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29kZTogc3RyaW5nLFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdGJlZm9yZUN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSB8IG51bGxcblx0KSB7XG5cdFx0dGhpcy5tb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX2RhdGEgPSBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEuY3JlYXRlKG1vZGVsLCBiZWZvcmVDdXJzb3JTdGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRjb25zdCBkYXRhID0gKHRoaXMuX2RhdGEgaW5zdGFuY2VvZiBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEgPyB0aGlzLl9kYXRhIDogU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhLmRlc2VyaWFsaXplKHRoaXMuX2RhdGEpKTtcblx0XHRyZXR1cm4gZGF0YS5jaGFuZ2VzLm1hcChjaGFuZ2UgPT4gY2hhbmdlLnRvU3RyaW5nKCkpLmpvaW4oJywgJyk7XG5cdH1cblxuXHRwdWJsaWMgbWF0Y2hlc1Jlc291cmNlKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCB1cmkgPSAoVVJJLmlzVXJpKHRoaXMubW9kZWwpID8gdGhpcy5tb2RlbCA6IHRoaXMubW9kZWwudXJpKTtcblx0XHRyZXR1cm4gKHVyaS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRNb2RlbChtb2RlbDogSVRleHRNb2RlbCB8IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwgPSBtb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBjYW5BcHBlbmQobW9kZWw6IElUZXh0TW9kZWwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMubW9kZWwgPT09IG1vZGVsICYmIHRoaXMuX2RhdGEgaW5zdGFuY2VvZiBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEpO1xuXHR9XG5cblx0cHVibGljIGFwcGVuZChtb2RlbDogSVRleHRNb2RlbCwgdGV4dENoYW5nZXM6IFRleHRDaGFuZ2VbXSwgYWZ0ZXJFT0w6IEVuZE9mTGluZVNlcXVlbmNlLCBhZnRlclZlcnNpb25JZDogbnVtYmVyLCBhZnRlckN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGF0YSBpbnN0YW5jZW9mIFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YSkge1xuXHRcdFx0dGhpcy5fZGF0YS5hcHBlbmQobW9kZWwsIHRleHRDaGFuZ2VzLCBhZnRlckVPTCwgYWZ0ZXJWZXJzaW9uSWQsIGFmdGVyQ3Vyc29yU3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjbG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGF0YSBpbnN0YW5jZW9mIFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YSkge1xuXHRcdFx0dGhpcy5fZGF0YSA9IHRoaXMuX2RhdGEuc2VyaWFsaXplKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG9wZW4oKTogdm9pZCB7XG5cdFx0aWYgKCEodGhpcy5fZGF0YSBpbnN0YW5jZW9mIFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YSkpIHtcblx0XHRcdHRoaXMuX2RhdGEgPSBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEuZGVzZXJpYWxpemUodGhpcy5fZGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHVuZG8oKTogdm9pZCB7XG5cdFx0aWYgKFVSSS5pc1VyaSh0aGlzLm1vZGVsKSkge1xuXHRcdFx0Ly8gZG9uJ3QgaGF2ZSBhIG1vZGVsXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50YCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kYXRhIGluc3RhbmNlb2YgU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhKSB7XG5cdFx0XHR0aGlzLl9kYXRhID0gdGhpcy5fZGF0YS5zZXJpYWxpemUoKTtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YS5kZXNlcmlhbGl6ZSh0aGlzLl9kYXRhKTtcblx0XHR0aGlzLm1vZGVsLl9hcHBseVVuZG8oZGF0YS5jaGFuZ2VzLCBkYXRhLmJlZm9yZUVPTCwgZGF0YS5iZWZvcmVWZXJzaW9uSWQsIGRhdGEuYmVmb3JlQ3Vyc29yU3RhdGUpO1xuXHR9XG5cblx0cHVibGljIHJlZG8oKTogdm9pZCB7XG5cdFx0aWYgKFVSSS5pc1VyaSh0aGlzLm1vZGVsKSkge1xuXHRcdFx0Ly8gZG9uJ3QgaGF2ZSBhIG1vZGVsXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50YCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kYXRhIGluc3RhbmNlb2YgU2luZ2xlTW9kZWxFZGl0U3RhY2tEYXRhKSB7XG5cdFx0XHR0aGlzLl9kYXRhID0gdGhpcy5fZGF0YS5zZXJpYWxpemUoKTtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IFNpbmdsZU1vZGVsRWRpdFN0YWNrRGF0YS5kZXNlcmlhbGl6ZSh0aGlzLl9kYXRhKTtcblx0XHR0aGlzLm1vZGVsLl9hcHBseVJlZG8oZGF0YS5jaGFuZ2VzLCBkYXRhLmFmdGVyRU9MLCBkYXRhLmFmdGVyVmVyc2lvbklkLCBkYXRhLmFmdGVyQ3Vyc29yU3RhdGUpO1xuXHR9XG5cblx0cHVibGljIGhlYXBTaXplKCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2RhdGEgaW5zdGFuY2VvZiBTaW5nbGVNb2RlbEVkaXRTdGFja0RhdGEpIHtcblx0XHRcdHRoaXMuX2RhdGEgPSB0aGlzLl9kYXRhLnNlcmlhbGl6ZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGF0YS5ieXRlTGVuZ3RoICsgMTY4LypoZWFwIG92ZXJoZWFkKi87XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50IGltcGxlbWVudHMgSVdvcmtzcGFjZVVuZG9SZWRvRWxlbWVudCB7XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZTtcblx0cHJpdmF0ZSBfaXNPcGVuOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRTdGFja0VsZW1lbnRzQXJyOiBTaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnRbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdFN0YWNrRWxlbWVudHNNYXA6IE1hcDxzdHJpbmcsIFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudD47XG5cblx0cHJpdmF0ZSBfZGVsZWdhdGU6IElVbmRvUmVkb0RlbGVnYXRlIHwgbnVsbDtcblxuXHRwdWJsaWMgZ2V0IHJlc291cmNlcygpOiByZWFkb25seSBVUklbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzQXJyLm1hcChlZGl0U3RhY2tFbGVtZW50ID0+IGVkaXRTdGFja0VsZW1lbnQucmVzb3VyY2UpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvZGU6IHN0cmluZyxcblx0XHRlZGl0U3RhY2tFbGVtZW50czogU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50W11cblx0KSB7XG5cdFx0dGhpcy5faXNPcGVuID0gdHJ1ZTtcblx0XHR0aGlzLl9lZGl0U3RhY2tFbGVtZW50c0FyciA9IGVkaXRTdGFja0VsZW1lbnRzLnNsaWNlKDApO1xuXHRcdHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzTWFwID0gbmV3IE1hcDxzdHJpbmcsIFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudD4oKTtcblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFja0VsZW1lbnQgb2YgdGhpcy5fZWRpdFN0YWNrRWxlbWVudHNBcnIpIHtcblx0XHRcdGNvbnN0IGtleSA9IHVyaUdldENvbXBhcmlzb25LZXkoZWRpdFN0YWNrRWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9lZGl0U3RhY2tFbGVtZW50c01hcC5zZXQoa2V5LCBlZGl0U3RhY2tFbGVtZW50KTtcblx0XHR9XG5cdFx0dGhpcy5fZGVsZWdhdGUgPSBudWxsO1xuXHR9XG5cblx0cHVibGljIHNldERlbGVnYXRlKGRlbGVnYXRlOiBJVW5kb1JlZG9EZWxlZ2F0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX2RlbGVnYXRlID0gZGVsZWdhdGU7XG5cdH1cblxuXHRwdWJsaWMgcHJlcGFyZVVuZG9SZWRvKCk6IFByb21pc2U8SURpc3Bvc2FibGU+IHwgSURpc3Bvc2FibGUgfCB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGVsZWdhdGUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kZWxlZ2F0ZS5wcmVwYXJlVW5kb1JlZG8odGhpcyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldE1pc3NpbmdNb2RlbHMoKTogVVJJW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogVVJJW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFja0VsZW1lbnQgb2YgdGhpcy5fZWRpdFN0YWNrRWxlbWVudHNBcnIpIHtcblx0XHRcdGlmIChVUkkuaXNVcmkoZWRpdFN0YWNrRWxlbWVudC5tb2RlbCkpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goZWRpdFN0YWNrRWxlbWVudC5tb2RlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgbWF0Y2hlc1Jlc291cmNlKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCBrZXkgPSB1cmlHZXRDb21wYXJpc29uS2V5KHJlc291cmNlKTtcblx0XHRyZXR1cm4gKHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzTWFwLmhhcyhrZXkpKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRNb2RlbChtb2RlbDogSVRleHRNb2RlbCB8IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHVyaUdldENvbXBhcmlzb25LZXkoVVJJLmlzVXJpKG1vZGVsKSA/IG1vZGVsIDogbW9kZWwudXJpKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrRWxlbWVudHNNYXAuaGFzKGtleSkpIHtcblx0XHRcdHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzTWFwLmdldChrZXkpIS5zZXRNb2RlbChtb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNhbkFwcGVuZChtb2RlbDogSVRleHRNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5faXNPcGVuKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IHVyaUdldENvbXBhcmlzb25LZXkobW9kZWwudXJpKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrRWxlbWVudHNNYXAuaGFzKGtleSkpIHtcblx0XHRcdGNvbnN0IGVkaXRTdGFja0VsZW1lbnQgPSB0aGlzLl9lZGl0U3RhY2tFbGVtZW50c01hcC5nZXQoa2V5KSE7XG5cdFx0XHRyZXR1cm4gZWRpdFN0YWNrRWxlbWVudC5jYW5BcHBlbmQobW9kZWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgYXBwZW5kKG1vZGVsOiBJVGV4dE1vZGVsLCB0ZXh0Q2hhbmdlczogVGV4dENoYW5nZVtdLCBhZnRlckVPTDogRW5kT2ZMaW5lU2VxdWVuY2UsIGFmdGVyVmVyc2lvbklkOiBudW1iZXIsIGFmdGVyQ3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHVyaUdldENvbXBhcmlzb25LZXkobW9kZWwudXJpKTtcblx0XHRjb25zdCBlZGl0U3RhY2tFbGVtZW50ID0gdGhpcy5fZWRpdFN0YWNrRWxlbWVudHNNYXAuZ2V0KGtleSkhO1xuXHRcdGVkaXRTdGFja0VsZW1lbnQuYXBwZW5kKG1vZGVsLCB0ZXh0Q2hhbmdlcywgYWZ0ZXJFT0wsIGFmdGVyVmVyc2lvbklkLCBhZnRlckN1cnNvclN0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyBjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc09wZW4gPSBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBvcGVuKCk6IHZvaWQge1xuXHRcdC8vIGNhbm5vdCByZW9wZW5cblx0fVxuXG5cdHB1YmxpYyB1bmRvKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzT3BlbiA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBlZGl0U3RhY2tFbGVtZW50IG9mIHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzQXJyKSB7XG5cdFx0XHRlZGl0U3RhY2tFbGVtZW50LnVuZG8oKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVkbygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVkaXRTdGFja0VsZW1lbnQgb2YgdGhpcy5fZWRpdFN0YWNrRWxlbWVudHNBcnIpIHtcblx0XHRcdGVkaXRTdGFja0VsZW1lbnQucmVkbygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoZWFwU2l6ZShyZXNvdXJjZTogVVJJKTogbnVtYmVyIHtcblx0XHRjb25zdCBrZXkgPSB1cmlHZXRDb21wYXJpc29uS2V5KHJlc291cmNlKTtcblx0XHRpZiAodGhpcy5fZWRpdFN0YWNrRWxlbWVudHNNYXAuaGFzKGtleSkpIHtcblx0XHRcdGNvbnN0IGVkaXRTdGFja0VsZW1lbnQgPSB0aGlzLl9lZGl0U3RhY2tFbGVtZW50c01hcC5nZXQoa2V5KSE7XG5cdFx0XHRyZXR1cm4gZWRpdFN0YWNrRWxlbWVudC5oZWFwU2l6ZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHB1YmxpYyBzcGxpdCgpOiBJUmVzb3VyY2VVbmRvUmVkb0VsZW1lbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRTdGFja0VsZW1lbnRzQXJyO1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdFN0YWNrRWxlbWVudCBvZiB0aGlzLl9lZGl0U3RhY2tFbGVtZW50c0Fycikge1xuXHRcdFx0cmVzdWx0LnB1c2goYCR7YmFzZW5hbWUoZWRpdFN0YWNrRWxlbWVudC5yZXNvdXJjZSl9OiAke2VkaXRTdGFja0VsZW1lbnR9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBgeyR7cmVzdWx0LmpvaW4oJywgJyl9fWA7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgRWRpdFN0YWNrRWxlbWVudCA9IFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudCB8IE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50O1xuXG5mdW5jdGlvbiBnZXRNb2RlbEVPTChtb2RlbDogSVRleHRNb2RlbCk6IEVuZE9mTGluZVNlcXVlbmNlIHtcblx0Y29uc3QgZW9sID0gbW9kZWwuZ2V0RU9MKCk7XG5cdGlmIChlb2wgPT09ICdcXG4nKSB7XG5cdFx0cmV0dXJuIEVuZE9mTGluZVNlcXVlbmNlLkxGO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0VkaXRTdGFja0VsZW1lbnQoZWxlbWVudDogSVJlc291cmNlVW5kb1JlZG9FbGVtZW50IHwgSVdvcmtzcGFjZVVuZG9SZWRvRWxlbWVudCB8IG51bGwpOiBlbGVtZW50IGlzIEVkaXRTdGFja0VsZW1lbnQge1xuXHRpZiAoIWVsZW1lbnQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuICgoZWxlbWVudCBpbnN0YW5jZW9mIFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudCkgfHwgKGVsZW1lbnQgaW5zdGFuY2VvZiBNdWx0aU1vZGVsRWRpdFN0YWNrRWxlbWVudCkpO1xufVxuXG5leHBvcnQgY2xhc3MgRWRpdFN0YWNrIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogVGV4dE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IFRleHRNb2RlbCwgdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlKSB7XG5cdFx0dGhpcy5fbW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UgPSB1bmRvUmVkb1NlcnZpY2U7XG5cdH1cblxuXHRwdWJsaWMgcHVzaFN0YWNrRWxlbWVudCgpOiB2b2lkIHtcblx0XHRjb25zdCBsYXN0RWxlbWVudCA9IHRoaXMuX3VuZG9SZWRvU2VydmljZS5nZXRMYXN0RWxlbWVudCh0aGlzLl9tb2RlbC51cmkpO1xuXHRcdGlmIChpc0VkaXRTdGFja0VsZW1lbnQobGFzdEVsZW1lbnQpKSB7XG5cdFx0XHRsYXN0RWxlbWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBwb3BTdGFja0VsZW1lbnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSB0aGlzLl91bmRvUmVkb1NlcnZpY2UuZ2V0TGFzdEVsZW1lbnQodGhpcy5fbW9kZWwudXJpKTtcblx0XHRpZiAoaXNFZGl0U3RhY2tFbGVtZW50KGxhc3RFbGVtZW50KSkge1xuXHRcdFx0bGFzdEVsZW1lbnQub3BlbigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UucmVtb3ZlRWxlbWVudHModGhpcy5fbW9kZWwudXJpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlRWRpdFN0YWNrRWxlbWVudChiZWZvcmVDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gfCBudWxsLCBncm91cDogVW5kb1JlZG9Hcm91cCB8IHVuZGVmaW5lZCk6IEVkaXRTdGFja0VsZW1lbnQge1xuXHRcdGNvbnN0IGxhc3RFbGVtZW50ID0gdGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmdldExhc3RFbGVtZW50KHRoaXMuX21vZGVsLnVyaSk7XG5cdFx0aWYgKGlzRWRpdFN0YWNrRWxlbWVudChsYXN0RWxlbWVudCkgJiYgbGFzdEVsZW1lbnQuY2FuQXBwZW5kKHRoaXMuX21vZGVsKSkge1xuXHRcdFx0cmV0dXJuIGxhc3RFbGVtZW50O1xuXHRcdH1cblx0XHRjb25zdCBuZXdFbGVtZW50ID0gbmV3IFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudChubHMubG9jYWxpemUoJ2VkaXQnLCBcIlR5cGluZ1wiKSwgJ3VuZG9yZWRvLnRleHRCdWZmZXJFZGl0JywgdGhpcy5fbW9kZWwsIGJlZm9yZUN1cnNvclN0YXRlKTtcblx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UucHVzaEVsZW1lbnQobmV3RWxlbWVudCwgZ3JvdXApO1xuXHRcdHJldHVybiBuZXdFbGVtZW50O1xuXHR9XG5cblx0cHVibGljIHB1c2hFT0woZW9sOiBFbmRPZkxpbmVTZXF1ZW5jZSk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRTdGFja0VsZW1lbnQgPSB0aGlzLl9nZXRPckNyZWF0ZUVkaXRTdGFja0VsZW1lbnQobnVsbCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9tb2RlbC5zZXRFT0woZW9sKTtcblx0XHRlZGl0U3RhY2tFbGVtZW50LmFwcGVuZCh0aGlzLl9tb2RlbCwgW10sIGdldE1vZGVsRU9MKHRoaXMuX21vZGVsKSwgdGhpcy5fbW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKSwgbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgcHVzaEVkaXRPcGVyYXRpb24oYmVmb3JlQ3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdIHwgbnVsbCwgZWRpdE9wZXJhdGlvbnM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10sIGN1cnNvclN0YXRlQ29tcHV0ZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyIHwgbnVsbCwgZ3JvdXA/OiBVbmRvUmVkb0dyb3VwLCByZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2UgPSBFZGl0U291cmNlcy51bmtub3duKHsgbmFtZTogJ3B1c2hFZGl0T3BlcmF0aW9uJyB9KSk6IFNlbGVjdGlvbltdIHwgbnVsbCB7XG5cdFx0Y29uc3QgZWRpdFN0YWNrRWxlbWVudCA9IHRoaXMuX2dldE9yQ3JlYXRlRWRpdFN0YWNrRWxlbWVudChiZWZvcmVDdXJzb3JTdGF0ZSwgZ3JvdXApO1xuXHRcdGNvbnN0IGludmVyc2VFZGl0T3BlcmF0aW9ucyA9IHRoaXMuX21vZGVsLmFwcGx5RWRpdHMoZWRpdE9wZXJhdGlvbnMsIHRydWUsIHJlYXNvbik7XG5cdFx0Y29uc3QgYWZ0ZXJDdXJzb3JTdGF0ZSA9IEVkaXRTdGFjay5fY29tcHV0ZUN1cnNvclN0YXRlKGN1cnNvclN0YXRlQ29tcHV0ZXIsIGludmVyc2VFZGl0T3BlcmF0aW9ucyk7XG5cdFx0Y29uc3QgdGV4dENoYW5nZXMgPSBpbnZlcnNlRWRpdE9wZXJhdGlvbnMubWFwKChvcCwgaW5kZXgpID0+ICh7IGluZGV4OiBpbmRleCwgdGV4dENoYW5nZTogb3AudGV4dENoYW5nZSB9KSk7XG5cdFx0dGV4dENoYW5nZXMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGEudGV4dENoYW5nZS5vbGRQb3NpdGlvbiA9PT0gYi50ZXh0Q2hhbmdlLm9sZFBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBhLmluZGV4IC0gYi5pbmRleDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhLnRleHRDaGFuZ2Uub2xkUG9zaXRpb24gLSBiLnRleHRDaGFuZ2Uub2xkUG9zaXRpb247XG5cdFx0fSk7XG5cdFx0ZWRpdFN0YWNrRWxlbWVudC5hcHBlbmQodGhpcy5fbW9kZWwsIHRleHRDaGFuZ2VzLm1hcChvcCA9PiBvcC50ZXh0Q2hhbmdlKSwgZ2V0TW9kZWxFT0wodGhpcy5fbW9kZWwpLCB0aGlzLl9tb2RlbC5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpLCBhZnRlckN1cnNvclN0YXRlKTtcblx0XHRyZXR1cm4gYWZ0ZXJDdXJzb3JTdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jb21wdXRlQ3Vyc29yU3RhdGUoY3Vyc29yU3RhdGVDb21wdXRlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXIgfCBudWxsLCBpbnZlcnNlRWRpdE9wZXJhdGlvbnM6IElWYWxpZEVkaXRPcGVyYXRpb25bXSk6IFNlbGVjdGlvbltdIHwgbnVsbCB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBjdXJzb3JTdGF0ZUNvbXB1dGVyID8gY3Vyc29yU3RhdGVDb21wdXRlcihpbnZlcnNlRWRpdE9wZXJhdGlvbnMpIDogbnVsbDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMseUJBQWdGO0FBRXpGLFNBQXFELDJCQUFxRTtBQUMxSCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZLHNDQUFzQztBQUMzRCxZQUFZLFlBQVk7QUFFeEIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxtQkFBd0M7QUFFakQsU0FBUyxvQkFBb0IsVUFBdUI7QUFDbkQsU0FBTyxTQUFTLFNBQVM7QUFDMUI7QUFFTyxNQUFNLHlCQUF5QjtBQUFBLEVBZ0JyQyxZQUNpQixpQkFDVCxnQkFDUyxXQUNULFVBQ1MsbUJBQ1Qsa0JBQ0EsU0FDTjtBQVBlO0FBQ1Q7QUFDUztBQUNUO0FBQ1M7QUFDVDtBQUNBO0FBQUEsRUFDSjtBQUFBLEVBdEJKLE9BQWMsT0FBTyxPQUFtQixtQkFBaUU7QUFDeEcsVUFBTSx1QkFBdUIsTUFBTSx3QkFBd0I7QUFDM0QsVUFBTSxNQUFNLFlBQVksS0FBSztBQUM3QixXQUFPLElBQUk7QUFBQSxNQUNWO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBWU8sT0FBTyxPQUFtQixhQUEyQixVQUE2QixnQkFBd0Isa0JBQTRDO0FBQzVKLFFBQUksWUFBWSxTQUFTLEdBQUc7QUFDM0IsV0FBSyxVQUFVLCtCQUErQixLQUFLLFNBQVMsV0FBVztBQUFBLElBQ3hFO0FBQ0EsU0FBSyxXQUFXO0FBQ2hCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssbUJBQW1CO0FBQUEsRUFDekI7QUFBQSxFQUVBLE9BQWUscUJBQXFCLFlBQXdDO0FBQzNFLFdBQU8s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
