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
import "./media/chatGroupsView.css";
import { $, size } from "../../../base/browser/dom.js";
import { Color } from "../../../base/common/color.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { autorun, derived, observableValue, transaction } from "../../../base/common/observable.js";
import { URI } from "../../../base/common/uri.js";
import { Direction, SerializableGrid, Sizing } from "../../../base/browser/ui/grid/grid.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { contrastBorder } from "../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../platform/theme/common/themeService.js";
import { agentsPanelBorder } from "../../common/theme.js";
import { ISessionsService } from "../../services/sessions/browser/sessionsService.js";
import { ChatGroupView } from "./chatGroupView.js";
import { ChatGroupDropTarget } from "./chatGroupDropTarget.js";
import { isSessionChatDrag } from "../dnd.js";
let ChatGroupsView = class extends Themable {
  constructor(themeService, _instantiationService, _sessionsService, _storageService) {
    super(themeService);
    this._instantiationService = _instantiationService;
    this._sessionsService = _sessionsService;
    this._storageService = _storageService;
    this.element = $(".chat-groups-view");
    this._sessionDisposables = this._register(new MutableDisposable());
    this._groupDisposables = this._register(new DisposableMap());
    this._groups = [];
    this._groupCount = observableValue(this, 1);
    this._nextGroupId = 0;
    this._sessionActive = true;
    this._sessionVisible = true;
    /** Whether a persisted layout is still being restored (saved chats may not have loaded yet). */
    this._restorePending = false;
  }
  /** Number of chat groups currently in the grid. `> 1` means a grid layout. */
  get groupCount() {
    return this._groupCount;
  }
  /** Sets (or clears) the session whose chats this view partitions into groups. */
  setSession(session, options) {
    this._options = options;
    if (this._session === session) {
      return;
    }
    this._persistLayout();
    this._session = session;
    const store = new DisposableStore();
    this._sessionDisposables.value = store;
    this._groupDisposables.clearAndDisposeAll();
    this._currentSessionStore = store;
    this._grid = void 0;
    this._groups = [];
    this._activeGroup = void 0;
    this._restoreAssignment = void 0;
    this._restoreOrder = void 0;
    this._restoreInitialIds = void 0;
    this._restorePending = false;
    this._lastSessionActiveChatId = void 0;
    this._setGroupCount(1);
    if (!session) {
      this.element.replaceChildren();
      return;
    }
    this._mainChatResource = derived((reader) => session.mainChat.read(reader).resource.toString());
    const grid = session.isCreated.get() ? this._tryRestoreLayout(session, store) ?? this._createSingleGroupGrid(session, store) : this._createSingleGroupGrid(session, store);
    this._grid = grid;
    store.add(grid);
    this.element.replaceChildren(grid.element);
    store.add(toDisposable(() => grid.element.remove()));
    const dropDelegate = {
      isChatDrag: (event) => isSessionChatDrag(event, session.sessionId),
      findTargetGroup: (child) => this._findTargetGroup(child),
      onChatDrop: (groupId, zone, data) => this._onChatDrop(groupId, zone, data)
    };
    store.add(this._instantiationService.createInstance(ChatGroupDropTarget, this.element, dropDelegate));
    store.add(autorun((reader) => this._reconcile(reader)));
    this._applyLayout();
  }
  _createSingleGroupGrid(session, store) {
    const firstGroup = this._createGroupEntry(session);
    this._groups = [firstGroup];
    this._activeGroup = firstGroup;
    firstGroup.view.setGroupActive(true);
    this._setGroupCount(1);
    return new SerializableGrid(firstGroup.view, { styles: { separatorBorder: this._separatorBorder } });
  }
  /**
   * Rebuilds a persisted grid layout for the session, if one is stored. Returns
   * `undefined` to fall back to a single group. Saved chats may not have loaded
   * yet (the catalog arrives asynchronously); {@link _reconcile} routes them back
   * to their groups via {@link _restoreAssignment} once they appear.
   */
  _tryRestoreLayout(session, store) {
    const saved = this._loadStored(session.sessionId);
    if (!saved || saved.groups.length <= 1) {
      return void 0;
    }
    const indexToEntry = /* @__PURE__ */ new Map();
    const deserializer = {
      fromJSON: (json) => {
        const index = typeof json?.index === "number" ? json.index : indexToEntry.size;
        const entry = this._createGroupEntry(session);
        indexToEntry.set(index, entry);
        return entry.view;
      }
    };
    let grid;
    try {
      grid = SerializableGrid.deserialize(saved.grid, deserializer, { styles: { separatorBorder: this._separatorBorder } });
    } catch (e) {
      onUnexpectedError(e);
      return void 0;
    }
    const groups = [];
    for (let i = 0; i < saved.groups.length; i++) {
      const entry = indexToEntry.get(i);
      if (entry) {
        groups.push(entry);
      }
    }
    if (groups.length <= 1) {
      grid.dispose();
      return void 0;
    }
    const assignment = /* @__PURE__ */ new Map();
    const order = /* @__PURE__ */ new Map();
    let ordinal = 0;
    saved.groups.forEach((g, i) => {
      const entry = indexToEntry.get(i);
      if (!entry) {
        return;
      }
      for (const id of g.resourceIds) {
        assignment.set(id, entry.id);
        order.set(id, ordinal++);
      }
      if (g.activeResourceId) {
        entry.activeResourceId.set(g.activeResourceId, void 0);
      }
    });
    this._groups = groups;
    this._restoreAssignment = assignment;
    this._restoreOrder = order;
    this._restoreInitialIds = new Set(session.visibleChatTabs.get().map((c) => c.resource.toString()));
    this._restorePending = true;
    this._activeGroup = indexToEntry.get(saved.activeGroupIndex) ?? groups[0];
    for (const group of this._groups) {
      group.view.setGroupActive(group === this._activeGroup);
    }
    this._setGroupCount(this._groups.length);
    return grid;
  }
  _createGroupEntry(session) {
    const id = this._nextGroupId++;
    const store = new DisposableStore();
    this._groupDisposables.set(id, store);
    const resourceIds = observableValue(`chatGroup.${id}.resourceIds`, []);
    const activeResourceId = observableValue(`chatGroup.${id}.activeResourceId`, "");
    const chats = derived((reader) => {
      const all = session.visibleChatTabs.read(reader);
      const ids = resourceIds.read(reader);
      const result = [];
      for (const idStr of ids) {
        const chat = all.find((c) => c.resource.toString() === idStr);
        if (chat) {
          result.push(chat);
        }
      }
      return result;
    });
    const tabsVisible = derived((reader) => {
      if (!session.isCreated.read(reader)) {
        return false;
      }
      if (this._groupCount.read(reader) > 1) {
        return true;
      }
      return session.shouldShowChatTabs.read(reader);
    });
    const view = store.add(this._instantiationService.createInstance(ChatGroupView));
    const entry = { id, view, resourceIds, activeResourceId, chats, tabsVisible };
    store.add(view.onDidFocus(() => this._onGroupFocused(entry)));
    const context = {
      session,
      options: this._options,
      chats,
      activeChatResource: activeResourceId,
      mainChatResource: this._mainChatResource,
      tabsVisible,
      openChat: (resource) => this._openChat(entry, resource),
      newChat: () => this._newChat(entry).catch(onUnexpectedError),
      onTabDragStart: () => {
      },
      onTabDragEnd: () => {
      }
    };
    view.setContext(context);
    view.setSessionActive(this._sessionActive);
    view.setSessionVisible(this._sessionVisible);
    return entry;
  }
  _reconcile(reader) {
    const session = this._session;
    if (!session) {
      return;
    }
    const chats = session.visibleChatTabs.read(reader);
    const activeChat = session.activeChat.read(reader);
    const orderedIds = chats.map((c) => c.resource.toString());
    const validIds = new Set(orderedIds);
    const activeId = activeChat?.resource.toString();
    transaction((tx) => {
      for (const group of this._groups) {
        const ids = group.resourceIds.get();
        const pruned = ids.filter((id) => validIds.has(id));
        if (pruned.length !== ids.length) {
          group.resourceIds.set(pruned, tx);
        }
      }
      const assigned = /* @__PURE__ */ new Set();
      for (const group of this._groups) {
        for (const id of group.resourceIds.get()) {
          assigned.add(id);
        }
      }
      for (const id of orderedIds) {
        if (assigned.has(id)) {
          continue;
        }
        const savedGroupId = this._restoreAssignment?.get(id);
        let target = savedGroupId !== void 0 ? this._groups.find((g) => g.id === savedGroupId) : void 0;
        const chat = chats.find((chat2) => chat2.resource.toString() === id);
        const parentResource = id === activeId ? chat?.origin?.parentChat : void 0;
        const parentGroup = parentResource ? this._groups.find((group) => group.resourceIds.get().includes(parentResource.toString())) : void 0;
        target ??= parentGroup ? this._findAdjacentGroup(parentGroup) : void 0;
        target ??= this._activeGroup;
        if (target) {
          target.resourceIds.set([...target.resourceIds.get(), id], tx);
        }
      }
      if (this._restorePending && this._restoreOrder) {
        const restoreOrder = this._restoreOrder;
        for (const group of this._groups) {
          const ids = group.resourceIds.get();
          const sorted = [...ids].sort((a, b) => (restoreOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (restoreOrder.get(b) ?? Number.MAX_SAFE_INTEGER));
          if (sorted.some((id, i) => id !== ids[i])) {
            group.resourceIds.set(sorted, tx);
          }
        }
      }
      if (activeId && activeId !== this._lastSessionActiveChatId) {
        const owner = this._groups.find((g) => g.resourceIds.get().includes(activeId));
        if (owner) {
          owner.activeResourceId.set(activeId, tx);
          this._setActiveGroup(owner);
        }
      }
      this._lastSessionActiveChatId = activeId;
      for (const group of this._groups) {
        const ids = group.resourceIds.get();
        if (ids.length && !ids.includes(group.activeResourceId.get())) {
          group.activeResourceId.set(ids[0], tx);
        }
      }
    });
    if (this._restorePending) {
      const allSavedPresent = this._restoreAssignment ? [...this._restoreAssignment.keys()].every((id) => validIds.has(id)) : true;
      const catalogChanged = !this._restoreInitialIds || orderedIds.length !== this._restoreInitialIds.size || orderedIds.some((id) => !this._restoreInitialIds.has(id));
      const catalogSettled = !session.loading.read(reader);
      if (allSavedPresent || catalogChanged || catalogSettled) {
        this._restorePending = false;
        this._restoreAssignment = void 0;
        this._restoreOrder = void 0;
        this._restoreInitialIds = void 0;
      }
    }
    if (!this._restorePending) {
      this._removeEmptyGroups();
      this._persistLayout();
    }
  }
  _findTargetGroup(child) {
    for (const group of this._groups) {
      if (group.view.element.contains(child)) {
        return { id: group.id, element: group.view.element };
      }
    }
    return void 0;
  }
  _onChatDrop(targetGroupId, zone, data) {
    if (!data || !this._session) {
      return;
    }
    if (data.sessionId !== this._session.sessionId) {
      return;
    }
    const id = data.resource;
    const resource = URI.parse(id);
    const target = this._groups.find((g) => g.id === targetGroupId);
    const source = this._groups.find((g) => g.resourceIds.get().includes(id));
    if (!target || !source) {
      return;
    }
    if (zone === "center") {
      if (source === target) {
        return;
      }
      this._moveChatToGroup(resource, source, target);
    } else {
      if (source === target && source.resourceIds.get().length <= 1) {
        return;
      }
      this._splitChatIntoNewGroup(resource, source, target, zone);
    }
  }
  _moveChatToGroup(resource, source, target) {
    const id = resource.toString();
    transaction((tx) => {
      this._detachChatFromGroup(source, id, tx);
      if (!target.resourceIds.get().includes(id)) {
        target.resourceIds.set([...target.resourceIds.get(), id], tx);
      }
      target.activeResourceId.set(id, tx);
    });
    this._setActiveGroup(target);
    this._sessionsService.openChat(this._session, resource).catch(onUnexpectedError);
    this._removeEmptyGroups();
    this._persistLayout();
  }
  _splitChatIntoNewGroup(resource, source, reference, zone) {
    if (!this._grid || !this._currentSessionStore || !this._session) {
      return;
    }
    const id = resource.toString();
    const newGroup = this._createGroupEntry(this._session);
    this._grid.addView(newGroup.view, Sizing.Distribute, reference.view, this._zoneToDirection(zone));
    this._insertGroup(newGroup, reference, zone);
    this._setGroupCount(this._groups.length);
    transaction((tx) => {
      this._detachChatFromGroup(source, id, tx);
      newGroup.resourceIds.set([id], tx);
      newGroup.activeResourceId.set(id, tx);
    });
    this._setActiveGroup(newGroup);
    this._sessionsService.openChat(this._session, resource).catch(onUnexpectedError);
    this._removeEmptyGroups();
    this._applyLayout();
    this._persistLayout();
  }
  /**
   * Removes a chat from a group. If it was the group's active chat, activates a
   * remaining one so the source group keeps showing a chat it still owns.
   */
  _detachChatFromGroup(group, id, tx) {
    const remaining = group.resourceIds.get().filter((x) => x !== id);
    group.resourceIds.set(remaining, tx);
    if (group.activeResourceId.get() === id && remaining.length) {
      group.activeResourceId.set(remaining[0], tx);
    }
  }
  /**
   * Opens a chat in a group beside the active one ("open to the side"). If the
   * chat is already shown in a group, that group is focused instead of creating
   * a duplicate; otherwise a new group is created to the right of the active
   * group and the chat is shown there.
   */
  async openChatInNewGroup(resource) {
    if (!this._session || !this._grid || !this._currentSessionStore) {
      return;
    }
    const id = resource.toString();
    const existing = this._groups.find((g) => g.resourceIds.get().includes(id));
    if (existing) {
      existing.activeResourceId.set(id, void 0);
      this._setActiveGroup(existing);
      await this._sessionsService.openChat(this._session, resource);
      return;
    }
    const reference = this._activeGroup ?? this._groups[0];
    if (!reference) {
      return;
    }
    const session = this._session;
    await this._sessionsService.openChat(session, resource);
    if (this._session !== session || !session.visibleChatTabs.get().some((chat) => chat.resource.toString() === id)) {
      return;
    }
    const newGroup = this._createGroupEntry(session);
    this._grid.addView(newGroup.view, Sizing.Distribute, reference.view, Direction.Right);
    this._insertGroup(newGroup, reference, "right");
    this._setGroupCount(this._groups.length);
    transaction((tx) => {
      const assignedGroup = this._groups.find((group) => group !== newGroup && group.resourceIds.get().includes(id));
      if (assignedGroup) {
        this._detachChatFromGroup(assignedGroup, id, tx);
      }
      newGroup.resourceIds.set([id], tx);
      newGroup.activeResourceId.set(id, tx);
    });
    this._setActiveGroup(newGroup);
    this._removeEmptyGroups();
    this._applyLayout();
    this._persistLayout();
  }
  _findAdjacentGroup(reference) {
    if (this._grid && this._lastLayout) {
      for (const direction of [Direction.Right, Direction.Left, Direction.Down, Direction.Up]) {
        const neighbor = this._grid.getNeighborViews(reference.view, direction)[0];
        const group = neighbor && this._groups.find((candidate) => candidate.view === neighbor);
        if (group) {
          return group;
        }
      }
    }
    const referenceIndex = this._groups.indexOf(reference);
    return this._groups[referenceIndex + 1] ?? this._groups[referenceIndex - 1];
  }
  _insertGroup(group, reference, zone) {
    const referenceIndex = this._groups.indexOf(reference);
    const insertBefore = zone === "left" || zone === "top";
    this._groups.splice(referenceIndex + (insertBefore ? 0 : 1), 0, group);
  }
  /**
   * Places a freshly created chat (e.g. a side chat) beside the current one.
   * Unlike {@link openChatInNewGroup} — which focuses the chat in place when it
   * is already visible — this moves the chat out of a shared group into its own
   * group to the right so it sits next to the chat it was created from. Called
   * only at creation time; if the chat is already alone in its group (nothing to
   * sit beside) it is left where it is.
   */
  splitChatToSide(resource) {
    if (!this._session || !this._grid || !this._currentSessionStore) {
      return;
    }
    const id = resource.toString();
    const source = this._groups.find((g) => g.resourceIds.get().includes(id));
    if (source) {
      if (source.resourceIds.get().length <= 1) {
        this._setActiveGroup(source);
        return;
      }
      this._splitChatIntoNewGroup(resource, source, source, "right");
      return;
    }
    if (this._groups.some((g) => g.resourceIds.get().some((x) => x !== id))) {
      this.openChatInNewGroup(resource).catch(onUnexpectedError);
    }
  }
  _removeEmptyGroups() {
    if (!this._grid || this._groups.length <= 1) {
      return;
    }
    const empties = this._groups.filter((g) => g.resourceIds.get().length === 0);
    for (const group of empties) {
      if (this._groups.length <= 1) {
        break;
      }
      const hadFocus = group.view.element.contains(group.view.element.ownerDocument.activeElement);
      this._grid.removeView(group.view, Sizing.Distribute);
      this._groups = this._groups.filter((g) => g !== group);
      if (this._activeGroup === group) {
        this._activeGroup = this._groups[0];
        this._activeGroup?.view.setGroupActive(true);
      }
      this._groupDisposables.deleteAndDispose(group.id);
      if (hadFocus) {
        this._activeGroup?.view.focus();
      }
    }
    this._setGroupCount(this._groups.length);
  }
  _setActiveGroup(entry) {
    if (this._activeGroup === entry) {
      return;
    }
    this._activeGroup = entry;
    for (const group of this._groups) {
      group.view.setGroupActive(group === entry);
    }
    this._persistLayout();
  }
  /**
   * Handles focus entering a group: promotes it to the active group and, when
   * that group is currently collapsed to its minimum size in a split, expands it
   * so the other groups collapse to their minimum. Focusing an already-expanded
   * group (or a balanced/manual layout) leaves the sizes untouched.
   */
  _onGroupFocused(entry) {
    this._setActiveGroup(entry);
    const session = this._session;
    const activeResourceId = entry.activeResourceId.get();
    if (session && activeResourceId && session.activeChat.get().resource.toString() !== activeResourceId) {
      this._sessionsService.openChat(session, URI.parse(activeResourceId)).catch(onUnexpectedError);
    }
    if (!this._grid || this._groups.length < 2 || !this._isGroupCollapsed(entry.view)) {
      return;
    }
    const gridSize = this._grid.getViewSize();
    this._grid.resizeView(entry.view, { width: gridSize.width, height: gridSize.height });
    this._persistLayout();
  }
  /**
   * Whether the group is squeezed to (near) its minimum along an axis where the
   * grid has room to be larger — i.e. the user has collapsed it in a split.
   */
  _isGroupCollapsed(view) {
    if (!this._grid) {
      return false;
    }
    const COLLAPSE_THRESHOLD = 8;
    const size2 = this._grid.getViewSize(view);
    const gridSize = this._grid.getViewSize();
    const collapsedHorizontally = size2.width <= view.minimumWidth + COLLAPSE_THRESHOLD && gridSize.width > view.minimumWidth + COLLAPSE_THRESHOLD;
    const collapsedVertically = size2.height <= view.minimumHeight + COLLAPSE_THRESHOLD && gridSize.height > view.minimumHeight + COLLAPSE_THRESHOLD;
    return collapsedHorizontally || collapsedVertically;
  }
  _setGroupCount(count) {
    this._groupCount.set(count, void 0);
    this.element.classList.toggle("single-group", count <= 1);
    this._groups.forEach((group, index) => group.view.setGroupPosition(index, count));
  }
  _openChat(entry, resource) {
    entry.activeResourceId.set(resource.toString(), void 0);
    this._setActiveGroup(entry);
    if (this._session) {
      this._sessionsService.openChat(this._session, resource).catch(onUnexpectedError);
    }
  }
  async _newChat(entry) {
    this._setActiveGroup(entry);
    const session = this._session;
    if (session && !session.isArchived.get()) {
      const existingIds = new Set(session.visibleChatTabs.get().map((chat) => chat.resource.toString()));
      await this._sessionsService.openNewChatInSession(session);
      if (this._session === session && this._groups.includes(entry)) {
        const createdChat = session.activeChat.get();
        const createdId = createdChat.resource.toString();
        if (!existingIds.has(createdId) && session.visibleChatTabs.get().includes(createdChat)) {
          transaction((tx) => {
            for (const group of this._groups) {
              if (group !== entry && group.resourceIds.get().includes(createdId)) {
                this._detachChatFromGroup(group, createdId, tx);
              }
            }
            if (!entry.resourceIds.get().includes(createdId)) {
              entry.resourceIds.set([...entry.resourceIds.get(), createdId], tx);
            }
            entry.activeResourceId.set(createdId, tx);
          });
          this._setActiveGroup(entry);
          this._removeEmptyGroups();
          this._persistLayout();
        }
        entry.view.focus();
      }
    }
  }
  focusAdjacentGroup(direction) {
    const activeIndex = this._activeGroup ? this._groups.indexOf(this._activeGroup) : -1;
    if (activeIndex < 0 || this._groups.length < 2) {
      return;
    }
    const offset = direction === "next" ? 1 : -1;
    const target = this._groups[(activeIndex + offset + this._groups.length) % this._groups.length];
    this._onGroupFocused(target);
    target.view.focus();
  }
  splitActiveChat(direction) {
    const source = this._activeGroup;
    const resource = source?.activeResourceId.get();
    if (source && resource && source.resourceIds.get().length > 1) {
      this._splitChatIntoNewGroup(URI.parse(resource), source, source, direction);
    }
  }
  moveActiveChatToAdjacentGroup(direction) {
    const source = this._activeGroup;
    const sourceIndex = source ? this._groups.indexOf(source) : -1;
    const resource = source?.activeResourceId.get();
    if (!source || sourceIndex < 0 || !resource || this._groups.length < 2) {
      return;
    }
    const offset = direction === "next" ? 1 : -1;
    const target = this._groups[(sourceIndex + offset + this._groups.length) % this._groups.length];
    this._moveChatToGroup(URI.parse(resource), source, target);
    target.view.focus();
  }
  _zoneToDirection(zone) {
    switch (zone) {
      case "left":
        return Direction.Left;
      case "right":
        return Direction.Right;
      case "top":
        return Direction.Up;
      case "bottom":
        return Direction.Down;
      default:
        return Direction.Right;
    }
  }
  setSessionActive(active) {
    if (this._sessionActive === active) {
      return;
    }
    this._sessionActive = active;
    for (const group of this._groups) {
      group.view.setSessionActive(active);
    }
  }
  setSessionVisible(visible) {
    if (this._sessionVisible === visible) {
      return;
    }
    this._sessionVisible = visible;
    for (const group of this._groups) {
      group.view.setSessionVisible(visible);
    }
  }
  submitInput() {
    return this._activeGroup?.view.submitInput() ?? Promise.resolve(false);
  }
  selectWorkspace(folderUri, providerId) {
    this._activeGroup?.view.selectWorkspace(folderUri, providerId);
  }
  prefillInput(text) {
    this._activeGroup?.view.prefillInput(text);
  }
  sendQuery(text) {
    this._activeGroup?.view.sendQuery(text);
  }
  attach(uris) {
    this._activeGroup?.view.attach(uris);
  }
  focus() {
    this._activeGroup?.view.focus();
  }
  layout(width, height, top, left) {
    this._lastLayout = { width, height, top, left };
    this._applyLayout();
  }
  _applyLayout() {
    if (!this._lastLayout) {
      return;
    }
    const { width, height, top, left } = this._lastLayout;
    size(this.element, width, height);
    this._grid?.layout(width, height, top, left);
  }
  get _separatorBorder() {
    return this.theme.getColor(agentsPanelBorder) || this.theme.getColor(contrastBorder) || Color.transparent;
  }
  updateStyles() {
    super.updateStyles();
    this._grid?.style({ separatorBorder: this._separatorBorder });
  }
  /** Persists the current grid layout for the active session (or clears it when a single group). */
  _persistLayout() {
    if (!this._session || !this._grid || this._restorePending) {
      return;
    }
    const sessionId = this._session.sessionId;
    if (!this._session.isCreated.get()) {
      this._saveStored(sessionId, void 0);
      return;
    }
    if (this._groups.length <= 1) {
      this._saveStored(sessionId, void 0);
      return;
    }
    this._groups.forEach((group, i) => group.view.setSerializationIndex(i));
    const layout = {
      version: 1,
      grid: this._grid.serialize(),
      groups: this._groups.map((group) => ({ resourceIds: group.resourceIds.get(), activeResourceId: group.activeResourceId.get() })),
      activeGroupIndex: Math.max(0, this._groups.indexOf(this._activeGroup))
    };
    this._saveStored(sessionId, layout);
  }
  _readStoredLayouts() {
    const raw = this._storageService.get(ChatGroupsView.STORAGE_KEY, StorageScope.WORKSPACE);
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  _loadStored(sessionId) {
    const entry = this._readStoredLayouts()[sessionId];
    return entry?.version === 1 ? entry : void 0;
  }
  _saveStored(sessionId, layout) {
    const layouts = this._readStoredLayouts();
    if (layout) {
      layouts[sessionId] = layout;
    } else if (layouts[sessionId] === void 0) {
      return;
    } else {
      delete layouts[sessionId];
    }
    this._storageService.store(ChatGroupsView.STORAGE_KEY, JSON.stringify(layouts), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  dispose() {
    this._persistLayout();
    super.dispose();
  }
};
ChatGroupsView.STORAGE_KEY = "sessions.chatGroupsLayout";
ChatGroupsView = __decorateClass([
  __decorateParam(0, IThemeService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IStorageService)
], ChatGroupsView);
export {
  ChatGroupsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXGNoYXRHcm91cHNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRHcm91cHNWaWV3LmNzcyc7XG5pbXBvcnQgeyAkLCBzaXplIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGlyZWN0aW9uLCBJU2VyaWFsaXplZEdyaWQsIElWaWV3RGVzZXJpYWxpemVyLCBTZXJpYWxpemFibGVHcmlkLCBTaXppbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGNvbnRyYXN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgVGhlbWFibGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFnZW50c1BhbmVsQm9yZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElDaGF0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZpZXdPcHRpb25zIH0gZnJvbSAnLi9jaGF0Vmlldy5qcyc7XG5pbXBvcnQgeyBDaGF0R3JvdXBWaWV3LCBJQ2hhdEdyb3VwQ29udGV4dCB9IGZyb20gJy4vY2hhdEdyb3VwVmlldy5qcyc7XG5pbXBvcnQgeyBDaGF0RHJvcFpvbmUsIENoYXRHcm91cERyb3BUYXJnZXQsIElDaGF0R3JvdXBEcm9wVGFyZ2V0RGVsZWdhdGUgfSBmcm9tICcuL2NoYXRHcm91cERyb3BUYXJnZXQuanMnO1xuaW1wb3J0IHsgSURyYWdnZWRTZXNzaW9uQ2hhdCwgaXNTZXNzaW9uQ2hhdERyYWcgfSBmcm9tICcuLi9kbmQuanMnO1xuXG5pbnRlcmZhY2UgSUdyb3VwRW50cnkge1xuXHRyZWFkb25seSBpZDogbnVtYmVyO1xuXHRyZWFkb25seSB2aWV3OiBDaGF0R3JvdXBWaWV3O1xuXHQvKiogUmVzb3VyY2VzIChhcyBzdHJpbmdzKSBhc3NpZ25lZCB0byB0aGlzIGdyb3VwLCBpbiB0YWIgb3JkZXIuICovXG5cdHJlYWRvbmx5IHJlc291cmNlSWRzOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZ1tdPjtcblx0LyoqIFRoZSByZXNvdXJjZSAoYXMgYSBzdHJpbmcpIG9mIHRoZSBjaGF0IHRoaXMgZ3JvdXAgY3VycmVudGx5IHNob3dzLiAqL1xuXHRyZWFkb25seSBhY3RpdmVSZXNvdXJjZUlkOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZz47XG5cdC8qKiBUaGUge0BsaW5rIElDaGF0fXMgYXNzaWduZWQgdG8gdGhpcyBncm91cCwgZGVyaXZlZCBmcm9tIHtAbGluayByZXNvdXJjZUlkc30uICovXG5cdHJlYWRvbmx5IGNoYXRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPjtcblx0LyoqIFdoZXRoZXIgdGhpcyBncm91cCdzIHRhYiBzdHJpcCBzaG91bGQgYmUgc2hvd24uICovXG5cdHJlYWRvbmx5IHRhYnNWaXNpYmxlOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcbn1cblxuLyoqIEEgc2luZ2xlIGdyb3VwIHdpdGhpbiBhIHBlcnNpc3RlZCBjaGF0IGdyaWQgbGF5b3V0LiAqL1xuaW50ZXJmYWNlIElTZXJpYWxpemVkQ2hhdEdyb3VwIHtcblx0LyoqIFJlc291cmNlcyAoYXMgc3RyaW5ncykgYXNzaWduZWQgdG8gdGhpcyBncm91cCwgaW4gdGFiIG9yZGVyLiAqL1xuXHRyZWFkb25seSByZXNvdXJjZUlkczogc3RyaW5nW107XG5cdC8qKiBUaGUgcmVzb3VyY2UgKGFzIGEgc3RyaW5nKSBvZiB0aGUgY2hhdCB0aGlzIGdyb3VwIHNob3dlZC4gKi9cblx0cmVhZG9ubHkgYWN0aXZlUmVzb3VyY2VJZDogc3RyaW5nO1xufVxuXG4vKiogUGVyc2lzdGVkIGdyaWQgbGF5b3V0IGZvciBhIHNpbmdsZSBzZXNzaW9uLCBrZXllZCBieSB7QGxpbmsgSVNlc3Npb24uc2Vzc2lvbklkfS4gKi9cbmludGVyZmFjZSBJU2VyaWFsaXplZENoYXRHcm91cHNMYXlvdXQge1xuXHRyZWFkb25seSB2ZXJzaW9uOiAxO1xuXHQvKiogVGhlIGdyaWQgdHJlZSAoc3RydWN0dXJlICsgc2l6ZXMpOyBlYWNoIGxlYWYncyBkYXRhIGNhcnJpZXMgaXRzIGdyb3VwIGluZGV4LiAqL1xuXHRyZWFkb25seSBncmlkOiBJU2VyaWFsaXplZEdyaWQ7XG5cdC8qKiBUaGUgZ3JvdXBzLCBpbmRleGVkIGJ5IHRoZSBgaW5kZXhgIHN0b3JlZCBpbiBlYWNoIGdyaWQgbGVhZi4gKi9cblx0cmVhZG9ubHkgZ3JvdXBzOiBJU2VyaWFsaXplZENoYXRHcm91cFtdO1xuXHQvKiogSW5kZXggb2YgdGhlIGFjdGl2ZSBncm91cCB3aXRoaW4ge0BsaW5rIGdyb3Vwc30uICovXG5cdHJlYWRvbmx5IGFjdGl2ZUdyb3VwSW5kZXg6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBIb3N0cyB0aGUgZ3JpZCBvZiBjaGF0IGdyb3VwcyB3aXRoaW4gYSBzaW5nbGUge0BsaW5rIElBY3RpdmVTZXNzaW9ufS4gQ2hhdHNcbiAqIGRlZmF1bHQgdG8gYSBzaW5nbGUgZ3JvdXAgKHRhYiBzdHJpcCkuIERyYWdnaW5nIGEgY2hhdCB0YWIgdG8gYSBncm91cCdzIGVkZ2VcbiAqIHNwbGl0cyBpdCBpbnRvIGEgbmV3IGdyb3VwOyBkcm9wcGluZyBpdCBvbnRvIGFub3RoZXIgZ3JvdXAncyBjZW50ZXIgbW92ZXMgaXRcbiAqIHRoZXJlIFx1MjAxNCBtaXJyb3JpbmcgVlMgQ29kZSBlZGl0b3IgZ3JvdXBzLlxuICpcbiAqIFRoZSBzZXNzaW9uIGlzIHRoZSBzaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciB3aGljaCBjaGF0cyBleGlzdDsgdGhlIGdyaWQgaXNcbiAqIGEgVUktb25seSBwYXJ0aXRpb24gb3ZlciB0aG9zZSBjaGF0cy4gVGhlIHBhcnRpdGlvbiAoZ3JvdXBzLCB0aGVpciBhc3NpZ25lZFxuICogY2hhdHMsIGFuZCB0aGUgZ3JpZCBzdHJ1Y3R1cmUvc2l6ZXMpIGlzIHBlcnNpc3RlZCBwZXIgc2Vzc2lvbiB0byB3b3Jrc3BhY2VcbiAqIHN0b3JhZ2UgYW5kIHJlc3RvcmVkIG9uIHJlbG9hZCB2aWEge0BsaW5rIF90cnlSZXN0b3JlTGF5b3V0fS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRHcm91cHNWaWV3IGV4dGVuZHMgVGhlbWFibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNUT1JBR0VfS0VZID0gJ3Nlc3Npb25zLmNoYXRHcm91cHNMYXlvdXQnO1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50ID0gJCgnLmNoYXQtZ3JvdXBzLXZpZXcnKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZ3JvdXBEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSBfY3VycmVudFNlc3Npb25TdG9yZTogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2dyaWQ6IFNlcmlhbGl6YWJsZUdyaWQ8Q2hhdEdyb3VwVmlldz4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2dyb3VwczogSUdyb3VwRW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIF9hY3RpdmVHcm91cDogSUdyb3VwRW50cnkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dyb3VwQ291bnQgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAxKTtcblx0LyoqIE51bWJlciBvZiBjaGF0IGdyb3VwcyBjdXJyZW50bHkgaW4gdGhlIGdyaWQuIGA+IDFgIG1lYW5zIGEgZ3JpZCBsYXlvdXQuICovXG5cdGdldCBncm91cENvdW50KCk6IElPYnNlcnZhYmxlPG51bWJlcj4geyByZXR1cm4gdGhpcy5fZ3JvdXBDb3VudDsgfVxuXHRwcml2YXRlIF9uZXh0R3JvdXBJZCA9IDA7XG5cblx0cHJpdmF0ZSBfc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX29wdGlvbnM6IElDaGF0Vmlld09wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21haW5DaGF0UmVzb3VyY2U6IElPYnNlcnZhYmxlPHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Nlc3Npb25BY3RpdmUgPSB0cnVlO1xuXHRwcml2YXRlIF9zZXNzaW9uVmlzaWJsZSA9IHRydWU7XG5cblx0LyoqIFdoaWxlIHJlc3RvcmluZyBhIHBlcnNpc3RlZCBsYXlvdXQ6IHJvdXRlcyAobGF0ZS1sb2FkaW5nKSBjaGF0cyBiYWNrIHRvIHRoZWlyIHNhdmVkIGdyb3Vwcy4gKi9cblx0cHJpdmF0ZSBfcmVzdG9yZUFzc2lnbm1lbnQ6IE1hcDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQ7XG5cdC8qKiBTYXZlZCB0YWIgb3JkZXIgKHJlc291cmNlIHN0cmluZyAtPiBvcmRpbmFsKSB1c2VkIHRvIHJlc3RvcmUgdGFiIG9yZGVyIGFjcm9zcyBncm91cHMuICovXG5cdHByaXZhdGUgX3Jlc3RvcmVPcmRlcjogTWFwPHN0cmluZywgbnVtYmVyPiB8IHVuZGVmaW5lZDtcblx0LyoqIFRoZSBzZXNzaW9uJ3MgY2hhdCBpZHMgcHJlc2VudCB3aGVuIHJlc3RvcmUgYmVnYW4sIHVzZWQgdG8gZGV0ZWN0IHdoZW4gdGhlIGNhdGFsb2cgaGFzIGxvYWRlZC4gKi9cblx0cHJpdmF0ZSBfcmVzdG9yZUluaXRpYWxJZHM6IFNldDxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlciBhIHBlcnNpc3RlZCBsYXlvdXQgaXMgc3RpbGwgYmVpbmcgcmVzdG9yZWQgKHNhdmVkIGNoYXRzIG1heSBub3QgaGF2ZSBsb2FkZWQgeWV0KS4gKi9cblx0cHJpdmF0ZSBfcmVzdG9yZVBlbmRpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbGFzdFNlc3Npb25BY3RpdmVDaGF0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9sYXN0TGF5b3V0OiB7IHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7IHJlYWRvbmx5IGhlaWdodDogbnVtYmVyOyByZWFkb25seSB0b3A6IG51bWJlcjsgcmVhZG9ubHkgbGVmdDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0aGVtZVNlcnZpY2UpO1xuXHR9XG5cblx0LyoqIFNldHMgKG9yIGNsZWFycykgdGhlIHNlc3Npb24gd2hvc2UgY2hhdHMgdGhpcyB2aWV3IHBhcnRpdGlvbnMgaW50byBncm91cHMuICovXG5cdHNldFNlc3Npb24oc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQsIG9wdGlvbnM6IElDaGF0Vmlld09wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9vcHRpb25zID0gb3B0aW9ucztcblx0XHRpZiAodGhpcy5fc2Vzc2lvbiA9PT0gc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNuYXBzaG90IHRoZSBvdXRnb2luZyBzZXNzaW9uJ3MgbGF5b3V0IChjYXB0dXJlcyBmaW5hbCBncmlkIHNpemVzKSBiZWZvcmUgdGVhcmluZyBpdCBkb3duLlxuXHRcdHRoaXMuX3BlcnNpc3RMYXlvdXQoKTtcblxuXHRcdHRoaXMuX3Nlc3Npb24gPSBzZXNzaW9uO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLnZhbHVlID0gc3RvcmU7XG5cdFx0dGhpcy5fZ3JvdXBEaXNwb3NhYmxlcy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHR0aGlzLl9jdXJyZW50U2Vzc2lvblN0b3JlID0gc3RvcmU7XG5cdFx0dGhpcy5fZ3JpZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9ncm91cHMgPSBbXTtcblx0XHR0aGlzLl9hY3RpdmVHcm91cCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZXN0b3JlQXNzaWdubWVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZXN0b3JlT3JkZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVzdG9yZUluaXRpYWxJZHMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVzdG9yZVBlbmRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9sYXN0U2Vzc2lvbkFjdGl2ZUNoYXRJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zZXRHcm91cENvdW50KDEpO1xuXG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbWFpbkNoYXRSZXNvdXJjZSA9IGRlcml2ZWQocmVhZGVyID0+IHNlc3Npb24ubWFpbkNoYXQucmVhZChyZWFkZXIpLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3QgZ3JpZCA9IHNlc3Npb24uaXNDcmVhdGVkLmdldCgpXG5cdFx0XHQ/IHRoaXMuX3RyeVJlc3RvcmVMYXlvdXQoc2Vzc2lvbiwgc3RvcmUpID8/IHRoaXMuX2NyZWF0ZVNpbmdsZUdyb3VwR3JpZChzZXNzaW9uLCBzdG9yZSlcblx0XHRcdDogdGhpcy5fY3JlYXRlU2luZ2xlR3JvdXBHcmlkKHNlc3Npb24sIHN0b3JlKTtcblx0XHR0aGlzLl9ncmlkID0gZ3JpZDtcblx0XHRzdG9yZS5hZGQoZ3JpZCk7XG5cdFx0dGhpcy5lbGVtZW50LnJlcGxhY2VDaGlsZHJlbihncmlkLmVsZW1lbnQpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZ3JpZC5lbGVtZW50LnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCBkcm9wRGVsZWdhdGU6IElDaGF0R3JvdXBEcm9wVGFyZ2V0RGVsZWdhdGUgPSB7XG5cdFx0XHRpc0NoYXREcmFnOiBldmVudCA9PiBpc1Nlc3Npb25DaGF0RHJhZyhldmVudCwgc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdFx0ZmluZFRhcmdldEdyb3VwOiBjaGlsZCA9PiB0aGlzLl9maW5kVGFyZ2V0R3JvdXAoY2hpbGQpLFxuXHRcdFx0b25DaGF0RHJvcDogKGdyb3VwSWQsIHpvbmUsIGRhdGEpID0+IHRoaXMuX29uQ2hhdERyb3AoZ3JvdXBJZCwgem9uZSwgZGF0YSksXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEdyb3VwRHJvcFRhcmdldCwgdGhpcy5lbGVtZW50LCBkcm9wRGVsZWdhdGUpKTtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB0aGlzLl9yZWNvbmNpbGUocmVhZGVyKSkpO1xuXG5cdFx0dGhpcy5fYXBwbHlMYXlvdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVNpbmdsZUdyb3VwR3JpZChzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IFNlcmlhbGl6YWJsZUdyaWQ8Q2hhdEdyb3VwVmlldz4ge1xuXHRcdGNvbnN0IGZpcnN0R3JvdXAgPSB0aGlzLl9jcmVhdGVHcm91cEVudHJ5KHNlc3Npb24pO1xuXHRcdHRoaXMuX2dyb3VwcyA9IFtmaXJzdEdyb3VwXTtcblx0XHR0aGlzLl9hY3RpdmVHcm91cCA9IGZpcnN0R3JvdXA7XG5cdFx0Zmlyc3RHcm91cC52aWV3LnNldEdyb3VwQWN0aXZlKHRydWUpO1xuXHRcdHRoaXMuX3NldEdyb3VwQ291bnQoMSk7XG5cdFx0cmV0dXJuIG5ldyBTZXJpYWxpemFibGVHcmlkKGZpcnN0R3JvdXAudmlldywgeyBzdHlsZXM6IHsgc2VwYXJhdG9yQm9yZGVyOiB0aGlzLl9zZXBhcmF0b3JCb3JkZXIgfSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWJ1aWxkcyBhIHBlcnNpc3RlZCBncmlkIGxheW91dCBmb3IgdGhlIHNlc3Npb24sIGlmIG9uZSBpcyBzdG9yZWQuIFJldHVybnNcblx0ICogYHVuZGVmaW5lZGAgdG8gZmFsbCBiYWNrIHRvIGEgc2luZ2xlIGdyb3VwLiBTYXZlZCBjaGF0cyBtYXkgbm90IGhhdmUgbG9hZGVkXG5cdCAqIHlldCAodGhlIGNhdGFsb2cgYXJyaXZlcyBhc3luY2hyb25vdXNseSk7IHtAbGluayBfcmVjb25jaWxlfSByb3V0ZXMgdGhlbSBiYWNrXG5cdCAqIHRvIHRoZWlyIGdyb3VwcyB2aWEge0BsaW5rIF9yZXN0b3JlQXNzaWdubWVudH0gb25jZSB0aGV5IGFwcGVhci5cblx0ICovXG5cdHByaXZhdGUgX3RyeVJlc3RvcmVMYXlvdXQoc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24sIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBTZXJpYWxpemFibGVHcmlkPENoYXRHcm91cFZpZXc+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzYXZlZCA9IHRoaXMuX2xvYWRTdG9yZWQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGlmICghc2F2ZWQgfHwgc2F2ZWQuZ3JvdXBzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4VG9FbnRyeSA9IG5ldyBNYXA8bnVtYmVyLCBJR3JvdXBFbnRyeT4oKTtcblx0XHRjb25zdCBkZXNlcmlhbGl6ZXI6IElWaWV3RGVzZXJpYWxpemVyPENoYXRHcm91cFZpZXc+ID0ge1xuXHRcdFx0ZnJvbUpTT046IChqc29uOiB7IGluZGV4PzogbnVtYmVyIH0gfCBudWxsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdHlwZW9mIGpzb24/LmluZGV4ID09PSAnbnVtYmVyJyA/IGpzb24uaW5kZXggOiBpbmRleFRvRW50cnkuc2l6ZTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9jcmVhdGVHcm91cEVudHJ5KHNlc3Npb24pO1xuXHRcdFx0XHRpbmRleFRvRW50cnkuc2V0KGluZGV4LCBlbnRyeSk7XG5cdFx0XHRcdHJldHVybiBlbnRyeS52aWV3O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgZ3JpZDogU2VyaWFsaXphYmxlR3JpZDxDaGF0R3JvdXBWaWV3Pjtcblx0XHR0cnkge1xuXHRcdFx0Z3JpZCA9IFNlcmlhbGl6YWJsZUdyaWQuZGVzZXJpYWxpemUoc2F2ZWQuZ3JpZCwgZGVzZXJpYWxpemVyLCB7IHN0eWxlczogeyBzZXBhcmF0b3JCb3JkZXI6IHRoaXMuX3NlcGFyYXRvckJvcmRlciB9IH0pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cHM6IElHcm91cEVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNhdmVkLmdyb3Vwcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZW50cnkgPSBpbmRleFRvRW50cnkuZ2V0KGkpO1xuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdGdyb3Vwcy5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGdyb3Vwcy5sZW5ndGggPD0gMSkge1xuXHRcdFx0Z3JpZC5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFzc2lnbm1lbnQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGNvbnN0IG9yZGVyID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRsZXQgb3JkaW5hbCA9IDA7XG5cdFx0c2F2ZWQuZ3JvdXBzLmZvckVhY2goKGcsIGkpID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gaW5kZXhUb0VudHJ5LmdldChpKTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBnLnJlc291cmNlSWRzKSB7XG5cdFx0XHRcdGFzc2lnbm1lbnQuc2V0KGlkLCBlbnRyeS5pZCk7XG5cdFx0XHRcdG9yZGVyLnNldChpZCwgb3JkaW5hbCsrKTtcblx0XHRcdH1cblx0XHRcdGlmIChnLmFjdGl2ZVJlc291cmNlSWQpIHtcblx0XHRcdFx0ZW50cnkuYWN0aXZlUmVzb3VyY2VJZC5zZXQoZy5hY3RpdmVSZXNvdXJjZUlkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fZ3JvdXBzID0gZ3JvdXBzO1xuXHRcdHRoaXMuX3Jlc3RvcmVBc3NpZ25tZW50ID0gYXNzaWdubWVudDtcblx0XHR0aGlzLl9yZXN0b3JlT3JkZXIgPSBvcmRlcjtcblx0XHR0aGlzLl9yZXN0b3JlSW5pdGlhbElkcyA9IG5ldyBTZXQoc2Vzc2lvbi52aXNpYmxlQ2hhdFRhYnMuZ2V0KCkubWFwKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpKSk7XG5cdFx0dGhpcy5fcmVzdG9yZVBlbmRpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX2FjdGl2ZUdyb3VwID0gaW5kZXhUb0VudHJ5LmdldChzYXZlZC5hY3RpdmVHcm91cEluZGV4KSA/PyBncm91cHNbMF07XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9ncm91cHMpIHtcblx0XHRcdGdyb3VwLnZpZXcuc2V0R3JvdXBBY3RpdmUoZ3JvdXAgPT09IHRoaXMuX2FjdGl2ZUdyb3VwKTtcblx0XHR9XG5cdFx0dGhpcy5fc2V0R3JvdXBDb3VudCh0aGlzLl9ncm91cHMubGVuZ3RoKTtcblx0XHRyZXR1cm4gZ3JpZDtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUdyb3VwRW50cnkoc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24pOiBJR3JvdXBFbnRyeSB7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9uZXh0R3JvdXBJZCsrO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2dyb3VwRGlzcG9zYWJsZXMuc2V0KGlkLCBzdG9yZSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VJZHMgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nW10+KGBjaGF0R3JvdXAuJHtpZH0ucmVzb3VyY2VJZHNgLCBbXSk7XG5cdFx0Y29uc3QgYWN0aXZlUmVzb3VyY2VJZCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmc+KGBjaGF0R3JvdXAuJHtpZH0uYWN0aXZlUmVzb3VyY2VJZGAsICcnKTtcblxuXHRcdGNvbnN0IGNoYXRzID0gZGVyaXZlZDxyZWFkb25seSBJQ2hhdFtdPihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWxsID0gc2Vzc2lvbi52aXNpYmxlQ2hhdFRhYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaWRzID0gcmVzb3VyY2VJZHMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdFtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGlkU3RyIG9mIGlkcykge1xuXHRcdFx0XHRjb25zdCBjaGF0ID0gYWxsLmZpbmQoYyA9PiBjLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGlkU3RyKTtcblx0XHRcdFx0aWYgKGNoYXQpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChjaGF0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhYnNWaXNpYmxlID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCFzZXNzaW9uLmlzQ3JlYXRlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gV2l0aCBtb3JlIHRoYW4gb25lIGdyb3VwIHRoZSB0YWIgc3RyaXAgaXMgYWx3YXlzIHNob3duIHNvIGVhY2ggZ3JvdXBcblx0XHRcdC8vIHN0YXlzIGludGVyYWN0aXZlOyB3aXRoIGEgbG9uZSBncm91cCBpdCBmb2xsb3dzIHRoZSBzZXNzaW9uJ3MgcnVsZS5cblx0XHRcdGlmICh0aGlzLl9ncm91cENvdW50LnJlYWQocmVhZGVyKSA+IDEpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbi5zaG91bGRTaG93Q2hhdFRhYnMucmVhZChyZWFkZXIpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdmlldyA9IHN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0R3JvdXBWaWV3KSk7XG5cdFx0Y29uc3QgZW50cnk6IElHcm91cEVudHJ5ID0geyBpZCwgdmlldywgcmVzb3VyY2VJZHMsIGFjdGl2ZVJlc291cmNlSWQsIGNoYXRzLCB0YWJzVmlzaWJsZSB9O1xuXG5cdFx0Ly8gRm9jdXNpbmcgYSBncm91cCBwcm9tb3RlcyBpdCB0byBhY3RpdmUgYW5kLCB3aGVuIHRoZSBsYXlvdXQgaXMgaW4gdGhlXG5cdFx0Ly8gY29sbGFwc2VkIChhY2NvcmRpb24pIHN0YXRlLCBleHBhbmRzIGl0IHdoaWxlIHRoZSBvdGhlcnMgc2hyaW5rIHRvIG1pbi5cblx0XHRzdG9yZS5hZGQodmlldy5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX29uR3JvdXBGb2N1c2VkKGVudHJ5KSkpO1xuXG5cdFx0Y29uc3QgY29udGV4dDogSUNoYXRHcm91cENvbnRleHQgPSB7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0b3B0aW9uczogdGhpcy5fb3B0aW9ucyEsXG5cdFx0XHRjaGF0cyxcblx0XHRcdGFjdGl2ZUNoYXRSZXNvdXJjZTogYWN0aXZlUmVzb3VyY2VJZCxcblx0XHRcdG1haW5DaGF0UmVzb3VyY2U6IHRoaXMuX21haW5DaGF0UmVzb3VyY2UhLFxuXHRcdFx0dGFic1Zpc2libGUsXG5cdFx0XHRvcGVuQ2hhdDogcmVzb3VyY2UgPT4gdGhpcy5fb3BlbkNoYXQoZW50cnksIHJlc291cmNlKSxcblx0XHRcdG5ld0NoYXQ6ICgpID0+IHRoaXMuX25ld0NoYXQoZW50cnkpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKSxcblx0XHRcdG9uVGFiRHJhZ1N0YXJ0OiAoKSA9PiB7IH0sXG5cdFx0XHRvblRhYkRyYWdFbmQ6ICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdHZpZXcuc2V0Q29udGV4dChjb250ZXh0KTtcblx0XHR2aWV3LnNldFNlc3Npb25BY3RpdmUodGhpcy5fc2Vzc2lvbkFjdGl2ZSk7XG5cdFx0dmlldy5zZXRTZXNzaW9uVmlzaWJsZSh0aGlzLl9zZXNzaW9uVmlzaWJsZSk7XG5cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbmNpbGUocmVhZGVyOiBJUmVhZGVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb247XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdHMgPSBzZXNzaW9uLnZpc2libGVDaGF0VGFicy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgYWN0aXZlQ2hhdCA9IHNlc3Npb24uYWN0aXZlQ2hhdC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgb3JkZXJlZElkcyA9IGNoYXRzLm1hcChjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgdmFsaWRJZHMgPSBuZXcgU2V0KG9yZGVyZWRJZHMpO1xuXHRcdGNvbnN0IGFjdGl2ZUlkID0gYWN0aXZlQ2hhdD8ucmVzb3VyY2UudG9TdHJpbmcoKTtcblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdC8vIFBydW5lIHN0YWxlIGFzc2lnbm1lbnRzLlxuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9ncm91cHMpIHtcblx0XHRcdFx0Y29uc3QgaWRzID0gZ3JvdXAucmVzb3VyY2VJZHMuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IHBydW5lZCA9IGlkcy5maWx0ZXIoaWQgPT4gdmFsaWRJZHMuaGFzKGlkKSk7XG5cdFx0XHRcdGlmIChwcnVuZWQubGVuZ3RoICE9PSBpZHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Z3JvdXAucmVzb3VyY2VJZHMuc2V0KHBydW5lZCwgdHgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFzc2lnbiBuZXdseSBhZGRlZCBjaGF0cy4gV2hpbGUgcmVzdG9yaW5nLCByb3V0ZSBlYWNoIGNoYXQgYmFjayB0byBpdHNcblx0XHRcdC8vIHNhdmVkIGdyb3VwOyBvdGhlcndpc2UgKGFuZCBmb3IgZ2VudWluZWx5IG5ldyBjaGF0cykgdXNlIHRoZSBhY3RpdmUgZ3JvdXAuXG5cdFx0XHRjb25zdCBhc3NpZ25lZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9ncm91cHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiBncm91cC5yZXNvdXJjZUlkcy5nZXQoKSkge1xuXHRcdFx0XHRcdGFzc2lnbmVkLmFkZChpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgaWQgb2Ygb3JkZXJlZElkcykge1xuXHRcdFx0XHRpZiAoYXNzaWduZWQuaGFzKGlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNhdmVkR3JvdXBJZCA9IHRoaXMuX3Jlc3RvcmVBc3NpZ25tZW50Py5nZXQoaWQpO1xuXHRcdFx0XHRsZXQgdGFyZ2V0ID0gc2F2ZWRHcm91cElkICE9PSB1bmRlZmluZWQgPyB0aGlzLl9ncm91cHMuZmluZChnID0+IGcuaWQgPT09IHNhdmVkR3JvdXBJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGNoYXQgPSBjaGF0cy5maW5kKGNoYXQgPT4gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpID09PSBpZCk7XG5cdFx0XHRcdGNvbnN0IHBhcmVudFJlc291cmNlID0gaWQgPT09IGFjdGl2ZUlkID8gY2hhdD8ub3JpZ2luPy5wYXJlbnRDaGF0IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRHcm91cCA9IHBhcmVudFJlc291cmNlXG5cdFx0XHRcdFx0PyB0aGlzLl9ncm91cHMuZmluZChncm91cCA9PiBncm91cC5yZXNvdXJjZUlkcy5nZXQoKS5pbmNsdWRlcyhwYXJlbnRSZXNvdXJjZS50b1N0cmluZygpKSlcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGFyZ2V0ID8/PSBwYXJlbnRHcm91cCA/IHRoaXMuX2ZpbmRBZGphY2VudEdyb3VwKHBhcmVudEdyb3VwKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGFyZ2V0ID8/PSB0aGlzLl9hY3RpdmVHcm91cDtcblx0XHRcdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0XHRcdHRhcmdldC5yZXNvdXJjZUlkcy5zZXQoWy4uLnRhcmdldC5yZXNvdXJjZUlkcy5nZXQoKSwgaWRdLCB0eCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gV2hpbGUgcmVzdG9yaW5nLCBrZWVwIGVhY2ggZ3JvdXAncyB0YWJzIGluIHRoZWlyIHNhdmVkIG9yZGVyLlxuXHRcdFx0aWYgKHRoaXMuX3Jlc3RvcmVQZW5kaW5nICYmIHRoaXMuX3Jlc3RvcmVPcmRlcikge1xuXHRcdFx0XHRjb25zdCByZXN0b3JlT3JkZXIgPSB0aGlzLl9yZXN0b3JlT3JkZXI7XG5cdFx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fZ3JvdXBzKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWRzID0gZ3JvdXAucmVzb3VyY2VJZHMuZ2V0KCk7XG5cdFx0XHRcdFx0Y29uc3Qgc29ydGVkID0gWy4uLmlkc10uc29ydCgoYSwgYikgPT4gKHJlc3RvcmVPcmRlci5nZXQoYSkgPz8gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIC0gKHJlc3RvcmVPcmRlci5nZXQoYikgPz8gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpKTtcblx0XHRcdFx0XHRpZiAoc29ydGVkLnNvbWUoKGlkLCBpKSA9PiBpZCAhPT0gaWRzW2ldKSkge1xuXHRcdFx0XHRcdFx0Z3JvdXAucmVzb3VyY2VJZHMuc2V0KHNvcnRlZCwgdHgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWN0aXZlSWQgJiYgYWN0aXZlSWQgIT09IHRoaXMuX2xhc3RTZXNzaW9uQWN0aXZlQ2hhdElkKSB7XG5cdFx0XHRcdGNvbnN0IG93bmVyID0gdGhpcy5fZ3JvdXBzLmZpbmQoZyA9PiBnLnJlc291cmNlSWRzLmdldCgpLmluY2x1ZGVzKGFjdGl2ZUlkKSk7XG5cdFx0XHRcdGlmIChvd25lcikge1xuXHRcdFx0XHRcdG93bmVyLmFjdGl2ZVJlc291cmNlSWQuc2V0KGFjdGl2ZUlkLCB0eCk7XG5cdFx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlR3JvdXAob3duZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0U2Vzc2lvbkFjdGl2ZUNoYXRJZCA9IGFjdGl2ZUlkO1xuXG5cdFx0XHQvLyBFbnN1cmUgZXZlcnkgZ3JvdXAgc2hvd3MgYSBjaGF0IGl0IGFjdHVhbGx5IG93bnMuXG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX2dyb3Vwcykge1xuXHRcdFx0XHRjb25zdCBpZHMgPSBncm91cC5yZXNvdXJjZUlkcy5nZXQoKTtcblx0XHRcdFx0aWYgKGlkcy5sZW5ndGggJiYgIWlkcy5pbmNsdWRlcyhncm91cC5hY3RpdmVSZXNvdXJjZUlkLmdldCgpKSkge1xuXHRcdFx0XHRcdGdyb3VwLmFjdGl2ZVJlc291cmNlSWQuc2V0KGlkc1swXSwgdHgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBGaW5pc2ggcmVzdG9yaW5nIG9uY2UgdGhlIHNhdmVkIGNoYXRzIGhhdmUgbG9hZGVkIChvciB0aGUgY2F0YWxvZyBoYXNcblx0XHQvLyBhcnJpdmVkIHdpdGhvdXQgdGhlbSwgbWVhbmluZyB0aGV5IHdlcmUgZGVsZXRlZCBiZXR3ZWVuIHJlbG9hZHMpLiBFbXB0eVxuXHRcdC8vIGdyb3VwcyBhcmUga2VwdCB3aGlsZSByZXN0b3JlIGlzIHBlbmRpbmcgc28gbGF0ZS1sb2FkaW5nIGNoYXRzIHN0aWxsIGhhdmVcblx0XHQvLyBhIGhvbWU7IG9uY2UgcmVzdG9yZSBjb21wbGV0ZXMsIGFueSBncm91cCBsZWZ0IGVtcHR5IGlzIGNvbGxhcHNlZC5cblx0XHRpZiAodGhpcy5fcmVzdG9yZVBlbmRpbmcpIHtcblx0XHRcdGNvbnN0IGFsbFNhdmVkUHJlc2VudCA9IHRoaXMuX3Jlc3RvcmVBc3NpZ25tZW50ID8gWy4uLnRoaXMuX3Jlc3RvcmVBc3NpZ25tZW50LmtleXMoKV0uZXZlcnkoaWQgPT4gdmFsaWRJZHMuaGFzKGlkKSkgOiB0cnVlO1xuXHRcdFx0Y29uc3QgY2F0YWxvZ0NoYW5nZWQgPSAhdGhpcy5fcmVzdG9yZUluaXRpYWxJZHMgfHwgb3JkZXJlZElkcy5sZW5ndGggIT09IHRoaXMuX3Jlc3RvcmVJbml0aWFsSWRzLnNpemUgfHwgb3JkZXJlZElkcy5zb21lKGlkID0+ICF0aGlzLl9yZXN0b3JlSW5pdGlhbElkcyEuaGFzKGlkKSk7XG5cdFx0XHRjb25zdCBjYXRhbG9nU2V0dGxlZCA9ICFzZXNzaW9uLmxvYWRpbmcucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGFsbFNhdmVkUHJlc2VudCB8fCBjYXRhbG9nQ2hhbmdlZCB8fCBjYXRhbG9nU2V0dGxlZCkge1xuXHRcdFx0XHR0aGlzLl9yZXN0b3JlUGVuZGluZyA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9yZXN0b3JlQXNzaWdubWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fcmVzdG9yZU9yZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9yZXN0b3JlSW5pdGlhbElkcyA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3Jlc3RvcmVQZW5kaW5nKSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVFbXB0eUdyb3VwcygpO1xuXHRcdFx0dGhpcy5fcGVyc2lzdExheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRUYXJnZXRHcm91cChjaGlsZDogSFRNTEVsZW1lbnQpOiB7IHJlYWRvbmx5IGlkOiBudW1iZXI7IHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50IH0gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fZ3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAudmlldy5lbGVtZW50LmNvbnRhaW5zKGNoaWxkKSkge1xuXHRcdFx0XHRyZXR1cm4geyBpZDogZ3JvdXAuaWQsIGVsZW1lbnQ6IGdyb3VwLnZpZXcuZWxlbWVudCB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25DaGF0RHJvcCh0YXJnZXRHcm91cElkOiBudW1iZXIsIHpvbmU6IENoYXREcm9wWm9uZSwgZGF0YTogSURyYWdnZWRTZXNzaW9uQ2hhdCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghZGF0YSB8fCAhdGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChkYXRhLnNlc3Npb25JZCAhPT0gdGhpcy5fc2Vzc2lvbi5zZXNzaW9uSWQpIHtcblx0XHRcdHJldHVybjsgLy8gbm90IGEgY2hhdCBmcm9tIHRoaXMgc2Vzc2lvblxuXHRcdH1cblxuXHRcdGNvbnN0IGlkID0gZGF0YS5yZXNvdXJjZTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShpZCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZ3JvdXBzLmZpbmQoZyA9PiBnLmlkID09PSB0YXJnZXRHcm91cElkKTtcblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLl9ncm91cHMuZmluZChnID0+IGcucmVzb3VyY2VJZHMuZ2V0KCkuaW5jbHVkZXMoaWQpKTtcblx0XHRpZiAoIXRhcmdldCB8fCAhc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHpvbmUgPT09ICdjZW50ZXInKSB7XG5cdFx0XHRpZiAoc291cmNlID09PSB0YXJnZXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbW92ZUNoYXRUb0dyb3VwKHJlc291cmNlLCBzb3VyY2UsIHRhcmdldCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNwbGl0dGluZyBvdXQgdGhlIG9ubHkgdGFiIG9mIGl0cyBncm91cCB3b3VsZCBqdXN0IHJlbG9jYXRlIHRoZVxuXHRcdFx0Ly8gZ3JvdXAsIHNvIHRyZWF0IGl0IGFzIGEgbm8tb3AuXG5cdFx0XHRpZiAoc291cmNlID09PSB0YXJnZXQgJiYgc291cmNlLnJlc291cmNlSWRzLmdldCgpLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NwbGl0Q2hhdEludG9OZXdHcm91cChyZXNvdXJjZSwgc291cmNlLCB0YXJnZXQsIHpvbmUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21vdmVDaGF0VG9Hcm91cChyZXNvdXJjZTogVVJJLCBzb3VyY2U6IElHcm91cEVudHJ5LCB0YXJnZXQ6IElHcm91cEVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgaWQgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX2RldGFjaENoYXRGcm9tR3JvdXAoc291cmNlLCBpZCwgdHgpO1xuXHRcdFx0aWYgKCF0YXJnZXQucmVzb3VyY2VJZHMuZ2V0KCkuaW5jbHVkZXMoaWQpKSB7XG5cdFx0XHRcdHRhcmdldC5yZXNvdXJjZUlkcy5zZXQoWy4uLnRhcmdldC5yZXNvdXJjZUlkcy5nZXQoKSwgaWRdLCB0eCk7XG5cdFx0XHR9XG5cdFx0XHR0YXJnZXQuYWN0aXZlUmVzb3VyY2VJZC5zZXQoaWQsIHR4KTtcblx0XHR9KTtcblx0XHR0aGlzLl9zZXRBY3RpdmVHcm91cCh0YXJnZXQpO1xuXHRcdHRoaXMuX3Nlc3Npb25zU2VydmljZS5vcGVuQ2hhdCh0aGlzLl9zZXNzaW9uISwgcmVzb3VyY2UpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR0aGlzLl9yZW1vdmVFbXB0eUdyb3VwcygpO1xuXHRcdHRoaXMuX3BlcnNpc3RMYXlvdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NwbGl0Q2hhdEludG9OZXdHcm91cChyZXNvdXJjZTogVVJJLCBzb3VyY2U6IElHcm91cEVudHJ5LCByZWZlcmVuY2U6IElHcm91cEVudHJ5LCB6b25lOiBFeGNsdWRlPENoYXREcm9wWm9uZSwgJ2NlbnRlcic+KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9ncmlkIHx8ICF0aGlzLl9jdXJyZW50U2Vzc2lvblN0b3JlIHx8ICF0aGlzLl9zZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlkID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBuZXdHcm91cCA9IHRoaXMuX2NyZWF0ZUdyb3VwRW50cnkodGhpcy5fc2Vzc2lvbik7XG5cdFx0dGhpcy5fZ3JpZC5hZGRWaWV3KG5ld0dyb3VwLnZpZXcsIFNpemluZy5EaXN0cmlidXRlLCByZWZlcmVuY2UudmlldywgdGhpcy5fem9uZVRvRGlyZWN0aW9uKHpvbmUpKTtcblx0XHR0aGlzLl9pbnNlcnRHcm91cChuZXdHcm91cCwgcmVmZXJlbmNlLCB6b25lKTtcblx0XHR0aGlzLl9zZXRHcm91cENvdW50KHRoaXMuX2dyb3Vwcy5sZW5ndGgpO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fZGV0YWNoQ2hhdEZyb21Hcm91cChzb3VyY2UsIGlkLCB0eCk7XG5cdFx0XHRuZXdHcm91cC5yZXNvdXJjZUlkcy5zZXQoW2lkXSwgdHgpO1xuXHRcdFx0bmV3R3JvdXAuYWN0aXZlUmVzb3VyY2VJZC5zZXQoaWQsIHR4KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3NldEFjdGl2ZUdyb3VwKG5ld0dyb3VwKTtcblx0XHR0aGlzLl9zZXNzaW9uc1NlcnZpY2Uub3BlbkNoYXQodGhpcy5fc2Vzc2lvbiwgcmVzb3VyY2UpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR0aGlzLl9yZW1vdmVFbXB0eUdyb3VwcygpO1xuXHRcdHRoaXMuX2FwcGx5TGF5b3V0KCk7XG5cdFx0dGhpcy5fcGVyc2lzdExheW91dCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYSBjaGF0IGZyb20gYSBncm91cC4gSWYgaXQgd2FzIHRoZSBncm91cCdzIGFjdGl2ZSBjaGF0LCBhY3RpdmF0ZXMgYVxuXHQgKiByZW1haW5pbmcgb25lIHNvIHRoZSBzb3VyY2UgZ3JvdXAga2VlcHMgc2hvd2luZyBhIGNoYXQgaXQgc3RpbGwgb3ducy5cblx0ICovXG5cdHByaXZhdGUgX2RldGFjaENoYXRGcm9tR3JvdXAoZ3JvdXA6IElHcm91cEVudHJ5LCBpZDogc3RyaW5nLCB0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVtYWluaW5nID0gZ3JvdXAucmVzb3VyY2VJZHMuZ2V0KCkuZmlsdGVyKHggPT4geCAhPT0gaWQpO1xuXHRcdGdyb3VwLnJlc291cmNlSWRzLnNldChyZW1haW5pbmcsIHR4KTtcblx0XHRpZiAoZ3JvdXAuYWN0aXZlUmVzb3VyY2VJZC5nZXQoKSA9PT0gaWQgJiYgcmVtYWluaW5nLmxlbmd0aCkge1xuXHRcdFx0Z3JvdXAuYWN0aXZlUmVzb3VyY2VJZC5zZXQocmVtYWluaW5nWzBdLCB0eCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW5zIGEgY2hhdCBpbiBhIGdyb3VwIGJlc2lkZSB0aGUgYWN0aXZlIG9uZSAoXCJvcGVuIHRvIHRoZSBzaWRlXCIpLiBJZiB0aGVcblx0ICogY2hhdCBpcyBhbHJlYWR5IHNob3duIGluIGEgZ3JvdXAsIHRoYXQgZ3JvdXAgaXMgZm9jdXNlZCBpbnN0ZWFkIG9mIGNyZWF0aW5nXG5cdCAqIGEgZHVwbGljYXRlOyBvdGhlcndpc2UgYSBuZXcgZ3JvdXAgaXMgY3JlYXRlZCB0byB0aGUgcmlnaHQgb2YgdGhlIGFjdGl2ZVxuXHQgKiBncm91cCBhbmQgdGhlIGNoYXQgaXMgc2hvd24gdGhlcmUuXG5cdCAqL1xuXHRhc3luYyBvcGVuQ2hhdEluTmV3R3JvdXAocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvbiB8fCAhdGhpcy5fZ3JpZCB8fCAhdGhpcy5fY3VycmVudFNlc3Npb25TdG9yZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpZCA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2dyb3Vwcy5maW5kKGcgPT4gZy5yZXNvdXJjZUlkcy5nZXQoKS5pbmNsdWRlcyhpZCkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0ZXhpc3RpbmcuYWN0aXZlUmVzb3VyY2VJZC5zZXQoaWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zZXRBY3RpdmVHcm91cChleGlzdGluZyk7XG5cdFx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uc1NlcnZpY2Uub3BlbkNoYXQodGhpcy5fc2Vzc2lvbiwgcmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IHRoaXMuX2FjdGl2ZUdyb3VwID8/IHRoaXMuX2dyb3Vwc1swXTtcblx0XHRpZiAoIXJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbjtcblx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uc1NlcnZpY2Uub3BlbkNoYXQoc2Vzc2lvbiwgcmVzb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uICE9PSBzZXNzaW9uIHx8ICFzZXNzaW9uLnZpc2libGVDaGF0VGFicy5nZXQoKS5zb21lKGNoYXQgPT4gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpID09PSBpZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdHcm91cCA9IHRoaXMuX2NyZWF0ZUdyb3VwRW50cnkoc2Vzc2lvbik7XG5cdFx0dGhpcy5fZ3JpZC5hZGRWaWV3KG5ld0dyb3VwLnZpZXcsIFNpemluZy5EaXN0cmlidXRlLCByZWZlcmVuY2UudmlldywgRGlyZWN0aW9uLlJpZ2h0KTtcblx0XHR0aGlzLl9pbnNlcnRHcm91cChuZXdHcm91cCwgcmVmZXJlbmNlLCAncmlnaHQnKTtcblx0XHR0aGlzLl9zZXRHcm91cENvdW50KHRoaXMuX2dyb3Vwcy5sZW5ndGgpO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Y29uc3QgYXNzaWduZWRHcm91cCA9IHRoaXMuX2dyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwICE9PSBuZXdHcm91cCAmJiBncm91cC5yZXNvdXJjZUlkcy5nZXQoKS5pbmNsdWRlcyhpZCkpO1xuXHRcdFx0aWYgKGFzc2lnbmVkR3JvdXApIHtcblx0XHRcdFx0dGhpcy5fZGV0YWNoQ2hhdEZyb21Hcm91cChhc3NpZ25lZEdyb3VwLCBpZCwgdHgpO1xuXHRcdFx0fVxuXHRcdFx0bmV3R3JvdXAucmVzb3VyY2VJZHMuc2V0KFtpZF0sIHR4KTtcblx0XHRcdG5ld0dyb3VwLmFjdGl2ZVJlc291cmNlSWQuc2V0KGlkLCB0eCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zZXRBY3RpdmVHcm91cChuZXdHcm91cCk7XG5cdFx0dGhpcy5fcmVtb3ZlRW1wdHlHcm91cHMoKTtcblx0XHR0aGlzLl9hcHBseUxheW91dCgpO1xuXHRcdHRoaXMuX3BlcnNpc3RMYXlvdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRBZGphY2VudEdyb3VwKHJlZmVyZW5jZTogSUdyb3VwRW50cnkpOiBJR3JvdXBFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2dyaWQgJiYgdGhpcy5fbGFzdExheW91dCkge1xuXHRcdFx0Zm9yIChjb25zdCBkaXJlY3Rpb24gb2YgW0RpcmVjdGlvbi5SaWdodCwgRGlyZWN0aW9uLkxlZnQsIERpcmVjdGlvbi5Eb3duLCBEaXJlY3Rpb24uVXBdKSB7XG5cdFx0XHRcdGNvbnN0IG5laWdoYm9yID0gdGhpcy5fZ3JpZC5nZXROZWlnaGJvclZpZXdzKHJlZmVyZW5jZS52aWV3LCBkaXJlY3Rpb24pWzBdO1xuXHRcdFx0XHRjb25zdCBncm91cCA9IG5laWdoYm9yICYmIHRoaXMuX2dyb3Vwcy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUudmlldyA9PT0gbmVpZ2hib3IpO1xuXHRcdFx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZWZlcmVuY2VJbmRleCA9IHRoaXMuX2dyb3Vwcy5pbmRleE9mKHJlZmVyZW5jZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2dyb3Vwc1tyZWZlcmVuY2VJbmRleCArIDFdID8/IHRoaXMuX2dyb3Vwc1tyZWZlcmVuY2VJbmRleCAtIDFdO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5zZXJ0R3JvdXAoZ3JvdXA6IElHcm91cEVudHJ5LCByZWZlcmVuY2U6IElHcm91cEVudHJ5LCB6b25lOiBFeGNsdWRlPENoYXREcm9wWm9uZSwgJ2NlbnRlcic+KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVmZXJlbmNlSW5kZXggPSB0aGlzLl9ncm91cHMuaW5kZXhPZihyZWZlcmVuY2UpO1xuXHRcdGNvbnN0IGluc2VydEJlZm9yZSA9IHpvbmUgPT09ICdsZWZ0JyB8fCB6b25lID09PSAndG9wJztcblx0XHR0aGlzLl9ncm91cHMuc3BsaWNlKHJlZmVyZW5jZUluZGV4ICsgKGluc2VydEJlZm9yZSA/IDAgOiAxKSwgMCwgZ3JvdXApO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBsYWNlcyBhIGZyZXNobHkgY3JlYXRlZCBjaGF0IChlLmcuIGEgc2lkZSBjaGF0KSBiZXNpZGUgdGhlIGN1cnJlbnQgb25lLlxuXHQgKiBVbmxpa2Uge0BsaW5rIG9wZW5DaGF0SW5OZXdHcm91cH0gXHUyMDE0IHdoaWNoIGZvY3VzZXMgdGhlIGNoYXQgaW4gcGxhY2Ugd2hlbiBpdFxuXHQgKiBpcyBhbHJlYWR5IHZpc2libGUgXHUyMDE0IHRoaXMgbW92ZXMgdGhlIGNoYXQgb3V0IG9mIGEgc2hhcmVkIGdyb3VwIGludG8gaXRzIG93blxuXHQgKiBncm91cCB0byB0aGUgcmlnaHQgc28gaXQgc2l0cyBuZXh0IHRvIHRoZSBjaGF0IGl0IHdhcyBjcmVhdGVkIGZyb20uIENhbGxlZFxuXHQgKiBvbmx5IGF0IGNyZWF0aW9uIHRpbWU7IGlmIHRoZSBjaGF0IGlzIGFscmVhZHkgYWxvbmUgaW4gaXRzIGdyb3VwIChub3RoaW5nIHRvXG5cdCAqIHNpdCBiZXNpZGUpIGl0IGlzIGxlZnQgd2hlcmUgaXQgaXMuXG5cdCAqL1xuXHRzcGxpdENoYXRUb1NpZGUocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvbiB8fCAhdGhpcy5fZ3JpZCB8fCAhdGhpcy5fY3VycmVudFNlc3Npb25TdG9yZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpZCA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5fZ3JvdXBzLmZpbmQoZyA9PiBnLnJlc291cmNlSWRzLmdldCgpLmluY2x1ZGVzKGlkKSk7XG5cdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0Ly8gQWxyZWFkeSBhbG9uZSBpbiBpdHMgb3duIGdyb3VwOiBub3RoaW5nIHRvIHNpdCBiZXNpZGUsIGtlZXAgaXQuXG5cdFx0XHRpZiAoc291cmNlLnJlc291cmNlSWRzLmdldCgpLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRcdHRoaXMuX3NldEFjdGl2ZUdyb3VwKHNvdXJjZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NwbGl0Q2hhdEludG9OZXdHcm91cChyZXNvdXJjZSwgc291cmNlLCBzb3VyY2UsICdyaWdodCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBOb3QgYXNzaWduZWQgeWV0OiBvbmx5IG9wZW4gdG8gdGhlIHNpZGUgd2hlbiB0aGVyZSBpcyBhbm90aGVyIGNoYXQgdG9cblx0XHQvLyBzaXQgYmVzaWRlOyBvdGhlcndpc2UgbGV0IHRoZSBub3JtYWwgcmVjb25jaWxlIGFzc2lnbiBpdCBpbiBwbGFjZS5cblx0XHRpZiAodGhpcy5fZ3JvdXBzLnNvbWUoZyA9PiBnLnJlc291cmNlSWRzLmdldCgpLnNvbWUoeCA9PiB4ICE9PSBpZCkpKSB7XG5cdFx0XHR0aGlzLm9wZW5DaGF0SW5OZXdHcm91cChyZXNvdXJjZSkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUVtcHR5R3JvdXBzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZ3JpZCB8fCB0aGlzLl9ncm91cHMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW1wdGllcyA9IHRoaXMuX2dyb3Vwcy5maWx0ZXIoZyA9PiBnLnJlc291cmNlSWRzLmdldCgpLmxlbmd0aCA9PT0gMCk7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBlbXB0aWVzKSB7XG5cdFx0XHRpZiAodGhpcy5fZ3JvdXBzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaGFkRm9jdXMgPSBncm91cC52aWV3LmVsZW1lbnQuY29udGFpbnMoZ3JvdXAudmlldy5lbGVtZW50Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCk7XG5cdFx0XHR0aGlzLl9ncmlkLnJlbW92ZVZpZXcoZ3JvdXAudmlldywgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXHRcdFx0dGhpcy5fZ3JvdXBzID0gdGhpcy5fZ3JvdXBzLmZpbHRlcihnID0+IGcgIT09IGdyb3VwKTtcblx0XHRcdGlmICh0aGlzLl9hY3RpdmVHcm91cCA9PT0gZ3JvdXApIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlR3JvdXAgPSB0aGlzLl9ncm91cHNbMF07XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUdyb3VwPy52aWV3LnNldEdyb3VwQWN0aXZlKHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZ3JvdXBEaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKGdyb3VwLmlkKTtcblx0XHRcdGlmIChoYWRGb2N1cykge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVHcm91cD8udmlldy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9zZXRHcm91cENvdW50KHRoaXMuX2dyb3Vwcy5sZW5ndGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0QWN0aXZlR3JvdXAoZW50cnk6IElHcm91cEVudHJ5KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUdyb3VwID09PSBlbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVHcm91cCA9IGVudHJ5O1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fZ3JvdXBzKSB7XG5cdFx0XHRncm91cC52aWV3LnNldEdyb3VwQWN0aXZlKGdyb3VwID09PSBlbnRyeSk7XG5cdFx0fVxuXHRcdHRoaXMuX3BlcnNpc3RMYXlvdXQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGZvY3VzIGVudGVyaW5nIGEgZ3JvdXA6IHByb21vdGVzIGl0IHRvIHRoZSBhY3RpdmUgZ3JvdXAgYW5kLCB3aGVuXG5cdCAqIHRoYXQgZ3JvdXAgaXMgY3VycmVudGx5IGNvbGxhcHNlZCB0byBpdHMgbWluaW11bSBzaXplIGluIGEgc3BsaXQsIGV4cGFuZHMgaXRcblx0ICogc28gdGhlIG90aGVyIGdyb3VwcyBjb2xsYXBzZSB0byB0aGVpciBtaW5pbXVtLiBGb2N1c2luZyBhbiBhbHJlYWR5LWV4cGFuZGVkXG5cdCAqIGdyb3VwIChvciBhIGJhbGFuY2VkL21hbnVhbCBsYXlvdXQpIGxlYXZlcyB0aGUgc2l6ZXMgdW50b3VjaGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfb25Hcm91cEZvY3VzZWQoZW50cnk6IElHcm91cEVudHJ5KTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0QWN0aXZlR3JvdXAoZW50cnkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uO1xuXHRcdGNvbnN0IGFjdGl2ZVJlc291cmNlSWQgPSBlbnRyeS5hY3RpdmVSZXNvdXJjZUlkLmdldCgpO1xuXHRcdGlmIChzZXNzaW9uICYmIGFjdGl2ZVJlc291cmNlSWQgJiYgc2Vzc2lvbi5hY3RpdmVDaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCkgIT09IGFjdGl2ZVJlc291cmNlSWQpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25zU2VydmljZS5vcGVuQ2hhdChzZXNzaW9uLCBVUkkucGFyc2UoYWN0aXZlUmVzb3VyY2VJZCkpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2dyaWQgfHwgdGhpcy5fZ3JvdXBzLmxlbmd0aCA8IDIgfHwgIXRoaXMuX2lzR3JvdXBDb2xsYXBzZWQoZW50cnkudmlldykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gR3JvdyB0aGUgZm9jdXNlZCBncm91cCB0byB0aGUgZ3JpZCdzIGZ1bGwgZXh0ZW50OyB0aGUgc3BsaXQgdmlldyBjbGFtcHNcblx0XHQvLyBpdCB0byB0aGUgc3BhY2UgbGVmdCBvbmNlIHRoZSBzaWJsaW5ncyByZWFjaCB0aGVpciBtaW5pbXVtIHNpemUsIHNvIHRoZVxuXHRcdC8vIG90aGVycyBjb2xsYXBzZSB0byBtaW4gYWxvbmcgd2hpY2hldmVyIGF4aXMgdGhleSBhcmUgc3BsaXQuXG5cdFx0Y29uc3QgZ3JpZFNpemUgPSB0aGlzLl9ncmlkLmdldFZpZXdTaXplKCk7XG5cdFx0dGhpcy5fZ3JpZC5yZXNpemVWaWV3KGVudHJ5LnZpZXcsIHsgd2lkdGg6IGdyaWRTaXplLndpZHRoLCBoZWlnaHQ6IGdyaWRTaXplLmhlaWdodCB9KTtcblx0XHR0aGlzLl9wZXJzaXN0TGF5b3V0KCk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgZ3JvdXAgaXMgc3F1ZWV6ZWQgdG8gKG5lYXIpIGl0cyBtaW5pbXVtIGFsb25nIGFuIGF4aXMgd2hlcmUgdGhlXG5cdCAqIGdyaWQgaGFzIHJvb20gdG8gYmUgbGFyZ2VyIFx1MjAxNCBpLmUuIHRoZSB1c2VyIGhhcyBjb2xsYXBzZWQgaXQgaW4gYSBzcGxpdC5cblx0ICovXG5cdHByaXZhdGUgX2lzR3JvdXBDb2xsYXBzZWQodmlldzogQ2hhdEdyb3VwVmlldyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fZ3JpZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBDT0xMQVBTRV9USFJFU0hPTEQgPSA4O1xuXHRcdGNvbnN0IHNpemUgPSB0aGlzLl9ncmlkLmdldFZpZXdTaXplKHZpZXcpO1xuXHRcdGNvbnN0IGdyaWRTaXplID0gdGhpcy5fZ3JpZC5nZXRWaWV3U2l6ZSgpO1xuXHRcdGNvbnN0IGNvbGxhcHNlZEhvcml6b250YWxseSA9IHNpemUud2lkdGggPD0gdmlldy5taW5pbXVtV2lkdGggKyBDT0xMQVBTRV9USFJFU0hPTERcblx0XHRcdCYmIGdyaWRTaXplLndpZHRoID4gdmlldy5taW5pbXVtV2lkdGggKyBDT0xMQVBTRV9USFJFU0hPTEQ7XG5cdFx0Y29uc3QgY29sbGFwc2VkVmVydGljYWxseSA9IHNpemUuaGVpZ2h0IDw9IHZpZXcubWluaW11bUhlaWdodCArIENPTExBUFNFX1RIUkVTSE9MRFxuXHRcdFx0JiYgZ3JpZFNpemUuaGVpZ2h0ID4gdmlldy5taW5pbXVtSGVpZ2h0ICsgQ09MTEFQU0VfVEhSRVNIT0xEO1xuXHRcdHJldHVybiBjb2xsYXBzZWRIb3Jpem9udGFsbHkgfHwgY29sbGFwc2VkVmVydGljYWxseTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEdyb3VwQ291bnQoY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2dyb3VwQ291bnQuc2V0KGNvdW50LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdzaW5nbGUtZ3JvdXAnLCBjb3VudCA8PSAxKTtcblx0XHR0aGlzLl9ncm91cHMuZm9yRWFjaCgoZ3JvdXAsIGluZGV4KSA9PiBncm91cC52aWV3LnNldEdyb3VwUG9zaXRpb24oaW5kZXgsIGNvdW50KSk7XG5cdH1cblxuXHRwcml2YXRlIF9vcGVuQ2hhdChlbnRyeTogSUdyb3VwRW50cnksIHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRlbnRyeS5hY3RpdmVSZXNvdXJjZUlkLnNldChyZXNvdXJjZS50b1N0cmluZygpLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3NldEFjdGl2ZUdyb3VwKGVudHJ5KTtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLm9wZW5DaGF0KHRoaXMuX3Nlc3Npb24sIHJlc291cmNlKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbmV3Q2hhdChlbnRyeTogSUdyb3VwRW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zZXRBY3RpdmVHcm91cChlbnRyeSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb247XG5cdFx0aWYgKHNlc3Npb24gJiYgIXNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdJZHMgPSBuZXcgU2V0KHNlc3Npb24udmlzaWJsZUNoYXRUYWJzLmdldCgpLm1hcChjaGF0ID0+IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSkpO1xuXHRcdFx0YXdhaXQgdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdDaGF0SW5TZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0aWYgKHRoaXMuX3Nlc3Npb24gPT09IHNlc3Npb24gJiYgdGhpcy5fZ3JvdXBzLmluY2x1ZGVzKGVudHJ5KSkge1xuXHRcdFx0XHRjb25zdCBjcmVhdGVkQ2hhdCA9IHNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKTtcblx0XHRcdFx0Y29uc3QgY3JlYXRlZElkID0gY3JlYXRlZENoYXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKCFleGlzdGluZ0lkcy5oYXMoY3JlYXRlZElkKSAmJiBzZXNzaW9uLnZpc2libGVDaGF0VGFicy5nZXQoKS5pbmNsdWRlcyhjcmVhdGVkQ2hhdCkpIHtcblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX2dyb3Vwcykge1xuXHRcdFx0XHRcdFx0XHRpZiAoZ3JvdXAgIT09IGVudHJ5ICYmIGdyb3VwLnJlc291cmNlSWRzLmdldCgpLmluY2x1ZGVzKGNyZWF0ZWRJZCkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9kZXRhY2hDaGF0RnJvbUdyb3VwKGdyb3VwLCBjcmVhdGVkSWQsIHR4KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKCFlbnRyeS5yZXNvdXJjZUlkcy5nZXQoKS5pbmNsdWRlcyhjcmVhdGVkSWQpKSB7XG5cdFx0XHRcdFx0XHRcdGVudHJ5LnJlc291cmNlSWRzLnNldChbLi4uZW50cnkucmVzb3VyY2VJZHMuZ2V0KCksIGNyZWF0ZWRJZF0sIHR4KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVudHJ5LmFjdGl2ZVJlc291cmNlSWQuc2V0KGNyZWF0ZWRJZCwgdHgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMuX3NldEFjdGl2ZUdyb3VwKGVudHJ5KTtcblx0XHRcdFx0XHR0aGlzLl9yZW1vdmVFbXB0eUdyb3VwcygpO1xuXHRcdFx0XHRcdHRoaXMuX3BlcnNpc3RMYXlvdXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbnRyeS52aWV3LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNBZGphY2VudEdyb3VwKGRpcmVjdGlvbjogJ3ByZXZpb3VzJyB8ICduZXh0Jyk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUluZGV4ID0gdGhpcy5fYWN0aXZlR3JvdXAgPyB0aGlzLl9ncm91cHMuaW5kZXhPZih0aGlzLl9hY3RpdmVHcm91cCkgOiAtMTtcblx0XHRpZiAoYWN0aXZlSW5kZXggPCAwIHx8IHRoaXMuX2dyb3Vwcy5sZW5ndGggPCAyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9mZnNldCA9IGRpcmVjdGlvbiA9PT0gJ25leHQnID8gMSA6IC0xO1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2dyb3Vwc1soYWN0aXZlSW5kZXggKyBvZmZzZXQgKyB0aGlzLl9ncm91cHMubGVuZ3RoKSAlIHRoaXMuX2dyb3Vwcy5sZW5ndGhdO1xuXHRcdHRoaXMuX29uR3JvdXBGb2N1c2VkKHRhcmdldCk7XG5cdFx0dGFyZ2V0LnZpZXcuZm9jdXMoKTtcblx0fVxuXG5cdHNwbGl0QWN0aXZlQ2hhdChkaXJlY3Rpb246ICdyaWdodCcgfCAnYm90dG9tJyk6IHZvaWQge1xuXHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuX2FjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IHJlc291cmNlID0gc291cmNlPy5hY3RpdmVSZXNvdXJjZUlkLmdldCgpO1xuXHRcdGlmIChzb3VyY2UgJiYgcmVzb3VyY2UgJiYgc291cmNlLnJlc291cmNlSWRzLmdldCgpLmxlbmd0aCA+IDEpIHtcblx0XHRcdHRoaXMuX3NwbGl0Q2hhdEludG9OZXdHcm91cChVUkkucGFyc2UocmVzb3VyY2UpLCBzb3VyY2UsIHNvdXJjZSwgZGlyZWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRtb3ZlQWN0aXZlQ2hhdFRvQWRqYWNlbnRHcm91cChkaXJlY3Rpb246ICdwcmV2aW91cycgfCAnbmV4dCcpOiB2b2lkIHtcblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLl9hY3RpdmVHcm91cDtcblx0XHRjb25zdCBzb3VyY2VJbmRleCA9IHNvdXJjZSA/IHRoaXMuX2dyb3Vwcy5pbmRleE9mKHNvdXJjZSkgOiAtMTtcblx0XHRjb25zdCByZXNvdXJjZSA9IHNvdXJjZT8uYWN0aXZlUmVzb3VyY2VJZC5nZXQoKTtcblx0XHRpZiAoIXNvdXJjZSB8fCBzb3VyY2VJbmRleCA8IDAgfHwgIXJlc291cmNlIHx8IHRoaXMuX2dyb3Vwcy5sZW5ndGggPCAyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9mZnNldCA9IGRpcmVjdGlvbiA9PT0gJ25leHQnID8gMSA6IC0xO1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2dyb3Vwc1soc291cmNlSW5kZXggKyBvZmZzZXQgKyB0aGlzLl9ncm91cHMubGVuZ3RoKSAlIHRoaXMuX2dyb3Vwcy5sZW5ndGhdO1xuXHRcdHRoaXMuX21vdmVDaGF0VG9Hcm91cChVUkkucGFyc2UocmVzb3VyY2UpLCBzb3VyY2UsIHRhcmdldCk7XG5cdFx0dGFyZ2V0LnZpZXcuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3pvbmVUb0RpcmVjdGlvbih6b25lOiBDaGF0RHJvcFpvbmUpOiBEaXJlY3Rpb24ge1xuXHRcdHN3aXRjaCAoem9uZSkge1xuXHRcdFx0Y2FzZSAnbGVmdCc6IHJldHVybiBEaXJlY3Rpb24uTGVmdDtcblx0XHRcdGNhc2UgJ3JpZ2h0JzogcmV0dXJuIERpcmVjdGlvbi5SaWdodDtcblx0XHRcdGNhc2UgJ3RvcCc6IHJldHVybiBEaXJlY3Rpb24uVXA7XG5cdFx0XHRjYXNlICdib3R0b20nOiByZXR1cm4gRGlyZWN0aW9uLkRvd247XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gRGlyZWN0aW9uLlJpZ2h0O1xuXHRcdH1cblx0fVxuXG5cdHNldFNlc3Npb25BY3RpdmUoYWN0aXZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25BY3RpdmUgPT09IGFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uQWN0aXZlID0gYWN0aXZlO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fZ3JvdXBzKSB7XG5cdFx0XHRncm91cC52aWV3LnNldFNlc3Npb25BY3RpdmUoYWN0aXZlKTtcblx0XHR9XG5cdH1cblxuXHRzZXRTZXNzaW9uVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25WaXNpYmxlID09PSB2aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25WaXNpYmxlID0gdmlzaWJsZTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX2dyb3Vwcykge1xuXHRcdFx0Z3JvdXAudmlldy5zZXRTZXNzaW9uVmlzaWJsZSh2aXNpYmxlKTtcblx0XHR9XG5cdH1cblxuXHRzdWJtaXRJbnB1dCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlR3JvdXA/LnZpZXcuc3VibWl0SW5wdXQoKSA/PyBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHR9XG5cblx0c2VsZWN0V29ya3NwYWNlKGZvbGRlclVyaTogVVJJLCBwcm92aWRlcklkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlR3JvdXA/LnZpZXcuc2VsZWN0V29ya3NwYWNlKGZvbGRlclVyaSwgcHJvdmlkZXJJZCk7XG5cdH1cblxuXHRwcmVmaWxsSW5wdXQodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlR3JvdXA/LnZpZXcucHJlZmlsbElucHV0KHRleHQpO1xuXHR9XG5cblx0c2VuZFF1ZXJ5KHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZUdyb3VwPy52aWV3LnNlbmRRdWVyeSh0ZXh0KTtcblx0fVxuXG5cdGF0dGFjaCh1cmlzOiBVUklbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZUdyb3VwPy52aWV3LmF0dGFjaCh1cmlzKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZUdyb3VwPy52aWV3LmZvY3VzKCk7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0TGF5b3V0ID0geyB3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQgfTtcblx0XHR0aGlzLl9hcHBseUxheW91dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlMYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9sYXN0TGF5b3V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHsgd2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0IH0gPSB0aGlzLl9sYXN0TGF5b3V0O1xuXHRcdHNpemUodGhpcy5lbGVtZW50LCB3aWR0aCwgaGVpZ2h0KTtcblx0XHR0aGlzLl9ncmlkPy5sYXlvdXQod2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9zZXBhcmF0b3JCb3JkZXIoKTogQ29sb3Ige1xuXHRcdHJldHVybiB0aGlzLnRoZW1lLmdldENvbG9yKGFnZW50c1BhbmVsQm9yZGVyKSB8fCB0aGlzLnRoZW1lLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKSB8fCBDb2xvci50cmFuc3BhcmVudDtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblx0XHR0aGlzLl9ncmlkPy5zdHlsZSh7IHNlcGFyYXRvckJvcmRlcjogdGhpcy5fc2VwYXJhdG9yQm9yZGVyIH0pO1xuXHR9XG5cblx0LyoqIFBlcnNpc3RzIHRoZSBjdXJyZW50IGdyaWQgbGF5b3V0IGZvciB0aGUgYWN0aXZlIHNlc3Npb24gKG9yIGNsZWFycyBpdCB3aGVuIGEgc2luZ2xlIGdyb3VwKS4gKi9cblx0cHJpdmF0ZSBfcGVyc2lzdExheW91dCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb24gfHwgIXRoaXMuX2dyaWQgfHwgdGhpcy5fcmVzdG9yZVBlbmRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5fc2Vzc2lvbi5zZXNzaW9uSWQ7XG5cdFx0aWYgKCF0aGlzLl9zZXNzaW9uLmlzQ3JlYXRlZC5nZXQoKSkge1xuXHRcdFx0dGhpcy5fc2F2ZVN0b3JlZChzZXNzaW9uSWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9ncm91cHMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHRoaXMuX3NhdmVTdG9yZWQoc2Vzc2lvbklkLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9ncm91cHMuZm9yRWFjaCgoZ3JvdXAsIGkpID0+IGdyb3VwLnZpZXcuc2V0U2VyaWFsaXphdGlvbkluZGV4KGkpKTtcblx0XHRjb25zdCBsYXlvdXQ6IElTZXJpYWxpemVkQ2hhdEdyb3Vwc0xheW91dCA9IHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRncmlkOiB0aGlzLl9ncmlkLnNlcmlhbGl6ZSgpLFxuXHRcdFx0Z3JvdXBzOiB0aGlzLl9ncm91cHMubWFwKGdyb3VwID0+ICh7IHJlc291cmNlSWRzOiBncm91cC5yZXNvdXJjZUlkcy5nZXQoKSwgYWN0aXZlUmVzb3VyY2VJZDogZ3JvdXAuYWN0aXZlUmVzb3VyY2VJZC5nZXQoKSB9KSksXG5cdFx0XHRhY3RpdmVHcm91cEluZGV4OiBNYXRoLm1heCgwLCB0aGlzLl9ncm91cHMuaW5kZXhPZih0aGlzLl9hY3RpdmVHcm91cCEpKSxcblx0XHR9O1xuXHRcdHRoaXMuX3NhdmVTdG9yZWQoc2Vzc2lvbklkLCBsYXlvdXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZFN0b3JlZExheW91dHMoKTogUmVjb3JkPHN0cmluZywgSVNlcmlhbGl6ZWRDaGF0R3JvdXBzTGF5b3V0PiB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KENoYXRHcm91cHNWaWV3LlNUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UocmF3KSBhcyBSZWNvcmQ8c3RyaW5nLCBJU2VyaWFsaXplZENoYXRHcm91cHNMYXlvdXQ+O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvYWRTdG9yZWQoc2Vzc2lvbklkOiBzdHJpbmcpOiBJU2VyaWFsaXplZENoYXRHcm91cHNMYXlvdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fcmVhZFN0b3JlZExheW91dHMoKVtzZXNzaW9uSWRdO1xuXHRcdHJldHVybiBlbnRyeT8udmVyc2lvbiA9PT0gMSA/IGVudHJ5IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZVN0b3JlZChzZXNzaW9uSWQ6IHN0cmluZywgbGF5b3V0OiBJU2VyaWFsaXplZENoYXRHcm91cHNMYXlvdXQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBsYXlvdXRzID0gdGhpcy5fcmVhZFN0b3JlZExheW91dHMoKTtcblx0XHRpZiAobGF5b3V0KSB7XG5cdFx0XHRsYXlvdXRzW3Nlc3Npb25JZF0gPSBsYXlvdXQ7XG5cdFx0fSBlbHNlIGlmIChsYXlvdXRzW3Nlc3Npb25JZF0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWxldGUgbGF5b3V0c1tzZXNzaW9uSWRdO1xuXHRcdH1cblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0R3JvdXBzVmlldy5TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkobGF5b3V0cyksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlcnNpc3RMYXlvdXQoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyxZQUFZO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWUsaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDaEYsU0FBUyxTQUFTLFNBQWtFLGlCQUFpQixtQkFBbUI7QUFDeEgsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsV0FBK0Msa0JBQWtCLGNBQWM7QUFDeEYsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUdsQyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFCQUF3QztBQUNqRCxTQUF1QiwyQkFBeUQ7QUFDaEYsU0FBOEIseUJBQXlCO0FBNkNoRCxJQUFNLGlCQUFOLGNBQTZCLFNBQVM7QUFBQSxFQW9DNUMsWUFDZ0IsY0FDeUIsdUJBQ0wsa0JBQ0QsaUJBQ2pDO0FBQ0QsVUFBTSxZQUFZO0FBSnNCO0FBQ0w7QUFDRDtBQXBDbkMsU0FBUyxVQUF1QixFQUFFLG1CQUFtQjtBQUVyRCxTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksa0JBQW1DLENBQUM7QUFDOUYsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLGNBQXVDLENBQUM7QUFJaEcsU0FBUSxVQUF5QixDQUFDO0FBRWxDLFNBQWlCLGNBQWMsZ0JBQXdCLE1BQU0sQ0FBQztBQUc5RCxTQUFRLGVBQWU7QUFLdkIsU0FBUSxpQkFBaUI7QUFDekIsU0FBUSxrQkFBa0I7QUFTMUI7QUFBQSxTQUFRLGtCQUFrQjtBQUFBLEVBWTFCO0FBQUE7QUFBQSxFQTVCQSxJQUFJLGFBQWtDO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBYTtBQUFBO0FBQUEsRUErQmpFLFdBQVcsU0FBcUMsU0FBaUM7QUFDaEYsU0FBSyxXQUFXO0FBQ2hCLFFBQUksS0FBSyxhQUFhLFNBQVM7QUFDOUI7QUFBQSxJQUNEO0FBR0EsU0FBSyxlQUFlO0FBRXBCLFNBQUssV0FBVztBQUVoQixVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsU0FBSyxvQkFBb0IsUUFBUTtBQUNqQyxTQUFLLGtCQUFrQixtQkFBbUI7QUFDMUMsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSyxRQUFRO0FBQ2IsU0FBSyxVQUFVLENBQUM7QUFDaEIsU0FBSyxlQUFlO0FBQ3BCLFNBQUsscUJBQXFCO0FBQzFCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUsscUJBQXFCO0FBQzFCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssMkJBQTJCO0FBQ2hDLFNBQUssZUFBZSxDQUFDO0FBRXJCLFFBQUksQ0FBQyxTQUFTO0FBQ2IsV0FBSyxRQUFRLGdCQUFnQjtBQUM3QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLG9CQUFvQixRQUFRLFlBQVUsUUFBUSxTQUFTLEtBQUssTUFBTSxFQUFFLFNBQVMsU0FBUyxDQUFDO0FBRTVGLFVBQU0sT0FBTyxRQUFRLFVBQVUsSUFBSSxJQUNoQyxLQUFLLGtCQUFrQixTQUFTLEtBQUssS0FBSyxLQUFLLHVCQUF1QixTQUFTLEtBQUssSUFDcEYsS0FBSyx1QkFBdUIsU0FBUyxLQUFLO0FBQzdDLFNBQUssUUFBUTtBQUNiLFVBQU0sSUFBSSxJQUFJO0FBQ2QsU0FBSyxRQUFRLGdCQUFnQixLQUFLLE9BQU87QUFDekMsVUFBTSxJQUFJLGFBQWEsTUFBTSxLQUFLLFFBQVEsT0FBTyxDQUFDLENBQUM7QUFFbkQsVUFBTSxlQUE2QztBQUFBLE1BQ2xELFlBQVksV0FBUyxrQkFBa0IsT0FBTyxRQUFRLFNBQVM7QUFBQSxNQUMvRCxpQkFBaUIsV0FBUyxLQUFLLGlCQUFpQixLQUFLO0FBQUEsTUFDckQsWUFBWSxDQUFDLFNBQVMsTUFBTSxTQUFTLEtBQUssWUFBWSxTQUFTLE1BQU0sSUFBSTtBQUFBLElBQzFFO0FBQ0EsVUFBTSxJQUFJLEtBQUssc0JBQXNCLGVBQWUscUJBQXFCLEtBQUssU0FBUyxZQUFZLENBQUM7QUFFcEcsVUFBTSxJQUFJLFFBQVEsWUFBVSxLQUFLLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFFcEQsU0FBSyxhQUFhO0FBQUEsRUFDbkI7QUFBQSxFQUVRLHVCQUF1QixTQUF5QixPQUF5RDtBQUNoSCxVQUFNLGFBQWEsS0FBSyxrQkFBa0IsT0FBTztBQUNqRCxTQUFLLFVBQVUsQ0FBQyxVQUFVO0FBQzFCLFNBQUssZUFBZTtBQUNwQixlQUFXLEtBQUssZUFBZSxJQUFJO0FBQ25DLFNBQUssZUFBZSxDQUFDO0FBQ3JCLFdBQU8sSUFBSSxpQkFBaUIsV0FBVyxNQUFNLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixLQUFLLGlCQUFpQixFQUFFLENBQUM7QUFBQSxFQUNwRztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUVEsa0JBQWtCLFNBQXlCLE9BQXFFO0FBQ3ZILFVBQU0sUUFBUSxLQUFLLFlBQVksUUFBUSxTQUFTO0FBQ2hELFFBQUksQ0FBQyxTQUFTLE1BQU0sT0FBTyxVQUFVLEdBQUc7QUFDdkMsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGVBQWUsb0JBQUksSUFBeUI7QUFDbEQsVUFBTSxlQUFpRDtBQUFBLE1BQ3RELFVBQVUsQ0FBQyxTQUFvQztBQUM5QyxjQUFNLFFBQVEsT0FBTyxNQUFNLFVBQVUsV0FBVyxLQUFLLFFBQVEsYUFBYTtBQUMxRSxjQUFNLFFBQVEsS0FBSyxrQkFBa0IsT0FBTztBQUM1QyxxQkFBYSxJQUFJLE9BQU8sS0FBSztBQUM3QixlQUFPLE1BQU07QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSixRQUFJO0FBQ0gsYUFBTyxpQkFBaUIsWUFBWSxNQUFNLE1BQU0sY0FBYyxFQUFFLFFBQVEsRUFBRSxpQkFBaUIsS0FBSyxpQkFBaUIsRUFBRSxDQUFDO0FBQUEsSUFDckgsU0FBUyxHQUFHO0FBQ1gsd0JBQWtCLENBQUM7QUFDbkIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQXdCLENBQUM7QUFDL0IsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLE9BQU8sUUFBUSxLQUFLO0FBQzdDLFlBQU0sUUFBUSxhQUFhLElBQUksQ0FBQztBQUNoQyxVQUFJLE9BQU87QUFDVixlQUFPLEtBQUssS0FBSztBQUFBLE1BQ2xCO0FBQUEsSUFDRDtBQUNBLFFBQUksT0FBTyxVQUFVLEdBQUc7QUFDdkIsV0FBSyxRQUFRO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGFBQWEsb0JBQUksSUFBb0I7QUFDM0MsVUFBTSxRQUFRLG9CQUFJLElBQW9CO0FBQ3RDLFFBQUksVUFBVTtBQUNkLFVBQU0sT0FBTyxRQUFRLENBQUMsR0FBRyxNQUFNO0FBQzlCLFlBQU0sUUFBUSxhQUFhLElBQUksQ0FBQztBQUNoQyxVQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsTUFDRDtBQUNBLGlCQUFXLE1BQU0sRUFBRSxhQUFhO0FBQy9CLG1CQUFXLElBQUksSUFBSSxNQUFNLEVBQUU7QUFDM0IsY0FBTSxJQUFJLElBQUksU0FBUztBQUFBLE1BQ3hCO0FBQ0EsVUFBSSxFQUFFLGtCQUFrQjtBQUN2QixjQUFNLGlCQUFpQixJQUFJLEVBQUUsa0JBQWtCLE1BQVM7QUFBQSxNQUN6RDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssVUFBVTtBQUNmLFNBQUsscUJBQXFCO0FBQzFCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUsscUJBQXFCLElBQUksSUFBSSxRQUFRLGdCQUFnQixJQUFJLEVBQUUsSUFBSSxPQUFLLEVBQUUsU0FBUyxTQUFTLENBQUMsQ0FBQztBQUMvRixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLGVBQWUsYUFBYSxJQUFJLE1BQU0sZ0JBQWdCLEtBQUssT0FBTyxDQUFDO0FBQ3hFLGVBQVcsU0FBUyxLQUFLLFNBQVM7QUFDakMsWUFBTSxLQUFLLGVBQWUsVUFBVSxLQUFLLFlBQVk7QUFBQSxJQUN0RDtBQUNBLFNBQUssZUFBZSxLQUFLLFFBQVEsTUFBTTtBQUN2QyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsa0JBQWtCLFNBQXNDO0FBQy9ELFVBQU0sS0FBSyxLQUFLO0FBQ2hCLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxTQUFLLGtCQUFrQixJQUFJLElBQUksS0FBSztBQUNwQyxVQUFNLGNBQWMsZ0JBQTBCLGFBQWEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQy9FLFVBQU0sbUJBQW1CLGdCQUF3QixhQUFhLEVBQUUscUJBQXFCLEVBQUU7QUFFdkYsVUFBTSxRQUFRLFFBQTBCLFlBQVU7QUFDakQsWUFBTSxNQUFNLFFBQVEsZ0JBQWdCLEtBQUssTUFBTTtBQUMvQyxZQUFNLE1BQU0sWUFBWSxLQUFLLE1BQU07QUFDbkMsWUFBTSxTQUFrQixDQUFDO0FBQ3pCLGlCQUFXLFNBQVMsS0FBSztBQUN4QixjQUFNLE9BQU8sSUFBSSxLQUFLLE9BQUssRUFBRSxTQUFTLFNBQVMsTUFBTSxLQUFLO0FBQzFELFlBQUksTUFBTTtBQUNULGlCQUFPLEtBQUssSUFBSTtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFFRCxVQUFNLGNBQWMsUUFBUSxZQUFVO0FBQ3JDLFVBQUksQ0FBQyxRQUFRLFVBQVUsS0FBSyxNQUFNLEdBQUc7QUFDcEMsZUFBTztBQUFBLE1BQ1I7QUFHQSxVQUFJLEtBQUssWUFBWSxLQUFLLE1BQU0sSUFBSSxHQUFHO0FBQ3RDLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTyxRQUFRLG1CQUFtQixLQUFLLE1BQU07QUFBQSxJQUM5QyxDQUFDO0FBRUQsVUFBTSxPQUFPLE1BQU0sSUFBSSxLQUFLLHNCQUFzQixlQUFlLGFBQWEsQ0FBQztBQUMvRSxVQUFNLFFBQXFCLEVBQUUsSUFBSSxNQUFNLGFBQWEsa0JBQWtCLE9BQU8sWUFBWTtBQUl6RixVQUFNLElBQUksS0FBSyxXQUFXLE1BQU0sS0FBSyxnQkFBZ0IsS0FBSyxDQUFDLENBQUM7QUFFNUQsVUFBTSxVQUE2QjtBQUFBLE1BQ2xDO0FBQUEsTUFDQSxTQUFTLEtBQUs7QUFBQSxNQUNkO0FBQUEsTUFDQSxvQkFBb0I7QUFBQSxNQUNwQixrQkFBa0IsS0FBSztBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxVQUFVLGNBQVksS0FBSyxVQUFVLE9BQU8sUUFBUTtBQUFBLE1BQ3BELFNBQVMsTUFBTSxLQUFLLFNBQVMsS0FBSyxFQUFFLE1BQU0saUJBQWlCO0FBQUEsTUFDM0QsZ0JBQWdCLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDeEIsY0FBYyxNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ3ZCO0FBQ0EsU0FBSyxXQUFXLE9BQU87QUFDdkIsU0FBSyxpQkFBaUIsS0FBSyxjQUFjO0FBQ3pDLFNBQUssa0JBQWtCLEtBQUssZUFBZTtBQUUzQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsV0FBVyxRQUF1QjtBQUN6QyxVQUFNLFVBQVUsS0FBSztBQUNyQixRQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxRQUFRLGdCQUFnQixLQUFLLE1BQU07QUFDakQsVUFBTSxhQUFhLFFBQVEsV0FBVyxLQUFLLE1BQU07QUFDakQsVUFBTSxhQUFhLE1BQU0sSUFBSSxPQUFLLEVBQUUsU0FBUyxTQUFTLENBQUM7QUFDdkQsVUFBTSxXQUFXLElBQUksSUFBSSxVQUFVO0FBQ25DLFVBQU0sV0FBVyxZQUFZLFNBQVMsU0FBUztBQUUvQyxnQkFBWSxRQUFNO0FBRWpCLGlCQUFXLFNBQVMsS0FBSyxTQUFTO0FBQ2pDLGNBQU0sTUFBTSxNQUFNLFlBQVksSUFBSTtBQUNsQyxjQUFNLFNBQVMsSUFBSSxPQUFPLFFBQU0sU0FBUyxJQUFJLEVBQUUsQ0FBQztBQUNoRCxZQUFJLE9BQU8sV0FBVyxJQUFJLFFBQVE7QUFDakMsZ0JBQU0sWUFBWSxJQUFJLFFBQVEsRUFBRTtBQUFBLFFBQ2pDO0FBQUEsTUFDRDtBQUlBLFlBQU0sV0FBVyxvQkFBSSxJQUFZO0FBQ2pDLGlCQUFXLFNBQVMsS0FBSyxTQUFTO0FBQ2pDLG1CQUFXLE1BQU0sTUFBTSxZQUFZLElBQUksR0FBRztBQUN6QyxtQkFBUyxJQUFJLEVBQUU7QUFBQSxRQUNoQjtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxNQUFNLFlBQVk7QUFDNUIsWUFBSSxTQUFTLElBQUksRUFBRSxHQUFHO0FBQ3JCO0FBQUEsUUFDRDtBQUNBLGNBQU0sZUFBZSxLQUFLLG9CQUFvQixJQUFJLEVBQUU7QUFDcEQsWUFBSSxTQUFTLGlCQUFpQixTQUFZLEtBQUssUUFBUSxLQUFLLE9BQUssRUFBRSxPQUFPLFlBQVksSUFBSTtBQUMxRixjQUFNLE9BQU8sTUFBTSxLQUFLLENBQUFBLFVBQVFBLE1BQUssU0FBUyxTQUFTLE1BQU0sRUFBRTtBQUMvRCxjQUFNLGlCQUFpQixPQUFPLFdBQVcsTUFBTSxRQUFRLGFBQWE7QUFDcEUsY0FBTSxjQUFjLGlCQUNqQixLQUFLLFFBQVEsS0FBSyxXQUFTLE1BQU0sWUFBWSxJQUFJLEVBQUUsU0FBUyxlQUFlLFNBQVMsQ0FBQyxDQUFDLElBQ3RGO0FBQ0gsbUJBQVcsY0FBYyxLQUFLLG1CQUFtQixXQUFXLElBQUk7QUFDaEUsbUJBQVcsS0FBSztBQUNoQixZQUFJLFFBQVE7QUFDWCxpQkFBTyxZQUFZLElBQUksQ0FBQyxHQUFHLE9BQU8sWUFBWSxJQUFJLEdBQUcsRUFBRSxHQUFHLEVBQUU7QUFBQSxRQUM3RDtBQUFBLE1BQ0Q7QUFHQSxVQUFJLEtBQUssbUJBQW1CLEtBQUssZUFBZTtBQUMvQyxjQUFNLGVBQWUsS0FBSztBQUMxQixtQkFBVyxTQUFTLEtBQUssU0FBUztBQUNqQyxnQkFBTSxNQUFNLE1BQU0sWUFBWSxJQUFJO0FBQ2xDLGdCQUFNLFNBQVMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRyxPQUFPLGFBQWEsSUFBSSxDQUFDLEtBQUssT0FBTyxxQkFBcUIsYUFBYSxJQUFJLENBQUMsS0FBSyxPQUFPLGlCQUFpQjtBQUMxSSxjQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksTUFBTSxPQUFPLElBQUksQ0FBQyxDQUFDLEdBQUc7QUFDMUMsa0JBQU0sWUFBWSxJQUFJLFFBQVEsRUFBRTtBQUFBLFVBQ2pDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFlBQVksYUFBYSxLQUFLLDBCQUEwQjtBQUMzRCxjQUFNLFFBQVEsS0FBSyxRQUFRLEtBQUssT0FBSyxFQUFFLFlBQVksSUFBSSxFQUFFLFNBQVMsUUFBUSxDQUFDO0FBQzNFLFlBQUksT0FBTztBQUNWLGdCQUFNLGlCQUFpQixJQUFJLFVBQVUsRUFBRTtBQUN2QyxlQUFLLGdCQUFnQixLQUFLO0FBQUEsUUFDM0I7QUFBQSxNQUNEO0FBQ0EsV0FBSywyQkFBMkI7QUFHaEMsaUJBQVcsU0FBUyxLQUFLLFNBQVM7QUFDakMsY0FBTSxNQUFNLE1BQU0sWUFBWSxJQUFJO0FBQ2xDLFlBQUksSUFBSSxVQUFVLENBQUMsSUFBSSxTQUFTLE1BQU0saUJBQWlCLElBQUksQ0FBQyxHQUFHO0FBQzlELGdCQUFNLGlCQUFpQixJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUU7QUFBQSxRQUN0QztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFNRCxRQUFJLEtBQUssaUJBQWlCO0FBQ3pCLFlBQU0sa0JBQWtCLEtBQUsscUJBQXFCLENBQUMsR0FBRyxLQUFLLG1CQUFtQixLQUFLLENBQUMsRUFBRSxNQUFNLFFBQU0sU0FBUyxJQUFJLEVBQUUsQ0FBQyxJQUFJO0FBQ3RILFlBQU0saUJBQWlCLENBQUMsS0FBSyxzQkFBc0IsV0FBVyxXQUFXLEtBQUssbUJBQW1CLFFBQVEsV0FBVyxLQUFLLFFBQU0sQ0FBQyxLQUFLLG1CQUFvQixJQUFJLEVBQUUsQ0FBQztBQUNoSyxZQUFNLGlCQUFpQixDQUFDLFFBQVEsUUFBUSxLQUFLLE1BQU07QUFDbkQsVUFBSSxtQkFBbUIsa0JBQWtCLGdCQUFnQjtBQUN4RCxhQUFLLGtCQUFrQjtBQUN2QixhQUFLLHFCQUFxQjtBQUMxQixhQUFLLGdCQUFnQjtBQUNyQixhQUFLLHFCQUFxQjtBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLGlCQUFpQjtBQUMxQixXQUFLLG1CQUFtQjtBQUN4QixXQUFLLGVBQWU7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlCQUFpQixPQUF3RjtBQUNoSCxlQUFXLFNBQVMsS0FBSyxTQUFTO0FBQ2pDLFVBQUksTUFBTSxLQUFLLFFBQVEsU0FBUyxLQUFLLEdBQUc7QUFDdkMsZUFBTyxFQUFFLElBQUksTUFBTSxJQUFJLFNBQVMsTUFBTSxLQUFLLFFBQVE7QUFBQSxNQUNwRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsWUFBWSxlQUF1QixNQUFvQixNQUE2QztBQUMzRyxRQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssVUFBVTtBQUM1QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssY0FBYyxLQUFLLFNBQVMsV0FBVztBQUMvQztBQUFBLElBQ0Q7QUFFQSxVQUFNLEtBQUssS0FBSztBQUNoQixVQUFNLFdBQVcsSUFBSSxNQUFNLEVBQUU7QUFDN0IsVUFBTSxTQUFTLEtBQUssUUFBUSxLQUFLLE9BQUssRUFBRSxPQUFPLGFBQWE7QUFDNUQsVUFBTSxTQUFTLEtBQUssUUFBUSxLQUFLLE9BQUssRUFBRSxZQUFZLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQztBQUN0RSxRQUFJLENBQUMsVUFBVSxDQUFDLFFBQVE7QUFDdkI7QUFBQSxJQUNEO0FBRUEsUUFBSSxTQUFTLFVBQVU7QUFDdEIsVUFBSSxXQUFXLFFBQVE7QUFDdEI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxpQkFBaUIsVUFBVSxRQUFRLE1BQU07QUFBQSxJQUMvQyxPQUFPO0FBR04sVUFBSSxXQUFXLFVBQVUsT0FBTyxZQUFZLElBQUksRUFBRSxVQUFVLEdBQUc7QUFDOUQ7QUFBQSxNQUNEO0FBQ0EsV0FBSyx1QkFBdUIsVUFBVSxRQUFRLFFBQVEsSUFBSTtBQUFBLElBQzNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLFVBQWUsUUFBcUIsUUFBMkI7QUFDdkYsVUFBTSxLQUFLLFNBQVMsU0FBUztBQUM3QixnQkFBWSxRQUFNO0FBQ2pCLFdBQUsscUJBQXFCLFFBQVEsSUFBSSxFQUFFO0FBQ3hDLFVBQUksQ0FBQyxPQUFPLFlBQVksSUFBSSxFQUFFLFNBQVMsRUFBRSxHQUFHO0FBQzNDLGVBQU8sWUFBWSxJQUFJLENBQUMsR0FBRyxPQUFPLFlBQVksSUFBSSxHQUFHLEVBQUUsR0FBRyxFQUFFO0FBQUEsTUFDN0Q7QUFDQSxhQUFPLGlCQUFpQixJQUFJLElBQUksRUFBRTtBQUFBLElBQ25DLENBQUM7QUFDRCxTQUFLLGdCQUFnQixNQUFNO0FBQzNCLFNBQUssaUJBQWlCLFNBQVMsS0FBSyxVQUFXLFFBQVEsRUFBRSxNQUFNLGlCQUFpQjtBQUNoRixTQUFLLG1CQUFtQjtBQUN4QixTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBLEVBRVEsdUJBQXVCLFVBQWUsUUFBcUIsV0FBd0IsTUFBNkM7QUFDdkksUUFBSSxDQUFDLEtBQUssU0FBUyxDQUFDLEtBQUssd0JBQXdCLENBQUMsS0FBSyxVQUFVO0FBQ2hFO0FBQUEsSUFDRDtBQUNBLFVBQU0sS0FBSyxTQUFTLFNBQVM7QUFDN0IsVUFBTSxXQUFXLEtBQUssa0JBQWtCLEtBQUssUUFBUTtBQUNyRCxTQUFLLE1BQU0sUUFBUSxTQUFTLE1BQU0sT0FBTyxZQUFZLFVBQVUsTUFBTSxLQUFLLGlCQUFpQixJQUFJLENBQUM7QUFDaEcsU0FBSyxhQUFhLFVBQVUsV0FBVyxJQUFJO0FBQzNDLFNBQUssZUFBZSxLQUFLLFFBQVEsTUFBTTtBQUV2QyxnQkFBWSxRQUFNO0FBQ2pCLFdBQUsscUJBQXFCLFFBQVEsSUFBSSxFQUFFO0FBQ3hDLGVBQVMsWUFBWSxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUU7QUFDakMsZUFBUyxpQkFBaUIsSUFBSSxJQUFJLEVBQUU7QUFBQSxJQUNyQyxDQUFDO0FBRUQsU0FBSyxnQkFBZ0IsUUFBUTtBQUM3QixTQUFLLGlCQUFpQixTQUFTLEtBQUssVUFBVSxRQUFRLEVBQUUsTUFBTSxpQkFBaUI7QUFDL0UsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssZUFBZTtBQUFBLEVBQ3JCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLHFCQUFxQixPQUFvQixJQUFZLElBQXdCO0FBQ3BGLFVBQU0sWUFBWSxNQUFNLFlBQVksSUFBSSxFQUFFLE9BQU8sT0FBSyxNQUFNLEVBQUU7QUFDOUQsVUFBTSxZQUFZLElBQUksV0FBVyxFQUFFO0FBQ25DLFFBQUksTUFBTSxpQkFBaUIsSUFBSSxNQUFNLE1BQU0sVUFBVSxRQUFRO0FBQzVELFlBQU0saUJBQWlCLElBQUksVUFBVSxDQUFDLEdBQUcsRUFBRTtBQUFBLElBQzVDO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBTSxtQkFBbUIsVUFBOEI7QUFDdEQsUUFBSSxDQUFDLEtBQUssWUFBWSxDQUFDLEtBQUssU0FBUyxDQUFDLEtBQUssc0JBQXNCO0FBQ2hFO0FBQUEsSUFDRDtBQUNBLFVBQU0sS0FBSyxTQUFTLFNBQVM7QUFFN0IsVUFBTSxXQUFXLEtBQUssUUFBUSxLQUFLLE9BQUssRUFBRSxZQUFZLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQztBQUN4RSxRQUFJLFVBQVU7QUFDYixlQUFTLGlCQUFpQixJQUFJLElBQUksTUFBUztBQUMzQyxXQUFLLGdCQUFnQixRQUFRO0FBQzdCLFlBQU0sS0FBSyxpQkFBaUIsU0FBUyxLQUFLLFVBQVUsUUFBUTtBQUM1RDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSyxRQUFRLENBQUM7QUFDckQsUUFBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFVBQVUsS0FBSztBQUNyQixVQUFNLEtBQUssaUJBQWlCLFNBQVMsU0FBUyxRQUFRO0FBQ3RELFFBQUksS0FBSyxhQUFhLFdBQVcsQ0FBQyxRQUFRLGdCQUFnQixJQUFJLEVBQUUsS0FBSyxVQUFRLEtBQUssU0FBUyxTQUFTLE1BQU0sRUFBRSxHQUFHO0FBQzlHO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxLQUFLLGtCQUFrQixPQUFPO0FBQy9DLFNBQUssTUFBTSxRQUFRLFNBQVMsTUFBTSxPQUFPLFlBQVksVUFBVSxNQUFNLFVBQVUsS0FBSztBQUNwRixTQUFLLGFBQWEsVUFBVSxXQUFXLE9BQU87QUFDOUMsU0FBSyxlQUFlLEtBQUssUUFBUSxNQUFNO0FBRXZDLGdCQUFZLFFBQU07QUFDakIsWUFBTSxnQkFBZ0IsS0FBSyxRQUFRLEtBQUssV0FBUyxVQUFVLFlBQVksTUFBTSxZQUFZLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQztBQUMzRyxVQUFJLGVBQWU7QUFDbEIsYUFBSyxxQkFBcUIsZUFBZSxJQUFJLEVBQUU7QUFBQSxNQUNoRDtBQUNBLGVBQVMsWUFBWSxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUU7QUFDakMsZUFBUyxpQkFBaUIsSUFBSSxJQUFJLEVBQUU7QUFBQSxJQUNyQyxDQUFDO0FBRUQsU0FBSyxnQkFBZ0IsUUFBUTtBQUM3QixTQUFLLG1CQUFtQjtBQUN4QixTQUFLLGFBQWE7QUFDbEIsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVRLG1CQUFtQixXQUFpRDtBQUMzRSxRQUFJLEtBQUssU0FBUyxLQUFLLGFBQWE7QUFDbkMsaUJBQVcsYUFBYSxDQUFDLFVBQVUsT0FBTyxVQUFVLE1BQU0sVUFBVSxNQUFNLFVBQVUsRUFBRSxHQUFHO0FBQ3hGLGNBQU0sV0FBVyxLQUFLLE1BQU0saUJBQWlCLFVBQVUsTUFBTSxTQUFTLEVBQUUsQ0FBQztBQUN6RSxjQUFNLFFBQVEsWUFBWSxLQUFLLFFBQVEsS0FBSyxlQUFhLFVBQVUsU0FBUyxRQUFRO0FBQ3BGLFlBQUksT0FBTztBQUNWLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxpQkFBaUIsS0FBSyxRQUFRLFFBQVEsU0FBUztBQUNyRCxXQUFPLEtBQUssUUFBUSxpQkFBaUIsQ0FBQyxLQUFLLEtBQUssUUFBUSxpQkFBaUIsQ0FBQztBQUFBLEVBQzNFO0FBQUEsRUFFUSxhQUFhLE9BQW9CLFdBQXdCLE1BQTZDO0FBQzdHLFVBQU0saUJBQWlCLEtBQUssUUFBUSxRQUFRLFNBQVM7QUFDckQsVUFBTSxlQUFlLFNBQVMsVUFBVSxTQUFTO0FBQ2pELFNBQUssUUFBUSxPQUFPLGtCQUFrQixlQUFlLElBQUksSUFBSSxHQUFHLEtBQUs7QUFBQSxFQUN0RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVBLGdCQUFnQixVQUFxQjtBQUNwQyxRQUFJLENBQUMsS0FBSyxZQUFZLENBQUMsS0FBSyxTQUFTLENBQUMsS0FBSyxzQkFBc0I7QUFDaEU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxLQUFLLFNBQVMsU0FBUztBQUM3QixVQUFNLFNBQVMsS0FBSyxRQUFRLEtBQUssT0FBSyxFQUFFLFlBQVksSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDO0FBQ3RFLFFBQUksUUFBUTtBQUVYLFVBQUksT0FBTyxZQUFZLElBQUksRUFBRSxVQUFVLEdBQUc7QUFDekMsYUFBSyxnQkFBZ0IsTUFBTTtBQUMzQjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLHVCQUF1QixVQUFVLFFBQVEsUUFBUSxPQUFPO0FBQzdEO0FBQUEsSUFDRDtBQUdBLFFBQUksS0FBSyxRQUFRLEtBQUssT0FBSyxFQUFFLFlBQVksSUFBSSxFQUFFLEtBQUssT0FBSyxNQUFNLEVBQUUsQ0FBQyxHQUFHO0FBQ3BFLFdBQUssbUJBQW1CLFFBQVEsRUFBRSxNQUFNLGlCQUFpQjtBQUFBLElBQzFEO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQTJCO0FBQ2xDLFFBQUksQ0FBQyxLQUFLLFNBQVMsS0FBSyxRQUFRLFVBQVUsR0FBRztBQUM1QztBQUFBLElBQ0Q7QUFDQSxVQUFNLFVBQVUsS0FBSyxRQUFRLE9BQU8sT0FBSyxFQUFFLFlBQVksSUFBSSxFQUFFLFdBQVcsQ0FBQztBQUN6RSxlQUFXLFNBQVMsU0FBUztBQUM1QixVQUFJLEtBQUssUUFBUSxVQUFVLEdBQUc7QUFDN0I7QUFBQSxNQUNEO0FBQ0EsWUFBTSxXQUFXLE1BQU0sS0FBSyxRQUFRLFNBQVMsTUFBTSxLQUFLLFFBQVEsY0FBYyxhQUFhO0FBQzNGLFdBQUssTUFBTSxXQUFXLE1BQU0sTUFBTSxPQUFPLFVBQVU7QUFDbkQsV0FBSyxVQUFVLEtBQUssUUFBUSxPQUFPLE9BQUssTUFBTSxLQUFLO0FBQ25ELFVBQUksS0FBSyxpQkFBaUIsT0FBTztBQUNoQyxhQUFLLGVBQWUsS0FBSyxRQUFRLENBQUM7QUFDbEMsYUFBSyxjQUFjLEtBQUssZUFBZSxJQUFJO0FBQUEsTUFDNUM7QUFDQSxXQUFLLGtCQUFrQixpQkFBaUIsTUFBTSxFQUFFO0FBQ2hELFVBQUksVUFBVTtBQUNiLGFBQUssY0FBYyxLQUFLLE1BQU07QUFBQSxNQUMvQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGVBQWUsS0FBSyxRQUFRLE1BQU07QUFBQSxFQUN4QztBQUFBLEVBRVEsZ0JBQWdCLE9BQTBCO0FBQ2pELFFBQUksS0FBSyxpQkFBaUIsT0FBTztBQUNoQztBQUFBLElBQ0Q7QUFDQSxTQUFLLGVBQWU7QUFDcEIsZUFBVyxTQUFTLEtBQUssU0FBUztBQUNqQyxZQUFNLEtBQUssZUFBZSxVQUFVLEtBQUs7QUFBQSxJQUMxQztBQUNBLFNBQUssZUFBZTtBQUFBLEVBQ3JCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRUSxnQkFBZ0IsT0FBMEI7QUFDakQsU0FBSyxnQkFBZ0IsS0FBSztBQUMxQixVQUFNLFVBQVUsS0FBSztBQUNyQixVQUFNLG1CQUFtQixNQUFNLGlCQUFpQixJQUFJO0FBQ3BELFFBQUksV0FBVyxvQkFBb0IsUUFBUSxXQUFXLElBQUksRUFBRSxTQUFTLFNBQVMsTUFBTSxrQkFBa0I7QUFDckcsV0FBSyxpQkFBaUIsU0FBUyxTQUFTLElBQUksTUFBTSxnQkFBZ0IsQ0FBQyxFQUFFLE1BQU0saUJBQWlCO0FBQUEsSUFDN0Y7QUFFQSxRQUFJLENBQUMsS0FBSyxTQUFTLEtBQUssUUFBUSxTQUFTLEtBQUssQ0FBQyxLQUFLLGtCQUFrQixNQUFNLElBQUksR0FBRztBQUNsRjtBQUFBLElBQ0Q7QUFJQSxVQUFNLFdBQVcsS0FBSyxNQUFNLFlBQVk7QUFDeEMsU0FBSyxNQUFNLFdBQVcsTUFBTSxNQUFNLEVBQUUsT0FBTyxTQUFTLE9BQU8sUUFBUSxTQUFTLE9BQU8sQ0FBQztBQUNwRixTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxrQkFBa0IsTUFBOEI7QUFDdkQsUUFBSSxDQUFDLEtBQUssT0FBTztBQUNoQixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0scUJBQXFCO0FBQzNCLFVBQU1DLFFBQU8sS0FBSyxNQUFNLFlBQVksSUFBSTtBQUN4QyxVQUFNLFdBQVcsS0FBSyxNQUFNLFlBQVk7QUFDeEMsVUFBTSx3QkFBd0JBLE1BQUssU0FBUyxLQUFLLGVBQWUsc0JBQzVELFNBQVMsUUFBUSxLQUFLLGVBQWU7QUFDekMsVUFBTSxzQkFBc0JBLE1BQUssVUFBVSxLQUFLLGdCQUFnQixzQkFDNUQsU0FBUyxTQUFTLEtBQUssZ0JBQWdCO0FBQzNDLFdBQU8seUJBQXlCO0FBQUEsRUFDakM7QUFBQSxFQUVRLGVBQWUsT0FBcUI7QUFDM0MsU0FBSyxZQUFZLElBQUksT0FBTyxNQUFTO0FBQ3JDLFNBQUssUUFBUSxVQUFVLE9BQU8sZ0JBQWdCLFNBQVMsQ0FBQztBQUN4RCxTQUFLLFFBQVEsUUFBUSxDQUFDLE9BQU8sVUFBVSxNQUFNLEtBQUssaUJBQWlCLE9BQU8sS0FBSyxDQUFDO0FBQUEsRUFDakY7QUFBQSxFQUVRLFVBQVUsT0FBb0IsVUFBcUI7QUFDMUQsVUFBTSxpQkFBaUIsSUFBSSxTQUFTLFNBQVMsR0FBRyxNQUFTO0FBQ3pELFNBQUssZ0JBQWdCLEtBQUs7QUFDMUIsUUFBSSxLQUFLLFVBQVU7QUFDbEIsV0FBSyxpQkFBaUIsU0FBUyxLQUFLLFVBQVUsUUFBUSxFQUFFLE1BQU0saUJBQWlCO0FBQUEsSUFDaEY7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFNBQVMsT0FBbUM7QUFDekQsU0FBSyxnQkFBZ0IsS0FBSztBQUMxQixVQUFNLFVBQVUsS0FBSztBQUNyQixRQUFJLFdBQVcsQ0FBQyxRQUFRLFdBQVcsSUFBSSxHQUFHO0FBQ3pDLFlBQU0sY0FBYyxJQUFJLElBQUksUUFBUSxnQkFBZ0IsSUFBSSxFQUFFLElBQUksVUFBUSxLQUFLLFNBQVMsU0FBUyxDQUFDLENBQUM7QUFDL0YsWUFBTSxLQUFLLGlCQUFpQixxQkFBcUIsT0FBTztBQUN4RCxVQUFJLEtBQUssYUFBYSxXQUFXLEtBQUssUUFBUSxTQUFTLEtBQUssR0FBRztBQUM5RCxjQUFNLGNBQWMsUUFBUSxXQUFXLElBQUk7QUFDM0MsY0FBTSxZQUFZLFlBQVksU0FBUyxTQUFTO0FBQ2hELFlBQUksQ0FBQyxZQUFZLElBQUksU0FBUyxLQUFLLFFBQVEsZ0JBQWdCLElBQUksRUFBRSxTQUFTLFdBQVcsR0FBRztBQUN2RixzQkFBWSxRQUFNO0FBQ2pCLHVCQUFXLFNBQVMsS0FBSyxTQUFTO0FBQ2pDLGtCQUFJLFVBQVUsU0FBUyxNQUFNLFlBQVksSUFBSSxFQUFFLFNBQVMsU0FBUyxHQUFHO0FBQ25FLHFCQUFLLHFCQUFxQixPQUFPLFdBQVcsRUFBRTtBQUFBLGNBQy9DO0FBQUEsWUFDRDtBQUNBLGdCQUFJLENBQUMsTUFBTSxZQUFZLElBQUksRUFBRSxTQUFTLFNBQVMsR0FBRztBQUNqRCxvQkFBTSxZQUFZLElBQUksQ0FBQyxHQUFHLE1BQU0sWUFBWSxJQUFJLEdBQUcsU0FBUyxHQUFHLEVBQUU7QUFBQSxZQUNsRTtBQUNBLGtCQUFNLGlCQUFpQixJQUFJLFdBQVcsRUFBRTtBQUFBLFVBQ3pDLENBQUM7QUFDRCxlQUFLLGdCQUFnQixLQUFLO0FBQzFCLGVBQUssbUJBQW1CO0FBQ3hCLGVBQUssZUFBZTtBQUFBLFFBQ3JCO0FBQ0EsY0FBTSxLQUFLLE1BQU07QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxtQkFBbUIsV0FBc0M7QUFDeEQsVUFBTSxjQUFjLEtBQUssZUFBZSxLQUFLLFFBQVEsUUFBUSxLQUFLLFlBQVksSUFBSTtBQUNsRixRQUFJLGNBQWMsS0FBSyxLQUFLLFFBQVEsU0FBUyxHQUFHO0FBQy9DO0FBQUEsSUFDRDtBQUNBLFVBQU0sU0FBUyxjQUFjLFNBQVMsSUFBSTtBQUMxQyxVQUFNLFNBQVMsS0FBSyxTQUFTLGNBQWMsU0FBUyxLQUFLLFFBQVEsVUFBVSxLQUFLLFFBQVEsTUFBTTtBQUM5RixTQUFLLGdCQUFnQixNQUFNO0FBQzNCLFdBQU8sS0FBSyxNQUFNO0FBQUEsRUFDbkI7QUFBQSxFQUVBLGdCQUFnQixXQUFxQztBQUNwRCxVQUFNLFNBQVMsS0FBSztBQUNwQixVQUFNLFdBQVcsUUFBUSxpQkFBaUIsSUFBSTtBQUM5QyxRQUFJLFVBQVUsWUFBWSxPQUFPLFlBQVksSUFBSSxFQUFFLFNBQVMsR0FBRztBQUM5RCxXQUFLLHVCQUF1QixJQUFJLE1BQU0sUUFBUSxHQUFHLFFBQVEsUUFBUSxTQUFTO0FBQUEsSUFDM0U7QUFBQSxFQUNEO0FBQUEsRUFFQSw4QkFBOEIsV0FBc0M7QUFDbkUsVUFBTSxTQUFTLEtBQUs7QUFDcEIsVUFBTSxjQUFjLFNBQVMsS0FBSyxRQUFRLFFBQVEsTUFBTSxJQUFJO0FBQzVELFVBQU0sV0FBVyxRQUFRLGlCQUFpQixJQUFJO0FBQzlDLFFBQUksQ0FBQyxVQUFVLGNBQWMsS0FBSyxDQUFDLFlBQVksS0FBSyxRQUFRLFNBQVMsR0FBRztBQUN2RTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsY0FBYyxTQUFTLElBQUk7QUFDMUMsVUFBTSxTQUFTLEtBQUssU0FBUyxjQUFjLFNBQVMsS0FBSyxRQUFRLFVBQVUsS0FBSyxRQUFRLE1BQU07QUFDOUYsU0FBSyxpQkFBaUIsSUFBSSxNQUFNLFFBQVEsR0FBRyxRQUFRLE1BQU07QUFDekQsV0FBTyxLQUFLLE1BQU07QUFBQSxFQUNuQjtBQUFBLEVBRVEsaUJBQWlCLE1BQStCO0FBQ3ZELFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSztBQUFRLGVBQU8sVUFBVTtBQUFBLE1BQzlCLEtBQUs7QUFBUyxlQUFPLFVBQVU7QUFBQSxNQUMvQixLQUFLO0FBQU8sZUFBTyxVQUFVO0FBQUEsTUFDN0IsS0FBSztBQUFVLGVBQU8sVUFBVTtBQUFBLE1BQ2hDO0FBQVMsZUFBTyxVQUFVO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQUEsRUFFQSxpQkFBaUIsUUFBdUI7QUFDdkMsUUFBSSxLQUFLLG1CQUFtQixRQUFRO0FBQ25DO0FBQUEsSUFDRDtBQUNBLFNBQUssaUJBQWlCO0FBQ3RCLGVBQVcsU0FBUyxLQUFLLFNBQVM7QUFDakMsWUFBTSxLQUFLLGlCQUFpQixNQUFNO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUEsRUFFQSxrQkFBa0IsU0FBd0I7QUFDekMsUUFBSSxLQUFLLG9CQUFvQixTQUFTO0FBQ3JDO0FBQUEsSUFDRDtBQUNBLFNBQUssa0JBQWtCO0FBQ3ZCLGVBQVcsU0FBUyxLQUFLLFNBQVM7QUFDakMsWUFBTSxLQUFLLGtCQUFrQixPQUFPO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBQUEsRUFFQSxjQUFnQztBQUMvQixXQUFPLEtBQUssY0FBYyxLQUFLLFlBQVksS0FBSyxRQUFRLFFBQVEsS0FBSztBQUFBLEVBQ3RFO0FBQUEsRUFFQSxnQkFBZ0IsV0FBZ0IsWUFBMkI7QUFDMUQsU0FBSyxjQUFjLEtBQUssZ0JBQWdCLFdBQVcsVUFBVTtBQUFBLEVBQzlEO0FBQUEsRUFFQSxhQUFhLE1BQW9CO0FBQ2hDLFNBQUssY0FBYyxLQUFLLGFBQWEsSUFBSTtBQUFBLEVBQzFDO0FBQUEsRUFFQSxVQUFVLE1BQW9CO0FBQzdCLFNBQUssY0FBYyxLQUFLLFVBQVUsSUFBSTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxPQUFPLE1BQW1CO0FBQ3pCLFNBQUssY0FBYyxLQUFLLE9BQU8sSUFBSTtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxjQUFjLEtBQUssTUFBTTtBQUFBLEVBQy9CO0FBQUEsRUFFQSxPQUFPLE9BQWUsUUFBZ0IsS0FBYSxNQUFvQjtBQUN0RSxTQUFLLGNBQWMsRUFBRSxPQUFPLFFBQVEsS0FBSyxLQUFLO0FBQzlDLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUEsRUFFUSxlQUFxQjtBQUM1QixRQUFJLENBQUMsS0FBSyxhQUFhO0FBQ3RCO0FBQUEsSUFDRDtBQUNBLFVBQU0sRUFBRSxPQUFPLFFBQVEsS0FBSyxLQUFLLElBQUksS0FBSztBQUMxQyxTQUFLLEtBQUssU0FBUyxPQUFPLE1BQU07QUFDaEMsU0FBSyxPQUFPLE9BQU8sT0FBTyxRQUFRLEtBQUssSUFBSTtBQUFBLEVBQzVDO0FBQUEsRUFFQSxJQUFZLG1CQUEwQjtBQUNyQyxXQUFPLEtBQUssTUFBTSxTQUFTLGlCQUFpQixLQUFLLEtBQUssTUFBTSxTQUFTLGNBQWMsS0FBSyxNQUFNO0FBQUEsRUFDL0Y7QUFBQSxFQUVTLGVBQXFCO0FBQzdCLFVBQU0sYUFBYTtBQUNuQixTQUFLLE9BQU8sTUFBTSxFQUFFLGlCQUFpQixLQUFLLGlCQUFpQixDQUFDO0FBQUEsRUFDN0Q7QUFBQTtBQUFBLEVBR1EsaUJBQXVCO0FBQzlCLFFBQUksQ0FBQyxLQUFLLFlBQVksQ0FBQyxLQUFLLFNBQVMsS0FBSyxpQkFBaUI7QUFDMUQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxZQUFZLEtBQUssU0FBUztBQUNoQyxRQUFJLENBQUMsS0FBSyxTQUFTLFVBQVUsSUFBSSxHQUFHO0FBQ25DLFdBQUssWUFBWSxXQUFXLE1BQVM7QUFDckM7QUFBQSxJQUNEO0FBQ0EsUUFBSSxLQUFLLFFBQVEsVUFBVSxHQUFHO0FBQzdCLFdBQUssWUFBWSxXQUFXLE1BQVM7QUFDckM7QUFBQSxJQUNEO0FBQ0EsU0FBSyxRQUFRLFFBQVEsQ0FBQyxPQUFPLE1BQU0sTUFBTSxLQUFLLHNCQUFzQixDQUFDLENBQUM7QUFDdEUsVUFBTSxTQUFzQztBQUFBLE1BQzNDLFNBQVM7QUFBQSxNQUNULE1BQU0sS0FBSyxNQUFNLFVBQVU7QUFBQSxNQUMzQixRQUFRLEtBQUssUUFBUSxJQUFJLFlBQVUsRUFBRSxhQUFhLE1BQU0sWUFBWSxJQUFJLEdBQUcsa0JBQWtCLE1BQU0saUJBQWlCLElBQUksRUFBRSxFQUFFO0FBQUEsTUFDNUgsa0JBQWtCLEtBQUssSUFBSSxHQUFHLEtBQUssUUFBUSxRQUFRLEtBQUssWUFBYSxDQUFDO0FBQUEsSUFDdkU7QUFDQSxTQUFLLFlBQVksV0FBVyxNQUFNO0FBQUEsRUFDbkM7QUFBQSxFQUVRLHFCQUFrRTtBQUN6RSxVQUFNLE1BQU0sS0FBSyxnQkFBZ0IsSUFBSSxlQUFlLGFBQWEsYUFBYSxTQUFTO0FBQ3ZGLFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFFBQUk7QUFDSCxhQUFPLEtBQUssTUFBTSxHQUFHO0FBQUEsSUFDdEIsUUFBUTtBQUNQLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxZQUFZLFdBQTREO0FBQy9FLFVBQU0sUUFBUSxLQUFLLG1CQUFtQixFQUFFLFNBQVM7QUFDakQsV0FBTyxPQUFPLFlBQVksSUFBSSxRQUFRO0FBQUEsRUFDdkM7QUFBQSxFQUVRLFlBQVksV0FBbUIsUUFBdUQ7QUFDN0YsVUFBTSxVQUFVLEtBQUssbUJBQW1CO0FBQ3hDLFFBQUksUUFBUTtBQUNYLGNBQVEsU0FBUyxJQUFJO0FBQUEsSUFDdEIsV0FBVyxRQUFRLFNBQVMsTUFBTSxRQUFXO0FBQzVDO0FBQUEsSUFDRCxPQUFPO0FBQ04sYUFBTyxRQUFRLFNBQVM7QUFBQSxJQUN6QjtBQUNBLFNBQUssZ0JBQWdCLE1BQU0sZUFBZSxhQUFhLEtBQUssVUFBVSxPQUFPLEdBQUcsYUFBYSxXQUFXLGNBQWMsT0FBTztBQUFBLEVBQzlIO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLGVBQWU7QUFDcEIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBanpCYSxlQUVZLGNBQWM7QUFGMUIsaUJBQU47QUFBQSxFQXFDSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeENVOyIsCiAgIm5hbWVzIjogWyJjaGF0IiwgInNpemUiXQp9Cg==
