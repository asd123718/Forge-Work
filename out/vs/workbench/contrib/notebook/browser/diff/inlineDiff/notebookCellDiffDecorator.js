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
import { DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorunWithStore, derived, observableFromEvent } from "../../../../../../base/common/observable.js";
import { ThrottledDelayer } from "../../../../../../base/common/async.js";
import { IEditorWorkerService } from "../../../../../../editor/common/services/editorWorker.js";
import { EditorOption } from "../../../../../../editor/common/config/editorOptions.js";
import { themeColorFromId } from "../../../../../../base/common/themables.js";
import { RenderOptions, LineSource, renderLines } from "../../../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js";
import { diffAddDecoration, diffWholeLineAddDecoration, diffDeleteDecoration } from "../../../../../../editor/browser/widget/diffEditor/registrations.contribution.js";
import { TrackedRangeStickiness, MinimapPosition, OverviewRulerLane } from "../../../../../../editor/common/model.js";
import { ModelDecorationOptions } from "../../../../../../editor/common/model/textModel.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from "../../../../scm/common/quickDiff.js";
import { INotebookOriginalCellModelFactory } from "./notebookOriginalCellModelFactory.js";
import { InlineDecoration, InlineDecorationType } from "../../../../../../editor/common/viewModel/inlineDecorations.js";
let NotebookCellDiffDecorator = class extends DisposableStore {
  constructor(notebookEditor, modifiedCell, originalCell, editor, _editorWorkerService, originalCellModelFactory) {
    super();
    this.modifiedCell = modifiedCell;
    this.originalCell = originalCell;
    this.editor = editor;
    this._editorWorkerService = _editorWorkerService;
    this.originalCellModelFactory = originalCellModelFactory;
    this._viewZones = [];
    this.throttledDecorator = this.add(new ThrottledDelayer(50));
    this.perEditorDisposables = this.add(new DisposableStore());
    const onDidChangeVisibleRanges = observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges);
    const editorObs = derived((r) => {
      const visibleRanges = onDidChangeVisibleRanges.read(r);
      const visibleCellHandles = visibleRanges.map((range) => notebookEditor.getCellsInRange(range)).flat().map((c) => c.handle);
      if (!visibleCellHandles.includes(modifiedCell.handle)) {
        return;
      }
      const editor2 = notebookEditor.codeEditors.find((item) => item[0].handle === modifiedCell.handle)?.[1];
      if (editor2?.getModel() !== this.modifiedCell.textModel) {
        return;
      }
      return editor2;
    });
    this.add(autorunWithStore((r, store) => {
      const editor2 = editorObs.read(r);
      this.perEditorDisposables.clear();
      if (editor2) {
        store.add(editor2.onDidChangeModel(() => {
          this.perEditorDisposables.clear();
        }));
        store.add(editor2.onDidChangeModelContent(() => {
          this.update(editor2);
        }));
        store.add(editor2.onDidChangeConfiguration((e) => {
          if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.lineHeight)) {
            this.update(editor2);
          }
        }));
        this.update(editor2);
      }
    }));
  }
  update(editor) {
    this.throttledDecorator.trigger(() => this._updateImpl(editor));
  }
  async _updateImpl(editor) {
    if (this.isDisposed) {
      return;
    }
    if (editor.getOption(EditorOption.inDiffEditor)) {
      this.perEditorDisposables.clear();
      return;
    }
    const model = editor.getModel();
    if (!model || model !== this.modifiedCell.textModel) {
      this.perEditorDisposables.clear();
      return;
    }
    const originalModel = this.getOrCreateOriginalModel(editor);
    if (!originalModel) {
      this.perEditorDisposables.clear();
      return;
    }
    const version = model.getVersionId();
    const diff = await this._editorWorkerService.computeDiff(
      originalModel.uri,
      model.uri,
      { computeMoves: true, ignoreTrimWhitespace: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER },
      "advanced"
    );
    if (this.isDisposed) {
      return;
    }
    if (diff && !diff.identical && this.modifiedCell.textModel && originalModel && model === editor.getModel() && editor.getModel()?.getVersionId() === version) {
      this._updateWithDiff(editor, originalModel, diff, this.modifiedCell.textModel);
    } else {
      this.perEditorDisposables.clear();
    }
  }
  getOrCreateOriginalModel(editor) {
    if (!this._originalModel) {
      const model = editor.getModel();
      if (!model) {
        return;
      }
      this._originalModel = this.add(this.originalCellModelFactory.getOrCreate(model.uri, this.originalCell.getValue(), model.getLanguageId(), this.modifiedCell.cellKind)).object;
    }
    return this._originalModel;
  }
  _updateWithDiff(editor, originalModel, diff, currentModel) {
    if (areDiffsEqual(diff, this.diffForPreviouslyAppliedDecorators)) {
      return;
    }
    this.perEditorDisposables.clear();
    const decorations = editor.createDecorationsCollection();
    this.perEditorDisposables.add(toDisposable(() => {
      editor.changeViewZones((viewZoneChangeAccessor) => {
        for (const id of this._viewZones) {
          viewZoneChangeAccessor.removeZone(id);
        }
      });
      this._viewZones = [];
      decorations.clear();
      this.diffForPreviouslyAppliedDecorators = void 0;
    }));
    this.diffForPreviouslyAppliedDecorators = diff;
    const chatDiffAddDecoration = ModelDecorationOptions.createDynamic({
      ...diffAddDecoration,
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
    const chatDiffWholeLineAddDecoration = ModelDecorationOptions.createDynamic({
      ...diffWholeLineAddDecoration,
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
    const createOverviewDecoration = (overviewRulerColor, minimapColor) => {
      return ModelDecorationOptions.createDynamic({
        description: "chat-editing-decoration",
        overviewRuler: { color: themeColorFromId(overviewRulerColor), position: OverviewRulerLane.Left },
        minimap: { color: themeColorFromId(minimapColor), position: MinimapPosition.Gutter }
      });
    };
    const modifiedDecoration = createOverviewDecoration(overviewRulerModifiedForeground, minimapGutterModifiedBackground);
    const addedDecoration = createOverviewDecoration(overviewRulerAddedForeground, minimapGutterAddedBackground);
    const deletedDecoration = createOverviewDecoration(overviewRulerDeletedForeground, minimapGutterDeletedBackground);
    editor.changeViewZones((viewZoneChangeAccessor) => {
      for (const id of this._viewZones) {
        viewZoneChangeAccessor.removeZone(id);
      }
      this._viewZones = [];
      const modifiedVisualDecorations = [];
      const mightContainNonBasicASCII = originalModel.mightContainNonBasicASCII();
      const mightContainRTL = originalModel.mightContainRTL();
      const renderOptions = RenderOptions.fromEditor(this.editor);
      const editorLineCount = currentModel.getLineCount();
      for (const diffEntry of diff.changes) {
        const originalRange = diffEntry.original;
        originalModel.tokenization.forceTokenization(Math.max(1, originalRange.endLineNumberExclusive - 1));
        const source = new LineSource(
          originalRange.mapToLineArray((l) => originalModel.tokenization.getLineTokens(l)),
          [],
          mightContainNonBasicASCII,
          mightContainRTL
        );
        const decorations2 = [];
        for (const i of diffEntry.innerChanges || []) {
          decorations2.push(new InlineDecoration(
            i.originalRange.delta(-(diffEntry.original.startLineNumber - 1)),
            diffDeleteDecoration.className,
            InlineDecorationType.Regular
          ));
          if (!(i.originalRange.isEmpty() && i.originalRange.startLineNumber === 1 && i.modifiedRange.endLineNumber === editorLineCount) && !i.modifiedRange.isEmpty()) {
            modifiedVisualDecorations.push({
              range: i.modifiedRange,
              options: chatDiffAddDecoration
            });
          }
        }
        const isCreatedContent = decorations2.length === 1 && decorations2[0].range.isEmpty() && diffEntry.original.startLineNumber === 1;
        if (!diffEntry.modified.isEmpty && !(isCreatedContent && diffEntry.modified.endLineNumberExclusive - 1 === editorLineCount)) {
          modifiedVisualDecorations.push({
            range: diffEntry.modified.toInclusiveRange(),
            options: chatDiffWholeLineAddDecoration
          });
        }
        if (diffEntry.original.isEmpty) {
          modifiedVisualDecorations.push({
            range: diffEntry.modified.toInclusiveRange(),
            options: addedDecoration
          });
        } else if (diffEntry.modified.isEmpty) {
          modifiedVisualDecorations.push({
            range: new Range(diffEntry.modified.startLineNumber - 1, 1, diffEntry.modified.startLineNumber, 1),
            options: deletedDecoration
          });
        } else {
          modifiedVisualDecorations.push({
            range: diffEntry.modified.toInclusiveRange(),
            options: modifiedDecoration
          });
        }
        const domNode = document.createElement("div");
        domNode.className = "chat-editing-original-zone view-lines line-delete monaco-mouse-cursor-text";
        const result = renderLines(source, renderOptions, decorations2, domNode);
        if (!isCreatedContent) {
          const viewZoneData = {
            afterLineNumber: diffEntry.modified.startLineNumber - 1,
            heightInLines: result.heightInLines,
            domNode,
            ordinal: 5e4 + 2
            // more than https://github.com/microsoft/vscode/blob/bf52a5cfb2c75a7327c9adeaefbddc06d529dcad/src/vs/workbench/contrib/inlineChat/browser/inlineChatZoneWidget.ts#L42
          };
          this._viewZones.push(viewZoneChangeAccessor.addZone(viewZoneData));
        }
      }
      decorations.set(modifiedVisualDecorations);
    });
  }
};
NotebookCellDiffDecorator = __decorateClass([
  __decorateParam(4, IEditorWorkerService),
  __decorateParam(5, INotebookOriginalCellModelFactory)
], NotebookCellDiffDecorator);
function areDiffsEqual(a, b) {
  if (a && b) {
    if (a.changes.length !== b.changes.length) {
      return false;
    }
    if (a.moves.length !== b.moves.length) {
      return false;
    }
    if (!areLineRangeMappinsEqual(a.changes, b.changes)) {
      return false;
    }
    if (!a.moves.some((move, i) => {
      const bMove = b.moves[i];
      if (!areLineRangeMappinsEqual(move.changes, bMove.changes)) {
        return true;
      }
      if (move.lineRangeMapping.changedLineCount !== bMove.lineRangeMapping.changedLineCount) {
        return true;
      }
      if (!move.lineRangeMapping.modified.equals(bMove.lineRangeMapping.modified)) {
        return true;
      }
      if (!move.lineRangeMapping.original.equals(bMove.lineRangeMapping.original)) {
        return true;
      }
      return false;
    })) {
      return false;
    }
    return true;
  } else if (!a && !b) {
    return true;
  } else {
    return false;
  }
}
function areLineRangeMappinsEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  if (a.some((c, i) => {
    const bChange = b[i];
    if (c.changedLineCount !== bChange.changedLineCount) {
      return true;
    }
    if ((c.innerChanges || []).length !== (bChange.innerChanges || []).length) {
      return true;
    }
    if ((c.innerChanges || []).some((innerC, innerIdx) => {
      const bInnerC = bChange.innerChanges[innerIdx];
      if (!innerC.modifiedRange.equalsRange(bInnerC.modifiedRange)) {
        return true;
      }
      if (!innerC.originalRange.equalsRange(bInnerC.originalRange)) {
        return true;
      }
      return false;
    })) {
      return true;
    }
    return false;
  })) {
    return false;
  }
  return true;
}
export {
  NotebookCellDiffDecorator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxkaWZmXFxpbmxpbmVEaWZmXFxub3RlYm9va0NlbGxEaWZmRGVjb3JhdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1bldpdGhTdG9yZSwgZGVyaXZlZCwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSVZpZXdab25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgdGhlbWVDb2xvckZyb21JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBSZW5kZXJPcHRpb25zLCBMaW5lU291cmNlLCByZW5kZXJMaW5lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvZGlmZkVkaXRvclZpZXdab25lcy9yZW5kZXJMaW5lcy5qcyc7XG5pbXBvcnQgeyBkaWZmQWRkRGVjb3JhdGlvbiwgZGlmZldob2xlTGluZUFkZERlY29yYXRpb24sIGRpZmZEZWxldGVEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvcmVnaXN0cmF0aW9ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgSURvY3VtZW50RGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9kb2N1bWVudERpZmZQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLCBNaW5pbWFwUG9zaXRpb24sIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgbWluaW1hcEd1dHRlckFkZGVkQmFja2dyb3VuZCwgbWluaW1hcEd1dHRlckRlbGV0ZWRCYWNrZ3JvdW5kLCBtaW5pbWFwR3V0dGVyTW9kaWZpZWRCYWNrZ3JvdW5kLCBvdmVydmlld1J1bGVyQWRkZWRGb3JlZ3JvdW5kLCBvdmVydmlld1J1bGVyRGVsZXRlZEZvcmVncm91bmQsIG92ZXJ2aWV3UnVsZXJNb2RpZmllZEZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9zY20vY29tbW9uL3F1aWNrRGlmZi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tPcmlnaW5hbENlbGxNb2RlbEZhY3RvcnkgfSBmcm9tICcuL25vdGVib29rT3JpZ2luYWxDZWxsTW9kZWxGYWN0b3J5LmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb24sIElubGluZURlY29yYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuXG4vL1RPRE86IGFsbG93IGNsaWVudCB0byBzZXQgcmVhZC1vbmx5IC0gY2hhdGVkaXRzZXNzaW9uIHNob3VsZCBzZXQgcmVhZC1vbmx5IHdoaWxlIG1ha2luZyBjaGFuZ2VzXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tDZWxsRGlmZkRlY29yYXRvciBleHRlbmRzIERpc3Bvc2FibGVTdG9yZSB7XG5cdHByaXZhdGUgX3ZpZXdab25lczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSB0aHJvdHRsZWREZWNvcmF0b3IgPSB0aGlzLmFkZChuZXcgVGhyb3R0bGVkRGVsYXllcig1MCkpO1xuXHRwcml2YXRlIGRpZmZGb3JQcmV2aW91c2x5QXBwbGllZERlY29yYXRvcnM/OiBJRG9jdW1lbnREaWZmO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGVyRWRpdG9yRGlzcG9zYWJsZXMgPSB0aGlzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RpZmllZENlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgb3JpZ2luYWxDZWxsOiBOb3RlYm9va0NlbGxUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJRWRpdG9yV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRASU5vdGVib29rT3JpZ2luYWxDZWxsTW9kZWxGYWN0b3J5IHByaXZhdGUgcmVhZG9ubHkgb3JpZ2luYWxDZWxsTW9kZWxGYWN0b3J5OiBJTm90ZWJvb2tPcmlnaW5hbENlbGxNb2RlbEZhY3RvcnksXG5cblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlVmlzaWJsZVJhbmdlcyA9IG9ic2VydmFibGVGcm9tRXZlbnQobm90ZWJvb2tFZGl0b3Iub25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzLCAoKSA9PiBub3RlYm9va0VkaXRvci52aXNpYmxlUmFuZ2VzKTtcblx0XHRjb25zdCBlZGl0b3JPYnMgPSBkZXJpdmVkKChyKSA9PiB7XG5cdFx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gb25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzLnJlYWQocik7XG5cdFx0XHRjb25zdCB2aXNpYmxlQ2VsbEhhbmRsZXMgPSB2aXNpYmxlUmFuZ2VzLm1hcChyYW5nZSA9PiBub3RlYm9va0VkaXRvci5nZXRDZWxsc0luUmFuZ2UocmFuZ2UpKS5mbGF0KCkubWFwKGMgPT4gYy5oYW5kbGUpO1xuXHRcdFx0aWYgKCF2aXNpYmxlQ2VsbEhhbmRsZXMuaW5jbHVkZXMobW9kaWZpZWRDZWxsLmhhbmRsZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWRpdG9yID0gbm90ZWJvb2tFZGl0b3IuY29kZUVkaXRvcnMuZmluZChpdGVtID0+IGl0ZW1bMF0uaGFuZGxlID09PSBtb2RpZmllZENlbGwuaGFuZGxlKT8uWzFdO1xuXHRcdFx0aWYgKGVkaXRvcj8uZ2V0TW9kZWwoKSAhPT0gdGhpcy5tb2RpZmllZENlbGwudGV4dE1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBlZGl0b3I7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFkZChhdXRvcnVuV2l0aFN0b3JlKChyLCBzdG9yZSkgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gZWRpdG9yT2JzLnJlYWQocik7XG5cdFx0XHR0aGlzLnBlckVkaXRvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0c3RvcmUuYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBlckVkaXRvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0c3RvcmUuYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGUoZWRpdG9yKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKSB8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZShlZGl0b3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZShlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGUoZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdHRoaXMudGhyb3R0bGVkRGVjb3JhdG9yLnRyaWdnZXIoKCkgPT4gdGhpcy5fdXBkYXRlSW1wbChlZGl0b3IpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZUltcGwoZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmluRGlmZkVkaXRvcikpIHtcblx0XHRcdHRoaXMucGVyRWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsIHx8IG1vZGVsICE9PSB0aGlzLm1vZGlmaWVkQ2VsbC50ZXh0TW9kZWwpIHtcblx0XHRcdHRoaXMucGVyRWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcmlnaW5hbE1vZGVsID0gdGhpcy5nZXRPckNyZWF0ZU9yaWdpbmFsTW9kZWwoZWRpdG9yKTtcblx0XHRpZiAoIW9yaWdpbmFsTW9kZWwpIHtcblx0XHRcdHRoaXMucGVyRWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdmVyc2lvbiA9IG1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdGNvbnN0IGRpZmYgPSBhd2FpdCB0aGlzLl9lZGl0b3JXb3JrZXJTZXJ2aWNlLmNvbXB1dGVEaWZmKFxuXHRcdFx0b3JpZ2luYWxNb2RlbC51cmksXG5cdFx0XHRtb2RlbC51cmksXG5cdFx0XHR7IGNvbXB1dGVNb3ZlczogdHJ1ZSwgaWdub3JlVHJpbVdoaXRlc3BhY2U6IGZhbHNlLCBtYXhDb21wdXRhdGlvblRpbWVNczogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIgfSxcblx0XHRcdCdhZHZhbmNlZCdcblx0XHQpO1xuXG5cblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cblx0XHRpZiAoZGlmZiAmJiAhZGlmZi5pZGVudGljYWwgJiYgdGhpcy5tb2RpZmllZENlbGwudGV4dE1vZGVsICYmIG9yaWdpbmFsTW9kZWwgJiYgbW9kZWwgPT09IGVkaXRvci5nZXRNb2RlbCgpICYmIGVkaXRvci5nZXRNb2RlbCgpPy5nZXRWZXJzaW9uSWQoKSA9PT0gdmVyc2lvbikge1xuXHRcdFx0dGhpcy5fdXBkYXRlV2l0aERpZmYoZWRpdG9yLCBvcmlnaW5hbE1vZGVsLCBkaWZmLCB0aGlzLm1vZGlmaWVkQ2VsbC50ZXh0TW9kZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnBlckVkaXRvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb3JpZ2luYWxNb2RlbD86IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgZ2V0T3JDcmVhdGVPcmlnaW5hbE1vZGVsKGVkaXRvcjogSUNvZGVFZGl0b3IpIHtcblx0XHRpZiAoIXRoaXMuX29yaWdpbmFsTW9kZWwpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29yaWdpbmFsTW9kZWwgPSB0aGlzLmFkZCh0aGlzLm9yaWdpbmFsQ2VsbE1vZGVsRmFjdG9yeS5nZXRPckNyZWF0ZShtb2RlbC51cmksIHRoaXMub3JpZ2luYWxDZWxsLmdldFZhbHVlKCksIG1vZGVsLmdldExhbmd1YWdlSWQoKSwgdGhpcy5tb2RpZmllZENlbGwuY2VsbEtpbmQpKS5vYmplY3Q7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9vcmlnaW5hbE1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlV2l0aERpZmYoZWRpdG9yOiBJQ29kZUVkaXRvciwgb3JpZ2luYWxNb2RlbDogSVRleHRNb2RlbCwgZGlmZjogSURvY3VtZW50RGlmZiwgY3VycmVudE1vZGVsOiBJVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0aWYgKGFyZURpZmZzRXF1YWwoZGlmZiwgdGhpcy5kaWZmRm9yUHJldmlvdXNseUFwcGxpZWREZWNvcmF0b3JzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnBlckVkaXRvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSBlZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5wZXJFZGl0b3JEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoKHZpZXdab25lQ2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiB0aGlzLl92aWV3Wm9uZXMpIHtcblx0XHRcdFx0XHR2aWV3Wm9uZUNoYW5nZUFjY2Vzc29yLnJlbW92ZVpvbmUoaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3ZpZXdab25lcyA9IFtdO1xuXHRcdFx0ZGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdHRoaXMuZGlmZkZvclByZXZpb3VzbHlBcHBsaWVkRGVjb3JhdG9ycyA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpZmZGb3JQcmV2aW91c2x5QXBwbGllZERlY29yYXRvcnMgPSBkaWZmO1xuXG5cdFx0Y29uc3QgY2hhdERpZmZBZGREZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5jcmVhdGVEeW5hbWljKHtcblx0XHRcdC4uLmRpZmZBZGREZWNvcmF0aW9uLFxuXHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXNcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0RGlmZldob2xlTGluZUFkZERlY29yYXRpb24gPSBNb2RlbERlY29yYXRpb25PcHRpb25zLmNyZWF0ZUR5bmFtaWMoe1xuXHRcdFx0Li4uZGlmZldob2xlTGluZUFkZERlY29yYXRpb24sXG5cdFx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHR9KTtcblx0XHRjb25zdCBjcmVhdGVPdmVydmlld0RlY29yYXRpb24gPSAob3ZlcnZpZXdSdWxlckNvbG9yOiBzdHJpbmcsIG1pbmltYXBDb2xvcjogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5jcmVhdGVEeW5hbWljKHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdjaGF0LWVkaXRpbmctZGVjb3JhdGlvbicsXG5cdFx0XHRcdG92ZXJ2aWV3UnVsZXI6IHsgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQob3ZlcnZpZXdSdWxlckNvbG9yKSwgcG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkxlZnQgfSxcblx0XHRcdFx0bWluaW1hcDogeyBjb2xvcjogdGhlbWVDb2xvckZyb21JZChtaW5pbWFwQ29sb3IpLCBwb3NpdGlvbjogTWluaW1hcFBvc2l0aW9uLkd1dHRlciB9LFxuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHRjb25zdCBtb2RpZmllZERlY29yYXRpb24gPSBjcmVhdGVPdmVydmlld0RlY29yYXRpb24ob3ZlcnZpZXdSdWxlck1vZGlmaWVkRm9yZWdyb3VuZCwgbWluaW1hcEd1dHRlck1vZGlmaWVkQmFja2dyb3VuZCk7XG5cdFx0Y29uc3QgYWRkZWREZWNvcmF0aW9uID0gY3JlYXRlT3ZlcnZpZXdEZWNvcmF0aW9uKG92ZXJ2aWV3UnVsZXJBZGRlZEZvcmVncm91bmQsIG1pbmltYXBHdXR0ZXJBZGRlZEJhY2tncm91bmQpO1xuXHRcdGNvbnN0IGRlbGV0ZWREZWNvcmF0aW9uID0gY3JlYXRlT3ZlcnZpZXdEZWNvcmF0aW9uKG92ZXJ2aWV3UnVsZXJEZWxldGVkRm9yZWdyb3VuZCwgbWluaW1hcEd1dHRlckRlbGV0ZWRCYWNrZ3JvdW5kKTtcblxuXHRcdGVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoKHZpZXdab25lQ2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgdGhpcy5fdmlld1pvbmVzKSB7XG5cdFx0XHRcdHZpZXdab25lQ2hhbmdlQWNjZXNzb3IucmVtb3ZlWm9uZShpZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl92aWV3Wm9uZXMgPSBbXTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkVmlzdWFsRGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0XHRjb25zdCBtaWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJID0gb3JpZ2luYWxNb2RlbC5taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJKCk7XG5cdFx0XHRjb25zdCBtaWdodENvbnRhaW5SVEwgPSBvcmlnaW5hbE1vZGVsLm1pZ2h0Q29udGFpblJUTCgpO1xuXHRcdFx0Y29uc3QgcmVuZGVyT3B0aW9ucyA9IFJlbmRlck9wdGlvbnMuZnJvbUVkaXRvcih0aGlzLmVkaXRvcik7XG5cdFx0XHRjb25zdCBlZGl0b3JMaW5lQ291bnQgPSBjdXJyZW50TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGRpZmZFbnRyeSBvZiBkaWZmLmNoYW5nZXMpIHtcblxuXHRcdFx0XHRjb25zdCBvcmlnaW5hbFJhbmdlID0gZGlmZkVudHJ5Lm9yaWdpbmFsO1xuXHRcdFx0XHRvcmlnaW5hbE1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihNYXRoLm1heCgxLCBvcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxKSk7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBMaW5lU291cmNlKFxuXHRcdFx0XHRcdG9yaWdpbmFsUmFuZ2UubWFwVG9MaW5lQXJyYXkobCA9PiBvcmlnaW5hbE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGwpKSxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHRtaWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJLFxuXHRcdFx0XHRcdG1pZ2h0Q29udGFpblJUTCxcblx0XHRcdFx0KTtcblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElubGluZURlY29yYXRpb25bXSA9IFtdO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgaSBvZiBkaWZmRW50cnkuaW5uZXJDaGFuZ2VzIHx8IFtdKSB7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvbnMucHVzaChuZXcgSW5saW5lRGVjb3JhdGlvbihcblx0XHRcdFx0XHRcdGkub3JpZ2luYWxSYW5nZS5kZWx0YSgtKGRpZmZFbnRyeS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgLSAxKSksXG5cdFx0XHRcdFx0XHRkaWZmRGVsZXRlRGVjb3JhdGlvbi5jbGFzc05hbWUhLFxuXHRcdFx0XHRcdFx0SW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhclxuXHRcdFx0XHRcdCkpO1xuXG5cdFx0XHRcdFx0Ly8gSWYgdGhlIG9yaWdpbmFsIHJhbmdlIGlzIGVtcHR5LCB0aGUgc3RhcnQgbGluZSBudW1iZXIgaXMgMSBhbmQgdGhlIG5ldyByYW5nZSBzcGFucyB0aGUgZW50aXJlIGZpbGUsIGRvbid0IGRyYXcgYW4gQWRkZWQgZGVjb3JhdGlvblxuXHRcdFx0XHRcdGlmICghKGkub3JpZ2luYWxSYW5nZS5pc0VtcHR5KCkgJiYgaS5vcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gMSAmJiBpLm1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlciA9PT0gZWRpdG9yTGluZUNvdW50KSAmJiAhaS5tb2RpZmllZFJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdFx0bW9kaWZpZWRWaXN1YWxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IGkubW9kaWZpZWRSYW5nZSwgb3B0aW9uczogY2hhdERpZmZBZGREZWNvcmF0aW9uXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZW5kZXIgYW4gYWRkZWQgZGVjb3JhdGlvbiBidXQgZG9uJ3QgYWxzbyByZW5kZXIgYSBkZWxldGVkIGRlY29yYXRpb24gZm9yIG5ld2x5IGluc2VydGVkIGNvbnRlbnQgYXQgdGhlIHN0YXJ0IG9mIHRoZSBmaWxlXG5cdFx0XHRcdC8vIE5vdGUsIHRoaXMgaXMgYSB3b3JrYXJvdW5kIGZvciB0aGUgYExpbmVSYW5nZS5pc0VtcHR5KClgIGluIGRpZmZFbnRyeS5vcmlnaW5hbCBiZWluZyBgZmFsc2VgIGZvciBuZXdseSBpbnNlcnRlZCBjb250ZW50XG5cdFx0XHRcdGNvbnN0IGlzQ3JlYXRlZENvbnRlbnQgPSBkZWNvcmF0aW9ucy5sZW5ndGggPT09IDEgJiYgZGVjb3JhdGlvbnNbMF0ucmFuZ2UuaXNFbXB0eSgpICYmIGRpZmZFbnRyeS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgPT09IDE7XG5cblx0XHRcdFx0aWYgKCFkaWZmRW50cnkubW9kaWZpZWQuaXNFbXB0eSAmJiAhKGlzQ3JlYXRlZENvbnRlbnQgJiYgKGRpZmZFbnRyeS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSkgPT09IGVkaXRvckxpbmVDb3VudCkpIHtcblx0XHRcdFx0XHRtb2RpZmllZFZpc3VhbERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IGRpZmZFbnRyeS5tb2RpZmllZC50b0luY2x1c2l2ZVJhbmdlKCkhLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogY2hhdERpZmZXaG9sZUxpbmVBZGREZWNvcmF0aW9uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZGlmZkVudHJ5Lm9yaWdpbmFsLmlzRW1wdHkpIHtcblx0XHRcdFx0XHQvLyBpbnNlcnRpb25cblx0XHRcdFx0XHRtb2RpZmllZFZpc3VhbERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IGRpZmZFbnRyeS5tb2RpZmllZC50b0luY2x1c2l2ZVJhbmdlKCkhLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogYWRkZWREZWNvcmF0aW9uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZGlmZkVudHJ5Lm1vZGlmaWVkLmlzRW1wdHkpIHtcblx0XHRcdFx0XHQvLyBkZWxldGlvblxuXHRcdFx0XHRcdG1vZGlmaWVkVmlzdWFsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKGRpZmZFbnRyeS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgLSAxLCAxLCBkaWZmRW50cnkubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLCAxKSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IGRlbGV0ZWREZWNvcmF0aW9uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbW9kaWZpY2F0aW9uXG5cdFx0XHRcdFx0bW9kaWZpZWRWaXN1YWxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiBkaWZmRW50cnkubW9kaWZpZWQudG9JbmNsdXNpdmVSYW5nZSgpISxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IG1vZGlmaWVkRGVjb3JhdGlvblxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRkb21Ob2RlLmNsYXNzTmFtZSA9ICdjaGF0LWVkaXRpbmctb3JpZ2luYWwtem9uZSB2aWV3LWxpbmVzIGxpbmUtZGVsZXRlIG1vbmFjby1tb3VzZS1jdXJzb3ItdGV4dCc7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlbmRlckxpbmVzKHNvdXJjZSwgcmVuZGVyT3B0aW9ucywgZGVjb3JhdGlvbnMsIGRvbU5vZGUpO1xuXG5cdFx0XHRcdGlmICghaXNDcmVhdGVkQ29udGVudCkge1xuXG5cdFx0XHRcdFx0Y29uc3Qgdmlld1pvbmVEYXRhOiBJVmlld1pvbmUgPSB7XG5cdFx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IGRpZmZFbnRyeS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgLSAxLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5MaW5lczogcmVzdWx0LmhlaWdodEluTGluZXMsXG5cdFx0XHRcdFx0XHRkb21Ob2RlLFxuXHRcdFx0XHRcdFx0b3JkaW5hbDogNTAwMDAgKyAyIC8vIG1vcmUgdGhhbiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iL2JmNTJhNWNmYjJjNzVhNzMyN2M5YWRlYWVmYmRkYzA2ZDUyOWRjYWQvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0Wm9uZVdpZGdldC50cyNMNDJcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0dGhpcy5fdmlld1pvbmVzLnB1c2godmlld1pvbmVDaGFuZ2VBY2Nlc3Nvci5hZGRab25lKHZpZXdab25lRGF0YSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGRlY29yYXRpb25zLnNldChtb2RpZmllZFZpc3VhbERlY29yYXRpb25zKTtcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBhcmVEaWZmc0VxdWFsKGE6IElEb2N1bWVudERpZmYgfCB1bmRlZmluZWQsIGI6IElEb2N1bWVudERpZmYgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKGEgJiYgYikge1xuXHRcdGlmIChhLmNoYW5nZXMubGVuZ3RoICE9PSBiLmNoYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChhLm1vdmVzLmxlbmd0aCAhPT0gYi5tb3Zlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFhcmVMaW5lUmFuZ2VNYXBwaW5zRXF1YWwoYS5jaGFuZ2VzLCBiLmNoYW5nZXMpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghYS5tb3Zlcy5zb21lKChtb3ZlLCBpKSA9PiB7XG5cdFx0XHRjb25zdCBiTW92ZSA9IGIubW92ZXNbaV07XG5cdFx0XHRpZiAoIWFyZUxpbmVSYW5nZU1hcHBpbnNFcXVhbChtb3ZlLmNoYW5nZXMsIGJNb3ZlLmNoYW5nZXMpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vdmUubGluZVJhbmdlTWFwcGluZy5jaGFuZ2VkTGluZUNvdW50ICE9PSBiTW92ZS5saW5lUmFuZ2VNYXBwaW5nLmNoYW5nZWRMaW5lQ291bnQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW1vdmUubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5lcXVhbHMoYk1vdmUubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW1vdmUubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbC5lcXVhbHMoYk1vdmUubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0gZWxzZSBpZiAoIWEgJiYgIWIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXJlTGluZVJhbmdlTWFwcGluc0VxdWFsKGE6IHJlYWRvbmx5IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdLCBiOiByZWFkb25seSBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSk6IGJvb2xlYW4ge1xuXHRpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChhLnNvbWUoKGMsIGkpID0+IHtcblx0XHRjb25zdCBiQ2hhbmdlID0gYltpXTtcblx0XHRpZiAoYy5jaGFuZ2VkTGluZUNvdW50ICE9PSBiQ2hhbmdlLmNoYW5nZWRMaW5lQ291bnQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoKGMuaW5uZXJDaGFuZ2VzIHx8IFtdKS5sZW5ndGggIT09IChiQ2hhbmdlLmlubmVyQ2hhbmdlcyB8fCBbXSkubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKChjLmlubmVyQ2hhbmdlcyB8fCBbXSkuc29tZSgoaW5uZXJDLCBpbm5lcklkeCkgPT4ge1xuXHRcdFx0Y29uc3QgYklubmVyQyA9IGJDaGFuZ2UuaW5uZXJDaGFuZ2VzIVtpbm5lcklkeF07XG5cdFx0XHRpZiAoIWlubmVyQy5tb2RpZmllZFJhbmdlLmVxdWFsc1JhbmdlKGJJbm5lckMubW9kaWZpZWRSYW5nZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlubmVyQy5vcmlnaW5hbFJhbmdlLmVxdWFsc1JhbmdlKGJJbm5lckMub3JpZ2luYWxSYW5nZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLGtCQUFrQixTQUFTLDJCQUEyQjtBQUUvRCxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWUsWUFBWSxtQkFBbUI7QUFDdkQsU0FBUyxtQkFBbUIsNEJBQTRCLDRCQUE0QjtBQUVwRixTQUFxQix3QkFBd0IsaUJBQXdDLHlCQUF5QjtBQUM5RyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGFBQWE7QUFHdEIsU0FBUyw4QkFBOEIsZ0NBQWdDLGlDQUFpQyw4QkFBOEIsZ0NBQWdDLHVDQUF1QztBQUM3TSxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLGtCQUFrQiw0QkFBNEI7QUFHaEQsSUFBTSw0QkFBTixjQUF3QyxnQkFBZ0I7QUFBQSxFQU05RCxZQUNDLGdCQUNnQixjQUNBLGNBQ0MsUUFDc0Isc0JBQ2EsMEJBRW5EO0FBQ0QsVUFBTTtBQVBVO0FBQ0E7QUFDQztBQUNzQjtBQUNhO0FBWHJELFNBQVEsYUFBdUIsQ0FBQztBQUNoQyxTQUFpQixxQkFBcUIsS0FBSyxJQUFJLElBQUksaUJBQWlCLEVBQUUsQ0FBQztBQUd2RSxTQUFpQix1QkFBdUIsS0FBSyxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFZckUsVUFBTSwyQkFBMkIsb0JBQW9CLGVBQWUsMEJBQTBCLE1BQU0sZUFBZSxhQUFhO0FBQ2hJLFVBQU0sWUFBWSxRQUFRLENBQUMsTUFBTTtBQUNoQyxZQUFNLGdCQUFnQix5QkFBeUIsS0FBSyxDQUFDO0FBQ3JELFlBQU0scUJBQXFCLGNB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
