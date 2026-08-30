import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackKind, AgentFeedbackService, AgentFeedbackState, whenWidgetForSession } from "../../browser/agentFeedbackService.js";
import { getSessionEditorComments } from "../../browser/sessionEditorComments.js";
import { IChatEditingService } from "../../../../../workbench/contrib/chat/common/editing/chatEditingService.js";
import { IChatWidgetService } from "../../../../../workbench/contrib/chat/browser/chat.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../../common/agentHostSessionsProvider.js";
function r(startLine, endLine = startLine) {
  return new Range(startLine, 1, endLine, 1);
}
function feedbackSummary(items) {
  return items.map((f) => `${f.resourceUri.path}:${f.range.startLineNumber}`);
}
suite("AgentFeedbackService - Ordering", () => {
  const store = new DisposableStore();
  let service;
  let session;
  let fileA;
  let fileB;
  let fileC;
  setup(() => {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IChatEditingService, new class extends mock() {
    }());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IEditorService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidVisibleEditorsChange = Event.None;
        this.visibleEditorPanes = [];
      }
      openEditor(..._args) {
        return Promise.resolve(void 0);
      }
    }());
    instantiationService.stub(ISessionsManagementService, new class extends mock() {
      getSession(_resource) {
        return void 0;
      }
    }());
    instantiationService.stub(ISessionsService, { activeSession: observableValue("activeSession", void 0) });
    service = store.add(instantiationService.createInstance(AgentFeedbackService));
    session = URI.parse("test://session/1");
    fileA = URI.parse("file:///a.ts");
    fileB = URI.parse("file:///b.ts");
    fileC = URI.parse("file:///c.ts");
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("single file - items sorted by line number", () => {
    service.addFeedback(session, fileA, r(20), "line 20");
    service.addFeedback(session, fileA, r(5), "line 5");
    service.addFeedback(session, fileA, r(10), "line 10");
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
      "/a.ts:5",
      "/a.ts:10",
      "/a.ts:20"
    ]);
  });
  test("multiple files - files ordered by recency, items within file sorted by line", () => {
    service.addFeedback(session, fileA, r(10), "A:10");
    service.addFeedback(session, fileA, r(5), "A:5");
    service.addFeedback(session, fileB, r(20), "B:20");
    service.addFeedback(session, fileB, r(3), "B:3");
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
      "/a.ts:5",
      "/a.ts:10",
      "/b.ts:3",
      "/b.ts:20"
    ]);
  });
  test("new file appended to end", () => {
    service.addFeedback(session, fileA, r(1), "A:1");
    service.addFeedback(session, fileB, r(1), "B:1");
    service.addFeedback(session, fileC, r(1), "C:1");
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
      "/a.ts:1",
      "/b.ts:1",
      "/c.ts:1"
    ]);
  });
  test("adding to existing file does not change file ordering", () => {
    service.addFeedback(session, fileA, r(10), "A:10");
    service.addFeedback(session, fileB, r(10), "B:10");
    service.addFeedback(session, fileA, r(5), "A:5");
    service.addFeedback(session, fileA, r(20), "A:20");
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
      "/a.ts:5",
      "/a.ts:10",
      "/a.ts:20",
      "/b.ts:10"
    ]);
  });
  test("interleaved adds across files maintain file recency and line sort", () => {
    service.addFeedback(session, fileA, r(30), "A:30");
    service.addFeedback(session, fileB, r(50), "B:50");
    service.addFeedback(session, fileA, r(10), "A:10");
    service.addFeedback(session, fileC, r(1), "C:1");
    service.addFeedback(session, fileB, r(5), "B:5");
    service.addFeedback(session, fileA, r(20), "A:20");
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
      "/a.ts:10",
      "/a.ts:20",
      "/a.ts:30",
      "/b.ts:5",
      "/b.ts:50",
      "/c.ts:1"
    ]);
  });
  test("navigation follows sorted order", () => {
    service.addFeedback(session, fileA, r(20), "A:20");
    service.addFeedback(session, fileB, r(10), "B:10");
    service.addFeedback(session, fileA, r(5), "A:5");
    const first = service.getNextFeedback(session, true);
    assert.strictEqual(first.resourceUri.path, "/a.ts");
    assert.strictEqual(first.range.startLineNumber, 5);
    const second = service.getNextFeedback(session, true);
    assert.strictEqual(second.resourceUri.path, "/a.ts");
    assert.strictEqual(second.range.startLineNumber, 20);
    const third = service.getNextFeedback(session, true);
    assert.strictEqual(third.resourceUri.path, "/b.ts");
    assert.strictEqual(third.range.startLineNumber, 10);
    const fourth = service.getNextFeedback(session, true);
    assert.strictEqual(fourth.resourceUri.path, "/a.ts");
    assert.strictEqual(fourth.range.startLineNumber, 5);
  });
  test("navigation bearings reflect sorted position", () => {
    service.addFeedback(session, fileA, r(20), "A:20");
    service.addFeedback(session, fileA, r(5), "A:5");
    service.addFeedback(session, fileB, r(1), "B:1");
    let bearing = service.getNavigationBearing(session);
    assert.strictEqual(bearing.activeIdx, -1);
    assert.strictEqual(bearing.totalCount, 3);
    service.getNextFeedback(session, true);
    bearing = service.getNavigationBearing(session);
    assert.strictEqual(bearing.activeIdx, 0);
    service.getNextFeedback(session, true);
    bearing = service.getNavigationBearing(session);
    assert.strictEqual(bearing.activeIdx, 1);
    service.getNextFeedback(session, true);
    bearing = service.getNavigationBearing(session);
    assert.strictEqual(bearing.activeIdx, 2);
  });
  test("revealFeedback anchors the matching session editor comment so its widget expands", async () => {
    const f1 = service.addFeedback(session, fileA, r(5), "A:5");
    const f2 = service.addFeedback(session, fileA, r(20), "A:20");
    const reveals = [];
    store.add(service.onDidRevealSessionComment((event) => reveals.push({
      session: event.sessionResource.toString(),
      commentId: event.commentId,
      resource: event.resourceUri.toString()
    })));
    await service.revealFeedback(session, f2.id);
    const comments = getSessionEditorComments(session, service.getFeedback(session));
    const bearing = service.getNavigationBearing(session, comments);
    assert.strictEqual(comments[bearing.activeIdx]?.sourceId, f2.id);
    await service.revealFeedback(session, f1.id);
    const bearingAfter = service.getNavigationBearing(session, comments);
    assert.strictEqual(comments[bearingAfter.activeIdx]?.sourceId, f1.id);
    assert.deepStrictEqual(reveals, [
      { session: session.toString(), commentId: comments[1].id, resource: fileA.toString() },
      { session: session.toString(), commentId: comments[0].id, resource: fileA.toString() }
    ]);
  });
  test("removing feedback preserves ordering", () => {
    const f1 = service.addFeedback(session, fileA, r(30), "A:30");
    service.addFeedback(session, fileA, r(10), "A:10");
    service.addFeedback(session, fileA, r(20), "A:20");
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
      "/a.ts:10",
      "/a.ts:20",
      "/a.ts:30"
    ]);
    service.removeFeedback(session, f1.id);
    assert.deepStrictEqual(feedbackSummary(service.getFeedback(session)), [
      "/a.ts:10",
      "/a.ts:20"
    ]);
  });
  test("same line number items are stable", () => {
    const f1 = service.addFeedback(session, fileA, r(10), "first");
    const f2 = service.addFeedback(session, fileA, r(10), "second");
    const items = service.getFeedback(session);
    assert.strictEqual(items[0].id, f1.id);
    assert.strictEqual(items[1].id, f2.id);
  });
  test("preserves optional feedback context fields", () => {
    const feedback = service.addFeedback(session, fileA, r(10), "with context", void 0, {
      codeSelection: "const value = 1;",
      diffHunks: "@@ -1,1 +1,1 @@\n-const value = 0;\n+const value = 1;"
    });
    assert.strictEqual(feedback.codeSelection, "const value = 1;");
    assert.strictEqual(feedback.diffHunks, "@@ -1,1 +1,1 @@\n-const value = 0;\n+const value = 1;");
  });
  test("addReply appends replies to the comment thread", () => {
    const feedback = service.addFeedback(session, fileA, r(10), "initial");
    service.addReply(session, feedback.id, "first reply");
    service.addReply(session, feedback.id, "second reply");
    const items = service.getFeedback(session);
    assert.deepStrictEqual({
      text: items[0].text,
      replies: items[0].replies
    }, {
      text: "initial",
      replies: ["first reply", "second reply"]
    });
  });
  test("addReply ignores unknown feedback ids", () => {
    service.addFeedback(session, fileA, r(10), "initial");
    service.addReply(session, "unknown", "should not crash");
    const items = service.getFeedback(session);
    assert.strictEqual(items[0].replies, void 0);
  });
});
suite("AgentFeedbackService - getSessionForFile", () => {
  const store = new DisposableStore();
  let service;
  let visibleEditorsEmitter;
  let visiblePanes;
  let activeSessionObs;
  let sessions;
  let sessionS1;
  let sessionS2;
  let fileA;
  let fileB;
  function pane(...resources) {
    const input = resources.length === 1 ? { resource: resources[0] } : { primary: { resource: resources[0] }, secondary: { resource: resources[1] } };
    return { input };
  }
  function makeSession(resource, status = SessionStatus.InProgress, options) {
    const workspace = options?.folders ? { folders: options.folders.map((root) => ({ root, workingDirectory: root })) } : void 0;
    const changes = (options?.changes ?? []).map((uri) => ({ modifiedUri: uri, originalUri: uri }));
    return {
      resource,
      status: observableValue("status", status),
      isCreated: observableValue("isCreated", status !== SessionStatus.Untitled),
      workspace: observableValue("workspace", workspace),
      changes: observableValue("changes", changes)
    };
  }
  function setActiveSession(s) {
    activeSessionObs.set(s, void 0);
  }
  function setVisibleEditors(panes) {
    visiblePanes.length = 0;
    visiblePanes.push(...panes);
    visibleEditorsEmitter.fire({});
  }
  setup(() => {
    visibleEditorsEmitter = store.add(new Emitter());
    visiblePanes = [];
    activeSessionObs = observableValue("activeSession", void 0);
    sessions = /* @__PURE__ */ new Map();
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IChatEditingService, new class extends mock() {
    }());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IEditorService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidVisibleEditorsChange = visibleEditorsEmitter.event;
      }
      get visibleEditorPanes() {
        return visiblePanes;
      }
    }());
    instantiationService.stub(ISessionsManagementService, new class extends mock() {
      getSession(resource) {
        return sessions.get(resource.toString());
      }
    }());
    instantiationService.stub(ISessionsService, { activeSession: activeSessionObs });
    service = store.add(instantiationService.createInstance(AgentFeedbackService));
    sessionS1 = URI.parse("test://session/1");
    sessionS2 = URI.parse("test://session/2");
    fileA = URI.parse("file:///a.ts");
    fileB = URI.parse("file:///b.ts");
    sessions.set(sessionS1.toString(), makeSession(sessionS1));
    sessions.set(sessionS2.toString(), makeSession(sessionS2));
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns undefined when there is no active session and no tracked file", () => {
    assert.strictEqual(service.getSessionForFile(fileA), void 0);
  });
  test("uses one shared feedback scope for undefined and workspace-less drafts", () => {
    const firstDraft = makeSession(sessionS1, SessionStatus.Untitled);
    const secondDraft = makeSession(sessionS2, SessionStatus.Untitled);
    const withoutSession = service.getFeedbackSessionResource(fileA);
    setActiveSession(firstDraft);
    const withFirstDraft = service.getFeedbackSessionResource(fileA);
    setActiveSession(secondDraft);
    const withSecondDraft = service.getFeedbackSessionResource(fileA);
    assert.deepStrictEqual(
      [withoutSession, withFirstDraft, withSecondDraft].map((resource) => resource?.toString()),
      Array(3).fill(AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString())
    );
  });
  test("scopes a draft that already picked a workspace to that workspace", () => {
    setActiveSession(makeSession(sessionS1, SessionStatus.Untitled, { folders: [URI.file("/workspace")] }));
    assert.deepStrictEqual({
      inWorkspace: service.getFeedbackSessionResource(URI.file("/workspace/a.ts"))?.toString(),
      outsideWorkspace: service.getFeedbackSessionResource(URI.file("/elsewhere/a.ts"))?.toString()
    }, {
      inWorkspace: AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString(),
      outsideWorkspace: void 0
    });
  });
  test("discards the shared new-session comments when the draft workspace changes", () => {
    const draftInF = makeSession(sessionS1, SessionStatus.Untitled, { folders: [URI.file("/f")] });
    const draftInG = makeSession(sessionS2, SessionStatus.Untitled, { folders: [URI.file("/g")] });
    setActiveSession(draftInF);
    service.addFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, URI.file("/f/a.ts"), new Range(1, 1, 1, 2), "Fix this");
    setActiveSession(sessions.get(sessionS2.toString()));
    setActiveSession(draftInF);
    const afterCreatedSessionRoundTrip = service.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).length;
    setActiveSession(draftInG);
    assert.deepStrictEqual({
      afterCreatedSessionRoundTrip,
      afterWorkspaceChange: service.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).length
    }, {
      afterCreatedSessionRoundTrip: 1,
      afterWorkspaceChange: 0
    });
  });
  test("lets a workspace-less draft adopt its first selection after the comments were cleared", () => {
    const draftInF = makeSession(sessionS1, SessionStatus.Untitled, { folders: [URI.file("/f")] });
    const workspacelessDraft = makeSession(sessionS2, SessionStatus.Untitled);
    const draftInG = makeSession(sessionS2, SessionStatus.Untitled, { folders: [URI.file("/g")] });
    setActiveSession(draftInF);
    const first = service.addFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, URI.file("/f/a.ts"), new Range(1, 1, 1, 2), "Fix this");
    service.removeFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, first.id);
    setActiveSession(workspacelessDraft);
    service.addFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, URI.file("/g/b.ts"), new Range(1, 1, 1, 2), "Rename this");
    setActiveSession(draftInG);
    assert.strictEqual(service.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).length, 1);
  });
  test("uses the created session feedback scope after leaving the new-session view", () => {
    setActiveSession(makeSession(sessionS1, SessionStatus.Untitled));
    const draftScope = service.getFeedbackSessionResource(fileA);
    setActiveSession(sessions.get(sessionS2.toString()));
    const createdScope = service.getFeedbackSessionResource(fileA);
    assert.deepStrictEqual({
      draftScope: draftScope?.toString(),
      createdScope: createdScope?.toString()
    }, {
      draftScope: AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString(),
      createdScope: sessionS2.toString()
    });
  });
  test("explicit resource scope uses its supplied session and announces scope changes", () => {
    setActiveSession(sessions.get(sessionS1.toString()));
    let scopeChanges = 0;
    store.add(service.onDidChangeFeedbackScope(() => scopeChanges++));
    const registration = service.registerFeedbackResourceScope(fileA, sessionS2);
    const registeredScope = service.getFeedbackSessionResource(fileA);
    registration.dispose();
    assert.deepStrictEqual({
      registeredScope: registeredScope?.toString(),
      scopeAfterDispose: service.getFeedbackSessionResource(fileA)?.toString(),
      scopeChanges
    }, {
      registeredScope: sessionS2.toString(),
      scopeAfterDispose: sessionS1.toString(),
      scopeChanges: 2
    });
  });
  test("untracked file falls back to the active session", () => {
    setActiveSession(sessions.get(sessionS1.toString()));
    assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
  });
  test("captures active session when file becomes visible", () => {
    setActiveSession(sessions.get(sessionS1.toString()));
    setVisibleEditors([pane(fileA)]);
    assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
  });
  test("preserves captured session after active session switches without a visibility change", () => {
    setActiveSession(sessions.get(sessionS1.toString()));
    setVisibleEditors([pane(fileA)]);
    setActiveSession(sessions.get(sessionS2.toString()));
    assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
    assert.strictEqual(service.getSessionForFile(fileB)?.resource.toString(), sessionS2.toString());
  });
  test("most recent visibility wins when the same file is seen under a different session", () => {
    setActiveSession(sessions.get(sessionS1.toString()));
    setVisibleEditors([pane(fileA)]);
    setActiveSession(sessions.get(sessionS2.toString()));
    setVisibleEditors([pane(fileA)]);
    assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS2.toString());
  });
  test("distinct files captured under different active sessions retain their own mapping", () => {
    setActiveSession(sessions.get(sessionS1.toString()));
    setVisibleEditors([pane(fileA)]);
    setActiveSession(sessions.get(sessionS2.toString()));
    setVisibleEditors([pane(fileB)]);
    assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
    assert.strictEqual(service.getSessionForFile(fileB)?.resource.toString(), sessionS2.toString());
  });
  test("multi-resource editor pane tracks every resource under the active session", () => {
    setActiveSession(sessions.get(sessionS1.toString()));
    setVisibleEditors([pane(fileA, fileB)]);
    assert.strictEqual(service.getSessionForFile(fileA)?.resource.toString(), sessionS1.toString());
    assert.strictEqual(service.getSessionForFile(fileB)?.resource.toString(), sessionS1.toString());
  });
  test("returns undefined when the active session has Untitled status", () => {
    sessions.set(sessionS1.toString(), makeSession(sessionS1, SessionStatus.Untitled));
    setActiveSession(sessions.get(sessionS1.toString()));
    assert.strictEqual(service.getSessionForFile(fileA), void 0);
  });
  test("returns undefined when the mapped session is unknown to the management service", () => {
    setActiveSession(sessions.get(sessionS1.toString()));
    setVisibleEditors([pane(fileA)]);
    sessions.delete(sessionS1.toString());
    setActiveSession(void 0);
    assert.strictEqual(service.getSessionForFile(fileA), void 0);
  });
  test("does not return a session for files outside the session workspace folders", () => {
    const wsSession = makeSession(sessionS1, SessionStatus.InProgress, { folders: [URI.file("/workspace")] });
    sessions.set(sessionS1.toString(), wsSession);
    setActiveSession(wsSession);
    assert.strictEqual(service.getSessionForFile(URI.file("/home/user/settings.json")), void 0);
    assert.strictEqual(service.getSessionForFile(URI.file("/workspace/a.ts"))?.resource.toString(), sessionS1.toString());
  });
  test("returns a session for files that are part of its changes even outside the workspace", () => {
    const changed = URI.file("/outside/changed.ts");
    const wsSession = makeSession(sessionS1, SessionStatus.InProgress, { folders: [URI.file("/workspace")], changes: [changed] });
    sessions.set(sessionS1.toString(), wsSession);
    setActiveSession(wsSession);
    assert.strictEqual(service.getSessionForFile(changed)?.resource.toString(), sessionS1.toString());
  });
  test("does not return a session for output view resources", () => {
    const wsSession = makeSession(sessionS1, SessionStatus.InProgress, { folders: [URI.file("/workspace")] });
    sessions.set(sessionS1.toString(), wsSession);
    setActiveSession(wsSession);
    assert.strictEqual(service.getSessionForFile(URI.from({ scheme: "output", path: "/workspace/foo" })), void 0);
  });
});
suite("AgentFeedbackService - State", () => {
  const store = new DisposableStore();
  let service;
  let session;
  let fileA;
  let sessionProviderId;
  setup(() => {
    sessionProviderId = void 0;
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IChatEditingService, new class extends mock() {
    }());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IEditorService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidVisibleEditorsChange = Event.None;
        this.visibleEditorPanes = [];
      }
    }());
    instantiationService.stub(ISessionsProvidersService, new class extends mock() {
      getProvider(_providerId) {
        return void 0;
      }
    }());
    instantiationService.stub(ISessionsManagementService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidDeleteSession = Event.None;
      }
      getSession(_resource) {
        return sessionProviderId ? { providerId: sessionProviderId, sessionId: "session-1" } : void 0;
      }
    }());
    instantiationService.stub(ISessionsService, { activeSession: observableValue("activeSession", void 0) });
    service = store.add(instantiationService.createInstance(AgentFeedbackService));
    session = URI.parse("test://session/1");
    fileA = URI.parse("file:///a.ts");
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("feedback defaults to the accepted state", () => {
    const feedback = service.addFeedback(session, fileA, r(10), "hello");
    assert.strictEqual(feedback.state, AgentFeedbackState.Accepted);
  });
  test("created feedback transitions to accepted on acceptFeedback", () => {
    const created = service.addFeedback(session, fileA, r(10), "pending", void 0, void 0, void 0, AgentFeedbackKind.AgentReview, AgentFeedbackState.Created);
    assert.strictEqual(created.state, AgentFeedbackState.Created);
    service.acceptFeedback(session, created.id);
    assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Accepted);
  });
  test("markFeedbackSubmitted resolves accepted items directly for non-agent-host sessions", () => {
    const accepted = service.addFeedback(session, fileA, r(10), "accepted");
    const created = service.addFeedback(session, fileA, r(20), "created", void 0, void 0, void 0, AgentFeedbackKind.AgentReview, AgentFeedbackState.Created);
    service.markFeedbackSubmitted(session);
    const stateById = new Map(service.getFeedback(session).map((item) => [item.id, item.state]));
    assert.deepStrictEqual({
      accepted: stateById.get(accepted.id),
      created: stateById.get(created.id)
    }, {
      accepted: AgentFeedbackState.Resolved,
      created: AgentFeedbackState.Created
    });
  });
  test("markFeedbackSubmitted keeps accepted items submitted for agent-host sessions", () => {
    sessionProviderId = LOCAL_AGENT_HOST_PROVIDER_ID;
    service.addFeedback(session, fileA, r(10), "accepted");
    service.markFeedbackSubmitted(session);
    assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Submitted);
  });
  test("resolving and un-resolving moves between resolved and submitted", () => {
    const feedback = service.addFeedback(session, fileA, r(10), "feedback");
    service.markFeedbackSubmitted(session);
    assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Resolved);
    service.setFeedbackResolved(session, feedback.id, false);
    assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Submitted);
    service.setFeedbackResolved(session, feedback.id, true);
    assert.strictEqual(service.getFeedback(session)[0].state, AgentFeedbackState.Resolved);
  });
});
suite("AgentFeedbackService - Submit (agent host)", () => {
  const store = new DisposableStore();
  let service;
  let session;
  let fileA;
  let widgetOps;
  let addedEntries;
  let acceptInputSent;
  let acceptsRequest;
  let sessionLoaded;
  let loadSession;
  setup(() => {
    widgetOps = [];
    addedEntries = [];
    acceptInputSent = new DeferredPromise();
    acceptsRequest = true;
    sessionLoaded = true;
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IChatEditingService, new class extends mock() {
    }());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IEditorService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidVisibleEditorsChange = Event.None;
        this.visibleEditorPanes = [];
      }
    }());
    instantiationService.stub(ISessionsProvidersService, new class extends mock() {
      getProvider(_providerId) {
        return void 0;
      }
    }());
    instantiationService.stub(ISessionsManagementService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidDeleteSession = Event.None;
      }
      getSession(_resource) {
        return { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionId: "session-1" };
      }
    }());
    instantiationService.stub(ISessionsService, { activeSession: observableValue("activeSession", void 0) });
    const onDidChangeViewModel = store.add(new Emitter());
    const widget = {
      onDidChangeViewModel: onDidChangeViewModel.event,
      attachmentModel: {
        attachments: [],
        delete: (id) => widgetOps.push(`delete:${id}`),
        addContext: (...entries) => {
          addedEntries.push(...entries);
          widgetOps.push(`add:${entries[0]?.id}`);
        }
      },
      acceptInput: async (query, options) => {
        widgetOps.push(`accept:${query}`);
        if (acceptsRequest) {
          options?.onRequestAccepted?.();
        }
        await acceptInputSent.p;
        widgetOps.push(`sent:${query}`);
        return void 0;
      }
    };
    loadSession = () => {
      sessionLoaded = true;
      onDidChangeViewModel.fire({ previousSessionResource: void 0, currentSessionResource: session });
    };
    instantiationService.stub(IChatWidgetService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidAddWidget = Event.None;
      }
      getAllWidgets() {
        return [widget];
      }
      getWidgetBySessionResource(_resource) {
        return sessionLoaded ? widget : void 0;
      }
    }());
    service = store.add(instantiationService.createInstance(AgentFeedbackService));
    session = URI.parse("test://session/1");
    fileA = URI.parse("file:///a.ts");
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("attaches the just-submitted feedback to the request and clears the attachment afterwards", async () => {
    service.addFeedback(session, fileA, r(10), "Please simplify");
    await service.submitFeedback(session);
    const attachmentId = `agentFeedback:${session.toString()}`;
    assert.deepStrictEqual(widgetOps, [
      `delete:${attachmentId}`,
      `add:${attachmentId}`,
      "accept:/act-on-feedback",
      `delete:${attachmentId}`
    ]);
    assert.deepStrictEqual({
      count: addedEntries.length,
      kind: addedEntries[0]?.kind,
      texts: addedEntries[0]?.feedbackItems.map((item) => item.text),
      state: service.getFeedback(session)[0].state
    }, {
      count: 1,
      kind: "agentFeedback",
      texts: ["Please simplify"],
      state: AgentFeedbackState.Submitted
    });
  });
  test("marks feedback as submitted once the request is queued behind an in-progress request", async () => {
    service.addFeedback(session, fileA, r(10), "Please simplify");
    const submitted = await service.submitFeedback(session);
    assert.deepStrictEqual({
      submitted,
      state: service.getFeedback(session)[0].state,
      sent: widgetOps.includes("sent:/act-on-feedback")
    }, {
      submitted: true,
      state: AgentFeedbackState.Submitted,
      sent: false
    });
  });
  test("keeps feedback accepted when the request is not accepted by the widget", async () => {
    acceptsRequest = false;
    acceptInputSent.complete();
    service.addFeedback(session, fileA, r(10), "Please simplify");
    const submitted = await service.submitFeedback(session);
    assert.deepStrictEqual({
      submitted,
      state: service.getFeedback(session)[0].state
    }, {
      submitted: false,
      state: AgentFeedbackState.Accepted
    });
  });
  test("waits for the session model to load into the widget before submitting", async () => {
    sessionLoaded = false;
    service.addFeedback(session, fileA, r(10), "Please simplify");
    const pending = service.submitFeedback(session);
    await timeout(0);
    const submittedBeforeLoad = widgetOps.length > 0;
    loadSession();
    assert.deepStrictEqual({
      submittedBeforeLoad,
      submitted: await pending,
      state: service.getFeedback(session)[0].state,
      accepted: widgetOps.includes("accept:/act-on-feedback")
    }, {
      submittedBeforeLoad: false,
      submitted: true,
      state: AgentFeedbackState.Submitted,
      accepted: true
    });
  });
});
suite("AgentFeedbackService - whenWidgetForSession", () => {
  const store = new DisposableStore();
  const session = URI.parse("test://session/1");
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function createWidgetHost() {
    const onDidChangeViewModel = store.add(new Emitter());
    const widget = { onDidChangeViewModel: onDidChangeViewModel.event };
    let loaded = false;
    const service = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidAddWidget = Event.None;
      }
      getAllWidgets() {
        return [widget];
      }
      getWidgetBySessionResource(_resource) {
        return loaded ? widget : void 0;
      }
    }();
    return {
      widget,
      service,
      load: () => {
        loaded = true;
        onDidChangeViewModel.fire({ previousSessionResource: void 0, currentSessionResource: session });
      }
    };
  }
  test("resolves immediately when the session is already loaded", async () => {
    const host = createWidgetHost();
    host.load();
    assert.strictEqual(await whenWidgetForSession(host.service, session, 0), host.widget);
  });
  test("resolves once a widget loads the session", async () => {
    const host = createWidgetHost();
    const pending = whenWidgetForSession(host.service, session, 5e3);
    await timeout(0);
    host.load();
    assert.strictEqual(await pending, host.widget);
  });
  test("resolves undefined when no widget loads the session in time", async () => {
    const host = createWidgetHost();
    assert.strictEqual(await whenWidgetForSession(host.service, session, 1), void 0);
  });
  test("resolves when a widget that already has the session is added later", async () => {
    const onDidAddWidget = store.add(new Emitter());
    const widget = { onDidChangeViewModel: Event.None };
    let widgets = [];
    const service = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidAddWidget = onDidAddWidget.event;
      }
      getAllWidgets() {
        return widgets;
      }
      getWidgetBySessionResource(_resource) {
        return widgets[0];
      }
    }();
    const pending = whenWidgetForSession(service, session, 5e3);
    await timeout(0);
    widgets = [widget];
    onDidAddWidget.fire(widget);
    assert.strictEqual(await pending, widget);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcdGVzdFxcYnJvd3NlclxcYWdlbnRGZWVkYmFja1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFLCBBZ2VudEZlZWRiYWNrS2luZCwgQWdlbnRGZWVkYmFja1NlcnZpY2UsIEFnZW50RmVlZGJhY2tTdGF0ZSwgSUFnZW50RmVlZGJhY2tTZXJ2aWNlLCB3aGVuV2lkZ2V0Rm9yU2Vzc2lvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0U2Vzc2lvbkVkaXRvckNvbW1lbnRzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uRWRpdG9yQ29tbWVudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UsIElDaGF0QWNjZXB0SW5wdXRPcHRpb25zLCBJQ2hhdFdpZGdldFZpZXdNb2RlbENoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIElWaXNpYmxlRWRpdG9yc0NoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5cbmZ1bmN0aW9uIHIoc3RhcnRMaW5lOiBudW1iZXIsIGVuZExpbmU6IG51bWJlciA9IHN0YXJ0TGluZSk6IFJhbmdlIHtcblx0cmV0dXJuIG5ldyBSYW5nZShzdGFydExpbmUsIDEsIGVuZExpbmUsIDEpO1xufVxuXG5mdW5jdGlvbiBmZWVkYmFja1N1bW1hcnkoaXRlbXM6IHJlYWRvbmx5IHsgcmVzb3VyY2VVcmk6IFVSSTsgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIgfSB9W10pOiBzdHJpbmdbXSB7XG5cdHJldHVybiBpdGVtcy5tYXAoZiA9PiBgJHtmLnJlc291cmNlVXJpLnBhdGh9OiR7Zi5yYW5nZS5zdGFydExpbmVOdW1iZXJ9YCk7XG59XG5cbnN1aXRlKCdBZ2VudEZlZWRiYWNrU2VydmljZSAtIE9yZGVyaW5nJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgc2VydmljZTogSUFnZW50RmVlZGJhY2tTZXJ2aWNlO1xuXHRsZXQgc2Vzc2lvbjogVVJJO1xuXHRsZXQgZmlsZUE6IFVSSTtcblx0bGV0IGZpbGVCOiBVUkk7XG5cdGxldCBmaWxlQzogVVJJO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0RWRpdGluZ1NlcnZpY2U+KCkgeyB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHZpc2libGVFZGl0b3JQYW5lcyA9IFtdO1xuXHRcdFx0b3ZlcnJpZGUgb3BlbkVkaXRvciguLi5fYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uKF9yZXNvdXJjZTogVVJJKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIHsgYWN0aXZlU2Vzc2lvbjogb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCkgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0c2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEZlZWRiYWNrU2VydmljZSkpO1xuXHRcdHNlc3Npb24gPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLzEnKTtcblx0XHRmaWxlQSA9IFVSSS5wYXJzZSgnZmlsZTovLy9hLnRzJyk7XG5cdFx0ZmlsZUIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vYi50cycpO1xuXHRcdGZpbGVDID0gVVJJLnBhcnNlKCdmaWxlOi8vL2MudHMnKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3NpbmdsZSBmaWxlIC0gaXRlbXMgc29ydGVkIGJ5IGxpbmUgbnVtYmVyJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoMjApLCAnbGluZSAyMCcpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoNSksICdsaW5lIDUnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEwKSwgJ2xpbmUgMTAnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmVlZGJhY2tTdW1tYXJ5KHNlcnZpY2UuZ2V0RmVlZGJhY2soc2Vzc2lvbikpLCBbXG5cdFx0XHQnL2EudHM6NScsXG5cdFx0XHQnL2EudHM6MTAnLFxuXHRcdFx0Jy9hLnRzOjIwJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgZmlsZXMgLSBmaWxlcyBvcmRlcmVkIGJ5IHJlY2VuY3ksIGl0ZW1zIHdpdGhpbiBmaWxlIHNvcnRlZCBieSBsaW5lJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoMTApLCAnQToxMCcpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoNSksICdBOjUnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVCLCByKDIwKSwgJ0I6MjAnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVCLCByKDMpLCAnQjozJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZlZWRiYWNrU3VtbWFyeShzZXJ2aWNlLmdldEZlZWRiYWNrKHNlc3Npb24pKSwgW1xuXHRcdFx0Jy9hLnRzOjUnLFxuXHRcdFx0Jy9hLnRzOjEwJyxcblx0XHRcdCcvYi50czozJyxcblx0XHRcdCcvYi50czoyMCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBmaWxlIGFwcGVuZGVkIHRvIGVuZCcsICgpID0+IHtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEpLCAnQToxJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQiwgcigxKSwgJ0I6MScpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUMsIHIoMSksICdDOjEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmVlZGJhY2tTdW1tYXJ5KHNlcnZpY2UuZ2V0RmVlZGJhY2soc2Vzc2lvbikpLCBbXG5cdFx0XHQnL2EudHM6MScsXG5cdFx0XHQnL2IudHM6MScsXG5cdFx0XHQnL2MudHM6MScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZGluZyB0byBleGlzdGluZyBmaWxlIGRvZXMgbm90IGNoYW5nZSBmaWxlIG9yZGVyaW5nJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoMTApLCAnQToxMCcpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUIsIHIoMTApLCAnQjoxMCcpO1xuXHRcdC8vIEFkZCBtb3JlIGZlZWRiYWNrIHRvIGZpbGVBIFx1MjAxNCBzaG91bGQgc3RheSBiZWZvcmUgZmlsZUJcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDUpLCAnQTo1Jyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigyMCksICdBOjIwJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZlZWRiYWNrU3VtbWFyeShzZXJ2aWNlLmdldEZlZWRiYWNrKHNlc3Npb24pKSwgW1xuXHRcdFx0Jy9hLnRzOjUnLFxuXHRcdFx0Jy9hLnRzOjEwJyxcblx0XHRcdCcvYS50czoyMCcsXG5cdFx0XHQnL2IudHM6MTAnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnRlcmxlYXZlZCBhZGRzIGFjcm9zcyBmaWxlcyBtYWludGFpbiBmaWxlIHJlY2VuY3kgYW5kIGxpbmUgc29ydCcsICgpID0+IHtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDMwKSwgJ0E6MzAnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVCLCByKDUwKSwgJ0I6NTAnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEwKSwgJ0E6MTAnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVDLCByKDEpLCAnQzoxJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQiwgcig1KSwgJ0I6NScpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoMjApLCAnQToyMCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmZWVkYmFja1N1bW1hcnkoc2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uKSksIFtcblx0XHRcdCcvYS50czoxMCcsXG5cdFx0XHQnL2EudHM6MjAnLFxuXHRcdFx0Jy9hLnRzOjMwJyxcblx0XHRcdCcvYi50czo1Jyxcblx0XHRcdCcvYi50czo1MCcsXG5cdFx0XHQnL2MudHM6MScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25hdmlnYXRpb24gZm9sbG93cyBzb3J0ZWQgb3JkZXInLCAoKSA9PiB7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigyMCksICdBOjIwJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQiwgcigxMCksICdCOjEwJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcig1KSwgJ0E6NScpO1xuXG5cdFx0Ly8gRXhwZWN0ZWQgb3JkZXI6IEE6NSwgQToyMCwgQjoxMFxuXHRcdGNvbnN0IGZpcnN0ID0gc2VydmljZS5nZXROZXh0RmVlZGJhY2soc2Vzc2lvbiwgdHJ1ZSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yZXNvdXJjZVVyaS5wYXRoLCAnL2EudHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCA1KTtcblxuXHRcdGNvbnN0IHNlY29uZCA9IHNlcnZpY2UuZ2V0TmV4dEZlZWRiYWNrKHNlc3Npb24sIHRydWUpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnJlc291cmNlVXJpLnBhdGgsICcvYS50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAyMCk7XG5cblx0XHRjb25zdCB0aGlyZCA9IHNlcnZpY2UuZ2V0TmV4dEZlZWRiYWNrKHNlc3Npb24sIHRydWUpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcmQucmVzb3VyY2VVcmkucGF0aCwgJy9iLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXJkLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMTApO1xuXG5cdFx0Ly8gV3JhcHMgYXJvdW5kXG5cdFx0Y29uc3QgZm91cnRoID0gc2VydmljZS5nZXROZXh0RmVlZGJhY2soc2Vzc2lvbiwgdHJ1ZSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VydGgucmVzb3VyY2VVcmkucGF0aCwgJy9hLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdXJ0aC5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCduYXZpZ2F0aW9uIGJlYXJpbmdzIHJlZmxlY3Qgc29ydGVkIHBvc2l0aW9uJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoMjApLCAnQToyMCcpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoNSksICdBOjUnKTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVCLCByKDEpLCAnQjoxJyk7XG5cblx0XHQvLyBCZWZvcmUgbmF2aWdhdGlvbiwgbm8gYW5jaG9yXG5cdFx0bGV0IGJlYXJpbmcgPSBzZXJ2aWNlLmdldE5hdmlnYXRpb25CZWFyaW5nKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWFyaW5nLmFjdGl2ZUlkeCwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWFyaW5nLnRvdGFsQ291bnQsIDMpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gZmlyc3QgKEE6NSlcblx0XHRzZXJ2aWNlLmdldE5leHRGZWVkYmFjayhzZXNzaW9uLCB0cnVlKTtcblx0XHRiZWFyaW5nID0gc2VydmljZS5nZXROYXZpZ2F0aW9uQmVhcmluZyhzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmVhcmluZy5hY3RpdmVJZHgsIDApO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gc2Vjb25kIChBOjIwKVxuXHRcdHNlcnZpY2UuZ2V0TmV4dEZlZWRiYWNrKHNlc3Npb24sIHRydWUpO1xuXHRcdGJlYXJpbmcgPSBzZXJ2aWNlLmdldE5hdmlnYXRpb25CZWFyaW5nKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWFyaW5nLmFjdGl2ZUlkeCwgMSk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byB0aGlyZCAoQjoxKVxuXHRcdHNlcnZpY2UuZ2V0TmV4dEZlZWRiYWNrKHNlc3Npb24sIHRydWUpO1xuXHRcdGJlYXJpbmcgPSBzZXJ2aWNlLmdldE5hdmlnYXRpb25CZWFyaW5nKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWFyaW5nLmFjdGl2ZUlkeCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbEZlZWRiYWNrIGFuY2hvcnMgdGhlIG1hdGNoaW5nIHNlc3Npb24gZWRpdG9yIGNvbW1lbnQgc28gaXRzIHdpZGdldCBleHBhbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGYxID0gc2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcig1KSwgJ0E6NScpO1xuXHRcdGNvbnN0IGYyID0gc2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigyMCksICdBOjIwJyk7XG5cdFx0Y29uc3QgcmV2ZWFsczogeyBzZXNzaW9uOiBzdHJpbmc7IGNvbW1lbnRJZDogc3RyaW5nOyByZXNvdXJjZTogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uRGlkUmV2ZWFsU2Vzc2lvbkNvbW1lbnQoZXZlbnQgPT4gcmV2ZWFscy5wdXNoKHtcblx0XHRcdHNlc3Npb246IGV2ZW50LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0Y29tbWVudElkOiBldmVudC5jb21tZW50SWQsXG5cdFx0XHRyZXNvdXJjZTogZXZlbnQucmVzb3VyY2VVcmkudG9TdHJpbmcoKSxcblx0XHR9KSkpO1xuXG5cdFx0Ly8gVGhlIGVkaXRvciB3aWRnZXQgY29udHJpYnV0aW9uIGV4cGFuZHMgdGhlIHdpZGdldCB3aG9zZSBzZXNzaW9uXG5cdFx0Ly8gZWRpdG9yIGNvbW1lbnQgbWF0Y2hlcyB0aGUgbmF2aWdhdGlvbiBhbmNob3IuIHJldmVhbEZlZWRiYWNrIG11c3Qgc2V0XG5cdFx0Ly8gdGhlIGFuY2hvciB1c2luZyB0aGUgcHJlZml4ZWQgc2Vzc2lvbi1lZGl0b3ItY29tbWVudCBpZCAobm90IHRoZSByYXdcblx0XHQvLyBmZWVkYmFjayBpZCkgZm9yIHRoYXQgbWF0Y2ggdG8gc3VjY2VlZC5cblx0XHRhd2FpdCBzZXJ2aWNlLnJldmVhbEZlZWRiYWNrKHNlc3Npb24sIGYyLmlkKTtcblxuXHRcdGNvbnN0IGNvbW1lbnRzID0gZ2V0U2Vzc2lvbkVkaXRvckNvbW1lbnRzKHNlc3Npb24sIHNlcnZpY2UuZ2V0RmVlZGJhY2soc2Vzc2lvbikpO1xuXHRcdGNvbnN0IGJlYXJpbmcgPSBzZXJ2aWNlLmdldE5hdmlnYXRpb25CZWFyaW5nKHNlc3Npb24sIGNvbW1lbnRzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tbWVudHNbYmVhcmluZy5hY3RpdmVJZHhdPy5zb3VyY2VJZCwgZjIuaWQpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZXZlYWxGZWVkYmFjayhzZXNzaW9uLCBmMS5pZCk7XG5cdFx0Y29uc3QgYmVhcmluZ0FmdGVyID0gc2VydmljZS5nZXROYXZpZ2F0aW9uQmVhcmluZyhzZXNzaW9uLCBjb21tZW50cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbW1lbnRzW2JlYXJpbmdBZnRlci5hY3RpdmVJZHhdPy5zb3VyY2VJZCwgZjEuaWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV2ZWFscywgW1xuXHRcdFx0eyBzZXNzaW9uOiBzZXNzaW9uLnRvU3RyaW5nKCksIGNvbW1lbnRJZDogY29tbWVudHNbMV0uaWQsIHJlc291cmNlOiBmaWxlQS50b1N0cmluZygpIH0sXG5cdFx0XHR7IHNlc3Npb246IHNlc3Npb24udG9TdHJpbmcoKSwgY29tbWVudElkOiBjb21tZW50c1swXS5pZCwgcmVzb3VyY2U6IGZpbGVBLnRvU3RyaW5nKCkgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgZmVlZGJhY2sgcHJlc2VydmVzIG9yZGVyaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGYxID0gc2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigzMCksICdBOjMwJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigxMCksICdBOjEwJyk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigyMCksICdBOjIwJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZlZWRiYWNrU3VtbWFyeShzZXJ2aWNlLmdldEZlZWRiYWNrKHNlc3Npb24pKSwgW1xuXHRcdFx0Jy9hLnRzOjEwJyxcblx0XHRcdCcvYS50czoyMCcsXG5cdFx0XHQnL2EudHM6MzAnLFxuXHRcdF0pO1xuXG5cdFx0c2VydmljZS5yZW1vdmVGZWVkYmFjayhzZXNzaW9uLCBmMS5pZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmZWVkYmFja1N1bW1hcnkoc2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uKSksIFtcblx0XHRcdCcvYS50czoxMCcsXG5cdFx0XHQnL2EudHM6MjAnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzYW1lIGxpbmUgbnVtYmVyIGl0ZW1zIGFyZSBzdGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZjEgPSBzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEwKSwgJ2ZpcnN0Jyk7XG5cdFx0Y29uc3QgZjIgPSBzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEwKSwgJ3NlY29uZCcpO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBzZXJ2aWNlLmdldEZlZWRiYWNrKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS5pZCwgZjEuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1sxXS5pZCwgZjIuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgb3B0aW9uYWwgZmVlZGJhY2sgY29udGV4dCBmaWVsZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmVlZGJhY2sgPSBzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEwKSwgJ3dpdGggY29udGV4dCcsIHVuZGVmaW5lZCwge1xuXHRcdFx0Y29kZVNlbGVjdGlvbjogJ2NvbnN0IHZhbHVlID0gMTsnLFxuXHRcdFx0ZGlmZkh1bmtzOiAnQEAgLTEsMSArMSwxIEBAXFxuLWNvbnN0IHZhbHVlID0gMDtcXG4rY29uc3QgdmFsdWUgPSAxOycsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmVlZGJhY2suY29kZVNlbGVjdGlvbiwgJ2NvbnN0IHZhbHVlID0gMTsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmVlZGJhY2suZGlmZkh1bmtzLCAnQEAgLTEsMSArMSwxIEBAXFxuLWNvbnN0IHZhbHVlID0gMDtcXG4rY29uc3QgdmFsdWUgPSAxOycpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRSZXBseSBhcHBlbmRzIHJlcGxpZXMgdG8gdGhlIGNvbW1lbnQgdGhyZWFkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZlZWRiYWNrID0gc2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigxMCksICdpbml0aWFsJyk7XG5cdFx0c2VydmljZS5hZGRSZXBseShzZXNzaW9uLCBmZWVkYmFjay5pZCwgJ2ZpcnN0IHJlcGx5Jyk7XG5cdFx0c2VydmljZS5hZGRSZXBseShzZXNzaW9uLCBmZWVkYmFjay5pZCwgJ3NlY29uZCByZXBseScpO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBzZXJ2aWNlLmdldEZlZWRiYWNrKHNlc3Npb24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGV4dDogaXRlbXNbMF0udGV4dCxcblx0XHRcdHJlcGxpZXM6IGl0ZW1zWzBdLnJlcGxpZXMsXG5cdFx0fSwge1xuXHRcdFx0dGV4dDogJ2luaXRpYWwnLFxuXHRcdFx0cmVwbGllczogWydmaXJzdCByZXBseScsICdzZWNvbmQgcmVwbHknXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWRkUmVwbHkgaWdub3JlcyB1bmtub3duIGZlZWRiYWNrIGlkcycsICgpID0+IHtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEwKSwgJ2luaXRpYWwnKTtcblx0XHRzZXJ2aWNlLmFkZFJlcGx5KHNlc3Npb24sICd1bmtub3duJywgJ3Nob3VsZCBub3QgY3Jhc2gnKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gc2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMF0ucmVwbGllcywgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50RmVlZGJhY2tTZXJ2aWNlIC0gZ2V0U2Vzc2lvbkZvckZpbGUnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0bGV0IHNlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZTtcblx0bGV0IHZpc2libGVFZGl0b3JzRW1pdHRlcjogRW1pdHRlcjxJVmlzaWJsZUVkaXRvcnNDaGFuZ2VFdmVudD47XG5cdGxldCB2aXNpYmxlUGFuZXM6IGFueVtdO1xuXHRsZXQgYWN0aXZlU2Vzc2lvbk9iczogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cdGxldCBzZXNzaW9uczogTWFwPHN0cmluZywgSVNlc3Npb24+O1xuXG5cdGxldCBzZXNzaW9uUzE6IFVSSTtcblx0bGV0IHNlc3Npb25TMjogVVJJO1xuXHRsZXQgZmlsZUE6IFVSSTtcblx0bGV0IGZpbGVCOiBVUkk7XG5cblx0ZnVuY3Rpb24gcGFuZSguLi5yZXNvdXJjZXM6IFVSSVtdKTogYW55IHtcblx0XHQvLyBTaW5nbGUgcmVzb3VyY2U6IGEgcGxhaW4gZWRpdG9yIGlucHV0IHdpdGggYC5yZXNvdXJjZWAuXG5cdFx0Ly8gVHdvIHJlc291cmNlczogYSByZXNvdXJjZS1zaWRlLWJ5LXNpZGUgc2hhcGVkIGlucHV0IHNvIHRoYXRcblx0XHQvLyBgRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaSguLi4sIHN1cHBvcnRTaWRlQnlTaWRlOiBCT1RIKWBcblx0XHQvLyBzdXJmYWNlcyBib3RoIFVSSXMuXG5cdFx0Y29uc3QgaW5wdXQgPSByZXNvdXJjZXMubGVuZ3RoID09PSAxXG5cdFx0XHQ/IHsgcmVzb3VyY2U6IHJlc291cmNlc1swXSB9XG5cdFx0XHQ6IHsgcHJpbWFyeTogeyByZXNvdXJjZTogcmVzb3VyY2VzWzBdIH0sIHNlY29uZGFyeTogeyByZXNvdXJjZTogcmVzb3VyY2VzWzFdIH0gfTtcblx0XHRyZXR1cm4geyBpbnB1dCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZVNlc3Npb24ocmVzb3VyY2U6IFVSSSwgc3RhdHVzOiBTZXNzaW9uU3RhdHVzID0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCBvcHRpb25zPzogeyBmb2xkZXJzPzogVVJJW107IGNoYW5nZXM/OiBVUklbXSB9KTogSVNlc3Npb24ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG9wdGlvbnM/LmZvbGRlcnNcblx0XHRcdD8geyBmb2xkZXJzOiBvcHRpb25zLmZvbGRlcnMubWFwKHJvb3QgPT4gKHsgcm9vdCwgd29ya2luZ0RpcmVjdG9yeTogcm9vdCB9KSkgfVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IChvcHRpb25zPy5jaGFuZ2VzID8/IFtdKS5tYXAodXJpID0+ICh7IG1vZGlmaWVkVXJpOiB1cmksIG9yaWdpbmFsVXJpOiB1cmkgfSkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHN0YXR1czogb2JzZXJ2YWJsZVZhbHVlPFNlc3Npb25TdGF0dXM+KCdzdGF0dXMnLCBzdGF0dXMpLFxuXHRcdFx0aXNDcmVhdGVkOiBvYnNlcnZhYmxlVmFsdWUoJ2lzQ3JlYXRlZCcsIHN0YXR1cyAhPT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCksXG5cdFx0XHR3b3Jrc3BhY2U6IG9ic2VydmFibGVWYWx1ZSgnd29ya3NwYWNlJywgd29ya3NwYWNlKSxcblx0XHRcdGNoYW5nZXM6IG9ic2VydmFibGVWYWx1ZSgnY2hhbmdlcycsIGNoYW5nZXMpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbjtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldEFjdGl2ZVNlc3Npb24oczogSVNlc3Npb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzIGFzIElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0VmlzaWJsZUVkaXRvcnMocGFuZXM6IGFueVtdKTogdm9pZCB7XG5cdFx0dmlzaWJsZVBhbmVzLmxlbmd0aCA9IDA7XG5cdFx0dmlzaWJsZVBhbmVzLnB1c2goLi4ucGFuZXMpO1xuXHRcdHZpc2libGVFZGl0b3JzRW1pdHRlci5maXJlKHt9IGFzIElWaXNpYmxlRWRpdG9yc0NoYW5nZUV2ZW50KTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHR2aXNpYmxlRWRpdG9yc0VtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SVZpc2libGVFZGl0b3JzQ2hhbmdlRXZlbnQ+KCkpO1xuXHRcdHZpc2libGVQYW5lcyA9IFtdO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMgPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRzZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbj4oKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0RWRpdGluZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRFZGl0aW5nU2VydmljZT4oKSB7IH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIG9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UgPSB2aXNpYmxlRWRpdG9yc0VtaXR0ZXIuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSBnZXQgdmlzaWJsZUVkaXRvclBhbmVzKCkgeyByZXR1cm4gdmlzaWJsZVBhbmVzOyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpIHsgcmV0dXJuIHNlc3Npb25zLmdldChyZXNvdXJjZS50b1N0cmluZygpKTsgfVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgeyBhY3RpdmVTZXNzaW9uOiBhY3RpdmVTZXNzaW9uT2JzIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRGZWVkYmFja1NlcnZpY2UpKTtcblxuXHRcdHNlc3Npb25TMSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMScpO1xuXHRcdHNlc3Npb25TMiA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMicpO1xuXHRcdGZpbGVBID0gVVJJLnBhcnNlKCdmaWxlOi8vL2EudHMnKTtcblx0XHRmaWxlQiA9IFVSSS5wYXJzZSgnZmlsZTovLy9iLnRzJyk7XG5cblx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvblMxLnRvU3RyaW5nKCksIG1ha2VTZXNzaW9uKHNlc3Npb25TMSkpO1xuXHRcdHNlc3Npb25zLnNldChzZXNzaW9uUzIudG9TdHJpbmcoKSwgbWFrZVNlc3Npb24oc2Vzc2lvblMyKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzdG9yZS5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uIGFuZCBubyB0cmFja2VkIGZpbGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbkZvckZpbGUoZmlsZUEpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIG9uZSBzaGFyZWQgZmVlZGJhY2sgc2NvcGUgZm9yIHVuZGVmaW5lZCBhbmQgd29ya3NwYWNlLWxlc3MgZHJhZnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0RHJhZnQgPSBtYWtlU2Vzc2lvbihzZXNzaW9uUzEsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHNlY29uZERyYWZ0ID0gbWFrZVNlc3Npb24oc2Vzc2lvblMyLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblxuXHRcdGNvbnN0IHdpdGhvdXRTZXNzaW9uID0gc2VydmljZS5nZXRGZWVkYmFja1Nlc3Npb25SZXNvdXJjZShmaWxlQSk7XG5cdFx0c2V0QWN0aXZlU2Vzc2lvbihmaXJzdERyYWZ0KTtcblx0XHRjb25zdCB3aXRoRmlyc3REcmFmdCA9IHNlcnZpY2UuZ2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UoZmlsZUEpO1xuXHRcdHNldEFjdGl2ZVNlc3Npb24oc2Vjb25kRHJhZnQpO1xuXHRcdGNvbnN0IHdpdGhTZWNvbmREcmFmdCA9IHNlcnZpY2UuZ2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UoZmlsZUEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFt3aXRob3V0U2Vzc2lvbiwgd2l0aEZpcnN0RHJhZnQsIHdpdGhTZWNvbmREcmFmdF0ubWFwKHJlc291cmNlID0+IHJlc291cmNlPy50b1N0cmluZygpKSxcblx0XHRcdEFycmF5KDMpLmZpbGwoQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UudG9TdHJpbmcoKSksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcGVzIGEgZHJhZnQgdGhhdCBhbHJlYWR5IHBpY2tlZCBhIHdvcmtzcGFjZSB0byB0aGF0IHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRzZXRBY3RpdmVTZXNzaW9uKG1ha2VTZXNzaW9uKHNlc3Npb25TMSwgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgeyBmb2xkZXJzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKV0gfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbldvcmtzcGFjZTogc2VydmljZS5nZXRGZWVkYmFja1Nlc3Npb25SZXNvdXJjZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9hLnRzJykpPy50b1N0cmluZygpLFxuXHRcdFx0b3V0c2lkZVdvcmtzcGFjZTogc2VydmljZS5nZXRGZWVkYmFja1Nlc3Npb25SZXNvdXJjZShVUkkuZmlsZSgnL2Vsc2V3aGVyZS9hLnRzJykpPy50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdGluV29ya3NwYWNlOiBBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRS50b1N0cmluZygpLFxuXHRcdFx0b3V0c2lkZVdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjYXJkcyB0aGUgc2hhcmVkIG5ldy1zZXNzaW9uIGNvbW1lbnRzIHdoZW4gdGhlIGRyYWZ0IHdvcmtzcGFjZSBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRyYWZ0SW5GID0gbWFrZVNlc3Npb24oc2Vzc2lvblMxLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCB7IGZvbGRlcnM6IFtVUkkuZmlsZSgnL2YnKV0gfSk7XG5cdFx0Y29uc3QgZHJhZnRJbkcgPSBtYWtlU2Vzc2lvbihzZXNzaW9uUzIsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIHsgZm9sZGVyczogW1VSSS5maWxlKCcvZycpXSB9KTtcblxuXHRcdHNldEFjdGl2ZVNlc3Npb24oZHJhZnRJbkYpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UsIFVSSS5maWxlKCcvZi9hLnRzJyksIG5ldyBSYW5nZSgxLCAxLCAxLCAyKSwgJ0ZpeCB0aGlzJyk7XG5cblx0XHQvLyBWaXNpdGluZyBhIGNyZWF0ZWQgc2Vzc2lvbiBsZWF2ZXMgdGhlIHNjb3BlIGRvcm1hbnQsIHNvIHRoZSBjb21tZW50c1xuXHRcdC8vIHN1cnZpdmUgdGhlIHJvdW5kIHRyaXAgYmFjayB0byB0aGUgc2FtZSBkcmFmdCB3b3Jrc3BhY2UuXG5cdFx0c2V0QWN0aXZlU2Vzc2lvbihzZXNzaW9ucy5nZXQoc2Vzc2lvblMyLnRvU3RyaW5nKCkpISk7XG5cdFx0c2V0QWN0aXZlU2Vzc2lvbihkcmFmdEluRik7XG5cdFx0Y29uc3QgYWZ0ZXJDcmVhdGVkU2Vzc2lvblJvdW5kVHJpcCA9IHNlcnZpY2UuZ2V0RmVlZGJhY2soQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UpLmxlbmd0aDtcblxuXHRcdHNldEFjdGl2ZVNlc3Npb24oZHJhZnRJbkcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZnRlckNyZWF0ZWRTZXNzaW9uUm91bmRUcmlwLFxuXHRcdFx0YWZ0ZXJXb3Jrc3BhY2VDaGFuZ2U6IHNlcnZpY2UuZ2V0RmVlZGJhY2soQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRhZnRlckNyZWF0ZWRTZXNzaW9uUm91bmRUcmlwOiAxLFxuXHRcdFx0YWZ0ZXJXb3Jrc3BhY2VDaGFuZ2U6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xldHMgYSB3b3Jrc3BhY2UtbGVzcyBkcmFmdCBhZG9wdCBpdHMgZmlyc3Qgc2VsZWN0aW9uIGFmdGVyIHRoZSBjb21tZW50cyB3ZXJlIGNsZWFyZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHJhZnRJbkYgPSBtYWtlU2Vzc2lvbihzZXNzaW9uUzEsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIHsgZm9sZGVyczogW1VSSS5maWxlKCcvZicpXSB9KTtcblx0XHRjb25zdCB3b3Jrc3BhY2VsZXNzRHJhZnQgPSBtYWtlU2Vzc2lvbihzZXNzaW9uUzIsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IGRyYWZ0SW5HID0gbWFrZVNlc3Npb24oc2Vzc2lvblMyLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCB7IGZvbGRlcnM6IFtVUkkuZmlsZSgnL2cnKV0gfSk7XG5cblx0XHRzZXRBY3RpdmVTZXNzaW9uKGRyYWZ0SW5GKTtcblx0XHRjb25zdCBmaXJzdCA9IHNlcnZpY2UuYWRkRmVlZGJhY2soQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UsIFVSSS5maWxlKCcvZi9hLnRzJyksIG5ldyBSYW5nZSgxLCAxLCAxLCAyKSwgJ0ZpeCB0aGlzJyk7XG5cdFx0c2VydmljZS5yZW1vdmVGZWVkYmFjayhBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSwgZmlyc3QuaWQpO1xuXG5cdFx0Ly8gVGhlIHNldCBpcyBlbXB0eSBhZ2Fpbiwgc28gdGhlIGJpbmRpbmcgdG8gL2YgaXMgcmVsZWFzZWQgYW5kIHRoZSBjb21tZW50XG5cdFx0Ly8gd3JpdHRlbiB3aXRob3V0IGEgd29ya3NwYWNlIGFkb3B0cyB0aGUgbmV4dCBzZWxlY3Rpb24gaW5zdGVhZC5cblx0XHRzZXRBY3RpdmVTZXNzaW9uKHdvcmtzcGFjZWxlc3NEcmFmdCk7XG5cdFx0c2VydmljZS5hZGRGZWVkYmFjayhBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSwgVVJJLmZpbGUoJy9nL2IudHMnKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDIpLCAnUmVuYW1lIHRoaXMnKTtcblx0XHRzZXRBY3RpdmVTZXNzaW9uKGRyYWZ0SW5HKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEZlZWRiYWNrKEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBjcmVhdGVkIHNlc3Npb24gZmVlZGJhY2sgc2NvcGUgYWZ0ZXIgbGVhdmluZyB0aGUgbmV3LXNlc3Npb24gdmlldycsICgpID0+IHtcblx0XHRzZXRBY3RpdmVTZXNzaW9uKG1ha2VTZXNzaW9uKHNlc3Npb25TMSwgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkpO1xuXHRcdGNvbnN0IGRyYWZ0U2NvcGUgPSBzZXJ2aWNlLmdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKGZpbGVBKTtcblx0XHRzZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25zLmdldChzZXNzaW9uUzIudG9TdHJpbmcoKSkhKTtcblx0XHRjb25zdCBjcmVhdGVkU2NvcGUgPSBzZXJ2aWNlLmdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKGZpbGVBKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZHJhZnRTY29wZTogZHJhZnRTY29wZT8udG9TdHJpbmcoKSxcblx0XHRcdGNyZWF0ZWRTY29wZTogY3JlYXRlZFNjb3BlPy50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdGRyYWZ0U2NvcGU6IEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFLnRvU3RyaW5nKCksXG5cdFx0XHRjcmVhdGVkU2NvcGU6IHNlc3Npb25TMi50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCByZXNvdXJjZSBzY29wZSB1c2VzIGl0cyBzdXBwbGllZCBzZXNzaW9uIGFuZCBhbm5vdW5jZXMgc2NvcGUgY2hhbmdlcycsICgpID0+IHtcblx0XHRzZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25zLmdldChzZXNzaW9uUzEudG9TdHJpbmcoKSkhKTtcblx0XHRsZXQgc2NvcGVDaGFuZ2VzID0gMDtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5vbkRpZENoYW5nZUZlZWRiYWNrU2NvcGUoKCkgPT4gc2NvcGVDaGFuZ2VzKyspKTtcblxuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHNlcnZpY2UucmVnaXN0ZXJGZWVkYmFja1Jlc291cmNlU2NvcGUoZmlsZUEsIHNlc3Npb25TMik7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZFNjb3BlID0gc2VydmljZS5nZXRGZWVkYmFja1Nlc3Npb25SZXNvdXJjZShmaWxlQSk7XG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVnaXN0ZXJlZFNjb3BlOiByZWdpc3RlcmVkU2NvcGU/LnRvU3RyaW5nKCksXG5cdFx0XHRzY29wZUFmdGVyRGlzcG9zZTogc2VydmljZS5nZXRGZWVkYmFja1Nlc3Npb25SZXNvdXJjZShmaWxlQSk/LnRvU3RyaW5nKCksXG5cdFx0XHRzY29wZUNoYW5nZXMsXG5cdFx0fSwge1xuXHRcdFx0cmVnaXN0ZXJlZFNjb3BlOiBzZXNzaW9uUzIudG9TdHJpbmcoKSxcblx0XHRcdHNjb3BlQWZ0ZXJEaXNwb3NlOiBzZXNzaW9uUzEudG9TdHJpbmcoKSxcblx0XHRcdHNjb3BlQ2hhbmdlczogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndW50cmFja2VkIGZpbGUgZmFsbHMgYmFjayB0byB0aGUgYWN0aXZlIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0c2V0QWN0aXZlU2Vzc2lvbihzZXNzaW9ucy5nZXQoc2Vzc2lvblMxLnRvU3RyaW5nKCkpISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbkZvckZpbGUoZmlsZUEpPy5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uUzEudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcHR1cmVzIGFjdGl2ZSBzZXNzaW9uIHdoZW4gZmlsZSBiZWNvbWVzIHZpc2libGUnLCAoKSA9PiB7XG5cdFx0c2V0QWN0aXZlU2Vzc2lvbihzZXNzaW9ucy5nZXQoc2Vzc2lvblMxLnRvU3RyaW5nKCkpISk7XG5cdFx0c2V0VmlzaWJsZUVkaXRvcnMoW3BhbmUoZmlsZUEpXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRTZXNzaW9uRm9yRmlsZShmaWxlQSk/LnJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb25TMS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGNhcHR1cmVkIHNlc3Npb24gYWZ0ZXIgYWN0aXZlIHNlc3Npb24gc3dpdGNoZXMgd2l0aG91dCBhIHZpc2liaWxpdHkgY2hhbmdlJywgKCkgPT4ge1xuXHRcdHNldEFjdGl2ZVNlc3Npb24oc2Vzc2lvbnMuZ2V0KHNlc3Npb25TMS50b1N0cmluZygpKSEpO1xuXHRcdHNldFZpc2libGVFZGl0b3JzKFtwYW5lKGZpbGVBKV0pO1xuXG5cdFx0Ly8gU3dpdGNoIGFjdGl2ZSBzZXNzaW9uIHdpdGhvdXQgZmlyaW5nIGEgdmlzaWJpbGl0eSBjaGFuZ2Vcblx0XHRzZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25zLmdldChzZXNzaW9uUzIudG9TdHJpbmcoKSkhKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25Gb3JGaWxlKGZpbGVBKT8ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvblMxLnRvU3RyaW5nKCkpO1xuXHRcdC8vIFVudHJhY2tlZCBmaWxlIGZhbGxzIGJhY2sgdG8gdGhlIGN1cnJlbnQgYWN0aXZlIHNlc3Npb25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRTZXNzaW9uRm9yRmlsZShmaWxlQik/LnJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb25TMi50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnbW9zdCByZWNlbnQgdmlzaWJpbGl0eSB3aW5zIHdoZW4gdGhlIHNhbWUgZmlsZSBpcyBzZWVuIHVuZGVyIGEgZGlmZmVyZW50IHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0c2V0QWN0aXZlU2Vzc2lvbihzZXNzaW9ucy5nZXQoc2Vzc2lvblMxLnRvU3RyaW5nKCkpISk7XG5cdFx0c2V0VmlzaWJsZUVkaXRvcnMoW3BhbmUoZmlsZUEpXSk7XG5cblx0XHRzZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25zLmdldChzZXNzaW9uUzIudG9TdHJpbmcoKSkhKTtcblx0XHRzZXRWaXNpYmxlRWRpdG9ycyhbcGFuZShmaWxlQSldKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25Gb3JGaWxlKGZpbGVBKT8ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvblMyLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXN0aW5jdCBmaWxlcyBjYXB0dXJlZCB1bmRlciBkaWZmZXJlbnQgYWN0aXZlIHNlc3Npb25zIHJldGFpbiB0aGVpciBvd24gbWFwcGluZycsICgpID0+IHtcblx0XHRzZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25zLmdldChzZXNzaW9uUzEudG9TdHJpbmcoKSkhKTtcblx0XHRzZXRWaXNpYmxlRWRpdG9ycyhbcGFuZShmaWxlQSldKTtcblxuXHRcdHNldEFjdGl2ZVNlc3Npb24oc2Vzc2lvbnMuZ2V0KHNlc3Npb25TMi50b1N0cmluZygpKSEpO1xuXHRcdHNldFZpc2libGVFZGl0b3JzKFtwYW5lKGZpbGVCKV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbkZvckZpbGUoZmlsZUEpPy5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uUzEudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbkZvckZpbGUoZmlsZUIpPy5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uUzIudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLXJlc291cmNlIGVkaXRvciBwYW5lIHRyYWNrcyBldmVyeSByZXNvdXJjZSB1bmRlciB0aGUgYWN0aXZlIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0c2V0QWN0aXZlU2Vzc2lvbihzZXNzaW9ucy5nZXQoc2Vzc2lvblMxLnRvU3RyaW5nKCkpISk7XG5cdFx0c2V0VmlzaWJsZUVkaXRvcnMoW3BhbmUoZmlsZUEsIGZpbGVCKV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbkZvckZpbGUoZmlsZUEpPy5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uUzEudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbkZvckZpbGUoZmlsZUIpPy5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uUzEudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uIGhhcyBVbnRpdGxlZCBzdGF0dXMnLCAoKSA9PiB7XG5cdFx0c2Vzc2lvbnMuc2V0KHNlc3Npb25TMS50b1N0cmluZygpLCBtYWtlU2Vzc2lvbihzZXNzaW9uUzEsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpKTtcblx0XHRzZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25zLmdldChzZXNzaW9uUzEudG9TdHJpbmcoKSkhKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25Gb3JGaWxlKGZpbGVBKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiB0aGUgbWFwcGVkIHNlc3Npb24gaXMgdW5rbm93biB0byB0aGUgbWFuYWdlbWVudCBzZXJ2aWNlJywgKCkgPT4ge1xuXHRcdHNldEFjdGl2ZVNlc3Npb24oc2Vzc2lvbnMuZ2V0KHNlc3Npb25TMS50b1N0cmluZygpKSEpO1xuXHRcdHNldFZpc2libGVFZGl0b3JzKFtwYW5lKGZpbGVBKV0pO1xuXHRcdHNlc3Npb25zLmRlbGV0ZShzZXNzaW9uUzEudG9TdHJpbmcoKSk7XG5cdFx0c2V0QWN0aXZlU2Vzc2lvbih1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbkZvckZpbGUoZmlsZUEpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXR1cm4gYSBzZXNzaW9uIGZvciBmaWxlcyBvdXRzaWRlIHRoZSBzZXNzaW9uIHdvcmtzcGFjZSBmb2xkZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdzU2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHNlc3Npb25TMSwgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCB7IGZvbGRlcnM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSB9KTtcblx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvblMxLnRvU3RyaW5nKCksIHdzU2Vzc2lvbik7XG5cdFx0c2V0QWN0aXZlU2Vzc2lvbih3c1Nlc3Npb24pO1xuXG5cdFx0Ly8gQSB1c2VyLWRhdGEgZmlsZSBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgaXMgb3V0IG9mIHNjb3BlLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25Gb3JGaWxlKFVSSS5maWxlKCcvaG9tZS91c2VyL3NldHRpbmdzLmpzb24nKSksIHVuZGVmaW5lZCk7XG5cdFx0Ly8gQSBmaWxlIGluc2lkZSB0aGUgd29ya3NwYWNlIGZvbGRlciBpcyBpbiBzY29wZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRTZXNzaW9uRm9yRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9hLnRzJykpPy5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uUzEudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYSBzZXNzaW9uIGZvciBmaWxlcyB0aGF0IGFyZSBwYXJ0IG9mIGl0cyBjaGFuZ2VzIGV2ZW4gb3V0c2lkZSB0aGUgd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYW5nZWQgPSBVUkkuZmlsZSgnL291dHNpZGUvY2hhbmdlZC50cycpO1xuXHRcdGNvbnN0IHdzU2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHNlc3Npb25TMSwgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCB7IGZvbGRlcnM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSwgY2hhbmdlczogW2NoYW5nZWRdIH0pO1xuXHRcdHNlc3Npb25zLnNldChzZXNzaW9uUzEudG9TdHJpbmcoKSwgd3NTZXNzaW9uKTtcblx0XHRzZXRBY3RpdmVTZXNzaW9uKHdzU2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRTZXNzaW9uRm9yRmlsZShjaGFuZ2VkKT8ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvblMxLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXR1cm4gYSBzZXNzaW9uIGZvciBvdXRwdXQgdmlldyByZXNvdXJjZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd3NTZXNzaW9uID0gbWFrZVNlc3Npb24oc2Vzc2lvblMxLCBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHsgZm9sZGVyczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldIH0pO1xuXHRcdHNlc3Npb25zLnNldChzZXNzaW9uUzEudG9TdHJpbmcoKSwgd3NTZXNzaW9uKTtcblx0XHRzZXRBY3RpdmVTZXNzaW9uKHdzU2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRTZXNzaW9uRm9yRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogJ291dHB1dCcsIHBhdGg6ICcvd29ya3NwYWNlL2ZvbycgfSkpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRGZWVkYmFja1NlcnZpY2UgLSBTdGF0ZScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHNlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZTtcblx0bGV0IHNlc3Npb246IFVSSTtcblx0bGV0IGZpbGVBOiBVUkk7XG5cdC8qKiBXaGVuIHNldCwgZ2V0U2Vzc2lvbiByZXBvcnRzIHRoZSBzZXNzaW9uIHVuZGVyIHRoaXMgcHJvdmlkZXIgaWQuICovXG5cdGxldCBzZXNzaW9uUHJvdmlkZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRzZXNzaW9uUHJvdmlkZXJJZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRFZGl0aW5nU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEVkaXRpbmdTZXJ2aWNlPigpIHsgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSB2aXNpYmxlRWRpdG9yUGFuZXMgPSBbXTtcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXJzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcjxUIGV4dGVuZHMgSVNlc3Npb25zUHJvdmlkZXI+KF9wcm92aWRlcklkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWREZWxldGVTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb24oX3Jlc291cmNlOiBVUkkpIHtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb25Qcm92aWRlcklkXG5cdFx0XHRcdFx0PyB7IHByb3ZpZGVySWQ6IHNlc3Npb25Qcm92aWRlcklkLCBzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvblxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgeyBhY3RpdmVTZXNzaW9uOiBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25zU2VydmljZSk7XG5cblx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RmVlZGJhY2tTZXJ2aWNlKSk7XG5cdFx0c2Vzc2lvbiA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMScpO1xuXHRcdGZpbGVBID0gVVJJLnBhcnNlKCdmaWxlOi8vL2EudHMnKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZmVlZGJhY2sgZGVmYXVsdHMgdG8gdGhlIGFjY2VwdGVkIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZlZWRiYWNrID0gc2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigxMCksICdoZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZWVkYmFjay5zdGF0ZSwgQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlZCBmZWVkYmFjayB0cmFuc2l0aW9ucyB0byBhY2NlcHRlZCBvbiBhY2NlcHRGZWVkYmFjaycsICgpID0+IHtcblx0XHRjb25zdCBjcmVhdGVkID0gc2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigxMCksICdwZW5kaW5nJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgQWdlbnRGZWVkYmFja0tpbmQuQWdlbnRSZXZpZXcsIEFnZW50RmVlZGJhY2tTdGF0ZS5DcmVhdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZC5zdGF0ZSwgQWdlbnRGZWVkYmFja1N0YXRlLkNyZWF0ZWQpO1xuXG5cdFx0c2VydmljZS5hY2NlcHRGZWVkYmFjayhzZXNzaW9uLCBjcmVhdGVkLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uKVswXS5zdGF0ZSwgQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya0ZlZWRiYWNrU3VibWl0dGVkIHJlc29sdmVzIGFjY2VwdGVkIGl0ZW1zIGRpcmVjdGx5IGZvciBub24tYWdlbnQtaG9zdCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBhY2NlcHRlZCA9IHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoMTApLCAnYWNjZXB0ZWQnKTtcblx0XHRjb25zdCBjcmVhdGVkID0gc2VydmljZS5hZGRGZWVkYmFjayhzZXNzaW9uLCBmaWxlQSwgcigyMCksICdjcmVhdGVkJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgQWdlbnRGZWVkYmFja0tpbmQuQWdlbnRSZXZpZXcsIEFnZW50RmVlZGJhY2tTdGF0ZS5DcmVhdGVkKTtcblxuXHRcdHNlcnZpY2UubWFya0ZlZWRiYWNrU3VibWl0dGVkKHNlc3Npb24pO1xuXG5cdFx0Y29uc3Qgc3RhdGVCeUlkID0gbmV3IE1hcChzZXJ2aWNlLmdldEZlZWRiYWNrKHNlc3Npb24pLm1hcChpdGVtID0+IFtpdGVtLmlkLCBpdGVtLnN0YXRlXSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWNjZXB0ZWQ6IHN0YXRlQnlJZC5nZXQoYWNjZXB0ZWQuaWQpLFxuXHRcdFx0Y3JlYXRlZDogc3RhdGVCeUlkLmdldChjcmVhdGVkLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRhY2NlcHRlZDogQWdlbnRGZWVkYmFja1N0YXRlLlJlc29sdmVkLFxuXHRcdFx0Y3JlYXRlZDogQWdlbnRGZWVkYmFja1N0YXRlLkNyZWF0ZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtGZWVkYmFja1N1Ym1pdHRlZCBrZWVwcyBhY2NlcHRlZCBpdGVtcyBzdWJtaXR0ZWQgZm9yIGFnZW50LWhvc3Qgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0c2Vzc2lvblByb3ZpZGVySWQgPSBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lEO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoMTApLCAnYWNjZXB0ZWQnKTtcblxuXHRcdHNlcnZpY2UubWFya0ZlZWRiYWNrU3VibWl0dGVkKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RmVlZGJhY2soc2Vzc2lvbilbMF0uc3RhdGUsIEFnZW50RmVlZGJhY2tTdGF0ZS5TdWJtaXR0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZpbmcgYW5kIHVuLXJlc29sdmluZyBtb3ZlcyBiZXR3ZWVuIHJlc29sdmVkIGFuZCBzdWJtaXR0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmVlZGJhY2sgPSBzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEwKSwgJ2ZlZWRiYWNrJyk7XG5cdFx0Ly8gTm9uLWFnZW50LWhvc3Qgc3VibWl0IHJlc29sdmVzIHRoZSBjb21tZW50IGRpcmVjdGx5LlxuXHRcdHNlcnZpY2UubWFya0ZlZWRiYWNrU3VibWl0dGVkKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEZlZWRiYWNrKHNlc3Npb24pWzBdLnN0YXRlLCBBZ2VudEZlZWRiYWNrU3RhdGUuUmVzb2x2ZWQpO1xuXG5cdFx0c2VydmljZS5zZXRGZWVkYmFja1Jlc29sdmVkKHNlc3Npb24sIGZlZWRiYWNrLmlkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RmVlZGJhY2soc2Vzc2lvbilbMF0uc3RhdGUsIEFnZW50RmVlZGJhY2tTdGF0ZS5TdWJtaXR0ZWQpO1xuXG5cdFx0c2VydmljZS5zZXRGZWVkYmFja1Jlc29sdmVkKHNlc3Npb24sIGZlZWRiYWNrLmlkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uKVswXS5zdGF0ZSwgQWdlbnRGZWVkYmFja1N0YXRlLlJlc29sdmVkKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50RmVlZGJhY2tTZXJ2aWNlIC0gU3VibWl0IChhZ2VudCBob3N0KScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHNlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZTtcblx0bGV0IHNlc3Npb246IFVSSTtcblx0bGV0IGZpbGVBOiBVUkk7XG5cdGxldCB3aWRnZXRPcHM6IHN0cmluZ1tdO1xuXHRsZXQgYWRkZWRFbnRyaWVzOiBJQWdlbnRGZWVkYmFja1ZhcmlhYmxlRW50cnlbXTtcblx0LyoqIFJlc29sdmVzIHdoZW4gdGhlIChwb3NzaWJseSBxdWV1ZWQpIHJlcXVlc3QgaXMgYWN0dWFsbHkgc2VudCwgaS5lLiB3aGVuIGBhY2NlcHRJbnB1dGAgcmVzb2x2ZXMuICovXG5cdGxldCBhY2NlcHRJbnB1dFNlbnQ6IERlZmVycmVkUHJvbWlzZTx2b2lkPjtcblx0LyoqIFdoZXRoZXIgdGhlIHdpZGdldCBoYW5kcyB0aGUgcmVxdWVzdCBvdmVyIHRvIHRoZSBjaGF0IHNlcnZpY2UuICovXG5cdGxldCBhY2NlcHRzUmVxdWVzdDogYm9vbGVhbjtcblx0LyoqIFdoZXRoZXIgdGhlIHdpZGdldCBoYXMgdGhlIHNlc3Npb24ncyBjaGF0IG1vZGVsIGxvYWRlZC4gKi9cblx0bGV0IHNlc3Npb25Mb2FkZWQ6IGJvb2xlYW47XG5cdC8qKiBTaW11bGF0ZXMgdGhlIHdpZGdldCBsb2FkaW5nIHRoZSBzZXNzaW9uJ3MgY2hhdCBtb2RlbC4gKi9cblx0bGV0IGxvYWRTZXNzaW9uOiAoKSA9PiB2b2lkO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR3aWRnZXRPcHMgPSBbXTtcblx0XHRhZGRlZEVudHJpZXMgPSBbXTtcblx0XHRhY2NlcHRJbnB1dFNlbnQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0YWNjZXB0c1JlcXVlc3QgPSB0cnVlO1xuXHRcdHNlc3Npb25Mb2FkZWQgPSB0cnVlO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0RWRpdGluZ1NlcnZpY2U+KCkgeyB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHZpc2libGVFZGl0b3JQYW5lcyA9IFtdO1xuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldFByb3ZpZGVyPFQgZXh0ZW5kcyBJU2Vzc2lvbnNQcm92aWRlcj4oX3Byb3ZpZGVySWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZERlbGV0ZVNlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbihfcmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRyZXR1cm4geyBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIHsgYWN0aXZlU2Vzc2lvbjogb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCkgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VWaWV3TW9kZWwgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUNoYXRXaWRnZXRWaWV3TW9kZWxDaGFuZ2VFdmVudD4oKSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0b25EaWRDaGFuZ2VWaWV3TW9kZWw6IG9uRGlkQ2hhbmdlVmlld01vZGVsLmV2ZW50LFxuXHRcdFx0YXR0YWNobWVudE1vZGVsOiB7XG5cdFx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdFx0ZGVsZXRlOiAoaWQ6IHN0cmluZykgPT4gd2lkZ2V0T3BzLnB1c2goYGRlbGV0ZToke2lkfWApLFxuXHRcdFx0XHRhZGRDb250ZXh0OiAoLi4uZW50cmllczogSUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5W10pID0+IHtcblx0XHRcdFx0XHRhZGRlZEVudHJpZXMucHVzaCguLi5lbnRyaWVzKTtcblx0XHRcdFx0XHR3aWRnZXRPcHMucHVzaChgYWRkOiR7ZW50cmllc1swXT8uaWR9YCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0YWNjZXB0SW5wdXQ6IGFzeW5jIChxdWVyeTogc3RyaW5nLCBvcHRpb25zPzogSUNoYXRBY2NlcHRJbnB1dE9wdGlvbnMpID0+IHtcblx0XHRcdFx0d2lkZ2V0T3BzLnB1c2goYGFjY2VwdDoke3F1ZXJ5fWApO1xuXHRcdFx0XHRpZiAoYWNjZXB0c1JlcXVlc3QpIHtcblx0XHRcdFx0XHRvcHRpb25zPy5vblJlcXVlc3RBY2NlcHRlZD8uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgYWNjZXB0SW5wdXRTZW50LnA7XG5cdFx0XHRcdHdpZGdldE9wcy5wdXNoKGBzZW50OiR7cXVlcnl9YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblx0XHRsb2FkU2Vzc2lvbiA9ICgpID0+IHtcblx0XHRcdHNlc3Npb25Mb2FkZWQgPSB0cnVlO1xuXHRcdFx0b25EaWRDaGFuZ2VWaWV3TW9kZWwuZmlyZSh7IHByZXZpb3VzU2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQsIGN1cnJlbnRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24gfSk7XG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRBZGRXaWRnZXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0QWxsV2lkZ2V0cygpOiByZWFkb25seSBJQ2hhdFdpZGdldFtdIHsgcmV0dXJuIFt3aWRnZXRdOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShfcmVzb3VyY2U6IFVSSSk6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb25Mb2FkZWQgPyB3aWRnZXQgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RmVlZGJhY2tTZXJ2aWNlKSk7XG5cdFx0c2Vzc2lvbiA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMScpO1xuXHRcdGZpbGVBID0gVVJJLnBhcnNlKCdmaWxlOi8vL2EudHMnKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYXR0YWNoZXMgdGhlIGp1c3Qtc3VibWl0dGVkIGZlZWRiYWNrIHRvIHRoZSByZXF1ZXN0IGFuZCBjbGVhcnMgdGhlIGF0dGFjaG1lbnQgYWZ0ZXJ3YXJkcycsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEwKSwgJ1BsZWFzZSBzaW1wbGlmeScpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5zdWJtaXRGZWVkYmFjayhzZXNzaW9uKTtcblxuXHRcdGNvbnN0IGF0dGFjaG1lbnRJZCA9IGBhZ2VudEZlZWRiYWNrOiR7c2Vzc2lvbi50b1N0cmluZygpfWA7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3aWRnZXRPcHMsIFtcblx0XHRcdGBkZWxldGU6JHthdHRhY2htZW50SWR9YCxcblx0XHRcdGBhZGQ6JHthdHRhY2htZW50SWR9YCxcblx0XHRcdCdhY2NlcHQ6L2FjdC1vbi1mZWVkYmFjaycsXG5cdFx0XHRgZGVsZXRlOiR7YXR0YWNobWVudElkfWAsXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb3VudDogYWRkZWRFbnRyaWVzLmxlbmd0aCxcblx0XHRcdGtpbmQ6IGFkZGVkRW50cmllc1swXT8ua2luZCxcblx0XHRcdHRleHRzOiBhZGRlZEVudHJpZXNbMF0/LmZlZWRiYWNrSXRlbXMubWFwKGl0ZW0gPT4gaXRlbS50ZXh0KSxcblx0XHRcdHN0YXRlOiBzZXJ2aWNlLmdldEZlZWRiYWNrKHNlc3Npb24pWzBdLnN0YXRlLFxuXHRcdH0sIHtcblx0XHRcdGNvdW50OiAxLFxuXHRcdFx0a2luZDogJ2FnZW50RmVlZGJhY2snLFxuXHRcdFx0dGV4dHM6IFsnUGxlYXNlIHNpbXBsaWZ5J10sXG5cdFx0XHRzdGF0ZTogQWdlbnRGZWVkYmFja1N0YXRlLlN1Ym1pdHRlZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFya3MgZmVlZGJhY2sgYXMgc3VibWl0dGVkIG9uY2UgdGhlIHJlcXVlc3QgaXMgcXVldWVkIGJlaGluZCBhbiBpbi1wcm9ncmVzcyByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoMTApLCAnUGxlYXNlIHNpbXBsaWZ5Jyk7XG5cblx0XHQvLyBgYWNjZXB0SW5wdXRTZW50YCBpcyBzdGlsbCBwZW5kaW5nOiB0aGUgcmVxdWVzdCB3YXMgcXVldWVkIGFuZCBvbmx5IHJ1bnNcblx0XHQvLyBvbmNlIHRoZSBpbi1wcm9ncmVzcyByZXF1ZXN0IGNvbXBsZXRlcy5cblx0XHRjb25zdCBzdWJtaXR0ZWQgPSBhd2FpdCBzZXJ2aWNlLnN1Ym1pdEZlZWRiYWNrKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdWJtaXR0ZWQsXG5cdFx0XHRzdGF0ZTogc2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uKVswXS5zdGF0ZSxcblx0XHRcdHNlbnQ6IHdpZGdldE9wcy5pbmNsdWRlcygnc2VudDovYWN0LW9uLWZlZWRiYWNrJyksXG5cdFx0fSwge1xuXHRcdFx0c3VibWl0dGVkOiB0cnVlLFxuXHRcdFx0c3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRzZW50OiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgZmVlZGJhY2sgYWNjZXB0ZWQgd2hlbiB0aGUgcmVxdWVzdCBpcyBub3QgYWNjZXB0ZWQgYnkgdGhlIHdpZGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRhY2NlcHRzUmVxdWVzdCA9IGZhbHNlO1xuXHRcdGFjY2VwdElucHV0U2VudC5jb21wbGV0ZSgpO1xuXHRcdHNlcnZpY2UuYWRkRmVlZGJhY2soc2Vzc2lvbiwgZmlsZUEsIHIoMTApLCAnUGxlYXNlIHNpbXBsaWZ5Jyk7XG5cblx0XHRjb25zdCBzdWJtaXR0ZWQgPSBhd2FpdCBzZXJ2aWNlLnN1Ym1pdEZlZWRiYWNrKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdWJtaXR0ZWQsXG5cdFx0XHRzdGF0ZTogc2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uKVswXS5zdGF0ZSxcblx0XHR9LCB7XG5cdFx0XHRzdWJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0c3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2FpdHMgZm9yIHRoZSBzZXNzaW9uIG1vZGVsIHRvIGxvYWQgaW50byB0aGUgd2lkZ2V0IGJlZm9yZSBzdWJtaXR0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlc3Npb25Mb2FkZWQgPSBmYWxzZTtcblx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHNlc3Npb24sIGZpbGVBLCByKDEwKSwgJ1BsZWFzZSBzaW1wbGlmeScpO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IHNlcnZpY2Uuc3VibWl0RmVlZGJhY2soc2Vzc2lvbik7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzdWJtaXR0ZWRCZWZvcmVMb2FkID0gd2lkZ2V0T3BzLmxlbmd0aCA+IDA7XG5cblx0XHRsb2FkU2Vzc2lvbigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdWJtaXR0ZWRCZWZvcmVMb2FkLFxuXHRcdFx0c3VibWl0dGVkOiBhd2FpdCBwZW5kaW5nLFxuXHRcdFx0c3RhdGU6IHNlcnZpY2UuZ2V0RmVlZGJhY2soc2Vzc2lvbilbMF0uc3RhdGUsXG5cdFx0XHRhY2NlcHRlZDogd2lkZ2V0T3BzLmluY2x1ZGVzKCdhY2NlcHQ6L2FjdC1vbi1mZWVkYmFjaycpLFxuXHRcdH0sIHtcblx0XHRcdHN1Ym1pdHRlZEJlZm9yZUxvYWQ6IGZhbHNlLFxuXHRcdFx0c3VibWl0dGVkOiB0cnVlLFxuXHRcdFx0c3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRhY2NlcHRlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50RmVlZGJhY2tTZXJ2aWNlIC0gd2hlbldpZGdldEZvclNlc3Npb24nLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHNlc3Npb24gPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLzEnKTtcblxuXHR0ZWFyZG93bigoKSA9PiBzdG9yZS5jbGVhcigpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvKipcblx0ICogQnVpbGRzIGEgd2lkZ2V0IHNlcnZpY2Ugd2hvc2Ugc2luZ2xlIHdpZGdldCBvbmx5IHJlcG9ydHMgdGhlIHNlc3Npb24gb25jZSBgbG9hZGAgaXNcblx0ICogY2FsbGVkLCBtaXJyb3JpbmcgYSBjaGF0IHdpZGdldCB0aGF0IGhhcyBub3QgbG9hZGVkIGl0cyBtb2RlbCB5ZXQuXG5cdCAqL1xuXHRmdW5jdGlvbiBjcmVhdGVXaWRnZXRIb3N0KCk6IHsgd2lkZ2V0OiBJQ2hhdFdpZGdldDsgc2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlOyBsb2FkOiAoKSA9PiB2b2lkIH0ge1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlVmlld01vZGVsID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElDaGF0V2lkZ2V0Vmlld01vZGVsQ2hhbmdlRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHsgb25EaWRDaGFuZ2VWaWV3TW9kZWw6IG9uRGlkQ2hhbmdlVmlld01vZGVsLmV2ZW50IH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblx0XHRsZXQgbG9hZGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRBZGRXaWRnZXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0QWxsV2lkZ2V0cygpOiByZWFkb25seSBJQ2hhdFdpZGdldFtdIHsgcmV0dXJuIFt3aWRnZXRdOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShfcmVzb3VyY2U6IFVSSSk6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIGxvYWRlZCA/IHdpZGdldCA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpZGdldCxcblx0XHRcdHNlcnZpY2UsXG5cdFx0XHRsb2FkOiAoKSA9PiB7XG5cdFx0XHRcdGxvYWRlZCA9IHRydWU7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlVmlld01vZGVsLmZpcmUoeyBwcmV2aW91c1Nlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkLCBjdXJyZW50U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uIH0pO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgncmVzb2x2ZXMgaW1tZWRpYXRlbHkgd2hlbiB0aGUgc2Vzc2lvbiBpcyBhbHJlYWR5IGxvYWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2lkZ2V0SG9zdCgpO1xuXHRcdGhvc3QubG9hZCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHdoZW5XaWRnZXRGb3JTZXNzaW9uKGhvc3Quc2VydmljZSwgc2Vzc2lvbiwgMCksIGhvc3Qud2lkZ2V0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgb25jZSBhIHdpZGdldCBsb2FkcyB0aGUgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2lkZ2V0SG9zdCgpO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IHdoZW5XaWRnZXRGb3JTZXNzaW9uKGhvc3Quc2VydmljZSwgc2Vzc2lvbiwgNTAwMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRob3N0LmxvYWQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBwZW5kaW5nLCBob3N0LndpZGdldCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHVuZGVmaW5lZCB3aGVuIG5vIHdpZGdldCBsb2FkcyB0aGUgc2Vzc2lvbiBpbiB0aW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVXaWRnZXRIb3N0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgd2hlbldpZGdldEZvclNlc3Npb24oaG9zdC5zZXJ2aWNlLCBzZXNzaW9uLCAxKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgd2hlbiBhIHdpZGdldCB0aGF0IGFscmVhZHkgaGFzIHRoZSBzZXNzaW9uIGlzIGFkZGVkIGxhdGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9uRGlkQWRkV2lkZ2V0ID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElDaGF0V2lkZ2V0PigpKTtcblx0XHRjb25zdCB3aWRnZXQgPSB7IG9uRGlkQ2hhbmdlVmlld01vZGVsOiBFdmVudC5Ob25lIH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblx0XHRsZXQgd2lkZ2V0czogSUNoYXRXaWRnZXRbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIG9uRGlkQWRkV2lkZ2V0ID0gb25EaWRBZGRXaWRnZXQuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSBnZXRBbGxXaWRnZXRzKCk6IHJlYWRvbmx5IElDaGF0V2lkZ2V0W10geyByZXR1cm4gd2lkZ2V0czsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoX3Jlc291cmNlOiBVUkkpOiBJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZCB7IHJldHVybiB3aWRnZXRzWzBdOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSB3aGVuV2lkZ2V0Rm9yU2Vzc2lvbihzZXJ2aWNlLCBzZXNzaW9uLCA1MDAwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHdpZGdldHMgPSBbd2lkZ2V0XTtcblx0XHRvbkRpZEFkZFdpZGdldC5maXJlKHdpZGdldCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcGVuZGluZywgd2lkZ2V0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBOEIsdUJBQXVCO0FBQ3JELFNBQVMsYUFBYTtBQUN0QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLFlBQVk7QUFDckIsU0FBUyxxQ0FBcUMsbUJBQW1CLHNCQUFzQixvQkFBMkMsNEJBQTRCO0FBQzlKLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQXNCLDBCQUFvRjtBQUUxRyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQWtEO0FBQzNELFNBQXlCLGtDQUFrQztBQUMzRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFtQixxQkFBcUI7QUFDeEMsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyxFQUFFLFdBQW1CLFVBQWtCLFdBQWtCO0FBQ2pFLFNBQU8sSUFBSSxNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUM7QUFDMUM7QUFFQSxTQUFTLGdCQUFnQixPQUFzRjtBQUM5RyxTQUFPLE1BQU0sSUFBSSxPQUFLLEdBQUcsRUFBRSxZQUFZLElBQUksSUFBSSxFQUFFLE1BQU0sZUFBZSxFQUFFO0FBQ3pFO0FBRUEsTUFBTSxtQ0FBbUMsTUFBTTtBQUU5QyxRQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7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
