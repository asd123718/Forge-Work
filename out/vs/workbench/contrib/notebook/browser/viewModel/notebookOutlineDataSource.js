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
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IMarkerService } from "../../../../../platform/markers/common/markers.js";
import { CellKind } from "../../common/notebookCommon.js";
import { OutlineConfigKeys } from "../../../../services/outline/browser/outline.js";
import { INotebookOutlineEntryFactory } from "./notebookOutlineEntryFactory.js";
let NotebookCellOutlineDataSource = class {
  constructor(_editor, _markerService, _configurationService, _outlineEntryFactory) {
    this._editor = _editor;
    this._markerService = _markerService;
    this._configurationService = _configurationService;
    this._outlineEntryFactory = _outlineEntryFactory;
    this._disposables = new DisposableStore();
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._entries = [];
    this.recomputeState();
  }
  get activeElement() {
    return this._activeEntry;
  }
  get entries() {
    return this._entries;
  }
  get isEmpty() {
    return this._entries.length === 0;
  }
  get uri() {
    return this._uri;
  }
  async computeFullSymbols(cancelToken) {
    try {
      const notebookEditorWidget = this._editor;
      const notebookCells = notebookEditorWidget?.getViewModel()?.viewCells.filter((cell) => cell.cellKind === CellKind.Code);
      if (notebookCells) {
        const promises = [];
        for (const cell of notebookCells.slice(0, 50)) {
          promises.push(this._outlineEntryFactory.cacheSymbols(cell, cancelToken));
        }
        await Promise.allSettled(promises);
      }
      this.recomputeState();
    } catch (err) {
      console.error("Failed to compute notebook outline symbols:", err);
      this.recomputeState();
    }
  }
  recomputeState() {
    this._disposables.clear();
    this._activeEntry = void 0;
    this._uri = void 0;
    if (!this._editor.hasModel()) {
      return;
    }
    this._uri = this._editor.textModel.uri;
    const notebookEditorWidget = this._editor;
    if (notebookEditorWidget.getLength() === 0) {
      return;
    }
    const notebookCells = notebookEditorWidget.getViewModel().viewCells;
    const entries = [];
    for (const cell of notebookCells) {
      entries.push(...this._outlineEntryFactory.getOutlineEntries(cell, entries.length));
    }
    if (entries.length > 0) {
      const result = [entries[0]];
      const parentStack = [entries[0]];
      for (let i = 1; i < entries.length; i++) {
        const entry = entries[i];
        while (true) {
          const len = parentStack.length;
          if (len === 0) {
            result.push(entry);
            parentStack.push(entry);
            break;
          } else {
            const parentCandidate = parentStack[len - 1];
            if (parentCandidate.level < entry.level) {
              parentCandidate.addChild(entry);
              parentStack.push(entry);
              break;
            } else {
              parentStack.pop();
            }
          }
        }
      }
      this._entries = result;
    }
    const markerServiceListener = new MutableDisposable();
    this._disposables.add(markerServiceListener);
    const updateMarkerUpdater = () => {
      if (notebookEditorWidget.isDisposed) {
        return;
      }
      const doUpdateMarker = (clear) => {
        for (const entry of this._entries) {
          if (clear) {
            entry.clearMarkers();
          } else {
            entry.updateMarkers(this._markerService);
          }
        }
      };
      const problem = this._configurationService.getValue("problems.visibility");
      if (problem === void 0) {
        return;
      }
      const config = this._configurationService.getValue(OutlineConfigKeys.problemsEnabled);
      if (problem && config) {
        markerServiceListener.value = this._markerService.onMarkerChanged((e) => {
          if (notebookEditorWidget.isDisposed) {
            console.error("notebook editor is disposed");
            return;
          }
          if (e.some((uri) => notebookEditorWidget.getCellsInRange().some((cell) => isEqual(cell.uri, uri)))) {
            doUpdateMarker(false);
            this._onDidChange.fire({});
          }
        });
        doUpdateMarker(false);
      } else {
        markerServiceListener.clear();
        doUpdateMarker(true);
      }
    };
    updateMarkerUpdater();
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("problems.visibility") || e.affectsConfiguration(OutlineConfigKeys.problemsEnabled)) {
        updateMarkerUpdater();
        this._onDidChange.fire({});
      }
    }));
    const { changeEventTriggered } = this.recomputeActive();
    if (!changeEventTriggered) {
      this._onDidChange.fire({});
    }
  }
  recomputeActive() {
    let newActive;
    const notebookEditorWidget = this._editor;
    if (notebookEditorWidget) {
      if (notebookEditorWidget.hasModel() && notebookEditorWidget.getLength() > 0) {
        const cell = notebookEditorWidget.cellAt(notebookEditorWidget.getFocus().start);
        if (cell) {
          for (const entry of this._entries) {
            newActive = entry.find(cell, []);
            if (newActive) {
              break;
            }
          }
        }
      }
    }
    if (newActive !== this._activeEntry) {
      this._activeEntry = newActive;
      this._onDidChange.fire({ affectOnlyActiveElement: true });
      return { changeEventTriggered: true };
    }
    return { changeEventTriggered: false };
  }
  dispose() {
    this._entries.length = 0;
    this._activeEntry = void 0;
    this._disposables.dispose();
    this._onDidChange.dispose();
  }
};
NotebookCellOutlineDataSource = __decorateClass([
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, INotebookOutlineEntryFactory)
], NotebookCellOutlineDataSource);
export {
  NotebookCellOutlineDataSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3TW9kZWxcXG5vdGVib29rT3V0bGluZURhdGFTb3VyY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgT3V0bGluZUNoYW5nZUV2ZW50LCBPdXRsaW5lQ29uZmlnS2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLmpzJztcbmltcG9ydCB7IE91dGxpbmVFbnRyeSB9IGZyb20gJy4vT3V0bGluZUVudHJ5LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnksIE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeSB9IGZyb20gJy4vbm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2Uge1xuXHRyZWFkb25seSBhY3RpdmVFbGVtZW50OiBPdXRsaW5lRW50cnkgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGVudHJpZXM6IE91dGxpbmVFbnRyeVtdO1xufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2UgaW1wbGVtZW50cyBJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2Uge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8T3V0bGluZUNoYW5nZUV2ZW50PigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8T3V0bGluZUNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX3VyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lbnRyaWVzOiBPdXRsaW5lRW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIF9hY3RpdmVFbnRyeT86IE91dGxpbmVFbnRyeTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5IHByaXZhdGUgcmVhZG9ubHkgX291dGxpbmVFbnRyeUZhY3Rvcnk6IE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeVxuXHQpIHtcblx0XHR0aGlzLnJlY29tcHV0ZVN0YXRlKCk7XG5cdH1cblxuXHRnZXQgYWN0aXZlRWxlbWVudCgpOiBPdXRsaW5lRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVFbnRyeTtcblx0fVxuXHRnZXQgZW50cmllcygpOiBPdXRsaW5lRW50cnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXM7XG5cdH1cblx0Z2V0IGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXMubGVuZ3RoID09PSAwO1xuXHR9XG5cdGdldCB1cmkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3VyaTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb21wdXRlRnVsbFN5bWJvbHMoY2FuY2VsVG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9yV2lkZ2V0ID0gdGhpcy5fZWRpdG9yO1xuXG5cdFx0XHRjb25zdCBub3RlYm9va0NlbGxzID0gbm90ZWJvb2tFZGl0b3JXaWRnZXQ/LmdldFZpZXdNb2RlbCgpPy52aWV3Q2VsbHMuZmlsdGVyKChjZWxsKSA9PiBjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKTtcblxuXHRcdFx0aWYgKG5vdGVib29rQ2VsbHMpIHtcblx0XHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0XHQvLyBsaW1pdCB0aGUgbnVtYmVyIG9mIGNlbGxzIHNvIHRoYXQgd2UgZG9uJ3QgcmVzb2x2ZSBhbiBleGNlc3NpdmUgYW1vdW50IG9mIHRleHQgbW9kZWxzXG5cdFx0XHRcdGZvciAoY29uc3QgY2VsbCBvZiBub3RlYm9va0NlbGxzLnNsaWNlKDAsIDUwKSkge1xuXHRcdFx0XHRcdC8vIGdhdGhlciBhbGwgc3ltYm9scyBhc3luY2hyb25vdXNseVxuXHRcdFx0XHRcdHByb21pc2VzLnB1c2godGhpcy5fb3V0bGluZUVudHJ5RmFjdG9yeS5jYWNoZVN5bWJvbHMoY2VsbCwgY2FuY2VsVG9rZW4pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocHJvbWlzZXMpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZWNvbXB1dGVTdGF0ZSgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRmFpbGVkIHRvIGNvbXB1dGUgbm90ZWJvb2sgb3V0bGluZSBzeW1ib2xzOicsIGVycik7XG5cdFx0XHQvLyBTdGlsbCByZWNvbXB1dGUgc3RhdGUgd2l0aCB3aGF0ZXZlciBzeW1ib2xzIHdlIGhhdmVcblx0XHRcdHRoaXMucmVjb21wdXRlU3RhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVjb21wdXRlU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3RpdmVFbnRyeSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl91cmkgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXJpID0gdGhpcy5fZWRpdG9yLnRleHRNb2RlbC51cmk7XG5cblx0XHRjb25zdCBub3RlYm9va0VkaXRvcldpZGdldDogSUFjdGl2ZU5vdGVib29rRWRpdG9yID0gdGhpcy5fZWRpdG9yO1xuXG5cdFx0aWYgKG5vdGVib29rRWRpdG9yV2lkZ2V0LmdldExlbmd0aCgpID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm90ZWJvb2tDZWxscyA9IG5vdGVib29rRWRpdG9yV2lkZ2V0LmdldFZpZXdNb2RlbCgpLnZpZXdDZWxscztcblxuXHRcdGNvbnN0IGVudHJpZXM6IE91dGxpbmVFbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIG5vdGVib29rQ2VsbHMpIHtcblx0XHRcdGVudHJpZXMucHVzaCguLi50aGlzLl9vdXRsaW5lRW50cnlGYWN0b3J5LmdldE91dGxpbmVFbnRyaWVzKGNlbGwsIGVudHJpZXMubGVuZ3RoKSk7XG5cdFx0fVxuXG5cdFx0Ly8gYnVpbGQgYSB0cmVlIGZyb20gdGhlIGxpc3Qgb2YgZW50cmllc1xuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogT3V0bGluZUVudHJ5W10gPSBbZW50cmllc1swXV07XG5cdFx0XHRjb25zdCBwYXJlbnRTdGFjazogT3V0bGluZUVudHJ5W10gPSBbZW50cmllc1swXV07XG5cblx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZW50cmllcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IGVudHJpZXNbaV07XG5cblx0XHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0XHRjb25zdCBsZW4gPSBwYXJlbnRTdGFjay5sZW5ndGg7XG5cdFx0XHRcdFx0aWYgKGxlbiA9PT0gMCkge1xuXHRcdFx0XHRcdFx0Ly8gcm9vdCBub2RlXG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChlbnRyeSk7XG5cdFx0XHRcdFx0XHRwYXJlbnRTdGFjay5wdXNoKGVudHJ5KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcmVudENhbmRpZGF0ZSA9IHBhcmVudFN0YWNrW2xlbiAtIDFdO1xuXHRcdFx0XHRcdFx0aWYgKHBhcmVudENhbmRpZGF0ZS5sZXZlbCA8IGVudHJ5LmxldmVsKSB7XG5cdFx0XHRcdFx0XHRcdHBhcmVudENhbmRpZGF0ZS5hZGRDaGlsZChlbnRyeSk7XG5cdFx0XHRcdFx0XHRcdHBhcmVudFN0YWNrLnB1c2goZW50cnkpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHBhcmVudFN0YWNrLnBvcCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZW50cmllcyA9IHJlc3VsdDtcblx0XHR9XG5cblx0XHQvLyBmZWF0dXJlOiBzaG93IG1hcmtlcnMgd2l0aCBlYWNoIGNlbGxcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlTGlzdGVuZXIgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGUoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobWFya2VyU2VydmljZUxpc3RlbmVyKTtcblx0XHRjb25zdCB1cGRhdGVNYXJrZXJVcGRhdGVyID0gKCkgPT4ge1xuXHRcdFx0aWYgKG5vdGVib29rRWRpdG9yV2lkZ2V0LmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkb1VwZGF0ZU1hcmtlciA9IChjbGVhcjogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2VudHJpZXMpIHtcblx0XHRcdFx0XHRpZiAoY2xlYXIpIHtcblx0XHRcdFx0XHRcdGVudHJ5LmNsZWFyTWFya2VycygpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlbnRyeS51cGRhdGVNYXJrZXJzKHRoaXMuX21hcmtlclNlcnZpY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHByb2JsZW0gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgncHJvYmxlbXMudmlzaWJpbGl0eScpO1xuXHRcdFx0aWYgKHByb2JsZW0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE91dGxpbmVDb25maWdLZXlzLnByb2JsZW1zRW5hYmxlZCk7XG5cblx0XHRcdGlmIChwcm9ibGVtICYmIGNvbmZpZykge1xuXHRcdFx0XHRtYXJrZXJTZXJ2aWNlTGlzdGVuZXIudmFsdWUgPSB0aGlzLl9tYXJrZXJTZXJ2aWNlLm9uTWFya2VyQ2hhbmdlZChlID0+IHtcblx0XHRcdFx0XHRpZiAobm90ZWJvb2tFZGl0b3JXaWRnZXQuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcignbm90ZWJvb2sgZWRpdG9yIGlzIGRpc3Bvc2VkJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGUuc29tZSh1cmkgPT4gbm90ZWJvb2tFZGl0b3JXaWRnZXQuZ2V0Q2VsbHNJblJhbmdlKCkuc29tZShjZWxsID0+IGlzRXF1YWwoY2VsbC51cmksIHVyaSkpKSkge1xuXHRcdFx0XHRcdFx0ZG9VcGRhdGVNYXJrZXIoZmFsc2UpO1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZG9VcGRhdGVNYXJrZXIoZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFya2VyU2VydmljZUxpc3RlbmVyLmNsZWFyKCk7XG5cdFx0XHRcdGRvVXBkYXRlTWFya2VyKHRydWUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dXBkYXRlTWFya2VyVXBkYXRlcigpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbigncHJvYmxlbXMudmlzaWJpbGl0eScpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oT3V0bGluZUNvbmZpZ0tleXMucHJvYmxlbXNFbmFibGVkKSkge1xuXHRcdFx0XHR1cGRhdGVNYXJrZXJVcGRhdGVyKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoe30pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHsgY2hhbmdlRXZlbnRUcmlnZ2VyZWQgfSA9IHRoaXMucmVjb21wdXRlQWN0aXZlKCk7XG5cdFx0aWYgKCFjaGFuZ2VFdmVudFRyaWdnZXJlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7fSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlY29tcHV0ZUFjdGl2ZSgpOiB7IGNoYW5nZUV2ZW50VHJpZ2dlcmVkOiBib29sZWFuIH0ge1xuXHRcdGxldCBuZXdBY3RpdmU6IE91dGxpbmVFbnRyeSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvcldpZGdldCA9IHRoaXMuX2VkaXRvcjtcblxuXHRcdGlmIChub3RlYm9va0VkaXRvcldpZGdldCkgey8vVE9ETyBkb24ndCBjaGVjayBmb3Igd2lkZ2V0LCBvbmx5IGhlcmUgaWYgd2UgZG8gaGF2ZVxuXHRcdFx0aWYgKG5vdGVib29rRWRpdG9yV2lkZ2V0Lmhhc01vZGVsKCkgJiYgbm90ZWJvb2tFZGl0b3JXaWRnZXQuZ2V0TGVuZ3RoKCkgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSBub3RlYm9va0VkaXRvcldpZGdldC5jZWxsQXQobm90ZWJvb2tFZGl0b3JXaWRnZXQuZ2V0Rm9jdXMoKS5zdGFydCk7XG5cdFx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9lbnRyaWVzKSB7XG5cdFx0XHRcdFx0XHRuZXdBY3RpdmUgPSBlbnRyeS5maW5kKGNlbGwsIFtdKTtcblx0XHRcdFx0XHRcdGlmIChuZXdBY3RpdmUpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0FjdGl2ZSAhPT0gdGhpcy5fYWN0aXZlRW50cnkpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUVudHJ5ID0gbmV3QWN0aXZlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGFmZmVjdE9ubHlBY3RpdmVFbGVtZW50OiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuIHsgY2hhbmdlRXZlbnRUcmlnZ2VyZWQ6IHRydWUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgY2hhbmdlRXZlbnRUcmlnZ2VyZWQ6IGZhbHNlIH07XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VudHJpZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9hY3RpdmVFbnRyeSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFw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
