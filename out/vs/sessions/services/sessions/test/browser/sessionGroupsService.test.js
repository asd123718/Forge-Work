import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IStorageService, InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { SessionStatus } from "../../common/session.js";
import { ISessionsManagementService } from "../../common/sessionsManagement.js";
import { SessionGroupsService } from "../../browser/sessionGroupsService.js";
function createSession(id, isArchived = false) {
  return {
    sessionId: id,
    resource: URI.parse(`session://${id}`),
    providerId: "test",
    sessionType: "test",
    icon: Codicon.account,
    createdAt: /* @__PURE__ */ new Date(),
    workspace: observableValue(`workspace-${id}`, void 0),
    title: observableValue(`title-${id}`, id),
    updatedAt: observableValue(`updatedAt-${id}`, /* @__PURE__ */ new Date()),
    status: observableValue(`status-${id}`, SessionStatus.Completed),
    changesets: observableValue(`changesets-${id}`, []),
    changes: observableValue(`changes-${id}`, []),
    modelId: observableValue(`modelId-${id}`, void 0),
    mode: observableValue(`mode-${id}`, void 0),
    loading: observableValue(`loading-${id}`, false),
    isArchived: observableValue(`isArchived-${id}`, isArchived),
    isRead: observableValue(`isRead-${id}`, true),
    description: observableValue(`description-${id}`, void 0),
    lastTurnEnd: observableValue(`lastTurnEnd-${id}`, void 0),
    chats: observableValue(`chats-${id}`, []),
    mainChat: constObservable(void 0),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
}
suite("SessionGroupsService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  let storageService;
  let sessionsChangedEmitter;
  let willSendRequestEmitter;
  let sessionStartedEmitter;
  let sessionArchivedEmitter;
  let sessionUnarchivedEmitter;
  let sessionDeletedEmitter;
  let sessionReplacedEmitter;
  let newSessionDiscardedEmitter;
  let instantiationService;
  let sessions;
  function sendNewSession(draftId, committedId = draftId) {
    willSendRequestEmitter.fire(createSession(draftId));
    if (committedId !== draftId) {
      sessionReplacedEmitter.fire({ from: createSession(draftId), to: createSession(committedId) });
    }
    sessionStartedEmitter.fire(createSession(committedId));
  }
  setup(() => {
    instantiationService = disposables.add(new TestInstantiationService());
    storageService = disposables.add(new InMemoryStorageService());
    instantiationService.stub(IStorageService, storageService);
    sessionsChangedEmitter = disposables.add(new Emitter());
    willSendRequestEmitter = disposables.add(new Emitter());
    sessionStartedEmitter = disposables.add(new Emitter());
    sessionArchivedEmitter = disposables.add(new Emitter());
    sessionUnarchivedEmitter = disposables.add(new Emitter());
    sessionDeletedEmitter = disposables.add(new Emitter());
    sessionReplacedEmitter = disposables.add(new Emitter());
    newSessionDiscardedEmitter = disposables.add(new Emitter());
    sessions = [];
    instantiationService.stub(ISessionsManagementService, {
      ...mock(),
      getSessions: () => sessions,
      onDidChangeSessions: sessionsChangedEmitter.event,
      onWillSendRequest: willSendRequestEmitter.event,
      onDidStartSession: sessionStartedEmitter.event,
      onDidArchiveSession: sessionArchivedEmitter.event,
      onDidUnarchiveSession: sessionUnarchivedEmitter.event,
      onDidDeleteSession: sessionDeletedEmitter.event,
      onDidReplaceSession: sessionReplacedEmitter.event,
      onDidDiscardNewSession: newSessionDiscardedEmitter.event
    });
    service = disposables.add(instantiationService.createInstance(SessionGroupsService));
  });
  test("create group with members and look up membership", () => {
    const group = service.createGroup("Group A", ["s1", "s2"]);
    assert.strictEqual(service.getGroup(group.id)?.name, "Group A");
    assert.strictEqual(service.getGroupOfSession("s1"), group.id);
    assert.strictEqual(service.getGroupOfSession("s2"), group.id);
    assert.deepStrictEqual(service.getSessionIdsInGroup(group.id).sort(), ["s1", "s2"]);
  });
  test("a session belongs to at most one group; adding moves it", () => {
    const a = service.createGroup("A", ["s1"]);
    const b = service.createGroup("B");
    service.addToGroup("s1", b.id);
    assert.strictEqual(service.getGroupOfSession("s1"), b.id);
    assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), []);
    assert.deepStrictEqual(service.getSessionIdsInGroup(b.id), ["s1"]);
  });
  test("addToGroup adds multiple sessions in a single change event", () => {
    const a = service.createGroup("A");
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.addToGroup(["s1", "s2", "s3"], a.id);
    assert.deepStrictEqual(
      [service.getSessionIdsInGroup(a.id), changeCount],
      [["s1", "s2", "s3"], 1]
    );
  });
  test("addToGroup with multiple sessions does not fire when none change", () => {
    const a = service.createGroup("A", ["s1", "s2"]);
    let changeCount = 0;
    disposables.add(service.onDidChange(() => changeCount++));
    service.addToGroup(["s1", "s2"], a.id);
    assert.strictEqual(changeCount, 0);
  });
  test("remove from group clears membership", () => {
    const a = service.createGroup("A", ["s1", "s2"]);
    service.removeFromGroup("s1");
    assert.strictEqual(service.getGroupOfSession("s1"), void 0);
    assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), ["s2"]);
  });
  test("rename group", () => {
    const a = service.createGroup("A");
    service.renameGroup(a.id, "Renamed");
    assert.strictEqual(service.getGroup(a.id)?.name, "Renamed");
  });
  test("delete group removes group and membership", () => {
    const a = service.createGroup("A", ["s1", "s2"]);
    service.deleteGroup(a.id);
    assert.strictEqual(service.getGroup(a.id), void 0);
    assert.strictEqual(service.getGroupOfSession("s1"), void 0);
    assert.strictEqual(service.getGroupOfSession("s2"), void 0);
  });
  test("membership is cleaned up when a session is deleted", () => {
    const a = service.createGroup("A", ["s1", "s2"]);
    const session = createSession("s1");
    sessionDeletedEmitter.fire(session);
    assert.deepStrictEqual({
      groupName: service.getGroup(a.id)?.name,
      removedMembership: service.getGroupOfSession("s1"),
      remainingMembers: service.getSessionIdsInGroup(a.id)
    }, {
      groupName: "A",
      removedMembership: void 0,
      remainingMembers: ["s2"]
    });
  });
  test("membership survives a session being evicted from the provider list", () => {
    const a = service.createGroup("A", ["s1", "s2"]);
    const session = createSession("s1");
    sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });
    assert.deepStrictEqual({
      membership: service.getGroupOfSession("s1"),
      remainingMembers: service.getSessionIdsInGroup(a.id).sort()
    }, {
      membership: a.id,
      remainingMembers: ["s1", "s2"]
    });
  });
  test("archiving the last member leaves an empty group", () => {
    const a = service.createGroup("A", ["s1"]);
    sessionArchivedEmitter.fire(createSession("s1"));
    assert.deepStrictEqual({
      archivedMembership: service.getGroupOfSession("s1"),
      groupName: service.getGroup(a.id)?.name,
      remainingMembers: service.getSessionIdsInGroup(a.id)
    }, {
      archivedMembership: void 0,
      groupName: "A",
      remainingMembers: []
    });
  });
  test("restoring an archived session does not restore its group membership", () => {
    const a = service.createGroup("A", ["s1"]);
    const session = createSession("s1");
    sessionArchivedEmitter.fire(session);
    sessionUnarchivedEmitter.fire(session);
    assert.deepStrictEqual({
      membership: service.getGroupOfSession("s1"),
      remainingMembers: service.getSessionIdsInGroup(a.id)
    }, {
      membership: void 0,
      remainingMembers: []
    });
  });
  test("membership is cleaned up when a provider reports an archived session", () => {
    const a = service.createGroup("A", ["s1", "s2"]);
    const session = createSession("s1", true);
    sessionsChangedEmitter.fire({ added: [], removed: [], changed: [session] });
    assert.deepStrictEqual({
      archivedMembership: service.getGroupOfSession("s1"),
      remainingMembers: service.getSessionIdsInGroup(a.id)
    }, {
      archivedMembership: void 0,
      remainingMembers: ["s2"]
    });
  });
  test("membership is cleaned up when a provider adds an archived session", () => {
    const a = service.createGroup("A", ["s1", "s2"]);
    const session = createSession("s1", true);
    sessionsChangedEmitter.fire({ added: [session], removed: [], changed: [] });
    assert.deepStrictEqual({
      archivedMembership: service.getGroupOfSession("s1"),
      remainingMembers: service.getSessionIdsInGroup(a.id)
    }, {
      archivedMembership: void 0,
      remainingMembers: ["s2"]
    });
  });
  test("persisted archived membership is cleaned up when the service loads", () => {
    const a = service.createGroup("A", ["s1", "s2"]);
    sessions = [createSession("s1", true), createSession("s2")];
    const reloaded = disposables.add(instantiationService.createInstance(SessionGroupsService));
    assert.deepStrictEqual({
      archivedMembership: reloaded.getGroupOfSession("s1"),
      remainingMembers: reloaded.getSessionIdsInGroup(a.id)
    }, {
      archivedMembership: void 0,
      remainingMembers: ["s2"]
    });
  });
  test("empty groups persist until explicitly deleted", () => {
    for (const name of ["1", "2", "3", "4"]) {
      service.createGroup(name);
    }
    const reloaded = disposables.add(instantiationService.createInstance(SessionGroupsService));
    assert.deepStrictEqual(reloaded.getGroups().map((group) => group.name).sort(), ["1", "2", "3", "4"]);
  });
  test("state persists across reload", () => {
    const a = service.createGroup("Persisted", ["s1", "s2"]);
    const reloaded = disposables.add(instantiationService.createInstance(SessionGroupsService));
    assert.strictEqual(reloaded.getGroup(a.id)?.name, "Persisted");
    assert.strictEqual(reloaded.getGroupOfSession("s1"), a.id);
    assert.strictEqual(reloaded.getGroupOfSession("s2"), a.id);
  });
  test("pending new session group binds the next started session", () => {
    const a = service.createGroup("A");
    service.setPendingNewSessionGroup(a.id);
    sendNewSession("started");
    assert.strictEqual(service.getGroupOfSession("started"), a.id);
    assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), ["started"]);
  });
  test("pending group follows the draft as it graduates to a committed id", () => {
    const a = service.createGroup("A");
    service.setPendingNewSessionGroup(a.id);
    sendNewSession("draft", "committed");
    assert.strictEqual(service.getGroupOfSession("committed"), a.id);
    assert.strictEqual(service.getGroupOfSession("draft"), void 0);
  });
  test("pending new session group is consumed once", () => {
    const a = service.createGroup("A");
    service.setPendingNewSessionGroup(a.id);
    sendNewSession("s1");
    sendNewSession("s2");
    assert.strictEqual(service.getGroupOfSession("s1"), a.id);
    assert.strictEqual(service.getGroupOfSession("s2"), void 0);
  });
  test("a concurrent send for another group does not rebind an in-flight send", () => {
    const a = service.createGroup("A");
    const b = service.createGroup("B");
    service.setPendingNewSessionGroup(a.id);
    willSendRequestEmitter.fire(createSession("a-draft"));
    service.setPendingNewSessionGroup(b.id);
    sessionStartedEmitter.fire(createSession("a-draft"));
    assert.strictEqual(service.getGroupOfSession("a-draft"), a.id);
    assert.strictEqual(service.getGroupOfSession("b-draft"), void 0);
  });
  test("discarding the new session clears the pending group", () => {
    const a = service.createGroup("A");
    service.setPendingNewSessionGroup(a.id);
    newSessionDiscardedEmitter.fire(createSession("draft"));
    sendNewSession("unrelated");
    assert.strictEqual(service.getGroupOfSession("unrelated"), void 0);
    assert.deepStrictEqual(service.getSessionIdsInGroup(a.id), []);
  });
  test("pending group for a non-existent group is ignored", () => {
    service.setPendingNewSessionGroup("missing");
    sendNewSession("s1");
    assert.strictEqual(service.getGroupOfSession("s1"), void 0);
  });
  test("deleting the pending group clears the pending intent", () => {
    const a = service.createGroup("A");
    service.setPendingNewSessionGroup(a.id);
    service.deleteGroup(a.id);
    const b = service.createGroup("B");
    sendNewSession("s1");
    assert.strictEqual(service.getGroupOfSession("s1"), void 0);
    assert.deepStrictEqual(service.getSessionIdsInGroup(b.id), []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHNlc3Npb25zXFx0ZXN0XFxicm93c2VyXFxzZXNzaW9uR3JvdXBzU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElDaGF0LCBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihpZDogc3RyaW5nLCBpc0FyY2hpdmVkID0gZmFsc2UpOiBJU2Vzc2lvbiB7XG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbklkOiBpZCxcblx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGBzZXNzaW9uOi8vJHtpZH1gKSxcblx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0c2Vzc2lvblR5cGU6ICd0ZXN0Jyxcblx0XHRpY29uOiBDb2RpY29uLmFjY291bnQsXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuXHRcdHdvcmtzcGFjZTogb2JzZXJ2YWJsZVZhbHVlKGB3b3Jrc3BhY2UtJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoYHRpdGxlLSR7aWR9YCwgaWQpLFxuXHRcdHVwZGF0ZWRBdDogb2JzZXJ2YWJsZVZhbHVlKGB1cGRhdGVkQXQtJHtpZH1gLCBuZXcgRGF0ZSgpKSxcblx0XHRzdGF0dXM6IG9ic2VydmFibGVWYWx1ZShgc3RhdHVzLSR7aWR9YCwgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLFxuXHRcdGNoYW5nZXNldHM6IG9ic2VydmFibGVWYWx1ZShgY2hhbmdlc2V0cy0ke2lkfWAsIFtdKSxcblx0XHRjaGFuZ2VzOiBvYnNlcnZhYmxlVmFsdWUoYGNoYW5nZXMtJHtpZH1gLCBbXSksXG5cdFx0bW9kZWxJZDogb2JzZXJ2YWJsZVZhbHVlKGBtb2RlbElkLSR7aWR9YCwgdW5kZWZpbmVkKSxcblx0XHRtb2RlOiBvYnNlcnZhYmxlVmFsdWUoYG1vZGUtJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdGxvYWRpbmc6IG9ic2VydmFibGVWYWx1ZShgbG9hZGluZy0ke2lkfWAsIGZhbHNlKSxcblx0XHRpc0FyY2hpdmVkOiBvYnNlcnZhYmxlVmFsdWUoYGlzQXJjaGl2ZWQtJHtpZH1gLCBpc0FyY2hpdmVkKSxcblx0XHRpc1JlYWQ6IG9ic2VydmFibGVWYWx1ZShgaXNSZWFkLSR7aWR9YCwgdHJ1ZSksXG5cdFx0ZGVzY3JpcHRpb246IG9ic2VydmFibGVWYWx1ZShgZGVzY3JpcHRpb24tJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdGxhc3RUdXJuRW5kOiBvYnNlcnZhYmxlVmFsdWUoYGxhc3RUdXJuRW5kLSR7aWR9YCwgdW5kZWZpbmVkKSxcblx0XHRjaGF0czogb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0W10+KGBjaGF0cy0ke2lkfWAsIFtdKSxcblx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlPElDaGF0Pih1bmRlZmluZWQhKSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdH07XG59XG5cbnN1aXRlKCdTZXNzaW9uR3JvdXBzU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgc2VydmljZTogU2Vzc2lvbkdyb3Vwc1NlcnZpY2U7XG5cdGxldCBzdG9yYWdlU2VydmljZTogSW5NZW1vcnlTdG9yYWdlU2VydmljZTtcblx0bGV0IHNlc3Npb25zQ2hhbmdlZEVtaXR0ZXI6IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+O1xuXHRsZXQgd2lsbFNlbmRSZXF1ZXN0RW1pdHRlcjogRW1pdHRlcjxJU2Vzc2lvbj47XG5cdGxldCBzZXNzaW9uU3RhcnRlZEVtaXR0ZXI6IEVtaXR0ZXI8SVNlc3Npb24+O1xuXHRsZXQgc2Vzc2lvbkFyY2hpdmVkRW1pdHRlcjogRW1pdHRlcjxJU2Vzc2lvbj47XG5cdGxldCBzZXNzaW9uVW5hcmNoaXZlZEVtaXR0ZXI6IEVtaXR0ZXI8SVNlc3Npb24+O1xuXHRsZXQgc2Vzc2lvbkRlbGV0ZWRFbWl0dGVyOiBFbWl0dGVyPElTZXNzaW9uPjtcblx0bGV0IHNlc3Npb25SZXBsYWNlZEVtaXR0ZXI6IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+O1xuXHRsZXQgbmV3U2Vzc2lvbkRpc2NhcmRlZEVtaXR0ZXI6IEVtaXR0ZXI8SVNlc3Npb24+O1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHNlc3Npb25zOiBJU2Vzc2lvbltdO1xuXG5cdC8qKiBTaW11bGF0ZSBhIG5ldy1zZXNzaW9uIHNlbmQ6IGRpc3BhdGNoIChgb25XaWxsU2VuZFJlcXVlc3RgKSB0aGVuIHN0YXJ0LiAqL1xuXHRmdW5jdGlvbiBzZW5kTmV3U2Vzc2lvbihkcmFmdElkOiBzdHJpbmcsIGNvbW1pdHRlZElkOiBzdHJpbmcgPSBkcmFmdElkKTogdm9pZCB7XG5cdFx0d2lsbFNlbmRSZXF1ZXN0RW1pdHRlci5maXJlKGNyZWF0ZVNlc3Npb24oZHJhZnRJZCkpO1xuXHRcdGlmIChjb21taXR0ZWRJZCAhPT0gZHJhZnRJZCkge1xuXHRcdFx0c2Vzc2lvblJlcGxhY2VkRW1pdHRlci5maXJlKHsgZnJvbTogY3JlYXRlU2Vzc2lvbihkcmFmdElkKSwgdG86IGNyZWF0ZVNlc3Npb24oY29tbWl0dGVkSWQpIH0pO1xuXHRcdH1cblx0XHRzZXNzaW9uU3RhcnRlZEVtaXR0ZXIuZmlyZShjcmVhdGVTZXNzaW9uKGNvbW1pdHRlZElkKSk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+KCkpO1xuXHRcdHdpbGxTZW5kUmVxdWVzdEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRcdHNlc3Npb25TdGFydGVkRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSk7XG5cdFx0c2Vzc2lvbkFyY2hpdmVkRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSk7XG5cdFx0c2Vzc2lvblVuYXJjaGl2ZWRFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uPigpKTtcblx0XHRzZXNzaW9uRGVsZXRlZEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRcdHNlc3Npb25SZXBsYWNlZEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRcdG5ld1Nlc3Npb25EaXNjYXJkZWRFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uPigpKTtcblx0XHRzZXNzaW9ucyA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRcdC4uLm1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCksXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gc2Vzc2lvbnMsXG5cdFx0XHRvbkRpZENoYW5nZVNlc3Npb25zOiBzZXNzaW9uc0NoYW5nZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25XaWxsU2VuZFJlcXVlc3Q6IHdpbGxTZW5kUmVxdWVzdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZFN0YXJ0U2Vzc2lvbjogc2Vzc2lvblN0YXJ0ZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWRBcmNoaXZlU2Vzc2lvbjogc2Vzc2lvbkFyY2hpdmVkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkVW5hcmNoaXZlU2Vzc2lvbjogc2Vzc2lvblVuYXJjaGl2ZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWREZWxldGVTZXNzaW9uOiBzZXNzaW9uRGVsZXRlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZFJlcGxhY2VTZXNzaW9uOiBzZXNzaW9uUmVwbGFjZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWREaXNjYXJkTmV3U2Vzc2lvbjogbmV3U2Vzc2lvbkRpc2NhcmRlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0fSk7XG5cdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uR3JvdXBzU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGUgZ3JvdXAgd2l0aCBtZW1iZXJzIGFuZCBsb29rIHVwIG1lbWJlcnNoaXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBzZXJ2aWNlLmNyZWF0ZUdyb3VwKCdHcm91cCBBJywgWydzMScsICdzMiddKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEdyb3VwKGdyb3VwLmlkKT8ubmFtZSwgJ0dyb3VwIEEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignczEnKSwgZ3JvdXAuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKCdzMicpLCBncm91cC5pZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25JZHNJbkdyb3VwKGdyb3VwLmlkKS5zb3J0KCksIFsnczEnLCAnczInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc2Vzc2lvbiBiZWxvbmdzIHRvIGF0IG1vc3Qgb25lIGdyb3VwOyBhZGRpbmcgbW92ZXMgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0EnLCBbJ3MxJ10pO1xuXHRcdGNvbnN0IGIgPSBzZXJ2aWNlLmNyZWF0ZUdyb3VwKCdCJyk7XG5cblx0XHRzZXJ2aWNlLmFkZFRvR3JvdXAoJ3MxJywgYi5pZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignczEnKSwgYi5pZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25JZHNJbkdyb3VwKGEuaWQpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25JZHNJbkdyb3VwKGIuaWQpLCBbJ3MxJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRUb0dyb3VwIGFkZHMgbXVsdGlwbGUgc2Vzc2lvbnMgaW4gYSBzaW5nbGUgY2hhbmdlIGV2ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBzZXJ2aWNlLmNyZWF0ZUdyb3VwKCdBJyk7XG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiBjaGFuZ2VDb3VudCsrKSk7XG5cblx0XHRzZXJ2aWNlLmFkZFRvR3JvdXAoWydzMScsICdzMicsICdzMyddLCBhLmlkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbc2VydmljZS5nZXRTZXNzaW9uSWRzSW5Hcm91cChhLmlkKSwgY2hhbmdlQ291bnRdLFxuXHRcdFx0W1snczEnLCAnczInLCAnczMnXSwgMV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRUb0dyb3VwIHdpdGggbXVsdGlwbGUgc2Vzc2lvbnMgZG9lcyBub3QgZmlyZSB3aGVuIG5vbmUgY2hhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBzZXJ2aWNlLmNyZWF0ZUdyb3VwKCdBJywgWydzMScsICdzMiddKTtcblx0XHRsZXQgY2hhbmdlQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IGNoYW5nZUNvdW50KyspKTtcblxuXHRcdHNlcnZpY2UuYWRkVG9Hcm91cChbJ3MxJywgJ3MyJ10sIGEuaWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlIGZyb20gZ3JvdXAgY2xlYXJzIG1lbWJlcnNoaXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0EnLCBbJ3MxJywgJ3MyJ10pO1xuXHRcdHNlcnZpY2UucmVtb3ZlRnJvbUdyb3VwKCdzMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24oJ3MxJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25JZHNJbkdyb3VwKGEuaWQpLCBbJ3MyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0EnKTtcblx0XHRzZXJ2aWNlLnJlbmFtZUdyb3VwKGEuaWQsICdSZW5hbWVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0R3JvdXAoYS5pZCk/Lm5hbWUsICdSZW5hbWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBncm91cCByZW1vdmVzIGdyb3VwIGFuZCBtZW1iZXJzaGlwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBzZXJ2aWNlLmNyZWF0ZUdyb3VwKCdBJywgWydzMScsICdzMiddKTtcblx0XHRzZXJ2aWNlLmRlbGV0ZUdyb3VwKGEuaWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0R3JvdXAoYS5pZCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24oJ3MxJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24oJ3MyJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lbWJlcnNoaXAgaXMgY2xlYW5lZCB1cCB3aGVuIGEgc2Vzc2lvbiBpcyBkZWxldGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBzZXJ2aWNlLmNyZWF0ZUdyb3VwKCdBJywgWydzMScsICdzMiddKTtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHRzZXNzaW9uRGVsZXRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z3JvdXBOYW1lOiBzZXJ2aWNlLmdldEdyb3VwKGEuaWQpPy5uYW1lLFxuXHRcdFx0cmVtb3ZlZE1lbWJlcnNoaXA6IHNlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24oJ3MxJyksXG5cdFx0XHRyZW1haW5pbmdNZW1iZXJzOiBzZXJ2aWNlLmdldFNlc3Npb25JZHNJbkdyb3VwKGEuaWQpLFxuXHRcdH0sIHtcblx0XHRcdGdyb3VwTmFtZTogJ0EnLFxuXHRcdFx0cmVtb3ZlZE1lbWJlcnNoaXA6IHVuZGVmaW5lZCxcblx0XHRcdHJlbWFpbmluZ01lbWJlcnM6IFsnczInXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWVtYmVyc2hpcCBzdXJ2aXZlcyBhIHNlc3Npb24gYmVpbmcgZXZpY3RlZCBmcm9tIHRoZSBwcm92aWRlciBsaXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBzZXJ2aWNlLmNyZWF0ZUdyb3VwKCdBJywgWydzMScsICdzMiddKTtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblxuXHRcdC8vIEFuIGFnZW50IHRoYXQgY2Fubm90IGFuc3dlciBgbGlzdFNlc3Npb25zYCB5ZXQgcmVwb3J0cyBubyBzZXNzaW9ucyxcblx0XHQvLyBzbyB0aGUgbGlzdCBldmljdHMgdGhlbSB1bnRpbCB0aGUgbmV4dCByZWZyZXNoLiBUaGF0IG11c3Qgbm90IGRyb3Bcblx0XHQvLyB0aGUgdXNlcidzIGdyb3VwaW5nLlxuXHRcdHNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3Nlc3Npb25dLCBjaGFuZ2VkOiBbXSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVtYmVyc2hpcDogc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignczEnKSxcblx0XHRcdHJlbWFpbmluZ01lbWJlcnM6IHNlcnZpY2UuZ2V0U2Vzc2lvbklkc0luR3JvdXAoYS5pZCkuc29ydCgpLFxuXHRcdH0sIHtcblx0XHRcdG1lbWJlcnNoaXA6IGEuaWQsXG5cdFx0XHRyZW1haW5pbmdNZW1iZXJzOiBbJ3MxJywgJ3MyJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FyY2hpdmluZyB0aGUgbGFzdCBtZW1iZXIgbGVhdmVzIGFuIGVtcHR5IGdyb3VwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBzZXJ2aWNlLmNyZWF0ZUdyb3VwKCdBJywgWydzMSddKTtcblxuXHRcdHNlc3Npb25BcmNoaXZlZEVtaXR0ZXIuZmlyZShjcmVhdGVTZXNzaW9uKCdzMScpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXJjaGl2ZWRNZW1iZXJzaGlwOiBzZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKCdzMScpLFxuXHRcdFx0Z3JvdXBOYW1lOiBzZXJ2aWNlLmdldEdyb3VwKGEuaWQpPy5uYW1lLFxuXHRcdFx0cmVtYWluaW5nTWVtYmVyczogc2VydmljZS5nZXRTZXNzaW9uSWRzSW5Hcm91cChhLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRhcmNoaXZlZE1lbWJlcnNoaXA6IHVuZGVmaW5lZCxcblx0XHRcdGdyb3VwTmFtZTogJ0EnLFxuXHRcdFx0cmVtYWluaW5nTWVtYmVyczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmluZyBhbiBhcmNoaXZlZCBzZXNzaW9uIGRvZXMgbm90IHJlc3RvcmUgaXRzIGdyb3VwIG1lbWJlcnNoaXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0EnLCBbJ3MxJ10pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXG5cdFx0c2Vzc2lvbkFyY2hpdmVkRW1pdHRlci5maXJlKHNlc3Npb24pO1xuXHRcdHNlc3Npb25VbmFyY2hpdmVkRW1pdHRlci5maXJlKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtZW1iZXJzaGlwOiBzZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKCdzMScpLFxuXHRcdFx0cmVtYWluaW5nTWVtYmVyczogc2VydmljZS5nZXRTZXNzaW9uSWRzSW5Hcm91cChhLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRtZW1iZXJzaGlwOiB1bmRlZmluZWQsXG5cdFx0XHRyZW1haW5pbmdNZW1iZXJzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWVtYmVyc2hpcCBpcyBjbGVhbmVkIHVwIHdoZW4gYSBwcm92aWRlciByZXBvcnRzIGFuIGFyY2hpdmVkIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0EnLCBbJ3MxJywgJ3MyJ10pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScsIHRydWUpO1xuXG5cdFx0c2Vzc2lvbnNDaGFuZ2VkRW1pdHRlci5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3Nlc3Npb25dIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhcmNoaXZlZE1lbWJlcnNoaXA6IHNlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24oJ3MxJyksXG5cdFx0XHRyZW1haW5pbmdNZW1iZXJzOiBzZXJ2aWNlLmdldFNlc3Npb25JZHNJbkdyb3VwKGEuaWQpLFxuXHRcdH0sIHtcblx0XHRcdGFyY2hpdmVkTWVtYmVyc2hpcDogdW5kZWZpbmVkLFxuXHRcdFx0cmVtYWluaW5nTWVtYmVyczogWydzMiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZW1iZXJzaGlwIGlzIGNsZWFuZWQgdXAgd2hlbiBhIHByb3ZpZGVyIGFkZHMgYW4gYXJjaGl2ZWQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBhID0gc2VydmljZS5jcmVhdGVHcm91cCgnQScsIFsnczEnLCAnczInXSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJywgdHJ1ZSk7XG5cblx0XHRzZXNzaW9uc0NoYW5nZWRFbWl0dGVyLmZpcmUoeyBhZGRlZDogW3Nlc3Npb25dLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFyY2hpdmVkTWVtYmVyc2hpcDogc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignczEnKSxcblx0XHRcdHJlbWFpbmluZ01lbWJlcnM6IHNlcnZpY2UuZ2V0U2Vzc2lvbklkc0luR3JvdXAoYS5pZCksXG5cdFx0fSwge1xuXHRcdFx0YXJjaGl2ZWRNZW1iZXJzaGlwOiB1bmRlZmluZWQsXG5cdFx0XHRyZW1haW5pbmdNZW1iZXJzOiBbJ3MyJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RlZCBhcmNoaXZlZCBtZW1iZXJzaGlwIGlzIGNsZWFuZWQgdXAgd2hlbiB0aGUgc2VydmljZSBsb2FkcycsICgpID0+IHtcblx0XHRjb25zdCBhID0gc2VydmljZS5jcmVhdGVHcm91cCgnQScsIFsnczEnLCAnczInXSk7XG5cdFx0c2Vzc2lvbnMgPSBbY3JlYXRlU2Vzc2lvbignczEnLCB0cnVlKSwgY3JlYXRlU2Vzc2lvbignczInKV07XG5cblx0XHRjb25zdCByZWxvYWRlZCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uR3JvdXBzU2VydmljZSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhcmNoaXZlZE1lbWJlcnNoaXA6IHJlbG9hZGVkLmdldEdyb3VwT2ZTZXNzaW9uKCdzMScpLFxuXHRcdFx0cmVtYWluaW5nTWVtYmVyczogcmVsb2FkZWQuZ2V0U2Vzc2lvbklkc0luR3JvdXAoYS5pZCksXG5cdFx0fSwge1xuXHRcdFx0YXJjaGl2ZWRNZW1iZXJzaGlwOiB1bmRlZmluZWQsXG5cdFx0XHRyZW1haW5pbmdNZW1iZXJzOiBbJ3MyJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGdyb3VwcyBwZXJzaXN0IHVudGlsIGV4cGxpY2l0bHkgZGVsZXRlZCcsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IG5hbWUgb2YgWycxJywgJzInLCAnMycsICc0J10pIHtcblx0XHRcdHNlcnZpY2UuY3JlYXRlR3JvdXAobmFtZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVsb2FkZWQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkdyb3Vwc1NlcnZpY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbG9hZGVkLmdldEdyb3VwcygpLm1hcChncm91cCA9PiBncm91cC5uYW1lKS5zb3J0KCksIFsnMScsICcyJywgJzMnLCAnNCddKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhdGUgcGVyc2lzdHMgYWNyb3NzIHJlbG9hZCcsICgpID0+IHtcblx0XHRjb25zdCBhID0gc2VydmljZS5jcmVhdGVHcm91cCgnUGVyc2lzdGVkJywgWydzMScsICdzMiddKTtcblxuXHRcdGNvbnN0IHJlbG9hZGVkID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25Hcm91cHNTZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbG9hZGVkLmdldEdyb3VwKGEuaWQpPy5uYW1lLCAnUGVyc2lzdGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbG9hZGVkLmdldEdyb3VwT2ZTZXNzaW9uKCdzMScpLCBhLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVsb2FkZWQuZ2V0R3JvdXBPZlNlc3Npb24oJ3MyJyksIGEuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZW5kaW5nIG5ldyBzZXNzaW9uIGdyb3VwIGJpbmRzIHRoZSBuZXh0IHN0YXJ0ZWQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBhID0gc2VydmljZS5jcmVhdGVHcm91cCgnQScpO1xuXHRcdHNlcnZpY2Uuc2V0UGVuZGluZ05ld1Nlc3Npb25Hcm91cChhLmlkKTtcblxuXHRcdHNlbmROZXdTZXNzaW9uKCdzdGFydGVkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignc3RhcnRlZCcpLCBhLmlkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbklkc0luR3JvdXAoYS5pZCksIFsnc3RhcnRlZCddKTtcblx0fSk7XG5cblx0dGVzdCgncGVuZGluZyBncm91cCBmb2xsb3dzIHRoZSBkcmFmdCBhcyBpdCBncmFkdWF0ZXMgdG8gYSBjb21taXR0ZWQgaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0EnKTtcblx0XHRzZXJ2aWNlLnNldFBlbmRpbmdOZXdTZXNzaW9uR3JvdXAoYS5pZCk7XG5cblx0XHRzZW5kTmV3U2Vzc2lvbignZHJhZnQnLCAnY29tbWl0dGVkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignY29tbWl0dGVkJyksIGEuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKCdkcmFmdCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZW5kaW5nIG5ldyBzZXNzaW9uIGdyb3VwIGlzIGNvbnN1bWVkIG9uY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0EnKTtcblx0XHRzZXJ2aWNlLnNldFBlbmRpbmdOZXdTZXNzaW9uR3JvdXAoYS5pZCk7XG5cblx0XHRzZW5kTmV3U2Vzc2lvbignczEnKTtcblx0XHRzZW5kTmV3U2Vzc2lvbignczInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKCdzMScpLCBhLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignczInKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYSBjb25jdXJyZW50IHNlbmQgZm9yIGFub3RoZXIgZ3JvdXAgZG9lcyBub3QgcmViaW5kIGFuIGluLWZsaWdodCBzZW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBzZXJ2aWNlLmNyZWF0ZUdyb3VwKCdBJyk7XG5cdFx0Y29uc3QgYiA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0InKTtcblxuXHRcdC8vIERpc3BhdGNoIGEgc2VuZCBmb3IgQSwgdGhlbiBhcm0gQiBiZWZvcmUgQSdzIHN0YXJ0IGNvbW1pdHMuXG5cdFx0c2VydmljZS5zZXRQZW5kaW5nTmV3U2Vzc2lvbkdyb3VwKGEuaWQpO1xuXHRcdHdpbGxTZW5kUmVxdWVzdEVtaXR0ZXIuZmlyZShjcmVhdGVTZXNzaW9uKCdhLWRyYWZ0JykpO1xuXHRcdHNlcnZpY2Uuc2V0UGVuZGluZ05ld1Nlc3Npb25Hcm91cChiLmlkKTtcblxuXHRcdHNlc3Npb25TdGFydGVkRW1pdHRlci5maXJlKGNyZWF0ZVNlc3Npb24oJ2EtZHJhZnQnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignYS1kcmFmdCcpLCBhLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignYi1kcmFmdCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjYXJkaW5nIHRoZSBuZXcgc2Vzc2lvbiBjbGVhcnMgdGhlIHBlbmRpbmcgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0EnKTtcblx0XHRzZXJ2aWNlLnNldFBlbmRpbmdOZXdTZXNzaW9uR3JvdXAoYS5pZCk7XG5cblx0XHRuZXdTZXNzaW9uRGlzY2FyZGVkRW1pdHRlci5maXJlKGNyZWF0ZVNlc3Npb24oJ2RyYWZ0JykpO1xuXHRcdHNlbmROZXdTZXNzaW9uKCd1bnJlbGF0ZWQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKCd1bnJlbGF0ZWQnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbklkc0luR3JvdXAoYS5pZCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncGVuZGluZyBncm91cCBmb3IgYSBub24tZXhpc3RlbnQgZ3JvdXAgaXMgaWdub3JlZCcsICgpID0+IHtcblx0XHRzZXJ2aWNlLnNldFBlbmRpbmdOZXdTZXNzaW9uR3JvdXAoJ21pc3NpbmcnKTtcblx0XHRzZW5kTmV3U2Vzc2lvbignczEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbignczEnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRpbmcgdGhlIHBlbmRpbmcgZ3JvdXAgY2xlYXJzIHRoZSBwZW5kaW5nIGludGVudCcsICgpID0+IHtcblx0XHRjb25zdCBhID0gc2VydmljZS5jcmVhdGVHcm91cCgnQScpO1xuXHRcdHNlcnZpY2Uuc2V0UGVuZGluZ05ld1Nlc3Npb25Hcm91cChhLmlkKTtcblx0XHRzZXJ2aWNlLmRlbGV0ZUdyb3VwKGEuaWQpO1xuXG5cdFx0Y29uc3QgYiA9IHNlcnZpY2UuY3JlYXRlR3JvdXAoJ0InKTtcblx0XHRzZW5kTmV3U2Vzc2lvbignczEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKCdzMScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRTZXNzaW9uSWRzSW5Hcm91cChiLmlkKSwgW10pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBp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
