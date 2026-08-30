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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ISCMViewService, ISCMService, ISCMRepositorySortKey, ISCMRepositorySelectionMode } from "../common/scm.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { SCMMenus } from "./menus.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { debounce } from "../../../../base/common/decorators.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { compareFileNames, comparePaths } from "../../../../base/common/comparers.js";
import { basename } from "../../../../base/common/resources.js";
import { binarySearch } from "../../../../base/common/arrays.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { autorun, derived, derivedObservableWithCache, derivedOpts, latestChangedValue, observableFromEventOpts, observableValue, runOnChange } from "../../../../base/common/observable.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EditorResourceAccessor } from "../../../common/editor.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { getSCMRepositoryIcon } from "./util.js";
function getProviderStorageKey(provider) {
  return `${provider.providerId}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ""}`;
}
function getRepositoryName(workspaceContextService, repository) {
  if (!repository.provider.rootUri) {
    return repository.provider.label;
  }
  const folder = workspaceContextService.getWorkspaceFolder(repository.provider.rootUri);
  return folder?.uri.toString() === repository.provider.rootUri.toString() ? folder.name : basename(repository.provider.rootUri);
}
const RepositoryContextKeys = {
  RepositorySortKey: new RawContextKey("scmRepositorySortKey", ISCMRepositorySortKey.DiscoveryTime),
  RepositorySelectionMode: new RawContextKey("scmRepositorySelectionMode", ISCMRepositorySelectionMode.Single)
};
let RepositoryPicker = class {
  constructor(_placeHolder, _autoQuickItemDescription, _quickInputService, _scmViewService) {
    this._placeHolder = _placeHolder;
    this._autoQuickItemDescription = _autoQuickItemDescription;
    this._quickInputService = _quickInputService;
    this._scmViewService = _scmViewService;
    this._autoQuickPickItem = {
      label: localize("auto", "Auto"),
      description: this._autoQuickItemDescription,
      repository: "auto"
    };
  }
  async pickRepository() {
    const picks = [
      this._autoQuickPickItem,
      { type: "separator" }
    ];
    const activeRepository = this._scmViewService.activeRepository.get();
    const repository = activeRepository?.repository;
    const pinned = activeRepository?.pinned === true;
    picks.push(...this._scmViewService.repositories.map((r) => {
      const icon = getSCMRepositoryIcon(activeRepository, r);
      return {
        label: r.provider.name,
        description: r.provider.rootUri?.fsPath,
        iconClass: ThemeIcon.asClassName(icon),
        repository: r
      };
    }));
    const activeItem = pinned ? picks.find((p) => p.type !== "separator" && p.repository === repository) : this._autoQuickPickItem;
    return this._quickInputService.pick(picks, { placeHolder: this._placeHolder, activeItem });
  }
};
RepositoryPicker = __decorateClass([
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, ISCMViewService)
], RepositoryPicker);
let SCMViewService = class {
  constructor(scmService, contextKeyService, editorService, extensionService, instantiationService, configurationService, storageService, workspaceContextService) {
    this.scmService = scmService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.storageService = storageService;
    this.workspaceContextService = workspaceContextService;
    this.didSelectRepository = false;
    this.disposables = new DisposableStore();
    this._repositories = [];
    this.didFinishLoadingRepositories = observableValue(this, false);
    this._onDidChangeRepositories = new Emitter();
    this.onDidChangeRepositories = this._onDidChangeRepositories.event;
    this._onDidSetVisibleRepositories = new Emitter();
    this.onDidChangeVisibleRepositories = Event.any(
      this._onDidSetVisibleRepositories.event,
      Event.debounce(
        this._onDidChangeRepositories.event,
        (last, e) => {
          if (!last) {
            return e;
          }
          const added = new Set(last.added);
          const removed = new Set(last.removed);
          for (const repository of e.added) {
            if (!removed.delete(repository)) {
              added.add(repository);
            }
          }
          for (const repository of e.removed) {
            if (!added.delete(repository)) {
              removed.add(repository);
            }
          }
          return { added, removed };
        },
        0,
        void 0,
        void 0,
        void 0,
        this.disposables
      )
    );
    this._onDidFocusRepository = new Emitter();
    this.onDidFocusRepository = this._onDidFocusRepository.event;
    this.menus = instantiationService.createInstance(SCMMenus);
    const explorerEnabledConfig = observableConfigValue("scm.repositories.explorer", false, this.configurationService);
    this.graphShowIncomingChangesConfig = observableConfigValue("scm.graph.showIncomingChanges", true, this.configurationService);
    this.graphShowOutgoingChangesConfig = observableConfigValue("scm.graph.showOutgoingChanges", true, this.configurationService);
    this.selectionModeConfig = observableConfigValue("scm.repositories.selectionMode", ISCMRepositorySelectionMode.Multiple, this.configurationService);
    this.explorerEnabledConfig = derived((reader) => {
      return explorerEnabledConfig.read(reader) === true && this.selectionModeConfig.read(reader) === ISCMRepositorySelectionMode.Single;
    });
    try {
      this.previousState = JSON.parse(storageService.get("scm:view:visibleRepositories", StorageScope.WORKSPACE, ""));
      if (this.previousState && this.previousState.visible.length > 1 && this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Single) {
        this.previousState = {
          ...this.previousState,
          visible: [this.previousState.visible[0]]
        };
      }
    } catch {
    }
    this._focusedRepositoryObs = observableFromEventOpts(
      {
        owner: this,
        equalsFn: () => false
      },
      this.onDidFocusRepository,
      () => this.focusedRepository
    );
    this._activeEditorObs = observableFromEventOpts({
      owner: this,
      equalsFn: () => false
    }, this.editorService.onDidActiveEditorChange, () => this.editorService.activeEditor);
    this._activeEditorRepositoryObs = derivedObservableWithCache(
      this,
      (reader, lastValue) => {
        const activeEditor = this._activeEditorObs.read(reader);
        const activeResource = EditorResourceAccessor.getOriginalUri(activeEditor);
        if (!activeResource) {
          return lastValue;
        }
        const repository = this.scmService.getRepository(activeResource);
        if (!repository) {
          return lastValue;
        }
        return Object.create(repository);
      }
    );
    this._activeRepositoryPinnedObs = observableValue(this, void 0);
    this._activeRepositoryObs = latestChangedValue(this, [this._activeEditorRepositoryObs, this._focusedRepositoryObs]);
    this.activeRepository = derivedOpts({
      owner: this,
      equalsFn: (r1, r2) => r1?.repository.id === r2?.repository.id && r1?.pinned === r2?.pinned
    }, (reader) => {
      const activeRepository = this._activeRepositoryObs.read(reader);
      const activeRepositoryPinned = this._activeRepositoryPinnedObs.read(reader);
      const repository = activeRepositoryPinned ?? activeRepository;
      const pinned = !!activeRepositoryPinned;
      return repository ? { repository, pinned } : void 0;
    });
    this.disposables.add(runOnChange(this.selectionModeConfig, (selectionMode) => {
      if (selectionMode === ISCMRepositorySelectionMode.Single && this.visibleRepositories.length > 1) {
        const repository = this.visibleRepositories[0];
        this.visibleRepositories = [repository];
      } else if (selectionMode === ISCMRepositorySelectionMode.Multiple && this.repositories.length > 1) {
        this.visibleRepositories = this.repositories;
      }
    }));
    this._repositoriesSortKey = this.previousState?.sortKey ?? this.getViewSortOrder();
    this._sortKeyContextKey = RepositoryContextKeys.RepositorySortKey.bindTo(contextKeyService);
    this._sortKeyContextKey.set(this._repositoriesSortKey);
    this._selectionModelContextKey = RepositoryContextKeys.RepositorySelectionMode.bindTo(contextKeyService);
    this.disposables.add(autorun((reader) => {
      const selectionMode = this.selectionModeConfig.read(reader);
      this._selectionModelContextKey.set(selectionMode);
    }));
    scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
    scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
    for (const repository of scmService.repositories) {
      this.onDidAddRepository(repository);
    }
    storageService.onWillSaveState(this.onWillSaveState, this, this.disposables);
    extensionService.onWillStop(() => {
      this.onWillSaveState();
      this.didFinishLoadingRepositories.set(false, void 0);
    }, this, this.disposables);
  }
  get repositories() {
    return this._repositories.filter((r) => r.repository.provider.isHidden !== true).map((r) => r.repository);
  }
  get visibleRepositories() {
    if (this._repositoriesSortKey === ISCMRepositorySortKey.DiscoveryTime) {
      return this._repositories.filter((r) => r.repository.provider.isHidden !== true && r.selectionIndex !== -1).sort((r1, r2) => r1.selectionIndex - r2.selectionIndex).map((r) => r.repository);
    }
    return this._repositories.filter((r) => r.repository.provider.isHidden !== true && r.selectionIndex !== -1).map((r) => r.repository);
  }
  set visibleRepositories(visibleRepositories) {
    const set = new Set(visibleRepositories);
    const added = /* @__PURE__ */ new Set();
    const removed = /* @__PURE__ */ new Set();
    for (const repositoryView of this._repositories) {
      if (!set.has(repositoryView.repository) && repositoryView.selectionIndex !== -1) {
        repositoryView.selectionIndex = -1;
        removed.add(repositoryView.repository);
      }
      if (set.has(repositoryView.repository)) {
        if (repositoryView.selectionIndex === -1) {
          added.add(repositoryView.repository);
        }
        repositoryView.selectionIndex = visibleRepositories.indexOf(repositoryView.repository);
      }
    }
    if (added.size === 0 && removed.size === 0) {
      return;
    }
    this._onDidSetVisibleRepositories.fire({ added, removed });
    if (this._repositories.find((r) => r.focused && r.selectionIndex === -1)) {
      this.focus(this._repositories.find((r) => r.selectionIndex !== -1)?.repository);
    }
  }
  get focusedRepository() {
    return this._repositories.find((r) => r.focused)?.repository;
  }
  onDidAddRepository(repository) {
    if (!this.didFinishLoadingRepositories.get()) {
      this.eventuallyFinishLoading();
    }
    const repositoryView = {
      repository,
      discoveryTime: Date.now(),
      focused: false,
      selectionIndex: -1
    };
    let removed = Iterable.empty();
    if (this.previousState && !this.didFinishLoadingRepositories.get()) {
      const index = this.previousState.all.indexOf(getProviderStorageKey(repository.provider));
      if (index === -1) {
        const added = [];
        this.insertRepositoryView(this._repositories, repositoryView);
        if (this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Multiple || !this._repositories.find((r) => r.selectionIndex !== -1)) {
          this._repositories.forEach((repositoryView2, index2) => {
            if (repositoryView2.selectionIndex === -1) {
              added.push(repositoryView2.repository);
            }
            repositoryView2.selectionIndex = index2;
          });
          this._onDidChangeRepositories.fire({ added, removed: Iterable.empty() });
        }
        this.didSelectRepository = false;
        return;
      }
      if (this.previousState.visible.indexOf(index) === -1) {
        if (this.didSelectRepository) {
          this.insertRepositoryView(this._repositories, repositoryView);
          this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed: Iterable.empty() });
          return;
        }
      } else {
        if (!this.didSelectRepository) {
          removed = [...this.visibleRepositories];
          this._repositories.forEach((r) => {
            r.focused = false;
            r.selectionIndex = -1;
          });
          this.didSelectRepository = true;
        }
      }
    }
    if (this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Multiple || !this._repositories.find((r) => r.selectionIndex !== -1)) {
      const maxSelectionIndex = this.getMaxSelectionIndex();
      this.insertRepositoryView(this._repositories, { ...repositoryView, selectionIndex: maxSelectionIndex + 1 });
      this._onDidChangeRepositories.fire({ added: [repositoryView.repository], removed });
    } else {
      this.insertRepositoryView(this._repositories, repositoryView);
      this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed });
    }
    if (!this._repositories.find((r) => r.focused)) {
      this.focus(repository);
    }
  }
  onDidRemoveRepository(repository) {
    if (!this.didFinishLoadingRepositories.get()) {
      this.eventuallyFinishLoading();
    }
    const repositoriesIndex = this._repositories.findIndex((r) => r.repository === repository);
    if (repositoriesIndex === -1) {
      return;
    }
    let added = Iterable.empty();
    const removed = this._repositories.splice(repositoriesIndex, 1);
    if (this._repositories.length > 0 && this.visibleRepositories.length === 0) {
      this._repositories[0].selectionIndex = 0;
      added = [this._repositories[0].repository];
    }
    this._onDidChangeRepositories.fire({ added, removed: removed.map((r) => r.repository) });
    if (removed.length === 1 && removed[0].focused && this.visibleRepositories.length > 0) {
      this.focus(this.visibleRepositories[0]);
    }
    if (removed.length === 1 && this._repositories.length === 0) {
      this._onDidFocusRepository.fire(void 0);
    }
    if (removed.length === 1 && removed[0].repository === this._activeRepositoryPinnedObs.get()) {
      this._activeRepositoryPinnedObs.set(void 0, void 0);
    }
  }
  isVisible(repository) {
    return this._repositories.find((r) => r.repository === repository)?.selectionIndex !== -1;
  }
  toggleVisibility(repository, visible) {
    if (typeof visible === "undefined") {
      visible = !this.isVisible(repository);
    } else if (this.isVisible(repository) === visible) {
      return;
    }
    if (visible) {
      if (this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Single) {
        this.visibleRepositories = [repository];
      } else if (this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Multiple) {
        this.visibleRepositories = [...this.visibleRepositories, repository];
      }
    } else {
      const index = this.visibleRepositories.indexOf(repository);
      if (index > -1) {
        this.visibleRepositories = [
          ...this.visibleRepositories.slice(0, index),
          ...this.visibleRepositories.slice(index + 1)
        ];
      }
    }
  }
  toggleSortKey(sortKey) {
    this._repositoriesSortKey = sortKey;
    this._sortKeyContextKey.set(this._repositoriesSortKey);
    this._repositories.sort(this.compareRepositories.bind(this));
    this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed: Iterable.empty() });
  }
  toggleSelectionMode(selectionMode) {
    this.configurationService.updateValue("scm.repositories.selectionMode", selectionMode);
  }
  focus(repository) {
    if (repository && !this.isVisible(repository)) {
      return;
    }
    this._repositories.forEach((r) => r.focused = r.repository === repository);
    if (this._repositories.find((r) => r.focused)) {
      this._onDidFocusRepository.fire(repository);
    }
  }
  pinActiveRepository(repository) {
    this._activeRepositoryPinnedObs.set(repository, void 0);
  }
  compareRepositories(op1, op2) {
    if (this._repositoriesSortKey === ISCMRepositorySortKey.DiscoveryTime) {
      return op1.discoveryTime - op2.discoveryTime;
    }
    if (this._repositoriesSortKey === "path" && op1.repository.provider.rootUri && op2.repository.provider.rootUri) {
      return comparePaths(op1.repository.provider.rootUri.fsPath, op2.repository.provider.rootUri.fsPath);
    }
    const name1 = getRepositoryName(this.workspaceContextService, op1.repository);
    const name2 = getRepositoryName(this.workspaceContextService, op2.repository);
    const nameComparison = compareFileNames(name1, name2);
    if (nameComparison === 0 && op1.repository.provider.rootUri && op2.repository.provider.rootUri) {
      return comparePaths(op1.repository.provider.rootUri.fsPath, op2.repository.provider.rootUri.fsPath);
    }
    return nameComparison;
  }
  getMaxSelectionIndex() {
    return this._repositories.length === 0 ? -1 : Math.max(...this._repositories.map((r) => r.selectionIndex));
  }
  getViewSortOrder() {
    const sortOder = this.configurationService.getValue("scm.repositories.sortOrder");
    switch (sortOder) {
      case "discovery time":
        return ISCMRepositorySortKey.DiscoveryTime;
      case "name":
        return ISCMRepositorySortKey.Name;
      case "path":
        return ISCMRepositorySortKey.Path;
      default:
        return ISCMRepositorySortKey.DiscoveryTime;
    }
  }
  insertRepositoryView(repositories, repositoryView) {
    const index = binarySearch(repositories, repositoryView, this.compareRepositories.bind(this));
    repositories.splice(index < 0 ? ~index : index, 0, repositoryView);
  }
  onWillSaveState() {
    if (!this.didFinishLoadingRepositories.get()) {
      return;
    }
    const all = this.repositories.map((r) => getProviderStorageKey(r.provider));
    const visible = this.visibleRepositories.map((r) => all.indexOf(getProviderStorageKey(r.provider)));
    this.previousState = { all, visible, sortKey: this._repositoriesSortKey };
    this.storageService.store("scm:view:visibleRepositories", JSON.stringify(this.previousState), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  eventuallyFinishLoading() {
    this.finishLoading();
  }
  finishLoading() {
    if (this.didFinishLoadingRepositories.get()) {
      return;
    }
    this.didFinishLoadingRepositories.set(true, void 0);
  }
  dispose() {
    this.disposables.dispose();
    this._onDidFocusRepository.dispose();
    this._onDidChangeRepositories.dispose();
    this._onDidSetVisibleRepositories.dispose();
  }
};
__decorateClass([
  debounce(5e3)
], SCMViewService.prototype, "eventuallyFinishLoading", 1);
SCMViewService = __decorateClass([
  __decorateParam(0, ISCMService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IWorkspaceContextService)
], SCMViewService);
export {
  RepositoryContextKeys,
  RepositoryPicker,
  SCMViewService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3Nlclxcc2NtVmlld1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJU0NNVmlld1NlcnZpY2UsIElTQ01SZXBvc2l0b3J5LCBJU0NNU2VydmljZSwgSVNDTVZpZXdWaXNpYmxlUmVwb3NpdG9yeUNoYW5nZUV2ZW50LCBJU0NNTWVudXMsIElTQ01Qcm92aWRlciwgSVNDTVJlcG9zaXRvcnlTb3J0S2V5LCBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUgfSBmcm9tICcuLi9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTQ01NZW51cyB9IGZyb20gJy4vbWVudXMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBjb21wYXJlRmlsZU5hbWVzLCBjb21wYXJlUGF0aHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb21wYXJlcnMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYmluYXJ5U2VhcmNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlLCBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIGxhdGVzdENoYW5nZWRWYWx1ZSwgb2JzZXJ2YWJsZUZyb21FdmVudE9wdHMsIG9ic2VydmFibGVWYWx1ZSwgcnVuT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0U0NNUmVwb3NpdG9yeUljb24gfSBmcm9tICcuL3V0aWwuanMnO1xuXG5mdW5jdGlvbiBnZXRQcm92aWRlclN0b3JhZ2VLZXkocHJvdmlkZXI6IElTQ01Qcm92aWRlcik6IHN0cmluZyB7XG5cdHJldHVybiBgJHtwcm92aWRlci5wcm92aWRlcklkfToke3Byb3ZpZGVyLmxhYmVsfSR7cHJvdmlkZXIucm9vdFVyaSA/IGA6JHtwcm92aWRlci5yb290VXJpLnRvU3RyaW5nKCl9YCA6ICcnfWA7XG59XG5cbmZ1bmN0aW9uIGdldFJlcG9zaXRvcnlOYW1lKHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5KTogc3RyaW5nIHtcblx0aWYgKCFyZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkpIHtcblx0XHRyZXR1cm4gcmVwb3NpdG9yeS5wcm92aWRlci5sYWJlbDtcblx0fVxuXG5cdGNvbnN0IGZvbGRlciA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkpO1xuXHRyZXR1cm4gZm9sZGVyPy51cmkudG9TdHJpbmcoKSA9PT0gcmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpLnRvU3RyaW5nKCkgPyBmb2xkZXIubmFtZSA6IGJhc2VuYW1lKHJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSk7XG59XG5cbmV4cG9ydCBjb25zdCBSZXBvc2l0b3J5Q29udGV4dEtleXMgPSB7XG5cdFJlcG9zaXRvcnlTb3J0S2V5OiBuZXcgUmF3Q29udGV4dEtleTxJU0NNUmVwb3NpdG9yeVNvcnRLZXk+KCdzY21SZXBvc2l0b3J5U29ydEtleScsIElTQ01SZXBvc2l0b3J5U29ydEtleS5EaXNjb3ZlcnlUaW1lKSxcblx0UmVwb3NpdG9yeVNlbGVjdGlvbk1vZGU6IG5ldyBSYXdDb250ZXh0S2V5PElTQ01SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZT4oJ3NjbVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlJywgSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLlNpbmdsZSksXG59O1xuXG5leHBvcnQgdHlwZSBSZXBvc2l0b3J5UXVpY2tQaWNrSXRlbSA9IElRdWlja1BpY2tJdGVtICYgeyByZXBvc2l0b3J5OiAnYXV0bycgfCBJU0NNUmVwb3NpdG9yeSB9O1xuXG5leHBvcnQgY2xhc3MgUmVwb3NpdG9yeVBpY2tlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9RdWlja1BpY2tJdGVtOiBSZXBvc2l0b3J5UXVpY2tQaWNrSXRlbTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wbGFjZUhvbGRlcjogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9RdWlja0l0ZW1EZXNjcmlwdGlvbjogc3RyaW5nLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVNDTVZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NjbVZpZXdTZXJ2aWNlOiBJU0NNVmlld1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fYXV0b1F1aWNrUGlja0l0ZW0gPSB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG8nLCBcIkF1dG9cIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5fYXV0b1F1aWNrSXRlbURlc2NyaXB0aW9uLFxuXHRcdFx0cmVwb3NpdG9yeTogJ2F1dG8nXG5cdFx0fSBzYXRpc2ZpZXMgUmVwb3NpdG9yeVF1aWNrUGlja0l0ZW07XG5cdH1cblxuXHRhc3luYyBwaWNrUmVwb3NpdG9yeSgpOiBQcm9taXNlPFJlcG9zaXRvcnlRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGlja3M6IChSZXBvc2l0b3J5UXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbXG5cdFx0XHR0aGlzLl9hdXRvUXVpY2tQaWNrSXRlbSxcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicgfVxuXHRcdF07XG5cblx0XHRjb25zdCBhY3RpdmVSZXBvc2l0b3J5ID0gdGhpcy5fc2NtVmlld1NlcnZpY2UuYWN0aXZlUmVwb3NpdG9yeS5nZXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gYWN0aXZlUmVwb3NpdG9yeT8ucmVwb3NpdG9yeTtcblx0XHRjb25zdCBwaW5uZWQgPSBhY3RpdmVSZXBvc2l0b3J5Py5waW5uZWQgPT09IHRydWU7XG5cblx0XHRwaWNrcy5wdXNoKC4uLnRoaXMuX3NjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllcy5tYXAociA9PiB7XG5cdFx0XHRjb25zdCBpY29uID0gZ2V0U0NNUmVwb3NpdG9yeUljb24oYWN0aXZlUmVwb3NpdG9yeSwgcik7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiByLnByb3ZpZGVyLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiByLnByb3ZpZGVyLnJvb3RVcmk/LmZzUGF0aCxcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbiksXG5cdFx0XHRcdHJlcG9zaXRvcnk6IHJcblx0XHRcdH07XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aXZlSXRlbSA9IHBpbm5lZFxuXHRcdFx0PyBwaWNrcy5maW5kKHAgPT4gcC50eXBlICE9PSAnc2VwYXJhdG9yJyAmJiBwLnJlcG9zaXRvcnkgPT09IHJlcG9zaXRvcnkpIGFzIFJlcG9zaXRvcnlRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkXG5cdFx0XHQ6IHRoaXMuX2F1dG9RdWlja1BpY2tJdGVtO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IHRoaXMuX3BsYWNlSG9sZGVyLCBhY3RpdmVJdGVtIH0pO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU0NNUmVwb3NpdG9yeVZpZXcge1xuXHRyZWFkb25seSByZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeTtcblx0cmVhZG9ubHkgZGlzY292ZXJ5VGltZTogbnVtYmVyO1xuXHRmb2N1c2VkOiBib29sZWFuO1xuXHRzZWxlY3Rpb25JbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTQ01WaWV3U2VydmljZVN0YXRlIHtcblx0cmVhZG9ubHkgYWxsOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgdmlzaWJsZTogbnVtYmVyW107XG5cdHJlYWRvbmx5IHNvcnRLZXk6IElTQ01SZXBvc2l0b3J5U29ydEtleTtcbn1cblxuZXhwb3J0IGNsYXNzIFNDTVZpZXdTZXJ2aWNlIGltcGxlbWVudHMgSVNDTVZpZXdTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBtZW51czogSVNDTU1lbnVzO1xuXHRyZWFkb25seSBleHBsb3JlckVuYWJsZWRDb25maWc6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBzZWxlY3Rpb25Nb2RlQ29uZmlnOiBJT2JzZXJ2YWJsZTxJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGU+O1xuXHRyZWFkb25seSBncmFwaFNob3dJbmNvbWluZ0NoYW5nZXNDb25maWc6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBncmFwaFNob3dPdXRnb2luZ0NoYW5nZXNDb25maWc6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgZGlkU2VsZWN0UmVwb3NpdG9yeTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHByZXZpb3VzU3RhdGU6IElTQ01WaWV3U2VydmljZVN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgX3JlcG9zaXRvcmllczogSVNDTVJlcG9zaXRvcnlWaWV3W10gPSBbXTtcblxuXHRnZXQgcmVwb3NpdG9yaWVzKCk6IElTQ01SZXBvc2l0b3J5W10ge1xuXHRcdHJldHVybiB0aGlzLl9yZXBvc2l0b3JpZXNcblx0XHRcdC5maWx0ZXIociA9PiByLnJlcG9zaXRvcnkucHJvdmlkZXIuaXNIaWRkZW4gIT09IHRydWUpXG5cdFx0XHQubWFwKHIgPT4gci5yZXBvc2l0b3J5KTtcblx0fVxuXG5cdHJlYWRvbmx5IGRpZEZpbmlzaExvYWRpbmdSZXBvc2l0b3JpZXMgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXG5cdGdldCB2aXNpYmxlUmVwb3NpdG9yaWVzKCk6IElTQ01SZXBvc2l0b3J5W10ge1xuXHRcdC8vIEluIG9yZGVyIHRvIG1hdGNoIHRoZSBsZWdhY3kgYmVoYXZpb3VyLCB3aGVuIHRoZSByZXBvc2l0b3JpZXMgYXJlIHNvcnRlZCBieSBkaXNjb3ZlcnkgdGltZSxcblx0XHQvLyB0aGUgdmlzaWJsZSByZXBvc2l0b3JpZXMgYXJlIHNvcnRlZCBieSB0aGUgc2VsZWN0aW9uIGluZGV4IGluc3RlYWQgb2YgdGhlIGRpc2NvdmVyeSB0aW1lLlxuXHRcdGlmICh0aGlzLl9yZXBvc2l0b3JpZXNTb3J0S2V5ID09PSBJU0NNUmVwb3NpdG9yeVNvcnRLZXkuRGlzY292ZXJ5VGltZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlcG9zaXRvcmllc1xuXHRcdFx0XHQuZmlsdGVyKHIgPT4gci5yZXBvc2l0b3J5LnByb3ZpZGVyLmlzSGlkZGVuICE9PSB0cnVlICYmIHIuc2VsZWN0aW9uSW5kZXggIT09IC0xKVxuXHRcdFx0XHQuc29ydCgocjEsIHIyKSA9PiByMS5zZWxlY3Rpb25JbmRleCAtIHIyLnNlbGVjdGlvbkluZGV4KVxuXHRcdFx0XHQubWFwKHIgPT4gci5yZXBvc2l0b3J5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVwb3NpdG9yaWVzXG5cdFx0XHQuZmlsdGVyKHIgPT4gci5yZXBvc2l0b3J5LnByb3ZpZGVyLmlzSGlkZGVuICE9PSB0cnVlICYmIHIuc2VsZWN0aW9uSW5kZXggIT09IC0xKVxuXHRcdFx0Lm1hcChyID0+IHIucmVwb3NpdG9yeSk7XG5cdH1cblxuXHRzZXQgdmlzaWJsZVJlcG9zaXRvcmllcyh2aXNpYmxlUmVwb3NpdG9yaWVzOiBJU0NNUmVwb3NpdG9yeVtdKSB7XG5cdFx0Y29uc3Qgc2V0ID0gbmV3IFNldCh2aXNpYmxlUmVwb3NpdG9yaWVzKTtcblx0XHRjb25zdCBhZGRlZCA9IG5ldyBTZXQ8SVNDTVJlcG9zaXRvcnk+KCk7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IG5ldyBTZXQ8SVNDTVJlcG9zaXRvcnk+KCk7XG5cblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnlWaWV3IG9mIHRoaXMuX3JlcG9zaXRvcmllcykge1xuXHRcdFx0Ly8gU2VsZWN0ZWQgLT4gIVNlbGVjdGVkXG5cdFx0XHRpZiAoIXNldC5oYXMocmVwb3NpdG9yeVZpZXcucmVwb3NpdG9yeSkgJiYgcmVwb3NpdG9yeVZpZXcuc2VsZWN0aW9uSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHJlcG9zaXRvcnlWaWV3LnNlbGVjdGlvbkluZGV4ID0gLTE7XG5cdFx0XHRcdHJlbW92ZWQuYWRkKHJlcG9zaXRvcnlWaWV3LnJlcG9zaXRvcnkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2VsZWN0ZWQgfCAhU2VsZWN0ZWQgLT4gU2VsZWN0ZWRcblx0XHRcdGlmIChzZXQuaGFzKHJlcG9zaXRvcnlWaWV3LnJlcG9zaXRvcnkpKSB7XG5cdFx0XHRcdGlmIChyZXBvc2l0b3J5Vmlldy5zZWxlY3Rpb25JbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRhZGRlZC5hZGQocmVwb3NpdG9yeVZpZXcucmVwb3NpdG9yeSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVwb3NpdG9yeVZpZXcuc2VsZWN0aW9uSW5kZXggPSB2aXNpYmxlUmVwb3NpdG9yaWVzLmluZGV4T2YocmVwb3NpdG9yeVZpZXcucmVwb3NpdG9yeSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGFkZGVkLnNpemUgPT09IDAgJiYgcmVtb3ZlZC5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRTZXRWaXNpYmxlUmVwb3NpdG9yaWVzLmZpcmUoeyBhZGRlZCwgcmVtb3ZlZCB9KTtcblxuXHRcdC8vIFVwZGF0ZSBmb2N1cyBpZiB0aGUgZm9jdXNlZCByZXBvc2l0b3J5IGlzIG5vdCB2aXNpYmxlIGFueW1vcmVcblx0XHRpZiAodGhpcy5fcmVwb3NpdG9yaWVzLmZpbmQociA9PiByLmZvY3VzZWQgJiYgci5zZWxlY3Rpb25JbmRleCA9PT0gLTEpKSB7XG5cdFx0XHR0aGlzLmZvY3VzKHRoaXMuX3JlcG9zaXRvcmllcy5maW5kKHIgPT4gci5zZWxlY3Rpb25JbmRleCAhPT0gLTEpPy5yZXBvc2l0b3J5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVJlcG9zaXRvcmllcyA9IG5ldyBFbWl0dGVyPElTQ01WaWV3VmlzaWJsZVJlcG9zaXRvcnlDaGFuZ2VFdmVudD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZXBvc2l0b3JpZXMgPSB0aGlzLl9vbkRpZENoYW5nZVJlcG9zaXRvcmllcy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZFNldFZpc2libGVSZXBvc2l0b3JpZXMgPSBuZXcgRW1pdHRlcjxJU0NNVmlld1Zpc2libGVSZXBvc2l0b3J5Q2hhbmdlRXZlbnQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJsZVJlcG9zaXRvcmllcyA9IEV2ZW50LmFueShcblx0XHR0aGlzLl9vbkRpZFNldFZpc2libGVSZXBvc2l0b3JpZXMuZXZlbnQsXG5cdFx0RXZlbnQuZGVib3VuY2UoXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJlcG9zaXRvcmllcy5ldmVudCxcblx0XHRcdChsYXN0LCBlKSA9PiB7XG5cdFx0XHRcdGlmICghbGFzdCkge1xuXHRcdFx0XHRcdHJldHVybiBlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWRkZWQgPSBuZXcgU2V0KGxhc3QuYWRkZWQpO1xuXHRcdFx0XHRjb25zdCByZW1vdmVkID0gbmV3IFNldChsYXN0LnJlbW92ZWQpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeSBvZiBlLmFkZGVkKSB7XG5cdFx0XHRcdFx0aWYgKCFyZW1vdmVkLmRlbGV0ZShyZXBvc2l0b3J5KSkge1xuXHRcdFx0XHRcdFx0YWRkZWQuYWRkKHJlcG9zaXRvcnkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHRcdFx0aWYgKCFhZGRlZC5kZWxldGUocmVwb3NpdG9yeSkpIHtcblx0XHRcdFx0XHRcdHJlbW92ZWQuYWRkKHJlcG9zaXRvcnkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7IGFkZGVkLCByZW1vdmVkIH07XG5cdFx0XHR9LCAwLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmRpc3Bvc2FibGVzKVxuXHQpO1xuXG5cdGdldCBmb2N1c2VkUmVwb3NpdG9yeSgpOiBJU0NNUmVwb3NpdG9yeSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcG9zaXRvcmllcy5maW5kKHIgPT4gci5mb2N1c2VkKT8ucmVwb3NpdG9yeTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkRm9jdXNSZXBvc2l0b3J5ID0gbmV3IEVtaXR0ZXI8SVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNSZXBvc2l0b3J5ID0gdGhpcy5fb25EaWRGb2N1c1JlcG9zaXRvcnkuZXZlbnQ7XG5cblx0cmVhZG9ubHkgYWN0aXZlUmVwb3NpdG9yeTogSU9ic2VydmFibGU8eyByZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeTsgcGlubmVkOiBib29sZWFuIH0gfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVFZGl0b3JPYnM6IElPYnNlcnZhYmxlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlRWRpdG9yUmVwb3NpdG9yeU9iczogSU9ic2VydmFibGU8SVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQqIFRoZSBmb2N1c2VkIHJlcG9zaXRvcnkgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBhY3RpdmUgZWRpdG9yIHJlcG9zaXRvcnkgd2hlbiB0aGUgb2JzZXJ2YWJsZVxuXHQqIHZhbHVlcyBhcmUgdXBkYXRlZCBpbiB0aGUgc2FtZSB0cmFuc2FjdGlvbiAob3IgZHVyaW5nIHRoZSBpbml0aWFsIHJlYWQgb2YgdGhlIG9ic2VydmFibGUgdmFsdWUpLlxuXHQqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVSZXBvc2l0b3J5T2JzOiBJT2JzZXJ2YWJsZTxJU0NNUmVwb3NpdG9yeSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVJlcG9zaXRvcnlQaW5uZWRPYnM6IElTZXR0YWJsZU9ic2VydmFibGU8SVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c2VkUmVwb3NpdG9yeU9iczogSU9ic2VydmFibGU8SVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgX3JlcG9zaXRvcmllc1NvcnRLZXk6IElTQ01SZXBvc2l0b3J5U29ydEtleTtcblx0cHJpdmF0ZSBfc29ydEtleUNvbnRleHRLZXk6IElDb250ZXh0S2V5PElTQ01SZXBvc2l0b3J5U29ydEtleT47XG5cblx0cHJpdmF0ZSBfc2VsZWN0aW9uTW9kZWxDb250ZXh0S2V5OiBJQ29udGV4dEtleTxJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGU+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMubWVudXMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTQ01NZW51cyk7XG5cblx0XHRjb25zdCBleHBsb3JlckVuYWJsZWRDb25maWcgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8Ym9vbGVhbj4oJ3NjbS5yZXBvc2l0b3JpZXMuZXhwbG9yZXInLCBmYWxzZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5ncmFwaFNob3dJbmNvbWluZ0NoYW5nZXNDb25maWcgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8Ym9vbGVhbj4oJ3NjbS5ncmFwaC5zaG93SW5jb21pbmdDaGFuZ2VzJywgdHJ1ZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5ncmFwaFNob3dPdXRnb2luZ0NoYW5nZXNDb25maWcgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8Ym9vbGVhbj4oJ3NjbS5ncmFwaC5zaG93T3V0Z29pbmdDaGFuZ2VzJywgdHJ1ZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5zZWxlY3Rpb25Nb2RlQ29uZmlnID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPElTQ01SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZT4oJ3NjbS5yZXBvc2l0b3JpZXMuc2VsZWN0aW9uTW9kZScsIElTQ01SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZS5NdWx0aXBsZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5leHBsb3JlckVuYWJsZWRDb25maWcgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gZXhwbG9yZXJFbmFibGVkQ29uZmlnLnJlYWQocmVhZGVyKSA9PT0gdHJ1ZSAmJiB0aGlzLnNlbGVjdGlvbk1vZGVDb25maWcucmVhZChyZWFkZXIpID09PSBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuU2luZ2xlO1xuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMucHJldmlvdXNTdGF0ZSA9IEpTT04ucGFyc2Uoc3RvcmFnZVNlcnZpY2UuZ2V0KCdzY206dmlldzp2aXNpYmxlUmVwb3NpdG9yaWVzJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJycpKTtcblxuXHRcdFx0Ly8gSWYgcHJldmlvdXNseSB0aGVyZSB3ZXJlIG11bHRpcGxlIHZpc2libGUgcmVwb3NpdG9yaWVzIGJ1dCB0aGVcblx0XHRcdC8vIHZpZXcgbW9kZSBpcyBgc2luZ2xlYCwgb25seSByZXN0b3JlIHRoZSBmaXJzdCB2aXNpYmxlIHJlcG9zaXRvcnkuXG5cdFx0XHRpZiAodGhpcy5wcmV2aW91c1N0YXRlICYmIHRoaXMucHJldmlvdXNTdGF0ZS52aXNpYmxlLmxlbmd0aCA+IDEgJiYgdGhpcy5zZWxlY3Rpb25Nb2RlQ29uZmlnLmdldCgpID09PSBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuU2luZ2xlKSB7XG5cdFx0XHRcdHRoaXMucHJldmlvdXNTdGF0ZSA9IHtcblx0XHRcdFx0XHQuLi50aGlzLnByZXZpb3VzU3RhdGUsXG5cdFx0XHRcdFx0dmlzaWJsZTogW3RoaXMucHJldmlvdXNTdGF0ZS52aXNpYmxlWzBdXVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gbm9vcFxuXHRcdH1cblxuXHRcdHRoaXMuX2ZvY3VzZWRSZXBvc2l0b3J5T2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudE9wdHM8SVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQ+KFxuXHRcdFx0e1xuXHRcdFx0XHRvd25lcjogdGhpcyxcblx0XHRcdFx0ZXF1YWxzRm46ICgpID0+IGZhbHNlXG5cdFx0XHR9LCB0aGlzLm9uRGlkRm9jdXNSZXBvc2l0b3J5LCAoKSA9PiB0aGlzLmZvY3VzZWRSZXBvc2l0b3J5KTtcblxuXHRcdHRoaXMuX2FjdGl2ZUVkaXRvck9icyA9IG9ic2VydmFibGVGcm9tRXZlbnRPcHRzKHtcblx0XHRcdG93bmVyOiB0aGlzLFxuXHRcdFx0ZXF1YWxzRm46ICgpID0+IGZhbHNlXG5cdFx0fSwgdGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLCAoKSA9PiB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yKTtcblxuXHRcdHRoaXMuX2FjdGl2ZUVkaXRvclJlcG9zaXRvcnlPYnMgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxJU0NNUmVwb3NpdG9yeSB8IHVuZGVmaW5lZD4odGhpcyxcblx0XHRcdChyZWFkZXIsIGxhc3RWYWx1ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSB0aGlzLl9hY3RpdmVFZGl0b3JPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBhY3RpdmVSZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoYWN0aXZlRWRpdG9yKTtcblx0XHRcdFx0aWYgKCFhY3RpdmVSZXNvdXJjZSkge1xuXHRcdFx0XHRcdHJldHVybiBsYXN0VmFsdWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5zY21TZXJ2aWNlLmdldFJlcG9zaXRvcnkoYWN0aXZlUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIE9iamVjdC5jcmVhdGUocmVwb3NpdG9yeSk7XG5cdFx0XHR9KTtcblxuXHRcdHRoaXMuX2FjdGl2ZVJlcG9zaXRvcnlQaW5uZWRPYnMgPSBvYnNlcnZhYmxlVmFsdWU8SVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYWN0aXZlUmVwb3NpdG9yeU9icyA9IGxhdGVzdENoYW5nZWRWYWx1ZSh0aGlzLCBbdGhpcy5fYWN0aXZlRWRpdG9yUmVwb3NpdG9yeU9icywgdGhpcy5fZm9jdXNlZFJlcG9zaXRvcnlPYnNdKTtcblxuXHRcdHRoaXMuYWN0aXZlUmVwb3NpdG9yeSA9IGRlcml2ZWRPcHRzPHsgcmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnk7IHBpbm5lZDogYm9vbGVhbiB9IHwgdW5kZWZpbmVkPih7XG5cdFx0XHRvd25lcjogdGhpcyxcblx0XHRcdGVxdWFsc0ZuOiAocjEsIHIyKSA9PiByMT8ucmVwb3NpdG9yeS5pZCA9PT0gcjI/LnJlcG9zaXRvcnkuaWQgJiYgcjE/LnBpbm5lZCA9PT0gcjI/LnBpbm5lZFxuXHRcdH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVSZXBvc2l0b3J5ID0gdGhpcy5fYWN0aXZlUmVwb3NpdG9yeU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhY3RpdmVSZXBvc2l0b3J5UGlubmVkID0gdGhpcy5fYWN0aXZlUmVwb3NpdG9yeVBpbm5lZE9icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBhY3RpdmVSZXBvc2l0b3J5UGlubmVkID8/IGFjdGl2ZVJlcG9zaXRvcnk7XG5cdFx0XHRjb25zdCBwaW5uZWQgPSAhIWFjdGl2ZVJlcG9zaXRvcnlQaW5uZWQ7XG5cblx0XHRcdHJldHVybiByZXBvc2l0b3J5ID8geyByZXBvc2l0b3J5LCBwaW5uZWQgfSA6IHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHJ1bk9uQ2hhbmdlKHRoaXMuc2VsZWN0aW9uTW9kZUNvbmZpZywgc2VsZWN0aW9uTW9kZSA9PiB7XG5cdFx0XHRpZiAoc2VsZWN0aW9uTW9kZSA9PT0gSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLlNpbmdsZSAmJiB0aGlzLnZpc2libGVSZXBvc2l0b3JpZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy52aXNpYmxlUmVwb3NpdG9yaWVzWzBdO1xuXHRcdFx0XHR0aGlzLnZpc2libGVSZXBvc2l0b3JpZXMgPSBbcmVwb3NpdG9yeV07XG5cdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGlvbk1vZGUgPT09IElTQ01SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZS5NdWx0aXBsZSAmJiB0aGlzLnJlcG9zaXRvcmllcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdHRoaXMudmlzaWJsZVJlcG9zaXRvcmllcyA9IHRoaXMucmVwb3NpdG9yaWVzO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlcG9zaXRvcmllc1NvcnRLZXkgPSB0aGlzLnByZXZpb3VzU3RhdGU/LnNvcnRLZXkgPz8gdGhpcy5nZXRWaWV3U29ydE9yZGVyKCk7XG5cdFx0dGhpcy5fc29ydEtleUNvbnRleHRLZXkgPSBSZXBvc2l0b3J5Q29udGV4dEtleXMuUmVwb3NpdG9yeVNvcnRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9zb3J0S2V5Q29udGV4dEtleS5zZXQodGhpcy5fcmVwb3NpdG9yaWVzU29ydEtleSk7XG5cblx0XHR0aGlzLl9zZWxlY3Rpb25Nb2RlbENvbnRleHRLZXkgPSBSZXBvc2l0b3J5Q29udGV4dEtleXMuUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25Nb2RlID0gdGhpcy5zZWxlY3Rpb25Nb2RlQ29uZmlnLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbk1vZGVsQ29udGV4dEtleS5zZXQoc2VsZWN0aW9uTW9kZSk7XG5cdFx0fSkpO1xuXG5cdFx0c2NtU2VydmljZS5vbkRpZEFkZFJlcG9zaXRvcnkodGhpcy5vbkRpZEFkZFJlcG9zaXRvcnksIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHNjbVNlcnZpY2Uub25EaWRSZW1vdmVSZXBvc2l0b3J5KHRoaXMub25EaWRSZW1vdmVSZXBvc2l0b3J5LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblxuXHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeSBvZiBzY21TZXJ2aWNlLnJlcG9zaXRvcmllcykge1xuXHRcdFx0dGhpcy5vbkRpZEFkZFJlcG9zaXRvcnkocmVwb3NpdG9yeSk7XG5cdFx0fVxuXG5cdFx0c3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKHRoaXMub25XaWxsU2F2ZVN0YXRlLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIE1haW50YWluIHJlcG9zaXRvcnkgc2VsZWN0aW9uIHdoZW4gdGhlIGV4dGVuc2lvbiBob3N0IHJlc3RhcnRzLlxuXHRcdC8vIEV4dGVuc2lvbiBob3N0IGlzIHJlc3RhcnRlZCBhZnRlciBpbnN0YWxsaW5nIGFuIGV4dGVuc2lvbiB1cGRhdGVcblx0XHQvLyBvciBkdXJpbmcgYSBwcm9maWxlIHN3aXRjaC5cblx0XHRleHRlbnNpb25TZXJ2aWNlLm9uV2lsbFN0b3AoKCkgPT4ge1xuXHRcdFx0dGhpcy5vbldpbGxTYXZlU3RhdGUoKTtcblx0XHRcdHRoaXMuZGlkRmluaXNoTG9hZGluZ1JlcG9zaXRvcmllcy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0fSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQWRkUmVwb3NpdG9yeShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kaWRGaW5pc2hMb2FkaW5nUmVwb3NpdG9yaWVzLmdldCgpKSB7XG5cdFx0XHR0aGlzLmV2ZW50dWFsbHlGaW5pc2hMb2FkaW5nKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwb3NpdG9yeVZpZXcgPSB7XG5cdFx0XHRyZXBvc2l0b3J5LCBkaXNjb3ZlcnlUaW1lOiBEYXRlLm5vdygpLCBmb2N1c2VkOiBmYWxzZSwgc2VsZWN0aW9uSW5kZXg6IC0xXG5cdFx0fSBzYXRpc2ZpZXMgSVNDTVJlcG9zaXRvcnlWaWV3O1xuXG5cdFx0bGV0IHJlbW92ZWQ6IEl0ZXJhYmxlPElTQ01SZXBvc2l0b3J5PiA9IEl0ZXJhYmxlLmVtcHR5KCk7XG5cblx0XHRpZiAodGhpcy5wcmV2aW91c1N0YXRlICYmICF0aGlzLmRpZEZpbmlzaExvYWRpbmdSZXBvc2l0b3JpZXMuZ2V0KCkpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5wcmV2aW91c1N0YXRlLmFsbC5pbmRleE9mKGdldFByb3ZpZGVyU3RvcmFnZUtleShyZXBvc2l0b3J5LnByb3ZpZGVyKSk7XG5cblx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0Ly8gVGhpcyByZXBvc2l0b3J5IGlzIG5vdCBwYXJ0IG9mIHRoZSBwcmV2aW91cyBzdGF0ZSB3aGljaCBtZWFucyB0aGF0IGl0XG5cdFx0XHRcdC8vIHdhcyBlaXRoZXIgbWFudWFsbHkgY2xvc2VkIGluIHRoZSBwcmV2aW91cyBzZXNzaW9uLCBvciB0aGUgcmVwb3NpdG9yeVxuXHRcdFx0XHQvLyB3YXMgYWRkZWQgYWZ0ZXIgdGhlIHByZXZpb3VzIHNlc3Npb24uIEluIHRoaXMgY2FzZSwgd2Ugc2hvdWxkIHNlbGVjdFxuXHRcdFx0XHQvLyBhbGwgb2YgdGhlIHJlcG9zaXRvcmllcy5cblx0XHRcdFx0Y29uc3QgYWRkZWQ6IElTQ01SZXBvc2l0b3J5W10gPSBbXTtcblxuXHRcdFx0XHR0aGlzLmluc2VydFJlcG9zaXRvcnlWaWV3KHRoaXMuX3JlcG9zaXRvcmllcywgcmVwb3NpdG9yeVZpZXcpO1xuXG5cdFx0XHRcdGlmICh0aGlzLnNlbGVjdGlvbk1vZGVDb25maWcuZ2V0KCkgPT09IElTQ01SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZS5NdWx0aXBsZSB8fCAhdGhpcy5fcmVwb3NpdG9yaWVzLmZpbmQociA9PiByLnNlbGVjdGlvbkluZGV4ICE9PSAtMSkpIHtcblx0XHRcdFx0XHQvLyBNdWx0aXBsZSBzZWxlY3Rpb24gbW9kZSBvciBzaW5nbGUgc2VsZWN0aW9uIG1vZGUgKHNlbGVjdCBmaXJzdCByZXBvc2l0b3J5KVxuXHRcdFx0XHRcdHRoaXMuX3JlcG9zaXRvcmllcy5mb3JFYWNoKChyZXBvc2l0b3J5VmlldywgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChyZXBvc2l0b3J5Vmlldy5zZWxlY3Rpb25JbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0YWRkZWQucHVzaChyZXBvc2l0b3J5Vmlldy5yZXBvc2l0b3J5KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJlcG9zaXRvcnlWaWV3LnNlbGVjdGlvbkluZGV4ID0gaW5kZXg7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJlcG9zaXRvcmllcy5maXJlKHsgYWRkZWQsIHJlbW92ZWQ6IEl0ZXJhYmxlLmVtcHR5KCkgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmRpZFNlbGVjdFJlcG9zaXRvcnkgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5wcmV2aW91c1N0YXRlLnZpc2libGUuaW5kZXhPZihpbmRleCkgPT09IC0xKSB7XG5cdFx0XHRcdC8vIEV4cGxpY2l0IHNlbGVjdGlvbiBzdGFydGVkXG5cdFx0XHRcdGlmICh0aGlzLmRpZFNlbGVjdFJlcG9zaXRvcnkpIHtcblx0XHRcdFx0XHR0aGlzLmluc2VydFJlcG9zaXRvcnlWaWV3KHRoaXMuX3JlcG9zaXRvcmllcywgcmVwb3NpdG9yeVZpZXcpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVwb3NpdG9yaWVzLmZpcmUoeyBhZGRlZDogSXRlcmFibGUuZW1wdHkoKSwgcmVtb3ZlZDogSXRlcmFibGUuZW1wdHkoKSB9KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEZpcnN0IHZpc2libGUgcmVwb3NpdG9yeVxuXHRcdFx0XHRpZiAoIXRoaXMuZGlkU2VsZWN0UmVwb3NpdG9yeSkge1xuXHRcdFx0XHRcdHJlbW92ZWQgPSBbLi4udGhpcy52aXNpYmxlUmVwb3NpdG9yaWVzXTtcblx0XHRcdFx0XHR0aGlzLl9yZXBvc2l0b3JpZXMuZm9yRWFjaChyID0+IHtcblx0XHRcdFx0XHRcdHIuZm9jdXNlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0ci5zZWxlY3Rpb25JbmRleCA9IC0xO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0dGhpcy5kaWRTZWxlY3RSZXBvc2l0b3J5ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNlbGVjdGlvbk1vZGVDb25maWcuZ2V0KCkgPT09IElTQ01SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZS5NdWx0aXBsZSB8fCAhdGhpcy5fcmVwb3NpdG9yaWVzLmZpbmQociA9PiByLnNlbGVjdGlvbkluZGV4ICE9PSAtMSkpIHtcblx0XHRcdC8vIE11bHRpcGxlIHNlbGVjdGlvbiBtb2RlIG9yIHNpbmdsZSBzZWxlY3Rpb24gbW9kZSAoc2VsZWN0IGZpcnN0IHJlcG9zaXRvcnkpXG5cdFx0XHRjb25zdCBtYXhTZWxlY3Rpb25JbmRleCA9IHRoaXMuZ2V0TWF4U2VsZWN0aW9uSW5kZXgoKTtcblx0XHRcdHRoaXMuaW5zZXJ0UmVwb3NpdG9yeVZpZXcodGhpcy5fcmVwb3NpdG9yaWVzLCB7IC4uLnJlcG9zaXRvcnlWaWV3LCBzZWxlY3Rpb25JbmRleDogbWF4U2VsZWN0aW9uSW5kZXggKyAxIH0pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXBvc2l0b3JpZXMuZmlyZSh7IGFkZGVkOiBbcmVwb3NpdG9yeVZpZXcucmVwb3NpdG9yeV0sIHJlbW92ZWQgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNpbmdsZSBzZWxlY3Rpb24gbW9kZSAoYWRkIHN1YnNlcXVlbnQgcmVwb3NpdG9yeSlcblx0XHRcdHRoaXMuaW5zZXJ0UmVwb3NpdG9yeVZpZXcodGhpcy5fcmVwb3NpdG9yaWVzLCByZXBvc2l0b3J5Vmlldyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJlcG9zaXRvcmllcy5maXJlKHsgYWRkZWQ6IEl0ZXJhYmxlLmVtcHR5KCksIHJlbW92ZWQgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9jdXMgcmVwb3NpdG9yeSBpZiBub3RoaW5nIGlzIGZvY3VzZWRcblx0XHRpZiAoIXRoaXMuX3JlcG9zaXRvcmllcy5maW5kKHIgPT4gci5mb2N1c2VkKSkge1xuXHRcdFx0dGhpcy5mb2N1cyhyZXBvc2l0b3J5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkUmVtb3ZlUmVwb3NpdG9yeShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kaWRGaW5pc2hMb2FkaW5nUmVwb3NpdG9yaWVzLmdldCgpKSB7XG5cdFx0XHR0aGlzLmV2ZW50dWFsbHlGaW5pc2hMb2FkaW5nKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwb3NpdG9yaWVzSW5kZXggPSB0aGlzLl9yZXBvc2l0b3JpZXMuZmluZEluZGV4KHIgPT4gci5yZXBvc2l0b3J5ID09PSByZXBvc2l0b3J5KTtcblxuXHRcdGlmIChyZXBvc2l0b3JpZXNJbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgYWRkZWQ6IEl0ZXJhYmxlPElTQ01SZXBvc2l0b3J5PiA9IEl0ZXJhYmxlLmVtcHR5KCk7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IHRoaXMuX3JlcG9zaXRvcmllcy5zcGxpY2UocmVwb3NpdG9yaWVzSW5kZXgsIDEpO1xuXG5cdFx0aWYgKHRoaXMuX3JlcG9zaXRvcmllcy5sZW5ndGggPiAwICYmIHRoaXMudmlzaWJsZVJlcG9zaXRvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3JlcG9zaXRvcmllc1swXS5zZWxlY3Rpb25JbmRleCA9IDA7XG5cdFx0XHRhZGRlZCA9IFt0aGlzLl9yZXBvc2l0b3JpZXNbMF0ucmVwb3NpdG9yeV07XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXBvc2l0b3JpZXMuZmlyZSh7IGFkZGVkLCByZW1vdmVkOiByZW1vdmVkLm1hcChyID0+IHIucmVwb3NpdG9yeSkgfSk7XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgZm9jdXNlZCByZXBvc2l0b3J5IHdhcyByZW1vdmVkXG5cdFx0aWYgKHJlbW92ZWQubGVuZ3RoID09PSAxICYmIHJlbW92ZWRbMF0uZm9jdXNlZCAmJiB0aGlzLnZpc2libGVSZXBvc2l0b3JpZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5mb2N1cyh0aGlzLnZpc2libGVSZXBvc2l0b3JpZXNbMF0pO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBsYXN0IHJlcG9zaXRvcnkgd2FzIHJlbW92ZWRcblx0XHRpZiAocmVtb3ZlZC5sZW5ndGggPT09IDEgJiYgdGhpcy5fcmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1c1JlcG9zaXRvcnkuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBwaW5uZWQgcmVwb3NpdG9yeSB3YXMgcmVtb3ZlZFxuXHRcdGlmIChyZW1vdmVkLmxlbmd0aCA9PT0gMSAmJiByZW1vdmVkWzBdLnJlcG9zaXRvcnkgPT09IHRoaXMuX2FjdGl2ZVJlcG9zaXRvcnlQaW5uZWRPYnMuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVJlcG9zaXRvcnlQaW5uZWRPYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRpc1Zpc2libGUocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVwb3NpdG9yaWVzLmZpbmQociA9PiByLnJlcG9zaXRvcnkgPT09IHJlcG9zaXRvcnkpPy5zZWxlY3Rpb25JbmRleCAhPT0gLTE7XG5cdH1cblxuXHR0b2dnbGVWaXNpYmlsaXR5KHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5LCB2aXNpYmxlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdmlzaWJsZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHZpc2libGUgPSAhdGhpcy5pc1Zpc2libGUocmVwb3NpdG9yeSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmlzVmlzaWJsZShyZXBvc2l0b3J5KSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRpZiAodGhpcy5zZWxlY3Rpb25Nb2RlQ29uZmlnLmdldCgpID09PSBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuU2luZ2xlKSB7XG5cdFx0XHRcdHRoaXMudmlzaWJsZVJlcG9zaXRvcmllcyA9IFtyZXBvc2l0b3J5XTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5zZWxlY3Rpb25Nb2RlQ29uZmlnLmdldCgpID09PSBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuTXVsdGlwbGUpIHtcblx0XHRcdFx0dGhpcy52aXNpYmxlUmVwb3NpdG9yaWVzID0gWy4uLnRoaXMudmlzaWJsZVJlcG9zaXRvcmllcywgcmVwb3NpdG9yeV07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy52aXNpYmxlUmVwb3NpdG9yaWVzLmluZGV4T2YocmVwb3NpdG9yeSk7XG5cblx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdHRoaXMudmlzaWJsZVJlcG9zaXRvcmllcyA9IFtcblx0XHRcdFx0XHQuLi50aGlzLnZpc2libGVSZXBvc2l0b3JpZXMuc2xpY2UoMCwgaW5kZXgpLFxuXHRcdFx0XHRcdC4uLnRoaXMudmlzaWJsZVJlcG9zaXRvcmllcy5zbGljZShpbmRleCArIDEpXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlU29ydEtleShzb3J0S2V5OiBJU0NNUmVwb3NpdG9yeVNvcnRLZXkpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXBvc2l0b3JpZXNTb3J0S2V5ID0gc29ydEtleTtcblx0XHR0aGlzLl9zb3J0S2V5Q29udGV4dEtleS5zZXQodGhpcy5fcmVwb3NpdG9yaWVzU29ydEtleSk7XG5cdFx0dGhpcy5fcmVwb3NpdG9yaWVzLnNvcnQodGhpcy5jb21wYXJlUmVwb3NpdG9yaWVzLmJpbmQodGhpcykpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXBvc2l0b3JpZXMuZmlyZSh7IGFkZGVkOiBJdGVyYWJsZS5lbXB0eSgpLCByZW1vdmVkOiBJdGVyYWJsZS5lbXB0eSgpIH0pO1xuXHR9XG5cblx0dG9nZ2xlU2VsZWN0aW9uTW9kZShzZWxlY3Rpb25Nb2RlOiAnbXVsdGlwbGUnIHwgJ3NpbmdsZScpOiB2b2lkIHtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdzY20ucmVwb3NpdG9yaWVzLnNlbGVjdGlvbk1vZGUnLCBzZWxlY3Rpb25Nb2RlKTtcblx0fVxuXG5cdGZvY3VzKHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHJlcG9zaXRvcnkgJiYgIXRoaXMuaXNWaXNpYmxlKHJlcG9zaXRvcnkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVwb3NpdG9yaWVzLmZvckVhY2gociA9PiByLmZvY3VzZWQgPSByLnJlcG9zaXRvcnkgPT09IHJlcG9zaXRvcnkpO1xuXG5cdFx0aWYgKHRoaXMuX3JlcG9zaXRvcmllcy5maW5kKHIgPT4gci5mb2N1c2VkKSkge1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1c1JlcG9zaXRvcnkuZmlyZShyZXBvc2l0b3J5KTtcblx0XHR9XG5cdH1cblxuXHRwaW5BY3RpdmVSZXBvc2l0b3J5KHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlUmVwb3NpdG9yeVBpbm5lZE9icy5zZXQocmVwb3NpdG9yeSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcGFyZVJlcG9zaXRvcmllcyhvcDE6IElTQ01SZXBvc2l0b3J5Vmlldywgb3AyOiBJU0NNUmVwb3NpdG9yeVZpZXcpOiBudW1iZXIge1xuXHRcdC8vIFNvcnQgYnkgZGlzY292ZXJ5IHRpbWVcblx0XHRpZiAodGhpcy5fcmVwb3NpdG9yaWVzU29ydEtleSA9PT0gSVNDTVJlcG9zaXRvcnlTb3J0S2V5LkRpc2NvdmVyeVRpbWUpIHtcblx0XHRcdHJldHVybiBvcDEuZGlzY292ZXJ5VGltZSAtIG9wMi5kaXNjb3ZlcnlUaW1lO1xuXHRcdH1cblxuXHRcdC8vIFNvcnQgYnkgcGF0aFxuXHRcdGlmICh0aGlzLl9yZXBvc2l0b3JpZXNTb3J0S2V5ID09PSAncGF0aCcgJiYgb3AxLnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSAmJiBvcDIucmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpKSB7XG5cdFx0XHRyZXR1cm4gY29tcGFyZVBhdGhzKG9wMS5yZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkuZnNQYXRoLCBvcDIucmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpLmZzUGF0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gU29ydCBieSBuYW1lLCBwYXRoXG5cdFx0Y29uc3QgbmFtZTEgPSBnZXRSZXBvc2l0b3J5TmFtZSh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBvcDEucmVwb3NpdG9yeSk7XG5cdFx0Y29uc3QgbmFtZTIgPSBnZXRSZXBvc2l0b3J5TmFtZSh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBvcDIucmVwb3NpdG9yeSk7XG5cblx0XHRjb25zdCBuYW1lQ29tcGFyaXNvbiA9IGNvbXBhcmVGaWxlTmFtZXMobmFtZTEsIG5hbWUyKTtcblx0XHRpZiAobmFtZUNvbXBhcmlzb24gPT09IDAgJiYgb3AxLnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSAmJiBvcDIucmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpKSB7XG5cdFx0XHRyZXR1cm4gY29tcGFyZVBhdGhzKG9wMS5yZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkuZnNQYXRoLCBvcDIucmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpLmZzUGF0aCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5hbWVDb21wYXJpc29uO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXhTZWxlY3Rpb25JbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yZXBvc2l0b3JpZXMubGVuZ3RoID09PSAwID8gLTEgOlxuXHRcdFx0TWF0aC5tYXgoLi4udGhpcy5fcmVwb3NpdG9yaWVzLm1hcChyID0+IHIuc2VsZWN0aW9uSW5kZXgpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld1NvcnRPcmRlcigpOiBJU0NNUmVwb3NpdG9yeVNvcnRLZXkge1xuXHRcdGNvbnN0IHNvcnRPZGVyID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZGlzY292ZXJ5IHRpbWUnIHwgJ25hbWUnIHwgJ3BhdGgnPignc2NtLnJlcG9zaXRvcmllcy5zb3J0T3JkZXInKTtcblx0XHRzd2l0Y2ggKHNvcnRPZGVyKSB7XG5cdFx0XHRjYXNlICdkaXNjb3ZlcnkgdGltZSc6XG5cdFx0XHRcdHJldHVybiBJU0NNUmVwb3NpdG9yeVNvcnRLZXkuRGlzY292ZXJ5VGltZTtcblx0XHRcdGNhc2UgJ25hbWUnOlxuXHRcdFx0XHRyZXR1cm4gSVNDTVJlcG9zaXRvcnlTb3J0S2V5Lk5hbWU7XG5cdFx0XHRjYXNlICdwYXRoJzpcblx0XHRcdFx0cmV0dXJuIElTQ01SZXBvc2l0b3J5U29ydEtleS5QYXRoO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIElTQ01SZXBvc2l0b3J5U29ydEtleS5EaXNjb3ZlcnlUaW1lO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaW5zZXJ0UmVwb3NpdG9yeVZpZXcocmVwb3NpdG9yaWVzOiBJU0NNUmVwb3NpdG9yeVZpZXdbXSwgcmVwb3NpdG9yeVZpZXc6IElTQ01SZXBvc2l0b3J5Vmlldyk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gYmluYXJ5U2VhcmNoKHJlcG9zaXRvcmllcywgcmVwb3NpdG9yeVZpZXcsIHRoaXMuY29tcGFyZVJlcG9zaXRvcmllcy5iaW5kKHRoaXMpKTtcblx0XHRyZXBvc2l0b3JpZXMuc3BsaWNlKGluZGV4IDwgMCA/IH5pbmRleCA6IGluZGV4LCAwLCByZXBvc2l0b3J5Vmlldyk7XG5cdH1cblxuXHRwcml2YXRlIG9uV2lsbFNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZGlkRmluaXNoTG9hZGluZ1JlcG9zaXRvcmllcy5nZXQoKSkge1xuXHRcdFx0Ly8gRG9uJ3QgcmVtZW1iZXIgc3RhdGUsIGlmIHRoZSB3b3JrYmVuY2ggZGlkbid0IHJlYWxseSBmaW5pc2ggbG9hZGluZ1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbCA9IHRoaXMucmVwb3NpdG9yaWVzLm1hcChyID0+IGdldFByb3ZpZGVyU3RvcmFnZUtleShyLnByb3ZpZGVyKSk7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHRoaXMudmlzaWJsZVJlcG9zaXRvcmllcy5tYXAociA9PiBhbGwuaW5kZXhPZihnZXRQcm92aWRlclN0b3JhZ2VLZXkoci5wcm92aWRlcikpKTtcblx0XHR0aGlzLnByZXZpb3VzU3RhdGUgPSB7IGFsbCwgdmlzaWJsZSwgc29ydEtleTogdGhpcy5fcmVwb3NpdG9yaWVzU29ydEtleSB9IHNhdGlzZmllcyBJU0NNVmlld1NlcnZpY2VTdGF0ZTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3NjbTp2aWV3OnZpc2libGVSZXBvc2l0b3JpZXMnLCBKU09OLnN0cmluZ2lmeSh0aGlzLnByZXZpb3VzU3RhdGUpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0QGRlYm91bmNlKDUwMDApXG5cdHByaXZhdGUgZXZlbnR1YWxseUZpbmlzaExvYWRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5maW5pc2hMb2FkaW5nKCk7XG5cdH1cblxuXHRwcml2YXRlIGZpbmlzaExvYWRpbmcoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZGlkRmluaXNoTG9hZGluZ1JlcG9zaXRvcmllcy5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZGlkRmluaXNoTG9hZGluZ1JlcG9zaXRvcmllcy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRGb2N1c1JlcG9zaXRvcnkuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVwb3NpdG9yaWVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFNldFZpc2libGVSZXBvc2l0b3JpZXMuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsU0FB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
