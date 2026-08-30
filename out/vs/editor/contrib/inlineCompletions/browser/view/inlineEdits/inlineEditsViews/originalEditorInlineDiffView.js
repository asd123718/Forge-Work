import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { autorunWithStore, derived, observableFromEvent } from "../../../../../../../base/common/observable.js";
import { MouseTargetType } from "../../../../../../browser/editorBrowser.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { rangeIsSingleLine } from "../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/diffEditorViewZones.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { Range } from "../../../../../../common/core/range.js";
import { EndOfLinePreference, InjectedTextCursorStops } from "../../../../../../common/model.js";
import { ModelDecorationOptions } from "../../../../../../common/model/textModel.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { classNames } from "../utils/utils.js";
import { InlineCompletionEditorType } from "../../../model/provideInlineCompletions.js";
class OriginalEditorInlineDiffView extends Disposable {
  constructor(_originalEditor, _state, _modifiedTextModel) {
    super();
    this._originalEditor = _originalEditor;
    this._state = _state;
    this._modifiedTextModel = _modifiedTextModel;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this.isHovered = observableCodeEditor(this._originalEditor).isTargetHovered(
      (p) => p.target.type === MouseTargetType.CONTENT_TEXT && p.target.detail.injectedText?.options.attachedData instanceof InlineEditAttachedData && p.target.detail.injectedText.options.attachedData.owner === this,
      this._store
    );
    this._tokenizationFinished = modelTokenizationFinished(this._modifiedTextModel);
    this._decorations = derived(this, (reader) => {
      const diff = this._state.read(reader);
      if (!diff) {
        return void 0;
      }
      const modified = diff.modifiedText;
      const showInline = diff.mode === "insertionInline";
      const hasOneInnerChange = diff.diff.length === 1 && diff.diff[0].innerChanges?.length === 1;
      const showEmptyDecorations = true;
      const originalDecorations = [];
      const modifiedDecorations = [];
      const diffLineAddDecorationBackground = ModelDecorationOptions.register({
        className: "inlineCompletions-line-insert",
        description: "line-insert",
        isWholeLine: true,
        marginClassName: "gutter-insert"
      });
      const diffLineDeleteDecorationBackground = ModelDecorationOptions.register({
        className: "inlineCompletions-line-delete",
        description: "line-delete",
        isWholeLine: true,
        marginClassName: "gutter-delete"
      });
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
      const diffAddDecorationEmpty = ModelDecorationOptions.register({
        className: "inlineCompletions-char-insert diff-range-empty",
        description: "char-insert diff-range-empty"
      });
      const NESOriginalBackground = ModelDecorationOptions.register({
        className: "inlineCompletions-original-lines",
        description: "inlineCompletions-original-lines",
        isWholeLine: false,
        shouldFillLineOnLineBreak: true
      });
      const showFullLineDecorations = diff.mode !== "sideBySide" && diff.mode !== "deletion" && diff.mode !== "insertionInline" && diff.mode !== "lineReplacement";
      const hideEmptyInnerDecorations = diff.mode === "lineReplacement";
      for (const m of diff.diff) {
        if (showFullLineDecorations) {
          if (!m.original.isEmpty) {
            originalDecorations.push({
              range: m.original.toInclusiveRange(),
              options: diffLineDeleteDecorationBackground
            });
          }
          if (!m.modified.isEmpty) {
            modifiedDecorations.push({
              range: m.modified.toInclusiveRange(),
              options: diffLineAddDecorationBackground
            });
          }
        }
        if (m.modified.isEmpty || m.original.isEmpty) {
          if (!m.original.isEmpty) {
            originalDecorations.push({ range: m.original.toInclusiveRange(), options: diffWholeLineDeleteDecoration });
          }
          if (!m.modified.isEmpty) {
            modifiedDecorations.push({ range: m.modified.toInclusiveRange(), options: diffWholeLineAddDecoration });
          }
        } else {
          const useInlineDiff = showInline && allowsTrueInlineDiffRendering(m);
          for (const i2 of m.innerChanges || []) {
            if (m.original.contains(i2.originalRange.startLineNumber) && !(hideEmptyInnerDecorations && i2.originalRange.isEmpty())) {
              const replacedText = this._originalEditor.getModel()?.getValueInRange(i2.originalRange, EndOfLinePreference.LF);
              originalDecorations.push({
                range: i2.originalRange,
                options: {
                  description: "char-delete",
                  shouldFillLineOnLineBreak: false,
                  className: classNames(
                    "inlineCompletions-char-delete",
                    i2.originalRange.isSingleLine() && diff.mode === "insertionInline" && "single-line-inline",
                    i2.originalRange.isEmpty() && "empty",
                    (i2.originalRange.isEmpty() && hasOneInnerChange || diff.mode === "deletion" && replacedText === "\n") && showEmptyDecorations && !useInlineDiff && "diff-range-empty"
                  ),
                  inlineClassName: useInlineDiff ? classNames("strike-through", "inlineCompletions") : null,
                  zIndex: 1
                }
              });
            }
            if (m.modified.contains(i2.modifiedRange.startLineNumber)) {
              modifiedDecorations.push({
                range: i2.modifiedRange,
                options: i2.modifiedRange.isEmpty() && showEmptyDecorations && !useInlineDiff && hasOneInnerChange ? diffAddDecorationEmpty : diffAddDecoration
              });
            }
            if (useInlineDiff) {
              const insertedText = modified.getValueOfRange(i2.modifiedRange);
              const textSegments = insertedText.length > 3 ? [
                { text: insertedText.slice(0, 1), extraClasses: ["start"], offsetRange: new OffsetRange(i2.modifiedRange.startColumn - 1, i2.modifiedRange.startColumn) },
                { text: insertedText.slice(1, -1), extraClasses: [], offsetRange: new OffsetRange(i2.modifiedRange.startColumn, i2.modifiedRange.endColumn - 2) },
                { text: insertedText.slice(-1), extraClasses: ["end"], offsetRange: new OffsetRange(i2.modifiedRange.endColumn - 2, i2.modifiedRange.endColumn - 1) }
              ] : [
                { text: insertedText, extraClasses: ["start", "end"], offsetRange: new OffsetRange(i2.modifiedRange.startColumn - 1, i2.modifiedRange.endColumn) }
              ];
              this._tokenizationFinished.read(reader);
              const lineTokens = this._modifiedTextModel.tokenization.getLineTokens(i2.modifiedRange.startLineNumber);
              for (const { text, extraClasses, offsetRange } of textSegments) {
                originalDecorations.push({
                  range: Range.fromPositions(i2.originalRange.getEndPosition()),
                  options: {
                    description: "inserted-text",
                    before: {
                      tokens: lineTokens.getTokensInRange(offsetRange),
                      content: text,
                      inlineClassName: classNames(
                        "inlineCompletions-char-insert",
                        i2.modifiedRange.isSingleLine() && diff.mode === "insertionInline" && "single-line-inline",
                        ...extraClasses
                        // include extraClasses for additional styling if provided
                      ),
                      cursorStops: InjectedTextCursorStops.None,
                      attachedData: new InlineEditAttachedData(this)
                    },
                    zIndex: 2,
                    showIfCollapsed: true
                  }
                });
              }
            }
          }
        }
      }
      if (diff.editorType === InlineCompletionEditorType.DiffEditor) {
        for (const m of diff.diff) {
          if (!m.original.isEmpty) {
            originalDecorations.push({
              range: m.original.toExclusiveRange(),
              options: NESOriginalBackground
            });
          }
        }
      }
      return { originalDecorations, modifiedDecorations };
    });
    this._register(observableCodeEditor(this._originalEditor).setDecorations(this._decorations.map((d) => d?.originalDecorations ?? [])));
    const modifiedCodeEditor = this._state.map((s) => s?.modifiedCodeEditor);
    this._register(autorunWithStore((reader, store) => {
      const e = modifiedCodeEditor.read(reader);
      if (e) {
        store.add(observableCodeEditor(e).setDecorations(this._decorations.map((d) => d?.modifiedDecorations ?? [])));
      }
    }));
    this._register(this._originalEditor.onMouseUp((e) => {
      if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
        return;
      }
      const a = e.target.detail.injectedText?.options.attachedData;
      if (a instanceof InlineEditAttachedData && a.owner === this) {
        this._onDidClick.fire(new InlineEditClickEvent(e.event));
      }
    }));
  }
  static supportsInlineDiffRendering(mapping) {
    return allowsTrueInlineDiffRendering(mapping);
  }
}
class InlineEditAttachedData {
  constructor(owner) {
    this.owner = owner;
  }
}
function allowsTrueInlineDiffRendering(mapping) {
  if (!mapping.innerChanges) {
    return false;
  }
  return mapping.innerChanges.every((c) => rangeIsSingleLine(c.modifiedRange) && rangeIsSingleLine(c.originalRange));
}
let i = 0;
function modelTokenizationFinished(model) {
  return observableFromEvent(model.onDidChangeTokens, () => i++);
}
export {
  OriginalEditorInlineDiffView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcb3JpZ2luYWxFZGl0b3JJbmxpbmVEaWZmVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW5XaXRoU3RvcmUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyByYW5nZUlzU2luZ2xlTGluZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvY29tcG9uZW50cy9kaWZmRWRpdG9yVmlld1pvbmVzL2RpZmZFZGl0b3JWaWV3Wm9uZXMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS90ZXh0L2Fic3RyYWN0VGV4dC5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lUHJlZmVyZW5jZSwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJbmplY3RlZFRleHRDdXJzb3JTdG9wcywgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJSW5saW5lRWRpdHNWaWV3LCBJbmxpbmVFZGl0Q2xpY2tFdmVudCB9IGZyb20gJy4uL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBjbGFzc05hbWVzIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUgfSBmcm9tICcuLi8uLi8uLi9tb2RlbC9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElPcmlnaW5hbEVkaXRvcklubGluZURpZmZWaWV3U3RhdGUge1xuXHRkaWZmOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXTtcblx0bW9kaWZpZWRUZXh0OiBBYnN0cmFjdFRleHQ7XG5cdG1vZGU6ICdpbnNlcnRpb25JbmxpbmUnIHwgJ3NpZGVCeVNpZGUnIHwgJ2RlbGV0aW9uJyB8ICdsaW5lUmVwbGFjZW1lbnQnO1xuXHRlZGl0b3JUeXBlOiBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZTtcblxuXHRtb2RpZmllZENvZGVFZGl0b3I6IElDb2RlRWRpdG9yO1xufVxuXG5leHBvcnQgY2xhc3MgT3JpZ2luYWxFZGl0b3JJbmxpbmVEaWZmVmlldyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSW5saW5lRWRpdHNWaWV3IHtcblx0cHVibGljIHN0YXRpYyBzdXBwb3J0c0lubGluZURpZmZSZW5kZXJpbmcobWFwcGluZzogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGFsbG93c1RydWVJbmxpbmVEaWZmUmVuZGVyaW5nKG1hcHBpbmcpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElubGluZUVkaXRDbGlja0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGljayA9IHRoaXMuX29uRGlkQ2xpY2suZXZlbnQ7XG5cblx0cmVhZG9ubHkgaXNIb3ZlcmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuaXphdGlvbkZpbmlzaGVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsRWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogSU9ic2VydmFibGU8SU9yaWdpbmFsRWRpdG9ySW5saW5lRGlmZlZpZXdTdGF0ZSB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRUZXh0TW9kZWw6IElUZXh0TW9kZWwsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5pc0hvdmVyZWQgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLl9vcmlnaW5hbEVkaXRvcikuaXNUYXJnZXRIb3ZlcmVkKFxuXHRcdFx0cCA9PiBwLnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUICYmXG5cdFx0XHRcdHAudGFyZ2V0LmRldGFpbC5pbmplY3RlZFRleHQ/Lm9wdGlvbnMuYXR0YWNoZWREYXRhIGluc3RhbmNlb2YgSW5saW5lRWRpdEF0dGFjaGVkRGF0YSAmJlxuXHRcdFx0XHRwLnRhcmdldC5kZXRhaWwuaW5qZWN0ZWRUZXh0Lm9wdGlvbnMuYXR0YWNoZWREYXRhLm93bmVyID09PSB0aGlzLFxuXHRcdFx0dGhpcy5fc3RvcmVcblx0XHQpO1xuXHRcdHRoaXMuX3Rva2VuaXphdGlvbkZpbmlzaGVkID0gbW9kZWxUb2tlbml6YXRpb25GaW5pc2hlZCh0aGlzLl9tb2RpZmllZFRleHRNb2RlbCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFkaWZmKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0Y29uc3QgbW9kaWZpZWQgPSBkaWZmLm1vZGlmaWVkVGV4dDtcblx0XHRcdGNvbnN0IHNob3dJbmxpbmUgPSBkaWZmLm1vZGUgPT09ICdpbnNlcnRpb25JbmxpbmUnO1xuXHRcdFx0Y29uc3QgaGFzT25lSW5uZXJDaGFuZ2UgPSBkaWZmLmRpZmYubGVuZ3RoID09PSAxICYmIGRpZmYuZGlmZlswXS5pbm5lckNoYW5nZXM/Lmxlbmd0aCA9PT0gMTtcblxuXHRcdFx0Y29uc3Qgc2hvd0VtcHR5RGVjb3JhdGlvbnMgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbERlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWREZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgZGlmZkxpbmVBZGREZWNvcmF0aW9uQmFja2dyb3VuZCA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdFx0XHRjbGFzc05hbWU6ICdpbmxpbmVDb21wbGV0aW9ucy1saW5lLWluc2VydCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnbGluZS1pbnNlcnQnLFxuXHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdFx0bWFyZ2luQ2xhc3NOYW1lOiAnZ3V0dGVyLWluc2VydCcsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZGlmZkxpbmVEZWxldGVEZWNvcmF0aW9uQmFja2dyb3VuZCA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdFx0XHRjbGFzc05hbWU6ICdpbmxpbmVDb21wbGV0aW9ucy1saW5lLWRlbGV0ZScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnbGluZS1kZWxldGUnLFxuXHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdFx0bWFyZ2luQ2xhc3NOYW1lOiAnZ3V0dGVyLWRlbGV0ZScsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZGlmZldob2xlTGluZURlbGV0ZURlY29yYXRpb24gPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRcdFx0Y2xhc3NOYW1lOiAnaW5saW5lQ29tcGxldGlvbnMtY2hhci1kZWxldGUnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ2NoYXItZGVsZXRlJyxcblx0XHRcdFx0aXNXaG9sZUxpbmU6IGZhbHNlLFxuXHRcdFx0XHR6SW5kZXg6IDEsIC8vIGJlIG9uIHRvcCBvZiBkaWZmIGJhY2tncm91bmQgZGVjb3JhdGlvblxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGRpZmZXaG9sZUxpbmVBZGREZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0XHRcdGNsYXNzTmFtZTogJ2lubGluZUNvbXBsZXRpb25zLWNoYXItaW5zZXJ0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdjaGFyLWluc2VydCcsXG5cdFx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGRpZmZBZGREZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0XHRcdGNsYXNzTmFtZTogJ2lubGluZUNvbXBsZXRpb25zLWNoYXItaW5zZXJ0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdjaGFyLWluc2VydCcsXG5cdFx0XHRcdHNob3VsZEZpbGxMaW5lT25MaW5lQnJlYWs6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZGlmZkFkZERlY29yYXRpb25FbXB0eSA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdFx0XHRjbGFzc05hbWU6ICdpbmxpbmVDb21wbGV0aW9ucy1jaGFyLWluc2VydCBkaWZmLXJhbmdlLWVtcHR5Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdjaGFyLWluc2VydCBkaWZmLXJhbmdlLWVtcHR5Jyxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBORVNPcmlnaW5hbEJhY2tncm91bmQgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRcdFx0Y2xhc3NOYW1lOiAnaW5saW5lQ29tcGxldGlvbnMtb3JpZ2luYWwtbGluZXMnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ2lubGluZUNvbXBsZXRpb25zLW9yaWdpbmFsLWxpbmVzJyxcblx0XHRcdFx0aXNXaG9sZUxpbmU6IGZhbHNlLFxuXHRcdFx0XHRzaG91bGRGaWxsTGluZU9uTGluZUJyZWFrOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNob3dGdWxsTGluZURlY29yYXRpb25zID0gZGlmZi5tb2RlICE9PSAnc2lkZUJ5U2lkZScgJiYgZGlmZi5tb2RlICE9PSAnZGVsZXRpb24nICYmIGRpZmYubW9kZSAhPT0gJ2luc2VydGlvbklubGluZScgJiYgZGlmZi5tb2RlICE9PSAnbGluZVJlcGxhY2VtZW50Jztcblx0XHRcdGNvbnN0IGhpZGVFbXB0eUlubmVyRGVjb3JhdGlvbnMgPSBkaWZmLm1vZGUgPT09ICdsaW5lUmVwbGFjZW1lbnQnO1xuXHRcdFx0Zm9yIChjb25zdCBtIG9mIGRpZmYuZGlmZikge1xuXHRcdFx0XHRpZiAoc2hvd0Z1bGxMaW5lRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0XHRpZiAoIW0ub3JpZ2luYWwuaXNFbXB0eSkge1xuXHRcdFx0XHRcdFx0b3JpZ2luYWxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IG0ub3JpZ2luYWwudG9JbmNsdXNpdmVSYW5nZSgpISxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogZGlmZkxpbmVEZWxldGVEZWNvcmF0aW9uQmFja2dyb3VuZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIW0ubW9kaWZpZWQuaXNFbXB0eSkge1xuXHRcdFx0XHRcdFx0bW9kaWZpZWREZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IG0ubW9kaWZpZWQudG9JbmNsdXNpdmVSYW5nZSgpISxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogZGlmZkxpbmVBZGREZWNvcmF0aW9uQmFja2dyb3VuZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtLm1vZGlmaWVkLmlzRW1wdHkgfHwgbS5vcmlnaW5hbC5pc0VtcHR5KSB7XG5cdFx0XHRcdFx0aWYgKCFtLm9yaWdpbmFsLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBtLm9yaWdpbmFsLnRvSW5jbHVzaXZlUmFuZ2UoKSEsIG9wdGlvbnM6IGRpZmZXaG9sZUxpbmVEZWxldGVEZWNvcmF0aW9uIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIW0ubW9kaWZpZWQuaXNFbXB0eSkge1xuXHRcdFx0XHRcdFx0bW9kaWZpZWREZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IG0ubW9kaWZpZWQudG9JbmNsdXNpdmVSYW5nZSgpISwgb3B0aW9uczogZGlmZldob2xlTGluZUFkZERlY29yYXRpb24gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHVzZUlubGluZURpZmYgPSBzaG93SW5saW5lICYmIGFsbG93c1RydWVJbmxpbmVEaWZmUmVuZGVyaW5nKG0pO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgaSBvZiBtLmlubmVyQ2hhbmdlcyB8fCBbXSkge1xuXHRcdFx0XHRcdFx0Ly8gRG9uJ3Qgc2hvdyBlbXB0eSBtYXJrZXJzIG91dHNpZGUgdGhlIGxpbmUgcmFuZ2Vcblx0XHRcdFx0XHRcdGlmIChtLm9yaWdpbmFsLmNvbnRhaW5zKGkub3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIpICYmICEoaGlkZUVtcHR5SW5uZXJEZWNvcmF0aW9ucyAmJiBpLm9yaWdpbmFsUmFuZ2UuaXNFbXB0eSgpKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXBsYWNlZFRleHQgPSB0aGlzLl9vcmlnaW5hbEVkaXRvci5nZXRNb2RlbCgpPy5nZXRWYWx1ZUluUmFuZ2UoaS5vcmlnaW5hbFJhbmdlLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKTtcblx0XHRcdFx0XHRcdFx0b3JpZ2luYWxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRyYW5nZTogaS5vcmlnaW5hbFJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnY2hhci1kZWxldGUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0c2hvdWxkRmlsbExpbmVPbkxpbmVCcmVhazogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRjbGFzc05hbWU6IGNsYXNzTmFtZXMoXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdpbmxpbmVDb21wbGV0aW9ucy1jaGFyLWRlbGV0ZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGkub3JpZ2luYWxSYW5nZS5pc1NpbmdsZUxpbmUoKSAmJiBkaWZmLm1vZGUgPT09ICdpbnNlcnRpb25JbmxpbmUnICYmICdzaW5nbGUtbGluZS1pbmxpbmUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRpLm9yaWdpbmFsUmFuZ2UuaXNFbXB0eSgpICYmICdlbXB0eScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCgoaS5vcmlnaW5hbFJhbmdlLmlzRW1wdHkoKSAmJiBoYXNPbmVJbm5lckNoYW5nZSB8fCBkaWZmLm1vZGUgPT09ICdkZWxldGlvbicgJiYgcmVwbGFjZWRUZXh0ID09PSAnXFxuJykgJiYgc2hvd0VtcHR5RGVjb3JhdGlvbnMgJiYgIXVzZUlubGluZURpZmYpICYmICdkaWZmLXJhbmdlLWVtcHR5J1xuXHRcdFx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogdXNlSW5saW5lRGlmZiA/IGNsYXNzTmFtZXMoJ3N0cmlrZS10aHJvdWdoJywgJ2lubGluZUNvbXBsZXRpb25zJykgOiBudWxsLFxuXHRcdFx0XHRcdFx0XHRcdFx0ekluZGV4OiAxXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChtLm1vZGlmaWVkLmNvbnRhaW5zKGkubW9kaWZpZWRSYW5nZS5zdGFydExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IGkubW9kaWZpZWRSYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRvcHRpb25zOiAoaS5tb2RpZmllZFJhbmdlLmlzRW1wdHkoKSAmJiBzaG93RW1wdHlEZWNvcmF0aW9ucyAmJiAhdXNlSW5saW5lRGlmZiAmJiBoYXNPbmVJbm5lckNoYW5nZSlcblx0XHRcdFx0XHRcdFx0XHRcdD8gZGlmZkFkZERlY29yYXRpb25FbXB0eVxuXHRcdFx0XHRcdFx0XHRcdFx0OiBkaWZmQWRkRGVjb3JhdGlvblxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICh1c2VJbmxpbmVEaWZmKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGluc2VydGVkVGV4dCA9IG1vZGlmaWVkLmdldFZhbHVlT2ZSYW5nZShpLm1vZGlmaWVkUmFuZ2UpO1xuXHRcdFx0XHRcdFx0XHQvLyB3aGVuIHRoZSBpbmplY3RlZCB0ZXh0IGJlY29tZXMgbG9uZywgdGhlIGVkaXRvciB3aWxsIHNwbGl0IGl0IGludG8gbXVsdGlwbGUgc3BhbnNcblx0XHRcdFx0XHRcdFx0Ly8gdG8gYmUgYWJsZSB0byBnZXQgdGhlIGJvcmRlciBhcm91bmQgdGhlIHN0YXJ0IGFuZCBlbmQgb2YgdGhlIHRleHQsIHdlIG5lZWQgdG8gc3BsaXQgaXQgaW50byBtdWx0aXBsZSBzZWdtZW50c1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0ZXh0U2VnbWVudHMgPSBpbnNlcnRlZFRleHQubGVuZ3RoID4gMyA/XG5cdFx0XHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0ZXh0OiBpbnNlcnRlZFRleHQuc2xpY2UoMCwgMSksIGV4dHJhQ2xhc3NlczogWydzdGFydCddLCBvZmZzZXRSYW5nZTogbmV3IE9mZnNldFJhbmdlKGkubW9kaWZpZWRSYW5nZS5zdGFydENvbHVtbiAtIDEsIGkubW9kaWZpZWRSYW5nZS5zdGFydENvbHVtbikgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgdGV4dDogaW5zZXJ0ZWRUZXh0LnNsaWNlKDEsIC0xKSwgZXh0cmFDbGFzc2VzOiBbXSwgb2Zmc2V0UmFuZ2U6IG5ldyBPZmZzZXRSYW5nZShpLm1vZGlmaWVkUmFuZ2Uuc3RhcnRDb2x1bW4sIGkubW9kaWZpZWRSYW5nZS5lbmRDb2x1bW4gLSAyKSB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0eyB0ZXh0OiBpbnNlcnRlZFRleHQuc2xpY2UoLTEpLCBleHRyYUNsYXNzZXM6IFsnZW5kJ10sIG9mZnNldFJhbmdlOiBuZXcgT2Zmc2V0UmFuZ2UoaS5tb2RpZmllZFJhbmdlLmVuZENvbHVtbiAtIDIsIGkubW9kaWZpZWRSYW5nZS5lbmRDb2x1bW4gLSAxKSB9XG5cdFx0XHRcdFx0XHRcdFx0XSA6XG5cdFx0XHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0ZXh0OiBpbnNlcnRlZFRleHQsIGV4dHJhQ2xhc3NlczogWydzdGFydCcsICdlbmQnXSwgb2Zmc2V0UmFuZ2U6IG5ldyBPZmZzZXRSYW5nZShpLm1vZGlmaWVkUmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCBpLm1vZGlmaWVkUmFuZ2UuZW5kQ29sdW1uKSB9XG5cdFx0XHRcdFx0XHRcdFx0XTtcblxuXHRcdFx0XHRcdFx0XHQvLyBUb2tlbml6YXRpb25cblx0XHRcdFx0XHRcdFx0dGhpcy5fdG9rZW5pemF0aW9uRmluaXNoZWQucmVhZChyZWFkZXIpOyAvLyByZWNvbnNpZGVyIHdoZW4gdG9rZW5pemF0aW9uIGlzIGZpbmlzaGVkXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSB0aGlzLl9tb2RpZmllZFRleHRNb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhpLm1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblxuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHsgdGV4dCwgZXh0cmFDbGFzc2VzLCBvZmZzZXRSYW5nZSB9IG9mIHRleHRTZWdtZW50cykge1xuXHRcdFx0XHRcdFx0XHRcdG9yaWdpbmFsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhpLm9yaWdpbmFsUmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSksXG5cdFx0XHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnaW5zZXJ0ZWQtdGV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJlZm9yZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHRva2VuczogbGluZVRva2Vucy5nZXRUb2tlbnNJblJhbmdlKG9mZnNldFJhbmdlKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50OiB0ZXh0LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogY2xhc3NOYW1lcyhcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdpbmxpbmVDb21wbGV0aW9ucy1jaGFyLWluc2VydCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpLm1vZGlmaWVkUmFuZ2UuaXNTaW5nbGVMaW5lKCkgJiYgZGlmZi5tb2RlID09PSAnaW5zZXJ0aW9uSW5saW5lJyAmJiAnc2luZ2xlLWxpbmUtaW5saW5lJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC4uLmV4dHJhQ2xhc3NlcyAvLyBpbmNsdWRlIGV4dHJhQ2xhc3NlcyBmb3IgYWRkaXRpb25hbCBzdHlsaW5nIGlmIHByb3ZpZGVkXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjdXJzb3JTdG9wczogSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMuTm9uZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhdHRhY2hlZERhdGE6IG5ldyBJbmxpbmVFZGl0QXR0YWNoZWREYXRhKHRoaXMpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR6SW5kZXg6IDIsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGlmZi5lZGl0b3JUeXBlID09PSBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5EaWZmRWRpdG9yKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbSBvZiBkaWZmLmRpZmYpIHtcblx0XHRcdFx0XHRpZiAoIW0ub3JpZ2luYWwuaXNFbXB0eSkge1xuXHRcdFx0XHRcdFx0b3JpZ2luYWxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IG0ub3JpZ2luYWwudG9FeGNsdXNpdmVSYW5nZSgpLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiBORVNPcmlnaW5hbEJhY2tncm91bmQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgb3JpZ2luYWxEZWNvcmF0aW9ucywgbW9kaWZpZWREZWNvcmF0aW9ucyB9O1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIob2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fb3JpZ2luYWxFZGl0b3IpLnNldERlY29yYXRpb25zKHRoaXMuX2RlY29yYXRpb25zLm1hcChkID0+IGQ/Lm9yaWdpbmFsRGVjb3JhdGlvbnMgPz8gW10pKSk7XG5cblx0XHRjb25zdCBtb2RpZmllZENvZGVFZGl0b3IgPSB0aGlzLl9zdGF0ZS5tYXAocyA9PiBzPy5tb2RpZmllZENvZGVFZGl0b3IpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdGNvbnN0IGUgPSBtb2RpZmllZENvZGVFZGl0b3IucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0c3RvcmUuYWRkKG9ic2VydmFibGVDb2RlRWRpdG9yKGUpLnNldERlY29yYXRpb25zKHRoaXMuX2RlY29yYXRpb25zLm1hcChkID0+IGQ/Lm1vZGlmaWVkRGVjb3JhdGlvbnMgPz8gW10pKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb3JpZ2luYWxFZGl0b3Iub25Nb3VzZVVwKGUgPT4ge1xuXHRcdFx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1RFWFQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYSA9IGUudGFyZ2V0LmRldGFpbC5pbmplY3RlZFRleHQ/Lm9wdGlvbnMuYXR0YWNoZWREYXRhO1xuXHRcdFx0aWYgKGEgaW5zdGFuY2VvZiBJbmxpbmVFZGl0QXR0YWNoZWREYXRhICYmIGEub3duZXIgPT09IHRoaXMpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDbGljay5maXJlKG5ldyBJbmxpbmVFZGl0Q2xpY2tFdmVudChlLmV2ZW50KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnM7XG59XG5cbmNsYXNzIElubGluZUVkaXRBdHRhY2hlZERhdGEge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgb3duZXI6IE9yaWdpbmFsRWRpdG9ySW5saW5lRGlmZlZpZXcpIHsgfVxufVxuXG5mdW5jdGlvbiBhbGxvd3NUcnVlSW5saW5lRGlmZlJlbmRlcmluZyhtYXBwaW5nOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcpOiBib29sZWFuIHtcblx0aWYgKCFtYXBwaW5nLmlubmVyQ2hhbmdlcykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gbWFwcGluZy5pbm5lckNoYW5nZXMuZXZlcnkoYyA9PlxuXHRcdChyYW5nZUlzU2luZ2xlTGluZShjLm1vZGlmaWVkUmFuZ2UpICYmIHJhbmdlSXNTaW5nbGVMaW5lKGMub3JpZ2luYWxSYW5nZSkpKTtcbn1cblxubGV0IGkgPSAwO1xuZnVuY3Rpb24gbW9kZWxUb2tlbml6YXRpb25GaW5pc2hlZChtb2RlbDogSVRleHRNb2RlbCk6IElPYnNlcnZhYmxlPG51bWJlcj4ge1xuXHRyZXR1cm4gb2JzZXJ2YWJsZUZyb21FdmVudChtb2RlbC5vbkRpZENoYW5nZVRva2VucywgKCkgPT4gaSsrKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQixTQUFzQiwyQkFBMkI7QUFDNUUsU0FBc0IsdUJBQXVCO0FBQzdDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUd0QixTQUFTLHFCQUE0QywrQkFBMkM7QUFDaEcsU0FBUyw4QkFBOEI7QUFDdkMsU0FBMkIsNEJBQTRCO0FBQ3ZELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0NBQWtDO0FBV3BDLE1BQU0scUNBQXFDLFdBQXVDO0FBQUEsRUFZeEYsWUFDa0IsaUJBQ0EsUUFDQSxvQkFDaEI7QUFDRCxVQUFNO0FBSlc7QUFDQTtBQUNBO0FBVmxCLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBOEIsQ0FBQztBQUNqRixTQUFTLGFBQWEsS0FBSyxZQUFZO0FBWXRDLFNBQUssWUFBWSxxQkFBcUIsS0FBSyxlQUFlLEVBQUU7QUFBQSxNQUMzRCxPQUFLLEVBQUUsT0FBTyxTQUFTLGdCQUFnQixnQkFDdEMsRUFBRSxPQUFPLE9BQU8sY0FBYyxRQUFRLHdCQUF3QiwwQkFDOUQsRUFBRSxPQUFPLE9BQU8sYUFBYSxRQUFRLGFBQWEsVUFBVTtBQUFBLE1BQzdELEtBQUs7QUFBQSxJQUNOO0FBQ0EsU0FBSyx3QkFBd0IsMEJBQTBCLEtBQUssa0JBQWtCO0FBQzlFLFNBQUssZUFBZSxRQUFR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
