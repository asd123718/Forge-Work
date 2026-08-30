import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { FEEDBACK_ANNOTATION_META_KEY } from "../../common/meta/agentFeedbackAnnotations.js";
import { ActionType } from "../../common/state/protocol/common/actions.js";
import { SessionStatus, buildChatUri } from "../../common/state/sessionState.js";
import { buildAnnotationsUri } from "../../common/annotationsUri.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentServerToolHost } from "../../node/shared/agentServerToolHost.js";
import {
  addCommentToolName,
  applyFeedbackTool,
  deleteCommentsToolName,
  feedbackServerToolDefinitions,
  feedbackServerToolGroup,
  feedbackToolRequiresConfirmation,
  listCommentsToolName,
  resolveCommentsToolName,
  viewUnreviewedCommentsToolName
} from "../../node/shared/agentFeedbackServerTools.js";
suite("AgentFeedbackServerTools", () => {
  const sessionResource = "copilot:/test-session";
  const fileUri = "file:///workspace/app.ts";
  function annotation(id, state, resolved = false, text = "comment", kind = "codeReview", pendingAgentReveal = false) {
    return {
      id,
      turnId: "",
      resource: fileUri,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
      resolved,
      entries: [{ id: `${id}:0`, text }],
      _meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind, state, sessionResource, ...pendingAgentReveal ? { pendingAgentReveal: true } : {} } }
    };
  }
  function stateWith(...annotations) {
    return { annotations };
  }
  test("addComment produces an AnnotationsSet in the created state with a converted range", () => {
    const outcome = applyFeedbackTool(stateWith(), sessionResource, addCommentToolName, {
      resourceUri: fileUri,
      range: { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 10 },
      text: "please rename"
    });
    assert.strictEqual(outcome.result, "Comment added.");
    assert.strictEqual(outcome.actions.length, 1);
    const action = outcome.actions[0];
    assert.strictEqual(action.type, ActionType.AnnotationsSet);
    const set = action;
    assert.deepStrictEqual(set.annotation.range, { start: { line: 2, character: 1 }, end: { line: 2, character: 9 } });
    assert.strictEqual(set.annotation.entries.length, 1);
    assert.strictEqual(set.annotation.entries[0].text, "please rename");
    assert.deepStrictEqual(set.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY], { kind: "codeReview", state: "created", sessionResource });
  });
  test("listComments hides created items and serializes the rest", () => {
    const state = stateWith(
      annotation("a", "created", false, "hidden"),
      annotation("b", "accepted", false, "visible")
    );
    const outcome = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
    assert.strictEqual(outcome.actions.length, 0);
    assert.deepStrictEqual(JSON.parse(outcome.result), {
      comments: [{
        id: "b",
        resourceUri: fileUri,
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
        text: "visible",
        kind: "codeReview",
        resolved: false
      }],
      note: "There is 1 code review comment which the user has not reviewed yet. If the user wants you to tackle them, call the `viewUnreviewedComments` tool to view them."
    });
  });
  test("deleteComments removes listable items and reports unknown ids", () => {
    const state = stateWith(
      annotation("a", "accepted"),
      annotation("b", "created")
    );
    const outcome = applyFeedbackTool(state, sessionResource, deleteCommentsToolName, { commentIds: ["a", "b", "missing"] });
    assert.deepStrictEqual(outcome.actions, [{ type: ActionType.AnnotationsRemoved, annotationId: "a" }]);
    const parsed = JSON.parse(outcome.result);
    assert.deepStrictEqual(parsed.deletedCommentIds, ["a"]);
    assert.deepStrictEqual(parsed.notFoundCommentIds, ["b", "missing"]);
    assert.deepStrictEqual(parsed.remainingComments, []);
  });
  test("resolveComments marks items resolved via AnnotationsSet", () => {
    const state = stateWith(annotation("a", "accepted"));
    const outcome = applyFeedbackTool(state, sessionResource, resolveCommentsToolName, { commentIds: ["a"] });
    assert.strictEqual(outcome.actions.length, 1);
    const set = outcome.actions[0];
    assert.strictEqual(set.type, ActionType.AnnotationsSet);
    assert.strictEqual(set.annotation.resolved, true);
    assert.deepStrictEqual(set.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY], { kind: "codeReview", state: "resolved", sessionResource });
    const parsed = JSON.parse(outcome.result);
    assert.deepStrictEqual(parsed.updatedCommentIds, ["a"]);
    assert.strictEqual(parsed.resolved, true);
  });
  test("resolveComments with resolved=false re-opens the item", () => {
    const state = stateWith(annotation("a", "resolved", true));
    const outcome = applyFeedbackTool(state, sessionResource, resolveCommentsToolName, { commentIds: ["a"], resolved: false });
    const set = outcome.actions[0];
    assert.strictEqual(set.annotation.resolved, false);
    assert.deepStrictEqual(set.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY], { kind: "codeReview", state: "submitted", sessionResource });
  });
  test("unknown tool name throws", () => {
    assert.throws(() => applyFeedbackTool(stateWith(), sessionResource, "nope", {}), /Unknown feedback server tool/);
  });
  test("listComments adds no note when there are no unreviewed reviewable comments", () => {
    const state = stateWith(annotation("a", "accepted", false, "visible"));
    const outcome = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
    assert.strictEqual(JSON.parse(outcome.result).note, void 0);
  });
  test("listComments note counts created PR and code-review comments per kind", () => {
    const state = stateWith(
      annotation("pr1", "created", false, "pr a", "prReview"),
      annotation("pr2", "created", false, "pr b", "prReview"),
      annotation("cr1", "created", false, "cr a", "codeReview"),
      // user-authored created comments are not "reviewable" and never counted
      annotation("u1", "created", false, "user", "user"),
      annotation("done", "accepted", false, "already reviewed", "prReview")
    );
    const outcome = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
    assert.strictEqual(
      JSON.parse(outcome.result).note,
      "There are 2 pull request comments and 1 code review comment which the user has not reviewed yet. If the user wants you to tackle them, call the `viewUnreviewedComments` tool to view them."
    );
  });
  test("viewUnreviewedComments delivers a pending explicit selection before newer unreviewed comments", () => {
    const state = stateWith(
      annotation("pr1", "created", false, "still hidden", "prReview"),
      annotation("pr2", "accepted", false, "revealed pr", "prReview", true),
      annotation("cr1", "accepted", false, "revealed code review", "codeReview", true),
      // previously-accepted reviewable comment without the flag -> excluded
      annotation("pr3", "accepted", false, "old accepted pr", "prReview"),
      // user-authored comment is not reviewable -> excluded even when flagged
      annotation("u1", "accepted", false, "user comment", "user", true)
    );
    const outcome = applyFeedbackTool(state, sessionResource, viewUnreviewedCommentsToolName, {});
    const clearedIds = outcome.actions.map((a) => a.annotation.id);
    const clearedFlags = outcome.actions.map((a) => a.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY]);
    assert.deepStrictEqual({
      returnedIds: JSON.parse(outcome.result).comments.map((c) => c.id),
      clearedIds,
      flagsCleared: clearedFlags.every((meta) => meta.pendingAgentReveal === void 0)
    }, {
      returnedIds: ["pr2", "cr1"],
      clearedIds: ["pr2", "cr1"],
      flagsCleared: true
    });
  });
  test("viewUnreviewedComments submits and returns every unreviewed review comment when there is no explicit selection", () => {
    const state = stateWith(
      annotation("pr1", "created", false, "new pr", "prReview"),
      annotation("cr1", "created", false, "new code review", "codeReview"),
      annotation("pr2", "accepted", false, "already accepted", "prReview"),
      annotation("u1", "created", false, "user comment", "user")
    );
    const outcome = applyFeedbackTool(state, sessionResource, viewUnreviewedCommentsToolName, {});
    const submitted = outcome.actions.map((action) => {
      const annotation2 = action.annotation;
      const meta = annotation2._meta?.[FEEDBACK_ANNOTATION_META_KEY];
      return {
        id: annotation2.id,
        kind: meta?.kind,
        state: meta?.state,
        sessionResource: meta?.sessionResource,
        pendingAgentReveal: meta?.pendingAgentReveal
      };
    });
    assert.deepStrictEqual({
      returnedIds: JSON.parse(outcome.result).comments.map((comment) => comment.id),
      submitted
    }, {
      returnedIds: ["pr1", "cr1"],
      submitted: [
        { id: "pr1", kind: "prReview", state: "submitted", sessionResource, pendingAgentReveal: void 0 },
        { id: "cr1", kind: "codeReview", state: "submitted", sessionResource, pendingAgentReveal: void 0 }
      ]
    });
  });
  test("viewUnreviewedComments requires confirmation; the read/mutate tools do not", () => {
    assert.deepStrictEqual({
      view: feedbackToolRequiresConfirmation(viewUnreviewedCommentsToolName),
      list: feedbackToolRequiresConfirmation(listCommentsToolName),
      add: feedbackToolRequiresConfirmation(addCommentToolName),
      del: feedbackToolRequiresConfirmation(deleteCommentsToolName),
      resolve: feedbackToolRequiresConfirmation(resolveCommentsToolName)
    }, {
      view: true,
      list: false,
      add: false,
      del: false,
      resolve: false
    });
  });
  test("addComment rejects invalid arguments", () => {
    assert.throws(() => applyFeedbackTool(stateWith(), sessionResource, addCommentToolName, { resourceUri: fileUri, text: "x" }), /range must be an object/);
    assert.throws(() => applyFeedbackTool(stateWith(), sessionResource, addCommentToolName, { resourceUri: "", range: {}, text: "x" }), /resourceUri must be a non-empty string/);
  });
  test("ignores annotations that do not carry feedback metadata", () => {
    const foreign = {
      id: "foreign",
      turnId: "",
      resource: fileUri,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
      resolved: false,
      entries: [{ id: "foreign:0", text: "not feedback" }]
    };
    const state = stateWith(foreign, annotation("a", "accepted", false, "real feedback"));
    const listed = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
    const deleted = applyFeedbackTool(state, sessionResource, deleteCommentsToolName, { commentIds: ["foreign"] });
    const resolved = applyFeedbackTool(state, sessionResource, resolveCommentsToolName, { commentIds: ["foreign"] });
    assert.deepStrictEqual({
      listedIds: JSON.parse(listed.result).comments.map((c) => c.id),
      deleteActions: deleted.actions,
      deleteNotFound: JSON.parse(deleted.result).notFoundCommentIds,
      resolveActions: resolved.actions,
      resolveNotFound: JSON.parse(resolved.result).notFoundCommentIds
    }, {
      listedIds: ["a"],
      deleteActions: [],
      deleteNotFound: ["foreign"],
      resolveActions: [],
      resolveNotFound: ["foreign"]
    });
  });
  suite("AgentServerToolHost", () => {
    let disposables;
    let manager;
    let host;
    function makeSummary() {
      return {
        resource: sessionResource,
        provider: "copilot",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    setup(() => {
      disposables = new DisposableStore();
      manager = disposables.add(new AgentHostStateManager(new NullLogService()));
      host = new AgentServerToolHost(manager, [feedbackServerToolGroup]);
    });
    teardown(() => disposables.dispose());
    test("executeTool round-trips a comment into the annotation state", () => {
      host.executeTool(sessionResource, addCommentToolName, {
        resourceUri: fileUri,
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 },
        text: "hello"
      });
      const snapshot = manager.getSnapshot(buildAnnotationsUri(sessionResource));
      const state = snapshot.state;
      assert.strictEqual(state.annotations.length, 1);
      assert.strictEqual(state.annotations[0].entries[0].text, "hello");
    });
    test("executeTool stores comments on the main session when invoked from a chat URI", () => {
      const chatUri = buildChatUri(sessionResource, "peer-chat-1");
      host.executeTool(chatUri, addCommentToolName, {
        resourceUri: fileUri,
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 },
        text: "from a peer chat"
      });
      assert.strictEqual(manager.getSnapshot(buildAnnotationsUri(chatUri)), void 0);
      const state = manager.getSnapshot(buildAnnotationsUri(sessionResource)).state;
      assert.strictEqual(state.annotations.length, 1);
      const meta = state.annotations[0]._meta?.[FEEDBACK_ANNOTATION_META_KEY];
      assert.deepStrictEqual({
        text: state.annotations[0].entries[0].text,
        sessionResource: meta.sessionResource
      }, {
        text: "from a peer chat",
        sessionResource
      });
    });
    test("executeTool submits every unreviewed comment when there is no explicit selection", async () => {
      const annotationsUri = buildAnnotationsUri(sessionResource);
      manager.dispatchServerAction(annotationsUri, {
        type: ActionType.AnnotationsSet,
        annotation: annotation("auto-submit", "created", false, "submit me", "prReview")
      });
      const result = await host.executeTool(sessionResource, viewUnreviewedCommentsToolName, {});
      const state = manager.getSnapshot(annotationsUri).state;
      const meta = state.annotations[0]._meta?.[FEEDBACK_ANNOTATION_META_KEY];
      assert.deepStrictEqual({
        returnedIds: JSON.parse(result).comments.map((comment) => comment.id),
        state: meta.state
      }, {
        returnedIds: ["auto-submit"],
        state: "submitted"
      });
    });
    test("advertise publishes the server tools as server tools", () => {
      manager.createSession(makeSummary());
      host.advertise(sessionResource);
      const state = manager.getSessionState(sessionResource);
      assert.deepStrictEqual(state?.serverTools, feedbackServerToolDefinitions);
    });
    test("advertise does not dispatch before the session is registered", () => {
      const actionTypes = [];
      disposables.add(manager.onDidEmitEnvelope((envelope) => actionTypes.push(envelope.action.type)));
      host.advertise(sessionResource);
      assert.deepStrictEqual(actionTypes, []);
    });
    test("canRequireConfirmation reflects the owning group", () => {
      assert.deepStrictEqual({
        view: host.canRequireConfirmation(viewUnreviewedCommentsToolName),
        list: host.canRequireConfirmation(listCommentsToolName),
        unknown: host.canRequireConfirmation("nope")
      }, {
        view: true,
        list: false,
        unknown: false
      });
    });
    test("requiresConfirmation only prompts when comments can be revealed", async () => {
      const annotationsUri = buildAnnotationsUri(sessionResource);
      const chatUri = buildChatUri(sessionResource, "peer-chat-1");
      const empty = host.requiresConfirmation(sessionResource, viewUnreviewedCommentsToolName);
      manager.dispatchServerAction(annotationsUri, {
        type: ActionType.AnnotationsSet,
        annotation: annotation("accepted", "accepted", false, "already accepted", "prReview")
      });
      const acceptedOnly = host.requiresConfirmation(sessionResource, viewUnreviewedCommentsToolName);
      manager.dispatchServerAction(annotationsUri, {
        type: ActionType.AnnotationsSet,
        annotation: annotation("created", "created", false, "new comment", "codeReview")
      });
      const created = host.requiresConfirmation(sessionResource, viewUnreviewedCommentsToolName);
      const peerChat = host.requiresConfirmation(chatUri, viewUnreviewedCommentsToolName);
      await host.executeTool(sessionResource, viewUnreviewedCommentsToolName, {});
      const delivered = host.requiresConfirmation(sessionResource, viewUnreviewedCommentsToolName);
      manager.dispatchServerAction(annotationsUri, {
        type: ActionType.AnnotationsSet,
        annotation: annotation("pending", "accepted", false, "selected comment", "prReview", true)
      });
      const pendingSelection = host.requiresConfirmation(sessionResource, viewUnreviewedCommentsToolName);
      assert.deepStrictEqual({
        empty,
        acceptedOnly,
        created,
        peerChat,
        delivered,
        pendingSelection
      }, {
        empty: false,
        acceptedOnly: false,
        created: true,
        peerChat: true,
        delivered: false,
        pendingSelection: true
      });
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEZlZWRiYWNrU2VydmVyVG9vbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWSwgdHlwZSBJRmVlZGJhY2tBbm5vdGF0aW9uTWV0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXRhL2FnZW50RmVlZGJhY2tBbm5vdGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFubm90YXRpb24sIEFubm90YXRpb25zU3RhdGUsIFNlc3Npb25TdGF0dXMsIFNlc3Npb25TdW1tYXJ5LCBidWlsZENoYXRVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkQW5ub3RhdGlvbnNVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vYW5ub3RhdGlvbnNVcmkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXJ2ZXJUb29sSG9zdCB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2FnZW50U2VydmVyVG9vbEhvc3QuanMnO1xuaW1wb3J0IHtcblx0YWRkQ29tbWVudFRvb2xOYW1lLFxuXHRhcHBseUZlZWRiYWNrVG9vbCxcblx0ZGVsZXRlQ29tbWVudHNUb29sTmFtZSxcblx0ZmVlZGJhY2tTZXJ2ZXJUb29sRGVmaW5pdGlvbnMsXG5cdGZlZWRiYWNrU2VydmVyVG9vbEdyb3VwLFxuXHRmZWVkYmFja1Rvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbixcblx0bGlzdENvbW1lbnRzVG9vbE5hbWUsXG5cdHJlc29sdmVDb21tZW50c1Rvb2xOYW1lLFxuXHR2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWUsXG59IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2FnZW50RmVlZGJhY2tTZXJ2ZXJUb29scy5qcyc7XG5cbnN1aXRlKCdBZ2VudEZlZWRiYWNrU2VydmVyVG9vbHMnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gJ2NvcGlsb3Q6L3Rlc3Qtc2Vzc2lvbic7XG5cdGNvbnN0IGZpbGVVcmkgPSAnZmlsZTovLy93b3Jrc3BhY2UvYXBwLnRzJztcblxuXHRmdW5jdGlvbiBhbm5vdGF0aW9uKGlkOiBzdHJpbmcsIHN0YXRlOiBzdHJpbmcsIHJlc29sdmVkID0gZmFsc2UsIHRleHQgPSAnY29tbWVudCcsIGtpbmQgPSAnY29kZVJldmlldycsIHBlbmRpbmdBZ2VudFJldmVhbCA9IGZhbHNlKTogQW5ub3RhdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkLFxuXHRcdFx0dHVybklkOiAnJyxcblx0XHRcdHJlc291cmNlOiBmaWxlVXJpLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IHsgbGluZTogMCwgY2hhcmFjdGVyOiAwIH0sIGVuZDogeyBsaW5lOiAwLCBjaGFyYWN0ZXI6IDQgfSB9LFxuXHRcdFx0cmVzb2x2ZWQsXG5cdFx0XHRlbnRyaWVzOiBbeyBpZDogYCR7aWR9OjBgLCB0ZXh0IH1dLFxuXHRcdFx0X21ldGE6IHsgW0ZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVldOiB7IGtpbmQsIHN0YXRlLCBzZXNzaW9uUmVzb3VyY2UsIC4uLihwZW5kaW5nQWdlbnRSZXZlYWwgPyB7IHBlbmRpbmdBZ2VudFJldmVhbDogdHJ1ZSB9IDoge30pIH0gfSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RhdGVXaXRoKC4uLmFubm90YXRpb25zOiBBbm5vdGF0aW9uW10pOiBBbm5vdGF0aW9uc1N0YXRlIHtcblx0XHRyZXR1cm4geyBhbm5vdGF0aW9ucyB9O1xuXHR9XG5cblx0dGVzdCgnYWRkQ29tbWVudCBwcm9kdWNlcyBhbiBBbm5vdGF0aW9uc1NldCBpbiB0aGUgY3JlYXRlZCBzdGF0ZSB3aXRoIGEgY29udmVydGVkIHJhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dGNvbWUgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZVdpdGgoKSwgc2Vzc2lvblJlc291cmNlLCBhZGRDb21tZW50VG9vbE5hbWUsIHtcblx0XHRcdHJlc291cmNlVXJpOiBmaWxlVXJpLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAzLCBzdGFydENvbHVtbjogMiwgZW5kTGluZU51bWJlcjogMywgZW5kQ29sdW1uOiAxMCB9LFxuXHRcdFx0dGV4dDogJ3BsZWFzZSByZW5hbWUnLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRjb21lLnJlc3VsdCwgJ0NvbW1lbnQgYWRkZWQuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dGNvbWUuYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IG91dGNvbWUuYWN0aW9uc1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQpO1xuXHRcdGNvbnN0IHNldCA9IGFjdGlvbiBhcyBFeHRyYWN0PHR5cGVvZiBhY3Rpb24sIHsgdHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1NldCB9Pjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNldC5hbm5vdGF0aW9uLnJhbmdlLCB7IHN0YXJ0OiB7IGxpbmU6IDIsIGNoYXJhY3RlcjogMSB9LCBlbmQ6IHsgbGluZTogMiwgY2hhcmFjdGVyOiA5IH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldC5hbm5vdGF0aW9uLmVudHJpZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0LmFubm90YXRpb24uZW50cmllc1swXS50ZXh0LCAncGxlYXNlIHJlbmFtZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0LmFubm90YXRpb24uX21ldGE/LltGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXSwgeyBraW5kOiAnY29kZVJldmlldycsIHN0YXRlOiAnY3JlYXRlZCcsIHNlc3Npb25SZXNvdXJjZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdENvbW1lbnRzIGhpZGVzIGNyZWF0ZWQgaXRlbXMgYW5kIHNlcmlhbGl6ZXMgdGhlIHJlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZVdpdGgoXG5cdFx0XHRhbm5vdGF0aW9uKCdhJywgJ2NyZWF0ZWQnLCBmYWxzZSwgJ2hpZGRlbicpLFxuXHRcdFx0YW5ub3RhdGlvbignYicsICdhY2NlcHRlZCcsIGZhbHNlLCAndmlzaWJsZScpLFxuXHRcdCk7XG5cdFx0Y29uc3Qgb3V0Y29tZSA9IGFwcGx5RmVlZGJhY2tUb29sKHN0YXRlLCBzZXNzaW9uUmVzb3VyY2UsIGxpc3RDb21tZW50c1Rvb2xOYW1lLCB7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dGNvbWUuYWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShvdXRjb21lLnJlc3VsdCksIHtcblx0XHRcdGNvbW1lbnRzOiBbe1xuXHRcdFx0XHRpZDogJ2InLFxuXHRcdFx0XHRyZXNvdXJjZVVyaTogZmlsZVVyaSxcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA1IH0sXG5cdFx0XHRcdHRleHQ6ICd2aXNpYmxlJyxcblx0XHRcdFx0a2luZDogJ2NvZGVSZXZpZXcnLFxuXHRcdFx0XHRyZXNvbHZlZDogZmFsc2UsXG5cdFx0XHR9XSxcblx0XHRcdG5vdGU6ICdUaGVyZSBpcyAxIGNvZGUgcmV2aWV3IGNvbW1lbnQgd2hpY2ggdGhlIHVzZXIgaGFzIG5vdCByZXZpZXdlZCB5ZXQuIElmIHRoZSB1c2VyIHdhbnRzIHlvdSB0byB0YWNrbGUgdGhlbSwgY2FsbCB0aGUgYHZpZXdVbnJldmlld2VkQ29tbWVudHNgIHRvb2wgdG8gdmlldyB0aGVtLicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUNvbW1lbnRzIHJlbW92ZXMgbGlzdGFibGUgaXRlbXMgYW5kIHJlcG9ydHMgdW5rbm93biBpZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZVdpdGgoXG5cdFx0XHRhbm5vdGF0aW9uKCdhJywgJ2FjY2VwdGVkJyksXG5cdFx0XHRhbm5vdGF0aW9uKCdiJywgJ2NyZWF0ZWQnKSxcblx0XHQpO1xuXHRcdGNvbnN0IG91dGNvbWUgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCBkZWxldGVDb21tZW50c1Rvb2xOYW1lLCB7IGNvbW1lbnRJZHM6IFsnYScsICdiJywgJ21pc3NpbmcnXSB9KTtcblx0XHQvLyAnYicgaXMgaW4gdGhlIGNyZWF0ZWQgc3RhdGUgKG5vdCBsaXN0YWJsZSkgc28gaXQgaXMgdHJlYXRlZCBhcyBub3QgZm91bmQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvdXRjb21lLmFjdGlvbnMsIFt7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNSZW1vdmVkLCBhbm5vdGF0aW9uSWQ6ICdhJyB9XSk7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShvdXRjb21lLnJlc3VsdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQuZGVsZXRlZENvbW1lbnRJZHMsIFsnYSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC5ub3RGb3VuZENvbW1lbnRJZHMsIFsnYicsICdtaXNzaW5nJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLnJlbWFpbmluZ0NvbW1lbnRzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVDb21tZW50cyBtYXJrcyBpdGVtcyByZXNvbHZlZCB2aWEgQW5ub3RhdGlvbnNTZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZVdpdGgoYW5ub3RhdGlvbignYScsICdhY2NlcHRlZCcpKTtcblx0XHRjb25zdCBvdXRjb21lID0gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGUsIHNlc3Npb25SZXNvdXJjZSwgcmVzb2x2ZUNvbW1lbnRzVG9vbE5hbWUsIHsgY29tbWVudElkczogWydhJ10gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dGNvbWUuYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHNldCA9IG91dGNvbWUuYWN0aW9uc1swXSBhcyBFeHRyYWN0PHR5cGVvZiBvdXRjb21lLmFjdGlvbnNbMF0sIHsgdHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1NldCB9Pjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0LnR5cGUsIEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXQuYW5ub3RhdGlvbi5yZXNvbHZlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXQuYW5ub3RhdGlvbi5fbWV0YT8uW0ZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVldLCB7IGtpbmQ6ICdjb2RlUmV2aWV3Jywgc3RhdGU6ICdyZXNvbHZlZCcsIHNlc3Npb25SZXNvdXJjZSB9KTtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG91dGNvbWUucmVzdWx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC51cGRhdGVkQ29tbWVudElkcywgWydhJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQucmVzb2x2ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlQ29tbWVudHMgd2l0aCByZXNvbHZlZD1mYWxzZSByZS1vcGVucyB0aGUgaXRlbScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlV2l0aChhbm5vdGF0aW9uKCdhJywgJ3Jlc29sdmVkJywgdHJ1ZSkpO1xuXHRcdGNvbnN0IG91dGNvbWUgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCByZXNvbHZlQ29tbWVudHNUb29sTmFtZSwgeyBjb21tZW50SWRzOiBbJ2EnXSwgcmVzb2x2ZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHNldCA9IG91dGNvbWUuYWN0aW9uc1swXSBhcyBFeHRyYWN0PHR5cGVvZiBvdXRjb21lLmFjdGlvbnNbMF0sIHsgdHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1NldCB9Pjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0LmFubm90YXRpb24ucmVzb2x2ZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNldC5hbm5vdGF0aW9uLl9tZXRhPy5bRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWV0sIHsga2luZDogJ2NvZGVSZXZpZXcnLCBzdGF0ZTogJ3N1Ym1pdHRlZCcsIHNlc3Npb25SZXNvdXJjZSB9KTtcblx0fSk7XG5cblx0dGVzdCgndW5rbm93biB0b29sIG5hbWUgdGhyb3dzJywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGVXaXRoKCksIHNlc3Npb25SZXNvdXJjZSwgJ25vcGUnLCB7fSksIC9Vbmtub3duIGZlZWRiYWNrIHNlcnZlciB0b29sLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RDb21tZW50cyBhZGRzIG5vIG5vdGUgd2hlbiB0aGVyZSBhcmUgbm8gdW5yZXZpZXdlZCByZXZpZXdhYmxlIGNvbW1lbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gc3RhdGVXaXRoKGFubm90YXRpb24oJ2EnLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ3Zpc2libGUnKSk7XG5cdFx0Y29uc3Qgb3V0Y29tZSA9IGFwcGx5RmVlZGJhY2tUb29sKHN0YXRlLCBzZXNzaW9uUmVzb3VyY2UsIGxpc3RDb21tZW50c1Rvb2xOYW1lLCB7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEpTT04ucGFyc2Uob3V0Y29tZS5yZXN1bHQpLm5vdGUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RDb21tZW50cyBub3RlIGNvdW50cyBjcmVhdGVkIFBSIGFuZCBjb2RlLXJldmlldyBjb21tZW50cyBwZXIga2luZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlV2l0aChcblx0XHRcdGFubm90YXRpb24oJ3ByMScsICdjcmVhdGVkJywgZmFsc2UsICdwciBhJywgJ3ByUmV2aWV3JyksXG5cdFx0XHRhbm5vdGF0aW9uKCdwcjInLCAnY3JlYXRlZCcsIGZhbHNlLCAncHIgYicsICdwclJldmlldycpLFxuXHRcdFx0YW5ub3RhdGlvbignY3IxJywgJ2NyZWF0ZWQnLCBmYWxzZSwgJ2NyIGEnLCAnY29kZVJldmlldycpLFxuXHRcdFx0Ly8gdXNlci1hdXRob3JlZCBjcmVhdGVkIGNvbW1lbnRzIGFyZSBub3QgXCJyZXZpZXdhYmxlXCIgYW5kIG5ldmVyIGNvdW50ZWRcblx0XHRcdGFubm90YXRpb24oJ3UxJywgJ2NyZWF0ZWQnLCBmYWxzZSwgJ3VzZXInLCAndXNlcicpLFxuXHRcdFx0YW5ub3RhdGlvbignZG9uZScsICdhY2NlcHRlZCcsIGZhbHNlLCAnYWxyZWFkeSByZXZpZXdlZCcsICdwclJldmlldycpLFxuXHRcdCk7XG5cdFx0Y29uc3Qgb3V0Y29tZSA9IGFwcGx5RmVlZGJhY2tUb29sKHN0YXRlLCBzZXNzaW9uUmVzb3VyY2UsIGxpc3RDb21tZW50c1Rvb2xOYW1lLCB7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0SlNPTi5wYXJzZShvdXRjb21lLnJlc3VsdCkubm90ZSxcblx0XHRcdCdUaGVyZSBhcmUgMiBwdWxsIHJlcXVlc3QgY29tbWVudHMgYW5kIDEgY29kZSByZXZpZXcgY29tbWVudCB3aGljaCB0aGUgdXNlciBoYXMgbm90IHJldmlld2VkIHlldC4gSWYgdGhlIHVzZXIgd2FudHMgeW91IHRvIHRhY2tsZSB0aGVtLCBjYWxsIHRoZSBgdmlld1VucmV2aWV3ZWRDb21tZW50c2AgdG9vbCB0byB2aWV3IHRoZW0uJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd2aWV3VW5yZXZpZXdlZENvbW1lbnRzIGRlbGl2ZXJzIGEgcGVuZGluZyBleHBsaWNpdCBzZWxlY3Rpb24gYmVmb3JlIG5ld2VyIHVucmV2aWV3ZWQgY29tbWVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZVdpdGgoXG5cdFx0XHRhbm5vdGF0aW9uKCdwcjEnLCAnY3JlYXRlZCcsIGZhbHNlLCAnc3RpbGwgaGlkZGVuJywgJ3ByUmV2aWV3JyksXG5cdFx0XHRhbm5vdGF0aW9uKCdwcjInLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ3JldmVhbGVkIHByJywgJ3ByUmV2aWV3JywgdHJ1ZSksXG5cdFx0XHRhbm5vdGF0aW9uKCdjcjEnLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ3JldmVhbGVkIGNvZGUgcmV2aWV3JywgJ2NvZGVSZXZpZXcnLCB0cnVlKSxcblx0XHRcdC8vIHByZXZpb3VzbHktYWNjZXB0ZWQgcmV2aWV3YWJsZSBjb21tZW50IHdpdGhvdXQgdGhlIGZsYWcgLT4gZXhjbHVkZWRcblx0XHRcdGFubm90YXRpb24oJ3ByMycsICdhY2NlcHRlZCcsIGZhbHNlLCAnb2xkIGFjY2VwdGVkIHByJywgJ3ByUmV2aWV3JyksXG5cdFx0XHQvLyB1c2VyLWF1dGhvcmVkIGNvbW1lbnQgaXMgbm90IHJldmlld2FibGUgLT4gZXhjbHVkZWQgZXZlbiB3aGVuIGZsYWdnZWRcblx0XHRcdGFubm90YXRpb24oJ3UxJywgJ2FjY2VwdGVkJywgZmFsc2UsICd1c2VyIGNvbW1lbnQnLCAndXNlcicsIHRydWUpLFxuXHRcdCk7XG5cdFx0Y29uc3Qgb3V0Y29tZSA9IGFwcGx5RmVlZGJhY2tUb29sKHN0YXRlLCBzZXNzaW9uUmVzb3VyY2UsIHZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sTmFtZSwge30pO1xuXHRcdGNvbnN0IGNsZWFyZWRJZHMgPSBvdXRjb21lLmFjdGlvbnMubWFwKGEgPT4gKGEgYXMgRXh0cmFjdDx0eXBlb2YgYSwgeyB0eXBlOiBBY3Rpb25UeXBlLkFubm90YXRpb25zU2V0IH0+KS5hbm5vdGF0aW9uLmlkKTtcblx0XHRjb25zdCBjbGVhcmVkRmxhZ3MgPSBvdXRjb21lLmFjdGlvbnMubWFwKGEgPT4gKGEgYXMgRXh0cmFjdDx0eXBlb2YgYSwgeyB0eXBlOiBBY3Rpb25UeXBlLkFubm90YXRpb25zU2V0IH0+KS5hbm5vdGF0aW9uLl9tZXRhPy5bRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWV0gYXMgeyBwZW5kaW5nQWdlbnRSZXZlYWw/OiBib29sZWFuIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmV0dXJuZWRJZHM6IEpTT04ucGFyc2Uob3V0Y29tZS5yZXN1bHQpLmNvbW1lbnRzLm1hcCgoYzogeyBpZDogc3RyaW5nIH0pID0+IGMuaWQpLFxuXHRcdFx0Y2xlYXJlZElkcyxcblx0XHRcdGZsYWdzQ2xlYXJlZDogY2xlYXJlZEZsYWdzLmV2ZXJ5KG1ldGEgPT4gbWV0YS5wZW5kaW5nQWdlbnRSZXZlYWwgPT09IHVuZGVmaW5lZCksXG5cdFx0fSwge1xuXHRcdFx0cmV0dXJuZWRJZHM6IFsncHIyJywgJ2NyMSddLFxuXHRcdFx0Y2xlYXJlZElkczogWydwcjInLCAnY3IxJ10sXG5cdFx0XHRmbGFnc0NsZWFyZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZpZXdVbnJldmlld2VkQ29tbWVudHMgc3VibWl0cyBhbmQgcmV0dXJucyBldmVyeSB1bnJldmlld2VkIHJldmlldyBjb21tZW50IHdoZW4gdGhlcmUgaXMgbm8gZXhwbGljaXQgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gc3RhdGVXaXRoKFxuXHRcdFx0YW5ub3RhdGlvbigncHIxJywgJ2NyZWF0ZWQnLCBmYWxzZSwgJ25ldyBwcicsICdwclJldmlldycpLFxuXHRcdFx0YW5ub3RhdGlvbignY3IxJywgJ2NyZWF0ZWQnLCBmYWxzZSwgJ25ldyBjb2RlIHJldmlldycsICdjb2RlUmV2aWV3JyksXG5cdFx0XHRhbm5vdGF0aW9uKCdwcjInLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ2FscmVhZHkgYWNjZXB0ZWQnLCAncHJSZXZpZXcnKSxcblx0XHRcdGFubm90YXRpb24oJ3UxJywgJ2NyZWF0ZWQnLCBmYWxzZSwgJ3VzZXIgY29tbWVudCcsICd1c2VyJyksXG5cdFx0KTtcblx0XHRjb25zdCBvdXRjb21lID0gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGUsIHNlc3Npb25SZXNvdXJjZSwgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lLCB7fSk7XG5cdFx0Y29uc3Qgc3VibWl0dGVkID0gb3V0Y29tZS5hY3Rpb25zLm1hcChhY3Rpb24gPT4ge1xuXHRcdFx0Y29uc3QgYW5ub3RhdGlvbiA9IChhY3Rpb24gYXMgRXh0cmFjdDx0eXBlb2YgYWN0aW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQgfT4pLmFubm90YXRpb247XG5cdFx0XHRjb25zdCBtZXRhID0gYW5ub3RhdGlvbi5fbWV0YT8uW0ZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVldIGFzIElGZWVkYmFja0Fubm90YXRpb25NZXRhIHwgdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IGFubm90YXRpb24uaWQsXG5cdFx0XHRcdGtpbmQ6IG1ldGE/LmtpbmQsXG5cdFx0XHRcdHN0YXRlOiBtZXRhPy5zdGF0ZSxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBtZXRhPy5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHBlbmRpbmdBZ2VudFJldmVhbDogbWV0YT8ucGVuZGluZ0FnZW50UmV2ZWFsLFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmV0dXJuZWRJZHM6IEpTT04ucGFyc2Uob3V0Y29tZS5yZXN1bHQpLmNvbW1lbnRzLm1hcCgoY29tbWVudDogeyBpZDogc3RyaW5nIH0pID0+IGNvbW1lbnQuaWQpLFxuXHRcdFx0c3VibWl0dGVkLFxuXHRcdH0sIHtcblx0XHRcdHJldHVybmVkSWRzOiBbJ3ByMScsICdjcjEnXSxcblx0XHRcdHN1Ym1pdHRlZDogW1xuXHRcdFx0XHR7IGlkOiAncHIxJywga2luZDogJ3ByUmV2aWV3Jywgc3RhdGU6ICdzdWJtaXR0ZWQnLCBzZXNzaW9uUmVzb3VyY2UsIHBlbmRpbmdBZ2VudFJldmVhbDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsgaWQ6ICdjcjEnLCBraW5kOiAnY29kZVJldmlldycsIHN0YXRlOiAnc3VibWl0dGVkJywgc2Vzc2lvblJlc291cmNlLCBwZW5kaW5nQWdlbnRSZXZlYWw6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndmlld1VucmV2aWV3ZWRDb21tZW50cyByZXF1aXJlcyBjb25maXJtYXRpb247IHRoZSByZWFkL211dGF0ZSB0b29scyBkbyBub3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aWV3OiBmZWVkYmFja1Rvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbih2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWUpLFxuXHRcdFx0bGlzdDogZmVlZGJhY2tUb29sUmVxdWlyZXNDb25maXJtYXRpb24obGlzdENvbW1lbnRzVG9vbE5hbWUpLFxuXHRcdFx0YWRkOiBmZWVkYmFja1Rvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbihhZGRDb21tZW50VG9vbE5hbWUpLFxuXHRcdFx0ZGVsOiBmZWVkYmFja1Rvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbihkZWxldGVDb21tZW50c1Rvb2xOYW1lKSxcblx0XHRcdHJlc29sdmU6IGZlZWRiYWNrVG9vbFJlcXVpcmVzQ29uZmlybWF0aW9uKHJlc29sdmVDb21tZW50c1Rvb2xOYW1lKSxcblx0XHR9LCB7XG5cdFx0XHR2aWV3OiB0cnVlLFxuXHRcdFx0bGlzdDogZmFsc2UsXG5cdFx0XHRhZGQ6IGZhbHNlLFxuXHRcdFx0ZGVsOiBmYWxzZSxcblx0XHRcdHJlc29sdmU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRDb21tZW50IHJlamVjdHMgaW52YWxpZCBhcmd1bWVudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZVdpdGgoKSwgc2Vzc2lvblJlc291cmNlLCBhZGRDb21tZW50VG9vbE5hbWUsIHsgcmVzb3VyY2VVcmk6IGZpbGVVcmksIHRleHQ6ICd4JyB9KSwgL3JhbmdlIG11c3QgYmUgYW4gb2JqZWN0Lyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZVdpdGgoKSwgc2Vzc2lvblJlc291cmNlLCBhZGRDb21tZW50VG9vbE5hbWUsIHsgcmVzb3VyY2VVcmk6ICcnLCByYW5nZToge30sIHRleHQ6ICd4JyB9KSwgL3Jlc291cmNlVXJpIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgYW5ub3RhdGlvbnMgdGhhdCBkbyBub3QgY2FycnkgZmVlZGJhY2sgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Ly8gQSBub24tZmVlZGJhY2sgYW5ub3RhdGlvbiBwcm9kdWNlZCBieSBhbm90aGVyIGZlYXR1cmUgc2hhcmluZyB0aGVcblx0XHQvLyBnZW5lcmljIGFubm90YXRpb25zIGNoYW5uZWwgbXVzdCBiZSBpbnZpc2libGUgdG8gdGhlIGZlZWRiYWNrIHRvb2xzOlxuXHRcdC8vIGl0IGlzIG5ldmVyIGxpc3RlZCwgYW5kIGRlbGV0ZS9yZXNvbHZlIHRyZWF0IGl0IGFzIG5vdCBmb3VuZCByYXRoZXJcblx0XHQvLyB0aGFuIG11dGF0aW5nIGl0LlxuXHRcdGNvbnN0IGZvcmVpZ246IEFubm90YXRpb24gPSB7XG5cdFx0XHRpZDogJ2ZvcmVpZ24nLFxuXHRcdFx0dHVybklkOiAnJyxcblx0XHRcdHJlc291cmNlOiBmaWxlVXJpLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IHsgbGluZTogMCwgY2hhcmFjdGVyOiAwIH0sIGVuZDogeyBsaW5lOiAwLCBjaGFyYWN0ZXI6IDQgfSB9LFxuXHRcdFx0cmVzb2x2ZWQ6IGZhbHNlLFxuXHRcdFx0ZW50cmllczogW3sgaWQ6ICdmb3JlaWduOjAnLCB0ZXh0OiAnbm90IGZlZWRiYWNrJyB9XSxcblx0XHR9O1xuXHRcdGNvbnN0IHN0YXRlID0gc3RhdGVXaXRoKGZvcmVpZ24sIGFubm90YXRpb24oJ2EnLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ3JlYWwgZmVlZGJhY2snKSk7XG5cblx0XHRjb25zdCBsaXN0ZWQgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCBsaXN0Q29tbWVudHNUb29sTmFtZSwge30pO1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCBkZWxldGVDb21tZW50c1Rvb2xOYW1lLCB7IGNvbW1lbnRJZHM6IFsnZm9yZWlnbiddIH0pO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGUsIHNlc3Npb25SZXNvdXJjZSwgcmVzb2x2ZUNvbW1lbnRzVG9vbE5hbWUsIHsgY29tbWVudElkczogWydmb3JlaWduJ10gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxpc3RlZElkczogSlNPTi5wYXJzZShsaXN0ZWQucmVzdWx0KS5jb21tZW50cy5tYXAoKGM6IHsgaWQ6IHN0cmluZyB9KSA9PiBjLmlkKSxcblx0XHRcdGRlbGV0ZUFjdGlvbnM6IGRlbGV0ZWQuYWN0aW9ucyxcblx0XHRcdGRlbGV0ZU5vdEZvdW5kOiBKU09OLnBhcnNlKGRlbGV0ZWQucmVzdWx0KS5ub3RGb3VuZENvbW1lbnRJZHMsXG5cdFx0XHRyZXNvbHZlQWN0aW9uczogcmVzb2x2ZWQuYWN0aW9ucyxcblx0XHRcdHJlc29sdmVOb3RGb3VuZDogSlNPTi5wYXJzZShyZXNvbHZlZC5yZXN1bHQpLm5vdEZvdW5kQ29tbWVudElkcyxcblx0XHR9LCB7XG5cdFx0XHRsaXN0ZWRJZHM6IFsnYSddLFxuXHRcdFx0ZGVsZXRlQWN0aW9uczogW10sXG5cdFx0XHRkZWxldGVOb3RGb3VuZDogWydmb3JlaWduJ10sXG5cdFx0XHRyZXNvbHZlQWN0aW9uczogW10sXG5cdFx0XHRyZXNvbHZlTm90Rm91bmQ6IFsnZm9yZWlnbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXJ2ZXJUb29sSG9zdCcsICgpID0+IHtcblxuXHRcdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRcdGxldCBtYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdFx0bGV0IGhvc3Q6IEFnZW50U2VydmVyVG9vbEhvc3Q7XG5cblx0XHRmdW5jdGlvbiBtYWtlU3VtbWFyeSgpOiBTZXNzaW9uU3VtbWFyeSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGhvc3QgPSBuZXcgQWdlbnRTZXJ2ZXJUb29sSG9zdChtYW5hZ2VyLCBbZmVlZGJhY2tTZXJ2ZXJUb29sR3JvdXBdKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cblx0XHR0ZXN0KCdleGVjdXRlVG9vbCByb3VuZC10cmlwcyBhIGNvbW1lbnQgaW50byB0aGUgYW5ub3RhdGlvbiBzdGF0ZScsICgpID0+IHtcblx0XHRcdGhvc3QuZXhlY3V0ZVRvb2woc2Vzc2lvblJlc291cmNlLCBhZGRDb21tZW50VG9vbE5hbWUsIHtcblx0XHRcdFx0cmVzb3VyY2VVcmk6IGZpbGVVcmksXG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMiB9LFxuXHRcdFx0XHR0ZXh0OiAnaGVsbG8nLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IG1hbmFnZXIuZ2V0U25hcHNob3QoYnVpbGRBbm5vdGF0aW9uc1VyaShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3QhLnN0YXRlIGFzIEFubm90YXRpb25zU3RhdGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYW5ub3RhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hbm5vdGF0aW9uc1swXS5lbnRyaWVzWzBdLnRleHQsICdoZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhlY3V0ZVRvb2wgc3RvcmVzIGNvbW1lbnRzIG9uIHRoZSBtYWluIHNlc3Npb24gd2hlbiBpbnZva2VkIGZyb20gYSBjaGF0IFVSSScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblJlc291cmNlLCAncGVlci1jaGF0LTEnKTtcblx0XHRcdGhvc3QuZXhlY3V0ZVRvb2woY2hhdFVyaSwgYWRkQ29tbWVudFRvb2xOYW1lLCB7XG5cdFx0XHRcdHJlc291cmNlVXJpOiBmaWxlVXJpLFxuXHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDIgfSxcblx0XHRcdFx0dGV4dDogJ2Zyb20gYSBwZWVyIGNoYXQnLFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBUaGUgY29tbWVudCBtdXN0IGxhbmQgb24gdGhlIG1haW4gc2Vzc2lvbidzIGFubm90YXRpb25zIGNoYW5uZWwsXG5cdFx0XHQvLyBub3Qgb24gdGhlIGluZGl2aWR1YWwgY2hhdCdzLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0U25hcHNob3QoYnVpbGRBbm5vdGF0aW9uc1VyaShjaGF0VXJpKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuZ2V0U25hcHNob3QoYnVpbGRBbm5vdGF0aW9uc1VyaShzZXNzaW9uUmVzb3VyY2UpKSEuc3RhdGUgYXMgQW5ub3RhdGlvbnNTdGF0ZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hbm5vdGF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgbWV0YSA9IHN0YXRlLmFubm90YXRpb25zWzBdLl9tZXRhPy5bRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWV0gYXMgeyBzZXNzaW9uUmVzb3VyY2U6IHN0cmluZyB9O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRleHQ6IHN0YXRlLmFubm90YXRpb25zWzBdLmVudHJpZXNbMF0udGV4dCxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBtZXRhLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ2Zyb20gYSBwZWVyIGNoYXQnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4ZWN1dGVUb29sIHN1Ym1pdHMgZXZlcnkgdW5yZXZpZXdlZCBjb21tZW50IHdoZW4gdGhlcmUgaXMgbm8gZXhwbGljaXQgc2VsZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYW5ub3RhdGlvbnNVcmkgPSBidWlsZEFubm90YXRpb25zVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGFubm90YXRpb25zVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQsXG5cdFx0XHRcdGFubm90YXRpb246IGFubm90YXRpb24oJ2F1dG8tc3VibWl0JywgJ2NyZWF0ZWQnLCBmYWxzZSwgJ3N1Ym1pdCBtZScsICdwclJldmlldycpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhvc3QuZXhlY3V0ZVRvb2woc2Vzc2lvblJlc291cmNlLCB2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWUsIHt9KTtcblx0XHRcdGNvbnN0IHN0YXRlID0gbWFuYWdlci5nZXRTbmFwc2hvdChhbm5vdGF0aW9uc1VyaSkhLnN0YXRlIGFzIEFubm90YXRpb25zU3RhdGU7XG5cdFx0XHRjb25zdCBtZXRhID0gc3RhdGUuYW5ub3RhdGlvbnNbMF0uX21ldGE/LltGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXSBhcyBJRmVlZGJhY2tBbm5vdGF0aW9uTWV0YTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJldHVybmVkSWRzOiBKU09OLnBhcnNlKHJlc3VsdCkuY29tbWVudHMubWFwKChjb21tZW50OiB7IGlkOiBzdHJpbmcgfSkgPT4gY29tbWVudC5pZCksXG5cdFx0XHRcdHN0YXRlOiBtZXRhLnN0YXRlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXR1cm5lZElkczogWydhdXRvLXN1Ym1pdCddLFxuXHRcdFx0XHRzdGF0ZTogJ3N1Ym1pdHRlZCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkdmVydGlzZSBwdWJsaXNoZXMgdGhlIHNlcnZlciB0b29scyBhcyBzZXJ2ZXIgdG9vbHMnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoKSk7XG5cdFx0XHRob3N0LmFkdmVydGlzZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZT8uc2VydmVyVG9vbHMsIGZlZWRiYWNrU2VydmVyVG9vbERlZmluaXRpb25zKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkdmVydGlzZSBkb2VzIG5vdCBkaXNwYXRjaCBiZWZvcmUgdGhlIHNlc3Npb24gaXMgcmVnaXN0ZXJlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvblR5cGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4gYWN0aW9uVHlwZXMucHVzaChlbnZlbG9wZS5hY3Rpb24udHlwZSkpKTtcblxuXHRcdFx0aG9zdC5hZHZlcnRpc2Uoc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25UeXBlcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuUmVxdWlyZUNvbmZpcm1hdGlvbiByZWZsZWN0cyB0aGUgb3duaW5nIGdyb3VwJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHZpZXc6IGhvc3QuY2FuUmVxdWlyZUNvbmZpcm1hdGlvbih2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWUpLFxuXHRcdFx0XHRsaXN0OiBob3N0LmNhblJlcXVpcmVDb25maXJtYXRpb24obGlzdENvbW1lbnRzVG9vbE5hbWUpLFxuXHRcdFx0XHR1bmtub3duOiBob3N0LmNhblJlcXVpcmVDb25maXJtYXRpb24oJ25vcGUnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dmlldzogdHJ1ZSxcblx0XHRcdFx0bGlzdDogZmFsc2UsXG5cdFx0XHRcdHVua25vd246IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXF1aXJlc0NvbmZpcm1hdGlvbiBvbmx5IHByb21wdHMgd2hlbiBjb21tZW50cyBjYW4gYmUgcmV2ZWFsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbm5vdGF0aW9uc1VyaSA9IGJ1aWxkQW5ub3RhdGlvbnNVcmkoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblJlc291cmNlLCAncGVlci1jaGF0LTEnKTtcblx0XHRcdGNvbnN0IGVtcHR5ID0gaG9zdC5yZXF1aXJlc0NvbmZpcm1hdGlvbihzZXNzaW9uUmVzb3VyY2UsIHZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sTmFtZSk7XG5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oYW5ub3RhdGlvbnNVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1NldCxcblx0XHRcdFx0YW5ub3RhdGlvbjogYW5ub3RhdGlvbignYWNjZXB0ZWQnLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ2FscmVhZHkgYWNjZXB0ZWQnLCAncHJSZXZpZXcnKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWNjZXB0ZWRPbmx5ID0gaG9zdC5yZXF1aXJlc0NvbmZpcm1hdGlvbihzZXNzaW9uUmVzb3VyY2UsIHZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sTmFtZSk7XG5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oYW5ub3RhdGlvbnNVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1NldCxcblx0XHRcdFx0YW5ub3RhdGlvbjogYW5ub3RhdGlvbignY3JlYXRlZCcsICdjcmVhdGVkJywgZmFsc2UsICduZXcgY29tbWVudCcsICdjb2RlUmV2aWV3JyksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNyZWF0ZWQgPSBob3N0LnJlcXVpcmVzQ29uZmlybWF0aW9uKHNlc3Npb25SZXNvdXJjZSwgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gaG9zdC5yZXF1aXJlc0NvbmZpcm1hdGlvbihjaGF0VXJpLCB2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWUpO1xuXG5cdFx0XHRhd2FpdCBob3N0LmV4ZWN1dGVUb29sKHNlc3Npb25SZXNvdXJjZSwgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lLCB7fSk7XG5cdFx0XHRjb25zdCBkZWxpdmVyZWQgPSBob3N0LnJlcXVpcmVzQ29uZmlybWF0aW9uKHNlc3Npb25SZXNvdXJjZSwgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lKTtcblxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihhbm5vdGF0aW9uc1VyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkFubm90YXRpb25zU2V0LFxuXHRcdFx0XHRhbm5vdGF0aW9uOiBhbm5vdGF0aW9uKCdwZW5kaW5nJywgJ2FjY2VwdGVkJywgZmFsc2UsICdzZWxlY3RlZCBjb21tZW50JywgJ3ByUmV2aWV3JywgdHJ1ZSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBlbmRpbmdTZWxlY3Rpb24gPSBob3N0LnJlcXVpcmVzQ29uZmlybWF0aW9uKHNlc3Npb25SZXNvdXJjZSwgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGVtcHR5LFxuXHRcdFx0XHRhY2NlcHRlZE9ubHksXG5cdFx0XHRcdGNyZWF0ZWQsXG5cdFx0XHRcdHBlZXJDaGF0LFxuXHRcdFx0XHRkZWxpdmVyZWQsXG5cdFx0XHRcdHBlbmRpbmdTZWxlY3Rpb24sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGVtcHR5OiBmYWxzZSxcblx0XHRcdFx0YWNjZXB0ZWRPbmx5OiBmYWxzZSxcblx0XHRcdFx0Y3JlYXRlZDogdHJ1ZSxcblx0XHRcdFx0cGVlckNoYXQ6IHRydWUsXG5cdFx0XHRcdGRlbGl2ZXJlZDogZmFsc2UsXG5cdFx0XHRcdHBlbmRpbmdTZWxlY3Rpb246IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9DQUFrRTtBQUMzRSxTQUFTLGtCQUFrQjtBQUMzQixTQUF1QyxlQUErQixvQkFBb0I7QUFDMUYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEM7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBRVAsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QyxRQUFNLGtCQUFrQjtBQUN4QixRQUFNLFVBQVU7QUFFaEIsV0FBUyxXQUFXLElBQVksT0FBZSxXQUFXLE9BQU8sT0FBTyxXQUFXLE9BQU8sY0FBYyxxQkFBcUIsT0FBbUI7QUFDL0ksV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBLFFBQVE7QUFBQSxNQUNSLFVBQVU7QUFBQSxNQUNWLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxHQUFHLFdBQVcsRUFBRSxHQUFHLEtBQUssRUFBRSxNQUFNLEdBQUcsV0FBVyxFQUFFLEVBQUU7QUFBQSxNQUMxRTtBQUFBLE1BQ0EsU0FBUyxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxNQUNqQyxPQUFPLEVBQUUsQ0FBQyw0QkFBNEIsR0FBRyxFQUFFLE1BQU0sT0FBTyxpQkFBaUIsR0FBSSxxQkFBcUIsRUFBRSxvQkFBb0IsS0FBSyxJQUFJLENBQUMsRUFBRyxFQUFFO0FBQUEsSUFDeEk7QUFBQSxFQUNEO0FBRUEsV0FBUyxhQUFhLGFBQTZDO0FBQ2xFLFdBQU8sRUFBRSxZQUFZO0FBQUEsRUFDdEI7QUFFQSxPQUFL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
