import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { SessionStatus } from "../../common/session.js";
import { ISessionsManagementService } from "../../common/sessionsManagement.js";
import { SessionListModelChangeKind, SessionsListModelService } from "../../browser/sessionsListModelService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { mock } from "../../../../../base/test/common/mock.js";
function createSession(id, status = SessionStatus.Completed, opts) {
  return {
    sessionId: id,
    resource: URI.parse(`session://${id}`),
    providerId: "test",
    sessionType: "test",
    icon: Codicon.account,
    createdAt: opts?.createdAt ?? /* @__PURE__ */ new Date(),
    workspace: observableValue(`workspace-${id}`, void 0),
    title: observableValue(`title-${id}`, id),
    updatedAt: observableValue(`updatedAt-${id}`, opts?.updatedAt ?? /* @__PURE__ */ new Date()),
    status: observableValue(`status-${id}`, status),
    changesets: observableValue(`changesets-${id}`, []),
    changes: observableValue(`changes-${id}`, []),
    modelId: observableValue(`modelId-${id}`, void 0),
    mode: observableValue(`mode-${id}`, void 0),
    loading: observableValue(`loading-${id}`, false),
    isArchived: observableValue(`isArchived-${id}`, false),
    isRead: observableValue(`isRead-${id}`, true),
    description: observableValue(`description-${id}`, void 0),
    lastTurnEnd: observableValue(`lastTurnEnd-${id}`, void 0),
    chats: observableValue(`chats-${id}`, []),
    mainChat: constObservable(void 0),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
}
suite("SessionsListModelService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  let sessionsChangedEmitter;
  let sessionDeletedEmitter;
  setup(() => {
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
    sessionsChangedEmitter = disposables.add(new Emitter());
    sessionDeletedEmitter = disposables.add(new Emitter());
    instantiationService.stub(ISessionsManagementService, {
      ...mock(),
      onDidChangeSessions: sessionsChangedEmitter.event,
      onDidDeleteSession: sessionDeletedEmitter.event
    });
    service = disposables.add(instantiationService.createInstance(SessionsListModelService));
  });
  test("unread state takes precedence over the completed-state icon", () => {
    const completedStateIcon = Codicon.gitPullRequest;
    const unreadIcon = service.getStatusIcon(SessionStatus.Completed, false, false, completedStateIcon);
    const readIcon = service.getStatusIcon(SessionStatus.Completed, true, false, completedStateIcon);
    assert.deepStrictEqual({
      unread: { id: unreadIcon.id, color: unreadIcon.color?.id },
      read: { id: readIcon.id, color: readIcon.color?.id }
    }, {
      unread: { id: Codicon.circleFilled.id, color: "textLink.foreground" },
      read: { id: Codicon.gitPullRequest.id, color: void 0 }
    });
  });
  test("pinSession marks session as pinned", () => {
    const session = createSession("s1");
    assert.strictEqual(service.isSessionPinned(session), false);
    service.pinSession(session);
    assert.strictEqual(service.isSessionPinned(session), true);
  });
  test("unpinSession marks session as not pinned", () => {
    const session = createSession("s1");
    service.pinSession(session);
    service.unpinSession(session);
    assert.strictEqual(service.isSessionPinned(session), false);
  });
  test("pinSession is idempotent and fires onDidChange only once", () => {
    const session = createSession("s1");
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.pinSession(session);
    service.pinSession(session);
    assert.strictEqual(changeCount, 1);
  });
  test("unpinSession does not fire when not pinned", () => {
    const session = createSession("s1");
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.unpinSession(session);
    assert.strictEqual(changeCount, 0);
  });
  test("pinning one session does not affect another", () => {
    const s1 = createSession("s1");
    const s2 = createSession("s2");
    service.pinSession(s1);
    assert.strictEqual(service.isSessionPinned(s1), true);
    assert.strictEqual(service.isSessionPinned(s2), false);
  });
  test("unpinSessions unpins multiple sessions and fires once", () => {
    const s1 = createSession("s1");
    const s2 = createSession("s2");
    const s3 = createSession("s3");
    service.pinSession(s1);
    service.pinSession(s2);
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.unpinSessions([s1, s2, s3]);
    assert.deepStrictEqual(
      [service.isSessionPinned(s1), service.isSessionPinned(s2), changeCount],
      [false, false, 1]
    );
  });
  test("unpinSessions does not fire when none are pinned", () => {
    const s1 = createSession("s1");
    const s2 = createSession("s2");
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.unpinSessions([s1, s2]);
    assert.strictEqual(changeCount, 0);
  });
  test("onDidChange includes changes array with sessionId and kind", () => {
    const session = createSession("s1");
    const events = [];
    disposables.add(service.onDidChange((e) => events.push(e)));
    service.pinSession(session);
    service.unpinSession(session);
    assert.deepStrictEqual(events, [
      { changes: [{ sessionId: "s1", kind: SessionListModelChangeKind.Pinned }] },
      { changes: [{ sessionId: "s1", kind: SessionListModelChangeKind.Pinned }] }
    ]);
  });
  test("cleans up state when session is deleted", () => {
    const session = createSession("s1");
    service.pinSession(session);
    const events = [];
    disposables.add(service.onDidChange((e) => events.push(e)));
    sessionDeletedEmitter.fire(session);
    assert.strictEqual(service.isSessionPinned(session), false);
    assert.deepStrictEqual(events, [
      { changes: [{ sessionId: "s1", kind: SessionListModelChangeKind.Pinned }] }
    ]);
  });
  test("pin survives a session being evicted from the provider list", () => {
    const session = createSession("s1");
    service.pinSession(session);
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });
    assert.strictEqual(service.isSessionPinned(session), true);
    assert.strictEqual(changeCount, 0);
  });
  test("deletion does not fire when session has no state", () => {
    const session = createSession("s1");
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    sessionDeletedEmitter.fire(session);
    assert.strictEqual(changeCount, 0);
  });
  test("deletion does not affect other sessions", () => {
    const s1 = createSession("s1");
    const s2 = createSession("s2");
    service.pinSession(s1);
    service.pinSession(s2);
    sessionDeletedEmitter.fire(s1);
    assert.strictEqual(service.isSessionPinned(s1), false);
    assert.strictEqual(service.isSessionPinned(s2), true);
  });
  test("state is loaded from storage on construction", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store("sessionsListControl.pinnedSessions", JSON.stringify(["s1"]), StorageScope.PROFILE, StorageTarget.USER);
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, storageService);
    instantiationService.stub(ISessionsManagementService, { ...mock(), onDidDeleteSession: disposables.add(new Emitter()).event });
    const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));
    assert.strictEqual(loadedService.isSessionPinned(createSession("s1")), true);
    assert.strictEqual(loadedService.isSessionPinned(createSession("s2")), false);
  });
  test("corrupt storage data is handled gracefully", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store("sessionsListControl.pinnedSessions", "not-valid-json{", StorageScope.PROFILE, StorageTarget.USER);
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, storageService);
    instantiationService.stub(ISessionsManagementService, { ...mock(), onDidDeleteSession: disposables.add(new Emitter()).event });
    const loadedService = disposables.add(instantiationService.createInstance(SessionsListModelService));
    assert.strictEqual(loadedService.isSessionPinned(createSession("s1")), false);
  });
  suite("migrateLegacyReadState", () => {
    const LEGACY_KEY = "sessionsListControl.readSessions";
    const PRE_CUTOFF = /* @__PURE__ */ new Date("2026-01-01T00:00:00.000Z");
    const POST_CUTOFF = /* @__PURE__ */ new Date("2026-06-01T00:00:00.000Z");
    function createServiceWithLegacyRead(ids) {
      const storage = disposables.add(new InMemoryStorageService());
      if (ids !== void 0) {
        storage.store(LEGACY_KEY, JSON.stringify(ids), StorageScope.PROFILE, StorageTarget.USER);
      }
      const readMarks = [];
      const unreadMarks = [];
      const instantiationService = disposables.add(new TestInstantiationService());
      instantiationService.stub(IStorageService, storage);
      instantiationService.stub(ISessionsManagementService, {
        ...mock(),
        onDidDeleteSession: disposables.add(new Emitter()).event,
        markRead: async (session) => {
          readMarks.push(session.sessionId);
        },
        markUnread: async (session) => {
          unreadMarks.push(session.sessionId);
        }
      });
      const service2 = disposables.add(instantiationService.createInstance(SessionsListModelService));
      return { service: service2, storage, readMarks, unreadMarks };
    }
    test("marks a session with a legacy read entry read", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(["s1"]);
      service2.migrateLegacyReadState(createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF }));
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ["s1"], unreadMarks: [] });
    });
    test("marks a pre-cutoff session read even without a legacy read entry", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(void 0);
      service2.migrateLegacyReadState(createSession("old", SessionStatus.Completed, { updatedAt: PRE_CUTOFF }));
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ["old"], unreadMarks: [] });
    });
    test("never marks a session unread (recent session without a legacy read entry is left alone)", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(["other"]);
      service2.migrateLegacyReadState(createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF }));
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: [], unreadMarks: [] });
    });
    test("is a no-op when there is no legacy read state and the session is recent", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(void 0);
      service2.migrateLegacyReadState(createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF }));
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: [], unreadMarks: [] });
    });
    test("migrating the same read session twice marks it once", () => {
      const { readMarks, unreadMarks, service: service2 } = createServiceWithLegacyRead(["s1"]);
      const session = createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF });
      service2.migrateLegacyReadState(session);
      service2.migrateLegacyReadState(session);
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ["s1"], unreadMarks: [] });
    });
    test("persists migrated read sessions so a fresh service does not re-mark them", () => {
      const storage = disposables.add(new InMemoryStorageService());
      storage.store(LEGACY_KEY, JSON.stringify(["s1"]), StorageScope.PROFILE, StorageTarget.USER);
      const readMarks = [];
      const unreadMarks = [];
      const makeService = () => {
        const instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, storage);
        instantiationService.stub(ISessionsManagementService, {
          ...mock(),
          onDidDeleteSession: disposables.add(new Emitter()).event,
          markRead: async (session2) => {
            readMarks.push(session2.sessionId);
          },
          markUnread: async (session2) => {
            unreadMarks.push(session2.sessionId);
          }
        });
        return disposables.add(instantiationService.createInstance(SessionsListModelService));
      };
      const session = createSession("s1", SessionStatus.Completed, { updatedAt: POST_CUTOFF });
      makeService().migrateLegacyReadState(session);
      makeService().migrateLegacyReadState(session);
      assert.deepStrictEqual({ readMarks, unreadMarks }, { readMarks: ["s1"], unreadMarks: [] });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHNlc3Npb25zXFx0ZXN0XFxicm93c2VyXFxzZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNDaGFuZ2VFdmVudCwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uTGlzdE1vZGVsQ2hhbmdlRXZlbnQsIFNlc3Npb25MaXN0TW9kZWxDaGFuZ2VLaW5kLCBTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihpZDogc3RyaW5nLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMgPSBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgb3B0cz86IHsgY3JlYXRlZEF0PzogRGF0ZTsgdXBkYXRlZEF0PzogRGF0ZSB9KTogSVNlc3Npb24ge1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25JZDogaWQsXG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgc2Vzc2lvbjovLyR7aWR9YCksXG5cdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdHNlc3Npb25UeXBlOiAndGVzdCcsXG5cdFx0aWNvbjogQ29kaWNvbi5hY2NvdW50LFxuXHRcdGNyZWF0ZWRBdDogb3B0cz8uY3JlYXRlZEF0ID8/IG5ldyBEYXRlKCksXG5cdFx0d29ya3NwYWNlOiBvYnNlcnZhYmxlVmFsdWUoYHdvcmtzcGFjZS0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0dGl0bGU6IG9ic2VydmFibGVWYWx1ZShgdGl0bGUtJHtpZH1gLCBpZCksXG5cdFx0dXBkYXRlZEF0OiBvYnNlcnZhYmxlVmFsdWUoYHVwZGF0ZWRBdC0ke2lkfWAsIG9wdHM/LnVwZGF0ZWRBdCA/PyBuZXcgRGF0ZSgpKSxcblx0XHRzdGF0dXM6IG9ic2VydmFibGVWYWx1ZShgc3RhdHVzLSR7aWR9YCwgc3RhdHVzKSxcblx0XHRjaGFuZ2VzZXRzOiBvYnNlcnZhYmxlVmFsdWUoYGNoYW5nZXNldHMtJHtpZH1gLCBbXSksXG5cdFx0Y2hhbmdlczogb2JzZXJ2YWJsZVZhbHVlKGBjaGFuZ2VzLSR7aWR9YCwgW10pLFxuXHRcdG1vZGVsSWQ6IG9ic2VydmFibGVWYWx1ZShgbW9kZWxJZC0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0bW9kZTogb2JzZXJ2YWJsZVZhbHVlKGBtb2RlLSR7aWR9YCwgdW5kZWZpbmVkKSxcblx0XHRsb2FkaW5nOiBvYnNlcnZhYmxlVmFsdWUoYGxvYWRpbmctJHtpZH1gLCBmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogb2JzZXJ2YWJsZVZhbHVlKGBpc0FyY2hpdmVkLSR7aWR9YCwgZmFsc2UpLFxuXHRcdGlzUmVhZDogb2JzZXJ2YWJsZVZhbHVlKGBpc1JlYWQtJHtpZH1gLCB0cnVlKSxcblx0XHRkZXNjcmlwdGlvbjogb2JzZXJ2YWJsZVZhbHVlKGBkZXNjcmlwdGlvbi0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0bGFzdFR1cm5FbmQ6IG9ic2VydmFibGVWYWx1ZShgbGFzdFR1cm5FbmQtJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdGNoYXRzOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUNoYXRbXT4oYGNoYXRzLSR7aWR9YCwgW10pLFxuXHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGU8SUNoYXQ+KHVuZGVmaW5lZCEpLFxuXHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSB9KSxcblx0fTtcbn1cblxuc3VpdGUoJ1Nlc3Npb25zTGlzdE1vZGVsU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgc2VydmljZTogU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlO1xuXHRsZXQgc2Vzc2lvbnNDaGFuZ2VkRW1pdHRlcjogRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD47XG5cdGxldCBzZXNzaW9uRGVsZXRlZEVtaXR0ZXI6IEVtaXR0ZXI8SVNlc3Npb24+O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdHNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+KCkpO1xuXHRcdHNlc3Npb25EZWxldGVkRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwge1xuXHRcdFx0Li4ubW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSxcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IHNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZERlbGV0ZVNlc3Npb246IHNlc3Npb25EZWxldGVkRW1pdHRlci5ldmVudCxcblx0XHR9KTtcblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTGlzdE1vZGVsU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnJlYWQgc3RhdGUgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBjb21wbGV0ZWQtc3RhdGUgaWNvbicsICgpID0+IHtcblx0XHRjb25zdCBjb21wbGV0ZWRTdGF0ZUljb24gPSBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0O1xuXHRcdGNvbnN0IHVucmVhZEljb24gPSBzZXJ2aWNlLmdldFN0YXR1c0ljb24oU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIGZhbHNlLCBmYWxzZSwgY29tcGxldGVkU3RhdGVJY29uKTtcblx0XHRjb25zdCByZWFkSWNvbiA9IHNlcnZpY2UuZ2V0U3RhdHVzSWNvbihTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgdHJ1ZSwgZmFsc2UsIGNvbXBsZXRlZFN0YXRlSWNvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVucmVhZDogeyBpZDogdW5yZWFkSWNvbi5pZCwgY29sb3I6IHVucmVhZEljb24uY29sb3I/LmlkIH0sXG5cdFx0XHRyZWFkOiB7IGlkOiByZWFkSWNvbi5pZCwgY29sb3I6IHJlYWRJY29uLmNvbG9yPy5pZCB9LFxuXHRcdH0sIHtcblx0XHRcdHVucmVhZDogeyBpZDogQ29kaWNvbi5jaXJjbGVGaWxsZWQuaWQsIGNvbG9yOiAndGV4dExpbmsuZm9yZWdyb3VuZCcgfSxcblx0XHRcdHJlYWQ6IHsgaWQ6IENvZGljb24uZ2l0UHVsbFJlcXVlc3QuaWQsIGNvbG9yOiB1bmRlZmluZWQgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0gUGlubmluZyAtLVxuXG5cdHRlc3QoJ3BpblNlc3Npb24gbWFya3Mgc2Vzc2lvbiBhcyBwaW5uZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNTZXNzaW9uUGlubmVkKHNlc3Npb24pLCBmYWxzZSk7XG5cblx0XHRzZXJ2aWNlLnBpblNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbiksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnBpblNlc3Npb24gbWFya3Mgc2Vzc2lvbiBhcyBub3QgcGlubmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdHNlcnZpY2UucGluU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdHNlcnZpY2UudW5waW5TZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNTZXNzaW9uUGlubmVkKHNlc3Npb24pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BpblNlc3Npb24gaXMgaWRlbXBvdGVudCBhbmQgZmlyZXMgb25EaWRDaGFuZ2Ugb25seSBvbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4gY2hhbmdlQ291bnQrKykpO1xuXG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHNlc3Npb24pO1xuXHRcdHNlcnZpY2UucGluU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VucGluU2Vzc2lvbiBkb2VzIG5vdCBmaXJlIHdoZW4gbm90IHBpbm5lZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHRsZXQgY2hhbmdlQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IGNoYW5nZUNvdW50KyspKTtcblxuXHRcdHNlcnZpY2UudW5waW5TZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgncGlubmluZyBvbmUgc2Vzc2lvbiBkb2VzIG5vdCBhZmZlY3QgYW5vdGhlcicsICgpID0+IHtcblx0XHRjb25zdCBzMSA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgczIgPSBjcmVhdGVTZXNzaW9uKCdzMicpO1xuXG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHMxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzMSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzMiksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgndW5waW5TZXNzaW9ucyB1bnBpbnMgbXVsdGlwbGUgc2Vzc2lvbnMgYW5kIGZpcmVzIG9uY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgczEgPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdGNvbnN0IHMyID0gY3JlYXRlU2Vzc2lvbignczInKTtcblx0XHRjb25zdCBzMyA9IGNyZWF0ZVNlc3Npb24oJ3MzJyk7XG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHMxKTtcblx0XHRzZXJ2aWNlLnBpblNlc3Npb24oczIpO1xuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4gY2hhbmdlQ291bnQrKykpO1xuXG5cdFx0c2VydmljZS51bnBpblNlc3Npb25zKFtzMSwgczIsIHMzXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W3NlcnZpY2UuaXNTZXNzaW9uUGlubmVkKHMxKSwgc2VydmljZS5pc1Nlc3Npb25QaW5uZWQoczIpLCBjaGFuZ2VDb3VudF0sXG5cdFx0XHRbZmFsc2UsIGZhbHNlLCAxXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VucGluU2Vzc2lvbnMgZG9lcyBub3QgZmlyZSB3aGVuIG5vbmUgYXJlIHBpbm5lZCcsICgpID0+IHtcblx0XHRjb25zdCBzMSA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgczIgPSBjcmVhdGVTZXNzaW9uKCdzMicpO1xuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4gY2hhbmdlQ291bnQrKykpO1xuXG5cdFx0c2VydmljZS51bnBpblNlc3Npb25zKFtzMSwgczJdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VDb3VudCwgMCk7XG5cdH0pO1xuXG5cdC8vIC0tIG9uRGlkQ2hhbmdlIC0tXG5cblx0dGVzdCgnb25EaWRDaGFuZ2UgaW5jbHVkZXMgY2hhbmdlcyBhcnJheSB3aXRoIHNlc3Npb25JZCBhbmQga2luZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uTGlzdE1vZGVsQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlKGUgPT4gZXZlbnRzLnB1c2goZSkpKTtcblxuXHRcdHNlcnZpY2UucGluU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRzZXJ2aWNlLnVucGluU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbXG5cdFx0XHR7IGNoYW5nZXM6IFt7IHNlc3Npb25JZDogJ3MxJywga2luZDogU2Vzc2lvbkxpc3RNb2RlbENoYW5nZUtpbmQuUGlubmVkIH1dIH0sXG5cdFx0XHR7IGNoYW5nZXM6IFt7IHNlc3Npb25JZDogJ3MxJywga2luZDogU2Vzc2lvbkxpc3RNb2RlbENoYW5nZUtpbmQuUGlubmVkIH1dIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdC8vIC0tIENsZWFudXAgLS1cblxuXHR0ZXN0KCdjbGVhbnMgdXAgc3RhdGUgd2hlbiBzZXNzaW9uIGlzIGRlbGV0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkxpc3RNb2RlbENoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZShlID0+IGV2ZW50cy5wdXNoKGUpKSk7XG5cblx0XHRzZXNzaW9uRGVsZXRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzZXNzaW9uKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbXG5cdFx0XHR7IGNoYW5nZXM6IFt7IHNlc3Npb25JZDogJ3MxJywga2luZDogU2Vzc2lvbkxpc3RNb2RlbENoYW5nZUtpbmQuUGlubmVkIH1dIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BpbiBzdXJ2aXZlcyBhIHNlc3Npb24gYmVpbmcgZXZpY3RlZCBmcm9tIHRoZSBwcm92aWRlciBsaXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdHNlcnZpY2UucGluU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4gY2hhbmdlQ291bnQrKykpO1xuXG5cdFx0Ly8gQW4gYWdlbnQgdGhhdCBjYW5ub3QgYW5zd2VyIGBsaXN0U2Vzc2lvbnNgIHlldCByZXBvcnRzIG5vIHNlc3Npb25zLFxuXHRcdC8vIHNvIHRoZSBsaXN0IGV2aWN0cyB0aGVtIHVudGlsIHRoZSBuZXh0IHJlZnJlc2guIFRoYXQgbXVzdCBub3QgdW5waW4uXG5cdFx0c2Vzc2lvbnNDaGFuZ2VkRW1pdHRlci5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbc2Vzc2lvbl0sIGNoYW5nZWQ6IFtdIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNTZXNzaW9uUGlubmVkKHNlc3Npb24pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlQ291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGlvbiBkb2VzIG5vdCBmaXJlIHdoZW4gc2Vzc2lvbiBoYXMgbm8gc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiBjaGFuZ2VDb3VudCsrKSk7XG5cblx0XHRzZXNzaW9uRGVsZXRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VDb3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0aW9uIGRvZXMgbm90IGFmZmVjdCBvdGhlciBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzMSA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgczIgPSBjcmVhdGVTZXNzaW9uKCdzMicpO1xuXHRcdHNlcnZpY2UucGluU2Vzc2lvbihzMSk7XG5cdFx0c2VydmljZS5waW5TZXNzaW9uKHMyKTtcblxuXHRcdHNlc3Npb25EZWxldGVkRW1pdHRlci5maXJlKHMxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzMSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Nlc3Npb25QaW5uZWQoczIpLCB0cnVlKTtcblx0fSk7XG5cblx0Ly8gLS0gU3RvcmFnZSBwZXJzaXN0ZW5jZSAtLVxuXG5cdHRlc3QoJ3N0YXRlIGlzIGxvYWRlZCBmcm9tIHN0b3JhZ2Ugb24gY29uc3RydWN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gUHJlLXBvcHVsYXRlIHN0b3JhZ2Vcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnc2Vzc2lvbnNMaXN0Q29udHJvbC5waW5uZWRTZXNzaW9ucycsIEpTT04uc3RyaW5naWZ5KFsnczEnXSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHsgLi4ubW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSwgb25EaWREZWxldGVTZXNzaW9uOiBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpLmV2ZW50IH0pO1xuXHRcdGNvbnN0IGxvYWRlZFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9hZGVkU2VydmljZS5pc1Nlc3Npb25QaW5uZWQoY3JlYXRlU2Vzc2lvbignczEnKSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2FkZWRTZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChjcmVhdGVTZXNzaW9uKCdzMicpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3JydXB0IHN0b3JhZ2UgZGF0YSBpcyBoYW5kbGVkIGdyYWNlZnVsbHknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3Nlc3Npb25zTGlzdENvbnRyb2wucGlubmVkU2Vzc2lvbnMnLCAnbm90LXZhbGlkLWpzb257JywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgeyAuLi5tb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpLCBvbkRpZERlbGV0ZVNlc3Npb246IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSkuZXZlbnQgfSk7XG5cdFx0Y29uc3QgbG9hZGVkU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UpKTtcblxuXHRcdC8vIFNob3VsZCBub3QgdGhyb3cgYW5kIHNob3VsZCByZXR1cm4gZW1wdHkgc3RhdGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9hZGVkU2VydmljZS5pc1Nlc3Npb25QaW5uZWQoY3JlYXRlU2Vzc2lvbignczEnKSksIGZhbHNlKTtcblx0fSk7XG5cblx0Ly8gLS0gTGVnYWN5IHJlYWQtc3RhdGUgbWlncmF0aW9uIC0tXG5cblx0c3VpdGUoJ21pZ3JhdGVMZWdhY3lSZWFkU3RhdGUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBMRUdBQ1lfS0VZID0gJ3Nlc3Npb25zTGlzdENvbnRyb2wucmVhZFNlc3Npb25zJztcblx0XHQvLyBGaXhlZCByZWZlcmVuY2UgcG9pbnRzIHJlbGF0aXZlIHRvIHRoZSBtaWdyYXRpb24ncyAyMDI2LTA1LTEyIGN1dG9mZi5cblx0XHRjb25zdCBQUkVfQ1VUT0ZGID0gbmV3IERhdGUoJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicpO1xuXHRcdGNvbnN0IFBPU1RfQ1VUT0ZGID0gbmV3IERhdGUoJzIwMjYtMDYtMDFUMDA6MDA6MDAuMDAwWicpO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZVdpdGhMZWdhY3lSZWFkKGlkczogc3RyaW5nW10gfCB1bmRlZmluZWQpOiB7IHNlcnZpY2U6IFNlc3Npb25zTGlzdE1vZGVsU2VydmljZTsgc3RvcmFnZTogSW5NZW1vcnlTdG9yYWdlU2VydmljZTsgcmVhZE1hcmtzOiBzdHJpbmdbXTsgdW5yZWFkTWFya3M6IHN0cmluZ1tdIH0ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRcdGlmIChpZHMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRzdG9yYWdlLnN0b3JlKExFR0FDWV9LRVksIEpTT04uc3RyaW5naWZ5KGlkcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVhZE1hcmtzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgdW5yZWFkTWFya3M6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwge1xuXHRcdFx0XHQuLi5tb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpLFxuXHRcdFx0XHRvbkRpZERlbGV0ZVNlc3Npb246IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSkuZXZlbnQsXG5cdFx0XHRcdG1hcmtSZWFkOiBhc3luYyAoc2Vzc2lvbjogSVNlc3Npb24pID0+IHsgcmVhZE1hcmtzLnB1c2goc2Vzc2lvbi5zZXNzaW9uSWQpOyB9LFxuXHRcdFx0XHRtYXJrVW5yZWFkOiBhc3luYyAoc2Vzc2lvbjogSVNlc3Npb24pID0+IHsgdW5yZWFkTWFya3MucHVzaChzZXNzaW9uLnNlc3Npb25JZCk7IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4geyBzZXJ2aWNlLCBzdG9yYWdlLCByZWFkTWFya3MsIHVucmVhZE1hcmtzIH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnbWFya3MgYSBzZXNzaW9uIHdpdGggYSBsZWdhY3kgcmVhZCBlbnRyeSByZWFkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyByZWFkTWFya3MsIHVucmVhZE1hcmtzLCBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlV2l0aExlZ2FjeVJlYWQoWydzMSddKTtcblx0XHRcdHNlcnZpY2UubWlncmF0ZUxlZ2FjeVJlYWRTdGF0ZShjcmVhdGVTZXNzaW9uKCdzMScsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCB7IHVwZGF0ZWRBdDogUE9TVF9DVVRPRkYgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVhZE1hcmtzLCB1bnJlYWRNYXJrcyB9LCB7IHJlYWRNYXJrczogWydzMSddLCB1bnJlYWRNYXJrczogW10gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrcyBhIHByZS1jdXRvZmYgc2Vzc2lvbiByZWFkIGV2ZW4gd2l0aG91dCBhIGxlZ2FjeSByZWFkIGVudHJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyByZWFkTWFya3MsIHVucmVhZE1hcmtzLCBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlV2l0aExlZ2FjeVJlYWQodW5kZWZpbmVkKTtcblx0XHRcdHNlcnZpY2UubWlncmF0ZUxlZ2FjeVJlYWRTdGF0ZShjcmVhdGVTZXNzaW9uKCdvbGQnLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgeyB1cGRhdGVkQXQ6IFBSRV9DVVRPRkYgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVhZE1hcmtzLCB1bnJlYWRNYXJrcyB9LCB7IHJlYWRNYXJrczogWydvbGQnXSwgdW5yZWFkTWFya3M6IFtdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmV2ZXIgbWFya3MgYSBzZXNzaW9uIHVucmVhZCAocmVjZW50IHNlc3Npb24gd2l0aG91dCBhIGxlZ2FjeSByZWFkIGVudHJ5IGlzIGxlZnQgYWxvbmUpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyByZWFkTWFya3MsIHVucmVhZE1hcmtzLCBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlV2l0aExlZ2FjeVJlYWQoWydvdGhlciddKTtcblx0XHRcdHNlcnZpY2UubWlncmF0ZUxlZ2FjeVJlYWRTdGF0ZShjcmVhdGVTZXNzaW9uKCdzMScsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCB7IHVwZGF0ZWRBdDogUE9TVF9DVVRPRkYgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVhZE1hcmtzLCB1bnJlYWRNYXJrcyB9LCB7IHJlYWRNYXJrczogW10sIHVucmVhZE1hcmtzOiBbXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzIGEgbm8tb3Agd2hlbiB0aGVyZSBpcyBubyBsZWdhY3kgcmVhZCBzdGF0ZSBhbmQgdGhlIHNlc3Npb24gaXMgcmVjZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyByZWFkTWFya3MsIHVucmVhZE1hcmtzLCBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlV2l0aExlZ2FjeVJlYWQodW5kZWZpbmVkKTtcblx0XHRcdHNlcnZpY2UubWlncmF0ZUxlZ2FjeVJlYWRTdGF0ZShjcmVhdGVTZXNzaW9uKCdzMScsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCB7IHVwZGF0ZWRBdDogUE9TVF9DVVRPRkYgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVhZE1hcmtzLCB1bnJlYWRNYXJrcyB9LCB7IHJlYWRNYXJrczogW10sIHVucmVhZE1hcmtzOiBbXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pZ3JhdGluZyB0aGUgc2FtZSByZWFkIHNlc3Npb24gdHdpY2UgbWFya3MgaXQgb25jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcmVhZE1hcmtzLCB1bnJlYWRNYXJrcywgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZVdpdGhMZWdhY3lSZWFkKFsnczEnXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgeyB1cGRhdGVkQXQ6IFBPU1RfQ1VUT0ZGIH0pO1xuXHRcdFx0c2VydmljZS5taWdyYXRlTGVnYWN5UmVhZFN0YXRlKHNlc3Npb24pO1xuXHRcdFx0c2VydmljZS5taWdyYXRlTGVnYWN5UmVhZFN0YXRlKHNlc3Npb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVhZE1hcmtzLCB1bnJlYWRNYXJrcyB9LCB7IHJlYWRNYXJrczogWydzMSddLCB1bnJlYWRNYXJrczogW10gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZXJzaXN0cyBtaWdyYXRlZCByZWFkIHNlc3Npb25zIHNvIGEgZnJlc2ggc2VydmljZSBkb2VzIG5vdCByZS1tYXJrIHRoZW0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdFx0c3RvcmFnZS5zdG9yZShMRUdBQ1lfS0VZLCBKU09OLnN0cmluZ2lmeShbJ3MxJ10pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdGNvbnN0IHJlYWRNYXJrczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHVucmVhZE1hcmtzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbWFrZVNlcnZpY2UgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwge1xuXHRcdFx0XHRcdC4uLm1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCksXG5cdFx0XHRcdFx0b25EaWREZWxldGVTZXNzaW9uOiBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpLmV2ZW50LFxuXHRcdFx0XHRcdG1hcmtSZWFkOiBhc3luYyAoc2Vzc2lvbjogSVNlc3Npb24pID0+IHsgcmVhZE1hcmtzLnB1c2goc2Vzc2lvbi5zZXNzaW9uSWQpOyB9LFxuXHRcdFx0XHRcdG1hcmtVbnJlYWQ6IGFzeW5jIChzZXNzaW9uOiBJU2Vzc2lvbikgPT4geyB1bnJlYWRNYXJrcy5wdXNoKHNlc3Npb24uc2Vzc2lvbklkKTsgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlKSk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHsgdXBkYXRlZEF0OiBQT1NUX0NVVE9GRiB9KTtcblxuXHRcdFx0bWFrZVNlcnZpY2UoKS5taWdyYXRlTGVnYWN5UmVhZFN0YXRlKHNlc3Npb24pO1xuXHRcdFx0Ly8gQSBsYXRlciBsYXVuY2ggcmVsb2FkcyB0aGUgcGVyc2lzdGVkIFwiZG9uZVwiIHNldCBhbmQgbXVzdCBza2lwIGl0LFxuXHRcdFx0Ly8gc28gYSBzdWJzZXF1ZW50IHVucmVhZCAoZS5nLiBhIG5ldyB0dXJuKSBpcyBub3QgcmUtZmxpcHBlZCB0byByZWFkLlxuXHRcdFx0bWFrZVNlcnZpY2UoKS5taWdyYXRlTGVnYWN5UmVhZFN0YXRlKHNlc3Npb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVhZE1hcmtzLCB1bnJlYWRNYXJrcyB9LCB7IHJlYWRNYXJrczogWydzMSddLCB1bnJlYWRNYXJrczogW10gfSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQix1QkFB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
