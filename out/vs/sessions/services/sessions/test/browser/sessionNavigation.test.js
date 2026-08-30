import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ChatInteractivity, SessionStatus } from "../../common/session.js";
import { SessionsNavigation } from "../../browser/sessionNavigation.js";
import { SessionsRecencyHistory } from "../../browser/sessionsRecencyHistory.js";
import { Event } from "../../../../../base/common/event.js";
const stubChat = {
  resource: URI.parse("test:///chat"),
  createdAt: /* @__PURE__ */ new Date(),
  title: constObservable("Chat"),
  updatedAt: constObservable(/* @__PURE__ */ new Date()),
  status: constObservable(SessionStatus.Completed),
  changes: constObservable([]),
  checkpoints: constObservable(void 0),
  modelId: constObservable(void 0),
  mode: constObservable(void 0),
  isArchived: constObservable(false),
  isRead: constObservable(true),
  interactivity: constObservable(ChatInteractivity.Full),
  description: constObservable(void 0),
  lastTurnEnd: constObservable(void 0)
};
function stubChatWithId(id, status = SessionStatus.Completed) {
  return {
    resource: URI.parse(`test:///chat-${id}`),
    createdAt: /* @__PURE__ */ new Date(),
    title: constObservable(`Chat ${id}`),
    updatedAt: constObservable(/* @__PURE__ */ new Date()),
    status: constObservable(status),
    checkpoints: constObservable(void 0),
    changes: constObservable([]),
    modelId: constObservable(void 0),
    mode: constObservable(void 0),
    isArchived: constObservable(false),
    isRead: constObservable(true),
    interactivity: constObservable(ChatInteractivity.Full),
    description: constObservable(void 0),
    lastTurnEnd: constObservable(void 0)
  };
}
function stubSession(id, status = SessionStatus.Completed, chats) {
  const sessionChats = chats ?? [stubChat];
  return {
    sessionId: id,
    resource: URI.parse(`test:///${id}`),
    providerId: "test",
    sessionType: "test",
    icon: Codicon.vm,
    createdAt: /* @__PURE__ */ new Date(),
    workspace: constObservable(void 0),
    title: constObservable(`Session ${id}`),
    updatedAt: constObservable(/* @__PURE__ */ new Date()),
    status: constObservable(status),
    changesets: constObservable([]),
    changes: constObservable([]),
    modelId: constObservable(void 0),
    mode: constObservable(void 0),
    loading: constObservable(false),
    isArchived: constObservable(false),
    isRead: constObservable(true),
    description: constObservable(void 0),
    lastTurnEnd: constObservable(void 0),
    chats: constObservable(sessionChats),
    mainChat: constObservable(sessionChats[0]),
    capabilities: constObservable({ supportsMultipleChats: chats !== void 0 && chats.length > 1 })
  };
}
class MockSessionStore {
  constructor() {
    this.activeSession = observableValue("test.activeSession", void 0);
    this.visibleSessions = observableValue("test.visibleSessions", []);
    this.onDidChangeSessions = Event.None;
    this.onDidStartSession = Event.None;
    this.onDidChangeSessionTypes = Event.None;
    this.onWillSendRequest = Event.None;
    this.onDidSendRequest = Event.None;
    this.onDidArchiveSession = Event.None;
    this.onDidUnarchiveSession = Event.None;
    this.onDidDeleteSession = Event.None;
    this.onDidDeleteChat = Event.None;
    this.onDidRenameChat = Event.None;
    this.onDidRenameSession = Event.None;
    this.onDidReplaceSession = Event.None;
    this.onDidDiscardNewSession = Event.None;
    this.onDidReplaceNewDraftSession = Event.None;
    this.onDidToggleSessionStickiness = Event.None;
    this.newSession = constObservable(void 0);
    this.automationSession = constObservable(void 0);
    this._sessions = /* @__PURE__ */ new Map();
    this._openedNewSession = false;
  }
  get lastOpenedResource() {
    return this._openedResource;
  }
  get lastOpenedChatResource() {
    return this._openedChatResource;
  }
  get lastOpenedNewSession() {
    return this._openedNewSession;
  }
  setActiveSession(session, chat) {
    if (session) {
      const activeChat = chat ?? session.chats.get()[0] ?? stubChat;
      const active = {
        ...session,
        isCreated: constObservable(true),
        sticky: constObservable(false),
        activeChat: observableValue(`test.activeChat-${session.sessionId}`, activeChat),
        openChats: session.chats,
        closedChats: constObservable([]),
        lastClosedChat: void 0,
        visibleChatTabs: session.chats,
        shouldShowChatTabs: constObservable(false)
      };
      this.activeSession.set(active, void 0);
    } else {
      this.activeSession.set(void 0, void 0);
    }
  }
  replaceActiveSession(from, to) {
    this.setActiveSession(to);
  }
  setActiveChat(chat) {
    const active = this.activeSession.get();
    if (active) {
      active.activeChat.set(chat, void 0);
    }
  }
  addSession(session) {
    this._sessions.set(session.resource.toString(), session);
  }
  getSessions() {
    return [...this._sessions.values()];
  }
  getRecentlyOpenedSessions() {
    return { recent: [...this._sessions.values()], other: [] };
  }
  getSession(resource) {
    return this._sessions.get(resource.toString());
  }
  getSessionForChatResource(resource) {
    for (const session of this._sessions.values()) {
      const chat = session.chats.get().find((c) => c.resource.toString() === resource.toString());
      if (chat) {
        return { session, chat };
      }
    }
    return void 0;
  }
  getAllSessionTypes() {
    return [];
  }
  getAllProviderSessionTypes() {
    return [];
  }
  getSessionTypesForFolder(_folderUri) {
    return [];
  }
  getQuickChatSessionTypes() {
    return [];
  }
  isNewSessionTargetAvailable(_folderUri, _options) {
    return false;
  }
  isQuickChatTargetAvailable(_options) {
    return false;
  }
  resolveWorkspace(_folderUri) {
    return void 0;
  }
  async openSession(sessionResource) {
    this._openedResource = sessionResource;
    this._openedChatResource = void 0;
    this._openedNewSession = false;
    const session = this._sessions.get(sessionResource.toString());
    if (session) {
      this.setActiveSession(session);
    }
  }
  openNewSession() {
    this._openedNewSession = true;
    this._openedResource = void 0;
    this._openedChatResource = void 0;
    this.setActiveSession(void 0);
    return void 0;
  }
  async openChat(session, chatUri) {
    this._openedResource = session.resource;
    this._openedChatResource = chatUri;
    this._openedNewSession = false;
    const chat = session.chats.get().find((c) => c.resource.toString() === chatUri.toString());
    if (chat) {
      this.setActiveSession(session, chat);
    }
  }
  restoreVisibleSessions() {
    throw new Error("not implemented");
  }
  createNewSession(_folderUri, _options) {
    throw new Error("not implemented");
  }
  createAutomationSession(_folderUri, _options) {
    throw new Error("not implemented");
  }
  createAutomationQuickChat(_options) {
    throw new Error("not implemented");
  }
  createQuickChat(_options) {
    throw new Error("not implemented");
  }
  createNewChatInSession(_session) {
    throw new Error("not implemented");
  }
  forkChatInSession(_session, _sourceChat, _turnId) {
    throw new Error("not implemented");
  }
  createSideChatInSession(_session, _sourceChat, _turnId, _selection) {
    throw new Error("not implemented");
  }
  discardNewSession() {
    throw new Error("not implemented");
  }
  discardAutomationSession() {
    throw new Error("not implemented");
  }
  unsetNewSession() {
    throw new Error("not implemented");
  }
  sendNewChatRequest(_session, _options) {
    throw new Error("not implemented");
  }
  createAndSendNewChatRequest(_folderUri, _options, _createOptions) {
    throw new Error("not implemented");
  }
  createAndSendQuickChatRequest(_options, _createOptions) {
    throw new Error("not implemented");
  }
  sendRequest(_session, _chat, _options) {
    throw new Error("not implemented");
  }
  openNewChatInSession(_session) {
    throw new Error("not implemented");
  }
  openPreviousSession() {
    throw new Error("not implemented");
  }
  openNextSession() {
    throw new Error("not implemented");
  }
  toggleSessionStickiness(_session) {
    throw new Error("not implemented");
  }
  insertAt(_session, _targetSessionId, _side, _activate) {
    throw new Error("not implemented");
  }
  closeSession(_session) {
    throw new Error("not implemented");
  }
  closeAllSessions() {
    throw new Error("not implemented");
  }
  setActive(_session) {
    throw new Error("not implemented");
  }
  cancelCurrentRequest(_session) {
    throw new Error("not implemented");
  }
  archiveSession(_session) {
    throw new Error("not implemented");
  }
  unarchiveSession(_session) {
    throw new Error("not implemented");
  }
  setSessionReadState(_session, _isRead) {
    throw new Error("not implemented");
  }
  markRead(_session) {
    throw new Error("not implemented");
  }
  markUnread(_session) {
    throw new Error("not implemented");
  }
  markAllRead(_sessions) {
    throw new Error("not implemented");
  }
  deleteSession(_session) {
    throw new Error("not implemented");
  }
  deleteSessions(_sessions) {
    throw new Error("not implemented");
  }
  deleteChat(_session, _chatUri) {
    throw new Error("not implemented");
  }
  renameChat(_session, _chatUri, _title) {
    throw new Error("not implemented");
  }
  renameSession(_session, _title) {
    throw new Error("not implemented");
  }
}
suite("SessionsNavigation", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let store;
  let nav;
  let contextKeyService;
  setup(() => {
    const disposables = ds.add(new DisposableStore());
    store = new MockSessionStore();
    contextKeyService = disposables.add(new MockContextKeyService());
    const storageService = disposables.add(new InMemoryStorageService());
    const recency = disposables.add(new SessionsRecencyHistory(storageService, new NullLogService()));
    nav = disposables.add(new SessionsNavigation(
      store,
      store.activeSession,
      store,
      recency,
      contextKeyService,
      new NullLogService()
    ));
  });
  function canGoBack() {
    return contextKeyService.getContextKeyValue("sessionsCanGoBack") ?? false;
  }
  function canGoForward() {
    return contextKeyService.getContextKeyValue("sessionsCanGoForward") ?? false;
  }
  test("initially cannot go back or forward", () => {
    assert.strictEqual(canGoBack(), false);
    assert.strictEqual(canGoForward(), false);
  });
  test("can go back after navigating to two sessions", () => {
    const s1 = stubSession("s1");
    const s2 = stubSession("s2");
    store.addSession(s1);
    store.addSession(s2);
    store.setActiveSession(s1);
    store.setActiveSession(s2);
    assert.strictEqual(canGoBack(), true);
    assert.strictEqual(canGoForward(), false);
  });
  test("goBack restores previous session", async () => {
    const s1 = stubSession("s1");
    const s2 = stubSession("s2");
    store.addSession(s1);
    store.addSession(s2);
    store.setActiveSession(s1);
    store.setActiveSession(s2);
    await nav.goBack();
    assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
    assert.strictEqual(canGoBack(), false);
    assert.strictEqual(canGoForward(), true);
  });
  test("goForward restores next session after goBack", async () => {
    const s1 = stubSession("s1");
    const s2 = stubSession("s2");
    store.addSession(s1);
    store.addSession(s2);
    store.setActiveSession(s1);
    store.setActiveSession(s2);
    await nav.goBack();
    await nav.goForward();
    assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());
    assert.strictEqual(canGoBack(), true);
    assert.strictEqual(canGoForward(), false);
  });
  test("opening a new session after goBack keeps older entries reachable (MRU, no truncation)", async () => {
    const s1 = stubSession("s1");
    const s2 = stubSession("s2");
    const s3 = stubSession("s3");
    store.addSession(s1);
    store.addSession(s2);
    store.addSession(s3);
    store.setActiveSession(s1);
    store.setActiveSession(s2);
    await nav.goBack();
    store.setActiveSession(s3);
    assert.strictEqual(canGoBack(), true);
    assert.strictEqual(canGoForward(), false);
    await nav.goBack();
    assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());
    await nav.goBack();
    assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
  });
  test("reopening an earlier session moves it to the front of recency (no duplicates)", async () => {
    const s1 = stubSession("s1");
    const s2 = stubSession("s2");
    const s3 = stubSession("s3");
    store.addSession(s1);
    store.addSession(s2);
    store.addSession(s3);
    store.setActiveSession(s1);
    store.setActiveSession(s2);
    store.setActiveSession(s3);
    await nav.goBack();
    await nav.goBack();
    await nav.goForward();
    await nav.goForward();
    store.setActiveSession(s1);
    await nav.goBack();
    assert.strictEqual(store.lastOpenedResource?.toString(), s3.resource.toString());
    await nav.goBack();
    assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());
    assert.strictEqual(canGoBack(), false);
  });
  test("navigating to new-session view after a session enables go back", async () => {
    const s1 = stubSession("s1");
    store.addSession(s1);
    store.setActiveSession(s1);
    store.setActiveSession(void 0);
    assert.strictEqual(canGoBack(), true);
    assert.strictEqual(canGoForward(), false);
    await nav.goBack();
    assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
  });
  test("navigating to new-session view with no history does not enable go back", () => {
    store.setActiveSession(void 0);
    assert.strictEqual(canGoBack(), false);
  });
  test("duplicate consecutive session is not added to history", () => {
    const s1 = stubSession("s1");
    store.addSession(s1);
    store.setActiveSession(s1);
    store.setActiveSession(s1);
    assert.strictEqual(canGoBack(), false);
  });
  test("removed sessions are cleaned from history", async () => {
    const s1 = stubSession("s1");
    const s2 = stubSession("s2");
    const s3 = stubSession("s3");
    store.addSession(s1);
    store.addSession(s2);
    store.addSession(s3);
    store.setActiveSession(s1);
    store.setActiveSession(s2);
    store.setActiveSession(s3);
    nav.onDidRemoveSessions({ added: [], removed: [s2], changed: [] });
    await nav.goBack();
    assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
  });
  test("untitled (new) session is not recorded in history and does not enable go back", () => {
    const pending = stubSession("pending", SessionStatus.Untitled);
    store.addSession(pending);
    store.setActiveSession(pending);
    assert.strictEqual(canGoBack(), false);
    const s1 = stubSession("s1");
    store.addSession(s1);
    store.setActiveSession(s1);
    assert.strictEqual(canGoBack(), false);
    const s2 = stubSession("s2");
    store.addSession(s2);
    store.setActiveSession(s2);
    assert.strictEqual(canGoBack(), true);
  });
  test("go to new-session, goBack, go to new-session again still enables back", async () => {
    const s1 = stubSession("s1");
    store.addSession(s1);
    store.setActiveSession(s1);
    store.setActiveSession(void 0);
    assert.strictEqual(canGoBack(), true, "back enabled after first new-session view");
    await nav.goBack();
    assert.strictEqual(canGoBack(), false, "back disabled on s1");
    store.setActiveSession(void 0);
    assert.strictEqual(canGoBack(), true, "back enabled after second new-session view");
  });
  test("switching chats within a session is recorded in history", () => {
    const chatA = stubChatWithId("a");
    const chatB = stubChatWithId("b");
    const s1 = stubSession("s1", SessionStatus.Completed, [chatA, chatB]);
    store.addSession(s1);
    store.setActiveSession(s1, chatA);
    assert.strictEqual(canGoBack(), false);
    store.setActiveChat(chatB);
    assert.strictEqual(canGoBack(), true, "back enabled after switching chat within session");
  });
  test("goBack restores previous chat within a session", async () => {
    const chatA = stubChatWithId("a");
    const chatB = stubChatWithId("b");
    const s1 = stubSession("s1", SessionStatus.Completed, [chatA, chatB]);
    store.addSession(s1);
    store.setActiveSession(s1, chatA);
    store.setActiveChat(chatB);
    await nav.goBack();
    assert.strictEqual(store.lastOpenedChatResource?.toString(), chatA.resource.toString());
    assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
  });
  test("navigation across sessions and chats works together", async () => {
    const chatA = stubChatWithId("a");
    const chatB = stubChatWithId("b");
    const s1 = stubSession("s1", SessionStatus.Completed, [chatA, chatB]);
    const s2 = stubSession("s2");
    store.addSession(s1);
    store.addSession(s2);
    store.setActiveSession(s1, chatA);
    store.setActiveChat(chatB);
    store.setActiveSession(s2);
    await nav.goBack();
    assert.strictEqual(store.lastOpenedChatResource?.toString(), chatB.resource.toString());
    await nav.goBack();
    assert.strictEqual(store.lastOpenedChatResource?.toString(), chatA.resource.toString());
    await nav.goForward();
    assert.strictEqual(store.lastOpenedChatResource?.toString(), chatB.resource.toString());
    await nav.goForward();
    assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());
  });
  test("untitled chats are not recorded with a chat resource", () => {
    const chatUntitled = stubChatWithId("untitled", SessionStatus.Untitled);
    const s1 = stubSession("s1", SessionStatus.Completed, [chatUntitled]);
    store.addSession(s1);
    store.setActiveSession(s1, chatUntitled);
    assert.strictEqual(canGoBack(), false, "untitled chat produces a session-only entry, no second entry");
  });
  test("goBack falls back to openSession when chat was deleted", async () => {
    const chatA = stubChatWithId("a");
    const chatB = stubChatWithId("b");
    const chatsObs = observableValue("test.chats", [chatA, chatB]);
    const s1 = {
      ...stubSession("s1", SessionStatus.Completed, [chatA, chatB]),
      chats: chatsObs
    };
    const s2 = stubSession("s2");
    store.addSession(s1);
    store.addSession(s2);
    store.setActiveSession(s1, chatA);
    store.setActiveChat(chatB);
    store.setActiveSession(s2);
    chatsObs.set([chatA], void 0);
    await nav.goBack();
    assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
    assert.strictEqual(store.lastOpenedChatResource, void 0, "should not open a stale chat");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHNlc3Npb25zXFx0ZXN0XFxicm93c2VyXFxzZXNzaW9uTmF2aWdhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgSVByb3ZpZGVyU2Vzc2lvblR5cGUsIElSZWNlbnRseU9wZW5lZFNlc3Npb25zLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIElDaGF0LCBJU2Vzc2lvbiwgSVNlc3Npb25UeXBlLCBJU2Vzc2lvbldvcmtzcGFjZSwgSVNpZGVDaGF0U2VsZWN0aW9uLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNOYXZpZ2F0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uTmF2aWdhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc1JlY2VuY3lIaXN0b3J5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uc1JlY2VuY3lIaXN0b3J5LmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVNlbmRSZXF1ZXN0T3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uc1Byb3ZpZGVyLmpzJztcblxuY29uc3Qgc3R1YkNoYXQgPSB7XG5cdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdCcpLFxuXHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG5cdHRpdGxlOiBjb25zdE9ic2VydmFibGUoJ0NoYXQnKSxcblx0dXBkYXRlZEF0OiBjb25zdE9ic2VydmFibGUobmV3IERhdGUoKSksXG5cdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSxcblx0Y2hhbmdlczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0Y2hlY2twb2ludHM6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRtb2RlbElkOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0bW9kZTogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdGlzQXJjaGl2ZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdGlzUmVhZDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRpbnRlcmFjdGl2aXR5OiBjb25zdE9ic2VydmFibGUoQ2hhdEludGVyYWN0aXZpdHkuRnVsbCksXG5cdGRlc2NyaXB0aW9uOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0bGFzdFR1cm5FbmQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxufTtcblxuZnVuY3Rpb24gc3R1YkNoYXRXaXRoSWQoaWQ6IHN0cmluZywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzID0gU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpOiBJQ2hhdCB7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgdGVzdDovLy9jaGF0LSR7aWR9YCksXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuXHRcdHRpdGxlOiBjb25zdE9ic2VydmFibGUoYENoYXQgJHtpZH1gKSxcblx0XHR1cGRhdGVkQXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZSgpKSxcblx0XHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZShzdGF0dXMpLFxuXHRcdGNoZWNrcG9pbnRzOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRjaGFuZ2VzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdG1vZGVsSWQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdG1vZGU6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGlzQXJjaGl2ZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0aXNSZWFkOiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0aW50ZXJhY3Rpdml0eTogY29uc3RPYnNlcnZhYmxlKENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpLFxuXHRcdGRlc2NyaXB0aW9uOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRsYXN0VHVybkVuZDogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHN0dWJTZXNzaW9uKGlkOiBzdHJpbmcsIHN0YXR1czogU2Vzc2lvblN0YXR1cyA9IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBjaGF0cz86IElDaGF0W10pOiBJU2Vzc2lvbiB7XG5cdGNvbnN0IHNlc3Npb25DaGF0cyA9IGNoYXRzID8/IFtzdHViQ2hhdF07XG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbklkOiBpZCxcblx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vLyR7aWR9YCksXG5cdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdHNlc3Npb25UeXBlOiAndGVzdCcsXG5cdFx0aWNvbjogQ29kaWNvbi52bSxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG5cdFx0d29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKGBTZXNzaW9uICR7aWR9YCksXG5cdFx0dXBkYXRlZEF0OiBjb25zdE9ic2VydmFibGUobmV3IERhdGUoKSksXG5cdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoc3RhdHVzKSxcblx0XHRjaGFuZ2VzZXRzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdGNoYW5nZXM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0bW9kZWxJZDogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0bW9kZTogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0bG9hZGluZzogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRpc0FyY2hpdmVkOiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRcdGlzUmVhZDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdGRlc2NyaXB0aW9uOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRsYXN0VHVybkVuZDogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShzZXNzaW9uQ2hhdHMpLFxuXHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoc2Vzc2lvbkNoYXRzWzBdKSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogY2hhdHMgIT09IHVuZGVmaW5lZCAmJiBjaGF0cy5sZW5ndGggPiAxIH0pLFxuXHR9O1xufVxuXG5jbGFzcyBNb2NrU2Vzc2lvblN0b3JlIGltcGxlbWVudHMgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPigndGVzdC5hY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgdmlzaWJsZVNlc3Npb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBY3RpdmVTZXNzaW9uW10+KCd0ZXN0LnZpc2libGVTZXNzaW9ucycsIFtdKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkU3RhcnRTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbldpbGxTZW5kUmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkU2VuZFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEFyY2hpdmVTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRVbmFyY2hpdmVTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWREZWxldGVTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWREZWxldGVDaGF0ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRSZW5hbWVDaGF0ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRSZW5hbWVTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRSZXBsYWNlU2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkRGlzY2FyZE5ld1Nlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZFRvZ2dsZVNlc3Npb25TdGlja2luZXNzID0gRXZlbnQuTm9uZTtcblxuXHRyZWFkb25seSBuZXdTZXNzaW9uOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgYXV0b21hdGlvblNlc3Npb246IElPYnNlcnZhYmxlPElTZXNzaW9uIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uPigpO1xuXHRwcml2YXRlIF9vcGVuZWRSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vcGVuZWRDaGF0UmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb3BlbmVkTmV3U2Vzc2lvbiA9IGZhbHNlO1xuXG5cdGdldCBsYXN0T3BlbmVkUmVzb3VyY2UoKTogVVJJIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX29wZW5lZFJlc291cmNlOyB9XG5cdGdldCBsYXN0T3BlbmVkQ2hhdFJlc291cmNlKCk6IFVSSSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9vcGVuZWRDaGF0UmVzb3VyY2U7IH1cblx0Z2V0IGxhc3RPcGVuZWROZXdTZXNzaW9uKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fb3BlbmVkTmV3U2Vzc2lvbjsgfVxuXG5cdHNldEFjdGl2ZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQsIGNoYXQ/OiBJQ2hhdCk6IHZvaWQge1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVDaGF0ID0gY2hhdCA/PyBzZXNzaW9uLmNoYXRzLmdldCgpWzBdID8/IHN0dWJDaGF0O1xuXHRcdFx0Y29uc3QgYWN0aXZlOiBJQWN0aXZlU2Vzc2lvbiA9IHtcblx0XHRcdFx0Li4uc2Vzc2lvbixcblx0XHRcdFx0aXNDcmVhdGVkOiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0XHRcdHN0aWNreTogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRcdFx0YWN0aXZlQ2hhdDogb2JzZXJ2YWJsZVZhbHVlPElDaGF0PihgdGVzdC5hY3RpdmVDaGF0LSR7c2Vzc2lvbi5zZXNzaW9uSWR9YCwgYWN0aXZlQ2hhdCksXG5cdFx0XHRcdG9wZW5DaGF0czogc2Vzc2lvbi5jaGF0cyxcblx0XHRcdFx0Y2xvc2VkQ2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0XHRcdGxhc3RDbG9zZWRDaGF0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHZpc2libGVDaGF0VGFiczogc2Vzc2lvbi5jaGF0cyxcblx0XHRcdFx0c2hvdWxkU2hvd0NoYXRUYWJzOiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuYWN0aXZlU2Vzc2lvbi5zZXQoYWN0aXZlLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFjdGl2ZVNlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRyZXBsYWNlQWN0aXZlU2Vzc2lvbihmcm9tOiBJQWN0aXZlU2Vzc2lvbiwgdG86IElBY3RpdmVTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRBY3RpdmVTZXNzaW9uKHRvKTtcblx0fVxuXG5cdHNldEFjdGl2ZUNoYXQoY2hhdDogSUNoYXQpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0KGFjdGl2ZS5hY3RpdmVDaGF0IGFzIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4+KS5zZXQoY2hhdCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRhZGRTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvbik7XG5cdH1cblxuXHRnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFsuLi50aGlzLl9zZXNzaW9ucy52YWx1ZXMoKV07IH1cblxuXHRnZXRSZWNlbnRseU9wZW5lZFNlc3Npb25zKCk6IElSZWNlbnRseU9wZW5lZFNlc3Npb25zIHsgcmV0dXJuIHsgcmVjZW50OiBbLi4udGhpcy5fc2Vzc2lvbnMudmFsdWVzKCldLCBvdGhlcjogW10gfTsgfVxuXG5cdGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbkZvckNoYXRSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogeyBzZXNzaW9uOiBJU2Vzc2lvbjsgY2hhdDogSUNoYXQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBjaGF0ID0gc2Vzc2lvbi5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChjaGF0KSB7XG5cdFx0XHRcdHJldHVybiB7IHNlc3Npb24sIGNoYXQgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEFsbFNlc3Npb25UeXBlcygpOiBJU2Vzc2lvblR5cGVbXSB7IHJldHVybiBbXTsgfVxuXHRnZXRBbGxQcm92aWRlclNlc3Npb25UeXBlcygpOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdIHsgcmV0dXJuIFtdOyB9XG5cdGdldFNlc3Npb25UeXBlc0ZvckZvbGRlcihfZm9sZGVyVXJpOiBVUkkpOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdIHsgcmV0dXJuIFtdOyB9XG5cdGdldFF1aWNrQ2hhdFNlc3Npb25UeXBlcygpOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdIHsgcmV0dXJuIFtdOyB9XG5cdGlzTmV3U2Vzc2lvblRhcmdldEF2YWlsYWJsZShfZm9sZGVyVXJpOiBVUkksIF9vcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRpc1F1aWNrQ2hhdFRhcmdldEF2YWlsYWJsZShfb3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0cmVzb2x2ZVdvcmtzcGFjZShfZm9sZGVyVXJpOiBVUkkpOiB7IHByb3ZpZGVySWQ6IHN0cmluZzsgd29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSB9IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIG9wZW5TZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fb3BlbmVkUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0dGhpcy5fb3BlbmVkQ2hhdFJlc291cmNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29wZW5lZE5ld1Nlc3Npb24gPSBmYWxzZTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0fVxuXG5cdG9wZW5OZXdTZXNzaW9uKCk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLl9vcGVuZWROZXdTZXNzaW9uID0gdHJ1ZTtcblx0XHR0aGlzLl9vcGVuZWRSZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vcGVuZWRDaGF0UmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5zZXRBY3RpdmVTZXNzaW9uKHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIG9wZW5DaGF0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9vcGVuZWRSZXNvdXJjZSA9IHNlc3Npb24ucmVzb3VyY2U7XG5cdFx0dGhpcy5fb3BlbmVkQ2hhdFJlc291cmNlID0gY2hhdFVyaTtcblx0XHR0aGlzLl9vcGVuZWROZXdTZXNzaW9uID0gZmFsc2U7XG5cdFx0Y29uc3QgY2hhdCA9IHNlc3Npb24uY2hhdHMuZ2V0KCkuZmluZChjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gY2hhdFVyaS50b1N0cmluZygpKTtcblx0XHRpZiAoY2hhdCkge1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb24sIGNoYXQpO1xuXHRcdH1cblx0fVxuXHRyZXN0b3JlVmlzaWJsZVNlc3Npb25zKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGNyZWF0ZU5ld1Nlc3Npb24oX2ZvbGRlclVyaTogVVJJLCBfb3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IElTZXNzaW9uIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRjcmVhdGVBdXRvbWF0aW9uU2Vzc2lvbihfZm9sZGVyVXJpOiBVUkksIF9vcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zKTogSVNlc3Npb24geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGNyZWF0ZUF1dG9tYXRpb25RdWlja0NoYXQoX29wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiBJU2Vzc2lvbiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0Y3JlYXRlUXVpY2tDaGF0KF9vcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zKTogSVNlc3Npb24geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGNyZWF0ZU5ld0NoYXRJblNlc3Npb24oX3Nlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTxJQ2hhdCB8IHVuZGVmaW5lZD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGZvcmtDaGF0SW5TZXNzaW9uKF9zZXNzaW9uOiBJU2Vzc2lvbiwgX3NvdXJjZUNoYXQ6IFVSSSwgX3R1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uKF9zZXNzaW9uOiBJU2Vzc2lvbiwgX3NvdXJjZUNoYXQ6IFVSSSwgX3R1cm5JZDogc3RyaW5nLCBfc2VsZWN0aW9uPzogSVNpZGVDaGF0U2VsZWN0aW9uKTogUHJvbWlzZTxJQ2hhdD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGRpc2NhcmROZXdTZXNzaW9uKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGRpc2NhcmRBdXRvbWF0aW9uU2Vzc2lvbigpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHR1bnNldE5ld1Nlc3Npb24oKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0c2VuZE5ld0NoYXRSZXF1ZXN0KF9zZXNzaW9uOiBJU2Vzc2lvbiwgX29wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QoX2ZvbGRlclVyaTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucywgX2NyZWF0ZU9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uIHwgdW5kZWZpbmVkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0Y3JlYXRlQW5kU2VuZFF1aWNrQ2hhdFJlcXVlc3QoX29wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMsIF9jcmVhdGVPcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdHNlbmRSZXF1ZXN0KF9zZXNzaW9uOiBJU2Vzc2lvbiwgX2NoYXQ6IElDaGF0LCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdG9wZW5OZXdDaGF0SW5TZXNzaW9uKF9zZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdG9wZW5QcmV2aW91c1Nlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0b3Blbk5leHRTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdHRvZ2dsZVNlc3Npb25TdGlja2luZXNzKF9zZXNzaW9uOiBJU2Vzc2lvbik6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGluc2VydEF0KF9zZXNzaW9uOiBJU2Vzc2lvbiwgX3RhcmdldFNlc3Npb25JZDogc3RyaW5nLCBfc2lkZTogJ2xlZnQnIHwgJ3JpZ2h0JywgX2FjdGl2YXRlPzogYm9vbGVhbik6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGNsb3NlU2Vzc2lvbihfc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRjbG9zZUFsbFNlc3Npb25zKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdHNldEFjdGl2ZShfc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24pOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRjYW5jZWxDdXJyZW50UmVxdWVzdChfc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRhcmNoaXZlU2Vzc2lvbihfc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHR1bmFyY2hpdmVTZXNzaW9uKF9zZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdHNldFNlc3Npb25SZWFkU3RhdGUoX3Nlc3Npb246IElTZXNzaW9uLCBfaXNSZWFkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0bWFya1JlYWQoX3Nlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0bWFya1VucmVhZChfc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRtYXJrQWxsUmVhZChfc2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uW10pOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRkZWxldGVTZXNzaW9uKF9zZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGRlbGV0ZVNlc3Npb25zKF9zZXNzaW9uczogcmVhZG9ubHkgSVNlc3Npb25bXSk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGRlbGV0ZUNoYXQoX3Nlc3Npb246IElTZXNzaW9uLCBfY2hhdFVyaTogVVJJKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0cmVuYW1lQ2hhdChfc2Vzc2lvbjogSVNlc3Npb24sIF9jaGF0VXJpOiBVUkksIF90aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0cmVuYW1lU2Vzc2lvbihfc2Vzc2lvbjogSVNlc3Npb24sIF90aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cbn1cblxuc3VpdGUoJ1Nlc3Npb25zTmF2aWdhdGlvbicsICgpID0+IHtcblxuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgc3RvcmU6IE1vY2tTZXNzaW9uU3RvcmU7XG5cdGxldCBuYXY6IFNlc3Npb25zTmF2aWdhdGlvbjtcblx0bGV0IGNvbnRleHRLZXlTZXJ2aWNlOiBNb2NrQ29udGV4dEtleVNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gZHMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0c3RvcmUgPSBuZXcgTW9ja1Nlc3Npb25TdG9yZSgpO1xuXG5cdFx0Y29udGV4dEtleVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHJlY2VuY3kgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25zUmVjZW5jeUhpc3Rvcnkoc3RvcmFnZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRuYXYgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25zTmF2aWdhdGlvbihcblx0XHRcdHN0b3JlLFxuXHRcdFx0c3RvcmUuYWN0aXZlU2Vzc2lvbixcblx0XHRcdHN0b3JlLFxuXHRcdFx0cmVjZW5jeSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNhbkdvQmFjaygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKCdzZXNzaW9uc0NhbkdvQmFjaycpID8/IGZhbHNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY2FuR29Gb3J3YXJkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoJ3Nlc3Npb25zQ2FuR29Gb3J3YXJkJykgPz8gZmFsc2U7XG5cdH1cblxuXHR0ZXN0KCdpbml0aWFsbHkgY2Fubm90IGdvIGJhY2sgb3IgZm9yd2FyZCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuR29CYWNrKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuR29Gb3J3YXJkKCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGdvIGJhY2sgYWZ0ZXIgbmF2aWdhdGluZyB0byB0d28gc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgczEgPSBzdHViU2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBzMiA9IHN0dWJTZXNzaW9uKCdzMicpO1xuXHRcdHN0b3JlLmFkZFNlc3Npb24oczEpO1xuXHRcdHN0b3JlLmFkZFNlc3Npb24oczIpO1xuXG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMSk7XG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuR29CYWNrKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0ZvcndhcmQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdnb0JhY2sgcmVzdG9yZXMgcHJldmlvdXMgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzMSA9IHN0dWJTZXNzaW9uKCdzMScpO1xuXHRcdGNvbnN0IHMyID0gc3R1YlNlc3Npb24oJ3MyJyk7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMSk7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMik7XG5cblx0XHRzdG9yZS5zZXRBY3RpdmVTZXNzaW9uKHMxKTtcblx0XHRzdG9yZS5zZXRBY3RpdmVTZXNzaW9uKHMyKTtcblxuXHRcdGF3YWl0IG5hdi5nb0JhY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5sYXN0T3BlbmVkUmVzb3VyY2U/LnRvU3RyaW5nKCksIHMxLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0JhY2soKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0ZvcndhcmQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dvRm9yd2FyZCByZXN0b3JlcyBuZXh0IHNlc3Npb24gYWZ0ZXIgZ29CYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHMxID0gc3R1YlNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgczIgPSBzdHViU2Vzc2lvbignczInKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMxKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMyKTtcblxuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24oczEpO1xuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24oczIpO1xuXG5cdFx0YXdhaXQgbmF2LmdvQmFjaygpO1xuXHRcdGF3YWl0IG5hdi5nb0ZvcndhcmQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5sYXN0T3BlbmVkUmVzb3VyY2U/LnRvU3RyaW5nKCksIHMyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0JhY2soKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkdvRm9yd2FyZCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5pbmcgYSBuZXcgc2Vzc2lvbiBhZnRlciBnb0JhY2sga2VlcHMgb2xkZXIgZW50cmllcyByZWFjaGFibGUgKE1SVSwgbm8gdHJ1bmNhdGlvbiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgczEgPSBzdHViU2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBzMiA9IHN0dWJTZXNzaW9uKCdzMicpO1xuXHRcdGNvbnN0IHMzID0gc3R1YlNlc3Npb24oJ3MzJyk7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMSk7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMik7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMyk7XG5cblx0XHRzdG9yZS5zZXRBY3RpdmVTZXNzaW9uKHMxKTsgLy8gcmVjZW5jeT1bczFdXG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMik7IC8vIHJlY2VuY3k9W3MyLCBzMV0sIGN1cnNvcj1zMlxuXG5cdFx0YXdhaXQgbmF2LmdvQmFjaygpOyAvLyBjdXJzb3I9czFcblx0XHQvLyBOb3cgb3BlbiBzMyBleHBsaWNpdGx5OiBzMyBpcyBwcm9tb3RlZCB0byB0aGUgZnJvbnQgLT4gcmVjZW5jeT1bczMsIHMyLCBzMV1cblx0XHRzdG9yZS5zZXRBY3RpdmVTZXNzaW9uKHMzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0JhY2soKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkdvRm9yd2FyZCgpLCBmYWxzZSk7XG5cblx0XHQvLyBVbmxpa2UgYnJvd3Nlci1zdHlsZSB0cnVuY2F0aW9uLCBzMiBpcyBOT1QgZGlzY2FyZGVkOyBnb2luZyBiYWNrIGZyb21cblx0XHQvLyBzMyBsYW5kcyBvbiB0aGUgbmV4dCBtb3N0LXJlY2VudCBlbnRyeSwgczIuXG5cdFx0YXdhaXQgbmF2LmdvQmFjaygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5sYXN0T3BlbmVkUmVzb3VyY2U/LnRvU3RyaW5nKCksIHMyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Ly8gQW5kIHMxIHJlbWFpbnMgcmVhY2hhYmxlIG9uZSBzdGVwIGZ1cnRoZXIgYmFjay5cblx0XHRhd2FpdCBuYXYuZ29CYWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmxhc3RPcGVuZWRSZXNvdXJjZT8udG9TdHJpbmcoKSwgczEucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlb3BlbmluZyBhbiBlYXJsaWVyIHNlc3Npb24gbW92ZXMgaXQgdG8gdGhlIGZyb250IG9mIHJlY2VuY3kgKG5vIGR1cGxpY2F0ZXMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEFcdTIxOTJCXHUyMTkyQywgYmFja1x1MjE5MmJhY2tcdTIxOTJmd2RcdTIxOTJmd2QsIG9wZW4gQSBhZ2FpblxuXHRcdC8vIHNob3VsZCBtb3ZlIEEgdG8gdGhlIGZyb250OiByZWNlbmN5PVtBLEMsQl0gKG5vIGR1cGxpY2F0ZSBBKVxuXHRcdGNvbnN0IHMxID0gc3R1YlNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgczIgPSBzdHViU2Vzc2lvbignczInKTtcblx0XHRjb25zdCBzMyA9IHN0dWJTZXNzaW9uKCdzMycpO1xuXHRcdHN0b3JlLmFkZFNlc3Npb24oczEpO1xuXHRcdHN0b3JlLmFkZFNlc3Npb24oczIpO1xuXHRcdHN0b3JlLmFkZFNlc3Npb24oczMpO1xuXG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMSk7IC8vIHJlY2VuY3k9W3MxXVxuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24oczIpOyAvLyByZWNlbmN5PVtzMixzMV1cblx0XHRzdG9yZS5zZXRBY3RpdmVTZXNzaW9uKHMzKTsgLy8gcmVjZW5jeT1bczMsczIsczFdXG5cblx0XHRhd2FpdCBuYXYuZ29CYWNrKCk7ICAvLyBjdXJzb3I9czJcblx0XHRhd2FpdCBuYXYuZ29CYWNrKCk7ICAvLyBjdXJzb3I9czFcblx0XHRhd2FpdCBuYXYuZ29Gb3J3YXJkKCk7IC8vIGN1cnNvcj1zMlxuXHRcdGF3YWl0IG5hdi5nb0ZvcndhcmQoKTsgLy8gY3Vyc29yPXMzXG5cblx0XHQvLyBOb3cgb3BlbiBzMSBhZ2FpbiBcdTIwMTQgbW92ZXMgdG8gZnJvbnQ6IHJlY2VuY3k9W3MxLHMzLHMyXVxuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24oczEpO1xuXG5cdFx0Ly8gQmFjayBvbmNlOiBzM1xuXHRcdGF3YWl0IG5hdi5nb0JhY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUubGFzdE9wZW5lZFJlc291cmNlPy50b1N0cmluZygpLCBzMy5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdC8vIEJhY2sgb25jZSBtb3JlOiBzMlxuXHRcdGF3YWl0IG5hdi5nb0JhY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUubGFzdE9wZW5lZFJlc291cmNlPy50b1N0cmluZygpLCBzMi5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdC8vIE5vIGZ1cnRoZXIgYmFja1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0JhY2soKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCduYXZpZ2F0aW5nIHRvIG5ldy1zZXNzaW9uIHZpZXcgYWZ0ZXIgYSBzZXNzaW9uIGVuYWJsZXMgZ28gYmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzMSA9IHN0dWJTZXNzaW9uKCdzMScpO1xuXHRcdHN0b3JlLmFkZFNlc3Npb24oczEpO1xuXG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMSk7XG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbih1bmRlZmluZWQpOyAvLyB1c2VyIGV4cGxpY2l0bHkgd2VudCB0byBuZXctc2Vzc2lvbiB2aWV3XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuR29CYWNrKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0ZvcndhcmQoKSwgZmFsc2UpO1xuXG5cdFx0YXdhaXQgbmF2LmdvQmFjaygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5sYXN0T3BlbmVkUmVzb3VyY2U/LnRvU3RyaW5nKCksIHMxLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCduYXZpZ2F0aW5nIHRvIG5ldy1zZXNzaW9uIHZpZXcgd2l0aCBubyBoaXN0b3J5IGRvZXMgbm90IGVuYWJsZSBnbyBiYWNrJywgKCkgPT4ge1xuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24odW5kZWZpbmVkKTsgLy8gbmV3LXNlc3Npb24gdmlldyB3aXRoIGVtcHR5IGhpc3RvcnlcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0JhY2soKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkdXBsaWNhdGUgY29uc2VjdXRpdmUgc2Vzc2lvbiBpcyBub3QgYWRkZWQgdG8gaGlzdG9yeScsICgpID0+IHtcblx0XHRjb25zdCBzMSA9IHN0dWJTZXNzaW9uKCdzMScpO1xuXHRcdHN0b3JlLmFkZFNlc3Npb24oczEpO1xuXG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMSk7XG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMSk7IC8vIGR1cGxpY2F0ZVxuXG5cdFx0Ly8gT25seSBvbmUgZW50cnkgZm9yIHMxLCBjYW5ub3QgZ28gYmFja1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0JhY2soKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVkIHNlc3Npb25zIGFyZSBjbGVhbmVkIGZyb20gaGlzdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzMSA9IHN0dWJTZXNzaW9uKCdzMScpO1xuXHRcdGNvbnN0IHMyID0gc3R1YlNlc3Npb24oJ3MyJyk7XG5cdFx0Y29uc3QgczMgPSBzdHViU2Vzc2lvbignczMnKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMxKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMyKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMzKTtcblxuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24oczEpO1xuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24oczIpO1xuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24oczMpO1xuXG5cdFx0Ly8gUmVtb3ZlIHMyIGZyb20gaGlzdG9yeVxuXHRcdG5hdi5vbkRpZFJlbW92ZVNlc3Npb25zKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbczJdLCBjaGFuZ2VkOiBbXSB9KTtcblxuXHRcdC8vIEdvaW5nIGJhY2sgZnJvbSBzMyBzaG91bGQgc2tpcCBzMiBhbmQgZ28gdG8gczFcblx0XHRhd2FpdCBuYXYuZ29CYWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmxhc3RPcGVuZWRSZXNvdXJjZT8udG9TdHJpbmcoKSwgczEucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VudGl0bGVkIChuZXcpIHNlc3Npb24gaXMgbm90IHJlY29yZGVkIGluIGhpc3RvcnkgYW5kIGRvZXMgbm90IGVuYWJsZSBnbyBiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBzdHViU2Vzc2lvbigncGVuZGluZycsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdHN0b3JlLmFkZFNlc3Npb24ocGVuZGluZyk7XG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihwZW5kaW5nKTsgLy8gdW50aXRsZWQgb24gc3RhcnR1cCBcdTIwMTQgbXVzdCBub3QgYmUgcmVjb3JkZWQgb3Igc2V0IGJleW9uZEhpc3RvcnlcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0JhY2soKSwgZmFsc2UpO1xuXG5cdFx0Ly8gT3BlbmluZyBhIHJlYWwgc2Vzc2lvbjogaGlzdG9yeSBpcyBbczFdLCBjYW5ub3QgZ28gYmFja1xuXHRcdGNvbnN0IHMxID0gc3R1YlNlc3Npb24oJ3MxJyk7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMSk7XG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuR29CYWNrKCksIGZhbHNlKTtcblxuXHRcdC8vIE9wZW5pbmcgYSBzZWNvbmQgcmVhbCBzZXNzaW9uOiBoaXN0b3J5IGlzIFtzMSwgczJdLCBjYW4gZ28gYmFja1xuXHRcdGNvbnN0IHMyID0gc3R1YlNlc3Npb24oJ3MyJyk7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMik7XG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuR29CYWNrKCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdnbyB0byBuZXctc2Vzc2lvbiwgZ29CYWNrLCBnbyB0byBuZXctc2Vzc2lvbiBhZ2FpbiBzdGlsbCBlbmFibGVzIGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogYWZ0ZXIgZ29CYWNrIGZyb20gbmV3LXNlc3Npb24gdmlldywgZ29pbmcgdG8gbmV3LXNlc3Npb24gYWdhaW5cblx0XHQvLyBtdXN0IHN0aWxsIGVuYWJsZSBiYWNrLiBUaGUgYXV0b3J1biBtdXN0IGtlZXAgYWN0aXZlU2Vzc2lvbiB0cmFja2VkIGV2ZW5cblx0XHQvLyB3aGVuIGl0IHJldHVybnMgZWFybHkgZHVyaW5nIG5hdmlnYXRpb24gKF9uYXZpZ2F0aW5nPXRydWUpLlxuXHRcdGNvbnN0IHMxID0gc3R1YlNlc3Npb24oJ3MxJyk7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMSk7XG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMSk7IC8vIGhpc3Rvcnk9W3MxXSwgaWR4PTBcblxuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24odW5kZWZpbmVkKTsgLy8gZ28gdG8gbmV3LXNlc3Npb24gdmlld1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Hb0JhY2soKSwgdHJ1ZSwgJ2JhY2sgZW5hYmxlZCBhZnRlciBmaXJzdCBuZXctc2Vzc2lvbiB2aWV3Jyk7XG5cblx0XHRhd2FpdCBuYXYuZ29CYWNrKCk7IC8vIGJhY2sgdG8gczFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuR29CYWNrKCksIGZhbHNlLCAnYmFjayBkaXNhYmxlZCBvbiBzMScpO1xuXG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbih1bmRlZmluZWQpOyAvLyBnbyB0byBuZXctc2Vzc2lvbiB2aWV3IGFnYWluXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkdvQmFjaygpLCB0cnVlLCAnYmFjayBlbmFibGVkIGFmdGVyIHNlY29uZCBuZXctc2Vzc2lvbiB2aWV3Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N3aXRjaGluZyBjaGF0cyB3aXRoaW4gYSBzZXNzaW9uIGlzIHJlY29yZGVkIGluIGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdEEgPSBzdHViQ2hhdFdpdGhJZCgnYScpO1xuXHRcdGNvbnN0IGNoYXRCID0gc3R1YkNoYXRXaXRoSWQoJ2InKTtcblx0XHRjb25zdCBzMSA9IHN0dWJTZXNzaW9uKCdzMScsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBbY2hhdEEsIGNoYXRCXSk7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMSk7XG5cblx0XHRzdG9yZS5zZXRBY3RpdmVTZXNzaW9uKHMxLCBjaGF0QSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkdvQmFjaygpLCBmYWxzZSk7XG5cblx0XHQvLyBTd2l0Y2ggdG8gY2hhdCBCIHdpdGhpbiB0aGUgc2FtZSBzZXNzaW9uXG5cdFx0c3RvcmUuc2V0QWN0aXZlQ2hhdChjaGF0Qik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkdvQmFjaygpLCB0cnVlLCAnYmFjayBlbmFibGVkIGFmdGVyIHN3aXRjaGluZyBjaGF0IHdpdGhpbiBzZXNzaW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dvQmFjayByZXN0b3JlcyBwcmV2aW91cyBjaGF0IHdpdGhpbiBhIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdEEgPSBzdHViQ2hhdFdpdGhJZCgnYScpO1xuXHRcdGNvbnN0IGNoYXRCID0gc3R1YkNoYXRXaXRoSWQoJ2InKTtcblx0XHRjb25zdCBzMSA9IHN0dWJTZXNzaW9uKCdzMScsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBbY2hhdEEsIGNoYXRCXSk7XG5cdFx0c3RvcmUuYWRkU2Vzc2lvbihzMSk7XG5cblx0XHRzdG9yZS5zZXRBY3RpdmVTZXNzaW9uKHMxLCBjaGF0QSk7XG5cdFx0c3RvcmUuc2V0QWN0aXZlQ2hhdChjaGF0Qik7XG5cblx0XHRhd2FpdCBuYXYuZ29CYWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmxhc3RPcGVuZWRDaGF0UmVzb3VyY2U/LnRvU3RyaW5nKCksIGNoYXRBLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5sYXN0T3BlbmVkUmVzb3VyY2U/LnRvU3RyaW5nKCksIHMxLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCduYXZpZ2F0aW9uIGFjcm9zcyBzZXNzaW9ucyBhbmQgY2hhdHMgd29ya3MgdG9nZXRoZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdEEgPSBzdHViQ2hhdFdpdGhJZCgnYScpO1xuXHRcdGNvbnN0IGNoYXRCID0gc3R1YkNoYXRXaXRoSWQoJ2InKTtcblx0XHRjb25zdCBzMSA9IHN0dWJTZXNzaW9uKCdzMScsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBbY2hhdEEsIGNoYXRCXSk7XG5cdFx0Y29uc3QgczIgPSBzdHViU2Vzc2lvbignczInKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMxKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMyKTtcblxuXHRcdC8vIHMxL2NoYXRBIFx1MjE5MiBzMS9jaGF0QiBcdTIxOTIgczJcblx0XHRzdG9yZS5zZXRBY3RpdmVTZXNzaW9uKHMxLCBjaGF0QSk7XG5cdFx0c3RvcmUuc2V0QWN0aXZlQ2hhdChjaGF0Qik7XG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMik7XG5cblx0XHQvLyBHbyBiYWNrIHRvIHMxL2NoYXRCXG5cdFx0YXdhaXQgbmF2LmdvQmFjaygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5sYXN0T3BlbmVkQ2hhdFJlc291cmNlPy50b1N0cmluZygpLCBjaGF0Qi5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdC8vIEdvIGJhY2sgdG8gczEvY2hhdEFcblx0XHRhd2FpdCBuYXYuZ29CYWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmxhc3RPcGVuZWRDaGF0UmVzb3VyY2U/LnRvU3RyaW5nKCksIGNoYXRBLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Ly8gR28gZm9yd2FyZCB0byBzMS9jaGF0QlxuXHRcdGF3YWl0IG5hdi5nb0ZvcndhcmQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUubGFzdE9wZW5lZENoYXRSZXNvdXJjZT8udG9TdHJpbmcoKSwgY2hhdEIucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHQvLyBHbyBmb3J3YXJkIHRvIHMyXG5cdFx0YXdhaXQgbmF2LmdvRm9yd2FyZCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5sYXN0T3BlbmVkUmVzb3VyY2U/LnRvU3RyaW5nKCksIHMyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnRpdGxlZCBjaGF0cyBhcmUgbm90IHJlY29yZGVkIHdpdGggYSBjaGF0IHJlc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRVbnRpdGxlZCA9IHN0dWJDaGF0V2l0aElkKCd1bnRpdGxlZCcsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHMxID0gc3R1YlNlc3Npb24oJ3MxJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIFtjaGF0VW50aXRsZWRdKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMxKTtcblxuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24oczEsIGNoYXRVbnRpdGxlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkdvQmFjaygpLCBmYWxzZSwgJ3VudGl0bGVkIGNoYXQgcHJvZHVjZXMgYSBzZXNzaW9uLW9ubHkgZW50cnksIG5vIHNlY29uZCBlbnRyeScpO1xuXHR9KTtcblxuXHR0ZXN0KCdnb0JhY2sgZmFsbHMgYmFjayB0byBvcGVuU2Vzc2lvbiB3aGVuIGNoYXQgd2FzIGRlbGV0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdEEgPSBzdHViQ2hhdFdpdGhJZCgnYScpO1xuXHRcdGNvbnN0IGNoYXRCID0gc3R1YkNoYXRXaXRoSWQoJ2InKTtcblx0XHRjb25zdCBjaGF0c09icyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQ2hhdFtdPigndGVzdC5jaGF0cycsIFtjaGF0QSwgY2hhdEJdKTtcblx0XHRjb25zdCBzMTogSVNlc3Npb24gPSB7XG5cdFx0XHQuLi5zdHViU2Vzc2lvbignczEnLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgW2NoYXRBLCBjaGF0Ql0pLFxuXHRcdFx0Y2hhdHM6IGNoYXRzT2JzLFxuXHRcdH07XG5cdFx0Y29uc3QgczIgPSBzdHViU2Vzc2lvbignczInKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMxKTtcblx0XHRzdG9yZS5hZGRTZXNzaW9uKHMyKTtcblxuXHRcdC8vIFJlY29yZCBoaXN0b3J5OiBzMS9jaGF0QSBcdTIxOTIgczEvY2hhdEIgXHUyMTkyIHMyXG5cdFx0c3RvcmUuc2V0QWN0aXZlU2Vzc2lvbihzMSwgY2hhdEEpO1xuXHRcdHN0b3JlLnNldEFjdGl2ZUNoYXQoY2hhdEIpO1xuXHRcdHN0b3JlLnNldEFjdGl2ZVNlc3Npb24oczIpO1xuXG5cdFx0Ly8gUmVtb3ZlIGNoYXRCIGZyb20gdGhlIHNlc3Npb25cblx0XHRjaGF0c09icy5zZXQoW2NoYXRBXSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEdvIGJhY2sgXHUyMDE0IGNoYXRCIGlzIHN0YWxlLCBzaG91bGQgZmFsbCBiYWNrIHRvIG9wZW5TZXNzaW9uKHMxKVxuXHRcdGF3YWl0IG5hdi5nb0JhY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUubGFzdE9wZW5lZFJlc291cmNlPy50b1N0cmluZygpLCBzMS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUubGFzdE9wZW5lZENoYXRSZXNvdXJjZSwgdW5kZWZpbmVkLCAnc2hvdWxkIG5vdCBvcGVuIGEgc3RhbGUgY2hhdCcpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQThCLHVCQUF1QjtBQUM5RCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsbUJBQXlGLHFCQUFxQjtBQUN2SCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGFBQWE7QUFHdEIsTUFBTSxXQUFXO0FBQUEsRUFDaEIsVUFBVSxJQUFJLE1BQU0sY0FBYztBQUFBLEVBQ2xDLFdBQVcsb0JBQUksS0FBSztBQUFBLEVBQ3BCLE9BQU8sZ0JBQWdCLE1BQU07QUFBQSxFQUM3QixXQUFXLGdCQUFnQixvQkFBSSxLQUFLLENBQUM7QUFBQSxFQUNyQyxRQUFRLGdCQUFn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
