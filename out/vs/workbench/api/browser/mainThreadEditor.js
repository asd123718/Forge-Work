import { Emitter } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { RenderLineNumbersType, TextEditorCursorStyle, cursorStyleToString, EditorOption } from "../../../editor/common/config/editorOptions.js";
import { Range } from "../../../editor/common/core/range.js";
import { Selection } from "../../../editor/common/core/selection.js";
import { ScrollType } from "../../../editor/common/editorCommon.js";
import { SnippetController2 } from "../../../editor/contrib/snippet/browser/snippetController2.js";
import { TextEditorRevealType } from "../common/extHost.protocol.js";
import { equals } from "../../../base/common/arrays.js";
import { CodeEditorStateFlag, EditorState } from "../../../editor/contrib/editorState/browser/editorState.js";
import { SnippetParser } from "../../../editor/contrib/snippet/browser/snippetParser.js";
class MainThreadTextEditorProperties {
  constructor(selections, options, visibleRanges) {
    this.selections = selections;
    this.options = options;
    this.visibleRanges = visibleRanges;
  }
  static readFromEditor(previousProperties, model, codeEditor) {
    const selections = MainThreadTextEditorProperties._readSelectionsFromCodeEditor(previousProperties, codeEditor);
    const options = MainThreadTextEditorProperties._readOptionsFromCodeEditor(previousProperties, model, codeEditor);
    const visibleRanges = MainThreadTextEditorProperties._readVisibleRangesFromCodeEditor(previousProperties, codeEditor);
    return new MainThreadTextEditorProperties(selections, options, visibleRanges);
  }
  static _readSelectionsFromCodeEditor(previousProperties, codeEditor) {
    let result = null;
    if (codeEditor) {
      result = codeEditor.getSelections();
    }
    if (!result && previousProperties) {
      result = previousProperties.selections;
    }
    if (!result) {
      result = [new Selection(1, 1, 1, 1)];
    }
    return result;
  }
  static _readOptionsFromCodeEditor(previousProperties, model, codeEditor) {
    if (model.isDisposed()) {
      if (previousProperties) {
        return previousProperties.options;
      } else {
        throw new Error("No valid properties");
      }
    }
    let cursorStyle;
    let lineNumbers;
    if (codeEditor) {
      const options = codeEditor.getOptions();
      const lineNumbersOpts = options.get(EditorOption.lineNumbers);
      cursorStyle = options.get(EditorOption.cursorStyle);
      lineNumbers = lineNumbersOpts.renderType;
    } else if (previousProperties) {
      cursorStyle = previousProperties.options.cursorStyle;
      lineNumbers = previousProperties.options.lineNumbers;
    } else {
      cursorStyle = TextEditorCursorStyle.Line;
      lineNumbers = RenderLineNumbersType.On;
    }
    const modelOptions = model.getOptions();
    return {
      insertSpaces: modelOptions.insertSpaces,
      tabSize: modelOptions.tabSize,
      indentSize: modelOptions.indentSize,
      originalIndentSize: modelOptions.originalIndentSize,
      cursorStyle,
      lineNumbers
    };
  }
  static _readVisibleRangesFromCodeEditor(previousProperties, codeEditor) {
    if (codeEditor) {
      return codeEditor.getVisibleRanges();
    }
    return [];
  }
  generateDelta(oldProps, selectionChangeSource) {
    const delta = {
      options: null,
      selections: null,
      visibleRanges: null
    };
    if (!oldProps || !MainThreadTextEditorProperties._selectionsEqual(oldProps.selections, this.selections)) {
      delta.selections = {
        selections: this.selections,
        source: selectionChangeSource ?? void 0
      };
    }
    if (!oldProps || !MainThreadTextEditorProperties._optionsEqual(oldProps.options, this.options)) {
      delta.options = this.options;
    }
    if (!oldProps || !MainThreadTextEditorProperties._rangesEqual(oldProps.visibleRanges, this.visibleRanges)) {
      delta.visibleRanges = this.visibleRanges;
    }
    if (delta.selections || delta.options || delta.visibleRanges) {
      return delta;
    }
    return null;
  }
  static _selectionsEqual(a, b) {
    return equals(a, b, (aValue, bValue) => aValue.equalsSelection(bValue));
  }
  static _rangesEqual(a, b) {
    return equals(a, b, (aValue, bValue) => aValue.equalsRange(bValue));
  }
  static _optionsEqual(a, b) {
    if (a && !b || !a && b) {
      return false;
    }
    if (!a && !b) {
      return true;
    }
    return a.tabSize === b.tabSize && a.indentSize === b.indentSize && a.insertSpaces === b.insertSpaces && a.cursorStyle === b.cursorStyle && a.lineNumbers === b.lineNumbers;
  }
}
class MainThreadTextEditor {
  constructor(id, model, codeEditor, focusTracker, mainThreadDocuments, modelService, clipboardService) {
    this._modelListeners = new DisposableStore();
    this._codeEditorListeners = new DisposableStore();
    this._id = id;
    this._model = model;
    this._codeEditor = null;
    this._properties = null;
    this._focusTracker = focusTracker;
    this._mainThreadDocuments = mainThreadDocuments;
    this._modelService = modelService;
    this._clipboardService = clipboardService;
    this._onPropertiesChanged = new Emitter();
    this._modelListeners.add(this._model.onDidChangeOptions((e) => {
      this._updatePropertiesNow(null);
    }));
    this.setCodeEditor(codeEditor);
    this._updatePropertiesNow(null);
  }
  dispose() {
    this._modelListeners.dispose();
    this._onPropertiesChanged.dispose();
    this._codeEditor = null;
    this._codeEditorListeners.dispose();
  }
  _updatePropertiesNow(selectionChangeSource) {
    this._setProperties(
      MainThreadTextEditorProperties.readFromEditor(this._properties, this._model, this._codeEditor),
      selectionChangeSource
    );
  }
  _setProperties(newProperties, selectionChangeSource) {
    const delta = newProperties.generateDelta(this._properties, selectionChangeSource);
    this._properties = newProperties;
    if (delta) {
      this._onPropertiesChanged.fire(delta);
    }
  }
  getId() {
    return this._id;
  }
  getModel() {
    return this._model;
  }
  getCodeEditor() {
    return this._codeEditor;
  }
  hasCodeEditor(codeEditor) {
    return this._codeEditor === codeEditor;
  }
  setCodeEditor(codeEditor) {
    if (this.hasCodeEditor(codeEditor)) {
      return;
    }
    this._codeEditorListeners.clear();
    this._codeEditor = codeEditor;
    if (this._codeEditor) {
      this._codeEditorListeners.add(this._codeEditor.onDidChangeModel(() => {
        this.setCodeEditor(null);
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidFocusEditorWidget(() => {
        this._focusTracker.onGainedFocus();
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidBlurEditorWidget(() => {
        this._focusTracker.onLostFocus();
      }));
      let nextSelectionChangeSource = null;
      this._codeEditorListeners.add(this._mainThreadDocuments.onIsCaughtUpWithContentChanges((uri) => {
        if (uri.toString() === this._model.uri.toString()) {
          const selectionChangeSource = nextSelectionChangeSource;
          nextSelectionChangeSource = null;
          this._updatePropertiesNow(selectionChangeSource);
        }
      }));
      const isValidCodeEditor = () => {
        return this._codeEditor && this._codeEditor.getModel() === this._model;
      };
      const updateProperties = (selectionChangeSource) => {
        if (this._mainThreadDocuments.isCaughtUpWithContentChanges(this._model.uri)) {
          nextSelectionChangeSource = null;
          this._updatePropertiesNow(selectionChangeSource);
        } else {
          nextSelectionChangeSource = selectionChangeSource;
        }
      };
      this._codeEditorListeners.add(this._codeEditor.onDidChangeCursorSelection((e) => {
        if (!isValidCodeEditor()) {
          return;
        }
        updateProperties(e.source);
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidChangeConfiguration((e) => {
        if (!isValidCodeEditor()) {
          return;
        }
        updateProperties(null);
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidLayoutChange(() => {
        if (!isValidCodeEditor()) {
          return;
        }
        updateProperties(null);
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidScrollChange(() => {
        if (!isValidCodeEditor()) {
          return;
        }
        updateProperties(null);
      }));
      this._updatePropertiesNow(null);
    }
  }
  isVisible() {
    return !!this._codeEditor;
  }
  getProperties() {
    return this._properties;
  }
  get onPropertiesChanged() {
    return this._onPropertiesChanged.event;
  }
  setSelections(selections) {
    if (this._codeEditor) {
      this._codeEditor.setSelections(selections);
      return;
    }
    const newSelections = selections.map(Selection.liftSelection);
    this._setProperties(
      new MainThreadTextEditorProperties(newSelections, this._properties.options, this._properties.visibleRanges),
      null
    );
  }
  _setIndentConfiguration(newConfiguration) {
    const creationOpts = this._modelService.getCreationOptions(this._model.getLanguageId(), this._model.uri, this._model.isForSimpleWidget);
    if (newConfiguration.tabSize === "auto" || newConfiguration.insertSpaces === "auto") {
      let insertSpaces = creationOpts.insertSpaces;
      let tabSize = creationOpts.tabSize;
      if (newConfiguration.insertSpaces !== "auto" && typeof newConfiguration.insertSpaces !== "undefined") {
        insertSpaces = newConfiguration.insertSpaces;
      }
      if (newConfiguration.tabSize !== "auto" && typeof newConfiguration.tabSize !== "undefined") {
        tabSize = newConfiguration.tabSize;
      }
      this._model.detectIndentation(insertSpaces, tabSize);
      return;
    }
    const newOpts = {};
    if (typeof newConfiguration.insertSpaces !== "undefined") {
      newOpts.insertSpaces = newConfiguration.insertSpaces;
    }
    if (typeof newConfiguration.tabSize !== "undefined") {
      newOpts.tabSize = newConfiguration.tabSize;
    }
    if (typeof newConfiguration.indentSize !== "undefined") {
      newOpts.indentSize = newConfiguration.indentSize;
    }
    this._model.updateOptions(newOpts);
  }
  setConfiguration(newConfiguration) {
    this._setIndentConfiguration(newConfiguration);
    if (!this._codeEditor) {
      return;
    }
    if (newConfiguration.cursorStyle) {
      const newCursorStyle = cursorStyleToString(newConfiguration.cursorStyle);
      this._codeEditor.updateOptions({
        cursorStyle: newCursorStyle
      });
    }
    if (typeof newConfiguration.lineNumbers !== "undefined") {
      let lineNumbers;
      switch (newConfiguration.lineNumbers) {
        case RenderLineNumbersType.On:
          lineNumbers = "on";
          break;
        case RenderLineNumbersType.Relative:
          lineNumbers = "relative";
          break;
        case RenderLineNumbersType.Interval:
          lineNumbers = "interval";
          break;
        default:
          lineNumbers = "off";
      }
      this._codeEditor.updateOptions({
        lineNumbers
      });
    }
  }
  setDecorations(key, ranges) {
    if (!this._codeEditor) {
      return;
    }
    this._codeEditor.setDecorationsByType("exthost-api", key, ranges);
  }
  setDecorationsFast(key, _ranges) {
    if (!this._codeEditor) {
      return;
    }
    const ranges = [];
    for (let i = 0, len = Math.floor(_ranges.length / 4); i < len; i++) {
      ranges[i] = new Range(_ranges[4 * i], _ranges[4 * i + 1], _ranges[4 * i + 2], _ranges[4 * i + 3]);
    }
    this._codeEditor.setDecorationsByTypeFast(key, ranges);
  }
  revealRange(range, revealType) {
    if (!this._codeEditor) {
      return;
    }
    switch (revealType) {
      case TextEditorRevealType.Default:
        this._codeEditor.revealRange(range, ScrollType.Smooth);
        break;
      case TextEditorRevealType.InCenter:
        this._codeEditor.revealRangeInCenter(range, ScrollType.Smooth);
        break;
      case TextEditorRevealType.InCenterIfOutsideViewport:
        this._codeEditor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
        break;
      case TextEditorRevealType.AtTop:
        this._codeEditor.revealRangeAtTop(range, ScrollType.Smooth);
        break;
      default:
        console.warn(`Unknown revealType: ${revealType}`);
        break;
    }
  }
  isFocused() {
    if (this._codeEditor) {
      return this._codeEditor.hasTextFocus();
    }
    return false;
  }
  matches(editor) {
    if (!editor) {
      return false;
    }
    return editor.getControl() === this._codeEditor;
  }
  applyEdits(versionIdCheck, edits, opts) {
    if (this._model.getVersionId() !== versionIdCheck) {
      return false;
    }
    if (!this._codeEditor) {
      return false;
    }
    if (typeof opts.setEndOfLine !== "undefined") {
      this._model.pushEOL(opts.setEndOfLine);
    }
    const transformedEdits = edits.map((edit) => {
      return {
        range: Range.lift(edit.range),
        text: edit.text,
        forceMoveMarkers: edit.forceMoveMarkers
      };
    });
    if (opts.undoStopBefore) {
      this._codeEditor.pushUndoStop();
    }
    this._codeEditor.executeEdits("MainThreadTextEditor", transformedEdits);
    if (opts.undoStopAfter) {
      this._codeEditor.pushUndoStop();
    }
    return true;
  }
  async insertSnippet(modelVersionId, template, ranges, opts) {
    if (!this._codeEditor || !this._codeEditor.hasModel()) {
      return false;
    }
    let clipboardText;
    const needsTemplate = SnippetParser.guessNeedsClipboard(template);
    if (needsTemplate) {
      const state = new EditorState(this._codeEditor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);
      clipboardText = await this._clipboardService.readText();
      if (!state.validate(this._codeEditor)) {
        return false;
      }
    }
    if (this._codeEditor.getModel().getVersionId() !== modelVersionId) {
      return false;
    }
    const snippetController = SnippetController2.get(this._codeEditor);
    if (!snippetController) {
      return false;
    }
    this._codeEditor.focus();
    const edits = ranges.map((range) => ({ range: Range.lift(range), template }));
    snippetController.apply(edits, {
      overwriteBefore: 0,
      overwriteAfter: 0,
      undoStopBefore: opts.undoStopBefore,
      undoStopAfter: opts.undoStopAfter,
      adjustWhitespace: !opts.keepWhitespace,
      clipboardText
    });
    return true;
  }
}
export {
  MainThreadTextEditor,
  MainThreadTextEditorProperties
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZEVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBSZW5kZXJMaW5lTnVtYmVyc1R5cGUsIFRleHRFZGl0b3JDdXJzb3JTdHlsZSwgY3Vyc29yU3R5bGVUb1N0cmluZywgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24sIFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25PcHRpb25zLCBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgSVRleHRNb2RlbFVwZGF0ZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRDb250cm9sbGVyMi5qcyc7XG5pbXBvcnQgeyBJQXBwbHlFZGl0c09wdGlvbnMsIElFZGl0b3JQcm9wZXJ0aWVzQ2hhbmdlRGF0YSwgSVJlc29sdmVkVGV4dEVkaXRvckNvbmZpZ3VyYXRpb24sIElTbmlwcGV0T3B0aW9ucywgSVRleHRFZGl0b3JDb25maWd1cmF0aW9uVXBkYXRlLCBUZXh0RWRpdG9yUmV2ZWFsVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvclN0YXRlRmxhZywgRWRpdG9yU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29udHJpYi9lZGl0b3JTdGF0ZS9icm93c2VyL2VkaXRvclN0YXRlLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNuaXBwZXRQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldFBhcnNlci5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkRG9jdW1lbnRzIH0gZnJvbSAnLi9tYWluVGhyZWFkRG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IElTbmlwcGV0RWRpdCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0U2Vzc2lvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZvY3VzVHJhY2tlciB7XG5cdG9uR2FpbmVkRm9jdXMoKTogdm9pZDtcblx0b25Mb3N0Rm9jdXMoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcyB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkRnJvbUVkaXRvcihwcmV2aW91c1Byb3BlcnRpZXM6IE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcyB8IG51bGwsIG1vZGVsOiBJVGV4dE1vZGVsLCBjb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwpOiBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMuX3JlYWRTZWxlY3Rpb25zRnJvbUNvZGVFZGl0b3IocHJldmlvdXNQcm9wZXJ0aWVzLCBjb2RlRWRpdG9yKTtcblx0XHRjb25zdCBvcHRpb25zID0gTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzLl9yZWFkT3B0aW9uc0Zyb21Db2RlRWRpdG9yKHByZXZpb3VzUHJvcGVydGllcywgbW9kZWwsIGNvZGVFZGl0b3IpO1xuXHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMuX3JlYWRWaXNpYmxlUmFuZ2VzRnJvbUNvZGVFZGl0b3IocHJldmlvdXNQcm9wZXJ0aWVzLCBjb2RlRWRpdG9yKTtcblx0XHRyZXR1cm4gbmV3IE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcyhzZWxlY3Rpb25zLCBvcHRpb25zLCB2aXNpYmxlUmFuZ2VzKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZWFkU2VsZWN0aW9uc0Zyb21Db2RlRWRpdG9yKHByZXZpb3VzUHJvcGVydGllczogTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzIHwgbnVsbCwgY29kZUVkaXRvcjogSUNvZGVFZGl0b3IgfCBudWxsKTogU2VsZWN0aW9uW10ge1xuXHRcdGxldCByZXN1bHQ6IFNlbGVjdGlvbltdIHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKGNvZGVFZGl0b3IpIHtcblx0XHRcdHJlc3VsdCA9IGNvZGVFZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdH1cblx0XHRpZiAoIXJlc3VsdCAmJiBwcmV2aW91c1Byb3BlcnRpZXMpIHtcblx0XHRcdHJlc3VsdCA9IHByZXZpb3VzUHJvcGVydGllcy5zZWxlY3Rpb25zO1xuXHRcdH1cblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmVzdWx0ID0gW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlYWRPcHRpb25zRnJvbUNvZGVFZGl0b3IocHJldmlvdXNQcm9wZXJ0aWVzOiBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMgfCBudWxsLCBtb2RlbDogSVRleHRNb2RlbCwgY29kZUVkaXRvcjogSUNvZGVFZGl0b3IgfCBudWxsKTogSVJlc29sdmVkVGV4dEVkaXRvckNvbmZpZ3VyYXRpb24ge1xuXHRcdGlmIChtb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdGlmIChwcmV2aW91c1Byb3BlcnRpZXMpIHtcblx0XHRcdFx0Ly8gc2h1dGRvd24gdGltZVxuXHRcdFx0XHRyZXR1cm4gcHJldmlvdXNQcm9wZXJ0aWVzLm9wdGlvbnM7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHZhbGlkIHByb3BlcnRpZXMnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgY3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZTtcblx0XHRsZXQgbGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZTtcblx0XHRpZiAoY29kZUVkaXRvcikge1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGNvZGVFZGl0b3IuZ2V0T3B0aW9ucygpO1xuXHRcdFx0Y29uc3QgbGluZU51bWJlcnNPcHRzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzKTtcblx0XHRcdGN1cnNvclN0eWxlID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmN1cnNvclN0eWxlKTtcblx0XHRcdGxpbmVOdW1iZXJzID0gbGluZU51bWJlcnNPcHRzLnJlbmRlclR5cGU7XG5cdFx0fSBlbHNlIGlmIChwcmV2aW91c1Byb3BlcnRpZXMpIHtcblx0XHRcdGN1cnNvclN0eWxlID0gcHJldmlvdXNQcm9wZXJ0aWVzLm9wdGlvbnMuY3Vyc29yU3R5bGU7XG5cdFx0XHRsaW5lTnVtYmVycyA9IHByZXZpb3VzUHJvcGVydGllcy5vcHRpb25zLmxpbmVOdW1iZXJzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXJzb3JTdHlsZSA9IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lO1xuXHRcdFx0bGluZU51bWJlcnMgPSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT247XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxPcHRpb25zID0gbW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnNlcnRTcGFjZXM6IG1vZGVsT3B0aW9ucy5pbnNlcnRTcGFjZXMsXG5cdFx0XHR0YWJTaXplOiBtb2RlbE9wdGlvbnMudGFiU2l6ZSxcblx0XHRcdGluZGVudFNpemU6IG1vZGVsT3B0aW9ucy5pbmRlbnRTaXplLFxuXHRcdFx0b3JpZ2luYWxJbmRlbnRTaXplOiBtb2RlbE9wdGlvbnMub3JpZ2luYWxJbmRlbnRTaXplLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IGN1cnNvclN0eWxlLFxuXHRcdFx0bGluZU51bWJlcnM6IGxpbmVOdW1iZXJzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZWFkVmlzaWJsZVJhbmdlc0Zyb21Db2RlRWRpdG9yKHByZXZpb3VzUHJvcGVydGllczogTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzIHwgbnVsbCwgY29kZUVkaXRvcjogSUNvZGVFZGl0b3IgfCBudWxsKTogUmFuZ2VbXSB7XG5cdFx0aWYgKGNvZGVFZGl0b3IpIHtcblx0XHRcdHJldHVybiBjb2RlRWRpdG9yLmdldFZpc2libGVSYW5nZXMoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLFxuXHRcdHB1YmxpYyByZWFkb25seSBvcHRpb25zOiBJUmVzb2x2ZWRUZXh0RWRpdG9yQ29uZmlndXJhdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmlzaWJsZVJhbmdlczogUmFuZ2VbXVxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBnZW5lcmF0ZURlbHRhKG9sZFByb3BzOiBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMgfCBudWxsLCBzZWxlY3Rpb25DaGFuZ2VTb3VyY2U6IHN0cmluZyB8IG51bGwpOiBJRWRpdG9yUHJvcGVydGllc0NoYW5nZURhdGEgfCBudWxsIHtcblx0XHRjb25zdCBkZWx0YTogSUVkaXRvclByb3BlcnRpZXNDaGFuZ2VEYXRhID0ge1xuXHRcdFx0b3B0aW9uczogbnVsbCxcblx0XHRcdHNlbGVjdGlvbnM6IG51bGwsXG5cdFx0XHR2aXNpYmxlUmFuZ2VzOiBudWxsXG5cdFx0fTtcblxuXHRcdGlmICghb2xkUHJvcHMgfHwgIU1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcy5fc2VsZWN0aW9uc0VxdWFsKG9sZFByb3BzLnNlbGVjdGlvbnMsIHRoaXMuc2VsZWN0aW9ucykpIHtcblx0XHRcdGRlbHRhLnNlbGVjdGlvbnMgPSB7XG5cdFx0XHRcdHNlbGVjdGlvbnM6IHRoaXMuc2VsZWN0aW9ucyxcblx0XHRcdFx0c291cmNlOiBzZWxlY3Rpb25DaGFuZ2VTb3VyY2UgPz8gdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoIW9sZFByb3BzIHx8ICFNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMuX29wdGlvbnNFcXVhbChvbGRQcm9wcy5vcHRpb25zLCB0aGlzLm9wdGlvbnMpKSB7XG5cdFx0XHRkZWx0YS5vcHRpb25zID0gdGhpcy5vcHRpb25zO1xuXHRcdH1cblxuXHRcdGlmICghb2xkUHJvcHMgfHwgIU1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcy5fcmFuZ2VzRXF1YWwob2xkUHJvcHMudmlzaWJsZVJhbmdlcywgdGhpcy52aXNpYmxlUmFuZ2VzKSkge1xuXHRcdFx0ZGVsdGEudmlzaWJsZVJhbmdlcyA9IHRoaXMudmlzaWJsZVJhbmdlcztcblx0XHR9XG5cblx0XHRpZiAoZGVsdGEuc2VsZWN0aW9ucyB8fCBkZWx0YS5vcHRpb25zIHx8IGRlbHRhLnZpc2libGVSYW5nZXMpIHtcblx0XHRcdC8vIHNvbWV0aGluZyBjaGFuZ2VkXG5cdFx0XHRyZXR1cm4gZGVsdGE7XG5cdFx0fVxuXHRcdC8vIG5vdGhpbmcgY2hhbmdlZFxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NlbGVjdGlvbnNFcXVhbChhOiByZWFkb25seSBTZWxlY3Rpb25bXSwgYjogcmVhZG9ubHkgU2VsZWN0aW9uW10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZXF1YWxzKGEsIGIsIChhVmFsdWUsIGJWYWx1ZSkgPT4gYVZhbHVlLmVxdWFsc1NlbGVjdGlvbihiVmFsdWUpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yYW5nZXNFcXVhbChhOiByZWFkb25seSBSYW5nZVtdLCBiOiByZWFkb25seSBSYW5nZVtdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVxdWFscyhhLCBiLCAoYVZhbHVlLCBiVmFsdWUpID0+IGFWYWx1ZS5lcXVhbHNSYW5nZShiVmFsdWUpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9vcHRpb25zRXF1YWwoYTogSVJlc29sdmVkVGV4dEVkaXRvckNvbmZpZ3VyYXRpb24sIGI6IElSZXNvbHZlZFRleHRFZGl0b3JDb25maWd1cmF0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKGEgJiYgIWIgfHwgIWEgJiYgYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWEgJiYgIWIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gKFxuXHRcdFx0YS50YWJTaXplID09PSBiLnRhYlNpemVcblx0XHRcdCYmIGEuaW5kZW50U2l6ZSA9PT0gYi5pbmRlbnRTaXplXG5cdFx0XHQmJiBhLmluc2VydFNwYWNlcyA9PT0gYi5pbnNlcnRTcGFjZXNcblx0XHRcdCYmIGEuY3Vyc29yU3R5bGUgPT09IGIuY3Vyc29yU3R5bGVcblx0XHRcdCYmIGEubGluZU51bWJlcnMgPT09IGIubGluZU51bWJlcnNcblx0XHQpO1xuXHR9XG59XG5cbi8qKlxuICogVGV4dCBFZGl0b3IgdGhhdCBpcyBwZXJtYW5lbnRseSBib3VuZCB0byB0aGUgc2FtZSBtb2RlbC5cbiAqIEl0IGNhbiBiZSBib3VuZCBvciBub3QgdG8gYSBDb2RlRWRpdG9yLlxuICovXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFRleHRFZGl0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYWluVGhyZWFkRG9jdW1lbnRzOiBNYWluVGhyZWFkRG9jdW1lbnRzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbExpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfY29kZUVkaXRvcjogSUNvZGVFZGl0b3IgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c1RyYWNrZXI6IElGb2N1c1RyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JMaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSBfcHJvcGVydGllczogTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9wZXJ0aWVzQ2hhbmdlZDogRW1pdHRlcjxJRWRpdG9yUHJvcGVydGllc0NoYW5nZURhdGE+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0Y29kZUVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0Zm9jdXNUcmFja2VyOiBJRm9jdXNUcmFja2VyLFxuXHRcdG1haW5UaHJlYWREb2N1bWVudHM6IE1haW5UaHJlYWREb2N1bWVudHMsXG5cdFx0bW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9pZCA9IGlkO1xuXHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fY29kZUVkaXRvciA9IG51bGw7XG5cdFx0dGhpcy5fcHJvcGVydGllcyA9IG51bGw7XG5cdFx0dGhpcy5fZm9jdXNUcmFja2VyID0gZm9jdXNUcmFja2VyO1xuXHRcdHRoaXMuX21haW5UaHJlYWREb2N1bWVudHMgPSBtYWluVGhyZWFkRG9jdW1lbnRzO1xuXHRcdHRoaXMuX21vZGVsU2VydmljZSA9IG1vZGVsU2VydmljZTtcblx0XHR0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlID0gY2xpcGJvYXJkU2VydmljZTtcblxuXHRcdHRoaXMuX29uUHJvcGVydGllc0NoYW5nZWQgPSBuZXcgRW1pdHRlcjxJRWRpdG9yUHJvcGVydGllc0NoYW5nZURhdGE+KCk7XG5cblx0XHR0aGlzLl9tb2RlbExpc3RlbmVycy5hZGQodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VPcHRpb25zKChlKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVQcm9wZXJ0aWVzTm93KG51bGwpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2V0Q29kZUVkaXRvcihjb2RlRWRpdG9yKTtcblx0XHR0aGlzLl91cGRhdGVQcm9wZXJ0aWVzTm93KG51bGwpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxMaXN0ZW5lcnMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uUHJvcGVydGllc0NoYW5nZWQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3IgPSBudWxsO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JMaXN0ZW5lcnMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUHJvcGVydGllc05vdyhzZWxlY3Rpb25DaGFuZ2VTb3VyY2U6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRQcm9wZXJ0aWVzKFxuXHRcdFx0TWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzLnJlYWRGcm9tRWRpdG9yKHRoaXMuX3Byb3BlcnRpZXMsIHRoaXMuX21vZGVsLCB0aGlzLl9jb2RlRWRpdG9yKSxcblx0XHRcdHNlbGVjdGlvbkNoYW5nZVNvdXJjZVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRQcm9wZXJ0aWVzKG5ld1Byb3BlcnRpZXM6IE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcywgc2VsZWN0aW9uQ2hhbmdlU291cmNlOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVsdGEgPSBuZXdQcm9wZXJ0aWVzLmdlbmVyYXRlRGVsdGEodGhpcy5fcHJvcGVydGllcywgc2VsZWN0aW9uQ2hhbmdlU291cmNlKTtcblx0XHR0aGlzLl9wcm9wZXJ0aWVzID0gbmV3UHJvcGVydGllcztcblx0XHRpZiAoZGVsdGEpIHtcblx0XHRcdHRoaXMuX29uUHJvcGVydGllc0NoYW5nZWQuZmlyZShkZWx0YSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHR9XG5cblx0cHVibGljIGdldE1vZGVsKCk6IElUZXh0TW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb2RlRWRpdG9yKCk6IElDb2RlRWRpdG9yIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvZGVFZGl0b3I7XG5cdH1cblxuXHRwdWJsaWMgaGFzQ29kZUVkaXRvcihjb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX2NvZGVFZGl0b3IgPT09IGNvZGVFZGl0b3IpO1xuXHR9XG5cblx0cHVibGljIHNldENvZGVFZGl0b3IoY29kZUVkaXRvcjogSUNvZGVFZGl0b3IgfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGFzQ29kZUVkaXRvcihjb2RlRWRpdG9yKSkge1xuXHRcdFx0Ly8gTm90aGluZyB0byBkby4uLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb2RlRWRpdG9yTGlzdGVuZXJzLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yID0gY29kZUVkaXRvcjtcblx0XHRpZiAodGhpcy5fY29kZUVkaXRvcikge1xuXG5cdFx0XHQvLyBDYXRjaCBlYXJseSB0aGUgY2FzZSB0aGF0IHRoaXMgY29kZSBlZGl0b3IgZ2V0cyBhIGRpZmZlcmVudCBtb2RlbCBzZXQgYW5kIGRpc2Fzc29jaWF0ZSBmcm9tIHRoaXMgbW9kZWxcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JMaXN0ZW5lcnMuYWRkKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2V0Q29kZUVkaXRvcihudWxsKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fY29kZUVkaXRvckxpc3RlbmVycy5hZGQodGhpcy5fY29kZUVkaXRvci5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fZm9jdXNUcmFja2VyLm9uR2FpbmVkRm9jdXMoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JMaXN0ZW5lcnMuYWRkKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fZm9jdXNUcmFja2VyLm9uTG9zdEZvY3VzKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGxldCBuZXh0U2VsZWN0aW9uQ2hhbmdlU291cmNlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JMaXN0ZW5lcnMuYWRkKHRoaXMuX21haW5UaHJlYWREb2N1bWVudHMub25Jc0NhdWdodFVwV2l0aENvbnRlbnRDaGFuZ2VzKCh1cmkpID0+IHtcblx0XHRcdFx0aWYgKHVyaS50b1N0cmluZygpID09PSB0aGlzLl9tb2RlbC51cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbkNoYW5nZVNvdXJjZSA9IG5leHRTZWxlY3Rpb25DaGFuZ2VTb3VyY2U7XG5cdFx0XHRcdFx0bmV4dFNlbGVjdGlvbkNoYW5nZVNvdXJjZSA9IG51bGw7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlUHJvcGVydGllc05vdyhzZWxlY3Rpb25DaGFuZ2VTb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGlzVmFsaWRDb2RlRWRpdG9yID0gKCkgPT4ge1xuXHRcdFx0XHQvLyBEdWUgdG8gZXZlbnQgdGltaW5ncywgaXQgaXMgcG9zc2libGUgdGhhdCB0aGVyZSBpcyBhIG1vZGVsIGNoYW5nZSBldmVudCBub3QgeWV0IGRlbGl2ZXJlZCB0byB1cy5cblx0XHRcdFx0Ly8gPiBlLmcuIGEgbW9kZWwgY2hhbmdlIGV2ZW50IGlzIGVtaXR0ZWQgdG8gYSBsaXN0ZW5lciB3aGljaCB0aGVuIGRlY2lkZXMgdG8gdXBkYXRlIGVkaXRvciBvcHRpb25zXG5cdFx0XHRcdC8vID4gSW4gdGhpcyBjYXNlIHRoZSBlZGl0b3IgY29uZmlndXJhdGlvbiBjaGFuZ2UgZXZlbnQgcmVhY2hlcyB1cyBmaXJzdC5cblx0XHRcdFx0Ly8gU28gc2ltcGx5IGNoZWNrIHRoYXQgdGhlIG1vZGVsIGlzIHN0aWxsIGF0dGFjaGVkIHRvIHRoaXMgY29kZSBlZGl0b3Jcblx0XHRcdFx0cmV0dXJuICh0aGlzLl9jb2RlRWRpdG9yICYmIHRoaXMuX2NvZGVFZGl0b3IuZ2V0TW9kZWwoKSA9PT0gdGhpcy5fbW9kZWwpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlUHJvcGVydGllcyA9IChzZWxlY3Rpb25DaGFuZ2VTb3VyY2U6IHN0cmluZyB8IG51bGwpID0+IHtcblx0XHRcdFx0Ly8gU29tZSBlZGl0b3IgZXZlbnRzIGdldCBkZWxpdmVyZWQgZmFzdGVyIHRoYW4gbW9kZWwgY29udGVudCBjaGFuZ2VzLiBUaGlzIGlzXG5cdFx0XHRcdC8vIHByb2JsZW1hdGljLCBhcyB0aGlzIGxlYWRzIHRvIGVkaXRvciBwcm9wZXJ0aWVzIHJlYWNoaW5nIHRoZSBleHRlbnNpb24gaG9zdFxuXHRcdFx0XHQvLyB0b28gc29vbiwgYmVmb3JlIHRoZSBtb2RlbCBjb250ZW50IGNoYW5nZSB0aGF0IHdhcyB0aGUgcm9vdCBjYXVzZS5cblx0XHRcdFx0Ly9cblx0XHRcdFx0Ly8gSWYgdGhpcyBjYXNlIGlzIGlkZW50aWZpZWQsIHRoZW4gbGV0J3MgdXBkYXRlIGVkaXRvciBwcm9wZXJ0aWVzIG9uIHRoZSBuZXh0IG1vZGVsXG5cdFx0XHRcdC8vIGNvbnRlbnQgY2hhbmdlIGluc3RlYWQuXG5cdFx0XHRcdGlmICh0aGlzLl9tYWluVGhyZWFkRG9jdW1lbnRzLmlzQ2F1Z2h0VXBXaXRoQ29udGVudENoYW5nZXModGhpcy5fbW9kZWwudXJpKSkge1xuXHRcdFx0XHRcdG5leHRTZWxlY3Rpb25DaGFuZ2VTb3VyY2UgPSBudWxsO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVByb3BlcnRpZXNOb3coc2VsZWN0aW9uQ2hhbmdlU291cmNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB1cGRhdGUgZWRpdG9yIHByb3BlcnRpZXMgb24gdGhlIG5leHQgbW9kZWwgY29udGVudCBjaGFuZ2Vcblx0XHRcdFx0XHRuZXh0U2VsZWN0aW9uQ2hhbmdlU291cmNlID0gc2VsZWN0aW9uQ2hhbmdlU291cmNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yTGlzdGVuZXJzLmFkZCh0aGlzLl9jb2RlRWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKChlKSA9PiB7XG5cdFx0XHRcdC8vIHNlbGVjdGlvblxuXHRcdFx0XHRpZiAoIWlzVmFsaWRDb2RlRWRpdG9yKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dXBkYXRlUHJvcGVydGllcyhlLnNvdXJjZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yTGlzdGVuZXJzLmFkZCh0aGlzLl9jb2RlRWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0XHQvLyBvcHRpb25zXG5cdFx0XHRcdGlmICghaXNWYWxpZENvZGVFZGl0b3IoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR1cGRhdGVQcm9wZXJ0aWVzKG51bGwpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvckxpc3RlbmVycy5hZGQodGhpcy5fY29kZUVkaXRvci5vbkRpZExheW91dENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdC8vIHZpc2libGVSYW5nZXNcblx0XHRcdFx0aWYgKCFpc1ZhbGlkQ29kZUVkaXRvcigpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVwZGF0ZVByb3BlcnRpZXMobnVsbCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yTGlzdGVuZXJzLmFkZCh0aGlzLl9jb2RlRWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0Ly8gdmlzaWJsZVJhbmdlc1xuXHRcdFx0XHRpZiAoIWlzVmFsaWRDb2RlRWRpdG9yKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dXBkYXRlUHJvcGVydGllcyhudWxsKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVByb3BlcnRpZXNOb3cobnVsbCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9jb2RlRWRpdG9yO1xuXHR9XG5cblx0cHVibGljIGdldFByb3BlcnRpZXMoKTogTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvcGVydGllcyE7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uUHJvcGVydGllc0NoYW5nZWQoKTogRXZlbnQ8SUVkaXRvclByb3BlcnRpZXNDaGFuZ2VEYXRhPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uUHJvcGVydGllc0NoYW5nZWQuZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zOiBJU2VsZWN0aW9uW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29kZUVkaXRvcikge1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvci5zZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1NlbGVjdGlvbnMgPSBzZWxlY3Rpb25zLm1hcChTZWxlY3Rpb24ubGlmdFNlbGVjdGlvbik7XG5cdFx0dGhpcy5fc2V0UHJvcGVydGllcyhcblx0XHRcdG5ldyBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMobmV3U2VsZWN0aW9ucywgdGhpcy5fcHJvcGVydGllcyEub3B0aW9ucywgdGhpcy5fcHJvcGVydGllcyEudmlzaWJsZVJhbmdlcyksXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEluZGVudENvbmZpZ3VyYXRpb24obmV3Q29uZmlndXJhdGlvbjogSVRleHRFZGl0b3JDb25maWd1cmF0aW9uVXBkYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgY3JlYXRpb25PcHRzID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldENyZWF0aW9uT3B0aW9ucyh0aGlzLl9tb2RlbC5nZXRMYW5ndWFnZUlkKCksIHRoaXMuX21vZGVsLnVyaSwgdGhpcy5fbW9kZWwuaXNGb3JTaW1wbGVXaWRnZXQpO1xuXG5cdFx0aWYgKG5ld0NvbmZpZ3VyYXRpb24udGFiU2l6ZSA9PT0gJ2F1dG8nIHx8IG5ld0NvbmZpZ3VyYXRpb24uaW5zZXJ0U3BhY2VzID09PSAnYXV0bycpIHtcblx0XHRcdC8vIG9uZSBvZiB0aGUgb3B0aW9ucyB3YXMgc2V0IHRvICdhdXRvJyA9PiBkZXRlY3QgaW5kZW50YXRpb25cblx0XHRcdGxldCBpbnNlcnRTcGFjZXMgPSBjcmVhdGlvbk9wdHMuaW5zZXJ0U3BhY2VzO1xuXHRcdFx0bGV0IHRhYlNpemUgPSBjcmVhdGlvbk9wdHMudGFiU2l6ZTtcblxuXHRcdFx0aWYgKG5ld0NvbmZpZ3VyYXRpb24uaW5zZXJ0U3BhY2VzICE9PSAnYXV0bycgJiYgdHlwZW9mIG5ld0NvbmZpZ3VyYXRpb24uaW5zZXJ0U3BhY2VzICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRpbnNlcnRTcGFjZXMgPSBuZXdDb25maWd1cmF0aW9uLmluc2VydFNwYWNlcztcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5ld0NvbmZpZ3VyYXRpb24udGFiU2l6ZSAhPT0gJ2F1dG8nICYmIHR5cGVvZiBuZXdDb25maWd1cmF0aW9uLnRhYlNpemUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdHRhYlNpemUgPSBuZXdDb25maWd1cmF0aW9uLnRhYlNpemU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX21vZGVsLmRldGVjdEluZGVudGF0aW9uKGluc2VydFNwYWNlcywgdGFiU2l6ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3T3B0czogSVRleHRNb2RlbFVwZGF0ZU9wdGlvbnMgPSB7fTtcblx0XHRpZiAodHlwZW9mIG5ld0NvbmZpZ3VyYXRpb24uaW5zZXJ0U3BhY2VzICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0bmV3T3B0cy5pbnNlcnRTcGFjZXMgPSBuZXdDb25maWd1cmF0aW9uLmluc2VydFNwYWNlcztcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdDb25maWd1cmF0aW9uLnRhYlNpemUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRuZXdPcHRzLnRhYlNpemUgPSBuZXdDb25maWd1cmF0aW9uLnRhYlNpemU7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbmV3Q29uZmlndXJhdGlvbi5pbmRlbnRTaXplICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0bmV3T3B0cy5pbmRlbnRTaXplID0gbmV3Q29uZmlndXJhdGlvbi5pbmRlbnRTaXplO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbC51cGRhdGVPcHRpb25zKG5ld09wdHMpO1xuXHR9XG5cblx0cHVibGljIHNldENvbmZpZ3VyYXRpb24obmV3Q29uZmlndXJhdGlvbjogSVRleHRFZGl0b3JDb25maWd1cmF0aW9uVXBkYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0SW5kZW50Q29uZmlndXJhdGlvbihuZXdDb25maWd1cmF0aW9uKTtcblxuXHRcdGlmICghdGhpcy5fY29kZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChuZXdDb25maWd1cmF0aW9uLmN1cnNvclN0eWxlKSB7XG5cdFx0XHRjb25zdCBuZXdDdXJzb3JTdHlsZSA9IGN1cnNvclN0eWxlVG9TdHJpbmcobmV3Q29uZmlndXJhdGlvbi5jdXJzb3JTdHlsZSk7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRjdXJzb3JTdHlsZTogbmV3Q3Vyc29yU3R5bGVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbmV3Q29uZmlndXJhdGlvbi5saW5lTnVtYmVycyAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGxldCBsaW5lTnVtYmVyczogJ29uJyB8ICdvZmYnIHwgJ3JlbGF0aXZlJyB8ICdpbnRlcnZhbCc7XG5cdFx0XHRzd2l0Y2ggKG5ld0NvbmZpZ3VyYXRpb24ubGluZU51bWJlcnMpIHtcblx0XHRcdFx0Y2FzZSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT246XG5cdFx0XHRcdFx0bGluZU51bWJlcnMgPSAnb24nO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFJlbmRlckxpbmVOdW1iZXJzVHlwZS5SZWxhdGl2ZTpcblx0XHRcdFx0XHRsaW5lTnVtYmVycyA9ICdyZWxhdGl2ZSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUmVuZGVyTGluZU51bWJlcnNUeXBlLkludGVydmFsOlxuXHRcdFx0XHRcdGxpbmVOdW1iZXJzID0gJ2ludGVydmFsJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRsaW5lTnVtYmVycyA9ICdvZmYnO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29kZUVkaXRvci51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0bGluZU51bWJlcnM6IGxpbmVOdW1iZXJzXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0RGVjb3JhdGlvbnMoa2V5OiBzdHJpbmcsIHJhbmdlczogSURlY29yYXRpb25PcHRpb25zW10pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvZGVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29kZUVkaXRvci5zZXREZWNvcmF0aW9uc0J5VHlwZSgnZXh0aG9zdC1hcGknLCBrZXksIHJhbmdlcyk7XG5cdH1cblxuXHRwdWJsaWMgc2V0RGVjb3JhdGlvbnNGYXN0KGtleTogc3RyaW5nLCBfcmFuZ2VzOiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29kZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gTWF0aC5mbG9vcihfcmFuZ2VzLmxlbmd0aCAvIDQpOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHJhbmdlc1tpXSA9IG5ldyBSYW5nZShfcmFuZ2VzWzQgKiBpXSwgX3Jhbmdlc1s0ICogaSArIDFdLCBfcmFuZ2VzWzQgKiBpICsgMl0sIF9yYW5nZXNbNCAqIGkgKyAzXSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvZGVFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGVGYXN0KGtleSwgcmFuZ2VzKTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxSYW5nZShyYW5nZTogSVJhbmdlLCByZXZlYWxUeXBlOiBUZXh0RWRpdG9yUmV2ZWFsVHlwZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29kZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzd2l0Y2ggKHJldmVhbFR5cGUpIHtcblx0XHRcdGNhc2UgVGV4dEVkaXRvclJldmVhbFR5cGUuRGVmYXVsdDpcblx0XHRcdFx0dGhpcy5fY29kZUVkaXRvci5yZXZlYWxSYW5nZShyYW5nZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVGV4dEVkaXRvclJldmVhbFR5cGUuSW5DZW50ZXI6XG5cdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlcihyYW5nZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVGV4dEVkaXRvclJldmVhbFR5cGUuSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydDpcblx0XHRcdFx0dGhpcy5fY29kZUVkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocmFuZ2UsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFRleHRFZGl0b3JSZXZlYWxUeXBlLkF0VG9wOlxuXHRcdFx0XHR0aGlzLl9jb2RlRWRpdG9yLnJldmVhbFJhbmdlQXRUb3AocmFuZ2UsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRjb25zb2xlLndhcm4oYFVua25vd24gcmV2ZWFsVHlwZTogJHtyZXZlYWxUeXBlfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9jb2RlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29kZUVkaXRvci5oYXNUZXh0Rm9jdXMoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIG1hdGNoZXMoZWRpdG9yOiBJRWRpdG9yUGFuZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJvbCgpID09PSB0aGlzLl9jb2RlRWRpdG9yO1xuXHR9XG5cblx0cHVibGljIGFwcGx5RWRpdHModmVyc2lvbklkQ2hlY2s6IG51bWJlciwgZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10sIG9wdHM6IElBcHBseUVkaXRzT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9tb2RlbC5nZXRWZXJzaW9uSWQoKSAhPT0gdmVyc2lvbklkQ2hlY2spIHtcblx0XHRcdC8vIHRocm93IG5ldyBFcnJvcignTW9kZWwgaGFzIGNoYW5nZWQgaW4gdGhlIG1lYW50aW1lIScpO1xuXHRcdFx0Ly8gbW9kZWwgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2NvZGVFZGl0b3IpIHtcblx0XHRcdC8vIGNvbnNvbGUud2FybignYXBwbHlFZGl0cyBvbiBpbnZpc2libGUgZWRpdG9yJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBvcHRzLnNldEVuZE9mTGluZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuX21vZGVsLnB1c2hFT0wob3B0cy5zZXRFbmRPZkxpbmUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyYW5zZm9ybWVkRWRpdHMgPSBlZGl0cy5tYXAoKGVkaXQpOiBJU2luZ2xlRWRpdE9wZXJhdGlvbiA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogUmFuZ2UubGlmdChlZGl0LnJhbmdlKSxcblx0XHRcdFx0dGV4dDogZWRpdC50ZXh0LFxuXHRcdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBlZGl0LmZvcmNlTW92ZU1hcmtlcnNcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRpZiAob3B0cy51bmRvU3RvcEJlZm9yZSkge1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHR9XG5cdFx0dGhpcy5fY29kZUVkaXRvci5leGVjdXRlRWRpdHMoJ01haW5UaHJlYWRUZXh0RWRpdG9yJywgdHJhbnNmb3JtZWRFZGl0cyk7XG5cdFx0aWYgKG9wdHMudW5kb1N0b3BBZnRlcikge1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBpbnNlcnRTbmlwcGV0KG1vZGVsVmVyc2lvbklkOiBudW1iZXIsIHRlbXBsYXRlOiBzdHJpbmcsIHJhbmdlczogcmVhZG9ubHkgSVJhbmdlW10sIG9wdHM6IElTbmlwcGV0T3B0aW9ucykge1xuXG5cdFx0aWYgKCF0aGlzLl9jb2RlRWRpdG9yIHx8ICF0aGlzLl9jb2RlRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBjaGVjayBpZiBjbGlwYm9hcmQgaXMgcmVxdWlyZWQgYW5kIG9ubHkgaWZmIHJlYWQgaXQgKGFzeW5jKVxuXHRcdGxldCBjbGlwYm9hcmRUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbmVlZHNUZW1wbGF0ZSA9IFNuaXBwZXRQYXJzZXIuZ3Vlc3NOZWVkc0NsaXBib2FyZCh0ZW1wbGF0ZSk7XG5cdFx0aWYgKG5lZWRzVGVtcGxhdGUpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gbmV3IEVkaXRvclN0YXRlKHRoaXMuX2NvZGVFZGl0b3IsIENvZGVFZGl0b3JTdGF0ZUZsYWcuVmFsdWUgfCBDb2RlRWRpdG9yU3RhdGVGbGFnLlBvc2l0aW9uKTtcblx0XHRcdGNsaXBib2FyZFRleHQgPSBhd2FpdCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLnJlYWRUZXh0KCk7XG5cdFx0XHRpZiAoIXN0YXRlLnZhbGlkYXRlKHRoaXMuX2NvZGVFZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY29kZUVkaXRvci5nZXRNb2RlbCgpLmdldFZlcnNpb25JZCgpICE9PSBtb2RlbFZlcnNpb25JZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNuaXBwZXRDb250cm9sbGVyID0gU25pcHBldENvbnRyb2xsZXIyLmdldCh0aGlzLl9jb2RlRWRpdG9yKTtcblx0XHRpZiAoIXNuaXBwZXRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29kZUVkaXRvci5mb2N1cygpO1xuXG5cdFx0Ly8gbWFrZSBtb2RpZmljYXRpb25zIGFzIHNuaXBwZXQgZWRpdFxuXHRcdGNvbnN0IGVkaXRzOiBJU25pcHBldEVkaXRbXSA9IHJhbmdlcy5tYXAocmFuZ2UgPT4gKHsgcmFuZ2U6IFJhbmdlLmxpZnQocmFuZ2UpLCB0ZW1wbGF0ZSB9KSk7XG5cdFx0c25pcHBldENvbnRyb2xsZXIuYXBwbHkoZWRpdHMsIHtcblx0XHRcdG92ZXJ3cml0ZUJlZm9yZTogMCwgb3ZlcndyaXRlQWZ0ZXI6IDAsXG5cdFx0XHR1bmRvU3RvcEJlZm9yZTogb3B0cy51bmRvU3RvcEJlZm9yZSwgdW5kb1N0b3BBZnRlcjogb3B0cy51bmRvU3RvcEFmdGVyLFxuXHRcdFx0YWRqdXN0V2hpdGVzcGFjZTogIW9wdHMua2VlcFdoaXRlc3BhY2UsXG5cdFx0XHRjbGlwYm9hcmRUZXh0XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLHVCQUF1Qix1QkFBdUIscUJBQXFCLG9CQUFvQjtBQUNoRyxTQUFpQixhQUFhO0FBQzlCLFNBQXFCLGlCQUFpQjtBQUN0QyxTQUE2QixrQkFBa0I7QUFJL0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBNkksNEJBQTRC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
