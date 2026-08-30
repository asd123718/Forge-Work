import assert from "assert";
import { PassThrough } from "stream";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { INativeEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { AgentSession } from "../../../common/agent.js";
import { buildChatUri, buildDefaultChatUri } from "../../../common/state/sessionState.js";
import { ActionType } from "../../../common/state/sessionActions.js";
import { ISessionDataService } from "../../../common/sessionDataService.js";
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from "../../../common/agentHostCheckpointService.js";
import { IAgentHostOTelService } from "../../../common/otel/agentHostOTelService.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../../node/agentConfigurationService.js";
import { AgentHostStateManager } from "../../../node/agentHostStateManager.js";
import { IAgentHostSessionTitleSignal } from "../../../node/agentHostSessionTitleSignal.js";
import { IAgentHostGitHubEndpointService } from "../../../node/agentHostGitHubEndpointService.js";
import { IAgentSdkDownloader } from "../../../node/agentSdkDownloader.js";
import { CodexAgent, toCodexModelSelectionId } from "../../../node/codex/codexAgent.js";
import { CodexAppServerClient } from "../../../node/codex/codexAppServerClient.js";
import { ICodexProxyService } from "../../../node/codex/codexProxyService.js";
import { ICopilotApiService } from "../../../node/shared/copilotApiService.js";
import { createSessionDataService, TestSessionDatabase } from "../../common/sessionTestHelpers.js";
import { createTestGitHubEndpointService } from "../testGitHubEndpointService.js";
const COPILOT_TEST_MODEL = toCodexModelSelectionId("vscode-proxy", "gpt-test");
function createTestPeer() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const onExit = new Emitter();
  const disposables = new DisposableStore();
  const transport = {
    stdin,
    stdout,
    kill: () => true,
    onExit: onExit.event,
    onExitOnce: () => {
    }
  };
  return {
    transport,
    outbound: stdin,
    disposables,
    push: (message) => stdout.write(JSON.stringify(message) + "\n"),
    dispose: () => {
      disposables.dispose();
      onExit.dispose();
      stdin.destroy();
      stdout.destroy();
    }
  };
}
function readNextRequest(stream) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Codex request"));
    }, 1e3);
    const onData = (chunk) => {
      cleanup();
      try {
        resolve(JSON.parse(typeof chunk === "string" ? chunk : chunk.toString("utf8")));
      } catch (err) {
        reject(err);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off("data", onData);
    };
    stream.once("data", onData);
  });
}
function createTestSessionStore() {
  const databases = /* @__PURE__ */ new Map();
  const databaseFor = (session) => {
    const key = session.toString();
    let database = databases.get(key);
    if (!database) {
      database = new TestSessionDatabase();
      databases.set(key, database);
    }
    return database;
  };
  const base = createSessionDataService();
  return {
    databaseFor,
    service: {
      ...base,
      openDatabase: (session) => createSessionDatabaseReference(databaseFor(session)),
      tryOpenDatabase: async (session) => createSessionDatabaseReference(databaseFor(session))
    }
  };
}
function createSessionDatabaseReference(database) {
  return { object: database, dispose: () => {
  } };
}
async function createAgent(disposables, options = {}) {
  const models = [{ id: "gpt-test", name: "GPT Test", supported_endpoints: ["/responses"] }];
  const instantiationService = new TestInstantiationService();
  const logService = new NullLogService();
  const fileService = disposables.add(new FileService(logService));
  disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
  const stateManager = disposables.add(new AgentHostStateManager(logService));
  const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
  instantiationService.stub(ISessionDataService, options.sessionStore?.service ?? { _serviceBrand: void 0 });
  instantiationService.stub(ICopilotApiService, { _serviceBrand: void 0, models: async () => models });
  instantiationService.stub(ICodexProxyService, { _serviceBrand: void 0 });
  instantiationService.stub(IAgentConfigurationService, configurationService);
  instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
  instantiationService.stub(IAgentSdkDownloader, {
    _serviceBrand: void 0,
    onDidDownloadProgress: Event.None,
    acquireDownloadProgressInterest: () => toDisposable(() => {
    }),
    loadSdkRoot: async () => {
      throw new Error("test stub: downloader.loadSdkRoot should not be called");
    },
    isAvailable: () => true,
    isSdkResolvableWithoutDownload: async () => options.sdkResolvableWithoutDownload ?? false
  });
  instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
  instantiationService.stub(IAgentHostOTelService, {
    _serviceBrand: void 0,
    getNativeSdkTelemetryConfig: async () => void 0,
    getSessionTraceContext: () => void 0,
    releaseSessionTraceContext: () => {
    },
    ...options.otelService
  });
  instantiationService.stub(IAgentHostSessionTitleSignal, { _serviceBrand: void 0, onDidChangeSessionTitle: Event.None });
  instantiationService.stub(IProductService, { _serviceBrand: void 0, version: "1.0.0-test" });
  instantiationService.stub(INativeEnvironmentService, { userHome: URI.file("/tmp") });
  instantiationService.stub(IFileService, fileService);
  instantiationService.stub(ILogService, logService);
  const agent = disposables.add(instantiationService.createInstance(CodexAgent));
  agent["_refreshSkillHookCustomizations"] = async () => {
  };
  agent["_refreshSkillExtraRoots"] = async () => {
  };
  await agent.authenticate(agent.getProtectedResources()[0].resource, "test-token");
  await agent.refreshModels();
  return agent;
}
async function createSessionBackedChat(agent, chat, context, options = {}) {
  const result = await agent.chats.createChat(chat, context, { deferBacking: !options.fork && !options.importConversation, ...options });
  return { ...result, session: context.configurationResource };
}
function connectPeer(agent, peer) {
  const client = new CodexAppServerClient(peer.transport);
  peer.disposables.add(client.onRequest("item/tool/call", (params) => agent["_handleDynamicToolCallRpc"](params)));
  agent["_connection"] = {
    kind: "ready",
    client,
    usageSource: "github",
    child: { kill: () => true }
  };
}
function createRecordingServerToolHost(advertised) {
  return {
    definitions: [],
    toolNames: [],
    advertise: (session) => advertised.push(session.toString()),
    canRequireConfirmation: () => false,
    requiresConfirmation: () => false,
    executeTool: () => ""
  };
}
function createThrowingAdvertiseServerToolHost(message) {
  return {
    definitions: [],
    toolNames: [],
    advertise: () => {
      throw new Error(message);
    },
    canRequireConfirmation: () => false,
    requiresConfirmation: () => false,
    executeTool: () => ""
  };
}
const PEER_TEST_TOOL_NAME = "peer_test_tool";
function createRecordingCallScopeServerToolHost(calls) {
  return {
    definitions: [{ name: PEER_TEST_TOOL_NAME, description: "test", inputSchema: { type: "object" } }],
    toolNames: [PEER_TEST_TOOL_NAME],
    advertise: () => {
    },
    canRequireConfirmation: () => false,
    requiresConfirmation: (scope, toolName) => {
      calls.push({ method: "requiresConfirmation", scope: scope.toString() });
      return false;
    },
    executeTool: (scope, toolName) => {
      calls.push({ method: "executeTool", scope: scope.toString() });
      return "tool result";
    }
  };
}
function readNextMessage(stream) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Codex message"));
    }, 1e3);
    const onData = (chunk) => {
      cleanup();
      try {
        resolve(JSON.parse(typeof chunk === "string" ? chunk : chunk.toString("utf8")));
      } catch (err) {
        reject(err);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off("data", onData);
    };
    stream.once("data", onData);
  });
}
suite("CodexAgent createChat", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("fresh: binds the exact target chat during creation, never leaving the runtime unbound", async () => {
    const agent = await createAgent(disposables);
    const sessionUri = AgentSession.uri("codex", "session-fresh");
    const chat = URI.parse(buildDefaultChatUri(sessionUri));
    const folder = URI.file("/repo/fresh");
    const created = await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
      workingDirectories: [folder],
      model: { id: COPILOT_TEST_MODEL }
    });
    assert.deepStrictEqual({
      session: created.session.toString(),
      provisional: created.provisional,
      resolvedWorkingDirectory: created.resolvedWorkingDirectory?.toString(),
      boundSessionId: agent["_sessionIdByChatUri"].get(chat.toString()),
      chatChannel: agent["_sessions"].get("session-fresh")?.chatChannel?.toString()
    }, {
      session: sessionUri.toString(),
      provisional: true,
      resolvedWorkingDirectory: folder.toString(),
      boundSessionId: "session-fresh",
      chatChannel: chat.toString()
    });
  });
  test("legacy default restore recovers and returns the historical session-id backing", async () => {
    const agent = await createAgent(disposables);
    const session = AgentSession.uri("codex", "legacy-session");
    const chat = URI.parse(buildDefaultChatUri(session));
    await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
      workingDirectories: [URI.file("/repo/legacy")],
      model: { id: COPILOT_TEST_MODEL }
    });
    agent["_sessionIdByChatUri"].delete(chat.toString());
    agent["_sessions"].get("legacy-session").chatChannel = void 0;
    const recovered = await agent.recoverLegacyChat(chat, { configurationResource: session, resource: chat });
    assert.deepStrictEqual({
      providerData: recovered?.providerData ? JSON.parse(recovered.providerData) : void 0,
      boundSessionId: agent["_sessionIdByChatUri"].get(chat.toString()),
      chatChannel: agent["_sessions"].get("legacy-session")?.chatChannel?.toString()
    }, {
      providerData: { sessionId: "legacy-session" },
      boundSessionId: "legacy-session",
      chatChannel: chat.toString()
    });
  });
  test("fresh: a rebind (same session id, new createChat call) binds directly as part of creation", async () => {
    const agent = await createAgent(disposables);
    const sessionUri = AgentSession.uri("codex", "session-rebind");
    const chat = URI.parse(buildDefaultChatUri(sessionUri));
    const folder = URI.file("/repo/rebind");
    await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
      workingDirectories: [folder]
    });
    const rebound = await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
      workingDirectories: [folder],
      model: { id: COPILOT_TEST_MODEL }
    });
    assert.deepStrictEqual({
      provisional: rebound.provisional,
      boundSessionId: agent["_sessionIdByChatUri"].get(chat.toString()),
      chatChannel: agent["_sessions"].get("session-rebind")?.chatChannel?.toString()
    }, {
      provisional: true,
      boundSessionId: "session-rebind",
      chatChannel: chat.toString()
    });
  });
  test("importConversation: explicitly rejects instead of silently creating an empty fresh session", async () => {
    const agent = await createAgent(disposables);
    const sessionUri = AgentSession.uri("codex", "session-import");
    const chat = URI.parse(buildDefaultChatUri(sessionUri));
    await assert.rejects(
      createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
        workingDirectories: [URI.file("/repo/import")],
        importConversation: { turns: [] }
      }),
      /does not support importing/
    );
    assert.deepStrictEqual({
      hasSession: agent["_sessions"].has("session-import"),
      hasBinding: agent["_sessionIdByChatUri"].has(chat.toString()),
      // The config-scope ref this call registered before rejecting must
      // be rolled back too, or a retried create piles a second ref onto
      // a scope that already thinks this chat is live.
      hasConfigScopeRef: agent["_configScopeChats"].has(sessionUri.toString()),
      hasConfigScopeBinding: agent["_configScopeByChat"].has(chat.toString())
    }, {
      hasSession: false,
      hasBinding: false,
      hasConfigScopeRef: false,
      hasConfigScopeBinding: false
    });
  });
  test("createChat is transactional: a failure at any seam after the config-scope ref is registered rolls back cleanly, so a retried create starts from scratch", async () => {
    const agent = await createAgent(disposables);
    {
      const sessionUri = AgentSession.uri("codex", "session-fail-model");
      const chat = URI.parse(buildDefaultChatUri(sessionUri));
      const context = { configurationResource: sessionUri, resource: chat };
      await assert.rejects(
        createSessionBackedChat(agent, chat, context, {
          workingDirectories: [URI.file("/repo/fail-model")],
          model: { id: "not-a-real-model" }
        }),
        /not available/
      );
      assert.deepStrictEqual({
        hasSession: agent["_sessions"].has("session-fail-model"),
        hasBinding: agent["_sessionIdByChatUri"].has(chat.toString()),
        hasConfigScopeRef: agent["_configScopeChats"].has(sessionUri.toString())
      }, { hasSession: false, hasBinding: false, hasConfigScopeRef: false });
      const retried = await createSessionBackedChat(agent, chat, context, {
        workingDirectories: [URI.file("/repo/fail-model")]
      });
      assert.strictEqual(retried.provisional, true);
      assert.strictEqual(agent["_sessionIdByChatUri"].get(chat.toString()), "session-fail-model");
    }
    {
      const sessionUri = AgentSession.uri("codex", "session-fail-fork");
      const chat = URI.parse(buildDefaultChatUri(sessionUri));
      const context = { configurationResource: sessionUri, resource: chat };
      await assert.rejects(
        createSessionBackedChat(agent, chat, context, {
          fork: { source: URI.parse("codex:/never-created-chat"), turnId: "turn-1", turnIndex: 0 }
        }),
        /backing thread could not be resolved/
      );
      assert.deepStrictEqual({
        hasSession: agent["_sessions"].has("session-fail-fork"),
        hasBinding: agent["_sessionIdByChatUri"].has(chat.toString()),
        hasConfigScopeRef: agent["_configScopeChats"].has(sessionUri.toString())
      }, { hasSession: false, hasBinding: false, hasConfigScopeRef: false });
    }
    {
      const sessionUri = AgentSession.uri("codex", "session-fail-client");
      const chat = URI.parse(buildDefaultChatUri(sessionUri));
      const context = { configurationResource: sessionUri, resource: chat };
      const originalSync = agent["_syncClientCustomizations"].bind(agent);
      agent["_syncClientCustomizations"] = async () => {
        throw new Error("client sync boom");
      };
      try {
        await assert.rejects(
          createSessionBackedChat(agent, chat, context, {
            workingDirectories: [URI.file("/repo/fail-client")],
            activeClient: { clientId: "client-fail", tools: [], customizations: [] }
          }),
          /client sync boom/
        );
      } finally {
        agent["_syncClientCustomizations"] = originalSync;
      }
      assert.deepStrictEqual({
        hasSession: agent["_sessions"].has("session-fail-client"),
        hasBinding: agent["_sessionIdByChatUri"].has(chat.toString()),
        hasConfigScopeRef: agent["_configScopeChats"].has(sessionUri.toString()),
        hasActiveClientHandle: agent["_activeClientHandles"].has(`${chat.toString()}\0client-fail`)
      }, { hasSession: false, hasBinding: false, hasConfigScopeRef: false, hasActiveClientHandle: false });
    }
    {
      agent.setServerToolHost(createThrowingAdvertiseServerToolHost("advertise boom"));
      try {
        const sessionUri = AgentSession.uri("codex", "session-fail-advertise");
        const chat = URI.parse(buildDefaultChatUri(sessionUri));
        const context = { configurationResource: sessionUri, resource: chat };
        await assert.rejects(
          createSessionBackedChat(agent, chat, context, {
            workingDirectories: [URI.file("/repo/fail-advertise")]
          }),
          /advertise boom/
        );
        assert.deepStrictEqual({
          hasSession: agent["_sessions"].has("session-fail-advertise"),
          hasBinding: agent["_sessionIdByChatUri"].has(chat.toString()),
          hasConfigScopeRef: agent["_configScopeChats"].has(sessionUri.toString())
        }, { hasSession: false, hasBinding: false, hasConfigScopeRef: false });
      } finally {
        agent.setServerToolHost(createRecordingServerToolHost([]));
      }
    }
  });
  test("fork: preserves the exact source thread and binds the forked session directly to the target chat", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sourceSessionUri = AgentSession.uri("codex", "session-source");
      const sourceChat = URI.parse(buildDefaultChatUri(sourceSessionUri));
      const folder = URI.file("/repo/source");
      await createSessionBackedChat(agent, sourceChat, { configurationResource: sourceSessionUri, resource: sourceChat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL }
      });
      const sourceEntry = agent["_sessions"].get("session-source");
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "source-thread", cwd: folder.fsPath } } });
      await sourceEntry.materializePromise;
      const forkSessionUri = AgentSession.uri("codex", "session-fork-target");
      const forkChat = URI.parse(buildDefaultChatUri(forkSessionUri));
      const forking = createSessionBackedChat(agent, forkChat, { configurationResource: forkSessionUri, resource: forkChat }, {
        fork: { source: sourceChat, turnId: "turn-1", turnIndex: 0 }
      });
      const read = await readNextRequest(peer.outbound);
      assert.strictEqual(read.method, "thread/read");
      assert.strictEqual(read.params.threadId, "source-thread");
      peer.push({
        id: read.id,
        result: { thread: { id: "source-thread", cwd: folder.fsPath, turns: [{ id: "turn-1" }] } }
      });
      const fork = await readNextRequest(peer.outbound);
      assert.strictEqual(fork.method, "thread/fork");
      assert.strictEqual(fork.params.threadId, "source-thread");
      peer.push({
        id: fork.id,
        result: { thread: { id: "forked-thread", cwd: folder.fsPath }, cwd: folder.fsPath }
      });
      const forked = await forking;
      const newThreadId = "forked-thread";
      assert.deepStrictEqual({
        provisional: forked.provisional,
        // The fork stands the owning session's runtime up, so it adopts
        // that session's identity and reports the forked thread as the
        // exact backing — the host keeps addressing the session by the
        // URI it minted.
        session: forked.session.toString(),
        backingSession: forked.backingSession?.toString(),
        // The exact-chat binding must already be in place by the time the
        // caller observes the result — creation is the only binding seam.
        boundSessionId: agent["_sessionIdByChatUri"].get(forkChat.toString()),
        threadId: agent["_sessions"].get("session-fork-target")?.threadId,
        chatChannel: agent["_sessions"].get("session-fork-target")?.chatChannel?.toString()
      }, {
        provisional: void 0,
        session: forkSessionUri.toString(),
        backingSession: AgentSession.uri("codex", newThreadId).toString(),
        boundSessionId: "session-fork-target",
        threadId: newThreadId,
        chatChannel: forkChat.toString()
      });
      const sending = agent.chats.sendMessage(forkChat, "hello", void 0, void 0, "turn-2");
      const resume = await readNextRequest(peer.outbound);
      assert.strictEqual(resume.method, "thread/resume");
      assert.strictEqual(resume.params.threadId, newThreadId);
      peer.push({ id: resume.id, result: { thread: { id: newThreadId, cwd: folder.fsPath }, cwd: folder.fsPath } });
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await sending;
    } finally {
      peer.dispose();
    }
  });
  test("an additional chat mints a backing thread of its own, and re-creating it never mints a second", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-additional");
      const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
      const additionalChat = URI.parse(buildChatUri(sessionUri, "additional"));
      const folder = URI.file("/repo/additional");
      await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL }
      });
      const sessionStart = await readNextRequest(peer.outbound);
      peer.push({ id: sessionStart.id, result: { thread: { id: "session-thread", cwd: folder.fsPath } } });
      await agent["_sessions"].get("session-additional").materializePromise;
      const creating = agent.chats.createChat(additionalChat, { configurationResource: sessionUri, resource: additionalChat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL },
        config: {}
      });
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "additional-thread", cwd: folder.fsPath } } });
      const created = await creating;
      const recreated = await agent.chats.createChat(additionalChat, { configurationResource: sessionUri, resource: additionalChat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL }
      });
      assert.deepStrictEqual({
        started: { method: start.method, cwd: start.params.cwd },
        // The owning session's identity is already taken, so this chat is
        // identified by the thread it minted and reported as an internal
        // backing rather than as a session of its own.
        backingSession: created?.backingSession?.toString(),
        backingId: created?.providerData ? JSON.parse(created.providerData).sessionId : void 0,
        recreatedBackingId: recreated?.providerData ? JSON.parse(recreated.providerData).sessionId : void 0,
        recreatedBackingSession: recreated?.backingSession?.toString(),
        boundSessionId: agent["_sessionIdByChatUri"].get(additionalChat.toString()),
        sessionRuntimeUntouched: agent["_sessions"].get("session-additional")?.threadId
      }, {
        started: { method: "thread/start", cwd: folder.fsPath },
        backingSession: AgentSession.uri("codex", "additional-thread").toString(),
        backingId: "additional-thread",
        recreatedBackingId: "additional-thread",
        recreatedBackingSession: AgentSession.uri("codex", "additional-thread").toString(),
        boundSessionId: "additional-thread",
        sessionRuntimeUntouched: "session-thread"
      });
    } finally {
      peer.dispose();
    }
  });
  test("forking an additional chat goes through createChat({ fork }) like every other creation", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-fork-chat");
      const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
      const forkChat = URI.parse(buildChatUri(sessionUri, "forked"));
      const folder = URI.file("/repo/fork-chat");
      await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL }
      });
      const sessionStart = await readNextRequest(peer.outbound);
      peer.push({ id: sessionStart.id, result: { thread: { id: "fork-chat-source", cwd: folder.fsPath } } });
      await agent["_sessions"].get("session-fork-chat").materializePromise;
      const forking = agent.chats.createChat(forkChat, { configurationResource: sessionUri, resource: forkChat }, {
        model: { id: COPILOT_TEST_MODEL },
        workingDirectories: [folder],
        fork: { source: sessionChat, turnId: "turn-1" }
      });
      const read = await readNextRequest(peer.outbound);
      peer.push({
        id: read.id,
        result: { thread: { id: "fork-chat-source", cwd: folder.fsPath, turns: [{ id: "turn-1" }] } }
      });
      const fork = await readNextRequest(peer.outbound);
      peer.push({ id: fork.id, result: { thread: { id: "fork-chat-thread", cwd: folder.fsPath }, cwd: folder.fsPath } });
      const forked = await forking;
      assert.deepStrictEqual({
        forkRequest: { method: fork.method, threadId: fork.params.threadId },
        backingSession: forked?.backingSession?.toString(),
        backingId: forked?.providerData ? JSON.parse(forked.providerData).sessionId : void 0,
        boundSessionId: agent["_sessionIdByChatUri"].get(forkChat.toString()),
        chatChannel: agent["_sessions"].get("fork-chat-thread")?.chatChannel?.toString()
      }, {
        forkRequest: { method: "thread/fork", threadId: "fork-chat-source" },
        backingSession: AgentSession.uri("codex", "fork-chat-thread").toString(),
        backingId: "fork-chat-thread",
        boundSessionId: "fork-chat-thread",
        chatChannel: forkChat.toString()
      });
    } finally {
      peer.dispose();
    }
  });
  test("importConversation is rejected for every chat, not only a session\u2019s first", async () => {
    const agent = await createAgent(disposables);
    const sessionUri = AgentSession.uri("codex", "session-import-additional");
    const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
    const additionalChat = URI.parse(buildChatUri(sessionUri, "import"));
    const folder = URI.file("/repo/import-additional");
    await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
      workingDirectories: [folder],
      model: { id: COPILOT_TEST_MODEL }
    });
    await assert.rejects(
      agent.chats.createChat(additionalChat, { configurationResource: sessionUri, resource: additionalChat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL },
        importConversation: { turns: [] }
      }),
      /does not support importing/
    );
    assert.deepStrictEqual({
      hasBinding: agent["_sessionIdByChatUri"].has(additionalChat.toString()),
      runtimes: [...agent["_sessions"].keys()]
    }, {
      hasBinding: false,
      runtimes: ["session-import-additional"]
    });
  });
  test("fresh: prewarm and the exact chat binding cooperate so a first send never needs a separate bind", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-prewarm");
      const chat = URI.parse(buildDefaultChatUri(sessionUri));
      const folder = URI.file("/repo/prewarm");
      const created = await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL }
      });
      assert.strictEqual(created.provisional, true);
      assert.strictEqual(agent["_sessionIdByChatUri"].get(chat.toString()), "session-prewarm");
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "prewarmed-thread", cwd: folder.fsPath } } });
      const entry = agent["_sessions"].get("session-prewarm");
      await entry.materializePromise;
      const sending = agent.chats.sendMessage(chat, "hello", [folder], void 0, "turn-1", void 0, {
        configurationResource: sessionUri,
        resource: chat,
        hostInstructions: ["Rename with exact casing"]
      });
      const turn = await readNextRequest(peer.outbound);
      assert.strictEqual(turn.method, "turn/start");
      assert.strictEqual(turn.params.threadId, "prewarmed-thread");
      assert.deepStrictEqual(turn.params.input, [{ type: "text", text: "hello", text_elements: [] }]);
      assert.deepStrictEqual(turn.params.additionalContext, {
        "vscode.agentHost": { kind: "application", value: "Rename with exact casing" }
      });
      peer.push({ id: turn.id, result: {} });
      await sending;
    } finally {
      peer.dispose();
    }
  });
});
suite("CodexAgent exact chat routing", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function sessionChatWithPeerShape(session) {
    return URI.parse(buildChatUri(session, "not-the-default-id"));
  }
  test("routes the exact chat without retaining a session or peer classification", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const advertised = [];
    agent.setServerToolHost(createRecordingServerToolHost(advertised));
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-intent");
      const chat = sessionChatWithPeerShape(sessionUri);
      const folder = URI.file("/repo/intent");
      const materialized = [];
      disposables.add(agent.onDidMaterializeChat((e) => materialized.push(e.chat.toString())));
      await createSessionBackedChat(agent, chat, { configurationResource: sessionUri, resource: chat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL },
        activeClient: { clientId: "client-1", tools: [{ name: "client_tool", description: "client tool", inputSchema: { type: "object" } }] }
      });
      const entry = agent["_sessions"].get("session-intent");
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "intent-thread", cwd: folder.fsPath } } });
      await entry.materializePromise;
      const sending = agent.chats.sendMessage(chat, "hello", [folder], void 0, "turn-1", void 0, void 0, { configurationResource: sessionUri, resource: chat });
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await sending;
      assert.deepStrictEqual({
        advertised,
        materialized,
        // The eager active client is seeded over the exact chat the call
        // binds, so its tools land on this runtime without any
        // default-chat URI being synthesized to find it.
        clientTools: entry.clientToolSet.merged().map((tool) => tool.name)
      }, {
        advertised: [sessionUri.toString()],
        materialized: [chat.toString()],
        clientTools: ["client_tool"]
      });
    } finally {
      peer.dispose();
    }
  });
  test("disposeChat tears down the runtime of the addressed chat and forgets its binding", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-dispose-intent");
      const chat = sessionChatWithPeerShape(sessionUri);
      const context = { configurationResource: sessionUri, resource: chat };
      await createSessionBackedChat(agent, chat, context, {
        workingDirectories: [URI.file("/repo/dispose")],
        model: { id: COPILOT_TEST_MODEL }
      });
      const entry = agent["_sessions"].get("session-dispose-intent");
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "dispose-thread", cwd: "/repo/dispose" } } });
      await entry.materializePromise;
      assert.strictEqual(agent["_sessionIdByChatUri"].get(chat.toString()), "session-dispose-intent");
      const disposing = agent.chats.disposeChat(chat, context);
      const unsubscribe = await readNextRequest(peer.outbound);
      peer.push({ id: unsubscribe.id, result: {} });
      await disposing;
      assert.deepStrictEqual({
        unsubscribed: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
        hasRuntime: agent["_sessions"].has("session-dispose-intent"),
        hasBinding: agent["_sessionIdByChatUri"].has(chat.toString())
      }, {
        unsubscribed: { method: "thread/unsubscribe", threadId: "dispose-thread" },
        hasRuntime: false,
        hasBinding: false
      });
    } finally {
      peer.dispose();
    }
  });
  test("releaseChat releases the runtime of the addressed chat but keeps it resumable", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-release-intent");
      const chat = sessionChatWithPeerShape(sessionUri);
      const context = { configurationResource: sessionUri, resource: chat };
      await createSessionBackedChat(agent, chat, context, {
        workingDirectories: [URI.file("/repo/release")],
        model: { id: COPILOT_TEST_MODEL }
      });
      const entry = agent["_sessions"].get("session-release-intent");
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "release-thread", cwd: "/repo/release" } } });
      await entry.materializePromise;
      const releasing = agent.chats.releaseChat(chat, context);
      const unsubscribe = await readNextRequest(peer.outbound);
      peer.push({ id: unsubscribe.id, result: {} });
      await releasing;
      assert.deepStrictEqual({
        unsubscribed: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
        hasRuntime: agent["_sessions"].has("session-release-intent"),
        // A release is non-destructive: the chat binding survives so the
        // session resumes transparently on the next access.
        hasBinding: agent["_sessionIdByChatUri"].has(chat.toString())
      }, {
        unsubscribed: { method: "thread/unsubscribe", threadId: "release-thread" },
        hasRuntime: false,
        hasBinding: true
      });
    } finally {
      peer.dispose();
    }
  });
  test("disposeChat tears down a still-provisional (never-sent) chat: pending registries reject, the runtime and binding are dropped, and a queued prewarm can no longer materialize a thread", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const sessionUri = AgentSession.uri("codex", "session-dispose-provisional");
    const chat = sessionChatWithPeerShape(sessionUri);
    const context = { configurationResource: sessionUri, resource: chat };
    await createSessionBackedChat(agent, chat, context, {
      workingDirectories: [URI.file("/repo/dispose-provisional")],
      model: { id: COPILOT_TEST_MODEL }
    });
    const entry = agent["_sessions"].get("session-dispose-provisional");
    assert.strictEqual(entry.threadId, void 0, "precondition: the chat was never sent to, so its codex thread is still deferred");
    const toolCall = entry.pendingClientToolCalls.register("tool-call-1");
    const approval = entry.pendingCommandApprovals.register("approval-1");
    const userInput = entry.pendingUserInputs.register("input-1");
    await agent.chats.disposeChat(chat, context);
    await assert.rejects(toolCall);
    assert.strictEqual(await approval, "decline");
    await assert.rejects(userInput);
    assert.deepStrictEqual({
      hasRuntime: agent["_sessions"].has("session-dispose-provisional"),
      hasBinding: agent["_sessionIdByChatUri"].has(chat.toString()),
      disposed: entry.disposed,
      hasPendingToolCall: entry.pendingClientToolCalls.has("tool-call-1"),
      hasPendingApproval: entry.pendingCommandApprovals.has("approval-1"),
      hasPendingInput: entry.pendingUserInputs.has("input-1")
    }, {
      hasRuntime: false,
      hasBinding: false,
      disposed: true,
      hasPendingToolCall: false,
      hasPendingApproval: false,
      hasPendingInput: false
    });
    await agent["_materializeIfNeeded"](entry, entry.sessionUri, false);
    assert.strictEqual(entry.threadId, void 0, "a queued prewarm must never materialize a thread for a runtime that was already disposed");
    assert.doesNotThrow(() => agent["_schedulePrewarm"](entry));
  });
  test("OTel: releaseChat preserves the runtime's trace context; a later disposeChat of the already-evicted runtime releases it through the scope-finalization path", async () => {
    const released = [];
    const agent = await createAgent(disposables, {
      sdkResolvableWithoutDownload: true,
      otelService: {
        getSessionTraceContext: () => void 0,
        releaseSessionTraceContext: (sessionUriKey) => released.push(sessionUriKey)
      }
    });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-otel-scope");
      const chat = URI.parse(buildDefaultChatUri(sessionUri));
      const context = { configurationResource: sessionUri, resource: chat };
      await createSessionBackedChat(agent, chat, context, {
        workingDirectories: [URI.file("/repo/otel-scope")],
        model: { id: COPILOT_TEST_MODEL }
      });
      const entry = agent["_sessions"].get("session-otel-scope");
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "otel-scope-thread", cwd: "/repo/otel-scope" } } });
      await entry.materializePromise;
      const releasing = agent.chats.releaseChat(chat, context);
      const unsubscribeOnRelease = await readNextRequest(peer.outbound);
      peer.push({ id: unsubscribeOnRelease.id, result: {} });
      await releasing;
      assert.deepStrictEqual(released, [], "releaseChat must not release the OTel trace context");
      assert.strictEqual(agent["_sessions"].has("session-otel-scope"), false, "precondition: the runtime was evicted by the release above");
      await agent.chats.disposeChat(chat, context);
      assert.ok(released.length >= 1, "disposeChat must release the trace context once the scope has no chats left");
      assert.ok(released.every((key) => key === sessionUri.toString()), "every release must use the exact acquisition key (this runtime's own sessionUri), never a different one");
    } finally {
      peer.dispose();
    }
  });
  test("OTel: disposeChat of a live in-memory runtime releases its trace context under the exact key it was acquired with", async () => {
    const released = [];
    const agent = await createAgent(disposables, {
      sdkResolvableWithoutDownload: true,
      otelService: {
        getSessionTraceContext: () => void 0,
        releaseSessionTraceContext: (sessionUriKey) => released.push(sessionUriKey)
      }
    });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-otel-live");
      const chat = URI.parse(buildDefaultChatUri(sessionUri));
      const context = { configurationResource: sessionUri, resource: chat };
      await createSessionBackedChat(agent, chat, context, {
        workingDirectories: [URI.file("/repo/otel-live")],
        model: { id: COPILOT_TEST_MODEL }
      });
      const entry = agent["_sessions"].get("session-otel-live");
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "otel-live-thread", cwd: "/repo/otel-live" } } });
      await entry.materializePromise;
      const disposing = agent.chats.disposeChat(chat, context);
      const unsubscribe = await readNextRequest(peer.outbound);
      peer.push({ id: unsubscribe.id, result: {} });
      await disposing;
      assert.deepStrictEqual(released, [sessionUri.toString()]);
    } finally {
      peer.dispose();
    }
  });
  test("truncateChat rolls back the thread of the addressed chat", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-truncate");
      const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
      const peerChat = URI.parse(buildChatUri(sessionUri, "peer-chat"));
      const folder = URI.file("/repo/truncate");
      await createSessionBackedChat(agent, sessionChat, { configurationResource: sessionUri, resource: sessionChat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL }
      });
      const sessionEntry = agent["_sessions"].get("session-truncate");
      const sessionStart = await readNextRequest(peer.outbound);
      peer.push({ id: sessionStart.id, result: { thread: { id: "session-thread", cwd: folder.fsPath } } });
      await sessionEntry.materializePromise;
      const creatingPeer = agent.chats.createChat(peerChat, { configurationResource: sessionUri, resource: peerChat }, {
        model: { id: COPILOT_TEST_MODEL },
        workingDirectories: [folder],
        config: {}
      });
      const peerStart = await readNextRequest(peer.outbound);
      peer.push({ id: peerStart.id, result: { thread: { id: "peer-thread", cwd: folder.fsPath } } });
      await creatingPeer;
      const truncating = agent.truncateChat(peerChat, "turn-2", { configurationResource: sessionUri, resource: peerChat });
      const read = await readNextRequest(peer.outbound);
      peer.push({
        id: read.id,
        result: { thread: { id: "peer-thread", cwd: folder.fsPath, turns: [{ id: "turn-1" }, { id: "turn-2" }, { id: "turn-3" }] } }
      });
      const rollback = await readNextRequest(peer.outbound);
      peer.push({ id: rollback.id, result: {} });
      await truncating;
      assert.deepStrictEqual([
        { method: read.method, threadId: read.params.threadId },
        { method: rollback.method, threadId: rollback.params.threadId, numTurns: rollback.params.numTurns }
      ], [
        { method: "thread/read", threadId: "peer-thread" },
        { method: "thread/rollback", threadId: "peer-thread", numTurns: 1 }
      ]);
    } finally {
      peer.dispose();
    }
  });
  test("an active client is keyed to the exact addressed chat: no sibling inference, and cleanup on removal/disposal never touches a sibling chat", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-exact-client");
      const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
      const peerChat = URI.parse(buildChatUri(sessionUri, "peer-chat"));
      const folder = URI.file("/repo/exact-client");
      const sessionContext = { configurationResource: sessionUri, resource: sessionChat };
      const peerContext = { configurationResource: sessionUri, resource: peerChat };
      await createSessionBackedChat(agent, sessionChat, sessionContext, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL }
      });
      const sessionEntry = agent["_sessions"].get("session-exact-client");
      const sessionStart = await readNextRequest(peer.outbound);
      peer.push({ id: sessionStart.id, result: { thread: { id: "session-thread", cwd: folder.fsPath } } });
      await sessionEntry.materializePromise;
      const creatingPeer = agent.chats.createChat(peerChat, peerContext, {
        model: { id: COPILOT_TEST_MODEL },
        workingDirectories: [folder],
        config: {}
      });
      const peerStart = await readNextRequest(peer.outbound);
      peer.push({ id: peerStart.id, result: { thread: { id: "peer-thread", cwd: folder.fsPath } } });
      await creatingPeer;
      const peerEntry = agent["_sessions"].get("peer-thread");
      const sessionHandle = agent.getOrCreateActiveClient(sessionChat, sessionContext, { clientId: "client-exact" });
      sessionHandle.tools = [{ name: "session_tool", description: "session only", inputSchema: { type: "object" } }];
      const peerHandle = agent.getOrCreateActiveClient(peerChat, peerContext, { clientId: "client-exact" });
      peerHandle.tools = [{ name: "peer_tool", description: "peer only", inputSchema: { type: "object" } }];
      assert.deepStrictEqual({
        sessionTools: sessionEntry.clientToolSet.merged().map((tool) => tool.name),
        peerTools: peerEntry.clientToolSet.merged().map((tool) => tool.name)
      }, {
        sessionTools: ["session_tool"],
        peerTools: ["peer_tool"]
      });
      agent.removeActiveClient(sessionChat, sessionContext, "client-exact");
      const disposing = agent.chats.disposeChat(peerChat, peerContext);
      const unsubscribe = await readNextRequest(peer.outbound);
      peer.push({ id: unsubscribe.id, result: {} });
      await disposing;
      assert.deepStrictEqual({
        sessionTools: sessionEntry.clientToolSet.merged().map((tool) => tool.name),
        peerTools: peerEntry.clientToolSet.merged().map((tool) => tool.name),
        hasSessionHandle: agent["_activeClientHandles"].has(`${sessionChat.toString()}\0client-exact`),
        hasPeerHandle: agent["_activeClientHandles"].has(`${peerChat.toString()}\0client-exact`)
      }, {
        // Removal clears only the addressed chat's contribution.
        sessionTools: [],
        // Disposal cleans up the disposed chat's own handle the same way.
        peerTools: [],
        hasSessionHandle: false,
        hasPeerHandle: false
      });
    } finally {
      peer.dispose();
    }
  });
  test("a peer chat's server-tool call routes execute/confirmation through the host-addressed scope, never the peer runtime's own thread identity", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true });
    const calls = [];
    agent.setServerToolHost(createRecordingCallScopeServerToolHost(calls));
    const peer = disposables.add(createTestPeer());
    connectPeer(agent, peer);
    try {
      const sessionUri = AgentSession.uri("codex", "session-peer-tool");
      const sessionChat = URI.parse(buildDefaultChatUri(sessionUri));
      const peerChat = URI.parse(buildChatUri(sessionUri, "peer-chat"));
      const folder = URI.file("/repo/peer-tool");
      const sessionContext = { configurationResource: sessionUri, resource: sessionChat };
      const peerContext = { configurationResource: sessionUri, resource: peerChat };
      await createSessionBackedChat(agent, sessionChat, sessionContext, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL }
      });
      const sessionStart = await readNextRequest(peer.outbound);
      peer.push({ id: sessionStart.id, result: { thread: { id: "session-thread", cwd: folder.fsPath } } });
      await agent["_sessions"].get("session-peer-tool").materializePromise;
      const creatingPeer = agent.chats.createChat(peerChat, peerContext, {
        model: { id: COPILOT_TEST_MODEL },
        workingDirectories: [folder],
        config: {}
      });
      const peerStart = await readNextRequest(peer.outbound);
      peer.push({ id: peerStart.id, result: { thread: { id: "peer-thread", cwd: folder.fsPath } } });
      await creatingPeer;
      const peerEntry = agent["_sessions"].get("peer-thread");
      const responding = readNextMessage(peer.outbound);
      peer.push({
        id: 9001,
        method: "item/tool/call",
        params: { threadId: "peer-thread", turnId: "turn-irrelevant", callId: "call-1", namespace: null, tool: PEER_TEST_TOOL_NAME, arguments: {} }
      });
      const response = await responding;
      assert.deepStrictEqual({
        peerRuntimeUri: peerEntry.sessionUri.toString(),
        calls,
        toolSucceeded: response.result?.success
      }, {
        // The bug this guards against: the peer runtime's own
        // `codex:/<threadId>` identity — neither the addressed AH
        // session nor the chat channel — must never reach the host.
        peerRuntimeUri: AgentSession.uri("codex", "peer-thread").toString(),
        calls: [
          { method: "requiresConfirmation", scope: sessionUri.toString() },
          { method: "executeTool", scope: sessionUri.toString() }
        ],
        toolSucceeded: true
      });
    } finally {
      peer.dispose();
    }
  });
});
suite("CodexAgent chat backing durability", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function connect(agent, peer) {
    connectPeer(agent, peer);
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
  }
  async function materializeSession(agent, peer, session, chat, folder, threadId) {
    const receipts = [];
    const listener = agent.onDidMaterializeChat((e) => receipts.push(e));
    try {
      await createSessionBackedChat(agent, chat, { configurationResource: session, resource: chat }, {
        workingDirectories: [folder],
        model: { id: COPILOT_TEST_MODEL }
      });
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: threadId, cwd: folder.fsPath } } });
      await agent["_sessions"].get(AgentSession.id(session)).materializePromise;
      const sending = agent.chats.sendMessage(chat, "hello", [folder], void 0, "turn-1", void 0, void 0, { configurationResource: session, resource: chat });
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await sending;
      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(receipts.length, 1);
      return receipts[0];
    } finally {
      listener.dispose();
    }
  }
  test("materializeChat rejects missing peer and corrupt default providerData", async () => {
    const agent = await createAgent(disposables);
    const session = AgentSession.uri("codex", "invalid-backing");
    const peer = URI.parse(buildChatUri(session, "peer"));
    const defaultChat = URI.parse(buildDefaultChatUri(session));
    const missingPeer = await agent.materializeChat(peer, { configurationResource: session, resource: peer }, void 0);
    const corruptDefault = await agent.materializeChat(defaultChat, { configurationResource: session, resource: defaultChat }, "{");
    assert.deepStrictEqual({
      missingPeer,
      corruptDefault,
      sessions: [...agent["_sessions"].keys()]
    }, {
      missingPeer: void 0,
      corruptDefault: void 0,
      sessions: []
    });
  });
  test("the materialize receipt re-keys the chat backing onto the runtime, so a restored session stays addressable", async () => {
    const sessionStore = createTestSessionStore();
    const session = AgentSession.uri("codex", "host-session");
    const chat = URI.parse(buildDefaultChatUri(session));
    const folder = URI.file("/repo/durable");
    const first = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
    const firstPeer = disposables.add(createTestPeer());
    connect(first, firstPeer);
    let secondPeer;
    try {
      const receipt = await materializeSession(first, firstPeer, session, chat, folder, "codex-thread");
      const second = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
      secondPeer = disposables.add(createTestPeer());
      connect(second, secondPeer);
      const signals = [];
      disposables.add(second.onDidChatProgress((signal) => signals.push(signal)));
      const restoring = second.getChatMetadata(chat, { configurationResource: session, resource: chat }, receipt.result?.providerData);
      const originalProbe = await readNextRequest(secondPeer.outbound);
      assert.strictEqual(originalProbe.params.threadId, "host-session");
      secondPeer.push({ id: originalProbe.id, error: { code: -32e3, message: "thread not found" } });
      const read = await readNextRequest(secondPeer.outbound);
      assert.strictEqual(read.params.threadId, "codex-thread");
      secondPeer.push({ id: read.id, result: { thread: { id: "codex-thread", cwd: folder.fsPath, modelProvider: "vscode-proxy", turns: [] } } });
      await restoring;
      await second.materializeChat(chat, { configurationResource: session, resource: chat }, receipt.result?.providerData);
      const resending = second.chats.sendMessage(chat, "again", [folder], void 0, "turn-2", void 0, void 0, { configurationResource: session, resource: chat });
      const resume = await readNextRequest(secondPeer.outbound);
      secondPeer.push({ id: resume.id, result: { thread: { id: "codex-thread", cwd: folder.fsPath }, cwd: folder.fsPath } });
      const turn = await readNextRequest(secondPeer.outbound);
      secondPeer.push({ id: turn.id, error: { code: -32e3, message: "turn rejected" } });
      await resending;
      const restored = second["_sessions"].get("host-session");
      assert.deepStrictEqual({
        backingSessionId: JSON.parse(receipt.result.providerData).sessionId,
        backingSession: receipt.result?.backingSession?.toString(),
        restoredThreadId: restored?.threadId,
        restoredSessionUri: restored?.sessionUri.toString(),
        restoredChatChannel: restored?.chatChannel?.toString(),
        resume: { method: resume.method, threadId: resume.params.threadId },
        turnActions: signals.flatMap((signal) => signal.kind === "action" ? [{ resource: signal.resource.toString(), type: signal.action.type }] : [])
      }, {
        // The runtime's own durable id — not the app-server thread id,
        // which the metadata overlay owns and a rematerialization
        // replaces.
        backingSessionId: "host-session",
        backingSession: AgentSession.uri("codex", "codex-thread").toString(),
        restoredThreadId: "codex-thread",
        restoredSessionUri: session.toString(),
        restoredChatChannel: chat.toString(),
        resume: { method: "thread/resume", threadId: "codex-thread" },
        turnActions: [
          { resource: chat.toString(), type: ActionType.ChatError },
          { resource: chat.toString(), type: ActionType.ChatTurnComplete }
        ]
      });
    } finally {
      firstPeer.dispose();
      secondPeer?.dispose();
    }
  });
  test("a restored runtime is addressed by the id its backing names, never by the session that asked for it", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
    const peer = disposables.add(createTestPeer());
    connect(agent, peer);
    const advertised = [];
    agent.setServerToolHost(createRecordingServerToolHost(advertised));
    try {
      const addressed = AgentSession.uri("codex", "addressed-session");
      const chat = URI.parse(buildDefaultChatUri(addressed));
      const context = { configurationResource: addressed, resource: chat };
      const restoring = agent.getChatMetadata(chat, context, JSON.stringify({ sessionId: "backing-runtime" }));
      const read = await readNextRequest(peer.outbound);
      peer.push({ id: read.id, result: { thread: { id: "backing-thread", cwd: "/repo/addressed", turns: [] } } });
      const metadata = await restoring;
      const restored = agent["_sessions"].get("backing-runtime");
      assert.deepStrictEqual({
        metadataChat: metadata?.chat.toString(),
        // The entry's own URI must round-trip to the key it is stored
        // under; stamping it with the addressed session would leave
        // every entry→map lookup pointing at a runtime that does not
        // exist.
        restoredSessionUri: restored?.sessionUri.toString(),
        restoredThreadId: restored?.threadId,
        addressedRuntimeExists: agent["_sessions"].has("addressed-session"),
        // Server tools are session-scoped, so they are advertised on
        // the session Agent Host addressed — the only URI it knows.
        advertised
      }, {
        metadataChat: chat.toString(),
        restoredSessionUri: AgentSession.uri("codex", "backing-runtime").toString(),
        restoredThreadId: "backing-thread",
        addressedRuntimeExists: false,
        advertised: [addressed.toString()]
      });
    } finally {
      peer.dispose();
    }
  });
  test("a live runtime answers metadata from memory with real timestamps instead of a 1970 placeholder", async () => {
    const sessionStore = createTestSessionStore();
    const session = AgentSession.uri("codex", "live-session");
    const chat = URI.parse(buildDefaultChatUri(session));
    const folder = URI.file("/repo/live");
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
    const peer = disposables.add(createTestPeer());
    connect(agent, peer);
    try {
      const before = Date.now();
      await materializeSession(agent, peer, session, chat, folder, "live-thread");
      const metadata = await agent.getChatMetadata(chat, { configurationResource: session, resource: chat }, JSON.stringify({ sessionId: "live-session" }));
      assert.deepStrictEqual({
        chat: metadata?.chat.toString(),
        workingDirectories: metadata?.workingDirectories?.map((directory) => directory.fsPath),
        // Real clock values: `0` would date the session to 1970 and
        // invert the host's created-before / created-after filters.
        startedInThisRun: (metadata?.startTime ?? 0) >= before,
        modifiedAtOrAfterStart: (metadata?.modifiedTime ?? 0) >= (metadata?.startTime ?? 0)
      }, {
        chat: chat.toString(),
        workingDirectories: [folder.fsPath],
        startedInThisRun: true,
        modifiedAtOrAfterStart: true
      });
    } finally {
      peer.dispose();
    }
  });
  test("a restored runtime preserves its thread summary in subsequent live metadata lookups", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
    const peer = disposables.add(createTestPeer());
    connect(agent, peer);
    try {
      const session = AgentSession.uri("codex", "named-session");
      const chat = URI.parse(buildDefaultChatUri(session));
      const context = { configurationResource: session, resource: chat };
      const providerData = JSON.stringify({ sessionId: "named-session" });
      const restoring = agent.getChatMetadata(chat, context, providerData);
      const read = await readNextRequest(peer.outbound);
      assert.strictEqual(read.method, "thread/read");
      peer.push({
        id: read.id,
        result: {
          thread: {
            id: "named-thread",
            name: "Investigate session title loss",
            cwd: "/repo/named",
            createdAt: 17e8,
            updatedAt: 1700000100,
            turns: []
          }
        }
      });
      const coldMetadata = await restoring;
      const liveMetadata = await agent.getChatMetadata(chat, context, providerData);
      assert.deepStrictEqual({
        coldSummary: coldMetadata?.summary,
        liveSummary: liveMetadata?.summary,
        liveStartTime: liveMetadata?.startTime,
        liveModifiedTime: liveMetadata?.modifiedTime,
        pendingAppServerBytes: peer.outbound.readableLength
      }, {
        coldSummary: "Investigate session title loss",
        liveSummary: "Investigate session title loss",
        liveStartTime: 17e11,
        liveModifiedTime: 17000001e5,
        pendingAppServerBytes: 0
      });
    } finally {
      peer.dispose();
    }
  });
  test("live peer metadata resolves the peer backing instead of the owning default chat", async () => {
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore: createTestSessionStore() });
    const session = AgentSession.uri("codex", "metadata-owner");
    const defaultChat = URI.parse(buildDefaultChatUri(session));
    const peerChat = URI.parse(buildChatUri(session, "metadata-peer"));
    await agent.materializeChat(defaultChat, { configurationResource: session, resource: defaultChat }, JSON.stringify({ sessionId: "default-runtime" }));
    await agent.materializeChat(peerChat, { configurationResource: session, resource: peerChat }, JSON.stringify({ sessionId: "peer-runtime" }));
    agent["_sessions"].get("default-runtime").workingDirectory = URI.file("/repo/default");
    agent["_sessions"].get("peer-runtime").workingDirectory = URI.file("/repo/peer");
    const metadata = await agent.getChatMetadata(
      peerChat,
      { configurationResource: session, resource: peerChat },
      JSON.stringify({ sessionId: "peer-runtime" })
    );
    assert.deepStrictEqual({
      chat: metadata?.chat.toString(),
      workingDirectories: metadata?.workingDirectories?.map((directory) => directory.fsPath)
    }, {
      chat: peerChat.toString(),
      workingDirectories: [URI.file("/repo/peer").fsPath]
    });
  });
  test("a forked session hands back its backing on creation, since it never emits a first-send materialize receipt", async () => {
    const sessionStore = createTestSessionStore();
    const agent = await createAgent(disposables, { sdkResolvableWithoutDownload: true, sessionStore });
    const peer = disposables.add(createTestPeer());
    connect(agent, peer);
    try {
      const source = AgentSession.uri("codex", "fork-source");
      const sourceChat = URI.parse(buildDefaultChatUri(source));
      const folder = URI.file("/repo/fork-backing");
      await materializeSession(agent, peer, source, sourceChat, folder, "source-thread");
      const forkSession = AgentSession.uri("codex", "fork-target");
      const forkChat = URI.parse(buildDefaultChatUri(forkSession));
      const forking = createSessionBackedChat(agent, forkChat, { configurationResource: forkSession, resource: forkChat }, {
        fork: { source: sourceChat, turnId: "turn-1", turnIndex: 0 }
      });
      const read = await readNextRequest(peer.outbound);
      peer.push({ id: read.id, result: { thread: { id: "source-thread", cwd: folder.fsPath, turns: [{ id: "turn-1" }] } } });
      const fork = await readNextRequest(peer.outbound);
      peer.push({ id: fork.id, result: { thread: { id: "forked-thread", cwd: folder.fsPath }, cwd: folder.fsPath } });
      const forked = await forking;
      assert.deepStrictEqual({
        session: forked.session.toString(),
        // The fork is materialized on return, so `onDidMaterializeChat`
        // never fires for it — the create result is the host's only
        // chance to persist a backing it can restore from. The blob names
        // the runtime's own durable id, the thread id is decoupled into
        // the metadata overlay, and the thread itself is reported as the
        // exact backing so the host can mark it internal.
        backingSessionId: forked.providerData ? JSON.parse(forked.providerData).sessionId : void 0,
        backingSession: forked.backingSession?.toString(),
        runtimeSessionUri: agent["_sessions"].get("fork-target")?.sessionUri.toString(),
        runtimeThreadId: agent["_sessions"].get("fork-target")?.threadId
      }, {
        session: forkSession.toString(),
        backingSessionId: "fork-target",
        backingSession: AgentSession.uri("codex", "forked-thread").toString(),
        runtimeSessionUri: forkSession.toString(),
        runtimeThreadId: "forked-thread"
      });
    } finally {
      peer.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhDcmVhdGVDaGF0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IENDQU1vZGVsIH0gZnJvbSAnQHZzY29kZS9jb3BpbG90LWFwaSc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBQYXNzVGhyb3VnaCB9IGZyb20gJ3N0cmVhbSc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgdHlwZSBBZ2VudFNpZ25hbCwgdHlwZSBJQWdlbnRDaGF0Q29udGV4dCwgdHlwZSBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucywgdHlwZSBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0LCB0eXBlIElBZ2VudE1hdGVyaWFsaXplQ2hhdEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudFNlcnZlclRvb2xIb3N0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50U2VydmVyVG9vbHMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhU2VydmljZSwgdHlwZSBJU2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U2RrRG93bmxvYWRlciB9IGZyb20gJy4uLy4uLy4uL25vZGUvYWdlbnRTZGtEb3dubG9hZGVyLmpzJztcbmltcG9ydCB7IENvZGV4QWdlbnQsIHRvQ29kZXhNb2RlbFNlbGVjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleEFnZW50LmpzJztcbmltcG9ydCB7IENvZGV4QXBwU2VydmVyQ2xpZW50LCB0eXBlIElDb2RleEFwcFNlcnZlclRyYW5zcG9ydCB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhBcHBTZXJ2ZXJDbGllbnQuanMnO1xuaW1wb3J0IHsgSUNvZGV4UHJveHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleFByb3h5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UsIFRlc3RTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuLi90ZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcblxuY29uc3QgQ09QSUxPVF9URVNUX01PREVMID0gdG9Db2RleE1vZGVsU2VsZWN0aW9uSWQoJ3ZzY29kZS1wcm94eScsICdncHQtdGVzdCcpO1xuXG5pbnRlcmZhY2UgSVRlc3RXaXJlUmVxdWVzdCB7XG5cdHJlYWRvbmx5IGlkOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nO1xuXHRyZWFkb25seSBwYXJhbXM6IHtcblx0XHRyZWFkb25seSBjd2Q/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdGhyZWFkSWQ/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgbnVtVHVybnM/OiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgaW5wdXQ/OiByZWFkb25seSB7IHJlYWRvbmx5IHR5cGU6IHN0cmluZzsgcmVhZG9ubHkgdGV4dD86IHN0cmluZzsgcmVhZG9ubHkgdGV4dF9lbGVtZW50cz86IHJlYWRvbmx5IG9iamVjdFtdIH1bXTtcblx0XHRyZWFkb25seSBhZGRpdGlvbmFsQ29udGV4dD86IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHsgcmVhZG9ubHkga2luZDogc3RyaW5nOyByZWFkb25seSB2YWx1ZTogc3RyaW5nIH0+Pjtcblx0fTtcbn1cblxuaW50ZXJmYWNlIElUZXN0UGVlciB7XG5cdHJlYWRvbmx5IHRyYW5zcG9ydDogSUNvZGV4QXBwU2VydmVyVHJhbnNwb3J0O1xuXHRyZWFkb25seSBvdXRib3VuZDogUGFzc1Rocm91Z2g7XG5cdC8qKiBFeHRyYSBkaXNwb3NhYmxlcyAoZS5nLiByZXF1ZXN0LWhhbmRsZXIgcmVnaXN0cmF0aW9ucyBmcm9tIGBjb25uZWN0UGVlcmApIHJlbGVhc2VkIGFsb25nc2lkZSB0aGUgcGVlci4gKi9cblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cHVzaChtZXNzYWdlOiBvYmplY3QpOiB2b2lkO1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRlc3RQZWVyKCk6IElUZXN0UGVlciB7XG5cdGNvbnN0IHN0ZGluID0gbmV3IFBhc3NUaHJvdWdoKCk7XG5cdGNvbnN0IHN0ZG91dCA9IG5ldyBQYXNzVGhyb3VnaCgpO1xuXHRjb25zdCBvbkV4aXQgPSBuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNvZGU6IG51bWJlciB8IG51bGw7IHJlYWRvbmx5IHNpZ25hbDogTm9kZUpTLlNpZ25hbHMgfCBudWxsIH0+KCk7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCB0cmFuc3BvcnQ6IElDb2RleEFwcFNlcnZlclRyYW5zcG9ydCA9IHtcblx0XHRzdGRpbixcblx0XHRzdGRvdXQsXG5cdFx0a2lsbDogKCkgPT4gdHJ1ZSxcblx0XHRvbkV4aXQ6IG9uRXhpdC5ldmVudCxcblx0XHRvbkV4aXRPbmNlOiAoKSA9PiB7IH0sXG5cdH07XG5cdHJldHVybiB7XG5cdFx0dHJhbnNwb3J0LFxuXHRcdG91dGJvdW5kOiBzdGRpbixcblx0XHRkaXNwb3NhYmxlcyxcblx0XHRwdXNoOiBtZXNzYWdlID0+IHN0ZG91dC53cml0ZShKU09OLnN0cmluZ2lmeShtZXNzYWdlKSArICdcXG4nKSxcblx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRvbkV4aXQuZGlzcG9zZSgpO1xuXHRcdFx0c3RkaW4uZGVzdHJveSgpO1xuXHRcdFx0c3Rkb3V0LmRlc3Ryb3koKTtcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiByZWFkTmV4dFJlcXVlc3Qoc3RyZWFtOiBQYXNzVGhyb3VnaCk6IFByb21pc2U8SVRlc3RXaXJlUmVxdWVzdD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGNsZWFudXAoKTtcblx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ1RpbWVkIG91dCB3YWl0aW5nIGZvciBDb2RleCByZXF1ZXN0JykpO1xuXHRcdH0sIDFfMDAwKTtcblx0XHRjb25zdCBvbkRhdGEgPSAoY2h1bms6IEJ1ZmZlciB8IHN0cmluZykgPT4ge1xuXHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzb2x2ZShKU09OLnBhcnNlKHR5cGVvZiBjaHVuayA9PT0gJ3N0cmluZycgPyBjaHVuayA6IGNodW5rLnRvU3RyaW5nKCd1dGY4JykpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRzdHJlYW0ub2ZmKCdkYXRhJywgb25EYXRhKTtcblx0XHR9O1xuXHRcdHN0cmVhbS5vbmNlKCdkYXRhJywgb25EYXRhKTtcblx0fSk7XG59XG5cbmludGVyZmFjZSBJQ3JlYXRlQWdlbnRPcHRpb25zIHtcblx0LyoqXG5cdCAqIFdoZXRoZXIgcHJld2FybSBtYXkgcHJvY2VlZCB0byBhIHJlYWwgYHRocmVhZC9zdGFydGAuIERlZmF1bHRzIHRvXG5cdCAqIGBmYWxzZWAgc28gZnJlc2gvaW1wb3J0IHRlc3RzIGRvbid0IG5lZWQgYSBsaXZlIGNvbm5lY3Rpb247IGZvcmsgdGVzdHNcblx0ICogKHdoaWNoIGFsd2F5cyBuZWVkIGEgY29ubmVjdGlvbiBmb3IgYHRocmVhZC9mb3JrYCkgb3B0IGluLlxuXHQgKi9cblx0cmVhZG9ubHkgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBEdXJhYmxlIHBlci1zZXNzaW9uIHN0b3JhZ2Ugc2hhcmVkIGFjcm9zcyBcInByb2Nlc3Nlc1wiLiBTdXBwbHkgdGhlIHNhbWVcblx0ICogc3RvcmUgdG8gdHdvIGFnZW50cyB0byBtb2RlbCBhIGhvc3QgcmVzdGFydC5cblx0ICovXG5cdHJlYWRvbmx5IHNlc3Npb25TdG9yZT86IElUZXN0U2Vzc2lvblN0b3JlO1xuXHQvKipcblx0ICogT3ZlcnJpZGUgdGhlIE9UZWwgc2VydmljZSBzdHViLiBMZXRzIGEgdGVzdCBvYnNlcnZlL3JlY29yZCB0aGUgZXhhY3Rcblx0ICoga2V5IGEgdHJhY2UgY29udGV4dCBpcyBhY3F1aXJlZCBhbmQgcmVsZWFzZWQgdW5kZXIsIGluc3RlYWQgb2YgdGhlXG5cdCAqIGRlZmF1bHQgaW5lcnQgbm8tb3AuXG5cdCAqL1xuXHRyZWFkb25seSBvdGVsU2VydmljZT86IFBpY2s8SUFnZW50SG9zdE9UZWxTZXJ2aWNlLCAnZ2V0U2Vzc2lvblRyYWNlQ29udGV4dCcgfCAncmVsZWFzZVNlc3Npb25UcmFjZUNvbnRleHQnPjtcbn1cblxuLyoqXG4gKiBQZXItc2Vzc2lvbiBkdXJhYmxlIHN0b3JhZ2UsIGtleWVkIGJ5IHNlc3Npb24gVVJJIGV4YWN0bHkgbGlrZSB0aGUgcmVhbFxuICogc2VydmljZS4gUmVzdG9yZSB0ZXN0cyBkZXBlbmQgb24gdGhpczogYSBydW50aW1lJ3MgbWV0YWRhdGEgb3ZlcmxheSAoaXRzXG4gKiBjb2RleCB0aHJlYWQgaWQpIGlzIHN0b3JlZCB1bmRlciB0aGUgc2Vzc2lvbiBVUkkgaXQgd2FzIHBlcnNpc3RlZCB3aXRoLCBzbyBhXG4gKiBibG9iIHRoYXQgbmFtZXMgdGhlIHdyb25nIGlkIG11c3Qgbm90IGFjY2lkZW50YWxseSBmaW5kIHNvbWVvbmUgZWxzZSdzXG4gKiBvdmVybGF5LlxuICovXG5pbnRlcmZhY2UgSVRlc3RTZXNzaW9uU3RvcmUge1xuXHRyZWFkb25seSBzZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlO1xuXHRkYXRhYmFzZUZvcihzZXNzaW9uOiBVUkkpOiBUZXN0U2Vzc2lvbkRhdGFiYXNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVUZXN0U2Vzc2lvblN0b3JlKCk6IElUZXN0U2Vzc2lvblN0b3JlIHtcblx0Y29uc3QgZGF0YWJhc2VzID0gbmV3IE1hcDxzdHJpbmcsIFRlc3RTZXNzaW9uRGF0YWJhc2U+KCk7XG5cdGNvbnN0IGRhdGFiYXNlRm9yID0gKHNlc3Npb246IFVSSSk6IFRlc3RTZXNzaW9uRGF0YWJhc2UgPT4ge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRsZXQgZGF0YWJhc2UgPSBkYXRhYmFzZXMuZ2V0KGtleSk7XG5cdFx0aWYgKCFkYXRhYmFzZSkge1xuXHRcdFx0ZGF0YWJhc2UgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0ZGF0YWJhc2VzLnNldChrZXksIGRhdGFiYXNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRhdGFiYXNlO1xuXHR9O1xuXHRjb25zdCBiYXNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKCk7XG5cdHJldHVybiB7XG5cdFx0ZGF0YWJhc2VGb3IsXG5cdFx0c2VydmljZToge1xuXHRcdFx0Li4uYmFzZSxcblx0XHRcdG9wZW5EYXRhYmFzZTogc2Vzc2lvbiA9PiBjcmVhdGVTZXNzaW9uRGF0YWJhc2VSZWZlcmVuY2UoZGF0YWJhc2VGb3Ioc2Vzc2lvbikpLFxuXHRcdFx0dHJ5T3BlbkRhdGFiYXNlOiBhc3luYyBzZXNzaW9uID0+IGNyZWF0ZVNlc3Npb25EYXRhYmFzZVJlZmVyZW5jZShkYXRhYmFzZUZvcihzZXNzaW9uKSksXG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbkRhdGFiYXNlUmVmZXJlbmNlKGRhdGFiYXNlOiBJU2Vzc2lvbkRhdGFiYXNlKSB7XG5cdHJldHVybiB7IG9iamVjdDogZGF0YWJhc2UsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVBZ2VudChkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgb3B0aW9uczogSUNyZWF0ZUFnZW50T3B0aW9ucyA9IHt9KTogUHJvbWlzZTxDb2RleEFnZW50PiB7XG5cdGNvbnN0IG1vZGVscyA9IFt7IGlkOiAnZ3B0LXRlc3QnLCBuYW1lOiAnR1BUIFRlc3QnLCBzdXBwb3J0ZWRfZW5kcG9pbnRzOiBbJy9yZXNwb25zZXMnXSB9XSBhcyBDQ0FNb2RlbFtdO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbkRhdGFTZXJ2aWNlLCBvcHRpb25zLnNlc3Npb25TdG9yZT8uc2VydmljZSA/PyB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29waWxvdEFwaVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBtb2RlbHM6IGFzeW5jICgpID0+IG1vZGVscyB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29kZXhQcm94eVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRTZGtEb3dubG9hZGVyLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkRG93bmxvYWRQcm9ncmVzczogRXZlbnQuTm9uZSxcblx0XHRhY3F1aXJlRG93bmxvYWRQcm9ncmVzc0ludGVyZXN0OiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRsb2FkU2RrUm9vdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3Rlc3Qgc3R1YjogZG93bmxvYWRlci5sb2FkU2RrUm9vdCBzaG91bGQgbm90IGJlIGNhbGxlZCcpOyB9LFxuXHRcdGlzQXZhaWxhYmxlOiAoKSA9PiB0cnVlLFxuXHRcdGlzU2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogYXN5bmMgKCkgPT4gb3B0aW9ucy5zZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkID8/IGZhbHNlLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0T1RlbFNlcnZpY2UsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0Z2V0TmF0aXZlU2RrVGVsZW1ldHJ5Q29uZmlnOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0U2Vzc2lvblRyYWNlQ29udGV4dDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHJlbGVhc2VTZXNzaW9uVHJhY2VDb250ZXh0OiAoKSA9PiB7IH0sXG5cdFx0Li4ub3B0aW9ucy5vdGVsU2VydmljZSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbCwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIG9uRGlkQ2hhbmdlU2Vzc2lvblRpdGxlOiBFdmVudC5Ob25lIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9kdWN0U2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIHZlcnNpb246ICcxLjAuMC10ZXN0JyB9IGFzIElQcm9kdWN0U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSwgeyB1c2VySG9tZTogVVJJLmZpbGUoJy90bXAnKSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbG9nU2VydmljZSk7XG5cdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGV4QWdlbnQpKTtcblx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0YWdlbnRbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZShhZ2VudC5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKVswXS5yZXNvdXJjZSwgJ3Rlc3QtdG9rZW4nKTtcblx0YXdhaXQgYWdlbnQucmVmcmVzaE1vZGVscygpO1xuXHRyZXR1cm4gYWdlbnQ7XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgc2Vzc2lvbidzIGZpcnN0IGNoYXQgb3ZlciB0aGUgc2luZ2xlIHtAbGluayBJQWdlbnRDaGF0cy5jcmVhdGVDaGF0fVxuICogc2VhbSwgd2l0aCB0aGUgZnVsbHkgcmVzb2x2ZWQgb3B0aW9ucyBBZ2VudCBIb3N0IHN1cHBsaWVzLiBQcm92aWRlcnMgbmV2ZXJcbiAqIGVjaG8gc2Vzc2lvbiBpZGVudGl0eSBiYWNrLCBzbyB0aGUgdGVzdCBjYXJyaWVzIHRoZSBjYWxsZXIncyBvd25cbiAqIGBjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZWAgYWxvbmdzaWRlIHRoZSBjcmVhdGUgcmVzdWx0LlxuICovXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uQmFja2VkQ2hhdChhZ2VudDogQ29kZXhBZ2VudCwgY2hhdDogVVJJLCBjb250ZXh0OiBJQWdlbnRDaGF0Q29udGV4dCwgb3B0aW9uczogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMgPSB7fSk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCAmIHsgcmVhZG9ubHkgc2Vzc2lvbjogVVJJIH0+IHtcblx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY2hhdHMuY3JlYXRlQ2hhdChjaGF0LCBjb250ZXh0LCB7IGRlZmVyQmFja2luZzogIW9wdGlvbnMuZm9yayAmJiAhb3B0aW9ucy5pbXBvcnRDb252ZXJzYXRpb24sIC4uLm9wdGlvbnMgfSk7XG5cdHJldHVybiB7IC4uLnJlc3VsdCwgc2Vzc2lvbjogY29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UgfTtcbn1cblxuZnVuY3Rpb24gY29ubmVjdFBlZXIoYWdlbnQ6IENvZGV4QWdlbnQsIHBlZXI6IElUZXN0UGVlcik6IHZvaWQge1xuXHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpO1xuXHQvLyBNaXJyb3JzIHRoZSByZWFsIGBpdGVtL3Rvb2wvY2FsbGAgd2lyaW5nIGZyb20gYF9zdGFydENvbm5lY3Rpb25gIHNvXG5cdC8vIHRlc3RzIGNhbiBzaW11bGF0ZSB0aGUgY29kZXggYXBwLXNlcnZlciBpbnZva2luZyBhIGR5bmFtaWMgKHNlcnZlcilcblx0Ly8gdG9vbCB3aXRob3V0IG5lZWRpbmcgdGhlIGZ1bGwgY29ubmVjdGlvbiBib290c3RyYXAuXG5cdHBlZXIuZGlzcG9zYWJsZXMuYWRkKGNsaWVudC5vblJlcXVlc3Q8J2l0ZW0vdG9vbC9jYWxsJz4oJ2l0ZW0vdG9vbC9jYWxsJywgcGFyYW1zID0+IGFnZW50WydfaGFuZGxlRHluYW1pY1Rvb2xDYWxsUnBjJ10ocGFyYW1zKSkpO1xuXHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRraW5kOiAncmVhZHknLFxuXHRcdGNsaWVudCxcblx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHR9IGFzIG5ldmVyO1xufVxuXG4vKipcbiAqIFJlY29yZHMgd2hpY2ggc2Vzc2lvbnMgdGhlIGFnZW50IGFkdmVydGlzZXMgdGhlIGhvc3QncyBzZXJ2ZXIgdG9vbHMgb24uIEV2ZXJ5XG4gKiBvdGhlciBtZW1iZXIgaXMgaW5lcnQ6IG9ubHkge0BsaW5rIElBZ2VudFNlcnZlclRvb2xIb3N0LmFkdmVydGlzZX0gaXMgdW5kZXJcbiAqIHRlc3QuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVJlY29yZGluZ1NlcnZlclRvb2xIb3N0KGFkdmVydGlzZWQ6IHN0cmluZ1tdKTogSUFnZW50U2VydmVyVG9vbEhvc3Qge1xuXHRyZXR1cm4ge1xuXHRcdGRlZmluaXRpb25zOiBbXSxcblx0XHR0b29sTmFtZXM6IFtdLFxuXHRcdGFkdmVydGlzZTogc2Vzc2lvbiA9PiBhZHZlcnRpc2VkLnB1c2goc2Vzc2lvbi50b1N0cmluZygpKSxcblx0XHRjYW5SZXF1aXJlQ29uZmlybWF0aW9uOiAoKSA9PiBmYWxzZSxcblx0XHRyZXF1aXJlc0NvbmZpcm1hdGlvbjogKCkgPT4gZmFsc2UsXG5cdFx0ZXhlY3V0ZVRvb2w6ICgpID0+ICcnLFxuXHR9O1xufVxuXG4vKiogQSBzZXJ2ZXItdG9vbCBob3N0IHdob3NlIGBhZHZlcnRpc2VgIGFsd2F5cyB0aHJvd3MsIHRvIGV4ZXJjaXNlIHRoZSBjcmVhdGUtZmFpbHVyZSByb2xsYmFjayBhdCB0aGUgYWR2ZXJ0aXNlIHNlYW0uICovXG5mdW5jdGlvbiBjcmVhdGVUaHJvd2luZ0FkdmVydGlzZVNlcnZlclRvb2xIb3N0KG1lc3NhZ2U6IHN0cmluZyk6IElBZ2VudFNlcnZlclRvb2xIb3N0IHtcblx0cmV0dXJuIHtcblx0XHRkZWZpbml0aW9uczogW10sXG5cdFx0dG9vbE5hbWVzOiBbXSxcblx0XHRhZHZlcnRpc2U6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpOyB9LFxuXHRcdGNhblJlcXVpcmVDb25maXJtYXRpb246ICgpID0+IGZhbHNlLFxuXHRcdHJlcXVpcmVzQ29uZmlybWF0aW9uOiAoKSA9PiBmYWxzZSxcblx0XHRleGVjdXRlVG9vbDogKCkgPT4gJycsXG5cdH07XG59XG5cbmNvbnN0IFBFRVJfVEVTVF9UT09MX05BTUUgPSAncGVlcl90ZXN0X3Rvb2wnO1xuXG4vKipcbiAqIFJlY29yZHMgdGhlIGV4YWN0IHNjb3BlIENvZGV4IGhhbmRzIHtAbGluayBJQWdlbnRTZXJ2ZXJUb29sSG9zdC5yZXF1aXJlc0NvbmZpcm1hdGlvbn1cbiAqIGFuZCB7QGxpbmsgSUFnZW50U2VydmVyVG9vbEhvc3QuZXhlY3V0ZVRvb2x9IGZvciBhIHNpbmdsZSBzZXJ2ZXIgdG9vbFxuICogKHtAbGluayBQRUVSX1RFU1RfVE9PTF9OQU1FfSkuIGBhZHZlcnRpc2VgIGlzIGluZXJ0IGhlcmU6IG9ubHkgdGhlXG4gKiBleGVjdXRlL2NvbmZpcm1hdGlvbiBzY29wZSBpcyB1bmRlciB0ZXN0LlxuICovXG5mdW5jdGlvbiBjcmVhdGVSZWNvcmRpbmdDYWxsU2NvcGVTZXJ2ZXJUb29sSG9zdChjYWxsczogeyByZWFkb25seSBtZXRob2Q6ICdyZXF1aXJlc0NvbmZpcm1hdGlvbicgfCAnZXhlY3V0ZVRvb2wnOyByZWFkb25seSBzY29wZTogc3RyaW5nIH1bXSk6IElBZ2VudFNlcnZlclRvb2xIb3N0IHtcblx0cmV0dXJuIHtcblx0XHRkZWZpbml0aW9uczogW3sgbmFtZTogUEVFUl9URVNUX1RPT0xfTkFNRSwgZGVzY3JpcHRpb246ICd0ZXN0JywgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcgfSB9XSxcblx0XHR0b29sTmFtZXM6IFtQRUVSX1RFU1RfVE9PTF9OQU1FXSxcblx0XHRhZHZlcnRpc2U6ICgpID0+IHsgfSxcblx0XHRjYW5SZXF1aXJlQ29uZmlybWF0aW9uOiAoKSA9PiBmYWxzZSxcblx0XHRyZXF1aXJlc0NvbmZpcm1hdGlvbjogKHNjb3BlLCB0b29sTmFtZSkgPT4ge1xuXHRcdFx0Y2FsbHMucHVzaCh7IG1ldGhvZDogJ3JlcXVpcmVzQ29uZmlybWF0aW9uJywgc2NvcGU6IHNjb3BlLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSxcblx0XHRleGVjdXRlVG9vbDogKHNjb3BlLCB0b29sTmFtZSkgPT4ge1xuXHRcdFx0Y2FsbHMucHVzaCh7IG1ldGhvZDogJ2V4ZWN1dGVUb29sJywgc2NvcGU6IHNjb3BlLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRyZXR1cm4gJ3Rvb2wgcmVzdWx0Jztcblx0XHR9LFxuXHR9O1xufVxuXG4vKiogUmVhZHMgdGhlIG5leHQgcmF3IEpTT04tUlBDIG1lc3NhZ2UgKHJlcXVlc3Qgb3IgcmVzcG9uc2UpIHdyaXR0ZW4gdG8gYHN0cmVhbWAuICovXG5mdW5jdGlvbiByZWFkTmV4dE1lc3NhZ2Uoc3RyZWFtOiBQYXNzVGhyb3VnaCk6IFByb21pc2U8eyByZWFkb25seSBpZD86IG51bWJlcjsgcmVhZG9ubHkgcmVzdWx0PzogeyByZWFkb25seSBjb250ZW50SXRlbXM/OiByZWFkb25seSB7IHJlYWRvbmx5IHR5cGU6IHN0cmluZzsgcmVhZG9ubHkgdGV4dDogc3RyaW5nIH1bXTsgcmVhZG9ubHkgc3VjY2Vzcz86IGJvb2xlYW4gfTsgcmVhZG9ubHkgZXJyb3I/OiB1bmtub3duIH0+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRyZWplY3QobmV3IEVycm9yKCdUaW1lZCBvdXQgd2FpdGluZyBmb3IgQ29kZXggbWVzc2FnZScpKTtcblx0XHR9LCAxXzAwMCk7XG5cdFx0Y29uc3Qgb25EYXRhID0gKGNodW5rOiBCdWZmZXIgfCBzdHJpbmcpID0+IHtcblx0XHRcdGNsZWFudXAoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlc29sdmUoSlNPTi5wYXJzZSh0eXBlb2YgY2h1bmsgPT09ICdzdHJpbmcnID8gY2h1bmsgOiBjaHVuay50b1N0cmluZygndXRmOCcpKSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0c3RyZWFtLm9mZignZGF0YScsIG9uRGF0YSk7XG5cdFx0fTtcblx0XHRzdHJlYW0ub25jZSgnZGF0YScsIG9uRGF0YSk7XG5cdH0pO1xufVxuXG5zdWl0ZSgnQ29kZXhBZ2VudCBjcmVhdGVDaGF0JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZnJlc2g6IGJpbmRzIHRoZSBleGFjdCB0YXJnZXQgY2hhdCBkdXJpbmcgY3JlYXRpb24sIG5ldmVyIGxlYXZpbmcgdGhlIHJ1bnRpbWUgdW5ib3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1mcmVzaCcpO1xuXHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvL2ZyZXNoJyk7XG5cblx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgY3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIGNoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogY2hhdCB9LCB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0bW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXNzaW9uOiBjcmVhdGVkLnNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHByb3Zpc2lvbmFsOiBjcmVhdGVkLnByb3Zpc2lvbmFsLFxuXHRcdFx0cmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5OiBjcmVhdGVkLnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeT8udG9TdHJpbmcoKSxcblx0XHRcdGJvdW5kU2Vzc2lvbklkOiBhZ2VudFsnX3Nlc3Npb25JZEJ5Q2hhdFVyaSddLmdldChjaGF0LnRvU3RyaW5nKCkpLFxuXHRcdFx0Y2hhdENoYW5uZWw6IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoJ3Nlc3Npb24tZnJlc2gnKT8uY2hhdENoYW5uZWw/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0c2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlzaW9uYWw6IHRydWUsXG5cdFx0XHRyZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IGZvbGRlci50b1N0cmluZygpLFxuXHRcdFx0Ym91bmRTZXNzaW9uSWQ6ICdzZXNzaW9uLWZyZXNoJyxcblx0XHRcdGNoYXRDaGFubmVsOiBjaGF0LnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlZ2FjeSBkZWZhdWx0IHJlc3RvcmUgcmVjb3ZlcnMgYW5kIHJldHVybnMgdGhlIGhpc3RvcmljYWwgc2Vzc2lvbi1pZCBiYWNraW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdsZWdhY3ktc2Vzc2lvbicpO1xuXHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIGNoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uLCByZXNvdXJjZTogY2hhdCB9LCB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3JlcG8vbGVnYWN5JyldLFxuXHRcdFx0bW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9LFxuXHRcdH0pO1xuXHRcdGFnZW50Wydfc2Vzc2lvbklkQnlDaGF0VXJpJ10uZGVsZXRlKGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0YWdlbnRbJ19zZXNzaW9ucyddLmdldCgnbGVnYWN5LXNlc3Npb24nKSEuY2hhdENoYW5uZWwgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCByZWNvdmVyZWQgPSBhd2FpdCBhZ2VudC5yZWNvdmVyTGVnYWN5Q2hhdChjaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IGNoYXQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3ZpZGVyRGF0YTogcmVjb3ZlcmVkPy5wcm92aWRlckRhdGEgPyBKU09OLnBhcnNlKHJlY292ZXJlZC5wcm92aWRlckRhdGEpIDogdW5kZWZpbmVkLFxuXHRcdFx0Ym91bmRTZXNzaW9uSWQ6IGFnZW50Wydfc2Vzc2lvbklkQnlDaGF0VXJpJ10uZ2V0KGNoYXQudG9TdHJpbmcoKSksXG5cdFx0XHRjaGF0Q2hhbm5lbDogYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnbGVnYWN5LXNlc3Npb24nKT8uY2hhdENoYW5uZWw/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0cHJvdmlkZXJEYXRhOiB7IHNlc3Npb25JZDogJ2xlZ2FjeS1zZXNzaW9uJyB9LFxuXHRcdFx0Ym91bmRTZXNzaW9uSWQ6ICdsZWdhY3ktc2Vzc2lvbicsXG5cdFx0XHRjaGF0Q2hhbm5lbDogY2hhdC50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmcmVzaDogYSByZWJpbmQgKHNhbWUgc2Vzc2lvbiBpZCwgbmV3IGNyZWF0ZUNoYXQgY2FsbCkgYmluZHMgZGlyZWN0bHkgYXMgcGFydCBvZiBjcmVhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1yZWJpbmQnKTtcblx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdGNvbnN0IGZvbGRlciA9IFVSSS5maWxlKCcvcmVwby9yZWJpbmQnKTtcblxuXHRcdGF3YWl0IGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBjaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaSwgcmVzb3VyY2U6IGNoYXQgfSwge1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbZm9sZGVyXSxcblx0XHR9KTtcblxuXHRcdC8vIFdvcmtiZW5jaCByZWJpbmQ6IGEgc2Vjb25kIGNyZWF0ZUNoYXQgZm9yIHRoZSBzYW1lIHNlc3Npb24gaWQsXG5cdFx0Ly8gZS5nLiBhZnRlciBhIGNoaXAtc2VsZWN0aW9uIGNoYW5nZSByZS1taW50cyB0aGUgcmVxdWVzdC4gTW9kZWxcblx0XHQvLyBjaGFuZ2VzIGhlcmUsIHNvIHRoZSByZWNvbm5lY3QgKFwiZXhpc3RpbmdcIikgYnJhbmNoIHJ1bnMuXG5cdFx0Y29uc3QgcmVib3VuZCA9IGF3YWl0IGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBjaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaSwgcmVzb3VyY2U6IGNoYXQgfSwge1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbZm9sZGVyXSxcblx0XHRcdG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlzaW9uYWw6IHJlYm91bmQucHJvdmlzaW9uYWwsXG5cdFx0XHRib3VuZFNlc3Npb25JZDogYWdlbnRbJ19zZXNzaW9uSWRCeUNoYXRVcmknXS5nZXQoY2hhdC50b1N0cmluZygpKSxcblx0XHRcdGNoYXRDaGFubmVsOiBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KCdzZXNzaW9uLXJlYmluZCcpPy5jaGF0Q2hhbm5lbD8udG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHRwcm92aXNpb25hbDogdHJ1ZSxcblx0XHRcdGJvdW5kU2Vzc2lvbklkOiAnc2Vzc2lvbi1yZWJpbmQnLFxuXHRcdFx0Y2hhdENoYW5uZWw6IGNoYXQudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW1wb3J0Q29udmVyc2F0aW9uOiBleHBsaWNpdGx5IHJlamVjdHMgaW5zdGVhZCBvZiBzaWxlbnRseSBjcmVhdGluZyBhbiBlbXB0eSBmcmVzaCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdzZXNzaW9uLWltcG9ydCcpO1xuXHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBjaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaSwgcmVzb3VyY2U6IGNoYXQgfSwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3JlcG8vaW1wb3J0JyldLFxuXHRcdFx0XHRpbXBvcnRDb252ZXJzYXRpb246IHsgdHVybnM6IFtdIH0sXG5cdFx0XHR9KSxcblx0XHRcdC9kb2VzIG5vdCBzdXBwb3J0IGltcG9ydGluZy8sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzU2Vzc2lvbjogYWdlbnRbJ19zZXNzaW9ucyddLmhhcygnc2Vzc2lvbi1pbXBvcnQnKSxcblx0XHRcdGhhc0JpbmRpbmc6IGFnZW50Wydfc2Vzc2lvbklkQnlDaGF0VXJpJ10uaGFzKGNoYXQudG9TdHJpbmcoKSksXG5cdFx0XHQvLyBUaGUgY29uZmlnLXNjb3BlIHJlZiB0aGlzIGNhbGwgcmVnaXN0ZXJlZCBiZWZvcmUgcmVqZWN0aW5nIG11c3Rcblx0XHRcdC8vIGJlIHJvbGxlZCBiYWNrIHRvbywgb3IgYSByZXRyaWVkIGNyZWF0ZSBwaWxlcyBhIHNlY29uZCByZWYgb250b1xuXHRcdFx0Ly8gYSBzY29wZSB0aGF0IGFscmVhZHkgdGhpbmtzIHRoaXMgY2hhdCBpcyBsaXZlLlxuXHRcdFx0aGFzQ29uZmlnU2NvcGVSZWY6IGFnZW50WydfY29uZmlnU2NvcGVDaGF0cyddLmhhcyhzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0aGFzQ29uZmlnU2NvcGVCaW5kaW5nOiBhZ2VudFsnX2NvbmZpZ1Njb3BlQnlDaGF0J10uaGFzKGNoYXQudG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0aGFzU2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRoYXNCaW5kaW5nOiBmYWxzZSxcblx0XHRcdGhhc0NvbmZpZ1Njb3BlUmVmOiBmYWxzZSxcblx0XHRcdGhhc0NvbmZpZ1Njb3BlQmluZGluZzogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUNoYXQgaXMgdHJhbnNhY3Rpb25hbDogYSBmYWlsdXJlIGF0IGFueSBzZWFtIGFmdGVyIHRoZSBjb25maWctc2NvcGUgcmVmIGlzIHJlZ2lzdGVyZWQgcm9sbHMgYmFjayBjbGVhbmx5LCBzbyBhIHJldHJpZWQgY3JlYXRlIHN0YXJ0cyBmcm9tIHNjcmF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTm8gY29ubmVjdGlvbiBuZWVkZWQ6IGV2ZXJ5IGZhaWx1cmUgYmVsb3cgaXMgcmVhY2hlZCBiZWZvcmUgKG9yIHdpdGhvdXQgZXZlclxuXHRcdC8vIHJlcXVpcmluZykgYHRocmVhZC9zdGFydGAsIGFuZCBwcmV3YXJtIGJhaWxzIG91dCBpbW1lZGlhdGVseSBzaW5jZSB0aGUgZGVmYXVsdFxuXHRcdC8vIFNESy1yZXNvbHZhYmxlIHN0dWIgaXMgYGZhbHNlYC5cblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIC0tLSBtb2RlbCBzZWFtOiBhbiBleHBsaWNpdCBidXQgdW5zdXBwb3J0ZWQgbW9kZWwgcmVqZWN0cyBiZWZvcmUgYW55IHJ1bnRpbWUgaXMgcmVnaXN0ZXJlZCAtLS1cblx0XHR7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1mYWlsLW1vZGVsJyk7XG5cdFx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogY2hhdCB9O1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBjaGF0LCBjb250ZXh0LCB7XG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy9yZXBvL2ZhaWwtbW9kZWwnKV0sXG5cdFx0XHRcdFx0bW9kZWw6IHsgaWQ6ICdub3QtYS1yZWFsLW1vZGVsJyB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0L25vdCBhdmFpbGFibGUvLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRoYXNTZXNzaW9uOiBhZ2VudFsnX3Nlc3Npb25zJ10uaGFzKCdzZXNzaW9uLWZhaWwtbW9kZWwnKSxcblx0XHRcdFx0aGFzQmluZGluZzogYWdlbnRbJ19zZXNzaW9uSWRCeUNoYXRVcmknXS5oYXMoY2hhdC50b1N0cmluZygpKSxcblx0XHRcdFx0aGFzQ29uZmlnU2NvcGVSZWY6IGFnZW50WydfY29uZmlnU2NvcGVDaGF0cyddLmhhcyhzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSwgeyBoYXNTZXNzaW9uOiBmYWxzZSwgaGFzQmluZGluZzogZmFsc2UsIGhhc0NvbmZpZ1Njb3BlUmVmOiBmYWxzZSB9KTtcblxuXHRcdFx0Ly8gQSByZXRyaWVkIGNyZWF0ZSBmb3IgdGhlIGV4YWN0IHNhbWUgY2hhdCBtdXN0IHN1Y2NlZWQgY2xlYW5seSxcblx0XHRcdC8vIHByb3ZpbmcgdGhlIGZhaWxlZCBhdHRlbXB0IGxlZnQgbm8gaGFsZi1yZWdpc3RlcmVkIHN0YXRlIGJlaGluZC5cblx0XHRcdGNvbnN0IHJldHJpZWQgPSBhd2FpdCBjcmVhdGVTZXNzaW9uQmFja2VkQ2hhdChhZ2VudCwgY2hhdCwgY29udGV4dCwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3JlcG8vZmFpbC1tb2RlbCcpXSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldHJpZWQucHJvdmlzaW9uYWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50Wydfc2Vzc2lvbklkQnlDaGF0VXJpJ10uZ2V0KGNoYXQudG9TdHJpbmcoKSksICdzZXNzaW9uLWZhaWwtbW9kZWwnKTtcblx0XHR9XG5cblx0XHQvLyAtLS0gZm9yayBzZWFtOiBhbiB1bnJlc29sdmFibGUgZm9yayBzb3VyY2UgcmVqZWN0cyBiZWZvcmUgYW55IHJ1bnRpbWUgaXMgcmVnaXN0ZXJlZCAtLS1cblx0XHR7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1mYWlsLWZvcmsnKTtcblx0XHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0geyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb25VcmksIHJlc291cmNlOiBjaGF0IH07XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIGNoYXQsIGNvbnRleHQsIHtcblx0XHRcdFx0XHRmb3JrOiB7IHNvdXJjZTogVVJJLnBhcnNlKCdjb2RleDovbmV2ZXItY3JlYXRlZC1jaGF0JyksIHR1cm5JZDogJ3R1cm4tMScsIHR1cm5JbmRleDogMCB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0L2JhY2tpbmcgdGhyZWFkIGNvdWxkIG5vdCBiZSByZXNvbHZlZC8sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc1Nlc3Npb246IGFnZW50Wydfc2Vzc2lvbnMnXS5oYXMoJ3Nlc3Npb24tZmFpbC1mb3JrJyksXG5cdFx0XHRcdGhhc0JpbmRpbmc6IGFnZW50Wydfc2Vzc2lvbklkQnlDaGF0VXJpJ10uaGFzKGNoYXQudG9TdHJpbmcoKSksXG5cdFx0XHRcdGhhc0NvbmZpZ1Njb3BlUmVmOiBhZ2VudFsnX2NvbmZpZ1Njb3BlQ2hhdHMnXS5oYXMoc2Vzc2lvblVyaS50b1N0cmluZygpKSxcblx0XHRcdH0sIHsgaGFzU2Vzc2lvbjogZmFsc2UsIGhhc0JpbmRpbmc6IGZhbHNlLCBoYXNDb25maWdTY29wZVJlZjogZmFsc2UgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gLS0tIGVhZ2VyLWFjdGl2ZS1jbGllbnQgc2VhbTogYSBydW50aW1lIGlzIHJlZ2lzdGVyZWQsIHRoZW4gdGhlIGVhZ2VyIGNsaWVudCBzZWVkIGZhaWxzIC0tLVxuXHRcdHtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdzZXNzaW9uLWZhaWwtY2xpZW50Jyk7XG5cdFx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogY2hhdCB9O1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTeW5jID0gYWdlbnRbJ19zeW5jQ2xpZW50Q3VzdG9taXphdGlvbnMnXS5iaW5kKGFnZW50KTtcblx0XHRcdGFnZW50Wydfc3luY0NsaWVudEN1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignY2xpZW50IHN5bmMgYm9vbScpOyB9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdFx0Y3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIGNoYXQsIGNvbnRleHQsIHtcblx0XHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvcmVwby9mYWlsLWNsaWVudCcpXSxcblx0XHRcdFx0XHRcdGFjdGl2ZUNsaWVudDogeyBjbGllbnRJZDogJ2NsaWVudC1mYWlsJywgdG9vbHM6IFtdLCBjdXN0b21pemF0aW9uczogW10gfSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHQvY2xpZW50IHN5bmMgYm9vbS8sXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhZ2VudFsnX3N5bmNDbGllbnRDdXN0b21pemF0aW9ucyddID0gb3JpZ2luYWxTeW5jO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc1Nlc3Npb246IGFnZW50Wydfc2Vzc2lvbnMnXS5oYXMoJ3Nlc3Npb24tZmFpbC1jbGllbnQnKSxcblx0XHRcdFx0aGFzQmluZGluZzogYWdlbnRbJ19zZXNzaW9uSWRCeUNoYXRVcmknXS5oYXMoY2hhdC50b1N0cmluZygpKSxcblx0XHRcdFx0aGFzQ29uZmlnU2NvcGVSZWY6IGFnZW50WydfY29uZmlnU2NvcGVDaGF0cyddLmhhcyhzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRoYXNBY3RpdmVDbGllbnRIYW5kbGU6IGFnZW50WydfYWN0aXZlQ2xpZW50SGFuZGxlcyddLmhhcyhgJHtjaGF0LnRvU3RyaW5nKCl9XFx1MDAwMGNsaWVudC1mYWlsYCksXG5cdFx0XHR9LCB7IGhhc1Nlc3Npb246IGZhbHNlLCBoYXNCaW5kaW5nOiBmYWxzZSwgaGFzQ29uZmlnU2NvcGVSZWY6IGZhbHNlLCBoYXNBY3RpdmVDbGllbnRIYW5kbGU6IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdC8vIC0tLSBhZHZlcnRpc2Ugc2VhbTogYSBydW50aW1lIGlzIHJlZ2lzdGVyZWQsIHRoZW4gdGhlIGhvc3QncyBzZXJ2ZXItdG9vbCBhZHZlcnRpc2UgdGhyb3dzIC0tLVxuXHRcdHtcblx0XHRcdGFnZW50LnNldFNlcnZlclRvb2xIb3N0KGNyZWF0ZVRocm93aW5nQWR2ZXJ0aXNlU2VydmVyVG9vbEhvc3QoJ2FkdmVydGlzZSBib29tJykpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ3Nlc3Npb24tZmFpbC1hZHZlcnRpc2UnKTtcblx0XHRcdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogY2hhdCB9O1xuXHRcdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0XHRjcmVhdGVTZXNzaW9uQmFja2VkQ2hhdChhZ2VudCwgY2hhdCwgY29udGV4dCwge1xuXHRcdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy9yZXBvL2ZhaWwtYWR2ZXJ0aXNlJyldLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdC9hZHZlcnRpc2UgYm9vbS8sXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGhhc1Nlc3Npb246IGFnZW50Wydfc2Vzc2lvbnMnXS5oYXMoJ3Nlc3Npb24tZmFpbC1hZHZlcnRpc2UnKSxcblx0XHRcdFx0XHRoYXNCaW5kaW5nOiBhZ2VudFsnX3Nlc3Npb25JZEJ5Q2hhdFVyaSddLmhhcyhjaGF0LnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdGhhc0NvbmZpZ1Njb3BlUmVmOiBhZ2VudFsnX2NvbmZpZ1Njb3BlQ2hhdHMnXS5oYXMoc2Vzc2lvblVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0fSwgeyBoYXNTZXNzaW9uOiBmYWxzZSwgaGFzQmluZGluZzogZmFsc2UsIGhhc0NvbmZpZ1Njb3BlUmVmOiBmYWxzZSB9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGFnZW50LnNldFNlcnZlclRvb2xIb3N0KGNyZWF0ZVJlY29yZGluZ1NlcnZlclRvb2xIb3N0KFtdKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdmb3JrOiBwcmVzZXJ2ZXMgdGhlIGV4YWN0IHNvdXJjZSB0aHJlYWQgYW5kIGJpbmRzIHRoZSBmb3JrZWQgc2Vzc2lvbiBkaXJlY3RseSB0byB0aGUgdGFyZ2V0IGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBzZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29ubmVjdFBlZXIoYWdlbnQsIHBlZXIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNvdXJjZVNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdzZXNzaW9uLXNvdXJjZScpO1xuXHRcdFx0Y29uc3Qgc291cmNlQ2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNvdXJjZVNlc3Npb25VcmkpKTtcblx0XHRcdGNvbnN0IGZvbGRlciA9IFVSSS5maWxlKCcvcmVwby9zb3VyY2UnKTtcblx0XHRcdGF3YWl0IGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBzb3VyY2VDaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc291cmNlU2Vzc2lvblVyaSwgcmVzb3VyY2U6IHNvdXJjZUNoYXQgfSwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNvdXJjZUVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnc2Vzc2lvbi1zb3VyY2UnKSE7XG5cdFx0XHRjb25zdCBzdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3NvdXJjZS10aHJlYWQnLCBjd2Q6IGZvbGRlci5mc1BhdGggfSB9IH0pO1xuXHRcdFx0YXdhaXQgc291cmNlRW50cnkubWF0ZXJpYWxpemVQcm9taXNlO1xuXG5cdFx0XHRjb25zdCBmb3JrU2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ3Nlc3Npb24tZm9yay10YXJnZXQnKTtcblx0XHRcdGNvbnN0IGZvcmtDaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoZm9ya1Nlc3Npb25VcmkpKTtcblx0XHRcdGNvbnN0IGZvcmtpbmcgPSBjcmVhdGVTZXNzaW9uQmFja2VkQ2hhdChhZ2VudCwgZm9ya0NoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBmb3JrU2Vzc2lvblVyaSwgcmVzb3VyY2U6IGZvcmtDaGF0IH0sIHtcblx0XHRcdFx0Zm9yazogeyBzb3VyY2U6IHNvdXJjZUNoYXQsIHR1cm5JZDogJ3R1cm4tMScsIHR1cm5JbmRleDogMCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlYWQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZC5tZXRob2QsICd0aHJlYWQvcmVhZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWQucGFyYW1zLnRocmVhZElkLCAnc291cmNlLXRocmVhZCcpO1xuXHRcdFx0cGVlci5wdXNoKHtcblx0XHRcdFx0aWQ6IHJlYWQuaWQsXG5cdFx0XHRcdHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdzb3VyY2UtdGhyZWFkJywgY3dkOiBmb2xkZXIuZnNQYXRoLCB0dXJuczogW3sgaWQ6ICd0dXJuLTEnIH1dIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBmb3JrID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcmsubWV0aG9kLCAndGhyZWFkL2ZvcmsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JrLnBhcmFtcy50aHJlYWRJZCwgJ3NvdXJjZS10aHJlYWQnKTtcblx0XHRcdHBlZXIucHVzaCh7XG5cdFx0XHRcdGlkOiBmb3JrLmlkLFxuXHRcdFx0XHRyZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAnZm9ya2VkLXRocmVhZCcsIGN3ZDogZm9sZGVyLmZzUGF0aCB9LCBjd2Q6IGZvbGRlci5mc1BhdGggfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBmb3JrZWQgPSBhd2FpdCBmb3JraW5nO1xuXHRcdFx0Y29uc3QgbmV3VGhyZWFkSWQgPSAnZm9ya2VkLXRocmVhZCc7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwcm92aXNpb25hbDogZm9ya2VkLnByb3Zpc2lvbmFsLFxuXHRcdFx0XHQvLyBUaGUgZm9yayBzdGFuZHMgdGhlIG93bmluZyBzZXNzaW9uJ3MgcnVudGltZSB1cCwgc28gaXQgYWRvcHRzXG5cdFx0XHRcdC8vIHRoYXQgc2Vzc2lvbidzIGlkZW50aXR5IGFuZCByZXBvcnRzIHRoZSBmb3JrZWQgdGhyZWFkIGFzIHRoZVxuXHRcdFx0XHQvLyBleGFjdCBiYWNraW5nIFx1MjAxNCB0aGUgaG9zdCBrZWVwcyBhZGRyZXNzaW5nIHRoZSBzZXNzaW9uIGJ5IHRoZVxuXHRcdFx0XHQvLyBVUkkgaXQgbWludGVkLlxuXHRcdFx0XHRzZXNzaW9uOiBmb3JrZWQuc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRiYWNraW5nU2Vzc2lvbjogZm9ya2VkLmJhY2tpbmdTZXNzaW9uPy50b1N0cmluZygpLFxuXHRcdFx0XHQvLyBUaGUgZXhhY3QtY2hhdCBiaW5kaW5nIG11c3QgYWxyZWFkeSBiZSBpbiBwbGFjZSBieSB0aGUgdGltZSB0aGVcblx0XHRcdFx0Ly8gY2FsbGVyIG9ic2VydmVzIHRoZSByZXN1bHQgXHUyMDE0IGNyZWF0aW9uIGlzIHRoZSBvbmx5IGJpbmRpbmcgc2VhbS5cblx0XHRcdFx0Ym91bmRTZXNzaW9uSWQ6IGFnZW50Wydfc2Vzc2lvbklkQnlDaGF0VXJpJ10uZ2V0KGZvcmtDaGF0LnRvU3RyaW5nKCkpLFxuXHRcdFx0XHR0aHJlYWRJZDogYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnc2Vzc2lvbi1mb3JrLXRhcmdldCcpPy50aHJlYWRJZCxcblx0XHRcdFx0Y2hhdENoYW5uZWw6IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoJ3Nlc3Npb24tZm9yay10YXJnZXQnKT8uY2hhdENoYW5uZWw/LnRvU3RyaW5nKCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHByb3Zpc2lvbmFsOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlc3Npb246IGZvcmtTZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGJhY2tpbmdTZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsIG5ld1RocmVhZElkKS50b1N0cmluZygpLFxuXHRcdFx0XHRib3VuZFNlc3Npb25JZDogJ3Nlc3Npb24tZm9yay10YXJnZXQnLFxuXHRcdFx0XHR0aHJlYWRJZDogbmV3VGhyZWFkSWQsXG5cdFx0XHRcdGNoYXRDaGFubmVsOiBmb3JrQ2hhdC50b1N0cmluZygpLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEV4YWN0IGNoYXQgYmluZGluZyBpcyBkaXJlY3RseSB1c2FibGU6IHNlbmRpbmcgb24gdGhlIGZvcmtlZCBjaGF0XG5cdFx0XHQvLyByZXNvbHZlcyB0aHJvdWdoIHRoZSBiaW5kaW5nIGNyZWF0aW9uIHJlY29yZGVkLlxuXHRcdFx0Y29uc3Qgc2VuZGluZyA9IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGZvcmtDaGF0LCAnaGVsbG8nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3R1cm4tMicpO1xuXHRcdFx0Y29uc3QgcmVzdW1lID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VtZS5tZXRob2QsICd0aHJlYWQvcmVzdW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdW1lLnBhcmFtcy50aHJlYWRJZCwgbmV3VGhyZWFkSWQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHJlc3VtZS5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogbmV3VGhyZWFkSWQsIGN3ZDogZm9sZGVyLmZzUGF0aCB9LCBjd2Q6IGZvbGRlci5mc1BhdGggfSB9KTtcblx0XHRcdGNvbnN0IHR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogdHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHNlbmRpbmc7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYW4gYWRkaXRpb25hbCBjaGF0IG1pbnRzIGEgYmFja2luZyB0aHJlYWQgb2YgaXRzIG93biwgYW5kIHJlLWNyZWF0aW5nIGl0IG5ldmVyIG1pbnRzIGEgc2Vjb25kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3RQZWVyKGFnZW50LCBwZWVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1hZGRpdGlvbmFsJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRcdGNvbnN0IGFkZGl0aW9uYWxDaGF0ID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAnYWRkaXRpb25hbCcpKTtcblx0XHRcdGNvbnN0IGZvbGRlciA9IFVSSS5maWxlKCcvcmVwby9hZGRpdGlvbmFsJyk7XG5cdFx0XHRhd2FpdCBjcmVhdGVTZXNzaW9uQmFja2VkQ2hhdChhZ2VudCwgc2Vzc2lvbkNoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogc2Vzc2lvbkNoYXQgfSwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25TdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzZXNzaW9uU3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdzZXNzaW9uLXRocmVhZCcsIGN3ZDogZm9sZGVyLmZzUGF0aCB9IH0gfSk7XG5cdFx0XHRhd2FpdCBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KCdzZXNzaW9uLWFkZGl0aW9uYWwnKSEubWF0ZXJpYWxpemVQcm9taXNlO1xuXG5cdFx0XHRjb25zdCBjcmVhdGluZyA9IGFnZW50LmNoYXRzLmNyZWF0ZUNoYXQoYWRkaXRpb25hbENoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogYWRkaXRpb25hbENoYXQgfSwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0XHRcdGNvbmZpZzoge30sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAnYWRkaXRpb25hbC10aHJlYWQnLCBjd2Q6IGZvbGRlci5mc1BhdGggfSB9IH0pO1xuXHRcdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IGNyZWF0aW5nO1xuXG5cdFx0XHQvLyBBIHJlcGVhdGVkIGNyZWF0ZSBmb3IgdGhlIHNhbWUgY2hhdCBtdXN0IGhhbmQgdGhlIGV4YWN0IHNhbWVcblx0XHRcdC8vIGJhY2tpbmcgYmFjazsgYSBzZWNvbmQgdGhyZWFkL3N0YXJ0IGhlcmUgd291bGQgb3JwaGFuIHRoZSBmaXJzdC5cblx0XHRcdGNvbnN0IHJlY3JlYXRlZCA9IGF3YWl0IGFnZW50LmNoYXRzLmNyZWF0ZUNoYXQoYWRkaXRpb25hbENoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogYWRkaXRpb25hbENoYXQgfSwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXJ0ZWQ6IHsgbWV0aG9kOiBzdGFydC5tZXRob2QsIGN3ZDogc3RhcnQucGFyYW1zLmN3ZCB9LFxuXHRcdFx0XHQvLyBUaGUgb3duaW5nIHNlc3Npb24ncyBpZGVudGl0eSBpcyBhbHJlYWR5IHRha2VuLCBzbyB0aGlzIGNoYXQgaXNcblx0XHRcdFx0Ly8gaWRlbnRpZmllZCBieSB0aGUgdGhyZWFkIGl0IG1pbnRlZCBhbmQgcmVwb3J0ZWQgYXMgYW4gaW50ZXJuYWxcblx0XHRcdFx0Ly8gYmFja2luZyByYXRoZXIgdGhhbiBhcyBhIHNlc3Npb24gb2YgaXRzIG93bi5cblx0XHRcdFx0YmFja2luZ1Nlc3Npb246IGNyZWF0ZWQ/LmJhY2tpbmdTZXNzaW9uPy50b1N0cmluZygpLFxuXHRcdFx0XHRiYWNraW5nSWQ6IGNyZWF0ZWQ/LnByb3ZpZGVyRGF0YSA/IEpTT04ucGFyc2UoY3JlYXRlZC5wcm92aWRlckRhdGEpLnNlc3Npb25JZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVjcmVhdGVkQmFja2luZ0lkOiByZWNyZWF0ZWQ/LnByb3ZpZGVyRGF0YSA/IEpTT04ucGFyc2UocmVjcmVhdGVkLnByb3ZpZGVyRGF0YSkuc2Vzc2lvbklkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWNyZWF0ZWRCYWNraW5nU2Vzc2lvbjogcmVjcmVhdGVkPy5iYWNraW5nU2Vzc2lvbj8udG9TdHJpbmcoKSxcblx0XHRcdFx0Ym91bmRTZXNzaW9uSWQ6IGFnZW50Wydfc2Vzc2lvbklkQnlDaGF0VXJpJ10uZ2V0KGFkZGl0aW9uYWxDaGF0LnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRzZXNzaW9uUnVudGltZVVudG91Y2hlZDogYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnc2Vzc2lvbi1hZGRpdGlvbmFsJyk/LnRocmVhZElkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGFydGVkOiB7IG1ldGhvZDogJ3RocmVhZC9zdGFydCcsIGN3ZDogZm9sZGVyLmZzUGF0aCB9LFxuXHRcdFx0XHRiYWNraW5nU2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnYWRkaXRpb25hbC10aHJlYWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRiYWNraW5nSWQ6ICdhZGRpdGlvbmFsLXRocmVhZCcsXG5cdFx0XHRcdHJlY3JlYXRlZEJhY2tpbmdJZDogJ2FkZGl0aW9uYWwtdGhyZWFkJyxcblx0XHRcdFx0cmVjcmVhdGVkQmFja2luZ1Nlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ2FkZGl0aW9uYWwtdGhyZWFkJykudG9TdHJpbmcoKSxcblx0XHRcdFx0Ym91bmRTZXNzaW9uSWQ6ICdhZGRpdGlvbmFsLXRocmVhZCcsXG5cdFx0XHRcdHNlc3Npb25SdW50aW1lVW50b3VjaGVkOiAnc2Vzc2lvbi10aHJlYWQnLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZm9ya2luZyBhbiBhZGRpdGlvbmFsIGNoYXQgZ29lcyB0aHJvdWdoIGNyZWF0ZUNoYXQoeyBmb3JrIH0pIGxpa2UgZXZlcnkgb3RoZXIgY3JlYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBzZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29ubmVjdFBlZXIoYWdlbnQsIHBlZXIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdzZXNzaW9uLWZvcmstY2hhdCcpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0XHRjb25zdCBmb3JrQ2hhdCA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ2ZvcmtlZCcpKTtcblx0XHRcdGNvbnN0IGZvbGRlciA9IFVSSS5maWxlKCcvcmVwby9mb3JrLWNoYXQnKTtcblx0XHRcdGF3YWl0IGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBzZXNzaW9uQ2hhdCwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb25VcmksIHJlc291cmNlOiBzZXNzaW9uQ2hhdCB9LCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW2ZvbGRlcl0sXG5cdFx0XHRcdG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHNlc3Npb25TdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ2ZvcmstY2hhdC1zb3VyY2UnLCBjd2Q6IGZvbGRlci5mc1BhdGggfSB9IH0pO1xuXHRcdFx0YXdhaXQgYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnc2Vzc2lvbi1mb3JrLWNoYXQnKSEubWF0ZXJpYWxpemVQcm9taXNlO1xuXG5cdFx0XHQvLyBUaGVyZSBpcyBubyBzZXBhcmF0ZSBmb3JrIGVudHJ5IHBvaW50OiBhIGZvcmsgaXMgYSBjcmVhdGUgd2hvc2Vcblx0XHRcdC8vIG9wdGlvbnMgbmFtZSB0aGUgc291cmNlIGNoYXQgdG8gYnJhbmNoIGZyb20uXG5cdFx0XHRjb25zdCBmb3JraW5nID0gYWdlbnQuY2hhdHMuY3JlYXRlQ2hhdChmb3JrQ2hhdCwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb25VcmksIHJlc291cmNlOiBmb3JrQ2hhdCB9LCB7XG5cdFx0XHRcdG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbZm9sZGVyXSxcblx0XHRcdFx0Zm9yazogeyBzb3VyY2U6IHNlc3Npb25DaGF0LCB0dXJuSWQ6ICd0dXJuLTEnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlYWQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goe1xuXHRcdFx0XHRpZDogcmVhZC5pZCxcblx0XHRcdFx0cmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ2ZvcmstY2hhdC1zb3VyY2UnLCBjd2Q6IGZvbGRlci5mc1BhdGgsIHR1cm5zOiBbeyBpZDogJ3R1cm4tMScgfV0gfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBmb3JrID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IGZvcmsuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdmb3JrLWNoYXQtdGhyZWFkJywgY3dkOiBmb2xkZXIuZnNQYXRoIH0sIGN3ZDogZm9sZGVyLmZzUGF0aCB9IH0pO1xuXHRcdFx0Y29uc3QgZm9ya2VkID0gYXdhaXQgZm9ya2luZztcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGZvcmtSZXF1ZXN0OiB7IG1ldGhvZDogZm9yay5tZXRob2QsIHRocmVhZElkOiBmb3JrLnBhcmFtcy50aHJlYWRJZCB9LFxuXHRcdFx0XHRiYWNraW5nU2Vzc2lvbjogZm9ya2VkPy5iYWNraW5nU2Vzc2lvbj8udG9TdHJpbmcoKSxcblx0XHRcdFx0YmFja2luZ0lkOiBmb3JrZWQ/LnByb3ZpZGVyRGF0YSA/IEpTT04ucGFyc2UoZm9ya2VkLnByb3ZpZGVyRGF0YSkuc2Vzc2lvbklkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRib3VuZFNlc3Npb25JZDogYWdlbnRbJ19zZXNzaW9uSWRCeUNoYXRVcmknXS5nZXQoZm9ya0NoYXQudG9TdHJpbmcoKSksXG5cdFx0XHRcdGNoYXRDaGFubmVsOiBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KCdmb3JrLWNoYXQtdGhyZWFkJyk/LmNoYXRDaGFubmVsPy50b1N0cmluZygpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRmb3JrUmVxdWVzdDogeyBtZXRob2Q6ICd0aHJlYWQvZm9yaycsIHRocmVhZElkOiAnZm9yay1jaGF0LXNvdXJjZScgfSxcblx0XHRcdFx0YmFja2luZ1Nlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ2ZvcmstY2hhdC10aHJlYWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRiYWNraW5nSWQ6ICdmb3JrLWNoYXQtdGhyZWFkJyxcblx0XHRcdFx0Ym91bmRTZXNzaW9uSWQ6ICdmb3JrLWNoYXQtdGhyZWFkJyxcblx0XHRcdFx0Y2hhdENoYW5uZWw6IGZvcmtDaGF0LnRvU3RyaW5nKCksXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdpbXBvcnRDb252ZXJzYXRpb24gaXMgcmVqZWN0ZWQgZm9yIGV2ZXJ5IGNoYXQsIG5vdCBvbmx5IGEgc2Vzc2lvblxcdTIwMTlzIGZpcnN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdzZXNzaW9uLWltcG9ydC1hZGRpdGlvbmFsJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0Y29uc3QgYWRkaXRpb25hbENoYXQgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdpbXBvcnQnKSk7XG5cdFx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvL2ltcG9ydC1hZGRpdGlvbmFsJyk7XG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIHNlc3Npb25DaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaSwgcmVzb3VyY2U6IHNlc3Npb25DaGF0IH0sIHtcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW2ZvbGRlcl0sXG5cdFx0XHRtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdGFnZW50LmNoYXRzLmNyZWF0ZUNoYXQoYWRkaXRpb25hbENoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogYWRkaXRpb25hbENoYXQgfSwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0XHRcdGltcG9ydENvbnZlcnNhdGlvbjogeyB0dXJuczogW10gfSxcblx0XHRcdH0pLFxuXHRcdFx0L2RvZXMgbm90IHN1cHBvcnQgaW1wb3J0aW5nLyxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNCaW5kaW5nOiBhZ2VudFsnX3Nlc3Npb25JZEJ5Q2hhdFVyaSddLmhhcyhhZGRpdGlvbmFsQ2hhdC50b1N0cmluZygpKSxcblx0XHRcdHJ1bnRpbWVzOiBbLi4uYWdlbnRbJ19zZXNzaW9ucyddLmtleXMoKV0sXG5cdFx0fSwge1xuXHRcdFx0aGFzQmluZGluZzogZmFsc2UsXG5cdFx0XHRydW50aW1lczogWydzZXNzaW9uLWltcG9ydC1hZGRpdGlvbmFsJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZyZXNoOiBwcmV3YXJtIGFuZCB0aGUgZXhhY3QgY2hhdCBiaW5kaW5nIGNvb3BlcmF0ZSBzbyBhIGZpcnN0IHNlbmQgbmV2ZXIgbmVlZHMgYSBzZXBhcmF0ZSBiaW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3RQZWVyKGFnZW50LCBwZWVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1wcmV3YXJtJyk7XG5cdFx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvL3ByZXdhcm0nKTtcblx0XHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBjcmVhdGVTZXNzaW9uQmFja2VkQ2hhdChhZ2VudCwgY2hhdCwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb25VcmksIHJlc291cmNlOiBjaGF0IH0sIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbZm9sZGVyXSxcblx0XHRcdFx0bW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZC5wcm92aXNpb25hbCwgdHJ1ZSk7XG5cdFx0XHQvLyBUaGUgYmluZGluZyBsYW5kcyBhcyBwYXJ0IG9mIGNyZWF0aW9uLCBub3QgYXMgYSBmb2xsb3ctdXA6IGNoZWNrIGl0XG5cdFx0XHQvLyBiZWZvcmUgdGhlIHByZXdhcm1lZCB0aHJlYWQvc3RhcnQgcm91bmQgdHJpcCBiZWxvdyBldmVuIGNvbXBsZXRlcy5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudFsnX3Nlc3Npb25JZEJ5Q2hhdFVyaSddLmdldChjaGF0LnRvU3RyaW5nKCkpLCAnc2Vzc2lvbi1wcmV3YXJtJyk7XG5cblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAncHJld2FybWVkLXRocmVhZCcsIGN3ZDogZm9sZGVyLmZzUGF0aCB9IH0gfSk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoJ3Nlc3Npb24tcHJld2FybScpITtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblxuXHRcdFx0Y29uc3Qgc2VuZGluZyA9IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGNoYXQsICdoZWxsbycsIFtmb2xkZXJdLCB1bmRlZmluZWQsICd0dXJuLTEnLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0Y29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRyZXNvdXJjZTogY2hhdCxcblx0XHRcdFx0aG9zdEluc3RydWN0aW9uczogWydSZW5hbWUgd2l0aCBleGFjdCBjYXNpbmcnXSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdHVybiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuLm1ldGhvZCwgJ3R1cm4vc3RhcnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuLnBhcmFtcy50aHJlYWRJZCwgJ3ByZXdhcm1lZC10aHJlYWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybi5wYXJhbXMuaW5wdXQsIFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hlbGxvJywgdGV4dF9lbGVtZW50czogW10gfV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJuLnBhcmFtcy5hZGRpdGlvbmFsQ29udGV4dCwge1xuXHRcdFx0XHQndnNjb2RlLmFnZW50SG9zdCc6IHsga2luZDogJ2FwcGxpY2F0aW9uJywgdmFsdWU6ICdSZW5hbWUgd2l0aCBleGFjdCBjYXNpbmcnIH0sXG5cdFx0XHR9KTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiB0dXJuLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgc2VuZGluZztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ29kZXhBZ2VudCBleGFjdCBjaGF0IHJvdXRpbmcnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzZXNzaW9uQ2hhdFdpdGhQZWVyU2hhcGUoc2Vzc2lvbjogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnbm90LXRoZS1kZWZhdWx0LWlkJykpO1xuXHR9XG5cblx0dGVzdCgncm91dGVzIHRoZSBleGFjdCBjaGF0IHdpdGhvdXQgcmV0YWluaW5nIGEgc2Vzc2lvbiBvciBwZWVyIGNsYXNzaWZpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBhZHZlcnRpc2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGFnZW50LnNldFNlcnZlclRvb2xIb3N0KGNyZWF0ZVJlY29yZGluZ1NlcnZlclRvb2xIb3N0KGFkdmVydGlzZWQpKTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3RQZWVyKGFnZW50LCBwZWVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1pbnRlbnQnKTtcblx0XHRcdGNvbnN0IGNoYXQgPSBzZXNzaW9uQ2hhdFdpdGhQZWVyU2hhcGUoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL3JlcG8vaW50ZW50Jyk7XG5cdFx0XHRjb25zdCBtYXRlcmlhbGl6ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWdlbnQub25EaWRNYXRlcmlhbGl6ZUNoYXQoZSA9PiBtYXRlcmlhbGl6ZWQucHVzaChlLmNoYXQudG9TdHJpbmcoKSkpKTtcblxuXHRcdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIGNoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogY2hhdCB9LCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW2ZvbGRlcl0sXG5cdFx0XHRcdG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7IGNsaWVudElkOiAnY2xpZW50LTEnLCB0b29sczogW3sgbmFtZTogJ2NsaWVudF90b29sJywgZGVzY3JpcHRpb246ICdjbGllbnQgdG9vbCcsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnIH0gfV0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KCdzZXNzaW9uLWludGVudCcpITtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAnaW50ZW50LXRocmVhZCcsIGN3ZDogZm9sZGVyLmZzUGF0aCB9IH0gfSk7XG5cdFx0XHRhd2FpdCBlbnRyeS5tYXRlcmlhbGl6ZVByb21pc2U7XG5cblx0XHRcdGNvbnN0IHNlbmRpbmcgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShjaGF0LCAnaGVsbG8nLCBbZm9sZGVyXSwgdW5kZWZpbmVkLCAndHVybi0xJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogY2hhdCB9KTtcblx0XHRcdGNvbnN0IHR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogdHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHNlbmRpbmc7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRhZHZlcnRpc2VkLFxuXHRcdFx0XHRtYXRlcmlhbGl6ZWQsXG5cdFx0XHRcdC8vIFRoZSBlYWdlciBhY3RpdmUgY2xpZW50IGlzIHNlZWRlZCBvdmVyIHRoZSBleGFjdCBjaGF0IHRoZSBjYWxsXG5cdFx0XHRcdC8vIGJpbmRzLCBzbyBpdHMgdG9vbHMgbGFuZCBvbiB0aGlzIHJ1bnRpbWUgd2l0aG91dCBhbnlcblx0XHRcdFx0Ly8gZGVmYXVsdC1jaGF0IFVSSSBiZWluZyBzeW50aGVzaXplZCB0byBmaW5kIGl0LlxuXHRcdFx0XHRjbGllbnRUb29sczogZW50cnkuY2xpZW50VG9vbFNldC5tZXJnZWQoKS5tYXAodG9vbCA9PiB0b29sLm5hbWUpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhZHZlcnRpc2VkOiBbc2Vzc2lvblVyaS50b1N0cmluZygpXSxcblx0XHRcdFx0bWF0ZXJpYWxpemVkOiBbY2hhdC50b1N0cmluZygpXSxcblx0XHRcdFx0Y2xpZW50VG9vbHM6IFsnY2xpZW50X3Rvb2wnXSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2VDaGF0IHRlYXJzIGRvd24gdGhlIHJ1bnRpbWUgb2YgdGhlIGFkZHJlc3NlZCBjaGF0IGFuZCBmb3JnZXRzIGl0cyBiaW5kaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3RQZWVyKGFnZW50LCBwZWVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1kaXNwb3NlLWludGVudCcpO1xuXHRcdFx0Y29uc3QgY2hhdCA9IHNlc3Npb25DaGF0V2l0aFBlZXJTaGFwZShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaSwgcmVzb3VyY2U6IGNoYXQgfTtcblxuXHRcdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIGNoYXQsIGNvbnRleHQsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy9yZXBvL2Rpc3Bvc2UnKV0sXG5cdFx0XHRcdG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KCdzZXNzaW9uLWRpc3Bvc2UtaW50ZW50JykhO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogc3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdkaXNwb3NlLXRocmVhZCcsIGN3ZDogJy9yZXBvL2Rpc3Bvc2UnIH0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudFsnX3Nlc3Npb25JZEJ5Q2hhdFVyaSddLmdldChjaGF0LnRvU3RyaW5nKCkpLCAnc2Vzc2lvbi1kaXNwb3NlLWludGVudCcpO1xuXG5cdFx0XHQvLyBBZ2VudCBIb3N0J3MgdGVhcmRvd24gb3JkZXI6IGRpc3Bvc2UgZXZlcnkgY2hhdC4gQ29uZmlndXJhdGlvbi1cblx0XHRcdC8vIHNjb3BlIHJlZiB0cmFja2luZyByZWNsYWltcyBhbnkgcmVtYWluaW5nIHNjb3BlLWxldmVsIHJlc291cmNlc1xuXHRcdFx0Ly8gaW5saW5lIG9uY2UgdGhlIHNjb3BlJ3MgbGFzdCBjaGF0IGlzIGRpc3Bvc2VkIFx1MjAxNCBubyBzZXBhcmF0ZVxuXHRcdFx0Ly8gZmluYWxpemUgY2FsbCBpcyBuZWVkZWQuXG5cdFx0XHRjb25zdCBkaXNwb3NpbmcgPSBhZ2VudC5jaGF0cy5kaXNwb3NlQ2hhdChjaGF0LCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IHVuc3Vic2NyaWJlID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHVuc3Vic2NyaWJlLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgZGlzcG9zaW5nO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dW5zdWJzY3JpYmVkOiB7IG1ldGhvZDogdW5zdWJzY3JpYmUubWV0aG9kLCB0aHJlYWRJZDogdW5zdWJzY3JpYmUucGFyYW1zLnRocmVhZElkIH0sXG5cdFx0XHRcdGhhc1J1bnRpbWU6IGFnZW50Wydfc2Vzc2lvbnMnXS5oYXMoJ3Nlc3Npb24tZGlzcG9zZS1pbnRlbnQnKSxcblx0XHRcdFx0aGFzQmluZGluZzogYWdlbnRbJ19zZXNzaW9uSWRCeUNoYXRVcmknXS5oYXMoY2hhdC50b1N0cmluZygpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dW5zdWJzY3JpYmVkOiB7IG1ldGhvZDogJ3RocmVhZC91bnN1YnNjcmliZScsIHRocmVhZElkOiAnZGlzcG9zZS10aHJlYWQnIH0sXG5cdFx0XHRcdGhhc1J1bnRpbWU6IGZhbHNlLFxuXHRcdFx0XHRoYXNCaW5kaW5nOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGVhc2VDaGF0IHJlbGVhc2VzIHRoZSBydW50aW1lIG9mIHRoZSBhZGRyZXNzZWQgY2hhdCBidXQga2VlcHMgaXQgcmVzdW1hYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3RQZWVyKGFnZW50LCBwZWVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1yZWxlYXNlLWludGVudCcpO1xuXHRcdFx0Y29uc3QgY2hhdCA9IHNlc3Npb25DaGF0V2l0aFBlZXJTaGFwZShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaSwgcmVzb3VyY2U6IGNoYXQgfTtcblxuXHRcdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIGNoYXQsIGNvbnRleHQsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy9yZXBvL3JlbGVhc2UnKV0sXG5cdFx0XHRcdG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KCdzZXNzaW9uLXJlbGVhc2UtaW50ZW50JykhO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogc3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdyZWxlYXNlLXRocmVhZCcsIGN3ZDogJy9yZXBvL3JlbGVhc2UnIH0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblxuXHRcdFx0Y29uc3QgcmVsZWFzaW5nID0gYWdlbnQuY2hhdHMucmVsZWFzZUNoYXQoY2hhdCwgY29udGV4dCk7XG5cdFx0XHRjb25zdCB1bnN1YnNjcmliZSA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiB1bnN1YnNjcmliZS5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHJlbGVhc2luZztcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHVuc3Vic2NyaWJlZDogeyBtZXRob2Q6IHVuc3Vic2NyaWJlLm1ldGhvZCwgdGhyZWFkSWQ6IHVuc3Vic2NyaWJlLnBhcmFtcy50aHJlYWRJZCB9LFxuXHRcdFx0XHRoYXNSdW50aW1lOiBhZ2VudFsnX3Nlc3Npb25zJ10uaGFzKCdzZXNzaW9uLXJlbGVhc2UtaW50ZW50JyksXG5cdFx0XHRcdC8vIEEgcmVsZWFzZSBpcyBub24tZGVzdHJ1Y3RpdmU6IHRoZSBjaGF0IGJpbmRpbmcgc3Vydml2ZXMgc28gdGhlXG5cdFx0XHRcdC8vIHNlc3Npb24gcmVzdW1lcyB0cmFuc3BhcmVudGx5IG9uIHRoZSBuZXh0IGFjY2Vzcy5cblx0XHRcdFx0aGFzQmluZGluZzogYWdlbnRbJ19zZXNzaW9uSWRCeUNoYXRVcmknXS5oYXMoY2hhdC50b1N0cmluZygpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dW5zdWJzY3JpYmVkOiB7IG1ldGhvZDogJ3RocmVhZC91bnN1YnNjcmliZScsIHRocmVhZElkOiAncmVsZWFzZS10aHJlYWQnIH0sXG5cdFx0XHRcdGhhc1J1bnRpbWU6IGZhbHNlLFxuXHRcdFx0XHRoYXNCaW5kaW5nOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZUNoYXQgdGVhcnMgZG93biBhIHN0aWxsLXByb3Zpc2lvbmFsIChuZXZlci1zZW50KSBjaGF0OiBwZW5kaW5nIHJlZ2lzdHJpZXMgcmVqZWN0LCB0aGUgcnVudGltZSBhbmQgYmluZGluZyBhcmUgZHJvcHBlZCwgYW5kIGEgcXVldWVkIHByZXdhcm0gY2FuIG5vIGxvbmdlciBtYXRlcmlhbGl6ZSBhIHRocmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCB7IHNka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQ6IHRydWUgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ3Nlc3Npb24tZGlzcG9zZS1wcm92aXNpb25hbCcpO1xuXHRcdGNvbnN0IGNoYXQgPSBzZXNzaW9uQ2hhdFdpdGhQZWVyU2hhcGUoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgY29udGV4dCA9IHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogY2hhdCB9O1xuXG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIGNoYXQsIGNvbnRleHQsIHtcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvcmVwby9kaXNwb3NlLXByb3Zpc2lvbmFsJyldLFxuXHRcdFx0bW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnc2Vzc2lvbi1kaXNwb3NlLXByb3Zpc2lvbmFsJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS50aHJlYWRJZCwgdW5kZWZpbmVkLCAncHJlY29uZGl0aW9uOiB0aGUgY2hhdCB3YXMgbmV2ZXIgc2VudCB0bywgc28gaXRzIGNvZGV4IHRocmVhZCBpcyBzdGlsbCBkZWZlcnJlZCcpO1xuXG5cdFx0Ly8gUGFyayBlbnRyaWVzIHRoZSB3YXkgYSBsaXZlIGNhbGwvYXBwcm92YWwgd291bGQsIHRvIHByb3ZlIGRpc3Bvc2FsXG5cdFx0Ly8gdW5wYXJrcyB0aGVtIGluc3RlYWQgb2YgbGVhdmluZyB0aGVpciBhd2FpdGVycyBoYW5naW5nIGZvcmV2ZXIuXG5cdFx0Y29uc3QgdG9vbENhbGwgPSBlbnRyeS5wZW5kaW5nQ2xpZW50VG9vbENhbGxzLnJlZ2lzdGVyKCd0b29sLWNhbGwtMScpO1xuXHRcdGNvbnN0IGFwcHJvdmFsID0gZW50cnkucGVuZGluZ0NvbW1hbmRBcHByb3ZhbHMucmVnaXN0ZXIoJ2FwcHJvdmFsLTEnKTtcblx0XHRjb25zdCB1c2VySW5wdXQgPSBlbnRyeS5wZW5kaW5nVXNlcklucHV0cy5yZWdpc3RlcignaW5wdXQtMScpO1xuXG5cdFx0Ly8gTm8gcGVlciBpcyBjb25uZWN0ZWQ6IGEgcHJvdmlzaW9uYWwgcnVudGltZSdzIHRlYXJkb3duIG5ldmVyIHRvdWNoZXNcblx0XHQvLyB0aGUgd2lyZSAodGhlcmUgaXMgbm8gY29kZXggdGhyZWFkIHlldCB0byBgdGhyZWFkL3Vuc3Vic2NyaWJlYCksIHNvXG5cdFx0Ly8gZGlzcG9zYWwgbXVzdCByZXNvbHZlIGVudGlyZWx5IGluLW1lbW9yeS5cblx0XHRhd2FpdCBhZ2VudC5jaGF0cy5kaXNwb3NlQ2hhdChjaGF0LCBjb250ZXh0KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHRvb2xDYWxsKTtcblx0XHQvLyBDb21tYW5kIGFwcHJvdmFscyBhcmUgdW5wYXJrZWQgYnkgcmVzb2x2aW5nIChgZGVueUFsbCgnZGVjbGluZScpYCksXG5cdFx0Ly8gbm90IHJlamVjdGluZzogdGhlIGNhbGxlciBhd2FpdGluZyB0aGUgZGVjaXNpb24gdW53aW5kcyB3aXRoIGFuXG5cdFx0Ly8gZXhwbGljaXQgXCJkZWNsaW5lZFwiIG91dGNvbWUgaW5zdGVhZCBvZiBhIHRocm93biBlcnJvci5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgYXBwcm92YWwsICdkZWNsaW5lJyk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHModXNlcklucHV0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzUnVudGltZTogYWdlbnRbJ19zZXNzaW9ucyddLmhhcygnc2Vzc2lvbi1kaXNwb3NlLXByb3Zpc2lvbmFsJyksXG5cdFx0XHRoYXNCaW5kaW5nOiBhZ2VudFsnX3Nlc3Npb25JZEJ5Q2hhdFVyaSddLmhhcyhjaGF0LnRvU3RyaW5nKCkpLFxuXHRcdFx0ZGlzcG9zZWQ6IGVudHJ5LmRpc3Bvc2VkLFxuXHRcdFx0aGFzUGVuZGluZ1Rvb2xDYWxsOiBlbnRyeS5wZW5kaW5nQ2xpZW50VG9vbENhbGxzLmhhcygndG9vbC1jYWxsLTEnKSxcblx0XHRcdGhhc1BlbmRpbmdBcHByb3ZhbDogZW50cnkucGVuZGluZ0NvbW1hbmRBcHByb3ZhbHMuaGFzKCdhcHByb3ZhbC0xJyksXG5cdFx0XHRoYXNQZW5kaW5nSW5wdXQ6IGVudHJ5LnBlbmRpbmdVc2VySW5wdXRzLmhhcygnaW5wdXQtMScpLFxuXHRcdH0sIHtcblx0XHRcdGhhc1J1bnRpbWU6IGZhbHNlLFxuXHRcdFx0aGFzQmluZGluZzogZmFsc2UsXG5cdFx0XHRkaXNwb3NlZDogdHJ1ZSxcblx0XHRcdGhhc1BlbmRpbmdUb29sQ2FsbDogZmFsc2UsXG5cdFx0XHRoYXNQZW5kaW5nQXBwcm92YWw6IGZhbHNlLFxuXHRcdFx0aGFzUGVuZGluZ0lucHV0OiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdC8vIEEgcHJld2FybSBxdWV1ZWQgKGUuZy4gYnkgYSB0aW1lciB0aGF0IGZpcmVkIGp1c3QgYWZ0ZXIgZGlzcG9zZSkgbXVzdFxuXHRcdC8vIG5vdCByZXN1cnJlY3QgdGhlIHRocmVhZCB0aGUgaG9zdCBhbHJlYWR5IGNvbnNpZGVycyBnb25lOiBkaXNwb3NlXG5cdFx0Ly8gdW5jb25kaXRpb25hbGx5IHRvcmUgdGhlIHByb3Zpc2lvbmFsIHJ1bnRpbWUgZG93biwgc29cblx0XHQvLyBgX21hdGVyaWFsaXplSWZOZWVkZWRgIFx1MjAxNCB0aGUgZXhhY3QgY2FsbCBgX3NjaGVkdWxlUHJld2FybWAgbWFrZXMgXHUyMDE0XG5cdFx0Ly8gbXVzdCBiZSBhbiBpbi1tZW1vcnkgbm8tb3AgaW5zdGVhZCBvZiByYWNpbmcgYSBgdGhyZWFkL3N0YXJ0YCBwYXN0XG5cdFx0Ly8gZGVsZXRpb24uIENhbGwgaXQgZGlyZWN0bHkgKHJhdGhlciB0aGFuIHJhY2luZyB0aGUgZmlyZS1hbmQtZm9yZ2V0XG5cdFx0Ly8gYF9zY2hlZHVsZVByZXdhcm1gIHRpbWVyKSBzbyB0aGUgYXNzZXJ0aW9uIGJlbG93IGlzIGRldGVybWluaXN0aWMuXG5cdFx0YXdhaXQgYWdlbnRbJ19tYXRlcmlhbGl6ZUlmTmVlZGVkJ10oZW50cnksIGVudHJ5LnNlc3Npb25VcmksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkudGhyZWFkSWQsIHVuZGVmaW5lZCwgJ2EgcXVldWVkIHByZXdhcm0gbXVzdCBuZXZlciBtYXRlcmlhbGl6ZSBhIHRocmVhZCBmb3IgYSBydW50aW1lIHRoYXQgd2FzIGFscmVhZHkgZGlzcG9zZWQnKTtcblxuXHRcdC8vIGBfc2NoZWR1bGVQcmV3YXJtYCBpdHNlbGYgbXVzdCBhbHNvIHRvbGVyYXRlIGJlaW5nIGludm9rZWQgYWZ0ZXJcblx0XHQvLyBkaXNwb3NhbCB3aXRob3V0IHRocm93aW5nIChhIGRlZmVuc2l2ZSByYWNlIGFnYWluc3QgYSB0aW1lciB0aGF0XG5cdFx0Ly8gZmlyZXMgaW4gdGhlIHNhbWUgdGljayBkaXNwb3NlIHJ1bnMpLlxuXHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4gYWdlbnRbJ19zY2hlZHVsZVByZXdhcm0nXShlbnRyeSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdPVGVsOiByZWxlYXNlQ2hhdCBwcmVzZXJ2ZXMgdGhlIHJ1bnRpbWVcXCdzIHRyYWNlIGNvbnRleHQ7IGEgbGF0ZXIgZGlzcG9zZUNoYXQgb2YgdGhlIGFscmVhZHktZXZpY3RlZCBydW50aW1lIHJlbGVhc2VzIGl0IHRocm91Z2ggdGhlIHNjb3BlLWZpbmFsaXphdGlvbiBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlbGVhc2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdHNka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQ6IHRydWUsXG5cdFx0XHRvdGVsU2VydmljZToge1xuXHRcdFx0XHRnZXRTZXNzaW9uVHJhY2VDb250ZXh0OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbGVhc2VTZXNzaW9uVHJhY2VDb250ZXh0OiBzZXNzaW9uVXJpS2V5ID0+IHJlbGVhc2VkLnB1c2goc2Vzc2lvblVyaUtleSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29ubmVjdFBlZXIoYWdlbnQsIHBlZXIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdzZXNzaW9uLW90ZWwtc2NvcGUnKTtcblx0XHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0geyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb25VcmksIHJlc291cmNlOiBjaGF0IH07XG5cblx0XHRcdGF3YWl0IGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBjaGF0LCBjb250ZXh0LCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvcmVwby9vdGVsLXNjb3BlJyldLFxuXHRcdFx0XHRtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnc2Vzc2lvbi1vdGVsLXNjb3BlJykhO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogc3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdvdGVsLXNjb3BlLXRocmVhZCcsIGN3ZDogJy9yZXBvL290ZWwtc2NvcGUnIH0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblxuXHRcdFx0Ly8gSWRsZSBldmljdGlvbiBtdXN0IG5ldmVyIHJlbGVhc2UgdGhlIHRyYWNlIGNvbnRleHQ6IHRoZSBydW50aW1lIGlzXG5cdFx0XHQvLyBleHBlY3RlZCB0byByZXN1bWUgbGF0ZXIgdW5kZXIgdGhlIHNhbWUgdHJhY2UgcGFyZW50LlxuXHRcdFx0Y29uc3QgcmVsZWFzaW5nID0gYWdlbnQuY2hhdHMucmVsZWFzZUNoYXQoY2hhdCwgY29udGV4dCk7XG5cdFx0XHRjb25zdCB1bnN1YnNjcmliZU9uUmVsZWFzZSA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiB1bnN1YnNjcmliZU9uUmVsZWFzZS5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHJlbGVhc2luZztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVsZWFzZWQsIFtdLCAncmVsZWFzZUNoYXQgbXVzdCBub3QgcmVsZWFzZSB0aGUgT1RlbCB0cmFjZSBjb250ZXh0Jyk7XG5cblx0XHRcdC8vIFRoZSBydW50aW1lIGlzIG5vdyBldmljdGVkIGZyb20gbWVtb3J5IGJ1dCB0aGUgY2hhdCBiaW5kaW5nIChhbmRcblx0XHRcdC8vIGl0cyBjb25maWd1cmF0aW9uLXNjb3BlIHJlZikgc3Vydml2ZS4gRGlzcG9zaW5nIGl0IG5vdyBleGVyY2lzZXNcblx0XHRcdC8vIHRoZSBzY29wZS1maW5hbGl6YXRpb24gcmVjbGFpbSBwYXRoIHJhdGhlciB0aGFuIHRoZSBpbi1tZW1vcnlcblx0XHRcdC8vIHJ1bnRpbWUgdGVhcmRvd24sIHNpbmNlIGBfc2Vzc2lvbnNgIG5vIGxvbmdlciBoYXMgYW4gZW50cnkuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRbJ19zZXNzaW9ucyddLmhhcygnc2Vzc2lvbi1vdGVsLXNjb3BlJyksIGZhbHNlLCAncHJlY29uZGl0aW9uOiB0aGUgcnVudGltZSB3YXMgZXZpY3RlZCBieSB0aGUgcmVsZWFzZSBhYm92ZScpO1xuXHRcdFx0YXdhaXQgYWdlbnQuY2hhdHMuZGlzcG9zZUNoYXQoY2hhdCwgY29udGV4dCk7XG5cblx0XHRcdGFzc2VydC5vayhyZWxlYXNlZC5sZW5ndGggPj0gMSwgJ2Rpc3Bvc2VDaGF0IG11c3QgcmVsZWFzZSB0aGUgdHJhY2UgY29udGV4dCBvbmNlIHRoZSBzY29wZSBoYXMgbm8gY2hhdHMgbGVmdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlbGVhc2VkLmV2ZXJ5KGtleSA9PiBrZXkgPT09IHNlc3Npb25VcmkudG9TdHJpbmcoKSksICdldmVyeSByZWxlYXNlIG11c3QgdXNlIHRoZSBleGFjdCBhY3F1aXNpdGlvbiBrZXkgKHRoaXMgcnVudGltZVxcJ3Mgb3duIHNlc3Npb25VcmkpLCBuZXZlciBhIGRpZmZlcmVudCBvbmUnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdPVGVsOiBkaXNwb3NlQ2hhdCBvZiBhIGxpdmUgaW4tbWVtb3J5IHJ1bnRpbWUgcmVsZWFzZXMgaXRzIHRyYWNlIGNvbnRleHQgdW5kZXIgdGhlIGV4YWN0IGtleSBpdCB3YXMgYWNxdWlyZWQgd2l0aCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWxlYXNlZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRzZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkOiB0cnVlLFxuXHRcdFx0b3RlbFNlcnZpY2U6IHtcblx0XHRcdFx0Z2V0U2Vzc2lvblRyYWNlQ29udGV4dDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWxlYXNlU2Vzc2lvblRyYWNlQ29udGV4dDogc2Vzc2lvblVyaUtleSA9PiByZWxlYXNlZC5wdXNoKHNlc3Npb25VcmlLZXkpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3RQZWVyKGFnZW50LCBwZWVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1vdGVsLWxpdmUnKTtcblx0XHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0geyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb25VcmksIHJlc291cmNlOiBjaGF0IH07XG5cblx0XHRcdGF3YWl0IGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBjaGF0LCBjb250ZXh0LCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvcmVwby9vdGVsLWxpdmUnKV0sXG5cdFx0XHRcdG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KCdzZXNzaW9uLW90ZWwtbGl2ZScpITtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAnb3RlbC1saXZlLXRocmVhZCcsIGN3ZDogJy9yZXBvL290ZWwtbGl2ZScgfSB9IH0pO1xuXHRcdFx0YXdhaXQgZW50cnkubWF0ZXJpYWxpemVQcm9taXNlO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NpbmcgPSBhZ2VudC5jaGF0cy5kaXNwb3NlQ2hhdChjaGF0LCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IHVuc3Vic2NyaWJlID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHVuc3Vic2NyaWJlLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgZGlzcG9zaW5nO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbGVhc2VkLCBbc2Vzc2lvblVyaS50b1N0cmluZygpXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndHJ1bmNhdGVDaGF0IHJvbGxzIGJhY2sgdGhlIHRocmVhZCBvZiB0aGUgYWRkcmVzc2VkIGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBzZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29ubmVjdFBlZXIoYWdlbnQsIHBlZXIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdzZXNzaW9uLXRydW5jYXRlJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci1jaGF0JykpO1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvL3RydW5jYXRlJyk7XG5cblx0XHRcdGF3YWl0IGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBzZXNzaW9uQ2hhdCwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb25VcmksIHJlc291cmNlOiBzZXNzaW9uQ2hhdCB9LCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW2ZvbGRlcl0sXG5cdFx0XHRcdG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnc2Vzc2lvbi10cnVuY2F0ZScpITtcblx0XHRcdGNvbnN0IHNlc3Npb25TdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzZXNzaW9uU3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdzZXNzaW9uLXRocmVhZCcsIGN3ZDogZm9sZGVyLmZzUGF0aCB9IH0gfSk7XG5cdFx0XHRhd2FpdCBzZXNzaW9uRW50cnkubWF0ZXJpYWxpemVQcm9taXNlO1xuXG5cdFx0XHRjb25zdCBjcmVhdGluZ1BlZXIgPSBhZ2VudC5jaGF0cy5jcmVhdGVDaGF0KHBlZXJDaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaSwgcmVzb3VyY2U6IHBlZXJDaGF0IH0sIHtcblx0XHRcdFx0bW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRjb25maWc6IHt9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwZWVyU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogcGVlclN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAncGVlci10aHJlYWQnLCBjd2Q6IGZvbGRlci5mc1BhdGggfSB9IH0pO1xuXHRcdFx0YXdhaXQgY3JlYXRpbmdQZWVyO1xuXG5cdFx0XHRjb25zdCB0cnVuY2F0aW5nID0gYWdlbnQudHJ1bmNhdGVDaGF0KHBlZXJDaGF0LCAndHVybi0yJywgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb25VcmksIHJlc291cmNlOiBwZWVyQ2hhdCB9KTtcblx0XHRcdGNvbnN0IHJlYWQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goe1xuXHRcdFx0XHRpZDogcmVhZC5pZCxcblx0XHRcdFx0cmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3BlZXItdGhyZWFkJywgY3dkOiBmb2xkZXIuZnNQYXRoLCB0dXJuczogW3sgaWQ6ICd0dXJuLTEnIH0sIHsgaWQ6ICd0dXJuLTInIH0sIHsgaWQ6ICd0dXJuLTMnIH1dIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgcm9sbGJhY2sgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogcm9sbGJhY2suaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRhd2FpdCB0cnVuY2F0aW5nO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0eyBtZXRob2Q6IHJlYWQubWV0aG9kLCB0aHJlYWRJZDogcmVhZC5wYXJhbXMudGhyZWFkSWQgfSxcblx0XHRcdFx0eyBtZXRob2Q6IHJvbGxiYWNrLm1ldGhvZCwgdGhyZWFkSWQ6IHJvbGxiYWNrLnBhcmFtcy50aHJlYWRJZCwgbnVtVHVybnM6IHJvbGxiYWNrLnBhcmFtcy5udW1UdXJucyB9LFxuXHRcdFx0XSwgW1xuXHRcdFx0XHR7IG1ldGhvZDogJ3RocmVhZC9yZWFkJywgdGhyZWFkSWQ6ICdwZWVyLXRocmVhZCcgfSxcblx0XHRcdFx0eyBtZXRob2Q6ICd0aHJlYWQvcm9sbGJhY2snLCB0aHJlYWRJZDogJ3BlZXItdGhyZWFkJywgbnVtVHVybnM6IDEgfSxcblx0XHRcdF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGFjdGl2ZSBjbGllbnQgaXMga2V5ZWQgdG8gdGhlIGV4YWN0IGFkZHJlc3NlZCBjaGF0OiBubyBzaWJsaW5nIGluZmVyZW5jZSwgYW5kIGNsZWFudXAgb24gcmVtb3ZhbC9kaXNwb3NhbCBuZXZlciB0b3VjaGVzIGEgc2libGluZyBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3RQZWVyKGFnZW50LCBwZWVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnc2Vzc2lvbi1leGFjdC1jbGllbnQnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25DaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLWNoYXQnKSk7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL3JlcG8vZXhhY3QtY2xpZW50Jyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ29udGV4dCA9IHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogc2Vzc2lvbkNoYXQgfTtcblx0XHRcdGNvbnN0IHBlZXJDb250ZXh0ID0geyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb25VcmksIHJlc291cmNlOiBwZWVyQ2hhdCB9O1xuXG5cdFx0XHRhd2FpdCBjcmVhdGVTZXNzaW9uQmFja2VkQ2hhdChhZ2VudCwgc2Vzc2lvbkNoYXQsIHNlc3Npb25Db250ZXh0LCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW2ZvbGRlcl0sXG5cdFx0XHRcdG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnc2Vzc2lvbi1leGFjdC1jbGllbnQnKSE7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogc2Vzc2lvblN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAnc2Vzc2lvbi10aHJlYWQnLCBjd2Q6IGZvbGRlci5mc1BhdGggfSB9IH0pO1xuXHRcdFx0YXdhaXQgc2Vzc2lvbkVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblxuXHRcdFx0Y29uc3QgY3JlYXRpbmdQZWVyID0gYWdlbnQuY2hhdHMuY3JlYXRlQ2hhdChwZWVyQ2hhdCwgcGVlckNvbnRleHQsIHtcblx0XHRcdFx0bW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRjb25maWc6IHt9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwZWVyU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogcGVlclN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAncGVlci10aHJlYWQnLCBjd2Q6IGZvbGRlci5mc1BhdGggfSB9IH0pO1xuXHRcdFx0YXdhaXQgY3JlYXRpbmdQZWVyO1xuXHRcdFx0Y29uc3QgcGVlckVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldCgncGVlci10aHJlYWQnKSE7XG5cblx0XHRcdC8vIFRoZSBzYW1lIGNsaWVudElkIGNvbnRyaWJ1dGVzIGRpZmZlcmVudCB0b29scyB0byBlYWNoIGV4YWN0IGNoYXQ7XG5cdFx0XHQvLyBuZWl0aGVyIGhhbmRsZSBtYXkgbGVhayBpbnRvIHRoZSBvdGhlcidzIHJ1bnRpbWUuXG5cdFx0XHRjb25zdCBzZXNzaW9uSGFuZGxlID0gYWdlbnQuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbkNoYXQsIHNlc3Npb25Db250ZXh0LCB7IGNsaWVudElkOiAnY2xpZW50LWV4YWN0JyB9KTtcblx0XHRcdHNlc3Npb25IYW5kbGUudG9vbHMgPSBbeyBuYW1lOiAnc2Vzc2lvbl90b29sJywgZGVzY3JpcHRpb246ICdzZXNzaW9uIG9ubHknLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JyB9IH1dO1xuXHRcdFx0Y29uc3QgcGVlckhhbmRsZSA9IGFnZW50LmdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHBlZXJDaGF0LCBwZWVyQ29udGV4dCwgeyBjbGllbnRJZDogJ2NsaWVudC1leGFjdCcgfSk7XG5cdFx0XHRwZWVySGFuZGxlLnRvb2xzID0gW3sgbmFtZTogJ3BlZXJfdG9vbCcsIGRlc2NyaXB0aW9uOiAncGVlciBvbmx5JywgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcgfSB9XTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNlc3Npb25Ub29sczogc2Vzc2lvbkVudHJ5LmNsaWVudFRvb2xTZXQubWVyZ2VkKCkubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSxcblx0XHRcdFx0cGVlclRvb2xzOiBwZWVyRW50cnkuY2xpZW50VG9vbFNldC5tZXJnZWQoKS5tYXAodG9vbCA9PiB0b29sLm5hbWUpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXNzaW9uVG9vbHM6IFsnc2Vzc2lvbl90b29sJ10sXG5cdFx0XHRcdHBlZXJUb29sczogWydwZWVyX3Rvb2wnXSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBFeHBsaWNpdGx5IHJlbW92aW5nIHRoZSBzZXNzaW9uIGNoYXQncyBjbGllbnQgbXVzdCBub3QgZGlzdHVyYiB0aGVcblx0XHRcdC8vIHBlZXIgY2hhdCdzIGNvbnRyaWJ1dGlvbiBvciBpdHMgaGFuZGxlLlxuXHRcdFx0YWdlbnQucmVtb3ZlQWN0aXZlQ2xpZW50KHNlc3Npb25DaGF0LCBzZXNzaW9uQ29udGV4dCwgJ2NsaWVudC1leGFjdCcpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NpbmcgPSBhZ2VudC5jaGF0cy5kaXNwb3NlQ2hhdChwZWVyQ2hhdCwgcGVlckNvbnRleHQpO1xuXHRcdFx0Y29uc3QgdW5zdWJzY3JpYmUgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogdW5zdWJzY3JpYmUuaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRhd2FpdCBkaXNwb3Npbmc7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXNzaW9uVG9vbHM6IHNlc3Npb25FbnRyeS5jbGllbnRUb29sU2V0Lm1lcmdlZCgpLm1hcCh0b29sID0+IHRvb2wubmFtZSksXG5cdFx0XHRcdHBlZXJUb29sczogcGVlckVudHJ5LmNsaWVudFRvb2xTZXQubWVyZ2VkKCkubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSxcblx0XHRcdFx0aGFzU2Vzc2lvbkhhbmRsZTogYWdlbnRbJ19hY3RpdmVDbGllbnRIYW5kbGVzJ10uaGFzKGAke3Nlc3Npb25DaGF0LnRvU3RyaW5nKCl9XFx1MDAwMGNsaWVudC1leGFjdGApLFxuXHRcdFx0XHRoYXNQZWVySGFuZGxlOiBhZ2VudFsnX2FjdGl2ZUNsaWVudEhhbmRsZXMnXS5oYXMoYCR7cGVlckNoYXQudG9TdHJpbmcoKX1cXHUwMDAwY2xpZW50LWV4YWN0YCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdC8vIFJlbW92YWwgY2xlYXJzIG9ubHkgdGhlIGFkZHJlc3NlZCBjaGF0J3MgY29udHJpYnV0aW9uLlxuXHRcdFx0XHRzZXNzaW9uVG9vbHM6IFtdLFxuXHRcdFx0XHQvLyBEaXNwb3NhbCBjbGVhbnMgdXAgdGhlIGRpc3Bvc2VkIGNoYXQncyBvd24gaGFuZGxlIHRoZSBzYW1lIHdheS5cblx0XHRcdFx0cGVlclRvb2xzOiBbXSxcblx0XHRcdFx0aGFzU2Vzc2lvbkhhbmRsZTogZmFsc2UsXG5cdFx0XHRcdGhhc1BlZXJIYW5kbGU6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYSBwZWVyIGNoYXRcXCdzIHNlcnZlci10b29sIGNhbGwgcm91dGVzIGV4ZWN1dGUvY29uZmlybWF0aW9uIHRocm91Z2ggdGhlIGhvc3QtYWRkcmVzc2VkIHNjb3BlLCBuZXZlciB0aGUgcGVlciBydW50aW1lXFwncyBvd24gdGhyZWFkIGlkZW50aXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBjYWxsczogeyByZWFkb25seSBtZXRob2Q6ICdyZXF1aXJlc0NvbmZpcm1hdGlvbicgfCAnZXhlY3V0ZVRvb2wnOyByZWFkb25seSBzY29wZTogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGFnZW50LnNldFNlcnZlclRvb2xIb3N0KGNyZWF0ZVJlY29yZGluZ0NhbGxTY29wZVNlcnZlclRvb2xIb3N0KGNhbGxzKSk7XG5cdFx0Y29uc3QgcGVlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRjb25uZWN0UGVlcihhZ2VudCwgcGVlcik7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ3Nlc3Npb24tcGVlci10b29sJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci1jaGF0JykpO1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvL3BlZXItdG9vbCcpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkNvbnRleHQgPSB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaSwgcmVzb3VyY2U6IHNlc3Npb25DaGF0IH07XG5cdFx0XHRjb25zdCBwZWVyQ29udGV4dCA9IHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLCByZXNvdXJjZTogcGVlckNoYXQgfTtcblxuXHRcdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIHNlc3Npb25DaGF0LCBzZXNzaW9uQ29udGV4dCwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25TdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzZXNzaW9uU3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdzZXNzaW9uLXRocmVhZCcsIGN3ZDogZm9sZGVyLmZzUGF0aCB9IH0gfSk7XG5cdFx0XHRhd2FpdCBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KCdzZXNzaW9uLXBlZXItdG9vbCcpIS5tYXRlcmlhbGl6ZVByb21pc2U7XG5cblx0XHRcdC8vIEEgcGVlciBjaGF0IHVuZGVyIHRoZSBzYW1lIHNlc3Npb24gY29uZmlnIHNjb3BlLCBidXQgYmFja2VkIGJ5XG5cdFx0XHQvLyBpdHMgb3duIHRocmVhZCBcdTIwMTQgdGhlIHJ1bnRpbWUgdGhpcyBjYWxsIHJlc29sdmVzIHRvIGlzIGtleWVkXG5cdFx0XHQvLyBgY29kZXg6L3BlZXItdGhyZWFkYCwgZGlzdGluY3QgZnJvbSBib3RoIHRoZSBhZGRyZXNzZWQgc2Vzc2lvblxuXHRcdFx0Ly8gKGBzZXNzaW9uVXJpYCkgYW5kIHRoZSBjaGF0IGNoYW5uZWwgKGBwZWVyQ2hhdGApLlxuXHRcdFx0Y29uc3QgY3JlYXRpbmdQZWVyID0gYWdlbnQuY2hhdHMuY3JlYXRlQ2hhdChwZWVyQ2hhdCwgcGVlckNvbnRleHQsIHtcblx0XHRcdFx0bW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRjb25maWc6IHt9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwZWVyU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogcGVlclN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAncGVlci10aHJlYWQnLCBjd2Q6IGZvbGRlci5mc1BhdGggfSB9IH0pO1xuXHRcdFx0YXdhaXQgY3JlYXRpbmdQZWVyO1xuXHRcdFx0Y29uc3QgcGVlckVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldCgncGVlci10aHJlYWQnKSE7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHRoZSBjb2RleCBhcHAtc2VydmVyIGludm9raW5nIHRoZSBob3N0J3Mgc2VydmVyIHRvb2wgb25cblx0XHRcdC8vIHRoZSBwZWVyIHJ1bnRpbWUncyBvd24gdGhyZWFkLlxuXHRcdFx0Y29uc3QgcmVzcG9uZGluZyA9IHJlYWROZXh0TWVzc2FnZShwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7XG5cdFx0XHRcdGlkOiA5MDAxLFxuXHRcdFx0XHRtZXRob2Q6ICdpdGVtL3Rvb2wvY2FsbCcsXG5cdFx0XHRcdHBhcmFtczogeyB0aHJlYWRJZDogJ3BlZXItdGhyZWFkJywgdHVybklkOiAndHVybi1pcnJlbGV2YW50JywgY2FsbElkOiAnY2FsbC0xJywgbmFtZXNwYWNlOiBudWxsLCB0b29sOiBQRUVSX1RFU1RfVE9PTF9OQU1FLCBhcmd1bWVudHM6IHt9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVzcG9uZGluZztcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHBlZXJSdW50aW1lVXJpOiBwZWVyRW50cnkuc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRjYWxscyxcblx0XHRcdFx0dG9vbFN1Y2NlZWRlZDogcmVzcG9uc2UucmVzdWx0Py5zdWNjZXNzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHQvLyBUaGUgYnVnIHRoaXMgZ3VhcmRzIGFnYWluc3Q6IHRoZSBwZWVyIHJ1bnRpbWUncyBvd25cblx0XHRcdFx0Ly8gYGNvZGV4Oi88dGhyZWFkSWQ+YCBpZGVudGl0eSBcdTIwMTQgbmVpdGhlciB0aGUgYWRkcmVzc2VkIEFIXG5cdFx0XHRcdC8vIHNlc3Npb24gbm9yIHRoZSBjaGF0IGNoYW5uZWwgXHUyMDE0IG11c3QgbmV2ZXIgcmVhY2ggdGhlIGhvc3QuXG5cdFx0XHRcdHBlZXJSdW50aW1lVXJpOiBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdwZWVyLXRocmVhZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNhbGxzOiBbXG5cdFx0XHRcdFx0eyBtZXRob2Q6ICdyZXF1aXJlc0NvbmZpcm1hdGlvbicsIHNjb3BlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0XHR7IG1ldGhvZDogJ2V4ZWN1dGVUb29sJywgc2NvcGU6IHNlc3Npb25VcmkudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHR0b29sU3VjY2VlZGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG59KTtcblxuc3VpdGUoJ0NvZGV4QWdlbnQgY2hhdCBiYWNraW5nIGR1cmFiaWxpdHknLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjb25uZWN0KGFnZW50OiBDb2RleEFnZW50LCBwZWVyOiBJVGVzdFBlZXIpOiB2b2lkIHtcblx0XHRjb25uZWN0UGVlcihhZ2VudCwgcGVlcik7XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm92aXNpb24gYSBzZXNzaW9uLCBsZXQgaXRzIHByZXdhcm1lZCBgdGhyZWFkL3N0YXJ0YCBsYW5kIG9uXG5cdCAqIGB0aHJlYWRJZGAsIGFuZCBkcml2ZSB0aGUgZmlyc3Qgc2VuZCBzbyB0aGUgc2Vzc2lvbi1zY29wZWQgbWF0ZXJpYWxpemVcblx0ICogcmVjZWlwdCBcdTIwMTQgdGhlIG9uZSBjYXJyeWluZyB0aGUgcmVmcmVzaGVkIGNoYXQgYmFja2luZyBcdTIwMTQgaXMgZW1pdHRlZC5cblx0ICovXG5cdGFzeW5jIGZ1bmN0aW9uIG1hdGVyaWFsaXplU2Vzc2lvbihhZ2VudDogQ29kZXhBZ2VudCwgcGVlcjogSVRlc3RQZWVyLCBzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgZm9sZGVyOiBVUkksIHRocmVhZElkOiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudE1hdGVyaWFsaXplQ2hhdEV2ZW50PiB7XG5cdFx0Y29uc3QgcmVjZWlwdHM6IElBZ2VudE1hdGVyaWFsaXplQ2hhdEV2ZW50W10gPSBbXTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IGFnZW50Lm9uRGlkTWF0ZXJpYWxpemVDaGF0KGUgPT4gcmVjZWlwdHMucHVzaChlKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNyZWF0ZVNlc3Npb25CYWNrZWRDaGF0KGFnZW50LCBjaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IGNoYXQgfSwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLFxuXHRcdFx0XHRtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiB0aHJlYWRJZCwgY3dkOiBmb2xkZXIuZnNQYXRoIH0gfSB9KTtcblx0XHRcdGF3YWl0IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSEubWF0ZXJpYWxpemVQcm9taXNlO1xuXG5cdFx0XHRjb25zdCBzZW5kaW5nID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdCwgJ2hlbGxvJywgW2ZvbGRlcl0sIHVuZGVmaW5lZCwgJ3R1cm4tMScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IGNoYXQgfSk7XG5cdFx0XHRjb25zdCB0dXJuID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHR1cm4uaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRhd2FpdCBzZW5kaW5nO1xuXHRcdFx0Ly8gVGhlIG92ZXJsYXkgd3JpdGUgdGhhdCByZWNvcmRzIHRoZSB0aHJlYWQgaWQgaXMgZmlyZS1hbmQtZm9yZ2V0LlxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRJbW1lZGlhdGUocmVzb2x2ZSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY2VpcHRzLmxlbmd0aCwgMSk7XG5cdFx0XHRyZXR1cm4gcmVjZWlwdHNbMF07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdtYXRlcmlhbGl6ZUNoYXQgcmVqZWN0cyBtaXNzaW5nIHBlZXIgYW5kIGNvcnJ1cHQgZGVmYXVsdCBwcm92aWRlckRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ2ludmFsaWQtYmFja2luZycpO1xuXHRcdGNvbnN0IHBlZXIgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyJykpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpO1xuXG5cdFx0Y29uc3QgbWlzc2luZ1BlZXIgPSBhd2FpdCBhZ2VudC5tYXRlcmlhbGl6ZUNoYXQocGVlciwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb24sIHJlc291cmNlOiBwZWVyIH0sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgY29ycnVwdERlZmF1bHQgPSBhd2FpdCBhZ2VudC5tYXRlcmlhbGl6ZUNoYXQoZGVmYXVsdENoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uLCByZXNvdXJjZTogZGVmYXVsdENoYXQgfSwgJ3snKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWlzc2luZ1BlZXIsXG5cdFx0XHRjb3JydXB0RGVmYXVsdCxcblx0XHRcdHNlc3Npb25zOiBbLi4uYWdlbnRbJ19zZXNzaW9ucyddLmtleXMoKV0sXG5cdFx0fSwge1xuXHRcdFx0bWlzc2luZ1BlZXI6IHVuZGVmaW5lZCxcblx0XHRcdGNvcnJ1cHREZWZhdWx0OiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBtYXRlcmlhbGl6ZSByZWNlaXB0IHJlLWtleXMgdGhlIGNoYXQgYmFja2luZyBvbnRvIHRoZSBydW50aW1lLCBzbyBhIHJlc3RvcmVkIHNlc3Npb24gc3RheXMgYWRkcmVzc2FibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0b3JlID0gY3JlYXRlVGVzdFNlc3Npb25TdG9yZSgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdob3N0LXNlc3Npb24nKTtcblx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpO1xuXHRcdGNvbnN0IGZvbGRlciA9IFVSSS5maWxlKCcvcmVwby9kdXJhYmxlJyk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBzZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkOiB0cnVlLCBzZXNzaW9uU3RvcmUgfSk7XG5cdFx0Y29uc3QgZmlyc3RQZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3QoZmlyc3QsIGZpcnN0UGVlcik7XG5cdFx0bGV0IHNlY29uZFBlZXI6IElUZXN0UGVlciB8IHVuZGVmaW5lZDtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWNlaXB0ID0gYXdhaXQgbWF0ZXJpYWxpemVTZXNzaW9uKGZpcnN0LCBmaXJzdFBlZXIsIHNlc3Npb24sIGNoYXQsIGZvbGRlciwgJ2NvZGV4LXRocmVhZCcpO1xuXG5cdFx0XHQvLyBBIGhvc3QgcmVzdGFydDogYSBicmFuZC1uZXcgYWdlbnQgaXMgb2ZmZXJlZCBub3RoaW5nIGJ1dCB0aGVcblx0XHRcdC8vIHBlcnNpc3RlZCBiYWNraW5nIGJsb2IgYW5kIHRoZSBVUklzIEFnZW50IEhvc3Qgb3ducy5cblx0XHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCB7IHNka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQ6IHRydWUsIHNlc3Npb25TdG9yZSB9KTtcblx0XHRcdHNlY29uZFBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0XHRjb25uZWN0KHNlY29uZCwgc2Vjb25kUGVlcik7XG5cdFx0XHRjb25zdCBzaWduYWxzOiBBZ2VudFNpZ25hbFtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2Vjb25kLm9uRGlkQ2hhdFByb2dyZXNzKHNpZ25hbCA9PiBzaWduYWxzLnB1c2goc2lnbmFsKSkpO1xuXG5cdFx0XHRjb25zdCByZXN0b3JpbmcgPSBzZWNvbmQuZ2V0Q2hhdE1ldGFkYXRhKGNoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uLCByZXNvdXJjZTogY2hhdCB9LCByZWNlaXB0LnJlc3VsdD8ucHJvdmlkZXJEYXRhKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsUHJvYmUgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3Qoc2Vjb25kUGVlci5vdXRib3VuZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWxQcm9iZS5wYXJhbXMudGhyZWFkSWQsICdob3N0LXNlc3Npb24nKTtcblx0XHRcdHNlY29uZFBlZXIucHVzaCh7IGlkOiBvcmlnaW5hbFByb2JlLmlkLCBlcnJvcjogeyBjb2RlOiAtMzIwMDAsIG1lc3NhZ2U6ICd0aHJlYWQgbm90IGZvdW5kJyB9IH0pO1xuXHRcdFx0Y29uc3QgcmVhZCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChzZWNvbmRQZWVyLm91dGJvdW5kKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkLnBhcmFtcy50aHJlYWRJZCwgJ2NvZGV4LXRocmVhZCcpO1xuXHRcdFx0c2Vjb25kUGVlci5wdXNoKHsgaWQ6IHJlYWQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdjb2RleC10aHJlYWQnLCBjd2Q6IGZvbGRlci5mc1BhdGgsIG1vZGVsUHJvdmlkZXI6ICd2c2NvZGUtcHJveHknLCB0dXJuczogW10gfSB9IH0pO1xuXHRcdFx0YXdhaXQgcmVzdG9yaW5nO1xuXHRcdFx0YXdhaXQgc2Vjb25kLm1hdGVyaWFsaXplQ2hhdChjaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IGNoYXQgfSwgcmVjZWlwdC5yZXN1bHQ/LnByb3ZpZGVyRGF0YSk7XG5cblx0XHRcdC8vIERyaXZlIGEgdHVybiBvbiB0aGUgcmVzdG9yZWQgY2hhdCBhbmQgZmFpbCBpdCBhdCBgdHVybi9zdGFydGAsIHNvXG5cdFx0XHQvLyB0aGUgcnVudGltZSBoYXMgdG8gcm91dGUgYSBjaGF0IGFjdGlvbiBiYWNrIHRvIHRoZSBjaGF0IGl0IGlzXG5cdFx0XHQvLyBib3VuZCB0by4gQSBydW50aW1lIHJlc3RvcmVkIHVuZGVyIGFuIGlkIG5vdGhpbmcgYWRkcmVzc2VzIGl0IGJ5XG5cdFx0XHQvLyBjYW5ub3QgZmluZCBpdHMgb3duIGJpbmRpbmcgYW5kIGRyb3BzIHRoZSB0dXJuIGluc3RlYWQuXG5cdFx0XHRjb25zdCByZXNlbmRpbmcgPSBzZWNvbmQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdCwgJ2FnYWluJywgW2ZvbGRlcl0sIHVuZGVmaW5lZCwgJ3R1cm4tMicsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IGNoYXQgfSk7XG5cdFx0XHRjb25zdCByZXN1bWUgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3Qoc2Vjb25kUGVlci5vdXRib3VuZCk7XG5cdFx0XHRzZWNvbmRQZWVyLnB1c2goeyBpZDogcmVzdW1lLmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAnY29kZXgtdGhyZWFkJywgY3dkOiBmb2xkZXIuZnNQYXRoIH0sIGN3ZDogZm9sZGVyLmZzUGF0aCB9IH0pO1xuXHRcdFx0Y29uc3QgdHVybiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChzZWNvbmRQZWVyLm91dGJvdW5kKTtcblx0XHRcdHNlY29uZFBlZXIucHVzaCh7IGlkOiB0dXJuLmlkLCBlcnJvcjogeyBjb2RlOiAtMzIwMDAsIG1lc3NhZ2U6ICd0dXJuIHJlamVjdGVkJyB9IH0pO1xuXHRcdFx0YXdhaXQgcmVzZW5kaW5nO1xuXG5cdFx0XHRjb25zdCByZXN0b3JlZCA9IHNlY29uZFsnX3Nlc3Npb25zJ10uZ2V0KCdob3N0LXNlc3Npb24nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRiYWNraW5nU2Vzc2lvbklkOiBKU09OLnBhcnNlKHJlY2VpcHQucmVzdWx0IS5wcm92aWRlckRhdGEhKS5zZXNzaW9uSWQsXG5cdFx0XHRcdGJhY2tpbmdTZXNzaW9uOiByZWNlaXB0LnJlc3VsdD8uYmFja2luZ1Nlc3Npb24/LnRvU3RyaW5nKCksXG5cdFx0XHRcdHJlc3RvcmVkVGhyZWFkSWQ6IHJlc3RvcmVkPy50aHJlYWRJZCxcblx0XHRcdFx0cmVzdG9yZWRTZXNzaW9uVXJpOiByZXN0b3JlZD8uc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRyZXN0b3JlZENoYXRDaGFubmVsOiByZXN0b3JlZD8uY2hhdENoYW5uZWw/LnRvU3RyaW5nKCksXG5cdFx0XHRcdHJlc3VtZTogeyBtZXRob2Q6IHJlc3VtZS5tZXRob2QsIHRocmVhZElkOiByZXN1bWUucGFyYW1zLnRocmVhZElkIH0sXG5cdFx0XHRcdHR1cm5BY3Rpb25zOiBzaWduYWxzLmZsYXRNYXAoc2lnbmFsID0+IHNpZ25hbC5raW5kID09PSAnYWN0aW9uJ1xuXHRcdFx0XHRcdD8gW3sgcmVzb3VyY2U6IHNpZ25hbC5yZXNvdXJjZS50b1N0cmluZygpLCB0eXBlOiBzaWduYWwuYWN0aW9uLnR5cGUgfV1cblx0XHRcdFx0XHQ6IFtdKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Ly8gVGhlIHJ1bnRpbWUncyBvd24gZHVyYWJsZSBpZCBcdTIwMTQgbm90IHRoZSBhcHAtc2VydmVyIHRocmVhZCBpZCxcblx0XHRcdFx0Ly8gd2hpY2ggdGhlIG1ldGFkYXRhIG92ZXJsYXkgb3ducyBhbmQgYSByZW1hdGVyaWFsaXphdGlvblxuXHRcdFx0XHQvLyByZXBsYWNlcy5cblx0XHRcdFx0YmFja2luZ1Nlc3Npb25JZDogJ2hvc3Qtc2Vzc2lvbicsXG5cdFx0XHRcdGJhY2tpbmdTZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdjb2RleC10aHJlYWQnKS50b1N0cmluZygpLFxuXHRcdFx0XHRyZXN0b3JlZFRocmVhZElkOiAnY29kZXgtdGhyZWFkJyxcblx0XHRcdFx0cmVzdG9yZWRTZXNzaW9uVXJpOiBzZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRcdHJlc3RvcmVkQ2hhdENoYW5uZWw6IGNoYXQudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVzdW1lOiB7IG1ldGhvZDogJ3RocmVhZC9yZXN1bWUnLCB0aHJlYWRJZDogJ2NvZGV4LXRocmVhZCcgfSxcblx0XHRcdFx0dHVybkFjdGlvbnM6IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBjaGF0LnRvU3RyaW5nKCksIHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogY2hhdC50b1N0cmluZygpLCB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmaXJzdFBlZXIuZGlzcG9zZSgpO1xuXHRcdFx0c2Vjb25kUGVlcj8uZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYSByZXN0b3JlZCBydW50aW1lIGlzIGFkZHJlc3NlZCBieSB0aGUgaWQgaXRzIGJhY2tpbmcgbmFtZXMsIG5ldmVyIGJ5IHRoZSBzZXNzaW9uIHRoYXQgYXNrZWQgZm9yIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogdHJ1ZSwgc2Vzc2lvblN0b3JlOiBjcmVhdGVUZXN0U2Vzc2lvblN0b3JlKCkgfSk7XG5cdFx0Y29uc3QgcGVlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRjb25uZWN0KGFnZW50LCBwZWVyKTtcblx0XHRjb25zdCBhZHZlcnRpc2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGFnZW50LnNldFNlcnZlclRvb2xIb3N0KGNyZWF0ZVJlY29yZGluZ1NlcnZlclRvb2xIb3N0KGFkdmVydGlzZWQpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBBIGJhY2tpbmcgdGhhdCBuYW1lcyBhIGRpZmZlcmVudCBydW50aW1lIHRoYW4gdGhlIGFkZHJlc3NlZFxuXHRcdFx0Ly8gc2Vzc2lvbiBcdTIwMTQgd2hhdCBhIHBlZXIgY2hhdCdzIGJsb2IgbG9va3MgbGlrZSwgYW5kIHdoYXQgYW55XG5cdFx0XHQvLyByZS1rZXllZCBiYWNraW5nIHdvdWxkIGxvb2sgbGlrZSBhZnRlciBhIHJlc3RhcnQuXG5cdFx0XHRjb25zdCBhZGRyZXNzZWQgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdhZGRyZXNzZWQtc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGFkZHJlc3NlZCkpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IHsgY29uZmlndXJhdGlvblJlc291cmNlOiBhZGRyZXNzZWQsIHJlc291cmNlOiBjaGF0IH07XG5cdFx0XHRjb25zdCByZXN0b3JpbmcgPSBhZ2VudC5nZXRDaGF0TWV0YWRhdGEoY2hhdCwgY29udGV4dCwgSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uSWQ6ICdiYWNraW5nLXJ1bnRpbWUnIH0pKTtcblx0XHRcdGNvbnN0IHJlYWQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogcmVhZC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ2JhY2tpbmctdGhyZWFkJywgY3dkOiAnL3JlcG8vYWRkcmVzc2VkJywgdHVybnM6IFtdIH0gfSB9KTtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgcmVzdG9yaW5nO1xuXG5cdFx0XHRjb25zdCByZXN0b3JlZCA9IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoJ2JhY2tpbmctcnVudGltZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG1ldGFkYXRhQ2hhdDogbWV0YWRhdGE/LmNoYXQudG9TdHJpbmcoKSxcblx0XHRcdFx0Ly8gVGhlIGVudHJ5J3Mgb3duIFVSSSBtdXN0IHJvdW5kLXRyaXAgdG8gdGhlIGtleSBpdCBpcyBzdG9yZWRcblx0XHRcdFx0Ly8gdW5kZXI7IHN0YW1waW5nIGl0IHdpdGggdGhlIGFkZHJlc3NlZCBzZXNzaW9uIHdvdWxkIGxlYXZlXG5cdFx0XHRcdC8vIGV2ZXJ5IGVudHJ5XHUyMTkybWFwIGxvb2t1cCBwb2ludGluZyBhdCBhIHJ1bnRpbWUgdGhhdCBkb2VzIG5vdFxuXHRcdFx0XHQvLyBleGlzdC5cblx0XHRcdFx0cmVzdG9yZWRTZXNzaW9uVXJpOiByZXN0b3JlZD8uc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRyZXN0b3JlZFRocmVhZElkOiByZXN0b3JlZD8udGhyZWFkSWQsXG5cdFx0XHRcdGFkZHJlc3NlZFJ1bnRpbWVFeGlzdHM6IGFnZW50Wydfc2Vzc2lvbnMnXS5oYXMoJ2FkZHJlc3NlZC1zZXNzaW9uJyksXG5cdFx0XHRcdC8vIFNlcnZlciB0b29scyBhcmUgc2Vzc2lvbi1zY29wZWQsIHNvIHRoZXkgYXJlIGFkdmVydGlzZWQgb25cblx0XHRcdFx0Ly8gdGhlIHNlc3Npb24gQWdlbnQgSG9zdCBhZGRyZXNzZWQgXHUyMDE0IHRoZSBvbmx5IFVSSSBpdCBrbm93cy5cblx0XHRcdFx0YWR2ZXJ0aXNlZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0bWV0YWRhdGFDaGF0OiBjaGF0LnRvU3RyaW5nKCksXG5cdFx0XHRcdHJlc3RvcmVkU2Vzc2lvblVyaTogQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnYmFja2luZy1ydW50aW1lJykudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVzdG9yZWRUaHJlYWRJZDogJ2JhY2tpbmctdGhyZWFkJyxcblx0XHRcdFx0YWRkcmVzc2VkUnVudGltZUV4aXN0czogZmFsc2UsXG5cdFx0XHRcdGFkdmVydGlzZWQ6IFthZGRyZXNzZWQudG9TdHJpbmcoKV0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdhIGxpdmUgcnVudGltZSBhbnN3ZXJzIG1ldGFkYXRhIGZyb20gbWVtb3J5IHdpdGggcmVhbCB0aW1lc3RhbXBzIGluc3RlYWQgb2YgYSAxOTcwIHBsYWNlaG9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdG9yZSA9IGNyZWF0ZVRlc3RTZXNzaW9uU3RvcmUoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnbGl2ZS1zZXNzaW9uJyk7XG5cdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblx0XHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL3JlcG8vbGl2ZScpO1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgc2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogdHJ1ZSwgc2Vzc2lvblN0b3JlIH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29ubmVjdChhZ2VudCwgcGVlcik7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gRGF0ZS5ub3coKTtcblx0XHRcdGF3YWl0IG1hdGVyaWFsaXplU2Vzc2lvbihhZ2VudCwgcGVlciwgc2Vzc2lvbiwgY2hhdCwgZm9sZGVyLCAnbGl2ZS10aHJlYWQnKTtcblxuXHRcdFx0Ly8gTm8gYXBwLXNlcnZlciB0cmFmZmljOiB0aGUgY29kZXggYXBwLXNlcnZlciBjYW5ub3QgYW5zd2VyXG5cdFx0XHQvLyBgdGhyZWFkL3JlYWRgIGZvciBhIHRocmVhZCBvZiBpdHMgb3duIHRoYXQgaXMgYmxvY2tlZCB3YWl0aW5nIG9uIGFcblx0XHRcdC8vIGR5bmFtaWMgdG9vbCBjYWxsLCB3aGljaCBpcyBleGFjdGx5IHRoZSBzdGF0ZSBhIHNlc3Npb24gc2VydmVyXG5cdFx0XHQvLyB0b29sIHJ1bnMgaW4uXG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IGFnZW50LmdldENoYXRNZXRhZGF0YShjaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IGNoYXQgfSwgSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uSWQ6ICdsaXZlLXNlc3Npb24nIH0pKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNoYXQ6IG1ldGFkYXRhPy5jaGF0LnRvU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogbWV0YWRhdGE/LndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZnNQYXRoKSxcblx0XHRcdFx0Ly8gUmVhbCBjbG9jayB2YWx1ZXM6IGAwYCB3b3VsZCBkYXRlIHRoZSBzZXNzaW9uIHRvIDE5NzAgYW5kXG5cdFx0XHRcdC8vIGludmVydCB0aGUgaG9zdCdzIGNyZWF0ZWQtYmVmb3JlIC8gY3JlYXRlZC1hZnRlciBmaWx0ZXJzLlxuXHRcdFx0XHRzdGFydGVkSW5UaGlzUnVuOiAobWV0YWRhdGE/LnN0YXJ0VGltZSA/PyAwKSA+PSBiZWZvcmUsXG5cdFx0XHRcdG1vZGlmaWVkQXRPckFmdGVyU3RhcnQ6IChtZXRhZGF0YT8ubW9kaWZpZWRUaW1lID8/IDApID49IChtZXRhZGF0YT8uc3RhcnRUaW1lID8/IDApLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjaGF0OiBjaGF0LnRvU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW2ZvbGRlci5mc1BhdGhdLFxuXHRcdFx0XHRzdGFydGVkSW5UaGlzUnVuOiB0cnVlLFxuXHRcdFx0XHRtb2RpZmllZEF0T3JBZnRlclN0YXJ0OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYSByZXN0b3JlZCBydW50aW1lIHByZXNlcnZlcyBpdHMgdGhyZWFkIHN1bW1hcnkgaW4gc3Vic2VxdWVudCBsaXZlIG1ldGFkYXRhIGxvb2t1cHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBzZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkOiB0cnVlLCBzZXNzaW9uU3RvcmU6IGNyZWF0ZVRlc3RTZXNzaW9uU3RvcmUoKSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3QoYWdlbnQsIHBlZXIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICduYW1lZC1zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uLCByZXNvdXJjZTogY2hhdCB9O1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uSWQ6ICduYW1lZC1zZXNzaW9uJyB9KTtcblx0XHRcdGNvbnN0IHJlc3RvcmluZyA9IGFnZW50LmdldENoYXRNZXRhZGF0YShjaGF0LCBjb250ZXh0LCBwcm92aWRlckRhdGEpO1xuXHRcdFx0Y29uc3QgcmVhZCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkLm1ldGhvZCwgJ3RocmVhZC9yZWFkJyk7XG5cdFx0XHRwZWVyLnB1c2goe1xuXHRcdFx0XHRpZDogcmVhZC5pZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0dGhyZWFkOiB7XG5cdFx0XHRcdFx0XHRpZDogJ25hbWVkLXRocmVhZCcsXG5cdFx0XHRcdFx0XHRuYW1lOiAnSW52ZXN0aWdhdGUgc2Vzc2lvbiB0aXRsZSBsb3NzJyxcblx0XHRcdFx0XHRcdGN3ZDogJy9yZXBvL25hbWVkJyxcblx0XHRcdFx0XHRcdGNyZWF0ZWRBdDogMV83MDBfMDAwXzAwMCxcblx0XHRcdFx0XHRcdHVwZGF0ZWRBdDogMV83MDBfMDAwXzEwMCxcblx0XHRcdFx0XHRcdHR1cm5zOiBbXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvbGRNZXRhZGF0YSA9IGF3YWl0IHJlc3RvcmluZztcblx0XHRcdC8vIFRoZSBmaXJzdCBsb29rdXAgcmVnaXN0ZXJzIGEgbGl2ZSBydW50aW1lLiBUaGUgc2Vjb25kIG11c3QgcmV0YWluXG5cdFx0XHQvLyB0aGUgdGl0bGUgd2l0aG91dCBhbm90aGVyIGFwcC1zZXJ2ZXIgcmVxdWVzdDogdGhhdCBzZXJ2ZXIgbWF5IGJlXG5cdFx0XHQvLyBibG9ja2VkIHdhaXRpbmcgb24gdGhlIHZlcnkgZHluYW1pYyB0b29sIGNhbGwgcmVxdWVzdGluZyBtZXRhZGF0YS5cblx0XHRcdGNvbnN0IGxpdmVNZXRhZGF0YSA9IGF3YWl0IGFnZW50LmdldENoYXRNZXRhZGF0YShjaGF0LCBjb250ZXh0LCBwcm92aWRlckRhdGEpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29sZFN1bW1hcnk6IGNvbGRNZXRhZGF0YT8uc3VtbWFyeSxcblx0XHRcdFx0bGl2ZVN1bW1hcnk6IGxpdmVNZXRhZGF0YT8uc3VtbWFyeSxcblx0XHRcdFx0bGl2ZVN0YXJ0VGltZTogbGl2ZU1ldGFkYXRhPy5zdGFydFRpbWUsXG5cdFx0XHRcdGxpdmVNb2RpZmllZFRpbWU6IGxpdmVNZXRhZGF0YT8ubW9kaWZpZWRUaW1lLFxuXHRcdFx0XHRwZW5kaW5nQXBwU2VydmVyQnl0ZXM6IHBlZXIub3V0Ym91bmQucmVhZGFibGVMZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbGRTdW1tYXJ5OiAnSW52ZXN0aWdhdGUgc2Vzc2lvbiB0aXRsZSBsb3NzJyxcblx0XHRcdFx0bGl2ZVN1bW1hcnk6ICdJbnZlc3RpZ2F0ZSBzZXNzaW9uIHRpdGxlIGxvc3MnLFxuXHRcdFx0XHRsaXZlU3RhcnRUaW1lOiAxXzcwMF8wMDBfMDAwXzAwMCxcblx0XHRcdFx0bGl2ZU1vZGlmaWVkVGltZTogMV83MDBfMDAwXzEwMF8wMDAsXG5cdFx0XHRcdHBlbmRpbmdBcHBTZXJ2ZXJCeXRlczogMCxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2xpdmUgcGVlciBtZXRhZGF0YSByZXNvbHZlcyB0aGUgcGVlciBiYWNraW5nIGluc3RlYWQgb2YgdGhlIG93bmluZyBkZWZhdWx0IGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBzZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkOiB0cnVlLCBzZXNzaW9uU3RvcmU6IGNyZWF0ZVRlc3RTZXNzaW9uU3RvcmUoKSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnbWV0YWRhdGEtb3duZXInKTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblx0XHRjb25zdCBwZWVyQ2hhdCA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ21ldGFkYXRhLXBlZXInKSk7XG5cdFx0YXdhaXQgYWdlbnQubWF0ZXJpYWxpemVDaGF0KGRlZmF1bHRDaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IGRlZmF1bHRDaGF0IH0sIEpTT04uc3RyaW5naWZ5KHsgc2Vzc2lvbklkOiAnZGVmYXVsdC1ydW50aW1lJyB9KSk7XG5cdFx0YXdhaXQgYWdlbnQubWF0ZXJpYWxpemVDaGF0KHBlZXJDaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IHBlZXJDaGF0IH0sIEpTT04uc3RyaW5naWZ5KHsgc2Vzc2lvbklkOiAncGVlci1ydW50aW1lJyB9KSk7XG5cdFx0YWdlbnRbJ19zZXNzaW9ucyddLmdldCgnZGVmYXVsdC1ydW50aW1lJykhLndvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3JlcG8vZGVmYXVsdCcpO1xuXHRcdGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoJ3BlZXItcnVudGltZScpIS53b3JraW5nRGlyZWN0b3J5ID0gVVJJLmZpbGUoJy9yZXBvL3BlZXInKTtcblxuXHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgYWdlbnQuZ2V0Q2hhdE1ldGFkYXRhKFxuXHRcdFx0cGVlckNoYXQsXG5cdFx0XHR7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IHBlZXJDaGF0IH0sXG5cdFx0XHRKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25JZDogJ3BlZXItcnVudGltZScgfSksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hhdDogbWV0YWRhdGE/LmNoYXQudG9TdHJpbmcoKSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogbWV0YWRhdGE/LndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZnNQYXRoKSxcblx0XHR9LCB7XG5cdFx0XHRjaGF0OiBwZWVyQ2hhdC50b1N0cmluZygpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy9yZXBvL3BlZXInKS5mc1BhdGhdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGZvcmtlZCBzZXNzaW9uIGhhbmRzIGJhY2sgaXRzIGJhY2tpbmcgb24gY3JlYXRpb24sIHNpbmNlIGl0IG5ldmVyIGVtaXRzIGEgZmlyc3Qtc2VuZCBtYXRlcmlhbGl6ZSByZWNlaXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdG9yZSA9IGNyZWF0ZVRlc3RTZXNzaW9uU3RvcmUoKTtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCB7IHNka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQ6IHRydWUsIHNlc3Npb25TdG9yZSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbm5lY3QoYWdlbnQsIHBlZXIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ2Zvcmstc291cmNlJyk7XG5cdFx0XHRjb25zdCBzb3VyY2VDaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc291cmNlKSk7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL3JlcG8vZm9yay1iYWNraW5nJyk7XG5cdFx0XHRhd2FpdCBtYXRlcmlhbGl6ZVNlc3Npb24oYWdlbnQsIHBlZXIsIHNvdXJjZSwgc291cmNlQ2hhdCwgZm9sZGVyLCAnc291cmNlLXRocmVhZCcpO1xuXG5cdFx0XHRjb25zdCBmb3JrU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ2ZvcmstdGFyZ2V0Jyk7XG5cdFx0XHRjb25zdCBmb3JrQ2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGZvcmtTZXNzaW9uKSk7XG5cdFx0XHRjb25zdCBmb3JraW5nID0gY3JlYXRlU2Vzc2lvbkJhY2tlZENoYXQoYWdlbnQsIGZvcmtDaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogZm9ya1Nlc3Npb24sIHJlc291cmNlOiBmb3JrQ2hhdCB9LCB7XG5cdFx0XHRcdGZvcms6IHsgc291cmNlOiBzb3VyY2VDaGF0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0dXJuSW5kZXg6IDAgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVhZCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiByZWFkLmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAnc291cmNlLXRocmVhZCcsIGN3ZDogZm9sZGVyLmZzUGF0aCwgdHVybnM6IFt7IGlkOiAndHVybi0xJyB9XSB9IH0gfSk7XG5cdFx0XHRjb25zdCBmb3JrID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IGZvcmsuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdmb3JrZWQtdGhyZWFkJywgY3dkOiBmb2xkZXIuZnNQYXRoIH0sIGN3ZDogZm9sZGVyLmZzUGF0aCB9IH0pO1xuXHRcdFx0Y29uc3QgZm9ya2VkID0gYXdhaXQgZm9ya2luZztcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNlc3Npb246IGZvcmtlZC5zZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRcdC8vIFRoZSBmb3JrIGlzIG1hdGVyaWFsaXplZCBvbiByZXR1cm4sIHNvIGBvbkRpZE1hdGVyaWFsaXplQ2hhdGBcblx0XHRcdFx0Ly8gbmV2ZXIgZmlyZXMgZm9yIGl0IFx1MjAxNCB0aGUgY3JlYXRlIHJlc3VsdCBpcyB0aGUgaG9zdCdzIG9ubHlcblx0XHRcdFx0Ly8gY2hhbmNlIHRvIHBlcnNpc3QgYSBiYWNraW5nIGl0IGNhbiByZXN0b3JlIGZyb20uIFRoZSBibG9iIG5hbWVzXG5cdFx0XHRcdC8vIHRoZSBydW50aW1lJ3Mgb3duIGR1cmFibGUgaWQsIHRoZSB0aHJlYWQgaWQgaXMgZGVjb3VwbGVkIGludG9cblx0XHRcdFx0Ly8gdGhlIG1ldGFkYXRhIG92ZXJsYXksIGFuZCB0aGUgdGhyZWFkIGl0c2VsZiBpcyByZXBvcnRlZCBhcyB0aGVcblx0XHRcdFx0Ly8gZXhhY3QgYmFja2luZyBzbyB0aGUgaG9zdCBjYW4gbWFyayBpdCBpbnRlcm5hbC5cblx0XHRcdFx0YmFja2luZ1Nlc3Npb25JZDogZm9ya2VkLnByb3ZpZGVyRGF0YSA/IEpTT04ucGFyc2UoZm9ya2VkLnByb3ZpZGVyRGF0YSkuc2Vzc2lvbklkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRiYWNraW5nU2Vzc2lvbjogZm9ya2VkLmJhY2tpbmdTZXNzaW9uPy50b1N0cmluZygpLFxuXHRcdFx0XHRydW50aW1lU2Vzc2lvblVyaTogYWdlbnRbJ19zZXNzaW9ucyddLmdldCgnZm9yay10YXJnZXQnKT8uc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRydW50aW1lVGhyZWFkSWQ6IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoJ2ZvcmstdGFyZ2V0Jyk/LnRocmVhZElkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXNzaW9uOiBmb3JrU2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRiYWNraW5nU2Vzc2lvbklkOiAnZm9yay10YXJnZXQnLFxuXHRcdFx0XHRiYWNraW5nU2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnZm9ya2VkLXRocmVhZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHJ1bnRpbWVTZXNzaW9uVXJpOiBmb3JrU2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRydW50aW1lVGhyZWFkSWQ6ICdmb3JrZWQtdGhyZWFkJyxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUEwSjtBQUNuSyxTQUFTLGNBQWMsMkJBQTJCO0FBQ2xELFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsMkJBQWtEO0FBQzNELFNBQVMsNkJBQTZCLCtCQUErQjtBQUNyRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQixrQ0FBa0M7QUFDdEUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxv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
