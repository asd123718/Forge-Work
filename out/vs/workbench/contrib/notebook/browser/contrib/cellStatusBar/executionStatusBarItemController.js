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
import { disposableTimeout, RunOnceScheduler } from "../../../../../../base/common/async.js";
import { Disposable, dispose, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { language } from "../../../../../../base/common/platform.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { themeColorFromId } from "../../../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { NotebookVisibleCellObserver } from "./notebookVisibleCellObserver.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { cellStatusIconError, cellStatusIconSuccess } from "../../notebookEditorWidget.js";
import { errorStateIcon, executingStateIcon, pendingStateIcon, successStateIcon } from "../../notebookIcons.js";
import { CellStatusbarAlignment, NotebookCellExecutionState, NotebookSetting } from "../../../common/notebookCommon.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
import { INotebookService } from "../../../common/notebookService.js";
function formatCellDuration(duration, showMilliseconds = true) {
  if (showMilliseconds && duration < 1e3) {
    return `${duration}ms`;
  }
  const minutes = Math.floor(duration / 1e3 / 60);
  const seconds = Math.floor(duration / 1e3) % 60;
  const tenths = Math.floor(duration % 1e3 / 100);
  if (minutes > 0) {
    return `${minutes}m ${seconds}.${tenths}s`;
  } else {
    return `${seconds}.${tenths}s`;
  }
}
class NotebookStatusBarController extends Disposable {
  constructor(_notebookEditor, _itemFactory) {
    super();
    this._notebookEditor = _notebookEditor;
    this._itemFactory = _itemFactory;
    this._visibleCells = /* @__PURE__ */ new Map();
    this._observer = this._register(new NotebookVisibleCellObserver(this._notebookEditor));
    this._register(this._observer.onDidChangeVisibleCells(this._updateVisibleCells, this));
    this._updateEverything();
  }
  _updateEverything() {
    this._visibleCells.forEach(dispose);
    this._visibleCells.clear();
    this._updateVisibleCells({ added: this._observer.visibleCells, removed: [] });
  }
  _updateVisibleCells(e) {
    const vm = this._notebookEditor.getViewModel();
    if (!vm) {
      return;
    }
    for (const oldCell of e.removed) {
      this._visibleCells.get(oldCell.handle)?.dispose();
      this._visibleCells.delete(oldCell.handle);
    }
    for (const newCell of e.added) {
      this._visibleCells.set(newCell.handle, this._itemFactory(vm, newCell));
    }
  }
  dispose() {
    super.dispose();
    this._visibleCells.forEach(dispose);
    this._visibleCells.clear();
  }
}
let ExecutionStateCellStatusBarContrib = class extends Disposable {
  constructor(notebookEditor, instantiationService) {
    super();
    this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) => instantiationService.createInstance(ExecutionStateCellStatusBarItem, vm, cell)));
  }
};
ExecutionStateCellStatusBarContrib.id = "workbench.notebook.statusBar.execState";
ExecutionStateCellStatusBarContrib = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ExecutionStateCellStatusBarContrib);
registerNotebookContribution(ExecutionStateCellStatusBarContrib.id, ExecutionStateCellStatusBarContrib);
let ExecutionStateCellStatusBarItem = class extends Disposable {
  constructor(_notebookViewModel, _cell, _executionStateService) {
    super();
    this._notebookViewModel = _notebookViewModel;
    this._cell = _cell;
    this._executionStateService = _executionStateService;
    this._currentItemIds = [];
    this._clearExecutingStateTimer = this._register(new MutableDisposable());
    this._update();
    this._register(this._executionStateService.onDidChangeExecution((e) => {
      if (e.type === NotebookExecutionType.cell && e.affectsCell(this._cell.uri)) {
        this._update();
      }
    }));
    this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
  }
  async _update() {
    const items = this._getItemsForCell();
    if (Array.isArray(items)) {
      this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
    }
  }
  /**
   *	Returns undefined if there should be no change, and an empty array if all items should be removed.
   */
  _getItemsForCell() {
    const runState = this._executionStateService.getCellExecution(this._cell.uri);
    if (runState?.state === NotebookCellExecutionState.Executing && typeof this._showedExecutingStateTime !== "number") {
      this._showedExecutingStateTime = Date.now();
    } else if (runState?.state !== NotebookCellExecutionState.Executing && typeof this._showedExecutingStateTime === "number") {
      const timeUntilMin = ExecutionStateCellStatusBarItem.MIN_SPINNER_TIME - (Date.now() - this._showedExecutingStateTime);
      if (timeUntilMin > 0) {
        if (!this._clearExecutingStateTimer.value) {
          this._clearExecutingStateTimer.value = disposableTimeout(() => {
            this._showedExecutingStateTime = void 0;
            this._clearExecutingStateTimer.clear();
            this._update();
          }, timeUntilMin);
        }
        return void 0;
      } else {
        this._showedExecutingStateTime = void 0;
      }
    }
    const items = this._getItemForState(runState, this._cell.internalMetadata);
    return items;
  }
  _getItemForState(runState, internalMetadata) {
    const state = runState?.state;
    const { lastRunSuccess } = internalMetadata;
    if (!state && lastRunSuccess) {
      return [{
        text: `$(${successStateIcon.id})`,
        color: themeColorFromId(cellStatusIconSuccess),
        tooltip: localize("notebook.cell.status.success", "Success"),
        alignment: CellStatusbarAlignment.Left,
        priority: Number.MAX_SAFE_INTEGER
      }];
    } else if (!state && lastRunSuccess === false) {
      return [{
        text: `$(${errorStateIcon.id})`,
        color: themeColorFromId(cellStatusIconError),
        tooltip: localize("notebook.cell.status.failed", "Failed"),
        alignment: CellStatusbarAlignment.Left,
        priority: Number.MAX_SAFE_INTEGER
      }];
    } else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
      return [{
        text: `$(${pendingStateIcon.id})`,
        tooltip: localize("notebook.cell.status.pending", "Pending"),
        alignment: CellStatusbarAlignment.Left,
        priority: Number.MAX_SAFE_INTEGER
      }];
    } else if (state === NotebookCellExecutionState.Executing) {
      const icon = runState?.didPause ? executingStateIcon : ThemeIcon.modify(executingStateIcon, "spin");
      return [{
        text: `$(${icon.id})`,
        tooltip: localize("notebook.cell.status.executing", "Executing"),
        alignment: CellStatusbarAlignment.Left,
        priority: Number.MAX_SAFE_INTEGER
      }];
    }
    return [];
  }
  dispose() {
    super.dispose();
    this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
  }
};
ExecutionStateCellStatusBarItem.MIN_SPINNER_TIME = 500;
ExecutionStateCellStatusBarItem = __decorateClass([
  __decorateParam(2, INotebookExecutionStateService)
], ExecutionStateCellStatusBarItem);
let TimerCellStatusBarContrib = class extends Disposable {
  constructor(notebookEditor, instantiationService) {
    super();
    this._register(new NotebookStatusBarController(notebookEditor, (vm, cell) => instantiationService.createInstance(TimerCellStatusBarItem, vm, cell)));
  }
};
TimerCellStatusBarContrib.id = "workbench.notebook.statusBar.execTimer";
TimerCellStatusBarContrib = __decorateClass([
  __decorateParam(1, IInstantiationService)
], TimerCellStatusBarContrib);
registerNotebookContribution(TimerCellStatusBarContrib.id, TimerCellStatusBarContrib);
const UPDATE_TIMER_GRACE_PERIOD = 200;
let TimerCellStatusBarItem = class extends Disposable {
  constructor(_notebookViewModel, _cell, _executionStateService, _notebookService, _configurationService) {
    super();
    this._notebookViewModel = _notebookViewModel;
    this._cell = _cell;
    this._executionStateService = _executionStateService;
    this._notebookService = _notebookService;
    this._configurationService = _configurationService;
    this._currentItemIds = [];
    this._isVerbose = this._configurationService.getValue(NotebookSetting.cellExecutionTimeVerbosity) === "verbose";
    this._scheduler = this._register(new RunOnceScheduler(() => this._update(), TimerCellStatusBarItem.UPDATE_INTERVAL));
    this._update();
    this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.cellExecutionTimeVerbosity)) {
        this._isVerbose = this._configurationService.getValue(NotebookSetting.cellExecutionTimeVerbosity) === "verbose";
        this._update();
      }
    }));
  }
  async _update() {
    let timerItem;
    const runState = this._executionStateService.getCellExecution(this._cell.uri);
    const state = runState?.state;
    const startTime = this._cell.internalMetadata.runStartTime;
    const adjustment = this._cell.internalMetadata.runStartTimeAdjustment ?? 0;
    const endTime = this._cell.internalMetadata.runEndTime;
    if (runState?.didPause) {
      timerItem = void 0;
    } else if (state === NotebookCellExecutionState.Executing) {
      if (typeof startTime === "number") {
        timerItem = this._getTimeItem(startTime, Date.now(), adjustment);
        this._scheduler.schedule();
      }
    } else if (!state) {
      if (typeof startTime === "number" && typeof endTime === "number") {
        const timerDuration = Date.now() - startTime + adjustment;
        const executionDuration = endTime - startTime;
        const renderDuration = this._cell.internalMetadata.renderDuration ?? {};
        timerItem = this._getTimeItem(startTime, endTime, void 0, {
          timerDuration,
          executionDuration,
          renderDuration
        });
      }
    }
    const items = timerItem ? [timerItem] : [];
    if (!items.length && !!runState) {
      if (!this._deferredUpdate) {
        this._deferredUpdate = disposableTimeout(() => {
          this._deferredUpdate = void 0;
          this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
        }, UPDATE_TIMER_GRACE_PERIOD, this._store);
      }
    } else {
      this._deferredUpdate?.dispose();
      this._deferredUpdate = void 0;
      this._currentItemIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);
    }
  }
  _getTimeItem(startTime, endTime, adjustment = 0, runtimeInformation) {
    const duration = endTime - startTime + adjustment;
    let tooltip;
    const lastExecution = new Date(endTime).toLocaleTimeString(language);
    if (runtimeInformation) {
      const { renderDuration, executionDuration, timerDuration } = runtimeInformation;
      let renderTimes = "";
      for (const key in renderDuration) {
        const rendererInfo = this._notebookService.getRendererInfo(key);
        const args = encodeURIComponent(JSON.stringify({
          extensionId: rendererInfo?.extensionId.value ?? "",
          issueBody: `Auto-generated text from notebook cell performance - Please add an explanation for the performance issue, including cell content if possible.
The duration for the renderer, ${rendererInfo?.displayName ?? key}, is slower than expected.
Execution Time: ${formatCellDuration(executionDuration)}
Renderer Duration: ${formatCellDuration(renderDuration[key])}
`
        }));
        const renderIssueLink = renderDuration[key] > 200 && executionDuration < 2e3 || renderDuration[key] > 1e3;
        const linkText = rendererInfo?.displayName ?? key;
        const rendererTitle = renderIssueLink ? `[${linkText}](command:workbench.action.openIssueReporter?${args})` : `**${linkText}**`;
        renderTimes += `- ${rendererTitle} ${formatCellDuration(renderDuration[key])}
`;
      }
      renderTimes += `
*${localize("notebook.cell.statusBar.timerTooltip.reportIssueFootnote", "Use the links above to file an issue using the issue reporter.")}*
`;
      tooltip = {
        value: localize("notebook.cell.statusBar.timerTooltip", "**Last Execution** {0}\n\n**Execution Time** {1}\n\n**Overhead Time** {2}\n\n**Render Times**\n\n{3}", lastExecution, formatCellDuration(executionDuration), formatCellDuration(timerDuration - executionDuration), renderTimes),
        isTrusted: true
      };
    }
    const executionText = this._isVerbose ? localize("notebook.cell.statusBar.timerVerbose", "Last Execution: {0}, Duration: {1}", lastExecution, formatCellDuration(duration, false)) : formatCellDuration(duration, false);
    return {
      text: executionText,
      alignment: CellStatusbarAlignment.Left,
      priority: Number.MAX_SAFE_INTEGER - 5,
      tooltip
    };
  }
  dispose() {
    super.dispose();
    this._deferredUpdate?.dispose();
    this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
  }
};
TimerCellStatusBarItem.UPDATE_INTERVAL = 100;
TimerCellStatusBarItem = __decorateClass([
  __decorateParam(2, INotebookExecutionStateService),
  __decorateParam(3, INotebookService),
  __decorateParam(4, IConfigurationService)
], TimerCellStatusBarItem);
export {
  ExecutionStateCellStatusBarContrib,
  NotebookStatusBarController,
  TimerCellStatusBarContrib,
  formatCellDuration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxjZWxsU3RhdHVzQmFyXFxleGVjdXRpb25TdGF0dXNCYXJJdGVtQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0LCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxhbmd1YWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2VsbFZpc2liaWxpdHlDaGFuZ2VFdmVudCwgTm90ZWJvb2tWaXNpYmxlQ2VsbE9ic2VydmVyIH0gZnJvbSAnLi9ub3RlYm9va1Zpc2libGVDZWxsT2JzZXJ2ZXIuanMnO1xuaW1wb3J0IHsgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvciwgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLCBJTm90ZWJvb2tWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rRWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjZWxsU3RhdHVzSWNvbkVycm9yLCBjZWxsU3RhdHVzSWNvblN1Y2Nlc3MgfSBmcm9tICcuLi8uLi9ub3RlYm9va0VkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBlcnJvclN0YXRlSWNvbiwgZXhlY3V0aW5nU3RhdGVJY29uLCBwZW5kaW5nU3RhdGVJY29uLCBzdWNjZXNzU3RhdGVJY29uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tJY29ucy5qcyc7XG5pbXBvcnQgeyBDZWxsU3RhdHVzYmFyQWxpZ25tZW50LCBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSwgTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUsIE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEsIE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsRXhlY3V0aW9uLCBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsIE5vdGVib29rRXhlY3V0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRDZWxsRHVyYXRpb24oZHVyYXRpb246IG51bWJlciwgc2hvd01pbGxpc2Vjb25kczogYm9vbGVhbiA9IHRydWUpOiBzdHJpbmcge1xuXHRpZiAoc2hvd01pbGxpc2Vjb25kcyAmJiBkdXJhdGlvbiA8IDEwMDApIHtcblx0XHRyZXR1cm4gYCR7ZHVyYXRpb259bXNgO1xuXHR9XG5cblx0Y29uc3QgbWludXRlcyA9IE1hdGguZmxvb3IoZHVyYXRpb24gLyAxMDAwIC8gNjApO1xuXHRjb25zdCBzZWNvbmRzID0gTWF0aC5mbG9vcihkdXJhdGlvbiAvIDEwMDApICUgNjA7XG5cdGNvbnN0IHRlbnRocyA9IE1hdGguZmxvb3IoKGR1cmF0aW9uICUgMTAwMCkgLyAxMDApO1xuXG5cdGlmIChtaW51dGVzID4gMCkge1xuXHRcdHJldHVybiBgJHttaW51dGVzfW0gJHtzZWNvbmRzfS4ke3RlbnRoc31zYDtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gYCR7c2Vjb25kc30uJHt0ZW50aHN9c2A7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rU3RhdHVzQmFyQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlQ2VsbHMgPSBuZXcgTWFwPG51bWJlciwgSURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29ic2VydmVyOiBOb3RlYm9va1Zpc2libGVDZWxsT2JzZXJ2ZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtRmFjdG9yeTogKHZtOiBJTm90ZWJvb2tWaWV3TW9kZWwsIGNlbGw6IElDZWxsVmlld01vZGVsKSA9PiBJRGlzcG9zYWJsZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9vYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBOb3RlYm9va1Zpc2libGVDZWxsT2JzZXJ2ZXIodGhpcy5fbm90ZWJvb2tFZGl0b3IpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vYnNlcnZlci5vbkRpZENoYW5nZVZpc2libGVDZWxscyh0aGlzLl91cGRhdGVWaXNpYmxlQ2VsbHMsIHRoaXMpKTtcblxuXHRcdHRoaXMuX3VwZGF0ZUV2ZXJ5dGhpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUV2ZXJ5dGhpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZUNlbGxzLmZvckVhY2goZGlzcG9zZSk7XG5cdFx0dGhpcy5fdmlzaWJsZUNlbGxzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdXBkYXRlVmlzaWJsZUNlbGxzKHsgYWRkZWQ6IHRoaXMuX29ic2VydmVyLnZpc2libGVDZWxscywgcmVtb3ZlZDogW10gfSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVWaXNpYmxlQ2VsbHMoZTogSUNlbGxWaXNpYmlsaXR5Q2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCB2bSA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldFZpZXdNb2RlbCgpO1xuXHRcdGlmICghdm0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IG9sZENlbGwgb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlQ2VsbHMuZ2V0KG9sZENlbGwuaGFuZGxlKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fdmlzaWJsZUNlbGxzLmRlbGV0ZShvbGRDZWxsLmhhbmRsZSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBuZXdDZWxsIG9mIGUuYWRkZWQpIHtcblx0XHRcdHRoaXMuX3Zpc2libGVDZWxscy5zZXQobmV3Q2VsbC5oYW5kbGUsIHRoaXMuX2l0ZW1GYWN0b3J5KHZtLCBuZXdDZWxsKSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl92aXNpYmxlQ2VsbHMuZm9yRWFjaChkaXNwb3NlKTtcblx0XHR0aGlzLl92aXNpYmxlQ2VsbHMuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXhlY3V0aW9uU3RhdGVDZWxsU3RhdHVzQmFyQ29udHJpYiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24ge1xuXHRzdGF0aWMgaWQ6IHN0cmluZyA9ICd3b3JrYmVuY2gubm90ZWJvb2suc3RhdHVzQmFyLmV4ZWNTdGF0ZSc7XG5cblx0Y29uc3RydWN0b3Iobm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tTdGF0dXNCYXJDb250cm9sbGVyKG5vdGVib29rRWRpdG9yLCAodm0sIGNlbGwpID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4ZWN1dGlvblN0YXRlQ2VsbFN0YXR1c0Jhckl0ZW0sIHZtLCBjZWxsKSkpO1xuXHR9XG59XG5yZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uKEV4ZWN1dGlvblN0YXRlQ2VsbFN0YXR1c0JhckNvbnRyaWIuaWQsIEV4ZWN1dGlvblN0YXRlQ2VsbFN0YXR1c0JhckNvbnRyaWIpO1xuXG4vKipcbiAqIFNob3dzIHRoZSBjZWxsJ3MgZXhlY3V0aW9uIHN0YXRlIGluIHRoZSBjZWxsIHN0YXR1cyBiYXIuIFdoZW4gdGhlIFwiZXhlY3V0aW5nXCIgc3RhdGUgaXMgc2hvd24sIGl0IHdpbGwgYmUgc2hvd24gZm9yIGEgbWluaW11bSBicmllZiB0aW1lLlxuICovXG5jbGFzcyBFeGVjdXRpb25TdGF0ZUNlbGxTdGF0dXNCYXJJdGVtIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1JTl9TUElOTkVSX1RJTUUgPSA1MDA7XG5cblx0cHJpdmF0ZSBfY3VycmVudEl0ZW1JZHM6IHN0cmluZ1tdID0gW107XG5cblx0cHJpdmF0ZSBfc2hvd2VkRXhlY3V0aW5nU3RhdGVUaW1lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsZWFyRXhlY3V0aW5nU3RhdGVUaW1lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1ZpZXdNb2RlbDogSU5vdGVib29rVmlld01vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NlbGw6IElDZWxsVmlld01vZGVsLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2V4ZWN1dGlvblN0YXRlU2VydmljZS5vbkRpZENoYW5nZUV4ZWN1dGlvbihlID0+IHtcblx0XHRcdGlmIChlLnR5cGUgPT09IE5vdGVib29rRXhlY3V0aW9uVHlwZS5jZWxsICYmIGUuYWZmZWN0c0NlbGwodGhpcy5fY2VsbC51cmkpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jZWxsLm1vZGVsLm9uRGlkQ2hhbmdlSW50ZXJuYWxNZXRhZGF0YSgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlKCkge1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fZ2V0SXRlbXNGb3JDZWxsKCk7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50SXRlbUlkcyA9IHRoaXMuX25vdGVib29rVmlld01vZGVsLmRlbHRhQ2VsbFN0YXR1c0Jhckl0ZW1zKHRoaXMuX2N1cnJlbnRJdGVtSWRzLCBbeyBoYW5kbGU6IHRoaXMuX2NlbGwuaGFuZGxlLCBpdGVtcyB9XSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqXHRSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGVyZSBzaG91bGQgYmUgbm8gY2hhbmdlLCBhbmQgYW4gZW1wdHkgYXJyYXkgaWYgYWxsIGl0ZW1zIHNob3VsZCBiZSByZW1vdmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0SXRlbXNGb3JDZWxsKCk6IElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJ1blN0YXRlID0gdGhpcy5fZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldENlbGxFeGVjdXRpb24odGhpcy5fY2VsbC51cmkpO1xuXG5cdFx0Ly8gU2hvdyB0aGUgZXhlY3V0aW9uIHNwaW5uZXIgZm9yIGEgbWluaW11bSB0aW1lXG5cdFx0aWYgKHJ1blN0YXRlPy5zdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUuRXhlY3V0aW5nICYmIHR5cGVvZiB0aGlzLl9zaG93ZWRFeGVjdXRpbmdTdGF0ZVRpbWUgIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLl9zaG93ZWRFeGVjdXRpbmdTdGF0ZVRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdH0gZWxzZSBpZiAocnVuU3RhdGU/LnN0YXRlICE9PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5FeGVjdXRpbmcgJiYgdHlwZW9mIHRoaXMuX3Nob3dlZEV4ZWN1dGluZ1N0YXRlVGltZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IHRpbWVVbnRpbE1pbiA9IEV4ZWN1dGlvblN0YXRlQ2VsbFN0YXR1c0Jhckl0ZW0uTUlOX1NQSU5ORVJfVElNRSAtIChEYXRlLm5vdygpIC0gdGhpcy5fc2hvd2VkRXhlY3V0aW5nU3RhdGVUaW1lKTtcblx0XHRcdGlmICh0aW1lVW50aWxNaW4gPiAwKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fY2xlYXJFeGVjdXRpbmdTdGF0ZVRpbWVyLnZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xlYXJFeGVjdXRpbmdTdGF0ZVRpbWVyLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd2VkRXhlY3V0aW5nU3RhdGVUaW1lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0dGhpcy5fY2xlYXJFeGVjdXRpbmdTdGF0ZVRpbWVyLmNsZWFyKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdFx0XHR9LCB0aW1lVW50aWxNaW4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dlZEV4ZWN1dGluZ1N0YXRlVGltZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX2dldEl0ZW1Gb3JTdGF0ZShydW5TdGF0ZSwgdGhpcy5fY2VsbC5pbnRlcm5hbE1ldGFkYXRhKTtcblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJdGVtRm9yU3RhdGUocnVuU3RhdGU6IElOb3RlYm9va0NlbGxFeGVjdXRpb24gfCB1bmRlZmluZWQsIGludGVybmFsTWV0YWRhdGE6IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEpOiBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbVtdIHtcblx0XHRjb25zdCBzdGF0ZSA9IHJ1blN0YXRlPy5zdGF0ZTtcblx0XHRjb25zdCB7IGxhc3RSdW5TdWNjZXNzIH0gPSBpbnRlcm5hbE1ldGFkYXRhO1xuXHRcdGlmICghc3RhdGUgJiYgbGFzdFJ1blN1Y2Nlc3MpIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHR0ZXh0OiBgJCgke3N1Y2Nlc3NTdGF0ZUljb24uaWR9KWAsXG5cdFx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKGNlbGxTdGF0dXNJY29uU3VjY2VzcyksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1cy5zdWNjZXNzJywgXCJTdWNjZXNzXCIpLFxuXHRcdFx0XHRhbGlnbm1lbnQ6IENlbGxTdGF0dXNiYXJBbGlnbm1lbnQuTGVmdCxcblx0XHRcdFx0cHJpb3JpdHk6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSXG5cdFx0XHR9IHNhdGlzZmllcyBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbV07XG5cdFx0fSBlbHNlIGlmICghc3RhdGUgJiYgbGFzdFJ1blN1Y2Nlc3MgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0dGV4dDogYCQoJHtlcnJvclN0YXRlSWNvbi5pZH0pYCxcblx0XHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoY2VsbFN0YXR1c0ljb25FcnJvciksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1cy5mYWlsZWQnLCBcIkZhaWxlZFwiKSxcblx0XHRcdFx0YWxpZ25tZW50OiBDZWxsU3RhdHVzYmFyQWxpZ25tZW50LkxlZnQsXG5cdFx0XHRcdHByaW9yaXR5OiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUlxuXHRcdFx0fV07XG5cdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUuUGVuZGluZyB8fCBzdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUuVW5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHR0ZXh0OiBgJCgke3BlbmRpbmdTdGF0ZUljb24uaWR9KWAsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1cy5wZW5kaW5nJywgXCJQZW5kaW5nXCIpLFxuXHRcdFx0XHRhbGlnbm1lbnQ6IENlbGxTdGF0dXNiYXJBbGlnbm1lbnQuTGVmdCxcblx0XHRcdFx0cHJpb3JpdHk6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSXG5cdFx0XHR9IHNhdGlzZmllcyBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbV07XG5cdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUuRXhlY3V0aW5nKSB7XG5cdFx0XHRjb25zdCBpY29uID0gcnVuU3RhdGU/LmRpZFBhdXNlID9cblx0XHRcdFx0ZXhlY3V0aW5nU3RhdGVJY29uIDpcblx0XHRcdFx0VGhlbWVJY29uLm1vZGlmeShleGVjdXRpbmdTdGF0ZUljb24sICdzcGluJyk7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0dGV4dDogYCQoJHtpY29uLmlkfSlgLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbm90ZWJvb2suY2VsbC5zdGF0dXMuZXhlY3V0aW5nJywgXCJFeGVjdXRpbmdcIiksXG5cdFx0XHRcdGFsaWdubWVudDogQ2VsbFN0YXR1c2JhckFsaWdubWVudC5MZWZ0LFxuXHRcdFx0XHRwcmlvcml0eTogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVJcblx0XHRcdH0gc2F0aXNmaWVzIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX25vdGVib29rVmlld01vZGVsLmRlbHRhQ2VsbFN0YXR1c0Jhckl0ZW1zKHRoaXMuX2N1cnJlbnRJdGVtSWRzLCBbeyBoYW5kbGU6IHRoaXMuX2NlbGwuaGFuZGxlLCBpdGVtczogW10gfV0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUaW1lckNlbGxTdGF0dXNCYXJDb250cmliIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyBpZDogc3RyaW5nID0gJ3dvcmtiZW5jaC5ub3RlYm9vay5zdGF0dXNCYXIuZXhlY1RpbWVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IE5vdGVib29rU3RhdHVzQmFyQ29udHJvbGxlcihub3RlYm9va0VkaXRvciwgKHZtLCBjZWxsKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUaW1lckNlbGxTdGF0dXNCYXJJdGVtLCB2bSwgY2VsbCkpKTtcblx0fVxufVxucmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbihUaW1lckNlbGxTdGF0dXNCYXJDb250cmliLmlkLCBUaW1lckNlbGxTdGF0dXNCYXJDb250cmliKTtcblxuY29uc3QgVVBEQVRFX1RJTUVSX0dSQUNFX1BFUklPRCA9IDIwMDtcblxuY2xhc3MgVGltZXJDZWxsU3RhdHVzQmFySXRlbSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyBVUERBVEVfSU5URVJWQUwgPSAxMDA7XG5cdHByaXZhdGUgX2N1cnJlbnRJdGVtSWRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHByaXZhdGUgX3NjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRwcml2YXRlIF9kZWZlcnJlZFVwZGF0ZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfaXNWZXJib3NlOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rVmlld01vZGVsOiBJTm90ZWJvb2tWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2VsbDogSUNlbGxWaWV3TW9kZWwsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2lzVmVyYm9zZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE5vdGVib29rU2V0dGluZy5jZWxsRXhlY3V0aW9uVGltZVZlcmJvc2l0eSkgPT09ICd2ZXJib3NlJztcblxuXHRcdHRoaXMuX3NjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3VwZGF0ZSgpLCBUaW1lckNlbGxTdGF0dXNCYXJJdGVtLlVQREFURV9JTlRFUlZBTCkpO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NlbGwubW9kZWwub25EaWRDaGFuZ2VJbnRlcm5hbE1ldGFkYXRhKCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuY2VsbEV4ZWN1dGlvblRpbWVWZXJib3NpdHkpKSB7XG5cdFx0XHRcdHRoaXMuX2lzVmVyYm9zZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE5vdGVib29rU2V0dGluZy5jZWxsRXhlY3V0aW9uVGltZVZlcmJvc2l0eSkgPT09ICd2ZXJib3NlJztcblx0XHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlKCkge1xuXHRcdGxldCB0aW1lckl0ZW06IElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJ1blN0YXRlID0gdGhpcy5fZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldENlbGxFeGVjdXRpb24odGhpcy5fY2VsbC51cmkpO1xuXHRcdGNvbnN0IHN0YXRlID0gcnVuU3RhdGU/LnN0YXRlO1xuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IHRoaXMuX2NlbGwuaW50ZXJuYWxNZXRhZGF0YS5ydW5TdGFydFRpbWU7XG5cdFx0Y29uc3QgYWRqdXN0bWVudCA9IHRoaXMuX2NlbGwuaW50ZXJuYWxNZXRhZGF0YS5ydW5TdGFydFRpbWVBZGp1c3RtZW50ID8/IDA7XG5cdFx0Y29uc3QgZW5kVGltZSA9IHRoaXMuX2NlbGwuaW50ZXJuYWxNZXRhZGF0YS5ydW5FbmRUaW1lO1xuXG5cdFx0aWYgKHJ1blN0YXRlPy5kaWRQYXVzZSkge1xuXHRcdFx0dGltZXJJdGVtID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLkV4ZWN1dGluZykge1xuXHRcdFx0aWYgKHR5cGVvZiBzdGFydFRpbWUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHRpbWVySXRlbSA9IHRoaXMuX2dldFRpbWVJdGVtKHN0YXJ0VGltZSwgRGF0ZS5ub3coKSwgYWRqdXN0bWVudCk7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIXN0YXRlKSB7XG5cdFx0XHRpZiAodHlwZW9mIHN0YXJ0VGltZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGVuZFRpbWUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGNvbnN0IHRpbWVyRHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lICsgYWRqdXN0bWVudDtcblx0XHRcdFx0Y29uc3QgZXhlY3V0aW9uRHVyYXRpb24gPSBlbmRUaW1lIC0gc3RhcnRUaW1lO1xuXHRcdFx0XHRjb25zdCByZW5kZXJEdXJhdGlvbiA9IHRoaXMuX2NlbGwuaW50ZXJuYWxNZXRhZGF0YS5yZW5kZXJEdXJhdGlvbiA/PyB7fTtcblxuXHRcdFx0XHR0aW1lckl0ZW0gPSB0aGlzLl9nZXRUaW1lSXRlbShzdGFydFRpbWUsIGVuZFRpbWUsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdHRpbWVyRHVyYXRpb24sXG5cdFx0XHRcdFx0ZXhlY3V0aW9uRHVyYXRpb24sXG5cdFx0XHRcdFx0cmVuZGVyRHVyYXRpb25cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXMgPSB0aW1lckl0ZW0gPyBbdGltZXJJdGVtXSA6IFtdO1xuXG5cdFx0aWYgKCFpdGVtcy5sZW5ndGggJiYgISFydW5TdGF0ZSkge1xuXHRcdFx0aWYgKCF0aGlzLl9kZWZlcnJlZFVwZGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9kZWZlcnJlZFVwZGF0ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9kZWZlcnJlZFVwZGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50SXRlbUlkcyA9IHRoaXMuX25vdGVib29rVmlld01vZGVsLmRlbHRhQ2VsbFN0YXR1c0Jhckl0ZW1zKHRoaXMuX2N1cnJlbnRJdGVtSWRzLCBbeyBoYW5kbGU6IHRoaXMuX2NlbGwuaGFuZGxlLCBpdGVtcyB9XSk7XG5cdFx0XHRcdH0sIFVQREFURV9USU1FUl9HUkFDRV9QRVJJT0QsIHRoaXMuX3N0b3JlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGVmZXJyZWRVcGRhdGU/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2RlZmVycmVkVXBkYXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY3VycmVudEl0ZW1JZHMgPSB0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbC5kZWx0YUNlbGxTdGF0dXNCYXJJdGVtcyh0aGlzLl9jdXJyZW50SXRlbUlkcywgW3sgaGFuZGxlOiB0aGlzLl9jZWxsLmhhbmRsZSwgaXRlbXMgfV0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFRpbWVJdGVtKHN0YXJ0VGltZTogbnVtYmVyLCBlbmRUaW1lOiBudW1iZXIsIGFkanVzdG1lbnQ6IG51bWJlciA9IDAsIHJ1bnRpbWVJbmZvcm1hdGlvbj86IHsgcmVuZGVyRHVyYXRpb246IHsgW2tleTogc3RyaW5nXTogbnVtYmVyIH07IGV4ZWN1dGlvbkR1cmF0aW9uOiBudW1iZXI7IHRpbWVyRHVyYXRpb246IG51bWJlciB9KTogSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW0ge1xuXHRcdGNvbnN0IGR1cmF0aW9uID0gZW5kVGltZSAtIHN0YXJ0VGltZSArIGFkanVzdG1lbnQ7XG5cblx0XHRsZXQgdG9vbHRpcDogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbGFzdEV4ZWN1dGlvbiA9IG5ldyBEYXRlKGVuZFRpbWUpLnRvTG9jYWxlVGltZVN0cmluZyhsYW5ndWFnZSk7XG5cblx0XHRpZiAocnVudGltZUluZm9ybWF0aW9uKSB7XG5cdFx0XHRjb25zdCB7IHJlbmRlckR1cmF0aW9uLCBleGVjdXRpb25EdXJhdGlvbiwgdGltZXJEdXJhdGlvbiB9ID0gcnVudGltZUluZm9ybWF0aW9uO1xuXG5cdFx0XHRsZXQgcmVuZGVyVGltZXMgPSAnJztcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIHJlbmRlckR1cmF0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVySW5mbyA9IHRoaXMuX25vdGVib29rU2VydmljZS5nZXRSZW5kZXJlckluZm8oa2V5KTtcblxuXHRcdFx0XHRjb25zdCBhcmdzID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRleHRlbnNpb25JZDogcmVuZGVyZXJJbmZvPy5leHRlbnNpb25JZC52YWx1ZSA/PyAnJyxcblx0XHRcdFx0XHRpc3N1ZUJvZHk6XG5cdFx0XHRcdFx0XHRgQXV0by1nZW5lcmF0ZWQgdGV4dCBmcm9tIG5vdGVib29rIGNlbGwgcGVyZm9ybWFuY2UgLSBQbGVhc2UgYWRkIGFuIGV4cGxhbmF0aW9uIGZvciB0aGUgcGVyZm9ybWFuY2UgaXNzdWUsIGluY2x1ZGluZyBjZWxsIGNvbnRlbnQgaWYgcG9zc2libGUuXFxuYCArXG5cdFx0XHRcdFx0XHRgVGhlIGR1cmF0aW9uIGZvciB0aGUgcmVuZGVyZXIsICR7cmVuZGVyZXJJbmZvPy5kaXNwbGF5TmFtZSA/PyBrZXl9LCBpcyBzbG93ZXIgdGhhbiBleHBlY3RlZC5cXG5gICtcblx0XHRcdFx0XHRcdGBFeGVjdXRpb24gVGltZTogJHtmb3JtYXRDZWxsRHVyYXRpb24oZXhlY3V0aW9uRHVyYXRpb24pfVxcbmAgK1xuXHRcdFx0XHRcdFx0YFJlbmRlcmVyIER1cmF0aW9uOiAke2Zvcm1hdENlbGxEdXJhdGlvbihyZW5kZXJEdXJhdGlvbltrZXldKX1cXG5gXG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBTaG93IGEgbGluayB0byBjcmVhdGUgYW4gaXNzdWUgaWYgdGhlIHJlbmRlcmVyIHdhcyBzbG93IGNvbXBhcmVkIHRvIHRoZSBleGVjdXRpb24gZHVyYXRpb24sIG9yIGp1c3QgZXhjZXB0aW9uYWxseSBzbG93IG9uIGl0cyBvd25cblx0XHRcdFx0Y29uc3QgcmVuZGVySXNzdWVMaW5rID0gKHJlbmRlckR1cmF0aW9uW2tleV0gPiAyMDAgJiYgZXhlY3V0aW9uRHVyYXRpb24gPCAyMDAwKSB8fCByZW5kZXJEdXJhdGlvbltrZXldID4gMTAwMDtcblx0XHRcdFx0Y29uc3QgbGlua1RleHQgPSByZW5kZXJlckluZm8/LmRpc3BsYXlOYW1lID8/IGtleTtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZXJUaXRsZSA9IHJlbmRlcklzc3VlTGluayA/IGBbJHtsaW5rVGV4dH1dKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuSXNzdWVSZXBvcnRlcj8ke2FyZ3N9KWAgOiBgKioke2xpbmtUZXh0fSoqYDtcblx0XHRcdFx0cmVuZGVyVGltZXMgKz0gYC0gJHtyZW5kZXJlclRpdGxlfSAke2Zvcm1hdENlbGxEdXJhdGlvbihyZW5kZXJEdXJhdGlvbltrZXldKX1cXG5gO1xuXHRcdFx0fVxuXG5cdFx0XHRyZW5kZXJUaW1lcyArPSBgXFxuKiR7bG9jYWxpemUoJ25vdGVib29rLmNlbGwuc3RhdHVzQmFyLnRpbWVyVG9vbHRpcC5yZXBvcnRJc3N1ZUZvb3Rub3RlJywgXCJVc2UgdGhlIGxpbmtzIGFib3ZlIHRvIGZpbGUgYW4gaXNzdWUgdXNpbmcgdGhlIGlzc3VlIHJlcG9ydGVyLlwiKX0qXFxuYDtcblxuXHRcdFx0dG9vbHRpcCA9IHtcblx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1c0Jhci50aW1lclRvb2x0aXAnLCBcIioqTGFzdCBFeGVjdXRpb24qKiB7MH1cXG5cXG4qKkV4ZWN1dGlvbiBUaW1lKiogezF9XFxuXFxuKipPdmVyaGVhZCBUaW1lKiogezJ9XFxuXFxuKipSZW5kZXIgVGltZXMqKlxcblxcbnszfVwiLCBsYXN0RXhlY3V0aW9uLCBmb3JtYXRDZWxsRHVyYXRpb24oZXhlY3V0aW9uRHVyYXRpb24pLCBmb3JtYXRDZWxsRHVyYXRpb24odGltZXJEdXJhdGlvbiAtIGV4ZWN1dGlvbkR1cmF0aW9uKSwgcmVuZGVyVGltZXMpLFxuXHRcdFx0XHRpc1RydXN0ZWQ6IHRydWVcblx0XHRcdH07XG5cblx0XHR9XG5cblx0XHRjb25zdCBleGVjdXRpb25UZXh0ID0gdGhpcy5faXNWZXJib3NlID9cblx0XHRcdGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1c0Jhci50aW1lclZlcmJvc2UnLCBcIkxhc3QgRXhlY3V0aW9uOiB7MH0sIER1cmF0aW9uOiB7MX1cIiwgbGFzdEV4ZWN1dGlvbiwgZm9ybWF0Q2VsbER1cmF0aW9uKGR1cmF0aW9uLCBmYWxzZSkpIDpcblx0XHRcdGZvcm1hdENlbGxEdXJhdGlvbihkdXJhdGlvbiwgZmFsc2UpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRleHQ6IGV4ZWN1dGlvblRleHQsXG5cdFx0XHRhbGlnbm1lbnQ6IENlbGxTdGF0dXNiYXJBbGlnbm1lbnQuTGVmdCxcblx0XHRcdHByaW9yaXR5OiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiAtIDUsXG5cdFx0XHR0b29sdGlwXG5cdFx0fSBzYXRpc2ZpZXMgSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX2RlZmVycmVkVXBkYXRlPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbm90ZWJvb2tWaWV3TW9kZWwuZGVsdGFDZWxsU3RhdHVzQmFySXRlbXModGhpcy5fY3VycmVudEl0ZW1JZHMsIFt7IGhhbmRsZTogdGhpcy5fY2VsbC5oYW5kbGUsIGl0ZW1zOiBbXSB9XSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUIsd0JBQXdCO0FBQ3BELFNBQVMsWUFBWSxTQUFzQix5QkFBeUI7QUFDcEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBcUMsbUNBQW1DO0FBRXhFLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLGdCQUFnQixvQkFBb0Isa0JBQWtCLHdCQUF3QjtBQUN2RixTQUFTLHdCQUFvRCw0QkFBMEQsdUJBQXVCO0FBQzlJLFNBQWlDLGdDQUFnQyw2QkFBNkI7QUFDOUYsU0FBUyx3QkFBd0I7QUFHMUIsU0FBUyxtQkFBbUIsVUFBa0IsbUJBQTRCLE1BQWM7QUFDOUYsTUFBSSxvQkFBb0IsV0FBVyxLQUFNO0FBQ3hDLFdBQU8sR0FBRyxRQUFRO0FBQUEsRUFDbkI7QUFFQSxRQUFNLFVBQVUsS0FBSyxNQUFNLFdBQVcsTUFBTyxFQUFFO0FBQy9DLFFBQU0sVUFBVSxLQUFLLE1BQU0sV0FBVyxHQUFJLElBQUk7QUFDOUMsUUFBTSxTQUFTLEtBQUssTUFBTyxXQUFXLE1BQVEsR0FBRztBQUVqRCxNQUFJLFVBQVUsR0FBRztBQUNoQixXQUFPLEdBQUcsT0FBTyxLQUFLLE9BQU8sSUFBSSxNQUFNO0FBQUEsRUFDeEMsT0FBTztBQUNOLFdBQU8sR0FBRyxPQUFPLElBQUksTUFBTTtBQUFBLEVBQzVCO0FBQ0Q7QUFFTyxNQUFNLG9DQUFvQyxXQUFXO0FBQUEsRUFJM0QsWUFDa0IsaUJBQ0EsY0FDaEI7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQUxsQixTQUFpQixn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Y0FBTSxlQUFlLEtBQUssaUJBQWlCLGdCQUFnQixHQUFHO0FBRTlELGNBQU0sT0FBTyxtQkFBbUIsS0FBSyxVQUFVO0FBQUEsVUFDOUMsYUFBYSxjQUFjLFlBQVksU0FBUztBQUFBLFVBQ2hELFdBQ0M7QUFBQSxpQ0FDa0MsY0FBYyxlQUFlLEdBQUc7QUFBQSxrQkFDL0MsbUJBQW1CLGlCQUFpQixDQUFDO0FBQUEscUJBQ2xDLG1CQUFtQixlQUFlLEdBQUcsQ0FBQyxDQUFDO0FBQUE7QUFBQSxRQUMvRCxDQUFDLENBQUM7QUFHRixjQUFNLGtCQUFtQixlQUFlLEdBQUcsSUFBSSxPQUFPLG9CQUFvQixPQUFTLGVBQWUsR0FBRyxJQUFJO0FBQ3pHLGNBQU0sV0FBVyxjQUFjLGVBQWU7QUFDOUMsY0FBTSxnQkFBZ0Isa0JBQWtCLElBQUksUUFBUSxnREFBZ0QsSUFBSSxNQUFNLEtBQUssUUFBUTtBQUMzSCx1QkFBZSxLQUFLLGFBQWEsSUFBSSxtQkFBbUIsZUFBZSxHQUFHLENBQUMsQ0FBQztBQUFBO0FBQUEsTUFDN0U7QUFFQSxxQkFBZTtBQUFBLEdBQU0sU0FBUyw0REFBNEQsZ0VBQWdFLENBQUM7QUFBQTtBQUUzSixnQkFBVTtBQUFBLFFBQ1QsT0FBTyxTQUFTLHdDQUF3Qyx3R0FBd0csZUFBZSxtQkFBbUIsaUJBQWlCLEdBQUcsbUJBQW1CLGdCQUFnQixpQkFBaUIsR0FBRyxXQUFXO0FBQUEsUUFDeFIsV0FBVztBQUFBLE1BQ1o7QUFBQSxJQUVEO0FBRUEsVUFBTSxnQkFBZ0IsS0FBSyxhQUMxQixTQUFTLHdDQUF3QyxzQ0FBc0MsZUFBZSxtQkFBbUIsVUFBVSxLQUFLLENBQUMsSUFDekksbUJBQW1CLFVBQVUsS0FBSztBQUVuQyxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixXQUFXLHVCQUF1QjtBQUFBLE1BQ2xDLFVBQVUsT0FBTyxtQkFBbUI7QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUyxVQUFVO0FBQ2xCLFVBQU0sUUFBUTtBQUVkLFNBQUssaUJBQWlCLFFBQVE7QUFDOUIsU0FBSyxtQkFBbUIsd0JBQXdCLEtBQUssaUJBQWlCLENBQUMsRUFBRSxRQUFRLEtBQUssTUFBTSxRQUFRLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUFBLEVBQ2pIO0FBQ0Q7QUF0SU0sdUJBQ1Usa0JBQWtCO0FBRDVCLHlCQUFOO0FBQUEsRUFhRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FmRzsiLAogICJuYW1lcyI6IFtdCn0K
