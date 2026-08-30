import assert from "assert";
import { mainWindow } from "../../../base/browser/window.js";
import { DeferredPromise } from "../../../base/common/async.js";
import { Event } from "../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { constObservable, derived, observableValue } from "../../../base/common/observable.js";
import { URI } from "../../../base/common/uri.js";
import { mock } from "../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../workbench/test/browser/workbenchTestServices.js";
import { AbstractChatView } from "../../browser/parts/chatView.js";
import { ChatGroupsView } from "../../browser/parts/chatGroupsView.js";
import { IChatViewFactory } from "../../services/chatView/browser/chatViewFactory.js";
import { ISessionsProvidersService } from "../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsPartService } from "../../services/sessions/browser/sessionsPartService.js";
import { ISessionsService } from "../../services/sessions/browser/sessionsService.js";
import { ChatInteractivity, ChatOriginKind, SessionStatus } from "../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../services/sessions/common/sessionsManagement.js";
class TestChatView extends AbstractChatView {
  constructor(kind) {
    super();
    this.kind = kind;
    this._focusTarget = mainWindow.document.createElement("button");
    this.element.dataset.kind = kind;
    this.element.appendChild(this._focusTarget);
  }
  toJSON() {
    return {};
  }
  doLayout() {
  }
  focus() {
    this._focusTarget.focus();
  }
}
class TestChatViewFactory extends mock() {
  createNewChatView(isNewChatInSession) {
    return new TestChatView(isNewChatInSession ? "newChatInSession" : "newSession");
  }
  createChatView() {
    return new TestChatView("chat");
  }
}
function createChat(id, status = SessionStatus.Completed, parentChat) {
  const resource = URI.parse(`test-chat://${id}`);
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = resource;
      this.origin = parentChat ? { kind: ChatOriginKind.Tool, parentChat } : void 0;
      this.title = constObservable(id);
      this.status = constObservable(status);
      this.isRead = constObservable(true);
      this.interactivity = constObservable(ChatInteractivity.Full);
    }
  }();
}
class TestActiveSession extends mock() {
  constructor(chats, visibleChats = chats, isCreated = true) {
    super();
    this.sessionId = "session";
    this.resource = URI.parse("test-session://session");
    this.providerId = "test";
    this.capabilities = constObservable({ supportsMultipleChats: true });
    this.isArchived = constObservable(false);
    this.loading = constObservable(false);
    const mainChat = chats[0];
    if (!mainChat) {
      throw new Error("A test session requires a main chat");
    }
    this.allChats = observableValue(this, chats);
    this.visibleChatTabs = observableValue(this, visibleChats);
    this.activeChat = observableValue(this, visibleChats[0] ?? mainChat);
    this.chats = this.allChats;
    this.openChats = this.visibleChatTabs;
    this.closedChats = derived((reader) => {
      const visible = new Set(this.visibleChatTabs.read(reader).map((chat) => chat.resource.toString()));
      return this.allChats.read(reader).filter((chat) => !visible.has(chat.resource.toString()));
    });
    this.shouldShowChatTabs = derived((reader) => this.visibleChatTabs.read(reader).length > 1);
    this.mainChat = constObservable(mainChat);
    this.isCreated = constObservable(isCreated);
  }
}
class TestSessionsService extends mock() {
  constructor() {
    super(...arguments);
    this.activeSession = observableValue(this, void 0);
  }
  async openChat(session, chatUri) {
    if (!(session instanceof TestActiveSession)) {
      return;
    }
    const chat = session.allChats.get().find((candidate) => candidate.resource.toString() === chatUri.toString());
    if (!chat) {
      return;
    }
    if (!session.visibleChatTabs.get().includes(chat)) {
      session.visibleChatTabs.set([...session.visibleChatTabs.get(), chat], void 0);
    }
    session.activeChat.set(chat, void 0);
    this.activeSession.set(session, void 0);
  }
  async openNewChatInSession(session) {
    if (!(session instanceof TestActiveSession)) {
      return;
    }
    await this.newChatGate;
    const chat = createChat(`new-${session.allChats.get().length}`, SessionStatus.Untitled);
    session.allChats.set([...session.allChats.get(), chat], void 0);
    session.visibleChatTabs.set([...session.visibleChatTabs.get(), chat], void 0);
    session.activeChat.set(chat, void 0);
  }
}
function createHarness(disposables) {
  const store = disposables.add(new DisposableStore());
  const instantiationService = workbenchInstantiationService(void 0, store);
  const sessionsService = new TestSessionsService();
  instantiationService.stub(IChatViewFactory, new TestChatViewFactory());
  instantiationService.stub(ISessionsService, sessionsService);
  instantiationService.stub(ISessionsManagementService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeSessions = Event.None;
    }
  }());
  instantiationService.stub(ISessionsPartService, new class extends mock() {
  }());
  instantiationService.stub(ISessionsProvidersService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeProviders = Event.None;
    }
    getProvider() {
      return void 0;
    }
  }());
  const view = store.add(instantiationService.createInstance(ChatGroupsView));
  mainWindow.document.body.appendChild(view.element);
  store.add(toDisposable(() => view.element.remove()));
  return { instantiationService, sessionsService, view };
}
suite("Sessions - ChatGroupsView", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const options = { renderSessionTypePickerInControls: constObservable(false) };
  test("focusing another group updates the session active chat", () => {
    const { sessionsService, view } = createHarness(disposables);
    const main = createChat("main");
    const secondary = createChat("secondary");
    const session = new TestActiveSession([main, secondary]);
    sessionsService.activeSession.set(session, void 0);
    view.setSession(session, options);
    view.splitChatToSide(secondary.resource);
    view.focusAdjacentGroup("previous");
    assert.deepStrictEqual({
      activeChat: session.activeChat.get().resource.toString(),
      focusedGroup: mainWindow.document.activeElement?.closest(".chat-group-view")?.querySelector(".chat-composite-bar-tab")?.getAttribute("data-chat-resource")
    }, {
      activeChat: main.resource.toString(),
      focusedGroup: main.resource.toString()
    });
  });
  test("restoration settles when an already-loaded catalog no longer contains a saved chat", () => {
    const { view } = createHarness(disposables);
    const main = createChat("main");
    const secondary = createChat("secondary");
    const session = new TestActiveSession([main, secondary]);
    view.setSession(session, options);
    view.splitChatToSide(secondary.resource);
    view.setSession(void 0, options);
    const restoredSession = new TestActiveSession([main]);
    view.setSession(restoredSession, options);
    assert.deepStrictEqual({
      groupCount: view.groupCount.get(),
      groups: view.element.querySelectorAll(".chat-group-view").length
    }, {
      groupCount: 1,
      groups: 1
    });
  });
  test("new session drafts do not restore a persisted chat grid", () => {
    const { view } = createHarness(disposables);
    const main = createChat("main");
    const secondary = createChat("secondary");
    const session = new TestActiveSession([main, secondary]);
    view.setSession(session, options);
    view.splitChatToSide(secondary.resource);
    view.setSession(void 0, options);
    const draft = new TestActiveSession([createChat("draft", SessionStatus.Untitled)], void 0, false);
    view.setSession(draft, options);
    assert.deepStrictEqual({
      groupCount: view.groupCount.get(),
      viewKind: view.element.querySelector(".chat-view")?.dataset.kind
    }, {
      groupCount: 1,
      viewKind: "newSession"
    });
  });
  test("opening a hidden chat to the side removes its temporary active-group assignment", async () => {
    const { view } = createHarness(disposables);
    const main = createChat("main");
    const hidden = createChat("hidden");
    const session = new TestActiveSession([main, hidden], [main]);
    view.setSession(session, options);
    await view.openChatInNewGroup(hidden.resource);
    const groups = Array.from(view.element.querySelectorAll(".chat-group-view"));
    assert.deepStrictEqual({
      groupCount: view.groupCount.get(),
      groupTabs: groups.map((group) => Array.from(group.querySelectorAll(".chat-composite-bar-tab")).map((tab) => tab.dataset.chatResource)),
      groupLabels: groups.map((group) => group.getAttribute("aria-label"))
    }, {
      groupCount: 2,
      groupTabs: [[main.resource.toString()], [hidden.resource.toString()]],
      groupLabels: ["Chat Group 1 of 2", "Chat Group 2 of 2"]
    });
  });
  test("opening a subagent through the sessions service uses the group adjacent to its parent", async () => {
    const { sessionsService, view } = createHarness(disposables);
    const main = createChat("main");
    const secondary = createChat("secondary");
    const subagent = createChat("subagent", SessionStatus.Completed, main.resource);
    const session = new TestActiveSession([main, secondary, subagent], [main, secondary]);
    view.setSession(session, options);
    view.splitChatToSide(secondary.resource);
    await sessionsService.openChat(session, subagent.resource);
    const groups = Array.from(view.element.querySelectorAll(".chat-group-view"));
    assert.deepStrictEqual({
      groupCount: view.groupCount.get(),
      groupTabs: groups.map((group) => Array.from(group.querySelectorAll(".chat-composite-bar-tab")).map((tab) => tab.dataset.chatResource)),
      activeChat: session.activeChat.get().resource.toString()
    }, {
      groupCount: 2,
      groupTabs: [[main.resource.toString()], [secondary.resource.toString(), subagent.resource.toString()]],
      activeChat: subagent.resource.toString()
    });
  });
  test("reopening a manually moved subagent preserves its group", async () => {
    const { sessionsService, view } = createHarness(disposables);
    const main = createChat("main");
    const secondary = createChat("secondary");
    const subagent = createChat("subagent", SessionStatus.Completed, main.resource);
    const session = new TestActiveSession([main, secondary, subagent], [main, secondary]);
    view.setSession(session, options);
    view.splitChatToSide(secondary.resource);
    await sessionsService.openChat(session, subagent.resource);
    view.moveActiveChatToAdjacentGroup("previous");
    await sessionsService.openChat(session, secondary.resource);
    await sessionsService.openChat(session, subagent.resource);
    const groups = Array.from(view.element.querySelectorAll(".chat-group-view"));
    assert.deepStrictEqual(groups.map((group) => Array.from(group.querySelectorAll(".chat-composite-bar-tab")).map((tab) => tab.dataset.chatResource)), [
      [main.resource.toString(), subagent.resource.toString()],
      [secondary.resource.toString()]
    ]);
  });
  test("left split updates logical and accessible group order", () => {
    const { view } = createHarness(disposables);
    const main = createChat("main");
    const secondary = createChat("secondary");
    const session = new TestActiveSession([main, secondary]);
    view.setSession(session, options);
    view["_onChatDrop"](view["_groups"][0].id, "left", { sessionId: session.sessionId, resource: secondary.resource.toString() });
    const groups = Array.from(view.element.querySelectorAll(".chat-group-view"));
    const labelByChat = Object.fromEntries(groups.map((group) => [
      group.querySelector(".chat-composite-bar-tab")?.dataset.chatResource,
      group.getAttribute("aria-label")
    ]));
    assert.deepStrictEqual(labelByChat, {
      [secondary.resource.toString()]: "Chat Group 1 of 2",
      [main.resource.toString()]: "Chat Group 2 of 2"
    });
  });
  test("removing the focused group transfers focus to the remaining group", () => {
    const { view } = createHarness(disposables);
    const main = createChat("main");
    const secondary = createChat("secondary");
    const session = new TestActiveSession([main, secondary]);
    view.setSession(session, options);
    view.splitChatToSide(secondary.resource);
    view.focusAdjacentGroup("next");
    session.visibleChatTabs.set([main], void 0);
    const remainingGroup = view.element.querySelector(".chat-group-view");
    assert.deepStrictEqual({
      groupCount: view.groupCount.get(),
      focusInRemainingGroup: remainingGroup?.contains(mainWindow.document.activeElement),
      activeChat: session.activeChat.get().resource.toString()
    }, {
      groupCount: 1,
      focusInRemainingGroup: true,
      activeChat: main.resource.toString()
    });
  });
  test("new chat action focuses its group composer", async () => {
    const { view } = createHarness(disposables);
    const main = createChat("main");
    const session = new TestActiveSession([main]);
    view.setSession(session, options);
    const group = view.element.querySelector(".chat-group-view");
    group.querySelector(".chat-composite-bar-new-chat .action-label").click();
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(group.contains(mainWindow.document.activeElement), true);
  });
  test("new chat remains assigned to the group where creation started", async () => {
    const { sessionsService, view } = createHarness(disposables);
    const main = createChat("main");
    const secondary = createChat("secondary");
    const session = new TestActiveSession([main, secondary]);
    view.setSession(session, options);
    view.splitChatToSide(secondary.resource);
    view.focusAdjacentGroup("previous");
    const groups = Array.from(view.element.querySelectorAll(".chat-group-view"));
    const mainGroup = groups.find((group) => group.querySelector(".chat-composite-bar-tab")?.dataset.chatResource === main.resource.toString());
    const gate = new DeferredPromise();
    sessionsService.newChatGate = gate.p;
    mainGroup.querySelector(".chat-composite-bar-new-chat .action-label").click();
    view.focusAdjacentGroup("next");
    gate.complete();
    await gate.p;
    await Promise.resolve();
    await Promise.resolve();
    const newChat = session.activeChat.get();
    assert.deepStrictEqual({
      mainGroupTabs: Array.from(mainGroup.querySelectorAll(".chat-composite-bar-tab")).map((tab) => tab.dataset.chatResource),
      secondaryGroupTabs: Array.from(groups.find((group) => group !== mainGroup).querySelectorAll(".chat-composite-bar-tab")).map((tab) => tab.dataset.chatResource),
      focusInMainGroup: mainGroup.contains(mainWindow.document.activeElement)
    }, {
      mainGroupTabs: [main.resource.toString(), newChat.resource.toString()],
      secondaryGroupTabs: [secondary.resource.toString()],
      focusInMainGroup: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcdGVzdFxcYnJvd3NlclxcY2hhdEdyb3Vwc1ZpZXcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RDaGF0VmlldywgQ2hhdFZpZXdLaW5kIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9jaGF0Vmlldy5qcyc7XG5pbXBvcnQgeyBDaGF0R3JvdXBzVmlldyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydHMvY2hhdEdyb3Vwc1ZpZXcuanMnO1xuaW1wb3J0IHsgSUNoYXRWaWV3RmFjdG9yeSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2NoYXRWaWV3L2Jyb3dzZXIvY2hhdFZpZXdGYWN0b3J5LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQYXJ0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIENoYXRPcmlnaW5LaW5kLCBJQ2hhdCwgSVNlc3Npb24sIElTZXNzaW9uQ2FwYWJpbGl0aWVzLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5cbmNsYXNzIFRlc3RDaGF0VmlldyBleHRlbmRzIEFic3RyYWN0Q2hhdFZpZXcge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c1RhcmdldCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkga2luZDogQ2hhdFZpZXdLaW5kKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQuZGF0YXNldC5raW5kID0ga2luZDtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fZm9jdXNUYXJnZXQpO1xuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGRvTGF5b3V0KCk6IHZvaWQgeyB9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZm9jdXNUYXJnZXQuZm9jdXMoKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0Q2hhdFZpZXdGYWN0b3J5IGV4dGVuZHMgbW9jazxJQ2hhdFZpZXdGYWN0b3J5PigpIHtcblx0b3ZlcnJpZGUgY3JlYXRlTmV3Q2hhdFZpZXcoaXNOZXdDaGF0SW5TZXNzaW9uOiBib29sZWFuKTogQWJzdHJhY3RDaGF0VmlldyB7XG5cdFx0cmV0dXJuIG5ldyBUZXN0Q2hhdFZpZXcoaXNOZXdDaGF0SW5TZXNzaW9uID8gJ25ld0NoYXRJblNlc3Npb24nIDogJ25ld1Nlc3Npb24nKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZUNoYXRWaWV3KCk6IEFic3RyYWN0Q2hhdFZpZXcge1xuXHRcdHJldHVybiBuZXcgVGVzdENoYXRWaWV3KCdjaGF0Jyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQ2hhdChpZDogc3RyaW5nLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMgPSBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgcGFyZW50Q2hhdD86IFVSSSk6IElDaGF0IHtcblx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoYHRlc3QtY2hhdDovLyR7aWR9YCk7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0PigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yaWdpbiA9IHBhcmVudENoYXQgPyB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlRvb2wsIHBhcmVudENoYXQgfSA6IHVuZGVmaW5lZDtcblx0XHRvdmVycmlkZSByZWFkb25seSB0aXRsZTogSU9ic2VydmFibGU8c3RyaW5nPiA9IGNvbnN0T2JzZXJ2YWJsZShpZCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdHVzOiBJT2JzZXJ2YWJsZTxTZXNzaW9uU3RhdHVzPiA9IGNvbnN0T2JzZXJ2YWJsZShzdGF0dXMpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzUmVhZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBjb25zdE9ic2VydmFibGUodHJ1ZSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW50ZXJhY3Rpdml0eTogSU9ic2VydmFibGU8Q2hhdEludGVyYWN0aXZpdHk+ID0gY29uc3RPYnNlcnZhYmxlKENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpO1xuXHR9KCk7XG59XG5cbmNsYXNzIFRlc3RBY3RpdmVTZXNzaW9uIGV4dGVuZHMgbW9jazxJQWN0aXZlU2Vzc2lvbj4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25JZCA9ICdzZXNzaW9uJztcblx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Rlc3Qtc2Vzc2lvbjovL3Nlc3Npb24nKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgcHJvdmlkZXJJZCA9ICd0ZXN0Jztcblx0cmVhZG9ubHkgYWxsQ2hhdHM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRbXT47XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHZpc2libGVDaGF0VGFiczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPjtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlQ2hhdDogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdD47XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGNoYXRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPjtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb3BlbkNoYXRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPjtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgY2xvc2VkQ2hhdHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+O1xuXHRvdmVycmlkZSByZWFkb25seSBzaG91bGRTaG93Q2hhdFRhYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRvdmVycmlkZSByZWFkb25seSBtYWluQ2hhdDogSU9ic2VydmFibGU8SUNoYXQ+O1xuXHRvdmVycmlkZSByZWFkb25seSBjYXBhYmlsaXRpZXM6IElPYnNlcnZhYmxlPElTZXNzaW9uQ2FwYWJpbGl0aWVzPiA9IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSB9KTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNDcmVhdGVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNBcmNoaXZlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRvdmVycmlkZSByZWFkb25seSBsb2FkaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cblx0Y29uc3RydWN0b3IoY2hhdHM6IHJlYWRvbmx5IElDaGF0W10sIHZpc2libGVDaGF0czogcmVhZG9ubHkgSUNoYXRbXSA9IGNoYXRzLCBpc0NyZWF0ZWQgPSB0cnVlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBtYWluQ2hhdCA9IGNoYXRzWzBdO1xuXHRcdGlmICghbWFpbkNoYXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQSB0ZXN0IHNlc3Npb24gcmVxdWlyZXMgYSBtYWluIGNoYXQnKTtcblx0XHR9XG5cdFx0dGhpcy5hbGxDaGF0cyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBjaGF0cyk7XG5cdFx0dGhpcy52aXNpYmxlQ2hhdFRhYnMgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdmlzaWJsZUNoYXRzKTtcblx0XHR0aGlzLmFjdGl2ZUNoYXQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdmlzaWJsZUNoYXRzWzBdID8/IG1haW5DaGF0KTtcblx0XHR0aGlzLmNoYXRzID0gdGhpcy5hbGxDaGF0cztcblx0XHR0aGlzLm9wZW5DaGF0cyA9IHRoaXMudmlzaWJsZUNoYXRUYWJzO1xuXHRcdHRoaXMuY2xvc2VkQ2hhdHMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gbmV3IFNldCh0aGlzLnZpc2libGVDaGF0VGFicy5yZWFkKHJlYWRlcikubWFwKGNoYXQgPT4gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpKSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5hbGxDaGF0cy5yZWFkKHJlYWRlcikuZmlsdGVyKGNoYXQgPT4gIXZpc2libGUuaGFzKGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuc2hvdWxkU2hvd0NoYXRUYWJzID0gZGVyaXZlZChyZWFkZXIgPT4gdGhpcy52aXNpYmxlQ2hhdFRhYnMucmVhZChyZWFkZXIpLmxlbmd0aCA+IDEpO1xuXHRcdHRoaXMubWFpbkNoYXQgPSBjb25zdE9ic2VydmFibGUobWFpbkNoYXQpO1xuXHRcdHRoaXMuaXNDcmVhdGVkID0gY29uc3RPYnNlcnZhYmxlKGlzQ3JlYXRlZCk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFNlc3Npb25zU2VydmljZSBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdG5ld0NoYXRHYXRlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIGFzeW5jIG9wZW5DaGF0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShzZXNzaW9uIGluc3RhbmNlb2YgVGVzdEFjdGl2ZVNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXQgPSBzZXNzaW9uLmFsbENoYXRzLmdldCgpLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5yZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0VXJpLnRvU3RyaW5nKCkpO1xuXHRcdGlmICghY2hhdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXNlc3Npb24udmlzaWJsZUNoYXRUYWJzLmdldCgpLmluY2x1ZGVzKGNoYXQpKSB7XG5cdFx0XHRzZXNzaW9uLnZpc2libGVDaGF0VGFicy5zZXQoWy4uLnNlc3Npb24udmlzaWJsZUNoYXRUYWJzLmdldCgpLCBjaGF0XSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0c2Vzc2lvbi5hY3RpdmVDaGF0LnNldChjaGF0LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbi5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIG9wZW5OZXdDaGF0SW5TZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCEoc2Vzc2lvbiBpbnN0YW5jZW9mIFRlc3RBY3RpdmVTZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLm5ld0NoYXRHYXRlO1xuXHRcdGNvbnN0IGNoYXQgPSBjcmVhdGVDaGF0KGBuZXctJHtzZXNzaW9uLmFsbENoYXRzLmdldCgpLmxlbmd0aH1gLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHRzZXNzaW9uLmFsbENoYXRzLnNldChbLi4uc2Vzc2lvbi5hbGxDaGF0cy5nZXQoKSwgY2hhdF0sIHVuZGVmaW5lZCk7XG5cdFx0c2Vzc2lvbi52aXNpYmxlQ2hhdFRhYnMuc2V0KFsuLi5zZXNzaW9uLnZpc2libGVDaGF0VGFicy5nZXQoKSwgY2hhdF0sIHVuZGVmaW5lZCk7XG5cdFx0c2Vzc2lvbi5hY3RpdmVDaGF0LnNldChjaGF0LCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ2hhdEdyb3Vwc0hhcm5lc3Mge1xuXHRyZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRyZWFkb25seSBzZXNzaW9uc1NlcnZpY2U6IFRlc3RTZXNzaW9uc1NlcnZpY2U7XG5cdHJlYWRvbmx5IHZpZXc6IENoYXRHcm91cHNWaWV3O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVIYXJuZXNzKGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+KTogSUNoYXRHcm91cHNIYXJuZXNzIHtcblx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gbmV3IFRlc3RTZXNzaW9uc1NlcnZpY2UoKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFZpZXdGYWN0b3J5LCBuZXcgVGVzdENoYXRWaWV3RmFjdG9yeSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCBzZXNzaW9uc1NlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gRXZlbnQuTm9uZTtcblx0fSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQYXJ0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQYXJ0U2VydmljZT4oKSB7IH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXJzU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldFByb3ZpZGVyKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdH0oKSk7XG5cblx0Y29uc3QgdmlldyA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0R3JvdXBzVmlldykpO1xuXHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodmlldy5lbGVtZW50KTtcblx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB2aWV3LmVsZW1lbnQucmVtb3ZlKCkpKTtcblx0cmV0dXJuIHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgdmlldyB9O1xufVxuXG5zdWl0ZSgnU2Vzc2lvbnMgLSBDaGF0R3JvdXBzVmlldycsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0Y29uc3Qgb3B0aW9ucyA9IHsgcmVuZGVyU2Vzc2lvblR5cGVQaWNrZXJJbkNvbnRyb2xzOiBjb25zdE9ic2VydmFibGUoZmFsc2UpIH07XG5cblx0dGVzdCgnZm9jdXNpbmcgYW5vdGhlciBncm91cCB1cGRhdGVzIHRoZSBzZXNzaW9uIGFjdGl2ZSBjaGF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2Vzc2lvbnNTZXJ2aWNlLCB2aWV3IH0gPSBjcmVhdGVIYXJuZXNzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBtYWluID0gY3JlYXRlQ2hhdCgnbWFpbicpO1xuXHRcdGNvbnN0IHNlY29uZGFyeSA9IGNyZWF0ZUNoYXQoJ3NlY29uZGFyeScpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgVGVzdEFjdGl2ZVNlc3Npb24oW21haW4sIHNlY29uZGFyeV0pO1xuXHRcdHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdHZpZXcuc2V0U2Vzc2lvbihzZXNzaW9uLCBvcHRpb25zKTtcblx0XHR2aWV3LnNwbGl0Q2hhdFRvU2lkZShzZWNvbmRhcnkucmVzb3VyY2UpO1xuXG5cdFx0dmlldy5mb2N1c0FkamFjZW50R3JvdXAoJ3ByZXZpb3VzJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGl2ZUNoYXQ6IHNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKS5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0Zm9jdXNlZEdyb3VwOiBtYWluV2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ/LmNsb3Nlc3QoJy5jaGF0LWdyb3VwLXZpZXcnKT8ucXVlcnlTZWxlY3RvcignLmNoYXQtY29tcG9zaXRlLWJhci10YWInKT8uZ2V0QXR0cmlidXRlKCdkYXRhLWNoYXQtcmVzb3VyY2UnKSxcblx0XHR9LCB7XG5cdFx0XHRhY3RpdmVDaGF0OiBtYWluLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRmb2N1c2VkR3JvdXA6IG1haW4ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yYXRpb24gc2V0dGxlcyB3aGVuIGFuIGFscmVhZHktbG9hZGVkIGNhdGFsb2cgbm8gbG9uZ2VyIGNvbnRhaW5zIGEgc2F2ZWQgY2hhdCcsICgpID0+IHtcblx0XHRjb25zdCB7IHZpZXcgfSA9IGNyZWF0ZUhhcm5lc3MoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG1haW4gPSBjcmVhdGVDaGF0KCdtYWluJyk7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5ID0gY3JlYXRlQ2hhdCgnc2Vjb25kYXJ5Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBUZXN0QWN0aXZlU2Vzc2lvbihbbWFpbiwgc2Vjb25kYXJ5XSk7XG5cdFx0dmlldy5zZXRTZXNzaW9uKHNlc3Npb24sIG9wdGlvbnMpO1xuXHRcdHZpZXcuc3BsaXRDaGF0VG9TaWRlKHNlY29uZGFyeS5yZXNvdXJjZSk7XG5cdFx0dmlldy5zZXRTZXNzaW9uKHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cblx0XHRjb25zdCByZXN0b3JlZFNlc3Npb24gPSBuZXcgVGVzdEFjdGl2ZVNlc3Npb24oW21haW5dKTtcblx0XHR2aWV3LnNldFNlc3Npb24ocmVzdG9yZWRTZXNzaW9uLCBvcHRpb25zKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z3JvdXBDb3VudDogdmlldy5ncm91cENvdW50LmdldCgpLFxuXHRcdFx0Z3JvdXBzOiB2aWV3LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtZ3JvdXAtdmlldycpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRncm91cENvdW50OiAxLFxuXHRcdFx0Z3JvdXBzOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgc2Vzc2lvbiBkcmFmdHMgZG8gbm90IHJlc3RvcmUgYSBwZXJzaXN0ZWQgY2hhdCBncmlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlSGFybmVzcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbWFpbiA9IGNyZWF0ZUNoYXQoJ21haW4nKTtcblx0XHRjb25zdCBzZWNvbmRhcnkgPSBjcmVhdGVDaGF0KCdzZWNvbmRhcnknKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFRlc3RBY3RpdmVTZXNzaW9uKFttYWluLCBzZWNvbmRhcnldKTtcblx0XHR2aWV3LnNldFNlc3Npb24oc2Vzc2lvbiwgb3B0aW9ucyk7XG5cdFx0dmlldy5zcGxpdENoYXRUb1NpZGUoc2Vjb25kYXJ5LnJlc291cmNlKTtcblx0XHR2aWV3LnNldFNlc3Npb24odW5kZWZpbmVkLCBvcHRpb25zKTtcblxuXHRcdGNvbnN0IGRyYWZ0ID0gbmV3IFRlc3RBY3RpdmVTZXNzaW9uKFtjcmVhdGVDaGF0KCdkcmFmdCcsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpXSwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0dmlldy5zZXRTZXNzaW9uKGRyYWZ0LCBvcHRpb25zKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z3JvdXBDb3VudDogdmlldy5ncm91cENvdW50LmdldCgpLFxuXHRcdFx0dmlld0tpbmQ6IHZpZXcuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtdmlldycpPy5kYXRhc2V0LmtpbmQsXG5cdFx0fSwge1xuXHRcdFx0Z3JvdXBDb3VudDogMSxcblx0XHRcdHZpZXdLaW5kOiAnbmV3U2Vzc2lvbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5pbmcgYSBoaWRkZW4gY2hhdCB0byB0aGUgc2lkZSByZW1vdmVzIGl0cyB0ZW1wb3JhcnkgYWN0aXZlLWdyb3VwIGFzc2lnbm1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVIYXJuZXNzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBtYWluID0gY3JlYXRlQ2hhdCgnbWFpbicpO1xuXHRcdGNvbnN0IGhpZGRlbiA9IGNyZWF0ZUNoYXQoJ2hpZGRlbicpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgVGVzdEFjdGl2ZVNlc3Npb24oW21haW4sIGhpZGRlbl0sIFttYWluXSk7XG5cdFx0dmlldy5zZXRTZXNzaW9uKHNlc3Npb24sIG9wdGlvbnMpO1xuXG5cdFx0YXdhaXQgdmlldy5vcGVuQ2hhdEluTmV3R3JvdXAoaGlkZGVuLnJlc291cmNlKTtcblxuXHRcdGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20odmlldy5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWdyb3VwLXZpZXcnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRncm91cENvdW50OiB2aWV3Lmdyb3VwQ291bnQuZ2V0KCksXG5cdFx0XHRncm91cFRhYnM6IGdyb3Vwcy5tYXAoZ3JvdXAgPT4gQXJyYXkuZnJvbShncm91cC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLmNoYXQtY29tcG9zaXRlLWJhci10YWInKSkubWFwKHRhYiA9PiB0YWIuZGF0YXNldC5jaGF0UmVzb3VyY2UpKSxcblx0XHRcdGdyb3VwTGFiZWxzOiBncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpKSxcblx0XHR9LCB7XG5cdFx0XHRncm91cENvdW50OiAyLFxuXHRcdFx0Z3JvdXBUYWJzOiBbW21haW4ucmVzb3VyY2UudG9TdHJpbmcoKV0sIFtoaWRkZW4ucmVzb3VyY2UudG9TdHJpbmcoKV1dLFxuXHRcdFx0Z3JvdXBMYWJlbHM6IFsnQ2hhdCBHcm91cCAxIG9mIDInLCAnQ2hhdCBHcm91cCAyIG9mIDInXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbmluZyBhIHN1YmFnZW50IHRocm91Z2ggdGhlIHNlc3Npb25zIHNlcnZpY2UgdXNlcyB0aGUgZ3JvdXAgYWRqYWNlbnQgdG8gaXRzIHBhcmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlc3Npb25zU2VydmljZSwgdmlldyB9ID0gY3JlYXRlSGFybmVzcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbWFpbiA9IGNyZWF0ZUNoYXQoJ21haW4nKTtcblx0XHRjb25zdCBzZWNvbmRhcnkgPSBjcmVhdGVDaGF0KCdzZWNvbmRhcnknKTtcblx0XHRjb25zdCBzdWJhZ2VudCA9IGNyZWF0ZUNoYXQoJ3N1YmFnZW50JywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIG1haW4ucmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgVGVzdEFjdGl2ZVNlc3Npb24oW21haW4sIHNlY29uZGFyeSwgc3ViYWdlbnRdLCBbbWFpbiwgc2Vjb25kYXJ5XSk7XG5cdFx0dmlldy5zZXRTZXNzaW9uKHNlc3Npb24sIG9wdGlvbnMpO1xuXHRcdHZpZXcuc3BsaXRDaGF0VG9TaWRlKHNlY29uZGFyeS5yZXNvdXJjZSk7XG5cblx0XHRhd2FpdCBzZXNzaW9uc1NlcnZpY2Uub3BlbkNoYXQoc2Vzc2lvbiwgc3ViYWdlbnQucmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbSh2aWV3LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtZ3JvdXAtdmlldycpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdyb3VwQ291bnQ6IHZpZXcuZ3JvdXBDb3VudC5nZXQoKSxcblx0XHRcdGdyb3VwVGFiczogZ3JvdXBzLm1hcChncm91cCA9PiBBcnJheS5mcm9tKGdyb3VwLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYicpKS5tYXAodGFiID0+IHRhYi5kYXRhc2V0LmNoYXRSZXNvdXJjZSkpLFxuXHRcdFx0YWN0aXZlQ2hhdDogc2Vzc2lvbi5hY3RpdmVDaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0Z3JvdXBDb3VudDogMixcblx0XHRcdGdyb3VwVGFiczogW1ttYWluLnJlc291cmNlLnRvU3RyaW5nKCldLCBbc2Vjb25kYXJ5LnJlc291cmNlLnRvU3RyaW5nKCksIHN1YmFnZW50LnJlc291cmNlLnRvU3RyaW5nKCldXSxcblx0XHRcdGFjdGl2ZUNoYXQ6IHN1YmFnZW50LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlb3BlbmluZyBhIG1hbnVhbGx5IG1vdmVkIHN1YmFnZW50IHByZXNlcnZlcyBpdHMgZ3JvdXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uc1NlcnZpY2UsIHZpZXcgfSA9IGNyZWF0ZUhhcm5lc3MoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG1haW4gPSBjcmVhdGVDaGF0KCdtYWluJyk7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5ID0gY3JlYXRlQ2hhdCgnc2Vjb25kYXJ5Jyk7XG5cdFx0Y29uc3Qgc3ViYWdlbnQgPSBjcmVhdGVDaGF0KCdzdWJhZ2VudCcsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBtYWluLnJlc291cmNlKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFRlc3RBY3RpdmVTZXNzaW9uKFttYWluLCBzZWNvbmRhcnksIHN1YmFnZW50XSwgW21haW4sIHNlY29uZGFyeV0pO1xuXHRcdHZpZXcuc2V0U2Vzc2lvbihzZXNzaW9uLCBvcHRpb25zKTtcblx0XHR2aWV3LnNwbGl0Q2hhdFRvU2lkZShzZWNvbmRhcnkucmVzb3VyY2UpO1xuXHRcdGF3YWl0IHNlc3Npb25zU2VydmljZS5vcGVuQ2hhdChzZXNzaW9uLCBzdWJhZ2VudC5yZXNvdXJjZSk7XG5cdFx0dmlldy5tb3ZlQWN0aXZlQ2hhdFRvQWRqYWNlbnRHcm91cCgncHJldmlvdXMnKTtcblxuXHRcdGF3YWl0IHNlc3Npb25zU2VydmljZS5vcGVuQ2hhdChzZXNzaW9uLCBzZWNvbmRhcnkucmVzb3VyY2UpO1xuXHRcdGF3YWl0IHNlc3Npb25zU2VydmljZS5vcGVuQ2hhdChzZXNzaW9uLCBzdWJhZ2VudC5yZXNvdXJjZSk7XG5cblx0XHRjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKHZpZXcuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1ncm91cC12aWV3JykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzLm1hcChncm91cCA9PiBBcnJheS5mcm9tKGdyb3VwLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYicpKS5tYXAodGFiID0+IHRhYi5kYXRhc2V0LmNoYXRSZXNvdXJjZSkpLCBbXG5cdFx0XHRbbWFpbi5yZXNvdXJjZS50b1N0cmluZygpLCBzdWJhZ2VudC5yZXNvdXJjZS50b1N0cmluZygpXSxcblx0XHRcdFtzZWNvbmRhcnkucmVzb3VyY2UudG9TdHJpbmcoKV0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlZnQgc3BsaXQgdXBkYXRlcyBsb2dpY2FsIGFuZCBhY2Nlc3NpYmxlIGdyb3VwIG9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlSGFybmVzcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbWFpbiA9IGNyZWF0ZUNoYXQoJ21haW4nKTtcblx0XHRjb25zdCBzZWNvbmRhcnkgPSBjcmVhdGVDaGF0KCdzZWNvbmRhcnknKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFRlc3RBY3RpdmVTZXNzaW9uKFttYWluLCBzZWNvbmRhcnldKTtcblx0XHR2aWV3LnNldFNlc3Npb24oc2Vzc2lvbiwgb3B0aW9ucyk7XG5cblx0XHR2aWV3Wydfb25DaGF0RHJvcCddKHZpZXdbJ19ncm91cHMnXVswXS5pZCwgJ2xlZnQnLCB7IHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsIHJlc291cmNlOiBzZWNvbmRhcnkucmVzb3VyY2UudG9TdHJpbmcoKSB9KTtcblxuXHRcdGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20odmlldy5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuY2hhdC1ncm91cC12aWV3JykpO1xuXHRcdGNvbnN0IGxhYmVsQnlDaGF0ID0gT2JqZWN0LmZyb21FbnRyaWVzKGdyb3Vwcy5tYXAoZ3JvdXAgPT4gW1xuXHRcdFx0Z3JvdXAucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiJyk/LmRhdGFzZXQuY2hhdFJlc291cmNlLFxuXHRcdFx0Z3JvdXAuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFiZWxCeUNoYXQsIHtcblx0XHRcdFtzZWNvbmRhcnkucmVzb3VyY2UudG9TdHJpbmcoKV06ICdDaGF0IEdyb3VwIDEgb2YgMicsXG5cdFx0XHRbbWFpbi5yZXNvdXJjZS50b1N0cmluZygpXTogJ0NoYXQgR3JvdXAgMiBvZiAyJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgdGhlIGZvY3VzZWQgZ3JvdXAgdHJhbnNmZXJzIGZvY3VzIHRvIHRoZSByZW1haW5pbmcgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVIYXJuZXNzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBtYWluID0gY3JlYXRlQ2hhdCgnbWFpbicpO1xuXHRcdGNvbnN0IHNlY29uZGFyeSA9IGNyZWF0ZUNoYXQoJ3NlY29uZGFyeScpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgVGVzdEFjdGl2ZVNlc3Npb24oW21haW4sIHNlY29uZGFyeV0pO1xuXHRcdHZpZXcuc2V0U2Vzc2lvbihzZXNzaW9uLCBvcHRpb25zKTtcblx0XHR2aWV3LnNwbGl0Q2hhdFRvU2lkZShzZWNvbmRhcnkucmVzb3VyY2UpO1xuXHRcdHZpZXcuZm9jdXNBZGphY2VudEdyb3VwKCduZXh0Jyk7XG5cblx0XHRzZXNzaW9uLnZpc2libGVDaGF0VGFicy5zZXQoW21haW5dLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVtYWluaW5nR3JvdXAgPSB2aWV3LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWdyb3VwLXZpZXcnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdyb3VwQ291bnQ6IHZpZXcuZ3JvdXBDb3VudC5nZXQoKSxcblx0XHRcdGZvY3VzSW5SZW1haW5pbmdHcm91cDogcmVtYWluaW5nR3JvdXA/LmNvbnRhaW5zKG1haW5XaW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCksXG5cdFx0XHRhY3RpdmVDaGF0OiBzZXNzaW9uLmFjdGl2ZUNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHRncm91cENvdW50OiAxLFxuXHRcdFx0Zm9jdXNJblJlbWFpbmluZ0dyb3VwOiB0cnVlLFxuXHRcdFx0YWN0aXZlQ2hhdDogbWFpbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgY2hhdCBhY3Rpb24gZm9jdXNlcyBpdHMgZ3JvdXAgY29tcG9zZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVIYXJuZXNzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBtYWluID0gY3JlYXRlQ2hhdCgnbWFpbicpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgVGVzdEFjdGl2ZVNlc3Npb24oW21haW5dKTtcblx0XHR2aWV3LnNldFNlc3Npb24oc2Vzc2lvbiwgb3B0aW9ucyk7XG5cdFx0Y29uc3QgZ3JvdXAgPSB2aWV3LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWdyb3VwLXZpZXcnKSE7XG5cblx0XHRncm91cC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29tcG9zaXRlLWJhci1uZXctY2hhdCAuYWN0aW9uLWxhYmVsJykhLmNsaWNrKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMobWFpbldpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50KSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBjaGF0IHJlbWFpbnMgYXNzaWduZWQgdG8gdGhlIGdyb3VwIHdoZXJlIGNyZWF0aW9uIHN0YXJ0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uc1NlcnZpY2UsIHZpZXcgfSA9IGNyZWF0ZUhhcm5lc3MoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG1haW4gPSBjcmVhdGVDaGF0KCdtYWluJyk7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5ID0gY3JlYXRlQ2hhdCgnc2Vjb25kYXJ5Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBUZXN0QWN0aXZlU2Vzc2lvbihbbWFpbiwgc2Vjb25kYXJ5XSk7XG5cdFx0dmlldy5zZXRTZXNzaW9uKHNlc3Npb24sIG9wdGlvbnMpO1xuXHRcdHZpZXcuc3BsaXRDaGF0VG9TaWRlKHNlY29uZGFyeS5yZXNvdXJjZSk7XG5cdFx0dmlldy5mb2N1c0FkamFjZW50R3JvdXAoJ3ByZXZpb3VzJyk7XG5cdFx0Y29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbSh2aWV3LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5jaGF0LWdyb3VwLXZpZXcnKSk7XG5cdFx0Y29uc3QgbWFpbkdyb3VwID0gZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiJyk/LmRhdGFzZXQuY2hhdFJlc291cmNlID09PSBtYWluLnJlc291cmNlLnRvU3RyaW5nKCkpITtcblx0XHRjb25zdCBnYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdHNlc3Npb25zU2VydmljZS5uZXdDaGF0R2F0ZSA9IGdhdGUucDtcblxuXHRcdG1haW5Hcm91cC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29tcG9zaXRlLWJhci1uZXctY2hhdCAuYWN0aW9uLWxhYmVsJykhLmNsaWNrKCk7XG5cdFx0dmlldy5mb2N1c0FkamFjZW50R3JvdXAoJ25leHQnKTtcblx0XHRnYXRlLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgZ2F0ZS5wO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0Y29uc3QgbmV3Q2hhdCA9IHNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1haW5Hcm91cFRhYnM6IEFycmF5LmZyb20obWFpbkdyb3VwLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYicpKS5tYXAodGFiID0+IHRhYi5kYXRhc2V0LmNoYXRSZXNvdXJjZSksXG5cdFx0XHRzZWNvbmRhcnlHcm91cFRhYnM6IEFycmF5LmZyb20oZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAgIT09IG1haW5Hcm91cCkhLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYicpKS5tYXAodGFiID0+IHRhYi5kYXRhc2V0LmNoYXRSZXNvdXJjZSksXG5cdFx0XHRmb2N1c0luTWFpbkdyb3VwOiBtYWluR3JvdXAuY29udGFpbnMobWFpbldpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50KSxcblx0XHR9LCB7XG5cdFx0XHRtYWluR3JvdXBUYWJzOiBbbWFpbi5yZXNvdXJjZS50b1N0cmluZygpLCBuZXdDaGF0LnJlc291cmNlLnRvU3RyaW5nKCldLFxuXHRcdFx0c2Vjb25kYXJ5R3JvdXBUYWJzOiBbc2Vjb25kYXJ5LnJlc291cmNlLnRvU3RyaW5nKCldLFxuXHRcdFx0Zm9jdXNJbk1haW5Hcm91cDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsaUJBQWlCLFNBQTJDLHVCQUF1QjtBQUM1RixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsd0JBQXNDO0FBQy9DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CLGdCQUF1RCxxQkFBcUI7QUFDeEcsU0FBeUIsa0NBQWtDO0FBRTNELE1BQU0scUJBQXFCLGlCQUFpQjtBQUFBLEVBRzNDLFlBQXFCLE1BQW9CO0FBQ3hDLFVBQU07QUFEYztBQUZyQixTQUFpQixlQUFlLFdBQVcsU0FBUyxjQUFjLFFBQVE7QUFJekUsU0FBSyxRQUFRLFFBQVEsT0FBTztBQUM1QixTQUFLLFFBQVEsWUFBWSxLQUFLLFlBQVk7QUFBQSxFQUMzQztBQUFBLEVBRUEsU0FBaUI7QUFDaEIsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRVUsV0FBaUI7QUFBQSxFQUFFO0FBQUEsRUFFN0IsUUFBYztBQUNiLFNBQUssYUFB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
