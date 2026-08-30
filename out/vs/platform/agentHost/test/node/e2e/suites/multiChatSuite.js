import assert from "assert";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { ChatSourceKind, CompletionItemKind } from "../../../../common/state/protocol/commands.js";
import {
  buildChatUri,
  buildDefaultChatUri,
  ChatOriginKind,
  isAhpChatChannel,
  MessageAttachmentKind,
  MessageKind,
  parseRequiredSessionUriFromChatUri,
  ResponsePartKind,
  ROOT_STATE_URI,
  SessionStatus,
  ToolCallConfirmationReason
} from "../../../../common/state/sessionState.js";
import { assertToolCallCompleteText, createRealSession } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest, providerHostOnlyTest } from "./e2eTestContext.js";
const RECORDING = process.env["AGENT_HOST_REPLAY_RECORD"] === "1" || process.env["AGENT_HOST_UPDATE_SNAPSHOTS"] === "1";
function defineMultiChatTests(context) {
  const { config, createdSessions, tempDirs } = context;
  const PREFER_FILE_TOOLS = " Use your file tools; do not run a shell command.";
  async function createSession(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-multichat-${prefix}-`));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(
      context.client,
      config,
      `${prefix}-${config.provider}`,
      createdSessions,
      URI.file(workspace)
    );
    return { sessionUri, defaultChatUri: buildDefaultChatUri(sessionUri), workspace };
  }
  async function createPeer(sessionUri, id, source) {
    const chat = buildChatUri(sessionUri, id);
    await context.client.call("createChat", {
      channel: sessionUri,
      chat,
      ...source ? { source } : {}
    }, 3e4);
    return chat;
  }
  async function sessionState(sessionUri) {
    const result = await context.client.call("subscribe", { channel: sessionUri });
    return result.snapshot.state;
  }
  async function chatState(chatUri) {
    const result = await context.client.call("subscribe", { channel: chatUri });
    return result.snapshot.state;
  }
  async function rename(channel, title, clientSeq = 1) {
    context.client.clearReceived();
    context.client.dispatch({
      channel,
      clientSeq,
      action: { type: ActionType.SessionTitleChanged, title }
    });
    if (isAhpChatChannel(channel)) {
      const session = parseRequiredSessionUriFromChatUri(channel);
      await context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "session/chatUpdated") || getActionEnvelope(n).channel !== session) {
          return false;
        }
        const action = getActionEnvelope(n).action;
        return action.chat === channel && action.changes.title === title;
      });
    } else {
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "session/titleChanged") && getActionEnvelope(n).channel === channel
      );
    }
  }
  function providerTest(title, run, enabled = config.supportsMultipleChats) {
    if (context.tier !== "parity") {
      return;
    }
    const providerReplayEnabled = config.supportsMultipleChats && (config.supportsMultipleChatsE2E !== false || RECORDING);
    (enabled && providerReplayEnabled ? test : test.skip)(title, function() {
      this.timeout(18e4);
      return run.call(this);
    });
  }
  function fileReadToolNames(provider) {
    switch (provider) {
      case "claude":
        return ["Read"];
      case "copilotcli":
        return ["view"];
      default:
        return ["Read", "view", "shell"];
    }
  }
  function observedModelMessages(body) {
    const request = JSON.parse(body);
    if (!isRecord(request) || !Array.isArray(request.messages)) {
      return [];
    }
    return request.messages.flatMap((message) => {
      if (!isRecord(message) || typeof message.role !== "string") {
        return [];
      }
      return [{ role: message.role, content: modelContentText(message.content) }];
    });
  }
  function modelContentText(value) {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(modelContentText).join("");
    }
    if (isRecord(value)) {
      if (typeof value.text === "string") {
        return value.text;
      }
      return modelContentText(value.content);
    }
    return "";
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function forkProviderTest(title, run) {
    if (context.tier !== "parity") {
      return;
    }
    (config.supportsChatFork && (config.supportsChatForkE2E || RECORDING) ? test : test.skip)(title, function() {
      this.timeout(18e4);
      return run.call(this);
    });
  }
  async function driveTurn(chatUri, turnId, text, clientSeq, attachments) {
    context.client.clearReceived();
    context.client.dispatch({
      channel: chatUri,
      clientSeq,
      action: {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text, origin: { kind: MessageKind.User }, ...attachments ? { attachments: [...attachments] } : {} }
      }
    });
    const seen = /* @__PURE__ */ new Set();
    let nextClientSeq = clientSeq + 1;
    while (true) {
      const notification = await context.client.waitForNotification((n) => {
        if (seen.has(n) || !isActionNotification(n, "chat/toolCallReady") && !isActionNotification(n, "chat/turnComplete") && !isActionNotification(n, "chat/error")) {
          return false;
        }
        if (getActionEnvelope(n).channel !== chatUri) {
          return false;
        }
        return getActionEnvelope(n).action.turnId === turnId;
      }, 9e4);
      seen.add(notification);
      if (isActionNotification(notification, "chat/error")) {
        const action2 = getActionEnvelope(notification).action;
        throw new Error(`Peer chat error during ${turnId}: ${JSON.stringify(action2.error)}`);
      }
      if (isActionNotification(notification, "chat/turnComplete")) {
        break;
      }
      const action = getActionEnvelope(notification).action;
      if (!action.confirmed) {
        context.client.dispatch({
          channel: chatUri,
          clientSeq: nextClientSeq++,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId,
            toolCallId: action.toolCallId,
            approved: true,
            confirmed: ToolCallConfirmationReason.UserAction
          }
        });
      }
    }
    const markdownPartIds = /* @__PURE__ */ new Set();
    const pieces = [];
    for (const notification of context.client.receivedNotifications(
      (n) => (isActionNotification(n, "chat/responsePart") || isActionNotification(n, "chat/delta")) && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId
    )) {
      const action = getActionEnvelope(notification).action;
      if (action.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown) {
        markdownPartIds.add(action.part.id);
        pieces.push(action.part.content);
      } else if (action.type === ActionType.ChatDelta && markdownPartIds.has(action.partId)) {
        pieces.push(action.content);
      }
    }
    return pieces.join("");
  }
  providerHostOnlyTest(context, "agent advertises its multiple chat capability", async function() {
    await createSession("capability");
    const root = await context.client.call("subscribe", { channel: ROOT_STATE_URI });
    const agent = root.snapshot.state.agents.find((agent2) => agent2.provider === config.provider);
    assert.deepStrictEqual({
      multipleChats: !!agent?.capabilities?.multipleChats,
      fork: agent?.capabilities?.multipleChats?.fork ?? false,
      sideChat: agent?.capabilities?.multipleChats?.sideChat ?? false
    }, {
      multipleChats: config.supportsMultipleChats,
      fork: config.supportsChatFork,
      sideChat: config.supportsSideChats ?? false
    });
  });
  providerHostOnlyTest(context, "provider without multiple chat capability rejects peer creation", async function() {
    const { sessionUri } = await createSession("unsupported");
    await assert.rejects(
      () => createPeer(sessionUri, "unsupported-peer"),
      /does not support multiple chats/i
    );
  }, !config.supportsMultipleChats);
  conformanceTest(context, "creating a peer chat adds it to the session catalog", async function() {
    const { sessionUri } = await createSession("catalog-add");
    const peer = await createPeer(sessionUri, "peer");
    assert.ok((await sessionState(sessionUri)).chats.some((chat) => chat.resource === peer));
  }, config.supportsMultipleChats);
  conformanceTest(context, "peer chat subscription starts empty and idle", async function() {
    const { sessionUri } = await createSession("empty-peer");
    const peer = await createPeer(sessionUri, "peer");
    const state = await chatState(peer);
    assert.deepStrictEqual({ turns: state.turns, activeTurn: state.activeTurn, status: state.status }, {
      turns: [],
      activeTurn: void 0,
      status: SessionStatus.Idle
    });
  }, config.supportsMultipleChats);
  conformanceTest(context, "creating the same peer chat twice is idempotent", async function() {
    const { sessionUri } = await createSession("idempotent");
    const peer = await createPeer(sessionUri, "peer");
    await createPeer(sessionUri, "peer");
    assert.strictEqual((await sessionState(sessionUri)).chats.filter((chat) => chat.resource === peer).length, 1);
  }, config.supportsMultipleChats);
  conformanceTest(context, "creating two peer chats preserves both catalog entries", async function() {
    const { sessionUri } = await createSession("two-peers");
    const first = await createPeer(sessionUri, "first");
    const second = await createPeer(sessionUri, "second");
    const peers = (await sessionState(sessionUri)).chats.map((chat) => chat.resource);
    assert.ok(peers.includes(first) && peers.includes(second));
  }, config.supportsMultipleChats);
  conformanceTest(context, "disposing a peer chat removes its catalog entry", async function() {
    const { sessionUri } = await createSession("dispose");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("disposeChat", { channel: peer }, 3e4);
    assert.strictEqual((await sessionState(sessionUri)).chats.some((chat) => chat.resource === peer), false);
  }, config.supportsMultipleChats);
  conformanceTest(context, "disposing one peer chat preserves its sibling", async function() {
    const { sessionUri } = await createSession("dispose-one");
    const first = await createPeer(sessionUri, "first");
    const second = await createPeer(sessionUri, "second");
    await context.client.call("disposeChat", { channel: first }, 3e4);
    const peers = (await sessionState(sessionUri)).chats.map((chat) => chat.resource);
    assert.ok(!peers.includes(first) && peers.includes(second));
  }, config.supportsMultipleChats);
  conformanceTest(context, "recreating a disposed peer chat starts empty", async function() {
    const { sessionUri } = await createSession("recreate");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("disposeChat", { channel: peer }, 3e4);
    await createPeer(sessionUri, "peer");
    assert.deepStrictEqual((await chatState(peer)).turns, []);
  }, config.supportsMultipleChats);
  conformanceTest(context, "renaming a peer chat updates its catalog title", async function() {
    const { sessionUri } = await createSession("rename-peer");
    const peer = await createPeer(sessionUri, "peer");
    await rename(peer, "Peer Title");
    assert.strictEqual((await sessionState(sessionUri)).chats.find((chat) => chat.resource === peer)?.title, "Peer Title");
  }, config.supportsMultipleChats);
  conformanceTest(context, "renaming a peer chat leaves the session title unchanged", async function() {
    const { sessionUri } = await createSession("rename-isolated");
    await rename(sessionUri, "Session Title");
    const peer = await createPeer(sessionUri, "peer");
    await rename(peer, "Peer Title", 2);
    assert.strictEqual((await sessionState(sessionUri)).title, "Session Title");
  }, config.supportsMultipleChats);
  conformanceTest(context, "peer chat survives unsubscribe and resubscribe", async function() {
    const { sessionUri } = await createSession("resubscribe");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    context.client.notify("unsubscribe", { channel: peer });
    assert.strictEqual((await chatState(peer)).resource, peer);
  }, config.supportsMultipleChats);
  conformanceTest(context, "peer creation does not leak a provider backing as a top-level session", async function() {
    const { sessionUri } = await createSession("session-list");
    const before = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    await createPeer(sessionUri, "peer");
    const after = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    const beforeResources = new Set(before.items.map((item) => item.resource));
    const unexpected = after.items.map((item) => item.resource).filter((resource) => !beforeResources.has(resource) && resource !== sessionUri);
    assert.deepStrictEqual(unexpected, []);
  }, config.supportsMultipleChats);
  conformanceTest(context, "peer file completion uses the parent workspace", async function() {
    const { sessionUri, workspace } = await createSession("completion");
    writeFileSync(join(workspace, "peer-target.txt"), "target");
    const peer = await createPeer(sessionUri, "peer");
    const completions = await context.client.call("completions", {
      channel: peer,
      kind: CompletionItemKind.UserMessage,
      text: "@peer-t",
      offset: "@peer-t".length
    });
    assert.deepStrictEqual(completions.items.map((item) => item.insertText), ["@peer-target.txt"]);
  }, config.supportsMultipleChats);
  conformanceTest(context, "first peer chat snapshots the session title onto the default chat", async function() {
    const { sessionUri, defaultChatUri } = await createSession("default-title");
    await rename(sessionUri, "Original Session");
    await createPeer(sessionUri, "peer");
    assert.strictEqual((await sessionState(sessionUri)).chats.find((chat) => chat.resource === defaultChatUri)?.title, "Original Session");
  }, config.supportsMultipleChats);
  conformanceTest(context, "session rename after peer creation preserves the default chat title", async function() {
    const { sessionUri, defaultChatUri } = await createSession("independent-title");
    await rename(sessionUri, "Original Session");
    await createPeer(sessionUri, "peer");
    await rename(sessionUri, "Renamed Session", 2);
    assert.strictEqual((await sessionState(sessionUri)).chats.find((chat) => chat.resource === defaultChatUri)?.title, "Original Session");
  }, config.supportsMultipleChats);
  conformanceTest(context, "forking an unknown turn creates a fresh empty peer chat", async function() {
    const { sessionUri, defaultChatUri } = await createSession("unknown-fork");
    const peer = await createPeer(sessionUri, "fork", { kind: ChatSourceKind.Fork, chat: defaultChatUri, turnId: "missing-turn" });
    assert.deepStrictEqual((await chatState(peer)).turns, []);
  }, config.supportsMultipleChats);
  providerTest("peer chat completes a simple turn", async function() {
    const { sessionUri } = await createSession("peer-turn");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-turn", 'Reply exactly "PEER_OK".', 1);
    assert.match(response, /PEER_OK/);
  });
  providerTest("peer chat retains context across consecutive turns", async function() {
    const { sessionUri } = await createSession("peer-context");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const firstResponse = await driveTurn(peer, "peer-context-1", 'Remember the code word PEAR. Reply exactly "ready".', 1);
    const response = await driveTurn(peer, "peer-context-2", "What code word did I ask you to remember? Reply with only the code word.", 2);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    const priorAssistantResponse = firstResponse.trim();
    assert.deepStrictEqual({
      priorAssistantResponseIsNonEmpty: priorAssistantResponse.length > 0,
      responseHasCodeWord: /PEAR/i.test(response),
      requestHasPriorUserMessage: messages.some((message) => message.role === "user" && message.content.includes("Remember the code word PEAR")),
      requestHasPriorAssistantMessage: messages.some((message) => message.role === "assistant" && message.content.includes(priorAssistantResponse))
    }, {
      priorAssistantResponseIsNonEmpty: true,
      responseHasCodeWord: true,
      requestHasPriorUserMessage: true,
      requestHasPriorAssistantMessage: true
    });
  });
  forkProviderTest("forked peer chat inherits source history through the provider", async function() {
    const { sessionUri, defaultChatUri } = await createSession("fork-history");
    const sourceResponse = await driveTurn(defaultChatUri, "fork-source", 'Remember the code word FORKCODE. Reply exactly "ready".', 1);
    const peer = await createPeer(sessionUri, "fork", { kind: ChatSourceKind.Fork, chat: defaultChatUri, turnId: "fork-source" });
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "fork-turn", "What code word did I ask you to remember? Reply with only the code word.", 2);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    const priorAssistantResponse = sourceResponse.trim();
    assert.deepStrictEqual({
      seededMessages: (await chatState(peer)).turns.map((turn) => turn.message.text),
      priorAssistantResponseIsNonEmpty: priorAssistantResponse.length > 0,
      responseHasCodeWord: /FORKCODE/i.test(response),
      requestHasPriorUserMessage: messages.some((message) => message.role === "user" && message.content.includes("Remember the code word FORKCODE")),
      requestHasPriorAssistantMessage: messages.some((message) => message.role === "assistant" && message.content.includes(priorAssistantResponse))
    }, {
      seededMessages: [
        'Remember the code word FORKCODE. Reply exactly "ready".',
        "What code word did I ask you to remember? Reply with only the code word."
      ],
      priorAssistantResponseIsNonEmpty: true,
      responseHasCodeWord: true,
      requestHasPriorUserMessage: true,
      requestHasPriorAssistantMessage: true
    });
  });
  providerTest("disposing a peer after a completed turn removes it from the catalog", async function() {
    const { sessionUri } = await createSession("dispose-after-turn");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-turn", 'Reply exactly "DONE".', 1);
    await context.client.call("disposeChat", { channel: peer }, 3e4);
    assert.strictEqual((await sessionState(sessionUri)).chats.some((chat) => chat.resource === peer), false);
  });
  conformanceTest(context, "peer rename command updates the peer title and records a local turn", async function() {
    const { sessionUri } = await createSession("local-rename");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-rename", "/rename Renamed Peer", 1);
    const state = await chatState(peer);
    assert.deepStrictEqual({
      title: state.title,
      messages: state.turns.map((turn) => turn.message.text)
    }, {
      title: "Renamed Peer",
      messages: ["/rename Renamed Peer"]
    });
  }, config.supportsMultipleChats);
  conformanceTest(context, "empty peer rename command leaves the peer title unchanged", async function() {
    const { sessionUri } = await createSession("local-empty-rename");
    const peer = await createPeer(sessionUri, "peer");
    await rename(peer, "Original Peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-empty-rename", "/rename", 2);
    assert.strictEqual((await chatState(peer)).title, "Original Peer");
  }, config.supportsMultipleChats);
  conformanceTest(context, "failing peer bang command records a failed terminal tool call", async function() {
    const { sessionUri } = await createSession("local-bang-failure");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-bang-failure", '!node -e "process.exit(7)"', 1);
    const toolCalls = (await chatState(peer)).turns.flatMap((turn) => turn.responseParts).filter((part) => part.kind === ResponsePartKind.ToolCall).map((part) => part.toolCall);
    assert.ok(toolCalls.some((toolCall) => toolCall.status === "completed" && !toolCall.success));
  }, config.supportsMultipleChats);
  providerTest("peer chat reads a file from the parent workspace", async function() {
    const { sessionUri, workspace } = await createSession("read-file");
    const file = join(workspace, "peer-note.txt");
    writeFileSync(file, "PEER_FILE_VALUE");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-read", `Read the file at ${file} and reply with its exact contents only.`, 1);
    assert.match(response, /PEER_FILE_VALUE/);
    assertToolCallCompleteText(context.client, {
      channel: peer,
      turnId: "peer-read",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/PEER_FILE_VALUE/],
      success: true
    });
  });
  providerTest("peer chat reads a file from a nested directory", async function() {
    const { sessionUri, workspace } = await createSession("read-nested-file");
    mkdirSync(join(workspace, "nested"));
    const file = join(workspace, "nested", "peer.txt");
    writeFileSync(file, "PEER_NESTED_READ");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-read-nested", `Read the file at ${file} and reply with its exact contents only.`, 1);
    assert.match(response, /PEER_NESTED_READ/);
    assertToolCallCompleteText(context.client, {
      channel: peer,
      turnId: "peer-read-nested",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/PEER_NESTED_READ/],
      success: true
    });
  });
  providerTest("peer chat creates a file in the parent workspace", async function() {
    const { sessionUri, workspace } = await createSession("create-file");
    const file = join(workspace, "peer-created.txt");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-create", `Create the file at ${file} containing exactly PEER_CREATED.`, 1);
    assert.strictEqual(readFileSync(file, "utf8"), "PEER_CREATED");
  });
  providerTest("peer chat edits an existing workspace file", async function() {
    const { sessionUri, workspace } = await createSession("edit-file");
    const file = join(workspace, "peer-edit.txt");
    writeFileSync(file, "BEFORE_PEER");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-edit", `Replace the complete contents of ${file} with AFTER_PEER.${PREFER_FILE_TOOLS}`, 1);
    assert.strictEqual(readFileSync(file, "utf8").trim(), "AFTER_PEER");
  }, config.supportsMultipleChats);
  providerTest("peer chat creates a file in a nested directory", async function() {
    const { sessionUri, workspace } = await createSession("nested-create");
    const file = join(workspace, "peer-output", "report.txt");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const peerNestedCommand = `node -e "const fs=require('fs');fs.mkdirSync('peer-output',{recursive:true});fs.writeFileSync('peer-output/report.txt','PEER_NESTED')"`;
    await driveTurn(peer, "peer-nested-create", `Run exactly this shell command, with no modifications: \`${peerNestedCommand}\`. Then reply with exactly "created".`, 1);
    assert.strictEqual(readFileSync(file, "utf8"), "PEER_NESTED");
  }, config.supportsMultipleChats);
  providerTest("peer chat handles a missing workspace file without an error", async function() {
    const { sessionUri, workspace } = await createSession("missing-file");
    const file = join(workspace, "peer-missing.txt");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-missing", `Try to read ${file}. If it does not exist, reply exactly "missing".${PREFER_FILE_TOOLS}`, 1);
    assert.match(response, /missing/i);
    assertToolCallCompleteText(context.client, {
      channel: peer,
      turnId: "peer-missing",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/does not exist/],
      success: false
    });
  });
  providerTest("peer chat reads a filename containing spaces", async function() {
    const { sessionUri, workspace } = await createSession("spaces");
    const file = join(workspace, "peer file.txt");
    writeFileSync(file, "PEER_SPACED");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-spaces", `Read the file at ${file} and reply with its exact contents only.`, 1);
    assert.match(response, /PEER_SPACED/);
    assertToolCallCompleteText(context.client, {
      channel: peer,
      turnId: "peer-spaces",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/PEER_SPACED/],
      success: true
    });
  });
  providerTest("two peer chats write distinct workspace files", async function() {
    const { sessionUri, workspace } = await createSession("two-writers");
    const firstFile = join(workspace, "first-peer.txt");
    const secondFile = join(workspace, "second-peer.txt");
    const first = await createPeer(sessionUri, "first");
    const second = await createPeer(sessionUri, "second");
    await context.client.call("subscribe", { channel: first });
    await context.client.call("subscribe", { channel: second });
    await driveTurn(first, "first-write", `Create the file at ${firstFile} containing exactly FIRST_PEER.`, 1);
    await driveTurn(second, "second-write", `Create the file at ${secondFile} containing exactly SECOND_PEER.`, 10);
    assert.deepStrictEqual({
      first: readFileSync(firstFile, "utf8"),
      second: readFileSync(secondFile, "utf8")
    }, {
      first: "FIRST_PEER",
      second: "SECOND_PEER"
    });
  });
  providerTest("fresh peer chat does not inherit default chat context", async function() {
    const { sessionUri, defaultChatUri } = await createSession("fresh-context");
    await driveTurn(defaultChatUri, "default-secret", 'Remember the code word DEFAULTSECRET. Reply exactly "ready".', 1);
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-fresh-context", 'Reply exactly "fresh".', 10);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.strictEqual(messages.some((message) => message.content.includes("DEFAULTSECRET")), false);
  }, config.supportsMultipleChats);
  providerTest("side chat receives bounded source context without copied history", async function() {
    const { sessionUri, defaultChatUri } = await createSession("side-context");
    await driveTurn(defaultChatUri, "turn-source", 'Remember the exact token SIDECHAT42 for a later question. Reply with exactly "ready".', 1);
    const selection = { text: "MOONVALE99", responsePartId: "response-part-source-1" };
    const sideChatUri = await createPeer(sessionUri, "side", {
      kind: ChatSourceKind.SideChat,
      chat: defaultChatUri,
      turnId: "turn-source",
      selection
    });
    await context.client.call("subscribe", { channel: sideChatUri });
    const question = "Reply with the exact remembered token, then a space, then the exact selected text given to you as context \u2014 nothing else.";
    const response = await driveTurn(sideChatUri, "turn-side", question, 2);
    const [sourceState, sideState, session] = await Promise.all([
      chatState(defaultChatUri),
      chatState(sideChatUri),
      sessionState(sessionUri)
    ]);
    assert.deepStrictEqual({
      responseIncludesRememberedToken: /SIDECHAT42/i.test(response),
      responseIncludesSelectedText: /MOONVALE99/i.test(response),
      sourceTurnCount: sourceState.turns.length,
      sideTurnCount: sideState.turns.length,
      origin: session.chats.find((chat) => chat.resource === sideChatUri)?.origin,
      firstMessage: sideState.turns[0]?.message.text,
      firstAttachments: sideState.turns[0]?.message.attachments ?? []
    }, {
      responseIncludesRememberedToken: true,
      responseIncludesSelectedText: true,
      sourceTurnCount: 1,
      sideTurnCount: 1,
      origin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: "turn-source", selection },
      firstMessage: question,
      firstAttachments: []
    });
  }, config.supportsMultipleChats && !!config.supportsSideChats);
  providerTest("two peer chats keep independent provider contexts", async function() {
    const { sessionUri } = await createSession("two-contexts");
    const first = await createPeer(sessionUri, "first");
    const second = await createPeer(sessionUri, "second");
    await context.client.call("subscribe", { channel: first });
    await context.client.call("subscribe", { channel: second });
    await driveTurn(first, "first-context", 'Remember the code word ALPHA_PEER. Reply exactly "ready".', 1);
    await driveTurn(second, "second-context", 'Remember the code word BETA_PEER. Reply exactly "ready".', 10);
    await driveTurn(first, "first-followup", 'Reply exactly "first".', 20);
    const firstMessages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    await driveTurn(second, "second-followup", 'Reply exactly "second".', 30);
    const secondMessages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.deepStrictEqual({
      firstHasAlpha: firstMessages.some((message) => message.content.includes("ALPHA_PEER")),
      firstHasBeta: firstMessages.some((message) => message.content.includes("BETA_PEER")),
      secondHasBeta: secondMessages.some((message) => message.content.includes("BETA_PEER")),
      secondHasAlpha: secondMessages.some((message) => message.content.includes("ALPHA_PEER"))
    }, {
      firstHasAlpha: true,
      firstHasBeta: false,
      secondHasBeta: true,
      secondHasAlpha: false
    });
  });
  providerTest("peer provider context survives unsubscribe and resubscribe", async function() {
    const { sessionUri } = await createSession("resume-context");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-resume-1", 'Remember the code word RESUME_PEER. Reply exactly "ready".', 1);
    context.client.notify("unsubscribe", { channel: peer });
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-resume-2", 'Reply exactly "resumed".', 10);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.ok(messages.some((message) => message.content.includes("RESUME_PEER")));
  });
  providerTest("recreated peer chat starts with fresh provider context", async function() {
    const { sessionUri } = await createSession("reset-context");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-old-context", 'Remember the code word OLD_PEER. Reply exactly "ready".', 1);
    await context.client.call("disposeChat", { channel: peer }, 3e4);
    await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-new-context", 'Reply exactly "new".', 10);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.strictEqual(messages.some((message) => message.content.includes("OLD_PEER")), false);
  });
  forkProviderTest("unknown-turn fork does not inherit source provider context", async function() {
    const { sessionUri, defaultChatUri } = await createSession("unknown-fork-context");
    await driveTurn(defaultChatUri, "source-secret", 'Remember the code word SOURCE_SECRET. Reply exactly "ready".', 1);
    const peer = await createPeer(sessionUri, "fork", { kind: ChatSourceKind.Fork, chat: defaultChatUri, turnId: "missing-turn" });
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "fresh-fork-turn", 'Reply exactly "fresh".', 10);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.strictEqual(messages.some((message) => message.content.includes("SOURCE_SECRET")), false);
  });
  providerTest("peer simple attachment reaches the provider request", async function() {
    const { sessionUri } = await createSession("simple-attachment");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [{
      type: MessageAttachmentKind.Simple,
      label: "peer-note.txt",
      displayKind: "document",
      modelRepresentation: "PEER_SIMPLE_ATTACHMENT"
    }];
    await driveTurn(peer, "peer-simple-attachment", 'Reply exactly "attachment".', 1, attachments);
    assert.ok((context.observedModelRequestBodies.at(-1) ?? "").includes("PEER_SIMPLE_ATTACHMENT"));
  });
  providerTest("peer simple attachment without a model representation is omitted from the provider request", async function() {
    const { sessionUri } = await createSession("simple-attachment-omitted");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [{
      type: MessageAttachmentKind.Simple,
      label: "PEER_OMITTED_ATTACHMENT"
    }];
    await driveTurn(peer, "peer-simple-attachment-omitted", 'Reply exactly "attachment".', 1, attachments);
    assert.strictEqual((context.observedModelRequestBodies.at(-1) ?? "").includes("PEER_OMITTED_ATTACHMENT"), false);
  });
  providerTest("peer multiple simple attachments reach the provider request", async function() {
    const { sessionUri } = await createSession("multiple-attachments");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [
      {
        type: MessageAttachmentKind.Simple,
        label: "first",
        modelRepresentation: "PEER_FIRST_ATTACHMENT"
      },
      {
        type: MessageAttachmentKind.Simple,
        label: "second",
        modelRepresentation: "PEER_SECOND_ATTACHMENT"
      }
    ];
    await driveTurn(peer, "peer-multiple-attachments", 'Reply exactly "attachments".', 1, attachments);
    const request = context.observedModelRequestBodies.at(-1) ?? "";
    assert.ok(request.includes("PEER_FIRST_ATTACHMENT") && request.includes("PEER_SECOND_ATTACHMENT"));
  });
  providerTest("peer resource attachment reaches the provider request", async function() {
    const { sessionUri, workspace } = await createSession("resource-attachment");
    const file = join(workspace, "peer-resource.txt");
    writeFileSync(file, "PEER_RESOURCE_ATTACHMENT");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [{
      type: MessageAttachmentKind.Resource,
      uri: URI.file(file).toString(),
      label: "peer-resource.txt",
      displayKind: "document"
    }];
    await driveTurn(peer, "peer-resource-attachment", 'Reply exactly "attachment".', 1, attachments);
    assert.ok((context.observedModelRequestBodies.at(-1) ?? "").includes("peer-resource.txt"));
  });
  providerTest("peer resource selection attachment includes its line reference", async function() {
    const { sessionUri, workspace } = await createSession("resource-selection");
    const file = join(workspace, "peer-selection.txt");
    writeFileSync(file, "first\nsecond\nthird");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [{
      type: MessageAttachmentKind.Resource,
      uri: URI.file(file).toString(),
      label: "peer-selection.txt",
      displayKind: "selection",
      selection: {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 6 }
        }
      }
    }];
    await driveTurn(peer, "peer-resource-selection", 'Reply exactly "selection".', 1, attachments);
    const request = context.observedModelRequestBodies.at(-1) ?? "";
    assert.ok(request.includes("peer-selection.txt") && (request.includes("peer-selection.txt:2") || request.includes("(line 2)")));
  });
}
export {
  defineMultiChatTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcbXVsdGlDaGF0U3VpdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBta2RpclN5bmMsIG1rZHRlbXBTeW5jLCByZWFkRmlsZVN5bmMsIHdyaXRlRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBDaGF0RXJyb3JBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFNvdXJjZUtpbmQsIENvbXBsZXRpb25JdGVtS2luZCwgdHlwZSBDb21wbGV0aW9uc1Jlc3VsdCwgdHlwZSBMaXN0U2Vzc2lvbnNSZXN1bHQsIHR5cGUgU3Vic2NyaWJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkQ2hhdFVyaSxcblx0YnVpbGREZWZhdWx0Q2hhdFVyaSxcblx0Q2hhdE9yaWdpbktpbmQsXG5cdGlzQWhwQ2hhdENoYW5uZWwsXG5cdE1lc3NhZ2VBdHRhY2htZW50S2luZCxcblx0TWVzc2FnZUtpbmQsXG5cdHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmksXG5cdFJlc3BvbnNlUGFydEtpbmQsXG5cdFJPT1RfU1RBVEVfVVJJLFxuXHRTZXNzaW9uU3RhdHVzLFxuXHRUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbixcblx0dHlwZSBDaGF0U3RhdGUsXG5cdHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsXG5cdHR5cGUgUm9vdFN0YXRlLFxuXHR0eXBlIFNlc3Npb25TdGF0ZSxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUb29sQ2FsbENvbXBsZXRlVGV4dCwgY3JlYXRlUmVhbFNlc3Npb24gfSBmcm9tICcuLi9oYXJuZXNzL2FnZW50SG9zdEUyRVRlc3RIYXJuZXNzLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkVudmVsb3BlLCBpc0FjdGlvbk5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgY29uZm9ybWFuY2VUZXN0LCBwcm92aWRlckhvc3RPbmx5VGVzdCwgdHlwZSBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQgfSBmcm9tICcuL2UyZVRlc3RDb250ZXh0LmpzJztcblxuY29uc3QgUkVDT1JESU5HID0gcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfUkVQTEFZX1JFQ09SRCddID09PSAnMScgfHwgcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfVVBEQVRFX1NOQVBTSE9UUyddID09PSAnMSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVNdWx0aUNoYXRUZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0Y29uc3QgeyBjb25maWcsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMgfSA9IGNvbnRleHQ7XG5cdC8qKiBTZWUgdGhlIHNhbWUgY29uc3RhbnQgaW4gYGZpbGVPcGVyYXRpb25zU3VpdGVgLiAqL1xuXHRjb25zdCBQUkVGRVJfRklMRV9UT09MUyA9ICcgVXNlIHlvdXIgZmlsZSB0b29sczsgZG8gbm90IHJ1biBhIHNoZWxsIGNvbW1hbmQuJztcblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKHByZWZpeDogc3RyaW5nKTogUHJvbWlzZTx7IHNlc3Npb25Vcmk6IHN0cmluZzsgZGVmYXVsdENoYXRVcmk6IHN0cmluZzsgd29ya3NwYWNlOiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksIGBhaHAtbXVsdGljaGF0LSR7cHJlZml4fS1gKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihcblx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0Y29uZmlnLFxuXHRcdFx0YCR7cHJlZml4fS0ke2NvbmZpZy5wcm92aWRlcn1gLFxuXHRcdFx0Y3JlYXRlZFNlc3Npb25zLFxuXHRcdFx0VVJJLmZpbGUod29ya3NwYWNlKSxcblx0XHQpO1xuXHRcdHJldHVybiB7IHNlc3Npb25VcmksIGRlZmF1bHRDaGF0VXJpOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLCB3b3Jrc3BhY2UgfTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVBlZXIoc2Vzc2lvblVyaTogc3RyaW5nLCBpZDogc3RyaW5nLCBzb3VyY2U/OiB7IGNoYXQ6IHN0cmluZzsgdHVybklkOiBzdHJpbmc7IGtpbmQ6IENoYXRTb3VyY2VLaW5kOyBzZWxlY3Rpb24/OiB7IHRleHQ6IHN0cmluZzsgcmVzcG9uc2VQYXJ0SWQ/OiBzdHJpbmcgfSB9KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksIGlkKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdjcmVhdGVDaGF0Jywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNoYXQsXG5cdFx0XHQuLi4oc291cmNlID8geyBzb3VyY2UgfSA6IHt9KSxcblx0XHR9LCAzMF8wMDApO1xuXHRcdHJldHVybiBjaGF0O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gc2Vzc2lvblN0YXRlKHNlc3Npb25Vcmk6IHN0cmluZyk6IFByb21pc2U8U2Vzc2lvblN0YXRlPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0cmV0dXJuIHJlc3VsdC5zbmFwc2hvdCEuc3RhdGUgYXMgU2Vzc2lvblN0YXRlO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY2hhdFN0YXRlKGNoYXRVcmk6IHN0cmluZyk6IFByb21pc2U8Q2hhdFN0YXRlPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXRVcmkgfSk7XG5cdFx0cmV0dXJuIHJlc3VsdC5zbmFwc2hvdCEuc3RhdGUgYXMgQ2hhdFN0YXRlO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVuYW1lKGNoYW5uZWw6IHN0cmluZywgdGl0bGU6IHN0cmluZywgY2xpZW50U2VxID0gMSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsLFxuXHRcdFx0Y2xpZW50U2VxLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGUgfSxcblx0XHR9KTtcblx0XHRpZiAoaXNBaHBDaGF0Q2hhbm5lbChjaGFubmVsKSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhbm5lbCk7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdzZXNzaW9uL2NoYXRVcGRhdGVkJykgfHwgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCAhPT0gc2Vzc2lvbikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBjaGF0OiBzdHJpbmc7IGNoYW5nZXM6IHsgdGl0bGU/OiBzdHJpbmcgfSB9O1xuXHRcdFx0XHRyZXR1cm4gYWN0aW9uLmNoYXQgPT09IGNoYW5uZWwgJiYgYWN0aW9uLmNoYW5nZXMudGl0bGUgPT09IHRpdGxlO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi90aXRsZUNoYW5nZWQnKVxuXHRcdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGFubmVsLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBwcm92aWRlclRlc3QodGl0bGU6IHN0cmluZywgcnVuOiBNb2NoYS5Bc3luY0Z1bmMsIGVuYWJsZWQgPSBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTogdm9pZCB7XG5cdFx0aWYgKGNvbnRleHQudGllciAhPT0gJ3Bhcml0eScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXJSZXBsYXlFbmFibGVkID0gY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyAmJiAoY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0c0UyRSAhPT0gZmFsc2UgfHwgUkVDT1JESU5HKTtcblx0XHQoZW5hYmxlZCAmJiBwcm92aWRlclJlcGxheUVuYWJsZWQgPyB0ZXN0IDogdGVzdC5za2lwKSh0aXRsZSwgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bi5jYWxsKHRoaXMpO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlsZVJlYWRUb29sTmFtZXMocHJvdmlkZXI6IHN0cmluZyk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRzd2l0Y2ggKHByb3ZpZGVyKSB7XG5cdFx0XHRjYXNlICdjbGF1ZGUnOlxuXHRcdFx0XHRyZXR1cm4gWydSZWFkJ107XG5cdFx0XHRjYXNlICdjb3BpbG90Y2xpJzpcblx0XHRcdFx0cmV0dXJuIFsndmlldyddO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFsnUmVhZCcsICd2aWV3JywgJ3NoZWxsJ107XG5cdFx0fVxuXHR9XG5cblx0aW50ZXJmYWNlIElPYnNlcnZlZE1vZGVsTWVzc2FnZSB7XG5cdFx0cmVhZG9ubHkgcm9sZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZztcblx0fVxuXG5cdGZ1bmN0aW9uIG9ic2VydmVkTW9kZWxNZXNzYWdlcyhib2R5OiBzdHJpbmcpOiByZWFkb25seSBJT2JzZXJ2ZWRNb2RlbE1lc3NhZ2VbXSB7XG5cdFx0Y29uc3QgcmVxdWVzdDogdW5rbm93biA9IEpTT04ucGFyc2UoYm9keSk7XG5cdFx0aWYgKCFpc1JlY29yZChyZXF1ZXN0KSB8fCAhQXJyYXkuaXNBcnJheShyZXF1ZXN0Lm1lc3NhZ2VzKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVxdWVzdC5tZXNzYWdlcy5mbGF0TWFwKG1lc3NhZ2UgPT4ge1xuXHRcdFx0aWYgKCFpc1JlY29yZChtZXNzYWdlKSB8fCB0eXBlb2YgbWVzc2FnZS5yb2xlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW3sgcm9sZTogbWVzc2FnZS5yb2xlLCBjb250ZW50OiBtb2RlbENvbnRlbnRUZXh0KG1lc3NhZ2UuY29udGVudCkgfV07XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBtb2RlbENvbnRlbnRUZXh0KHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAobW9kZWxDb250ZW50VGV4dCkuam9pbignJyk7XG5cdFx0fVxuXHRcdGlmIChpc1JlY29yZCh2YWx1ZSkpIHtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUudGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHZhbHVlLnRleHQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbW9kZWxDb250ZW50VGV4dCh2YWx1ZS5jb250ZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNSZWNvcmQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdFx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGw7XG5cdH1cblxuXHRmdW5jdGlvbiBmb3JrUHJvdmlkZXJUZXN0KHRpdGxlOiBzdHJpbmcsIHJ1bjogTW9jaGEuQXN5bmNGdW5jKTogdm9pZCB7XG5cdFx0aWYgKGNvbnRleHQudGllciAhPT0gJ3Bhcml0eScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0KGNvbmZpZy5zdXBwb3J0c0NoYXRGb3JrICYmIChjb25maWcuc3VwcG9ydHNDaGF0Rm9ya0UyRSB8fCBSRUNPUkRJTkcpID8gdGVzdCA6IHRlc3Quc2tpcCkodGl0bGUsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdHJldHVybiBydW4uY2FsbCh0aGlzKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGRyaXZlVHVybihcblx0XHRjaGF0VXJpOiBzdHJpbmcsXG5cdFx0dHVybklkOiBzdHJpbmcsXG5cdFx0dGV4dDogc3RyaW5nLFxuXHRcdGNsaWVudFNlcTogbnVtYmVyLFxuXHRcdGF0dGFjaG1lbnRzPzogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSxcblx0KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIC4uLihhdHRhY2htZW50cyA/IHsgYXR0YWNobWVudHM6IFsuLi5hdHRhY2htZW50c10gfSA6IHt9KSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxvYmplY3Q+KCk7XG5cdFx0bGV0IG5leHRDbGllbnRTZXEgPSBjbGllbnRTZXEgKyAxO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0XHRpZiAoc2Vlbi5oYXMobiBhcyBvYmplY3QpXG5cdFx0XHRcdFx0fHwgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5Jylcblx0XHRcdFx0XHRcdCYmICFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0XHRcdFx0JiYgIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L2Vycm9yJykpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCAhPT0gY2hhdFVyaSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gdHVybklkO1xuXHRcdFx0fSwgOTBfMDAwKTtcblx0XHRcdHNlZW4uYWRkKG5vdGlmaWNhdGlvbiBhcyBvYmplY3QpO1xuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbiwgJ2NoYXQvZXJyb3InKSkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShub3RpZmljYXRpb24pLmFjdGlvbiBhcyBDaGF0RXJyb3JBY3Rpb247XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUGVlciBjaGF0IGVycm9yIGR1cmluZyAke3R1cm5JZH06ICR7SlNPTi5zdHJpbmdpZnkoYWN0aW9uLmVycm9yKX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihub3RpZmljYXRpb24sICdjaGF0L3R1cm5Db21wbGV0ZScpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247XG5cdFx0XHRpZiAoIWFjdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRcdGNoYW5uZWw6IGNoYXRVcmksXG5cdFx0XHRcdFx0Y2xpZW50U2VxOiBuZXh0Q2xpZW50U2VxKyssXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFya2Rvd25QYXJ0SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgcGllY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgbm90aWZpY2F0aW9uIG9mIGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+XG5cdFx0XHQoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvcmVzcG9uc2VQYXJ0JykgfHwgaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZGVsdGEnKSlcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZFxuXHRcdCkpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uO1xuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQgJiYgYWN0aW9uLnBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bikge1xuXHRcdFx0XHRtYXJrZG93blBhcnRJZHMuYWRkKGFjdGlvbi5wYXJ0LmlkKTtcblx0XHRcdFx0cGllY2VzLnB1c2goYWN0aW9uLnBhcnQuY29udGVudCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXREZWx0YSAmJiBtYXJrZG93blBhcnRJZHMuaGFzKGFjdGlvbi5wYXJ0SWQpKSB7XG5cdFx0XHRcdHBpZWNlcy5wdXNoKGFjdGlvbi5jb250ZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHBpZWNlcy5qb2luKCcnKTtcblx0fVxuXG5cdHByb3ZpZGVySG9zdE9ubHlUZXN0KGNvbnRleHQsICdhZ2VudCBhZHZlcnRpc2VzIGl0cyBtdWx0aXBsZSBjaGF0IGNhcGFiaWxpdHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbignY2FwYWJpbGl0eScpO1xuXHRcdGNvbnN0IHJvb3QgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cdFx0Y29uc3QgYWdlbnQgPSAocm9vdC5zbmFwc2hvdCEuc3RhdGUgYXMgUm9vdFN0YXRlKS5hZ2VudHMuZmluZChhZ2VudCA9PiBhZ2VudC5wcm92aWRlciA9PT0gY29uZmlnLnByb3ZpZGVyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bXVsdGlwbGVDaGF0czogISFhZ2VudD8uY2FwYWJpbGl0aWVzPy5tdWx0aXBsZUNoYXRzLFxuXHRcdFx0Zm9yazogYWdlbnQ/LmNhcGFiaWxpdGllcz8ubXVsdGlwbGVDaGF0cz8uZm9yayA/PyBmYWxzZSxcblx0XHRcdHNpZGVDaGF0OiBhZ2VudD8uY2FwYWJpbGl0aWVzPy5tdWx0aXBsZUNoYXRzPy5zaWRlQ2hhdCA/PyBmYWxzZSxcblx0XHR9LCB7XG5cdFx0XHRtdWx0aXBsZUNoYXRzOiBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLFxuXHRcdFx0Zm9yazogY29uZmlnLnN1cHBvcnRzQ2hhdEZvcmssXG5cdFx0XHRzaWRlQ2hhdDogY29uZmlnLnN1cHBvcnRzU2lkZUNoYXRzID8/IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRwcm92aWRlckhvc3RPbmx5VGVzdChjb250ZXh0LCAncHJvdmlkZXIgd2l0aG91dCBtdWx0aXBsZSBjaGF0IGNhcGFiaWxpdHkgcmVqZWN0cyBwZWVyIGNyZWF0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigndW5zdXBwb3J0ZWQnKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAndW5zdXBwb3J0ZWQtcGVlcicpLFxuXHRcdFx0L2RvZXMgbm90IHN1cHBvcnQgbXVsdGlwbGUgY2hhdHMvaSxcblx0XHQpO1xuXHR9LCAhY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjcmVhdGluZyBhIHBlZXIgY2hhdCBhZGRzIGl0IHRvIHRoZSBzZXNzaW9uIGNhdGFsb2cnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdjYXRhbG9nLWFkZCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cblx0XHRhc3NlcnQub2soKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuY2hhdHMuc29tZShjaGF0ID0+IGNoYXQucmVzb3VyY2UgPT09IHBlZXIpKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdwZWVyIGNoYXQgc3Vic2NyaXB0aW9uIHN0YXJ0cyBlbXB0eSBhbmQgaWRsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2VtcHR5LXBlZXInKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjaGF0U3RhdGUocGVlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgdHVybnM6IHN0YXRlLnR1cm5zLCBhY3RpdmVUdXJuOiBzdGF0ZS5hY3RpdmVUdXJuLCBzdGF0dXM6IHN0YXRlLnN0YXR1cyB9LCB7XG5cdFx0XHR0dXJuczogW10sXG5cdFx0XHRhY3RpdmVUdXJuOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHR9KTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjcmVhdGluZyB0aGUgc2FtZSBwZWVyIGNoYXQgdHdpY2UgaXMgaWRlbXBvdGVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2lkZW1wb3RlbnQnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXG5cdFx0YXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmNoYXRzLmZpbHRlcihjaGF0ID0+IGNoYXQucmVzb3VyY2UgPT09IHBlZXIpLmxlbmd0aCwgMSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY3JlYXRpbmcgdHdvIHBlZXIgY2hhdHMgcHJlc2VydmVzIGJvdGggY2F0YWxvZyBlbnRyaWVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigndHdvLXBlZXJzJyk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3NlY29uZCcpO1xuXG5cdFx0Y29uc3QgcGVlcnMgPSAoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5jaGF0cy5tYXAoY2hhdCA9PiBjaGF0LnJlc291cmNlKTtcblxuXHRcdGFzc2VydC5vayhwZWVycy5pbmNsdWRlcyhmaXJzdCkgJiYgcGVlcnMuaW5jbHVkZXMoc2Vjb25kKSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGlzcG9zaW5nIGEgcGVlciBjaGF0IHJlbW92ZXMgaXRzIGNhdGFsb2cgZW50cnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdkaXNwb3NlJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2Rpc3Bvc2VDaGF0JywgeyBjaGFubmVsOiBwZWVyIH0sIDMwXzAwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuY2hhdHMuc29tZShjaGF0ID0+IGNoYXQucmVzb3VyY2UgPT09IHBlZXIpLCBmYWxzZSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGlzcG9zaW5nIG9uZSBwZWVyIGNoYXQgcHJlc2VydmVzIGl0cyBzaWJsaW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZGlzcG9zZS1vbmUnKTtcblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAnc2Vjb25kJyk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdkaXNwb3NlQ2hhdCcsIHsgY2hhbm5lbDogZmlyc3QgfSwgMzBfMDAwKTtcblxuXHRcdGNvbnN0IHBlZXJzID0gKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuY2hhdHMubWFwKGNoYXQgPT4gY2hhdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKCFwZWVycy5pbmNsdWRlcyhmaXJzdCkgJiYgcGVlcnMuaW5jbHVkZXMoc2Vjb25kKSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVjcmVhdGluZyBhIGRpc3Bvc2VkIHBlZXIgY2hhdCBzdGFydHMgZW1wdHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZWNyZWF0ZScpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnZGlzcG9zZUNoYXQnLCB7IGNoYW5uZWw6IHBlZXIgfSwgMzBfMDAwKTtcblxuXHRcdGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGNoYXRTdGF0ZShwZWVyKSkudHVybnMsIFtdKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZW5hbWluZyBhIHBlZXIgY2hhdCB1cGRhdGVzIGl0cyBjYXRhbG9nIHRpdGxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVuYW1lLXBlZXInKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXG5cdFx0YXdhaXQgcmVuYW1lKHBlZXIsICdQZWVyIFRpdGxlJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuY2hhdHMuZmluZChjaGF0ID0+IGNoYXQucmVzb3VyY2UgPT09IHBlZXIpPy50aXRsZSwgJ1BlZXIgVGl0bGUnKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZW5hbWluZyBhIHBlZXIgY2hhdCBsZWF2ZXMgdGhlIHNlc3Npb24gdGl0bGUgdW5jaGFuZ2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVuYW1lLWlzb2xhdGVkJyk7XG5cdFx0YXdhaXQgcmVuYW1lKHNlc3Npb25VcmksICdTZXNzaW9uIFRpdGxlJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblxuXHRcdGF3YWl0IHJlbmFtZShwZWVyLCAnUGVlciBUaXRsZScsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLnRpdGxlLCAnU2Vzc2lvbiBUaXRsZScpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3BlZXIgY2hhdCBzdXJ2aXZlcyB1bnN1YnNjcmliZSBhbmQgcmVzdWJzY3JpYmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZXN1YnNjcmliZScpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5ub3RpZnkoJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBjaGF0U3RhdGUocGVlcikpLnJlc291cmNlLCBwZWVyKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdwZWVyIGNyZWF0aW9uIGRvZXMgbm90IGxlYWsgYSBwcm92aWRlciBiYWNraW5nIGFzIGEgdG9wLWxldmVsIHNlc3Npb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdzZXNzaW9uLWxpc3QnKTtcblx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPExpc3RTZXNzaW9uc1Jlc3VsdD4oJ2xpc3RTZXNzaW9ucycsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cblx0XHRhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cblx0XHRjb25zdCBhZnRlciA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8TGlzdFNlc3Npb25zUmVzdWx0PignbGlzdFNlc3Npb25zJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRjb25zdCBiZWZvcmVSZXNvdXJjZXMgPSBuZXcgU2V0KGJlZm9yZS5pdGVtcy5tYXAoaXRlbSA9PiBpdGVtLnJlc291cmNlKSk7XG5cdFx0Y29uc3QgdW5leHBlY3RlZCA9IGFmdGVyLml0ZW1zXG5cdFx0XHQubWFwKGl0ZW0gPT4gaXRlbS5yZXNvdXJjZSlcblx0XHRcdC5maWx0ZXIocmVzb3VyY2UgPT4gIWJlZm9yZVJlc291cmNlcy5oYXMocmVzb3VyY2UpICYmIHJlc291cmNlICE9PSBzZXNzaW9uVXJpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodW5leHBlY3RlZCwgW10pO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3BlZXIgZmlsZSBjb21wbGV0aW9uIHVzZXMgdGhlIHBhcmVudCB3b3Jrc3BhY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2NvbXBsZXRpb24nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAncGVlci10YXJnZXQudHh0JyksICd0YXJnZXQnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPENvbXBsZXRpb25zUmVzdWx0PignY29tcGxldGlvbnMnLCB7XG5cdFx0XHRjaGFubmVsOiBwZWVyLFxuXHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLFxuXHRcdFx0dGV4dDogJ0BwZWVyLXQnLFxuXHRcdFx0b2Zmc2V0OiAnQHBlZXItdCcubGVuZ3RoLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5tYXAoaXRlbSA9PiBpdGVtLmluc2VydFRleHQpLCBbJ0BwZWVyLXRhcmdldC50eHQnXSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZmlyc3QgcGVlciBjaGF0IHNuYXBzaG90cyB0aGUgc2Vzc2lvbiB0aXRsZSBvbnRvIHRoZSBkZWZhdWx0IGNoYXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZGVmYXVsdC10aXRsZScpO1xuXHRcdGF3YWl0IHJlbmFtZShzZXNzaW9uVXJpLCAnT3JpZ2luYWwgU2Vzc2lvbicpO1xuXG5cdFx0YXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmNoYXRzLmZpbmQoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBkZWZhdWx0Q2hhdFVyaSk/LnRpdGxlLCAnT3JpZ2luYWwgU2Vzc2lvbicpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Nlc3Npb24gcmVuYW1lIGFmdGVyIHBlZXIgY3JlYXRpb24gcHJlc2VydmVzIHRoZSBkZWZhdWx0IGNoYXQgdGl0bGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignaW5kZXBlbmRlbnQtdGl0bGUnKTtcblx0XHRhd2FpdCByZW5hbWUoc2Vzc2lvblVyaSwgJ09yaWdpbmFsIFNlc3Npb24nKTtcblx0XHRhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cblx0XHRhd2FpdCByZW5hbWUoc2Vzc2lvblVyaSwgJ1JlbmFtZWQgU2Vzc2lvbicsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmNoYXRzLmZpbmQoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBkZWZhdWx0Q2hhdFVyaSk/LnRpdGxlLCAnT3JpZ2luYWwgU2Vzc2lvbicpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2ZvcmtpbmcgYW4gdW5rbm93biB0dXJuIGNyZWF0ZXMgYSBmcmVzaCBlbXB0eSBwZWVyIGNoYXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigndW5rbm93bi1mb3JrJyk7XG5cblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAnZm9yaycsIHsga2luZDogQ2hhdFNvdXJjZUtpbmQuRm9yaywgY2hhdDogZGVmYXVsdENoYXRVcmksIHR1cm5JZDogJ21pc3NpbmctdHVybicgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBjaGF0U3RhdGUocGVlcikpLnR1cm5zLCBbXSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdHByb3ZpZGVyVGVzdCgncGVlciBjaGF0IGNvbXBsZXRlcyBhIHNpbXBsZSB0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncGVlci10dXJuJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLXR1cm4nLCAnUmVwbHkgZXhhY3RseSBcIlBFRVJfT0tcIi4nLCAxKTtcblxuXHRcdGFzc2VydC5tYXRjaChyZXNwb25zZSwgL1BFRVJfT0svKTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIGNoYXQgcmV0YWlucyBjb250ZXh0IGFjcm9zcyBjb25zZWN1dGl2ZSB0dXJucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3BlZXItY29udGV4dCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRjb25zdCBmaXJzdFJlc3BvbnNlID0gYXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLWNvbnRleHQtMScsICdSZW1lbWJlciB0aGUgY29kZSB3b3JkIFBFQVIuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLWNvbnRleHQtMicsICdXaGF0IGNvZGUgd29yZCBkaWQgSSBhc2sgeW91IHRvIHJlbWVtYmVyPyBSZXBseSB3aXRoIG9ubHkgdGhlIGNvZGUgd29yZC4nLCAyKTtcblx0XHRjb25zdCBtZXNzYWdlcyA9IG9ic2VydmVkTW9kZWxNZXNzYWdlcyhjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJyk7XG5cdFx0Y29uc3QgcHJpb3JBc3Npc3RhbnRSZXNwb25zZSA9IGZpcnN0UmVzcG9uc2UudHJpbSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcmlvckFzc2lzdGFudFJlc3BvbnNlSXNOb25FbXB0eTogcHJpb3JBc3Npc3RhbnRSZXNwb25zZS5sZW5ndGggPiAwLFxuXHRcdFx0cmVzcG9uc2VIYXNDb2RlV29yZDogL1BFQVIvaS50ZXN0KHJlc3BvbnNlKSxcblx0XHRcdHJlcXVlc3RIYXNQcmlvclVzZXJNZXNzYWdlOiBtZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5yb2xlID09PSAndXNlcicgJiYgbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKCdSZW1lbWJlciB0aGUgY29kZSB3b3JkIFBFQVInKSksXG5cdFx0XHRyZXF1ZXN0SGFzUHJpb3JBc3Npc3RhbnRNZXNzYWdlOiBtZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5yb2xlID09PSAnYXNzaXN0YW50JyAmJiBtZXNzYWdlLmNvbnRlbnQuaW5jbHVkZXMocHJpb3JBc3Npc3RhbnRSZXNwb25zZSkpLFxuXHRcdH0sIHtcblx0XHRcdHByaW9yQXNzaXN0YW50UmVzcG9uc2VJc05vbkVtcHR5OiB0cnVlLFxuXHRcdFx0cmVzcG9uc2VIYXNDb2RlV29yZDogdHJ1ZSxcblx0XHRcdHJlcXVlc3RIYXNQcmlvclVzZXJNZXNzYWdlOiB0cnVlLFxuXHRcdFx0cmVxdWVzdEhhc1ByaW9yQXNzaXN0YW50TWVzc2FnZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Zm9ya1Byb3ZpZGVyVGVzdCgnZm9ya2VkIHBlZXIgY2hhdCBpbmhlcml0cyBzb3VyY2UgaGlzdG9yeSB0aHJvdWdoIHRoZSBwcm92aWRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIGRlZmF1bHRDaGF0VXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdmb3JrLWhpc3RvcnknKTtcblx0XHRjb25zdCBzb3VyY2VSZXNwb25zZSA9IGF3YWl0IGRyaXZlVHVybihkZWZhdWx0Q2hhdFVyaSwgJ2Zvcmstc291cmNlJywgJ1JlbWVtYmVyIHRoZSBjb2RlIHdvcmQgRk9SS0NPREUuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ2ZvcmsnLCB7IGtpbmQ6IENoYXRTb3VyY2VLaW5kLkZvcmssIGNoYXQ6IGRlZmF1bHRDaGF0VXJpLCB0dXJuSWQ6ICdmb3JrLXNvdXJjZScgfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ2ZvcmstdHVybicsICdXaGF0IGNvZGUgd29yZCBkaWQgSSBhc2sgeW91IHRvIHJlbWVtYmVyPyBSZXBseSB3aXRoIG9ubHkgdGhlIGNvZGUgd29yZC4nLCAyKTtcblx0XHRjb25zdCBtZXNzYWdlcyA9IG9ic2VydmVkTW9kZWxNZXNzYWdlcyhjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJyk7XG5cdFx0Y29uc3QgcHJpb3JBc3Npc3RhbnRSZXNwb25zZSA9IHNvdXJjZVJlc3BvbnNlLnRyaW0oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2VlZGVkTWVzc2FnZXM6IChhd2FpdCBjaGF0U3RhdGUocGVlcikpLnR1cm5zLm1hcCh0dXJuID0+IHR1cm4ubWVzc2FnZS50ZXh0KSxcblx0XHRcdHByaW9yQXNzaXN0YW50UmVzcG9uc2VJc05vbkVtcHR5OiBwcmlvckFzc2lzdGFudFJlc3BvbnNlLmxlbmd0aCA+IDAsXG5cdFx0XHRyZXNwb25zZUhhc0NvZGVXb3JkOiAvRk9SS0NPREUvaS50ZXN0KHJlc3BvbnNlKSxcblx0XHRcdHJlcXVlc3RIYXNQcmlvclVzZXJNZXNzYWdlOiBtZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5yb2xlID09PSAndXNlcicgJiYgbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKCdSZW1lbWJlciB0aGUgY29kZSB3b3JkIEZPUktDT0RFJykpLFxuXHRcdFx0cmVxdWVzdEhhc1ByaW9yQXNzaXN0YW50TWVzc2FnZTogbWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ2Fzc2lzdGFudCcgJiYgbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKHByaW9yQXNzaXN0YW50UmVzcG9uc2UpKSxcblx0XHR9LCB7XG5cdFx0XHRzZWVkZWRNZXNzYWdlczogW1xuXHRcdFx0XHQnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBGT1JLQ09ERS4gUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJyxcblx0XHRcdFx0J1doYXQgY29kZSB3b3JkIGRpZCBJIGFzayB5b3UgdG8gcmVtZW1iZXI/IFJlcGx5IHdpdGggb25seSB0aGUgY29kZSB3b3JkLicsXG5cdFx0XHRdLFxuXHRcdFx0cHJpb3JBc3Npc3RhbnRSZXNwb25zZUlzTm9uRW1wdHk6IHRydWUsXG5cdFx0XHRyZXNwb25zZUhhc0NvZGVXb3JkOiB0cnVlLFxuXHRcdFx0cmVxdWVzdEhhc1ByaW9yVXNlck1lc3NhZ2U6IHRydWUsXG5cdFx0XHRyZXF1ZXN0SGFzUHJpb3JBc3Npc3RhbnRNZXNzYWdlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ2Rpc3Bvc2luZyBhIHBlZXIgYWZ0ZXIgYSBjb21wbGV0ZWQgdHVybiByZW1vdmVzIGl0IGZyb20gdGhlIGNhdGFsb2cnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdkaXNwb3NlLWFmdGVyLXR1cm4nKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci10dXJuJywgJ1JlcGx5IGV4YWN0bHkgXCJET05FXCIuJywgMSk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdkaXNwb3NlQ2hhdCcsIHsgY2hhbm5lbDogcGVlciB9LCAzMF8wMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmNoYXRzLnNvbWUoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBwZWVyKSwgZmFsc2UpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3BlZXIgcmVuYW1lIGNvbW1hbmQgdXBkYXRlcyB0aGUgcGVlciB0aXRsZSBhbmQgcmVjb3JkcyBhIGxvY2FsIHR1cm4nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdsb2NhbC1yZW5hbWUnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXG5cdFx0YXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLXJlbmFtZScsICcvcmVuYW1lIFJlbmFtZWQgUGVlcicsIDEpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjaGF0U3RhdGUocGVlcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZTogc3RhdGUudGl0bGUsXG5cdFx0XHRtZXNzYWdlczogc3RhdGUudHVybnMubWFwKHR1cm4gPT4gdHVybi5tZXNzYWdlLnRleHQpLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnUmVuYW1lZCBQZWVyJyxcblx0XHRcdG1lc3NhZ2VzOiBbJy9yZW5hbWUgUmVuYW1lZCBQZWVyJ10sXG5cdFx0fSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZW1wdHkgcGVlciByZW5hbWUgY29tbWFuZCBsZWF2ZXMgdGhlIHBlZXIgdGl0bGUgdW5jaGFuZ2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbG9jYWwtZW1wdHktcmVuYW1lJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCByZW5hbWUocGVlciwgJ09yaWdpbmFsIFBlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1lbXB0eS1yZW5hbWUnLCAnL3JlbmFtZScsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBjaGF0U3RhdGUocGVlcikpLnRpdGxlLCAnT3JpZ2luYWwgUGVlcicpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2ZhaWxpbmcgcGVlciBiYW5nIGNvbW1hbmQgcmVjb3JkcyBhIGZhaWxlZCB0ZXJtaW5hbCB0b29sIGNhbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdsb2NhbC1iYW5nLWZhaWx1cmUnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXG5cdFx0YXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLWJhbmctZmFpbHVyZScsICchbm9kZSAtZSBcInByb2Nlc3MuZXhpdCg3KVwiJywgMSk7XG5cblx0XHRjb25zdCB0b29sQ2FsbHMgPSAoYXdhaXQgY2hhdFN0YXRlKHBlZXIpKS50dXJucy5mbGF0TWFwKHR1cm4gPT4gdHVybi5yZXNwb25zZVBhcnRzKVxuXHRcdFx0LmZpbHRlcihwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbClcblx0XHRcdC5tYXAocGFydCA9PiBwYXJ0LnRvb2xDYWxsKTtcblx0XHRhc3NlcnQub2sodG9vbENhbGxzLnNvbWUodG9vbENhbGwgPT4gdG9vbENhbGwuc3RhdHVzID09PSAnY29tcGxldGVkJyAmJiAhdG9vbENhbGwuc3VjY2VzcykpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgY2hhdCByZWFkcyBhIGZpbGUgZnJvbSB0aGUgcGFyZW50IHdvcmtzcGFjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVhZC1maWxlJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGpvaW4od29ya3NwYWNlLCAncGVlci1ub3RlLnR4dCcpO1xuXHRcdHdyaXRlRmlsZVN5bmMoZmlsZSwgJ1BFRVJfRklMRV9WQUxVRScpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1yZWFkJywgYFJlYWQgdGhlIGZpbGUgYXQgJHtmaWxlfSBhbmQgcmVwbHkgd2l0aCBpdHMgZXhhY3QgY29udGVudHMgb25seS5gLCAxKTtcblxuXHRcdGFzc2VydC5tYXRjaChyZXNwb25zZSwgL1BFRVJfRklMRV9WQUxVRS8pO1xuXHRcdGFzc2VydFRvb2xDYWxsQ29tcGxldGVUZXh0KGNvbnRleHQuY2xpZW50LCB7XG5cdFx0XHRjaGFubmVsOiBwZWVyLFxuXHRcdFx0dHVybklkOiAncGVlci1yZWFkJyxcblx0XHRcdHRvb2xOYW1lczogZmlsZVJlYWRUb29sTmFtZXMoY29uZmlnLnByb3ZpZGVyKSxcblx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdGV4cGVjdGVkOiBbL1BFRVJfRklMRV9WQUxVRS9dLFxuXHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIGNoYXQgcmVhZHMgYSBmaWxlIGZyb20gYSBuZXN0ZWQgZGlyZWN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZWFkLW5lc3RlZC1maWxlJyk7XG5cdFx0bWtkaXJTeW5jKGpvaW4od29ya3NwYWNlLCAnbmVzdGVkJykpO1xuXHRcdGNvbnN0IGZpbGUgPSBqb2luKHdvcmtzcGFjZSwgJ25lc3RlZCcsICdwZWVyLnR4dCcpO1xuXHRcdHdyaXRlRmlsZVN5bmMoZmlsZSwgJ1BFRVJfTkVTVEVEX1JFQUQnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItcmVhZC1uZXN0ZWQnLCBgUmVhZCB0aGUgZmlsZSBhdCAke2ZpbGV9IGFuZCByZXBseSB3aXRoIGl0cyBleGFjdCBjb250ZW50cyBvbmx5LmAsIDEpO1xuXG5cdFx0YXNzZXJ0Lm1hdGNoKHJlc3BvbnNlLCAvUEVFUl9ORVNURURfUkVBRC8pO1xuXHRcdGFzc2VydFRvb2xDYWxsQ29tcGxldGVUZXh0KGNvbnRleHQuY2xpZW50LCB7XG5cdFx0XHRjaGFubmVsOiBwZWVyLFxuXHRcdFx0dHVybklkOiAncGVlci1yZWFkLW5lc3RlZCcsXG5cdFx0XHR0b29sTmFtZXM6IGZpbGVSZWFkVG9vbE5hbWVzKGNvbmZpZy5wcm92aWRlciksXG5cdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRleHBlY3RlZDogWy9QRUVSX05FU1RFRF9SRUFEL10sXG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgY2hhdCBjcmVhdGVzIGEgZmlsZSBpbiB0aGUgcGFyZW50IHdvcmtzcGFjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY3JlYXRlLWZpbGUnKTtcblx0XHRjb25zdCBmaWxlID0gam9pbih3b3Jrc3BhY2UsICdwZWVyLWNyZWF0ZWQudHh0Jyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1jcmVhdGUnLCBgQ3JlYXRlIHRoZSBmaWxlIGF0ICR7ZmlsZX0gY29udGFpbmluZyBleGFjdGx5IFBFRVJfQ1JFQVRFRC5gLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoZmlsZSwgJ3V0ZjgnKSwgJ1BFRVJfQ1JFQVRFRCcpO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgY2hhdCBlZGl0cyBhbiBleGlzdGluZyB3b3Jrc3BhY2UgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZWRpdC1maWxlJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGpvaW4od29ya3NwYWNlLCAncGVlci1lZGl0LnR4dCcpO1xuXHRcdHdyaXRlRmlsZVN5bmMoZmlsZSwgJ0JFRk9SRV9QRUVSJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1lZGl0JywgYFJlcGxhY2UgdGhlIGNvbXBsZXRlIGNvbnRlbnRzIG9mICR7ZmlsZX0gd2l0aCBBRlRFUl9QRUVSLiR7UFJFRkVSX0ZJTEVfVE9PTFN9YCwgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGZpbGUsICd1dGY4JykudHJpbSgpLCAnQUZURVJfUEVFUicpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgY2hhdCBjcmVhdGVzIGEgZmlsZSBpbiBhIG5lc3RlZCBkaXJlY3RvcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ25lc3RlZC1jcmVhdGUnKTtcblx0XHRjb25zdCBmaWxlID0gam9pbih3b3Jrc3BhY2UsICdwZWVyLW91dHB1dCcsICdyZXBvcnQudHh0Jyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdC8vIFBpbm5lZCBmb3IgdGhlIHNhbWUgcmVhc29uIGFzIGBjcmVhdGVzIGEgZmlsZSBpbiBhIG5ldyBuZXN0ZWQgZGlyZWN0b3J5YFxuXHRcdC8vIGluIGZpbGVPcGVyYXRpb25zU3VpdGU6IGRpcmVjdG9yeSBjcmVhdGlvbiBoYXMgbm8gZmlsZSB0b29sLiBSZWxhdGl2ZSB0b1xuXHRcdC8vIHRoZSBzZXNzaW9uJ3Mgd29ya2luZyBkaXJlY3Rvcnkgc28gdGhlIGNvbW1hbmQgY2FycmllcyBubyBhYnNvbHV0ZSBwYXRoLFxuXHRcdC8vIHdoaWNoIHdvdWxkIG5lZWQgZXNjYXBpbmcgb24gV2luZG93cy5cblx0XHRjb25zdCBwZWVyTmVzdGVkQ29tbWFuZCA9IGBub2RlIC1lIFwiY29uc3QgZnM9cmVxdWlyZSgnZnMnKTtmcy5ta2RpclN5bmMoJ3BlZXItb3V0cHV0Jyx7cmVjdXJzaXZlOnRydWV9KTtmcy53cml0ZUZpbGVTeW5jKCdwZWVyLW91dHB1dC9yZXBvcnQudHh0JywnUEVFUl9ORVNURUQnKVwiYDtcblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItbmVzdGVkLWNyZWF0ZScsIGBSdW4gZXhhY3RseSB0aGlzIHNoZWxsIGNvbW1hbmQsIHdpdGggbm8gbW9kaWZpY2F0aW9uczogXFxgJHtwZWVyTmVzdGVkQ29tbWFuZH1cXGAuIFRoZW4gcmVwbHkgd2l0aCBleGFjdGx5IFwiY3JlYXRlZFwiLmAsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhmaWxlLCAndXRmOCcpLCAnUEVFUl9ORVNURUQnKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIGNoYXQgaGFuZGxlcyBhIG1pc3Npbmcgd29ya3NwYWNlIGZpbGUgd2l0aG91dCBhbiBlcnJvcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbWlzc2luZy1maWxlJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGpvaW4od29ya3NwYWNlLCAncGVlci1taXNzaW5nLnR4dCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1taXNzaW5nJywgYFRyeSB0byByZWFkICR7ZmlsZX0uIElmIGl0IGRvZXMgbm90IGV4aXN0LCByZXBseSBleGFjdGx5IFwibWlzc2luZ1wiLiR7UFJFRkVSX0ZJTEVfVE9PTFN9YCwgMSk7XG5cblx0XHRhc3NlcnQubWF0Y2gocmVzcG9uc2UsIC9taXNzaW5nL2kpO1xuXHRcdGFzc2VydFRvb2xDYWxsQ29tcGxldGVUZXh0KGNvbnRleHQuY2xpZW50LCB7XG5cdFx0XHRjaGFubmVsOiBwZWVyLFxuXHRcdFx0dHVybklkOiAncGVlci1taXNzaW5nJyxcblx0XHRcdHRvb2xOYW1lczogZmlsZVJlYWRUb29sTmFtZXMoY29uZmlnLnByb3ZpZGVyKSxcblx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdGV4cGVjdGVkOiBbL2RvZXMgbm90IGV4aXN0L10sXG5cdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIGNoYXQgcmVhZHMgYSBmaWxlbmFtZSBjb250YWluaW5nIHNwYWNlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignc3BhY2VzJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGpvaW4od29ya3NwYWNlLCAncGVlciBmaWxlLnR4dCcpO1xuXHRcdHdyaXRlRmlsZVN5bmMoZmlsZSwgJ1BFRVJfU1BBQ0VEJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLXNwYWNlcycsIGBSZWFkIHRoZSBmaWxlIGF0ICR7ZmlsZX0gYW5kIHJlcGx5IHdpdGggaXRzIGV4YWN0IGNvbnRlbnRzIG9ubHkuYCwgMSk7XG5cblx0XHRhc3NlcnQubWF0Y2gocmVzcG9uc2UsIC9QRUVSX1NQQUNFRC8pO1xuXHRcdGFzc2VydFRvb2xDYWxsQ29tcGxldGVUZXh0KGNvbnRleHQuY2xpZW50LCB7XG5cdFx0XHRjaGFubmVsOiBwZWVyLFxuXHRcdFx0dHVybklkOiAncGVlci1zcGFjZXMnLFxuXHRcdFx0dG9vbE5hbWVzOiBmaWxlUmVhZFRvb2xOYW1lcyhjb25maWcucHJvdmlkZXIpLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IFsvUEVFUl9TUEFDRUQvXSxcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHByb3ZpZGVyVGVzdCgndHdvIHBlZXIgY2hhdHMgd3JpdGUgZGlzdGluY3Qgd29ya3NwYWNlIGZpbGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCd0d28td3JpdGVycycpO1xuXHRcdGNvbnN0IGZpcnN0RmlsZSA9IGpvaW4od29ya3NwYWNlLCAnZmlyc3QtcGVlci50eHQnKTtcblx0XHRjb25zdCBzZWNvbmRGaWxlID0gam9pbih3b3Jrc3BhY2UsICdzZWNvbmQtcGVlci50eHQnKTtcblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAnc2Vjb25kJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGZpcnN0IH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZWNvbmQgfSk7XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4oZmlyc3QsICdmaXJzdC13cml0ZScsIGBDcmVhdGUgdGhlIGZpbGUgYXQgJHtmaXJzdEZpbGV9IGNvbnRhaW5pbmcgZXhhY3RseSBGSVJTVF9QRUVSLmAsIDEpO1xuXHRcdGF3YWl0IGRyaXZlVHVybihzZWNvbmQsICdzZWNvbmQtd3JpdGUnLCBgQ3JlYXRlIHRoZSBmaWxlIGF0ICR7c2Vjb25kRmlsZX0gY29udGFpbmluZyBleGFjdGx5IFNFQ09ORF9QRUVSLmAsIDEwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3Q6IHJlYWRGaWxlU3luYyhmaXJzdEZpbGUsICd1dGY4JyksXG5cdFx0XHRzZWNvbmQ6IHJlYWRGaWxlU3luYyhzZWNvbmRGaWxlLCAndXRmOCcpLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0OiAnRklSU1RfUEVFUicsXG5cdFx0XHRzZWNvbmQ6ICdTRUNPTkRfUEVFUicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHByb3ZpZGVyVGVzdCgnZnJlc2ggcGVlciBjaGF0IGRvZXMgbm90IGluaGVyaXQgZGVmYXVsdCBjaGF0IGNvbnRleHQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZnJlc2gtY29udGV4dCcpO1xuXHRcdGF3YWl0IGRyaXZlVHVybihkZWZhdWx0Q2hhdFVyaSwgJ2RlZmF1bHQtc2VjcmV0JywgJ1JlbWVtYmVyIHRoZSBjb2RlIHdvcmQgREVGQVVMVFNFQ1JFVC4gUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgMSk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1mcmVzaC1jb250ZXh0JywgJ1JlcGx5IGV4YWN0bHkgXCJmcmVzaFwiLicsIDEwKTtcblx0XHRjb25zdCBtZXNzYWdlcyA9IG9ic2VydmVkTW9kZWxNZXNzYWdlcyhjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnREVGQVVMVFNFQ1JFVCcpKSwgZmFsc2UpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRwcm92aWRlclRlc3QoJ3NpZGUgY2hhdCByZWNlaXZlcyBib3VuZGVkIHNvdXJjZSBjb250ZXh0IHdpdGhvdXQgY29waWVkIGhpc3RvcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignc2lkZS1jb250ZXh0Jyk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuKGRlZmF1bHRDaGF0VXJpLCAndHVybi1zb3VyY2UnLCAnUmVtZW1iZXIgdGhlIGV4YWN0IHRva2VuIFNJREVDSEFUNDIgZm9yIGEgbGF0ZXIgcXVlc3Rpb24uIFJlcGx5IHdpdGggZXhhY3RseSBcInJlYWR5XCIuJywgMSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB7IHRleHQ6ICdNT09OVkFMRTk5JywgcmVzcG9uc2VQYXJ0SWQ6ICdyZXNwb25zZS1wYXJ0LXNvdXJjZS0xJyB9O1xuXHRcdGNvbnN0IHNpZGVDaGF0VXJpID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAnc2lkZScsIHtcblx0XHRcdGtpbmQ6IENoYXRTb3VyY2VLaW5kLlNpZGVDaGF0LFxuXHRcdFx0Y2hhdDogZGVmYXVsdENoYXRVcmksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLXNvdXJjZScsXG5cdFx0XHRzZWxlY3Rpb24sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNpZGVDaGF0VXJpIH0pO1xuXG5cdFx0Y29uc3QgcXVlc3Rpb24gPSAnUmVwbHkgd2l0aCB0aGUgZXhhY3QgcmVtZW1iZXJlZCB0b2tlbiwgdGhlbiBhIHNwYWNlLCB0aGVuIHRoZSBleGFjdCBzZWxlY3RlZCB0ZXh0IGdpdmVuIHRvIHlvdSBhcyBjb250ZXh0IFx1MjAxNCBub3RoaW5nIGVsc2UuJztcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGRyaXZlVHVybihzaWRlQ2hhdFVyaSwgJ3R1cm4tc2lkZScsIHF1ZXN0aW9uLCAyKTtcblx0XHRjb25zdCBbc291cmNlU3RhdGUsIHNpZGVTdGF0ZSwgc2Vzc2lvbl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRjaGF0U3RhdGUoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0Y2hhdFN0YXRlKHNpZGVDaGF0VXJpKSxcblx0XHRcdHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzcG9uc2VJbmNsdWRlc1JlbWVtYmVyZWRUb2tlbjogL1NJREVDSEFUNDIvaS50ZXN0KHJlc3BvbnNlKSxcblx0XHRcdHJlc3BvbnNlSW5jbHVkZXNTZWxlY3RlZFRleHQ6IC9NT09OVkFMRTk5L2kudGVzdChyZXNwb25zZSksXG5cdFx0XHRzb3VyY2VUdXJuQ291bnQ6IHNvdXJjZVN0YXRlLnR1cm5zLmxlbmd0aCxcblx0XHRcdHNpZGVUdXJuQ291bnQ6IHNpZGVTdGF0ZS50dXJucy5sZW5ndGgsXG5cdFx0XHRvcmlnaW46IHNlc3Npb24uY2hhdHMuZmluZChjaGF0ID0+IGNoYXQucmVzb3VyY2UgPT09IHNpZGVDaGF0VXJpKT8ub3JpZ2luLFxuXHRcdFx0Zmlyc3RNZXNzYWdlOiBzaWRlU3RhdGUudHVybnNbMF0/Lm1lc3NhZ2UudGV4dCxcblx0XHRcdGZpcnN0QXR0YWNobWVudHM6IHNpZGVTdGF0ZS50dXJuc1swXT8ubWVzc2FnZS5hdHRhY2htZW50cyA/PyBbXSxcblx0XHR9LCB7XG5cdFx0XHRyZXNwb25zZUluY2x1ZGVzUmVtZW1iZXJlZFRva2VuOiB0cnVlLFxuXHRcdFx0cmVzcG9uc2VJbmNsdWRlc1NlbGVjdGVkVGV4dDogdHJ1ZSxcblx0XHRcdHNvdXJjZVR1cm5Db3VudDogMSxcblx0XHRcdHNpZGVUdXJuQ291bnQ6IDEsXG5cdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsIGNoYXQ6IGRlZmF1bHRDaGF0VXJpLCB0dXJuSWQ6ICd0dXJuLXNvdXJjZScsIHNlbGVjdGlvbiB9LFxuXHRcdFx0Zmlyc3RNZXNzYWdlOiBxdWVzdGlvbixcblx0XHRcdGZpcnN0QXR0YWNobWVudHM6IFtdLFxuXHRcdH0pO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzICYmICEhY29uZmlnLnN1cHBvcnRzU2lkZUNoYXRzKTtcblxuXHRwcm92aWRlclRlc3QoJ3R3byBwZWVyIGNoYXRzIGtlZXAgaW5kZXBlbmRlbnQgcHJvdmlkZXIgY29udGV4dHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCd0d28tY29udGV4dHMnKTtcblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAnc2Vjb25kJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGZpcnN0IH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZWNvbmQgfSk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuKGZpcnN0LCAnZmlyc3QtY29udGV4dCcsICdSZW1lbWJlciB0aGUgY29kZSB3b3JkIEFMUEhBX1BFRVIuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXHRcdGF3YWl0IGRyaXZlVHVybihzZWNvbmQsICdzZWNvbmQtY29udGV4dCcsICdSZW1lbWJlciB0aGUgY29kZSB3b3JkIEJFVEFfUEVFUi4gUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgMTApO1xuXG5cdFx0YXdhaXQgZHJpdmVUdXJuKGZpcnN0LCAnZmlyc3QtZm9sbG93dXAnLCAnUmVwbHkgZXhhY3RseSBcImZpcnN0XCIuJywgMjApO1xuXHRcdGNvbnN0IGZpcnN0TWVzc2FnZXMgPSBvYnNlcnZlZE1vZGVsTWVzc2FnZXMoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJycpO1xuXHRcdGF3YWl0IGRyaXZlVHVybihzZWNvbmQsICdzZWNvbmQtZm9sbG93dXAnLCAnUmVwbHkgZXhhY3RseSBcInNlY29uZFwiLicsIDMwKTtcblx0XHRjb25zdCBzZWNvbmRNZXNzYWdlcyA9IG9ic2VydmVkTW9kZWxNZXNzYWdlcyhjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0SGFzQWxwaGE6IGZpcnN0TWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnQUxQSEFfUEVFUicpKSxcblx0XHRcdGZpcnN0SGFzQmV0YTogZmlyc3RNZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKCdCRVRBX1BFRVInKSksXG5cdFx0XHRzZWNvbmRIYXNCZXRhOiBzZWNvbmRNZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKCdCRVRBX1BFRVInKSksXG5cdFx0XHRzZWNvbmRIYXNBbHBoYTogc2Vjb25kTWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnQUxQSEFfUEVFUicpKSxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdEhhc0FscGhhOiB0cnVlLFxuXHRcdFx0Zmlyc3RIYXNCZXRhOiBmYWxzZSxcblx0XHRcdHNlY29uZEhhc0JldGE6IHRydWUsXG5cdFx0XHRzZWNvbmRIYXNBbHBoYTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHByb3ZpZGVyVGVzdCgncGVlciBwcm92aWRlciBjb250ZXh0IHN1cnZpdmVzIHVuc3Vic2NyaWJlIGFuZCByZXN1YnNjcmliZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3Jlc3VtZS1jb250ZXh0Jyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItcmVzdW1lLTEnLCAnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBSRVNVTUVfUEVFUi4gUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgMSk7XG5cdFx0Y29udGV4dC5jbGllbnQubm90aWZ5KCd1bnN1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1yZXN1bWUtMicsICdSZXBseSBleGFjdGx5IFwicmVzdW1lZFwiLicsIDEwKTtcblx0XHRjb25zdCBtZXNzYWdlcyA9IG9ic2VydmVkTW9kZWxNZXNzYWdlcyhjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJyk7XG5cblx0XHRhc3NlcnQub2sobWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnUkVTVU1FX1BFRVInKSkpO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3JlY3JlYXRlZCBwZWVyIGNoYXQgc3RhcnRzIHdpdGggZnJlc2ggcHJvdmlkZXIgY29udGV4dCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3Jlc2V0LWNvbnRleHQnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1vbGQtY29udGV4dCcsICdSZW1lbWJlciB0aGUgY29kZSB3b3JkIE9MRF9QRUVSLiBSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLCAxKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdkaXNwb3NlQ2hhdCcsIHsgY2hhbm5lbDogcGVlciB9LCAzMF8wMDApO1xuXHRcdGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1uZXctY29udGV4dCcsICdSZXBseSBleGFjdGx5IFwibmV3XCIuJywgMTApO1xuXHRcdGNvbnN0IG1lc3NhZ2VzID0gb2JzZXJ2ZWRNb2RlbE1lc3NhZ2VzKGNvbnRleHQub2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMuYXQoLTEpID8/ICcnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKCdPTERfUEVFUicpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHRmb3JrUHJvdmlkZXJUZXN0KCd1bmtub3duLXR1cm4gZm9yayBkb2VzIG5vdCBpbmhlcml0IHNvdXJjZSBwcm92aWRlciBjb250ZXh0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgZGVmYXVsdENoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3Vua25vd24tZm9yay1jb250ZXh0Jyk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuKGRlZmF1bHRDaGF0VXJpLCAnc291cmNlLXNlY3JldCcsICdSZW1lbWJlciB0aGUgY29kZSB3b3JkIFNPVVJDRV9TRUNSRVQuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdmb3JrJywgeyBraW5kOiBDaGF0U291cmNlS2luZC5Gb3JrLCBjaGF0OiBkZWZhdWx0Q2hhdFVyaSwgdHVybklkOiAnbWlzc2luZy10dXJuJyB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAnZnJlc2gtZm9yay10dXJuJywgJ1JlcGx5IGV4YWN0bHkgXCJmcmVzaFwiLicsIDEwKTtcblx0XHRjb25zdCBtZXNzYWdlcyA9IG9ic2VydmVkTW9kZWxNZXNzYWdlcyhjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnU09VUkNFX1NFQ1JFVCcpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgc2ltcGxlIGF0dGFjaG1lbnQgcmVhY2hlcyB0aGUgcHJvdmlkZXIgcmVxdWVzdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3NpbXBsZS1hdHRhY2htZW50Jyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblx0XHRjb25zdCBhdHRhY2htZW50czogTWVzc2FnZUF0dGFjaG1lbnRbXSA9IFt7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0bGFiZWw6ICdwZWVyLW5vdGUudHh0Jyxcblx0XHRcdGRpc3BsYXlLaW5kOiAnZG9jdW1lbnQnLFxuXHRcdFx0bW9kZWxSZXByZXNlbnRhdGlvbjogJ1BFRVJfU0lNUExFX0FUVEFDSE1FTlQnLFxuXHRcdH1dO1xuXG5cdFx0YXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLXNpbXBsZS1hdHRhY2htZW50JywgJ1JlcGx5IGV4YWN0bHkgXCJhdHRhY2htZW50XCIuJywgMSwgYXR0YWNobWVudHMpO1xuXG5cdFx0YXNzZXJ0Lm9rKChjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJykuaW5jbHVkZXMoJ1BFRVJfU0lNUExFX0FUVEFDSE1FTlQnKSk7XG5cdH0pO1xuXG5cdHByb3ZpZGVyVGVzdCgncGVlciBzaW1wbGUgYXR0YWNobWVudCB3aXRob3V0IGEgbW9kZWwgcmVwcmVzZW50YXRpb24gaXMgb21pdHRlZCBmcm9tIHRoZSBwcm92aWRlciByZXF1ZXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignc2ltcGxlLWF0dGFjaG1lbnQtb21pdHRlZCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdGxhYmVsOiAnUEVFUl9PTUlUVEVEX0FUVEFDSE1FTlQnLFxuXHRcdH1dO1xuXG5cdFx0YXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLXNpbXBsZS1hdHRhY2htZW50LW9taXR0ZWQnLCAnUmVwbHkgZXhhY3RseSBcImF0dGFjaG1lbnRcIi4nLCAxLCBhdHRhY2htZW50cyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNvbnRleHQub2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMuYXQoLTEpID8/ICcnKS5pbmNsdWRlcygnUEVFUl9PTUlUVEVEX0FUVEFDSE1FTlQnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgbXVsdGlwbGUgc2ltcGxlIGF0dGFjaG1lbnRzIHJlYWNoIHRoZSBwcm92aWRlciByZXF1ZXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbXVsdGlwbGUtYXR0YWNobWVudHMnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzOiBNZXNzYWdlQXR0YWNobWVudFtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRsYWJlbDogJ2ZpcnN0Jyxcblx0XHRcdFx0bW9kZWxSZXByZXNlbnRhdGlvbjogJ1BFRVJfRklSU1RfQVRUQUNITUVOVCcsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRsYWJlbDogJ3NlY29uZCcsXG5cdFx0XHRcdG1vZGVsUmVwcmVzZW50YXRpb246ICdQRUVSX1NFQ09ORF9BVFRBQ0hNRU5UJyxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1tdWx0aXBsZS1hdHRhY2htZW50cycsICdSZXBseSBleGFjdGx5IFwiYXR0YWNobWVudHNcIi4nLCAxLCBhdHRhY2htZW50cyk7XG5cblx0XHRjb25zdCByZXF1ZXN0ID0gY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJyc7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3QuaW5jbHVkZXMoJ1BFRVJfRklSU1RfQVRUQUNITUVOVCcpICYmIHJlcXVlc3QuaW5jbHVkZXMoJ1BFRVJfU0VDT05EX0FUVEFDSE1FTlQnKSk7XG5cdH0pO1xuXG5cdHByb3ZpZGVyVGVzdCgncGVlciByZXNvdXJjZSBhdHRhY2htZW50IHJlYWNoZXMgdGhlIHByb3ZpZGVyIHJlcXVlc3QnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3Jlc291cmNlLWF0dGFjaG1lbnQnKTtcblx0XHRjb25zdCBmaWxlID0gam9pbih3b3Jrc3BhY2UsICdwZWVyLXJlc291cmNlLnR4dCcpO1xuXHRcdHdyaXRlRmlsZVN5bmMoZmlsZSwgJ1BFRVJfUkVTT1VSQ0VfQVRUQUNITUVOVCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0dXJpOiBVUkkuZmlsZShmaWxlKS50b1N0cmluZygpLFxuXHRcdFx0bGFiZWw6ICdwZWVyLXJlc291cmNlLnR4dCcsXG5cdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHR9XTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1yZXNvdXJjZS1hdHRhY2htZW50JywgJ1JlcGx5IGV4YWN0bHkgXCJhdHRhY2htZW50XCIuJywgMSwgYXR0YWNobWVudHMpO1xuXG5cdFx0YXNzZXJ0Lm9rKChjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJykuaW5jbHVkZXMoJ3BlZXItcmVzb3VyY2UudHh0JykpO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgcmVzb3VyY2Ugc2VsZWN0aW9uIGF0dGFjaG1lbnQgaW5jbHVkZXMgaXRzIGxpbmUgcmVmZXJlbmNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZXNvdXJjZS1zZWxlY3Rpb24nKTtcblx0XHRjb25zdCBmaWxlID0gam9pbih3b3Jrc3BhY2UsICdwZWVyLXNlbGVjdGlvbi50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGZpbGUsICdmaXJzdFxcbnNlY29uZFxcbnRoaXJkJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblx0XHRjb25zdCBhdHRhY2htZW50czogTWVzc2FnZUF0dGFjaG1lbnRbXSA9IFt7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHR1cmk6IFVSSS5maWxlKGZpbGUpLnRvU3RyaW5nKCksXG5cdFx0XHRsYWJlbDogJ3BlZXItc2VsZWN0aW9uLnR4dCcsXG5cdFx0XHRkaXNwbGF5S2luZDogJ3NlbGVjdGlvbicsXG5cdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRzdGFydDogeyBsaW5lOiAxLCBjaGFyYWN0ZXI6IDAgfSxcblx0XHRcdFx0XHRlbmQ6IHsgbGluZTogMSwgY2hhcmFjdGVyOiA2IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH1dO1xuXG5cdFx0YXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLXJlc291cmNlLXNlbGVjdGlvbicsICdSZXBseSBleGFjdGx5IFwic2VsZWN0aW9uXCIuJywgMSwgYXR0YWNobWVudHMpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IGNvbnRleHQub2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMuYXQoLTEpID8/ICcnO1xuXHRcdGFzc2VydC5vayhyZXF1ZXN0LmluY2x1ZGVzKCdwZWVyLXNlbGVjdGlvbi50eHQnKSAmJiAocmVxdWVzdC5pbmNsdWRlcygncGVlci1zZWxlY3Rpb24udHh0OjInKSB8fCByZXF1ZXN0LmluY2x1ZGVzKCcobGluZSAyKScpKSk7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVyxhQUFhLGNBQWMscUJBQXFCO0FBQ3BFLFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsa0JBQXNFO0FBQy9FLFNBQVMsZ0JBQWdCLDBCQUFpRztBQUMxSDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFD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
