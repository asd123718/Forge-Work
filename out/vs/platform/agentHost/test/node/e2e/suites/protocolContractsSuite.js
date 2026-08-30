import assert from "assert";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { ReconnectResultType } from "../../../../common/state/protocol/commands.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { TerminalClaimKind } from "../../../../common/state/protocol/state.js";
import { buildChatUri, buildDefaultChatUri, MessageKind, ROOT_STATE_URI, SessionStatus } from "../../../../common/state/sessionState.js";
import { createRealSession, dispatchTurn, resolveGitHubToken } from "../harness/agentHostE2ETestHarness.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { AhpErrorCodes, JsonRpcErrorCodes } from "../../../../common/state/sessionProtocol.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest } from "./e2eTestContext.js";
function defineProtocolContractTests(context) {
  const { config, createdSessions, tempDirs } = context;
  let clientSeq = 4e3;
  function nextClientSeq() {
    return clientSeq++;
  }
  async function dispatchAndWaitOnShared(channel, action) {
    const seq = nextClientSeq();
    context.client.dispatch({ channel, clientSeq: seq, action });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, action.type) && getActionEnvelope(n).channel === channel && getActionEnvelope(n).origin?.clientSeq === seq,
      3e4
    );
  }
  async function createSession(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-${prefix}-`));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
    return { sessionUri, workspace };
  }
  async function initializeAdditionalClient(prefix) {
    const client = await context.connectClient();
    await client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId: `${prefix}-${config.provider}`
    });
    return client;
  }
  conformanceTest(context, "ping answers while the connection is live", async function() {
    await context.client.call("ping", { channel: ROOT_STATE_URI });
  });
  conformanceTest(context, "ping answers before the client initializes", async function() {
    const client = await context.connectClient();
    try {
      const result = await client.call("ping", { channel: ROOT_STATE_URI });
      assert.strictEqual(result, null);
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "subscribed client receives OTLP log exports from the real server", async function() {
    const client = await context.connectClient();
    try {
      await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `otlp-logs-${config.provider}`,
        initialSubscriptions: [ROOT_STATE_URI]
      });
      await client.call("subscribe", { channel: "ahp-otlp://logs/trace" });
      const exported = client.waitForNotification(
        (n) => n.method === "otlp/exportLogs" && n.params.channel === "ahp-otlp://logs/trace",
        3e4
      );
      await client.call("createSession", { channel: "missing-provider:/otlp", provider: "missing-provider" }).catch(() => void 0);
      const notification = await exported;
      assert.ok(Object.keys(notification.params.payload).length > 0);
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "management diagnostics report providers and network endpoints", async function() {
    const client = await context.connectClient();
    try {
      await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `management-diagnostics-${config.provider}`
      });
      const [network, managed] = await Promise.all([
        client.call("getNetworkDiagnosticsInfo", {}),
        client.call("getManagedSettingsDiagnostics", {})
      ]);
      assert.deepStrictEqual({
        hasVersion: network.version.length > 0,
        os: network.os,
        arch: network.arch,
        hasEndpoints: network.endpoints.length > 0,
        hasReferenceProvider: managed.some((entry) => entry.provider === config.provider)
      }, {
        hasVersion: true,
        os: process.platform,
        arch: process.arch,
        hasEndpoints: true,
        hasReferenceProvider: true
      });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "diagnostics fetch reports a refused local connection", async function() {
    const client = await context.connectClient();
    try {
      await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `diagnostics-fetch-${config.provider}`
      });
      const result = await client.call("diagnosticsFetch", { url: "http://127.0.0.1:1/" }, 3e4);
      assert.deepStrictEqual({
        url: result.url,
        hasError: typeof result.error === "string" && result.error.length > 0,
        hasDuration: typeof result.durationMs === "number"
      }, {
        url: "http://127.0.0.1:1/",
        hasError: true,
        hasDuration: true
      });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "initialize rejects incompatible protocol versions", async function() {
    const client = await context.connectClient();
    try {
      await assert.rejects(client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: ["999.0.0"],
        clientId: `incompatible-version-${config.provider}`
      }), { code: AhpErrorCodes.UnsupportedProtocolVersion });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "initialize rejects an empty protocol version list", async function() {
    const client = await context.connectClient();
    try {
      await assert.rejects(client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [],
        clientId: `empty-versions-${config.provider}`
      }), { code: AhpErrorCodes.UnsupportedProtocolVersion });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "initialize without subscriptions returns no snapshots", async function() {
    const client = await context.connectClient();
    try {
      const initialized = await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `no-initial-subscriptions-${config.provider}`
      });
      assert.deepStrictEqual(initialized.snapshots, []);
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "initialize reports the negotiated protocol and sequence", async function() {
    const client = await context.connectClient();
    try {
      const initialized = await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `server-identity-${config.provider}`,
        clientInfo: { name: "agent-host-e2e", version: "1.0.0" }
      });
      assert.deepStrictEqual({
        protocolVersion: initialized.protocolVersion,
        serverSeqIsNonNegative: initialized.serverSeq >= 0
      }, {
        protocolVersion: PROTOCOL_VERSION,
        serverSeqIsNonNegative: true
      });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "initialize cannot be repeated after the handshake", async function() {
    const client = await initializeAdditionalClient("repeat-initialize");
    try {
      await assert.rejects(client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `repeat-initialize-again-${config.provider}`
      }), { code: JsonRpcErrorCodes.MethodNotFound });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "listSessions includes provider-backed session metadata", async function() {
    const { sessionUri, workspace } = await createSession("list-session-metadata");
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(context.client, sessionUri, "turn-list-session-metadata", "/rename Listed Session", nextClientSeq());
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === "turn-list-session-metadata"
    );
    const result = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    const item = result.items.find((item2) => item2.resource === sessionUri);
    assert.deepStrictEqual({
      provider: item?.provider,
      hasTitle: typeof item?.title === "string" && item.title.length > 0,
      statusIsNumber: typeof item?.status === "number",
      workingDirectories: item?.workingDirectories,
      hasCreatedAt: item !== void 0 && Number.isFinite(Date.parse(item.createdAt)),
      hasModifiedAt: item !== void 0 && Number.isFinite(Date.parse(item.modifiedAt))
    }, {
      provider: config.provider,
      hasTitle: true,
      statusIsNumber: true,
      workingDirectories: [URI.file(workspace).toString()],
      hasCreatedAt: true,
      hasModifiedAt: true
    });
  });
  conformanceTest(context, "listSessions reflects live title and status changes", async function() {
    const { sessionUri } = await createSession("list-session-live-state");
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(context.client, sessionUri, "turn-list-session-live-state", "/rename Catalog Title", nextClientSeq());
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === "turn-list-session-live-state"
    );
    await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionIsReadChanged, isRead: true });
    await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
    const result = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    const item = result.items.find((item2) => item2.resource === sessionUri);
    assert.deepStrictEqual({
      title: item?.title,
      isRead: !!(item?.status && item.status & SessionStatus.IsRead),
      isArchived: !!(item?.status && item.status & SessionStatus.IsArchived)
    }, {
      title: "Catalog Title",
      isRead: true,
      isArchived: true
    });
  });
  conformanceTest(context, "disposing a session removes it from listSessions", async function() {
    const { sessionUri } = await createSession("list-session-dispose");
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(context.client, sessionUri, "turn-list-session-dispose", "/rename Disposable Session", nextClientSeq());
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === "turn-list-session-dispose"
    );
    const before = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    assert.strictEqual(before.items.some((item) => item.resource === sessionUri), true);
    await context.client.call("disposeSession", { channel: sessionUri });
    const trackedIndex = createdSessions.indexOf(sessionUri);
    if (trackedIndex >= 0) {
      createdSessions.splice(trackedIndex, 1);
    }
    const result = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    assert.strictEqual(result.items.some((item) => item.resource === sessionUri), false);
  });
  conformanceTest(context, "fetchTurns currently emits an empty loaded-turns page", async function() {
    const { sessionUri } = await createSession("fetch-turns");
    const chatUri = buildDefaultChatUri(sessionUri);
    await context.client.call("subscribe", { channel: chatUri });
    dispatchTurn(context.client, sessionUri, "turn-fetch", "/rename Fetch Turns", nextClientSeq());
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === "turn-fetch",
      6e4
    );
    context.client.clearReceived();
    const result = await context.client.call("fetchTurns", { channel: chatUri });
    const loaded = await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnsLoaded") && getActionEnvelope(n).channel === chatUri,
      3e4
    );
    const action = getActionEnvelope(loaded).action;
    assert.deepStrictEqual({
      result,
      action
    }, {
      result: {},
      action: {
        type: ActionType.ChatTurnsLoaded,
        turns: []
      }
    });
  });
  conformanceTest(context, "fetchTurns rejects a cursor the host did not issue", async function() {
    const { sessionUri } = await createSession("fetch-turns-cursor");
    const chatUri = buildDefaultChatUri(sessionUri);
    await context.client.call("subscribe", { channel: chatUri });
    await assert.rejects(context.client.call("fetchTurns", {
      channel: chatUri,
      cursor: "not-a-host-cursor"
    }), { code: JsonRpcErrorCodes.InvalidParams });
  });
  conformanceTest(context, "fetchTurns rejects an unknown chat channel", async function() {
    const { sessionUri } = await createSession("fetch-turns-missing");
    const missingChat = buildChatUri(sessionUri, "missing");
    await assert.rejects(context.client.call("fetchTurns", {
      channel: missingChat
    }));
  });
  conformanceTest(context, "initialize returns snapshots for initial subscriptions", async function() {
    const { sessionUri } = await createSession("initial-subscriptions");
    const chatUri = buildDefaultChatUri(sessionUri);
    const client = await context.connectClient();
    try {
      const initialized = await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `initial-subscriptions-${config.provider}`,
        initialSubscriptions: [sessionUri, chatUri]
      });
      assert.deepStrictEqual(initialized.snapshots.map((snapshot) => snapshot.resource).sort(), [sessionUri, chatUri].sort());
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "a session action is broadcast to every subscribed client", async function() {
    const { sessionUri } = await createSession("multi-client-session-action");
    const client = await initializeAdditionalClient("multi-client-session-action");
    try {
      await client.call("subscribe", { channel: sessionUri });
      client.clearReceived();
      const sequence = nextClientSeq();
      context.client.dispatch({
        channel: sessionUri,
        clientSeq: sequence,
        action: { type: ActionType.SessionTitleChanged, title: "Shared Title" }
      });
      const observed = await client.waitForNotification(
        (n) => isActionNotification(n, "session/titleChanged") && getActionEnvelope(n).channel === sessionUri,
        3e4
      );
      const state = await client.call("subscribe", { channel: sessionUri });
      assert.deepStrictEqual({
        title: getActionEnvelope(observed).action.title,
        originClientSeq: getActionEnvelope(observed).origin?.clientSeq,
        snapshotTitle: state.snapshot.state.title
      }, {
        title: "Shared Title",
        originClientSeq: sequence,
        snapshotTitle: "Shared Title"
      });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "a chat action is broadcast to every subscribed client", async function() {
    const { sessionUri } = await createSession("multi-client-chat-action");
    const chatUri = buildDefaultChatUri(sessionUri);
    const client = await initializeAdditionalClient("multi-client-chat-action");
    try {
      await client.call("subscribe", { channel: chatUri });
      client.clearReceived();
      const draft = { text: "shared draft", origin: { kind: MessageKind.User } };
      await dispatchAndWaitOnShared(chatUri, { type: ActionType.ChatDraftChanged, draft });
      const observed = await client.waitForNotification(
        (n) => isActionNotification(n, "chat/draftChanged") && getActionEnvelope(n).channel === chatUri,
        3e4
      );
      const state = await client.call("subscribe", { channel: chatUri });
      assert.deepStrictEqual({
        actionDraft: getActionEnvelope(observed).action.draft,
        snapshotDraft: state.snapshot.state.draft
      }, {
        actionDraft: draft,
        snapshotDraft: draft
      });
    } finally {
      client.close();
    }
  }, false);
  conformanceTest(context, "an unsubscribed client stops receiving channel actions", async function() {
    const { sessionUri } = await createSession("multi-client-unsubscribe");
    const client = await initializeAdditionalClient("multi-client-unsubscribe");
    try {
      await client.call("subscribe", { channel: sessionUri });
      client.notify("unsubscribe", { channel: sessionUri });
      await client.call("ping", { channel: ROOT_STATE_URI });
      client.clearReceived();
      await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionTitleChanged, title: "After Unsubscribe" });
      assert.deepStrictEqual(client.receivedNotifications(
        (n) => isActionNotification(n, "session/titleChanged") && getActionEnvelope(n).channel === sessionUri
      ), []);
    } finally {
      client.close();
    }
  }, false);
  conformanceTest(context, "initial subscriptions include current session and chat state", async function() {
    const { sessionUri } = await createSession("multi-client-initial-state");
    const chatUri = buildDefaultChatUri(sessionUri);
    const draft = { text: "initial snapshot draft", origin: { kind: MessageKind.User } };
    await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionTitleChanged, title: "Initial Snapshot Title" });
    await dispatchAndWaitOnShared(chatUri, { type: ActionType.ChatDraftChanged, draft });
    const client = await context.connectClient();
    try {
      const initialized = await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `multi-client-initial-state-${config.provider}`,
        initialSubscriptions: [sessionUri, chatUri]
      });
      const session = initialized.snapshots.find((snapshot) => snapshot.resource === sessionUri);
      const chat = initialized.snapshots.find((snapshot) => snapshot.resource === chatUri);
      assert.deepStrictEqual({
        title: session?.state?.title,
        draft: chat?.state?.draft
      }, {
        title: "Initial Snapshot Title",
        draft
      });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "terminal output is streamed to every subscribed client", async function() {
    const { sessionUri, workspace } = await createSession("multi-client-terminal");
    const terminalUri = URI.from({ scheme: "agenthost-terminal", authority: "e2e", path: `/${sessionUri.split("/").at(-1)}` }).toString();
    const client = await initializeAdditionalClient("multi-client-terminal");
    try {
      await context.client.call("createTerminal", {
        channel: terminalUri,
        claim: { kind: TerminalClaimKind.Session, session: sessionUri },
        name: "Multi-client Terminal",
        cwd: URI.file(workspace).toString(),
        cols: 90,
        rows: 30
      });
      await context.client.call("subscribe", { channel: terminalUri });
      await client.call("subscribe", { channel: terminalUri });
      context.client.clearReceived();
      client.clearReceived();
      context.client.dispatch({
        channel: terminalUri,
        clientSeq: nextClientSeq(),
        action: { type: ActionType.TerminalInput, data: `node -p "'MULTI_CLIENT_OUTPUT'"\r` }
      });
      async function waitForMarker(target) {
        let output = "";
        await target.waitForNotification((n) => {
          if (!isActionNotification(n, "terminal/data") || getActionEnvelope(n).channel !== terminalUri) {
            return false;
          }
          output += getActionEnvelope(n).action.data;
          return output.includes("MULTI_CLIENT_OUTPUT");
        }, 3e4);
        return output;
      }
      const [sharedOutput, additionalOutput] = await Promise.all([waitForMarker(context.client), waitForMarker(client)]);
      assert.deepStrictEqual({
        shared: sharedOutput.includes("MULTI_CLIENT_OUTPUT"),
        additional: additionalOutput.includes("MULTI_CLIENT_OUTPUT")
      }, {
        shared: true,
        additional: true
      });
    } finally {
      await context.client.call("disposeTerminal", { channel: terminalUri });
      client.close();
    }
  }, false);
  conformanceTest(context, "session disposal invalidates another client subscription", async function() {
    const { sessionUri } = await createSession("multi-client-dispose");
    const chatUri = buildDefaultChatUri(sessionUri);
    const client = await initializeAdditionalClient("multi-client-dispose");
    try {
      await client.call("subscribe", { channel: sessionUri });
      await client.call("subscribe", { channel: chatUri });
      await context.client.call("disposeSession", { channel: sessionUri });
      const index = createdSessions.indexOf(sessionUri);
      if (index >= 0) {
        createdSessions.splice(index, 1);
      }
      await assert.rejects(client.call("subscribe", { channel: sessionUri }));
      await assert.rejects(client.call("subscribe", { channel: chatUri }));
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "root session summaries are broadcast to every subscribed client", async function() {
    const { sessionUri } = await createSession("multi-client-root-summary");
    const client = await initializeAdditionalClient("multi-client-root-summary");
    try {
      await client.call("subscribe", { channel: ROOT_STATE_URI });
      client.clearReceived();
      await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionTitleChanged, title: "Broadcast Summary" });
      const observed = await client.waitForNotification(
        (n) => n.method === "root/sessionSummaryChanged" && n.params.session === sessionUri,
        3e4
      );
      assert.strictEqual(observed.params.changes.title, "Broadcast Summary");
    } finally {
      client.close();
    }
  }, false);
  async function afterConnectionDrop(clientId, body) {
    const first = await context.connectClient();
    let carried;
    try {
      await first.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId });
      carried = await body(first);
    } finally {
      first.close();
    }
    return { carried, revived: await context.connectClient() };
  }
  conformanceTest(context, "reconnect replays only the actions a dropped client missed", async function() {
    const { sessionUri } = await createSession("reconnect");
    const chatUri = buildDefaultChatUri(sessionUri);
    const droppedClientId = `reconnect-dropped-${config.provider}`;
    const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async (first) => {
      const subscribed = await first.call("subscribe", { channel: chatUri });
      return subscribed.snapshot.fromSeq;
    });
    try {
      await dispatchAndWaitOnShared(chatUri, { type: ActionType.ChatDraftChanged, draft: { text: "missed while disconnected", origin: { kind: MessageKind.User } } });
      const result = await revived.call("reconnect", {
        channel: ROOT_STATE_URI,
        clientId: droppedClientId,
        lastSeenServerSeq: seenThrough,
        subscriptions: [chatUri]
      });
      assert.deepStrictEqual({
        type: result.type,
        replayedAlreadySeen: result.type === ReconnectResultType.Replay && result.actions.some((envelope) => envelope.serverSeq <= seenThrough),
        replayedTheGap: result.type === ReconnectResultType.Replay && result.actions.some((envelope) => envelope.serverSeq > seenThrough)
      }, {
        type: ReconnectResultType.Replay,
        replayedAlreadySeen: false,
        replayedTheGap: true
      });
    } finally {
      revived.close();
    }
  });
  conformanceTest(context, "reconnect reports a subscription it cannot resume as missing", async function() {
    const { sessionUri } = await createSession("reconnect-missing");
    const chatUri = buildDefaultChatUri(sessionUri);
    const droppedClientId = `reconnect-missing-dropped-${config.provider}`;
    const goneUri = URI.from({ scheme: "agenthost-terminal", authority: "e2e", path: "/never-existed" }).toString();
    const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async (first) => {
      const subscribed = await first.call("subscribe", { channel: chatUri });
      return subscribed.snapshot.fromSeq;
    });
    try {
      const result = await revived.call("reconnect", {
        channel: ROOT_STATE_URI,
        clientId: droppedClientId,
        lastSeenServerSeq: seenThrough,
        subscriptions: [chatUri, goneUri]
      });
      assert.deepStrictEqual({
        type: result.type,
        missing: result.type === ReconnectResultType.Replay ? result.missing : void 0
      }, {
        type: ReconnectResultType.Replay,
        missing: [goneUri]
      });
    } finally {
      revived.close();
    }
  });
  conformanceTest(context, "resource requests before initialize are rejected", async function() {
    const client = await context.connectClient();
    try {
      await assert.rejects(client.call("resourceResolve", {
        channel: ROOT_STATE_URI,
        uri: URI.file(tmpdir()).toString()
      }), { code: JsonRpcErrorCodes.MethodNotFound });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "unknown requests after initialize are rejected", async function() {
    const client = await initializeAdditionalClient("unknown-request");
    try {
      await assert.rejects(client.call("agentHostE2E/unknownRequest", {
        channel: ROOT_STATE_URI
      }), { code: JsonRpcErrorCodes.MethodNotFound });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "reconnect rejects an unknown client", async function() {
    const client = await context.connectClient();
    try {
      await assert.rejects(client.call("reconnect", {
        channel: ROOT_STATE_URI,
        clientId: `unknown-reconnect-${config.provider}`,
        lastSeenServerSeq: 0,
        subscriptions: []
      }), { code: AhpErrorCodes.NotFound });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "creating a session with an unknown provider is rejected", async function() {
    const client = await initializeAdditionalClient("unknown-provider");
    try {
      await assert.rejects(client.call("createSession", {
        channel: "missing-provider:/session",
        provider: "missing-provider"
      }), { code: AhpErrorCodes.ProviderNotFound });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "creating a duplicate session resource is rejected", async function() {
    const { sessionUri, workspace } = await createSession("duplicate-session");
    await assert.rejects(context.client.call("createSession", {
      channel: sessionUri,
      provider: config.provider,
      workingDirectories: [URI.file(workspace).toString()],
      config: { isolation: "folder" }
    }), { code: AhpErrorCodes.SessionAlreadyExists });
  }, context.runHostOnlyKnownIssueTests);
  conformanceTest(context, "a session cannot fork onto its own resource", async function() {
    const { sessionUri } = await createSession("self-fork");
    await assert.rejects(context.client.call("createSession", {
      channel: sessionUri,
      provider: config.provider,
      fork: { session: sessionUri, turnId: "irrelevant" }
    }), { code: AhpErrorCodes.SessionAlreadyExists });
  });
  conformanceTest(context, "forking from a missing session is rejected", async function() {
    const target = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    const missingSource = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    await context.client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId: `missing-fork-source-${config.provider}`
    });
    await assert.rejects(context.client.call("createSession", {
      channel: target,
      provider: config.provider,
      fork: { session: missingSource, turnId: "missing-turn" }
    }), { code: AhpErrorCodes.SessionNotFound });
  });
  conformanceTest(context, "createSession rejects an active client owned by another connection", async function() {
    const client = await context.connectClient();
    try {
      await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `active-client-owner-${config.provider}`
      });
      await assert.rejects(client.call("createSession", {
        channel: URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString(),
        provider: config.provider,
        activeClient: { clientId: "different-client", displayName: "Different Client", tools: [] }
      }), { code: JsonRpcErrorCodes.InvalidParams });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "createSession seeds a matching active client into session state", async function() {
    const workspace = mkdtempSync(join(tmpdir(), "ahp-active-client-create-"));
    tempDirs.push(workspace);
    const clientId = `active-client-create-${config.provider}`;
    const client = await context.connectClient();
    const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    let created = false;
    try {
      await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId
      });
      await client.call("authenticate", {
        channel: ROOT_STATE_URI,
        resource: "https://api.github.com",
        token: config.githubToken ?? resolveGitHubToken()
      });
      await client.call("createSession", {
        channel: sessionUri,
        provider: config.provider,
        workingDirectories: [URI.file(workspace).toString()],
        config: { isolation: "folder" },
        activeClient: { clientId, displayName: "Creating Client", tools: [] }
      });
      created = true;
      const subscribed = await client.call("subscribe", { channel: sessionUri });
      const state = subscribed.snapshot.state;
      assert.deepStrictEqual(state.activeClients, [{
        clientId,
        displayName: "Creating Client",
        tools: []
      }]);
    } finally {
      if (created) {
        await client.call("disposeSession", { channel: sessionUri });
      }
      client.close();
    }
  });
  conformanceTest(context, "creating a chat for a missing session is rejected", async function() {
    const client = await initializeAdditionalClient("missing-chat-session");
    const sessionUri = URI.from({ scheme: config.scheme, path: "/missing-chat-session" }).toString();
    try {
      await assert.rejects(client.call("createChat", {
        channel: sessionUri,
        chat: buildChatUri(sessionUri, "peer")
      }), { code: AhpErrorCodes.SessionNotFound });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "subscribing twice does not duplicate action delivery", async function() {
    const { sessionUri } = await createSession("duplicate-subscription");
    const chatUri = buildDefaultChatUri(sessionUri);
    await context.client.call("subscribe", { channel: chatUri });
    await context.client.call("subscribe", { channel: chatUri });
    context.client.clearReceived();
    const clientSeq2 = nextClientSeq();
    const action = { type: ActionType.ChatDraftChanged, draft: { text: "single delivery", origin: { kind: MessageKind.User } } };
    context.client.dispatch({ channel: chatUri, clientSeq: clientSeq2, action });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, action.type) && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).origin?.clientSeq === clientSeq2
    );
    await context.client.call("ping", { channel: ROOT_STATE_URI });
    const deliveries = context.client.receivedNotifications(
      (n) => isActionNotification(n, action.type) && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).origin?.clientSeq === clientSeq2
    );
    assert.strictEqual(deliveries.length, 1);
  });
  conformanceTest(context, "resubscribing receives state changed while unsubscribed", async function() {
    const { sessionUri } = await createSession("resubscribe-snapshot");
    const chatUri = buildDefaultChatUri(sessionUri);
    context.client.notify("unsubscribe", { channel: chatUri });
    const clientSeq2 = nextClientSeq();
    context.client.dispatch({
      channel: chatUri,
      clientSeq: clientSeq2,
      action: {
        type: ActionType.ChatDraftChanged,
        draft: { text: "changed while unsubscribed", origin: { kind: MessageKind.User } }
      }
    });
    await context.client.call("ping", { channel: ROOT_STATE_URI });
    const subscribed = await context.client.call("subscribe", { channel: chatUri });
    const state = subscribed.snapshot.state;
    assert.strictEqual(state.draft?.text, "changed while unsubscribed");
  });
  const unsupportedWorkingDirectoryActions = [
    { notification: "session/workingDirectorySet", channel: "session", build: (directory) => ({ type: ActionType.SessionWorkingDirectorySet, directory }) },
    { notification: "session/workingDirectoryRemoved", channel: "session", build: (directory) => ({ type: ActionType.SessionWorkingDirectoryRemoved, directory }) },
    { notification: "chat/workingDirectorySet", channel: "chat", build: (directory) => ({ type: ActionType.ChatWorkingDirectorySet, directory }) },
    { notification: "chat/workingDirectoryRemoved", channel: "chat", build: (directory) => ({ type: ActionType.ChatWorkingDirectoryRemoved, directory }) }
  ];
  for (const unsupported of unsupportedWorkingDirectoryActions) {
    conformanceTest(context, `${unsupported.notification} is rejected rather than silently dropped`, async function() {
      const { sessionUri, workspace } = await createSession("unsupported-action");
      const channel = unsupported.channel === "session" ? sessionUri : buildDefaultChatUri(sessionUri);
      await context.client.call("subscribe", { channel });
      context.client.clearReceived();
      const seq = nextClientSeq();
      const directory = URI.file(join(workspace, "second-root")).toString();
      context.client.dispatch({ channel, clientSeq: seq, action: unsupported.build(directory) });
      const rejected = await context.client.waitForNotification(
        (n) => isActionNotification(n, unsupported.notification) && getActionEnvelope(n).channel === channel,
        3e4
      );
      const envelope = getActionEnvelope(rejected);
      const state = (await context.client.call("subscribe", { channel })).snapshot.state;
      assert.deepStrictEqual({
        hasRejectionReason: typeof envelope.rejectionReason === "string" && envelope.rejectionReason.length > 0,
        echoedClientSeq: envelope.origin?.clientSeq,
        // The reducer is deliberately not run, so state never moves.
        directoryApplied: (state.workingDirectories ?? []).includes(directory)
      }, {
        hasRejectionReason: true,
        echoedClientSeq: seq,
        directoryApplied: false
      });
    });
  }
}
export {
  defineProtocolContractTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xccHJvdG9jb2xDb250cmFjdHNTdWl0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogUHJvdG9jb2wtbGV2ZWwgY29udHJhY3RzIHRoYXQgYXJlIG5vdCB0aWVkIHRvIGFueSBvbmUgY2hhbm5lbDogbGl2ZW5lc3MsXG4gKiB0dXJuLWhpc3RvcnkgcGFnaW5nLCBhbmQgaG93IHRoZSBob3N0IGFuc3dlcnMgYSBjbGllbnQgYWN0aW9uIGl0IGRlY2xhcmVzXG4gKiBidXQgZG9lcyBub3QgeWV0IGltcGxlbWVudC5cbiAqXG4gKiBBbGwgb2YgdGhlc2UgYXJlIGhvc3Qtb3duZWQgYW5kIGNyb3NzIG5vIG1vZGVsIGJvdW5kYXJ5LlxuICovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZHRlbXBTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgUmVjb25uZWN0UmVzdWx0VHlwZSwgdHlwZSBGZXRjaFR1cm5zUmVzdWx0LCB0eXBlIEluaXRpYWxpemVSZXN1bHQsIHR5cGUgTGlzdFNlc3Npb25zUmVzdWx0LCB0eXBlIFJlY29ubmVjdFJlc3VsdCwgdHlwZSBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uU3VtbWFyeUNoYW5nZWRQYXJhbXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtcm9vdC9ub3RpZmljYXRpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgT3RscEV4cG9ydExvZ3NQYXJhbXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtb3RscC9ub3RpZmljYXRpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzLCBJQWdlbnRIb3N0TmV0d29ya0RpYWdub3N0aWNzSW5mbywgSUFnZW50SG9zdE5ldHdvcmtGZXRjaFJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBTdGF0ZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENsYWltS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZENoYXRVcmksIGJ1aWxkRGVmYXVsdENoYXRVcmksIE1lc3NhZ2VLaW5kLCBST09UX1NUQVRFX1VSSSwgU2Vzc2lvblN0YXR1cywgdHlwZSBDaGF0U3RhdGUsIHR5cGUgU2Vzc2lvblN0YXRlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlYWxTZXNzaW9uLCBkaXNwYXRjaFR1cm4sIHJlc29sdmVHaXRIdWJUb2tlbiB9IGZyb20gJy4uL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFocEVycm9yQ29kZXMsIEpzb25ScGNFcnJvckNvZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25FbnZlbG9wZSwgaXNBY3Rpb25Ob3RpZmljYXRpb24sIHR5cGUgVGVzdFByb3RvY29sQ2xpZW50IH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBjb25mb3JtYW5jZVRlc3QsIHR5cGUgSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0IH0gZnJvbSAnLi9lMmVUZXN0Q29udGV4dC5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVQcm90b2NvbENvbnRyYWN0VGVzdHMoY29udGV4dDogSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0KTogdm9pZCB7XG5cdGNvbnN0IHsgY29uZmlnLCBjcmVhdGVkU2Vzc2lvbnMsIHRlbXBEaXJzIH0gPSBjb250ZXh0O1xuXG5cdC8qKlxuXHQgKiBDbGllbnQgc2VxdWVuY2UgbnVtYmVycyBtdXN0IHN0cmljdGx5IGluY3JlYXNlIGZvciB0aGUgbGlmZXRpbWUgb2YgYVxuXHQgKiBjbGllbnQsIGFuZCB0aGUgc3VpdGUgc2hhcmVzIG9uZSBhY3Jvc3MgdGVzdHMsIHNvIHRoZXkgY2Fubm90IGJlXG5cdCAqIGhhcmQtY29kZWQgcGVyIHNjZW5hcmlvLlxuXHQgKi9cblx0bGV0IGNsaWVudFNlcSA9IDQwMDA7XG5cdGZ1bmN0aW9uIG5leHRDbGllbnRTZXEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY2xpZW50U2VxKys7XG5cdH1cblxuXHQvKiogRGlzcGF0Y2ggb24gdGhlIHNoYXJlZCBjbGllbnQgYW5kIHdhaXQgZm9yIHRoZSBzZXJ2ZXIgdG8gZWNobyBpdCBiYWNrLiAqL1xuXHRhc3luYyBmdW5jdGlvbiBkaXNwYXRjaEFuZFdhaXRPblNoYXJlZChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU3RhdGVBY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXEgPSBuZXh0Q2xpZW50U2VxKCk7XG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goeyBjaGFubmVsLCBjbGllbnRTZXE6IHNlcSwgYWN0aW9uIH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgYWN0aW9uLnR5cGUpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGFubmVsXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5vcmlnaW4/LmNsaWVudFNlcSA9PT0gc2VxLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKHByZWZpeDogc3RyaW5nKTogUHJvbWlzZTx7IHNlc3Npb25Vcmk6IHN0cmluZzsgd29ya3NwYWNlOiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksIGBhaHAtJHtwcmVmaXh9LWApKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGAke3ByZWZpeH0tJHtjb25maWcucHJvdmlkZXJ9YCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblx0XHRyZXR1cm4geyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGluaXRpYWxpemVBZGRpdGlvbmFsQ2xpZW50KHByZWZpeDogc3RyaW5nKTogUHJvbWlzZTxUZXN0UHJvdG9jb2xDbGllbnQ+IHtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCBjb250ZXh0LmNvbm5lY3RDbGllbnQoKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQ6IGAke3ByZWZpeH0tJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHR9KTtcblx0XHRyZXR1cm4gY2xpZW50O1xuXHR9XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdwaW5nIGFuc3dlcnMgd2hpbGUgdGhlIGNvbm5lY3Rpb24gaXMgbGl2ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBMaXZlbmVzcyBoYXMgbm8gcGF5bG9hZCBcdTIwMTQgdGhlIHJlc3BvbnNlIGl0c2VsZiBpcyB0aGUgc2lnbmFsLCBzbyB0aGVcblx0XHQvLyBjb250cmFjdCBpcyB0aGF0IHRoZSBjYWxsIHJlc29sdmVzIHJhdGhlciB0aGFuIHdoYXQgaXQgcmV0dXJucy5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdwaW5nJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdwaW5nIGFuc3dlcnMgYmVmb3JlIHRoZSBjbGllbnQgaW5pdGlhbGl6ZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNsaWVudC5jYWxsKCdwaW5nJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIG51bGwpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnc3Vic2NyaWJlZCBjbGllbnQgcmVjZWl2ZXMgT1RMUCBsb2cgZXhwb3J0cyBmcm9tIHRoZSByZWFsIHNlcnZlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCBjb250ZXh0LmNvbm5lY3RDbGllbnQoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY2xpZW50LmNhbGwoJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRcdGNsaWVudElkOiBgb3RscC1sb2dzLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHRcdGluaXRpYWxTdWJzY3JpcHRpb25zOiBbUk9PVF9TVEFURV9VUkldLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbCgnc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL3RyYWNlJyB9KTtcblx0XHRcdGNvbnN0IGV4cG9ydGVkID0gY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRuLm1ldGhvZCA9PT0gJ290bHAvZXhwb3J0TG9ncydcblx0XHRcdFx0JiYgKG4ucGFyYW1zIGFzIE90bHBFeHBvcnRMb2dzUGFyYW1zKS5jaGFubmVsID09PSAnYWhwLW90bHA6Ly9sb2dzL3RyYWNlJyxcblx0XHRcdFx0MzBfMDAwLFxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgY2xpZW50LmNhbGwoJ2NyZWF0ZVNlc3Npb24nLCB7IGNoYW5uZWw6ICdtaXNzaW5nLXByb3ZpZGVyOi9vdGxwJywgcHJvdmlkZXI6ICdtaXNzaW5nLXByb3ZpZGVyJyB9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gYXdhaXQgZXhwb3J0ZWQ7XG5cblx0XHRcdGFzc2VydC5vayhPYmplY3Qua2V5cygobm90aWZpY2F0aW9uLnBhcmFtcyBhcyBPdGxwRXhwb3J0TG9nc1BhcmFtcykucGF5bG9hZCkubGVuZ3RoID4gMCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdtYW5hZ2VtZW50IGRpYWdub3N0aWNzIHJlcG9ydCBwcm92aWRlcnMgYW5kIG5ldHdvcmsgZW5kcG9pbnRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGNvbnRleHQuY29ubmVjdENsaWVudCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdFx0Y2xpZW50SWQ6IGBtYW5hZ2VtZW50LWRpYWdub3N0aWNzLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgW25ldHdvcmssIG1hbmFnZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRjbGllbnQuY2FsbDxJQWdlbnRIb3N0TmV0d29ya0RpYWdub3N0aWNzSW5mbz4oJ2dldE5ldHdvcmtEaWFnbm9zdGljc0luZm8nLCB7fSksXG5cdFx0XHRcdGNsaWVudC5jYWxsPHJlYWRvbmx5IElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljc1tdPignZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MnLCB7fSksXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc1ZlcnNpb246IG5ldHdvcmsudmVyc2lvbi5sZW5ndGggPiAwLFxuXHRcdFx0XHRvczogbmV0d29yay5vcyxcblx0XHRcdFx0YXJjaDogbmV0d29yay5hcmNoLFxuXHRcdFx0XHRoYXNFbmRwb2ludHM6IG5ldHdvcmsuZW5kcG9pbnRzLmxlbmd0aCA+IDAsXG5cdFx0XHRcdGhhc1JlZmVyZW5jZVByb3ZpZGVyOiBtYW5hZ2VkLnNvbWUoZW50cnkgPT4gZW50cnkucHJvdmlkZXIgPT09IGNvbmZpZy5wcm92aWRlciksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGhhc1ZlcnNpb246IHRydWUsXG5cdFx0XHRcdG9zOiBwcm9jZXNzLnBsYXRmb3JtLFxuXHRcdFx0XHRhcmNoOiBwcm9jZXNzLmFyY2gsXG5cdFx0XHRcdGhhc0VuZHBvaW50czogdHJ1ZSxcblx0XHRcdFx0aGFzUmVmZXJlbmNlUHJvdmlkZXI6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2RpYWdub3N0aWNzIGZldGNoIHJlcG9ydHMgYSByZWZ1c2VkIGxvY2FsIGNvbm5lY3Rpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNsaWVudC5jYWxsKCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZDogYGRpYWdub3N0aWNzLWZldGNoLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2xpZW50LmNhbGw8SUFnZW50SG9zdE5ldHdvcmtGZXRjaFJlc3VsdD4oJ2RpYWdub3N0aWNzRmV0Y2gnLCB7IHVybDogJ2h0dHA6Ly8xMjcuMC4wLjE6MS8nIH0sIDMwXzAwMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR1cmw6IHJlc3VsdC51cmwsXG5cdFx0XHRcdGhhc0Vycm9yOiB0eXBlb2YgcmVzdWx0LmVycm9yID09PSAnc3RyaW5nJyAmJiByZXN1bHQuZXJyb3IubGVuZ3RoID4gMCxcblx0XHRcdFx0aGFzRHVyYXRpb246IHR5cGVvZiByZXN1bHQuZHVyYXRpb25NcyA9PT0gJ251bWJlcicsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHVybDogJ2h0dHA6Ly8xMjcuMC4wLjE6MS8nLFxuXHRcdFx0XHRoYXNFcnJvcjogdHJ1ZSxcblx0XHRcdFx0aGFzRHVyYXRpb246IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2luaXRpYWxpemUgcmVqZWN0cyBpbmNvbXBhdGlibGUgcHJvdG9jb2wgdmVyc2lvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNsaWVudC5jYWxsKCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogWyc5OTkuMC4wJ10sXG5cdFx0XHRcdGNsaWVudElkOiBgaW5jb21wYXRpYmxlLXZlcnNpb24tJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb24gfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdpbml0aWFsaXplIHJlamVjdHMgYW4gZW1wdHkgcHJvdG9jb2wgdmVyc2lvbiBsaXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGNvbnRleHQuY29ubmVjdENsaWVudCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtdLFxuXHRcdFx0XHRjbGllbnRJZDogYGVtcHR5LXZlcnNpb25zLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHR9KSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLlVuc3VwcG9ydGVkUHJvdG9jb2xWZXJzaW9uIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnaW5pdGlhbGl6ZSB3aXRob3V0IHN1YnNjcmlwdGlvbnMgcmV0dXJucyBubyBzbmFwc2hvdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluaXRpYWxpemVkID0gYXdhaXQgY2xpZW50LmNhbGw8SW5pdGlhbGl6ZVJlc3VsdD4oJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRcdGNsaWVudElkOiBgbm8taW5pdGlhbC1zdWJzY3JpcHRpb25zLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW5pdGlhbGl6ZWQuc25hcHNob3RzLCBbXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdpbml0aWFsaXplIHJlcG9ydHMgdGhlIG5lZ290aWF0ZWQgcHJvdG9jb2wgYW5kIHNlcXVlbmNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGNvbnRleHQuY29ubmVjdENsaWVudCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbml0aWFsaXplZCA9IGF3YWl0IGNsaWVudC5jYWxsPEluaXRpYWxpemVSZXN1bHQ+KCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZDogYHNlcnZlci1pZGVudGl0eS0ke2NvbmZpZy5wcm92aWRlcn1gLFxuXHRcdFx0XHRjbGllbnRJbmZvOiB7IG5hbWU6ICdhZ2VudC1ob3N0LWUyZScsIHZlcnNpb246ICcxLjAuMCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uOiBpbml0aWFsaXplZC5wcm90b2NvbFZlcnNpb24sXG5cdFx0XHRcdHNlcnZlclNlcUlzTm9uTmVnYXRpdmU6IGluaXRpYWxpemVkLnNlcnZlclNlcSA+PSAwLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwcm90b2NvbFZlcnNpb246IFBST1RPQ09MX1ZFUlNJT04sXG5cdFx0XHRcdHNlcnZlclNlcUlzTm9uTmVnYXRpdmU6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2luaXRpYWxpemUgY2Fubm90IGJlIHJlcGVhdGVkIGFmdGVyIHRoZSBoYW5kc2hha2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgaW5pdGlhbGl6ZUFkZGl0aW9uYWxDbGllbnQoJ3JlcGVhdC1pbml0aWFsaXplJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNsaWVudC5jYWxsKCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZDogYHJlcGVhdC1pbml0aWFsaXplLWFnYWluLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHR9KSwgeyBjb2RlOiBKc29uUnBjRXJyb3JDb2Rlcy5NZXRob2ROb3RGb3VuZCB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2xpc3RTZXNzaW9ucyBpbmNsdWRlcyBwcm92aWRlci1iYWNrZWQgc2Vzc2lvbiBtZXRhZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbGlzdC1zZXNzaW9uLW1ldGFkYXRhJyk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1saXN0LXNlc3Npb24tbWV0YWRhdGEnLCAnL3JlbmFtZSBMaXN0ZWQgU2Vzc2lvbicsIG5leHRDbGllbnRTZXEoKSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gJ3R1cm4tbGlzdC1zZXNzaW9uLW1ldGFkYXRhJyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxMaXN0U2Vzc2lvbnNSZXN1bHQ+KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdGNvbnN0IGl0ZW0gPSByZXN1bHQuaXRlbXMuZmluZChpdGVtID0+IGl0ZW0ucmVzb3VyY2UgPT09IHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm92aWRlcjogaXRlbT8ucHJvdmlkZXIsXG5cdFx0XHRoYXNUaXRsZTogdHlwZW9mIGl0ZW0/LnRpdGxlID09PSAnc3RyaW5nJyAmJiBpdGVtLnRpdGxlLmxlbmd0aCA+IDAsXG5cdFx0XHRzdGF0dXNJc051bWJlcjogdHlwZW9mIGl0ZW0/LnN0YXR1cyA9PT0gJ251bWJlcicsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGl0ZW0/LndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdGhhc0NyZWF0ZWRBdDogaXRlbSAhPT0gdW5kZWZpbmVkICYmIE51bWJlci5pc0Zpbml0ZShEYXRlLnBhcnNlKGl0ZW0uY3JlYXRlZEF0KSksXG5cdFx0XHRoYXNNb2RpZmllZEF0OiBpdGVtICE9PSB1bmRlZmluZWQgJiYgTnVtYmVyLmlzRmluaXRlKERhdGUucGFyc2UoaXRlbS5tb2RpZmllZEF0KSksXG5cdFx0fSwge1xuXHRcdFx0cHJvdmlkZXI6IGNvbmZpZy5wcm92aWRlcixcblx0XHRcdGhhc1RpdGxlOiB0cnVlLFxuXHRcdFx0c3RhdHVzSXNOdW1iZXI6IHRydWUsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSh3b3Jrc3BhY2UpLnRvU3RyaW5nKCldLFxuXHRcdFx0aGFzQ3JlYXRlZEF0OiB0cnVlLFxuXHRcdFx0aGFzTW9kaWZpZWRBdDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdsaXN0U2Vzc2lvbnMgcmVmbGVjdHMgbGl2ZSB0aXRsZSBhbmQgc3RhdHVzIGNoYW5nZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdsaXN0LXNlc3Npb24tbGl2ZS1zdGF0ZScpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGRpc3BhdGNoVHVybihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tbGlzdC1zZXNzaW9uLWxpdmUtc3RhdGUnLCAnL3JlbmFtZSBDYXRhbG9nIFRpdGxlJywgbmV4dENsaWVudFNlcSgpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi1saXN0LXNlc3Npb24tbGl2ZS1zdGF0ZScsXG5cdFx0KTtcblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXRPblNoYXJlZChzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQsIGlzUmVhZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXRPblNoYXJlZChzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzQXJjaGl2ZWRDaGFuZ2VkLCBpc0FyY2hpdmVkOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxMaXN0U2Vzc2lvbnNSZXN1bHQ+KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdGNvbnN0IGl0ZW0gPSByZXN1bHQuaXRlbXMuZmluZChpdGVtID0+IGl0ZW0ucmVzb3VyY2UgPT09IHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZTogaXRlbT8udGl0bGUsXG5cdFx0XHRpc1JlYWQ6ICEhKGl0ZW0/LnN0YXR1cyAmJiBpdGVtLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNSZWFkKSxcblx0XHRcdGlzQXJjaGl2ZWQ6ICEhKGl0ZW0/LnN0YXR1cyAmJiBpdGVtLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCksXG5cdFx0fSwge1xuXHRcdFx0dGl0bGU6ICdDYXRhbG9nIFRpdGxlJyxcblx0XHRcdGlzUmVhZDogdHJ1ZSxcblx0XHRcdGlzQXJjaGl2ZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGlzcG9zaW5nIGEgc2Vzc2lvbiByZW1vdmVzIGl0IGZyb20gbGlzdFNlc3Npb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbGlzdC1zZXNzaW9uLWRpc3Bvc2UnKTtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRkaXNwYXRjaFR1cm4oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWxpc3Qtc2Vzc2lvbi1kaXNwb3NlJywgJy9yZW5hbWUgRGlzcG9zYWJsZSBTZXNzaW9uJywgbmV4dENsaWVudFNlcSgpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi1saXN0LXNlc3Npb24tZGlzcG9zZScsXG5cdFx0KTtcblx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPExpc3RTZXNzaW9uc1Jlc3VsdD4oJ2xpc3RTZXNzaW9ucycsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlZm9yZS5pdGVtcy5zb21lKGl0ZW0gPT4gaXRlbS5yZXNvdXJjZSA9PT0gc2Vzc2lvblVyaSksIHRydWUpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnZGlzcG9zZVNlc3Npb24nLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0Y29uc3QgdHJhY2tlZEluZGV4ID0gY3JlYXRlZFNlc3Npb25zLmluZGV4T2Yoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKHRyYWNrZWRJbmRleCA+PSAwKSB7XG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnMuc3BsaWNlKHRyYWNrZWRJbmRleCwgMSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8TGlzdFNlc3Npb25zUmVzdWx0PignbGlzdFNlc3Npb25zJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaXRlbXMuc29tZShpdGVtID0+IGl0ZW0ucmVzb3VyY2UgPT09IHNlc3Npb25VcmkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZmV0Y2hUdXJucyBjdXJyZW50bHkgZW1pdHMgYW4gZW1wdHkgbG9hZGVkLXR1cm5zIHBhZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdmZXRjaC10dXJucycpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGF0VXJpIH0pO1xuXG5cdFx0Ly8gR2l2ZSB0aGUgY2hhdCBhIHR1cm4gdG8gcGFnZSBvdmVyLiBgL3JlbmFtZWAgaXMgaGFuZGxlZCBlbnRpcmVseSBieSB0aGVcblx0XHQvLyBob3N0J3MgbG9jYWwtY29tbWFuZCBkaXNwYXRjaGVyLCBzbyB0aGUgdHVybiBpcyByZWFsIHdpdGhvdXQgY3Jvc3Npbmdcblx0XHQvLyB0aGUgbW9kZWwgYm91bmRhcnkgYW5kIHdpdGhvdXQgZGVwZW5kaW5nIG9uIGEgc2hlbGwuXG5cdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1mZXRjaCcsICcvcmVuYW1lIEZldGNoIFR1cm5zJywgbmV4dENsaWVudFNlcSgpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi1mZXRjaCcsXG5cdFx0XHQ2MF8wMDAsXG5cdFx0KTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPEZldGNoVHVybnNSZXN1bHQ+KCdmZXRjaFR1cm5zJywgeyBjaGFubmVsOiBjaGF0VXJpIH0pO1xuXG5cdFx0Ly8gVGhlIGN1cnJlbnQgaG9zdCBpbXBsZW1lbnRhdGlvbiBhY2NlcHRzIHRoZSByZXF1ZXN0IGJ1dCBoYXMgbm8gYmFja2luZ1xuXHRcdC8vIHBhZ2VyOiBpdCBhbHdheXMgcHVibGlzaGVzIGFuIGVtcHR5IHBhZ2UsIGV2ZW4gd2hlbiB0aGUgY2hhdCBhbHJlYWR5IGhhc1xuXHRcdC8vIGxvYWRlZCB0dXJucy5cblx0XHRjb25zdCBsb2FkZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5zTG9hZGVkJykgJiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaSxcblx0XHRcdDMwXzAwMCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobG9hZGVkKS5hY3Rpb24gYXMgeyByZWFkb25seSB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuc0xvYWRlZDsgcmVhZG9ubHkgdHVybnM6IHJlYWRvbmx5IFR1cm5bXSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0LFxuXHRcdFx0YWN0aW9uLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDoge30sXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybnNMb2FkZWQsXG5cdFx0XHRcdHR1cm5zOiBbXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZmV0Y2hUdXJucyByZWplY3RzIGEgY3Vyc29yIHRoZSBob3N0IGRpZCBub3QgaXNzdWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdmZXRjaC10dXJucy1jdXJzb3InKTtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhdFVyaSB9KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ2ZldGNoVHVybnMnLCB7XG5cdFx0XHRjaGFubmVsOiBjaGF0VXJpLFxuXHRcdFx0Y3Vyc29yOiAnbm90LWEtaG9zdC1jdXJzb3InLFxuXHRcdH0pLCB7IGNvZGU6IEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZmV0Y2hUdXJucyByZWplY3RzIGFuIHVua25vd24gY2hhdCBjaGFubmVsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZmV0Y2gtdHVybnMtbWlzc2luZycpO1xuXHRcdGNvbnN0IG1pc3NpbmdDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdtaXNzaW5nJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdmZXRjaFR1cm5zJywge1xuXHRcdFx0Y2hhbm5lbDogbWlzc2luZ0NoYXQsXG5cdFx0fSkpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2luaXRpYWxpemUgcmV0dXJucyBzbmFwc2hvdHMgZm9yIGluaXRpYWwgc3Vic2NyaXB0aW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2luaXRpYWwtc3Vic2NyaXB0aW9ucycpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGNvbnRleHQuY29ubmVjdENsaWVudCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbml0aWFsaXplZCA9IGF3YWl0IGNsaWVudC5jYWxsPEluaXRpYWxpemVSZXN1bHQ+KCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZDogYGluaXRpYWwtc3Vic2NyaXB0aW9ucy0ke2NvbmZpZy5wcm92aWRlcn1gLFxuXHRcdFx0XHRpbml0aWFsU3Vic2NyaXB0aW9uczogW3Nlc3Npb25VcmksIGNoYXRVcmldLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW5pdGlhbGl6ZWQuc25hcHNob3RzLm1hcChzbmFwc2hvdCA9PiBzbmFwc2hvdC5yZXNvdXJjZSkuc29ydCgpLCBbc2Vzc2lvblVyaSwgY2hhdFVyaV0uc29ydCgpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2Egc2Vzc2lvbiBhY3Rpb24gaXMgYnJvYWRjYXN0IHRvIGV2ZXJ5IHN1YnNjcmliZWQgY2xpZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbXVsdGktY2xpZW50LXNlc3Npb24tYWN0aW9uJyk7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgaW5pdGlhbGl6ZUFkZGl0aW9uYWxDbGllbnQoJ211bHRpLWNsaWVudC1zZXNzaW9uLWFjdGlvbicpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0XHRjbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdFx0Y29uc3Qgc2VxdWVuY2UgPSBuZXh0Q2xpZW50U2VxKCk7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRcdGNsaWVudFNlcTogc2VxdWVuY2UsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnU2hhcmVkIFRpdGxlJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG9ic2VydmVkID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi90aXRsZUNoYW5nZWQnKVxuXHRcdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBzZXNzaW9uVXJpLFxuXHRcdFx0XHQzMF8wMDAsXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0aXRsZTogKGdldEFjdGlvbkVudmVsb3BlKG9ic2VydmVkKS5hY3Rpb24gYXMgeyByZWFkb25seSB0aXRsZTogc3RyaW5nIH0pLnRpdGxlLFxuXHRcdFx0XHRvcmlnaW5DbGllbnRTZXE6IGdldEFjdGlvbkVudmVsb3BlKG9ic2VydmVkKS5vcmlnaW4/LmNsaWVudFNlcSxcblx0XHRcdFx0c25hcHNob3RUaXRsZTogKHN0YXRlLnNuYXBzaG90IS5zdGF0ZSBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0aXRsZTogJ1NoYXJlZCBUaXRsZScsXG5cdFx0XHRcdG9yaWdpbkNsaWVudFNlcTogc2VxdWVuY2UsXG5cdFx0XHRcdHNuYXBzaG90VGl0bGU6ICdTaGFyZWQgVGl0bGUnLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gRGlzYWJsZWQgdmFyaWFudHMgZG9jdW1lbnQgbWlzc2luZyBtdWx0aS1jbGllbnQgY2hhbm5lbCBpc29sYXRpb247IHNlZSBLTk9XTl9JU1NVRVMubWQuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSBjaGF0IGFjdGlvbiBpcyBicm9hZGNhc3QgdG8gZXZlcnkgc3Vic2NyaWJlZCBjbGllbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdtdWx0aS1jbGllbnQtY2hhdC1hY3Rpb24nKTtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCBpbml0aWFsaXplQWRkaXRpb25hbENsaWVudCgnbXVsdGktY2xpZW50LWNoYXQtYWN0aW9uJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhdFVyaSB9KTtcblx0XHRcdGNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0XHRjb25zdCBkcmFmdCA9IHsgdGV4dDogJ3NoYXJlZCBkcmFmdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIGFzIGNvbnN0IH0gfTtcblx0XHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdE9uU2hhcmVkKGNoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkLCBkcmFmdCB9KTtcblx0XHRcdGNvbnN0IG9ic2VydmVkID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9kcmFmdENoYW5nZWQnKVxuXHRcdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpLFxuXHRcdFx0XHQzMF8wMDAsXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXRVcmkgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRhY3Rpb25EcmFmdDogKGdldEFjdGlvbkVudmVsb3BlKG9ic2VydmVkKS5hY3Rpb24gYXMgeyByZWFkb25seSBkcmFmdD86IG9iamVjdCB9KS5kcmFmdCxcblx0XHRcdFx0c25hcHNob3REcmFmdDogKHN0YXRlLnNuYXBzaG90IS5zdGF0ZSBhcyBDaGF0U3RhdGUpLmRyYWZ0LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhY3Rpb25EcmFmdDogZHJhZnQsXG5cdFx0XHRcdHNuYXBzaG90RHJhZnQ6IGRyYWZ0LFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSwgZmFsc2UpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYW4gdW5zdWJzY3JpYmVkIGNsaWVudCBzdG9wcyByZWNlaXZpbmcgY2hhbm5lbCBhY3Rpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbXVsdGktY2xpZW50LXVuc3Vic2NyaWJlJyk7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgaW5pdGlhbGl6ZUFkZGl0aW9uYWxDbGllbnQoJ211bHRpLWNsaWVudC11bnN1YnNjcmliZScpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0XHRjbGllbnQubm90aWZ5KCd1bnN1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHRcdGF3YWl0IGNsaWVudC5jYWxsKCdwaW5nJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRcdGNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cblx0XHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdE9uU2hhcmVkKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ0FmdGVyIFVuc3Vic2NyaWJlJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Nlc3Npb24vdGl0bGVDaGFuZ2VkJylcblx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gc2Vzc2lvblVyaSxcblx0XHRcdCksIFtdKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9LCBmYWxzZSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdpbml0aWFsIHN1YnNjcmlwdGlvbnMgaW5jbHVkZSBjdXJyZW50IHNlc3Npb24gYW5kIGNoYXQgc3RhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdtdWx0aS1jbGllbnQtaW5pdGlhbC1zdGF0ZScpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGRyYWZ0ID0geyB0ZXh0OiAnaW5pdGlhbCBzbmFwc2hvdCBkcmFmdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIGFzIGNvbnN0IH0gfTtcblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXRPblNoYXJlZChzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdJbml0aWFsIFNuYXBzaG90IFRpdGxlJyB9KTtcblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXRPblNoYXJlZChjaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCwgZHJhZnQgfSk7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluaXRpYWxpemVkID0gYXdhaXQgY2xpZW50LmNhbGw8SW5pdGlhbGl6ZVJlc3VsdD4oJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRcdGNsaWVudElkOiBgbXVsdGktY2xpZW50LWluaXRpYWwtc3RhdGUtJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHRcdFx0aW5pdGlhbFN1YnNjcmlwdGlvbnM6IFtzZXNzaW9uVXJpLCBjaGF0VXJpXSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGluaXRpYWxpemVkLnNuYXBzaG90cy5maW5kKHNuYXBzaG90ID0+IHNuYXBzaG90LnJlc291cmNlID09PSBzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IGNoYXQgPSBpbml0aWFsaXplZC5zbmFwc2hvdHMuZmluZChzbmFwc2hvdCA9PiBzbmFwc2hvdC5yZXNvdXJjZSA9PT0gY2hhdFVyaSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0aXRsZTogKHNlc3Npb24/LnN0YXRlIGFzIFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZCk/LnRpdGxlLFxuXHRcdFx0XHRkcmFmdDogKGNoYXQ/LnN0YXRlIGFzIENoYXRTdGF0ZSB8IHVuZGVmaW5lZCk/LmRyYWZ0LFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0aXRsZTogJ0luaXRpYWwgU25hcHNob3QgVGl0bGUnLFxuXHRcdFx0XHRkcmFmdCxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAndGVybWluYWwgb3V0cHV0IGlzIHN0cmVhbWVkIHRvIGV2ZXJ5IHN1YnNjcmliZWQgY2xpZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdtdWx0aS1jbGllbnQtdGVybWluYWwnKTtcblx0XHRjb25zdCB0ZXJtaW5hbFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnRob3N0LXRlcm1pbmFsJywgYXV0aG9yaXR5OiAnZTJlJywgcGF0aDogYC8ke3Nlc3Npb25Vcmkuc3BsaXQoJy8nKS5hdCgtMSl9YCB9KS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGluaXRpYWxpemVBZGRpdGlvbmFsQ2xpZW50KCdtdWx0aS1jbGllbnQtdGVybWluYWwnKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlVGVybWluYWwnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IHRlcm1pbmFsVXJpLFxuXHRcdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5TZXNzaW9uLCBzZXNzaW9uOiBzZXNzaW9uVXJpIH0sXG5cdFx0XHRcdG5hbWU6ICdNdWx0aS1jbGllbnQgVGVybWluYWwnLFxuXHRcdFx0XHRjd2Q6IFVSSS5maWxlKHdvcmtzcGFjZSkudG9TdHJpbmcoKSxcblx0XHRcdFx0Y29sczogOTAsXG5cdFx0XHRcdHJvd3M6IDMwLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogdGVybWluYWxVcmkgfSk7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHRlcm1pbmFsVXJpIH0pO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdFx0Y2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0Y2hhbm5lbDogdGVybWluYWxVcmksXG5cdFx0XHRcdGNsaWVudFNlcTogbmV4dENsaWVudFNlcSgpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbElucHV0LCBkYXRhOiAnbm9kZSAtcCBcIlxcJ01VTFRJX0NMSUVOVF9PVVRQVVRcXCdcIlxccicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3luYyBmdW5jdGlvbiB3YWl0Rm9yTWFya2VyKHRhcmdldDogVGVzdFByb3RvY29sQ2xpZW50KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRcdFx0bGV0IG91dHB1dCA9ICcnO1xuXHRcdFx0XHRhd2FpdCB0YXJnZXQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICd0ZXJtaW5hbC9kYXRhJykgfHwgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCAhPT0gdGVybWluYWxVcmkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b3V0cHV0ICs9IChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyByZWFkb25seSBkYXRhOiBzdHJpbmcgfSkuZGF0YTtcblx0XHRcdFx0XHRyZXR1cm4gb3V0cHV0LmluY2x1ZGVzKCdNVUxUSV9DTElFTlRfT1VUUFVUJyk7XG5cdFx0XHRcdH0sIDMwXzAwMCk7XG5cdFx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IFtzaGFyZWRPdXRwdXQsIGFkZGl0aW9uYWxPdXRwdXRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3dhaXRGb3JNYXJrZXIoY29udGV4dC5jbGllbnQpLCB3YWl0Rm9yTWFya2VyKGNsaWVudCldKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzaGFyZWQ6IHNoYXJlZE91dHB1dC5pbmNsdWRlcygnTVVMVElfQ0xJRU5UX09VVFBVVCcpLFxuXHRcdFx0XHRhZGRpdGlvbmFsOiBhZGRpdGlvbmFsT3V0cHV0LmluY2x1ZGVzKCdNVUxUSV9DTElFTlRfT1VUUFVUJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNoYXJlZDogdHJ1ZSxcblx0XHRcdFx0YWRkaXRpb25hbDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdkaXNwb3NlVGVybWluYWwnLCB7IGNoYW5uZWw6IHRlcm1pbmFsVXJpIH0pO1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9LCBmYWxzZSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdzZXNzaW9uIGRpc3Bvc2FsIGludmFsaWRhdGVzIGFub3RoZXIgY2xpZW50IHN1YnNjcmlwdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ211bHRpLWNsaWVudC1kaXNwb3NlJyk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgaW5pdGlhbGl6ZUFkZGl0aW9uYWxDbGllbnQoJ211bHRpLWNsaWVudC1kaXNwb3NlJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHRcdGF3YWl0IGNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhdFVyaSB9KTtcblxuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnZGlzcG9zZVNlc3Npb24nLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0XHRjb25zdCBpbmRleCA9IGNyZWF0ZWRTZXNzaW9ucy5pbmRleE9mKHNlc3Npb25VcmkpO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0Y3JlYXRlZFNlc3Npb25zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KSk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXRVcmkgfSkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncm9vdCBzZXNzaW9uIHN1bW1hcmllcyBhcmUgYnJvYWRjYXN0IHRvIGV2ZXJ5IHN1YnNjcmliZWQgY2xpZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbXVsdGktY2xpZW50LXJvb3Qtc3VtbWFyeScpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGluaXRpYWxpemVBZGRpdGlvbmFsQ2xpZW50KCdtdWx0aS1jbGllbnQtcm9vdC1zdW1tYXJ5Jyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cdFx0XHRjbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0T25TaGFyZWQoc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnQnJvYWRjYXN0IFN1bW1hcnknIH0pO1xuXG5cdFx0XHRjb25zdCBvYnNlcnZlZCA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0bi5tZXRob2QgPT09ICdyb290L3Nlc3Npb25TdW1tYXJ5Q2hhbmdlZCdcblx0XHRcdFx0JiYgKG4ucGFyYW1zIGFzIFNlc3Npb25TdW1tYXJ5Q2hhbmdlZFBhcmFtcykuc2Vzc2lvbiA9PT0gc2Vzc2lvblVyaSxcblx0XHRcdFx0MzBfMDAwLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChvYnNlcnZlZC5wYXJhbXMgYXMgU2Vzc2lvblN1bW1hcnlDaGFuZ2VkUGFyYW1zKS5jaGFuZ2VzLnRpdGxlLCAnQnJvYWRjYXN0IFN1bW1hcnknKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9LCBmYWxzZSk7XG5cblx0LyoqXG5cdCAqIFJ1bnMgYGJvZHlgIGFnYWluc3QgYSBzZWNvbmQgY29ubmVjdGlvbiB0aGF0IGhhcyBjb21wbGV0ZWQgdGhlIGhhbmRzaGFrZVxuXHQgKiB1bmRlciBpdHMgb3duIGNsaWVudElkLCB0aGVuIGRyb3BzIHRoYXQgY29ubmVjdGlvbiBhbmQgaGFuZHMgYmFjayBhIGZyZXNoXG5cdCAqIHVuLWhhbmRzaGFrZWQgb25lLiBgcmVjb25uZWN0YCBpcyBvbmx5IGFuc3dlcmFibGUgcHJlLWhhbmRzaGFrZSwgc29cblx0ICogcmVjb3ZlcnkgY2Fubm90IGJlIGV4ZXJjaXNlZCBvbiB0aGUgc2hhcmVkIGNsaWVudC5cblx0ICovXG5cdGFzeW5jIGZ1bmN0aW9uIGFmdGVyQ29ubmVjdGlvbkRyb3A8VD4oXG5cdFx0Y2xpZW50SWQ6IHN0cmluZyxcblx0XHRib2R5OiAoY2xpZW50OiBUZXN0UHJvdG9jb2xDbGllbnQpID0+IFByb21pc2U8VD4sXG5cdCk6IFByb21pc2U8eyBjYXJyaWVkOiBUOyByZXZpdmVkOiBUZXN0UHJvdG9jb2xDbGllbnQgfT4ge1xuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0bGV0IGNhcnJpZWQ6IFQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZpcnN0LmNhbGwoJ2luaXRpYWxpemUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCBwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sIGNsaWVudElkIH0pO1xuXHRcdFx0Y2FycmllZCA9IGF3YWl0IGJvZHkoZmlyc3QpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmaXJzdC5jbG9zZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBjYXJyaWVkLCByZXZpdmVkOiBhd2FpdCBjb250ZXh0LmNvbm5lY3RDbGllbnQoKSB9O1xuXHR9XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZWNvbm5lY3QgcmVwbGF5cyBvbmx5IHRoZSBhY3Rpb25zIGEgZHJvcHBlZCBjbGllbnQgbWlzc2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVjb25uZWN0Jyk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgZHJvcHBlZENsaWVudElkID0gYHJlY29ubmVjdC1kcm9wcGVkLSR7Y29uZmlnLnByb3ZpZGVyfWA7XG5cblx0XHQvLyBUaGUgY3V0b2ZmIGNvbWVzIGZyb20gdGhlIHN1YnNjcmliZSByZXNwb25zZSByYXRoZXIgdGhhbiBmcm9tIHdhdGNoaW5nXG5cdFx0Ly8gdGhpcyBjbGllbnQgcmVjZWl2ZSBpdHMgb3duIGRpc3BhdGNoOiBhIHN1YnNjcmlwdGlvbiBpcyBub3QgZ3VhcmFudGVlZFxuXHRcdC8vIHRvIGJlIGluc3RhbGxlZCBiZWZvcmUgYSBkaXNwYXRjaCBzZW50IGltbWVkaWF0ZWx5IGFmdGVyIGl0IGlzIGhhbmRsZWQsXG5cdFx0Ly8gc28gd2FpdGluZyBmb3IgdGhhdCBlY2hvIHJhY2VzLiBgZnJvbVNlcWAgaXMgdGhlIHNhbWUgYm91bmRhcnkgYW5kIHRoZVxuXHRcdC8vIHJlc3BvbnNlIGl0c2VsZiBndWFyYW50ZWVzIGl0LlxuXHRcdGNvbnN0IHsgY2FycmllZDogc2VlblRocm91Z2gsIHJldml2ZWQgfSA9IGF3YWl0IGFmdGVyQ29ubmVjdGlvbkRyb3AoZHJvcHBlZENsaWVudElkLCBhc3luYyBmaXJzdCA9PiB7XG5cdFx0XHRjb25zdCBzdWJzY3JpYmVkID0gYXdhaXQgZmlyc3QuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXRVcmkgfSk7XG5cdFx0XHRyZXR1cm4gc3Vic2NyaWJlZC5zbmFwc2hvdCEuZnJvbVNlcTtcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBQcm9kdWNlZCB3aGlsZSBub2JvZHkgd2FzIGxpc3RlbmluZyBvbiB0aGF0IGNsaWVudElkLCBzbyBpdCBjYW4gb25seVxuXHRcdFx0Ly8gcmVhY2ggdGhlIGNsaWVudCB0aHJvdWdoIHJlcGxheS5cblx0XHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdE9uU2hhcmVkKGNoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkLCBkcmFmdDogeyB0ZXh0OiAnbWlzc2VkIHdoaWxlIGRpc2Nvbm5lY3RlZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmV2aXZlZC5jYWxsPFJlY29ubmVjdFJlc3VsdD4oJ3JlY29ubmVjdCcsIHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdGNsaWVudElkOiBkcm9wcGVkQ2xpZW50SWQsXG5cdFx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiBzZWVuVGhyb3VnaCxcblx0XHRcdFx0c3Vic2NyaXB0aW9uczogW2NoYXRVcmldLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEEgY2xpZW50IHRoYXQgcmVjb25uZWN0cyBpbnNpZGUgdGhlIHJlcGxheSB3aW5kb3cgbXVzdCBiZSBhYmxlIHRvXG5cdFx0XHQvLyBjYXRjaCB1cCBieSBhcHBseWluZyBhY3Rpb25zIHJhdGhlciB0aGFuIGRpc2NhcmRpbmcgbG9jYWwgc3RhdGUgZm9yXG5cdFx0XHQvLyBhIGZyZXNoIHNuYXBzaG90LCBzbyB0aGUgY3V0b2ZmIGhhcyB0byBiZSBleGNsdXNpdmUgYW5kIGV4YWN0LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHR5cGU6IHJlc3VsdC50eXBlLFxuXHRcdFx0XHRyZXBsYXllZEFscmVhZHlTZWVuOiByZXN1bHQudHlwZSA9PT0gUmVjb25uZWN0UmVzdWx0VHlwZS5SZXBsYXlcblx0XHRcdFx0XHQmJiByZXN1bHQuYWN0aW9ucy5zb21lKGVudmVsb3BlID0+IGVudmVsb3BlLnNlcnZlclNlcSA8PSBzZWVuVGhyb3VnaCksXG5cdFx0XHRcdHJlcGxheWVkVGhlR2FwOiByZXN1bHQudHlwZSA9PT0gUmVjb25uZWN0UmVzdWx0VHlwZS5SZXBsYXlcblx0XHRcdFx0XHQmJiByZXN1bHQuYWN0aW9ucy5zb21lKGVudmVsb3BlID0+IGVudmVsb3BlLnNlcnZlclNlcSA+IHNlZW5UaHJvdWdoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dHlwZTogUmVjb25uZWN0UmVzdWx0VHlwZS5SZXBsYXksXG5cdFx0XHRcdHJlcGxheWVkQWxyZWFkeVNlZW46IGZhbHNlLFxuXHRcdFx0XHRyZXBsYXllZFRoZUdhcDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXZpdmVkLmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3JlY29ubmVjdCByZXBvcnRzIGEgc3Vic2NyaXB0aW9uIGl0IGNhbm5vdCByZXN1bWUgYXMgbWlzc2luZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3JlY29ubmVjdC1taXNzaW5nJyk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgZHJvcHBlZENsaWVudElkID0gYHJlY29ubmVjdC1taXNzaW5nLWRyb3BwZWQtJHtjb25maWcucHJvdmlkZXJ9YDtcblx0XHQvLyBBIGNoYW5uZWwgdGhhdCBuZXZlciBleGlzdGVkIHN0YW5kcyBpbiBmb3Igb25lIGRpc3Bvc2VkIHdoaWxlIHRoZSBjbGllbnRcblx0XHQvLyB3YXMgYXdheTogZWl0aGVyIHdheSB0aGUgc2VydmVyIGNhbm5vdCByZXN1bWUgaXQsIGFuZCB0aGUgY2xpZW50IGhhcyB0b1xuXHRcdC8vIGJlIHRvbGQgcmF0aGVyIHRoYW4gbGVmdCB3YWl0aW5nIG9uIGEgZGVhZCBjaGFubmVsLlxuXHRcdGNvbnN0IGdvbmVVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50aG9zdC10ZXJtaW5hbCcsIGF1dGhvcml0eTogJ2UyZScsIHBhdGg6ICcvbmV2ZXItZXhpc3RlZCcgfSkudG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IHsgY2FycmllZDogc2VlblRocm91Z2gsIHJldml2ZWQgfSA9IGF3YWl0IGFmdGVyQ29ubmVjdGlvbkRyb3AoZHJvcHBlZENsaWVudElkLCBhc3luYyBmaXJzdCA9PiB7XG5cdFx0XHRjb25zdCBzdWJzY3JpYmVkID0gYXdhaXQgZmlyc3QuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXRVcmkgfSk7XG5cdFx0XHRyZXR1cm4gc3Vic2NyaWJlZC5zbmFwc2hvdCEuZnJvbVNlcTtcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXZpdmVkLmNhbGw8UmVjb25uZWN0UmVzdWx0PigncmVjb25uZWN0Jywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0Y2xpZW50SWQ6IGRyb3BwZWRDbGllbnRJZCxcblx0XHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IHNlZW5UaHJvdWdoLFxuXHRcdFx0XHRzdWJzY3JpcHRpb25zOiBbY2hhdFVyaSwgZ29uZVVyaV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHR5cGU6IHJlc3VsdC50eXBlLFxuXHRcdFx0XHRtaXNzaW5nOiByZXN1bHQudHlwZSA9PT0gUmVjb25uZWN0UmVzdWx0VHlwZS5SZXBsYXkgPyByZXN1bHQubWlzc2luZyA6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0dHlwZTogUmVjb25uZWN0UmVzdWx0VHlwZS5SZXBsYXksXG5cdFx0XHRcdG1pc3Npbmc6IFtnb25lVXJpXSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXZpdmVkLmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlIHJlcXVlc3RzIGJlZm9yZSBpbml0aWFsaXplIGFyZSByZWplY3RlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCBjb250ZXh0LmNvbm5lY3RDbGllbnQoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY2xpZW50LmNhbGwoJ3Jlc291cmNlUmVzb2x2ZScsIHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUodG1wZGlyKCkpLnRvU3RyaW5nKCksXG5cdFx0XHR9KSwgeyBjb2RlOiBKc29uUnBjRXJyb3JDb2Rlcy5NZXRob2ROb3RGb3VuZCB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Vua25vd24gcmVxdWVzdHMgYWZ0ZXIgaW5pdGlhbGl6ZSBhcmUgcmVqZWN0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgaW5pdGlhbGl6ZUFkZGl0aW9uYWxDbGllbnQoJ3Vua25vd24tcmVxdWVzdCcpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjbGllbnQuY2FsbCgnYWdlbnRIb3N0RTJFL3Vua25vd25SZXF1ZXN0Jywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdH0pLCB7IGNvZGU6IEpzb25ScGNFcnJvckNvZGVzLk1ldGhvZE5vdEZvdW5kIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVjb25uZWN0IHJlamVjdHMgYW4gdW5rbm93biBjbGllbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNsaWVudC5jYWxsKCdyZWNvbm5lY3QnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRjbGllbnRJZDogYHVua25vd24tcmVjb25uZWN0LSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiAwLFxuXHRcdFx0XHRzdWJzY3JpcHRpb25zOiBbXSxcblx0XHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjcmVhdGluZyBhIHNlc3Npb24gd2l0aCBhbiB1bmtub3duIHByb3ZpZGVyIGlzIHJlamVjdGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGluaXRpYWxpemVBZGRpdGlvbmFsQ2xpZW50KCd1bmtub3duLXByb3ZpZGVyJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNsaWVudC5jYWxsKCdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0XHRjaGFubmVsOiAnbWlzc2luZy1wcm92aWRlcjovc2Vzc2lvbicsXG5cdFx0XHRcdHByb3ZpZGVyOiAnbWlzc2luZy1wcm92aWRlcicsXG5cdFx0XHR9KSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLlByb3ZpZGVyTm90Rm91bmQgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjcmVhdGluZyBhIGR1cGxpY2F0ZSBzZXNzaW9uIHJlc291cmNlIGlzIHJlamVjdGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdkdXBsaWNhdGUtc2Vzc2lvbicpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRwcm92aWRlcjogY29uZmlnLnByb3ZpZGVyLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUod29ya3NwYWNlKS50b1N0cmluZygpXSxcblx0XHRcdGNvbmZpZzogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0fSksIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5TZXNzaW9uQWxyZWFkeUV4aXN0cyB9KTtcblx0fSwgY29udGV4dC5ydW5Ib3N0T25seUtub3duSXNzdWVUZXN0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhIHNlc3Npb24gY2Fubm90IGZvcmsgb250byBpdHMgb3duIHJlc291cmNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignc2VsZi1mb3JrJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdHByb3ZpZGVyOiBjb25maWcucHJvdmlkZXIsXG5cdFx0XHRmb3JrOiB7IHNlc3Npb246IHNlc3Npb25VcmksIHR1cm5JZDogJ2lycmVsZXZhbnQnIH0sXG5cdFx0fSksIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5TZXNzaW9uQWxyZWFkeUV4aXN0cyB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdmb3JraW5nIGZyb20gYSBtaXNzaW5nIHNlc3Npb24gaXMgcmVqZWN0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZyb20oeyBzY2hlbWU6IGNvbmZpZy5zY2hlbWUsIHBhdGg6IGAvJHtnZW5lcmF0ZVV1aWQoKX1gIH0pLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgbWlzc2luZ1NvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBjb25maWcuc2NoZW1lLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdGNsaWVudElkOiBgbWlzc2luZy1mb3JrLXNvdXJjZS0ke2NvbmZpZy5wcm92aWRlcn1gLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdGNoYW5uZWw6IHRhcmdldCxcblx0XHRcdHByb3ZpZGVyOiBjb25maWcucHJvdmlkZXIsXG5cdFx0XHRmb3JrOiB7IHNlc3Npb246IG1pc3NpbmdTb3VyY2UsIHR1cm5JZDogJ21pc3NpbmctdHVybicgfSxcblx0XHR9KSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLlNlc3Npb25Ob3RGb3VuZCB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjcmVhdGVTZXNzaW9uIHJlamVjdHMgYW4gYWN0aXZlIGNsaWVudCBvd25lZCBieSBhbm90aGVyIGNvbm5lY3Rpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNsaWVudC5jYWxsKCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZDogYGFjdGl2ZS1jbGllbnQtb3duZXItJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY2xpZW50LmNhbGwoJ2NyZWF0ZVNlc3Npb24nLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFVSSS5mcm9tKHsgc2NoZW1lOiBjb25maWcuc2NoZW1lLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogY29uZmlnLnByb3ZpZGVyLFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHsgY2xpZW50SWQ6ICdkaWZmZXJlbnQtY2xpZW50JywgZGlzcGxheU5hbWU6ICdEaWZmZXJlbnQgQ2xpZW50JywgdG9vbHM6IFtdIH0sXG5cdFx0XHR9KSwgeyBjb2RlOiBKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY3JlYXRlU2Vzc2lvbiBzZWVkcyBhIG1hdGNoaW5nIGFjdGl2ZSBjbGllbnQgaW50byBzZXNzaW9uIHN0YXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtYWN0aXZlLWNsaWVudC1jcmVhdGUtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRjb25zdCBjbGllbnRJZCA9IGBhY3RpdmUtY2xpZW50LWNyZWF0ZS0ke2NvbmZpZy5wcm92aWRlcn1gO1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGNvbnRleHQuY29ubmVjdENsaWVudCgpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogY29uZmlnLnNjaGVtZSwgcGF0aDogYC8ke2dlbmVyYXRlVXVpZCgpfWAgfSkudG9TdHJpbmcoKTtcblx0XHRsZXQgY3JlYXRlZCA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdFx0Y2xpZW50SWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGNsaWVudC5jYWxsKCdhdXRoZW50aWNhdGUnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLFxuXHRcdFx0XHR0b2tlbjogY29uZmlnLmdpdGh1YlRva2VuID8/IHJlc29sdmVHaXRIdWJUb2tlbigpLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdFx0cHJvdmlkZXI6IGNvbmZpZy5wcm92aWRlcixcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUod29ya3NwYWNlKS50b1N0cmluZygpXSxcblx0XHRcdFx0Y29uZmlnOiB7IGlzb2xhdGlvbjogJ2ZvbGRlcicgfSxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7IGNsaWVudElkLCBkaXNwbGF5TmFtZTogJ0NyZWF0aW5nIENsaWVudCcsIHRvb2xzOiBbXSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjcmVhdGVkID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3Qgc3Vic2NyaWJlZCA9IGF3YWl0IGNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3Vic2NyaWJlZC5zbmFwc2hvdCEuc3RhdGUgYXMgU2Vzc2lvblN0YXRlO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5hY3RpdmVDbGllbnRzLCBbe1xuXHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdDcmVhdGluZyBDbGllbnQnLFxuXHRcdFx0XHR0b29sczogW10sXG5cdFx0XHR9XSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChjcmVhdGVkKSB7XG5cdFx0XHRcdGF3YWl0IGNsaWVudC5jYWxsKCdkaXNwb3NlU2Vzc2lvbicsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHRcdH1cblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjcmVhdGluZyBhIGNoYXQgZm9yIGEgbWlzc2luZyBzZXNzaW9uIGlzIHJlamVjdGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGluaXRpYWxpemVBZGRpdGlvbmFsQ2xpZW50KCdtaXNzaW5nLWNoYXQtc2Vzc2lvbicpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogY29uZmlnLnNjaGVtZSwgcGF0aDogJy9taXNzaW5nLWNoYXQtc2Vzc2lvbicgfSkudG9TdHJpbmcoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY2xpZW50LmNhbGwoJ2NyZWF0ZUNoYXQnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRcdGNoYXQ6IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlcicpLFxuXHRcdFx0fSksIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5TZXNzaW9uTm90Rm91bmQgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdzdWJzY3JpYmluZyB0d2ljZSBkb2VzIG5vdCBkdXBsaWNhdGUgYWN0aW9uIGRlbGl2ZXJ5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZHVwbGljYXRlLXN1YnNjcmlwdGlvbicpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGF0VXJpIH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGF0VXJpIH0pO1xuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblxuXHRcdGNvbnN0IGNsaWVudFNlcSA9IG5leHRDbGllbnRTZXEoKTtcblx0XHRjb25zdCBhY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCwgZHJhZnQ6IHsgdGV4dDogJ3NpbmdsZSBkZWxpdmVyeScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSB9IGFzIGNvbnN0O1xuXHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHsgY2hhbm5lbDogY2hhdFVyaSwgY2xpZW50U2VxLCBhY3Rpb24gfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCBhY3Rpb24udHlwZSlcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLm9yaWdpbj8uY2xpZW50U2VxID09PSBjbGllbnRTZXEsXG5cdFx0KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdwaW5nJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRjb25zdCBkZWxpdmVyaWVzID0gY29udGV4dC5jbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sIGFjdGlvbi50eXBlKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikub3JpZ2luPy5jbGllbnRTZXEgPT09IGNsaWVudFNlcSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGl2ZXJpZXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXN1YnNjcmliaW5nIHJlY2VpdmVzIHN0YXRlIGNoYW5nZWQgd2hpbGUgdW5zdWJzY3JpYmVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVzdWJzY3JpYmUtc25hcHNob3QnKTtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRjb250ZXh0LmNsaWVudC5ub3RpZnkoJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGF0VXJpIH0pO1xuXHRcdGNvbnN0IGNsaWVudFNlcSA9IG5leHRDbGllbnRTZXEoKTtcblx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBjaGF0VXJpLFxuXHRcdFx0Y2xpZW50U2VxLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCxcblx0XHRcdFx0ZHJhZnQ6IHsgdGV4dDogJ2NoYW5nZWQgd2hpbGUgdW5zdWJzY3JpYmVkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdwaW5nJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblxuXHRcdGNvbnN0IHN1YnNjcmliZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhdFVyaSB9KTtcblx0XHRjb25zdCBzdGF0ZSA9IHN1YnNjcmliZWQuc25hcHNob3QhLnN0YXRlIGFzIENoYXRTdGF0ZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5kcmFmdD8udGV4dCwgJ2NoYW5nZWQgd2hpbGUgdW5zdWJzY3JpYmVkJyk7XG5cdH0pO1xuXG5cdC8vIFRoZSBwcm90b2NvbCBkZWNsYXJlcyB3b3JraW5nLWRpcmVjdG9yeSBtdXRhdGlvbiBvbiBib3RoIHRoZSBzZXNzaW9uIGFuZFxuXHQvLyBjaGF0IGNoYW5uZWxzLCBidXQgdGhlIGhvc3QgcmVqZWN0cyBhbGwgZm91cjogYXBwbHlpbmcgb25lIHdvdWxkIGNoYW5nZVxuXHQvLyB0aGUgc3luY2hyb25pemVkIGRpcmVjdG9yeSBzZXQgd2l0aG91dCByZWNvbmZpZ3VyaW5nIHRoZSBhZ2VudCdzIGFjdHVhbFxuXHQvLyBhY2Nlc3MuIEVhY2ggaXMgYW5zd2VyZWQgdGhyb3VnaCB0aGUgbm9ybWFsIHJlY29uY2lsaWF0aW9uIHBhdGggc28gdGhlXG5cdC8vIGNsaWVudCBjYW4gcm9sbCBiYWNrIGl0cyBvcHRpbWlzdGljIHdyaXRlLWFoZWFkIGFjdGlvbiBpbnN0ZWFkIG9mIGxlYXZpbmdcblx0Ly8gaXQgcGVuZGluZyB1bnRpbCByZWNvbm5lY3QuXG5cdGNvbnN0IHVuc3VwcG9ydGVkV29ya2luZ0RpcmVjdG9yeUFjdGlvbnMgPSBbXG5cdFx0eyBub3RpZmljYXRpb246ICdzZXNzaW9uL3dvcmtpbmdEaXJlY3RvcnlTZXQnLCBjaGFubmVsOiAnc2Vzc2lvbicsIGJ1aWxkOiAoZGlyZWN0b3J5OiBzdHJpbmcpOiBTdGF0ZUFjdGlvbiA9PiAoeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3RvcnkgfSkgfSxcblx0XHR7IG5vdGlmaWNhdGlvbjogJ3Nlc3Npb24vd29ya2luZ0RpcmVjdG9yeVJlbW92ZWQnLCBjaGFubmVsOiAnc2Vzc2lvbicsIGJ1aWxkOiAoZGlyZWN0b3J5OiBzdHJpbmcpOiBTdGF0ZUFjdGlvbiA9PiAoeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5IH0pIH0sXG5cdFx0eyBub3RpZmljYXRpb246ICdjaGF0L3dvcmtpbmdEaXJlY3RvcnlTZXQnLCBjaGFubmVsOiAnY2hhdCcsIGJ1aWxkOiAoZGlyZWN0b3J5OiBzdHJpbmcpOiBTdGF0ZUFjdGlvbiA9PiAoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3RvcnkgfSkgfSxcblx0XHR7IG5vdGlmaWNhdGlvbjogJ2NoYXQvd29ya2luZ0RpcmVjdG9yeVJlbW92ZWQnLCBjaGFubmVsOiAnY2hhdCcsIGJ1aWxkOiAoZGlyZWN0b3J5OiBzdHJpbmcpOiBTdGF0ZUFjdGlvbiA9PiAoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5IH0pIH0sXG5cdF0gYXMgY29uc3Q7XG5cblx0Zm9yIChjb25zdCB1bnN1cHBvcnRlZCBvZiB1bnN1cHBvcnRlZFdvcmtpbmdEaXJlY3RvcnlBY3Rpb25zKSB7XG5cdFx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsIGAke3Vuc3VwcG9ydGVkLm5vdGlmaWNhdGlvbn0gaXMgcmVqZWN0ZWQgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBlZGAsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCd1bnN1cHBvcnRlZC1hY3Rpb24nKTtcblx0XHRcdGNvbnN0IGNoYW5uZWwgPSB1bnN1cHBvcnRlZC5jaGFubmVsID09PSAnc2Vzc2lvbicgPyBzZXNzaW9uVXJpIDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsIH0pO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0XHRjb25zdCBzZXEgPSBuZXh0Q2xpZW50U2VxKCk7XG5cdFx0XHRjb25zdCBkaXJlY3RvcnkgPSBVUkkuZmlsZShqb2luKHdvcmtzcGFjZSwgJ3NlY29uZC1yb290JykpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7IGNoYW5uZWwsIGNsaWVudFNlcTogc2VxLCBhY3Rpb246IHVuc3VwcG9ydGVkLmJ1aWxkKGRpcmVjdG9yeSkgfSk7XG5cblx0XHRcdGNvbnN0IHJlamVjdGVkID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sIHVuc3VwcG9ydGVkLm5vdGlmaWNhdGlvbikgJiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbm5lbCxcblx0XHRcdFx0MzBfMDAwLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUocmVqZWN0ZWQpIGFzIHsgcmVqZWN0aW9uUmVhc29uPzogc3RyaW5nOyBvcmlnaW4/OiB7IGNsaWVudFNlcT86IG51bWJlciB9IH07XG5cdFx0XHRjb25zdCBzdGF0ZSA9IChhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbCB9KSkuc25hcHNob3QhLnN0YXRlIGFzIHsgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgc3RyaW5nW10gfTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc1JlamVjdGlvblJlYXNvbjogdHlwZW9mIGVudmVsb3BlLnJlamVjdGlvblJlYXNvbiA9PT0gJ3N0cmluZycgJiYgZW52ZWxvcGUucmVqZWN0aW9uUmVhc29uLmxlbmd0aCA+IDAsXG5cdFx0XHRcdGVjaG9lZENsaWVudFNlcTogZW52ZWxvcGUub3JpZ2luPy5jbGllbnRTZXEsXG5cdFx0XHRcdC8vIFRoZSByZWR1Y2VyIGlzIGRlbGliZXJhdGVseSBub3QgcnVuLCBzbyBzdGF0ZSBuZXZlciBtb3Zlcy5cblx0XHRcdFx0ZGlyZWN0b3J5QXBwbGllZDogKHN0YXRlLndvcmtpbmdEaXJlY3RvcmllcyA/PyBbXSkuaW5jbHVkZXMoZGlyZWN0b3J5KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFzUmVqZWN0aW9uUmVhc29uOiB0cnVlLFxuXHRcdFx0XHRlY2hvZWRDbGllbnRTZXE6IHNlcSxcblx0XHRcdFx0ZGlyZWN0b3J5QXBwbGllZDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBYUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQThJO0FBSXZKLFNBQVMsa0JB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
