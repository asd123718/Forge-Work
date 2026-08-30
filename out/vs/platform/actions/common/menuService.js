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
import { RunOnceScheduler } from "../../../base/common/async.js";
import { DebounceEmitter, Emitter } from "../../../base/common/event.js";
import { DisposableStore, Disposable } from "../../../base/common/lifecycle.js";
import { isIMenuItem, isISubmenuItem, MenuItemAction, MenuRegistry, SubmenuItemAction } from "./actions.js";
import { ICommandService } from "../../commands/common/commands.js";
import { IContextKeyService } from "../../contextkey/common/contextkey.js";
import { Separator, toAction } from "../../../base/common/actions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { removeFastWithoutKeepingOrder } from "../../../base/common/arrays.js";
import { localize } from "../../../nls.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
let MenuService = class extends Disposable {
  constructor(_commandService, _keybindingService, storageService) {
    super();
    this._commandService = _commandService;
    this._keybindingService = _keybindingService;
    this._hiddenStates = this._register(new PersistedMenuHideState(storageService));
  }
  createMenu(id, contextKeyService, options) {
    return new MenuImpl(id, this._hiddenStates, { emitEventsForSubmenuChanges: false, eventDebounceDelay: 50, ...options }, this._commandService, this._keybindingService, contextKeyService);
  }
  getMenuActions(id, contextKeyService, options) {
    const menu = new MenuImpl(id, this._hiddenStates, { emitEventsForSubmenuChanges: false, eventDebounceDelay: 50, ...options }, this._commandService, this._keybindingService, contextKeyService);
    const actions = menu.getActions(options);
    menu.dispose();
    return actions;
  }
  getMenuContexts(id) {
    const menuInfo = new MenuInfoSnapshot(id, false);
    return /* @__PURE__ */ new Set([...menuInfo.structureContextKeys, ...menuInfo.preconditionContextKeys, ...menuInfo.toggledContextKeys]);
  }
  resetHiddenStates(ids) {
    this._hiddenStates.reset(ids);
  }
};
MenuService = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IStorageService)
], MenuService);
let PersistedMenuHideState = class {
  constructor(_storageService) {
    this._storageService = _storageService;
    this._disposables = new DisposableStore();
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._ignoreChangeEvent = false;
    this._hiddenByDefaultCache = /* @__PURE__ */ new Map();
    try {
      const raw = _storageService.get(PersistedMenuHideState._key, StorageScope.PROFILE, "{}");
      this._data = JSON.parse(raw);
    } catch (err) {
      this._data = /* @__PURE__ */ Object.create(null);
    }
    this._disposables.add(_storageService.onDidChangeValue(StorageScope.PROFILE, PersistedMenuHideState._key, this._disposables)(() => {
      if (!this._ignoreChangeEvent) {
        try {
          const raw = _storageService.get(PersistedMenuHideState._key, StorageScope.PROFILE, "{}");
          this._data = JSON.parse(raw);
        } catch (err) {
          console.log("FAILED to read storage after UPDATE", err);
        }
      }
      this._onDidChange.fire();
    }));
  }
  dispose() {
    this._onDidChange.dispose();
    this._disposables.dispose();
  }
  _isHiddenByDefault(menu, commandId) {
    return this._hiddenByDefaultCache.get(`${menu.id}/${commandId}`) ?? false;
  }
  setDefaultState(menu, commandId, hidden) {
    this._hiddenByDefaultCache.set(`${menu.id}/${commandId}`, hidden);
  }
  isHidden(menu, commandId) {
    const hiddenByDefault = this._isHiddenByDefault(menu, commandId);
    const state = this._data[menu.id]?.includes(commandId) ?? false;
    return hiddenByDefault ? !state : state;
  }
  updateHidden(menu, commandId, hidden) {
    const hiddenByDefault = this._isHiddenByDefault(menu, commandId);
    if (hiddenByDefault) {
      hidden = !hidden;
    }
    const entries = this._data[menu.id];
    if (!hidden) {
      if (entries) {
        const idx = entries.indexOf(commandId);
        if (idx >= 0) {
          removeFastWithoutKeepingOrder(entries, idx);
        }
        if (entries.length === 0) {
          delete this._data[menu.id];
        }
      }
    } else {
      if (!entries) {
        this._data[menu.id] = [commandId];
      } else {
        const idx = entries.indexOf(commandId);
        if (idx < 0) {
          entries.push(commandId);
        }
      }
    }
    this._persist();
  }
  reset(menus) {
    if (menus === void 0) {
      this._data = /* @__PURE__ */ Object.create(null);
      this._persist();
    } else {
      for (const { id } of menus) {
        if (this._data[id]) {
          delete this._data[id];
        }
      }
      this._persist();
    }
  }
  _persist() {
    try {
      this._ignoreChangeEvent = true;
      const raw = JSON.stringify(this._data);
      this._storageService.store(PersistedMenuHideState._key, raw, StorageScope.PROFILE, StorageTarget.USER);
    } finally {
      this._ignoreChangeEvent = false;
    }
  }
};
PersistedMenuHideState._key = "menu.hiddenCommands";
PersistedMenuHideState = __decorateClass([
  __decorateParam(0, IStorageService)
], PersistedMenuHideState);
class MenuInfoSnapshot {
  constructor(_id, _collectContextKeysForSubmenus) {
    this._id = _id;
    this._collectContextKeysForSubmenus = _collectContextKeysForSubmenus;
    this._menuGroups = [];
    this._allMenuIds = /* @__PURE__ */ new Set();
    this._structureContextKeys = /* @__PURE__ */ new Set();
    this._preconditionContextKeys = /* @__PURE__ */ new Set();
    this._toggledContextKeys = /* @__PURE__ */ new Set();
    this.refresh();
  }
  get allMenuIds() {
    return this._allMenuIds;
  }
  get structureContextKeys() {
    return this._structureContextKeys;
  }
  get preconditionContextKeys() {
    return this._preconditionContextKeys;
  }
  get toggledContextKeys() {
    return this._toggledContextKeys;
  }
  refresh() {
    this._menuGroups.length = 0;
    this._allMenuIds.clear();
    this._structureContextKeys.clear();
    this._preconditionContextKeys.clear();
    this._toggledContextKeys.clear();
    const menuItems = this._sort(MenuRegistry.getMenuItems(this._id));
    let group;
    for (const item of menuItems) {
      const groupName = item.group || "";
      if (!group || group[0] !== groupName) {
        group = [groupName, []];
        this._menuGroups.push(group);
      }
      group[1].push(item);
      this._collectContextKeysAndSubmenuIds(item);
    }
    this._allMenuIds.add(this._id);
  }
  _sort(menuItems) {
    return menuItems;
  }
  _collectContextKeysAndSubmenuIds(item) {
    MenuInfoSnapshot._fillInKbExprKeys(item.when, this._structureContextKeys);
    if (isIMenuItem(item)) {
      if (item.command.precondition) {
        MenuInfoSnapshot._fillInKbExprKeys(item.command.precondition, this._preconditionContextKeys);
      }
      if (item.command.toggled) {
        const toggledExpression = item.command.toggled.condition || item.command.toggled;
        MenuInfoSnapshot._fillInKbExprKeys(toggledExpression, this._toggledContextKeys);
      }
    } else if (this._collectContextKeysForSubmenus) {
      MenuRegistry.getMenuItems(item.submenu).forEach(this._collectContextKeysAndSubmenuIds, this);
      this._allMenuIds.add(item.submenu);
    }
  }
  static _fillInKbExprKeys(exp, set) {
    if (exp) {
      for (const key of exp.keys()) {
        set.add(key);
      }
    }
  }
}
let MenuInfo = class extends MenuInfoSnapshot {
  constructor(_id, _hiddenStates, _collectContextKeysForSubmenus, _commandService, _keybindingService, _contextKeyService) {
    super(_id, _collectContextKeysForSubmenus);
    this._hiddenStates = _hiddenStates;
    this._commandService = _commandService;
    this._keybindingService = _keybindingService;
    this._contextKeyService = _contextKeyService;
    this.refresh();
  }
  createActionGroups(options) {
    const result = [];
    for (const group of this._menuGroups) {
      const [id, items] = group;
      let activeActions;
      for (const item of items) {
        if (this._contextKeyService.contextMatchesRules(item.when)) {
          const isMenuItem = isIMenuItem(item);
          if (isMenuItem) {
            this._hiddenStates.setDefaultState(this._id, item.command.id, !!item.isHiddenByDefault);
          }
          const menuHide = createMenuHide(this._id, isMenuItem ? item.command : item, this._hiddenStates);
          if (isMenuItem) {
            const menuKeybinding = createConfigureKeybindingAction(this._commandService, this._keybindingService, item.command.id, item.when);
            (activeActions ??= []).push(new MenuItemAction(item.command, item.alt, options, menuHide, menuKeybinding, this._contextKeyService, this._commandService));
          } else {
            const groups = new MenuInfo(item.submenu, this._hiddenStates, this._collectContextKeysForSubmenus, this._commandService, this._keybindingService, this._contextKeyService).createActionGroups(options);
            const submenuActions = Separator.join(...groups.map((g) => g[1]));
            if (submenuActions.length > 0) {
              (activeActions ??= []).push(new SubmenuItemAction(item, menuHide, submenuActions));
            }
          }
        }
      }
      if (activeActions && activeActions.length > 0) {
        result.push([id, activeActions]);
      }
    }
    return result;
  }
  _sort(menuItems) {
    return menuItems.sort(MenuInfo._compareMenuItems);
  }
  static _compareMenuItems(a, b) {
    const aGroup = a.group;
    const bGroup = b.group;
    if (aGroup !== bGroup) {
      if (!aGroup) {
        return 1;
      } else if (!bGroup) {
        return -1;
      }
      if (aGroup === "navigation") {
        return -1;
      } else if (bGroup === "navigation") {
        return 1;
      }
      const value = aGroup.localeCompare(bGroup);
      if (value !== 0) {
        return value;
      }
    }
    const aPrio = a.order || 0;
    const bPrio = b.order || 0;
    if (aPrio < bPrio) {
      return -1;
    } else if (aPrio > bPrio) {
      return 1;
    }
    return MenuInfo._compareTitles(
      isIMenuItem(a) ? a.command.title : a.title,
      isIMenuItem(b) ? b.command.title : b.title
    );
  }
  static _compareTitles(a, b) {
    const aStr = typeof a === "string" ? a : a.original;
    const bStr = typeof b === "string" ? b : b.original;
    return aStr.localeCompare(bStr);
  }
};
MenuInfo = __decorateClass([
  __decorateParam(3, ICommandService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService)
], MenuInfo);
let MenuImpl = class {
  constructor(id, hiddenStates, options, commandService, keybindingService, contextKeyService) {
    this._disposables = new DisposableStore();
    this._menuInfo = new MenuInfo(id, hiddenStates, options.emitEventsForSubmenuChanges, commandService, keybindingService, contextKeyService);
    const rebuildMenuSoon = new RunOnceScheduler(() => {
      this._menuInfo.refresh();
      this._onDidChange.fire({ menu: this, isStructuralChange: true, isEnablementChange: true, isToggleChange: true });
    }, options.eventDebounceDelay);
    this._disposables.add(rebuildMenuSoon);
    this._disposables.add(MenuRegistry.onDidChangeMenu((e) => {
      for (const id2 of this._menuInfo.allMenuIds) {
        if (e.has(id2)) {
          rebuildMenuSoon.schedule();
          break;
        }
      }
    }));
    const lazyListener = this._disposables.add(new DisposableStore());
    const merge = (events) => {
      let isStructuralChange = false;
      let isEnablementChange = false;
      let isToggleChange = false;
      for (const item of events) {
        isStructuralChange = isStructuralChange || item.isStructuralChange;
        isEnablementChange = isEnablementChange || item.isEnablementChange;
        isToggleChange = isToggleChange || item.isToggleChange;
        if (isStructuralChange && isEnablementChange && isToggleChange) {
          break;
        }
      }
      return { menu: this, isStructuralChange, isEnablementChange, isToggleChange };
    };
    const startLazyListener = () => {
      lazyListener.add(contextKeyService.onDidChangeContext((e) => {
        const isStructuralChange = e.affectsSome(this._menuInfo.structureContextKeys);
        const isEnablementChange = e.affectsSome(this._menuInfo.preconditionContextKeys);
        const isToggleChange = e.affectsSome(this._menuInfo.toggledContextKeys);
        if (isStructuralChange || isEnablementChange || isToggleChange) {
          this._onDidChange.fire({ menu: this, isStructuralChange, isEnablementChange, isToggleChange });
        }
      }));
      lazyListener.add(hiddenStates.onDidChange((e) => {
        this._onDidChange.fire({ menu: this, isStructuralChange: true, isEnablementChange: false, isToggleChange: false });
      }));
    };
    this._onDidChange = new DebounceEmitter({
      // start/stop context key listener
      onWillAddFirstListener: startLazyListener,
      onDidRemoveLastListener: lazyListener.clear.bind(lazyListener),
      delay: options.eventDebounceDelay,
      merge
    });
    this.onDidChange = this._onDidChange.event;
  }
  getActions(options) {
    return this._menuInfo.createActionGroups(options);
  }
  dispose() {
    this._disposables.dispose();
    this._onDidChange.dispose();
  }
};
MenuImpl = __decorateClass([
  __decorateParam(3, ICommandService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService)
], MenuImpl);
function createMenuHide(menu, command, states) {
  const id = isISubmenuItem(command) ? command.submenu.id : command.id;
  const title = typeof command.title === "string" ? command.title : command.title.value;
  const hide = toAction({
    id: `hide/${menu.id}/${id}`,
    label: localize("hide.label", "Hide '{0}'", title),
    run() {
      states.updateHidden(menu, id, true);
    }
  });
  const toggle = toAction({
    id: `toggle/${menu.id}/${id}`,
    label: title,
    get checked() {
      return !states.isHidden(menu, id);
    },
    run() {
      states.updateHidden(menu, id, !!this.checked);
    }
  });
  return {
    hide,
    toggle,
    get isHidden() {
      return !toggle.checked;
    }
  };
}
function createConfigureKeybindingAction(commandService, keybindingService, commandId, when = void 0, enabled = true) {
  return toAction({
    id: `configureKeybinding/${commandId}`,
    label: localize("configure keybinding", "Configure Keybinding"),
    enabled,
    run() {
      const hasKeybinding = !!keybindingService.lookupKeybinding(commandId);
      const whenValue = !hasKeybinding && when ? when.serialize() : void 0;
      commandService.executeCommand("workbench.action.openGlobalKeybindings", `@command:${commandId}` + (whenValue ? ` +when:${whenValue}` : ""));
    }
  });
}
export {
  MenuService,
  createConfigureKeybindingAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uc1xcY29tbW9uXFxtZW51U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEZWJvdW5jZUVtaXR0ZXIsIEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTWVudSwgSU1lbnVBY3Rpb25PcHRpb25zLCBJTWVudUNoYW5nZUV2ZW50LCBJTWVudUNyZWF0ZU9wdGlvbnMsIElNZW51SXRlbSwgSU1lbnVJdGVtSGlkZSwgSU1lbnVTZXJ2aWNlLCBpc0lNZW51SXRlbSwgaXNJU3VibWVudUl0ZW0sIElTdWJtZW51SXRlbSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiwgTWVudVJlZ2lzdHJ5LCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvbiwgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwcmVzc2lvbiwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IsIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgcmVtb3ZlRmFzdFdpdGhvdXRLZWVwaW5nT3JkZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNZW51U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWVudVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpZGRlblN0YXRlczogUGVyc2lzdGVkTWVudUhpZGVTdGF0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9oaWRkZW5TdGF0ZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgUGVyc2lzdGVkTWVudUhpZGVTdGF0ZShzdG9yYWdlU2VydmljZSkpO1xuXHR9XG5cblx0Y3JlYXRlTWVudShpZDogTWVudUlkLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBvcHRpb25zPzogSU1lbnVDcmVhdGVPcHRpb25zKTogSU1lbnUge1xuXHRcdHJldHVybiBuZXcgTWVudUltcGwoaWQsIHRoaXMuX2hpZGRlblN0YXRlcywgeyBlbWl0RXZlbnRzRm9yU3VibWVudUNoYW5nZXM6IGZhbHNlLCBldmVudERlYm91bmNlRGVsYXk6IDUwLCAuLi5vcHRpb25zIH0sIHRoaXMuX2NvbW1hbmRTZXJ2aWNlLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0Z2V0TWVudUFjdGlvbnMoaWQ6IE1lbnVJZCwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgb3B0aW9ucz86IElNZW51QWN0aW9uT3B0aW9ucyk6IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdIHtcblx0XHRjb25zdCBtZW51ID0gbmV3IE1lbnVJbXBsKGlkLCB0aGlzLl9oaWRkZW5TdGF0ZXMsIHsgZW1pdEV2ZW50c0ZvclN1Ym1lbnVDaGFuZ2VzOiBmYWxzZSwgZXZlbnREZWJvdW5jZURlbGF5OiA1MCwgLi4ub3B0aW9ucyB9LCB0aGlzLl9jb21tYW5kU2VydmljZSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWVudS5nZXRBY3Rpb25zKG9wdGlvbnMpO1xuXHRcdG1lbnUuZGlzcG9zZSgpO1xuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0Z2V0TWVudUNvbnRleHRzKGlkOiBNZW51SWQpOiBSZWFkb25seVNldDxzdHJpbmc+IHtcblx0XHRjb25zdCBtZW51SW5mbyA9IG5ldyBNZW51SW5mb1NuYXBzaG90KGlkLCBmYWxzZSk7XG5cdFx0cmV0dXJuIG5ldyBTZXQ8c3RyaW5nPihbLi4ubWVudUluZm8uc3RydWN0dXJlQ29udGV4dEtleXMsIC4uLm1lbnVJbmZvLnByZWNvbmRpdGlvbkNvbnRleHRLZXlzLCAuLi5tZW51SW5mby50b2dnbGVkQ29udGV4dEtleXNdKTtcblx0fVxuXG5cdHJlc2V0SGlkZGVuU3RhdGVzKGlkcz86IE1lbnVJZFtdKTogdm9pZCB7XG5cdFx0dGhpcy5faGlkZGVuU3RhdGVzLnJlc2V0KGlkcyk7XG5cdH1cbn1cblxuY2xhc3MgUGVyc2lzdGVkTWVudUhpZGVTdGF0ZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfa2V5ID0gJ21lbnUuaGlkZGVuQ29tbWFuZHMnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX2lnbm9yZUNoYW5nZUV2ZW50OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2RhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdIHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIF9oaWRkZW5CeURlZmF1bHRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuXG5cdGNvbnN0cnVjdG9yKEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByYXcgPSBfc3RvcmFnZVNlcnZpY2UuZ2V0KFBlcnNpc3RlZE1lbnVIaWRlU3RhdGUuX2tleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICd7fScpO1xuXHRcdFx0dGhpcy5fZGF0YSA9IEpTT04ucGFyc2UocmF3KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2RhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChfc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgUGVyc2lzdGVkTWVudUhpZGVTdGF0ZS5fa2V5LCB0aGlzLl9kaXNwb3NhYmxlcykoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9pZ25vcmVDaGFuZ2VFdmVudCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJhdyA9IF9zdG9yYWdlU2VydmljZS5nZXQoUGVyc2lzdGVkTWVudUhpZGVTdGF0ZS5fa2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ3t9Jyk7XG5cdFx0XHRcdFx0dGhpcy5fZGF0YSA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ0ZBSUxFRCB0byByZWFkIHN0b3JhZ2UgYWZ0ZXIgVVBEQVRFJywgZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzSGlkZGVuQnlEZWZhdWx0KG1lbnU6IE1lbnVJZCwgY29tbWFuZElkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5faGlkZGVuQnlEZWZhdWx0Q2FjaGUuZ2V0KGAke21lbnUuaWR9LyR7Y29tbWFuZElkfWApID8/IGZhbHNlO1xuXHR9XG5cblx0c2V0RGVmYXVsdFN0YXRlKG1lbnU6IE1lbnVJZCwgY29tbWFuZElkOiBzdHJpbmcsIGhpZGRlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2hpZGRlbkJ5RGVmYXVsdENhY2hlLnNldChgJHttZW51LmlkfS8ke2NvbW1hbmRJZH1gLCBoaWRkZW4pO1xuXHR9XG5cblx0aXNIaWRkZW4obWVudTogTWVudUlkLCBjb21tYW5kSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGhpZGRlbkJ5RGVmYXVsdCA9IHRoaXMuX2lzSGlkZGVuQnlEZWZhdWx0KG1lbnUsIGNvbW1hbmRJZCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9kYXRhW21lbnUuaWRdPy5pbmNsdWRlcyhjb21tYW5kSWQpID8/IGZhbHNlO1xuXHRcdHJldHVybiBoaWRkZW5CeURlZmF1bHQgPyAhc3RhdGUgOiBzdGF0ZTtcblx0fVxuXG5cdHVwZGF0ZUhpZGRlbihtZW51OiBNZW51SWQsIGNvbW1hbmRJZDogc3RyaW5nLCBoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBoaWRkZW5CeURlZmF1bHQgPSB0aGlzLl9pc0hpZGRlbkJ5RGVmYXVsdChtZW51LCBjb21tYW5kSWQpO1xuXHRcdGlmIChoaWRkZW5CeURlZmF1bHQpIHtcblx0XHRcdGhpZGRlbiA9ICFoaWRkZW47XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLl9kYXRhW21lbnUuaWRdO1xuXHRcdGlmICghaGlkZGVuKSB7XG5cdFx0XHQvLyByZW1vdmUgYW5kIGNsZWFudXBcblx0XHRcdGlmIChlbnRyaWVzKSB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGVudHJpZXMuaW5kZXhPZihjb21tYW5kSWQpO1xuXHRcdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0XHRyZW1vdmVGYXN0V2l0aG91dEtlZXBpbmdPcmRlcihlbnRyaWVzLCBpZHgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9kYXRhW21lbnUuaWRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGFkZCB1bmxlc3MgYWxyZWFkeSBhZGRlZFxuXHRcdFx0aWYgKCFlbnRyaWVzKSB7XG5cdFx0XHRcdHRoaXMuX2RhdGFbbWVudS5pZF0gPSBbY29tbWFuZElkXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGVudHJpZXMuaW5kZXhPZihjb21tYW5kSWQpO1xuXHRcdFx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChjb21tYW5kSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3BlcnNpc3QoKTtcblx0fVxuXG5cdHJlc2V0KG1lbnVzPzogTWVudUlkW10pOiB2b2lkIHtcblx0XHRpZiAobWVudXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gcmVzZXQgYWxsXG5cdFx0XHR0aGlzLl9kYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdHRoaXMuX3BlcnNpc3QoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gcmVzZXQgb25seSBmb3IgYSBzcGVjaWZpYyBtZW51XG5cdFx0XHRmb3IgKGNvbnN0IHsgaWQgfSBvZiBtZW51cykge1xuXHRcdFx0XHRpZiAodGhpcy5fZGF0YVtpZF0pIHtcblx0XHRcdFx0XHRkZWxldGUgdGhpcy5fZGF0YVtpZF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3BlcnNpc3QoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wZXJzaXN0KCk6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pZ25vcmVDaGFuZ2VFdmVudCA9IHRydWU7XG5cdFx0XHRjb25zdCByYXcgPSBKU09OLnN0cmluZ2lmeSh0aGlzLl9kYXRhKTtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFBlcnNpc3RlZE1lbnVIaWRlU3RhdGUuX2tleSwgcmF3LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faWdub3JlQ2hhbmdlRXZlbnQgPSBmYWxzZTtcblx0XHR9XG5cdH1cbn1cblxudHlwZSBNZW51SXRlbUdyb3VwID0gW3N0cmluZywgQXJyYXk8SU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtPl07XG5cbmNsYXNzIE1lbnVJbmZvU25hcHNob3Qge1xuXHRwcm90ZWN0ZWQgX21lbnVHcm91cHM6IE1lbnVJdGVtR3JvdXBbXSA9IFtdO1xuXHRwcml2YXRlIF9hbGxNZW51SWRzOiBTZXQ8TWVudUlkPiA9IG5ldyBTZXQoKTtcblx0cHJpdmF0ZSBfc3RydWN0dXJlQ29udGV4dEtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRwcml2YXRlIF9wcmVjb25kaXRpb25Db250ZXh0S2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdHByaXZhdGUgX3RvZ2dsZWRDb250ZXh0S2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9pZDogTWVudUlkLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfY29sbGVjdENvbnRleHRLZXlzRm9yU3VibWVudXM6IGJvb2xlYW4sXG5cdCkge1xuXHRcdHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0Z2V0IGFsbE1lbnVJZHMoKTogUmVhZG9ubHlTZXQ8TWVudUlkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FsbE1lbnVJZHM7XG5cdH1cblxuXHRnZXQgc3RydWN0dXJlQ29udGV4dEtleXMoKTogUmVhZG9ubHlTZXQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0cnVjdHVyZUNvbnRleHRLZXlzO1xuXHR9XG5cblx0Z2V0IHByZWNvbmRpdGlvbkNvbnRleHRLZXlzKCk6IFJlYWRvbmx5U2V0PHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wcmVjb25kaXRpb25Db250ZXh0S2V5cztcblx0fVxuXG5cdGdldCB0b2dnbGVkQ29udGV4dEtleXMoKTogUmVhZG9ubHlTZXQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RvZ2dsZWRDb250ZXh0S2V5cztcblx0fVxuXG5cdHJlZnJlc2goKTogdm9pZCB7XG5cblx0XHQvLyByZXNldFxuXHRcdHRoaXMuX21lbnVHcm91cHMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9hbGxNZW51SWRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc3RydWN0dXJlQ29udGV4dEtleXMuY2xlYXIoKTtcblx0XHR0aGlzLl9wcmVjb25kaXRpb25Db250ZXh0S2V5cy5jbGVhcigpO1xuXHRcdHRoaXMuX3RvZ2dsZWRDb250ZXh0S2V5cy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgbWVudUl0ZW1zID0gdGhpcy5fc29ydChNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKHRoaXMuX2lkKSk7XG5cdFx0bGV0IGdyb3VwOiBNZW51SXRlbUdyb3VwIHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIG1lbnVJdGVtcykge1xuXHRcdFx0Ly8gZ3JvdXAgYnkgZ3JvdXBJZFxuXHRcdFx0Y29uc3QgZ3JvdXBOYW1lID0gaXRlbS5ncm91cCB8fCAnJztcblx0XHRcdGlmICghZ3JvdXAgfHwgZ3JvdXBbMF0gIT09IGdyb3VwTmFtZSkge1xuXHRcdFx0XHRncm91cCA9IFtncm91cE5hbWUsIFtdXTtcblx0XHRcdFx0dGhpcy5fbWVudUdyb3Vwcy5wdXNoKGdyb3VwKTtcblx0XHRcdH1cblx0XHRcdGdyb3VwWzFdLnB1c2goaXRlbSk7XG5cblx0XHRcdC8vIGtlZXAga2V5cyBhbmQgc3VibWVudSBpZHMgZm9yIGV2ZW50aW5nXG5cdFx0XHR0aGlzLl9jb2xsZWN0Q29udGV4dEtleXNBbmRTdWJtZW51SWRzKGl0ZW0pO1xuXHRcdH1cblx0XHR0aGlzLl9hbGxNZW51SWRzLmFkZCh0aGlzLl9pZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3NvcnQobWVudUl0ZW1zOiAoSU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtKVtdKSB7XG5cdFx0Ly8gbm8gc29ydGluZyBuZWVkZWQgaW4gc25hcHNob3Rcblx0XHRyZXR1cm4gbWVudUl0ZW1zO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGVjdENvbnRleHRLZXlzQW5kU3VibWVudUlkcyhpdGVtOiBJTWVudUl0ZW0gfCBJU3VibWVudUl0ZW0pOiB2b2lkIHtcblxuXHRcdE1lbnVJbmZvU25hcHNob3QuX2ZpbGxJbktiRXhwcktleXMoaXRlbS53aGVuLCB0aGlzLl9zdHJ1Y3R1cmVDb250ZXh0S2V5cyk7XG5cblx0XHRpZiAoaXNJTWVudUl0ZW0oaXRlbSkpIHtcblx0XHRcdC8vIGtlZXAgcHJlY29uZGl0aW9uIGtleXMgZm9yIGV2ZW50IGlmIGFwcGxpY2FibGVcblx0XHRcdGlmIChpdGVtLmNvbW1hbmQucHJlY29uZGl0aW9uKSB7XG5cdFx0XHRcdE1lbnVJbmZvU25hcHNob3QuX2ZpbGxJbktiRXhwcktleXMoaXRlbS5jb21tYW5kLnByZWNvbmRpdGlvbiwgdGhpcy5fcHJlY29uZGl0aW9uQ29udGV4dEtleXMpO1xuXHRcdFx0fVxuXHRcdFx0Ly8ga2VlcCB0b2dnbGVkIGtleXMgZm9yIGV2ZW50IGlmIGFwcGxpY2FibGVcblx0XHRcdGlmIChpdGVtLmNvbW1hbmQudG9nZ2xlZCkge1xuXHRcdFx0XHRjb25zdCB0b2dnbGVkRXhwcmVzc2lvbjogQ29udGV4dEtleUV4cHJlc3Npb24gPSAoaXRlbS5jb21tYW5kLnRvZ2dsZWQgYXMgeyBjb25kaXRpb246IENvbnRleHRLZXlFeHByZXNzaW9uIH0pLmNvbmRpdGlvbiB8fCBpdGVtLmNvbW1hbmQudG9nZ2xlZDtcblx0XHRcdFx0TWVudUluZm9TbmFwc2hvdC5fZmlsbEluS2JFeHByS2V5cyh0b2dnbGVkRXhwcmVzc2lvbiwgdGhpcy5fdG9nZ2xlZENvbnRleHRLZXlzKTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAodGhpcy5fY29sbGVjdENvbnRleHRLZXlzRm9yU3VibWVudXMpIHtcblx0XHRcdC8vIHJlY3Vyc2l2ZWx5IGNvbGxlY3QgY29udGV4dCBrZXlzIGZyb20gc3VibWVudXMgc28gdGhhdCB0aGlzXG5cdFx0XHQvLyBtZW51IGZpcmVzIGV2ZW50cyB3aGVuIGNvbnRleHQga2V5IGNoYW5nZXMgYWZmZWN0IHN1Ym1lbnVzXG5cdFx0XHRNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKGl0ZW0uc3VibWVudSkuZm9yRWFjaCh0aGlzLl9jb2xsZWN0Q29udGV4dEtleXNBbmRTdWJtZW51SWRzLCB0aGlzKTtcblxuXHRcdFx0dGhpcy5fYWxsTWVudUlkcy5hZGQoaXRlbS5zdWJtZW51KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZmlsbEluS2JFeHByS2V5cyhleHA6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCBzZXQ6IFNldDxzdHJpbmc+KTogdm9pZCB7XG5cdFx0aWYgKGV4cCkge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgZXhwLmtleXMoKSkge1xuXHRcdFx0XHRzZXQuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cbn1cblxuY2xhc3MgTWVudUluZm8gZXh0ZW5kcyBNZW51SW5mb1NuYXBzaG90IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfaWQ6IE1lbnVJZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oaWRkZW5TdGF0ZXM6IFBlcnNpc3RlZE1lbnVIaWRlU3RhdGUsXG5cdFx0X2NvbGxlY3RDb250ZXh0S2V5c0ZvclN1Ym1lbnVzOiBib29sZWFuLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKF9pZCwgX2NvbGxlY3RDb250ZXh0S2V5c0ZvclN1Ym1lbnVzKTtcblx0XHR0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdGNyZWF0ZUFjdGlvbkdyb3VwcyhvcHRpb25zOiBJTWVudUFjdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQpOiBbc3RyaW5nLCBBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl1bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBbc3RyaW5nLCBBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9tZW51R3JvdXBzKSB7XG5cdFx0XHRjb25zdCBbaWQsIGl0ZW1zXSA9IGdyb3VwO1xuXG5cdFx0XHRsZXQgYWN0aXZlQWN0aW9uczogQXJyYXk8TWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbj4gfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoaXRlbS53aGVuKSkge1xuXHRcdFx0XHRcdGNvbnN0IGlzTWVudUl0ZW0gPSBpc0lNZW51SXRlbShpdGVtKTtcblx0XHRcdFx0XHRpZiAoaXNNZW51SXRlbSkge1xuXHRcdFx0XHRcdFx0dGhpcy5faGlkZGVuU3RhdGVzLnNldERlZmF1bHRTdGF0ZSh0aGlzLl9pZCwgaXRlbS5jb21tYW5kLmlkLCAhIWl0ZW0uaXNIaWRkZW5CeURlZmF1bHQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IG1lbnVIaWRlID0gY3JlYXRlTWVudUhpZGUodGhpcy5faWQsIGlzTWVudUl0ZW0gPyBpdGVtLmNvbW1hbmQgOiBpdGVtLCB0aGlzLl9oaWRkZW5TdGF0ZXMpO1xuXHRcdFx0XHRcdGlmIChpc01lbnVJdGVtKSB7XG5cdFx0XHRcdFx0XHQvLyBNZW51SXRlbUFjdGlvblxuXHRcdFx0XHRcdFx0Y29uc3QgbWVudUtleWJpbmRpbmcgPSBjcmVhdGVDb25maWd1cmVLZXliaW5kaW5nQWN0aW9uKHRoaXMuX2NvbW1hbmRTZXJ2aWNlLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgaXRlbS5jb21tYW5kLmlkLCBpdGVtLndoZW4pO1xuXHRcdFx0XHRcdFx0KGFjdGl2ZUFjdGlvbnMgPz89IFtdKS5wdXNoKG5ldyBNZW51SXRlbUFjdGlvbihpdGVtLmNvbW1hbmQsIGl0ZW0uYWx0LCBvcHRpb25zLCBtZW51SGlkZSwgbWVudUtleWJpbmRpbmcsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb21tYW5kU2VydmljZSkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBTdWJtZW51SXRlbUFjdGlvblxuXHRcdFx0XHRcdFx0Y29uc3QgZ3JvdXBzID0gbmV3IE1lbnVJbmZvKGl0ZW0uc3VibWVudSwgdGhpcy5faGlkZGVuU3RhdGVzLCB0aGlzLl9jb2xsZWN0Q29udGV4dEtleXNGb3JTdWJtZW51cywgdGhpcy5fY29tbWFuZFNlcnZpY2UsIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSkuY3JlYXRlQWN0aW9uR3JvdXBzKG9wdGlvbnMpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3VibWVudUFjdGlvbnMgPSBTZXBhcmF0b3Iuam9pbiguLi5ncm91cHMubWFwKGcgPT4gZ1sxXSkpO1xuXHRcdFx0XHRcdFx0aWYgKHN1Ym1lbnVBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0KGFjdGl2ZUFjdGlvbnMgPz89IFtdKS5wdXNoKG5ldyBTdWJtZW51SXRlbUFjdGlvbihpdGVtLCBtZW51SGlkZSwgc3VibWVudUFjdGlvbnMpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChhY3RpdmVBY3Rpb25zICYmIGFjdGl2ZUFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChbaWQsIGFjdGl2ZUFjdGlvbnNdKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfc29ydChtZW51SXRlbXM6IChJTWVudUl0ZW0gfCBJU3VibWVudUl0ZW0pW10pOiAoSU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtKVtdIHtcblx0XHRyZXR1cm4gbWVudUl0ZW1zLnNvcnQoTWVudUluZm8uX2NvbXBhcmVNZW51SXRlbXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbXBhcmVNZW51SXRlbXMoYTogSU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtLCBiOiBJTWVudUl0ZW0gfCBJU3VibWVudUl0ZW0pOiBudW1iZXIge1xuXG5cdFx0Y29uc3QgYUdyb3VwID0gYS5ncm91cDtcblx0XHRjb25zdCBiR3JvdXAgPSBiLmdyb3VwO1xuXG5cdFx0aWYgKGFHcm91cCAhPT0gYkdyb3VwKSB7XG5cblx0XHRcdC8vIEZhbHN5IGdyb3VwcyBjb21lIGxhc3Rcblx0XHRcdGlmICghYUdyb3VwKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fSBlbHNlIGlmICghYkdyb3VwKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gJ25hdmlnYXRpb24nIGdyb3VwIGNvbWVzIGZpcnN0XG5cdFx0XHRpZiAoYUdyb3VwID09PSAnbmF2aWdhdGlvbicpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fSBlbHNlIGlmIChiR3JvdXAgPT09ICduYXZpZ2F0aW9uJykge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gbGV4aWNhbCBzb3J0IGZvciBncm91cHNcblx0XHRcdGNvbnN0IHZhbHVlID0gYUdyb3VwLmxvY2FsZUNvbXBhcmUoYkdyb3VwKTtcblx0XHRcdGlmICh2YWx1ZSAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc29ydCBvbiBwcmlvcml0eSAtIGRlZmF1bHQgaXMgMFxuXHRcdGNvbnN0IGFQcmlvID0gYS5vcmRlciB8fCAwO1xuXHRcdGNvbnN0IGJQcmlvID0gYi5vcmRlciB8fCAwO1xuXHRcdGlmIChhUHJpbyA8IGJQcmlvKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChhUHJpbyA+IGJQcmlvKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cblx0XHQvLyBzb3J0IG9uIHRpdGxlc1xuXHRcdHJldHVybiBNZW51SW5mby5fY29tcGFyZVRpdGxlcyhcblx0XHRcdGlzSU1lbnVJdGVtKGEpID8gYS5jb21tYW5kLnRpdGxlIDogYS50aXRsZSxcblx0XHRcdGlzSU1lbnVJdGVtKGIpID8gYi5jb21tYW5kLnRpdGxlIDogYi50aXRsZVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29tcGFyZVRpdGxlcyhhOiBzdHJpbmcgfCBJTG9jYWxpemVkU3RyaW5nLCBiOiBzdHJpbmcgfCBJTG9jYWxpemVkU3RyaW5nKSB7XG5cdFx0Y29uc3QgYVN0ciA9IHR5cGVvZiBhID09PSAnc3RyaW5nJyA/IGEgOiBhLm9yaWdpbmFsO1xuXHRcdGNvbnN0IGJTdHIgPSB0eXBlb2YgYiA9PT0gJ3N0cmluZycgPyBiIDogYi5vcmlnaW5hbDtcblx0XHRyZXR1cm4gYVN0ci5sb2NhbGVDb21wYXJlKGJTdHIpO1xuXHR9XG59XG5cbmNsYXNzIE1lbnVJbXBsIGltcGxlbWVudHMgSU1lbnUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbnVJbmZvOiBNZW51SW5mbztcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2U6IEVtaXR0ZXI8SU1lbnVDaGFuZ2VFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxJTWVudUNoYW5nZUV2ZW50PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogTWVudUlkLFxuXHRcdGhpZGRlblN0YXRlczogUGVyc2lzdGVkTWVudUhpZGVTdGF0ZSxcblx0XHRvcHRpb25zOiBSZXF1aXJlZDxJTWVudUNyZWF0ZU9wdGlvbnM+LFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX21lbnVJbmZvID0gbmV3IE1lbnVJbmZvKGlkLCBoaWRkZW5TdGF0ZXMsIG9wdGlvbnMuZW1pdEV2ZW50c0ZvclN1Ym1lbnVDaGFuZ2VzLCBjb21tYW5kU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIFJlYnVpbGQgdGhpcyBtZW51IHdoZW5ldmVyIHRoZSBtZW51IHJlZ2lzdHJ5IHJlcG9ydHMgYW4gZXZlbnQgZm9yIHRoaXMgTWVudUlkLlxuXHRcdC8vIFRoaXMgdXN1YWxseSBoYXBwZW4gd2hpbGUgY29kZSBhbmQgZXh0ZW5zaW9ucyBhcmUgbG9hZGVkIGFuZCBhZmZlY3RzIHRoZSBvdmVyXG5cdFx0Ly8gc3RydWN0dXJlIG9mIHRoZSBtZW51XG5cdFx0Y29uc3QgcmVidWlsZE1lbnVTb29uID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbWVudUluZm8ucmVmcmVzaCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IG1lbnU6IHRoaXMsIGlzU3RydWN0dXJhbENoYW5nZTogdHJ1ZSwgaXNFbmFibGVtZW50Q2hhbmdlOiB0cnVlLCBpc1RvZ2dsZUNoYW5nZTogdHJ1ZSB9KTtcblx0XHR9LCBvcHRpb25zLmV2ZW50RGVib3VuY2VEZWxheSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHJlYnVpbGRNZW51U29vbik7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5vbkRpZENoYW5nZU1lbnUoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHRoaXMuX21lbnVJbmZvLmFsbE1lbnVJZHMpIHtcblx0XHRcdFx0aWYgKGUuaGFzKGlkKSkge1xuXHRcdFx0XHRcdHJlYnVpbGRNZW51U29vbi5zY2hlZHVsZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2hlbiBjb250ZXh0IGtleXMgb3Igc3RvcmFnZSBzdGF0ZSBjaGFuZ2VzIHdlIG5lZWQgdG8gY2hlY2sgaWYgdGhlIG1lbnUgYWxzbyBoYXMgY2hhbmdlZC4gSG93ZXZlcixcblx0XHQvLyB3ZSBvbmx5IGRvIHRoYXQgd2hlbiBzb21lb25lIGxpc3RlbnMgb24gdGhpcyBtZW51IGJlY2F1c2UgKDEpIHRoZXNlIGV2ZW50cyBhcmVcblx0XHQvLyBmaXJpbmcgb2Z0ZW4gYW5kICgyKSBtZW51IGFyZSBvZnRlbiBsZWFrZWRcblx0XHRjb25zdCBsYXp5TGlzdGVuZXIgPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdGNvbnN0IG1lcmdlID0gKGV2ZW50czogSU1lbnVDaGFuZ2VFdmVudFtdKTogSU1lbnVDaGFuZ2VFdmVudCA9PiB7XG5cblx0XHRcdGxldCBpc1N0cnVjdHVyYWxDaGFuZ2UgPSBmYWxzZTtcblx0XHRcdGxldCBpc0VuYWJsZW1lbnRDaGFuZ2UgPSBmYWxzZTtcblx0XHRcdGxldCBpc1RvZ2dsZUNoYW5nZSA9IGZhbHNlO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZXZlbnRzKSB7XG5cdFx0XHRcdGlzU3RydWN0dXJhbENoYW5nZSA9IGlzU3RydWN0dXJhbENoYW5nZSB8fCBpdGVtLmlzU3RydWN0dXJhbENoYW5nZTtcblx0XHRcdFx0aXNFbmFibGVtZW50Q2hhbmdlID0gaXNFbmFibGVtZW50Q2hhbmdlIHx8IGl0ZW0uaXNFbmFibGVtZW50Q2hhbmdlO1xuXHRcdFx0XHRpc1RvZ2dsZUNoYW5nZSA9IGlzVG9nZ2xlQ2hhbmdlIHx8IGl0ZW0uaXNUb2dnbGVDaGFuZ2U7XG5cdFx0XHRcdGlmIChpc1N0cnVjdHVyYWxDaGFuZ2UgJiYgaXNFbmFibGVtZW50Q2hhbmdlICYmIGlzVG9nZ2xlQ2hhbmdlKSB7XG5cdFx0XHRcdFx0Ly8gZXZlcnl0aGluZyBpcyBUUlVFLCBubyBuZWVkIHRvIGNvbnRpbnVlIGl0ZXJhdGluZ1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IG1lbnU6IHRoaXMsIGlzU3RydWN0dXJhbENoYW5nZSwgaXNFbmFibGVtZW50Q2hhbmdlLCBpc1RvZ2dsZUNoYW5nZSB9O1xuXHRcdH07XG5cblx0XHRjb25zdCBzdGFydExhenlMaXN0ZW5lciA9ICgpID0+IHtcblxuXHRcdFx0bGF6eUxpc3RlbmVyLmFkZChjb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzU3RydWN0dXJhbENoYW5nZSA9IGUuYWZmZWN0c1NvbWUodGhpcy5fbWVudUluZm8uc3RydWN0dXJlQ29udGV4dEtleXMpO1xuXHRcdFx0XHRjb25zdCBpc0VuYWJsZW1lbnRDaGFuZ2UgPSBlLmFmZmVjdHNTb21lKHRoaXMuX21lbnVJbmZvLnByZWNvbmRpdGlvbkNvbnRleHRLZXlzKTtcblx0XHRcdFx0Y29uc3QgaXNUb2dnbGVDaGFuZ2UgPSBlLmFmZmVjdHNTb21lKHRoaXMuX21lbnVJbmZvLnRvZ2dsZWRDb250ZXh0S2V5cyk7XG5cdFx0XHRcdGlmIChpc1N0cnVjdHVyYWxDaGFuZ2UgfHwgaXNFbmFibGVtZW50Q2hhbmdlIHx8IGlzVG9nZ2xlQ2hhbmdlKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IG1lbnU6IHRoaXMsIGlzU3RydWN0dXJhbENoYW5nZSwgaXNFbmFibGVtZW50Q2hhbmdlLCBpc1RvZ2dsZUNoYW5nZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0bGF6eUxpc3RlbmVyLmFkZChoaWRkZW5TdGF0ZXMub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBtZW51OiB0aGlzLCBpc1N0cnVjdHVyYWxDaGFuZ2U6IHRydWUsIGlzRW5hYmxlbWVudENoYW5nZTogZmFsc2UsIGlzVG9nZ2xlQ2hhbmdlOiBmYWxzZSB9KTtcblx0XHRcdH0pKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UgPSBuZXcgRGVib3VuY2VFbWl0dGVyKHtcblx0XHRcdC8vIHN0YXJ0L3N0b3AgY29udGV4dCBrZXkgbGlzdGVuZXJcblx0XHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6IHN0YXJ0TGF6eUxpc3RlbmVyLFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6IGxhenlMaXN0ZW5lci5jbGVhci5iaW5kKGxhenlMaXN0ZW5lciksXG5cdFx0XHRkZWxheTogb3B0aW9ucy5ldmVudERlYm91bmNlRGVsYXksXG5cdFx0XHRtZXJnZVxuXHRcdH0pO1xuXHRcdHRoaXMub25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblx0fVxuXG5cdGdldEFjdGlvbnMob3B0aW9ucz86IElNZW51QWN0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFtzdHJpbmcsIChNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uKVtdXVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fbWVudUluZm8uY3JlYXRlQWN0aW9uR3JvdXBzKG9wdGlvbnMpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1lbnVIaWRlKG1lbnU6IE1lbnVJZCwgY29tbWFuZDogSUNvbW1hbmRBY3Rpb24gfCBJU3VibWVudUl0ZW0sIHN0YXRlczogUGVyc2lzdGVkTWVudUhpZGVTdGF0ZSk6IElNZW51SXRlbUhpZGUge1xuXG5cdGNvbnN0IGlkID0gaXNJU3VibWVudUl0ZW0oY29tbWFuZCkgPyBjb21tYW5kLnN1Ym1lbnUuaWQgOiBjb21tYW5kLmlkO1xuXHRjb25zdCB0aXRsZSA9IHR5cGVvZiBjb21tYW5kLnRpdGxlID09PSAnc3RyaW5nJyA/IGNvbW1hbmQudGl0bGUgOiBjb21tYW5kLnRpdGxlLnZhbHVlO1xuXG5cdGNvbnN0IGhpZGUgPSB0b0FjdGlvbih7XG5cdFx0aWQ6IGBoaWRlLyR7bWVudS5pZH0vJHtpZH1gLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnaGlkZS5sYWJlbCcsICdIaWRlIFxcJ3swfVxcJycsIHRpdGxlKSxcblx0XHRydW4oKSB7IHN0YXRlcy51cGRhdGVIaWRkZW4obWVudSwgaWQsIHRydWUpOyB9XG5cdH0pO1xuXG5cdGNvbnN0IHRvZ2dsZSA9IHRvQWN0aW9uKHtcblx0XHRpZDogYHRvZ2dsZS8ke21lbnUuaWR9LyR7aWR9YCxcblx0XHRsYWJlbDogdGl0bGUsXG5cdFx0Z2V0IGNoZWNrZWQoKSB7IHJldHVybiAhc3RhdGVzLmlzSGlkZGVuKG1lbnUsIGlkKTsgfSxcblx0XHRydW4oKSB7IHN0YXRlcy51cGRhdGVIaWRkZW4obWVudSwgaWQsICEhdGhpcy5jaGVja2VkKTsgfVxuXHR9KTtcblxuXHRyZXR1cm4ge1xuXHRcdGhpZGUsXG5cdFx0dG9nZ2xlLFxuXHRcdGdldCBpc0hpZGRlbigpIHsgcmV0dXJuICF0b2dnbGUuY2hlY2tlZDsgfSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNvbmZpZ3VyZUtleWJpbmRpbmdBY3Rpb24oY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSwgY29tbWFuZElkOiBzdHJpbmcsIHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLCBlbmFibGVkID0gdHJ1ZSk6IElBY3Rpb24ge1xuXHRyZXR1cm4gdG9BY3Rpb24oe1xuXHRcdGlkOiBgY29uZmlndXJlS2V5YmluZGluZy8ke2NvbW1hbmRJZH1gLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29uZmlndXJlIGtleWJpbmRpbmcnLCBcIkNvbmZpZ3VyZSBLZXliaW5kaW5nXCIpLFxuXHRcdGVuYWJsZWQsXG5cdFx0cnVuKCkge1xuXHRcdFx0Ly8gT25seSBzZXQgdGhlIHdoZW4gY2xhdXNlIHdoZW4gdGhlcmUgaXMgbm8ga2V5YmluZGluZ1xuXHRcdFx0Ly8gSXQgaXMgcG9zc2libGUgdGhhdCB0aGUgYWN0aW9uIGFuZCB0aGUga2V5YmluZGluZyBoYXZlIGRpZmZlcmVudCB3aGVuIGNsYXVzZXNcblx0XHRcdGNvbnN0IGhhc0tleWJpbmRpbmcgPSAhIWtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoY29tbWFuZElkKTsgLy8gVGhpcyBtYXkgb25seSBiZSBjYWxsZWQgaW5zaWRlIHRoZSBgcnVuKClgIG1ldGhvZCBhcyBpdCBjYW4gYmUgZXhwZW5zaXZlIG9uIHN0YXJ0dXAuICMyMTA1Mjlcblx0XHRcdGNvbnN0IHdoZW5WYWx1ZSA9ICFoYXNLZXliaW5kaW5nICYmIHdoZW4gPyB3aGVuLnNlcmlhbGl6ZSgpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbkdsb2JhbEtleWJpbmRpbmdzJywgYEBjb21tYW5kOiR7Y29tbWFuZElkfWAgKyAod2hlblZhbHVlID8gYCArd2hlbjoke3doZW5WYWx1ZX1gIDogJycpKTtcblx0XHR9XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUFpQixlQUFzQjtBQUNoRCxTQUFTLGlCQUFpQixrQkFBK0I7QUFDekQsU0FBa0gsYUFBYSxnQkFBc0MsZ0JBQWdCLGNBQWMseUJBQXlCO0FBRTVOLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQStCLDBCQUEwQjtBQUN6RCxTQUFrQixXQUFXLGdCQUFnQjtBQUM3QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUU1QixJQUFNLGNBQU4sY0FBMEIsV0FBbUM7QUFBQSxFQU1uRSxZQUNtQyxpQkFDRyxvQkFDcEIsZ0JBQ2hCO0FBQ0QsVUFBTTtBQUo0QjtBQUNHO0FBSXJDLFNBQUssZ0JBQWdCLEtBQUssVUFBVSxJQUFJLHVCQUF1QixjQUFjLENBQUM7QUFBQSxFQUMvRTtBQUFBLEVBRUEsV0FBVyxJQUFZLG1CQUF1QyxTQUFxQztBQUNsRyxXQUFPLElBQUksU0FBUyxJQUFJLEtBQUssZUFBZSxFQUFFLDZCQUE2QixPQUFPLG9CQUFvQixJQUFJLEdBQUcsUUFBUSxHQUFHLEtBQUssaUJBQWlCLEtBQUssb0JBQW9CLGlCQUFpQjtBQUFBLEVBQ3pMO0FBQUEsRUFFQSxlQUFlLElBQVksbUJBQXVDLFNBQXFGO0FB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
