import assert from "assert";
import { PassThrough } from "stream";
import * as fs from "fs";
import * as os from "os";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { join, sep } from "../../../../../base/common/path.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { INativeEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { PluginFormat } from "../../../../agentPlugins/common/pluginParsers.js";
import { McpServerType } from "../../../../mcp/common/mcpPlatformTypes.js";
import { AgentSession } from "../../../common/agent.js";
import { ActionType } from "../../../common/state/sessionActions.js";
import { buildDefaultChatUri, parseChatUri, readSessionWorkspaceless, ResponsePartKind } from "../../../common/state/sessionState.js";
import { CustomizationType, McpServerStatus } from "../../../common/state/protocol/channels-session/state.js";
import { ISessionDataService } from "../../../common/sessionDataService.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../../node/agentConfigurationService.js";
import { IAgentHostCustomizationEnablementService } from "../../../node/agentHostCustomizationEnablementService.js";
import { AgentHostStateManager } from "../../../node/agentHostStateManager.js";
import { IAgentHostSessionTitleSignal } from "../../../node/agentHostSessionTitleSignal.js";
import { IAgentHostGitHubEndpointService } from "../../../node/agentHostGitHubEndpointService.js";
import { IAgentSdkDownloader } from "../../../node/agentSdkDownloader.js";
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from "../../../common/agentHostCheckpointService.js";
import { IAgentHostOTelService } from "../../../common/otel/agentHostOTelService.js";
import { CodexAgent, FORGE_LIVE_EDIT_INSTRUCTIONS, toCodexModelSelectionId } from "../../../node/codex/codexAgent.js";
import { CodexAppServerClient } from "../../../node/codex/codexAppServerClient.js";
import { ICodexProxyService } from "../../../node/codex/codexProxyService.js";
import { ICopilotApiService } from "../../../node/shared/copilotApiService.js";
import { createTestGitHubEndpointService } from "../testGitHubEndpointService.js";
import { AgentHostCodexMultiRootEnabledConfigKey } from "../../../common/agentHostSchema.js";
import { CodexSessionConfigKey } from "../../../common/codexSessionConfigKeys.js";
import { createSessionDataService, RecordingCheckpointService, TestSessionDatabase } from "../../common/sessionTestHelpers.js";
import { createNoopCustomizationEnablementService } from "../testCustomizationEnablementService.js";
const COPILOT_TEST_MODEL = toCodexModelSelectionId("vscode-proxy", "gpt-test");
const OPENAI_TEST_MODEL = toCodexModelSelectionId("openai", "gpt-5.6-sol");
function createTestPeer() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const onExit = new Emitter();
  const onceExitListeners = [];
  const fireExit = () => {
    const event = { code: 0, signal: null };
    onExit.fire(event);
    for (const listener of onceExitListeners.splice(0)) {
      listener(event);
    }
  };
  const transport = {
    stdin,
    stdout,
    kill: () => true,
    onExit: onExit.event,
    onExitOnce: (listener) => onceExitListeners.push(listener)
  };
  return {
    transport,
    outbound: stdin,
    push: (message) => stdout.write(JSON.stringify(message) + "\n"),
    exit: fireExit,
    dispose: () => {
      onceExitListeners.length = 0;
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
class TestCodexLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.warnings = [];
  }
  warn(message, ...args) {
    this.warnings.push([message, ...args].join(" "));
  }
}
class TestCodexFileService extends FileService {
  constructor() {
    super(...arguments);
    this.statFailures = /* @__PURE__ */ new Set();
  }
  failStat(resource) {
    this.statFailures.add(resource.toString());
  }
  stat(resource) {
    if (this.statFailures.has(resource.toString())) {
      return Promise.reject(new Error(`sensitive path: ${resource.fsPath}`));
    }
    return super.stat(resource);
  }
}
class TestCodexConfigurationService extends AgentConfigurationService {
  constructor(stateManager, logService, sessionConfig) {
    super(stateManager, logService);
    this.sessionConfig = sessionConfig;
  }
  setSessionConfig(sessionConfig) {
    this.sessionConfig = sessionConfig;
  }
  getSessionConfigValues() {
    return this.sessionConfig ? { ...this.sessionConfig } : void 0;
  }
}
async function createAgent(disposables, options = {}) {
  const models = [{ id: "gpt-test", name: "GPT Test", supported_endpoints: ["/responses"] }];
  const instantiationService = new TestInstantiationService();
  const logService = new TestCodexLogService();
  const fileService = disposables.add(new TestCodexFileService(logService));
  disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
  const stateManager = disposables.add(new AgentHostStateManager(logService));
  const configurationService = disposables.add(new TestCodexConfigurationService(stateManager, logService, options.sessionConfig));
  configurationService.updateRootConfig({ [AgentHostCodexMultiRootEnabledConfigKey]: options.multiRootEnabled });
  instantiationService.stub(ISessionDataService, createSessionDataService(options.database));
  instantiationService.stub(ICopilotApiService, { _serviceBrand: void 0, models: async () => models });
  instantiationService.stub(ICodexProxyService, { _serviceBrand: void 0 });
  instantiationService.stub(IAgentConfigurationService, configurationService);
  instantiationService.stub(IAgentHostCustomizationEnablementService, createNoopCustomizationEnablementService());
  instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
  instantiationService.stub(IAgentSdkDownloader, {
    _serviceBrand: void 0,
    isAvailable: () => true,
    isSdkResolvableWithoutDownload: async () => true
  });
  instantiationService.stub(IAgentHostCheckpointService, options.checkpointService ?? NULL_CHECKPOINT_SERVICE);
  instantiationService.stub(IAgentHostOTelService, {
    _serviceBrand: void 0,
    getNativeSdkTelemetryConfig: async () => void 0,
    getSessionTraceContext: () => void 0,
    releaseSessionTraceContext: () => {
    }
  });
  instantiationService.stub(IAgentHostSessionTitleSignal, { _serviceBrand: void 0, onDidChangeSessionTitle: Event.None });
  instantiationService.stub(IProductService, { _serviceBrand: void 0, version: "1.0.0-test" });
  instantiationService.stub(INativeEnvironmentService, { userHome: URI.file("/tmp") });
  instantiationService.stub(IFileService, fileService);
  instantiationService.stub(ILogService, logService);
  const agent = disposables.add(instantiationService.createInstance(CodexAgent));
  await agent.authenticate(agent.getProtectedResources()[0].resource, "test-token");
  await agent.refreshModels();
  return agent;
}
function defaultChatOf(session) {
  return URI.parse(buildDefaultChatUri(session));
}
function chatContext(session, chat) {
  return { configurationResource: session, resource: chat };
}
async function createSession(agent, options = {}) {
  const { session: requestedSession, ...chatOptions } = options;
  const session = requestedSession ?? AgentSession.uri(agent.id, generateUuid());
  const chat = defaultChatOf(session);
  const result = await agent.chats.createChat(chat, { configurationResource: session, resource: chat }, { deferBacking: !chatOptions.fork && !chatOptions.importConversation, ...chatOptions });
  return { ...result, session };
}
async function assertPrewarmEvictedOnSend(disposables, completePrewarmBeforeSend) {
  const agent = await createAgent(disposables);
  const peer = disposables.add(createTestPeer());
  const client = new CodexAppServerClient(peer.transport);
  agent["_connection"] = {
    kind: "ready",
    client,
    usageSource: "github",
    child: { kill: () => true }
  };
  agent["_refreshSkillHookCustomizations"] = async () => {
  };
  agent["_refreshSkillExtraRoots"] = async () => {
  };
  const folder = URI.file("/repo/folder");
  const worktree = URI.file("/repo/worktree");
  const { session } = await createSession(agent, { workingDirectories: [folder], model: { id: COPILOT_TEST_MODEL } });
  const entry = agent["_sessions"].get(AgentSession.id(session));
  const folderStart = await readNextRequest(peer.outbound);
  try {
    if (completePrewarmBeforeSend) {
      peer.push({ id: folderStart.id, result: { thread: { id: "thread-folder" } } });
      await entry.materializePromise;
    }
    const send = agent.chats.sendMessage(
      URI.parse(buildDefaultChatUri(session)),
      "hello",
      [worktree],
      void 0,
      "turn-1"
    );
    if (!completePrewarmBeforeSend) {
      peer.push({ id: folderStart.id, result: { thread: { id: "thread-folder" } } });
    }
    const unsubscribe = await readNextRequest(peer.outbound);
    peer.push({ id: unsubscribe.id, result: {} });
    const worktreeStart = await readNextRequest(peer.outbound);
    peer.push({ id: worktreeStart.id, result: { thread: { id: "thread-worktree" } } });
    const turnStart = await readNextRequest(peer.outbound);
    peer.push({ id: turnStart.id, result: {} });
    await send;
    assert.deepStrictEqual({
      requests: [
        { method: folderStart.method, cwd: folderStart.params.cwd },
        { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
        { method: worktreeStart.method, cwd: worktreeStart.params.cwd },
        { method: turnStart.method, threadId: turnStart.params.threadId }
      ],
      threadId: entry.threadId,
      workingDirectory: entry.workingDirectory?.fsPath,
      folderThreadRouted: agent["_sessionIdByThreadId"].has("thread-folder"),
      worktreeThreadRouted: agent["_sessionIdByThreadId"].has("thread-worktree")
    }, {
      requests: [
        { method: "thread/start", cwd: folder.fsPath },
        { method: "thread/unsubscribe", threadId: "thread-folder" },
        { method: "thread/start", cwd: worktree.fsPath },
        { method: "turn/start", threadId: "thread-worktree" }
      ],
      threadId: "thread-worktree",
      workingDirectory: worktree.fsPath,
      folderThreadRouted: false,
      worktreeThreadRouted: true
    });
  } finally {
    peer.exit();
  }
}
suite("CodexAgent prewarm eviction", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("lists Codex Desktop chats without a chosen folder as workspace-less", async () => {
    const agent = await createAgent(disposables);
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    const userHome = agent["_environmentService"].userHome;
    const generatedWorkspace = URI.joinPath(userHome, "Documents", "Codex", "2026-08-11", "this");
    const selectedWorkspace = URI.file(join(sep, "repo", "codex"));
    const sessionsDirectory = URI.joinPath(userHome, ".codex", "sessions", "2026", "08", "11");
    await agent["_fileService"].createFolder(sessionsDirectory);
    const desktopGeneratedRollout = URI.joinPath(sessionsDirectory, "desktop-generated.jsonl");
    const desktopSelectedRollout = URI.joinPath(sessionsDirectory, "desktop-selected.jsonl");
    const vscodeGeneratedRollout = URI.joinPath(sessionsDirectory, "vscode-generated.jsonl");
    await Promise.all([
      agent["_fileService"].createFile(desktopGeneratedRollout, VSBuffer.fromString('{"type":"session_meta","payload":{"originator":"Codex Desktop"}}\n')),
      agent["_fileService"].createFile(desktopSelectedRollout, VSBuffer.fromString('{"type":"session_meta","payload":{"originator":"Codex Desktop"}}\n')),
      agent["_fileService"].createFile(vscodeGeneratedRollout, VSBuffer.fromString('{"type":"session_meta","payload":{}}\n'))
    ]);
    const listing = agent["_listCodexChats"]();
    const request = await readNextRequest(peer.outbound);
    peer.push({
      id: request.id,
      result: {
        data: [
          { id: "desktop-generated", cwd: generatedWorkspace.fsPath, path: desktopGeneratedRollout.fsPath, source: "vscode", modelProvider: "openai", createdAt: 1, updatedAt: 2, name: "Desktop generated" },
          { id: "desktop-selected", cwd: selectedWorkspace.fsPath, path: desktopSelectedRollout.fsPath, source: "vscode", modelProvider: "openai", createdAt: 3, updatedAt: 4, name: "Desktop selected" },
          { id: "vscode-generated", cwd: generatedWorkspace.fsPath, path: vscodeGeneratedRollout.fsPath, source: "vscode", modelProvider: "openai", createdAt: 5, updatedAt: 6, name: "VS Code generated" }
        ],
        nextCursor: null
      }
    });
    const chats = await listing;
    assert.ok(chats);
    assert.deepStrictEqual(chats.map((chat) => ({
      id: AgentSession.id(parseChatUri(chat.chat).session),
      workspaceless: readSessionWorkspaceless(chat._meta),
      workingDirectories: chat.workingDirectories?.map((directory) => directory.fsPath)
    })), [
      { id: "desktop-generated", workspaceless: true, workingDirectories: [generatedWorkspace.fsPath] },
      { id: "desktop-selected", workspaceless: false, workingDirectories: [selectedWorkspace.fsPath] },
      { id: "vscode-generated", workspaceless: false, workingDirectories: [generatedWorkspace.fsPath] }
    ]);
    peer.exit();
  });
  test("bounds concurrent Codex Desktop rollout inspections while listing chats", async () => {
    const agent = await createAgent(disposables);
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    const release = new DeferredPromise();
    const saturated = new DeferredPromise();
    let active = 0;
    let maximum = 0;
    agent["_readCodexDesktopRolloutPrefix"] = async () => {
      active++;
      maximum = Math.max(maximum, active);
      if (active === 8) {
        saturated.complete();
      }
      await release.p;
      active--;
      return null;
    };
    const listing = agent["_listCodexChats"]();
    const request = await readNextRequest(peer.outbound);
    peer.push({
      id: request.id,
      result: {
        data: Array.from({ length: 32 }, (_, index) => ({
          id: `desktop-${index}`,
          cwd: `/workspace/${index}`,
          path: `/rollout/${index}.jsonl`,
          source: "vscode",
          modelProvider: "openai",
          createdAt: index,
          updatedAt: index
        })),
        nextCursor: null
      }
    });
    await saturated.p;
    assert.strictEqual(active, 8);
    release.complete();
    const chats = await listing;
    assert.deepStrictEqual({ maximum, count: chats?.length }, { maximum: 8, count: 32 });
    peer.exit();
  });
  test("bounds concurrent cold session reads", async () => {
    const agent = await createAgent(disposables);
    const release = new DeferredPromise();
    const saturated = new DeferredPromise();
    let active = 0;
    let maximum = 0;
    agent["_doReadSession"] = async () => {
      active++;
      maximum = Math.max(maximum, active);
      if (active === 8) {
        saturated.complete();
      }
      await release.p;
      active--;
      return void 0;
    };
    const reads = Promise.all(Array.from({ length: 32 }, (_, index) => agent["_readSession"](AgentSession.uri(agent.id, `session-${index}`))));
    await saturated.p;
    assert.strictEqual(active, 8);
    release.complete();
    await reads;
    assert.strictEqual(maximum, 8);
  });
  test("session actions target the owning session after the chat is bound", async () => {
    const agent = await createAgent(disposables);
    const signals = [];
    disposables.add(agent.onDidChatProgress((signal) => signals.push(signal)));
    const { session } = await createSession(agent, { workingDirectories: [URI.file("/repo")] });
    agent["_fire"](session, { type: ActionType.SessionActivityChanged, activity: "Working" });
    assert.deepStrictEqual(signals.map((signal) => signal.kind === "action" ? {
      resource: signal.resource.toString(),
      type: signal.action.type
    } : void 0), [{
      resource: session.toString(),
      type: ActionType.SessionActivityChanged
    }]);
  });
  test("immediately releases, restores, and sends a workspace-less peer before metadata flushes", async () => {
    const agent = await createAgent(disposables);
    agent["_schedulePrewarm"] = () => {
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const metadataWrite = new DeferredPromise();
    agent["_metadataStore"].write = async () => metadataWrite.p;
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    const parent = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
    const chat = URI.parse("agent-chat://peer/workspace-less");
    const creating = agent.chats.createChat(chat, { configurationResource: parent.session, resource: chat }, { model: { id: COPILOT_TEST_MODEL } });
    const start = await readNextRequest(peer.outbound);
    peer.push({ id: start.id, result: { thread: { id: "thread-peer" } } });
    const created = await creating;
    assert.ok(created);
    const peerEntry = agent["_sessions"].get("thread-peer");
    const managedDirectory = peerEntry.managedWorkingDirectory;
    assert.ok(managedDirectory);
    const backingSession = created.backingSession;
    assert.ok(backingSession);
    const releasing = agent.chats.releaseChat?.(chat, chatContext(parent.session, chat));
    const releaseUnsubscribe = await readNextRequest(peer.outbound);
    peer.push({ id: releaseUnsubscribe.id, result: {} });
    await releasing;
    assert.strictEqual(fs.existsSync(managedDirectory.fsPath), true);
    await agent.materializeChat(chat, parent.session, created.providerData);
    const restoredEntry = agent["_sessions"].get("thread-peer");
    const sending = agent.chats.sendMessage(chat, "hello", void 0, void 0, "turn-peer");
    const resume = await readNextRequest(peer.outbound);
    peer.push({
      id: resume.id,
      result: {
        thread: { id: "thread-peer", cwd: managedDirectory.fsPath },
        cwd: managedDirectory.fsPath
      }
    });
    const turn = await readNextRequest(peer.outbound);
    peer.push({ id: turn.id, result: {} });
    await sending;
    assert.deepStrictEqual({
      start: { method: start.method, cwd: start.params.cwd },
      release: { method: releaseUnsubscribe.method, threadId: releaseUnsubscribe.params.threadId },
      resume: { method: resume.method, threadId: resume.params.threadId },
      turn: { method: turn.method, threadId: turn.params.threadId },
      parentMaterialized: agent["_sessions"].get(AgentSession.id(parent.session))?.threadId,
      parentOwnsManagedDirectory: agent["_sessions"].get(AgentSession.id(parent.session))?.managedWorkingDirectory?.fsPath,
      restoredPeerOwnsManagedDirectory: restoredEntry.managedWorkingDirectory?.fsPath,
      managedDirectoryExists: fs.existsSync(managedDirectory.fsPath)
    }, {
      start: { method: "thread/start", cwd: managedDirectory.fsPath },
      release: { method: "thread/unsubscribe", threadId: "thread-peer" },
      resume: { method: "thread/resume", threadId: "thread-peer" },
      turn: { method: "turn/start", threadId: "thread-peer" },
      parentMaterialized: void 0,
      parentOwnsManagedDirectory: void 0,
      restoredPeerOwnsManagedDirectory: managedDirectory.fsPath,
      managedDirectoryExists: true
    });
    const disposing = agent.chats.disposeChat(chat, chatContext(parent.session, chat));
    const unsubscribe = await readNextRequest(peer.outbound);
    peer.push({ id: unsubscribe.id, result: {} });
    await disposing;
    assert.strictEqual(fs.existsSync(managedDirectory.fsPath), false);
    await metadataWrite.complete(void 0);
    peer.exit();
  });
  test("cold chat restore waits for model refresh before validating its provider-qualified model", async () => {
    const agent = await createAgent(disposables);
    const catalogModel = {
      ...agent.models.get()[0],
      provider: "chatgpt",
      id: toCodexModelSelectionId("openai", "gpt-test")
    };
    const selectedModel = { id: catalogModel.id, config: { reasoningEffort: "high" } };
    const refresh = new DeferredPromise();
    agent["_models"].set([], void 0);
    agent["_modelsRefreshPromise"] = refresh.p;
    const chat = URI.parse("agent-chat://peer/restored");
    const materializing = agent.materializeChat(chat, AgentSession.uri("codex", "parent"), JSON.stringify({
      sessionId: "restored-peer",
      model: selectedModel
    }));
    await Promise.resolve();
    assert.strictEqual(agent["_sessions"].has("restored-peer"), false);
    agent["_models"].set([catalogModel], void 0);
    await refresh.complete(void 0);
    await materializing;
    assert.deepStrictEqual(agent["_sessions"].get("restored-peer")?.model, selectedModel);
  });
  test("cold chat restore refreshes an empty model catalog before validation", async () => {
    const agent = await createAgent(disposables);
    const selectedModel = { id: COPILOT_TEST_MODEL, config: { reasoningEffort: "high" } };
    agent["_models"].set([], void 0);
    assert.strictEqual(agent["_modelsRefreshPromise"], void 0);
    await agent.materializeChat(
      URI.parse("agent-chat://peer/restored-empty-catalog"),
      AgentSession.uri("codex", "parent"),
      JSON.stringify({ sessionId: "restored-empty-catalog", model: selectedModel })
    );
    assert.deepStrictEqual(agent["_sessions"].get("restored-empty-catalog")?.model, selectedModel);
  });
  test("cold chat restore prefers the latest persisted model over its creation backing", async () => {
    const database = new TestSessionDatabase();
    const agent = await createAgent(disposables, { database });
    const baseModel = agent.models.get()[0];
    const creationModel = { id: "creation-model" };
    const persistedModel = { id: "persisted-model" };
    agent["_models"].set([
      { ...baseModel, id: creationModel.id },
      { ...baseModel, id: persistedModel.id }
    ], void 0);
    await database.setMetadata("codex.model", persistedModel.id);
    await agent.materializeChat(
      URI.parse("agent-chat://peer/restored-updated-model"),
      AgentSession.uri("codex", "parent"),
      JSON.stringify({ sessionId: "restored-updated-model", model: creationModel })
    );
    assert.deepStrictEqual(agent["_sessions"].get("restored-updated-model")?.model, persistedModel);
  });
  test("cold chat history resumes its backing thread before reading turns", async () => {
    const database = new TestSessionDatabase();
    await database.setMetadata("codex.threadId", "restored-history-thread");
    const agent = await createAgent(disposables, { database });
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    const chat = URI.parse("agent-chat://peer/restored-history");
    const parent = AgentSession.uri("codex", "parent");
    await agent.materializeChat(chat, parent, JSON.stringify({ sessionId: "restored-history" }));
    const reading = agent.chats.getMessages(chat, { configurationResource: parent, resource: chat });
    const resume = await readNextRequest(peer.outbound);
    peer.push({ id: resume.id, result: { thread: { id: "restored-history", turns: [] }, runtimeWorkspaceRoots: [] } });
    const read = await readNextRequest(peer.outbound);
    peer.push({
      id: read.id,
      result: {
        thread: {
          id: "restored-history",
          turns: [{
            id: "turn-1",
            items: [
              { type: "userMessage", id: "user-1", content: [{ type: "text", text: "hello", text_elements: [] }] },
              { type: "agentMessage", id: "agent-1", text: "restored", phase: null, memoryCitation: null }
            ],
            status: "completed"
          }]
        }
      }
    });
    const turns = await reading;
    const sending = agent.chats.sendMessage(chat, "follow up", void 0, void 0, "turn-2");
    const turn = await readNextRequest(peer.outbound);
    peer.push({ id: turn.id, result: {} });
    await sending;
    assert.deepStrictEqual({
      requests: [
        { method: resume.method, threadId: resume.params.threadId },
        { method: read.method, threadId: read.params.threadId },
        { method: turn.method, threadId: turn.params.threadId }
      ],
      turns: turns.map((turn2) => ({
        id: turn2.id,
        prompt: turn2.message.text,
        response: turn2.responseParts.map((part) => part.kind === ResponsePartKind.Markdown ? part.content : void 0)
      }))
    }, {
      requests: [
        { method: "thread/resume", threadId: "restored-history-thread" },
        { method: "thread/read", threadId: "restored-history-thread" },
        { method: "turn/start", threadId: "restored-history-thread" }
      ],
      turns: [{
        id: "turn-1",
        prompt: "hello",
        response: ["restored"]
      }]
    });
    peer.exit();
  });
  test("disposing a released workspace-less peer removes its managed directory", async () => {
    const agent = await createAgent(disposables);
    agent["_schedulePrewarm"] = () => {
    };
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    const parent = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
    const chat = URI.parse("agent-chat://peer/release-dispose");
    const creating = agent.chats.createChat(chat, { configurationResource: parent.session, resource: chat }, { model: { id: COPILOT_TEST_MODEL } });
    const start = await readNextRequest(peer.outbound);
    peer.push({ id: start.id, result: { thread: { id: "released-peer" } } });
    const created = await creating;
    assert.ok(created?.backingSession);
    const managedDirectory = agent["_sessions"].get("released-peer")?.managedWorkingDirectory;
    assert.ok(managedDirectory);
    await agent["_metadataStore"].read(created.backingSession);
    const releasing = agent.chats.releaseChat?.(chat, chatContext(parent.session, chat));
    const unsubscribe = await readNextRequest(peer.outbound);
    peer.push({ id: unsubscribe.id, result: {} });
    await releasing;
    assert.strictEqual(fs.existsSync(managedDirectory.fsPath), true);
    await agent.chats.disposeChat(chat, chatContext(parent.session, chat));
    assert.deepStrictEqual({
      sessionExists: agent["_sessions"].has("released-peer"),
      releasedOwnershipExists: agent["_releasedManagedWorkingDirectories"].has("released-peer"),
      managedDirectoryExists: fs.existsSync(managedDirectory.fsPath)
    }, {
      sessionExists: false,
      releasedOwnershipExists: false,
      managedDirectoryExists: false
    });
    peer.exit();
  });
  test("routes provider-qualified models independently and switches one session", async () => {
    const agent = await createAgent(disposables);
    agent["_schedulePrewarm"] = () => {
    };
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const chatGPTModel = toCodexModelSelectionId("openai", "gpt-test");
    agent["_models"].set([
      { provider: "copilot", id: COPILOT_TEST_MODEL, name: "GPT Test", supportsVision: false },
      { provider: "codex", id: chatGPTModel, name: "GPT Test", supportsVision: false }
    ], void 0);
    const copilot = await createSession(agent, { workingDirectories: [URI.file("/repo/copilot")], model: { id: COPILOT_TEST_MODEL } });
    const chatGPT = await createSession(agent, { workingDirectories: [URI.file("/repo/chatgpt")], model: { id: chatGPTModel } });
    const copilotEntry = agent["_sessions"].get(AgentSession.id(copilot.session));
    const chatGPTEntry = agent["_sessions"].get(AgentSession.id(chatGPT.session));
    const materializeCopilot = agent["_materializeIfNeeded"](copilotEntry, copilotEntry.sessionUri, false);
    const copilotStart = await readNextRequest(peer.outbound);
    peer.push({ id: copilotStart.id, result: { thread: { id: "thread-copilot" } } });
    await materializeCopilot;
    const materializeChatGPT = agent["_materializeIfNeeded"](chatGPTEntry, chatGPTEntry.sessionUri, false);
    const chatGPTStart = await readNextRequest(peer.outbound);
    peer.push({ id: chatGPTStart.id, result: { thread: { id: "thread-chatgpt" } } });
    await materializeChatGPT;
    await agent.chats.changeModel(defaultChatOf(copilot.session), { id: chatGPTModel }, chatContext(copilot.session, defaultChatOf(copilot.session)));
    const persistedAfterSwitch = await agent["_metadataStore"].read(copilot.session);
    const rematerializeCopilot = agent["_materializeIfNeeded"](copilotEntry, copilotEntry.sessionUri, false);
    const switchedStart = await readNextRequest(peer.outbound);
    peer.push({ id: switchedStart.id, result: { thread: { id: "thread-copilot-switched" } } });
    await rematerializeCopilot;
    assert.deepStrictEqual({
      copilotStart: { model: copilotStart.params.model, provider: copilotStart.params.modelProvider },
      chatGPTStart: { model: chatGPTStart.params.model, provider: chatGPTStart.params.modelProvider },
      switchedStart: { model: switchedStart.params.model, provider: switchedStart.params.modelProvider },
      copilotThread: copilotEntry.threadId,
      chatGPTThread: chatGPTEntry.threadId,
      persistedAfterSwitch: persistedAfterSwitch.modelId
    }, {
      copilotStart: { model: "gpt-test", provider: "vscode-proxy" },
      chatGPTStart: { model: "gpt-test", provider: "openai" },
      switchedStart: { model: "gpt-test", provider: "openai" },
      copilotThread: "thread-copilot-switched",
      chatGPTThread: "thread-chatgpt",
      persistedAfterSwitch: chatGPTModel
    });
    peer.exit();
  });
  test("evicts a completed folder prewarm when the first send resolves to a worktree", async () => {
    await assertPrewarmEvictedOnSend(disposables, true);
  });
  test("waits for and evicts an in-flight folder prewarm when the first send resolves to a worktree", async () => {
    await assertPrewarmEvictedOnSend(disposables, false);
  });
  test("/compact invokes thread/compact/start instead of starting a prompt turn", async () => {
    const agent = await createAgent(disposables);
    agent["_schedulePrewarm"] = () => {
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    const repo = URI.file("/repo");
    const { session } = await createSession(agent, { workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL } });
    const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "/compact", [repo], void 0, "turn-compact");
    const threadStart = await readNextRequest(peer.outbound);
    peer.push({ id: threadStart.id, result: { thread: { id: "thread-compact" } } });
    const compactStart = await readNextRequest(peer.outbound);
    peer.push({ id: compactStart.id, result: {} });
    await send;
    assert.deepStrictEqual({
      threadStart: { method: threadStart.method, cwd: threadStart.params.cwd },
      compactStart: { method: compactStart.method, threadId: compactStart.params.threadId },
      firstTurnSent: agent["_sessions"].get(AgentSession.id(session))?.firstTurnSent
    }, {
      threadStart: { method: "thread/start", cwd: repo.fsPath },
      compactStart: { method: "thread/compact/start", threadId: "thread-compact" },
      firstTurnSent: true
    });
    peer.exit();
  });
  test("thread start receives custom agents, instructions, skills, and MCP from client plugins", async () => {
    const agent = await createAgent(disposables);
    agent["_schedulePrewarm"] = () => {
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    const repo = URI.file("/repo");
    const pluginDir = URI.file("/plugin");
    const agentUri = URI.file("/plugin/agents/reviewer.agent.md");
    const instructionUri = URI.file("/plugin/rules/repo.instructions.md");
    const skillUri = URI.file("/plugin/skills/greet/SKILL.md");
    await agent["_fileService"].writeFile(agentUri, VSBuffer.fromString("---\nname: Reviewer\ndescription: Reviews changes\n---\nReview carefully."));
    await agent["_fileService"].writeFile(instructionUri, VSBuffer.fromString("---\ndescription: Repo rules\n---\nRun focused tests."));
    await agent["_fileService"].writeFile(skillUri, VSBuffer.fromString("---\nname: greet\ndescription: Greets\n---\nSay hello."));
    const parsed = {
      format: PluginFormat.OpenPlugin,
      hooks: [],
      agents: [{ uri: agentUri, name: "Reviewer", description: "Reviews changes", customization: { type: CustomizationType.Agent, id: "agent", uri: agentUri.toString(), name: "Reviewer" } }],
      instructions: [{ uri: instructionUri, name: "repo", customization: { type: CustomizationType.Rule, id: "rule", uri: instructionUri.toString(), name: "repo" } }],
      skills: [{ uri: skillUri, name: "greet", description: "Greets", customization: { type: CustomizationType.Skill, id: "skill", uri: skillUri.toString(), name: "greet" } }],
      mcpServers: [{
        name: "local",
        uri: URI.file("/plugin/.mcp.json"),
        configuration: { type: McpServerType.LOCAL, command: "node", args: ["server.js"] },
        customization: { type: CustomizationType.McpServer, id: "mcp", uri: "file:///plugin/.mcp.json", name: "local", state: { kind: McpServerStatus.Starting } }
      }]
    };
    const unsafeSession = URI.from({ scheme: "codex", path: "/../../codex-customization-victim" });
    const { session } = await createSession(agent, { session: unsafeSession, workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL }, agent: { uri: agentUri.toString() } });
    const entry = agent["_sessions"].get(AgentSession.id(session));
    entry.clientCustomizations.setClient("test", [{
      synced: { customization: { type: CustomizationType.Plugin, id: "plugin", uri: pluginDir.toString(), name: "plugin" }, pluginDir },
      parsed
    }]);
    const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "hello", [repo], void 0, "turn-1");
    const start = await readNextRequest(peer.outbound);
    const agents = start.params.config?.["agents"];
    const roleFile = await fs.promises.readFile(agents.Reviewer.config_file, "utf8");
    peer.push({ id: start.id, result: { thread: { id: "thread-custom" } } });
    const turn = await readNextRequest(peer.outbound);
    peer.push({ id: turn.id, result: {} });
    await send;
    assert.deepStrictEqual({
      mcp: start.params.config?.["mcp_servers"],
      agentDescription: agents.Reviewer.description,
      developerInstructions: start.params.developerInstructions,
      turnDeveloperInstructions: turn.params.collaborationMode?.settings.developer_instructions,
      capabilityPaths: start.params.selectedCapabilityRoots?.map((root) => root.location.path),
      roleFile,
      roleFileUsesHostGeneratedRoot: agents.Reviewer.config_file.startsWith(join(os.tmpdir(), "vscode-agent-codex-customizations-"))
    }, {
      mcp: { local: { command: "node", args: ["server.js"] } },
      agentDescription: "Reviews changes",
      developerInstructions: "Run focused tests.\n\nReview carefully.",
      turnDeveloperInstructions: `Run focused tests.

Review carefully.

${FORGE_LIVE_EDIT_INSTRUCTIONS}`,
      capabilityPaths: [URI.file("/plugin/skills").fsPath],
      roleFile: 'name = "Reviewer"\ndescription = "Reviews changes"\ndeveloper_instructions = "Review carefully."\n',
      roleFileUsesHostGeneratedRoot: true
    });
    peer.exit();
  });
  test("resumes an established thread when the selected workspace agent changes", async () => {
    const agent = await createAgent(disposables);
    agent["_schedulePrewarm"] = () => {
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    const repo = URI.file("/repo-workspace-agent-edit");
    const agentUri = URI.joinPath(repo, ".github", "agents", "reviewer.agent.md");
    await agent["_fileService"].writeFile(agentUri, VSBuffer.fromString("---\nname: Reviewer\ndescription: Reviews changes\n---\nUse the original instructions."));
    const { session } = await createSession(agent, {
      workingDirectories: [repo],
      model: { id: COPILOT_TEST_MODEL },
      agent: { uri: agentUri.toString() }
    });
    const chat = URI.parse(buildDefaultChatUri(session));
    const firstSend = agent.chats.sendMessage(chat, "first", [repo], void 0, "turn-1");
    const start = await readNextRequest(peer.outbound);
    peer.push({ id: start.id, result: { thread: { id: "thread-workspace-agent" } } });
    const firstTurn = await readNextRequest(peer.outbound);
    peer.push({ id: firstTurn.id, result: {} });
    await firstSend;
    await agent["_fileService"].writeFile(agentUri, VSBuffer.fromString("---\nname: Reviewer\ndescription: Reviews changes\n---\nUse the updated instructions."));
    const secondSend = agent.chats.sendMessage(chat, "second", [repo], void 0, "turn-2");
    const unsubscribe = await readNextRequest(peer.outbound);
    peer.push({ id: unsubscribe.id, result: {} });
    const resume = await readNextRequest(peer.outbound);
    const resumedAgents = resume.params.config?.["agents"];
    const resumedRoleFile = await fs.promises.readFile(resumedAgents.Reviewer.config_file, "utf8");
    peer.push({ id: resume.id, result: { thread: { id: "thread-workspace-agent", cwd: repo.fsPath }, cwd: repo.fsPath } });
    const secondTurn = await readNextRequest(peer.outbound);
    peer.push({ id: secondTurn.id, result: {} });
    await secondSend;
    assert.deepStrictEqual({
      start: { method: start.method, developerInstructions: start.params.developerInstructions },
      firstTurn: { method: firstTurn.method, developerInstructions: firstTurn.params.collaborationMode?.settings.developer_instructions },
      unsubscribe: { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
      resume: { method: resume.method, developerInstructions: resume.params.developerInstructions },
      secondTurn: { method: secondTurn.method, developerInstructions: secondTurn.params.collaborationMode?.settings.developer_instructions },
      resumedRoleFile,
      needsResume: agent["_sessions"].get(AgentSession.id(session))?.needsResume
    }, {
      start: { method: "thread/start", developerInstructions: "Use the original instructions." },
      firstTurn: { method: "turn/start", developerInstructions: `Use the original instructions.

${FORGE_LIVE_EDIT_INSTRUCTIONS}` },
      unsubscribe: { method: "thread/unsubscribe", threadId: "thread-workspace-agent" },
      resume: { method: "thread/resume", developerInstructions: "Use the updated instructions." },
      secondTurn: { method: "turn/start", developerInstructions: `Use the updated instructions.

${FORGE_LIVE_EDIT_INSTRUCTIONS}` },
      resumedRoleFile: 'name = "Reviewer"\ndescription = "Reviews changes"\ndeveloper_instructions = "Use the updated instructions."\n',
      needsResume: false
    });
    peer.exit();
  });
  test("fresh multi-root start selects only existing secondary skill directories", async () => {
    const agent = await createAgent(disposables, { multiRootEnabled: true });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const repoC = URI.file("/repo-c");
    const primarySkills = URI.joinPath(repoA, ".agents", "skills");
    const repoBAgentsSkills = URI.joinPath(repoB, ".agents", "skills");
    const repoBCodexSkills = URI.joinPath(repoB, ".codex", "skills");
    const repoCAgentsSkills = URI.joinPath(repoC, ".agents", "skills");
    const repoCCodexSkills = URI.joinPath(repoC, ".codex", "skills");
    const fileService = agent["_fileService"];
    await fileService.createFolder(primarySkills);
    await fileService.createFolder(repoBAgentsSkills);
    await fileService.createFolder(repoBCodexSkills);
    await fileService.createFolder(URI.joinPath(repoC, ".agents"));
    await fileService.createFile(repoCAgentsSkills);
    await fileService.createFolder(repoCCodexSkills);
    try {
      const { session } = await createSession(agent, { workingDirectories: [repoA, repoB, repoC], model: { id: COPILOT_TEST_MODEL } });
      const entry = agent["_sessions"].get(AgentSession.id(session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "thread" } } });
      await entry.materializePromise;
      await fileService.del(repoBAgentsSkills, { recursive: true });
      const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "hello", [repoA, repoB, repoC], void 0, "turn-1");
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await send;
      assert.deepStrictEqual({
        startMethod: start.method,
        selectedPaths: start.params.selectedCapabilityRoots?.map((root) => root.location.path),
        nextMethodAfterSnapshotMutation: turn.method,
        turnSelectedCapabilityRoots: turn.params.selectedCapabilityRoots
      }, {
        startMethod: "thread/start",
        selectedPaths: [repoBAgentsSkills.fsPath, repoBCodexSkills.fsPath, repoCCodexSkills.fsPath],
        nextMethodAfterSnapshotMutation: "turn/start",
        turnSelectedCapabilityRoots: void 0
      });
    } finally {
      peer.exit();
    }
  });
  test("unexpected capability-root metadata failures warn without blocking start or exposing paths", async () => {
    const agent = await createAgent(disposables, { multiRootEnabled: true });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const repoBAgentsSkills = URI.joinPath(repoB, ".agents", "skills");
    const repoBCodexSkills = URI.joinPath(repoB, ".codex", "skills");
    const fileService = agent["_fileService"];
    const logService = agent["_logService"];
    assert.ok(fileService instanceof TestCodexFileService);
    assert.ok(logService instanceof TestCodexLogService);
    await fileService.createFolder(repoBAgentsSkills);
    fileService.failStat(repoBCodexSkills);
    try {
      const { session } = await createSession(agent, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
      const entry = agent["_sessions"].get(AgentSession.id(session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "thread" } } });
      await entry.materializePromise;
      const capabilityRootWarnings = logService.warnings.filter((warning) => warning.includes("selected capability root"));
      assert.deepStrictEqual({
        selectedPaths: start.params.selectedCapabilityRoots?.map((root) => root.location.path),
        warningCount: capabilityRootWarnings.length,
        warningIncludesPath: capabilityRootWarnings.some((warning) => warning.includes(repoB.fsPath)),
        warningIncludesRawError: capabilityRootWarnings.some((warning) => warning.includes("sensitive path"))
      }, {
        selectedPaths: [repoBAgentsSkills.fsPath],
        warningCount: 1,
        warningIncludesPath: false,
        warningIncludesRawError: false
      });
    } finally {
      peer.exit();
    }
  });
  test("pre-first-turn replacement reevaluates selected capability roots", async () => {
    const agent = await createAgent(disposables, { multiRootEnabled: true });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const repoBAgentsSkills = URI.joinPath(repoB, ".agents", "skills");
    const repoBCodexSkills = URI.joinPath(repoB, ".codex", "skills");
    const fileService = agent["_fileService"];
    await fileService.createFolder(repoBAgentsSkills);
    try {
      const { session } = await createSession(agent, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
      const entry = agent["_sessions"].get(AgentSession.id(session));
      const firstStart = await readNextRequest(peer.outbound);
      peer.push({ id: firstStart.id, result: { thread: { id: "thread-first" } } });
      await entry.materializePromise;
      await fileService.del(repoBAgentsSkills, { recursive: true });
      await fileService.createFolder(repoBCodexSkills);
      entry.clientToolSet.set("client", [{
        name: "test_tool",
        description: "Test tool",
        inputSchema: { type: "object" }
      }]);
      const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "hello", [repoA, repoB], void 0, "turn-1");
      const unsubscribe = await readNextRequest(peer.outbound);
      peer.push({ id: unsubscribe.id, result: {} });
      const secondStart = await readNextRequest(peer.outbound);
      peer.push({ id: secondStart.id, result: { thread: { id: "thread-second" } } });
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await send;
      assert.deepStrictEqual({
        firstSelectedPaths: firstStart.params.selectedCapabilityRoots?.map((root) => root.location.path),
        unsubscribeMethod: unsubscribe.method,
        secondSelectedPaths: secondStart.params.selectedCapabilityRoots?.map((root) => root.location.path),
        turnMethod: turn.method
      }, {
        firstSelectedPaths: [repoBAgentsSkills.fsPath],
        unsubscribeMethod: "thread/unsubscribe",
        secondSelectedPaths: [repoBCodexSkills.fsPath],
        turnMethod: "turn/start"
      });
    } finally {
      peer.exit();
    }
  });
  test("multi-root start and turn separate workspace roots from additional writable directories", async () => {
    const additionalDirectory = URI.file("/manual-write").fsPath;
    const sessionUri = AgentSession.uri("codex", "multi-root");
    const agent = await createAgent(disposables, {
      multiRootEnabled: true,
      sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory, `${additionalDirectory}${sep}`] }
    });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const duplicateRepoA = URI.file(`${repoA.fsPath}${sep}`);
    const caseVariantRepoA = URI.file(repoA.fsPath.toUpperCase());
    try {
      const workingDirectories = [repoA, duplicateRepoA, ...isWindows ? [caseVariantRepoA] : [], repoB];
      const { session } = await createSession(agent, { session: sessionUri, workingDirectories, model: { id: COPILOT_TEST_MODEL } });
      const entry = agent["_sessions"].get(AgentSession.id(session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "thread" }, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
      await entry.materializePromise;
      const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "hello", workingDirectories, void 0, "turn-1");
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await send;
      const configurationService = agent["_configurationService"];
      assert.ok(configurationService instanceof TestCodexConfigurationService);
      configurationService.setSessionConfig({ [CodexSessionConfigKey.PermissionsPreset]: "full-access" });
      const fullAccess = agent["_turnStartOptions"](entry, "gpt-test");
      configurationService.setSessionConfig({ [CodexSessionConfigKey.SandboxMode]: "read-only" });
      const readOnly = agent["_turnStartOptions"](entry, "gpt-test");
      assert.deepStrictEqual({
        start: {
          cwd: start.params.cwd,
          runtimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
          selectedCapabilityRoots: start.params.selectedCapabilityRoots
        },
        turn: {
          runtimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
          selectedCapabilityRoots: turn.params.selectedCapabilityRoots,
          sandboxPolicy: turn.params.sandboxPolicy
        },
        fullAccess: {
          runtimeWorkspaceRoots: fullAccess.runtimeWorkspaceRoots,
          sandboxPolicy: fullAccess.sandboxPolicy
        },
        readOnly: {
          runtimeWorkspaceRoots: readOnly.runtimeWorkspaceRoots,
          sandboxPolicy: readOnly.sandboxPolicy
        }
      }, {
        start: {
          cwd: repoA.fsPath,
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
          selectedCapabilityRoots: void 0
        },
        turn: {
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
          selectedCapabilityRoots: void 0,
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: [repoA.fsPath, repoB.fsPath, additionalDirectory],
            networkAccess: true,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false
          }
        },
        fullAccess: {
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
          sandboxPolicy: { type: "dangerFullAccess" }
        },
        readOnly: {
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
          sandboxPolicy: { type: "readOnly", networkAccess: false }
        }
      });
    } finally {
      peer.exit();
    }
  });
  test("consecutive sends replace and remove workspace roots on the existing thread", async () => {
    const agent = await createAgent(disposables, { multiRootEnabled: true });
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const repoC = URI.file("/repo-c");
    try {
      const created = await createSession(agent, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
      const entry = agent["_sessions"].get(AgentSession.id(created.session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "thread" } } });
      await entry.materializePromise;
      const firstSend = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), "first", [repoA, repoB], void 0, "turn-1");
      const firstTurn = await readNextRequest(peer.outbound);
      peer.push({ id: firstTurn.id, result: {} });
      await firstSend;
      const secondSend = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), "second", [repoA, repoC], void 0, "turn-2");
      const secondTurn = await readNextRequest(peer.outbound);
      peer.push({ id: secondTurn.id, result: {} });
      await secondSend;
      const thirdSend = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), "third", [repoA], void 0, "turn-3");
      const thirdTurn = await readNextRequest(peer.outbound);
      peer.push({ id: thirdTurn.id, result: {} });
      await thirdSend;
      assert.deepStrictEqual({
        second: {
          method: secondTurn.method,
          threadId: secondTurn.params.threadId,
          runtimeWorkspaceRoots: secondTurn.params.runtimeWorkspaceRoots,
          writableRoots: secondTurn.params.sandboxPolicy?.type === "workspaceWrite" ? secondTurn.params.sandboxPolicy.writableRoots : void 0
        },
        third: {
          method: thirdTurn.method,
          threadId: thirdTurn.params.threadId,
          runtimeWorkspaceRoots: thirdTurn.params.runtimeWorkspaceRoots,
          writableRoots: thirdTurn.params.sandboxPolicy?.type === "workspaceWrite" ? thirdTurn.params.sandboxPolicy.writableRoots : void 0
        }
      }, {
        second: {
          method: "turn/start",
          threadId: "thread",
          runtimeWorkspaceRoots: [repoA.fsPath, repoC.fsPath],
          writableRoots: [repoA.fsPath, repoC.fsPath]
        },
        third: {
          method: "turn/start",
          threadId: "thread",
          runtimeWorkspaceRoots: [repoA.fsPath],
          writableRoots: [repoA.fsPath]
        }
      });
    } finally {
      peer.exit();
    }
  });
  test("disabled multi-root preserves the existing additional-directory payload", async () => {
    const additionalDirectory = URI.file("/manual-write").fsPath;
    const sessionUri = AgentSession.uri("codex", "single-root");
    const agent = await createAgent(disposables, {
      sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory] }
    });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    try {
      const { session } = await createSession(agent, { session: sessionUri, workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
      const entry = agent["_sessions"].get(AgentSession.id(session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "thread" } } });
      await entry.materializePromise;
      const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "hello", [repoA], void 0, "turn-1");
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await send;
      assert.deepStrictEqual({
        startRuntimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
        startSelectedCapabilityRoots: start.params.selectedCapabilityRoots,
        turnRuntimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
        turnSelectedCapabilityRoots: turn.params.selectedCapabilityRoots,
        writableRoots: turn.params.sandboxPolicy?.type === "workspaceWrite" ? turn.params.sandboxPolicy.writableRoots : void 0
      }, {
        startRuntimeWorkspaceRoots: void 0,
        startSelectedCapabilityRoots: void 0,
        turnRuntimeWorkspaceRoots: [repoA.fsPath, additionalDirectory],
        turnSelectedCapabilityRoots: void 0,
        writableRoots: [repoA.fsPath, additionalDirectory]
      });
    } finally {
      peer.exit();
    }
  });
  test("enabled multi-root preserves single-folder protocol and sandbox behavior", async () => {
    const additionalDirectory = `${URI.file("/manual-write").fsPath}${sep}`;
    const sessionUri = AgentSession.uri("codex", "enabled-single-root");
    const agent = await createAgent(disposables, {
      multiRootEnabled: true,
      sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory] }
    });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repo = URI.file("/repo");
    try {
      const { session } = await createSession(agent, { session: sessionUri, workingDirectories: [repo], model: { id: COPILOT_TEST_MODEL } });
      const entry = agent["_sessions"].get(AgentSession.id(session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "thread" } } });
      await entry.materializePromise;
      const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "hello", [repo], void 0, "turn-1");
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await send;
      const configurationService = agent["_configurationService"];
      assert.ok(configurationService instanceof TestCodexConfigurationService);
      configurationService.setSessionConfig({ [CodexSessionConfigKey.PermissionsPreset]: "full-access" });
      const fullAccess = agent["_turnStartOptions"](entry, "gpt-test");
      configurationService.setSessionConfig({ [CodexSessionConfigKey.SandboxMode]: "read-only" });
      const readOnly = agent["_turnStartOptions"](entry, "gpt-test");
      assert.deepStrictEqual({
        start: {
          cwd: start.params.cwd,
          runtimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
          selectedCapabilityRoots: start.params.selectedCapabilityRoots
        },
        turn: {
          runtimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
          selectedCapabilityRoots: turn.params.selectedCapabilityRoots,
          sandboxPolicy: turn.params.sandboxPolicy
        },
        fullAccess: {
          runtimeWorkspaceRoots: fullAccess.runtimeWorkspaceRoots,
          sandboxPolicy: fullAccess.sandboxPolicy
        },
        readOnly: {
          runtimeWorkspaceRoots: readOnly.runtimeWorkspaceRoots,
          sandboxPolicy: readOnly.sandboxPolicy
        }
      }, {
        start: {
          cwd: repo.fsPath,
          runtimeWorkspaceRoots: void 0,
          selectedCapabilityRoots: void 0
        },
        turn: {
          runtimeWorkspaceRoots: [repo.fsPath, additionalDirectory],
          selectedCapabilityRoots: void 0,
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: [repo.fsPath, additionalDirectory],
            networkAccess: true,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false
          }
        },
        fullAccess: {
          runtimeWorkspaceRoots: void 0,
          sandboxPolicy: { type: "dangerFullAccess" }
        },
        readOnly: {
          runtimeWorkspaceRoots: void 0,
          sandboxPolicy: { type: "readOnly", networkAccess: false }
        }
      });
    } finally {
      peer.exit();
    }
  });
  test("fork inherits the source workspace roots instead of requested replacements", async () => {
    const agent = await createAgent(disposables, { multiRootEnabled: true });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const requestedA = URI.file("/requested-a");
    const requestedB = URI.file("/requested-b");
    try {
      const source = await createSession(agent, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
      const sourceEntry = agent["_sessions"].get(AgentSession.id(source.session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "source-thread" }, cwd: repoA.fsPath, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
      await sourceEntry.materializePromise;
      const forkPromise = createSession(agent, {
        workingDirectories: [requestedA, requestedB],
        fork: { source: defaultChatOf(source.session), turnId: "turn-1", turnIndex: 0 }
      });
      const read = await readNextRequest(peer.outbound);
      peer.push({
        id: read.id,
        result: {
          thread: {
            id: "source-thread",
            cwd: repoA.fsPath,
            turns: [{ id: "turn-1" }]
          }
        }
      });
      const fork = await readNextRequest(peer.outbound);
      peer.push({
        id: fork.id,
        result: {
          thread: { id: "fork-thread", cwd: repoA.fsPath },
          cwd: repoA.fsPath,
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath]
        }
      });
      const forked = await forkPromise;
      const forkedEntry = agent["_sessions"].get(AgentSession.id(forked.session));
      assert.deepStrictEqual({
        request: {
          method: fork.method,
          cwd: fork.params.cwd,
          runtimeWorkspaceRoots: fork.params.runtimeWorkspaceRoots,
          model: fork.params.model,
          modelProvider: fork.params.modelProvider,
          selectedCapabilityRoots: fork.params.selectedCapabilityRoots
        },
        workingDirectories: forkedEntry.workingDirectories?.map((directory) => directory.fsPath)
      }, {
        request: {
          method: "thread/fork",
          cwd: repoA.fsPath,
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
          model: "gpt-test",
          modelProvider: "vscode-proxy",
          selectedCapabilityRoots: void 0
        },
        workingDirectories: [repoA.fsPath, repoB.fsPath]
      });
    } finally {
      peer.exit();
    }
  });
  test("fork from a workspace-less session owns an independent managed directory", async () => {
    const agent = await createAgent(disposables);
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const source = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
    const sourceChat = defaultChatOf(source.session);
    const sourceEntry = agent["_sessions"].get(AgentSession.id(source.session));
    const sending = agent.chats.sendMessage(sourceChat, "hello", void 0, void 0, "turn-1");
    const start = await readNextRequest(peer.outbound);
    peer.push({ id: start.id, result: { thread: { id: "managed-source", cwd: start.params.cwd } } });
    const sourceTurn = await readNextRequest(peer.outbound);
    peer.push({ id: sourceTurn.id, result: {} });
    await sending;
    const sourceDirectory = sourceEntry.managedWorkingDirectory;
    assert.ok(sourceDirectory);
    await fs.promises.writeFile(join(sourceDirectory.fsPath, "marker.txt"), "fork me");
    const forkSession = AgentSession.uri(agent.id, generateUuid());
    const forkChat = defaultChatOf(forkSession);
    const forking = createSession(agent, {
      session: forkSession,
      fork: { source: sourceChat, turnId: "turn-1", turnIndex: 0 }
    });
    const read = await readNextRequest(peer.outbound);
    peer.push({
      id: read.id,
      result: {
        thread: {
          id: "managed-source",
          cwd: sourceDirectory.fsPath,
          turns: [{ id: "turn-1" }]
        }
      }
    });
    const fork = await readNextRequest(peer.outbound);
    const forkDirectory = fork.params.cwd;
    assert.ok(forkDirectory);
    assert.notStrictEqual(forkDirectory, sourceDirectory.fsPath);
    peer.push({
      id: fork.id,
      result: {
        thread: { id: "managed-fork", cwd: forkDirectory },
        cwd: forkDirectory
      }
    });
    const forked = await forking;
    const forkedEntry = agent["_sessions"].get(AgentSession.id(forked.session));
    const disposingSource = agent.chats.disposeChat(sourceChat, { configurationResource: source.session, resource: sourceChat });
    const sourceUnsubscribe = await readNextRequest(peer.outbound);
    peer.push({ id: sourceUnsubscribe.id, result: {} });
    await disposingSource;
    assert.deepStrictEqual({
      forkRequest: { method: fork.method, cwd: fork.params.cwd },
      forkOwnsManagedDirectory: forkedEntry.managedWorkingDirectory?.fsPath,
      sourceDirectoryExists: fs.existsSync(sourceDirectory.fsPath),
      forkDirectoryExists: fs.existsSync(forkDirectory),
      copiedMarker: await fs.promises.readFile(join(forkDirectory, "marker.txt"), "utf8")
    }, {
      forkRequest: { method: "thread/fork", cwd: forkDirectory },
      forkOwnsManagedDirectory: forkDirectory,
      sourceDirectoryExists: false,
      forkDirectoryExists: true,
      copiedMarker: "fork me"
    });
    const disposingFork = agent.chats.disposeChat(forkChat, { configurationResource: forked.session, resource: forkChat });
    const forkUnsubscribe = await readNextRequest(peer.outbound);
    peer.push({ id: forkUnsubscribe.id, result: {} });
    await disposingFork;
    assert.strictEqual(fs.existsSync(forkDirectory), false);
    peer.exit();
  });
  test("cold resume restores persisted workspace roots", async () => {
    const database = new TestSessionDatabase();
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const agentA = await createAgent(disposables, { multiRootEnabled: true, database });
    const peerA = disposables.add(createTestPeer());
    agentA["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peerA.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    agentA["_refreshSkillHookCustomizations"] = async () => {
    };
    agentA["_refreshSkillExtraRoots"] = async () => {
    };
    let peerB;
    try {
      const created = await createSession(agentA, { workingDirectories: [repoA, repoB], model: { id: COPILOT_TEST_MODEL } });
      const entry = agentA["_sessions"].get(AgentSession.id(created.session));
      const start = await readNextRequest(peerA.outbound);
      peerA.push({ id: start.id, result: { thread: { id: "thread" }, cwd: repoA.fsPath, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
      await entry.materializePromise;
      const firstSend = agentA.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), "hello", [repoA, repoB], void 0, "turn-1");
      const firstTurn = await readNextRequest(peerA.outbound);
      peerA.push({ id: firstTurn.id, result: {} });
      await firstSend;
      await new Promise((resolve) => setImmediate(resolve));
      const canonicalOverlay = await agentA["_metadataStore"].read(AgentSession.uri("codex", "thread"));
      const agentB = await createAgent(disposables, { multiRootEnabled: true, database });
      peerB = disposables.add(createTestPeer());
      agentB["_connection"] = {
        kind: "ready",
        client: new CodexAppServerClient(peerB.transport),
        usageSource: "github",
        child: { kill: () => true }
      };
      agentB["_refreshSkillHookCustomizations"] = async () => {
      };
      agentB["_refreshSkillExtraRoots"] = async () => {
      };
      const restoredChat = defaultChatOf(created.session);
      const metadataPromise = agentB.getChatMetadata(restoredChat, { configurationResource: created.session, resource: restoredChat });
      const originalProbe = await readNextRequest(peerB.outbound);
      assert.strictEqual(originalProbe.params.threadId, AgentSession.id(created.session));
      peerB.push({ id: originalProbe.id, error: { code: -32e3, message: "thread not found" } });
      const read = await readNextRequest(peerB.outbound);
      peerB.push({
        id: read.id,
        result: {
          thread: {
            id: "thread",
            cwd: repoA.fsPath,
            modelProvider: "vscode-proxy",
            turns: []
          }
        }
      });
      const metadata = await metadataPromise;
      const resumedSend = agentB.chats.sendMessage(restoredChat, "again", void 0, void 0, "turn-2", void 0, void 0, { configurationResource: created.session, resource: restoredChat });
      const resume = await readNextRequest(peerB.outbound);
      peerB.push({
        id: resume.id,
        result: {
          thread: { id: "thread", cwd: repoA.fsPath },
          cwd: repoA.fsPath,
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath]
        }
      });
      const resumedTurn = await readNextRequest(peerB.outbound);
      peerB.push({ id: resumedTurn.id, result: {} });
      await resumedSend;
      assert.deepStrictEqual({
        canonicalOverlay: canonicalOverlay.workingDirectories?.map((directory) => directory.fsPath),
        metadata: metadata?.workingDirectories?.map((directory) => directory.fsPath),
        resume: {
          cwd: resume.params.cwd,
          runtimeWorkspaceRoots: resume.params.runtimeWorkspaceRoots,
          selectedCapabilityRoots: resume.params.selectedCapabilityRoots
        },
        turnRuntimeWorkspaceRoots: resumedTurn.params.runtimeWorkspaceRoots,
        turnSelectedCapabilityRoots: resumedTurn.params.selectedCapabilityRoots
      }, {
        canonicalOverlay: [repoA.fsPath, repoB.fsPath],
        metadata: [repoA.fsPath, repoB.fsPath],
        resume: {
          cwd: repoA.fsPath,
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
          selectedCapabilityRoots: void 0
        },
        turnRuntimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
        turnSelectedCapabilityRoots: void 0
      });
    } finally {
      peerB?.exit();
      peerA.exit();
    }
  });
  test("directly restored Desktop thread heals a stale overlay and uses the latest rollout provider", async () => {
    const database = new TestSessionDatabase();
    await Promise.all([
      database.setMetadata("codex.threadId", "replacement-thread"),
      database.setMetadata("codex.model", OPENAI_TEST_MODEL)
    ]);
    const agent = await createAgent(disposables, { database });
    const baseModel = agent.models.get()[0];
    agent["_models"].set([
      { ...baseModel, id: COPILOT_TEST_MODEL },
      { ...baseModel, id: OPENAI_TEST_MODEL }
    ], void 0);
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const session = AgentSession.uri("codex", "desktop-thread");
    const chat = defaultChatOf(session);
    const context = { configurationResource: session, resource: chat };
    const workingDirectory = URI.file("/workspace/codex");
    const sessionsDirectory = URI.joinPath(agent["_environmentService"].userHome, ".codex", "sessions");
    const rollout = URI.joinPath(sessionsDirectory, "desktop-thread.jsonl");
    await agent["_fileService"].createFolder(sessionsDirectory);
    await agent["_fileService"].createFile(rollout, VSBuffer.fromString([
      '{"type":"session_meta","payload":{"originator":"Codex Desktop","model_provider":"openai"}}',
      '{"type":"event_msg","payload":{"type":"thread_settings_applied","thread_settings":{"model":"gpt-test","model_provider_id":"vscode-proxy"}}}',
      '{"type":"event_msg","payload":{"type":"task_started","turn_id":"desktop-turn"}}',
      '{"type":"turn_context","payload":{"turn_id":"desktop-turn","model":"gpt-test"}}'
    ].join("\n")));
    const persistedTurn = {
      id: "desktop-turn",
      items: [
        { type: "userMessage", id: "user-1", clientId: null, content: [{ type: "text", text: "remember capybara", text_elements: [] }] },
        { type: "agentMessage", id: "assistant-1", text: "I will remember capybara.", phase: "final_answer", memoryCitation: null }
      ],
      itemsView: { type: "full" },
      status: "completed",
      error: null,
      startedAt: 1,
      completedAt: 2,
      durationMs: 1e3
    };
    const metadataPromise = agent.getChatMetadata(chat, context);
    const metadataRead = await readNextRequest(peer.outbound);
    peer.push({
      id: metadataRead.id,
      result: {
        thread: {
          id: metadataRead.params.threadId,
          cwd: workingDirectory.fsPath,
          modelProvider: "openai",
          path: rollout.fsPath,
          source: "vscode",
          turns: [persistedTurn]
        }
      }
    });
    const metadata = await metadataPromise;
    const restored = agent["_sessions"].get(AgentSession.id(session));
    const historyPromise = agent.chats.getMessages(chat, context);
    const resume = await readNextRequest(peer.outbound);
    peer.push({
      id: resume.id,
      result: {
        thread: { id: resume.params.threadId, cwd: workingDirectory.fsPath },
        cwd: workingDirectory.fsPath
      }
    });
    const historyRead = await readNextRequest(peer.outbound);
    peer.push({
      id: historyRead.id,
      result: {
        thread: {
          id: historyRead.params.threadId,
          cwd: workingDirectory.fsPath,
          modelProvider: "openai",
          path: rollout.fsPath,
          source: "vscode",
          turns: [persistedTurn]
        }
      }
    });
    const history = await historyPromise;
    const send = agent.chats.sendMessage(chat, "hello", [workingDirectory], void 0, "turn-1", void 0, void 0, context);
    const turn = await readNextRequest(peer.outbound);
    peer.push({ id: turn.id, result: {} });
    await send;
    assert.deepStrictEqual({
      metadataReadThreadId: metadataRead.params.threadId,
      metadataModel: metadata?.model?.id,
      restored: {
        threadId: restored?.threadId,
        model: restored?.model?.id,
        materializedModelProvider: restored?.materializedModelProvider
      },
      history: history.map((item) => ({
        id: item.id,
        message: item.message.text,
        messageModel: item.message.model?.id,
        usageModel: item.usage?.model
      })),
      resume: { method: resume.method, threadId: resume.params.threadId, modelProvider: resume.params.modelProvider },
      historyReadThreadId: historyRead.params.threadId,
      turn: { method: turn.method, threadId: turn.params.threadId, model: turn.params.model },
      overlay: {
        threadId: await database.getMetadata("codex.threadId"),
        modelId: await database.getMetadata("codex.model")
      }
    }, {
      metadataReadThreadId: "desktop-thread",
      metadataModel: COPILOT_TEST_MODEL,
      restored: {
        threadId: "desktop-thread",
        model: COPILOT_TEST_MODEL,
        materializedModelProvider: "vscode-proxy"
      },
      history: [{
        id: "desktop-turn",
        message: "remember capybara",
        messageModel: COPILOT_TEST_MODEL,
        usageModel: COPILOT_TEST_MODEL
      }],
      resume: { method: "thread/resume", threadId: "desktop-thread", modelProvider: "vscode-proxy" },
      historyReadThreadId: "desktop-thread",
      turn: { method: "turn/start", threadId: "desktop-thread", model: "gpt-test" },
      overlay: { threadId: "desktop-thread", modelId: COPILOT_TEST_MODEL }
    });
    peer.exit();
  });
});
suite("CodexAgent baseline checkpoint", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("captures the baseline checkpoint on the fresh first send but not on subsequent sends", async () => {
    const checkpointService = new RecordingCheckpointService();
    const agent = await createAgent(disposables, { checkpointService });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = { kind: "ready", client, usageSource: "github", child: { kill: () => true } };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const folder = URI.file("/repo/baseline-folder");
    const { session } = await createSession(agent, { workingDirectories: [folder], model: { id: COPILOT_TEST_MODEL } });
    const entry = agent["_sessions"].get(AgentSession.id(session));
    const chat = URI.parse(buildDefaultChatUri(session));
    const prewarmStart = await readNextRequest(peer.outbound);
    try {
      peer.push({ id: prewarmStart.id, result: { thread: { id: "thread-baseline" } } });
      await entry.materializePromise;
      const send1 = agent.chats.sendMessage(chat, "hello", [folder], void 0, "turn-1");
      const turnStart1 = await readNextRequest(peer.outbound);
      peer.push({ id: turnStart1.id, result: {} });
      await send1;
      const send2 = agent.chats.sendMessage(chat, "again", [folder], void 0, "turn-2");
      const turnStart2 = await readNextRequest(peer.outbound);
      peer.push({ id: turnStart2.id, result: {} });
      await send2;
      assert.deepStrictEqual(checkpointService.baselineCalls, [
        { session: session.toString(), workingDirectories: [folder.toString()] }
      ]);
    } finally {
      peer.exit();
    }
  });
});
suite("CodexAgent managed working directory ownership", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("a legacy overlay recording only the ownership flag is never reclaimed once cwd is adopted by a real folder", async () => {
    const agent = await createAgent(disposables);
    const session = AgentSession.uri("codex", "legacy-session");
    const chat = defaultChatOf(session);
    const sessionId = AgentSession.id(session);
    const userFolder = fs.mkdtempSync(join(os.tmpdir(), "vscode-codex-test-user-"));
    const marker = join(userFolder, "marker.txt");
    fs.writeFileSync(marker, "keep-me");
    try {
      await agent["_metadataStore"].write(session, {
        threadId: "legacy-thread",
        cwd: URI.file(userFolder),
        ownsManagedWorkingDirectory: true
      });
      await agent.materializeChat(chat, session, JSON.stringify({ sessionId }));
      assert.strictEqual(
        agent["_sessions"].get(sessionId)?.managedWorkingDirectory,
        void 0,
        "a legacy flag with no explicit path must not resurrect a managed directory"
      );
      agent["_releasedManagedWorkingDirectories"].clear();
      await agent.chats.releaseChat(chat, chatContext(session, chat));
      await agent.chats.disposeChat(chat, chatContext(session, chat));
      assert.strictEqual(fs.existsSync(marker), true, "the user folder must never be deleted");
    } finally {
      fs.rmSync(userFolder, { recursive: true, force: true });
    }
  });
  test("an explicit managed working directory is still reclaimed once the session is no longer live", async () => {
    const agent = await createAgent(disposables);
    const session = AgentSession.uri("codex", "explicit-managed-session");
    const chat = defaultChatOf(session);
    const sessionId = AgentSession.id(session);
    const managedFolder = fs.mkdtempSync(join(os.tmpdir(), "vscode-agent-codex-"));
    try {
      await agent["_metadataStore"].write(session, {
        threadId: "managed-thread",
        cwd: URI.file(managedFolder),
        ownsManagedWorkingDirectory: true,
        managedWorkingDirectory: URI.file(managedFolder)
      });
      await agent.materializeChat(chat, session, JSON.stringify({ sessionId }));
      assert.strictEqual(
        agent["_sessions"].get(sessionId)?.managedWorkingDirectory?.fsPath,
        URI.file(managedFolder).fsPath,
        "an explicit managed path is trusted and restored"
      );
      agent["_releasedManagedWorkingDirectories"].clear();
      await agent.chats.releaseChat(chat, chatContext(session, chat));
      await agent.chats.disposeChat(chat, chatContext(session, chat));
      assert.strictEqual(fs.existsSync(managedFolder), false, "the explicitly recorded managed folder is still cleaned up");
    } finally {
      fs.rmSync(managedFolder, { recursive: true, force: true });
    }
  });
  test("adopting a host-supplied working directory abandons a stale managed folder left behind by a failed thread start, and never touches the newly adopted folder", async () => {
    const agent = await createAgent(disposables);
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const peer = disposables.add(createTestPeer());
    agent["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peer.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    const { session } = await createSession(agent, { model: { id: COPILOT_TEST_MODEL } });
    const chat = defaultChatOf(session);
    const sessionId = AgentSession.id(session);
    let userFolder;
    try {
      const firstSend = agent.chats.sendMessage(chat, "hello", void 0, void 0, "turn-1");
      const failedStart = await readNextRequest(peer.outbound);
      assert.strictEqual(failedStart.method, "thread/start");
      peer.push({ id: failedStart.id, error: { code: -32e3, message: "boom" } });
      await firstSend;
      const entry = agent["_sessions"].get(sessionId);
      assert.strictEqual(entry.threadId, void 0, "the failed start never assigned a thread id");
      assert.strictEqual(entry.prewarmClaimed, true, "the real send already claimed prewarm before materializing");
      const staleManagedFolder = entry.managedWorkingDirectory;
      assert.ok(staleManagedFolder, "materialize created a managed folder before the failing thread/start call");
      assert.strictEqual(fs.existsSync(staleManagedFolder.fsPath), true);
      userFolder = fs.mkdtempSync(join(os.tmpdir(), "vscode-codex-test-adopted-"));
      const secondSend = agent.chats.sendMessage(chat, "hello again", [URI.file(userFolder)], void 0, "turn-2");
      const restart = await readNextRequest(peer.outbound);
      assert.strictEqual(restart.method, "thread/start");
      assert.strictEqual(restart.params.cwd, URI.file(userFolder).fsPath);
      peer.push({ id: restart.id, result: { thread: { id: "thread-adopt-2" } } });
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await secondSend;
      const restoredEntry = agent["_sessions"].get(sessionId);
      assert.deepStrictEqual({
        threadId: restoredEntry.threadId,
        workingDirectory: restoredEntry.workingDirectory?.fsPath,
        managedWorkingDirectory: restoredEntry.managedWorkingDirectory,
        staleManagedFolderExists: fs.existsSync(staleManagedFolder.fsPath),
        userFolderExists: fs.existsSync(userFolder)
      }, {
        threadId: "thread-adopt-2",
        workingDirectory: URI.file(userFolder).fsPath,
        managedWorkingDirectory: void 0,
        staleManagedFolderExists: false,
        userFolderExists: true
      });
    } finally {
      peer.exit();
      if (userFolder) {
        fs.rmSync(userFolder, { recursive: true, force: true });
      }
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhQcmV3YXJtRXZpY3Rpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ0NBTW9kZWwgfSBmcm9tICdAdnNjb2RlL2NvcGlsb3QtYXBpJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFBhc3NUaHJvdWdoIH0gZnJvbSAnc3RyZWFtJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHR5cGUgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgam9pbiwgc2VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBsdWdpbkZvcm1hdCwgdHlwZSBJUGFyc2VkUGx1Z2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlclR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9tY3AvY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uLCB0eXBlIEFnZW50U2lnbmFsLCB0eXBlIElBZ2VudENoYXRDb250ZXh0LCB0eXBlIElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCB0eXBlIElBZ2VudENyZWF0ZUNoYXRSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBwYXJzZUNoYXRVcmksIHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcywgUmVzcG9uc2VQYXJ0S2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvblR5cGUsIE1jcFNlcnZlclN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9hZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vZGUvYWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFNka0Rvd25sb2FkZXIgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50U2RrRG93bmxvYWRlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGV4QWdlbnQsIEZPUkdFX0xJVkVfRURJVF9JTlNUUlVDVElPTlMsIHRvQ29kZXhNb2RlbFNlbGVjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleEFnZW50LmpzJztcbmltcG9ydCB7IENvZGV4QXBwU2VydmVyQ2xpZW50LCB0eXBlIElDb2RleEFwcFNlcnZlclRyYW5zcG9ydCB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhBcHBTZXJ2ZXJDbGllbnQuanMnO1xuaW1wb3J0IHsgSUNvZGV4UHJveHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleFByb3h5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vdGVzdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IENvZGV4U2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2RleFNlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB0eXBlIHsgU2FuZGJveFBvbGljeSB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1NhbmRib3hQb2xpY3kuanMnO1xuaW1wb3J0IHR5cGUgeyBTZWxlY3RlZENhcGFiaWxpdHlSb290IH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvU2VsZWN0ZWRDYXBhYmlsaXR5Um9vdC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UsIFJlY29yZGluZ0NoZWNrcG9pbnRTZXJ2aWNlLCBUZXN0U2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb29wQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vdGVzdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJVGVzdFdpcmVSZXF1ZXN0IHtcblx0cmVhZG9ubHkgaWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbWV0aG9kOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmFtczoge1xuXHRcdHJlYWRvbmx5IGN3ZD86IHN0cmluZztcblx0XHRyZWFkb25seSB0aHJlYWRJZD86IHN0cmluZztcblx0XHRyZWFkb25seSBydW50aW1lV29ya3NwYWNlUm9vdHM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0XHRyZWFkb25seSBtb2RlbD86IHN0cmluZztcblx0XHRyZWFkb25seSBtb2RlbFByb3ZpZGVyPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzPzogcmVhZG9ubHkgU2VsZWN0ZWRDYXBhYmlsaXR5Um9vdFtdO1xuXHRcdHJlYWRvbmx5IHNhbmRib3hQb2xpY3k/OiBTYW5kYm94UG9saWN5O1xuXHRcdHJlYWRvbmx5IGNvbmZpZz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdHJlYWRvbmx5IGRldmVsb3Blckluc3RydWN0aW9ucz86IHN0cmluZztcblx0XHRyZWFkb25seSBjb2xsYWJvcmF0aW9uTW9kZT86IHsgcmVhZG9ubHkgc2V0dGluZ3M6IHsgcmVhZG9ubHkgZGV2ZWxvcGVyX2luc3RydWN0aW9uczogc3RyaW5nIHwgbnVsbCB9IH07XG5cdH07XG59XG5cbmNvbnN0IENPUElMT1RfVEVTVF9NT0RFTCA9IHRvQ29kZXhNb2RlbFNlbGVjdGlvbklkKCd2c2NvZGUtcHJveHknLCAnZ3B0LXRlc3QnKTtcbmNvbnN0IE9QRU5BSV9URVNUX01PREVMID0gdG9Db2RleE1vZGVsU2VsZWN0aW9uSWQoJ29wZW5haScsICdncHQtNS42LXNvbCcpO1xuXG5pbnRlcmZhY2UgSVRlc3RQZWVyIHtcblx0cmVhZG9ubHkgdHJhbnNwb3J0OiBJQ29kZXhBcHBTZXJ2ZXJUcmFuc3BvcnQ7XG5cdHJlYWRvbmx5IG91dGJvdW5kOiBQYXNzVGhyb3VnaDtcblx0cHVzaChtZXNzYWdlOiBvYmplY3QpOiB2b2lkO1xuXHRleGl0KCk6IHZvaWQ7XG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVzdFBlZXIoKTogSVRlc3RQZWVyIHtcblx0Y29uc3Qgc3RkaW4gPSBuZXcgUGFzc1Rocm91Z2goKTtcblx0Y29uc3Qgc3Rkb3V0ID0gbmV3IFBhc3NUaHJvdWdoKCk7XG5cdGNvbnN0IG9uRXhpdCA9IG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY29kZTogbnVtYmVyIHwgbnVsbDsgcmVhZG9ubHkgc2lnbmFsOiBOb2RlSlMuU2lnbmFscyB8IG51bGwgfT4oKTtcblx0Y29uc3Qgb25jZUV4aXRMaXN0ZW5lcnM6ICgoZXZlbnQ6IHsgcmVhZG9ubHkgY29kZTogbnVtYmVyIHwgbnVsbDsgcmVhZG9ubHkgc2lnbmFsOiBOb2RlSlMuU2lnbmFscyB8IG51bGwgfSkgPT4gdm9pZClbXSA9IFtdO1xuXHRjb25zdCBmaXJlRXhpdCA9ICgpID0+IHtcblx0XHRjb25zdCBldmVudCA9IHsgY29kZTogMCwgc2lnbmFsOiBudWxsIH07XG5cdFx0b25FeGl0LmZpcmUoZXZlbnQpO1xuXHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2Ygb25jZUV4aXRMaXN0ZW5lcnMuc3BsaWNlKDApKSB7XG5cdFx0XHRsaXN0ZW5lcihldmVudCk7XG5cdFx0fVxuXHR9O1xuXHRjb25zdCB0cmFuc3BvcnQ6IElDb2RleEFwcFNlcnZlclRyYW5zcG9ydCA9IHtcblx0XHRzdGRpbixcblx0XHRzdGRvdXQsXG5cdFx0a2lsbDogKCkgPT4gdHJ1ZSxcblx0XHRvbkV4aXQ6IG9uRXhpdC5ldmVudCxcblx0XHRvbkV4aXRPbmNlOiBsaXN0ZW5lciA9PiBvbmNlRXhpdExpc3RlbmVycy5wdXNoKGxpc3RlbmVyKSxcblx0fTtcblx0cmV0dXJuIHtcblx0XHR0cmFuc3BvcnQsXG5cdFx0b3V0Ym91bmQ6IHN0ZGluLFxuXHRcdHB1c2g6IG1lc3NhZ2UgPT4gc3Rkb3V0LndyaXRlKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpICsgJ1xcbicpLFxuXHRcdGV4aXQ6IGZpcmVFeGl0LFxuXHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdG9uY2VFeGl0TGlzdGVuZXJzLmxlbmd0aCA9IDA7XG5cdFx0XHRvbkV4aXQuZGlzcG9zZSgpO1xuXHRcdFx0c3RkaW4uZGVzdHJveSgpO1xuXHRcdFx0c3Rkb3V0LmRlc3Ryb3koKTtcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiByZWFkTmV4dFJlcXVlc3Qoc3RyZWFtOiBQYXNzVGhyb3VnaCk6IFByb21pc2U8SVRlc3RXaXJlUmVxdWVzdD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGNsZWFudXAoKTtcblx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ1RpbWVkIG91dCB3YWl0aW5nIGZvciBDb2RleCByZXF1ZXN0JykpO1xuXHRcdH0sIDFfMDAwKTtcblx0XHRjb25zdCBvbkRhdGEgPSAoY2h1bms6IEJ1ZmZlciB8IHN0cmluZykgPT4ge1xuXHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzb2x2ZShKU09OLnBhcnNlKHR5cGVvZiBjaHVuayA9PT0gJ3N0cmluZycgPyBjaHVuayA6IGNodW5rLnRvU3RyaW5nKCd1dGY4JykpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRzdHJlYW0ub2ZmKCdkYXRhJywgb25EYXRhKTtcblx0XHR9O1xuXHRcdHN0cmVhbS5vbmNlKCdkYXRhJywgb25EYXRhKTtcblx0fSk7XG59XG5cbmludGVyZmFjZSBJQ3JlYXRlQWdlbnRPcHRpb25zIHtcblx0cmVhZG9ubHkgbXVsdGlSb290RW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNlc3Npb25Db25maWc/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuIHwgc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10+Pjtcblx0cmVhZG9ubHkgZGF0YWJhc2U/OiBUZXN0U2Vzc2lvbkRhdGFiYXNlO1xuXHRyZWFkb25seSBjaGVja3BvaW50U2VydmljZT86IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZTtcbn1cblxuY2xhc3MgVGVzdENvZGV4TG9nU2VydmljZSBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHtcblx0cmVhZG9ubHkgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG5cblx0b3ZlcnJpZGUgd2FybihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMud2FybmluZ3MucHVzaChbbWVzc2FnZSwgLi4uYXJnc10uam9pbignICcpKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0Q29kZXhGaWxlU2VydmljZSBleHRlbmRzIEZpbGVTZXJ2aWNlIHtcblx0cHJpdmF0ZSByZWFkb25seSBzdGF0RmFpbHVyZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRmYWlsU3RhdChyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0RmFpbHVyZXMuYWRkKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc3RhdChyZXNvdXJjZTogVVJJKTogUmV0dXJuVHlwZTxGaWxlU2VydmljZVsnc3RhdCddPiB7XG5cdFx0aWYgKHRoaXMuc3RhdEZhaWx1cmVzLmhhcyhyZXNvdXJjZS50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgc2Vuc2l0aXZlIHBhdGg6ICR7cmVzb3VyY2UuZnNQYXRofWApKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLnN0YXQocmVzb3VyY2UpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RDb2RleENvbmZpZ3VyYXRpb25TZXJ2aWNlIGV4dGVuZHMgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdGxvZ1NlcnZpY2U6IFRlc3RDb2RleExvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSBzZXNzaW9uQ29uZmlnOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuIHwgc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10+PiB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0c3VwZXIoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHNldFNlc3Npb25Db25maWcoc2Vzc2lvbkNvbmZpZzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgYm9vbGVhbiB8IHN0cmluZyB8IHJlYWRvbmx5IHN0cmluZ1tdPj4pOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb25Db25maWcgPSBzZXNzaW9uQ29uZmlnO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlcygpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbkNvbmZpZyA/IHsgLi4udGhpcy5zZXNzaW9uQ29uZmlnIH0gOiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sIG9wdGlvbnM6IElDcmVhdGVBZ2VudE9wdGlvbnMgPSB7fSk6IFByb21pc2U8Q29kZXhBZ2VudD4ge1xuXHRjb25zdCBtb2RlbHMgPSBbeyBpZDogJ2dwdC10ZXN0JywgbmFtZTogJ0dQVCBUZXN0Jywgc3VwcG9ydGVkX2VuZHBvaW50czogWycvcmVzcG9uc2VzJ10gfV0gYXMgQ0NBTW9kZWxbXTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgVGVzdENvZGV4TG9nU2VydmljZSgpO1xuXHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENvZGV4RmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENvZGV4Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlLCBvcHRpb25zLnNlc3Npb25Db25maWcpKTtcblx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXldOiBvcHRpb25zLm11bHRpUm9vdEVuYWJsZWQgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25EYXRhU2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKG9wdGlvbnMuZGF0YWJhc2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29waWxvdEFwaVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBtb2RlbHM6IGFzeW5jICgpID0+IG1vZGVscyB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29kZXhQcm94eVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSwgY3JlYXRlTm9vcEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFNka0Rvd25sb2FkZXIsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0aXNBdmFpbGFibGU6ICgpID0+IHRydWUsXG5cdFx0aXNTZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkOiBhc3luYyAoKSA9PiB0cnVlLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIG9wdGlvbnMuY2hlY2twb2ludFNlcnZpY2UgPz8gTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RPVGVsU2VydmljZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRnZXROYXRpdmVTZGtUZWxlbWV0cnlDb25maWc6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRnZXRTZXNzaW9uVHJhY2VDb250ZXh0OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0cmVsZWFzZVNlc3Npb25UcmFjZUNvbnRleHQ6ICgpID0+IHsgfSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbCwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIG9uRGlkQ2hhbmdlU2Vzc2lvblRpdGxlOiBFdmVudC5Ob25lIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9kdWN0U2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIHZlcnNpb246ICcxLjAuMC10ZXN0JyB9IGFzIElQcm9kdWN0U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSwgeyB1c2VySG9tZTogVVJJLmZpbGUoJy90bXAnKSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbG9nU2VydmljZSk7XG5cdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGV4QWdlbnQpKTtcblx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKGFnZW50LmdldFByb3RlY3RlZFJlc291cmNlcygpWzBdLnJlc291cmNlLCAndGVzdC10b2tlbicpO1xuXHRhd2FpdCBhZ2VudC5yZWZyZXNoTW9kZWxzKCk7XG5cdHJldHVybiBhZ2VudDtcbn1cblxuLyoqIFRoZSBkZXRlcm1pbmlzdGljIHNlc3Npb24tYmFja2VkIGNoYXQgVVJJIEFnZW50IEhvc3QgbWludHMgZm9yIGBzZXNzaW9uYC4gKi9cbmZ1bmN0aW9uIGRlZmF1bHRDaGF0T2Yoc2Vzc2lvbjogVVJJKTogVVJJIHtcblx0cmV0dXJuIFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcbn1cblxuZnVuY3Rpb24gY2hhdENvbnRleHQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBJQWdlbnRDaGF0Q29udGV4dCB7XG5cdHJldHVybiB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IGNoYXQgfTtcbn1cblxuLyoqXG4gKiBQcm92aXNpb24gYSBzZXNzaW9uIGJ5IGNyZWF0aW5nIGl0cyBmaXJzdCBjaGF0IHRocm91Z2ggdGhlIHNpbmdsZVxuICoge0BsaW5rIElBZ2VudENoYXRzLmNyZWF0ZUNoYXR9IHNlYW0sIGFscmVhZHkgYWRkcmVzc2VkIGJ5IHRoZSBleGFjdCBjaGF0IFVSSVxuICogQWdlbnQgSG9zdCBtaW50ZWQuIFRoZSBwcm92aWRlciByZXN1bHQgbmV2ZXIgZWNob2VzIGEgc2Vzc2lvbiBpZGVudGl0eSBiYWNrLFxuICogc28gdGhlIGBzZXNzaW9uYCBmaWVsZCByZXR1cm5lZCBoZXJlIGlzIHRoaXMgaGVscGVyJ3Mgb3duIHN5bnRoZXNpemVkIHZhbHVlLlxuICovXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKGFnZW50OiBDb2RleEFnZW50LCBvcHRpb25zOiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyAmIHsgcmVhZG9ubHkgc2Vzc2lvbj86IFVSSSB9ID0ge30pOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQgJiB7IHJlYWRvbmx5IHNlc3Npb246IFVSSSB9PiB7XG5cdGNvbnN0IHsgc2Vzc2lvbjogcmVxdWVzdGVkU2Vzc2lvbiwgLi4uY2hhdE9wdGlvbnMgfSA9IG9wdGlvbnM7XG5cdGNvbnN0IHNlc3Npb24gPSByZXF1ZXN0ZWRTZXNzaW9uID8/IEFnZW50U2Vzc2lvbi51cmkoYWdlbnQuaWQsIGdlbmVyYXRlVXVpZCgpKTtcblx0Y29uc3QgY2hhdCA9IGRlZmF1bHRDaGF0T2Yoc2Vzc2lvbik7XG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFnZW50LmNoYXRzLmNyZWF0ZUNoYXQoY2hhdCwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb24sIHJlc291cmNlOiBjaGF0IH0sIHsgZGVmZXJCYWNraW5nOiAhY2hhdE9wdGlvbnMuZm9yayAmJiAhY2hhdE9wdGlvbnMuaW1wb3J0Q29udmVyc2F0aW9uLCAuLi5jaGF0T3B0aW9ucyB9KTtcblx0cmV0dXJuIHsgLi4ucmVzdWx0LCBzZXNzaW9uIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGFzc2VydFByZXdhcm1FdmljdGVkT25TZW5kKGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBjb21wbGV0ZVByZXdhcm1CZWZvcmVTZW5kOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpO1xuXHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRraW5kOiAncmVhZHknLFxuXHRcdGNsaWVudCxcblx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHR9IGFzIG5ldmVyO1xuXHRhZ2VudFsnX3JlZnJlc2hTa2lsbEhvb2tDdXN0b21pemF0aW9ucyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRhZ2VudFsnX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMnXSA9IGFzeW5jICgpID0+IHsgfTtcblxuXHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL3JlcG8vZm9sZGVyJyk7XG5cdGNvbnN0IHdvcmt0cmVlID0gVVJJLmZpbGUoJy9yZXBvL3dvcmt0cmVlJyk7XG5cdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbihhZ2VudCwgeyB3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLCBtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0gfSk7XG5cdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpITtcblx0Y29uc3QgZm9sZGVyU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cblx0dHJ5IHtcblx0XHRpZiAoY29tcGxldGVQcmV3YXJtQmVmb3JlU2VuZCkge1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IGZvbGRlclN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkLWZvbGRlcicgfSB9IH0pO1xuXHRcdFx0YXdhaXQgZW50cnkubWF0ZXJpYWxpemVQcm9taXNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShcblx0XHRcdFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKSxcblx0XHRcdCdoZWxsbycsXG5cdFx0XHRbd29ya3RyZWVdLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0J3R1cm4tMScsXG5cdFx0KTtcblxuXHRcdGlmICghY29tcGxldGVQcmV3YXJtQmVmb3JlU2VuZCkge1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IGZvbGRlclN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkLWZvbGRlcicgfSB9IH0pO1xuXHRcdH1cblx0XHRjb25zdCB1bnN1YnNjcmliZSA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogdW5zdWJzY3JpYmUuaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0Y29uc3Qgd29ya3RyZWVTdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogd29ya3RyZWVTdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3RocmVhZC13b3JrdHJlZScgfSB9IH0pO1xuXHRcdGNvbnN0IHR1cm5TdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogdHVyblN0YXJ0LmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdGF3YWl0IHNlbmQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcXVlc3RzOiBbXG5cdFx0XHRcdHsgbWV0aG9kOiBmb2xkZXJTdGFydC5tZXRob2QsIGN3ZDogZm9sZGVyU3RhcnQucGFyYW1zLmN3ZCB9LFxuXHRcdFx0XHR7IG1ldGhvZDogdW5zdWJzY3JpYmUubWV0aG9kLCB0aHJlYWRJZDogdW5zdWJzY3JpYmUucGFyYW1zLnRocmVhZElkIH0sXG5cdFx0XHRcdHsgbWV0aG9kOiB3b3JrdHJlZVN0YXJ0Lm1ldGhvZCwgY3dkOiB3b3JrdHJlZVN0YXJ0LnBhcmFtcy5jd2QgfSxcblx0XHRcdFx0eyBtZXRob2Q6IHR1cm5TdGFydC5tZXRob2QsIHRocmVhZElkOiB0dXJuU3RhcnQucGFyYW1zLnRocmVhZElkIH0sXG5cdFx0XHRdLFxuXHRcdFx0dGhyZWFkSWQ6IGVudHJ5LnRocmVhZElkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogZW50cnkud29ya2luZ0RpcmVjdG9yeT8uZnNQYXRoLFxuXHRcdFx0Zm9sZGVyVGhyZWFkUm91dGVkOiBhZ2VudFsnX3Nlc3Npb25JZEJ5VGhyZWFkSWQnXS5oYXMoJ3RocmVhZC1mb2xkZXInKSxcblx0XHRcdHdvcmt0cmVlVGhyZWFkUm91dGVkOiBhZ2VudFsnX3Nlc3Npb25JZEJ5VGhyZWFkSWQnXS5oYXMoJ3RocmVhZC13b3JrdHJlZScpLFxuXHRcdH0sIHtcblx0XHRcdHJlcXVlc3RzOiBbXG5cdFx0XHRcdHsgbWV0aG9kOiAndGhyZWFkL3N0YXJ0JywgY3dkOiBmb2xkZXIuZnNQYXRoIH0sXG5cdFx0XHRcdHsgbWV0aG9kOiAndGhyZWFkL3Vuc3Vic2NyaWJlJywgdGhyZWFkSWQ6ICd0aHJlYWQtZm9sZGVyJyB9LFxuXHRcdFx0XHR7IG1ldGhvZDogJ3RocmVhZC9zdGFydCcsIGN3ZDogd29ya3RyZWUuZnNQYXRoIH0sXG5cdFx0XHRcdHsgbWV0aG9kOiAndHVybi9zdGFydCcsIHRocmVhZElkOiAndGhyZWFkLXdvcmt0cmVlJyB9LFxuXHRcdFx0XSxcblx0XHRcdHRocmVhZElkOiAndGhyZWFkLXdvcmt0cmVlJyxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmt0cmVlLmZzUGF0aCxcblx0XHRcdGZvbGRlclRocmVhZFJvdXRlZDogZmFsc2UsXG5cdFx0XHR3b3JrdHJlZVRocmVhZFJvdXRlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSBmaW5hbGx5IHtcblx0XHRwZWVyLmV4aXQoKTtcblx0fVxufVxuXG5zdWl0ZSgnQ29kZXhBZ2VudCBwcmV3YXJtIGV2aWN0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbGlzdHMgQ29kZXggRGVza3RvcCBjaGF0cyB3aXRob3V0IGEgY2hvc2VuIGZvbGRlciBhcyB3b3Jrc3BhY2UtbGVzcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50LFxuXHRcdFx0dXNhZ2VTb3VyY2U6ICdnaXRodWInLFxuXHRcdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0gYXMgbmV2ZXI7XG5cblx0XHRjb25zdCB1c2VySG9tZSA9IGFnZW50WydfZW52aXJvbm1lbnRTZXJ2aWNlJ10udXNlckhvbWU7XG5cdFx0Y29uc3QgZ2VuZXJhdGVkV29ya3NwYWNlID0gVVJJLmpvaW5QYXRoKHVzZXJIb21lLCAnRG9jdW1lbnRzJywgJ0NvZGV4JywgJzIwMjYtMDgtMTEnLCAndGhpcycpO1xuXHRcdGNvbnN0IHNlbGVjdGVkV29ya3NwYWNlID0gVVJJLmZpbGUoam9pbihzZXAsICdyZXBvJywgJ2NvZGV4JykpO1xuXHRcdGNvbnN0IHNlc3Npb25zRGlyZWN0b3J5ID0gVVJJLmpvaW5QYXRoKHVzZXJIb21lLCAnLmNvZGV4JywgJ3Nlc3Npb25zJywgJzIwMjYnLCAnMDgnLCAnMTEnKTtcblx0XHRhd2FpdCBhZ2VudFsnX2ZpbGVTZXJ2aWNlJ10uY3JlYXRlRm9sZGVyKHNlc3Npb25zRGlyZWN0b3J5KTtcblxuXHRcdGNvbnN0IGRlc2t0b3BHZW5lcmF0ZWRSb2xsb3V0ID0gVVJJLmpvaW5QYXRoKHNlc3Npb25zRGlyZWN0b3J5LCAnZGVza3RvcC1nZW5lcmF0ZWQuanNvbmwnKTtcblx0XHRjb25zdCBkZXNrdG9wU2VsZWN0ZWRSb2xsb3V0ID0gVVJJLmpvaW5QYXRoKHNlc3Npb25zRGlyZWN0b3J5LCAnZGVza3RvcC1zZWxlY3RlZC5qc29ubCcpO1xuXHRcdGNvbnN0IHZzY29kZUdlbmVyYXRlZFJvbGxvdXQgPSBVUkkuam9pblBhdGgoc2Vzc2lvbnNEaXJlY3RvcnksICd2c2NvZGUtZ2VuZXJhdGVkLmpzb25sJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0YWdlbnRbJ19maWxlU2VydmljZSddLmNyZWF0ZUZpbGUoZGVza3RvcEdlbmVyYXRlZFJvbGxvdXQsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3tcInR5cGVcIjpcInNlc3Npb25fbWV0YVwiLFwicGF5bG9hZFwiOntcIm9yaWdpbmF0b3JcIjpcIkNvZGV4IERlc2t0b3BcIn19XFxuJykpLFxuXHRcdFx0YWdlbnRbJ19maWxlU2VydmljZSddLmNyZWF0ZUZpbGUoZGVza3RvcFNlbGVjdGVkUm9sbG91dCwgVlNCdWZmZXIuZnJvbVN0cmluZygne1widHlwZVwiOlwic2Vzc2lvbl9tZXRhXCIsXCJwYXlsb2FkXCI6e1wib3JpZ2luYXRvclwiOlwiQ29kZXggRGVza3RvcFwifX1cXG4nKSksXG5cdFx0XHRhZ2VudFsnX2ZpbGVTZXJ2aWNlJ10uY3JlYXRlRmlsZSh2c2NvZGVHZW5lcmF0ZWRSb2xsb3V0LCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7XCJ0eXBlXCI6XCJzZXNzaW9uX21ldGFcIixcInBheWxvYWRcIjp7fX1cXG4nKSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBsaXN0aW5nID0gYWdlbnRbJ19saXN0Q29kZXhDaGF0cyddKCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goe1xuXHRcdFx0aWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdHsgaWQ6ICdkZXNrdG9wLWdlbmVyYXRlZCcsIGN3ZDogZ2VuZXJhdGVkV29ya3NwYWNlLmZzUGF0aCwgcGF0aDogZGVza3RvcEdlbmVyYXRlZFJvbGxvdXQuZnNQYXRoLCBzb3VyY2U6ICd2c2NvZGUnLCBtb2RlbFByb3ZpZGVyOiAnb3BlbmFpJywgY3JlYXRlZEF0OiAxLCB1cGRhdGVkQXQ6IDIsIG5hbWU6ICdEZXNrdG9wIGdlbmVyYXRlZCcgfSxcblx0XHRcdFx0XHR7IGlkOiAnZGVza3RvcC1zZWxlY3RlZCcsIGN3ZDogc2VsZWN0ZWRXb3Jrc3BhY2UuZnNQYXRoLCBwYXRoOiBkZXNrdG9wU2VsZWN0ZWRSb2xsb3V0LmZzUGF0aCwgc291cmNlOiAndnNjb2RlJywgbW9kZWxQcm92aWRlcjogJ29wZW5haScsIGNyZWF0ZWRBdDogMywgdXBkYXRlZEF0OiA0LCBuYW1lOiAnRGVza3RvcCBzZWxlY3RlZCcgfSxcblx0XHRcdFx0XHR7IGlkOiAndnNjb2RlLWdlbmVyYXRlZCcsIGN3ZDogZ2VuZXJhdGVkV29ya3NwYWNlLmZzUGF0aCwgcGF0aDogdnNjb2RlR2VuZXJhdGVkUm9sbG91dC5mc1BhdGgsIHNvdXJjZTogJ3ZzY29kZScsIG1vZGVsUHJvdmlkZXI6ICdvcGVuYWknLCBjcmVhdGVkQXQ6IDUsIHVwZGF0ZWRBdDogNiwgbmFtZTogJ1ZTIENvZGUgZ2VuZXJhdGVkJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRuZXh0Q3Vyc29yOiBudWxsLFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2hhdHMgPSBhd2FpdCBsaXN0aW5nO1xuXHRcdGFzc2VydC5vayhjaGF0cyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGF0cy5tYXAoY2hhdCA9PiAoe1xuXHRcdFx0aWQ6IEFnZW50U2Vzc2lvbi5pZChwYXJzZUNoYXRVcmkoY2hhdC5jaGF0KSEuc2Vzc2lvbiksXG5cdFx0XHR3b3Jrc3BhY2VsZXNzOiByZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3MoY2hhdC5fbWV0YSksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGNoYXQud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS5mc1BhdGgpLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBpZDogJ2Rlc2t0b3AtZ2VuZXJhdGVkJywgd29ya3NwYWNlbGVzczogdHJ1ZSwgd29ya2luZ0RpcmVjdG9yaWVzOiBbZ2VuZXJhdGVkV29ya3NwYWNlLmZzUGF0aF0gfSxcblx0XHRcdHsgaWQ6ICdkZXNrdG9wLXNlbGVjdGVkJywgd29ya3NwYWNlbGVzczogZmFsc2UsIHdvcmtpbmdEaXJlY3RvcmllczogW3NlbGVjdGVkV29ya3NwYWNlLmZzUGF0aF0gfSxcblx0XHRcdHsgaWQ6ICd2c2NvZGUtZ2VuZXJhdGVkJywgd29ya3NwYWNlbGVzczogZmFsc2UsIHdvcmtpbmdEaXJlY3RvcmllczogW2dlbmVyYXRlZFdvcmtzcGFjZS5mc1BhdGhdIH0sXG5cdFx0XSk7XG5cdFx0cGVlci5leGl0KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JvdW5kcyBjb25jdXJyZW50IENvZGV4IERlc2t0b3Agcm9sbG91dCBpbnNwZWN0aW9ucyB3aGlsZSBsaXN0aW5nIGNoYXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50OiBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpLFxuXHRcdFx0dXNhZ2VTb3VyY2U6ICdnaXRodWInLFxuXHRcdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0gYXMgbmV2ZXI7XG5cdFx0Y29uc3QgcmVsZWFzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBzYXR1cmF0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IGFjdGl2ZSA9IDA7XG5cdFx0bGV0IG1heGltdW0gPSAwO1xuXHRcdGFnZW50WydfcmVhZENvZGV4RGVza3RvcFJvbGxvdXRQcmVmaXgnXSA9IGFzeW5jICgpID0+IHtcblx0XHRcdGFjdGl2ZSsrO1xuXHRcdFx0bWF4aW11bSA9IE1hdGgubWF4KG1heGltdW0sIGFjdGl2ZSk7XG5cdFx0XHRpZiAoYWN0aXZlID09PSA4KSB7XG5cdFx0XHRcdHNhdHVyYXRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgcmVsZWFzZS5wO1xuXHRcdFx0YWN0aXZlLS07XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbGlzdGluZyA9IGFnZW50WydfbGlzdENvZGV4Q2hhdHMnXSgpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHtcblx0XHRcdGlkOiByZXF1ZXN0LmlkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdGRhdGE6IEFycmF5LmZyb20oeyBsZW5ndGg6IDMyIH0sIChfLCBpbmRleCkgPT4gKHtcblx0XHRcdFx0XHRpZDogYGRlc2t0b3AtJHtpbmRleH1gLFxuXHRcdFx0XHRcdGN3ZDogYC93b3Jrc3BhY2UvJHtpbmRleH1gLFxuXHRcdFx0XHRcdHBhdGg6IGAvcm9sbG91dC8ke2luZGV4fS5qc29ubGAsXG5cdFx0XHRcdFx0c291cmNlOiAndnNjb2RlJyxcblx0XHRcdFx0XHRtb2RlbFByb3ZpZGVyOiAnb3BlbmFpJyxcblx0XHRcdFx0XHRjcmVhdGVkQXQ6IGluZGV4LFxuXHRcdFx0XHRcdHVwZGF0ZWRBdDogaW5kZXgsXG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0bmV4dEN1cnNvcjogbnVsbCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBzYXR1cmF0ZWQucDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlLCA4KTtcblx0XHRyZWxlYXNlLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgY2hhdHMgPSBhd2FpdCBsaXN0aW5nO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBtYXhpbXVtLCBjb3VudDogY2hhdHM/Lmxlbmd0aCB9LCB7IG1heGltdW06IDgsIGNvdW50OiAzMiB9KTtcblx0XHRwZWVyLmV4aXQoKTtcblx0fSk7XG5cblx0dGVzdCgnYm91bmRzIGNvbmN1cnJlbnQgY29sZCBzZXNzaW9uIHJlYWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHJlbGVhc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3Qgc2F0dXJhdGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGxldCBhY3RpdmUgPSAwO1xuXHRcdGxldCBtYXhpbXVtID0gMDtcblx0XHRhZ2VudFsnX2RvUmVhZFNlc3Npb24nXSA9IGFzeW5jICgpID0+IHtcblx0XHRcdGFjdGl2ZSsrO1xuXHRcdFx0bWF4aW11bSA9IE1hdGgubWF4KG1heGltdW0sIGFjdGl2ZSk7XG5cdFx0XHRpZiAoYWN0aXZlID09PSA4KSB7XG5cdFx0XHRcdHNhdHVyYXRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgcmVsZWFzZS5wO1xuXHRcdFx0YWN0aXZlLS07XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCByZWFkcyA9IFByb21pc2UuYWxsKEFycmF5LmZyb20oeyBsZW5ndGg6IDMyIH0sIChfLCBpbmRleCkgPT5cblx0XHRcdGFnZW50WydfcmVhZFNlc3Npb24nXShBZ2VudFNlc3Npb24udXJpKGFnZW50LmlkLCBgc2Vzc2lvbi0ke2luZGV4fWApKSkpO1xuXHRcdGF3YWl0IHNhdHVyYXRlZC5wO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmUsIDgpO1xuXHRcdHJlbGVhc2UuY29tcGxldGUoKTtcblx0XHRhd2FpdCByZWFkcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF4aW11bSwgOCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gYWN0aW9ucyB0YXJnZXQgdGhlIG93bmluZyBzZXNzaW9uIGFmdGVyIHRoZSBjaGF0IGlzIGJvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHNpZ25hbHM6IEFnZW50U2lnbmFsW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWdlbnQub25EaWRDaGF0UHJvZ3Jlc3Moc2lnbmFsID0+IHNpZ25hbHMucHVzaChzaWduYWwpKSk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKGFnZW50LCB7IHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvcmVwbycpXSB9KTtcblxuXHRcdGFnZW50WydfZmlyZSddKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZpdHlDaGFuZ2VkLCBhY3Rpdml0eTogJ1dvcmtpbmcnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWduYWxzLm1hcChzaWduYWwgPT4gc2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nID8ge1xuXHRcdFx0cmVzb3VyY2U6IHNpZ25hbC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0dHlwZTogc2lnbmFsLmFjdGlvbi50eXBlLFxuXHRcdH0gOiB1bmRlZmluZWQpLCBbe1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2aXR5Q2hhbmdlZCxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ltbWVkaWF0ZWx5IHJlbGVhc2VzLCByZXN0b3JlcywgYW5kIHNlbmRzIGEgd29ya3NwYWNlLWxlc3MgcGVlciBiZWZvcmUgbWV0YWRhdGEgZmx1c2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRhZ2VudFsnX3NjaGVkdWxlUHJld2FybSddID0gKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0Y29uc3QgbWV0YWRhdGFXcml0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRhZ2VudFsnX21ldGFkYXRhU3RvcmUnXS53cml0ZSA9IGFzeW5jICgpID0+IG1ldGFkYXRhV3JpdGUucDtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDogbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KSxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbihhZ2VudCwgeyBtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0gfSk7XG5cdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZSgnYWdlbnQtY2hhdDovL3BlZXIvd29ya3NwYWNlLWxlc3MnKTtcblx0XHRjb25zdCBjcmVhdGluZyA9IGFnZW50LmNoYXRzLmNyZWF0ZUNoYXQoY2hhdCwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHBhcmVudC5zZXNzaW9uLCByZXNvdXJjZTogY2hhdCB9LCB7IG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSB9KTtcblx0XHRjb25zdCBzdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogc3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICd0aHJlYWQtcGVlcicgfSB9IH0pO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBjcmVhdGluZztcblx0XHRhc3NlcnQub2soY3JlYXRlZCk7XG5cdFx0Y29uc3QgcGVlckVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldCgndGhyZWFkLXBlZXInKSE7XG5cdFx0Y29uc3QgbWFuYWdlZERpcmVjdG9yeSA9IHBlZXJFbnRyeS5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTtcblx0XHRhc3NlcnQub2sobWFuYWdlZERpcmVjdG9yeSk7XG5cdFx0Y29uc3QgYmFja2luZ1Nlc3Npb24gPSBjcmVhdGVkLmJhY2tpbmdTZXNzaW9uO1xuXHRcdGFzc2VydC5vayhiYWNraW5nU2Vzc2lvbik7XG5cblx0XHRjb25zdCByZWxlYXNpbmcgPSBhZ2VudC5jaGF0cy5yZWxlYXNlQ2hhdD8uKGNoYXQsIGNoYXRDb250ZXh0KHBhcmVudC5zZXNzaW9uLCBjaGF0KSk7XG5cdFx0Y29uc3QgcmVsZWFzZVVuc3Vic2NyaWJlID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdHBlZXIucHVzaCh7IGlkOiByZWxlYXNlVW5zdWJzY3JpYmUuaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0YXdhaXQgcmVsZWFzaW5nO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5leGlzdHNTeW5jKG1hbmFnZWREaXJlY3RvcnkuZnNQYXRoKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBhZ2VudC5tYXRlcmlhbGl6ZUNoYXQoY2hhdCwgcGFyZW50LnNlc3Npb24sIGNyZWF0ZWQucHJvdmlkZXJEYXRhKTtcblx0XHRjb25zdCByZXN0b3JlZEVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldCgndGhyZWFkLXBlZXInKSE7XG5cdFx0Y29uc3Qgc2VuZGluZyA9IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGNoYXQsICdoZWxsbycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAndHVybi1wZWVyJyk7XG5cdFx0Y29uc3QgcmVzdW1lID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdHBlZXIucHVzaCh7XG5cdFx0XHRpZDogcmVzdW1lLmlkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHRocmVhZDogeyBpZDogJ3RocmVhZC1wZWVyJywgY3dkOiBtYW5hZ2VkRGlyZWN0b3J5LmZzUGF0aCB9LFxuXHRcdFx0XHRjd2Q6IG1hbmFnZWREaXJlY3RvcnkuZnNQYXRoLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCB0dXJuID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdHBlZXIucHVzaCh7IGlkOiB0dXJuLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdGF3YWl0IHNlbmRpbmc7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0OiB7IG1ldGhvZDogc3RhcnQubWV0aG9kLCBjd2Q6IHN0YXJ0LnBhcmFtcy5jd2QgfSxcblx0XHRcdHJlbGVhc2U6IHsgbWV0aG9kOiByZWxlYXNlVW5zdWJzY3JpYmUubWV0aG9kLCB0aHJlYWRJZDogcmVsZWFzZVVuc3Vic2NyaWJlLnBhcmFtcy50aHJlYWRJZCB9LFxuXHRcdFx0cmVzdW1lOiB7IG1ldGhvZDogcmVzdW1lLm1ldGhvZCwgdGhyZWFkSWQ6IHJlc3VtZS5wYXJhbXMudGhyZWFkSWQgfSxcblx0XHRcdHR1cm46IHsgbWV0aG9kOiB0dXJuLm1ldGhvZCwgdGhyZWFkSWQ6IHR1cm4ucGFyYW1zLnRocmVhZElkIH0sXG5cdFx0XHRwYXJlbnRNYXRlcmlhbGl6ZWQ6IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKHBhcmVudC5zZXNzaW9uKSk/LnRocmVhZElkLFxuXHRcdFx0cGFyZW50T3duc01hbmFnZWREaXJlY3Rvcnk6IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKHBhcmVudC5zZXNzaW9uKSk/Lm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5Py5mc1BhdGgsXG5cdFx0XHRyZXN0b3JlZFBlZXJPd25zTWFuYWdlZERpcmVjdG9yeTogcmVzdG9yZWRFbnRyeS5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeT8uZnNQYXRoLFxuXHRcdFx0bWFuYWdlZERpcmVjdG9yeUV4aXN0czogZnMuZXhpc3RzU3luYyhtYW5hZ2VkRGlyZWN0b3J5LmZzUGF0aCksXG5cdFx0fSwge1xuXHRcdFx0c3RhcnQ6IHsgbWV0aG9kOiAndGhyZWFkL3N0YXJ0JywgY3dkOiBtYW5hZ2VkRGlyZWN0b3J5LmZzUGF0aCB9LFxuXHRcdFx0cmVsZWFzZTogeyBtZXRob2Q6ICd0aHJlYWQvdW5zdWJzY3JpYmUnLCB0aHJlYWRJZDogJ3RocmVhZC1wZWVyJyB9LFxuXHRcdFx0cmVzdW1lOiB7IG1ldGhvZDogJ3RocmVhZC9yZXN1bWUnLCB0aHJlYWRJZDogJ3RocmVhZC1wZWVyJyB9LFxuXHRcdFx0dHVybjogeyBtZXRob2Q6ICd0dXJuL3N0YXJ0JywgdGhyZWFkSWQ6ICd0aHJlYWQtcGVlcicgfSxcblx0XHRcdHBhcmVudE1hdGVyaWFsaXplZDogdW5kZWZpbmVkLFxuXHRcdFx0cGFyZW50T3duc01hbmFnZWREaXJlY3Rvcnk6IHVuZGVmaW5lZCxcblx0XHRcdHJlc3RvcmVkUGVlck93bnNNYW5hZ2VkRGlyZWN0b3J5OiBtYW5hZ2VkRGlyZWN0b3J5LmZzUGF0aCxcblx0XHRcdG1hbmFnZWREaXJlY3RvcnlFeGlzdHM6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaXNwb3NpbmcgPSBhZ2VudC5jaGF0cy5kaXNwb3NlQ2hhdChjaGF0LCBjaGF0Q29udGV4dChwYXJlbnQuc2Vzc2lvbiwgY2hhdCkpO1xuXHRcdGNvbnN0IHVuc3Vic2NyaWJlID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdHBlZXIucHVzaCh7IGlkOiB1bnN1YnNjcmliZS5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRhd2FpdCBkaXNwb3Npbmc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLmV4aXN0c1N5bmMobWFuYWdlZERpcmVjdG9yeS5mc1BhdGgpLCBmYWxzZSk7XG5cdFx0YXdhaXQgbWV0YWRhdGFXcml0ZS5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdHBlZXIuZXhpdCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xkIGNoYXQgcmVzdG9yZSB3YWl0cyBmb3IgbW9kZWwgcmVmcmVzaCBiZWZvcmUgdmFsaWRhdGluZyBpdHMgcHJvdmlkZXItcXVhbGlmaWVkIG1vZGVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGNhdGFsb2dNb2RlbCA9IHtcblx0XHRcdC4uLmFnZW50Lm1vZGVscy5nZXQoKVswXSxcblx0XHRcdHByb3ZpZGVyOiAnY2hhdGdwdCcsXG5cdFx0XHRpZDogdG9Db2RleE1vZGVsU2VsZWN0aW9uSWQoJ29wZW5haScsICdncHQtdGVzdCcpLFxuXHRcdH07XG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbCA9IHsgaWQ6IGNhdGFsb2dNb2RlbC5pZCwgY29uZmlnOiB7IHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnIH0gfTtcblx0XHRjb25zdCByZWZyZXNoID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGFnZW50WydfbW9kZWxzJ10uc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdGFnZW50WydfbW9kZWxzUmVmcmVzaFByb21pc2UnXSA9IHJlZnJlc2gucDtcblx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKCdhZ2VudC1jaGF0Oi8vcGVlci9yZXN0b3JlZCcpO1xuXG5cdFx0Y29uc3QgbWF0ZXJpYWxpemluZyA9IGFnZW50Lm1hdGVyaWFsaXplQ2hhdChjaGF0LCBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdwYXJlbnQnKSwgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2Vzc2lvbklkOiAncmVzdG9yZWQtcGVlcicsXG5cdFx0XHRtb2RlbDogc2VsZWN0ZWRNb2RlbCxcblx0XHR9KSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50Wydfc2Vzc2lvbnMnXS5oYXMoJ3Jlc3RvcmVkLXBlZXInKSwgZmFsc2UpO1xuXG5cdFx0YWdlbnRbJ19tb2RlbHMnXS5zZXQoW2NhdGFsb2dNb2RlbF0sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgcmVmcmVzaC5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdGF3YWl0IG1hdGVyaWFsaXppbmc7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoJ3Jlc3RvcmVkLXBlZXInKT8ubW9kZWwsIHNlbGVjdGVkTW9kZWwpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xkIGNoYXQgcmVzdG9yZSByZWZyZXNoZXMgYW4gZW1wdHkgbW9kZWwgY2F0YWxvZyBiZWZvcmUgdmFsaWRhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsID0geyBpZDogQ09QSUxPVF9URVNUX01PREVMLCBjb25maWc6IHsgcmVhc29uaW5nRWZmb3J0OiAnaGlnaCcgfSB9O1xuXHRcdGFnZW50WydfbW9kZWxzJ10uc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudFsnX21vZGVsc1JlZnJlc2hQcm9taXNlJ10sIHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCBhZ2VudC5tYXRlcmlhbGl6ZUNoYXQoXG5cdFx0XHRVUkkucGFyc2UoJ2FnZW50LWNoYXQ6Ly9wZWVyL3Jlc3RvcmVkLWVtcHR5LWNhdGFsb2cnKSxcblx0XHRcdEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ3BhcmVudCcpLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uSWQ6ICdyZXN0b3JlZC1lbXB0eS1jYXRhbG9nJywgbW9kZWw6IHNlbGVjdGVkTW9kZWwgfSksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRbJ19zZXNzaW9ucyddLmdldCgncmVzdG9yZWQtZW1wdHktY2F0YWxvZycpPy5tb2RlbCwgc2VsZWN0ZWRNb2RlbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGQgY2hhdCByZXN0b3JlIHByZWZlcnMgdGhlIGxhdGVzdCBwZXJzaXN0ZWQgbW9kZWwgb3ZlciBpdHMgY3JlYXRpb24gYmFja2luZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYXRhYmFzZSA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBkYXRhYmFzZSB9KTtcblx0XHRjb25zdCBiYXNlTW9kZWwgPSBhZ2VudC5tb2RlbHMuZ2V0KClbMF07XG5cdFx0Y29uc3QgY3JlYXRpb25Nb2RlbCA9IHsgaWQ6ICdjcmVhdGlvbi1tb2RlbCcgfTtcblx0XHRjb25zdCBwZXJzaXN0ZWRNb2RlbCA9IHsgaWQ6ICdwZXJzaXN0ZWQtbW9kZWwnIH07XG5cdFx0YWdlbnRbJ19tb2RlbHMnXS5zZXQoW1xuXHRcdFx0eyAuLi5iYXNlTW9kZWwsIGlkOiBjcmVhdGlvbk1vZGVsLmlkIH0sXG5cdFx0XHR7IC4uLmJhc2VNb2RlbCwgaWQ6IHBlcnNpc3RlZE1vZGVsLmlkIH0sXG5cdFx0XSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBkYXRhYmFzZS5zZXRNZXRhZGF0YSgnY29kZXgubW9kZWwnLCBwZXJzaXN0ZWRNb2RlbC5pZCk7XG5cblx0XHRhd2FpdCBhZ2VudC5tYXRlcmlhbGl6ZUNoYXQoXG5cdFx0XHRVUkkucGFyc2UoJ2FnZW50LWNoYXQ6Ly9wZWVyL3Jlc3RvcmVkLXVwZGF0ZWQtbW9kZWwnKSxcblx0XHRcdEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ3BhcmVudCcpLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uSWQ6ICdyZXN0b3JlZC11cGRhdGVkLW1vZGVsJywgbW9kZWw6IGNyZWF0aW9uTW9kZWwgfSksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRbJ19zZXNzaW9ucyddLmdldCgncmVzdG9yZWQtdXBkYXRlZC1tb2RlbCcpPy5tb2RlbCwgcGVyc2lzdGVkTW9kZWwpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xkIGNoYXQgaGlzdG9yeSByZXN1bWVzIGl0cyBiYWNraW5nIHRocmVhZCBiZWZvcmUgcmVhZGluZyB0dXJucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYXRhYmFzZSA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0YXdhaXQgZGF0YWJhc2Uuc2V0TWV0YWRhdGEoJ2NvZGV4LnRocmVhZElkJywgJ3Jlc3RvcmVkLWhpc3RvcnktdGhyZWFkJyk7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBkYXRhYmFzZSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDogbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KSxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoJ2FnZW50LWNoYXQ6Ly9wZWVyL3Jlc3RvcmVkLWhpc3RvcnknKTtcblx0XHRjb25zdCBwYXJlbnQgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdwYXJlbnQnKTtcblx0XHRhd2FpdCBhZ2VudC5tYXRlcmlhbGl6ZUNoYXQoY2hhdCwgcGFyZW50LCBKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25JZDogJ3Jlc3RvcmVkLWhpc3RvcnknIH0pKTtcblxuXHRcdGNvbnN0IHJlYWRpbmcgPSBhZ2VudC5jaGF0cy5nZXRNZXNzYWdlcyhjaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogcGFyZW50LCByZXNvdXJjZTogY2hhdCB9KTtcblx0XHRjb25zdCByZXN1bWUgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHJlc3VtZS5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3Jlc3RvcmVkLWhpc3RvcnknLCB0dXJuczogW10gfSwgcnVudGltZVdvcmtzcGFjZVJvb3RzOiBbXSB9IH0pO1xuXHRcdGNvbnN0IHJlYWQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHtcblx0XHRcdGlkOiByZWFkLmlkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHRocmVhZDoge1xuXHRcdFx0XHRcdGlkOiAncmVzdG9yZWQtaGlzdG9yeScsXG5cdFx0XHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdFx0XHRpZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndXNlci0xJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGVsbG8nLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ2FnZW50LTEnLCB0ZXh0OiAncmVzdG9yZWQnLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHR1cm5zID0gYXdhaXQgcmVhZGluZztcblx0XHRjb25zdCBzZW5kaW5nID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdCwgJ2ZvbGxvdyB1cCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAndHVybi0yJyk7XG5cdFx0Y29uc3QgdHVybiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogdHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRhd2FpdCBzZW5kaW5nO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVxdWVzdHM6IFtcblx0XHRcdFx0eyBtZXRob2Q6IHJlc3VtZS5tZXRob2QsIHRocmVhZElkOiByZXN1bWUucGFyYW1zLnRocmVhZElkIH0sXG5cdFx0XHRcdHsgbWV0aG9kOiByZWFkLm1ldGhvZCwgdGhyZWFkSWQ6IHJlYWQucGFyYW1zLnRocmVhZElkIH0sXG5cdFx0XHRcdHsgbWV0aG9kOiB0dXJuLm1ldGhvZCwgdGhyZWFkSWQ6IHR1cm4ucGFyYW1zLnRocmVhZElkIH0sXG5cdFx0XHRdLFxuXHRcdFx0dHVybnM6IHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0XHRwcm9tcHQ6IHR1cm4ubWVzc2FnZS50ZXh0LFxuXHRcdFx0XHRyZXNwb25zZTogdHVybi5yZXNwb25zZVBhcnRzLm1hcChwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biA/IHBhcnQuY29udGVudCA6IHVuZGVmaW5lZCksXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0cmVxdWVzdHM6IFtcblx0XHRcdFx0eyBtZXRob2Q6ICd0aHJlYWQvcmVzdW1lJywgdGhyZWFkSWQ6ICdyZXN0b3JlZC1oaXN0b3J5LXRocmVhZCcgfSxcblx0XHRcdFx0eyBtZXRob2Q6ICd0aHJlYWQvcmVhZCcsIHRocmVhZElkOiAncmVzdG9yZWQtaGlzdG9yeS10aHJlYWQnIH0sXG5cdFx0XHRcdHsgbWV0aG9kOiAndHVybi9zdGFydCcsIHRocmVhZElkOiAncmVzdG9yZWQtaGlzdG9yeS10aHJlYWQnIH0sXG5cdFx0XHRdLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybi0xJyxcblx0XHRcdFx0cHJvbXB0OiAnaGVsbG8nLFxuXHRcdFx0XHRyZXNwb25zZTogWydyZXN0b3JlZCddLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0cGVlci5leGl0KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2luZyBhIHJlbGVhc2VkIHdvcmtzcGFjZS1sZXNzIHBlZXIgcmVtb3ZlcyBpdHMgbWFuYWdlZCBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0YWdlbnRbJ19zY2hlZHVsZVByZXdhcm0nXSA9ICgpID0+IHsgfTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDogbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KSxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbihhZ2VudCwgeyBtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0gfSk7XG5cdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZSgnYWdlbnQtY2hhdDovL3BlZXIvcmVsZWFzZS1kaXNwb3NlJyk7XG5cdFx0Y29uc3QgY3JlYXRpbmcgPSBhZ2VudC5jaGF0cy5jcmVhdGVDaGF0KGNoYXQsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBwYXJlbnQuc2Vzc2lvbiwgcmVzb3VyY2U6IGNoYXQgfSwgeyBtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0gfSk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAncmVsZWFzZWQtcGVlcicgfSB9IH0pO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBjcmVhdGluZztcblx0XHRhc3NlcnQub2soY3JlYXRlZD8uYmFja2luZ1Nlc3Npb24pO1xuXHRcdGNvbnN0IG1hbmFnZWREaXJlY3RvcnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KCdyZWxlYXNlZC1wZWVyJyk/Lm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5O1xuXHRcdGFzc2VydC5vayhtYW5hZ2VkRGlyZWN0b3J5KTtcblx0XHRhd2FpdCBhZ2VudFsnX21ldGFkYXRhU3RvcmUnXS5yZWFkKGNyZWF0ZWQuYmFja2luZ1Nlc3Npb24pO1xuXG5cdFx0Y29uc3QgcmVsZWFzaW5nID0gYWdlbnQuY2hhdHMucmVsZWFzZUNoYXQ/LihjaGF0LCBjaGF0Q29udGV4dChwYXJlbnQuc2Vzc2lvbiwgY2hhdCkpO1xuXHRcdGNvbnN0IHVuc3Vic2NyaWJlID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdHBlZXIucHVzaCh7IGlkOiB1bnN1YnNjcmliZS5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRhd2FpdCByZWxlYXNpbmc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLmV4aXN0c1N5bmMobWFuYWdlZERpcmVjdG9yeS5mc1BhdGgpLCB0cnVlKTtcblxuXHRcdGF3YWl0IGFnZW50LmNoYXRzLmRpc3Bvc2VDaGF0KGNoYXQsIGNoYXRDb250ZXh0KHBhcmVudC5zZXNzaW9uLCBjaGF0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXNzaW9uRXhpc3RzOiBhZ2VudFsnX3Nlc3Npb25zJ10uaGFzKCdyZWxlYXNlZC1wZWVyJyksXG5cdFx0XHRyZWxlYXNlZE93bmVyc2hpcEV4aXN0czogYWdlbnRbJ19yZWxlYXNlZE1hbmFnZWRXb3JraW5nRGlyZWN0b3JpZXMnXS5oYXMoJ3JlbGVhc2VkLXBlZXInKSxcblx0XHRcdG1hbmFnZWREaXJlY3RvcnlFeGlzdHM6IGZzLmV4aXN0c1N5bmMobWFuYWdlZERpcmVjdG9yeS5mc1BhdGgpLFxuXHRcdH0sIHtcblx0XHRcdHNlc3Npb25FeGlzdHM6IGZhbHNlLFxuXHRcdFx0cmVsZWFzZWRPd25lcnNoaXBFeGlzdHM6IGZhbHNlLFxuXHRcdFx0bWFuYWdlZERpcmVjdG9yeUV4aXN0czogZmFsc2UsXG5cdFx0fSk7XG5cdFx0cGVlci5leGl0KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdXRlcyBwcm92aWRlci1xdWFsaWZpZWQgbW9kZWxzIGluZGVwZW5kZW50bHkgYW5kIHN3aXRjaGVzIG9uZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGFnZW50Wydfc2NoZWR1bGVQcmV3YXJtJ10gPSAoKSA9PiB7IH07XG5cdFx0Y29uc3QgcGVlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudCxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cblx0XHRjb25zdCBjaGF0R1BUTW9kZWwgPSB0b0NvZGV4TW9kZWxTZWxlY3Rpb25JZCgnb3BlbmFpJywgJ2dwdC10ZXN0Jyk7XG5cdFx0YWdlbnRbJ19tb2RlbHMnXS5zZXQoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3QnLCBpZDogQ09QSUxPVF9URVNUX01PREVMLCBuYW1lOiAnR1BUIFRlc3QnLCBzdXBwb3J0c1Zpc2lvbjogZmFsc2UgfSxcblx0XHRcdHsgcHJvdmlkZXI6ICdjb2RleCcsIGlkOiBjaGF0R1BUTW9kZWwsIG5hbWU6ICdHUFQgVGVzdCcsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9LFxuXHRcdF0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBjb3BpbG90ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbihhZ2VudCwgeyB3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3JlcG8vY29waWxvdCcpXSwgbW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9IH0pO1xuXHRcdGNvbnN0IGNoYXRHUFQgPSBhd2FpdCBjcmVhdGVTZXNzaW9uKGFnZW50LCB7IHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvcmVwby9jaGF0Z3B0JyldLCBtb2RlbDogeyBpZDogY2hhdEdQVE1vZGVsIH0gfSk7XG5cdFx0Y29uc3QgY29waWxvdEVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoY29waWxvdC5zZXNzaW9uKSkhO1xuXHRcdGNvbnN0IGNoYXRHUFRFbnRyeSA9IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKGNoYXRHUFQuc2Vzc2lvbikpITtcblxuXHRcdGNvbnN0IG1hdGVyaWFsaXplQ29waWxvdCA9IGFnZW50WydfbWF0ZXJpYWxpemVJZk5lZWRlZCddKGNvcGlsb3RFbnRyeSwgY29waWxvdEVudHJ5LnNlc3Npb25VcmksIGZhbHNlKTtcblx0XHRjb25zdCBjb3BpbG90U3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IGNvcGlsb3RTdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3RocmVhZC1jb3BpbG90JyB9IH0gfSk7XG5cdFx0YXdhaXQgbWF0ZXJpYWxpemVDb3BpbG90O1xuXG5cdFx0Y29uc3QgbWF0ZXJpYWxpemVDaGF0R1BUID0gYWdlbnRbJ19tYXRlcmlhbGl6ZUlmTmVlZGVkJ10oY2hhdEdQVEVudHJ5LCBjaGF0R1BURW50cnkuc2Vzc2lvblVyaSwgZmFsc2UpO1xuXHRcdGNvbnN0IGNoYXRHUFRTdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogY2hhdEdQVFN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkLWNoYXRncHQnIH0gfSB9KTtcblx0XHRhd2FpdCBtYXRlcmlhbGl6ZUNoYXRHUFQ7XG5cblx0XHRhd2FpdCBhZ2VudC5jaGF0cy5jaGFuZ2VNb2RlbChkZWZhdWx0Q2hhdE9mKGNvcGlsb3Quc2Vzc2lvbiksIHsgaWQ6IGNoYXRHUFRNb2RlbCB9LCBjaGF0Q29udGV4dChjb3BpbG90LnNlc3Npb24sIGRlZmF1bHRDaGF0T2YoY29waWxvdC5zZXNzaW9uKSkpO1xuXHRcdGNvbnN0IHBlcnNpc3RlZEFmdGVyU3dpdGNoID0gYXdhaXQgYWdlbnRbJ19tZXRhZGF0YVN0b3JlJ10ucmVhZChjb3BpbG90LnNlc3Npb24pO1xuXHRcdGNvbnN0IHJlbWF0ZXJpYWxpemVDb3BpbG90ID0gYWdlbnRbJ19tYXRlcmlhbGl6ZUlmTmVlZGVkJ10oY29waWxvdEVudHJ5LCBjb3BpbG90RW50cnkuc2Vzc2lvblVyaSwgZmFsc2UpO1xuXHRcdGNvbnN0IHN3aXRjaGVkU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHN3aXRjaGVkU3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICd0aHJlYWQtY29waWxvdC1zd2l0Y2hlZCcgfSB9IH0pO1xuXHRcdGF3YWl0IHJlbWF0ZXJpYWxpemVDb3BpbG90O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb3BpbG90U3RhcnQ6IHsgbW9kZWw6IGNvcGlsb3RTdGFydC5wYXJhbXMubW9kZWwsIHByb3ZpZGVyOiBjb3BpbG90U3RhcnQucGFyYW1zLm1vZGVsUHJvdmlkZXIgfSxcblx0XHRcdGNoYXRHUFRTdGFydDogeyBtb2RlbDogY2hhdEdQVFN0YXJ0LnBhcmFtcy5tb2RlbCwgcHJvdmlkZXI6IGNoYXRHUFRTdGFydC5wYXJhbXMubW9kZWxQcm92aWRlciB9LFxuXHRcdFx0c3dpdGNoZWRTdGFydDogeyBtb2RlbDogc3dpdGNoZWRTdGFydC5wYXJhbXMubW9kZWwsIHByb3ZpZGVyOiBzd2l0Y2hlZFN0YXJ0LnBhcmFtcy5tb2RlbFByb3ZpZGVyIH0sXG5cdFx0XHRjb3BpbG90VGhyZWFkOiBjb3BpbG90RW50cnkudGhyZWFkSWQsXG5cdFx0XHRjaGF0R1BUVGhyZWFkOiBjaGF0R1BURW50cnkudGhyZWFkSWQsXG5cdFx0XHRwZXJzaXN0ZWRBZnRlclN3aXRjaDogcGVyc2lzdGVkQWZ0ZXJTd2l0Y2gubW9kZWxJZCxcblx0XHR9LCB7XG5cdFx0XHRjb3BpbG90U3RhcnQ6IHsgbW9kZWw6ICdncHQtdGVzdCcsIHByb3ZpZGVyOiAndnNjb2RlLXByb3h5JyB9LFxuXHRcdFx0Y2hhdEdQVFN0YXJ0OiB7IG1vZGVsOiAnZ3B0LXRlc3QnLCBwcm92aWRlcjogJ29wZW5haScgfSxcblx0XHRcdHN3aXRjaGVkU3RhcnQ6IHsgbW9kZWw6ICdncHQtdGVzdCcsIHByb3ZpZGVyOiAnb3BlbmFpJyB9LFxuXHRcdFx0Y29waWxvdFRocmVhZDogJ3RocmVhZC1jb3BpbG90LXN3aXRjaGVkJyxcblx0XHRcdGNoYXRHUFRUaHJlYWQ6ICd0aHJlYWQtY2hhdGdwdCcsXG5cdFx0XHRwZXJzaXN0ZWRBZnRlclN3aXRjaDogY2hhdEdQVE1vZGVsLFxuXHRcdH0pO1xuXG5cdFx0cGVlci5leGl0KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2aWN0cyBhIGNvbXBsZXRlZCBmb2xkZXIgcHJld2FybSB3aGVuIHRoZSBmaXJzdCBzZW5kIHJlc29sdmVzIHRvIGEgd29ya3RyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgYXNzZXJ0UHJld2FybUV2aWN0ZWRPblNlbmQoZGlzcG9zYWJsZXMsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgYW5kIGV2aWN0cyBhbiBpbi1mbGlnaHQgZm9sZGVyIHByZXdhcm0gd2hlbiB0aGUgZmlyc3Qgc2VuZCByZXNvbHZlcyB0byBhIHdvcmt0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGFzc2VydFByZXdhcm1FdmljdGVkT25TZW5kKGRpc3Bvc2FibGVzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJy9jb21wYWN0IGludm9rZXMgdGhyZWFkL2NvbXBhY3Qvc3RhcnQgaW5zdGVhZCBvZiBzdGFydGluZyBhIHByb21wdCB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGFnZW50Wydfc2NoZWR1bGVQcmV3YXJtJ10gPSAoKSA9PiB7IH07XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDogbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KSxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXG5cdFx0Y29uc3QgcmVwbyA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbihhZ2VudCwgeyB3b3JraW5nRGlyZWN0b3JpZXM6IFtyZXBvXSwgbW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9IH0pO1xuXHRcdGNvbnN0IHNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSksICcvY29tcGFjdCcsIFtyZXBvXSwgdW5kZWZpbmVkLCAndHVybi1jb21wYWN0Jyk7XG5cdFx0Y29uc3QgdGhyZWFkU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHRocmVhZFN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkLWNvbXBhY3QnIH0gfSB9KTtcblx0XHRjb25zdCBjb21wYWN0U3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IGNvbXBhY3RTdGFydC5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRhd2FpdCBzZW5kO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aHJlYWRTdGFydDogeyBtZXRob2Q6IHRocmVhZFN0YXJ0Lm1ldGhvZCwgY3dkOiB0aHJlYWRTdGFydC5wYXJhbXMuY3dkIH0sXG5cdFx0XHRjb21wYWN0U3RhcnQ6IHsgbWV0aG9kOiBjb21wYWN0U3RhcnQubWV0aG9kLCB0aHJlYWRJZDogY29tcGFjdFN0YXJ0LnBhcmFtcy50aHJlYWRJZCB9LFxuXHRcdFx0Zmlyc3RUdXJuU2VudDogYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpPy5maXJzdFR1cm5TZW50LFxuXHRcdH0sIHtcblx0XHRcdHRocmVhZFN0YXJ0OiB7IG1ldGhvZDogJ3RocmVhZC9zdGFydCcsIGN3ZDogcmVwby5mc1BhdGggfSxcblx0XHRcdGNvbXBhY3RTdGFydDogeyBtZXRob2Q6ICd0aHJlYWQvY29tcGFjdC9zdGFydCcsIHRocmVhZElkOiAndGhyZWFkLWNvbXBhY3QnIH0sXG5cdFx0XHRmaXJzdFR1cm5TZW50OiB0cnVlLFxuXHRcdH0pO1xuXHRcdHBlZXIuZXhpdCgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aHJlYWQgc3RhcnQgcmVjZWl2ZXMgY3VzdG9tIGFnZW50cywgaW5zdHJ1Y3Rpb25zLCBza2lsbHMsIGFuZCBNQ1AgZnJvbSBjbGllbnQgcGx1Z2lucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRhZ2VudFsnX3NjaGVkdWxlUHJld2FybSddID0gKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0Y29uc3QgcGVlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQ6IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCksXG5cdFx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblxuXHRcdGNvbnN0IHJlcG8gPSBVUkkuZmlsZSgnL3JlcG8nKTtcblx0XHRjb25zdCBwbHVnaW5EaXIgPSBVUkkuZmlsZSgnL3BsdWdpbicpO1xuXHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZpbGUoJy9wbHVnaW4vYWdlbnRzL3Jldmlld2VyLmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb25VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbi9ydWxlcy9yZXBvLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IHNraWxsVXJpID0gVVJJLmZpbGUoJy9wbHVnaW4vc2tpbGxzL2dyZWV0L1NLSUxMLm1kJyk7XG5cdFx0YXdhaXQgYWdlbnRbJ19maWxlU2VydmljZSddLndyaXRlRmlsZShhZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnLS0tXFxubmFtZTogUmV2aWV3ZXJcXG5kZXNjcmlwdGlvbjogUmV2aWV3cyBjaGFuZ2VzXFxuLS0tXFxuUmV2aWV3IGNhcmVmdWxseS4nKSk7XG5cdFx0YXdhaXQgYWdlbnRbJ19maWxlU2VydmljZSddLndyaXRlRmlsZShpbnN0cnVjdGlvblVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnLS0tXFxuZGVzY3JpcHRpb246IFJlcG8gcnVsZXNcXG4tLS1cXG5SdW4gZm9jdXNlZCB0ZXN0cy4nKSk7XG5cdFx0YXdhaXQgYWdlbnRbJ19maWxlU2VydmljZSddLndyaXRlRmlsZShza2lsbFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnLS0tXFxubmFtZTogZ3JlZXRcXG5kZXNjcmlwdGlvbjogR3JlZXRzXFxuLS0tXFxuU2F5IGhlbGxvLicpKTtcblx0XHRjb25zdCBwYXJzZWQ6IElQYXJzZWRQbHVnaW4gPSB7XG5cdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5PcGVuUGx1Z2luLFxuXHRcdFx0aG9va3M6IFtdLFxuXHRcdFx0YWdlbnRzOiBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAnUmV2aWV3ZXInLCBkZXNjcmlwdGlvbjogJ1Jldmlld3MgY2hhbmdlcycsIGN1c3RvbWl6YXRpb246IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQnLCB1cmk6IGFnZW50VXJpLnRvU3RyaW5nKCksIG5hbWU6ICdSZXZpZXdlcicgfSB9XSxcblx0XHRcdGluc3RydWN0aW9uczogW3sgdXJpOiBpbnN0cnVjdGlvblVyaSwgbmFtZTogJ3JlcG8nLCBjdXN0b21pemF0aW9uOiB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUsIGlkOiAncnVsZScsIHVyaTogaW5zdHJ1Y3Rpb25VcmkudG9TdHJpbmcoKSwgbmFtZTogJ3JlcG8nIH0gfV0sXG5cdFx0XHRza2lsbHM6IFt7IHVyaTogc2tpbGxVcmksIG5hbWU6ICdncmVldCcsIGRlc2NyaXB0aW9uOiAnR3JlZXRzJywgY3VzdG9taXphdGlvbjogeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCwgaWQ6ICdza2lsbCcsIHVyaTogc2tpbGxVcmkudG9TdHJpbmcoKSwgbmFtZTogJ2dyZWV0JyB9IH1dLFxuXHRcdFx0bWNwU2VydmVyczogW3tcblx0XHRcdFx0bmFtZTogJ2xvY2FsJyxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbi8ubWNwLmpzb24nKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnbm9kZScsIGFyZ3M6IFsnc2VydmVyLmpzJ10gfSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsIGlkOiAnbWNwJywgdXJpOiAnZmlsZTovLy9wbHVnaW4vLm1jcC5qc29uJywgbmFtZTogJ2xvY2FsJywgc3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH0gfSxcblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0Y29uc3QgdW5zYWZlU2Vzc2lvbiA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29kZXgnLCBwYXRoOiAnLy4uLy4uL2NvZGV4LWN1c3RvbWl6YXRpb24tdmljdGltJyB9KTtcblx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oYWdlbnQsIHsgc2Vzc2lvbjogdW5zYWZlU2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yaWVzOiBbcmVwb10sIG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSwgYWdlbnQ6IHsgdXJpOiBhZ2VudFVyaS50b1N0cmluZygpIH0gfSk7XG5cdFx0Y29uc3QgZW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSkhO1xuXHRcdGVudHJ5LmNsaWVudEN1c3RvbWl6YXRpb25zLnNldENsaWVudCgndGVzdCcsIFt7XG5cdFx0XHRzeW5jZWQ6IHsgY3VzdG9taXphdGlvbjogeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAncGx1Z2luJywgdXJpOiBwbHVnaW5EaXIudG9TdHJpbmcoKSwgbmFtZTogJ3BsdWdpbicsIH0sIHBsdWdpbkRpciB9LFxuXHRcdFx0cGFyc2VkLFxuXHRcdH1dKTtcblxuXHRcdGNvbnN0IHNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSksICdoZWxsbycsIFtyZXBvXSwgdW5kZWZpbmVkLCAndHVybi0xJyk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0Y29uc3QgYWdlbnRzID0gc3RhcnQucGFyYW1zLmNvbmZpZz8uWydhZ2VudHMnXSBhcyBSZWNvcmQ8c3RyaW5nLCB7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGNvbmZpZ19maWxlOiBzdHJpbmcgfT47XG5cdFx0Y29uc3Qgcm9sZUZpbGUgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZShhZ2VudHMuUmV2aWV3ZXIuY29uZmlnX2ZpbGUsICd1dGY4Jyk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkLWN1c3RvbScgfSB9IH0pO1xuXHRcdGNvbnN0IHR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHR1cm4uaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0YXdhaXQgc2VuZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWNwOiBzdGFydC5wYXJhbXMuY29uZmlnPy5bJ21jcF9zZXJ2ZXJzJ10sXG5cdFx0XHRhZ2VudERlc2NyaXB0aW9uOiBhZ2VudHMuUmV2aWV3ZXIuZGVzY3JpcHRpb24sXG5cdFx0XHRkZXZlbG9wZXJJbnN0cnVjdGlvbnM6IHN0YXJ0LnBhcmFtcy5kZXZlbG9wZXJJbnN0cnVjdGlvbnMsXG5cdFx0XHR0dXJuRGV2ZWxvcGVySW5zdHJ1Y3Rpb25zOiB0dXJuLnBhcmFtcy5jb2xsYWJvcmF0aW9uTW9kZT8uc2V0dGluZ3MuZGV2ZWxvcGVyX2luc3RydWN0aW9ucyxcblx0XHRcdGNhcGFiaWxpdHlQYXRoczogc3RhcnQucGFyYW1zLnNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzPy5tYXAocm9vdCA9PiByb290LmxvY2F0aW9uLnBhdGgpLFxuXHRcdFx0cm9sZUZpbGUsXG5cdFx0XHRyb2xlRmlsZVVzZXNIb3N0R2VuZXJhdGVkUm9vdDogYWdlbnRzLlJldmlld2VyLmNvbmZpZ19maWxlLnN0YXJ0c1dpdGgoam9pbihvcy50bXBkaXIoKSwgJ3ZzY29kZS1hZ2VudC1jb2RleC1jdXN0b21pemF0aW9ucy0nKSksXG5cdFx0fSwge1xuXHRcdFx0bWNwOiB7IGxvY2FsOiB7IGNvbW1hbmQ6ICdub2RlJywgYXJnczogWydzZXJ2ZXIuanMnXSB9IH0sXG5cdFx0XHRhZ2VudERlc2NyaXB0aW9uOiAnUmV2aWV3cyBjaGFuZ2VzJyxcblx0XHRcdGRldmVsb3Blckluc3RydWN0aW9uczogJ1J1biBmb2N1c2VkIHRlc3RzLlxcblxcblJldmlldyBjYXJlZnVsbHkuJyxcblx0XHRcdHR1cm5EZXZlbG9wZXJJbnN0cnVjdGlvbnM6IGBSdW4gZm9jdXNlZCB0ZXN0cy5cXG5cXG5SZXZpZXcgY2FyZWZ1bGx5LlxcblxcbiR7Rk9SR0VfTElWRV9FRElUX0lOU1RSVUNUSU9OU31gLFxuXHRcdFx0Y2FwYWJpbGl0eVBhdGhzOiBbVVJJLmZpbGUoJy9wbHVnaW4vc2tpbGxzJykuZnNQYXRoXSxcblx0XHRcdHJvbGVGaWxlOiAnbmFtZSA9IFwiUmV2aWV3ZXJcIlxcbmRlc2NyaXB0aW9uID0gXCJSZXZpZXdzIGNoYW5nZXNcIlxcbmRldmVsb3Blcl9pbnN0cnVjdGlvbnMgPSBcIlJldmlldyBjYXJlZnVsbHkuXCJcXG4nLFxuXHRcdFx0cm9sZUZpbGVVc2VzSG9zdEdlbmVyYXRlZFJvb3Q6IHRydWUsXG5cdFx0fSk7XG5cdFx0cGVlci5leGl0KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3VtZXMgYW4gZXN0YWJsaXNoZWQgdGhyZWFkIHdoZW4gdGhlIHNlbGVjdGVkIHdvcmtzcGFjZSBhZ2VudCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGFnZW50Wydfc2NoZWR1bGVQcmV3YXJtJ10gPSAoKSA9PiB7IH07XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDogbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KSxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXG5cdFx0Y29uc3QgcmVwbyA9IFVSSS5maWxlKCcvcmVwby13b3Jrc3BhY2UtYWdlbnQtZWRpdCcpO1xuXHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmpvaW5QYXRoKHJlcG8sICcuZ2l0aHViJywgJ2FnZW50cycsICdyZXZpZXdlci5hZ2VudC5tZCcpO1xuXHRcdGF3YWl0IGFnZW50WydfZmlsZVNlcnZpY2UnXS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbm5hbWU6IFJldmlld2VyXFxuZGVzY3JpcHRpb246IFJldmlld3MgY2hhbmdlc1xcbi0tLVxcblVzZSB0aGUgb3JpZ2luYWwgaW5zdHJ1Y3Rpb25zLicpKTtcblx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oYWdlbnQsIHtcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9dLFxuXHRcdFx0bW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9LFxuXHRcdFx0YWdlbnQ6IHsgdXJpOiBhZ2VudFVyaS50b1N0cmluZygpIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblxuXHRcdGNvbnN0IGZpcnN0U2VuZCA9IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGNoYXQsICdmaXJzdCcsIFtyZXBvXSwgdW5kZWZpbmVkLCAndHVybi0xJyk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkLXdvcmtzcGFjZS1hZ2VudCcgfSB9IH0pO1xuXHRcdGNvbnN0IGZpcnN0VHVybiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogZmlyc3RUdXJuLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdGF3YWl0IGZpcnN0U2VuZDtcblxuXHRcdGF3YWl0IGFnZW50WydfZmlsZVNlcnZpY2UnXS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbm5hbWU6IFJldmlld2VyXFxuZGVzY3JpcHRpb246IFJldmlld3MgY2hhbmdlc1xcbi0tLVxcblVzZSB0aGUgdXBkYXRlZCBpbnN0cnVjdGlvbnMuJykpO1xuXHRcdGNvbnN0IHNlY29uZFNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShjaGF0LCAnc2Vjb25kJywgW3JlcG9dLCB1bmRlZmluZWQsICd0dXJuLTInKTtcblx0XHRjb25zdCB1bnN1YnNjcmliZSA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogdW5zdWJzY3JpYmUuaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0Y29uc3QgcmVzdW1lID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdGNvbnN0IHJlc3VtZWRBZ2VudHMgPSByZXN1bWUucGFyYW1zLmNvbmZpZz8uWydhZ2VudHMnXSBhcyBSZWNvcmQ8c3RyaW5nLCB7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGNvbmZpZ19maWxlOiBzdHJpbmcgfT47XG5cdFx0Y29uc3QgcmVzdW1lZFJvbGVGaWxlID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUocmVzdW1lZEFnZW50cy5SZXZpZXdlci5jb25maWdfZmlsZSwgJ3V0ZjgnKTtcblx0XHRwZWVyLnB1c2goeyBpZDogcmVzdW1lLmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkLXdvcmtzcGFjZS1hZ2VudCcsIGN3ZDogcmVwby5mc1BhdGggfSwgY3dkOiByZXBvLmZzUGF0aCB9IH0pO1xuXHRcdGNvbnN0IHNlY29uZFR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHNlY29uZFR1cm4uaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0YXdhaXQgc2Vjb25kU2VuZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnQ6IHsgbWV0aG9kOiBzdGFydC5tZXRob2QsIGRldmVsb3Blckluc3RydWN0aW9uczogc3RhcnQucGFyYW1zLmRldmVsb3Blckluc3RydWN0aW9ucyB9LFxuXHRcdFx0Zmlyc3RUdXJuOiB7IG1ldGhvZDogZmlyc3RUdXJuLm1ldGhvZCwgZGV2ZWxvcGVySW5zdHJ1Y3Rpb25zOiBmaXJzdFR1cm4ucGFyYW1zLmNvbGxhYm9yYXRpb25Nb2RlPy5zZXR0aW5ncy5kZXZlbG9wZXJfaW5zdHJ1Y3Rpb25zIH0sXG5cdFx0XHR1bnN1YnNjcmliZTogeyBtZXRob2Q6IHVuc3Vic2NyaWJlLm1ldGhvZCwgdGhyZWFkSWQ6IHVuc3Vic2NyaWJlLnBhcmFtcy50aHJlYWRJZCB9LFxuXHRcdFx0cmVzdW1lOiB7IG1ldGhvZDogcmVzdW1lLm1ldGhvZCwgZGV2ZWxvcGVySW5zdHJ1Y3Rpb25zOiByZXN1bWUucGFyYW1zLmRldmVsb3Blckluc3RydWN0aW9ucyB9LFxuXHRcdFx0c2Vjb25kVHVybjogeyBtZXRob2Q6IHNlY29uZFR1cm4ubWV0aG9kLCBkZXZlbG9wZXJJbnN0cnVjdGlvbnM6IHNlY29uZFR1cm4ucGFyYW1zLmNvbGxhYm9yYXRpb25Nb2RlPy5zZXR0aW5ncy5kZXZlbG9wZXJfaW5zdHJ1Y3Rpb25zIH0sXG5cdFx0XHRyZXN1bWVkUm9sZUZpbGUsXG5cdFx0XHRuZWVkc1Jlc3VtZTogYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpPy5uZWVkc1Jlc3VtZSxcblx0XHR9LCB7XG5cdFx0XHRzdGFydDogeyBtZXRob2Q6ICd0aHJlYWQvc3RhcnQnLCBkZXZlbG9wZXJJbnN0cnVjdGlvbnM6ICdVc2UgdGhlIG9yaWdpbmFsIGluc3RydWN0aW9ucy4nIH0sXG5cdFx0XHRmaXJzdFR1cm46IHsgbWV0aG9kOiAndHVybi9zdGFydCcsIGRldmVsb3Blckluc3RydWN0aW9uczogYFVzZSB0aGUgb3JpZ2luYWwgaW5zdHJ1Y3Rpb25zLlxcblxcbiR7Rk9SR0VfTElWRV9FRElUX0lOU1RSVUNUSU9OU31gIH0sXG5cdFx0XHR1bnN1YnNjcmliZTogeyBtZXRob2Q6ICd0aHJlYWQvdW5zdWJzY3JpYmUnLCB0aHJlYWRJZDogJ3RocmVhZC13b3Jrc3BhY2UtYWdlbnQnIH0sXG5cdFx0XHRyZXN1bWU6IHsgbWV0aG9kOiAndGhyZWFkL3Jlc3VtZScsIGRldmVsb3Blckluc3RydWN0aW9uczogJ1VzZSB0aGUgdXBkYXRlZCBpbnN0cnVjdGlvbnMuJyB9LFxuXHRcdFx0c2Vjb25kVHVybjogeyBtZXRob2Q6ICd0dXJuL3N0YXJ0JywgZGV2ZWxvcGVySW5zdHJ1Y3Rpb25zOiBgVXNlIHRoZSB1cGRhdGVkIGluc3RydWN0aW9ucy5cXG5cXG4ke0ZPUkdFX0xJVkVfRURJVF9JTlNUUlVDVElPTlN9YCB9LFxuXHRcdFx0cmVzdW1lZFJvbGVGaWxlOiAnbmFtZSA9IFwiUmV2aWV3ZXJcIlxcbmRlc2NyaXB0aW9uID0gXCJSZXZpZXdzIGNoYW5nZXNcIlxcbmRldmVsb3Blcl9pbnN0cnVjdGlvbnMgPSBcIlVzZSB0aGUgdXBkYXRlZCBpbnN0cnVjdGlvbnMuXCJcXG4nLFxuXHRcdFx0bmVlZHNSZXN1bWU6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdHBlZXIuZXhpdCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmcmVzaCBtdWx0aS1yb290IHN0YXJ0IHNlbGVjdHMgb25seSBleGlzdGluZyBzZWNvbmRhcnkgc2tpbGwgZGlyZWN0b3JpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBtdWx0aVJvb3RFbmFibGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQsXG5cdFx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEhvb2tDdXN0b21pemF0aW9ucyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsRXh0cmFSb290cyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGNvbnN0IHJlcG9BID0gVVJJLmZpbGUoJy9yZXBvLWEnKTtcblx0XHRjb25zdCByZXBvQiA9IFVSSS5maWxlKCcvcmVwby1iJyk7XG5cdFx0Y29uc3QgcmVwb0MgPSBVUkkuZmlsZSgnL3JlcG8tYycpO1xuXHRcdGNvbnN0IHByaW1hcnlTa2lsbHMgPSBVUkkuam9pblBhdGgocmVwb0EsICcuYWdlbnRzJywgJ3NraWxscycpO1xuXHRcdGNvbnN0IHJlcG9CQWdlbnRzU2tpbGxzID0gVVJJLmpvaW5QYXRoKHJlcG9CLCAnLmFnZW50cycsICdza2lsbHMnKTtcblx0XHRjb25zdCByZXBvQkNvZGV4U2tpbGxzID0gVVJJLmpvaW5QYXRoKHJlcG9CLCAnLmNvZGV4JywgJ3NraWxscycpO1xuXHRcdGNvbnN0IHJlcG9DQWdlbnRzU2tpbGxzID0gVVJJLmpvaW5QYXRoKHJlcG9DLCAnLmFnZW50cycsICdza2lsbHMnKTtcblx0XHRjb25zdCByZXBvQ0NvZGV4U2tpbGxzID0gVVJJLmpvaW5QYXRoKHJlcG9DLCAnLmNvZGV4JywgJ3NraWxscycpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWdlbnRbJ19maWxlU2VydmljZSddO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihwcmltYXJ5U2tpbGxzKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIocmVwb0JBZ2VudHNTa2lsbHMpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihyZXBvQkNvZGV4U2tpbGxzKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoVVJJLmpvaW5QYXRoKHJlcG9DLCAnLmFnZW50cycpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGaWxlKHJlcG9DQWdlbnRzU2tpbGxzKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIocmVwb0NDb2RleFNraWxscyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKGFnZW50LCB7IHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9BLCByZXBvQiwgcmVwb0NdLCBtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0gfSk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSE7XG5cdFx0XHRjb25zdCBzdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3RocmVhZCcgfSB9IH0pO1xuXHRcdFx0YXdhaXQgZW50cnkubWF0ZXJpYWxpemVQcm9taXNlO1xuXG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5kZWwocmVwb0JBZ2VudHNTa2lsbHMsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3Qgc2VuZCA9IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKSwgJ2hlbGxvJywgW3JlcG9BLCByZXBvQiwgcmVwb0NdLCB1bmRlZmluZWQsICd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IHR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogdHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHNlbmQ7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGFydE1ldGhvZDogc3RhcnQubWV0aG9kLFxuXHRcdFx0XHRzZWxlY3RlZFBhdGhzOiBzdGFydC5wYXJhbXMuc2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHM/Lm1hcChyb290ID0+IHJvb3QubG9jYXRpb24ucGF0aCksXG5cdFx0XHRcdG5leHRNZXRob2RBZnRlclNuYXBzaG90TXV0YXRpb246IHR1cm4ubWV0aG9kLFxuXHRcdFx0XHR0dXJuU2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHM6IHR1cm4ucGFyYW1zLnNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGFydE1ldGhvZDogJ3RocmVhZC9zdGFydCcsXG5cdFx0XHRcdHNlbGVjdGVkUGF0aHM6IFtyZXBvQkFnZW50c1NraWxscy5mc1BhdGgsIHJlcG9CQ29kZXhTa2lsbHMuZnNQYXRoLCByZXBvQ0NvZGV4U2tpbGxzLmZzUGF0aF0sXG5cdFx0XHRcdG5leHRNZXRob2RBZnRlclNuYXBzaG90TXV0YXRpb246ICd0dXJuL3N0YXJ0Jyxcblx0XHRcdFx0dHVyblNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5leGl0KCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd1bmV4cGVjdGVkIGNhcGFiaWxpdHktcm9vdCBtZXRhZGF0YSBmYWlsdXJlcyB3YXJuIHdpdGhvdXQgYmxvY2tpbmcgc3RhcnQgb3IgZXhwb3NpbmcgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBtdWx0aVJvb3RFbmFibGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQsXG5cdFx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEhvb2tDdXN0b21pemF0aW9ucyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsRXh0cmFSb290cyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGNvbnN0IHJlcG9BID0gVVJJLmZpbGUoJy9yZXBvLWEnKTtcblx0XHRjb25zdCByZXBvQiA9IFVSSS5maWxlKCcvcmVwby1iJyk7XG5cdFx0Y29uc3QgcmVwb0JBZ2VudHNTa2lsbHMgPSBVUkkuam9pblBhdGgocmVwb0IsICcuYWdlbnRzJywgJ3NraWxscycpO1xuXHRcdGNvbnN0IHJlcG9CQ29kZXhTa2lsbHMgPSBVUkkuam9pblBhdGgocmVwb0IsICcuY29kZXgnLCAnc2tpbGxzJyk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhZ2VudFsnX2ZpbGVTZXJ2aWNlJ107XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFnZW50WydfbG9nU2VydmljZSddO1xuXHRcdGFzc2VydC5vayhmaWxlU2VydmljZSBpbnN0YW5jZW9mIFRlc3RDb2RleEZpbGVTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sobG9nU2VydmljZSBpbnN0YW5jZW9mIFRlc3RDb2RleExvZ1NlcnZpY2UpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihyZXBvQkFnZW50c1NraWxscyk7XG5cdFx0ZmlsZVNlcnZpY2UuZmFpbFN0YXQocmVwb0JDb2RleFNraWxscyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKGFnZW50LCB7IHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9BLCByZXBvQl0sIG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSB9KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpITtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkJyB9IH0gfSk7XG5cdFx0XHRhd2FpdCBlbnRyeS5tYXRlcmlhbGl6ZVByb21pc2U7XG5cdFx0XHRjb25zdCBjYXBhYmlsaXR5Um9vdFdhcm5pbmdzID0gbG9nU2VydmljZS53YXJuaW5ncy5maWx0ZXIod2FybmluZyA9PiB3YXJuaW5nLmluY2x1ZGVzKCdzZWxlY3RlZCBjYXBhYmlsaXR5IHJvb3QnKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZWxlY3RlZFBhdGhzOiBzdGFydC5wYXJhbXMuc2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHM/Lm1hcChyb290ID0+IHJvb3QubG9jYXRpb24ucGF0aCksXG5cdFx0XHRcdHdhcm5pbmdDb3VudDogY2FwYWJpbGl0eVJvb3RXYXJuaW5ncy5sZW5ndGgsXG5cdFx0XHRcdHdhcm5pbmdJbmNsdWRlc1BhdGg6IGNhcGFiaWxpdHlSb290V2FybmluZ3Muc29tZSh3YXJuaW5nID0+IHdhcm5pbmcuaW5jbHVkZXMocmVwb0IuZnNQYXRoKSksXG5cdFx0XHRcdHdhcm5pbmdJbmNsdWRlc1Jhd0Vycm9yOiBjYXBhYmlsaXR5Um9vdFdhcm5pbmdzLnNvbWUod2FybmluZyA9PiB3YXJuaW5nLmluY2x1ZGVzKCdzZW5zaXRpdmUgcGF0aCcpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2VsZWN0ZWRQYXRoczogW3JlcG9CQWdlbnRzU2tpbGxzLmZzUGF0aF0sXG5cdFx0XHRcdHdhcm5pbmdDb3VudDogMSxcblx0XHRcdFx0d2FybmluZ0luY2x1ZGVzUGF0aDogZmFsc2UsXG5cdFx0XHRcdHdhcm5pbmdJbmNsdWRlc1Jhd0Vycm9yOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmV4aXQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZS1maXJzdC10dXJuIHJlcGxhY2VtZW50IHJlZXZhbHVhdGVzIHNlbGVjdGVkIGNhcGFiaWxpdHkgcm9vdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBtdWx0aVJvb3RFbmFibGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQsXG5cdFx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEhvb2tDdXN0b21pemF0aW9ucyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsRXh0cmFSb290cyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGNvbnN0IHJlcG9BID0gVVJJLmZpbGUoJy9yZXBvLWEnKTtcblx0XHRjb25zdCByZXBvQiA9IFVSSS5maWxlKCcvcmVwby1iJyk7XG5cdFx0Y29uc3QgcmVwb0JBZ2VudHNTa2lsbHMgPSBVUkkuam9pblBhdGgocmVwb0IsICcuYWdlbnRzJywgJ3NraWxscycpO1xuXHRcdGNvbnN0IHJlcG9CQ29kZXhTa2lsbHMgPSBVUkkuam9pblBhdGgocmVwb0IsICcuY29kZXgnLCAnc2tpbGxzJyk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhZ2VudFsnX2ZpbGVTZXJ2aWNlJ107XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHJlcG9CQWdlbnRzU2tpbGxzKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oYWdlbnQsIHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbcmVwb0EsIHJlcG9CXSwgbW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9IH0pO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSkhO1xuXHRcdFx0Y29uc3QgZmlyc3RTdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBmaXJzdFN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkLWZpcnN0JyB9IH0gfSk7XG5cdFx0XHRhd2FpdCBlbnRyeS5tYXRlcmlhbGl6ZVByb21pc2U7XG5cblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmRlbChyZXBvQkFnZW50c1NraWxscywgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIocmVwb0JDb2RleFNraWxscyk7XG5cdFx0XHRlbnRyeS5jbGllbnRUb29sU2V0LnNldCgnY2xpZW50JywgW3tcblx0XHRcdFx0bmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCB0b29sJyxcblx0XHRcdFx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcgfSxcblx0XHRcdH1dKTtcblxuXHRcdFx0Y29uc3Qgc2VuZCA9IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKSwgJ2hlbGxvJywgW3JlcG9BLCByZXBvQl0sIHVuZGVmaW5lZCwgJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3QgdW5zdWJzY3JpYmUgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogdW5zdWJzY3JpYmUuaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRjb25zdCBzZWNvbmRTdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzZWNvbmRTdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3RocmVhZC1zZWNvbmQnIH0gfSB9KTtcblx0XHRcdGNvbnN0IHR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogdHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHNlbmQ7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmaXJzdFNlbGVjdGVkUGF0aHM6IGZpcnN0U3RhcnQucGFyYW1zLnNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzPy5tYXAocm9vdCA9PiByb290LmxvY2F0aW9uLnBhdGgpLFxuXHRcdFx0XHR1bnN1YnNjcmliZU1ldGhvZDogdW5zdWJzY3JpYmUubWV0aG9kLFxuXHRcdFx0XHRzZWNvbmRTZWxlY3RlZFBhdGhzOiBzZWNvbmRTdGFydC5wYXJhbXMuc2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHM/Lm1hcChyb290ID0+IHJvb3QubG9jYXRpb24ucGF0aCksXG5cdFx0XHRcdHR1cm5NZXRob2Q6IHR1cm4ubWV0aG9kLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRmaXJzdFNlbGVjdGVkUGF0aHM6IFtyZXBvQkFnZW50c1NraWxscy5mc1BhdGhdLFxuXHRcdFx0XHR1bnN1YnNjcmliZU1ldGhvZDogJ3RocmVhZC91bnN1YnNjcmliZScsXG5cdFx0XHRcdHNlY29uZFNlbGVjdGVkUGF0aHM6IFtyZXBvQkNvZGV4U2tpbGxzLmZzUGF0aF0sXG5cdFx0XHRcdHR1cm5NZXRob2Q6ICd0dXJuL3N0YXJ0Jyxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmV4aXQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLXJvb3Qgc3RhcnQgYW5kIHR1cm4gc2VwYXJhdGUgd29ya3NwYWNlIHJvb3RzIGZyb20gYWRkaXRpb25hbCB3cml0YWJsZSBkaXJlY3RvcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZGRpdGlvbmFsRGlyZWN0b3J5ID0gVVJJLmZpbGUoJy9tYW51YWwtd3JpdGUnKS5mc1BhdGg7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ211bHRpLXJvb3QnKTtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRtdWx0aVJvb3RFbmFibGVkOiB0cnVlLFxuXHRcdFx0c2Vzc2lvbkNvbmZpZzogeyBbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFkZGl0aW9uYWxEaXJlY3Rvcmllc106IFthZGRpdGlvbmFsRGlyZWN0b3J5LCBgJHthZGRpdGlvbmFsRGlyZWN0b3J5fSR7c2VwfWBdIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGVlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudCxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0Y29uc3QgcmVwb0EgPSBVUkkuZmlsZSgnL3JlcG8tYScpO1xuXHRcdGNvbnN0IHJlcG9CID0gVVJJLmZpbGUoJy9yZXBvLWInKTtcblx0XHRjb25zdCBkdXBsaWNhdGVSZXBvQSA9IFVSSS5maWxlKGAke3JlcG9BLmZzUGF0aH0ke3NlcH1gKTtcblx0XHRjb25zdCBjYXNlVmFyaWFudFJlcG9BID0gVVJJLmZpbGUocmVwb0EuZnNQYXRoLnRvVXBwZXJDYXNlKCkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IFtyZXBvQSwgZHVwbGljYXRlUmVwb0EsIC4uLihpc1dpbmRvd3MgPyBbY2FzZVZhcmlhbnRSZXBvQV0gOiBbXSksIHJlcG9CXTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbihhZ2VudCwgeyBzZXNzaW9uOiBzZXNzaW9uVXJpLCB3b3JraW5nRGlyZWN0b3JpZXMsIG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSB9KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpITtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkJyB9LCBydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblxuXHRcdFx0Y29uc3Qgc2VuZCA9IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKSwgJ2hlbGxvJywgd29ya2luZ0RpcmVjdG9yaWVzLCB1bmRlZmluZWQsICd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IHR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogdHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHNlbmQ7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFnZW50WydfY29uZmlndXJhdGlvblNlcnZpY2UnXTtcblx0XHRcdGFzc2VydC5vayhjb25maWd1cmF0aW9uU2VydmljZSBpbnN0YW5jZW9mIFRlc3RDb2RleENvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFNlc3Npb25Db25maWcoeyBbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0XTogJ2Z1bGwtYWNjZXNzJyB9KTtcblx0XHRcdGNvbnN0IGZ1bGxBY2Nlc3MgPSBhZ2VudFsnX3R1cm5TdGFydE9wdGlvbnMnXShlbnRyeSwgJ2dwdC10ZXN0Jyk7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRTZXNzaW9uQ29uZmlnKHsgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5TYW5kYm94TW9kZV06ICdyZWFkLW9ubHknIH0pO1xuXHRcdFx0Y29uc3QgcmVhZE9ubHkgPSBhZ2VudFsnX3R1cm5TdGFydE9wdGlvbnMnXShlbnRyeSwgJ2dwdC10ZXN0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGFydDoge1xuXHRcdFx0XHRcdGN3ZDogc3RhcnQucGFyYW1zLmN3ZCxcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IHN0YXJ0LnBhcmFtcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdFx0c2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHM6IHN0YXJ0LnBhcmFtcy5zZWxlY3RlZENhcGFiaWxpdHlSb290cyxcblx0XHRcdFx0fSxcblx0XHRcdFx0dHVybjoge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogdHVybi5wYXJhbXMucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHRcdHNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzOiB0dXJuLnBhcmFtcy5zZWxlY3RlZENhcGFiaWxpdHlSb290cyxcblx0XHRcdFx0XHRzYW5kYm94UG9saWN5OiB0dXJuLnBhcmFtcy5zYW5kYm94UG9saWN5LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmdWxsQWNjZXNzOiB7XG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiBmdWxsQWNjZXNzLnJ1bnRpbWVXb3Jrc3BhY2VSb290cyxcblx0XHRcdFx0XHRzYW5kYm94UG9saWN5OiBmdWxsQWNjZXNzLnNhbmRib3hQb2xpY3ksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlYWRPbmx5OiB7XG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiByZWFkT25seS5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdFx0c2FuZGJveFBvbGljeTogcmVhZE9ubHkuc2FuZGJveFBvbGljeSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhcnQ6IHtcblx0XHRcdFx0XHRjd2Q6IHJlcG9BLmZzUGF0aCxcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHRcdFx0c2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0dHVybjoge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogW3JlcG9BLmZzUGF0aCwgcmVwb0IuZnNQYXRoXSxcblx0XHRcdFx0XHRzZWxlY3RlZENhcGFiaWxpdHlSb290czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNhbmRib3hQb2xpY3k6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICd3b3Jrc3BhY2VXcml0ZScsXG5cdFx0XHRcdFx0XHR3cml0YWJsZVJvb3RzOiBbcmVwb0EuZnNQYXRoLCByZXBvQi5mc1BhdGgsIGFkZGl0aW9uYWxEaXJlY3RvcnldLFxuXHRcdFx0XHRcdFx0bmV0d29ya0FjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVUbXBkaXJFbnZWYXI6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVNsYXNoVG1wOiBmYWxzZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmdWxsQWNjZXNzOiB7XG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiBbcmVwb0EuZnNQYXRoLCByZXBvQi5mc1BhdGhdLFxuXHRcdFx0XHRcdHNhbmRib3hQb2xpY3k6IHsgdHlwZTogJ2RhbmdlckZ1bGxBY2Nlc3MnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlYWRPbmx5OiB7XG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiBbcmVwb0EuZnNQYXRoLCByZXBvQi5mc1BhdGhdLFxuXHRcdFx0XHRcdHNhbmRib3hQb2xpY3k6IHsgdHlwZTogJ3JlYWRPbmx5JywgbmV0d29ya0FjY2VzczogZmFsc2UgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmV4aXQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnNlY3V0aXZlIHNlbmRzIHJlcGxhY2UgYW5kIHJlbW92ZSB3b3Jrc3BhY2Ugcm9vdHMgb24gdGhlIGV4aXN0aW5nIHRocmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCB7IG11bHRpUm9vdEVuYWJsZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgcGVlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQ6IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCksXG5cdFx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEhvb2tDdXN0b21pemF0aW9ucyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsRXh0cmFSb290cyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGNvbnN0IHJlcG9BID0gVVJJLmZpbGUoJy9yZXBvLWEnKTtcblx0XHRjb25zdCByZXBvQiA9IFVSSS5maWxlKCcvcmVwby1iJyk7XG5cdFx0Y29uc3QgcmVwb0MgPSBVUkkuZmlsZSgnL3JlcG8tYycpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBjcmVhdGVTZXNzaW9uKGFnZW50LCB7IHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9BLCByZXBvQl0sIG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSB9KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoY3JlYXRlZC5zZXNzaW9uKSkhO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogc3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICd0aHJlYWQnIH0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblxuXHRcdFx0Y29uc3QgZmlyc3RTZW5kID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoY3JlYXRlZC5zZXNzaW9uKSksICdmaXJzdCcsIFtyZXBvQSwgcmVwb0JdLCB1bmRlZmluZWQsICd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IGZpcnN0VHVybiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBmaXJzdFR1cm4uaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRhd2FpdCBmaXJzdFNlbmQ7XG5cblx0XHRcdGNvbnN0IHNlY29uZFNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShjcmVhdGVkLnNlc3Npb24pKSwgJ3NlY29uZCcsIFtyZXBvQSwgcmVwb0NdLCB1bmRlZmluZWQsICd0dXJuLTInKTtcblx0XHRcdGNvbnN0IHNlY29uZFR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogc2Vjb25kVHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHNlY29uZFNlbmQ7XG5cblx0XHRcdGNvbnN0IHRoaXJkU2VuZCA9IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGNyZWF0ZWQuc2Vzc2lvbikpLCAndGhpcmQnLCBbcmVwb0FdLCB1bmRlZmluZWQsICd0dXJuLTMnKTtcblx0XHRcdGNvbnN0IHRoaXJkVHVybiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiB0aGlyZFR1cm4uaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRhd2FpdCB0aGlyZFNlbmQ7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZWNvbmQ6IHtcblx0XHRcdFx0XHRtZXRob2Q6IHNlY29uZFR1cm4ubWV0aG9kLFxuXHRcdFx0XHRcdHRocmVhZElkOiBzZWNvbmRUdXJuLnBhcmFtcy50aHJlYWRJZCxcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IHNlY29uZFR1cm4ucGFyYW1zLnJ1bnRpbWVXb3Jrc3BhY2VSb290cyxcblx0XHRcdFx0XHR3cml0YWJsZVJvb3RzOiBzZWNvbmRUdXJuLnBhcmFtcy5zYW5kYm94UG9saWN5Py50eXBlID09PSAnd29ya3NwYWNlV3JpdGUnID8gc2Vjb25kVHVybi5wYXJhbXMuc2FuZGJveFBvbGljeS53cml0YWJsZVJvb3RzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aGlyZDoge1xuXHRcdFx0XHRcdG1ldGhvZDogdGhpcmRUdXJuLm1ldGhvZCxcblx0XHRcdFx0XHR0aHJlYWRJZDogdGhpcmRUdXJuLnBhcmFtcy50aHJlYWRJZCxcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IHRoaXJkVHVybi5wYXJhbXMucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHRcdHdyaXRhYmxlUm9vdHM6IHRoaXJkVHVybi5wYXJhbXMuc2FuZGJveFBvbGljeT8udHlwZSA9PT0gJ3dvcmtzcGFjZVdyaXRlJyA/IHRoaXJkVHVybi5wYXJhbXMuc2FuZGJveFBvbGljeS53cml0YWJsZVJvb3RzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZWNvbmQ6IHtcblx0XHRcdFx0XHRtZXRob2Q6ICd0dXJuL3N0YXJ0Jyxcblx0XHRcdFx0XHR0aHJlYWRJZDogJ3RocmVhZCcsXG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiBbcmVwb0EuZnNQYXRoLCByZXBvQy5mc1BhdGhdLFxuXHRcdFx0XHRcdHdyaXRhYmxlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9DLmZzUGF0aF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRoaXJkOiB7XG5cdFx0XHRcdFx0bWV0aG9kOiAndHVybi9zdGFydCcsXG5cdFx0XHRcdFx0dGhyZWFkSWQ6ICd0aHJlYWQnLFxuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogW3JlcG9BLmZzUGF0aF0sXG5cdFx0XHRcdFx0d3JpdGFibGVSb290czogW3JlcG9BLmZzUGF0aF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5leGl0KCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxlZCBtdWx0aS1yb290IHByZXNlcnZlcyB0aGUgZXhpc3RpbmcgYWRkaXRpb25hbC1kaXJlY3RvcnkgcGF5bG9hZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZGRpdGlvbmFsRGlyZWN0b3J5ID0gVVJJLmZpbGUoJy9tYW51YWwtd3JpdGUnKS5mc1BhdGg7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ3NpbmdsZS1yb290Jyk7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywge1xuXHRcdFx0c2Vzc2lvbkNvbmZpZzogeyBbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFkZGl0aW9uYWxEaXJlY3Rvcmllc106IFthZGRpdGlvbmFsRGlyZWN0b3J5XSB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQsXG5cdFx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEhvb2tDdXN0b21pemF0aW9ucyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsRXh0cmFSb290cyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGNvbnN0IHJlcG9BID0gVVJJLmZpbGUoJy9yZXBvLWEnKTtcblx0XHRjb25zdCByZXBvQiA9IFVSSS5maWxlKCcvcmVwby1iJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKGFnZW50LCB7IHNlc3Npb246IHNlc3Npb25VcmksIHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9BLCByZXBvQl0sIG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSB9KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpITtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkJyB9IH0gfSk7XG5cdFx0XHRhd2FpdCBlbnRyeS5tYXRlcmlhbGl6ZVByb21pc2U7XG5cblx0XHRcdGNvbnN0IHNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSksICdoZWxsbycsIFtyZXBvQV0sIHVuZGVmaW5lZCwgJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3QgdHVybiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiB0dXJuLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgc2VuZDtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXJ0UnVudGltZVdvcmtzcGFjZVJvb3RzOiBzdGFydC5wYXJhbXMucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHRzdGFydFNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzOiBzdGFydC5wYXJhbXMuc2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHMsXG5cdFx0XHRcdHR1cm5SdW50aW1lV29ya3NwYWNlUm9vdHM6IHR1cm4ucGFyYW1zLnJ1bnRpbWVXb3Jrc3BhY2VSb290cyxcblx0XHRcdFx0dHVyblNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzOiB0dXJuLnBhcmFtcy5zZWxlY3RlZENhcGFiaWxpdHlSb290cyxcblx0XHRcdFx0d3JpdGFibGVSb290czogdHVybi5wYXJhbXMuc2FuZGJveFBvbGljeT8udHlwZSA9PT0gJ3dvcmtzcGFjZVdyaXRlJyA/IHR1cm4ucGFyYW1zLnNhbmRib3hQb2xpY3kud3JpdGFibGVSb290cyA6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhcnRSdW50aW1lV29ya3NwYWNlUm9vdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhcnRTZWxlY3RlZENhcGFiaWxpdHlSb290czogdW5kZWZpbmVkLFxuXHRcdFx0XHR0dXJuUnVudGltZVdvcmtzcGFjZVJvb3RzOiBbcmVwb0EuZnNQYXRoLCBhZGRpdGlvbmFsRGlyZWN0b3J5XSxcblx0XHRcdFx0dHVyblNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdyaXRhYmxlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIGFkZGl0aW9uYWxEaXJlY3RvcnldLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXIuZXhpdCgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZW5hYmxlZCBtdWx0aS1yb290IHByZXNlcnZlcyBzaW5nbGUtZm9sZGVyIHByb3RvY29sIGFuZCBzYW5kYm94IGJlaGF2aW9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxEaXJlY3RvcnkgPSBgJHtVUkkuZmlsZSgnL21hbnVhbC13cml0ZScpLmZzUGF0aH0ke3NlcH1gO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdlbmFibGVkLXNpbmdsZS1yb290Jyk7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywge1xuXHRcdFx0bXVsdGlSb290RW5hYmxlZDogdHJ1ZSxcblx0XHRcdHNlc3Npb25Db25maWc6IHsgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5BZGRpdGlvbmFsRGlyZWN0b3JpZXNdOiBbYWRkaXRpb25hbERpcmVjdG9yeV0gfSxcblx0XHR9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50LFxuXHRcdFx0dXNhZ2VTb3VyY2U6ICdnaXRodWInLFxuXHRcdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0gYXMgbmV2ZXI7XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRjb25zdCByZXBvID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKGFnZW50LCB7IHNlc3Npb246IHNlc3Npb25VcmksIHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9dLCBtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0gfSk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSE7XG5cdFx0XHRjb25zdCBzdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3RocmVhZCcgfSB9IH0pO1xuXHRcdFx0YXdhaXQgZW50cnkubWF0ZXJpYWxpemVQcm9taXNlO1xuXG5cdFx0XHRjb25zdCBzZW5kID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpLCAnaGVsbG8nLCBbcmVwb10sIHVuZGVmaW5lZCwgJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3QgdHVybiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiB0dXJuLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgc2VuZDtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWdlbnRbJ19jb25maWd1cmF0aW9uU2VydmljZSddO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbmZpZ3VyYXRpb25TZXJ2aWNlIGluc3RhbmNlb2YgVGVzdENvZGV4Q29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0U2Vzc2lvbkNvbmZpZyh7IFtDb2RleFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNQcmVzZXRdOiAnZnVsbC1hY2Nlc3MnIH0pO1xuXHRcdFx0Y29uc3QgZnVsbEFjY2VzcyA9IGFnZW50WydfdHVyblN0YXJ0T3B0aW9ucyddKGVudHJ5LCAnZ3B0LXRlc3QnKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFNlc3Npb25Db25maWcoeyBbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlNhbmRib3hNb2RlXTogJ3JlYWQtb25seScgfSk7XG5cdFx0XHRjb25zdCByZWFkT25seSA9IGFnZW50WydfdHVyblN0YXJ0T3B0aW9ucyddKGVudHJ5LCAnZ3B0LXRlc3QnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXJ0OiB7XG5cdFx0XHRcdFx0Y3dkOiBzdGFydC5wYXJhbXMuY3dkLFxuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogc3RhcnQucGFyYW1zLnJ1bnRpbWVXb3Jrc3BhY2VSb290cyxcblx0XHRcdFx0XHRzZWxlY3RlZENhcGFiaWxpdHlSb290czogc3RhcnQucGFyYW1zLnNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0dXJuOiB7XG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiB0dXJuLnBhcmFtcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdFx0c2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHM6IHR1cm4ucGFyYW1zLnNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzLFxuXHRcdFx0XHRcdHNhbmRib3hQb2xpY3k6IHR1cm4ucGFyYW1zLnNhbmRib3hQb2xpY3ksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZ1bGxBY2Nlc3M6IHtcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IGZ1bGxBY2Nlc3MucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHRcdHNhbmRib3hQb2xpY3k6IGZ1bGxBY2Nlc3Muc2FuZGJveFBvbGljeSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVhZE9ubHk6IHtcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IHJlYWRPbmx5LnJ1bnRpbWVXb3Jrc3BhY2VSb290cyxcblx0XHRcdFx0XHRzYW5kYm94UG9saWN5OiByZWFkT25seS5zYW5kYm94UG9saWN5LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGFydDoge1xuXHRcdFx0XHRcdGN3ZDogcmVwby5mc1BhdGgsXG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0dHVybjoge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogW3JlcG8uZnNQYXRoLCBhZGRpdGlvbmFsRGlyZWN0b3J5XSxcblx0XHRcdFx0XHRzZWxlY3RlZENhcGFiaWxpdHlSb290czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNhbmRib3hQb2xpY3k6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICd3b3Jrc3BhY2VXcml0ZScsXG5cdFx0XHRcdFx0XHR3cml0YWJsZVJvb3RzOiBbcmVwby5mc1BhdGgsIGFkZGl0aW9uYWxEaXJlY3RvcnldLFxuXHRcdFx0XHRcdFx0bmV0d29ya0FjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVUbXBkaXJFbnZWYXI6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVNsYXNoVG1wOiBmYWxzZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmdWxsQWNjZXNzOiB7XG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2FuZGJveFBvbGljeTogeyB0eXBlOiAnZGFuZ2VyRnVsbEFjY2VzcycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVhZE9ubHk6IHtcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzYW5kYm94UG9saWN5OiB7IHR5cGU6ICdyZWFkT25seScsIG5ldHdvcmtBY2Nlc3M6IGZhbHNlIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5leGl0KCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdmb3JrIGluaGVyaXRzIHRoZSBzb3VyY2Ugd29ya3NwYWNlIHJvb3RzIGluc3RlYWQgb2YgcmVxdWVzdGVkIHJlcGxhY2VtZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCB7IG11bHRpUm9vdEVuYWJsZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgcGVlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudCxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0Y29uc3QgcmVwb0EgPSBVUkkuZmlsZSgnL3JlcG8tYScpO1xuXHRcdGNvbnN0IHJlcG9CID0gVVJJLmZpbGUoJy9yZXBvLWInKTtcblx0XHRjb25zdCByZXF1ZXN0ZWRBID0gVVJJLmZpbGUoJy9yZXF1ZXN0ZWQtYScpO1xuXHRcdGNvbnN0IHJlcXVlc3RlZEIgPSBVUkkuZmlsZSgnL3JlcXVlc3RlZC1iJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgY3JlYXRlU2Vzc2lvbihhZ2VudCwgeyB3b3JraW5nRGlyZWN0b3JpZXM6IFtyZXBvQSwgcmVwb0JdLCBtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0gfSk7XG5cdFx0XHRjb25zdCBzb3VyY2VFbnRyeSA9IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKHNvdXJjZS5zZXNzaW9uKSkhO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogc3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdzb3VyY2UtdGhyZWFkJyB9LCBjd2Q6IHJlcG9BLmZzUGF0aCwgcnVudGltZVdvcmtzcGFjZVJvb3RzOiBbcmVwb0EuZnNQYXRoLCByZXBvQi5mc1BhdGhdIH0gfSk7XG5cdFx0XHRhd2FpdCBzb3VyY2VFbnRyeS5tYXRlcmlhbGl6ZVByb21pc2U7XG5cblx0XHRcdGNvbnN0IGZvcmtQcm9taXNlID0gY3JlYXRlU2Vzc2lvbihhZ2VudCwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtyZXF1ZXN0ZWRBLCByZXF1ZXN0ZWRCXSxcblx0XHRcdFx0Zm9yazogeyBzb3VyY2U6IGRlZmF1bHRDaGF0T2Yoc291cmNlLnNlc3Npb24pLCB0dXJuSWQ6ICd0dXJuLTEnLCB0dXJuSW5kZXg6IDAgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZWFkID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHtcblx0XHRcdFx0aWQ6IHJlYWQuaWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHRocmVhZDoge1xuXHRcdFx0XHRcdFx0aWQ6ICdzb3VyY2UtdGhyZWFkJyxcblx0XHRcdFx0XHRcdGN3ZDogcmVwb0EuZnNQYXRoLFxuXHRcdFx0XHRcdFx0dHVybnM6IFt7IGlkOiAndHVybi0xJyB9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBmb3JrID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHtcblx0XHRcdFx0aWQ6IGZvcmsuaWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHRocmVhZDogeyBpZDogJ2ZvcmstdGhyZWFkJywgY3dkOiByZXBvQS5mc1BhdGggfSxcblx0XHRcdFx0XHRjd2Q6IHJlcG9BLmZzUGF0aCxcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGZvcmtlZCA9IGF3YWl0IGZvcmtQcm9taXNlO1xuXHRcdFx0Y29uc3QgZm9ya2VkRW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KEFnZW50U2Vzc2lvbi5pZChmb3JrZWQuc2Vzc2lvbikpITtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHRtZXRob2Q6IGZvcmsubWV0aG9kLFxuXHRcdFx0XHRcdGN3ZDogZm9yay5wYXJhbXMuY3dkLFxuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogZm9yay5wYXJhbXMucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHRcdG1vZGVsOiBmb3JrLnBhcmFtcy5tb2RlbCxcblx0XHRcdFx0XHRtb2RlbFByb3ZpZGVyOiBmb3JrLnBhcmFtcy5tb2RlbFByb3ZpZGVyLFxuXHRcdFx0XHRcdHNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzOiBmb3JrLnBhcmFtcy5zZWxlY3RlZENhcGFiaWxpdHlSb290cyxcblx0XHRcdFx0fSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBmb3JrZWRFbnRyeS53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZzUGF0aCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHRtZXRob2Q6ICd0aHJlYWQvZm9yaycsXG5cdFx0XHRcdFx0Y3dkOiByZXBvQS5mc1BhdGgsXG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiBbcmVwb0EuZnNQYXRoLCByZXBvQi5mc1BhdGhdLFxuXHRcdFx0XHRcdG1vZGVsOiAnZ3B0LXRlc3QnLFxuXHRcdFx0XHRcdG1vZGVsUHJvdmlkZXI6ICd2c2NvZGUtcHJveHknLFxuXHRcdFx0XHRcdHNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9BLmZzUGF0aCwgcmVwb0IuZnNQYXRoXSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmV4aXQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcmsgZnJvbSBhIHdvcmtzcGFjZS1sZXNzIHNlc3Npb24gb3ducyBhbiBpbmRlcGVuZGVudCBtYW5hZ2VkIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDogbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KSxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVTZXNzaW9uKGFnZW50LCB7IG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSB9KTtcblx0XHRjb25zdCBzb3VyY2VDaGF0ID0gZGVmYXVsdENoYXRPZihzb3VyY2Uuc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc291cmNlRW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KEFnZW50U2Vzc2lvbi5pZChzb3VyY2Uuc2Vzc2lvbikpITtcblx0XHQvLyBBIHdvcmtzcGFjZS1sZXNzIHNlc3Npb24gaXMgbm90IHByZXdhcm1lZCAodGhlcmUgaXMgbm8gZGlyZWN0b3J5IHRvXG5cdFx0Ly8gc3RhcnQgYSB0aHJlYWQgaW4geWV0KSwgc28gaXRzIGZpcnN0IHNlbmQgbWF0ZXJpYWxpemVzIHRoZSB0aHJlYWQgaW5cblx0XHQvLyB0aGUgbWFuYWdlZCB0ZW1wIGZvbGRlciBDb2RleCBjcmVhdGVzIGZvciBpdC5cblx0XHRjb25zdCBzZW5kaW5nID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2Uoc291cmNlQ2hhdCwgJ2hlbGxvJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsICd0dXJuLTEnKTtcblx0XHRjb25zdCBzdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogc3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICdtYW5hZ2VkLXNvdXJjZScsIGN3ZDogc3RhcnQucGFyYW1zLmN3ZCB9IH0gfSk7XG5cdFx0Y29uc3Qgc291cmNlVHVybiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogc291cmNlVHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRhd2FpdCBzZW5kaW5nO1xuXHRcdGNvbnN0IHNvdXJjZURpcmVjdG9yeSA9IHNvdXJjZUVudHJ5Lm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5O1xuXHRcdGFzc2VydC5vayhzb3VyY2VEaXJlY3RvcnkpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLndyaXRlRmlsZShqb2luKHNvdXJjZURpcmVjdG9yeS5mc1BhdGgsICdtYXJrZXIudHh0JyksICdmb3JrIG1lJyk7XG5cblx0XHQvLyBBIGZvcmsgaXMgcHJvdmlzaW9uZWQgdGhyb3VnaCB0aGUgc2FtZSBleGFjdC1jaGF0IHNlYW0gYXMgYSBmcmVzaFxuXHRcdC8vIHNlc3Npb24sIHNvIHRoZSB0ZXN0IG1pbnRzIHRoZSB0YXJnZXQgY2hhdCB0aGUgd2F5IHRoZSBob3N0IGRvZXMuXG5cdFx0Y29uc3QgZm9ya1Nlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKGFnZW50LmlkLCBnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0Y29uc3QgZm9ya0NoYXQgPSBkZWZhdWx0Q2hhdE9mKGZvcmtTZXNzaW9uKTtcblx0XHRjb25zdCBmb3JraW5nID0gY3JlYXRlU2Vzc2lvbihhZ2VudCwge1xuXHRcdFx0c2Vzc2lvbjogZm9ya1Nlc3Npb24sXG5cdFx0XHRmb3JrOiB7IHNvdXJjZTogc291cmNlQ2hhdCwgdHVybklkOiAndHVybi0xJywgdHVybkluZGV4OiAwIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVhZCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goe1xuXHRcdFx0aWQ6IHJlYWQuaWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0dGhyZWFkOiB7XG5cdFx0XHRcdFx0aWQ6ICdtYW5hZ2VkLXNvdXJjZScsXG5cdFx0XHRcdFx0Y3dkOiBzb3VyY2VEaXJlY3RvcnkuZnNQYXRoLFxuXHRcdFx0XHRcdHR1cm5zOiBbeyBpZDogJ3R1cm4tMScgfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGZvcmsgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0Y29uc3QgZm9ya0RpcmVjdG9yeSA9IGZvcmsucGFyYW1zLmN3ZDtcblx0XHRhc3NlcnQub2soZm9ya0RpcmVjdG9yeSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZvcmtEaXJlY3RvcnksIHNvdXJjZURpcmVjdG9yeS5mc1BhdGgpO1xuXHRcdHBlZXIucHVzaCh7XG5cdFx0XHRpZDogZm9yay5pZCxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHR0aHJlYWQ6IHsgaWQ6ICdtYW5hZ2VkLWZvcmsnLCBjd2Q6IGZvcmtEaXJlY3RvcnkgfSxcblx0XHRcdFx0Y3dkOiBmb3JrRGlyZWN0b3J5LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBmb3JrZWQgPSBhd2FpdCBmb3JraW5nO1xuXHRcdGNvbnN0IGZvcmtlZEVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoZm9ya2VkLnNlc3Npb24pKSE7XG5cblx0XHQvLyBUZWFyZG93biBydW5zIHRoZSB3YXkgQWdlbnQgSG9zdCBydW5zIGl0OiBkaXNwb3NlIGVhY2ggc2Vzc2lvbidzIG93blxuXHRcdC8vIGNoYXQuIENvbmZpZ3VyYXRpb24tc2NvcGUgcmVmIHRyYWNraW5nIHJlY2xhaW1zIGEgbWFuYWdlZCB3b3JraW5nXG5cdFx0Ly8gZGlyZWN0b3J5IGF1dG9tYXRpY2FsbHkgb25jZSBhIHNjb3BlJ3MgbGFzdCBjaGF0IGlzIGRpc3Bvc2VkLCBrZXllZFxuXHRcdC8vIGJ5IHRoYXQgc2NvcGUncyBvd24gY29uZmlndXJhdGlvbiByZXNvdXJjZSBcdTIwMTQgc28gZGlzcG9zaW5nIHRoZVxuXHRcdC8vIHNvdXJjZSdzIGNoYXQgaGVyZSBjYW4gbmV2ZXIgcmVhZCBvciBkZWxldGUgdGhlIGZvcmsncyBkaXJlY3RvcnkuXG5cdFx0Y29uc3QgZGlzcG9zaW5nU291cmNlID0gYWdlbnQuY2hhdHMuZGlzcG9zZUNoYXQoc291cmNlQ2hhdCwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNvdXJjZS5zZXNzaW9uLCByZXNvdXJjZTogc291cmNlQ2hhdCB9KTtcblx0XHRjb25zdCBzb3VyY2VVbnN1YnNjcmliZSA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goeyBpZDogc291cmNlVW5zdWJzY3JpYmUuaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0YXdhaXQgZGlzcG9zaW5nU291cmNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmb3JrUmVxdWVzdDogeyBtZXRob2Q6IGZvcmsubWV0aG9kLCBjd2Q6IGZvcmsucGFyYW1zLmN3ZCB9LFxuXHRcdFx0Zm9ya093bnNNYW5hZ2VkRGlyZWN0b3J5OiBmb3JrZWRFbnRyeS5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeT8uZnNQYXRoLFxuXHRcdFx0c291cmNlRGlyZWN0b3J5RXhpc3RzOiBmcy5leGlzdHNTeW5jKHNvdXJjZURpcmVjdG9yeS5mc1BhdGgpLFxuXHRcdFx0Zm9ya0RpcmVjdG9yeUV4aXN0czogZnMuZXhpc3RzU3luYyhmb3JrRGlyZWN0b3J5KSxcblx0XHRcdGNvcGllZE1hcmtlcjogYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUoam9pbihmb3JrRGlyZWN0b3J5LCAnbWFya2VyLnR4dCcpLCAndXRmOCcpLFxuXHRcdH0sIHtcblx0XHRcdGZvcmtSZXF1ZXN0OiB7IG1ldGhvZDogJ3RocmVhZC9mb3JrJywgY3dkOiBmb3JrRGlyZWN0b3J5IH0sXG5cdFx0XHRmb3JrT3duc01hbmFnZWREaXJlY3Rvcnk6IGZvcmtEaXJlY3RvcnksXG5cdFx0XHRzb3VyY2VEaXJlY3RvcnlFeGlzdHM6IGZhbHNlLFxuXHRcdFx0Zm9ya0RpcmVjdG9yeUV4aXN0czogdHJ1ZSxcblx0XHRcdGNvcGllZE1hcmtlcjogJ2ZvcmsgbWUnLFxuXHRcdH0pO1xuXG5cdFx0Ly8gRGlzcG9zaW5nIHRoZSBmb3JrJ3Mgb3duIChvbmx5KSBjaGF0IGRyb3BzIGl0cyBjb25maWd1cmF0aW9uIHNjb3BlJ3Ncblx0XHQvLyByZWYgY291bnQgdG8gemVybywgc28gdGhlIHJlY2xhaW0gcnVucyBpbmxpbmUgXHUyMDE0IG5vIHNlcGFyYXRlXG5cdFx0Ly8gZmluYWxpemUgY2FsbCBpcyBuZWVkZWQuXG5cdFx0Y29uc3QgZGlzcG9zaW5nRm9yayA9IGFnZW50LmNoYXRzLmRpc3Bvc2VDaGF0KGZvcmtDaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogZm9ya2VkLnNlc3Npb24sIHJlc291cmNlOiBmb3JrQ2hhdCB9KTtcblx0XHRjb25zdCBmb3JrVW5zdWJzY3JpYmUgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IGZvcmtVbnN1YnNjcmliZS5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRhd2FpdCBkaXNwb3NpbmdGb3JrO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5leGlzdHNTeW5jKGZvcmtEaXJlY3RvcnkpLCBmYWxzZSk7XG5cdFx0cGVlci5leGl0KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGQgcmVzdW1lIHJlc3RvcmVzIHBlcnNpc3RlZCB3b3Jrc3BhY2Ugcm9vdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGF0YWJhc2UgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGNvbnN0IHJlcG9BID0gVVJJLmZpbGUoJy9yZXBvLWEnKTtcblx0XHRjb25zdCByZXBvQiA9IFVSSS5maWxlKCcvcmVwby1iJyk7XG5cdFx0Y29uc3QgYWdlbnRBID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgbXVsdGlSb290RW5hYmxlZDogdHJ1ZSwgZGF0YWJhc2UgfSk7XG5cdFx0Y29uc3QgcGVlckEgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0YWdlbnRBWydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDogbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXJBLnRyYW5zcG9ydCksXG5cdFx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblx0XHRhZ2VudEFbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudEFbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0bGV0IHBlZXJCOiBJVGVzdFBlZXIgfCB1bmRlZmluZWQ7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oYWdlbnRBLCB7IHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9BLCByZXBvQl0sIG1vZGVsOiB7IGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSB9KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRBWydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKGNyZWF0ZWQuc2Vzc2lvbikpITtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXJBLm91dGJvdW5kKTtcblx0XHRcdHBlZXJBLnB1c2goeyBpZDogc3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICd0aHJlYWQnIH0sIGN3ZDogcmVwb0EuZnNQYXRoLCBydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblx0XHRcdGNvbnN0IGZpcnN0U2VuZCA9IGFnZW50QS5jaGF0cy5zZW5kTWVzc2FnZShVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShjcmVhdGVkLnNlc3Npb24pKSwgJ2hlbGxvJywgW3JlcG9BLCByZXBvQl0sIHVuZGVmaW5lZCwgJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3QgZmlyc3RUdXJuID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXJBLm91dGJvdW5kKTtcblx0XHRcdHBlZXJBLnB1c2goeyBpZDogZmlyc3RUdXJuLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgZmlyc3RTZW5kO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRJbW1lZGlhdGUocmVzb2x2ZSkpO1xuXHRcdFx0Y29uc3QgY2Fub25pY2FsT3ZlcmxheSA9IGF3YWl0IGFnZW50QVsnX21ldGFkYXRhU3RvcmUnXS5yZWFkKEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ3RocmVhZCcpKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRCID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgbXVsdGlSb290RW5hYmxlZDogdHJ1ZSwgZGF0YWJhc2UgfSk7XG5cdFx0XHRwZWVyQiA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRcdGFnZW50QlsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdFx0Y2xpZW50OiBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlckIudHJhbnNwb3J0KSxcblx0XHRcdFx0dXNhZ2VTb3VyY2U6ICdnaXRodWInLFxuXHRcdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0XHR9IGFzIG5ldmVyO1xuXHRcdFx0YWdlbnRCWydfcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0XHRhZ2VudEJbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cblx0XHRcdGNvbnN0IHJlc3RvcmVkQ2hhdCA9IGRlZmF1bHRDaGF0T2YoY3JlYXRlZC5zZXNzaW9uKTtcblx0XHRcdGNvbnN0IG1ldGFkYXRhUHJvbWlzZSA9IGFnZW50Qi5nZXRDaGF0TWV0YWRhdGEocmVzdG9yZWRDaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogY3JlYXRlZC5zZXNzaW9uLCByZXNvdXJjZTogcmVzdG9yZWRDaGF0IH0pO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxQcm9iZSA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyQi5vdXRib3VuZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWxQcm9iZS5wYXJhbXMudGhyZWFkSWQsIEFnZW50U2Vzc2lvbi5pZChjcmVhdGVkLnNlc3Npb24pKTtcblx0XHRcdHBlZXJCLnB1c2goeyBpZDogb3JpZ2luYWxQcm9iZS5pZCwgZXJyb3I6IHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAndGhyZWFkIG5vdCBmb3VuZCcgfSB9KTtcblx0XHRcdGNvbnN0IHJlYWQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlckIub3V0Ym91bmQpO1xuXHRcdFx0cGVlckIucHVzaCh7XG5cdFx0XHRcdGlkOiByZWFkLmlkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHR0aHJlYWQ6IHtcblx0XHRcdFx0XHRcdGlkOiAndGhyZWFkJyxcblx0XHRcdFx0XHRcdGN3ZDogcmVwb0EuZnNQYXRoLFxuXHRcdFx0XHRcdFx0bW9kZWxQcm92aWRlcjogJ3ZzY29kZS1wcm94eScsXG5cdFx0XHRcdFx0XHR0dXJuczogW10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCBtZXRhZGF0YVByb21pc2U7XG5cblx0XHRcdC8vIFRoZSByZXN0b3JlZCBzZXNzaW9uLWJhY2tlZCBjaGF0IGlzIG5ldmVyIHJlYm91bmQgdGhyb3VnaCBhXG5cdFx0XHQvLyBzZXNzaW9uLWFkZHJlc3NlZCBzZWFtOiBBZ2VudCBIb3N0IGFkZHJlc3NlcyBpdCBieSBpdHMgZXhhY3QgY2hhdFxuXHRcdFx0Ly8gVVJJIHBsdXMgdGhlIHRyYW5zaWVudCBvd25pbmctc2Vzc2lvbiBjb250ZXh0LlxuXHRcdFx0Y29uc3QgcmVzdW1lZFNlbmQgPSBhZ2VudEIuY2hhdHMuc2VuZE1lc3NhZ2UocmVzdG9yZWRDaGF0LCAnYWdhaW4nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3R1cm4tMicsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogY3JlYXRlZC5zZXNzaW9uLCByZXNvdXJjZTogcmVzdG9yZWRDaGF0IH0pO1xuXHRcdFx0Y29uc3QgcmVzdW1lID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXJCLm91dGJvdW5kKTtcblx0XHRcdHBlZXJCLnB1c2goe1xuXHRcdFx0XHRpZDogcmVzdW1lLmlkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHR0aHJlYWQ6IHsgaWQ6ICd0aHJlYWQnLCBjd2Q6IHJlcG9BLmZzUGF0aCB9LFxuXHRcdFx0XHRcdGN3ZDogcmVwb0EuZnNQYXRoLFxuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogW3JlcG9BLmZzUGF0aCwgcmVwb0IuZnNQYXRoXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdW1lZFR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlckIub3V0Ym91bmQpO1xuXHRcdFx0cGVlckIucHVzaCh7IGlkOiByZXN1bWVkVHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHJlc3VtZWRTZW5kO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2Fub25pY2FsT3ZlcmxheTogY2Fub25pY2FsT3ZlcmxheS53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZzUGF0aCksXG5cdFx0XHRcdG1ldGFkYXRhOiBtZXRhZGF0YT8ud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS5mc1BhdGgpLFxuXHRcdFx0XHRyZXN1bWU6IHtcblx0XHRcdFx0XHRjd2Q6IHJlc3VtZS5wYXJhbXMuY3dkLFxuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogcmVzdW1lLnBhcmFtcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdFx0c2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHM6IHJlc3VtZS5wYXJhbXMuc2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR1cm5SdW50aW1lV29ya3NwYWNlUm9vdHM6IHJlc3VtZWRUdXJuLnBhcmFtcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdHR1cm5TZWxlY3RlZENhcGFiaWxpdHlSb290czogcmVzdW1lZFR1cm4ucGFyYW1zLnNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjYW5vbmljYWxPdmVybGF5OiBbcmVwb0EuZnNQYXRoLCByZXBvQi5mc1BhdGhdLFxuXHRcdFx0XHRtZXRhZGF0YTogW3JlcG9BLmZzUGF0aCwgcmVwb0IuZnNQYXRoXSxcblx0XHRcdFx0cmVzdW1lOiB7XG5cdFx0XHRcdFx0Y3dkOiByZXBvQS5mc1BhdGgsXG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiBbcmVwb0EuZnNQYXRoLCByZXBvQi5mc1BhdGhdLFxuXHRcdFx0XHRcdHNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR1cm5SdW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHRcdHR1cm5TZWxlY3RlZENhcGFiaWxpdHlSb290czogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXJCPy5leGl0KCk7XG5cdFx0XHRwZWVyQS5leGl0KCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkaXJlY3RseSByZXN0b3JlZCBEZXNrdG9wIHRocmVhZCBoZWFscyBhIHN0YWxlIG92ZXJsYXkgYW5kIHVzZXMgdGhlIGxhdGVzdCByb2xsb3V0IHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRhdGFiYXNlID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRkYXRhYmFzZS5zZXRNZXRhZGF0YSgnY29kZXgudGhyZWFkSWQnLCAncmVwbGFjZW1lbnQtdGhyZWFkJyksXG5cdFx0XHRkYXRhYmFzZS5zZXRNZXRhZGF0YSgnY29kZXgubW9kZWwnLCBPUEVOQUlfVEVTVF9NT0RFTCksXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBkYXRhYmFzZSB9KTtcblx0XHRjb25zdCBiYXNlTW9kZWwgPSBhZ2VudC5tb2RlbHMuZ2V0KClbMF07XG5cdFx0YWdlbnRbJ19tb2RlbHMnXS5zZXQoW1xuXHRcdFx0eyAuLi5iYXNlTW9kZWwsIGlkOiBDT1BJTE9UX1RFU1RfTU9ERUwgfSxcblx0XHRcdHsgLi4uYmFzZU1vZGVsLCBpZDogT1BFTkFJX1RFU1RfTU9ERUwgfSxcblx0XHRdLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50OiBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpLFxuXHRcdFx0dXNhZ2VTb3VyY2U6ICdnaXRodWInLFxuXHRcdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0gYXMgbmV2ZXI7XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAnZGVza3RvcC10aHJlYWQnKTtcblx0XHRjb25zdCBjaGF0ID0gZGVmYXVsdENoYXRPZihzZXNzaW9uKTtcblx0XHRjb25zdCBjb250ZXh0ID0geyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHNlc3Npb24sIHJlc291cmNlOiBjaGF0IH07XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2NvZGV4Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNEaXJlY3RvcnkgPSBVUkkuam9pblBhdGgoYWdlbnRbJ19lbnZpcm9ubWVudFNlcnZpY2UnXS51c2VySG9tZSwgJy5jb2RleCcsICdzZXNzaW9ucycpO1xuXHRcdGNvbnN0IHJvbGxvdXQgPSBVUkkuam9pblBhdGgoc2Vzc2lvbnNEaXJlY3RvcnksICdkZXNrdG9wLXRocmVhZC5qc29ubCcpO1xuXHRcdGF3YWl0IGFnZW50WydfZmlsZVNlcnZpY2UnXS5jcmVhdGVGb2xkZXIoc2Vzc2lvbnNEaXJlY3RvcnkpO1xuXHRcdGF3YWl0IGFnZW50WydfZmlsZVNlcnZpY2UnXS5jcmVhdGVGaWxlKHJvbGxvdXQsIFZTQnVmZmVyLmZyb21TdHJpbmcoW1xuXHRcdFx0J3tcInR5cGVcIjpcInNlc3Npb25fbWV0YVwiLFwicGF5bG9hZFwiOntcIm9yaWdpbmF0b3JcIjpcIkNvZGV4IERlc2t0b3BcIixcIm1vZGVsX3Byb3ZpZGVyXCI6XCJvcGVuYWlcIn19Jyxcblx0XHRcdCd7XCJ0eXBlXCI6XCJldmVudF9tc2dcIixcInBheWxvYWRcIjp7XCJ0eXBlXCI6XCJ0aHJlYWRfc2V0dGluZ3NfYXBwbGllZFwiLFwidGhyZWFkX3NldHRpbmdzXCI6e1wibW9kZWxcIjpcImdwdC10ZXN0XCIsXCJtb2RlbF9wcm92aWRlcl9pZFwiOlwidnNjb2RlLXByb3h5XCJ9fX0nLFxuXHRcdFx0J3tcInR5cGVcIjpcImV2ZW50X21zZ1wiLFwicGF5bG9hZFwiOntcInR5cGVcIjpcInRhc2tfc3RhcnRlZFwiLFwidHVybl9pZFwiOlwiZGVza3RvcC10dXJuXCJ9fScsXG5cdFx0XHQne1widHlwZVwiOlwidHVybl9jb250ZXh0XCIsXCJwYXlsb2FkXCI6e1widHVybl9pZFwiOlwiZGVza3RvcC10dXJuXCIsXCJtb2RlbFwiOlwiZ3B0LXRlc3RcIn19Jyxcblx0XHRdLmpvaW4oJ1xcbicpKSk7XG5cdFx0Y29uc3QgcGVyc2lzdGVkVHVybiA9IHtcblx0XHRcdGlkOiAnZGVza3RvcC10dXJuJyxcblx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdHsgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1c2VyLTEnLCBjbGllbnRJZDogbnVsbCwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAncmVtZW1iZXIgY2FweWJhcmEnLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ2Fzc2lzdGFudC0xJywgdGV4dDogJ0kgd2lsbCByZW1lbWJlciBjYXB5YmFyYS4nLCBwaGFzZTogJ2ZpbmFsX2Fuc3dlcicsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sXG5cdFx0XHRdLFxuXHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9LFxuXHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0c3RhcnRlZEF0OiAxLFxuXHRcdFx0Y29tcGxldGVkQXQ6IDIsXG5cdFx0XHRkdXJhdGlvbk1zOiAxMDAwLFxuXHRcdH07XG5cblx0XHRjb25zdCBtZXRhZGF0YVByb21pc2UgPSBhZ2VudC5nZXRDaGF0TWV0YWRhdGEoY2hhdCwgY29udGV4dCk7XG5cdFx0Y29uc3QgbWV0YWRhdGFSZWFkID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdHBlZXIucHVzaCh7XG5cdFx0XHRpZDogbWV0YWRhdGFSZWFkLmlkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHRocmVhZDoge1xuXHRcdFx0XHRcdGlkOiBtZXRhZGF0YVJlYWQucGFyYW1zLnRocmVhZElkLFxuXHRcdFx0XHRcdGN3ZDogd29ya2luZ0RpcmVjdG9yeS5mc1BhdGgsXG5cdFx0XHRcdFx0bW9kZWxQcm92aWRlcjogJ29wZW5haScsXG5cdFx0XHRcdFx0cGF0aDogcm9sbG91dC5mc1BhdGgsXG5cdFx0XHRcdFx0c291cmNlOiAndnNjb2RlJyxcblx0XHRcdFx0XHR0dXJuczogW3BlcnNpc3RlZFR1cm5dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IG1ldGFkYXRhUHJvbWlzZTtcblx0XHRjb25zdCByZXN0b3JlZCA9IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKTtcblxuXHRcdGNvbnN0IGhpc3RvcnlQcm9taXNlID0gYWdlbnQuY2hhdHMuZ2V0TWVzc2FnZXMoY2hhdCwgY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdW1lID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdHBlZXIucHVzaCh7XG5cdFx0XHRpZDogcmVzdW1lLmlkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHRocmVhZDogeyBpZDogcmVzdW1lLnBhcmFtcy50aHJlYWRJZCwgY3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCB9LFxuXHRcdFx0XHRjd2Q6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBoaXN0b3J5UmVhZCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRwZWVyLnB1c2goe1xuXHRcdFx0aWQ6IGhpc3RvcnlSZWFkLmlkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHRocmVhZDoge1xuXHRcdFx0XHRcdGlkOiBoaXN0b3J5UmVhZC5wYXJhbXMudGhyZWFkSWQsXG5cdFx0XHRcdFx0Y3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCxcblx0XHRcdFx0XHRtb2RlbFByb3ZpZGVyOiAnb3BlbmFpJyxcblx0XHRcdFx0XHRwYXRoOiByb2xsb3V0LmZzUGF0aCxcblx0XHRcdFx0XHRzb3VyY2U6ICd2c2NvZGUnLFxuXHRcdFx0XHRcdHR1cm5zOiBbcGVyc2lzdGVkVHVybl0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGhpc3RvcnkgPSBhd2FpdCBoaXN0b3J5UHJvbWlzZTtcblxuXHRcdGNvbnN0IHNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShjaGF0LCAnaGVsbG8nLCBbd29ya2luZ0RpcmVjdG9yeV0sIHVuZGVmaW5lZCwgJ3R1cm4tMScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjb250ZXh0KTtcblx0XHRjb25zdCB0dXJuID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdHBlZXIucHVzaCh7IGlkOiB0dXJuLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdGF3YWl0IHNlbmQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1ldGFkYXRhUmVhZFRocmVhZElkOiBtZXRhZGF0YVJlYWQucGFyYW1zLnRocmVhZElkLFxuXHRcdFx0bWV0YWRhdGFNb2RlbDogbWV0YWRhdGE/Lm1vZGVsPy5pZCxcblx0XHRcdHJlc3RvcmVkOiB7XG5cdFx0XHRcdHRocmVhZElkOiByZXN0b3JlZD8udGhyZWFkSWQsXG5cdFx0XHRcdG1vZGVsOiByZXN0b3JlZD8ubW9kZWw/LmlkLFxuXHRcdFx0XHRtYXRlcmlhbGl6ZWRNb2RlbFByb3ZpZGVyOiByZXN0b3JlZD8ubWF0ZXJpYWxpemVkTW9kZWxQcm92aWRlcixcblx0XHRcdH0sXG5cdFx0XHRoaXN0b3J5OiBoaXN0b3J5Lm1hcChpdGVtID0+ICh7XG5cdFx0XHRcdGlkOiBpdGVtLmlkLFxuXHRcdFx0XHRtZXNzYWdlOiBpdGVtLm1lc3NhZ2UudGV4dCxcblx0XHRcdFx0bWVzc2FnZU1vZGVsOiBpdGVtLm1lc3NhZ2UubW9kZWw/LmlkLFxuXHRcdFx0XHR1c2FnZU1vZGVsOiBpdGVtLnVzYWdlPy5tb2RlbCxcblx0XHRcdH0pKSxcblx0XHRcdHJlc3VtZTogeyBtZXRob2Q6IHJlc3VtZS5tZXRob2QsIHRocmVhZElkOiByZXN1bWUucGFyYW1zLnRocmVhZElkLCBtb2RlbFByb3ZpZGVyOiByZXN1bWUucGFyYW1zLm1vZGVsUHJvdmlkZXIgfSxcblx0XHRcdGhpc3RvcnlSZWFkVGhyZWFkSWQ6IGhpc3RvcnlSZWFkLnBhcmFtcy50aHJlYWRJZCxcblx0XHRcdHR1cm46IHsgbWV0aG9kOiB0dXJuLm1ldGhvZCwgdGhyZWFkSWQ6IHR1cm4ucGFyYW1zLnRocmVhZElkLCBtb2RlbDogdHVybi5wYXJhbXMubW9kZWwgfSxcblx0XHRcdG92ZXJsYXk6IHtcblx0XHRcdFx0dGhyZWFkSWQ6IGF3YWl0IGRhdGFiYXNlLmdldE1ldGFkYXRhKCdjb2RleC50aHJlYWRJZCcpLFxuXHRcdFx0XHRtb2RlbElkOiBhd2FpdCBkYXRhYmFzZS5nZXRNZXRhZGF0YSgnY29kZXgubW9kZWwnKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0bWV0YWRhdGFSZWFkVGhyZWFkSWQ6ICdkZXNrdG9wLXRocmVhZCcsXG5cdFx0XHRtZXRhZGF0YU1vZGVsOiBDT1BJTE9UX1RFU1RfTU9ERUwsXG5cdFx0XHRyZXN0b3JlZDoge1xuXHRcdFx0XHR0aHJlYWRJZDogJ2Rlc2t0b3AtdGhyZWFkJyxcblx0XHRcdFx0bW9kZWw6IENPUElMT1RfVEVTVF9NT0RFTCxcblx0XHRcdFx0bWF0ZXJpYWxpemVkTW9kZWxQcm92aWRlcjogJ3ZzY29kZS1wcm94eScsXG5cdFx0XHR9LFxuXHRcdFx0aGlzdG9yeTogW3tcblx0XHRcdFx0aWQ6ICdkZXNrdG9wLXR1cm4nLFxuXHRcdFx0XHRtZXNzYWdlOiAncmVtZW1iZXIgY2FweWJhcmEnLFxuXHRcdFx0XHRtZXNzYWdlTW9kZWw6IENPUElMT1RfVEVTVF9NT0RFTCxcblx0XHRcdFx0dXNhZ2VNb2RlbDogQ09QSUxPVF9URVNUX01PREVMLFxuXHRcdFx0fV0sXG5cdFx0XHRyZXN1bWU6IHsgbWV0aG9kOiAndGhyZWFkL3Jlc3VtZScsIHRocmVhZElkOiAnZGVza3RvcC10aHJlYWQnLCBtb2RlbFByb3ZpZGVyOiAndnNjb2RlLXByb3h5JyB9LFxuXHRcdFx0aGlzdG9yeVJlYWRUaHJlYWRJZDogJ2Rlc2t0b3AtdGhyZWFkJyxcblx0XHRcdHR1cm46IHsgbWV0aG9kOiAndHVybi9zdGFydCcsIHRocmVhZElkOiAnZGVza3RvcC10aHJlYWQnLCBtb2RlbDogJ2dwdC10ZXN0JyB9LFxuXHRcdFx0b3ZlcmxheTogeyB0aHJlYWRJZDogJ2Rlc2t0b3AtdGhyZWFkJywgbW9kZWxJZDogQ09QSUxPVF9URVNUX01PREVMIH0sXG5cdFx0fSk7XG5cdFx0cGVlci5leGl0KCk7XG5cdH0pO1xufSk7XG5zdWl0ZSgnQ29kZXhBZ2VudCBiYXNlbGluZSBjaGVja3BvaW50JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY2FwdHVyZXMgdGhlIGJhc2VsaW5lIGNoZWNrcG9pbnQgb24gdGhlIGZyZXNoIGZpcnN0IHNlbmQgYnV0IG5vdCBvbiBzdWJzZXF1ZW50IHNlbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoZWNrcG9pbnRTZXJ2aWNlID0gbmV3IFJlY29yZGluZ0NoZWNrcG9pbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgeyBjaGVja3BvaW50U2VydmljZSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7IGtpbmQ6ICdyZWFkeScsIGNsaWVudCwgdXNhZ2VTb3VyY2U6ICdnaXRodWInLCBjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0gfSBhcyBuZXZlcjtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEhvb2tDdXN0b21pemF0aW9ucyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsRXh0cmFSb290cyddID0gYXN5bmMgKCkgPT4geyB9O1xuXG5cdFx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvL2Jhc2VsaW5lLWZvbGRlcicpO1xuXHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbihhZ2VudCwgeyB3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLCBtb2RlbDogeyBpZDogQ09QSUxPVF9URVNUX01PREVMIH0gfSk7XG5cdFx0Y29uc3QgZW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSkhO1xuXHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cblx0XHQvLyBDb21wbGV0ZSB0aGUgcHJld2FybSBgdGhyZWFkL3N0YXJ0YCBzbyB0aGUgZm9sZGVyIHRocmVhZCBpcyBtYXRlcmlhbGl6ZWRcblx0XHQvLyAod2hpY2ggc2V0cyB0aGUgdG9vbC9tY3AvY3VzdG9taXphdGlvbiBzaWduYXR1cmVzKS5cblx0XHRjb25zdCBwcmV3YXJtU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0dHJ5IHtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBwcmV3YXJtU3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICd0aHJlYWQtYmFzZWxpbmUnIH0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblxuXHRcdFx0Ly8gRnJlc2ggZmlyc3Qgc2VuZDogdGhlIGZvbGRlciBpcyBhbHJlYWR5IG1hdGVyaWFsaXplZCB3aXRoIG1hdGNoaW5nXG5cdFx0XHQvLyBzaWduYXR1cmVzLCBzbyB0aGUgb25seSBvdXRib3VuZCByZXF1ZXN0IGlzIGB0dXJuL3N0YXJ0YC5cblx0XHRcdGNvbnN0IHNlbmQxID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdCwgJ2hlbGxvJywgW2ZvbGRlcl0sIHVuZGVmaW5lZCwgJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3QgdHVyblN0YXJ0MSA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiB0dXJuU3RhcnQxLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgc2VuZDE7XG5cblx0XHRcdC8vIFRoZSBzZWNvbmQgc2VuZCBoYXMgYGZpcnN0VHVyblNlbnQgPT09IHRydWVgLCBzbyB0aGUgZ2F0ZSBwcmV2ZW50c1xuXHRcdFx0Ly8gYSBzZWNvbmQgY2FwdHVyZS5cblx0XHRcdGNvbnN0IHNlbmQyID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdCwgJ2FnYWluJywgW2ZvbGRlcl0sIHVuZGVmaW5lZCwgJ3R1cm4tMicpO1xuXHRcdFx0Y29uc3QgdHVyblN0YXJ0MiA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiB0dXJuU3RhcnQyLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgc2VuZDI7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hlY2twb2ludFNlcnZpY2UuYmFzZWxpbmVDYWxscywgW1xuXHRcdFx0XHR7IHNlc3Npb246IHNlc3Npb24udG9TdHJpbmcoKSwgd29ya2luZ0RpcmVjdG9yaWVzOiBbZm9sZGVyLnRvU3RyaW5nKCldIH0sXG5cdFx0XHRdKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5leGl0KCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ29kZXhBZ2VudCBtYW5hZ2VkIHdvcmtpbmcgZGlyZWN0b3J5IG93bmVyc2hpcCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2EgbGVnYWN5IG92ZXJsYXkgcmVjb3JkaW5nIG9ubHkgdGhlIG93bmVyc2hpcCBmbGFnIGlzIG5ldmVyIHJlY2xhaW1lZCBvbmNlIGN3ZCBpcyBhZG9wdGVkIGJ5IGEgcmVhbCBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ2xlZ2FjeS1zZXNzaW9uJyk7XG5cdFx0Y29uc3QgY2hhdCA9IGRlZmF1bHRDaGF0T2Yoc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgdXNlckZvbGRlciA9IGZzLm1rZHRlbXBTeW5jKGpvaW4ob3MudG1wZGlyKCksICd2c2NvZGUtY29kZXgtdGVzdC11c2VyLScpKTtcblx0XHRjb25zdCBtYXJrZXIgPSBqb2luKHVzZXJGb2xkZXIsICdtYXJrZXIudHh0Jyk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhtYXJrZXIsICdrZWVwLW1lJyk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEFuIG92ZXJsYXkgd3JpdHRlbiBiZWZvcmUgdGhlIGV4cGxpY2l0IGBtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeWBcblx0XHRcdC8vIGZpZWxkIGV4aXN0ZWQ6IG9ubHkgdGhlIGxlZ2FjeSBib29sZWFuIGZsYWcgd2FzIGV2ZXIgcmVjb3JkZWQsXG5cdFx0XHQvLyBhbmQgYGN3ZGAgaGFzIHNpbmNlIGJlZW4gb3ZlcndyaXR0ZW4gXHUyMDE0IGJ5IGFuIGFkb3B0aW9uIGluIHNvbWVcblx0XHRcdC8vIHByaW9yIHByb2Nlc3MgXHUyMDE0IHdpdGggYSByZWFsLCB1bm1hbmFnZWQgdXNlciBmb2xkZXIuXG5cdFx0XHRhd2FpdCBhZ2VudFsnX21ldGFkYXRhU3RvcmUnXS53cml0ZShzZXNzaW9uLCB7XG5cdFx0XHRcdHRocmVhZElkOiAnbGVnYWN5LXRocmVhZCcsXG5cdFx0XHRcdGN3ZDogVVJJLmZpbGUodXNlckZvbGRlciksXG5cdFx0XHRcdG93bnNNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhZ2VudC5tYXRlcmlhbGl6ZUNoYXQoY2hhdCwgc2Vzc2lvbiwgSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uSWQgfSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KHNlc3Npb25JZCk/Lm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCdhIGxlZ2FjeSBmbGFnIHdpdGggbm8gZXhwbGljaXQgcGF0aCBtdXN0IG5vdCByZXN1cnJlY3QgYSBtYW5hZ2VkIGRpcmVjdG9yeScsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBJZGxlLXJlbGVhc2UgdGhlbiBkaXNwb3NlOiBkcm9wcyB0aGUgcnVudGltZSBmcm9tIG1lbW9yeSBhbmRcblx0XHRcdC8vIHVudHJhY2tzIHRoZSBjaGF0J3MgY29uZmlndXJhdGlvbiBzY29wZSwgZHJpdmluZyB0aGUgcmVjbGFpbVxuXHRcdFx0Ly8gcGF0aCBmb3IgYSBzZXNzaW9uIHRoYXQgaXMgbm8gbG9uZ2VyIGxpdmUgXHUyMDE0IHRoZSBleGFjdCBwYXRoIGFcblx0XHRcdC8vIHN0YWxlIGZsYWcgY291bGQgb3RoZXJ3aXNlIGluZmVyIGBjd2RgIGZyb20uIENsZWFyaW5nIHRoZVxuXHRcdFx0Ly8gcmVsZWFzZWQtZGlyZWN0b3J5IG1lbW8gc2ltdWxhdGVzIHRoZSBpbi1tZW1vcnkgbWFwIGJlaW5nXG5cdFx0XHQvLyBlbXB0eSwgYXMgaXQgd291bGQgYmUgYWZ0ZXIgYSBwcm9jZXNzIHJlc3RhcnQuXG5cdFx0XHRhZ2VudFsnX3JlbGVhc2VkTWFuYWdlZFdvcmtpbmdEaXJlY3RvcmllcyddLmNsZWFyKCk7XG5cdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5yZWxlYXNlQ2hhdChjaGF0LCBjaGF0Q29udGV4dChzZXNzaW9uLCBjaGF0KSk7XG5cdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5kaXNwb3NlQ2hhdChjaGF0LCBjaGF0Q29udGV4dChzZXNzaW9uLCBjaGF0KSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5leGlzdHNTeW5jKG1hcmtlciksIHRydWUsICd0aGUgdXNlciBmb2xkZXIgbXVzdCBuZXZlciBiZSBkZWxldGVkJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGZzLnJtU3luYyh1c2VyRm9sZGVyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdhbiBleHBsaWNpdCBtYW5hZ2VkIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHN0aWxsIHJlY2xhaW1lZCBvbmNlIHRoZSBzZXNzaW9uIGlzIG5vIGxvbmdlciBsaXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdleHBsaWNpdC1tYW5hZ2VkLXNlc3Npb24nKTtcblx0XHRjb25zdCBjaGF0ID0gZGVmYXVsdENoYXRPZihzZXNzaW9uKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cblx0XHRjb25zdCBtYW5hZ2VkRm9sZGVyID0gZnMubWtkdGVtcFN5bmMoam9pbihvcy50bXBkaXIoKSwgJ3ZzY29kZS1hZ2VudC1jb2RleC0nKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFnZW50WydfbWV0YWRhdGFTdG9yZSddLndyaXRlKHNlc3Npb24sIHtcblx0XHRcdFx0dGhyZWFkSWQ6ICdtYW5hZ2VkLXRocmVhZCcsXG5cdFx0XHRcdGN3ZDogVVJJLmZpbGUobWFuYWdlZEZvbGRlciksXG5cdFx0XHRcdG93bnNNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTogdHJ1ZSxcblx0XHRcdFx0bWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKG1hbmFnZWRGb2xkZXIpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFnZW50Lm1hdGVyaWFsaXplQ2hhdChjaGF0LCBzZXNzaW9uLCBKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25JZCB9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoc2Vzc2lvbklkKT8ubWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk/LmZzUGF0aCxcblx0XHRcdFx0VVJJLmZpbGUobWFuYWdlZEZvbGRlcikuZnNQYXRoLFxuXHRcdFx0XHQnYW4gZXhwbGljaXQgbWFuYWdlZCBwYXRoIGlzIHRydXN0ZWQgYW5kIHJlc3RvcmVkJyxcblx0XHRcdCk7XG5cblx0XHRcdGFnZW50WydfcmVsZWFzZWRNYW5hZ2VkV29ya2luZ0RpcmVjdG9yaWVzJ10uY2xlYXIoKTtcblx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLnJlbGVhc2VDaGF0KGNoYXQsIGNoYXRDb250ZXh0KHNlc3Npb24sIGNoYXQpKTtcblx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLmRpc3Bvc2VDaGF0KGNoYXQsIGNoYXRDb250ZXh0KHNlc3Npb24sIGNoYXQpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLmV4aXN0c1N5bmMobWFuYWdlZEZvbGRlciksIGZhbHNlLCAndGhlIGV4cGxpY2l0bHkgcmVjb3JkZWQgbWFuYWdlZCBmb2xkZXIgaXMgc3RpbGwgY2xlYW5lZCB1cCcpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmcy5ybVN5bmMobWFuYWdlZEZvbGRlciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYWRvcHRpbmcgYSBob3N0LXN1cHBsaWVkIHdvcmtpbmcgZGlyZWN0b3J5IGFiYW5kb25zIGEgc3RhbGUgbWFuYWdlZCBmb2xkZXIgbGVmdCBiZWhpbmQgYnkgYSBmYWlsZWQgdGhyZWFkIHN0YXJ0LCBhbmQgbmV2ZXIgdG91Y2hlcyB0aGUgbmV3bHkgYWRvcHRlZCBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDogbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KSxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXG5cdFx0Ly8gQSB3b3Jrc3BhY2UtbGVzcyBzZXNzaW9uIGRlZmVycyBpdHMgYmFja2luZyB1bnRpbCB0aGUgZmlyc3Qgc2VuZC5cblx0XHQvLyBgX21hdGVyaWFsaXplYCBtaW50cyB0aGUgbWFuYWdlZCB0ZW1wIGZvbGRlciBhbmQgcmVjb3JkcyBpdCBvbiB0aGVcblx0XHQvLyBzZXNzaW9uICpiZWZvcmUqIGlzc3VpbmcgYHRocmVhZC9zdGFydGA7IGlmIHRoYXQgcmVxdWVzdCBmYWlscywgdGhlXG5cdFx0Ly8gZm9sZGVyIGlzIGxlZnQgYmVoaW5kIHdpdGggbm8gdGhyZWFkIGlkIGV2ZXIgYXNzaWduZWQuIEEgcmV0cnkgdGhhdFxuXHRcdC8vIHN1cHBsaWVzIGEgcmVhbCwgaG9zdC1zZWxlY3RlZCBmb2xkZXIgbXVzdCBhYmFuZG9uIHRoYXQgc3RhbGVcblx0XHQvLyBtYW5hZ2VkIGZvbGRlciB2aWEgaXRzIG93biByZWNvcmRlZCBwYXRoIHJhdGhlciB0aGFuIG9ycGhhbmluZyBpdCxcblx0XHQvLyBhbmQgbXVzdCBuZXZlciB0cmVhdCB0aGUgbmV3bHkgYWRvcHRlZCBmb2xkZXIgYXMgbWFuYWdlZC5cblx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oYWdlbnQsIHsgbW9kZWw6IHsgaWQ6IENPUElMT1RfVEVTVF9NT0RFTCB9IH0pO1xuXHRcdGNvbnN0IGNoYXQgPSBkZWZhdWx0Q2hhdE9mKHNlc3Npb24pO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRsZXQgdXNlckZvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaXJzdFNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShjaGF0LCAnaGVsbG8nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3QgZmFpbGVkU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFpbGVkU3RhcnQubWV0aG9kLCAndGhyZWFkL3N0YXJ0Jyk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogZmFpbGVkU3RhcnQuaWQsIGVycm9yOiB7IGNvZGU6IC0zMjAwMCwgbWVzc2FnZTogJ2Jvb20nIH0gfSk7XG5cdFx0XHRhd2FpdCBmaXJzdFNlbmQ7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChzZXNzaW9uSWQpITtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS50aHJlYWRJZCwgdW5kZWZpbmVkLCAndGhlIGZhaWxlZCBzdGFydCBuZXZlciBhc3NpZ25lZCBhIHRocmVhZCBpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnByZXdhcm1DbGFpbWVkLCB0cnVlLCAndGhlIHJlYWwgc2VuZCBhbHJlYWR5IGNsYWltZWQgcHJld2FybSBiZWZvcmUgbWF0ZXJpYWxpemluZycpO1xuXHRcdFx0Y29uc3Qgc3RhbGVNYW5hZ2VkRm9sZGVyID0gZW50cnkubWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkhO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YWxlTWFuYWdlZEZvbGRlciwgJ21hdGVyaWFsaXplIGNyZWF0ZWQgYSBtYW5hZ2VkIGZvbGRlciBiZWZvcmUgdGhlIGZhaWxpbmcgdGhyZWFkL3N0YXJ0IGNhbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5leGlzdHNTeW5jKHN0YWxlTWFuYWdlZEZvbGRlci5mc1BhdGgpLCB0cnVlKTtcblxuXHRcdFx0dXNlckZvbGRlciA9IGZzLm1rZHRlbXBTeW5jKGpvaW4ob3MudG1wZGlyKCksICd2c2NvZGUtY29kZXgtdGVzdC1hZG9wdGVkLScpKTtcblx0XHRcdGNvbnN0IHNlY29uZFNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShjaGF0LCAnaGVsbG8gYWdhaW4nLCBbVVJJLmZpbGUodXNlckZvbGRlcildLCB1bmRlZmluZWQsICd0dXJuLTInKTtcblx0XHRcdGNvbnN0IHJlc3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdGFydC5tZXRob2QsICd0aHJlYWQvc3RhcnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN0YXJ0LnBhcmFtcy5jd2QsIFVSSS5maWxlKHVzZXJGb2xkZXIpLmZzUGF0aCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogcmVzdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3RocmVhZC1hZG9wdC0yJyB9IH0gfSk7XG5cdFx0XHRjb25zdCB0dXJuID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHR1cm4uaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRhd2FpdCBzZWNvbmRTZW5kO1xuXG5cdFx0XHRjb25zdCByZXN0b3JlZEVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChzZXNzaW9uSWQpITtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0aHJlYWRJZDogcmVzdG9yZWRFbnRyeS50aHJlYWRJZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcmVzdG9yZWRFbnRyeS53b3JraW5nRGlyZWN0b3J5Py5mc1BhdGgsXG5cdFx0XHRcdG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5OiByZXN0b3JlZEVudHJ5Lm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRzdGFsZU1hbmFnZWRGb2xkZXJFeGlzdHM6IGZzLmV4aXN0c1N5bmMoc3RhbGVNYW5hZ2VkRm9sZGVyLmZzUGF0aCksXG5cdFx0XHRcdHVzZXJGb2xkZXJFeGlzdHM6IGZzLmV4aXN0c1N5bmModXNlckZvbGRlciksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRocmVhZElkOiAndGhyZWFkLWFkb3B0LTInLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSh1c2VyRm9sZGVyKS5mc1BhdGgsXG5cdFx0XHRcdG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5OiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0YWxlTWFuYWdlZEZvbGRlckV4aXN0czogZmFsc2UsXG5cdFx0XHRcdHVzZXJGb2xkZXJFeGlzdHM6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5leGl0KCk7XG5cdFx0XHRpZiAodXNlckZvbGRlcikge1xuXHRcdFx0XHRmcy5ybVN5bmModXNlckZvbGRlciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQjtBQUM1QixZQUFZLFFBQVE7QUFDcEIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxhQUFh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QzlDLGFBQU8sWUFBWSxNQUFNLFVBQVUsUUFBVyw2Q0FBNkM7QUFDM0YsYUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sNERBQTREO0FBQzNHLFlBQU0scUJBQXFCLE1BQU07QUFDakMsYUFBTyxHQUFHLG9CQUFvQiwyRUFBMkU7QUFDekcsYUFBTyxZQUFZLEdBQUcsV0FBVyxtQkFBbUIsTUFBTSxHQUFHLElBQUk7QUFFakUsbUJBQWEsR0FBRyxZQUFZLEtBQUssR0FBRyxPQUFPLEdBQUcsNEJBQTRCLENBQUM7QUFDM0UsWUFBTSxhQUFhLE1BQU0sTUFBTSxZQUFZLE1BQU0sZUFBZSxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsR0FBRyxRQUFXLFFBQVE7QUFDM0csWUFBTSxVQUFVLE1BQU0sZ0JBQWdCLEtBQUssUUFBUTtBQUNuRCxhQUFPLFlBQVksUUFBUSxRQUFRLGNBQWM7QUFDakQsYUFBTyxZQUFZLFFBQVEsT0FBTyxLQUFLLElBQUksS0FBSyxVQUFVLEVBQUUsTUFBTTtBQUNsRSxXQUFLLEtBQUssRUFBRSxJQUFJLFFBQVEsSUFBSSxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksaUJBQWlCLEVBQUUsRUFBRSxDQUFDO0FBQzFFLFlBQU0sT0FBTyxNQUFNLGdCQUFnQixLQUFLLFFBQVE7QUFDaEQsV0FBSyxLQUFLLEVBQUUsSUFBSSxLQUFLLElBQUksUUFBUSxDQUFDLEVBQUUsQ0FBQztBQUNyQyxZQUFNO0FBRU4sWUFBTSxnQkFBZ0IsTUFBTSxXQUFXLEVBQUUsSUFBSSxTQUFTO0FBQ3RELGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxjQUFjO0FBQUEsUUFDeEIsa0JBQWtCLGNBQWMsa0JBQWtCO0FBQUEsUUFDbEQseUJBQXlCLGNBQWM7QUFBQSxRQUN2QywwQkFBMEIsR0FBRyxXQUFXLG1CQUFtQixNQUFNO0FBQUEsUUFDakUsa0JBQWtCLEdBQUcsV0FBVyxVQUFVO0FBQUEsTUFDM0MsR0FBRztBQUFBLFFBQ0YsVUFBVTtBQUFBLFFBQ1Ysa0JBQWtCLElBQUksS0FBSyxVQUFVLEVBQUU7QUFBQSxRQUN2Qyx5QkFBeUI7QUFBQSxRQUN6QiwwQkFBMEI7QUFBQSxRQUMxQixrQkFBa0I7QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDRixVQUFFO0FBQ0QsV0FBSyxLQUFLO0FBQ1YsVUFBSSxZQUFZO0FBQ2YsV0FBRyxPQUFPLFlBQVksRUFBRSxXQUFXLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFBQSxNQUN2RDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJ0dXJuIl0KfQo=
