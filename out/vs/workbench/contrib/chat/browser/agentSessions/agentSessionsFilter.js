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
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { equals } from "../../../../../base/common/objects.js";
import { localize } from "../../../../../nls.js";
import { registerAction2, Action2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IChatSessionsService } from "../../common/chatSessionsService.js";
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderName } from "./agentSessions.js";
import { AgentSessionStatus } from "./agentSessionsModel.js";
var AgentSessionsGrouping = /* @__PURE__ */ ((AgentSessionsGrouping2) => {
  AgentSessionsGrouping2["Capped"] = "capped";
  AgentSessionsGrouping2["Date"] = "date";
  AgentSessionsGrouping2["Repository"] = "repository";
  return AgentSessionsGrouping2;
})(AgentSessionsGrouping || {});
var AgentSessionsSorting = /* @__PURE__ */ ((AgentSessionsSorting2) => {
  AgentSessionsSorting2["Created"] = "created";
  AgentSessionsSorting2["Updated"] = "updated";
  return AgentSessionsSorting2;
})(AgentSessionsSorting || {});
const DEFAULT_EXCLUDES = Object.freeze({
  providers: [],
  states: [],
  archived: true,
  read: false,
  repositoryGroupCapped: true
});
let AgentSessionsFilter = class extends Disposable {
  constructor(options, chatSessionsService, storageService) {
    super();
    this.options = options;
    this.chatSessionsService = chatSessionsService;
    this.storageService = storageService;
    this.STORAGE_KEY = `agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu`;
    this.SORTING_STORAGE_KEY = `agentSessions.sorting`;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.limitResults = () => this.options.limitResults?.();
    this.groupResults = () => this.options.groupResults?.();
    this.sortResults = () => this.options.sortResults?.() ?? this.currentSorting;
    this.excludes = DEFAULT_EXCLUDES;
    this.isStoringExcludes = false;
    this.currentSorting = "created" /* Created */;
    this.actionDisposables = this._register(new DisposableStore());
    this.restoreSorting();
    this.updateExcludes(false);
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.chatSessionsService.onDidChangeItemsProviders(() => this.updateFilterActions()));
    this._register(this.chatSessionsService.onDidChangeAvailability(() => this.updateFilterActions()));
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, this.STORAGE_KEY, this._store)(() => this.updateExcludes(true)));
  }
  updateExcludes(fromEvent) {
    if (!this.isStoringExcludes) {
      const excludedTypesRaw = this.storageService.get(this.STORAGE_KEY, StorageScope.PROFILE);
      if (excludedTypesRaw) {
        try {
          this.excludes = JSON.parse(excludedTypesRaw);
        } catch {
          this.excludes = { ...DEFAULT_EXCLUDES };
        }
      } else {
        this.excludes = { ...DEFAULT_EXCLUDES };
      }
    }
    this.updateFilterActions();
    if (fromEvent) {
      this._onDidChange.fire();
    }
  }
  storeExcludes(excludes) {
    this.excludes = excludes;
    this.isStoringExcludes = true;
    try {
      if (equals(this.excludes, DEFAULT_EXCLUDES)) {
        this.storageService.remove(this.STORAGE_KEY, StorageScope.PROFILE);
      } else {
        this.storageService.store(this.STORAGE_KEY, JSON.stringify(this.excludes), StorageScope.PROFILE, StorageTarget.USER);
      }
    } finally {
      this.isStoringExcludes = false;
    }
  }
  restoreSorting() {
    const storedSorting = this.storageService.get(this.SORTING_STORAGE_KEY, StorageScope.PROFILE);
    if (storedSorting && Object.values(AgentSessionsSorting).includes(storedSorting)) {
      this.currentSorting = storedSorting;
    }
  }
  setSorting(sorting) {
    if (this.currentSorting === sorting) {
      return;
    }
    this.currentSorting = sorting;
    this.storageService.store(this.SORTING_STORAGE_KEY, sorting, StorageScope.PROFILE, StorageTarget.USER);
    this.updateFilterActions();
    this._onDidChange.fire();
  }
  updateFilterActions() {
    this.actionDisposables.clear();
    const menuId = this.options.filterMenuId;
    if (!menuId) {
      return;
    }
    this.registerSortActions(this.actionDisposables, menuId);
    this.registerProviderActions(this.actionDisposables, menuId);
    this.registerStateActions(this.actionDisposables, menuId);
    this.registerArchivedActions(this.actionDisposables, menuId);
    this.registerReadActions(this.actionDisposables, menuId);
    this.registerResetAction(this.actionDisposables, menuId);
  }
  registerSortActions(disposables, menuId) {
    const that = this;
    disposables.add(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `agentSessions.filter.sortByCreated.${menuId.id.toLowerCase()}`,
          title: localize("agentSessions.filter.sortByCreated", "Sort by Created"),
          menu: {
            id: menuId,
            group: "0_sort",
            order: 0
          },
          toggled: that.currentSorting === "created" /* Created */ ? ContextKeyExpr.true() : ContextKeyExpr.false()
        });
      }
      run() {
        that.setSorting("created" /* Created */);
      }
    }));
    disposables.add(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `agentSessions.filter.sortByUpdated.${menuId.id.toLowerCase()}`,
          title: localize("agentSessions.filter.sortByUpdated", "Sort by Updated"),
          menu: {
            id: menuId,
            group: "0_sort",
            order: 1
          },
          toggled: that.currentSorting === "updated" /* Updated */ ? ContextKeyExpr.true() : ContextKeyExpr.false()
        });
      }
      run() {
        that.setSorting("updated" /* Updated */);
      }
    }));
  }
  registerProviderActions(disposables, menuId) {
    const labelOverrides = this.options.providerLabelOverrides;
    const resolveLabel = (id) => {
      if (labelOverrides?.has(id)) {
        return labelOverrides.get(id);
      }
      const knownProvider = getAgentSessionProvider(id);
      return knownProvider ? getAgentSessionProviderName(knownProvider) : id;
    };
    let providers;
    if (this.options.allowedProviders) {
      providers = this.options.allowedProviders.map((id) => ({ id, label: resolveLabel(id) }));
    } else {
      providers = [{ id: AgentSessionProviders.Local, label: resolveLabel(AgentSessionProviders.Local) }];
      for (const contribution of this.chatSessionsService.getAllChatSessionContributions()) {
        if (providers.find((p) => p.id === contribution.type)) {
          continue;
        }
        providers.push({
          id: contribution.type,
          label: resolveLabel(contribution.type)
        });
      }
    }
    const that = this;
    let counter = 0;
    for (const provider of providers) {
      disposables.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `agentSessions.filter.toggleExclude:${provider.id}.${menuId.id.toLowerCase()}`,
            title: provider.label,
            menu: {
              id: menuId,
              group: "1_providers",
              order: counter++
            },
            toggled: that.excludes.providers.includes(provider.id) ? ContextKeyExpr.false() : ContextKeyExpr.true()
          });
        }
        run() {
          const providerExcludes = new Set(that.excludes.providers);
          if (!providerExcludes.delete(provider.id)) {
            providerExcludes.add(provider.id);
          }
          that.storeExcludes({ ...that.excludes, providers: Array.from(providerExcludes) });
        }
      }));
    }
  }
  registerStateActions(disposables, menuId) {
    const states = [
      { id: AgentSessionStatus.Completed, label: localize("agentSessionStatus.completed", "Completed") },
      { id: AgentSessionStatus.InProgress, label: localize("agentSessionStatus.inProgress", "In Progress") },
      { id: AgentSessionStatus.NeedsInput, label: localize("agentSessionStatus.needsInput", "Input Needed") },
      { id: AgentSessionStatus.Failed, label: localize("agentSessionStatus.failed", "Failed") }
    ];
    const that = this;
    let counter = 0;
    for (const state of states) {
      disposables.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `agentSessions.filter.toggleExcludeState:${state.id}.${menuId.id.toLowerCase()}`,
            title: state.label,
            menu: {
              id: menuId,
              group: "2_states",
              order: counter++
            },
            toggled: that.excludes.states.includes(state.id) ? ContextKeyExpr.false() : ContextKeyExpr.true()
          });
        }
        run() {
          const stateExcludes = new Set(that.excludes.states);
          if (!stateExcludes.delete(state.id)) {
            stateExcludes.add(state.id);
          }
          that.storeExcludes({ ...that.excludes, states: Array.from(stateExcludes) });
        }
      }));
    }
  }
  registerArchivedActions(disposables, menuId) {
    const that = this;
    disposables.add(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `agentSessions.filter.toggleExcludeArchived.${menuId.id.toLowerCase()}`,
          title: localize("agentSessions.filter.archived", "Archived"),
          menu: {
            id: menuId,
            group: "3_props",
            order: 1e3
          },
          toggled: that.excludes.archived ? ContextKeyExpr.false() : ContextKeyExpr.true()
        });
      }
      run() {
        that.storeExcludes({ ...that.excludes, archived: !that.excludes.archived });
      }
    }));
  }
  registerReadActions(disposables, menuId) {
    const that = this;
    disposables.add(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `agentSessions.filter.toggleExcludeRead.${menuId.id.toLowerCase()}`,
          title: localize("agentSessions.filter.read", "Read"),
          menu: {
            id: menuId,
            group: "3_props",
            order: 0
          },
          toggled: that.excludes.read ? ContextKeyExpr.false() : ContextKeyExpr.true()
        });
      }
      run() {
        that.storeExcludes({ ...that.excludes, read: !that.excludes.read });
      }
    }));
  }
  /**
   * Programmatically toggle the repository group capping state.
   */
  setRepositoryGroupCapped(capped) {
    if (this.excludes.repositoryGroupCapped !== capped) {
      this.storeExcludes({ ...this.excludes, repositoryGroupCapped: capped });
    }
  }
  registerResetAction(disposables, menuId) {
    const that = this;
    disposables.add(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `agentSessions.filter.resetExcludes.${menuId.id.toLowerCase()}`,
          title: localize("agentSessions.filter.reset", "Reset"),
          menu: {
            id: menuId,
            group: "4_reset",
            order: 0
          }
        });
      }
      run() {
        that.reset();
      }
    }));
  }
  isDefault() {
    return equals(this.excludes, DEFAULT_EXCLUDES) && this.currentSorting === "created" /* Created */;
  }
  getExcludes() {
    return this.excludes;
  }
  exclude(session) {
    const overrideExclude = this.options?.overrideExclude?.(session);
    if (typeof overrideExclude === "boolean") {
      return overrideExclude;
    }
    if (this.options.allowedProviders && !this.options.allowedProviders.includes(session.providerType)) {
      return true;
    }
    if (this.excludes.read && session.isRead()) {
      return true;
    }
    if (this.excludes.providers.includes(session.providerType)) {
      return true;
    }
    if (this.excludes.states.includes(session.status)) {
      return true;
    }
    if (this.excludes.archived && this.groupResults?.() === "capped" /* Capped */ && session.isArchived()) {
      return true;
    }
    return false;
  }
  notifyResults(count) {
    this.options.notifyResults?.(count);
  }
  reset() {
    this.storeExcludes({ ...DEFAULT_EXCLUDES });
    if (this.currentSorting !== "created" /* Created */) {
      this.setSorting("created" /* Created */);
    }
  }
};
AgentSessionsFilter = __decorateClass([
  __decorateParam(1, IChatSessionsService),
  __decorateParam(2, IStorageService)
], AgentSessionsFilter);
export {
  AgentSessionsFilter,
  AgentSessionsGrouping,
  AgentSessionsSorting
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbnNGaWx0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uU3RhdHVzLCBJQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNGaWx0ZXIsIElBZ2VudFNlc3Npb25zRmlsdGVyRXhjbHVkZXMgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNWaWV3ZXIuanMnO1xuXG5leHBvcnQgZW51bSBBZ2VudFNlc3Npb25zR3JvdXBpbmcge1xuXHRDYXBwZWQgPSAnY2FwcGVkJyxcblx0RGF0ZSA9ICdkYXRlJyxcblx0UmVwb3NpdG9yeSA9ICdyZXBvc2l0b3J5J1xufVxuXG5leHBvcnQgZW51bSBBZ2VudFNlc3Npb25zU29ydGluZyB7XG5cdENyZWF0ZWQgPSAnY3JlYXRlZCcsXG5cdFVwZGF0ZWQgPSAndXBkYXRlZCdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRTZXNzaW9uc0ZpbHRlck9wdGlvbnMgZXh0ZW5kcyBQYXJ0aWFsPElBZ2VudFNlc3Npb25zRmlsdGVyPiB7XG5cblx0cmVhZG9ubHkgZmlsdGVyTWVudUlkPzogTWVudUlkO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHNldCwgb25seSB0aGVzZSBwcm92aWRlcnMgYXBwZWFyIGluIHRoZSBmaWx0ZXIgbWVudSAob3B0LWluKS5cblx0ICogV2hlbiB1bnNldCwgYWxsIHJlZ2lzdGVyZWQgY29udHJpYnV0aW9ucyBwbHVzIGBMb2NhbGAgYXJlIHNob3duLlxuXHQgKi9cblx0cmVhZG9ubHkgYWxsb3dlZFByb3ZpZGVycz86IEFnZW50U2Vzc2lvblByb3ZpZGVyc1tdO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBsYWJlbCBvdmVycmlkZXMgZm9yIHByb3ZpZGVycyBzaG93biBpbiB0aGUgZmlsdGVyIG1lbnUuXG5cdCAqIEZvciBleGFtcGxlLCB0aGUgc2Vzc2lvbnMgd2luZG93IG1hcHMgYEJhY2tncm91bmRgIFx1MjE5MiBcIkxvY2FsXCIuXG5cdCAqL1xuXHRyZWFkb25seSBwcm92aWRlckxhYmVsT3ZlcnJpZGVzPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXG5cdHJlYWRvbmx5IGxpbWl0UmVzdWx0cz86ICgpID0+IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bm90aWZ5UmVzdWx0cz8oY291bnQ6IG51bWJlcik6IHZvaWQ7XG5cblx0cmVhZG9ubHkgZ3JvdXBSZXN1bHRzPzogKCkgPT4gQWdlbnRTZXNzaW9uc0dyb3VwaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzb3J0UmVzdWx0cz86ICgpID0+IEFnZW50U2Vzc2lvbnNTb3J0aW5nIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlRXhjbHVkZT8oc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IERFRkFVTFRfRVhDTFVERVM6IElBZ2VudFNlc3Npb25zRmlsdGVyRXhjbHVkZXMgPSBPYmplY3QuZnJlZXplKHtcblx0cHJvdmlkZXJzOiBbXSBhcyBjb25zdCxcblx0c3RhdGVzOiBbXSBhcyBjb25zdCxcblx0YXJjaGl2ZWQ6IHRydWUgYXMgY29uc3QgLyogYXJjaGl2ZWQgYXJlIG5ldmVyIGV4Y2x1ZGVkIGJ1dCB0b2dnbGUgYmV0d2VlbiBleHBhbmRlZCBhbmQgY29sbGFwc2VkICovLFxuXHRyZWFkOiBmYWxzZSBhcyBjb25zdCxcblx0cmVwb3NpdG9yeUdyb3VwQ2FwcGVkOiB0cnVlIGFzIGNvbnN0IC8qIHdoZW4gdHJ1ZSwgcmVwbyBncm91cHMgYXJlIGNhcHBlZCBhdCBhIGxpbWl0IHdpdGggYSBcInNob3cgbW9yZVwiIGl0ZW0gKi8sXG59KTtcblxuZXhwb3J0IGNsYXNzIEFnZW50U2Vzc2lvbnNGaWx0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgUmVxdWlyZWQ8SUFnZW50U2Vzc2lvbnNGaWx0ZXI+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IFNUT1JBR0VfS0VZID0gYGFnZW50U2Vzc2lvbnMuZmlsdGVyRXhjbHVkZXMuYWdlbnRzZXNzaW9uc3ZpZXdlcmZpbHRlcnN1Ym1lbnVgO1xuXHRwcml2YXRlIHJlYWRvbmx5IFNPUlRJTkdfU1RPUkFHRV9LRVkgPSBgYWdlbnRTZXNzaW9ucy5zb3J0aW5nYDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGxpbWl0UmVzdWx0cyA9ICgpID0+IHRoaXMub3B0aW9ucy5saW1pdFJlc3VsdHM/LigpO1xuXHRyZWFkb25seSBncm91cFJlc3VsdHMgPSAoKSA9PiB0aGlzLm9wdGlvbnMuZ3JvdXBSZXN1bHRzPy4oKTtcblx0cmVhZG9ubHkgc29ydFJlc3VsdHMgPSAoKTogQWdlbnRTZXNzaW9uc1NvcnRpbmcgfCB1bmRlZmluZWQgPT4gdGhpcy5vcHRpb25zLnNvcnRSZXN1bHRzPy4oKSA/PyB0aGlzLmN1cnJlbnRTb3J0aW5nO1xuXG5cdHByaXZhdGUgZXhjbHVkZXMgPSBERUZBVUxUX0VYQ0xVREVTO1xuXHRwcml2YXRlIGlzU3RvcmluZ0V4Y2x1ZGVzID0gZmFsc2U7XG5cdHByaXZhdGUgY3VycmVudFNvcnRpbmc6IEFnZW50U2Vzc2lvbnNTb3J0aW5nID0gQWdlbnRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbkRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElBZ2VudFNlc3Npb25zRmlsdGVyT3B0aW9ucyxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVzdG9yZVNvcnRpbmcoKTtcblx0XHR0aGlzLnVwZGF0ZUV4Y2x1ZGVzKGZhbHNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMoKCkgPT4gdGhpcy51cGRhdGVGaWx0ZXJBY3Rpb25zKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkoKCkgPT4gdGhpcy51cGRhdGVGaWx0ZXJBY3Rpb25zKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgdGhpcy5TVE9SQUdFX0tFWSwgdGhpcy5fc3RvcmUpKCgpID0+IHRoaXMudXBkYXRlRXhjbHVkZXModHJ1ZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRXhjbHVkZXMoZnJvbUV2ZW50OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzU3RvcmluZ0V4Y2x1ZGVzKSB7XG5cdFx0XHRjb25zdCBleGNsdWRlZFR5cGVzUmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQodGhpcy5TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdFx0aWYgKGV4Y2x1ZGVkVHlwZXNSYXcpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLmV4Y2x1ZGVzID0gSlNPTi5wYXJzZShleGNsdWRlZFR5cGVzUmF3KSBhcyBJQWdlbnRTZXNzaW9uc0ZpbHRlckV4Y2x1ZGVzO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHR0aGlzLmV4Y2x1ZGVzID0geyAuLi5ERUZBVUxUX0VYQ0xVREVTIH07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZXhjbHVkZXMgPSB7IC4uLkRFRkFVTFRfRVhDTFVERVMgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUZpbHRlckFjdGlvbnMoKTtcblxuXHRcdGlmIChmcm9tRXZlbnQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0b3JlRXhjbHVkZXMoZXhjbHVkZXM6IElBZ2VudFNlc3Npb25zRmlsdGVyRXhjbHVkZXMpOiB2b2lkIHtcblx0XHR0aGlzLmV4Y2x1ZGVzID0gZXhjbHVkZXM7XG5cblx0XHQvLyBTZXQgZ3VhcmQgYmVmb3JlIHN0b3JhZ2Ugb3BlcmF0aW9uIHRvIHByZXZlbnQgb3VyIG93biBsaXN0ZW5lciBmcm9tXG5cdFx0Ly8gcmUtdHJpZ2dlcmluZyB1cGRhdGVFeGNsdWRlcyB3aGljaCB3b3VsZCByZS1yZWdpc3RlciBhY3Rpb25zIG1pZC1jbGlja1xuXHRcdHRoaXMuaXNTdG9yaW5nRXhjbHVkZXMgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoZXF1YWxzKHRoaXMuZXhjbHVkZXMsIERFRkFVTFRfRVhDTFVERVMpKSB7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKHRoaXMuU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy5TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkodGhpcy5leGNsdWRlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmlzU3RvcmluZ0V4Y2x1ZGVzID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlU29ydGluZygpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZWRTb3J0aW5nID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQodGhpcy5TT1JUSU5HX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKHN0b3JlZFNvcnRpbmcgJiYgT2JqZWN0LnZhbHVlcyhBZ2VudFNlc3Npb25zU29ydGluZykuaW5jbHVkZXMoc3RvcmVkU29ydGluZyBhcyBBZ2VudFNlc3Npb25zU29ydGluZykpIHtcblx0XHRcdHRoaXMuY3VycmVudFNvcnRpbmcgPSBzdG9yZWRTb3J0aW5nIGFzIEFnZW50U2Vzc2lvbnNTb3J0aW5nO1xuXHRcdH1cblx0fVxuXG5cdHNldFNvcnRpbmcoc29ydGluZzogQWdlbnRTZXNzaW9uc1NvcnRpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50U29ydGluZyA9PT0gc29ydGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY3VycmVudFNvcnRpbmcgPSBzb3J0aW5nO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy5TT1JUSU5HX1NUT1JBR0VfS0VZLCBzb3J0aW5nLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLnVwZGF0ZUZpbHRlckFjdGlvbnMoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZpbHRlckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5hY3Rpb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgbWVudUlkID0gdGhpcy5vcHRpb25zLmZpbHRlck1lbnVJZDtcblx0XHRpZiAoIW1lbnVJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVnaXN0ZXJTb3J0QWN0aW9ucyh0aGlzLmFjdGlvbkRpc3Bvc2FibGVzLCBtZW51SWQpO1xuXHRcdHRoaXMucmVnaXN0ZXJQcm92aWRlckFjdGlvbnModGhpcy5hY3Rpb25EaXNwb3NhYmxlcywgbWVudUlkKTtcblx0XHR0aGlzLnJlZ2lzdGVyU3RhdGVBY3Rpb25zKHRoaXMuYWN0aW9uRGlzcG9zYWJsZXMsIG1lbnVJZCk7XG5cdFx0dGhpcy5yZWdpc3RlckFyY2hpdmVkQWN0aW9ucyh0aGlzLmFjdGlvbkRpc3Bvc2FibGVzLCBtZW51SWQpO1xuXHRcdHRoaXMucmVnaXN0ZXJSZWFkQWN0aW9ucyh0aGlzLmFjdGlvbkRpc3Bvc2FibGVzLCBtZW51SWQpO1xuXHRcdHRoaXMucmVnaXN0ZXJSZXNldEFjdGlvbih0aGlzLmFjdGlvbkRpc3Bvc2FibGVzLCBtZW51SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNvcnRBY3Rpb25zKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG1lbnVJZDogTWVudUlkKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYGFnZW50U2Vzc2lvbnMuZmlsdGVyLnNvcnRCeUNyZWF0ZWQuJHttZW51SWQuaWQudG9Mb3dlckNhc2UoKX1gLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5maWx0ZXIuc29ydEJ5Q3JlYXRlZCcsICdTb3J0IGJ5IENyZWF0ZWQnKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogbWVudUlkLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcwX3NvcnQnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0b2dnbGVkOiB0aGF0LmN1cnJlbnRTb3J0aW5nID09PSBBZ2VudFNlc3Npb25zU29ydGluZy5DcmVhdGVkID8gQ29udGV4dEtleUV4cHIudHJ1ZSgpIDogQ29udGV4dEtleUV4cHIuZmFsc2UoKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oKTogdm9pZCB7XG5cdFx0XHRcdHRoYXQuc2V0U29ydGluZyhBZ2VudFNlc3Npb25zU29ydGluZy5DcmVhdGVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgYWdlbnRTZXNzaW9ucy5maWx0ZXIuc29ydEJ5VXBkYXRlZC4ke21lbnVJZC5pZC50b0xvd2VyQ2FzZSgpfWAsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLmZpbHRlci5zb3J0QnlVcGRhdGVkJywgJ1NvcnQgYnkgVXBkYXRlZCcpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBtZW51SWQsXG5cdFx0XHRcdFx0XHRncm91cDogJzBfc29ydCcsXG5cdFx0XHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRvZ2dsZWQ6IHRoYXQuY3VycmVudFNvcnRpbmcgPT09IEFnZW50U2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQgPyBDb250ZXh0S2V5RXhwci50cnVlKCkgOiBDb250ZXh0S2V5RXhwci5mYWxzZSgpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bigpOiB2b2lkIHtcblx0XHRcdFx0dGhhdC5zZXRTb3J0aW5nKEFnZW50U2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJQcm92aWRlckFjdGlvbnMoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgbWVudUlkOiBNZW51SWQpOiB2b2lkIHtcblx0XHRjb25zdCBsYWJlbE92ZXJyaWRlcyA9IHRoaXMub3B0aW9ucy5wcm92aWRlckxhYmVsT3ZlcnJpZGVzO1xuXHRcdGNvbnN0IHJlc29sdmVMYWJlbCA9IChpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRpZiAobGFiZWxPdmVycmlkZXM/LmhhcyhpZCkpIHtcblx0XHRcdFx0cmV0dXJuIGxhYmVsT3ZlcnJpZGVzLmdldChpZCkhO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga25vd25Qcm92aWRlciA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKGlkKTtcblx0XHRcdHJldHVybiBrbm93blByb3ZpZGVyID8gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKGtub3duUHJvdmlkZXIpIDogaWQ7XG5cdFx0fTtcblxuXHRcdGxldCBwcm92aWRlcnM6IHsgaWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9W107XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5hbGxvd2VkUHJvdmlkZXJzKSB7XG5cdFx0XHQvLyBPcHQtaW46IG9ubHkgc2hvdyBleHBsaWNpdGx5IGFsbG93ZWQgcHJvdmlkZXJzXG5cdFx0XHRwcm92aWRlcnMgPSB0aGlzLm9wdGlvbnMuYWxsb3dlZFByb3ZpZGVycy5tYXAoaWQgPT4gKHsgaWQsIGxhYmVsOiByZXNvbHZlTGFiZWwoaWQpIH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRGVmYXVsdDogTG9jYWwgKyBhbGwgcmVnaXN0ZXJlZCBjb250cmlidXRpb25zXG5cdFx0XHRwcm92aWRlcnMgPSBbeyBpZDogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLCBsYWJlbDogcmVzb2x2ZUxhYmVsKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCkgfV07XG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zKCkpIHtcblx0XHRcdFx0aWYgKHByb3ZpZGVycy5maW5kKHAgPT4gcC5pZCA9PT0gY29udHJpYnV0aW9uLnR5cGUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIGFscmVhZHkgYWRkZWRcblx0XHRcdFx0fVxuXHRcdFx0XHRwcm92aWRlcnMucHVzaCh7XG5cdFx0XHRcdFx0aWQ6IGNvbnRyaWJ1dGlvbi50eXBlLFxuXHRcdFx0XHRcdGxhYmVsOiByZXNvbHZlTGFiZWwoY29udHJpYnV0aW9uLnR5cGUpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGxldCBjb3VudGVyID0gMDtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHByb3ZpZGVycykge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogYGFnZW50U2Vzc2lvbnMuZmlsdGVyLnRvZ2dsZUV4Y2x1ZGU6JHtwcm92aWRlci5pZH0uJHttZW51SWQuaWQudG9Mb3dlckNhc2UoKX1gLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHByb3ZpZGVyLmxhYmVsLFxuXHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRpZDogbWVudUlkLFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzFfcHJvdmlkZXJzJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IGNvdW50ZXIrKyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0b2dnbGVkOiB0aGF0LmV4Y2x1ZGVzLnByb3ZpZGVycy5pbmNsdWRlcyhwcm92aWRlci5pZCkgPyBDb250ZXh0S2V5RXhwci5mYWxzZSgpIDogQ29udGV4dEtleUV4cHIudHJ1ZSgpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJ1bigpOiB2b2lkIHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlckV4Y2x1ZGVzID0gbmV3IFNldCh0aGF0LmV4Y2x1ZGVzLnByb3ZpZGVycyk7XG5cdFx0XHRcdFx0aWYgKCFwcm92aWRlckV4Y2x1ZGVzLmRlbGV0ZShwcm92aWRlci5pZCkpIHtcblx0XHRcdFx0XHRcdHByb3ZpZGVyRXhjbHVkZXMuYWRkKHByb3ZpZGVyLmlkKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGF0LnN0b3JlRXhjbHVkZXMoeyAuLi50aGF0LmV4Y2x1ZGVzLCBwcm92aWRlcnM6IEFycmF5LmZyb20ocHJvdmlkZXJFeGNsdWRlcykgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU3RhdGVBY3Rpb25zKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG1lbnVJZDogTWVudUlkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGVzOiB7IGlkOiBBZ2VudFNlc3Npb25TdGF0dXM7IGxhYmVsOiBzdHJpbmcgfVtdID0gW1xuXHRcdFx0eyBpZDogQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgbGFiZWw6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25TdGF0dXMuY29tcGxldGVkJywgXCJDb21wbGV0ZWRcIikgfSxcblx0XHRcdHsgaWQ6IEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCBsYWJlbDogbG9jYWxpemUoJ2FnZW50U2Vzc2lvblN0YXR1cy5pblByb2dyZXNzJywgXCJJbiBQcm9ncmVzc1wiKSB9LFxuXHRcdFx0eyBpZDogQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsIGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uU3RhdHVzLm5lZWRzSW5wdXQnLCBcIklucHV0IE5lZWRlZFwiKSB9LFxuXHRcdFx0eyBpZDogQWdlbnRTZXNzaW9uU3RhdHVzLkZhaWxlZCwgbGFiZWw6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25TdGF0dXMuZmFpbGVkJywgXCJGYWlsZWRcIikgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdGZvciAoY29uc3Qgc3RhdGUgb2Ygc3RhdGVzKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBgYWdlbnRTZXNzaW9ucy5maWx0ZXIudG9nZ2xlRXhjbHVkZVN0YXRlOiR7c3RhdGUuaWR9LiR7bWVudUlkLmlkLnRvTG93ZXJDYXNlKCl9YCxcblx0XHRcdFx0XHRcdHRpdGxlOiBzdGF0ZS5sYWJlbCxcblx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IG1lbnVJZCxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcyX3N0YXRlcycsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiBjb3VudGVyKyssXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dG9nZ2xlZDogdGhhdC5leGNsdWRlcy5zdGF0ZXMuaW5jbHVkZXMoc3RhdGUuaWQpID8gQ29udGV4dEtleUV4cHIuZmFsc2UoKSA6IENvbnRleHRLZXlFeHByLnRydWUoKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRydW4oKTogdm9pZCB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGVFeGNsdWRlcyA9IG5ldyBTZXQodGhhdC5leGNsdWRlcy5zdGF0ZXMpO1xuXHRcdFx0XHRcdGlmICghc3RhdGVFeGNsdWRlcy5kZWxldGUoc3RhdGUuaWQpKSB7XG5cdFx0XHRcdFx0XHRzdGF0ZUV4Y2x1ZGVzLmFkZChzdGF0ZS5pZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhhdC5zdG9yZUV4Y2x1ZGVzKHsgLi4udGhhdC5leGNsdWRlcywgc3RhdGVzOiBBcnJheS5mcm9tKHN0YXRlRXhjbHVkZXMpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFyY2hpdmVkQWN0aW9ucyhkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBtZW51SWQ6IE1lbnVJZCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGBhZ2VudFNlc3Npb25zLmZpbHRlci50b2dnbGVFeGNsdWRlQXJjaGl2ZWQuJHttZW51SWQuaWQudG9Mb3dlckNhc2UoKX1gLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5maWx0ZXIuYXJjaGl2ZWQnLCAnQXJjaGl2ZWQnKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogbWVudUlkLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICczX3Byb3BzJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxMDAwLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dG9nZ2xlZDogdGhhdC5leGNsdWRlcy5hcmNoaXZlZCA/IENvbnRleHRLZXlFeHByLmZhbHNlKCkgOiBDb250ZXh0S2V5RXhwci50cnVlKCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKCk6IHZvaWQge1xuXHRcdFx0XHR0aGF0LnN0b3JlRXhjbHVkZXMoeyAuLi50aGF0LmV4Y2x1ZGVzLCBhcmNoaXZlZDogIXRoYXQuZXhjbHVkZXMuYXJjaGl2ZWQgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclJlYWRBY3Rpb25zKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG1lbnVJZDogTWVudUlkKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYGFnZW50U2Vzc2lvbnMuZmlsdGVyLnRvZ2dsZUV4Y2x1ZGVSZWFkLiR7bWVudUlkLmlkLnRvTG93ZXJDYXNlKCl9YCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnMuZmlsdGVyLnJlYWQnLCAnUmVhZCcpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBtZW51SWQsXG5cdFx0XHRcdFx0XHRncm91cDogJzNfcHJvcHMnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0b2dnbGVkOiB0aGF0LmV4Y2x1ZGVzLnJlYWQgPyBDb250ZXh0S2V5RXhwci5mYWxzZSgpIDogQ29udGV4dEtleUV4cHIudHJ1ZSgpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bigpOiB2b2lkIHtcblx0XHRcdFx0dGhhdC5zdG9yZUV4Y2x1ZGVzKHsgLi4udGhhdC5leGNsdWRlcywgcmVhZDogIXRoYXQuZXhjbHVkZXMucmVhZCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvZ3JhbW1hdGljYWxseSB0b2dnbGUgdGhlIHJlcG9zaXRvcnkgZ3JvdXAgY2FwcGluZyBzdGF0ZS5cblx0ICovXG5cdHNldFJlcG9zaXRvcnlHcm91cENhcHBlZChjYXBwZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5leGNsdWRlcy5yZXBvc2l0b3J5R3JvdXBDYXBwZWQgIT09IGNhcHBlZCkge1xuXHRcdFx0dGhpcy5zdG9yZUV4Y2x1ZGVzKHsgLi4udGhpcy5leGNsdWRlcywgcmVwb3NpdG9yeUdyb3VwQ2FwcGVkOiBjYXBwZWQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclJlc2V0QWN0aW9uKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG1lbnVJZDogTWVudUlkKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYGFnZW50U2Vzc2lvbnMuZmlsdGVyLnJlc2V0RXhjbHVkZXMuJHttZW51SWQuaWQudG9Mb3dlckNhc2UoKX1gLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9ucy5maWx0ZXIucmVzZXQnLCBcIlJlc2V0XCIpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBtZW51SWQsXG5cdFx0XHRcdFx0XHRncm91cDogJzRfcmVzZXQnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oKTogdm9pZCB7XG5cdFx0XHRcdHRoYXQucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRpc0RlZmF1bHQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVxdWFscyh0aGlzLmV4Y2x1ZGVzLCBERUZBVUxUX0VYQ0xVREVTKSAmJiB0aGlzLmN1cnJlbnRTb3J0aW5nID09PSBBZ2VudFNlc3Npb25zU29ydGluZy5DcmVhdGVkO1xuXHR9XG5cblx0Z2V0RXhjbHVkZXMoKTogSUFnZW50U2Vzc2lvbnNGaWx0ZXJFeGNsdWRlcyB7XG5cdFx0cmV0dXJuIHRoaXMuZXhjbHVkZXM7XG5cdH1cblxuXHRleGNsdWRlKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBib29sZWFuIHtcblx0XHRjb25zdCBvdmVycmlkZUV4Y2x1ZGUgPSB0aGlzLm9wdGlvbnM/Lm92ZXJyaWRlRXhjbHVkZT8uKHNlc3Npb24pO1xuXHRcdGlmICh0eXBlb2Ygb3ZlcnJpZGVFeGNsdWRlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiBvdmVycmlkZUV4Y2x1ZGU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5hbGxvd2VkUHJvdmlkZXJzICYmICF0aGlzLm9wdGlvbnMuYWxsb3dlZFByb3ZpZGVycy5pbmNsdWRlcyhzZXNzaW9uLnByb3ZpZGVyVHlwZSBhcyBBZ2VudFNlc3Npb25Qcm92aWRlcnMpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leGNsdWRlcy5yZWFkICYmIHNlc3Npb24uaXNSZWFkKCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4Y2x1ZGVzLnByb3ZpZGVycy5pbmNsdWRlcyhzZXNzaW9uLnByb3ZpZGVyVHlwZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4Y2x1ZGVzLnN0YXRlcy5pbmNsdWRlcyhzZXNzaW9uLnN0YXR1cykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4Y2x1ZGVzLmFyY2hpdmVkICYmIHRoaXMuZ3JvdXBSZXN1bHRzPy4oKSA9PT0gQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkNhcHBlZCAmJiBzZXNzaW9uLmlzQXJjaGl2ZWQoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGV4Y2x1ZGUgYXJjaGl2ZWQgc2Vzc2lvbnMgd2hlbiBncm91cGVkIGJ5IGNhcHBlZCB3aGVyZSB3ZSBoYXZlIG5vIFwiQXJjaGl2ZWRcIiBncm91cFxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdG5vdGlmeVJlc3VsdHMoY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMub3B0aW9ucy5ub3RpZnlSZXN1bHRzPy4oY291bnQpO1xuXHR9XG5cblx0cmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yZUV4Y2x1ZGVzKHsgLi4uREVGQVVMVF9FWENMVURFUyB9KTtcblx0XHRpZiAodGhpcy5jdXJyZW50U29ydGluZyAhPT0gQWdlbnRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCkge1xuXHRcdFx0dGhpcy5zZXRTb3J0aW5nKEFnZW50U2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsZUFBdUI7QUFDakQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBdUIseUJBQXlCLG1DQUFtQztBQUM1RixTQUFTLDBCQUF5QztBQUczQyxJQUFLLHdCQUFMLGtCQUFLQSwyQkFBTDtBQUNOLEVBQUFBLHVCQUFBLFlBQVM7QUFDVCxFQUFBQSx1QkFBQSxVQUFPO0FBQ1AsRUFBQUEsdUJBQUEsZ0JBQWE7QUFIRixTQUFBQTtBQUFBLEdBQUE7QUFNTCxJQUFLLHVCQUFMLGtCQUFLQywwQkFBTDtBQUNOLEVBQUFBLHNCQUFBLGFBQVU7QUFDVixFQUFBQSxz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QUEsTUFDckQsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUksc0NBQXNDLE9BQU8sR0FBRyxZQUFZLENBQUM7QUFBQSxVQUNqRSxPQUFPLFNBQVMsOEJBQThCLE9BQU87QUFBQSxVQUNyRCxNQUFNO0FBQUEsWUFDTCxJQUFJO0FBQUEsWUFDSixPQUFPO0FBQUEsWUFDUCxPQUFPO0FBQUEsVUFDUjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLE1BQVk7QUFDWCxhQUFLLE1BQU07QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxZQUFxQjtBQUNwQixXQUFPLE9BQU8sS0FBSyxVQUFVLGdCQUFnQixLQUFLLEtBQUssbUJBQW1CO0FBQUEsRUFDM0U7QUFBQSxFQUVBLGNBQTRDO0FBQzNDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLFFBQVEsU0FBaUM7QUFDeEMsVUFBTSxrQkFBa0IsS0FBSyxTQUFTLGtCQUFrQixPQUFPO0FBQy9ELFFBQUksT0FBTyxvQkFBb0IsV0FBVztBQUN6QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksS0FBSyxRQUFRLG9CQUFvQixDQUFDLEtBQUssUUFBUSxpQkFBaUIsU0FBUyxRQUFRLFlBQXFDLEdBQUc7QUFDNUgsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEtBQUssU0FBUyxRQUFRLFFBQVEsT0FBTyxHQUFHO0FBQzNDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLFNBQVMsVUFBVSxTQUFTLFFBQVEsWUFBWSxHQUFHO0FBQzNELGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLFNBQVMsT0FBTyxTQUFTLFFBQVEsTUFBTSxHQUFHO0FBQ2xELGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLFNBQVMsWUFBWSxLQUFLLGVBQWUsTUFBTSx5QkFBZ0MsUUFBUSxXQUFXLEdBQUc7QUFDN0csYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYyxPQUFxQjtBQUNsQyxTQUFLLFFBQVEsZ0JBQWdCLEtBQUs7QUFBQSxFQUNuQztBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssY0FBYyxFQUFFLEdBQUcsaUJBQWlCLENBQUM7QUFDMUMsUUFBSSxLQUFLLG1CQUFtQix5QkFBOEI7QUFDekQsV0FBSyxXQUFXLHVCQUE0QjtBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUNEO0FBdldhLHNCQUFOO0FBQUEsRUFvQko7QUFBQSxFQUNBO0FBQUEsR0FyQlU7IiwKICAibmFtZXMiOiBbIkFnZW50U2Vzc2lvbnNHcm91cGluZyIsICJBZ2VudFNlc3Npb25zU29ydGluZyJdCn0K
