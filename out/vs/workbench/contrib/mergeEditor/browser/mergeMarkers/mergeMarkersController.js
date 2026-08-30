import { h } from "../../../../../base/browser/dom.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { MergeEditorLineRange } from "../model/lineRange.js";
import * as nls from "../../../../../nls.js";
const conflictMarkers = {
  start: "<<<<<<<",
  end: ">>>>>>>"
};
class MergeMarkersController extends Disposable {
  constructor(editor, mergeEditorViewModel) {
    super();
    this.editor = editor;
    this.mergeEditorViewModel = mergeEditorViewModel;
    this.viewZoneIds = [];
    this.disposableStore = this._register(new DisposableStore());
    this._register(editor.onDidChangeModelContent((e) => {
      this.updateDecorations();
    }));
    this._register(editor.onDidChangeModel((e) => {
      this.updateDecorations();
    }));
    this.updateDecorations();
  }
  updateDecorations() {
    const model = this.editor.getModel();
    const blocks = model ? getBlocks(model, { blockToRemoveStartLinePrefix: conflictMarkers.start, blockToRemoveEndLinePrefix: conflictMarkers.end }) : { blocks: [] };
    this.editor.setHiddenAreas(blocks.blocks.map((b) => b.lineRange.deltaEnd(-1).toExclusiveRange()), this);
    this.editor.changeViewZones((c) => {
      this.disposableStore.clear();
      for (const id of this.viewZoneIds) {
        c.removeZone(id);
      }
      this.viewZoneIds.length = 0;
      for (const b of blocks.blocks) {
        const startLine = model.getLineContent(b.lineRange.startLineNumber).substring(0, 20);
        const endLine = model.getLineContent(b.lineRange.endLineNumberExclusive - 1).substring(0, 20);
        const conflictingLinesCount = b.lineRange.length - 2;
        const domNode = h("div", [
          h("div.conflict-zone-root", [
            h("pre", [startLine]),
            h("span.dots", ["..."]),
            h("pre", [endLine]),
            h("span.text", [
              conflictingLinesCount === 1 ? nls.localize("conflictingLine", "1 Conflicting Line") : nls.localize("conflictingLines", "{0} Conflicting Lines", conflictingLinesCount)
            ])
          ])
        ]).root;
        this.viewZoneIds.push(c.addZone({
          afterLineNumber: b.lineRange.endLineNumberExclusive - 1,
          domNode,
          heightInLines: 1.5
        }));
        const updateWidth = () => {
          const layoutInfo = this.editor.getLayoutInfo();
          domNode.style.width = `${layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth}px`;
        };
        this.disposableStore.add(
          this.editor.onDidLayoutChange(() => {
            updateWidth();
          })
        );
        updateWidth();
        this.disposableStore.add(autorun((reader) => {
          const vm = this.mergeEditorViewModel.read(reader);
          if (!vm) {
            return;
          }
          const activeRange = vm.activeModifiedBaseRange.read(reader);
          const classNames = [];
          classNames.push("conflict-zone");
          if (activeRange) {
            const activeRangeInResult = vm.model.getLineRangeInResult(activeRange.baseRange, reader);
            if (activeRangeInResult.intersectsOrTouches(b.lineRange)) {
              classNames.push("focused");
            }
          }
          domNode.className = classNames.join(" ");
        }));
      }
    });
  }
}
function getBlocks(document, configuration) {
  const blocks = [];
  const transformedContent = [];
  let inBlock = false;
  let startLineNumber = -1;
  let curLine = 0;
  for (const line of document.getLinesContent()) {
    curLine++;
    if (!inBlock) {
      if (line.startsWith(configuration.blockToRemoveStartLinePrefix)) {
        inBlock = true;
        startLineNumber = curLine;
      } else {
        transformedContent.push(line);
      }
    } else {
      if (line.startsWith(configuration.blockToRemoveEndLinePrefix)) {
        inBlock = false;
        blocks.push(new Block(MergeEditorLineRange.fromLength(startLineNumber, curLine - startLineNumber + 1)));
        transformedContent.push("");
      }
    }
  }
  return {
    blocks,
    transformedContent: transformedContent.join("\n")
  };
}
class Block {
  constructor(lineRange) {
    this.lineRange = lineRange;
  }
}
export {
  MergeMarkersController,
  conflictMarkers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFxtZXJnZU1hcmtlcnNcXG1lcmdlTWFya2Vyc0NvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvckxpbmVSYW5nZSB9IGZyb20gJy4uL21vZGVsL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvclZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXcvdmlld01vZGVsLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5leHBvcnQgY29uc3QgY29uZmxpY3RNYXJrZXJzID0ge1xuXHRzdGFydDogJzw8PDw8PDwnLFxuXHRlbmQ6ICc+Pj4+Pj4+Jyxcbn07XG5cbmV4cG9ydCBjbGFzcyBNZXJnZU1hcmtlcnNDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld1pvbmVJZHM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwdWJsaWMgY29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1lcmdlRWRpdG9yVmlld01vZGVsOiBJT2JzZXJ2YWJsZTxNZXJnZUVkaXRvclZpZXdNb2RlbCB8IHVuZGVmaW5lZD4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoZSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZURlY29yYXRpb25zKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoZSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZURlY29yYXRpb25zKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy51cGRhdGVEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEZWNvcmF0aW9ucygpIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgYmxvY2tzID0gbW9kZWwgPyBnZXRCbG9ja3MobW9kZWwsIHsgYmxvY2tUb1JlbW92ZVN0YXJ0TGluZVByZWZpeDogY29uZmxpY3RNYXJrZXJzLnN0YXJ0LCBibG9ja1RvUmVtb3ZlRW5kTGluZVByZWZpeDogY29uZmxpY3RNYXJrZXJzLmVuZCB9KSA6IHsgYmxvY2tzOiBbXSB9O1xuXG5cdFx0dGhpcy5lZGl0b3Iuc2V0SGlkZGVuQXJlYXMoYmxvY2tzLmJsb2Nrcy5tYXAoYiA9PiBiLmxpbmVSYW5nZS5kZWx0YUVuZCgtMSkudG9FeGNsdXNpdmVSYW5nZSgpKSwgdGhpcyk7XG5cdFx0dGhpcy5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKGMgPT4ge1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlU3RvcmUuY2xlYXIoKTtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgdGhpcy52aWV3Wm9uZUlkcykge1xuXHRcdFx0XHRjLnJlbW92ZVpvbmUoaWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy52aWV3Wm9uZUlkcy5sZW5ndGggPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBiIG9mIGJsb2Nrcy5ibG9ja3MpIHtcblxuXHRcdFx0XHRjb25zdCBzdGFydExpbmUgPSBtb2RlbCEuZ2V0TGluZUNvbnRlbnQoYi5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKS5zdWJzdHJpbmcoMCwgMjApO1xuXHRcdFx0XHRjb25zdCBlbmRMaW5lID0gbW9kZWwhLmdldExpbmVDb250ZW50KGIubGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxKS5zdWJzdHJpbmcoMCwgMjApO1xuXG5cdFx0XHRcdGNvbnN0IGNvbmZsaWN0aW5nTGluZXNDb3VudCA9IGIubGluZVJhbmdlLmxlbmd0aCAtIDI7XG5cblx0XHRcdFx0Y29uc3QgZG9tTm9kZSA9IGgoJ2RpdicsIFtcblx0XHRcdFx0XHRoKCdkaXYuY29uZmxpY3Qtem9uZS1yb290JywgW1xuXHRcdFx0XHRcdFx0aCgncHJlJywgW3N0YXJ0TGluZV0pLFxuXHRcdFx0XHRcdFx0aCgnc3Bhbi5kb3RzJywgWycuLi4nXSksXG5cdFx0XHRcdFx0XHRoKCdwcmUnLCBbZW5kTGluZV0pLFxuXHRcdFx0XHRcdFx0aCgnc3Bhbi50ZXh0JywgW1xuXHRcdFx0XHRcdFx0XHRjb25mbGljdGluZ0xpbmVzQ291bnQgPT09IDFcblx0XHRcdFx0XHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnY29uZmxpY3RpbmdMaW5lJywgXCIxIENvbmZsaWN0aW5nIExpbmVcIilcblx0XHRcdFx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnY29uZmxpY3RpbmdMaW5lcycsIFwiezB9IENvbmZsaWN0aW5nIExpbmVzXCIsIGNvbmZsaWN0aW5nTGluZXNDb3VudClcblx0XHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRdKS5yb290O1xuXHRcdFx0XHR0aGlzLnZpZXdab25lSWRzLnB1c2goYy5hZGRab25lKHtcblx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IGIubGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0XHRcdGRvbU5vZGUsXG5cdFx0XHRcdFx0aGVpZ2h0SW5MaW5lczogMS41LFxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Y29uc3QgdXBkYXRlV2lkdGggPSAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRcdFx0XHRkb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7bGF5b3V0SW5mby5jb250ZW50V2lkdGggLSBsYXlvdXRJbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGh9cHhgO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZVN0b3JlLmFkZChcblx0XHRcdFx0XHR0aGlzLmVkaXRvci5vbkRpZExheW91dENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHR1cGRhdGVXaWR0aCgpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHVwZGF0ZVdpZHRoKCk7XG5cblxuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIGNsYXNzbmFtZSAqL1xuXHRcdFx0XHRcdGNvbnN0IHZtID0gdGhpcy5tZXJnZUVkaXRvclZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0aWYgKCF2bSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBhY3RpdmVSYW5nZSA9IHZtLmFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0XHRcdGNvbnN0IGNsYXNzTmFtZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdFx0Y2xhc3NOYW1lcy5wdXNoKCdjb25mbGljdC16b25lJyk7XG5cblx0XHRcdFx0XHRpZiAoYWN0aXZlUmFuZ2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFjdGl2ZVJhbmdlSW5SZXN1bHQgPSB2bS5tb2RlbC5nZXRMaW5lUmFuZ2VJblJlc3VsdChhY3RpdmVSYW5nZS5iYXNlUmFuZ2UsIHJlYWRlcik7XG5cdFx0XHRcdFx0XHRpZiAoYWN0aXZlUmFuZ2VJblJlc3VsdC5pbnRlcnNlY3RzT3JUb3VjaGVzKGIubGluZVJhbmdlKSkge1xuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWVzLnB1c2goJ2ZvY3VzZWQnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRkb21Ob2RlLmNsYXNzTmFtZSA9IGNsYXNzTmFtZXMuam9pbignICcpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBnZXRCbG9ja3MoZG9jdW1lbnQ6IElUZXh0TW9kZWwsIGNvbmZpZ3VyYXRpb246IFByb2plY3Rpb25Db25maWd1cmF0aW9uKTogeyBibG9ja3M6IEJsb2NrW107IHRyYW5zZm9ybWVkQ29udGVudDogc3RyaW5nIH0ge1xuXHRjb25zdCBibG9ja3M6IEJsb2NrW10gPSBbXTtcblx0Y29uc3QgdHJhbnNmb3JtZWRDb250ZW50OiBzdHJpbmdbXSA9IFtdO1xuXG5cdGxldCBpbkJsb2NrID0gZmFsc2U7XG5cdGxldCBzdGFydExpbmVOdW1iZXIgPSAtMTtcblx0bGV0IGN1ckxpbmUgPSAwO1xuXG5cdGZvciAoY29uc3QgbGluZSBvZiBkb2N1bWVudC5nZXRMaW5lc0NvbnRlbnQoKSkge1xuXHRcdGN1ckxpbmUrKztcblx0XHRpZiAoIWluQmxvY2spIHtcblx0XHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoY29uZmlndXJhdGlvbi5ibG9ja1RvUmVtb3ZlU3RhcnRMaW5lUHJlZml4KSkge1xuXHRcdFx0XHRpbkJsb2NrID0gdHJ1ZTtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gY3VyTGluZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRyYW5zZm9ybWVkQ29udGVudC5wdXNoKGxpbmUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAobGluZS5zdGFydHNXaXRoKGNvbmZpZ3VyYXRpb24uYmxvY2tUb1JlbW92ZUVuZExpbmVQcmVmaXgpKSB7XG5cdFx0XHRcdGluQmxvY2sgPSBmYWxzZTtcblx0XHRcdFx0YmxvY2tzLnB1c2gobmV3IEJsb2NrKE1lcmdlRWRpdG9yTGluZVJhbmdlLmZyb21MZW5ndGgoc3RhcnRMaW5lTnVtYmVyLCBjdXJMaW5lIC0gc3RhcnRMaW5lTnVtYmVyICsgMSkpKTtcblx0XHRcdFx0dHJhbnNmb3JtZWRDb250ZW50LnB1c2goJycpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7XG5cdFx0YmxvY2tzLFxuXHRcdHRyYW5zZm9ybWVkQ29udGVudDogdHJhbnNmb3JtZWRDb250ZW50LmpvaW4oJ1xcbicpXG5cdH07XG59XG5cbmNsYXNzIEJsb2NrIHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGxpbmVSYW5nZTogTWVyZ2VFZGl0b3JMaW5lUmFuZ2UpIHsgfVxufVxuXG5pbnRlcmZhY2UgUHJvamVjdGlvbkNvbmZpZ3VyYXRpb24ge1xuXHRibG9ja1RvUmVtb3ZlU3RhcnRMaW5lUHJlZml4OiBzdHJpbmc7XG5cdGJsb2NrVG9SZW1vdmVFbmRMaW5lUHJlZml4OiBzdHJpbmc7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVM7QUFDbEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQTRCO0FBR3JDLFNBQVMsNEJBQTRCO0FBRXJDLFlBQVksU0FBUztBQUVkLE1BQU0sa0JBQWtCO0FBQUEsRUFDOUIsT0FBTztBQUFBLEVBQ1AsS0FBSztBQUNOO0FBRU8sTUFBTSwrQkFBK0IsV0FBVztBQUFBLEVBSS9DLFlBQ1UsUUFDQSxzQkFDZjtBQUNELFVBQU07QUFIVTtBQUNBO0FBTGpCLFNBQWlCLGNBQXdCLENBQUM7QUFDMUMsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBUXRFLFNBQUssVUFBVSxPQUFPLHdCQUF3QixPQUFLO0FBQ2xELFdBQUssa0JBQWtCO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLE9BQU8saUJBQWlCLE9BQUs7QUFDM0MsV0FBSyxrQkFBa0I7QUFBQSxJQUN4QixDQUFDLENBQUM7QUFFRixTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQUEsRUFFUSxvQkFBb0I7QUFDM0IsVUFBTSxRQUFRLEtBQUssT0FBTyxTQUFTO0FBQ25DLFVBQU0sU0FBUyxRQUFRLFVBQVUsT0FBTyxFQUFFLDhCQUE4QixnQkFBZ0IsT0FBTyw0QkFBNEIsZ0JBQWdCLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLEVBQUU7QUFFakssU0FBSyxPQUFPLGVBQWUsT0FBTyxPQUFPLElBQUksT0FBSyxFQUFFLFVBQVUsU0FBUyxFQUFFLEVBQUUsaUJBQWlCLENBQUMsR0FBRyxJ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
