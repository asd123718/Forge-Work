import assert from "assert";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { extUriBiasedIgnorePathCase } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { VisibleSession, VisibleSessions } from "../../browser/visibleSessions.js";
import { ChatInteractivity, ChatOriginKind, SessionStatus } from "../../common/session.js";
const stubChat = {
  resource: URI.parse("test:///chat"),
  createdAt: /* @__PURE__ */ new Date(),
  title: constObservable("Chat"),
  updatedAt: constObservable(/* @__PURE__ */ new Date()),
  status: constObservable(0),
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
function stubSession(sessionId) {
  return {
    sessionId,
    providerId: "test",
    resource: URI.parse(`test:///${sessionId}`),
    sessionType: "test",
    icon: Codicon.vm,
    createdAt: /* @__PURE__ */ new Date(),
    workspace: constObservable(void 0),
    title: constObservable(sessionId),
    updatedAt: constObservable(/* @__PURE__ */ new Date()),
    status: constObservable(0),
    changesets: constObservable([]),
    changes: constObservable([]),
    modelId: constObservable(void 0),
    mode: constObservable(void 0),
    loading: constObservable(false),
    isArchived: constObservable(false),
    isRead: constObservable(true),
    description: constObservable(void 0),
    lastTurnEnd: constObservable(void 0),
    chats: constObservable([stubChat]),
    mainChat: constObservable(stubChat),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
}
suite("VisibleSessions", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createModel(onSlotReplaced = () => {
  }) {
    const uriIdentity = new class extends mock() {
      constructor() {
        super(...arguments);
        this.extUri = extUriBiasedIgnorePathCase;
      }
    }();
    const model = disposables.add(new VisibleSessions(
      (session) => session.mainChat.get(),
      () => [],
      onSlotReplaced,
      uriIdentity
    ));
    return model;
  }
  function snapshot(model, visible = model.visibleSessions.get()) {
    return {
      visible: visible.map((s) => s?.sessionId),
      active: model.activeSession.get()?.sessionId,
      sticky: visible.filter((s) => !!s && s.sticky.get()).map((s) => s.sessionId)
    };
  }
  test("forwards Git availability through visible and resource-override wrappers", () => {
    const hasGitRepository = observableValue("hasGitRepository", false);
    const completedStateIcon = observableValue("completedStateIcon", Codicon.gitMerge);
    const session = { ...stubSession("A"), completedStateIcon, hasGitRepository };
    const model = createModel();
    model.setActive(session);
    const visible = model.activeSession.get();
    const resourceOverride = model.updateResourceOfSession(session, URI.parse("test:///override"));
    assert.deepStrictEqual({
      visible: visible?.hasGitRepository === hasGitRepository,
      resourceOverride: resourceOverride.hasGitRepository === hasGitRepository,
      visibleCompletedStateIcon: visible?.completedStateIcon === completedStateIcon,
      resourceOverrideCompletedStateIcon: resourceOverride.completedStateIcon === completedStateIcon
    }, {
      visible: true,
      resourceOverride: true,
      visibleCompletedStateIcon: true,
      resourceOverrideCompletedStateIcon: true
    });
  });
  suite("setActive", () => {
    test("opening B after non-sticky A replaces A in place", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.setActive(B);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["B"],
        active: "B",
        sticky: []
      });
    });
    test("opening B when active A is sticky appends B (no other non-sticky)", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B"],
        active: "B",
        sticky: ["A"]
      });
    });
    test("opening C when active is sticky and a non-sticky exists replaces the non-sticky", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.setActive(A);
      model.setActive(C);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "C"],
        active: "C",
        sticky: ["A"]
      });
    });
    test("opening D when all visible are sticky appends D at the end", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      const D = stubSession("D");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.setActive(C);
      model.toggleStickiness(C);
      model.setActive(D);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B", "C", "D"],
        active: "D",
        sticky: ["A", "B", "C"]
      });
    });
    test("opens with multiple non-sticky sessions side by side", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.setActive(A);
      model.setActive(C);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "C"],
        active: "C",
        sticky: ["A"]
      });
    });
    test("opening an already-visible session keeps its slot, only changes active", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      const visibleSessionsBeforeActivation = model.visibleSessions.get();
      model.setActive(A);
      const visibleSessionsAfterActivation = model.visibleSessions.get();
      assert.deepStrictEqual({
        ...snapshot(model, visibleSessionsAfterActivation),
        visibleSessionsReferencePreserved: visibleSessionsAfterActivation === visibleSessionsBeforeActivation
      }, {
        visible: ["A", "B"],
        active: "A",
        sticky: ["A"],
        visibleSessionsReferencePreserved: true
      });
    });
    test("setActive(undefined) replaces the active non-sticky slot with the empty slot", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.setActive(void 0);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", void 0],
        active: void 0,
        sticky: ["A"]
      });
    });
    test("setActive(undefined) is idempotent when the empty slot is already active", () => {
      const model = createModel();
      const A = stubSession("A");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(void 0);
      model.setActive(void 0);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", void 0],
        active: void 0,
        sticky: ["A"]
      });
    });
    test("setActive(undefined) when an empty slot already exists keeps it (no duplicate)", () => {
      const model = createModel();
      const A = stubSession("A");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(void 0);
      model.setActive(A);
      const visibleSessionsBeforeActivation = model.visibleSessions.get();
      model.setActive(void 0);
      const visibleSessionsAfterActivation = model.visibleSessions.get();
      assert.deepStrictEqual({
        ...snapshot(model, visibleSessionsAfterActivation),
        visibleSessionsReferencePreserved: visibleSessionsAfterActivation === visibleSessionsBeforeActivation
      }, {
        visible: ["A", void 0],
        active: void 0,
        sticky: ["A"],
        visibleSessionsReferencePreserved: true
      });
    });
    test("opening a real session while the empty slot is the only most-recent non-sticky replaces it", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(void 0);
      model.setActive(A);
      model.setActive(B);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B"],
        active: "B",
        sticky: ["A"]
      });
    });
  });
  suite("toggleStickiness", () => {
    test("toggling a visible non-sticky session sticky keeps its slot", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B"],
        active: "B",
        sticky: ["A", "B"]
      });
    });
    test("toggling a visible sticky session non-sticky keeps its slot", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(A);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B"],
        active: "B",
        sticky: []
      });
    });
    test("toggling a not-visible session sticky appends it at the end", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(B);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B"],
        active: "A",
        sticky: ["B"]
      });
    });
    test("after toggling a sticky session non-sticky, opening a new session replaces that newly-non-sticky", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      const D = stubSession("D");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.toggleStickiness(B);
      model.setActive(C);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "C"],
        active: "C",
        sticky: ["A"]
      });
      model.setActive(D);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "D"],
        active: "D",
        sticky: ["A"]
      });
    });
  });
  suite("insertAt", () => {
    test("inserts a not-yet-visible session to the left of a target as non-sticky and activates it", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.insertAt(C, "B", "left");
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "C", "B"],
        active: "C",
        sticky: ["A", "B"]
      });
    });
    test("inserts a not-yet-visible session to the right of a target as non-sticky and activates it", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.insertAt(C, "A", "right");
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "C", "B"],
        active: "C",
        sticky: ["A", "B"]
      });
    });
    test("moves an already-visible non-sticky session and preserves non-sticky state", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.insertAt(C, "A", "left");
      model.insertAt(C, "B", "right");
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B", "C"],
        active: "C",
        sticky: ["A"]
      });
    });
    test("moves an already-visible sticky session and preserves sticky state", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.setActive(C);
      model.toggleStickiness(C);
      model.insertAt(A, "C", "right");
      assert.deepStrictEqual(snapshot(model), {
        visible: ["B", "C", "A"],
        active: "A",
        sticky: ["B", "C", "A"]
      });
    });
    test("dropping a session to the right of its left neighbour is a no-op for layout but still activates it", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.insertAt(B, "A", "right");
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B"],
        active: "B",
        sticky: ["A", "B"]
      });
    });
    test("dropping a session to the left of its right neighbour is a no-op for layout but still activates it", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.insertAt(A, "B", "left");
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B"],
        active: "A",
        sticky: ["A", "B"]
      });
    });
    test("does not change the active session when activate is false", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.insertAt(C, "A", "right", false);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "C", "B"],
        active: "B",
        sticky: ["A", "B"]
      });
    });
    test("is a no-op when the target session is not visible", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.insertAt(C, B.sessionId, "left");
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A"],
        active: "A",
        sticky: ["A"]
      });
    });
    test("inserting a new session makes it the most-recent non-sticky for subsequent setActive", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      const D = stubSession("D");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.insertAt(C, "A", "right");
      model.setActive(A);
      model.setActive(D);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "D", "B"],
        active: "D",
        sticky: ["A", "B"]
      });
    });
    test("insertAt(undefined, ...) adds an empty slot at the requested position and activates it", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.insertAt(void 0, "A", "right");
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", void 0, "B"],
        active: void 0,
        sticky: ["A", "B"]
      });
    });
    test("insertAt(undefined, ...) is a no-op when the empty slot already exists", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.insertAt(void 0, "A", "right");
      model.setActive(B);
      model.insertAt(void 0, "B", "right");
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", void 0, "B"],
        active: "B",
        sticky: ["A", "B"]
      });
    });
  });
  suite("restoreGrid", () => {
    test("builds the grid in order with the correct active and sticky slots", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.restoreGrid([
        { session: A, sticky: true },
        { session: B, sticky: false },
        { session: C, sticky: false }
      ], 1);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B", "C"],
        active: "B",
        sticky: ["A"]
      });
    });
    test("restores the empty (new-session) slot as active", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.restoreGrid([
        { session: A, sticky: true },
        { session: B, sticky: false },
        { session: void 0, sticky: false }
      ], 2);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "B", void 0],
        active: void 0,
        sticky: ["A"]
      });
    });
    test("a later session can be inserted to the left of the empty slot without stealing active", () => {
      const model = createModel();
      const A = stubSession("A");
      model.restoreGrid([
        { session: void 0, sticky: false }
      ], 0);
      model.insertAt(A, void 0, "left", false);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", void 0],
        active: void 0,
        sticky: []
      });
    });
    test("replaces a previous transient state and disposes orphaned wrappers", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.restoreGrid([
        { session: B, sticky: false }
      ], 0);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["B"],
        active: "B",
        sticky: []
      });
    });
  });
  suite("updateSession", () => {
    test("is a no-op when the session is not visible", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const Bv2 = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.updateSession(B, Bv2);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A"],
        active: "A",
        sticky: ["A"]
      });
    });
    test("replaces a visible session with one having a new id, preserving slot and sticky state", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      const Bnew = stubSession("Bnew");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.setActive(C);
      model.updateSession(B, Bnew);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "Bnew", "C"],
        active: "C",
        sticky: ["A", "Bnew"]
      });
    });
    test("updates the active observable when the replaced session was active", () => {
      const model = createModel();
      const A = stubSession("A");
      const Anew = stubSession("Anew");
      model.setActive(A);
      model.updateSession(A, Anew);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["Anew"],
        active: "Anew",
        sticky: []
      });
    });
    test("replaces the wrapper even when the session id is unchanged", () => {
      const model = createModel();
      const A = stubSession("A");
      const Av2 = stubSession("A");
      model.setActive(A);
      const originalWrapper = model.activeSession.get();
      model.updateSession(A, Av2);
      const newWrapper = model.activeSession.get();
      assert.strictEqual(newWrapper?.sessionId, "A");
      assert.notStrictEqual(newWrapper, originalWrapper);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A"],
        active: "A",
        sticky: []
      });
    });
    test("preserves most-recent-non-sticky tracking so subsequent setActive replaces the updated slot", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const Bnew = stubSession("Bnew");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.setActive(A);
      model.updateSession(B, Bnew);
      model.setActive(C);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "C"],
        active: "C",
        sticky: ["A"]
      });
    });
  });
  suite("removeMany", () => {
    test("removing the active middle session falls back to its leftward neighbour", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.setActive(C);
      model.toggleStickiness(C);
      model.setActive(B);
      model.removeMany(["B"]);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "C"],
        active: "A",
        sticky: ["A", "C"]
      });
    });
    test("removing the active first session falls back to the new first slot", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.setActive(A);
      model.removeMany(["A"]);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["B"],
        active: "B",
        sticky: ["B"]
      });
    });
    test("removing the active last session falls back to its leftward neighbour", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.removeMany(["B"]);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A"],
        active: "A",
        sticky: ["A"]
      });
    });
    test("removing the only visible active session clears the active observable", () => {
      const model = createModel();
      const A = stubSession("A");
      model.setActive(A);
      model.removeMany(["A"]);
      assert.deepStrictEqual(snapshot(model), {
        visible: [],
        active: void 0,
        sticky: []
      });
    });
    test("removing the active session falls back to the empty slot when it is the leftward neighbour", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(void 0);
      model.insertAt(B, A.sessionId, "right");
      model.removeMany(["B"]);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", void 0],
        active: "A",
        sticky: ["A"]
      });
    });
    test("removing the active empty slot falls back to its leftward neighbour", () => {
      const model = createModel();
      const A = stubSession("A");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(void 0);
      model.removeMany([void 0]);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A"],
        active: "A",
        sticky: ["A"]
      });
    });
    test("removing a non-active session leaves the active session unchanged", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.setActive(C);
      model.toggleStickiness(C);
      model.removeMany(["B"]);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A", "C"],
        active: "C",
        sticky: ["A", "C"]
      });
    });
    test("removing the active session along with its leftward neighbour falls back further left", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      const C = stubSession("C");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.setActive(C);
      model.toggleStickiness(C);
      model.removeMany(["B", "C"]);
      assert.deepStrictEqual(snapshot(model), {
        visible: ["A"],
        active: "A",
        sticky: ["A"]
      });
    });
    test("removing all visible sessions including the active clears the active observable", () => {
      const model = createModel();
      const A = stubSession("A");
      const B = stubSession("B");
      model.setActive(A);
      model.toggleStickiness(A);
      model.setActive(B);
      model.toggleStickiness(B);
      model.removeMany(["A", "B"]);
      assert.deepStrictEqual(snapshot(model), {
        visible: [],
        active: void 0,
        sticky: []
      });
    });
  });
});
suite("VisibleSession - open/close chats", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function makeChat(id) {
    return { ...stubChat, resource: URI.parse(`test:///chat/${id}`), title: constObservable(id) };
  }
  function makeChatWith(id, interactivity) {
    return { ...makeChat(id), interactivity: constObservable(interactivity) };
  }
  function createSession(chats, initialClosedChatUris, initialActiveChat) {
    const chatsObs = observableValue("chats", chats);
    const base = stubSession("S");
    const session = { ...base, chats: chatsObs, mainChat: constObservable(chats[0]) };
    const visible = disposables.add(new VisibleSession(session, initialActiveChat ?? chats[0], initialClosedChatUris));
    const ids = (list) => list.map((c) => c.title.get());
    return { visible, chatsObs, ids };
  }
  function snapshot(visible, ids) {
    return {
      open: ids(visible.openChats.get()),
      closed: ids(visible.closedChats.get()),
      active: visible.activeChat.get().title.get()
    };
  }
  test("closing a non-main chat hides it from the tab strip and lists it as closed", () => {
    const [main, b] = [makeChat("main"), makeChat("b")];
    const { visible, ids } = createSession([main, b]);
    visible.setActiveChat(b);
    visible.closeChat(b);
    assert.deepStrictEqual(snapshot(visible, ids), {
      open: ["main"],
      closed: ["b"],
      active: "main"
      // active falls back to an open chat
    });
  });
  test("the main chat cannot be closed", () => {
    const [main, b] = [makeChat("main"), makeChat("b")];
    const { visible, ids } = createSession([main, b]);
    visible.closeChat(main);
    assert.deepStrictEqual(snapshot(visible, ids), {
      open: ["main", "b"],
      closed: [],
      active: "main"
    });
  });
  test("opening a closed chat restores it to the tab strip", () => {
    const [main, b] = [makeChat("main"), makeChat("b")];
    const { visible, ids } = createSession([main, b]);
    visible.closeChat(b);
    visible.openChat(b);
    assert.deepStrictEqual(snapshot(visible, ids), {
      open: ["main", "b"],
      closed: [],
      active: "main"
    });
  });
  test("deleting a closed chat drops it from the closed list", () => {
    const [main, b] = [makeChat("main"), makeChat("b")];
    const { visible, chatsObs, ids } = createSession([main, b]);
    visible.closeChat(b);
    chatsObs.set([main], void 0);
    assert.deepStrictEqual(snapshot(visible, ids), {
      open: ["main"],
      closed: [],
      active: "main"
    });
  });
  test("seeded closed chats are restored as hidden (persistence)", () => {
    const [main, b, c] = [makeChat("main"), makeChat("b"), makeChat("c")];
    const { visible, ids } = createSession([main, b, c], [b.resource.toString()]);
    assert.deepStrictEqual(snapshot(visible, ids), {
      open: ["main", "c"],
      closed: ["b"],
      active: "main"
    });
  });
  test("a seeded chat that is also the restored active chat stays open", () => {
    const [main, b] = [makeChat("main"), makeChat("b")];
    const { visible, ids } = createSession([main, b], [b.resource.toString()], b);
    assert.deepStrictEqual(snapshot(visible, ids), {
      open: ["main", "b"],
      closed: [],
      active: "b"
    });
  });
  test("a seeded main chat is never hidden even if persisted as closed", () => {
    const [main, b] = [makeChat("main"), makeChat("b")];
    const { visible, ids } = createSession([main, b], [main.resource.toString(), b.resource.toString()]);
    assert.deepStrictEqual(snapshot(visible, ids), {
      open: ["main"],
      closed: ["b"],
      active: "main"
    });
  });
  test("lastClosedChat returns the most recently closed chat regardless of creation order", () => {
    const [main, b, c] = [makeChat("main"), makeChat("b"), makeChat("c")];
    const { visible } = createSession([main, b, c]);
    visible.closeChat(c);
    visible.closeChat(b);
    assert.strictEqual(visible.lastClosedChat?.title.get(), "b");
  });
  test("lastClosedChat updates after reopening the last-closed chat", () => {
    const [main, b, c] = [makeChat("main"), makeChat("b"), makeChat("c")];
    const { visible } = createSession([main, b, c]);
    visible.closeChat(b);
    visible.closeChat(c);
    assert.strictEqual(visible.lastClosedChat?.title.get(), "c");
    visible.openChat(c);
    assert.strictEqual(visible.lastClosedChat?.title.get(), "b");
  });
  test("lastClosedChat returns undefined when no chats are closed", () => {
    const [main, b] = [makeChat("main"), makeChat("b")];
    const { visible } = createSession([main, b]);
    assert.strictEqual(visible.lastClosedChat, void 0);
  });
  test("lastClosedChat skips deleted chats and returns the next valid one", () => {
    const [main, b, c] = [makeChat("main"), makeChat("b"), makeChat("c")];
    const { visible, chatsObs } = createSession([main, b, c]);
    visible.closeChat(b);
    visible.closeChat(c);
    chatsObs.set([main, b], void 0);
    assert.strictEqual(visible.lastClosedChat?.title.get(), "b");
  });
  test("hidden chats are excluded from the tab strip but read-only chats are not", () => {
    const main = makeChatWith("main", ChatInteractivity.Full);
    const readOnly = makeChatWith("ro", ChatInteractivity.ReadOnly);
    const hidden = makeChatWith("hidden", ChatInteractivity.Hidden);
    const { visible, ids } = createSession([main, readOnly, hidden]);
    assert.deepStrictEqual(snapshot(visible, ids), {
      open: ["main", "ro"],
      closed: [],
      active: "main"
    });
  });
});
suite("VisibleSession - visibleChatTabs", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function makeChat(id, status = SessionStatus.Completed, origin) {
    return {
      ...stubChat,
      resource: URI.parse(`test:///chat/${id}`),
      title: constObservable(id),
      status: constObservable(status),
      origin: origin ? { kind: origin } : void 0
    };
  }
  function createSession(chats) {
    const base = stubSession("S");
    const session = { ...base, chats: constObservable(chats), mainChat: constObservable(chats[0]) };
    return disposables.add(new VisibleSession(session, chats[0]));
  }
  test("keeps provider order and hides tool-origin (subagent) chats by default", () => {
    const visible = createSession([
      makeChat("main"),
      makeChat("draft", SessionStatus.Untitled),
      makeChat("tool", SessionStatus.Completed, ChatOriginKind.Tool),
      makeChat("second")
    ]);
    assert.deepStrictEqual(visible.visibleChatTabs.get().map((c) => c.title.get()), ["main", "draft", "second"]);
  });
  test("surfaces a subagent tab once it is explicitly opened, and hides it again on close", () => {
    const chats = [
      makeChat("main"),
      makeChat("tool", SessionStatus.Completed, ChatOriginKind.Tool)
    ];
    const visible = createSession(chats);
    const tool = chats[1];
    visible.openChat(tool);
    const afterOpen = visible.visibleChatTabs.get().map((c) => c.title.get());
    visible.closeChat(tool);
    const afterClose = visible.visibleChatTabs.get().map((c) => c.title.get());
    assert.deepStrictEqual({ afterOpen, afterClose }, {
      afterOpen: ["main", "tool"],
      afterClose: ["main"]
    });
  });
  test("a closed subagent tab is not added to the reopenable closed chats", () => {
    const chats = [
      makeChat("main"),
      makeChat("tool", SessionStatus.Completed, ChatOriginKind.Tool)
    ];
    const visible = createSession(chats);
    const tool = chats[1];
    visible.openChat(tool);
    visible.closeChat(tool);
    assert.deepStrictEqual(visible.closedChats.get().map((c) => c.title.get()), []);
  });
  test("shows side-chat (`/btw`) origin chats in the ordinary tab strip", () => {
    const visible = createSession([
      makeChat("main"),
      makeChat("side", SessionStatus.Completed, ChatOriginKind.SideChat),
      makeChat("second")
    ]);
    assert.deepStrictEqual(visible.visibleChatTabs.get().map((c) => c.title.get()), ["main", "side", "second"]);
  });
});
suite("VisibleSession - shouldShowChatTabs", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function makeChat(id, title, origin) {
    return {
      ...stubChat,
      resource: URI.parse(`test:///chat/${id}`),
      title: constObservable(title),
      status: constObservable(SessionStatus.Completed),
      origin: origin ? { kind: origin } : void 0
    };
  }
  function createSession(sessionTitle, chats) {
    const base = stubSession("S");
    const session = { ...base, title: constObservable(sessionTitle), chats: constObservable(chats), mainChat: constObservable(chats[0]) };
    return disposables.add(new VisibleSession(session, chats[0]));
  }
  test("hidden for a single chat matching the session title", () => {
    const visible = createSession("Title", [makeChat("main", "Title")]);
    assert.strictEqual(visible.shouldShowChatTabs.get(), false);
  });
  test("hidden for a single chat even when its title diverged from the session title", () => {
    const visible = createSession("Session Title", [makeChat("main", "Chat Title")]);
    assert.strictEqual(visible.shouldShowChatTabs.get(), false);
  });
  test("shown for more than one chat even if a chat title matches the session title", () => {
    const visible = createSession("main", [makeChat("main", "main"), makeChat("second", "second")]);
    assert.strictEqual(visible.shouldShowChatTabs.get(), true);
  });
  test("hidden for a single non-tool chat matching the session title even when it has a subagent", () => {
    const visible = createSession("Title", [
      makeChat("main", "Title"),
      makeChat("tool", "tool", ChatOriginKind.Tool)
    ]);
    assert.strictEqual(visible.shouldShowChatTabs.get(), false);
  });
  test("shown once a subagent tab is explicitly opened (multiple visible tabs)", () => {
    const chats = [makeChat("main", "Title"), makeChat("tool", "tool", ChatOriginKind.Tool)];
    const visible = createSession("Title", chats);
    visible.openChat(chats[1]);
    assert.strictEqual(visible.shouldShowChatTabs.get(), true);
  });
  test("shown when a side chat exists alongside the main chat", () => {
    const visible = createSession("Title", [
      makeChat("main", "Title"),
      makeChat("side", "side", ChatOriginKind.SideChat)
    ]);
    assert.strictEqual(visible.shouldShowChatTabs.get(), true);
  });
  test("hidden when there are no tab chats", () => {
    const main = makeChat("main", "Title");
    const base = stubSession("S");
    const session = { ...base, title: constObservable("Title"), chats: constObservable([]), mainChat: constObservable(main) };
    const visible = disposables.add(new VisibleSession(session, main));
    assert.strictEqual(visible.shouldShowChatTabs.get(), false);
  });
  test("hidden after a non-main chat is closed back down to a single visible tab", () => {
    const main = makeChat("main", "Title");
    const second = makeChat("second", "second");
    const visible = createSession("Title", [main, second]);
    assert.strictEqual(visible.shouldShowChatTabs.get(), true);
    assert.strictEqual(visible.visibleChatTabs.get().length, 2);
    visible.closeChat(second);
    assert.deepStrictEqual({
      shouldShowChatTabs: visible.shouldShowChatTabs.get(),
      visibleChatTabs: visible.visibleChatTabs.get().map((c) => c.title.get())
    }, {
      shouldShowChatTabs: false,
      visibleChatTabs: ["Title"]
    });
  });
});
suite("VisibleSession - side chat tabs", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function makeChat(id, origin) {
    return {
      ...stubChat,
      resource: URI.parse(`test:///chat/${id}`),
      title: constObservable(id),
      status: constObservable(SessionStatus.Completed),
      origin: origin ? { kind: origin } : void 0
    };
  }
  function createSession(chats) {
    const base = stubSession("S");
    const chatsObs = observableValue("chats", chats);
    const session = { ...base, chats: chatsObs, mainChat: constObservable(chats[0]) };
    const visible = disposables.add(new VisibleSession(session, chats[0]));
    return { visible, chatsObs };
  }
  test("openChat keeps a side-chat origin chat available as a normal tab", () => {
    const chats = [makeChat("main"), makeChat("side", ChatOriginKind.SideChat)];
    const { visible } = createSession(chats);
    visible.openChat(chats[1]);
    assert.deepStrictEqual(visible.visibleChatTabs.get().map((c) => c.title.get()), ["main", "side"]);
  });
  test("closeChat hides a side-chat origin chat into the reopenable closed set", () => {
    const chats = [makeChat("main"), makeChat("side", ChatOriginKind.SideChat)];
    const { visible } = createSession(chats);
    visible.closeChat(chats[1]);
    assert.deepStrictEqual({
      visible: visible.visibleChatTabs.get().map((c) => c.title.get()),
      closed: visible.closedChats.get().map((c) => c.title.get())
    }, {
      visible: ["main"],
      closed: ["side"]
    });
  });
  test("the active-chat fallback can select a side chat like any other peer chat", () => {
    const main = makeChat("main");
    const second = makeChat("second");
    const side = makeChat("side", ChatOriginKind.SideChat);
    const { visible } = createSession([main, second, side]);
    visible.setActiveChat(second);
    visible.closeChat(second);
    assert.strictEqual(visible.activeChat.get(), side);
  });
});
suite("VisibleSessions - active chat removal fallback", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createModel() {
    const uriIdentity = new class extends mock() {
      constructor() {
        super(...arguments);
        this.extUri = extUriBiasedIgnorePathCase;
      }
    }();
    return disposables.add(new VisibleSessions(
      (session) => session.mainChat.get(),
      () => [],
      () => {
      },
      uriIdentity
    ));
  }
  function makeChat(id, origin) {
    return {
      ...stubChat,
      resource: URI.parse(`test:///chat/${id}`),
      title: constObservable(id),
      status: constObservable(SessionStatus.Completed),
      origin: origin ? { kind: origin } : void 0
    };
  }
  function createSession(chats) {
    const chatsObs = observableValue("chats", chats);
    const base = stubSession("S");
    const session = { ...base, chats: chatsObs, mainChat: constObservable(chats[0]) };
    return { session, chatsObs };
  }
  test("removing an active side chat falls back to the last visible tab, not an unopened tool chat", () => {
    const main = makeChat("main");
    const side = makeChat("side", ChatOriginKind.SideChat);
    const tool = makeChat("tool", ChatOriginKind.Tool);
    const { session, chatsObs } = createSession([main, side, tool]);
    const model = createModel();
    const visible = model.setActive(session);
    visible.setActiveChat(side);
    chatsObs.set([main, tool], void 0);
    assert.deepStrictEqual({
      active: visible.activeChat.get().title.get(),
      open: visible.openChats.get().map((c) => c.title.get()),
      visible: visible.visibleChatTabs.get().map((c) => c.title.get())
    }, {
      active: "main",
      open: ["main", "tool"],
      visible: ["main"]
    });
  });
  test("removing an active side chat can fall back to an explicitly opened tool tab", () => {
    const main = makeChat("main");
    const side = makeChat("side", ChatOriginKind.SideChat);
    const tool = makeChat("tool", ChatOriginKind.Tool);
    const { session, chatsObs } = createSession([main, side, tool]);
    const model = createModel();
    const visible = model.setActive(session);
    visible.openChat(tool);
    visible.setActiveChat(side);
    chatsObs.set([main, tool], void 0);
    assert.deepStrictEqual({
      active: visible.activeChat.get().title.get(),
      visible: visible.visibleChatTabs.get().map((c) => c.title.get())
    }, {
      active: "tool",
      visible: ["main", "tool"]
    });
  });
});
suite("VisibleSession - per-chat model/mode", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function makeChat(id, modelId, modeId) {
    return {
      ...stubChat,
      resource: URI.parse(`test:///chat/${id}`),
      title: constObservable(id),
      modelId: constObservable(modelId),
      mode: constObservable(modeId ? { id: modeId, kind: "agent" } : void 0)
    };
  }
  test("modelId and mode follow the active chat, not the session/default chat", () => {
    const first = makeChat("first", "model-1", "agent-1");
    const second = makeChat("second", "model-2", "agent-2");
    const base = stubSession("S");
    const session = { ...base, chats: constObservable([first, second]), mainChat: constObservable(first) };
    const visible = disposables.add(new VisibleSession(session, first));
    assert.deepStrictEqual(
      { modelId: visible.modelId.get(), mode: visible.mode.get() },
      { modelId: "model-1", mode: { id: "agent-1", kind: "agent" } }
    );
    visible.setActiveChat(second);
    assert.deepStrictEqual(
      { modelId: visible.modelId.get(), mode: visible.mode.get() },
      { modelId: "model-2", mode: { id: "agent-2", kind: "agent" } }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHNlc3Npb25zXFx0ZXN0XFxicm93c2VyXFx2aXNpYmxlU2Vzc2lvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFZpc2libGVTZXNzaW9uLCBWaXNpYmxlU2Vzc2lvbnMgfSBmcm9tICcuLi8uLi9icm93c2VyL3Zpc2libGVTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0SW50ZXJhY3Rpdml0eSwgQ2hhdE9yaWdpbktpbmQsIElDaGF0LCBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uLmpzJztcblxuY29uc3Qgc3R1YkNoYXQ6IElDaGF0ID0ge1xuXHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSxcblx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuXHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKCdDaGF0JyksXG5cdHVwZGF0ZWRBdDogY29uc3RPYnNlcnZhYmxlKG5ldyBEYXRlKCkpLFxuXHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZSgwKSxcblx0Y2hhbmdlczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0Y2hlY2twb2ludHM6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRtb2RlbElkOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0bW9kZTogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdGlzQXJjaGl2ZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdGlzUmVhZDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRpbnRlcmFjdGl2aXR5OiBjb25zdE9ic2VydmFibGUoQ2hhdEludGVyYWN0aXZpdHkuRnVsbCksXG5cdGRlc2NyaXB0aW9uOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0bGFzdFR1cm5FbmQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxufTtcblxuZnVuY3Rpb24gc3R1YlNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBJU2Vzc2lvbiB7XG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbklkLFxuXHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vLyR7c2Vzc2lvbklkfWApLFxuXHRcdHNlc3Npb25UeXBlOiAndGVzdCcsXG5cdFx0aWNvbjogQ29kaWNvbi52bSxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG5cdFx0d29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKHNlc3Npb25JZCksXG5cdFx0dXBkYXRlZEF0OiBjb25zdE9ic2VydmFibGUobmV3IERhdGUoKSksXG5cdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoMCksXG5cdFx0Y2hhbmdlc2V0czogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRjaGFuZ2VzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdG1vZGVsSWQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdG1vZGU6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGxvYWRpbmc6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRpc1JlYWQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRkZXNjcmlwdGlvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0bGFzdFR1cm5FbmQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW3N0dWJDaGF0XSksXG5cdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShzdHViQ2hhdCksXG5cdFx0Y2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlIH0pLFxuXHR9O1xufVxuXG5zdWl0ZSgnVmlzaWJsZVNlc3Npb25zJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9kZWwob25TbG90UmVwbGFjZWQ6IChyZXBsYWNlZDogSVNlc3Npb24sIGluZGV4OiBudW1iZXIsIHN0aWNreTogYm9vbGVhbiwgcmVwbGFjZWRCeVNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB2b2lkID0gKCkgPT4geyB9KSB7XG5cdFx0Y29uc3QgdXJpSWRlbnRpdHkgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZXh0VXJpID0gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2U7XG5cdFx0fTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVmlzaWJsZVNlc3Npb25zKFxuXHRcdFx0c2Vzc2lvbiA9PiBzZXNzaW9uLm1haW5DaGF0LmdldCgpLFxuXHRcdFx0KCkgPT4gW10sXG5cdFx0XHRvblNsb3RSZXBsYWNlZCxcblx0XHRcdHVyaUlkZW50aXR5LFxuXHRcdCkpO1xuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdGZ1bmN0aW9uIHNuYXBzaG90KG1vZGVsOiBWaXNpYmxlU2Vzc2lvbnMsIHZpc2libGUgPSBtb2RlbC52aXNpYmxlU2Vzc2lvbnMuZ2V0KCkpOiB7IHZpc2libGU6IChzdHJpbmcgfCB1bmRlZmluZWQpW107IGFjdGl2ZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBzdGlja3k6IHN0cmluZ1tdIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR2aXNpYmxlOiB2aXNpYmxlLm1hcChzID0+IHM/LnNlc3Npb25JZCksXG5cdFx0XHRhY3RpdmU6IG1vZGVsLmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCxcblx0XHRcdHN0aWNreTogdmlzaWJsZS5maWx0ZXIoKHMpOiBzIGlzIE5vbk51bGxhYmxlPHR5cGVvZiBzPiA9PiAhIXMgJiYgcy5zdGlja3kuZ2V0KCkpLm1hcChzID0+IHMuc2Vzc2lvbklkKSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZm9yd2FyZHMgR2l0IGF2YWlsYWJpbGl0eSB0aHJvdWdoIHZpc2libGUgYW5kIHJlc291cmNlLW92ZXJyaWRlIHdyYXBwZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhc0dpdFJlcG9zaXRvcnkgPSBvYnNlcnZhYmxlVmFsdWUoJ2hhc0dpdFJlcG9zaXRvcnknLCBmYWxzZSk7XG5cdFx0Y29uc3QgY29tcGxldGVkU3RhdGVJY29uID0gb2JzZXJ2YWJsZVZhbHVlKCdjb21wbGV0ZWRTdGF0ZUljb24nLCBDb2RpY29uLmdpdE1lcmdlKTtcblx0XHRjb25zdCBzZXNzaW9uID0geyAuLi5zdHViU2Vzc2lvbignQScpLCBjb21wbGV0ZWRTdGF0ZUljb24sIGhhc0dpdFJlcG9zaXRvcnkgfTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0bW9kZWwuc2V0QWN0aXZlKHNlc3Npb24pO1xuXHRcdGNvbnN0IHZpc2libGUgPSBtb2RlbC5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IHJlc291cmNlT3ZlcnJpZGUgPSBtb2RlbC51cGRhdGVSZXNvdXJjZU9mU2Vzc2lvbihzZXNzaW9uLCBVUkkucGFyc2UoJ3Rlc3Q6Ly8vb3ZlcnJpZGUnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHZpc2libGU6IHZpc2libGU/Lmhhc0dpdFJlcG9zaXRvcnkgPT09IGhhc0dpdFJlcG9zaXRvcnksXG5cdFx0XHRyZXNvdXJjZU92ZXJyaWRlOiByZXNvdXJjZU92ZXJyaWRlLmhhc0dpdFJlcG9zaXRvcnkgPT09IGhhc0dpdFJlcG9zaXRvcnksXG5cdFx0XHR2aXNpYmxlQ29tcGxldGVkU3RhdGVJY29uOiB2aXNpYmxlPy5jb21wbGV0ZWRTdGF0ZUljb24gPT09IGNvbXBsZXRlZFN0YXRlSWNvbixcblx0XHRcdHJlc291cmNlT3ZlcnJpZGVDb21wbGV0ZWRTdGF0ZUljb246IHJlc291cmNlT3ZlcnJpZGUuY29tcGxldGVkU3RhdGVJY29uID09PSBjb21wbGV0ZWRTdGF0ZUljb24sXG5cdFx0fSwge1xuXHRcdFx0dmlzaWJsZTogdHJ1ZSxcblx0XHRcdHJlc291cmNlT3ZlcnJpZGU6IHRydWUsXG5cdFx0XHR2aXNpYmxlQ29tcGxldGVkU3RhdGVJY29uOiB0cnVlLFxuXHRcdFx0cmVzb3VyY2VPdmVycmlkZUNvbXBsZXRlZFN0YXRlSWNvbjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NldEFjdGl2ZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ29wZW5pbmcgQiBhZnRlciBub24tc3RpY2t5IEEgcmVwbGFjZXMgQSBpbiBwbGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydCJ10sXG5cdFx0XHRcdGFjdGl2ZTogJ0InLFxuXHRcdFx0XHRzdGlja3k6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvcGVuaW5nIEIgd2hlbiBhY3RpdmUgQSBpcyBzdGlja3kgYXBwZW5kcyBCIChubyBvdGhlciBub24tc3RpY2t5KScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsICdCJ10sXG5cdFx0XHRcdGFjdGl2ZTogJ0InLFxuXHRcdFx0XHRzdGlja3k6IFsnQSddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvcGVuaW5nIEMgd2hlbiBhY3RpdmUgaXMgc3RpY2t5IGFuZCBhIG5vbi1zdGlja3kgZXhpc3RzIHJlcGxhY2VzIHRoZSBub24tc3RpY2t5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblx0XHRcdGNvbnN0IEMgPSBzdHViU2Vzc2lvbignQycpO1xuXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEEpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEIpOyAgICAgICAgICAgIC8vIHZpc2libGU6IFtBLCBCXSwgYWN0aXZlOiBCIChub24tc3RpY2t5KVxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpOyAgICAgICAgICAgIC8vIGFjdGl2ZSBmbGlwcyB0byBBIChzdGlja3kpOyBCIHJlbWFpbnMgbm9uLXN0aWNreVxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEMpOyAgICAgICAgICAgIC8vIGFjdGl2ZSBBIGlzIHN0aWNreSBcdTIxOTIgcmVwbGFjZSBtb3N0LXJlY2VudCBub24tc3RpY2t5IEJcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgJ0MnXSxcblx0XHRcdFx0YWN0aXZlOiAnQycsXG5cdFx0XHRcdHN0aWNreTogWydBJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29wZW5pbmcgRCB3aGVuIGFsbCB2aXNpYmxlIGFyZSBzdGlja3kgYXBwZW5kcyBEIGF0IHRoZSBlbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXHRcdFx0Y29uc3QgQyA9IHN0dWJTZXNzaW9uKCdDJyk7XG5cdFx0XHRjb25zdCBEID0gc3R1YlNlc3Npb24oJ0QnKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQik7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQyk7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEMpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnLCAnQicsICdDJywgJ0QnXSxcblx0XHRcdFx0YWN0aXZlOiAnRCcsXG5cdFx0XHRcdHN0aWNreTogWydBJywgJ0InLCAnQyddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvcGVucyB3aXRoIG11bHRpcGxlIG5vbi1zdGlja3kgc2Vzc2lvbnMgc2lkZSBieSBzaWRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblx0XHRcdGNvbnN0IEMgPSBzdHViU2Vzc2lvbignQycpO1xuXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEEpOyAgICAgLy8gW0FdIHN0aWNreTpbQV1cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTsgICAgICAgICAgICAvLyBbQSwgQl0gYWN0aXZlOkJcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTsgICAgICAgICAgICAvLyBbQSwgQl0gYWN0aXZlOkEgKHN0aWNreSlcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShDKTsgICAgICAgICAgICAvLyBhY3RpdmUgc3RpY2t5IFx1MjE5MiByZXBsYWNlIG5vbi1zdGlja3kgQiBcdTIxOTIgW0EsIENdXG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsICdDJ10sXG5cdFx0XHRcdGFjdGl2ZTogJ0MnLFxuXHRcdFx0XHRzdGlja3k6IFsnQSddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvcGVuaW5nIGFuIGFscmVhZHktdmlzaWJsZSBzZXNzaW9uIGtlZXBzIGl0cyBzbG90LCBvbmx5IGNoYW5nZXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTsgICAgIC8vIFtBXSBzdGlja3k6W0FdXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7ICAgICAgICAgICAgLy8gW0EsIEJdIGFjdGl2ZTpCXG5cdFx0XHRjb25zdCB2aXNpYmxlU2Vzc2lvbnNCZWZvcmVBY3RpdmF0aW9uID0gbW9kZWwudmlzaWJsZVNlc3Npb25zLmdldCgpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpOyAgICAgICAgICAgIC8vIFtBLCBCXSBhY3RpdmU6QSBcdTIwMTQgQSBrZWVwcyBpdHMgc2xvdFxuXHRcdFx0Y29uc3QgdmlzaWJsZVNlc3Npb25zQWZ0ZXJBY3RpdmF0aW9uID0gbW9kZWwudmlzaWJsZVNlc3Npb25zLmdldCgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Li4uc25hcHNob3QobW9kZWwsIHZpc2libGVTZXNzaW9uc0FmdGVyQWN0aXZhdGlvbiksXG5cdFx0XHRcdHZpc2libGVTZXNzaW9uc1JlZmVyZW5jZVByZXNlcnZlZDogdmlzaWJsZVNlc3Npb25zQWZ0ZXJBY3RpdmF0aW9uID09PSB2aXNpYmxlU2Vzc2lvbnNCZWZvcmVBY3RpdmF0aW9uLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnLCAnQiddLFxuXHRcdFx0XHRhY3RpdmU6ICdBJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnXSxcblx0XHRcdFx0dmlzaWJsZVNlc3Npb25zUmVmZXJlbmNlUHJlc2VydmVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRBY3RpdmUodW5kZWZpbmVkKSByZXBsYWNlcyB0aGUgYWN0aXZlIG5vbi1zdGlja3kgc2xvdCB3aXRoIHRoZSBlbXB0eSBzbG90JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTsgICAgICAgICAgICAvLyBbQSwgQl0gYWN0aXZlOkIsIHN0aWNreTpbQV1cblx0XHRcdG1vZGVsLnNldEFjdGl2ZSh1bmRlZmluZWQpOyAgICAvLyBhY3RpdmUgQiBpcyBub24tc3RpY2t5IFx1MjE5MiByZXBsYWNlZCBieSBlbXB0eSBzbG90XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsIHVuZGVmaW5lZF0sXG5cdFx0XHRcdGFjdGl2ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdGlja3k6IFsnQSddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRBY3RpdmUodW5kZWZpbmVkKSBpcyBpZGVtcG90ZW50IHdoZW4gdGhlIGVtcHR5IHNsb3QgaXMgYWxyZWFkeSBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTsgICAgIC8vIFtBXSBzdGlja3k6W0FdXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUodW5kZWZpbmVkKTsgICAgLy8gW0EsIHVuZGVmaW5lZF0gYWN0aXZlOnVuZGVmaW5lZFxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKHVuZGVmaW5lZCk7ICAgIC8vIG5vIHNlY29uZCBlbXB0eSBzbG90IGlzIGNyZWF0ZWRcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgdW5kZWZpbmVkXSxcblx0XHRcdFx0YWN0aXZlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0aWNreTogWydBJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NldEFjdGl2ZSh1bmRlZmluZWQpIHdoZW4gYW4gZW1wdHkgc2xvdCBhbHJlYWR5IGV4aXN0cyBrZWVwcyBpdCAobm8gZHVwbGljYXRlKScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEEpOyAgICAgLy8gW0FdIHN0aWNreTpbQV1cblx0XHRcdG1vZGVsLnNldEFjdGl2ZSh1bmRlZmluZWQpOyAgICAvLyBbQSwgdW5kZWZpbmVkXSBhY3RpdmU6dW5kZWZpbmVkIChlbXB0eSBzbG90KVxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpOyAgICAgICAgICAgIC8vIGFjdGl2ZSBmbGlwcyB0byBBIChzdGlja3kpOyBlbXB0eSBzbG90IHJlbWFpbnNcblx0XHRcdGNvbnN0IHZpc2libGVTZXNzaW9uc0JlZm9yZUFjdGl2YXRpb24gPSBtb2RlbC52aXNpYmxlU2Vzc2lvbnMuZ2V0KCk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUodW5kZWZpbmVkKTsgICAgLy8gYWN0aXZhdGVzIHRoZSBleGlzdGluZyBlbXB0eSBzbG90XG5cdFx0XHRjb25zdCB2aXNpYmxlU2Vzc2lvbnNBZnRlckFjdGl2YXRpb24gPSBtb2RlbC52aXNpYmxlU2Vzc2lvbnMuZ2V0KCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHQuLi5zbmFwc2hvdChtb2RlbCwgdmlzaWJsZVNlc3Npb25zQWZ0ZXJBY3RpdmF0aW9uKSxcblx0XHRcdFx0dmlzaWJsZVNlc3Npb25zUmVmZXJlbmNlUHJlc2VydmVkOiB2aXNpYmxlU2Vzc2lvbnNBZnRlckFjdGl2YXRpb24gPT09IHZpc2libGVTZXNzaW9uc0JlZm9yZUFjdGl2YXRpb24sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsIHVuZGVmaW5lZF0sXG5cdFx0XHRcdGFjdGl2ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdGlja3k6IFsnQSddLFxuXHRcdFx0XHR2aXNpYmxlU2Vzc2lvbnNSZWZlcmVuY2VQcmVzZXJ2ZWQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29wZW5pbmcgYSByZWFsIHNlc3Npb24gd2hpbGUgdGhlIGVtcHR5IHNsb3QgaXMgdGhlIG9ubHkgbW9zdC1yZWNlbnQgbm9uLXN0aWNreSByZXBsYWNlcyBpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7ICAgICAvLyBbQV0gc3RpY2t5OltBXVxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKHVuZGVmaW5lZCk7ICAgIC8vIFtBLCB1bmRlZmluZWRdIGFjdGl2ZTp1bmRlZmluZWRcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTsgICAgICAgICAgICAvLyBhY3RpdmUgZmxpcHMgdG8gQSAoc3RpY2t5KTsgZW1wdHkgc2xvdCByZW1haW5zXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7ICAgICAgICAgICAgLy8gYWN0aXZlIEEgaXMgc3RpY2t5IFx1MjE5MiByZXBsYWNlIG1vc3QtcmVjZW50IG5vbi1zdGlja3kgKGVtcHR5KVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnLCAnQiddLFxuXHRcdFx0XHRhY3RpdmU6ICdCJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndG9nZ2xlU3RpY2tpbmVzcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3RvZ2dsaW5nIGEgdmlzaWJsZSBub24tc3RpY2t5IHNlc3Npb24gc3RpY2t5IGtlZXBzIGl0cyBzbG90JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTsgICAgICAgICAgICAvLyBbQSwgQl0gYWN0aXZlOkJcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQik7ICAgICAvLyBCIHN0YXlzIGluIGl0cyBzbG90LCBiZWNvbWVzIHN0aWNreVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnLCAnQiddLFxuXHRcdFx0XHRhY3RpdmU6ICdCJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnLCAnQiddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b2dnbGluZyBhIHZpc2libGUgc3RpY2t5IHNlc3Npb24gbm9uLXN0aWNreSBrZWVwcyBpdHMgc2xvdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7ICAgICAvLyBbQV0gc3RpY2t5OltBXVxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEIpOyAgICAgICAgICAgIC8vIFtBLCBCXSBhY3RpdmU6QlxuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTsgICAgIC8vIEEgc3RheXMgaW4gaXRzIHNsb3QsIGJlY29tZXMgbm9uLXN0aWNreVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnLCAnQiddLFxuXHRcdFx0XHRhY3RpdmU6ICdCJyxcblx0XHRcdFx0c3RpY2t5OiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9nZ2xpbmcgYSBub3QtdmlzaWJsZSBzZXNzaW9uIHN0aWNreSBhcHBlbmRzIGl0IGF0IHRoZSBlbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7ICAgICAgICAgICAgLy8gW0FdXG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpOyAgICAgLy8gQiBub3QgdmlzaWJsZSBcdTIxOTIgYXBwZW5kIGFzIHN0aWNreVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnLCAnQiddLFxuXHRcdFx0XHRhY3RpdmU6ICdBJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0InXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWZ0ZXIgdG9nZ2xpbmcgYSBzdGlja3kgc2Vzc2lvbiBub24tc3RpY2t5LCBvcGVuaW5nIGEgbmV3IHNlc3Npb24gcmVwbGFjZXMgdGhhdCBuZXdseS1ub24tc3RpY2t5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblx0XHRcdGNvbnN0IEMgPSBzdHViU2Vzc2lvbignQycpO1xuXHRcdFx0Y29uc3QgRCA9IHN0dWJTZXNzaW9uKCdEJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpOyAgICAgLy8gW0EsIEJdIHN0aWNreTpbQSwgQl0gYWN0aXZlOkJcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQik7ICAgICAvLyBCIGJlY29tZXMgdGhlIChvbmx5KSBub24tc3RpY2t5IFx1MjE5MiBtb3N0LXJlY2VudFxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEMpOyAgICAgICAgICAgIC8vIGFjdGl2ZSBCIGlzIG5vbi1zdGlja3kgXHUyMTkyIHJlcGxhY2VzIEIgaW4gcGxhY2VcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgJ0MnXSxcblx0XHRcdFx0YWN0aXZlOiAnQycsXG5cdFx0XHRcdHN0aWNreTogWydBJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gT3BlbiBEIHdoaWxlIGFjdGl2ZSBDIGlzIG5vbi1zdGlja3kgXHUyMTkyIHJlcGxhY2VzIENcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShEKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsICdEJ10sXG5cdFx0XHRcdGFjdGl2ZTogJ0QnLFxuXHRcdFx0XHRzdGlja3k6IFsnQSddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpbnNlcnRBdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2luc2VydHMgYSBub3QteWV0LXZpc2libGUgc2Vzc2lvbiB0byB0aGUgbGVmdCBvZiBhIHRhcmdldCBhcyBub24tc3RpY2t5IGFuZCBhY3RpdmF0ZXMgaXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXHRcdFx0Y29uc3QgQyA9IHN0dWJTZXNzaW9uKCdDJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpOyAgICAgLy8gdmlzaWJsZTogW0EsIEJdIHN0aWNreTpbQSwgQl1cblx0XHRcdG1vZGVsLmluc2VydEF0KEMsICdCJywgJ2xlZnQnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgJ0MnLCAnQiddLFxuXHRcdFx0XHRhY3RpdmU6ICdDJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnLCAnQiddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNlcnRzIGEgbm90LXlldC12aXNpYmxlIHNlc3Npb24gdG8gdGhlIHJpZ2h0IG9mIGEgdGFyZ2V0IGFzIG5vbi1zdGlja3kgYW5kIGFjdGl2YXRlcyBpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cdFx0XHRjb25zdCBDID0gc3R1YlNlc3Npb24oJ0MnKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQik7ICAgICAvLyB2aXNpYmxlOiBbQSwgQl1cblx0XHRcdG1vZGVsLmluc2VydEF0KEMsICdBJywgJ3JpZ2h0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsICdDJywgJ0InXSxcblx0XHRcdFx0YWN0aXZlOiAnQycsXG5cdFx0XHRcdHN0aWNreTogWydBJywgJ0InXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW92ZXMgYW4gYWxyZWFkeS12aXNpYmxlIG5vbi1zdGlja3kgc2Vzc2lvbiBhbmQgcHJlc2VydmVzIG5vbi1zdGlja3kgc3RhdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXHRcdFx0Y29uc3QgQyA9IHN0dWJTZXNzaW9uKCdDJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7ICAgICAgICAgICAgLy8gW0EsIEJdIG5vbi1zdGlja3k6W0JdXG5cdFx0XHRtb2RlbC5pbnNlcnRBdChDLCAnQScsICdsZWZ0Jyk7IC8vIFtDLCBBLCBCXSBub24tc3RpY2t5OltDLCBCXVxuXHRcdFx0bW9kZWwuaW5zZXJ0QXQoQywgJ0InLCAncmlnaHQnKTsgLy8gbW92ZSBDIHRvIGVuZFxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnLCAnQicsICdDJ10sXG5cdFx0XHRcdGFjdGl2ZTogJ0MnLFxuXHRcdFx0XHRzdGlja3k6IFsnQSddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb3ZlcyBhbiBhbHJlYWR5LXZpc2libGUgc3RpY2t5IHNlc3Npb24gYW5kIHByZXNlcnZlcyBzdGlja3kgc3RhdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXHRcdFx0Y29uc3QgQyA9IHN0dWJTZXNzaW9uKCdDJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEMpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhDKTsgICAgIC8vIFtBLCBCLCBDXSBzdGlja3k6W0EsIEIsIENdXG5cdFx0XHRtb2RlbC5pbnNlcnRBdChBLCAnQycsICdyaWdodCcpOyAvLyBtb3ZlIEEgdG8gZW5kLCBzdGF5cyBzdGlja3lcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydCJywgJ0MnLCAnQSddLFxuXHRcdFx0XHRhY3RpdmU6ICdBJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0InLCAnQycsICdBJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BwaW5nIGEgc2Vzc2lvbiB0byB0aGUgcmlnaHQgb2YgaXRzIGxlZnQgbmVpZ2hib3VyIGlzIGEgbm8tb3AgZm9yIGxheW91dCBidXQgc3RpbGwgYWN0aXZhdGVzIGl0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQik7ICAgICAvLyBbQSwgQl1cblx0XHRcdG1vZGVsLmluc2VydEF0KEIsICdBJywgJ3JpZ2h0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsICdCJ10sXG5cdFx0XHRcdGFjdGl2ZTogJ0InLFxuXHRcdFx0XHRzdGlja3k6IFsnQScsICdCJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BwaW5nIGEgc2Vzc2lvbiB0byB0aGUgbGVmdCBvZiBpdHMgcmlnaHQgbmVpZ2hib3VyIGlzIGEgbm8tb3AgZm9yIGxheW91dCBidXQgc3RpbGwgYWN0aXZhdGVzIGl0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQik7ICAgICAvLyBbQSwgQl1cblx0XHRcdG1vZGVsLmluc2VydEF0KEEsICdCJywgJ2xlZnQnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgJ0InXSxcblx0XHRcdFx0YWN0aXZlOiAnQScsXG5cdFx0XHRcdHN0aWNreTogWydBJywgJ0InXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY2hhbmdlIHRoZSBhY3RpdmUgc2Vzc2lvbiB3aGVuIGFjdGl2YXRlIGlzIGZhbHNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblx0XHRcdGNvbnN0IEMgPSBzdHViU2Vzc2lvbignQycpO1xuXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEEpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEIpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhCKTsgICAgIC8vIFtBLCBCXSBhY3RpdmU6QlxuXHRcdFx0bW9kZWwuaW5zZXJ0QXQoQywgJ0EnLCAncmlnaHQnLCBmYWxzZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsICdDJywgJ0InXSxcblx0XHRcdFx0YWN0aXZlOiAnQicsXG5cdFx0XHRcdHN0aWNreTogWydBJywgJ0InXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXMgYSBuby1vcCB3aGVuIHRoZSB0YXJnZXQgc2Vzc2lvbiBpcyBub3QgdmlzaWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cdFx0XHRjb25zdCBDID0gc3R1YlNlc3Npb24oJ0MnKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTsgICAgIC8vIFtBXVxuXHRcdFx0bW9kZWwuaW5zZXJ0QXQoQywgQi5zZXNzaW9uSWQsICdsZWZ0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQSddLFxuXHRcdFx0XHRhY3RpdmU6ICdBJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zZXJ0aW5nIGEgbmV3IHNlc3Npb24gbWFrZXMgaXQgdGhlIG1vc3QtcmVjZW50IG5vbi1zdGlja3kgZm9yIHN1YnNlcXVlbnQgc2V0QWN0aXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblx0XHRcdGNvbnN0IEMgPSBzdHViU2Vzc2lvbignQycpO1xuXHRcdFx0Y29uc3QgRCA9IHN0dWJTZXNzaW9uKCdEJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpOyAgICAgLy8gW0EsIEJdIHN0aWNreTpbQSwgQl1cblx0XHRcdG1vZGVsLmluc2VydEF0KEMsICdBJywgJ3JpZ2h0Jyk7IC8vIFtBLCBDLCBCXSBub24tc3RpY2t5OltDXVxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpOyAgICAgICAgICAgIC8vIGFjdGl2ZSBzdGlja3kgXHUyMTkyIG5vIGdyaWQgY2hhbmdlXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoRCk7ICAgICAgICAgICAgLy8gYWN0aXZlIHN0aWNreSBcdTIxOTIgcmVwbGFjZSBtb3N0LXJlY2VudCBub24tc3RpY2t5IENcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgJ0QnLCAnQiddLFxuXHRcdFx0XHRhY3RpdmU6ICdEJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnLCAnQiddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNlcnRBdCh1bmRlZmluZWQsIC4uLikgYWRkcyBhbiBlbXB0eSBzbG90IGF0IHRoZSByZXF1ZXN0ZWQgcG9zaXRpb24gYW5kIGFjdGl2YXRlcyBpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpOyAgICAgLy8gW0EsIEJdIHN0aWNreTpbQSwgQl1cblx0XHRcdG1vZGVsLmluc2VydEF0KHVuZGVmaW5lZCwgJ0EnLCAncmlnaHQnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgdW5kZWZpbmVkLCAnQiddLFxuXHRcdFx0XHRhY3RpdmU6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnLCAnQiddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNlcnRBdCh1bmRlZmluZWQsIC4uLikgaXMgYSBuby1vcCB3aGVuIHRoZSBlbXB0eSBzbG90IGFscmVhZHkgZXhpc3RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQik7ICAgICAvLyBbQSwgQl0gc3RpY2t5OltBLCBCXVxuXHRcdFx0bW9kZWwuaW5zZXJ0QXQodW5kZWZpbmVkLCAnQScsICdyaWdodCcpOyAvLyBbQSwgdW5kZWZpbmVkLCBCXSBhY3RpdmUgYmVjb21lcyBlbXB0eSBzbG90XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7ICAgICAgICAgICAgICAgICAgICAgICAvLyByZS1hY3RpdmF0ZSBCXG5cdFx0XHRtb2RlbC5pbnNlcnRBdCh1bmRlZmluZWQsICdCJywgJ3JpZ2h0Jyk7IC8vIG5vLW9wIFx1MjAxNCBlbXB0eSBzbG90IGFscmVhZHkgZXhpc3RzXG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsIHVuZGVmaW5lZCwgJ0InXSxcblx0XHRcdFx0YWN0aXZlOiAnQicsXG5cdFx0XHRcdHN0aWNreTogWydBJywgJ0InXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzdG9yZUdyaWQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdidWlsZHMgdGhlIGdyaWQgaW4gb3JkZXIgd2l0aCB0aGUgY29ycmVjdCBhY3RpdmUgYW5kIHN0aWNreSBzbG90cycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cdFx0XHRjb25zdCBDID0gc3R1YlNlc3Npb24oJ0MnKTtcblxuXHRcdFx0bW9kZWwucmVzdG9yZUdyaWQoW1xuXHRcdFx0XHR7IHNlc3Npb246IEEsIHN0aWNreTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHNlc3Npb246IEIsIHN0aWNreTogZmFsc2UgfSxcblx0XHRcdFx0eyBzZXNzaW9uOiBDLCBzdGlja3k6IGZhbHNlIH0sXG5cdFx0XHRdLCAxKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgJ0InLCAnQyddLFxuXHRcdFx0XHRhY3RpdmU6ICdCJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgdGhlIGVtcHR5IChuZXctc2Vzc2lvbikgc2xvdCBhcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXG5cdFx0XHRtb2RlbC5yZXN0b3JlR3JpZChbXG5cdFx0XHRcdHsgc2Vzc2lvbjogQSwgc3RpY2t5OiB0cnVlIH0sXG5cdFx0XHRcdHsgc2Vzc2lvbjogQiwgc3RpY2t5OiBmYWxzZSB9LFxuXHRcdFx0XHR7IHNlc3Npb246IHVuZGVmaW5lZCwgc3RpY2t5OiBmYWxzZSB9LFxuXHRcdFx0XSwgMik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsICdCJywgdW5kZWZpbmVkXSxcblx0XHRcdFx0YWN0aXZlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0aWNreTogWydBJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgbGF0ZXIgc2Vzc2lvbiBjYW4gYmUgaW5zZXJ0ZWQgdG8gdGhlIGxlZnQgb2YgdGhlIGVtcHR5IHNsb3Qgd2l0aG91dCBzdGVhbGluZyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblxuXHRcdFx0Ly8gT25seSB0aGUgZW1wdHkgc2xvdCBpcyBhdmFpbGFibGUgaW5pdGlhbGx5IGFuZCBpdCBpcyBhY3RpdmUuXG5cdFx0XHRtb2RlbC5yZXN0b3JlR3JpZChbXG5cdFx0XHRcdHsgc2Vzc2lvbjogdW5kZWZpbmVkLCBzdGlja3k6IGZhbHNlIH0sXG5cdFx0XHRdLCAwKTtcblxuXHRcdFx0Ly8gQSBiZWNvbWVzIGF2YWlsYWJsZSBsYXRlciBhbmQgaXMgYW5jaG9yZWQgdG8gdGhlIGxlZnQgb2YgdGhlIGVtcHR5IHNsb3QuXG5cdFx0XHRtb2RlbC5pbnNlcnRBdChBLCB1bmRlZmluZWQsICdsZWZ0JywgZmFsc2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnLCB1bmRlZmluZWRdLFxuXHRcdFx0XHRhY3RpdmU6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RpY2t5OiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwbGFjZXMgYSBwcmV2aW91cyB0cmFuc2llbnQgc3RhdGUgYW5kIGRpc3Bvc2VzIG9ycGhhbmVkIHdyYXBwZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblxuXHRcdFx0Ly8gVHJhbnNpZW50IHN0YXRlOiBhIGZyZXNoIHNlc3Npb24gaXMgc2hvd24uXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7XG5cblx0XHRcdC8vIFJlc3RvcmUgb3ZlcnJpZGVzIGl0IGVudGlyZWx5IHdpdGggdGhlIHBlcnNpc3RlZCBncmlkLlxuXHRcdFx0bW9kZWwucmVzdG9yZUdyaWQoW1xuXHRcdFx0XHR7IHNlc3Npb246IEIsIHN0aWNreTogZmFsc2UgfSxcblx0XHRcdF0sIDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0InXSxcblx0XHRcdFx0YWN0aXZlOiAnQicsXG5cdFx0XHRcdHN0aWNreTogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3VwZGF0ZVNlc3Npb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdpcyBhIG5vLW9wIHdoZW4gdGhlIHNlc3Npb24gaXMgbm90IHZpc2libGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXHRcdFx0Y29uc3QgQnYyID0gc3R1YlNlc3Npb24oJ0InKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTsgICAgIC8vIFtBXSBzdGlja3k6W0FdXG5cdFx0XHRtb2RlbC51cGRhdGVTZXNzaW9uKEIsIEJ2Mik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQSddLFxuXHRcdFx0XHRhY3RpdmU6ICdBJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwbGFjZXMgYSB2aXNpYmxlIHNlc3Npb24gd2l0aCBvbmUgaGF2aW5nIGEgbmV3IGlkLCBwcmVzZXJ2aW5nIHNsb3QgYW5kIHN0aWNreSBzdGF0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cdFx0XHRjb25zdCBDID0gc3R1YlNlc3Npb24oJ0MnKTtcblx0XHRcdGNvbnN0IEJuZXcgPSBzdHViU2Vzc2lvbignQm5ldycpO1xuXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEEpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEIpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhCKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShDKTsgICAgICAgICAgICAvLyBbQSwgQiwgQ10gc3RpY2t5OltBLCBCXSBhY3RpdmU6Q1xuXHRcdFx0bW9kZWwudXBkYXRlU2Vzc2lvbihCLCBCbmV3KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgJ0JuZXcnLCAnQyddLFxuXHRcdFx0XHRhY3RpdmU6ICdDJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnLCAnQm5ldyddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIHRoZSBhY3RpdmUgb2JzZXJ2YWJsZSB3aGVuIHRoZSByZXBsYWNlZCBzZXNzaW9uIHdhcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEFuZXcgPSBzdHViU2Vzc2lvbignQW5ldycpO1xuXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7ICAgICAgICAgICAgLy8gW0FdIGFjdGl2ZTpBXG5cdFx0XHRtb2RlbC51cGRhdGVTZXNzaW9uKEEsIEFuZXcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0FuZXcnXSxcblx0XHRcdFx0YWN0aXZlOiAnQW5ldycsXG5cdFx0XHRcdHN0aWNreTogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcGxhY2VzIHRoZSB3cmFwcGVyIGV2ZW4gd2hlbiB0aGUgc2Vzc2lvbiBpZCBpcyB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEF2MiA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsV3JhcHBlciA9IG1vZGVsLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cblx0XHRcdG1vZGVsLnVwZGF0ZVNlc3Npb24oQSwgQXYyKTtcblxuXHRcdFx0Y29uc3QgbmV3V3JhcHBlciA9IG1vZGVsLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3V3JhcHBlcj8uc2Vzc2lvbklkLCAnQScpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKG5ld1dyYXBwZXIsIG9yaWdpbmFsV3JhcHBlcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnXSxcblx0XHRcdFx0YWN0aXZlOiAnQScsXG5cdFx0XHRcdHN0aWNreTogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBtb3N0LXJlY2VudC1ub24tc3RpY2t5IHRyYWNraW5nIHNvIHN1YnNlcXVlbnQgc2V0QWN0aXZlIHJlcGxhY2VzIHRoZSB1cGRhdGVkIHNsb3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXHRcdFx0Y29uc3QgQm5ldyA9IHN0dWJTZXNzaW9uKCdCbmV3Jyk7XG5cdFx0XHRjb25zdCBDID0gc3R1YlNlc3Npb24oJ0MnKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShCKTsgICAgICAgICAgICAvLyBbQSwgQl0gc3RpY2t5OltBXSBhY3RpdmU6QiAobm9uLXN0aWNreSwgbW9zdC1yZWNlbnQpXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7ICAgICAgICAgICAgLy8gYWN0aXZlIGZsaXBzIHRvIEEgKHN0aWNreSk7IEIgcmVtYWlucyBtb3N0LXJlY2VudCBub24tc3RpY2t5XG5cdFx0XHRtb2RlbC51cGRhdGVTZXNzaW9uKEIsIEJuZXcpOyAgLy8gW0EsIEJuZXddIHN0aWNreTpbQV1cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShDKTsgICAgICAgICAgICAvLyBhY3RpdmUgQSBzdGlja3kgXHUyMTkyIHJlcGxhY2UgbW9zdC1yZWNlbnQgbm9uLXN0aWNreSBCbmV3XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsICdDJ10sXG5cdFx0XHRcdGFjdGl2ZTogJ0MnLFxuXHRcdFx0XHRzdGlja3k6IFsnQSddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZW1vdmVNYW55JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVtb3ZpbmcgdGhlIGFjdGl2ZSBtaWRkbGUgc2Vzc2lvbiBmYWxscyBiYWNrIHRvIGl0cyBsZWZ0d2FyZCBuZWlnaGJvdXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXHRcdFx0Y29uc3QgQyA9IHN0dWJTZXNzaW9uKCdDJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEMpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhDKTsgICAgIC8vIFtBLCBCLCBDXSBzdGlja3k6W0EsIEIsIENdIGFjdGl2ZTpDXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7ICAgICAgICAgICAgLy8gYWN0aXZlIGZsaXBzIHRvIEIgKHN0aWNreSksIGtlZXBzIHNsb3Rcblx0XHRcdG1vZGVsLnJlbW92ZU1hbnkoWydCJ10pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnLCAnQyddLFxuXHRcdFx0XHRhY3RpdmU6ICdBJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnLCAnQyddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmluZyB0aGUgYWN0aXZlIGZpcnN0IHNlc3Npb24gZmFsbHMgYmFjayB0byB0aGUgbmV3IGZpcnN0IHNsb3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEEpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEIpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhCKTsgICAgIC8vIFtBLCBCXSBzdGlja3k6W0EsIEJdIGFjdGl2ZTpCXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7ICAgICAgICAgICAgLy8gYWN0aXZlIEEgKHN0aWNreSksIGtlZXBzIHNsb3Rcblx0XHRcdG1vZGVsLnJlbW92ZU1hbnkoWydBJ10pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0InXSxcblx0XHRcdFx0YWN0aXZlOiAnQicsXG5cdFx0XHRcdHN0aWNreTogWydCJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92aW5nIHRoZSBhY3RpdmUgbGFzdCBzZXNzaW9uIGZhbGxzIGJhY2sgdG8gaXRzIGxlZnR3YXJkIG5laWdoYm91cicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpOyAgICAgLy8gW0EsIEJdIHN0aWNreTpbQSwgQl0gYWN0aXZlOkJcblxuXHRcdFx0bW9kZWwucmVtb3ZlTWFueShbJ0InXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQSddLFxuXHRcdFx0XHRhY3RpdmU6ICdBJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZpbmcgdGhlIG9ubHkgdmlzaWJsZSBhY3RpdmUgc2Vzc2lvbiBjbGVhcnMgdGhlIGFjdGl2ZSBvYnNlcnZhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTsgICAgICAgICAgICAvLyBbQV0gYWN0aXZlOkFcblx0XHRcdG1vZGVsLnJlbW92ZU1hbnkoWydBJ10pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbXSxcblx0XHRcdFx0YWN0aXZlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0aWNreTogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92aW5nIHRoZSBhY3RpdmUgc2Vzc2lvbiBmYWxscyBiYWNrIHRvIHRoZSBlbXB0eSBzbG90IHdoZW4gaXQgaXMgdGhlIGxlZnR3YXJkIG5laWdoYm91cicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7ICAgICAvLyBbQV0gc3RpY2t5OltBXVxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKHVuZGVmaW5lZCk7ICAgIC8vIFtBLCB1bmRlZmluZWRdIGFjdGl2ZTp1bmRlZmluZWRcblx0XHRcdG1vZGVsLmluc2VydEF0KEIsIEEuc2Vzc2lvbklkLCAncmlnaHQnKTsgLy8gW0EsIEIsIHVuZGVmaW5lZF0gYWN0aXZlOkIgKG5vbi1zdGlja3kpXG5cdFx0XHRtb2RlbC5yZW1vdmVNYW55KFsnQiddKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJywgdW5kZWZpbmVkXSxcblx0XHRcdFx0YWN0aXZlOiAnQScsXG5cdFx0XHRcdHN0aWNreTogWydBJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92aW5nIHRoZSBhY3RpdmUgZW1wdHkgc2xvdCBmYWxscyBiYWNrIHRvIGl0cyBsZWZ0d2FyZCBuZWlnaGJvdXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblxuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEEpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhBKTsgICAgIC8vIFtBXSBzdGlja3k6W0FdXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUodW5kZWZpbmVkKTsgICAgLy8gW0EsIHVuZGVmaW5lZF0gYWN0aXZlOnVuZGVmaW5lZCAoZW1wdHkgc2xvdClcblx0XHRcdG1vZGVsLnJlbW92ZU1hbnkoW3VuZGVmaW5lZF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KG1vZGVsKSwge1xuXHRcdFx0XHR2aXNpYmxlOiBbJ0EnXSxcblx0XHRcdFx0YWN0aXZlOiAnQScsXG5cdFx0XHRcdHN0aWNreTogWydBJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92aW5nIGEgbm9uLWFjdGl2ZSBzZXNzaW9uIGxlYXZlcyB0aGUgYWN0aXZlIHNlc3Npb24gdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFx0Y29uc3QgQSA9IHN0dWJTZXNzaW9uKCdBJyk7XG5cdFx0XHRjb25zdCBCID0gc3R1YlNlc3Npb24oJ0InKTtcblx0XHRcdGNvbnN0IEMgPSBzdHViU2Vzc2lvbignQycpO1xuXG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQSk7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEEpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEIpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhCKTtcblx0XHRcdG1vZGVsLnNldEFjdGl2ZShDKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQyk7ICAgICAvLyBbQSwgQiwgQ10gc3RpY2t5OltBLCBCLCBDXSBhY3RpdmU6Q1xuXHRcdFx0bW9kZWwucmVtb3ZlTWFueShbJ0InXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQScsICdDJ10sXG5cdFx0XHRcdGFjdGl2ZTogJ0MnLFxuXHRcdFx0XHRzdGlja3k6IFsnQScsICdDJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92aW5nIHRoZSBhY3RpdmUgc2Vzc2lvbiBhbG9uZyB3aXRoIGl0cyBsZWZ0d2FyZCBuZWlnaGJvdXIgZmFsbHMgYmFjayBmdXJ0aGVyIGxlZnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0XHRjb25zdCBBID0gc3R1YlNlc3Npb24oJ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBzdHViU2Vzc2lvbignQicpO1xuXHRcdFx0Y29uc3QgQyA9IHN0dWJTZXNzaW9uKCdDJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpO1xuXHRcdFx0bW9kZWwuc2V0QWN0aXZlKEMpO1xuXHRcdFx0bW9kZWwudG9nZ2xlU3RpY2tpbmVzcyhDKTsgICAgIC8vIFtBLCBCLCBDXSBzdGlja3k6W0EsIEIsIENdIGFjdGl2ZTpDXG5cblx0XHRcdG1vZGVsLnJlbW92ZU1hbnkoWydCJywgJ0MnXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QobW9kZWwpLCB7XG5cdFx0XHRcdHZpc2libGU6IFsnQSddLFxuXHRcdFx0XHRhY3RpdmU6ICdBJyxcblx0XHRcdFx0c3RpY2t5OiBbJ0EnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZpbmcgYWxsIHZpc2libGUgc2Vzc2lvbnMgaW5jbHVkaW5nIHRoZSBhY3RpdmUgY2xlYXJzIHRoZSBhY3RpdmUgb2JzZXJ2YWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRcdGNvbnN0IEEgPSBzdHViU2Vzc2lvbignQScpO1xuXHRcdFx0Y29uc3QgQiA9IHN0dWJTZXNzaW9uKCdCJyk7XG5cblx0XHRcdG1vZGVsLnNldEFjdGl2ZShBKTtcblx0XHRcdG1vZGVsLnRvZ2dsZVN0aWNraW5lc3MoQSk7XG5cdFx0XHRtb2RlbC5zZXRBY3RpdmUoQik7XG5cdFx0XHRtb2RlbC50b2dnbGVTdGlja2luZXNzKEIpOyAgICAgLy8gW0EsIEJdIHN0aWNreTpbQSwgQl0gYWN0aXZlOkJcblxuXHRcdFx0bW9kZWwucmVtb3ZlTWFueShbJ0EnLCAnQiddKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChtb2RlbCksIHtcblx0XHRcdFx0dmlzaWJsZTogW10sXG5cdFx0XHRcdGFjdGl2ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdGlja3k6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdWaXNpYmxlU2Vzc2lvbiAtIG9wZW4vY2xvc2UgY2hhdHMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBtYWtlQ2hhdChpZDogc3RyaW5nKTogSUNoYXQge1xuXHRcdHJldHVybiB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vL2NoYXQvJHtpZH1gKSwgdGl0bGU6IGNvbnN0T2JzZXJ2YWJsZShpZCkgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VDaGF0V2l0aChpZDogc3RyaW5nLCBpbnRlcmFjdGl2aXR5OiBDaGF0SW50ZXJhY3Rpdml0eSk6IElDaGF0IHtcblx0XHRyZXR1cm4geyAuLi5tYWtlQ2hhdChpZCksIGludGVyYWN0aXZpdHk6IGNvbnN0T2JzZXJ2YWJsZShpbnRlcmFjdGl2aXR5KSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihjaGF0czogSUNoYXRbXSwgaW5pdGlhbENsb3NlZENoYXRVcmlzPzogSXRlcmFibGU8c3RyaW5nPiwgaW5pdGlhbEFjdGl2ZUNoYXQ/OiBJQ2hhdCkge1xuXHRcdGNvbnN0IGNoYXRzT2JzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0W10+KCdjaGF0cycsIGNoYXRzKTtcblx0XHRjb25zdCBiYXNlID0gc3R1YlNlc3Npb24oJ1MnKTtcblx0XHRjb25zdCBzZXNzaW9uOiBJU2Vzc2lvbiA9IHsgLi4uYmFzZSwgY2hhdHM6IGNoYXRzT2JzLCBtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXRzWzBdKSB9O1xuXHRcdGNvbnN0IHZpc2libGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFZpc2libGVTZXNzaW9uKHNlc3Npb24sIGluaXRpYWxBY3RpdmVDaGF0ID8/IGNoYXRzWzBdLCBpbml0aWFsQ2xvc2VkQ2hhdFVyaXMpKTtcblx0XHRjb25zdCBpZHMgPSAobGlzdDogcmVhZG9ubHkgSUNoYXRbXSkgPT4gbGlzdC5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKTtcblx0XHRyZXR1cm4geyB2aXNpYmxlLCBjaGF0c09icywgaWRzIH07XG5cdH1cblxuXHRmdW5jdGlvbiBzbmFwc2hvdCh2aXNpYmxlOiBWaXNpYmxlU2Vzc2lvbiwgaWRzOiAobGlzdDogcmVhZG9ubHkgSUNoYXRbXSkgPT4gc3RyaW5nW10pIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3BlbjogaWRzKHZpc2libGUub3BlbkNoYXRzLmdldCgpKSxcblx0XHRcdGNsb3NlZDogaWRzKHZpc2libGUuY2xvc2VkQ2hhdHMuZ2V0KCkpLFxuXHRcdFx0YWN0aXZlOiB2aXNpYmxlLmFjdGl2ZUNoYXQuZ2V0KCkudGl0bGUuZ2V0KCksXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ2Nsb3NpbmcgYSBub24tbWFpbiBjaGF0IGhpZGVzIGl0IGZyb20gdGhlIHRhYiBzdHJpcCBhbmQgbGlzdHMgaXQgYXMgY2xvc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IFttYWluLCBiXSA9IFttYWtlQ2hhdCgnbWFpbicpLCBtYWtlQ2hhdCgnYicpXTtcblx0XHRjb25zdCB7IHZpc2libGUsIGlkcyB9ID0gY3JlYXRlU2Vzc2lvbihbbWFpbiwgYl0pO1xuXHRcdHZpc2libGUuc2V0QWN0aXZlQ2hhdChiKTtcblxuXHRcdHZpc2libGUuY2xvc2VDaGF0KGIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdCh2aXNpYmxlLCBpZHMpLCB7XG5cdFx0XHRvcGVuOiBbJ21haW4nXSxcblx0XHRcdGNsb3NlZDogWydiJ10sXG5cdFx0XHRhY3RpdmU6ICdtYWluJywgLy8gYWN0aXZlIGZhbGxzIGJhY2sgdG8gYW4gb3BlbiBjaGF0XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBtYWluIGNoYXQgY2Fubm90IGJlIGNsb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBbbWFpbiwgYl0gPSBbbWFrZUNoYXQoJ21haW4nKSwgbWFrZUNoYXQoJ2InKV07XG5cdFx0Y29uc3QgeyB2aXNpYmxlLCBpZHMgfSA9IGNyZWF0ZVNlc3Npb24oW21haW4sIGJdKTtcblxuXHRcdHZpc2libGUuY2xvc2VDaGF0KG1haW4pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdCh2aXNpYmxlLCBpZHMpLCB7XG5cdFx0XHRvcGVuOiBbJ21haW4nLCAnYiddLFxuXHRcdFx0Y2xvc2VkOiBbXSxcblx0XHRcdGFjdGl2ZTogJ21haW4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuaW5nIGEgY2xvc2VkIGNoYXQgcmVzdG9yZXMgaXQgdG8gdGhlIHRhYiBzdHJpcCcsICgpID0+IHtcblx0XHRjb25zdCBbbWFpbiwgYl0gPSBbbWFrZUNoYXQoJ21haW4nKSwgbWFrZUNoYXQoJ2InKV07XG5cdFx0Y29uc3QgeyB2aXNpYmxlLCBpZHMgfSA9IGNyZWF0ZVNlc3Npb24oW21haW4sIGJdKTtcblx0XHR2aXNpYmxlLmNsb3NlQ2hhdChiKTtcblxuXHRcdHZpc2libGUub3BlbkNoYXQoYik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KHZpc2libGUsIGlkcyksIHtcblx0XHRcdG9wZW46IFsnbWFpbicsICdiJ10sXG5cdFx0XHRjbG9zZWQ6IFtdLFxuXHRcdFx0YWN0aXZlOiAnbWFpbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0aW5nIGEgY2xvc2VkIGNoYXQgZHJvcHMgaXQgZnJvbSB0aGUgY2xvc2VkIGxpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgW21haW4sIGJdID0gW21ha2VDaGF0KCdtYWluJyksIG1ha2VDaGF0KCdiJyldO1xuXHRcdGNvbnN0IHsgdmlzaWJsZSwgY2hhdHNPYnMsIGlkcyB9ID0gY3JlYXRlU2Vzc2lvbihbbWFpbiwgYl0pO1xuXHRcdHZpc2libGUuY2xvc2VDaGF0KGIpO1xuXG5cdFx0Y2hhdHNPYnMuc2V0KFttYWluXSwgdW5kZWZpbmVkKTsgLy8gY2hhdCBpcyByZW1vdmVkIGZyb20gdGhlIHNlc3Npb25cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QodmlzaWJsZSwgaWRzKSwge1xuXHRcdFx0b3BlbjogWydtYWluJ10sXG5cdFx0XHRjbG9zZWQ6IFtdLFxuXHRcdFx0YWN0aXZlOiAnbWFpbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRlZCBjbG9zZWQgY2hhdHMgYXJlIHJlc3RvcmVkIGFzIGhpZGRlbiAocGVyc2lzdGVuY2UpJywgKCkgPT4ge1xuXHRcdGNvbnN0IFttYWluLCBiLCBjXSA9IFttYWtlQ2hhdCgnbWFpbicpLCBtYWtlQ2hhdCgnYicpLCBtYWtlQ2hhdCgnYycpXTtcblx0XHRjb25zdCB7IHZpc2libGUsIGlkcyB9ID0gY3JlYXRlU2Vzc2lvbihbbWFpbiwgYiwgY10sIFtiLnJlc291cmNlLnRvU3RyaW5nKCldKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QodmlzaWJsZSwgaWRzKSwge1xuXHRcdFx0b3BlbjogWydtYWluJywgJ2MnXSxcblx0XHRcdGNsb3NlZDogWydiJ10sXG5cdFx0XHRhY3RpdmU6ICdtYWluJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBzZWVkZWQgY2hhdCB0aGF0IGlzIGFsc28gdGhlIHJlc3RvcmVkIGFjdGl2ZSBjaGF0IHN0YXlzIG9wZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgW21haW4sIGJdID0gW21ha2VDaGF0KCdtYWluJyksIG1ha2VDaGF0KCdiJyldO1xuXHRcdC8vIFRoZSBwZXJzaXN0ZWQgYWN0aXZlIGNoYXQgbXVzdCBuZXZlciBiZSBoaWRkZW4sIGV2ZW4gaWYgaXQgYWxzbyBhcHBlYXJzXG5cdFx0Ly8gaW4gdGhlIHBlcnNpc3RlZCBjbG9zZWQgc2V0IChpbmNvbnNpc3RlbnQgc3RhdGUpLlxuXHRcdGNvbnN0IHsgdmlzaWJsZSwgaWRzIH0gPSBjcmVhdGVTZXNzaW9uKFttYWluLCBiXSwgW2IucmVzb3VyY2UudG9TdHJpbmcoKV0sIGIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdCh2aXNpYmxlLCBpZHMpLCB7XG5cdFx0XHRvcGVuOiBbJ21haW4nLCAnYiddLFxuXHRcdFx0Y2xvc2VkOiBbXSxcblx0XHRcdGFjdGl2ZTogJ2InLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHNlZWRlZCBtYWluIGNoYXQgaXMgbmV2ZXIgaGlkZGVuIGV2ZW4gaWYgcGVyc2lzdGVkIGFzIGNsb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBbbWFpbiwgYl0gPSBbbWFrZUNoYXQoJ21haW4nKSwgbWFrZUNoYXQoJ2InKV07XG5cdFx0Ly8gVGhlIG1haW4gY2hhdCBjYW4gbmV2ZXIgYmUgY2xvc2VkLCBzbyBhIGNvcnJ1cHQvbGVnYWN5IGNsb3NlZCBzZXQgdGhhdFxuXHRcdC8vIGNvbnRhaW5zIHRoZSBtYWluIGNoYXQgVVJJIG11c3Qgbm90IGhpZGUgaXQgZnJvbSB0aGUgdGFiIHN0cmlwLlxuXHRcdGNvbnN0IHsgdmlzaWJsZSwgaWRzIH0gPSBjcmVhdGVTZXNzaW9uKFttYWluLCBiXSwgW21haW4ucmVzb3VyY2UudG9TdHJpbmcoKSwgYi5yZXNvdXJjZS50b1N0cmluZygpXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KHZpc2libGUsIGlkcyksIHtcblx0XHRcdG9wZW46IFsnbWFpbiddLFxuXHRcdFx0Y2xvc2VkOiBbJ2InXSxcblx0XHRcdGFjdGl2ZTogJ21haW4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXN0Q2xvc2VkQ2hhdCByZXR1cm5zIHRoZSBtb3N0IHJlY2VudGx5IGNsb3NlZCBjaGF0IHJlZ2FyZGxlc3Mgb2YgY3JlYXRpb24gb3JkZXInLCAoKSA9PiB7XG5cdFx0Ly8gQiB3YXMgY3JlYXRlZCBiZWZvcmUgQywgYnV0IGlmIEMgaXMgY2xvc2VkIGZpcnN0IGFuZCB0aGVuIEIsXG5cdFx0Ly8gbGFzdENsb3NlZENoYXQgc2hvdWxkIHJldHVybiBCIChub3QgQywgd2hpY2ggY2xvc2VkQ2hhdHMuYXQoLTEpIHdvdWxkIHdyb25nbHkgZ2l2ZSkuXG5cdFx0Y29uc3QgW21haW4sIGIsIGNdID0gW21ha2VDaGF0KCdtYWluJyksIG1ha2VDaGF0KCdiJyksIG1ha2VDaGF0KCdjJyldO1xuXHRcdGNvbnN0IHsgdmlzaWJsZSB9ID0gY3JlYXRlU2Vzc2lvbihbbWFpbiwgYiwgY10pO1xuXG5cdFx0dmlzaWJsZS5jbG9zZUNoYXQoYyk7IC8vIGNsb3NlIEMgZmlyc3Rcblx0XHR2aXNpYmxlLmNsb3NlQ2hhdChiKTsgLy8gY2xvc2UgQiBsYXN0XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZS5sYXN0Q2xvc2VkQ2hhdD8udGl0bGUuZ2V0KCksICdiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhc3RDbG9zZWRDaGF0IHVwZGF0ZXMgYWZ0ZXIgcmVvcGVuaW5nIHRoZSBsYXN0LWNsb3NlZCBjaGF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IFttYWluLCBiLCBjXSA9IFttYWtlQ2hhdCgnbWFpbicpLCBtYWtlQ2hhdCgnYicpLCBtYWtlQ2hhdCgnYycpXTtcblx0XHRjb25zdCB7IHZpc2libGUgfSA9IGNyZWF0ZVNlc3Npb24oW21haW4sIGIsIGNdKTtcblxuXHRcdHZpc2libGUuY2xvc2VDaGF0KGIpO1xuXHRcdHZpc2libGUuY2xvc2VDaGF0KGMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aXNpYmxlLmxhc3RDbG9zZWRDaGF0Py50aXRsZS5nZXQoKSwgJ2MnKTtcblxuXHRcdHZpc2libGUub3BlbkNoYXQoYyk7IC8vIHJlb3BlbiBDIFx1MjAxNCBCIGlzIG5vdyB0aGUgbGFzdCBjbG9zZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZS5sYXN0Q2xvc2VkQ2hhdD8udGl0bGUuZ2V0KCksICdiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhc3RDbG9zZWRDaGF0IHJldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gY2hhdHMgYXJlIGNsb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBbbWFpbiwgYl0gPSBbbWFrZUNoYXQoJ21haW4nKSwgbWFrZUNoYXQoJ2InKV07XG5cdFx0Y29uc3QgeyB2aXNpYmxlIH0gPSBjcmVhdGVTZXNzaW9uKFttYWluLCBiXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZS5sYXN0Q2xvc2VkQ2hhdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbGFzdENsb3NlZENoYXQgc2tpcHMgZGVsZXRlZCBjaGF0cyBhbmQgcmV0dXJucyB0aGUgbmV4dCB2YWxpZCBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgW21haW4sIGIsIGNdID0gW21ha2VDaGF0KCdtYWluJyksIG1ha2VDaGF0KCdiJyksIG1ha2VDaGF0KCdjJyldO1xuXHRcdGNvbnN0IHsgdmlzaWJsZSwgY2hhdHNPYnMgfSA9IGNyZWF0ZVNlc3Npb24oW21haW4sIGIsIGNdKTtcblxuXHRcdHZpc2libGUuY2xvc2VDaGF0KGIpO1xuXHRcdHZpc2libGUuY2xvc2VDaGF0KGMpO1xuXHRcdC8vIERlbGV0ZSBDIGZyb20gdGhlIHNlc3Npb24gKHNpbXVsYXRlcyBwZXJtYW5lbnQgZGVsZXRpb24pXG5cdFx0Y2hhdHNPYnMuc2V0KFttYWluLCBiXSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEMgaXMgZ29uZTsgbGFzdENsb3NlZENoYXQgc2hvdWxkIGZhbGwgYmFjayB0byBCXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGUubGFzdENsb3NlZENoYXQ/LnRpdGxlLmdldCgpLCAnYicpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRkZW4gY2hhdHMgYXJlIGV4Y2x1ZGVkIGZyb20gdGhlIHRhYiBzdHJpcCBidXQgcmVhZC1vbmx5IGNoYXRzIGFyZSBub3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFpbiA9IG1ha2VDaGF0V2l0aCgnbWFpbicsIENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpO1xuXHRcdGNvbnN0IHJlYWRPbmx5ID0gbWFrZUNoYXRXaXRoKCdybycsIENoYXRJbnRlcmFjdGl2aXR5LlJlYWRPbmx5KTtcblx0XHRjb25zdCBoaWRkZW4gPSBtYWtlQ2hhdFdpdGgoJ2hpZGRlbicsIENoYXRJbnRlcmFjdGl2aXR5LkhpZGRlbik7XG5cdFx0Y29uc3QgeyB2aXNpYmxlLCBpZHMgfSA9IGNyZWF0ZVNlc3Npb24oW21haW4sIHJlYWRPbmx5LCBoaWRkZW5dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QodmlzaWJsZSwgaWRzKSwge1xuXHRcdFx0b3BlbjogWydtYWluJywgJ3JvJ10sXG5cdFx0XHRjbG9zZWQ6IFtdLFxuXHRcdFx0YWN0aXZlOiAnbWFpbicsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdWaXNpYmxlU2Vzc2lvbiAtIHZpc2libGVDaGF0VGFicycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1ha2VDaGF0KGlkOiBzdHJpbmcsIHN0YXR1cyA9IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBvcmlnaW4/OiBDaGF0T3JpZ2luS2luZCk6IElDaGF0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc3R1YkNoYXQsXG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vL2NoYXQvJHtpZH1gKSxcblx0XHRcdHRpdGxlOiBjb25zdE9ic2VydmFibGUoaWQpLFxuXHRcdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoc3RhdHVzKSxcblx0XHRcdG9yaWdpbjogb3JpZ2luID8geyBraW5kOiBvcmlnaW4gfSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihjaGF0czogSUNoYXRbXSkge1xuXHRcdGNvbnN0IGJhc2UgPSBzdHViU2Vzc2lvbignUycpO1xuXHRcdGNvbnN0IHNlc3Npb246IElTZXNzaW9uID0geyAuLi5iYXNlLCBjaGF0czogY29uc3RPYnNlcnZhYmxlKGNoYXRzKSwgbWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0c1swXSkgfTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBWaXNpYmxlU2Vzc2lvbihzZXNzaW9uLCBjaGF0c1swXSkpO1xuXHR9XG5cblx0dGVzdCgna2VlcHMgcHJvdmlkZXIgb3JkZXIgYW5kIGhpZGVzIHRvb2wtb3JpZ2luIChzdWJhZ2VudCkgY2hhdHMgYnkgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCB2aXNpYmxlID0gY3JlYXRlU2Vzc2lvbihbXG5cdFx0XHRtYWtlQ2hhdCgnbWFpbicpLFxuXHRcdFx0bWFrZUNoYXQoJ2RyYWZ0JywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCksXG5cdFx0XHRtYWtlQ2hhdCgndG9vbCcsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBDaGF0T3JpZ2luS2luZC5Ub29sKSxcblx0XHRcdG1ha2VDaGF0KCdzZWNvbmQnKSxcblx0XHRdKTtcblxuXHRcdC8vIFN1YmFnZW50ICh0b29sLW9yaWdpbikgY2hhdHMgYXJlIGhpZGRlbiBmcm9tIHRoZSB0YWIgc3RyaXAgYnkgZGVmYXVsdC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpc2libGUudmlzaWJsZUNoYXRUYWJzLmdldCgpLm1hcChjID0+IGMudGl0bGUuZ2V0KCkpLCBbJ21haW4nLCAnZHJhZnQnLCAnc2Vjb25kJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXJmYWNlcyBhIHN1YmFnZW50IHRhYiBvbmNlIGl0IGlzIGV4cGxpY2l0bHkgb3BlbmVkLCBhbmQgaGlkZXMgaXQgYWdhaW4gb24gY2xvc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdHMgPSBbXG5cdFx0XHRtYWtlQ2hhdCgnbWFpbicpLFxuXHRcdFx0bWFrZUNoYXQoJ3Rvb2wnLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgQ2hhdE9yaWdpbktpbmQuVG9vbCksXG5cdFx0XTtcblx0XHRjb25zdCB2aXNpYmxlID0gY3JlYXRlU2Vzc2lvbihjaGF0cyk7XG5cdFx0Y29uc3QgdG9vbCA9IGNoYXRzWzFdO1xuXG5cdFx0dmlzaWJsZS5vcGVuQ2hhdCh0b29sKTtcblx0XHRjb25zdCBhZnRlck9wZW4gPSB2aXNpYmxlLnZpc2libGVDaGF0VGFicy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKTtcblx0XHR2aXNpYmxlLmNsb3NlQ2hhdCh0b29sKTtcblx0XHRjb25zdCBhZnRlckNsb3NlID0gdmlzaWJsZS52aXNpYmxlQ2hhdFRhYnMuZ2V0KCkubWFwKGMgPT4gYy50aXRsZS5nZXQoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWZ0ZXJPcGVuLCBhZnRlckNsb3NlIH0sIHtcblx0XHRcdGFmdGVyT3BlbjogWydtYWluJywgJ3Rvb2wnXSxcblx0XHRcdGFmdGVyQ2xvc2U6IFsnbWFpbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGNsb3NlZCBzdWJhZ2VudCB0YWIgaXMgbm90IGFkZGVkIHRvIHRoZSByZW9wZW5hYmxlIGNsb3NlZCBjaGF0cycsICgpID0+IHtcblx0XHRjb25zdCBjaGF0cyA9IFtcblx0XHRcdG1ha2VDaGF0KCdtYWluJyksXG5cdFx0XHRtYWtlQ2hhdCgndG9vbCcsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBDaGF0T3JpZ2luS2luZC5Ub29sKSxcblx0XHRdO1xuXHRcdGNvbnN0IHZpc2libGUgPSBjcmVhdGVTZXNzaW9uKGNoYXRzKTtcblx0XHRjb25zdCB0b29sID0gY2hhdHNbMV07XG5cblx0XHR2aXNpYmxlLm9wZW5DaGF0KHRvb2wpO1xuXHRcdHZpc2libGUuY2xvc2VDaGF0KHRvb2wpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aXNpYmxlLmNsb3NlZENoYXRzLmdldCgpLm1hcChjID0+IGMudGl0bGUuZ2V0KCkpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIHNpZGUtY2hhdCAoYC9idHdgKSBvcmlnaW4gY2hhdHMgaW4gdGhlIG9yZGluYXJ5IHRhYiBzdHJpcCcsICgpID0+IHtcblx0XHRjb25zdCB2aXNpYmxlID0gY3JlYXRlU2Vzc2lvbihbXG5cdFx0XHRtYWtlQ2hhdCgnbWFpbicpLFxuXHRcdFx0bWFrZUNoYXQoJ3NpZGUnLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQpLFxuXHRcdFx0bWFrZUNoYXQoJ3NlY29uZCcpLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aXNpYmxlLnZpc2libGVDaGF0VGFicy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSwgWydtYWluJywgJ3NpZGUnLCAnc2Vjb25kJ10pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnVmlzaWJsZVNlc3Npb24gLSBzaG91bGRTaG93Q2hhdFRhYnMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBtYWtlQ2hhdChpZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nLCBvcmlnaW4/OiBDaGF0T3JpZ2luS2luZCk6IElDaGF0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc3R1YkNoYXQsXG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vL2NoYXQvJHtpZH1gKSxcblx0XHRcdHRpdGxlOiBjb25zdE9ic2VydmFibGUodGl0bGUpLFxuXHRcdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLFxuXHRcdFx0b3JpZ2luOiBvcmlnaW4gPyB7IGtpbmQ6IG9yaWdpbiB9IDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKHNlc3Npb25UaXRsZTogc3RyaW5nLCBjaGF0czogSUNoYXRbXSkge1xuXHRcdGNvbnN0IGJhc2UgPSBzdHViU2Vzc2lvbignUycpO1xuXHRcdGNvbnN0IHNlc3Npb246IElTZXNzaW9uID0geyAuLi5iYXNlLCB0aXRsZTogY29uc3RPYnNlcnZhYmxlKHNlc3Npb25UaXRsZSksIGNoYXRzOiBjb25zdE9ic2VydmFibGUoY2hhdHMpLCBtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXRzWzBdKSB9O1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFZpc2libGVTZXNzaW9uKHNlc3Npb24sIGNoYXRzWzBdKSk7XG5cdH1cblxuXHR0ZXN0KCdoaWRkZW4gZm9yIGEgc2luZ2xlIGNoYXQgbWF0Y2hpbmcgdGhlIHNlc3Npb24gdGl0bGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IGNyZWF0ZVNlc3Npb24oJ1RpdGxlJywgW21ha2VDaGF0KCdtYWluJywgJ1RpdGxlJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZS5zaG91bGRTaG93Q2hhdFRhYnMuZ2V0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaGlkZGVuIGZvciBhIHNpbmdsZSBjaGF0IGV2ZW4gd2hlbiBpdHMgdGl0bGUgZGl2ZXJnZWQgZnJvbSB0aGUgc2Vzc2lvbiB0aXRsZScsICgpID0+IHtcblx0XHRjb25zdCB2aXNpYmxlID0gY3JlYXRlU2Vzc2lvbignU2Vzc2lvbiBUaXRsZScsIFttYWtlQ2hhdCgnbWFpbicsICdDaGF0IFRpdGxlJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZS5zaG91bGRTaG93Q2hhdFRhYnMuZ2V0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd24gZm9yIG1vcmUgdGhhbiBvbmUgY2hhdCBldmVuIGlmIGEgY2hhdCB0aXRsZSBtYXRjaGVzIHRoZSBzZXNzaW9uIHRpdGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpc2libGUgPSBjcmVhdGVTZXNzaW9uKCdtYWluJywgW21ha2VDaGF0KCdtYWluJywgJ21haW4nKSwgbWFrZUNoYXQoJ3NlY29uZCcsICdzZWNvbmQnKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aXNpYmxlLnNob3VsZFNob3dDaGF0VGFicy5nZXQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGRlbiBmb3IgYSBzaW5nbGUgbm9uLXRvb2wgY2hhdCBtYXRjaGluZyB0aGUgc2Vzc2lvbiB0aXRsZSBldmVuIHdoZW4gaXQgaGFzIGEgc3ViYWdlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IGNyZWF0ZVNlc3Npb24oJ1RpdGxlJywgW1xuXHRcdFx0bWFrZUNoYXQoJ21haW4nLCAnVGl0bGUnKSxcblx0XHRcdG1ha2VDaGF0KCd0b29sJywgJ3Rvb2wnLCBDaGF0T3JpZ2luS2luZC5Ub29sKSxcblx0XHRdKTtcblx0XHQvLyBTdWJhZ2VudHMgb24gdGhlaXIgb3duIGRvIG5vdCBzaG93IHRoZSBzdHJpcDsgdGhlIENvbnZlcnNhdGlvbnMgbWVudVxuXHRcdC8vICh3aGljaCBsaXN0cyBzdWJhZ2VudHMpIHN1cmZhY2VzIGluIHRoZSBzZXNzaW9uIGhlYWRlciBpbnN0ZWFkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aXNpYmxlLnNob3VsZFNob3dDaGF0VGFicy5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93biBvbmNlIGEgc3ViYWdlbnQgdGFiIGlzIGV4cGxpY2l0bHkgb3BlbmVkIChtdWx0aXBsZSB2aXNpYmxlIHRhYnMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRzID0gW21ha2VDaGF0KCdtYWluJywgJ1RpdGxlJyksIG1ha2VDaGF0KCd0b29sJywgJ3Rvb2wnLCBDaGF0T3JpZ2luS2luZC5Ub29sKV07XG5cdFx0Y29uc3QgdmlzaWJsZSA9IGNyZWF0ZVNlc3Npb24oJ1RpdGxlJywgY2hhdHMpO1xuXHRcdHZpc2libGUub3BlbkNoYXQoY2hhdHNbMV0pO1xuXHRcdC8vIE9wZW5pbmcgYSBzdWJhZ2VudCBzdXJmYWNlcyBpdCBhcyBhIHNlY29uZCB2aXNpYmxlIHRhYiwgc28gdGhlIHN0cmlwIGlzXG5cdFx0Ly8gc2hvd24gdG8gZGlzcGxheSBib3RoIHRhYnMuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGUuc2hvdWxkU2hvd0NoYXRUYWJzLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd24gd2hlbiBhIHNpZGUgY2hhdCBleGlzdHMgYWxvbmdzaWRlIHRoZSBtYWluIGNoYXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IGNyZWF0ZVNlc3Npb24oJ1RpdGxlJywgW1xuXHRcdFx0bWFrZUNoYXQoJ21haW4nLCAnVGl0bGUnKSxcblx0XHRcdG1ha2VDaGF0KCdzaWRlJywgJ3NpZGUnLCBDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdCksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGUuc2hvdWxkU2hvd0NoYXRUYWJzLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaGlkZGVuIHdoZW4gdGhlcmUgYXJlIG5vIHRhYiBjaGF0cycsICgpID0+IHtcblx0XHRjb25zdCBtYWluID0gbWFrZUNoYXQoJ21haW4nLCAnVGl0bGUnKTtcblx0XHRjb25zdCBiYXNlID0gc3R1YlNlc3Npb24oJ1MnKTtcblx0XHRjb25zdCBzZXNzaW9uOiBJU2Vzc2lvbiA9IHsgLi4uYmFzZSwgdGl0bGU6IGNvbnN0T2JzZXJ2YWJsZSgnVGl0bGUnKSwgY2hhdHM6IGNvbnN0T2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPihbXSksIG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUobWFpbikgfTtcblx0XHRjb25zdCB2aXNpYmxlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBWaXNpYmxlU2Vzc2lvbihzZXNzaW9uLCBtYWluKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGUuc2hvdWxkU2hvd0NoYXRUYWJzLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGRlbiBhZnRlciBhIG5vbi1tYWluIGNoYXQgaXMgY2xvc2VkIGJhY2sgZG93biB0byBhIHNpbmdsZSB2aXNpYmxlIHRhYicsICgpID0+IHtcblx0XHRjb25zdCBtYWluID0gbWFrZUNoYXQoJ21haW4nLCAnVGl0bGUnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBtYWtlQ2hhdCgnc2Vjb25kJywgJ3NlY29uZCcpO1xuXHRcdGNvbnN0IHZpc2libGUgPSBjcmVhdGVTZXNzaW9uKCdUaXRsZScsIFttYWluLCBzZWNvbmRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aXNpYmxlLnNob3VsZFNob3dDaGF0VGFicy5nZXQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGUudmlzaWJsZUNoYXRUYWJzLmdldCgpLmxlbmd0aCwgMik7XG5cblx0XHR2aXNpYmxlLmNsb3NlQ2hhdChzZWNvbmQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaG91bGRTaG93Q2hhdFRhYnM6IHZpc2libGUuc2hvdWxkU2hvd0NoYXRUYWJzLmdldCgpLFxuXHRcdFx0dmlzaWJsZUNoYXRUYWJzOiB2aXNpYmxlLnZpc2libGVDaGF0VGFicy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHR9LCB7XG5cdFx0XHRzaG91bGRTaG93Q2hhdFRhYnM6IGZhbHNlLFxuXHRcdFx0dmlzaWJsZUNoYXRUYWJzOiBbJ1RpdGxlJ10sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdWaXNpYmxlU2Vzc2lvbiAtIHNpZGUgY2hhdCB0YWJzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gbWFrZUNoYXQoaWQ6IHN0cmluZywgb3JpZ2luPzogQ2hhdE9yaWdpbktpbmQpOiBJQ2hhdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnN0dWJDaGF0LFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgdGVzdDovLy9jaGF0LyR7aWR9YCksXG5cdFx0XHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKGlkKSxcblx0XHRcdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSxcblx0XHRcdG9yaWdpbjogb3JpZ2luID8geyBraW5kOiBvcmlnaW4gfSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihjaGF0czogSUNoYXRbXSkge1xuXHRcdGNvbnN0IGJhc2UgPSBzdHViU2Vzc2lvbignUycpO1xuXHRcdGNvbnN0IGNoYXRzT2JzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0W10+KCdjaGF0cycsIGNoYXRzKTtcblx0XHRjb25zdCBzZXNzaW9uOiBJU2Vzc2lvbiA9IHsgLi4uYmFzZSwgY2hhdHM6IGNoYXRzT2JzLCBtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXRzWzBdKSB9O1xuXHRcdGNvbnN0IHZpc2libGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFZpc2libGVTZXNzaW9uKHNlc3Npb24sIGNoYXRzWzBdKSk7XG5cdFx0cmV0dXJuIHsgdmlzaWJsZSwgY2hhdHNPYnMgfTtcblx0fVxuXG5cdHRlc3QoJ29wZW5DaGF0IGtlZXBzIGEgc2lkZS1jaGF0IG9yaWdpbiBjaGF0IGF2YWlsYWJsZSBhcyBhIG5vcm1hbCB0YWInLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdHMgPSBbbWFrZUNoYXQoJ21haW4nKSwgbWFrZUNoYXQoJ3NpZGUnLCBDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdCldO1xuXHRcdGNvbnN0IHsgdmlzaWJsZSB9ID0gY3JlYXRlU2Vzc2lvbihjaGF0cyk7XG5cblx0XHR2aXNpYmxlLm9wZW5DaGF0KGNoYXRzWzFdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlzaWJsZS52aXNpYmxlQ2hhdFRhYnMuZ2V0KCkubWFwKGMgPT4gYy50aXRsZS5nZXQoKSksIFsnbWFpbicsICdzaWRlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUNoYXQgaGlkZXMgYSBzaWRlLWNoYXQgb3JpZ2luIGNoYXQgaW50byB0aGUgcmVvcGVuYWJsZSBjbG9zZWQgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRzID0gW21ha2VDaGF0KCdtYWluJyksIG1ha2VDaGF0KCdzaWRlJywgQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQpXTtcblx0XHRjb25zdCB7IHZpc2libGUgfSA9IGNyZWF0ZVNlc3Npb24oY2hhdHMpO1xuXG5cdFx0dmlzaWJsZS5jbG9zZUNoYXQoY2hhdHNbMV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aXNpYmxlOiB2aXNpYmxlLnZpc2libGVDaGF0VGFicy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHRcdGNsb3NlZDogdmlzaWJsZS5jbG9zZWRDaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHR9LCB7XG5cdFx0XHR2aXNpYmxlOiBbJ21haW4nXSxcblx0XHRcdGNsb3NlZDogWydzaWRlJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBhY3RpdmUtY2hhdCBmYWxsYmFjayBjYW4gc2VsZWN0IGEgc2lkZSBjaGF0IGxpa2UgYW55IG90aGVyIHBlZXIgY2hhdCcsICgpID0+IHtcblx0XHRjb25zdCBtYWluID0gbWFrZUNoYXQoJ21haW4nKTtcblx0XHRjb25zdCBzZWNvbmQgPSBtYWtlQ2hhdCgnc2Vjb25kJyk7XG5cdFx0Y29uc3Qgc2lkZSA9IG1ha2VDaGF0KCdzaWRlJywgQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQpO1xuXHRcdGNvbnN0IHsgdmlzaWJsZSB9ID0gY3JlYXRlU2Vzc2lvbihbbWFpbiwgc2Vjb25kLCBzaWRlXSk7XG5cblx0XHR2aXNpYmxlLnNldEFjdGl2ZUNoYXQoc2Vjb25kKTtcblx0XHR2aXNpYmxlLmNsb3NlQ2hhdChzZWNvbmQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGUuYWN0aXZlQ2hhdC5nZXQoKSwgc2lkZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdWaXNpYmxlU2Vzc2lvbnMgLSBhY3RpdmUgY2hhdCByZW1vdmFsIGZhbGxiYWNrJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9kZWwoKSB7XG5cdFx0Y29uc3QgdXJpSWRlbnRpdHkgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZXh0VXJpID0gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2U7XG5cdFx0fTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBWaXNpYmxlU2Vzc2lvbnMoXG5cdFx0XHRzZXNzaW9uID0+IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCksXG5cdFx0XHQoKSA9PiBbXSxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVyaUlkZW50aXR5LFxuXHRcdCkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZUNoYXQoaWQ6IHN0cmluZywgb3JpZ2luPzogQ2hhdE9yaWdpbktpbmQpOiBJQ2hhdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnN0dWJDaGF0LFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgdGVzdDovLy9jaGF0LyR7aWR9YCksXG5cdFx0XHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKGlkKSxcblx0XHRcdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSxcblx0XHRcdG9yaWdpbjogb3JpZ2luID8geyBraW5kOiBvcmlnaW4gfSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihjaGF0czogSUNoYXRbXSkge1xuXHRcdGNvbnN0IGNoYXRzT2JzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0W10+KCdjaGF0cycsIGNoYXRzKTtcblx0XHRjb25zdCBiYXNlID0gc3R1YlNlc3Npb24oJ1MnKTtcblx0XHRjb25zdCBzZXNzaW9uOiBJU2Vzc2lvbiA9IHsgLi4uYmFzZSwgY2hhdHM6IGNoYXRzT2JzLCBtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXRzWzBdKSB9O1xuXHRcdHJldHVybiB7IHNlc3Npb24sIGNoYXRzT2JzIH07XG5cdH1cblxuXHR0ZXN0KCdyZW1vdmluZyBhbiBhY3RpdmUgc2lkZSBjaGF0IGZhbGxzIGJhY2sgdG8gdGhlIGxhc3QgdmlzaWJsZSB0YWIsIG5vdCBhbiB1bm9wZW5lZCB0b29sIGNoYXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFpbiA9IG1ha2VDaGF0KCdtYWluJyk7XG5cdFx0Y29uc3Qgc2lkZSA9IG1ha2VDaGF0KCdzaWRlJywgQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQpO1xuXHRcdGNvbnN0IHRvb2wgPSBtYWtlQ2hhdCgndG9vbCcsIENoYXRPcmlnaW5LaW5kLlRvb2wpO1xuXHRcdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdHNPYnMgfSA9IGNyZWF0ZVNlc3Npb24oW21haW4sIHNpZGUsIHRvb2xdKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IG1vZGVsLnNldEFjdGl2ZShzZXNzaW9uKSE7XG5cblx0XHR2aXNpYmxlLnNldEFjdGl2ZUNoYXQoc2lkZSk7XG5cdFx0Y2hhdHNPYnMuc2V0KFttYWluLCB0b29sXSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0aXZlOiB2aXNpYmxlLmFjdGl2ZUNoYXQuZ2V0KCkudGl0bGUuZ2V0KCksXG5cdFx0XHRvcGVuOiB2aXNpYmxlLm9wZW5DaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHRcdHZpc2libGU6IHZpc2libGUudmlzaWJsZUNoYXRUYWJzLmdldCgpLm1hcChjID0+IGMudGl0bGUuZ2V0KCkpLFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZTogJ21haW4nLFxuXHRcdFx0b3BlbjogWydtYWluJywgJ3Rvb2wnXSxcblx0XHRcdHZpc2libGU6IFsnbWFpbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmluZyBhbiBhY3RpdmUgc2lkZSBjaGF0IGNhbiBmYWxsIGJhY2sgdG8gYW4gZXhwbGljaXRseSBvcGVuZWQgdG9vbCB0YWInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFpbiA9IG1ha2VDaGF0KCdtYWluJyk7XG5cdFx0Y29uc3Qgc2lkZSA9IG1ha2VDaGF0KCdzaWRlJywgQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQpO1xuXHRcdGNvbnN0IHRvb2wgPSBtYWtlQ2hhdCgndG9vbCcsIENoYXRPcmlnaW5LaW5kLlRvb2wpO1xuXHRcdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdHNPYnMgfSA9IGNyZWF0ZVNlc3Npb24oW21haW4sIHNpZGUsIHRvb2xdKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IG1vZGVsLnNldEFjdGl2ZShzZXNzaW9uKSE7XG5cblx0XHR2aXNpYmxlLm9wZW5DaGF0KHRvb2wpO1xuXHRcdHZpc2libGUuc2V0QWN0aXZlQ2hhdChzaWRlKTtcblx0XHRjaGF0c09icy5zZXQoW21haW4sIHRvb2xdLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY3RpdmU6IHZpc2libGUuYWN0aXZlQ2hhdC5nZXQoKS50aXRsZS5nZXQoKSxcblx0XHRcdHZpc2libGU6IHZpc2libGUudmlzaWJsZUNoYXRUYWJzLmdldCgpLm1hcChjID0+IGMudGl0bGUuZ2V0KCkpLFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZTogJ3Rvb2wnLFxuXHRcdFx0dmlzaWJsZTogWydtYWluJywgJ3Rvb2wnXSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1Zpc2libGVTZXNzaW9uIC0gcGVyLWNoYXQgbW9kZWwvbW9kZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1ha2VDaGF0KGlkOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbW9kZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQ2hhdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnN0dWJDaGF0LFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgdGVzdDovLy9jaGF0LyR7aWR9YCksXG5cdFx0XHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKGlkKSxcblx0XHRcdG1vZGVsSWQ6IGNvbnN0T2JzZXJ2YWJsZShtb2RlbElkKSxcblx0XHRcdG1vZGU6IGNvbnN0T2JzZXJ2YWJsZShtb2RlSWQgPyB7IGlkOiBtb2RlSWQsIGtpbmQ6ICdhZ2VudCcgfSA6IHVuZGVmaW5lZCksXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ21vZGVsSWQgYW5kIG1vZGUgZm9sbG93IHRoZSBhY3RpdmUgY2hhdCwgbm90IHRoZSBzZXNzaW9uL2RlZmF1bHQgY2hhdCcsICgpID0+IHtcblx0XHRjb25zdCBmaXJzdCA9IG1ha2VDaGF0KCdmaXJzdCcsICdtb2RlbC0xJywgJ2FnZW50LTEnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBtYWtlQ2hhdCgnc2Vjb25kJywgJ21vZGVsLTInLCAnYWdlbnQtMicpO1xuXHRcdGNvbnN0IGJhc2UgPSBzdHViU2Vzc2lvbignUycpO1xuXHRcdGNvbnN0IHNlc3Npb246IElTZXNzaW9uID0geyAuLi5iYXNlLCBjaGF0czogY29uc3RPYnNlcnZhYmxlKFtmaXJzdCwgc2Vjb25kXSksIG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoZmlyc3QpIH07XG5cdFx0Y29uc3QgdmlzaWJsZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVmlzaWJsZVNlc3Npb24oc2Vzc2lvbiwgZmlyc3QpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IG1vZGVsSWQ6IHZpc2libGUubW9kZWxJZC5nZXQoKSwgbW9kZTogdmlzaWJsZS5tb2RlLmdldCgpIH0sXG5cdFx0XHR7IG1vZGVsSWQ6ICdtb2RlbC0xJywgbW9kZTogeyBpZDogJ2FnZW50LTEnLCBraW5kOiAnYWdlbnQnIH0gfSxcblx0XHQpO1xuXG5cdFx0dmlzaWJsZS5zZXRBY3RpdmVDaGF0KHNlY29uZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBtb2RlbElkOiB2aXNpYmxlLm1vZGVsSWQuZ2V0KCksIG1vZGU6IHZpc2libGUubW9kZS5nZXQoKSB9LFxuXHRcdFx0eyBtb2RlbElkOiAnbW9kZWwtMicsIG1vZGU6IHsgaWQ6ICdhZ2VudC0yJywga2luZDogJ2FnZW50JyB9IH0sXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQix1QkFBdUI7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
