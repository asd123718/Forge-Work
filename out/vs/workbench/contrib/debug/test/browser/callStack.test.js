import assert from "assert";
import * as sinon from "sinon";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Constants } from "../../../../../base/common/uint.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { upcastDeepPartial, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { TestAccessibilityService } from "../../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { createDecorationsForStackFrame } from "../../browser/callStackEditorContribution.js";
import { getContext, getContextForContributedActions, getSpecificSourceName } from "../../browser/callStackView.js";
import { debugStackframe, debugStackframeFocused } from "../../browser/debugIcons.js";
import { getStackFrameThreadAndSessionToFocus } from "../../browser/debugService.js";
import { DebugSession } from "../../browser/debugSession.js";
import { State } from "../../common/debug.js";
import { StackFrame, Thread } from "../../common/debugModel.js";
import { Source } from "../../common/debugSource.js";
import { MockRawSession } from "../common/mockDebug.js";
import { createMockDebugModel, mockUriIdentityService } from "./mockDebugModel.js";
const mockWorkspaceContextService = upcastDeepPartial({
  getWorkspace: () => {
    return {
      folders: []
    };
  }
});
function createTestSession(model, name = "mockSession", options) {
  return new DebugSession(generateUuid(), { resolved: { name, type: "node", request: "launch" }, unresolved: void 0 }, void 0, model, options, {
    getViewModel() {
      return {
        updateViews() {
        }
      };
    }
  }, void 0, void 0, new TestConfigurationService({ debug: { console: { collapseIdenticalLines: true } } }), void 0, mockWorkspaceContextService, void 0, void 0, void 0, mockUriIdentityService, new TestInstantiationService(), void 0, void 0, new NullLogService(), void 0, void 0, new TestAccessibilityService());
}
function createTwoStackFrames(session) {
  const thread = new class extends Thread {
    getCallStack() {
      return [firstStackFrame, secondStackFrame];
    }
  }(session, "mockthread", 1);
  const firstSource = new Source({
    name: "internalModule.js",
    path: "a/b/c/d/internalModule.js",
    sourceReference: 10
  }, "aDebugSessionId", mockUriIdentityService, new NullLogService());
  const secondSource = new Source({
    name: "internalModule.js",
    path: "z/x/c/d/internalModule.js",
    sourceReference: 11
  }, "aDebugSessionId", mockUriIdentityService, new NullLogService());
  const firstStackFrame = new StackFrame(thread, 0, firstSource, "app.js", "normal", { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 10 }, 0, true);
  const secondStackFrame = new StackFrame(thread, 1, secondSource, "app2.js", "normal", { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 10 }, 1, true);
  return { firstStackFrame, secondStackFrame };
}
suite("Debug - CallStack", () => {
  let model;
  let mockRawSession;
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    model = createMockDebugModel(disposables);
    mockRawSession = new MockRawSession();
  });
  teardown(() => {
    sinon.restore();
  });
  test("threads simple", () => {
    const threadId = 1;
    const threadName = "firstThread";
    const session = createTestSession(model);
    disposables.add(session);
    model.addSession(session);
    assert.strictEqual(model.getSessions(true).length, 1);
    model.rawUpdate({
      sessionId: session.getId(),
      threads: [{
        id: threadId,
        name: threadName
      }]
    });
    assert.strictEqual(session.getThread(threadId).name, threadName);
    model.clearThreads(session.getId(), true);
    assert.strictEqual(session.getThread(threadId), void 0);
    assert.strictEqual(model.getSessions(true).length, 1);
  });
  test("threads multiple with allThreadsStopped", async () => {
    const threadId1 = 1;
    const threadName1 = "firstThread";
    const threadId2 = 2;
    const threadName2 = "secondThread";
    const stoppedReason = "breakpoint";
    const session = createTestSession(model);
    disposables.add(session);
    model.addSession(session);
    session.raw = upcastPartial(mockRawSession);
    model.rawUpdate({
      sessionId: session.getId(),
      threads: [{
        id: threadId1,
        name: threadName1
      }]
    });
    model.rawUpdate({
      sessionId: session.getId(),
      threads: [{
        id: threadId1,
        name: threadName1
      }, {
        id: threadId2,
        name: threadName2
      }],
      stoppedDetails: {
        reason: stoppedReason,
        threadId: 1,
        allThreadsStopped: true
      }
    });
    const thread1 = session.getThread(threadId1);
    const thread2 = session.getThread(threadId2);
    assert.strictEqual(session.getAllThreads().length, 2);
    assert.strictEqual(thread1.name, threadName1);
    assert.strictEqual(thread1.stopped, true);
    assert.strictEqual(thread1.getCallStack().length, 0);
    assert.strictEqual(thread1.stoppedDetails.reason, stoppedReason);
    assert.strictEqual(thread2.name, threadName2);
    assert.strictEqual(thread2.stopped, true);
    assert.strictEqual(thread2.getCallStack().length, 0);
    assert.strictEqual(thread2.stoppedDetails.reason, void 0);
    await thread1.fetchCallStack();
    assert.notStrictEqual(thread1.getCallStack().length, 0);
    await thread2.fetchCallStack();
    assert.notStrictEqual(thread2.getCallStack().length, 0);
    await thread1.fetchCallStack();
    await thread2.fetchCallStack();
    thread1.clearCallStack();
    assert.strictEqual(thread1.stopped, true);
    assert.strictEqual(thread1.getCallStack().length, 0);
    thread2.clearCallStack();
    assert.strictEqual(thread2.stopped, true);
    assert.strictEqual(thread2.getCallStack().length, 0);
    model.clearThreads(session.getId(), true);
    assert.strictEqual(session.getThread(threadId1), void 0);
    assert.strictEqual(session.getThread(threadId2), void 0);
    assert.strictEqual(session.getAllThreads().length, 0);
  });
  test("allThreadsStopped in multiple events", async () => {
    const threadId1 = 1;
    const threadName1 = "firstThread";
    const threadId2 = 2;
    const threadName2 = "secondThread";
    const stoppedReason = "breakpoint";
    const session = createTestSession(model);
    disposables.add(session);
    model.addSession(session);
    session.raw = upcastPartial(mockRawSession);
    model.rawUpdate({
      sessionId: session.getId(),
      threads: [{
        id: threadId1,
        name: threadName1
      }, {
        id: threadId2,
        name: threadName2
      }],
      stoppedDetails: {
        reason: stoppedReason,
        threadId: threadId1,
        allThreadsStopped: true
      }
    });
    model.rawUpdate({
      sessionId: session.getId(),
      threads: [{
        id: threadId1,
        name: threadName1
      }, {
        id: threadId2,
        name: threadName2
      }],
      stoppedDetails: {
        reason: stoppedReason,
        threadId: threadId2,
        allThreadsStopped: true
      }
    });
    const thread1 = session.getThread(threadId1);
    const thread2 = session.getThread(threadId2);
    assert.strictEqual(thread1.stoppedDetails?.reason, stoppedReason);
    assert.strictEqual(thread2.stoppedDetails?.reason, stoppedReason);
  });
  test("threads multiple without allThreadsStopped", async () => {
    const sessionStub = sinon.spy(mockRawSession, "stackTrace");
    const stoppedThreadId = 1;
    const stoppedThreadName = "stoppedThread";
    const runningThreadId = 2;
    const runningThreadName = "runningThread";
    const stoppedReason = "breakpoint";
    const session = createTestSession(model);
    disposables.add(session);
    model.addSession(session);
    session.raw = upcastPartial(mockRawSession);
    model.rawUpdate({
      sessionId: session.getId(),
      threads: [{
        id: stoppedThreadId,
        name: stoppedThreadName
      }]
    });
    model.rawUpdate({
      sessionId: session.getId(),
      threads: [{
        id: 1,
        name: stoppedThreadName
      }, {
        id: runningThreadId,
        name: runningThreadName
      }],
      stoppedDetails: {
        reason: stoppedReason,
        threadId: 1,
        allThreadsStopped: false
      }
    });
    const stoppedThread = session.getThread(stoppedThreadId);
    const runningThread = session.getThread(runningThreadId);
    assert.strictEqual(stoppedThread.name, stoppedThreadName);
    assert.strictEqual(stoppedThread.stopped, true);
    assert.strictEqual(session.getAllThreads().length, 2);
    assert.strictEqual(stoppedThread.getCallStack().length, 0);
    assert.strictEqual(stoppedThread.stoppedDetails.reason, stoppedReason);
    assert.strictEqual(runningThread.name, runningThreadName);
    assert.strictEqual(runningThread.stopped, false);
    assert.strictEqual(runningThread.getCallStack().length, 0);
    assert.strictEqual(runningThread.stoppedDetails, void 0);
    await stoppedThread.fetchCallStack();
    assert.notStrictEqual(stoppedThread.getCallStack().length, 0);
    assert.strictEqual(runningThread.getCallStack().length, 0);
    assert.strictEqual(sessionStub.callCount, 1);
    await runningThread.fetchCallStack();
    assert.strictEqual(runningThread.getCallStack().length, 0);
    assert.strictEqual(sessionStub.callCount, 1);
    stoppedThread.clearCallStack();
    assert.strictEqual(stoppedThread.stopped, true);
    assert.strictEqual(stoppedThread.getCallStack().length, 0);
    model.clearThreads(session.getId(), true);
    assert.strictEqual(session.getThread(stoppedThreadId), void 0);
    assert.strictEqual(session.getThread(runningThreadId), void 0);
    assert.strictEqual(session.getAllThreads().length, 0);
  });
  test("stack frame get specific source name", () => {
    const session = createTestSession(model);
    disposables.add(session);
    model.addSession(session);
    const { firstStackFrame, secondStackFrame } = createTwoStackFrames(session);
    assert.strictEqual(getSpecificSourceName(firstStackFrame), ".../b/c/d/internalModule.js");
    assert.strictEqual(getSpecificSourceName(secondStackFrame), ".../x/c/d/internalModule.js");
  });
  test("stack frame toString()", () => {
    const session = createTestSession(model);
    disposables.add(session);
    const thread = new Thread(session, "mockthread", 1);
    const firstSource = new Source({
      name: "internalModule.js",
      path: "a/b/c/d/internalModule.js",
      sourceReference: 10
    }, "aDebugSessionId", mockUriIdentityService, new NullLogService());
    const stackFrame = new StackFrame(thread, 1, firstSource, "app", "normal", { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 }, 1, true);
    assert.strictEqual(stackFrame.toString(), "app (internalModule.js:1)");
    const secondSource = new Source(void 0, "aDebugSessionId", mockUriIdentityService, new NullLogService());
    const stackFrame2 = new StackFrame(thread, 2, secondSource, "module", "normal", { startLineNumber: void 0, startColumn: void 0, endLineNumber: void 0, endColumn: void 0 }, 2, true);
    assert.strictEqual(stackFrame2.toString(), "module");
  });
  test("debug child sessions are added in correct order", () => {
    const session = disposables.add(createTestSession(model));
    model.addSession(session);
    const secondSession = disposables.add(createTestSession(model, "mockSession2"));
    model.addSession(secondSession);
    const firstChild = disposables.add(createTestSession(model, "firstChild", { parentSession: session }));
    model.addSession(firstChild);
    const secondChild = disposables.add(createTestSession(model, "secondChild", { parentSession: session }));
    model.addSession(secondChild);
    const thirdSession = disposables.add(createTestSession(model, "mockSession3"));
    model.addSession(thirdSession);
    const anotherChild = disposables.add(createTestSession(model, "secondChild", { parentSession: secondSession }));
    model.addSession(anotherChild);
    const sessions = model.getSessions();
    assert.strictEqual(sessions[0].getId(), session.getId());
    assert.strictEqual(sessions[1].getId(), firstChild.getId());
    assert.strictEqual(sessions[2].getId(), secondChild.getId());
    assert.strictEqual(sessions[3].getId(), secondSession.getId());
    assert.strictEqual(sessions[4].getId(), anotherChild.getId());
    assert.strictEqual(sessions[5].getId(), thirdSession.getId());
  });
  test("replacing an inactive root session removes its child sessions", async () => {
    const oldRoot = createTestSession(model);
    model.addSession(oldRoot);
    const oldChild = createTestSession(model, "oldChild", { parentSession: oldRoot });
    model.addSession(oldChild);
    await oldChild.terminate();
    await oldRoot.terminate();
    const replacement = disposables.add(createTestSession(model));
    model.addSession(replacement);
    assert.deepStrictEqual(model.getSessions(true).map((session) => session.getId()), [replacement.getId()]);
  });
  test("adding a concurrent root session preserves inactive children of an active root session", async () => {
    const activeRoot = disposables.add(createTestSession(model));
    model.addSession(activeRoot);
    const inactiveChild = disposables.add(createTestSession(model, "inactiveChild", { parentSession: activeRoot }));
    model.addSession(inactiveChild);
    await inactiveChild.terminate();
    const concurrentRoot = disposables.add(createTestSession(model));
    model.addSession(concurrentRoot);
    assert.deepStrictEqual(model.getSessions(true).map((session) => session.getId()), [activeRoot.getId(), inactiveChild.getId(), concurrentRoot.getId()]);
  });
  test("decorations", () => {
    const session = createTestSession(model);
    disposables.add(session);
    model.addSession(session);
    const { firstStackFrame, secondStackFrame } = createTwoStackFrames(session);
    let decorations = createDecorationsForStackFrame(firstStackFrame, true, false);
    assert.strictEqual(decorations.length, 3);
    assert.deepStrictEqual(decorations[0].range, new Range(1, 2, 1, 3));
    assert.strictEqual(decorations[0].options.glyphMarginClassName, ThemeIcon.asClassName(debugStackframe));
    assert.deepStrictEqual(decorations[1].range, new Range(1, 2, 1, Constants.MAX_SAFE_SMALL_INTEGER));
    assert.strictEqual(decorations[1].options.className, "debug-top-stack-frame-line");
    assert.strictEqual(decorations[1].options.isWholeLine, true);
    decorations = createDecorationsForStackFrame(secondStackFrame, true, false);
    assert.strictEqual(decorations.length, 2);
    assert.deepStrictEqual(decorations[0].range, new Range(1, 2, 1, 3));
    assert.strictEqual(decorations[0].options.glyphMarginClassName, ThemeIcon.asClassName(debugStackframeFocused));
    assert.deepStrictEqual(decorations[1].range, new Range(1, 2, 1, Constants.MAX_SAFE_SMALL_INTEGER));
    assert.strictEqual(decorations[1].options.className, "debug-focused-stack-frame-line");
    assert.strictEqual(decorations[1].options.isWholeLine, true);
    decorations = createDecorationsForStackFrame(firstStackFrame, true, false);
    assert.strictEqual(decorations.length, 3);
    assert.deepStrictEqual(decorations[0].range, new Range(1, 2, 1, 3));
    assert.strictEqual(decorations[0].options.glyphMarginClassName, ThemeIcon.asClassName(debugStackframe));
    assert.deepStrictEqual(decorations[1].range, new Range(1, 2, 1, Constants.MAX_SAFE_SMALL_INTEGER));
    assert.strictEqual(decorations[1].options.className, "debug-top-stack-frame-line");
    assert.strictEqual(decorations[1].options.isWholeLine, true);
    assert.strictEqual(decorations[2].options.before?.inlineClassName, "debug-top-stack-frame-column");
    assert.deepStrictEqual(decorations[2].range, new Range(1, 2, 1, Constants.MAX_SAFE_SMALL_INTEGER));
  });
  test("contexts", () => {
    const session = createTestSession(model);
    disposables.add(session);
    model.addSession(session);
    const { firstStackFrame, secondStackFrame } = createTwoStackFrames(session);
    let context = getContext(firstStackFrame);
    assert.strictEqual(context?.sessionId, firstStackFrame.thread.session.getId());
    assert.strictEqual(context?.threadId, firstStackFrame.thread.getId());
    assert.strictEqual(context?.frameId, firstStackFrame.getId());
    context = getContext(secondStackFrame.thread);
    assert.strictEqual(context?.sessionId, secondStackFrame.thread.session.getId());
    assert.strictEqual(context?.threadId, secondStackFrame.thread.getId());
    assert.strictEqual(context?.frameId, void 0);
    context = getContext(session);
    assert.strictEqual(context?.sessionId, session.getId());
    assert.strictEqual(context?.threadId, void 0);
    assert.strictEqual(context?.frameId, void 0);
    let contributedContext = getContextForContributedActions(firstStackFrame);
    assert.strictEqual(contributedContext, firstStackFrame.source.raw.path);
    contributedContext = getContextForContributedActions(firstStackFrame.thread);
    assert.strictEqual(contributedContext, firstStackFrame.thread.threadId);
    contributedContext = getContextForContributedActions(session);
    assert.strictEqual(contributedContext, session.getId());
  });
  test("focusStackFrameThreadAndSession", () => {
    const threadId1 = 1;
    const threadName1 = "firstThread";
    const threadId2 = 2;
    const threadName2 = "secondThread";
    const stoppedReason = "breakpoint";
    const session = new class extends DebugSession {
      get state() {
        return State.Stopped;
      }
    }(generateUuid(), { resolved: { name: "stoppedSession", type: "node", request: "launch" }, unresolved: void 0 }, void 0, model, void 0, void 0, void 0, void 0, void 0, void 0, mockWorkspaceContextService, void 0, void 0, void 0, mockUriIdentityService, new TestInstantiationService(), void 0, void 0, new NullLogService(), void 0, void 0, new TestAccessibilityService());
    disposables.add(session);
    const runningSession = createTestSession(model);
    disposables.add(runningSession);
    model.addSession(runningSession);
    model.addSession(session);
    session.raw = upcastPartial(mockRawSession);
    model.rawUpdate({
      sessionId: session.getId(),
      threads: [{
        id: threadId1,
        name: threadName1
      }]
    });
    model.rawUpdate({
      sessionId: session.getId(),
      threads: [{
        id: threadId1,
        name: threadName1
      }, {
        id: threadId2,
        name: threadName2
      }],
      stoppedDetails: {
        reason: stoppedReason,
        threadId: 1,
        allThreadsStopped: true
      }
    });
    const thread = session.getThread(threadId1);
    const runningThread = session.getThread(threadId2);
    let toFocus = getStackFrameThreadAndSessionToFocus(model, void 0);
    assert.deepStrictEqual(toFocus, { stackFrame: void 0, thread, session });
    toFocus = getStackFrameThreadAndSessionToFocus(model, void 0, void 0, runningSession);
    assert.deepStrictEqual(toFocus, { stackFrame: void 0, thread: void 0, session: runningSession });
    toFocus = getStackFrameThreadAndSessionToFocus(model, void 0, thread);
    assert.deepStrictEqual(toFocus, { stackFrame: void 0, thread, session });
    toFocus = getStackFrameThreadAndSessionToFocus(model, void 0, runningThread);
    assert.deepStrictEqual(toFocus, { stackFrame: void 0, thread: runningThread, session });
    const stackFrame = new StackFrame(thread, 5, void 0, "stackframename2", void 0, void 0, 1, true);
    toFocus = getStackFrameThreadAndSessionToFocus(model, stackFrame);
    assert.deepStrictEqual(toFocus, { stackFrame, thread, session });
  });
});
export {
  createTestSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxicm93c2VyXFxjYWxsU3RhY2sudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgdXBjYXN0RGVlcFBhcnRpYWwsIHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L3Rlc3QvY29tbW9uL3Rlc3RBY2Nlc3NpYmlsaXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRpb25zRm9yU3RhY2tGcmFtZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY2FsbFN0YWNrRWRpdG9yQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IGdldENvbnRleHQsIGdldENvbnRleHRGb3JDb250cmlidXRlZEFjdGlvbnMsIGdldFNwZWNpZmljU291cmNlTmFtZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY2FsbFN0YWNrVmlldy5qcyc7XG5pbXBvcnQgeyBkZWJ1Z1N0YWNrZnJhbWUsIGRlYnVnU3RhY2tmcmFtZUZvY3VzZWQgfSBmcm9tICcuLi8uLi9icm93c2VyL2RlYnVnSWNvbnMuanMnO1xuaW1wb3J0IHsgZ2V0U3RhY2tGcmFtZVRocmVhZEFuZFNlc3Npb25Ub0ZvY3VzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9kZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGVidWdTZXNzaW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9kZWJ1Z1Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbk9wdGlvbnMsIFN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IERlYnVnTW9kZWwsIFN0YWNrRnJhbWUsIFRocmVhZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IFNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9kZWJ1Z1NvdXJjZS5qcyc7XG5pbXBvcnQgeyBNb2NrUmF3U2Vzc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9tb2NrRGVidWcuanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9ja0RlYnVnTW9kZWwsIG1vY2tVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuL21vY2tEZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IFJhd0RlYnVnU2Vzc2lvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmF3RGVidWdTZXNzaW9uLmpzJztcblxuY29uc3QgbW9ja1dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gdXBjYXN0RGVlcFBhcnRpYWw8SVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlPih7XG5cdGdldFdvcmtzcGFjZTogKCkgPT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRmb2xkZXJzOiBbXVxuXHRcdH07XG5cdH1cbn0pO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGVzdFNlc3Npb24obW9kZWw6IERlYnVnTW9kZWwsIG5hbWUgPSAnbW9ja1Nlc3Npb24nLCBvcHRpb25zPzogSURlYnVnU2Vzc2lvbk9wdGlvbnMpOiBEZWJ1Z1Nlc3Npb24ge1xuXHRyZXR1cm4gbmV3IERlYnVnU2Vzc2lvbihnZW5lcmF0ZVV1aWQoKSwgeyByZXNvbHZlZDogeyBuYW1lLCB0eXBlOiAnbm9kZScsIHJlcXVlc3Q6ICdsYXVuY2gnIH0sIHVucmVzb2x2ZWQ6IHVuZGVmaW5lZCB9LCB1bmRlZmluZWQsIG1vZGVsLCBvcHRpb25zLCB7XG5cdFx0Z2V0Vmlld01vZGVsKCk6IGFueSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cGRhdGVWaWV3cygpOiB2b2lkIHtcblx0XHRcdFx0XHQvLyBub29wXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXHR9IGFzIElEZWJ1Z1NlcnZpY2UsIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCEsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBkZWJ1ZzogeyBjb25zb2xlOiB7IGNvbGxhcHNlSWRlbnRpY2FsTGluZXM6IHRydWUgfSB9IH0pLCB1bmRlZmluZWQhLCBtb2NrV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCEsIG1vY2tVcmlJZGVudGl0eVNlcnZpY2UsIG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSwgdW5kZWZpbmVkISwgdW5kZWZpbmVkISwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCEsIG5ldyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UoKSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVR3b1N0YWNrRnJhbWVzKHNlc3Npb246IERlYnVnU2Vzc2lvbik6IHsgZmlyc3RTdGFja0ZyYW1lOiBTdGFja0ZyYW1lOyBzZWNvbmRTdGFja0ZyYW1lOiBTdGFja0ZyYW1lIH0ge1xuXHRjb25zdCB0aHJlYWQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUaHJlYWQge1xuXHRcdHB1YmxpYyBvdmVycmlkZSBnZXRDYWxsU3RhY2soKTogU3RhY2tGcmFtZVtdIHtcblx0XHRcdHJldHVybiBbZmlyc3RTdGFja0ZyYW1lLCBzZWNvbmRTdGFja0ZyYW1lXTtcblx0XHR9XG5cdH0oc2Vzc2lvbiwgJ21vY2t0aHJlYWQnLCAxKTtcblxuXHRjb25zdCBmaXJzdFNvdXJjZSA9IG5ldyBTb3VyY2Uoe1xuXHRcdG5hbWU6ICdpbnRlcm5hbE1vZHVsZS5qcycsXG5cdFx0cGF0aDogJ2EvYi9jL2QvaW50ZXJuYWxNb2R1bGUuanMnLFxuXHRcdHNvdXJjZVJlZmVyZW5jZTogMTAsXG5cdH0sICdhRGVidWdTZXNzaW9uSWQnLCBtb2NrVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdGNvbnN0IHNlY29uZFNvdXJjZSA9IG5ldyBTb3VyY2Uoe1xuXHRcdG5hbWU6ICdpbnRlcm5hbE1vZHVsZS5qcycsXG5cdFx0cGF0aDogJ3oveC9jL2QvaW50ZXJuYWxNb2R1bGUuanMnLFxuXHRcdHNvdXJjZVJlZmVyZW5jZTogMTEsXG5cdH0sICdhRGVidWdTZXNzaW9uSWQnLCBtb2NrVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0Y29uc3QgZmlyc3RTdGFja0ZyYW1lID0gbmV3IFN0YWNrRnJhbWUodGhyZWFkLCAwLCBmaXJzdFNvdXJjZSwgJ2FwcC5qcycsICdub3JtYWwnLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDIsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMTAgfSwgMCwgdHJ1ZSk7XG5cdGNvbnN0IHNlY29uZFN0YWNrRnJhbWUgPSBuZXcgU3RhY2tGcmFtZSh0aHJlYWQsIDEsIHNlY29uZFNvdXJjZSwgJ2FwcDIuanMnLCAnbm9ybWFsJywgeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAyLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEwIH0sIDEsIHRydWUpO1xuXG5cdHJldHVybiB7IGZpcnN0U3RhY2tGcmFtZSwgc2Vjb25kU3RhY2tGcmFtZSB9O1xufVxuXG5zdWl0ZSgnRGVidWcgLSBDYWxsU3RhY2snLCAoKSA9PiB7XG5cdGxldCBtb2RlbDogRGVidWdNb2RlbDtcblx0bGV0IG1vY2tSYXdTZXNzaW9uOiBNb2NrUmF3U2Vzc2lvbjtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bW9kZWwgPSBjcmVhdGVNb2NrRGVidWdNb2RlbChkaXNwb3NhYmxlcyk7XG5cdFx0bW9ja1Jhd1Nlc3Npb24gPSBuZXcgTW9ja1Jhd1Nlc3Npb24oKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSk7XG5cblx0Ly8gVGhyZWFkc1xuXG5cdHRlc3QoJ3RocmVhZHMgc2ltcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRocmVhZElkID0gMTtcblx0XHRjb25zdCB0aHJlYWROYW1lID0gJ2ZpcnN0VGhyZWFkJztcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlVGVzdFNlc3Npb24obW9kZWwpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFNlc3Npb25zKHRydWUpLmxlbmd0aCwgMSk7XG5cdFx0bW9kZWwucmF3VXBkYXRlKHtcblx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbi5nZXRJZCgpLFxuXHRcdFx0dGhyZWFkczogW3tcblx0XHRcdFx0aWQ6IHRocmVhZElkLFxuXHRcdFx0XHRuYW1lOiB0aHJlYWROYW1lXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uZ2V0VGhyZWFkKHRocmVhZElkKSEubmFtZSwgdGhyZWFkTmFtZSk7XG5cblx0XHRtb2RlbC5jbGVhclRocmVhZHMoc2Vzc2lvbi5nZXRJZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5nZXRUaHJlYWQodGhyZWFkSWQpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRTZXNzaW9ucyh0cnVlKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aHJlYWRzIG11bHRpcGxlIHdpdGggYWxsVGhyZWFkc1N0b3BwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGhyZWFkSWQxID0gMTtcblx0XHRjb25zdCB0aHJlYWROYW1lMSA9ICdmaXJzdFRocmVhZCc7XG5cdFx0Y29uc3QgdGhyZWFkSWQyID0gMjtcblx0XHRjb25zdCB0aHJlYWROYW1lMiA9ICdzZWNvbmRUaHJlYWQnO1xuXHRcdGNvbnN0IHN0b3BwZWRSZWFzb24gPSAnYnJlYWtwb2ludCc7XG5cblx0XHQvLyBBZGQgdGhlIHRocmVhZHNcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlVGVzdFNlc3Npb24obW9kZWwpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0c2Vzc2lvbi5yYXcgPSB1cGNhc3RQYXJ0aWFsPFJhd0RlYnVnU2Vzc2lvbj4obW9ja1Jhd1Nlc3Npb24pO1xuXG5cdFx0bW9kZWwucmF3VXBkYXRlKHtcblx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbi5nZXRJZCgpLFxuXHRcdFx0dGhyZWFkczogW3tcblx0XHRcdFx0aWQ6IHRocmVhZElkMSxcblx0XHRcdFx0bmFtZTogdGhyZWFkTmFtZTFcblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0XHQvLyBTdG9wcGVkIGV2ZW50IHdpdGggYWxsIHRocmVhZHMgc3RvcHBlZFxuXHRcdG1vZGVsLnJhd1VwZGF0ZSh7XG5cdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uZ2V0SWQoKSxcblx0XHRcdHRocmVhZHM6IFt7XG5cdFx0XHRcdGlkOiB0aHJlYWRJZDEsXG5cdFx0XHRcdG5hbWU6IHRocmVhZE5hbWUxXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiB0aHJlYWRJZDIsXG5cdFx0XHRcdG5hbWU6IHRocmVhZE5hbWUyXG5cdFx0XHR9XSxcblx0XHRcdHN0b3BwZWREZXRhaWxzOiB7XG5cdFx0XHRcdHJlYXNvbjogc3RvcHBlZFJlYXNvbixcblx0XHRcdFx0dGhyZWFkSWQ6IDEsXG5cdFx0XHRcdGFsbFRocmVhZHNTdG9wcGVkOiB0cnVlXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGhyZWFkMSA9IHNlc3Npb24uZ2V0VGhyZWFkKHRocmVhZElkMSkhO1xuXHRcdGNvbnN0IHRocmVhZDIgPSBzZXNzaW9uLmdldFRocmVhZCh0aHJlYWRJZDIpITtcblxuXHRcdC8vIGF0IHRoZSBiZWdpbm5pbmcsIGNhbGxzdGFja3MgYXJlIG9idGFpbmFibGUgYnV0IG5vdCBhdmFpbGFibGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5nZXRBbGxUaHJlYWRzKCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWFkMS5uYW1lLCB0aHJlYWROYW1lMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDEuc3RvcHBlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDEuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWFkMS5zdG9wcGVkRGV0YWlscyEucmVhc29uLCBzdG9wcGVkUmVhc29uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWFkMi5uYW1lLCB0aHJlYWROYW1lMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDIuc3RvcHBlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDIuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWFkMi5zdG9wcGVkRGV0YWlscyEucmVhc29uLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gYWZ0ZXIgY2FsbGluZyBnZXRDYWxsU3RhY2ssIHRoZSBjYWxsc3RhY2sgYmVjb21lcyBhdmFpbGFibGVcblx0XHQvLyBhbmQgcmVzdWx0cyBpbiBhIHJlcXVlc3QgZm9yIHRoZSBjYWxsc3RhY2sgaW4gdGhlIGRlYnVnIGFkYXB0ZXJcblx0XHRhd2FpdCB0aHJlYWQxLmZldGNoQ2FsbFN0YWNrKCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRocmVhZDEuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoLCAwKTtcblxuXHRcdGF3YWl0IHRocmVhZDIuZmV0Y2hDYWxsU3RhY2soKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGhyZWFkMi5nZXRDYWxsU3RhY2soKS5sZW5ndGgsIDApO1xuXG5cdFx0Ly8gY2FsbGluZyBtdWx0aXBsZSB0aW1lcyBnZXRDYWxsU3RhY2sgZG9lc24ndCByZXN1bHQgaW4gbXVsdGlwbGUgY2FsbHNcblx0XHQvLyB0byB0aGUgZGVidWcgYWRhcHRlclxuXHRcdGF3YWl0IHRocmVhZDEuZmV0Y2hDYWxsU3RhY2soKTtcblx0XHRhd2FpdCB0aHJlYWQyLmZldGNoQ2FsbFN0YWNrKCk7XG5cblx0XHQvLyBjbGVhcmluZyB0aGUgY2FsbHN0YWNrIHJlc3VsdHMgaW4gdGhlIGNhbGxzdGFjayBub3QgYmVpbmcgYXZhaWxhYmxlXG5cdFx0dGhyZWFkMS5jbGVhckNhbGxTdGFjaygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWQxLnN0b3BwZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWQxLmdldENhbGxTdGFjaygpLmxlbmd0aCwgMCk7XG5cblx0XHR0aHJlYWQyLmNsZWFyQ2FsbFN0YWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDIuc3RvcHBlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDIuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoLCAwKTtcblxuXHRcdG1vZGVsLmNsZWFyVGhyZWFkcyhzZXNzaW9uLmdldElkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmdldFRocmVhZCh0aHJlYWRJZDEpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmdldFRocmVhZCh0aHJlYWRJZDIpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmdldEFsbFRocmVhZHMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxUaHJlYWRzU3RvcHBlZCBpbiBtdWx0aXBsZSBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGhyZWFkSWQxID0gMTtcblx0XHRjb25zdCB0aHJlYWROYW1lMSA9ICdmaXJzdFRocmVhZCc7XG5cdFx0Y29uc3QgdGhyZWFkSWQyID0gMjtcblx0XHRjb25zdCB0aHJlYWROYW1lMiA9ICdzZWNvbmRUaHJlYWQnO1xuXHRcdGNvbnN0IHN0b3BwZWRSZWFzb24gPSAnYnJlYWtwb2ludCc7XG5cblx0XHQvLyBBZGQgdGhlIHRocmVhZHNcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlVGVzdFNlc3Npb24obW9kZWwpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0c2Vzc2lvbi5yYXcgPSB1cGNhc3RQYXJ0aWFsPFJhd0RlYnVnU2Vzc2lvbj4obW9ja1Jhd1Nlc3Npb24pO1xuXG5cdFx0Ly8gU3RvcHBlZCBldmVudCB3aXRoIGFsbCB0aHJlYWRzIHN0b3BwZWRcblx0XHRtb2RlbC5yYXdVcGRhdGUoe1xuXHRcdFx0c2Vzc2lvbklkOiBzZXNzaW9uLmdldElkKCksXG5cdFx0XHR0aHJlYWRzOiBbe1xuXHRcdFx0XHRpZDogdGhyZWFkSWQxLFxuXHRcdFx0XHRuYW1lOiB0aHJlYWROYW1lMVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogdGhyZWFkSWQyLFxuXHRcdFx0XHRuYW1lOiB0aHJlYWROYW1lMlxuXHRcdFx0fV0sXG5cdFx0XHRzdG9wcGVkRGV0YWlsczoge1xuXHRcdFx0XHRyZWFzb246IHN0b3BwZWRSZWFzb24sXG5cdFx0XHRcdHRocmVhZElkOiB0aHJlYWRJZDEsXG5cdFx0XHRcdGFsbFRocmVhZHNTdG9wcGVkOiB0cnVlXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0bW9kZWwucmF3VXBkYXRlKHtcblx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbi5nZXRJZCgpLFxuXHRcdFx0dGhyZWFkczogW3tcblx0XHRcdFx0aWQ6IHRocmVhZElkMSxcblx0XHRcdFx0bmFtZTogdGhyZWFkTmFtZTFcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IHRocmVhZElkMixcblx0XHRcdFx0bmFtZTogdGhyZWFkTmFtZTJcblx0XHRcdH1dLFxuXHRcdFx0c3RvcHBlZERldGFpbHM6IHtcblx0XHRcdFx0cmVhc29uOiBzdG9wcGVkUmVhc29uLFxuXHRcdFx0XHR0aHJlYWRJZDogdGhyZWFkSWQyLFxuXHRcdFx0XHRhbGxUaHJlYWRzU3RvcHBlZDogdHJ1ZVxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRocmVhZDEgPSBzZXNzaW9uLmdldFRocmVhZCh0aHJlYWRJZDEpITtcblx0XHRjb25zdCB0aHJlYWQyID0gc2Vzc2lvbi5nZXRUaHJlYWQodGhyZWFkSWQyKSE7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWFkMS5zdG9wcGVkRGV0YWlscz8ucmVhc29uLCBzdG9wcGVkUmVhc29uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWFkMi5zdG9wcGVkRGV0YWlscz8ucmVhc29uLCBzdG9wcGVkUmVhc29uKTtcblx0fSk7XG5cblx0dGVzdCgndGhyZWFkcyBtdWx0aXBsZSB3aXRob3V0IGFsbFRocmVhZHNTdG9wcGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdHViID0gc2lub24uc3B5KG1vY2tSYXdTZXNzaW9uLCAnc3RhY2tUcmFjZScpO1xuXG5cdFx0Y29uc3Qgc3RvcHBlZFRocmVhZElkID0gMTtcblx0XHRjb25zdCBzdG9wcGVkVGhyZWFkTmFtZSA9ICdzdG9wcGVkVGhyZWFkJztcblx0XHRjb25zdCBydW5uaW5nVGhyZWFkSWQgPSAyO1xuXHRcdGNvbnN0IHJ1bm5pbmdUaHJlYWROYW1lID0gJ3J1bm5pbmdUaHJlYWQnO1xuXHRcdGNvbnN0IHN0b3BwZWRSZWFzb24gPSAnYnJlYWtwb2ludCc7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVRlc3RTZXNzaW9uKG1vZGVsKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbik7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdHNlc3Npb24ucmF3ID0gdXBjYXN0UGFydGlhbDxSYXdEZWJ1Z1Nlc3Npb24+KG1vY2tSYXdTZXNzaW9uKTtcblxuXHRcdC8vIEFkZCB0aGUgdGhyZWFkc1xuXHRcdG1vZGVsLnJhd1VwZGF0ZSh7XG5cdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uZ2V0SWQoKSxcblx0XHRcdHRocmVhZHM6IFt7XG5cdFx0XHRcdGlkOiBzdG9wcGVkVGhyZWFkSWQsXG5cdFx0XHRcdG5hbWU6IHN0b3BwZWRUaHJlYWROYW1lXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Ly8gU3RvcHBlZCBldmVudCB3aXRoIG9ubHkgb25lIHRocmVhZCBzdG9wcGVkXG5cdFx0bW9kZWwucmF3VXBkYXRlKHtcblx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbi5nZXRJZCgpLFxuXHRcdFx0dGhyZWFkczogW3tcblx0XHRcdFx0aWQ6IDEsXG5cdFx0XHRcdG5hbWU6IHN0b3BwZWRUaHJlYWROYW1lXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBydW5uaW5nVGhyZWFkSWQsXG5cdFx0XHRcdG5hbWU6IHJ1bm5pbmdUaHJlYWROYW1lXG5cdFx0XHR9XSxcblx0XHRcdHN0b3BwZWREZXRhaWxzOiB7XG5cdFx0XHRcdHJlYXNvbjogc3RvcHBlZFJlYXNvbixcblx0XHRcdFx0dGhyZWFkSWQ6IDEsXG5cdFx0XHRcdGFsbFRocmVhZHNTdG9wcGVkOiBmYWxzZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RvcHBlZFRocmVhZCA9IHNlc3Npb24uZ2V0VGhyZWFkKHN0b3BwZWRUaHJlYWRJZCkhO1xuXHRcdGNvbnN0IHJ1bm5pbmdUaHJlYWQgPSBzZXNzaW9uLmdldFRocmVhZChydW5uaW5nVGhyZWFkSWQpITtcblxuXHRcdC8vIHRoZSBjYWxsc3RhY2sgZm9yIHRoZSBzdG9wcGVkIHRocmVhZCBpcyBvYnRhaW5hYmxlIGJ1dCBub3QgYXZhaWxhYmxlXG5cdFx0Ly8gdGhlIGNhbGxzdGFjayBmb3IgdGhlIHJ1bm5pbmcgdGhyZWFkIGlzIG5vdCBvYnRhaW5hYmxlIG5vciBhdmFpbGFibGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcHBlZFRocmVhZC5uYW1lLCBzdG9wcGVkVGhyZWFkTmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3BwZWRUaHJlYWQuc3RvcHBlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uZ2V0QWxsVGhyZWFkcygpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3BwZWRUaHJlYWQuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcHBlZFRocmVhZC5zdG9wcGVkRGV0YWlscyEucmVhc29uLCBzdG9wcGVkUmVhc29uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmluZ1RocmVhZC5uYW1lLCBydW5uaW5nVGhyZWFkTmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5pbmdUaHJlYWQuc3RvcHBlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uaW5nVGhyZWFkLmdldENhbGxTdGFjaygpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5pbmdUaHJlYWQuc3RvcHBlZERldGFpbHMsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBhZnRlciBjYWxsaW5nIGdldENhbGxTdGFjaywgdGhlIGNhbGxzdGFjayBiZWNvbWVzIGF2YWlsYWJsZVxuXHRcdC8vIGFuZCByZXN1bHRzIGluIGEgcmVxdWVzdCBmb3IgdGhlIGNhbGxzdGFjayBpbiB0aGUgZGVidWcgYWRhcHRlclxuXHRcdGF3YWl0IHN0b3BwZWRUaHJlYWQuZmV0Y2hDYWxsU3RhY2soKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc3RvcHBlZFRocmVhZC5nZXRDYWxsU3RhY2soKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uaW5nVGhyZWFkLmdldENhbGxTdGFjaygpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25TdHViLmNhbGxDb3VudCwgMSk7XG5cblx0XHQvLyBjYWxsaW5nIGdldENhbGxTdGFjayBvbiB0aGUgcnVubmluZyB0aHJlYWQgcmV0dXJucyBlbXB0eSBhcnJheVxuXHRcdC8vIGFuZCBkb2VzIG5vdCByZXR1cm4gaW4gYSByZXF1ZXN0IGZvciB0aGUgY2FsbHN0YWNrIGluIHRoZSBkZWJ1Z1xuXHRcdC8vIGFkYXB0ZXJcblx0XHRhd2FpdCBydW5uaW5nVGhyZWFkLmZldGNoQ2FsbFN0YWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5pbmdUaHJlYWQuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvblN0dWIuY2FsbENvdW50LCAxKTtcblxuXHRcdC8vIGNsZWFyaW5nIHRoZSBjYWxsc3RhY2sgcmVzdWx0cyBpbiB0aGUgY2FsbHN0YWNrIG5vdCBiZWluZyBhdmFpbGFibGVcblx0XHRzdG9wcGVkVGhyZWFkLmNsZWFyQ2FsbFN0YWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3BwZWRUaHJlYWQuc3RvcHBlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3BwZWRUaHJlYWQuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoLCAwKTtcblxuXHRcdG1vZGVsLmNsZWFyVGhyZWFkcyhzZXNzaW9uLmdldElkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmdldFRocmVhZChzdG9wcGVkVGhyZWFkSWQpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmdldFRocmVhZChydW5uaW5nVGhyZWFkSWQpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmdldEFsbFRocmVhZHMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFjayBmcmFtZSBnZXQgc3BlY2lmaWMgc291cmNlIG5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVRlc3RTZXNzaW9uKG1vZGVsKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbik7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRjb25zdCB7IGZpcnN0U3RhY2tGcmFtZSwgc2Vjb25kU3RhY2tGcmFtZSB9ID0gY3JlYXRlVHdvU3RhY2tGcmFtZXMoc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U3BlY2lmaWNTb3VyY2VOYW1lKGZpcnN0U3RhY2tGcmFtZSksICcuLi4vYi9jL2QvaW50ZXJuYWxNb2R1bGUuanMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U3BlY2lmaWNTb3VyY2VOYW1lKHNlY29uZFN0YWNrRnJhbWUpLCAnLi4uL3gvYy9kL2ludGVybmFsTW9kdWxlLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YWNrIGZyYW1lIHRvU3RyaW5nKCknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVRlc3RTZXNzaW9uKG1vZGVsKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgdGhyZWFkID0gbmV3IFRocmVhZChzZXNzaW9uLCAnbW9ja3RocmVhZCcsIDEpO1xuXHRcdGNvbnN0IGZpcnN0U291cmNlID0gbmV3IFNvdXJjZSh7XG5cdFx0XHRuYW1lOiAnaW50ZXJuYWxNb2R1bGUuanMnLFxuXHRcdFx0cGF0aDogJ2EvYi9jL2QvaW50ZXJuYWxNb2R1bGUuanMnLFxuXHRcdFx0c291cmNlUmVmZXJlbmNlOiAxMCxcblx0XHR9LCAnYURlYnVnU2Vzc2lvbklkJywgbW9ja1VyaUlkZW50aXR5U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHN0YWNrRnJhbWUgPSBuZXcgU3RhY2tGcmFtZSh0aHJlYWQsIDEsIGZpcnN0U291cmNlLCAnYXBwJywgJ25vcm1hbCcsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxMCB9LCAxLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhY2tGcmFtZS50b1N0cmluZygpLCAnYXBwIChpbnRlcm5hbE1vZHVsZS5qczoxKScpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kU291cmNlID0gbmV3IFNvdXJjZSh1bmRlZmluZWQsICdhRGVidWdTZXNzaW9uSWQnLCBtb2NrVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RhY2tGcmFtZTIgPSBuZXcgU3RhY2tGcmFtZSh0aHJlYWQsIDIsIHNlY29uZFNvdXJjZSwgJ21vZHVsZScsICdub3JtYWwnLCB7IHN0YXJ0TGluZU51bWJlcjogdW5kZWZpbmVkISwgc3RhcnRDb2x1bW46IHVuZGVmaW5lZCEsIGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZCEsIGVuZENvbHVtbjogdW5kZWZpbmVkISB9LCAyLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhY2tGcmFtZTIudG9TdHJpbmcoKSwgJ21vZHVsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWJ1ZyBjaGlsZCBzZXNzaW9ucyBhcmUgYWRkZWQgaW4gY29ycmVjdCBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RTZXNzaW9uKG1vZGVsKSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RTZXNzaW9uKG1vZGVsLCAnbW9ja1Nlc3Npb24yJykpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oc2Vjb25kU2Vzc2lvbik7XG5cdFx0Y29uc3QgZmlyc3RDaGlsZCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0U2Vzc2lvbihtb2RlbCwgJ2ZpcnN0Q2hpbGQnLCB7IHBhcmVudFNlc3Npb246IHNlc3Npb24gfSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oZmlyc3RDaGlsZCk7XG5cdFx0Y29uc3Qgc2Vjb25kQ2hpbGQgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFNlc3Npb24obW9kZWwsICdzZWNvbmRDaGlsZCcsIHsgcGFyZW50U2Vzc2lvbjogc2Vzc2lvbiB9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihzZWNvbmRDaGlsZCk7XG5cdFx0Y29uc3QgdGhpcmRTZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RTZXNzaW9uKG1vZGVsLCAnbW9ja1Nlc3Npb24zJykpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24odGhpcmRTZXNzaW9uKTtcblx0XHRjb25zdCBhbm90aGVyQ2hpbGQgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFNlc3Npb24obW9kZWwsICdzZWNvbmRDaGlsZCcsIHsgcGFyZW50U2Vzc2lvbjogc2Vjb25kU2Vzc2lvbiB9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihhbm90aGVyQ2hpbGQpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBtb2RlbC5nZXRTZXNzaW9ucygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5nZXRJZCgpLCBzZXNzaW9uLmdldElkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1sxXS5nZXRJZCgpLCBmaXJzdENoaWxkLmdldElkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1syXS5nZXRJZCgpLCBzZWNvbmRDaGlsZC5nZXRJZCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbM10uZ2V0SWQoKSwgc2Vjb25kU2Vzc2lvbi5nZXRJZCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbNF0uZ2V0SWQoKSwgYW5vdGhlckNoaWxkLmdldElkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1s1XS5nZXRJZCgpLCB0aGlyZFNlc3Npb24uZ2V0SWQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2luZyBhbiBpbmFjdGl2ZSByb290IHNlc3Npb24gcmVtb3ZlcyBpdHMgY2hpbGQgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb2xkUm9vdCA9IGNyZWF0ZVRlc3RTZXNzaW9uKG1vZGVsKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKG9sZFJvb3QpO1xuXHRcdGNvbnN0IG9sZENoaWxkID0gY3JlYXRlVGVzdFNlc3Npb24obW9kZWwsICdvbGRDaGlsZCcsIHsgcGFyZW50U2Vzc2lvbjogb2xkUm9vdCB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKG9sZENoaWxkKTtcblx0XHRhd2FpdCBvbGRDaGlsZC50ZXJtaW5hdGUoKTtcblx0XHRhd2FpdCBvbGRSb290LnRlcm1pbmF0ZSgpO1xuXG5cdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFNlc3Npb24obW9kZWwpKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKHJlcGxhY2VtZW50KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0U2Vzc2lvbnModHJ1ZSkubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5nZXRJZCgpKSwgW3JlcGxhY2VtZW50LmdldElkKCldKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkaW5nIGEgY29uY3VycmVudCByb290IHNlc3Npb24gcHJlc2VydmVzIGluYWN0aXZlIGNoaWxkcmVuIG9mIGFuIGFjdGl2ZSByb290IHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0aXZlUm9vdCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0U2Vzc2lvbihtb2RlbCkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oYWN0aXZlUm9vdCk7XG5cdFx0Y29uc3QgaW5hY3RpdmVDaGlsZCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0U2Vzc2lvbihtb2RlbCwgJ2luYWN0aXZlQ2hpbGQnLCB7IHBhcmVudFNlc3Npb246IGFjdGl2ZVJvb3QgfSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oaW5hY3RpdmVDaGlsZCk7XG5cdFx0YXdhaXQgaW5hY3RpdmVDaGlsZC50ZXJtaW5hdGUoKTtcblxuXHRcdGNvbnN0IGNvbmN1cnJlbnRSb290ID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RTZXNzaW9uKG1vZGVsKSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjb25jdXJyZW50Um9vdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFNlc3Npb25zKHRydWUpLm1hcChzZXNzaW9uID0+IHNlc3Npb24uZ2V0SWQoKSksIFthY3RpdmVSb290LmdldElkKCksIGluYWN0aXZlQ2hpbGQuZ2V0SWQoKSwgY29uY3VycmVudFJvb3QuZ2V0SWQoKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlVGVzdFNlc3Npb24obW9kZWwpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgZmlyc3RTdGFja0ZyYW1lLCBzZWNvbmRTdGFja0ZyYW1lIH0gPSBjcmVhdGVUd29TdGFja0ZyYW1lcyhzZXNzaW9uKTtcblx0XHRsZXQgZGVjb3JhdGlvbnMgPSBjcmVhdGVEZWNvcmF0aW9uc0ZvclN0YWNrRnJhbWUoZmlyc3RTdGFja0ZyYW1lLCB0cnVlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWNvcmF0aW9uc1swXS5yYW5nZSwgbmV3IFJhbmdlKDEsIDIsIDEsIDMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVjb3JhdGlvbnNbMF0ub3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGRlYnVnU3RhY2tmcmFtZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb3JhdGlvbnNbMV0ucmFuZ2UsIG5ldyBSYW5nZSgxLCAyLCAxLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWNvcmF0aW9uc1sxXS5vcHRpb25zLmNsYXNzTmFtZSwgJ2RlYnVnLXRvcC1zdGFjay1mcmFtZS1saW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zWzFdLm9wdGlvbnMuaXNXaG9sZUxpbmUsIHRydWUpO1xuXG5cdFx0ZGVjb3JhdGlvbnMgPSBjcmVhdGVEZWNvcmF0aW9uc0ZvclN0YWNrRnJhbWUoc2Vjb25kU3RhY2tGcmFtZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWNvcmF0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb3JhdGlvbnNbMF0ucmFuZ2UsIG5ldyBSYW5nZSgxLCAyLCAxLCAzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zWzBdLm9wdGlvbnMuZ2x5cGhNYXJnaW5DbGFzc05hbWUsIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShkZWJ1Z1N0YWNrZnJhbWVGb2N1c2VkKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWNvcmF0aW9uc1sxXS5yYW5nZSwgbmV3IFJhbmdlKDEsIDIsIDEsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zWzFdLm9wdGlvbnMuY2xhc3NOYW1lLCAnZGVidWctZm9jdXNlZC1zdGFjay1mcmFtZS1saW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zWzFdLm9wdGlvbnMuaXNXaG9sZUxpbmUsIHRydWUpO1xuXG5cdFx0ZGVjb3JhdGlvbnMgPSBjcmVhdGVEZWNvcmF0aW9uc0ZvclN0YWNrRnJhbWUoZmlyc3RTdGFja0ZyYW1lLCB0cnVlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWNvcmF0aW9uc1swXS5yYW5nZSwgbmV3IFJhbmdlKDEsIDIsIDEsIDMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVjb3JhdGlvbnNbMF0ub3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGRlYnVnU3RhY2tmcmFtZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb3JhdGlvbnNbMV0ucmFuZ2UsIG5ldyBSYW5nZSgxLCAyLCAxLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWNvcmF0aW9uc1sxXS5vcHRpb25zLmNsYXNzTmFtZSwgJ2RlYnVnLXRvcC1zdGFjay1mcmFtZS1saW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zWzFdLm9wdGlvbnMuaXNXaG9sZUxpbmUsIHRydWUpO1xuXHRcdC8vIElubGluZSBkZWNvcmF0aW9uIGdldHMgcmVuZGVyZWQgaW4gdGhpcyBjYXNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zWzJdLm9wdGlvbnMuYmVmb3JlPy5pbmxpbmVDbGFzc05hbWUsICdkZWJ1Zy10b3Atc3RhY2stZnJhbWUtY29sdW1uJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWNvcmF0aW9uc1syXS5yYW5nZSwgbmV3IFJhbmdlKDEsIDIsIDEsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRleHRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVUZXN0U2Vzc2lvbihtb2RlbCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlc3Npb24pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBmaXJzdFN0YWNrRnJhbWUsIHNlY29uZFN0YWNrRnJhbWUgfSA9IGNyZWF0ZVR3b1N0YWNrRnJhbWVzKHNlc3Npb24pO1xuXHRcdGxldCBjb250ZXh0ID0gZ2V0Q29udGV4dChmaXJzdFN0YWNrRnJhbWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0Py5zZXNzaW9uSWQsIGZpcnN0U3RhY2tGcmFtZS50aHJlYWQuc2Vzc2lvbi5nZXRJZCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dD8udGhyZWFkSWQsIGZpcnN0U3RhY2tGcmFtZS50aHJlYWQuZ2V0SWQoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQ/LmZyYW1lSWQsIGZpcnN0U3RhY2tGcmFtZS5nZXRJZCgpKTtcblxuXHRcdGNvbnRleHQgPSBnZXRDb250ZXh0KHNlY29uZFN0YWNrRnJhbWUudGhyZWFkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dD8uc2Vzc2lvbklkLCBzZWNvbmRTdGFja0ZyYW1lLnRocmVhZC5zZXNzaW9uLmdldElkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0Py50aHJlYWRJZCwgc2Vjb25kU3RhY2tGcmFtZS50aHJlYWQuZ2V0SWQoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQ/LmZyYW1lSWQsIHVuZGVmaW5lZCk7XG5cblx0XHRjb250ZXh0ID0gZ2V0Q29udGV4dChzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dD8uc2Vzc2lvbklkLCBzZXNzaW9uLmdldElkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0Py50aHJlYWRJZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dD8uZnJhbWVJZCwgdW5kZWZpbmVkKTtcblxuXHRcdGxldCBjb250cmlidXRlZENvbnRleHQgPSBnZXRDb250ZXh0Rm9yQ29udHJpYnV0ZWRBY3Rpb25zKGZpcnN0U3RhY2tGcmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyaWJ1dGVkQ29udGV4dCwgZmlyc3RTdGFja0ZyYW1lLnNvdXJjZS5yYXcucGF0aCk7XG5cdFx0Y29udHJpYnV0ZWRDb250ZXh0ID0gZ2V0Q29udGV4dEZvckNvbnRyaWJ1dGVkQWN0aW9ucyhmaXJzdFN0YWNrRnJhbWUudGhyZWFkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJpYnV0ZWRDb250ZXh0LCBmaXJzdFN0YWNrRnJhbWUudGhyZWFkLnRocmVhZElkKTtcblx0XHRjb250cmlidXRlZENvbnRleHQgPSBnZXRDb250ZXh0Rm9yQ29udHJpYnV0ZWRBY3Rpb25zKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cmlidXRlZENvbnRleHQsIHNlc3Npb24uZ2V0SWQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvY3VzU3RhY2tGcmFtZVRocmVhZEFuZFNlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGhyZWFkSWQxID0gMTtcblx0XHRjb25zdCB0aHJlYWROYW1lMSA9ICdmaXJzdFRocmVhZCc7XG5cdFx0Y29uc3QgdGhyZWFkSWQyID0gMjtcblx0XHRjb25zdCB0aHJlYWROYW1lMiA9ICdzZWNvbmRUaHJlYWQnO1xuXHRcdGNvbnN0IHN0b3BwZWRSZWFzb24gPSAnYnJlYWtwb2ludCc7XG5cblx0XHQvLyBBZGQgdGhlIHRocmVhZHNcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IGNsYXNzIGV4dGVuZHMgRGVidWdTZXNzaW9uIHtcblx0XHRcdG92ZXJyaWRlIGdldCBzdGF0ZSgpOiBTdGF0ZSB7XG5cdFx0XHRcdHJldHVybiBTdGF0ZS5TdG9wcGVkO1xuXHRcdFx0fVxuXHRcdH0oZ2VuZXJhdGVVdWlkKCksIHsgcmVzb2x2ZWQ6IHsgbmFtZTogJ3N0b3BwZWRTZXNzaW9uJywgdHlwZTogJ25vZGUnLCByZXF1ZXN0OiAnbGF1bmNoJyB9LCB1bnJlc29sdmVkOiB1bmRlZmluZWQgfSwgdW5kZWZpbmVkLCBtb2RlbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQhLCB1bmRlZmluZWQhLCB1bmRlZmluZWQhLCB1bmRlZmluZWQhLCB1bmRlZmluZWQhLCBtb2NrV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCEsIG1vY2tVcmlJZGVudGl0eVNlcnZpY2UsIG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSwgdW5kZWZpbmVkISwgdW5kZWZpbmVkISwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCEsIG5ldyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgcnVubmluZ1Nlc3Npb24gPSBjcmVhdGVUZXN0U2Vzc2lvbihtb2RlbCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJ1bm5pbmdTZXNzaW9uKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKHJ1bm5pbmdTZXNzaW9uKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0c2Vzc2lvbi5yYXcgPSB1cGNhc3RQYXJ0aWFsPFJhd0RlYnVnU2Vzc2lvbj4obW9ja1Jhd1Nlc3Npb24pO1xuXG5cdFx0bW9kZWwucmF3VXBkYXRlKHtcblx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbi5nZXRJZCgpLFxuXHRcdFx0dGhyZWFkczogW3tcblx0XHRcdFx0aWQ6IHRocmVhZElkMSxcblx0XHRcdFx0bmFtZTogdGhyZWFkTmFtZTFcblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0XHQvLyBTdG9wcGVkIGV2ZW50IHdpdGggYWxsIHRocmVhZHMgc3RvcHBlZFxuXHRcdG1vZGVsLnJhd1VwZGF0ZSh7XG5cdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uZ2V0SWQoKSxcblx0XHRcdHRocmVhZHM6IFt7XG5cdFx0XHRcdGlkOiB0aHJlYWRJZDEsXG5cdFx0XHRcdG5hbWU6IHRocmVhZE5hbWUxXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiB0aHJlYWRJZDIsXG5cdFx0XHRcdG5hbWU6IHRocmVhZE5hbWUyXG5cdFx0XHR9XSxcblx0XHRcdHN0b3BwZWREZXRhaWxzOiB7XG5cdFx0XHRcdHJlYXNvbjogc3RvcHBlZFJlYXNvbixcblx0XHRcdFx0dGhyZWFkSWQ6IDEsXG5cdFx0XHRcdGFsbFRocmVhZHNTdG9wcGVkOiB0cnVlXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGhyZWFkID0gc2Vzc2lvbi5nZXRUaHJlYWQodGhyZWFkSWQxKSE7XG5cdFx0Y29uc3QgcnVubmluZ1RocmVhZCA9IHNlc3Npb24uZ2V0VGhyZWFkKHRocmVhZElkMik7XG5cblx0XHRsZXQgdG9Gb2N1cyA9IGdldFN0YWNrRnJhbWVUaHJlYWRBbmRTZXNzaW9uVG9Gb2N1cyhtb2RlbCwgdW5kZWZpbmVkKTtcblx0XHQvLyBWZXJpZnkgc3RvcHBlZCBzZXNzaW9uIGFuZCBzdG9wcGVkIHRocmVhZCBnZXQgZm9jdXNlZFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9Gb2N1cywgeyBzdGFja0ZyYW1lOiB1bmRlZmluZWQsIHRocmVhZDogdGhyZWFkLCBzZXNzaW9uOiBzZXNzaW9uIH0pO1xuXG5cdFx0dG9Gb2N1cyA9IGdldFN0YWNrRnJhbWVUaHJlYWRBbmRTZXNzaW9uVG9Gb2N1cyhtb2RlbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHJ1bm5pbmdTZXNzaW9uKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvRm9jdXMsIHsgc3RhY2tGcmFtZTogdW5kZWZpbmVkLCB0aHJlYWQ6IHVuZGVmaW5lZCwgc2Vzc2lvbjogcnVubmluZ1Nlc3Npb24gfSk7XG5cblx0XHR0b0ZvY3VzID0gZ2V0U3RhY2tGcmFtZVRocmVhZEFuZFNlc3Npb25Ub0ZvY3VzKG1vZGVsLCB1bmRlZmluZWQsIHRocmVhZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0ZvY3VzLCB7IHN0YWNrRnJhbWU6IHVuZGVmaW5lZCwgdGhyZWFkOiB0aHJlYWQsIHNlc3Npb246IHNlc3Npb24gfSk7XG5cblx0XHR0b0ZvY3VzID0gZ2V0U3RhY2tGcmFtZVRocmVhZEFuZFNlc3Npb25Ub0ZvY3VzKG1vZGVsLCB1bmRlZmluZWQsIHJ1bm5pbmdUaHJlYWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9Gb2N1cywgeyBzdGFja0ZyYW1lOiB1bmRlZmluZWQsIHRocmVhZDogcnVubmluZ1RocmVhZCwgc2Vzc2lvbjogc2Vzc2lvbiB9KTtcblxuXHRcdGNvbnN0IHN0YWNrRnJhbWUgPSBuZXcgU3RhY2tGcmFtZSh0aHJlYWQsIDUsIHVuZGVmaW5lZCEsICdzdGFja2ZyYW1lbmFtZTInLCB1bmRlZmluZWQsIHVuZGVmaW5lZCEsIDEsIHRydWUpO1xuXHRcdHRvRm9jdXMgPSBnZXRTdGFja0ZyYW1lVGhyZWFkQW5kU2Vzc2lvblRvRm9jdXMobW9kZWwsIHN0YWNrRnJhbWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9Gb2N1cywgeyBzdGFja0ZyYW1lOiBzdGFja0ZyYW1lLCB0aHJlYWQ6IHRocmVhZCwgc2Vzc2lvbjogc2Vzc2lvbiB9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUIscUJBQXFCO0FBQ2pELFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYTtBQUN0QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLFlBQVksaUNBQWlDLDZCQUE2QjtBQUNuRixTQUFTLGlCQUFpQiw4QkFBOEI7QUFDeEQsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBOEMsYUFBYTtBQUMzRCxTQUFxQixZQUFZLGNBQWM7QUFDL0MsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCLDhCQUE4QjtBQUc3RCxNQUFNLDhCQUE4QixrQkFBNEM7QUFBQSxFQUMvRSxjQUFjLE1BQU07QUFDbkIsV0FBTztBQUFBLE1BQ04sU0FBUyxDQUFDO0FBQUEsSUFDWDtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRU0sU0FBUyxrQkFBa0IsT0FBbUIsT0FBTyxlQUFlLFNBQThDO0FBQ3hILFNBQU8sSUFBSSxhQUFhLGFBQWEsR0FBRyxFQUFFLFVBQVUsRUFBRSxNQUFNLE1BQU0sUUFBUSxTQUFTLFNBQVMsR0FBRyxZQUFZLE9BQVUsR0FBRyxRQUFXLE9BQU8sU0FBUztBQUFBLElBQ2xKLGVBQW9CO0FBQ25CLGFBQU87QUFBQSxRQUNOLGNBQW9CO0FBQUEsUUFFcEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsR0FBb0IsUUFBWSxRQUFZLElB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
