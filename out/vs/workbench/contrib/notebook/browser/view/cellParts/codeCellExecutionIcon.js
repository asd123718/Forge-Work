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
import * as DOM from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { errorStateIcon, executingStateIcon, pendingStateIcon, successStateIcon } from "../../notebookIcons.js";
import { NotebookCellExecutionState } from "../../../common/notebookCommon.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
let CollapsedCodeCellExecutionIcon = class extends Disposable {
  constructor(_notebookEditor, _cell, _element, _executionStateService) {
    super();
    this._cell = _cell;
    this._element = _element;
    this._executionStateService = _executionStateService;
    this._visible = false;
    this._update();
    this._register(this._executionStateService.onDidChangeExecution((e) => {
      if (e.type === NotebookExecutionType.cell && e.affectsCell(this._cell.uri)) {
        this._update();
      }
    }));
    this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
  }
  setVisibility(visible) {
    this._visible = visible;
    this._update();
  }
  _update() {
    if (!this._visible) {
      return;
    }
    const runState = this._executionStateService.getCellExecution(this._cell.uri);
    const item = this._getItemForState(runState, this._cell.model.internalMetadata);
    if (item) {
      this._element.style.display = "";
      DOM.reset(this._element, ...renderLabelWithIcons(item.text));
      this._element.title = item.tooltip ?? "";
    } else {
      this._element.style.display = "none";
      DOM.reset(this._element);
    }
  }
  _getItemForState(runState, internalMetadata) {
    const state = runState?.state;
    const { lastRunSuccess } = internalMetadata;
    if (!state && lastRunSuccess) {
      return {
        text: `$(${successStateIcon.id})`,
        tooltip: localize("notebook.cell.status.success", "Success")
      };
    } else if (!state && lastRunSuccess === false) {
      return {
        text: `$(${errorStateIcon.id})`,
        tooltip: localize("notebook.cell.status.failure", "Failure")
      };
    } else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
      return {
        text: `$(${pendingStateIcon.id})`,
        tooltip: localize("notebook.cell.status.pending", "Pending")
      };
    } else if (state === NotebookCellExecutionState.Executing) {
      const icon = ThemeIcon.modify(executingStateIcon, "spin");
      return {
        text: `$(${icon.id})`,
        tooltip: localize("notebook.cell.status.executing", "Executing")
      };
    }
    return;
  }
};
CollapsedCodeCellExecutionIcon = __decorateClass([
  __decorateParam(3, INotebookExecutionStateService)
], CollapsedCodeCellExecutionIcon);
export {
  CollapsedCodeCellExecutionIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxjZWxsUGFydHNcXGNvZGVDZWxsRXhlY3V0aW9uSWNvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBlcnJvclN0YXRlSWNvbiwgZXhlY3V0aW5nU3RhdGVJY29uLCBwZW5kaW5nU3RhdGVJY29uLCBzdWNjZXNzU3RhdGVJY29uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tJY29ucy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZSwgTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsRXhlY3V0aW9uLCBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsIE5vdGVib29rRXhlY3V0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJRXhlY3V0aW9uSXRlbSB7XG5cdHRleHQ6IHN0cmluZztcblx0dG9vbHRpcD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIENvbGxhcHNlZENvZGVDZWxsRXhlY3V0aW9uSWNvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF92aXNpYmxlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0X25vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jZWxsOiBJQ2VsbFZpZXdNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIHByaXZhdGUgX2V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRXhlY3V0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUudHlwZSA9PT0gTm90ZWJvb2tFeGVjdXRpb25UeXBlLmNlbGwgJiYgZS5hZmZlY3RzQ2VsbCh0aGlzLl9jZWxsLnVyaSkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NlbGwubW9kZWwub25EaWRDaGFuZ2VJbnRlcm5hbE1ldGFkYXRhKCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdH1cblxuXHRzZXRWaXNpYmlsaXR5KHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlID0gdmlzaWJsZTtcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZSgpIHtcblx0XHRpZiAoIXRoaXMuX3Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBydW5TdGF0ZSA9IHRoaXMuX2V4ZWN1dGlvblN0YXRlU2VydmljZS5nZXRDZWxsRXhlY3V0aW9uKHRoaXMuX2NlbGwudXJpKTtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fZ2V0SXRlbUZvclN0YXRlKHJ1blN0YXRlLCB0aGlzLl9jZWxsLm1vZGVsLmludGVybmFsTWV0YWRhdGEpO1xuXHRcdGlmIChpdGVtKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdERPTS5yZXNldCh0aGlzLl9lbGVtZW50LCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhpdGVtLnRleHQpKTtcblx0XHRcdHRoaXMuX2VsZW1lbnQudGl0bGUgPSBpdGVtLnRvb2x0aXAgPz8gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdERPTS5yZXNldCh0aGlzLl9lbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJdGVtRm9yU3RhdGUocnVuU3RhdGU6IElOb3RlYm9va0NlbGxFeGVjdXRpb24gfCB1bmRlZmluZWQsIGludGVybmFsTWV0YWRhdGE6IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEpOiBJRXhlY3V0aW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBydW5TdGF0ZT8uc3RhdGU7XG5cdFx0Y29uc3QgeyBsYXN0UnVuU3VjY2VzcyB9ID0gaW50ZXJuYWxNZXRhZGF0YTtcblx0XHRpZiAoIXN0YXRlICYmIGxhc3RSdW5TdWNjZXNzKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0ZXh0OiBgJCgke3N1Y2Nlc3NTdGF0ZUljb24uaWR9KWAsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1cy5zdWNjZXNzJywgXCJTdWNjZXNzXCIpLFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKCFzdGF0ZSAmJiBsYXN0UnVuU3VjY2VzcyA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRleHQ6IGAkKCR7ZXJyb3JTdGF0ZUljb24uaWR9KWAsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1cy5mYWlsdXJlJywgXCJGYWlsdXJlXCIpLFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5QZW5kaW5nIHx8IHN0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5VbmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGV4dDogYCQoJHtwZW5kaW5nU3RhdGVJY29uLmlkfSlgLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbm90ZWJvb2suY2VsbC5zdGF0dXMucGVuZGluZycsIFwiUGVuZGluZ1wiKSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUuRXhlY3V0aW5nKSB7XG5cdFx0XHRjb25zdCBpY29uID0gVGhlbWVJY29uLm1vZGlmeShleGVjdXRpbmdTdGF0ZUljb24sICdzcGluJyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0ZXh0OiBgJCgke2ljb24uaWR9KWAsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1cy5leGVjdXRpbmcnLCBcIkV4ZWN1dGluZ1wiKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGdCQUFnQixvQkFBb0Isa0JBQWtCLHdCQUF3QjtBQUN2RixTQUFTLGtDQUFnRTtBQUN6RSxTQUFpQyxnQ0FBZ0MsNkJBQTZCO0FBT3ZGLElBQU0saUNBQU4sY0FBNkMsV0FBVztBQUFBLEVBRzlELFlBQ0MsaUJBQ2lCLE9BQ0EsVUFDdUIsd0JBQ3ZDO0FBQ0QsVUFBTTtBQUpXO0FBQ0E7QUFDdUI7QUFOekMsU0FBUSxXQUFXO0FBVWxCLFNBQUssUUFBUTtBQUNiLFNBQUssVUFBVSxLQUFLLHVCQUF1QixxQkFBcUIsT0FBSztBQUNwRSxVQUFJLEVBQUUsU0FBUyxzQkFBc0IsUUFBUSxFQUFFLFlBQVksS0FBSyxNQUFNLEdBQUcsR0FBRztBQUMzRSxhQUFLLFFBQVE7QUFBQSxNQUNkO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxNQUFNLE1BQU0sNEJBQTRCLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ2xGO0FBQUEsRUFFQSxjQUFjLFNBQXdCO0FBQ3JDLFNBQUssV0FBVztBQUNoQixTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFUSxVQUFVO0FBQ2pCLFFBQUksQ0FBQyxLQUFLLFVBQVU7QUFDbkI7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLEtBQUssdUJBQXVCLGlCQUFpQixLQUFLLE1BQU0sR0FBRztBQUM1RSxVQUFNLE9BQU8sS0FBSyxpQkFBaUIsVUFBVSxLQUFLLE1BQU0sTUFBTSxnQkFBZ0I7QUFDOUUsUUFBSSxNQUFNO0FBQ1QsV0FBSyxTQUFTLE1BQU0sVUFBVTtBQUM5QixVQUFJLE1BQU0sS0FBSyxVQUFVLEdBQUcscUJBQXFCLEtBQUssSUFBSSxDQUFDO0FBQzNELFdBQUssU0FBUyxRQUFRLEtBQUssV0FBVztBQUFBLElBQ3ZDLE9BQU87QUFDTixXQUFLLFNBQVMsTUFBTSxVQUFVO0FBQzlCLFVBQUksTUFBTSxLQUFLLFFBQVE7QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlCQUFpQixVQUE4QyxrQkFBNEU7QUFDbEosVUFBTSxRQUFRLFVBQVU7QUFDeEIsVUFBTSxFQUFFLGVBQWUsSUFBSTtBQUMzQixRQUFJLENBQUMsU0FBUyxnQkFBZ0I7QUFDN0IsYUFBTztBQUFBLFFBQ04sTUFBTSxLQUFLLGlCQUFpQixFQUFFO0FBQUEsUUFDOUIsU0FBUyxTQUFTLGdDQUFnQyxTQUFTO0FBQUEsTUFDNUQ7QUFBQSxJQUNELFdBQVcsQ0FBQyxTQUFTLG1CQUFtQixPQUFPO0FBQzlDLGFBQU87QUFBQSxRQUNOLE1BQU0sS0FBSyxlQUFlLEVBQUU7QUFBQSxRQUM1QixTQUFTLFNBQVMsZ0NBQWdDLFNBQVM7QUFBQSxNQUM1RDtBQUFBLElBQ0QsV0FBVyxVQUFVLDJCQUEyQixXQUFXLFVBQVUsMkJBQTJCLGFBQWE7QUFDNUcsYUFBTztBQUFBLFFBQ04sTUFBTSxLQUFLLGlCQUFpQixFQUFFO0FBQUEsUUFDOUIsU0FBUyxTQUFTLGdDQUFnQyxTQUFTO0FBQUEsTUFDNUQ7QUFBQSxJQUNELFdBQVcsVUFBVSwyQkFBMkIsV0FBVztBQUMxRCxZQUFNLE9BQU8sVUFBVSxPQUFPLG9CQUFvQixNQUFNO0FBQ3hELGFBQU87QUFBQSxRQUNOLE1BQU0sS0FBSyxLQUFLLEVBQUU7QUFBQSxRQUNsQixTQUFTLFNBQVMsa0NBQWtDLFdBQVc7QUFBQSxNQUNoRTtBQUFBLElBQ0Q7QUFFQTtBQUFBLEVBQ0Q7QUFDRDtBQXRFYSxpQ0FBTjtBQUFBLEVBT0o7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
