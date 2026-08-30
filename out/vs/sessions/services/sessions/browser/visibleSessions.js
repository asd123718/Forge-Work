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
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue, transaction } from "../../../../base/common/observable.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ChatInteractivity, ChatOriginKind, SessionStatus } from "../common/session.js";
class VisibleSession extends Disposable {
  constructor(_session, initialChat, initialClosedChatUris) {
    super();
    this._session = _session;
    this._sticky = observableValue("activeSessionSticky", false);
    this.sticky = this._sticky;
    /** Append-only list tracking close order; last element is the most recently closed. */
    this._closedChatOrder = [];
    this._activeChat = observableValue(`activeChat-${_session.sessionId}`, initialChat);
    this.activeChat = this._activeChat;
    this._activeChatModelId = derived(this, (reader) => this._activeChat.read(reader).modelId.read(reader));
    this._activeChatMode = derived(this, (reader) => this._activeChat.read(reader).mode.read(reader));
    const seed = new Set(initialClosedChatUris);
    seed.delete(_session.mainChat.get().resource.toString());
    const activeUri = initialChat?.resource.toString();
    if (activeUri) {
      seed.delete(activeUri);
    }
    this._closedChatUris = observableValue("closedChatUris", seed);
    const shownSubagents = /* @__PURE__ */ new Set();
    if (initialChat?.origin?.kind === ChatOriginKind.Tool) {
      shownSubagents.add(initialChat.resource.toString());
    }
    this._shownSubagentUris = observableValue("shownSubagentUris", shownSubagents);
    this._isCreated = _session.status.map((status) => status !== SessionStatus.Untitled);
    this.isCreated = this._isCreated;
    this.openChats = derived(this, (reader) => {
      const closed = this._closedChatUris.read(reader);
      const chats = this._session.chats.read(reader);
      return chats.filter((c) => c.interactivity.read(reader) !== ChatInteractivity.Hidden && !closed.has(c.resource.toString()));
    });
    this.closedChats = derived(this, (reader) => {
      const closed = this._closedChatUris.read(reader);
      if (closed.size === 0) {
        return [];
      }
      return this._session.chats.read(reader).filter((c) => closed.has(c.resource.toString()));
    });
    this.visibleChatTabs = derived(this, (reader) => {
      const shownSubagents2 = this._shownSubagentUris.read(reader);
      return this.openChats.read(reader).filter((c) => c.origin?.kind !== ChatOriginKind.Tool || shownSubagents2.has(c.resource.toString()));
    });
    this.shouldShowChatTabs = derived(this, (reader) => {
      return this.visibleChatTabs.read(reader).length > 1;
    });
  }
  setActiveChat(chat) {
    this._activeChat.set(chat, void 0);
  }
  closeChat(chat) {
    const chatUri = chat.resource.toString();
    if (chatUri === this._session.mainChat.get().resource.toString()) {
      return;
    }
    if (chat.origin?.kind === ChatOriginKind.Tool) {
      const shown = this._shownSubagentUris.get();
      if (!shown.has(chatUri)) {
        return;
      }
      const nextShown = new Set(shown);
      nextShown.delete(chatUri);
      transaction((tx) => {
        this._shownSubagentUris.set(nextShown, tx);
        if (this._activeChat.get().resource.toString() === chatUri) {
          this._activeChat.set(this._defaultActiveChat(this._closedChatUris.get(), nextShown), tx);
        }
      });
      return;
    }
    const closed = this._closedChatUris.get();
    if (closed.has(chatUri)) {
      return;
    }
    const next = new Set(closed);
    next.add(chatUri);
    this._closedChatOrder.push(chat);
    transaction((tx) => {
      this._closedChatUris.set(next, tx);
      if (this._activeChat.get().resource.toString() === chatUri) {
        this._activeChat.set(this._defaultActiveChat(next, this._shownSubagentUris.get()), tx);
      }
    });
  }
  openChat(chat) {
    if (chat.origin?.kind === ChatOriginKind.Tool) {
      const shown = this._shownSubagentUris.get();
      if (shown.has(chat.resource.toString())) {
        return;
      }
      const next2 = new Set(shown);
      next2.add(chat.resource.toString());
      this._shownSubagentUris.set(next2, void 0);
      return;
    }
    const closed = this._closedChatUris.get();
    if (!closed.has(chat.resource.toString())) {
      return;
    }
    const next = new Set(closed);
    next.delete(chat.resource.toString());
    this._closedChatUris.set(next, void 0);
    const idx = this._closedChatOrder.findLastIndex((c) => c.resource.toString() === chat.resource.toString());
    if (idx !== -1) {
      this._closedChatOrder.splice(idx, 1);
    }
  }
  /**
   * Pick the active chat to fall back to when the current one is closed: the
   * last chat that would appear as a visible tab given the closed and shown-
   * subagent sets, or the main chat.
   */
  _defaultActiveChat(closed, shownSubagents) {
    const candidates = this._session.chats.get().filter((c) => c.interactivity.get() !== ChatInteractivity.Hidden && !closed.has(c.resource.toString()) && (c.origin?.kind !== ChatOriginKind.Tool || shownSubagents.has(c.resource.toString())));
    return candidates[candidates.length - 1] ?? this._session.mainChat.get();
  }
  get lastClosedChat() {
    const currentChats = this._session.chats.get();
    const closed = this._closedChatUris.get();
    for (let i = this._closedChatOrder.length - 1; i >= 0; i--) {
      const chat = this._closedChatOrder[i];
      const uri = chat.resource.toString();
      if (closed.has(uri) && currentChats.some((c) => c.resource.toString() === uri)) {
        return chat;
      }
    }
    return void 0;
  }
  setSticky(value) {
    this._sticky.set(value, void 0);
  }
  /** Register a disposable that lives as long as this wrapper. */
  addDisposable(disposable) {
    return this._register(disposable);
  }
  get sessionId() {
    return this._session.sessionId;
  }
  get resource() {
    return this._session.resource;
  }
  get providerId() {
    return this._session.providerId;
  }
  get sessionType() {
    return this._session.sessionType;
  }
  get icon() {
    return this._session.icon;
  }
  get createdAt() {
    return this._session.createdAt;
  }
  get workspace() {
    return this._session.workspace;
  }
  get hasGitRepository() {
    return this._session.hasGitRepository;
  }
  get worktreePending() {
    return this._session.worktreePending;
  }
  get isQuickChat() {
    return this._session.isQuickChat;
  }
  get isAutomation() {
    return this._session.isAutomation;
  }
  get title() {
    return this._session.title;
  }
  get updatedAt() {
    return this._session.updatedAt;
  }
  get status() {
    return this._session.status;
  }
  get completedStateIcon() {
    return this._session.completedStateIcon;
  }
  get changesSummary() {
    return this._session.changesSummary;
  }
  get changesets() {
    return this._session.changesets;
  }
  get changes() {
    return this._session.changes;
  }
  get externalChanges() {
    return this._session.externalChanges;
  }
  get modelId() {
    return this._activeChatModelId;
  }
  get mode() {
    return this._activeChatMode;
  }
  get loading() {
    return this._session.loading;
  }
  get isArchived() {
    return this._session.isArchived;
  }
  get isRead() {
    return this._session.isRead;
  }
  get description() {
    return this._session.description;
  }
  get lastTurnEnd() {
    return this._session.lastTurnEnd;
  }
  get chats() {
    return this._session.chats;
  }
  get mainChat() {
    return this._session.mainChat;
  }
  get capabilities() {
    return this._session.capabilities;
  }
  /** The wrapped session, which outlives this wrapper. */
  get session() {
    return this._session;
  }
}
class ResourceOverrideSession {
  constructor(_session, resource) {
    this._session = _session;
    this.resource = resource;
  }
  get sessionId() {
    return this._session.sessionId;
  }
  get providerId() {
    return this._session.providerId;
  }
  get sessionType() {
    return this._session.sessionType;
  }
  get icon() {
    return this._session.icon;
  }
  get createdAt() {
    return this._session.createdAt;
  }
  get workspace() {
    return this._session.workspace;
  }
  get hasGitRepository() {
    return this._session.hasGitRepository;
  }
  get worktreePending() {
    return this._session.worktreePending;
  }
  get isQuickChat() {
    return this._session.isQuickChat;
  }
  get isAutomation() {
    return this._session.isAutomation;
  }
  get title() {
    return this._session.title;
  }
  get updatedAt() {
    return this._session.updatedAt;
  }
  get status() {
    return this._session.status;
  }
  get completedStateIcon() {
    return this._session.completedStateIcon;
  }
  get changesSummary() {
    return this._session.changesSummary;
  }
  get changes() {
    return this._session.changes;
  }
  get changesets() {
    return this._session.changesets;
  }
  get externalChanges() {
    return this._session.externalChanges;
  }
  get modelId() {
    return this._session.modelId;
  }
  get mode() {
    return this._session.mode;
  }
  get loading() {
    return this._session.loading;
  }
  get isArchived() {
    return this._session.isArchived;
  }
  get isRead() {
    return this._session.isRead;
  }
  get description() {
    return this._session.description;
  }
  get lastTurnEnd() {
    return this._session.lastTurnEnd;
  }
  get chats() {
    return this._session.chats;
  }
  get mainChat() {
    return this._session.mainChat;
  }
  get capabilities() {
    return this._session.capabilities;
  }
}
const NO_RECENT = /* @__PURE__ */ Symbol("no-recent");
let VisibleSessions = class extends Disposable {
  /**
   * @param _onSlotReplaced Reports a session that left the grid because a
   * newly opened slot took its place, with the slot state it lost. Explicit
   * removals ({@link removeMany}) and grid restores are not reported.
   */
  constructor(_resolveInitialChat, _resolveInitialClosedChats, _onSlotReplaced, _uriIdentityService) {
    super();
    this._resolveInitialChat = _resolveInitialChat;
    this._resolveInitialClosedChats = _resolveInitialClosedChats;
    this._onSlotReplaced = _onSlotReplaced;
    this._uriIdentityService = _uriIdentityService;
    this._activeSession = observableValue(this, void 0);
    this.activeSession = this._activeSession;
    /**
     * Whether the most recent active-session change asked to preserve keyboard
     * focus (i.e. show the session without moving focus into it). Always set in
     * the **same transaction** as {@link _activeSession} via
     * {@link _setActiveSession} so the pair can never go stale, and read
     * reactively by the consumer that drives focus.
     */
    this._activePreserveFocus = observableValue(this, false);
    this.activePreserveFocus = this._activePreserveFocus;
    this._visibleSessions = observableValue(this, [void 0]);
    this.visibleSessions = this._visibleSessions;
    this._wrappers = this._register(new DisposableMap());
    /**
     * Ordered slot ids in the grid (left-to-right). Each entry is either a
     * session id or `undefined` (the empty slot). The invariant is that at
     * most one entry is `undefined` at any time.
     */
    this._visibleList = [];
    /** Subset of {@link _visibleList} the user has marked sticky. */
    this._stickyIds = /* @__PURE__ */ new Set();
    /**
     * Slot id of the most recently opened (or toggled-to-non-sticky) entry in
     * the grid. Used to choose which non-sticky slot to replace when opening a
     * new session while the active one is sticky.
     * - `NO_RECENT` means none is tracked.
     * - `undefined` refers to the empty slot.
     * - A string refers to that session id.
     */
    this._mostRecentNonStickySlot = NO_RECENT;
  }
  /**
   * Set the active session together with its preserve-focus intent in a
   * single transaction. Routing every active-session change through here
   * guarantees the two observables are always consistent and that the intent
   * never goes stale (callers that do not preserve focus pass `false`).
   */
  _setActiveSession(session, preserveFocus, tsx) {
    this._activeSession.set(session, tsx);
    this._activePreserveFocus.set(preserveFocus, tsx);
  }
  /**
   * Set the active session, updating the visibility model accordingly.
   *
   * - Passing `undefined` places (or keeps) the single empty slot in the
   *   grid and makes it active. The empty slot is always non-sticky.
   * - If the session is already in the grid, its slot is preserved and only
   *   the active observable is updated.
   * - Otherwise the session is placed as non-sticky:
   *   - If the active slot is non-sticky, the new one replaces it in
   *     place.
   *   - Else if a non-sticky slot exists, the most-recently opened
   *     non-sticky is replaced.
   *   - Else the session is appended at the end of the grid.
   *
   * Returns the wrapper for the active session, or `undefined` when the
   * active slot is the empty slot.
   */
  setActive(session, preserveFocus = false) {
    const targetId = session?.sessionId;
    const targetHasVisibleSlot = this._visibleList.includes(targetId);
    if (!targetHasVisibleSlot) {
      const activeSlot = this._currentActiveSlot();
      const activeIsNonSticky = activeSlot !== NO_RECENT && !this._isStickySlot(activeSlot);
      let replaceSlot;
      if (activeIsNonSticky) {
        replaceSlot = activeSlot;
      } else if (this._mostRecentNonStickySlot !== NO_RECENT && this._visibleList.includes(this._mostRecentNonStickySlot) && !this._isStickySlot(this._mostRecentNonStickySlot)) {
        replaceSlot = this._mostRecentNonStickySlot;
      } else {
        replaceSlot = this._findLastNonSticky();
      }
      if (replaceSlot !== NO_RECENT) {
        const idx = this._visibleList.indexOf(replaceSlot);
        this._visibleList.splice(idx, 1, targetId);
        if (replaceSlot !== void 0) {
          const replaced = this._wrappers.get(replaceSlot)?.session;
          const sticky = this._stickyIds.has(replaceSlot);
          this._wrappers.deleteAndDispose(replaceSlot);
          if (replaced) {
            this._onSlotReplaced(replaced, idx, sticky, targetId);
          }
        }
      } else {
        this._visibleList.push(targetId);
      }
      this._mostRecentNonStickySlot = targetId;
    }
    const visibleSession = session ? this._getOrCreateVisibleSession(session) : void 0;
    transaction((tsx) => {
      this._setActiveSession(visibleSession, preserveFocus, tsx);
      if (!targetHasVisibleSlot) {
        this._refresh(tsx);
      }
    });
    return visibleSession;
  }
  /**
   * Insert (or move) a slot into the grid positioned next to a target
   * session that is already visible. Used by drag-and-drop and by
   * "open at position" entry points.
   *
   * - If the slot is not yet visible, a new non-sticky entry is created
   *   at the computed position. For an `undefined` session (empty slot),
   *   this is a no-op when an empty slot already exists in the grid.
   * - If the slot is already visible, it is moved to the computed
   *   position; its sticky / non-sticky state is preserved.
   *
   * When `activate` is `true` (default), the inserted slot also becomes
   * the active session. When `false`, the active session is left
   * unchanged.
   *
   * `targetSessionId` may be `undefined` to position relative to the empty
   * (new-session) slot. No-op if the target slot is not currently visible.
   */
  insertAt(session, targetSessionId, side, activate = true) {
    const id = session?.sessionId;
    const targetIdx = this._visibleList.indexOf(targetSessionId);
    if (targetIdx < 0) {
      return;
    }
    if (id === void 0 && this._visibleList.includes(void 0)) {
      return;
    }
    let destIdx = side === "left" ? targetIdx : targetIdx + 1;
    const currentIdx = this._visibleList.indexOf(id);
    if (currentIdx >= 0) {
      if (currentIdx !== destIdx && currentIdx + 1 !== destIdx) {
        this._visibleList.splice(currentIdx, 1);
        if (currentIdx < destIdx) {
          destIdx--;
        }
        this._visibleList.splice(destIdx, 0, id);
      }
      if (!this._isStickySlot(id)) {
        this._mostRecentNonStickySlot = id;
      }
    } else {
      if (session) {
        this._getOrCreateVisibleSession(session);
      }
      this._visibleList.splice(destIdx, 0, id);
      this._mostRecentNonStickySlot = id;
    }
    transaction((tsx) => {
      if (activate) {
        const wrapper = id !== void 0 ? this._wrappers.get(id) : void 0;
        this._setActiveSession(wrapper, false, tsx);
      }
      this._refresh(tsx);
    });
  }
  /**
   * Atomically (re)build the entire grid from a persisted snapshot.
   *
   * Slots are given left-to-right; a `session` of `undefined` denotes the
   * empty new-session slot. The whole model — slot order, stickiness and the
   * active slot — is published in a single transaction so restoring multiple
   * sessions does not produce intermediate layouts (which would otherwise
   * cause the grid to visibly flicker as sessions are restored one by one).
   *
   * Any wrappers for sessions no longer present in the snapshot are disposed.
   *
   * @param slots Ordered grid slots to restore.
   * @param activeIndex Index into `slots` of the slot that should be active,
   * or `-1` for none.
   */
  restoreGrid(slots, activeIndex) {
    this._visibleList = [];
    this._stickyIds.clear();
    let activeWrapper;
    let lastNonStickySlot = NO_RECENT;
    for (let i = 0; i < slots.length; i++) {
      const { session, sticky } = slots[i];
      const id = session?.sessionId;
      this._visibleList.push(id);
      if (session) {
        const wrapper = this._getOrCreateVisibleSession(session);
        if (sticky) {
          this._stickyIds.add(session.sessionId);
        }
        if (i === activeIndex) {
          activeWrapper = wrapper;
        }
      }
      if (!this._isStickySlot(id)) {
        lastNonStickySlot = id;
      }
    }
    for (const existingId of [...this._wrappers.keys()]) {
      if (!this._visibleList.includes(existingId)) {
        this._wrappers.deleteAndDispose(existingId);
      }
    }
    const activeId = activeWrapper?.sessionId;
    this._mostRecentNonStickySlot = activeId !== void 0 && !this._isStickySlot(activeId) ? activeId : lastNonStickySlot;
    transaction((tsx) => {
      this._setActiveSession(activeWrapper, false, tsx);
      this._refresh(tsx);
    });
  }
  /**
   * The grid slot state of a currently visible session (or of the empty slot
   * when `sessionId` is `undefined`), or `undefined` when it is not visible.
   */
  getSlot(sessionId) {
    const index = this._visibleList.indexOf(sessionId);
    return index < 0 ? void 0 : { index, sticky: this._isStickySlot(sessionId) };
  }
  /** The session behind a visible slot, or `undefined` for the empty slot / an unknown id. */
  getSession(sessionId) {
    return sessionId === void 0 ? void 0 : this._wrappers.get(sessionId)?.session;
  }
  /**
   * Put a session (back) into the grid at `index`, shifting the slots at and
   * after it to the right, and make it active. The index is clamped to the
   * current grid size, so a stale index appends instead of failing. No-op
   * when the session is already visible.
   */
  insertAtIndex(session, index, sticky) {
    const id = session.sessionId;
    if (this._visibleList.includes(id)) {
      const existing = this._wrappers.get(id);
      transaction((tsx) => this._setActiveSession(existing, false, tsx));
      return existing;
    }
    const destIdx = Math.max(0, Math.min(index, this._visibleList.length));
    const wrapper = this._getOrCreateVisibleSession(session);
    this._visibleList.splice(destIdx, 0, id);
    if (sticky) {
      this._stickyIds.add(id);
    } else {
      this._mostRecentNonStickySlot = id;
    }
    transaction((tsx) => {
      this._setActiveSession(wrapper, false, tsx);
      this._refresh(tsx);
    });
    return wrapper;
  }
  /**
   * Replace the slot currently held by `slotId` (`undefined` for the empty
   * slot) with `session`, and make it active. Used to undo a grid
   * replacement, so the restored session lands exactly where it was and the
   * session that took its place leaves the grid. No-op when the slot is not
   * visible or the session is already visible elsewhere.
   */
  replaceSlot(slotId, session, sticky) {
    const id = session.sessionId;
    const idx = this._visibleList.indexOf(slotId);
    if (idx < 0 || this._visibleList.includes(id)) {
      return void 0;
    }
    this._visibleList.splice(idx, 1, id);
    if (slotId !== void 0) {
      this._stickyIds.delete(slotId);
      this._wrappers.deleteAndDispose(slotId);
    }
    if (sticky) {
      this._stickyIds.add(id);
    }
    if (this._mostRecentNonStickySlot === slotId) {
      this._mostRecentNonStickySlot = sticky ? this._findLastNonSticky() : id;
    }
    const wrapper = this._getOrCreateVisibleSession(session);
    transaction((tsx) => {
      this._setActiveSession(wrapper, false, tsx);
      this._refresh(tsx);
    });
    return wrapper;
  }
  /**
   * Toggle a session's stickiness in the grid. The session keeps its grid
   * slot when toggled.
   * - If the session is not currently visible, it is appended at the end as
   *   sticky.
   *
   * Returns the session's stickiness state after the toggle.
   */
  toggleStickiness(session) {
    const id = session.sessionId;
    if (!this._visibleList.includes(id)) {
      this._stickyIds.add(id);
      this._getOrCreateVisibleSession(session);
      this._visibleList.push(id);
    } else if (this._stickyIds.has(id)) {
      this._stickyIds.delete(id);
      this._mostRecentNonStickySlot = id;
    } else {
      this._stickyIds.add(id);
      if (this._mostRecentNonStickySlot === id) {
        this._mostRecentNonStickySlot = this._findLastNonSticky();
      }
    }
    this._refresh(void 0);
    return this._stickyIds.has(id);
  }
  /**
   * Remove the given session ids from the visibility model and dispose their
   * wrappers. Passing `undefined` removes the empty (new-session) slot if
   * present. If the active slot is among the removed entries, the active
   * observable falls back to the slot at the active's original position
   * (or the slot to its left if it was at the end of the grid); when no
   * visible slot remains, the active observable is cleared. Observables
   * are refreshed once if anything changed.
   */
  removeMany(sessionIds) {
    transaction((tsx) => {
      let changed = false;
      const activeId = this._activeSession.get()?.sessionId;
      const emptySlotIsActive = activeId === void 0 && this._visibleList.includes(void 0);
      const activeSlotId = emptySlotIsActive ? void 0 : activeId;
      const activeIdx = activeId !== void 0 || emptySlotIsActive ? this._visibleList.indexOf(activeSlotId) : -1;
      let activeRemoved = false;
      for (const id of sessionIds) {
        if (this._removeFromModel(id)) {
          changed = true;
          if (id === void 0 ? emptySlotIsActive : id === activeId) {
            activeRemoved = true;
          }
        }
      }
      if (activeRemoved) {
        if (this._visibleList.length === 0) {
          this._setActiveSession(void 0, false, tsx);
        } else {
          const fallbackIdx = Math.max(0, Math.min(activeIdx - 1, this._visibleList.length - 1));
          const fallbackId = this._visibleList[fallbackIdx];
          const fallbackWrapper = fallbackId !== void 0 ? this._wrappers.get(fallbackId) : void 0;
          this._setActiveSession(fallbackWrapper, false, tsx);
        }
      }
      if (changed) {
        this._refresh(tsx);
      }
    });
  }
  /**
   * Set the active chat for the given session's wrapper. No-op if the
   * session is not currently tracked in the visibility model.
   */
  setActiveChat(session, chat) {
    this._wrappers.get(session.sessionId)?.setActiveChat(chat);
  }
  /**
   * Close (hide from the tab strip) the given chat in the session's wrapper.
   * No-op if the session is not currently tracked in the visibility model.
   */
  closeChat(session, chat) {
    this._wrappers.get(session.sessionId)?.closeChat(chat);
  }
  /**
   * Open (un-hide from the tab strip) a previously closed chat in the session's
   * wrapper. No-op if the session is not currently tracked in the visibility model.
   */
  openChat(session, chat) {
    this._wrappers.get(session.sessionId)?.openChat(chat);
  }
  /**
   * Replace the given session in the visibility model with `updatedSession`,
   * preserving the grid slot, sticky state, and active state. The wrapper
   * for the old session is disposed; a fresh wrapper is created for the
   * updated session. No-op if `session` is not currently in the grid.
   */
  updateSession(session, updatedSession) {
    const fromId = session.sessionId;
    if (!this._visibleList.includes(fromId)) {
      return;
    }
    const wasActive = this._activeSession.get()?.sessionId === fromId;
    this.replaceId(fromId, updatedSession.sessionId);
    if (fromId === updatedSession.sessionId && this._wrappers.has(fromId)) {
      this._wrappers.deleteAndDispose(fromId);
    }
    transaction((tsx) => {
      const visibleSession = this._getOrCreateVisibleSession(updatedSession);
      if (wasActive) {
        this._setActiveSession(visibleSession, false, tsx);
      }
      this._refresh(tsx);
    });
  }
  /**
   * Create a transient {@link ISession} that mirrors the given session but
   * exposes a different {@link ISession.resource}. The visibility model's
   * wrapper for the same session id is rebuilt against this transient
   * session so consumers observe the new resource. Returns the transient
   * session so callers can pass it to a subsequent {@link updateSession}
   * once the provider produces the final session.
   *
   * No-op (but still returns the transient session) if the session is not
   * currently in the grid.
   */
  updateResourceOfSession(session, resource) {
    const tmpSession = new ResourceOverrideSession(session, resource);
    this.updateSession(session, tmpSession);
    return tmpSession;
  }
  /**
   * Rename a session id in the visibility model so the same grid slot is
   * reused for the replacement. The old wrapper is disposed; a fresh one is
   * created lazily on next access. Does not auto-refresh — callers should
   * call {@link refresh} or {@link setActive} as appropriate.
   */
  replaceId(fromId, toId) {
    if (fromId === toId) {
      return;
    }
    const idx = this._visibleList.indexOf(fromId);
    if (idx >= 0) {
      this._visibleList.splice(idx, 1, toId);
    }
    if (this._stickyIds.delete(fromId)) {
      this._stickyIds.add(toId);
    }
    if (this._mostRecentNonStickySlot === fromId) {
      this._mostRecentNonStickySlot = toId;
    }
    if (this._wrappers.has(fromId)) {
      this._wrappers.deleteAndDispose(fromId);
    }
  }
  /** Re-publish the visible sessions and sticky ids observables. */
  refresh() {
    this._refresh(void 0);
  }
  _findLastNonSticky() {
    for (let i = this._visibleList.length - 1; i >= 0; i--) {
      const sid = this._visibleList[i];
      if (!this._isStickySlot(sid)) {
        return sid;
      }
    }
    return NO_RECENT;
  }
  /** True if the given slot id refers to a sticky session. The empty slot is never sticky. */
  _isStickySlot(id) {
    return id !== void 0 && this._stickyIds.has(id);
  }
  /**
   * Returns the slot id of the currently active entry in the grid, or
   * {@link NO_RECENT} if no entry in the grid is active.
   */
  _currentActiveSlot() {
    const activeId = this._activeSession.get()?.sessionId;
    if (activeId !== void 0) {
      return this._visibleList.includes(activeId) ? activeId : NO_RECENT;
    }
    return this._visibleList.includes(void 0) ? void 0 : NO_RECENT;
  }
  _removeFromModel(sessionId) {
    let changed = false;
    const idx = this._visibleList.indexOf(sessionId);
    if (idx >= 0) {
      this._visibleList.splice(idx, 1);
      changed = true;
    }
    if (sessionId !== void 0 && this._stickyIds.delete(sessionId)) {
      changed = true;
    }
    if (this._mostRecentNonStickySlot === sessionId) {
      this._mostRecentNonStickySlot = this._findLastNonSticky();
      changed = true;
    }
    if (sessionId !== void 0 && this._wrappers.has(sessionId)) {
      this._wrappers.deleteAndDispose(sessionId);
      changed = true;
    }
    return changed;
  }
  _refresh(tsx) {
    const wrappers = [];
    for (const id of this._visibleList) {
      if (id === void 0) {
        wrappers.push(void 0);
        continue;
      }
      const visibleSession = this._wrappers.get(id);
      if (visibleSession) {
        visibleSession.setSticky(this._stickyIds.has(id));
        wrappers.push(visibleSession);
      }
    }
    this._visibleSessions.set(wrappers, tsx);
  }
  _getOrCreateVisibleSession(session) {
    let visibleSession = this._wrappers.get(session.sessionId);
    if (visibleSession) {
      return visibleSession;
    }
    const initialChat = this._resolveInitialChat(session);
    visibleSession = new VisibleSession(session, initialChat, this._resolveInitialClosedChats(session));
    const visibleSessionRef = visibleSession;
    visibleSession.addDisposable(autorun((reader) => {
      const chats = session.chats.read(reader);
      const activeChat = visibleSessionRef.activeChat.read(reader);
      if (activeChat && !chats.some((c) => this._uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
        const visibleChatTabs = visibleSessionRef.visibleChatTabs.read(reader);
        const fallback = visibleChatTabs[visibleChatTabs.length - 1] ?? session.mainChat.read(reader);
        if (fallback) {
          visibleSessionRef.setActiveChat(fallback);
        }
      }
    }));
    this._wrappers.set(session.sessionId, visibleSession);
    return visibleSession;
  }
};
VisibleSessions = __decorateClass([
  __decorateParam(3, IUriIdentityService)
], VisibleSessions);
export {
  VisibleSession,
  VisibleSessions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHNlc3Npb25zXFxicm93c2VyXFx2aXNpYmxlU2Vzc2lvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBhdXRvcnVuLCBkZXJpdmVkLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIENoYXRPcmlnaW5LaW5kLCBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbi5qcyc7XG5cbi8qKlxuICogV3JhcHMgYW4ge0BsaW5rIElTZXNzaW9ufSB3aXRoIGFuIGFjdGl2ZSBjaGF0IG9ic2VydmFibGUgdG8gZm9ybSBhblxuICoge0BsaW5rIElBY3RpdmVTZXNzaW9ufS4gRGVsZWdhdGVzIGFsbCB7QGxpbmsgSVNlc3Npb259IHByb3BlcnR5IGFjY2Vzc2VzXG4gKiB0byB0aGUgd3JhcHBlZCBzZXNzaW9uIHNvIHRoZSBhY3RpdmUgc2Vzc2lvbiBhbHdheXMgcmVmbGVjdHMgdGhlIGxhdGVzdFxuICogc2Vzc2lvbiBzdGF0ZSB3aXRob3V0IGEgc3RhbGUgc2hhbGxvdyBjb3B5LlxuICpcbiAqIE9uZSBpbnN0YW5jZSBleGlzdHMgcGVyIHNlc3Npb24gY3VycmVudGx5IGluIHRoZSB2aXNpYmlsaXR5IG1vZGVsXG4gKiAoYWN0aXZlLCB0cmFuc2llbnQsIG9yIHN0aWNreSkuIEVhY2ggaW5zdGFuY2Ugb3ducyBpdHMgb3duIGFjdGl2ZS1jaGF0XG4gKiBvYnNlcnZhYmxlIHNvIHZpc2libGUtYnV0LW5vdC1hY3RpdmUgc2Vzc2lvbnMgcmV0YWluIHRoZWlyIHBlci1zZXNzaW9uXG4gKiBjaGF0IHNlbGVjdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIFZpc2libGVTZXNzaW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBY3RpdmVTZXNzaW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0NyZWF0ZWQ7XG5cdHJlYWRvbmx5IGlzQ3JlYXRlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RpY2t5ID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdhY3RpdmVTZXNzaW9uU3RpY2t5JywgZmFsc2UpO1xuXHRyZWFkb25seSBzdGlja3k6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5fc3RpY2t5O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNoYXQ6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXQ+O1xuXHRyZWFkb25seSBhY3RpdmVDaGF0OiBJT2JzZXJ2YWJsZTxJQ2hhdD47XG5cblx0LyoqXG5cdCAqIE1vZGVsIGFuZCBtb2RlIGFyZSBzY29wZWQgdG8gdGhlIGFjdGl2ZSBjaGF0IHNvIHRoZSBBZ2VudHMgd2luZG93IHBpY2tlcnNcblx0ICogcmVhZCBhbmQgd3JpdGUgdGhlIHNlbGVjdGlvbiBvZiB0aGUgY3VycmVudGx5IGZvY3VzZWQgY2hhdCwgbm90IHRoZVxuXHQgKiBzZXNzaW9uL2RlZmF1bHQgY2hhdC4gU2Vzc2lvbnMgd2l0aCBtdWx0aXBsZSBwZWVyIGNoYXRzIGtlZXAgYW5cblx0ICogaW5kZXBlbmRlbnQgbW9kZWwvYWdlbnQgcGVyIGNoYXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDaGF0TW9kZWxJZDogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ2hhdE1vZGU6IElPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBSZXNvdXJjZSBzdHJpbmdzIG9mIGNoYXRzIHRoYXQgaGF2ZSBiZWVuIGNsb3NlZCAoaGlkZGVuIGZyb20gdGhlIHRhYiBzdHJpcCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nsb3NlZENoYXRVcmlzOiBJU2V0dGFibGVPYnNlcnZhYmxlPFJlYWRvbmx5U2V0PHN0cmluZz4+O1xuXHQvKipcblx0ICogUmVzb3VyY2Ugc3RyaW5ncyBvZiBzdWJhZ2VudCAodG9vbC1vcmlnaW4pIGNoYXRzIHRoZSB1c2VyIGV4cGxpY2l0bHkgb3BlbmVkLFxuXHQgKiBzbyB0aGV5IHN1cmZhY2UgYXMgdGFicy4gU3ViYWdlbnRzIGFyZSBoaWRkZW4gZnJvbSB0aGUgdGFiIHN0cmlwIGJ5IGRlZmF1bHQ7XG5cdCAqIHRoaXMgc2V0IGlzIG5vdCBwZXJzaXN0ZWQsIHNvIHRoZXkgcmV2ZXJ0IHRvIGhpZGRlbiBvbiByZWxvYWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG93blN1YmFnZW50VXJpczogSVNldHRhYmxlT2JzZXJ2YWJsZTxSZWFkb25seVNldDxzdHJpbmc+Pjtcblx0LyoqIEFwcGVuZC1vbmx5IGxpc3QgdHJhY2tpbmcgY2xvc2Ugb3JkZXI7IGxhc3QgZWxlbWVudCBpcyB0aGUgbW9zdCByZWNlbnRseSBjbG9zZWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nsb3NlZENoYXRPcmRlcjogSUNoYXRbXSA9IFtdO1xuXHRyZWFkb25seSBvcGVuQ2hhdHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+O1xuXHRyZWFkb25seSBjbG9zZWRDaGF0czogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRbXT47XG5cdHJlYWRvbmx5IHZpc2libGVDaGF0VGFiczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRbXT47XG5cdHJlYWRvbmx5IHNob3VsZFNob3dDaGF0VGFiczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbjogSVNlc3Npb24sXG5cdFx0aW5pdGlhbENoYXQ6IElDaGF0LFxuXHRcdGluaXRpYWxDbG9zZWRDaGF0VXJpcz86IEl0ZXJhYmxlPHN0cmluZz4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fYWN0aXZlQ2hhdCA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4oYGFjdGl2ZUNoYXQtJHtfc2Vzc2lvbi5zZXNzaW9uSWR9YCwgaW5pdGlhbENoYXQpO1xuXHRcdHRoaXMuYWN0aXZlQ2hhdCA9IHRoaXMuX2FjdGl2ZUNoYXQ7XG5cblx0XHR0aGlzLl9hY3RpdmVDaGF0TW9kZWxJZCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuX2FjdGl2ZUNoYXQucmVhZChyZWFkZXIpLm1vZGVsSWQucmVhZChyZWFkZXIpKTtcblx0XHR0aGlzLl9hY3RpdmVDaGF0TW9kZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuX2FjdGl2ZUNoYXQucmVhZChyZWFkZXIpLm1vZGUucmVhZChyZWFkZXIpKTtcblxuXHRcdC8vIFNlZWQgdGhlIGNsb3NlZCBzZXQgZnJvbSBwZXJzaXN0ZWQgc3RhdGUsIGJ1dCBuZXZlciBoaWRlIHRoZSBjaGF0IHRoYXRcblx0XHQvLyBpcyBiZWluZyByZXN0b3JlZCBhcyBhY3RpdmUsIG5vciB0aGUgbWFpbiBjaGF0ICh3aGljaCBjYW4gbmV2ZXIgYmVcblx0XHQvLyBjbG9zZWQgYW5kIG11c3QgYWx3YXlzIHJlbWFpbiBpbiB0aGUgdGFiIHN0cmlwKS5cblx0XHRjb25zdCBzZWVkID0gbmV3IFNldChpbml0aWFsQ2xvc2VkQ2hhdFVyaXMpO1xuXHRcdHNlZWQuZGVsZXRlKF9zZXNzaW9uLm1haW5DaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGFjdGl2ZVVyaSA9IGluaXRpYWxDaGF0Py5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmIChhY3RpdmVVcmkpIHtcblx0XHRcdHNlZWQuZGVsZXRlKGFjdGl2ZVVyaSk7XG5cdFx0fVxuXHRcdHRoaXMuX2Nsb3NlZENoYXRVcmlzID0gb2JzZXJ2YWJsZVZhbHVlPFJlYWRvbmx5U2V0PHN0cmluZz4+KCdjbG9zZWRDaGF0VXJpcycsIHNlZWQpO1xuXG5cdFx0Ly8gU3ViYWdlbnRzIGFyZSBoaWRkZW4gYnkgZGVmYXVsdDsgaWYgdGhlIHJlc3RvcmVkIGFjdGl2ZSBjaGF0IGlzIG9uZSxcblx0XHQvLyBzdXJmYWNlIGl0cyB0YWIgc28gdGhlIHNlc3Npb24gb3BlbnMgd2hlcmUgdGhlIHVzZXIgbGVmdCBvZmYuXG5cdFx0Y29uc3Qgc2hvd25TdWJhZ2VudHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRpZiAoaW5pdGlhbENoYXQ/Lm9yaWdpbj8ua2luZCA9PT0gQ2hhdE9yaWdpbktpbmQuVG9vbCkge1xuXHRcdFx0c2hvd25TdWJhZ2VudHMuYWRkKGluaXRpYWxDaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHR0aGlzLl9zaG93blN1YmFnZW50VXJpcyA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seVNldDxzdHJpbmc+Pignc2hvd25TdWJhZ2VudFVyaXMnLCBzaG93blN1YmFnZW50cyk7XG5cblx0XHR0aGlzLl9pc0NyZWF0ZWQgPSBfc2Vzc2lvbi5zdGF0dXMubWFwKHN0YXR1cyA9PiBzdGF0dXMgIT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdHRoaXMuaXNDcmVhdGVkID0gdGhpcy5faXNDcmVhdGVkO1xuXG5cdFx0dGhpcy5vcGVuQ2hhdHMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjbG9zZWQgPSB0aGlzLl9jbG9zZWRDaGF0VXJpcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjaGF0cyA9IHRoaXMuX3Nlc3Npb24uY2hhdHMucmVhZChyZWFkZXIpO1xuXHRcdFx0Ly8gSGlkZGVuIGNoYXRzIGFyZSBpbnRlcm5hbCB3b3JrZXJzIHRoYXQgbXVzdCBuZXZlciBiZSBzdXJmYWNlZCBpbiB0aGVcblx0XHRcdC8vIGNvbnZlcnNhdGlvbiB0YWIgc3RyaXA7IGNsb3NlZCBjaGF0cyBhcmUgdXNlci1kaXNtaXNzZWQuXG5cdFx0XHRyZXR1cm4gY2hhdHMuZmlsdGVyKGMgPT5cblx0XHRcdFx0Yy5pbnRlcmFjdGl2aXR5LnJlYWQocmVhZGVyKSAhPT0gQ2hhdEludGVyYWN0aXZpdHkuSGlkZGVuICYmXG5cdFx0XHRcdCFjbG9zZWQuaGFzKGMucmVzb3VyY2UudG9TdHJpbmcoKSkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuY2xvc2VkQ2hhdHMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjbG9zZWQgPSB0aGlzLl9jbG9zZWRDaGF0VXJpcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoY2xvc2VkLnNpemUgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb24uY2hhdHMucmVhZChyZWFkZXIpLmZpbHRlcihjID0+IGNsb3NlZC5oYXMoYy5yZXNvdXJjZS50b1N0cmluZygpKSk7XG5cdFx0fSk7XG5cdFx0Ly8gVGFiIHN0cmlwIGNvbnRlbnRzOiB0aGUgb3BlbiBjaGF0cyBpbiB0aGUgcHJvdmlkZXIncyBvcmRlciwgd2l0aCBzdWJhZ2VudFxuXHRcdC8vICh0b29sLW9yaWdpbikgY2hhdHMgaGlkZGVuIGJ5IGRlZmF1bHQuIEEgc3ViYWdlbnQgc3VyZmFjZXMgYXMgYSB0YWIgb25seVxuXHRcdC8vIG9uY2UgZXhwbGljaXRseSBvcGVuZWQgKGUuZy4gZnJvbSB0aGUgQ29udmVyc2F0aW9ucyBtZW51KSwgdHJhY2tlZCBpblxuXHRcdC8vIGBfc2hvd25TdWJhZ2VudFVyaXNgLiBIaWRkZW4gYW5kIGNsb3NlZCBjaGF0cyBhcmUgZXhjbHVkZWQgYnkgYG9wZW5DaGF0c2AuXG5cdFx0dGhpcy52aXNpYmxlQ2hhdFRhYnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzaG93blN1YmFnZW50cyA9IHRoaXMuX3Nob3duU3ViYWdlbnRVcmlzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiB0aGlzLm9wZW5DaGF0cy5yZWFkKHJlYWRlcikuZmlsdGVyKGMgPT5cblx0XHRcdFx0Yy5vcmlnaW4/LmtpbmQgIT09IENoYXRPcmlnaW5LaW5kLlRvb2wgfHxcblx0XHRcdFx0c2hvd25TdWJhZ2VudHMuaGFzKGMucmVzb3VyY2UudG9TdHJpbmcoKSkpO1xuXHRcdH0pO1xuXHRcdC8vIFNob3duIG9ubHkgd2hlbiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIGNoYXQgYWN0dWFsbHkgc2hvd2luZyBhcyBhIHRhYi5cblx0XHQvLyBBIHNpbmdsZSB2aXNpYmxlIHRhYiAoZXZlbiBpZiBvdGhlciBjaGF0cyBhcmUgY2xvc2VkLCBvciBpdHMgdGl0bGVcblx0XHQvLyBkaXZlcmdlZCBmcm9tIHRoZSBzZXNzaW9uIHRpdGxlLCBvciBzdWJhZ2VudHMgZXhpc3QpIGFsd2F5cyBoaWRlcyB0aGVcblx0XHQvLyBzdHJpcDsgdGhlIENvbnZlcnNhdGlvbnMgbWVudSBzdXJmYWNlcyBpbiB0aGUgc2Vzc2lvbiBoZWFkZXIgaW5zdGVhZC5cblx0XHR0aGlzLnNob3VsZFNob3dDaGF0VGFicyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiB0aGlzLnZpc2libGVDaGF0VGFicy5yZWFkKHJlYWRlcikubGVuZ3RoID4gMTtcblx0XHR9KTtcblx0fVxuXG5cdHNldEFjdGl2ZUNoYXQoY2hhdDogSUNoYXQpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVDaGF0LnNldChjaGF0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Y2xvc2VDaGF0KGNoYXQ6IElDaGF0KTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHQvLyBUaGUgbWFpbiBjaGF0IHJlcHJlc2VudHMgdGhlIHNlc3Npb24gaXRzZWxmIGFuZCBpcyBuZXZlciBjbG9zZWQuXG5cdFx0aWYgKGNoYXRVcmkgPT09IHRoaXMuX3Nlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBDbG9zaW5nIGEgc3ViYWdlbnQgKHRvb2wtb3JpZ2luKSB0YWIganVzdCBoaWRlcyBpdCBhZ2FpbjsgaXQgc3RheXNcblx0XHQvLyByZWFjaGFibGUgZnJvbSB0aGUgQ29udmVyc2F0aW9ucyBtZW51IGFuZCBpcyBub3QgYWRkZWQgdG8gdGhlXG5cdFx0Ly8gcmVvcGVuYWJsZSBjbG9zZWQgc2V0LlxuXHRcdGlmIChjaGF0Lm9yaWdpbj8ua2luZCA9PT0gQ2hhdE9yaWdpbktpbmQuVG9vbCkge1xuXHRcdFx0Y29uc3Qgc2hvd24gPSB0aGlzLl9zaG93blN1YmFnZW50VXJpcy5nZXQoKTtcblx0XHRcdGlmICghc2hvd24uaGFzKGNoYXRVcmkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5leHRTaG93biA9IG5ldyBTZXQoc2hvd24pO1xuXHRcdFx0bmV4dFNob3duLmRlbGV0ZShjaGF0VXJpKTtcblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0dGhpcy5fc2hvd25TdWJhZ2VudFVyaXMuc2V0KG5leHRTaG93biwgdHgpO1xuXHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlQ2hhdC5nZXQoKS5yZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0VXJpKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlQ2hhdC5zZXQodGhpcy5fZGVmYXVsdEFjdGl2ZUNoYXQodGhpcy5fY2xvc2VkQ2hhdFVyaXMuZ2V0KCksIG5leHRTaG93biksIHR4KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNsb3NlZCA9IHRoaXMuX2Nsb3NlZENoYXRVcmlzLmdldCgpO1xuXHRcdGlmIChjbG9zZWQuaGFzKGNoYXRVcmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5leHQgPSBuZXcgU2V0KGNsb3NlZCk7XG5cdFx0bmV4dC5hZGQoY2hhdFVyaSk7XG5cdFx0dGhpcy5fY2xvc2VkQ2hhdE9yZGVyLnB1c2goY2hhdCk7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fY2xvc2VkQ2hhdFVyaXMuc2V0KG5leHQsIHR4KTtcblx0XHRcdC8vIElmIHRoZSBjbG9zZWQgY2hhdCB3YXMgYWN0aXZlLCBmYWxsIGJhY2sgdG8gYW5vdGhlciB2aXNpYmxlIHRhYi5cblx0XHRcdGlmICh0aGlzLl9hY3RpdmVDaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGNoYXRVcmkpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlQ2hhdC5zZXQodGhpcy5fZGVmYXVsdEFjdGl2ZUNoYXQobmV4dCwgdGhpcy5fc2hvd25TdWJhZ2VudFVyaXMuZ2V0KCkpLCB0eCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvcGVuQ2hhdChjaGF0OiBJQ2hhdCk6IHZvaWQge1xuXHRcdC8vIE9wZW5pbmcgYSBzdWJhZ2VudCAodG9vbC1vcmlnaW4pIGNoYXQgc3VyZmFjZXMgaXQgYXMgYSB0YWIuXG5cdFx0aWYgKGNoYXQub3JpZ2luPy5raW5kID09PSBDaGF0T3JpZ2luS2luZC5Ub29sKSB7XG5cdFx0XHRjb25zdCBzaG93biA9IHRoaXMuX3Nob3duU3ViYWdlbnRVcmlzLmdldCgpO1xuXHRcdFx0aWYgKHNob3duLmhhcyhjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5leHQgPSBuZXcgU2V0KHNob3duKTtcblx0XHRcdG5leHQuYWRkKGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR0aGlzLl9zaG93blN1YmFnZW50VXJpcy5zZXQobmV4dCwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2xvc2VkID0gdGhpcy5fY2xvc2VkQ2hhdFVyaXMuZ2V0KCk7XG5cdFx0aWYgKCFjbG9zZWQuaGFzKGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dCA9IG5ldyBTZXQoY2xvc2VkKTtcblx0XHRuZXh0LmRlbGV0ZShjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdHRoaXMuX2Nsb3NlZENoYXRVcmlzLnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGlkeCA9IHRoaXMuX2Nsb3NlZENoYXRPcmRlci5maW5kTGFzdEluZGV4KGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHR0aGlzLl9jbG9zZWRDaGF0T3JkZXIuc3BsaWNlKGlkeCwgMSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBpY2sgdGhlIGFjdGl2ZSBjaGF0IHRvIGZhbGwgYmFjayB0byB3aGVuIHRoZSBjdXJyZW50IG9uZSBpcyBjbG9zZWQ6IHRoZVxuXHQgKiBsYXN0IGNoYXQgdGhhdCB3b3VsZCBhcHBlYXIgYXMgYSB2aXNpYmxlIHRhYiBnaXZlbiB0aGUgY2xvc2VkIGFuZCBzaG93bi1cblx0ICogc3ViYWdlbnQgc2V0cywgb3IgdGhlIG1haW4gY2hhdC5cblx0ICovXG5cdHByaXZhdGUgX2RlZmF1bHRBY3RpdmVDaGF0KGNsb3NlZDogUmVhZG9ubHlTZXQ8c3RyaW5nPiwgc2hvd25TdWJhZ2VudHM6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiBJQ2hhdCB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IHRoaXMuX3Nlc3Npb24uY2hhdHMuZ2V0KCkuZmlsdGVyKGMgPT5cblx0XHRcdGMuaW50ZXJhY3Rpdml0eS5nZXQoKSAhPT0gQ2hhdEludGVyYWN0aXZpdHkuSGlkZGVuICYmXG5cdFx0XHQhY2xvc2VkLmhhcyhjLnJlc291cmNlLnRvU3RyaW5nKCkpICYmXG5cdFx0XHQoYy5vcmlnaW4/LmtpbmQgIT09IENoYXRPcmlnaW5LaW5kLlRvb2wgfHwgc2hvd25TdWJhZ2VudHMuaGFzKGMucmVzb3VyY2UudG9TdHJpbmcoKSkpKTtcblx0XHRyZXR1cm4gY2FuZGlkYXRlc1tjYW5kaWRhdGVzLmxlbmd0aCAtIDFdID8/IHRoaXMuX3Nlc3Npb24ubWFpbkNoYXQuZ2V0KCk7XG5cdH1cblxuXHRnZXQgbGFzdENsb3NlZENoYXQoKTogSUNoYXQgfCB1bmRlZmluZWQge1xuXHRcdC8vIEZpbHRlciBvdXQgc3RhbGUgZW50cmllcyB3aG9zZSBjaGF0IGhhcyBzaW5jZSBiZWVuIGRlbGV0ZWQgZnJvbSB0aGUgc2Vzc2lvbi5cblx0XHRjb25zdCBjdXJyZW50Q2hhdHMgPSB0aGlzLl9zZXNzaW9uLmNoYXRzLmdldCgpO1xuXHRcdGNvbnN0IGNsb3NlZCA9IHRoaXMuX2Nsb3NlZENoYXRVcmlzLmdldCgpO1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9jbG9zZWRDaGF0T3JkZXIubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IGNoYXQgPSB0aGlzLl9jbG9zZWRDaGF0T3JkZXJbaV07XG5cdFx0XHRjb25zdCB1cmkgPSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAoY2xvc2VkLmhhcyh1cmkpICYmIGN1cnJlbnRDaGF0cy5zb21lKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpID09PSB1cmkpKSB7XG5cdFx0XHRcdHJldHVybiBjaGF0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c2V0U3RpY2t5KHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RpY2t5LnNldCh2YWx1ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKiBSZWdpc3RlciBhIGRpc3Bvc2FibGUgdGhhdCBsaXZlcyBhcyBsb25nIGFzIHRoaXMgd3JhcHBlci4gKi9cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRnZXQgc2Vzc2lvbklkKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5zZXNzaW9uSWQ7IH1cblx0Z2V0IHJlc291cmNlKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5yZXNvdXJjZTsgfVxuXHRnZXQgcHJvdmlkZXJJZCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ucHJvdmlkZXJJZDsgfVxuXHRnZXQgc2Vzc2lvblR5cGUoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLnNlc3Npb25UeXBlOyB9XG5cdGdldCBpY29uKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5pY29uOyB9XG5cdGdldCBjcmVhdGVkQXQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmNyZWF0ZWRBdDsgfVxuXHRnZXQgd29ya3NwYWNlKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi53b3Jrc3BhY2U7IH1cblx0Z2V0IGhhc0dpdFJlcG9zaXRvcnkoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmhhc0dpdFJlcG9zaXRvcnk7IH1cblx0Z2V0IHdvcmt0cmVlUGVuZGluZygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ud29ya3RyZWVQZW5kaW5nOyB9XG5cdGdldCBpc1F1aWNrQ2hhdCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uaXNRdWlja0NoYXQ7IH1cblx0Z2V0IGlzQXV0b21hdGlvbigpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uaXNBdXRvbWF0aW9uOyB9XG5cdGdldCB0aXRsZSgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24udGl0bGU7IH1cblx0Z2V0IHVwZGF0ZWRBdCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24udXBkYXRlZEF0OyB9XG5cdGdldCBzdGF0dXMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLnN0YXR1czsgfVxuXHRnZXQgY29tcGxldGVkU3RhdGVJY29uKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5jb21wbGV0ZWRTdGF0ZUljb247IH1cblx0Z2V0IGNoYW5nZXNTdW1tYXJ5KCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5jaGFuZ2VzU3VtbWFyeTsgfVxuXHRnZXQgY2hhbmdlc2V0cygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uY2hhbmdlc2V0czsgfVxuXHRnZXQgY2hhbmdlcygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uY2hhbmdlczsgfVxuXHRnZXQgZXh0ZXJuYWxDaGFuZ2VzKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5leHRlcm5hbENoYW5nZXM7IH1cblx0Z2V0IG1vZGVsSWQoKSB7IHJldHVybiB0aGlzLl9hY3RpdmVDaGF0TW9kZWxJZDsgfVxuXHRnZXQgbW9kZSgpIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZUNoYXRNb2RlOyB9XG5cdGdldCBsb2FkaW5nKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5sb2FkaW5nOyB9XG5cdGdldCBpc0FyY2hpdmVkKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5pc0FyY2hpdmVkOyB9XG5cdGdldCBpc1JlYWQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmlzUmVhZDsgfVxuXHRnZXQgZGVzY3JpcHRpb24oKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmRlc2NyaXB0aW9uOyB9XG5cdGdldCBsYXN0VHVybkVuZCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ubGFzdFR1cm5FbmQ7IH1cblx0Z2V0IGNoYXRzKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5jaGF0czsgfVxuXHRnZXQgbWFpbkNoYXQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLm1haW5DaGF0OyB9XG5cdGdldCBjYXBhYmlsaXRpZXMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmNhcGFiaWxpdGllczsgfVxuXG5cdC8qKiBUaGUgd3JhcHBlZCBzZXNzaW9uLCB3aGljaCBvdXRsaXZlcyB0aGlzIHdyYXBwZXIuICovXG5cdGdldCBzZXNzaW9uKCk6IElTZXNzaW9uIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb247IH1cbn1cblxuLyoqXG4gKiBMaWdodHdlaWdodCB7QGxpbmsgSVNlc3Npb259IGFkYXB0ZXIgdGhhdCBkZWxlZ2F0ZXMgZXZlcnkgcHJvcGVydHkgdG8gYVxuICogd3JhcHBlZCBzZXNzaW9uIGJ1dCBleHBvc2VzIGEgZGlmZmVyZW50IHtAbGluayBJU2Vzc2lvbi5yZXNvdXJjZX0gdmFsdWUuXG4gKlxuICogVXNlZCBhcyBhIHRyYW5zaWVudCBzZXNzaW9uIGluc3RhbmNlIGR1cmluZyB0aGUgY3JlYXRlLWNoYXQgLyBzZW5kLXJlcXVlc3RcbiAqIHRyYW5zaXRpb24sIHNvIHRoZSB2aXNpYmlsaXR5IG1vZGVsIGNhbiByZWZsZWN0IHRoZSBuZXcgY2hhdCByZXNvdXJjZSBvblxuICogdGhlIHNhbWUgZ3JpZCBzbG90IGJlZm9yZSB0aGUgcHJvdmlkZXIgaGFzIHByb2R1Y2VkIGEgZmluYWwgc2Vzc2lvbi5cbiAqL1xuY2xhc3MgUmVzb3VyY2VPdmVycmlkZVNlc3Npb24gaW1wbGVtZW50cyBJU2Vzc2lvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbjogSVNlc3Npb24sXG5cdFx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSSxcblx0KSB7IH1cblxuXHRnZXQgc2Vzc2lvbklkKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5zZXNzaW9uSWQ7IH1cblx0Z2V0IHByb3ZpZGVySWQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLnByb3ZpZGVySWQ7IH1cblx0Z2V0IHNlc3Npb25UeXBlKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5zZXNzaW9uVHlwZTsgfVxuXHRnZXQgaWNvbigpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uaWNvbjsgfVxuXHRnZXQgY3JlYXRlZEF0KCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5jcmVhdGVkQXQ7IH1cblx0Z2V0IHdvcmtzcGFjZSgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ud29ya3NwYWNlOyB9XG5cdGdldCBoYXNHaXRSZXBvc2l0b3J5KCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5oYXNHaXRSZXBvc2l0b3J5OyB9XG5cdGdldCB3b3JrdHJlZVBlbmRpbmcoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLndvcmt0cmVlUGVuZGluZzsgfVxuXHRnZXQgaXNRdWlja0NoYXQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmlzUXVpY2tDaGF0OyB9XG5cdGdldCBpc0F1dG9tYXRpb24oKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmlzQXV0b21hdGlvbjsgfVxuXHRnZXQgdGl0bGUoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLnRpdGxlOyB9XG5cdGdldCB1cGRhdGVkQXQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLnVwZGF0ZWRBdDsgfVxuXHRnZXQgc3RhdHVzKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5zdGF0dXM7IH1cblx0Z2V0IGNvbXBsZXRlZFN0YXRlSWNvbigpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uY29tcGxldGVkU3RhdGVJY29uOyB9XG5cdGdldCBjaGFuZ2VzU3VtbWFyeSgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uY2hhbmdlc1N1bW1hcnk7IH1cblx0Z2V0IGNoYW5nZXMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmNoYW5nZXM7IH1cblx0Z2V0IGNoYW5nZXNldHMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmNoYW5nZXNldHM7IH1cblx0Z2V0IGV4dGVybmFsQ2hhbmdlcygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uZXh0ZXJuYWxDaGFuZ2VzOyB9XG5cdGdldCBtb2RlbElkKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5tb2RlbElkOyB9XG5cdGdldCBtb2RlKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5tb2RlOyB9XG5cdGdldCBsb2FkaW5nKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5sb2FkaW5nOyB9XG5cdGdldCBpc0FyY2hpdmVkKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5pc0FyY2hpdmVkOyB9XG5cdGdldCBpc1JlYWQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmlzUmVhZDsgfVxuXHRnZXQgZGVzY3JpcHRpb24oKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmRlc2NyaXB0aW9uOyB9XG5cdGdldCBsYXN0VHVybkVuZCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ubGFzdFR1cm5FbmQ7IH1cblx0Z2V0IGNoYXRzKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5jaGF0czsgfVxuXHRnZXQgbWFpbkNoYXQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLm1haW5DaGF0OyB9XG5cdGdldCBjYXBhYmlsaXRpZXMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmNhcGFiaWxpdGllczsgfVxufVxuXG4vKipcbiAqIFNlbnRpbmVsIHVzZWQgdG8gZGlzdGluZ3Vpc2ggXCJubyBzbG90IHRyYWNrZWRcIiBmcm9tIHRoZSBlbXB0eSBzbG90XG4gKiAod2hpY2ggaXMgaXRzZWxmIHJlcHJlc2VudGVkIGJ5IGB1bmRlZmluZWRgIGluIHRoZSB2aXNpYmxlIGxpc3QpLlxuICovXG5jb25zdCBOT19SRUNFTlQgPSBTeW1ib2woJ25vLXJlY2VudCcpO1xuXG4vKipcbiAqIEVuY2Fwc3VsYXRlcyB0aGUgdmlzaWJpbGl0eSBtb2RlbCB1c2VkIGJ5IHRoZVxuICoge0BsaW5rIFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2V9LlxuICpcbiAqIFRoZSBtb2RlbCB0cmFja3M6XG4gKiAtIFRoZSBjdXJyZW50bHkgYWN0aXZlIHNlc3Npb24uXG4gKiAtIEFuIG9yZGVyZWQgbGlzdCBvZiBzbG90cyB0byBkaXNwbGF5IGluIHRoZSBzZXNzaW9ucyBwYXJ0J3MgZ3JpZC4gQSBzbG90XG4gKiAgIGlzIGVpdGhlciBhIHNlc3Npb24gaWQgKHN0cmluZykgb3IgYHVuZGVmaW5lZGAgKHRoZSBcImVtcHR5XCIgLyBuZXctc2Vzc2lvblxuICogICBwbGFjZWhvbGRlcikuIEF0IG1vc3Qgb25lIHNsb3QgbWF5IGJlIGB1bmRlZmluZWRgIGF0IGEgdGltZS5cbiAqIC0gQSBcInN0aWNreVwiIHNldDogc2Vzc2lvbnMgdGhlIHVzZXIgaGFzIGV4cGxpY2l0bHkgcGlubmVkLiBOb24tc3RpY2t5XG4gKiAgIHNlc3Npb25zIGFsc28gbGl2ZSBpbiB0aGUgZ3JpZCBidXQgZ2V0IHJlcGxhY2VkIHdoZW4gbmV3IHNlc3Npb25zIG9wZW4uXG4gKiAgIFRoZSBlbXB0eSBzbG90IGlzIGFsd2F5cyBub24tc3RpY2t5LlxuICpcbiAqIEVhY2ggdHJhY2tlZCBzZXNzaW9uIGhhcyBhIHNpbmdsZSB7QGxpbmsgVmlzaWJsZVNlc3Npb259IHdyYXBwZXIgb3duZWQgYnlcbiAqIHRoaXMgY2xhc3MuIFdyYXBwZXJzIGFyZSBkaXNwb3NlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlaXIgc2Vzc2lvbiBsZWF2ZXNcbiAqIHRoZSB2aXNpYmlsaXR5IG1vZGVsLlxuICovXG5leHBvcnQgY2xhc3MgVmlzaWJsZVNlc3Npb25zIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlU2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+ID0gdGhpcy5fYWN0aXZlU2Vzc2lvbjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgbW9zdCByZWNlbnQgYWN0aXZlLXNlc3Npb24gY2hhbmdlIGFza2VkIHRvIHByZXNlcnZlIGtleWJvYXJkXG5cdCAqIGZvY3VzIChpLmUuIHNob3cgdGhlIHNlc3Npb24gd2l0aG91dCBtb3ZpbmcgZm9jdXMgaW50byBpdCkuIEFsd2F5cyBzZXQgaW5cblx0ICogdGhlICoqc2FtZSB0cmFuc2FjdGlvbioqIGFzIHtAbGluayBfYWN0aXZlU2Vzc2lvbn0gdmlhXG5cdCAqIHtAbGluayBfc2V0QWN0aXZlU2Vzc2lvbn0gc28gdGhlIHBhaXIgY2FuIG5ldmVyIGdvIHN0YWxlLCBhbmQgcmVhZFxuXHQgKiByZWFjdGl2ZWx5IGJ5IHRoZSBjb25zdW1lciB0aGF0IGRyaXZlcyBmb2N1cy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVByZXNlcnZlRm9jdXMgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSBhY3RpdmVQcmVzZXJ2ZUZvY3VzOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX2FjdGl2ZVByZXNlcnZlRm9jdXM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJsZVNlc3Npb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT4odGhpcywgW3VuZGVmaW5lZF0pO1xuXHRyZWFkb25seSB2aXNpYmxlU2Vzc2lvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT4gPSB0aGlzLl92aXNpYmxlU2Vzc2lvbnM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd3JhcHBlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIFZpc2libGVTZXNzaW9uPigpKTtcblx0LyoqXG5cdCAqIE9yZGVyZWQgc2xvdCBpZHMgaW4gdGhlIGdyaWQgKGxlZnQtdG8tcmlnaHQpLiBFYWNoIGVudHJ5IGlzIGVpdGhlciBhXG5cdCAqIHNlc3Npb24gaWQgb3IgYHVuZGVmaW5lZGAgKHRoZSBlbXB0eSBzbG90KS4gVGhlIGludmFyaWFudCBpcyB0aGF0IGF0XG5cdCAqIG1vc3Qgb25lIGVudHJ5IGlzIGB1bmRlZmluZWRgIGF0IGFueSB0aW1lLlxuXHQgKi9cblx0cHJpdmF0ZSBfdmlzaWJsZUxpc3Q6IChzdHJpbmcgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0LyoqIFN1YnNldCBvZiB7QGxpbmsgX3Zpc2libGVMaXN0fSB0aGUgdXNlciBoYXMgbWFya2VkIHN0aWNreS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3RpY2t5SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKlxuXHQgKiBTbG90IGlkIG9mIHRoZSBtb3N0IHJlY2VudGx5IG9wZW5lZCAob3IgdG9nZ2xlZC10by1ub24tc3RpY2t5KSBlbnRyeSBpblxuXHQgKiB0aGUgZ3JpZC4gVXNlZCB0byBjaG9vc2Ugd2hpY2ggbm9uLXN0aWNreSBzbG90IHRvIHJlcGxhY2Ugd2hlbiBvcGVuaW5nIGFcblx0ICogbmV3IHNlc3Npb24gd2hpbGUgdGhlIGFjdGl2ZSBvbmUgaXMgc3RpY2t5LlxuXHQgKiAtIGBOT19SRUNFTlRgIG1lYW5zIG5vbmUgaXMgdHJhY2tlZC5cblx0ICogLSBgdW5kZWZpbmVkYCByZWZlcnMgdG8gdGhlIGVtcHR5IHNsb3QuXG5cdCAqIC0gQSBzdHJpbmcgcmVmZXJzIHRvIHRoYXQgc2Vzc2lvbiBpZC5cblx0ICovXG5cdHByaXZhdGUgX21vc3RSZWNlbnROb25TdGlja3lTbG90OiBzdHJpbmcgfCB1bmRlZmluZWQgfCB0eXBlb2YgTk9fUkVDRU5UID0gTk9fUkVDRU5UO1xuXG5cdC8qKlxuXHQgKiBAcGFyYW0gX29uU2xvdFJlcGxhY2VkIFJlcG9ydHMgYSBzZXNzaW9uIHRoYXQgbGVmdCB0aGUgZ3JpZCBiZWNhdXNlIGFcblx0ICogbmV3bHkgb3BlbmVkIHNsb3QgdG9vayBpdHMgcGxhY2UsIHdpdGggdGhlIHNsb3Qgc3RhdGUgaXQgbG9zdC4gRXhwbGljaXRcblx0ICogcmVtb3ZhbHMgKHtAbGluayByZW1vdmVNYW55fSkgYW5kIGdyaWQgcmVzdG9yZXMgYXJlIG5vdCByZXBvcnRlZC5cblx0ICovXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVJbml0aWFsQ2hhdDogKHNlc3Npb246IElTZXNzaW9uKSA9PiBJQ2hhdCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlSW5pdGlhbENsb3NlZENoYXRzOiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IEl0ZXJhYmxlPHN0cmluZz4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25TbG90UmVwbGFjZWQ6IChyZXBsYWNlZDogSVNlc3Npb24sIGluZGV4OiBudW1iZXIsIHN0aWNreTogYm9vbGVhbiwgcmVwbGFjZWRCeVNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB2b2lkLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIGFjdGl2ZSBzZXNzaW9uIHRvZ2V0aGVyIHdpdGggaXRzIHByZXNlcnZlLWZvY3VzIGludGVudCBpbiBhXG5cdCAqIHNpbmdsZSB0cmFuc2FjdGlvbi4gUm91dGluZyBldmVyeSBhY3RpdmUtc2Vzc2lvbiBjaGFuZ2UgdGhyb3VnaCBoZXJlXG5cdCAqIGd1YXJhbnRlZXMgdGhlIHR3byBvYnNlcnZhYmxlcyBhcmUgYWx3YXlzIGNvbnNpc3RlbnQgYW5kIHRoYXQgdGhlIGludGVudFxuXHQgKiBuZXZlciBnb2VzIHN0YWxlIChjYWxsZXJzIHRoYXQgZG8gbm90IHByZXNlcnZlIGZvY3VzIHBhc3MgYGZhbHNlYCkuXG5cdCAqL1xuXHRwcml2YXRlIF9zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuLCB0c3g6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVNlc3Npb24uc2V0KHNlc3Npb24sIHRzeCk7XG5cdFx0dGhpcy5fYWN0aXZlUHJlc2VydmVGb2N1cy5zZXQocHJlc2VydmVGb2N1cywgdHN4KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIGFjdGl2ZSBzZXNzaW9uLCB1cGRhdGluZyB0aGUgdmlzaWJpbGl0eSBtb2RlbCBhY2NvcmRpbmdseS5cblx0ICpcblx0ICogLSBQYXNzaW5nIGB1bmRlZmluZWRgIHBsYWNlcyAob3Iga2VlcHMpIHRoZSBzaW5nbGUgZW1wdHkgc2xvdCBpbiB0aGVcblx0ICogICBncmlkIGFuZCBtYWtlcyBpdCBhY3RpdmUuIFRoZSBlbXB0eSBzbG90IGlzIGFsd2F5cyBub24tc3RpY2t5LlxuXHQgKiAtIElmIHRoZSBzZXNzaW9uIGlzIGFscmVhZHkgaW4gdGhlIGdyaWQsIGl0cyBzbG90IGlzIHByZXNlcnZlZCBhbmQgb25seVxuXHQgKiAgIHRoZSBhY3RpdmUgb2JzZXJ2YWJsZSBpcyB1cGRhdGVkLlxuXHQgKiAtIE90aGVyd2lzZSB0aGUgc2Vzc2lvbiBpcyBwbGFjZWQgYXMgbm9uLXN0aWNreTpcblx0ICogICAtIElmIHRoZSBhY3RpdmUgc2xvdCBpcyBub24tc3RpY2t5LCB0aGUgbmV3IG9uZSByZXBsYWNlcyBpdCBpblxuXHQgKiAgICAgcGxhY2UuXG5cdCAqICAgLSBFbHNlIGlmIGEgbm9uLXN0aWNreSBzbG90IGV4aXN0cywgdGhlIG1vc3QtcmVjZW50bHkgb3BlbmVkXG5cdCAqICAgICBub24tc3RpY2t5IGlzIHJlcGxhY2VkLlxuXHQgKiAgIC0gRWxzZSB0aGUgc2Vzc2lvbiBpcyBhcHBlbmRlZCBhdCB0aGUgZW5kIG9mIHRoZSBncmlkLlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRoZSB3cmFwcGVyIGZvciB0aGUgYWN0aXZlIHNlc3Npb24sIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhlXG5cdCAqIGFjdGl2ZSBzbG90IGlzIHRoZSBlbXB0eSBzbG90LlxuXHQgKi9cblx0c2V0QWN0aXZlKHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuID0gZmFsc2UpOiBWaXNpYmxlU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGFyZ2V0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHNlc3Npb24/LnNlc3Npb25JZDtcblx0XHRjb25zdCB0YXJnZXRIYXNWaXNpYmxlU2xvdCA9IHRoaXMuX3Zpc2libGVMaXN0LmluY2x1ZGVzKHRhcmdldElkKTtcblxuXHRcdGlmICghdGFyZ2V0SGFzVmlzaWJsZVNsb3QpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNsb3QgPSB0aGlzLl9jdXJyZW50QWN0aXZlU2xvdCgpO1xuXHRcdFx0Y29uc3QgYWN0aXZlSXNOb25TdGlja3kgPSBhY3RpdmVTbG90ICE9PSBOT19SRUNFTlQgJiYgIXRoaXMuX2lzU3RpY2t5U2xvdChhY3RpdmVTbG90KTtcblxuXHRcdFx0bGV0IHJlcGxhY2VTbG90OiBzdHJpbmcgfCB1bmRlZmluZWQgfCB0eXBlb2YgTk9fUkVDRU5UO1xuXHRcdFx0aWYgKGFjdGl2ZUlzTm9uU3RpY2t5KSB7XG5cdFx0XHRcdHJlcGxhY2VTbG90ID0gYWN0aXZlU2xvdDtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgIT09IE5PX1JFQ0VOVFxuXHRcdFx0XHQmJiB0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyh0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdClcblx0XHRcdFx0JiYgIXRoaXMuX2lzU3RpY2t5U2xvdCh0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdCkpIHtcblx0XHRcdFx0cmVwbGFjZVNsb3QgPSB0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlcGxhY2VTbG90ID0gdGhpcy5fZmluZExhc3ROb25TdGlja3koKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlcGxhY2VTbG90ICE9PSBOT19SRUNFTlQpIHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fdmlzaWJsZUxpc3QuaW5kZXhPZihyZXBsYWNlU2xvdCk7XG5cdFx0XHRcdHRoaXMuX3Zpc2libGVMaXN0LnNwbGljZShpZHgsIDEsIHRhcmdldElkKTtcblx0XHRcdFx0aWYgKHJlcGxhY2VTbG90ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCByZXBsYWNlZCA9IHRoaXMuX3dyYXBwZXJzLmdldChyZXBsYWNlU2xvdCk/LnNlc3Npb247XG5cdFx0XHRcdFx0Y29uc3Qgc3RpY2t5ID0gdGhpcy5fc3RpY2t5SWRzLmhhcyhyZXBsYWNlU2xvdCk7XG5cdFx0XHRcdFx0dGhpcy5fd3JhcHBlcnMuZGVsZXRlQW5kRGlzcG9zZShyZXBsYWNlU2xvdCk7XG5cdFx0XHRcdFx0aWYgKHJlcGxhY2VkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vblNsb3RSZXBsYWNlZChyZXBsYWNlZCwgaWR4LCBzdGlja3ksIHRhcmdldElkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Zpc2libGVMaXN0LnB1c2godGFyZ2V0SWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgPSB0YXJnZXRJZDtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlU2Vzc2lvbiA9IHNlc3Npb24gPyB0aGlzLl9nZXRPckNyZWF0ZVZpc2libGVTZXNzaW9uKHNlc3Npb24pIDogdW5kZWZpbmVkO1xuXHRcdHRyYW5zYWN0aW9uKCh0c3gpID0+IHtcblx0XHRcdHRoaXMuX3NldEFjdGl2ZVNlc3Npb24odmlzaWJsZVNlc3Npb24sIHByZXNlcnZlRm9jdXMsIHRzeCk7XG5cdFx0XHRpZiAoIXRhcmdldEhhc1Zpc2libGVTbG90KSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2godHN4KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gdmlzaWJsZVNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogSW5zZXJ0IChvciBtb3ZlKSBhIHNsb3QgaW50byB0aGUgZ3JpZCBwb3NpdGlvbmVkIG5leHQgdG8gYSB0YXJnZXRcblx0ICogc2Vzc2lvbiB0aGF0IGlzIGFscmVhZHkgdmlzaWJsZS4gVXNlZCBieSBkcmFnLWFuZC1kcm9wIGFuZCBieVxuXHQgKiBcIm9wZW4gYXQgcG9zaXRpb25cIiBlbnRyeSBwb2ludHMuXG5cdCAqXG5cdCAqIC0gSWYgdGhlIHNsb3QgaXMgbm90IHlldCB2aXNpYmxlLCBhIG5ldyBub24tc3RpY2t5IGVudHJ5IGlzIGNyZWF0ZWRcblx0ICogICBhdCB0aGUgY29tcHV0ZWQgcG9zaXRpb24uIEZvciBhbiBgdW5kZWZpbmVkYCBzZXNzaW9uIChlbXB0eSBzbG90KSxcblx0ICogICB0aGlzIGlzIGEgbm8tb3Agd2hlbiBhbiBlbXB0eSBzbG90IGFscmVhZHkgZXhpc3RzIGluIHRoZSBncmlkLlxuXHQgKiAtIElmIHRoZSBzbG90IGlzIGFscmVhZHkgdmlzaWJsZSwgaXQgaXMgbW92ZWQgdG8gdGhlIGNvbXB1dGVkXG5cdCAqICAgcG9zaXRpb247IGl0cyBzdGlja3kgLyBub24tc3RpY2t5IHN0YXRlIGlzIHByZXNlcnZlZC5cblx0ICpcblx0ICogV2hlbiBgYWN0aXZhdGVgIGlzIGB0cnVlYCAoZGVmYXVsdCksIHRoZSBpbnNlcnRlZCBzbG90IGFsc28gYmVjb21lc1xuXHQgKiB0aGUgYWN0aXZlIHNlc3Npb24uIFdoZW4gYGZhbHNlYCwgdGhlIGFjdGl2ZSBzZXNzaW9uIGlzIGxlZnRcblx0ICogdW5jaGFuZ2VkLlxuXHQgKlxuXHQgKiBgdGFyZ2V0U2Vzc2lvbklkYCBtYXkgYmUgYHVuZGVmaW5lZGAgdG8gcG9zaXRpb24gcmVsYXRpdmUgdG8gdGhlIGVtcHR5XG5cdCAqIChuZXctc2Vzc2lvbikgc2xvdC4gTm8tb3AgaWYgdGhlIHRhcmdldCBzbG90IGlzIG5vdCBjdXJyZW50bHkgdmlzaWJsZS5cblx0ICovXG5cdGluc2VydEF0KHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkLCB0YXJnZXRTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2lkZTogJ2xlZnQnIHwgJ3JpZ2h0JywgYWN0aXZhdGU6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3QgaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHNlc3Npb24/LnNlc3Npb25JZDtcblx0XHRjb25zdCB0YXJnZXRJZHggPSB0aGlzLl92aXNpYmxlTGlzdC5pbmRleE9mKHRhcmdldFNlc3Npb25JZCk7XG5cdFx0aWYgKHRhcmdldElkeCA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJbnZhcmlhbnQ6IGF0IG1vc3Qgb25lIGVtcHR5IHNsb3QuIElmIGluc2VydGluZyB0aGUgZW1wdHkgc2xvdCBhbmRcblx0XHQvLyBvbmUgYWxyZWFkeSBleGlzdHMsIGRvIG5vdCBhZGQgb3IgbW92ZSBhbm90aGVyLlxuXHRcdGlmIChpZCA9PT0gdW5kZWZpbmVkICYmIHRoaXMuX3Zpc2libGVMaXN0LmluY2x1ZGVzKHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZGVzdElkeCA9IHNpZGUgPT09ICdsZWZ0JyA/IHRhcmdldElkeCA6IHRhcmdldElkeCArIDE7XG5cblx0XHRjb25zdCBjdXJyZW50SWR4ID0gdGhpcy5fdmlzaWJsZUxpc3QuaW5kZXhPZihpZCk7XG5cdFx0aWYgKGN1cnJlbnRJZHggPj0gMCkge1xuXHRcdFx0Ly8gQWxyZWFkeSB2aXNpYmxlOiBtb3ZlIG9ubHkgaWYgdGhlIGRlc3RpbmF0aW9uIGRpZmZlcnMgZnJvbSB0aGVcblx0XHRcdC8vIGN1cnJlbnQgcG9zaXRpb24gKGRyb3BwaW5nIHRvIHRoZSByaWdodCBvZiB0aGUgcHJldmlvdXMgc2xvdCBvclxuXHRcdFx0Ly8gdG8gdGhlIGxlZnQgb2YgdGhlIG5leHQgc2xvdCBhcmUgYm90aCBuby1vcHMpLlxuXHRcdFx0aWYgKGN1cnJlbnRJZHggIT09IGRlc3RJZHggJiYgY3VycmVudElkeCArIDEgIT09IGRlc3RJZHgpIHtcblx0XHRcdFx0dGhpcy5fdmlzaWJsZUxpc3Quc3BsaWNlKGN1cnJlbnRJZHgsIDEpO1xuXHRcdFx0XHRpZiAoY3VycmVudElkeCA8IGRlc3RJZHgpIHtcblx0XHRcdFx0XHRkZXN0SWR4LS07XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdmlzaWJsZUxpc3Quc3BsaWNlKGRlc3RJZHgsIDAsIGlkKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5faXNTdGlja3lTbG90KGlkKSkge1xuXHRcdFx0XHR0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdCA9IGlkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLl9nZXRPckNyZWF0ZVZpc2libGVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdmlzaWJsZUxpc3Quc3BsaWNlKGRlc3RJZHgsIDAsIGlkKTtcblx0XHRcdHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID0gaWQ7XG5cdFx0fVxuXG5cdFx0dHJhbnNhY3Rpb24oKHRzeCkgPT4ge1xuXHRcdFx0aWYgKGFjdGl2YXRlKSB7XG5cdFx0XHRcdGNvbnN0IHdyYXBwZXIgPSBpZCAhPT0gdW5kZWZpbmVkID8gdGhpcy5fd3JhcHBlcnMuZ2V0KGlkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlU2Vzc2lvbih3cmFwcGVyLCBmYWxzZSwgdHN4KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlZnJlc2godHN4KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBdG9taWNhbGx5IChyZSlidWlsZCB0aGUgZW50aXJlIGdyaWQgZnJvbSBhIHBlcnNpc3RlZCBzbmFwc2hvdC5cblx0ICpcblx0ICogU2xvdHMgYXJlIGdpdmVuIGxlZnQtdG8tcmlnaHQ7IGEgYHNlc3Npb25gIG9mIGB1bmRlZmluZWRgIGRlbm90ZXMgdGhlXG5cdCAqIGVtcHR5IG5ldy1zZXNzaW9uIHNsb3QuIFRoZSB3aG9sZSBtb2RlbCBcdTIwMTQgc2xvdCBvcmRlciwgc3RpY2tpbmVzcyBhbmQgdGhlXG5cdCAqIGFjdGl2ZSBzbG90IFx1MjAxNCBpcyBwdWJsaXNoZWQgaW4gYSBzaW5nbGUgdHJhbnNhY3Rpb24gc28gcmVzdG9yaW5nIG11bHRpcGxlXG5cdCAqIHNlc3Npb25zIGRvZXMgbm90IHByb2R1Y2UgaW50ZXJtZWRpYXRlIGxheW91dHMgKHdoaWNoIHdvdWxkIG90aGVyd2lzZVxuXHQgKiBjYXVzZSB0aGUgZ3JpZCB0byB2aXNpYmx5IGZsaWNrZXIgYXMgc2Vzc2lvbnMgYXJlIHJlc3RvcmVkIG9uZSBieSBvbmUpLlxuXHQgKlxuXHQgKiBBbnkgd3JhcHBlcnMgZm9yIHNlc3Npb25zIG5vIGxvbmdlciBwcmVzZW50IGluIHRoZSBzbmFwc2hvdCBhcmUgZGlzcG9zZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSBzbG90cyBPcmRlcmVkIGdyaWQgc2xvdHMgdG8gcmVzdG9yZS5cblx0ICogQHBhcmFtIGFjdGl2ZUluZGV4IEluZGV4IGludG8gYHNsb3RzYCBvZiB0aGUgc2xvdCB0aGF0IHNob3VsZCBiZSBhY3RpdmUsXG5cdCAqIG9yIGAtMWAgZm9yIG5vbmUuXG5cdCAqL1xuXHRyZXN0b3JlR3JpZChzbG90czogUmVhZG9ubHlBcnJheTx7IHJlYWRvbmx5IHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkOyByZWFkb25seSBzdGlja3k6IGJvb2xlYW4gfT4sIGFjdGl2ZUluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlTGlzdCA9IFtdO1xuXHRcdHRoaXMuX3N0aWNreUlkcy5jbGVhcigpO1xuXG5cdFx0bGV0IGFjdGl2ZVdyYXBwZXI6IFZpc2libGVTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsYXN0Tm9uU3RpY2t5U2xvdDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgdHlwZW9mIE5PX1JFQ0VOVCA9IE5PX1JFQ0VOVDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNsb3RzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCB7IHNlc3Npb24sIHN0aWNreSB9ID0gc2xvdHNbaV07XG5cdFx0XHRjb25zdCBpZCA9IHNlc3Npb24/LnNlc3Npb25JZDtcblx0XHRcdHRoaXMuX3Zpc2libGVMaXN0LnB1c2goaWQpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuX2dldE9yQ3JlYXRlVmlzaWJsZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHRcdGlmIChzdGlja3kpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGlja3lJZHMuYWRkKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaSA9PT0gYWN0aXZlSW5kZXgpIHtcblx0XHRcdFx0XHRhY3RpdmVXcmFwcGVyID0gd3JhcHBlcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9pc1N0aWNreVNsb3QoaWQpKSB7XG5cdFx0XHRcdGxhc3ROb25TdGlja3lTbG90ID0gaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSB3cmFwcGVycyBmb3Igc2Vzc2lvbnMgdGhhdCBhcmUgbm8gbG9uZ2VyIHBhcnQgb2YgdGhlIGdyaWQgc29cblx0XHQvLyB0aGUgbW9kZWwgZG9lcyBub3QgbGVhayBlbnRyaWVzIGZyb20gYSBwcmV2aW91cyAoZS5nLiB0cmFuc2llbnRcblx0XHQvLyBuZXctc2Vzc2lvbikgc3RhdGUuXG5cdFx0Zm9yIChjb25zdCBleGlzdGluZ0lkIG9mIFsuLi50aGlzLl93cmFwcGVycy5rZXlzKCldKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3Zpc2libGVMaXN0LmluY2x1ZGVzKGV4aXN0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMuX3dyYXBwZXJzLmRlbGV0ZUFuZERpc3Bvc2UoZXhpc3RpbmdJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWlycm9yIHRoZSBzbG90LXJlcGxhY2VtZW50IGJvb2trZWVwaW5nIHVzZWQgZWxzZXdoZXJlOiBwcmVmZXIgdGhlXG5cdFx0Ly8gYWN0aXZlIHNsb3Qgd2hlbiBpdCBpcyBub24tc3RpY2t5LCBvdGhlcndpc2UgdGhlIGxhc3Qgbm9uLXN0aWNreSBzbG90LlxuXHRcdGNvbnN0IGFjdGl2ZUlkID0gYWN0aXZlV3JhcHBlcj8uc2Vzc2lvbklkO1xuXHRcdHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID0gKGFjdGl2ZUlkICE9PSB1bmRlZmluZWQgJiYgIXRoaXMuX2lzU3RpY2t5U2xvdChhY3RpdmVJZCkpXG5cdFx0XHQ/IGFjdGl2ZUlkXG5cdFx0XHQ6IGxhc3ROb25TdGlja3lTbG90O1xuXG5cdFx0dHJhbnNhY3Rpb24odHN4ID0+IHtcblx0XHRcdHRoaXMuX3NldEFjdGl2ZVNlc3Npb24oYWN0aXZlV3JhcHBlciwgZmFsc2UsIHRzeCk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoKHRzeCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGdyaWQgc2xvdCBzdGF0ZSBvZiBhIGN1cnJlbnRseSB2aXNpYmxlIHNlc3Npb24gKG9yIG9mIHRoZSBlbXB0eSBzbG90XG5cdCAqIHdoZW4gYHNlc3Npb25JZGAgaXMgYHVuZGVmaW5lZGApLCBvciBgdW5kZWZpbmVkYCB3aGVuIGl0IGlzIG5vdCB2aXNpYmxlLlxuXHQgKi9cblx0Z2V0U2xvdChzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgcmVhZG9ubHkgaW5kZXg6IG51bWJlcjsgcmVhZG9ubHkgc3RpY2t5OiBib29sZWFuIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fdmlzaWJsZUxpc3QuaW5kZXhPZihzZXNzaW9uSWQpO1xuXHRcdHJldHVybiBpbmRleCA8IDAgPyB1bmRlZmluZWQgOiB7IGluZGV4LCBzdGlja3k6IHRoaXMuX2lzU3RpY2t5U2xvdChzZXNzaW9uSWQpIH07XG5cdH1cblxuXHQvKiogVGhlIHNlc3Npb24gYmVoaW5kIGEgdmlzaWJsZSBzbG90LCBvciBgdW5kZWZpbmVkYCBmb3IgdGhlIGVtcHR5IHNsb3QgLyBhbiB1bmtub3duIGlkLiAqL1xuXHRnZXRTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBzZXNzaW9uSWQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHRoaXMuX3dyYXBwZXJzLmdldChzZXNzaW9uSWQpPy5zZXNzaW9uO1xuXHR9XG5cblx0LyoqXG5cdCAqIFB1dCBhIHNlc3Npb24gKGJhY2spIGludG8gdGhlIGdyaWQgYXQgYGluZGV4YCwgc2hpZnRpbmcgdGhlIHNsb3RzIGF0IGFuZFxuXHQgKiBhZnRlciBpdCB0byB0aGUgcmlnaHQsIGFuZCBtYWtlIGl0IGFjdGl2ZS4gVGhlIGluZGV4IGlzIGNsYW1wZWQgdG8gdGhlXG5cdCAqIGN1cnJlbnQgZ3JpZCBzaXplLCBzbyBhIHN0YWxlIGluZGV4IGFwcGVuZHMgaW5zdGVhZCBvZiBmYWlsaW5nLiBOby1vcFxuXHQgKiB3aGVuIHRoZSBzZXNzaW9uIGlzIGFscmVhZHkgdmlzaWJsZS5cblx0ICovXG5cdGluc2VydEF0SW5kZXgoc2Vzc2lvbjogSVNlc3Npb24sIGluZGV4OiBudW1iZXIsIHN0aWNreTogYm9vbGVhbik6IFZpc2libGVTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpZCA9IHNlc3Npb24uc2Vzc2lvbklkO1xuXHRcdGlmICh0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyhpZCkpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fd3JhcHBlcnMuZ2V0KGlkKTtcblx0XHRcdHRyYW5zYWN0aW9uKHRzeCA9PiB0aGlzLl9zZXRBY3RpdmVTZXNzaW9uKGV4aXN0aW5nLCBmYWxzZSwgdHN4KSk7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVzdElkeCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGluZGV4LCB0aGlzLl92aXNpYmxlTGlzdC5sZW5ndGgpKTtcblx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy5fZ2V0T3JDcmVhdGVWaXNpYmxlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR0aGlzLl92aXNpYmxlTGlzdC5zcGxpY2UoZGVzdElkeCwgMCwgaWQpO1xuXHRcdGlmIChzdGlja3kpIHtcblx0XHRcdHRoaXMuX3N0aWNreUlkcy5hZGQoaWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdCA9IGlkO1xuXHRcdH1cblxuXHRcdHRyYW5zYWN0aW9uKCh0c3gpID0+IHtcblx0XHRcdHRoaXMuX3NldEFjdGl2ZVNlc3Npb24od3JhcHBlciwgZmFsc2UsIHRzeCk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoKHRzeCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHdyYXBwZXI7XG5cdH1cblxuXHQvKipcblx0ICogUmVwbGFjZSB0aGUgc2xvdCBjdXJyZW50bHkgaGVsZCBieSBgc2xvdElkYCAoYHVuZGVmaW5lZGAgZm9yIHRoZSBlbXB0eVxuXHQgKiBzbG90KSB3aXRoIGBzZXNzaW9uYCwgYW5kIG1ha2UgaXQgYWN0aXZlLiBVc2VkIHRvIHVuZG8gYSBncmlkXG5cdCAqIHJlcGxhY2VtZW50LCBzbyB0aGUgcmVzdG9yZWQgc2Vzc2lvbiBsYW5kcyBleGFjdGx5IHdoZXJlIGl0IHdhcyBhbmQgdGhlXG5cdCAqIHNlc3Npb24gdGhhdCB0b29rIGl0cyBwbGFjZSBsZWF2ZXMgdGhlIGdyaWQuIE5vLW9wIHdoZW4gdGhlIHNsb3QgaXMgbm90XG5cdCAqIHZpc2libGUgb3IgdGhlIHNlc3Npb24gaXMgYWxyZWFkeSB2aXNpYmxlIGVsc2V3aGVyZS5cblx0ICovXG5cdHJlcGxhY2VTbG90KHNsb3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzZXNzaW9uOiBJU2Vzc2lvbiwgc3RpY2t5OiBib29sZWFuKTogVmlzaWJsZVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGlkID0gc2Vzc2lvbi5zZXNzaW9uSWQ7XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fdmlzaWJsZUxpc3QuaW5kZXhPZihzbG90SWQpO1xuXHRcdGlmIChpZHggPCAwIHx8IHRoaXMuX3Zpc2libGVMaXN0LmluY2x1ZGVzKGlkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl92aXNpYmxlTGlzdC5zcGxpY2UoaWR4LCAxLCBpZCk7XG5cdFx0aWYgKHNsb3RJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zdGlja3lJZHMuZGVsZXRlKHNsb3RJZCk7XG5cdFx0XHR0aGlzLl93cmFwcGVycy5kZWxldGVBbmREaXNwb3NlKHNsb3RJZCk7XG5cdFx0fVxuXHRcdGlmIChzdGlja3kpIHtcblx0XHRcdHRoaXMuX3N0aWNreUlkcy5hZGQoaWQpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgPT09IHNsb3RJZCkge1xuXHRcdFx0dGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgPSBzdGlja3kgPyB0aGlzLl9maW5kTGFzdE5vblN0aWNreSgpIDogaWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuX2dldE9yQ3JlYXRlVmlzaWJsZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0dHJhbnNhY3Rpb24oKHRzeCkgPT4ge1xuXHRcdFx0dGhpcy5fc2V0QWN0aXZlU2Vzc2lvbih3cmFwcGVyLCBmYWxzZSwgdHN4KTtcblx0XHRcdHRoaXMuX3JlZnJlc2godHN4KTtcblx0XHR9KTtcblx0XHRyZXR1cm4gd3JhcHBlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGUgYSBzZXNzaW9uJ3Mgc3RpY2tpbmVzcyBpbiB0aGUgZ3JpZC4gVGhlIHNlc3Npb24ga2VlcHMgaXRzIGdyaWRcblx0ICogc2xvdCB3aGVuIHRvZ2dsZWQuXG5cdCAqIC0gSWYgdGhlIHNlc3Npb24gaXMgbm90IGN1cnJlbnRseSB2aXNpYmxlLCBpdCBpcyBhcHBlbmRlZCBhdCB0aGUgZW5kIGFzXG5cdCAqICAgc3RpY2t5LlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRoZSBzZXNzaW9uJ3Mgc3RpY2tpbmVzcyBzdGF0ZSBhZnRlciB0aGUgdG9nZ2xlLlxuXHQgKi9cblx0dG9nZ2xlU3RpY2tpbmVzcyhzZXNzaW9uOiBJU2Vzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlkID0gc2Vzc2lvbi5zZXNzaW9uSWQ7XG5cdFx0aWYgKCF0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyhpZCkpIHtcblx0XHRcdHRoaXMuX3N0aWNreUlkcy5hZGQoaWQpO1xuXHRcdFx0dGhpcy5fZ2V0T3JDcmVhdGVWaXNpYmxlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdHRoaXMuX3Zpc2libGVMaXN0LnB1c2goaWQpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fc3RpY2t5SWRzLmhhcyhpZCkpIHtcblx0XHRcdHRoaXMuX3N0aWNreUlkcy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgPSBpZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RpY2t5SWRzLmFkZChpZCk7XG5cdFx0XHRpZiAodGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgPT09IGlkKSB7XG5cdFx0XHRcdHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID0gdGhpcy5fZmluZExhc3ROb25TdGlja3koKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcmVmcmVzaCh1bmRlZmluZWQpO1xuXHRcdHJldHVybiB0aGlzLl9zdGlja3lJZHMuaGFzKGlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgdGhlIGdpdmVuIHNlc3Npb24gaWRzIGZyb20gdGhlIHZpc2liaWxpdHkgbW9kZWwgYW5kIGRpc3Bvc2UgdGhlaXJcblx0ICogd3JhcHBlcnMuIFBhc3NpbmcgYHVuZGVmaW5lZGAgcmVtb3ZlcyB0aGUgZW1wdHkgKG5ldy1zZXNzaW9uKSBzbG90IGlmXG5cdCAqIHByZXNlbnQuIElmIHRoZSBhY3RpdmUgc2xvdCBpcyBhbW9uZyB0aGUgcmVtb3ZlZCBlbnRyaWVzLCB0aGUgYWN0aXZlXG5cdCAqIG9ic2VydmFibGUgZmFsbHMgYmFjayB0byB0aGUgc2xvdCBhdCB0aGUgYWN0aXZlJ3Mgb3JpZ2luYWwgcG9zaXRpb25cblx0ICogKG9yIHRoZSBzbG90IHRvIGl0cyBsZWZ0IGlmIGl0IHdhcyBhdCB0aGUgZW5kIG9mIHRoZSBncmlkKTsgd2hlbiBub1xuXHQgKiB2aXNpYmxlIHNsb3QgcmVtYWlucywgdGhlIGFjdGl2ZSBvYnNlcnZhYmxlIGlzIGNsZWFyZWQuIE9ic2VydmFibGVzXG5cdCAqIGFyZSByZWZyZXNoZWQgb25jZSBpZiBhbnl0aGluZyBjaGFuZ2VkLlxuXHQgKi9cblx0cmVtb3ZlTWFueShzZXNzaW9uSWRzOiBJdGVyYWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+KTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24oKHRzeCkgPT4ge1xuXHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGFjdGl2ZUlkID0gdGhpcy5fYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkO1xuXHRcdFx0Ly8gYWN0aXZlU2Vzc2lvbi5nZXQoKSBpcyB1bmRlZmluZWQgYm90aCB3aGVuIHRoZSBlbXB0eSBzbG90IGlzIGFjdGl2ZVxuXHRcdFx0Ly8gYW5kIHdoZW4gbm8gc2xvdCBpcyBhY3RpdmU7IGRpc2FtYmlndWF0ZSB2aWEgdGhlIHZpc2libGUgbGlzdC5cblx0XHRcdGNvbnN0IGVtcHR5U2xvdElzQWN0aXZlID0gYWN0aXZlSWQgPT09IHVuZGVmaW5lZCAmJiB0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyh1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgYWN0aXZlU2xvdElkID0gZW1wdHlTbG90SXNBY3RpdmUgPyB1bmRlZmluZWQgOiBhY3RpdmVJZDtcblx0XHRcdGNvbnN0IGFjdGl2ZUlkeCA9IGFjdGl2ZUlkICE9PSB1bmRlZmluZWQgfHwgZW1wdHlTbG90SXNBY3RpdmVcblx0XHRcdFx0PyB0aGlzLl92aXNpYmxlTGlzdC5pbmRleE9mKGFjdGl2ZVNsb3RJZClcblx0XHRcdFx0OiAtMTtcblx0XHRcdGxldCBhY3RpdmVSZW1vdmVkID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHNlc3Npb25JZHMpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3JlbW92ZUZyb21Nb2RlbChpZCkpIHtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRpZiAoaWQgPT09IHVuZGVmaW5lZCA/IGVtcHR5U2xvdElzQWN0aXZlIDogaWQgPT09IGFjdGl2ZUlkKSB7XG5cdFx0XHRcdFx0XHRhY3RpdmVSZW1vdmVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChhY3RpdmVSZW1vdmVkKSB7XG5cdFx0XHRcdGlmICh0aGlzLl92aXNpYmxlTGlzdC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9zZXRBY3RpdmVTZXNzaW9uKHVuZGVmaW5lZCwgZmFsc2UsIHRzeCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZmFsbGJhY2tJZHggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihhY3RpdmVJZHggLSAxLCB0aGlzLl92aXNpYmxlTGlzdC5sZW5ndGggLSAxKSk7XG5cdFx0XHRcdFx0Y29uc3QgZmFsbGJhY2tJZCA9IHRoaXMuX3Zpc2libGVMaXN0W2ZhbGxiYWNrSWR4XTtcblx0XHRcdFx0XHRjb25zdCBmYWxsYmFja1dyYXBwZXIgPSBmYWxsYmFja0lkICE9PSB1bmRlZmluZWQgPyB0aGlzLl93cmFwcGVycy5nZXQoZmFsbGJhY2tJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlU2Vzc2lvbihmYWxsYmFja1dyYXBwZXIsIGZhbHNlLCB0c3gpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoKHRzeCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBhY3RpdmUgY2hhdCBmb3IgdGhlIGdpdmVuIHNlc3Npb24ncyB3cmFwcGVyLiBOby1vcCBpZiB0aGVcblx0ICogc2Vzc2lvbiBpcyBub3QgY3VycmVudGx5IHRyYWNrZWQgaW4gdGhlIHZpc2liaWxpdHkgbW9kZWwuXG5cdCAqL1xuXHRzZXRBY3RpdmVDaGF0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0OiBJQ2hhdCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyYXBwZXJzLmdldChzZXNzaW9uLnNlc3Npb25JZCk/LnNldEFjdGl2ZUNoYXQoY2hhdCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2xvc2UgKGhpZGUgZnJvbSB0aGUgdGFiIHN0cmlwKSB0aGUgZ2l2ZW4gY2hhdCBpbiB0aGUgc2Vzc2lvbidzIHdyYXBwZXIuXG5cdCAqIE5vLW9wIGlmIHRoZSBzZXNzaW9uIGlzIG5vdCBjdXJyZW50bHkgdHJhY2tlZCBpbiB0aGUgdmlzaWJpbGl0eSBtb2RlbC5cblx0ICovXG5cdGNsb3NlQ2hhdChzZXNzaW9uOiBJU2Vzc2lvbiwgY2hhdDogSUNoYXQpOiB2b2lkIHtcblx0XHR0aGlzLl93cmFwcGVycy5nZXQoc2Vzc2lvbi5zZXNzaW9uSWQpPy5jbG9zZUNoYXQoY2hhdCk7XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiAodW4taGlkZSBmcm9tIHRoZSB0YWIgc3RyaXApIGEgcHJldmlvdXNseSBjbG9zZWQgY2hhdCBpbiB0aGUgc2Vzc2lvbidzXG5cdCAqIHdyYXBwZXIuIE5vLW9wIGlmIHRoZSBzZXNzaW9uIGlzIG5vdCBjdXJyZW50bHkgdHJhY2tlZCBpbiB0aGUgdmlzaWJpbGl0eSBtb2RlbC5cblx0ICovXG5cdG9wZW5DaGF0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0OiBJQ2hhdCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyYXBwZXJzLmdldChzZXNzaW9uLnNlc3Npb25JZCk/Lm9wZW5DaGF0KGNoYXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlcGxhY2UgdGhlIGdpdmVuIHNlc3Npb24gaW4gdGhlIHZpc2liaWxpdHkgbW9kZWwgd2l0aCBgdXBkYXRlZFNlc3Npb25gLFxuXHQgKiBwcmVzZXJ2aW5nIHRoZSBncmlkIHNsb3QsIHN0aWNreSBzdGF0ZSwgYW5kIGFjdGl2ZSBzdGF0ZS4gVGhlIHdyYXBwZXJcblx0ICogZm9yIHRoZSBvbGQgc2Vzc2lvbiBpcyBkaXNwb3NlZDsgYSBmcmVzaCB3cmFwcGVyIGlzIGNyZWF0ZWQgZm9yIHRoZVxuXHQgKiB1cGRhdGVkIHNlc3Npb24uIE5vLW9wIGlmIGBzZXNzaW9uYCBpcyBub3QgY3VycmVudGx5IGluIHRoZSBncmlkLlxuXHQgKi9cblx0dXBkYXRlU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiwgdXBkYXRlZFNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgZnJvbUlkID0gc2Vzc2lvbi5zZXNzaW9uSWQ7XG5cdFx0aWYgKCF0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyhmcm9tSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2FzQWN0aXZlID0gdGhpcy5fYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkID09PSBmcm9tSWQ7XG5cdFx0dGhpcy5yZXBsYWNlSWQoZnJvbUlkLCB1cGRhdGVkU2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdC8vIGByZXBsYWNlSWRgIGlzIGEgbm8tb3Agd2hlbiBpZHMgbWF0Y2ggXHUyMDE0IGRpc3Bvc2UgdGhlIG9sZCB3cmFwcGVyXG5cdFx0Ly8gZGlyZWN0bHkgc28gYSBmcmVzaCBvbmUgaXMgY3JlYXRlZCBhZ2FpbnN0IGB1cGRhdGVkU2Vzc2lvbmAuXG5cdFx0aWYgKGZyb21JZCA9PT0gdXBkYXRlZFNlc3Npb24uc2Vzc2lvbklkICYmIHRoaXMuX3dyYXBwZXJzLmhhcyhmcm9tSWQpKSB7XG5cdFx0XHR0aGlzLl93cmFwcGVycy5kZWxldGVBbmREaXNwb3NlKGZyb21JZCk7XG5cdFx0fVxuXG5cdFx0dHJhbnNhY3Rpb24oKHRzeCkgPT4ge1xuXHRcdFx0Y29uc3QgdmlzaWJsZVNlc3Npb24gPSB0aGlzLl9nZXRPckNyZWF0ZVZpc2libGVTZXNzaW9uKHVwZGF0ZWRTZXNzaW9uKTtcblx0XHRcdGlmICh3YXNBY3RpdmUpIHtcblx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlU2Vzc2lvbih2aXNpYmxlU2Vzc2lvbiwgZmFsc2UsIHRzeCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZWZyZXNoKHRzeCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgdHJhbnNpZW50IHtAbGluayBJU2Vzc2lvbn0gdGhhdCBtaXJyb3JzIHRoZSBnaXZlbiBzZXNzaW9uIGJ1dFxuXHQgKiBleHBvc2VzIGEgZGlmZmVyZW50IHtAbGluayBJU2Vzc2lvbi5yZXNvdXJjZX0uIFRoZSB2aXNpYmlsaXR5IG1vZGVsJ3Ncblx0ICogd3JhcHBlciBmb3IgdGhlIHNhbWUgc2Vzc2lvbiBpZCBpcyByZWJ1aWx0IGFnYWluc3QgdGhpcyB0cmFuc2llbnRcblx0ICogc2Vzc2lvbiBzbyBjb25zdW1lcnMgb2JzZXJ2ZSB0aGUgbmV3IHJlc291cmNlLiBSZXR1cm5zIHRoZSB0cmFuc2llbnRcblx0ICogc2Vzc2lvbiBzbyBjYWxsZXJzIGNhbiBwYXNzIGl0IHRvIGEgc3Vic2VxdWVudCB7QGxpbmsgdXBkYXRlU2Vzc2lvbn1cblx0ICogb25jZSB0aGUgcHJvdmlkZXIgcHJvZHVjZXMgdGhlIGZpbmFsIHNlc3Npb24uXG5cdCAqXG5cdCAqIE5vLW9wIChidXQgc3RpbGwgcmV0dXJucyB0aGUgdHJhbnNpZW50IHNlc3Npb24pIGlmIHRoZSBzZXNzaW9uIGlzIG5vdFxuXHQgKiBjdXJyZW50bHkgaW4gdGhlIGdyaWQuXG5cdCAqL1xuXHR1cGRhdGVSZXNvdXJjZU9mU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiwgcmVzb3VyY2U6IFVSSSk6IElTZXNzaW9uIHtcblx0XHRjb25zdCB0bXBTZXNzaW9uID0gbmV3IFJlc291cmNlT3ZlcnJpZGVTZXNzaW9uKHNlc3Npb24sIHJlc291cmNlKTtcblx0XHR0aGlzLnVwZGF0ZVNlc3Npb24oc2Vzc2lvbiwgdG1wU2Vzc2lvbik7XG5cdFx0cmV0dXJuIHRtcFNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogUmVuYW1lIGEgc2Vzc2lvbiBpZCBpbiB0aGUgdmlzaWJpbGl0eSBtb2RlbCBzbyB0aGUgc2FtZSBncmlkIHNsb3QgaXNcblx0ICogcmV1c2VkIGZvciB0aGUgcmVwbGFjZW1lbnQuIFRoZSBvbGQgd3JhcHBlciBpcyBkaXNwb3NlZDsgYSBmcmVzaCBvbmUgaXNcblx0ICogY3JlYXRlZCBsYXppbHkgb24gbmV4dCBhY2Nlc3MuIERvZXMgbm90IGF1dG8tcmVmcmVzaCBcdTIwMTQgY2FsbGVycyBzaG91bGRcblx0ICogY2FsbCB7QGxpbmsgcmVmcmVzaH0gb3Ige0BsaW5rIHNldEFjdGl2ZX0gYXMgYXBwcm9wcmlhdGUuXG5cdCAqL1xuXHRyZXBsYWNlSWQoZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChmcm9tSWQgPT09IHRvSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fdmlzaWJsZUxpc3QuaW5kZXhPZihmcm9tSWQpO1xuXHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUxpc3Quc3BsaWNlKGlkeCwgMSwgdG9JZCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGlja3lJZHMuZGVsZXRlKGZyb21JZCkpIHtcblx0XHRcdHRoaXMuX3N0aWNreUlkcy5hZGQodG9JZCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdCA9PT0gZnJvbUlkKSB7XG5cdFx0XHR0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdCA9IHRvSWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl93cmFwcGVycy5oYXMoZnJvbUlkKSkge1xuXHRcdFx0dGhpcy5fd3JhcHBlcnMuZGVsZXRlQW5kRGlzcG9zZShmcm9tSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBSZS1wdWJsaXNoIHRoZSB2aXNpYmxlIHNlc3Npb25zIGFuZCBzdGlja3kgaWRzIG9ic2VydmFibGVzLiAqL1xuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZnJlc2godW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRMYXN0Tm9uU3RpY2t5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB8IHR5cGVvZiBOT19SRUNFTlQge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl92aXNpYmxlTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3Qgc2lkID0gdGhpcy5fdmlzaWJsZUxpc3RbaV07XG5cdFx0XHRpZiAoIXRoaXMuX2lzU3RpY2t5U2xvdChzaWQpKSB7XG5cdFx0XHRcdHJldHVybiBzaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBOT19SRUNFTlQ7XG5cdH1cblxuXHQvKiogVHJ1ZSBpZiB0aGUgZ2l2ZW4gc2xvdCBpZCByZWZlcnMgdG8gYSBzdGlja3kgc2Vzc2lvbi4gVGhlIGVtcHR5IHNsb3QgaXMgbmV2ZXIgc3RpY2t5LiAqL1xuXHRwcml2YXRlIF9pc1N0aWNreVNsb3QoaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX3N0aWNreUlkcy5oYXMoaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHNsb3QgaWQgb2YgdGhlIGN1cnJlbnRseSBhY3RpdmUgZW50cnkgaW4gdGhlIGdyaWQsIG9yXG5cdCAqIHtAbGluayBOT19SRUNFTlR9IGlmIG5vIGVudHJ5IGluIHRoZSBncmlkIGlzIGFjdGl2ZS5cblx0ICovXG5cdHByaXZhdGUgX2N1cnJlbnRBY3RpdmVTbG90KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB8IHR5cGVvZiBOT19SRUNFTlQge1xuXHRcdGNvbnN0IGFjdGl2ZUlkID0gdGhpcy5fYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkO1xuXHRcdGlmIChhY3RpdmVJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZUxpc3QuaW5jbHVkZXMoYWN0aXZlSWQpID8gYWN0aXZlSWQgOiBOT19SRUNFTlQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyh1bmRlZmluZWQpID8gdW5kZWZpbmVkIDogTk9fUkVDRU5UO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlRnJvbU1vZGVsKHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRjb25zdCBpZHggPSB0aGlzLl92aXNpYmxlTGlzdC5pbmRleE9mKHNlc3Npb25JZCk7XG5cdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlTGlzdC5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbklkICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fc3RpY2t5SWRzLmRlbGV0ZShzZXNzaW9uSWQpKSB7XG5cdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID09PSBzZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID0gdGhpcy5fZmluZExhc3ROb25TdGlja3koKTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbklkICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fd3JhcHBlcnMuaGFzKHNlc3Npb25JZCkpIHtcblx0XHRcdHRoaXMuX3dyYXBwZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hhbmdlZDtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2godHN4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB3cmFwcGVyczogKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBpZCBvZiB0aGlzLl92aXNpYmxlTGlzdCkge1xuXHRcdFx0aWYgKGlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0d3JhcHBlcnMucHVzaCh1bmRlZmluZWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZpc2libGVTZXNzaW9uID0gdGhpcy5fd3JhcHBlcnMuZ2V0KGlkKTtcblx0XHRcdGlmICh2aXNpYmxlU2Vzc2lvbikge1xuXHRcdFx0XHR2aXNpYmxlU2Vzc2lvbi5zZXRTdGlja3kodGhpcy5fc3RpY2t5SWRzLmhhcyhpZCkpO1xuXHRcdFx0XHR3cmFwcGVycy5wdXNoKHZpc2libGVTZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdmlzaWJsZVNlc3Npb25zLnNldCh3cmFwcGVycywgdHN4KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlVmlzaWJsZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiBWaXNpYmxlU2Vzc2lvbiB7XG5cdFx0bGV0IHZpc2libGVTZXNzaW9uID0gdGhpcy5fd3JhcHBlcnMuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRpZiAodmlzaWJsZVNlc3Npb24pIHtcblx0XHRcdHJldHVybiB2aXNpYmxlU2Vzc2lvbjtcblx0XHR9XG5cblx0XHRjb25zdCBpbml0aWFsQ2hhdCA9IHRoaXMuX3Jlc29sdmVJbml0aWFsQ2hhdChzZXNzaW9uKTtcblx0XHR2aXNpYmxlU2Vzc2lvbiA9IG5ldyBWaXNpYmxlU2Vzc2lvbihzZXNzaW9uLCBpbml0aWFsQ2hhdCwgdGhpcy5fcmVzb2x2ZUluaXRpYWxDbG9zZWRDaGF0cyhzZXNzaW9uKSk7XG5cdFx0Y29uc3QgdmlzaWJsZVNlc3Npb25SZWYgPSB2aXNpYmxlU2Vzc2lvbjtcblxuXHRcdC8vIFRyYWNrIGNoYXQgbGlzdCBjaGFuZ2VzIFx1MjAxNCBpZiB0aGUgYWN0aXZlIGNoYXQgaXMgcmVtb3ZlZCwgZmFsbCBiYWNrIHRvIHRoZSBsYXN0IHZpc2libGUgdGFiLlxuXHRcdHZpc2libGVTZXNzaW9uLmFkZERpc3Bvc2FibGUoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhdHMgPSBzZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUNoYXQgPSB2aXNpYmxlU2Vzc2lvblJlZi5hY3RpdmVDaGF0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChhY3RpdmVDaGF0ICYmICFjaGF0cy5zb21lKGMgPT4gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGMucmVzb3VyY2UsIGFjdGl2ZUNoYXQucmVzb3VyY2UpKSkge1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlQ2hhdFRhYnMgPSB2aXNpYmxlU2Vzc2lvblJlZi52aXNpYmxlQ2hhdFRhYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBmYWxsYmFjayA9IHZpc2libGVDaGF0VGFic1t2aXNpYmxlQ2hhdFRhYnMubGVuZ3RoIC0gMV0gPz8gc2Vzc2lvbi5tYWluQ2hhdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChmYWxsYmFjaykge1xuXHRcdFx0XHRcdHZpc2libGVTZXNzaW9uUmVmLnNldEFjdGl2ZUNoYXQoZmFsbGJhY2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd3JhcHBlcnMuc2V0KHNlc3Npb24uc2Vzc2lvbklkLCB2aXNpYmxlU2Vzc2lvbik7XG5cdFx0cmV0dXJuIHZpc2libGVTZXNzaW9uO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxxQkFBa0M7QUFDdkQsU0FBeUQsU0FBUyxTQUFTLGlCQUFpQixtQkFBbUI7QUFFL0csU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxtQkFBbUIsZ0JBQWlDLHFCQUFxQjtBQWEzRSxNQUFNLHVCQUF1QixXQUFxQztBQUFBLEVBbUN4RSxZQUNrQixVQUNqQixhQUNBLHVCQUNDO0FBQ0QsVUFBTTtBQUpXO0FBL0JsQixTQUFpQixVQUFVLGdCQUF5Qix1QkFBdUIsS0FBSztBQUNoRixTQUFTLFNBQStCLEtBQUs7QUF1QjdDO0FBQUEsU0FBaUIsbUJBQTRCLENBQUM7QUFZN0MsU0FBSyxjQUFjLGdCQUF1QixjQUFjLFNBQVMsU0FBUyxJQUFJLFdBQVc7QUFDekYs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
