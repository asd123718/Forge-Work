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
import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { IMarkerService } from "../../../../../../platform/markers/common/markers.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { CellKind, NotebookSetting } from "../../../common/notebookCommon.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { CodeCellViewModel } from "../../viewModel/codeCellViewModel.js";
import { Event } from "../../../../../../base/common/event.js";
import { IChatAgentService } from "../../../../chat/common/participants/chatAgents.js";
import { ChatAgentLocation } from "../../../../chat/common/constants.js";
import { autorun } from "../../../../../../base/common/observable.js";
let CellDiagnostics = class extends Disposable {
  constructor(notebookEditor, notebookExecutionStateService, markerService, chatAgentService, configurationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.notebookExecutionStateService = notebookExecutionStateService;
    this.markerService = markerService;
    this.chatAgentService = chatAgentService;
    this.configurationService = configurationService;
    this.enabled = false;
    this.listening = false;
    this.diagnosticsByHandle = /* @__PURE__ */ new Map();
    this.updateEnabled();
    this._register(chatAgentService.onDidChangeAgents(() => this.updateEnabled()));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.cellFailureDiagnostics)) {
        this.updateEnabled();
      }
    }));
  }
  hasNotebookAgent() {
    const agents = this.chatAgentService.getAgents();
    return !!agents.find((agent) => agent.locations.includes(ChatAgentLocation.Notebook));
  }
  updateEnabled() {
    const settingEnabled = this.configurationService.getValue(NotebookSetting.cellFailureDiagnostics);
    if (this.enabled && (!settingEnabled || !this.hasNotebookAgent())) {
      this.enabled = false;
      this.clearAll();
    } else if (!this.enabled && settingEnabled && this.hasNotebookAgent()) {
      this.enabled = true;
      if (!this.listening) {
        this.listening = true;
        this._register(Event.accumulate(
          this.notebookExecutionStateService.onDidChangeExecution,
          200
        )((e) => this.handleChangeExecutionState(e)));
      }
    }
  }
  handleChangeExecutionState(changes) {
    if (!this.enabled) {
      return;
    }
    const handled = /* @__PURE__ */ new Set();
    for (const e of changes.reverse()) {
      const notebookUri = this.notebookEditor.textModel?.uri;
      if (e.type === NotebookExecutionType.cell && notebookUri && e.affectsNotebook(notebookUri) && !handled.has(e.cellHandle)) {
        handled.add(e.cellHandle);
        if (!!e.changed) {
          this.clear(e.cellHandle);
        } else {
          this.setDiagnostics(e.cellHandle);
        }
      }
    }
  }
  clearAll() {
    for (const handle of this.diagnosticsByHandle.keys()) {
      this.clear(handle);
    }
  }
  clear(cellHandle) {
    const disposables = this.diagnosticsByHandle.get(cellHandle);
    if (disposables) {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      this.diagnosticsByHandle.delete(cellHandle);
    }
  }
  setDiagnostics(cellHandle) {
    if (this.diagnosticsByHandle.has(cellHandle)) {
      return;
    }
    const cell = this.notebookEditor.getCellByHandle(cellHandle);
    if (!cell || cell.cellKind !== CellKind.Code) {
      return;
    }
    const metadata = cell.model.internalMetadata;
    if (cell instanceof CodeCellViewModel && !metadata.lastRunSuccess && metadata?.error?.location) {
      const disposables = [];
      const errorLabel = metadata.error.name ? `${metadata.error.name}: ${metadata.error.message}` : metadata.error.message;
      const marker = this.createMarkerData(errorLabel, metadata.error.location);
      this.markerService.changeOne(CellDiagnostics.ID, cell.uri, [marker]);
      disposables.push(toDisposable(() => this.markerService.changeOne(CellDiagnostics.ID, cell.uri, [])));
      cell.executionErrorDiagnostic.set(metadata.error, void 0);
      disposables.push(toDisposable(() => cell.executionErrorDiagnostic.set(void 0, void 0)));
      disposables.push(autorun((r) => {
        if (!cell.executionErrorDiagnostic.read(r)) {
          this.clear(cellHandle);
        }
      }));
      disposables.push(cell.model.onDidChangeOutputs(() => {
        if (cell.model.outputs.length === 0) {
          this.clear(cellHandle);
        }
      }));
      disposables.push(cell.model.onDidChangeContent(() => {
        this.clear(cellHandle);
      }));
      this.diagnosticsByHandle.set(cellHandle, disposables);
    }
  }
  createMarkerData(message, location) {
    return {
      severity: 8,
      message,
      startLineNumber: location.startLineNumber + 1,
      startColumn: location.startColumn + 1,
      endLineNumber: location.endLineNumber + 1,
      endColumn: location.endColumn + 1,
      source: "Cell Execution Error"
    };
  }
  dispose() {
    super.dispose();
    this.clearAll();
  }
};
CellDiagnostics.ID = "workbench.notebook.cellDiagnostics";
CellDiagnostics = __decorateClass([
  __decorateParam(1, INotebookExecutionStateService),
  __decorateParam(2, IMarkerService),
  __decorateParam(3, IChatAgentService),
  __decorateParam(4, IConfigurationService)
], CellDiagnostics);
registerNotebookContribution(CellDiagnostics.ID, CellDiagnostics);
export {
  CellDiagnostics
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxjZWxsRGlhZ25vc3RpY3NcXGNlbGxEaWFnbm9zdGljRWRpdG9yQ29udHJpYi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU1hcmtlckRhdGEsIElNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCwgSUV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50LCBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsIE5vdGVib29rRXhlY3V0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBOb3RlYm9va1NldHRpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rRWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2VsbERpYWdub3N0aWNzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIElEOiBzdHJpbmcgPSAnd29ya2JlbmNoLm5vdGVib29rLmNlbGxEaWFnbm9zdGljcyc7XG5cblx0cHJpdmF0ZSBlbmFibGVkID0gZmFsc2U7XG5cdHByaXZhdGUgbGlzdGVuaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgZGlhZ25vc3RpY3NCeUhhbmRsZTogTWFwPG51bWJlciwgSURpc3Bvc2FibGVbXT4gPSBuZXcgTWFwKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUVuYWJsZWQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRBZ2VudFNlcnZpY2Uub25EaWRDaGFuZ2VBZ2VudHMoKCkgPT4gdGhpcy51cGRhdGVFbmFibGVkKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5jZWxsRmFpbHVyZURpYWdub3N0aWNzKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVuYWJsZWQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGhhc05vdGVib29rQWdlbnQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWdlbnRzID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50cygpO1xuXHRcdHJldHVybiAhIWFnZW50cy5maW5kKGFnZW50ID0+IGFnZW50LmxvY2F0aW9ucy5pbmNsdWRlcyhDaGF0QWdlbnRMb2NhdGlvbi5Ob3RlYm9vaykpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFbmFibGVkKCkge1xuXHRcdGNvbnN0IHNldHRpbmdFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShOb3RlYm9va1NldHRpbmcuY2VsbEZhaWx1cmVEaWFnbm9zdGljcyk7XG5cdFx0aWYgKHRoaXMuZW5hYmxlZCAmJiAoIXNldHRpbmdFbmFibGVkIHx8ICF0aGlzLmhhc05vdGVib29rQWdlbnQoKSkpIHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5jbGVhckFsbCgpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuZW5hYmxlZCAmJiBzZXR0aW5nRW5hYmxlZCAmJiB0aGlzLmhhc05vdGVib29rQWdlbnQoKSkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdGlmICghdGhpcy5saXN0ZW5pbmcpIHtcblx0XHRcdFx0dGhpcy5saXN0ZW5pbmcgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hY2N1bXVsYXRlPElDZWxsRXhlY3V0aW9uU3RhdGVDaGFuZ2VkRXZlbnQgfCBJRXhlY3V0aW9uU3RhdGVDaGFuZ2VkRXZlbnQ+KFxuXHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Uub25EaWRDaGFuZ2VFeGVjdXRpb24sIDIwMFxuXHRcdFx0XHQpKChlKSA9PiB0aGlzLmhhbmRsZUNoYW5nZUV4ZWN1dGlvblN0YXRlKGUpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVDaGFuZ2VFeGVjdXRpb25TdGF0ZShjaGFuZ2VzOiAoSUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCB8IElFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudClbXSkge1xuXHRcdGlmICghdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlZCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3QgZSBvZiBjaGFuZ2VzLnJldmVyc2UoKSkge1xuXG5cdFx0XHRjb25zdCBub3RlYm9va1VyaSA9IHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsPy51cmk7XG5cdFx0XHRpZiAoZS50eXBlID09PSBOb3RlYm9va0V4ZWN1dGlvblR5cGUuY2VsbCAmJiBub3RlYm9va1VyaSAmJiBlLmFmZmVjdHNOb3RlYm9vayhub3RlYm9va1VyaSkgJiYgIWhhbmRsZWQuaGFzKGUuY2VsbEhhbmRsZSkpIHtcblx0XHRcdFx0aGFuZGxlZC5hZGQoZS5jZWxsSGFuZGxlKTtcblx0XHRcdFx0aWYgKCEhZS5jaGFuZ2VkKSB7XG5cdFx0XHRcdFx0Ly8gY2VsbCBpcyBydW5uaW5nXG5cdFx0XHRcdFx0dGhpcy5jbGVhcihlLmNlbGxIYW5kbGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuc2V0RGlhZ25vc3RpY3MoZS5jZWxsSGFuZGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXJBbGwoKSB7XG5cdFx0Zm9yIChjb25zdCBoYW5kbGUgb2YgdGhpcy5kaWFnbm9zdGljc0J5SGFuZGxlLmtleXMoKSkge1xuXHRcdFx0dGhpcy5jbGVhcihoYW5kbGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjbGVhcihjZWxsSGFuZGxlOiBudW1iZXIpIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuZGlhZ25vc3RpY3NCeUhhbmRsZS5nZXQoY2VsbEhhbmRsZSk7XG5cdFx0aWYgKGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRpc3Bvc2FibGUgb2YgZGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRpYWdub3N0aWNzQnlIYW5kbGUuZGVsZXRlKGNlbGxIYW5kbGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0RGlhZ25vc3RpY3MoY2VsbEhhbmRsZTogbnVtYmVyKSB7XG5cdFx0aWYgKHRoaXMuZGlhZ25vc3RpY3NCeUhhbmRsZS5oYXMoY2VsbEhhbmRsZSkpIHtcblx0XHRcdC8vIG11bHRpcGxlIGRpYWdub3N0aWNzIHBlciBjZWxsIG5vdCBzdXBwb3J0ZWQgZm9yIG5vd1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUhhbmRsZShjZWxsSGFuZGxlKTtcblx0XHRpZiAoIWNlbGwgfHwgY2VsbC5jZWxsS2luZCAhPT0gQ2VsbEtpbmQuQ29kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1ldGFkYXRhID0gY2VsbC5tb2RlbC5pbnRlcm5hbE1ldGFkYXRhO1xuXHRcdGlmIChjZWxsIGluc3RhbmNlb2YgQ29kZUNlbGxWaWV3TW9kZWwgJiYgIW1ldGFkYXRhLmxhc3RSdW5TdWNjZXNzICYmIG1ldGFkYXRhPy5lcnJvcj8ubG9jYXRpb24pIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdFx0XHRjb25zdCBlcnJvckxhYmVsID0gbWV0YWRhdGEuZXJyb3IubmFtZSA/IGAke21ldGFkYXRhLmVycm9yLm5hbWV9OiAke21ldGFkYXRhLmVycm9yLm1lc3NhZ2V9YCA6IG1ldGFkYXRhLmVycm9yLm1lc3NhZ2U7XG5cdFx0XHRjb25zdCBtYXJrZXIgPSB0aGlzLmNyZWF0ZU1hcmtlckRhdGEoZXJyb3JMYWJlbCwgbWV0YWRhdGEuZXJyb3IubG9jYXRpb24pO1xuXHRcdFx0dGhpcy5tYXJrZXJTZXJ2aWNlLmNoYW5nZU9uZShDZWxsRGlhZ25vc3RpY3MuSUQsIGNlbGwudXJpLCBbbWFya2VyXSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5wdXNoKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLm1hcmtlclNlcnZpY2UuY2hhbmdlT25lKENlbGxEaWFnbm9zdGljcy5JRCwgY2VsbC51cmksIFtdKSkpO1xuXHRcdFx0Y2VsbC5leGVjdXRpb25FcnJvckRpYWdub3N0aWMuc2V0KG1ldGFkYXRhLmVycm9yLCB1bmRlZmluZWQpO1xuXHRcdFx0ZGlzcG9zYWJsZXMucHVzaCh0b0Rpc3Bvc2FibGUoKCkgPT4gY2VsbC5leGVjdXRpb25FcnJvckRpYWdub3N0aWMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMucHVzaChhdXRvcnVuKChyKSA9PiB7XG5cdFx0XHRcdGlmICghY2VsbC5leGVjdXRpb25FcnJvckRpYWdub3N0aWMucmVhZChyKSkge1xuXHRcdFx0XHRcdHRoaXMuY2xlYXIoY2VsbEhhbmRsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLnB1c2goY2VsbC5tb2RlbC5vbkRpZENoYW5nZU91dHB1dHMoKCkgPT4ge1xuXHRcdFx0XHRpZiAoY2VsbC5tb2RlbC5vdXRwdXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuY2xlYXIoY2VsbEhhbmRsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLnB1c2goY2VsbC5tb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNsZWFyKGNlbGxIYW5kbGUpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5kaWFnbm9zdGljc0J5SGFuZGxlLnNldChjZWxsSGFuZGxlLCBkaXNwb3NhYmxlcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNYXJrZXJEYXRhKG1lc3NhZ2U6IHN0cmluZywgbG9jYXRpb246IElSYW5nZSk6IElNYXJrZXJEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V2ZXJpdHk6IDgsXG5cdFx0XHRtZXNzYWdlOiBtZXNzYWdlLFxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsb2NhdGlvbi5zdGFydExpbmVOdW1iZXIgKyAxLFxuXHRcdFx0c3RhcnRDb2x1bW46IGxvY2F0aW9uLnN0YXJ0Q29sdW1uICsgMSxcblx0XHRcdGVuZExpbmVOdW1iZXI6IGxvY2F0aW9uLmVuZExpbmVOdW1iZXIgKyAxLFxuXHRcdFx0ZW5kQ29sdW1uOiBsb2NhdGlvbi5lbmRDb2x1bW4gKyAxLFxuXHRcdFx0c291cmNlOiAnQ2VsbCBFeGVjdXRpb24gRXJyb3InXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY2xlYXJBbGwoKTtcblx0fVxuXG59XG5cbnJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24oQ2VsbERpYWdub3N0aWNzLklELCBDZWxsRGlhZ25vc3RpY3MpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFzQixzQkFBc0I7QUFFNUMsU0FBdUUsZ0NBQWdDLDZCQUE2QjtBQUNwSSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFVBQVUsdUJBQXVCO0FBRTFDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFFakIsSUFBTSxrQkFBTixjQUE4QixXQUFrRDtBQUFBLEVBUXRGLFlBQ2tCLGdCQUNnQywr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
