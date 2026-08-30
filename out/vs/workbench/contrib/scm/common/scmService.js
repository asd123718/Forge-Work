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
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { SCMInputChangeReason } from "./scm.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { HistoryNavigator2 } from "../../../../base/common/history.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { URI } from "../../../../base/common/uri.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Schemas } from "../../../../base/common/network.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { runOnChange } from "../../../../base/common/observable.js";
class SCMInput extends Disposable {
  constructor(repository, history) {
    super();
    this.repository = repository;
    this.history = history;
    this._value = "";
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._placeholder = "";
    this._onDidChangePlaceholder = this._register(new Emitter());
    this.onDidChangePlaceholder = this._onDidChangePlaceholder.event;
    this._enabled = true;
    this._onDidChangeEnablement = this._register(new Emitter());
    this.onDidChangeEnablement = this._onDidChangeEnablement.event;
    this._visible = true;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeFocus = this._register(new Emitter());
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidChangeValidationMessage = this._register(new Emitter());
    this.onDidChangeValidationMessage = this._onDidChangeValidationMessage.event;
    this._onDidClearValidation = this._register(new Emitter());
    this.onDidClearValidation = this._onDidClearValidation.event;
    this._validateInput = () => Promise.resolve(void 0);
    this._onDidChangeValidateInput = this._register(new Emitter());
    this.onDidChangeValidateInput = this._onDidChangeValidateInput.event;
    this.didChangeHistory = false;
    if (this.repository.provider.rootUri) {
      this.historyNavigator = history.getHistory(this.repository.provider.label, this.repository.provider.rootUri);
      this._register(this.history.onWillSaveHistory((event) => {
        if (this.historyNavigator.isAtEnd()) {
          this.saveValue();
        }
        if (this.didChangeHistory) {
          event.historyDidIndeedChange();
        }
        this.didChangeHistory = false;
      }));
    } else {
      this.historyNavigator = new HistoryNavigator2([""], 100);
    }
    this._value = this.historyNavigator.current();
  }
  get value() {
    return this._value;
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(placeholder) {
    this._placeholder = placeholder;
    this._onDidChangePlaceholder.fire(placeholder);
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(enabled) {
    this._enabled = enabled;
    this._onDidChangeEnablement.fire(enabled);
  }
  get visible() {
    return this._visible;
  }
  set visible(visible) {
    this._visible = visible;
    this._onDidChangeVisibility.fire(visible);
  }
  setFocus() {
    this._onDidChangeFocus.fire();
  }
  showValidationMessage(message, type) {
    this._onDidChangeValidationMessage.fire({ message, type });
  }
  clearValidation() {
    this._onDidClearValidation.fire();
  }
  get validateInput() {
    return this._validateInput;
  }
  set validateInput(validateInput) {
    this._validateInput = validateInput;
    this._onDidChangeValidateInput.fire();
  }
  setValue(value, transient, reason) {
    if (value === this._value) {
      return;
    }
    if (!transient) {
      this.historyNavigator.replaceLast(this._value);
      this.historyNavigator.add(value);
      this.didChangeHistory = true;
    }
    this._value = value;
    this._onDidChange.fire({ value, reason });
  }
  showNextHistoryValue() {
    if (this.historyNavigator.isAtEnd()) {
      return;
    } else if (!this.historyNavigator.has(this.value)) {
      this.saveValue();
      this.historyNavigator.resetCursor();
    }
    const value = this.historyNavigator.next();
    this.setValue(value, true, SCMInputChangeReason.HistoryNext);
  }
  showPreviousHistoryValue() {
    if (this.historyNavigator.isAtEnd()) {
      this.saveValue();
    } else if (!this.historyNavigator.has(this._value)) {
      this.saveValue();
      this.historyNavigator.resetCursor();
    }
    const value = this.historyNavigator.previous();
    this.setValue(value, true, SCMInputChangeReason.HistoryPrevious);
  }
  saveValue() {
    const oldValue = this.historyNavigator.replaceLast(this._value);
    this.didChangeHistory = this.didChangeHistory || oldValue !== this._value;
  }
}
class SCMRepository {
  constructor(id, provider, disposables, inputHistory) {
    this.id = id;
    this.provider = provider;
    this.disposables = disposables;
    this._selected = false;
    this._onDidChangeSelection = new Emitter();
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this.input = new SCMInput(this, inputHistory);
  }
  get selected() {
    return this._selected;
  }
  setSelected(selected) {
    if (this._selected === selected) {
      return;
    }
    this._selected = selected;
    this._onDidChangeSelection.fire(selected);
  }
  dispose() {
    this.disposables.dispose();
    this._onDidChangeSelection.dispose();
    this.input.dispose();
    this.provider.dispose();
  }
}
class WillSaveHistoryEvent {
  constructor() {
    this._didChangeHistory = false;
  }
  get didChangeHistory() {
    return this._didChangeHistory;
  }
  historyDidIndeedChange() {
    this._didChangeHistory = true;
  }
}
let SCMInputHistory = class {
  constructor(storageService, workspaceContextService) {
    this.storageService = storageService;
    this.workspaceContextService = workspaceContextService;
    this.disposables = new DisposableStore();
    this.histories = /* @__PURE__ */ new Map();
    this._onWillSaveHistory = this.disposables.add(new Emitter());
    this.onWillSaveHistory = this._onWillSaveHistory.event;
    this.histories = /* @__PURE__ */ new Map();
    const entries = this.storageService.getObject("scm.history", StorageScope.WORKSPACE, []);
    for (const [providerLabel, rootUri, history] of entries) {
      let providerHistories = this.histories.get(providerLabel);
      if (!providerHistories) {
        providerHistories = new ResourceMap();
        this.histories.set(providerLabel, providerHistories);
      }
      providerHistories.set(rootUri, new HistoryNavigator2(history, 100));
    }
    if (this.migrateStorage()) {
      this.saveToStorage();
    }
    this.disposables.add(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, "scm.history", this.disposables)((e) => {
      if (e.external && e.key === "scm.history") {
        const raw = this.storageService.getObject("scm.history", StorageScope.WORKSPACE, []);
        for (const [providerLabel, uri, rawHistory] of raw) {
          const history = this.getHistory(providerLabel, uri);
          for (const value of Iterable.reverse(rawHistory)) {
            history.prepend(value);
          }
        }
      }
    }));
    this.disposables.add(this.storageService.onWillSaveState((_) => {
      const event = new WillSaveHistoryEvent();
      this._onWillSaveHistory.fire(event);
      if (event.didChangeHistory) {
        this.saveToStorage();
      }
    }));
  }
  saveToStorage() {
    const raw = [];
    for (const [providerLabel, providerHistories] of this.histories) {
      for (const [rootUri, history] of providerHistories) {
        if (!(history.size === 1 && history.current() === "")) {
          raw.push([providerLabel, rootUri, [...history]]);
        }
      }
    }
    this.storageService.store("scm.history", raw, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  getHistory(providerLabel, rootUri) {
    let providerHistories = this.histories.get(providerLabel);
    if (!providerHistories) {
      providerHistories = new ResourceMap();
      this.histories.set(providerLabel, providerHistories);
    }
    let history = providerHistories.get(rootUri);
    if (!history) {
      history = new HistoryNavigator2([""], 100);
      providerHistories.set(rootUri, history);
    }
    return history;
  }
  // Migrates from Application scope storage to Workspace scope.
  // TODO@joaomoreno: Change from January 2024 onwards such that the only code is to remove all `scm/input:` storage keys
  migrateStorage() {
    let didSomethingChange = false;
    const machineKeys = Iterable.filter(this.storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE), (key) => key.startsWith("scm/input:"));
    for (const key of machineKeys) {
      try {
        const legacyHistory = JSON.parse(this.storageService.get(key, StorageScope.APPLICATION, ""));
        const match = /^scm\/input:([^:]+):(.+)$/.exec(key);
        if (!match || !Array.isArray(legacyHistory?.history) || !Number.isInteger(legacyHistory?.timestamp)) {
          this.storageService.remove(key, StorageScope.APPLICATION);
          continue;
        }
        const [, providerLabel, rootPath] = match;
        const rootUri = URI.file(rootPath);
        if (this.workspaceContextService.getWorkspaceFolder(rootUri)) {
          const history = this.getHistory(providerLabel, rootUri);
          for (const entry of Iterable.reverse(legacyHistory.history)) {
            history.prepend(entry);
          }
          didSomethingChange = true;
          this.storageService.remove(key, StorageScope.APPLICATION);
        }
      } catch {
        this.storageService.remove(key, StorageScope.APPLICATION);
      }
    }
    return didSomethingChange;
  }
  dispose() {
    this.disposables.dispose();
  }
};
SCMInputHistory = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IWorkspaceContextService)
], SCMInputHistory);
let SCMService = class {
  constructor(logService, workspaceContextService, contextKeyService, storageService, uriIdentityService) {
    this.logService = logService;
    this.uriIdentityService = uriIdentityService;
    this._repositories = /* @__PURE__ */ new Map();
    this._onDidAddProvider = new Emitter();
    this.onDidAddRepository = this._onDidAddProvider.event;
    this._onDidRemoveProvider = new Emitter();
    this.onDidRemoveRepository = this._onDidRemoveProvider.event;
    this.inputHistory = new SCMInputHistory(storageService, workspaceContextService);
    this.providerCount = contextKeyService.createKey("scm.providerCount", 0);
    this.historyProviderCount = contextKeyService.createKey("scm.historyProviderCount", 0);
  }
  // used in tests
  get repositories() {
    return this._repositories.values();
  }
  get repositoryCount() {
    return this._repositories.size;
  }
  registerSCMProvider(provider) {
    this.logService.trace("SCMService#registerSCMProvider");
    if (this._repositories.has(provider.id)) {
      throw new Error(`SCM Provider ${provider.id} already exists.`);
    }
    const disposables = new DisposableStore();
    const historyProviderCount = () => {
      return Array.from(this._repositories.values()).filter((r) => !!r.provider.historyProvider.get()).length;
    };
    disposables.add(toDisposable(() => {
      this._repositories.delete(provider.id);
      this._onDidRemoveProvider.fire(repository);
      this.providerCount.set(this._repositories.size);
      this.historyProviderCount.set(historyProviderCount());
    }));
    const repository = new SCMRepository(provider.id, provider, disposables, this.inputHistory);
    this._repositories.set(provider.id, repository);
    disposables.add(runOnChange(provider.historyProvider, () => {
      this.historyProviderCount.set(historyProviderCount());
    }));
    this.providerCount.set(this._repositories.size);
    this.historyProviderCount.set(historyProviderCount());
    this._onDidAddProvider.fire(repository);
    return repository;
  }
  getRepository(idOrResource) {
    if (typeof idOrResource === "string") {
      return this._repositories.get(idOrResource);
    }
    if (idOrResource.scheme !== Schemas.file && idOrResource.scheme !== Schemas.vscodeRemote) {
      return void 0;
    }
    let bestRepository = void 0;
    let bestMatchLength = Number.POSITIVE_INFINITY;
    for (const repository of this.repositories) {
      if (repository.provider.isHidden === true) {
        continue;
      }
      const root = repository.provider.rootUri;
      if (!root) {
        continue;
      }
      const path = this.uriIdentityService.extUri.relativePath(root, idOrResource);
      if (path && !/^\.\./.test(path) && path.length < bestMatchLength) {
        bestRepository = repository;
        bestMatchLength = path.length;
      }
    }
    return bestRepository;
  }
};
SCMService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IUriIdentityService)
], SCMService);
export {
  SCMService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcY29tbW9uXFxzY21TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVNDTVNlcnZpY2UsIElTQ01Qcm92aWRlciwgSVNDTUlucHV0LCBJU0NNUmVwb3NpdG9yeSwgSUlucHV0VmFsaWRhdG9yLCBJU0NNSW5wdXRDaGFuZ2VFdmVudCwgU0NNSW5wdXRDaGFuZ2VSZWFzb24sIElucHV0VmFsaWRhdGlvblR5cGUsIElJbnB1dFZhbGlkYXRpb24gfSBmcm9tICcuL3NjbS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBIaXN0b3J5TmF2aWdhdG9yMiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBydW5PbkNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuXG5jbGFzcyBTQ01JbnB1dCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU0NNSW5wdXQge1xuXG5cdHByaXZhdGUgX3ZhbHVlID0gJyc7XG5cblx0Z2V0IHZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU0NNSW5wdXRDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxJU0NNSW5wdXRDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9wbGFjZWhvbGRlciA9ICcnO1xuXG5cdGdldCBwbGFjZWhvbGRlcigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9wbGFjZWhvbGRlcjtcblx0fVxuXG5cdHNldCBwbGFjZWhvbGRlcihwbGFjZWhvbGRlcjogc3RyaW5nKSB7XG5cdFx0dGhpcy5fcGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVBsYWNlaG9sZGVyLmZpcmUocGxhY2Vob2xkZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQbGFjZWhvbGRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGxhY2Vob2xkZXI6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZENoYW5nZVBsYWNlaG9sZGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgX2VuYWJsZWQgPSB0cnVlO1xuXG5cdGdldCBlbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lbmFibGVkO1xuXHR9XG5cblx0c2V0IGVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuXHRcdHRoaXMuX2VuYWJsZWQgPSBlbmFibGVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRW5hYmxlbWVudC5maXJlKGVuYWJsZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFbmFibGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW5hYmxlbWVudDogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZUVuYWJsZW1lbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdmlzaWJsZSA9IHRydWU7XG5cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGU7XG5cdH1cblxuXHRzZXQgdmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUodmlzaWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudDxib29sZWFuPiA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudDtcblxuXHRzZXRGb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUZvY3VzLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1czogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUZvY3VzLmV2ZW50O1xuXG5cdHNob3dWYWxpZGF0aW9uTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcsIHR5cGU6IElucHV0VmFsaWRhdGlvblR5cGUpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbGlkYXRpb25NZXNzYWdlLmZpcmUoeyBtZXNzYWdlOiBtZXNzYWdlLCB0eXBlOiB0eXBlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWYWxpZGF0aW9uTWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElJbnB1dFZhbGlkYXRpb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZhbGlkYXRpb25NZXNzYWdlOiBFdmVudDxJSW5wdXRWYWxpZGF0aW9uPiA9IHRoaXMuX29uRGlkQ2hhbmdlVmFsaWRhdGlvbk1lc3NhZ2UuZXZlbnQ7XG5cblx0Y2xlYXJWYWxpZGF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2xlYXJWYWxpZGF0aW9uLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xlYXJWYWxpZGF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xlYXJWYWxpZGF0aW9uOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2xlYXJWYWxpZGF0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX3ZhbGlkYXRlSW5wdXQ6IElJbnB1dFZhbGlkYXRvciA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdGdldCB2YWxpZGF0ZUlucHV0KCk6IElJbnB1dFZhbGlkYXRvciB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbGlkYXRlSW5wdXQ7XG5cdH1cblxuXHRzZXQgdmFsaWRhdGVJbnB1dCh2YWxpZGF0ZUlucHV0OiBJSW5wdXRWYWxpZGF0b3IpIHtcblx0XHR0aGlzLl92YWxpZGF0ZUlucHV0ID0gdmFsaWRhdGVJbnB1dDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbGlkYXRlSW5wdXQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWYWxpZGF0ZUlucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmFsaWRhdGVJbnB1dDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVZhbGlkYXRlSW5wdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBoaXN0b3J5TmF2aWdhdG9yOiBIaXN0b3J5TmF2aWdhdG9yMjxzdHJpbmc+O1xuXHRwcml2YXRlIGRpZENoYW5nZUhpc3Rvcnk6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhpc3Rvcnk6IFNDTUlucHV0SGlzdG9yeVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKHRoaXMucmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpKSB7XG5cdFx0XHR0aGlzLmhpc3RvcnlOYXZpZ2F0b3IgPSBoaXN0b3J5LmdldEhpc3RvcnkodGhpcy5yZXBvc2l0b3J5LnByb3ZpZGVyLmxhYmVsLCB0aGlzLnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhpc3Rvcnkub25XaWxsU2F2ZUhpc3RvcnkoZXZlbnQgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5oaXN0b3J5TmF2aWdhdG9yLmlzQXRFbmQoKSkge1xuXHRcdFx0XHRcdHRoaXMuc2F2ZVZhbHVlKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5kaWRDaGFuZ2VIaXN0b3J5KSB7XG5cdFx0XHRcdFx0ZXZlbnQuaGlzdG9yeURpZEluZGVlZENoYW5nZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5kaWRDaGFuZ2VIaXN0b3J5ID0gZmFsc2U7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHsgLy8gaW4gbWVtb3J5IG9ubHlcblx0XHRcdHRoaXMuaGlzdG9yeU5hdmlnYXRvciA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yMihbJyddLCAxMDApO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZhbHVlID0gdGhpcy5oaXN0b3J5TmF2aWdhdG9yLmN1cnJlbnQoKTtcblx0fVxuXG5cdHNldFZhbHVlKHZhbHVlOiBzdHJpbmcsIHRyYW5zaWVudDogYm9vbGVhbiwgcmVhc29uPzogU0NNSW5wdXRDaGFuZ2VSZWFzb24pIHtcblx0XHRpZiAodmFsdWUgPT09IHRoaXMuX3ZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0cmFuc2llbnQpIHtcblx0XHRcdHRoaXMuaGlzdG9yeU5hdmlnYXRvci5yZXBsYWNlTGFzdCh0aGlzLl92YWx1ZSk7XG5cdFx0XHR0aGlzLmhpc3RvcnlOYXZpZ2F0b3IuYWRkKHZhbHVlKTtcblx0XHRcdHRoaXMuZGlkQ2hhbmdlSGlzdG9yeSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgdmFsdWUsIHJlYXNvbiB9KTtcblx0fVxuXG5cdHNob3dOZXh0SGlzdG9yeVZhbHVlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmhpc3RvcnlOYXZpZ2F0b3IuaXNBdEVuZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmICghdGhpcy5oaXN0b3J5TmF2aWdhdG9yLmhhcyh0aGlzLnZhbHVlKSkge1xuXHRcdFx0dGhpcy5zYXZlVmFsdWUoKTtcblx0XHRcdHRoaXMuaGlzdG9yeU5hdmlnYXRvci5yZXNldEN1cnNvcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5oaXN0b3J5TmF2aWdhdG9yLm5leHQoKTtcblx0XHR0aGlzLnNldFZhbHVlKHZhbHVlLCB0cnVlLCBTQ01JbnB1dENoYW5nZVJlYXNvbi5IaXN0b3J5TmV4dCk7XG5cdH1cblxuXHRzaG93UHJldmlvdXNIaXN0b3J5VmFsdWUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGlzdG9yeU5hdmlnYXRvci5pc0F0RW5kKCkpIHtcblx0XHRcdHRoaXMuc2F2ZVZhbHVlKCk7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5oaXN0b3J5TmF2aWdhdG9yLmhhcyh0aGlzLl92YWx1ZSkpIHtcblx0XHRcdHRoaXMuc2F2ZVZhbHVlKCk7XG5cdFx0XHR0aGlzLmhpc3RvcnlOYXZpZ2F0b3IucmVzZXRDdXJzb3IoKTtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuaGlzdG9yeU5hdmlnYXRvci5wcmV2aW91cygpO1xuXHRcdHRoaXMuc2V0VmFsdWUodmFsdWUsIHRydWUsIFNDTUlucHV0Q2hhbmdlUmVhc29uLkhpc3RvcnlQcmV2aW91cyk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVWYWx1ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBvbGRWYWx1ZSA9IHRoaXMuaGlzdG9yeU5hdmlnYXRvci5yZXBsYWNlTGFzdCh0aGlzLl92YWx1ZSk7XG5cdFx0dGhpcy5kaWRDaGFuZ2VIaXN0b3J5ID0gdGhpcy5kaWRDaGFuZ2VIaXN0b3J5IHx8IChvbGRWYWx1ZSAhPT0gdGhpcy5fdmFsdWUpO1xuXHR9XG59XG5cbmNsYXNzIFNDTVJlcG9zaXRvcnkgaW1wbGVtZW50cyBJU0NNUmVwb3NpdG9yeSB7XG5cblx0cHJpdmF0ZSBfc2VsZWN0ZWQgPSBmYWxzZTtcblx0Z2V0IHNlbGVjdGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gbmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb246IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZXZlbnQ7XG5cblx0cmVhZG9ubHkgaW5wdXQ6IElTQ01JbnB1dCAmIElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcm92aWRlcjogSVNDTVByb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRpbnB1dEhpc3Rvcnk6IFNDTUlucHV0SGlzdG9yeVxuXHQpIHtcblx0XHR0aGlzLmlucHV0ID0gbmV3IFNDTUlucHV0KHRoaXMsIGlucHV0SGlzdG9yeSk7XG5cdH1cblxuXHRzZXRTZWxlY3RlZChzZWxlY3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zZWxlY3RlZCA9PT0gc2VsZWN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZWxlY3RlZCA9IHNlbGVjdGVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoc2VsZWN0ZWQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5pbnB1dC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5wcm92aWRlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgV2lsbFNhdmVIaXN0b3J5RXZlbnQge1xuXHRwcml2YXRlIF9kaWRDaGFuZ2VIaXN0b3J5ID0gZmFsc2U7XG5cdGdldCBkaWRDaGFuZ2VIaXN0b3J5KCkgeyByZXR1cm4gdGhpcy5fZGlkQ2hhbmdlSGlzdG9yeTsgfVxuXHRoaXN0b3J5RGlkSW5kZWVkQ2hhbmdlKCkgeyB0aGlzLl9kaWRDaGFuZ2VIaXN0b3J5ID0gdHJ1ZTsgfVxufVxuXG5jbGFzcyBTQ01JbnB1dEhpc3Rvcnkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgaGlzdG9yaWVzID0gbmV3IE1hcDxzdHJpbmcsIFJlc291cmNlTWFwPEhpc3RvcnlOYXZpZ2F0b3IyPHN0cmluZz4+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFNhdmVIaXN0b3J5ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8V2lsbFNhdmVIaXN0b3J5RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxTYXZlSGlzdG9yeSA9IHRoaXMuX29uV2lsbFNhdmVIaXN0b3J5LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmhpc3RvcmllcyA9IG5ldyBNYXAoKTtcblxuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxbc3RyaW5nLCBVUkksIHN0cmluZ1tdXVtdPignc2NtLmhpc3RvcnknLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBbXSk7XG5cblx0XHRmb3IgKGNvbnN0IFtwcm92aWRlckxhYmVsLCByb290VXJpLCBoaXN0b3J5XSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRsZXQgcHJvdmlkZXJIaXN0b3JpZXMgPSB0aGlzLmhpc3Rvcmllcy5nZXQocHJvdmlkZXJMYWJlbCk7XG5cblx0XHRcdGlmICghcHJvdmlkZXJIaXN0b3JpZXMpIHtcblx0XHRcdFx0cHJvdmlkZXJIaXN0b3JpZXMgPSBuZXcgUmVzb3VyY2VNYXAoKTtcblx0XHRcdFx0dGhpcy5oaXN0b3JpZXMuc2V0KHByb3ZpZGVyTGFiZWwsIHByb3ZpZGVySGlzdG9yaWVzKTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdmlkZXJIaXN0b3JpZXMuc2V0KHJvb3RVcmksIG5ldyBIaXN0b3J5TmF2aWdhdG9yMihoaXN0b3J5LCAxMDApKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5taWdyYXRlU3RvcmFnZSgpKSB7XG5cdFx0XHR0aGlzLnNhdmVUb1N0b3JhZ2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ3NjbS5oaXN0b3J5JywgdGhpcy5kaXNwb3NhYmxlcykoZSA9PiB7XG5cdFx0XHRpZiAoZS5leHRlcm5hbCAmJiBlLmtleSA9PT0gJ3NjbS5oaXN0b3J5Jykge1xuXHRcdFx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxbc3RyaW5nLCBVUkksIHN0cmluZ1tdXVtdPignc2NtLmhpc3RvcnknLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBbXSk7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBbcHJvdmlkZXJMYWJlbCwgdXJpLCByYXdIaXN0b3J5XSBvZiByYXcpIHtcblx0XHRcdFx0XHRjb25zdCBoaXN0b3J5ID0gdGhpcy5nZXRIaXN0b3J5KHByb3ZpZGVyTGFiZWwsIHVyaSk7XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIEl0ZXJhYmxlLnJldmVyc2UocmF3SGlzdG9yeSkpIHtcblx0XHRcdFx0XHRcdGhpc3RvcnkucHJlcGVuZCh2YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoXyA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBXaWxsU2F2ZUhpc3RvcnlFdmVudCgpO1xuXHRcdFx0dGhpcy5fb25XaWxsU2F2ZUhpc3RvcnkuZmlyZShldmVudCk7XG5cblx0XHRcdGlmIChldmVudC5kaWRDaGFuZ2VIaXN0b3J5KSB7XG5cdFx0XHRcdHRoaXMuc2F2ZVRvU3RvcmFnZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc2F2ZVRvU3RvcmFnZSgpOiB2b2lkIHtcblx0XHRjb25zdCByYXc6IFtzdHJpbmcsIFVSSSwgc3RyaW5nW11dW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgW3Byb3ZpZGVyTGFiZWwsIHByb3ZpZGVySGlzdG9yaWVzXSBvZiB0aGlzLmhpc3Rvcmllcykge1xuXHRcdFx0Zm9yIChjb25zdCBbcm9vdFVyaSwgaGlzdG9yeV0gb2YgcHJvdmlkZXJIaXN0b3JpZXMpIHtcblx0XHRcdFx0aWYgKCEoaGlzdG9yeS5zaXplID09PSAxICYmIGhpc3RvcnkuY3VycmVudCgpID09PSAnJykpIHtcblx0XHRcdFx0XHRyYXcucHVzaChbcHJvdmlkZXJMYWJlbCwgcm9vdFVyaSwgWy4uLmhpc3RvcnldXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzY20uaGlzdG9yeScsIHJhdywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdGdldEhpc3RvcnkocHJvdmlkZXJMYWJlbDogc3RyaW5nLCByb290VXJpOiBVUkkpOiBIaXN0b3J5TmF2aWdhdG9yMjxzdHJpbmc+IHtcblx0XHRsZXQgcHJvdmlkZXJIaXN0b3JpZXMgPSB0aGlzLmhpc3Rvcmllcy5nZXQocHJvdmlkZXJMYWJlbCk7XG5cblx0XHRpZiAoIXByb3ZpZGVySGlzdG9yaWVzKSB7XG5cdFx0XHRwcm92aWRlckhpc3RvcmllcyA9IG5ldyBSZXNvdXJjZU1hcCgpO1xuXHRcdFx0dGhpcy5oaXN0b3JpZXMuc2V0KHByb3ZpZGVyTGFiZWwsIHByb3ZpZGVySGlzdG9yaWVzKTtcblx0XHR9XG5cblx0XHRsZXQgaGlzdG9yeSA9IHByb3ZpZGVySGlzdG9yaWVzLmdldChyb290VXJpKTtcblxuXHRcdGlmICghaGlzdG9yeSkge1xuXHRcdFx0aGlzdG9yeSA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yMihbJyddLCAxMDApO1xuXHRcdFx0cHJvdmlkZXJIaXN0b3JpZXMuc2V0KHJvb3RVcmksIGhpc3RvcnkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBoaXN0b3J5O1xuXHR9XG5cblx0Ly8gTWlncmF0ZXMgZnJvbSBBcHBsaWNhdGlvbiBzY29wZSBzdG9yYWdlIHRvIFdvcmtzcGFjZSBzY29wZS5cblx0Ly8gVE9ET0Bqb2FvbW9yZW5vOiBDaGFuZ2UgZnJvbSBKYW51YXJ5IDIwMjQgb253YXJkcyBzdWNoIHRoYXQgdGhlIG9ubHkgY29kZSBpcyB0byByZW1vdmUgYWxsIGBzY20vaW5wdXQ6YCBzdG9yYWdlIGtleXNcblx0cHJpdmF0ZSBtaWdyYXRlU3RvcmFnZSgpOiBib29sZWFuIHtcblx0XHRsZXQgZGlkU29tZXRoaW5nQ2hhbmdlID0gZmFsc2U7XG5cdFx0Y29uc3QgbWFjaGluZUtleXMgPSBJdGVyYWJsZS5maWx0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5rZXlzKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKSwga2V5ID0+IGtleS5zdGFydHNXaXRoKCdzY20vaW5wdXQ6JykpO1xuXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgbWFjaGluZUtleXMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGxlZ2FjeUhpc3RvcnkgPSBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCAnJykpO1xuXHRcdFx0XHRjb25zdCBtYXRjaCA9IC9ec2NtXFwvaW5wdXQ6KFteOl0rKTooLispJC8uZXhlYyhrZXkpO1xuXG5cdFx0XHRcdGlmICghbWF0Y2ggfHwgIUFycmF5LmlzQXJyYXkobGVnYWN5SGlzdG9yeT8uaGlzdG9yeSkgfHwgIU51bWJlci5pc0ludGVnZXIobGVnYWN5SGlzdG9yeT8udGltZXN0YW1wKSkge1xuXHRcdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IFssIHByb3ZpZGVyTGFiZWwsIHJvb3RQYXRoXSA9IG1hdGNoO1xuXHRcdFx0XHRjb25zdCByb290VXJpID0gVVJJLmZpbGUocm9vdFBhdGgpO1xuXG5cdFx0XHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyb290VXJpKSkge1xuXHRcdFx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0aGlzLmdldEhpc3RvcnkocHJvdmlkZXJMYWJlbCwgcm9vdFVyaSk7XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIEl0ZXJhYmxlLnJldmVyc2UobGVnYWN5SGlzdG9yeS5oaXN0b3J5IGFzIHN0cmluZ1tdKSkge1xuXHRcdFx0XHRcdFx0aGlzdG9yeS5wcmVwZW5kKGVudHJ5KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRkaWRTb21ldGhpbmdDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZGlkU29tZXRoaW5nQ2hhbmdlO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBTQ01TZXJ2aWNlIGltcGxlbWVudHMgSVNDTVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdF9yZXBvc2l0b3JpZXMgPSBuZXcgTWFwPHN0cmluZywgSVNDTVJlcG9zaXRvcnk+KCk7ICAvLyB1c2VkIGluIHRlc3RzXG5cdGdldCByZXBvc2l0b3JpZXMoKTogSXRlcmFibGU8SVNDTVJlcG9zaXRvcnk+IHsgcmV0dXJuIHRoaXMuX3JlcG9zaXRvcmllcy52YWx1ZXMoKTsgfVxuXHRnZXQgcmVwb3NpdG9yeUNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9yZXBvc2l0b3JpZXMuc2l6ZTsgfVxuXG5cdHByaXZhdGUgaW5wdXRIaXN0b3J5OiBTQ01JbnB1dEhpc3Rvcnk7XG5cdHByaXZhdGUgcHJvdmlkZXJDb3VudDogSUNvbnRleHRLZXk8bnVtYmVyPjtcblx0cHJpdmF0ZSBoaXN0b3J5UHJvdmlkZXJDb3VudDogSUNvbnRleHRLZXk8bnVtYmVyPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZFByb3ZpZGVyID0gbmV3IEVtaXR0ZXI8SVNDTVJlcG9zaXRvcnk+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkUmVwb3NpdG9yeTogRXZlbnQ8SVNDTVJlcG9zaXRvcnk+ID0gdGhpcy5fb25EaWRBZGRQcm92aWRlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZVByb3ZpZGVyID0gbmV3IEVtaXR0ZXI8SVNDTVJlcG9zaXRvcnk+KCk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlUmVwb3NpdG9yeTogRXZlbnQ8SVNDTVJlcG9zaXRvcnk+ID0gdGhpcy5fb25EaWRSZW1vdmVQcm92aWRlci5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLmlucHV0SGlzdG9yeSA9IG5ldyBTQ01JbnB1dEhpc3Rvcnkoc3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblxuXHRcdHRoaXMucHJvdmlkZXJDb3VudCA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnc2NtLnByb3ZpZGVyQ291bnQnLCAwKTtcblx0XHR0aGlzLmhpc3RvcnlQcm92aWRlckNvdW50ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdzY20uaGlzdG9yeVByb3ZpZGVyQ291bnQnLCAwKTtcblx0fVxuXG5cdHJlZ2lzdGVyU0NNUHJvdmlkZXIocHJvdmlkZXI6IElTQ01Qcm92aWRlcik6IElTQ01SZXBvc2l0b3J5IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1NDTVNlcnZpY2UjcmVnaXN0ZXJTQ01Qcm92aWRlcicpO1xuXG5cdFx0aWYgKHRoaXMuX3JlcG9zaXRvcmllcy5oYXMocHJvdmlkZXIuaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNDTSBQcm92aWRlciAke3Byb3ZpZGVyLmlkfSBhbHJlYWR5IGV4aXN0cy5gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlckNvdW50ID0gKCkgPT4ge1xuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fcmVwb3NpdG9yaWVzLnZhbHVlcygpKVxuXHRcdFx0XHQuZmlsdGVyKHIgPT4gISFyLnByb3ZpZGVyLmhpc3RvcnlQcm92aWRlci5nZXQoKSkubGVuZ3RoO1xuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlcG9zaXRvcmllcy5kZWxldGUocHJvdmlkZXIuaWQpO1xuXHRcdFx0dGhpcy5fb25EaWRSZW1vdmVQcm92aWRlci5maXJlKHJlcG9zaXRvcnkpO1xuXG5cdFx0XHR0aGlzLnByb3ZpZGVyQ291bnQuc2V0KHRoaXMuX3JlcG9zaXRvcmllcy5zaXplKTtcblx0XHRcdHRoaXMuaGlzdG9yeVByb3ZpZGVyQ291bnQuc2V0KGhpc3RvcnlQcm92aWRlckNvdW50KCkpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBuZXcgU0NNUmVwb3NpdG9yeShwcm92aWRlci5pZCwgcHJvdmlkZXIsIGRpc3Bvc2FibGVzLCB0aGlzLmlucHV0SGlzdG9yeSk7XG5cdFx0dGhpcy5fcmVwb3NpdG9yaWVzLnNldChwcm92aWRlci5pZCwgcmVwb3NpdG9yeSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocnVuT25DaGFuZ2UocHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmhpc3RvcnlQcm92aWRlckNvdW50LnNldChoaXN0b3J5UHJvdmlkZXJDb3VudCgpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnByb3ZpZGVyQ291bnQuc2V0KHRoaXMuX3JlcG9zaXRvcmllcy5zaXplKTtcblx0XHR0aGlzLmhpc3RvcnlQcm92aWRlckNvdW50LnNldChoaXN0b3J5UHJvdmlkZXJDb3VudCgpKTtcblxuXHRcdHRoaXMuX29uRGlkQWRkUHJvdmlkZXIuZmlyZShyZXBvc2l0b3J5KTtcblxuXHRcdHJldHVybiByZXBvc2l0b3J5O1xuXHR9XG5cblx0Z2V0UmVwb3NpdG9yeShpZDogc3RyaW5nKTogSVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQ7XG5cdGdldFJlcG9zaXRvcnkocmVzb3VyY2U6IFVSSSk6IElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkO1xuXHRnZXRSZXBvc2l0b3J5KGlkT3JSZXNvdXJjZTogc3RyaW5nIHwgVVJJKTogSVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgaWRPclJlc291cmNlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoaWRPclJlc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAoaWRPclJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlICYmXG5cdFx0XHRpZE9yUmVzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgYmVzdFJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBiZXN0TWF0Y2hMZW5ndGggPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdGlmIChyZXBvc2l0b3J5LnByb3ZpZGVyLmlzSGlkZGVuID09PSB0cnVlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByb290ID0gcmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpO1xuXG5cdFx0XHRpZiAoIXJvb3QpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhdGggPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkucmVsYXRpdmVQYXRoKHJvb3QsIGlkT3JSZXNvdXJjZSk7XG5cblx0XHRcdGlmIChwYXRoICYmICEvXlxcLlxcLi8udGVzdChwYXRoKSAmJiBwYXRoLmxlbmd0aCA8IGJlc3RNYXRjaExlbmd0aCkge1xuXHRcdFx0XHRiZXN0UmVwb3NpdG9yeSA9IHJlcG9zaXRvcnk7XG5cdFx0XHRcdGJlc3RNYXRjaExlbmd0aCA9IHBhdGgubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBiZXN0UmVwb3NpdG9yeTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFnQixlQUFlO0FBQy9CLFNBQXNHLDRCQUFtRTtBQUN6SyxTQUFTLG1CQUFtQjtBQUM1QixTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUU1QixNQUFNLGlCQUFpQixXQUFnQztBQUFBLEVBMkZ0RCxZQUNVLFlBQ1EsU0FDaEI7QUFDRCxVQUFNO0FBSEc7QUFDUTtBQTNGbEIsU0FBUSxTQUFTO0FBTWpCLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBOEIsQ0FBQztBQUNsRixTQUFTLGNBQTJDLEtBQUssYUFBYTtBQUV0RSxTQUFRLGVBQWU7QUFXdkIsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLFFBQWdCLENBQUM7QUFDL0UsU0FBUyx5QkFBd0MsS0FBSyx3QkFBd0I7QUFFOUUsU0FBUSxXQUFXO0FBV25CLFNBQWlCLHlCQUF5QixLQUFLLFVBQVUsSUFBSSxRQUFpQixDQUFDO0FBQy9FLFNBQVMsd0JBQXdDLEtBQUssdUJBQXVCO0FBRTdFLFNBQVEsV0FBVztBQVduQixTQUFpQix5QkFBeUIsS0FBSyxVQUFVLElBQUksUUFBaUIsQ0FBQztBQUMvRSxTQUFTLHdCQUF3QyxLQUFLLHVCQUF1QjtBQU03RSxTQUFpQixvQkFBb0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3ZFLFNBQVMsbUJBQWdDLEtBQUssa0JBQWtCO0FBTWhFLFNBQWlCLGdDQUFnQyxLQUFLLFVBQVUsSUFBSSxRQUEwQixDQUFDO0FBQy9GLFNBQVMsK0JBQXdELEtBQUssOEJBQThCO0FBTXBHLFNBQWlCLHdCQUF3QixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDM0UsU0FBUyx1QkFBb0MsS0FBSyxzQkFBc0I7QUFFeEUsU0FBUSxpQkFBa0MsTUFBTSxRQUFRLFFBQVEsTUFBUztBQVd6RSxTQUFpQiw0QkFBNEIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQy9FLFNBQVMsMkJBQXdDLEtBQUssMEJBQTBCO0FBR2hGLFNBQVEsbUJBQTRCO0FBUW5DLFFBQUksS0FBSyxXQUFXLFNBQVMsU0FBUztBQUNyQyxXQUFLLG1CQUFtQixRQUFRLFdBQVcsS0FBSyxXQUFXLFNBQVMsT0FBTyxLQUFLLFdBQVcsU0FBUyxPQUFPO0FBQzNHLFdBQUssVUFBVSxLQUFLLFFBQVEsa0JBQWtCLFdBQVM7QUFDdEQsWUFBSSxLQUFLLGlCQUFpQixRQUFRLEdBQUc7QUFDcEMsZUFBSyxVQUFVO0FBQUEsUUFDaEI7QUFFQSxZQUFJLEtBQUssa0JBQWtCO0FBQzFCLGdCQUFNLHVCQUF1QjtBQUFBLFFBQzlCO0FBRUEsYUFBSyxtQkFBbUI7QUFBQSxNQUN6QixDQUFDLENBQUM7QUFBQSxJQUNILE9BQU87QUFDTixXQUFLLG1CQUFtQixJQUFJLGtCQUFrQixDQUFDLEVBQUUsR0FBRyxHQUFHO0FBQUEsSUFDeEQ7QUFFQSxTQUFLLFNBQVMsS0FBSyxpQkFBaUIsUUFBUTtBQUFBLEVBQzdDO0FBQUEsRUEvR0EsSUFBSSxRQUFnQjtBQUNuQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFPQSxJQUFJLGNBQXNCO0FBQ3pCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksWUFBWSxhQUFxQjtBQUNwQyxTQUFLLGVBQWU7QUFDcEIsU0FBSyx3QkFBd0IsS0FBSyxXQUFXO0FBQUEsRUFDOUM7QUFBQSxFQU9BLElBQUksVUFBbUI7QUFDdEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxRQUFRLFNBQWtCO0FBQzdCLFNBQUssV0FBVztBQUNoQixTQUFLLHVCQUF1QixLQUFLLE9BQU87QUFBQSxFQUN6QztBQUFBLEVBT0EsSUFBSSxVQUFtQjtBQUN0QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFFBQVEsU0FBa0I7QUFDN0IsU0FBSyxXQUFXO0FBQ2hCLFNBQUssdUJBQXVCLEtBQUssT0FBTztBQUFBLEVBQ3pDO0FBQUEsRUFLQSxXQUFpQjtBQUNoQixTQUFLLGtCQUFrQixLQUFLO0FBQUEsRUFDN0I7QUFBQSxFQUtBLHNCQUFzQixTQUFtQyxNQUFpQztBQUN6RixTQUFLLDhCQUE4QixLQUFLLEVBQUUsU0FBa0IsS0FBVyxDQUFDO0FBQUEsRUFDekU7QUFBQSxFQUtBLGtCQUF3QjtBQUN2QixTQUFLLHNCQUFzQixLQUFLO0FBQUEsRUFDakM7QUFBQSxFQU9BLElBQUksZ0JBQWlDO0FBQ3BDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksY0FBYyxlQUFnQztBQUNqRCxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLDBCQUEwQixLQUFLO0FBQUEsRUFDckM7QUFBQSxFQWtDQSxTQUFTLE9BQWUsV0FBb0IsUUFBK0I7QUFDMUUsUUFBSSxVQUFVLEtBQUssUUFBUTtBQUMxQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsV0FBVztBQUNmLFdBQUssaUJBQWlCLFlBQVksS0FBSyxNQUFNO0FBQzdDLFdBQUssaUJBQWlCLElBQUksS0FBSztBQUMvQixXQUFLLG1CQUFtQjtBQUFBLElBQ3pCO0FBRUEsU0FBSyxTQUFTO0FBQ2QsU0FBSyxhQUFhLEtBQUssRUFBRSxPQUFPLE9BQU8sQ0FBQztBQUFBLEVBQ3pDO0FBQUEsRUFFQSx1QkFBNkI7QUFDNUIsUUFBSSxLQUFLLGlCQUFpQixRQUFRLEdBQUc7QUFDcEM7QUFBQSxJQUNELFdBQVcsQ0FBQyxLQUFLLGlCQUFpQixJQUFJLEtBQUssS0FBSyxHQUFHO0FBQ2xELFdBQUssVUFBVTtBQUNmLFdBQUssaUJBQWlCLFlBQVk7QUFBQSxJQUNuQztBQUVBLFVBQU0sUUFBUSxLQUFLLGlCQUFpQixLQUFLO0FBQ3pDLFNBQUssU0FBUyxPQUFPLE1BQU0scUJBQXFCLFdBQVc7QUFBQSxFQUM1RDtBQUFBLEVBRUEsMkJBQWlDO0FBQ2hDLFFBQUksS0FBSyxpQkFBaUIsUUFBUSxHQUFHO0FBQ3BDLFdBQUssVUFBVTtBQUFBLElBQ2hCLFdBQVcsQ0FBQyxLQUFLLGlCQUFpQixJQUFJLEtBQUssTUFBTSxHQUFHO0FBQ25ELFdBQUssVUFBVTtBQUNmLFdBQUssaUJBQWlCLFlBQVk7QUFBQSxJQUNuQztBQUVBLFVBQU0sUUFBUSxLQUFLLGlCQUFpQixTQUFTO0FBQzdDLFNBQUssU0FBUyxPQUFPLE1BQU0scUJBQXFCLGVBQWU7QUFBQSxFQUNoRTtBQUFBLEVBRVEsWUFBa0I7QUFDekIsVUFBTSxXQUFXLEtBQUssaUJBQWlCLFlBQVksS0FBSyxNQUFNO0FBQzlELFNBQUssbUJBQW1CLEtBQUssb0JBQXFCLGFBQWEsS0FBSztBQUFBLEVBQ3JFO0FBQ0Q7QUFFQSxNQUFNLGNBQXdDO0FBQUEsRUFZN0MsWUFDaUIsSUFDQSxVQUNDLGFBQ2pCLGNBQ0M7QUFKZTtBQUNBO0FBQ0M7QUFibEIsU0FBUSxZQUFZO0FBS3BCLFNBQWlCLHdCQUF3QixJQUFJLFFBQWlCO0FBQzlELFNBQVMsdUJBQXVDLEtBQUssc0JBQXNCO0FBVTFFLFNBQUssUUFBUSxJQUFJLFNBQVMsTUFBTSxZQUFZO0FBQUEsRUFDN0M7QUFBQSxFQWhCQSxJQUFJLFdBQW9CO0FBQ3ZCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQWdCQSxZQUFZLFVBQXlCO0FBQ3BDLFFBQUksS0FBSyxjQUFjLFVBQVU7QUFDaEM7QUFBQSxJQUNEO0FBRUEsU0FBSyxZQUFZO0FBQ2pCLFNBQUssc0JBQXNCLEtBQUssUUFBUTtBQUFBLEVBQ3pDO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssWUFBWSxRQUFRO0FBQ3pCLFNBQUssc0JBQXNCLFFBQVE7QUFDbkMsU0FBSyxNQUFNLFFBQVE7QUFDbkIsU0FBSyxTQUFTLFFBQVE7QUFBQSxFQUN2QjtBQUNEO0FBRUEsTUFBTSxxQkFBcUI7QUFBQSxFQUEzQjtBQUNDLFNBQVEsb0JBQW9CO0FBQUE7QUFBQSxFQUM1QixJQUFJLG1CQUFtQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQW1CO0FBQUEsRUFDeEQseUJBQXlCO0FBQUUsU0FBSyxvQkFBb0I7QUFBQSxFQUFNO0FBQzNEO0FBRUEsSUFBTSxrQkFBTixNQUFzQjtBQUFBLEVBUXJCLFlBQzBCLGdCQUNTLHlCQUNqQztBQUZ3QjtBQUNTO0FBUm5DLFNBQWlCLGNBQWMsSUFBSSxnQkFBZ0I7QUFDbkQsU0FBaUIsWUFBWSxvQkFBSSxJQUFvRDtBQUVyRixTQUFpQixxQkFBcUIsS0FBSyxZQUFZLElBQUksSUFBSSxRQUE4QixDQUFDO0FBQzlGLFNBQVMsb0JBQW9CLEtBQUssbUJBQW1CO0FBTXBELFNBQUssWUFBWSxvQkFBSSxJQUFJO0FBRXpCLFVBQU0sVUFBVSxLQUFLLGVBQWUsVUFBcUMsZUFBZSxhQUFhLFdBQVcsQ0FBQyxDQUFDO0FBRWxILGVBQVcsQ0FBQyxlQUFlLFNBQVMsT0FBTyxLQUFLLFNBQVM7QUFDeEQsVUFBSSxvQkFBb0IsS0FBSyxVQUFVLElBQUksYUFBYTtBQUV4RCxVQUFJLENBQUMsbUJBQW1CO0FBQ3ZCLDRCQUFvQixJQUFJLFlBQVk7QUFDcEMsYUFBSyxVQUFVLElBQUksZUFBZSxpQkFBaUI7QUFBQSxNQUNwRDtBQUVBLHdCQUFrQixJQUFJLFNBQVMsSUFBSSxrQkFBa0IsU0FBUyxHQUFHLENBQUM7QUFBQSxJQUNuRTtBQUVBLFFBQUksS0FBSyxlQUFlLEdBQUc7QUFDMUIsV0FBSyxjQUFjO0FBQUEsSUFDcEI7QUFFQSxTQUFLLFlBQVksSUFBSSxLQUFLLGVBQWUsaUJBQWlCLGFBQWEsV0FBVyxlQUFlLEtBQUssV0FBVyxFQUFFLE9BQUs7QUFDdkgsVUFBSSxFQUFFLFlBQVksRUFBRSxRQUFRLGVBQWU7QUFDMUMsY0FBTSxNQUFNLEtBQUssZUFBZSxVQUFxQyxlQUFlLGFBQWEsV0FBVyxDQUFDLENBQUM7QUFFOUcsbUJBQVcsQ0FBQyxlQUFlLEtBQUssVUFBVSxLQUFLLEtBQUs7QUFDbkQsZ0JBQU0sVUFBVSxLQUFLLFdBQVcsZUFBZSxHQUFHO0FBRWxELHFCQUFXLFNBQVMsU0FBUyxRQUFRLFVBQVUsR0FBRztBQUNqRCxvQkFBUSxRQUFRLEtBQUs7QUFBQSxVQUN0QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFlBQVksSUFBSSxLQUFLLGVBQWUsZ0JBQWdCLE9BQUs7QUFDN0QsWUFBTSxRQUFRLElBQUkscUJBQXFCO0FBQ3ZDLFdBQUssbUJBQW1CLEtBQUssS0FBSztBQUVsQyxVQUFJLE1BQU0sa0JBQWtCO0FBQzNCLGFBQUssY0FBYztBQUFBLE1BQ3BCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxnQkFBc0I7QUFDN0IsVUFBTSxNQUFpQyxDQUFDO0FBRXhDLGVBQVcsQ0FBQyxlQUFlLGlCQUFpQixLQUFLLEtBQUssV0FBVztBQUNoRSxpQkFBVyxDQUFDLFNBQVMsT0FBTyxLQUFLLG1CQUFtQjtBQUNuRCxZQUFJLEVBQUUsUUFBUSxTQUFTLEtBQUssUUFBUSxRQUFRLE1BQU0sS0FBSztBQUN0RCxjQUFJLEtBQUssQ0FBQyxlQUFlLFNBQVMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxDQUFDO0FBQUEsUUFDaEQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssZUFBZSxNQUFNLGVBQWUsS0FBSyxhQUFhLFdBQVcsY0FBYyxJQUFJO0FBQUEsRUFDekY7QUFBQSxFQUVBLFdBQVcsZUFBdUIsU0FBeUM7QUFDMUUsUUFBSSxvQkFBb0IsS0FBSyxVQUFVLElBQUksYUFBYTtBQUV4RCxRQUFJLENBQUMsbUJBQW1CO0FBQ3ZCLDBCQUFvQixJQUFJLFlBQVk7QUFDcEMsV0FBSyxVQUFVLElBQUksZUFBZSxpQkFBaUI7QUFBQSxJQUNwRDtBQUVBLFFBQUksVUFBVSxrQkFBa0IsSUFBSSxPQUFPO0FBRTNDLFFBQUksQ0FBQyxTQUFTO0FBQ2IsZ0JBQVUsSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLEdBQUcsR0FBRztBQUN6Qyx3QkFBa0IsSUFBSSxTQUFTLE9BQU87QUFBQSxJQUN2QztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBLEVBSVEsaUJBQTBCO0FBQ2pDLFFBQUkscUJBQXFCO0FBQ3pCLFVBQU0sY0FBYyxTQUFTLE9BQU8sS0FBSyxlQUFlLEtBQUssYUFBYSxhQUFhLGNBQWMsT0FBTyxHQUFHLFNBQU8sSUFBSSxXQUFXLFlBQVksQ0FBQztBQUVsSixlQUFXLE9BQU8sYUFBYTtBQUM5QixVQUFJO0FBQ0gsY0FBTSxnQkFBZ0IsS0FBSyxNQUFNLEtBQUssZUFBZSxJQUFJLEtBQUssYUFBYSxhQUFhLEVBQUUsQ0FBQztBQUMzRixjQUFNLFFBQVEsNEJBQTRCLEtBQUssR0FBRztBQUVsRCxZQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sUUFBUSxlQUFlLE9BQU8sS0FBSyxDQUFDLE9BQU8sVUFBVSxlQUFlLFNBQVMsR0FBRztBQUNwRyxlQUFLLGVBQWUsT0FBTyxLQUFLLGFBQWEsV0FBVztBQUN4RDtBQUFBLFFBQ0Q7QUFFQSxjQUFNLENBQUMsRUFBRSxlQUFlLFFBQVEsSUFBSTtBQUNwQyxjQUFNLFVBQVUsSUFBSSxLQUFLLFFBQVE7QUFFakMsWUFBSSxLQUFLLHdCQUF3QixtQkFBbUIsT0FBTyxHQUFHO0FBQzdELGdCQUFNLFVBQVUsS0FBSyxXQUFXLGVBQWUsT0FBTztBQUV0RCxxQkFBVyxTQUFTLFNBQVMsUUFBUSxjQUFjLE9BQW1CLEdBQUc7QUFDeEUsb0JBQVEsUUFBUSxLQUFLO0FBQUEsVUFDdEI7QUFFQSwrQkFBcUI7QUFDckIsZUFBSyxlQUFlLE9BQU8sS0FBSyxhQUFhLFdBQVc7QUFBQSxRQUN6RDtBQUFBLE1BQ0QsUUFBUTtBQUNQLGFBQUssZUFBZSxPQUFPLEtBQUssYUFBYSxXQUFXO0FBQUEsTUFDekQ7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFVBQVU7QUFDVCxTQUFLLFlBQVksUUFBUTtBQUFBLEVBQzFCO0FBQ0Q7QUEvSE0sa0JBQU47QUFBQSxFQVNHO0FBQUEsRUFDQTtBQUFBLEdBVkc7QUFrSUMsSUFBTSxhQUFOLE1BQXdDO0FBQUEsRUFrQjlDLFlBQytCLFlBQ0oseUJBQ04sbUJBQ0gsZ0JBQ3FCLG9CQUNyQztBQUw2QjtBQUlRO0FBbkJ2Qyx5QkFBZ0Isb0JBQUksSUFBNEI7QUFRaEQsU0FBaUIsb0JBQW9CLElBQUksUUFBd0I7QUFDakUsU0FBUyxxQkFBNEMsS0FBSyxrQkFBa0I7QUFFNUUsU0FBaUIsdUJBQXVCLElBQUksUUFBd0I7QUFDcEUsU0FBUyx3QkFBK0MsS0FBSyxxQkFBcUI7QUFTakYsU0FBSyxlQUFlLElBQUksZ0JBQWdCLGdCQUFnQix1QkFBdUI7QUFFL0UsU0FBSyxnQkFBZ0Isa0JBQWtCLFVBQVUscUJBQXFCLENBQUM7QUFDdkUsU0FBSyx1QkFBdUIsa0JBQWtCLFVBQVUsNEJBQTRCLENBQUM7QUFBQSxFQUN0RjtBQUFBO0FBQUEsRUF4QkEsSUFBSSxlQUF5QztBQUFFLFdBQU8sS0FBSyxjQUFjLE9BQU87QUFBQSxFQUFHO0FBQUEsRUFDbkYsSUFBSSxrQkFBMEI7QUFBRSxXQUFPLEtBQUssY0FBYztBQUFBLEVBQU07QUFBQSxFQXlCaEUsb0JBQW9CLFVBQXdDO0FBQzNELFNBQUssV0FBVyxNQUFNLGdDQUFnQztBQUV0RCxRQUFJLEtBQUssY0FBYyxJQUFJLFNBQVMsRUFBRSxHQUFHO0FBQ3hDLFlBQU0sSUFBSSxNQUFNLGdCQUFnQixTQUFTLEVBQUUsa0JBQWtCO0FBQUEsSUFDOUQ7QUFFQSxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsVUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxhQUFPLE1BQU0sS0FBSyxLQUFLLGNBQWMsT0FBTyxDQUFDLEVBQzNDLE9BQU8sT0FBSyxDQUFDLENBQUMsRUFBRSxTQUFTLGdCQUFnQixJQUFJLENBQUMsRUFBRTtBQUFBLElBQ25EO0FBRUEsZ0JBQVksSUFBSSxhQUFhLE1BQU07QUFDbEMsV0FBSyxjQUFjLE9BQU8sU0FBUyxFQUFFO0FBQ3JDLFdBQUsscUJBQXFCLEtBQUssVUFBVTtBQUV6QyxXQUFLLGNBQWMsSUFBSSxLQUFLLGNBQWMsSUFBSTtBQUM5QyxXQUFLLHFCQUFxQixJQUFJLHFCQUFxQixDQUFDO0FBQUEsSUFDckQsQ0FBQyxDQUFDO0FBRUYsVUFBTSxhQUFhLElBQUksY0FBYyxTQUFTLElBQUksVUFBVSxhQUFhLEtBQUssWUFBWTtBQUMxRixTQUFLLGNBQWMsSUFBSSxTQUFTLElBQUksVUFBVTtBQUU5QyxnQkFBWSxJQUFJLFlBQVksU0FBUyxpQkFBaUIsTUFBTTtBQUMzRCxXQUFLLHFCQUFxQixJQUFJLHFCQUFxQixDQUFDO0FBQUEsSUFDckQsQ0FBQyxDQUFDO0FBRUYsU0FBSyxjQUFjLElBQUksS0FBSyxjQUFjLElBQUk7QUFDOUMsU0FBSyxxQkFBcUIsSUFBSSxxQkFBcUIsQ0FBQztBQUVwRCxTQUFLLGtCQUFrQixLQUFLLFVBQVU7QUFFdEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUlBLGNBQWMsY0FBd0Q7QUFDckUsUUFBSSxPQUFPLGlCQUFpQixVQUFVO0FBQ3JDLGFBQU8sS0FBSyxjQUFjLElBQUksWUFBWTtBQUFBLElBQzNDO0FBRUEsUUFBSSxhQUFhLFdBQVcsUUFBUSxRQUNuQyxhQUFhLFdBQVcsUUFBUSxjQUFjO0FBQzlDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxpQkFBNkM7QUFDakQsUUFBSSxrQkFBa0IsT0FBTztBQUU3QixlQUFXLGNBQWMsS0FBSyxjQUFjO0FBQzNDLFVBQUksV0FBVyxTQUFTLGFBQWEsTUFBTTtBQUMxQztBQUFBLE1BQ0Q7QUFFQSxZQUFNLE9BQU8sV0FBVyxTQUFTO0FBRWpDLFVBQUksQ0FBQyxNQUFNO0FBQ1Y7QUFBQSxNQUNEO0FBRUEsWUFBTSxPQUFPLEtBQUssbUJBQW1CLE9BQU8sYUFBYSxNQUFNLFlBQVk7QUFFM0UsVUFBSSxRQUFRLENBQUMsUUFBUSxLQUFLLElBQUksS0FBSyxLQUFLLFNBQVMsaUJBQWlCO0FBQ2pFLHlCQUFpQjtBQUNqQiwwQkFBa0IsS0FBSztBQUFBLE1BQ3hCO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF4R2EsYUFBTjtBQUFBLEVBbUJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdkJVOyIsCiAgIm5hbWVzIjogW10KfQo=
