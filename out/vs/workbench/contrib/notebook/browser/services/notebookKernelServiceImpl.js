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
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { LRUCache, ResourceMap } from "../../../../../base/common/map.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { URI } from "../../../../../base/common/uri.js";
import { INotebookService } from "../../common/notebookService.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MarshalledId } from "../../../../../base/common/marshallingIds.js";
import { Schemas } from "../../../../../base/common/network.js";
import { getActiveWindow, runWhenWindowIdle } from "../../../../../base/browser/dom.js";
const _KernelInfo = class _KernelInfo {
  constructor(kernel) {
    this.notebookPriorities = new ResourceMap();
    this.kernel = kernel;
    this.score = -1;
    this.time = _KernelInfo._logicClock++;
  }
};
_KernelInfo._logicClock = 0;
let KernelInfo = _KernelInfo;
class NotebookTextModelLikeId {
  static str(k) {
    return `${k.notebookType}/${k.uri.toString()}`;
  }
  static obj(s) {
    const idx = s.indexOf("/");
    return {
      notebookType: s.substring(0, idx),
      uri: URI.parse(s.substring(idx + 1))
    };
  }
}
class SourceAction extends Disposable {
  constructor(action, model, isPrimary) {
    super();
    this.action = action;
    this.model = model;
    this.isPrimary = isPrimary;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
  }
  async runAction() {
    if (this.execution) {
      return this.execution;
    }
    this.execution = this._runAction();
    this._onDidChangeState.fire();
    await this.execution;
    this.execution = void 0;
    this._onDidChangeState.fire();
  }
  async _runAction() {
    try {
      await this.action.run({
        uri: this.model.uri,
        $mid: MarshalledId.NotebookActionContext
      });
    } catch (error) {
      console.warn(`Kernel source command failed: ${error}`);
    }
  }
}
let NotebookKernelService = class extends Disposable {
  constructor(_notebookService, _storageService, _menuService, _contextKeyService) {
    super();
    this._notebookService = _notebookService;
    this._storageService = _storageService;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._kernels = /* @__PURE__ */ new Map();
    this._notebookBindings = new LRUCache(1e3, 0.7);
    this._onDidChangeNotebookKernelBinding = this._register(new Emitter());
    this._onDidAddKernel = this._register(new Emitter());
    this._onDidRemoveKernel = this._register(new Emitter());
    this._onDidChangeNotebookAffinity = this._register(new Emitter());
    this._onDidChangeSourceActions = this._register(new Emitter());
    this._onDidNotebookVariablesChange = this._register(new Emitter());
    this._kernelSources = /* @__PURE__ */ new Map();
    this._kernelSourceActionsUpdates = /* @__PURE__ */ new Map();
    this._kernelDetectionTasks = /* @__PURE__ */ new Map();
    this._onDidChangeKernelDetectionTasks = this._register(new Emitter());
    this._kernelSourceActionProviders = /* @__PURE__ */ new Map();
    this.onDidChangeSelectedNotebooks = this._onDidChangeNotebookKernelBinding.event;
    this.onDidAddKernel = this._onDidAddKernel.event;
    this.onDidRemoveKernel = this._onDidRemoveKernel.event;
    this.onDidChangeNotebookAffinity = this._onDidChangeNotebookAffinity.event;
    this.onDidChangeSourceActions = this._onDidChangeSourceActions.event;
    this.onDidChangeKernelDetectionTasks = this._onDidChangeKernelDetectionTasks.event;
    this.onDidNotebookVariablesUpdate = this._onDidNotebookVariablesChange.event;
    this._register(_notebookService.onDidAddNotebookDocument(this._tryAutoBindNotebook, this));
    this._register(_notebookService.onWillRemoveNotebookDocument((notebook) => {
      const id = NotebookTextModelLikeId.str(notebook);
      const kernelId = this._notebookBindings.get(id);
      if (kernelId && notebook.uri.scheme === Schemas.untitled) {
        this.selectKernelForNotebook(void 0, notebook);
      }
      this._kernelSourceActionsUpdates.get(id)?.dispose();
      this._kernelSourceActionsUpdates.delete(id);
    }));
    try {
      const data = JSON.parse(this._storageService.get(NotebookKernelService._storageNotebookBinding, StorageScope.WORKSPACE, "[]"));
      this._notebookBindings.fromJSON(data);
    } catch {
    }
  }
  dispose() {
    this._kernels.clear();
    this._kernelSources.forEach((v) => {
      v.menu.dispose();
      v.actions.forEach((a) => a[1].dispose());
    });
    this._kernelSourceActionsUpdates.forEach((v) => {
      v.dispose();
    });
    this._kernelSourceActionsUpdates.clear();
    super.dispose();
  }
  _persistMementos() {
    this._persistSoonHandle?.dispose();
    this._persistSoonHandle = runWhenWindowIdle(getActiveWindow(), () => {
      this._storageService.store(NotebookKernelService._storageNotebookBinding, JSON.stringify(this._notebookBindings), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }, 100);
  }
  static _score(kernel, notebook) {
    if (kernel.viewType === "*") {
      return 5;
    } else if (kernel.viewType === notebook.notebookType) {
      return 10;
    } else {
      return 0;
    }
  }
  _tryAutoBindNotebook(notebook, onlyThisKernel) {
    const id = this._notebookBindings.get(NotebookTextModelLikeId.str(notebook));
    if (!id) {
      return;
    }
    const existingKernel = this._kernels.get(id);
    if (!existingKernel || !NotebookKernelService._score(existingKernel.kernel, notebook)) {
      return;
    }
    if (!onlyThisKernel || existingKernel.kernel === onlyThisKernel) {
      this._onDidChangeNotebookKernelBinding.fire({ notebook: notebook.uri, oldKernel: void 0, newKernel: existingKernel.kernel.id });
    }
  }
  notifyVariablesChange(notebookUri) {
    this._onDidNotebookVariablesChange.fire(notebookUri);
  }
  registerKernel(kernel) {
    if (this._kernels.has(kernel.id)) {
      throw new Error(`NOTEBOOK CONTROLLER with id '${kernel.id}' already exists`);
    }
    this._kernels.set(kernel.id, new KernelInfo(kernel));
    this._onDidAddKernel.fire(kernel);
    for (const notebook of this._notebookService.getNotebookTextModels()) {
      this._tryAutoBindNotebook(notebook, kernel);
    }
    return toDisposable(() => {
      if (this._kernels.delete(kernel.id)) {
        this._onDidRemoveKernel.fire(kernel);
      }
      for (const [key, candidate] of Array.from(this._notebookBindings)) {
        if (candidate === kernel.id) {
          this._onDidChangeNotebookKernelBinding.fire({ notebook: NotebookTextModelLikeId.obj(key).uri, oldKernel: kernel.id, newKernel: void 0 });
        }
      }
    });
  }
  getMatchingKernel(notebook) {
    const kernels = [];
    for (const info of this._kernels.values()) {
      const score = NotebookKernelService._score(info.kernel, notebook);
      if (score) {
        kernels.push({
          score,
          kernel: info.kernel,
          instanceAffinity: info.notebookPriorities.get(notebook.uri) ?? 1
        });
      }
    }
    kernels.sort((a, b) => b.instanceAffinity - a.instanceAffinity || a.score - b.score || a.kernel.label.localeCompare(b.kernel.label));
    const all = kernels.map((obj) => obj.kernel);
    const selectedId = this._notebookBindings.get(NotebookTextModelLikeId.str(notebook));
    const selected = selectedId ? this._kernels.get(selectedId)?.kernel : void 0;
    const suggestions = kernels.filter((item) => item.instanceAffinity > 1).map((item) => item.kernel);
    const hidden = kernels.filter((item) => item.instanceAffinity < 0).map((item) => item.kernel);
    return { all, selected, suggestions, hidden };
  }
  getSelectedOrSuggestedKernel(notebook) {
    const info = this.getMatchingKernel(notebook);
    if (info.selected) {
      return info.selected;
    }
    const preferred = info.all.filter(
      (kernel) => this._kernels.get(kernel.id)?.notebookPriorities.get(notebook.uri) === 2
      /* vscode.NotebookControllerPriority.Preferred */
    );
    if (preferred.length === 1) {
      return preferred[0];
    }
    return info.all.length === 1 ? info.all[0] : void 0;
  }
  // a notebook has one kernel, a kernel has N notebooks
  // notebook <-1----N-> kernel
  selectKernelForNotebook(kernel, notebook) {
    const key = NotebookTextModelLikeId.str(notebook);
    const oldKernel = this._notebookBindings.get(key);
    if (oldKernel !== kernel?.id) {
      if (kernel) {
        this._notebookBindings.set(key, kernel.id);
      } else {
        this._notebookBindings.delete(key);
      }
      this._onDidChangeNotebookKernelBinding.fire({ notebook: notebook.uri, oldKernel, newKernel: kernel?.id });
      this._persistMementos();
    }
  }
  preselectKernelForNotebook(kernel, notebook) {
    const key = NotebookTextModelLikeId.str(notebook);
    const oldKernel = this._notebookBindings.get(key);
    if (oldKernel !== kernel?.id) {
      this._notebookBindings.set(key, kernel.id);
      this._persistMementos();
    }
  }
  updateKernelNotebookAffinity(kernel, notebook, preference) {
    const info = this._kernels.get(kernel.id);
    if (!info) {
      throw new Error(`UNKNOWN kernel '${kernel.id}'`);
    }
    if (preference === void 0) {
      info.notebookPriorities.delete(notebook);
    } else {
      info.notebookPriorities.set(notebook, preference);
    }
    this._onDidChangeNotebookAffinity.fire();
  }
  getRunningSourceActions(notebook) {
    const id = NotebookTextModelLikeId.str(notebook);
    const existingInfo = this._kernelSources.get(id);
    if (existingInfo) {
      return existingInfo.actions.filter((action) => action[0].execution).map((action) => action[0]);
    }
    return [];
  }
  getSourceActions(notebook, contextKeyService) {
    contextKeyService = contextKeyService ?? this._contextKeyService;
    const id = NotebookTextModelLikeId.str(notebook);
    const existingInfo = this._kernelSources.get(id);
    if (existingInfo) {
      return existingInfo.actions.map((a) => a[0]);
    }
    const sourceMenu = this._register(this._menuService.createMenu(MenuId.NotebookKernelSource, contextKeyService));
    const info = { menu: sourceMenu, actions: [] };
    const loadActionsFromMenu = (menu, document) => {
      const groups = menu.getActions({ shouldForwardArgs: true });
      const sourceActions = [];
      groups.forEach((group) => {
        const isPrimary = /^primary/.test(group[0]);
        group[1].forEach((action) => {
          const sourceAction = new SourceAction(action, document, isPrimary);
          const stateChangeListener = sourceAction.onDidChangeState(() => {
            this._onDidChangeSourceActions.fire({
              notebook: document.uri,
              viewType: document.notebookType
            });
          });
          sourceActions.push([sourceAction, stateChangeListener]);
        });
      });
      info.actions = sourceActions;
      this._kernelSources.set(id, info);
      this._onDidChangeSourceActions.fire({ notebook: document.uri, viewType: document.notebookType });
    };
    this._kernelSourceActionsUpdates.get(id)?.dispose();
    this._kernelSourceActionsUpdates.set(id, sourceMenu.onDidChange(() => {
      loadActionsFromMenu(sourceMenu, notebook);
    }));
    loadActionsFromMenu(sourceMenu, notebook);
    return info.actions.map((a) => a[0]);
  }
  registerNotebookKernelDetectionTask(task) {
    const notebookType = task.notebookType;
    const all = this._kernelDetectionTasks.get(notebookType) ?? [];
    all.push(task);
    this._kernelDetectionTasks.set(notebookType, all);
    this._onDidChangeKernelDetectionTasks.fire(notebookType);
    return toDisposable(() => {
      const all2 = this._kernelDetectionTasks.get(notebookType) ?? [];
      const idx = all2.indexOf(task);
      if (idx >= 0) {
        all2.splice(idx, 1);
        this._kernelDetectionTasks.set(notebookType, all2);
        this._onDidChangeKernelDetectionTasks.fire(notebookType);
      }
    });
  }
  getKernelDetectionTasks(notebook) {
    return this._kernelDetectionTasks.get(notebook.notebookType) ?? [];
  }
  registerKernelSourceActionProvider(viewType, provider) {
    const providers = this._kernelSourceActionProviders.get(viewType) ?? [];
    providers.push(provider);
    this._kernelSourceActionProviders.set(viewType, providers);
    this._onDidChangeSourceActions.fire({ viewType });
    const eventEmitterDisposable = provider.onDidChangeSourceActions?.(() => {
      this._onDidChangeSourceActions.fire({ viewType });
    });
    return toDisposable(() => {
      const providers2 = this._kernelSourceActionProviders.get(viewType) ?? [];
      const idx = providers2.indexOf(provider);
      if (idx >= 0) {
        providers2.splice(idx, 1);
        this._kernelSourceActionProviders.set(viewType, providers2);
      }
      eventEmitterDisposable?.dispose();
    });
  }
  /**
   * Get kernel source actions from providers
   */
  getKernelSourceActions2(notebook) {
    const viewType = notebook.notebookType;
    const providers = this._kernelSourceActionProviders.get(viewType) ?? [];
    const promises = providers.map((provider) => provider.provideKernelSourceActions());
    return Promise.all(promises).then((actions) => {
      return actions.reduce((a, b) => a.concat(b), []);
    });
  }
};
NotebookKernelService._storageNotebookBinding = "notebook.controller2NotebookBindings";
NotebookKernelService = __decorateClass([
  __decorateParam(0, INotebookService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IMenuService),
  __decorateParam(3, IContextKeyService)
], NotebookKernelService);
export {
  NotebookKernelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxzZXJ2aWNlc1xcbm90ZWJvb2tLZXJuZWxTZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb24sIElOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWwsIElTZWxlY3RlZE5vdGVib29rc0NoYW5nZUV2ZW50LCBJTm90ZWJvb2tLZXJuZWxNYXRjaFJlc3VsdCwgSU5vdGVib29rS2VybmVsU2VydmljZSwgSU5vdGVib29rVGV4dE1vZGVsTGlrZSwgSVNvdXJjZUFjdGlvbiwgSU5vdGVib29rU291cmNlQWN0aW9uQ2hhbmdlRXZlbnQsIElOb3RlYm9va0tlcm5lbERldGVjdGlvblRhc2ssIElLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUsIFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGdldEFjdGl2ZVdpbmRvdywgcnVuV2hlbldpbmRvd0lkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcblxuY2xhc3MgS2VybmVsSW5mbyB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2xvZ2ljQ2xvY2sgPSAwO1xuXG5cdHJlYWRvbmx5IGtlcm5lbDogSU5vdGVib29rS2VybmVsO1xuXHRwdWJsaWMgc2NvcmU6IG51bWJlcjtcblx0cmVhZG9ubHkgdGltZTogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IG5vdGVib29rUHJpb3JpdGllcyA9IG5ldyBSZXNvdXJjZU1hcDxudW1iZXI+KCk7XG5cblx0Y29uc3RydWN0b3Ioa2VybmVsOiBJTm90ZWJvb2tLZXJuZWwpIHtcblx0XHR0aGlzLmtlcm5lbCA9IGtlcm5lbDtcblx0XHR0aGlzLnNjb3JlID0gLTE7XG5cdFx0dGhpcy50aW1lID0gS2VybmVsSW5mby5fbG9naWNDbG9jaysrO1xuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rVGV4dE1vZGVsTGlrZUlkIHtcblx0c3RhdGljIHN0cihrOiBJTm90ZWJvb2tUZXh0TW9kZWxMaWtlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7ay5ub3RlYm9va1R5cGV9LyR7ay51cmkudG9TdHJpbmcoKX1gO1xuXHR9XG5cdHN0YXRpYyBvYmooczogc3RyaW5nKTogSU5vdGVib29rVGV4dE1vZGVsTGlrZSB7XG5cdFx0Y29uc3QgaWR4ID0gcy5pbmRleE9mKCcvJyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5vdGVib29rVHlwZTogcy5zdWJzdHJpbmcoMCwgaWR4KSxcblx0XHRcdHVyaTogVVJJLnBhcnNlKHMuc3Vic3RyaW5nKGlkeCArIDEpKVxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgU291cmNlQWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTb3VyY2VBY3Rpb24ge1xuXHRleGVjdXRpb246IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgYWN0aW9uOiBJQWN0aW9uLFxuXHRcdHJlYWRvbmx5IG1vZGVsOiBJTm90ZWJvb2tUZXh0TW9kZWxMaWtlLFxuXHRcdHJlYWRvbmx5IGlzUHJpbWFyeTogYm9vbGVhblxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgcnVuQWN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmV4ZWN1dGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXhlY3V0aW9uO1xuXHRcdH1cblxuXHRcdHRoaXMuZXhlY3V0aW9uID0gdGhpcy5fcnVuQWN0aW9uKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKCk7XG5cdFx0YXdhaXQgdGhpcy5leGVjdXRpb247XG5cdFx0dGhpcy5leGVjdXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5BY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuYWN0aW9uLnJ1bih7XG5cdFx0XHRcdHVyaTogdGhpcy5tb2RlbC51cmksXG5cdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Ob3RlYm9va0FjdGlvbkNvbnRleHRcblx0XHRcdH0pO1xuXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnNvbGUud2FybihgS2VybmVsIHNvdXJjZSBjb21tYW5kIGZhaWxlZDogJHtlcnJvcn1gKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElLZXJuZWxJbmZvQ2FjaGUge1xuXHRtZW51OiBJTWVudTtcblx0YWN0aW9uczogW0lTb3VyY2VBY3Rpb24sIElEaXNwb3NhYmxlXVtdO1xuXG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0tlcm5lbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rS2VybmVsU2VydmljZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfa2VybmVscyA9IG5ldyBNYXA8c3RyaW5nLCBLZXJuZWxJbmZvPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rQmluZGluZ3MgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBzdHJpbmc+KDEwMDAsIDAuNyk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VOb3RlYm9va0tlcm5lbEJpbmRpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2VsZWN0ZWROb3RlYm9va3NDaGFuZ2VFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWRkS2VybmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU5vdGVib29rS2VybmVsPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW1vdmVLZXJuZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90ZWJvb2tLZXJuZWw+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU5vdGVib29rQWZmaW5pdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTb3VyY2VBY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU5vdGVib29rU291cmNlQWN0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5vdGVib29rVmFyaWFibGVzQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfa2VybmVsU291cmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBJS2VybmVsSW5mb0NhY2hlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXJuZWxTb3VyY2VBY3Rpb25zVXBkYXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfa2VybmVsRGV0ZWN0aW9uVGFza3MgPSBuZXcgTWFwPHN0cmluZywgSU5vdGVib29rS2VybmVsRGV0ZWN0aW9uVGFza1tdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUtlcm5lbERldGVjdGlvblRhc2tzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcltdPigpO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0ZWROb3RlYm9va3M6IEV2ZW50PElTZWxlY3RlZE5vdGVib29rc0NoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlTm90ZWJvb2tLZXJuZWxCaW5kaW5nLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZEFkZEtlcm5lbDogRXZlbnQ8SU5vdGVib29rS2VybmVsPiA9IHRoaXMuX29uRGlkQWRkS2VybmVsLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZUtlcm5lbDogRXZlbnQ8SU5vdGVib29rS2VybmVsPiA9IHRoaXMuX29uRGlkUmVtb3ZlS2VybmVsLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU5vdGVib29rQWZmaW5pdHk6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VOb3RlYm9va0FmZmluaXR5LmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNvdXJjZUFjdGlvbnM6IEV2ZW50PElOb3RlYm9va1NvdXJjZUFjdGlvbkNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlU291cmNlQWN0aW9ucy5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VLZXJuZWxEZXRlY3Rpb25UYXNrczogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkQ2hhbmdlS2VybmVsRGV0ZWN0aW9uVGFza3MuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkTm90ZWJvb2tWYXJpYWJsZXNVcGRhdGU6IEV2ZW50PFVSST4gPSB0aGlzLl9vbkRpZE5vdGVib29rVmFyaWFibGVzQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgc3RhdGljIF9zdG9yYWdlTm90ZWJvb2tCaW5kaW5nID0gJ25vdGVib29rLmNvbnRyb2xsZXIyTm90ZWJvb2tCaW5kaW5ncyc7XG5cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIGF1dG8gYXNzb2NpYXRlIGtlcm5lbHMgdG8gbmV3IG5vdGVib29rIGRvY3VtZW50cywgYWxzbyBlbWl0IGV2ZW50IHdoZW5cblx0XHQvLyBhIG5vdGVib29rIGhhcyBiZWVuIGNsb3NlZCAoYnV0IGRvbid0IHVwZGF0ZSB0aGUgbWVtZW50bylcblx0XHR0aGlzLl9yZWdpc3Rlcihfbm90ZWJvb2tTZXJ2aWNlLm9uRGlkQWRkTm90ZWJvb2tEb2N1bWVudCh0aGlzLl90cnlBdXRvQmluZE5vdGVib29rLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX25vdGVib29rU2VydmljZS5vbldpbGxSZW1vdmVOb3RlYm9va0RvY3VtZW50KG5vdGVib29rID0+IHtcblx0XHRcdGNvbnN0IGlkID0gTm90ZWJvb2tUZXh0TW9kZWxMaWtlSWQuc3RyKG5vdGVib29rKTtcblx0XHRcdGNvbnN0IGtlcm5lbElkID0gdGhpcy5fbm90ZWJvb2tCaW5kaW5ncy5nZXQoaWQpO1xuXHRcdFx0aWYgKGtlcm5lbElkICYmIG5vdGVib29rLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdFx0dGhpcy5zZWxlY3RLZXJuZWxGb3JOb3RlYm9vayh1bmRlZmluZWQsIG5vdGVib29rKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvbnNVcGRhdGVzLmdldChpZCk/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvbnNVcGRhdGVzLmRlbGV0ZShpZCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcmVzdG9yZSBmcm9tIHN0b3JhZ2Vcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IEpTT04ucGFyc2UodGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KE5vdGVib29rS2VybmVsU2VydmljZS5fc3RvcmFnZU5vdGVib29rQmluZGluZywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ1tdJykpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tCaW5kaW5ncy5mcm9tSlNPTihkYXRhKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fa2VybmVscy5jbGVhcigpO1xuXHRcdHRoaXMuX2tlcm5lbFNvdXJjZXMuZm9yRWFjaCh2ID0+IHtcblx0XHRcdHYubWVudS5kaXNwb3NlKCk7XG5cdFx0XHR2LmFjdGlvbnMuZm9yRWFjaChhID0+IGFbMV0uZGlzcG9zZSgpKTtcblx0XHR9KTtcblx0XHR0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25zVXBkYXRlcy5mb3JFYWNoKHYgPT4ge1xuXHRcdFx0di5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fa2VybmVsU291cmNlQWN0aW9uc1VwZGF0ZXMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9wZXJzaXN0U29vbkhhbmRsZT86IElEaXNwb3NhYmxlO1xuXG5cdHByaXZhdGUgX3BlcnNpc3RNZW1lbnRvcygpOiB2b2lkIHtcblx0XHR0aGlzLl9wZXJzaXN0U29vbkhhbmRsZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3BlcnNpc3RTb29uSGFuZGxlID0gcnVuV2hlbldpbmRvd0lkbGUoZ2V0QWN0aXZlV2luZG93KCksICgpID0+IHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKE5vdGVib29rS2VybmVsU2VydmljZS5fc3RvcmFnZU5vdGVib29rQmluZGluZywgSlNPTi5zdHJpbmdpZnkodGhpcy5fbm90ZWJvb2tCaW5kaW5ncyksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSwgMTAwKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zY29yZShrZXJuZWw6IElOb3RlYm9va0tlcm5lbCwgbm90ZWJvb2s6IElOb3RlYm9va1RleHRNb2RlbExpa2UpOiBudW1iZXIge1xuXHRcdGlmIChrZXJuZWwudmlld1R5cGUgPT09ICcqJykge1xuXHRcdFx0cmV0dXJuIDU7XG5cdFx0fSBlbHNlIGlmIChrZXJuZWwudmlld1R5cGUgPT09IG5vdGVib29rLm5vdGVib29rVHlwZSkge1xuXHRcdFx0cmV0dXJuIDEwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90cnlBdXRvQmluZE5vdGVib29rKG5vdGVib29rOiBJTm90ZWJvb2tUZXh0TW9kZWwsIG9ubHlUaGlzS2VybmVsPzogSU5vdGVib29rS2VybmVsKTogdm9pZCB7XG5cblx0XHRjb25zdCBpZCA9IHRoaXMuX25vdGVib29rQmluZGluZ3MuZ2V0KE5vdGVib29rVGV4dE1vZGVsTGlrZUlkLnN0cihub3RlYm9vaykpO1xuXHRcdGlmICghaWQpIHtcblx0XHRcdC8vIG5vIGtlcm5lbCBhc3NvY2lhdGVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nS2VybmVsID0gdGhpcy5fa2VybmVscy5nZXQoaWQpO1xuXHRcdGlmICghZXhpc3RpbmdLZXJuZWwgfHwgIU5vdGVib29rS2VybmVsU2VydmljZS5fc2NvcmUoZXhpc3RpbmdLZXJuZWwua2VybmVsLCBub3RlYm9vaykpIHtcblx0XHRcdC8vIGFzc29jaWF0ZWQga2VybmVsIG5vdCBrbm93biwgbm90IG1hdGNoaW5nXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghb25seVRoaXNLZXJuZWwgfHwgZXhpc3RpbmdLZXJuZWwua2VybmVsID09PSBvbmx5VGhpc0tlcm5lbCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VOb3RlYm9va0tlcm5lbEJpbmRpbmcuZmlyZSh7IG5vdGVib29rOiBub3RlYm9vay51cmksIG9sZEtlcm5lbDogdW5kZWZpbmVkLCBuZXdLZXJuZWw6IGV4aXN0aW5nS2VybmVsLmtlcm5lbC5pZCB9KTtcblx0XHR9XG5cdH1cblxuXHRub3RpZnlWYXJpYWJsZXNDaGFuZ2Uobm90ZWJvb2tVcmk6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkTm90ZWJvb2tWYXJpYWJsZXNDaGFuZ2UuZmlyZShub3RlYm9va1VyaSk7XG5cdH1cblxuXHRyZWdpc3Rlcktlcm5lbChrZXJuZWw6IElOb3RlYm9va0tlcm5lbCk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fa2VybmVscy5oYXMoa2VybmVsLmlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBOT1RFQk9PSyBDT05UUk9MTEVSIHdpdGggaWQgJyR7a2VybmVsLmlkfScgYWxyZWFkeSBleGlzdHNgKTtcblx0XHR9XG5cblx0XHR0aGlzLl9rZXJuZWxzLnNldChrZXJuZWwuaWQsIG5ldyBLZXJuZWxJbmZvKGtlcm5lbCkpO1xuXHRcdHRoaXMuX29uRGlkQWRkS2VybmVsLmZpcmUoa2VybmVsKTtcblxuXHRcdC8vIGF1dG8gYXNzb2NpYXRlIHRoZSBuZXcga2VybmVsIHRvIGV4aXN0aW5nIG5vdGVib29rcyBpdCB3YXNcblx0XHQvLyBhc3NvY2lhdGVkIHRvIGluIHRoZSBwYXN0LlxuXHRcdGZvciAoY29uc3Qgbm90ZWJvb2sgb2YgdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rVGV4dE1vZGVscygpKSB7XG5cdFx0XHR0aGlzLl90cnlBdXRvQmluZE5vdGVib29rKG5vdGVib29rLCBrZXJuZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2tlcm5lbHMuZGVsZXRlKGtlcm5lbC5pZCkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZW1vdmVLZXJuZWwuZmlyZShrZXJuZWwpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCBjYW5kaWRhdGVdIG9mIEFycmF5LmZyb20odGhpcy5fbm90ZWJvb2tCaW5kaW5ncykpIHtcblx0XHRcdFx0aWYgKGNhbmRpZGF0ZSA9PT0ga2VybmVsLmlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VOb3RlYm9va0tlcm5lbEJpbmRpbmcuZmlyZSh7IG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbExpa2VJZC5vYmooa2V5KS51cmksIG9sZEtlcm5lbDoga2VybmVsLmlkLCBuZXdLZXJuZWw6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0TWF0Y2hpbmdLZXJuZWwobm90ZWJvb2s6IElOb3RlYm9va1RleHRNb2RlbExpa2UpOiBJTm90ZWJvb2tLZXJuZWxNYXRjaFJlc3VsdCB7XG5cblx0XHQvLyBhbGwgYXBwbGljYWJsZSBrZXJuZWxzXG5cdFx0Y29uc3Qga2VybmVsczogeyBrZXJuZWw6IElOb3RlYm9va0tlcm5lbDsgaW5zdGFuY2VBZmZpbml0eTogbnVtYmVyOyBzY29yZTogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaW5mbyBvZiB0aGlzLl9rZXJuZWxzLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBzY29yZSA9IE5vdGVib29rS2VybmVsU2VydmljZS5fc2NvcmUoaW5mby5rZXJuZWwsIG5vdGVib29rKTtcblx0XHRcdGlmIChzY29yZSkge1xuXHRcdFx0XHRrZXJuZWxzLnB1c2goe1xuXHRcdFx0XHRcdHNjb3JlLFxuXHRcdFx0XHRcdGtlcm5lbDogaW5mby5rZXJuZWwsXG5cdFx0XHRcdFx0aW5zdGFuY2VBZmZpbml0eTogaW5mby5ub3RlYm9va1ByaW9yaXRpZXMuZ2V0KG5vdGVib29rLnVyaSkgPz8gMSAvKiB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyUHJpb3JpdHkuRGVmYXVsdCAqLyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0a2VybmVsc1xuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGIuaW5zdGFuY2VBZmZpbml0eSAtIGEuaW5zdGFuY2VBZmZpbml0eSB8fCBhLnNjb3JlIC0gYi5zY29yZSB8fCBhLmtlcm5lbC5sYWJlbC5sb2NhbGVDb21wYXJlKGIua2VybmVsLmxhYmVsKSk7XG5cdFx0Y29uc3QgYWxsID0ga2VybmVscy5tYXAob2JqID0+IG9iai5rZXJuZWwpO1xuXG5cdFx0Ly8gYm91bmQga2VybmVsXG5cdFx0Y29uc3Qgc2VsZWN0ZWRJZCA9IHRoaXMuX25vdGVib29rQmluZGluZ3MuZ2V0KE5vdGVib29rVGV4dE1vZGVsTGlrZUlkLnN0cihub3RlYm9vaykpO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gc2VsZWN0ZWRJZCA/IHRoaXMuX2tlcm5lbHMuZ2V0KHNlbGVjdGVkSWQpPy5rZXJuZWwgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnMgPSBrZXJuZWxzLmZpbHRlcihpdGVtID0+IGl0ZW0uaW5zdGFuY2VBZmZpbml0eSA+IDEpLm1hcChpdGVtID0+IGl0ZW0ua2VybmVsKTtcblx0XHRjb25zdCBoaWRkZW4gPSBrZXJuZWxzLmZpbHRlcihpdGVtID0+IGl0ZW0uaW5zdGFuY2VBZmZpbml0eSA8IDApLm1hcChpdGVtID0+IGl0ZW0ua2VybmVsKTtcblx0XHRyZXR1cm4geyBhbGwsIHNlbGVjdGVkLCBzdWdnZXN0aW9ucywgaGlkZGVuIH07XG5cdH1cblxuXHRnZXRTZWxlY3RlZE9yU3VnZ2VzdGVkS2VybmVsKG5vdGVib29rOiBJTm90ZWJvb2tUZXh0TW9kZWwpOiBJTm90ZWJvb2tLZXJuZWwgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldE1hdGNoaW5nS2VybmVsKG5vdGVib29rKTtcblx0XHRpZiAoaW5mby5zZWxlY3RlZCkge1xuXHRcdFx0cmV0dXJuIGluZm8uc2VsZWN0ZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlZmVycmVkID0gaW5mby5hbGwuZmlsdGVyKGtlcm5lbCA9PiB0aGlzLl9rZXJuZWxzLmdldChrZXJuZWwuaWQpPy5ub3RlYm9va1ByaW9yaXRpZXMuZ2V0KG5vdGVib29rLnVyaSkgPT09IDIgLyogdnNjb2RlLk5vdGVib29rQ29udHJvbGxlclByaW9yaXR5LlByZWZlcnJlZCAqLyk7XG5cdFx0aWYgKHByZWZlcnJlZC5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBwcmVmZXJyZWRbMF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZm8uYWxsLmxlbmd0aCA9PT0gMSA/IGluZm8uYWxsWzBdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gYSBub3RlYm9vayBoYXMgb25lIGtlcm5lbCwgYSBrZXJuZWwgaGFzIE4gbm90ZWJvb2tzXG5cdC8vIG5vdGVib29rIDwtMS0tLS1OLT4ga2VybmVsXG5cdHNlbGVjdEtlcm5lbEZvck5vdGVib29rKGtlcm5lbDogSU5vdGVib29rS2VybmVsIHwgdW5kZWZpbmVkLCBub3RlYm9vazogSU5vdGVib29rVGV4dE1vZGVsTGlrZSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IE5vdGVib29rVGV4dE1vZGVsTGlrZUlkLnN0cihub3RlYm9vayk7XG5cdFx0Y29uc3Qgb2xkS2VybmVsID0gdGhpcy5fbm90ZWJvb2tCaW5kaW5ncy5nZXQoa2V5KTtcblx0XHRpZiAob2xkS2VybmVsICE9PSBrZXJuZWw/LmlkKSB7XG5cdFx0XHRpZiAoa2VybmVsKSB7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rQmluZGluZ3Muc2V0KGtleSwga2VybmVsLmlkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rQmluZGluZ3MuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU5vdGVib29rS2VybmVsQmluZGluZy5maXJlKHsgbm90ZWJvb2s6IG5vdGVib29rLnVyaSwgb2xkS2VybmVsLCBuZXdLZXJuZWw6IGtlcm5lbD8uaWQgfSk7XG5cdFx0XHR0aGlzLl9wZXJzaXN0TWVtZW50b3MoKTtcblx0XHR9XG5cdH1cblxuXHRwcmVzZWxlY3RLZXJuZWxGb3JOb3RlYm9vayhrZXJuZWw6IElOb3RlYm9va0tlcm5lbCwgbm90ZWJvb2s6IElOb3RlYm9va1RleHRNb2RlbExpa2UpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBOb3RlYm9va1RleHRNb2RlbExpa2VJZC5zdHIobm90ZWJvb2spO1xuXHRcdGNvbnN0IG9sZEtlcm5lbCA9IHRoaXMuX25vdGVib29rQmluZGluZ3MuZ2V0KGtleSk7XG5cdFx0aWYgKG9sZEtlcm5lbCAhPT0ga2VybmVsPy5pZCkge1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tCaW5kaW5ncy5zZXQoa2V5LCBrZXJuZWwuaWQpO1xuXHRcdFx0dGhpcy5fcGVyc2lzdE1lbWVudG9zKCk7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlS2VybmVsTm90ZWJvb2tBZmZpbml0eShrZXJuZWw6IElOb3RlYm9va0tlcm5lbCwgbm90ZWJvb2s6IFVSSSwgcHJlZmVyZW5jZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2tlcm5lbHMuZ2V0KGtlcm5lbC5pZCk7XG5cdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVOS05PV04ga2VybmVsICcke2tlcm5lbC5pZH0nYCk7XG5cdFx0fVxuXHRcdGlmIChwcmVmZXJlbmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGluZm8ubm90ZWJvb2tQcmlvcml0aWVzLmRlbGV0ZShub3RlYm9vayk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGluZm8ubm90ZWJvb2tQcmlvcml0aWVzLnNldChub3RlYm9vaywgcHJlZmVyZW5jZSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTm90ZWJvb2tBZmZpbml0eS5maXJlKCk7XG5cdH1cblxuXHRnZXRSdW5uaW5nU291cmNlQWN0aW9ucyhub3RlYm9vazogSU5vdGVib29rVGV4dE1vZGVsTGlrZSkge1xuXHRcdGNvbnN0IGlkID0gTm90ZWJvb2tUZXh0TW9kZWxMaWtlSWQuc3RyKG5vdGVib29rKTtcblx0XHRjb25zdCBleGlzdGluZ0luZm8gPSB0aGlzLl9rZXJuZWxTb3VyY2VzLmdldChpZCk7XG5cdFx0aWYgKGV4aXN0aW5nSW5mbykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nSW5mby5hY3Rpb25zLmZpbHRlcihhY3Rpb24gPT4gYWN0aW9uWzBdLmV4ZWN1dGlvbikubWFwKGFjdGlvbiA9PiBhY3Rpb25bMF0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGdldFNvdXJjZUFjdGlvbnMobm90ZWJvb2s6IElOb3RlYm9va1RleHRNb2RlbExpa2UsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQpOiBJU291cmNlQWN0aW9uW10ge1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlID0gY29udGV4dEtleVNlcnZpY2UgPz8gdGhpcy5fY29udGV4dEtleVNlcnZpY2U7XG5cdFx0Y29uc3QgaWQgPSBOb3RlYm9va1RleHRNb2RlbExpa2VJZC5zdHIobm90ZWJvb2spO1xuXHRcdGNvbnN0IGV4aXN0aW5nSW5mbyA9IHRoaXMuX2tlcm5lbFNvdXJjZXMuZ2V0KGlkKTtcblxuXHRcdGlmIChleGlzdGluZ0luZm8pIHtcblx0XHRcdHJldHVybiBleGlzdGluZ0luZm8uYWN0aW9ucy5tYXAoYSA9PiBhWzBdKTtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2VNZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fbWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuTm90ZWJvb2tLZXJuZWxTb3VyY2UsIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5mbzogSUtlcm5lbEluZm9DYWNoZSA9IHsgbWVudTogc291cmNlTWVudSwgYWN0aW9uczogW10gfTtcblxuXHRcdGNvbnN0IGxvYWRBY3Rpb25zRnJvbU1lbnUgPSAobWVudTogSU1lbnUsIGRvY3VtZW50OiBJTm90ZWJvb2tUZXh0TW9kZWxMaWtlKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cHMgPSBtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHNvdXJjZUFjdGlvbnM6IFtJU291cmNlQWN0aW9uLCBJRGlzcG9zYWJsZV1bXSA9IFtdO1xuXHRcdFx0Z3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuXHRcdFx0XHRjb25zdCBpc1ByaW1hcnkgPSAvXnByaW1hcnkvLnRlc3QoZ3JvdXBbMF0pO1xuXHRcdFx0XHRncm91cFsxXS5mb3JFYWNoKGFjdGlvbiA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlQWN0aW9uID0gbmV3IFNvdXJjZUFjdGlvbihhY3Rpb24sIGRvY3VtZW50LCBpc1ByaW1hcnkpO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlQ2hhbmdlTGlzdGVuZXIgPSBzb3VyY2VBY3Rpb24ub25EaWRDaGFuZ2VTdGF0ZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNvdXJjZUFjdGlvbnMuZmlyZSh7XG5cdFx0XHRcdFx0XHRcdG5vdGVib29rOiBkb2N1bWVudC51cmksXG5cdFx0XHRcdFx0XHRcdHZpZXdUeXBlOiBkb2N1bWVudC5ub3RlYm9va1R5cGUsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRzb3VyY2VBY3Rpb25zLnB1c2goW3NvdXJjZUFjdGlvbiwgc3RhdGVDaGFuZ2VMaXN0ZW5lcl0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0aW5mby5hY3Rpb25zID0gc291cmNlQWN0aW9ucztcblx0XHRcdHRoaXMuX2tlcm5lbFNvdXJjZXMuc2V0KGlkLCBpbmZvKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU291cmNlQWN0aW9ucy5maXJlKHsgbm90ZWJvb2s6IGRvY3VtZW50LnVyaSwgdmlld1R5cGU6IGRvY3VtZW50Lm5vdGVib29rVHlwZSB9KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fa2VybmVsU291cmNlQWN0aW9uc1VwZGF0ZXMuZ2V0KGlkKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvbnNVcGRhdGVzLnNldChpZCwgc291cmNlTWVudS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRsb2FkQWN0aW9uc0Zyb21NZW51KHNvdXJjZU1lbnUsIG5vdGVib29rKTtcblx0XHR9KSk7XG5cblx0XHRsb2FkQWN0aW9uc0Zyb21NZW51KHNvdXJjZU1lbnUsIG5vdGVib29rKTtcblxuXHRcdHJldHVybiBpbmZvLmFjdGlvbnMubWFwKGEgPT4gYVswXSk7XG5cdH1cblxuXHRyZWdpc3Rlck5vdGVib29rS2VybmVsRGV0ZWN0aW9uVGFzayh0YXNrOiBJTm90ZWJvb2tLZXJuZWxEZXRlY3Rpb25UYXNrKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IG5vdGVib29rVHlwZSA9IHRhc2subm90ZWJvb2tUeXBlO1xuXHRcdGNvbnN0IGFsbCA9IHRoaXMuX2tlcm5lbERldGVjdGlvblRhc2tzLmdldChub3RlYm9va1R5cGUpID8/IFtdO1xuXHRcdGFsbC5wdXNoKHRhc2spO1xuXHRcdHRoaXMuX2tlcm5lbERldGVjdGlvblRhc2tzLnNldChub3RlYm9va1R5cGUsIGFsbCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VLZXJuZWxEZXRlY3Rpb25UYXNrcy5maXJlKG5vdGVib29rVHlwZSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBhbGwgPSB0aGlzLl9rZXJuZWxEZXRlY3Rpb25UYXNrcy5nZXQobm90ZWJvb2tUeXBlKSA/PyBbXTtcblx0XHRcdGNvbnN0IGlkeCA9IGFsbC5pbmRleE9mKHRhc2spO1xuXHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdGFsbC5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdFx0dGhpcy5fa2VybmVsRGV0ZWN0aW9uVGFza3Muc2V0KG5vdGVib29rVHlwZSwgYWxsKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VLZXJuZWxEZXRlY3Rpb25UYXNrcy5maXJlKG5vdGVib29rVHlwZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRnZXRLZXJuZWxEZXRlY3Rpb25UYXNrcyhub3RlYm9vazogSU5vdGVib29rVGV4dE1vZGVsTGlrZSk6IElOb3RlYm9va0tlcm5lbERldGVjdGlvblRhc2tbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2tlcm5lbERldGVjdGlvblRhc2tzLmdldChub3RlYm9vay5ub3RlYm9va1R5cGUpID8/IFtdO1xuXHR9XG5cblx0cmVnaXN0ZXJLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcih2aWV3VHlwZTogc3RyaW5nLCBwcm92aWRlcjogSUtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVycy5nZXQodmlld1R5cGUpID8/IFtdO1xuXHRcdHByb3ZpZGVycy5wdXNoKHByb3ZpZGVyKTtcblx0XHR0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnMuc2V0KHZpZXdUeXBlLCBwcm92aWRlcnMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU291cmNlQWN0aW9ucy5maXJlKHsgdmlld1R5cGU6IHZpZXdUeXBlIH0pO1xuXG5cdFx0Y29uc3QgZXZlbnRFbWl0dGVyRGlzcG9zYWJsZSA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlU291cmNlQWN0aW9ucz8uKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU291cmNlQWN0aW9ucy5maXJlKHsgdmlld1R5cGU6IHZpZXdUeXBlIH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnMuZ2V0KHZpZXdUeXBlKSA/PyBbXTtcblx0XHRcdGNvbnN0IGlkeCA9IHByb3ZpZGVycy5pbmRleE9mKHByb3ZpZGVyKTtcblx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRwcm92aWRlcnMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVycy5zZXQodmlld1R5cGUsIHByb3ZpZGVycyk7XG5cdFx0XHR9XG5cblx0XHRcdGV2ZW50RW1pdHRlckRpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQga2VybmVsIHNvdXJjZSBhY3Rpb25zIGZyb20gcHJvdmlkZXJzXG5cdCAqL1xuXHRnZXRLZXJuZWxTb3VyY2VBY3Rpb25zMihub3RlYm9vazogSU5vdGVib29rVGV4dE1vZGVsTGlrZSk6IFByb21pc2U8SU5vdGVib29rS2VybmVsU291cmNlQWN0aW9uW10+IHtcblx0XHRjb25zdCB2aWV3VHlwZSA9IG5vdGVib29rLm5vdGVib29rVHlwZTtcblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnMuZ2V0KHZpZXdUeXBlKSA/PyBbXTtcblx0XHRjb25zdCBwcm9taXNlcyA9IHByb3ZpZGVycy5tYXAocHJvdmlkZXIgPT4gcHJvdmlkZXIucHJvdmlkZUtlcm5lbFNvdXJjZUFjdGlvbnMoKSk7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKGFjdGlvbnMgPT4ge1xuXHRcdFx0cmV0dXJuIGFjdGlvbnMucmVkdWNlKChhLCBiKSA9PiBhLmNvbmNhdChiKSwgW10pO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQWdCLGVBQWU7QUFDL0IsU0FBUyxZQUF5QixvQkFBb0I7QUFHdEQsU0FBUyxVQUFVLG1CQUFtQjtBQUN0QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLFdBQVc7QUFDcEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBZ0IsY0FBYyxjQUFjO0FBQzVDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQix5QkFBeUI7QUFFbkQsTUFBTSxjQUFOLE1BQU0sWUFBVztBQUFBLEVBVWhCLFlBQVksUUFBeUI7QUFGckMsU0FBUyxxQkFBcUIsSUFBSSxZQUFvQjtBQUdyRCxTQUFLLFNBQVM7QUFDZCxTQUFLLFFBQVE7QUFDYixTQUFLLE9BQU8sWUFBVztBQUFBLEVBQ3hCO0FBQ0Q7QUFmTSxZQUVVLGNBQWM7QUFGOUIsSUFBTSxhQUFOO0FBaUJBLE1BQU0sd0JBQXdCO0FBQUEsRUFDN0IsT0FBTyxJQUFJLEdBQW1DO0FBQzdDLFdBQU8sR0FBRyxFQUFFLFlBQVksSUFBSSxFQUFFLElBQUksU0FBUyxDQUFDO0FBQUEs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c0IsSUFBSSxjQUFjQSxJQUFHO0FBQ2hELGFBQUssaUNBQWlDLEtBQUssWUFBWTtBQUFBLE1BQ3hEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsd0JBQXdCLFVBQWtFO0FBQ3pGLFdBQU8sS0FBSyxzQkFBc0IsSUFBSSxTQUFTLFlBQVksS0FBSyxDQUFDO0FBQUEsRUFDbEU7QUFBQSxFQUVBLG1DQUFtQyxVQUFrQixVQUFvRDtBQUN4RyxVQUFNLFlBQVksS0FBSyw2QkFBNkIsSUFBSSxRQUFRLEtBQUssQ0FBQztBQUN0RSxjQUFVLEtBQUssUUFBUTtBQUN2QixTQUFLLDZCQUE2QixJQUFJLFVBQVUsU0FBUztBQUN6RCxTQUFLLDBCQUEwQixLQUFLLEVBQUUsU0FBbUIsQ0FBQztBQUUxRCxVQUFNLHlCQUF5QixTQUFTLDJCQUEyQixNQUFNO0FBQ3hFLFdBQUssMEJBQTBCLEtBQUssRUFBRSxTQUFtQixDQUFDO0FBQUEsSUFDM0QsQ0FBQztBQUVELFdBQU8sYUFBYSxNQUFNO0FBQ3pCLFlBQU1DLGFBQVksS0FBSyw2QkFBNkIsSUFBSSxRQUFRLEtBQUssQ0FBQztBQUN0RSxZQUFNLE1BQU1BLFdBQVUsUUFBUSxRQUFRO0FBQ3RDLFVBQUksT0FBTyxHQUFHO0FBQ2IsUUFBQUEsV0FBVSxPQUFPLEtBQUssQ0FBQztBQUN2QixhQUFLLDZCQUE2QixJQUFJLFVBQVVBLFVBQVM7QUFBQSxNQUMxRDtBQUVBLDhCQUF3QixRQUFRO0FBQUEsSUFDakMsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLHdCQUF3QixVQUEwRTtBQUNqRyxVQUFNLFdBQVcsU0FBUztBQUMxQixVQUFNLFlBQVksS0FBSyw2QkFBNkIsSUFBSSxRQUFRLEtBQUssQ0FBQztBQUN0RSxVQUFNLFdBQVcsVUFBVSxJQUFJLGNBQVksU0FBUywyQkFBMkIsQ0FBQztBQUNoRixXQUFPLFFBQVEsSUFBSSxRQUFRLEVBQUUsS0FBSyxhQUFXO0FBQzVDLGFBQU8sUUFBUSxPQUFPLENBQUMsR0FBRyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXRVYSxzQkE0QkcsMEJBQTBCO0FBNUI3Qix3QkFBTjtBQUFBLEVBZ0NKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FuQ1U7IiwKICAibmFtZXMiOiBbImFsbCIsICJwcm92aWRlcnMiXQp9Cg==
