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
import { n } from "../../../../../../../../base/browser/dom.js";
import { Disposable } from "../../../../../../../../base/common/lifecycle.js";
import { clamp } from "../../../../../../../../base/common/numbers.js";
import { derived, constObservable, autorun, observableValue } from "../../../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../../../platform/instantiation/common/instantiation.js";
import { EditorOption } from "../../../../../../../common/config/editorOptions.js";
import { observableCodeEditor } from "../../../../../../../browser/observableCodeEditor.js";
import { EmbeddedCodeEditorWidget } from "../../../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { Position } from "../../../../../../../common/core/position.js";
import { Range } from "../../../../../../../common/core/range.js";
import { LineRange } from "../../../../../../../common/core/ranges/lineRange.js";
import { OffsetRange } from "../../../../../../../common/core/ranges/offsetRange.js";
import { ModelDecorationOptions } from "../../../../../../../common/model/textModel.js";
import { InlineCompletionContextKeys } from "../../../../controller/inlineCompletionContextKeys.js";
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData } from "../../components/gutterIndicatorView.js";
import { classNames, maxContentWidthInRange } from "../../utils/utils.js";
import { JumpToView } from "../jumpToView.js";
import { TextModelValueReference } from "../../../../model/textModelValueReference.js";
function expandLineRangeWithContext(targetLineNumber, contextLineCount, lineCount) {
  const clampedTarget = Math.max(1, Math.min(lineCount, targetLineNumber));
  const startLineNumber = Math.max(1, clampedTarget - contextLineCount);
  const endLineNumberExclusive = Math.min(lineCount + 1, clampedTarget + contextLineCount + 1);
  return new LineRange(startLineNumber, endLineNumberExclusive);
}
let LongDistancePreviewEditor = class extends Disposable {
  constructor(_previewTextModel, _properties, _parentEditor, _tabAction, _instantiationService) {
    super();
    this._previewTextModel = _previewTextModel;
    this._properties = _properties;
    this._parentEditor = _parentEditor;
    this._tabAction = _tabAction;
    this._instantiationService = _instantiationService;
    this._previewRef = n.ref();
    this.element = n.div({ class: "preview", style: {
      /*pointerEvents: 'none'*/
    }, ref: this._previewRef });
    this._state = derived(this, (reader) => {
      const props = this._properties.read(reader);
      if (!props) {
        return void 0;
      }
      let mode;
      let targetLineNumber;
      if (props.nextCursorPosition !== null) {
        mode = "original";
        targetLineNumber = props.nextCursorPosition.lineNumber;
      } else {
        if (props.diff[0].innerChanges?.every((c) => c.modifiedRange.isEmpty())) {
          mode = "original";
          targetLineNumber = props.diff[0].original.startLineNumber;
        } else {
          mode = "modified";
          targetLineNumber = props.diff[0].modified.startLineNumber;
        }
      }
      const textModel = mode === "modified" ? TextModelValueReference.snapshot(this._previewTextModel) : props.target;
      const contextLineCount = this._parentEditorObs.getOption(EditorOption.inlineSuggest).read(reader).edits.longDistanceHintContextLineCount;
      const displayModel = mode === "modified" ? this._previewTextModel : props.target.dangerouslyGetUnderlyingModel();
      const visibleLineRange = expandLineRangeWithContext(targetLineNumber, contextLineCount, displayModel.getLineCount());
      return {
        mode,
        targetLineNumber,
        visibleLineRange,
        textModel,
        diff: props.diff
      };
    });
    this.updatePreviewEditorEffect = derived(this, (reader) => {
      this._previewEditorObs.model.read(reader);
      const range = this._state.read(reader)?.visibleLineRange;
      if (!range) {
        return;
      }
      const hiddenAreas = [];
      if (range.startLineNumber > 1) {
        hiddenAreas.push(new Range(1, 1, range.startLineNumber - 1, 1));
      }
      if (range.endLineNumberExclusive < this._previewTextModel.getLineCount() + 1) {
        hiddenAreas.push(new Range(range.endLineNumberExclusive, 1, this._previewTextModel.getLineCount() + 1, 1));
      }
      this.previewEditor.setHiddenAreas(hiddenAreas, void 0, true);
    });
    this.horizontalContentRangeInPreviewEditorToShow = derived(this, (reader) => {
      return this._getHorizontalContentRangeInPreviewEditorToShow(this.previewEditor, reader);
    });
    this.contentHeight = derived(this, (reader) => {
      const viewState = this._state.read(reader);
      if (!viewState) {
        return constObservable(null);
      }
      return this._previewEditorObs.observeLineHeightsForLineRange(viewState.visibleLineRange).map((heights) => heights.reduce((sum, height) => sum + height, 0));
    }).flatten();
    this._editorDecorations = derived(this, (reader) => {
      const state = this._state.read(reader);
      if (!state) {
        return void 0;
      }
      const diff = {
        mode: "insertionInline",
        diff: state.diff
      };
      const originalDecorations = [];
      const modifiedDecorations = [];
      const diffWholeLineDeleteDecoration = ModelDecorationOptions.register({
        className: "inlineCompletions-char-delete",
        description: "char-delete",
        isWholeLine: false,
        zIndex: 1
        // be on top of diff background decoration
      });
      const diffWholeLineAddDecoration = ModelDecorationOptions.register({
        className: "inlineCompletions-char-insert",
        description: "char-insert",
        isWholeLine: true
      });
      const diffAddDecoration = ModelDecorationOptions.register({
        className: "inlineCompletions-char-insert",
        description: "char-insert",
        shouldFillLineOnLineBreak: true
      });
      const hideEmptyInnerDecorations = true;
      for (const m of diff.diff) {
        if (m.modified.isEmpty || m.original.isEmpty) {
          if (!m.original.isEmpty) {
            originalDecorations.push({ range: m.original.toInclusiveRange(), options: diffWholeLineDeleteDecoration });
          }
          if (!m.modified.isEmpty) {
            modifiedDecorations.push({ range: m.modified.toInclusiveRange(), options: diffWholeLineAddDecoration });
          }
        } else {
          for (const i of m.innerChanges || []) {
            if (m.original.contains(i.originalRange.startLineNumber) && !(hideEmptyInnerDecorations && i.originalRange.isEmpty())) {
              originalDecorations.push({
                range: i.originalRange,
                options: {
                  description: "char-delete",
                  shouldFillLineOnLineBreak: false,
                  className: classNames(
                    "inlineCompletions-char-delete",
                    // i.originalRange.isSingleLine() && diff.mode === 'insertionInline' && 'single-line-inline',
                    i.originalRange.isEmpty() && "empty"
                  ),
                  zIndex: 1
                }
              });
            }
            if (m.modified.contains(i.modifiedRange.startLineNumber)) {
              modifiedDecorations.push({
                range: i.modifiedRange,
                options: diffAddDecoration
              });
            }
          }
        }
      }
      return { originalDecorations, modifiedDecorations };
    });
    this.previewEditor = this._register(this._createPreviewEditor());
    this._parentEditorObs = observableCodeEditor(this._parentEditor);
    this._register(autorun((reader) => {
      const tm = this._state.read(reader)?.textModel || null;
      if (tm) {
        this.previewEditor.setModel(tm.dangerouslyGetUnderlyingModel());
      }
    }));
    this._previewEditorObs = observableCodeEditor(this.previewEditor);
    this._register(this._previewEditorObs.setDecorations(derived((reader) => {
      const state = this._state.read(reader);
      const decorations = this._editorDecorations.read(reader);
      return (state?.mode === "original" ? decorations?.originalDecorations : decorations?.modifiedDecorations) ?? [];
    })));
    const showJumpToDecoration = false;
    if (showJumpToDecoration) {
      this._register(this._instantiationService.createInstance(JumpToView, this._previewEditorObs, { style: "cursor" }, derived((reader) => {
        const p = this._properties.read(reader);
        if (!p || !p.nextCursorPosition) {
          return void 0;
        }
        return {
          jumpToPosition: p.nextCursorPosition
        };
      })));
    }
    this._register(autorun((reader) => {
      if (!this._properties.read(reader)) {
        return;
      }
      const cursorPosition = this._parentEditorObs.cursorPosition.read(reader);
      if (cursorPosition) {
        this.previewEditor.setPosition(this._previewTextModel.validatePosition(cursorPosition), "longDistanceHintPreview");
      }
    }));
    this._register(autorun((reader) => {
      const state = this._state.read(reader);
      if (!state) {
        return;
      }
      const lineNumberDigets = (state.visibleLineRange.endLineNumberExclusive - 1).toString().length;
      this.previewEditor.updateOptions({ lineNumbersMinChars: lineNumberDigets + 1 });
    }));
    this._register(this._instantiationService.createInstance(
      InlineEditsGutterIndicator,
      this._previewEditorObs,
      derived((reader) => {
        const state = this._state.read(reader);
        if (!state) {
          return void 0;
        }
        const props = this._properties.read(reader);
        if (!props) {
          return void 0;
        }
        return new InlineEditsGutterIndicatorData(
          props.inlineSuggestInfo,
          LineRange.ofLength(state.targetLineNumber, 1),
          props.model,
          void 0
        );
      }),
      this._tabAction,
      constObservable(0),
      constObservable(false),
      observableValue(this, false)
    ));
    this.updatePreviewEditorEffect.recomputeInitiallyAndOnChange(this._store);
  }
  _createPreviewEditor() {
    return this._instantiationService.createInstance(
      EmbeddedCodeEditorWidget,
      this._previewRef.element,
      {
        glyphMargin: false,
        lineNumbers: "on",
        minimap: { enabled: false },
        guides: {
          indentation: false,
          bracketPairs: false,
          bracketPairsHorizontal: false,
          highlightActiveIndentation: false
        },
        editContext: false,
        // is a bit faster
        rulers: [],
        padding: { top: 0, bottom: 0 },
        //folding: false,
        selectOnLineNumbers: false,
        selectionHighlight: false,
        columnSelection: false,
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        //lineDecorationsWidth: 0,
        //lineNumbersMinChars: 0,
        revealHorizontalRightPadding: 0,
        bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false },
        scrollBeyondLastLine: false,
        scrollbar: {
          vertical: "hidden",
          horizontal: "hidden",
          handleMouseWheel: false
        },
        readOnly: true,
        wordWrap: "off",
        wordWrapOverride1: "off",
        wordWrapOverride2: "off"
      },
      {
        contextKeyValues: {
          [InlineCompletionContextKeys.inInlineEditsPreviewEditor.key]: true
        },
        contributions: []
      },
      this._parentEditor
    );
  }
  _getHorizontalContentRangeInPreviewEditorToShow(editor, reader) {
    const state = this._state.read(reader);
    if (!state) {
      return void 0;
    }
    const diff = state.diff;
    const jumpToPos = this._properties.read(reader)?.nextCursorPosition;
    const visibleRange = state.visibleLineRange;
    const l = this._previewEditorObs.layoutInfo.read(reader);
    const trueContentWidth = maxContentWidthInRange(this._previewEditorObs, visibleRange, reader);
    let firstCharacterChange;
    if (jumpToPos) {
      firstCharacterChange = Range.fromPositions(jumpToPos);
    } else if (diff[0].innerChanges) {
      firstCharacterChange = state.mode === "modified" ? diff[0].innerChanges[0].modifiedRange : diff[0].innerChanges[0].originalRange;
    } else {
      return void 0;
    }
    const preferredRange = growUntilVariableBoundaries(editor.getModel(), firstCharacterChange, 5);
    const leftOffset = this._previewEditorObs.getLeftOfPosition(preferredRange.getStartPosition(), reader);
    const rightOffset = this._previewEditorObs.getLeftOfPosition(preferredRange.getEndPosition(), reader);
    const left = clamp(leftOffset, 0, trueContentWidth);
    const right = clamp(rightOffset, left, trueContentWidth);
    const indentCol = editor.getModel().getLineFirstNonWhitespaceColumn(preferredRange.startLineNumber);
    const indentationEnd = this._previewEditorObs.getLeftOfPosition(new Position(preferredRange.startLineNumber, indentCol), reader);
    const preferredRangeToReveal = new OffsetRange(left, right);
    return {
      indentationEnd,
      preferredRangeToReveal,
      maxEditorWidth: trueContentWidth + l.contentLeft,
      contentWidth: trueContentWidth,
      nonContentWidth: l.contentLeft
      // Width of area that is not content
    };
  }
  layout(dimension, desiredPreviewEditorScrollLeft) {
    this.previewEditor.layout(dimension);
    this._previewEditorObs.editor.setScrollLeft(desiredPreviewEditorScrollLeft);
  }
};
LongDistancePreviewEditor = __decorateClass([
  __decorateParam(4, IInstantiationService)
], LongDistancePreviewEditor);
function growUntilVariableBoundaries(textModel, range, maxGrow) {
  const startPosition = range.getStartPosition();
  const endPosition = range.getEndPosition();
  const line = textModel.getLineContent(startPosition.lineNumber);
  function isVariableNameCharacter(col) {
    const char = line.charAt(col - 1);
    return /[a-zA-Z0-9_]/.test(char);
  }
  function isWhitespace(col) {
    const char = line.charAt(col - 1);
    return char === " " || char === "	";
  }
  let startColumn = startPosition.column;
  while (startColumn > 1 && isVariableNameCharacter(startColumn) && !isWhitespace(startColumn - 1) && startPosition.column - startColumn < maxGrow) {
    startColumn--;
  }
  let endColumn = endPosition.column - 1;
  while (endColumn <= line.length && isVariableNameCharacter(endColumn) && !isWhitespace(endColumn + 1) && endColumn - endPosition.column < maxGrow) {
    endColumn++;
  }
  return new Range(startPosition.lineNumber, startColumn, endPosition.lineNumber, endColumn + 1);
}
export {
  LongDistancePreviewEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcbG9uZ0Rpc3RhbmNlSGludFxcbG9uZ0Rpc3RhbmNlUHJldmlld0VkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBkZXJpdmVkLCBjb25zdE9ic2VydmFibGUsIElSZWFkZXIsIGF1dG9ydW4sIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUNvZGVFZGl0b3IsIG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvZGltZW5zaW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3IsIElubGluZUVkaXRzR3V0dGVySW5kaWNhdG9yRGF0YSwgSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhLCBTaW1wbGVJbmxpbmVTdWdnZXN0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21wb25lbnRzL2d1dHRlckluZGljYXRvclZpZXcuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdFRhYkFjdGlvbiB9IGZyb20gJy4uLy4uL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBjbGFzc05hbWVzLCBtYXhDb250ZW50V2lkdGhJblJhbmdlIH0gZnJvbSAnLi4vLi4vdXRpbHMvdXRpbHMuanMnO1xuaW1wb3J0IHsgSnVtcFRvVmlldyB9IGZyb20gJy4uL2p1bXBUb1ZpZXcuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9tb2RlbC90ZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvbmdEaXN0YW5jZVByZXZpZXdQcm9wcyB7XG5cdG5leHRDdXJzb3JQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsOyAvLyBhc3NlcnQ6IG5leHRDdXJzb3JQb3NpdGlvbiAhPT0gbnVsbCAgeG9yICBkaWZmLmxlbmd0aCA+IDBcblx0ZGlmZjogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW107XG5cdG1vZGVsOiBTaW1wbGVJbmxpbmVTdWdnZXN0TW9kZWw7XG5cdGlubGluZVN1Z2dlc3RJbmZvOiBJbmxpbmVTdWdnZXN0aW9uR3V0dGVyTWVudURhdGE7XG5cdC8qKlxuXHQgKiBUaGUgVVJJIG9mIHRoZSBmaWxlIHRoZSBlZGl0IHRhcmdldHMuXG5cdCAqIFdoZW4gdW5kZWZpbmVkIChvciBzYW1lIGFzIHRoZSBlZGl0b3IncyBtb2RlbCBVUkkpLCB0aGUgZWRpdCB0YXJnZXRzIHRoZSBjdXJyZW50IGZpbGUuXG5cdCAqL1xuXHR0YXJnZXQ6IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlO1xufVxuXG4vKipcbiAqIFdpZGVucyB0aGUgcHJldmlld2VkIHJhbmdlIGFyb3VuZCBgdGFyZ2V0TGluZU51bWJlcmAgYnkgYGNvbnRleHRMaW5lQ291bnRgIGxpbmVzIG9uIGVhY2ggc2lkZSxcbiAqIGNsYW1wZWQgdG8gdGhlIG1vZGVsIGJvdW5kcy4gV2l0aCBgY29udGV4dExpbmVDb3VudCA9PT0gMGAgdGhpcyByZXR1cm5zIGp1c3QgdGhlIHRhcmdldCBsaW5lLlxuICovXG5mdW5jdGlvbiBleHBhbmRMaW5lUmFuZ2VXaXRoQ29udGV4dCh0YXJnZXRMaW5lTnVtYmVyOiBudW1iZXIsIGNvbnRleHRMaW5lQ291bnQ6IG51bWJlciwgbGluZUNvdW50OiBudW1iZXIpOiBMaW5lUmFuZ2Uge1xuXHRjb25zdCBjbGFtcGVkVGFyZ2V0ID0gTWF0aC5tYXgoMSwgTWF0aC5taW4obGluZUNvdW50LCB0YXJnZXRMaW5lTnVtYmVyKSk7XG5cdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IE1hdGgubWF4KDEsIGNsYW1wZWRUYXJnZXQgLSBjb250ZXh0TGluZUNvdW50KTtcblx0Y29uc3QgZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA9IE1hdGgubWluKGxpbmVDb3VudCArIDEsIGNsYW1wZWRUYXJnZXQgKyBjb250ZXh0TGluZUNvdW50ICsgMSk7XG5cdHJldHVybiBuZXcgTGluZVJhbmdlKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlckV4Y2x1c2l2ZSk7XG59XG5cbmV4cG9ydCBjbGFzcyBMb25nRGlzdGFuY2VQcmV2aWV3RWRpdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBwcmV2aWV3RWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aWV3RWRpdG9yT2JzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZpZXdSZWYgPSBuLnJlZjxIVE1MRGl2RWxlbWVudD4oKTtcblx0cHVibGljIHJlYWRvbmx5IGVsZW1lbnQgPSBuLmRpdih7IGNsYXNzOiAncHJldmlldycsIHN0eWxlOiB7IC8qcG9pbnRlckV2ZW50czogJ25vbmUnKi8gfSwgcmVmOiB0aGlzLl9wcmV2aWV3UmVmIH0pO1xuXG5cdHByaXZhdGUgX3BhcmVudEVkaXRvck9iczogT2JzZXJ2YWJsZUNvZGVFZGl0b3I7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlld1RleHRNb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9wZXJ0aWVzOiBJT2JzZXJ2YWJsZTxJTG9uZ0Rpc3RhbmNlUHJldmlld1Byb3BzIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wYXJlbnRFZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhYkFjdGlvbjogSU9ic2VydmFibGU8SW5saW5lRWRpdFRhYkFjdGlvbj4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5wcmV2aWV3RWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fY3JlYXRlUHJldmlld0VkaXRvcigpKTtcblx0XHR0aGlzLl9wYXJlbnRFZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLl9wYXJlbnRFZGl0b3IpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdG0gPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik/LnRleHRNb2RlbCB8fCBudWxsO1xuXG5cdFx0XHRpZiAodG0pIHtcblx0XHRcdFx0Ly8gQXZvaWQgdHJhbnNpdGlvbnMgZnJvbSB0bSAtPiBudWxsIC0+IHRtLCB3aGVyZSB0bSAtPiB0bSB3b3VsZCBiZSBhIG5vLW9wLlxuXHRcdFx0XHR0aGlzLnByZXZpZXdFZGl0b3Iuc2V0TW9kZWwodG0uZGFuZ2Vyb3VzbHlHZXRVbmRlcmx5aW5nTW9kZWwoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcHJldmlld0VkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMucHJldmlld0VkaXRvcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJldmlld0VkaXRvck9icy5zZXREZWNvcmF0aW9ucyhkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5fZWRpdG9yRGVjb3JhdGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIChzdGF0ZT8ubW9kZSA9PT0gJ29yaWdpbmFsJyA/IGRlY29yYXRpb25zPy5vcmlnaW5hbERlY29yYXRpb25zIDogZGVjb3JhdGlvbnM/Lm1vZGlmaWVkRGVjb3JhdGlvbnMpID8/IFtdO1xuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBzaG93SnVtcFRvRGVjb3JhdGlvbiA9IGZhbHNlO1xuXG5cdFx0aWYgKHNob3dKdW1wVG9EZWNvcmF0aW9uKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShKdW1wVG9WaWV3LCB0aGlzLl9wcmV2aWV3RWRpdG9yT2JzLCB7IHN0eWxlOiAnY3Vyc29yJyB9LCBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHAgPSB0aGlzLl9wcm9wZXJ0aWVzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFwIHx8ICFwLm5leHRDdXJzb3JQb3NpdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRqdW1wVG9Qb3NpdGlvbjogcC5uZXh0Q3Vyc29yUG9zaXRpb24sXG5cblx0XHRcdFx0fTtcblx0XHRcdH0pKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWlycm9yIHRoZSBjdXJzb3IgcG9zaXRpb24uIEFsbG93cyB0aGUgZ3V0dGVyIGFycm93IHRvIHBvaW50IGluIHRoZSBjb3JyZWN0IGRpcmVjdGlvbi5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdGlmICghdGhpcy5fcHJvcGVydGllcy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3Vyc29yUG9zaXRpb24gPSB0aGlzLl9wYXJlbnRFZGl0b3JPYnMuY3Vyc29yUG9zaXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGN1cnNvclBvc2l0aW9uKSB7XG5cdFx0XHRcdHRoaXMucHJldmlld0VkaXRvci5zZXRQb3NpdGlvbih0aGlzLl9wcmV2aWV3VGV4dE1vZGVsLnZhbGlkYXRlUG9zaXRpb24oY3Vyc29yUG9zaXRpb24pLCAnbG9uZ0Rpc3RhbmNlSGludFByZXZpZXcnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghc3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRW5zdXJlIHRoZXJlIGlzIGVub3VnaCBzcGFjZSB0byB0aGUgbGVmdCBvZiB0aGUgbGluZSBudW1iZXIgZm9yIHRoZSBndXR0ZXIgaW5kaWNhdG9yIHRvIGZpdHMuXG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyRGlnZXRzID0gKHN0YXRlLnZpc2libGVMaW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEpLnRvU3RyaW5nKCkubGVuZ3RoO1xuXHRcdFx0dGhpcy5wcmV2aWV3RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBsaW5lTnVtYmVyc01pbkNoYXJzOiBsaW5lTnVtYmVyRGlnZXRzICsgMSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdElubGluZUVkaXRzR3V0dGVySW5kaWNhdG9yLFxuXHRcdFx0dGhpcy5fcHJldmlld0VkaXRvck9icyxcblx0XHRcdGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghc3RhdGUpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRjb25zdCBwcm9wcyA9IHRoaXMuX3Byb3BlcnRpZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIXByb3BzKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0cmV0dXJuIG5ldyBJbmxpbmVFZGl0c0d1dHRlckluZGljYXRvckRhdGEoXG5cdFx0XHRcdFx0cHJvcHMuaW5saW5lU3VnZ2VzdEluZm8sXG5cdFx0XHRcdFx0TGluZVJhbmdlLm9mTGVuZ3RoKHN0YXRlLnRhcmdldExpbmVOdW1iZXIsIDEpLFxuXHRcdFx0XHRcdHByb3BzLm1vZGVsLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0KTtcblx0XHRcdH0pLFxuXHRcdFx0dGhpcy5fdGFiQWN0aW9uLFxuXHRcdFx0Y29uc3RPYnNlcnZhYmxlKDApLFxuXHRcdFx0Y29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRcdG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSksXG5cdFx0KSk7XG5cblx0XHR0aGlzLnVwZGF0ZVByZXZpZXdFZGl0b3JFZmZlY3QucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGUgPSBkZXJpdmVkPHtcblx0XHRtb2RlOiAnb3JpZ2luYWwnIHwgJ21vZGlmaWVkJztcblx0XHR0YXJnZXRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0dmlzaWJsZUxpbmVSYW5nZTogTGluZVJhbmdlO1xuXHRcdHRleHRNb2RlbDogVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UgfCB1bmRlZmluZWQ7XG5cdFx0ZGlmZjogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW107XG5cdH0gfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgcHJvcHMgPSB0aGlzLl9wcm9wZXJ0aWVzLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXByb3BzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBtb2RlOiAnb3JpZ2luYWwnIHwgJ21vZGlmaWVkJztcblx0XHRsZXQgdGFyZ2V0TGluZU51bWJlcjogbnVtYmVyO1xuXG5cdFx0aWYgKHByb3BzLm5leHRDdXJzb3JQb3NpdGlvbiAhPT0gbnVsbCkge1xuXHRcdFx0bW9kZSA9ICdvcmlnaW5hbCc7XG5cdFx0XHR0YXJnZXRMaW5lTnVtYmVyID0gcHJvcHMubmV4dEN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChwcm9wcy5kaWZmWzBdLmlubmVyQ2hhbmdlcz8uZXZlcnkoYyA9PiBjLm1vZGlmaWVkUmFuZ2UuaXNFbXB0eSgpKSkge1xuXHRcdFx0XHRtb2RlID0gJ29yaWdpbmFsJztcblx0XHRcdFx0dGFyZ2V0TGluZU51bWJlciA9IHByb3BzLmRpZmZbMF0ub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bW9kZSA9ICdtb2RpZmllZCc7XG5cdFx0XHRcdHRhcmdldExpbmVOdW1iZXIgPSBwcm9wcy5kaWZmWzBdLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBtb2RlID09PSAnbW9kaWZpZWQnXG5cdFx0XHQ/IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlLnNuYXBzaG90KHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwpXG5cdFx0XHQ6IHByb3BzLnRhcmdldDtcblxuXHRcdC8vIE9wdGlvbmFsbHkgd2lkZW4gdGhlIHByZXZpZXdlZCByYW5nZSB3aXRoIHN1cnJvdW5kaW5nIGNvbnRleHQgbGluZXMgKGUuZy4gd2hlbiB0aGUgdGFyZ2V0IGxpbmUgaXMgZW1wdHkpLlxuXHRcdGNvbnN0IGNvbnRleHRMaW5lQ291bnQgPSB0aGlzLl9wYXJlbnRFZGl0b3JPYnMuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0KS5yZWFkKHJlYWRlcikuZWRpdHMubG9uZ0Rpc3RhbmNlSGludENvbnRleHRMaW5lQ291bnQ7XG5cdFx0Y29uc3QgZGlzcGxheU1vZGVsID0gbW9kZSA9PT0gJ21vZGlmaWVkJyA/IHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwgOiBwcm9wcy50YXJnZXQuZGFuZ2Vyb3VzbHlHZXRVbmRlcmx5aW5nTW9kZWwoKTtcblx0XHRjb25zdCB2aXNpYmxlTGluZVJhbmdlID0gZXhwYW5kTGluZVJhbmdlV2l0aENvbnRleHQodGFyZ2V0TGluZU51bWJlciwgY29udGV4dExpbmVDb3VudCwgZGlzcGxheU1vZGVsLmdldExpbmVDb3VudCgpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RlLFxuXHRcdFx0dGFyZ2V0TGluZU51bWJlcixcblx0XHRcdHZpc2libGVMaW5lUmFuZ2UsXG5cdFx0XHR0ZXh0TW9kZWwsXG5cdFx0XHRkaWZmOiBwcm9wcy5kaWZmLFxuXHRcdH07XG5cdH0pO1xuXG5cdHByaXZhdGUgX2NyZWF0ZVByZXZpZXdFZGl0b3IoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0RW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdFx0dGhpcy5fcHJldmlld1JlZi5lbGVtZW50LFxuXHRcdFx0e1xuXHRcdFx0XHRnbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRcdGxpbmVOdW1iZXJzOiAnb24nLFxuXHRcdFx0XHRtaW5pbWFwOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdGd1aWRlczoge1xuXHRcdFx0XHRcdGluZGVudGF0aW9uOiBmYWxzZSxcblx0XHRcdFx0XHRicmFja2V0UGFpcnM6IGZhbHNlLFxuXHRcdFx0XHRcdGJyYWNrZXRQYWlyc0hvcml6b250YWw6IGZhbHNlLFxuXHRcdFx0XHRcdGhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZWRpdENvbnRleHQ6IGZhbHNlLCAvLyBpcyBhIGJpdCBmYXN0ZXJcblx0XHRcdFx0cnVsZXJzOiBbXSxcblx0XHRcdFx0cGFkZGluZzogeyB0b3A6IDAsIGJvdHRvbTogMCB9LFxuXHRcdFx0XHQvL2ZvbGRpbmc6IGZhbHNlLFxuXHRcdFx0XHRzZWxlY3RPbkxpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdFx0c2VsZWN0aW9uSGlnaGxpZ2h0OiBmYWxzZSxcblx0XHRcdFx0Y29sdW1uU2VsZWN0aW9uOiBmYWxzZSxcblx0XHRcdFx0b3ZlcnZpZXdSdWxlckJvcmRlcjogZmFsc2UsXG5cdFx0XHRcdG92ZXJ2aWV3UnVsZXJMYW5lczogMCxcblx0XHRcdFx0Ly9saW5lRGVjb3JhdGlvbnNXaWR0aDogMCxcblx0XHRcdFx0Ly9saW5lTnVtYmVyc01pbkNoYXJzOiAwLFxuXHRcdFx0XHRyZXZlYWxIb3Jpem9udGFsUmlnaHRQYWRkaW5nOiAwLFxuXHRcdFx0XHRicmFja2V0UGFpckNvbG9yaXphdGlvbjogeyBlbmFibGVkOiB0cnVlLCBpbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlOiBmYWxzZSB9LFxuXHRcdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRcdHNjcm9sbGJhcjoge1xuXHRcdFx0XHRcdHZlcnRpY2FsOiAnaGlkZGVuJyxcblx0XHRcdFx0XHRob3Jpem9udGFsOiAnaGlkZGVuJyxcblx0XHRcdFx0XHRoYW5kbGVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVhZE9ubHk6IHRydWUsXG5cdFx0XHRcdHdvcmRXcmFwOiAnb2ZmJyxcblx0XHRcdFx0d29yZFdyYXBPdmVycmlkZTE6ICdvZmYnLFxuXHRcdFx0XHR3b3JkV3JhcE92ZXJyaWRlMjogJ29mZicsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRjb250ZXh0S2V5VmFsdWVzOiB7XG5cdFx0XHRcdFx0W0lubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbklubGluZUVkaXRzUHJldmlld0VkaXRvci5rZXldOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb250cmlidXRpb25zOiBbXSxcblx0XHRcdH0sXG5cdFx0XHR0aGlzLl9wYXJlbnRFZGl0b3Jcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHVwZGF0ZVByZXZpZXdFZGl0b3JFZmZlY3QgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Ly8gdGhpcy5fd2lkZ2V0Q29udGVudC5yZWFkRWZmZWN0KHJlYWRlcik7XG5cdFx0dGhpcy5fcHJldmlld0VkaXRvck9icy5tb2RlbC5yZWFkKHJlYWRlcik7IC8vIHVwZGF0ZSB3aGVuIHRoZSBtb2RlbCBpcyBzZXRcblxuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpPy52aXNpYmxlTGluZVJhbmdlO1xuXHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGlkZGVuQXJlYXM6IFJhbmdlW10gPSBbXTtcblx0XHRpZiAocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gMSkge1xuXHRcdFx0aGlkZGVuQXJlYXMucHVzaChuZXcgUmFuZ2UoMSwgMSwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSwgMSkpO1xuXHRcdH1cblx0XHRpZiAocmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA8IHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwuZ2V0TGluZUNvdW50KCkgKyAxKSB7XG5cdFx0XHRoaWRkZW5BcmVhcy5wdXNoKG5ldyBSYW5nZShyYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLCAxLCB0aGlzLl9wcmV2aWV3VGV4dE1vZGVsLmdldExpbmVDb3VudCgpICsgMSwgMSkpO1xuXHRcdH1cblx0XHR0aGlzLnByZXZpZXdFZGl0b3Iuc2V0SGlkZGVuQXJlYXMoaGlkZGVuQXJlYXMsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBob3Jpem9udGFsQ29udGVudFJhbmdlSW5QcmV2aWV3RWRpdG9yVG9TaG93ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRIb3Jpem9udGFsQ29udGVudFJhbmdlSW5QcmV2aWV3RWRpdG9yVG9TaG93KHRoaXMucHJldmlld0VkaXRvciwgcmVhZGVyKTtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGNvbnRlbnRIZWlnaHQgPSBkZXJpdmVkKHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRjb25zdCB2aWV3U3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCF2aWV3U3RhdGUpIHtcblx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUobnVsbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZpZXdFZGl0b3JPYnMub2JzZXJ2ZUxpbmVIZWlnaHRzRm9yTGluZVJhbmdlKHZpZXdTdGF0ZS52aXNpYmxlTGluZVJhbmdlKVxuXHRcdFx0Lm1hcChoZWlnaHRzID0+IGhlaWdodHMucmVkdWNlKChzdW0sIGhlaWdodCkgPT4gc3VtICsgaGVpZ2h0LCAwKSk7XG5cdH0pLmZsYXR0ZW4oKTtcblxuXHRwcml2YXRlIF9nZXRIb3Jpem9udGFsQ29udGVudFJhbmdlSW5QcmV2aWV3RWRpdG9yVG9TaG93KGVkaXRvcjogSUNvZGVFZGl0b3IsIHJlYWRlcjogSVJlYWRlcikge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc3RhdGUpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3QgZGlmZiA9IHN0YXRlLmRpZmY7XG5cdFx0Y29uc3QganVtcFRvUG9zID0gdGhpcy5fcHJvcGVydGllcy5yZWFkKHJlYWRlcik/Lm5leHRDdXJzb3JQb3NpdGlvbjtcblxuXHRcdGNvbnN0IHZpc2libGVSYW5nZSA9IHN0YXRlLnZpc2libGVMaW5lUmFuZ2U7XG5cdFx0Y29uc3QgbCA9IHRoaXMuX3ByZXZpZXdFZGl0b3JPYnMubGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgdHJ1ZUNvbnRlbnRXaWR0aCA9IG1heENvbnRlbnRXaWR0aEluUmFuZ2UodGhpcy5fcHJldmlld0VkaXRvck9icywgdmlzaWJsZVJhbmdlLCByZWFkZXIpO1xuXG5cdFx0bGV0IGZpcnN0Q2hhcmFjdGVyQ2hhbmdlOiBSYW5nZTtcblx0XHRpZiAoanVtcFRvUG9zKSB7XG5cdFx0XHRmaXJzdENoYXJhY3RlckNoYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoanVtcFRvUG9zKTtcblx0XHR9IGVsc2UgaWYgKGRpZmZbMF0uaW5uZXJDaGFuZ2VzKSB7XG5cdFx0XHRmaXJzdENoYXJhY3RlckNoYW5nZSA9IHN0YXRlLm1vZGUgPT09ICdtb2RpZmllZCcgPyBkaWZmWzBdLmlubmVyQ2hhbmdlc1swXS5tb2RpZmllZFJhbmdlIDogZGlmZlswXS5pbm5lckNoYW5nZXNbMF0ub3JpZ2luYWxSYW5nZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblxuXHRcdC8vIGZpbmQgdGhlIGhvcml6b250YWwgcmFuZ2Ugd2Ugd2FudCB0byBzaG93LlxuXHRcdGNvbnN0IHByZWZlcnJlZFJhbmdlID0gZ3Jvd1VudGlsVmFyaWFibGVCb3VuZGFyaWVzKGVkaXRvci5nZXRNb2RlbCgpISwgZmlyc3RDaGFyYWN0ZXJDaGFuZ2UsIDUpO1xuXHRcdGNvbnN0IGxlZnRPZmZzZXQgPSB0aGlzLl9wcmV2aWV3RWRpdG9yT2JzLmdldExlZnRPZlBvc2l0aW9uKHByZWZlcnJlZFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSwgcmVhZGVyKTtcblx0XHRjb25zdCByaWdodE9mZnNldCA9IHRoaXMuX3ByZXZpZXdFZGl0b3JPYnMuZ2V0TGVmdE9mUG9zaXRpb24ocHJlZmVycmVkUmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgcmVhZGVyKTtcblxuXHRcdGNvbnN0IGxlZnQgPSBjbGFtcChsZWZ0T2Zmc2V0LCAwLCB0cnVlQ29udGVudFdpZHRoKTtcblx0XHRjb25zdCByaWdodCA9IGNsYW1wKHJpZ2h0T2Zmc2V0LCBsZWZ0LCB0cnVlQ29udGVudFdpZHRoKTtcblxuXHRcdGNvbnN0IGluZGVudENvbCA9IGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHByZWZlcnJlZFJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3QgaW5kZW50YXRpb25FbmQgPSB0aGlzLl9wcmV2aWV3RWRpdG9yT2JzLmdldExlZnRPZlBvc2l0aW9uKG5ldyBQb3NpdGlvbihwcmVmZXJyZWRSYW5nZS5zdGFydExpbmVOdW1iZXIsIGluZGVudENvbCksIHJlYWRlcik7XG5cblx0XHRjb25zdCBwcmVmZXJyZWRSYW5nZVRvUmV2ZWFsID0gbmV3IE9mZnNldFJhbmdlKGxlZnQsIHJpZ2h0KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbmRlbnRhdGlvbkVuZCxcblx0XHRcdHByZWZlcnJlZFJhbmdlVG9SZXZlYWwsXG5cdFx0XHRtYXhFZGl0b3JXaWR0aDogdHJ1ZUNvbnRlbnRXaWR0aCArIGwuY29udGVudExlZnQsXG5cdFx0XHRjb250ZW50V2lkdGg6IHRydWVDb250ZW50V2lkdGgsXG5cdFx0XHRub25Db250ZW50V2lkdGg6IGwuY29udGVudExlZnQsIC8vIFdpZHRoIG9mIGFyZWEgdGhhdCBpcyBub3QgY29udGVudFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0KGRpbWVuc2lvbjogSURpbWVuc2lvbiwgZGVzaXJlZFByZXZpZXdFZGl0b3JTY3JvbGxMZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnByZXZpZXdFZGl0b3IubGF5b3V0KGRpbWVuc2lvbik7XG5cdFx0dGhpcy5fcHJldmlld0VkaXRvck9icy5lZGl0b3Iuc2V0U2Nyb2xsTGVmdChkZXNpcmVkUHJldmlld0VkaXRvclNjcm9sbExlZnQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yRGVjb3JhdGlvbnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzdGF0ZSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRjb25zdCBkaWZmID0ge1xuXHRcdFx0bW9kZTogJ2luc2VydGlvbklubGluZScgYXMgY29uc3QsXG5cdFx0XHRkaWZmOiBzdGF0ZS5kaWZmLFxuXHRcdH07XG5cdFx0Y29uc3Qgb3JpZ2luYWxEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCBtb2RpZmllZERlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgZGlmZldob2xlTGluZURlbGV0ZURlY29yYXRpb24gPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRcdGNsYXNzTmFtZTogJ2lubGluZUNvbXBsZXRpb25zLWNoYXItZGVsZXRlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnY2hhci1kZWxldGUnLFxuXHRcdFx0aXNXaG9sZUxpbmU6IGZhbHNlLFxuXHRcdFx0ekluZGV4OiAxLCAvLyBiZSBvbiB0b3Agb2YgZGlmZiBiYWNrZ3JvdW5kIGRlY29yYXRpb25cblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpZmZXaG9sZUxpbmVBZGREZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0XHRjbGFzc05hbWU6ICdpbmxpbmVDb21wbGV0aW9ucy1jaGFyLWluc2VydCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ2NoYXItaW5zZXJ0Jyxcblx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlmZkFkZERlY29yYXRpb24gPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRcdGNsYXNzTmFtZTogJ2lubGluZUNvbXBsZXRpb25zLWNoYXItaW5zZXJ0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnY2hhci1pbnNlcnQnLFxuXHRcdFx0c2hvdWxkRmlsbExpbmVPbkxpbmVCcmVhazogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGhpZGVFbXB0eUlubmVyRGVjb3JhdGlvbnMgPSB0cnVlOyAvLyBkaWZmLm1vZGUgPT09ICdsaW5lUmVwbGFjZW1lbnQnO1xuXHRcdGZvciAoY29uc3QgbSBvZiBkaWZmLmRpZmYpIHtcblx0XHRcdGlmIChtLm1vZGlmaWVkLmlzRW1wdHkgfHwgbS5vcmlnaW5hbC5pc0VtcHR5KSB7XG5cdFx0XHRcdGlmICghbS5vcmlnaW5hbC5pc0VtcHR5KSB7XG5cdFx0XHRcdFx0b3JpZ2luYWxEZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IG0ub3JpZ2luYWwudG9JbmNsdXNpdmVSYW5nZSgpISwgb3B0aW9uczogZGlmZldob2xlTGluZURlbGV0ZURlY29yYXRpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFtLm1vZGlmaWVkLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRtb2RpZmllZERlY29yYXRpb25zLnB1c2goeyByYW5nZTogbS5tb2RpZmllZC50b0luY2x1c2l2ZVJhbmdlKCkhLCBvcHRpb25zOiBkaWZmV2hvbGVMaW5lQWRkRGVjb3JhdGlvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpIG9mIG0uaW5uZXJDaGFuZ2VzIHx8IFtdKSB7XG5cdFx0XHRcdFx0Ly8gRG9uJ3Qgc2hvdyBlbXB0eSBtYXJrZXJzIG91dHNpZGUgdGhlIGxpbmUgcmFuZ2Vcblx0XHRcdFx0XHRpZiAobS5vcmlnaW5hbC5jb250YWlucyhpLm9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSAmJiAhKGhpZGVFbXB0eUlubmVyRGVjb3JhdGlvbnMgJiYgaS5vcmlnaW5hbFJhbmdlLmlzRW1wdHkoKSkpIHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBpLm9yaWdpbmFsUmFuZ2UsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2NoYXItZGVsZXRlJyxcblx0XHRcdFx0XHRcdFx0XHRzaG91bGRGaWxsTGluZU9uTGluZUJyZWFrOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRjbGFzc05hbWU6IGNsYXNzTmFtZXMoXG5cdFx0XHRcdFx0XHRcdFx0XHQnaW5saW5lQ29tcGxldGlvbnMtY2hhci1kZWxldGUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gaS5vcmlnaW5hbFJhbmdlLmlzU2luZ2xlTGluZSgpICYmIGRpZmYubW9kZSA9PT0gJ2luc2VydGlvbklubGluZScgJiYgJ3NpbmdsZS1saW5lLWlubGluZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRpLm9yaWdpbmFsUmFuZ2UuaXNFbXB0eSgpICYmICdlbXB0eScsXG5cdFx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdFx0XHR6SW5kZXg6IDFcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtLm1vZGlmaWVkLmNvbnRhaW5zKGkubW9kaWZpZWRSYW5nZS5zdGFydExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdFx0XHRtb2RpZmllZERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRyYW5nZTogaS5tb2RpZmllZFJhbmdlLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiBkaWZmQWRkRGVjb3JhdGlvblxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgb3JpZ2luYWxEZWNvcmF0aW9ucywgbW9kaWZpZWREZWNvcmF0aW9ucyB9O1xuXHR9KTtcbn1cblxuLypcbiAqIEdyb3dzIHRoZSByYW5nZSBvbiBlYWNoIGVuZHMgdW50aWwgaXQgaW5jbHVkZXMgYSBub25lLXZhcmlhYmxlLW5hbWUgY2hhcmFjdGVyXG4gKiBvciB0aGUgbmV4dCBjaGFyYWN0ZXIgd291bGQgYmUgYSB3aGl0ZXNwYWNlIGNoYXJhY3RlclxuICogb3IgdGhlIG1heEdyb3cgbGltaXQgaXMgcmVhY2hlZFxuICovXG5mdW5jdGlvbiBncm93VW50aWxWYXJpYWJsZUJvdW5kYXJpZXModGV4dE1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UsIG1heEdyb3c6IG51bWJlcik6IFJhbmdlIHtcblx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0Y29uc3QgZW5kUG9zaXRpb24gPSByYW5nZS5nZXRFbmRQb3NpdGlvbigpO1xuXHRjb25zdCBsaW5lID0gdGV4dE1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0UG9zaXRpb24ubGluZU51bWJlcik7XG5cblx0ZnVuY3Rpb24gaXNWYXJpYWJsZU5hbWVDaGFyYWN0ZXIoY29sOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFyID0gbGluZS5jaGFyQXQoY29sIC0gMSk7XG5cdFx0cmV0dXJuICgvW2EtekEtWjAtOV9dLykudGVzdChjaGFyKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzV2hpdGVzcGFjZShjb2w6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNoYXIgPSBsaW5lLmNoYXJBdChjb2wgLSAxKTtcblx0XHRyZXR1cm4gY2hhciA9PT0gJyAnIHx8IGNoYXIgPT09ICdcXHQnO1xuXHR9XG5cblx0bGV0IHN0YXJ0Q29sdW1uID0gc3RhcnRQb3NpdGlvbi5jb2x1bW47XG5cdHdoaWxlIChzdGFydENvbHVtbiA+IDEgJiYgaXNWYXJpYWJsZU5hbWVDaGFyYWN0ZXIoc3RhcnRDb2x1bW4pICYmICFpc1doaXRlc3BhY2Uoc3RhcnRDb2x1bW4gLSAxKSAmJiBzdGFydFBvc2l0aW9uLmNvbHVtbiAtIHN0YXJ0Q29sdW1uIDwgbWF4R3Jvdykge1xuXHRcdHN0YXJ0Q29sdW1uLS07XG5cdH1cblxuXHRsZXQgZW5kQ29sdW1uID0gZW5kUG9zaXRpb24uY29sdW1uIC0gMTtcblx0d2hpbGUgKGVuZENvbHVtbiA8PSBsaW5lLmxlbmd0aCAmJiBpc1ZhcmlhYmxlTmFtZUNoYXJhY3RlcihlbmRDb2x1bW4pICYmICFpc1doaXRlc3BhY2UoZW5kQ29sdW1uICsgMSkgJiYgZW5kQ29sdW1uIC0gZW5kUG9zaXRpb24uY29sdW1uIDwgbWF4R3Jvdykge1xuXHRcdGVuZENvbHVtbisrO1xuXHR9XG5cblx0cmV0dXJuIG5ldyBSYW5nZShzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRQb3NpdGlvbi5saW5lTnVtYmVyLCBlbmRDb2x1bW4gKyAxKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsYUFBYTtBQUN0QixTQUFzQixTQUFTLGlCQUEwQixTQUFTLHVCQUF1QjtBQUN6RixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUErQiw0QkFBNEI7QUFDM0QsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsbUJBQW1CO0FBRzVCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsNEJBQTRCLHNDQUFnRztBQUVySSxTQUFTLFlBQVksOEJBQThCO0FBQ25ELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsK0JBQStCO0FBa0J4QyxTQUFTLDJCQUEyQixrQkFBMEIsa0JBQTBCLFdBQThCO0FBQ3JILFFBQU0sZ0JBQWdCLEtBQUssSUFBSSxHQUFHLEtBQUssSUFBSSxXQUFXLGdCQUFnQixDQUFDO0FBQ3ZFLFFBQU0sa0JBQWtCLEtBQUssSUFBSSxHQUFHLGdCQUFnQixnQkFBZ0I7QUFDcEUsUUFBTSx5QkFBeUIsS0FBSyxJQUFJLFlBQVksR0FBRyxnQkFBZ0IsbUJBQW1CLENBQUM7QUFDM0YsU0FBTyxJQUFJLFVBQVUsaUJBQWlCLHNCQUFzQjtBQUM3RDtBQUVPLElBQU0sNEJBQU4sY0FBd0MsV0FBVztBQUFBLEVBU3pELFlBQ2tCLG1CQUNBLGFBQ0EsZUFDQSxZQUN1Qix1QkFDdkM7QUFDRCxVQUFNO0FBTlc7QUFDQTtBQUNBO0FBQ0E7QUFDdUI7QUFWekMsU0FBaUIsY0FBYyxFQUFFLElBQW9CO0FBQ3JELFNBQWdCLFVBQVUsRUFBRSxJQUFJLEVBQUUsT0FBTyxX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
