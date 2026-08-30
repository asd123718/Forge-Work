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
import { RunOnceScheduler } from "../../../../../../base/common/async.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../../../common/contributions.js";
import { IDebugService } from "../../../../debug/common/debug.js";
import { CellUri } from "../../../common/notebookCommon.js";
import { CellExecutionUpdateType } from "../../../common/notebookExecutionService.js";
import { INotebookExecutionStateService } from "../../../common/notebookExecutionStateService.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
let NotebookCellPausing = class extends Disposable {
  constructor(_debugService, _notebookExecutionStateService) {
    super();
    this._debugService = _debugService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this._pausedCells = /* @__PURE__ */ new Set();
    this._register(_debugService.getModel().onDidChangeCallStack(() => {
      this.onDidChangeCallStack(true);
      this._scheduler.schedule();
    }));
    this._scheduler = this._register(new RunOnceScheduler(() => this.onDidChangeCallStack(false), 2e3));
  }
  async onDidChangeCallStack(fallBackOnStaleCallstack) {
    const newPausedCells = /* @__PURE__ */ new Set();
    for (const session of this._debugService.getModel().getSessions()) {
      for (const thread of session.getAllThreads()) {
        let callStack = thread.getCallStack();
        if (fallBackOnStaleCallstack && !callStack.length) {
          callStack = thread.getStaleCallStack();
        }
        callStack.forEach((sf) => {
          const parsed = CellUri.parse(sf.source.uri);
          if (parsed) {
            newPausedCells.add(sf.source.uri.toString());
            this.editIsPaused(sf.source.uri, true);
          }
        });
      }
    }
    for (const uri of this._pausedCells) {
      if (!newPausedCells.has(uri)) {
        this.editIsPaused(URI.parse(uri), false);
        this._pausedCells.delete(uri);
      }
    }
    newPausedCells.forEach((cell) => this._pausedCells.add(cell));
  }
  editIsPaused(cellUri, isPaused) {
    const parsed = CellUri.parse(cellUri);
    if (parsed) {
      const exeState = this._notebookExecutionStateService.getCellExecution(cellUri);
      if (exeState && (exeState.isPaused !== isPaused || !exeState.didPause)) {
        exeState.update([{
          editType: CellExecutionUpdateType.ExecutionState,
          didPause: true,
          isPaused
        }]);
      }
    }
  }
};
NotebookCellPausing = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, INotebookExecutionStateService)
], NotebookCellPausing);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookCellPausing, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxkZWJ1Z1xcbm90ZWJvb2tDZWxsUGF1c2luZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZGVidWcvY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IFRocmVhZCB9IGZyb20gJy4uLy4uLy4uLy4uL2RlYnVnL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IENlbGxVcmkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuY2xhc3MgTm90ZWJvb2tDZWxsUGF1c2luZyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcGF1c2VkQ2VsbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIF9zY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZUNhbGxTdGFjaygoKSA9PiB7XG5cdFx0XHQvLyBGaXJzdCB1cGRhdGUgdXNpbmcgdGhlIHN0YWxlIGNhbGxzdGFjayBpZiB0aGUgcmVhbCBjYWxsc3RhY2sgaXMgZW1wdHksIHRvIHJlZHVjZSBibGlua2luZyB3aGlsZSBzdGVwcGluZy5cblx0XHRcdC8vIEFmdGVyIG5vdCBwYXVzaW5nIGZvciAycywgdXBkYXRlIGFnYWluIHdpdGggdGhlIGxhdGVzdCBjYWxsc3RhY2suXG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlQ2FsbFN0YWNrKHRydWUpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3NjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMub25EaWRDaGFuZ2VDYWxsU3RhY2soZmFsc2UpLCAyMDAwKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkQ2hhbmdlQ2FsbFN0YWNrKGZhbGxCYWNrT25TdGFsZUNhbGxzdGFjazogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5ld1BhdXNlZENlbGxzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCB0aHJlYWQgb2Ygc2Vzc2lvbi5nZXRBbGxUaHJlYWRzKCkpIHtcblx0XHRcdFx0bGV0IGNhbGxTdGFjayA9IHRocmVhZC5nZXRDYWxsU3RhY2soKTtcblx0XHRcdFx0aWYgKGZhbGxCYWNrT25TdGFsZUNhbGxzdGFjayAmJiAhY2FsbFN0YWNrLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNhbGxTdGFjayA9ICh0aHJlYWQgYXMgVGhyZWFkKS5nZXRTdGFsZUNhbGxTdGFjaygpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2FsbFN0YWNrLmZvckVhY2goc2YgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnNlZCA9IENlbGxVcmkucGFyc2Uoc2Yuc291cmNlLnVyaSk7XG5cdFx0XHRcdFx0aWYgKHBhcnNlZCkge1xuXHRcdFx0XHRcdFx0bmV3UGF1c2VkQ2VsbHMuYWRkKHNmLnNvdXJjZS51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHR0aGlzLmVkaXRJc1BhdXNlZChzZi5zb3VyY2UudXJpLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdXJpIG9mIHRoaXMuX3BhdXNlZENlbGxzKSB7XG5cdFx0XHRpZiAoIW5ld1BhdXNlZENlbGxzLmhhcyh1cmkpKSB7XG5cdFx0XHRcdHRoaXMuZWRpdElzUGF1c2VkKFVSSS5wYXJzZSh1cmkpLCBmYWxzZSk7XG5cdFx0XHRcdHRoaXMuX3BhdXNlZENlbGxzLmRlbGV0ZSh1cmkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG5ld1BhdXNlZENlbGxzLmZvckVhY2goY2VsbCA9PiB0aGlzLl9wYXVzZWRDZWxscy5hZGQoY2VsbCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBlZGl0SXNQYXVzZWQoY2VsbFVyaTogVVJJLCBpc1BhdXNlZDogYm9vbGVhbikge1xuXHRcdGNvbnN0IHBhcnNlZCA9IENlbGxVcmkucGFyc2UoY2VsbFVyaSk7XG5cdFx0aWYgKHBhcnNlZCkge1xuXHRcdFx0Y29uc3QgZXhlU3RhdGUgPSB0aGlzLl9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5nZXRDZWxsRXhlY3V0aW9uKGNlbGxVcmkpO1xuXHRcdFx0aWYgKGV4ZVN0YXRlICYmIChleGVTdGF0ZS5pc1BhdXNlZCAhPT0gaXNQYXVzZWQgfHwgIWV4ZVN0YXRlLmRpZFBhdXNlKSkge1xuXHRcdFx0XHRleGVTdGF0ZS51cGRhdGUoW3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuRXhlY3V0aW9uU3RhdGUsXG5cdFx0XHRcdFx0ZGlkUGF1c2U6IHRydWUsXG5cdFx0XHRcdFx0aXNQYXVzZWRcblx0XHRcdFx0fV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oTm90ZWJvb2tDZWxsUGF1c2luZywgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjLDJCQUFvRjtBQUMzRyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGVBQWU7QUFDeEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxzQkFBc0I7QUFFL0IsSUFBTSxzQkFBTixjQUFrQyxXQUE2QztBQUFBLEVBSzlFLFlBQ2lDLGVBQ2lCLGdDQUNoRDtBQUNELFVBQU07QUFIMEI7QUFDaUI7QUFObEQsU0FBaUIsZUFBZSxvQkFBSSxJQUFZO0FBVS9DLFNBQUssVUFBVSxjQUFjLFNBQVMsRUFBRSxxQkFBcUIsTUFBTTtBQUdsRSxXQUFLLHFCQUFxQixJQUFJO0FBQzlCLFdBQUssV0FBVyxTQUFTO0FBQUEsSUFDMUIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxhQUFhLEtBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNLEtBQUsscUJBQXFCLEtBQUssR0FBRyxHQUFJLENBQUM7QUFBQSxFQUNwRztBQUFBLEVBRUEsTUFBYyxxQkFBcUIsMEJBQWtEO0FBQ3BGLFVBQU0saUJBQWlCLG9CQUFJLElBQVk7QUFFdkMsZUFBVyxXQUFXLEtBQUssY0FBYyxTQUFTLEVBQUUsWUFBWSxHQUFHO0FBQ2xFLGlCQUFXLFVBQVUsUUFBUSxjQUFjLEdBQUc7QUFDN0MsWUFBSSxZQUFZLE9BQU8sYUFBYTtBQUNwQyxZQUFJLDRCQUE0QixDQUFDLFVBQVUsUUFBUTtBQUNsRCxzQkFBYSxPQUFrQixrQkFBa0I7QUFBQSxRQUNsRDtBQUVBLGtCQUFVLFFBQVEsUUFBTTtBQUN2QixnQkFBTSxTQUFTLFFBQVEsTUFBTSxHQUFHLE9BQU8sR0FBRztBQUMxQyxjQUFJLFFBQVE7QUFDWCwyQkFBZSxJQUFJLEdBQUcsT0FBTyxJQUFJLFNBQVMsQ0FBQztBQUMzQyxpQkFBSyxhQUFhLEdBQUcsT0FBTyxLQUFLLElBQUk7QUFBQSxVQUN0QztBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBRUEsZUFBVyxPQUFPLEtBQUssY0FBYztBQUNwQyxVQUFJLENBQUMsZUFBZSxJQUFJLEdBQUcsR0FBRztBQUM3QixhQUFLLGFBQWEsSUFBSSxNQUFNLEdBQUcsR0FBRyxLQUFLO0FBQ3ZDLGFBQUssYUFBYSxPQUFPLEdBQUc7QUFBQSxNQUM3QjtBQUFBLElBQ0Q7QUFFQSxtQkFBZSxRQUFRLFVBQVEsS0FBSyxhQUFhLElBQUksSUFBSSxDQUFDO0FBQUEsRUFDM0Q7QUFBQSxFQUVRLGFBQWEsU0FBYyxVQUFtQjtBQUNyRCxVQUFNLFNBQVMsUUFBUSxNQUFNLE9BQU87QUFDcEMsUUFBSSxRQUFRO0FBQ1gsWUFBTSxXQUFXLEtBQUssK0JBQStCLGlCQUFpQixPQUFPO0FBQzdFLFVBQUksYUFBYSxTQUFTLGFBQWEsWUFBWSxDQUFDLFNBQVMsV0FBVztBQUN2RSxpQkFBUyxPQUFPLENBQUM7QUFBQSxVQUNoQixVQUFVLHdCQUF3QjtBQUFBLFVBQ2xDLFVBQVU7QUFBQSxVQUNWO0FBQUEsUUFDRCxDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQS9ETSxzQkFBTjtBQUFBLEVBTUc7QUFBQSxFQUNBO0FBQUEsR0FQRztBQWlFTixTQUFTLEdBQW9DLG9CQUFvQixTQUFTLEVBQUUsOEJBQThCLHFCQUFxQixlQUFlLFFBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
