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
import { localize } from "../../../../nls.js";
import { GroupActivationReason, GroupLocation, GroupsOrder, IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { MainEditorPart } from "./editorPart.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { distinct } from "../../../../base/common/arrays.js";
import { AuxiliaryEditorPart } from "./auxiliaryEditorPart.js";
import { ModalEditorPart } from "./modalEditorPart.js";
import { MultiWindowParts } from "../../part.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IAuxiliaryWindowService } from "../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { getActiveElement, isAncestor, isHTMLElement } from "../../../../base/browser/dom.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { EditorPartModalVisibleContext } from "../../../common/contextkeys.js";
let EditorParts = class extends MultiWindowParts {
  constructor(instantiationService, storageService, themeService, auxiliaryWindowService, contextKeyService) {
    super("workbench.editorParts", themeService, storageService);
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.auxiliaryWindowService = auxiliaryWindowService;
    this.contextKeyService = contextKeyService;
    //#region Scoped Instantiation Services
    this.mapPartToInstantiationService = /* @__PURE__ */ new Map();
    //#endregion
    //#region Auxiliary Editor Parts
    this._onDidCreateAuxiliaryEditorPart = this._register(new Emitter());
    this.onDidCreateAuxiliaryEditorPart = this._onDidCreateAuxiliaryEditorPart.event;
    this.modalEditorMaximized = false;
    this.workspaceMemento = this.getMemento(StorageScope.WORKSPACE, StorageTarget.USER);
    this.profileMemento = this.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    this._isReady = false;
    this.whenReadyPromise = new DeferredPromise();
    this.whenReady = this.whenReadyPromise.p;
    this.whenRestoredPromise = new DeferredPromise();
    this.whenRestored = this.whenRestoredPromise.p;
    //#endregion
    //#region Events
    this._onDidActiveGroupChange = this._register(new Emitter());
    this.onDidChangeActiveGroup = this._onDidActiveGroupChange.event;
    this._onDidAddGroup = this._register(new Emitter());
    this.onDidAddGroup = this._onDidAddGroup.event;
    this._onDidRemoveGroup = this._register(new Emitter());
    this.onDidRemoveGroup = this._onDidRemoveGroup.event;
    this._onDidMoveGroup = this._register(new Emitter());
    this.onDidMoveGroup = this._onDidMoveGroup.event;
    this._onDidActivateGroup = this._register(new Emitter());
    this.onDidActivateGroup = this._onDidActivateGroup.event;
    this._onDidChangeGroupIndex = this._register(new Emitter());
    this.onDidChangeGroupIndex = this._onDidChangeGroupIndex.event;
    this._onDidChangeGroupLocked = this._register(new Emitter());
    this.onDidChangeGroupLocked = this._onDidChangeGroupLocked.event;
    this._onDidChangeGroupMaximized = this._register(new Emitter());
    this.onDidChangeGroupMaximized = this._onDidChangeGroupMaximized.event;
    //#endregion
    //#region Editor Group Context Key Handling
    this.globalContextKeys = /* @__PURE__ */ new Map();
    this.scopedContextKeys = /* @__PURE__ */ new Map();
    this.contextKeyProviders = /* @__PURE__ */ new Map();
    this.registeredContextKeys = /* @__PURE__ */ new Map();
    this.contextKeyProviderDisposables = this._register(new DisposableMap());
    this.modalEditorVisibleContext = EditorPartModalVisibleContext.bindTo(this.contextKeyService);
    this.editorWorkingSets = (() => {
      const workingSetsRaw = this.storageService.get(EditorParts.EDITOR_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);
      if (workingSetsRaw) {
        return JSON.parse(workingSetsRaw);
      }
      return [];
    })();
    const modalState = this.profileMemento[EditorParts.MODAL_EDITOR_STATE_STORAGE_KEY];
    if (modalState) {
      this.modalEditorMaximized = modalState.maximized;
      this.modalEditorSize = modalState.size;
      this.modalEditorPosition = modalState.position;
      this.modalEditorSidebarWidth = modalState.sidebarWidth;
      this.modalEditorSidebarHidden = modalState.sidebarHidden;
    }
    this.mainPart = this._register(this.createMainEditorPart());
    this._register(this.registerPart(this.mainPart));
    this.mostRecentActiveParts = [this.mainPart];
    this.restoreParts();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.onDidChangeMementoValue(StorageScope.WORKSPACE, this._store)((e) => this.onDidChangeMementoState(e)));
    this.whenReady.then(() => this.registerGroupsContextKeyListeners());
  }
  createMainEditorPart() {
    return this.instantiationService.createInstance(MainEditorPart, this);
  }
  getScopedInstantiationService(part) {
    if (part === this.mainPart) {
      let mainPartInstantiationService = this.mapPartToInstantiationService.get(part.windowId);
      if (!mainPartInstantiationService) {
        mainPartInstantiationService = this.instantiationService.invokeFunction((accessor) => {
          const editorService = accessor.get(IEditorService);
          const statusbarService = accessor.get(IStatusbarService);
          const mainPartInstantiationService2 = this._register(this.mainPart.scopedInstantiationService.createChild(new ServiceCollection(
            [IEditorService, editorService.createScoped(this.mainPart, this._store)],
            [IStatusbarService, statusbarService.createScoped(statusbarService, this._store)]
          )));
          this.mapPartToInstantiationService.set(part.windowId, mainPartInstantiationService2);
          return mainPartInstantiationService2;
        });
      }
      return mainPartInstantiationService;
    }
    if (part === this.modalEditorPart && this.modalPartInstantiationService) {
      return this.modalPartInstantiationService;
    }
    return this.mapPartToInstantiationService.get(part.windowId) ?? this.instantiationService;
  }
  async createAuxiliaryEditorPart(options) {
    const { part, instantiationService, disposables } = await this.instantiationService.createInstance(AuxiliaryEditorPart, this).create(this.getGroupsLabel(this._parts.size), options);
    this.mapPartToInstantiationService.set(part.windowId, instantiationService);
    disposables.add(toDisposable(() => this.mapPartToInstantiationService.delete(part.windowId)));
    this._onDidAddGroup.fire(part.activeGroup);
    this._onDidCreateAuxiliaryEditorPart.fire(part);
    return part;
  }
  get activeModalEditorPart() {
    return this.modalEditorPart;
  }
  async createModalEditorPart(options) {
    if (this.modalEditorPart) {
      this.modalEditorPart.updateOptions(options);
      return this.modalEditorPart;
    }
    if (this.modalEditorPartCreatePromise) {
      const part = await this.modalEditorPartCreatePromise;
      part.updateOptions(options);
      return part;
    }
    const createPromise = this.doCreateModalEditorPart(options).finally(() => {
      this.modalEditorPartCreatePromise = void 0;
    });
    this.modalEditorPartCreatePromise = createPromise;
    return createPromise;
  }
  async doCreateModalEditorPart(options) {
    this.modalEditorVisibleContext.set(true);
    let result;
    try {
      result = await this.instantiationService.createInstance(ModalEditorPart, this).create({
        ...options,
        maximized: options?.maximized ?? this.modalEditorMaximized,
        size: options?.size ?? this.modalEditorSize,
        position: options?.position ?? this.modalEditorPosition,
        sidebar: options?.sidebar ? {
          ...options.sidebar,
          sidebarWidth: options.sidebar.sidebarWidth ?? this.modalEditorSidebarWidth,
          sidebarHidden: options.sidebar.sidebarHidden ?? this.modalEditorSidebarHidden
        } : void 0
      });
    } catch (error) {
      this.modalEditorVisibleContext.set(false);
      throw error;
    }
    const { part, instantiationService, disposables } = result;
    this.modalEditorPart = part;
    this.modalPartInstantiationService = instantiationService;
    disposables.add(toDisposable(() => {
      this.modalEditorMaximized = part.maximized;
      this.modalEditorSize = part.size;
      this.modalEditorPosition = part.position;
      if (part.hasSidebar) {
        this.modalEditorSidebarWidth = part.sidebarWidth;
        this.modalEditorSidebarHidden = part.sidebarHidden || void 0;
      }
      this.modalPartInstantiationService = void 0;
      this.modalEditorPart = void 0;
      this.modalEditorVisibleContext.set(false);
    }));
    this._onDidAddGroup.fire(part.activeGroup);
    return part;
  }
  //#endregion
  //#region Registration
  registerPart(part) {
    const disposables = this._register(new DisposableStore());
    disposables.add(super.registerPart(part));
    this.registerEditorPartListeners(part, disposables);
    return disposables;
  }
  unregisterPart(part) {
    super.unregisterPart(part);
    this.parts.forEach((part2, index) => {
      if (part2 === this.mainPart) {
        return;
      }
      part2.notifyGroupsLabelChange(this.getGroupsLabel(index));
    });
  }
  registerEditorPartListeners(part, disposables) {
    disposables.add(part.onDidFocus(() => {
      this.doUpdateMostRecentActive(part, true);
      if (this._parts.size > 1) {
        this._onDidActiveGroupChange.fire(this.activeGroup);
      }
    }));
    disposables.add(toDisposable(() => {
      this.doUpdateMostRecentActive(part);
      if (part.windowId !== mainWindow.vscodeWindowId) {
        this._onDidActiveGroupChange.fire(this.activeGroup);
      }
    }));
    disposables.add(part.onDidChangeActiveGroup((group) => this._onDidActiveGroupChange.fire(group)));
    disposables.add(part.onDidAddGroup((group) => this._onDidAddGroup.fire(group)));
    disposables.add(part.onDidRemoveGroup((group) => this._onDidRemoveGroup.fire(group)));
    disposables.add(part.onDidMoveGroup((group) => this._onDidMoveGroup.fire(group)));
    disposables.add(part.onDidActivateGroup((e) => {
      if (e.reason === GroupActivationReason.PART_CLOSE) {
        this.doUpdateMostRecentActive(part, true);
      }
      this._onDidActivateGroup.fire(e);
    }));
    disposables.add(part.onDidChangeGroupMaximized((maximized) => this._onDidChangeGroupMaximized.fire(maximized)));
    disposables.add(part.onDidChangeGroupIndex((group) => this._onDidChangeGroupIndex.fire(group)));
    disposables.add(part.onDidChangeGroupLocked((group) => this._onDidChangeGroupLocked.fire(group)));
  }
  doUpdateMostRecentActive(part, makeMostRecentlyActive) {
    const index = this.mostRecentActiveParts.indexOf(part);
    if (index !== -1) {
      this.mostRecentActiveParts.splice(index, 1);
    }
    if (makeMostRecentlyActive) {
      this.mostRecentActiveParts.unshift(part);
    }
  }
  getGroupsLabel(index) {
    return localize("groupLabel", "Window {0}", index + 1);
  }
  //#endregion
  //#region Helpers
  getPartByDocument(document) {
    const mruParts = this.mostRecentActiveParts;
    const mruDocumentParts = mruParts.filter((part) => part.element?.ownerDocument === document);
    if (mruDocumentParts.length > 1) {
      const activeElement = getActiveElement();
      for (const part of mruDocumentParts) {
        const container = part.getContainer();
        if (container && isAncestor(activeElement, container)) {
          return part;
        }
      }
      return mruDocumentParts[0];
    }
    return super.getPartByDocument(document);
  }
  getPart(groupOrElement) {
    if (this._parts.size > 1) {
      if (isHTMLElement(groupOrElement)) {
        const element = groupOrElement;
        return this.getPartByDocument(element.ownerDocument);
      } else {
        const group = groupOrElement;
        let id;
        if (typeof group === "number") {
          id = group;
        } else {
          id = group.id;
        }
        for (const part of this._parts) {
          if (part.hasGroup(id)) {
            return part;
          }
        }
      }
    }
    return this.mainPart;
  }
  get isReady() {
    return this._isReady;
  }
  async restoreParts() {
    await this.mainPart.whenReady;
    if (this.mainPart.willRestoreState) {
      const state = this.loadState();
      if (state) {
        await this.restoreState(state);
      }
    }
    const mostRecentActivePart = this.mostRecentActiveParts.at(0);
    mostRecentActivePart?.activeGroup.focus();
    this._isReady = true;
    this.whenReadyPromise.complete();
    await Promise.allSettled(this.parts.map((part) => part.whenRestored));
    this.whenRestoredPromise.complete();
  }
  loadState() {
    return this.workspaceMemento[EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY];
  }
  saveState() {
    const state = this.createState();
    if (state.auxiliary.length === 0) {
      delete this.workspaceMemento[EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY];
    } else {
      this.workspaceMemento[EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY] = state;
    }
    this.saveModalState();
  }
  saveModalState() {
    if (this.modalEditorPart) {
      this.modalEditorMaximized = this.modalEditorPart.maximized;
      this.modalEditorSize = this.modalEditorPart.size;
      this.modalEditorPosition = this.modalEditorPart.position;
      if (this.modalEditorPart.hasSidebar) {
        this.modalEditorSidebarWidth = this.modalEditorPart.sidebarWidth;
        this.modalEditorSidebarHidden = this.modalEditorPart.sidebarHidden || void 0;
      }
    }
    if (this.modalEditorMaximized || this.modalEditorSize || this.modalEditorPosition || this.modalEditorSidebarWidth || this.modalEditorSidebarHidden) {
      this.profileMemento[EditorParts.MODAL_EDITOR_STATE_STORAGE_KEY] = {
        maximized: this.modalEditorMaximized,
        size: this.modalEditorSize ? { width: this.modalEditorSize.width, height: this.modalEditorSize.height } : void 0,
        position: this.modalEditorPosition,
        sidebarWidth: this.modalEditorSidebarWidth,
        sidebarHidden: this.modalEditorSidebarHidden
      };
    } else {
      delete this.profileMemento[EditorParts.MODAL_EDITOR_STATE_STORAGE_KEY];
    }
  }
  createState() {
    return {
      auxiliary: this.parts.map((part) => ({ part, auxiliaryWindow: this.auxiliaryWindowService.getWindow(part.windowId) })).filter(({ auxiliaryWindow }) => auxiliaryWindow !== void 0).map(({ part, auxiliaryWindow }) => ({
        state: part.createState(),
        ...auxiliaryWindow.createState()
      })),
      mru: this.mostRecentActiveParts.map((part) => this.parts.indexOf(part))
    };
  }
  async restoreState(state) {
    if (state.auxiliary.length) {
      const auxiliaryEditorPartPromises = [];
      for (const auxiliaryEditorPartState of state.auxiliary) {
        auxiliaryEditorPartPromises.push(this.createAuxiliaryEditorPart(auxiliaryEditorPartState));
      }
      await Promise.allSettled(auxiliaryEditorPartPromises);
      if (state.mru.length === this.parts.length) {
        this.mostRecentActiveParts = state.mru.map((index) => this.parts[index]);
      } else {
        this.mostRecentActiveParts = [...this.parts];
      }
      await Promise.allSettled(this.parts.map((part) => part.whenReady));
    }
  }
  get hasRestorableState() {
    return this.parts.some((part) => part.hasRestorableState);
  }
  onDidChangeMementoState(e) {
    if (e.external && e.scope === StorageScope.WORKSPACE) {
      this.reloadMemento(e.scope);
      const state = this.loadState();
      if (state) {
        this.applyState(state);
      }
    }
  }
  async applyState(state) {
    for (const part of this.parts) {
      if (part === this.mainPart) {
        continue;
      }
      for (const group of part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
        await group.closeAllEditors({ excludeConfirming: true, force: true });
      }
      const closed = part.close();
      if (!closed) {
        return false;
      }
    }
    if (state !== "empty") {
      await this.restoreState(state);
    }
    return true;
  }
  saveWorkingSet(name) {
    const workingSet = {
      id: generateUuid(),
      name,
      main: this.mainPart.createState(),
      auxiliary: this.createState()
    };
    this.editorWorkingSets.push(workingSet);
    this.saveWorkingSets();
    return {
      id: workingSet.id,
      name: workingSet.name
    };
  }
  getWorkingSets() {
    return this.editorWorkingSets.map((workingSet) => ({ id: workingSet.id, name: workingSet.name }));
  }
  deleteWorkingSet(workingSet) {
    const index = this.indexOfWorkingSet(workingSet);
    if (typeof index === "number") {
      this.editorWorkingSets.splice(index, 1);
      this.saveWorkingSets();
    }
  }
  async applyWorkingSet(workingSet, options) {
    let workingSetState;
    if (workingSet === "empty") {
      workingSetState = "empty";
    } else {
      workingSetState = this.editorWorkingSets[this.indexOfWorkingSet(workingSet) ?? -1];
    }
    if (!workingSetState) {
      return false;
    }
    const applied = await this.applyState(workingSetState === "empty" ? workingSetState : workingSetState.auxiliary);
    if (!applied) {
      return false;
    }
    await this.mainPart.applyState(workingSetState === "empty" ? workingSetState : workingSetState.main, options);
    if (!options?.preserveFocus) {
      const mostRecentActivePart = this.mostRecentActiveParts.at(0);
      if (mostRecentActivePart) {
        await mostRecentActivePart.whenReady;
        mostRecentActivePart.activeGroup.focus();
      }
    }
    return true;
  }
  indexOfWorkingSet(workingSet) {
    for (let i = 0; i < this.editorWorkingSets.length; i++) {
      if (this.editorWorkingSets[i].id === workingSet.id) {
        return i;
      }
    }
    return void 0;
  }
  saveWorkingSets() {
    this.storageService.store(EditorParts.EDITOR_WORKING_SETS_STORAGE_KEY, JSON.stringify(this.editorWorkingSets), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  //#endregion
  //#region Group Management
  get activeGroup() {
    return this.activePart.activeGroup;
  }
  get sideGroup() {
    return this.activePart.sideGroup;
  }
  get groups() {
    return this.getGroups();
  }
  get count() {
    return this.groups.length;
  }
  getGroups(order = GroupsOrder.CREATION_TIME) {
    if (this._parts.size > 1) {
      let parts;
      switch (order) {
        case GroupsOrder.GRID_APPEARANCE:
        // we currently do not have a way to compute by appearance over multiple windows
        case GroupsOrder.CREATION_TIME:
          parts = this.parts;
          break;
        case GroupsOrder.MOST_RECENTLY_ACTIVE:
          parts = distinct([...this.mostRecentActiveParts, ...this.parts]);
          break;
      }
      return parts.flatMap((part) => part.getGroups(order));
    }
    return this.mainPart.getGroups(order);
  }
  getGroup(identifier) {
    if (this._parts.size > 1) {
      for (const part of this._parts) {
        const group = part.getGroup(identifier);
        if (group) {
          return group;
        }
      }
    }
    return this.mainPart.getGroup(identifier);
  }
  assertGroupView(group) {
    let groupView;
    if (typeof group === "number") {
      groupView = this.getGroup(group);
    } else {
      groupView = group;
    }
    if (!groupView) {
      throw new Error("Invalid editor group provided!");
    }
    return groupView;
  }
  activateGroup(group) {
    return this.getPart(group).activateGroup(group);
  }
  getSize(group) {
    return this.getPart(group).getSize(group);
  }
  setSize(group, size) {
    this.getPart(group).setSize(group, size);
  }
  arrangeGroups(arrangement, group = this.activePart.activeGroup) {
    this.getPart(group).arrangeGroups(arrangement, group);
  }
  toggleMaximizeGroup(group = this.activePart.activeGroup) {
    this.getPart(group).toggleMaximizeGroup(group);
  }
  toggleExpandGroup(group = this.activePart.activeGroup) {
    this.getPart(group).toggleExpandGroup(group);
  }
  restoreGroup(group) {
    return this.getPart(group).restoreGroup(group);
  }
  applyLayout(layout) {
    this.activePart.applyLayout(layout);
  }
  getLayout() {
    return this.activePart.getLayout();
  }
  get orientation() {
    return this.activePart.orientation;
  }
  setGroupOrientation(orientation) {
    this.activePart.setGroupOrientation(orientation);
  }
  findGroup(scope, source = this.activeGroup, wrap) {
    const sourcePart = this.getPart(source);
    if (this._parts.size > 1) {
      const groups = this.getGroups(GroupsOrder.GRID_APPEARANCE);
      if (scope.location === GroupLocation.FIRST || scope.location === GroupLocation.LAST) {
        return scope.location === GroupLocation.FIRST ? groups[0] : groups[groups.length - 1];
      }
      const group = sourcePart.findGroup(scope, source, false);
      if (group) {
        return group;
      }
      if (scope.location === GroupLocation.NEXT || scope.location === GroupLocation.PREVIOUS) {
        const sourceGroup = this.assertGroupView(source);
        const index = groups.indexOf(sourceGroup);
        if (scope.location === GroupLocation.NEXT) {
          let nextGroup = groups[index + 1];
          if (!nextGroup && wrap) {
            nextGroup = groups[0];
          }
          return nextGroup;
        } else {
          let previousGroup = groups[index - 1];
          if (!previousGroup && wrap) {
            previousGroup = groups[groups.length - 1];
          }
          return previousGroup;
        }
      }
    }
    return sourcePart.findGroup(scope, source, wrap);
  }
  addGroup(location, direction) {
    return this.getPart(location).addGroup(location, direction);
  }
  removeGroup(group) {
    this.getPart(group).removeGroup(group);
  }
  moveGroup(group, location, direction) {
    return this.getPart(group).moveGroup(group, location, direction);
  }
  mergeGroup(group, target, options) {
    return this.getPart(group).mergeGroup(group, target, options);
  }
  mergeAllGroups(target, options) {
    return this.activePart.mergeAllGroups(target, options);
  }
  copyGroup(group, location, direction) {
    return this.getPart(group).copyGroup(group, location, direction);
  }
  createEditorDropTarget(container, delegate) {
    return this.getPart(container).createEditorDropTarget(container, delegate);
  }
  registerGroupsContextKeyListeners() {
    this._register(this.onDidChangeActiveGroup(() => this.updateGlobalContextKeys()));
    this.groups.forEach((group) => this.registerGroupContextKeyProvidersListeners(group));
    this._register(this.onDidAddGroup((group) => this.registerGroupContextKeyProvidersListeners(group)));
    this._register(this.onDidRemoveGroup((group) => {
      this.scopedContextKeys.delete(group.id);
      this.registeredContextKeys.delete(group.id);
      this.contextKeyProviderDisposables.deleteAndDispose(group.id);
    }));
  }
  updateGlobalContextKeys() {
    const activeGroupScopedContextKeys = this.scopedContextKeys.get(this.activeGroup.id);
    if (!activeGroupScopedContextKeys) {
      return;
    }
    for (const [key, globalContextKey] of this.globalContextKeys) {
      const scopedContextKey = activeGroupScopedContextKeys.get(key);
      if (scopedContextKey) {
        globalContextKey.set(scopedContextKey.get());
      } else {
        globalContextKey.reset();
      }
    }
  }
  bind(contextKey, group) {
    let globalContextKey = this.globalContextKeys.get(contextKey.key);
    if (!globalContextKey) {
      globalContextKey = contextKey.bindTo(this.contextKeyService);
      this.globalContextKeys.set(contextKey.key, globalContextKey);
    }
    let groupScopedContextKeys = this.scopedContextKeys.get(group.id);
    if (!groupScopedContextKeys) {
      groupScopedContextKeys = /* @__PURE__ */ new Map();
      this.scopedContextKeys.set(group.id, groupScopedContextKeys);
    }
    let scopedContextKey = groupScopedContextKeys.get(contextKey.key);
    if (!scopedContextKey) {
      scopedContextKey = contextKey.bindTo(group.scopedContextKeyService);
      groupScopedContextKeys.set(contextKey.key, scopedContextKey);
    }
    const that = this;
    return {
      get() {
        return scopedContextKey.get();
      },
      set(value) {
        if (that.activeGroup === group) {
          globalContextKey.set(value);
        }
        scopedContextKey.set(value);
      },
      reset() {
        if (that.activeGroup === group) {
          globalContextKey.reset();
        }
        scopedContextKey.reset();
      }
    };
  }
  registerContextKeyProvider(provider) {
    if (this.contextKeyProviders.has(provider.contextKey.key) || this.globalContextKeys.has(provider.contextKey.key)) {
      throw new Error(`A context key provider for key ${provider.contextKey.key} already exists.`);
    }
    this.contextKeyProviders.set(provider.contextKey.key, provider);
    const setContextKeyForGroups = () => {
      for (const group of this.groups) {
        this.updateRegisteredContextKey(group, provider);
      }
    };
    setContextKeyForGroups();
    const onDidChange = provider.onDidChange?.(() => setContextKeyForGroups());
    return toDisposable(() => {
      onDidChange?.dispose();
      this.globalContextKeys.delete(provider.contextKey.key);
      this.scopedContextKeys.forEach((scopedContextKeys) => scopedContextKeys.delete(provider.contextKey.key));
      this.contextKeyProviders.delete(provider.contextKey.key);
      this.registeredContextKeys.forEach((registeredContextKeys) => registeredContextKeys.delete(provider.contextKey.key));
    });
  }
  registerGroupContextKeyProvidersListeners(group) {
    const disposable = group.onDidActiveEditorChange(() => {
      for (const contextKeyProvider of this.contextKeyProviders.values()) {
        this.updateRegisteredContextKey(group, contextKeyProvider);
      }
    });
    this.contextKeyProviderDisposables.set(group.id, disposable);
  }
  updateRegisteredContextKey(group, provider) {
    let groupRegisteredContextKeys = this.registeredContextKeys.get(group.id);
    if (!groupRegisteredContextKeys) {
      groupRegisteredContextKeys = /* @__PURE__ */ new Map();
      this.registeredContextKeys.set(group.id, groupRegisteredContextKeys);
    }
    let scopedRegisteredContextKey = groupRegisteredContextKeys.get(provider.contextKey.key);
    if (!scopedRegisteredContextKey) {
      scopedRegisteredContextKey = this.bind(provider.contextKey, group);
      groupRegisteredContextKeys.set(provider.contextKey.key, scopedRegisteredContextKey);
    }
    scopedRegisteredContextKey.set(provider.getGroupContextKeyValue(group));
  }
  //#endregion
  //#region Main Editor Part Only
  get partOptions() {
    return this.mainPart.partOptions;
  }
  get onDidChangeEditorPartOptions() {
    return this.mainPart.onDidChangeEditorPartOptions;
  }
  enforcePartOptions(options) {
    return this.mainPart.enforcePartOptions(options);
  }
  //#endregion
};
//#endregion
//#region Lifecycle / State
EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY = "editorparts.state";
EditorParts.MODAL_EDITOR_STATE_STORAGE_KEY = "editorparts.modalState";
//#endregion
//#region Working Sets
EditorParts.EDITOR_WORKING_SETS_STORAGE_KEY = "editor.workingSets";
EditorParts = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IAuxiliaryWindowService),
  __decorateParam(4, IContextKeyService)
], EditorParts);
registerSingleton(IEditorGroupsService, EditorParts, InstantiationType.Eager);
export {
  EditorParts
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvclBhcnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBMYXlvdXQsIEdyb3VwQWN0aXZhdGlvblJlYXNvbiwgR3JvdXBEaXJlY3Rpb24sIEdyb3VwTG9jYXRpb24sIEdyb3VwT3JpZW50YXRpb24sIEdyb3Vwc0FycmFuZ2VtZW50LCBHcm91cHNPcmRlciwgSUF1eGlsaWFyeUVkaXRvclBhcnQsIElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlciwgSUVkaXRvckRyb3BUYXJnZXREZWxlZ2F0ZSwgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JTaWRlR3JvdXAsIElFZGl0b3JXb3JraW5nU2V0LCBJRmluZEdyb3VwU2NvcGUsIElNZXJnZUdyb3VwT3B0aW9ucywgSUVkaXRvcldvcmtpbmdTZXRPcHRpb25zLCBJRWRpdG9yUGFydCwgSU1vZGFsRWRpdG9yUGFydCwgSUVkaXRvckdyb3VwQWN0aXZhdGlvbkV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgR3JvdXBJZGVudGlmaWVyLCBJRWRpdG9yUGFydE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvclBhcnQsIElFZGl0b3JQYXJ0VUlTdGF0ZSwgTWFpbkVkaXRvclBhcnQgfSBmcm9tICcuL2VkaXRvclBhcnQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwVmlldywgSUVkaXRvclBhcnRzVmlldyB9IGZyb20gJy4vZWRpdG9yLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBBdXhpbGlhcnlFZGl0b3JQYXJ0LCBJQXV4aWxpYXJ5RWRpdG9yUGFydE9wZW5PcHRpb25zIH0gZnJvbSAnLi9hdXhpbGlhcnlFZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IE1vZGFsRWRpdG9yUGFydCB9IGZyb20gJy4vbW9kYWxFZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IE11bHRpV2luZG93UGFydHMgfSBmcm9tICcuLi8uLi9wYXJ0LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgSVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50LCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucywgSUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXhpbGlhcnlXaW5kb3cvYnJvd3Nlci9hdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVZhbHVlLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVFbGVtZW50LCBJRGltZW5zaW9uLCBpc0FuY2VzdG9yLCBpc0hUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERlZXBQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSU1vZGFsRWRpdG9yUGFydE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYXJ0TW9kYWxWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmludGVyZmFjZSBJRWRpdG9yUGFydHNVSVN0YXRlIHtcblx0cmVhZG9ubHkgYXV4aWxpYXJ5OiBJQXV4aWxpYXJ5RWRpdG9yUGFydFN0YXRlW107XG5cdHJlYWRvbmx5IG1ydTogbnVtYmVyW107XG5cdC8vIG1haW4gc3RhdGUgaXMgbWFuYWdlZCBieSB0aGUgbWFpbiBwYXJ0XG59XG5cbmludGVyZmFjZSBJQXV4aWxpYXJ5RWRpdG9yUGFydFN0YXRlIGV4dGVuZHMgSUF1eGlsaWFyeVdpbmRvd09wZW5PcHRpb25zIHtcblx0cmVhZG9ubHkgc3RhdGU6IElFZGl0b3JQYXJ0VUlTdGF0ZTtcbn1cblxuaW50ZXJmYWNlIElFZGl0b3JXb3JraW5nU2V0U3RhdGUgZXh0ZW5kcyBJRWRpdG9yV29ya2luZ1NldCB7XG5cdHJlYWRvbmx5IG1haW46IElFZGl0b3JQYXJ0VUlTdGF0ZTtcblx0cmVhZG9ubHkgYXV4aWxpYXJ5OiBJRWRpdG9yUGFydHNVSVN0YXRlO1xufVxuXG5pbnRlcmZhY2UgSU1vZGFsRWRpdG9yUGFydFN0YXRlIHtcblx0cmVhZG9ubHkgbWF4aW1pemVkOiBib29sZWFuO1xuXHRyZWFkb25seSBzaXplPzogeyByZWFkb25seSB3aWR0aDogbnVtYmVyOyByZWFkb25seSBoZWlnaHQ6IG51bWJlciB9O1xuXHRyZWFkb25seSBwb3NpdGlvbj86IHsgcmVhZG9ubHkgbGVmdDogbnVtYmVyOyByZWFkb25seSB0b3A6IG51bWJlciB9O1xuXHRyZWFkb25seSBzaWRlYmFyV2lkdGg/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHNpZGViYXJIaWRkZW4/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUVkaXRvclBhcnRzTWVtZW50byB7XG5cdCdlZGl0b3JwYXJ0cy5zdGF0ZSc/OiBJRWRpdG9yUGFydHNVSVN0YXRlO1xuXHQnZWRpdG9ycGFydHMubW9kYWxTdGF0ZSc/OiBJTW9kYWxFZGl0b3JQYXJ0U3RhdGU7XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JQYXJ0cyBleHRlbmRzIE11bHRpV2luZG93UGFydHM8RWRpdG9yUGFydCwgSUVkaXRvclBhcnRzTWVtZW50bz4gaW1wbGVtZW50cyBJRWRpdG9yR3JvdXBzU2VydmljZSwgSUVkaXRvclBhcnRzVmlldyB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbWFpblBhcnQ6IE1haW5FZGl0b3JQYXJ0O1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGFsRWRpdG9yVmlzaWJsZUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdC8vIE1vc3QgcmVjZW50bHkgYWN0aXZlIHBhcnRzIGFjcm9zcyBhbGwgd2luZG93cy4gTXVsdGlwbGUgcGFydHMgY2FuXG5cdC8vIHNoYXJlIHRoZSBzYW1lIHdpbmRvdyAoZS5nLiBtYWluIHBhcnQgYW5kIG1vZGFsIHBhcnQgYm90aCBsaXZlIGluXG5cdC8vIHRoZSBtYWluIHdpbmRvdykgc28gdGhpcyBsaXN0IGFsc28gYWN0cyBhcyBhIHBlci13aW5kb3cgTVJVIHdoZW5cblx0Ly8gZmlsdGVyZWQgYnkgZG9jdW1lbnQuIFNlZSBgZ2V0TW9zdFJlY2VudGx5QWN0aXZlUGFydEJ5RG9jdW1lbnRgLlxuXHRwcml2YXRlIG1vc3RSZWNlbnRBY3RpdmVQYXJ0czogRWRpdG9yUGFydFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQXV4aWxpYXJ5V2luZG93U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1eGlsaWFyeVdpbmRvd1NlcnZpY2U6IElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2guZWRpdG9yUGFydHMnLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLm1vZGFsRWRpdG9yVmlzaWJsZUNvbnRleHQgPSBFZGl0b3JQYXJ0TW9kYWxWaXNpYmxlQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmVkaXRvcldvcmtpbmdTZXRzID0gKCgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtpbmdTZXRzUmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoRWRpdG9yUGFydHMuRURJVE9SX1dPUktJTkdfU0VUU19TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRpZiAod29ya2luZ1NldHNSYXcpIHtcblx0XHRcdFx0cmV0dXJuIEpTT04ucGFyc2Uod29ya2luZ1NldHNSYXcpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSkoKTtcblxuXHRcdGNvbnN0IG1vZGFsU3RhdGUgPSB0aGlzLnByb2ZpbGVNZW1lbnRvW0VkaXRvclBhcnRzLk1PREFMX0VESVRPUl9TVEFURV9TVE9SQUdFX0tFWV07XG5cdFx0aWYgKG1vZGFsU3RhdGUpIHtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JNYXhpbWl6ZWQgPSBtb2RhbFN0YXRlLm1heGltaXplZDtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JTaXplID0gbW9kYWxTdGF0ZS5zaXplO1xuXHRcdFx0dGhpcy5tb2RhbEVkaXRvclBvc2l0aW9uID0gbW9kYWxTdGF0ZS5wb3NpdGlvbjtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JTaWRlYmFyV2lkdGggPSBtb2RhbFN0YXRlLnNpZGViYXJXaWR0aDtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JTaWRlYmFySGlkZGVuID0gbW9kYWxTdGF0ZS5zaWRlYmFySGlkZGVuO1xuXHRcdH1cblxuXHRcdHRoaXMubWFpblBhcnQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU1haW5FZGl0b3JQYXJ0KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVnaXN0ZXJQYXJ0KHRoaXMubWFpblBhcnQpKTtcblxuXHRcdHRoaXMubW9zdFJlY2VudEFjdGl2ZVBhcnRzID0gW3RoaXMubWFpblBhcnRdO1xuXG5cdFx0dGhpcy5yZXN0b3JlUGFydHMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VNZW1lbnRvVmFsdWUoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy5fc3RvcmUpKGUgPT4gdGhpcy5vbkRpZENoYW5nZU1lbWVudG9TdGF0ZShlKSkpO1xuXHRcdHRoaXMud2hlblJlYWR5LnRoZW4oKCkgPT4gdGhpcy5yZWdpc3Rlckdyb3Vwc0NvbnRleHRLZXlMaXN0ZW5lcnMoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlTWFpbkVkaXRvclBhcnQoKTogTWFpbkVkaXRvclBhcnQge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5FZGl0b3JQYXJ0LCB0aGlzKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBTY29wZWQgSW5zdGFudGlhdGlvbiBTZXJ2aWNlc1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwUGFydFRvSW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgTWFwPG51bWJlciAvKiB3aW5kb3cgSUQgKi8sIElJbnN0YW50aWF0aW9uU2VydmljZT4oKTtcblx0cHJpdmF0ZSBtb2RhbFBhcnRJbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdGdldFNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKHBhcnQ6IElFZGl0b3JQYXJ0KTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblxuXHRcdC8vIE1haW4gUGFydFxuXHRcdGlmIChwYXJ0ID09PSB0aGlzLm1haW5QYXJ0KSB7XG5cdFx0XHRsZXQgbWFpblBhcnRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMubWFwUGFydFRvSW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KHBhcnQud2luZG93SWQpO1xuXHRcdFx0aWYgKCFtYWluUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlKSB7XG5cdFx0XHRcdG1haW5QYXJ0SW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBzdGF0dXNiYXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdGF0dXNiYXJTZXJ2aWNlKTtcblxuXHRcdFx0XHRcdGNvbnN0IG1haW5QYXJ0SW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1haW5QYXJ0LnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFx0XHRcdFtJRWRpdG9yU2VydmljZSwgZWRpdG9yU2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5tYWluUGFydCwgdGhpcy5fc3RvcmUpXSxcblx0XHRcdFx0XHRcdFtJU3RhdHVzYmFyU2VydmljZSwgc3RhdHVzYmFyU2VydmljZS5jcmVhdGVTY29wZWQoc3RhdHVzYmFyU2VydmljZSwgdGhpcy5fc3RvcmUpXVxuXHRcdFx0XHRcdCkpKTtcblx0XHRcdFx0XHR0aGlzLm1hcFBhcnRUb0luc3RhbnRpYXRpb25TZXJ2aWNlLnNldChwYXJ0LndpbmRvd0lkLCBtYWluUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0XHRcdHJldHVybiBtYWluUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG1haW5QYXJ0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0fVxuXG5cdFx0Ly8gTW9kYWwgUGFydCAoaWYgb3BlbmVkKVxuXHRcdGlmIChwYXJ0ID09PSB0aGlzLm1vZGFsRWRpdG9yUGFydCAmJiB0aGlzLm1vZGFsUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RhbFBhcnRJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5tYXBQYXJ0VG9JbnN0YW50aWF0aW9uU2VydmljZS5nZXQocGFydC53aW5kb3dJZCkgPz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBBdXhpbGlhcnkgRWRpdG9yIFBhcnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUF1eGlsaWFyeUVkaXRvclBhcnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQgPSB0aGlzLl9vbkRpZENyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQuZXZlbnQ7XG5cblx0YXN5bmMgY3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydChvcHRpb25zPzogSUF1eGlsaWFyeUVkaXRvclBhcnRPcGVuT3B0aW9ucyk6IFByb21pc2U8SUF1eGlsaWFyeUVkaXRvclBhcnQ+IHtcblx0XHRjb25zdCB7IHBhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyB9ID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXhpbGlhcnlFZGl0b3JQYXJ0LCB0aGlzKS5jcmVhdGUodGhpcy5nZXRHcm91cHNMYWJlbCh0aGlzLl9wYXJ0cy5zaXplKSwgb3B0aW9ucyk7XG5cblx0XHQvLyBLZWVwIGluc3RhbnRpYXRpb24gc2VydmljZVxuXHRcdHRoaXMubWFwUGFydFRvSW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KHBhcnQud2luZG93SWQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMubWFwUGFydFRvSW5zdGFudGlhdGlvblNlcnZpY2UuZGVsZXRlKHBhcnQud2luZG93SWQpKSk7XG5cblx0XHQvLyBFdmVudHNcblx0XHR0aGlzLl9vbkRpZEFkZEdyb3VwLmZpcmUocGFydC5hY3RpdmVHcm91cCk7XG5cblx0XHR0aGlzLl9vbkRpZENyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQuZmlyZShwYXJ0KTtcblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE1vZGFsIEVkaXRvciBQYXJ0XG5cblx0cHJpdmF0ZSBtb2RhbEVkaXRvclBhcnQ6IElNb2RhbEVkaXRvclBhcnQgfCB1bmRlZmluZWQ7XG5cdGdldCBhY3RpdmVNb2RhbEVkaXRvclBhcnQoKTogSU1vZGFsRWRpdG9yUGFydCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLm1vZGFsRWRpdG9yUGFydDsgfVxuXG5cdHByaXZhdGUgbW9kYWxFZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBtb2RhbEVkaXRvclNpemU6IElEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbW9kYWxFZGl0b3JQb3NpdGlvbjogeyByZWFkb25seSBsZWZ0OiBudW1iZXI7IHJlYWRvbmx5IHRvcDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbW9kYWxFZGl0b3JTaWRlYmFyV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtb2RhbEVkaXRvclNpZGViYXJIaWRkZW46IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0Ly8gVHJhY2tzIGFuIGluLWZsaWdodCBjcmVhdGlvbiBzbyBjb25jdXJyZW50IGNhbGxlcnMgYXdhaXQgYW5kIHJldXNlIHRoZVxuXHQvLyBzYW1lIHNpbmdsZXRvbiBpbnN0YW5jZSBpbnN0ZWFkIG9mIGVhY2ggcmFjaW5nIHRvIGNyZWF0ZSB0aGVpciBvd24uXG5cdHByaXZhdGUgbW9kYWxFZGl0b3JQYXJ0Q3JlYXRlUHJvbWlzZTogUHJvbWlzZTxJTW9kYWxFZGl0b3JQYXJ0PiB8IHVuZGVmaW5lZDtcblxuXHRhc3luYyBjcmVhdGVNb2RhbEVkaXRvclBhcnQob3B0aW9ucz86IElNb2RhbEVkaXRvclBhcnRPcHRpb25zKTogUHJvbWlzZTxJTW9kYWxFZGl0b3JQYXJ0PiB7XG5cblx0XHQvLyBSZXVzZSBleGlzdGluZyBtb2RhbCBlZGl0b3IgcGFydCBpZiBpdCBleGlzdHNcblx0XHRpZiAodGhpcy5tb2RhbEVkaXRvclBhcnQpIHtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JQYXJ0LnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHRcdHJldHVybiB0aGlzLm1vZGFsRWRpdG9yUGFydDtcblx0XHR9XG5cblx0XHQvLyBBbm90aGVyIGNyZWF0aW9uIGlzIGFscmVhZHkgaW4gZmxpZ2h0OiBhd2FpdCBpdCBpbnN0ZWFkIG9mIHN0YXJ0aW5nXG5cdFx0Ly8gYSBzZWNvbmQgb25lLCB0aGVuIGFwcGx5IHRoaXMgY2FsbCdzIG9wdGlvbnMgdG8gdGhlIHNoYXJlZCBpbnN0YW5jZVxuXHRcdGlmICh0aGlzLm1vZGFsRWRpdG9yUGFydENyZWF0ZVByb21pc2UpIHtcblx0XHRcdGNvbnN0IHBhcnQgPSBhd2FpdCB0aGlzLm1vZGFsRWRpdG9yUGFydENyZWF0ZVByb21pc2U7XG5cdFx0XHRwYXJ0LnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGNyZWF0ZVByb21pc2UgPSB0aGlzLmRvQ3JlYXRlTW9kYWxFZGl0b3JQYXJ0KG9wdGlvbnMpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5tb2RhbEVkaXRvclBhcnRDcmVhdGVQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHRcdHRoaXMubW9kYWxFZGl0b3JQYXJ0Q3JlYXRlUHJvbWlzZSA9IGNyZWF0ZVByb21pc2U7XG5cblx0XHRyZXR1cm4gY3JlYXRlUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9DcmVhdGVNb2RhbEVkaXRvclBhcnQob3B0aW9uczogSU1vZGFsRWRpdG9yUGFydE9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElNb2RhbEVkaXRvclBhcnQ+IHtcblx0XHR0aGlzLm1vZGFsRWRpdG9yVmlzaWJsZUNvbnRleHQuc2V0KHRydWUpO1xuXHRcdGxldCByZXN1bHQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kYWxFZGl0b3JQYXJ0LCB0aGlzKS5jcmVhdGUoe1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRtYXhpbWl6ZWQ6IG9wdGlvbnM/Lm1heGltaXplZCA/PyB0aGlzLm1vZGFsRWRpdG9yTWF4aW1pemVkLFxuXHRcdFx0XHRzaXplOiBvcHRpb25zPy5zaXplID8/IHRoaXMubW9kYWxFZGl0b3JTaXplLFxuXHRcdFx0XHRwb3NpdGlvbjogb3B0aW9ucz8ucG9zaXRpb24gPz8gdGhpcy5tb2RhbEVkaXRvclBvc2l0aW9uLFxuXHRcdFx0XHRzaWRlYmFyOiBvcHRpb25zPy5zaWRlYmFyID8ge1xuXHRcdFx0XHRcdC4uLm9wdGlvbnMuc2lkZWJhcixcblx0XHRcdFx0XHRzaWRlYmFyV2lkdGg6IG9wdGlvbnMuc2lkZWJhci5zaWRlYmFyV2lkdGggPz8gdGhpcy5tb2RhbEVkaXRvclNpZGViYXJXaWR0aCxcblx0XHRcdFx0XHRzaWRlYmFySGlkZGVuOiBvcHRpb25zLnNpZGViYXIuc2lkZWJhckhpZGRlbiA/PyB0aGlzLm1vZGFsRWRpdG9yU2lkZWJhckhpZGRlblxuXHRcdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5tb2RhbEVkaXRvclZpc2libGVDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0Y29uc3QgeyBwYXJ0LCBpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMgfSA9IHJlc3VsdDtcblxuXHRcdC8vIEtlZXAgaW5zdGFudGlhdGlvbiBzZXJ2aWNlIGFuZCByZWZlcmVuY2UgdG8gcmV1c2Vcblx0XHR0aGlzLm1vZGFsRWRpdG9yUGFydCA9IHBhcnQ7XG5cdFx0dGhpcy5tb2RhbFBhcnRJbnN0YW50aWF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdFx0Ly8gUmVtZW1iZXIgc3RhdGUgb24gZGlzcG9zZSB0byByZXN0b3JlIHdoZW4gb3BlbmluZyBuZXh0IHRpbWVcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JNYXhpbWl6ZWQgPSBwYXJ0Lm1heGltaXplZDtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JTaXplID0gcGFydC5zaXplO1xuXHRcdFx0dGhpcy5tb2RhbEVkaXRvclBvc2l0aW9uID0gcGFydC5wb3NpdGlvbjtcblx0XHRcdGlmIChwYXJ0Lmhhc1NpZGViYXIpIHtcblx0XHRcdFx0dGhpcy5tb2RhbEVkaXRvclNpZGViYXJXaWR0aCA9IHBhcnQuc2lkZWJhcldpZHRoO1xuXHRcdFx0XHR0aGlzLm1vZGFsRWRpdG9yU2lkZWJhckhpZGRlbiA9IHBhcnQuc2lkZWJhckhpZGRlbiB8fCB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubW9kYWxQYXJ0SW5zdGFudGlhdGlvblNlcnZpY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yUGFydCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JWaXNpYmxlQ29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEV2ZW50c1xuXHRcdHRoaXMuX29uRGlkQWRkR3JvdXAuZmlyZShwYXJ0LmFjdGl2ZUdyb3VwKTtcblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJlZ2lzdHJhdGlvblxuXG5cdG92ZXJyaWRlIHJlZ2lzdGVyUGFydChwYXJ0OiBFZGl0b3JQYXJ0KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3VwZXIucmVnaXN0ZXJQYXJ0KHBhcnQpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JQYXJ0TGlzdGVuZXJzKHBhcnQsIGRpc3Bvc2FibGVzKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1bnJlZ2lzdGVyUGFydChwYXJ0OiBFZGl0b3JQYXJ0KTogdm9pZCB7XG5cdFx0c3VwZXIudW5yZWdpc3RlclBhcnQocGFydCk7XG5cblx0XHQvLyBOb3RpZnkgYWxsIHBhcnRzIGFib3V0IGEgZ3JvdXBzIGxhYmVsIGNoYW5nZVxuXHRcdC8vIGdpdmVuIGl0IGlzIGNvbXB1dGVkIGJhc2VkIG9uIHRoZSBpbmRleFxuXG5cdFx0dGhpcy5wYXJ0cy5mb3JFYWNoKChwYXJ0LCBpbmRleCkgPT4ge1xuXHRcdFx0aWYgKHBhcnQgPT09IHRoaXMubWFpblBhcnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRwYXJ0Lm5vdGlmeUdyb3Vwc0xhYmVsQ2hhbmdlKHRoaXMuZ2V0R3JvdXBzTGFiZWwoaW5kZXgpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJFZGl0b3JQYXJ0TGlzdGVuZXJzKHBhcnQ6IEVkaXRvclBhcnQsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMuZG9VcGRhdGVNb3N0UmVjZW50QWN0aXZlKHBhcnQsIHRydWUpO1xuXG5cdFx0XHRpZiAodGhpcy5fcGFydHMuc2l6ZSA+IDEpIHtcblx0XHRcdFx0Ly8gRWl0aGVyIG1haW4gb3IgYXV4aWxpYXJ5IGVkaXRvciBwYXJ0IGdvdCBmb2N1c1xuXHRcdFx0XHQvLyB3aGljaCB3ZSBoYXZlIHRvIHRyZWF0IGFzIGEgZ3JvdXAgY2hhbmdlIGV2ZW50LlxuXHRcdFx0XHR0aGlzLl9vbkRpZEFjdGl2ZUdyb3VwQ2hhbmdlLmZpcmUodGhpcy5hY3RpdmVHcm91cCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5kb1VwZGF0ZU1vc3RSZWNlbnRBY3RpdmUocGFydCk7XG5cblx0XHRcdGlmIChwYXJ0LndpbmRvd0lkICE9PSBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkKSB7XG5cdFx0XHRcdC8vIEFuIGF1eGlsaWFyeSBlZGl0b3IgcGFydCBpcyBjbG9zaW5nIHdoaWNoIHdlIGhhdmVcblx0XHRcdFx0Ly8gdG8gdHJlYXQgYXMgZ3JvdXAgY2hhbmdlIGV2ZW50IGZvciB0aGUgbmV4dCBlZGl0b3Jcblx0XHRcdFx0Ly8gcGFydCB0aGF0IGJlY29tZXMgYWN0aXZlLlxuXHRcdFx0XHQvLyBSZWZzOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjU3MDU4XG5cdFx0XHRcdHRoaXMuX29uRGlkQWN0aXZlR3JvdXBDaGFuZ2UuZmlyZSh0aGlzLmFjdGl2ZUdyb3VwKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZENoYW5nZUFjdGl2ZUdyb3VwKGdyb3VwID0+IHRoaXMuX29uRGlkQWN0aXZlR3JvdXBDaGFuZ2UuZmlyZShncm91cCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZEFkZEdyb3VwKGdyb3VwID0+IHRoaXMuX29uRGlkQWRkR3JvdXAuZmlyZShncm91cCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZFJlbW92ZUdyb3VwKGdyb3VwID0+IHRoaXMuX29uRGlkUmVtb3ZlR3JvdXAuZmlyZShncm91cCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZE1vdmVHcm91cChncm91cCA9PiB0aGlzLl9vbkRpZE1vdmVHcm91cC5maXJlKGdyb3VwKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwYXJ0Lm9uRGlkQWN0aXZhdGVHcm91cChlID0+IHtcblx0XHRcdC8vIEEgcGFydC1jbG9zZSBhY3RpdmF0aW9uIG1lYW5zIGEgbW9kYWwgb3IgYXV4aWxpYXJ5IGVkaXRvciBwYXJ0IGlzXG5cdFx0XHQvLyBjbG9zaW5nIGFuZCBhbm90aGVyIHBhcnQgaXMgYmVpbmcgbWFkZSB0aGUgYWN0aXZlIG9uZS4gVXBkYXRlIG91clxuXHRcdFx0Ly8gTVJVIGVhZ2VybHkgaGVyZSBzbyB0aGF0IGRvd25zdHJlYW0gcXVlcmllcyBkdXJpbmcgdGhlIGNsb3NlIGZsb3dcblx0XHRcdC8vIChlLmcuIGBnZXRQYXJ0QnlEb2N1bWVudGAgdHJpZ2dlcmVkIGJ5IGBvbkRpZFJlbW92ZUdyb3VwYCBmcm9tIHRoZVxuXHRcdFx0Ly8gY2xvc2luZyBwYXJ0KSBzZWUgdGhlIG5ldyBhY3RpdmUgcGFydCBpbnN0ZWFkIG9mIHRoZSBjbG9zaW5nIG9uZVxuXHRcdFx0Ly8gd2hpY2ggaGFzIG5vdCB5ZXQgYmVlbiB1bnJlZ2lzdGVyZWQuXG5cdFx0XHRpZiAoZS5yZWFzb24gPT09IEdyb3VwQWN0aXZhdGlvblJlYXNvbi5QQVJUX0NMT1NFKSB7XG5cdFx0XHRcdHRoaXMuZG9VcGRhdGVNb3N0UmVjZW50QWN0aXZlKHBhcnQsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkRpZEFjdGl2YXRlR3JvdXAuZmlyZShlKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub25EaWRDaGFuZ2VHcm91cE1heGltaXplZChtYXhpbWl6ZWQgPT4gdGhpcy5fb25EaWRDaGFuZ2VHcm91cE1heGltaXplZC5maXJlKG1heGltaXplZCkpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChwYXJ0Lm9uRGlkQ2hhbmdlR3JvdXBJbmRleChncm91cCA9PiB0aGlzLl9vbkRpZENoYW5nZUdyb3VwSW5kZXguZmlyZShncm91cCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZENoYW5nZUdyb3VwTG9ja2VkKGdyb3VwID0+IHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBMb2NrZWQuZmlyZShncm91cCkpKTtcblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGVNb3N0UmVjZW50QWN0aXZlKHBhcnQ6IEVkaXRvclBhcnQsIG1ha2VNb3N0UmVjZW50bHlBY3RpdmU/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cy5pbmRleE9mKHBhcnQpO1xuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gTVJVIGxpc3Rcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCB0byBmcm9udCBhcyBuZWVkZWRcblx0XHRpZiAobWFrZU1vc3RSZWNlbnRseUFjdGl2ZSkge1xuXHRcdFx0dGhpcy5tb3N0UmVjZW50QWN0aXZlUGFydHMudW5zaGlmdChwYXJ0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEdyb3Vwc0xhYmVsKGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnZ3JvdXBMYWJlbCcsIFwiV2luZG93IHswfVwiLCBpbmRleCArIDEpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEhlbHBlcnNcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0UGFydEJ5RG9jdW1lbnQoZG9jdW1lbnQ6IERvY3VtZW50KTogRWRpdG9yUGFydCB7XG5cdFx0Ly8gTXVsdGlwbGUgZWRpdG9yIHBhcnRzIGNhbiBzaGFyZSB0aGUgc2FtZSBkb2N1bWVudCBiZWNhdXNlXG5cdFx0Ly8gdGhlIG1haW4gcGFydCBhbmQgYSBtb2RhbCBwYXJ0IGJvdGggbGl2ZSBpbiB0aGUgbWFpbiB3aW5kb3cuXG5cblx0XHRjb25zdCBtcnVQYXJ0cyA9IHRoaXMubW9zdFJlY2VudEFjdGl2ZVBhcnRzO1xuXHRcdGNvbnN0IG1ydURvY3VtZW50UGFydHMgPSBtcnVQYXJ0cy5maWx0ZXIocGFydCA9PiBwYXJ0LmVsZW1lbnQ/Lm93bmVyRG9jdW1lbnQgPT09IGRvY3VtZW50KTtcblx0XHRpZiAobXJ1RG9jdW1lbnRQYXJ0cy5sZW5ndGggPiAxKSB7XG5cdFx0XHQvLyBGaXJzdCB0cnkgdG8gZmluZCB0aGUgcGFydCB0aGF0IGhhcyB0aGUgY3VycmVudGx5IGZvY3VzZWQgZWxlbWVudCwgd2hpY2ggaXMgdGhlIG1vc3QgbGlrZWx5IGNhbmRpZGF0ZSB0byBiZSB0aGUgYWN0aXZlIHBhcnQgZm9yIHRoYXQgZG9jdW1lbnQuXG5cdFx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIG1ydURvY3VtZW50UGFydHMpIHtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gcGFydC5nZXRDb250YWluZXIoKTtcblx0XHRcdFx0aWYgKGNvbnRhaW5lciAmJiBpc0FuY2VzdG9yKGFjdGl2ZUVsZW1lbnQsIGNvbnRhaW5lcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBQaWNrIHRoZSBwYXJ0IHRoYXQgd2FzIHNldCBhY3RpdmUgbGFzdCBmb3IgdGhhdCBkb2N1bWVudFxuXHRcdFx0cmV0dXJuIG1ydURvY3VtZW50UGFydHNbMF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLmdldFBhcnRCeURvY3VtZW50KGRvY3VtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFBhcnQoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIpOiBFZGl0b3JQYXJ0O1xuXHRvdmVycmlkZSBnZXRQYXJ0KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogRWRpdG9yUGFydDtcblx0b3ZlcnJpZGUgZ2V0UGFydChncm91cE9yRWxlbWVudDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciB8IEhUTUxFbGVtZW50KTogRWRpdG9yUGFydCB7XG5cdFx0aWYgKHRoaXMuX3BhcnRzLnNpemUgPiAxKSB7XG5cdFx0XHRpZiAoaXNIVE1MRWxlbWVudChncm91cE9yRWxlbWVudCkpIHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IGdyb3VwT3JFbGVtZW50O1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFBhcnRCeURvY3VtZW50KGVsZW1lbnQub3duZXJEb2N1bWVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IGdyb3VwT3JFbGVtZW50O1xuXG5cdFx0XHRcdGxldCBpZDogR3JvdXBJZGVudGlmaWVyO1xuXHRcdFx0XHRpZiAodHlwZW9mIGdyb3VwID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGlkID0gZ3JvdXA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWQgPSBncm91cC5pZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLl9wYXJ0cykge1xuXHRcdFx0XHRcdGlmIChwYXJ0Lmhhc0dyb3VwKGlkKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWFpblBhcnQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTGlmZWN5Y2xlIC8gU3RhdGVcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFRElUT1JfUEFSVFNfVUlfU1RBVEVfU1RPUkFHRV9LRVkgPSAnZWRpdG9ycGFydHMuc3RhdGUnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNT0RBTF9FRElUT1JfU1RBVEVfU1RPUkFHRV9LRVkgPSAnZWRpdG9ycGFydHMubW9kYWxTdGF0ZSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VNZW1lbnRvID0gdGhpcy5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZmlsZU1lbWVudG8gPSB0aGlzLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0cHJpdmF0ZSBfaXNSZWFkeSA9IGZhbHNlO1xuXHRnZXQgaXNSZWFkeSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzUmVhZHk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHdoZW5SZWFkeVByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IHdoZW5SZWFkeSA9IHRoaXMud2hlblJlYWR5UHJvbWlzZS5wO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2hlblJlc3RvcmVkUHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cmVhZG9ubHkgd2hlblJlc3RvcmVkID0gdGhpcy53aGVuUmVzdG9yZWRQcm9taXNlLnA7XG5cblx0cHJpdmF0ZSBhc3luYyByZXN0b3JlUGFydHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBKb2luIG9uIHRoZSBtYWluIHBhcnQgYmVpbmcgcmVhZHkgdG8gcGlja1xuXHRcdC8vIHRoZSByaWdodCBtb21lbnQgdG8gYmVnaW4gcmVzdG9yaW5nLlxuXHRcdC8vIFRoZSBtYWluIHBhcnQgaXMgYXV0b21hdGljYWxseSBiZWluZyBjcmVhdGVkXG5cdFx0Ly8gYXMgcGFydCBvZiB0aGUgb3ZlcmFsbCBzdGFydHVwIHByb2Nlc3MuXG5cdFx0YXdhaXQgdGhpcy5tYWluUGFydC53aGVuUmVhZHk7XG5cblx0XHQvLyBPbmx5IGF0dGVtcHQgdG8gcmVzdG9yZSBhdXhpbGlhcnkgZWRpdG9yIHBhcnRzXG5cdFx0Ly8gd2hlbiB0aGUgbWFpbiBwYXJ0IGRpZCByZXN0b3JlLiBJdCBpcyBwb3NzaWJsZVxuXHRcdC8vIHRoYXQgcmVzdG9yaW5nIHdhcyBub3QgYXR0ZW1wdGVkIGJlY2F1c2Ugc3BlY2lmaWNcblx0XHQvLyBlZGl0b3JzIHdlcmUgb3BlbmVkLlxuXHRcdGlmICh0aGlzLm1haW5QYXJ0LndpbGxSZXN0b3JlU3RhdGUpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5sb2FkU3RhdGUoKTtcblx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlc3RvcmVTdGF0ZShzdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9zdFJlY2VudEFjdGl2ZVBhcnQgPSB0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cy5hdCgwKTtcblx0XHRtb3N0UmVjZW50QWN0aXZlUGFydD8uYWN0aXZlR3JvdXAuZm9jdXMoKTtcblxuXHRcdHRoaXMuX2lzUmVhZHkgPSB0cnVlO1xuXHRcdHRoaXMud2hlblJlYWR5UHJvbWlzZS5jb21wbGV0ZSgpO1xuXG5cdFx0Ly8gQXdhaXQgcmVzdG9yZWRcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodGhpcy5wYXJ0cy5tYXAocGFydCA9PiBwYXJ0LndoZW5SZXN0b3JlZCkpO1xuXHRcdHRoaXMud2hlblJlc3RvcmVkUHJvbWlzZS5jb21wbGV0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkU3RhdGUoKTogSUVkaXRvclBhcnRzVUlTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlTWVtZW50b1tFZGl0b3JQYXJ0cy5FRElUT1JfUEFSVFNfVUlfU1RBVEVfU1RPUkFHRV9LRVldO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuY3JlYXRlU3RhdGUoKTtcblx0XHRpZiAoc3RhdGUuYXV4aWxpYXJ5Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0ZGVsZXRlIHRoaXMud29ya3NwYWNlTWVtZW50b1tFZGl0b3JQYXJ0cy5FRElUT1JfUEFSVFNfVUlfU1RBVEVfU1RPUkFHRV9LRVldO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLndvcmtzcGFjZU1lbWVudG9bRWRpdG9yUGFydHMuRURJVE9SX1BBUlRTX1VJX1NUQVRFX1NUT1JBR0VfS0VZXSA9IHN0YXRlO1xuXHRcdH1cblxuXHRcdHRoaXMuc2F2ZU1vZGFsU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgc2F2ZU1vZGFsU3RhdGUoKTogdm9pZCB7XG5cblx0XHQvLyBBbHNvIGNhcHR1cmUgc3RhdGUgZnJvbSBhbnkgY3VycmVudGx5IG9wZW4gbW9kYWwgZWRpdG9yIHBhcnRcblx0XHRpZiAodGhpcy5tb2RhbEVkaXRvclBhcnQpIHtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JNYXhpbWl6ZWQgPSB0aGlzLm1vZGFsRWRpdG9yUGFydC5tYXhpbWl6ZWQ7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yU2l6ZSA9IHRoaXMubW9kYWxFZGl0b3JQYXJ0LnNpemU7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yUG9zaXRpb24gPSB0aGlzLm1vZGFsRWRpdG9yUGFydC5wb3NpdGlvbjtcblx0XHRcdGlmICh0aGlzLm1vZGFsRWRpdG9yUGFydC5oYXNTaWRlYmFyKSB7XG5cdFx0XHRcdHRoaXMubW9kYWxFZGl0b3JTaWRlYmFyV2lkdGggPSB0aGlzLm1vZGFsRWRpdG9yUGFydC5zaWRlYmFyV2lkdGg7XG5cdFx0XHRcdHRoaXMubW9kYWxFZGl0b3JTaWRlYmFySGlkZGVuID0gdGhpcy5tb2RhbEVkaXRvclBhcnQuc2lkZWJhckhpZGRlbiB8fCB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBwZXJzaXN0IHdoZW4gdGhlcmUgaXMgbWVhbmluZ2Z1bCBzdGF0ZSB0byByZXN0b3JlLlxuXHRcdC8vIFdoZW4gYWxsIHZhbHVlcyBhcmUgYXQgdGhlaXIgZGVmYXVsdHMgKG5vdCBtYXhpbWl6ZWQsIG5vXG5cdFx0Ly8gY3VzdG9tIHNpemUgb3IgcG9zaXRpb24pLCB3ZSBkZWxldGUgdGhlIGtleSB0byBhdm9pZFxuXHRcdC8vIHN0b3JpbmcgdW5uZWNlc3NhcnkgZGF0YS5cblx0XHRpZiAodGhpcy5tb2RhbEVkaXRvck1heGltaXplZCB8fCB0aGlzLm1vZGFsRWRpdG9yU2l6ZSB8fCB0aGlzLm1vZGFsRWRpdG9yUG9zaXRpb24gfHwgdGhpcy5tb2RhbEVkaXRvclNpZGViYXJXaWR0aCB8fCB0aGlzLm1vZGFsRWRpdG9yU2lkZWJhckhpZGRlbikge1xuXHRcdFx0dGhpcy5wcm9maWxlTWVtZW50b1tFZGl0b3JQYXJ0cy5NT0RBTF9FRElUT1JfU1RBVEVfU1RPUkFHRV9LRVldID0ge1xuXHRcdFx0XHRtYXhpbWl6ZWQ6IHRoaXMubW9kYWxFZGl0b3JNYXhpbWl6ZWQsXG5cdFx0XHRcdHNpemU6IHRoaXMubW9kYWxFZGl0b3JTaXplID8geyB3aWR0aDogdGhpcy5tb2RhbEVkaXRvclNpemUud2lkdGgsIGhlaWdodDogdGhpcy5tb2RhbEVkaXRvclNpemUuaGVpZ2h0IH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBvc2l0aW9uOiB0aGlzLm1vZGFsRWRpdG9yUG9zaXRpb24sXG5cdFx0XHRcdHNpZGViYXJXaWR0aDogdGhpcy5tb2RhbEVkaXRvclNpZGViYXJXaWR0aCxcblx0XHRcdFx0c2lkZWJhckhpZGRlbjogdGhpcy5tb2RhbEVkaXRvclNpZGViYXJIaWRkZW4sXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWxldGUgdGhpcy5wcm9maWxlTWVtZW50b1tFZGl0b3JQYXJ0cy5NT0RBTF9FRElUT1JfU1RBVEVfU1RPUkFHRV9LRVldO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU3RhdGUoKTogSUVkaXRvclBhcnRzVUlTdGF0ZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGF1eGlsaWFyeTogdGhpcy5wYXJ0c1xuXHRcdFx0XHQubWFwKHBhcnQgPT4gKHsgcGFydCwgYXV4aWxpYXJ5V2luZG93OiB0aGlzLmF1eGlsaWFyeVdpbmRvd1NlcnZpY2UuZ2V0V2luZG93KHBhcnQud2luZG93SWQpIH0pKVxuXHRcdFx0XHQuZmlsdGVyKCh7IGF1eGlsaWFyeVdpbmRvdyB9KSA9PiBhdXhpbGlhcnlXaW5kb3cgIT09IHVuZGVmaW5lZClcblx0XHRcdFx0Lm1hcCgoeyBwYXJ0LCBhdXhpbGlhcnlXaW5kb3cgfSkgPT4gKHtcblx0XHRcdFx0XHRzdGF0ZTogcGFydC5jcmVhdGVTdGF0ZSgpLFxuXHRcdFx0XHRcdC4uLmF1eGlsaWFyeVdpbmRvdyEuY3JlYXRlU3RhdGUoKVxuXHRcdFx0XHR9KSksXG5cdFx0XHRtcnU6IHRoaXMubW9zdFJlY2VudEFjdGl2ZVBhcnRzLm1hcChwYXJ0ID0+IHRoaXMucGFydHMuaW5kZXhPZihwYXJ0KSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXN0b3JlU3RhdGUoc3RhdGU6IElFZGl0b3JQYXJ0c1VJU3RhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc3RhdGUuYXV4aWxpYXJ5Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgYXV4aWxpYXJ5RWRpdG9yUGFydFByb21pc2VzOiBQcm9taXNlPElBdXhpbGlhcnlFZGl0b3JQYXJ0PltdID0gW107XG5cblx0XHRcdC8vIENyZWF0ZSBhdXhpbGlhcnkgZWRpdG9yIHBhcnRzXG5cdFx0XHRmb3IgKGNvbnN0IGF1eGlsaWFyeUVkaXRvclBhcnRTdGF0ZSBvZiBzdGF0ZS5hdXhpbGlhcnkpIHtcblx0XHRcdFx0YXV4aWxpYXJ5RWRpdG9yUGFydFByb21pc2VzLnB1c2godGhpcy5jcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0KGF1eGlsaWFyeUVkaXRvclBhcnRTdGF0ZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBd2FpdCBjcmVhdGlvblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGF1eGlsaWFyeUVkaXRvclBhcnRQcm9taXNlcyk7XG5cblx0XHRcdC8vIFVwZGF0ZSBNUlUgbGlzdFxuXHRcdFx0aWYgKHN0YXRlLm1ydS5sZW5ndGggPT09IHRoaXMucGFydHMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMubW9zdFJlY2VudEFjdGl2ZVBhcnRzID0gc3RhdGUubXJ1Lm1hcChpbmRleCA9PiB0aGlzLnBhcnRzW2luZGV4XSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cyA9IFsuLi50aGlzLnBhcnRzXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXdhaXQgcmVhZHlcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh0aGlzLnBhcnRzLm1hcChwYXJ0ID0+IHBhcnQud2hlblJlYWR5KSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGhhc1Jlc3RvcmFibGVTdGF0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5wYXJ0cy5zb21lKHBhcnQgPT4gcGFydC5oYXNSZXN0b3JhYmxlU3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZU1lbWVudG9TdGF0ZShlOiBJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZS5leHRlcm5hbCAmJiBlLnNjb3BlID09PSBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSB7XG5cdFx0XHR0aGlzLnJlbG9hZE1lbWVudG8oZS5zY29wZSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5sb2FkU3RhdGUoKTtcblx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHR0aGlzLmFwcGx5U3RhdGUoc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlTdGF0ZShzdGF0ZTogSUVkaXRvclBhcnRzVUlTdGF0ZSB8ICdlbXB0eScpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIEJlZm9yZSBjbG9zaW5nIHdpbmRvd3MsIHRyeSB0byBjbG9zZSBhcyBtYW55IGVkaXRvcnMgYXNcblx0XHQvLyBwb3NzaWJsZSwgYnV0IHNraXAgb3ZlciB0aG9zZSB0aGF0IHdvdWxkIHRyaWdnZXIgYSBkaWFsb2dcblx0XHQvLyAoZm9yIGV4YW1wbGUgd2hlbiBiZWluZyBkaXJ0eSkuIFRoaXMgaXMgdG8gYmUgYWJsZSB0byBoYXZlXG5cdFx0Ly8gdGhlbSBtZXJnZSBpbnRvIHRoZSBtYWluIHBhcnQuXG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0aWYgKHBhcnQgPT09IHRoaXMubWFpblBhcnQpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIG1haW4gcGFydCB0YWtlcyBjYXJlIG9uIGl0cyBvd25cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBwYXJ0LmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkpIHtcblx0XHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKHsgZXhjbHVkZUNvbmZpcm1pbmc6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbG9zZWQgPSAocGFydCBhcyB1bmtub3duIGFzIElBdXhpbGlhcnlFZGl0b3JQYXJ0KS5jbG9zZSgpOyAvLyB3aWxsIG1vdmUgcmVtYWluaW5nIGVkaXRvcnMgdG8gbWFpbiBwYXJ0XG5cdFx0XHRpZiAoIWNsb3NlZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHRoaXMgaW5kaWNhdGVzIHRoYXQgY2xvc2luZyB3YXMgdmV0b2VkXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdG9yZSBhdXhpbGlhcnkgc3RhdGUgdW5sZXNzIHdlIGFyZSBpbiBhbiBlbXB0eSBzdGF0ZVxuXHRcdGlmIChzdGF0ZSAhPT0gJ2VtcHR5Jykge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXN0b3JlU3RhdGUoc3RhdGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFdvcmtpbmcgU2V0c1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVESVRPUl9XT1JLSU5HX1NFVFNfU1RPUkFHRV9LRVkgPSAnZWRpdG9yLndvcmtpbmdTZXRzJztcblxuXHRwcml2YXRlIGVkaXRvcldvcmtpbmdTZXRzOiBJRWRpdG9yV29ya2luZ1NldFN0YXRlW107XG5cblx0c2F2ZVdvcmtpbmdTZXQobmFtZTogc3RyaW5nKTogSUVkaXRvcldvcmtpbmdTZXQge1xuXHRcdGNvbnN0IHdvcmtpbmdTZXQ6IElFZGl0b3JXb3JraW5nU2V0U3RhdGUgPSB7XG5cdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRuYW1lLFxuXHRcdFx0bWFpbjogdGhpcy5tYWluUGFydC5jcmVhdGVTdGF0ZSgpLFxuXHRcdFx0YXV4aWxpYXJ5OiB0aGlzLmNyZWF0ZVN0YXRlKClcblx0XHR9O1xuXG5cdFx0dGhpcy5lZGl0b3JXb3JraW5nU2V0cy5wdXNoKHdvcmtpbmdTZXQpO1xuXG5cdFx0dGhpcy5zYXZlV29ya2luZ1NldHMoKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogd29ya2luZ1NldC5pZCxcblx0XHRcdG5hbWU6IHdvcmtpbmdTZXQubmFtZVxuXHRcdH07XG5cdH1cblxuXHRnZXRXb3JraW5nU2V0cygpOiBJRWRpdG9yV29ya2luZ1NldFtdIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JXb3JraW5nU2V0cy5tYXAod29ya2luZ1NldCA9PiAoeyBpZDogd29ya2luZ1NldC5pZCwgbmFtZTogd29ya2luZ1NldC5uYW1lIH0pKTtcblx0fVxuXG5cdGRlbGV0ZVdvcmtpbmdTZXQod29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW5kZXhPZldvcmtpbmdTZXQod29ya2luZ1NldCk7XG5cdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuZWRpdG9yV29ya2luZ1NldHMuc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdFx0dGhpcy5zYXZlV29ya2luZ1NldHMoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBhcHBseVdvcmtpbmdTZXQod29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQgfCAnZW1wdHknLCBvcHRpb25zPzogSUVkaXRvcldvcmtpbmdTZXRPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IHdvcmtpbmdTZXRTdGF0ZTogSUVkaXRvcldvcmtpbmdTZXRTdGF0ZSB8ICdlbXB0eScgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHdvcmtpbmdTZXQgPT09ICdlbXB0eScpIHtcblx0XHRcdHdvcmtpbmdTZXRTdGF0ZSA9ICdlbXB0eSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHdvcmtpbmdTZXRTdGF0ZSA9IHRoaXMuZWRpdG9yV29ya2luZ1NldHNbdGhpcy5pbmRleE9mV29ya2luZ1NldCh3b3JraW5nU2V0KSA/PyAtMV07XG5cdFx0fVxuXG5cdFx0aWYgKCF3b3JraW5nU2V0U3RhdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBzdGF0ZTogYmVnaW4gd2l0aCBhdXhpbGlhcnkgd2luZG93cyBmaXJzdCBiZWNhdXNlIGl0IGhlbHBzIHRvIGtlZXBcblx0XHQvLyBlZGl0b3JzIGFyb3VuZCB0aGF0IG5lZWQgY29uZmlybWF0aW9uIGJ5IG1vdmluZyB0aGVtIGludG8gdGhlIG1haW4gcGFydC5cblx0XHQvLyBBbHNvLCBpbiByYXJlIGNhc2VzLCB0aGUgYXV4aWxpYXJ5IHBhcnQgbWF5IG5vdCBiZSBhYmxlIHRvIGFwcGx5IHRoZSBzdGF0ZVxuXHRcdC8vIGZvciBjZXJ0YWluIGVkaXRvcnMgdGhhdCBjYW5ub3QgbW92ZSB0byB0aGUgbWFpbiBwYXJ0LlxuXHRcdGNvbnN0IGFwcGxpZWQgPSBhd2FpdCB0aGlzLmFwcGx5U3RhdGUod29ya2luZ1NldFN0YXRlID09PSAnZW1wdHknID8gd29ya2luZ1NldFN0YXRlIDogd29ya2luZ1NldFN0YXRlLmF1eGlsaWFyeSk7XG5cdFx0aWYgKCFhcHBsaWVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMubWFpblBhcnQuYXBwbHlTdGF0ZSh3b3JraW5nU2V0U3RhdGUgPT09ICdlbXB0eScgPyB3b3JraW5nU2V0U3RhdGUgOiB3b3JraW5nU2V0U3RhdGUubWFpbiwgb3B0aW9ucyk7XG5cblx0XHQvLyBSZXN0b3JlIEZvY3VzIHVubGVzcyBpbnN0cnVjdGVkIG90aGVyd2lzZVxuXHRcdGlmICghb3B0aW9ucz8ucHJlc2VydmVGb2N1cykge1xuXHRcdFx0Y29uc3QgbW9zdFJlY2VudEFjdGl2ZVBhcnQgPSB0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cy5hdCgwKTtcblx0XHRcdGlmIChtb3N0UmVjZW50QWN0aXZlUGFydCkge1xuXHRcdFx0XHRhd2FpdCBtb3N0UmVjZW50QWN0aXZlUGFydC53aGVuUmVhZHk7XG5cdFx0XHRcdG1vc3RSZWNlbnRBY3RpdmVQYXJ0LmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGluZGV4T2ZXb3JraW5nU2V0KHdvcmtpbmdTZXQ6IElFZGl0b3JXb3JraW5nU2V0KTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZWRpdG9yV29ya2luZ1NldHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLmVkaXRvcldvcmtpbmdTZXRzW2ldLmlkID09PSB3b3JraW5nU2V0LmlkKSB7XG5cdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVXb3JraW5nU2V0cygpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEVkaXRvclBhcnRzLkVESVRPUl9XT1JLSU5HX1NFVFNfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KHRoaXMuZWRpdG9yV29ya2luZ1NldHMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aXZlR3JvdXBDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdG9yR3JvdXBWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVHcm91cCA9IHRoaXMuX29uRGlkQWN0aXZlR3JvdXBDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGRHcm91cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFkZEdyb3VwID0gdGhpcy5fb25EaWRBZGRHcm91cC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZUdyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvckdyb3VwVmlldz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlR3JvdXAgPSB0aGlzLl9vbkRpZFJlbW92ZUdyb3VwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTW92ZUdyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvckdyb3VwVmlldz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTW92ZUdyb3VwID0gdGhpcy5fb25EaWRNb3ZlR3JvdXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY3RpdmF0ZUdyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvckdyb3VwQWN0aXZhdGlvbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRBY3RpdmF0ZUdyb3VwID0gdGhpcy5fb25EaWRBY3RpdmF0ZUdyb3VwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlR3JvdXBJbmRleCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwSW5kZXggPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwSW5kZXguZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VHcm91cExvY2tlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwTG9ja2VkID0gdGhpcy5fb25EaWRDaGFuZ2VHcm91cExvY2tlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBHcm91cCBNYW5hZ2VtZW50XG5cblx0Z2V0IGFjdGl2ZUdyb3VwKCk6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZVBhcnQuYWN0aXZlR3JvdXA7XG5cdH1cblxuXHRnZXQgc2lkZUdyb3VwKCk6IElFZGl0b3JTaWRlR3JvdXAge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZVBhcnQuc2lkZUdyb3VwO1xuXHR9XG5cblx0Z2V0IGdyb3VwcygpOiBJRWRpdG9yR3JvdXBWaWV3W10ge1xuXHRcdHJldHVybiB0aGlzLmdldEdyb3VwcygpO1xuXHR9XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBzLmxlbmd0aDtcblx0fVxuXG5cdGdldEdyb3VwcyhvcmRlciA9IEdyb3Vwc09yZGVyLkNSRUFUSU9OX1RJTUUpOiBJRWRpdG9yR3JvdXBWaWV3W10ge1xuXHRcdGlmICh0aGlzLl9wYXJ0cy5zaXplID4gMSkge1xuXHRcdFx0bGV0IHBhcnRzOiBFZGl0b3JQYXJ0W107XG5cdFx0XHRzd2l0Y2ggKG9yZGVyKSB7XG5cdFx0XHRcdGNhc2UgR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFOiAvLyB3ZSBjdXJyZW50bHkgZG8gbm90IGhhdmUgYSB3YXkgdG8gY29tcHV0ZSBieSBhcHBlYXJhbmNlIG92ZXIgbXVsdGlwbGUgd2luZG93c1xuXHRcdFx0XHRjYXNlIEdyb3Vwc09yZGVyLkNSRUFUSU9OX1RJTUU6XG5cdFx0XHRcdFx0cGFydHMgPSB0aGlzLnBhcnRzO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFOlxuXHRcdFx0XHRcdHBhcnRzID0gZGlzdGluY3QoWy4uLnRoaXMubW9zdFJlY2VudEFjdGl2ZVBhcnRzLCAuLi50aGlzLnBhcnRzXSk7IC8vIGFsd2F5cyBlbnN1cmUgYWxsIHBhcnRzIGFyZSBpbmNsdWRlZFxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcGFydHMuZmxhdE1hcChwYXJ0ID0+IHBhcnQuZ2V0R3JvdXBzKG9yZGVyKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWFpblBhcnQuZ2V0R3JvdXBzKG9yZGVyKTtcblx0fVxuXG5cdGdldEdyb3VwKGlkZW50aWZpZXI6IEdyb3VwSWRlbnRpZmllcik6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9wYXJ0cy5zaXplID4gMSkge1xuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMuX3BhcnRzKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gcGFydC5nZXRHcm91cChpZGVudGlmaWVyKTtcblx0XHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWFpblBhcnQuZ2V0R3JvdXAoaWRlbnRpZmllcik7XG5cdH1cblxuXHRwcml2YXRlIGFzc2VydEdyb3VwVmlldyhncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllcik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdGxldCBncm91cFZpZXc6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBncm91cCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGdyb3VwVmlldyA9IHRoaXMuZ2V0R3JvdXAoZ3JvdXApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRncm91cFZpZXcgPSBncm91cDtcblx0XHR9XG5cblx0XHRpZiAoIWdyb3VwVmlldykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGVkaXRvciBncm91cCBwcm92aWRlZCEnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ3JvdXBWaWV3O1xuXHR9XG5cblx0YWN0aXZhdGVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllcik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnQoZ3JvdXApLmFjdGl2YXRlR3JvdXAoZ3JvdXApO1xuXHR9XG5cblx0Z2V0U2l6ZShncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllcik6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydChncm91cCkuZ2V0U2l6ZShncm91cCk7XG5cdH1cblxuXHRzZXRTaXplKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBzaXplOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHR0aGlzLmdldFBhcnQoZ3JvdXApLnNldFNpemUoZ3JvdXAsIHNpemUpO1xuXHR9XG5cblx0YXJyYW5nZUdyb3VwcyhhcnJhbmdlbWVudDogR3JvdXBzQXJyYW5nZW1lbnQsIGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVQYXJ0LmFjdGl2ZUdyb3VwKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRQYXJ0KGdyb3VwKS5hcnJhbmdlR3JvdXBzKGFycmFuZ2VtZW50LCBncm91cCk7XG5cdH1cblxuXHR0b2dnbGVNYXhpbWl6ZUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVQYXJ0LmFjdGl2ZUdyb3VwKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRQYXJ0KGdyb3VwKS50b2dnbGVNYXhpbWl6ZUdyb3VwKGdyb3VwKTtcblx0fVxuXG5cdHRvZ2dsZUV4cGFuZEdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVQYXJ0LmFjdGl2ZUdyb3VwKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRQYXJ0KGdyb3VwKS50b2dnbGVFeHBhbmRHcm91cChncm91cCk7XG5cdH1cblxuXHRyZXN0b3JlR3JvdXAoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRQYXJ0KGdyb3VwKS5yZXN0b3JlR3JvdXAoZ3JvdXApO1xuXHR9XG5cblx0YXBwbHlMYXlvdXQobGF5b3V0OiBFZGl0b3JHcm91cExheW91dCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlUGFydC5hcHBseUxheW91dChsYXlvdXQpO1xuXHR9XG5cblx0Z2V0TGF5b3V0KCk6IEVkaXRvckdyb3VwTGF5b3V0IHtcblx0XHRyZXR1cm4gdGhpcy5hY3RpdmVQYXJ0LmdldExheW91dCgpO1xuXHR9XG5cblx0Z2V0IG9yaWVudGF0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZVBhcnQub3JpZW50YXRpb247XG5cdH1cblxuXHRzZXRHcm91cE9yaWVudGF0aW9uKG9yaWVudGF0aW9uOiBHcm91cE9yaWVudGF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVQYXJ0LnNldEdyb3VwT3JpZW50YXRpb24ob3JpZW50YXRpb24pO1xuXHR9XG5cblx0ZmluZEdyb3VwKHNjb3BlOiBJRmluZEdyb3VwU2NvcGUsIHNvdXJjZTogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciA9IHRoaXMuYWN0aXZlR3JvdXAsIHdyYXA/OiBib29sZWFuKTogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc291cmNlUGFydCA9IHRoaXMuZ2V0UGFydChzb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9wYXJ0cy5zaXplID4gMSkge1xuXHRcdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5nZXRHcm91cHMoR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFKTtcblxuXHRcdFx0Ly8gRW5zdXJlIHRoYXQgRklSU1QvTEFTVCBkaXNwYXRjaGVzIGdsb2JhbGx5IG92ZXIgYWxsIHBhcnRzXG5cdFx0XHRpZiAoc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uRklSU1QgfHwgc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uTEFTVCkge1xuXHRcdFx0XHRyZXR1cm4gc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uRklSU1QgPyBncm91cHNbMF0gOiBncm91cHNbZ3JvdXBzLmxlbmd0aCAtIDFdO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcnkgdG8gZmluZCBpbiB0YXJnZXQgcGFydCBmaXJzdCB3aXRob3V0IHdyYXBwaW5nXG5cdFx0XHRjb25zdCBncm91cCA9IHNvdXJjZVBhcnQuZmluZEdyb3VwKHNjb3BlLCBzb3VyY2UsIGZhbHNlKTtcblx0XHRcdGlmIChncm91cCkge1xuXHRcdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVuc3VyZSB0aGF0IE5FWFQvUFJFVklPVVMgZGlzcGF0Y2hlcyBnbG9iYWxseSBvdmVyIGFsbCBwYXJ0c1xuXHRcdFx0aWYgKHNjb3BlLmxvY2F0aW9uID09PSBHcm91cExvY2F0aW9uLk5FWFQgfHwgc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uUFJFVklPVVMpIHtcblx0XHRcdFx0Y29uc3Qgc291cmNlR3JvdXAgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IGdyb3Vwcy5pbmRleE9mKHNvdXJjZUdyb3VwKTtcblxuXHRcdFx0XHRpZiAoc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uTkVYVCkge1xuXHRcdFx0XHRcdGxldCBuZXh0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQgPSBncm91cHNbaW5kZXggKyAxXTtcblx0XHRcdFx0XHRpZiAoIW5leHRHcm91cCAmJiB3cmFwKSB7XG5cdFx0XHRcdFx0XHRuZXh0R3JvdXAgPSBncm91cHNbMF07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIG5leHRHcm91cDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsZXQgcHJldmlvdXNHcm91cDogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCA9IGdyb3Vwc1tpbmRleCAtIDFdO1xuXHRcdFx0XHRcdGlmICghcHJldmlvdXNHcm91cCAmJiB3cmFwKSB7XG5cdFx0XHRcdFx0XHRwcmV2aW91c0dyb3VwID0gZ3JvdXBzW2dyb3Vwcy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gcHJldmlvdXNHcm91cDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzb3VyY2VQYXJ0LmZpbmRHcm91cChzY29wZSwgc291cmNlLCB3cmFwKTtcblx0fVxuXG5cdGFkZEdyb3VwKGxvY2F0aW9uOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uKTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydChsb2NhdGlvbikuYWRkR3JvdXAobG9jYXRpb24sIGRpcmVjdGlvbik7XG5cdH1cblxuXHRyZW1vdmVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdHRoaXMuZ2V0UGFydChncm91cCkucmVtb3ZlR3JvdXAoZ3JvdXApO1xuXHR9XG5cblx0bW92ZUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBsb2NhdGlvbjogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnQoZ3JvdXApLm1vdmVHcm91cChncm91cCwgbG9jYXRpb24sIGRpcmVjdGlvbik7XG5cdH1cblxuXHRtZXJnZUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCB0YXJnZXQ6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJTWVyZ2VHcm91cE9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRQYXJ0KGdyb3VwKS5tZXJnZUdyb3VwKGdyb3VwLCB0YXJnZXQsIG9wdGlvbnMpO1xuXHR9XG5cblx0bWVyZ2VBbGxHcm91cHModGFyZ2V0OiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSU1lcmdlR3JvdXBPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aXZlUGFydC5tZXJnZUFsbEdyb3Vwcyh0YXJnZXQsIG9wdGlvbnMpO1xuXHR9XG5cblx0Y29weUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBsb2NhdGlvbjogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnQoZ3JvdXApLmNvcHlHcm91cChncm91cCwgbG9jYXRpb24sIGRpcmVjdGlvbik7XG5cdH1cblxuXHRjcmVhdGVFZGl0b3JEcm9wVGFyZ2V0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGRlbGVnYXRlOiBJRWRpdG9yRHJvcFRhcmdldERlbGVnYXRlKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnQoY29udGFpbmVyKS5jcmVhdGVFZGl0b3JEcm9wVGFyZ2V0KGNvbnRhaW5lciwgZGVsZWdhdGUpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEVkaXRvciBHcm91cCBDb250ZXh0IEtleSBIYW5kbGluZ1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZ2xvYmFsQ29udGV4dEtleXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbnRleHRLZXk8Q29udGV4dEtleVZhbHVlPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBzY29wZWRDb250ZXh0S2V5cyA9IG5ldyBNYXA8R3JvdXBJZGVudGlmaWVyLCBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxDb250ZXh0S2V5VmFsdWU+Pj4oKTtcblxuXHRwcml2YXRlIHJlZ2lzdGVyR3JvdXBzQ29udGV4dEtleUxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAoKCkgPT4gdGhpcy51cGRhdGVHbG9iYWxDb250ZXh0S2V5cygpKSk7XG5cdFx0dGhpcy5ncm91cHMuZm9yRWFjaChncm91cCA9PiB0aGlzLnJlZ2lzdGVyR3JvdXBDb250ZXh0S2V5UHJvdmlkZXJzTGlzdGVuZXJzKGdyb3VwKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZEFkZEdyb3VwKGdyb3VwID0+IHRoaXMucmVnaXN0ZXJHcm91cENvbnRleHRLZXlQcm92aWRlcnNMaXN0ZW5lcnMoZ3JvdXApKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFJlbW92ZUdyb3VwKGdyb3VwID0+IHtcblx0XHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleXMuZGVsZXRlKGdyb3VwLmlkKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJlZENvbnRleHRLZXlzLmRlbGV0ZShncm91cC5pZCk7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXlQcm92aWRlckRpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2UoZ3JvdXAuaWQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlR2xvYmFsQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXBTY29wZWRDb250ZXh0S2V5cyA9IHRoaXMuc2NvcGVkQ29udGV4dEtleXMuZ2V0KHRoaXMuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdGlmICghYWN0aXZlR3JvdXBTY29wZWRDb250ZXh0S2V5cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW2tleSwgZ2xvYmFsQ29udGV4dEtleV0gb2YgdGhpcy5nbG9iYWxDb250ZXh0S2V5cykge1xuXHRcdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleSA9IGFjdGl2ZUdyb3VwU2NvcGVkQ29udGV4dEtleXMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoc2NvcGVkQ29udGV4dEtleSkge1xuXHRcdFx0XHRnbG9iYWxDb250ZXh0S2V5LnNldChzY29wZWRDb250ZXh0S2V5LmdldCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdsb2JhbENvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRiaW5kPFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWU+KGNvbnRleHRLZXk6IFJhd0NvbnRleHRLZXk8VD4sIGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3KTogSUNvbnRleHRLZXk8VD4ge1xuXG5cdFx0Ly8gRW5zdXJlIHdlIG9ubHkgYmluZCB0byB0aGUgc2FtZSBjb250ZXh0IGtleSBvbmNlIGdsb2JhbHlcblx0XHRsZXQgZ2xvYmFsQ29udGV4dEtleSA9IHRoaXMuZ2xvYmFsQ29udGV4dEtleXMuZ2V0KGNvbnRleHRLZXkua2V5KTtcblx0XHRpZiAoIWdsb2JhbENvbnRleHRLZXkpIHtcblx0XHRcdGdsb2JhbENvbnRleHRLZXkgPSBjb250ZXh0S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHRoaXMuZ2xvYmFsQ29udGV4dEtleXMuc2V0KGNvbnRleHRLZXkua2V5LCBnbG9iYWxDb250ZXh0S2V5KTtcblx0XHR9XG5cblx0XHQvLyBFbnN1cmUgd2Ugb25seSBiaW5kIHRvIHRoZSBzYW1lIGNvbnRleHQga2V5IG9uY2UgcGVyIGdyb3VwXG5cdFx0bGV0IGdyb3VwU2NvcGVkQ29udGV4dEtleXMgPSB0aGlzLnNjb3BlZENvbnRleHRLZXlzLmdldChncm91cC5pZCk7XG5cdFx0aWYgKCFncm91cFNjb3BlZENvbnRleHRLZXlzKSB7XG5cdFx0XHRncm91cFNjb3BlZENvbnRleHRLZXlzID0gbmV3IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PENvbnRleHRLZXlWYWx1ZT4+KCk7XG5cdFx0XHR0aGlzLnNjb3BlZENvbnRleHRLZXlzLnNldChncm91cC5pZCwgZ3JvdXBTY29wZWRDb250ZXh0S2V5cyk7XG5cdFx0fVxuXHRcdGxldCBzY29wZWRDb250ZXh0S2V5ID0gZ3JvdXBTY29wZWRDb250ZXh0S2V5cy5nZXQoY29udGV4dEtleS5rZXkpO1xuXHRcdGlmICghc2NvcGVkQ29udGV4dEtleSkge1xuXHRcdFx0c2NvcGVkQ29udGV4dEtleSA9IGNvbnRleHRLZXkuYmluZFRvKGdyb3VwLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGdyb3VwU2NvcGVkQ29udGV4dEtleXMuc2V0KGNvbnRleHRLZXkua2V5LCBzY29wZWRDb250ZXh0S2V5KTtcblx0XHR9XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0KCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gc2NvcGVkQ29udGV4dEtleS5nZXQoKSBhcyBUIHwgdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdHNldCh2YWx1ZTogVCk6IHZvaWQge1xuXHRcdFx0XHRpZiAodGhhdC5hY3RpdmVHcm91cCA9PT0gZ3JvdXApIHtcblx0XHRcdFx0XHRnbG9iYWxDb250ZXh0S2V5LnNldCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2NvcGVkQ29udGV4dEtleS5zZXQodmFsdWUpO1xuXHRcdFx0fSxcblx0XHRcdHJlc2V0KCk6IHZvaWQge1xuXHRcdFx0XHRpZiAodGhhdC5hY3RpdmVHcm91cCA9PT0gZ3JvdXApIHtcblx0XHRcdFx0XHRnbG9iYWxDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2NvcGVkQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5UHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxDb250ZXh0S2V5VmFsdWU+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlZ2lzdGVyZWRDb250ZXh0S2V5cyA9IG5ldyBNYXA8R3JvdXBJZGVudGlmaWVyLCBNYXA8c3RyaW5nLCBJQ29udGV4dEtleT4+KCk7XG5cblx0cmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXI8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4ocHJvdmlkZXI6IElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxUPik6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5jb250ZXh0S2V5UHJvdmlkZXJzLmhhcyhwcm92aWRlci5jb250ZXh0S2V5LmtleSkgfHwgdGhpcy5nbG9iYWxDb250ZXh0S2V5cy5oYXMocHJvdmlkZXIuY29udGV4dEtleS5rZXkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEEgY29udGV4dCBrZXkgcHJvdmlkZXIgZm9yIGtleSAke3Byb3ZpZGVyLmNvbnRleHRLZXkua2V5fSBhbHJlYWR5IGV4aXN0cy5gKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRleHRLZXlQcm92aWRlcnMuc2V0KHByb3ZpZGVyLmNvbnRleHRLZXkua2V5LCBwcm92aWRlcik7XG5cblx0XHRjb25zdCBzZXRDb250ZXh0S2V5Rm9yR3JvdXBzID0gKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmdyb3Vwcykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVJlZ2lzdGVyZWRDb250ZXh0S2V5KGdyb3VwLCBwcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFJ1biBpbml0aWFsbHkgYW5kIG9uIGNoYW5nZVxuXHRcdHNldENvbnRleHRLZXlGb3JHcm91cHMoKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZSA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlPy4oKCkgPT4gc2V0Q29udGV4dEtleUZvckdyb3VwcygpKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0b25EaWRDaGFuZ2U/LmRpc3Bvc2UoKTtcblxuXHRcdFx0dGhpcy5nbG9iYWxDb250ZXh0S2V5cy5kZWxldGUocHJvdmlkZXIuY29udGV4dEtleS5rZXkpO1xuXHRcdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5cy5mb3JFYWNoKHNjb3BlZENvbnRleHRLZXlzID0+IHNjb3BlZENvbnRleHRLZXlzLmRlbGV0ZShwcm92aWRlci5jb250ZXh0S2V5LmtleSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRleHRLZXlQcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVyLmNvbnRleHRLZXkua2V5KTtcblx0XHRcdHRoaXMucmVnaXN0ZXJlZENvbnRleHRLZXlzLmZvckVhY2gocmVnaXN0ZXJlZENvbnRleHRLZXlzID0+IHJlZ2lzdGVyZWRDb250ZXh0S2V5cy5kZWxldGUocHJvdmlkZXIuY29udGV4dEtleS5rZXkpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVByb3ZpZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxHcm91cElkZW50aWZpZXIsIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWdpc3Rlckdyb3VwQ29udGV4dEtleVByb3ZpZGVyc0xpc3RlbmVycyhncm91cDogSUVkaXRvckdyb3VwVmlldyk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIGNvbnRleHQga2V5cyBmcm9tIHByb3ZpZGVycyBmb3IgdGhlIGdyb3VwIHdoZW4gaXRzIGFjdGl2ZSBlZGl0b3IgY2hhbmdlc1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBncm91cC5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRleHRLZXlQcm92aWRlciBvZiB0aGlzLmNvbnRleHRLZXlQcm92aWRlcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVSZWdpc3RlcmVkQ29udGV4dEtleShncm91cCwgY29udGV4dEtleVByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuY29udGV4dEtleVByb3ZpZGVyRGlzcG9zYWJsZXMuc2V0KGdyb3VwLmlkLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVnaXN0ZXJlZENvbnRleHRLZXk8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4oZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcsIHByb3ZpZGVyOiBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXI8VD4pOiB2b2lkIHtcblxuXHRcdC8vIEdldCB0aGUgZ3JvdXAgc2NvcGVkIGNvbnRleHQga2V5cyBmb3IgdGhlIHByb3ZpZGVyXG5cdFx0Ly8gSWYgdGhlIHByb3ZpZGVycyBjb250ZXh0IGtleSBoYXMgbm90IHlldCBiZWVuIGJvdW5kXG5cdFx0Ly8gdG8gdGhlIGdyb3VwLCBkbyBzbyBub3cuXG5cblx0XHRsZXQgZ3JvdXBSZWdpc3RlcmVkQ29udGV4dEtleXMgPSB0aGlzLnJlZ2lzdGVyZWRDb250ZXh0S2V5cy5nZXQoZ3JvdXAuaWQpO1xuXHRcdGlmICghZ3JvdXBSZWdpc3RlcmVkQ29udGV4dEtleXMpIHtcblx0XHRcdGdyb3VwUmVnaXN0ZXJlZENvbnRleHRLZXlzID0gbmV3IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PigpO1xuXHRcdFx0dGhpcy5yZWdpc3RlcmVkQ29udGV4dEtleXMuc2V0KGdyb3VwLmlkLCBncm91cFJlZ2lzdGVyZWRDb250ZXh0S2V5cyk7XG5cdFx0fVxuXG5cdFx0bGV0IHNjb3BlZFJlZ2lzdGVyZWRDb250ZXh0S2V5ID0gZ3JvdXBSZWdpc3RlcmVkQ29udGV4dEtleXMuZ2V0KHByb3ZpZGVyLmNvbnRleHRLZXkua2V5KTtcblx0XHRpZiAoIXNjb3BlZFJlZ2lzdGVyZWRDb250ZXh0S2V5KSB7XG5cdFx0XHRzY29wZWRSZWdpc3RlcmVkQ29udGV4dEtleSA9IHRoaXMuYmluZChwcm92aWRlci5jb250ZXh0S2V5LCBncm91cCk7XG5cdFx0XHRncm91cFJlZ2lzdGVyZWRDb250ZXh0S2V5cy5zZXQocHJvdmlkZXIuY29udGV4dEtleS5rZXksIHNjb3BlZFJlZ2lzdGVyZWRDb250ZXh0S2V5KTtcblx0XHR9XG5cblx0XHQvLyBTZXQgdGhlIGNvbnRleHQga2V5IHZhbHVlIGZvciB0aGUgZ3JvdXAgY29udGV4dFxuXHRcdHNjb3BlZFJlZ2lzdGVyZWRDb250ZXh0S2V5LnNldChwcm92aWRlci5nZXRHcm91cENvbnRleHRLZXlWYWx1ZShncm91cCkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE1haW4gRWRpdG9yIFBhcnQgT25seVxuXG5cdGdldCBwYXJ0T3B0aW9ucygpIHsgcmV0dXJuIHRoaXMubWFpblBhcnQucGFydE9wdGlvbnM7IH1cblx0Z2V0IG9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoKSB7IHJldHVybiB0aGlzLm1haW5QYXJ0Lm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnM7IH1cblxuXHRlbmZvcmNlUGFydE9wdGlvbnMob3B0aW9uczogRGVlcFBhcnRpYWw8SUVkaXRvclBhcnRPcHRpb25zPik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5tYWluUGFydC5lbmZvcmNlUGFydE9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUVkaXRvckdyb3Vwc1NlcnZpY2UsIEVkaXRvclBhcnRzLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLHVCQUF1QyxlQUFvRCxhQUE4Riw0QkFBNEw7QUFDalosU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZSxpQkFBOEIsb0JBQW9CO0FBRTFFLFNBQXlDLHNCQUFzQjtBQUUvRCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBNEQ7QUFDckUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBMkMsY0FBYyxxQkFBcUI7QUFDdkYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBc0MsK0JBQStCO0FBQ3JFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQXVDLDBCQUF5QztBQUNoRixTQUFTLGtCQUE4QixZQUFZLHFCQUFxQjtBQUN4RSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHFDQUFxQztBQThCdkMsSUFBTSxjQUFOLGNBQTBCLGlCQUFvRztBQUFBLEVBYXBJLFlBQzJDLHNCQUNSLGdCQUNuQixjQUMyQix3QkFDTCxtQkFDcEM7QUFDRCxVQUFNLHlCQUF5QixjQUFjLGNBQWM7QUFOakI7QUFDUjtBQUVRO0FBQ0w7QUEyQ3RDO0FBQUEsU0FBaUIsZ0NBQWdDLG9CQUFJLElBQW1EO0FBc0N4RztBQUFBO0FBQUEsU0FBaUIsa0NBQWtDLEtBQUssVUFBVSxJQUFJLFFBQThCLENBQUM7QUFDckcsU0FBUyxpQ0FBaUMsS0FBSyxnQ0FBZ0M7QUF3Qi9FLFNBQVEsdUJBQXVCO0FBNE8vQixTQUFpQixtQkFBbUIsS0FBSyxXQUFXLGFBQWEsV0FBVyxjQUFjLElBQUk7QUFDOUYsU0FBaUIsaUJBQWlCLEtBQUssV0FBVyxhQUFhLFNBQVMsY0FBYyxPQUFPO0FBRTdGLFNBQVEsV0FBVztBQUduQixTQUFpQixtQkFBbUIsSUFBSSxnQkFBc0I7QUFDOUQsU0FBUyxZQUFZLEtBQUssaUJBQWlCO0FBRTNDLFNBQWlCLHNCQUFzQixJQUFJLGdCQUFzQjtBQUNqRSxTQUFTLGVBQWUsS0FBSyxvQkFBb0I7QUEwUGpEO0FBQUE7QUFBQSxTQUFpQiwwQkFBMEIsS0FBSyxVQUFVLElBQUksUUFBMEIsQ0FBQztBQUN6RixTQUFTLHlCQUF5QixLQUFLLHdCQUF3QjtBQUUvRCxTQUFpQixpQkFBaUIsS0FBSyxVQUFVLElBQUksUUFBMEIsQ0FBQztBQUNoRixTQUFTLGdCQUFnQixLQUFLLGVBQWU7QUFFN0MsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDbkYsU0FBUyxtQkFBbUIsS0FBSyxrQkFBa0I7QUFFbkQsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDakYsU0FBUyxpQkFBaUIsS0FBSyxnQkFBZ0I7QUFFL0MsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXFDLENBQUM7QUFDaEcsU0FBUyxxQkFBcUIsS0FBSyxvQkFBb0I7QUFFdkQsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDeEYsU0FBUyx3QkFBd0IsS0FBSyx1QkFBdUI7QUFFN0QsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDekYsU0FBUyx5QkFBeUIsS0FBSyx3QkFBd0I7QUFFL0QsU0FBaUIsNkJBQTZCLEtBQUssVUFBVSxJQUFJLFFBQWlCLENBQUM7QUFDbkYsU0FBUyw0QkFBNEIsS0FBSywyQkFBMkI7QUEyTHJFO0FBQUE7QUFBQSxTQUFpQixvQkFBb0Isb0JBQUksSUFBMEM7QUFDbkYsU0FBaUIsb0JBQW9CLG9CQUFJLElBQWdFO0FBc0V6RyxTQUFpQixzQkFBc0Isb0JBQUksSUFBNkQ7QUFDeEcsU0FBaUIsd0JBQXdCLG9CQUFJLElBQStDO0FBOEI1RixTQUFpQixnQ0FBZ0MsS0FBSyxVQUFVLElBQUksY0FBNEMsQ0FBQztBQTk0QmhILFNBQUssNEJBQTRCLDhCQUE4QixPQUFPLEtBQUssaUJBQWlCO0FBRTVGLFNBQUsscUJBQXFCLE1BQU07QUFDL0IsWUFBTSxpQkFBaUIsS0FBSyxlQUFlLElBQUksWUFBWSxpQ0FBaUMsYUFBYSxTQUFTO0FBQ2xILFVBQUksZ0JBQWdCO0FBQ25CLGVBQU8sS0FBSyxNQUFNLGNBQWM7QUFBQSxNQUNqQztBQUVBLGFBQU8sQ0FBQztBQUFBLElBQ1QsR0FBRztBQUVILFVBQU0sYUFBYSxLQUFLLGVBQWUsWUFBWSw4QkFBOEI7QUFDakYsUUFBSSxZQUFZO0FBQ2YsV0FBSyx1QkFBdUIsV0FBVztBQUN2QyxXQUFLLGtCQUFrQixXQUFXO0FBQ2xDLFdBQUssc0JBQXNCLFdBQVc7QUFDdEMsV0FBSywwQkFBMEIsV0FBVztBQUMxQyxXQUFLLDJCQUEyQixXQUFXO0FBQUEsSUFDNUM7QUFFQSxTQUFLLFdBQVcsS0FBSyxVQUFVLEtBQUsscUJBQXFCLENBQUM7QUFDMUQsU0FBSyxVQUFVLEtBQUssYUFBYSxLQUFLLFFBQVEsQ0FBQztBQUUvQyxTQUFLLHdCQUF3QixDQUFDLEtBQUssUUFBUTtBQUUzQyxTQUFLLGFBQWE7QUFDbEIsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRVEsb0JBQTBCO0FBQ2pDLFNBQUssVUFBVSxLQUFLLHdCQUF3QixhQUFhLFdBQVcsS0FBSyxNQUFNLEVBQUUsT0FBSyxLQUFLLHdCQUF3QixDQUFDLENBQUMsQ0FBQztBQUN0SCxTQUFLLFVBQVUsS0FBSyxNQUFNLEtBQUssa0NBQWtDLENBQUM7QUFBQSxFQUNuRTtBQUFBLEVBRVUsdUJBQXVDO0FBQ2hELFdBQU8sS0FBSyxxQkFBcUIsZUFBZSxnQkFBZ0IsSUFBSTtBQUFBLEVBQ3JFO0FBQUEsRUFPQSw4QkFBOEIsTUFBMEM7QUFHdkUsUUFBSSxTQUFTLEtBQUssVUFBVTtBQUMzQixVQUFJLCtCQUErQixLQUFLLDhCQUE4QixJQUFJLEtBQUssUUFBUTtBQUN2RixVQUFJLENBQUMsOEJBQThCO0FBQ2xDLHVDQUErQixLQUFLLHFCQUFxQixlQUFlLGNBQVk7QUFDbkYsZ0JBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELGdCQUFNLG1CQUFtQixTQUFTLElBQUksaUJBQWlCO0FBRXZELGdCQUFNQSxnQ0FBK0IsS0FBSyxVQUFVLEtBQUssU0FBUywyQkFBMkIsWUFBWSxJQUFJO0FBQUEsWUFDNUcsQ0FBQyxnQkFBZ0IsY0FBYyxhQUFhLEtBQUssVUFBVSxLQUFLLE1BQU0sQ0FBQztBQUFBLFlBQ3ZFLENBQUMsbUJBQW1CLGlCQUFpQixhQUFhLGtCQUFrQixLQUFLLE1BQU0sQ0FBQztBQUFBLFVBQ2pGLENBQUMsQ0FBQztBQUNGLGVBQUssOEJBQThCLElBQUksS0FBSyxVQUFVQSw2QkFBNEI7QUFFbEYsaUJBQU9BO0FBQUEsUUFDUixDQUFDO0FBQUEsTUFDRjtBQUVBLGFBQU87QUFBQSxJQUNSO0FBR0EsUUFBSSxTQUFTLEtBQUssbUJBQW1CLEtBQUssK0JBQStCO0FBQ3hFLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFFQSxXQUFPLEtBQUssOEJBQThCLElBQUksS0FBSyxRQUFRLEtBQUssS0FBSztBQUFBLEVBQ3RFO0FBQUEsRUFTQSxNQUFNLDBCQUEwQixTQUEwRTtBQUN6RyxVQUFNLEVBQUUsTUFBTSxzQkFBc0IsWUFBWSxJQUFJLE1BQU0sS0FBSyxxQkFBcUIsZUFBZSxxQkFBcUIsSUFBSSxFQUFFLE9BQU8sS0FBSyxlQUFlLEtBQUssT0FBTyxJQUFJLEdBQUcsT0FBTztBQUduTCxTQUFLLDhCQUE4QixJQUFJLEtBQUssVUFBVSxvQkFBb0I7QUFDMUUsZ0JBQVksSUFBSSxhQUFhLE1BQU0sS0FBSyw4QkFBOEIsT0FBTyxLQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRzVGLFNBQUssZUFBZSxLQUFLLEtBQUssV0FBVztBQUV6QyxTQUFLLGdDQUFnQyxLQUFLLElBQUk7QUFFOUMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQU9BLElBQUksd0JBQXNEO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBaUI7QUFBQSxFQVl6RixNQUFNLHNCQUFzQixTQUE4RDtBQUd6RixRQUFJLEtBQUssaUJBQWlCO0FBQ3pCLFdBQUssZ0JBQWdCLGNBQWMsT0FBTztBQUUxQyxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBSUEsUUFBSSxLQUFLLDhCQUE4QjtBQUN0QyxZQUFNLE9BQU8sTUFBTSxLQUFLO0FBQ3hCLFdBQUssY0FBYyxPQUFPO0FBRTFCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxnQkFBZ0IsS0FBSyx3QkFBd0IsT0FBTyxFQUFFLFFBQVEsTUFBTTtBQUN6RSxXQUFLLCtCQUErQjtBQUFBLElBQ3JDLENBQUM7QUFDRCxTQUFLLCtCQUErQjtBQUVwQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyx3QkFBd0IsU0FBeUU7QUFDOUcsU0FBSywwQkFBMEIsSUFBSSxJQUFJO0FBQ3ZDLFFBQUk7QUFDSixRQUFJO0FBQ0gsZUFBUyxNQUFNLEtBQUsscUJBQXFCLGVBQWUsaUJBQWlCLElBQUksRUFBRSxPQUFPO0FBQUEsUUFDckYsR0FBRztBQUFBLFFBQ0gsV0FBVyxTQUFTLGFBQWEsS0FBSztBQUFBLFFBQ3RDLE1BQU0sU0FBUyxRQUFRLEtBQUs7QUFBQSxRQUM1QixVQUFVLFNBQVMsWUFBWSxLQUFLO0FBQUEsUUFDcEMsU0FBUyxTQUFTLFVBQVU7QUFBQSxVQUMzQixHQUFHLFFBQVE7QUFBQSxVQUNYLGNBQWMsUUFBUSxRQUFRLGdCQUFnQixLQUFLO0FBQUEsVUFDbkQsZUFBZSxRQUFRLFFBQVEsaUJBQWlCLEtBQUs7QUFBQSxRQUN0RCxJQUFJO0FBQUEsTUFDTCxDQUFDO0FBQUEsSUFDRixTQUFTLE9BQU87QUFDZixXQUFLLDBCQUEwQixJQUFJLEtBQUs7QUFDeEMsWUFBTTtBQUFBLElBQ1A7QUFDQSxVQUFNLEVBQUUsTUFBTSxzQkFBc0IsWUFBWSxJQUFJO0FBR3BELFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssZ0NBQWdDO0FBR3JDLGdCQUFZLElBQUksYUFBYSxNQUFNO0FBQ2xDLFdBQUssdUJBQXVCLEtBQUs7QUFDakMsV0FBSyxrQkFBa0IsS0FBSztBQUM1QixXQUFLLHNCQUFzQixLQUFLO0FBQ2hDLFVBQUksS0FBSyxZQUFZO0FBQ3BCLGFBQUssMEJBQTBCLEtBQUs7QUFDcEMsYUFBSywyQkFBMkIsS0FBSyxpQkFBaUI7QUFBQSxNQUN2RDtBQUVBLFdBQUssZ0NBQWdDO0FBQ3JDLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssMEJBQTBCLElBQUksS0FBSztBQUFBLElBQ3pDLENBQUMsQ0FBQztBQUdGLFNBQUssZUFBZSxLQUFLLEtBQUssV0FBVztBQUV6QyxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQSxFQU1TLGFBQWEsTUFBK0I7QUFDcEQsVUFBTSxjQUFjLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQ3hELGdCQUFZLElBQUksTUFBTSxhQUFhLElBQUksQ0FBQztBQUV4QyxTQUFLLDRCQUE0QixNQUFNLFdBQVc7QUFFbEQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVtQixlQUFlLE1BQXdCO0FBQ3pELFVBQU0sZUFBZSxJQUFJO0FBS3pCLFNBQUssTUFBTSxRQUFRLENBQUNDLE9BQU0sVUFBVTtBQUNuQyxVQUFJQSxVQUFTLEtBQUssVUFBVTtBQUMzQjtBQUFBLE1BQ0Q7QUFFQSxNQUFBQSxNQUFLLHdCQUF3QixLQUFLLGVBQWUsS0FBSyxDQUFDO0FBQUEsSUFDeEQsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLDRCQUE0QixNQUFrQixhQUFvQztBQUN6RixnQkFBWSxJQUFJLEtBQUssV0FBVyxNQUFNO0FBQ3JDLFdBQUsseUJBQXlCLE1BQU0sSUFBSTtBQUV4QyxVQUFJLEtBQUssT0FBTyxPQUFPLEdBQUc7QUFHekIsYUFBSyx3QkFBd0IsS0FBSyxLQUFLLFdBQVc7QUFBQSxNQUNuRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxhQUFhLE1BQU07QUFDbEMsV0FBSyx5QkFBeUIsSUFBSTtBQUVsQyxVQUFJLEtBQUssYUFBYSxXQUFXLGdCQUFnQjtBQUtoRCxhQUFLLHdCQUF3QixLQUFLLEtBQUssV0FBVztBQUFBLE1BQ25EO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixnQkFBWSxJQUFJLEtBQUssdUJBQXVCLFdBQVMsS0FBSyx3QkFBd0IsS0FBSyxLQUFLLENBQUMsQ0FBQztBQUM5RixnQkFBWSxJQUFJLEtBQUssY0FBYyxXQUFTLEtBQUssZUFBZSxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQzVFLGdCQUFZLElBQUksS0FBSyxpQkFBaUIsV0FBUyxLQUFLLGtCQUFrQixLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQ2xGLGdCQUFZLElBQUksS0FBSyxlQUFlLFdBQVMsS0FBSyxnQkFBZ0IsS0FBSyxLQUFLLENBQUMsQ0FBQztBQUM5RSxnQkFBWSxJQUFJLEtBQUssbUJBQW1CLE9BQUs7QUFPNUMsVUFBSSxFQUFFLFdBQVcsc0JBQXNCLFlBQVk7QUFDbEQsYUFBSyx5QkFBeUIsTUFBTSxJQUFJO0FBQUEsTUFDekM7QUFFQSxXQUFLLG9CQUFvQixLQUFLLENBQUM7QUFBQSxJQUNoQyxDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLEtBQUssMEJBQTBCLGVBQWEsS0FBSywyQkFBMkIsS0FBSyxTQUFTLENBQUMsQ0FBQztBQUU1RyxnQkFBWSxJQUFJLEtBQUssc0JBQXNCLFdBQVMsS0FBSyx1QkFBdUIsS0FBSyxLQUFLLENBQUMsQ0FBQztBQUM1RixnQkFBWSxJQUFJLEtBQUssdUJBQXVCLFdBQVMsS0FBSyx3QkFBd0IsS0FBSyxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQy9GO0FBQUEsRUFFUSx5QkFBeUIsTUFBa0Isd0JBQXdDO0FBQzFGLFVBQU0sUUFBUSxLQUFLLHNCQUFzQixRQUFRLElBQUk7QUFHckQsUUFBSSxVQUFVLElBQUk7QUFDakIsV0FBSyxzQkFBc0IsT0FBTyxPQUFPLENBQUM7QUFBQSxJQUMzQztBQUdBLFFBQUksd0JBQXdCO0FBQzNCLFdBQUssc0JBQXNCLFFBQVEsSUFBSTtBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZSxPQUF1QjtBQUM3QyxXQUFPLFNBQVMsY0FBYyxjQUFjLFFBQVEsQ0FBQztBQUFBLEVBQ3REO0FBQUE7QUFBQTtBQUFBLEVBTW1CLGtCQUFrQixVQUFnQztBQUlwRSxVQUFNLFdBQVcsS0FBSztBQUN0QixVQUFNLG1CQUFtQixTQUFTLE9BQU8sVUFBUSxLQUFLLFNBQVMsa0JBQWtCLFFBQVE7QUFDekYsUUFBSSxpQkFBaUIsU0FBUyxHQUFHO0FBRWhDLFlBQU0sZ0JBQWdCLGlCQUFpQjtBQUN2QyxpQkFBVyxRQUFRLGtCQUFrQjtBQUNwQyxjQUFNLFlBQVksS0FBSyxhQUFhO0FBQ3BDLFlBQUksYUFBYSxXQUFXLGVBQWUsU0FBUyxHQUFHO0FBQ3RELGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFHQSxhQUFPLGlCQUFpQixDQUFDO0FBQUEsSUFDMUI7QUFFQSxXQUFPLE1BQU0sa0JBQWtCLFFBQVE7QUFBQSxFQUN4QztBQUFBLEVBSVMsUUFBUSxnQkFBOEU7QUFDOUYsUUFBSSxLQUFLLE9BQU8sT0FBTyxHQUFHO0FBQ3pCLFVBQUksY0FBYyxjQUFjLEdBQUc7QUFDbEMsY0FBTSxVQUFVO0FBRWhCLGVBQU8sS0FBSyxrQkFBa0IsUUFBUSxhQUFhO0FBQUEsTUFDcEQsT0FBTztBQUNOLGNBQU0sUUFBUTtBQUVkLFlBQUk7QUFDSixZQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGVBQUs7QUFBQSxRQUNOLE9BQU87QUFDTixlQUFLLE1BQU07QUFBQSxRQUNaO0FBRUEsbUJBQVcsUUFBUSxLQUFLLFFBQVE7QUFDL0IsY0FBSSxLQUFLLFNBQVMsRUFBRSxHQUFHO0FBQ3RCLG1CQUFPO0FBQUEsVUFDUjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQWFBLElBQUksVUFBbUI7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFVO0FBQUEsRUFRL0MsTUFBYyxlQUE4QjtBQU0zQyxVQUFNLEtBQUssU0FBUztBQU1wQixRQUFJLEtBQUssU0FBUyxrQkFBa0I7QUFDbkMsWUFBTSxRQUFRLEtBQUssVUFBVTtBQUM3QixVQUFJLE9BQU87QUFDVixjQUFNLEtBQUssYUFBYSxLQUFLO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBRUEsVUFBTSx1QkFBdUIsS0FBSyxzQkFBc0IsR0FBRyxDQUFDO0FBQzVELDBCQUFzQixZQUFZLE1BQU07QUFFeEMsU0FBSyxXQUFXO0FBQ2hCLFNBQUssaUJBQWlCLFNBQVM7QUFHL0IsVUFBTSxRQUFRLFdBQVcsS0FBSyxNQUFNLElBQUksVUFBUSxLQUFLLFlBQVksQ0FBQztBQUNsRSxTQUFLLG9CQUFvQixTQUFTO0FBQUEsRUFDbkM7QUFBQSxFQUVRLFlBQTZDO0FBQ3BELFdBQU8sS0FBSyxpQkFBaUIsWUFBWSxpQ0FBaUM7QUFBQSxFQUMzRTtBQUFBLEVBRW1CLFlBQWtCO0FBQ3BDLFVBQU0sUUFBUSxLQUFLLFlBQVk7QUFDL0IsUUFBSSxNQUFNLFVBQVUsV0FBVyxHQUFHO0FBQ2pDLGFBQU8sS0FBSyxpQkFBaUIsWUFBWSxpQ0FBaUM7QUFBQSxJQUMzRSxPQUFPO0FBQ04sV0FBSyxpQkFBaUIsWUFBWSxpQ0FBaUMsSUFBSTtBQUFBLElBQ3hFO0FBRUEsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVRLGlCQUF1QjtBQUc5QixRQUFJLEtBQUssaUJBQWlCO0FBQ3pCLFdBQUssdUJBQXVCLEtBQUssZ0JBQWdCO0FBQ2pELFdBQUssa0JBQWtCLEtBQUssZ0JBQWdCO0FBQzVDLFdBQUssc0JBQXNCLEtBQUssZ0JBQWdCO0FBQ2hELFVBQUksS0FBSyxnQkFBZ0IsWUFBWTtBQUNwQyxhQUFLLDBCQUEwQixLQUFLLGdCQUFnQjtBQUNwRCxhQUFLLDJCQUEyQixLQUFLLGdCQUFnQixpQkFBaUI7QUFBQSxNQUN2RTtBQUFBLElBQ0Q7QUFNQSxRQUFJLEtBQUssd0JBQXdCLEtBQUssbUJBQW1CLEtBQUssdUJBQXVCLEtBQUssMkJBQTJCLEtBQUssMEJBQTBCO0FBQ25KLFdBQUssZUFBZSxZQUFZLDhCQUE4QixJQUFJO0FBQUEsUUFDakUsV0FBVyxLQUFLO0FBQUEsUUFDaEIsTUFBTSxLQUFLLGtCQUFrQixFQUFFLE9BQU8sS0FBSyxnQkFBZ0IsT0FBTyxRQUFRLEtBQUssZ0JBQWdCLE9BQU8sSUFBSTtBQUFBLFFBQzFHLFVBQVUsS0FBSztBQUFBLFFBQ2YsY0FBYyxLQUFLO0FBQUEsUUFDbkIsZUFBZSxLQUFLO0FBQUEsTUFDckI7QUFBQSxJQUNELE9BQU87QUFDTixhQUFPLEtBQUssZUFBZSxZQUFZLDhCQUE4QjtBQUFBLElBQ3RFO0FBQUEsRUFDRDtBQUFBLEVBRVEsY0FBbUM7QUFDMUMsV0FBTztBQUFBLE1BQ04sV0FBVyxLQUFLLE1BQ2QsSUFBSSxXQUFTLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyx1QkFBdUIsVUFBVSxLQUFLLFFBQVEsRUFBRSxFQUFFLEVBQzdGLE9BQU8sQ0FBQyxFQUFFLGdCQUFnQixNQUFNLG9CQUFvQixNQUFTLEVBQzdELElBQUksQ0FBQyxFQUFFLE1BQU0sZ0JBQWdCLE9BQU87QUFBQSxRQUNwQyxPQUFPLEtBQUssWUFBWTtBQUFBLFFBQ3hCLEdBQUcsZ0JBQWlCLFlBQVk7QUFBQSxNQUNqQyxFQUFFO0FBQUEsTUFDSCxLQUFLLEtBQUssc0JBQXNCLElBQUksVUFBUSxLQUFLLE1BQU0sUUFBUSxJQUFJLENBQUM7QUFBQSxJQUNyRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsYUFBYSxPQUEyQztBQUNyRSxRQUFJLE1BQU0sVUFBVSxRQUFRO0FBQzNCLFlBQU0sOEJBQStELENBQUM7QUFHdEUsaUJBQVcsNEJBQTRCLE1BQU0sV0FBVztBQUN2RCxvQ0FBNEIsS0FBSyxLQUFLLDBCQUEwQix3QkFBd0IsQ0FBQztBQUFBLE1BQzFGO0FBR0EsWUFBTSxRQUFRLFdBQVcsMkJBQTJCO0FBR3BELFVBQUksTUFBTSxJQUFJLFdBQVcsS0FBSyxNQUFNLFFBQVE7QUFDM0MsYUFBSyx3QkFBd0IsTUFBTSxJQUFJLElBQUksV0FBUyxLQUFLLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDdEUsT0FBTztBQUNOLGFBQUssd0JBQXdCLENBQUMsR0FBRyxLQUFLLEtBQUs7QUFBQSxNQUM1QztBQUdBLFlBQU0sUUFBUSxXQUFXLEtBQUssTUFBTSxJQUFJLFVBQVEsS0FBSyxTQUFTLENBQUM7QUFBQSxJQUNoRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUkscUJBQThCO0FBQ2pDLFdBQU8sS0FBSyxNQUFNLEtBQUssVUFBUSxLQUFLLGtCQUFrQjtBQUFBLEVBQ3ZEO0FBQUEsRUFFUSx3QkFBd0IsR0FBbUM7QUFDbEUsUUFBSSxFQUFFLFlBQVksRUFBRSxVQUFVLGFBQWEsV0FBVztBQUNyRCxXQUFLLGNBQWMsRUFBRSxLQUFLO0FBRTFCLFlBQU0sUUFBUSxLQUFLLFVBQVU7QUFDN0IsVUFBSSxPQUFPO0FBQ1YsYUFBSyxXQUFXLEtBQUs7QUFBQSxNQUN0QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFdBQVcsT0FBd0Q7QUFPaEYsZUFBVyxRQUFRLEtBQUssT0FBTztBQUM5QixVQUFJLFNBQVMsS0FBSyxVQUFVO0FBQzNCO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFNBQVMsS0FBSyxVQUFVLFlBQVksb0JBQW9CLEdBQUc7QUFDckUsY0FBTSxNQUFNLGdCQUFnQixFQUFFLG1CQUFtQixNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQUEsTUFDckU7QUFFQSxZQUFNLFNBQVUsS0FBeUMsTUFBTTtBQUMvRCxVQUFJLENBQUMsUUFBUTtBQUNaLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUdBLFFBQUksVUFBVSxTQUFTO0FBQ3RCLFlBQU0sS0FBSyxhQUFhLEtBQUs7QUFBQSxJQUM5QjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFVQSxlQUFlLE1BQWlDO0FBQy9DLFVBQU0sYUFBcUM7QUFBQSxNQUMxQyxJQUFJLGFBQWE7QUFBQSxNQUNqQjtBQUFBLE1BQ0EsTUFBTSxLQUFLLFNBQVMsWUFBWTtBQUFBLE1BQ2hDLFdBQVcsS0FBSyxZQUFZO0FBQUEsSUFDN0I7QUFFQSxTQUFLLGtCQUFrQixLQUFLLFVBQVU7QUFFdEMsU0FBSyxnQkFBZ0I7QUFFckIsV0FBTztBQUFBLE1BQ04sSUFBSSxXQUFXO0FBQUEsTUFDZixNQUFNLFdBQVc7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGlCQUFzQztBQUNyQyxXQUFPLEtBQUssa0JBQWtCLElBQUksaUJBQWUsRUFBRSxJQUFJLFdBQVcsSUFBSSxNQUFNLFdBQVcsS0FBSyxFQUFFO0FBQUEsRUFDL0Y7QUFBQSxFQUVBLGlCQUFpQixZQUFxQztBQUNyRCxVQUFNLFFBQVEsS0FBSyxrQkFBa0IsVUFBVTtBQUMvQyxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLFdBQUssa0JBQWtCLE9BQU8sT0FBTyxDQUFDO0FBRXRDLFdBQUssZ0JBQWdCO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGdCQUFnQixZQUF5QyxTQUFzRDtBQUNwSCxRQUFJO0FBQ0osUUFBSSxlQUFlLFNBQVM7QUFDM0Isd0JBQWtCO0FBQUEsSUFDbkIsT0FBTztBQUNOLHdCQUFrQixLQUFLLGtCQUFrQixLQUFLLGtCQUFrQixVQUFVLEtBQUssRUFBRTtBQUFBLElBQ2xGO0FBRUEsUUFBSSxDQUFDLGlCQUFpQjtBQUNyQixhQUFPO0FBQUEsSUFDUjtBQU1BLFVBQU0sVUFBVSxNQUFNLEtBQUssV0FBVyxvQkFBb0IsVUFBVSxrQkFBa0IsZ0JBQWdCLFNBQVM7QUFDL0csUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sS0FBSyxTQUFTLFdBQVcsb0JBQW9CLFVBQVUsa0JBQWtCLGdCQUFnQixNQUFNLE9BQU87QUFHNUcsUUFBSSxDQUFDLFNBQVMsZUFBZTtBQUM1QixZQUFNLHVCQUF1QixLQUFLLHNCQUFzQixHQUFHLENBQUM7QUFDNUQsVUFBSSxzQkFBc0I7QUFDekIsY0FBTSxxQkFBcUI7QUFDM0IsNkJBQXFCLFlBQVksTUFBTTtBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxrQkFBa0IsWUFBbUQ7QUFDNUUsYUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLGtCQUFrQixRQUFRLEtBQUs7QUFDdkQsVUFBSSxLQUFLLGtCQUFrQixDQUFDLEVBQUUsT0FBTyxXQUFXLElBQUk7QUFDbkQsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGtCQUF3QjtBQUMvQixTQUFLLGVBQWUsTUFBTSxZQUFZLGlDQUFpQyxLQUFLLFVBQVUsS0FBSyxpQkFBaUIsR0FBRyxhQUFhLFdBQVcsY0FBYyxPQUFPO0FBQUEsRUFDN0o7QUFBQTtBQUFBO0FBQUEsRUFrQ0EsSUFBSSxjQUFnQztBQUNuQyxXQUFPLEtBQUssV0FBVztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxJQUFJLFlBQThCO0FBQ2pDLFdBQU8sS0FBSyxXQUFXO0FBQUEsRUFDeEI7QUFBQSxFQUVBLElBQUksU0FBNkI7QUFDaEMsV0FBTyxLQUFLLFVBQVU7QUFBQSxFQUN2QjtBQUFBLEVBRUEsSUFBSSxRQUFnQjtBQUNuQixXQUFPLEtBQUssT0FBTztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxVQUFVLFFBQVEsWUFBWSxlQUFtQztBQUNoRSxRQUFJLEtBQUssT0FBTyxPQUFPLEdBQUc7QUFDekIsVUFBSTtBQUNKLGNBQVEsT0FBTztBQUFBLFFBQ2QsS0FBSyxZQUFZO0FBQUE7QUFBQSxRQUNqQixLQUFLLFlBQVk7QUFDaEIsa0JBQVEsS0FBSztBQUNiO0FBQUEsUUFDRCxLQUFLLFlBQVk7QUFDaEIsa0JBQVEsU0FBUyxDQUFDLEdBQUcsS0FBSyx1QkFBdUIsR0FBRyxLQUFLLEtBQUssQ0FBQztBQUMvRDtBQUFBLE1BQ0Y7QUFFQSxhQUFPLE1BQU0sUUFBUSxVQUFRLEtBQUssVUFBVSxLQUFLLENBQUM7QUFBQSxJQUNuRDtBQUVBLFdBQU8sS0FBSyxTQUFTLFVBQVUsS0FBSztBQUFBLEVBQ3JDO0FBQUEsRUFFQSxTQUFTLFlBQTJEO0FBQ25FLFFBQUksS0FBSyxPQUFPLE9BQU8sR0FBRztBQUN6QixpQkFBVyxRQUFRLEtBQUssUUFBUTtBQUMvQixjQUFNLFFBQVEsS0FBSyxTQUFTLFVBQVU7QUFDdEMsWUFBSSxPQUFPO0FBQ1YsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLEtBQUssU0FBUyxTQUFTLFVBQVU7QUFBQSxFQUN6QztBQUFBLEVBRVEsZ0JBQWdCLE9BQTZEO0FBQ3BGLFFBQUk7QUFDSixRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGtCQUFZLEtBQUssU0FBUyxLQUFLO0FBQUEsSUFDaEMsT0FBTztBQUNOLGtCQUFZO0FBQUEsSUFDYjtBQUVBLFFBQUksQ0FBQyxXQUFXO0FBQ2YsWUFBTSxJQUFJLE1BQU0sZ0NBQWdDO0FBQUEsSUFDakQ7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYyxPQUE2RDtBQUMxRSxXQUFPLEtBQUssUUFBUSxLQUFLLEVBQUUsY0FBYyxLQUFLO0FBQUEsRUFDL0M7QUFBQSxFQUVBLFFBQVEsT0FBOEU7QUFDckYsV0FBTyxLQUFLLFFBQVEsS0FBSyxFQUFFLFFBQVEsS0FBSztBQUFBLEVBQ3pDO0FBQUEsRUFFQSxRQUFRLE9BQTJDLE1BQStDO0FBQ2pHLFNBQUssUUFBUSxLQUFLLEVBQUUsUUFBUSxPQUFPLElBQUk7QUFBQSxFQUN4QztBQUFBLEVBRUEsY0FBYyxhQUFnQyxRQUE0QyxLQUFLLFdBQVcsYUFBbUI7QUFDNUgsU0FBSyxRQUFRLEtBQUssRUFBRSxjQUFjLGFBQWEsS0FBSztBQUFBLEVBQ3JEO0FBQUEsRUFFQSxvQkFBb0IsUUFBNEMsS0FBSyxXQUFXLGFBQW1CO0FBQ2xHLFNBQUssUUFBUSxLQUFLLEVBQUUsb0JBQW9CLEtBQUs7QUFBQSxFQUM5QztBQUFBLEVBRUEsa0JBQWtCLFFBQTRDLEtBQUssV0FBVyxhQUFtQjtBQUNoRyxTQUFLLFFBQVEsS0FBSyxFQUFFLGtCQUFrQixLQUFLO0FBQUEsRUFDNUM7QUFBQSxFQUVBLGFBQWEsT0FBNkQ7QUFDekUsV0FBTyxLQUFLLFFBQVEsS0FBSyxFQUFFLGFBQWEsS0FBSztBQUFBLEVBQzlDO0FBQUEsRUFFQSxZQUFZLFFBQWlDO0FBQzVDLFNBQUssV0FBVyxZQUFZLE1BQU07QUFBQSxFQUNuQztBQUFBLEVBRUEsWUFBK0I7QUFDOUIsV0FBTyxLQUFLLFdBQVcsVUFBVTtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxJQUFJLGNBQWM7QUFDakIsV0FBTyxLQUFLLFdBQVc7QUFBQSxFQUN4QjtBQUFBLEVBRUEsb0JBQW9CLGFBQXFDO0FBQ3hELFNBQUssV0FBVyxvQkFBb0IsV0FBVztBQUFBLEVBQ2hEO0FBQUEsRUFFQSxVQUFVLE9BQXdCLFNBQTZDLEtBQUssYUFBYSxNQUE4QztBQUM5SSxVQUFNLGFBQWEsS0FBSyxRQUFRLE1BQU07QUFDdEMsUUFBSSxLQUFLLE9BQU8sT0FBTyxHQUFHO0FBQ3pCLFlBQU0sU0FBUyxLQUFLLFVBQVUsWUFBWSxlQUFlO0FBR3pELFVBQUksTUFBTSxhQUFhLGNBQWMsU0FBUyxNQUFNLGFBQWEsY0FBYyxNQUFNO0FBQ3BGLGVBQU8sTUFBTSxhQUFhLGNBQWMsUUFBUSxPQUFPLENBQUMsSUFBSSxPQUFPLE9BQU8sU0FBUyxDQUFDO0FBQUEsTUFDckY7QUFHQSxZQUFNLFFBQVEsV0FBVyxVQUFVLE9BQU8sUUFBUSxLQUFLO0FBQ3ZELFVBQUksT0FBTztBQUNWLGVBQU87QUFBQSxNQUNSO0FBR0EsVUFBSSxNQUFNLGFBQWEsY0FBYyxRQUFRLE1BQU0sYUFBYSxjQUFjLFVBQVU7QUFDdkYsY0FBTSxjQUFjLEtBQUssZ0JBQWdCLE1BQU07QUFDL0MsY0FBTSxRQUFRLE9BQU8sUUFBUSxXQUFXO0FBRXhDLFlBQUksTUFBTSxhQUFhLGNBQWMsTUFBTTtBQUMxQyxjQUFJLFlBQTBDLE9BQU8sUUFBUSxDQUFDO0FBQzlELGNBQUksQ0FBQyxhQUFhLE1BQU07QUFDdkIsd0JBQVksT0FBTyxDQUFDO0FBQUEsVUFDckI7QUFFQSxpQkFBTztBQUFBLFFBQ1IsT0FBTztBQUNOLGNBQUksZ0JBQThDLE9BQU8sUUFBUSxDQUFDO0FBQ2xFLGNBQUksQ0FBQyxpQkFBaUIsTUFBTTtBQUMzQiw0QkFBZ0IsT0FBTyxPQUFPLFNBQVMsQ0FBQztBQUFBLFVBQ3pDO0FBRUEsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLFdBQVcsVUFBVSxPQUFPLFFBQVEsSUFBSTtBQUFBLEVBQ2hEO0FBQUEsRUFFQSxTQUFTLFVBQThDLFdBQTZDO0FBQ25HLFdBQU8sS0FBSyxRQUFRLFFBQVEsRUFBRSxTQUFTLFVBQVUsU0FBUztBQUFBLEVBQzNEO0FBQUEsRUFFQSxZQUFZLE9BQWlEO0FBQzVELFNBQUssUUFBUSxLQUFLLEVBQUUsWUFBWSxLQUFLO0FBQUEsRUFDdEM7QUFBQSxFQUVBLFVBQVUsT0FBMkMsVUFBOEMsV0FBNkM7QUFDL0ksV0FBTyxLQUFLLFFBQVEsS0FBSyxFQUFFLFVBQVUsT0FBTyxVQUFVLFNBQVM7QUFBQSxFQUNoRTtBQUFBLEVBRUEsV0FBVyxPQUEyQyxRQUE0QyxTQUF1QztBQUN4SSxXQUFPLEtBQUssUUFBUSxLQUFLLEVBQUUsV0FBVyxPQUFPLFFBQVEsT0FBTztBQUFBLEVBQzdEO0FBQUEsRUFFQSxlQUFlLFFBQTRDLFNBQXVDO0FBQ2pHLFdBQU8sS0FBSyxXQUFXLGVBQWUsUUFBUSxPQUFPO0FBQUEsRUFDdEQ7QUFBQSxFQUVBLFVBQVUsT0FBMkMsVUFBOEMsV0FBNkM7QUFDL0ksV0FBTyxLQUFLLFFBQVEsS0FBSyxFQUFFLFVBQVUsT0FBTyxVQUFVLFNBQVM7QUFBQSxFQUNoRTtBQUFBLEVBRUEsdUJBQXVCLFdBQXdCLFVBQWtEO0FBQ2hHLFdBQU8sS0FBSyxRQUFRLFNBQVMsRUFBRSx1QkFBdUIsV0FBVyxRQUFRO0FBQUEsRUFDMUU7QUFBQSxFQVNRLG9DQUEwQztBQUNqRCxTQUFLLFVBQVUsS0FBSyx1QkFBdUIsTUFBTSxLQUFLLHdCQUF3QixDQUFDLENBQUM7QUFDaEYsU0FBSyxPQUFPLFFBQVEsV0FBUyxLQUFLLDBDQUEwQyxLQUFLLENBQUM7QUFDbEYsU0FBSyxVQUFVLEtBQUssY0FBYyxXQUFTLEtBQUssMENBQTBDLEtBQUssQ0FBQyxDQUFDO0FBQ2pHLFNBQUssVUFBVSxLQUFLLGlCQUFpQixXQUFTO0FBQzdDLFdBQUssa0JBQWtCLE9BQU8sTUFBTSxFQUFFO0FBQ3RDLFdBQUssc0JBQXNCLE9BQU8sTUFBTSxFQUFFO0FBQzFDLFdBQUssOEJBQThCLGlCQUFpQixNQUFNLEVBQUU7QUFBQSxJQUM3RCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSwwQkFBZ0M7QUFDdkMsVUFBTSwrQkFBK0IsS0FBSyxrQkFBa0IsSUFBSSxLQUFLLFlBQVksRUFBRTtBQUNuRixRQUFJLENBQUMsOEJBQThCO0FBQ2xDO0FBQUEsSUFDRDtBQUVBLGVBQVcsQ0FBQyxLQUFLLGdCQUFnQixLQUFLLEtBQUssbUJBQW1CO0FBQzdELFlBQU0sbUJBQW1CLDZCQUE2QixJQUFJLEdBQUc7QUFDN0QsVUFBSSxrQkFBa0I7QUFDckIseUJBQWlCLElBQUksaUJBQWlCLElBQUksQ0FBQztBQUFBLE1BQzVDLE9BQU87QUFDTix5QkFBaUIsTUFBTTtBQUFBLE1BQ3hCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLEtBQWdDLFlBQThCLE9BQXlDO0FBR3RHLFFBQUksbUJBQW1CLEtBQUssa0JBQWtCLElBQUksV0FBVyxHQUFHO0FBQ2hFLFFBQUksQ0FBQyxrQkFBa0I7QUFDdEIseUJBQW1CLFdBQVcsT0FBTyxLQUFLLGlCQUFpQjtBQUMzRCxXQUFLLGtCQUFrQixJQUFJLFdBQVcsS0FBSyxnQkFBZ0I7QUFBQSxJQUM1RDtBQUdBLFFBQUkseUJBQXlCLEtBQUssa0JBQWtCLElBQUksTUFBTSxFQUFFO0FBQ2hFLFFBQUksQ0FBQyx3QkFBd0I7QUFDNUIsK0JBQXlCLG9CQUFJLElBQTBDO0FBQ3ZFLFdBQUssa0JBQWtCLElBQUksTUFBTSxJQUFJLHNCQUFzQjtBQUFBLElBQzVEO0FBQ0EsUUFBSSxtQkFBbUIsdUJBQXVCLElBQUksV0FBVyxHQUFHO0FBQ2hFLFFBQUksQ0FBQyxrQkFBa0I7QUFDdEIseUJBQW1CLFdBQVcsT0FBTyxNQUFNLHVCQUF1QjtBQUNsRSw2QkFBdUIsSUFBSSxXQUFXLEtBQUssZ0JBQWdCO0FBQUEsSUFDNUQ7QUFFQSxVQUFNLE9BQU87QUFDYixXQUFPO0FBQUEsTUFDTixNQUFxQjtBQUNwQixlQUFPLGlCQUFpQixJQUFJO0FBQUEsTUFDN0I7QUFBQSxNQUNBLElBQUksT0FBZ0I7QUFDbkIsWUFBSSxLQUFLLGdCQUFnQixPQUFPO0FBQy9CLDJCQUFpQixJQUFJLEtBQUs7QUFBQSxRQUMzQjtBQUNBLHlCQUFpQixJQUFJLEtBQUs7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsUUFBYztBQUNiLFlBQUksS0FBSyxnQkFBZ0IsT0FBTztBQUMvQiwyQkFBaUIsTUFBTTtBQUFBLFFBQ3hCO0FBQ0EseUJBQWlCLE1BQU07QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFLQSwyQkFBc0QsVUFBMEQ7QUFDL0csUUFBSSxLQUFLLG9CQUFvQixJQUFJLFNBQVMsV0FBVyxHQUFHLEtBQUssS0FBSyxrQkFBa0IsSUFBSSxTQUFTLFdBQVcsR0FBRyxHQUFHO0FBQ2pILFlBQU0sSUFBSSxNQUFNLGtDQUFrQyxTQUFTLFdBQVcsR0FBRyxrQkFBa0I7QUFBQSxJQUM1RjtBQUVBLFNBQUssb0JBQW9CLElBQUksU0FBUyxXQUFXLEtBQUssUUFBUTtBQUU5RCxVQUFNLHlCQUF5QixNQUFNO0FBQ3BDLGlCQUFXLFNBQVMsS0FBSyxRQUFRO0FBQ2hDLGFBQUssMkJBQTJCLE9BQU8sUUFBUTtBQUFBLE1BQ2hEO0FBQUEsSUFDRDtBQUdBLDJCQUF1QjtBQUN2QixVQUFNLGNBQWMsU0FBUyxjQUFjLE1BQU0sdUJBQXVCLENBQUM7QUFFekUsV0FBTyxhQUFhLE1BQU07QUFDekIsbUJBQWEsUUFBUTtBQUVyQixXQUFLLGtCQUFrQixPQUFPLFNBQVMsV0FBVyxHQUFHO0FBQ3JELFdBQUssa0JBQWtCLFFBQVEsdUJBQXFCLGtCQUFrQixPQUFPLFNBQVMsV0FBVyxHQUFHLENBQUM7QUFFckcsV0FBSyxvQkFBb0IsT0FBTyxTQUFTLFdBQVcsR0FBRztBQUN2RCxXQUFLLHNCQUFzQixRQUFRLDJCQUF5QixzQkFBc0IsT0FBTyxTQUFTLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDbEgsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUdRLDBDQUEwQyxPQUErQjtBQUdoRixVQUFNLGFBQWEsTUFBTSx3QkFBd0IsTUFBTTtBQUN0RCxpQkFBVyxzQkFBc0IsS0FBSyxvQkFBb0IsT0FBTyxHQUFHO0FBQ25FLGFBQUssMkJBQTJCLE9BQU8sa0JBQWtCO0FBQUEsTUFDMUQ7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLDhCQUE4QixJQUFJLE1BQU0sSUFBSSxVQUFVO0FBQUEsRUFDNUQ7QUFBQSxFQUVRLDJCQUFzRCxPQUF5QixVQUFtRDtBQU16SSxRQUFJLDZCQUE2QixLQUFLLHNCQUFzQixJQUFJLE1BQU0sRUFBRTtBQUN4RSxRQUFJLENBQUMsNEJBQTRCO0FBQ2hDLG1DQUE2QixvQkFBSSxJQUF5QjtBQUMxRCxXQUFLLHNCQUFzQixJQUFJLE1BQU0sSUFBSSwwQkFBMEI7QUFBQSxJQUNwRTtBQUVBLFFBQUksNkJBQTZCLDJCQUEyQixJQUFJLFNBQVMsV0FBVyxHQUFHO0FBQ3ZGLFFBQUksQ0FBQyw0QkFBNEI7QUFDaEMsbUNBQTZCLEtBQUssS0FBSyxTQUFTLFlBQVksS0FBSztBQUNqRSxpQ0FBMkIsSUFBSSxTQUFTLFdBQVcsS0FBSywwQkFBMEI7QUFBQSxJQUNuRjtBQUdBLCtCQUEyQixJQUFJLFNBQVMsd0JBQXdCLEtBQUssQ0FBQztBQUFBLEVBQ3ZFO0FBQUE7QUFBQTtBQUFBLEVBTUEsSUFBSSxjQUFjO0FBQUUsV0FBTyxLQUFLLFNBQVM7QUFBQSxFQUFhO0FBQUEsRUFDdEQsSUFBSSwrQkFBK0I7QUFBRSxXQUFPLEtBQUssU0FBUztBQUFBLEVBQThCO0FBQUEsRUFFeEYsbUJBQW1CLFNBQXVEO0FBQ3pFLFdBQU8sS0FBSyxTQUFTLG1CQUFtQixPQUFPO0FBQUEsRUFDaEQ7QUFBQTtBQUdEO0FBQUE7QUFBQTtBQWw5QmEsWUFxV1ksb0NBQW9DO0FBcldoRCxZQXNXWSxpQ0FBaUM7QUFBQTtBQUFBO0FBdFc3QyxZQXFoQlksa0NBQWtDO0FBcmhCOUMsY0FBTjtBQUFBLEVBY0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FsQlU7QUFvOUJiLGtCQUFrQixzQkFBc0IsYUFBYSxrQkFBa0IsS0FBSzsiLAogICJuYW1lcyI6IFsibWFpblBhcnRJbnN0YW50aWF0aW9uU2VydmljZSIsICJwYXJ0Il0KfQo=
