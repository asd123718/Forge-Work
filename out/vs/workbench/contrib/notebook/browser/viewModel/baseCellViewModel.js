import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, MutableDisposable, dispose } from "../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
import * as editorCommon from "../../../../../editor/common/editorCommon.js";
import { SearchParams } from "../../../../../editor/common/model/textModelSearch.js";
import { readTransientState, writeTransientState } from "../../../codeEditor/browser/toggleWordWrap.js";
import { CellEditState, CellFocusMode, CursorAtBoundary, CursorAtLineBoundary } from "../notebookBrowser.js";
class BaseCellViewModel extends Disposable {
  constructor(viewType, model2, id, _viewContext, _configurationService, _modelService, _undoRedoService, _codeEditorService, _inlineChatSessionService) {
    super();
    this.viewType = viewType;
    this.model = model2;
    this.id = id;
    this._viewContext = _viewContext;
    this._configurationService = _configurationService;
    this._modelService = _modelService;
    this._undoRedoService = _undoRedoService;
    this._codeEditorService = _codeEditorService;
    this._inlineChatSessionService = _inlineChatSessionService;
    this._onDidChangeEditorAttachState = this._register(new Emitter());
    // Do not merge this event with `onDidChangeState` as we are using `Event.once(onDidChangeEditorAttachState)` elsewhere.
    this.onDidChangeEditorAttachState = this._onDidChangeEditorAttachState.event;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this._editState = CellEditState.Preview;
    this._lineNumbers = "inherit";
    this._focusMode = CellFocusMode.Container;
    this._editorListeners = [];
    this._editorViewStates = null;
    this._editorTransientState = null;
    this._resolvedCellDecorations = /* @__PURE__ */ new Map();
    this._textModelRefChangeDisposable = this._register(new MutableDisposable());
    this._cellDecorationsChanged = this._register(new Emitter());
    this.onCellDecorationsChanged = this._cellDecorationsChanged.event;
    this._resolvedDecorations = /* @__PURE__ */ new Map();
    this._lastDecorationId = 0;
    this._cellStatusBarItems = /* @__PURE__ */ new Map();
    this._onDidChangeCellStatusBarItems = this._register(new Emitter());
    this.onDidChangeCellStatusBarItems = this._onDidChangeCellStatusBarItems.event;
    this._lastStatusBarId = 0;
    this._dragging = false;
    this._inputCollapsed = false;
    this._outputCollapsed = false;
    this._commentHeight = 0;
    this._isDisposed = false;
    this._isReadonly = false;
    this._editStateSource = "";
    this._register(model2.onDidChangeMetadata(() => {
      this._onDidChangeState.fire({ metadataChanged: true });
    }));
    this._register(model2.onDidChangeInternalMetadata((e) => {
      this._onDidChangeState.fire({ internalMetadataChanged: true });
      if (e.lastRunSuccessChanged) {
        this.layoutChange({});
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("notebook.lineNumbers")) {
        this.lineNumbers = "inherit";
      }
    }));
    if (this.model.collapseState?.inputCollapsed) {
      this._inputCollapsed = true;
    }
    if (this.model.collapseState?.outputCollapsed) {
      this._outputCollapsed = true;
    }
    this._commentOptions = this._configurationService.getValue("editor.comments", { overrideIdentifier: this.language });
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.comments")) {
        this._commentOptions = this._configurationService.getValue("editor.comments", { overrideIdentifier: this.language });
      }
    }));
  }
  get handle() {
    return this.model.handle;
  }
  get uri() {
    return this.model.uri;
  }
  get lineCount() {
    return this.model.textBuffer.getLineCount();
  }
  get metadata() {
    return this.model.metadata;
  }
  get internalMetadata() {
    return this.model.internalMetadata;
  }
  get language() {
    return this.model.language;
  }
  get mime() {
    if (typeof this.model.mime === "string") {
      return this.model.mime;
    }
    switch (this.language) {
      case "markdown":
        return Mimes.markdown;
      default:
        return Mimes.text;
    }
  }
  get lineNumbers() {
    return this._lineNumbers;
  }
  set lineNumbers(lineNumbers) {
    if (lineNumbers === this._lineNumbers) {
      return;
    }
    this._lineNumbers = lineNumbers;
    this._onDidChangeState.fire({ cellLineNumberChanged: true });
  }
  get commentOptions() {
    return this._commentOptions;
  }
  set commentOptions(newOptions) {
    this._commentOptions = newOptions;
  }
  get focusMode() {
    return this._focusMode;
  }
  set focusMode(newMode) {
    if (this._focusMode !== newMode) {
      this._focusMode = newMode;
      this._onDidChangeState.fire({ focusModeChanged: true });
    }
  }
  get editorAttached() {
    return !!this._textEditor;
  }
  get textModel() {
    return this.model.textModel;
  }
  hasModel() {
    return !!this.textModel;
  }
  get dragging() {
    return this._dragging;
  }
  set dragging(v) {
    this._dragging = v;
    this._onDidChangeState.fire({ dragStateChanged: true });
  }
  get isInputCollapsed() {
    return this._inputCollapsed;
  }
  set isInputCollapsed(v) {
    this._inputCollapsed = v;
    this._onDidChangeState.fire({ inputCollapsedChanged: true });
  }
  get isOutputCollapsed() {
    return this._outputCollapsed;
  }
  set isOutputCollapsed(v) {
    this._outputCollapsed = v;
    this._onDidChangeState.fire({ outputCollapsedChanged: true });
  }
  set commentHeight(height) {
    if (this._commentHeight === height) {
      return;
    }
    this._commentHeight = height;
    this.layoutChange({ commentHeight: true }, "BaseCellViewModel#commentHeight");
  }
  updateOptions(e) {
    if (this._textEditor && typeof e.readonly === "boolean") {
      this._textEditor.updateOptions({ readOnly: e.readonly });
    }
    if (typeof e.readonly === "boolean") {
      this._isReadonly = e.readonly;
    }
  }
  assertTextModelAttached() {
    if (this.textModel && this._textEditor && this._textEditor.getModel() === this.textModel) {
      return true;
    }
    return false;
  }
  // private handleKeyDown(e: IKeyboardEvent) {
  // 	if (this.viewType === IPYNB_VIEW_TYPE && isWindows && e.ctrlKey && e.keyCode === KeyCode.Enter) {
  // 		this._keymapService.promptKeymapRecommendation();
  // 	}
  // }
  attachTextEditor(editor, estimatedHasHorizontalScrolling) {
    if (!editor.hasModel()) {
      throw new Error("Invalid editor: model is missing");
    }
    if (this._textEditor === editor) {
      if (this._editorListeners.length === 0) {
        this._editorListeners.push(this._textEditor.onDidChangeCursorSelection(() => {
          this._onDidChangeState.fire({ selectionChanged: true });
        }));
        this._onDidChangeState.fire({ selectionChanged: true });
      }
      return;
    }
    this._textEditor = editor;
    if (this._isReadonly) {
      editor.updateOptions({ readOnly: this._isReadonly });
    }
    if (this._editorViewStates) {
      this._restoreViewState(this._editorViewStates);
    } else {
      if (estimatedHasHorizontalScrolling) {
        this._restoreViewState({
          contributionsState: {},
          cursorState: [],
          viewState: {
            scrollLeft: 0,
            firstPosition: { lineNumber: 1, column: 1 },
            firstPositionDeltaTop: this._viewContext.notebookOptions.getLayoutConfiguration().editorTopPadding
          }
        });
      }
    }
    if (this._editorTransientState) {
      writeTransientState(editor.getModel(), this._editorTransientState, this._codeEditorService);
    }
    if (this._isDisposed) {
      return;
    }
    editor.changeDecorations((accessor) => {
      this._resolvedDecorations.forEach((value, key) => {
        if (key.startsWith("_lazy_")) {
          const ret = accessor.addDecoration(value.options.range, value.options.options);
          this._resolvedDecorations.get(key).id = ret;
        } else {
          const ret = accessor.addDecoration(value.options.range, value.options.options);
          this._resolvedDecorations.get(key).id = ret;
        }
      });
    });
    this._editorListeners.push(editor.onDidChangeCursorSelection(() => {
      this._onDidChangeState.fire({ selectionChanged: true });
    }));
    this._editorListeners.push(this._inlineChatSessionService.onWillStartSession((e) => {
      if (e === this._textEditor && this.textBuffer.getLength() === 0) {
        this.enableAutoLanguageDetection();
      }
    }));
    this._onDidChangeState.fire({ selectionChanged: true });
    this._onDidChangeEditorAttachState.fire();
  }
  detachTextEditor() {
    this.saveViewState();
    this.saveTransientState();
    this._textEditor?.changeDecorations((accessor) => {
      this._resolvedDecorations.forEach((value) => {
        const resolvedid = value.id;
        if (resolvedid) {
          accessor.removeDecoration(resolvedid);
        }
      });
    });
    this._textEditor = void 0;
    dispose(this._editorListeners);
    this._editorListeners = [];
    this._onDidChangeEditorAttachState.fire();
    if (this._textModelRef) {
      this._textModelRef.dispose();
      this._textModelRef = void 0;
    }
    this._textModelRefChangeDisposable.clear();
  }
  getText() {
    return this.model.getValue();
  }
  getAlternativeId() {
    return this.model.alternativeId;
  }
  getTextLength() {
    return this.model.getTextLength();
  }
  enableAutoLanguageDetection() {
    this.model.enableAutoLanguageDetection();
  }
  saveViewState() {
    if (!this._textEditor) {
      return;
    }
    this._editorViewStates = this._textEditor.saveViewState();
  }
  saveTransientState() {
    if (!this._textEditor || !this._textEditor.hasModel()) {
      return;
    }
    this._editorTransientState = readTransientState(this._textEditor.getModel(), this._codeEditorService);
  }
  saveEditorViewState() {
    if (this._textEditor) {
      this._editorViewStates = this._textEditor.saveViewState();
    }
    return this._editorViewStates;
  }
  restoreEditorViewState(editorViewStates, totalHeight) {
    this._editorViewStates = editorViewStates;
  }
  _restoreViewState(state) {
    if (state) {
      this._textEditor?.restoreViewState(state);
    }
  }
  addModelDecoration(decoration) {
    if (!this._textEditor) {
      const id2 = ++this._lastDecorationId;
      const decorationId = `_lazy_${this.id};${id2}`;
      this._resolvedDecorations.set(decorationId, { options: decoration });
      return decorationId;
    }
    let id;
    this._textEditor.changeDecorations((accessor) => {
      id = accessor.addDecoration(decoration.range, decoration.options);
      this._resolvedDecorations.set(id, { id, options: decoration });
    });
    return id;
  }
  removeModelDecoration(decorationId) {
    const realDecorationId = this._resolvedDecorations.get(decorationId);
    if (this._textEditor && realDecorationId && realDecorationId.id !== void 0) {
      this._textEditor.changeDecorations((accessor) => {
        accessor.removeDecoration(realDecorationId.id);
      });
    }
    this._resolvedDecorations.delete(decorationId);
  }
  deltaModelDecorations(oldDecorations, newDecorations) {
    oldDecorations.forEach((id) => {
      this.removeModelDecoration(id);
    });
    const ret = newDecorations.map((option) => {
      return this.addModelDecoration(option);
    });
    return ret;
  }
  _removeCellDecoration(decorationId) {
    const options = this._resolvedCellDecorations.get(decorationId);
    this._resolvedCellDecorations.delete(decorationId);
    if (options) {
      for (const existingOptions of this._resolvedCellDecorations.values()) {
        if (options.className === existingOptions.className) {
          options.className = void 0;
        }
        if (options.outputClassName === existingOptions.outputClassName) {
          options.outputClassName = void 0;
        }
        if (options.gutterClassName === existingOptions.gutterClassName) {
          options.gutterClassName = void 0;
        }
        if (options.topClassName === existingOptions.topClassName) {
          options.topClassName = void 0;
        }
      }
      this._cellDecorationsChanged.fire({ added: [], removed: [options] });
    }
  }
  _addCellDecoration(options) {
    const id = ++this._lastDecorationId;
    const decorationId = `_cell_${this.id};${id}`;
    this._resolvedCellDecorations.set(decorationId, options);
    this._cellDecorationsChanged.fire({ added: [options], removed: [] });
    return decorationId;
  }
  getCellDecorations() {
    return [...this._resolvedCellDecorations.values()];
  }
  getCellDecorationRange(decorationId) {
    if (this._textEditor) {
      return this._textEditor.getModel()?.getDecorationRange(decorationId) ?? null;
    }
    return null;
  }
  deltaCellDecorations(oldDecorations, newDecorations) {
    oldDecorations.forEach((id) => {
      this._removeCellDecoration(id);
    });
    const ret = newDecorations.map((option) => {
      return this._addCellDecoration(option);
    });
    return ret;
  }
  deltaCellStatusBarItems(oldItems, newItems) {
    oldItems.forEach((id) => {
      const item = this._cellStatusBarItems.get(id);
      if (item) {
        this._cellStatusBarItems.delete(id);
      }
    });
    const newIds = newItems.map((item) => {
      const id = ++this._lastStatusBarId;
      const itemId = `_cell_${this.id};${id}`;
      this._cellStatusBarItems.set(itemId, item);
      return itemId;
    });
    this._onDidChangeCellStatusBarItems.fire();
    return newIds;
  }
  getCellStatusBarItems() {
    return Array.from(this._cellStatusBarItems.values());
  }
  revealRangeInCenter(range) {
    this._textEditor?.revealRangeInCenter(range, editorCommon.ScrollType.Immediate);
  }
  setSelection(range) {
    this._textEditor?.setSelection(range);
  }
  setSelections(selections) {
    if (selections.length) {
      if (this._textEditor) {
        this._textEditor?.setSelections(selections);
      } else if (this._editorViewStates) {
        this._editorViewStates.cursorState = selections.map((selection) => {
          return {
            inSelectionMode: !selection.isEmpty(),
            selectionStart: selection.getStartPosition(),
            position: selection.getEndPosition()
          };
        });
      }
    }
  }
  getSelections() {
    return this._textEditor?.getSelections() ?? this._editorViewStates?.cursorState.map((state) => new Selection(state.selectionStart.lineNumber, state.selectionStart.column, state.position.lineNumber, state.position.column)) ?? [];
  }
  getSelectionsStartPosition() {
    if (this._textEditor) {
      const selections = this._textEditor.getSelections();
      return selections?.map((s) => s.getStartPosition());
    } else {
      const selections = this._editorViewStates?.cursorState;
      return selections?.map((s) => s.selectionStart);
    }
  }
  getLineScrollTopOffset(line) {
    if (!this._textEditor) {
      return 0;
    }
    const editorPadding = this._viewContext.notebookOptions.computeEditorPadding(this.internalMetadata, this.uri);
    return this._textEditor.getTopForLineNumber(line) + editorPadding.top;
  }
  getPositionScrollTopOffset(range) {
    if (!this._textEditor) {
      return 0;
    }
    const position = range instanceof Selection ? range.getPosition() : range.getStartPosition();
    const editorPadding = this._viewContext.notebookOptions.computeEditorPadding(this.internalMetadata, this.uri);
    return this._textEditor.getTopForPosition(position.lineNumber, position.column) + editorPadding.top;
  }
  cursorAtLineBoundary() {
    if (!this._textEditor || !this.textModel || !this._textEditor.hasTextFocus()) {
      return CursorAtLineBoundary.None;
    }
    const selection = this._textEditor.getSelection();
    if (!selection || !selection.isEmpty()) {
      return CursorAtLineBoundary.None;
    }
    const currentLineLength = this.textModel.getLineLength(selection.startLineNumber);
    if (currentLineLength === 0) {
      return CursorAtLineBoundary.Both;
    }
    switch (selection.startColumn) {
      case 1:
        return CursorAtLineBoundary.Start;
      case currentLineLength + 1:
        return CursorAtLineBoundary.End;
      default:
        return CursorAtLineBoundary.None;
    }
  }
  cursorAtBoundary() {
    if (!this._textEditor) {
      return CursorAtBoundary.None;
    }
    if (!this.textModel) {
      return CursorAtBoundary.None;
    }
    const selection = this._textEditor.getSelection();
    if (!selection || !selection.isEmpty()) {
      return CursorAtBoundary.None;
    }
    const firstViewLineTop = this._textEditor.getTopForPosition(1, 1);
    const lastViewLineTop = this._textEditor.getTopForPosition(this.textModel.getLineCount(), this.textModel.getLineLength(this.textModel.getLineCount()));
    const selectionTop = this._textEditor.getTopForPosition(selection.startLineNumber, selection.startColumn);
    if (selectionTop === lastViewLineTop) {
      if (selectionTop === firstViewLineTop) {
        return CursorAtBoundary.Both;
      } else {
        return CursorAtBoundary.Bottom;
      }
    } else {
      if (selectionTop === firstViewLineTop) {
        return CursorAtBoundary.Top;
      } else {
        return CursorAtBoundary.None;
      }
    }
  }
  get editStateSource() {
    return this._editStateSource;
  }
  updateEditState(newState, source) {
    if (newState === this._editState) {
      return;
    }
    this._editStateSource = source;
    this._editState = newState;
    this._onDidChangeState.fire({ editStateChanged: true });
    if (this._editState === CellEditState.Preview) {
      this.focusMode = CellFocusMode.Container;
    }
  }
  getEditState() {
    return this._editState;
  }
  get textBuffer() {
    return this.model.textBuffer;
  }
  /**
   * Text model is used for editing.
   */
  async resolveTextModel() {
    if (!this._textModelRef || !this.textModel) {
      this._textModelRef = await this._modelService.createModelReference(this.uri);
      if (this._isDisposed) {
        return this.textModel;
      }
      if (!this._textModelRef) {
        throw new Error(`Cannot resolve text model for ${this.uri}`);
      }
      this._textModelRefChangeDisposable.value = this.textModel.onDidChangeContent(() => this.onDidChangeTextModelContent());
    }
    return this.textModel;
  }
  cellStartFind(value, options) {
    let cellMatches = [];
    const lineCount = this.textBuffer.getLineCount();
    const findRange = options.findScope?.selectedTextRanges ?? [new Range(1, 1, lineCount, this.textBuffer.getLineLength(lineCount) + 1)];
    if (this.assertTextModelAttached()) {
      cellMatches = this.textModel.findMatches(
        value,
        findRange,
        options.regex || false,
        options.caseSensitive || false,
        options.wholeWord ? options.wordSeparators || null : null,
        options.regex || false
      );
    } else {
      const searchParams = new SearchParams(value, options.regex || false, options.caseSensitive || false, options.wholeWord ? options.wordSeparators || null : null);
      const searchData = searchParams.parseSearchRequest();
      if (!searchData) {
        return null;
      }
      findRange.forEach((range) => {
        cellMatches.push(...this.textBuffer.findMatchesLineByLine(new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn), searchData, options.regex || false, 1e3));
      });
    }
    return cellMatches;
  }
  dispose() {
    this._isDisposed = true;
    super.dispose();
    dispose(this._editorListeners);
    if (this._undoRedoService.getUriComparisonKey(this.uri) === this.uri.toString()) {
      this._undoRedoService.removeElements(this.uri);
    }
    this._textModelRef?.dispose();
  }
  toJSON() {
    return {
      handle: this.handle
    };
  }
}
export {
  BaseCellViewModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3TW9kZWxcXGJhc2VDZWxsVmlld01vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29tbWVudHNPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCAqIGFzIGVkaXRvckNvbW1vbiBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgKiBhcyBtb2RlbCBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFNlYXJjaFBhcmFtcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsU2VhcmNoLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgSVdvcmRXcmFwVHJhbnNpZW50U3RhdGUsIHJlYWRUcmFuc2llbnRTdGF0ZSwgd3JpdGVUcmFuc2llbnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci90b2dnbGVXb3JkV3JhcC5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFN0YXRlLCBDZWxsRm9jdXNNb2RlLCBDZWxsTGF5b3V0Q2hhbmdlRXZlbnQsIEN1cnNvckF0Qm91bmRhcnksIEN1cnNvckF0TGluZUJvdW5kYXJ5LCBJRWRpdGFibGVDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tDZWxsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tPcHRpb25zQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi9ub3RlYm9va09wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbFZpZXdNb2RlbFN0YXRlQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi9ub3RlYm9va1ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbFRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va0NlbGxUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtLCBJTm90ZWJvb2tGaW5kT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJSW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRTZXNzaW9uU2VydmljZS5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXNlQ2VsbFZpZXdNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VFZGl0b3JBdHRhY2hTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHQvLyBEbyBub3QgbWVyZ2UgdGhpcyBldmVudCB3aXRoIGBvbkRpZENoYW5nZVN0YXRlYCBhcyB3ZSBhcmUgdXNpbmcgYEV2ZW50Lm9uY2Uob25EaWRDaGFuZ2VFZGl0b3JBdHRhY2hTdGF0ZSlgIGVsc2V3aGVyZS5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFZGl0b3JBdHRhY2hTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yQXR0YWNoU3RhdGUuZXZlbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENlbGxWaWV3TW9kZWxTdGF0ZUNoYW5nZUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdGU6IEV2ZW50PENlbGxWaWV3TW9kZWxTdGF0ZUNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZXZlbnQ7XG5cblx0Z2V0IGhhbmRsZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5oYW5kbGU7XG5cdH1cblx0Z2V0IHVyaSgpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC51cmk7XG5cdH1cblx0Z2V0IGxpbmVDb3VudCgpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC50ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpO1xuXHR9XG5cdGdldCBtZXRhZGF0YSgpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5tZXRhZGF0YTtcblx0fVxuXHRnZXQgaW50ZXJuYWxNZXRhZGF0YSgpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pbnRlcm5hbE1ldGFkYXRhO1xuXHR9XG5cdGdldCBsYW5ndWFnZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5sYW5ndWFnZTtcblx0fVxuXG5cdGdldCBtaW1lKCk6IHN0cmluZyB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLm1vZGVsLm1pbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC5taW1lO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAodGhpcy5sYW5ndWFnZSkge1xuXHRcdFx0Y2FzZSAnbWFya2Rvd24nOlxuXHRcdFx0XHRyZXR1cm4gTWltZXMubWFya2Rvd247XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBNaW1lcy50ZXh0O1xuXHRcdH1cblx0fVxuXG5cdGFic3RyYWN0IGNlbGxLaW5kOiBDZWxsS2luZDtcblxuXHRwcml2YXRlIF9lZGl0U3RhdGU6IENlbGxFZGl0U3RhdGUgPSBDZWxsRWRpdFN0YXRlLlByZXZpZXc7XG5cblx0cHJpdmF0ZSBfbGluZU51bWJlcnM6ICdvbicgfCAnb2ZmJyB8ICdpbmhlcml0JyA9ICdpbmhlcml0Jztcblx0Z2V0IGxpbmVOdW1iZXJzKCk6ICdvbicgfCAnb2ZmJyB8ICdpbmhlcml0JyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVOdW1iZXJzO1xuXHR9XG5cblx0c2V0IGxpbmVOdW1iZXJzKGxpbmVOdW1iZXJzOiAnb24nIHwgJ29mZicgfCAnaW5oZXJpdCcpIHtcblx0XHRpZiAobGluZU51bWJlcnMgPT09IHRoaXMuX2xpbmVOdW1iZXJzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGluZU51bWJlcnMgPSBsaW5lTnVtYmVycztcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoeyBjZWxsTGluZU51bWJlckNoYW5nZWQ6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21tZW50T3B0aW9uczogSUVkaXRvckNvbW1lbnRzT3B0aW9ucztcblx0cHVibGljIGdldCBjb21tZW50T3B0aW9ucygpOiBJRWRpdG9yQ29tbWVudHNPcHRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWVudE9wdGlvbnM7XG5cdH1cblxuXHRwdWJsaWMgc2V0IGNvbW1lbnRPcHRpb25zKG5ld09wdGlvbnM6IElFZGl0b3JDb21tZW50c09wdGlvbnMpIHtcblx0XHR0aGlzLl9jb21tZW50T3B0aW9ucyA9IG5ld09wdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIF9mb2N1c01vZGU6IENlbGxGb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLkNvbnRhaW5lcjtcblx0Z2V0IGZvY3VzTW9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXNNb2RlO1xuXHR9XG5cdHNldCBmb2N1c01vZGUobmV3TW9kZTogQ2VsbEZvY3VzTW9kZSkge1xuXHRcdGlmICh0aGlzLl9mb2N1c01vZGUgIT09IG5ld01vZGUpIHtcblx0XHRcdHRoaXMuX2ZvY3VzTW9kZSA9IG5ld01vZGU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoeyBmb2N1c01vZGVDaGFuZ2VkOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfdGV4dEVkaXRvcj86IElDb2RlRWRpdG9yO1xuXHRnZXQgZWRpdG9yQXR0YWNoZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fdGV4dEVkaXRvcjtcblx0fVxuXHRwcml2YXRlIF9lZGl0b3JMaXN0ZW5lcnM6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0cHJpdmF0ZSBfZWRpdG9yVmlld1N0YXRlczogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2VkaXRvclRyYW5zaWVudFN0YXRlOiBJV29yZFdyYXBUcmFuc2llbnRTdGF0ZSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9yZXNvbHZlZENlbGxEZWNvcmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJTm90ZWJvb2tDZWxsRGVjb3JhdGlvbk9wdGlvbnM+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFJlZkNoYW5nZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2VsbERlY29yYXRpb25zQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgYWRkZWQ6IElOb3RlYm9va0NlbGxEZWNvcmF0aW9uT3B0aW9uc1tdOyByZW1vdmVkOiBJTm90ZWJvb2tDZWxsRGVjb3JhdGlvbk9wdGlvbnNbXSB9PigpKTtcblx0cmVhZG9ubHkgb25DZWxsRGVjb3JhdGlvbnNDaGFuZ2VkOiBFdmVudDx7IGFkZGVkOiBJTm90ZWJvb2tDZWxsRGVjb3JhdGlvbk9wdGlvbnNbXTsgcmVtb3ZlZDogSU5vdGVib29rQ2VsbERlY29yYXRpb25PcHRpb25zW10gfT4gPSB0aGlzLl9jZWxsRGVjb3JhdGlvbnNDaGFuZ2VkLmV2ZW50O1xuXG5cdHByaXZhdGUgX3Jlc29sdmVkRGVjb3JhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywge1xuXHRcdGlkPzogc3RyaW5nO1xuXHRcdG9wdGlvbnM6IG1vZGVsLklNb2RlbERlbHRhRGVjb3JhdGlvbjtcblx0fT4oKTtcblx0cHJpdmF0ZSBfbGFzdERlY29yYXRpb25JZDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIF9jZWxsU3RhdHVzQmFySXRlbXMgPSBuZXcgTWFwPHN0cmluZywgSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2VsbFN0YXR1c0Jhckl0ZW1zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2VsbFN0YXR1c0Jhckl0ZW1zOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ2VsbFN0YXR1c0Jhckl0ZW1zLmV2ZW50O1xuXHRwcml2YXRlIF9sYXN0U3RhdHVzQmFySWQ6IG51bWJlciA9IDA7XG5cblx0Z2V0IHRleHRNb2RlbCgpOiBtb2RlbC5JVGV4dE1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC50ZXh0TW9kZWw7XG5cdH1cblxuXHRoYXNNb2RlbCgpOiB0aGlzIGlzIElFZGl0YWJsZUNlbGxWaWV3TW9kZWwge1xuXHRcdHJldHVybiAhIXRoaXMudGV4dE1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBfZHJhZ2dpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IGRyYWdnaW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9kcmFnZ2luZztcblx0fVxuXG5cdHNldCBkcmFnZ2luZyh2OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fZHJhZ2dpbmcgPSB2O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSh7IGRyYWdTdGF0ZUNoYW5nZWQ6IHRydWUgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3RleHRNb2RlbFJlZjogSVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2lucHV0Q29sbGFwc2VkOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCBpc0lucHV0Q29sbGFwc2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pbnB1dENvbGxhcHNlZDtcblx0fVxuXHRzZXQgaXNJbnB1dENvbGxhcHNlZCh2OiBib29sZWFuKSB7XG5cdFx0dGhpcy5faW5wdXRDb2xsYXBzZWQgPSB2O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSh7IGlucHV0Q29sbGFwc2VkQ2hhbmdlZDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX291dHB1dENvbGxhcHNlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRnZXQgaXNPdXRwdXRDb2xsYXBzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX291dHB1dENvbGxhcHNlZDtcblx0fVxuXHRzZXQgaXNPdXRwdXRDb2xsYXBzZWQodjogYm9vbGVhbikge1xuXHRcdHRoaXMuX291dHB1dENvbGxhcHNlZCA9IHY7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKHsgb3V0cHV0Q29sbGFwc2VkQ2hhbmdlZDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfY29tbWVudEhlaWdodCA9IDA7XG5cblx0c2V0IGNvbW1lbnRIZWlnaHQoaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fY29tbWVudEhlaWdodCA9PT0gaGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5sYXlvdXRDaGFuZ2UoeyBjb21tZW50SGVpZ2h0OiB0cnVlIH0sICdCYXNlQ2VsbFZpZXdNb2RlbCNjb21tZW50SGVpZ2h0Jyk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzUmVhZG9ubHkgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB2aWV3VHlwZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IG1vZGVsOiBOb3RlYm9va0NlbGxUZXh0TW9kZWwsXG5cdFx0cHVibGljIGlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld0NvbnRleHQ6IFZpZXdDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2U6IElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2Vcblx0XHQvLyBwcml2YXRlIHJlYWRvbmx5IF9rZXltYXBTZXJ2aWNlOiBJTm90ZWJvb2tLZXltYXBTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZU1ldGFkYXRhKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSh7IG1ldGFkYXRhQ2hhbmdlZDogdHJ1ZSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZUludGVybmFsTWV0YWRhdGEoZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoeyBpbnRlcm5hbE1ldGFkYXRhQ2hhbmdlZDogdHJ1ZSB9KTtcblx0XHRcdGlmIChlLmxhc3RSdW5TdWNjZXNzQ2hhbmdlZCkge1xuXHRcdFx0XHQvLyBTdGF0dXNiYXIgdmlzaWJpbGl0eSBtYXkgY2hhbmdlXG5cdFx0XHRcdHRoaXMubGF5b3V0Q2hhbmdlKHt9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignbm90ZWJvb2subGluZU51bWJlcnMnKSkge1xuXHRcdFx0XHR0aGlzLmxpbmVOdW1iZXJzID0gJ2luaGVyaXQnO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLm1vZGVsLmNvbGxhcHNlU3RhdGU/LmlucHV0Q29sbGFwc2VkKSB7XG5cdFx0XHR0aGlzLl9pbnB1dENvbGxhcHNlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubW9kZWwuY29sbGFwc2VTdGF0ZT8ub3V0cHV0Q29sbGFwc2VkKSB7XG5cdFx0XHR0aGlzLl9vdXRwdXRDb2xsYXBzZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbW1lbnRPcHRpb25zID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvckNvbW1lbnRzT3B0aW9ucz4oJ2VkaXRvci5jb21tZW50cycsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiB0aGlzLmxhbmd1YWdlIH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuY29tbWVudHMnKSkge1xuXHRcdFx0XHR0aGlzLl9jb21tZW50T3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JDb21tZW50c09wdGlvbnM+KCdlZGl0b3IuY29tbWVudHMnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogdGhpcy5sYW5ndWFnZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXG5cdHVwZGF0ZU9wdGlvbnMoZTogTm90ZWJvb2tPcHRpb25zQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdGV4dEVkaXRvciAmJiB0eXBlb2YgZS5yZWFkb25seSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLl90ZXh0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyByZWFkT25seTogZS5yZWFkb25seSB9KTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBlLnJlYWRvbmx5ID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRoaXMuX2lzUmVhZG9ubHkgPSBlLnJlYWRvbmx5O1xuXHRcdH1cblx0fVxuXHRhYnN0cmFjdCBnZXRIZWlnaHQobGluZUhlaWdodDogbnVtYmVyKTogbnVtYmVyO1xuXHRhYnN0cmFjdCBvbkRlc2VsZWN0KCk6IHZvaWQ7XG5cdGFic3RyYWN0IGxheW91dENoYW5nZShjaGFuZ2U6IENlbGxMYXlvdXRDaGFuZ2VFdmVudCwgc291cmNlPzogc3RyaW5nKTogdm9pZDtcblxuXHRhc3NlcnRUZXh0TW9kZWxBdHRhY2hlZCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy50ZXh0TW9kZWwgJiYgdGhpcy5fdGV4dEVkaXRvciAmJiB0aGlzLl90ZXh0RWRpdG9yLmdldE1vZGVsKCkgPT09IHRoaXMudGV4dE1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBwcml2YXRlIGhhbmRsZUtleURvd24oZTogSUtleWJvYXJkRXZlbnQpIHtcblx0Ly8gXHRpZiAodGhpcy52aWV3VHlwZSA9PT0gSVBZTkJfVklFV19UWVBFICYmIGlzV2luZG93cyAmJiBlLmN0cmxLZXkgJiYgZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdC8vIFx0XHR0aGlzLl9rZXltYXBTZXJ2aWNlLnByb21wdEtleW1hcFJlY29tbWVuZGF0aW9uKCk7XG5cdC8vIFx0fVxuXHQvLyB9XG5cblx0YXR0YWNoVGV4dEVkaXRvcihlZGl0b3I6IElDb2RlRWRpdG9yLCBlc3RpbWF0ZWRIYXNIb3Jpem9udGFsU2Nyb2xsaW5nPzogYm9vbGVhbikge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBlZGl0b3I6IG1vZGVsIGlzIG1pc3NpbmcnKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fdGV4dEVkaXRvciA9PT0gZWRpdG9yKSB7XG5cdFx0XHRpZiAodGhpcy5fZWRpdG9yTGlzdGVuZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JMaXN0ZW5lcnMucHVzaCh0aGlzLl90ZXh0RWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKCgpID0+IHsgdGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKHsgc2VsZWN0aW9uQ2hhbmdlZDogdHJ1ZSB9KTsgfSkpO1xuXHRcdFx0XHQvLyB0aGlzLl9lZGl0b3JMaXN0ZW5lcnMucHVzaCh0aGlzLl90ZXh0RWRpdG9yLm9uS2V5RG93bihlID0+IHRoaXMuaGFuZGxlS2V5RG93bihlKSkpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoeyBzZWxlY3Rpb25DaGFuZ2VkOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RleHRFZGl0b3IgPSBlZGl0b3I7XG5cdFx0aWYgKHRoaXMuX2lzUmVhZG9ubHkpIHtcblx0XHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHsgcmVhZE9ubHk6IHRoaXMuX2lzUmVhZG9ubHkgfSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9lZGl0b3JWaWV3U3RhdGVzKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlVmlld1N0YXRlKHRoaXMuX2VkaXRvclZpZXdTdGF0ZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBJZiBubyByZWFsIGVkaXRvciB2aWV3IHN0YXRlIHdhcyBwZXJzaXN0ZWQsIHJlc3RvcmUgYSBkZWZhdWx0IHN0YXRlLlxuXHRcdFx0Ly8gVGhpcyBmb3JjZXMgdGhlIGVkaXRvciB0byBtZWFzdXJlIGl0cyBjb250ZW50IHdpZHRoIGltbWVkaWF0ZWx5LlxuXHRcdFx0aWYgKGVzdGltYXRlZEhhc0hvcml6b250YWxTY3JvbGxpbmcpIHtcblx0XHRcdFx0dGhpcy5fcmVzdG9yZVZpZXdTdGF0ZSh7XG5cdFx0XHRcdFx0Y29udHJpYnV0aW9uc1N0YXRlOiB7fSxcblx0XHRcdFx0XHRjdXJzb3JTdGF0ZTogW10sXG5cdFx0XHRcdFx0dmlld1N0YXRlOiB7XG5cdFx0XHRcdFx0XHRzY3JvbGxMZWZ0OiAwLFxuXHRcdFx0XHRcdFx0Zmlyc3RQb3NpdGlvbjogeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSxcblx0XHRcdFx0XHRcdGZpcnN0UG9zaXRpb25EZWx0YVRvcDogdGhpcy5fdmlld0NvbnRleHQubm90ZWJvb2tPcHRpb25zLmdldExheW91dENvbmZpZ3VyYXRpb24oKS5lZGl0b3JUb3BQYWRkaW5nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZWRpdG9yVHJhbnNpZW50U3RhdGUpIHtcblx0XHRcdHdyaXRlVHJhbnNpZW50U3RhdGUoZWRpdG9yLmdldE1vZGVsKCksIHRoaXMuX2VkaXRvclRyYW5zaWVudFN0YXRlLCB0aGlzLl9jb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdC8vIFJlc3RvcmUgVmlldyBTdGF0ZSBjb3VsZCBhZGp1c3QgdGhlIGVkaXRvciBsYXlvdXQgYW5kIHRyaWdnZXIgYSBsaXN0IHZpZXcgdXBkYXRlLiBUaGUgbGlzdCB2aWV3IHVwZGF0ZSBtaWdodCB0aGVuIGRpc3Bvc2UgdGhpcyB2aWV3IG1vZGVsLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoYWNjZXNzb3IpID0+IHtcblx0XHRcdHRoaXMuX3Jlc29sdmVkRGVjb3JhdGlvbnMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgoJ19sYXp5XycpKSB7XG5cdFx0XHRcdFx0Ly8gbGF6eSBvbmVzXG5cdFx0XHRcdFx0Y29uc3QgcmV0ID0gYWNjZXNzb3IuYWRkRGVjb3JhdGlvbih2YWx1ZS5vcHRpb25zLnJhbmdlLCB2YWx1ZS5vcHRpb25zLm9wdGlvbnMpO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc29sdmVkRGVjb3JhdGlvbnMuZ2V0KGtleSkhLmlkID0gcmV0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHJldCA9IGFjY2Vzc29yLmFkZERlY29yYXRpb24odmFsdWUub3B0aW9ucy5yYW5nZSwgdmFsdWUub3B0aW9ucy5vcHRpb25zKTtcblx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlZERlY29yYXRpb25zLmdldChrZXkpIS5pZCA9IHJldDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9lZGl0b3JMaXN0ZW5lcnMucHVzaChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKCkgPT4geyB0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoeyBzZWxlY3Rpb25DaGFuZ2VkOiB0cnVlIH0pOyB9KSk7XG5cdFx0dGhpcy5fZWRpdG9yTGlzdGVuZXJzLnB1c2godGhpcy5faW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLm9uV2lsbFN0YXJ0U2Vzc2lvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUgPT09IHRoaXMuX3RleHRFZGl0b3IgJiYgdGhpcy50ZXh0QnVmZmVyLmdldExlbmd0aCgpID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuZW5hYmxlQXV0b0xhbmd1YWdlRGV0ZWN0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKHsgc2VsZWN0aW9uQ2hhbmdlZDogdHJ1ZSB9KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVkaXRvckF0dGFjaFN0YXRlLmZpcmUoKTtcblx0fVxuXG5cdGRldGFjaFRleHRFZGl0b3IoKSB7XG5cdFx0dGhpcy5zYXZlVmlld1N0YXRlKCk7XG5cdFx0dGhpcy5zYXZlVHJhbnNpZW50U3RhdGUoKTtcblx0XHQvLyBkZWNvcmF0aW9ucyBuZWVkIHRvIGJlIGNsZWFyZWQgZmlyc3QgYXMgZWRpdG9ycyBjYW4gYmUgcmVzdWVkLlxuXHRcdHRoaXMuX3RleHRFZGl0b3I/LmNoYW5nZURlY29yYXRpb25zKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0dGhpcy5fcmVzb2x2ZWREZWNvcmF0aW9ucy5mb3JFYWNoKHZhbHVlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRpZCA9IHZhbHVlLmlkO1xuXG5cdFx0XHRcdGlmIChyZXNvbHZlZGlkKSB7XG5cdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlRGVjb3JhdGlvbihyZXNvbHZlZGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl90ZXh0RWRpdG9yID0gdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2UodGhpcy5fZWRpdG9yTGlzdGVuZXJzKTtcblx0XHR0aGlzLl9lZGl0b3JMaXN0ZW5lcnMgPSBbXTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVkaXRvckF0dGFjaFN0YXRlLmZpcmUoKTtcblxuXHRcdGlmICh0aGlzLl90ZXh0TW9kZWxSZWYpIHtcblx0XHRcdHRoaXMuX3RleHRNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl90ZXh0TW9kZWxSZWYgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3RleHRNb2RlbFJlZkNoYW5nZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0fVxuXG5cdGdldFRleHQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRWYWx1ZSgpO1xuXHR9XG5cblx0Z2V0QWx0ZXJuYXRpdmVJZCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmFsdGVybmF0aXZlSWQ7XG5cdH1cblxuXHRnZXRUZXh0TGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0VGV4dExlbmd0aCgpO1xuXHR9XG5cblx0ZW5hYmxlQXV0b0xhbmd1YWdlRGV0ZWN0aW9uKCkge1xuXHRcdHRoaXMubW9kZWwuZW5hYmxlQXV0b0xhbmd1YWdlRGV0ZWN0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVWaWV3U3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90ZXh0RWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yVmlld1N0YXRlcyA9IHRoaXMuX3RleHRFZGl0b3Iuc2F2ZVZpZXdTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlVHJhbnNpZW50U3RhdGUoKSB7XG5cdFx0aWYgKCF0aGlzLl90ZXh0RWRpdG9yIHx8ICF0aGlzLl90ZXh0RWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0b3JUcmFuc2llbnRTdGF0ZSA9IHJlYWRUcmFuc2llbnRTdGF0ZSh0aGlzLl90ZXh0RWRpdG9yLmdldE1vZGVsKCksIHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlKTtcblx0fVxuXG5cdHNhdmVFZGl0b3JWaWV3U3RhdGUoKSB7XG5cdFx0aWYgKHRoaXMuX3RleHRFZGl0b3IpIHtcblx0XHRcdHRoaXMuX2VkaXRvclZpZXdTdGF0ZXMgPSB0aGlzLl90ZXh0RWRpdG9yLnNhdmVWaWV3U3RhdGUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yVmlld1N0YXRlcztcblx0fVxuXG5cdHJlc3RvcmVFZGl0b3JWaWV3U3RhdGUoZWRpdG9yVmlld1N0YXRlczogZWRpdG9yQ29tbW9uLklDb2RlRWRpdG9yVmlld1N0YXRlIHwgbnVsbCwgdG90YWxIZWlnaHQ/OiBudW1iZXIpIHtcblx0XHR0aGlzLl9lZGl0b3JWaWV3U3RhdGVzID0gZWRpdG9yVmlld1N0YXRlcztcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVWaWV3U3RhdGUoc3RhdGU6IGVkaXRvckNvbW1vbi5JQ29kZUVkaXRvclZpZXdTdGF0ZSB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdHRoaXMuX3RleHRFZGl0b3I/LnJlc3RvcmVWaWV3U3RhdGUoc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdGFkZE1vZGVsRGVjb3JhdGlvbihkZWNvcmF0aW9uOiBtb2RlbC5JTW9kZWxEZWx0YURlY29yYXRpb24pOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fdGV4dEVkaXRvcikge1xuXHRcdFx0Y29uc3QgaWQgPSArK3RoaXMuX2xhc3REZWNvcmF0aW9uSWQ7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uSWQgPSBgX2xhenlfJHt0aGlzLmlkfTske2lkfWA7XG5cdFx0XHR0aGlzLl9yZXNvbHZlZERlY29yYXRpb25zLnNldChkZWNvcmF0aW9uSWQsIHsgb3B0aW9uczogZGVjb3JhdGlvbiB9KTtcblx0XHRcdHJldHVybiBkZWNvcmF0aW9uSWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGlkOiBzdHJpbmc7XG5cdFx0dGhpcy5fdGV4dEVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoYWNjZXNzb3IpID0+IHtcblx0XHRcdGlkID0gYWNjZXNzb3IuYWRkRGVjb3JhdGlvbihkZWNvcmF0aW9uLnJhbmdlLCBkZWNvcmF0aW9uLm9wdGlvbnMpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZWREZWNvcmF0aW9ucy5zZXQoaWQsIHsgaWQsIG9wdGlvbnM6IGRlY29yYXRpb24gfSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGlkITtcblx0fVxuXG5cdHJlbW92ZU1vZGVsRGVjb3JhdGlvbihkZWNvcmF0aW9uSWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IHJlYWxEZWNvcmF0aW9uSWQgPSB0aGlzLl9yZXNvbHZlZERlY29yYXRpb25zLmdldChkZWNvcmF0aW9uSWQpO1xuXG5cdFx0aWYgKHRoaXMuX3RleHRFZGl0b3IgJiYgcmVhbERlY29yYXRpb25JZCAmJiByZWFsRGVjb3JhdGlvbklkLmlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3RleHRFZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24ocmVhbERlY29yYXRpb25JZC5pZCEpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gbGFzdGx5LCByZW1vdmUgYWxsIHRoZSBjYWNoZVxuXHRcdHRoaXMuX3Jlc29sdmVkRGVjb3JhdGlvbnMuZGVsZXRlKGRlY29yYXRpb25JZCk7XG5cdH1cblxuXHRkZWx0YU1vZGVsRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnM6IHJlYWRvbmx5IHN0cmluZ1tdLCBuZXdEZWNvcmF0aW9uczogcmVhZG9ubHkgbW9kZWwuSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10pOiBzdHJpbmdbXSB7XG5cdFx0b2xkRGVjb3JhdGlvbnMuZm9yRWFjaChpZCA9PiB7XG5cdFx0XHR0aGlzLnJlbW92ZU1vZGVsRGVjb3JhdGlvbihpZCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXQgPSBuZXdEZWNvcmF0aW9ucy5tYXAob3B0aW9uID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmFkZE1vZGVsRGVjb3JhdGlvbihvcHRpb24pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUNlbGxEZWNvcmF0aW9uKGRlY29yYXRpb25JZDogc3RyaW5nKSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX3Jlc29sdmVkQ2VsbERlY29yYXRpb25zLmdldChkZWNvcmF0aW9uSWQpO1xuXHRcdHRoaXMuX3Jlc29sdmVkQ2VsbERlY29yYXRpb25zLmRlbGV0ZShkZWNvcmF0aW9uSWQpO1xuXG5cdFx0aWYgKG9wdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgZXhpc3RpbmdPcHRpb25zIG9mIHRoaXMuX3Jlc29sdmVkQ2VsbERlY29yYXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRcdC8vIGRvbid0IHJlbW92ZSBkZWNvcmF0aW9ucyB0aGF0IGFyZSBhcHBsaWVkIGZyb20gb3RoZXIgZW50cmllc1xuXHRcdFx0XHRpZiAob3B0aW9ucy5jbGFzc05hbWUgPT09IGV4aXN0aW5nT3B0aW9ucy5jbGFzc05hbWUpIHtcblx0XHRcdFx0XHRvcHRpb25zLmNsYXNzTmFtZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucy5vdXRwdXRDbGFzc05hbWUgPT09IGV4aXN0aW5nT3B0aW9ucy5vdXRwdXRDbGFzc05hbWUpIHtcblx0XHRcdFx0XHRvcHRpb25zLm91dHB1dENsYXNzTmFtZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucy5ndXR0ZXJDbGFzc05hbWUgPT09IGV4aXN0aW5nT3B0aW9ucy5ndXR0ZXJDbGFzc05hbWUpIHtcblx0XHRcdFx0XHRvcHRpb25zLmd1dHRlckNsYXNzTmFtZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucy50b3BDbGFzc05hbWUgPT09IGV4aXN0aW5nT3B0aW9ucy50b3BDbGFzc05hbWUpIHtcblx0XHRcdFx0XHRvcHRpb25zLnRvcENsYXNzTmFtZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jZWxsRGVjb3JhdGlvbnNDaGFuZ2VkLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtvcHRpb25zXSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGRDZWxsRGVjb3JhdGlvbihvcHRpb25zOiBJTm90ZWJvb2tDZWxsRGVjb3JhdGlvbk9wdGlvbnMpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGlkID0gKyt0aGlzLl9sYXN0RGVjb3JhdGlvbklkO1xuXHRcdGNvbnN0IGRlY29yYXRpb25JZCA9IGBfY2VsbF8ke3RoaXMuaWR9OyR7aWR9YDtcblx0XHR0aGlzLl9yZXNvbHZlZENlbGxEZWNvcmF0aW9ucy5zZXQoZGVjb3JhdGlvbklkLCBvcHRpb25zKTtcblx0XHR0aGlzLl9jZWxsRGVjb3JhdGlvbnNDaGFuZ2VkLmZpcmUoeyBhZGRlZDogW29wdGlvbnNdLCByZW1vdmVkOiBbXSB9KTtcblx0XHRyZXR1cm4gZGVjb3JhdGlvbklkO1xuXHR9XG5cblx0Z2V0Q2VsbERlY29yYXRpb25zKCkge1xuXHRcdHJldHVybiBbLi4udGhpcy5fcmVzb2x2ZWRDZWxsRGVjb3JhdGlvbnMudmFsdWVzKCldO1xuXHR9XG5cblx0Z2V0Q2VsbERlY29yYXRpb25SYW5nZShkZWNvcmF0aW9uSWQ6IHN0cmluZyk6IFJhbmdlIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3RleHRFZGl0b3IpIHtcblx0XHRcdC8vICh0aGlzLl90ZXh0RWRpdG9yIGFzIENvZGVFZGl0b3JXaWRnZXQpLmRlY29yYVxuXHRcdFx0cmV0dXJuIHRoaXMuX3RleHRFZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0RGVjb3JhdGlvblJhbmdlKGRlY29yYXRpb25JZCkgPz8gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGRlbHRhQ2VsbERlY29yYXRpb25zKG9sZERlY29yYXRpb25zOiBzdHJpbmdbXSwgbmV3RGVjb3JhdGlvbnM6IElOb3RlYm9va0NlbGxEZWNvcmF0aW9uT3B0aW9uc1tdKTogc3RyaW5nW10ge1xuXHRcdG9sZERlY29yYXRpb25zLmZvckVhY2goaWQgPT4ge1xuXHRcdFx0dGhpcy5fcmVtb3ZlQ2VsbERlY29yYXRpb24oaWQpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmV0ID0gbmV3RGVjb3JhdGlvbnMubWFwKG9wdGlvbiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWRkQ2VsbERlY29yYXRpb24ob3B0aW9uKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRkZWx0YUNlbGxTdGF0dXNCYXJJdGVtcyhvbGRJdGVtczogcmVhZG9ubHkgc3RyaW5nW10sIG5ld0l0ZW1zOiByZWFkb25seSBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbVtdKTogc3RyaW5nW10ge1xuXHRcdG9sZEl0ZW1zLmZvckVhY2goaWQgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2NlbGxTdGF0dXNCYXJJdGVtcy5nZXQoaWQpO1xuXHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0dGhpcy5fY2VsbFN0YXR1c0Jhckl0ZW1zLmRlbGV0ZShpZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBuZXdJZHMgPSBuZXdJdGVtcy5tYXAoaXRlbSA9PiB7XG5cdFx0XHRjb25zdCBpZCA9ICsrdGhpcy5fbGFzdFN0YXR1c0JhcklkO1xuXHRcdFx0Y29uc3QgaXRlbUlkID0gYF9jZWxsXyR7dGhpcy5pZH07JHtpZH1gO1xuXHRcdFx0dGhpcy5fY2VsbFN0YXR1c0Jhckl0ZW1zLnNldChpdGVtSWQsIGl0ZW0pO1xuXHRcdFx0cmV0dXJuIGl0ZW1JZDtcblx0XHR9KTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2VsbFN0YXR1c0Jhckl0ZW1zLmZpcmUoKTtcblxuXHRcdHJldHVybiBuZXdJZHM7XG5cdH1cblxuXHRnZXRDZWxsU3RhdHVzQmFySXRlbXMoKTogSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1bXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fY2VsbFN0YXR1c0Jhckl0ZW1zLnZhbHVlcygpKTtcblx0fVxuXG5cdHJldmVhbFJhbmdlSW5DZW50ZXIocmFuZ2U6IFJhbmdlKSB7XG5cdFx0dGhpcy5fdGV4dEVkaXRvcj8ucmV2ZWFsUmFuZ2VJbkNlbnRlcihyYW5nZSwgZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0fVxuXG5cdHNldFNlbGVjdGlvbihyYW5nZTogUmFuZ2UpIHtcblx0XHR0aGlzLl90ZXh0RWRpdG9yPy5zZXRTZWxlY3Rpb24ocmFuZ2UpO1xuXHR9XG5cblx0c2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSkge1xuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0aWYgKHRoaXMuX3RleHRFZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5fdGV4dEVkaXRvcj8uc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fZWRpdG9yVmlld1N0YXRlcykge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JWaWV3U3RhdGVzLmN1cnNvclN0YXRlID0gc2VsZWN0aW9ucy5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiAhc2VsZWN0aW9uLmlzRW1wdHkoKSxcblx0XHRcdFx0XHRcdHNlbGVjdGlvblN0YXJ0OiBzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpLFxuXHRcdFx0XHRcdFx0cG9zaXRpb246IHNlbGVjdGlvbi5nZXRFbmRQb3NpdGlvbigpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldFNlbGVjdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RleHRFZGl0b3I/LmdldFNlbGVjdGlvbnMoKVxuXHRcdFx0Pz8gdGhpcy5fZWRpdG9yVmlld1N0YXRlcz8uY3Vyc29yU3RhdGUubWFwKHN0YXRlID0+IG5ldyBTZWxlY3Rpb24oc3RhdGUuc2VsZWN0aW9uU3RhcnQubGluZU51bWJlciwgc3RhdGUuc2VsZWN0aW9uU3RhcnQuY29sdW1uLCBzdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyLCBzdGF0ZS5wb3NpdGlvbi5jb2x1bW4pKVxuXHRcdFx0Pz8gW107XG5cdH1cblxuXHRnZXRTZWxlY3Rpb25zU3RhcnRQb3NpdGlvbigpOiBJUG9zaXRpb25bXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3RleHRFZGl0b3IpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl90ZXh0RWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdHJldHVybiBzZWxlY3Rpb25zPy5tYXAocyA9PiBzLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3JWaWV3U3RhdGVzPy5jdXJzb3JTdGF0ZTtcblx0XHRcdHJldHVybiBzZWxlY3Rpb25zPy5tYXAocyA9PiBzLnNlbGVjdGlvblN0YXJ0KTtcblx0XHR9XG5cdH1cblxuXHRnZXRMaW5lU2Nyb2xsVG9wT2Zmc2V0KGxpbmU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl90ZXh0RWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JQYWRkaW5nID0gdGhpcy5fdmlld0NvbnRleHQubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVFZGl0b3JQYWRkaW5nKHRoaXMuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy51cmkpO1xuXHRcdHJldHVybiB0aGlzLl90ZXh0RWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIobGluZSkgKyBlZGl0b3JQYWRkaW5nLnRvcDtcblx0fVxuXG5cdGdldFBvc2l0aW9uU2Nyb2xsVG9wT2Zmc2V0KHJhbmdlOiBTZWxlY3Rpb24gfCBSYW5nZSk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl90ZXh0RWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gcmFuZ2UgaW5zdGFuY2VvZiBTZWxlY3Rpb24gPyByYW5nZS5nZXRQb3NpdGlvbigpIDogcmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXG5cdFx0Y29uc3QgZWRpdG9yUGFkZGluZyA9IHRoaXMuX3ZpZXdDb250ZXh0Lm5vdGVib29rT3B0aW9ucy5jb21wdXRlRWRpdG9yUGFkZGluZyh0aGlzLmludGVybmFsTWV0YWRhdGEsIHRoaXMudXJpKTtcblx0XHRyZXR1cm4gdGhpcy5fdGV4dEVkaXRvci5nZXRUb3BGb3JQb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pICsgZWRpdG9yUGFkZGluZy50b3A7XG5cdH1cblxuXHRjdXJzb3JBdExpbmVCb3VuZGFyeSgpOiBDdXJzb3JBdExpbmVCb3VuZGFyeSB7XG5cdFx0aWYgKCF0aGlzLl90ZXh0RWRpdG9yIHx8ICF0aGlzLnRleHRNb2RlbCB8fCAhdGhpcy5fdGV4dEVkaXRvci5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuIEN1cnNvckF0TGluZUJvdW5kYXJ5Lk5vbmU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fdGV4dEVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdGlmICghc2VsZWN0aW9uIHx8ICFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm4gQ3Vyc29yQXRMaW5lQm91bmRhcnkuTm9uZTtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50TGluZUxlbmd0aCA9IHRoaXMudGV4dE1vZGVsLmdldExpbmVMZW5ndGgoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcik7XG5cblx0XHRpZiAoY3VycmVudExpbmVMZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBDdXJzb3JBdExpbmVCb3VuZGFyeS5Cb3RoO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoc2VsZWN0aW9uLnN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHJldHVybiBDdXJzb3JBdExpbmVCb3VuZGFyeS5TdGFydDtcblx0XHRcdGNhc2UgY3VycmVudExpbmVMZW5ndGggKyAxOlxuXHRcdFx0XHRyZXR1cm4gQ3Vyc29yQXRMaW5lQm91bmRhcnkuRW5kO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIEN1cnNvckF0TGluZUJvdW5kYXJ5Lk5vbmU7XG5cdFx0fVxuXHR9XG5cblx0Y3Vyc29yQXRCb3VuZGFyeSgpOiBDdXJzb3JBdEJvdW5kYXJ5IHtcblx0XHRpZiAoIXRoaXMuX3RleHRFZGl0b3IpIHtcblx0XHRcdHJldHVybiBDdXJzb3JBdEJvdW5kYXJ5Lk5vbmU7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnRleHRNb2RlbCkge1xuXHRcdFx0cmV0dXJuIEN1cnNvckF0Qm91bmRhcnkuTm9uZTtcblx0XHR9XG5cblx0XHQvLyBvbmx5IHZhbGlkYXRlIHByaW1hcnkgY3Vyc29yXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fdGV4dEVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdC8vIG9ubHkgdmFsaWRhdGUgZW1wdHkgY3Vyc29yXG5cdFx0aWYgKCFzZWxlY3Rpb24gfHwgIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiBDdXJzb3JBdEJvdW5kYXJ5Lk5vbmU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RWaWV3TGluZVRvcCA9IHRoaXMuX3RleHRFZGl0b3IuZ2V0VG9wRm9yUG9zaXRpb24oMSwgMSk7XG5cdFx0Y29uc3QgbGFzdFZpZXdMaW5lVG9wID0gdGhpcy5fdGV4dEVkaXRvci5nZXRUb3BGb3JQb3NpdGlvbih0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ291bnQoKSwgdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aCh0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ291bnQoKSkpO1xuXHRcdGNvbnN0IHNlbGVjdGlvblRvcCA9IHRoaXMuX3RleHRFZGl0b3IuZ2V0VG9wRm9yUG9zaXRpb24oc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uKTtcblxuXHRcdGlmIChzZWxlY3Rpb25Ub3AgPT09IGxhc3RWaWV3TGluZVRvcCkge1xuXHRcdFx0aWYgKHNlbGVjdGlvblRvcCA9PT0gZmlyc3RWaWV3TGluZVRvcCkge1xuXHRcdFx0XHRyZXR1cm4gQ3Vyc29yQXRCb3VuZGFyeS5Cb3RoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIEN1cnNvckF0Qm91bmRhcnkuQm90dG9tO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoc2VsZWN0aW9uVG9wID09PSBmaXJzdFZpZXdMaW5lVG9wKSB7XG5cdFx0XHRcdHJldHVybiBDdXJzb3JBdEJvdW5kYXJ5LlRvcDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBDdXJzb3JBdEJvdW5kYXJ5Lk5vbmU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZWRpdFN0YXRlU291cmNlOiBzdHJpbmcgPSAnJztcblxuXHRnZXQgZWRpdFN0YXRlU291cmNlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRTdGF0ZVNvdXJjZTtcblx0fVxuXG5cdHVwZGF0ZUVkaXRTdGF0ZShuZXdTdGF0ZTogQ2VsbEVkaXRTdGF0ZSwgc291cmNlOiBzdHJpbmcpIHtcblx0XHRpZiAobmV3U3RhdGUgPT09IHRoaXMuX2VkaXRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VkaXRTdGF0ZVNvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLl9lZGl0U3RhdGUgPSBuZXdTdGF0ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoeyBlZGl0U3RhdGVDaGFuZ2VkOiB0cnVlIH0pO1xuXHRcdGlmICh0aGlzLl9lZGl0U3RhdGUgPT09IENlbGxFZGl0U3RhdGUuUHJldmlldykge1xuXHRcdFx0dGhpcy5mb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLkNvbnRhaW5lcjtcblx0XHR9XG5cdH1cblxuXHRnZXRFZGl0U3RhdGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRTdGF0ZTtcblx0fVxuXG5cdGdldCB0ZXh0QnVmZmVyKCkge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnRleHRCdWZmZXI7XG5cdH1cblxuXHQvKipcblx0ICogVGV4dCBtb2RlbCBpcyB1c2VkIGZvciBlZGl0aW5nLlxuXHQgKi9cblx0YXN5bmMgcmVzb2x2ZVRleHRNb2RlbCgpOiBQcm9taXNlPG1vZGVsLklUZXh0TW9kZWw+IHtcblx0XHRpZiAoIXRoaXMuX3RleHRNb2RlbFJlZiB8fCAhdGhpcy50ZXh0TW9kZWwpIHtcblx0XHRcdHRoaXMuX3RleHRNb2RlbFJlZiA9IGF3YWl0IHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh0aGlzLnVyaSk7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy50ZXh0TW9kZWwhO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX3RleHRNb2RlbFJlZikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXNvbHZlIHRleHQgbW9kZWwgZm9yICR7dGhpcy51cml9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90ZXh0TW9kZWxSZWZDaGFuZ2VEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy50ZXh0TW9kZWwhLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlVGV4dE1vZGVsQ29udGVudCgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy50ZXh0TW9kZWwhO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IG9uRGlkQ2hhbmdlVGV4dE1vZGVsQ29udGVudCgpOiB2b2lkO1xuXG5cdHByb3RlY3RlZCBjZWxsU3RhcnRGaW5kKHZhbHVlOiBzdHJpbmcsIG9wdGlvbnM6IElOb3RlYm9va0ZpbmRPcHRpb25zKTogbW9kZWwuRmluZE1hdGNoW10gfCBudWxsIHtcblx0XHRsZXQgY2VsbE1hdGNoZXM6IG1vZGVsLkZpbmRNYXRjaFtdID0gW107XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLnRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgZmluZFJhbmdlOiBJUmFuZ2VbXSA9IG9wdGlvbnMuZmluZFNjb3BlPy5zZWxlY3RlZFRleHRSYW5nZXMgPz8gW25ldyBSYW5nZSgxLCAxLCBsaW5lQ291bnQsIHRoaXMudGV4dEJ1ZmZlci5nZXRMaW5lTGVuZ3RoKGxpbmVDb3VudCkgKyAxKV07XG5cblx0XHRpZiAodGhpcy5hc3NlcnRUZXh0TW9kZWxBdHRhY2hlZCgpKSB7XG5cdFx0XHRjZWxsTWF0Y2hlcyA9IHRoaXMudGV4dE1vZGVsIS5maW5kTWF0Y2hlcyhcblx0XHRcdFx0dmFsdWUsXG5cdFx0XHRcdGZpbmRSYW5nZSxcblx0XHRcdFx0b3B0aW9ucy5yZWdleCB8fCBmYWxzZSxcblx0XHRcdFx0b3B0aW9ucy5jYXNlU2Vuc2l0aXZlIHx8IGZhbHNlLFxuXHRcdFx0XHRvcHRpb25zLndob2xlV29yZCA/IG9wdGlvbnMud29yZFNlcGFyYXRvcnMgfHwgbnVsbCA6IG51bGwsXG5cdFx0XHRcdG9wdGlvbnMucmVnZXggfHwgZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKHZhbHVlLCBvcHRpb25zLnJlZ2V4IHx8IGZhbHNlLCBvcHRpb25zLmNhc2VTZW5zaXRpdmUgfHwgZmFsc2UsIG9wdGlvbnMud2hvbGVXb3JkID8gb3B0aW9ucy53b3JkU2VwYXJhdG9ycyB8fCBudWxsIDogbnVsbCwpO1xuXHRcdFx0Y29uc3Qgc2VhcmNoRGF0YSA9IHNlYXJjaFBhcmFtcy5wYXJzZVNlYXJjaFJlcXVlc3QoKTtcblxuXHRcdFx0aWYgKCFzZWFyY2hEYXRhKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRmaW5kUmFuZ2UuZm9yRWFjaChyYW5nZSA9PiB7XG5cdFx0XHRcdGNlbGxNYXRjaGVzLnB1c2goLi4udGhpcy50ZXh0QnVmZmVyLmZpbmRNYXRjaGVzTGluZUJ5TGluZShuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKSwgc2VhcmNoRGF0YSwgb3B0aW9ucy5yZWdleCB8fCBmYWxzZSwgMTAwMCkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNlbGxNYXRjaGVzO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHRkaXNwb3NlKHRoaXMuX2VkaXRvckxpc3RlbmVycyk7XG5cblx0XHQvLyBPbmx5IHJlbW92ZSB0aGUgdW5kbyByZWRvIHN0YWNrIGlmIHdlIG1hcCB0aGlzIGNlbGwgdXJpIHRvIGl0c2VsZlxuXHRcdC8vIElmIHdlIGFyZSBub3QgaW4gcGVyQ2VsbCBtb2RlLCBpdCB3aWxsIG1hcCB0byB0aGUgZnVsbCBOb3RlYm9va0RvY3VtZW50IGFuZFxuXHRcdC8vIHdlIGRvbid0IHdhbnQgdG8gcmVtb3ZlIHRoYXQgZW50aXJlIGRvY3VtZW50IHVuZG8gLyByZWRvIHN0YWNrIHdoZW4gYSBjZWxsIGlzIGRlbGV0ZWRcblx0XHRpZiAodGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmdldFVyaUNvbXBhcmlzb25LZXkodGhpcy51cmkpID09PSB0aGlzLnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UucmVtb3ZlRWxlbWVudHModGhpcy51cmkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RleHRNb2RlbFJlZj8uZGlzcG9zZSgpO1xuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGhhbmRsZTogdGhpcy5oYW5kbGVcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBcUMsbUJBQW1CLGVBQWU7QUFDaEYsU0FBUyxhQUFhO0FBS3RCLFNBQWlCLGFBQWE7QUFDOUIsU0FBUyxpQkFBaUI7QUFDMUIsWUFBWSxrQkFBa0I7QUFFOUIsU0FBUyxvQkFBb0I7QUFJN0IsU0FBa0Msb0JBQW9CLDJCQUEyQjtBQUNqRixTQUFTLGVBQWUsZUFBc0Msa0JBQWtCLDRCQUFvRjtBQVE3SixNQUFlLDBCQUEwQixXQUFXO0FBQUEsRUEwSjFELFlBQ1UsVUFDQUEsUUFDRixJQUNVLGNBQ0EsdUJBQ0EsZUFDQSxrQkFDQSxvQkFDQSwyQkFFaEI7QUFDRCxVQUFNO0FBWEc7QUFDQSxpQkFBQUE7QUFDRjtBQUNVO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWpLbEIsU0FBbUIsZ0NBQWdDLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUVyRjtBQUFBLFNBQVMsK0JBQStCLEtBQUssOEJBQThCO0FBQzNFLFNBQW1CLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxRQUF1QyxDQUFDO0FBQ2xHLFNBQWdCLG1CQUF5RCxLQUFLLGtCQUFrQjtBQXFDaEcsU0FBUSxhQUE0QixjQUFjO0FBRWxELFNBQVEsZUFBeUM7QUF1QmpELFNBQVEsYUFBNEIsY0FBYztBQWVsRCxTQUFRLG1CQUFrQyxDQUFDO0FBQzNDLFNBQVEsb0JBQThEO0FBQ3RFLFNBQVEsd0JBQXdEO0FBQ2hFLFNBQVEsMkJBQTJCLG9CQUFJLElBQTRDO0FBQ25GLFNBQWlCLGdDQUFnQyxLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUV2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
