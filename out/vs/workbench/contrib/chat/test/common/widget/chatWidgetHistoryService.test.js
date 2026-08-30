import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService, StorageScope } from "../../../../../../platform/storage/common/storage.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { ChatHistoryNavigator, ChatInputHistoryMaxEntries, ChatWidgetHistoryService, IChatWidgetHistoryService } from "../../../common/widget/chatWidgetHistoryService.js";
import { Memento } from "../../../../../common/memento.js";
suite("ChatWidgetHistoryService", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    Memento.clear(StorageScope.APPLICATION);
    Memento.clear(StorageScope.PROFILE);
    Memento.clear(StorageScope.WORKSPACE);
  });
  function createHistoryService() {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    return testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
  }
  function createInputState(text, modeKind = ChatModeKind.Ask) {
    return {
      inputText: text,
      attachments: [],
      mode: { id: modeKind, kind: modeKind },
      selectedModel: void 0,
      selections: [],
      contrib: {}
    };
  }
  test("should start with empty history", () => {
    const historyService = createHistoryService();
    const history = historyService.getHistory(ChatAgentLocation.Chat);
    assert.strictEqual(history.length, 0);
  });
  test("should append and retrieve history entries", () => {
    const historyService = createHistoryService();
    const entry = createInputState("test query");
    historyService.append(ChatAgentLocation.Chat, entry);
    const history = historyService.getHistory(ChatAgentLocation.Chat);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].inputText, "test query");
  });
  test("should maintain separate history per location", () => {
    const historyService = createHistoryService();
    historyService.append(ChatAgentLocation.Chat, createInputState("chat query"));
    historyService.append(ChatAgentLocation.Terminal, createInputState("terminal query"));
    const chatHistory = historyService.getHistory(ChatAgentLocation.Chat);
    const terminalHistory = historyService.getHistory(ChatAgentLocation.Terminal);
    assert.strictEqual(chatHistory.length, 1);
    assert.strictEqual(terminalHistory.length, 1);
    assert.strictEqual(chatHistory[0].inputText, "chat query");
    assert.strictEqual(terminalHistory[0].inputText, "terminal query");
  });
  test("should maintain separate history per history key", () => {
    const historyService = createHistoryService();
    historyService.append(ChatAgentLocation.Chat, createInputState("global query"));
    historyService.append(ChatAgentLocation.Chat, createInputState("session 1 query"), "session-1");
    historyService.append(ChatAgentLocation.Chat, createInputState("session 2 query"), "session-2");
    assert.deepStrictEqual({
      global: historyService.getHistory(ChatAgentLocation.Chat).map((entry) => entry.inputText),
      session1: historyService.getHistory(ChatAgentLocation.Chat, "session-1").map((entry) => entry.inputText),
      session2: historyService.getHistory(ChatAgentLocation.Chat, "session-2").map((entry) => entry.inputText)
    }, {
      global: ["global query"],
      session1: ["session 1 query"],
      session2: ["session 2 query"]
    });
  });
  test("should move history between history keys", () => {
    const historyService = createHistoryService();
    historyService.append(ChatAgentLocation.Chat, createInputState("committed query"), "committed-session");
    historyService.append(ChatAgentLocation.Chat, createInputState("untitled query"), "untitled-session");
    historyService.moveHistory(ChatAgentLocation.Chat, "untitled-session", "committed-session");
    assert.deepStrictEqual({
      untitled: historyService.getHistory(ChatAgentLocation.Chat, "untitled-session").map((entry) => entry.inputText),
      committed: historyService.getHistory(ChatAgentLocation.Chat, "committed-session").map((entry) => entry.inputText)
    }, {
      untitled: [],
      committed: ["committed query", "untitled query"]
    });
  });
  test("should limit history to max entries", () => {
    const historyService = createHistoryService();
    for (let i = 0; i < ChatInputHistoryMaxEntries + 10; i++) {
      historyService.append(ChatAgentLocation.Chat, createInputState(`query ${i}`));
    }
    const history = historyService.getHistory(ChatAgentLocation.Chat);
    assert.strictEqual(history.length, ChatInputHistoryMaxEntries);
    assert.strictEqual(history[0].inputText, "query 10");
    assert.strictEqual(history[history.length - 1].inputText, `query ${ChatInputHistoryMaxEntries + 9}`);
  });
  test("should fire append event when history is added", () => {
    const historyService = createHistoryService();
    let eventFired = false;
    let firedEntry;
    testDisposables.add(historyService.onDidChangeHistory((e) => {
      if (e.kind === "append") {
        eventFired = true;
        firedEntry = e.entry;
      }
    }));
    const entry = createInputState("test");
    historyService.append(ChatAgentLocation.Chat, entry);
    assert.ok(eventFired);
    assert.strictEqual(firedEntry?.inputText, "test");
  });
  test("should clear all history", () => {
    const historyService = createHistoryService();
    historyService.append(ChatAgentLocation.Chat, createInputState("query 1"));
    historyService.append(ChatAgentLocation.Terminal, createInputState("query 2"));
    historyService.clearHistory();
    assert.strictEqual(historyService.getHistory(ChatAgentLocation.Chat).length, 0);
    assert.strictEqual(historyService.getHistory(ChatAgentLocation.Terminal).length, 0);
  });
  test("should fire clear event when history is cleared", () => {
    const historyService = createHistoryService();
    let clearEventFired = false;
    testDisposables.add(historyService.onDidChangeHistory((e) => {
      if (e.kind === "clear") {
        clearEventFired = true;
      }
    }));
    historyService.clearHistory();
    assert.ok(clearEventFired);
  });
});
suite("ChatHistoryNavigator", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    Memento.clear(StorageScope.APPLICATION);
    Memento.clear(StorageScope.PROFILE);
    Memento.clear(StorageScope.WORKSPACE);
  });
  function createNavigator() {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    return testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
  }
  function createInputState(text) {
    return {
      inputText: text,
      attachments: [],
      mode: { id: ChatModeKind.Ask, kind: ChatModeKind.Ask },
      selectedModel: void 0,
      selections: [],
      contrib: {}
    };
  }
  test("should start at end of empty history", () => {
    const nav = createNavigator();
    assert.ok(nav.isAtEnd());
    assert.ok(nav.isAtStart());
  });
  test("should navigate backwards through history", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.append(createInputState("third"));
    assert.ok(nav.isAtEnd());
    const prev1 = nav.previous();
    assert.strictEqual(prev1?.inputText, "third");
    const prev2 = nav.previous();
    assert.strictEqual(prev2?.inputText, "second");
    const prev3 = nav.previous();
    assert.strictEqual(prev3?.inputText, "first");
    assert.ok(nav.isAtStart());
  });
  test("should navigate forwards through history", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.previous();
    nav.previous();
    assert.ok(nav.isAtStart());
    const next1 = nav.next();
    assert.strictEqual(next1?.inputText, "second");
    const next2 = nav.next();
    assert.strictEqual(next2, void 0);
    assert.ok(nav.isAtEnd());
  });
  test("should reset cursor to end", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.previous();
    assert.ok(!nav.isAtEnd());
    nav.resetCursor();
    assert.ok(nav.isAtEnd());
  });
  test("should overlay edited entries", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.previous();
    const edited = createInputState("second edited");
    nav.overlay(edited);
    const current = nav.current();
    assert.strictEqual(current?.inputText, "second edited");
    assert.strictEqual(nav.values[1].inputText, "second");
  });
  test("should clear overlay on append", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.previous();
    nav.overlay(createInputState("first edited"));
    const currentBefore = nav.current();
    assert.strictEqual(currentBefore?.inputText, "first edited");
    nav.append(createInputState("second"));
    assert.ok(nav.isAtEnd());
    nav.previous();
    assert.strictEqual(nav.current()?.inputText, "second");
  });
  test("should stop at start when navigating backwards", () => {
    const nav = createNavigator();
    nav.append(createInputState("only"));
    nav.previous();
    assert.ok(nav.isAtStart());
    const prev = nav.previous();
    assert.strictEqual(prev?.inputText, "only");
    assert.ok(nav.isAtStart());
  });
  test("should stop at end when navigating forwards", () => {
    const nav = createNavigator();
    nav.append(createInputState("only"));
    const next1 = nav.next();
    assert.strictEqual(next1, void 0);
    assert.ok(nav.isAtEnd());
    const next2 = nav.next();
    assert.strictEqual(next2, void 0);
    assert.ok(nav.isAtEnd());
  });
  test("should update when history service appends entries", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    historyService.append(ChatAgentLocation.Chat, createInputState("from service"));
    const history = nav.values;
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].inputText, "from service");
  });
  test("should adjust cursor when history is cleared", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.previous();
    assert.ok(!nav.isAtEnd());
    historyService.clearHistory();
    assert.ok(nav.isAtEnd());
    assert.ok(nav.isAtStart());
    assert.strictEqual(nav.values.length, 0);
  });
  test("should handle cursor adjustment when max entries reached", () => {
    const nav = createNavigator();
    for (let i = 0; i < ChatInputHistoryMaxEntries; i++) {
      nav.append(createInputState(`entry ${i}`));
    }
    for (let i = 0; i < 20; i++) {
      nav.previous();
    }
    nav.append(createInputState("new entry"));
    assert.ok(nav.isAtEnd());
  });
  test("should support concurrent navigators", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav1 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    const nav2 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav1.append(createInputState("query 1"));
    assert.strictEqual(nav1.values.length, 1);
    assert.strictEqual(nav2.values.length, 1);
    assert.strictEqual(nav1.values[0].inputText, "query 1");
    assert.strictEqual(nav2.values[0].inputText, "query 1");
    nav1.previous();
    assert.ok(!nav1.isAtEnd());
    assert.ok(nav2.isAtEnd());
    nav2.append(createInputState("query 2"));
    assert.strictEqual(nav1.values.length, 2);
    assert.strictEqual(nav2.values.length, 2);
    assert.strictEqual(nav1.current()?.inputText, "query 1");
    assert.ok(nav2.isAtEnd());
  });
  test("should support concurrent navigators with mixed positions", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav1 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    const nav2 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav1.append(createInputState("query 1"));
    nav1.append(createInputState("query 2"));
    nav1.append(createInputState("query 3"));
    assert.ok(nav1.isAtEnd());
    assert.ok(nav2.isAtEnd());
    nav1.previous();
    assert.strictEqual(nav1.current()?.inputText, "query 3");
    nav1.previous();
    assert.strictEqual(nav1.current()?.inputText, "query 2");
    nav2.previous();
    nav2.previous();
    nav2.previous();
    assert.strictEqual(nav2.current()?.inputText, "query 1");
    nav1.append(createInputState("query 4"));
    assert.ok(nav1.isAtEnd());
    assert.strictEqual(nav1.values.length, 4);
    assert.strictEqual(nav2.current()?.inputText, "query 1");
    assert.strictEqual(nav2.values.length, 4);
  });
  test("should keep concurrent navigators separated by history key", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav1 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    const nav2 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav1.setHistoryKey("session-1");
    nav2.setHistoryKey("session-2");
    nav1.append(createInputState("session 1 query 1"));
    nav1.append(createInputState("session 1 query 2"));
    nav2.append(createInputState("session 2 query"));
    nav1.previous();
    nav2.append(createInputState("session 2 query 2"));
    assert.deepStrictEqual({
      nav1Current: nav1.current()?.inputText,
      nav1Values: nav1.values.map((entry) => entry.inputText),
      nav2Values: nav2.values.map((entry) => entry.inputText)
    }, {
      nav1Current: "session 1 query 2",
      nav1Values: ["session 1 query 1", "session 1 query 2"],
      nav2Values: ["session 2 query", "session 2 query 2"]
    });
  });
  test("should update navigator when scoped history moves", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav.setHistoryKey("committed-session");
    historyService.append(ChatAgentLocation.Chat, createInputState("untitled query"), "untitled-session");
    historyService.moveHistory(ChatAgentLocation.Chat, "untitled-session", "committed-session");
    assert.deepStrictEqual(nav.values.map((entry) => entry.inputText), ["untitled query"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcd2lkZ2V0XFxjaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRJbnB1dEhpc3RvcnlNYXhFbnRyaWVzLCBDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vd2lkZ2V0L2NoYXRXaWRnZXRIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuXG5zdWl0ZSgnQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCB0ZXN0RGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Ly8gQ2xlYXIgbWVtZW50byBjYWNoZSBiZWZvcmUgZWFjaCB0ZXN0IHRvIHByZXZlbnQgc3RhdGUgbGVha2FnZVxuXHRcdE1lbWVudG8uY2xlYXIoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRNZW1lbnRvLmNsZWFyKFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRNZW1lbnRvLmNsZWFyKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVIaXN0b3J5U2VydmljZSgpOiBDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2Uge1xuXHRcdC8vIENyZWF0ZSBmcmVzaCBpbnN0YW5jZXMgZm9yIGVhY2ggdGVzdCB0byBhdm9pZCBzdGF0ZSBsZWFrYWdlXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRyZXR1cm4gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUlucHV0U3RhdGUodGV4dDogc3RyaW5nLCBtb2RlS2luZCA9IENoYXRNb2RlS2luZC5Bc2spOiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlucHV0VGV4dDogdGV4dCxcblx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdG1vZGU6IHsgaWQ6IG1vZGVLaW5kLCBraW5kOiBtb2RlS2luZCB9LFxuXHRcdFx0c2VsZWN0ZWRNb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0c2VsZWN0aW9uczogW10sXG5cdFx0XHRjb250cmliOiB7fVxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgc3RhcnQgd2l0aCBlbXB0eSBoaXN0b3J5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gY3JlYXRlSGlzdG9yeVNlcnZpY2UoKTtcblx0XHRjb25zdCBoaXN0b3J5ID0gaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgYXBwZW5kIGFuZCByZXRyaWV2ZSBoaXN0b3J5IGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBjcmVhdGVIaXN0b3J5U2VydmljZSgpO1xuXHRcdGNvbnN0IGVudHJ5ID0gY3JlYXRlSW5wdXRTdGF0ZSgndGVzdCBxdWVyeScpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBlbnRyeSk7XG5cblx0XHRjb25zdCBoaXN0b3J5ID0gaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLmlucHV0VGV4dCwgJ3Rlc3QgcXVlcnknKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG1haW50YWluIHNlcGFyYXRlIGhpc3RvcnkgcGVyIGxvY2F0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gY3JlYXRlSGlzdG9yeVNlcnZpY2UoKTtcblx0XHRoaXN0b3J5U2VydmljZS5hcHBlbmQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3JlYXRlSW5wdXRTdGF0ZSgnY2hhdCBxdWVyeScpKTtcblx0XHRoaXN0b3J5U2VydmljZS5hcHBlbmQoQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwsIGNyZWF0ZUlucHV0U3RhdGUoJ3Rlcm1pbmFsIHF1ZXJ5JykpO1xuXG5cdFx0Y29uc3QgY2hhdEhpc3RvcnkgPSBoaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdGNvbnN0IHRlcm1pbmFsSGlzdG9yeSA9IGhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRIaXN0b3J5Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1pbmFsSGlzdG9yeS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGF0SGlzdG9yeVswXS5pbnB1dFRleHQsICdjaGF0IHF1ZXJ5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1pbmFsSGlzdG9yeVswXS5pbnB1dFRleHQsICd0ZXJtaW5hbCBxdWVyeScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbWFpbnRhaW4gc2VwYXJhdGUgaGlzdG9yeSBwZXIgaGlzdG9yeSBrZXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBjcmVhdGVIaXN0b3J5U2VydmljZSgpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjcmVhdGVJbnB1dFN0YXRlKCdnbG9iYWwgcXVlcnknKSk7XG5cdFx0aGlzdG9yeVNlcnZpY2UuYXBwZW5kKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNyZWF0ZUlucHV0U3RhdGUoJ3Nlc3Npb24gMSBxdWVyeScpLCAnc2Vzc2lvbi0xJyk7XG5cdFx0aGlzdG9yeVNlcnZpY2UuYXBwZW5kKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNyZWF0ZUlucHV0U3RhdGUoJ3Nlc3Npb24gMiBxdWVyeScpLCAnc2Vzc2lvbi0yJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdsb2JhbDogaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KS5tYXAoZW50cnkgPT4gZW50cnkuaW5wdXRUZXh0KSxcblx0XHRcdHNlc3Npb24xOiBoaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsICdzZXNzaW9uLTEnKS5tYXAoZW50cnkgPT4gZW50cnkuaW5wdXRUZXh0KSxcblx0XHRcdHNlc3Npb24yOiBoaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsICdzZXNzaW9uLTInKS5tYXAoZW50cnkgPT4gZW50cnkuaW5wdXRUZXh0KSxcblx0XHR9LCB7XG5cdFx0XHRnbG9iYWw6IFsnZ2xvYmFsIHF1ZXJ5J10sXG5cdFx0XHRzZXNzaW9uMTogWydzZXNzaW9uIDEgcXVlcnknXSxcblx0XHRcdHNlc3Npb24yOiBbJ3Nlc3Npb24gMiBxdWVyeSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbW92ZSBoaXN0b3J5IGJldHdlZW4gaGlzdG9yeSBrZXlzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gY3JlYXRlSGlzdG9yeVNlcnZpY2UoKTtcblx0XHRoaXN0b3J5U2VydmljZS5hcHBlbmQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3JlYXRlSW5wdXRTdGF0ZSgnY29tbWl0dGVkIHF1ZXJ5JyksICdjb21taXR0ZWQtc2Vzc2lvbicpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjcmVhdGVJbnB1dFN0YXRlKCd1bnRpdGxlZCBxdWVyeScpLCAndW50aXRsZWQtc2Vzc2lvbicpO1xuXG5cdFx0aGlzdG9yeVNlcnZpY2UubW92ZUhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgJ3VudGl0bGVkLXNlc3Npb24nLCAnY29tbWl0dGVkLXNlc3Npb24nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dW50aXRsZWQ6IGhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgJ3VudGl0bGVkLXNlc3Npb24nKS5tYXAoZW50cnkgPT4gZW50cnkuaW5wdXRUZXh0KSxcblx0XHRcdGNvbW1pdHRlZDogaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCAnY29tbWl0dGVkLXNlc3Npb24nKS5tYXAoZW50cnkgPT4gZW50cnkuaW5wdXRUZXh0KSxcblx0XHR9LCB7XG5cdFx0XHR1bnRpdGxlZDogW10sXG5cdFx0XHRjb21taXR0ZWQ6IFsnY29tbWl0dGVkIHF1ZXJ5JywgJ3VudGl0bGVkIHF1ZXJ5J10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBsaW1pdCBoaXN0b3J5IHRvIG1heCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gY3JlYXRlSGlzdG9yeVNlcnZpY2UoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IENoYXRJbnB1dEhpc3RvcnlNYXhFbnRyaWVzICsgMTA7IGkrKykge1xuXHRcdFx0aGlzdG9yeVNlcnZpY2UuYXBwZW5kKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNyZWF0ZUlucHV0U3RhdGUoYHF1ZXJ5ICR7aX1gKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeSA9IGhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnkubGVuZ3RoLCBDaGF0SW5wdXRIaXN0b3J5TWF4RW50cmllcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnlbMF0uaW5wdXRUZXh0LCAncXVlcnkgMTAnKTsgLy8gRmlyc3QgMTAgc2hvdWxkIGJlIGRyb3BwZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVtoaXN0b3J5Lmxlbmd0aCAtIDFdLmlucHV0VGV4dCwgYHF1ZXJ5ICR7Q2hhdElucHV0SGlzdG9yeU1heEVudHJpZXMgKyA5fWApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmlyZSBhcHBlbmQgZXZlbnQgd2hlbiBoaXN0b3J5IGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gY3JlYXRlSGlzdG9yeVNlcnZpY2UoKTtcblx0XHRsZXQgZXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdGxldCBmaXJlZEVudHJ5OiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoaGlzdG9yeVNlcnZpY2Uub25EaWRDaGFuZ2VIaXN0b3J5KGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gJ2FwcGVuZCcpIHtcblx0XHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0XHRcdGZpcmVkRW50cnkgPSBlLmVudHJ5O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGVudHJ5ID0gY3JlYXRlSW5wdXRTdGF0ZSgndGVzdCcpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBlbnRyeSk7XG5cblx0XHRhc3NlcnQub2soZXZlbnRGaXJlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkRW50cnk/LmlucHV0VGV4dCwgJ3Rlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGNsZWFyIGFsbCBoaXN0b3J5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gY3JlYXRlSGlzdG9yeVNlcnZpY2UoKTtcblx0XHRoaXN0b3J5U2VydmljZS5hcHBlbmQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3JlYXRlSW5wdXRTdGF0ZSgncXVlcnkgMScpKTtcblx0XHRoaXN0b3J5U2VydmljZS5hcHBlbmQoQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwsIGNyZWF0ZUlucHV0U3RhdGUoJ3F1ZXJ5IDInKSk7XG5cblx0XHRoaXN0b3J5U2VydmljZS5jbGVhckhpc3RvcnkoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaXJlIGNsZWFyIGV2ZW50IHdoZW4gaGlzdG9yeSBpcyBjbGVhcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gY3JlYXRlSGlzdG9yeVNlcnZpY2UoKTtcblx0XHRsZXQgY2xlYXJFdmVudEZpcmVkID0gZmFsc2U7XG5cblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGhpc3RvcnlTZXJ2aWNlLm9uRGlkQ2hhbmdlSGlzdG9yeShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09ICdjbGVhcicpIHtcblx0XHRcdFx0Y2xlYXJFdmVudEZpcmVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRoaXN0b3J5U2VydmljZS5jbGVhckhpc3RvcnkoKTtcblx0XHRhc3NlcnQub2soY2xlYXJFdmVudEZpcmVkKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NoYXRIaXN0b3J5TmF2aWdhdG9yJywgKCkgPT4ge1xuXHRjb25zdCB0ZXN0RGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Ly8gQ2xlYXIgbWVtZW50byBjYWNoZSBiZWZvcmUgZWFjaCB0ZXN0IHRvIHByZXZlbnQgc3RhdGUgbGVha2FnZVxuXHRcdE1lbWVudG8uY2xlYXIoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRNZW1lbnRvLmNsZWFyKFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRNZW1lbnRvLmNsZWFyKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVOYXZpZ2F0b3IoKTogQ2hhdEhpc3RvcnlOYXZpZ2F0b3Ige1xuXHRcdC8vIENyZWF0ZSBmcmVzaCBpbnN0YW5jZXMgZm9yIGVhY2ggdGVzdCB0byBhdm9pZCBzdGF0ZSBsZWFrYWdlXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIGhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdHJldHVybiB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRIaXN0b3J5TmF2aWdhdG9yLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVJbnB1dFN0YXRlKHRleHQ6IHN0cmluZyk6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5wdXRUZXh0OiB0ZXh0LFxuXHRcdFx0YXR0YWNobWVudHM6IFtdLFxuXHRcdFx0bW9kZTogeyBpZDogQ2hhdE1vZGVLaW5kLkFzaywga2luZDogQ2hhdE1vZGVLaW5kLkFzayB9LFxuXHRcdFx0c2VsZWN0ZWRNb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0c2VsZWN0aW9uczogW10sXG5cdFx0XHRjb250cmliOiB7fVxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgc3RhcnQgYXQgZW5kIG9mIGVtcHR5IGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmF2ID0gY3JlYXRlTmF2aWdhdG9yKCk7XG5cdFx0YXNzZXJ0Lm9rKG5hdi5pc0F0RW5kKCkpO1xuXHRcdGFzc2VydC5vayhuYXYuaXNBdFN0YXJ0KCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbmF2aWdhdGUgYmFja3dhcmRzIHRocm91Z2ggaGlzdG9yeScsICgpID0+IHtcblx0XHRjb25zdCBuYXYgPSBjcmVhdGVOYXZpZ2F0b3IoKTtcblx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ2ZpcnN0JykpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnc2Vjb25kJykpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgndGhpcmQnKSk7XG5cblx0XHRhc3NlcnQub2sobmF2LmlzQXRFbmQoKSk7XG5cblx0XHRjb25zdCBwcmV2MSA9IG5hdi5wcmV2aW91cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2MT8uaW5wdXRUZXh0LCAndGhpcmQnKTtcblxuXHRcdGNvbnN0IHByZXYyID0gbmF2LnByZXZpb3VzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXYyPy5pbnB1dFRleHQsICdzZWNvbmQnKTtcblxuXHRcdGNvbnN0IHByZXYzID0gbmF2LnByZXZpb3VzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXYzPy5pbnB1dFRleHQsICdmaXJzdCcpO1xuXHRcdGFzc2VydC5vayhuYXYuaXNBdFN0YXJ0KCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbmF2aWdhdGUgZm9yd2FyZHMgdGhyb3VnaCBoaXN0b3J5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hdiA9IGNyZWF0ZU5hdmlnYXRvcigpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnZmlyc3QnKSk7XG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdzZWNvbmQnKSk7XG5cblx0XHRuYXYucHJldmlvdXMoKTtcblx0XHRuYXYucHJldmlvdXMoKTtcblx0XHRhc3NlcnQub2sobmF2LmlzQXRTdGFydCgpKTtcblxuXHRcdGNvbnN0IG5leHQxID0gbmF2Lm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV4dDE/LmlucHV0VGV4dCwgJ3NlY29uZCcpO1xuXG5cdFx0Y29uc3QgbmV4dDIgPSBuYXYubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXh0MiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2sobmF2LmlzQXRFbmQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXNldCBjdXJzb3IgdG8gZW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hdiA9IGNyZWF0ZU5hdmlnYXRvcigpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnZmlyc3QnKSk7XG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdzZWNvbmQnKSk7XG5cblx0XHRuYXYucHJldmlvdXMoKTtcblx0XHRhc3NlcnQub2soIW5hdi5pc0F0RW5kKCkpO1xuXG5cdFx0bmF2LnJlc2V0Q3Vyc29yKCk7XG5cdFx0YXNzZXJ0Lm9rKG5hdi5pc0F0RW5kKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgb3ZlcmxheSBlZGl0ZWQgZW50cmllcycsICgpID0+IHtcblx0XHRjb25zdCBuYXYgPSBjcmVhdGVOYXZpZ2F0b3IoKTtcblx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ2ZpcnN0JykpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnc2Vjb25kJykpO1xuXG5cdFx0bmF2LnByZXZpb3VzKCk7XG5cdFx0Y29uc3QgZWRpdGVkID0gY3JlYXRlSW5wdXRTdGF0ZSgnc2Vjb25kIGVkaXRlZCcpO1xuXHRcdG5hdi5vdmVybGF5KGVkaXRlZCk7XG5cblx0XHRjb25zdCBjdXJyZW50ID0gbmF2LmN1cnJlbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3VycmVudD8uaW5wdXRUZXh0LCAnc2Vjb25kIGVkaXRlZCcpO1xuXG5cdFx0Ly8gT3JpZ2luYWwgaGlzdG9yeSBzaG91bGQgYmUgdW5jaGFuZ2VkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdi52YWx1ZXNbMV0uaW5wdXRUZXh0LCAnc2Vjb25kJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjbGVhciBvdmVybGF5IG9uIGFwcGVuZCcsICgpID0+IHtcblx0XHRjb25zdCBuYXYgPSBjcmVhdGVOYXZpZ2F0b3IoKTtcblx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ2ZpcnN0JykpO1xuXG5cdFx0bmF2LnByZXZpb3VzKCk7XG5cdFx0bmF2Lm92ZXJsYXkoY3JlYXRlSW5wdXRTdGF0ZSgnZmlyc3QgZWRpdGVkJykpO1xuXG5cdFx0Y29uc3QgY3VycmVudEJlZm9yZSA9IG5hdi5jdXJyZW50KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1cnJlbnRCZWZvcmU/LmlucHV0VGV4dCwgJ2ZpcnN0IGVkaXRlZCcpO1xuXG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdzZWNvbmQnKSk7XG5cblx0XHQvLyBBZnRlciBhcHBlbmQsIGN1cnNvciBzaG91bGQgYmUgYXQgZW5kIGFuZCBvdmVybGF5IGNsZWFyZWRcblx0XHRhc3NlcnQub2sobmF2LmlzQXRFbmQoKSk7XG5cdFx0bmF2LnByZXZpb3VzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdi5jdXJyZW50KCk/LmlucHV0VGV4dCwgJ3NlY29uZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3RvcCBhdCBzdGFydCB3aGVuIG5hdmlnYXRpbmcgYmFja3dhcmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hdiA9IGNyZWF0ZU5hdmlnYXRvcigpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnb25seScpKTtcblxuXHRcdG5hdi5wcmV2aW91cygpO1xuXHRcdGFzc2VydC5vayhuYXYuaXNBdFN0YXJ0KCkpO1xuXG5cdFx0Y29uc3QgcHJldiA9IG5hdi5wcmV2aW91cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2Py5pbnB1dFRleHQsICdvbmx5Jyk7IC8vIFNob3VsZCBzdGF5IGF0IGZpcnN0XG5cdFx0YXNzZXJ0Lm9rKG5hdi5pc0F0U3RhcnQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdG9wIGF0IGVuZCB3aGVuIG5hdmlnYXRpbmcgZm9yd2FyZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmF2ID0gY3JlYXRlTmF2aWdhdG9yKCk7XG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdvbmx5JykpO1xuXG5cdFx0Y29uc3QgbmV4dDEgPSBuYXYubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXh0MSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2sobmF2LmlzQXRFbmQoKSk7XG5cblx0XHRjb25zdCBuZXh0MiA9IG5hdi5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5leHQyLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhuYXYuaXNBdEVuZCgpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHVwZGF0ZSB3aGVuIGhpc3Rvcnkgc2VydmljZSBhcHBlbmRzIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIGhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG5hdiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblxuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjcmVhdGVJbnB1dFN0YXRlKCdmcm9tIHNlcnZpY2UnKSk7XG5cblx0XHRjb25zdCBoaXN0b3J5ID0gbmF2LnZhbHVlcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLmlucHV0VGV4dCwgJ2Zyb20gc2VydmljZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgYWRqdXN0IGN1cnNvciB3aGVuIGhpc3RvcnkgaXMgY2xlYXJlZCcsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRXaWRnZXRIaXN0b3J5U2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgaGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbmF2ID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SGlzdG9yeU5hdmlnYXRvciwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdmaXJzdCcpKTtcblx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3NlY29uZCcpKTtcblxuXHRcdG5hdi5wcmV2aW91cygpO1xuXHRcdGFzc2VydC5vayghbmF2LmlzQXRFbmQoKSk7XG5cblx0XHRoaXN0b3J5U2VydmljZS5jbGVhckhpc3RvcnkoKTtcblxuXHRcdGFzc2VydC5vayhuYXYuaXNBdEVuZCgpKTtcblx0XHRhc3NlcnQub2sobmF2LmlzQXRTdGFydCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2LnZhbHVlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGN1cnNvciBhZGp1c3RtZW50IHdoZW4gbWF4IGVudHJpZXMgcmVhY2hlZCcsICgpID0+IHtcblx0XHRjb25zdCBuYXYgPSBjcmVhdGVOYXZpZ2F0b3IoKTtcblx0XHQvLyBBZGQgZW50cmllcyB1cCB0byB0aGUgbWF4XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBDaGF0SW5wdXRIaXN0b3J5TWF4RW50cmllczsgaSsrKSB7XG5cdFx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoYGVudHJ5ICR7aX1gKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gbWlkZGxlIG9mIGhpc3Rvcnlcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRcdG5hdi5wcmV2aW91cygpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBvbmUgbW9yZSBlbnRyeSAoc2hvdWxkIGRyb3Agb2xkZXN0KVxuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnbmV3IGVudHJ5JykpO1xuXG5cdFx0Ly8gQ3Vyc29yIHNob3VsZCBiZSBhdCBlbmQgYWZ0ZXIgYXBwZW5kXG5cdFx0YXNzZXJ0Lm9rKG5hdi5pc0F0RW5kKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VwcG9ydCBjb25jdXJyZW50IG5hdmlnYXRvcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIGhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG5hdjEgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRIaXN0b3J5TmF2aWdhdG9yLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cdFx0Y29uc3QgbmF2MiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblxuXHRcdG5hdjEuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3F1ZXJ5IDEnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2MS52YWx1ZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2Mi52YWx1ZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2MS52YWx1ZXNbMF0uaW5wdXRUZXh0LCAncXVlcnkgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYyLnZhbHVlc1swXS5pbnB1dFRleHQsICdxdWVyeSAxJyk7XG5cblx0XHRuYXYxLnByZXZpb3VzKCk7XG5cdFx0YXNzZXJ0Lm9rKCFuYXYxLmlzQXRFbmQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5hdjIuaXNBdEVuZCgpKTtcblxuXHRcdG5hdjIuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3F1ZXJ5IDInKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2MS52YWx1ZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2Mi52YWx1ZXMubGVuZ3RoLCAyKTtcblxuXHRcdC8vIG5hdjEgc2hvdWxkIHN0YXkgYXQgc2FtZSBwb3NpdGlvbiAocG9pbnRpbmcgdG8gcXVlcnkgMSlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2MS5jdXJyZW50KCk/LmlucHV0VGV4dCwgJ3F1ZXJ5IDEnKTtcblxuXHRcdC8vIG5hdjIgc2hvdWxkIGJlIGF0IGVuZFxuXHRcdGFzc2VydC5vayhuYXYyLmlzQXRFbmQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IGNvbmN1cnJlbnQgbmF2aWdhdG9ycyB3aXRoIG1peGVkIHBvc2l0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRXaWRnZXRIaXN0b3J5U2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgaGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbmF2MSA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0XHRjb25zdCBuYXYyID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SGlzdG9yeU5hdmlnYXRvciwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXG5cdFx0bmF2MS5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgncXVlcnkgMScpKTtcblx0XHRuYXYxLmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdxdWVyeSAyJykpO1xuXHRcdG5hdjEuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3F1ZXJ5IDMnKSk7XG5cblx0XHQvLyBCb3RoIGF0IGVuZFxuXHRcdGFzc2VydC5vayhuYXYxLmlzQXRFbmQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5hdjIuaXNBdEVuZCgpKTtcblxuXHRcdC8vIE1vdmUgbmF2MSBiYWNrIHRvICdxdWVyeSAyJ1xuXHRcdG5hdjEucHJldmlvdXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2MS5jdXJyZW50KCk/LmlucHV0VGV4dCwgJ3F1ZXJ5IDMnKTtcblx0XHRuYXYxLnByZXZpb3VzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdjEuY3VycmVudCgpPy5pbnB1dFRleHQsICdxdWVyeSAyJyk7XG5cblx0XHQvLyBNb3ZlIG5hdjIgYmFjayB0byAncXVlcnkgMSdcblx0XHRuYXYyLnByZXZpb3VzKCk7XG5cdFx0bmF2Mi5wcmV2aW91cygpO1xuXHRcdG5hdjIucHJldmlvdXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2Mi5jdXJyZW50KCk/LmlucHV0VGV4dCwgJ3F1ZXJ5IDEnKTtcblxuXHRcdC8vIEFwcGVuZCBuZXcgcXVlcnlcblx0XHRuYXYxLmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdxdWVyeSA0JykpO1xuXG5cdFx0Ly8gbmF2MSBzaG91bGQgYmUgYXQgZW5kIChiZWNhdXNlIGl0IGFwcGVuZGVkKVxuXHRcdGFzc2VydC5vayhuYXYxLmlzQXRFbmQoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdjEudmFsdWVzLmxlbmd0aCwgNCk7XG5cblx0XHQvLyBuYXYyIHNob3VsZCBzdGF5IGF0ICdxdWVyeSAxJ1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYyLmN1cnJlbnQoKT8uaW5wdXRUZXh0LCAncXVlcnkgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYyLnZhbHVlcy5sZW5ndGgsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQga2VlcCBjb25jdXJyZW50IG5hdmlnYXRvcnMgc2VwYXJhdGVkIGJ5IGhpc3Rvcnkga2V5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLCBoaXN0b3J5U2VydmljZSk7XG5cblx0XHRjb25zdCBuYXYxID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SGlzdG9yeU5hdmlnYXRvciwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXHRcdGNvbnN0IG5hdjIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRIaXN0b3J5TmF2aWdhdG9yLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cdFx0bmF2MS5zZXRIaXN0b3J5S2V5KCdzZXNzaW9uLTEnKTtcblx0XHRuYXYyLnNldEhpc3RvcnlLZXkoJ3Nlc3Npb24tMicpO1xuXG5cdFx0bmF2MS5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnc2Vzc2lvbiAxIHF1ZXJ5IDEnKSk7XG5cdFx0bmF2MS5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnc2Vzc2lvbiAxIHF1ZXJ5IDInKSk7XG5cdFx0bmF2Mi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnc2Vzc2lvbiAyIHF1ZXJ5JykpO1xuXG5cdFx0bmF2MS5wcmV2aW91cygpO1xuXHRcdG5hdjIuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3Nlc3Npb24gMiBxdWVyeSAyJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRuYXYxQ3VycmVudDogbmF2MS5jdXJyZW50KCk/LmlucHV0VGV4dCxcblx0XHRcdG5hdjFWYWx1ZXM6IG5hdjEudmFsdWVzLm1hcChlbnRyeSA9PiBlbnRyeS5pbnB1dFRleHQpLFxuXHRcdFx0bmF2MlZhbHVlczogbmF2Mi52YWx1ZXMubWFwKGVudHJ5ID0+IGVudHJ5LmlucHV0VGV4dCksXG5cdFx0fSwge1xuXHRcdFx0bmF2MUN1cnJlbnQ6ICdzZXNzaW9uIDEgcXVlcnkgMicsXG5cdFx0XHRuYXYxVmFsdWVzOiBbJ3Nlc3Npb24gMSBxdWVyeSAxJywgJ3Nlc3Npb24gMSBxdWVyeSAyJ10sXG5cdFx0XHRuYXYyVmFsdWVzOiBbJ3Nlc3Npb24gMiBxdWVyeScsICdzZXNzaW9uIDIgcXVlcnkgMiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgdXBkYXRlIG5hdmlnYXRvciB3aGVuIHNjb3BlZCBoaXN0b3J5IG1vdmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLCBoaXN0b3J5U2VydmljZSk7XG5cblx0XHRjb25zdCBuYXYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRIaXN0b3J5TmF2aWdhdG9yLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cdFx0bmF2LnNldEhpc3RvcnlLZXkoJ2NvbW1pdHRlZC1zZXNzaW9uJyk7XG5cblx0XHRoaXN0b3J5U2VydmljZS5hcHBlbmQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3JlYXRlSW5wdXRTdGF0ZSgndW50aXRsZWQgcXVlcnknKSwgJ3VudGl0bGVkLXNlc3Npb24nKTtcblx0XHRoaXN0b3J5U2VydmljZS5tb3ZlSGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCAndW50aXRsZWQtc2Vzc2lvbicsICdjb21taXR0ZWQtc2Vzc2lvbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuYXYudmFsdWVzLm1hcChlbnRyeSA9PiBlbnRyeS5pbnB1dFRleHQpLCBbJ3VudGl0bGVkIHF1ZXJ5J10pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLG1CQUFtQixvQkFBb0I7QUFDaEQsU0FBUyxzQkFBc0IsNEJBQTRCLDBCQUEwQixpQ0FBaUM7QUFDdEgsU0FBUyxlQUFlO0FBRXhCLE1BQU0sNEJBQTRCLE1BQU07QUFDdkMsUUFBTSxrQkFBa0Isd0NBQXdDO0FBRWhFLFFBQU0sTUFBTTtBQUVYLFlBQVEsTUFBTSxhQUFhLFdBQVc7QUFDdEMsWUFBUSxNQUFNLGFBQWEsT0FBTztBQUNsQyxZQUFRLE1BQU0sYUFBYSxTQUFTO0FBQUEsRUFDckMsQ0FBQztBQUVELFdBQVMsdUJBQWlEO0FBRXpELFVBQU0sdUJBQXVCLGdCQUFnQixJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDL0UsVUFBTSxpQkFBaUIsZ0JBQWdCLElBQUksSUFBSSxtQkFBbUIsQ0FBQztBQUNuRSx5QkFBcUIsS0FBSyxpQkFBaUIsY0FBYztBQUN6RCxXQUFPLGdCQUFnQixJQUFJLHFCQUFxQixlQUFlLHdCQUF3QixDQUFDO0FBQUEsRUFDekY7QUFFQSxXQUFTLGlCQUFpQixNQUFjLFdBQVcsYUFBYSxLQUEyQjtBQUMxRixXQUFPO0FBQUEsTUFDTixXQUFXO0FBQUEsTUFDWCxhQUFhLENBQUM7QUFBQSxNQUNkLE1BQU0sRUFBRSxJQUFJLFVBQVUsTUFB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
