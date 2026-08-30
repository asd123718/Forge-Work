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
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { NotebookDto } from "./mainThreadNotebookDto.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { INotebookEditorService } from "../../contrib/notebook/browser/services/notebookEditorService.js";
import { INotebookExecutionStateService } from "../../contrib/notebook/common/notebookExecutionStateService.js";
import { INotebookKernelService } from "../../contrib/notebook/common/notebookKernelService.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { INotebookService } from "../../contrib/notebook/common/notebookService.js";
import { AsyncIterableProducer } from "../../../base/common/async.js";
class MainThreadKernel {
  constructor(data, _languageService) {
    this._languageService = _languageService;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this.id = data.id;
    this.viewType = data.notebookType;
    this.extension = data.extensionId;
    this.implementsInterrupt = data.supportsInterrupt ?? false;
    this.label = data.label;
    this.description = data.description;
    this.detail = data.detail;
    this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : _languageService.getRegisteredLanguageIds();
    this.implementsExecutionOrder = data.supportsExecutionOrder ?? false;
    this.hasVariableProvider = data.hasVariableProvider ?? false;
    this.localResourceRoot = URI.revive(data.extensionLocation);
    this.preloads = data.preloads?.map((u) => ({ uri: URI.revive(u.uri), provides: u.provides })) ?? [];
  }
  get preloadUris() {
    return this.preloads.map((p) => p.uri);
  }
  get preloadProvides() {
    return this.preloads.flatMap((p) => p.provides);
  }
  update(data) {
    const event = /* @__PURE__ */ Object.create(null);
    if (data.label !== void 0) {
      this.label = data.label;
      event.label = true;
    }
    if (data.description !== void 0) {
      this.description = data.description;
      event.description = true;
    }
    if (data.detail !== void 0) {
      this.detail = data.detail;
      event.detail = true;
    }
    if (data.supportedLanguages !== void 0) {
      this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : this._languageService.getRegisteredLanguageIds();
      event.supportedLanguages = true;
    }
    if (data.supportsExecutionOrder !== void 0) {
      this.implementsExecutionOrder = data.supportsExecutionOrder;
      event.hasExecutionOrder = true;
    }
    if (data.supportsInterrupt !== void 0) {
      this.implementsInterrupt = data.supportsInterrupt;
      event.hasInterruptHandler = true;
    }
    if (data.hasVariableProvider !== void 0) {
      this.hasVariableProvider = data.hasVariableProvider;
      event.hasVariableProvider = true;
    }
    this._onDidChange.fire(event);
  }
}
class MainThreadKernelDetectionTask {
  constructor(notebookType) {
    this.notebookType = notebookType;
  }
}
let MainThreadNotebookKernels = class {
  constructor(extHostContext, _languageService, _notebookKernelService, _notebookExecutionStateService, _notebookService, notebookEditorService) {
    this._languageService = _languageService;
    this._notebookKernelService = _notebookKernelService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this._notebookService = _notebookService;
    this._editors = new DisposableMap();
    this._disposables = new DisposableStore();
    this._kernels = /* @__PURE__ */ new Map();
    this._kernelDetectionTasks = /* @__PURE__ */ new Map();
    this._kernelSourceActionProviders = /* @__PURE__ */ new Map();
    this._kernelSourceActionProvidersEventRegistrations = /* @__PURE__ */ new Map();
    this._executions = /* @__PURE__ */ new Map();
    this._notebookExecutions = /* @__PURE__ */ new Map();
    this.variableRequestIndex = 0;
    this.variableRequestMap = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookKernels);
    notebookEditorService.listNotebookEditors().forEach(this._onEditorAdd, this);
    notebookEditorService.onDidAddNotebookEditor(this._onEditorAdd, this, this._disposables);
    notebookEditorService.onDidRemoveNotebookEditor(this._onEditorRemove, this, this._disposables);
    this._disposables.add(toDisposable(() => {
      this._executions.forEach((e) => {
        e.complete({});
      });
      this._notebookExecutions.forEach((e) => e.complete());
    }));
    this._disposables.add(this._notebookKernelService.onDidChangeSelectedNotebooks((e) => {
      for (const [handle, [kernel]] of this._kernels) {
        if (e.oldKernel === kernel.id) {
          this._proxy.$acceptNotebookAssociation(handle, e.notebook, false);
        } else if (e.newKernel === kernel.id) {
          this._proxy.$acceptNotebookAssociation(handle, e.notebook, true);
        }
      }
    }));
  }
  dispose() {
    this._disposables.dispose();
    for (const [, registration] of this._kernels.values()) {
      registration.dispose();
    }
    for (const [, registration] of this._kernelDetectionTasks.values()) {
      registration.dispose();
    }
    for (const [, registration] of this._kernelSourceActionProviders.values()) {
      registration.dispose();
    }
    this._editors.dispose();
  }
  // --- kernel ipc
  _onEditorAdd(editor) {
    const ipcListener = editor.onDidReceiveMessage((e) => {
      if (!editor.hasModel()) {
        return;
      }
      const { selected } = this._notebookKernelService.getMatchingKernel(editor.textModel);
      if (!selected) {
        return;
      }
      for (const [handle, candidate] of this._kernels) {
        if (candidate[0] === selected) {
          this._proxy.$acceptKernelMessageFromRenderer(handle, editor.getId(), e.message);
          break;
        }
      }
    });
    this._editors.set(editor, ipcListener);
  }
  _onEditorRemove(editor) {
    this._editors.deleteAndDispose(editor);
  }
  async $postMessage(handle, editorId, message) {
    const tuple = this._kernels.get(handle);
    if (!tuple) {
      throw new Error("kernel already disposed");
    }
    const [kernel] = tuple;
    let didSend = false;
    for (const [editor] of this._editors) {
      if (!editor.hasModel()) {
        continue;
      }
      if (this._notebookKernelService.getMatchingKernel(editor.textModel).selected !== kernel) {
        continue;
      }
      if (editorId === void 0) {
        editor.postMessage(message);
        didSend = true;
      } else if (editor.getId() === editorId) {
        editor.postMessage(message);
        didSend = true;
        break;
      }
    }
    return didSend;
  }
  $receiveVariable(requestId, variable) {
    const emitter = this.variableRequestMap.get(requestId);
    if (emitter) {
      emitter.emitOne(variable);
    }
  }
  // --- kernel adding/updating/removal
  async $addKernel(handle, data) {
    const that = this;
    const kernel = new class extends MainThreadKernel {
      async executeNotebookCellsRequest(uri, handles) {
        await that._proxy.$executeCells(handle, uri, handles);
      }
      async cancelNotebookCellExecution(uri, handles) {
        await that._proxy.$cancelCells(handle, uri, handles);
      }
      provideVariables(notebookUri, parentId, kind, start, token) {
        const requestId = `${handle}variables${that.variableRequestIndex++}`;
        return new AsyncIterableProducer(async (emitter) => {
          that.variableRequestMap.set(requestId, emitter);
          try {
            await that._proxy.$provideVariables(handle, requestId, notebookUri, parentId, kind, start, token);
          } finally {
            that.variableRequestMap.delete(requestId);
          }
        });
      }
    }(data, this._languageService);
    const disposables = this._disposables.add(new DisposableStore());
    this._kernels.set(handle, [kernel, disposables]);
    disposables.add(this._notebookKernelService.registerKernel(kernel));
  }
  $updateKernel(handle, data) {
    const tuple = this._kernels.get(handle);
    if (tuple) {
      tuple[0].update(data);
    }
  }
  $removeKernel(handle) {
    const tuple = this._kernels.get(handle);
    if (tuple) {
      tuple[1].dispose();
      this._kernels.delete(handle);
    }
  }
  $updateNotebookPriority(handle, notebook, value) {
    const tuple = this._kernels.get(handle);
    if (tuple) {
      this._notebookKernelService.updateKernelNotebookAffinity(tuple[0], URI.revive(notebook), value);
    }
  }
  // --- Cell execution
  $createExecution(handle, controllerId, rawUri, cellHandle) {
    const uri = URI.revive(rawUri);
    const notebook = this._notebookService.getNotebookTextModel(uri);
    if (!notebook) {
      throw new Error(`Notebook not found: ${uri.toString()}`);
    }
    const kernel = this._notebookKernelService.getMatchingKernel(notebook);
    if (!kernel.selected || kernel.selected.id !== controllerId) {
      throw new Error(`Kernel is not selected: ${kernel.selected?.id} !== ${controllerId}`);
    }
    const execution = this._notebookExecutionStateService.createCellExecution(uri, cellHandle);
    execution.confirm();
    this._executions.set(handle, execution);
  }
  $updateExecution(handle, data) {
    const updates = data.value;
    try {
      const execution = this._executions.get(handle);
      execution?.update(updates.map(NotebookDto.fromCellExecuteUpdateDto));
    } catch (e) {
      onUnexpectedError(e);
    }
  }
  $completeExecution(handle, data) {
    try {
      const execution = this._executions.get(handle);
      execution?.complete(NotebookDto.fromCellExecuteCompleteDto(data.value));
    } catch (e) {
      onUnexpectedError(e);
    } finally {
      this._executions.delete(handle);
    }
  }
  // --- Notebook execution
  $createNotebookExecution(handle, controllerId, rawUri) {
    const uri = URI.revive(rawUri);
    const notebook = this._notebookService.getNotebookTextModel(uri);
    if (!notebook) {
      throw new Error(`Notebook not found: ${uri.toString()}`);
    }
    const kernel = this._notebookKernelService.getMatchingKernel(notebook);
    if (!kernel.selected || kernel.selected.id !== controllerId) {
      throw new Error(`Kernel is not selected: ${kernel.selected?.id} !== ${controllerId}`);
    }
    const execution = this._notebookExecutionStateService.createExecution(uri);
    execution.confirm();
    this._notebookExecutions.set(handle, execution);
  }
  $beginNotebookExecution(handle) {
    try {
      const execution = this._notebookExecutions.get(handle);
      execution?.begin();
    } catch (e) {
      onUnexpectedError(e);
    }
  }
  $completeNotebookExecution(handle) {
    try {
      const execution = this._notebookExecutions.get(handle);
      execution?.complete();
    } catch (e) {
      onUnexpectedError(e);
    } finally {
      this._notebookExecutions.delete(handle);
    }
  }
  // --- notebook kernel detection task
  async $addKernelDetectionTask(handle, notebookType) {
    const kernelDetectionTask = new MainThreadKernelDetectionTask(notebookType);
    const registration = this._notebookKernelService.registerNotebookKernelDetectionTask(kernelDetectionTask);
    this._kernelDetectionTasks.set(handle, [kernelDetectionTask, registration]);
  }
  $removeKernelDetectionTask(handle) {
    const tuple = this._kernelDetectionTasks.get(handle);
    if (tuple) {
      tuple[1].dispose();
      this._kernelDetectionTasks.delete(handle);
    }
  }
  // --- notebook kernel source action provider
  async $addKernelSourceActionProvider(handle, eventHandle, notebookType) {
    const kernelSourceActionProvider = {
      viewType: notebookType,
      provideKernelSourceActions: async () => {
        const actions = await this._proxy.$provideKernelSourceActions(handle, CancellationToken.None);
        return actions.map((action) => {
          let documentation = action.documentation;
          if (action.documentation && typeof action.documentation !== "string") {
            documentation = URI.revive(action.documentation);
          }
          return {
            label: action.label,
            command: action.command,
            description: action.description,
            detail: action.detail,
            documentation
          };
        });
      }
    };
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._kernelSourceActionProvidersEventRegistrations.set(eventHandle, emitter);
      kernelSourceActionProvider.onDidChangeSourceActions = emitter.event;
    }
    const registration = this._notebookKernelService.registerKernelSourceActionProvider(notebookType, kernelSourceActionProvider);
    this._kernelSourceActionProviders.set(handle, [kernelSourceActionProvider, registration]);
  }
  $removeKernelSourceActionProvider(handle, eventHandle) {
    const tuple = this._kernelSourceActionProviders.get(handle);
    if (tuple) {
      tuple[1].dispose();
      this._kernelSourceActionProviders.delete(handle);
    }
    if (typeof eventHandle === "number") {
      this._kernelSourceActionProvidersEventRegistrations.delete(eventHandle);
    }
  }
  $emitNotebookKernelSourceActionsChangeEvent(eventHandle) {
    const emitter = this._kernelSourceActionProvidersEventRegistrations.get(eventHandle);
    if (emitter instanceof Emitter) {
      emitter.fire(void 0);
    }
  }
  $variablesUpdated(notebookUri) {
    this._notebookKernelService.notifyVariablesChange(URI.revive(notebookUri));
  }
};
MainThreadNotebookKernels = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadNotebookKernels),
  __decorateParam(1, ILanguageService),
  __decorateParam(2, INotebookKernelService),
  __decorateParam(3, INotebookExecutionStateService),
  __decorateParam(4, INotebookService),
  __decorateParam(5, INotebookEditorService)
], MainThreadNotebookKernels);
export {
  MainThreadNotebookKernels
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZE5vdGVib29rS2VybmVscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE5vdGVib29rRHRvIH0gZnJvbSAnLi9tYWluVGhyZWFkTm90ZWJvb2tEdG8uanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9icm93c2VyL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsRXhlY3V0aW9uLCBJTm90ZWJvb2tFeGVjdXRpb24sIElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlciwgSU5vdGVib29rS2VybmVsLCBJTm90ZWJvb2tLZXJuZWxDaGFuZ2VFdmVudCwgSU5vdGVib29rS2VybmVsRGV0ZWN0aW9uVGFzaywgSU5vdGVib29rS2VybmVsU2VydmljZSwgVmFyaWFibGVzUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0Tm90ZWJvb2tLZXJuZWxzU2hhcGUsIElDZWxsRXhlY3V0ZVVwZGF0ZUR0bywgSUNlbGxFeGVjdXRpb25Db21wbGV0ZUR0bywgSU5vdGVib29rS2VybmVsRHRvMiwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWROb3RlYm9va0tlcm5lbHNTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZUVtaXR0ZXIsIEFzeW5jSXRlcmFibGVQcm9kdWNlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuYWJzdHJhY3QgY2xhc3MgTWFpblRocmVhZEtlcm5lbCBpbXBsZW1lbnRzIElOb3RlYm9va0tlcm5lbCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8SU5vdGVib29rS2VybmVsQ2hhbmdlRXZlbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJlbG9hZHM6IHsgdXJpOiBVUkk7IHByb3ZpZGVzOiByZWFkb25seSBzdHJpbmdbXSB9W107XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxJTm90ZWJvb2tLZXJuZWxDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB2aWV3VHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cblx0aW1wbGVtZW50c0ludGVycnVwdDogYm9vbGVhbjtcblx0bGFiZWw6IHN0cmluZztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGRldGFpbD86IHN0cmluZztcblx0c3VwcG9ydGVkTGFuZ3VhZ2VzOiBzdHJpbmdbXTtcblx0aW1wbGVtZW50c0V4ZWN1dGlvbk9yZGVyOiBib29sZWFuO1xuXHRoYXNWYXJpYWJsZVByb3ZpZGVyOiBib29sZWFuO1xuXHRsb2NhbFJlc291cmNlUm9vdDogVVJJO1xuXG5cdHB1YmxpYyBnZXQgcHJlbG9hZFVyaXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMucHJlbG9hZHMubWFwKHAgPT4gcC51cmkpO1xuXHR9XG5cblx0cHVibGljIGdldCBwcmVsb2FkUHJvdmlkZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMucHJlbG9hZHMuZmxhdE1hcChwID0+IHAucHJvdmlkZXMpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoZGF0YTogSU5vdGVib29rS2VybmVsRHRvMiwgcHJpdmF0ZSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlKSB7XG5cdFx0dGhpcy5pZCA9IGRhdGEuaWQ7XG5cdFx0dGhpcy52aWV3VHlwZSA9IGRhdGEubm90ZWJvb2tUeXBlO1xuXHRcdHRoaXMuZXh0ZW5zaW9uID0gZGF0YS5leHRlbnNpb25JZDtcblxuXHRcdHRoaXMuaW1wbGVtZW50c0ludGVycnVwdCA9IGRhdGEuc3VwcG9ydHNJbnRlcnJ1cHQgPz8gZmFsc2U7XG5cdFx0dGhpcy5sYWJlbCA9IGRhdGEubGFiZWw7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IGRhdGEuZGVzY3JpcHRpb247XG5cdFx0dGhpcy5kZXRhaWwgPSBkYXRhLmRldGFpbDtcblx0XHR0aGlzLnN1cHBvcnRlZExhbmd1YWdlcyA9IGlzTm9uRW1wdHlBcnJheShkYXRhLnN1cHBvcnRlZExhbmd1YWdlcykgPyBkYXRhLnN1cHBvcnRlZExhbmd1YWdlcyA6IF9sYW5ndWFnZVNlcnZpY2UuZ2V0UmVnaXN0ZXJlZExhbmd1YWdlSWRzKCk7XG5cdFx0dGhpcy5pbXBsZW1lbnRzRXhlY3V0aW9uT3JkZXIgPSBkYXRhLnN1cHBvcnRzRXhlY3V0aW9uT3JkZXIgPz8gZmFsc2U7XG5cdFx0dGhpcy5oYXNWYXJpYWJsZVByb3ZpZGVyID0gZGF0YS5oYXNWYXJpYWJsZVByb3ZpZGVyID8/IGZhbHNlO1xuXHRcdHRoaXMubG9jYWxSZXNvdXJjZVJvb3QgPSBVUkkucmV2aXZlKGRhdGEuZXh0ZW5zaW9uTG9jYXRpb24pO1xuXHRcdHRoaXMucHJlbG9hZHMgPSBkYXRhLnByZWxvYWRzPy5tYXAodSA9PiAoeyB1cmk6IFVSSS5yZXZpdmUodS51cmkpLCBwcm92aWRlczogdS5wcm92aWRlcyB9KSkgPz8gW107XG5cdH1cblxuXG5cdHVwZGF0ZShkYXRhOiBQYXJ0aWFsPElOb3RlYm9va0tlcm5lbER0bzI+KSB7XG5cblx0XHRjb25zdCBldmVudDogSU5vdGVib29rS2VybmVsQ2hhbmdlRXZlbnQgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGlmIChkYXRhLmxhYmVsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubGFiZWwgPSBkYXRhLmxhYmVsO1xuXHRcdFx0ZXZlbnQubGFiZWwgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5kZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGF0YS5kZXNjcmlwdGlvbjtcblx0XHRcdGV2ZW50LmRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGRhdGEuZGV0YWlsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuZGV0YWlsID0gZGF0YS5kZXRhaWw7XG5cdFx0XHRldmVudC5kZXRhaWwgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5zdXBwb3J0ZWRMYW5ndWFnZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5zdXBwb3J0ZWRMYW5ndWFnZXMgPSBpc05vbkVtcHR5QXJyYXkoZGF0YS5zdXBwb3J0ZWRMYW5ndWFnZXMpID8gZGF0YS5zdXBwb3J0ZWRMYW5ndWFnZXMgOiB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuZ2V0UmVnaXN0ZXJlZExhbmd1YWdlSWRzKCk7XG5cdFx0XHRldmVudC5zdXBwb3J0ZWRMYW5ndWFnZXMgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5zdXBwb3J0c0V4ZWN1dGlvbk9yZGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuaW1wbGVtZW50c0V4ZWN1dGlvbk9yZGVyID0gZGF0YS5zdXBwb3J0c0V4ZWN1dGlvbk9yZGVyO1xuXHRcdFx0ZXZlbnQuaGFzRXhlY3V0aW9uT3JkZXIgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5zdXBwb3J0c0ludGVycnVwdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmltcGxlbWVudHNJbnRlcnJ1cHQgPSBkYXRhLnN1cHBvcnRzSW50ZXJydXB0O1xuXHRcdFx0ZXZlbnQuaGFzSW50ZXJydXB0SGFuZGxlciA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChkYXRhLmhhc1ZhcmlhYmxlUHJvdmlkZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5oYXNWYXJpYWJsZVByb3ZpZGVyID0gZGF0YS5oYXNWYXJpYWJsZVByb3ZpZGVyO1xuXHRcdFx0ZXZlbnQuaGFzVmFyaWFibGVQcm92aWRlciA9IHRydWU7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0YWJzdHJhY3QgZXhlY3V0ZU5vdGVib29rQ2VsbHNSZXF1ZXN0KHVyaTogVVJJLCBjZWxsSGFuZGxlczogbnVtYmVyW10pOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCBjYW5jZWxOb3RlYm9va0NlbGxFeGVjdXRpb24odXJpOiBVUkksIGNlbGxIYW5kbGVzOiBudW1iZXJbXSk6IFByb21pc2U8dm9pZD47XG5cdGFic3RyYWN0IHByb3ZpZGVWYXJpYWJsZXMobm90ZWJvb2tVcmk6IFVSSSwgcGFyZW50SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwga2luZDogJ25hbWVkJyB8ICdpbmRleGVkJywgc3RhcnQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFZhcmlhYmxlc1Jlc3VsdD47XG59XG5cbmNsYXNzIE1haW5UaHJlYWRLZXJuZWxEZXRlY3Rpb25UYXNrIGltcGxlbWVudHMgSU5vdGVib29rS2VybmVsRGV0ZWN0aW9uVGFzayB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IG5vdGVib29rVHlwZTogc3RyaW5nKSB7IH1cbn1cblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWROb3RlYm9va0tlcm5lbHMpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZE5vdGVib29rS2VybmVscyBpbXBsZW1lbnRzIE1haW5UaHJlYWROb3RlYm9va0tlcm5lbHNTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9ycyA9IG5ldyBEaXNwb3NhYmxlTWFwPElOb3RlYm9va0VkaXRvcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfa2VybmVscyA9IG5ldyBNYXA8bnVtYmVyLCBba2VybmVsOiBNYWluVGhyZWFkS2VybmVsLCByZWdpc3RyYWlvbjogSURpc3Bvc2FibGVdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXJuZWxEZXRlY3Rpb25UYXNrcyA9IG5ldyBNYXA8bnVtYmVyLCBbdGFzazogTWFpblRocmVhZEtlcm5lbERldGVjdGlvblRhc2ssIHJlZ2lzdHJhaW9uOiBJRGlzcG9zYWJsZV0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVycyA9IG5ldyBNYXA8bnVtYmVyLCBbcHJvdmlkZXI6IElLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlciwgcmVnaXN0cmFpb246IElEaXNwb3NhYmxlXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzRXZlbnRSZWdpc3RyYXRpb25zID0gbmV3IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0Tm90ZWJvb2tLZXJuZWxzU2hhcGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXhlY3V0aW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBJTm90ZWJvb2tDZWxsRXhlY3V0aW9uPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0V4ZWN1dGlvbnMgPSBuZXcgTWFwPG51bWJlciwgSU5vdGVib29rRXhlY3V0aW9uPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIG5vdGVib29rRWRpdG9yU2VydmljZTogSU5vdGVib29rRWRpdG9yU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3ROb3RlYm9va0tlcm5lbHMpO1xuXG5cdFx0bm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmxpc3ROb3RlYm9va0VkaXRvcnMoKS5mb3JFYWNoKHRoaXMuX29uRWRpdG9yQWRkLCB0aGlzKTtcblx0XHRub3RlYm9va0VkaXRvclNlcnZpY2Uub25EaWRBZGROb3RlYm9va0VkaXRvcih0aGlzLl9vbkVkaXRvckFkZCwgdGhpcywgdGhpcy5fZGlzcG9zYWJsZXMpO1xuXHRcdG5vdGVib29rRWRpdG9yU2VydmljZS5vbkRpZFJlbW92ZU5vdGVib29rRWRpdG9yKHRoaXMuX29uRWRpdG9yUmVtb3ZlLCB0aGlzLCB0aGlzLl9kaXNwb3NhYmxlcyk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdC8vIEVIIHNodXQgZG93biwgY29tcGxldGUgYWxsIGV4ZWN1dGlvbnMgc3RhcnRlZCBieSB0aGlzIEVIXG5cdFx0XHR0aGlzLl9leGVjdXRpb25zLmZvckVhY2goZSA9PiB7XG5cdFx0XHRcdGUuY29tcGxldGUoe30pO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0V4ZWN1dGlvbnMuZm9yRWFjaChlID0+IGUuY29tcGxldGUoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5vbkRpZENoYW5nZVNlbGVjdGVkTm90ZWJvb2tzKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBbaGFuZGxlLCBba2VybmVsLF1dIG9mIHRoaXMuX2tlcm5lbHMpIHtcblx0XHRcdFx0aWYgKGUub2xkS2VybmVsID09PSBrZXJuZWwuaWQpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0Tm90ZWJvb2tBc3NvY2lhdGlvbihoYW5kbGUsIGUubm90ZWJvb2ssIGZhbHNlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlLm5ld0tlcm5lbCA9PT0ga2VybmVsLmlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdE5vdGVib29rQXNzb2NpYXRpb24oaGFuZGxlLCBlLm5vdGVib29rLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdGZvciAoY29uc3QgWywgcmVnaXN0cmF0aW9uXSBvZiB0aGlzLl9rZXJuZWxzLnZhbHVlcygpKSB7XG5cdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFssIHJlZ2lzdHJhdGlvbl0gb2YgdGhpcy5fa2VybmVsRGV0ZWN0aW9uVGFza3MudmFsdWVzKCkpIHtcblx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgWywgcmVnaXN0cmF0aW9uXSBvZiB0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnMudmFsdWVzKCkpIHtcblx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRvcnMuZGlzcG9zZSgpO1xuXHR9XG5cblx0Ly8gLS0tIGtlcm5lbCBpcGNcblxuXHRwcml2YXRlIF9vbkVkaXRvckFkZChlZGl0b3I6IElOb3RlYm9va0VkaXRvcikge1xuXG5cdFx0Y29uc3QgaXBjTGlzdGVuZXIgPSBlZGl0b3Iub25EaWRSZWNlaXZlTWVzc2FnZShlID0+IHtcblx0XHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBzZWxlY3RlZCB9ID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKGVkaXRvci50ZXh0TW9kZWwpO1xuXHRcdFx0aWYgKCFzZWxlY3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IFtoYW5kbGUsIGNhbmRpZGF0ZV0gb2YgdGhpcy5fa2VybmVscykge1xuXHRcdFx0XHRpZiAoY2FuZGlkYXRlWzBdID09PSBzZWxlY3RlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRLZXJuZWxNZXNzYWdlRnJvbVJlbmRlcmVyKGhhbmRsZSwgZWRpdG9yLmdldElkKCksIGUubWVzc2FnZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9lZGl0b3JzLnNldChlZGl0b3IsIGlwY0xpc3RlbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRWRpdG9yUmVtb3ZlKGVkaXRvcjogSU5vdGVib29rRWRpdG9yKSB7XG5cdFx0dGhpcy5fZWRpdG9ycy5kZWxldGVBbmREaXNwb3NlKGVkaXRvcik7XG5cdH1cblxuXHRhc3luYyAkcG9zdE1lc3NhZ2UoaGFuZGxlOiBudW1iZXIsIGVkaXRvcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIG1lc3NhZ2U6IHVua25vd24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB0dXBsZSA9IHRoaXMuX2tlcm5lbHMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCF0dXBsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdrZXJuZWwgYWxyZWFkeSBkaXNwb3NlZCcpO1xuXHRcdH1cblx0XHRjb25zdCBba2VybmVsXSA9IHR1cGxlO1xuXHRcdGxldCBkaWRTZW5kID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBbZWRpdG9yXSBvZiB0aGlzLl9lZGl0b3JzKSB7XG5cdFx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChlZGl0b3IudGV4dE1vZGVsKS5zZWxlY3RlZCAhPT0ga2VybmVsKSB7XG5cdFx0XHRcdC8vIGRpZmZlcmVudCBrZXJuZWxcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWRpdG9ySWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyBhbGwgZWRpdG9yc1xuXHRcdFx0XHRlZGl0b3IucG9zdE1lc3NhZ2UobWVzc2FnZSk7XG5cdFx0XHRcdGRpZFNlbmQgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChlZGl0b3IuZ2V0SWQoKSA9PT0gZWRpdG9ySWQpIHtcblx0XHRcdFx0Ly8gc2VsZWN0ZWQgZWRpdG9yc1xuXHRcdFx0XHRlZGl0b3IucG9zdE1lc3NhZ2UobWVzc2FnZSk7XG5cdFx0XHRcdGRpZFNlbmQgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRpZFNlbmQ7XG5cdH1cblxuXHRwcml2YXRlIHZhcmlhYmxlUmVxdWVzdEluZGV4ID0gMDtcblx0cHJpdmF0ZSB2YXJpYWJsZVJlcXVlc3RNYXAgPSBuZXcgTWFwPHN0cmluZywgQXN5bmNJdGVyYWJsZUVtaXR0ZXI8VmFyaWFibGVzUmVzdWx0Pj4oKTtcblx0JHJlY2VpdmVWYXJpYWJsZShyZXF1ZXN0SWQ6IHN0cmluZywgdmFyaWFibGU6IFZhcmlhYmxlc1Jlc3VsdCkge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSB0aGlzLnZhcmlhYmxlUmVxdWVzdE1hcC5nZXQocmVxdWVzdElkKTtcblx0XHRpZiAoZW1pdHRlcikge1xuXHRcdFx0ZW1pdHRlci5lbWl0T25lKHZhcmlhYmxlKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0ga2VybmVsIGFkZGluZy91cGRhdGluZy9yZW1vdmFsXG5cblx0YXN5bmMgJGFkZEtlcm5lbChoYW5kbGU6IG51bWJlciwgZGF0YTogSU5vdGVib29rS2VybmVsRHRvMik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IGtlcm5lbCA9IG5ldyBjbGFzcyBleHRlbmRzIE1haW5UaHJlYWRLZXJuZWwge1xuXHRcdFx0YXN5bmMgZXhlY3V0ZU5vdGVib29rQ2VsbHNSZXF1ZXN0KHVyaTogVVJJLCBoYW5kbGVzOiBudW1iZXJbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRhd2FpdCB0aGF0Ll9wcm94eS4kZXhlY3V0ZUNlbGxzKGhhbmRsZSwgdXJpLCBoYW5kbGVzKTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIGNhbmNlbE5vdGVib29rQ2VsbEV4ZWN1dGlvbih1cmk6IFVSSSwgaGFuZGxlczogbnVtYmVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0YXdhaXQgdGhhdC5fcHJveHkuJGNhbmNlbENlbGxzKGhhbmRsZSwgdXJpLCBoYW5kbGVzKTtcblx0XHRcdH1cblx0XHRcdHByb3ZpZGVWYXJpYWJsZXMobm90ZWJvb2tVcmk6IFVSSSwgcGFyZW50SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwga2luZDogJ25hbWVkJyB8ICdpbmRleGVkJywgc3RhcnQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFZhcmlhYmxlc1Jlc3VsdD4ge1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0SWQgPSBgJHtoYW5kbGV9dmFyaWFibGVzJHt0aGF0LnZhcmlhYmxlUmVxdWVzdEluZGV4Kyt9YDtcblxuXHRcdFx0XHRyZXR1cm4gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcjxWYXJpYWJsZXNSZXN1bHQ+KGFzeW5jIGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRcdHRoYXQudmFyaWFibGVSZXF1ZXN0TWFwLnNldChyZXF1ZXN0SWQsIGVtaXR0ZXIpO1xuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuX3Byb3h5LiRwcm92aWRlVmFyaWFibGVzKGhhbmRsZSwgcmVxdWVzdElkLCBub3RlYm9va1VyaSwgcGFyZW50SWQsIGtpbmQsIHN0YXJ0LCB0b2tlbik7XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdHRoYXQudmFyaWFibGVSZXF1ZXN0TWFwLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fShkYXRhLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHQvLyBFbnN1cmUgX2tlcm5lbHMgaXMgdXAgdG8gZGF0ZSBiZWZvcmUgd2UgcmVnaXN0ZXIgYSBrZXJuZWwuXG5cdFx0dGhpcy5fa2VybmVscy5zZXQoaGFuZGxlLCBba2VybmVsLCBkaXNwb3NhYmxlc10pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UucmVnaXN0ZXJLZXJuZWwoa2VybmVsKSk7XG5cdH1cblxuXHQkdXBkYXRlS2VybmVsKGhhbmRsZTogbnVtYmVyLCBkYXRhOiBQYXJ0aWFsPElOb3RlYm9va0tlcm5lbER0bzI+KTogdm9pZCB7XG5cdFx0Y29uc3QgdHVwbGUgPSB0aGlzLl9rZXJuZWxzLmdldChoYW5kbGUpO1xuXHRcdGlmICh0dXBsZSkge1xuXHRcdFx0dHVwbGVbMF0udXBkYXRlKGRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdCRyZW1vdmVLZXJuZWwoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0dXBsZSA9IHRoaXMuX2tlcm5lbHMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKHR1cGxlKSB7XG5cdFx0XHR0dXBsZVsxXS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9rZXJuZWxzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdH1cblx0fVxuXG5cdCR1cGRhdGVOb3RlYm9va1ByaW9yaXR5KGhhbmRsZTogbnVtYmVyLCBub3RlYm9vazogVXJpQ29tcG9uZW50cywgdmFsdWU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHR1cGxlID0gdGhpcy5fa2VybmVscy5nZXQoaGFuZGxlKTtcblx0XHRpZiAodHVwbGUpIHtcblx0XHRcdHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS51cGRhdGVLZXJuZWxOb3RlYm9va0FmZmluaXR5KHR1cGxlWzBdLCBVUkkucmV2aXZlKG5vdGVib29rKSwgdmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBDZWxsIGV4ZWN1dGlvblxuXG5cdCRjcmVhdGVFeGVjdXRpb24oaGFuZGxlOiBudW1iZXIsIGNvbnRyb2xsZXJJZDogc3RyaW5nLCByYXdVcmk6IFVyaUNvbXBvbmVudHMsIGNlbGxIYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUocmF3VXJpKTtcblx0XHRjb25zdCBub3RlYm9vayA9IHRoaXMuX25vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbCh1cmkpO1xuXHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm90ZWJvb2sgbm90IGZvdW5kOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtlcm5lbCA9IHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChub3RlYm9vayk7XG5cdFx0aWYgKCFrZXJuZWwuc2VsZWN0ZWQgfHwga2VybmVsLnNlbGVjdGVkLmlkICE9PSBjb250cm9sbGVySWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgS2VybmVsIGlzIG5vdCBzZWxlY3RlZDogJHtrZXJuZWwuc2VsZWN0ZWQ/LmlkfSAhPT0gJHtjb250cm9sbGVySWR9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IHRoaXMuX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmNyZWF0ZUNlbGxFeGVjdXRpb24odXJpLCBjZWxsSGFuZGxlKTtcblx0XHRleGVjdXRpb24uY29uZmlybSgpO1xuXHRcdHRoaXMuX2V4ZWN1dGlvbnMuc2V0KGhhbmRsZSwgZXhlY3V0aW9uKTtcblx0fVxuXG5cdCR1cGRhdGVFeGVjdXRpb24oaGFuZGxlOiBudW1iZXIsIGRhdGE6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPElDZWxsRXhlY3V0ZVVwZGF0ZUR0b1tdPik6IHZvaWQge1xuXHRcdGNvbnN0IHVwZGF0ZXMgPSBkYXRhLnZhbHVlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleGVjdXRpb24gPSB0aGlzLl9leGVjdXRpb25zLmdldChoYW5kbGUpO1xuXHRcdFx0ZXhlY3V0aW9uPy51cGRhdGUodXBkYXRlcy5tYXAoTm90ZWJvb2tEdG8uZnJvbUNlbGxFeGVjdXRlVXBkYXRlRHRvKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0fVxuXHR9XG5cblx0JGNvbXBsZXRlRXhlY3V0aW9uKGhhbmRsZTogbnVtYmVyLCBkYXRhOiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxJQ2VsbEV4ZWN1dGlvbkNvbXBsZXRlRHRvPik6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleGVjdXRpb24gPSB0aGlzLl9leGVjdXRpb25zLmdldChoYW5kbGUpO1xuXHRcdFx0ZXhlY3V0aW9uPy5jb21wbGV0ZShOb3RlYm9va0R0by5mcm9tQ2VsbEV4ZWN1dGVDb21wbGV0ZUR0byhkYXRhLnZhbHVlKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2V4ZWN1dGlvbnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIE5vdGVib29rIGV4ZWN1dGlvblxuXG5cdCRjcmVhdGVOb3RlYm9va0V4ZWN1dGlvbihoYW5kbGU6IG51bWJlciwgY29udHJvbGxlcklkOiBzdHJpbmcsIHJhd1VyaTogVXJpQ29tcG9uZW50cyk6IHZvaWQge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUocmF3VXJpKTtcblx0XHRjb25zdCBub3RlYm9vayA9IHRoaXMuX25vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbCh1cmkpO1xuXHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm90ZWJvb2sgbm90IGZvdW5kOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtlcm5lbCA9IHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChub3RlYm9vayk7XG5cdFx0aWYgKCFrZXJuZWwuc2VsZWN0ZWQgfHwga2VybmVsLnNlbGVjdGVkLmlkICE9PSBjb250cm9sbGVySWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgS2VybmVsIGlzIG5vdCBzZWxlY3RlZDogJHtrZXJuZWwuc2VsZWN0ZWQ/LmlkfSAhPT0gJHtjb250cm9sbGVySWR9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IHRoaXMuX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmNyZWF0ZUV4ZWN1dGlvbih1cmkpO1xuXHRcdGV4ZWN1dGlvbi5jb25maXJtKCk7XG5cdFx0dGhpcy5fbm90ZWJvb2tFeGVjdXRpb25zLnNldChoYW5kbGUsIGV4ZWN1dGlvbik7XG5cdH1cblxuXHQkYmVnaW5Ob3RlYm9va0V4ZWN1dGlvbihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleGVjdXRpb24gPSB0aGlzLl9ub3RlYm9va0V4ZWN1dGlvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0XHRleGVjdXRpb24/LmJlZ2luKCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0fVxuXHR9XG5cblx0JGNvbXBsZXRlTm90ZWJvb2tFeGVjdXRpb24oaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXhlY3V0aW9uID0gdGhpcy5fbm90ZWJvb2tFeGVjdXRpb25zLmdldChoYW5kbGUpO1xuXHRcdFx0ZXhlY3V0aW9uPy5jb21wbGV0ZSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0V4ZWN1dGlvbnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIG5vdGVib29rIGtlcm5lbCBkZXRlY3Rpb24gdGFza1xuXHRhc3luYyAkYWRkS2VybmVsRGV0ZWN0aW9uVGFzayhoYW5kbGU6IG51bWJlciwgbm90ZWJvb2tUeXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBrZXJuZWxEZXRlY3Rpb25UYXNrID0gbmV3IE1haW5UaHJlYWRLZXJuZWxEZXRlY3Rpb25UYXNrKG5vdGVib29rVHlwZSk7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLnJlZ2lzdGVyTm90ZWJvb2tLZXJuZWxEZXRlY3Rpb25UYXNrKGtlcm5lbERldGVjdGlvblRhc2spO1xuXHRcdHRoaXMuX2tlcm5lbERldGVjdGlvblRhc2tzLnNldChoYW5kbGUsIFtrZXJuZWxEZXRlY3Rpb25UYXNrLCByZWdpc3RyYXRpb25dKTtcblx0fVxuXG5cdCRyZW1vdmVLZXJuZWxEZXRlY3Rpb25UYXNrKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVwbGUgPSB0aGlzLl9rZXJuZWxEZXRlY3Rpb25UYXNrcy5nZXQoaGFuZGxlKTtcblx0XHRpZiAodHVwbGUpIHtcblx0XHRcdHR1cGxlWzFdLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2tlcm5lbERldGVjdGlvblRhc2tzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBub3RlYm9vayBrZXJuZWwgc291cmNlIGFjdGlvbiBwcm92aWRlclxuXG5cdGFzeW5jICRhZGRLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcihoYW5kbGU6IG51bWJlciwgZXZlbnRIYW5kbGU6IG51bWJlciwgbm90ZWJvb2tUeXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBrZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcjogSUtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0dmlld1R5cGU6IG5vdGVib29rVHlwZSxcblx0XHRcdHByb3ZpZGVLZXJuZWxTb3VyY2VBY3Rpb25zOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUtlcm5lbFNvdXJjZUFjdGlvbnMoaGFuZGxlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0XHRyZXR1cm4gYWN0aW9ucy5tYXAoYWN0aW9uID0+IHtcblx0XHRcdFx0XHRsZXQgZG9jdW1lbnRhdGlvbiA9IGFjdGlvbi5kb2N1bWVudGF0aW9uO1xuXHRcdFx0XHRcdGlmIChhY3Rpb24uZG9jdW1lbnRhdGlvbiAmJiB0eXBlb2YgYWN0aW9uLmRvY3VtZW50YXRpb24gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRkb2N1bWVudGF0aW9uID0gVVJJLnJldml2ZShhY3Rpb24uZG9jdW1lbnRhdGlvbik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxhYmVsOiBhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRjb21tYW5kOiBhY3Rpb24uY29tbWFuZCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBhY3Rpb24uZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGFjdGlvbi5kZXRhaWwsXG5cdFx0XHRcdFx0XHRkb2N1bWVudGF0aW9uLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAodHlwZW9mIGV2ZW50SGFuZGxlID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHR0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnNFdmVudFJlZ2lzdHJhdGlvbnMuc2V0KGV2ZW50SGFuZGxlLCBlbWl0dGVyKTtcblx0XHRcdGtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlU291cmNlQWN0aW9ucyA9IGVtaXR0ZXIuZXZlbnQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLnJlZ2lzdGVyS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIobm90ZWJvb2tUeXBlLCBrZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcik7XG5cdFx0dGhpcy5fa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzLnNldChoYW5kbGUsIFtrZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlciwgcmVnaXN0cmF0aW9uXSk7XG5cdH1cblxuXHQkcmVtb3ZlS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIGV2ZW50SGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0dXBsZSA9IHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAodHVwbGUpIHtcblx0XHRcdHR1cGxlWzFdLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBldmVudEhhbmRsZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyc0V2ZW50UmVnaXN0cmF0aW9ucy5kZWxldGUoZXZlbnRIYW5kbGUpO1xuXHRcdH1cblx0fVxuXG5cdCRlbWl0Tm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb25zQ2hhbmdlRXZlbnQoZXZlbnRIYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSB0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnNFdmVudFJlZ2lzdHJhdGlvbnMuZ2V0KGV2ZW50SGFuZGxlKTtcblx0XHRpZiAoZW1pdHRlciBpbnN0YW5jZW9mIEVtaXR0ZXIpIHtcblx0XHRcdGVtaXR0ZXIuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdCR2YXJpYWJsZXNVcGRhdGVkKG5vdGVib29rVXJpOiBVcmlDb21wb25lbnRzKTogdm9pZCB7XG5cdFx0dGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm5vdGlmeVZhcmlhYmxlc0NoYW5nZShVUkkucmV2aXZlKG5vdGVib29rVXJpKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGVBQWUsaUJBQThCLG9CQUFvQjtBQUMxRSxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTZDO0FBRXRELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQXFELHNDQUFzQztBQUMzRixTQUFpSCw4QkFBK0M7QUFFaEssU0FBUyxnQkFBb0gsbUJBQW1EO0FBQ2hMLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQStCLDZCQUE2QjtBQUU1RCxNQUFlLGlCQUE0QztBQUFBLEVBMEIxRCxZQUFZLE1BQW1DLGtCQUFvQztBQUFwQztBQXpCL0MsU0FBaUIsZUFBZSxJQUFJLFFBQW9DO0FBRXhFLFNBQVMsY0FBaUQsS0FBSyxhQUFhO0FBd0IzRSxTQUFLLEtBQUssS0FBSztBQUNmLFNBQUssV0FBVyxLQUFLO0FBQ3JCLFNBQUssWUFBWSxLQUFLO0FBRXRCLFNBQUssc0JBQXNCLEtBQUsscUJBQXFCO0FBQ3JELFNBQUssUUFBUSxLQUFLO0FBQ2xCLFNBQUssY0FBYyxLQUFLO0FBQ3hCLFNBQUssU0FBUyxLQUFLO0FBQ25CLFNBQUsscUJBQXFCLGdCQUFnQixLQUFLLGtCQUFrQixJQUFJLEtBQUsscUJBQXFCLGlCQUFpQix5QkFBeUI7QUFDekksU0FBSywyQkFBMkIsS0FBSywwQkFBMEI7QUFDL0QsU0FBSyxzQkFBc0IsS0FBSyx1QkFBdUI7QUFDdkQsU0FBSyxvQkFBb0IsSUFBSSxPQUFPLEtBQUssaUJBQWlCO0FBQzFELFNBQUssV0FBVyxLQUFLLFVBQVUsSUFBSSxRQUFNLEVBQUUsS0FBSyxJQUFJLE9BQU8sRUFBRSxHQUFHLEdBQUcsVUFBVSxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUM7QUFBQSxFQUNqRztBQUFBLEVBdEJBLElBQVcsY0FBYztBQUN4QixXQUFPLEtBQUssU0FBUyxJQUFJLE9BQUssRUFBRSxHQUFHO0FBQUEsRUFDcEM7QUFBQSxFQUVBLElBQVcsa0JBQWtCO0FBQzVCLFdBQU8sS0FBSyxTQUFTLFFBQVEsT0FBSyxFQUFFLFFBQVE7QUFBQSxFQUM3QztBQUFBLEVBbUJBLE9BQU8sTUFBb0M7QUFFMUMsVUFBTSxRQUFvQyx1QkFBTyxPQUFPLElBQUk7QUFDNUQsUUFBSSxLQUFLLFVBQVUsUUFBVztBQUM3QixXQUFLLFFBQVEsS0FBSztBQUNsQixZQUFNLFFBQVE7QUFBQSxJQUNmO0FBQ0EsUUFBSSxLQUFLLGdCQUFnQixRQUFXO0FBQ25DLFdBQUssY0FBYyxLQUFLO0FBQ3hCLFlBQU0sY0FBYztBQUFBLElBQ3JCO0FBQ0EsUUFBSSxLQUFLLFdBQVcsUUFBVztBQUM5QixXQUFLLFNBQVMsS0FBSztBQUNuQixZQUFNLFNBQVM7QUFBQSxJQUNoQjtBQUNBLFFBQUksS0FBSyx1QkFBdUIsUUFBVztBQUMxQyxXQUFLLHFCQUFxQixnQkFBZ0IsS0FBSyxrQkFBa0IsSUFBSSxLQUFLLHFCQUFxQixLQUFLLGlCQUFpQix5QkFBeUI7QUFDOUksWUFBTSxxQkFBcUI7QUFBQSxJQUM1QjtBQUNBLFFBQUksS0FBSywyQkFBMkIsUUFBVztBQUM5QyxXQUFLLDJCQUEyQixLQUFLO0FBQ3JDLFlBQU0sb0JBQW9CO0FBQUEsSUFDM0I7QUFDQSxRQUFJLEtBQUssc0JBQXNCLFFBQVc7QUFDekMsV0FBSyxzQkFBc0IsS0FBSztBQUNoQyxZQUFNLHNCQUFzQjtBQUFBLElBQzdCO0FBQ0EsUUFBSSxLQUFLLHdCQUF3QixRQUFXO0FBQzNDLFdBQUssc0JBQXNCLEtBQUs7QUFDaEMsWUFBTSxzQkFBc0I7QUFBQSxJQUM3QjtBQUNBLFNBQUssYUFBYSxLQUFLLEtBQUs7QUFBQSxFQUM3QjtBQUtEO0FBRUEsTUFBTSw4QkFBc0U7QUFBQSxFQUMzRSxZQUFxQixjQUFzQjtBQUF0QjtBQUFBLEVBQXdCO0FBQzlDO0FBR08sSUFBTSw0QkFBTixNQUEwRTtBQUFBLEVBZWhGLFlBQ0MsZ0JBQ21DLGtCQUNNLHdCQUNRLGdDQUNkLGtCQUNYLHVCQUN2QjtBQUxrQztBQUNNO0FBQ1E7QUFDZDtBQWxCcEMsU0FBaUIsV0FBVyxJQUFJLGNBQStCO0FBQy9ELFNBQWlCLGVBQWUsSUFBSSxnQkFBZ0I7QUFFcEQsU0FBaUIsV0FBVyxvQkFBSSxJQUFrRTtBQUNsRyxTQUFpQix3QkFBd0Isb0JBQUksSUFBNkU7QUFDMUgsU0FBaUIsK0JBQStCLG9CQUFJLElBQStFO0FBQ25JLFNBQWlCLGlEQUFpRCxvQkFBSSxJQUF5QjtBQUkvRixTQUFpQixjQUFjLG9CQUFJLElBQW9DO0FBQ3ZFLFNBQWlCLHNCQUFzQixvQkFBSSxJQUFnQztBQXdHM0UsU0FBUSx1QkFBdUI7QUFDL0IsU0FBUSxxQkFBcUIsb0JBQUksSUFBbUQ7QUEvRm5GLFNBQUssU0FBUyxlQUFlLFNBQVMsZUFBZSxzQkFBc0I7QUFFM0UsMEJBQXNCLG9CQUFvQixFQUFFLFFBQVEsS0FBSyxjQUFjLElBQUk7QUFDM0UsMEJBQXNCLHVCQUF1QixLQUFLLGNBQWMsTUFBTSxLQUFLLFlBQVk7QUFDdkYsMEJBQXNCLDBCQUEwQixLQUFLLGlCQUFpQixNQUFNLEtBQUssWUFBWTtBQUU3RixTQUFLLGFBQWEsSUFBSSxhQUFhLE1BQU07QUFFeEMsV0FBSyxZQUFZLFFBQVEsT0FBSztBQUM3QixVQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQUEsTUFDZCxDQUFDO0FBQ0QsV0FBSyxvQkFBb0IsUUFBUSxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBQUEsSUFDbkQsQ0FBQyxDQUFDO0FBRUYsU0FBSyxhQUFhLElBQUksS0FBSyx1QkFBdUIsNkJBQTZCLE9BQUs7QUFDbkYsaUJBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTyxDQUFDLEtBQUssS0FBSyxVQUFVO0FBQ2hELFlBQUksRUFBRSxjQUFjLE9BQU8sSUFBSTtBQUM5QixlQUFLLE9BQU8sMkJBQTJCLFFBQVEsRUFBRSxVQUFVLEtBQUs7QUFBQSxRQUNqRSxXQUFXLEVBQUUsY0FBYyxPQUFPLElBQUk7QUFDckMsZUFBSyxPQUFPLDJCQUEyQixRQUFRLEVBQUUsVUFBVSxJQUFJO0FBQUEsUUFDaEU7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssYUFBYSxRQUFRO0FBQzFCLGVBQVcsQ0FBQyxFQUFFLFlBQVksS0FBSyxLQUFLLFNBQVMsT0FBTyxHQUFHO0FBQ3RELG1CQUFhLFFBQVE7QUFBQSxJQUN0QjtBQUNBLGVBQVcsQ0FBQyxFQUFFLFlBQVksS0FBSyxLQUFLLHNCQUFzQixPQUFPLEdBQUc7QUFDbkUsbUJBQWEsUUFBUTtBQUFBLElBQ3RCO0FBQ0EsZUFBVyxDQUFDLEVBQUUsWUFBWSxLQUFLLEtBQUssNkJBQTZCLE9BQU8sR0FBRztBQUMxRSxtQkFBYSxRQUFRO0FBQUEsSUFDdEI7QUFDQSxTQUFLLFNBQVMsUUFBUTtBQUFBLEVBQ3ZCO0FBQUE7QUFBQSxFQUlRLGFBQWEsUUFBeUI7QUFFN0MsVUFBTSxjQUFjLE9BQU8sb0JBQW9CLE9BQUs7QUFDbkQsVUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsTUFDRDtBQUNBLFlBQU0sRUFBRSxTQUFTLElBQUksS0FBSyx1QkFBdUIsa0JBQWtCLE9BQU8sU0FBUztBQUNuRixVQUFJLENBQUMsVUFBVTtBQUNkO0FBQUEsTUFDRDtBQUNBLGlCQUFXLENBQUMsUUFBUSxTQUFTLEtBQUssS0FBSyxVQUFVO0FBQ2hELFlBQUksVUFBVSxDQUFDLE1BQU0sVUFBVTtBQUM5QixlQUFLLE9BQU8saUNBQWlDLFFBQVEsT0FBTyxNQUFNLEdBQUcsRUFBRSxPQUFPO0FBQzlFO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLFNBQVMsSUFBSSxRQUFRLFdBQVc7QUFBQSxFQUN0QztBQUFBLEVBRVEsZ0JBQWdCLFFBQXlCO0FBQ2hELFNBQUssU0FBUyxpQkFBaUIsTUFBTTtBQUFBLEVBQ3RDO0FBQUEsRUFFQSxNQUFNLGFBQWEsUUFBZ0IsVUFBOEIsU0FBb0M7QUFDcEcsVUFBTSxRQUFRLEtBQUssU0FBUyxJQUFJLE1BQU07QUFDdEMsUUFBSSxDQUFDLE9BQU87QUFDWCxZQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxJQUMxQztBQUNBLFVBQU0sQ0FBQyxNQUFNLElBQUk7QUFDakIsUUFBSSxVQUFVO0FBQ2QsZUFBVyxDQUFDLE1BQU0sS0FBSyxLQUFLLFVBQVU7QUFDckMsVUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsTUFDRDtBQUNBLFVBQUksS0FBSyx1QkFBdUIsa0JBQWtCLE9BQU8sU0FBUyxFQUFFLGFBQWEsUUFBUTtBQUV4RjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLGFBQWEsUUFBVztBQUUzQixlQUFPLFlBQVksT0FBTztBQUMxQixrQkFBVTtBQUFBLE1BQ1gsV0FBVyxPQUFPLE1BQU0sTUFBTSxVQUFVO0FBRXZDLGVBQU8sWUFBWSxPQUFPO0FBQzFCLGtCQUFVO0FBQ1Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFJQSxpQkFBaUIsV0FBbUIsVUFBMkI7QUFDOUQsVUFBTSxVQUFVLEtBQUssbUJBQW1CLElBQUksU0FBUztBQUNyRCxRQUFJLFNBQVM7QUFDWixjQUFRLFFBQVEsUUFBUTtBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFJQSxNQUFNLFdBQVcsUUFBZ0IsTUFBMEM7QUFDMUUsVUFBTSxPQUFPO0FBQ2IsVUFBTSxTQUFTLElBQUksY0FBYyxpQkFBaUI7QUFBQSxNQUNqRCxNQUFNLDRCQUE0QixLQUFVLFNBQWtDO0FBQzdFLGNBQU0sS0FBSyxPQUFPLGNBQWMsUUFBUSxLQUFLLE9BQU87QUFBQSxNQUNyRDtBQUFBLE1BQ0EsTUFBTSw0QkFBNEIsS0FBVSxTQUFrQztBQUM3RSxjQUFNLEtBQUssT0FBTyxhQUFhLFFBQVEsS0FBSyxPQUFPO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLGlCQUFpQixhQUFrQixVQUE4QixNQUEyQixPQUFlLE9BQWtFO0FBQzVLLGNBQU0sWUFBWSxHQUFHLE1BQU0sWUFBWSxLQUFLLHNCQUFzQjtBQUVsRSxlQUFPLElBQUksc0JBQXVDLE9BQU0sWUFBVztBQUNsRSxlQUFLLG1CQUFtQixJQUFJLFdBQVcsT0FBTztBQUU5QyxjQUFJO0FBQ0gsa0JBQU0sS0FBSyxPQUFPLGtCQUFrQixRQUFRLFdBQVcsYUFBYSxVQUFVLE1BQU0sT0FBTyxLQUFLO0FBQUEsVUFDakcsVUFBRTtBQUNELGlCQUFLLG1CQUFtQixPQUFPLFNBQVM7QUFBQSxVQUN6QztBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELEVBQUUsTUFBTSxLQUFLLGdCQUFnQjtBQUU3QixVQUFNLGNBQWMsS0FBSyxhQUFhLElBQUksSUFBSSxnQkFBZ0IsQ0FBQztBQUUvRCxTQUFLLFNBQVMsSUFBSSxRQUFRLENBQUMsUUFBUSxXQUFXLENBQUM7QUFDL0MsZ0JBQVksSUFBSSxLQUFLLHVCQUF1QixlQUFlLE1BQU0sQ0FBQztBQUFBLEVBQ25FO0FBQUEsRUFFQSxjQUFjLFFBQWdCLE1BQTBDO0FBQ3ZFLFVBQU0sUUFBUSxLQUFLLFNBQVMsSUFBSSxNQUFNO0FBQ3RDLFFBQUksT0FBTztBQUNWLFlBQU0sQ0FBQyxFQUFFLE9BQU8sSUFBSTtBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUFBLEVBRUEsY0FBYyxRQUFzQjtBQUNuQyxVQUFNLFFBQVEsS0FBSyxTQUFTLElBQUksTUFBTTtBQUN0QyxRQUFJLE9BQU87QUFDVixZQUFNLENBQUMsRUFBRSxRQUFRO0FBQ2pCLFdBQUssU0FBUyxPQUFPLE1BQU07QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHdCQUF3QixRQUFnQixVQUF5QixPQUFpQztBQUNqRyxVQUFNLFFBQVEsS0FBSyxTQUFTLElBQUksTUFBTTtBQUN0QyxRQUFJLE9BQU87QUFDVixXQUFLLHVCQUF1Qiw2QkFBNkIsTUFBTSxDQUFDLEdBQUcsSUFBSSxPQUFPLFFBQVEsR0FBRyxLQUFLO0FBQUEsSUFDL0Y7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUlBLGlCQUFpQixRQUFnQixjQUFzQixRQUF1QixZQUEwQjtBQUN2RyxVQUFNLE1BQU0sSUFBSSxPQUFPLE1BQU07QUFDN0IsVUFBTSxXQUFXLEtBQUssaUJBQWlCLHFCQUFxQixHQUFHO0FBQy9ELFFBQUksQ0FBQyxVQUFVO0FBQ2QsWUFBTSxJQUFJLE1BQU0sdUJBQXVCLElBQUksU0FBUyxDQUFDLEVBQUU7QUFBQSxJQUN4RDtBQUVBLFVBQU0sU0FBUyxLQUFLLHVCQUF1QixrQkFBa0IsUUFBUTtBQUNyRSxRQUFJLENBQUMsT0FBTyxZQUFZLE9BQU8sU0FBUyxPQUFPLGNBQWM7QUFDNUQsWUFBTSxJQUFJLE1BQU0sMkJBQTJCLE9BQU8sVUFBVSxFQUFFLFFBQVEsWUFBWSxFQUFFO0FBQUEsSUFDckY7QUFDQSxVQUFNLFlBQVksS0FBSywrQkFBK0Isb0JBQW9CLEtBQUssVUFBVTtBQUN6RixjQUFVLFFBQVE7QUFDbEIsU0FBSyxZQUFZLElBQUksUUFBUSxTQUFTO0FBQUEsRUFDdkM7QUFBQSxFQUVBLGlCQUFpQixRQUFnQixNQUFvRTtBQUNwRyxVQUFNLFVBQVUsS0FBSztBQUNyQixRQUFJO0FBQ0gsWUFBTSxZQUFZLEtBQUssWUFBWSxJQUFJLE1BQU07QUFDN0MsaUJBQVcsT0FBTyxRQUFRLElBQUksWUFBWSx3QkFBd0IsQ0FBQztBQUFBLElBQ3BFLFNBQVMsR0FBRztBQUNYLHdCQUFrQixDQUFDO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxtQkFBbUIsUUFBZ0IsTUFBc0U7QUFDeEcsUUFBSTtBQUNILFlBQU0sWUFBWSxLQUFLLFlBQVksSUFBSSxNQUFNO0FBQzdDLGlCQUFXLFNBQVMsWUFBWSwyQkFBMkIsS0FBSyxLQUFLLENBQUM7QUFBQSxJQUN2RSxTQUFTLEdBQUc7QUFDWCx3QkFBa0IsQ0FBQztBQUFBLElBQ3BCLFVBQUU7QUFDRCxXQUFLLFlBQVksT0FBTyxNQUFNO0FBQUEsSUFDL0I7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUlBLHlCQUF5QixRQUFnQixjQUFzQixRQUE2QjtBQUMzRixVQUFNLE1BQU0sSUFBSSxPQUFPLE1BQU07QUFDN0IsVUFBTSxXQUFXLEtBQUssaUJBQWlCLHFCQUFxQixHQUFHO0FBQy9ELFFBQUksQ0FBQyxVQUFVO0FBQ2QsWUFBTSxJQUFJLE1BQU0sdUJBQXVCLElBQUksU0FBUyxDQUFDLEVBQUU7QUFBQSxJQUN4RDtBQUVBLFVBQU0sU0FBUyxLQUFLLHVCQUF1QixrQkFBa0IsUUFBUTtBQUNyRSxRQUFJLENBQUMsT0FBTyxZQUFZLE9BQU8sU0FBUyxPQUFPLGNBQWM7QUFDNUQsWUFBTSxJQUFJLE1BQU0sMkJBQTJCLE9BQU8sVUFBVSxFQUFFLFFBQVEsWUFBWSxFQUFFO0FBQUEsSUFDckY7QUFDQSxVQUFNLFlBQVksS0FBSywrQkFBK0IsZ0JBQWdCLEdBQUc7QUFDekUsY0FBVSxRQUFRO0FBQ2xCLFNBQUssb0JBQW9CLElBQUksUUFBUSxTQUFTO0FBQUEsRUFDL0M7QUFBQSxFQUVBLHdCQUF3QixRQUFzQjtBQUM3QyxRQUFJO0FBQ0gsWUFBTSxZQUFZLEtBQUssb0JBQW9CLElBQUksTUFBTTtBQUNyRCxpQkFBVyxNQUFNO0FBQUEsSUFDbEIsU0FBUyxHQUFHO0FBQ1gsd0JBQWtCLENBQUM7QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLDJCQUEyQixRQUFzQjtBQUNoRCxRQUFJO0FBQ0gsWUFBTSxZQUFZLEtBQUssb0JBQW9CLElBQUksTUFBTTtBQUNyRCxpQkFBVyxTQUFTO0FBQUEsSUFDckIsU0FBUyxHQUFHO0FBQ1gsd0JBQWtCLENBQUM7QUFBQSxJQUNwQixVQUFFO0FBQ0QsV0FBSyxvQkFBb0IsT0FBTyxNQUFNO0FBQUEsSUFDdkM7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdBLE1BQU0sd0JBQXdCLFFBQWdCLGNBQXFDO0FBQ2xGLFVBQU0sc0JBQXNCLElBQUksOEJBQThCLFlBQVk7QUFDMUUsVUFBTSxlQUFlLEtBQUssdUJBQXVCLG9DQUFvQyxtQkFBbUI7QUFDeEcsU0FBSyxzQkFBc0IsSUFBSSxRQUFRLENBQUMscUJBQXFCLFlBQVksQ0FBQztBQUFBLEVBQzNFO0FBQUEsRUFFQSwyQkFBMkIsUUFBc0I7QUFDaEQsVUFBTSxRQUFRLEtBQUssc0JBQXNCLElBQUksTUFBTTtBQUNuRCxRQUFJLE9BQU87QUFDVixZQUFNLENBQUMsRUFBRSxRQUFRO0FBQ2pCLFdBQUssc0JBQXNCLE9BQU8sTUFBTTtBQUFBLElBQ3pDO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFJQSxNQUFNLCtCQUErQixRQUFnQixhQUFxQixjQUFxQztBQUM5RyxVQUFNLDZCQUEwRDtBQUFBLE1BQy9ELFVBQVU7QUFBQSxNQUNWLDRCQUE0QixZQUFZO0FBQ3ZDLGNBQU0sVUFBVSxNQUFNLEtBQUssT0FBTyw0QkFBNEIsUUFBUSxrQkFBa0IsSUFBSTtBQUU1RixlQUFPLFFBQVEsSUFBSSxZQUFVO0FBQzVCLGNBQUksZ0JBQWdCLE9BQU87QUFDM0IsY0FBSSxPQUFPLGlCQUFpQixPQUFPLE9BQU8sa0JBQWtCLFVBQVU7QUFDckUsNEJBQWdCLElBQUksT0FBTyxPQUFPLGFBQWE7QUFBQSxVQUNoRDtBQUVBLGlCQUFPO0FBQUEsWUFDTixPQUFPLE9BQU87QUFBQSxZQUNkLFNBQVMsT0FBTztBQUFBLFlBQ2hCLGFBQWEsT0FBTztBQUFBLFlBQ3BCLFFBQVEsT0FBTztBQUFBLFlBQ2Y7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFFQSxRQUFJLE9BQU8sZ0JBQWdCLFVBQVU7QUFDcEMsWUFBTSxVQUFVLElBQUksUUFBYztBQUNsQyxXQUFLLCtDQUErQyxJQUFJLGFBQWEsT0FBTztBQUM1RSxpQ0FBMkIsMkJBQTJCLFFBQVE7QUFBQSxJQUMvRDtBQUVBLFVBQU0sZUFBZSxLQUFLLHVCQUF1QixtQ0FBbUMsY0FBYywwQkFBMEI7QUFDNUgsU0FBSyw2QkFBNkIsSUFBSSxRQUFRLENBQUMsNEJBQTRCLFlBQVksQ0FBQztBQUFBLEVBQ3pGO0FBQUEsRUFFQSxrQ0FBa0MsUUFBZ0IsYUFBMkI7QUFDNUUsVUFBTSxRQUFRLEtBQUssNkJBQTZCLElBQUksTUFBTTtBQUMxRCxRQUFJLE9BQU87QUFDVixZQUFNLENBQUMsRUFBRSxRQUFRO0FBQ2pCLFdBQUssNkJBQTZCLE9BQU8sTUFBTTtBQUFBLElBQ2hEO0FBQ0EsUUFBSSxPQUFPLGdCQUFnQixVQUFVO0FBQ3BDLFdBQUssK0NBQStDLE9BQU8sV0FBVztBQUFBLElBQ3ZFO0FBQUEsRUFDRDtBQUFBLEVBRUEsNENBQTRDLGFBQTJCO0FBQ3RFLFVBQU0sVUFBVSxLQUFLLCtDQUErQyxJQUFJLFdBQVc7QUFDbkYsUUFBSSxtQkFBbUIsU0FBUztBQUMvQixjQUFRLEtBQUssTUFBUztBQUFBLElBQ3ZCO0FBQUEsRUFDRDtBQUFBLEVBRUEsa0JBQWtCLGFBQWtDO0FBQ25ELFNBQUssdUJBQXVCLHNCQUFzQixJQUFJLE9BQU8sV0FBVyxDQUFDO0FBQUEsRUFDMUU7QUFDRDtBQXhVYSw0QkFBTjtBQUFBLEVBRE4scUJBQXFCLFlBQVkseUJBQXlCO0FBQUEsRUFrQnhEO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBckJVOyIsCiAgIm5hbWVzIjogW10KfQo=
