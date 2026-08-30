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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../../../common/contributions.js";
import { IDebugService } from "../../../../debug/common/debug.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { CellUri, NotebookCellsChangeType } from "../../../common/notebookCommon.js";
import { INotebookService } from "../../../common/notebookService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
import { hasKey } from "../../../../../../base/common/types.js";
let NotebookBreakpoints = class extends Disposable {
  constructor(_debugService, _notebookService, _editorService) {
    super();
    this._debugService = _debugService;
    this._editorService = _editorService;
    const listeners = new ResourceMap();
    this._register(_notebookService.onWillAddNotebookDocument((model) => {
      listeners.set(model.uri, model.onWillAddRemoveCells((e) => {
        const debugModel = this._debugService.getModel();
        if (!debugModel.getBreakpoints().length) {
          return;
        }
        if (e.rawEvent.kind !== NotebookCellsChangeType.ModelChange) {
          return;
        }
        for (const change of e.rawEvent.changes) {
          const [start, deleteCount] = change;
          if (deleteCount > 0) {
            const deleted = model.cells.slice(start, start + deleteCount);
            for (const deletedCell of deleted) {
              const cellBps = debugModel.getBreakpoints({ uri: deletedCell.uri });
              cellBps.forEach((cellBp) => this._debugService.removeBreakpoints(cellBp.getId()));
            }
          }
        }
      }));
    }));
    this._register(_notebookService.onWillRemoveNotebookDocument((model) => {
      this.updateBreakpoints(model);
      listeners.get(model.uri)?.dispose();
      listeners.delete(model.uri);
    }));
    this._register(this._debugService.getModel().onDidChangeBreakpoints((e) => {
      const newCellBp = e?.added?.find((bp) => hasKey(bp, { uri: true }) && bp.uri.scheme === Schemas.vscodeNotebookCell);
      if (newCellBp) {
        const parsed = CellUri.parse(newCellBp.uri);
        if (!parsed) {
          return;
        }
        const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        if (!editor || !editor.hasModel() || editor.textModel.uri.toString() !== parsed.notebook.toString()) {
          return;
        }
        const cell = editor.getCellByHandle(parsed.handle);
        if (!cell) {
          return;
        }
        editor.focusElement(cell);
      }
    }));
  }
  updateBreakpoints(model) {
    const bps = this._debugService.getModel().getBreakpoints();
    if (!bps.length || !model.cells.length) {
      return;
    }
    const idxMap = new ResourceMap();
    model.cells.forEach((cell, i) => {
      idxMap.set(cell.uri, i);
    });
    bps.forEach((bp) => {
      const idx = idxMap.get(bp.uri);
      if (typeof idx !== "number") {
        return;
      }
      const notebook = CellUri.parse(bp.uri)?.notebook;
      if (!notebook) {
        return;
      }
      const newUri = CellUri.generate(notebook, idx);
      if (isEqual(newUri, bp.uri)) {
        return;
      }
      this._debugService.removeBreakpoints(bp.getId());
      this._debugService.addBreakpoints(newUri, [
        {
          column: bp.column,
          condition: bp.condition,
          enabled: bp.enabled,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
          lineNumber: bp.lineNumber
        }
      ]);
    });
  }
};
NotebookBreakpoints = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, INotebookService),
  __decorateParam(2, IEditorService)
], NotebookBreakpoints);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookBreakpoints, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxkZWJ1Z1xcbm90ZWJvb2tCcmVha3BvaW50cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUJyZWFrcG9pbnQsIElEZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpLCBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuY2xhc3MgTm90ZWJvb2tCcmVha3BvaW50cyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXJzID0gbmV3IFJlc291cmNlTWFwPElEaXNwb3NhYmxlPigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9ub3RlYm9va1NlcnZpY2Uub25XaWxsQWRkTm90ZWJvb2tEb2N1bWVudChtb2RlbCA9PiB7XG5cdFx0XHRsaXN0ZW5lcnMuc2V0KG1vZGVsLnVyaSwgbW9kZWwub25XaWxsQWRkUmVtb3ZlQ2VsbHMoZSA9PiB7XG5cdFx0XHRcdC8vIFdoZW4gZGVsZXRpbmcgYSBjZWxsLCByZW1vdmUgaXRzIGJyZWFrcG9pbnRzXG5cdFx0XHRcdGNvbnN0IGRlYnVnTW9kZWwgPSB0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKTtcblx0XHRcdFx0aWYgKCFkZWJ1Z01vZGVsLmdldEJyZWFrcG9pbnRzKCkubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUucmF3RXZlbnQua2luZCAhPT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBlLnJhd0V2ZW50LmNoYW5nZXMpIHtcblx0XHRcdFx0XHRjb25zdCBbc3RhcnQsIGRlbGV0ZUNvdW50XSA9IGNoYW5nZTtcblx0XHRcdFx0XHRpZiAoZGVsZXRlQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWxldGVkID0gbW9kZWwuY2VsbHMuc2xpY2Uoc3RhcnQsIHN0YXJ0ICsgZGVsZXRlQ291bnQpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBkZWxldGVkQ2VsbCBvZiBkZWxldGVkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNlbGxCcHMgPSBkZWJ1Z01vZGVsLmdldEJyZWFrcG9pbnRzKHsgdXJpOiBkZWxldGVkQ2VsbC51cmkgfSk7XG5cdFx0XHRcdFx0XHRcdGNlbGxCcHMuZm9yRWFjaChjZWxsQnAgPT4gdGhpcy5fZGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGNlbGxCcC5nZXRJZCgpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX25vdGVib29rU2VydmljZS5vbldpbGxSZW1vdmVOb3RlYm9va0RvY3VtZW50KG1vZGVsID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQnJlYWtwb2ludHMobW9kZWwpO1xuXHRcdFx0bGlzdGVuZXJzLmdldChtb2RlbC51cmkpPy5kaXNwb3NlKCk7XG5cdFx0XHRsaXN0ZW5lcnMuZGVsZXRlKG1vZGVsLnVyaSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkub25EaWRDaGFuZ2VCcmVha3BvaW50cyhlID0+IHtcblx0XHRcdGNvbnN0IG5ld0NlbGxCcCA9IGU/LmFkZGVkPy5maW5kKGJwID0+IGhhc0tleShicCwgeyB1cmk6IHRydWUgfSkgJiYgYnAudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIGFzIElCcmVha3BvaW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKG5ld0NlbGxCcCkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBDZWxsVXJpLnBhcnNlKG5ld0NlbGxCcC51cmkpO1xuXHRcdFx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRcdFx0aWYgKCFlZGl0b3IgfHwgIWVkaXRvci5oYXNNb2RlbCgpIHx8IGVkaXRvci50ZXh0TW9kZWwudXJpLnRvU3RyaW5nKCkgIT09IHBhcnNlZC5ub3RlYm9vay50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblxuXHRcdFx0XHRjb25zdCBjZWxsID0gZWRpdG9yLmdldENlbGxCeUhhbmRsZShwYXJzZWQuaGFuZGxlKTtcblx0XHRcdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZWRpdG9yLmZvY3VzRWxlbWVudChjZWxsKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUJyZWFrcG9pbnRzKG1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IGJwcyA9IHRoaXMuX2RlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRzKCk7XG5cdFx0aWYgKCFicHMubGVuZ3RoIHx8ICFtb2RlbC5jZWxscy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpZHhNYXAgPSBuZXcgUmVzb3VyY2VNYXA8bnVtYmVyPigpO1xuXHRcdG1vZGVsLmNlbGxzLmZvckVhY2goKGNlbGwsIGkpID0+IHtcblx0XHRcdGlkeE1hcC5zZXQoY2VsbC51cmksIGkpO1xuXHRcdH0pO1xuXG5cdFx0YnBzLmZvckVhY2goYnAgPT4ge1xuXHRcdFx0Y29uc3QgaWR4ID0gaWR4TWFwLmdldChicC51cmkpO1xuXHRcdFx0aWYgKHR5cGVvZiBpZHggIT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgbm90ZWJvb2sgPSBDZWxsVXJpLnBhcnNlKGJwLnVyaSk/Lm5vdGVib29rO1xuXHRcdFx0aWYgKCFub3RlYm9vaykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld1VyaSA9IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2ssIGlkeCk7XG5cdFx0XHRpZiAoaXNFcXVhbChuZXdVcmksIGJwLnVyaSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnAuZ2V0SWQoKSk7XG5cdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2UuYWRkQnJlYWtwb2ludHMobmV3VXJpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb2x1bW46IGJwLmNvbHVtbixcblx0XHRcdFx0XHRjb25kaXRpb246IGJwLmNvbmRpdGlvbixcblx0XHRcdFx0XHRlbmFibGVkOiBicC5lbmFibGVkLFxuXHRcdFx0XHRcdGhpdENvbmRpdGlvbjogYnAuaGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRcdGxvZ01lc3NhZ2U6IGJwLmxvZ01lc3NhZ2UsXG5cdFx0XHRcdFx0bGluZU51bWJlcjogYnAubGluZU51bWJlclxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oTm90ZWJvb2tCcmVha3BvaW50cywgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUErQjtBQUN4QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYywyQkFBb0Y7QUFDM0csU0FBc0IscUJBQXFCO0FB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
