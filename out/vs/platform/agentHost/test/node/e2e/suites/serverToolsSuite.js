import assert from "assert";
import { mkdirSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { retry } from "../../../../../../base/common/async.js";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { FEEDBACK_ANNOTATION_META_KEY } from "../../../../common/meta/agentFeedbackAnnotations.js";
import { buildAnnotationsUri } from "../../../../common/annotationsUri.js";
import { buildOpenSessionLinkUri } from "../../../../common/openSessionLink.js";
import { SessionServerToolName } from "../../../../common/serverToolNames.js";
import { ActionType, NotificationType } from "../../../../common/state/sessionActions.js";
import {
  buildDefaultChatUri,
  ROOT_STATE_URI
} from "../../../../common/state/sessionState.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { createRealSession, driveTurnToCompletion, resolveGitHubToken, textFromContent } from "../harness/agentHostE2ETestHarness.js";
import { summarizeAnthropicRequest } from "../harness/capiWireCodec.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
const feedbackToolNames = ["addComment", "listComments", "deleteComments", "resolveComments", "viewUnreviewedComments"];
const feedbackResourceUri = "untitled://server-tools/reviewed.ts";
const sessionToolNames = [
  SessionServerToolName.ListSessions,
  SessionServerToolName.GetCurrentSession,
  SessionServerToolName.CreateSession,
  SessionServerToolName.CreateChat,
  SessionServerToolName.SendMessage,
  SessionServerToolName.GetSessionContext,
  SessionServerToolName.DeleteSession
];
function defineServerToolsTests(context) {
  const { config, createdSessions, tempDirs } = context;
  const supportsDirectSessionLookup = config.provider !== "codex";
  const supportsFullSessionContext = config.provider !== "claude";
  const supportsCrossSessionSend = config.provider !== "codex";
  const supportsCrossSessionDelete = config.provider === "copilotcli";
  const supportsSelfSendRejection = config.provider === "copilotcli";
  const supportsProviderModelSessionCreation = config.provider === "copilotcli";
  const supportsServerToolCreateChat = config.provider === "copilotcli";
  let nextClientSequence = 1e4;
  function reserveClientSequenceBlock() {
    const start = nextClientSequence;
    nextClientSequence += 100;
    return start;
  }
  async function addSession(prefix, workspace, stableResource = false) {
    const id = stableResource && config.provider === "copilotcli" ? `e2e-server-tools-${prefix}` : generateUuid();
    const sessionUri = URI.from({ scheme: config.scheme, path: `/${id}` }).toString();
    await context.client.call("createSession", {
      channel: sessionUri,
      provider: config.provider,
      workingDirectories: [URI.file(workspace).toString()],
      config: { isolation: "folder" }
    }, 3e4);
    createdSessions.push(sessionUri);
    const chatUri = buildDefaultChatUri(sessionUri);
    await context.client.call("subscribe", { channel: sessionUri });
    await context.client.call("subscribe", { channel: chatUri });
    return { sessionUri, chatUri, workspace };
  }
  async function createSession(prefix, stableResource = false) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-server-tools-${prefix}-`));
    tempDirs.push(workspace);
    if (!stableResource) {
      const sessionUri = await createRealSession(
        context.client,
        config,
        `server-tools-${prefix}-${config.provider}`,
        createdSessions,
        URI.file(workspace)
      );
      context.client.clearReceived();
      return { sessionUri, chatUri: buildDefaultChatUri(sessionUri), workspace };
    }
    context.client.setWorkingDirectory(workspace);
    await context.client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId: `server-tools-${prefix}-${config.provider}`
    }, 3e4);
    await context.client.call("authenticate", {
      channel: ROOT_STATE_URI,
      resource: "https://api.github.com",
      token: config.githubToken ?? resolveGitHubToken()
    }, 3e4);
    const session = await addSession(prefix, workspace, true);
    context.client.clearReceived();
    return session;
  }
  async function sessionState(sessionUri) {
    const result = await context.client.call("subscribe", { channel: sessionUri });
    return result.snapshot.state;
  }
  async function chatState(chatUri) {
    const result = await context.client.call("subscribe", { channel: chatUri });
    return result.snapshot.state;
  }
  async function annotationsState(sessionUri) {
    const result = await context.client.call("subscribe", { channel: buildAnnotationsUri(sessionUri) });
    return result.snapshot.state;
  }
  async function dispatchAndWait(channel, action) {
    const clientSeq = reserveClientSequenceBlock();
    context.client.dispatch({ channel, clientSeq, action });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, action.type) && getActionEnvelope(n).channel === channel && getActionEnvelope(n).origin?.clientSeq === clientSeq,
      3e4
    );
  }
  async function seedFeedback(sessionUri, options) {
    const annotationsUri = buildAnnotationsUri(sessionUri);
    await context.client.call("subscribe", { channel: annotationsUri });
    const meta = {
      kind: options.kind ?? "codeReview",
      state: options.state,
      sessionResource: sessionUri,
      ...options.pendingAgentReveal ? { pendingAgentReveal: true } : {}
    };
    const entries = [
      { id: `${options.id}:0`, text: options.text },
      ...(options.replies ?? []).map((text, index) => ({ id: `${options.id}:${index + 1}`, text }))
    ];
    await dispatchAndWait(annotationsUri, {
      type: ActionType.AnnotationsSet,
      annotation: {
        id: options.id,
        turnId: "seed-feedback",
        resource: options.resource,
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
        resolved: options.resolved ?? false,
        entries,
        _meta: { [FEEDBACK_ANNOTATION_META_KEY]: meta }
      }
    });
    context.client.clearReceived();
  }
  function toolNameMatches(observed, expected) {
    return observed === expected || observed.endsWith(`__${expected}`);
  }
  async function driveServerTool(session, turnId, prompt, toolName, options = {}) {
    const turn = await driveTurnToCompletion(context.client, session.sessionUri, turnId, prompt, reserveClientSequenceBlock());
    const starts = context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).filter(({ envelope, action }) => envelope.channel === session.chatUri && action.turnId === turnId && toolNameMatches(action.toolName, toolName));
    const start = starts.at(-1)?.action;
    assert.ok(start, `expected ${turnId} to start server tool ${toolName}`);
    assert.notStrictEqual(start.contributor?.kind, "client");
    const completion = context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).find(({ envelope, action }) => envelope.channel === session.chatUri && action.turnId === turnId && action.toolCallId === start.toolCallId)?.action;
    assert.ok(completion, `expected ${turnId} to complete server tool ${toolName}`);
    assert.strictEqual(completion.result.success, options.success ?? true);
    const resultText = textFromContent(completion.result.content ?? []);
    if (options.result) {
      for (const expected of options.result) {
        assert.match(resultText, expected);
      }
    }
    return { turn, tool: { start, completion, resultText } };
  }
  async function waitForChatIdle(chatUri) {
    let state = await chatState(chatUri);
    if (state.activeTurn) {
      const turnId = state.activeTurn.id;
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
        9e4
      );
      state = await chatState(chatUri);
    }
    assert.strictEqual(state.activeTurn, void 0);
    return state;
  }
  if (context.tier !== "parity") {
    return;
  }
  function serverToolTest(title, run, enabled = true) {
    (enabled ? test : test.skip)(title, function() {
      this.timeout(18e4);
      return run.call(this);
    });
  }
  async function materializeSession(session, turnId, marker) {
    await driveTurnToCompletion(
      context.client,
      session.sessionUri,
      turnId,
      `Reply exactly "${marker}".`,
      reserveClientSequenceBlock()
    );
  }
  serverToolTest("server tool: sessions advertise the complete host-owned tool catalog", async function() {
    const session = await createSession("catalog");
    await driveTurnToCompletion(context.client, session.sessionUri, "turn-catalog", 'Reply exactly "ready".', reserveClientSequenceBlock());
    const toolNames = await retry(async () => {
      const state = await sessionState(session.sessionUri);
      if (!state.serverTools) {
        throw new Error("Server tools have not been advertised");
      }
      return state.serverTools.map((tool) => tool.name);
    }, 100, 30);
    assert.deepStrictEqual(toolNames, [...feedbackToolNames, ...sessionToolNames]);
  });
  serverToolTest("server tool: listComments executes in-process with an empty annotation channel", async function() {
    const session = await createSession("comments-empty");
    const { tool } = await driveServerTool(
      session,
      "turn-comments-empty",
      'Call the listComments tool exactly once, then reply with exactly "listed".',
      "listComments"
    );
    assert.deepStrictEqual(JSON.parse(tool.resultText), { comments: [] });
  });
  serverToolTest("server tool: addComment converts a one-based input range to the zero-based annotations range", async function() {
    const session = await createSession("comment-add");
    await driveServerTool(
      session,
      "turn-comment-add",
      `Call addComment exactly once for ${feedbackResourceUri} with range startLineNumber 1, startColumn 7, endLineNumber 1, endColumn 13 and text "rename this", then reply exactly "added".`,
      "addComment",
      { result: [/Comment added/] }
    );
    const annotations = (await annotationsState(session.sessionUri)).annotations;
    assert.deepStrictEqual(annotations.map((annotation) => ({
      resource: annotation.resource,
      range: annotation.range,
      text: annotation.entries?.[0]?.text,
      meta: annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY]
    })), [{
      resource: feedbackResourceUri,
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
      text: "rename this",
      meta: { kind: "codeReview", state: "created", sessionResource: session.sessionUri }
    }]);
  });
  serverToolTest("server tool: listComments returns accepted feedback and reports hidden review feedback", async function() {
    const session = await createSession("comments-list");
    const resource = feedbackResourceUri;
    await seedFeedback(session.sessionUri, { id: "accepted-comment", resource, text: "visible", state: "accepted", replies: ["reply"] });
    await seedFeedback(session.sessionUri, { id: "hidden-comment", resource, text: "hidden", state: "created" });
    const { tool } = await driveServerTool(
      session,
      "turn-comments-list",
      'Call listComments exactly once, then reply exactly "listed".',
      "listComments"
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual({
      comments: result.comments.map((comment) => ({ id: comment.id, replies: comment.replies })),
      noteMentionsUnreviewed: result.note?.includes("1 code review comment") ?? false
    }, {
      comments: [{ id: "accepted-comment", replies: ["reply"] }],
      noteMentionsUnreviewed: true
    });
  });
  serverToolTest("server tool: resolveComments marks accepted feedback resolved", async function() {
    const session = await createSession("comment-resolve");
    const resource = feedbackResourceUri;
    await seedFeedback(session.sessionUri, { id: "resolve-me", resource, text: "resolve", state: "accepted" });
    await driveServerTool(
      session,
      "turn-comment-resolve",
      'Call resolveComments exactly once with commentIds ["resolve-me"], then reply exactly "resolved".',
      "resolveComments",
      { result: [/"updatedCommentIds":\s*\[\s*"resolve-me"/] }
    );
    const annotation = (await annotationsState(session.sessionUri)).annotations.find((annotation2) => annotation2.id === "resolve-me");
    assert.deepStrictEqual({
      resolved: annotation?.resolved,
      state: annotation?._meta?.[FEEDBACK_ANNOTATION_META_KEY]?.state
    }, {
      resolved: true,
      state: "resolved"
    });
  });
  serverToolTest("server tool: resolveComments can reopen resolved feedback", async function() {
    const session = await createSession("comment-reopen");
    const resource = feedbackResourceUri;
    await seedFeedback(session.sessionUri, { id: "reopen-me", resource, text: "reopen", state: "resolved", resolved: true });
    await driveServerTool(
      session,
      "turn-comment-reopen",
      'Call resolveComments exactly once with commentIds ["reopen-me"] and resolved false, then reply exactly "reopened".',
      "resolveComments",
      { result: [/"resolved":\s*false/] }
    );
    const annotation = (await annotationsState(session.sessionUri)).annotations.find((annotation2) => annotation2.id === "reopen-me");
    assert.deepStrictEqual({
      resolved: annotation?.resolved,
      state: annotation?._meta?.[FEEDBACK_ANNOTATION_META_KEY]?.state
    }, {
      resolved: false,
      state: "submitted"
    });
  });
  serverToolTest("server tool: deleteComments removes accepted feedback without touching hidden feedback", async function() {
    const session = await createSession("comment-delete");
    const resource = feedbackResourceUri;
    await seedFeedback(session.sessionUri, { id: "delete-me", resource, text: "delete", state: "accepted" });
    await seedFeedback(session.sessionUri, { id: "keep-hidden", resource, text: "hidden", state: "created" });
    const hiddenBefore = (await annotationsState(session.sessionUri)).annotations.find((annotation) => annotation.id === "keep-hidden");
    assert.ok(hiddenBefore);
    await driveServerTool(
      session,
      "turn-comment-delete",
      'Call deleteComments exactly once with commentIds ["delete-me"], then reply exactly "deleted".',
      "deleteComments",
      { result: [/"deletedCommentIds":\s*\[\s*"delete-me"/] }
    );
    assert.deepStrictEqual((await annotationsState(session.sessionUri)).annotations, [hiddenBefore]);
  });
  serverToolTest("server tool: viewUnreviewedComments returns selected feedback and clears pending reveal state", async function() {
    const session = await createSession("comments-view");
    const resource = feedbackResourceUri;
    await seedFeedback(session.sessionUri, {
      id: "reveal-me",
      resource,
      text: "revealed",
      state: "accepted",
      kind: "prReview",
      pendingAgentReveal: true
    });
    const { turn, tool } = await driveServerTool(
      session,
      "turn-comments-view",
      'Call viewUnreviewedComments exactly once, then reply exactly "viewed".',
      "viewUnreviewedComments",
      { result: [/"id":\s*"reveal-me"/] }
    );
    assert.strictEqual(turn.sawPendingConfirmation, true);
    const annotation = (await annotationsState(session.sessionUri)).annotations.find((annotation2) => annotation2.id === "reveal-me");
    assert.deepStrictEqual({
      pendingAgentReveal: annotation?._meta?.[FEEDBACK_ANNOTATION_META_KEY]?.pendingAgentReveal,
      result: JSON.parse(tool.resultText).comments.map((comment) => comment.id)
    }, {
      pendingAgentReveal: void 0,
      result: ["reveal-me"]
    });
  });
  serverToolTest("server tool: get_current_session returns the invoking session metadata and open link", async function() {
    const session = await createSession("current-session");
    const { tool } = await driveServerTool(
      session,
      "turn-current-session",
      'Call get_current_session exactly once, then reply exactly "current".',
      SessionServerToolName.GetCurrentSession
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual({
      session: result.session,
      openLink: result.openLink,
      workingDirectory: result.workingDirectory
    }, {
      session: session.sessionUri,
      openLink: buildOpenSessionLinkUri(URI.parse(session.sessionUri)),
      workingDirectory: URI.file(session.workspace).toString()
    });
  });
  serverToolTest("server tool: list_sessions returns live session metadata", async function() {
    const session = await createSession("sessions-list");
    const { tool } = await driveServerTool(
      session,
      "turn-sessions-list",
      `Call list_sessions exactly once with workspace "${session.workspace}", then reply exactly "listed".`,
      SessionServerToolName.ListSessions
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual(result.sessions.map((item) => ({
      session: item.session,
      workingDirectory: item.workingDirectory
    })), [{
      session: session.sessionUri,
      workingDirectory: URI.file(session.workspace).toString()
    }]);
  });
  serverToolTest("server tool: list_sessions direct lookup accepts an open-session link", async function() {
    const session = await createSession("sessions-direct", true);
    const openLink = buildOpenSessionLinkUri(URI.parse(session.sessionUri));
    const { tool } = await driveServerTool(
      session,
      "turn-sessions-direct",
      `Call list_sessions exactly once with session "${openLink}", then reply exactly "found".`,
      SessionServerToolName.ListSessions
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual(result.sessions.map((item) => item.session), [session.sessionUri]);
  }, supportsDirectSessionLookup);
  serverToolTest("server tool: list_sessions workspace filter excludes sessions in other folders", async function() {
    const session = await createSession("sessions-workspace");
    const otherWorkspace = join(session.workspace, "other");
    mkdirSync(otherWorkspace);
    const other = await addSession("sessions-workspace-other", otherWorkspace);
    await materializeSession(other, "turn-sessions-workspace-target", "WORKSPACE_TARGET_READY");
    context.client.clearReceived();
    const { tool } = await driveServerTool(
      session,
      "turn-sessions-workspace",
      `Call list_sessions exactly once with workspace "${otherWorkspace}", then reply exactly "filtered".`,
      SessionServerToolName.ListSessions
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual(result.sessions.map((item) => item.session), [other.sessionUri]);
  });
  serverToolTest("server tool: list_sessions can include an archived session on request", async function() {
    const session = await createSession("sessions-archived");
    const archived = await addSession("sessions-archived-target", session.workspace);
    await materializeSession(archived, "turn-sessions-archived-target", "ARCHIVED_TARGET_READY");
    await dispatchAndWait(archived.sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
    context.client.clearReceived();
    const { tool } = await driveServerTool(
      session,
      "turn-sessions-archived",
      'Call list_sessions exactly once with status ["archived"], then reply exactly "listed".',
      SessionServerToolName.ListSessions
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual(result.sessions.find((item) => item.session === archived.sessionUri)?.status?.split(",").sort(), ["archived", "idle"]);
  });
  serverToolTest("server tool: list_sessions status filter finds the invoking in-progress session", async function() {
    const session = await createSession("sessions-status");
    const { tool } = await driveServerTool(
      session,
      "turn-sessions-status",
      'Call list_sessions exactly once with status ["inProgress"], then reply exactly "filtered".',
      SessionServerToolName.ListSessions
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual(result.sessions.map((item) => ({ session: item.session, status: item.status })), [{
      session: session.sessionUri,
      status: "inProgress"
    }]);
  });
  serverToolTest("server tool: list_sessions unread filter returns the invoking unread session", async function() {
    const session = await createSession("sessions-unread");
    const { tool } = await driveServerTool(
      session,
      "turn-sessions-unread",
      'Call list_sessions exactly once with unread true, then reply exactly "filtered".',
      SessionServerToolName.ListSessions
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual(result.sessions.map((item) => ({ session: item.session, unread: item.unread })), [{
      session: session.sessionUri,
      unread: true
    }]);
  });
  serverToolTest("server tool: list_sessions createdAfter accepts current sessions", async function() {
    const session = await createSession("sessions-created-after");
    const { tool } = await driveServerTool(
      session,
      "turn-sessions-created-after",
      `Call list_sessions exactly once with workspace "${session.workspace}" and createdAfter "2000-01-01T00:00:00Z", then reply exactly "filtered".`,
      SessionServerToolName.ListSessions
    );
    const result = JSON.parse(tool.resultText);
    assert.ok(result.sessions.some((item) => item.session === session.sessionUri));
  });
  serverToolTest("server tool: list_sessions createdBefore excludes current sessions", async function() {
    const session = await createSession("sessions-created-before");
    const { tool } = await driveServerTool(
      session,
      "turn-sessions-created-before",
      'Call list_sessions exactly once with createdBefore "2000-01-01T00:00:00Z", then reply exactly "filtered".',
      SessionServerToolName.ListSessions
    );
    const result = JSON.parse(tool.resultText);
    assert.strictEqual(result.sessions.some((item) => item.session === session.sessionUri), false);
  });
  serverToolTest("server tool: create_chat defaults to the invoking session and starts its local prompt", async function() {
    const session = await createSession("create-chat-default");
    const before = new Set((await sessionState(session.sessionUri)).chats.map((chat) => chat.resource));
    const { turn } = await driveServerTool(
      session,
      "turn-create-chat-default",
      'Call create_chat exactly once with prompt "/rename Created Peer", then reply exactly "created".',
      SessionServerToolName.CreateChat
    );
    const after = await sessionState(session.sessionUri);
    const peer = after.chats.find((chat) => !before.has(chat.resource));
    assert.ok(peer);
    const peerState = await waitForChatIdle(peer.resource);
    assert.deepStrictEqual({
      sawPendingConfirmation: turn.sawPendingConfirmation,
      messages: peerState.turns.map((turn2) => turn2.message.text)
    }, {
      sawPendingConfirmation: true,
      messages: ["/rename Created Peer"]
    });
  }, config.supportsMultipleChats && supportsServerToolCreateChat);
  serverToolTest("server tool: create_chat applies an explicit peer title", async function() {
    const session = await createSession("create-chat-title");
    const before = new Set((await sessionState(session.sessionUri)).chats.map((chat) => chat.resource));
    await driveServerTool(
      session,
      "turn-create-chat-title",
      'Call create_chat exactly once with prompt "/rename" and title "Explicit Peer", then reply exactly "created".',
      SessionServerToolName.CreateChat
    );
    const after = await sessionState(session.sessionUri);
    const peer = after.chats.find((chat) => !before.has(chat.resource));
    assert.ok(peer);
    await waitForChatIdle(peer.resource);
    assert.strictEqual((await sessionState(session.sessionUri)).chats.find((chat) => chat.resource === peer.resource)?.title, "Explicit Peer");
  }, config.supportsMultipleChats && supportsServerToolCreateChat);
  serverToolTest("server tool: get_session_context summary includes a completed prior turn", async function() {
    const session = await createSession("context-summary", true);
    await driveTurnToCompletion(context.client, session.sessionUri, "turn-context-seed", 'Reply exactly "CONTEXT_READY".', reserveClientSequenceBlock());
    const { tool } = await driveServerTool(
      session,
      "turn-context-summary",
      `Call get_session_context exactly once with session "${session.sessionUri}", then reply exactly "read".`,
      SessionServerToolName.GetSessionContext
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual({
      detail: result.detail,
      first: result.transcript[0]
    }, {
      detail: "summary",
      first: { turn: 1, state: "complete", user: 'Reply exactly "CONTEXT_READY".', assistant: "CONTEXT_READY" }
    });
  });
  serverToolTest("server tool: get_session_context full includes prior server-tool input", async function() {
    const session = await createSession("context-full", true);
    await driveServerTool(
      session,
      "turn-context-tool-seed",
      'Call list_sessions exactly once with no filters, then reply exactly "SEEDED".',
      SessionServerToolName.ListSessions
    );
    const { tool } = await driveServerTool(
      session,
      "turn-context-full",
      `Call get_session_context exactly once with session "${session.sessionUri}" and detail "full", then reply exactly "read".`,
      SessionServerToolName.GetSessionContext
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual(result.transcript[0]?.toolCalls, [{ name: SessionServerToolName.ListSessions, input: "{}" }]);
  }, supportsFullSessionContext);
  serverToolTest("server tool: get_session_context transcriptLimit keeps only the newest turn", async function() {
    const session = await createSession("context-limit", true);
    await driveTurnToCompletion(context.client, session.sessionUri, "turn-context-old", 'Reply exactly "OLD".', reserveClientSequenceBlock());
    await driveTurnToCompletion(context.client, session.sessionUri, "turn-context-new", 'Reply exactly "NEW".', reserveClientSequenceBlock());
    const { tool } = await driveServerTool(
      session,
      "turn-context-limit",
      `Call get_session_context exactly once with session "${session.sessionUri}" and transcriptLimit 1, then reply exactly "read".`,
      SessionServerToolName.GetSessionContext
    );
    const result = JSON.parse(tool.resultText);
    assert.deepStrictEqual({
      users: result.transcript.map((turn) => turn.user),
      truncated: result.truncated
    }, {
      users: [`Call get_session_context exactly once with session "${session.sessionUri}" and transcriptLimit 1, then reply exactly "read".`],
      truncated: true
    });
  });
  serverToolTest("server tool: send_message starts a turn in another session", async function() {
    const session = await createSession("send-message", true);
    const target = await addSession("send-message-target", session.workspace, true);
    await materializeSession(target, "turn-send-message-target-seed", "TARGET_MATERIALIZED");
    context.client.clearReceived();
    const { turn } = await driveServerTool(
      session,
      "turn-send-message",
      `Call send_message exactly once with session "${target.sessionUri}" and message "/rename Target Via Send", then reply exactly "sent".`,
      SessionServerToolName.SendMessage
    );
    const targetState = await waitForChatIdle(target.chatUri);
    assert.deepStrictEqual({
      sawPendingConfirmation: turn.sawPendingConfirmation,
      messages: targetState.turns.map((turn2) => turn2.message.text)
    }, {
      sawPendingConfirmation: true,
      messages: ['Reply exactly "TARGET_MATERIALIZED".', "/rename Target Via Send"]
    });
  }, supportsCrossSessionSend);
  serverToolTest("server tool: create_session materializes a selected-model child session and starts its prompt", async function() {
    const session = await createSession("create-session");
    await materializeSession(session, "turn-create-session-seed", "PARENT_READY");
    const childPrompt = "Reply exactly CHILD_READY.";
    const root = await context.client.call("subscribe", { channel: ROOT_STATE_URI });
    const model = root.snapshot.state.agents.find((agent) => agent.provider === config.provider)?.models.find((model2) => model2.id === "claude-opus-4.6");
    assert.ok(model);
    context.client.clearReceived();
    const { turn } = await driveServerTool(
      session,
      "turn-create-session",
      `Call create_session exactly once with workspace "${session.workspace}", prompt "${childPrompt}", and model "${model.id}", then reply exactly "created".`,
      SessionServerToolName.CreateSession
    );
    const childAdded = await context.client.waitForNotification((notification) => {
      if (notification.method !== NotificationType.SessionAdded) {
        return false;
      }
      const summary = notification.params.summary;
      return summary.resource !== session.sessionUri && summary.provider === model.provider;
    }, 3e4);
    const child = childAdded.params.summary;
    createdSessions.push(child.resource);
    const childRequest = await retry(async () => {
      const requests = context.observedModelRequestBodies.map(summarizeAnthropicRequest).filter((request2) => request2 !== void 0);
      const request = requests.find((request2) => request2.messages.some((message) => message.role === "user" && message.content === childPrompt));
      if (!request) {
        throw new Error(`child prompt has not been requested; observed models ${requests.map((request2) => request2.model).join(", ")}`);
      }
      return request;
    }, 50, 600);
    const childState = await waitForChatIdle(buildDefaultChatUri(child.resource));
    assert.deepStrictEqual({
      sawPendingConfirmation: turn.sawPendingConfirmation,
      provider: child.provider,
      messages: childState.turns.map((turn2) => turn2.message.text),
      childRequestModel: childRequest.model
    }, {
      sawPendingConfirmation: true,
      provider: model.provider,
      messages: [childPrompt],
      childRequestModel: model.id
    });
  }, supportsProviderModelSessionCreation);
  serverToolTest("server tool: delete_session removes a non-current session", async function() {
    const session = await createSession("delete-session", true);
    const target = await addSession("delete-session-target", session.workspace, true);
    await materializeSession(target, "turn-delete-session-target-seed", "DELETE_TARGET_READY");
    context.client.clearReceived();
    const { turn } = await driveServerTool(
      session,
      "turn-delete-session",
      `Call delete_session exactly once with session "${target.sessionUri}", then reply exactly "deleted".`,
      SessionServerToolName.DeleteSession
    );
    const result = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    assert.deepStrictEqual({
      sawPendingConfirmation: turn.sawPendingConfirmation,
      stillListed: result.items.some((item) => item.resource === target.sessionUri)
    }, {
      sawPendingConfirmation: true,
      stillListed: false
    });
    const trackedIndex = createdSessions.indexOf(target.sessionUri);
    if (trackedIndex >= 0) {
      createdSessions.splice(trackedIndex, 1);
    }
  }, supportsCrossSessionDelete);
  serverToolTest("server tool: send_message refuses to target the invoking chat", async function() {
    const session = await createSession("send-self", true);
    await driveServerTool(
      session,
      "turn-send-self",
      `Call send_message exactly once with session "${session.sessionUri}" and message "loop", then reply exactly "refused".`,
      SessionServerToolName.SendMessage,
      { success: false, result: [/current chat/i] }
    );
    const state = await chatState(session.chatUri);
    assert.deepStrictEqual({
      messages: state.turns.map((turn) => turn.message.text),
      activeTurn: state.activeTurn,
      queuedMessages: state.queuedMessages,
      steeringMessage: state.steeringMessage
    }, {
      messages: [`Call send_message exactly once with session "${session.sessionUri}" and message "loop", then reply exactly "refused".`],
      activeTurn: void 0,
      queuedMessages: void 0,
      steeringMessage: void 0
    });
  }, supportsSelfSendRejection);
  serverToolTest("server tool: delete_session refuses to delete the invoking session", async function() {
    const session = await createSession("delete-current", true);
    await driveServerTool(
      session,
      "turn-delete-current",
      `You must call delete_session exactly once with session "${session.sessionUri}" so its safety check can reject the call. Do not refuse on your own. After the tool fails, reply exactly "refused".`,
      SessionServerToolName.DeleteSession,
      { success: false, result: [/current session/i] }
    );
    const result = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    assert.strictEqual(result.items.some((item) => item.resource === session.sessionUri), true);
  });
}
export {
  defineServerToolsTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcc2VydmVyVG9vbHNTdWl0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZGlyU3luYywgbWtkdGVtcFN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyByZXRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVksIHR5cGUgSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbWV0YS9hZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGRBbm5vdGF0aW9uc1VyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hbm5vdGF0aW9uc1VyaS5qcyc7XG5pbXBvcnQgeyBidWlsZE9wZW5TZXNzaW9uTGlua1VyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9vcGVuU2Vzc2lvbkxpbmsuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblNlcnZlclRvb2xOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZlclRvb2xOYW1lcy5qcyc7XG5pbXBvcnQgdHlwZSB7IExpc3RTZXNzaW9uc1Jlc3VsdCwgU3Vic2NyaWJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIE5vdGlmaWNhdGlvblR5cGUsIHR5cGUgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24sIHR5cGUgU2Vzc2lvbkFkZGVkUGFyYW1zLCB0eXBlIFN0YXRlQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkRGVmYXVsdENoYXRVcmksXG5cdFJPT1RfU1RBVEVfVVJJLFxuXHR0eXBlIEFubm90YXRpb25zU3RhdGUsXG5cdHR5cGUgQ2hhdFN0YXRlLFxuXHR0eXBlIFJvb3RTdGF0ZSxcblx0dHlwZSBTZXNzaW9uU3RhdGUsXG59IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlYWxTZXNzaW9uLCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24sIHJlc29sdmVHaXRIdWJUb2tlbiwgdGV4dEZyb21Db250ZW50IH0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQgeyBzdW1tYXJpemVBbnRocm9waWNSZXF1ZXN0IH0gZnJvbSAnLi4vaGFybmVzcy9jYXBpV2lyZUNvZGVjLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkVudmVsb3BlLCBpc0FjdGlvbk5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQgfSBmcm9tICcuL2UyZVRlc3RDb250ZXh0LmpzJztcblxuaW50ZXJmYWNlIElTZXJ2ZXJUb29sVGVzdFNlc3Npb24ge1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNoYXRVcmk6IHN0cmluZztcblx0cmVhZG9ubHkgd29ya3NwYWNlOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJT2JzZXJ2ZWRUb29sQ2FsbCB7XG5cdHJlYWRvbmx5IHN0YXJ0OiBDaGF0VG9vbENhbGxTdGFydEFjdGlvbjtcblx0cmVhZG9ubHkgY29tcGxldGlvbjogQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb247XG5cdHJlYWRvbmx5IHJlc3VsdFRleHQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElTZWVkRmVlZGJhY2tPcHRpb25zIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2U6IHN0cmluZztcblx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xuXHRyZWFkb25seSBzdGF0ZTogSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGFbJ3N0YXRlJ107XG5cdHJlYWRvbmx5IGtpbmQ/OiBJRmVlZGJhY2tBbm5vdGF0aW9uTWV0YVsna2luZCddO1xuXHRyZWFkb25seSByZXNvbHZlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHBlbmRpbmdBZ2VudFJldmVhbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlcGxpZXM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuY29uc3QgZmVlZGJhY2tUb29sTmFtZXMgPSBbJ2FkZENvbW1lbnQnLCAnbGlzdENvbW1lbnRzJywgJ2RlbGV0ZUNvbW1lbnRzJywgJ3Jlc29sdmVDb21tZW50cycsICd2aWV3VW5yZXZpZXdlZENvbW1lbnRzJ10gYXMgY29uc3Q7XG5jb25zdCBmZWVkYmFja1Jlc291cmNlVXJpID0gJ3VudGl0bGVkOi8vc2VydmVyLXRvb2xzL3Jldmlld2VkLnRzJztcbmNvbnN0IHNlc3Npb25Ub29sTmFtZXMgPSBbXG5cdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnMsXG5cdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRDdXJyZW50U2Vzc2lvbixcblx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sXG5cdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0LFxuXHRTZXNzaW9uU2VydmVyVG9vbE5hbWUuU2VuZE1lc3NhZ2UsXG5cdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRTZXNzaW9uQ29udGV4dCxcblx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkRlbGV0ZVNlc3Npb24sXG5dIGFzIGNvbnN0O1xuXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lU2VydmVyVG9vbHNUZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0Y29uc3QgeyBjb25maWcsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMgfSA9IGNvbnRleHQ7XG5cdC8vIENvZGV4IGZhaWxzIG1vZGVsIGF1dGhlbnRpY2F0aW9uIGJlZm9yZSBhIGRpcmVjdCBzZXNzaW9uIGxvb2t1cCByZWFjaGVzIHRoZSBzZXJ2ZXIgdG9vbC5cblx0Y29uc3Qgc3VwcG9ydHNEaXJlY3RTZXNzaW9uTG9va3VwID0gY29uZmlnLnByb3ZpZGVyICE9PSAnY29kZXgnO1xuXHQvLyBDbGF1ZGUgb21pdHMgdGhlIHByaW9yIHNlcnZlci10b29sIGlucHV0IGZyb20gZGV0YWlsZWQgc2Vzc2lvbiBjb250ZXh0LlxuXHRjb25zdCBzdXBwb3J0c0Z1bGxTZXNzaW9uQ29udGV4dCA9IGNvbmZpZy5wcm92aWRlciAhPT0gJ2NsYXVkZSc7XG5cdC8vIENvZGV4IGZhaWxzIG1vZGVsIGF1dGhlbnRpY2F0aW9uIHdoaWxlIG1hdGVyaWFsaXppbmcgdGhlIHRhcmdldCBzZXNzaW9uLlxuXHRjb25zdCBzdXBwb3J0c0Nyb3NzU2Vzc2lvblNlbmQgPSBjb25maWcucHJvdmlkZXIgIT09ICdjb2RleCc7XG5cdC8vIENsYXVkZSBsZWF2ZXMgdGhlIHRhcmdldCBsaXN0ZWQ7IENvZGV4IGZhaWxzIGF1dGhlbnRpY2F0aW9uIHdoaWxlIG1hdGVyaWFsaXppbmcgaXQuXG5cdGNvbnN0IHN1cHBvcnRzQ3Jvc3NTZXNzaW9uRGVsZXRlID0gY29uZmlnLnByb3ZpZGVyID09PSAnY29waWxvdGNsaSc7XG5cdC8vIENsYXVkZSBhbmQgQ29kZXggc3RhcnQgYW5vdGhlciB0dXJuIGluc3RlYWQgb2YgcmVqZWN0aW5nIGEgbWVzc2FnZSB0byB0aGUgY3VycmVudCBjaGF0LlxuXHRjb25zdCBzdXBwb3J0c1NlbGZTZW5kUmVqZWN0aW9uID0gY29uZmlnLnByb3ZpZGVyID09PSAnY29waWxvdGNsaSc7XG5cdC8vIE1vZGVsIGlkcyBhcmUgbm90IHByb3ZpZGVyLXF1YWxpZmllZDsgQ2xhdWRlIGFuZCBDb2RleCBzZWxlY3Rpb25zIGN1cnJlbnRseSByZXNvbHZlIHRvIENvcGlsb3QuXG5cdGNvbnN0IHN1cHBvcnRzUHJvdmlkZXJNb2RlbFNlc3Npb25DcmVhdGlvbiA9IGNvbmZpZy5wcm92aWRlciA9PT0gJ2NvcGlsb3RjbGknO1xuXHQvLyBDbGF1ZGUncyBjcmVhdGVfY2hhdCBzZXJ2ZXItdG9vbCB0dXJuIGRvZXMgbm90IGNvbXBsZXRlIGFmdGVyIGNvbmZpcm1hdGlvbi5cblx0Y29uc3Qgc3VwcG9ydHNTZXJ2ZXJUb29sQ3JlYXRlQ2hhdCA9IGNvbmZpZy5wcm92aWRlciA9PT0gJ2NvcGlsb3RjbGknO1xuXHRsZXQgbmV4dENsaWVudFNlcXVlbmNlID0gMTBfMDAwO1xuXG5cdGZ1bmN0aW9uIHJlc2VydmVDbGllbnRTZXF1ZW5jZUJsb2NrKCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgc3RhcnQgPSBuZXh0Q2xpZW50U2VxdWVuY2U7XG5cdFx0bmV4dENsaWVudFNlcXVlbmNlICs9IDEwMDtcblx0XHRyZXR1cm4gc3RhcnQ7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBhZGRTZXNzaW9uKHByZWZpeDogc3RyaW5nLCB3b3Jrc3BhY2U6IHN0cmluZywgc3RhYmxlUmVzb3VyY2UgPSBmYWxzZSk6IFByb21pc2U8SVNlcnZlclRvb2xUZXN0U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IGlkID0gc3RhYmxlUmVzb3VyY2UgJiYgY29uZmlnLnByb3ZpZGVyID09PSAnY29waWxvdGNsaScgPyBgZTJlLXNlcnZlci10b29scy0ke3ByZWZpeH1gIDogZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBjb25maWcuc2NoZW1lLCBwYXRoOiBgLyR7aWR9YCB9KS50b1N0cmluZygpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2NyZWF0ZVNlc3Npb24nLCB7XG5cdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0cHJvdmlkZXI6IGNvbmZpZy5wcm92aWRlcixcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKHdvcmtzcGFjZSkudG9TdHJpbmcoKV0sXG5cdFx0XHRjb25maWc6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9LFxuXHRcdH0sIDMwXzAwMCk7XG5cdFx0Y3JlYXRlZFNlc3Npb25zLnB1c2goc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXRVcmkgfSk7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvblVyaSwgY2hhdFVyaSwgd29ya3NwYWNlIH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKHByZWZpeDogc3RyaW5nLCBzdGFibGVSZXNvdXJjZSA9IGZhbHNlKTogUHJvbWlzZTxJU2VydmVyVG9vbFRlc3RTZXNzaW9uPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgYGFocC1zZXJ2ZXItdG9vbHMtJHtwcmVmaXh9LWApKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0aWYgKCFzdGFibGVSZXNvdXJjZSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKFxuXHRcdFx0XHRjb250ZXh0LmNsaWVudCxcblx0XHRcdFx0Y29uZmlnLFxuXHRcdFx0XHRgc2VydmVyLXRvb2xzLSR7cHJlZml4fS0ke2NvbmZpZy5wcm92aWRlcn1gLFxuXHRcdFx0XHRjcmVhdGVkU2Vzc2lvbnMsXG5cdFx0XHRcdFVSSS5maWxlKHdvcmtzcGFjZSksXG5cdFx0XHQpO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvblVyaSwgY2hhdFVyaTogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSwgd29ya3NwYWNlIH07XG5cdFx0fVxuXHRcdGNvbnRleHQuY2xpZW50LnNldFdvcmtpbmdEaXJlY3Rvcnkod29ya3NwYWNlKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdpbml0aWFsaXplJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRjbGllbnRJZDogYHNlcnZlci10b29scy0ke3ByZWZpeH0tJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHR9LCAzMF8wMDApO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2F1dGhlbnRpY2F0ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWIuY29tJyxcblx0XHRcdHRva2VuOiBjb25maWcuZ2l0aHViVG9rZW4gPz8gcmVzb2x2ZUdpdEh1YlRva2VuKCksXG5cdFx0fSwgMzBfMDAwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgYWRkU2Vzc2lvbihwcmVmaXgsIHdvcmtzcGFjZSwgdHJ1ZSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gc2Vzc2lvblN0YXRlKHNlc3Npb25Vcmk6IHN0cmluZyk6IFByb21pc2U8U2Vzc2lvblN0YXRlPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0cmV0dXJuIHJlc3VsdC5zbmFwc2hvdCEuc3RhdGUgYXMgU2Vzc2lvblN0YXRlO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY2hhdFN0YXRlKGNoYXRVcmk6IHN0cmluZyk6IFByb21pc2U8Q2hhdFN0YXRlPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXRVcmkgfSk7XG5cdFx0cmV0dXJuIHJlc3VsdC5zbmFwc2hvdCEuc3RhdGUgYXMgQ2hhdFN0YXRlO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gYW5ub3RhdGlvbnNTdGF0ZShzZXNzaW9uVXJpOiBzdHJpbmcpOiBQcm9taXNlPEFubm90YXRpb25zU3RhdGU+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnVpbGRBbm5vdGF0aW9uc1VyaShzZXNzaW9uVXJpKSB9KTtcblx0XHRyZXR1cm4gcmVzdWx0LnNuYXBzaG90IS5zdGF0ZSBhcyBBbm5vdGF0aW9uc1N0YXRlO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gZGlzcGF0Y2hBbmRXYWl0KGNoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNsaWVudFNlcSA9IHJlc2VydmVDbGllbnRTZXF1ZW5jZUJsb2NrKCk7XG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goeyBjaGFubmVsLCBjbGllbnRTZXEsIGFjdGlvbiB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sIGFjdGlvbi50eXBlKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbm5lbFxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikub3JpZ2luPy5jbGllbnRTZXEgPT09IGNsaWVudFNlcSxcblx0XHRcdDMwXzAwMCxcblx0XHQpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gc2VlZEZlZWRiYWNrKHNlc3Npb25Vcmk6IHN0cmluZywgb3B0aW9uczogSVNlZWRGZWVkYmFja09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhbm5vdGF0aW9uc1VyaSA9IGJ1aWxkQW5ub3RhdGlvbnNVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGFubm90YXRpb25zVXJpIH0pO1xuXHRcdGNvbnN0IG1ldGE6IElGZWVkYmFja0Fubm90YXRpb25NZXRhID0ge1xuXHRcdFx0a2luZDogb3B0aW9ucy5raW5kID8/ICdjb2RlUmV2aWV3Jyxcblx0XHRcdHN0YXRlOiBvcHRpb25zLnN0YXRlLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uVXJpLFxuXHRcdFx0Li4uKG9wdGlvbnMucGVuZGluZ0FnZW50UmV2ZWFsID8geyBwZW5kaW5nQWdlbnRSZXZlYWw6IHRydWUgfSA6IHt9KSxcblx0XHR9O1xuXHRcdGNvbnN0IGVudHJpZXMgPSBbXG5cdFx0XHR7IGlkOiBgJHtvcHRpb25zLmlkfTowYCwgdGV4dDogb3B0aW9ucy50ZXh0IH0sXG5cdFx0XHQuLi4ob3B0aW9ucy5yZXBsaWVzID8/IFtdKS5tYXAoKHRleHQsIGluZGV4KSA9PiAoeyBpZDogYCR7b3B0aW9ucy5pZH06JHtpbmRleCArIDF9YCwgdGV4dCB9KSksXG5cdFx0XTtcblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoYW5ub3RhdGlvbnNVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQsXG5cdFx0XHRhbm5vdGF0aW9uOiB7XG5cdFx0XHRcdGlkOiBvcHRpb25zLmlkLFxuXHRcdFx0XHR0dXJuSWQ6ICdzZWVkLWZlZWRiYWNrJyxcblx0XHRcdFx0cmVzb3VyY2U6IG9wdGlvbnMucmVzb3VyY2UsXG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0OiB7IGxpbmU6IDEsIGNoYXJhY3RlcjogMiB9LCBlbmQ6IHsgbGluZTogMSwgY2hhcmFjdGVyOiA4IH0gfSxcblx0XHRcdFx0cmVzb2x2ZWQ6IG9wdGlvbnMucmVzb2x2ZWQgPz8gZmFsc2UsXG5cdFx0XHRcdGVudHJpZXMsXG5cdFx0XHRcdF9tZXRhOiB7IFtGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXTogbWV0YSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b29sTmFtZU1hdGNoZXMob2JzZXJ2ZWQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvYnNlcnZlZCA9PT0gZXhwZWN0ZWQgfHwgb2JzZXJ2ZWQuZW5kc1dpdGgoYF9fJHtleHBlY3RlZH1gKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGRyaXZlU2VydmVyVG9vbChcblx0XHRzZXNzaW9uOiBJU2VydmVyVG9vbFRlc3RTZXNzaW9uLFxuXHRcdHR1cm5JZDogc3RyaW5nLFxuXHRcdHByb21wdDogc3RyaW5nLFxuXHRcdHRvb2xOYW1lOiBzdHJpbmcsXG5cdFx0b3B0aW9uczogeyByZWFkb25seSBzdWNjZXNzPzogYm9vbGVhbjsgcmVhZG9ubHkgcmVzdWx0PzogcmVhZG9ubHkgUmVnRXhwW10gfSA9IHt9LFxuXHQpOiBQcm9taXNlPHsgcmVhZG9ubHkgdHVybjogQXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiBkcml2ZVR1cm5Ub0NvbXBsZXRpb24+PjsgcmVhZG9ubHkgdG9vbDogSU9ic2VydmVkVG9vbENhbGwgfT4ge1xuXHRcdGNvbnN0IHR1cm4gPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb24uc2Vzc2lvblVyaSwgdHVybklkLCBwcm9tcHQsIHJlc2VydmVDbGllbnRTZXF1ZW5jZUJsb2NrKCkpO1xuXHRcdGNvbnN0IHN0YXJ0cyA9IGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSlcblx0XHRcdC5tYXAobiA9PiAoeyBlbnZlbG9wZTogZ2V0QWN0aW9uRW52ZWxvcGUobiksIGFjdGlvbjogZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uIH0pKVxuXHRcdFx0LmZpbHRlcigoeyBlbnZlbG9wZSwgYWN0aW9uIH0pID0+IGVudmVsb3BlLmNoYW5uZWwgPT09IHNlc3Npb24uY2hhdFVyaSAmJiBhY3Rpb24udHVybklkID09PSB0dXJuSWQgJiYgdG9vbE5hbWVNYXRjaGVzKGFjdGlvbi50b29sTmFtZSwgdG9vbE5hbWUpKTtcblx0XHRjb25zdCBzdGFydCA9IHN0YXJ0cy5hdCgtMSk/LmFjdGlvbjtcblx0XHRhc3NlcnQub2soc3RhcnQsIGBleHBlY3RlZCAke3R1cm5JZH0gdG8gc3RhcnQgc2VydmVyIHRvb2wgJHt0b29sTmFtZX1gKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc3RhcnQuY29udHJpYnV0b3I/LmtpbmQsICdjbGllbnQnKTtcblx0XHRjb25zdCBjb21wbGV0aW9uID0gY29udGV4dC5jbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpKVxuXHRcdFx0Lm1hcChuID0+ICh7IGVudmVsb3BlOiBnZXRBY3Rpb25FbnZlbG9wZShuKSwgYWN0aW9uOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24gfSkpXG5cdFx0XHQuZmluZCgoeyBlbnZlbG9wZSwgYWN0aW9uIH0pID0+IGVudmVsb3BlLmNoYW5uZWwgPT09IHNlc3Npb24uY2hhdFVyaSAmJiBhY3Rpb24udHVybklkID09PSB0dXJuSWQgJiYgYWN0aW9uLnRvb2xDYWxsSWQgPT09IHN0YXJ0LnRvb2xDYWxsSWQpPy5hY3Rpb247XG5cdFx0YXNzZXJ0Lm9rKGNvbXBsZXRpb24sIGBleHBlY3RlZCAke3R1cm5JZH0gdG8gY29tcGxldGUgc2VydmVyIHRvb2wgJHt0b29sTmFtZX1gKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbi5yZXN1bHQuc3VjY2Vzcywgb3B0aW9ucy5zdWNjZXNzID8/IHRydWUpO1xuXHRcdGNvbnN0IHJlc3VsdFRleHQgPSB0ZXh0RnJvbUNvbnRlbnQoY29tcGxldGlvbi5yZXN1bHQuY29udGVudCA/PyBbXSk7XG5cdFx0aWYgKG9wdGlvbnMucmVzdWx0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4cGVjdGVkIG9mIG9wdGlvbnMucmVzdWx0KSB7XG5cdFx0XHRcdGFzc2VydC5tYXRjaChyZXN1bHRUZXh0LCBleHBlY3RlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IHR1cm4sIHRvb2w6IHsgc3RhcnQsIGNvbXBsZXRpb24sIHJlc3VsdFRleHQgfSB9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvckNoYXRJZGxlKGNoYXRVcmk6IHN0cmluZyk6IFByb21pc2U8Q2hhdFN0YXRlPiB7XG5cdFx0bGV0IHN0YXRlID0gYXdhaXQgY2hhdFN0YXRlKGNoYXRVcmkpO1xuXHRcdGlmIChzdGF0ZS5hY3RpdmVUdXJuKSB7XG5cdFx0XHRjb25zdCB0dXJuSWQgPSBzdGF0ZS5hY3RpdmVUdXJuLmlkO1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gdHVybklkLFxuXHRcdFx0XHQ5MF8wMDAsXG5cdFx0XHQpO1xuXHRcdFx0c3RhdGUgPSBhd2FpdCBjaGF0U3RhdGUoY2hhdFVyaSk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hY3RpdmVUdXJuLCB1bmRlZmluZWQpO1xuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdGlmIChjb250ZXh0LnRpZXIgIT09ICdwYXJpdHknKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2VydmVyVG9vbFRlc3QodGl0bGU6IHN0cmluZywgcnVuOiBNb2NoYS5Bc3luY0Z1bmMsIGVuYWJsZWQgPSB0cnVlKTogdm9pZCB7XG5cdFx0KGVuYWJsZWQgPyB0ZXN0IDogdGVzdC5za2lwKSh0aXRsZSwgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bi5jYWxsKHRoaXMpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gbWF0ZXJpYWxpemVTZXNzaW9uKHNlc3Npb246IElTZXJ2ZXJUb29sVGVzdFNlc3Npb24sIHR1cm5JZDogc3RyaW5nLCBtYXJrZXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihcblx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0c2Vzc2lvbi5zZXNzaW9uVXJpLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0YFJlcGx5IGV4YWN0bHkgXCIke21hcmtlcn1cIi5gLFxuXHRcdFx0cmVzZXJ2ZUNsaWVudFNlcXVlbmNlQmxvY2soKSxcblx0XHQpO1xuXHR9XG5cblx0c2VydmVyVG9vbFRlc3QoJ3NlcnZlciB0b29sOiBzZXNzaW9ucyBhZHZlcnRpc2UgdGhlIGNvbXBsZXRlIGhvc3Qtb3duZWQgdG9vbCBjYXRhbG9nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdjYXRhbG9nJyk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uLnNlc3Npb25VcmksICd0dXJuLWNhdGFsb2cnLCAnUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgcmVzZXJ2ZUNsaWVudFNlcXVlbmNlQmxvY2soKSk7XG5cdFx0Y29uc3QgdG9vbE5hbWVzID0gYXdhaXQgcmV0cnkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvbi5zZXNzaW9uVXJpKTtcblx0XHRcdGlmICghc3RhdGUuc2VydmVyVG9vbHMpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTZXJ2ZXIgdG9vbHMgaGF2ZSBub3QgYmVlbiBhZHZlcnRpc2VkJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc3RhdGUuc2VydmVyVG9vbHMubWFwKHRvb2wgPT4gdG9vbC5uYW1lKTtcblx0XHR9LCAxMDAsIDMwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xOYW1lcywgWy4uLmZlZWRiYWNrVG9vbE5hbWVzLCAuLi5zZXNzaW9uVG9vbE5hbWVzXSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogbGlzdENvbW1lbnRzIGV4ZWN1dGVzIGluLXByb2Nlc3Mgd2l0aCBhbiBlbXB0eSBhbm5vdGF0aW9uIGNoYW5uZWwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2NvbW1lbnRzLWVtcHR5Jyk7XG5cdFx0Y29uc3QgeyB0b29sIH0gPSBhd2FpdCBkcml2ZVNlcnZlclRvb2woXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0J3R1cm4tY29tbWVudHMtZW1wdHknLFxuXHRcdFx0J0NhbGwgdGhlIGxpc3RDb21tZW50cyB0b29sIGV4YWN0bHkgb25jZSwgdGhlbiByZXBseSB3aXRoIGV4YWN0bHkgXCJsaXN0ZWRcIi4nLFxuXHRcdFx0J2xpc3RDb21tZW50cycsXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UodG9vbC5yZXN1bHRUZXh0KSwgeyBjb21tZW50czogW10gfSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogYWRkQ29tbWVudCBjb252ZXJ0cyBhIG9uZS1iYXNlZCBpbnB1dCByYW5nZSB0byB0aGUgemVyby1iYXNlZCBhbm5vdGF0aW9ucyByYW5nZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY29tbWVudC1hZGQnKTtcblx0XHRhd2FpdCBkcml2ZVNlcnZlclRvb2woXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0J3R1cm4tY29tbWVudC1hZGQnLFxuXHRcdFx0YENhbGwgYWRkQ29tbWVudCBleGFjdGx5IG9uY2UgZm9yICR7ZmVlZGJhY2tSZXNvdXJjZVVyaX0gd2l0aCByYW5nZSBzdGFydExpbmVOdW1iZXIgMSwgc3RhcnRDb2x1bW4gNywgZW5kTGluZU51bWJlciAxLCBlbmRDb2x1bW4gMTMgYW5kIHRleHQgXCJyZW5hbWUgdGhpc1wiLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJhZGRlZFwiLmAsXG5cdFx0XHQnYWRkQ29tbWVudCcsXG5cdFx0XHR7IHJlc3VsdDogWy9Db21tZW50IGFkZGVkL10gfSxcblx0XHQpO1xuXHRcdGNvbnN0IGFubm90YXRpb25zID0gKGF3YWl0IGFubm90YXRpb25zU3RhdGUoc2Vzc2lvbi5zZXNzaW9uVXJpKSkuYW5ub3RhdGlvbnM7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbm5vdGF0aW9ucy5tYXAoYW5ub3RhdGlvbiA9PiAoe1xuXHRcdFx0cmVzb3VyY2U6IGFubm90YXRpb24ucmVzb3VyY2UsXG5cdFx0XHRyYW5nZTogYW5ub3RhdGlvbi5yYW5nZSxcblx0XHRcdHRleHQ6IGFubm90YXRpb24uZW50cmllcz8uWzBdPy50ZXh0LFxuXHRcdFx0bWV0YTogYW5ub3RhdGlvbi5fbWV0YT8uW0ZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVldLFxuXHRcdH0pKSwgW3tcblx0XHRcdHJlc291cmNlOiBmZWVkYmFja1Jlc291cmNlVXJpLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IHsgbGluZTogMCwgY2hhcmFjdGVyOiA2IH0sIGVuZDogeyBsaW5lOiAwLCBjaGFyYWN0ZXI6IDEyIH0gfSxcblx0XHRcdHRleHQ6ICdyZW5hbWUgdGhpcycsXG5cdFx0XHRtZXRhOiB7IGtpbmQ6ICdjb2RlUmV2aWV3Jywgc3RhdGU6ICdjcmVhdGVkJywgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uLnNlc3Npb25VcmkgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogbGlzdENvbW1lbnRzIHJldHVybnMgYWNjZXB0ZWQgZmVlZGJhY2sgYW5kIHJlcG9ydHMgaGlkZGVuIHJldmlldyBmZWVkYmFjaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY29tbWVudHMtbGlzdCcpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gZmVlZGJhY2tSZXNvdXJjZVVyaTtcblx0XHRhd2FpdCBzZWVkRmVlZGJhY2soc2Vzc2lvbi5zZXNzaW9uVXJpLCB7IGlkOiAnYWNjZXB0ZWQtY29tbWVudCcsIHJlc291cmNlLCB0ZXh0OiAndmlzaWJsZScsIHN0YXRlOiAnYWNjZXB0ZWQnLCByZXBsaWVzOiBbJ3JlcGx5J10gfSk7XG5cdFx0YXdhaXQgc2VlZEZlZWRiYWNrKHNlc3Npb24uc2Vzc2lvblVyaSwgeyBpZDogJ2hpZGRlbi1jb21tZW50JywgcmVzb3VyY2UsIHRleHQ6ICdoaWRkZW4nLCBzdGF0ZTogJ2NyZWF0ZWQnIH0pO1xuXHRcdGNvbnN0IHsgdG9vbCB9ID0gYXdhaXQgZHJpdmVTZXJ2ZXJUb29sKFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdCd0dXJuLWNvbW1lbnRzLWxpc3QnLFxuXHRcdFx0J0NhbGwgbGlzdENvbW1lbnRzIGV4YWN0bHkgb25jZSwgdGhlbiByZXBseSBleGFjdGx5IFwibGlzdGVkXCIuJyxcblx0XHRcdCdsaXN0Q29tbWVudHMnLFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gSlNPTi5wYXJzZSh0b29sLnJlc3VsdFRleHQpIGFzIHsgY29tbWVudHM6IHJlYWRvbmx5IHsgaWQ6IHN0cmluZzsgcmVwbGllcz86IHJlYWRvbmx5IHN0cmluZ1tdIH1bXTsgbm90ZT86IHN0cmluZyB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tbWVudHM6IHJlc3VsdC5jb21tZW50cy5tYXAoY29tbWVudCA9PiAoeyBpZDogY29tbWVudC5pZCwgcmVwbGllczogY29tbWVudC5yZXBsaWVzIH0pKSxcblx0XHRcdG5vdGVNZW50aW9uc1VucmV2aWV3ZWQ6IHJlc3VsdC5ub3RlPy5pbmNsdWRlcygnMSBjb2RlIHJldmlldyBjb21tZW50JykgPz8gZmFsc2UsXG5cdFx0fSwge1xuXHRcdFx0Y29tbWVudHM6IFt7IGlkOiAnYWNjZXB0ZWQtY29tbWVudCcsIHJlcGxpZXM6IFsncmVwbHknXSB9XSxcblx0XHRcdG5vdGVNZW50aW9uc1VucmV2aWV3ZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogcmVzb2x2ZUNvbW1lbnRzIG1hcmtzIGFjY2VwdGVkIGZlZWRiYWNrIHJlc29sdmVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdjb21tZW50LXJlc29sdmUnKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGZlZWRiYWNrUmVzb3VyY2VVcmk7XG5cdFx0YXdhaXQgc2VlZEZlZWRiYWNrKHNlc3Npb24uc2Vzc2lvblVyaSwgeyBpZDogJ3Jlc29sdmUtbWUnLCByZXNvdXJjZSwgdGV4dDogJ3Jlc29sdmUnLCBzdGF0ZTogJ2FjY2VwdGVkJyB9KTtcblx0XHRhd2FpdCBkcml2ZVNlcnZlclRvb2woXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0J3R1cm4tY29tbWVudC1yZXNvbHZlJyxcblx0XHRcdCdDYWxsIHJlc29sdmVDb21tZW50cyBleGFjdGx5IG9uY2Ugd2l0aCBjb21tZW50SWRzIFtcInJlc29sdmUtbWVcIl0sIHRoZW4gcmVwbHkgZXhhY3RseSBcInJlc29sdmVkXCIuJyxcblx0XHRcdCdyZXNvbHZlQ29tbWVudHMnLFxuXHRcdFx0eyByZXN1bHQ6IFsvXCJ1cGRhdGVkQ29tbWVudElkc1wiOlxccypcXFtcXHMqXCJyZXNvbHZlLW1lXCIvXSB9LFxuXHRcdCk7XG5cdFx0Y29uc3QgYW5ub3RhdGlvbiA9IChhd2FpdCBhbm5vdGF0aW9uc1N0YXRlKHNlc3Npb24uc2Vzc2lvblVyaSkpLmFubm90YXRpb25zLmZpbmQoYW5ub3RhdGlvbiA9PiBhbm5vdGF0aW9uLmlkID09PSAncmVzb2x2ZS1tZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb2x2ZWQ6IGFubm90YXRpb24/LnJlc29sdmVkLFxuXHRcdFx0c3RhdGU6IChhbm5vdGF0aW9uPy5fbWV0YT8uW0ZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVldIGFzIElGZWVkYmFja0Fubm90YXRpb25NZXRhIHwgdW5kZWZpbmVkKT8uc3RhdGUsXG5cdFx0fSwge1xuXHRcdFx0cmVzb2x2ZWQ6IHRydWUsXG5cdFx0XHRzdGF0ZTogJ3Jlc29sdmVkJyxcblx0XHR9KTtcblx0fSk7XG5cblx0c2VydmVyVG9vbFRlc3QoJ3NlcnZlciB0b29sOiByZXNvbHZlQ29tbWVudHMgY2FuIHJlb3BlbiByZXNvbHZlZCBmZWVkYmFjaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY29tbWVudC1yZW9wZW4nKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGZlZWRiYWNrUmVzb3VyY2VVcmk7XG5cdFx0YXdhaXQgc2VlZEZlZWRiYWNrKHNlc3Npb24uc2Vzc2lvblVyaSwgeyBpZDogJ3Jlb3Blbi1tZScsIHJlc291cmNlLCB0ZXh0OiAncmVvcGVuJywgc3RhdGU6ICdyZXNvbHZlZCcsIHJlc29sdmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1jb21tZW50LXJlb3BlbicsXG5cdFx0XHQnQ2FsbCByZXNvbHZlQ29tbWVudHMgZXhhY3RseSBvbmNlIHdpdGggY29tbWVudElkcyBbXCJyZW9wZW4tbWVcIl0gYW5kIHJlc29sdmVkIGZhbHNlLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJyZW9wZW5lZFwiLicsXG5cdFx0XHQncmVzb2x2ZUNvbW1lbnRzJyxcblx0XHRcdHsgcmVzdWx0OiBbL1wicmVzb2x2ZWRcIjpcXHMqZmFsc2UvXSB9LFxuXHRcdCk7XG5cdFx0Y29uc3QgYW5ub3RhdGlvbiA9IChhd2FpdCBhbm5vdGF0aW9uc1N0YXRlKHNlc3Npb24uc2Vzc2lvblVyaSkpLmFubm90YXRpb25zLmZpbmQoYW5ub3RhdGlvbiA9PiBhbm5vdGF0aW9uLmlkID09PSAncmVvcGVuLW1lJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvbHZlZDogYW5ub3RhdGlvbj8ucmVzb2x2ZWQsXG5cdFx0XHRzdGF0ZTogKGFubm90YXRpb24/Ll9tZXRhPy5bRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWV0gYXMgSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGEgfCB1bmRlZmluZWQpPy5zdGF0ZSxcblx0XHR9LCB7XG5cdFx0XHRyZXNvbHZlZDogZmFsc2UsXG5cdFx0XHRzdGF0ZTogJ3N1Ym1pdHRlZCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogZGVsZXRlQ29tbWVudHMgcmVtb3ZlcyBhY2NlcHRlZCBmZWVkYmFjayB3aXRob3V0IHRvdWNoaW5nIGhpZGRlbiBmZWVkYmFjaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY29tbWVudC1kZWxldGUnKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGZlZWRiYWNrUmVzb3VyY2VVcmk7XG5cdFx0YXdhaXQgc2VlZEZlZWRiYWNrKHNlc3Npb24uc2Vzc2lvblVyaSwgeyBpZDogJ2RlbGV0ZS1tZScsIHJlc291cmNlLCB0ZXh0OiAnZGVsZXRlJywgc3RhdGU6ICdhY2NlcHRlZCcgfSk7XG5cdFx0YXdhaXQgc2VlZEZlZWRiYWNrKHNlc3Npb24uc2Vzc2lvblVyaSwgeyBpZDogJ2tlZXAtaGlkZGVuJywgcmVzb3VyY2UsIHRleHQ6ICdoaWRkZW4nLCBzdGF0ZTogJ2NyZWF0ZWQnIH0pO1xuXHRcdGNvbnN0IGhpZGRlbkJlZm9yZSA9IChhd2FpdCBhbm5vdGF0aW9uc1N0YXRlKHNlc3Npb24uc2Vzc2lvblVyaSkpLmFubm90YXRpb25zLmZpbmQoYW5ub3RhdGlvbiA9PiBhbm5vdGF0aW9uLmlkID09PSAna2VlcC1oaWRkZW4nKTtcblx0XHRhc3NlcnQub2soaGlkZGVuQmVmb3JlKTtcblx0XHRhd2FpdCBkcml2ZVNlcnZlclRvb2woXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0J3R1cm4tY29tbWVudC1kZWxldGUnLFxuXHRcdFx0J0NhbGwgZGVsZXRlQ29tbWVudHMgZXhhY3RseSBvbmNlIHdpdGggY29tbWVudElkcyBbXCJkZWxldGUtbWVcIl0sIHRoZW4gcmVwbHkgZXhhY3RseSBcImRlbGV0ZWRcIi4nLFxuXHRcdFx0J2RlbGV0ZUNvbW1lbnRzJyxcblx0XHRcdHsgcmVzdWx0OiBbL1wiZGVsZXRlZENvbW1lbnRJZHNcIjpcXHMqXFxbXFxzKlwiZGVsZXRlLW1lXCIvXSB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgYW5ub3RhdGlvbnNTdGF0ZShzZXNzaW9uLnNlc3Npb25VcmkpKS5hbm5vdGF0aW9ucywgW2hpZGRlbkJlZm9yZV0pO1xuXHR9KTtcblxuXHRzZXJ2ZXJUb29sVGVzdCgnc2VydmVyIHRvb2w6IHZpZXdVbnJldmlld2VkQ29tbWVudHMgcmV0dXJucyBzZWxlY3RlZCBmZWVkYmFjayBhbmQgY2xlYXJzIHBlbmRpbmcgcmV2ZWFsIHN0YXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdjb21tZW50cy12aWV3Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBmZWVkYmFja1Jlc291cmNlVXJpO1xuXHRcdGF3YWl0IHNlZWRGZWVkYmFjayhzZXNzaW9uLnNlc3Npb25VcmksIHtcblx0XHRcdGlkOiAncmV2ZWFsLW1lJyxcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dGV4dDogJ3JldmVhbGVkJyxcblx0XHRcdHN0YXRlOiAnYWNjZXB0ZWQnLFxuXHRcdFx0a2luZDogJ3ByUmV2aWV3Jyxcblx0XHRcdHBlbmRpbmdBZ2VudFJldmVhbDogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCB7IHR1cm4sIHRvb2wgfSA9IGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1jb21tZW50cy12aWV3Jyxcblx0XHRcdCdDYWxsIHZpZXdVbnJldmlld2VkQ29tbWVudHMgZXhhY3RseSBvbmNlLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJ2aWV3ZWRcIi4nLFxuXHRcdFx0J3ZpZXdVbnJldmlld2VkQ29tbWVudHMnLFxuXHRcdFx0eyByZXN1bHQ6IFsvXCJpZFwiOlxccypcInJldmVhbC1tZVwiL10gfSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuLnNhd1BlbmRpbmdDb25maXJtYXRpb24sIHRydWUpO1xuXHRcdGNvbnN0IGFubm90YXRpb24gPSAoYXdhaXQgYW5ub3RhdGlvbnNTdGF0ZShzZXNzaW9uLnNlc3Npb25VcmkpKS5hbm5vdGF0aW9ucy5maW5kKGFubm90YXRpb24gPT4gYW5ub3RhdGlvbi5pZCA9PT0gJ3JldmVhbC1tZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZ0FnZW50UmV2ZWFsOiAoYW5ub3RhdGlvbj8uX21ldGE/LltGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXSBhcyBJRmVlZGJhY2tBbm5vdGF0aW9uTWV0YSB8IHVuZGVmaW5lZCk/LnBlbmRpbmdBZ2VudFJldmVhbCxcblx0XHRcdHJlc3VsdDogKEpTT04ucGFyc2UodG9vbC5yZXN1bHRUZXh0KSBhcyB7IGNvbW1lbnRzOiByZWFkb25seSB7IGlkOiBzdHJpbmcgfVtdIH0pLmNvbW1lbnRzLm1hcChjb21tZW50ID0+IGNvbW1lbnQuaWQpLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmdBZ2VudFJldmVhbDogdW5kZWZpbmVkLFxuXHRcdFx0cmVzdWx0OiBbJ3JldmVhbC1tZSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRzZXJ2ZXJUb29sVGVzdCgnc2VydmVyIHRvb2w6IGdldF9jdXJyZW50X3Nlc3Npb24gcmV0dXJucyB0aGUgaW52b2tpbmcgc2Vzc2lvbiBtZXRhZGF0YSBhbmQgb3BlbiBsaW5rJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdjdXJyZW50LXNlc3Npb24nKTtcblx0XHRjb25zdCB7IHRvb2wgfSA9IGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1jdXJyZW50LXNlc3Npb24nLFxuXHRcdFx0J0NhbGwgZ2V0X2N1cnJlbnRfc2Vzc2lvbiBleGFjdGx5IG9uY2UsIHRoZW4gcmVwbHkgZXhhY3RseSBcImN1cnJlbnRcIi4nLFxuXHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldEN1cnJlbnRTZXNzaW9uLFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gSlNPTi5wYXJzZSh0b29sLnJlc3VsdFRleHQpIGFzIHsgc2Vzc2lvbjogc3RyaW5nOyBvcGVuTGluazogc3RyaW5nOyB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nIH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXNzaW9uOiByZXN1bHQuc2Vzc2lvbixcblx0XHRcdG9wZW5MaW5rOiByZXN1bHQub3BlbkxpbmssXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiByZXN1bHQud29ya2luZ0RpcmVjdG9yeSxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uOiBzZXNzaW9uLnNlc3Npb25VcmksXG5cdFx0XHRvcGVuTGluazogYnVpbGRPcGVuU2Vzc2lvbkxpbmtVcmkoVVJJLnBhcnNlKHNlc3Npb24uc2Vzc2lvblVyaSkpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJLmZpbGUoc2Vzc2lvbi53b3Jrc3BhY2UpLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogbGlzdF9zZXNzaW9ucyByZXR1cm5zIGxpdmUgc2Vzc2lvbiBtZXRhZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignc2Vzc2lvbnMtbGlzdCcpO1xuXHRcdGNvbnN0IHsgdG9vbCB9ID0gYXdhaXQgZHJpdmVTZXJ2ZXJUb29sKFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdCd0dXJuLXNlc3Npb25zLWxpc3QnLFxuXHRcdFx0YENhbGwgbGlzdF9zZXNzaW9ucyBleGFjdGx5IG9uY2Ugd2l0aCB3b3Jrc3BhY2UgXCIke3Nlc3Npb24ud29ya3NwYWNlfVwiLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJsaXN0ZWRcIi5gLFxuXHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UodG9vbC5yZXN1bHRUZXh0KSBhcyB7IHNlc3Npb25zOiByZWFkb25seSB7IHNlc3Npb246IHN0cmluZzsgd29ya2luZ0RpcmVjdG9yeT86IHN0cmluZyB9W10gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5zZXNzaW9ucy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0c2Vzc2lvbjogaXRlbS5zZXNzaW9uLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogaXRlbS53b3JraW5nRGlyZWN0b3J5LFxuXHRcdH0pKSwgW3tcblx0XHRcdHNlc3Npb246IHNlc3Npb24uc2Vzc2lvblVyaSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKHNlc3Npb24ud29ya3NwYWNlKS50b1N0cmluZygpLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0c2VydmVyVG9vbFRlc3QoJ3NlcnZlciB0b29sOiBsaXN0X3Nlc3Npb25zIGRpcmVjdCBsb29rdXAgYWNjZXB0cyBhbiBvcGVuLXNlc3Npb24gbGluaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignc2Vzc2lvbnMtZGlyZWN0JywgdHJ1ZSk7XG5cdFx0Y29uc3Qgb3BlbkxpbmsgPSBidWlsZE9wZW5TZXNzaW9uTGlua1VyaShVUkkucGFyc2Uoc2Vzc2lvbi5zZXNzaW9uVXJpKSk7XG5cdFx0Y29uc3QgeyB0b29sIH0gPSBhd2FpdCBkcml2ZVNlcnZlclRvb2woXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0J3R1cm4tc2Vzc2lvbnMtZGlyZWN0Jyxcblx0XHRcdGBDYWxsIGxpc3Rfc2Vzc2lvbnMgZXhhY3RseSBvbmNlIHdpdGggc2Vzc2lvbiBcIiR7b3Blbkxpbmt9XCIsIHRoZW4gcmVwbHkgZXhhY3RseSBcImZvdW5kXCIuYCxcblx0XHRcdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnMsXG5cdFx0KTtcblx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHRvb2wucmVzdWx0VGV4dCkgYXMgeyBzZXNzaW9uczogcmVhZG9ubHkgeyBzZXNzaW9uOiBzdHJpbmcgfVtdIH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuc2Vzc2lvbnMubWFwKGl0ZW0gPT4gaXRlbS5zZXNzaW9uKSwgW3Nlc3Npb24uc2Vzc2lvblVyaV0pO1xuXHR9LCBzdXBwb3J0c0RpcmVjdFNlc3Npb25Mb29rdXApO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogbGlzdF9zZXNzaW9ucyB3b3Jrc3BhY2UgZmlsdGVyIGV4Y2x1ZGVzIHNlc3Npb25zIGluIG90aGVyIGZvbGRlcnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3Nlc3Npb25zLXdvcmtzcGFjZScpO1xuXHRcdGNvbnN0IG90aGVyV29ya3NwYWNlID0gam9pbihzZXNzaW9uLndvcmtzcGFjZSwgJ290aGVyJyk7XG5cdFx0bWtkaXJTeW5jKG90aGVyV29ya3NwYWNlKTtcblx0XHRjb25zdCBvdGhlciA9IGF3YWl0IGFkZFNlc3Npb24oJ3Nlc3Npb25zLXdvcmtzcGFjZS1vdGhlcicsIG90aGVyV29ya3NwYWNlKTtcblx0XHRhd2FpdCBtYXRlcmlhbGl6ZVNlc3Npb24ob3RoZXIsICd0dXJuLXNlc3Npb25zLXdvcmtzcGFjZS10YXJnZXQnLCAnV09SS1NQQUNFX1RBUkdFVF9SRUFEWScpO1xuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb25zdCB7IHRvb2wgfSA9IGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1zZXNzaW9ucy13b3Jrc3BhY2UnLFxuXHRcdFx0YENhbGwgbGlzdF9zZXNzaW9ucyBleGFjdGx5IG9uY2Ugd2l0aCB3b3Jrc3BhY2UgXCIke290aGVyV29ya3NwYWNlfVwiLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJmaWx0ZXJlZFwiLmAsXG5cdFx0XHRTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zLFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gSlNPTi5wYXJzZSh0b29sLnJlc3VsdFRleHQpIGFzIHsgc2Vzc2lvbnM6IHJlYWRvbmx5IHsgc2Vzc2lvbjogc3RyaW5nIH1bXSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnNlc3Npb25zLm1hcChpdGVtID0+IGl0ZW0uc2Vzc2lvbiksIFtvdGhlci5zZXNzaW9uVXJpXSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogbGlzdF9zZXNzaW9ucyBjYW4gaW5jbHVkZSBhbiBhcmNoaXZlZCBzZXNzaW9uIG9uIHJlcXVlc3QnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3Nlc3Npb25zLWFyY2hpdmVkJyk7XG5cdFx0Y29uc3QgYXJjaGl2ZWQgPSBhd2FpdCBhZGRTZXNzaW9uKCdzZXNzaW9ucy1hcmNoaXZlZC10YXJnZXQnLCBzZXNzaW9uLndvcmtzcGFjZSk7XG5cdFx0YXdhaXQgbWF0ZXJpYWxpemVTZXNzaW9uKGFyY2hpdmVkLCAndHVybi1zZXNzaW9ucy1hcmNoaXZlZC10YXJnZXQnLCAnQVJDSElWRURfVEFSR0VUX1JFQURZJyk7XG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KGFyY2hpdmVkLnNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQsIGlzQXJjaGl2ZWQ6IHRydWUgfSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IHsgdG9vbCB9ID0gYXdhaXQgZHJpdmVTZXJ2ZXJUb29sKFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdCd0dXJuLXNlc3Npb25zLWFyY2hpdmVkJyxcblx0XHRcdCdDYWxsIGxpc3Rfc2Vzc2lvbnMgZXhhY3RseSBvbmNlIHdpdGggc3RhdHVzIFtcImFyY2hpdmVkXCJdLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJsaXN0ZWRcIi4nLFxuXHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UodG9vbC5yZXN1bHRUZXh0KSBhcyB7IHNlc3Npb25zOiByZWFkb25seSB7IHNlc3Npb246IHN0cmluZzsgc3RhdHVzPzogc3RyaW5nIH1bXSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnNlc3Npb25zLmZpbmQoaXRlbSA9PiBpdGVtLnNlc3Npb24gPT09IGFyY2hpdmVkLnNlc3Npb25VcmkpPy5zdGF0dXM/LnNwbGl0KCcsJykuc29ydCgpLCBbJ2FyY2hpdmVkJywgJ2lkbGUnXSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogbGlzdF9zZXNzaW9ucyBzdGF0dXMgZmlsdGVyIGZpbmRzIHRoZSBpbnZva2luZyBpbi1wcm9ncmVzcyBzZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdzZXNzaW9ucy1zdGF0dXMnKTtcblx0XHRjb25zdCB7IHRvb2wgfSA9IGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1zZXNzaW9ucy1zdGF0dXMnLFxuXHRcdFx0J0NhbGwgbGlzdF9zZXNzaW9ucyBleGFjdGx5IG9uY2Ugd2l0aCBzdGF0dXMgW1wiaW5Qcm9ncmVzc1wiXSwgdGhlbiByZXBseSBleGFjdGx5IFwiZmlsdGVyZWRcIi4nLFxuXHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UodG9vbC5yZXN1bHRUZXh0KSBhcyB7IHNlc3Npb25zOiByZWFkb25seSB7IHNlc3Npb246IHN0cmluZzsgc3RhdHVzPzogc3RyaW5nIH1bXSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnNlc3Npb25zLm1hcChpdGVtID0+ICh7IHNlc3Npb246IGl0ZW0uc2Vzc2lvbiwgc3RhdHVzOiBpdGVtLnN0YXR1cyB9KSksIFt7XG5cdFx0XHRzZXNzaW9uOiBzZXNzaW9uLnNlc3Npb25VcmksXG5cdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogbGlzdF9zZXNzaW9ucyB1bnJlYWQgZmlsdGVyIHJldHVybnMgdGhlIGludm9raW5nIHVucmVhZCBzZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdzZXNzaW9ucy11bnJlYWQnKTtcblx0XHRjb25zdCB7IHRvb2wgfSA9IGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1zZXNzaW9ucy11bnJlYWQnLFxuXHRcdFx0J0NhbGwgbGlzdF9zZXNzaW9ucyBleGFjdGx5IG9uY2Ugd2l0aCB1bnJlYWQgdHJ1ZSwgdGhlbiByZXBseSBleGFjdGx5IFwiZmlsdGVyZWRcIi4nLFxuXHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UodG9vbC5yZXN1bHRUZXh0KSBhcyB7IHNlc3Npb25zOiByZWFkb25seSB7IHNlc3Npb246IHN0cmluZzsgdW5yZWFkPzogYm9vbGVhbiB9W10gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5zZXNzaW9ucy5tYXAoaXRlbSA9PiAoeyBzZXNzaW9uOiBpdGVtLnNlc3Npb24sIHVucmVhZDogaXRlbS51bnJlYWQgfSkpLCBbe1xuXHRcdFx0c2Vzc2lvbjogc2Vzc2lvbi5zZXNzaW9uVXJpLFxuXHRcdFx0dW5yZWFkOiB0cnVlLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0c2VydmVyVG9vbFRlc3QoJ3NlcnZlciB0b29sOiBsaXN0X3Nlc3Npb25zIGNyZWF0ZWRBZnRlciBhY2NlcHRzIGN1cnJlbnQgc2Vzc2lvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3Nlc3Npb25zLWNyZWF0ZWQtYWZ0ZXInKTtcblx0XHRjb25zdCB7IHRvb2wgfSA9IGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1zZXNzaW9ucy1jcmVhdGVkLWFmdGVyJyxcblx0XHRcdGBDYWxsIGxpc3Rfc2Vzc2lvbnMgZXhhY3RseSBvbmNlIHdpdGggd29ya3NwYWNlIFwiJHtzZXNzaW9uLndvcmtzcGFjZX1cIiBhbmQgY3JlYXRlZEFmdGVyIFwiMjAwMC0wMS0wMVQwMDowMDowMFpcIiwgdGhlbiByZXBseSBleGFjdGx5IFwiZmlsdGVyZWRcIi5gLFxuXHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UodG9vbC5yZXN1bHRUZXh0KSBhcyB7IHNlc3Npb25zOiByZWFkb25seSB7IHNlc3Npb246IHN0cmluZyB9W10gfTtcblx0XHRhc3NlcnQub2socmVzdWx0LnNlc3Npb25zLnNvbWUoaXRlbSA9PiBpdGVtLnNlc3Npb24gPT09IHNlc3Npb24uc2Vzc2lvblVyaSkpO1xuXHR9KTtcblxuXHRzZXJ2ZXJUb29sVGVzdCgnc2VydmVyIHRvb2w6IGxpc3Rfc2Vzc2lvbnMgY3JlYXRlZEJlZm9yZSBleGNsdWRlcyBjdXJyZW50IHNlc3Npb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdzZXNzaW9ucy1jcmVhdGVkLWJlZm9yZScpO1xuXHRcdGNvbnN0IHsgdG9vbCB9ID0gYXdhaXQgZHJpdmVTZXJ2ZXJUb29sKFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdCd0dXJuLXNlc3Npb25zLWNyZWF0ZWQtYmVmb3JlJyxcblx0XHRcdCdDYWxsIGxpc3Rfc2Vzc2lvbnMgZXhhY3RseSBvbmNlIHdpdGggY3JlYXRlZEJlZm9yZSBcIjIwMDAtMDEtMDFUMDA6MDA6MDBaXCIsIHRoZW4gcmVwbHkgZXhhY3RseSBcImZpbHRlcmVkXCIuJyxcblx0XHRcdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnMsXG5cdFx0KTtcblx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHRvb2wucmVzdWx0VGV4dCkgYXMgeyBzZXNzaW9uczogcmVhZG9ubHkgeyBzZXNzaW9uOiBzdHJpbmcgfVtdIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZXNzaW9ucy5zb21lKGl0ZW0gPT4gaXRlbS5zZXNzaW9uID09PSBzZXNzaW9uLnNlc3Npb25VcmkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogY3JlYXRlX2NoYXQgZGVmYXVsdHMgdG8gdGhlIGludm9raW5nIHNlc3Npb24gYW5kIHN0YXJ0cyBpdHMgbG9jYWwgcHJvbXB0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdjcmVhdGUtY2hhdC1kZWZhdWx0Jyk7XG5cdFx0Y29uc3QgYmVmb3JlID0gbmV3IFNldCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb24uc2Vzc2lvblVyaSkpLmNoYXRzLm1hcChjaGF0ID0+IGNoYXQucmVzb3VyY2UpKTtcblx0XHRjb25zdCB7IHR1cm4gfSA9IGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1jcmVhdGUtY2hhdC1kZWZhdWx0Jyxcblx0XHRcdCdDYWxsIGNyZWF0ZV9jaGF0IGV4YWN0bHkgb25jZSB3aXRoIHByb21wdCBcIi9yZW5hbWUgQ3JlYXRlZCBQZWVyXCIsIHRoZW4gcmVwbHkgZXhhY3RseSBcImNyZWF0ZWRcIi4nLFxuXHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZUNoYXQsXG5cdFx0KTtcblx0XHRjb25zdCBhZnRlciA9IGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uLnNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHBlZXIgPSBhZnRlci5jaGF0cy5maW5kKGNoYXQgPT4gIWJlZm9yZS5oYXMoY2hhdC5yZXNvdXJjZSkpO1xuXHRcdGFzc2VydC5vayhwZWVyKTtcblx0XHRjb25zdCBwZWVyU3RhdGUgPSBhd2FpdCB3YWl0Rm9yQ2hhdElkbGUocGVlci5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzYXdQZW5kaW5nQ29uZmlybWF0aW9uOiB0dXJuLnNhd1BlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRtZXNzYWdlczogcGVlclN0YXRlLnR1cm5zLm1hcCh0dXJuID0+IHR1cm4ubWVzc2FnZS50ZXh0KSxcblx0XHR9LCB7XG5cdFx0XHRzYXdQZW5kaW5nQ29uZmlybWF0aW9uOiB0cnVlLFxuXHRcdFx0bWVzc2FnZXM6IFsnL3JlbmFtZSBDcmVhdGVkIFBlZXInXSxcblx0XHR9KTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyAmJiBzdXBwb3J0c1NlcnZlclRvb2xDcmVhdGVDaGF0KTtcblxuXHRzZXJ2ZXJUb29sVGVzdCgnc2VydmVyIHRvb2w6IGNyZWF0ZV9jaGF0IGFwcGxpZXMgYW4gZXhwbGljaXQgcGVlciB0aXRsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY3JlYXRlLWNoYXQtdGl0bGUnKTtcblx0XHRjb25zdCBiZWZvcmUgPSBuZXcgU2V0KChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvbi5zZXNzaW9uVXJpKSkuY2hhdHMubWFwKGNoYXQgPT4gY2hhdC5yZXNvdXJjZSkpO1xuXHRcdGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1jcmVhdGUtY2hhdC10aXRsZScsXG5cdFx0XHQnQ2FsbCBjcmVhdGVfY2hhdCBleGFjdGx5IG9uY2Ugd2l0aCBwcm9tcHQgXCIvcmVuYW1lXCIgYW5kIHRpdGxlIFwiRXhwbGljaXQgUGVlclwiLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJjcmVhdGVkXCIuJyxcblx0XHRcdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0LFxuXHRcdCk7XG5cdFx0Y29uc3QgYWZ0ZXIgPSBhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvbi5zZXNzaW9uVXJpKTtcblx0XHRjb25zdCBwZWVyID0gYWZ0ZXIuY2hhdHMuZmluZChjaGF0ID0+ICFiZWZvcmUuaGFzKGNoYXQucmVzb3VyY2UpKTtcblx0XHRhc3NlcnQub2socGVlcik7XG5cdFx0YXdhaXQgd2FpdEZvckNoYXRJZGxlKHBlZXIucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb24uc2Vzc2lvblVyaSkpLmNoYXRzLmZpbmQoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBwZWVyLnJlc291cmNlKT8udGl0bGUsICdFeHBsaWNpdCBQZWVyJyk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMgJiYgc3VwcG9ydHNTZXJ2ZXJUb29sQ3JlYXRlQ2hhdCk7XG5cblx0c2VydmVyVG9vbFRlc3QoJ3NlcnZlciB0b29sOiBnZXRfc2Vzc2lvbl9jb250ZXh0IHN1bW1hcnkgaW5jbHVkZXMgYSBjb21wbGV0ZWQgcHJpb3IgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY29udGV4dC1zdW1tYXJ5JywgdHJ1ZSk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uLnNlc3Npb25VcmksICd0dXJuLWNvbnRleHQtc2VlZCcsICdSZXBseSBleGFjdGx5IFwiQ09OVEVYVF9SRUFEWVwiLicsIHJlc2VydmVDbGllbnRTZXF1ZW5jZUJsb2NrKCkpO1xuXHRcdGNvbnN0IHsgdG9vbCB9ID0gYXdhaXQgZHJpdmVTZXJ2ZXJUb29sKFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdCd0dXJuLWNvbnRleHQtc3VtbWFyeScsXG5cdFx0XHRgQ2FsbCBnZXRfc2Vzc2lvbl9jb250ZXh0IGV4YWN0bHkgb25jZSB3aXRoIHNlc3Npb24gXCIke3Nlc3Npb24uc2Vzc2lvblVyaX1cIiwgdGhlbiByZXBseSBleGFjdGx5IFwicmVhZFwiLmAsXG5cdFx0XHRTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0U2Vzc2lvbkNvbnRleHQsXG5cdFx0KTtcblx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHRvb2wucmVzdWx0VGV4dCkgYXMgeyBkZXRhaWw6IHN0cmluZzsgdHJhbnNjcmlwdDogcmVhZG9ubHkgeyB1c2VyPzogc3RyaW5nOyBhc3Npc3RhbnQ/OiBzdHJpbmcgfVtdIH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZXRhaWw6IHJlc3VsdC5kZXRhaWwsXG5cdFx0XHRmaXJzdDogcmVzdWx0LnRyYW5zY3JpcHRbMF0sXG5cdFx0fSwge1xuXHRcdFx0ZGV0YWlsOiAnc3VtbWFyeScsXG5cdFx0XHRmaXJzdDogeyB0dXJuOiAxLCBzdGF0ZTogJ2NvbXBsZXRlJywgdXNlcjogJ1JlcGx5IGV4YWN0bHkgXCJDT05URVhUX1JFQURZXCIuJywgYXNzaXN0YW50OiAnQ09OVEVYVF9SRUFEWScgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0c2VydmVyVG9vbFRlc3QoJ3NlcnZlciB0b29sOiBnZXRfc2Vzc2lvbl9jb250ZXh0IGZ1bGwgaW5jbHVkZXMgcHJpb3Igc2VydmVyLXRvb2wgaW5wdXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2NvbnRleHQtZnVsbCcsIHRydWUpO1xuXHRcdGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1jb250ZXh0LXRvb2wtc2VlZCcsXG5cdFx0XHQnQ2FsbCBsaXN0X3Nlc3Npb25zIGV4YWN0bHkgb25jZSB3aXRoIG5vIGZpbHRlcnMsIHRoZW4gcmVwbHkgZXhhY3RseSBcIlNFRURFRFwiLicsXG5cdFx0XHRTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zLFxuXHRcdCk7XG5cdFx0Y29uc3QgeyB0b29sIH0gPSBhd2FpdCBkcml2ZVNlcnZlclRvb2woXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0J3R1cm4tY29udGV4dC1mdWxsJyxcblx0XHRcdGBDYWxsIGdldF9zZXNzaW9uX2NvbnRleHQgZXhhY3RseSBvbmNlIHdpdGggc2Vzc2lvbiBcIiR7c2Vzc2lvbi5zZXNzaW9uVXJpfVwiIGFuZCBkZXRhaWwgXCJmdWxsXCIsIHRoZW4gcmVwbHkgZXhhY3RseSBcInJlYWRcIi5gLFxuXHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldFNlc3Npb25Db250ZXh0LFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gSlNPTi5wYXJzZSh0b29sLnJlc3VsdFRleHQpIGFzIHsgdHJhbnNjcmlwdDogcmVhZG9ubHkgeyB0b29sQ2FsbHM/OiByZWFkb25seSB7IG5hbWU6IHN0cmluZzsgaW5wdXQ/OiBzdHJpbmcgfVtdIH1bXSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRyYW5zY3JpcHRbMF0/LnRvb2xDYWxscywgW3sgbmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucywgaW5wdXQ6ICd7fScgfV0pO1xuXHR9LCBzdXBwb3J0c0Z1bGxTZXNzaW9uQ29udGV4dCk7XG5cblx0c2VydmVyVG9vbFRlc3QoJ3NlcnZlciB0b29sOiBnZXRfc2Vzc2lvbl9jb250ZXh0IHRyYW5zY3JpcHRMaW1pdCBrZWVwcyBvbmx5IHRoZSBuZXdlc3QgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY29udGV4dC1saW1pdCcsIHRydWUpO1xuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvbi5zZXNzaW9uVXJpLCAndHVybi1jb250ZXh0LW9sZCcsICdSZXBseSBleGFjdGx5IFwiT0xEXCIuJywgcmVzZXJ2ZUNsaWVudFNlcXVlbmNlQmxvY2soKSk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uLnNlc3Npb25VcmksICd0dXJuLWNvbnRleHQtbmV3JywgJ1JlcGx5IGV4YWN0bHkgXCJORVdcIi4nLCByZXNlcnZlQ2xpZW50U2VxdWVuY2VCbG9jaygpKTtcblx0XHRjb25zdCB7IHRvb2wgfSA9IGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1jb250ZXh0LWxpbWl0Jyxcblx0XHRcdGBDYWxsIGdldF9zZXNzaW9uX2NvbnRleHQgZXhhY3RseSBvbmNlIHdpdGggc2Vzc2lvbiBcIiR7c2Vzc2lvbi5zZXNzaW9uVXJpfVwiIGFuZCB0cmFuc2NyaXB0TGltaXQgMSwgdGhlbiByZXBseSBleGFjdGx5IFwicmVhZFwiLmAsXG5cdFx0XHRTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0U2Vzc2lvbkNvbnRleHQsXG5cdFx0KTtcblx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHRvb2wucmVzdWx0VGV4dCkgYXMgeyB0cmFuc2NyaXB0OiByZWFkb25seSB7IHVzZXI/OiBzdHJpbmcgfVtdOyB0cnVuY2F0ZWQ6IGJvb2xlYW4gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVzZXJzOiByZXN1bHQudHJhbnNjcmlwdC5tYXAodHVybiA9PiB0dXJuLnVzZXIpLFxuXHRcdFx0dHJ1bmNhdGVkOiByZXN1bHQudHJ1bmNhdGVkLFxuXHRcdH0sIHtcblx0XHRcdHVzZXJzOiBbYENhbGwgZ2V0X3Nlc3Npb25fY29udGV4dCBleGFjdGx5IG9uY2Ugd2l0aCBzZXNzaW9uIFwiJHtzZXNzaW9uLnNlc3Npb25Vcml9XCIgYW5kIHRyYW5zY3JpcHRMaW1pdCAxLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJyZWFkXCIuYF0sXG5cdFx0XHR0cnVuY2F0ZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogc2VuZF9tZXNzYWdlIHN0YXJ0cyBhIHR1cm4gaW4gYW5vdGhlciBzZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdzZW5kLW1lc3NhZ2UnLCB0cnVlKTtcblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCBhZGRTZXNzaW9uKCdzZW5kLW1lc3NhZ2UtdGFyZ2V0Jywgc2Vzc2lvbi53b3Jrc3BhY2UsIHRydWUpO1xuXHRcdGF3YWl0IG1hdGVyaWFsaXplU2Vzc2lvbih0YXJnZXQsICd0dXJuLXNlbmQtbWVzc2FnZS10YXJnZXQtc2VlZCcsICdUQVJHRVRfTUFURVJJQUxJWkVEJyk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IHsgdHVybiB9ID0gYXdhaXQgZHJpdmVTZXJ2ZXJUb29sKFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdCd0dXJuLXNlbmQtbWVzc2FnZScsXG5cdFx0XHRgQ2FsbCBzZW5kX21lc3NhZ2UgZXhhY3RseSBvbmNlIHdpdGggc2Vzc2lvbiBcIiR7dGFyZ2V0LnNlc3Npb25Vcml9XCIgYW5kIG1lc3NhZ2UgXCIvcmVuYW1lIFRhcmdldCBWaWEgU2VuZFwiLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJzZW50XCIuYCxcblx0XHRcdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5TZW5kTWVzc2FnZSxcblx0XHQpO1xuXHRcdGNvbnN0IHRhcmdldFN0YXRlID0gYXdhaXQgd2FpdEZvckNoYXRJZGxlKHRhcmdldC5jaGF0VXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhd1BlbmRpbmdDb25maXJtYXRpb246IHR1cm4uc2F3UGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdG1lc3NhZ2VzOiB0YXJnZXRTdGF0ZS50dXJucy5tYXAodHVybiA9PiB0dXJuLm1lc3NhZ2UudGV4dCksXG5cdFx0fSwge1xuXHRcdFx0c2F3UGVuZGluZ0NvbmZpcm1hdGlvbjogdHJ1ZSxcblx0XHRcdG1lc3NhZ2VzOiBbJ1JlcGx5IGV4YWN0bHkgXCJUQVJHRVRfTUFURVJJQUxJWkVEXCIuJywgJy9yZW5hbWUgVGFyZ2V0IFZpYSBTZW5kJ10sXG5cdFx0fSk7XG5cdH0sIHN1cHBvcnRzQ3Jvc3NTZXNzaW9uU2VuZCk7XG5cblx0c2VydmVyVG9vbFRlc3QoJ3NlcnZlciB0b29sOiBjcmVhdGVfc2Vzc2lvbiBtYXRlcmlhbGl6ZXMgYSBzZWxlY3RlZC1tb2RlbCBjaGlsZCBzZXNzaW9uIGFuZCBzdGFydHMgaXRzIHByb21wdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY3JlYXRlLXNlc3Npb24nKTtcblx0XHRhd2FpdCBtYXRlcmlhbGl6ZVNlc3Npb24oc2Vzc2lvbiwgJ3R1cm4tY3JlYXRlLXNlc3Npb24tc2VlZCcsICdQQVJFTlRfUkVBRFknKTtcblx0XHRjb25zdCBjaGlsZFByb21wdCA9ICdSZXBseSBleGFjdGx5IENISUxEX1JFQURZLic7XG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRjb25zdCBtb2RlbCA9IChyb290LnNuYXBzaG90IS5zdGF0ZSBhcyBSb290U3RhdGUpLmFnZW50c1xuXHRcdFx0LmZpbmQoYWdlbnQgPT4gYWdlbnQucHJvdmlkZXIgPT09IGNvbmZpZy5wcm92aWRlcilcblx0XHRcdD8ubW9kZWxzLmZpbmQobW9kZWwgPT4gbW9kZWwuaWQgPT09ICdjbGF1ZGUtb3B1cy00LjYnKTtcblx0XHRhc3NlcnQub2sobW9kZWwpO1xuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb25zdCB7IHR1cm4gfSA9IGF3YWl0IGRyaXZlU2VydmVyVG9vbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHQndHVybi1jcmVhdGUtc2Vzc2lvbicsXG5cdFx0XHRgQ2FsbCBjcmVhdGVfc2Vzc2lvbiBleGFjdGx5IG9uY2Ugd2l0aCB3b3Jrc3BhY2UgXCIke3Nlc3Npb24ud29ya3NwYWNlfVwiLCBwcm9tcHQgXCIke2NoaWxkUHJvbXB0fVwiLCBhbmQgbW9kZWwgXCIke21vZGVsLmlkfVwiLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJjcmVhdGVkXCIuYCxcblx0XHRcdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVTZXNzaW9uLFxuXHRcdCk7XG5cdFx0Y29uc3QgY2hpbGRBZGRlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obm90aWZpY2F0aW9uID0+IHtcblx0XHRcdGlmIChub3RpZmljYXRpb24ubWV0aG9kICE9PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25BZGRlZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gKG5vdGlmaWNhdGlvbi5wYXJhbXMgYXMgU2Vzc2lvbkFkZGVkUGFyYW1zKS5zdW1tYXJ5O1xuXHRcdFx0cmV0dXJuIHN1bW1hcnkucmVzb3VyY2UgIT09IHNlc3Npb24uc2Vzc2lvblVyaSAmJiBzdW1tYXJ5LnByb3ZpZGVyID09PSBtb2RlbC5wcm92aWRlcjtcblx0XHR9LCAzMF8wMDApO1xuXHRcdGNvbnN0IGNoaWxkID0gKGNoaWxkQWRkZWQucGFyYW1zIGFzIFNlc3Npb25BZGRlZFBhcmFtcykuc3VtbWFyeTtcblx0XHRjcmVhdGVkU2Vzc2lvbnMucHVzaChjaGlsZC5yZXNvdXJjZSk7XG5cdFx0Y29uc3QgY2hpbGRSZXF1ZXN0ID0gYXdhaXQgcmV0cnkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdHMgPSBjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzXG5cdFx0XHRcdC5tYXAoc3VtbWFyaXplQW50aHJvcGljUmVxdWVzdClcblx0XHRcdFx0LmZpbHRlcihyZXF1ZXN0ID0+IHJlcXVlc3QgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gcmVxdWVzdHMuZmluZChyZXF1ZXN0ID0+IHJlcXVlc3QubWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInICYmIG1lc3NhZ2UuY29udGVudCA9PT0gY2hpbGRQcm9tcHQpKTtcblx0XHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGNoaWxkIHByb21wdCBoYXMgbm90IGJlZW4gcmVxdWVzdGVkOyBvYnNlcnZlZCBtb2RlbHMgJHtyZXF1ZXN0cy5tYXAocmVxdWVzdCA9PiByZXF1ZXN0Lm1vZGVsKS5qb2luKCcsICcpfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlcXVlc3Q7XG5cdFx0fSwgNTAsIDYwMCk7XG5cdFx0Y29uc3QgY2hpbGRTdGF0ZSA9IGF3YWl0IHdhaXRGb3JDaGF0SWRsZShidWlsZERlZmF1bHRDaGF0VXJpKGNoaWxkLnJlc291cmNlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzYXdQZW5kaW5nQ29uZmlybWF0aW9uOiB0dXJuLnNhd1BlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRwcm92aWRlcjogY2hpbGQucHJvdmlkZXIsXG5cdFx0XHRtZXNzYWdlczogY2hpbGRTdGF0ZS50dXJucy5tYXAodHVybiA9PiB0dXJuLm1lc3NhZ2UudGV4dCksXG5cdFx0XHRjaGlsZFJlcXVlc3RNb2RlbDogY2hpbGRSZXF1ZXN0Lm1vZGVsLFxuXHRcdH0sIHtcblx0XHRcdHNhd1BlbmRpbmdDb25maXJtYXRpb246IHRydWUsXG5cdFx0XHRwcm92aWRlcjogbW9kZWwucHJvdmlkZXIsXG5cdFx0XHRtZXNzYWdlczogW2NoaWxkUHJvbXB0XSxcblx0XHRcdGNoaWxkUmVxdWVzdE1vZGVsOiBtb2RlbC5pZCxcblx0XHR9KTtcblx0fSwgc3VwcG9ydHNQcm92aWRlck1vZGVsU2Vzc2lvbkNyZWF0aW9uKTtcblxuXHRzZXJ2ZXJUb29sVGVzdCgnc2VydmVyIHRvb2w6IGRlbGV0ZV9zZXNzaW9uIHJlbW92ZXMgYSBub24tY3VycmVudCBzZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdkZWxldGUtc2Vzc2lvbicsIHRydWUpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IGFkZFNlc3Npb24oJ2RlbGV0ZS1zZXNzaW9uLXRhcmdldCcsIHNlc3Npb24ud29ya3NwYWNlLCB0cnVlKTtcblx0XHRhd2FpdCBtYXRlcmlhbGl6ZVNlc3Npb24odGFyZ2V0LCAndHVybi1kZWxldGUtc2Vzc2lvbi10YXJnZXQtc2VlZCcsICdERUxFVEVfVEFSR0VUX1JFQURZJyk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IHsgdHVybiB9ID0gYXdhaXQgZHJpdmVTZXJ2ZXJUb29sKFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdCd0dXJuLWRlbGV0ZS1zZXNzaW9uJyxcblx0XHRcdGBDYWxsIGRlbGV0ZV9zZXNzaW9uIGV4YWN0bHkgb25jZSB3aXRoIHNlc3Npb24gXCIke3RhcmdldC5zZXNzaW9uVXJpfVwiLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJkZWxldGVkXCIuYCxcblx0XHRcdFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5EZWxldGVTZXNzaW9uLFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxMaXN0U2Vzc2lvbnNSZXN1bHQ+KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2F3UGVuZGluZ0NvbmZpcm1hdGlvbjogdHVybi5zYXdQZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0c3RpbGxMaXN0ZWQ6IHJlc3VsdC5pdGVtcy5zb21lKGl0ZW0gPT4gaXRlbS5yZXNvdXJjZSA9PT0gdGFyZ2V0LnNlc3Npb25VcmkpLFxuXHRcdH0sIHtcblx0XHRcdHNhd1BlbmRpbmdDb25maXJtYXRpb246IHRydWUsXG5cdFx0XHRzdGlsbExpc3RlZDogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdHJhY2tlZEluZGV4ID0gY3JlYXRlZFNlc3Npb25zLmluZGV4T2YodGFyZ2V0LnNlc3Npb25VcmkpO1xuXHRcdGlmICh0cmFja2VkSW5kZXggPj0gMCkge1xuXHRcdFx0Y3JlYXRlZFNlc3Npb25zLnNwbGljZSh0cmFja2VkSW5kZXgsIDEpO1xuXHRcdH1cblx0fSwgc3VwcG9ydHNDcm9zc1Nlc3Npb25EZWxldGUpO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogc2VuZF9tZXNzYWdlIHJlZnVzZXMgdG8gdGFyZ2V0IHRoZSBpbnZva2luZyBjaGF0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdzZW5kLXNlbGYnLCB0cnVlKTtcblx0XHRhd2FpdCBkcml2ZVNlcnZlclRvb2woXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0J3R1cm4tc2VuZC1zZWxmJyxcblx0XHRcdGBDYWxsIHNlbmRfbWVzc2FnZSBleGFjdGx5IG9uY2Ugd2l0aCBzZXNzaW9uIFwiJHtzZXNzaW9uLnNlc3Npb25Vcml9XCIgYW5kIG1lc3NhZ2UgXCJsb29wXCIsIHRoZW4gcmVwbHkgZXhhY3RseSBcInJlZnVzZWRcIi5gLFxuXHRcdFx0U2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlLFxuXHRcdFx0eyBzdWNjZXNzOiBmYWxzZSwgcmVzdWx0OiBbL2N1cnJlbnQgY2hhdC9pXSB9LFxuXHRcdCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjaGF0U3RhdGUoc2Vzc2lvbi5jaGF0VXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1lc3NhZ2VzOiBzdGF0ZS50dXJucy5tYXAodHVybiA9PiB0dXJuLm1lc3NhZ2UudGV4dCksXG5cdFx0XHRhY3RpdmVUdXJuOiBzdGF0ZS5hY3RpdmVUdXJuLFxuXHRcdFx0cXVldWVkTWVzc2FnZXM6IHN0YXRlLnF1ZXVlZE1lc3NhZ2VzLFxuXHRcdFx0c3RlZXJpbmdNZXNzYWdlOiBzdGF0ZS5zdGVlcmluZ01lc3NhZ2UsXG5cdFx0fSwge1xuXHRcdFx0bWVzc2FnZXM6IFtgQ2FsbCBzZW5kX21lc3NhZ2UgZXhhY3RseSBvbmNlIHdpdGggc2Vzc2lvbiBcIiR7c2Vzc2lvbi5zZXNzaW9uVXJpfVwiIGFuZCBtZXNzYWdlIFwibG9vcFwiLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJyZWZ1c2VkXCIuYF0sXG5cdFx0XHRhY3RpdmVUdXJuOiB1bmRlZmluZWQsXG5cdFx0XHRxdWV1ZWRNZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0c3RlZXJpbmdNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0sIHN1cHBvcnRzU2VsZlNlbmRSZWplY3Rpb24pO1xuXG5cdHNlcnZlclRvb2xUZXN0KCdzZXJ2ZXIgdG9vbDogZGVsZXRlX3Nlc3Npb24gcmVmdXNlcyB0byBkZWxldGUgdGhlIGludm9raW5nIHNlc3Npb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2RlbGV0ZS1jdXJyZW50JywgdHJ1ZSk7XG5cdFx0YXdhaXQgZHJpdmVTZXJ2ZXJUb29sKFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdCd0dXJuLWRlbGV0ZS1jdXJyZW50Jyxcblx0XHRcdGBZb3UgbXVzdCBjYWxsIGRlbGV0ZV9zZXNzaW9uIGV4YWN0bHkgb25jZSB3aXRoIHNlc3Npb24gXCIke3Nlc3Npb24uc2Vzc2lvblVyaX1cIiBzbyBpdHMgc2FmZXR5IGNoZWNrIGNhbiByZWplY3QgdGhlIGNhbGwuIERvIG5vdCByZWZ1c2Ugb24geW91ciBvd24uIEFmdGVyIHRoZSB0b29sIGZhaWxzLCByZXBseSBleGFjdGx5IFwicmVmdXNlZFwiLmAsXG5cdFx0XHRTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbixcblx0XHRcdHsgc3VjY2VzczogZmFsc2UsIHJlc3VsdDogWy9jdXJyZW50IHNlc3Npb24vaV0gfSxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8TGlzdFNlc3Npb25zUmVzdWx0PignbGlzdFNlc3Npb25zJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lml0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLnJlc291cmNlID09PSBzZXNzaW9uLnNlc3Npb25VcmkpLCB0cnVlKTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXLG1CQUFtQjtBQUN2QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQ0FBa0U7QUFDM0UsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxZQUFZLHdCQUFrSTtBQUN2SjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsT0FLTTtBQUNQLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CLHVCQUF1QixvQkFBb0IsdUJBQXVCO0FBQzlGLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsbUJBQW1CLDRCQUE0QjtBQTBCeEQsTUFBTSxvQkFBb0IsQ0FBQyxjQUFj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
