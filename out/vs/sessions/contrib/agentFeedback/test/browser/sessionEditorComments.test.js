import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { getResourceEditorComments, getSessionEditorComments, groupNearbySessionEditorComments, hasAcceptedAgentFeedbackComments, SessionEditorCommentSource } from "../../browser/sessionEditorComments.js";
import { AgentFeedbackKind, AgentFeedbackState } from "../../browser/agentFeedbackService.js";
import { PRReviewStateKind } from "../../../codeReview/browser/codeReviewService.js";
suite("SessionEditorComments", () => {
  const session = URI.parse("test://session/1");
  const fileA = URI.parse("file:///a.ts");
  const fileB = URI.parse("file:///b.ts");
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merges and sorts feedback and PR review comments by resource and range", () => {
    const prState = {
      kind: PRReviewStateKind.Loaded,
      comments: [
        { id: "review-a", uri: fileA, range: new Range(3, 1, 3, 1), body: "review a", author: "reviewer" },
        { id: "review-b", uri: fileB, range: new Range(2, 1, 2, 1), body: "review b", author: "reviewer" }
      ]
    };
    const comments = getSessionEditorComments(session, [
      { id: "feedback-b", text: "feedback b", resourceUri: fileB, range: new Range(8, 1, 8, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
      { id: "feedback-a", text: "feedback a", resourceUri: fileA, range: new Range(12, 1, 12, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted }
    ], prState);
    assert.deepStrictEqual(comments.map((comment) => `${comment.resourceUri.path}:${comment.range.startLineNumber}:${comment.source}`), [
      "/a.ts:3:prReview",
      "/a.ts:12:agentFeedback",
      "/b.ts:2:prReview",
      "/b.ts:8:agentFeedback"
    ]);
  });
  test("groups nearby comments only within the same resource", () => {
    const prState = {
      kind: PRReviewStateKind.Loaded,
      comments: [
        { id: "review-a", uri: fileA, range: new Range(13, 1, 13, 1), body: "review a", author: "reviewer" },
        { id: "review-b", uri: fileB, range: new Range(11, 1, 11, 1), body: "review b", author: "reviewer" }
      ]
    };
    const comments = getSessionEditorComments(session, [
      { id: "feedback-a", text: "feedback a", resourceUri: fileA, range: new Range(10, 1, 10, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted }
    ], prState);
    const groups = groupNearbySessionEditorComments(comments, 5);
    assert.strictEqual(groups.length, 2);
    assert.deepStrictEqual(groups[0].map((comment) => `${comment.resourceUri.path}:${comment.range.startLineNumber}:${comment.source}`), [
      "/a.ts:10:agentFeedback",
      "/a.ts:13:prReview"
    ]);
    assert.deepStrictEqual(groups[1].map((comment) => `${comment.resourceUri.path}:${comment.range.startLineNumber}:${comment.source}`), [
      "/b.ts:11:prReview"
    ]);
  });
  test("filters resource comments and detects authored feedback presence", () => {
    const prState = {
      kind: PRReviewStateKind.Loaded,
      comments: [
        { id: "review-b", uri: fileB, range: new Range(2, 1, 2, 1), body: "review b", author: "reviewer" }
      ]
    };
    const comments = getSessionEditorComments(session, [
      { id: "feedback-a", text: "feedback a", resourceUri: fileA, range: new Range(1, 1, 1, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted }
    ], prState);
    assert.strictEqual(hasAcceptedAgentFeedbackComments(comments), true);
    assert.deepStrictEqual(getResourceEditorComments(fileA, comments).map((comment) => comment.source), [SessionEditorCommentSource.AgentFeedback]);
    assert.deepStrictEqual(getResourceEditorComments(fileB, comments).map((comment) => comment.source), [SessionEditorCommentSource.PRReview]);
  });
  test("includes PR review comments when prReviewState is loaded", () => {
    const prState = {
      kind: PRReviewStateKind.Loaded,
      comments: [
        { id: "pr-thread-1", uri: fileA, range: new Range(5, 1, 5, 1), body: "Please fix this", author: "reviewer" },
        { id: "pr-thread-2", uri: fileB, range: new Range(1, 1, 1, 1), body: "Looks wrong", author: "reviewer" }
      ]
    };
    const comments = getSessionEditorComments(session, [], prState);
    assert.strictEqual(comments.length, 2);
    assert.deepStrictEqual(comments.map((c) => `${c.resourceUri.path}:${c.range.startLineNumber}:${c.source}`), [
      "/a.ts:5:prReview",
      "/b.ts:1:prReview"
    ]);
    assert.strictEqual(comments[0].canConvertToAgentFeedback, true);
  });
  test("merges PR review comments with feedback sorted correctly", () => {
    const prState = {
      kind: PRReviewStateKind.Loaded,
      comments: [
        { id: "pr-thread-1", uri: fileA, range: new Range(7, 1, 7, 1), body: "PR comment", author: "reviewer" }
      ]
    };
    const comments = getSessionEditorComments(session, [
      { id: "feedback-a", text: "feedback a", resourceUri: fileA, range: new Range(3, 1, 3, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted }
    ], prState);
    assert.strictEqual(comments.length, 2);
    assert.deepStrictEqual(comments.map((c) => `${c.range.startLineNumber}:${c.source}`), [
      "3:agentFeedback",
      "7:prReview"
    ]);
  });
  test("omits PR review comments when prReviewState is not loaded", () => {
    const prState = { kind: PRReviewStateKind.None };
    const comments = getSessionEditorComments(session, [], prState);
    assert.strictEqual(comments.length, 0);
  });
  test("excludes resolved feedback from the editor comments", () => {
    const comments = getSessionEditorComments(session, [
      { id: "feedback-accepted", text: "accepted", resourceUri: fileA, range: new Range(2, 1, 2, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
      { id: "feedback-resolved", text: "resolved", resourceUri: fileA, range: new Range(4, 1, 4, 1), sessionResource: session, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Resolved }
    ]);
    assert.deepStrictEqual(comments.map((comment) => comment.sourceId), ["feedback-accepted"]);
  });
  test("hides a created PR-review mirror and shows the raw PR comment instead", () => {
    const prState = {
      kind: PRReviewStateKind.Loaded,
      comments: [
        { id: "pr-thread-1", uri: fileA, range: new Range(5, 1, 5, 1), body: "Please fix this", author: "reviewer" }
      ]
    };
    const comments = getSessionEditorComments(session, [
      { id: "mirror-1", text: "Please fix this", resourceUri: fileA, range: new Range(5, 1, 5, 1), sessionResource: session, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: "pr-thread-1", state: AgentFeedbackState.Created }
    ], prState);
    assert.deepStrictEqual(comments.map((c) => `${c.source}:${c.sourceId}`), ["prReview:pr-thread-1"]);
  });
  test("shows an accepted PR-review mirror and hides the superseded raw PR comment", () => {
    const prState = {
      kind: PRReviewStateKind.Loaded,
      comments: [
        { id: "pr-thread-1", uri: fileA, range: new Range(5, 1, 5, 1), body: "Please fix this", author: "reviewer" }
      ]
    };
    const comments = getSessionEditorComments(session, [
      { id: "mirror-1", text: "Please fix this", resourceUri: fileA, range: new Range(5, 1, 5, 1), sessionResource: session, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: "pr-thread-1", state: AgentFeedbackState.Accepted }
    ], prState);
    assert.deepStrictEqual(comments.map((c) => `${c.source}:${c.sourceId}`), ["agentFeedback:mirror-1"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvbkVkaXRvckNvbW1lbnRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBnZXRSZXNvdXJjZUVkaXRvckNvbW1lbnRzLCBnZXRTZXNzaW9uRWRpdG9yQ29tbWVudHMsIGdyb3VwTmVhcmJ5U2Vzc2lvbkVkaXRvckNvbW1lbnRzLCBoYXNBY2NlcHRlZEFnZW50RmVlZGJhY2tDb21tZW50cywgU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25FZGl0b3JDb21tZW50cy5qcyc7XG5pbXBvcnQgeyBBZ2VudEZlZWRiYWNrS2luZCwgQWdlbnRGZWVkYmFja1N0YXRlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUFJSZXZpZXdTdGF0ZSwgUFJSZXZpZXdTdGF0ZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb2RlUmV2aWV3L2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnU2Vzc2lvbkVkaXRvckNvbW1lbnRzJywgKCkgPT4ge1xuXHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi8xJyk7XG5cdGNvbnN0IGZpbGVBID0gVVJJLnBhcnNlKCdmaWxlOi8vL2EudHMnKTtcblx0Y29uc3QgZmlsZUIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vYi50cycpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21lcmdlcyBhbmQgc29ydHMgZmVlZGJhY2sgYW5kIFBSIHJldmlldyBjb21tZW50cyBieSByZXNvdXJjZSBhbmQgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJTdGF0ZTogSVBSUmV2aWV3U3RhdGUgPSB7XG5cdFx0XHRraW5kOiBQUlJldmlld1N0YXRlS2luZC5Mb2FkZWQsXG5cdFx0XHRjb21tZW50czogW1xuXHRcdFx0XHR7IGlkOiAncmV2aWV3LWEnLCB1cmk6IGZpbGVBLCByYW5nZTogbmV3IFJhbmdlKDMsIDEsIDMsIDEpLCBib2R5OiAncmV2aWV3IGEnLCBhdXRob3I6ICdyZXZpZXdlcicgfSxcblx0XHRcdFx0eyBpZDogJ3Jldmlldy1iJywgdXJpOiBmaWxlQiwgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAxKSwgYm9keTogJ3JldmlldyBiJywgYXV0aG9yOiAncmV2aWV3ZXInIH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cdFx0Y29uc3QgY29tbWVudHMgPSBnZXRTZXNzaW9uRWRpdG9yQ29tbWVudHMoc2Vzc2lvbiwgW1xuXHRcdFx0eyBpZDogJ2ZlZWRiYWNrLWInLCB0ZXh0OiAnZmVlZGJhY2sgYicsIHJlc291cmNlVXJpOiBmaWxlQiwgcmFuZ2U6IG5ldyBSYW5nZSg4LCAxLCA4LCAxKSwgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uLCBraW5kOiBBZ2VudEZlZWRiYWNrS2luZC5Vc2VyUmV2aWV3LCBzdGF0ZTogQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkIH0sXG5cdFx0XHR7IGlkOiAnZmVlZGJhY2stYScsIHRleHQ6ICdmZWVkYmFjayBhJywgcmVzb3VyY2VVcmk6IGZpbGVBLCByYW5nZTogbmV3IFJhbmdlKDEyLCAxLCAxMiwgMSksIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbiwga2luZDogQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldywgc3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCB9LFxuXHRcdF0sIHByU3RhdGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21tZW50cy5tYXAoY29tbWVudCA9PiBgJHtjb21tZW50LnJlc291cmNlVXJpLnBhdGh9OiR7Y29tbWVudC5yYW5nZS5zdGFydExpbmVOdW1iZXJ9OiR7Y29tbWVudC5zb3VyY2V9YCksIFtcblx0XHRcdCcvYS50czozOnByUmV2aWV3Jyxcblx0XHRcdCcvYS50czoxMjphZ2VudEZlZWRiYWNrJyxcblx0XHRcdCcvYi50czoyOnByUmV2aWV3Jyxcblx0XHRcdCcvYi50czo4OmFnZW50RmVlZGJhY2snLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdncm91cHMgbmVhcmJ5IGNvbW1lbnRzIG9ubHkgd2l0aGluIHRoZSBzYW1lIHJlc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByU3RhdGU6IElQUlJldmlld1N0YXRlID0ge1xuXHRcdFx0a2luZDogUFJSZXZpZXdTdGF0ZUtpbmQuTG9hZGVkLFxuXHRcdFx0Y29tbWVudHM6IFtcblx0XHRcdFx0eyBpZDogJ3Jldmlldy1hJywgdXJpOiBmaWxlQSwgcmFuZ2U6IG5ldyBSYW5nZSgxMywgMSwgMTMsIDEpLCBib2R5OiAncmV2aWV3IGEnLCBhdXRob3I6ICdyZXZpZXdlcicgfSxcblx0XHRcdFx0eyBpZDogJ3Jldmlldy1iJywgdXJpOiBmaWxlQiwgcmFuZ2U6IG5ldyBSYW5nZSgxMSwgMSwgMTEsIDEpLCBib2R5OiAncmV2aWV3IGInLCBhdXRob3I6ICdyZXZpZXdlcicgfSxcblx0XHRcdF0sXG5cdFx0fTtcblx0XHRjb25zdCBjb21tZW50cyA9IGdldFNlc3Npb25FZGl0b3JDb21tZW50cyhzZXNzaW9uLCBbXG5cdFx0XHR7IGlkOiAnZmVlZGJhY2stYScsIHRleHQ6ICdmZWVkYmFjayBhJywgcmVzb3VyY2VVcmk6IGZpbGVBLCByYW5nZTogbmV3IFJhbmdlKDEwLCAxLCAxMCwgMSksIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbiwga2luZDogQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldywgc3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCB9LFxuXHRcdF0sIHByU3RhdGUpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzID0gZ3JvdXBOZWFyYnlTZXNzaW9uRWRpdG9yQ29tbWVudHMoY29tbWVudHMsIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyb3Vwc1swXS5tYXAoY29tbWVudCA9PiBgJHtjb21tZW50LnJlc291cmNlVXJpLnBhdGh9OiR7Y29tbWVudC5yYW5nZS5zdGFydExpbmVOdW1iZXJ9OiR7Y29tbWVudC5zb3VyY2V9YCksIFtcblx0XHRcdCcvYS50czoxMDphZ2VudEZlZWRiYWNrJyxcblx0XHRcdCcvYS50czoxMzpwclJldmlldycsXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncm91cHNbMV0ubWFwKGNvbW1lbnQgPT4gYCR7Y29tbWVudC5yZXNvdXJjZVVyaS5wYXRofToke2NvbW1lbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfToke2NvbW1lbnQuc291cmNlfWApLCBbXG5cdFx0XHQnL2IudHM6MTE6cHJSZXZpZXcnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWx0ZXJzIHJlc291cmNlIGNvbW1lbnRzIGFuZCBkZXRlY3RzIGF1dGhvcmVkIGZlZWRiYWNrIHByZXNlbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByU3RhdGU6IElQUlJldmlld1N0YXRlID0ge1xuXHRcdFx0a2luZDogUFJSZXZpZXdTdGF0ZUtpbmQuTG9hZGVkLFxuXHRcdFx0Y29tbWVudHM6IFtcblx0XHRcdFx0eyBpZDogJ3Jldmlldy1iJywgdXJpOiBmaWxlQiwgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAxKSwgYm9keTogJ3JldmlldyBiJywgYXV0aG9yOiAncmV2aWV3ZXInIH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cdFx0Y29uc3QgY29tbWVudHMgPSBnZXRTZXNzaW9uRWRpdG9yQ29tbWVudHMoc2Vzc2lvbiwgW1xuXHRcdFx0eyBpZDogJ2ZlZWRiYWNrLWEnLCB0ZXh0OiAnZmVlZGJhY2sgYScsIHJlc291cmNlVXJpOiBmaWxlQSwgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uLCBraW5kOiBBZ2VudEZlZWRiYWNrS2luZC5Vc2VyUmV2aWV3LCBzdGF0ZTogQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkIH0sXG5cdFx0XSwgcHJTdGF0ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzQWNjZXB0ZWRBZ2VudEZlZWRiYWNrQ29tbWVudHMoY29tbWVudHMpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlc291cmNlRWRpdG9yQ29tbWVudHMoZmlsZUEsIGNvbW1lbnRzKS5tYXAoY29tbWVudCA9PiBjb21tZW50LnNvdXJjZSksIFtTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZS5BZ2VudEZlZWRiYWNrXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZXNvdXJjZUVkaXRvckNvbW1lbnRzKGZpbGVCLCBjb21tZW50cykubWFwKGNvbW1lbnQgPT4gY29tbWVudC5zb3VyY2UpLCBbU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UuUFJSZXZpZXddKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgUFIgcmV2aWV3IGNvbW1lbnRzIHdoZW4gcHJSZXZpZXdTdGF0ZSBpcyBsb2FkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJTdGF0ZTogSVBSUmV2aWV3U3RhdGUgPSB7XG5cdFx0XHRraW5kOiBQUlJldmlld1N0YXRlS2luZC5Mb2FkZWQsXG5cdFx0XHRjb21tZW50czogW1xuXHRcdFx0XHR7IGlkOiAncHItdGhyZWFkLTEnLCB1cmk6IGZpbGVBLCByYW5nZTogbmV3IFJhbmdlKDUsIDEsIDUsIDEpLCBib2R5OiAnUGxlYXNlIGZpeCB0aGlzJywgYXV0aG9yOiAncmV2aWV3ZXInIH0sXG5cdFx0XHRcdHsgaWQ6ICdwci10aHJlYWQtMicsIHVyaTogZmlsZUIsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIGJvZHk6ICdMb29rcyB3cm9uZycsIGF1dGhvcjogJ3Jldmlld2VyJyB9LFxuXHRcdFx0XSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29tbWVudHMgPSBnZXRTZXNzaW9uRWRpdG9yQ29tbWVudHMoc2Vzc2lvbiwgW10sIHByU3RhdGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21tZW50cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tbWVudHMubWFwKGMgPT4gYCR7Yy5yZXNvdXJjZVVyaS5wYXRofToke2MucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfToke2Muc291cmNlfWApLCBbXG5cdFx0XHQnL2EudHM6NTpwclJldmlldycsXG5cdFx0XHQnL2IudHM6MTpwclJldmlldycsXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbW1lbnRzWzBdLmNhbkNvbnZlcnRUb0FnZW50RmVlZGJhY2ssIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZXMgUFIgcmV2aWV3IGNvbW1lbnRzIHdpdGggZmVlZGJhY2sgc29ydGVkIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCBwclN0YXRlOiBJUFJSZXZpZXdTdGF0ZSA9IHtcblx0XHRcdGtpbmQ6IFBSUmV2aWV3U3RhdGVLaW5kLkxvYWRlZCxcblx0XHRcdGNvbW1lbnRzOiBbXG5cdFx0XHRcdHsgaWQ6ICdwci10aHJlYWQtMScsIHVyaTogZmlsZUEsIHJhbmdlOiBuZXcgUmFuZ2UoNywgMSwgNywgMSksIGJvZHk6ICdQUiBjb21tZW50JywgYXV0aG9yOiAncmV2aWV3ZXInIH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cblx0XHRjb25zdCBjb21tZW50cyA9IGdldFNlc3Npb25FZGl0b3JDb21tZW50cyhzZXNzaW9uLCBbXG5cdFx0XHR7IGlkOiAnZmVlZGJhY2stYScsIHRleHQ6ICdmZWVkYmFjayBhJywgcmVzb3VyY2VVcmk6IGZpbGVBLCByYW5nZTogbmV3IFJhbmdlKDMsIDEsIDMsIDEpLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24sIGtpbmQ6IEFnZW50RmVlZGJhY2tLaW5kLlVzZXJSZXZpZXcsIHN0YXRlOiBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQgfSxcblx0XHRdLCBwclN0YXRlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21tZW50cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tbWVudHMubWFwKGMgPT4gYCR7Yy5yYW5nZS5zdGFydExpbmVOdW1iZXJ9OiR7Yy5zb3VyY2V9YCksIFtcblx0XHRcdCczOmFnZW50RmVlZGJhY2snLFxuXHRcdFx0Jzc6cHJSZXZpZXcnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyBQUiByZXZpZXcgY29tbWVudHMgd2hlbiBwclJldmlld1N0YXRlIGlzIG5vdCBsb2FkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJTdGF0ZTogSVBSUmV2aWV3U3RhdGUgPSB7IGtpbmQ6IFBSUmV2aWV3U3RhdGVLaW5kLk5vbmUgfTtcblx0XHRjb25zdCBjb21tZW50cyA9IGdldFNlc3Npb25FZGl0b3JDb21tZW50cyhzZXNzaW9uLCBbXSwgcHJTdGF0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbW1lbnRzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHJlc29sdmVkIGZlZWRiYWNrIGZyb20gdGhlIGVkaXRvciBjb21tZW50cycsICgpID0+IHtcblx0XHRjb25zdCBjb21tZW50cyA9IGdldFNlc3Npb25FZGl0b3JDb21tZW50cyhzZXNzaW9uLCBbXG5cdFx0XHR7IGlkOiAnZmVlZGJhY2stYWNjZXB0ZWQnLCB0ZXh0OiAnYWNjZXB0ZWQnLCByZXNvdXJjZVVyaTogZmlsZUEsIHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMSksIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbiwga2luZDogQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldywgc3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCB9LFxuXHRcdFx0eyBpZDogJ2ZlZWRiYWNrLXJlc29sdmVkJywgdGV4dDogJ3Jlc29sdmVkJywgcmVzb3VyY2VVcmk6IGZpbGVBLCByYW5nZTogbmV3IFJhbmdlKDQsIDEsIDQsIDEpLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24sIGtpbmQ6IEFnZW50RmVlZGJhY2tLaW5kLlVzZXJSZXZpZXcsIHN0YXRlOiBBZ2VudEZlZWRiYWNrU3RhdGUuUmVzb2x2ZWQgfSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tbWVudHMubWFwKGNvbW1lbnQgPT4gY29tbWVudC5zb3VyY2VJZCksIFsnZmVlZGJhY2stYWNjZXB0ZWQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIGEgY3JlYXRlZCBQUi1yZXZpZXcgbWlycm9yIGFuZCBzaG93cyB0aGUgcmF3IFBSIGNvbW1lbnQgaW5zdGVhZCcsICgpID0+IHtcblx0XHRjb25zdCBwclN0YXRlOiBJUFJSZXZpZXdTdGF0ZSA9IHtcblx0XHRcdGtpbmQ6IFBSUmV2aWV3U3RhdGVLaW5kLkxvYWRlZCxcblx0XHRcdGNvbW1lbnRzOiBbXG5cdFx0XHRcdHsgaWQ6ICdwci10aHJlYWQtMScsIHVyaTogZmlsZUEsIHJhbmdlOiBuZXcgUmFuZ2UoNSwgMSwgNSwgMSksIGJvZHk6ICdQbGVhc2UgZml4IHRoaXMnLCBhdXRob3I6ICdyZXZpZXdlcicgfSxcblx0XHRcdF0sXG5cdFx0fTtcblx0XHRjb25zdCBjb21tZW50cyA9IGdldFNlc3Npb25FZGl0b3JDb21tZW50cyhzZXNzaW9uLCBbXG5cdFx0XHR7IGlkOiAnbWlycm9yLTEnLCB0ZXh0OiAnUGxlYXNlIGZpeCB0aGlzJywgcmVzb3VyY2VVcmk6IGZpbGVBLCByYW5nZTogbmV3IFJhbmdlKDUsIDEsIDUsIDEpLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24sIGtpbmQ6IEFnZW50RmVlZGJhY2tLaW5kLlBSUmV2aWV3LCBzb3VyY2VQUlJldmlld0NvbW1lbnRJZDogJ3ByLXRocmVhZC0xJywgc3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5DcmVhdGVkIH0sXG5cdFx0XSwgcHJTdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1lbnRzLm1hcChjID0+IGAke2Muc291cmNlfToke2Muc291cmNlSWR9YCksIFsncHJSZXZpZXc6cHItdGhyZWFkLTEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIGFuIGFjY2VwdGVkIFBSLXJldmlldyBtaXJyb3IgYW5kIGhpZGVzIHRoZSBzdXBlcnNlZGVkIHJhdyBQUiBjb21tZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHByU3RhdGU6IElQUlJldmlld1N0YXRlID0ge1xuXHRcdFx0a2luZDogUFJSZXZpZXdTdGF0ZUtpbmQuTG9hZGVkLFxuXHRcdFx0Y29tbWVudHM6IFtcblx0XHRcdFx0eyBpZDogJ3ByLXRocmVhZC0xJywgdXJpOiBmaWxlQSwgcmFuZ2U6IG5ldyBSYW5nZSg1LCAxLCA1LCAxKSwgYm9keTogJ1BsZWFzZSBmaXggdGhpcycsIGF1dGhvcjogJ3Jldmlld2VyJyB9LFxuXHRcdFx0XSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbW1lbnRzID0gZ2V0U2Vzc2lvbkVkaXRvckNvbW1lbnRzKHNlc3Npb24sIFtcblx0XHRcdHsgaWQ6ICdtaXJyb3ItMScsIHRleHQ6ICdQbGVhc2UgZml4IHRoaXMnLCByZXNvdXJjZVVyaTogZmlsZUEsIHJhbmdlOiBuZXcgUmFuZ2UoNSwgMSwgNSwgMSksIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbiwga2luZDogQWdlbnRGZWVkYmFja0tpbmQuUFJSZXZpZXcsIHNvdXJjZVBSUmV2aWV3Q29tbWVudElkOiAncHItdGhyZWFkLTEnLCBzdGF0ZTogQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkIH0sXG5cdFx0XSwgcHJTdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1lbnRzLm1hcChjID0+IGAke2Muc291cmNlfToke2Muc291cmNlSWR9YCksIFsnYWdlbnRGZWVkYmFjazptaXJyb3ItMSddKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCLDBCQUEwQixrQ0FBa0Msa0NBQWtDLGtDQUFrQztBQUNwSyxTQUFTLG1CQUFtQiwwQkFBMEI7QUFDdEQsU0FBeUIseUJBQXlCO0FBRWxELE1BQU0seUJBQXlCLE1BQU07QUFDcEMsUUFBTSxVQUFVLElBQUksTUFBTSxrQkFBa0I7QUFDNUMs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
