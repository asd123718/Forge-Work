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
import { disposableTimeout } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { localize } from "../../../../nls.js";
import { ChatInteractivity, ChatOriginKind, SessionStatus } from "../common/session.js";
import { inheritableSessionTarget, ISessionsManagementService } from "../common/sessionsManagement.js";
import { ISessionsProvidersService } from "./sessionsProvidersService.js";
import { ClosedItemHistory } from "./closedItemHistory.js";
import { SessionsNavigation } from "./sessionNavigation.js";
import { SessionsRecencyHistory } from "./sessionsRecencyHistory.js";
import { VisibleSessions } from "./visibleSessions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ISessionsPartService } from "./sessionsPartService.js";
import { ICustomViewService } from "../../customView/browser/customViewService.js";
import { IsNewChatSessionContext } from "../../../common/contextkeys.js";
import { setActiveSessionContextKeys } from "../common/sessionContextKeys.js";
const ACTIVE_SESSION_STATES_KEY = "agentSessions.activeSessionStates";
const RESTORE_SESSION_WAIT_TIMEOUT = 3e4;
const MAX_RECENTLY_OPENED_SESSIONS = 10;
const ISessionsService = createDecorator("sessionsService");
let SessionsService = class extends Disposable {
  constructor(storageService, logService, uriIdentityService, contextKeyService, sessionsManagementService, sessionsProvidersService, sessionsPartService, customViewService, instantiationService, workspaceTrustRequestService) {
    super();
    this.storageService = storageService;
    this.logService = logService;
    this.uriIdentityService = uriIdentityService;
    this.contextKeyService = contextKeyService;
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.sessionsPartService = sessionsPartService;
    this.customViewService = customViewService;
    this.instantiationService = instantiationService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this._onDidToggleSessionStickiness = this._register(new Emitter());
    this.onDidToggleSessionStickiness = this._onDidToggleSessionStickiness.event;
    this._initialRestoreComplete = observableValue(this, false);
    this.initialRestoreComplete = this._initialRestoreComplete;
    /** Cancelled on every navigation action so in-flight async opens bail out. */
    this._openSessionCts = this._register(new MutableDisposable());
    /**
     * Cancellation for the in-flight {@link restoreVisibleSessions}. Kept
     * separate from {@link _openSessionCts} so that additive new-session
     * operations (the new-chat composer eagerly creating a draft on startup)
     * do not abort restoring the previously visible grid. Only an explicit
     * navigation to a specific session cancels a restore.
     */
    this._restoreCts = this._register(new MutableDisposable());
    /** The in-flight foreground send's "keep newest chat active" follow. */
    this._sendFollow = this._register(new MutableDisposable());
    this._sessionStates = this._loadSessionStates();
    this._visibility = this._register(this.instantiationService.createInstance(
      VisibleSessions,
      (session) => this._restoreInitialChat(session),
      (session) => this._restoreClosedChats(session),
      (replaced, index, sticky, replacedBySessionId) => this._closedItems.recordReplacedSlot(replaced, index, sticky, replacedBySessionId)
    ));
    this.visibleSessions = this._visibility.visibleSessions;
    this.activeSession = this._visibility.activeSession;
    this._closedItems = this._register(this.instantiationService.createInstance(
      ClosedItemHistory,
      this._visibility,
      (session, chatResource) => this.openChat(session, chatResource)
    ));
    this._isNewChatSessionContext = IsNewChatSessionContext.bindTo(this.contextKeyService);
    this._register(this.storageService.onWillSaveState(() => this._saveSessionStates()));
    this._recencyHistory = this._register(new SessionsRecencyHistory(
      this.storageService,
      this.logService
    ));
    this._navigation = this._register(new SessionsNavigation(
      this,
      this.activeSession,
      this.sessionsManagementService,
      this._recencyHistory,
      this.contextKeyService,
      this.logService
    ));
    this._register(this.sessionsManagementService.onDidChangeSessions((e) => this._navigation.onDidRemoveSessions(e)));
    this._register(this.sessionsManagementService.onDidDeleteSession((session) => this._recencyHistory.remove((entry) => entry.sessionResource.toString() === session.resource.toString())));
    this._register(autorun((reader) => {
      const activeSession = this.activeSession.read(reader);
      const newSession = this.sessionsManagementService.newSession.read(reader);
      this._isNewChatSessionContext.set(activeSession === void 0 || activeSession.sessionId === newSession?.sessionId);
      setActiveSessionContextKeys(activeSession, this.contextKeyService, reader);
    }));
    this._register(autorun((reader) => {
      const activeSession = this.activeSession.read(reader);
      if (activeSession) {
        reader.store.add(this._activeSessionViewListeners(activeSession));
      }
    }));
    this._register(autorun((reader) => {
      const activeSession = this.activeSession.read(reader);
      if (activeSession && !activeSession.isRead.read(reader)) {
        this.sessionsManagementService.markRead(activeSession);
      }
    }));
    this._register(this.sessionsManagementService.onDidChangeSessions((e) => this._onDidChangeSessions(e)));
    this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => this._onDidReplaceSession(from, to)));
    this._register(this.sessionsManagementService.onWillSendRequest((session) => this._startSendFollow(session)));
    this._register(this.sessionsManagementService.onDidSendRequest(() => this._sendFollow.clear()));
    this._register(autorun((reader) => {
      const visible = this.visibleSessions.read(reader);
      const active = this._visibility.activeSession.read(reader);
      const preserveFocus = this._visibility.activePreserveFocus.read(reader);
      this.sessionsPartService.updateVisibleSessions(visible, active);
      const activeId = active?.sessionId;
      if (activeId !== this._focusedActiveSessionId) {
        this._focusedActiveSessionId = activeId;
        if (!preserveFocus) {
          this.sessionsPartService.focusSession(active);
        }
      }
    }));
    this._register(this.sessionsPartService.onDidFocusSession((sessionId) => {
      const session = this.visibleSessions.get().find((s) => s?.sessionId === sessionId);
      if (session) {
        this.setActive(session);
      }
    }));
  }
  _onDidReplaceSession(from, to) {
    this._visibility.updateSession(from, to);
  }
  _activeSessionViewListeners(activeSession) {
    const disposables = new DisposableStore();
    let wasArchived = activeSession.isArchived.get();
    disposables.add(autorun((reader) => {
      const isArchived = activeSession.isArchived.read(reader);
      if (isArchived && !wasArchived) {
        if (activeSession.isQuickChat?.read(void 0)) {
          this.openQuickChat();
        } else {
          const folderUri = activeSession.workspace.read(void 0)?.folders[0]?.root;
          this.openNewSession(folderUri ? { folderUri, ...inheritableSessionTarget(this.sessionsManagementService, activeSession, folderUri) } : void 0);
        }
      }
      wasArchived = isArchived;
    }));
    if (activeSession.status.get() !== SessionStatus.Untitled) {
      disposables.add(autorun((reader) => {
        const chats = activeSession.chats.read(reader);
        const activeChat = activeSession.activeChat.read(reader);
        if (activeChat && !chats.some((c) => this.uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
          const visible = chats.filter((c) => c.interactivity.read(reader) !== ChatInteractivity.Hidden);
          const fallback = visible[visible.length - 1] ?? activeSession.mainChat.read(reader);
          if (fallback) {
            this.openChat(activeSession, fallback.resource);
          }
        }
      }));
    }
    disposables.add(autorun((reader) => {
      const chat = activeSession.activeChat.read(reader);
      if (chat && chat.status.read(void 0) !== SessionStatus.Untitled) {
        const existing = this._sessionStates.get(activeSession.resource);
        this._sessionStates.set(activeSession.resource, {
          ...existing,
          sessionResource: activeSession.resource.toString(),
          activeChatResource: chat.resource.toString()
        });
      }
    }));
    return disposables;
  }
  _onDidChangeSessions(e) {
    const currentActive = this._visibility.activeSession.get();
    if (e.removed.length) {
      for (const session of e.removed) {
        this._sessionStates.delete(session.resource);
      }
      this._visibility.removeMany(e.removed.map((r) => r.sessionId));
    }
    if (!currentActive) {
      return;
    }
    if (e.removed.length && e.removed.some((r) => r.sessionId === currentActive.sessionId)) {
      const fallback = this._visibility.activeSession.get();
      if (fallback && this.sessionsManagementService.getSession(fallback.resource)) {
        this.openSession(fallback.resource);
      } else {
        this.openNewSession();
      }
    }
  }
  _startSendFollow(session) {
    const store = new DisposableStore();
    let followId = session.sessionId;
    store.add(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => {
      if (from.sessionId === followId) {
        followId = to.sessionId;
      }
    }));
    store.add(autorun((reader) => {
      const active = this._visibility.activeSession.read(reader);
      if (active && active.sessionId === followId) {
        const chats = active.visibleChatTabs.read(reader);
        const lastChat = chats[chats.length - 1];
        if (lastChat) {
          this._visibility.setActiveChat(active, lastChat);
        }
      }
    }));
    this._sendFollow.value = store;
  }
  getRecentlyOpenedSessions() {
    const seen = /* @__PURE__ */ new Set();
    const recent = [];
    for (const entry of this._recencyHistory.entries) {
      if (recent.length >= MAX_RECENTLY_OPENED_SESSIONS) {
        break;
      }
      const key = entry.sessionResource.toString();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const session = this.sessionsManagementService.getSession(entry.sessionResource);
      if (session) {
        recent.push(session);
      }
    }
    const other = this.sessionsManagementService.getSessions().filter((s) => !seen.has(s.resource.toString())).sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime());
    return { recent, other };
  }
  /**
   * Cancel any in-flight open-session/restore and return a fresh cancellation token.
   */
  _startOpenSession() {
    this.customViewService.hideCustomView();
    this._openSessionCts.value?.cancel();
    const cts = new CancellationTokenSource();
    this._openSessionCts.value = cts;
    return cts.token;
  }
  /**
   * Cancel an in-flight {@link restoreVisibleSessions}. Called when the user
   * explicitly navigates to a specific session, so restore stops fighting
   * the user's choice. Additive new-session operations do NOT call this.
   */
  _cancelRestore() {
    this._restoreCts.value?.cancel();
    this._restoreCts.clear();
  }
  /**
   * Make the given session active in the visibility model, optionally without
   * moving focus into it. The preserve-focus intent is published atomically
   * with the active session by the visibility model, and the model's
   * canonical active session is updated reactively by the mirror autorun.
   */
  _activate(session, preserveFocus) {
    return this._visibility.setActive(session, preserveFocus);
  }
  async openChat(session, chatUri) {
    const t0 = Date.now();
    this._cancelRestore();
    const token = this._startOpenSession();
    this.logService.trace(`[SessionsView] openChat start uri=${chatUri.toString()} provider=${session.providerId}`);
    this._activate(session);
    if (!await this._waitForSessionToLoad(session, token)) {
      this.logService.trace(`[SessionsView] openChat cancelled while waiting for session to load uri=${chatUri.toString()}`);
      return;
    }
    let chat;
    const activeSession = this._visibility.activeSession.get();
    if (activeSession) {
      chat = activeSession.chats.get().find((c) => this.uriIdentityService.extUri.isEqual(c.resource, chatUri));
      if (chat) {
        this._visibility.openChat(session, chat);
        this._visibility.setActiveChat(session, chat);
        this._setChatClosedState(session, chat, false);
      }
    }
    if (chat && chat.status.get() === SessionStatus.Untitled) {
      this.logService.trace(`[SessionsView] openChat done total=${Date.now() - t0}ms uri=${chatUri.toString()} path=untitled`);
      return;
    }
    this.logService.trace(`[SessionsView] openChat done total=${Date.now() - t0}ms uri=${chatUri.toString()}`);
  }
  async closeChat(session, chat, options) {
    this._visibility.closeChat(session, chat);
    this._setChatClosedState(session, chat, true);
    if (!options?.skipHistory) {
      this._closedItems.recordClosedChat(session, chat.resource);
    }
  }
  reopenLastClosedItem() {
    return this._closedItems.reopenLast();
  }
  /**
   * Persist a chat's closed/open state into the session's stored view state so
   * it survives switching the session out of the grid (which disposes its
   * wrapper) and reloads. Done synchronously on the close/open action rather
   * than reactively from `closedChats`, which would depend on the session's
   * chats being loaded. The main chat can never be closed and is ignored.
   */
  _setChatClosedState(session, chat, closed) {
    if (this.uriIdentityService.extUri.isEqual(chat.resource, session.mainChat.get().resource)) {
      return;
    }
    if (chat.origin?.kind === ChatOriginKind.Tool) {
      return;
    }
    const existing = this._sessionStates.get(session.resource);
    const closedSet = new Set(existing?.closedChatResources ?? []);
    const chatResource = chat.resource.toString();
    if (closed) {
      closedSet.add(chatResource);
    } else if (!closedSet.delete(chatResource)) {
      return;
    }
    this._sessionStates.set(session.resource, {
      ...existing,
      sessionResource: session.resource.toString(),
      closedChatResources: [...closedSet]
    });
  }
  async openSession(sessionResource, options) {
    this._cancelRestore();
    const token = this._startOpenSession();
    const sessionData = this._showSession(sessionResource, options);
    await this._waitForOpenSessionToLoad(sessionData, token);
  }
  showSession(sessionResource, options) {
    this._cancelRestore();
    this._startOpenSession();
    this._showSession(sessionResource, options);
  }
  _showSession(sessionResource, options) {
    const t0 = Date.now();
    const sessionData = this.sessionsManagementService.getSession(sessionResource);
    if (!sessionData) {
      this.logService.warn(`[SessionsView] openSession: session not found uri=${sessionResource.toString()}`);
      throw new Error(`Session with resource ${sessionResource.toString()} not found`);
    }
    this.logService.trace(`[SessionsView] openSession start uri=${sessionResource.toString()} provider=${sessionData.providerId}`);
    this._activate(sessionData, options?.preserveFocus);
    this.logService.trace(`[SessionsView] showSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()}`);
    return sessionData;
  }
  async _waitForOpenSessionToLoad(sessionData, token) {
    const t0 = Date.now();
    if (!await this._waitForSessionToLoad(sessionData, token)) {
      this.logService.trace(`[SessionsView] openSession cancelled while waiting for session to load uri=${sessionData.resource.toString()}`);
      return;
    }
    this.logService.trace(`[SessionsView] openSession loaded total=${Date.now() - t0}ms uri=${sessionData.resource.toString()}`);
  }
  unsetNewSession() {
    this.sessionsManagementService.discardNewSession();
    this._activate(void 0);
  }
  async openNewSession(options, token = CancellationToken.None) {
    const folderUri = options?.folderUri;
    if (folderUri) {
      const resolved = this.sessionsManagementService.resolveWorkspace(folderUri, options?.providerId);
      if (resolved?.workspace.requiresWorkspaceTrust) {
        const trusted = await this.workspaceTrustRequestService.requestResourcesTrust({
          uri: folderUri,
          message: localize("sessionsService.trustFolderMessage", "An agent session will be able to read files, run commands, and make changes in this folder.")
        });
        if (token.isCancellationRequested) {
          return { session: void 0, trustDeclined: false };
        }
        if (!trusted) {
          return { session: void 0, trustDeclined: true };
        }
      }
      if (token.isCancellationRequested) {
        return { session: void 0, trustDeclined: false };
      }
      this._startOpenSession();
      try {
        const session = this.sessionsManagementService.createNewSession(folderUri, options);
        this._activate(session);
        return { session, trustDeclined: false };
      } catch (e) {
        this.logService.trace(`[SessionsView] openNewSession: createNewSession failed for folder ${folderUri.toString()}, falling back to composer view`);
      }
    }
    if (this._visibility.activeSession.get() === void 0) {
      return { session: void 0, trustDeclined: false };
    }
    if (!folderUri) {
      this._startOpenSession();
    }
    const newSession = this.sessionsManagementService.newSession.get();
    if (newSession?.isQuickChat?.get()) {
      this.sessionsManagementService.discardNewSession(newSession);
      this._activate(void 0);
      return { session: void 0, trustDeclined: false };
    }
    this._activate(newSession ?? void 0);
    return { session: newSession ?? void 0, trustDeclined: false };
  }
  openQuickChat(options) {
    this._startOpenSession();
    try {
      const session = this.sessionsManagementService.createQuickChat(options);
      return this._activate(session);
    } catch (e) {
      this.logService.trace(`[SessionsView] openQuickChat: createQuickChat failed: ${e}`);
      return void 0;
    }
  }
  async openNewChatInSession(session, options) {
    this._cancelRestore();
    this._startOpenSession();
    const chat = await this.sessionsManagementService.createNewChatInSession(session, options);
    if (!chat) {
      return;
    }
    this._activate(session);
    this._visibility.setActiveChat(session, chat);
  }
  setActive(session) {
    this._activate(session);
  }
  async submitNewSessionInput() {
    let activeSession = this.activeSession.get();
    if (activeSession?.isCreated.get()) {
      return false;
    }
    if (!this.sessionsPartService.getSessionView(activeSession?.sessionId)) {
      await this.openNewSession();
      activeSession = this.activeSession.get();
      if (activeSession?.isCreated.get()) {
        return false;
      }
    }
    return this.sessionsPartService.getSessionView(activeSession?.sessionId)?.submitInput() ?? false;
  }
  toggleSessionStickiness(session) {
    const sticky = this._visibility.toggleStickiness(session);
    this._onDidToggleSessionStickiness.fire({ session, sticky });
  }
  insertAt(session, targetSessionId, side, activate = true) {
    this._visibility.insertAt(session, targetSessionId, side, activate);
  }
  closeSession(session) {
    const sessionId = session?.sessionId;
    const visible = this._visibility.visibleSessions.get();
    if (!visible.some((s) => s?.sessionId === sessionId)) {
      return;
    }
    const activeSessionId = this._visibility.activeSession.get()?.sessionId;
    const wasActive = activeSessionId === sessionId;
    if (session) {
      this._closedItems.recordClosedSession(session);
    }
    this.sessionsManagementService.discardNewSession(session);
    this._visibility.removeMany([sessionId]);
    if (!wasActive) {
      return;
    }
    const fallback = this._visibility.activeSession.get();
    if (fallback === void 0) {
      this.openNewSession();
    }
  }
  closeAllSessions() {
    const ids = this._visibility.visibleSessions.get().filter((s) => !!s).map((s) => s.sessionId);
    if (ids.length === 0) {
      return;
    }
    this.sessionsManagementService.discardNewSession();
    this._visibility.removeMany(ids);
  }
  _restoreInitialChat(session) {
    const chats = session.chats.get();
    let initialChat = chats[0];
    const sessionState = this._sessionStates.get(session.resource);
    if (sessionState?.activeChatResource) {
      try {
        const lastChatResource = URI.parse(sessionState.activeChatResource);
        const found = chats.find((c) => this.uriIdentityService.extUri.isEqual(c.resource, lastChatResource));
        if (found) {
          initialChat = found;
        }
      } catch (error) {
        this.logService.warn("[SessionsView] Failed to restore active chat from stored session state", error);
      }
    }
    return initialChat;
  }
  /**
   * The resource strings of chats that were closed (hidden from the tab strip)
   * when the session was last saved, so they stay hidden across reloads. Stale
   * URIs that no longer match a chat are harmless: the visible session
   * intersects them with the live chat list.
   */
  _restoreClosedChats(session) {
    return this._sessionStates.get(session.resource)?.closedChatResources ?? [];
  }
  async _waitForSessionToLoad(session, token) {
    if (!session.loading.get()) {
      return true;
    }
    if (token.isCancellationRequested) {
      return false;
    }
    await new Promise((resolve) => {
      const disposables = new DisposableStore();
      let resolved = false;
      const finish = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        disposables.dispose();
        resolve();
      };
      disposables.add(token.onCancellationRequested(finish));
      disposables.add(autorun((reader) => {
        if (!session.loading.read(reader)) {
          finish();
        }
      }));
    });
    return !token.isCancellationRequested;
  }
  _loadSessionStates() {
    const map = new ResourceMap();
    const raw = this.storageService.get(ACTIVE_SESSION_STATES_KEY, StorageScope.WORKSPACE);
    if (!raw) {
      return map;
    }
    try {
      const entries = JSON.parse(raw);
      for (const entry of entries) {
        const uri = URI.parse(entry.sessionResource);
        map.set(uri, entry);
      }
    } catch {
    }
    return map;
  }
  _saveSessionStates() {
    const entries = this._snapshotVisibleSessionStates();
    const visible = new ResourceMap();
    for (const entry of entries) {
      visible.set(URI.parse(entry.sessionResource), true);
    }
    for (const [resource, state] of this._sessionStates) {
      if (visible.has(resource)) {
        continue;
      }
      entries.push({
        sessionResource: state.sessionResource,
        activeChatResource: state.activeChatResource,
        closedChatResources: state.closedChatResources
      });
    }
    this.storageService.store(ACTIVE_SESSION_STATES_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  _snapshotVisibleSessionStates() {
    const activeId = this._visibility.activeSession.get()?.sessionId;
    const visible = this._visibility.visibleSessions.get();
    const entries = [];
    visible.forEach((session, index) => {
      if (!session) {
        return;
      }
      if (session.status.get() === SessionStatus.Untitled) {
        this._sessionStates.delete(session.resource);
        return;
      }
      const existing = this._sessionStates.get(session.resource);
      const state = {
        sessionResource: session.resource.toString(),
        activeChatResource: session.activeChat.get()?.resource.toString() ?? existing?.activeChatResource,
        closedChatResources: existing?.closedChatResources ?? session.closedChats.get().map((c) => c.resource.toString()),
        visibleOrder: index,
        isSticky: session.sticky.get(),
        isActive: session.sessionId === activeId
      };
      this._sessionStates.set(session.resource, state);
      entries.push(state);
    });
    return entries;
  }
  /**
   * The persisted visible sessions, ordered left-to-right by their stored
   * grid position.
   */
  _getVisibleSessionStates() {
    const states = [];
    for (const [, state] of this._sessionStates) {
      if (state.visibleOrder !== void 0) {
        states.push(state);
      }
    }
    return states.sort((a, b) => a.visibleOrder - b.visibleOrder);
  }
  /**
   * Wait for the session with the given resource to become available via its
   * provider, resolving with the session or `undefined` if the token is
   * cancelled before it appears. When `timeout` is given, resolves with
   * `undefined` after that many milliseconds so a persisted session that never
   * resurfaces (e.g. deleted while the window was closed) cannot keep restore
   * pending — and its provider listeners alive — indefinitely.
   */
  _waitForSession(sessionResource, token, timeout) {
    const existing = this.sessionsManagementService.getSession(sessionResource);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      let resolved = false;
      const finish = (session) => {
        if (resolved) {
          return;
        }
        resolved = true;
        disposables.dispose();
        resolve(session);
      };
      disposables.add(token.onCancellationRequested(() => finish(void 0)));
      const tryFind = () => {
        if (token.isCancellationRequested) {
          finish(void 0);
          return;
        }
        const session = this.sessionsManagementService.getSession(sessionResource);
        if (session) {
          finish(session);
        }
      };
      disposables.add(this.sessionsProvidersService.onDidChangeProviders(() => tryFind()));
      disposables.add(this.sessionsManagementService.onDidChangeSessions(() => tryFind()));
      if (timeout !== void 0) {
        disposables.add(disposableTimeout(() => finish(void 0), timeout));
      }
      tryFind();
    });
  }
  async restoreVisibleSessions() {
    try {
      await this._restoreVisibleSessions();
    } finally {
      this._initialRestoreComplete.set(true, void 0);
    }
  }
  async _restoreVisibleSessions() {
    const targets = this._getVisibleSessionStates().map((state) => ({
      resource: URI.parse(state.sessionResource),
      isSticky: !!state.isSticky,
      isActive: !!state.isActive,
      order: state.visibleOrder
    }));
    if (targets.length === 0) {
      targets.push({ resource: void 0, isSticky: false, isActive: true, order: 1 });
    }
    targets.sort((a, b) => a.order - b.order);
    let activeIdx = targets.findIndex((t) => t.isActive);
    if (activeIdx < 0) {
      activeIdx = 0;
    }
    const cts = new CancellationTokenSource();
    this._restoreCts.value = cts;
    const token = cts.token;
    const resolved = new Array(targets.length).fill(void 0);
    const place = (idx, session) => {
      let anchor;
      for (let j = idx - 1; j >= 0 && !anchor; j--) {
        const neighbour = resolved[j];
        if (neighbour !== void 0) {
          anchor = { id: neighbour?.sessionId, side: "right" };
        }
      }
      for (let j = idx + 1; j < targets.length && !anchor; j++) {
        const neighbour = resolved[j];
        if (neighbour !== void 0) {
          anchor = { id: neighbour?.sessionId, side: "left" };
        }
      }
      resolved[idx] = session;
      if (anchor) {
        this._visibility.insertAt(session, anchor.id, anchor.side, false);
      } else {
        this._activate(session);
      }
      if (targets[idx].isSticky) {
        this._visibility.toggleStickiness(session);
      }
    };
    const activeTarget = targets[activeIdx];
    const activeSessionPromise = activeTarget.resource ? this._waitForSession(activeTarget.resource, token, RESTORE_SESSION_WAIT_TIMEOUT).then((session) => session ?? void 0) : Promise.resolve(void 0);
    const activeSession = await activeSessionPromise;
    if (token.isCancellationRequested) {
      return;
    }
    const slots = [];
    let activeSlotIndex = -1;
    for (let idx = 0; idx < targets.length; idx++) {
      const target = targets[idx];
      let session;
      if (!target.resource) {
        session = null;
      } else if (idx === activeIdx) {
        session = activeSession;
      } else {
        session = this.sessionsManagementService.getSession(target.resource);
      }
      if (session === void 0) {
        continue;
      }
      resolved[idx] = session;
      if (idx === activeIdx) {
        activeSlotIndex = slots.length;
      }
      slots.push({ session: session ?? void 0, sticky: target.isSticky });
    }
    this._visibility.restoreGrid(slots, activeSlotIndex);
    if (token.isCancellationRequested) {
      return;
    }
    await Promise.all(targets.map(async (target, idx) => {
      if (idx === activeIdx || !target.resource || token.isCancellationRequested || resolved[idx] !== void 0) {
        return;
      }
      const session = await this._waitForSession(target.resource, token, RESTORE_SESSION_WAIT_TIMEOUT);
      if (!session || token.isCancellationRequested || resolved[idx] !== void 0) {
        return;
      }
      place(idx, session);
    }));
  }
  // -- Session Navigation --
  async openPreviousSession() {
    await this._navigation.goBack();
  }
  async openNextSession() {
    await this._navigation.goForward();
  }
};
SessionsService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ISessionsManagementService),
  __decorateParam(5, ISessionsProvidersService),
  __decorateParam(6, ISessionsPartService),
  __decorateParam(7, ICustomViewService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IWorkspaceTrustRequestService)
], SessionsService);
registerSingleton(ISessionsService, SessionsService, InstantiationType.Eager);
export {
  ISessionsService,
  SessionsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHNlc3Npb25zXFxicm93c2VyXFxzZXNzaW9uc1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDaGF0SW50ZXJhY3Rpdml0eSwgQ2hhdE9yaWdpbktpbmQsIElDaGF0LCBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uLCBJQ3JlYXRlTmV3Q2hhdEluU2Vzc2lvbk9wdGlvbnMsIElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgaW5oZXJpdGFibGVTZXNzaW9uVGFyZ2V0LCBJUmVjZW50bHlPcGVuZWRTZXNzaW9ucywgSVNlc3Npb25zQ2hhbmdlRXZlbnQsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBJVG9nZ2xlU2Vzc2lvblN0aWNraW5lc3NFdmVudCB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4vc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENsb3NlZEl0ZW1IaXN0b3J5IH0gZnJvbSAnLi9jbG9zZWRJdGVtSGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc05hdmlnYXRpb24gfSBmcm9tICcuL3Nlc3Npb25OYXZpZ2F0aW9uLmpzJztcbmltcG9ydCB7IFNlc3Npb25zUmVjZW5jeUhpc3RvcnkgfSBmcm9tICcuL3Nlc3Npb25zUmVjZW5jeUhpc3RvcnkuanMnO1xuaW1wb3J0IHsgVmlzaWJsZVNlc3Npb25zIH0gZnJvbSAnLi92aXNpYmxlU2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUGFydFNlcnZpY2UgfSBmcm9tICcuL3Nlc3Npb25zUGFydFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY3VzdG9tVmlldy9icm93c2VyL2N1c3RvbVZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzTmV3Q2hhdFNlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IHNldEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uQ29udGV4dEtleXMuanMnO1xuXG5jb25zdCBBQ1RJVkVfU0VTU0lPTl9TVEFURVNfS0VZID0gJ2FnZW50U2Vzc2lvbnMuYWN0aXZlU2Vzc2lvblN0YXRlcyc7XG5cbi8qKlxuICogVXBwZXIgYm91bmQgb24gaG93IGxvbmcgcmVzdG9yZSB3YWl0cyBmb3IgYSBwZXJzaXN0ZWQgc2Vzc2lvbiB0byByZXN1cmZhY2VcbiAqIHZpYSBpdHMgcHJvdmlkZXIuIEdlbmVyb3VzIChwcm92aWRlcnMgbWF5IGxvYWQgYWZ0ZXIgYXV0aCBzZXR0bGVzKSBidXQgZmluaXRlXG4gKiBzbyBhIHNlc3Npb24gdGhhdCBpcyBnb25lIGZvciBnb29kIGNhbm5vdCBrZWVwIHJlc3RvcmUgXHUyMDE0IGFuZCBpdHMgcHJvdmlkZXJcbiAqIGxpc3RlbmVycyBcdTIwMTQgYWxpdmUgaW5kZWZpbml0ZWx5LlxuICovXG5jb25zdCBSRVNUT1JFX1NFU1NJT05fV0FJVF9USU1FT1VUID0gMzBfMDAwO1xuXG4vKiogTWF4aW11bSBudW1iZXIgb2YgcmVjZW50bHkgb3BlbmVkIHNlc3Npb25zIHJlcG9ydGVkIGJ5IHtAbGluayBTZXNzaW9uc1NlcnZpY2UuZ2V0UmVjZW50bHlPcGVuZWRTZXNzaW9uc30uICovXG5jb25zdCBNQVhfUkVDRU5UTFlfT1BFTkVEX1NFU1NJT05TID0gMTA7XG5cbi8qKlxuICogT3B0aW9ucyBmb3Ige0BsaW5rIElTZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb259LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElPcGVuTmV3U2Vzc2lvbk9wdGlvbnMgZXh0ZW5kcyBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMge1xuXHQvKipcblx0ICogRm9sZGVyIHRvIGNyZWF0ZSBhIGNvbmNyZXRlIGRyYWZ0IHNlc3Npb24gZm9yLiBXaGVuIHNldCwgYSBuZXcgZHJhZnQgaXNcblx0ICogY3JlYXRlZCBhbmQgc2hvd247IHdoZW4gb21pdHRlZCwgdGhlIG5ldy1zZXNzaW9uIGNvbXBvc2VyIGlzIHNob3duXG5cdCAqIChyZXN0b3JpbmcgYW55IHBlbmRpbmcgZHJhZnQpLlxuXHQgKi9cblx0cmVhZG9ubHkgZm9sZGVyVXJpPzogVVJJO1xufVxuXG4vKipcbiAqIFJlc3VsdCBvZiB7QGxpbmsgSVNlc3Npb25zU2VydmljZS5vcGVuTmV3U2Vzc2lvbn0uIGBzZXNzaW9uYCBob2xkcyB0aGVcbiAqIGNyZWF0ZWQvcmVzdG9yZWQgZHJhZnQgb24gc3VjY2Vzcy4gYHRydXN0RGVjbGluZWRgIGlzIGB0cnVlYCBvbmx5IHdoZW4gYVxuICogYGZvbGRlclVyaWAgd2FzIHN1cHBsaWVkLCB0aGUgZm9sZGVyIHJlcXVpcmVkIHdvcmtzcGFjZSB0cnVzdCwgYW5kIHRoZVxuICogdXNlciBleHBsaWNpdGx5IGRlY2xpbmVkIGl0IFx1MjAxNCBkaXN0aW5jdCBmcm9tIGFueSBvdGhlciByZXNvbHV0aW9uL2NyZWF0aW9uXG4gKiBmYWlsdXJlICh3aGVyZSBgc2Vzc2lvbmAgaXMgYWxzbyBgdW5kZWZpbmVkYCBidXQgYHRydXN0RGVjbGluZWRgIGlzXG4gKiBgZmFsc2VgLCBzaW5jZSB0aGF0IG1heSBzdGlsbCBzdWNjZWVkIGxhdGVyIG9uY2UgYSBwcm92aWRlciByZWdpc3RlcnMpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElPcGVuTmV3U2Vzc2lvblJlc3VsdCB7XG5cdHJlYWRvbmx5IHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0cnVzdERlY2xpbmVkOiBib29sZWFuO1xufVxuXG4vKiogT3B0aW9ucyBmb3Ige0BsaW5rIElTZXNzaW9uc1NlcnZpY2UuY2xvc2VDaGF0fS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNsb3NlQ2hhdE9wdGlvbnMge1xuXHQvKipcblx0ICogRG8gbm90IHJlbWVtYmVyIHRoZSBjaGF0IGFzIHRoZSBtb3N0IHJlY2VudGx5IGNsb3NlZCBpdGVtLiBVc2VkIGJ5IGJhdGNoXG5cdCAqIGNsb3NlcyAoZS5nLiBcIkNsb3NlIEFsbCBDaGF0c1wiKSwgd2hlcmUgcmVtZW1iZXJpbmcganVzdCB0aGUgZmluYWwgY2hhdCBvZlxuXHQgKiB0aGUgYmF0Y2ggd291bGQgbWFrZSBvbmUgYXJiaXRyYXJ5IG1lbWJlciBvZiBpdCByZW9wZW5hYmxlLlxuXHQgKi9cblx0cmVhZG9ubHkgc2tpcEhpc3Rvcnk/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFBlcnNpc3RlZCBzdGF0ZSBmb3IgYSBzZXNzaW9uLlxuICogRXh0ZW5kIHRoaXMgaW50ZXJmYWNlIHRvIHN0b3JlIGFkZGl0aW9uYWwgcGVyLXNlc3Npb24gc3RhdGUgdGhhdCBzaG91bGQgYmVcbiAqIHJlbWVtYmVyZWQgYWNyb3NzIHJlc3RhcnRzLlxuICovXG5pbnRlcmZhY2UgSVNlc3Npb25TdGF0ZSB7XG5cdC8qKiBUaGUgcmVzb3VyY2UgVVJJIG9mIHRoZSBzZXNzaW9uLiAqL1xuXHRzZXNzaW9uUmVzb3VyY2U6IHN0cmluZztcblx0LyoqIFRoZSByZXNvdXJjZSBVUkkgb2YgdGhlIGxhc3QgYWN0aXZlIGNoYXQgd2l0aGluIHRoZSBzZXNzaW9uLiAqL1xuXHRhY3RpdmVDaGF0UmVzb3VyY2U/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBSZXNvdXJjZSBVUklzIG9mIGNoYXRzIHRoYXQgd2VyZSBjbG9zZWQgKGhpZGRlbiBmcm9tIHRoZSB0YWIgc3RyaXApIGF0IHNhdmVcblx0ICogdGltZS4gUmVzdG9yZWQgc28gY2xvc2VkIGNoYXRzIHN0YXkgaGlkZGVuIGFjcm9zcyByZWxvYWRzOyByZW9wZW4gdGhlbSBmcm9tXG5cdCAqIHRoZSBzZXNzaW9uIGhlYWRlcidzIGNoYXRzIGRyb3Bkb3duLlxuXHQgKi9cblx0Y2xvc2VkQ2hhdFJlc291cmNlcz86IHN0cmluZ1tdO1xuXHQvKiogV2hldGhlciB0aGlzIHNlc3Npb24gd2FzIHRoZSBhY3RpdmUgc2Vzc2lvbiBhdCB0aGUgdGltZSBvZiBzYXZlLiAqL1xuXHRpc0FjdGl2ZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBQb3NpdGlvbiAobGVmdC10by1yaWdodCkgb2YgdGhlIHNlc3Npb24gaW4gdGhlIGdyaWQgYXQgc2F2ZSB0aW1lLCB3aGVuXG5cdCAqIHRoZSBzZXNzaW9uIHdhcyB2aXNpYmxlLiBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uIHdhcyBub3QgdmlzaWJsZS5cblx0ICovXG5cdHZpc2libGVPcmRlcj86IG51bWJlcjtcblx0LyoqIFdoZXRoZXIgdGhlIHNlc3Npb24gd2FzIHBpbm5lZCAoc3RpY2t5KSBpbiB0aGUgZ3JpZCBhdCBzYXZlIHRpbWUuICovXG5cdGlzU3RpY2t5PzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBPd25zIHRoZSB2aXNpYmxlIHNlc3Npb25zIHNob3duIGluIHRoZSBzZXNzaW9ucyBwYXJ0J3MgZ3JpZCBhbmQgZXZlcnl0aGluZ1xuICogdGhhdCBkcml2ZXMgdGhlbTogb3BlbmluZyBzZXNzaW9ucy9jaGF0cywgdGhlIG5ldy1zZXNzaW9uIGNvbXBvc2VyIHZpZXcsXG4gKiBncmlkIGFycmFuZ2VtZW50IChpbnNlcnQgLyBzdGlja2luZXNzIC8gY2xvc2UpLCBCYWNrL0ZvcndhcmQgbmF2aWdhdGlvbixcbiAqIGZvY3VzLCBhbmQgcGVyLXNlc3Npb24gdmlldyBwZXJzaXN0ZW5jZSAocmVzdG9yZSkuXG4gKlxuICogVGhpcyBpcyB0aGUgKnZpZXcqIGNvdW50ZXJwYXJ0IHRvIHRoZSAqbW9kZWwqXG4gKiB7QGxpbmsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2V9OiBpdCByZWZsZWN0cyBtb2RlbCBjaGFuZ2VzIHJlYWN0aXZlbHkgYW5kXG4gKiBvd25zIHRoZSB7QGxpbmsgYWN0aXZlU2Vzc2lvbn0gKHRoZSB2aXNpYmxlIGFjdGl2ZSBzbG90KS4gSXQgbmV2ZXIgcGVyZm9ybXNcbiAqIG1vZGVsIGxpZmVjeWNsZSBvcGVyYXRpb25zIChjcmVhdGluZyBzZXNzaW9ucywgc2VuZGluZyByZXF1ZXN0cywgQ1JVRClcbiAqIGl0c2VsZiBcdTIwMTQgdGhvc2Ugc3RheSBpbiB0aGUgbWFuYWdlbWVudCBzZXJ2aWNlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uc1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIE9ic2VydmFibGUgZm9yIHRoZSBjdXJyZW50bHkgYWN0aXZlIHNlc3Npb24gYXMge0BsaW5rIElBY3RpdmVTZXNzaW9ufSxcblx0ICogb3IgYHVuZGVmaW5lZGAgZm9yIHRoZSBuZXctc2Vzc2lvbiAoZW1wdHkpIHNsb3QuXG5cdCAqXG5cdCAqIFRoaXMgaXMgdGhlIGNhbm9uaWNhbCBhY3RpdmUgc2Vzc2lvbjogaXQgcmVmbGVjdHMgdGhlIHZpc2libGUgYWN0aXZlIHNsb3Rcblx0ICogaW4gdGhlIGdyaWQuIFRoZSBzcGxpdCBtaXJyb3JzIGBJRWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JgICh2aWV3IG93bnNcblx0ICogdGhlIGFjdGl2ZSBlZGl0b3IpIHZzIHRoZSBzZXNzaW9uIG1vZGVsIGluXG5cdCAqIHtAbGluayBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZX0uXG5cdCAqL1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uOiBJT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIE9ic2VydmFibGUgbGlzdCBvZiBzbG90cyBjdXJyZW50bHkgZGlzcGxheWVkIGluIHRoZSBzZXNzaW9ucyBwYXJ0J3Ncblx0ICogZ3JpZCwgaW4gdGhlaXIgZ3JpZCBvcmRlciAobGVmdC10by1yaWdodCkuIEVhY2ggZW50cnkgaXMgZWl0aGVyIGFuXG5cdCAqIHtAbGluayBJQWN0aXZlU2Vzc2lvbn0gb3IgYHVuZGVmaW5lZGAgZm9yIHRoZSBlbXB0eSAobmV3LXNlc3Npb24pXG5cdCAqIHBsYWNlaG9sZGVyLiBBdCBtb3N0IG9uZSBlbnRyeSBpcyBgdW5kZWZpbmVkYCBhdCBhIHRpbWUuIFNlc3Npb25zXG5cdCAqIHBpbm5lZCB2aWEge0BsaW5rIHRvZ2dsZVNlc3Npb25TdGlja2luZXNzfSBhcmUgc3RpY2t5OyB0aGUgcmVtYWluaW5nXG5cdCAqIG5vbi1zdGlja3kgZW50cmllcyBnZXQgcmVwbGFjZWQgd2hlbiBuZXcgc2Vzc2lvbnMgYXJlIG9wZW5lZC5cblx0ICovXG5cdHJlYWRvbmx5IHZpc2libGVTZXNzaW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPjtcblxuXHQvKiogV2hldGhlciB0aGUgaW5pdGlhbCBwZXJzaXN0ZWQgdmlzaWJsZS1zZXNzaW9uIHJlc3RvcmUgaGFzIHNldHRsZWQuICovXG5cdHJlYWRvbmx5IGluaXRpYWxSZXN0b3JlQ29tcGxldGU6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdC8qKiBGaXJlcyBhZnRlciBhIHNlc3Npb24ncyBzdGlja2luZXNzIHdhcyB0b2dnbGVkIHZpYSB7QGxpbmsgdG9nZ2xlU2Vzc2lvblN0aWNraW5lc3N9LiAqL1xuXHRyZWFkb25seSBvbkRpZFRvZ2dsZVNlc3Npb25TdGlja2luZXNzOiBFdmVudDxJVG9nZ2xlU2Vzc2lvblN0aWNraW5lc3NFdmVudD47XG5cblx0LyoqXG5cdCAqIEdldCBhbGwgc2Vzc2lvbnMgZnJvbSBhbGwgcmVnaXN0ZXJlZCBwcm92aWRlcnMsIHNwbGl0IGludG8gdHdvIGdyb3Vwczpcblx0ICogLSBgcmVjZW50YDogc2Vzc2lvbnMgb3BlbmVkIGluIHRoaXMgd29ya3NwYWNlLCBtb3N0IHJlY2VudGx5IG9wZW5lZCBmaXJzdCxcblx0ICogICBjYXBwZWQgYXQgYSBmaXhlZCBtYXhpbXVtLlxuXHQgKiAtIGBvdGhlcmA6IHRoZSByZW1haW5pbmcgc2Vzc2lvbnMsIHNvcnRlZCBieSB0aGVpciBsYXN0IHVwZGF0ZSB0aW1lIChtb3N0XG5cdCAqICAgcmVjZW50bHkgdXBkYXRlZCBmaXJzdCkuXG5cdCAqXG5cdCAqIFVzZWQgdG8gcG9wdWxhdGUgdGhlIHNlc3Npb25zIHBpY2tlci5cblx0ICovXG5cdGdldFJlY2VudGx5T3BlbmVkU2Vzc2lvbnMoKTogSVJlY2VudGx5T3BlbmVkU2Vzc2lvbnM7XG5cblx0LyoqXG5cdCAqIFN5bmNocm9ub3VzbHkgc2VsZWN0IGFuIGV4aXN0aW5nIHNlc3Npb24gYXMgYWN0aXZlIGFuZCBzaG93IGl0IGluIHRoZSBncmlkXG5cdCAqIHdpdGhvdXQgd2FpdGluZyBmb3IgaXRzIHByb3ZpZGVyLWJhY2tlZCBzdGF0ZSB0byBsb2FkLlxuXHQgKi9cblx0c2hvd1Nlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdGlvbnM/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBTZWxlY3QgYW4gZXhpc3Rpbmcgc2Vzc2lvbiBhcyB0aGUgYWN0aXZlIHNlc3Npb24gYW5kIHNob3cgaXQgaW4gdGhlIGdyaWQuXG5cdCAqIFdoZW4gYG9wdGlvbnMucHJlc2VydmVGb2N1c2AgaXMgc2V0LCB0aGUgc2Vzc2lvbiBpcyBzaG93biB3aXRob3V0IG1vdmluZ1xuXHQgKiBrZXlib2FyZCBmb2N1cyBpbnRvIGl0LlxuXHQgKi9cblx0b3BlblNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdGlvbnM/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBPcGVuIGEgc3BlY2lmaWMgY2hhdCB3aXRoaW4gYSBzZXNzaW9uIGFuZCBzaG93IGl0IGluIHRoZSBncmlkLlxuXHQgKi9cblx0b3BlbkNoYXQoc2Vzc2lvbjogSVNlc3Npb24sIGNoYXRVcmk6IFVSSSk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIENsb3NlIGEgY2hhdCBmcm9tIHRoZSBzZXNzaW9uIHZpZXcuIFRoZSBjaGF0IGlzIGhpZGRlbiBmcm9tIHRoZSB0YWIgc3RyaXBcblx0ICogYW5kIGNhbiBiZSByZW9wZW5lZCBmcm9tIHRoZSBzZXNzaW9uIGhlYWRlcidzIGNoYXRzIGRyb3Bkb3duLlxuXHQgKi9cblx0Y2xvc2VDaGF0KHNlc3Npb246IElBY3RpdmVTZXNzaW9uLCBjaGF0OiBJQ2hhdCwgb3B0aW9ucz86IElDbG9zZUNoYXRPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogUmVvcGVuIHRoZSBzaW5nbGUgbW9zdCByZWNlbnRseSBjbG9zZWQgY2hhdCBvciBzZXNzaW9uIGFuZCBmb2N1cyBpdC5cblx0ICpcblx0ICogQSBjbG9zZWQgY2hhdCBpcyB1bi1oaWRkZW4gaW4gaXRzIHNlc3Npb24uIEEgc2Vzc2lvbiB0aGF0IHdhcyBjbG9zZWRcblx0ICogZXhwbGljaXRseSByZXR1cm5zIHRvIHRoZSBncmlkIGF0IHRoZSBpbmRleCBpdCBvY2N1cGllZDsgYSBzZXNzaW9uIHRoYXRcblx0ICogd2FzIHB1c2hlZCBvdXQgb2YgdGhlIGdyaWQgYnkgYSBuZXdseSBvcGVuZWQgb25lIHRha2VzIGl0cyBzbG90IGJhY2ssXG5cdCAqIHJlbW92aW5nIHRoZSBzZXNzaW9uIHRoYXQgcmVwbGFjZWQgaXQuXG5cdCAqXG5cdCAqIFRoZSBlbnRyeSBpcyBjb25zdW1lZCwgc28gcHJlc3NpbmcgdGhlIHNob3J0Y3V0IHJlcGVhdGVkbHkgZG9lcyBub3Qgd2Fsa1xuXHQgKiBmdXJ0aGVyIGJhY2sgdGhyb3VnaCBoaXN0b3J5LiBOby1vcCB3aGVuIG5vdGhpbmcgaXMgcmVtZW1iZXJlZC5cblx0ICovXG5cdHJlb3Blbkxhc3RDbG9zZWRJdGVtKCk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIE9wZW4gdGhlIG5ldy1zZXNzaW9uIGNvbXBvc2VyLlxuXHQgKlxuXHQgKiAtIFdpdGhvdXQgYG9wdGlvbnMuZm9sZGVyVXJpYDogc3dpdGNoIHRvIHRoZSBuZXctc2Vzc2lvbiB2aWV3LCByZXN0b3Jpbmdcblx0ICogICB0aGUgcGVuZGluZyAoY29tcG9zZWQtYnV0LW5vdC1zZW50KSBkcmFmdCBpZiBvbmUgZXhpc3RzLCBvdGhlcndpc2Vcblx0ICogICBzaG93aW5nIHRoZSBlbXB0eSBwbGFjZWhvbGRlci4gTm8tb3Agd2hlbiB0aGUgZW1wdHkgcGxhY2Vob2xkZXIgaXNcblx0ICogICBhbHJlYWR5IHNob3dpbmcgKG5vIHNlc3Npb24gYWN0aXZlKS4gUmV0dXJucyB0aGUgcmVzdG9yZWQgcGVuZGluZ1xuXHQgKiAgIGRyYWZ0IGFzIGByZXN1bHQuc2Vzc2lvbmAsIG9yIGB1bmRlZmluZWRgIHdoZW4gbm9uZTsgYHRydXN0RGVjbGluZWRgXG5cdCAqICAgaXMgYWx3YXlzIGBmYWxzZWAuXG5cdCAqIC0gV2l0aCBgb3B0aW9ucy5mb2xkZXJVcmlgOiByZXNvbHZlIHRoZSB3b3Jrc3BhY2UgYW5kLCB3aGVuIGl0IHJlcXVpcmVzXG5cdCAqICAgd29ya3NwYWNlIHRydXN0LCBwcm9tcHQgZm9yIGl0IGZpcnN0IChzaW5nbGUgZ2F0ZSBmb3IgZXZlcnkgcGF0aCB0aGF0XG5cdCAqICAgY3JlYXRlcyBhIGNvbmNyZXRlIHNlc3Npb24gZm9yIGEgZm9sZGVyKS4gSWYgdHJ1c3QgaXMgZGVjbGluZWQsXG5cdCAqICAgcmV0dXJucyBgeyBzZXNzaW9uOiB1bmRlZmluZWQsIHRydXN0RGVjbGluZWQ6IHRydWUgfWAgd2l0aG91dFxuXHQgKiAgIGNyZWF0aW5nIGEgc2Vzc2lvbi4gT3RoZXJ3aXNlIGNyZWF0ZXMgYSBjb25jcmV0ZSBkcmFmdCBzZXNzaW9uIGZvclxuXHQgKiAgIHRoYXQgZm9sZGVyICh2aWEge0BsaW5rIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmNyZWF0ZU5ld1Nlc3Npb259KVxuXHQgKiAgIGFuZCBzaG93cyBpdCBhcyB0aGUgYWN0aXZlIHNlc3Npb24sIHJldHVybmluZyBpdCBhcyBgcmVzdWx0LnNlc3Npb25gLlxuXHQgKi9cblx0b3Blbk5ld1Nlc3Npb24ob3B0aW9ucz86IElPcGVuTmV3U2Vzc2lvbk9wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElPcGVuTmV3U2Vzc2lvblJlc3VsdD47XG5cblx0LyoqXG5cdCAqIE9wZW4gYSBuZXcgKipxdWljayBjaGF0Kio6IGNyZWF0ZSBhIGNvbmNyZXRlIHdvcmtzcGFjZS1sZXNzIGRyYWZ0IHNlc3Npb25cblx0ICogKHZpYSB7QGxpbmsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuY3JlYXRlUXVpY2tDaGF0fSkgYW5kIHNob3cgaXQgYXMgdGhlXG5cdCAqIGFjdGl2ZSBzZXNzaW9uLiBSZXR1cm5zIHRoZSBhY3RpdmF0ZWQgc2Vzc2lvbiwgb3IgYHVuZGVmaW5lZGAgd2hlbiBub1xuXHQgKiBwcm92aWRlciBzdXBwb3J0cyBxdWljayBjaGF0cy5cblx0ICovXG5cdG9wZW5RdWlja0NoYXQob3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTd2l0Y2ggdG8gdGhlIG5ldy1jaGF0LWluLXNlc3Npb24gdmlldy5cblx0ICogQWRkcyBhIG5ldyBjaGF0IHRvIHRoZSBzZXNzaW9uIHZpYSB0aGUgcHJvdmlkZXIsIG1ha2VzIGl0IHRoZSBhY3RpdmUgY2hhdCxcblx0ICogYW5kIHNob3dzIGEgcmljaCBpbnB1dCBmb3IgY29tcG9zaW5nIGEgbWVzc2FnZS4gUGFzc1xuXHQgKiB7QGxpbmsgSUNyZWF0ZU5ld0NoYXRJblNlc3Npb25PcHRpb25zLmZvcmNlTmV3fSB0byBhbHdheXMgY3JlYXRlIGEgZnJlc2hcblx0ICogY2hhdCAoZS5nLiB3aGVuIHJlc2V0dGluZyB0aGUgY29tcG9zZXIgcmlnaHQgYWZ0ZXIgYSBiYWNrZ3JvdW5kIHNlbmQpLlxuXHQgKi9cblx0b3Blbk5ld0NoYXRJblNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24sIG9wdGlvbnM/OiBJQ3JlYXRlTmV3Q2hhdEluU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBEaXNjYXJkIHRoZSBwZW5kaW5nIG5ldyBzZXNzaW9uIGFuZCBjbGVhciB0aGUgYWN0aXZlIHNlc3Npb24sIHJldHVybmluZ1xuXHQgKiB0byB0aGUgZW1wdHkgbmV3LXNlc3Npb24gcGxhY2Vob2xkZXIuXG5cdCAqL1xuXHR1bnNldE5ld1Nlc3Npb24oKTogdm9pZDtcblxuXHQvKipcblx0ICogSW5zZXJ0IChvciBtb3ZlKSBhIHNlc3Npb24gaW50byB0aGUgZ3JpZCBwb3NpdGlvbmVkIG5leHQgdG8gYSB0YXJnZXRcblx0ICogc2Vzc2lvbiB0aGF0IGlzIGFscmVhZHkgdmlzaWJsZS5cblx0ICovXG5cdGluc2VydEF0KHNlc3Npb246IElTZXNzaW9uLCB0YXJnZXRTZXNzaW9uSWQ6IHN0cmluZywgc2lkZTogJ2xlZnQnIHwgJ3JpZ2h0JywgYWN0aXZhdGU/OiBib29sZWFuKTogdm9pZDtcblxuXHQvKipcblx0ICogVG9nZ2xlIGEgc2Vzc2lvbidzIHN0aWNraW5lc3MgaW4gdGhlIGdyaWQuIFRoZSBzZXNzaW9uIGtlZXBzIGl0cyBncmlkXG5cdCAqIHNsb3Qgd2hlbiB0b2dnbGVkLiBJZiB0aGUgc2Vzc2lvbiBpcyBub3QgY3VycmVudGx5IHZpc2libGUsIGl0IGlzXG5cdCAqIGFwcGVuZGVkIHRvIHRoZSBncmlkIGFzIHN0aWNreS5cblx0ICovXG5cdHRvZ2dsZVNlc3Npb25TdGlja2luZXNzKHNlc3Npb246IElTZXNzaW9uKTogdm9pZDtcblxuXHQvKipcblx0ICogQ2xvc2UgYSBzZXNzaW9uOiByZW1vdmUgaXQgZnJvbSB0aGUgZ3JpZC4gSWYgaXQgd2FzIHRoZSBhY3RpdmUgb25lLCB0aGVcblx0ICogcHJldmlvdXMgdmlzaWJsZSBzZXNzaW9uIGJlY29tZXMgYWN0aXZlOyBpZiBubyBzZXNzaW9uIHJlbWFpbnMgdmlzaWJsZSxcblx0ICogdGhlIG5ldy1zZXNzaW9uIHZpZXcgaXMgb3BlbmVkLiBQYXNzaW5nIGB1bmRlZmluZWRgIGNsb3NlcyB0aGUgZW1wdHlcblx0ICogKG5ldy1zZXNzaW9uKSBzbG90IGlmIGl0IGlzIGN1cnJlbnRseSB2aXNpYmxlLlxuXHQgKi9cblx0Y2xvc2VTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZDtcblxuXHQvKipcblx0ICogQ2xvc2UgYWxsIHNlc3Npb25zIGN1cnJlbnRseSBzaG93biBpbiB0aGUgZ3JpZCBhbmQgbGFuZCBvbiB0aGVcblx0ICogbmV3LXNlc3Npb24gdmlldy4gTm8tb3Agd2hlbiBubyBzZXNzaW9uIGlzIGN1cnJlbnRseSB2aXNpYmxlLlxuXHQgKi9cblx0Y2xvc2VBbGxTZXNzaW9ucygpOiB2b2lkO1xuXG5cdC8qKiBNYWtlIHRoZSBnaXZlbiAoYWxyZWFkeSB2aXNpYmxlKSBzZXNzaW9uIHRoZSBhY3RpdmUgc2Vzc2lvbi4gKi9cblx0c2V0QWN0aXZlKHNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZDtcblxuXHQvKiogU3VibWl0IHRoZSBsaXZlIGlucHV0IGluIHRoZSBhY3RpdmUgbmV3LXNlc3Npb24gY29tcG9zZXIuICovXG5cdHN1Ym1pdE5ld1Nlc3Npb25JbnB1dCgpOiBQcm9taXNlPGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBSZXN0b3JlIHRoZSBzZXNzaW9ucyB0aGF0IHdlcmUgdmlzaWJsZSBpbiB0aGUgZ3JpZCBmcm9tIHBlcnNpc3RlZCBzdGF0ZS5cblx0ICogUmVzdG9yZXMgdGhlaXIgb3JkZXIsIHN0aWNreSAocGlubmVkKSBzdGF0ZSBhbmQgdGhlIGFjdGl2ZSBzZXNzaW9uLFxuXHQgKiB3YWl0aW5nIHVudGlsIGVhY2ggc2Vzc2lvbidzIHByb3ZpZGVyIG1ha2VzIGl0IGF2YWlsYWJsZS4gRmFsbHMgYmFjayB0b1xuXHQgKiB0aGUgbmV3LXNlc3Npb24gdmlldyB3aGVuIG5vdGhpbmcgY2FuIGJlIHJlc3RvcmVkLlxuXHQgKi9cblx0cmVzdG9yZVZpc2libGVTZXNzaW9ucygpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKiBOYXZpZ2F0ZSB0byB0aGUgcHJldmlvdXMgc2Vzc2lvbiBpbiB0aGUgbmF2aWdhdGlvbiBoaXN0b3J5LiAqL1xuXHRvcGVuUHJldmlvdXNTZXNzaW9uKCk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqIE5hdmlnYXRlIHRvIHRoZSBuZXh0IHNlc3Npb24gaW4gdGhlIG5hdmlnYXRpb24gaGlzdG9yeS4gKi9cblx0b3Blbk5leHRTZXNzaW9uKCk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjb25zdCBJU2Vzc2lvbnNTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElTZXNzaW9uc1NlcnZpY2U+KCdzZXNzaW9uc1NlcnZpY2UnKTtcblxuZXhwb3J0IGNsYXNzIFNlc3Npb25zU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRvZ2dsZVNlc3Npb25TdGlja2luZXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRvZ2dsZVNlc3Npb25TdGlja2luZXNzRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRvZ2dsZVNlc3Npb25TdGlja2luZXNzOiBFdmVudDxJVG9nZ2xlU2Vzc2lvblN0aWNraW5lc3NFdmVudD4gPSB0aGlzLl9vbkRpZFRvZ2dsZVNlc3Npb25TdGlja2luZXNzLmV2ZW50O1xuXG5cdC8qKiBPd25zIHRoZSBhY3RpdmUvc3RpY2t5L3RyYW5zaWVudCB2aXNpYmlsaXR5IG1vZGVsIGFuZCB0aGUge0BsaW5rIElBY3RpdmVTZXNzaW9ufSB3cmFwcGVycy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJpbGl0eTogVmlzaWJsZVNlc3Npb25zO1xuXHRyZWFkb25seSB2aXNpYmxlU2Vzc2lvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT47XG5cblx0LyoqIFJlbWVtYmVycyB0aGUgc2luZ2xlIG1vc3QgcmVjZW50bHkgY2xvc2VkIGNoYXQgb3Igc2Vzc2lvbiBmb3Ige0BsaW5rIHJlb3Blbkxhc3RDbG9zZWRJdGVtfS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2xvc2VkSXRlbXM6IENsb3NlZEl0ZW1IaXN0b3J5O1xuXG5cdC8qKiBUaGUgY2Fub25pY2FsIGFjdGl2ZSBzZXNzaW9uIFx1MjAxNCB0aGUgdmlzaWJsZSBhY3RpdmUgc2xvdC4gKi9cblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0aWFsUmVzdG9yZUNvbXBsZXRlID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0cmVhZG9ubHkgaW5pdGlhbFJlc3RvcmVDb21wbGV0ZTogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9pbml0aWFsUmVzdG9yZUNvbXBsZXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzTmV3Q2hhdFNlc3Npb25Db250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHQvKiogQ2FuY2VsbGVkIG9uIGV2ZXJ5IG5hdmlnYXRpb24gYWN0aW9uIHNvIGluLWZsaWdodCBhc3luYyBvcGVucyBiYWlsIG91dC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb3BlblNlc3Npb25DdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHQvKipcblx0ICogQ2FuY2VsbGF0aW9uIGZvciB0aGUgaW4tZmxpZ2h0IHtAbGluayByZXN0b3JlVmlzaWJsZVNlc3Npb25zfS4gS2VwdFxuXHQgKiBzZXBhcmF0ZSBmcm9tIHtAbGluayBfb3BlblNlc3Npb25DdHN9IHNvIHRoYXQgYWRkaXRpdmUgbmV3LXNlc3Npb25cblx0ICogb3BlcmF0aW9ucyAodGhlIG5ldy1jaGF0IGNvbXBvc2VyIGVhZ2VybHkgY3JlYXRpbmcgYSBkcmFmdCBvbiBzdGFydHVwKVxuXHQgKiBkbyBub3QgYWJvcnQgcmVzdG9yaW5nIHRoZSBwcmV2aW91c2x5IHZpc2libGUgZ3JpZC4gT25seSBhbiBleHBsaWNpdFxuXHQgKiBuYXZpZ2F0aW9uIHRvIGEgc3BlY2lmaWMgc2Vzc2lvbiBjYW5jZWxzIGEgcmVzdG9yZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3RvcmVDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZXM6IFJlc291cmNlTWFwPElTZXNzaW9uU3RhdGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9uYXZpZ2F0aW9uOiBTZXNzaW9uc05hdmlnYXRpb247XG5cdC8qKlxuXHQgKiBUaGUgc2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3Igc2Vzc2lvbiByZWNlbmN5IChtb3N0LXJlY2VudGx5LW9wZW5lZFxuXHQgKiBmaXJzdCksIHBlcnNpc3RlZCBhY3Jvc3MgcmVzdGFydHMuIEJvdGggdGhlIHJlY2VudC1zZXNzaW9ucyBwaWNrZXIgKHZpYVxuXHQgKiB7QGxpbmsgZ2V0UmVjZW50bHlPcGVuZWRTZXNzaW9uc30pIGFuZCB7QGxpbmsgU2Vzc2lvbnNOYXZpZ2F0aW9ufSBidWlsZCBvblxuXHQgKiB0b3Agb2YgaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNlbmN5SGlzdG9yeTogU2Vzc2lvbnNSZWNlbmN5SGlzdG9yeTtcblxuXHQvKipcblx0ICogU2Vzc2lvbiBpZCAob3IgYHVuZGVmaW5lZGAgZm9yIHRoZSBuZXctc2Vzc2lvbiBzbG90KSB0aGF0IGZvY3VzIHdhcyBsYXN0XG5cdCAqIG1vdmVkIGludG8gaW4gcmVzcG9uc2UgdG8gYW4gYWN0aXZlLXNlc3Npb24gY2hhbmdlLiBUcmFja3MgdGhlIGFjdGl2ZSBpZFxuXHQgKiBzbyB1bnJlbGF0ZWQgdmlzaWJpbGl0eSB1cGRhdGVzIGRvbid0IHJlLWZvY3VzIGFuZCBzdGVhbCBmb2N1cy5cblx0ICovXG5cdHByaXZhdGUgX2ZvY3VzZWRBY3RpdmVTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKiogVGhlIGluLWZsaWdodCBmb3JlZ3JvdW5kIHNlbmQncyBcImtlZXAgbmV3ZXN0IGNoYXQgYWN0aXZlXCIgZm9sbG93LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZW5kRm9sbG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1BhcnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNQYXJ0U2VydmljZTogSVNlc3Npb25zUGFydFNlcnZpY2UsXG5cdFx0QElDdXN0b21WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbVZpZXdTZXJ2aWNlOiBJQ3VzdG9tVmlld1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBMb2FkIHBlcnNpc3RlZCBzdGF0ZVxuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZXMgPSB0aGlzLl9sb2FkU2Vzc2lvblN0YXRlcygpO1xuXG5cdFx0Ly8gVmlzaWJpbGl0eSBtb2RlbCBcdTIwMTQgb3ducyB3cmFwcGVycywgYWN0aXZlL3N0aWNreS90cmFuc2llbnQgc3RhdGUsIGFuZFxuXHRcdC8vIG9ic2VydmFibGVzIGV4cG9zZWQgdG8gdGhlIFVJLlxuXHRcdHRoaXMuX3Zpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0VmlzaWJsZVNlc3Npb25zLFxuXHRcdFx0c2Vzc2lvbiA9PiB0aGlzLl9yZXN0b3JlSW5pdGlhbENoYXQoc2Vzc2lvbiksXG5cdFx0XHRzZXNzaW9uID0+IHRoaXMuX3Jlc3RvcmVDbG9zZWRDaGF0cyhzZXNzaW9uKSxcblx0XHRcdChyZXBsYWNlZCwgaW5kZXgsIHN0aWNreSwgcmVwbGFjZWRCeVNlc3Npb25JZCkgPT4gdGhpcy5fY2xvc2VkSXRlbXMucmVjb3JkUmVwbGFjZWRTbG90KHJlcGxhY2VkLCBpbmRleCwgc3RpY2t5LCByZXBsYWNlZEJ5U2Vzc2lvbklkKSxcblx0XHQpKTtcblx0XHR0aGlzLnZpc2libGVTZXNzaW9ucyA9IHRoaXMuX3Zpc2liaWxpdHkudmlzaWJsZVNlc3Npb25zO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Zpc2liaWxpdHkuYWN0aXZlU2Vzc2lvbjtcblxuXHRcdHRoaXMuX2Nsb3NlZEl0ZW1zID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENsb3NlZEl0ZW1IaXN0b3J5LFxuXHRcdFx0dGhpcy5fdmlzaWJpbGl0eSxcblx0XHRcdChzZXNzaW9uLCBjaGF0UmVzb3VyY2UpID0+IHRoaXMub3BlbkNoYXQoc2Vzc2lvbiwgY2hhdFJlc291cmNlKSxcblx0XHQpKTtcblxuXHRcdC8vIEJpbmQgYWN0aXZlLXNlc3Npb24gY29udGV4dCBrZXlzLiBUaGVzZSByZWZsZWN0IHRoZSB2aXNpYmxlIGFjdGl2ZVxuXHRcdC8vIHNsb3QgKHRoZSB2aWV3J3MgYGFjdGl2ZVNlc3Npb25gKTsgYGlzTmV3Q2hhdFNlc3Npb25gIGFsc28gY29uc3VsdHNcblx0XHQvLyB0aGUgbW9kZWwncyBpbi1wcm9ncmVzcyBkcmFmdCAoYG5ld1Nlc3Npb25gKS5cblx0XHR0aGlzLl9pc05ld0NoYXRTZXNzaW9uQ29udGV4dCA9IElzTmV3Q2hhdFNlc3Npb25Db250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIFNhdmUgb24gc2h1dGRvd25cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB0aGlzLl9zYXZlU2Vzc2lvblN0YXRlcygpKSk7XG5cblx0XHQvLyBTZXNzaW9uIHJlY2VuY3kgaGlzdG9yeSBcdTIwMTQgdGhlIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIFwicmVjZW50bHlcblx0XHQvLyBvcGVuZWRcIiBvcmRlcmluZywgc2hhcmVkIGJ5IHRoZSBwaWNrZXIgYW5kIG5hdmlnYXRpb24uXG5cdFx0dGhpcy5fcmVjZW5jeUhpc3RvcnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Vzc2lvbnNSZWNlbmN5SGlzdG9yeShcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHQvLyBTZXNzaW9uIG5hdmlnYXRpb24gaGlzdG9yeSAoQmFjay9Gb3J3YXJkKSBidWlsZHMgb24gdGhlIHJlY2VuY3kgaGlzdG9yeS5cblx0XHR0aGlzLl9uYXZpZ2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNlc3Npb25zTmF2aWdhdGlvbihcblx0XHRcdHRoaXMsXG5cdFx0XHR0aGlzLmFjdGl2ZVNlc3Npb24sXG5cdFx0XHR0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHR0aGlzLl9yZWNlbmN5SGlzdG9yeSxcblx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UsXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB0aGlzLl9uYXZpZ2F0aW9uLm9uRGlkUmVtb3ZlU2Vzc2lvbnMoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWREZWxldGVTZXNzaW9uKHNlc3Npb24gPT4gdGhpcy5fcmVjZW5jeUhpc3RvcnkucmVtb3ZlKGVudHJ5ID0+IGVudHJ5LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID09PSBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkpKSk7XG5cblx0XHQvLyBLZWVwIHRoZSBhY3RpdmUtc2Vzc2lvbiBjb250ZXh0IGtleXMgaW4gc3luYyB3aXRoIHRoZSB2aXNpYmxlIGFjdGl2ZVxuXHRcdC8vIHNsb3QgYW5kIHRoZSBtb2RlbCdzIGluLXByb2dyZXNzIGRyYWZ0LiBUaGUgaGVscGVyIHJlYWRzIHRoZSBzZXNzaW9uJ3Ncblx0XHQvLyBvYnNlcnZhYmxlIHByb3BlcnRpZXMgdmlhIGByZWFkZXJgLCBzbyB0aGlzIGF1dG9ydW4gcmUtYXBwbGllcyB0aGUga2V5c1xuXHRcdC8vIHdoZW5ldmVyIGFueSBvZiB0aGVtIGNoYW5nZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UubmV3U2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHQvLyBgaXNOZXdDaGF0U2Vzc2lvbmAgaXMgdHJ1ZSB3aGVuIG5vIGFjdGl2ZSBzZXNzaW9uIGV4aXN0cywgT1Igd2hlbiB0aGVcblx0XHRcdC8vIGFjdGl2ZSBzZXNzaW9uIGlzIHN0aWxsIHRoZSBpbi1wcm9ncmVzcyBuZXcgc2Vzc2lvbiAoY3JlYXRlZCBidXQgbm90IHlldFxuXHRcdFx0Ly8gc2VudCBmb3IgdGhlIGZpcnN0IHRpbWUpLiBTY29waW5nIHRvIHRoZSBhY3RpdmUgc2Vzc2lvbiBhdm9pZHMgZmxpcHBpbmdcblx0XHRcdC8vIGludG8gXCJuZXcgY2hhdFwiIG1vZGUgd2hpbGUgdmlld2luZyBhIGRpZmZlcmVudCBlc3RhYmxpc2hlZCBzZXNzaW9uLlxuXHRcdFx0dGhpcy5faXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQuc2V0KGFjdGl2ZVNlc3Npb24gPT09IHVuZGVmaW5lZCB8fCBhY3RpdmVTZXNzaW9uLnNlc3Npb25JZCA9PT0gbmV3U2Vzc2lvbj8uc2Vzc2lvbklkKTtcblx0XHRcdHNldEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cyhhY3RpdmVTZXNzaW9uLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFBlci1hY3RpdmUtc2Vzc2lvbiB2aWV3IHJlYWN0aW9ucyAoYXJjaGl2ZWQgXHUyMTkyIG5ldy1zZXNzaW9uIHZpZXcsXG5cdFx0Ly8gYWN0aXZlLWNoYXQgcmVtb3ZlZCBcdTIxOTIgZmFsbGJhY2sgY2hhdCwgcGVyc2lzdCB0aGUgYWN0aXZlIGNoYXQpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9hY3RpdmVTZXNzaW9uVmlld0xpc3RlbmVycyhhY3RpdmVTZXNzaW9uKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVmlld2luZyBhIHNlc3Npb24gbWFya3MgaXQgcmVhZC4gVGhpcyBrZWVwcyB0aGUgYWN0aXZlIHNlc3Npb24gcmVhZFxuXHRcdC8vIHdoaWxlIGl0IHN0YXlzIGFjdGl2ZSwgc28gYElTZXNzaW9uLmlzUmVhZGAgaXMgdGhlIHNpbmdsZSBzb3VyY2Ugb2Zcblx0XHQvLyB0cnV0aCBmb3IgcmVhZCBzdGF0ZSAobm8gZGlzcGxheS1vbmx5IG92ZXJsYXkgbmVlZGVkKS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChhY3RpdmVTZXNzaW9uICYmICFhY3RpdmVTZXNzaW9uLmlzUmVhZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtSZWFkKGFjdGl2ZVNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlZmxlY3QgcHJvdmlkZXItbGV2ZWwgc2Vzc2lvbiBjaGFuZ2VzIG9udG8gdGhlIGdyaWQ6IGRyb3AgcmVtb3ZlZFxuXHRcdC8vIHNlc3Npb25zIGFuZCBwaWNrIGEgZmFsbGJhY2sgKG9yIHRoZSBuZXctc2Vzc2lvbiB2aWV3KSB3aGVuIHRoZSBhY3RpdmVcblx0XHQvLyBvbmUgZGlzYXBwZWFycy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMoZSkpKTtcblxuXHRcdC8vIFJlZmxlY3QgcHJvdmlkZXIgc2Vzc2lvbiByZXBsYWNlbWVudCAoZS5nLiBhIGRyYWZ0IGdyYWR1YXRpbmcgaW50byBhXG5cdFx0Ly8gY29tbWl0dGVkIHNlc3Npb24pIG9udG8gdGhlIGdyaWQgc2xvdC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRSZXBsYWNlU2Vzc2lvbigoeyBmcm9tLCB0byB9KSA9PiB0aGlzLl9vbkRpZFJlcGxhY2VTZXNzaW9uKGZyb20sIHRvKSkpO1xuXG5cdFx0Ly8gV2hpbGUgYSBmb3JlZ3JvdW5kIHNlbmQgbWF0ZXJpYWxpc2VzIG5ldyBjaGF0cywga2VlcCB0aGUgbmV3ZXN0IGNoYXRcblx0XHQvLyBhY3RpdmUgaW4gdGhlIHZpc2libGUgc2xvdCBzbyB0aGUgdXNlciBzZWVzIHRoZSBjaGF0IGJlaW5nIHNlbnQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uV2lsbFNlbmRSZXF1ZXN0KHNlc3Npb24gPT4gdGhpcy5fc3RhcnRTZW5kRm9sbG93KHNlc3Npb24pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkU2VuZFJlcXVlc3QoKCkgPT4gdGhpcy5fc2VuZEZvbGxvdy5jbGVhcigpKSk7XG5cblx0XHQvLyBEcml2ZSB0aGUgcGFydDogcmVjb25jaWxlIHRoZSBncmlkIGFuZCBtb3ZlIGZvY3VzIGludG8gdGhlIGFjdGl2ZVxuXHRcdC8vIHNlc3Npb24gd2hlbmV2ZXIgdGhlIHZpc2libGUgc2Vzc2lvbnMgb3IgdGhlIGFjdGl2ZSBzZXNzaW9uIGNoYW5nZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gdGhpcy52aXNpYmxlU2Vzc2lvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gdGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSB0aGlzLl92aXNpYmlsaXR5LmFjdGl2ZVByZXNlcnZlRm9jdXMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5zZXNzaW9uc1BhcnRTZXJ2aWNlLnVwZGF0ZVZpc2libGVTZXNzaW9ucyh2aXNpYmxlLCBhY3RpdmUpO1xuXG5cdFx0XHQvLyBNb3ZlIGtleWJvYXJkIGZvY3VzIGludG8gdGhlIGFjdGl2ZSBzZXNzaW9uIHdoZW5ldmVyIGl0IGNoYW5nZXNcblx0XHRcdC8vIChlLmcuIGFmdGVyIG9wZW5pbmcsIHN3aXRjaGluZyB0bywgb3IgcmVzdG9yaW5nIGEgc2Vzc2lvbikgc28gdGhlXG5cdFx0XHQvLyB1c2VyIGNhbiBzdGFydCB0eXBpbmcgaW1tZWRpYXRlbHkuIFRoZSBmb2N1cyBpcyBndWFyZGVkIHNvIGFcblx0XHRcdC8vIHNlc3Npb24gdGhlIHVzZXIgaXMgYWxyZWFkeSBpbnRlcmFjdGluZyB3aXRoIGlzIG5ldmVyIHJlLWZvY3VzZWRcblx0XHRcdC8vICh3aGljaCB3b3VsZCBzdGVhbCBmb2N1cyBmcm9tIHRoZSBjbGlja2VkIGVsZW1lbnQpLCBhbmQgdGhlIGlkXG5cdFx0XHQvLyBjaGVjayBlbnN1cmVzIHVucmVsYXRlZCB2aXNpYmlsaXR5IHVwZGF0ZXMgZG8gbm90IG1vdmUgZm9jdXMuXG5cdFx0XHQvLyBgcHJlc2VydmVGb2N1c2AgKHB1Ymxpc2hlZCBhdG9taWNhbGx5IHdpdGggdGhlIGFjdGl2ZSBzZXNzaW9uKVxuXHRcdFx0Ly8gc3VwcHJlc3NlcyB0aGUgZm9jdXMgbW92ZSBmb3IgYmFja2dyb3VuZCBvcGVucy5cblx0XHRcdGNvbnN0IGFjdGl2ZUlkID0gYWN0aXZlPy5zZXNzaW9uSWQ7XG5cdFx0XHRpZiAoYWN0aXZlSWQgIT09IHRoaXMuX2ZvY3VzZWRBY3RpdmVTZXNzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZEFjdGl2ZVNlc3Npb25JZCA9IGFjdGl2ZUlkO1xuXHRcdFx0XHRpZiAoIXByZXNlcnZlRm9jdXMpIHtcblx0XHRcdFx0XHR0aGlzLnNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKGFjdGl2ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuIGEgc2Vzc2lvbiB2aWV3IGluIHRoZSBncmlkIHJlY2VpdmVzIGZvY3VzLCBwcm9tb3RlIHRoYXQgc2Vzc2lvblxuXHRcdC8vIHRvIHRoZSBhY3RpdmUgc2Vzc2lvbi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zUGFydFNlcnZpY2Uub25EaWRGb2N1c1Nlc3Npb24oc2Vzc2lvbklkID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnZpc2libGVTZXNzaW9ucy5nZXQoKS5maW5kKHMgPT4gcz8uc2Vzc2lvbklkID09PSBzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5zZXRBY3RpdmUoc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRSZXBsYWNlU2Vzc2lvbihmcm9tOiBJU2Vzc2lvbiwgdG86IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJpbGl0eS51cGRhdGVTZXNzaW9uKGZyb20sIHRvKTtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2ZVNlc3Npb25WaWV3TGlzdGVuZXJzKGFjdGl2ZVNlc3Npb246IElBY3RpdmVTZXNzaW9uKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gV2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gYmVjb21lcyBhcmNoaXZlZCwgcmV0dXJuIHRvIHRoZSBuZXctc2Vzc2lvblxuXHRcdC8vIHZpZXcgKG9yIHRoZSBxdWljay1jaGF0IGNvbXBvc2VyIGZvciBhIHF1aWNrIGNoYXQpLCBrZWVwaW5nIGNvbnRleHQuXG5cdFx0bGV0IHdhc0FyY2hpdmVkID0gYWN0aXZlU2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc0FyY2hpdmVkID0gYWN0aXZlU2Vzc2lvbi5pc0FyY2hpdmVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpc0FyY2hpdmVkICYmICF3YXNBcmNoaXZlZCkge1xuXHRcdFx0XHRpZiAoYWN0aXZlU2Vzc2lvbi5pc1F1aWNrQ2hhdD8ucmVhZCh1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuUXVpY2tDaGF0KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gYWN0aXZlU2Vzc2lvbi53b3Jrc3BhY2UucmVhZCh1bmRlZmluZWQpPy5mb2xkZXJzWzBdPy5yb290O1xuXHRcdFx0XHRcdHRoaXMub3Blbk5ld1Nlc3Npb24oZm9sZGVyVXJpXG5cdFx0XHRcdFx0XHQ/IHsgZm9sZGVyVXJpLCAuLi5pbmhlcml0YWJsZVNlc3Npb25UYXJnZXQodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBhY3RpdmVTZXNzaW9uLCBmb2xkZXJVcmkpIH1cblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0d2FzQXJjaGl2ZWQgPSBpc0FyY2hpdmVkO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGNoYXQgbGlzdCBjaGFuZ2VzIFx1MjAxNCBpZiB0aGUgYWN0aXZlIGNoYXQgaXMgcmVtb3ZlZCwgZmFsbCBiYWNrLlxuXHRcdGlmIChhY3RpdmVTZXNzaW9uLnN0YXR1cy5nZXQoKSAhPT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY2hhdHMgPSBhY3RpdmVTZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZlQ2hhdCA9IGFjdGl2ZVNlc3Npb24uYWN0aXZlQ2hhdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChhY3RpdmVDaGF0ICYmICFjaGF0cy5zb21lKGMgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoYy5yZXNvdXJjZSwgYWN0aXZlQ2hhdC5yZXNvdXJjZSkpKSB7XG5cdFx0XHRcdFx0Ly8gRmFsbCBiYWNrIHRvIHRoZSBsYXN0IHZpc2libGUgKG5vbi1oaWRkZW4pIGNoYXQsIG9yIHRoZSBtYWluIGNoYXQuXG5cdFx0XHRcdFx0Y29uc3QgdmlzaWJsZSA9IGNoYXRzLmZpbHRlcihjID0+IGMuaW50ZXJhY3Rpdml0eS5yZWFkKHJlYWRlcikgIT09IENoYXRJbnRlcmFjdGl2aXR5LkhpZGRlbik7XG5cdFx0XHRcdFx0Y29uc3QgZmFsbGJhY2sgPSB2aXNpYmxlW3Zpc2libGUubGVuZ3RoIC0gMV0gPz8gYWN0aXZlU2Vzc2lvbi5tYWluQ2hhdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0aWYgKGZhbGxiYWNrKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm9wZW5DaGF0KGFjdGl2ZVNlc3Npb24sIGZhbGxiYWNrLnJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBUcmFjayBhY3RpdmUgY2hhdCBjaGFuZ2VzIHRvIHBlcnNpc3QgcGVyLXNlc3Npb24gc3RhdGUuIFRoZSB2aXNpYmxlIC9cblx0XHQvLyBhY3RpdmUgLyBzdGlja3kgZmxhZ3MgYXJlIHNuYXBzaG90dGVkIGZyb20gdGhlIGxpdmUgZ3JpZCBhdCBzYXZlIHRpbWVcblx0XHQvLyAoc2VlIGBfc25hcHNob3RWaXNpYmxlU2Vzc2lvblN0YXRlc2ApOyBoZXJlIHdlIG9ubHkgcmVtZW1iZXIgdGhlIGxhc3Rcblx0XHQvLyBhY3RpdmUgY2hhdCBzbyByZW9wZW5pbmcgdGhlIHNlc3Npb24gcmVzdG9yZXMgaXRzIHNlbGVjdGVkIGNoYXQuIFRoZVxuXHRcdC8vIGNsb3NlZC1jaGF0IHNldCBpcyBwZXJzaXN0ZWQgZGV0ZXJtaW5pc3RpY2FsbHkgaW4gYGNsb3NlQ2hhdGAvYG9wZW5DaGF0YFxuXHRcdC8vIGluc3RlYWQgKHNlZSBgX3NldENoYXRDbG9zZWRTdGF0ZWApLCBzbyBpdCBuZXZlciBkZXBlbmRzIG9uIGNoYXRzIGJlaW5nXG5cdFx0Ly8gbG9hZGVkIG9yIG9uIGF1dG9ydW4gdGltaW5nLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGF0ID0gYWN0aXZlU2Vzc2lvbi5hY3RpdmVDaGF0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjaGF0ICYmIGNoYXQuc3RhdHVzLnJlYWQodW5kZWZpbmVkKSAhPT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLnNldChhY3RpdmVTZXNzaW9uLnJlc291cmNlLCB7XG5cdFx0XHRcdFx0Li4uZXhpc3RpbmcsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBhY3RpdmVTZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0YWN0aXZlQ2hhdFJlc291cmNlOiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU2Vzc2lvbnMoZTogSVNlc3Npb25zQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50QWN0aXZlID0gdGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXG5cdFx0Ly8gQ2xlYW4gcmVtb3ZlZCBzZXNzaW9ucyBvdXQgb2YgdGhlIHZpc2liaWxpdHkgbW9kZWwgKGRyb3BzIHRoZWlyIGdyaWRcblx0XHQvLyBzbG90IGFuZCBkaXNwb3NlcyB0aGVpciB3cmFwcGVyKS4gSWYgdGhlIGFjdGl2ZSBzZXNzaW9uIGlzIGFtb25nIHRoZVxuXHRcdC8vIHJlbW92ZWQsIHJlbW92ZU1hbnkgcGlja3MgYSBmYWxsYmFjayBhY3RpdmUgc2Vzc2lvbiAob3IgY2xlYXJzIGl0IHdoZW5cblx0XHQvLyBubyBzbG90IHJlbWFpbnMpOyBkcml2ZSB0aGUgb3BlbiBmbG93IGJlbG93IHNvIHRoZSBmYWxsYmFjayBpcyBmdWxseVxuXHRcdC8vIG9wZW5lZC5cblx0XHRpZiAoZS5yZW1vdmVkLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLmRlbGV0ZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Zpc2liaWxpdHkucmVtb3ZlTWFueShlLnJlbW92ZWQubWFwKHIgPT4gci5zZXNzaW9uSWQpKTtcblx0XHR9XG5cblx0XHRpZiAoIWN1cnJlbnRBY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZS5yZW1vdmVkLmxlbmd0aCAmJiBlLnJlbW92ZWQuc29tZShyID0+IHIuc2Vzc2lvbklkID09PSBjdXJyZW50QWN0aXZlLnNlc3Npb25JZCkpIHtcblx0XHRcdGNvbnN0IGZhbGxiYWNrID0gdGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKGZhbGxiYWNrICYmIHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKGZhbGxiYWNrLnJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLm9wZW5TZXNzaW9uKGZhbGxiYWNrLnJlc291cmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMub3Blbk5ld1Nlc3Npb24oKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydFNlbmRGb2xsb3coc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgZm9sbG93SWQgPSBzZXNzaW9uLnNlc3Npb25JZDtcblx0XHQvLyBBIGZvcmVncm91bmQgc2VuZCBjYW4gcmVwbGFjZSB0aGUgc2Vzc2lvbiBpZCAoZHJhZnQgZ3JhZHVhdGluZyBpbnRvIGFcblx0XHQvLyBjb21taXR0ZWQgc2Vzc2lvbik7IGtlZXAgZm9sbG93aW5nIHRoZSBuZXcgaWQuXG5cdFx0c3RvcmUuYWRkKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZFJlcGxhY2VTZXNzaW9uKCh7IGZyb20sIHRvIH0pID0+IHtcblx0XHRcdGlmIChmcm9tLnNlc3Npb25JZCA9PT0gZm9sbG93SWQpIHtcblx0XHRcdFx0Zm9sbG93SWQgPSB0by5zZXNzaW9uSWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLl92aXNpYmlsaXR5LmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGFjdGl2ZSAmJiBhY3RpdmUuc2Vzc2lvbklkID09PSBmb2xsb3dJZCkge1xuXHRcdFx0XHRjb25zdCBjaGF0cyA9IGFjdGl2ZS52aXNpYmxlQ2hhdFRhYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBsYXN0Q2hhdCA9IGNoYXRzW2NoYXRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRpZiAobGFzdENoYXQpIHtcblx0XHRcdFx0XHR0aGlzLl92aXNpYmlsaXR5LnNldEFjdGl2ZUNoYXQoYWN0aXZlLCBsYXN0Q2hhdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fc2VuZEZvbGxvdy52YWx1ZSA9IHN0b3JlO1xuXHR9XG5cblx0Z2V0UmVjZW50bHlPcGVuZWRTZXNzaW9ucygpOiBJUmVjZW50bHlPcGVuZWRTZXNzaW9ucyB7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHJlY2VudDogSVNlc3Npb25bXSA9IFtdO1xuXG5cdFx0Ly8gU2Vzc2lvbnMgaW4gcmVjZW5jeSBvcmRlciAobW9zdC1yZWNlbnRseS1vcGVuZWQgZmlyc3QpLCBkZWR1cGxpY2F0ZWQgYnlcblx0XHQvLyBzZXNzaW9uIHNvIGEgc2Vzc2lvbiB3aXRoIG11bHRpcGxlIG9wZW5lZCBjaGF0cyBhcHBlYXJzIG9ubHkgb25jZSBhbmRcblx0XHQvLyBjYXBwZWQgYXQgdGhlIG1vc3QgcmVjZW50IHtAbGluayBNQVhfUkVDRU5UTFlfT1BFTkVEX1NFU1NJT05TfS5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX3JlY2VuY3lIaXN0b3J5LmVudHJpZXMpIHtcblx0XHRcdGlmIChyZWNlbnQubGVuZ3RoID49IE1BWF9SRUNFTlRMWV9PUEVORURfU0VTU0lPTlMpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrZXkgPSBlbnRyeS5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGlmIChzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c2Vlbi5hZGQoa2V5KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihlbnRyeS5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0cmVjZW50LnB1c2goc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2Vzc2lvbnMgdGhhdCBoYXZlIG5vdCBiZWVuIGluY2x1ZGVkIGluIHRoZSByZWNlbnRseSBvcGVuZWQgZ3JvdXAsXG5cdFx0Ly8gc29ydGVkIGJ5IG1vc3QgcmVjZW50bHkgdXBkYXRlZCBmaXJzdC5cblx0XHRjb25zdCBvdGhlciA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9ucygpXG5cdFx0XHQuZmlsdGVyKHMgPT4gIXNlZW4uaGFzKHMucmVzb3VyY2UudG9TdHJpbmcoKSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYi51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpIC0gYS51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpKTtcblxuXHRcdHJldHVybiB7IHJlY2VudCwgb3RoZXIgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWwgYW55IGluLWZsaWdodCBvcGVuLXNlc3Npb24vcmVzdG9yZSBhbmQgcmV0dXJuIGEgZnJlc2ggY2FuY2VsbGF0aW9uIHRva2VuLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRPcGVuU2Vzc2lvbigpOiBDYW5jZWxsYXRpb25Ub2tlbiB7XG5cdFx0Ly8gT3BlbmluZyBhIHNlc3Npb24gaXMgdGhlIGdlc3R1cmUgdGhhdCBkaXNtaXNzZXMgYSBjdXN0b20gdmlldzsgdGhlXG5cdFx0Ly8gd29ya2JlbmNoIHRoZW4gcmVzdG9yZXMgdGhlIHNlc3Npb25zIGdyaWQgYW5kIGl0cyBzaWRlIHBhbmVsIHN0YXRlLlxuXHRcdHRoaXMuY3VzdG9tVmlld1NlcnZpY2UuaGlkZUN1c3RvbVZpZXcoKTtcblxuXHRcdHRoaXMuX29wZW5TZXNzaW9uQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9vcGVuU2Vzc2lvbkN0cy52YWx1ZSA9IGN0cztcblx0XHRyZXR1cm4gY3RzLnRva2VuO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbmNlbCBhbiBpbi1mbGlnaHQge0BsaW5rIHJlc3RvcmVWaXNpYmxlU2Vzc2lvbnN9LiBDYWxsZWQgd2hlbiB0aGUgdXNlclxuXHQgKiBleHBsaWNpdGx5IG5hdmlnYXRlcyB0byBhIHNwZWNpZmljIHNlc3Npb24sIHNvIHJlc3RvcmUgc3RvcHMgZmlnaHRpbmdcblx0ICogdGhlIHVzZXIncyBjaG9pY2UuIEFkZGl0aXZlIG5ldy1zZXNzaW9uIG9wZXJhdGlvbnMgZG8gTk9UIGNhbGwgdGhpcy5cblx0ICovXG5cdHByaXZhdGUgX2NhbmNlbFJlc3RvcmUoKTogdm9pZCB7XG5cdFx0Ly8gYGNhbmNlbCgpYCAobm90IGp1c3QgYGNsZWFyKClgL2Rpc3Bvc2UpIHNvIHRoZSBpbi1mbGlnaHQgcmVzdG9yZSdzXG5cdFx0Ly8gdG9rZW4gYWN0dWFsbHkgZmlyZXMgY2FuY2VsbGF0aW9uIGFuZCBiYWlscyBvdXQ7IGBNdXRhYmxlRGlzcG9zYWJsZWBcblx0XHQvLyBkaXNwb3NlcyB0aGUgc291cmNlIHdpdGhvdXQgY2FuY2VsbGluZyBpdC5cblx0XHR0aGlzLl9yZXN0b3JlQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9yZXN0b3JlQ3RzLmNsZWFyKCk7XG5cdH1cblxuXHQvKipcblx0ICogTWFrZSB0aGUgZ2l2ZW4gc2Vzc2lvbiBhY3RpdmUgaW4gdGhlIHZpc2liaWxpdHkgbW9kZWwsIG9wdGlvbmFsbHkgd2l0aG91dFxuXHQgKiBtb3ZpbmcgZm9jdXMgaW50byBpdC4gVGhlIHByZXNlcnZlLWZvY3VzIGludGVudCBpcyBwdWJsaXNoZWQgYXRvbWljYWxseVxuXHQgKiB3aXRoIHRoZSBhY3RpdmUgc2Vzc2lvbiBieSB0aGUgdmlzaWJpbGl0eSBtb2RlbCwgYW5kIHRoZSBtb2RlbCdzXG5cdCAqIGNhbm9uaWNhbCBhY3RpdmUgc2Vzc2lvbiBpcyB1cGRhdGVkIHJlYWN0aXZlbHkgYnkgdGhlIG1pcnJvciBhdXRvcnVuLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWN0aXZhdGUoc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmlsaXR5LnNldEFjdGl2ZShzZXNzaW9uLCBwcmVzZXJ2ZUZvY3VzKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5DaGF0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0MCA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fY2FuY2VsUmVzdG9yZSgpO1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fc3RhcnRPcGVuU2Vzc2lvbigpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVmlld10gb3BlbkNoYXQgc3RhcnQgdXJpPSR7Y2hhdFVyaS50b1N0cmluZygpfSBwcm92aWRlcj0ke3Nlc3Npb24ucHJvdmlkZXJJZH1gKTtcblx0XHR0aGlzLl9hY3RpdmF0ZShzZXNzaW9uKTtcblx0XHRpZiAoIWF3YWl0IHRoaXMuX3dhaXRGb3JTZXNzaW9uVG9Mb2FkKHNlc3Npb24sIHRva2VuKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNWaWV3XSBvcGVuQ2hhdCBjYW5jZWxsZWQgd2hpbGUgd2FpdGluZyBmb3Igc2Vzc2lvbiB0byBsb2FkIHVyaT0ke2NoYXRVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBjaGF0IGFuZCB1cGRhdGUgYWN0aXZlIGNoYXRcblx0XHRsZXQgY2hhdDogSUNoYXQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Zpc2liaWxpdHkuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0Y2hhdCA9IGFjdGl2ZVNlc3Npb24uY2hhdHMuZ2V0KCkuZmluZChjID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGMucmVzb3VyY2UsIGNoYXRVcmkpKTtcblx0XHRcdGlmIChjaGF0KSB7XG5cdFx0XHRcdC8vIE9wZW5pbmcgYSBjaGF0IGFsc28gdW4taGlkZXMgaXQgaWYgaXQgd2FzIHByZXZpb3VzbHkgY2xvc2VkLlxuXHRcdFx0XHR0aGlzLl92aXNpYmlsaXR5Lm9wZW5DaGF0KHNlc3Npb24sIGNoYXQpO1xuXHRcdFx0XHR0aGlzLl92aXNpYmlsaXR5LnNldEFjdGl2ZUNoYXQoc2Vzc2lvbiwgY2hhdCk7XG5cdFx0XHRcdHRoaXMuX3NldENoYXRDbG9zZWRTdGF0ZShzZXNzaW9uLCBjaGF0LCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNoYXQgJiYgY2hhdC5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVmlld10gb3BlbkNoYXQgZG9uZSB0b3RhbD0ke0RhdGUubm93KCkgLSB0MH1tcyB1cmk9JHtjaGF0VXJpLnRvU3RyaW5nKCl9IHBhdGg9dW50aXRsZWRgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1ZpZXddIG9wZW5DaGF0IGRvbmUgdG90YWw9JHtEYXRlLm5vdygpIC0gdDB9bXMgdXJpPSR7Y2hhdFVyaS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0YXN5bmMgY2xvc2VDaGF0KHNlc3Npb246IElBY3RpdmVTZXNzaW9uLCBjaGF0OiBJQ2hhdCwgb3B0aW9ucz86IElDbG9zZUNoYXRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ2xvc2luZyBoaWRlcyB0aGUgY2hhdCBmcm9tIHRoZSB0YWIgc3RyaXA7IGl0IHN0YXlzIHJlb3BlbmFibGUgZnJvbSB0aGVcblx0XHQvLyBzZXNzaW9uIGhlYWRlcidzIGNoYXRzIGRyb3Bkb3duLlxuXHRcdHRoaXMuX3Zpc2liaWxpdHkuY2xvc2VDaGF0KHNlc3Npb24sIGNoYXQpO1xuXHRcdHRoaXMuX3NldENoYXRDbG9zZWRTdGF0ZShzZXNzaW9uLCBjaGF0LCB0cnVlKTtcblx0XHRpZiAoIW9wdGlvbnM/LnNraXBIaXN0b3J5KSB7XG5cdFx0XHR0aGlzLl9jbG9zZWRJdGVtcy5yZWNvcmRDbG9zZWRDaGF0KHNlc3Npb24sIGNoYXQucmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHJlb3Blbkxhc3RDbG9zZWRJdGVtKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9jbG9zZWRJdGVtcy5yZW9wZW5MYXN0KCk7XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdCBhIGNoYXQncyBjbG9zZWQvb3BlbiBzdGF0ZSBpbnRvIHRoZSBzZXNzaW9uJ3Mgc3RvcmVkIHZpZXcgc3RhdGUgc29cblx0ICogaXQgc3Vydml2ZXMgc3dpdGNoaW5nIHRoZSBzZXNzaW9uIG91dCBvZiB0aGUgZ3JpZCAod2hpY2ggZGlzcG9zZXMgaXRzXG5cdCAqIHdyYXBwZXIpIGFuZCByZWxvYWRzLiBEb25lIHN5bmNocm9ub3VzbHkgb24gdGhlIGNsb3NlL29wZW4gYWN0aW9uIHJhdGhlclxuXHQgKiB0aGFuIHJlYWN0aXZlbHkgZnJvbSBgY2xvc2VkQ2hhdHNgLCB3aGljaCB3b3VsZCBkZXBlbmQgb24gdGhlIHNlc3Npb24nc1xuXHQgKiBjaGF0cyBiZWluZyBsb2FkZWQuIFRoZSBtYWluIGNoYXQgY2FuIG5ldmVyIGJlIGNsb3NlZCBhbmQgaXMgaWdub3JlZC5cblx0ICovXG5cdHByaXZhdGUgX3NldENoYXRDbG9zZWRTdGF0ZShzZXNzaW9uOiBJU2Vzc2lvbiwgY2hhdDogSUNoYXQsIGNsb3NlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChjaGF0LnJlc291cmNlLCBzZXNzaW9uLm1haW5DaGF0LmdldCgpLnJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBTdWJhZ2VudCAodG9vbC1vcmlnaW4pIGNoYXRzIGFyZSBoaWRkZW4gYnkgZGVmYXVsdCBhbmQgdG9nZ2xlZCB2aWEgYW5cblx0XHQvLyBpbi1tZW1vcnkgc2hvd24gc2V0LCBub3QgdGhlIHBlcnNpc3RlZCBjbG9zZWQgc2V0LCBzbyB0aGV5IG5ldmVyXG5cdFx0Ly8gcGFydGljaXBhdGUgaW4gY2xvc2VkLWNoYXQgcGVyc2lzdGVuY2UuXG5cdFx0aWYgKGNoYXQub3JpZ2luPy5raW5kID09PSBDaGF0T3JpZ2luS2luZC5Ub29sKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0Y29uc3QgY2xvc2VkU2V0ID0gbmV3IFNldChleGlzdGluZz8uY2xvc2VkQ2hhdFJlc291cmNlcyA/PyBbXSk7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmIChjbG9zZWQpIHtcblx0XHRcdGNsb3NlZFNldC5hZGQoY2hhdFJlc291cmNlKTtcblx0XHR9IGVsc2UgaWYgKCFjbG9zZWRTZXQuZGVsZXRlKGNoYXRSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjsgLy8gbm90aGluZyBjaGFuZ2VkIChjaGF0IHdhcyBub3QgY2xvc2VkKVxuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLnNldChzZXNzaW9uLnJlc291cmNlLCB7XG5cdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0Y2xvc2VkQ2hhdFJlc291cmNlczogWy4uLmNsb3NlZFNldF0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBvcGVuU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IHsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2NhbmNlbFJlc3RvcmUoKTtcblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX3N0YXJ0T3BlblNlc3Npb24oKTtcblx0XHRjb25zdCBzZXNzaW9uRGF0YSA9IHRoaXMuX3Nob3dTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0YXdhaXQgdGhpcy5fd2FpdEZvck9wZW5TZXNzaW9uVG9Mb2FkKHNlc3Npb25EYXRhLCB0b2tlbik7XG5cdH1cblxuXHRzaG93U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IHsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFJlc3RvcmUoKTtcblx0XHR0aGlzLl9zdGFydE9wZW5TZXNzaW9uKCk7XG5cdFx0dGhpcy5fc2hvd1Nlc3Npb24oc2Vzc2lvblJlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBvcHRpb25zPzogeyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiB9KTogSVNlc3Npb24ge1xuXHRcdGNvbnN0IHQwID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBzZXNzaW9uRGF0YSA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXNzaW9uRGF0YSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtTZXNzaW9uc1ZpZXddIG9wZW5TZXNzaW9uOiBzZXNzaW9uIG5vdCBmb3VuZCB1cmk9JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiB3aXRoIHJlc291cmNlICR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IG5vdCBmb3VuZGApO1xuXHRcdH1cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1ZpZXddIG9wZW5TZXNzaW9uIHN0YXJ0IHVyaT0ke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBwcm92aWRlcj0ke3Nlc3Npb25EYXRhLnByb3ZpZGVySWR9YCk7XG5cblx0XHR0aGlzLl9hY3RpdmF0ZShzZXNzaW9uRGF0YSwgb3B0aW9ucz8ucHJlc2VydmVGb2N1cyk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNWaWV3XSBzaG93U2Vzc2lvbiBkb25lIHRvdGFsPSR7RGF0ZS5ub3coKSAtIHQwfW1zIHVyaT0ke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdHJldHVybiBzZXNzaW9uRGF0YTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JPcGVuU2Vzc2lvblRvTG9hZChzZXNzaW9uRGF0YTogSVNlc3Npb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHQwID0gRGF0ZS5ub3coKTtcblx0XHRpZiAoIWF3YWl0IHRoaXMuX3dhaXRGb3JTZXNzaW9uVG9Mb2FkKHNlc3Npb25EYXRhLCB0b2tlbikpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVmlld10gb3BlblNlc3Npb24gY2FuY2VsbGVkIHdoaWxlIHdhaXRpbmcgZm9yIHNlc3Npb24gdG8gbG9hZCB1cmk9JHtzZXNzaW9uRGF0YS5yZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVmlld10gb3BlblNlc3Npb24gbG9hZGVkIHRvdGFsPSR7RGF0ZS5ub3coKSAtIHQwfW1zIHVyaT0ke3Nlc3Npb25EYXRhLnJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdH1cblxuXHR1bnNldE5ld1Nlc3Npb24oKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmRpc2NhcmROZXdTZXNzaW9uKCk7XG5cdFx0dGhpcy5fYWN0aXZhdGUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5OZXdTZXNzaW9uKG9wdGlvbnM/OiBJT3Blbk5ld1Nlc3Npb25PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJT3Blbk5ld1Nlc3Npb25SZXN1bHQ+IHtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBvcHRpb25zPy5mb2xkZXJVcmk7XG5cdFx0aWYgKGZvbGRlclVyaSkge1xuXHRcdFx0Ly8gU2luZ2xlIHRydXN0IGdhdGUgZm9yIGV2ZXJ5IHBhdGggdGhhdCBjcmVhdGVzIGEgY29uY3JldGUgc2Vzc2lvbiBmb3Jcblx0XHRcdC8vIGEgZm9sZGVyICh0aGUgd29ya3NwYWNlIHBpY2tlciBkcm9wZG93biwgdGhlIGZvbGRlciBRdWljayBQaWNrLCBldGMuKTpcblx0XHRcdC8vIHJlc29sdmUgdGhlIHdvcmtzcGFjZSBhbmQsIGlmIGl0IHJlcXVpcmVzIHRydXN0LCBwcm9tcHQgYmVmb3JlXG5cdFx0XHQvLyBjcmVhdGluZyB0aGUgc2Vzc2lvbi4gQSBuby1vcCBpZiB0aGUgZm9sZGVyIGlzIGFscmVhZHkgdHJ1c3RlZC5cblx0XHRcdC8vIFJlc29sdmVkIHdpdGggdGhlIHNhbWUgcHJvdmlkZXIgYGNyZWF0ZU5ld1Nlc3Npb25gIGJlbG93IHdpbGwgdXNlXG5cdFx0XHQvLyAoaG9ub3JpbmcgYG9wdGlvbnMucHJvdmlkZXJJZGApLCBzbyB0aGUgdHJ1c3QgZGVjaXNpb24gYWx3YXlzXG5cdFx0XHQvLyByZWZsZWN0cyB0aGUgd29ya3NwYWNlIHRoYXQgaXMgYWN0dWFsbHkgYWJvdXQgdG8gYmUgY3JlYXRlZC5cblx0XHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpLCBvcHRpb25zPy5wcm92aWRlcklkKTtcblx0XHRcdGlmIChyZXNvbHZlZD8ud29ya3NwYWNlLnJlcXVpcmVzV29ya3NwYWNlVHJ1c3QpIHtcblx0XHRcdFx0Y29uc3QgdHJ1c3RlZCA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0UmVzb3VyY2VzVHJ1c3Qoe1xuXHRcdFx0XHRcdHVyaTogZm9sZGVyVXJpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdzZXNzaW9uc1NlcnZpY2UudHJ1c3RGb2xkZXJNZXNzYWdlJywgXCJBbiBhZ2VudCBzZXNzaW9uIHdpbGwgYmUgYWJsZSB0byByZWFkIGZpbGVzLCBydW4gY29tbWFuZHMsIGFuZCBtYWtlIGNoYW5nZXMgaW4gdGhpcyBmb2xkZXIuXCIpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogdW5kZWZpbmVkLCB0cnVzdERlY2xpbmVkOiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdHJ1c3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB7IHNlc3Npb246IHVuZGVmaW5lZCwgdHJ1c3REZWNsaW5lZDogdHJ1ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uOiB1bmRlZmluZWQsIHRydXN0RGVjbGluZWQ6IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGFydE9wZW5TZXNzaW9uKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmNyZWF0ZU5ld1Nlc3Npb24oZm9sZGVyVXJpLCBvcHRpb25zKTtcblx0XHRcdFx0dGhpcy5fYWN0aXZhdGUoc2Vzc2lvbik7XG5cdFx0XHRcdHJldHVybiB7IHNlc3Npb24sIHRydXN0RGVjbGluZWQ6IGZhbHNlIH07XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIFdoZW4gdGhlIGZvbGRlciBjYW5ub3QgYmUgcmVzb2x2ZWQgKGUuZy4gdGhlIGFjdGl2ZSBzZXNzaW9uJ3Ncblx0XHRcdFx0Ly8gd29ya3NwYWNlIHVzZXMgYW4gdW5zdXBwb3J0ZWQgc2NoZW1lIGxpa2UgJ3Vua25vd246LycpLCBmYWxsXG5cdFx0XHRcdC8vIHRocm91Z2ggdG8gdGhlIGZvbGRlci1sZXNzIGNvbXBvc2VyIHZpZXcuXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVmlld10gb3Blbk5ld1Nlc3Npb246IGNyZWF0ZU5ld1Nlc3Npb24gZmFpbGVkIGZvciBmb2xkZXIgJHtmb2xkZXJVcmkudG9TdHJpbmcoKX0sIGZhbGxpbmcgYmFjayB0byBjb21wb3NlciB2aWV3YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2l0aG91dCBhIGZvbGRlciAob3Igd2hlbiBmb2xkZXIgcmVzb2x1dGlvbiBmYWlsZWQgYWJvdmUpOiBzd2l0Y2ggdG9cblx0XHQvLyB0aGUgbmV3LXNlc3Npb24gY29tcG9zZXIgdmlldy5cblx0XHQvLyBOby1vcCB3aGVuIG5vIHNlc3Npb24gaXMgYWN0aXZlIChlbXB0eSBuZXctc2Vzc2lvbiBwbGFjZWhvbGRlciBzaG93aW5nKS5cblx0XHRpZiAodGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLmdldCgpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IHNlc3Npb246IHVuZGVmaW5lZCwgdHJ1c3REZWNsaW5lZDogZmFsc2UgfTtcblx0XHR9XG5cdFx0aWYgKCFmb2xkZXJVcmkpIHtcblx0XHRcdHRoaXMuX3N0YXJ0T3BlblNlc3Npb24oKTtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIHRoZSBpbi1wcm9ncmVzcyBuZXcgc2Vzc2lvbiBpZiBvbmUgZXhpc3RzLCBzbyBwaWNrZXJzIHJlLWRlcml2ZVxuXHRcdC8vIHRoZWlyIHN0YXRlIGZyb20gdGhlIHN0aWxsLWFsaXZlIHNlc3Npb24gb2JqZWN0LiBPdGhlcndpc2UgY2xlYXIgdGhlXG5cdFx0Ly8gYWN0aXZlIHNlc3Npb24gKGZpcnN0IHRpbWUgLyBhZnRlciBzZW5kKS5cblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm5ld1Nlc3Npb24uZ2V0KCk7XG5cblx0XHQvLyBBIHF1aWNrLWNoYXQgZHJhZnQgbXVzdCBub3QgYmUgcmVzdG9yZWQgaW50byB0aGUgd29ya3NwYWNlIG5ldy1zZXNzaW9uXG5cdFx0Ly8gY29tcG9zZXIgKHN5bW1ldHJpYyB0byB0aGUgTmV3IFF1aWNrIENoYXQgZ2VzdHVyZSk6IGRpc2NhcmQgaXQgYW5kIHNob3dcblx0XHQvLyBhIGZyZXNoIHdvcmtzcGFjZSBjb21wb3NlciBpbnN0ZWFkLlxuXHRcdGlmIChuZXdTZXNzaW9uPy5pc1F1aWNrQ2hhdD8uZ2V0KCkpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kaXNjYXJkTmV3U2Vzc2lvbihuZXdTZXNzaW9uKTtcblx0XHRcdHRoaXMuX2FjdGl2YXRlKHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uOiB1bmRlZmluZWQsIHRydXN0RGVjbGluZWQ6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWN0aXZhdGUobmV3U2Vzc2lvbiA/PyB1bmRlZmluZWQpO1xuXHRcdHJldHVybiB7IHNlc3Npb246IG5ld1Nlc3Npb24gPz8gdW5kZWZpbmVkLCB0cnVzdERlY2xpbmVkOiBmYWxzZSB9O1xuXHR9XG5cblx0b3BlblF1aWNrQ2hhdChvcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zKTogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuX3N0YXJ0T3BlblNlc3Npb24oKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVRdWlja0NoYXQob3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdGUoc2Vzc2lvbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gTm8gcHJvdmlkZXIgc3VwcG9ydHMgcXVpY2sgY2hhdHM6IGxlYXZlIHdoYXRldmVyIHdhcyB2aXNpYmxlIGFzLWlzXG5cdFx0XHQvLyByYXRoZXIgdGhhbiBhY3RpdmF0aW5nIGFuIHVucmVsYXRlZCB3b3Jrc3BhY2UtYm91bmQgZHJhZnQuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1ZpZXddIG9wZW5RdWlja0NoYXQ6IGNyZWF0ZVF1aWNrQ2hhdCBmYWlsZWQ6ICR7ZX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgb3Blbk5ld0NoYXRJblNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24sIG9wdGlvbnM/OiBJQ3JlYXRlTmV3Q2hhdEluU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9jYW5jZWxSZXN0b3JlKCk7XG5cdFx0dGhpcy5fc3RhcnRPcGVuU2Vzc2lvbigpO1xuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuY3JlYXRlTmV3Q2hhdEluU2Vzc2lvbihzZXNzaW9uLCBvcHRpb25zKTtcblx0XHRpZiAoIWNoYXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9hY3RpdmF0ZShzZXNzaW9uKTtcblxuXHRcdC8vIFNldCB0aGUgY2hhdCBhcyB0aGUgYWN0aXZlIGNoYXRcblx0XHR0aGlzLl92aXNpYmlsaXR5LnNldEFjdGl2ZUNoYXQoc2Vzc2lvbiwgY2hhdCk7XG5cdH1cblxuXHRzZXRBY3RpdmUoc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmF0ZShzZXNzaW9uKTtcblx0fVxuXG5cdGFzeW5jIHN1Ym1pdE5ld1Nlc3Npb25JbnB1dCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoYWN0aXZlU2Vzc2lvbj8uaXNDcmVhdGVkLmdldCgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGNvbXBvc2VyIGlzIG5vdCBuZWNlc3NhcmlseSBtb3VudGVkIGluIHRoZSBncmlkIChlLmcuIGV2ZXJ5IHNsb3Rcblx0XHQvLyBob2xkcyBhIGNyZWF0ZWQgc2Vzc2lvbiksIHNvIG9wZW4gaXQgYmVmb3JlIHN1Ym1pdHRpbmcgaW50byBpdC5cblx0XHRpZiAoIXRoaXMuc2Vzc2lvbnNQYXJ0U2VydmljZS5nZXRTZXNzaW9uVmlldyhhY3RpdmVTZXNzaW9uPy5zZXNzaW9uSWQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9wZW5OZXdTZXNzaW9uKCk7XG5cdFx0XHRhY3RpdmVTZXNzaW9uID0gdGhpcy5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKGFjdGl2ZVNlc3Npb24/LmlzQ3JlYXRlZC5nZXQoKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnNQYXJ0U2VydmljZS5nZXRTZXNzaW9uVmlldyhhY3RpdmVTZXNzaW9uPy5zZXNzaW9uSWQpPy5zdWJtaXRJbnB1dCgpID8/IGZhbHNlO1xuXHR9XG5cblx0dG9nZ2xlU2Vzc2lvblN0aWNraW5lc3Moc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBzdGlja3kgPSB0aGlzLl92aXNpYmlsaXR5LnRvZ2dsZVN0aWNraW5lc3Moc2Vzc2lvbik7XG5cdFx0dGhpcy5fb25EaWRUb2dnbGVTZXNzaW9uU3RpY2tpbmVzcy5maXJlKHsgc2Vzc2lvbiwgc3RpY2t5IH0pO1xuXHR9XG5cblx0aW5zZXJ0QXQoc2Vzc2lvbjogSVNlc3Npb24sIHRhcmdldFNlc3Npb25JZDogc3RyaW5nLCBzaWRlOiAnbGVmdCcgfCAncmlnaHQnLCBhY3RpdmF0ZTogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmlsaXR5Lmluc2VydEF0KHNlc3Npb24sIHRhcmdldFNlc3Npb25JZCwgc2lkZSwgYWN0aXZhdGUpO1xuXHR9XG5cblx0Y2xvc2VTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gc2Vzc2lvbj8uc2Vzc2lvbklkO1xuXHRcdGNvbnN0IHZpc2libGUgPSB0aGlzLl92aXNpYmlsaXR5LnZpc2libGVTZXNzaW9ucy5nZXQoKTtcblx0XHRpZiAoIXZpc2libGUuc29tZShzID0+IHM/LnNlc3Npb25JZCA9PT0gc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBlbXB0eS9uZXctc2Vzc2lvbiBzbG90IGhhcyBubyBzZXNzaW9uSWQ7IGJvdGggaXQgYW5kIFwibm8gYWN0aXZlXG5cdFx0Ly8gc2Vzc2lvblwiIGFyZSByZXBvcnRlZCBieSBhY3RpdmVTZXNzaW9uIGFzIHVuZGVmaW5lZC4gU2luY2Ugd2UgYWxyZWFkeVxuXHRcdC8vIGNvbmZpcm1lZCB0aGUgc2xvdCBpcyBwcmVzZW50IGluIGB2aXNpYmxlYCwgdW5kZWZpbmVkID09PSB1bmRlZmluZWRcblx0XHQvLyBoZXJlIG1lYW5zIHRoZSBlbXB0eSBzbG90IGlzIGFjdGl2ZS5cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uSWQgPSB0aGlzLl92aXNpYmlsaXR5LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZDtcblx0XHRjb25zdCB3YXNBY3RpdmUgPSBhY3RpdmVTZXNzaW9uSWQgPT09IHNlc3Npb25JZDtcblxuXHRcdC8vIFJlbWVtYmVyIHRoZSBzbG90IHNvIFJlb3BlbiBDbG9zZWQgQ2hhdCBvciBTZXNzaW9uIGNhbiBwdXQgaXQgYmFja1xuXHRcdC8vIGV4YWN0bHkgd2hlcmUgaXQgd2FzLlxuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9jbG9zZWRJdGVtcy5yZWNvcmRDbG9zZWRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdC8vIERpc2NhcmQgdGhlIGluLXByb2dyZXNzIG5ldyBzZXNzaW9uIHdoZW4gaXRzIHNsb3QgKG9yIHRoZSBlbXB0eSBzbG90KVxuXHRcdC8vIGlzIHRoZSBvbmUgYmVpbmcgY2xvc2VkOyBjbG9zaW5nIGFuIHVucmVsYXRlZCBzZXNzaW9uIGxlYXZlcyBpdCBpbnRhY3QuXG5cdFx0dGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmRpc2NhcmROZXdTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0dGhpcy5fdmlzaWJpbGl0eS5yZW1vdmVNYW55KFtzZXNzaW9uSWRdKTtcblxuXHRcdGlmICghd2FzQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gcmVtb3ZlTWFueSBhbHJlYWR5IHBpY2tlZCBhIGZhbGxiYWNrIGFjdGl2ZSBzZXNzaW9uIChvciBjbGVhcmVkIHRoZVxuXHRcdC8vIGFjdGl2ZSBvYnNlcnZhYmxlIHdoZW4gbm8gc2xvdCByZW1haW5zKTsgZHJpdmUgdGhlIGZ1bGwgb3BlbiBmbG93LlxuXHRcdGNvbnN0IGZhbGxiYWNrID0gdGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmIChmYWxsYmFjayA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLm9wZW5OZXdTZXNzaW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xvc2VBbGxTZXNzaW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBpZHMgPSB0aGlzLl92aXNpYmlsaXR5LnZpc2libGVTZXNzaW9ucy5nZXQoKVxuXHRcdFx0LmZpbHRlcigocyk6IHMgaXMgSUFjdGl2ZVNlc3Npb24gPT4gISFzKVxuXHRcdFx0Lm1hcChzID0+IHMuc2Vzc2lvbklkKTtcblx0XHRpZiAoaWRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kaXNjYXJkTmV3U2Vzc2lvbigpO1xuXG5cdFx0Ly8gUmVtb3ZlIGV2ZXJ5IHZpc2libGUgc2Vzc2lvbiBpbiBhIHNpbmdsZSBwYXNzOyB0aGUgdmlzaWJpbGl0eSBtb2RlbFxuXHRcdC8vIGNsZWFycyB0aGUgYWN0aXZlIHNlc3Npb24sIHdoaWNoIGRyaXZlcyB0aGUgZ3JpZCBiYWNrIHRvIHRoZVxuXHRcdC8vIG5ldy1zZXNzaW9uIHZpZXcgdmlhIHRoZSByZWNvbmNpbGUgYXV0b3J1bi5cblx0XHR0aGlzLl92aXNpYmlsaXR5LnJlbW92ZU1hbnkoaWRzKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVJbml0aWFsQ2hhdChzZXNzaW9uOiBJU2Vzc2lvbik6IElDaGF0IHtcblx0XHRjb25zdCBjaGF0cyA9IHNlc3Npb24uY2hhdHMuZ2V0KCk7XG5cdFx0bGV0IGluaXRpYWxDaGF0ID0gY2hhdHNbMF07XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0aWYgKHNlc3Npb25TdGF0ZT8uYWN0aXZlQ2hhdFJlc291cmNlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBsYXN0Q2hhdFJlc291cmNlID0gVVJJLnBhcnNlKHNlc3Npb25TdGF0ZS5hY3RpdmVDaGF0UmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBmb3VuZCA9IGNoYXRzLmZpbmQoYyA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChjLnJlc291cmNlLCBsYXN0Q2hhdFJlc291cmNlKSk7XG5cdFx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHRcdGluaXRpYWxDaGF0ID0gZm91bmQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbU2Vzc2lvbnNWaWV3XSBGYWlsZWQgdG8gcmVzdG9yZSBhY3RpdmUgY2hhdCBmcm9tIHN0b3JlZCBzZXNzaW9uIHN0YXRlJywgZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaW5pdGlhbENoYXQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHJlc291cmNlIHN0cmluZ3Mgb2YgY2hhdHMgdGhhdCB3ZXJlIGNsb3NlZCAoaGlkZGVuIGZyb20gdGhlIHRhYiBzdHJpcClcblx0ICogd2hlbiB0aGUgc2Vzc2lvbiB3YXMgbGFzdCBzYXZlZCwgc28gdGhleSBzdGF5IGhpZGRlbiBhY3Jvc3MgcmVsb2Fkcy4gU3RhbGVcblx0ICogVVJJcyB0aGF0IG5vIGxvbmdlciBtYXRjaCBhIGNoYXQgYXJlIGhhcm1sZXNzOiB0aGUgdmlzaWJsZSBzZXNzaW9uXG5cdCAqIGludGVyc2VjdHMgdGhlbSB3aXRoIHRoZSBsaXZlIGNoYXQgbGlzdC5cblx0ICovXG5cdHByaXZhdGUgX3Jlc3RvcmVDbG9zZWRDaGF0cyhzZXNzaW9uOiBJU2Vzc2lvbik6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbi5yZXNvdXJjZSk/LmNsb3NlZENoYXRSZXNvdXJjZXMgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93YWl0Rm9yU2Vzc2lvblRvTG9hZChzZXNzaW9uOiBJU2Vzc2lvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCFzZXNzaW9uLmxvYWRpbmcuZ2V0KCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0bGV0IHJlc29sdmVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBmaW5pc2ggPSAoKSA9PiB7XG5cdFx0XHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKGZpbmlzaCkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0aWYgKCFzZXNzaW9uLmxvYWRpbmcucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0ZmluaXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkU2Vzc2lvblN0YXRlcygpOiBSZXNvdXJjZU1hcDxJU2Vzc2lvblN0YXRlPiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IFJlc291cmNlTWFwPElTZXNzaW9uU3RhdGU+KCk7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQUNUSVZFX1NFU1NJT05fU1RBVEVTX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiBtYXA7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBlbnRyaWVzOiBJU2Vzc2lvblN0YXRlW10gPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGVudHJ5LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdG1hcC5zZXQodXJpLCBlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0fVxuXHRcdHJldHVybiBtYXA7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlU2Vzc2lvblN0YXRlcygpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy5fc25hcHNob3RWaXNpYmxlU2Vzc2lvblN0YXRlcygpO1xuXG5cdFx0Ly8gQWxzbyBwZXJzaXN0IHRoZSBwZXItc2Vzc2lvbiBzdGF0ZSAoY2xvc2VkIGNoYXRzLCBsYXN0IGFjdGl2ZSBjaGF0KSBvZlxuXHRcdC8vIHNlc3Npb25zIHRoYXQgYXJlIG5vdCBjdXJyZW50bHkgdmlzaWJsZSwgc28gYSBzZXNzaW9uIHN3aXRjaGVkIG91dCBvZlxuXHRcdC8vIHRoZSBncmlkIGtlZXBzIGl0cyBjbG9zZWQtY2hhdCBzZXQgYWNyb3NzIGEgcmVsb2FkLiBHcmlkLXBsYWNlbWVudFxuXHRcdC8vIGZpZWxkcyBhcmUgc3RyaXBwZWQgc28gdGhleSBhcmUgbm90IHJlc3RvcmVkIGludG8gdGhlIGdyaWQuXG5cdFx0Y29uc3QgdmlzaWJsZSA9IG5ldyBSZXNvdXJjZU1hcDx0cnVlPigpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0dmlzaWJsZS5zZXQoVVJJLnBhcnNlKGVudHJ5LnNlc3Npb25SZXNvdXJjZSksIHRydWUpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZSwgc3RhdGVdIG9mIHRoaXMuX3Nlc3Npb25TdGF0ZXMpIHtcblx0XHRcdGlmICh2aXNpYmxlLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHN0YXRlLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0YWN0aXZlQ2hhdFJlc291cmNlOiBzdGF0ZS5hY3RpdmVDaGF0UmVzb3VyY2UsXG5cdFx0XHRcdGNsb3NlZENoYXRSZXNvdXJjZXM6IHN0YXRlLmNsb3NlZENoYXRSZXNvdXJjZXMsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFDVElWRV9TRVNTSU9OX1NUQVRFU19LRVksIEpTT04uc3RyaW5naWZ5KGVudHJpZXMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc25hcHNob3RWaXNpYmxlU2Vzc2lvblN0YXRlcygpOiBJU2Vzc2lvblN0YXRlW10ge1xuXHRcdGNvbnN0IGFjdGl2ZUlkID0gdGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQ7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHRoaXMuX3Zpc2liaWxpdHkudmlzaWJsZVNlc3Npb25zLmdldCgpO1xuXHRcdGNvbnN0IGVudHJpZXM6IElTZXNzaW9uU3RhdGVbXSA9IFtdO1xuXHRcdHZpc2libGUuZm9yRWFjaCgoc2Vzc2lvbiwgaW5kZXgpID0+IHtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9uLnN0YXR1cy5nZXQoKSA9PT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLmRlbGV0ZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBLZWVwIHRoZSBpbi1tZW1vcnkgcmVjb3JkIHVwIHRvIGRhdGUgc28gdGhlIHNlc3Npb24ncyBsYXN0IGFjdGl2ZVxuXHRcdFx0Ly8gY2hhdCBpcyByZW1lbWJlcmVkIHdoaWxlIHJlb3BlbmluZyBpdCB3aXRoaW4gdGhpcyB3aW5kb3cuIFRoZVxuXHRcdFx0Ly8gY2xvc2VkLWNoYXQgc2V0IGlzIG1haW50YWluZWQgZGV0ZXJtaW5pc3RpY2FsbHkgYnlcblx0XHRcdC8vIGBfc2V0Q2hhdENsb3NlZFN0YXRlYDsgcHJlZmVyIGl0IG92ZXIgdGhlIGxpdmUgKGxvYWRlZC1jaGF0cyBvbmx5KVxuXHRcdFx0Ly8gYGNsb3NlZENoYXRzYCBzbyBhIG5vdC15ZXQtbG9hZGVkIHNlc3Npb24gZG9lcyBub3QgZHJvcCBpdHMgc2V0LlxuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IHN0YXRlOiBJU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0YWN0aXZlQ2hhdFJlc291cmNlOiBzZXNzaW9uLmFjdGl2ZUNoYXQuZ2V0KCk/LnJlc291cmNlLnRvU3RyaW5nKCkgPz8gZXhpc3Rpbmc/LmFjdGl2ZUNoYXRSZXNvdXJjZSxcblx0XHRcdFx0Y2xvc2VkQ2hhdFJlc291cmNlczogZXhpc3Rpbmc/LmNsb3NlZENoYXRSZXNvdXJjZXMgPz8gc2Vzc2lvbi5jbG9zZWRDaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHR2aXNpYmxlT3JkZXI6IGluZGV4LFxuXHRcdFx0XHRpc1N0aWNreTogc2Vzc2lvbi5zdGlja3kuZ2V0KCksXG5cdFx0XHRcdGlzQWN0aXZlOiBzZXNzaW9uLnNlc3Npb25JZCA9PT0gYWN0aXZlSWQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN0YXRlcy5zZXQoc2Vzc2lvbi5yZXNvdXJjZSwgc3RhdGUpO1xuXHRcdFx0ZW50cmllcy5wdXNoKHN0YXRlKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gZW50cmllcztcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgcGVyc2lzdGVkIHZpc2libGUgc2Vzc2lvbnMsIG9yZGVyZWQgbGVmdC10by1yaWdodCBieSB0aGVpciBzdG9yZWRcblx0ICogZ3JpZCBwb3NpdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2dldFZpc2libGVTZXNzaW9uU3RhdGVzKCk6IElTZXNzaW9uU3RhdGVbXSB7XG5cdFx0Y29uc3Qgc3RhdGVzOiBJU2Vzc2lvblN0YXRlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFssIHN0YXRlXSBvZiB0aGlzLl9zZXNzaW9uU3RhdGVzKSB7XG5cdFx0XHRpZiAoc3RhdGUudmlzaWJsZU9yZGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0c3RhdGVzLnB1c2goc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc3RhdGVzLnNvcnQoKGEsIGIpID0+IChhLnZpc2libGVPcmRlciEgLSBiLnZpc2libGVPcmRlciEpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXYWl0IGZvciB0aGUgc2Vzc2lvbiB3aXRoIHRoZSBnaXZlbiByZXNvdXJjZSB0byBiZWNvbWUgYXZhaWxhYmxlIHZpYSBpdHNcblx0ICogcHJvdmlkZXIsIHJlc29sdmluZyB3aXRoIHRoZSBzZXNzaW9uIG9yIGB1bmRlZmluZWRgIGlmIHRoZSB0b2tlbiBpc1xuXHQgKiBjYW5jZWxsZWQgYmVmb3JlIGl0IGFwcGVhcnMuIFdoZW4gYHRpbWVvdXRgIGlzIGdpdmVuLCByZXNvbHZlcyB3aXRoXG5cdCAqIGB1bmRlZmluZWRgIGFmdGVyIHRoYXQgbWFueSBtaWxsaXNlY29uZHMgc28gYSBwZXJzaXN0ZWQgc2Vzc2lvbiB0aGF0IG5ldmVyXG5cdCAqIHJlc3VyZmFjZXMgKGUuZy4gZGVsZXRlZCB3aGlsZSB0aGUgd2luZG93IHdhcyBjbG9zZWQpIGNhbm5vdCBrZWVwIHJlc3RvcmVcblx0ICogcGVuZGluZyBcdTIwMTQgYW5kIGl0cyBwcm92aWRlciBsaXN0ZW5lcnMgYWxpdmUgXHUyMDE0IGluZGVmaW5pdGVseS5cblx0ICovXG5cdHByaXZhdGUgX3dhaXRGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHRpbWVvdXQ/OiBudW1iZXIpOiBQcm9taXNlPElTZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShleGlzdGluZyk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGxldCByZXNvbHZlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgZmluaXNoID0gKHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZShzZXNzaW9uKTtcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBmaW5pc2godW5kZWZpbmVkKSkpO1xuXG5cdFx0XHRjb25zdCB0cnlGaW5kID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRmaW5pc2godW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdFx0ZmluaXNoKHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBQcm92aWRlcnMgKGUuZy4gdGhlIGFnZW50IGhvc3QpIGxvYWQgdGhlaXIgc2Vzc2lvbiBjYWNoZVxuXHRcdFx0Ly8gYXN5bmNocm9ub3VzbHksIHNvIHRoZSBzZXNzaW9uIG1heSBhcHBlYXIgdmlhIGVpdGhlciBhIHByb3ZpZGVyXG5cdFx0XHQvLyBjaGFuZ2Ugb3IgYSBzZXNzaW9uIGxpc3QgY2hhbmdlLlxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvdmlkZXJzKCgpID0+IHRyeUZpbmQoKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHRyeUZpbmQoKSkpO1xuXG5cdFx0XHQvLyBHaXZlIHVwIGFmdGVyIHRoZSB0aW1lb3V0IHNvIHRoZSBsaXN0ZW5lcnMgYWJvdmUgYXJlIG5vdCByZXRhaW5lZFxuXHRcdFx0Ly8gZm9yZXZlciB3aGVuIHRoZSBzZXNzaW9uIGlzIGdvbmUgZm9yIGdvb2QuXG5cdFx0XHRpZiAodGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiBmaW5pc2godW5kZWZpbmVkKSwgdGltZW91dCkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbiBjYXNlIHRoZSBzZXNzaW9uIGJlY2FtZSBhdmFpbGFibGUgYmV0d2VlbiB0aGUgaW5pdGlhbCBjaGVjayBhbmRcblx0XHRcdC8vIHRoZSBsaXN0ZW5lciByZWdpc3RyYXRpb24uXG5cdFx0XHR0cnlGaW5kKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyByZXN0b3JlVmlzaWJsZVNlc3Npb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXN0b3JlVmlzaWJsZVNlc3Npb25zKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2luaXRpYWxSZXN0b3JlQ29tcGxldGUuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzdG9yZVZpc2libGVTZXNzaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBPcmRlcmVkIGxpc3Qgb2Ygc2xvdHMgdG8gcmVzdG9yZTogcmVhbCBzZXNzaW9ucyBwbHVzLCBvcHRpb25hbGx5LCB0aGVcblx0XHQvLyBlbXB0eSAobmV3LXNlc3Npb24pIHNsb3Qgd2hlbiBpdCB3YXMgYWN0aXZlLlxuXHRcdGludGVyZmFjZSBJUmVzdG9yZVRhcmdldCB7XG5cdFx0XHRyZWFkb25seSByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0cmVhZG9ubHkgaXNTdGlja3k6IGJvb2xlYW47XG5cdFx0XHRyZWFkb25seSBpc0FjdGl2ZTogYm9vbGVhbjtcblx0XHRcdHJlYWRvbmx5IG9yZGVyOiBudW1iZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0czogSVJlc3RvcmVUYXJnZXRbXSA9IHRoaXMuX2dldFZpc2libGVTZXNzaW9uU3RhdGVzKCkubWFwKHN0YXRlID0+ICh7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKHN0YXRlLnNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRpc1N0aWNreTogISFzdGF0ZS5pc1N0aWNreSxcblx0XHRcdGlzQWN0aXZlOiAhIXN0YXRlLmlzQWN0aXZlLFxuXHRcdFx0b3JkZXI6IHN0YXRlLnZpc2libGVPcmRlciEsXG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRhcmdldHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0YXJnZXRzLnB1c2goeyByZXNvdXJjZTogdW5kZWZpbmVkLCBpc1N0aWNreTogZmFsc2UsIGlzQWN0aXZlOiB0cnVlLCBvcmRlcjogMSB9KTtcblx0XHR9XG5cblx0XHR0YXJnZXRzLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKTtcblxuXHRcdGxldCBhY3RpdmVJZHggPSB0YXJnZXRzLmZpbmRJbmRleCh0ID0+IHQuaXNBY3RpdmUpO1xuXHRcdGlmIChhY3RpdmVJZHggPCAwKSB7XG5cdFx0XHRhY3RpdmVJZHggPSAwO1xuXHRcdH1cblxuXHRcdC8vIFVzZSBhIGRlZGljYXRlZCBjYW5jZWxsYXRpb24gdG9rZW4gKG5vdCB0aGUgc2hhcmVkIG9wZW4tc2Vzc2lvbiBvbmUpXG5cdFx0Ly8gc28gdGhhdCBhIG5ldy1zZXNzaW9uIGRyYWZ0IGNyZWF0ZWQgZHVyaW5nIHJlc3RvcmUgKGUuZy4gYnkgdGhlXG5cdFx0Ly8gbmV3LWNoYXQgY29tcG9zZXIgb24gc3RhcnR1cCkgZG9lcyBub3QgYWJvcnQgcmVzdG9yaW5nIHRoZSBncmlkLiBUaGVcblx0XHQvLyB0b2tlbiBpcyBjYW5jZWxsZWQgb25seSB3aGVuIHRoZSB1c2VyIGV4cGxpY2l0bHkgb3BlbnMgYSBzZXNzaW9uLlxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX3Jlc3RvcmVDdHMudmFsdWUgPSBjdHM7XG5cdFx0Y29uc3QgdG9rZW4gPSBjdHMudG9rZW47XG5cblx0XHQvLyBTZXNzaW9ucyByZXNvbHZlZCBzbyBmYXIsIGluZGV4ZWQgYnkgdGhlaXIgcG9zaXRpb24gaW4gYHRhcmdldHNgLlxuXHRcdC8vIGBudWxsYCBtYXJrcyB0aGUgZW1wdHkgKG5ldy1zZXNzaW9uKSBzbG90LCB3aGljaCBoYXMgbm8gc2Vzc2lvbi5cblx0XHRjb25zdCByZXNvbHZlZDogKElTZXNzaW9uIHwgbnVsbCB8IHVuZGVmaW5lZClbXSA9IG5ldyBBcnJheSh0YXJnZXRzLmxlbmd0aCkuZmlsbCh1bmRlZmluZWQpO1xuXG5cdFx0LyoqXG5cdFx0ICogSW5zZXJ0IGEgcmVzb2x2ZWQgc2Vzc2lvbiBpbnRvIHRoZSBncmlkIG5leHQgdG8gdGhlIG5lYXJlc3Rcblx0XHQgKiBhbHJlYWR5LXBsYWNlZCBuZWlnaGJvdXIsIHByZXNlcnZpbmcgdGhlIHBlcnNpc3RlZCBvcmRlciByZWdhcmRsZXNzIG9mXG5cdFx0ICogdGhlIG9yZGVyIGluIHdoaWNoIHNlc3Npb25zIGJlY29tZSBhdmFpbGFibGUuIFdoZW4gYSBuZWlnaGJvdXIgZXhpc3RzXG5cdFx0ICogdGhlIGFjdGl2ZSBzZXNzaW9uIGlzIGxlZnQgdW5jaGFuZ2VkOyBvbmx5IGluIHRoZSBlZGdlIGNhc2Ugd2hlcmUgbm9cblx0XHQgKiBuZWlnaGJvdXIgaGFzIGJlZW4gcGxhY2VkIHlldCAoZS5nLiB0aGUgYWN0aXZlIHRhcmdldCBuZXZlciByZXN1cmZhY2VkLFxuXHRcdCAqIHNvIHRoZSBncmlkIGxhaWQgb3V0IGVtcHR5KSBkb2VzIHRoZSBmaXJzdCBzZXNzaW9uIHRvIGFycml2ZSBiZWNvbWVcblx0XHQgKiBhY3RpdmUgYXMgYSBzZW5zaWJsZSBmYWxsYmFjay5cblx0XHQgKi9cblx0XHRjb25zdCBwbGFjZSA9IChpZHg6IG51bWJlciwgc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkID0+IHtcblx0XHRcdGxldCBhbmNob3I6IHsgaWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgc2lkZTogJ2xlZnQnIHwgJ3JpZ2h0JyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChsZXQgaiA9IGlkeCAtIDE7IGogPj0gMCAmJiAhYW5jaG9yOyBqLS0pIHtcblx0XHRcdFx0Y29uc3QgbmVpZ2hib3VyID0gcmVzb2x2ZWRbal07XG5cdFx0XHRcdGlmIChuZWlnaGJvdXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGFuY2hvciA9IHsgaWQ6IG5laWdoYm91cj8uc2Vzc2lvbklkLCBzaWRlOiAncmlnaHQnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGogPSBpZHggKyAxOyBqIDwgdGFyZ2V0cy5sZW5ndGggJiYgIWFuY2hvcjsgaisrKSB7XG5cdFx0XHRcdGNvbnN0IG5laWdoYm91ciA9IHJlc29sdmVkW2pdO1xuXHRcdFx0XHRpZiAobmVpZ2hib3VyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRhbmNob3IgPSB7IGlkOiBuZWlnaGJvdXI/LnNlc3Npb25JZCwgc2lkZTogJ2xlZnQnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmVzb2x2ZWRbaWR4XSA9IHNlc3Npb247XG5cdFx0XHRpZiAoYW5jaG9yKSB7XG5cdFx0XHRcdHRoaXMuX3Zpc2liaWxpdHkuaW5zZXJ0QXQoc2Vzc2lvbiwgYW5jaG9yLmlkLCBhbmNob3Iuc2lkZSwgZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZhdGUoc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGFyZ2V0c1tpZHhdLmlzU3RpY2t5KSB7XG5cdFx0XHRcdHRoaXMuX3Zpc2liaWxpdHkudG9nZ2xlU3RpY2tpbmVzcyhzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgYWN0aXZlIHNlc3Npb24gZmlyc3Qgc28gaXQgY2FuIGFjdCBhcyB0aGUgYW5jaG9yIGZvciB0aGVcblx0XHQvLyBpbml0aWFsIGxheW91dC4gVGhlIGVtcHR5IHNsb3QgcmVzb2x2ZXMgaW1tZWRpYXRlbHkgKHRoZSBncmlkIGFscmVhZHlcblx0XHQvLyBzaG93cyB0aGUgbmV3LXNlc3Npb24gdmlldykuIExvYWQgcHJvZ3Jlc3MgaXMgc3VyZmFjZWQgcGVyLWxlYWYgYnkgdGhlXG5cdFx0Ly8gY2hhdCB2aWV3IGl0c2VsZiBvbmNlIHRoZSBncmlkIGlzIGxhaWQgb3V0IChtaXJyb3JpbmcgaG93IGVhY2ggZWRpdG9yXG5cdFx0Ly8gZ3JvdXAgb3ducyBpdHMgcHJvZ3Jlc3MgYmFyKSwgc28gbm8gcGFydC13aWRlIHByb2dyZXNzIGlzIGRyaXZlbiBoZXJlLlxuXHRcdGNvbnN0IGFjdGl2ZVRhcmdldCA9IHRhcmdldHNbYWN0aXZlSWR4XTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUHJvbWlzZTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4gPSBhY3RpdmVUYXJnZXQucmVzb3VyY2Vcblx0XHRcdD8gdGhpcy5fd2FpdEZvclNlc3Npb24oYWN0aXZlVGFyZ2V0LnJlc291cmNlLCB0b2tlbiwgUkVTVE9SRV9TRVNTSU9OX1dBSVRfVElNRU9VVCkudGhlbihzZXNzaW9uID0+IHNlc3Npb24gPz8gdW5kZWZpbmVkKVxuXHRcdFx0OiBQcm9taXNlLnJlc29sdmU8SVNlc3Npb24gfCB1bmRlZmluZWQ+KHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gYXdhaXQgYWN0aXZlU2Vzc2lvblByb21pc2U7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBMYXkgb3V0IGFsbCBjdXJyZW50bHktYXZhaWxhYmxlIHNlc3Npb25zIGF0b21pY2FsbHkgaW4gdGhlIHBlcnNpc3RlZFxuXHRcdC8vIG9yZGVyIHNvIHRoZSBncmlkIGFwcGVhcnMgaW4gb25lIHNob3QgcmF0aGVyIHRoYW4gYnVpbGRpbmcgdXAgc2xvdCBieVxuXHRcdC8vIHNsb3QgKHdoaWNoIGNhdXNlZCB0aGUgYWN0aXZlIHNlc3Npb24gdG8gYmUgc2hvd24gYWxvbmUgYW5kIHRoZW5cblx0XHQvLyByZWZsb3cgYXMgdGhlIG90aGVycyB3ZXJlIGluc2VydGVkKS4gU2Vzc2lvbnMgd2hvc2UgcHJvdmlkZXIgaGFzIG5vdFxuXHRcdC8vIHlldCBzdXJmYWNlZCB0aGVtIGFyZSBmaWxsZWQgaW4gaW5jcmVtZW50YWxseSBiZWxvdy5cblx0XHRjb25zdCBzbG90czogeyBzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDsgc3RpY2t5OiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGxldCBhY3RpdmVTbG90SW5kZXggPSAtMTtcblx0XHRmb3IgKGxldCBpZHggPSAwOyBpZHggPCB0YXJnZXRzLmxlbmd0aDsgaWR4KyspIHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHRhcmdldHNbaWR4XTtcblx0XHRcdGxldCBzZXNzaW9uOiBJU2Vzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXRhcmdldC5yZXNvdXJjZSkge1xuXHRcdFx0XHRzZXNzaW9uID0gbnVsbDsgLy8gZW1wdHkgbmV3LXNlc3Npb24gc2xvdFxuXHRcdFx0fSBlbHNlIGlmIChpZHggPT09IGFjdGl2ZUlkeCkge1xuXHRcdFx0XHRzZXNzaW9uID0gYWN0aXZlU2Vzc2lvbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbih0YXJnZXQucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlc3Npb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gbm90IHlldCBhdmFpbGFibGUgXHUyMDE0IHBsYWNlZCBpbmNyZW1lbnRhbGx5IGJlbG93XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlZFtpZHhdID0gc2Vzc2lvbjtcblx0XHRcdGlmIChpZHggPT09IGFjdGl2ZUlkeCkge1xuXHRcdFx0XHRhY3RpdmVTbG90SW5kZXggPSBzbG90cy5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRzbG90cy5wdXNoKHsgc2Vzc2lvbjogc2Vzc2lvbiA/PyB1bmRlZmluZWQsIHN0aWNreTogdGFyZ2V0LmlzU3RpY2t5IH0pO1xuXHRcdH1cblx0XHR0aGlzLl92aXNpYmlsaXR5LnJlc3RvcmVHcmlkKHNsb3RzLCBhY3RpdmVTbG90SW5kZXgpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRm9jdXMgaXMgbW92ZWQgaW50byB0aGUgcmVzdG9yZWQgYWN0aXZlIHNlc3Npb24gYnkgdGhlIHJlY29uY2lsZVxuXHRcdC8vIGF1dG9ydW4sIHdoaWNoIG9ic2VydmVzIHRoZSBhY3RpdmUtc2Vzc2lvbiBjaGFuZ2UuXG5cblx0XHQvLyBQbGFjZSBhbnkgc2Vzc2lvbnMgdGhhdCBiZWNhbWUgYXZhaWxhYmxlIGxhdGVyIGluIHRoZWlyIGNvcnJlY3Rcblx0XHQvLyBwb3NpdGlvbnMgYXJvdW5kIHRoZSBhbHJlYWR5LWVzdGFibGlzaGVkIGxheW91dC5cblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0YXJnZXRzLm1hcChhc3luYyAodGFyZ2V0LCBpZHgpID0+IHtcblx0XHRcdGlmIChpZHggPT09IGFjdGl2ZUlkeCB8fCAhdGFyZ2V0LnJlc291cmNlIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHJlc29sdmVkW2lkeF0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fd2FpdEZvclNlc3Npb24odGFyZ2V0LnJlc291cmNlLCB0b2tlbiwgUkVTVE9SRV9TRVNTSU9OX1dBSVRfVElNRU9VVCk7XG5cdFx0XHRpZiAoIXNlc3Npb24gfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgcmVzb2x2ZWRbaWR4XSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHBsYWNlKGlkeCwgc2Vzc2lvbik7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0gU2Vzc2lvbiBOYXZpZ2F0aW9uIC0tXG5cblx0YXN5bmMgb3BlblByZXZpb3VzU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9uYXZpZ2F0aW9uLmdvQmFjaygpO1xuXHR9XG5cblx0YXN5bmMgb3Blbk5leHRTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX25hdmlnYXRpb24uZ29Gb3J3YXJkKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVNlc3Npb25zU2VydmljZSwgU2Vzc2lvbnNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQXNCLFNBQVMsdUJBQXVCO0FBQ3RELFNBQVMsV0FBVztBQUNwQixTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CLGdCQUFpQyxxQkFBcUI7QUFDbEYsU0FBbUYsMEJBQXlFLGtDQUFpRTtBQUM3TixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQ0FBbUM7QUFFNUMsTUFBTSw0QkFBNEI7QUFRbEMsTUFBTSwrQkFBK0I7QUFHckMsTUFBTSwrQkFBK0I7QUFvUDlCLE1BQU0sbUJBQW1CLGdCQUFrQyxpQkFBaUI7QUFFNUUsSUFBTSxrQkFBTixjQUE4QixXQUF1QztBQUFBLEVBb0QzRSxZQUNtQyxnQkFDSixZQUNRLG9CQUNELG1CQUNRLDJCQUNELDBCQUNMLHFCQUNGLG1CQUNHLHNCQUNRLDhCQUMvQztBQUNELFVBQU07QUFYNEI7QUFDSjtBQUNRO0FBQ0Q7QUFDUTtBQUNEO0FBQ0w7QUFDRjtBQUNHO0FBQ1E7QUExRGpELFNB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
