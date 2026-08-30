import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { observableValue } from "../../../../base/common/observable.js";
import { hasKey } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { AgentSession, resolveSubagentChatParent, SubagentChatSignal } from "../../common/agent.js";
import { buildDefaultChangesetCatalog } from "../../common/changesetUri.js";
import { readToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { ChatOriginKind, CustomizationEnablementKind, CustomizationType, McpAuthRequiredReason, McpServerStatus, SessionInputRequestKind } from "../../common/state/protocol/state.js";
import { ActionType, AuthRequiredReason } from "../../common/state/sessionActions.js";
import { buildSubagentChatUri, buildChatUri, buildDefaultChatUri, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputRequestPurpose, ChatInteractivity, CustomizationLoadStatus, MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, ROOT_STATE_URI, SessionInputResponseKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, customizationId } from "../../common/state/sessionState.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostMarkdownPlanRichLinksEnabledConfigKey, AgentHostTelemetryLevelConfigKey, platformSessionSchema, telemetryLevelToAgentHostConfigValue } from "../../common/agentHostSchema.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostTelemetryService } from "../../node/agentHostTelemetryService.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from "../../common/agentHostTelemetry.js";
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from "../../common/agentHostCheckpointService.js";
import { IAgentHostChangesetService } from "../../common/agentHostChangesetService.js";
import { AgentService } from "../../node/agentService.js";
import { AgentSideEffects } from "../../node/agentSideEffects.js";
import { AgentHostLocalTurns } from "../../node/agentHostLocalTurns.js";
import { IAgentHostTerminalManager } from "../../node/agentHostTerminalManager.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostCustomizationEnablementService } from "../../node/agentHostCustomizationEnablementService.js";
import { AgentHostStorageService } from "../../node/agentHostStorageService.js";
import { applyMcpServerEnablement } from "../../node/shared/mcpCustomizationController.js";
import { createNoopGitService, createNullSessionDataService, createSessionDataService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
import { MockAgent } from "./mockAgent.js";
import { TestAgentHostTerminalManager } from "./testAgentHostTerminalManager.js";
class FakeChangesetService {
  constructor() {
    this.toolCallEdits = [];
    this.turnCompletes = [];
    this.truncates = [];
  }
  registerStaticChangesets() {
  }
  restoreStaticChangeset(_session, _kind, _diffs) {
  }
  parsePersistedStaticChangesets() {
    return {};
  }
  applyPersistedStaticChangesets() {
  }
  restorePersistedStaticChangesets() {
    return {};
  }
  persistChangesSummary(session, changesSummary) {
  }
  isStaticChangesetComputeActive() {
    return false;
  }
  getListMetadataKeys(_sessionUri) {
    return void 0;
  }
  computeListEntryChanges(_sessionUri, _metadata) {
    return void 0;
  }
  refreshChangesetCatalog(session) {
  }
  refreshBranchChangeset() {
  }
  refreshSessionChangeset() {
  }
  onWorkingDirectoryAvailable() {
  }
  recomputeSubscribedChangesets() {
  }
  onSessionDisposed() {
  }
  async computeUncommittedChangeset(session) {
    return `${session}/changeset/uncommitted`;
  }
  async computeTurnChangeset(session) {
    return `${session}/changeset/turn/x`;
  }
  async computeCompareTurnsChangeset(session, originalTurnId, modifiedTurnId) {
    return `${session}/changeset/compare/${originalTurnId}/${modifiedTurnId}`;
  }
  onToolCallEditsApplied(session, turnId) {
    this.toolCallEdits.push({ session, turnId });
  }
  onTurnComplete(session, turnId) {
    this.turnCompletes.push({ session, turnId });
  }
  onSessionTruncated(session) {
    this.truncates.push(session);
  }
}
function createNoopCustomizationEnablementService() {
  return {
    _serviceBrand: void 0,
    onDidChange: Event.None,
    initializeSession: async () => {
    },
    getWorkingDirectoryState: () => ({ kind: "workspaceless" }),
    resolve: () => ({ kind: "resolved", enablement: [], enabled: true, workingDirectory: { kind: "workspaceless" } }),
    applyClientGlobalEnablement: () => ({ kind: "resolved", enablement: [], enabled: true, workingDirectory: { kind: "workspaceless" } }),
    replaceEnablement: () => ({ kind: "resolved", enablement: [], enabled: true, workingDirectory: { kind: "workspaceless" } }),
    setEnablement: () => ({ kind: "resolved", enablement: [], enabled: true, workingDirectory: { kind: "workspaceless" } }),
    whenIdle: async () => {
    }
  };
}
let customizationEnablementService = createNoopCustomizationEnablementService();
function createTestSideEffects(disposables, stateManager, options, _gitService, telemetryService = NullTelemetryService, changesets = new FakeChangesetService(), terminalManager = disposables.add(new TestAgentHostTerminalManager()), checkpointService = NULL_CHECKPOINT_SERVICE) {
  const logService = new NullLogService();
  const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
  const instantiationService = disposables.add(new InstantiationService(
    new ServiceCollection(
      [ILogService, logService],
      [IAgentConfigurationService, configService],
      [IAgentHostChangesetService, changesets],
      [IAgentHostCheckpointService, checkpointService],
      [ITelemetryService, telemetryService],
      [IAgentHostTerminalManager, terminalManager],
      [ISessionDataService, options.sessionDataService]
    ),
    /*strict*/
    true
  ));
  const resolvedOptions = {
    ...options,
    localTurns: options.localTurns ?? new AgentHostLocalTurns(options.sessionDataService, logService)
  };
  return disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, customizationEnablementService, resolvedOptions));
}
async function createAgentSession(agent) {
  const session = AgentSession.uri(agent.id, generateUuid());
  const defaultChat = URI.parse(buildDefaultChatUri(session));
  await agent.chats.createChat(defaultChat, session);
  return session;
}
class TestTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.USAGE;
    this.sessionId = "test-session";
    this.machineId = "test-machine";
    this.sqmId = "test-sqm";
    this.devDeviceId = "test-dev-device";
    this.firstSessionDate = "test-first-session-date";
    this.sendErrorTelemetry = false;
    this.events = [];
  }
  publicLog() {
  }
  publicLog2(eventName, data) {
    this.events.push({ eventName, data });
  }
  publicLogError() {
  }
  publicLogError2() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite("AgentSideEffects", () => {
  const disposables = new DisposableStore();
  let fileService;
  let stateManager;
  let agent;
  let sideEffects;
  let agentList;
  let telemetryService;
  const sessionUri = AgentSession.uri("mock", "session-1");
  const defaultChatUri = buildDefaultChatUri(sessionUri);
  function setupSession(workingDirectory) {
    stateManager.createSession({
      resource: sessionUri.toString(),
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///test-project", displayName: "Test Project" },
      workingDirectories: workingDirectory ? [workingDirectory] : void 0
    });
    stateManager.setSessionChangesets(sessionUri.toString(), buildDefaultChangesetCatalog(sessionUri.toString()));
    stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
  }
  function startTurn(turnId, channel = defaultChatUri) {
    stateManager.dispatchClientAction(
      channel,
      { type: ActionType.ChatTurnStarted, turnId, startedAt: "2025-01-01T00:00:00.000Z", message: { text: "hello", origin: { kind: MessageKind.User } } },
      { clientId: "test", clientSeq: 1 }
    );
  }
  function waitForState(manager, match) {
    return new Promise((resolve, reject) => {
      const initial = match();
      if (initial !== void 0) {
        resolve(initial);
        return;
      }
      const store = new DisposableStore();
      const timer = setTimeout(() => {
        store.dispose();
        reject(new Error("waitForState: condition was not met"));
      }, 5e3);
      store.add(toDisposable(() => clearTimeout(timer)));
      store.add(manager.onDidEmitEnvelope(() => {
        const value = match();
        if (value !== void 0) {
          store.dispose();
          resolve(value);
        }
      }));
    });
  }
  async function waitForSendMessageCalls(count) {
    if (agent.sendMessageCalls.length >= count) {
      return;
    }
    await Event.toPromise(Event.filter(agent.onDidSendMessage, () => agent.sendMessageCalls.length >= count));
  }
  setup(async () => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const memFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));
    const testDir = URI.from({ scheme: Schemas.inMemory, path: "/testDir" });
    await fileService.createFolder(testDir);
    await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: "/testDir/file.txt" }), VSBuffer.fromString("hello"));
    agent = new MockAgent();
    disposables.add(toDisposable(() => agent.dispose()));
    stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    agentList = observableValue("agents", [agent]);
    telemetryService = new TestTelemetryService();
    customizationEnablementService = createNoopCustomizationEnablementService();
    sideEffects = createTestSideEffects(disposables, stateManager, {
      getAgent: () => agent,
      agents: agentList,
      sessionDataService: createNullSessionDataService(),
      hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
      onTurnComplete: () => {
      }
    }, void 0, disposables.add(new AgentHostTelemetryService(telemetryService)));
    disposables.add(agent.onDidChatProgress((signal) => {
      const spawn = SubagentChatSignal.toSpawnEvent(signal);
      if (spawn) {
        stateManager.addChat(spawn.session.toString(), spawn.chat.toString(), {
          title: spawn.title,
          origin: spawn.parent ? { kind: ChatOriginKind.Tool, chat: spawn.parent.chat.toString(), toolCallId: spawn.parent.toolCallId } : void 0
        });
      }
    }));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("records customization toggles in the enablement service", () => {
    const calls = [];
    customizationEnablementService.replaceEnablement = (session, target, enablement) => {
      calls.push({ session, target: target.owningPluginSource ? `${target.owningPluginSource}#mcp=${target.name}` : target.source.toString(), enablement });
      return { kind: "resolved", enablement: [], enabled: true, workingDirectory: { kind: "workspaceless" } };
    };
    setupSession();
    const plugin = {
      type: CustomizationType.Plugin,
      id: "plugin",
      uri: "file:///plugin",
      name: "Plugin",
      children: [{ type: CustomizationType.McpServer, id: "server", uri: "file:///plugin/.mcp.json", name: "server", state: { kind: McpServerStatus.Starting } }]
    };
    stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [plugin] });
    stateManager.dispatchServerAction(sessionUri.toString(), {
      type: ActionType.SessionCustomizationToggled,
      id: "server",
      enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }]
    });
    assert.deepStrictEqual(calls, [{
      session: sessionUri.toString(),
      target: "file:///plugin#mcp=server",
      enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }]
    }]);
  });
  suite("customization enablement refresh", () => {
    const plugin = {
      type: CustomizationType.Plugin,
      id: "plugin",
      uri: "file:///plugin",
      name: "Plugin"
    };
    const target = {
      id: plugin.id,
      type: plugin.type,
      name: plugin.name,
      source: URI.parse(plugin.uri)
    };
    function setupAdditionalSession(session, workingDirectory) {
      stateManager.createSession({
        resource: session.toString(),
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: workingDirectory, displayName: "Test Project" },
        workingDirectories: [workingDirectory]
      });
      stateManager.setSessionChangesets(session.toString(), buildDefaultChangesetCatalog(session.toString()));
      stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });
    }
    async function createRefreshHarness(sessions, sessionDataService = createSessionDataService(), initialize = true) {
      const enablementService = disposables.add(new AgentHostCustomizationEnablementService(
        disposables.add(new AgentHostStorageService(void 0, new NullLogService())),
        sessionDataService,
        stateManager,
        new NullLogService()
      ));
      customizationEnablementService = enablementService;
      createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      });
      if (initialize) {
        await Promise.all(sessions.map((session) => enablementService.initializeSession(session.toString())));
      }
      agent.getSessionCustomizations = async (session) => {
        const resolution = enablementService.resolve(session.toString(), target);
        return [{
          ...plugin,
          ...resolution.kind === "resolved" && resolution.enablement.length > 0 ? { enablement: [...resolution.enablement] } : {}
        }];
      };
      return enablementService;
    }
    async function publishInitialCustomizations(sessions) {
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireCustomizationsChange();
      await waitForState(stateManager, () => sessions.every((session) => stateManager.getSessionState(session.toString())?.customizations !== void 0) ? true : void 0);
    }
    function customizationEnvelopes(envelopes) {
      return envelopes.filter((envelope) => envelope.action.type === ActionType.SessionCustomizationsChanged);
    }
    test("republishes customizations after a decision write and dedupes a redundant write", async () => {
      const otherSession = AgentSession.uri("mock", "session-2");
      setupSession("file:///workspace");
      setupAdditionalSession(otherSession, "file:///workspace");
      const enablementService = await createRefreshHarness([sessionUri, otherSession]);
      await publishInitialCustomizations([sessionUri, otherSession]);
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((envelope) => envelopes.push(envelope)));
      enablementService.setEnablement(sessionUri.toString(), target, CustomizationEnablementKind.Session, false);
      await waitForState(stateManager, () => customizationEnvelopes(envelopes).length === 1 ? true : void 0);
      enablementService.setEnablement(sessionUri.toString(), target, CustomizationEnablementKind.Session, false);
      await timeout(10);
      assert.deepStrictEqual(customizationEnvelopes(envelopes).map((envelope) => ({
        session: envelope.channel,
        customizations: envelope.action.type === ActionType.SessionCustomizationsChanged ? envelope.action.customizations : void 0
      })), [{
        session: sessionUri.toString(),
        customizations: [{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }] }]
      }]);
    });
    test("republishes every open session for a global decision once", async () => {
      const otherSession = AgentSession.uri("mock", "session-2");
      setupSession("file:///workspace-a");
      setupAdditionalSession(otherSession, "file:///workspace-b");
      const enablementService = await createRefreshHarness([sessionUri, otherSession]);
      await publishInitialCustomizations([sessionUri, otherSession]);
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((envelope) => envelopes.push(envelope)));
      enablementService.setEnablement(sessionUri.toString(), target, CustomizationEnablementKind.Global, false);
      await waitForState(stateManager, () => customizationEnvelopes(envelopes).length === 2 ? true : void 0);
      assert.deepStrictEqual(customizationEnvelopes(envelopes).map((envelope) => envelope.channel).sort(), [sessionUri.toString(), otherSession.toString()].sort());
    });
    test("republishes only sessions sharing a workspace decision working directory", async () => {
      const sameWorkspaceSession = AgentSession.uri("mock", "session-2");
      const otherWorkspaceSession = AgentSession.uri("mock", "session-3");
      setupSession("file:///workspace");
      setupAdditionalSession(sameWorkspaceSession, "file:///workspace");
      setupAdditionalSession(otherWorkspaceSession, "file:///other-workspace");
      const enablementService = await createRefreshHarness([sessionUri, sameWorkspaceSession, otherWorkspaceSession]);
      await publishInitialCustomizations([sessionUri, sameWorkspaceSession, otherWorkspaceSession]);
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((envelope) => envelopes.push(envelope)));
      enablementService.setEnablement(sessionUri.toString(), target, CustomizationEnablementKind.Workspace, false);
      await waitForState(stateManager, () => customizationEnvelopes(envelopes).length === 2 ? true : void 0);
      assert.deepStrictEqual(customizationEnvelopes(envelopes).map((envelope) => envelope.channel).sort(), [sessionUri.toString(), sameWorkspaceSession.toString()].sort());
    });
    test("republishes when session enablement finishes loading", async () => {
      setupSession("file:///workspace");
      const database = new TestSessionDatabase();
      let resolveMetadata;
      database.getMetadata = async () => new Promise((resolve) => {
        resolveMetadata = resolve;
      });
      const enablementService = await createRefreshHarness([sessionUri], createSessionDataService(database), false);
      await publishInitialCustomizations([sessionUri]);
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((envelope) => envelopes.push(envelope)));
      const load = enablementService.initializeSession(sessionUri.toString());
      resolveMetadata('{"plugin":false}');
      await load;
      await waitForState(stateManager, () => customizationEnvelopes(envelopes).length === 1 ? true : void 0);
      assert.deepStrictEqual(customizationEnvelopes(envelopes).map((envelope) => ({
        session: envelope.channel,
        customizations: envelope.action.type === ActionType.SessionCustomizationsChanged ? envelope.action.customizations : void 0
      })), [{
        session: sessionUri.toString(),
        customizations: [{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }] }]
      }]);
    });
    test("republishes a settled MCP decision that an earlier pending publication omitted", async () => {
      setupSession("file:///workspace");
      const database = new TestSessionDatabase();
      let resolveMetadata;
      database.getMetadata = async () => new Promise((resolve) => {
        resolveMetadata = resolve;
      });
      const enablementService = await createRefreshHarness([sessionUri], createSessionDataService(database), false);
      const server = {
        type: CustomizationType.McpServer,
        id: "azure",
        uri: "file:///plugin/mcp.json",
        name: "azure",
        state: { kind: McpServerStatus.Stopped }
      };
      const pluginWithServer = { ...plugin, children: [server] };
      const serverTarget = {
        id: server.id,
        type: server.type,
        name: server.name,
        source: URI.parse(server.uri),
        owningPluginSource: URI.parse(plugin.uri)
      };
      enablementService.setEnablement(sessionUri.toString(), serverTarget, CustomizationEnablementKind.Global, false);
      agent.getSessionCustomizations = async (session) => {
        const resolution = enablementService.resolve(session.toString(), serverTarget);
        const customizations = [{
          ...pluginWithServer,
          children: [{
            ...server,
            ...resolution.kind === "resolved" && resolution.enablement.length > 0 ? { enablement: [...resolution.enablement] } : {}
          }]
        }];
        return applyMcpServerEnablement(customizations, stateManager.getSessionState(session.toString())?.customizations ?? []);
      };
      await publishInitialCustomizations([sessionUri]);
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((envelope) => envelopes.push(envelope)));
      const load = enablementService.initializeSession(sessionUri.toString());
      resolveMetadata(void 0);
      await load;
      await waitForState(stateManager, () => customizationEnvelopes(envelopes).length === 1 ? true : void 0);
      assert.deepStrictEqual(customizationEnvelopes(envelopes).map((envelope) => ({
        session: envelope.channel,
        customizations: envelope.action.type === ActionType.SessionCustomizationsChanged ? envelope.action.customizations : void 0
      })), [{
        session: sessionUri.toString(),
        customizations: [{
          ...plugin,
          children: [{
            ...server,
            enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
          }]
        }]
      }]);
    });
    test("republishes when a pending working directory becomes known", async () => {
      setupSession();
      const enablementService = await createRefreshHarness([sessionUri]);
      await publishInitialCustomizations([sessionUri]);
      enablementService.setEnablement(sessionUri.toString(), target, CustomizationEnablementKind.Global, false);
      await timeout(10);
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((envelope) => envelopes.push(envelope)));
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionWorkingDirectorySet, directory: "file:///workspace" });
      await waitForState(stateManager, () => customizationEnvelopes(envelopes).length === 1 ? true : void 0);
      assert.deepStrictEqual(customizationEnvelopes(envelopes).map((envelope) => ({
        session: envelope.channel,
        customizations: envelope.action.type === ActionType.SessionCustomizationsChanged ? envelope.action.customizations : void 0
      })), [{
        session: sessionUri.toString(),
        customizations: [{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }]
      }]);
    });
    test("retries an enablement refresh superseded by a direct customization update", async () => {
      setupSession("file:///workspace");
      const enablementService = await createRefreshHarness([sessionUri]);
      await publishInitialCustomizations([sessionUri]);
      let signalFetchStarted;
      const fetchStarted = new Promise((resolve) => {
        signalFetchStarted = resolve;
      });
      let releaseFetch;
      let blockFirstFetch = true;
      agent.getSessionCustomizations = async (session) => {
        const resolution = enablementService.resolve(session.toString(), target);
        if (blockFirstFetch) {
          blockFirstFetch = false;
          signalFetchStarted();
          await new Promise((resolve) => {
            releaseFetch = resolve;
          });
        }
        return [{
          ...plugin,
          ...resolution.kind === "resolved" && resolution.enablement.length > 0 ? { enablement: [...resolution.enablement] } : {}
        }];
      };
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((envelope) => envelopes.push(envelope)));
      enablementService.setEnablement(sessionUri.toString(), target, CustomizationEnablementKind.Global, false);
      await fetchStarted;
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [plugin] });
      releaseFetch();
      await waitForState(stateManager, () => customizationEnvelopes(envelopes).some((envelope) => {
        const customization = envelope.action.type === ActionType.SessionCustomizationsChanged ? envelope.action.customizations[0] : void 0;
        return customization?.type === CustomizationType.Plugin && customization.enablement?.some((entry) => entry.kind === CustomizationEnablementKind.Global && entry.enabled === false);
      }) ? true : void 0);
      assert.deepStrictEqual(customizationEnvelopes(envelopes).map((envelope) => ({
        session: envelope.channel,
        customizations: envelope.action.type === ActionType.SessionCustomizationsChanged ? envelope.action.customizations : void 0
      })), [
        { session: sessionUri.toString(), customizations: [plugin] },
        { session: sessionUri.toString(), customizations: [{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }] }
      ]);
    });
  });
  suite("handleAction \u2014 session/turnStarted", () => {
    test("calls sendMessage on the agent", async () => {
      setupSession();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User } }
      };
      sideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), prompt: "hello world", attachments: void 0, chat: URI.parse(defaultChatUri) }]);
      const sendContext = agent.chatContexts.find((call) => call.boundary === "sendMessage")?.context;
      assert.strictEqual(!URI.isUri(sendContext) ? sendContext?.hostInstructions : void 0, void 0);
    });
    test("stamps the exhaustive host chat context on the send boundary", async () => {
      setupSession();
      const hostCustomization = {
        type: CustomizationType.Plugin,
        id: customizationId("file:///send-plugin"),
        uri: "file:///send-plugin",
        name: "Send Plugin",
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
        load: { kind: CustomizationLoadStatus.Loaded }
      };
      stateManager.setSessionCustomizations(sessionUri.toString(), [hostCustomization]);
      const peerChatUri = buildChatUri(sessionUri, "peer-send");
      stateManager.addChat(sessionUri.toString(), peerChatUri, {
        origin: { kind: ChatOriginKind.Fork, chat: defaultChatUri, turnId: "turn-0" }
      });
      sideEffects.handleAction(peerChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User } }
      });
      await waitForSendMessageCalls(1);
      const recorded = agent.chatContexts.filter((entry) => entry.boundary === "sendMessage");
      assert.deepStrictEqual(recorded.map((entry) => {
        const context = entry.context;
        return {
          chat: entry.chat.toString(),
          configurationResource: context.configurationResource.toString(),
          resource: context.resource.toString(),
          origin: context.origin,
          customizations: context.customizations?.map((c) => c.id)
        };
      }), [{
        chat: peerChatUri,
        configurationResource: sessionUri.toString(),
        resource: peerChatUri,
        origin: { kind: ChatOriginKind.Fork, chat: defaultChatUri, turnId: "turn-0" },
        customizations: [hostCustomization.id]
      }]);
    });
    test("adds rich Markdown plan guidance with the exact current chat link when enabled", async () => {
      setupSession();
      stateManager.dispatchServerAction(ROOT_STATE_URI, {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostMarkdownPlanRichLinksEnabledConfigKey]: true }
      });
      const peerChatUri = buildChatUri(sessionUri, "peer-plan");
      stateManager.addChat(sessionUri.toString(), peerChatUri, { title: "Plan chat" });
      sideEffects.handleAction(peerChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "Create a plan", origin: { kind: MessageKind.User } }
      });
      await waitForSendMessageCalls(1);
      const sendContext = agent.chatContexts.find((call) => call.boundary === "sendMessage")?.context;
      assert.deepStrictEqual(!URI.isUri(sendContext) ? sendContext?.hostInstructions : void 0, [[
        "<rich_plan_markdown>",
        "When creating or editing a Markdown plan document, use these formats when the exact target is known:",
        "- Use canonical HTTPS links for GitHub issues and pull requests.",
        "- Use `commit://<sha>` for commits in the current Git repository.",
        "- Preserve exact `agent-host-session://...` links returned by session and chat tools when referring to sessions, chats, or subagents. Do not construct these links yourself.",
        "- Link to the current chat as [Current chat](agent-host-session://mock/session-1?chat=peer-plan).",
        "- Use `- [ ] :running: Description` for a task that is actively running, `- [ ]` for a pending task, and `- [x]` for a completed task.",
        "- Keep link labels meaningful so the document remains readable without rich rendering.",
        "</rich_plan_markdown>"
      ].join("\n")]);
      assert.strictEqual(agent.sendMessageCalls[0].prompt, "Create a plan");
    });
    test("passes the dispatching client id and type to sendMessage", async () => {
      setupSession();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User } }
      };
      sideEffects.handleAction(defaultChatUri, action, "client-B", AgentHostClientType.EditorWindow);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{
        session: URI.parse(sessionUri.toString()),
        prompt: "hello world",
        attachments: void 0,
        chat: URI.parse(defaultChatUri),
        senderClientId: "client-B",
        clientType: "editor_window"
      }]);
    });
    test("logs telemetry when sending a direct user message", () => {
      setupSession();
      const activeClientAction = {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "test-client",
          tools: [{ name: "testTool", inputSchema: { type: "object" } }],
          customizations: [{ type: CustomizationType.Plugin, id: customizationId("file:///customizations/SKILL.md"), uri: "file:///customizations/SKILL.md", name: "Test Skill" }]
        }
      };
      stateManager.dispatchClientAction(sessionUri.toString(), activeClientAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(sessionUri.toString(), activeClientAction);
      const fileUri = URI.file("/workspace/direct.ts");
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "direct.ts", displayKind: "document" }] }
      }, "client-agents", {
        clientType: AgentHostClientType.AgentsWindow,
        connectionKind: AgentHostClientConnectionKind.DevTunnel,
        transportKind: AgentHostTransportKind.WebSocket,
        hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess
      });
      assert.deepStrictEqual(telemetryService.events, [{
        eventName: "agentHost.userMessageSent",
        data: {
          provider: "mock",
          hostLaunchKind: "vscode_main_process",
          initiatorClientId: "client-agents",
          initiatorClientType: "agents_window",
          initiatorConnectionKind: "dev_tunnel",
          initiatorTransportKind: "websocket",
          agentSessionId: "session-1",
          source: "direct",
          isSubagentSession: false,
          turnCount: 0,
          activeClientId: "test-client",
          activeClientToolCount: 1,
          activeClientCustomizationCount: 1,
          attachmentCount: 1
        }
      }]);
    });
    test("parses protocol attachment URI strings before passing them to the agent", async () => {
      setupSession();
      const fileUri = URI.file("/workspace/test.ts");
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "test.ts", displayKind: "document" }] }
      };
      sideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{
        session: URI.parse(sessionUri.toString()),
        prompt: "hello world",
        attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "test.ts", displayKind: "document" }],
        chat: URI.parse(defaultChatUri)
      }]);
    });
    test("passes protocol selection attachment range straight through to the agent", async () => {
      setupSession();
      const fileUri = URI.file("/workspace/selection.ts");
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "hello world",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Resource,
            uri: fileUri.toString(),
            label: "selection.ts",
            displayKind: "selection",
            selection: {
              range: {
                start: { line: 2, character: 3 },
                end: { line: 4, character: 5 }
              }
            }
          }]
        }
      };
      sideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{
        session: URI.parse(sessionUri.toString()),
        prompt: "hello world",
        attachments: [{
          type: MessageAttachmentKind.Resource,
          uri: fileUri.toString(),
          label: "selection.ts",
          displayKind: "selection",
          selection: {
            range: {
              start: { line: 2, character: 3 },
              end: { line: 4, character: 5 }
            }
          }
        }],
        chat: URI.parse(defaultChatUri)
      }]);
    });
    test("resolves chat attachments that reference another session", async () => {
      setupSession();
      const otherSessionUri = AgentSession.uri("mock", "session-2");
      stateManager.createSession({
        resource: otherSessionUri.toString(),
        provider: "mock",
        title: "Other",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      stateManager.dispatchServerAction(otherSessionUri.toString(), { type: ActionType.SessionReady });
      stateManager.seedDefaultChatTurns(otherSessionUri.toString(), [{
        id: "other-turn",
        state: TurnState.Complete,
        message: { text: "Cross session memory", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "response", content: "Recalled across sessions" }],
        usage: void 0
      }]);
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "read another session",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: otherSessionUri.toString(),
            endTurn: "other-turn",
            label: "Other session"
          }]
        }
      });
      await waitForSendMessageCalls(1);
      const attachment = agent.sendMessageCalls[0].attachments?.[0];
      assert.deepStrictEqual({
        type: attachment?.type,
        hasUser: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("User: Cross session memory"),
        hasAssistant: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("Assistant: Recalled across sessions")
      }, {
        type: MessageAttachmentKind.Simple,
        hasUser: true,
        hasAssistant: true
      });
    });
    test("degrades to a no-excerpt pointer when the referenced chat is unresolvable", async () => {
      setupSession();
      const missingSessionUri = AgentSession.uri("mock", "missing");
      const resolvingSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        // Mirrors agentService._resolveChatAttachmentTurns throwing
        // ProtocolError(AHP_SESSION_NOT_FOUND) for a cross-session
        // reference this host cannot restore.
        resolveChatAttachmentTurns: async () => {
          throw new Error("AHP_SESSION_NOT_FOUND");
        },
        onTurnComplete: () => {
        }
      });
      resolvingSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "read a stale reference",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: missingSessionUri.toString(),
            endTurn: "gone-turn",
            label: "Stale chat"
          }]
        }
      });
      await waitForSendMessageCalls(1);
      const attachment = agent.sendMessageCalls[0].attachments?.[0];
      assert.deepStrictEqual({
        type: attachment?.type,
        label: attachment?.label,
        noExcerpt: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("has no transcript content up to the selected turn")
      }, {
        type: MessageAttachmentKind.Simple,
        label: "Stale chat",
        noExcerpt: true
      });
    });
    test("awaits hydrated turns when resolving a chat attachment", async () => {
      setupSession();
      const sourceTurn = {
        id: "source-turn",
        state: TurnState.Complete,
        message: { text: "Remember X", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "response", content: "Remembered" }],
        usage: void 0
      };
      const resolvingSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        resolveChatAttachmentTurns: async () => [sourceTurn],
        onTurnComplete: () => {
        }
      });
      resolvingSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "What was remembered?",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: sessionUri.toString(),
            endTurn: sourceTurn.id,
            label: "Earlier chat"
          }]
        }
      });
      await waitForSendMessageCalls(1);
      const attachment = agent.sendMessageCalls[0].attachments?.[0];
      assert.deepStrictEqual({
        type: attachment?.type,
        hasUser: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("User: Remember X"),
        hasAssistant: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("Assistant: Remembered")
      }, {
        type: MessageAttachmentKind.Simple,
        hasUser: true,
        hasAssistant: true
      });
    });
    test("pins the latest completed turn when a chat attachment omits endTurn", async () => {
      setupSession();
      const olderTurn = {
        id: "older-turn",
        state: TurnState.Complete,
        message: { text: "Remember X", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "r1", content: "Remembered X" }],
        usage: void 0
      };
      const latestTurn = {
        id: "latest-turn",
        state: TurnState.Complete,
        message: { text: "Remember Z", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "r2", content: "Remembered Z" }],
        usage: void 0
      };
      const resolvingSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        resolveChatAttachmentTurns: async () => [olderTurn, latestTurn],
        onTurnComplete: () => {
        }
      });
      resolvingSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "What was remembered?",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: sessionUri.toString(),
            label: "Earlier chat"
          }]
        }
      });
      await waitForSendMessageCalls(1);
      const attachment = agent.sendMessageCalls[0].attachments?.[0];
      assert.deepStrictEqual({
        type: attachment?.type,
        hasOlder: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("Assistant: Remembered X"),
        hasLatest: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("Assistant: Remembered Z")
      }, {
        type: MessageAttachmentKind.Simple,
        hasOlder: true,
        hasLatest: true
      });
    });
    test("rejects chat attachments whose endTurn is missing from the retained transcript", async () => {
      setupSession();
      stateManager.seedDefaultChatTurns(sessionUri.toString(), [{
        id: "source-turn",
        state: TurnState.Complete,
        message: { text: "Remember X", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "response", content: "Remembered" }],
        usage: void 0
      }]);
      const error = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (envelope2) => envelope2.action.type === ActionType.ChatError && envelope2.channel === defaultChatUri));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "What was remembered?",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: sessionUri.toString(),
            endTurn: "missing-turn",
            label: "Earlier chat"
          }]
        }
      });
      const envelope = await error;
      assert.deepStrictEqual({
        sendMessageCalls: agent.sendMessageCalls.length,
        errorType: envelope.action.type === ActionType.ChatError ? envelope.action.error.errorType : void 0
      }, {
        sendMessageCalls: 0,
        errorType: "sendFailed"
      });
    });
    test("rejects chat attachments whose endTurn is still active", async () => {
      setupSession();
      const peerChatUri = buildChatUri(sessionUri.toString(), "peer-1");
      stateManager.addChat(sessionUri.toString(), peerChatUri, { title: "Peer" });
      stateManager.dispatchClientAction(peerChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "active-turn",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "Remember X", origin: { kind: MessageKind.User } }
      }, { clientId: "test", clientSeq: 1 });
      const error = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (envelope2) => envelope2.action.type === ActionType.ChatError && envelope2.channel === defaultChatUri));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "What was remembered?",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: peerChatUri,
            endTurn: "active-turn",
            label: "Earlier chat"
          }]
        }
      });
      const envelope = await error;
      assert.deepStrictEqual({
        sendMessageCalls: agent.sendMessageCalls.length,
        errorType: envelope.action.type === ActionType.ChatError ? envelope.action.error.errorType : void 0
      }, {
        sendMessageCalls: 0,
        errorType: "sendFailed"
      });
    });
    test("dispatches session/error when no agent is found", async () => {
      setupSession();
      const emptyAgents = observableValue("agents", []);
      const noAgentSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => void 0,
        agents: emptyAgents,
        sessionDataService: {},
        onTurnComplete: () => {
        }
      });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      noAgentSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      const errorAction = envelopes.find((e) => e.action.type === ActionType.ChatError);
      assert.ok(errorAction, "should dispatch session/error");
    });
    test("rejects a turn on an archived session without calling the agent", () => {
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      const errorAction = envelopes.find((e) => e.action.type === ActionType.ChatError);
      assert.ok(errorAction, "should dispatch a chat error for an archived session");
      assert.deepStrictEqual(agent.sendMessageCalls, []);
    });
    test("rejects a turn on a read-only chat without calling the agent", () => {
      setupSession();
      const readOnlyChat = buildChatUri(sessionUri, "peer-ro");
      stateManager.addChat(sessionUri.toString(), readOnlyChat, { interactivity: ChatInteractivity.ReadOnly });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(readOnlyChat, {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      const errorAction = envelopes.find((e) => e.action.type === ActionType.ChatError);
      assert.ok(errorAction, "should dispatch a chat error for a read-only chat");
      assert.deepStrictEqual(agent.sendMessageCalls, []);
    });
  });
  suite("handleAction \u2014 first-turn materialization failure", () => {
    function setupProvisionalSession() {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, { emitNotification: false });
    }
    test("surfaces a failed provisional first turn as a terminal creation failure", async () => {
      setupProvisionalSession();
      agent.sendMessageError = new Error("git -c exited with code 128: fatal: invalid reference: main");
      const turnStarted = {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, turnStarted, { clientId: "test", clientSeq: 1 });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const notifications = [];
      disposables.add(stateManager.onDidEmitNotification((n) => notifications.push(n)));
      sideEffects.handleAction(defaultChatUri, turnStarted);
      await waitForState(stateManager, () => envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed) || void 0);
      const sessionAdded = notifications.find((n) => n.type === "root/sessionAdded");
      assert.deepStrictEqual({
        chatError: envelopes.some((e) => e.action.type === ActionType.ChatError),
        creationFailed: envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed),
        lifecycle: stateManager.getSessionState(sessionUri.toString())?.lifecycle,
        sessionAddedWithError: !!sessionAdded && (sessionAdded.summary.status & SessionStatus.Error) === SessionStatus.Error
      }, {
        chatError: true,
        creationFailed: true,
        lifecycle: SessionLifecycle.CreationFailed,
        sessionAddedWithError: true
      });
    });
    test("surfaces a working directory resolution failure without calling the agent", async () => {
      setupProvisionalSession();
      const resolutionError = new Error("The isolated worktree could not be restored");
      const resolvingSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: {},
        resolveWorkingDirectoryBeforeSend: async () => {
          throw resolutionError;
        },
        onTurnComplete: () => {
        }
      });
      const turnStarted = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, turnStarted, { clientId: "test", clientSeq: 1 });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      resolvingSideEffects.handleAction(defaultChatUri, turnStarted);
      await waitForState(stateManager, () => envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed) || void 0);
      assert.deepStrictEqual({
        chatError: envelopes.some((e) => e.action.type === ActionType.ChatError),
        creationFailed: envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed),
        lifecycle: stateManager.getSessionState(sessionUri.toString())?.lifecycle,
        sendMessageCalls: agent.sendMessageCalls
      }, {
        chatError: true,
        creationFailed: true,
        lifecycle: SessionLifecycle.CreationFailed,
        sendMessageCalls: []
      });
    });
    test("captures the turn start before sending the message", async () => {
      setupProvisionalSession();
      const workingDirectory = URI.file("/wd");
      const captureStarted = new DeferredPromise();
      const releaseCapture = new DeferredPromise();
      const captures = [];
      const checkpoints = {
        ...NULL_CHECKPOINT_SERVICE,
        captureTurnStartCheckpoint: async (session, _chat, turnId, workingDirectories) => {
          captures.push({ session: session.toString(), turnId, workingDirectories: workingDirectories?.map((uri) => uri.toString()) });
          captureStarted.complete();
          await releaseCapture.p;
        }
      };
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        resolveWorkingDirectoryBeforeSend: async () => [workingDirectory],
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, void 0, void 0, checkpoints);
      const turnStarted = {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, turnStarted, { clientId: "test", clientSeq: 1 });
      localSideEffects.handleAction(defaultChatUri, turnStarted);
      await captureStarted.p;
      assert.deepStrictEqual(agent.sendMessageCalls, []);
      const didSendMessage = Event.toPromise(agent.onDidSendMessage);
      releaseCapture.complete();
      await didSendMessage;
      assert.deepStrictEqual(captures, [{
        session: sessionUri.toString(),
        turnId: "turn-1",
        workingDirectories: [workingDirectory.toString()]
      }]);
    });
    test("client cancellation discards the pending turn start", async () => {
      setupProvisionalSession();
      const discarded = new DeferredPromise();
      const checkpoints = {
        ...NULL_CHECKPOINT_SERVICE,
        discardTurnStartCheckpoint: async (session, chat, turnId) => {
          assert.deepStrictEqual({ session: session.toString(), chat: chat.toString(), turnId }, {
            session: sessionUri.toString(),
            chat: defaultChatUri,
            turnId: "turn-1"
          });
          discarded.complete();
        }
      };
      createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, void 0, void 0, checkpoints);
      stateManager.dispatchClientAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 0
      }, { clientId: "test", clientSeq: 1 });
      await discarded.p;
    });
    test("cancellation before send skips turn-start capture", async () => {
      setupProvisionalSession();
      let captureCount = 0;
      const checkpoints = {
        ...NULL_CHECKPOINT_SERVICE,
        captureTurnStartCheckpoint: async () => {
          captureCount++;
        }
      };
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        resolveWorkingDirectoryBeforeSend: async () => [URI.file("/wd")],
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, void 0, void 0, checkpoints);
      const cancelled = {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 0
      };
      stateManager.dispatchClientAction(defaultChatUri, cancelled, { clientId: "test", clientSeq: 1 });
      const started = {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      };
      localSideEffects.handleAction(defaultChatUri, started);
      await timeout(0);
      assert.deepStrictEqual({ captureCount, sendMessageCalls: agent.sendMessageCalls }, {
        captureCount: 0,
        sendMessageCalls: []
      });
    });
    test("AgentSideEffects owns exactly one ChatError when an already-ready session send rejects", async () => {
      setupSession();
      agent.sendMessageError = new Error("transient send failure");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      await waitForState(stateManager, () => envelopes.some((e) => e.action.type === ActionType.ChatError) || void 0);
      assert.deepStrictEqual({
        chatErrors: envelopes.filter((e) => e.action.type === ActionType.ChatError).length,
        creationFailed: envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed),
        lifecycle: stateManager.getSessionState(sessionUri.toString())?.lifecycle
      }, {
        chatErrors: 1,
        creationFailed: false,
        lifecycle: SessionLifecycle.Ready
      });
    });
    test("does not duplicate a Codex provider-owned failure when sendMessage resolves", async () => {
      setupSession();
      disposables.add(sideEffects.registerProgressListener(agent));
      const originalSendMessage = agent.sendMessage.bind(agent);
      agent.sendMessage = async (...args) => {
        await originalSendMessage(...args);
        agent.fireProgress({
          kind: "action",
          resource: URI.parse(defaultChatUri),
          action: { type: ActionType.ChatError, turnId: "turn-1", duration: 1, error: { errorType: "CodexMaterializeFailed", message: "workspace root rejected" } }
        });
        agent.fireProgress({
          kind: "action",
          resource: URI.parse(defaultChatUri),
          action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1 }
        });
      };
      const turnStarted = {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, turnStarted, { clientId: "test", clientSeq: 1 });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, turnStarted);
      await waitForState(stateManager, () => envelopes.some((e) => e.action.type === ActionType.ChatTurnComplete) || void 0);
      assert.deepStrictEqual(
        envelopes.filter((e) => e.action.type === ActionType.ChatError || e.action.type === ActionType.ChatTurnComplete).map((e) => e.action.type),
        [ActionType.ChatError, ActionType.ChatTurnComplete]
      );
    });
  });
  suite("handleAction \u2014 /rename slash command", () => {
    function createRenameSideEffects() {
      return createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(),
        onTurnComplete: () => {
        }
      });
    }
    test("redirects /rename to a title change and completes the turn without calling the agent", async () => {
      setupSession();
      const renameSideEffects = createRenameSideEffects();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "/rename Renamed Session", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      renameSideEffects.handleAction(defaultChatUri, action);
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.sendMessageCalls, []);
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.title, "Renamed Session");
      assert.strictEqual(stateManager.getActiveTurnId(sessionUri.toString()), void 0);
      const part = state?.turns.at(-1)?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.Markdown);
      assert.strictEqual(part?.kind === ResponsePartKind.Markdown ? part.content : void 0, "Renamed: Renamed Session");
    });
    test("/rename without a title completes the turn and leaves the title unchanged", async () => {
      setupSession();
      const renameSideEffects = createRenameSideEffects();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "/rename", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      renameSideEffects.handleAction(defaultChatUri, action);
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.sendMessageCalls, []);
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.title, "Test");
      assert.strictEqual(stateManager.getActiveTurnId(sessionUri.toString()), void 0);
    });
    test("peer /rename synchronously suppresses the automatic rename reminder", async () => {
      setupSession();
      stateManager.dispatchServerAction(ROOT_STATE_URI, {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostActiveAgentTitleGenerationConfigKey]: true }
      });
      const renameSideEffects = createRenameSideEffects();
      const peerChat = buildChatUri(sessionUri.toString(), "peer-rename");
      stateManager.addChat(sessionUri.toString(), peerChat, { title: "Automatic peer title" });
      renameSideEffects.markTitleAuto(sessionUri.toString(), peerChat, "Automatic peer title");
      const renameAction = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-rename",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "/rename User Peer Title", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(peerChat, renameAction, { clientId: "test", clientSeq: 1 });
      renameSideEffects.handleAction(peerChat, renameAction);
      await waitForState(stateManager, () => stateManager.getChatState(peerChat)?.title === "User Peer Title" && stateManager.getActiveTurnId(peerChat) === void 0 || void 0);
      const followUpAction = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-follow-up",
        startedAt: "2025-01-01T00:00:01.000Z",
        message: { text: "Continue", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(peerChat, followUpAction, { clientId: "test", clientSeq: 2 });
      renameSideEffects.handleAction(peerChat, followUpAction);
      await waitForSendMessageCalls(1);
      assert.strictEqual(agent.sendMessageCalls[0].prompt, "Continue");
    });
    test("automatic rename guidance is transient context and never changes the user prompt", async () => {
      setupSession();
      stateManager.dispatchServerAction(ROOT_STATE_URI, {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostActiveAgentTitleGenerationConfigKey]: true }
      });
      const renameSideEffects = createRenameSideEffects();
      renameSideEffects.markTitleAuto(sessionUri.toString(), void 0, "Automatic title");
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-guidance",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "Keep GitHub casing", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      renameSideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      const sendContext = agent.chatContexts.find((call) => call.boundary === "sendMessage")?.context;
      assert.strictEqual(agent.sendMessageCalls[0].prompt, "Keep GitHub casing");
      assert.ok(!URI.isUri(sendContext) && sendContext?.hostInstructions?.[0].includes("`rename_chat`"));
    });
    test("a message that merely starts with /rename text (no separator) is sent to the agent", async () => {
      setupSession();
      const renameSideEffects = createRenameSideEffects();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "/renamed thing", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      renameSideEffects.handleAction(defaultChatUri, action);
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), chat: URI.parse(defaultChatUri), prompt: "/renamed thing", attachments: void 0 }]);
    });
  });
  suite("handleAction \u2014 ! terminal command", () => {
    function createBangSideEffects(terminalManager) {
      return createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
    }
    test("runs a ! message as a terminal command and completes the turn without calling the agent", async () => {
      setupSession("file:///work");
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const bangSideEffects = createBangSideEffects(terminalManager);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      bangSideEffects.handleAction(defaultChatUri, action);
      await terminalManager.commandFinishedListenerRegistered.p;
      const terminalUri = terminalManager.created[0].channel;
      terminalManager.fireCommandFinished({ commandId: "1", command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === void 0 ? true : void 0);
      assert.deepStrictEqual(agent.sendMessageCalls, []);
      const state = stateManager.getSessionState(sessionUri.toString());
      const part = state?.turns.at(-1)?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      const toolCall = part?.kind === ResponsePartKind.ToolCall ? part.toolCall : void 0;
      assert.strictEqual(toolCall?.status, ToolCallStatus.Completed);
      assert.strictEqual(toolCall?.status === ToolCallStatus.Completed ? toolCall.success : void 0, true);
      assert.ok(toolCall?.status === ToolCallStatus.Completed && toolCall.content?.some((c) => c.type === ToolResultContentType.Terminal && c.resource === terminalUri));
      assert.strictEqual(terminalManager.created.length, 1);
      assert.ok(terminalManager.sentTexts.some((s) => s.data.includes("echo hi")));
    });
    test("a lone ! is forwarded to the agent instead of running a command", async () => {
      setupSession();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const bangSideEffects = createBangSideEffects(terminalManager);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      bangSideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.strictEqual(agent.sendMessageCalls[0].prompt, "!");
      assert.strictEqual(terminalManager.created.length, 0);
    });
    test("records the completed bang turn as a local turn, stripped of the live terminal reference", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      const localTurns = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const bangSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(db),
        localTurns,
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      bangSideEffects.handleAction(defaultChatUri, action);
      await terminalManager.commandFinishedListenerRegistered.p;
      terminalManager.fireCommandFinished({ commandId: "1", command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === void 0 ? true : void 0);
      assert.strictEqual(localTurns.resolveConcreteTurnId(defaultChatUri, "turn-1"), void 0);
      const persisted = await db.getLocalTurns();
      assert.strictEqual(persisted.length, 1);
      const payload = JSON.parse(persisted[0].payload);
      const toolCallPart = payload.responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
      assert.ok(toolCallPart?.toolCall?.content?.every((c) => c.type !== ToolResultContentType.Terminal));
      assert.ok(toolCallPart?.toolCall?.content?.some((c) => c.type === ToolResultContentType.Text));
    });
    test("seeds the session title from the ! command when the session is untitled", async () => {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const bangSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(db),
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      bangSideEffects.handleAction(defaultChatUri, action);
      assert.strictEqual(stateManager.getSessionState(sessionUri.toString())?.title, "echo hi");
      await terminalManager.commandFinishedListenerRegistered.p;
      terminalManager.fireCommandFinished({ commandId: "1", command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === void 0 ? true : void 0);
      assert.strictEqual(await db.getMetadata("customTitle"), "echo hi");
    });
  });
  suite("local turn persistence", () => {
    let clientSeq;
    setup(() => {
      clientSeq = 0;
    });
    function seedRealTurn(turnId, text) {
      stateManager.dispatchClientAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text, origin: { kind: MessageKind.User } }
      }, { clientId: "test", clientSeq: ++clientSeq });
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatTurnComplete, turnId, duration: 1e3 });
    }
    async function runBang(se, terminalManager, turnId) {
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: ++clientSeq });
      se.handleAction(defaultChatUri, action);
      await terminalManager.commandFinishedListenerRegistered.p;
      terminalManager.fireCommandFinished({ commandId: turnId, command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === void 0 ? true : void 0);
    }
    let localTurns;
    function createLocalTurnSideEffects(db, terminalManager) {
      const sessionDataService = createSessionDataService(db);
      localTurns = new AgentHostLocalTurns(sessionDataService, new NullLogService());
      return createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService,
        localTurns,
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
    }
    test("anchors a bang turn to the preceding concrete turn", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const se = createLocalTurnSideEffects(db, terminalManager);
      seedRealTurn("real-1", "hello");
      await runBang(se, terminalManager, "local-1");
      assert.strictEqual(localTurns.resolveConcreteTurnId(defaultChatUri, "local-1"), "real-1");
      const persisted = await db.getLocalTurns();
      assert.deepStrictEqual(persisted.map((r) => ({ turnId: r.turnId, chatUri: r.chatUri, anchorTurnId: r.anchorTurnId })), [
        { turnId: "local-1", chatUri: defaultChatUri, anchorTurnId: "real-1" }
      ]);
    });
    test("truncating at a local turn redirects the SDK truncation to the concrete anchor", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const se = createLocalTurnSideEffects(db, terminalManager);
      seedRealTurn("real-1", "hello");
      await runBang(se, terminalManager, "local-1");
      stateManager.dispatchClientAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "local-1" }, { clientId: "test", clientSeq: ++clientSeq });
      se.handleAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "local-1" });
      const truncateCall = agent.truncateChatCalls.at(-1);
      assert.strictEqual(truncateCall?.chat.toString(), defaultChatUri);
      assert.strictEqual(truncateCall?.turnId, "real-1");
    });
    test("truncating at a real turn drops the trailing local turn", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const se = createLocalTurnSideEffects(db, terminalManager);
      seedRealTurn("real-1", "hello");
      await runBang(se, terminalManager, "local-1");
      stateManager.dispatchClientAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "real-1" }, { clientId: "test", clientSeq: ++clientSeq });
      se.handleAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "real-1" });
      assert.strictEqual(agent.truncateChatCalls.at(-1)?.turnId, "real-1");
      assert.strictEqual(localTurns.isLocal(defaultChatUri, "local-1"), false);
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(await db.getLocalTurns(), []);
    });
  });
  suite("turn usage persistence", () => {
    const usage = { inputTokens: 100, outputTokens: 20, model: "gpt-5", _meta: { copilotUsage: { totalNanoAiu: 5e9 } } };
    function createUsageSideEffects(db) {
      const sessionDataService = createSessionDataService(db);
      createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService,
        localTurns: new AgentHostLocalTurns(sessionDataService, new NullLogService()),
        onTurnComplete: () => {
        }
      });
    }
    test("persists the latest usage of a turn, without waiting for the turn to end", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      createUsageSideEffects(db);
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatUsage, turnId: "turn-1", usage: { inputTokens: 1, outputTokens: 1 } });
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatUsage, turnId: "turn-1", usage });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], [["turn-1", JSON.stringify(usage)]]);
    });
    test("does not persist usage reported on a subagent chat", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      createUsageSideEffects(db);
      const subagentChatUri = buildSubagentChatUri(sessionUri.toString(), "tool-call-1");
      stateManager.dispatchServerAction(subagentChatUri, { type: ActionType.ChatUsage, turnId: "turn-1", usage });
      stateManager.dispatchServerAction(subagentChatUri, { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 10 });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], []);
    });
  });
  suite("immediate title on first turn", () => {
    function setupDefaultSession() {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
    }
    test("dispatches titleChanged with user message on first turn", () => {
      setupDefaultSession();
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "Fix the login bug", origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.ok(titleAction, "should dispatch session/titleChanged");
      if (titleAction?.action.type === ActionType.SessionTitleChanged) {
        assert.strictEqual(titleAction.action.title, "Fix the login bug");
      }
    });
    test("does not dispatch titleChanged when message is whitespace", () => {
      setupDefaultSession();
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "   ", origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.strictEqual(titleAction, void 0, "should not dispatch titleChanged for empty message");
    });
    test("normalizes whitespace and truncates long messages", () => {
      setupDefaultSession();
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const longMessage = "Fix the bug\nin the login	page  please " + "a".repeat(250);
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: longMessage, origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.ok(titleAction, "should dispatch session/titleChanged");
      if (titleAction?.action.type === ActionType.SessionTitleChanged) {
        assert.ok(!titleAction.action.title.includes("\n"), "should not contain newlines");
        assert.ok(!titleAction.action.title.includes("	"), "should not contain tabs");
        assert.ok(!titleAction.action.title.includes("  "), "should not contain double spaces");
        assert.ok(titleAction.action.title.length <= 200, "should be truncated to 200 chars");
      }
    });
    test("does not dispatch titleChanged on second turn", () => {
      setupDefaultSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-2",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "second message", origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.strictEqual(titleAction, void 0, "should not dispatch titleChanged on second turn");
    });
    test("does not dispatch titleChanged when title is already set", () => {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "User Renamed",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.strictEqual(titleAction, void 0, "should not clobber existing title");
    });
  });
  suite("turn completion \u2014 read/unread", () => {
    function readChangesFrom(envelopes) {
      return envelopes.filter((e) => e.action.type === ActionType.SessionIsReadChanged).map((e) => e.action.isRead);
    }
    function setupPersisting() {
      const db = new TestSessionDatabase();
      const persisting = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(db),
        onTurnComplete: () => {
        }
      }, void 0, disposables.add(new AgentHostTelemetryService(telemetryService)));
      return { sideEffects: persisting, db };
    }
    test("marks a read session unread when a turn completes", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      assert.deepStrictEqual({
        readChanges: readChangesFrom(envelopes),
        isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString()).status & SessionStatus.IsRead) !== 0
      }, {
        readChanges: [false],
        isReadBitSet: false
      });
    });
    test("does not re-mark an already-unread session on turn completion", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      assert.deepStrictEqual(readChangesFrom(envelopes), []);
    });
    test("persists the unread flag so it survives a host restart", async () => {
      const { sideEffects: persisting, db } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      assert.strictEqual(await db.getMetadata("isRead"), "");
    });
    test("persists read state exactly once for client- and server-dispatched changes", () => {
      const { db } = setupPersisting();
      setupSession();
      stateManager.dispatchClientAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true }, { clientId: "client-1", clientSeq: 1 });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: false });
      stateManager.rejectClientAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true }, { clientId: "client-1", clientSeq: 2 }, "nope");
      assert.deepStrictEqual(db.setMetadataCalls.filter((c) => c.key === "isRead"), [
        { key: "isRead", value: "true" },
        { key: "isRead", value: "" }
      ]);
    });
    test("marks the parent session unread when a subagent turn completes", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-1",
          toolName: "runSubagent",
          displayName: "Run Subagent",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(defaultChatUri),
        toolCallId: "tc-1",
        agentName: "code-reviewer",
        agentDisplayName: "Code Reviewer"
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subagentTurnId = stateManager.getSessionState(subagentUri).activeTurn.id;
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(subagentUri),
        action: { type: ActionType.ChatTurnComplete, turnId: subagentTurnId, duration: 1e3 }
      });
      assert.deepStrictEqual({
        readChanges: readChangesFrom(envelopes),
        isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString()).status & SessionStatus.IsRead) !== 0
      }, {
        readChanges: [false],
        isReadBitSet: false
      });
    });
    test("marks a read session unread when a turn is cancelled", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 }
      });
      assert.deepStrictEqual({
        readChanges: readChangesFrom(envelopes),
        isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString()).status & SessionStatus.IsRead) !== 0
      }, {
        readChanges: [false],
        isReadBitSet: false
      });
    });
    test("marks a read session unread when a turn errors", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatError, turnId: "turn-1", duration: 1e3, error: { errorType: "Error", message: "boom" } }
      });
      assert.deepStrictEqual({
        readChanges: readChangesFrom(envelopes),
        isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString()).status & SessionStatus.IsRead) !== 0
      }, {
        readChanges: [false],
        isReadBitSet: false
      });
    });
  });
  suite("handleAction \u2014 session/turnCancelled", () => {
    test("calls abortSession on the agent", async () => {
      setupSession();
      const clientContext = {
        clientType: AgentHostClientType.EditorWindow,
        connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
        transportKind: AgentHostTransportKind.MessagePort,
        hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
        machineId: "client-machine-id",
        devDeviceId: "client-dev-device-id"
      };
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      }, "client-1", clientContext);
      await new Promise((r) => setTimeout(r, 10));
      const abortContext = agent.chatContexts.find((call) => call.boundary === "abort")?.context;
      assert.deepStrictEqual({
        abortSessionCalls: agent.abortSessionCalls,
        clientTelemetryContext: !URI.isUri(abortContext) ? abortContext?.clientTelemetryContext : void 0
      }, {
        abortSessionCalls: [URI.parse(sessionUri.toString())],
        clientTelemetryContext: clientContext
      });
    });
  });
  suite("handleAction \u2014 chat/turnStarted model selection", () => {
    test("calls changeModel on the agent before sending the message", async () => {
      setupSession();
      const clientContext = {
        clientType: AgentHostClientType.EditorWindow,
        connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
        transportKind: AgentHostTransportKind.MessagePort,
        hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
        machineId: "client-machine-id",
        devDeviceId: "client-dev-device-id"
      };
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, model: { id: "gpt-5" } }
      }, "client-1", clientContext);
      await new Promise((r) => setTimeout(r, 10));
      const contexts = Object.fromEntries(agent.chatContexts.filter((call) => call.boundary === "changeModel" || call.boundary === "changeAgent" || call.boundary === "sendMessage").map((call) => [call.boundary, !URI.isUri(call.context) ? call.context?.clientTelemetryContext : void 0]));
      assert.deepStrictEqual({
        changeModelCalls: agent.changeModelCalls,
        contexts
      }, {
        changeModelCalls: [{ session: URI.parse(sessionUri.toString()), model: { id: "gpt-5" }, chat: URI.parse(defaultChatUri) }],
        contexts: {
          changeModel: clientContext,
          changeAgent: clientContext,
          sendMessage: clientContext
        }
      });
    });
    test("waits for model selection before sending the message", async () => {
      setupSession();
      let resolveChangeModel;
      const changeModelSettled = new Promise((resolve) => {
        resolveChangeModel = resolve;
      });
      let resolveSend;
      const sendStarted = new Promise((resolve) => {
        resolveSend = resolve;
      });
      agent.changeModel = async (session, model, chat) => {
        agent.changeModelCalls.push({ session, model, chat });
        await changeModelSettled;
      };
      agent.sendMessage = async (session, chat, prompt, attachments) => {
        agent.sendMessageCalls.push({ session, prompt, attachments, chat });
        resolveSend();
      };
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, model: { id: "gpt-5" } }
      });
      await Promise.resolve();
      assert.deepStrictEqual({
        changeModelCalls: agent.changeModelCalls,
        sendMessageCalls: agent.sendMessageCalls
      }, {
        changeModelCalls: [{ session: URI.parse(sessionUri.toString()), model: { id: "gpt-5" }, chat: URI.parse(defaultChatUri) }],
        sendMessageCalls: []
      });
      resolveChangeModel();
      await sendStarted;
      assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), prompt: "hello", attachments: void 0, chat: URI.parse(defaultChatUri) }]);
    });
    test("forwards the chat channel for an additional (peer) chat", async () => {
      setupSession();
      const chatChannel = buildChatUri(sessionUri.toString(), "peer-1");
      sideEffects.handleAction(chatChannel, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, model: { id: "gpt-5" } }
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.changeModelCalls.map((call) => ({
        session: call.session.toString(),
        model: call.model,
        chat: call.chat?.toString()
      })), [{ session: sessionUri.toString(), model: { id: "gpt-5" }, chat: chatChannel }]);
    });
  });
  suite("handleAction \u2014 chat/turnStarted agent selection", () => {
    test("calls changeAgent on the agent for the session default chat before sending the message", async () => {
      setupSession();
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, agent: { uri: "file:///agents/reviewer.md" } }
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.changeAgentCalls, [{ session: URI.parse(sessionUri.toString()), agent: { uri: "file:///agents/reviewer.md" }, chat: URI.parse(defaultChatUri) }]);
    });
    test("forwards the chat channel for an additional (peer) chat", async () => {
      setupSession();
      const chatChannel = buildChatUri(sessionUri.toString(), "peer-1");
      sideEffects.handleAction(chatChannel, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, agent: { uri: "file:///agents/reviewer.md" } }
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.changeAgentCalls.map((call) => ({
        session: call.session.toString(),
        agent: call.agent,
        chat: call.chat?.toString()
      })), [{ session: sessionUri.toString(), agent: { uri: "file:///agents/reviewer.md" }, chat: chatChannel }]);
    });
  });
  suite("registerProgressListener", () => {
    test("emits auth-required notifications when observable state becomes required", () => {
      const notifications = [];
      disposables.add(stateManager.onDidEmitNotification((notification) => notifications.push(notification)));
      disposables.add(sideEffects.registerProgressListener(agent));
      const requirement = {
        resource: {
          resource: "https://api.github.com",
          authorization_servers: ["https://github.com/login/oauth"]
        },
        reason: AuthRequiredReason.Expired
      };
      agent.setAuthenticationRequired(requirement);
      agent.setAuthenticationRequired(void 0);
      agent.setAuthenticationRequired(requirement);
      assert.deepStrictEqual(notifications.filter((notification) => notification.type === "auth/required"), [
        { type: "auth/required", channel: ROOT_STATE_URI, ...requirement },
        { type: "auth/required", channel: ROOT_STATE_URI, ...requirement }
      ]);
    });
    test("maps agent progress events to state actions", () => {
      setupSession();
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "msg-1", content: "hi" } }
      });
      assert.ok(envelopes.some((e) => e.action.type === ActionType.ChatResponsePart));
    });
    test("does not route stale actions into a force-started turn", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-2",
        startedAt: "2025-01-01T00:01:00.000Z",
        message: { text: "continue", origin: { kind: MessageKind.User } }
      });
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "stale-part", content: "stale response" } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatUsage, turnId: "turn-1", usage: { inputTokens: 100, outputTokens: 50, model: "stale-model" } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 199029 }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-2", part: { kind: ResponsePartKind.Markdown, id: "fresh-part", content: "fresh" } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatDelta, turnId: "turn-2", partId: "fresh-part", content: " response" }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatUsage, turnId: "turn-2", usage: { inputTokens: 20, outputTokens: 10, model: "fresh-model" } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-2", duration: 2e3 }
      });
      const state = stateManager.getSessionState(defaultChatUri);
      assert.deepStrictEqual(state?.turns.map((turn) => ({
        id: turn.id,
        state: turn.state,
        duration: turn.duration,
        message: turn.message.text,
        markdown: turn.responseParts.filter((part) => part.kind === ResponsePartKind.Markdown).map((part) => part.content).join(""),
        usage: turn.usage
      })), [{
        id: "turn-1",
        state: TurnState.Cancelled,
        duration: 1e3,
        message: "hello",
        markdown: "",
        usage: void 0
      }, {
        id: "turn-2",
        state: TurnState.Complete,
        duration: 2e3,
        message: "continue",
        markdown: "fresh response",
        usage: { inputTokens: 20, outputTokens: 10, model: "fresh-model" }
      }]);
    });
    test("preserves the turn id of a provider-initiated turn when idle", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatTurnStarted,
          turnId: "provider-turn",
          startedAt: "2025-01-01T00:01:00.000Z",
          message: { text: "provider notification", origin: { kind: MessageKind.SystemNotification } }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "provider-turn", part: { kind: ResponsePartKind.Markdown, id: "provider-part", content: "provider response" } }
      });
      const state = stateManager.getSessionState(defaultChatUri);
      assert.deepStrictEqual({
        turnId: state?.activeTurn?.id,
        message: state?.activeTurn?.message.text,
        responseParts: state?.activeTurn?.responseParts
      }, {
        turnId: "provider-turn",
        message: "provider notification",
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "provider-part", content: "provider response" }]
      });
    });
    test("does not replace an active turn with a stale turn start", () => {
      setupSession();
      startTurn("turn-2");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatTurnStarted,
          turnId: "turn-1",
          startedAt: "2025-01-01T00:00:00.000Z",
          message: { text: "stale request", origin: { kind: MessageKind.User } }
        }
      });
      assert.deepStrictEqual({
        turnId: stateManager.getSessionState(defaultChatUri)?.activeTurn?.id,
        message: stateManager.getSessionState(defaultChatUri)?.activeTurn?.message.text
      }, {
        turnId: "turn-2",
        message: "hello"
      });
    });
    test("stale completion does not clear active turn tool tracking", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-2",
        startedAt: "2025-01-01T00:01:00.000Z",
        message: { text: "continue", origin: { kind: MessageKind.User } }
      });
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-2",
          toolCallId: "active-tool",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 199029 }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-2",
          toolCallId: "active-tool",
          result: { success: true, pastTenseMessage: "Read file" }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-2", duration: 1e3 }
      });
      assert.deepStrictEqual(
        telemetryService.events.filter((event) => event.eventName === "languageModelToolInvoked").map((event) => event.eventName),
        ["languageModelToolInvoked"]
      );
    });
    test("returns a disposable that stops listening", () => {
      setupSession();
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const listener = sideEffects.registerProgressListener(agent);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "msg-1", content: "before" } }
      });
      assert.strictEqual(envelopes.filter((e) => e.action.type === ActionType.ChatResponsePart).length, 1);
      listener.dispose();
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "msg-2", content: "after" } }
      });
      assert.strictEqual(envelopes.filter((e) => e.action.type === ActionType.ChatResponsePart).length, 1);
    });
    test("customizations change publishes once, then dedupes identical re-fetches", async () => {
      setupSession();
      const makeCustomizations = () => [
        { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", load: { kind: CustomizationLoadStatus.Loaded } }
      ];
      let fetchCalls = 0;
      agent.getSessionCustomizations = async () => {
        fetchCalls++;
        return makeCustomizations();
      };
      const changed = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => {
        if (e.action.type === ActionType.SessionCustomizationsChanged) {
          changed.push(e);
        }
      }));
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireCustomizationsChange();
      await waitForState(stateManager, () => changed.length >= 1 || void 0);
      assert.strictEqual(changed.length, 1);
      agent.fireCustomizationsChange();
      agent.fireCustomizationsChange();
      const deadline = Date.now() + 5e3;
      while (fetchCalls < 3 && Date.now() < deadline) {
        await timeout(5);
      }
      assert.strictEqual(changed.length, 1, "identical customizations must not re-publish");
      assert.ok(fetchCalls >= 3, "each change still re-fetches to compare");
    });
    test("re-publishes after session eviction + restore even when customizations are unchanged", async () => {
      setupSession();
      const makeCustomizations = () => [
        { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", load: { kind: CustomizationLoadStatus.Loaded } }
      ];
      agent.getSessionCustomizations = async () => makeCustomizations();
      const changed = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => {
        if (e.action.type === ActionType.SessionCustomizationsChanged) {
          changed.push(e);
        }
      }));
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireCustomizationsChange();
      await waitForState(stateManager, () => changed.length >= 1 || void 0);
      assert.strictEqual(changed.length, 1);
      stateManager.removeSession(sessionUri.toString());
      setupSession();
      agent.fireCustomizationsChange();
      await waitForState(stateManager, () => changed.length >= 2 || void 0);
      assert.strictEqual(changed.length, 2, "restored session must receive its customizations");
    });
  });
  suite("agents observable", () => {
    test("dispatches root/agentsChanged without fetching models when observable changes", async () => {
      agentList.set([], void 0);
      const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (e) => {
        if (e.action.type !== ActionType.RootAgentsChanged) {
          return false;
        }
        return e.action.agents.length === 1;
      }));
      agentList.set([agent], void 0);
      const { action } = await envelope;
      assert.strictEqual(action.type, ActionType.RootAgentsChanged);
      assert.deepStrictEqual(action.agents[0].models, []);
    });
    test("model observable update publishes models", async () => {
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (e) => {
        if (e.action.type !== ActionType.RootAgentsChanged) {
          return false;
        }
        return e.action.agents[0]?.models.length === 1;
      }));
      agent.setModels([{ provider: "mock", id: "mock-model", name: "mock Model", maxContextWindow: 128e3, maxOutputTokens: 16e3, maxPromptTokens: 112e3, supportsVision: false }]);
      await envelope;
      const actions = envelopes.map((e) => e.action).filter((action2) => action2.type === ActionType.RootAgentsChanged);
      const action = actions[actions.length - 1];
      assert.ok(action, "should dispatch root/agentsChanged");
      assert.deepStrictEqual(action.agents[0].models, [{
        id: "mock-model",
        provider: "mock",
        name: "mock Model",
        maxContextWindow: 128e3,
        maxOutputTokens: 16e3,
        maxPromptTokens: 112e3,
        supportsVision: false,
        policyState: void 0,
        configSchema: void 0,
        _meta: void 0
      }]);
    });
    test("model observable update publishes model metadata", async () => {
      const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (e) => {
        if (e.action.type !== ActionType.RootAgentsChanged) {
          return false;
        }
        return e.action.agents[0]?.models.length === 1;
      }));
      agent.setModels([{ provider: "mock", id: "mock-model", name: "mock Model", maxContextWindow: 128e3, supportsVision: false, _meta: { multiplierNumeric: 2 } }]);
      const { action } = await envelope;
      assert.strictEqual(action.type, ActionType.RootAgentsChanged);
      assert.deepStrictEqual(action.agents[0].models[0]._meta, { multiplierNumeric: 2 });
    });
    test("unchanged model observable update does not dispatch unchanged agent infos", async () => {
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const models = [{ provider: "mock", id: "mock-model", name: "mock Model", maxContextWindow: 128e3, supportsVision: false }];
      const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (e) => {
        if (e.action.type !== ActionType.RootAgentsChanged) {
          return false;
        }
        return e.action.agents[0]?.models.length === 1;
      }));
      agent.setModels(models);
      await envelope;
      envelopes.length = 0;
      agent.setModels([...models]);
      await Promise.resolve();
      await Promise.resolve();
      assert.strictEqual(envelopes.filter((e) => e.action.type === ActionType.RootAgentsChanged).length, 0);
    });
  });
  suite("pending message sync", () => {
    test("syncs steering message to agent on ChatPendingMessageSet", () => {
      setupSession();
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steer-1",
        message: { text: "focus on tests", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].steeringMessage, { id: "steer-1", message: { text: "focus on tests", origin: { kind: MessageKind.User } } });
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
      assert.strictEqual(agent.setPendingMessagesCalls[0].chat.toString(), defaultChatUri);
    });
    test("syncs a peer chat steering message addressed by the peer chat URI", () => {
      setupSession();
      const peerChatUri = URI.parse(buildChatUri(sessionUri.toString(), "peer-steer"));
      stateManager.addChat(sessionUri.toString(), peerChatUri.toString());
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steer-peer",
        message: { text: "steer the peer", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(peerChatUri.toString(), action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(peerChatUri.toString(), action);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.deepStrictEqual({
        chat: agent.setPendingMessagesCalls[0].chat.toString(),
        steeringId: agent.setPendingMessagesCalls[0].steeringMessage?.id
      }, {
        chat: peerChatUri.toString(),
        steeringId: "steer-peer"
      });
    });
    test("syncs queued message and preserves the enqueuing client attribution", async () => {
      setupSession();
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-1",
        message: { text: "queued message", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action, "client-editor", AgentHostClientType.EditorWindow);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.strictEqual(agent.setPendingMessagesCalls[0].steeringMessage, void 0);
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls[0], {
        session: URI.parse(sessionUri.toString()),
        chat: URI.parse(defaultChatUri),
        prompt: "queued message",
        attachments: void 0,
        senderClientId: "client-editor",
        clientType: "editor_window"
      });
    });
    test("parses queued protocol attachment URI strings before passing them to the agent", async () => {
      setupSession();
      const fileUri = URI.file("/workspace/queued.ts");
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-uri",
        message: { text: "queued message", origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "queued.ts", displayKind: "document" }] }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{
        session: URI.parse(sessionUri.toString()),
        chat: URI.parse(defaultChatUri),
        prompt: "queued message",
        attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "queued.ts", displayKind: "document" }]
      }]);
    });
    test("logs telemetry when sending a queued user message", () => {
      setupSession();
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-telemetry",
        message: { text: "queued message", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action);
      assert.deepStrictEqual(telemetryService.events, [{
        eventName: "agentHost.userMessageSent",
        data: {
          provider: "mock",
          hostLaunchKind: "vscode_main_process",
          initiatorClientId: void 0,
          initiatorClientType: "unknown",
          initiatorConnectionKind: "unknown",
          initiatorTransportKind: "unknown",
          agentSessionId: "session-1",
          source: "queued",
          isSubagentSession: false,
          turnCount: 0,
          attachmentCount: 0
        }
      }]);
    });
    test("syncs on ChatPendingMessageRemoved", () => {
      setupSession();
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-rm",
        message: { text: "will be removed", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setAction);
      agent.setPendingMessagesCalls.length = 0;
      const removeAction = {
        type: ActionType.ChatPendingMessageRemoved,
        kind: PendingMessageKind.Queued,
        id: "q-rm"
      };
      stateManager.dispatchClientAction(defaultChatUri, removeAction, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, removeAction);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
    });
    test("syncs on ChatQueuedMessagesReordered", () => {
      setupSession();
      const setA = { type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: "q-a", message: { text: "A", origin: { kind: MessageKind.User } } };
      stateManager.dispatchClientAction(defaultChatUri, setA, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setA);
      const setB = { type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: "q-b", message: { text: "B", origin: { kind: MessageKind.User } } };
      stateManager.dispatchClientAction(defaultChatUri, setB, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, setB);
      agent.setPendingMessagesCalls.length = 0;
      const reorderAction = { type: ActionType.ChatQueuedMessagesReordered, order: ["q-b", "q-a"] };
      stateManager.dispatchClientAction(defaultChatUri, reorderAction, { clientId: "test", clientSeq: 3 });
      sideEffects.handleAction(defaultChatUri, reorderAction);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
    });
  });
  suite("queued message consumption", () => {
    test("auto-starts turn from queued message on idle", async () => {
      setupSession();
      disposables.add(sideEffects.registerProgressListener(agent));
      startTurn("turn-1");
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-auto",
        message: { text: "auto queued", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setAction);
      assert.strictEqual(agent.sendMessageCalls.length, 0);
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      const turnComplete = envelopes.find((e) => e.action.type === ActionType.ChatTurnComplete);
      assert.ok(turnComplete, "should dispatch session/turnComplete");
      const turnStarted = envelopes.find((e) => e.action.type === ActionType.ChatTurnStarted);
      assert.ok(turnStarted, "should dispatch session/turnStarted for queued message");
      assert.strictEqual(turnStarted.action.queuedMessageId, "q-auto");
      await waitForSendMessageCalls(1);
      assert.strictEqual(agent.sendMessageCalls.length, 1);
      assert.strictEqual(agent.sendMessageCalls[0].prompt, "auto queued");
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.queuedMessages, void 0);
    });
    test("waits for pending steering before consuming a queued message", async () => {
      setupSession();
      disposables.add(sideEffects.registerProgressListener(agent));
      startTurn("turn-original");
      const queuedAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "queued-1",
        message: { text: "queued", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, queuedAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, queuedAction);
      const steeringAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steering-1",
        message: { text: "steering", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, steeringAction, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, steeringAction);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-original", duration: 1e3 }
      });
      assert.strictEqual(agent.sendMessageCalls.length, 0, "queued message must wait for steering to start");
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatTurnStarted,
          turnId: "turn-steering",
          startedAt: (/* @__PURE__ */ new Date()).toISOString(),
          message: steeringAction.message,
          queuedMessageId: steeringAction.id
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-steering", duration: 1e3 }
      });
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls.map((call) => call.prompt), ["queued"]);
    });
    test("does not drain queued messages when the cancelled turn completes late", () => {
      setupSession();
      disposables.add(sideEffects.registerProgressListener(agent));
      startTurn("turn-1");
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-after-abort",
        message: { text: "queued behind abort", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setAction);
      assert.strictEqual(agent.sendMessageCalls.length, 0);
      const cancelAction = { type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 };
      stateManager.dispatchClientAction(defaultChatUri, cancelAction, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, cancelAction);
      const truncateAction = { type: ActionType.ChatTruncated };
      stateManager.dispatchClientAction(defaultChatUri, truncateAction, { clientId: "test", clientSeq: 3 });
      sideEffects.handleAction(defaultChatUri, truncateAction);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 2e3 }
      });
      assert.strictEqual(agent.sendMessageCalls.length, 0, "cancelling must not drain queued messages");
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.turns.length, 0, "the cancelled turn should no longer be retained in history");
      assert.strictEqual(state?.queuedMessages?.length, 1, "queued message should remain for manual dequeue");
      assert.strictEqual(state?.queuedMessages?.[0].id, "q-after-abort");
    });
    test("intercepts queued /rename and drains the message queued behind it", async () => {
      setupSession();
      const renameSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(),
        onTurnComplete: () => {
        }
      });
      disposables.add(renameSideEffects.registerProgressListener(agent));
      startTurn("turn-1");
      for (const msg of [
        { id: "q-rename", text: "/rename Queued Title" },
        { id: "q-after", text: "after rename" }
      ]) {
        const setAction = {
          type: ActionType.ChatPendingMessageSet,
          kind: PendingMessageKind.Queued,
          id: msg.id,
          message: { text: msg.text, origin: { kind: MessageKind.User } }
        };
        stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
        renameSideEffects.handleAction(defaultChatUri, setAction);
      }
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      await waitForSendMessageCalls(1);
      assert.strictEqual(agent.sendMessageCalls.length, 1);
      assert.strictEqual(agent.sendMessageCalls[0].prompt, "after rename");
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.queuedMessages, void 0);
      assert.strictEqual(state?.title, "Queued Title");
    });
    test("replaces a queued bang command title with the following real message", async () => {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const queuedSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(db),
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
      disposables.add(queuedSideEffects.registerProgressListener(agent));
      startTurn("turn-1");
      for (const [id, text] of [["q-command", "!echo hi"], ["q-request", "Explain the build"]]) {
        const setAction = {
          type: ActionType.ChatPendingMessageSet,
          kind: PendingMessageKind.Queued,
          id,
          message: { text, origin: { kind: MessageKind.User } }
        };
        stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
        queuedSideEffects.handleAction(defaultChatUri, setAction);
      }
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      await terminalManager.commandFinishedListenerRegistered.p;
      terminalManager.fireCommandFinished({ commandId: "1", command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual({
        prompt: agent.sendMessageCalls[0].prompt,
        title: stateManager.getSessionState(sessionUri.toString())?.title,
        persistedTitle: await db.getMetadata("customTitle")
      }, {
        prompt: "Explain the build",
        title: "Explain the build",
        persistedTitle: "Explain the build"
      });
    });
    test("drains a peer chat queued message to the owning session with the chat arg", async () => {
      setupSession();
      const chatUri = URI.parse(buildChatUri(sessionUri, "peer-q"));
      stateManager.addChat(sessionUri.toString(), chatUri.toString());
      disposables.add(sideEffects.registerProgressListener(agent));
      stateManager.dispatchClientAction(
        chatUri.toString(),
        { type: ActionType.ChatTurnStarted, turnId: "pturn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "hi", origin: { kind: MessageKind.User } } },
        { clientId: "test", clientSeq: 1 }
      );
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "pq-1",
        message: { text: "peer queued", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(chatUri.toString(), setAction, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(chatUri.toString(), setAction);
      assert.strictEqual(agent.sendMessageCalls.length, 0);
      agent.fireProgress({
        kind: "action",
        resource: chatUri,
        action: { type: ActionType.ChatTurnComplete, turnId: "pturn-1", duration: 1e3 }
      });
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls.map((call) => ({
        ...call,
        session: call.session.toString(),
        chat: call.chat?.toString()
      })), [{
        session: sessionUri.toString(),
        prompt: "peer queued",
        attachments: void 0,
        chat: chatUri.toString()
      }]);
    });
    test("does not consume queued message while a turn is active", () => {
      setupSession();
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-wait",
        message: { text: "should wait", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setAction);
      const turnStarted = envelopes.find((e) => e.action.type === ActionType.ChatTurnStarted);
      assert.strictEqual(turnStarted, void 0, "should not start a turn while one is active");
      assert.strictEqual(agent.sendMessageCalls.length, 0);
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.queuedMessages?.length, 1);
      assert.strictEqual(state?.queuedMessages?.[0].id, "q-wait");
    });
    test("dispatches ChatPendingMessageRemoved for steering messages on steering_consumed", () => {
      setupSession();
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steer-rm",
        message: { text: "steer me", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action);
      let removal = envelopes.find(
        (e) => e.action.type === ActionType.ChatPendingMessageRemoved && e.action.kind === PendingMessageKind.Steering
      );
      assert.strictEqual(removal, void 0, "should not dispatch removal until steering_consumed");
      agent.fireProgress({
        kind: "steering_consumed",
        chat: URI.parse(defaultChatUri),
        id: "steer-rm"
      });
      removal = envelopes.find(
        (e) => e.action.type === ActionType.ChatPendingMessageRemoved && e.action.kind === PendingMessageKind.Steering
      );
      assert.ok(removal, "should dispatch ChatPendingMessageRemoved for steering");
      assert.strictEqual(removal.action.id, "steer-rm");
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.steeringMessage, void 0);
    });
  });
  suite("handleAction \u2014 session/activeClientSet", () => {
    setup(() => {
      disposables.add(sideEffects.registerProgressListener(agent));
    });
    test("calls setClientCustomizations and dispatches customizationsChanged once", async () => {
      setupSession();
      const pluginA = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", load: { kind: CustomizationLoadStatus.Loaded } };
      const pluginB = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-b"), uri: "file:///plugin-b", name: "Plugin B", load: { kind: CustomizationLoadStatus.Loaded } };
      const pluginAClient = { type: CustomizationType.Plugin, id: pluginA.id, uri: pluginA.uri, name: pluginA.name };
      const pluginBClient = { type: CustomizationType.Plugin, id: pluginB.id, uri: pluginB.uri, name: pluginB.name };
      agent.getSessionCustomizations = async () => [pluginA, pluginB];
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const action = {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "test-client",
          tools: [],
          customizations: [pluginAClient, pluginBClient]
        }
      };
      sideEffects.handleAction(sessionUri.toString(), action);
      await new Promise((r) => setTimeout(r, 50));
      assert.deepStrictEqual(agent.setClientCustomizationsCalls, [{
        clientId: "test-client",
        customizations: [pluginAClient, pluginBClient]
      }]);
      const customizationActions = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged);
      assert.strictEqual(customizationActions.length, 1, "should dispatch one full customizationsChanged replacement");
      assert.strictEqual(
        envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationUpdated).length,
        0,
        "should not dispatch customizationUpdated when progress matches the final state"
      );
    });
    test("dispatches customizationUpdated for sync progress after initial replacement", async () => {
      setupSession();
      const pluginAClient = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A" };
      let currentCustomizations = [];
      agent.getSessionCustomizations = async () => currentCustomizations;
      agent.syncClientCustomizations = (session, clientId, customizations) => {
        agent.setClientCustomizationsCalls.push({ clientId, customizations });
        const loading = { ...pluginAClient, load: { kind: CustomizationLoadStatus.Loading } };
        currentCustomizations = [loading];
        agent.fireProgress({
          kind: "action",
          resource: session,
          action: {
            type: ActionType.SessionCustomizationsChanged,
            customizations: [...currentCustomizations]
          }
        });
        void (async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          const loaded = { ...pluginAClient, load: { kind: CustomizationLoadStatus.Loaded } };
          currentCustomizations = [loaded];
          agent.fireProgress({
            kind: "action",
            resource: session,
            action: {
              type: ActionType.SessionCustomizationUpdated,
              customization: loaded
            }
          });
        })();
        return currentCustomizations.map((customization) => ({ customization }));
      };
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(sessionUri.toString(), {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "test-client",
          tools: [],
          customizations: [pluginAClient]
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const customizationsChanged = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged);
      assert.strictEqual(customizationsChanged.length, 1);
      const firstCustomizationsChanged = customizationsChanged[0].action;
      assert.strictEqual(firstCustomizationsChanged.type, ActionType.SessionCustomizationsChanged);
      assert.deepStrictEqual(firstCustomizationsChanged.customizations, [{
        ...pluginAClient,
        load: { kind: CustomizationLoadStatus.Loading }
      }]);
      const customizationUpdated = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationUpdated);
      assert.deepStrictEqual(customizationUpdated.map((e) => e.action), [{
        type: ActionType.SessionCustomizationUpdated,
        customization: { ...pluginAClient, load: { kind: CustomizationLoadStatus.Loaded } }
      }]);
    });
    test("rejects session actions emitted on a peer chat channel", () => {
      setupSession();
      const peerChatUri = URI.parse(buildChatUri(sessionUri, "peer-customization"));
      stateManager.addChat(sessionUri.toString(), peerChatUri.toString());
      const customization = {
        type: CustomizationType.Plugin,
        id: customizationId("file:///peer-plugin"),
        uri: "file:///peer-plugin",
        name: "Peer Plugin",
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
        load: { kind: CustomizationLoadStatus.Loaded }
      };
      const handleAgentSignal = Reflect.get(Object.getPrototypeOf(sideEffects), "_handleAgentSignal");
      assert.throws(() => handleAgentSignal.call(sideEffects, agent, {
        kind: "action",
        resource: peerChatUri,
        action: { type: ActionType.SessionCustomizationUpdated, customization }
      }), /must not be dispatched on chat channel/);
      assert.strictEqual(stateManager.getSessionState(sessionUri.toString())?.customizations, void 0);
    });
    test("clears client customizations when activeClient has no customizations", () => {
      setupSession();
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const action = {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "test-client",
          tools: []
        }
      };
      sideEffects.handleAction(sessionUri.toString(), action);
      assert.deepStrictEqual(agent.setClientCustomizationsCalls, [{
        clientId: "test-client",
        customizations: []
      }]);
      const customizationActions = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged);
      assert.strictEqual(customizationActions.length, 1);
      assert.deepStrictEqual(customizationActions[0].action, {
        type: ActionType.SessionCustomizationsChanged,
        customizations: []
      });
    });
    test("removes the active client when it is removed", () => {
      setupSession();
      const peerChatUri = URI.parse(buildChatUri(sessionUri, "peer-removal"));
      stateManager.addChat(sessionUri.toString(), peerChatUri.toString());
      const action = {
        type: ActionType.SessionActiveClientRemoved,
        clientId: "test-client"
      };
      sideEffects.handleAction(sessionUri.toString(), action);
      assert.deepStrictEqual(agent.removeActiveClientCalls.map((call) => ({
        chat: call.chat.toString(),
        clientId: call.clientId
      })), [
        { chat: defaultChatUri, clientId: "test-client" },
        { chat: peerChatUri.toString(), clientId: "test-client" }
      ]);
    });
    test("Agent Host owns the exact chat fan-out and supplies host customizations", () => {
      setupSession();
      const hostCustomization = {
        type: CustomizationType.Plugin,
        id: customizationId("file:///host-plugin"),
        uri: "file:///host-plugin",
        name: "Host Plugin",
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
        load: { kind: CustomizationLoadStatus.Loaded }
      };
      stateManager.setSessionCustomizations(sessionUri.toString(), [hostCustomization]);
      const peerChatUri = URI.parse(buildChatUri(sessionUri, "peer-fanout"));
      stateManager.addChat(sessionUri.toString(), peerChatUri.toString());
      sideEffects.handleAction(sessionUri.toString(), {
        type: ActionType.SessionActiveClientSet,
        activeClient: { clientId: "test-client", tools: [] }
      });
      assert.deepStrictEqual(agent.activeClientCalls.map((call) => ({
        chat: call.chat.toString(),
        configurationResource: URI.isUri(call.context) ? call.context.toString() : call.context.configurationResource.toString(),
        clientId: call.clientId,
        hostCustomizations: call.hostCustomizations?.map((c) => c.id)
      })), [
        {
          chat: defaultChatUri,
          configurationResource: sessionUri.toString(),
          clientId: "test-client",
          hostCustomizations: [hostCustomization.id]
        },
        {
          chat: peerChatUri.toString(),
          configurationResource: sessionUri.toString(),
          clientId: "test-client",
          hostCustomizations: [hostCustomization.id]
        }
      ]);
    });
    test("skips the fan-out when the host has no state for the session", () => {
      const unknownSession = URI.parse("mock:/never-created");
      sideEffects.handleAction(unknownSession.toString(), {
        type: ActionType.SessionActiveClientSet,
        activeClient: { clientId: "test-client", tools: [] }
      });
      assert.deepStrictEqual(agent.activeClientCalls, []);
    });
    test("re-fans-out every active client when a chat joins the catalog", () => {
      setupSession();
      const activeClientAction = {
        type: ActionType.SessionActiveClientSet,
        activeClient: { clientId: "test-client", tools: [] }
      };
      stateManager.dispatchClientAction(sessionUri.toString(), activeClientAction, { clientId: "test-client", clientSeq: 1 });
      sideEffects.handleAction(sessionUri.toString(), activeClientAction);
      const peerChatUri = buildChatUri(sessionUri, "peer-added");
      stateManager.addChat(sessionUri.toString(), peerChatUri);
      assert.deepStrictEqual(agent.activeClientCalls.map((call) => ({
        clientId: call.clientId,
        chat: call.chat.toString()
      })), [
        { clientId: "test-client", chat: defaultChatUri },
        { clientId: "test-client", chat: defaultChatUri },
        { clientId: "test-client", chat: peerChatUri }
      ]);
    });
  });
  suite("handleAction - root/configChanged", () => {
    test("republishes agent and session customizations for existing sessions", async () => {
      setupSession("file:///workspace");
      const customization = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", load: { kind: CustomizationLoadStatus.Loaded } };
      agent.customizations = [customization];
      agent.getSessionCustomizations = async () => [customization];
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const action = {
        type: ActionType.RootConfigChanged,
        config: { customizations: [customization] }
      };
      stateManager.dispatchServerAction(sessionUri.toString(), action);
      sideEffects.handleAction(sessionUri.toString(), action);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const agentInfoAction = envelopes.filter((e) => e.action.type === ActionType.RootAgentsChanged).at(-1);
      assert.ok(agentInfoAction && hasKey(agentInfoAction.action, { agents: true }));
      assert.deepStrictEqual(agentInfoAction.action.agents[0]?.customizations, [customization]);
      const sessionCustomizationAction = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged).at(-1);
      assert.ok(sessionCustomizationAction && hasKey(sessionCustomizationAction.action, { customizations: true }));
      assert.deepStrictEqual(sessionCustomizationAction.action.customizations, [customization]);
    });
    test("updates telemetry level from root config", () => {
      setupSession();
      const action = {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.NONE) }
      };
      sideEffects.handleAction(sessionUri.toString(), action);
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User } }
      });
      assert.deepStrictEqual(telemetryService.events, []);
    });
  });
  suite("onDidCustomizationsChange", () => {
    test("republishes agent info and session customizations when agent fires onDidCustomizationsChange", async () => {
      disposables.add(sideEffects.registerProgressListener(agent));
      setupSession("file:///workspace");
      const customization = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-b"), uri: "file:///plugin-b", name: "Plugin B", load: { kind: CustomizationLoadStatus.Loaded } };
      agent.customizations = [customization];
      agent.getSessionCustomizations = async () => [customization];
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireCustomizationsChange();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const agentInfoAction = envelopes.find((e) => e.action.type === ActionType.RootAgentsChanged);
      assert.ok(agentInfoAction && hasKey(agentInfoAction.action, { agents: true }));
      assert.deepStrictEqual(agentInfoAction.action.agents[0]?.customizations, [customization]);
      const sessionCustomizationAction = envelopes.find((e) => e.action.type === ActionType.SessionCustomizationsChanged);
      assert.ok(sessionCustomizationAction && hasKey(sessionCustomizationAction.action, { customizations: true }));
      assert.deepStrictEqual(sessionCustomizationAction.action.customizations, [customization]);
    });
    test("does not republish when registerProgressListener is disposed", async () => {
      const listener = sideEffects.registerProgressListener(agent);
      setupSession("file:///workspace");
      agent.customizations = [{ type: CustomizationType.Plugin, id: customizationId("file:///plugin-c"), uri: "file:///plugin-c", name: "Plugin C" }];
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      listener.dispose();
      agent.fireCustomizationsChange();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.strictEqual(
        envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged).length,
        0,
        "should not republish session customizations after listener disposed"
      );
    });
  });
  suite("handleAction \u2014 session/toolCallConfirmed", () => {
    test("routes confirmation to correct agent via _toolCallAgents", () => {
      setupSession();
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-conf-1",
          toolName: "read",
          displayName: "Read File",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-conf-1",
          invocationMessage: "Reading file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-conf-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Read file.txt",
          toolInput: void 0,
          confirmationTitle: "Read file.txt",
          edits: void 0
        },
        permissionKind: void 0,
        permissionPath: void 0
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-conf-1",
        approved: true,
        confirmed: "user-action"
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-conf-1", approved: true }
      ]);
    });
    test("handles denial of tool call", () => {
      setupSession();
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-deny-1",
          toolName: "shell",
          displayName: "Shell",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-deny-1",
          invocationMessage: "Running command",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-deny-1",
        approved: false,
        reason: "denied"
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-deny-1", approved: false }
      ]);
    });
  });
  suite("tool_ready dispatches progress actions to advance tool call state", () => {
    test("tool_ready for a non-permission tool dispatches ChatToolCallReady and advances state from Streaming to Running", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-ready-1",
          toolName: "runTask",
          displayName: "Run Task",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      const stateAfterStart = stateManager.getSessionState(sessionUri.toString());
      const partAfterStart = stateAfterStart?.activeTurn?.responseParts[0];
      assert.strictEqual(partAfterStart?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(partAfterStart?.kind === ResponsePartKind.ToolCall ? partAfterStart.toolCall.status : void 0, ToolCallStatus.Streaming);
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-ready-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run Task",
          toolInput: '{"task":"build"}',
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: void 0,
        permissionPath: void 0
      });
      const stateAfterReady = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const p = s?.activeTurn?.responseParts[0];
        return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.Running ? s : void 0;
      });
      const partAfterReady = stateAfterReady?.activeTurn?.responseParts[0];
      assert.strictEqual(partAfterReady?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(
        partAfterReady?.kind === ResponsePartKind.ToolCall ? partAfterReady.toolCall.status : void 0,
        ToolCallStatus.Running,
        "tool call should advance from Streaming to Running after tool_ready"
      );
    });
    test("tool_ready for a permission-gated tool dispatches ChatToolCallReady and advances state to PendingConfirmation", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-perm-1",
          toolName: "write",
          displayName: "Write File",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-perm-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: '{"path":".env"}',
          confirmationTitle: "Write .env",
          edits: void 0
        },
        permissionKind: void 0,
        permissionPath: void 0
      });
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const p = s?.activeTurn?.responseParts[0];
        return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation ? s : void 0;
      });
      const part = state?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(
        part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0,
        ToolCallStatus.PendingConfirmation,
        "tool call should advance to PendingConfirmation for permission-gated tool_ready"
      );
    });
    test("tool_ready marks autoApproveRuleResolvable only for eligible shell confirmations", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      await sideEffects.initialize();
      const cases = [
        ["tc-shell-rules-1", { requestSandboxBypass: false, shellLanguage: "bash" }],
        ["tc-shell-rules-2", { requestSandboxBypass: true, shellLanguage: "bash" }],
        ["tc-shell-rules-3", { managedApprovalRequired: true, shellLanguage: "bash" }]
      ];
      for (const [toolCallId, signalOverrides] of cases) {
        agent.fireProgress({
          kind: "action",
          resource: URI.parse(defaultChatUri),
          action: {
            type: ActionType.ChatToolCallStart,
            turnId: "turn-1",
            toolCallId,
            toolName: "shell",
            displayName: "Shell",
            contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
            _meta: { toolKind: void 0, language: void 0 }
          }
        });
        agent.fireProgress({
          kind: "pending_confirmation",
          chat: URI.parse(defaultChatUri),
          state: {
            status: ToolCallStatus.PendingConfirmation,
            toolCallId,
            toolName: "",
            displayName: "",
            invocationMessage: "Run command",
            toolInput: "foo --bar",
            confirmationTitle: "Run in terminal?",
            edits: void 0
          },
          permissionKind: "shell",
          permissionPath: void 0,
          ...signalOverrides
        });
      }
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const parts = s?.activeTurn?.responseParts;
        return parts?.length === cases.length && parts.every((p) => p.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation) ? s : void 0;
      });
      assert.deepStrictEqual(
        state.activeTurn?.responseParts.map((p) => p.kind === ResponsePartKind.ToolCall ? p.toolCall._meta?.["autoApproveRuleResolvable"] : void 0),
        [true, void 0, void 0],
        "only the rule-resolvable shell confirmation is marked; sandbox-bypass and managed confirmations are not"
      );
    });
    test("tool_ready forwards the signal shell language into shell approval", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      await sideEffects.initialize();
      const cases = [
        ["tc-shell-lang-1", "powershell"],
        ["tc-shell-lang-2", "bash"],
        ["tc-shell-lang-3", void 0]
      ];
      for (const [toolCallId, shellLanguage] of cases) {
        agent.fireProgress({
          kind: "action",
          resource: URI.parse(defaultChatUri),
          action: {
            type: ActionType.ChatToolCallStart,
            turnId: "turn-1",
            toolCallId,
            toolName: "shell",
            displayName: "Shell",
            contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
            _meta: { toolKind: void 0, language: void 0 }
          }
        });
        agent.fireProgress({
          kind: "pending_confirmation",
          chat: URI.parse(defaultChatUri),
          state: {
            status: ToolCallStatus.PendingConfirmation,
            toolCallId,
            toolName: "",
            displayName: "",
            invocationMessage: "Run command",
            toolInput: "get-childitem",
            confirmationTitle: "Run in terminal?",
            edits: void 0
          },
          permissionKind: "shell",
          permissionPath: void 0,
          shellLanguage
        });
      }
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const parts = s?.activeTurn?.responseParts;
        return parts?.length === cases.length && parts.every((p) => p.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation) ? s : void 0;
      });
      assert.deepStrictEqual(
        state.activeTurn?.responseParts.map((p) => p.kind === ResponsePartKind.ToolCall ? [p.toolCall._meta?.["autoApproveBySetting"], p.toolCall._meta?.["autoApproveRuleResolvable"]] : void 0),
        [[true, void 0], [void 0, true], [void 0, void 0]],
        "powershell auto-approves; bash stays rule-resolvable; missing language is neither"
      );
    });
    test("tool_ready is dropped when the tool completes while permission lookup is pending", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-stale-ready",
          toolName: "vscodeAPI",
          displayName: "Get VS Code API References",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "disconnected-client" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-stale-ready",
          toolName: "vscodeAPI",
          displayName: "Get VS Code API References",
          invocationMessage: "Get VS Code API References",
          toolInput: '{"query":"test"}',
          confirmationTitle: "Allow tool call?",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-stale-ready",
        invocationMessage: "Get VS Code API References",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-stale-ready",
        result: {
          success: false,
          pastTenseMessage: "Get VS Code API References failed",
          error: { message: "Client disconnected" }
        }
      });
      await Promise.resolve();
      const toolCall = stateManager.getSessionState(sessionUri.toString())?.activeTurn?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === "tc-stale-ready");
      assert.deepStrictEqual({
        status: toolCall?.kind === ResponsePartKind.ToolCall ? toolCall.toolCall.status : void 0,
        readyActions: envelopes.filter((e) => e.action.type === ActionType.ChatToolCallReady).length
      }, {
        status: ToolCallStatus.Completed,
        readyActions: 1
      });
    });
    test("tool_ready for an additional chat is emitted on that chat channel", async () => {
      setupSession();
      const chatUri = buildChatUri(sessionUri.toString(), "peer");
      stateManager.addChat(sessionUri.toString(), chatUri);
      stateManager.setSessionConfig(sessionUri.toString(), { schema: { type: "object", properties: {} }, values: { [SessionConfigKey.Permissions]: { allow: [], deny: [] } } });
      startTurn("turn-peer", chatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(chatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-peer",
          toolCallId: "tc-peer-perm",
          toolName: "write",
          displayName: "Write File",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(chatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-peer-perm",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: '{"path":".env"}',
          confirmationTitle: "Write .env",
          edits: void 0
        },
        permissionKind: void 0,
        permissionPath: void 0
      });
      const chatState = await waitForState(stateManager, () => {
        const s = stateManager.getChatState(chatUri);
        const p = s?.activeTurn?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === "tc-peer-perm");
        return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation ? s : void 0;
      });
      const defaultState = stateManager.getSessionState(sessionUri.toString());
      const defaultPart = defaultState?.activeTurn?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === "tc-peer-perm");
      const peerPart = chatState.activeTurn?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === "tc-peer-perm");
      const readyEnvelope = envelopes.find((e) => e.action.type === ActionType.ChatToolCallReady && hasKey(e.action, { toolCallId: true }) && e.action.toolCallId === "tc-peer-perm");
      assert.deepStrictEqual({
        peerToolStatus: peerPart?.kind === ResponsePartKind.ToolCall ? peerPart.toolCall.status : void 0,
        defaultHasTool: defaultPart !== void 0,
        readyEnvelopeChannel: readyEnvelope?.channel
      }, {
        peerToolStatus: ToolCallStatus.PendingConfirmation,
        defaultHasTool: false,
        readyEnvelopeChannel: chatUri
      });
      sideEffects.handleAction(chatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-peer",
        toolCallId: "tc-peer-perm",
        approved: true,
        confirmed: "user-action",
        selectedOptionId: "allow-session"
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-peer-perm", approved: true }
      ]);
      assert.deepStrictEqual(stateManager.getSessionState(sessionUri.toString())?.config?.values[SessionConfigKey.Permissions], { allow: ["write"], deny: [] });
    });
    test("pending_confirmation for a tool inside a subagent routes to the subagent session", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-parent",
          toolName: "runSubagent",
          displayName: "Run Subagent",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-parent",
          invocationMessage: "Delegating...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-inner",
          toolName: "problems",
          displayName: "Problems",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-inner",
          toolName: "problems",
          displayName: "Problems",
          invocationMessage: "Get problems",
          toolInput: "{}",
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-parent");
      const subState = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(subagentUri);
        const inner = s?.activeTurn?.responseParts.find(
          (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-inner"
        );
        return inner?.kind === ResponsePartKind.ToolCall && inner.toolCall.status === ToolCallStatus.Running ? s : void 0;
      });
      const innerPart = subState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-inner"
      );
      assert.ok(innerPart, "inner client tool call should exist on subagent session");
      assert.strictEqual(
        innerPart.kind === ResponsePartKind.ToolCall ? innerPart.toolCall.status : void 0,
        ToolCallStatus.Running,
        "inner client tool call should advance to Running after pending_confirmation"
      );
      const parentState = stateManager.getSessionState(sessionUri.toString());
      const parentInner = parentState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-inner"
      );
      assert.strictEqual(parentInner, void 0, "parent session must not contain the inner tool call");
    });
    test("pending_confirmation without an active turn still dispatches (does not hang)", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-noop",
          toolName: "view",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-noop",
          result: { success: true, pastTenseMessage: "Read file" }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      assert.strictEqual(stateManager.getActiveTurnId(sessionUri.toString()), void 0);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "",
          toolCallId: "tc-orphan",
          toolName: "view",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-orphan",
          toolName: "view",
          displayName: "Read",
          invocationMessage: "Reading file.ts",
          toolInput: '{"path":"file.ts"}',
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "read",
        permissionPath: "/workspace/file.ts"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-orphan", approved: true }
      ], "pending_confirmation without active turn should still be processed and auto-approved");
    });
  });
  suite("handleAction \u2014 chat/toolCallComplete routing", () => {
    test("forwards session + default chat URI for a default-chat completion", () => {
      setupSession();
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-default",
        result: { success: true, pastTenseMessage: "done" }
      });
      assert.deepStrictEqual(
        agent.clientToolCallCompleteCalls.map((c) => ({ chat: c.chat.toString(), toolCallId: c.toolCallId })),
        [{ chat: defaultChatUri, toolCallId: "tc-default" }]
      );
    });
    test("forwards the exact additional chat URI for a completion", () => {
      setupSession();
      const peerChatUri = buildChatUri(sessionUri.toString(), "peer-1");
      sideEffects.handleAction(peerChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-peer",
        result: { success: true, pastTenseMessage: "done" }
      });
      assert.deepStrictEqual(
        agent.clientToolCallCompleteCalls.map((c) => ({ chat: c.chat.toString(), toolCallId: c.toolCallId })),
        [{ chat: peerChatUri, toolCallId: "tc-peer" }]
      );
    });
    test("forwards parent peer chat URI for a subagent-chat completion", () => {
      setupSession();
      const peerChatUri = buildChatUri(sessionUri.toString(), "peer-subagent-parent");
      stateManager.addChat(sessionUri.toString(), peerChatUri);
      startTurn("turn-peer", peerChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(peerChatUri),
        toolCallId: "tc-parent",
        agentName: "explore",
        agentDisplayName: "Explore"
      });
      const subagentChatUri = buildSubagentChatUri(sessionUri.toString(), "tc-parent");
      sideEffects.handleAction(subagentChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-subagent",
        toolCallId: "tc-inner",
        result: { success: true, pastTenseMessage: "done" }
      });
      assert.deepStrictEqual(
        agent.clientToolCallCompleteCalls.map((c) => ({
          chat: c.chat.toString(),
          toolCallId: c.toolCallId,
          // `context` describes the *addressed* chat, so a provider can
          // recover the spawning chat + tool call from it. Stamping the
          // routing target here instead would make that unresolvable.
          contextResource: c.context?.resource.toString(),
          parent: resolveSubagentChatParent(c.context)?.chat.toString(),
          parentToolCallId: resolveSubagentChatParent(c.context)?.toolCallId
        })),
        [{
          chat: peerChatUri,
          toolCallId: "tc-inner",
          contextResource: subagentChatUri,
          parent: peerChatUri,
          parentToolCallId: "tc-parent"
        }]
      );
    });
  });
  suite("session config auto-approve", () => {
    function setupSessionWithConfig(autoApproveLevel) {
      setupSession(URI.file("/workspace").toString());
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: {
          type: "object",
          properties: {
            autoApprove: {
              type: "string",
              title: "Approvals",
              enum: ["default", "autoApprove", "autopilot"],
              default: "default",
              sessionMutable: true
            }
          }
        },
        values: { autoApprove: autoApproveLevel }
      });
    }
    test("auto-approves all writes when autoApprove is set to bypass", async () => {
      setupSessionWithConfig("autoApprove");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-bypass-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-bypass-1",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-bypass-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.env"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-bypass-1", approved: true }
      ]);
    });
    test("auto-approves shell commands when autoApprove is set to bypass", async () => {
      setupSessionWithConfig("autoApprove");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-bypass-shell-1",
          toolName: "shell",
          displayName: "Shell",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-bypass-shell-1",
          invocationMessage: "Run rm -rf /",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-bypass-shell-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run rm -rf /",
          toolInput: "rm -rf /",
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "shell",
        permissionPath: void 0
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-bypass-shell-1", approved: true }
      ]);
    });
    test("does NOT auto-approve a shell command that opted out of the sandbox, even in bypass mode", () => {
      setupSessionWithConfig("autoApprove");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-sandboxbypass-1",
          toolName: "shell",
          displayName: "Shell",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-sandboxbypass-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run cat ~/something.txt",
          toolInput: "cat ~/something.txt",
          confirmationTitle: "Run command",
          edits: void 0
        },
        permissionKind: "shell",
        permissionPath: void 0,
        requestSandboxBypass: true
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, []);
    });
    test("marks pending client tool approval for client-side auto-approval in bypass mode", async () => {
      setupSessionWithConfig("autoApprove");
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-client-approve-1",
          toolName: "runTask",
          displayName: "Run Task",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
          _meta: { toolKind: "terminal" }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-client-approve-1",
          toolName: "runTask",
          displayName: "Run Task",
          invocationMessage: "Run task",
          toolInput: '{"task":"build"}',
          confirmationTitle: "Run task",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const p = s?.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === "tc-client-approve-1");
        return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation ? s : void 0;
      });
      const part = state?.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === "tc-client-approve-1");
      assert.ok(part?.kind === ResponsePartKind.ToolCall);
      assert.deepStrictEqual({
        status: part.toolCall.status,
        meta: part.toolCall._meta,
        permissionCalls: agent.respondToPermissionCalls
      }, {
        status: ToolCallStatus.PendingConfirmation,
        meta: { toolKind: "terminal", autoApproveBySetting: true },
        permissionCalls: []
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-client-approve-1",
        approved: true,
        confirmed: ToolCallConfirmationReason.Setting
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-client-approve-1", approved: true }
      ]);
    });
    test("does NOT auto-approve when autoApprove is default", () => {
      setupSessionWithConfig("default");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-default-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-default-1",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-default-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.env"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
    });
    test("respects mid-session config change via SessionConfigChanged", async () => {
      setupSessionWithConfig("default");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      stateManager.dispatchServerAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove" }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-mid-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-mid-1",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-mid-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.env"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-mid-1", approved: true }
      ]);
    });
  });
  suite("edit auto-approve", () => {
    test("auto-approves writes to regular source files", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-auto-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-auto-1",
          invocationMessage: "Write file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-auto-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write src/app.ts",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/src/app.ts"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-auto-1", approved: true }
      ]);
    });
    test("blocks writes to .env files", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-env-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-env-1",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-env-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmationTitle: "Write .env",
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.env"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
      const readyAction = envelopes.find((e) => e.action.type === ActionType.ChatToolCallReady);
      assert.ok(readyAction, "should dispatch tool_ready for blocked write");
    });
    test("blocks writes to package.json", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-pkg-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-pkg-1",
          invocationMessage: "Write package.json",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-pkg-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write package.json",
          toolInput: void 0,
          confirmationTitle: "Write package.json",
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/package.json"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
    });
    test("blocks writes to .lock files", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-lock-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-lock-1",
          invocationMessage: "Write yarn.lock",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-lock-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write yarn.lock",
          toolInput: void 0,
          confirmationTitle: "Write yarn.lock",
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/yarn.lock"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
    });
    test("blocks writes to .git directory", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-git-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-git-1",
          invocationMessage: "Write .git/config",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-git-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .git/config",
          toolInput: void 0,
          confirmationTitle: "Write .git/config",
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.git/config"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
    });
  });
  suite("read auto-approve", () => {
    test("auto-approves reads inside working directory", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-read-1",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-read-1",
          invocationMessage: "Read file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-read-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Read src/app.ts",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "read",
        permissionPath: "/workspace/src/app.ts"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-read-1", approved: true }
      ]);
    });
    test("does not auto-approve reads outside working directory", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-read-2",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-read-2",
          invocationMessage: "Read file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-read-2",
          toolName: "",
          displayName: "",
          invocationMessage: "Read /etc/passwd",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "read",
        permissionPath: "/etc/passwd"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
      const readyAction = envelopes.find((e) => e.action.type === ActionType.ChatToolCallReady);
      assert.ok(readyAction, "should dispatch tool_ready for read outside working directory");
    });
  });
  suite("title persistence", () => {
    let sessionDb;
    setup(async () => {
      sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
    });
    async function waitForMetadata(key) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const value = await sessionDb.getMetadata(key);
        if (value !== void 0) {
          return value;
        }
        await timeout(10);
      }
      throw new Error(`Session metadata '${key}' was not persisted`);
    }
    teardown(async () => {
      await sessionDb.close();
    });
    test("SessionTitleChanged persists to the database", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localSideEffects = createTestSideEffects(disposables, localStateManager, {
        getAgent: () => localAgent,
        agents: observableValue("agents", [localAgent]),
        sessionDataService,
        onTurnComplete: () => {
        }
      });
      localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Initial",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      localSideEffects.handleAction(sessionUri.toString(), {
        type: ActionType.SessionTitleChanged,
        title: "Custom Title"
      });
      assert.strictEqual(await waitForMetadata("customTitle"), "Custom Title");
    });
    test("handleListSessions returns persisted custom title", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      await localService.createSession({ provider: localAgent.id });
      await sessionDb.setMetadata("customTitle", "My Custom Title");
      const sessions = await localService.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.ok(sessions[0].summary);
    });
    test("handleRestoreSession uses persisted custom title", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const session = await createAgentSession(localAgent);
      const sessions = await localAgent.listSessions();
      const sessionResource = sessions[0].session;
      await sessionDb.setMetadata("customTitle", "Restored Title");
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.strictEqual(state.title, "Restored Title");
    });
    test("restore interleaves a persisted local turn after its anchor", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const session = await createAgentSession(localAgent);
      const sessions = await localAgent.listSessions();
      const sessionResource = sessions[0].session;
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "real-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "a-1", content: "Hi", toolRequests: [] }
      ];
      const localTurn = {
        id: "local-1",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "p1", content: "ran" }],
        usage: void 0,
        state: 2
        // TurnState.Complete
      };
      await sessionDb.insertLocalTurn({ turnId: "local-1", chatUri: buildDefaultChatUri(sessionResource.toString()), anchorTurnId: "real-1", seq: 1, payload: JSON.stringify(localTurn) });
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.deepStrictEqual(state?.turns.map((t) => t.id), ["real-1", "local-1"]);
    });
    test("SessionConfigChanged persists merged config values to the database", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localSideEffects = createTestSideEffects(disposables, localStateManager, {
        getAgent: () => localAgent,
        agents: observableValue("agents", [localAgent]),
        sessionDataService,
        onTurnComplete: () => {
        }
      });
      const session = localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Initial",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      session.config = { schema: { type: "object", properties: {} }, values: { autoApprove: "default" } };
      localStateManager.dispatchClientAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove" }
      }, { clientId: "test-client", clientSeq: 1 });
      localSideEffects.handleAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove" }
      });
      const persisted = await waitForMetadata("configValues");
      assert.deepStrictEqual(JSON.parse(persisted), { autoApprove: "autoApprove" });
    });
    test("server-dispatched SessionConfigChanged persists merged config values to the database", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      createTestSideEffects(disposables, localStateManager, {
        getAgent: () => localAgent,
        agents: observableValue("agents", [localAgent]),
        sessionDataService,
        onTurnComplete: () => {
        }
      });
      const session = localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Initial",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      session.config = { schema: { type: "object", properties: {} }, values: { mode: "plan", autoApprove: "default" } };
      localStateManager.dispatchServerAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { mode: "interactive" }
      });
      const persisted = await waitForMetadata("configValues");
      assert.deepStrictEqual(JSON.parse(persisted), { mode: "interactive", autoApprove: "default" });
    });
    test("SessionConfigChanged emits agentHost.executionModeChanged for effective mode transitions without duplicate echoes", () => {
      setupSession();
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: platformSessionSchema.toProtocol(),
        values: { mode: "interactive" }
      });
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      stateManager.dispatchClientAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { mode: "plan" }
      }, { clientId: "test-client", clientSeq: 1 }, {
        clientType: AgentHostClientType.EditorWindow,
        connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
        transportKind: AgentHostTransportKind.MessagePort,
        hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
        machineId: "client-machine-id",
        devDeviceId: "client-dev-device-id"
      });
      stateManager.dispatchServerAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { mode: "plan" }
      });
      stateManager.dispatchServerAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { mode: "autopilot" }
      });
      stateManager.dispatchServerAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: {},
        replace: true
      });
      assert.deepStrictEqual(telemetryService.events.filter((event) => event.eventName === "agentHost.executionModeChanged"), [{
        eventName: "agentHost.executionModeChanged",
        data: {
          provider: "mock",
          initiatorClientType: "editor_window",
          initiatorConnectionKind: "remote_extension_host",
          initiatorTransportKind: "message_port",
          hostLaunchKind: "vscode_main_process",
          initiatorMachineId: "client-machine-id",
          initiatorDevDeviceId: "client-dev-device-id",
          agentSessionId: "session-1",
          isSubagentSession: false,
          previousMode: "interactive",
          newMode: "plan",
          turnCount: 1
        }
      }, {
        eventName: "agentHost.executionModeChanged",
        data: {
          provider: "mock",
          agentSessionId: "session-1",
          isSubagentSession: false,
          previousMode: "plan",
          newMode: "autopilot",
          turnCount: 1
        }
      }, {
        eventName: "agentHost.executionModeChanged",
        data: {
          provider: "mock",
          agentSessionId: "session-1",
          isSubagentSession: false,
          previousMode: "autopilot",
          newMode: "interactive",
          turnCount: 1
        }
      }]);
    });
  });
  suite("subagent sessions", () => {
    test("inherits the parent turn client identity for subagent telemetry", () => {
      setupSession();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-client",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action, "test", {
        clientType: AgentHostClientType.EditorWindow,
        connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
        transportKind: AgentHostTransportKind.MessagePort,
        hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
        machineId: "client-machine-id",
        devDeviceId: "client-dev-device-id"
      });
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(defaultChatUri),
        toolCallId: "tc-client",
        agentName: "reviewer",
        agentDisplayName: "Reviewer"
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-client");
      const subagentTurnId = stateManager.getActiveTurnId(subagentUri);
      assert.ok(subagentTurnId);
      agent.fireProgress({ kind: "action", resource: URI.parse(subagentUri), action: { type: ActionType.ChatTurnComplete, turnId: subagentTurnId, duration: 1 } });
      const event = telemetryService.events.find((event2) => event2.eventName === "agentHost.turnCompleted" && event2.data.isSubagentSession === true);
      assert.deepStrictEqual({
        initiatorClientType: event?.data?.initiatorClientType,
        initiatorConnectionKind: event?.data?.initiatorConnectionKind,
        initiatorTransportKind: event?.data?.initiatorTransportKind,
        hostLaunchKind: event?.data?.hostLaunchKind,
        initiatorMachineId: event?.data?.initiatorMachineId,
        initiatorDevDeviceId: event?.data?.initiatorDevDeviceId
      }, {
        initiatorClientType: "editor_window",
        initiatorConnectionKind: "remote_extension_host",
        initiatorTransportKind: "message_port",
        hostLaunchKind: "vscode_main_process",
        initiatorMachineId: "client-machine-id",
        initiatorDevDeviceId: "client-dev-device-id"
      });
    });
    test("subagent_started creates a subagent chat and dispatches content on parent tool call", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-1",
          toolName: "runSubagent",
          displayName: "Run Subagent",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-1",
          invocationMessage: "Delegating task...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(defaultChatUri),
        toolCallId: "tc-1",
        agentName: "code-reviewer",
        agentDisplayName: "Code Reviewer",
        agentDescription: "Reviews code",
        taskPrompt: "Review the auth module for security issues"
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState, "subagent chat should exist");
      const subagentSummary = subState.chats.find((c) => c.resource === subagentUri);
      assert.strictEqual(subagentSummary?.title, "Code Reviewer");
      assert.deepStrictEqual(subagentSummary?.origin, { kind: "tool", chat: defaultChatUri, toolCallId: "tc-1" });
      assert.ok(subState.activeTurn, "subagent chat should have an active turn");
      assert.strictEqual(subState.activeTurn.message.text, "Review the auth module for security issues", "subagent turn should render the spawning tool call prompt as its request");
      const parentState = stateManager.getSessionState(sessionUri.toString());
      assert.ok(parentState?.activeTurn);
      const parentToolCall = parentState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-1"
      );
      assert.ok(parentToolCall);
      if (parentToolCall?.kind === ResponsePartKind.ToolCall && parentToolCall.toolCall.status === ToolCallStatus.Running) {
        assert.ok(parentToolCall.toolCall.content);
        assert.strictEqual(parentToolCall.toolCall.content[0].type, ToolResultContentType.Subagent);
      }
    });
    test("stamps _meta.subagentChatUri onto a subagent-spawning tool call as soon as toolKind is known", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-1",
          toolName: "task",
          displayName: "Task",
          contributor: void 0,
          _meta: { toolKind: "subagent", language: void 0 }
        }
      });
      const expectedUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const parentState = stateManager.getSessionState(sessionUri.toString());
      const toolCall = parentState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-1"
      );
      assert.ok(toolCall?.kind === ResponsePartKind.ToolCall);
      assert.strictEqual(readToolCallMeta(toolCall.toolCall).subagentChatUri, expectedUri);
      assert.strictEqual(stateManager.getSnapshot(expectedUri), void 0);
    });
    test("nested subagent_started routes discovery block and seeds each request prompt via the immediate parent chat (arbitrary depth)", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-l1", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-l1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-l1", agentName: "l1", agentDisplayName: "L1", agentDescription: "first", taskPrompt: "l1 prompt" });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), parentToolCallId: "tc-l1", action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-l2", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), parentToolCallId: "tc-l1", action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-l2", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-l2", agentName: "l2", agentDisplayName: "L2", agentDescription: "second", taskPrompt: "l2 prompt", parentToolCallId: "tc-l1" });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), parentToolCallId: "tc-l2", action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-l3", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), parentToolCallId: "tc-l2", action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-l3", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-l3", agentName: "l3", agentDisplayName: "L3", agentDescription: "third", taskPrompt: "l3 prompt", parentToolCallId: "tc-l2" });
      const l1ChatUri = buildSubagentChatUri(sessionUri.toString(), "tc-l1");
      const l2ChatUri = buildSubagentChatUri(sessionUri.toString(), "tc-l2");
      const l3ChatUri = buildSubagentChatUri(sessionUri.toString(), "tc-l3");
      assert.ok(stateManager.getSessionState(l2ChatUri), "level-2 subagent chat should exist");
      assert.ok(stateManager.getSessionState(l3ChatUri), "level-3 subagent chat should exist");
      const assertDiscoveryBlock = (parentChatUri, spawningToolId, childChatUri, label) => {
        const parentState = stateManager.getSessionState(parentChatUri);
        const spawningTool = parentState?.activeTurn?.responseParts.find((rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === spawningToolId);
        assert.ok(spawningTool && spawningTool.kind === ResponsePartKind.ToolCall, `${spawningToolId} should live in ${label}`);
        const tc = spawningTool.toolCall;
        assert.strictEqual(tc.status, ToolCallStatus.Running, `${spawningToolId} should be running in ${label}`);
        if (tc.status !== ToolCallStatus.Running) {
          return;
        }
        const block = tc.content?.find((c) => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
        assert.ok(block, `the discovery block for ${spawningToolId} must land on ${label}`);
        assert.strictEqual(block.resource, childChatUri);
      };
      assertDiscoveryBlock(l1ChatUri, "tc-l2", l2ChatUri, "the level-1 chat");
      assertDiscoveryBlock(l2ChatUri, "tc-l3", l3ChatUri, "the level-2 chat");
      assert.deepStrictEqual(
        [l1ChatUri, l2ChatUri, l3ChatUri].map((uri) => stateManager.getSessionState(uri)?.activeTurn?.message.text),
        ["l1 prompt", "l2 prompt", "l3 prompt"]
      );
      const defaultState = stateManager.getSessionState(sessionUri.toString());
      const l2ToolInDefault = defaultState?.activeTurn?.responseParts.find((rp) => rp.kind === ResponsePartKind.ToolCall && (rp.toolCall.toolCallId === "tc-l2" || rp.toolCall.toolCallId === "tc-l3"));
      assert.strictEqual(l2ToolInDefault, void 0, "nested spawning tools must not appear in the top-level chat");
    });
    test("events with parentToolCallId route to subagent session", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Run Subagent", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-tc-1",
          toolName: "readFile",
          displayName: "Read File",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-tc-1",
          invocationMessage: "Reading file...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState?.activeTurn);
      const innerTool = subState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-tc-1"
      );
      assert.ok(innerTool, "inner tool call should be in subagent chat");
      const parentState = stateManager.getSessionState(sessionUri.toString());
      const parentInnerTool = parentState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-tc-1"
      );
      assert.strictEqual(parentInnerTool, void 0, "inner tool call should NOT be in parent session");
    });
    test("completeSubagentSession clears pending buffered events when subagent never started", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Run Subagent", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-1",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-1",
          invocationMessage: "Reading...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-1",
          result: { success: false, pastTenseMessage: "Failed" }
        }
      });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState, "subagent session should still be created");
      const innerTool = subState.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-1"
      );
      assert.strictEqual(innerTool, void 0, "stale buffered inner tool call must not be replayed");
    });
    test("subagent_completed signal completes the subagent turn", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Run Subagent", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-1",
          result: { success: true, pastTenseMessage: "Started in background" }
        }
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      let subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState);
      assert.ok(subState.activeTurn, "subagent turn should still be active after parent tool completes");
      agent.fireProgress({ kind: "subagent_completed", chat: URI.parse(defaultChatUri), toolCallId: "tc-1" });
      subState = stateManager.getSessionState(subagentUri);
      assert.strictEqual(subState.activeTurn, void 0, "subagent turn should be completed");
      assert.strictEqual(subState.turns.length, 1);
      agent.fireProgress({
        kind: "subagent_resumed",
        chat: URI.parse(defaultChatUri),
        toolCallId: "tc-1",
        message: { text: "Follow up", origin: { kind: MessageKind.User } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatResponsePart,
          turnId: "parent-turn",
          part: { kind: ResponsePartKind.Markdown, id: "follow-up-part", content: "Follow-up response" }
        }
      });
      subState = stateManager.getSessionState(subagentUri);
      assert.deepStrictEqual({
        message: subState?.activeTurn?.message.text,
        response: subState?.activeTurn?.responseParts[0],
        completedTurns: subState?.turns.length
      }, {
        message: "Follow up",
        response: { kind: ResponsePartKind.Markdown, id: "follow-up-part", content: "Follow-up response" },
        completedTurns: 1
      });
    });
    test("permission requests for inactive and unroutable subagents are denied", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-inactive", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({ kind: "subagent_completed", chat: URI.parse(defaultChatUri), toolCallId: "tc-inactive" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-starting",
        action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-starting-permission", toolName: "shell", displayName: "Shell" }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        parentToolCallId: "tc-starting",
        state: { status: ToolCallStatus.PendingConfirmation, toolCallId: "tc-starting-permission", toolName: "shell", displayName: "Shell", invocationMessage: "Run command" }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        parentToolCallId: "tc-inactive",
        state: { status: ToolCallStatus.PendingConfirmation, toolCallId: "tc-inactive-permission", toolName: "shell", displayName: "Shell", invocationMessage: "Run command" }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        parentToolCallId: "tc-missing",
        state: { status: ToolCallStatus.PendingConfirmation, toolCallId: "tc-missing-permission", toolName: "shell", displayName: "Shell", invocationMessage: "Run command" }
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-inactive-permission", approved: false },
        { requestId: "tc-missing-permission", approved: false }
      ]);
    });
    test("cancelSubagentSessions cancels all subagent chats", () => {
      setupSession();
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Sub 1", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating 1...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "sub1", agentDisplayName: "Sub 1", agentDescription: "First" });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-2", toolName: "runSubagent", displayName: "Sub 2", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-2", invocationMessage: "Delegating 2...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-2", agentName: "sub2", agentDisplayName: "Sub 2", agentDescription: "Second" });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      });
      const sub1 = stateManager.getSessionState(buildSubagentChatUri(sessionUri.toString(), "tc-1"));
      const sub2 = stateManager.getSessionState(buildSubagentChatUri(sessionUri.toString(), "tc-2"));
      assert.strictEqual(sub1?.activeTurn, void 0, "sub1 turn should be cancelled");
      assert.strictEqual(sub2?.activeTurn, void 0, "sub2 turn should be cancelled");
    });
    test("removeSubagentSessions removes all subagent chats from state", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Sub 1", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "sub", agentDisplayName: "Sub", agentDescription: "Has subagent" });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      assert.ok(stateManager.getChatState(subagentUri));
      sideEffects.removeSubagentSessions(sessionUri.toString());
      assert.strictEqual(stateManager.getChatState(subagentUri), void 0, "subagent chat should be removed");
    });
    test("deltas with parentToolCallId route to subagent session", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Run Subagent", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "msg-sub", content: "thinking..." } }
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState?.activeTurn);
      const markdownPart = subState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.Markdown
      );
      assert.ok(markdownPart, "delta should create a markdown part in subagent session");
    });
    test("tool_complete preserves subagent content in completed tool call", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" });
      const runningState = stateManager.getSessionState(sessionUri.toString());
      const runningTool = runningState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-1"
      );
      assert.ok(runningTool?.kind === ResponsePartKind.ToolCall);
      assert.strictEqual(runningTool.toolCall.status, ToolCallStatus.Running);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-1",
          result: { success: true, pastTenseMessage: "Delegated", content: [{ type: ToolResultContentType.Text, text: "Done" }] }
        }
      });
      const completedState = stateManager.getSessionState(sessionUri.toString());
      const completedTool = completedState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-1"
      );
      assert.ok(completedTool?.kind === ResponsePartKind.ToolCall);
      assert.strictEqual(completedTool.toolCall.status, ToolCallStatus.Completed);
      const content = completedTool.toolCall.content ?? [];
      const subagentEntry = content.find((c) => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
      assert.ok(subagentEntry, "Completed tool should preserve subagent content entry");
      const textEntry = content.find((c) => hasKey(c, { type: true }) && c.type === ToolResultContentType.Text);
      assert.ok(textEntry, "Completed tool should also have the SDK result content");
    });
    test("inner tool_start arriving BEFORE subagent_started routes to subagent (not parent)", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-parent", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-parent", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-tc-1",
          toolName: "readFile",
          displayName: "Read File",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-tc-1",
          invocationMessage: "Reading file...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-parent");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState?.activeTurn, "subagent session should exist");
      const innerTool = subState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-tc-1"
      );
      assert.ok(innerTool, "inner tool fired before subagent_started should still end up in the subagent session");
      const parentState = stateManager.getSessionState(sessionUri.toString());
      const parentInnerTool = parentState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-tc-1"
      );
      assert.strictEqual(parentInnerTool, void 0, "inner tool must not leak into parent session");
    });
    test("reads inside parent working directory are auto-approved for tools in subagent sessions", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-parent", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-parent", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-read-1",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-read-1",
          invocationMessage: "Read file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "inner-read-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Read src/app.ts",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "read",
        permissionPath: "/workspace/src/app.ts"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "inner-read-1", approved: true }
      ]);
    });
    test("session-level autoApprove on the parent is inherited by tools in subagent sessions", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: {
          type: "object",
          properties: {
            autoApprove: {
              type: "string",
              title: "Approvals",
              enum: ["default", "autoApprove", "autopilot"],
              default: "default",
              sessionMutable: true
            }
          }
        },
        values: { autoApprove: "autoApprove" }
      });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-parent", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-parent", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-write-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-write-1",
          invocationMessage: "Write file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "inner-write-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write /tmp/foo",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/tmp/foo"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "inner-write-1", approved: true }
      ]);
    });
  });
  suite("session inputNeeded production", () => {
    function sessionInputNeeded() {
      return stateManager.getSessionState(sessionUri.toString())?.inputNeeded ?? [];
    }
    function sessionStatus() {
      return stateManager.getSessionState(sessionUri.toString())?.status;
    }
    test("chat input request mirrors its unresolved response part and is removed on completion", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputRequested,
        request: {
          id: "req-1",
          questions: [{ kind: ChatInputQuestionKind.Text, id: "question-1", message: "Which value?" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputAnswerChanged,
        requestId: "req-1",
        questionId: "question-1",
        answer: {
          state: ChatInputAnswerState.Draft,
          value: { kind: ChatInputAnswerValueKind.Text, value: "draft value" }
        }
      });
      const produced = sessionInputNeeded();
      assert.deepStrictEqual(produced.map((r) => ({
        kind: r.kind,
        chat: r.chat,
        request: r.kind === SessionInputRequestKind.ChatInput ? r.request : void 0
      })), [
        {
          kind: SessionInputRequestKind.ChatInput,
          chat: defaultChatUri,
          request: {
            id: "req-1",
            questions: [{ kind: ChatInputQuestionKind.Text, id: "question-1", message: "Which value?" }],
            answers: {
              "question-1": {
                state: ChatInputAnswerState.Draft,
                value: { kind: ChatInputAnswerValueKind.Text, value: "draft value" }
              }
            }
          }
        }
      ]);
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputCompleted,
        requestId: "req-1",
        response: SessionInputResponseKind.Accept
      });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("accepted ask-user input emits telemetry from synchronized answer state", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputRequested,
        request: {
          id: "req-1",
          purpose: ChatInputRequestPurpose.AskUser,
          questions: [{ kind: ChatInputQuestionKind.Text, id: "question-1", message: "Which value?" }]
        }
      });
      stateManager.dispatchClientAction(defaultChatUri, {
        type: ActionType.ChatInputAnswerChanged,
        requestId: "req-1",
        questionId: "question-1",
        answer: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: "answer" }
        }
      }, { clientId: "test", clientSeq: 2 });
      stateManager.dispatchClientAction(defaultChatUri, {
        type: ActionType.ChatInputCompleted,
        requestId: "req-1",
        response: SessionInputResponseKind.Accept
      }, { clientId: "test", clientSeq: 3 });
      const event = telemetryService.events.find((event2) => event2.eventName === "askQuestionsToolInvoked");
      const data = event?.data;
      assert.deepStrictEqual(event && {
        eventName: event.eventName,
        data: {
          ...data,
          duration: typeof data?.duration
        }
      }, {
        eventName: "askQuestionsToolInvoked",
        data: {
          requestId: "turn-1",
          questionCount: 1,
          answeredCount: 1,
          skippedCount: 0,
          freeTextCount: 1,
          recommendedAvailableCount: 0,
          recommendedSelectedCount: 0,
          duration: "number",
          provider: agent.id,
          agentSessionId: AgentSession.id(sessionUri),
          isSubagentSession: false
        }
      });
    });
    test("chat truncation clears pending ask-user telemetry", () => {
      setupSession();
      startTurn("turn-1");
      const request = {
        id: "req-1",
        purpose: ChatInputRequestPurpose.AskUser,
        questions: [{ kind: ChatInputQuestionKind.Text, id: "question-1", message: "Which value?" }]
      };
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputRequested,
        request
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTruncated
      });
      startTurn("turn-2");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputRequested,
        request
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputCompleted,
        requestId: request.id,
        response: SessionInputResponseKind.Accept
      });
      const events = telemetryService.events.filter((event) => event.eventName === "askQuestionsToolInvoked");
      assert.deepStrictEqual(events.map((event) => event.data.requestId), ["turn-2"]);
    });
    test("chat input request without an active turn is not mirrored", () => {
      setupSession();
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputRequested,
        request: { id: "req-1", questions: [] }
      });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("tool confirmation is produced while pending and removed once confirmed", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-1",
        toolName: "write",
        displayName: "Write"
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-1",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      const pending = sessionInputNeeded();
      assert.deepStrictEqual(
        pending.map((r) => ({ kind: r.kind, chat: r.chat, toolCallId: r.kind === SessionInputRequestKind.ToolConfirmation ? r.toolCall.toolCallId : void 0 })),
        [{ kind: SessionInputRequestKind.ToolConfirmation, chat: defaultChatUri, toolCallId: "tc-1" }]
      );
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-1",
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("client tool execution is produced while running and removed once complete", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-client",
        toolName: "toolSearch",
        displayName: "Search for Tools",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-client",
        invocationMessage: "Searching",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const running = sessionInputNeeded();
      assert.deepStrictEqual(
        running.map((r) => ({ kind: r.kind, chat: r.chat, clientId: r.kind === SessionInputRequestKind.ToolClientExecution ? r.clientId : void 0 })),
        [{ kind: SessionInputRequestKind.ToolClientExecution, chat: defaultChatUri, clientId: "client-1" }]
      );
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-client",
        result: { success: true, pastTenseMessage: "Searched" }
      });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("auto-approved tool call still surfaces its client execution without flagging input needed", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-auto",
        toolName: "browser_navigate",
        displayName: "Navigate Browser",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        _meta: { autoApproveBySetting: true }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-auto",
        invocationMessage: "Navigate",
        confirmationTitle: "Navigate",
        _meta: { autoApproveBySetting: true }
      });
      assert.deepStrictEqual(sessionInputNeeded(), [], "no confirmation entry while PendingConfirmation");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-auto",
        approved: true,
        confirmed: ToolCallConfirmationReason.Setting
      });
      assert.deepStrictEqual(
        sessionInputNeeded().map((r) => ({ kind: r.kind, clientId: r.kind === SessionInputRequestKind.ToolClientExecution ? r.clientId : void 0 })),
        [{ kind: SessionInputRequestKind.ToolClientExecution, clientId: "client-1" }]
      );
      assert.strictEqual(sessionStatus(), SessionStatus.InProgress, "auto-approved client execution must not present as input needed");
    });
    test("auto-approved tool still surfaces a genuine result confirmation", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-auto-result",
        toolName: "browser_navigate",
        displayName: "Navigate Browser",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        _meta: { autoApproveBySetting: true }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-auto-result",
        invocationMessage: "Navigate",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-auto-result",
        requiresResultConfirmation: true,
        result: { success: true, pastTenseMessage: "Navigated" }
      });
      assert.deepStrictEqual(
        sessionInputNeeded().map((r) => ({ kind: r.kind, toolCallId: r.kind === SessionInputRequestKind.ToolConfirmation ? r.toolCall.toolCallId : void 0 })),
        [{ kind: SessionInputRequestKind.ToolConfirmation, toolCallId: "tc-auto-result" }]
      );
    });
    test("MCP tool authentication is produced while auth is required and removed once resolved", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-mcp",
        toolName: "get_file",
        displayName: "Get File",
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-mcp",
        invocationMessage: "Getting file",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallAuthRequired,
        turnId: "turn-1",
        toolCallId: "tc-mcp",
        auth: {
          reason: McpAuthRequiredReason.InsufficientScope,
          resource: {
            resource: "https://mcp.example.com",
            authorization_servers: ["https://auth.example.com"]
          },
          requiredScopes: ["repo"]
        }
      });
      const pending = sessionInputNeeded();
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-mcp",
        result: {
          success: false,
          pastTenseMessage: "Cancelled tool call",
          error: { message: "MCP authentication was cancelled", code: "cancelled" }
        }
      });
      assert.deepStrictEqual({
        pending: pending.map((request) => ({
          kind: request.kind,
          chat: request.chat,
          toolCallId: request.kind === SessionInputRequestKind.ToolAuthentication ? request.toolCall.toolCallId : void 0
        })),
        resolved: sessionInputNeeded()
      }, {
        pending: [{
          kind: SessionInputRequestKind.ToolAuthentication,
          chat: defaultChatUri,
          toolCallId: "tc-mcp"
        }],
        resolved: []
      });
    });
    test("ending the turn clears the chat's outstanding requests", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputRequested,
        request: { id: "req-1", questions: [] }
      });
      assert.strictEqual(sessionInputNeeded().length, 1);
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("a blocker inside a subagent is produced against the subagent chat", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-parent", toolName: "task", displayName: "Delegate Task" }
      });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-inner", toolName: "write", displayName: "Write" }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-inner", invocationMessage: "Write file", confirmationTitle: "Write file" }
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-parent");
      const produced = await waitForState(stateManager, () => {
        const entry = sessionInputNeeded().find((r) => r.kind === SessionInputRequestKind.ToolConfirmation);
        return entry?.kind === SessionInputRequestKind.ToolConfirmation ? entry : void 0;
      });
      assert.deepStrictEqual({ chat: produced.chat, toolCallId: produced.toolCall.toolCallId }, { chat: subagentUri, toolCallId: "tc-inner" });
    });
  });
  suite("session permissions", () => {
    test("tool_ready action includes confirmation options when confirmation is needed", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-perm-1",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-perm-1",
          invocationMessage: "Running custom tool",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-perm-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run custom tool",
          toolInput: void 0,
          confirmationTitle: "Run custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const found = s?.activeTurn?.responseParts.find(
          (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-perm-1"
        );
        return found?.kind === ResponsePartKind.ToolCall && found.toolCall.status === ToolCallStatus.PendingConfirmation ? s : void 0;
      });
      const tc = state.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-perm-1"
      );
      assert.ok(tc && tc.kind === ResponsePartKind.ToolCall, "tool call should exist");
      assert.strictEqual(tc.toolCall.status, ToolCallStatus.PendingConfirmation);
      assert.ok(Array.isArray(tc.toolCall.options), "options should be an array");
      assert.deepStrictEqual(tc.toolCall.options.map((o) => o.id), ["allow-session", "allow-once", "skip"]);
    });
    test("ChatToolCallConfirmed with allow-session adds tool to session permissions", () => {
      setupSession();
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: {}
      });
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-perm-2",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-perm-2",
          invocationMessage: "Running custom tool",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-perm-2",
          toolName: "",
          displayName: "",
          invocationMessage: "Run custom tool",
          toolInput: void 0,
          confirmationTitle: "Run custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-perm-2",
        approved: true,
        confirmed: "user-action",
        selectedOptionId: "allow-session"
      });
      const updatedState = stateManager.getSessionState(sessionUri.toString());
      assert.deepStrictEqual(
        updatedState.config.values.permissions,
        { allow: ["CustomTool"], deny: [] }
      );
    });
    test("subsequent tool_ready for same tool is auto-approved after allow-session permission", async () => {
      setupSession();
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: { permissions: { allow: ["CustomTool"], deny: [] } }
      });
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-perm-3",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-perm-3",
          invocationMessage: "Running custom tool",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-perm-3",
          toolName: "",
          displayName: "",
          invocationMessage: "Run custom tool",
          toolInput: void 0,
          confirmationTitle: "Run custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-perm-3", approved: true }
      ]);
    });
    test("managed approval bypasses global, session, and per-tool auto-approval", async () => {
      setupSession();
      stateManager.dispatchServerAction(ROOT_STATE_URI, {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostGlobalAutoApproveEnabledConfigKey]: true }
      });
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: {
          [SessionConfigKey.AutoApprove]: "autoApprove",
          [SessionConfigKey.Permissions]: { allow: ["CustomTool"], deny: [] }
        }
      });
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-managed",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-managed",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          invocationMessage: "Run managed custom tool",
          toolInput: void 0,
          confirmationTitle: "Run managed custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        managedApprovalRequired: true
      });
      const toolCall = await waitForState(stateManager, () => {
        const part = stateManager.getSessionState(sessionUri.toString())?.activeTurn?.responseParts.find(
          (responsePart) => responsePart.kind === ResponsePartKind.ToolCall && responsePart.toolCall.toolCallId === "tc-managed"
        );
        return part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation ? part.toolCall : void 0;
      });
      assert.deepStrictEqual({
        status: toolCall.status,
        options: toolCall.options?.map((option) => option.id),
        responses: agent.respondToPermissionCalls
      }, {
        status: ToolCallStatus.PendingConfirmation,
        options: ["allow-once", "skip"],
        responses: []
      });
    });
    test("managed approval does not persist allow-session from the client", async () => {
      setupSession();
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: { permissions: { allow: ["ExistingTool"], deny: [] } }
      });
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-managed",
          toolName: "ManagedTool",
          displayName: "Managed Tool",
          contributor: void 0
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-managed",
          toolName: "ManagedTool",
          displayName: "Managed Tool",
          invocationMessage: "Run managed tool",
          toolInput: void 0,
          confirmationTitle: "Run managed tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        managedApprovalRequired: true
      });
      await waitForState(stateManager, () => {
        const part = stateManager.getSessionState(sessionUri.toString())?.activeTurn?.responseParts.find(
          (responsePart) => responsePart.kind === ResponsePartKind.ToolCall && responsePart.toolCall.toolCallId === "tc-managed"
        );
        return part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation;
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-managed",
        approved: true,
        confirmed: "user-action",
        selectedOptionId: "allow-session"
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-managed", approved: true }
      ]);
      assert.deepStrictEqual(
        stateManager.getSessionState(sessionUri.toString())?.config?.values[SessionConfigKey.Permissions],
        { allow: ["ExistingTool"], deny: [] }
      );
    });
    test("subagent tool calls inherit parent session permissions", async () => {
      setupSession();
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: { permissions: { allow: ["CustomTool"], deny: [] } }
      });
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-parent",
          toolName: "task",
          displayName: "Task",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-parent",
          invocationMessage: "Delegating...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(defaultChatUri),
        toolCallId: "tc-parent",
        agentName: "helper",
        agentDisplayName: "Helper",
        agentDescription: "Helps"
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-perm-1",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-perm-1",
          invocationMessage: "Running custom tool",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "inner-perm-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run custom tool",
          toolInput: void 0,
          confirmationTitle: "Run custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "inner-perm-1", approved: true }
      ]);
    });
  });
  suite("changeset forwarders", () => {
    test("stale tool completion does not attribute edits to the active turn", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-2",
        startedAt: "2025-01-01T00:01:00.000Z",
        message: { text: "continue", origin: { kind: MessageKind.User } }
      });
      const changesets = new FakeChangesetService();
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, changesets);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "stale-tool",
          result: {
            success: true,
            pastTenseMessage: "Wrote file",
            content: [{
              type: ToolResultContentType.FileEdit,
              after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
              diff: { added: 1, removed: 0 }
            }]
          }
        }
      });
      assert.deepStrictEqual({
        toolCallEdits: changesets.toolCallEdits,
        activeTurnId: stateManager.getSessionState(defaultChatUri)?.activeTurn?.id
      }, {
        toolCallEdits: [],
        activeTurnId: "turn-2"
      });
    });
    test("post-toolCallComplete edits fire onToolCallEditsApplied once", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      const changesets = new FakeChangesetService();
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, changesets);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-edit-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-edit-1",
          invocationMessage: "Write file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-edit-1",
          result: {
            success: true,
            pastTenseMessage: "wrote",
            content: [{
              type: ToolResultContentType.FileEdit,
              after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
              diff: { added: 1, removed: 0 }
            }]
          }
        }
      });
      assert.deepStrictEqual(changesets.toolCallEdits, [{ session: sessionUri.toString(), turnId: "turn-1" }]);
    });
    test("turn complete fires onTurnComplete once with the right turn id", async () => {
      setupSession();
      startTurn("turn-1");
      const changesets = new FakeChangesetService();
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, changesets);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      await Promise.resolve();
      assert.deepStrictEqual(changesets.turnCompletes, [{ session: sessionUri.toString(), turnId: "turn-1" }]);
    });
    test("turn complete passes the resolved working directories to the checkpoint capture", async () => {
      const workingDirectory = URI.file("/wd").toString();
      setupSession(workingDirectory);
      startTurn("turn-1");
      const captures = [];
      const checkpoints = {
        ...NULL_CHECKPOINT_SERVICE,
        captureTurnCheckpoint: async (_session, _chat, turnId, workingDirectories) => {
          captures.push({ turnId, workingDirectories: workingDirectories?.map((w) => w.toString()) });
        }
      };
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, new FakeChangesetService(), void 0, checkpoints);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      await Promise.resolve();
      assert.deepStrictEqual(captures, [{ turnId: "turn-1", workingDirectories: [workingDirectory] }]);
    });
    test("provider error keeps the turn start until completion capture", async () => {
      setupSession();
      startTurn("turn-1");
      const captured = new DeferredPromise();
      let discardCount = 0;
      const checkpoints = {
        ...NULL_CHECKPOINT_SERVICE,
        captureTurnCheckpoint: async () => {
          captured.complete();
        },
        discardTurnStartCheckpoint: async () => {
          discardCount++;
        }
      };
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, new FakeChangesetService(), void 0, checkpoints);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatError, turnId: "turn-1", duration: 100, error: { errorType: "test", message: "failed" } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 100 }
      });
      await captured.p;
      assert.strictEqual(discardCount, 0);
    });
    test("terminal provider error captures the end checkpoint without completion", async () => {
      setupSession();
      startTurn("turn-1");
      const captured = new DeferredPromise();
      const checkpoints = {
        ...NULL_CHECKPOINT_SERVICE,
        captureTurnCheckpoint: async () => {
          captured.complete();
        }
      };
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, new FakeChangesetService(), void 0, checkpoints);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatError, turnId: "turn-1", duration: 100, error: { errorType: "terminal", message: "failed" } }
      });
      await captured.p;
    });
    test("chat truncation discards pending turn starts for that chat", async () => {
      setupSession();
      const discarded = new DeferredPromise();
      const checkpoints = {
        ...NULL_CHECKPOINT_SERVICE,
        discardChatTurnStartCheckpoints: async (session, chat) => {
          assert.deepStrictEqual({ session: session.toString(), chat: chat.toString() }, {
            session: sessionUri.toString(),
            chat: defaultChatUri
          });
          discarded.complete();
        }
      };
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, new FakeChangesetService(), void 0, checkpoints);
      localSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTruncated,
        turnId: void 0
      });
      await discarded.p;
    });
    test("ChatTruncated fires onSessionTruncated once", () => {
      setupSession();
      const changesets = new FakeChangesetService();
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, changesets);
      localSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTruncated,
        turnId: "turn-1"
      });
      assert.deepStrictEqual(changesets.truncates, [sessionUri.toString()]);
    });
    test("truncating a chat forwards that chat to the agent (default and peer)", () => {
      setupSession();
      const peerChatUri = buildChatUri(sessionUri.toString(), "peer-1");
      sideEffects.handleAction(peerChatUri, { type: ActionType.ChatTruncated, turnId: "turn-peer" });
      const peerCall = agent.truncateChatCalls.at(-1);
      sideEffects.handleAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "turn-default" });
      const defaultCall = agent.truncateChatCalls.at(-1);
      assert.deepStrictEqual({
        peerTurnId: peerCall?.turnId,
        peerChat: peerCall?.chat.toString(),
        defaultTurnId: defaultCall?.turnId,
        defaultChat: defaultCall?.chat.toString()
      }, {
        peerTurnId: "turn-peer",
        peerChat: peerChatUri,
        defaultTurnId: "turn-default",
        defaultChat: defaultChatUri
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudFNpZGVFZmZlY3RzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uLCBBZ2VudFNpZ25hbCwgSUFnZW50LCByZXNvbHZlU3ViYWdlbnRDaGF0UGFyZW50LCBTdWJhZ2VudENoYXRTaWduYWwsIHR5cGUgSUFnZW50Q2hhdENvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhbmdlc2V0Q2F0YWxvZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGFuZ2VzZXRVcmkuanMnO1xuaW1wb3J0IHsgcmVhZFRvb2xDYWxsTWV0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXRhL2FnZW50VG9vbENhbGxNZXRhLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHR5cGUgeyBSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYW5nZXNTdW1tYXJ5LCBDaGF0T3JpZ2luS2luZCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLCBDdXN0b21pemF0aW9uVHlwZSwgTWNwQXV0aFJlcXVpcmVkUmVhc29uLCBNY3BTZXJ2ZXJTdGF0dXMsIFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIEFjdGlvbkVudmVsb3BlLCBBdXRoUmVxdWlyZWRSZWFzb24sIHR5cGUgQ2hhdEFjdGlvbiwgdHlwZSBJTm90aWZpY2F0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGRTdWJhZ2VudENoYXRVcmksIGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgQ2hhdElucHV0QW5zd2VyU3RhdGUsIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZCwgQ2hhdElucHV0UXVlc3Rpb25LaW5kLCBDaGF0SW5wdXRSZXF1ZXN0UHVycG9zZSwgQ2hhdEludGVyYWN0aXZpdHksIEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBNZXNzYWdlQXR0YWNobWVudEtpbmQsIE1lc3NhZ2VLaW5kLCBQZW5kaW5nTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFJPT1RfU1RBVEVfVVJJLCBTZXNzaW9uSW5wdXRSZXNwb25zZUtpbmQsIFNlc3Npb25MaWZlY3ljbGUsIFNlc3Npb25TdGF0dXMsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgVHVyblN0YXRlLCBjdXN0b21pemF0aW9uSWQsIHR5cGUgQ2hhdElucHV0UmVxdWVzdCwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBUdXJuIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25Db25maWdLZXksIEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0TWFya2Rvd25QbGFuUmljaExpbmtzRW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0VGVsZW1ldHJ5TGV2ZWxDb25maWdLZXksIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSwgdGVsZW1ldHJ5TGV2ZWxUb0FnZW50SG9zdENvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZCwgQWdlbnRIb3N0TGF1bmNoS2luZCwgQWdlbnRIb3N0VHJhbnNwb3J0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSwgU3RhdGljQ2hhbmdlc2V0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTaWRlRWZmZWN0cywgSUFnZW50U2lkZUVmZmVjdHNPcHRpb25zIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudFNpZGVFZmZlY3RzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdExvY2FsVHVybnMgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdExvY2FsVHVybnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0QXNrUXVlc3Rpb25zVG9vbEludm9rZWRFdmVudCB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IFNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uLy4uL25vZGUvc2Vzc2lvbkRhdGFiYXNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSwgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdG9yYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBhcHBseU1jcFNlcnZlckVuYWJsZW1lbnQgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9tY3BDdXN0b21pemF0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb29wR2l0U2VydmljZSwgY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlLCBUZXN0U2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBNb2NrQWdlbnQgfSBmcm9tICcuL21vY2tBZ2VudC5qcyc7XG5pbXBvcnQgeyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIH0gZnJvbSAnLi90ZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcblxuLy8gLS0tLSBUZXN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqIFNweSBgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2VgIHVzZWQgdG8gYXNzZXJ0IEFnZW50U2lkZUVmZmVjdHMgZm9yd2FyZGluZy4gKi9cbmNsYXNzIEZha2VDaGFuZ2VzZXRTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSB0b29sQ2FsbEVkaXRzOiB7IHNlc3Npb246IHN0cmluZzsgdHVybklkOiBzdHJpbmcgfVtdID0gW107XG5cdHJlYWRvbmx5IHR1cm5Db21wbGV0ZXM6IHsgc2Vzc2lvbjogc3RyaW5nOyB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0cmVhZG9ubHkgdHJ1bmNhdGVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0cygpOiB2b2lkIHsgLyogbm8tb3AgZm9yIHJvdXRpbmcgdGVzdHMgKi8gfVxuXHRyZXN0b3JlU3RhdGljQ2hhbmdlc2V0KF9zZXNzaW9uOiBzdHJpbmcsIF9raW5kOiBTdGF0aWNDaGFuZ2VzZXRLaW5kLCBfZGlmZnM6IHJlYWRvbmx5IHVua25vd25bXSk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdHBhcnNlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cygpOiB7IHNlc3Npb24/OiB1bmRlZmluZWQgfSB7IHJldHVybiB7fTsgfVxuXHRhcHBseVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoKTogdm9pZCB7IC8qIG5vLW9wICovIH1cblx0cmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoKTogeyBzZXNzaW9uPzogdW5kZWZpbmVkIH0geyByZXR1cm4ge307IH1cblx0cGVyc2lzdENoYW5nZXNTdW1tYXJ5KHNlc3Npb246IHN0cmluZywgY2hhbmdlc1N1bW1hcnk6IENoYW5nZXNTdW1tYXJ5KTogdm9pZCB7IC8qIG5vLW9wICovIH1cblx0aXNTdGF0aWNDaGFuZ2VzZXRDb21wdXRlQWN0aXZlKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Z2V0TGlzdE1ldGFkYXRhS2V5cyhfc2Vzc2lvblVyaTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgdHJ1ZT4gfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGNvbXB1dGVMaXN0RW50cnlDaGFuZ2VzKF9zZXNzaW9uVXJpOiBzdHJpbmcsIF9tZXRhZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPik6IENoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRyZWZyZXNoQ2hhbmdlc2V0Q2F0YWxvZyhzZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRyZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KCk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdHJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KCk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdG9uV29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZSgpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRyZWNvbXB1dGVTdWJzY3JpYmVkQ2hhbmdlc2V0cygpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRvblNlc3Npb25EaXNwb3NlZCgpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRhc3luYyBjb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7IH1cblx0YXN5bmMgY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L2NoYW5nZXNldC90dXJuL3hgOyB9XG5cdGFzeW5jIGNvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nLCBvcmlnaW5hbFR1cm5JZDogc3RyaW5nLCBtb2RpZmllZFR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gYCR7c2Vzc2lvbn0vY2hhbmdlc2V0L2NvbXBhcmUvJHtvcmlnaW5hbFR1cm5JZH0vJHttb2RpZmllZFR1cm5JZH1gO1xuXHR9XG5cblx0b25Ub29sQ2FsbEVkaXRzQXBwbGllZChzZXNzaW9uOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy50b29sQ2FsbEVkaXRzLnB1c2goeyBzZXNzaW9uLCB0dXJuSWQgfSk7XG5cdH1cblx0b25UdXJuQ29tcGxldGUoc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMudHVybkNvbXBsZXRlcy5wdXNoKHsgc2Vzc2lvbiwgdHVybklkIH0pO1xuXHR9XG5cdG9uU2Vzc2lvblRydW5jYXRlZChzZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRydW5jYXRlcy5wdXNoKHNlc3Npb24pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU5vb3BDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UoKTogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdGluaXRpYWxpemVTZXNzaW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0Z2V0V29ya2luZ0RpcmVjdG9yeVN0YXRlOiAoKSA9PiAoeyBraW5kOiAnd29ya3NwYWNlbGVzcycgfSksXG5cdFx0cmVzb2x2ZTogKCkgPT4gKHsga2luZDogJ3Jlc29sdmVkJywgZW5hYmxlbWVudDogW10sIGVuYWJsZWQ6IHRydWUsIHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ3dvcmtzcGFjZWxlc3MnIH0gfSksXG5cdFx0YXBwbHlDbGllbnRHbG9iYWxFbmFibGVtZW50OiAoKSA9PiAoeyBraW5kOiAncmVzb2x2ZWQnLCBlbmFibGVtZW50OiBbXSwgZW5hYmxlZDogdHJ1ZSwgd29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnd29ya3NwYWNlbGVzcycgfSB9KSxcblx0XHRyZXBsYWNlRW5hYmxlbWVudDogKCkgPT4gKHsga2luZDogJ3Jlc29sdmVkJywgZW5hYmxlbWVudDogW10sIGVuYWJsZWQ6IHRydWUsIHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ3dvcmtzcGFjZWxlc3MnIH0gfSksXG5cdFx0c2V0RW5hYmxlbWVudDogKCkgPT4gKHsga2luZDogJ3Jlc29sdmVkJywgZW5hYmxlbWVudDogW10sIGVuYWJsZWQ6IHRydWUsIHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ3dvcmtzcGFjZWxlc3MnIH0gfSksXG5cdFx0d2hlbklkbGU6IGFzeW5jICgpID0+IHsgfSxcblx0fTtcbn1cblxubGV0IGN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSA9IGNyZWF0ZU5vb3BDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UoKTtcblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGFuIHtAbGluayBBZ2VudFNpZGVFZmZlY3RzfSB3aXRoIGEgbWluaW1hbCBsb2NhbCBpbnN0YW50aWF0aW9uXG4gKiBzY29wZSB0aGF0IHNhdGlzZmllcyBpdHMge0BsaW5rIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlfSAvXG4gKiB7QGxpbmsgSUxvZ1NlcnZpY2V9IC8ge0BsaW5rIElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlfSBkZXBlbmRlbmNpZXMuXG4gKiBgZ2l0U2VydmljZWAgaXMgbm8gbG9uZ2VyIHJlcXVpcmVkIGJ5IGBBZ2VudFNpZGVFZmZlY3RzYCBpdHNlbGYgKG1vdmVkXG4gKiB0byB7QGxpbmsgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2V9KTsgaXQgaXMga2VwdCBoZXJlIGFzIGEgbGVmdG92ZXJcbiAqIGZvciBhbnkgZnV0dXJlIHRlc3RzIHRoYXQgbmVlZCB0byBvdmVycmlkZSB0aGUgbm8tb3AgZ2l0IHNlcnZpY2UgdmlhXG4gKiB0aGUgY2hhbmdlc2V0IGZha2UncyB1bmRlcmx5aW5nIGltcGxlbWVudGF0aW9uLlxuICovXG5mdW5jdGlvbiBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoXG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRvcHRpb25zOiBPbWl0PElBZ2VudFNpZGVFZmZlY3RzT3B0aW9ucywgJ2xvY2FsVHVybnMnPiAmIHsgbG9jYWxUdXJucz86IEFnZW50SG9zdExvY2FsVHVybnMgfSxcblx0X2dpdFNlcnZpY2U/OiBJQWdlbnRIb3N0R2l0U2VydmljZSxcblx0dGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UgPSBOdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0Y2hhbmdlc2V0czogSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UgPSBuZXcgRmFrZUNoYW5nZXNldFNlcnZpY2UoKSxcblx0dGVybWluYWxNYW5hZ2VyOiBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCkpLFxuXHRjaGVja3BvaW50U2VydmljZTogSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlID0gTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsXG4pOiBBZ2VudFNpZGVFZmZlY3RzIHtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFtJTG9nU2VydmljZSwgbG9nU2VydmljZV0sXG5cdFx0W0lBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlXSxcblx0XHRbSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UsIGNoYW5nZXNldHNdLFxuXHRcdFtJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIGNoZWNrcG9pbnRTZXJ2aWNlXSxcblx0XHRbSVRlbGVtZXRyeVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2VdLFxuXHRcdFtJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLCB0ZXJtaW5hbE1hbmFnZXJdLFxuXHRcdFtJU2Vzc2lvbkRhdGFTZXJ2aWNlLCBvcHRpb25zLnNlc3Npb25EYXRhU2VydmljZV0sXG5cdCksIC8qc3RyaWN0Ki8gdHJ1ZSkpO1xuXHRjb25zdCByZXNvbHZlZE9wdGlvbnM6IElBZ2VudFNpZGVFZmZlY3RzT3B0aW9ucyA9IHtcblx0XHQuLi5vcHRpb25zLFxuXHRcdGxvY2FsVHVybnM6IG9wdGlvbnMubG9jYWxUdXJucyA/PyBuZXcgQWdlbnRIb3N0TG9jYWxUdXJucyhvcHRpb25zLnNlc3Npb25EYXRhU2VydmljZSwgbG9nU2VydmljZSksXG5cdH07XG5cdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTaWRlRWZmZWN0cywgc3RhdGVNYW5hZ2VyLCBjdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsIHJlc29sdmVkT3B0aW9ucykpO1xufVxuXG4vKipcbiAqIFByb3Zpc2lvbiBhIHNlc3Npb24gZGlyZWN0bHkgb24gYW4gYWdlbnQgdGhyb3VnaCB0aGUgZXhhY3QtY2hhdCBzZWFtXG4gKiBhbiBpbml0aWFsaXppbmcge0BsaW5rIElBZ2VudENoYXRzLmNyZWF0ZUNoYXR9IGNhbGwsIG1pcnJvcmluZyB3aGF0XG4gKiBgQWdlbnRTZXJ2aWNlLmNyZWF0ZVNlc3Npb25gIGRvZXMuIFVzZWQgYnkgdGVzdHMgdGhhdCBuZWVkIGEgc2Vzc2lvbiB0b1xuICogZXhpc3Qgb24gdGhlIGFnZW50IGJhY2tlbmQgd2l0aG91dCBnb2luZyB0aHJvdWdoIHRoZSBvcmNoZXN0cmF0b3IuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUFnZW50U2Vzc2lvbihhZ2VudDogSUFnZW50KTogUHJvbWlzZTxVUkk+IHtcblx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoYWdlbnQuaWQsIGdlbmVyYXRlVXVpZCgpKTtcblx0Y29uc3QgZGVmYXVsdENoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdGF3YWl0IGFnZW50LmNoYXRzLmNyZWF0ZUNoYXQoZGVmYXVsdENoYXQsIHNlc3Npb24pO1xuXHRyZXR1cm4gc2Vzc2lvbjtcbn1cblxuY2xhc3MgVGVzdFRlbGVtZXRyeVNlcnZpY2UgaW1wbGVtZW50cyBJVGVsZW1ldHJ5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRyZWFkb25seSBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uJztcblx0cmVhZG9ubHkgbWFjaGluZUlkID0gJ3Rlc3QtbWFjaGluZSc7XG5cdHJlYWRvbmx5IHNxbUlkID0gJ3Rlc3Qtc3FtJztcblx0cmVhZG9ubHkgZGV2RGV2aWNlSWQgPSAndGVzdC1kZXYtZGV2aWNlJztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZSA9ICd0ZXN0LWZpcnN0LXNlc3Npb24tZGF0ZSc7XG5cdHJlYWRvbmx5IHNlbmRFcnJvclRlbGVtZXRyeSA9IGZhbHNlO1xuXHRyZWFkb25seSBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IHVua25vd24gfVtdID0gW107XG5cblx0cHVibGljTG9nKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZzIoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0fVxuXHRwdWJsaWNMb2dFcnJvcigpOiB2b2lkIHsgfVxuXHRwdWJsaWNMb2dFcnJvcjIoKTogdm9pZCB7IH1cblx0c2V0RXhwZXJpbWVudFByb3BlcnR5KCk6IHZvaWQgeyB9XG5cdHNldENvbW1vblByb3BlcnR5KCk6IHZvaWQgeyB9XG59XG5cbnN1aXRlKCdBZ2VudFNpZGVFZmZlY3RzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgZmlsZVNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXHRsZXQgc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdGxldCBhZ2VudDogTW9ja0FnZW50O1xuXHRsZXQgc2lkZUVmZmVjdHM6IEFnZW50U2lkZUVmZmVjdHM7XG5cdGxldCBhZ2VudExpc3Q6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRbXT4+O1xuXHRsZXQgdGVsZW1ldHJ5U2VydmljZTogVGVzdFRlbGVtZXRyeVNlcnZpY2U7XG5cblx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJyk7XG5cdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRmdW5jdGlvbiBzZXR1cFNlc3Npb24od29ya2luZ0RpcmVjdG9yeT86IHN0cmluZyk6IHZvaWQge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHdvcmtpbmdEaXJlY3RvcnkgPyBbd29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25DaGFuZ2VzZXRzKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYnVpbGREZWZhdWx0Q2hhbmdlc2V0Q2F0YWxvZyhzZXNzaW9uVXJpLnRvU3RyaW5nKCkpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHN0YXJ0VHVybih0dXJuSWQ6IHN0cmluZywgY2hhbm5lbCA9IGRlZmF1bHRDaGF0VXJpKTogdm9pZCB7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGNoYW5uZWwsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZCwgc3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJywgbWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0gfSxcblx0XHRcdHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0sXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB3aXRoIHRoZSBmaXJzdCBub24tYHVuZGVmaW5lZGAgdmFsdWUgcmV0dXJuZWQgYnkgYG1hdGNoYCxcblx0ICogcmUtZXZhbHVhdGluZyBpdCBpbW1lZGlhdGVseSBhbmQgYWZ0ZXIgZXZlcnkgZW52ZWxvcGUgZW1pdHRlZCBieSB0aGVcblx0ICogc3RhdGUgbWFuYWdlci4gVXNlZCB0byBhd2FpdCB0aGUgYXN5bmMgdG9vbC1hcHByb3ZhbCBwaXBlbGluZVxuXHQgKiAoYF9oYW5kbGVUb29sUmVhZHlgIC0+IGBnZXRBdXRvQXBwcm92YWxgIC0+IGByZWFscGF0aGApIGRldGVybWluaXN0aWNhbGx5XG5cdCAqIGluc3RlYWQgb2YgZGVwZW5kaW5nIG9uIGEgZml4ZWQgc2V0dGxlIGRlbGF5LlxuXHQgKi9cblx0ZnVuY3Rpb24gd2FpdEZvclN0YXRlPFQ+KG1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgbWF0Y2g6ICgpID0+IFQgfCB1bmRlZmluZWQpOiBQcm9taXNlPFQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5pdGlhbCA9IG1hdGNoKCk7XG5cdFx0XHRpZiAoaW5pdGlhbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJlc29sdmUoaW5pdGlhbCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCd3YWl0Rm9yU3RhdGU6IGNvbmRpdGlvbiB3YXMgbm90IG1ldCcpKTtcblx0XHRcdH0sIDUwMDApO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjbGVhclRpbWVvdXQodGltZXIpKSk7XG5cdFx0XHRzdG9yZS5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gbWF0Y2goKTtcblx0XHRcdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKGNvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscy5sZW5ndGggPj0gY291bnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihhZ2VudC5vbkRpZFNlbmRNZXNzYWdlLCAoKSA9PiBhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCA+PSBjb3VudCkpO1xuXHR9XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IG1lbUZzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBtZW1GcykpO1xuXG5cdFx0Ly8gU2VlZCBhIGZpbGUgc28gdGhlIGhhbmRsZUJyb3dzZURpcmVjdG9yeSB0ZXN0cyBjYW4gZGlzdGluZ3Vpc2ggZmlsZXMgZnJvbSBkaXJzXG5cdFx0Y29uc3QgdGVzdERpciA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3Rlc3REaXInIH0pO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcih0ZXN0RGlyKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvdGVzdERpci9maWxlLnR4dCcgfSksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2hlbGxvJykpO1xuXG5cdFx0YWdlbnQgPSBuZXcgTW9ja0FnZW50KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGFnZW50TGlzdCA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRbXT4oJ2FnZW50cycsIFthZ2VudF0pO1xuXHRcdHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgPSBjcmVhdGVOb29wQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlKCk7XG5cdFx0c2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdGhvc3RMYXVuY2hLaW5kOiBBZ2VudEhvc3RMYXVuY2hLaW5kLlZTQ29kZU1haW5Qcm9jZXNzLFxuXHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHR9LCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSh0ZWxlbWV0cnlTZXJ2aWNlKSkpO1xuXG5cdFx0Ly8gTWltaWMgdGhlIG9yY2hlc3RyYXRvcidzIHNwYXduIGNoYW5uZWw6IGluIHByb2R1Y3Rpb24gQWdlbnRTZXJ2aWNlIGFkZHNcblx0XHQvLyBhIHN1YmFnZW50J3MgY2hhdCB0byB0aGUgY2F0YWxvZyAodmlhIF9vbkNoYXRTcGF3bmVkKSBiZWZvcmVcblx0XHQvLyBBZ2VudFNpZGVFZmZlY3RzIHN0YXJ0cyBpdHMgdHVybi4gUmVnaXN0ZXJlZCBoZXJlIChhaGVhZCBvZiBlYWNoIHRlc3Qnc1xuXHRcdC8vIHJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcikgc28gdGhlIHN1YmFnZW50IGNoYXQgZXhpc3RzIGZpcnN0LiBhZGRDaGF0IGlzXG5cdFx0Ly8gaWRlbXBvdGVudCwgbWF0Y2hpbmcgdGhlIHJlYWwgc3Bhd24tY2hhbm5lbC9zaWRlLWVmZmVjdHMgb3ZlcmxhcC5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWdlbnQub25EaWRDaGF0UHJvZ3Jlc3Moc2lnbmFsID0+IHtcblx0XHRcdGNvbnN0IHNwYXduID0gU3ViYWdlbnRDaGF0U2lnbmFsLnRvU3Bhd25FdmVudChzaWduYWwpO1xuXHRcdFx0aWYgKHNwYXduKSB7XG5cdFx0XHRcdHN0YXRlTWFuYWdlci5hZGRDaGF0KHNwYXduLnNlc3Npb24udG9TdHJpbmcoKSwgc3Bhd24uY2hhdC50b1N0cmluZygpLCB7XG5cdFx0XHRcdFx0dGl0bGU6IHNwYXduLnRpdGxlLFxuXHRcdFx0XHRcdG9yaWdpbjogc3Bhd24ucGFyZW50ID8geyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBjaGF0OiBzcGF3bi5wYXJlbnQuY2hhdC50b1N0cmluZygpLCB0b29sQ2FsbElkOiBzcGF3bi5wYXJlbnQudG9vbENhbGxJZCB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tLSBoYW5kbGVBY3Rpb246IHNlc3Npb24vdHVyblN0YXJ0ZWQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgncmVjb3JkcyBjdXN0b21pemF0aW9uIHRvZ2dsZXMgaW4gdGhlIGVuYWJsZW1lbnQgc2VydmljZScsICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogeyBzZXNzaW9uOiBzdHJpbmc7IHRhcmdldDogc3RyaW5nOyBlbmFibGVtZW50OiB1bmtub3duIH1bXSA9IFtdO1xuXHRcdGN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5yZXBsYWNlRW5hYmxlbWVudCA9IChzZXNzaW9uLCB0YXJnZXQsIGVuYWJsZW1lbnQpID0+IHtcblx0XHRcdGNhbGxzLnB1c2goeyBzZXNzaW9uLCB0YXJnZXQ6IHRhcmdldC5vd25pbmdQbHVnaW5Tb3VyY2UgPyBgJHt0YXJnZXQub3duaW5nUGx1Z2luU291cmNlfSNtY3A9JHt0YXJnZXQubmFtZX1gIDogdGFyZ2V0LnNvdXJjZS50b1N0cmluZygpLCBlbmFibGVtZW50IH0pO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3Jlc29sdmVkJywgZW5hYmxlbWVudDogW10sIGVuYWJsZWQ6IHRydWUsIHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ3dvcmtzcGFjZWxlc3MnIH0gfTtcblx0XHR9O1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdGNvbnN0IHBsdWdpbjogUGx1Z2luQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdGlkOiAncGx1Z2luJyxcblx0XHRcdHVyaTogJ2ZpbGU6Ly8vcGx1Z2luJyxcblx0XHRcdG5hbWU6ICdQbHVnaW4nLFxuXHRcdFx0Y2hpbGRyZW46IFt7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlciwgaWQ6ICdzZXJ2ZXInLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi8ubWNwLmpzb24nLCBuYW1lOiAnc2VydmVyJywgc3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH0gfV0sXG5cdFx0fTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCwgY3VzdG9taXphdGlvbnM6IFtwbHVnaW5dIH0pO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25Ub2dnbGVkLFxuXHRcdFx0aWQ6ICdzZXJ2ZXInLFxuXHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3tcblx0XHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdHRhcmdldDogJ2ZpbGU6Ly8vcGx1Z2luI21jcD1zZXJ2ZXInLFxuXHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0c3VpdGUoJ2N1c3RvbWl6YXRpb24gZW5hYmxlbWVudCByZWZyZXNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpbjogUGx1Z2luQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdGlkOiAncGx1Z2luJyxcblx0XHRcdHVyaTogJ2ZpbGU6Ly8vcGx1Z2luJyxcblx0XHRcdG5hbWU6ICdQbHVnaW4nLFxuXHRcdH07XG5cdFx0Y29uc3QgdGFyZ2V0ID0ge1xuXHRcdFx0aWQ6IHBsdWdpbi5pZCxcblx0XHRcdHR5cGU6IHBsdWdpbi50eXBlLFxuXHRcdFx0bmFtZTogcGx1Z2luLm5hbWUsXG5cdFx0XHRzb3VyY2U6IFVSSS5wYXJzZShwbHVnaW4udXJpKSxcblx0XHR9O1xuXG5cdFx0ZnVuY3Rpb24gc2V0dXBBZGRpdGlvbmFsU2Vzc2lvbihzZXNzaW9uOiBVUkksIHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0cHJvamVjdDogeyB1cmk6IHdvcmtpbmdEaXJlY3RvcnksIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFt3b3JraW5nRGlyZWN0b3J5XSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25DaGFuZ2VzZXRzKHNlc3Npb24udG9TdHJpbmcoKSwgYnVpbGREZWZhdWx0Q2hhbmdlc2V0Q2F0YWxvZyhzZXNzaW9uLnRvU3RyaW5nKCkpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlUmVmcmVzaEhhcm5lc3Moc2Vzc2lvbnM6IHJlYWRvbmx5IFVSSVtdLCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoKSwgaW5pdGlhbGl6ZSA9IHRydWUpOiBQcm9taXNlPEFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZT4ge1xuXHRcdFx0Y29uc3QgZW5hYmxlbWVudFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZShcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdG9yYWdlU2VydmljZSh1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdCkpO1xuXHRcdFx0Y3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlID0gZW5hYmxlbWVudFNlcnZpY2U7XG5cdFx0XHRjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGluaXRpYWxpemUpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gZW5hYmxlbWVudFNlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKSkpO1xuXHRcdFx0fVxuXHRcdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgc2Vzc2lvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdXRpb24gPSBlbmFibGVtZW50U2VydmljZS5yZXNvbHZlKHNlc3Npb24udG9TdHJpbmcoKSwgdGFyZ2V0KTtcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0Li4ucGx1Z2luLFxuXHRcdFx0XHRcdC4uLihyZXNvbHV0aW9uLmtpbmQgPT09ICdyZXNvbHZlZCcgJiYgcmVzb2x1dGlvbi5lbmFibGVtZW50Lmxlbmd0aCA+IDAgPyB7IGVuYWJsZW1lbnQ6IFsuLi5yZXNvbHV0aW9uLmVuYWJsZW1lbnRdIH0gOiB7fSksXG5cdFx0XHRcdH1dO1xuXHRcdFx0fTtcblx0XHRcdHJldHVybiBlbmFibGVtZW50U2VydmljZTtcblx0XHR9XG5cblx0XHRhc3luYyBmdW5jdGlvbiBwdWJsaXNoSW5pdGlhbEN1c3RvbWl6YXRpb25zKHNlc3Npb25zOiByZWFkb25seSBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHRcdFx0YWdlbnQuZmlyZUN1c3RvbWl6YXRpb25zQ2hhbmdlKCk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBzZXNzaW9ucy5ldmVyeShzZXNzaW9uID0+IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8uY3VzdG9taXphdGlvbnMgIT09IHVuZGVmaW5lZCkgPyB0cnVlIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjdXN0b21pemF0aW9uRW52ZWxvcGVzKGVudmVsb3BlczogcmVhZG9ubHkgQWN0aW9uRW52ZWxvcGVbXSk6IEFjdGlvbkVudmVsb3BlW10ge1xuXHRcdFx0cmV0dXJuIGVudmVsb3Blcy5maWx0ZXIoZW52ZWxvcGUgPT4gZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgncmVwdWJsaXNoZXMgY3VzdG9taXphdGlvbnMgYWZ0ZXIgYSBkZWNpc2lvbiB3cml0ZSBhbmQgZGVkdXBlcyBhIHJlZHVuZGFudCB3cml0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG90aGVyU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0yJyk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd29ya3NwYWNlJyk7XG5cdFx0XHRzZXR1cEFkZGl0aW9uYWxTZXNzaW9uKG90aGVyU2Vzc2lvbiwgJ2ZpbGU6Ly8vd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50U2VydmljZSA9IGF3YWl0IGNyZWF0ZVJlZnJlc2hIYXJuZXNzKFtzZXNzaW9uVXJpLCBvdGhlclNlc3Npb25dKTtcblx0XHRcdGF3YWl0IHB1Ymxpc2hJbml0aWFsQ3VzdG9taXphdGlvbnMoW3Nlc3Npb25VcmksIG90aGVyU2Vzc2lvbl0pO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IGVudmVsb3Blcy5wdXNoKGVudmVsb3BlKSkpO1xuXG5cdFx0XHRlbmFibGVtZW50U2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgdGFyZ2V0LCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gY3VzdG9taXphdGlvbkVudmVsb3BlcyhlbnZlbG9wZXMpLmxlbmd0aCA9PT0gMSA/IHRydWUgOiB1bmRlZmluZWQpO1xuXHRcdFx0ZW5hYmxlbWVudFNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHRhcmdldCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGZhbHNlKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN1c3RvbWl6YXRpb25FbnZlbG9wZXMoZW52ZWxvcGVzKS5tYXAoZW52ZWxvcGUgPT4gKHtcblx0XHRcdFx0c2Vzc2lvbjogZW52ZWxvcGUuY2hhbm5lbCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQgPyBlbnZlbG9wZS5hY3Rpb24uY3VzdG9taXphdGlvbnMgOiB1bmRlZmluZWQsXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IC4uLnBsdWdpbiwgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IGZhbHNlIH1dIH1dLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwdWJsaXNoZXMgZXZlcnkgb3BlbiBzZXNzaW9uIGZvciBhIGdsb2JhbCBkZWNpc2lvbiBvbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3RoZXJTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTInKTtcblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93b3Jrc3BhY2UtYScpO1xuXHRcdFx0c2V0dXBBZGRpdGlvbmFsU2Vzc2lvbihvdGhlclNlc3Npb24sICdmaWxlOi8vL3dvcmtzcGFjZS1iJyk7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50U2VydmljZSA9IGF3YWl0IGNyZWF0ZVJlZnJlc2hIYXJuZXNzKFtzZXNzaW9uVXJpLCBvdGhlclNlc3Npb25dKTtcblx0XHRcdGF3YWl0IHB1Ymxpc2hJbml0aWFsQ3VzdG9taXphdGlvbnMoW3Nlc3Npb25VcmksIG90aGVyU2Vzc2lvbl0pO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IGVudmVsb3Blcy5wdXNoKGVudmVsb3BlKSkpO1xuXG5cdFx0XHRlbmFibGVtZW50U2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgdGFyZ2V0LCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBjdXN0b21pemF0aW9uRW52ZWxvcGVzKGVudmVsb3BlcykubGVuZ3RoID09PSAyID8gdHJ1ZSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3VzdG9taXphdGlvbkVudmVsb3BlcyhlbnZlbG9wZXMpLm1hcChlbnZlbG9wZSA9PiBlbnZlbG9wZS5jaGFubmVsKS5zb3J0KCksIFtzZXNzaW9uVXJpLnRvU3RyaW5nKCksIG90aGVyU2Vzc2lvbi50b1N0cmluZygpXS5zb3J0KCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwdWJsaXNoZXMgb25seSBzZXNzaW9ucyBzaGFyaW5nIGEgd29ya3NwYWNlIGRlY2lzaW9uIHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2FtZVdvcmtzcGFjZVNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMicpO1xuXHRcdFx0Y29uc3Qgb3RoZXJXb3Jrc3BhY2VTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTMnKTtcblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93b3Jrc3BhY2UnKTtcblx0XHRcdHNldHVwQWRkaXRpb25hbFNlc3Npb24oc2FtZVdvcmtzcGFjZVNlc3Npb24sICdmaWxlOi8vL3dvcmtzcGFjZScpO1xuXHRcdFx0c2V0dXBBZGRpdGlvbmFsU2Vzc2lvbihvdGhlcldvcmtzcGFjZVNlc3Npb24sICdmaWxlOi8vL290aGVyLXdvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3QgZW5hYmxlbWVudFNlcnZpY2UgPSBhd2FpdCBjcmVhdGVSZWZyZXNoSGFybmVzcyhbc2Vzc2lvblVyaSwgc2FtZVdvcmtzcGFjZVNlc3Npb24sIG90aGVyV29ya3NwYWNlU2Vzc2lvbl0pO1xuXHRcdFx0YXdhaXQgcHVibGlzaEluaXRpYWxDdXN0b21pemF0aW9ucyhbc2Vzc2lvblVyaSwgc2FtZVdvcmtzcGFjZVNlc3Npb24sIG90aGVyV29ya3NwYWNlU2Vzc2lvbl0pO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IGVudmVsb3Blcy5wdXNoKGVudmVsb3BlKSkpO1xuXG5cdFx0XHRlbmFibGVtZW50U2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgdGFyZ2V0LCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBjdXN0b21pemF0aW9uRW52ZWxvcGVzKGVudmVsb3BlcykubGVuZ3RoID09PSAyID8gdHJ1ZSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3VzdG9taXphdGlvbkVudmVsb3BlcyhlbnZlbG9wZXMpLm1hcChlbnZlbG9wZSA9PiBlbnZlbG9wZS5jaGFubmVsKS5zb3J0KCksIFtzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHNhbWVXb3Jrc3BhY2VTZXNzaW9uLnRvU3RyaW5nKCldLnNvcnQoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXB1Ymxpc2hlcyB3aGVuIHNlc3Npb24gZW5hYmxlbWVudCBmaW5pc2hlcyBsb2FkaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3QgZGF0YWJhc2UgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0bGV0IHJlc29sdmVNZXRhZGF0YSE6ICh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB2b2lkO1xuXHRcdFx0ZGF0YWJhc2UuZ2V0TWV0YWRhdGEgPSBhc3luYyAoKSA9PiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHsgcmVzb2x2ZU1ldGFkYXRhID0gcmVzb2x2ZTsgfSk7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50U2VydmljZSA9IGF3YWl0IGNyZWF0ZVJlZnJlc2hIYXJuZXNzKFtzZXNzaW9uVXJpXSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRhdGFiYXNlKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgcHVibGlzaEluaXRpYWxDdXN0b21pemF0aW9ucyhbc2Vzc2lvblVyaV0pO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IGVudmVsb3Blcy5wdXNoKGVudmVsb3BlKSkpO1xuXG5cdFx0XHRjb25zdCBsb2FkID0gZW5hYmxlbWVudFNlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24oc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdHJlc29sdmVNZXRhZGF0YSgne1wicGx1Z2luXCI6ZmFsc2V9Jyk7XG5cdFx0XHRhd2FpdCBsb2FkO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gY3VzdG9taXphdGlvbkVudmVsb3BlcyhlbnZlbG9wZXMpLmxlbmd0aCA9PT0gMSA/IHRydWUgOiB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN1c3RvbWl6YXRpb25FbnZlbG9wZXMoZW52ZWxvcGVzKS5tYXAoZW52ZWxvcGUgPT4gKHtcblx0XHRcdFx0c2Vzc2lvbjogZW52ZWxvcGUuY2hhbm5lbCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQgPyBlbnZlbG9wZS5hY3Rpb24uY3VzdG9taXphdGlvbnMgOiB1bmRlZmluZWQsXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IC4uLnBsdWdpbiwgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IGZhbHNlIH1dIH1dLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwdWJsaXNoZXMgYSBzZXR0bGVkIE1DUCBkZWNpc2lvbiB0aGF0IGFuIGVhcmxpZXIgcGVuZGluZyBwdWJsaWNhdGlvbiBvbWl0dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3QgZGF0YWJhc2UgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0bGV0IHJlc29sdmVNZXRhZGF0YSE6ICh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB2b2lkO1xuXHRcdFx0ZGF0YWJhc2UuZ2V0TWV0YWRhdGEgPSBhc3luYyAoKSA9PiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHsgcmVzb2x2ZU1ldGFkYXRhID0gcmVzb2x2ZTsgfSk7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50U2VydmljZSA9IGF3YWl0IGNyZWF0ZVJlZnJlc2hIYXJuZXNzKFtzZXNzaW9uVXJpXSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRhdGFiYXNlKSwgZmFsc2UpO1xuXHRcdFx0Y29uc3Qgc2VydmVyID0ge1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdGlkOiAnYXp1cmUnLFxuXHRcdFx0XHR1cmk6ICdmaWxlOi8vL3BsdWdpbi9tY3AuanNvbicsXG5cdFx0XHRcdG5hbWU6ICdhenVyZScsXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0XHR9IGFzIGNvbnN0O1xuXHRcdFx0Y29uc3QgcGx1Z2luV2l0aFNlcnZlcjogUGx1Z2luQ3VzdG9taXphdGlvbiA9IHsgLi4ucGx1Z2luLCBjaGlsZHJlbjogW3NlcnZlcl0gfTtcblx0XHRcdGNvbnN0IHNlcnZlclRhcmdldCA9IHtcblx0XHRcdFx0aWQ6IHNlcnZlci5pZCxcblx0XHRcdFx0dHlwZTogc2VydmVyLnR5cGUsXG5cdFx0XHRcdG5hbWU6IHNlcnZlci5uYW1lLFxuXHRcdFx0XHRzb3VyY2U6IFVSSS5wYXJzZShzZXJ2ZXIudXJpKSxcblx0XHRcdFx0b3duaW5nUGx1Z2luU291cmNlOiBVUkkucGFyc2UocGx1Z2luLnVyaSksXG5cdFx0XHR9O1xuXHRcdFx0ZW5hYmxlbWVudFNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHNlcnZlclRhcmdldCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2UpO1xuXHRcdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgc2Vzc2lvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdXRpb24gPSBlbmFibGVtZW50U2VydmljZS5yZXNvbHZlKHNlc3Npb24udG9TdHJpbmcoKSwgc2VydmVyVGFyZ2V0KTtcblx0XHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBbe1xuXHRcdFx0XHRcdC4uLnBsdWdpbldpdGhTZXJ2ZXIsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdFx0XHQuLi5zZXJ2ZXIsXG5cdFx0XHRcdFx0XHQuLi4ocmVzb2x1dGlvbi5raW5kID09PSAncmVzb2x2ZWQnICYmIHJlc29sdXRpb24uZW5hYmxlbWVudC5sZW5ndGggPiAwID8geyBlbmFibGVtZW50OiBbLi4ucmVzb2x1dGlvbi5lbmFibGVtZW50XSB9IDoge30pLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9XTtcblx0XHRcdFx0cmV0dXJuIGFwcGx5TWNwU2VydmVyRW5hYmxlbWVudChjdXN0b21pemF0aW9ucywgc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy5jdXN0b21pemF0aW9ucyA/PyBbXSk7XG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgcHVibGlzaEluaXRpYWxDdXN0b21pemF0aW9ucyhbc2Vzc2lvblVyaV0pO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IGVudmVsb3Blcy5wdXNoKGVudmVsb3BlKSkpO1xuXG5cdFx0XHRjb25zdCBsb2FkID0gZW5hYmxlbWVudFNlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24oc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdHJlc29sdmVNZXRhZGF0YSh1bmRlZmluZWQpO1xuXHRcdFx0YXdhaXQgbG9hZDtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGN1c3RvbWl6YXRpb25FbnZlbG9wZXMoZW52ZWxvcGVzKS5sZW5ndGggPT09IDEgPyB0cnVlIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdXN0b21pemF0aW9uRW52ZWxvcGVzKGVudmVsb3BlcykubWFwKGVudmVsb3BlID0+ICh7XG5cdFx0XHRcdHNlc3Npb246IGVudmVsb3BlLmNoYW5uZWwsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkID8gZW52ZWxvcGUuYWN0aW9uLmN1c3RvbWl6YXRpb25zIDogdW5kZWZpbmVkLFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRzZXNzaW9uOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHRcdC4uLnBsdWdpbixcblx0XHRcdFx0XHRjaGlsZHJlbjogW3tcblx0XHRcdFx0XHRcdC4uLnNlcnZlcixcblx0XHRcdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcHVibGlzaGVzIHdoZW4gYSBwZW5kaW5nIHdvcmtpbmcgZGlyZWN0b3J5IGJlY29tZXMga25vd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGVuYWJsZW1lbnRTZXJ2aWNlID0gYXdhaXQgY3JlYXRlUmVmcmVzaEhhcm5lc3MoW3Nlc3Npb25VcmldKTtcblx0XHRcdGF3YWl0IHB1Ymxpc2hJbml0aWFsQ3VzdG9taXphdGlvbnMoW3Nlc3Npb25VcmldKTtcblx0XHRcdGVuYWJsZW1lbnRTZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvblVyaS50b1N0cmluZygpLCB0YXJnZXQsIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGZhbHNlKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IGVudmVsb3Blcy5wdXNoKGVudmVsb3BlKSkpO1xuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogJ2ZpbGU6Ly8vd29ya3NwYWNlJyB9KTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGN1c3RvbWl6YXRpb25FbnZlbG9wZXMoZW52ZWxvcGVzKS5sZW5ndGggPT09IDEgPyB0cnVlIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdXN0b21pemF0aW9uRW52ZWxvcGVzKGVudmVsb3BlcykubWFwKGVudmVsb3BlID0+ICh7XG5cdFx0XHRcdHNlc3Npb246IGVudmVsb3BlLmNoYW5uZWwsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkID8gZW52ZWxvcGUuYWN0aW9uLmN1c3RvbWl6YXRpb25zIDogdW5kZWZpbmVkLFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRzZXNzaW9uOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbeyAuLi5wbHVnaW4sIGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dIH1dLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0cmllcyBhbiBlbmFibGVtZW50IHJlZnJlc2ggc3VwZXJzZWRlZCBieSBhIGRpcmVjdCBjdXN0b21pemF0aW9uIHVwZGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IGVuYWJsZW1lbnRTZXJ2aWNlID0gYXdhaXQgY3JlYXRlUmVmcmVzaEhhcm5lc3MoW3Nlc3Npb25VcmldKTtcblx0XHRcdGF3YWl0IHB1Ymxpc2hJbml0aWFsQ3VzdG9taXphdGlvbnMoW3Nlc3Npb25VcmldKTtcblx0XHRcdGxldCBzaWduYWxGZXRjaFN0YXJ0ZWQhOiAoKSA9PiB2b2lkO1xuXHRcdFx0Y29uc3QgZmV0Y2hTdGFydGVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IHNpZ25hbEZldGNoU3RhcnRlZCA9IHJlc29sdmU7IH0pO1xuXHRcdFx0bGV0IHJlbGVhc2VGZXRjaCE6ICgpID0+IHZvaWQ7XG5cdFx0XHRsZXQgYmxvY2tGaXJzdEZldGNoID0gdHJ1ZTtcblx0XHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jIHNlc3Npb24gPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvbHV0aW9uID0gZW5hYmxlbWVudFNlcnZpY2UucmVzb2x2ZShzZXNzaW9uLnRvU3RyaW5nKCksIHRhcmdldCk7XG5cdFx0XHRcdGlmIChibG9ja0ZpcnN0RmV0Y2gpIHtcblx0XHRcdFx0XHRibG9ja0ZpcnN0RmV0Y2ggPSBmYWxzZTtcblx0XHRcdFx0XHRzaWduYWxGZXRjaFN0YXJ0ZWQoKTtcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgcmVsZWFzZUZldGNoID0gcmVzb2x2ZTsgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0Li4ucGx1Z2luLFxuXHRcdFx0XHRcdC4uLihyZXNvbHV0aW9uLmtpbmQgPT09ICdyZXNvbHZlZCcgJiYgcmVzb2x1dGlvbi5lbmFibGVtZW50Lmxlbmd0aCA+IDAgPyB7IGVuYWJsZW1lbnQ6IFsuLi5yZXNvbHV0aW9uLmVuYWJsZW1lbnRdIH0gOiB7fSksXG5cdFx0XHRcdH1dO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlbnZlbG9wZSA9PiBlbnZlbG9wZXMucHVzaChlbnZlbG9wZSkpKTtcblxuXHRcdFx0ZW5hYmxlbWVudFNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHRhcmdldCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgZmV0Y2hTdGFydGVkO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsIGN1c3RvbWl6YXRpb25zOiBbcGx1Z2luXSB9KTtcblx0XHRcdHJlbGVhc2VGZXRjaCgpO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gY3VzdG9taXphdGlvbkVudmVsb3BlcyhlbnZlbG9wZXMpLnNvbWUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0XHRjb25zdCBjdXN0b21pemF0aW9uID0gZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCA/IGVudmVsb3BlLmFjdGlvbi5jdXN0b21pemF0aW9uc1swXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIGN1c3RvbWl6YXRpb24/LnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpblxuXHRcdFx0XHRcdCYmIGN1c3RvbWl6YXRpb24uZW5hYmxlbWVudD8uc29tZShlbnRyeSA9PiBlbnRyeS5raW5kID09PSBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsICYmIGVudHJ5LmVuYWJsZWQgPT09IGZhbHNlKTtcblx0XHRcdH0pID8gdHJ1ZSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3VzdG9taXphdGlvbkVudmVsb3BlcyhlbnZlbG9wZXMpLm1hcChlbnZlbG9wZSA9PiAoe1xuXHRcdFx0XHRzZXNzaW9uOiBlbnZlbG9wZS5jaGFubmVsLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCA/IGVudmVsb3BlLmFjdGlvbi5jdXN0b21pemF0aW9ucyA6IHVuZGVmaW5lZCxcblx0XHRcdH0pKSwgW1xuXHRcdFx0XHR7IHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgY3VzdG9taXphdGlvbnM6IFtwbHVnaW5dIH0sXG5cdFx0XHRcdHsgc2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLCBjdXN0b21pemF0aW9uczogW3sgLi4ucGx1Z2luLCBlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9XSB9XSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gXHUyMDE0IHNlc3Npb24vdHVyblN0YXJ0ZWQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjYWxscyBzZW5kTWVzc2FnZSBvbiB0aGUgYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvIHdvcmxkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscywgW3sgc2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkudG9TdHJpbmcoKSksIHByb21wdDogJ2hlbGxvIHdvcmxkJywgYXR0YWNobWVudHM6IHVuZGVmaW5lZCwgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSB9XSk7XG5cdFx0XHRjb25zdCBzZW5kQ29udGV4dCA9IGFnZW50LmNoYXRDb250ZXh0cy5maW5kKGNhbGwgPT4gY2FsbC5ib3VuZGFyeSA9PT0gJ3NlbmRNZXNzYWdlJyk/LmNvbnRleHQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoIVVSSS5pc1VyaShzZW5kQ29udGV4dCkgPyBzZW5kQ29udGV4dD8uaG9zdEluc3RydWN0aW9ucyA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0YW1wcyB0aGUgZXhoYXVzdGl2ZSBob3N0IGNoYXQgY29udGV4dCBvbiB0aGUgc2VuZCBib3VuZGFyeScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgaG9zdEN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9zZW5kLXBsdWdpbicpLFxuXHRcdFx0XHR1cmk6ICdmaWxlOi8vL3NlbmQtcGx1Z2luJyxcblx0XHRcdFx0bmFtZTogJ1NlbmQgUGx1Z2luJyxcblx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogdHJ1ZSB9XSxcblx0XHRcdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgW2hvc3RDdXN0b21pemF0aW9uXSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci1zZW5kJyk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHBlZXJDaGF0VXJpLCB7XG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Gb3JrLCBjaGF0OiBkZWZhdWx0Q2hhdFVyaSwgdHVybklkOiAndHVybi0wJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihwZWVyQ2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8gd29ybGQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXG5cdFx0XHRjb25zdCByZWNvcmRlZCA9IGFnZW50LmNoYXRDb250ZXh0cy5maWx0ZXIoZW50cnkgPT4gZW50cnkuYm91bmRhcnkgPT09ICdzZW5kTWVzc2FnZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNvcmRlZC5tYXAoZW50cnkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0gZW50cnkuY29udGV4dCBhcyBJQWdlbnRDaGF0Q29udGV4dDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjaGF0OiBlbnRyeS5jaGF0LnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvblJlc291cmNlOiBjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHJlc291cmNlOiBjb250ZXh0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0b3JpZ2luOiBjb250ZXh0Lm9yaWdpbixcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogY29udGV4dC5jdXN0b21pemF0aW9ucz8ubWFwKGMgPT4gYy5pZCksXG5cdFx0XHRcdH07XG5cdFx0XHR9KSwgW3tcblx0XHRcdFx0Y2hhdDogcGVlckNoYXRVcmksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRyZXNvdXJjZTogcGVlckNoYXRVcmksXG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Gb3JrLCBjaGF0OiBkZWZhdWx0Q2hhdFVyaSwgdHVybklkOiAndHVybi0wJyB9LFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW2hvc3RDdXN0b21pemF0aW9uLmlkXSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgcmljaCBNYXJrZG93biBwbGFuIGd1aWRhbmNlIHdpdGggdGhlIGV4YWN0IGN1cnJlbnQgY2hhdCBsaW5rIHdoZW4gZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0TWFya2Rvd25QbGFuUmljaExpbmtzRW5hYmxlZENvbmZpZ0tleV06IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGVlckNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItcGxhbicpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaS50b1N0cmluZygpLCBwZWVyQ2hhdFVyaSwgeyB0aXRsZTogJ1BsYW4gY2hhdCcgfSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihwZWVyQ2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnQ3JlYXRlIGEgcGxhbicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cblx0XHRcdGNvbnN0IHNlbmRDb250ZXh0ID0gYWdlbnQuY2hhdENvbnRleHRzLmZpbmQoY2FsbCA9PiBjYWxsLmJvdW5kYXJ5ID09PSAnc2VuZE1lc3NhZ2UnKT8uY29udGV4dDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoIVVSSS5pc1VyaShzZW5kQ29udGV4dCkgPyBzZW5kQ29udGV4dD8uaG9zdEluc3RydWN0aW9ucyA6IHVuZGVmaW5lZCwgW1tcblx0XHRcdFx0JzxyaWNoX3BsYW5fbWFya2Rvd24+Jyxcblx0XHRcdFx0J1doZW4gY3JlYXRpbmcgb3IgZWRpdGluZyBhIE1hcmtkb3duIHBsYW4gZG9jdW1lbnQsIHVzZSB0aGVzZSBmb3JtYXRzIHdoZW4gdGhlIGV4YWN0IHRhcmdldCBpcyBrbm93bjonLFxuXHRcdFx0XHQnLSBVc2UgY2Fub25pY2FsIEhUVFBTIGxpbmtzIGZvciBHaXRIdWIgaXNzdWVzIGFuZCBwdWxsIHJlcXVlc3RzLicsXG5cdFx0XHRcdCctIFVzZSBgY29tbWl0Oi8vPHNoYT5gIGZvciBjb21taXRzIGluIHRoZSBjdXJyZW50IEdpdCByZXBvc2l0b3J5LicsXG5cdFx0XHRcdCctIFByZXNlcnZlIGV4YWN0IGBhZ2VudC1ob3N0LXNlc3Npb246Ly8uLi5gIGxpbmtzIHJldHVybmVkIGJ5IHNlc3Npb24gYW5kIGNoYXQgdG9vbHMgd2hlbiByZWZlcnJpbmcgdG8gc2Vzc2lvbnMsIGNoYXRzLCBvciBzdWJhZ2VudHMuIERvIG5vdCBjb25zdHJ1Y3QgdGhlc2UgbGlua3MgeW91cnNlbGYuJyxcblx0XHRcdFx0Jy0gTGluayB0byB0aGUgY3VycmVudCBjaGF0IGFzIFtDdXJyZW50IGNoYXRdKGFnZW50LWhvc3Qtc2Vzc2lvbjovL21vY2svc2Vzc2lvbi0xP2NoYXQ9cGVlci1wbGFuKS4nLFxuXHRcdFx0XHQnLSBVc2UgYC0gWyBdIDpydW5uaW5nOiBEZXNjcmlwdGlvbmAgZm9yIGEgdGFzayB0aGF0IGlzIGFjdGl2ZWx5IHJ1bm5pbmcsIGAtIFsgXWAgZm9yIGEgcGVuZGluZyB0YXNrLCBhbmQgYC0gW3hdYCBmb3IgYSBjb21wbGV0ZWQgdGFzay4nLFxuXHRcdFx0XHQnLSBLZWVwIGxpbmsgbGFiZWxzIG1lYW5pbmdmdWwgc28gdGhlIGRvY3VtZW50IHJlbWFpbnMgcmVhZGFibGUgd2l0aG91dCByaWNoIHJlbmRlcmluZy4nLFxuXHRcdFx0XHQnPC9yaWNoX3BsYW5fbWFya2Rvd24+Jyxcblx0XHRcdF0uam9pbignXFxuJyldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLnByb21wdCwgJ0NyZWF0ZSBhIHBsYW4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bhc3NlcyB0aGUgZGlzcGF0Y2hpbmcgY2xpZW50IGlkIGFuZCB0eXBlIHRvIHNlbmRNZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbyB3b3JsZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgJ2NsaWVudC1CJywgQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3cpO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLCBbe1xuXHRcdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0cHJvbXB0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHRhdHRhY2htZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzZW5kZXJDbGllbnRJZDogJ2NsaWVudC1CJyxcblx0XHRcdFx0Y2xpZW50VHlwZTogJ2VkaXRvcl93aW5kb3cnLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbG9ncyB0ZWxlbWV0cnkgd2hlbiBzZW5kaW5nIGEgZGlyZWN0IHVzZXIgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50QWN0aW9uOiBTZXNzaW9uQWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAndGVzdFRvb2wnLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JyB9IH1dLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vY3VzdG9taXphdGlvbnMvU0tJTEwubWQnKSwgdXJpOiAnZmlsZTovLy9jdXN0b21pemF0aW9ucy9TS0lMTC5tZCcsIG5hbWU6ICdUZXN0IFNraWxsJywgfV1cblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3RpdmVDbGllbnRBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aXZlQ2xpZW50QWN0aW9uKTtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9kaXJlY3QudHMnKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8gd29ybGQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBhdHRhY2htZW50czogW3sgdHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLCB1cmk6IGZpbGVVcmkudG9TdHJpbmcoKSwgbGFiZWw6ICdkaXJlY3QudHMnLCBkaXNwbGF5S2luZDogJ2RvY3VtZW50JyB9XSB9LFxuXHRcdFx0fSwgJ2NsaWVudC1hZ2VudHMnLCB7XG5cdFx0XHRcdGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUuQWdlbnRzV2luZG93LFxuXHRcdFx0XHRjb25uZWN0aW9uS2luZDogQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvbktpbmQuRGV2VHVubmVsLFxuXHRcdFx0XHR0cmFuc3BvcnRLaW5kOiBBZ2VudEhvc3RUcmFuc3BvcnRLaW5kLldlYlNvY2tldCxcblx0XHRcdFx0aG9zdExhdW5jaEtpbmQ6IEFnZW50SG9zdExhdW5jaEtpbmQuVlNDb2RlTWFpblByb2Nlc3MsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cywgW3tcblx0XHRcdFx0ZXZlbnROYW1lOiAnYWdlbnRIb3N0LnVzZXJNZXNzYWdlU2VudCcsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRcdGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX21haW5fcHJvY2VzcycsXG5cdFx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50SWQ6ICdjbGllbnQtYWdlbnRzJyxcblx0XHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdFx0aW5pdGlhdG9yQ29ubmVjdGlvbktpbmQ6ICdkZXZfdHVubmVsJyxcblx0XHRcdFx0XHRpbml0aWF0b3JUcmFuc3BvcnRLaW5kOiAnd2Vic29ja2V0Jyxcblx0XHRcdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdFx0c291cmNlOiAnZGlyZWN0Jyxcblx0XHRcdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRcdFx0dHVybkNvdW50OiAwLFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudFRvb2xDb3VudDogMSxcblx0XHRcdFx0XHRhY3RpdmVDbGllbnRDdXN0b21pemF0aW9uQ291bnQ6IDEsXG5cdFx0XHRcdFx0YXR0YWNobWVudENvdW50OiAxLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIHByb3RvY29sIGF0dGFjaG1lbnQgVVJJIHN0cmluZ3MgYmVmb3JlIHBhc3NpbmcgdGhlbSB0byB0aGUgYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LnRzJyk7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbyB3b3JsZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIGF0dGFjaG1lbnRzOiBbeyB0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsIHVyaTogZmlsZVVyaS50b1N0cmluZygpLCBsYWJlbDogJ3Rlc3QudHMnLCBkaXNwbGF5S2luZDogJ2RvY3VtZW50JyB9XSB9LFxuXHRcdFx0fTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscywgW3tcblx0XHRcdFx0c2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdHByb21wdDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0YXR0YWNobWVudHM6IFt7IHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSwgdXJpOiBmaWxlVXJpLnRvU3RyaW5nKCksIGxhYmVsOiAndGVzdC50cycsIGRpc3BsYXlLaW5kOiAnZG9jdW1lbnQnIH1dLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFzc2VzIHByb3RvY29sIHNlbGVjdGlvbiBhdHRhY2htZW50IHJhbmdlIHN0cmFpZ2h0IHRocm91Z2ggdG8gdGhlIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc2VsZWN0aW9uLnRzJyk7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0XHRcdFx0dXJpOiBmaWxlVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRsYWJlbDogJ3NlbGVjdGlvbi50cycsXG5cdFx0XHRcdFx0XHRkaXNwbGF5S2luZDogJ3NlbGVjdGlvbicsXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRcdFx0XHRzdGFydDogeyBsaW5lOiAyLCBjaGFyYWN0ZXI6IDMgfSxcblx0XHRcdFx0XHRcdFx0XHRlbmQ6IHsgbGluZTogNCwgY2hhcmFjdGVyOiA1IH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLCBbe1xuXHRcdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0cHJvbXB0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHRhdHRhY2htZW50czogW3tcblx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdFx0dXJpOiBmaWxlVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bGFiZWw6ICdzZWxlY3Rpb24udHMnLFxuXHRcdFx0XHRcdGRpc3BsYXlLaW5kOiAnc2VsZWN0aW9uJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0XHRcdHN0YXJ0OiB7IGxpbmU6IDIsIGNoYXJhY3RlcjogMyB9LFxuXHRcdFx0XHRcdFx0XHRlbmQ6IHsgbGluZTogNCwgY2hhcmFjdGVyOiA1IH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZXMgY2hhdCBhdHRhY2htZW50cyB0aGF0IHJlZmVyZW5jZSBhbm90aGVyIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IG90aGVyU2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0yJyk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBvdGhlclNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdPdGhlcicsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ob3RoZXJTZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMob3RoZXJTZXNzaW9uVXJpLnRvU3RyaW5nKCksIFt7XG5cdFx0XHRcdGlkOiAnb3RoZXItdHVybicsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ0Nyb3NzIHNlc3Npb24gbWVtb3J5Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3Jlc3BvbnNlJywgY29udGVudDogJ1JlY2FsbGVkIGFjcm9zcyBzZXNzaW9ucycgfV0sXG5cdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHR9XSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICdyZWFkIGFub3RoZXIgc2Vzc2lvbicsXG5cdFx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHRcdFx0XHRhdHRhY2htZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5DaGF0LFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IG90aGVyU2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0ZW5kVHVybjogJ290aGVyLXR1cm4nLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdPdGhlciBzZXNzaW9uJyxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLmF0dGFjaG1lbnRzPy5bMF07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dHlwZTogYXR0YWNobWVudD8udHlwZSxcblx0XHRcdFx0aGFzVXNlcjogYXR0YWNobWVudD8udHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSAmJiBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24/LmluY2x1ZGVzKCdVc2VyOiBDcm9zcyBzZXNzaW9uIG1lbW9yeScpLFxuXHRcdFx0XHRoYXNBc3Npc3RhbnQ6IGF0dGFjaG1lbnQ/LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUgJiYgYXR0YWNobWVudC5tb2RlbFJlcHJlc2VudGF0aW9uPy5pbmNsdWRlcygnQXNzaXN0YW50OiBSZWNhbGxlZCBhY3Jvc3Mgc2Vzc2lvbnMnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0aGFzVXNlcjogdHJ1ZSxcblx0XHRcdFx0aGFzQXNzaXN0YW50OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWdyYWRlcyB0byBhIG5vLWV4Y2VycHQgcG9pbnRlciB3aGVuIHRoZSByZWZlcmVuY2VkIGNoYXQgaXMgdW5yZXNvbHZhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBtaXNzaW5nU2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnbWlzc2luZycpO1xuXHRcdFx0Y29uc3QgcmVzb2x2aW5nU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0Ly8gTWlycm9ycyBhZ2VudFNlcnZpY2UuX3Jlc29sdmVDaGF0QXR0YWNobWVudFR1cm5zIHRocm93aW5nXG5cdFx0XHRcdC8vIFByb3RvY29sRXJyb3IoQUhQX1NFU1NJT05fTk9UX0ZPVU5EKSBmb3IgYSBjcm9zcy1zZXNzaW9uXG5cdFx0XHRcdC8vIHJlZmVyZW5jZSB0aGlzIGhvc3QgY2Fubm90IHJlc3RvcmUuXG5cdFx0XHRcdHJlc29sdmVDaGF0QXR0YWNobWVudFR1cm5zOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignQUhQX1NFU1NJT05fTk9UX0ZPVU5EJyk7IH0sXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdHJlc29sdmluZ1NpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICdyZWFkIGEgc3RhbGUgcmVmZXJlbmNlJyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogbWlzc2luZ1Nlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGVuZFR1cm46ICdnb25lLXR1cm4nLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdTdGFsZSBjaGF0Jyxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLmF0dGFjaG1lbnRzPy5bMF07XG5cdFx0XHQvLyBBIHN0YWxlL3VucmVhY2hhYmxlIHJlZmVyZW5jZSBtdXN0IG5vdCBmYWlsIHRoZSB0dXJuOiBpdCByZXNvbHZlcyB0b1xuXHRcdFx0Ly8gYSBwb2ludGVyIHdpdGggbm8gZXhjZXJwdCBhbmQgdGhlIGVuZFR1cm4gcGluIGlzIGRyb3BwZWQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dHlwZTogYXR0YWNobWVudD8udHlwZSxcblx0XHRcdFx0bGFiZWw6IGF0dGFjaG1lbnQ/LmxhYmVsLFxuXHRcdFx0XHRub0V4Y2VycHQ6IGF0dGFjaG1lbnQ/LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUgJiYgYXR0YWNobWVudC5tb2RlbFJlcHJlc2VudGF0aW9uPy5pbmNsdWRlcygnaGFzIG5vIHRyYW5zY3JpcHQgY29udGVudCB1cCB0byB0aGUgc2VsZWN0ZWQgdHVybicpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRsYWJlbDogJ1N0YWxlIGNoYXQnLFxuXHRcdFx0XHRub0V4Y2VycHQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F3YWl0cyBoeWRyYXRlZCB0dXJucyB3aGVuIHJlc29sdmluZyBhIGNoYXQgYXR0YWNobWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc291cmNlVHVybjogVHVybiA9IHtcblx0XHRcdFx0aWQ6ICdzb3VyY2UtdHVybicsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ1JlbWVtYmVyIFgnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncmVzcG9uc2UnLCBjb250ZW50OiAnUmVtZW1iZXJlZCcgfV0sXG5cdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzb2x2aW5nU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0cmVzb2x2ZUNoYXRBdHRhY2htZW50VHVybnM6IGFzeW5jICgpID0+IFtzb3VyY2VUdXJuXSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmVzb2x2aW5nU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1doYXQgd2FzIHJlbWVtYmVyZWQ/Jyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0ZW5kVHVybjogc291cmNlVHVybi5pZCxcblx0XHRcdFx0XHRcdGxhYmVsOiAnRWFybGllciBjaGF0Jyxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLmF0dGFjaG1lbnRzPy5bMF07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dHlwZTogYXR0YWNobWVudD8udHlwZSxcblx0XHRcdFx0aGFzVXNlcjogYXR0YWNobWVudD8udHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSAmJiBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24/LmluY2x1ZGVzKCdVc2VyOiBSZW1lbWJlciBYJyksXG5cdFx0XHRcdGhhc0Fzc2lzdGFudDogYXR0YWNobWVudD8udHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSAmJiBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24/LmluY2x1ZGVzKCdBc3Npc3RhbnQ6IFJlbWVtYmVyZWQnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0aGFzVXNlcjogdHJ1ZSxcblx0XHRcdFx0aGFzQXNzaXN0YW50OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwaW5zIHRoZSBsYXRlc3QgY29tcGxldGVkIHR1cm4gd2hlbiBhIGNoYXQgYXR0YWNobWVudCBvbWl0cyBlbmRUdXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBvbGRlclR1cm46IFR1cm4gPSB7XG5cdFx0XHRcdGlkOiAnb2xkZXItdHVybicsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ1JlbWVtYmVyIFgnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncjEnLCBjb250ZW50OiAnUmVtZW1iZXJlZCBYJyB9XSxcblx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsYXRlc3RUdXJuOiBUdXJuID0ge1xuXHRcdFx0XHRpZDogJ2xhdGVzdC10dXJuJyxcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnUmVtZW1iZXIgWicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdyMicsIGNvbnRlbnQ6ICdSZW1lbWJlcmVkIFonIH1dLFxuXHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc29sdmluZ1NpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCksXG5cdFx0XHRcdHJlc29sdmVDaGF0QXR0YWNobWVudFR1cm5zOiBhc3luYyAoKSA9PiBbb2xkZXJUdXJuLCBsYXRlc3RUdXJuXSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmVzb2x2aW5nU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1doYXQgd2FzIHJlbWVtYmVyZWQ/Jyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdFYXJsaWVyIGNoYXQnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0uYXR0YWNobWVudHM/LlswXTtcblx0XHRcdC8vIE5vIGVuZFR1cm4gcGluLCBzbyB0aGUgd2hvbGUgcmV0YWluZWQgdHJhbnNjcmlwdCByZXNvbHZlcyBcdTIwMTQgaW5jbHVkaW5nXG5cdFx0XHQvLyB0aGUgbGF0ZXN0IGNvbXBsZXRlZCB0dXJuLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHR5cGU6IGF0dGFjaG1lbnQ/LnR5cGUsXG5cdFx0XHRcdGhhc09sZGVyOiBhdHRhY2htZW50Py50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlICYmIGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbj8uaW5jbHVkZXMoJ0Fzc2lzdGFudDogUmVtZW1iZXJlZCBYJyksXG5cdFx0XHRcdGhhc0xhdGVzdDogYXR0YWNobWVudD8udHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSAmJiBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24/LmluY2x1ZGVzKCdBc3Npc3RhbnQ6IFJlbWVtYmVyZWQgWicpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRoYXNPbGRlcjogdHJ1ZSxcblx0XHRcdFx0aGFzTGF0ZXN0OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGNoYXQgYXR0YWNobWVudHMgd2hvc2UgZW5kVHVybiBpcyBtaXNzaW5nIGZyb20gdGhlIHJldGFpbmVkIHRyYW5zY3JpcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhzZXNzaW9uVXJpLnRvU3RyaW5nKCksIFt7XG5cdFx0XHRcdGlkOiAnc291cmNlLXR1cm4nLFxuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdSZW1lbWJlciBYJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3Jlc3BvbnNlJywgY29udGVudDogJ1JlbWVtYmVyZWQnIH1dLFxuXHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCBlcnJvciA9IEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlLCAoZW52ZWxvcGUpOiBlbnZlbG9wZSBpcyBBY3Rpb25FbnZlbG9wZSA9PlxuXHRcdFx0XHRlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3IgJiYgZW52ZWxvcGUuY2hhbm5lbCA9PT0gZGVmYXVsdENoYXRVcmkpKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICdXaGF0IHdhcyByZW1lbWJlcmVkPycsXG5cdFx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHRcdFx0XHRhdHRhY2htZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5DaGF0LFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGVuZFR1cm46ICdtaXNzaW5nLXR1cm4nLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdFYXJsaWVyIGNoYXQnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlID0gYXdhaXQgZXJyb3I7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2VuZE1lc3NhZ2VDYWxsczogYWdlbnQuc2VuZE1lc3NhZ2VDYWxscy5sZW5ndGgsXG5cdFx0XHRcdGVycm9yVHlwZTogZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yID8gZW52ZWxvcGUuYWN0aW9uLmVycm9yLmVycm9yVHlwZSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2VuZE1lc3NhZ2VDYWxsczogMCxcblx0XHRcdFx0ZXJyb3JUeXBlOiAnc2VuZEZhaWxlZCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgY2hhdCBhdHRhY2htZW50cyB3aG9zZSBlbmRUdXJuIGlzIHN0aWxsIGFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAncGVlci0xJyk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHBlZXJDaGF0VXJpLCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24ocGVlckNoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ2FjdGl2ZS10dXJuJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnUmVtZW1iZXIgWCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXG5cdFx0XHRjb25zdCBlcnJvciA9IEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlLCAoZW52ZWxvcGUpOiBlbnZlbG9wZSBpcyBBY3Rpb25FbnZlbG9wZSA9PlxuXHRcdFx0XHRlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3IgJiYgZW52ZWxvcGUuY2hhbm5lbCA9PT0gZGVmYXVsdENoYXRVcmkpKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICdXaGF0IHdhcyByZW1lbWJlcmVkPycsXG5cdFx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHRcdFx0XHRhdHRhY2htZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5DaGF0LFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IHBlZXJDaGF0VXJpLFxuXHRcdFx0XHRcdFx0ZW5kVHVybjogJ2FjdGl2ZS10dXJuJyxcblx0XHRcdFx0XHRcdGxhYmVsOiAnRWFybGllciBjaGF0Jyxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IGF3YWl0IGVycm9yO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNlbmRNZXNzYWdlQ2FsbHM6IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoLFxuXHRcdFx0XHRlcnJvclR5cGU6IGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvciA/IGVudmVsb3BlLmFjdGlvbi5lcnJvci5lcnJvclR5cGUgOiB1bmRlZmluZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNlbmRNZXNzYWdlQ2FsbHM6IDAsXG5cdFx0XHRcdGVycm9yVHlwZTogJ3NlbmRGYWlsZWQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwYXRjaGVzIHNlc3Npb24vZXJyb3Igd2hlbiBubyBhZ2VudCBpcyBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgZW1wdHlBZ2VudHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50W10+KCdhZ2VudHMnLCBbXSk7XG5cdFx0XHRjb25zdCBub0FnZW50U2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRhZ2VudHM6IGVtcHR5QWdlbnRzLFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IHt9IGFzIElTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0bm9BZ2VudFNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZXJyb3JBY3Rpb24gPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKTtcblx0XHRcdGFzc2VydC5vayhlcnJvckFjdGlvbiwgJ3Nob3VsZCBkaXNwYXRjaCBzZXNzaW9uL2Vycm9yJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGEgdHVybiBvbiBhbiBhcmNoaXZlZCBzZXNzaW9uIHdpdGhvdXQgY2FsbGluZyB0aGUgYWdlbnQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQsIGlzQXJjaGl2ZWQ6IHRydWUgfSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZXJyb3JBY3Rpb24gPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKTtcblx0XHRcdGFzc2VydC5vayhlcnJvckFjdGlvbiwgJ3Nob3VsZCBkaXNwYXRjaCBhIGNoYXQgZXJyb3IgZm9yIGFuIGFyY2hpdmVkIHNlc3Npb24nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBhIHR1cm4gb24gYSByZWFkLW9ubHkgY2hhdCB3aXRob3V0IGNhbGxpbmcgdGhlIGFnZW50JywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHQvLyBBIHJlYWQtb25seSBwZWVyIGNoYXQgKGUuZy4gYSBzdWJhZ2VudCB3b3JrZXIpIG9uIGEgbm9uLWFyY2hpdmVkXG5cdFx0XHQvLyBzZXNzaW9uIFx1MjAxNCBlbmZvcmNlbWVudCBrZXlzIG9mZiB0aGUgY2hhdCdzIGludGVyYWN0aXZpdHksIG5vdCBhcmNoaXZlZC5cblx0XHRcdGNvbnN0IHJlYWRPbmx5Q2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci1ybycpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaS50b1N0cmluZygpLCByZWFkT25seUNoYXQsIHsgaW50ZXJhY3Rpdml0eTogQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHkgfSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihyZWFkT25seUNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGVycm9yQWN0aW9uID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvcik7XG5cdFx0XHRhc3NlcnQub2soZXJyb3JBY3Rpb24sICdzaG91bGQgZGlzcGF0Y2ggYSBjaGF0IGVycm9yIGZvciBhIHJlYWQtb25seSBjaGF0Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBoYW5kbGVBY3Rpb246IGZpcnN0LXR1cm4gbWF0ZXJpYWxpemF0aW9uIGZhaWx1cmUgLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2hhbmRsZUFjdGlvbiBcdTIwMTQgZmlyc3QtdHVybiBtYXRlcmlhbGl6YXRpb24gZmFpbHVyZScsICgpID0+IHtcblx0XHQvKipcblx0XHQgKiBDcmVhdGUgYSBwcm92aXNpb25hbCAobm90LXlldC1tYXRlcmlhbGl6ZWQpIHNlc3Npb246IG5vIGBTZXNzaW9uUmVhZHlgXG5cdFx0ICogKHNvIGxpZmVjeWNsZSBzdGF5cyBgQ3JlYXRpbmdgKSBhbmQgYSBkZWZlcnJlZCBgU2Vzc2lvbkFkZGVkYCBcdTIwMTQgbWlycm9yaW5nXG5cdFx0ICogaG93IHRoZSBhZ2VudCBob3N0IGNyZWF0ZXMgYSBzZXNzaW9uIHdob3NlIHdvcmt0cmVlL1NESyBzZXR1cCBoYXBwZW5zIG9uXG5cdFx0ICogdGhlIGZpcnN0IGBzZW5kTWVzc2FnZWAuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gc2V0dXBQcm92aXNpb25hbFNlc3Npb24oKTogdm9pZCB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fSwgeyBlbWl0Tm90aWZpY2F0aW9uOiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzdXJmYWNlcyBhIGZhaWxlZCBwcm92aXNpb25hbCBmaXJzdCB0dXJuIGFzIGEgdGVybWluYWwgY3JlYXRpb24gZmFpbHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwUHJvdmlzaW9uYWxTZXNzaW9uKCk7XG5cdFx0XHRhZ2VudC5zZW5kTWVzc2FnZUVycm9yID0gbmV3IEVycm9yKCdnaXQgLWMgZXhpdGVkIHdpdGggY29kZSAxMjg6IGZhdGFsOiBpbnZhbGlkIHJlZmVyZW5jZTogbWFpbicpO1xuXG5cdFx0XHQvLyBSZWR1Y2UgdGhlIHR1cm4gc3RhcnQgKGFzIHRoZSBjbGllbnQgd291bGQpIHNvIHRoZSBjaGF0IGhhcyBhblxuXHRcdFx0Ly8gYWN0aXZlIHR1cm4gZm9yIHRoZSBzdWJzZXF1ZW50IENoYXRFcnJvciB0byB0ZXJtaW5hdGUsIHRoZW4gaW52b2tlXG5cdFx0XHQvLyB0aGUgc2lkZSBlZmZlY3RzIHRoYXQgZHJpdmUgYHNlbmRNZXNzYWdlYC5cblx0XHRcdGNvbnN0IHR1cm5TdGFydGVkID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIGNvbnN0O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB0dXJuU3RhcnRlZCwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0Tm90aWZpY2F0aW9uKG4gPT4gbm90aWZpY2F0aW9ucy5wdXNoKG4pKSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgdHVyblN0YXJ0ZWQpO1xuXG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgYXN5bmMgc2VuZCByZWplY3Rpb24gKyBjYXRjaCBoYW5kbGluZyB0byBydW4uXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNyZWF0aW9uRmFpbGVkKSB8fCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uQWRkZWQgPSBub3RpZmljYXRpb25zLmZpbmQobiA9PiBuLnR5cGUgPT09ICdyb290L3Nlc3Npb25BZGRlZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNoYXRFcnJvcjogZW52ZWxvcGVzLnNvbWUoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvciksXG5cdFx0XHRcdGNyZWF0aW9uRmFpbGVkOiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNyZWF0aW9uRmFpbGVkKSxcblx0XHRcdFx0bGlmZWN5Y2xlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LmxpZmVjeWNsZSxcblx0XHRcdFx0c2Vzc2lvbkFkZGVkV2l0aEVycm9yOiAhIXNlc3Npb25BZGRlZCAmJiAoc2Vzc2lvbkFkZGVkLnN1bW1hcnkuc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5FcnJvcikgPT09IFNlc3Npb25TdGF0dXMuRXJyb3IsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNoYXRFcnJvcjogdHJ1ZSxcblx0XHRcdFx0Y3JlYXRpb25GYWlsZWQ6IHRydWUsXG5cdFx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGlvbkZhaWxlZCxcblx0XHRcdFx0c2Vzc2lvbkFkZGVkV2l0aEVycm9yOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdXJmYWNlcyBhIHdvcmtpbmcgZGlyZWN0b3J5IHJlc29sdXRpb24gZmFpbHVyZSB3aXRob3V0IGNhbGxpbmcgdGhlIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBQcm92aXNpb25hbFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHJlc29sdXRpb25FcnJvciA9IG5ldyBFcnJvcignVGhlIGlzb2xhdGVkIHdvcmt0cmVlIGNvdWxkIG5vdCBiZSByZXN0b3JlZCcpO1xuXHRcdFx0Y29uc3QgcmVzb2x2aW5nU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IHt9IGFzIElTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRcdHJlc29sdmVXb3JraW5nRGlyZWN0b3J5QmVmb3JlU2VuZDogYXN5bmMgKCkgPT4geyB0aHJvdyByZXNvbHV0aW9uRXJyb3I7IH0sXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHR1cm5TdGFydGVkID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIGNvbnN0O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB0dXJuU3RhcnRlZCwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cdFx0XHRyZXNvbHZpbmdTaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHR1cm5TdGFydGVkKTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gZW52ZWxvcGVzLnNvbWUoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DcmVhdGlvbkZhaWxlZCkgfHwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNoYXRFcnJvcjogZW52ZWxvcGVzLnNvbWUoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvciksXG5cdFx0XHRcdGNyZWF0aW9uRmFpbGVkOiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNyZWF0aW9uRmFpbGVkKSxcblx0XHRcdFx0bGlmZWN5Y2xlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LmxpZmVjeWNsZSxcblx0XHRcdFx0c2VuZE1lc3NhZ2VDYWxsczogYWdlbnQuc2VuZE1lc3NhZ2VDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2hhdEVycm9yOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGlvbkZhaWxlZDogdHJ1ZSxcblx0XHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW9uRmFpbGVkLFxuXHRcdFx0XHRzZW5kTWVzc2FnZUNhbGxzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FwdHVyZXMgdGhlIHR1cm4gc3RhcnQgYmVmb3JlIHNlbmRpbmcgdGhlIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFByb3Zpc2lvbmFsU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvd2QnKTtcblx0XHRcdGNvbnN0IGNhcHR1cmVTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgcmVsZWFzZUNhcHR1cmUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCBjYXB0dXJlczogQXJyYXk8eyBzZXNzaW9uOiBzdHJpbmc7IHR1cm5JZDogc3RyaW5nOyB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkIH0+ID0gW107XG5cdFx0XHRjb25zdCBjaGVja3BvaW50czogSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlID0ge1xuXHRcdFx0XHQuLi5OVUxMX0NIRUNLUE9JTlRfU0VSVklDRSxcblx0XHRcdFx0Y2FwdHVyZVR1cm5TdGFydENoZWNrcG9pbnQ6IGFzeW5jIChzZXNzaW9uLCBfY2hhdCwgdHVybklkLCB3b3JraW5nRGlyZWN0b3JpZXMpID0+IHtcblx0XHRcdFx0XHRjYXB0dXJlcy5wdXNoKHsgc2Vzc2lvbjogc2Vzc2lvbi50b1N0cmluZygpLCB0dXJuSWQsIHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yaWVzPy5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSB9KTtcblx0XHRcdFx0XHRjYXB0dXJlU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdGF3YWl0IHJlbGVhc2VDYXB0dXJlLnA7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHRyZXNvbHZlV29ya2luZ0RpcmVjdG9yeUJlZm9yZVNlbmQ6IGFzeW5jICgpID0+IFt3b3JraW5nRGlyZWN0b3J5XSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGVja3BvaW50cyk7XG5cdFx0XHRjb25zdCB0dXJuU3RhcnRlZCA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSBhcyBjb25zdDtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgdHVyblN0YXJ0ZWQsIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXG5cdFx0XHRsb2NhbFNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgdHVyblN0YXJ0ZWQpO1xuXHRcdFx0YXdhaXQgY2FwdHVyZVN0YXJ0ZWQucDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscywgW10pO1xuXG5cdFx0XHRjb25zdCBkaWRTZW5kTWVzc2FnZSA9IEV2ZW50LnRvUHJvbWlzZShhZ2VudC5vbkRpZFNlbmRNZXNzYWdlKTtcblx0XHRcdHJlbGVhc2VDYXB0dXJlLmNvbXBsZXRlKCk7XG5cdFx0XHRhd2FpdCBkaWRTZW5kTWVzc2FnZTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYXB0dXJlcywgW3tcblx0XHRcdFx0c2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFt3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCldLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xpZW50IGNhbmNlbGxhdGlvbiBkaXNjYXJkcyB0aGUgcGVuZGluZyB0dXJuIHN0YXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBQcm92aXNpb25hbFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGRpc2NhcmRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IGNoZWNrcG9pbnRzOiBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgPSB7XG5cdFx0XHRcdC4uLk5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0XHRkaXNjYXJkVHVyblN0YXJ0Q2hlY2twb2ludDogYXN5bmMgKHNlc3Npb24sIGNoYXQsIHR1cm5JZCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZXNzaW9uOiBzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IGNoYXQudG9TdHJpbmcoKSwgdHVybklkIH0sIHtcblx0XHRcdFx0XHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGNoYXQ6IGRlZmF1bHRDaGF0VXJpLFxuXHRcdFx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRkaXNjYXJkZWQuY29tcGxldGUoKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGVja3BvaW50cyk7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRkdXJhdGlvbjogMCxcblx0XHRcdH0sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0YXdhaXQgZGlzY2FyZGVkLnA7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWxsYXRpb24gYmVmb3JlIHNlbmQgc2tpcHMgdHVybi1zdGFydCBjYXB0dXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBQcm92aXNpb25hbFNlc3Npb24oKTtcblx0XHRcdGxldCBjYXB0dXJlQ291bnQgPSAwO1xuXHRcdFx0Y29uc3QgY2hlY2twb2ludHM6IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSA9IHtcblx0XHRcdFx0Li4uTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsXG5cdFx0XHRcdGNhcHR1cmVUdXJuU3RhcnRDaGVja3BvaW50OiBhc3luYyAoKSA9PiB7IGNhcHR1cmVDb3VudCsrOyB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0cmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlCZWZvcmVTZW5kOiBhc3luYyAoKSA9PiBbVVJJLmZpbGUoJy93ZCcpXSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGVja3BvaW50cyk7XG5cdFx0XHRjb25zdCBjYW5jZWxsZWQgPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAwLFxuXHRcdFx0fSBhcyBjb25zdDtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgY2FuY2VsbGVkLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdGNvbnN0IHN0YXJ0ZWQgPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0gYXMgY29uc3Q7XG5cblx0XHRcdGxvY2FsU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzdGFydGVkKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjYXB0dXJlQ291bnQsIHNlbmRNZXNzYWdlQ2FsbHM6IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMgfSwge1xuXHRcdFx0XHRjYXB0dXJlQ291bnQ6IDAsXG5cdFx0XHRcdHNlbmRNZXNzYWdlQ2FsbHM6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdBZ2VudFNpZGVFZmZlY3RzIG93bnMgZXhhY3RseSBvbmUgQ2hhdEVycm9yIHdoZW4gYW4gYWxyZWFkeS1yZWFkeSBzZXNzaW9uIHNlbmQgcmVqZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpOyAvLyBkaXNwYXRjaGVzIFNlc3Npb25SZWFkeSAtPiBsaWZlY3ljbGUgUmVhZHlcblx0XHRcdGFnZW50LnNlbmRNZXNzYWdlRXJyb3IgPSBuZXcgRXJyb3IoJ3RyYW5zaWVudCBzZW5kIGZhaWx1cmUnKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSB8fCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2hhdEVycm9yczogZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKS5sZW5ndGgsXG5cdFx0XHRcdGNyZWF0aW9uRmFpbGVkOiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNyZWF0aW9uRmFpbGVkKSxcblx0XHRcdFx0bGlmZWN5Y2xlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LmxpZmVjeWNsZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2hhdEVycm9yczogMSxcblx0XHRcdFx0Y3JlYXRpb25GYWlsZWQ6IGZhbHNlLFxuXHRcdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGR1cGxpY2F0ZSBhIENvZGV4IHByb3ZpZGVyLW93bmVkIGZhaWx1cmUgd2hlbiBzZW5kTWVzc2FnZSByZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTZW5kTWVzc2FnZSA9IGFnZW50LnNlbmRNZXNzYWdlLmJpbmQoYWdlbnQpO1xuXHRcdFx0YWdlbnQuc2VuZE1lc3NhZ2UgPSBhc3luYyAoLi4uYXJncykgPT4ge1xuXHRcdFx0XHRhd2FpdCBvcmlnaW5hbFNlbmRNZXNzYWdlKC4uLmFyZ3MpO1xuXHRcdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxLCBlcnJvcjogeyBlcnJvclR5cGU6ICdDb2RleE1hdGVyaWFsaXplRmFpbGVkJywgbWVzc2FnZTogJ3dvcmtzcGFjZSByb290IHJlamVjdGVkJyB9IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHR1cm5TdGFydGVkID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIGNvbnN0O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB0dXJuU3RhcnRlZCwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHR1cm5TdGFydGVkKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGVudmVsb3Blcy5zb21lKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlKSB8fCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRlbnZlbG9wZXNcblx0XHRcdFx0XHQuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3IgfHwgZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlKVxuXHRcdFx0XHRcdC5tYXAoZSA9PiBlLmFjdGlvbi50eXBlKSxcblx0XHRcdFx0W0FjdGlvblR5cGUuQ2hhdEVycm9yLCBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGVdLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBoYW5kbGVBY3Rpb246IGdlbmVyaWMgL3JlbmFtZSBzbGFzaCBjb21tYW5kIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gXHUyMDE0IC9yZW5hbWUgc2xhc2ggY29tbWFuZCcsICgpID0+IHtcblxuXHRcdC8vIGAvcmVuYW1lYCBwZXJzaXN0cyB0aGUgbmV3IHRpdGxlLCBzbyB0aGVzZSB0ZXN0cyBuZWVkIGEgc2Vzc2lvbiBkYXRhXG5cdFx0Ly8gc2VydmljZSB3aG9zZSBgb3BlbkRhdGFiYXNlYCBhY3R1YWxseSByZXR1cm5zIGEgZGF0YWJhc2UgKHRoZSBkZWZhdWx0XG5cdFx0Ly8gbnVsbCBzZXJ2aWNlIHRocm93cykuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlUmVuYW1lU2lkZUVmZmVjdHMoKTogQWdlbnRTaWRlRWZmZWN0cyB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JlZGlyZWN0cyAvcmVuYW1lIHRvIGEgdGl0bGUgY2hhbmdlIGFuZCBjb21wbGV0ZXMgdGhlIHR1cm4gd2l0aG91dCBjYWxsaW5nIHRoZSBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcmVuYW1lU2lkZUVmZmVjdHMgPSBjcmVhdGVSZW5hbWVTaWRlRWZmZWN0cygpO1xuXHRcdFx0Y29uc3QgYWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnL3JlbmFtZSBSZW5hbWVkIFNlc3Npb24nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0Ly8gTWlycm9yIHByb2R1Y3Rpb246IHRoZSByZWR1Y2VyIGFwcGxpZXMgdGhlIHR1cm4sIHRoZW4gc2lkZSBlZmZlY3RzIHJ1bi5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHJlbmFtZVNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy50aXRsZSwgJ1JlbmFtZWQgU2Vzc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQoc2Vzc2lvblVyaS50b1N0cmluZygpKSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZT8udHVybnMuYXQoLTEpPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gPyBwYXJ0LmNvbnRlbnQgOiB1bmRlZmluZWQsICdSZW5hbWVkOiBSZW5hbWVkIFNlc3Npb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy9yZW5hbWUgd2l0aG91dCBhIHRpdGxlIGNvbXBsZXRlcyB0aGUgdHVybiBhbmQgbGVhdmVzIHRoZSB0aXRsZSB1bmNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHJlbmFtZVNpZGVFZmZlY3RzID0gY3JlYXRlUmVuYW1lU2lkZUVmZmVjdHMoKTtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJy9yZW5hbWUnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0cmVuYW1lU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnRpdGxlLCAnVGVzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQoc2Vzc2lvblVyaS50b1N0cmluZygpKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlZXIgL3JlbmFtZSBzeW5jaHJvbm91c2x5IHN1cHByZXNzZXMgdGhlIGF1dG9tYXRpYyByZW5hbWUgcmVtaW5kZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdEFjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uQ29uZmlnS2V5XTogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZW5hbWVTaWRlRWZmZWN0cyA9IGNyZWF0ZVJlbmFtZVNpZGVFZmZlY3RzKCk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICdwZWVyLXJlbmFtZScpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaS50b1N0cmluZygpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ0F1dG9tYXRpYyBwZWVyIHRpdGxlJyB9KTtcblx0XHRcdHJlbmFtZVNpZGVFZmZlY3RzLm1hcmtUaXRsZUF1dG8oc2Vzc2lvblVyaS50b1N0cmluZygpLCBwZWVyQ2hhdCwgJ0F1dG9tYXRpYyBwZWVyIHRpdGxlJyk7XG5cdFx0XHRjb25zdCByZW5hbWVBY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLXJlbmFtZScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJy9yZW5hbWUgVXNlciBQZWVyIFRpdGxlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihwZWVyQ2hhdCwgcmVuYW1lQWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHJlbmFtZVNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihwZWVyQ2hhdCwgcmVuYW1lQWN0aW9uKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IChcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdCk/LnRpdGxlID09PSAnVXNlciBQZWVyIFRpdGxlJ1xuXHRcdFx0XHQmJiBzdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHBlZXJDaGF0KSA9PT0gdW5kZWZpbmVkXG5cdFx0XHQpIHx8IHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IGZvbGxvd1VwQWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1mb2xsb3ctdXAnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAxLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdDb250aW51ZScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24ocGVlckNoYXQsIGZvbGxvd1VwQWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMiB9KTtcblx0XHRcdHJlbmFtZVNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihwZWVyQ2hhdCwgZm9sbG93VXBBY3Rpb24pO1xuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLnByb21wdCwgJ0NvbnRpbnVlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvbWF0aWMgcmVuYW1lIGd1aWRhbmNlIGlzIHRyYW5zaWVudCBjb250ZXh0IGFuZCBuZXZlciBjaGFuZ2VzIHRoZSB1c2VyIHByb21wdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0QWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25Db25maWdLZXldOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlbmFtZVNpZGVFZmZlY3RzID0gY3JlYXRlUmVuYW1lU2lkZUVmZmVjdHMoKTtcblx0XHRcdHJlbmFtZVNpZGVFZmZlY3RzLm1hcmtUaXRsZUF1dG8oc2Vzc2lvblVyaS50b1N0cmluZygpLCB1bmRlZmluZWQsICdBdXRvbWF0aWMgdGl0bGUnKTtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tZ3VpZGFuY2UnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdLZWVwIEdpdEh1YiBjYXNpbmcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0cmVuYW1lU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cblx0XHRcdGNvbnN0IHNlbmRDb250ZXh0ID0gYWdlbnQuY2hhdENvbnRleHRzLmZpbmQoY2FsbCA9PiBjYWxsLmJvdW5kYXJ5ID09PSAnc2VuZE1lc3NhZ2UnKT8uY29udGV4dDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLnByb21wdCwgJ0tlZXAgR2l0SHViIGNhc2luZycpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFVUkkuaXNVcmkoc2VuZENvbnRleHQpICYmIHNlbmRDb250ZXh0Py5ob3N0SW5zdHJ1Y3Rpb25zPy5bMF0uaW5jbHVkZXMoJ2ByZW5hbWVfY2hhdGAnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIG1lc3NhZ2UgdGhhdCBtZXJlbHkgc3RhcnRzIHdpdGggL3JlbmFtZSB0ZXh0IChubyBzZXBhcmF0b3IpIGlzIHNlbnQgdG8gdGhlIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCByZW5hbWVTaWRlRWZmZWN0cyA9IGNyZWF0ZVJlbmFtZVNpZGVFZmZlY3RzKCk7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcvcmVuYW1lZCB0aGluZycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRyZW5hbWVTaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLCBbeyBzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaS50b1N0cmluZygpKSwgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcHJvbXB0OiAnL3JlbmFtZWQgdGhpbmcnLCBhdHRhY2htZW50czogdW5kZWZpbmVkIH1dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBoYW5kbGVBY3Rpb246IGdlbmVyaWMgISB0ZXJtaW5hbCBjb21tYW5kIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gXHUyMDE0ICEgdGVybWluYWwgY29tbWFuZCcsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUJhbmdTaWRlRWZmZWN0cyh0ZXJtaW5hbE1hbmFnZXI6IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIpOiBBZ2VudFNpZGVFZmZlY3RzIHtcblx0XHRcdHJldHVybiBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRlcm1pbmFsTWFuYWdlcik7XG5cdFx0fVxuXG5cdFx0dGVzdCgncnVucyBhICEgbWVzc2FnZSBhcyBhIHRlcm1pbmFsIGNvbW1hbmQgYW5kIGNvbXBsZXRlcyB0aGUgdHVybiB3aXRob3V0IGNhbGxpbmcgdGhlIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dvcmsnKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKTtcblx0XHRcdGNvbnN0IGJhbmdTaWRlRWZmZWN0cyA9IGNyZWF0ZUJhbmdTaWRlRWZmZWN0cyh0ZXJtaW5hbE1hbmFnZXIpO1xuXHRcdFx0Y29uc3QgYWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnIWVjaG8gaGknLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0Ly8gTWlycm9yIHByb2R1Y3Rpb246IHRoZSByZWR1Y2VyIG9wZW5zIHRoZSB0dXJuLCB0aGVuIHNpZGUgZWZmZWN0cyBydW4uXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRiYW5nU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXG5cdFx0XHQvLyBXYWl0IHVudGlsIHRoZSBjb21tYW5kIGlzIHJ1bm5pbmcgKGl0cyBjb21wbGV0aW9uIGxpc3RlbmVyIGlzXG5cdFx0XHQvLyByZWdpc3RlcmVkKSwgdGhlbiBzaWduYWwgdGhhdCB0aGUgY29tbWFuZCBmaW5pc2hlZC5cblx0XHRcdGF3YWl0IHRlcm1pbmFsTWFuYWdlci5jb21tYW5kRmluaXNoZWRMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRcdGNvbnN0IHRlcm1pbmFsVXJpID0gdGVybWluYWxNYW5hZ2VyLmNyZWF0ZWRbMF0uY2hhbm5lbDtcblx0XHRcdHRlcm1pbmFsTWFuYWdlci5maXJlQ29tbWFuZEZpbmlzaGVkKHsgY29tbWFuZElkOiAnMScsIGNvbW1hbmQ6ICdlY2hvIGhpJywgZXhpdENvZGU6IDAsIG91dHB1dDogJ2hpXFxuJyB9KTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHR1cm4gdG8gYmUgY2xvc2VkIG91dC5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IHN0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQoc2Vzc2lvblVyaS50b1N0cmluZygpKSA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RhdGU/LnR1cm5zLmF0KC0xKT8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGNvbnN0IHRvb2xDYWxsID0gcGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwgOiB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbENhbGw/LnN0YXR1cywgVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sQ2FsbD8uc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyB0b29sQ2FsbC5zdWNjZXNzIDogdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayh0b29sQ2FsbD8uc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWRcblx0XHRcdFx0JiYgdG9vbENhbGwuY29udGVudD8uc29tZShjID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsICYmIGMucmVzb3VyY2UgPT09IHRlcm1pbmFsVXJpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayh0ZXJtaW5hbE1hbmFnZXIuc2VudFRleHRzLnNvbWUocyA9PiBzLmRhdGEuaW5jbHVkZXMoJ2VjaG8gaGknKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBsb25lICEgaXMgZm9yd2FyZGVkIHRvIHRoZSBhZ2VudCBpbnN0ZWFkIG9mIHJ1bm5pbmcgYSBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoKSk7XG5cdFx0XHRjb25zdCBiYW5nU2lkZUVmZmVjdHMgPSBjcmVhdGVCYW5nU2lkZUVmZmVjdHModGVybWluYWxNYW5hZ2VyKTtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJyEnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0YmFuZ1NpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLnByb21wdCwgJyEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtaW5hbE1hbmFnZXIuY3JlYXRlZC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjb3JkcyB0aGUgY29tcGxldGVkIGJhbmcgdHVybiBhcyBhIGxvY2FsIHR1cm4sIHN0cmlwcGVkIG9mIHRoZSBsaXZlIHRlcm1pbmFsIHJlZmVyZW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93b3JrJyk7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFR1cm5zID0gbmV3IEFnZW50SG9zdExvY2FsVHVybnMoY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCkpO1xuXHRcdFx0Y29uc3QgYmFuZ1NpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLFxuXHRcdFx0XHRsb2NhbFR1cm5zLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGVybWluYWxNYW5hZ2VyKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnIWVjaG8gaGknLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0YmFuZ1NpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgdGVybWluYWxNYW5hZ2VyLmNvbW1hbmRGaW5pc2hlZExpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdFx0dGVybWluYWxNYW5hZ2VyLmZpcmVDb21tYW5kRmluaXNoZWQoeyBjb21tYW5kSWQ6ICcxJywgY29tbWFuZDogJ2VjaG8gaGknLCBleGl0Q29kZTogMCwgb3V0cHV0OiAnaGlcXG4nIH0pO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uVXJpLnRvU3RyaW5nKCkpID09PSB1bmRlZmluZWQgPyB0cnVlIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gVGhlIHR1cm4gd2l0aCBubyBwcmVjZWRpbmcgcmVhbCB0dXJuIGhhcyBubyBhbmNob3IuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxUdXJucy5yZXNvbHZlQ29uY3JldGVUdXJuSWQoZGVmYXVsdENoYXRVcmksICd0dXJuLTEnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHBlcnNpc3RlZCA9IGF3YWl0IGRiLmdldExvY2FsVHVybnMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzaXN0ZWQubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKHBlcnNpc3RlZFswXS5wYXlsb2FkKSBhcyB7IHJlc3BvbnNlUGFydHM6IHsga2luZDogc3RyaW5nOyB0b29sQ2FsbD86IHsgY29udGVudD86IHsgdHlwZTogc3RyaW5nIH1bXSB9IH1bXSB9O1xuXHRcdFx0Y29uc3QgdG9vbENhbGxQYXJ0ID0gcGF5bG9hZC5yZXNwb25zZVBhcnRzLmZpbmQocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0Ly8gTGl2ZSB0ZXJtaW5hbCByZWZlcmVuY2UgaXMgc3RyaXBwZWQ7IHRleHQgb3V0cHV0IGlzIHJldGFpbmVkLlxuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xDYWxsUGFydD8udG9vbENhbGw/LmNvbnRlbnQ/LmV2ZXJ5KGMgPT4gYy50eXBlICE9PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwpKTtcblx0XHRcdGFzc2VydC5vayh0b29sQ2FsbFBhcnQ/LnRvb2xDYWxsPy5jb250ZW50Py5zb21lKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VlZHMgdGhlIHNlc3Npb24gdGl0bGUgZnJvbSB0aGUgISBjb21tYW5kIHdoZW4gdGhlIHNlc3Npb24gaXMgdW50aXRsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBBIGJyYW5kLW5ldywgdW50aXRsZWQgc2Vzc2lvbjogdGhlIGJhbmcgY29tbWFuZCBpcyB0aGUgb25seSB0aGluZ1xuXHRcdFx0Ly8gd2UgY2FuIHRpdGxlIGl0IHdpdGggdW50aWwgYSByZWFsIHJlcXVlc3QgYXJyaXZlcy5cblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSB9KTtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKTtcblx0XHRcdGNvbnN0IGJhbmdTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRlcm1pbmFsTWFuYWdlcik7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICchZWNobyBoaScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRiYW5nU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXG5cdFx0XHQvLyBUaGUgcHJvdmlzaW9uYWwgdGl0bGUgaXMgYXBwbGllZCBzeW5jaHJvbm91c2x5LCBiZWZvcmUgdGhlIGNvbW1hbmQgcnVucy5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LnRpdGxlLCAnZWNobyBoaScpO1xuXG5cdFx0XHQvLyBMZXQgdGhlIGNvbW1hbmQgZmluaXNoIHNvIHRoZSB0dXJuIGNsb3NlcyBjbGVhbmx5LlxuXHRcdFx0YXdhaXQgdGVybWluYWxNYW5hZ2VyLmNvbW1hbmRGaW5pc2hlZExpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdFx0dGVybWluYWxNYW5hZ2VyLmZpcmVDb21tYW5kRmluaXNoZWQoeyBjb21tYW5kSWQ6ICcxJywgY29tbWFuZDogJ2VjaG8gaGknLCBleGl0Q29kZTogMCwgb3V0cHV0OiAnaGlcXG4nIH0pO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uVXJpLnRvU3RyaW5nKCkpID09PSB1bmRlZmluZWQgPyB0cnVlIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gVGhlIHByb3Zpc2lvbmFsIHRpdGxlIGlzIHBlcnNpc3RlZCBzbyBpdCBzdXJ2aXZlcyByZWxvYWQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJyksICdlY2hvIGhpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gbG9jYWwgdHVybiBwZXJzaXN0ZW5jZTogYW5jaG9yaW5nICsgdHJ1bmNhdGUgcmVzb2x1dGlvbiAtLS0tLS0tLS1cblxuXHRzdWl0ZSgnbG9jYWwgdHVybiBwZXJzaXN0ZW5jZScsICgpID0+IHtcblxuXHRcdGxldCBjbGllbnRTZXE6IG51bWJlcjtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGNsaWVudFNlcSA9IDA7XG5cdFx0fSk7XG5cblx0XHQvKiogRHJpdmVzIGEgbm9ybWFsIChTREstYmFja2VkKSB0dXJuIGludG8gYHR1cm5zW11gIHZpYSB0aGUgcmVkdWNlci4gKi9cblx0XHRmdW5jdGlvbiBzZWVkUmVhbFR1cm4odHVybklkOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLCB0dXJuSWQsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6ICsrY2xpZW50U2VxIH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkLCBkdXJhdGlvbjogMTAwMCB9KTtcblx0XHR9XG5cblx0XHRhc3luYyBmdW5jdGlvbiBydW5CYW5nKHNlOiBBZ2VudFNpZGVFZmZlY3RzLCB0ZXJtaW5hbE1hbmFnZXI6IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIsIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLCB0dXJuSWQsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dDogJyFlY2hvIGhpJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogKytjbGllbnRTZXEgfSk7XG5cdFx0XHRzZS5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cdFx0XHRhd2FpdCB0ZXJtaW5hbE1hbmFnZXIuY29tbWFuZEZpbmlzaGVkTGlzdGVuZXJSZWdpc3RlcmVkLnA7XG5cdFx0XHR0ZXJtaW5hbE1hbmFnZXIuZmlyZUNvbW1hbmRGaW5pc2hlZCh7IGNvbW1hbmRJZDogdHVybklkLCBjb21tYW5kOiAnZWNobyBoaScsIGV4aXRDb2RlOiAwLCBvdXRwdXQ6ICdoaVxcbicgfSk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBzdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHNlc3Npb25VcmkudG9TdHJpbmcoKSkgPT09IHVuZGVmaW5lZCA/IHRydWUgOiB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGxldCBsb2NhbFR1cm5zOiBBZ2VudEhvc3RMb2NhbFR1cm5zO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlTG9jYWxUdXJuU2lkZUVmZmVjdHMoZGI6IFRlc3RTZXNzaW9uRGF0YWJhc2UsIHRlcm1pbmFsTWFuYWdlcjogVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcik6IEFnZW50U2lkZUVmZmVjdHMge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKTtcblx0XHRcdGxvY2FsVHVybnMgPSBuZXcgQWdlbnRIb3N0TG9jYWxUdXJucyhzZXNzaW9uRGF0YVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdHJldHVybiBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRcdGxvY2FsVHVybnMsXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0ZXJtaW5hbE1hbmFnZXIpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2FuY2hvcnMgYSBiYW5nIHR1cm4gdG8gdGhlIHByZWNlZGluZyBjb25jcmV0ZSB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dvcmsnKTtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKTtcblx0XHRcdGNvbnN0IHNlID0gY3JlYXRlTG9jYWxUdXJuU2lkZUVmZmVjdHMoZGIsIHRlcm1pbmFsTWFuYWdlcik7XG5cblx0XHRcdHNlZWRSZWFsVHVybigncmVhbC0xJywgJ2hlbGxvJyk7XG5cdFx0XHRhd2FpdCBydW5CYW5nKHNlLCB0ZXJtaW5hbE1hbmFnZXIsICdsb2NhbC0xJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbFR1cm5zLnJlc29sdmVDb25jcmV0ZVR1cm5JZChkZWZhdWx0Q2hhdFVyaSwgJ2xvY2FsLTEnKSwgJ3JlYWwtMScpO1xuXHRcdFx0Y29uc3QgcGVyc2lzdGVkID0gYXdhaXQgZGIuZ2V0TG9jYWxUdXJucygpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwZXJzaXN0ZWQubWFwKHIgPT4gKHsgdHVybklkOiByLnR1cm5JZCwgY2hhdFVyaTogci5jaGF0VXJpLCBhbmNob3JUdXJuSWQ6IHIuYW5jaG9yVHVybklkIH0pKSwgW1xuXHRcdFx0XHR7IHR1cm5JZDogJ2xvY2FsLTEnLCBjaGF0VXJpOiBkZWZhdWx0Q2hhdFVyaSwgYW5jaG9yVHVybklkOiAncmVhbC0xJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVuY2F0aW5nIGF0IGEgbG9jYWwgdHVybiByZWRpcmVjdHMgdGhlIFNESyB0cnVuY2F0aW9uIHRvIHRoZSBjb25jcmV0ZSBhbmNob3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd29yaycpO1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCkpO1xuXHRcdFx0Y29uc3Qgc2UgPSBjcmVhdGVMb2NhbFR1cm5TaWRlRWZmZWN0cyhkYiwgdGVybWluYWxNYW5hZ2VyKTtcblxuXHRcdFx0c2VlZFJlYWxUdXJuKCdyZWFsLTEnLCAnaGVsbG8nKTtcblx0XHRcdGF3YWl0IHJ1bkJhbmcoc2UsIHRlcm1pbmFsTWFuYWdlciwgJ2xvY2FsLTEnKTtcblxuXHRcdFx0Ly8gVHJ1bmNhdGUgYXQgdGhlIGxvY2FsIHR1cm4gKGtlZXAgaXQpLiBSZWR1Y2VyIGtlZXBzIFtyZWFsLTEsIGxvY2FsLTFdLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCwgdHVybklkOiAnbG9jYWwtMScgfSwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6ICsrY2xpZW50U2VxIH0pO1xuXHRcdFx0c2UuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCwgdHVybklkOiAnbG9jYWwtMScgfSk7XG5cblx0XHRcdC8vIFRoZSBTREsgaXMgdG9sZCB0byBrZWVwIHVwIHRvIHRoZSBjb25jcmV0ZSB0dXJuIGJlZm9yZSB0aGUgbG9jYWwgb25lLlxuXHRcdFx0Y29uc3QgdHJ1bmNhdGVDYWxsID0gYWdlbnQudHJ1bmNhdGVDaGF0Q2FsbHMuYXQoLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydW5jYXRlQ2FsbD8uY2hhdC50b1N0cmluZygpLCBkZWZhdWx0Q2hhdFVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1bmNhdGVDYWxsPy50dXJuSWQsICdyZWFsLTEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydW5jYXRpbmcgYXQgYSByZWFsIHR1cm4gZHJvcHMgdGhlIHRyYWlsaW5nIGxvY2FsIHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd29yaycpO1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCkpO1xuXHRcdFx0Y29uc3Qgc2UgPSBjcmVhdGVMb2NhbFR1cm5TaWRlRWZmZWN0cyhkYiwgdGVybWluYWxNYW5hZ2VyKTtcblxuXHRcdFx0c2VlZFJlYWxUdXJuKCdyZWFsLTEnLCAnaGVsbG8nKTtcblx0XHRcdGF3YWl0IHJ1bkJhbmcoc2UsIHRlcm1pbmFsTWFuYWdlciwgJ2xvY2FsLTEnKTtcblxuXHRcdFx0Ly8gVHJ1bmNhdGUgYXQgdGhlIHJlYWwgdHVybiAoZHJvcCB0aGUgbG9jYWwgdHVybiBhZnRlciBpdCkuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkLCB0dXJuSWQ6ICdyZWFsLTEnIH0sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiArK2NsaWVudFNlcSB9KTtcblx0XHRcdHNlLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUcnVuY2F0ZWQsIHR1cm5JZDogJ3JlYWwtMScgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC50cnVuY2F0ZUNoYXRDYWxscy5hdCgtMSk/LnR1cm5JZCwgJ3JlYWwtMScpO1xuXHRcdFx0Ly8gVGhlIGxvY2FsIHR1cm4gaXMgZHJvcHBlZCBmcm9tIG1lbW9yeSBzeW5jaHJvbm91c2x5IGFuZCBmcm9tIHRoZSBEQiBhc3luYy5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbFR1cm5zLmlzTG9jYWwoZGVmYXVsdENoYXRVcmksICdsb2NhbC0xJyksIGZhbHNlKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBkYi5nZXRMb2NhbFR1cm5zKCksIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSB0dXJuIHVzYWdlIHBlcnNpc3RlbmNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndHVybiB1c2FnZSBwZXJzaXN0ZW5jZScsICgpID0+IHtcblxuXHRcdGNvbnN0IHVzYWdlID0geyBpbnB1dFRva2VuczogMTAwLCBvdXRwdXRUb2tlbnM6IDIwLCBtb2RlbDogJ2dwdC01JywgX21ldGE6IHsgY29waWxvdFVzYWdlOiB7IHRvdGFsTmFub0FpdTogNV8wMDBfMDAwXzAwMCB9IH0gfTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVVzYWdlU2lkZUVmZmVjdHMoZGI6IFRlc3RTZXNzaW9uRGF0YWJhc2UpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYik7XG5cdFx0XHRjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRcdGxvY2FsVHVybnM6IG5ldyBBZ2VudEhvc3RMb2NhbFR1cm5zKHNlc3Npb25EYXRhU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgncGVyc2lzdHMgdGhlIGxhdGVzdCB1c2FnZSBvZiBhIHR1cm4sIHdpdGhvdXQgd2FpdGluZyBmb3IgdGhlIHR1cm4gdG8gZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gV3JpdHRlbiBlYWdlcmx5IHJhdGhlciB0aGFuIGJ1ZmZlcmVkIHVudGlsIGEgdGVybWluYWwgYWN0aW9uOiBhIHR1cm5cblx0XHRcdC8vIGN1dCBzaG9ydCBieSBhIGNyYXNoIG9yIGRpc2Nvbm5lY3QgbXVzdCBrZWVwIHRoZSB1c2FnZSBpdCBhY2NydWVkLFxuXHRcdFx0Ly8gd2hpY2ggaXMgdGhlIGNsYXNzIG9mIGxvc3MgdGhpcyBwZXJzaXN0ZW5jZSBleGlzdHMgdG8gcHJldmVudC5cblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93b3JrJyk7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjcmVhdGVVc2FnZVNpZGVFZmZlY3RzKGRiKTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLCB0dXJuSWQ6ICd0dXJuLTEnLCB1c2FnZTogeyBpbnB1dFRva2VuczogMSwgb3V0cHV0VG9rZW5zOiAxIH0gfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsIHR1cm5JZDogJ3R1cm4tMScsIHVzYWdlIH0pO1xuXG5cdFx0XHQvLyBObyBDaGF0VHVybkNvbXBsZXRlL0NhbmNlbGxlZC9FcnJvciBcdTIwMTQgdGhlIHJvd3MgYXJlIGFscmVhZHkgZHVyYWJsZS5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uKGF3YWl0IGRiLmdldFR1cm5Vc2FnZXMoKSkuZW50cmllcygpXSwgW1sndHVybi0xJywgSlNPTi5zdHJpbmdpZnkodXNhZ2UpXV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcGVyc2lzdCB1c2FnZSByZXBvcnRlZCBvbiBhIHN1YmFnZW50IGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd29yaycpO1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y3JlYXRlVXNhZ2VTaWRlRWZmZWN0cyhkYik7XG5cblx0XHRcdGNvbnN0IHN1YmFnZW50Q2hhdFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3Rvb2wtY2FsbC0xJyk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc3ViYWdlbnRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLCB0dXJuSWQ6ICd0dXJuLTEnLCB1c2FnZSB9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzdWJhZ2VudENoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAgfSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uKGF3YWl0IGRiLmdldFR1cm5Vc2FnZXMoKSkuZW50cmllcygpXSwgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGltbWVkaWF0ZSB0aXRsZSBvbiBmaXJzdCB0dXJuIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2ltbWVkaWF0ZSB0aXRsZSBvbiBmaXJzdCB0dXJuJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gc2V0dXBEZWZhdWx0U2Vzc2lvbigpOiB2b2lkIHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL3Rlc3QtcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdkaXNwYXRjaGVzIHRpdGxlQ2hhbmdlZCB3aXRoIHVzZXIgbWVzc2FnZSBvbiBmaXJzdCB0dXJuJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBEZWZhdWx0U2Vzc2lvbigpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ0ZpeCB0aGUgbG9naW4gYnVnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRpdGxlQWN0aW9uID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlQWN0aW9uLCAnc2hvdWxkIGRpc3BhdGNoIHNlc3Npb24vdGl0bGVDaGFuZ2VkJyk7XG5cdFx0XHRpZiAodGl0bGVBY3Rpb24/LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpdGxlQWN0aW9uLmFjdGlvbi50aXRsZSwgJ0ZpeCB0aGUgbG9naW4gYnVnJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBkaXNwYXRjaCB0aXRsZUNoYW5nZWQgd2hlbiBtZXNzYWdlIGlzIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cERlZmF1bHRTZXNzaW9uKCk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnICAgJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRpdGxlQWN0aW9uID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpdGxlQWN0aW9uLCB1bmRlZmluZWQsICdzaG91bGQgbm90IGRpc3BhdGNoIHRpdGxlQ2hhbmdlZCBmb3IgZW1wdHkgbWVzc2FnZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyB3aGl0ZXNwYWNlIGFuZCB0cnVuY2F0ZXMgbG9uZyBtZXNzYWdlcycsICgpID0+IHtcblx0XHRcdHNldHVwRGVmYXVsdFNlc3Npb24oKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0Y29uc3QgbG9uZ01lc3NhZ2UgPSAnRml4IHRoZSBidWdcXG5pbiB0aGUgbG9naW5cXHRwYWdlICBwbGVhc2UgJyArICdhJy5yZXBlYXQoMjUwKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiBsb25nTWVzc2FnZSwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRpdGxlQWN0aW9uID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlQWN0aW9uLCAnc2hvdWxkIGRpc3BhdGNoIHNlc3Npb24vdGl0bGVDaGFuZ2VkJyk7XG5cdFx0XHRpZiAodGl0bGVBY3Rpb24/LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF0aXRsZUFjdGlvbi5hY3Rpb24udGl0bGUuaW5jbHVkZXMoJ1xcbicpLCAnc2hvdWxkIG5vdCBjb250YWluIG5ld2xpbmVzJyk7XG5cdFx0XHRcdGFzc2VydC5vayghdGl0bGVBY3Rpb24uYWN0aW9uLnRpdGxlLmluY2x1ZGVzKCdcXHQnKSwgJ3Nob3VsZCBub3QgY29udGFpbiB0YWJzJyk7XG5cdFx0XHRcdGFzc2VydC5vayghdGl0bGVBY3Rpb24uYWN0aW9uLnRpdGxlLmluY2x1ZGVzKCcgICcpLCAnc2hvdWxkIG5vdCBjb250YWluIGRvdWJsZSBzcGFjZXMnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRpdGxlQWN0aW9uLmFjdGlvbi50aXRsZS5sZW5ndGggPD0gMjAwLCAnc2hvdWxkIGJlIHRydW5jYXRlZCB0byAyMDAgY2hhcnMnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGRpc3BhdGNoIHRpdGxlQ2hhbmdlZCBvbiBzZWNvbmQgdHVybicsICgpID0+IHtcblx0XHRcdHNldHVwRGVmYXVsdFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdC8vIENvbXBsZXRlIHRoZSBmaXJzdCB0dXJuIHNvIHR1cm5zLmxlbmd0aCBiZWNvbWVzIDEuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3NlY29uZCBtZXNzYWdlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRpdGxlQWN0aW9uID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpdGxlQWN0aW9uLCB1bmRlZmluZWQsICdzaG91bGQgbm90IGRpc3BhdGNoIHRpdGxlQ2hhbmdlZCBvbiBzZWNvbmQgdHVybicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZGlzcGF0Y2ggdGl0bGVDaGFuZ2VkIHdoZW4gdGl0bGUgaXMgYWxyZWFkeSBzZXQnLCAoKSA9PiB7XG5cdFx0XHQvLyBTZXNzaW9uIGhhcyBhIG5vbi1lbXB0eSB0aXRsZSAoZS5nLiB1c2VyIHJlbmFtZWQgYmVmb3JlIGZpcnN0IG1lc3NhZ2UpXG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnVXNlciBSZW5hbWVkJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy90ZXN0LXByb2plY3QnLCBkaXNwbGF5TmFtZTogJ1Rlc3QgUHJvamVjdCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdGl0bGVBY3Rpb24gPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGl0bGVBY3Rpb24sIHVuZGVmaW5lZCwgJ3Nob3VsZCBub3QgY2xvYmJlciBleGlzdGluZyB0aXRsZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndHVybiBjb21wbGV0aW9uIFx1MjAxNCByZWFkL3VucmVhZCcsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIHJlYWRDaGFuZ2VzRnJvbShlbnZlbG9wZXM6IHJlYWRvbmx5IEFjdGlvbkVudmVsb3BlW10pOiBib29sZWFuW10ge1xuXHRcdFx0cmV0dXJuIGVudmVsb3Blc1xuXHRcdFx0XHQuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZClcblx0XHRcdFx0Lm1hcChlID0+IChlLmFjdGlvbiBhcyB7IGlzUmVhZDogYm9vbGVhbiB9KS5pc1JlYWQpO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIFR1cm4gY29tcGxldGlvbiBwZXJzaXN0cyB0aGUgKHVuKXJlYWQgZmxhZywgc28gdGhlc2UgdGVzdHMgbmVlZCBhIHJlYWxcblx0XHQgKiBzZXNzaW9uIGRhdGFiYXNlIHJhdGhlciB0aGFuIHRoZSBzdWl0ZSdzIG51bGwgZGF0YSBzZXJ2aWNlLlxuXHRcdCAqL1xuXHRcdGZ1bmN0aW9uIHNldHVwUGVyc2lzdGluZygpOiB7IHNpZGVFZmZlY3RzOiBBZ2VudFNpZGVFZmZlY3RzOyBkYjogVGVzdFNlc3Npb25EYXRhYmFzZSB9IHtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IHBlcnNpc3RpbmcgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSh0ZWxlbWV0cnlTZXJ2aWNlKSkpO1xuXHRcdFx0cmV0dXJuIHsgc2lkZUVmZmVjdHM6IHBlcnNpc3RpbmcsIGRiIH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnbWFya3MgYSByZWFkIHNlc3Npb24gdW5yZWFkIHdoZW4gYSB0dXJuIGNvbXBsZXRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2lkZUVmZmVjdHM6IHBlcnNpc3RpbmcgfSA9IHNldHVwUGVyc2lzdGluZygpO1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHQvLyBUaGUgc2Vzc2lvbiBoYXMgYmVlbiByZWFkIChlLmcuIGEgY2xpZW50IHZpZXdlZCBpdCkuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQsIGlzUmVhZDogdHJ1ZSB9KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwZXJzaXN0aW5nLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZWFkQ2hhbmdlczogcmVhZENoYW5nZXNGcm9tKGVudmVsb3BlcyksXG5cdFx0XHRcdGlzUmVhZEJpdFNldDogKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpIS5zdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzUmVhZCkgIT09IDAsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlYWRDaGFuZ2VzOiBbZmFsc2VdLFxuXHRcdFx0XHRpc1JlYWRCaXRTZXQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZS1tYXJrIGFuIGFscmVhZHktdW5yZWFkIHNlc3Npb24gb24gdHVybiBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzaWRlRWZmZWN0czogcGVyc2lzdGluZyB9ID0gc2V0dXBQZXJzaXN0aW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdC8vIE5vIFNlc3Npb25Jc1JlYWRDaGFuZ2VkIGRpc3BhdGNoZWQ6IHRoZSBzZXNzaW9uIHN0YXJ0cyB1bnJlYWQuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGVyc2lzdGluZy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRDaGFuZ2VzRnJvbShlbnZlbG9wZXMpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZXJzaXN0cyB0aGUgdW5yZWFkIGZsYWcgc28gaXQgc3Vydml2ZXMgYSBob3N0IHJlc3RhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNpZGVFZmZlY3RzOiBwZXJzaXN0aW5nLCBkYiB9ID0gc2V0dXBQZXJzaXN0aW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiB0cnVlIH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBlcnNpc3RpbmcucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldE1ldGFkYXRhKCdpc1JlYWQnKSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVyc2lzdHMgcmVhZCBzdGF0ZSBleGFjdGx5IG9uY2UgZm9yIGNsaWVudC0gYW5kIHNlcnZlci1kaXNwYXRjaGVkIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGRiIH0gPSBzZXR1cFBlcnNpc3RpbmcoKTtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHQvLyBBIGNsaWVudCBtYXJraW5nIHRoZSBzZXNzaW9uIHJlYWQgKGUuZy4gdGhlIHVzZXIgb3BlbmVkIGl0IGluIHRoZVxuXHRcdFx0Ly8gZWRpdG9yIHdpbmRvdyBvciB0aGUgYWdlbnQgd2luZG93KS5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiB0cnVlIH0sIHsgY2xpZW50SWQ6ICdjbGllbnQtMScsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdC8vIFRoZSBob3N0IG1hcmtpbmcgaXQgdW5yZWFkIGFmdGVyIGJhY2tncm91bmQgb3V0cHV0LlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkLCBpc1JlYWQ6IGZhbHNlIH0pO1xuXHRcdFx0Ly8gQSByZWplY3RlZCBjbGllbnQgYWN0aW9uIG5ldmVyIHJlYWNoZWQgc3RhdGUgYW5kIG11c3Qgbm90IHBlcnNpc3QuXG5cdFx0XHRzdGF0ZU1hbmFnZXIucmVqZWN0Q2xpZW50QWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkLCBpc1JlYWQ6IHRydWUgfSwgeyBjbGllbnRJZDogJ2NsaWVudC0xJywgY2xpZW50U2VxOiAyIH0sICdub3BlJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGIuc2V0TWV0YWRhdGFDYWxscy5maWx0ZXIoYyA9PiBjLmtleSA9PT0gJ2lzUmVhZCcpLCBbXG5cdFx0XHRcdHsga2V5OiAnaXNSZWFkJywgdmFsdWU6ICd0cnVlJyB9LFxuXHRcdFx0XHR7IGtleTogJ2lzUmVhZCcsIHZhbHVlOiAnJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrcyB0aGUgcGFyZW50IHNlc3Npb24gdW5yZWFkIHdoZW4gYSBzdWJhZ2VudCB0dXJuIGNvbXBsZXRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2lkZUVmZmVjdHM6IHBlcnNpc3RpbmcgfSA9IHNldHVwUGVyc2lzdGluZygpO1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHQvLyBUaGUgc2Vzc2lvbiBoYXMgYmVlbiByZWFkIChlLmcuIGEgY2xpZW50IHZpZXdlZCBpdCBhZnRlciB0aGUgcGFyZW50XG5cdFx0XHQvLyB0dXJuIGFscmVhZHkgcHJvZHVjZWQgb3V0cHV0KS4gQSBiYWNrZ3JvdW5kIHN1YmFnZW50IHRoZW4gY29tcGxldGVzLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkLCBpc1JlYWQ6IHRydWUgfSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGVyc2lzdGluZy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdC8vIFNwYXduIGEgc3ViYWdlbnQgY2hhdCBvZmYgYSBwYXJlbnQgdG9vbCBjYWxsLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdydW5TdWJhZ2VudCcsIGRpc3BsYXlOYW1lOiAnUnVuIFN1YmFnZW50JywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLCBhZ2VudE5hbWU6ICdjb2RlLXJldmlld2VyJywgYWdlbnREaXNwbGF5TmFtZTogJ0NvZGUgUmV2aWV3ZXInLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtMScpO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRUdXJuSWQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHN1YmFnZW50VXJpKSEuYWN0aXZlVHVybiEuaWQ7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKHN1YmFnZW50VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiBzdWJhZ2VudFR1cm5JZCwgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVhZENoYW5nZXM6IHJlYWRDaGFuZ2VzRnJvbShlbnZlbG9wZXMpLFxuXHRcdFx0XHRpc1JlYWRCaXRTZXQ6IChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblVyaS50b1N0cmluZygpKSEuc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc1JlYWQpICE9PSAwLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZWFkQ2hhbmdlczogW2ZhbHNlXSxcblx0XHRcdFx0aXNSZWFkQml0U2V0OiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ21hcmtzIGEgcmVhZCBzZXNzaW9uIHVucmVhZCB3aGVuIGEgdHVybiBpcyBjYW5jZWxsZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNpZGVFZmZlY3RzOiBwZXJzaXN0aW5nIH0gPSBzZXR1cFBlcnNpc3RpbmcoKTtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkLCBpc1JlYWQ6IHRydWUgfSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGVyc2lzdGluZy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlYWRDaGFuZ2VzOiByZWFkQ2hhbmdlc0Zyb20oZW52ZWxvcGVzKSxcblx0XHRcdFx0aXNSZWFkQml0U2V0OiAoc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb25VcmkudG9TdHJpbmcoKSkhLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNSZWFkKSAhPT0gMCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVhZENoYW5nZXM6IFtmYWxzZV0sXG5cdFx0XHRcdGlzUmVhZEJpdFNldDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtzIGEgcmVhZCBzZXNzaW9uIHVucmVhZCB3aGVuIGEgdHVybiBlcnJvcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNpZGVFZmZlY3RzOiBwZXJzaXN0aW5nIH0gPSBzZXR1cFBlcnNpc3RpbmcoKTtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkLCBpc1JlYWQ6IHRydWUgfSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGVyc2lzdGluZy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCwgZXJyb3I6IHsgZXJyb3JUeXBlOiAnRXJyb3InLCBtZXNzYWdlOiAnYm9vbScgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZWFkQ2hhbmdlczogcmVhZENoYW5nZXNGcm9tKGVudmVsb3BlcyksXG5cdFx0XHRcdGlzUmVhZEJpdFNldDogKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpIS5zdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzUmVhZCkgIT09IDAsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlYWRDaGFuZ2VzOiBbZmFsc2VdLFxuXHRcdFx0XHRpc1JlYWRCaXRTZXQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gXHUyMDE0IHNlc3Npb24vdHVybkNhbmNlbGxlZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NhbGxzIGFib3J0U2Vzc2lvbiBvbiB0aGUgYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGNsaWVudENvbnRleHQgPSB7XG5cdFx0XHRcdGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LFxuXHRcdFx0XHRjb25uZWN0aW9uS2luZDogQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvbktpbmQuUmVtb3RlRXh0ZW5zaW9uSG9zdCxcblx0XHRcdFx0dHJhbnNwb3J0S2luZDogQWdlbnRIb3N0VHJhbnNwb3J0S2luZC5NZXNzYWdlUG9ydCxcblx0XHRcdFx0aG9zdExhdW5jaEtpbmQ6IEFnZW50SG9zdExhdW5jaEtpbmQuVlNDb2RlTWFpblByb2Nlc3MsXG5cdFx0XHRcdG1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0ZGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0XHR9O1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSwgJ2NsaWVudC0xJywgY2xpZW50Q29udGV4dCk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0XHRjb25zdCBhYm9ydENvbnRleHQgPSBhZ2VudC5jaGF0Q29udGV4dHMuZmluZChjYWxsID0+IGNhbGwuYm91bmRhcnkgPT09ICdhYm9ydCcpPy5jb250ZXh0O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFib3J0U2Vzc2lvbkNhbGxzOiBhZ2VudC5hYm9ydFNlc3Npb25DYWxscyxcblx0XHRcdFx0Y2xpZW50VGVsZW1ldHJ5Q29udGV4dDogIVVSSS5pc1VyaShhYm9ydENvbnRleHQpID8gYWJvcnRDb250ZXh0Py5jbGllbnRUZWxlbWV0cnlDb250ZXh0IDogdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhYm9ydFNlc3Npb25DYWxsczogW1VSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpXSxcblx0XHRcdFx0Y2xpZW50VGVsZW1ldHJ5Q29udGV4dDogY2xpZW50Q29udGV4dCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGhhbmRsZUFjdGlvbjogY2hhdC90dXJuU3RhcnRlZCBtb2RlbCBzZWxlY3Rpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnaGFuZGxlQWN0aW9uIFx1MjAxNCBjaGF0L3R1cm5TdGFydGVkIG1vZGVsIHNlbGVjdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NhbGxzIGNoYW5nZU1vZGVsIG9uIHRoZSBhZ2VudCBiZWZvcmUgc2VuZGluZyB0aGUgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgY2xpZW50Q29udGV4dCA9IHtcblx0XHRcdFx0Y2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3csXG5cdFx0XHRcdGNvbm5lY3Rpb25LaW5kOiBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZC5SZW1vdGVFeHRlbnNpb25Ib3N0LFxuXHRcdFx0XHR0cmFuc3BvcnRLaW5kOiBBZ2VudEhvc3RUcmFuc3BvcnRLaW5kLk1lc3NhZ2VQb3J0LFxuXHRcdFx0XHRob3N0TGF1bmNoS2luZDogQWdlbnRIb3N0TGF1bmNoS2luZC5WU0NvZGVNYWluUHJvY2Vzcyxcblx0XHRcdFx0bWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0XHRkZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdH07XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgbW9kZWw6IHsgaWQ6ICdncHQtNScgfSB9LFxuXHRcdFx0fSwgJ2NsaWVudC0xJywgY2xpZW50Q29udGV4dCk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0XHRjb25zdCBjb250ZXh0cyA9IE9iamVjdC5mcm9tRW50cmllcyhhZ2VudC5jaGF0Q29udGV4dHNcblx0XHRcdFx0LmZpbHRlcihjYWxsID0+IGNhbGwuYm91bmRhcnkgPT09ICdjaGFuZ2VNb2RlbCcgfHwgY2FsbC5ib3VuZGFyeSA9PT0gJ2NoYW5nZUFnZW50JyB8fCBjYWxsLmJvdW5kYXJ5ID09PSAnc2VuZE1lc3NhZ2UnKVxuXHRcdFx0XHQubWFwKGNhbGwgPT4gW2NhbGwuYm91bmRhcnksICFVUkkuaXNVcmkoY2FsbC5jb250ZXh0KSA/IGNhbGwuY29udGV4dD8uY2xpZW50VGVsZW1ldHJ5Q29udGV4dCA6IHVuZGVmaW5lZF0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjaGFuZ2VNb2RlbENhbGxzOiBhZ2VudC5jaGFuZ2VNb2RlbENhbGxzLFxuXHRcdFx0XHRjb250ZXh0cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2hhbmdlTW9kZWxDYWxsczogW3sgc2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkudG9TdHJpbmcoKSksIG1vZGVsOiB7IGlkOiAnZ3B0LTUnIH0sIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSkgfV0sXG5cdFx0XHRcdGNvbnRleHRzOiB7XG5cdFx0XHRcdFx0Y2hhbmdlTW9kZWw6IGNsaWVudENvbnRleHQsXG5cdFx0XHRcdFx0Y2hhbmdlQWdlbnQ6IGNsaWVudENvbnRleHQsXG5cdFx0XHRcdFx0c2VuZE1lc3NhZ2U6IGNsaWVudENvbnRleHQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dhaXRzIGZvciBtb2RlbCBzZWxlY3Rpb24gYmVmb3JlIHNlbmRpbmcgdGhlIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGxldCByZXNvbHZlQ2hhbmdlTW9kZWwhOiAoKSA9PiB2b2lkO1xuXHRcdFx0Y29uc3QgY2hhbmdlTW9kZWxTZXR0bGVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IHJlc29sdmVDaGFuZ2VNb2RlbCA9IHJlc29sdmU7IH0pO1xuXHRcdFx0bGV0IHJlc29sdmVTZW5kITogKCkgPT4gdm9pZDtcblx0XHRcdGNvbnN0IHNlbmRTdGFydGVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IHJlc29sdmVTZW5kID0gcmVzb2x2ZTsgfSk7XG5cdFx0XHRhZ2VudC5jaGFuZ2VNb2RlbCA9IGFzeW5jIChzZXNzaW9uLCBtb2RlbCwgY2hhdCkgPT4ge1xuXHRcdFx0XHRhZ2VudC5jaGFuZ2VNb2RlbENhbGxzLnB1c2goeyBzZXNzaW9uLCBtb2RlbCwgY2hhdCB9KTtcblx0XHRcdFx0YXdhaXQgY2hhbmdlTW9kZWxTZXR0bGVkO1xuXHRcdFx0fTtcblx0XHRcdGFnZW50LnNlbmRNZXNzYWdlID0gYXN5bmMgKHNlc3Npb24sIGNoYXQsIHByb21wdCwgYXR0YWNobWVudHMpID0+IHtcblx0XHRcdFx0YWdlbnQuc2VuZE1lc3NhZ2VDYWxscy5wdXNoKHsgc2Vzc2lvbiwgcHJvbXB0LCBhdHRhY2htZW50cywgY2hhdCB9KTtcblx0XHRcdFx0cmVzb2x2ZVNlbmQoKTtcblx0XHRcdH07XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBtb2RlbDogeyBpZDogJ2dwdC01JyB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2hhbmdlTW9kZWxDYWxsczogYWdlbnQuY2hhbmdlTW9kZWxDYWxscyxcblx0XHRcdFx0c2VuZE1lc3NhZ2VDYWxsczogYWdlbnQuc2VuZE1lc3NhZ2VDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2hhbmdlTW9kZWxDYWxsczogW3sgc2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkudG9TdHJpbmcoKSksIG1vZGVsOiB7IGlkOiAnZ3B0LTUnIH0sIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSkgfV0sXG5cdFx0XHRcdHNlbmRNZXNzYWdlQ2FsbHM6IFtdLFxuXHRcdFx0fSk7XG5cblx0XHRcdHJlc29sdmVDaGFuZ2VNb2RlbCgpO1xuXHRcdFx0YXdhaXQgc2VuZFN0YXJ0ZWQ7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscywgW3sgc2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkudG9TdHJpbmcoKSksIHByb21wdDogJ2hlbGxvJywgYXR0YWNobWVudHM6IHVuZGVmaW5lZCwgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyB0aGUgY2hhdCBjaGFubmVsIGZvciBhbiBhZGRpdGlvbmFsIChwZWVyKSBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBjaGF0Q2hhbm5lbCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICdwZWVyLTEnKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihjaGF0Q2hhbm5lbCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBtb2RlbDogeyBpZDogJ2dwdC01JyB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuY2hhbmdlTW9kZWxDYWxscy5tYXAoY2FsbCA9PiAoe1xuXHRcdFx0XHRzZXNzaW9uOiBjYWxsLnNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdFx0bW9kZWw6IGNhbGwubW9kZWwsXG5cdFx0XHRcdGNoYXQ6IGNhbGwuY2hhdD8udG9TdHJpbmcoKSxcblx0XHRcdH0pKSwgW3sgc2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLCBtb2RlbDogeyBpZDogJ2dwdC01JyB9LCBjaGF0OiBjaGF0Q2hhbm5lbCB9XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gaGFuZGxlQWN0aW9uOiBjaGF0L3R1cm5TdGFydGVkIGFnZW50IHNlbGVjdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gXHUyMDE0IGNoYXQvdHVyblN0YXJ0ZWQgYWdlbnQgc2VsZWN0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY2FsbHMgY2hhbmdlQWdlbnQgb24gdGhlIGFnZW50IGZvciB0aGUgc2Vzc2lvbiBkZWZhdWx0IGNoYXQgYmVmb3JlIHNlbmRpbmcgdGhlIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBhZ2VudDogeyB1cmk6ICdmaWxlOi8vL2FnZW50cy9yZXZpZXdlci5tZCcgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LmNoYW5nZUFnZW50Q2FsbHMsIFt7IHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLCBhZ2VudDogeyB1cmk6ICdmaWxlOi8vL2FnZW50cy9yZXZpZXdlci5tZCcgfSwgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyB0aGUgY2hhdCBjaGFubmVsIGZvciBhbiBhZGRpdGlvbmFsIChwZWVyKSBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBjaGF0Q2hhbm5lbCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICdwZWVyLTEnKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihjaGF0Q2hhbm5lbCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBhZ2VudDogeyB1cmk6ICdmaWxlOi8vL2FnZW50cy9yZXZpZXdlci5tZCcgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LmNoYW5nZUFnZW50Q2FsbHMubWFwKGNhbGwgPT4gKHtcblx0XHRcdFx0c2Vzc2lvbjogY2FsbC5zZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRcdGFnZW50OiBjYWxsLmFnZW50LFxuXHRcdFx0XHRjaGF0OiBjYWxsLmNoYXQ/LnRvU3RyaW5nKCksXG5cdFx0XHR9KSksIFt7IHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWdlbnQ6IHsgdXJpOiAnZmlsZTovLy9hZ2VudHMvcmV2aWV3ZXIubWQnIH0sIGNoYXQ6IGNoYXRDaGFubmVsIH1dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSByZWdpc3RlclByb2dyZXNzTGlzdGVuZXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3JlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2VtaXRzIGF1dGgtcmVxdWlyZWQgbm90aWZpY2F0aW9ucyB3aGVuIG9ic2VydmFibGUgc3RhdGUgYmVjb21lcyByZXF1aXJlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbnM6IElOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obm90aWZpY2F0aW9uID0+IG5vdGlmaWNhdGlvbnMucHVzaChub3RpZmljYXRpb24pKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0XHRjb25zdCByZXF1aXJlbWVudCA9IHtcblx0XHRcdFx0cmVzb3VyY2U6IHtcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2dpdGh1Yi5jb20vbG9naW4vb2F1dGgnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVhc29uOiBBdXRoUmVxdWlyZWRSZWFzb24uRXhwaXJlZCxcblx0XHRcdH07XG5cblx0XHRcdGFnZW50LnNldEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQocmVxdWlyZW1lbnQpO1xuXHRcdFx0YWdlbnQuc2V0QXV0aGVudGljYXRpb25SZXF1aXJlZCh1bmRlZmluZWQpO1xuXHRcdFx0YWdlbnQuc2V0QXV0aGVudGljYXRpb25SZXF1aXJlZChyZXF1aXJlbWVudCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm90aWZpY2F0aW9ucy5maWx0ZXIobm90aWZpY2F0aW9uID0+IG5vdGlmaWNhdGlvbi50eXBlID09PSAnYXV0aC9yZXF1aXJlZCcpLCBbXG5cdFx0XHRcdHsgdHlwZTogJ2F1dGgvcmVxdWlyZWQnLCBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgLi4ucmVxdWlyZW1lbnQgfSxcblx0XHRcdFx0eyB0eXBlOiAnYXV0aC9yZXF1aXJlZCcsIGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCAuLi5yZXF1aXJlbWVudCB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzIGFnZW50IHByb2dyZXNzIGV2ZW50cyB0byBzdGF0ZSBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdoaScgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEZpcnN0IGRlbHRhIGNyZWF0ZXMgYSByZXNwb25zZSBwYXJ0IChub3QgYSBkZWx0YSBhY3Rpb24pXG5cdFx0XHRhc3NlcnQub2soZW52ZWxvcGVzLnNvbWUoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHJvdXRlIHN0YWxlIGFjdGlvbnMgaW50byBhIGZvcmNlLXN0YXJ0ZWQgdHVybicsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAxOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdjb250aW51ZScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdzdGFsZS1wYXJ0JywgY29udGVudDogJ3N0YWxlIHJlc3BvbnNlJyB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLCB0dXJuSWQ6ICd0dXJuLTEnLCB1c2FnZTogeyBpbnB1dFRva2VuczogMTAwLCBvdXRwdXRUb2tlbnM6IDUwLCBtb2RlbDogJ3N0YWxlLW1vZGVsJyB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDE5OTAyOSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkOiAndHVybi0yJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ2ZyZXNoLXBhcnQnLCBjb250ZW50OiAnZnJlc2gnIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RGVsdGEsIHR1cm5JZDogJ3R1cm4tMicsIHBhcnRJZDogJ2ZyZXNoLXBhcnQnLCBjb250ZW50OiAnIHJlc3BvbnNlJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSwgdHVybklkOiAndHVybi0yJywgdXNhZ2U6IHsgaW5wdXRUb2tlbnM6IDIwLCBvdXRwdXRUb2tlbnM6IDEwLCBtb2RlbDogJ2ZyZXNoLW1vZGVsJyB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0yJywgZHVyYXRpb246IDIwMDAgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoZGVmYXVsdENoYXRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZT8udHVybnMubWFwKHR1cm4gPT4gKHtcblx0XHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0XHRkdXJhdGlvbjogdHVybi5kdXJhdGlvbixcblx0XHRcdFx0bWVzc2FnZTogdHVybi5tZXNzYWdlLnRleHQsXG5cdFx0XHRcdG1hcmtkb3duOiB0dXJuLnJlc3BvbnNlUGFydHNcblx0XHRcdFx0XHQuZmlsdGVyKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKVxuXHRcdFx0XHRcdC5tYXAocGFydCA9PiBwYXJ0LmNvbnRlbnQpXG5cdFx0XHRcdFx0LmpvaW4oJycpLFxuXHRcdFx0XHR1c2FnZTogdHVybi51c2FnZSxcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0aWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHRcdG1lc3NhZ2U6ICdoZWxsbycsXG5cdFx0XHRcdG1hcmtkb3duOiAnJyxcblx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6ICd0dXJuLTInLFxuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRkdXJhdGlvbjogMjAwMCxcblx0XHRcdFx0bWVzc2FnZTogJ2NvbnRpbnVlJyxcblx0XHRcdFx0bWFya2Rvd246ICdmcmVzaCByZXNwb25zZScsXG5cdFx0XHRcdHVzYWdlOiB7IGlucHV0VG9rZW5zOiAyMCwgb3V0cHV0VG9rZW5zOiAxMCwgbW9kZWw6ICdmcmVzaC1tb2RlbCcgfSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyB0aGUgdHVybiBpZCBvZiBhIHByb3ZpZGVyLWluaXRpYXRlZCB0dXJuIHdoZW4gaWRsZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdFx0dHVybklkOiAncHJvdmlkZXItdHVybicsXG5cdFx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMTowMC4wMDBaJyxcblx0XHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdwcm92aWRlciBub3RpZmljYXRpb24nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuU3lzdGVtTm90aWZpY2F0aW9uIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LCB0dXJuSWQ6ICdwcm92aWRlci10dXJuJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3Byb3ZpZGVyLXBhcnQnLCBjb250ZW50OiAncHJvdmlkZXIgcmVzcG9uc2UnIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoZGVmYXVsdENoYXRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHR1cm5JZDogc3RhdGU/LmFjdGl2ZVR1cm4/LmlkLFxuXHRcdFx0XHRtZXNzYWdlOiBzdGF0ZT8uYWN0aXZlVHVybj8ubWVzc2FnZS50ZXh0LFxuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBzdGF0ZT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0dHVybklkOiAncHJvdmlkZXItdHVybicsXG5cdFx0XHRcdG1lc3NhZ2U6ICdwcm92aWRlciBub3RpZmljYXRpb24nLFxuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3Byb3ZpZGVyLXBhcnQnLCBjb250ZW50OiAncHJvdmlkZXIgcmVzcG9uc2UnIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZXBsYWNlIGFuIGFjdGl2ZSB0dXJuIHdpdGggYSBzdGFsZSB0dXJuIHN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMicpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdzdGFsZSByZXF1ZXN0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0dXJuSWQ6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoZGVmYXVsdENoYXRVcmkpPy5hY3RpdmVUdXJuPy5pZCxcblx0XHRcdFx0bWVzc2FnZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShkZWZhdWx0Q2hhdFVyaSk/LmFjdGl2ZVR1cm4/Lm1lc3NhZ2UudGV4dCxcblx0XHRcdH0sIHtcblx0XHRcdFx0dHVybklkOiAndHVybi0yJyxcblx0XHRcdFx0bWVzc2FnZTogJ2hlbGxvJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RhbGUgY29tcGxldGlvbiBkb2VzIG5vdCBjbGVhciBhY3RpdmUgdHVybiB0b29sIHRyYWNraW5nJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDE6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2NvbnRpbnVlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0yJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnYWN0aXZlLXRvb2wnLCB0b29sTmFtZTogJ3JlYWQnLCBkaXNwbGF5TmFtZTogJ1JlYWQnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTk5MDI5IH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybi0yJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnYWN0aXZlLXRvb2wnLFxuXHRcdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnUmVhZCBmaWxlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMicsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5ldmVudHMuZmlsdGVyKGV2ZW50ID0+IGV2ZW50LmV2ZW50TmFtZSA9PT0gJ2xhbmd1YWdlTW9kZWxUb29sSW52b2tlZCcpLm1hcChldmVudCA9PiBldmVudC5ldmVudE5hbWUpLFxuXHRcdFx0XHRbJ2xhbmd1YWdlTW9kZWxUb29sSW52b2tlZCddLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgYSBkaXNwb3NhYmxlIHRoYXQgc3RvcHMgbGlzdGVuaW5nJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdiZWZvcmUnIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQpLmxlbmd0aCwgMSk7XG5cblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkOiAndHVybi0xJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ21zZy0yJywgY29udGVudDogJ2FmdGVyJyB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0KS5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3VzdG9taXphdGlvbnMgY2hhbmdlIHB1Ymxpc2hlcyBvbmNlLCB0aGVuIGRlZHVwZXMgaWRlbnRpY2FsIHJlLWZldGNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Ly8gUmV0dXJuIGEgZnJlc2hseS1idWlsdCBhcnJheSBvZiBmcmVzaGx5LWJ1aWx0IG9iamVjdHMgb24gZXZlcnlcblx0XHRcdC8vIGZldGNoIChtYXRjaGluZyByZWFsIHByb3ZpZGVycywgd2hpY2ggcmUtc2NhbiBkaXNrIGVhY2ggdGltZSkgc29cblx0XHRcdC8vIHRoZSBkZWR1cCBpcyBwcm92ZW4gdG8gcmVseSBvbiBzdHJ1Y3R1cmFsIGVxdWFsaXR5LCBub3QgcmVmZXJlbmNlXG5cdFx0XHQvLyBpZGVudGl0eS5cblx0XHRcdGNvbnN0IG1ha2VDdXN0b21pemF0aW9ucyA9ICgpOiBDdXN0b21pemF0aW9uW10gPT4gW1xuXHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW4tYScpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1hJywgbmFtZTogJ1BsdWdpbiBBJywgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSB9LFxuXHRcdFx0XTtcblx0XHRcdGxldCBmZXRjaENhbGxzID0gMDtcblx0XHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IHsgZmV0Y2hDYWxscysrOyByZXR1cm4gbWFrZUN1c3RvbWl6YXRpb25zKCk7IH07XG5cblx0XHRcdGNvbnN0IGNoYW5nZWQ6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQpIHtcblx0XHRcdFx0XHRjaGFuZ2VkLnB1c2goZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gRmlyc3QgY2hhbmdlOiBmZXRjaCArIHB1Ymxpc2guXG5cdFx0XHRhZ2VudC5maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2UoKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGNoYW5nZWQubGVuZ3RoID49IDEgfHwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLmxlbmd0aCwgMSk7XG5cblx0XHRcdC8vIFN1YnNlcXVlbnQgY2hhbmdlcyB0aGF0IHJlc29sdmUgdG8gc3RydWN0dXJhbGx5LWVxdWFsIGN1c3RvbWl6YXRpb25zXG5cdFx0XHQvLyAoZS5nLiB0aGUgTyhOXjIpIGZhbi1vdXQgZnJvbSBhIHNoYXJlZCBgfi8uY2xhdWRlYCBlZGl0KSBtdXN0IG5vdFxuXHRcdFx0Ly8gcmUtcHVibGlzaCwgZXZlbiB0aG91Z2ggZWFjaCBmZXRjaCByZXR1cm5zIGEgYnJhbmQtbmV3IGFycmF5LlxuXHRcdFx0YWdlbnQuZmlyZUN1c3RvbWl6YXRpb25zQ2hhbmdlKCk7XG5cdFx0XHRhZ2VudC5maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2UoKTtcblx0XHRcdGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIDUwMDA7XG5cdFx0XHR3aGlsZSAoZmV0Y2hDYWxscyA8IDMgJiYgRGF0ZS5ub3coKSA8IGRlYWRsaW5lKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZC5sZW5ndGgsIDEsICdpZGVudGljYWwgY3VzdG9taXphdGlvbnMgbXVzdCBub3QgcmUtcHVibGlzaCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZldGNoQ2FsbHMgPj0gMywgJ2VhY2ggY2hhbmdlIHN0aWxsIHJlLWZldGNoZXMgdG8gY29tcGFyZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtcHVibGlzaGVzIGFmdGVyIHNlc3Npb24gZXZpY3Rpb24gKyByZXN0b3JlIGV2ZW4gd2hlbiBjdXN0b21pemF0aW9ucyBhcmUgdW5jaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdGNvbnN0IG1ha2VDdXN0b21pemF0aW9ucyA9ICgpOiBDdXN0b21pemF0aW9uW10gPT4gW1xuXHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW4tYScpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1hJywgbmFtZTogJ1BsdWdpbiBBJywgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSB9LFxuXHRcdFx0XTtcblx0XHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IG1ha2VDdXN0b21pemF0aW9ucygpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VkOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZC5wdXNoKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIEluaXRpYWwgcHVibGlzaCBwb3B1bGF0ZXMgdGhlIHNlc3Npb24gc3RhdGUncyBjdXN0b21pemF0aW9ucy5cblx0XHRcdGFnZW50LmZpcmVDdXN0b21pemF0aW9uc0NoYW5nZSgpO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gY2hhbmdlZC5sZW5ndGggPj0gMSB8fCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWQubGVuZ3RoLCAxKTtcblxuXHRcdFx0Ly8gSWRsZS1ldmljdCB0aGVuIHJlc3RvcmUgdGhlIHNhbWUgc2Vzc2lvbiBVUkk6IHRoZSByZXN0b3JlZCBzdGF0ZVxuXHRcdFx0Ly8gc3RhcnRzIHdpdGhvdXQgY3VzdG9taXphdGlvbnMuIEJlY2F1c2UgZGVkdXAgY29tcGFyZXMgYWdhaW5zdCB0aGVcblx0XHRcdC8vIGF1dGhvcml0YXRpdmUgc2Vzc2lvbiBzdGF0ZSAobm90IGEgc3RhbGUgc2lkZSBjYWNoZSksIHRoZSBuZXh0XG5cdFx0XHQvLyByZWZyZXNoIG11c3QgcHVibGlzaCBhZ2FpbiBldmVuIHRob3VnaCB0aGUgcmVzb2x2ZWQgc2V0IGlzXG5cdFx0XHQvLyBzdHJ1Y3R1cmFsbHkgaWRlbnRpY2FsIHRvIHRoZSBwcmlvciBpbmNhcm5hdGlvbidzLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLnJlbW92ZVNlc3Npb24oc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRhZ2VudC5maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2UoKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGNoYW5nZWQubGVuZ3RoID49IDIgfHwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLmxlbmd0aCwgMiwgJ3Jlc3RvcmVkIHNlc3Npb24gbXVzdCByZWNlaXZlIGl0cyBjdXN0b21pemF0aW9ucycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGFnZW50cyBvYnNlcnZhYmxlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2FnZW50cyBvYnNlcnZhYmxlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZGlzcGF0Y2hlcyByb290L2FnZW50c0NoYW5nZWQgd2l0aG91dCBmZXRjaGluZyBtb2RlbHMgd2hlbiBvYnNlcnZhYmxlIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhZ2VudExpc3Quc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZSwgZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlLmFjdGlvbi5hZ2VudHMubGVuZ3RoID09PSAxO1xuXHRcdFx0fSkpO1xuXHRcdFx0YWdlbnRMaXN0LnNldChbYWdlbnRdLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgeyBhY3Rpb24gfSA9IGF3YWl0IGVudmVsb3BlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi50eXBlLCBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb24uYWdlbnRzWzBdLm1vZGVscywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgb2JzZXJ2YWJsZSB1cGRhdGUgcHVibGlzaGVzIG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlID0gRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5Sb290QWdlbnRzQ2hhbmdlZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZS5hY3Rpb24uYWdlbnRzWzBdPy5tb2RlbHMubGVuZ3RoID09PSAxO1xuXHRcdFx0fSkpO1xuXHRcdFx0YWdlbnQuc2V0TW9kZWxzKFt7IHByb3ZpZGVyOiAnbW9jaycsIGlkOiAnbW9jay1tb2RlbCcsIG5hbWU6ICdtb2NrIE1vZGVsJywgbWF4Q29udGV4dFdpbmRvdzogMTI4MDAwLCBtYXhPdXRwdXRUb2tlbnM6IDE2MDAwLCBtYXhQcm9tcHRUb2tlbnM6IDExMjAwMCwgc3VwcG9ydHNWaXNpb246IGZhbHNlIH1dKTtcblx0XHRcdGF3YWl0IGVudmVsb3BlO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zID0gZW52ZWxvcGVzLm1hcChlID0+IGUuYWN0aW9uKS5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGFjdGlvbnNbYWN0aW9ucy5sZW5ndGggLSAxXTtcblx0XHRcdGFzc2VydC5vayhhY3Rpb24sICdzaG91bGQgZGlzcGF0Y2ggcm9vdC9hZ2VudHNDaGFuZ2VkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbi5hZ2VudHNbMF0ubW9kZWxzLCBbe1xuXHRcdFx0XHRpZDogJ21vY2stbW9kZWwnLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRuYW1lOiAnbW9jayBNb2RlbCcsXG5cdFx0XHRcdG1heENvbnRleHRXaW5kb3c6IDEyODAwMCxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxNjAwMCxcblx0XHRcdFx0bWF4UHJvbXB0VG9rZW5zOiAxMTIwMDAsXG5cdFx0XHRcdHN1cHBvcnRzVmlzaW9uOiBmYWxzZSxcblx0XHRcdFx0cG9saWN5U3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29uZmlnU2NoZW1hOiB1bmRlZmluZWQsXG5cdFx0XHRcdF9tZXRhOiB1bmRlZmluZWQsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCBvYnNlcnZhYmxlIHVwZGF0ZSBwdWJsaXNoZXMgbW9kZWwgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlLCBlID0+IHtcblx0XHRcdFx0aWYgKGUuYWN0aW9uLnR5cGUgIT09IEFjdGlvblR5cGUuUm9vdEFnZW50c0NoYW5nZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGUuYWN0aW9uLmFnZW50c1swXT8ubW9kZWxzLmxlbmd0aCA9PT0gMTtcblx0XHRcdH0pKTtcblx0XHRcdGFnZW50LnNldE1vZGVscyhbeyBwcm92aWRlcjogJ21vY2snLCBpZDogJ21vY2stbW9kZWwnLCBuYW1lOiAnbW9jayBNb2RlbCcsIG1heENvbnRleHRXaW5kb3c6IDEyODAwMCwgc3VwcG9ydHNWaXNpb246IGZhbHNlLCBfbWV0YTogeyBtdWx0aXBsaWVyTnVtZXJpYzogMiB9IH1dKTtcblxuXHRcdFx0Y29uc3QgeyBhY3Rpb24gfSA9IGF3YWl0IGVudmVsb3BlO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuUm9vdEFnZW50c0NoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb24uYWdlbnRzWzBdLm1vZGVsc1swXS5fbWV0YSwgeyBtdWx0aXBsaWVyTnVtZXJpYzogMiB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuY2hhbmdlZCBtb2RlbCBvYnNlcnZhYmxlIHVwZGF0ZSBkb2VzIG5vdCBkaXNwYXRjaCB1bmNoYW5nZWQgYWdlbnQgaW5mb3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gW3sgcHJvdmlkZXI6ICdtb2NrJyBhcyBjb25zdCwgaWQ6ICdtb2NrLW1vZGVsJywgbmFtZTogJ21vY2sgTW9kZWwnLCBtYXhDb250ZXh0V2luZG93OiAxMjgwMDAsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9XTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZSwgZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlLmFjdGlvbi5hZ2VudHNbMF0/Lm1vZGVscy5sZW5ndGggPT09IDE7XG5cdFx0XHR9KSk7XG5cdFx0XHRhZ2VudC5zZXRNb2RlbHMobW9kZWxzKTtcblx0XHRcdGF3YWl0IGVudmVsb3BlO1xuXHRcdFx0ZW52ZWxvcGVzLmxlbmd0aCA9IDA7XG5cdFx0XHRhZ2VudC5zZXRNb2RlbHMoWy4uLm1vZGVsc10pO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFBlbmRpbmcgbWVzc2FnZSBzeW5jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3BlbmRpbmcgbWVzc2FnZSBzeW5jJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3luY3Mgc3RlZXJpbmcgbWVzc2FnZSB0byBhZ2VudCBvbiBDaGF0UGVuZGluZ01lc3NhZ2VTZXQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRpZDogJ3N0ZWVyLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdmb2N1cyBvbiB0ZXN0cycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxsc1swXS5zdGVlcmluZ01lc3NhZ2UsIHsgaWQ6ICdzdGVlci0xJywgbWVzc2FnZTogeyB0ZXh0OiAnZm9jdXMgb24gdGVzdHMnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzWzBdLnF1ZXVlZE1lc3NhZ2VzLCBbXSk7XG5cdFx0XHQvLyBTdGVlcmluZyBpcyBhbHdheXMgYWRkcmVzc2VkIGJ5IGEgY29uY3JldGUgY2hhdCBjaGFubmVsIFVSSS5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxsc1swXS5jaGF0LnRvU3RyaW5nKCksIGRlZmF1bHRDaGF0VXJpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bmNzIGEgcGVlciBjaGF0IHN0ZWVyaW5nIG1lc3NhZ2UgYWRkcmVzc2VkIGJ5IHRoZSBwZWVyIGNoYXQgVVJJJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAncGVlci1zdGVlcicpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgcGVlckNoYXRVcmkudG9TdHJpbmcoKSk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5TdGVlcmluZyxcblx0XHRcdFx0aWQ6ICdzdGVlci1wZWVyJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnc3RlZXIgdGhlIHBlZXInLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKHBlZXJDaGF0VXJpLnRvU3RyaW5nKCksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24ocGVlckNoYXRVcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2hhdDogYWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHNbMF0uY2hhdC50b1N0cmluZygpLFxuXHRcdFx0XHRzdGVlcmluZ0lkOiBhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxsc1swXS5zdGVlcmluZ01lc3NhZ2U/LmlkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjaGF0OiBwZWVyQ2hhdFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRzdGVlcmluZ0lkOiAnc3RlZXItcGVlcicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bmNzIHF1ZXVlZCBtZXNzYWdlIGFuZCBwcmVzZXJ2ZXMgdGhlIGVucXVldWluZyBjbGllbnQgYXR0cmlidXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0aWQ6ICdxLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdxdWV1ZWQgbWVzc2FnZScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgJ2NsaWVudC1lZGl0b3InLCBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyk7XG5cblx0XHRcdC8vIFF1ZXVlZCBtZXNzYWdlcyBhcmUgbm90IGZvcndhcmRlZCB0byB0aGUgYWdlbnQ7IHRoZSBzZXJ2ZXIgY29udHJvbHMgY29uc3VtcHRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzWzBdLnN0ZWVyaW5nTWVzc2FnZSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHNbMF0ucXVldWVkTWVzc2FnZXMsIFtdKTtcblxuXHRcdFx0Ly8gU2Vzc2lvbiB3YXMgaWRsZSwgc28gdGhlIHF1ZXVlZCBtZXNzYWdlIGlzIGNvbnN1bWVkIGltbWVkaWF0ZWx5XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXSwge1xuXHRcdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0Y2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0cHJvbXB0OiAncXVldWVkIG1lc3NhZ2UnLFxuXHRcdFx0XHRhdHRhY2htZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZW5kZXJDbGllbnRJZDogJ2NsaWVudC1lZGl0b3InLFxuXHRcdFx0XHRjbGllbnRUeXBlOiAnZWRpdG9yX3dpbmRvdycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBxdWV1ZWQgcHJvdG9jb2wgYXR0YWNobWVudCBVUkkgc3RyaW5ncyBiZWZvcmUgcGFzc2luZyB0aGVtIHRvIHRoZSBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3F1ZXVlZC50cycpO1xuXHRcdFx0Y29uc3QgYWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0aWQ6ICdxLXVyaScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3F1ZXVlZCBtZXNzYWdlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgYXR0YWNobWVudHM6IFt7IHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSwgdXJpOiBmaWxlVXJpLnRvU3RyaW5nKCksIGxhYmVsOiAncXVldWVkLnRzJywgZGlzcGxheUtpbmQ6ICdkb2N1bWVudCcgfV0gfSxcblx0XHRcdH07XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFt7XG5cdFx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRwcm9tcHQ6ICdxdWV1ZWQgbWVzc2FnZScsXG5cdFx0XHRcdGF0dGFjaG1lbnRzOiBbeyB0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsIHVyaTogZmlsZVVyaS50b1N0cmluZygpLCBsYWJlbDogJ3F1ZXVlZC50cycsIGRpc3BsYXlLaW5kOiAnZG9jdW1lbnQnIH1dLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbG9ncyB0ZWxlbWV0cnkgd2hlbiBzZW5kaW5nIGEgcXVldWVkIHVzZXIgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0IGFzIGNvbnN0LFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRpZDogJ3EtdGVsZW1ldHJ5Jyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncXVldWVkIG1lc3NhZ2UnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbe1xuXHRcdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QudXNlck1lc3NhZ2VTZW50Jyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdFx0aG9zdExhdW5jaEtpbmQ6ICd2c2NvZGVfbWFpbl9wcm9jZXNzJyxcblx0XHRcdFx0XHRpbml0aWF0b3JDbGllbnRJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICd1bmtub3duJyxcblx0XHRcdFx0XHRpbml0aWF0b3JDb25uZWN0aW9uS2luZDogJ3Vua25vd24nLFxuXHRcdFx0XHRcdGluaXRpYXRvclRyYW5zcG9ydEtpbmQ6ICd1bmtub3duJyxcblx0XHRcdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdFx0c291cmNlOiAncXVldWVkJyxcblx0XHRcdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRcdFx0dHVybkNvdW50OiAwLFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRDb3VudDogMCxcblx0XHRcdFx0fSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bmNzIG9uIENoYXRQZW5kaW5nTWVzc2FnZVJlbW92ZWQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Ly8gQWRkIGEgcXVldWVkIG1lc3NhZ2Vcblx0XHRcdGNvbnN0IHNldEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdGlkOiAncS1ybScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3dpbGwgYmUgcmVtb3ZlZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEFjdGlvbik7XG5cblx0XHRcdGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHRcdC8vIFJlbW92ZVxuXHRcdFx0Y29uc3QgcmVtb3ZlQWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVJlbW92ZWQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdGlkOiAncS1ybScsXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCByZW1vdmVBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAyIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCByZW1vdmVBY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHNbMF0ucXVldWVkTWVzc2FnZXMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bmNzIG9uIENoYXRRdWV1ZWRNZXNzYWdlc1Jlb3JkZXJlZCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHQvLyBBZGQgdHdvIHF1ZXVlZCBtZXNzYWdlc1xuXHRcdFx0Y29uc3Qgc2V0QSA9IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsIGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsIGlkOiAncS1hJywgbWVzc2FnZTogeyB0ZXh0OiAnQScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSB9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QSk7XG5cblx0XHRcdGNvbnN0IHNldEIgPSB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0IGFzIGNvbnN0LCBraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLCBpZDogJ3EtYicsIG1lc3NhZ2U6IHsgdGV4dDogJ0InLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0gfTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDIgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEIpO1xuXG5cdFx0XHRhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0XHQvLyBSZW9yZGVyXG5cdFx0XHRjb25zdCByZW9yZGVyQWN0aW9uID0geyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRRdWV1ZWRNZXNzYWdlc1Jlb3JkZXJlZCBhcyBjb25zdCwgb3JkZXI6IFsncS1iJywgJ3EtYSddIH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHJlb3JkZXJBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAzIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCByZW9yZGVyQWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzWzBdLnF1ZXVlZE1lc3NhZ2VzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gUXVldWVkIG1lc3NhZ2UgY29uc3VtcHRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncXVldWVkIG1lc3NhZ2UgY29uc3VtcHRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhdXRvLXN0YXJ0cyB0dXJuIGZyb20gcXVldWVkIG1lc3NhZ2Ugb24gaWRsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBRdWV1ZSBhIG1lc3NhZ2Ugd2hpbGUgYSB0dXJuIGlzIGFjdGl2ZVxuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IHNldEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdGlkOiAncS1hdXRvJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYXV0byBxdWV1ZWQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24pO1xuXG5cdFx0XHQvLyBNZXNzYWdlIHNob3VsZCBOT1QgYmUgY29uc3VtZWQgeWV0ICh0dXJuIGlzIGFjdGl2ZSlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCwgMCk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdC8vIEZpcmUgaWRsZSBcdTIxOTIgdHVybiBjb21wbGV0ZXMgXHUyMTkyIHF1ZXVlZCBtZXNzYWdlIHNob3VsZCBiZSBjb25zdW1lZFxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHR1cm5Db21wbGV0ZSA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlKTtcblx0XHRcdGFzc2VydC5vayh0dXJuQ29tcGxldGUsICdzaG91bGQgZGlzcGF0Y2ggc2Vzc2lvbi90dXJuQ29tcGxldGUnKTtcblxuXHRcdFx0Y29uc3QgdHVyblN0YXJ0ZWQgPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkKTtcblx0XHRcdGFzc2VydC5vayh0dXJuU3RhcnRlZCwgJ3Nob3VsZCBkaXNwYXRjaCBzZXNzaW9uL3R1cm5TdGFydGVkIGZvciBxdWV1ZWQgbWVzc2FnZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0dXJuU3RhcnRlZCEuYWN0aW9uIGFzIHsgcXVldWVkTWVzc2FnZUlkPzogc3RyaW5nIH0pLnF1ZXVlZE1lc3NhZ2VJZCwgJ3EtYXV0bycpO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXS5wcm9tcHQsICdhdXRvIHF1ZXVlZCcpO1xuXG5cdFx0XHQvLyBRdWV1ZWQgbWVzc2FnZSBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIHN0YXRlXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8ucXVldWVkTWVzc2FnZXMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3YWl0cyBmb3IgcGVuZGluZyBzdGVlcmluZyBiZWZvcmUgY29uc3VtaW5nIGEgcXVldWVkIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi1vcmlnaW5hbCcpO1xuXG5cdFx0XHRjb25zdCBxdWV1ZWRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0IGFzIGNvbnN0LFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRpZDogJ3F1ZXVlZC0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncXVldWVkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgcXVldWVkQWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgcXVldWVkQWN0aW9uKTtcblxuXHRcdFx0Y29uc3Qgc3RlZXJpbmdBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0IGFzIGNvbnN0LFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuU3RlZXJpbmcsXG5cdFx0XHRcdGlkOiAnc3RlZXJpbmctMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3N0ZWVyaW5nJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc3RlZXJpbmdBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAyIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzdGVlcmluZ0FjdGlvbik7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi1vcmlnaW5hbCcsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCwgMCwgJ3F1ZXVlZCBtZXNzYWdlIG11c3Qgd2FpdCBmb3Igc3RlZXJpbmcgdG8gc3RhcnQnKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0XHR0dXJuSWQ6ICd0dXJuLXN0ZWVyaW5nJyxcblx0XHRcdFx0XHRzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0XHRtZXNzYWdlOiBzdGVlcmluZ0FjdGlvbi5tZXNzYWdlLFxuXHRcdFx0XHRcdHF1ZXVlZE1lc3NhZ2VJZDogc3RlZXJpbmdBY3Rpb24uaWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi1zdGVlcmluZycsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubWFwKGNhbGwgPT4gY2FsbC5wcm9tcHQpLCBbJ3F1ZXVlZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGRyYWluIHF1ZXVlZCBtZXNzYWdlcyB3aGVuIHRoZSBjYW5jZWxsZWQgdHVybiBjb21wbGV0ZXMgbGF0ZScsICgpID0+IHtcblx0XHRcdC8vIENhbmNlbGxpbmcgYSB0dXJuIG1lYW5zIFwic3RvcFwiOiBtZXNzYWdlcyBxdWV1ZWQgYmVoaW5kIGl0IG11c3Qgc3RheVxuXHRcdFx0Ly8gcXVldWVkIGZvciB0aGUgdXNlciB0byBkZXF1ZXVlL3J1biBtYW51YWxseSwgbm90IGF1dG8tc3RhcnQuIChBXG5cdFx0XHQvLyBtZXNzYWdlIHRoZSB1c2VyIHNlbmRzICphZnRlciogdGhlIGFib3J0IGlzIGNvbnN1bWVkIHNlcGFyYXRlbHkgdmlhXG5cdFx0XHQvLyB0aGUgQ2hhdFBlbmRpbmdNZXNzYWdlU2V0IHBhdGggb25jZSBjYW5jZWxsYXRpb24gY2xlYXJzIHRoZSB0dXJuLilcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBRdWV1ZSBhIG1lc3NhZ2Ugd2hpbGUgYSB0dXJuIGlzIGFjdGl2ZS5cblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRjb25zdCBzZXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0IGFzIGNvbnN0LFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRpZDogJ3EtYWZ0ZXItYWJvcnQnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdxdWV1ZWQgYmVoaW5kIGFib3J0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uKTtcblxuXHRcdFx0Ly8gTm90IGNvbnN1bWVkIHlldCBcdTIwMTQgdGhlIHR1cm4gaXMgc3RpbGwgYWN0aXZlLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoLCAwKTtcblxuXHRcdFx0Ly8gQ2FuY2VsIHRoZSBhY3RpdmUgdHVybiAoY2xpZW50IGFib3J0KS5cblx0XHRcdGNvbnN0IGNhbmNlbEFjdGlvbiA9IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCBhcyBjb25zdCwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgY2FuY2VsQWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMiB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgY2FuY2VsQWN0aW9uKTtcblxuXHRcdFx0Y29uc3QgdHJ1bmNhdGVBY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCBhcyBjb25zdCB9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB0cnVuY2F0ZUFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDMgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHRydW5jYXRlQWN0aW9uKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMjAwMCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZSBxdWV1ZWQgbWVzc2FnZSBtdXN0IE5PVCBhdXRvLXN0YXJ0LCBhbmQgbXVzdCByZW1haW4gcXVldWVkLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoLCAwLCAnY2FuY2VsbGluZyBtdXN0IG5vdCBkcmFpbiBxdWV1ZWQgbWVzc2FnZXMnKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy50dXJucy5sZW5ndGgsIDAsICd0aGUgY2FuY2VsbGVkIHR1cm4gc2hvdWxkIG5vIGxvbmdlciBiZSByZXRhaW5lZCBpbiBoaXN0b3J5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnF1ZXVlZE1lc3NhZ2VzPy5sZW5ndGgsIDEsICdxdWV1ZWQgbWVzc2FnZSBzaG91bGQgcmVtYWluIGZvciBtYW51YWwgZGVxdWV1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy5xdWV1ZWRNZXNzYWdlcz8uWzBdLmlkLCAncS1hZnRlci1hYm9ydCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW50ZXJjZXB0cyBxdWV1ZWQgL3JlbmFtZSBhbmQgZHJhaW5zIHRoZSBtZXNzYWdlIHF1ZXVlZCBiZWhpbmQgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdC8vIGAvcmVuYW1lYCBwZXJzaXN0cyB0aGUgbmV3IHRpdGxlLCBzbyB1c2UgYSBzaWRlIGVmZmVjdHMgaW5zdGFuY2Vcblx0XHRcdC8vIHdob3NlIGBvcGVuRGF0YWJhc2VgIHJldHVybnMgYSByZWFsIGRhdGFiYXNlICh0aGUgc3VpdGUgZGVmYXVsdFxuXHRcdFx0Ly8gdGhyb3dzKS5cblx0XHRcdGNvbnN0IHJlbmFtZVNpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlbmFtZVNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBRdWV1ZSBhIGAvcmVuYW1lYCBmb2xsb3dlZCBieSBhIG5vcm1hbCBtZXNzYWdlIHdoaWxlIGEgdHVybiBpcyBhY3RpdmVcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRmb3IgKGNvbnN0IG1zZyBvZiBbXG5cdFx0XHRcdHsgaWQ6ICdxLXJlbmFtZScsIHRleHQ6ICcvcmVuYW1lIFF1ZXVlZCBUaXRsZScgfSxcblx0XHRcdFx0eyBpZDogJ3EtYWZ0ZXInLCB0ZXh0OiAnYWZ0ZXIgcmVuYW1lJyB9LFxuXHRcdFx0XSkge1xuXHRcdFx0XHRjb25zdCBzZXRBY3Rpb24gPSB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0XHRpZDogbXNnLmlkLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogbXNnLnRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0fTtcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0XHRyZW5hbWVTaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEFjdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpcmUgaWRsZSBcdTIxOTIgdHVybiBjb21wbGV0ZXMgXHUyMTkyIGAvcmVuYW1lYCBpcyBjb25zdW1lZCBhbmQgaW50ZXJjZXB0ZWQsXG5cdFx0XHQvLyB0aGVuIHRoZSBtZXNzYWdlIHF1ZXVlZCBiZWhpbmQgaXQgbXVzdCBiZSBkcmFpbmVkIHRvIHRoZSBhZ2VudC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGUgYC9yZW5hbWVgIG11c3Qgbm90IHJlYWNoIHRoZSBhZ2VudDsgb25seSB0aGUgbWVzc2FnZSBiZWhpbmQgaXQgZG9lc1xuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0ucHJvbXB0LCAnYWZ0ZXIgcmVuYW1lJyk7XG5cblx0XHRcdC8vIEJvdGggcXVldWVkIG1lc3NhZ2VzIHNob3VsZCBiZSBkcmFpbmVkIGZyb20gc3RhdGVcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy5xdWV1ZWRNZXNzYWdlcywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8udGl0bGUsICdRdWV1ZWQgVGl0bGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcGxhY2VzIGEgcXVldWVkIGJhbmcgY29tbWFuZCB0aXRsZSB3aXRoIHRoZSBmb2xsb3dpbmcgcmVhbCBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5IH0pO1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCkpO1xuXHRcdFx0Y29uc3QgcXVldWVkU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0ZXJtaW5hbE1hbmFnZXIpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1ZXVlZFNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0Zm9yIChjb25zdCBbaWQsIHRleHRdIG9mIFtbJ3EtY29tbWFuZCcsICchZWNobyBoaSddLCBbJ3EtcmVxdWVzdCcsICdFeHBsYWluIHRoZSBidWlsZCddXSBhcyBjb25zdCkge1xuXHRcdFx0XHRjb25zdCBzZXRBY3Rpb24gPSB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRtZXNzYWdlOiB7IHRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0fTtcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0XHRxdWV1ZWRTaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEFjdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGVybWluYWxNYW5hZ2VyLmNvbW1hbmRGaW5pc2hlZExpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdFx0dGVybWluYWxNYW5hZ2VyLmZpcmVDb21tYW5kRmluaXNoZWQoeyBjb21tYW5kSWQ6ICcxJywgY29tbWFuZDogJ2VjaG8gaGknLCBleGl0Q29kZTogMCwgb3V0cHV0OiAnaGlcXG4nIH0pO1xuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwcm9tcHQ6IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0ucHJvbXB0LFxuXHRcdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwcm9tcHQ6ICdFeHBsYWluIHRoZSBidWlsZCcsXG5cdFx0XHRcdHRpdGxlOiAnRXhwbGFpbiB0aGUgYnVpbGQnLFxuXHRcdFx0XHRwZXJzaXN0ZWRUaXRsZTogJ0V4cGxhaW4gdGhlIGJ1aWxkJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJhaW5zIGEgcGVlciBjaGF0IHF1ZXVlZCBtZXNzYWdlIHRvIHRoZSBvd25pbmcgc2Vzc2lvbiB3aXRoIHRoZSBjaGF0IGFyZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItcScpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgY2hhdFVyaS50b1N0cmluZygpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gU3RhcnQgYSB0dXJuIG9uIHRoZSBwZWVyIGNoYXQsIHRoZW4gcXVldWUgYSBtZXNzYWdlIGJlaGluZCBpdC5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihjaGF0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3B0dXJuLTEnLCBzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLCBtZXNzYWdlOiB7IHRleHQ6ICdoaScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSB9LFxuXHRcdFx0XHR7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdGNvbnN0IHNldEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdGlkOiAncHEtMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3BlZXIgcXVldWVkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihjaGF0VXJpLnRvU3RyaW5nKCksIHNldEFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDIgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oY2hhdFVyaS50b1N0cmluZygpLCBzZXRBY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscy5sZW5ndGgsIDApO1xuXG5cdFx0XHQvLyBJZGxlIG9uIHRoZSBwZWVyIGNoYXQgXHUyMTkyIHRoZSBxdWV1ZWQgbWVzc2FnZSBkcmFpbnMgdG8gdGhlIHBhcmVudFxuXHRcdFx0Ly8gc2Vzc2lvbiBVUkkgd2l0aCB0aGUgY2hhdCBjaGFubmVsIHBhc3NlZCBhcyB0aGUgYGNoYXRgIGFyZ3VtZW50XG5cdFx0XHQvLyBzbyB0aGUgaGFybmVzcyByb3V0ZXMgaXQgdG8gdGhlIHJpZ2h0IHBlZXIgU0RLIGNoYXQuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IGNoYXRVcmksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3B0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLm1hcChjYWxsID0+ICh7XG5cdFx0XHRcdC4uLmNhbGwsXG5cdFx0XHRcdHNlc3Npb246IGNhbGwuc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRjaGF0OiBjYWxsLmNoYXQ/LnRvU3RyaW5nKCksXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvbXB0OiAncGVlciBxdWV1ZWQnLFxuXHRcdFx0XHRhdHRhY2htZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRjaGF0OiBjaGF0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjb25zdW1lIHF1ZXVlZCBtZXNzYWdlIHdoaWxlIGEgdHVybiBpcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGNvbnN0IHNldEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdGlkOiAncS13YWl0Jyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnc2hvdWxkIHdhaXQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24pO1xuXG5cdFx0XHQvLyBObyB0dXJuIHN0YXJ0ZWQgZm9yIHRoZSBxdWV1ZWQgbWVzc2FnZVxuXHRcdFx0Y29uc3QgdHVyblN0YXJ0ZWQgPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuU3RhcnRlZCwgdW5kZWZpbmVkLCAnc2hvdWxkIG5vdCBzdGFydCBhIHR1cm4gd2hpbGUgb25lIGlzIGFjdGl2ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoLCAwKTtcblxuXHRcdFx0Ly8gUXVldWVkIG1lc3NhZ2Ugc3RpbGwgaW4gc3RhdGVcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy5xdWV1ZWRNZXNzYWdlcz8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8ucXVldWVkTWVzc2FnZXM/LlswXS5pZCwgJ3Etd2FpdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcGF0Y2hlcyBDaGF0UGVuZGluZ01lc3NhZ2VSZW1vdmVkIGZvciBzdGVlcmluZyBtZXNzYWdlcyBvbiBzdGVlcmluZ19jb25zdW1lZCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0IGFzIGNvbnN0LFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuU3RlZXJpbmcsXG5cdFx0XHRcdGlkOiAnc3RlZXItcm0nLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdzdGVlciBtZScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cblx0XHRcdC8vIFJlbW92YWwgaXMgbm90IGRpc3BhdGNoZWQgc3luY2hyb25vdXNseTsgaXQgd2FpdHMgZm9yIHRoZSBhZ2VudFxuXHRcdFx0bGV0IHJlbW92YWwgPSBlbnZlbG9wZXMuZmluZChlID0+XG5cdFx0XHRcdGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlUmVtb3ZlZCAmJlxuXHRcdFx0XHQoZS5hY3Rpb24gYXMgeyBraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQgfSkua2luZCA9PT0gUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92YWwsIHVuZGVmaW5lZCwgJ3Nob3VsZCBub3QgZGlzcGF0Y2ggcmVtb3ZhbCB1bnRpbCBzdGVlcmluZ19jb25zdW1lZCcpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB0aGUgYWdlbnQgY29uc3VtaW5nIHRoZSBzdGVlcmluZyBtZXNzYWdlXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnc3RlZXJpbmdfY29uc3VtZWQnLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRpZDogJ3N0ZWVyLXJtJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRyZW1vdmFsID0gZW52ZWxvcGVzLmZpbmQoZSA9PlxuXHRcdFx0XHRlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVJlbW92ZWQgJiZcblx0XHRcdFx0KGUuYWN0aW9uIGFzIHsga2luZDogUGVuZGluZ01lc3NhZ2VLaW5kIH0pLmtpbmQgPT09IFBlbmRpbmdNZXNzYWdlS2luZC5TdGVlcmluZ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhyZW1vdmFsLCAnc2hvdWxkIGRpc3BhdGNoIENoYXRQZW5kaW5nTWVzc2FnZVJlbW92ZWQgZm9yIHN0ZWVyaW5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlbW92YWwhLmFjdGlvbiBhcyB7IGlkOiBzdHJpbmcgfSkuaWQsICdzdGVlci1ybScpO1xuXG5cdFx0XHQvLyBTdGVlcmluZyBtZXNzYWdlIHNob3VsZCBiZSByZW1vdmVkIGZyb20gc3RhdGVcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy5zdGVlcmluZ01lc3NhZ2UsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gaGFuZGxlQWN0aW9uOiBzZXNzaW9uL2FjdGl2ZUNsaWVudFNldCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2hhbmRsZUFjdGlvbiBcdTIwMTQgc2Vzc2lvbi9hY3RpdmVDbGllbnRTZXQnLCAoKSA9PiB7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWxscyBzZXRDbGllbnRDdXN0b21pemF0aW9ucyBhbmQgZGlzcGF0Y2hlcyBjdXN0b21pemF0aW9uc0NoYW5nZWQgb25jZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcGx1Z2luQTogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BsdWdpbi1hJyksIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWEnLCBuYW1lOiAnUGx1Z2luIEEnLCBsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9IH07XG5cdFx0XHRjb25zdCBwbHVnaW5COiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vcGx1Z2luLWInKSwgdXJpOiAnZmlsZTovLy9wbHVnaW4tYicsIG5hbWU6ICdQbHVnaW4gQicsIGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0gfTtcblx0XHRcdGNvbnN0IHBsdWdpbkFDbGllbnQ6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IHBsdWdpbkEuaWQsIHVyaTogcGx1Z2luQS51cmksIG5hbWU6IHBsdWdpbkEubmFtZSwgfTtcblx0XHRcdGNvbnN0IHBsdWdpbkJDbGllbnQ6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IHBsdWdpbkIuaWQsIHVyaTogcGx1Z2luQi51cmksIG5hbWU6IHBsdWdpbkIubmFtZSwgfTtcblx0XHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtwbHVnaW5BLCBwbHVnaW5CXTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uOiBTZXNzaW9uQWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdFx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogW3BsdWdpbkFDbGllbnQsIHBsdWdpbkJDbGllbnRdXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgYXN5bmMgc2V0Q2xpZW50Q3VzdG9taXphdGlvbnNcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA1MCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNldENsaWVudEN1c3RvbWl6YXRpb25zQ2FsbHMsIFt7XG5cdFx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3BsdWdpbkFDbGllbnQsIHBsdWdpbkJDbGllbnRdLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9uQWN0aW9ucyA9IGVudmVsb3Blc1xuXHRcdFx0XHQuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXN0b21pemF0aW9uQWN0aW9ucy5sZW5ndGgsIDEsICdzaG91bGQgZGlzcGF0Y2ggb25lIGZ1bGwgY3VzdG9taXphdGlvbnNDaGFuZ2VkIHJlcGxhY2VtZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCkubGVuZ3RoLFxuXHRcdFx0XHQwLFxuXHRcdFx0XHQnc2hvdWxkIG5vdCBkaXNwYXRjaCBjdXN0b21pemF0aW9uVXBkYXRlZCB3aGVuIHByb2dyZXNzIG1hdGNoZXMgdGhlIGZpbmFsIHN0YXRlJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwYXRjaGVzIGN1c3RvbWl6YXRpb25VcGRhdGVkIGZvciBzeW5jIHByb2dyZXNzIGFmdGVyIGluaXRpYWwgcmVwbGFjZW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHBsdWdpbkFDbGllbnQ6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW4tYScpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1hJywgbmFtZTogJ1BsdWdpbiBBJywgfTtcblx0XHRcdGxldCBjdXJyZW50Q3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXHRcdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gY3VycmVudEN1c3RvbWl6YXRpb25zO1xuXHRcdFx0YWdlbnQuc3luY0NsaWVudEN1c3RvbWl6YXRpb25zID0gKHNlc3Npb24sIGNsaWVudElkLCBjdXN0b21pemF0aW9ucykgPT4ge1xuXHRcdFx0XHRhZ2VudC5zZXRDbGllbnRDdXN0b21pemF0aW9uc0NhbGxzLnB1c2goeyBjbGllbnRJZCwgY3VzdG9taXphdGlvbnMgfSk7XG5cdFx0XHRcdGNvbnN0IGxvYWRpbmc6IFBsdWdpbkN1c3RvbWl6YXRpb24gPSB7IC4uLnBsdWdpbkFDbGllbnQsIGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGluZyB9IH07XG5cdFx0XHRcdGN1cnJlbnRDdXN0b21pemF0aW9ucyA9IFtsb2FkaW5nXTtcblx0XHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvbixcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbLi4uY3VycmVudEN1c3RvbWl6YXRpb25zXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dm9pZCAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0XHRcdFx0Y29uc3QgbG9hZGVkOiBQbHVnaW5DdXN0b21pemF0aW9uID0geyAuLi5wbHVnaW5BQ2xpZW50LCBsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9IH07XG5cdFx0XHRcdFx0Y3VycmVudEN1c3RvbWl6YXRpb25zID0gW2xvYWRlZF07XG5cdFx0XHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb24sXG5cdFx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsXG5cdFx0XHRcdFx0XHRcdGN1c3RvbWl6YXRpb246IGxvYWRlZCxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHRcdHJldHVybiBjdXJyZW50Q3VzdG9taXphdGlvbnMubWFwKGN1c3RvbWl6YXRpb24gPT4gKHsgY3VzdG9taXphdGlvbjogY3VzdG9taXphdGlvbiBhcyBQbHVnaW5DdXN0b21pemF0aW9uIH0pKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ3Rlc3QtY2xpZW50Jyxcblx0XHRcdFx0XHR0b29sczogW10sXG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtwbHVnaW5BQ2xpZW50XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwKSk7XG5cblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zQ2hhbmdlZCA9IGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1c3RvbWl6YXRpb25zQ2hhbmdlZC5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgZmlyc3RDdXN0b21pemF0aW9uc0NoYW5nZWQgPSBjdXN0b21pemF0aW9uc0NoYW5nZWRbMF0uYWN0aW9uO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Q3VzdG9taXphdGlvbnNDaGFuZ2VkLnR5cGUsIEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0Q3VzdG9taXphdGlvbnNDaGFuZ2VkLmN1c3RvbWl6YXRpb25zLCBbe1xuXHRcdFx0XHQuLi5wbHVnaW5BQ2xpZW50LFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRpbmcgfSxcblx0XHRcdH1dKTtcblxuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvblVwZGF0ZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdXN0b21pemF0aW9uVXBkYXRlZC5tYXAoZSA9PiBlLmFjdGlvbiksIFt7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiB7IC4uLnBsdWdpbkFDbGllbnQsIGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0gfSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgc2Vzc2lvbiBhY3Rpb25zIGVtaXR0ZWQgb24gYSBwZWVyIGNoYXQgY2hhbm5lbCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLWN1c3RvbWl6YXRpb24nKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHBlZXJDaGF0VXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbjogUGx1Z2luQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0XHRpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BlZXItcGx1Z2luJyksXG5cdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vcGVlci1wbHVnaW4nLFxuXHRcdFx0XHRuYW1lOiAnUGVlciBQbHVnaW4nLFxuXHRcdFx0XHRlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGhhbmRsZUFnZW50U2lnbmFsOiAoYWdlbnQ6IElBZ2VudCwgc2lnbmFsOiBBZ2VudFNpZ25hbCkgPT4gdm9pZCA9IFJlZmxlY3QuZ2V0KE9iamVjdC5nZXRQcm90b3R5cGVPZihzaWRlRWZmZWN0cyksICdfaGFuZGxlQWdlbnRTaWduYWwnKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaGFuZGxlQWdlbnRTaWduYWwuY2FsbChzaWRlRWZmZWN0cywgYWdlbnQsIHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBwZWVyQ2hhdFVyaSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkLCBjdXN0b21pemF0aW9uIH0sXG5cdFx0XHR9KSwgL211c3Qgbm90IGJlIGRpc3BhdGNoZWQgb24gY2hhdCBjaGFubmVsLyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5jdXN0b21pemF0aW9ucywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsZWFycyBjbGllbnQgY3VzdG9taXphdGlvbnMgd2hlbiBhY3RpdmVDbGllbnQgaGFzIG5vIGN1c3RvbWl6YXRpb25zJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbjogU2Vzc2lvbkFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ3Rlc3QtY2xpZW50Jyxcblx0XHRcdFx0XHR0b29sczogW11cblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNldENsaWVudEN1c3RvbWl6YXRpb25zQ2FsbHMsIFt7XG5cdFx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW10sXG5cdFx0XHR9XSk7XG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9uQWN0aW9ucyA9IGVudmVsb3Blc1xuXHRcdFx0XHQuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXN0b21pemF0aW9uQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdXN0b21pemF0aW9uQWN0aW9uc1swXS5hY3Rpb24sIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZXMgdGhlIGFjdGl2ZSBjbGllbnQgd2hlbiBpdCBpcyByZW1vdmVkJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItcmVtb3ZhbCcpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgcGVlckNoYXRVcmkudG9TdHJpbmcoKSk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbjogU2Vzc2lvbkFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50UmVtb3ZlZCxcblx0XHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0XHR9O1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZW1vdmVBY3RpdmVDbGllbnRDYWxscy5tYXAoY2FsbCA9PiAoe1xuXHRcdFx0XHRjaGF0OiBjYWxsLmNoYXQudG9TdHJpbmcoKSxcblx0XHRcdFx0Y2xpZW50SWQ6IGNhbGwuY2xpZW50SWQsXG5cdFx0XHR9KSksIFtcblx0XHRcdFx0eyBjaGF0OiBkZWZhdWx0Q2hhdFVyaSwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdFx0eyBjaGF0OiBwZWVyQ2hhdFVyaS50b1N0cmluZygpLCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdBZ2VudCBIb3N0IG93bnMgdGhlIGV4YWN0IGNoYXQgZmFuLW91dCBhbmQgc3VwcGxpZXMgaG9zdCBjdXN0b21pemF0aW9ucycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgaG9zdEN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9ob3N0LXBsdWdpbicpLFxuXHRcdFx0XHR1cmk6ICdmaWxlOi8vL2hvc3QtcGx1Z2luJyxcblx0XHRcdFx0bmFtZTogJ0hvc3QgUGx1Z2luJyxcblx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogdHJ1ZSB9XSxcblx0XHRcdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgW2hvc3RDdXN0b21pemF0aW9uXSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItZmFub3V0JykpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaS50b1N0cmluZygpLCBwZWVyQ2hhdFVyaS50b1N0cmluZygpKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDogeyBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JywgdG9vbHM6IFtdIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5hY3RpdmVDbGllbnRDYWxscy5tYXAoY2FsbCA9PiAoe1xuXHRcdFx0XHRjaGF0OiBjYWxsLmNoYXQudG9TdHJpbmcoKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvblJlc291cmNlOiBVUkkuaXNVcmkoY2FsbC5jb250ZXh0KSA/IGNhbGwuY29udGV4dC50b1N0cmluZygpIDogY2FsbC5jb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRjbGllbnRJZDogY2FsbC5jbGllbnRJZCxcblx0XHRcdFx0aG9zdEN1c3RvbWl6YXRpb25zOiBjYWxsLmhvc3RDdXN0b21pemF0aW9ucz8ubWFwKGMgPT4gYy5pZCksXG5cdFx0XHR9KSksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXQ6IGRlZmF1bHRDaGF0VXJpLFxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdFx0XHRcdGhvc3RDdXN0b21pemF0aW9uczogW2hvc3RDdXN0b21pemF0aW9uLmlkXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXQ6IHBlZXJDaGF0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0XHRcdFx0aG9zdEN1c3RvbWl6YXRpb25zOiBbaG9zdEN1c3RvbWl6YXRpb24uaWRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyB0aGUgZmFuLW91dCB3aGVuIHRoZSBob3N0IGhhcyBubyBzdGF0ZSBmb3IgdGhlIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1bmtub3duU2Vzc2lvbiA9IFVSSS5wYXJzZSgnbW9jazovbmV2ZXItY3JlYXRlZCcpO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHVua25vd25TZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHsgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsIHRvb2xzOiBbXSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEFuIGFic2VudCBzZXNzaW9uIGhhcyBubyBhdXRob3JpdGF0aXZlIG1lbWJlcnNoaXAsIHNvIHRoZSBwcm92aWRlclxuXHRcdFx0Ly8gaXMgbm90IGhhbmRlZCBhbiBpbnZlbnRlZCBkZWZhdWx0LWNoYXQtb25seSBsaXN0LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5hY3RpdmVDbGllbnRDYWxscywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtZmFucy1vdXQgZXZlcnkgYWN0aXZlIGNsaWVudCB3aGVuIGEgY2hhdCBqb2lucyB0aGUgY2F0YWxvZycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50QWN0aW9uOiBTZXNzaW9uQWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDogeyBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JywgdG9vbHM6IFtdIH0sXG5cdFx0XHR9O1xuXHRcdFx0Ly8gUmVjb3JkIHRoZSBjb250cmlidXRpb24gaW4gc2Vzc2lvbiBzdGF0ZSAoYXMgdGhlIHJlYWwgZGlzcGF0Y2hcblx0XHRcdC8vIHBpcGVsaW5lIGRvZXMpIGFuZCBydW4gaXRzIHNpZGUgZWZmZWN0LlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aXZlQ2xpZW50QWN0aW9uLCB7IGNsaWVudElkOiAndGVzdC1jbGllbnQnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3RpdmVDbGllbnRBY3Rpb24pO1xuXG5cdFx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci1hZGRlZCcpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaS50b1N0cmluZygpLCBwZWVyQ2hhdFVyaSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuYWN0aXZlQ2xpZW50Q2FsbHMubWFwKGNhbGwgPT4gKHtcblx0XHRcdFx0Y2xpZW50SWQ6IGNhbGwuY2xpZW50SWQsXG5cdFx0XHRcdGNoYXQ6IGNhbGwuY2hhdC50b1N0cmluZygpLFxuXHRcdFx0fSkpLCBbXG5cdFx0XHRcdHsgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsIGNoYXQ6IGRlZmF1bHRDaGF0VXJpIH0sXG5cdFx0XHRcdHsgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsIGNoYXQ6IGRlZmF1bHRDaGF0VXJpIH0sXG5cdFx0XHRcdHsgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsIGNoYXQ6IHBlZXJDaGF0VXJpIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBoYW5kbGVBY3Rpb246IHJvb3QvY29uZmlnQ2hhbmdlZCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gLSByb290L2NvbmZpZ0NoYW5nZWQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXB1Ymxpc2hlcyBhZ2VudCBhbmQgc2Vzc2lvbiBjdXN0b21pemF0aW9ucyBmb3IgZXhpc3Rpbmcgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9uOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vcGx1Z2luLWEnKSwgdXJpOiAnZmlsZTovLy9wbHVnaW4tYScsIG5hbWU6ICdQbHVnaW4gQScsIGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0gfTtcblx0XHRcdGFnZW50LmN1c3RvbWl6YXRpb25zID0gW2N1c3RvbWl6YXRpb25dO1xuXHRcdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW2N1c3RvbWl6YXRpb25dO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb246IFJvb3RDb25maWdDaGFuZ2VkQWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgY3VzdG9taXphdGlvbnM6IFtjdXN0b21pemF0aW9uXSB9LFxuXHRcdFx0fTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGFjdGlvbik7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRJbmZvQWN0aW9uID0gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuUm9vdEFnZW50c0NoYW5nZWQpLmF0KC0xKTtcblx0XHRcdGFzc2VydC5vayhhZ2VudEluZm9BY3Rpb24gJiYgaGFzS2V5KGFnZW50SW5mb0FjdGlvbi5hY3Rpb24sIHsgYWdlbnRzOiB0cnVlIH0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRJbmZvQWN0aW9uLmFjdGlvbi5hZ2VudHNbMF0/LmN1c3RvbWl6YXRpb25zLCBbY3VzdG9taXphdGlvbl0pO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uQ3VzdG9taXphdGlvbkFjdGlvbiA9IGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQpLmF0KC0xKTtcblx0XHRcdGFzc2VydC5vayhzZXNzaW9uQ3VzdG9taXphdGlvbkFjdGlvbiAmJiBoYXNLZXkoc2Vzc2lvbkN1c3RvbWl6YXRpb25BY3Rpb24uYWN0aW9uLCB7IGN1c3RvbWl6YXRpb25zOiB0cnVlIH0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbkN1c3RvbWl6YXRpb25BY3Rpb24uYWN0aW9uLmN1c3RvbWl6YXRpb25zLCBbY3VzdG9taXphdGlvbl0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXBkYXRlcyB0ZWxlbWV0cnkgbGV2ZWwgZnJvbSByb290IGNvbmZpZycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgYWN0aW9uOiBSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbENvbmZpZ0tleV06IHRlbGVtZXRyeUxldmVsVG9BZ2VudEhvc3RDb25maWdWYWx1ZShUZWxlbWV0cnlMZXZlbC5OT05FKSB9LFxuXHRcdFx0fTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8gd29ybGQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIG9uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UgaW50ZWdyYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlcHVibGlzaGVzIGFnZW50IGluZm8gYW5kIHNlc3Npb24gY3VzdG9taXphdGlvbnMgd2hlbiBhZ2VudCBmaXJlcyBvbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuXG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9uOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vcGx1Z2luLWInKSwgdXJpOiAnZmlsZTovLy9wbHVnaW4tYicsIG5hbWU6ICdQbHVnaW4gQicsIGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0gfTtcblx0XHRcdGFnZW50LmN1c3RvbWl6YXRpb25zID0gW2N1c3RvbWl6YXRpb25dO1xuXHRcdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW2N1c3RvbWl6YXRpb25dO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRhZ2VudC5maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2UoKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0XHRjb25zdCBhZ2VudEluZm9BY3Rpb24gPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuUm9vdEFnZW50c0NoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFnZW50SW5mb0FjdGlvbiAmJiBoYXNLZXkoYWdlbnRJbmZvQWN0aW9uLmFjdGlvbiwgeyBhZ2VudHM6IHRydWUgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEluZm9BY3Rpb24uYWN0aW9uLmFnZW50c1swXT8uY3VzdG9taXphdGlvbnMsIFtjdXN0b21pemF0aW9uXSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25DdXN0b21pemF0aW9uQWN0aW9uID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb25DdXN0b21pemF0aW9uQWN0aW9uICYmIGhhc0tleShzZXNzaW9uQ3VzdG9taXphdGlvbkFjdGlvbi5hY3Rpb24sIHsgY3VzdG9taXphdGlvbnM6IHRydWUgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uQ3VzdG9taXphdGlvbkFjdGlvbi5hY3Rpb24uY3VzdG9taXphdGlvbnMsIFtjdXN0b21pemF0aW9uXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZXB1Ymxpc2ggd2hlbiByZWdpc3RlclByb2dyZXNzTGlzdGVuZXIgaXMgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd29ya3NwYWNlJyk7XG5cblx0XHRcdGFnZW50LmN1c3RvbWl6YXRpb25zID0gW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BsdWdpbi1jJyksIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWMnLCBuYW1lOiAnUGx1Z2luIEMnLCB9XTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0YWdlbnQuZmlyZUN1c3RvbWl6YXRpb25zQ2hhbmdlKCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkKS5sZW5ndGgsXG5cdFx0XHRcdDAsXG5cdFx0XHRcdCdzaG91bGQgbm90IHJlcHVibGlzaCBzZXNzaW9uIGN1c3RvbWl6YXRpb25zIGFmdGVyIGxpc3RlbmVyIGRpc3Bvc2VkJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gaGFuZGxlQWN0aW9uOiBzZXNzaW9uL3Rvb2xDYWxsQ29uZmlybWVkIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gXHUyMDE0IHNlc3Npb24vdG9vbENhbGxDb25maXJtZWQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyb3V0ZXMgY29uZmlybWF0aW9uIHRvIGNvcnJlY3QgYWdlbnQgdmlhIF90b29sQ2FsbEFnZW50cycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnLCBkZWZhdWx0Q2hhdFVyaSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIEZpcmUgdG9vbF9zdGFydCB0byByZWdpc3RlciB0aGUgdG9vbCBjYWxsXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNvbmYtMScsIHRvb2xOYW1lOiAncmVhZCcsIGRpc3BsYXlOYW1lOiAnUmVhZCBGaWxlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY29uZi0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGZpbGUnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBGaXJlIHRvb2xfcmVhZHkgYXNraW5nIGZvciBwZXJtaXNzaW9uIChub24td3JpdGUsIHNvIG5vdCBhdXRvLWFwcHJvdmVkKVxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNvbmYtMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlLnR4dCcsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUmVhZCBmaWxlLnR4dCcsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiB1bmRlZmluZWQsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTm93IGNvbmZpcm0gdGhlIHRvb2wgY2FsbFxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY29uZi0xJyxcblx0XHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdGNvbmZpcm1lZDogJ3VzZXItYWN0aW9uJyBhcyBjb25zdCxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtY29uZi0xJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBkZW5pYWwgb2YgdG9vbCBjYWxsJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScsIGRlZmF1bHRDaGF0VXJpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1kZW55LTEnLCB0b29sTmFtZTogJ3NoZWxsJywgZGlzcGxheU5hbWU6ICdTaGVsbCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWRlbnktMScsIGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBjb21tYW5kJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZGVueS0xJyxcblx0XHRcdFx0YXBwcm92ZWQ6IGZhbHNlLFxuXHRcdFx0XHRyZWFzb246ICdkZW5pZWQnIGFzIGNvbnN0LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICd0Yy1kZW55LTEnLCBhcHByb3ZlZDogZmFsc2UgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHRvb2xfcmVhZHkgcHJvZ3Jlc3MgZGlzcGF0Y2ggLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndG9vbF9yZWFkeSBkaXNwYXRjaGVzIHByb2dyZXNzIGFjdGlvbnMgdG8gYWR2YW5jZSB0b29sIGNhbGwgc3RhdGUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd0b29sX3JlYWR5IGZvciBhIG5vbi1wZXJtaXNzaW9uIHRvb2wgZGlzcGF0Y2hlcyBDaGF0VG9vbENhbGxSZWFkeSBhbmQgYWR2YW5jZXMgc3RhdGUgZnJvbSBTdHJlYW1pbmcgdG8gUnVubmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gdG9vbF9zdGFydCBwdXRzIHRoZSB0b29sIGNhbGwgaW50byBTdHJlYW1pbmcgc3RhdGVcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVhZHktMScsIHRvb2xOYW1lOiAncnVuVGFzaycsIGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLCBjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlQWZ0ZXJTdGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IHBhcnRBZnRlclN0YXJ0ID0gc3RhdGVBZnRlclN0YXJ0Py5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnRBZnRlclN0YXJ0Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0QWZ0ZXJTdGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnRBZnRlclN0YXJ0LnRvb2xDYWxsLnN0YXR1cyA6IHVuZGVmaW5lZCwgVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKTtcblxuXHRcdFx0Ly8gdG9vbF9yZWFkeSB3aXRob3V0IGNvbmZpcm1hdGlvblRpdGxlIHNob3VsZCBkaXNwYXRjaCB0aGUgcmVhZHlcblx0XHRcdC8vIGFjdGlvbiBhbmQgYWR2YW5jZSB0aGUgdG9vbCBjYWxsIHRvIFJ1bm5pbmdcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1yZWFkeS0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsIHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogdW5kZWZpbmVkLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogdW5kZWZpbmVkLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlQWZ0ZXJSZWFkeSA9IGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcyA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3QgcCA9IHM/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRcdHJldHVybiBwPy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHAudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nID8gcyA6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGFydEFmdGVyUmVhZHkgPSBzdGF0ZUFmdGVyUmVhZHk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydEFmdGVyUmVhZHk/LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnRBZnRlclJlYWR5Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydEFmdGVyUmVhZHkudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLCBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHQndG9vbCBjYWxsIHNob3VsZCBhZHZhbmNlIGZyb20gU3RyZWFtaW5nIHRvIFJ1bm5pbmcgYWZ0ZXIgdG9vbF9yZWFkeScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9vbF9yZWFkeSBmb3IgYSBwZXJtaXNzaW9uLWdhdGVkIHRvb2wgZGlzcGF0Y2hlcyBDaGF0VG9vbENhbGxSZWFkeSBhbmQgYWR2YW5jZXMgc3RhdGUgdG8gUGVuZGluZ0NvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZXJtLTEnLCB0b29sTmFtZTogJ3dyaXRlJywgZGlzcGxheU5hbWU6ICdXcml0ZSBGaWxlJywgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyB0b29sX3JlYWR5IHdpdGggY29uZmlybWF0aW9uVGl0bGUgc2hvdWxkIGRpc3BhdGNoIHRoZSByZWFkeVxuXHRcdFx0Ly8gYWN0aW9uIGFuZCBhZHZhbmNlIHRoZSB0b29sIGNhbGwgdG8gUGVuZGluZ0NvbmZpcm1hdGlvblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBlcm0tMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgLmVudicsIHRvb2xJbnB1dDogJ3tcInBhdGhcIjpcIi5lbnZcIn0nLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgLmVudicsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiB1bmRlZmluZWQsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IHAgPSBzPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0XHRyZXR1cm4gcD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiA/IHMgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdCd0b29sIGNhbGwgc2hvdWxkIGFkdmFuY2UgdG8gUGVuZGluZ0NvbmZpcm1hdGlvbiBmb3IgcGVybWlzc2lvbi1nYXRlZCB0b29sX3JlYWR5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sX3JlYWR5IG1hcmtzIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUgb25seSBmb3IgZWxpZ2libGUgc2hlbGwgY29uZmlybWF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0XHRcdC8vIFJ1bGUgcmVzb2x2YWJpbGl0eSByZXF1aXJlcyBhIHN1Y2Nlc3NmdWwgdHJlZS1zaXR0ZXIgcGFyc2UuXG5cdFx0XHRhd2FpdCBzaWRlRWZmZWN0cy5pbml0aWFsaXplKCk7XG5cblx0XHRcdGNvbnN0IGNhc2VzID0gW1xuXHRcdFx0XHRbJ3RjLXNoZWxsLXJ1bGVzLTEnLCB7IHJlcXVlc3RTYW5kYm94QnlwYXNzOiBmYWxzZSwgc2hlbGxMYW5ndWFnZTogJ2Jhc2gnIGFzIGNvbnN0IH1dLFxuXHRcdFx0XHRbJ3RjLXNoZWxsLXJ1bGVzLTInLCB7IHJlcXVlc3RTYW5kYm94QnlwYXNzOiB0cnVlLCBzaGVsbExhbmd1YWdlOiAnYmFzaCcgYXMgY29uc3QgfV0sXG5cdFx0XHRcdFsndGMtc2hlbGwtcnVsZXMtMycsIHsgbWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQ6IHRydWUsIHNoZWxsTGFuZ3VhZ2U6ICdiYXNoJyBhcyBjb25zdCB9XSxcblx0XHRcdF0gYXMgY29uc3Q7XG5cdFx0XHRmb3IgKGNvbnN0IFt0b29sQ2FsbElkLCBzaWduYWxPdmVycmlkZXNdIG9mIGNhc2VzKSB7XG5cdFx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQsIHRvb2xOYW1lOiAnc2hlbGwnLCBkaXNwbGF5TmFtZTogJ1NoZWxsJywgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gY29tbWFuZCcsIHRvb2xJbnB1dDogJ2ZvbyAtLWJhcicsXG5cdFx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBpbiB0ZXJtaW5hbD8nLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdzaGVsbCcsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Li4uc2lnbmFsT3ZlcnJpZGVzLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IHBhcnRzID0gcz8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cztcblx0XHRcdFx0cmV0dXJuIHBhcnRzPy5sZW5ndGggPT09IGNhc2VzLmxlbmd0aCAmJiBwYXJ0cy5ldmVyeShwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbikgPyBzIDogdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzdGF0ZS5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLm1hcChwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHAudG9vbENhbGwuX21ldGE/LlsnYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZSddIDogdW5kZWZpbmVkKSxcblx0XHRcdFx0W3RydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXSxcblx0XHRcdFx0J29ubHkgdGhlIHJ1bGUtcmVzb2x2YWJsZSBzaGVsbCBjb25maXJtYXRpb24gaXMgbWFya2VkOyBzYW5kYm94LWJ5cGFzcyBhbmQgbWFuYWdlZCBjb25maXJtYXRpb25zIGFyZSBub3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rvb2xfcmVhZHkgZm9yd2FyZHMgdGhlIHNpZ25hbCBzaGVsbCBsYW5ndWFnZSBpbnRvIHNoZWxsIGFwcHJvdmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHRcdFx0YXdhaXQgc2lkZUVmZmVjdHMuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0XHQvLyBgZ2V0LWNoaWxkaXRlbWAgb25seSBtYXRjaGVzIHRoZSBkZWZhdWx0IGBHZXQtQ2hpbGRJdGVtYCBhbGxvdyBydWxlXG5cdFx0XHQvLyB1bmRlciBQb3dlclNoZWxsJ3MgY2FzZS1pbnNlbnNpdGl2ZSBtYXRjaGluZy4gTWlzc2luZyBsYW5ndWFnZSBmYWlsc1xuXHRcdFx0Ly8gY2xvc2VkIGJlZm9yZSBydWxlIGFuYWx5c2lzLlxuXHRcdFx0Y29uc3QgY2FzZXMgPSBbXG5cdFx0XHRcdFsndGMtc2hlbGwtbGFuZy0xJywgJ3Bvd2Vyc2hlbGwnXSxcblx0XHRcdFx0Wyd0Yy1zaGVsbC1sYW5nLTInLCAnYmFzaCddLFxuXHRcdFx0XHRbJ3RjLXNoZWxsLWxhbmctMycsIHVuZGVmaW5lZF0sXG5cdFx0XHRdIGFzIGNvbnN0O1xuXHRcdFx0Zm9yIChjb25zdCBbdG9vbENhbGxJZCwgc2hlbGxMYW5ndWFnZV0gb2YgY2FzZXMpIHtcblx0XHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZCwgdG9vbE5hbWU6ICdzaGVsbCcsIGRpc3BsYXlOYW1lOiAnU2hlbGwnLCBjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZCwgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBjb21tYW5kJywgdG9vbElucHV0OiAnZ2V0LWNoaWxkaXRlbScsXG5cdFx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBpbiB0ZXJtaW5hbD8nLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdzaGVsbCcsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2hlbGxMYW5ndWFnZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBwYXJ0cyA9IHM/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHM7XG5cdFx0XHRcdHJldHVybiBwYXJ0cz8ubGVuZ3RoID09PSBjYXNlcy5sZW5ndGggJiYgcGFydHMuZXZlcnkocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pID8gcyA6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c3RhdGUuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5tYXAocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGxcblx0XHRcdFx0XHQ/IFtwLnRvb2xDYWxsLl9tZXRhPy5bJ2F1dG9BcHByb3ZlQnlTZXR0aW5nJ10sIHAudG9vbENhbGwuX21ldGE/LlsnYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZSddXVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkKSxcblx0XHRcdFx0W1t0cnVlLCB1bmRlZmluZWRdLCBbdW5kZWZpbmVkLCB0cnVlXSwgW3VuZGVmaW5lZCwgdW5kZWZpbmVkXV0sXG5cdFx0XHRcdCdwb3dlcnNoZWxsIGF1dG8tYXBwcm92ZXM7IGJhc2ggc3RheXMgcnVsZS1yZXNvbHZhYmxlOyBtaXNzaW5nIGxhbmd1YWdlIGlzIG5laXRoZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rvb2xfcmVhZHkgaXMgZHJvcHBlZCB3aGVuIHRoZSB0b29sIGNvbXBsZXRlcyB3aGlsZSBwZXJtaXNzaW9uIGxvb2t1cCBpcyBwZW5kaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXN0YWxlLXJlYWR5JywgdG9vbE5hbWU6ICd2c2NvZGVBUEknLCBkaXNwbGF5TmFtZTogJ0dldCBWUyBDb2RlIEFQSSBSZWZlcmVuY2VzJyxcblx0XHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnZGlzY29ubmVjdGVkLWNsaWVudCcgfSxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zdGFsZS1yZWFkeScsIHRvb2xOYW1lOiAndnNjb2RlQVBJJywgZGlzcGxheU5hbWU6ICdHZXQgVlMgQ29kZSBBUEkgUmVmZXJlbmNlcycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdHZXQgVlMgQ29kZSBBUEkgUmVmZXJlbmNlcycsIHRvb2xJbnB1dDogJ3tcInF1ZXJ5XCI6XCJ0ZXN0XCJ9Jyxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ0FsbG93IHRvb2wgY2FsbD8nLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJywgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXN0YWxlLXJlYWR5Jyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdHZXQgVlMgQ29kZSBBUEkgUmVmZXJlbmNlcycsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXN0YWxlLXJlYWR5Jyxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0dldCBWUyBDb2RlIEFQSSBSZWZlcmVuY2VzIGZhaWxlZCcsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ0NsaWVudCBkaXNjb25uZWN0ZWQnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdGNvbnN0IHRvb2xDYWxsID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzXG5cdFx0XHRcdC5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHBhcnQudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLXN0YWxlLXJlYWR5Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhdHVzOiB0b29sQ2FsbD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHRvb2xDYWxsLnRvb2xDYWxsLnN0YXR1cyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVhZHlBY3Rpb25zOiBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSkubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0cmVhZHlBY3Rpb25zOiAxLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sX3JlYWR5IGZvciBhbiBhZGRpdGlvbmFsIGNoYXQgaXMgZW1pdHRlZCBvbiB0aGF0IGNoYXQgY2hhbm5lbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICdwZWVyJyk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGNoYXRVcmkpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25Db25maWcoc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSwgdmFsdWVzOiB7IFtTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXTogeyBhbGxvdzogW10sIGRlbnk6IFtdIH0gfSB9KTtcblx0XHRcdHN0YXJ0VHVybigndHVybi1wZWVyJywgY2hhdFVyaSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGNoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLXBlZXInLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZWVyLXBlcm0nLCB0b29sTmFtZTogJ3dyaXRlJywgZGlzcGxheU5hbWU6ICdXcml0ZSBGaWxlJywgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoY2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZWVyLXBlcm0nLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5lbnYnLCB0b29sSW5wdXQ6ICd7XCJwYXRoXCI6XCIuZW52XCJ9Jyxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIC5lbnYnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogdW5kZWZpbmVkLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcyA9IHN0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoY2hhdFVyaSk7XG5cdFx0XHRcdGNvbnN0IHAgPSBzPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtcGVlci1wZXJtJyk7XG5cdFx0XHRcdHJldHVybiBwPy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHAudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uID8gcyA6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZGVmYXVsdFN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdFBhcnQgPSBkZWZhdWx0U3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1wZWVyLXBlcm0nKTtcblx0XHRcdGNvbnN0IHBlZXJQYXJ0ID0gY2hhdFN0YXRlLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1wZWVyLXBlcm0nKTtcblx0XHRcdGNvbnN0IHJlYWR5RW52ZWxvcGUgPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkgJiYgaGFzS2V5KGUuYWN0aW9uLCB7IHRvb2xDYWxsSWQ6IHRydWUgfSkgJiYgZS5hY3Rpb24udG9vbENhbGxJZCA9PT0gJ3RjLXBlZXItcGVybScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cGVlclRvb2xTdGF0dXM6IHBlZXJQYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsXG5cdFx0XHRcdFx0PyBwZWVyUGFydC50b29sQ2FsbC5zdGF0dXNcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGVmYXVsdEhhc1Rvb2w6IGRlZmF1bHRQYXJ0ICE9PSB1bmRlZmluZWQsXG5cdFx0XHRcdHJlYWR5RW52ZWxvcGVDaGFubmVsOiByZWFkeUVudmVsb3BlPy5jaGFubmVsLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwZWVyVG9vbFN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0ZGVmYXVsdEhhc1Rvb2w6IGZhbHNlLFxuXHRcdFx0XHRyZWFkeUVudmVsb3BlQ2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdH0pO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oY2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBlZXItcGVybScsXG5cdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRjb25maXJtZWQ6ICd1c2VyLWFjdGlvbicgYXMgY29uc3QsXG5cdFx0XHRcdHNlbGVjdGVkT3B0aW9uSWQ6ICdhbGxvdy1zZXNzaW9uJyxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtcGVlci1wZXJtJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LmNvbmZpZz8udmFsdWVzW1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdLCB7IGFsbG93OiBbJ3dyaXRlJ10sIGRlbnk6IFtdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVuZGluZ19jb25maXJtYXRpb24gZm9yIGEgdG9vbCBpbnNpZGUgYSBzdWJhZ2VudCByb3V0ZXMgdG8gdGhlIHN1YmFnZW50IHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uOiBhIGBwZW5kaW5nX2NvbmZpcm1hdGlvbmAgc2lnbmFsIGZvciBhIGNsaWVudCB0b29sXG5cdFx0XHQvLyBpbnNpZGUgYSBzdWJhZ2VudCBtdXN0IGRpc3BhdGNoIENoYXRUb29sQ2FsbFJlYWR5IGFnYWluc3Rcblx0XHRcdC8vIHRoZSBzdWJhZ2VudCBzZXNzaW9uLCBub3QgdGhlIHBhcmVudC4gT3RoZXJ3aXNlIHRoZSBwYXJlbnRcblx0XHRcdC8vIHNlc3Npb24gc2VlcyBhIHN0cmF5IGBzZXNzaW9uL3Rvb2xDYWxsUmVhZHlgIHdpdGggbm9cblx0XHRcdC8vIHByZWNlZGluZyBgc2Vzc2lvbi90b29sQ2FsbFN0YXJ0YCwgd2hpY2ggaXMgaWxsZWdhbC5cblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gUGFyZW50IHRvb2wgdGhhdCBkZWxlZ2F0ZXMgdG8gYSBzdWJhZ2VudC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGFyZW50JywgdG9vbE5hbWU6ICdydW5TdWJhZ2VudCcsIGRpc3BsYXlOYW1lOiAnUnVuIFN1YmFnZW50JywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGFyZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLXBhcmVudCcsIGFnZW50TmFtZTogJ2hlbHBlcicsIGFnZW50RGlzcGxheU5hbWU6ICdIZWxwZXInIH0pO1xuXG5cdFx0XHQvLyBJbm5lciBjbGllbnQgdG9vbCBzdGFydHMgaW5zaWRlIHRoZSBzdWJhZ2VudC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWlubmVyJywgdG9vbE5hbWU6ICdwcm9ibGVtcycsIGRpc3BsYXlOYW1lOiAnUHJvYmxlbXMnLCBjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyB9LFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBQZXJtaXNzaW9uIGZsb3cgZmlyZXMgYHBlbmRpbmdfY29uZmlybWF0aW9uYCBmb3IgdGhlIGlubmVyXG5cdFx0XHQvLyBjbGllbnQgdG9vbC4gVGhlIHNpZ25hbCBtdXN0IGJlIHJvdXRlZCB0byB0aGUgc3ViYWdlbnRcblx0XHRcdC8vIGNoYXQgXHUyMDE0IG5vdCB0byB0aGUgcGFyZW50IFx1MjAxNCB3aGVuIHRoZSBzaWduYWwgY2FycmllcyB0aGUgcGFyZW50XG5cdFx0XHQvLyBjaGF0IFVSSSBhbmQgcGFyZW50VG9vbENhbGxJZC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtaW5uZXInLCB0b29sTmFtZTogJ3Byb2JsZW1zJywgZGlzcGxheU5hbWU6ICdQcm9ibGVtcycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdHZXQgcHJvYmxlbXMnLCB0b29sSW5wdXQ6ICd7fScsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHVuZGVmaW5lZCwgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGhlIHN1YmFnZW50IGNoYXQgbXVzdCBjb250YWluIHRoZSBDaGF0VG9vbENhbGxSZWFkeS5cblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtcGFyZW50Jyk7XG5cdFx0XHRjb25zdCBzdWJTdGF0ZSA9IGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcyA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0XHRjb25zdCBpbm5lciA9IHM/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1pbm5lcidcblx0XHRcdFx0KTtcblx0XHRcdFx0cmV0dXJuIGlubmVyPy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIGlubmVyLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyA/IHMgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGlubmVyUGFydCA9IHN1YlN0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLWlubmVyJ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhpbm5lclBhcnQsICdpbm5lciBjbGllbnQgdG9vbCBjYWxsIHNob3VsZCBleGlzdCBvbiBzdWJhZ2VudCBzZXNzaW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGlubmVyUGFydCEua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IGlubmVyUGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdCdpbm5lciBjbGllbnQgdG9vbCBjYWxsIHNob3VsZCBhZHZhbmNlIHRvIFJ1bm5pbmcgYWZ0ZXIgcGVuZGluZ19jb25maXJtYXRpb24nXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBUaGUgcGFyZW50IHNlc3Npb24gbXVzdCBOT1QgaGF2ZSBhIHN0cmF5IHRvb2wgY2FsbCBmb3IgdGhlXG5cdFx0XHQvLyBpbm5lciB0b29sQ2FsbElkIFx1MjAxNCB0aGF0IHdvdWxkIGJlIGEgQ2hhdFRvb2xDYWxsUmVhZHlcblx0XHRcdC8vIHdpdGhvdXQgYSBtYXRjaGluZyBDaGF0VG9vbENhbGxTdGFydC5cblx0XHRcdGNvbnN0IHBhcmVudFN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgcGFyZW50SW5uZXIgPSBwYXJlbnRTdGF0ZT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1pbm5lcidcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyZW50SW5uZXIsIHVuZGVmaW5lZCwgJ3BhcmVudCBzZXNzaW9uIG11c3Qgbm90IGNvbnRhaW4gdGhlIGlubmVyIHRvb2wgY2FsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVuZGluZ19jb25maXJtYXRpb24gd2l0aG91dCBhbiBhY3RpdmUgdHVybiBzdGlsbCBkaXNwYXRjaGVzIChkb2VzIG5vdCBoYW5nKScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb246IHdoZW4gYSBob29rLXRyaWdnZXJlZCBjb250aW51YXRpb24gcnVucyBhZnRlclxuXHRcdFx0Ly8gdGhlIHByb3RvY29sIHR1cm4gaGFzIGNvbXBsZXRlZCwgdGhlIHN0YXRlIG1hbmFnZXIgaGFzIG5vXG5cdFx0XHQvLyBhY3RpdmUgdHVybi4gQWN0aW9uIHNpZ25hbHMgZ28gdGhyb3VnaCBhIGZhbGxiYWNrIHBhdGgsIGJ1dFxuXHRcdFx0Ly8gcGVuZGluZ19jb25maXJtYXRpb24gd2FzIHNpbGVudGx5IGRyb3BwZWQgXHUyMDE0IGNhdXNpbmcgdGhlXG5cdFx0XHQvLyBwZXJtaXNzaW9uIGRlZmVycmVkIHRvIG5ldmVyIHJlc29sdmUgYW5kIHRoZSBzZXNzaW9uIHRvIGhhbmcuXG5cdFx0XHRzZXR1cFNlc3Npb24oVVJJLmZpbGUoJy93b3Jrc3BhY2UnKS50b1N0cmluZygpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFN0YXJ0IGEgdG9vbCBpbiB0aGUgYWN0aXZlIHR1cm5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbm9vcCcsIHRvb2xOYW1lOiAndmlldycsIGRpc3BsYXlOYW1lOiAnUmVhZCcsXG5cdFx0XHRcdFx0Y29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQ29tcGxldGUgdGhlIHR1cm4gXHUyMDE0IHN0YXRlIG1hbmFnZXIgbm8gbG9uZ2VyIGhhcyBhbiBhY3RpdmUgdHVyblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1ub29wJywgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdSZWFkIGZpbGUnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBWZXJpZnkgbm8gYWN0aXZlIHR1cm5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHNlc3Npb25VcmkudG9TdHJpbmcoKSksIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHRoZSBob29rLXRyaWdnZXJlZCBjb250aW51YXRpb246IHRvb2wgYWN0aW9uc1xuXHRcdFx0Ly8gYXJyaXZlIHdpdGhvdXQgYSBuZXcgcHJvdG9jb2wgdHVybiBiZWluZyBzdGFydGVkXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJycsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW9ycGhhbicsIHRvb2xOYW1lOiAndmlldycsIGRpc3BsYXlOYW1lOiAnUmVhZCcsXG5cdFx0XHRcdFx0Y29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTm93IHRoZSBwZW5kaW5nX2NvbmZpcm1hdGlvbiBhcnJpdmVzIFx1MjAxNCB0aGlzIG11c3QgTk9UIGJlIGRyb3BwZWRcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1vcnBoYW4nLCB0b29sTmFtZTogJ3ZpZXcnLCBkaXNwbGF5TmFtZTogJ1JlYWQnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBmaWxlLnRzJywgdG9vbElucHV0OiAne1wicGF0aFwiOlwiZmlsZS50c1wifScsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHVuZGVmaW5lZCwgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdyZWFkJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlL2ZpbGUudHMnLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZSByZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdCBzaG91bGQgaGF2ZSBiZWVuIGNhbGxlZFxuXHRcdFx0Ly8gKGF1dG8tYXBwcm92ZWQgYmVjYXVzZSByZWFkIGlzIGluc2lkZSB0aGUgd29ya2luZyBkaXJlY3RvcnkpLlxuXHRcdFx0Ly8gX2hhbmRsZVRvb2xSZWFkeSBpcyBhc3luYyAoYXdhaXRzIGdldEF1dG9BcHByb3ZhbCAtPiByZWFscGF0aCksXG5cdFx0XHQvLyBzbyB3YWl0IGZvciB0aGUgYXBwcm92YWwgdG8gc2V0dGxlIGRldGVybWluaXN0aWNhbGx5LlxuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCA+IDAgfHwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtb3JwaGFuJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0sICdwZW5kaW5nX2NvbmZpcm1hdGlvbiB3aXRob3V0IGFjdGl2ZSB0dXJuIHNob3VsZCBzdGlsbCBiZSBwcm9jZXNzZWQgYW5kIGF1dG8tYXBwcm92ZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBDaGF0VG9vbENhbGxDb21wbGV0ZSByb3V0aW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2hhbmRsZUFjdGlvbiBcdTIwMTQgY2hhdC90b29sQ2FsbENvbXBsZXRlIHJvdXRpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyBzZXNzaW9uICsgZGVmYXVsdCBjaGF0IFVSSSBmb3IgYSBkZWZhdWx0LWNoYXQgY29tcGxldGlvbicsICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb246IGFnZW50cyBrZXkgdGhlaXIgc2Vzc2lvbnMgYnkgc2Vzc2lvbiBpZCwgYnV0IHRoZVxuXHRcdFx0Ly8gVGhlIGV4YWN0IGRlZmF1bHQgY2hhdCBVUkkgbXVzdCBiZSBmb3J3YXJkZWQgdW5jaGFuZ2VkLlxuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZGVmYXVsdCcsXG5cdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnZG9uZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRhZ2VudC5jbGllbnRUb29sQ2FsbENvbXBsZXRlQ2FsbHMubWFwKGMgPT4gKHsgY2hhdDogYy5jaGF0LnRvU3RyaW5nKCksIHRvb2xDYWxsSWQ6IGMudG9vbENhbGxJZCB9KSksXG5cdFx0XHRcdFt7IGNoYXQ6IGRlZmF1bHRDaGF0VXJpLCB0b29sQ2FsbElkOiAndGMtZGVmYXVsdCcgfV0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgdGhlIGV4YWN0IGFkZGl0aW9uYWwgY2hhdCBVUkkgZm9yIGEgY29tcGxldGlvbicsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAncGVlci0xJyk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihwZWVyQ2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVlcicsXG5cdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnZG9uZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRhZ2VudC5jbGllbnRUb29sQ2FsbENvbXBsZXRlQ2FsbHMubWFwKGMgPT4gKHsgY2hhdDogYy5jaGF0LnRvU3RyaW5nKCksIHRvb2xDYWxsSWQ6IGMudG9vbENhbGxJZCB9KSksXG5cdFx0XHRcdFt7IGNoYXQ6IHBlZXJDaGF0VXJpLCB0b29sQ2FsbElkOiAndGMtcGVlcicgfV0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgcGFyZW50IHBlZXIgY2hhdCBVUkkgZm9yIGEgc3ViYWdlbnQtY2hhdCBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICdwZWVyLXN1YmFnZW50LXBhcmVudCcpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaS50b1N0cmluZygpLCBwZWVyQ2hhdFVyaSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tcGVlcicsIHBlZXJDaGF0VXJpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UocGVlckNoYXRVcmkpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0YWdlbnROYW1lOiAnZXhwbG9yZScsXG5cdFx0XHRcdGFnZW50RGlzcGxheU5hbWU6ICdFeHBsb3JlJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy1wYXJlbnQnKTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihzdWJhZ2VudENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi1zdWJhZ2VudCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1pbm5lcicsXG5cdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnZG9uZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRhZ2VudC5jbGllbnRUb29sQ2FsbENvbXBsZXRlQ2FsbHMubWFwKGMgPT4gKHtcblx0XHRcdFx0XHRjaGF0OiBjLmNoYXQudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBjLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0Ly8gYGNvbnRleHRgIGRlc2NyaWJlcyB0aGUgKmFkZHJlc3NlZCogY2hhdCwgc28gYSBwcm92aWRlciBjYW5cblx0XHRcdFx0XHQvLyByZWNvdmVyIHRoZSBzcGF3bmluZyBjaGF0ICsgdG9vbCBjYWxsIGZyb20gaXQuIFN0YW1waW5nIHRoZVxuXHRcdFx0XHRcdC8vIHJvdXRpbmcgdGFyZ2V0IGhlcmUgaW5zdGVhZCB3b3VsZCBtYWtlIHRoYXQgdW5yZXNvbHZhYmxlLlxuXHRcdFx0XHRcdGNvbnRleHRSZXNvdXJjZTogYy5jb250ZXh0Py5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHBhcmVudDogcmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudChjLmNvbnRleHQpPy5jaGF0LnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0cGFyZW50VG9vbENhbGxJZDogcmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudChjLmNvbnRleHQpPy50b29sQ2FsbElkLFxuXHRcdFx0XHR9KSksXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0Y2hhdDogcGVlckNoYXRVcmksXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWlubmVyJyxcblx0XHRcdFx0XHRjb250ZXh0UmVzb3VyY2U6IHN1YmFnZW50Q2hhdFVyaSxcblx0XHRcdFx0XHRwYXJlbnQ6IHBlZXJDaGF0VXJpLFxuXHRcdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLFxuXHRcdFx0XHR9XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbi1sZXZlbCBhdXRvLWFwcHJvdmUgKGNvbmZpZykgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdzZXNzaW9uIGNvbmZpZyBhdXRvLWFwcHJvdmUnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBzZXR1cFNlc3Npb25XaXRoQ29uZmlnKGF1dG9BcHByb3ZlTGV2ZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHQvLyBTZXQgY29uZmlnIG9uIHRoZSBzZXNzaW9uIHN0YXRlIGRpcmVjdGx5IChhcyBhZ2VudFNlcnZpY2UudHMgZG9lcylcblx0XHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhdXRvQXBwcm92ZToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0dGl0bGU6ICdBcHByb3ZhbHMnLFxuXHRcdFx0XHRcdFx0XHRlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10sXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRcdFx0XHRcdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogYXV0b0FwcHJvdmVMZXZlbCB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnYXV0by1hcHByb3ZlcyBhbGwgd3JpdGVzIHdoZW4gYXV0b0FwcHJvdmUgaXMgc2V0IHRvIGJ5cGFzcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbldpdGhDb25maWcoJ2F1dG9BcHByb3ZlJyk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWJ5cGFzcy0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1ieXBhc3MtMScsIGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgLmVudicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1ieXBhc3MtMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgLmVudicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2UvLmVudicsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCA+IDAgfHwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIC5lbnYgd291bGQgbm9ybWFsbHkgYmUgYmxvY2tlZCwgYnV0IHNlc3Npb24tbGV2ZWwgYXV0by1hcHByb3ZlIG92ZXJyaWRlc1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICd0Yy1ieXBhc3MtMScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dG8tYXBwcm92ZXMgc2hlbGwgY29tbWFuZHMgd2hlbiBhdXRvQXBwcm92ZSBpcyBzZXQgdG8gYnlwYXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uV2l0aENvbmZpZygnYXV0b0FwcHJvdmUnKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYnlwYXNzLXNoZWxsLTEnLCB0b29sTmFtZTogJ3NoZWxsJywgZGlzcGxheU5hbWU6ICdTaGVsbCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWJ5cGFzcy1zaGVsbC0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gcm0gLXJmIC8nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYnlwYXNzLXNoZWxsLTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBybSAtcmYgLycsIHRvb2xJbnB1dDogJ3JtIC1yZiAvJyxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogdW5kZWZpbmVkLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3NoZWxsJywgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMubGVuZ3RoID4gMCB8fCB1bmRlZmluZWQpO1xuXHRcdFx0Ly8gRGFuZ2Vyb3VzIGNvbW1hbmQgd291bGQgbm9ybWFsbHkgYmUgYmxvY2tlZCwgYnV0IHNlc3Npb24tbGV2ZWxcblx0XHRcdC8vIGJ5cGFzcyBhdXRvLWFwcHJvdmUgb3ZlcnJpZGVzLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICd0Yy1ieXBhc3Mtc2hlbGwtMScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgTk9UIGF1dG8tYXBwcm92ZSBhIHNoZWxsIGNvbW1hbmQgdGhhdCBvcHRlZCBvdXQgb2YgdGhlIHNhbmRib3gsIGV2ZW4gaW4gYnlwYXNzIG1vZGUnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb25XaXRoQ29uZmlnKCdhdXRvQXBwcm92ZScpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zYW5kYm94YnlwYXNzLTEnLCB0b29sTmFtZTogJ3NoZWxsJywgZGlzcGxheU5hbWU6ICdTaGVsbCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zYW5kYm94YnlwYXNzLTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBjYXQgfi9zb21ldGhpbmcudHh0JywgdG9vbElucHV0OiAnY2F0IH4vc29tZXRoaW5nLnR4dCcsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gY29tbWFuZCcsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnc2hlbGwnLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXF1ZXN0U2FuZGJveEJ5cGFzczogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBIHJlYWQtb25seSBjb21tYW5kIGxpa2UgYGNhdGAgKG9yIGV2ZW4gc2Vzc2lvbi1sZXZlbCBieXBhc3MpXG5cdFx0XHQvLyB3b3VsZCBub3JtYWxseSBhdXRvLWFwcHJvdmUsIGJ1dCBvcHRpbmcgb3V0IG9mIHRoZSBzYW5kYm94IGlzIGFuXG5cdFx0XHQvLyBlbGV2YXRpb24gb2YgcHJpdmlsZWdlIHRoZSB1c2VyIG11c3QgY29uZmlybSwgc28gbm8gYXV0by1hcHByb3ZhbFxuXHRcdFx0Ly8gcmVzcG9uc2UgaXMgc2VudC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrcyBwZW5kaW5nIGNsaWVudCB0b29sIGFwcHJvdmFsIGZvciBjbGllbnQtc2lkZSBhdXRvLWFwcHJvdmFsIGluIGJ5cGFzcyBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uV2l0aENvbmZpZygnYXV0b0FwcHJvdmUnKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJywgZGVmYXVsdENoYXRVcmkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNsaWVudC1hcHByb3ZlLTEnLCB0b29sTmFtZTogJ3J1blRhc2snLCBkaXNwbGF5TmFtZTogJ1J1biBUYXNrJywgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNsaWVudC1hcHByb3ZlLTEnLCB0b29sTmFtZTogJ3J1blRhc2snLCBkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biB0YXNrJywgdG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIHRhc2snLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJywgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcyA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3QgcCA9IHM/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1jbGllbnQtYXBwcm92ZS0xJyk7XG5cdFx0XHRcdHJldHVybiBwPy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHAudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uID8gcyA6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGFydCA9IHN0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtY2xpZW50LWFwcHJvdmUtMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXR1czogcGFydC50b29sQ2FsbC5zdGF0dXMsXG5cdFx0XHRcdG1ldGE6IHBhcnQudG9vbENhbGwuX21ldGEsXG5cdFx0XHRcdHBlcm1pc3Npb25DYWxsczogYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdG1ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcsIGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0sXG5cdFx0XHRcdHBlcm1pc3Npb25DYWxsczogW10sXG5cdFx0XHR9KTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY2xpZW50LWFwcHJvdmUtMScsXG5cdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmcsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICd0Yy1jbGllbnQtYXBwcm92ZS0xJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBOT1QgYXV0by1hcHByb3ZlIHdoZW4gYXV0b0FwcHJvdmUgaXMgZGVmYXVsdCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbldpdGhDb25maWcoJ2RlZmF1bHQnKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZGVmYXVsdC0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1kZWZhdWx0LTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5lbnYnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZGVmYXVsdC0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSAuZW52JywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHVuZGVmaW5lZCwgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICd3cml0ZScsIHBlcm1pc3Npb25QYXRoOiAnL3dvcmtzcGFjZS8uZW52Jyxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyAuZW52IHNob3VsZCBzdGlsbCBiZSBibG9ja2VkIHdpdGggZGVmYXVsdCBjb25maWdcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3BlY3RzIG1pZC1zZXNzaW9uIGNvbmZpZyBjaGFuZ2UgdmlhIFNlc3Npb25Db25maWdDaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uV2l0aENvbmZpZygnZGVmYXVsdCcpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gQ2hhbmdlIHRvIGJ5cGFzcyBtaWQtc2Vzc2lvblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW1pZC0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1taWQtMScsIGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgLmVudicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1taWQtMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgLmVudicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2UvLmVudicsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCA+IDAgfHwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIFNob3VsZCBub3cgYmUgYXV0by1hcHByb3ZlZCBhZnRlciBjb25maWcgY2hhbmdlXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW1xuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3RjLW1pZC0xJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdC8vIC0tLS0gRWRpdCBhdXRvLWFwcHJvdmUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdlZGl0IGF1dG8tYXBwcm92ZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2F1dG8tYXBwcm92ZXMgd3JpdGVzIHRvIHJlZ3VsYXIgc291cmNlIGZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWF1dG8tMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYXV0by0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSBmaWxlJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWF1dG8tMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgc3JjL2FwcC50cycsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2Uvc3JjL2FwcC50cycsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCA+IDAgfHwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIEF1dG8tYXBwcm92ZWQgd3JpdGVzIGNhbGwgcmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QgZGlyZWN0bHlcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtYXV0by0xJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmxvY2tzIHdyaXRlcyB0byAuZW52IGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWVudi0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1lbnYtMScsIGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgLmVudicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1lbnYtMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgLmVudicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgLmVudicsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2UvLmVudicsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2hvdWxkIE5PVCBhdXRvLWFwcHJvdmUgXHUyMDE0IC5lbnYgaXMgZXhjbHVkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMubGVuZ3RoLCAwKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGRpc3BhdGNoIGEgdG9vbF9yZWFkeSBhY3Rpb24gZm9yIHRoZSBjbGllbnQgdG8gY29uZmlybVxuXHRcdFx0Y29uc3QgcmVhZHlBY3Rpb24gPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlYWR5QWN0aW9uLCAnc2hvdWxkIGRpc3BhdGNoIHRvb2xfcmVhZHkgZm9yIGJsb2NrZWQgd3JpdGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Jsb2NrcyB3cml0ZXMgdG8gcGFja2FnZS5qc29uJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBrZy0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wa2ctMScsIGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgcGFja2FnZS5qc29uJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBrZy0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSBwYWNrYWdlLmpzb24nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIHBhY2thZ2UuanNvbicsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2UvcGFja2FnZS5qc29uJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdibG9ja3Mgd3JpdGVzIHRvIC5sb2NrIGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWxvY2stMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbG9jay0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSB5YXJuLmxvY2snLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbG9jay0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSB5YXJuLmxvY2snLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIHlhcm4ubG9jaycsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2UveWFybi5sb2NrJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdibG9ja3Mgd3JpdGVzIHRvIC5naXQgZGlyZWN0b3J5JywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWdpdC0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1naXQtMScsIGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgLmdpdC9jb25maWcnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZ2l0LTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5naXQvY29uZmlnJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdXcml0ZSAuZ2l0L2NvbmZpZycsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2UvLmdpdC9jb25maWcnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBSZWFkIGF1dG8tYXBwcm92ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3JlYWQgYXV0by1hcHByb3ZlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYXV0by1hcHByb3ZlcyByZWFkcyBpbnNpZGUgd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oVVJJLmZpbGUoJy93b3Jrc3BhY2UnKS50b1N0cmluZygpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVhZC0xJywgdG9vbE5hbWU6ICdyZWFkJywgZGlzcGxheU5hbWU6ICdSZWFkJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVhZC0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIGZpbGUnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVhZC0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIHNyYy9hcHAudHMnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogdW5kZWZpbmVkLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3JlYWQnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2Uvc3JjL2FwcC50cycsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCA+IDAgfHwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtcmVhZC0xJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgYXV0by1hcHByb3ZlIHJlYWRzIG91dHNpZGUgd29ya2luZyBkaXJlY3RvcnknLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oVVJJLmZpbGUoJy93b3Jrc3BhY2UnKS50b1N0cmluZygpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVhZC0yJywgdG9vbE5hbWU6ICdyZWFkJywgZGlzcGxheU5hbWU6ICdSZWFkJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVhZC0yJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIGZpbGUnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVhZC0yJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIC9ldGMvcGFzc3dkJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHVuZGVmaW5lZCwgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdyZWFkJywgcGVybWlzc2lvblBhdGg6ICcvZXRjL3Bhc3N3ZCcsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGgsIDApO1xuXG5cdFx0XHRjb25zdCByZWFkeUFjdGlvbiA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSk7XG5cdFx0XHRhc3NlcnQub2socmVhZHlBY3Rpb24sICdzaG91bGQgZGlzcGF0Y2ggdG9vbF9yZWFkeSBmb3IgcmVhZCBvdXRzaWRlIHdvcmtpbmcgZGlyZWN0b3J5Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gVGl0bGUgcGVyc2lzdGVuY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndGl0bGUgcGVyc2lzdGVuY2UnLCAoKSA9PiB7XG5cblx0XHRsZXQgc2Vzc2lvbkRiOiBTZXNzaW9uRGF0YWJhc2U7XG5cblx0XHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXNzaW9uRGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdH0pO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvck1ldGFkYXRhKGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRcdGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgMTAwOyBhdHRlbXB0KyspIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBzZXNzaW9uRGIuZ2V0TWV0YWRhdGEoa2V5KTtcblx0XHRcdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gbWV0YWRhdGEgJyR7a2V5fScgd2FzIG5vdCBwZXJzaXN0ZWRgKTtcblx0XHR9XG5cblx0XHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uRGIuY2xvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Nlc3Npb25UaXRsZUNoYW5nZWQgcGVyc2lzdHMgdG8gdGhlIGRhdGFiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBsb2NhbEFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBsb2NhbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgbG9jYWxTdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGxvY2FsQWdlbnQsXG5cdFx0XHRcdGFnZW50czogb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFtdPignYWdlbnRzJywgW2xvY2FsQWdlbnRdKSxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJ0luaXRpYWwnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL3Rlc3QtcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGxvY2FsU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHRcdHRpdGxlOiAnQ3VzdG9tIFRpdGxlJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgd2FpdEZvck1ldGFkYXRhKCdjdXN0b21UaXRsZScpLCAnQ3VzdG9tIFRpdGxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVMaXN0U2Vzc2lvbnMgcmV0dXJucyBwZXJzaXN0ZWQgY3VzdG9tIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbEFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBsb2NhbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihsb2NhbEFnZW50KTtcblxuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogbG9jYWxBZ2VudC5pZCB9KTtcblxuXHRcdFx0Ly8gUGVyc2lzdCBhIGN1c3RvbSB0aXRsZSBpbiB0aGUgREJcblx0XHRcdGF3YWl0IHNlc3Npb25EYi5zZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnLCAnTXkgQ3VzdG9tIFRpdGxlJyk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHQvLyBDdXN0b20gdGl0bGUgY29tZXMgZnJvbSB0aGUgREIgYW5kIGlzIHJldHVybmVkIHZpYSB0aGUgYWdlbnQncyBsaXN0U2Vzc2lvbnNcblx0XHRcdC8vIFRoZSBtb2NrIGFnZW50IHN1bW1hcnkgaXMgdXNlZDsgdGhlIHNlcnZpY2UgZG9lc24ndCByZWFkIHRoZSBEQiBmb3IgbGlzdFxuXHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb25zWzBdLnN1bW1hcnkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlUmVzdG9yZVNlc3Npb24gdXNlcyBwZXJzaXN0ZWQgY3VzdG9tIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbEFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBsb2NhbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihsb2NhbEFnZW50KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZUFnZW50U2Vzc2lvbihsb2NhbEFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgbG9jYWxBZ2VudC5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25zWzBdLnNlc3Npb247XG5cblx0XHRcdC8vIFBlcnNpc3QgYSBjdXN0b20gdGl0bGUgaW4gdGhlIERCXG5cdFx0XHRhd2FpdCBzZXNzaW9uRGIuc2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJywgJ1Jlc3RvcmVkIFRpdGxlJyk7XG5cblx0XHRcdC8vIFNldCB1cCBtaW5pbWFsIG1lc3NhZ2VzIGZvciByZXN0b3JlXG5cdFx0XHRsb2NhbEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSGVsbG8nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTInLCBjb250ZW50OiAnSGknLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlIS50aXRsZSwgJ1Jlc3RvcmVkIFRpdGxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlIGludGVybGVhdmVzIGEgcGVyc2lzdGVkIGxvY2FsIHR1cm4gYWZ0ZXIgaXRzIGFuY2hvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxBZ2VudCA9IG5ldyBNb2NrQWdlbnQoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9jYWxBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIobG9jYWxBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVBZ2VudFNlc3Npb24obG9jYWxBZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGxvY2FsQWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1swXS5zZXNzaW9uO1xuXG5cdFx0XHQvLyBUaGUgU0RLIHRyYW5zY3JpcHQgeWllbGRzIGEgc2luZ2xlIHJlYWwgdHVybiBrZXllZCBieSB0aGUgZmlyc3Rcblx0XHRcdC8vIHVzZXIgbWVzc2FnZSBpZCAoYGJ1aWxkVHVybnNGcm9tSGlzdG9yeWApLlxuXHRcdFx0bG9jYWxBZ2VudC5zZXNzaW9uTWVzc2FnZXMgPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ3JlYWwtMScsIGNvbnRlbnQ6ICdIZWxsbycsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdhLTEnLCBjb250ZW50OiAnSGknLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHQvLyBBIGhvc3QtaW5qZWN0ZWQgbG9jYWwgdHVybiByZWNvcmRlZCBhZ2FpbnN0IHRoYXQgcmVhbCB0dXJuLlxuXHRcdFx0Y29uc3QgbG9jYWxUdXJuID0ge1xuXHRcdFx0XHRpZDogJ2xvY2FsLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICchZWNobyBoaScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdwMScsIGNvbnRlbnQ6ICdyYW4nIH1dLFxuXHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdGF0ZTogMiwgLy8gVHVyblN0YXRlLkNvbXBsZXRlXG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgc2Vzc2lvbkRiLmluc2VydExvY2FsVHVybih7IHR1cm5JZDogJ2xvY2FsLTEnLCBjaGF0VXJpOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSwgYW5jaG9yVHVybklkOiAncmVhbC0xJywgc2VxOiAxLCBwYXlsb2FkOiBKU09OLnN0cmluZ2lmeShsb2NhbFR1cm4pIH0pO1xuXG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlPy50dXJucy5tYXAodCA9PiB0LmlkKSwgWydyZWFsLTEnLCAnbG9jYWwtMSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Nlc3Npb25Db25maWdDaGFuZ2VkIHBlcnNpc3RzIG1lcmdlZCBjb25maWcgdmFsdWVzIHRvIHRoZSBkYXRhYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxTdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxBZ2VudCA9IG5ldyBNb2NrQWdlbnQoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9jYWxBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIGxvY2FsU3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBsb2NhbEFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRbXT4oJ2FnZW50cycsIFtsb2NhbEFnZW50XSksXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gbG9jYWxTdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnSW5pdGlhbCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0XHR9KTtcblx0XHRcdHNlc3Npb24uY29uZmlnID0geyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0gfTtcblxuXHRcdFx0Ly8gTWlkLXNlc3Npb24gY2hhbmdlIG1lcmdlcyBuZXcgdmFsdWVzIGludG8gZXhpc3RpbmcuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0sXG5cdFx0XHR9LCB7IGNsaWVudElkOiAndGVzdC1jbGllbnQnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRsb2NhbFNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcGVyc2lzdGVkID0gYXdhaXQgd2FpdEZvck1ldGFkYXRhKCdjb25maWdWYWx1ZXMnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShwZXJzaXN0ZWQpLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VydmVyLWRpc3BhdGNoZWQgU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgcGVyc2lzdHMgbWVyZ2VkIGNvbmZpZyB2YWx1ZXMgdG8gdGhlIGRhdGFiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBsb2NhbEFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBsb2NhbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBsb2NhbFN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gbG9jYWxBZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50W10+KCdhZ2VudHMnLCBbbG9jYWxBZ2VudF0pLFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJ0luaXRpYWwnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL3Rlc3QtcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzZXNzaW9uLmNvbmZpZyA9IHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHsgbW9kZTogJ3BsYW4nLCBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0gfTtcblxuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogeyBtb2RlOiAnaW50ZXJhY3RpdmUnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcGVyc2lzdGVkID0gYXdhaXQgd2FpdEZvck1ldGFkYXRhKCdjb25maWdWYWx1ZXMnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShwZXJzaXN0ZWQpLCB7IG1vZGU6ICdpbnRlcmFjdGl2ZScsIGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTZXNzaW9uQ29uZmlnQ2hhbmdlZCBlbWl0cyBhZ2VudEhvc3QuZXhlY3V0aW9uTW9kZUNoYW5nZWQgZm9yIGVmZmVjdGl2ZSBtb2RlIHRyYW5zaXRpb25zIHdpdGhvdXQgZHVwbGljYXRlIGVjaG9lcycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25Db25maWcoc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdHNjaGVtYTogcGxhdGZvcm1TZXNzaW9uU2NoZW1hLnRvUHJvdG9jb2woKSxcblx0XHRcdFx0dmFsdWVzOiB7IG1vZGU6ICdpbnRlcmFjdGl2ZScgfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IG1vZGU6ICdwbGFuJyB9LFxuXHRcdFx0fSwgeyBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JywgY2xpZW50U2VxOiAxIH0sIHtcblx0XHRcdFx0Y2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3csXG5cdFx0XHRcdGNvbm5lY3Rpb25LaW5kOiBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZC5SZW1vdGVFeHRlbnNpb25Ib3N0LFxuXHRcdFx0XHR0cmFuc3BvcnRLaW5kOiBBZ2VudEhvc3RUcmFuc3BvcnRLaW5kLk1lc3NhZ2VQb3J0LFxuXHRcdFx0XHRob3N0TGF1bmNoS2luZDogQWdlbnRIb3N0TGF1bmNoS2luZC5WU0NvZGVNYWluUHJvY2Vzcyxcblx0XHRcdFx0bWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0XHRkZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgbW9kZTogJ3BsYW4nIH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IG1vZGU6ICdhdXRvcGlsb3QnIH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7fSxcblx0XHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLmZpbHRlcihldmVudCA9PiBldmVudC5ldmVudE5hbWUgPT09ICdhZ2VudEhvc3QuZXhlY3V0aW9uTW9kZUNoYW5nZWQnKSwgW3tcblx0XHRcdFx0ZXZlbnROYW1lOiAnYWdlbnRIb3N0LmV4ZWN1dGlvbk1vZGVDaGFuZ2VkJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ2VkaXRvcl93aW5kb3cnLFxuXHRcdFx0XHRcdGluaXRpYXRvckNvbm5lY3Rpb25LaW5kOiAncmVtb3RlX2V4dGVuc2lvbl9ob3N0Jyxcblx0XHRcdFx0XHRpbml0aWF0b3JUcmFuc3BvcnRLaW5kOiAnbWVzc2FnZV9wb3J0Jyxcblx0XHRcdFx0XHRob3N0TGF1bmNoS2luZDogJ3ZzY29kZV9tYWluX3Byb2Nlc3MnLFxuXHRcdFx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGZhbHNlLFxuXHRcdFx0XHRcdHByZXZpb3VzTW9kZTogJ2ludGVyYWN0aXZlJyxcblx0XHRcdFx0XHRuZXdNb2RlOiAncGxhbicsXG5cdFx0XHRcdFx0dHVybkNvdW50OiAxLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QuZXhlY3V0aW9uTW9kZUNoYW5nZWQnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGZhbHNlLFxuXHRcdFx0XHRcdHByZXZpb3VzTW9kZTogJ3BsYW4nLFxuXHRcdFx0XHRcdG5ld01vZGU6ICdhdXRvcGlsb3QnLFxuXHRcdFx0XHRcdHR1cm5Db3VudDogMSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZXZlbnROYW1lOiAnYWdlbnRIb3N0LmV4ZWN1dGlvbk1vZGVDaGFuZ2VkJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdFx0YWdlbnRTZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0XHRwcmV2aW91c01vZGU6ICdhdXRvcGlsb3QnLFxuXHRcdFx0XHRcdG5ld01vZGU6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHRcdFx0dHVybkNvdW50OiAxLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdC8vIC0tLS0gU3ViYWdlbnQgc2Vzc2lvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdzdWJhZ2VudCBzZXNzaW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2luaGVyaXRzIHRoZSBwYXJlbnQgdHVybiBjbGllbnQgaWRlbnRpdHkgZm9yIHN1YmFnZW50IHRlbGVtZXRyeScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgYWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1jbGllbnQnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgJ3Rlc3QnLCB7XG5cdFx0XHRcdGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LFxuXHRcdFx0XHRjb25uZWN0aW9uS2luZDogQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvbktpbmQuUmVtb3RlRXh0ZW5zaW9uSG9zdCxcblx0XHRcdFx0dHJhbnNwb3J0S2luZDogQWdlbnRIb3N0VHJhbnNwb3J0S2luZC5NZXNzYWdlUG9ydCxcblx0XHRcdFx0aG9zdExhdW5jaEtpbmQ6IEFnZW50SG9zdExhdW5jaEtpbmQuVlNDb2RlTWFpblByb2Nlc3MsXG5cdFx0XHRcdG1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0ZGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0XHR9KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJyxcblx0XHRcdFx0Y2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNsaWVudCcsXG5cdFx0XHRcdGFnZW50TmFtZTogJ3Jldmlld2VyJyxcblx0XHRcdFx0YWdlbnREaXNwbGF5TmFtZTogJ1Jldmlld2VyJyxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy1jbGllbnQnKTtcblx0XHRcdGNvbnN0IHN1YmFnZW50VHVybklkID0gc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzdWJhZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQub2soc3ViYWdlbnRUdXJuSWQpO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2Uoc3ViYWdlbnRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6IHN1YmFnZW50VHVybklkLCBkdXJhdGlvbjogMSB9IH0pO1xuXG5cdFx0XHRjb25zdCBldmVudCA9IHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLmZpbmQoZXZlbnQgPT4gZXZlbnQuZXZlbnROYW1lID09PSAnYWdlbnRIb3N0LnR1cm5Db21wbGV0ZWQnICYmIChldmVudC5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5pc1N1YmFnZW50U2Vzc2lvbiA9PT0gdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogKGV2ZW50Py5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKT8uaW5pdGlhdG9yQ2xpZW50VHlwZSxcblx0XHRcdFx0aW5pdGlhdG9yQ29ubmVjdGlvbktpbmQ6IChldmVudD8uZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk/LmluaXRpYXRvckNvbm5lY3Rpb25LaW5kLFxuXHRcdFx0XHRpbml0aWF0b3JUcmFuc3BvcnRLaW5kOiAoZXZlbnQ/LmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpPy5pbml0aWF0b3JUcmFuc3BvcnRLaW5kLFxuXHRcdFx0XHRob3N0TGF1bmNoS2luZDogKGV2ZW50Py5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKT8uaG9zdExhdW5jaEtpbmQsXG5cdFx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogKGV2ZW50Py5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKT8uaW5pdGlhdG9yTWFjaGluZUlkLFxuXHRcdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogKGV2ZW50Py5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKT8uaW5pdGlhdG9yRGV2RGV2aWNlSWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdlZGl0b3Jfd2luZG93Jyxcblx0XHRcdFx0aW5pdGlhdG9yQ29ubmVjdGlvbktpbmQ6ICdyZW1vdGVfZXh0ZW5zaW9uX2hvc3QnLFxuXHRcdFx0XHRpbml0aWF0b3JUcmFuc3BvcnRLaW5kOiAnbWVzc2FnZV9wb3J0Jyxcblx0XHRcdFx0aG9zdExhdW5jaEtpbmQ6ICd2c2NvZGVfbWFpbl9wcm9jZXNzJyxcblx0XHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3ViYWdlbnRfc3RhcnRlZCBjcmVhdGVzIGEgc3ViYWdlbnQgY2hhdCBhbmQgZGlzcGF0Y2hlcyBjb250ZW50IG9uIHBhcmVudCB0b29sIGNhbGwnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFN0YXJ0IGEgcGFyZW50IHRvb2wgY2FsbFxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdydW5TdWJhZ2VudCcsIGRpc3BsYXlOYW1lOiAnUnVuIFN1YmFnZW50JywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZyB0YXNrLi4uJyxcblx0XHRcdFx0XHR0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBGaXJlIHN1YmFnZW50X3N0YXJ0ZWRcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdjb2RlLXJldmlld2VyJyxcblx0XHRcdFx0YWdlbnREaXNwbGF5TmFtZTogJ0NvZGUgUmV2aWV3ZXInLFxuXHRcdFx0XHRhZ2VudERlc2NyaXB0aW9uOiAnUmV2aWV3cyBjb2RlJyxcblx0XHRcdFx0dGFza1Byb21wdDogJ1JldmlldyB0aGUgYXV0aCBtb2R1bGUgZm9yIHNlY3VyaXR5IGlzc3VlcycsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBzdWJhZ2VudCBjaGF0IHdhcyBjcmVhdGVkXG5cdFx0XHRjb25zdCBzdWJhZ2VudFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLTEnKTtcblx0XHRcdGNvbnN0IHN1YlN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzdWJhZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQub2soc3ViU3RhdGUsICdzdWJhZ2VudCBjaGF0IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRTdW1tYXJ5ID0gc3ViU3RhdGUhLmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBzdWJhZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViYWdlbnRTdW1tYXJ5Py50aXRsZSwgJ0NvZGUgUmV2aWV3ZXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3ViYWdlbnRTdW1tYXJ5Py5vcmlnaW4sIHsga2luZDogJ3Rvb2wnLCBjaGF0OiBkZWZhdWx0Q2hhdFVyaSwgdG9vbENhbGxJZDogJ3RjLTEnIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1YlN0YXRlIS5hY3RpdmVUdXJuLCAnc3ViYWdlbnQgY2hhdCBzaG91bGQgaGF2ZSBhbiBhY3RpdmUgdHVybicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YlN0YXRlIS5hY3RpdmVUdXJuIS5tZXNzYWdlLnRleHQsICdSZXZpZXcgdGhlIGF1dGggbW9kdWxlIGZvciBzZWN1cml0eSBpc3N1ZXMnLCAnc3ViYWdlbnQgdHVybiBzaG91bGQgcmVuZGVyIHRoZSBzcGF3bmluZyB0b29sIGNhbGwgcHJvbXB0IGFzIGl0cyByZXF1ZXN0Jyk7XG5cblx0XHRcdC8vIFZlcmlmeSBjb250ZW50IHdhcyBkaXNwYXRjaGVkIG9uIHRoZSBwYXJlbnQgdG9vbCBjYWxsXG5cdFx0XHRjb25zdCBwYXJlbnRTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhwYXJlbnRTdGF0ZT8uYWN0aXZlVHVybik7XG5cdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbCA9IHBhcmVudFN0YXRlIS5hY3RpdmVUdXJuIS5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLTEnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcmVudFRvb2xDYWxsKTtcblx0XHRcdGlmIChwYXJlbnRUb29sQ2FsbD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJlbnRUb29sQ2FsbC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHBhcmVudFRvb2xDYWxsLnRvb2xDYWxsLmNvbnRlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyZW50VG9vbENhbGwudG9vbENhbGwuY29udGVudCFbMF0udHlwZSwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0YW1wcyBfbWV0YS5zdWJhZ2VudENoYXRVcmkgb250byBhIHN1YmFnZW50LXNwYXduaW5nIHRvb2wgY2FsbCBhcyBzb29uIGFzIHRvb2xLaW5kIGlzIGtub3duJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZXhwZWN0ZWRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy0xJyk7XG5cdFx0XHRjb25zdCBwYXJlbnRTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IHRvb2xDYWxsID0gcGFyZW50U3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtMSdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2sodG9vbENhbGw/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRUb29sQ2FsbE1ldGEodG9vbENhbGwudG9vbENhbGwpLnN1YmFnZW50Q2hhdFVyaSwgZXhwZWN0ZWRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChleHBlY3RlZFVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXN0ZWQgc3ViYWdlbnRfc3RhcnRlZCByb3V0ZXMgZGlzY292ZXJ5IGJsb2NrIGFuZCBzZWVkcyBlYWNoIHJlcXVlc3QgcHJvbXB0IHZpYSB0aGUgaW1tZWRpYXRlIHBhcmVudCBjaGF0IChhcmJpdHJhcnkgZGVwdGgpJywgKCkgPT4ge1xuXHRcdFx0Ly8gUmVncmVzc2lvbjogZm9yIGEgc3ViYWdlbnQgc3Bhd25lZCBieSBhbm90aGVyIHN1YmFnZW50LCB0aGVcblx0XHRcdC8vIGBzdWJhZ2VudF9zdGFydGVkYCBzaWduYWwncyBgY2hhdGAgaXMgdGhlIHRvcC1sZXZlbCBjaGF0LCBidXRcblx0XHRcdC8vIGl0cyBzcGF3bmluZyB0b29sIGNhbGwgbGl2ZXMgaW4gdGhlIGltbWVkaWF0ZSBwYXJlbnQncyBzdWJhZ2VudFxuXHRcdFx0Ly8gY2hhdC4gVGhlIGRpc2NvdmVyeSBgQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWRgIG11c3QgbGFuZCB0aGVyZVxuXHRcdFx0Ly8gKHJlc29sdmVkIHZpYSBgcGFyZW50VG9vbENhbGxJZGApIFx1MjAxNCBkaXNwYXRjaGluZyBpdCBvbiB0aGVcblx0XHRcdC8vIHRvcC1sZXZlbCBjaGF0IGlzIGEgbm8tb3AsIGxlYXZpbmcgdGhlIG5lc3RlZCBzdWJhZ2VudFxuXHRcdFx0Ly8gdW5kaXNjb3ZlcmFibGUgYW5kIGhhbmdpbmcgYW55IGNsaWVudCB0b29sIGl0IHJ1bnMuIERyaXZlbiB0aHJlZVxuXHRcdFx0Ly8gbGV2ZWxzIGRlZXAgdG8gcHJvdmUgdGhlIHJlc29sdXRpb24gaXMgbm90IGNhcHBlZCBhdCB0d286IGVhY2hcblx0XHRcdC8vIGxldmVsJ3MgYmxvY2sgbGFuZHMgb24gaXRzIGltbWVkaWF0ZSBwYXJlbnQgY2hhdCB2aWEgYSBzaW5nbGVcblx0XHRcdC8vIGZsYXQtbWFwIGxvb2t1cCwgaW5kZXBlbmRlbnQgb2YgZGVwdGguXG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIExldmVsLTEgc3ViYWdlbnQgc3Bhd25lZCBmcm9tIHRoZSBkZWZhdWx0IGNoYXQuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtbDEnLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JywgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtbDEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLWwxJywgYWdlbnROYW1lOiAnbDEnLCBhZ2VudERpc3BsYXlOYW1lOiAnTDEnLCBhZ2VudERlc2NyaXB0aW9uOiAnZmlyc3QnLCB0YXNrUHJvbXB0OiAnbDEgcHJvbXB0JyB9KTtcblxuXHRcdFx0Ly8gTGV2ZWwtMiBzdWJhZ2VudCdzIHNwYXduaW5nIHRvb2wgcnVucyBJTlNJREUgdGhlIGxldmVsLTFcblx0XHRcdC8vIHN1YmFnZW50IChwYXJlbnRUb29sQ2FsbElkID0gdGMtbDEpLCBzbyBpdCBsYW5kcyBvbiB0aGUgbGV2ZWwtMVxuXHRcdFx0Ly8gc3ViYWdlbnQgY2hhdCByYXRoZXIgdGhhbiB0aGUgZGVmYXVsdCBjaGF0LlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtbDEnLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLWwyJywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtbDEnLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLWwyJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cblx0XHRcdC8vIExldmVsLTIgc3ViYWdlbnQgc3RhcnRzLiBJdHMgc3Bhd25pbmcgdG9vbCAodGMtbDIpIGxpdmVzIGluIHRoZVxuXHRcdFx0Ly8gbGV2ZWwtMSBzdWJhZ2VudCBjaGF0LCBzbyB0aGUgc2lnbmFsIGNhcnJpZXMgcGFyZW50VG9vbENhbGxJZCA9IHRjLWwxLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtbDInLCBhZ2VudE5hbWU6ICdsMicsIGFnZW50RGlzcGxheU5hbWU6ICdMMicsIGFnZW50RGVzY3JpcHRpb246ICdzZWNvbmQnLCB0YXNrUHJvbXB0OiAnbDIgcHJvbXB0JywgcGFyZW50VG9vbENhbGxJZDogJ3RjLWwxJyB9KTtcblxuXHRcdFx0Ly8gTGV2ZWwtMyBzdWJhZ2VudCdzIHNwYXduaW5nIHRvb2wgcnVucyBJTlNJREUgdGhlIGxldmVsLTJcblx0XHRcdC8vIHN1YmFnZW50IChwYXJlbnRUb29sQ2FsbElkID0gdGMtbDIpLCBsYW5kaW5nIG9uIHRoZSBsZXZlbC0yIGNoYXQuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1sMicsIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtbDMnLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JywgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1sMicsIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtbDMnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblxuXHRcdFx0Ly8gTGV2ZWwtMyBzdWJhZ2VudCBzdGFydHMuIEl0cyBzcGF3bmluZyB0b29sICh0Yy1sMykgbGl2ZXMgaW4gdGhlXG5cdFx0XHQvLyBsZXZlbC0yIHN1YmFnZW50IGNoYXQsIHNvIHRoZSBzaWduYWwgY2FycmllcyBwYXJlbnRUb29sQ2FsbElkID0gdGMtbDIuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy1sMycsIGFnZW50TmFtZTogJ2wzJywgYWdlbnREaXNwbGF5TmFtZTogJ0wzJywgYWdlbnREZXNjcmlwdGlvbjogJ3RoaXJkJywgdGFza1Byb21wdDogJ2wzIHByb21wdCcsIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1sMicgfSk7XG5cblx0XHRcdGNvbnN0IGwxQ2hhdFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLWwxJyk7XG5cdFx0XHRjb25zdCBsMkNoYXRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy1sMicpO1xuXHRcdFx0Y29uc3QgbDNDaGF0VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtbDMnKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUobDJDaGF0VXJpKSwgJ2xldmVsLTIgc3ViYWdlbnQgY2hhdCBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGwzQ2hhdFVyaSksICdsZXZlbC0zIHN1YmFnZW50IGNoYXQgc2hvdWxkIGV4aXN0Jyk7XG5cblx0XHRcdC8vIEFzc2VydHMgYSBzdWJhZ2VudCdzIGRpc2NvdmVyeSBibG9jayBsYW5kZWQgb24gYHBhcmVudENoYXRVcmlgJ3Ncblx0XHRcdC8vIGBzcGF3bmluZ1Rvb2xJZGAgdG9vbCBjYWxsLCBwb2ludGluZyBhdCBgY2hpbGRDaGF0VXJpYC5cblx0XHRcdGNvbnN0IGFzc2VydERpc2NvdmVyeUJsb2NrID0gKHBhcmVudENoYXRVcmk6IHN0cmluZywgc3Bhd25pbmdUb29sSWQ6IHN0cmluZywgY2hpbGRDaGF0VXJpOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgcGFyZW50U3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHBhcmVudENoYXRVcmkpO1xuXHRcdFx0XHRjb25zdCBzcGF3bmluZ1Rvb2wgPSBwYXJlbnRTdGF0ZT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gc3Bhd25pbmdUb29sSWQpO1xuXHRcdFx0XHRhc3NlcnQub2soc3Bhd25pbmdUb29sICYmIHNwYXduaW5nVG9vbC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCBgJHtzcGF3bmluZ1Rvb2xJZH0gc2hvdWxkIGxpdmUgaW4gJHtsYWJlbH1gKTtcblx0XHRcdFx0Y29uc3QgdGMgPSBzcGF3bmluZ1Rvb2wudG9vbENhbGw7XG5cdFx0XHRcdC8vIGBjb250ZW50YCBvbmx5IGV4aXN0cyBvbiB0aGUgcnVubmluZy9jb21wbGV0ZWQgdmFyaWFudHMgb2YgdGhlXG5cdFx0XHRcdC8vIFRvb2xDYWxsU3RhdGUgdW5pb247IHRoZSBzcGF3bmluZyB0b29sIGlzIHJ1bm5pbmcgaGVyZS5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRjLnN0YXR1cywgVG9vbENhbGxTdGF0dXMuUnVubmluZywgYCR7c3Bhd25pbmdUb29sSWR9IHNob3VsZCBiZSBydW5uaW5nIGluICR7bGFiZWx9YCk7XG5cdFx0XHRcdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYmxvY2sgPSB0Yy5jb250ZW50Py5maW5kKGMgPT4gaGFzS2V5KGMsIHsgdHlwZTogdHJ1ZSB9KSAmJiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5vayhibG9jaywgYHRoZSBkaXNjb3ZlcnkgYmxvY2sgZm9yICR7c3Bhd25pbmdUb29sSWR9IG11c3QgbGFuZCBvbiAke2xhYmVsfWApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGJsb2NrIGFzIHsgcmVzb3VyY2U6IHN0cmluZyB9KS5yZXNvdXJjZSwgY2hpbGRDaGF0VXJpKTtcblx0XHRcdH07XG5cblx0XHRcdC8vIEVhY2ggbGV2ZWwncyBkaXNjb3ZlcnkgYmxvY2sgbGFuZHMgb24gaXRzIGltbWVkaWF0ZSBwYXJlbnQgY2hhdC5cblx0XHRcdGFzc2VydERpc2NvdmVyeUJsb2NrKGwxQ2hhdFVyaSwgJ3RjLWwyJywgbDJDaGF0VXJpLCAndGhlIGxldmVsLTEgY2hhdCcpO1xuXHRcdFx0YXNzZXJ0RGlzY292ZXJ5QmxvY2sobDJDaGF0VXJpLCAndGMtbDMnLCBsM0NoYXRVcmksICd0aGUgbGV2ZWwtMiBjaGF0Jyk7XG5cblx0XHRcdC8vIEVhY2ggY2hpbGQgY2hhdCdzIG9wZW5pbmcgcmVxdWVzdCBpcyBzZWVkZWQgZnJvbSBpdHMgb3duXG5cdFx0XHQvLyBgc3ViYWdlbnRfc3RhcnRlZGAgc2lnbmFsJ3MgYHRhc2tQcm9tcHRgLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W2wxQ2hhdFVyaSwgbDJDaGF0VXJpLCBsM0NoYXRVcmldLm1hcCh1cmkgPT4gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZSh1cmkpPy5hY3RpdmVUdXJuPy5tZXNzYWdlLnRleHQpLFxuXHRcdFx0XHRbJ2wxIHByb21wdCcsICdsMiBwcm9tcHQnLCAnbDMgcHJvbXB0J10sXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBOZXN0ZWQgc3Bhd25pbmcgdG9vbHMgbXVzdCBOT1QgYmUgbWlzcm91dGVkIHRvIHRoZSB0b3AtbGV2ZWxcblx0XHRcdC8vIGRlZmF1bHQgY2hhdCwgd2hlcmUgdGhleSBkbyBub3QgZXhpc3QuXG5cdFx0XHRjb25zdCBkZWZhdWx0U3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBsMlRvb2xJbkRlZmF1bHQgPSBkZWZhdWx0U3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIChycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtbDInIHx8IHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1sMycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsMlRvb2xJbkRlZmF1bHQsIHVuZGVmaW5lZCwgJ25lc3RlZCBzcGF3bmluZyB0b29scyBtdXN0IG5vdCBhcHBlYXIgaW4gdGhlIHRvcC1sZXZlbCBjaGF0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdldmVudHMgd2l0aCBwYXJlbnRUb29sQ2FsbElkIHJvdXRlIHRvIHN1YmFnZW50IHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFN0YXJ0IHBhcmVudCB0b29sICsgc3ViYWdlbnRcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdydW5TdWJhZ2VudCcsIGRpc3BsYXlOYW1lOiAnUnVuIFN1YmFnZW50JywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtMScsIGFnZW50TmFtZTogJ2hlbHBlcicsIGFnZW50RGlzcGxheU5hbWU6ICdIZWxwZXInLCBhZ2VudERlc2NyaXB0aW9uOiAnSGVscHMnIH0pO1xuXG5cdFx0XHQvLyBGaXJlIGFuIGlubmVyIHRvb2wgc3RhcnQgd2l0aCBwYXJlbnRUb29sQ2FsbElkXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItdGMtMScsIHRvb2xOYW1lOiAncmVhZEZpbGUnLCBkaXNwbGF5TmFtZTogJ1JlYWQgRmlsZScsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItdGMtMScsIGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBmaWxlLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBpbm5lciB0b29sIGNhbGwgaXMgb24gdGhlIHN1YmFnZW50IGNoYXQncyB0dXJuLCBub3QgdGhlIHBhcmVudFxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy0xJyk7XG5cdFx0XHRjb25zdCBzdWJTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1YlN0YXRlPy5hY3RpdmVUdXJuKTtcblx0XHRcdGNvbnN0IGlubmVyVG9vbCA9IHN1YlN0YXRlIS5hY3RpdmVUdXJuIS5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ2lubmVyLXRjLTEnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGlubmVyVG9vbCwgJ2lubmVyIHRvb2wgY2FsbCBzaG91bGQgYmUgaW4gc3ViYWdlbnQgY2hhdCcpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIHBhcmVudCBzZXNzaW9uIGRvZXMgTk9UIGhhdmUgdGhlIGlubmVyIHRvb2wgY2FsbFxuXHRcdFx0Y29uc3QgcGFyZW50U3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBwYXJlbnRJbm5lclRvb2wgPSBwYXJlbnRTdGF0ZSEuYWN0aXZlVHVybiEucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICdpbm5lci10Yy0xJ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJlbnRJbm5lclRvb2wsIHVuZGVmaW5lZCwgJ2lubmVyIHRvb2wgY2FsbCBzaG91bGQgTk9UIGJlIGluIHBhcmVudCBzZXNzaW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZVN1YmFnZW50U2Vzc2lvbiBjbGVhcnMgcGVuZGluZyBidWZmZXJlZCBldmVudHMgd2hlbiBzdWJhZ2VudCBuZXZlciBzdGFydGVkJywgKCkgPT4ge1xuXHRcdFx0Ly8gUmVncmVzc2lvbjogaWYgdGhlIHBhcmVudCB0b29sIGNvbXBsZXRlcyAob3IgZmFpbHMpIGJlZm9yZSBhbnlcblx0XHRcdC8vIGBzdWJhZ2VudF9zdGFydGVkYCBhcnJpdmVzLCBidWZmZXJlZCBpbm5lciBldmVudHMgd291bGRcblx0XHRcdC8vIG90aGVyd2lzZSBsZWFrIGluIGBfcGVuZGluZ1N1YmFnZW50RXZlbnRzYCB1bnRpbCBzZXNzaW9uXG5cdFx0XHQvLyBkaXNwb3NhbC4gQWZ0ZXIgY29tcGxldGlvbiwgYSBsYXRlIGBzdWJhZ2VudF9zdGFydGVkYCBmb3IgdGhlXG5cdFx0XHQvLyBzYW1lIHRvb2xDYWxsSWQgbXVzdCBub3QgcmVwbGF5IHN0YWxlIGV2ZW50cy5cblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ3J1blN1YmFnZW50JywgZGlzcGxheU5hbWU6ICdSdW4gU3ViYWdlbnQnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0gfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cblx0XHRcdC8vIElubmVyIGV2ZW50IGFycml2ZXMgYnV0IGBzdWJhZ2VudF9zdGFydGVkYCBuZXZlciBkb2VzLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLTEnLCB0b29sTmFtZTogJ3JlYWQnLCBkaXNwbGF5TmFtZTogJ1JlYWQnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBQYXJlbnQgdG9vbCBjb21wbGV0ZXMgKGUuZy4gaXQgZXJyb3JlZCBiZWZvcmUgZGVsZWdhdGluZykuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiBmYWxzZSwgcGFzdFRlbnNlTWVzc2FnZTogJ0ZhaWxlZCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBOb3cgYSBsYXRlIGBzdWJhZ2VudF9zdGFydGVkYCBmb3IgdGhlIHNhbWUgdG9vbENhbGxJZCBhcnJpdmVzLlxuXHRcdFx0Ly8gVGhpcyBpcyB1bnVzdWFsIGJ1dCBwb3NzaWJsZSBhZnRlciBhIHJlY29ubmVjdC9yZXBsYXkuIFRoZVxuXHRcdFx0Ly8gZHJhaW4gbXVzdCBOT1QgcmVwbGF5IHRoZSAoY2xlYXJlZCkgYnVmZmVyZWQgaW5uZXIgdG9vbCBjYWxsLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtMScsIGFnZW50TmFtZTogJ2hlbHBlcicsIGFnZW50RGlzcGxheU5hbWU6ICdIZWxwZXInLCBhZ2VudERlc2NyaXB0aW9uOiAnSGVscHMnIH0pO1xuXG5cdFx0XHRjb25zdCBzdWJhZ2VudFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLTEnKTtcblx0XHRcdGNvbnN0IHN1YlN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzdWJhZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQub2soc3ViU3RhdGUsICdzdWJhZ2VudCBzZXNzaW9uIHNob3VsZCBzdGlsbCBiZSBjcmVhdGVkJyk7XG5cdFx0XHRjb25zdCBpbm5lclRvb2wgPSBzdWJTdGF0ZSEuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICdpbm5lci0xJ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbm5lclRvb2wsIHVuZGVmaW5lZCwgJ3N0YWxlIGJ1ZmZlcmVkIGlubmVyIHRvb2wgY2FsbCBtdXN0IG5vdCBiZSByZXBsYXllZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3ViYWdlbnRfY29tcGxldGVkIHNpZ25hbCBjb21wbGV0ZXMgdGhlIHN1YmFnZW50IHR1cm4nLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFN0YXJ0IHBhcmVudCB0b29sICsgc3ViYWdlbnRcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdydW5TdWJhZ2VudCcsIGRpc3BsYXlOYW1lOiAnUnVuIFN1YmFnZW50JywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtMScsIGFnZW50TmFtZTogJ2hlbHBlcicsIGFnZW50RGlzcGxheU5hbWU6ICdIZWxwZXInLCBhZ2VudERlc2NyaXB0aW9uOiAnSGVscHMnIH0pO1xuXG5cdFx0XHQvLyBDb21wbGV0aW5nIHRoZSBwYXJlbnQgdG9vbCBjYWxsIG11c3QgTk9UIHRlYXIgZG93biB0aGVcblx0XHRcdC8vIHN1YmFnZW50IHNlc3Npb24gXHUyMDE0IGJhY2tncm91bmQgc3ViYWdlbnRzIGtlZXAgcnVubmluZyBhZnRlclxuXHRcdFx0Ly8gdGhlaXIgcGFyZW50IHRvb2wgY2FsbCByZXR1cm5zLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ1N0YXJ0ZWQgaW4gYmFja2dyb3VuZCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdWJhZ2VudFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLTEnKTtcblx0XHRcdGxldCBzdWJTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1YlN0YXRlKTtcblx0XHRcdGFzc2VydC5vayhzdWJTdGF0ZSEuYWN0aXZlVHVybiwgJ3N1YmFnZW50IHR1cm4gc2hvdWxkIHN0aWxsIGJlIGFjdGl2ZSBhZnRlciBwYXJlbnQgdG9vbCBjb21wbGV0ZXMnKTtcblxuXHRcdFx0Ly8gVGhlIFNESydzIGBzdWJhZ2VudC5jb21wbGV0ZWRgL2BzdWJhZ2VudC5mYWlsZWRgIGV2ZW50IGlzIHdoYXRcblx0XHRcdC8vIGFjdHVhbGx5IGNsb3NlcyB0aGUgc3ViYWdlbnQgc2Vzc2lvbi5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9jb21wbGV0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtMScgfSk7XG5cblx0XHRcdHN1YlN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzdWJhZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViU3RhdGUhLmFjdGl2ZVR1cm4sIHVuZGVmaW5lZCwgJ3N1YmFnZW50IHR1cm4gc2hvdWxkIGJlIGNvbXBsZXRlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YlN0YXRlIS50dXJucy5sZW5ndGgsIDEpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnRfcmVzdW1lZCcsXG5cdFx0XHRcdGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnRm9sbG93IHVwJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0XHRcdHR1cm5JZDogJ3BhcmVudC10dXJuJyxcblx0XHRcdFx0XHRwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnZm9sbG93LXVwLXBhcnQnLCBjb250ZW50OiAnRm9sbG93LXVwIHJlc3BvbnNlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHN1YlN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzdWJhZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bWVzc2FnZTogc3ViU3RhdGU/LmFjdGl2ZVR1cm4/Lm1lc3NhZ2UudGV4dCxcblx0XHRcdFx0cmVzcG9uc2U6IHN1YlN0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdLFxuXHRcdFx0XHRjb21wbGV0ZWRUdXJuczogc3ViU3RhdGU/LnR1cm5zLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0bWVzc2FnZTogJ0ZvbGxvdyB1cCcsXG5cdFx0XHRcdHJlc3BvbnNlOiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnZm9sbG93LXVwLXBhcnQnLCBjb250ZW50OiAnRm9sbG93LXVwIHJlc3BvbnNlJyB9LFxuXHRcdFx0XHRjb21wbGV0ZWRUdXJuczogMSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVybWlzc2lvbiByZXF1ZXN0cyBmb3IgaW5hY3RpdmUgYW5kIHVucm91dGFibGUgc3ViYWdlbnRzIGFyZSBkZW5pZWQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy1pbmFjdGl2ZScsIGFnZW50TmFtZTogJ2hlbHBlcicsIGFnZW50RGlzcGxheU5hbWU6ICdIZWxwZXInLCBhZ2VudERlc2NyaXB0aW9uOiAnSGVscHMnIH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X2NvbXBsZXRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy1pbmFjdGl2ZScgfSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0cGFyZW50VG9vbENhbGxJZDogJ3RjLXN0YXJ0aW5nJyxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1zdGFydGluZy1wZXJtaXNzaW9uJywgdG9vbE5hbWU6ICdzaGVsbCcsIGRpc3BsYXlOYW1lOiAnU2hlbGwnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1zdGFydGluZycsXG5cdFx0XHRcdHN0YXRlOiB7IHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiwgdG9vbENhbGxJZDogJ3RjLXN0YXJ0aW5nLXBlcm1pc3Npb24nLCB0b29sTmFtZTogJ3NoZWxsJywgZGlzcGxheU5hbWU6ICdTaGVsbCcsIGludm9jYXRpb25NZXNzYWdlOiAnUnVuIGNvbW1hbmQnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1pbmFjdGl2ZScsXG5cdFx0XHRcdHN0YXRlOiB7IHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiwgdG9vbENhbGxJZDogJ3RjLWluYWN0aXZlLXBlcm1pc3Npb24nLCB0b29sTmFtZTogJ3NoZWxsJywgZGlzcGxheU5hbWU6ICdTaGVsbCcsIGludm9jYXRpb25NZXNzYWdlOiAnUnVuIGNvbW1hbmQnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1taXNzaW5nJyxcblx0XHRcdFx0c3RhdGU6IHsgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLCB0b29sQ2FsbElkOiAndGMtbWlzc2luZy1wZXJtaXNzaW9uJywgdG9vbE5hbWU6ICdzaGVsbCcsIGRpc3BsYXlOYW1lOiAnU2hlbGwnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBjb21tYW5kJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtaW5hY3RpdmUtcGVybWlzc2lvbicsIGFwcHJvdmVkOiBmYWxzZSB9LFxuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3RjLW1pc3NpbmctcGVybWlzc2lvbicsIGFwcHJvdmVkOiBmYWxzZSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWxTdWJhZ2VudFNlc3Npb25zIGNhbmNlbHMgYWxsIHN1YmFnZW50IGNoYXRzJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScsIGRlZmF1bHRDaGF0VXJpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gU3RhcnQgdHdvIHBhcmVudCB0b29sIGNhbGxzIHdpdGggc3ViYWdlbnRzXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAncnVuU3ViYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1N1YiAxJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZyAxLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy0xJywgYWdlbnROYW1lOiAnc3ViMScsIGFnZW50RGlzcGxheU5hbWU6ICdTdWIgMScsIGFnZW50RGVzY3JpcHRpb246ICdGaXJzdCcgfSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy0yJywgdG9vbE5hbWU6ICdydW5TdWJhZ2VudCcsIGRpc3BsYXlOYW1lOiAnU3ViIDInLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0gfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy0yJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nIDIuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLTInLCBhZ2VudE5hbWU6ICdzdWIyJywgYWdlbnREaXNwbGF5TmFtZTogJ1N1YiAyJywgYWdlbnREZXNjcmlwdGlvbjogJ1NlY29uZCcgfSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBCb3RoIHN1YmFnZW50IGNoYXRzIHNob3VsZCBoYXZlIHRoZWlyIHR1cm5zIGNvbXBsZXRlZCAoY2FuY2VsbGVkKVxuXHRcdFx0Y29uc3Qgc3ViMSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtMScpKTtcblx0XHRcdGNvbnN0IHN1YjIgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLTInKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViMT8uYWN0aXZlVHVybiwgdW5kZWZpbmVkLCAnc3ViMSB0dXJuIHNob3VsZCBiZSBjYW5jZWxsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWIyPy5hY3RpdmVUdXJuLCB1bmRlZmluZWQsICdzdWIyIHR1cm4gc2hvdWxkIGJlIGNhbmNlbGxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlU3ViYWdlbnRTZXNzaW9ucyByZW1vdmVzIGFsbCBzdWJhZ2VudCBjaGF0cyBmcm9tIHN0YXRlJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAncnVuU3ViYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1N1YiAxJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtMScsIGFnZW50TmFtZTogJ3N1YicsIGFnZW50RGlzcGxheU5hbWU6ICdTdWInLCBhZ2VudERlc2NyaXB0aW9uOiAnSGFzIHN1YmFnZW50JyB9KTtcblxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy0xJyk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShzdWJhZ2VudFVyaSkpO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5yZW1vdmVTdWJhZ2VudFNlc3Npb25zKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHN1YmFnZW50VXJpKSwgdW5kZWZpbmVkLCAnc3ViYWdlbnQgY2hhdCBzaG91bGQgYmUgcmVtb3ZlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsdGFzIHdpdGggcGFyZW50VG9vbENhbGxJZCByb3V0ZSB0byBzdWJhZ2VudCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAncnVuU3ViYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1J1biBTdWJhZ2VudCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLTEnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJywgYWdlbnREZXNjcmlwdGlvbjogJ0hlbHBzJyB9KTtcblxuXHRcdFx0Ly8gRmlyZSBhIGRlbHRhIHdpdGggcGFyZW50VG9vbENhbGxJZFxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdtc2ctc3ViJywgY29udGVudDogJ3RoaW5raW5nLi4uJyB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBkZWx0YSB3ZW50IHRvIHRoZSBzdWJhZ2VudCBzZXNzaW9uXG5cdFx0XHRjb25zdCBzdWJhZ2VudFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLTEnKTtcblx0XHRcdGNvbnN0IHN1YlN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzdWJhZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQub2soc3ViU3RhdGU/LmFjdGl2ZVR1cm4pO1xuXHRcdFx0Y29uc3QgbWFya2Rvd25QYXJ0ID0gc3ViU3RhdGUhLmFjdGl2ZVR1cm4hLnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93blxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhtYXJrZG93blBhcnQsICdkZWx0YSBzaG91bGQgY3JlYXRlIGEgbWFya2Rvd24gcGFydCBpbiBzdWJhZ2VudCBzZXNzaW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sX2NvbXBsZXRlIHByZXNlcnZlcyBzdWJhZ2VudCBjb250ZW50IGluIGNvbXBsZXRlZCB0b29sIGNhbGwnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtMScsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBhZ2VudERpc3BsYXlOYW1lOiAnRXhwbG9yZScsIGFnZW50RGVzY3JpcHRpb246ICdFeHBsb3JlcycgfSk7XG5cblx0XHRcdC8vIFZlcmlmeSBzdWJhZ2VudCBjb250ZW50IGlzIG9uIHRoZSBydW5uaW5nIHRvb2xcblx0XHRcdGNvbnN0IHJ1bm5pbmdTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IHJ1bm5pbmdUb29sID0gcnVubmluZ1N0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLTEnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJ1bm5pbmdUb29sPy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uaW5nVG9vbC50b29sQ2FsbC5zdGF0dXMsIFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpO1xuXG5cdFx0XHQvLyBDb21wbGV0ZSB0aGUgdG9vbCBcdTIwMTQgdGhlIFNESyByZXN1bHQgaGFzIGl0cyBvd24gY29udGVudFxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ0RlbGVnYXRlZCcsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnRG9uZScgfV0gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIGNvbXBsZXRlZCB0b29sIHN0aWxsIGhhcyB0aGUgc3ViYWdlbnQgY29udGVudCBlbnRyeVxuXHRcdFx0Y29uc3QgY29tcGxldGVkU3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRUb29sID0gY29tcGxldGVkU3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtMSdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soY29tcGxldGVkVG9vbD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGVkVG9vbC50b29sQ2FsbC5zdGF0dXMsIFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY29tcGxldGVkVG9vbC50b29sQ2FsbC5jb250ZW50ID8/IFtdO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRFbnRyeSA9IGNvbnRlbnQuZmluZChjID0+IGhhc0tleShjLCB7IHR5cGU6IHRydWUgfSkgJiYgYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1YmFnZW50RW50cnksICdDb21wbGV0ZWQgdG9vbCBzaG91bGQgcHJlc2VydmUgc3ViYWdlbnQgY29udGVudCBlbnRyeScpO1xuXHRcdFx0Y29uc3QgdGV4dEVudHJ5ID0gY29udGVudC5maW5kKGMgPT4gaGFzS2V5KGMsIHsgdHlwZTogdHJ1ZSB9KSAmJiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0KTtcblx0XHRcdGFzc2VydC5vayh0ZXh0RW50cnksICdDb21wbGV0ZWQgdG9vbCBzaG91bGQgYWxzbyBoYXZlIHRoZSBTREsgcmVzdWx0IGNvbnRlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lubmVyIHRvb2xfc3RhcnQgYXJyaXZpbmcgQkVGT1JFIHN1YmFnZW50X3N0YXJ0ZWQgcm91dGVzIHRvIHN1YmFnZW50IChub3QgcGFyZW50KScsICgpID0+IHtcblx0XHRcdC8vIFJlcHJvZHVjZXMgdGhlIHJlZ3Jlc3Npb24gd2hlcmUgaW5uZXIgc3ViYWdlbnQgdG9vbCBjYWxscyBzaG93IHVwXG5cdFx0XHQvLyBmbGF0IGF0IHRoZSB0b3AgbGV2ZWwgb2YgdGhlIHBhcmVudCBzZXNzaW9uIGJlY2F1c2UgdGhlIFNESyBjYW5cblx0XHRcdC8vIGVtaXQgYHRvb2xfc3RhcnRgICh3aXRoIHBhcmVudFRvb2xDYWxsSWQpIGJlZm9yZSBgc3ViYWdlbnRfc3RhcnRlZGAuXG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIDEuIFBhcmVudCB0b29sIHN0YXJ0cyAodGhlIGB0YXNrYCBpbnZvY2F0aW9uKS5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0gfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblxuXHRcdFx0Ly8gMi4gSW5uZXIgdG9vbCBmaXJlcyBCRUZPUkUgc3ViYWdlbnRfc3RhcnRlZCAocmFjZSBjb25kaXRpb24pLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItdGMtMScsIHRvb2xOYW1lOiAncmVhZEZpbGUnLCBkaXNwbGF5TmFtZTogJ1JlYWQgRmlsZScsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci10Yy0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGZpbGUuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyAzLiBzdWJhZ2VudF9zdGFydGVkIGFycml2ZXMgbGF0ZXIuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJywgYWdlbnREZXNjcmlwdGlvbjogJ0hlbHBzJyB9KTtcblxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy1wYXJlbnQnKTtcblx0XHRcdGNvbnN0IHN1YlN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzdWJhZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQub2soc3ViU3RhdGU/LmFjdGl2ZVR1cm4sICdzdWJhZ2VudCBzZXNzaW9uIHNob3VsZCBleGlzdCcpO1xuXG5cdFx0XHRjb25zdCBpbm5lclRvb2wgPSBzdWJTdGF0ZSEuYWN0aXZlVHVybiEucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICdpbm5lci10Yy0xJ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhpbm5lclRvb2wsICdpbm5lciB0b29sIGZpcmVkIGJlZm9yZSBzdWJhZ2VudF9zdGFydGVkIHNob3VsZCBzdGlsbCBlbmQgdXAgaW4gdGhlIHN1YmFnZW50IHNlc3Npb24nKTtcblxuXHRcdFx0Ly8gUGFyZW50IG11c3QgTk9UIGhhdmUgdGhlIGlubmVyIHRvb2wuXG5cdFx0XHRjb25zdCBwYXJlbnRTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IHBhcmVudElubmVyVG9vbCA9IHBhcmVudFN0YXRlIS5hY3RpdmVUdXJuIS5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ2lubmVyLXRjLTEnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmVudElubmVyVG9vbCwgdW5kZWZpbmVkLCAnaW5uZXIgdG9vbCBtdXN0IG5vdCBsZWFrIGludG8gcGFyZW50IHNlc3Npb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRzIGluc2lkZSBwYXJlbnQgd29ya2luZyBkaXJlY3RvcnkgYXJlIGF1dG8tYXBwcm92ZWQgZm9yIHRvb2xzIGluIHN1YmFnZW50IHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU3ViYWdlbnQgc2Vzc2lvbnMgZG9uJ3QgY2FycnkgdGhlaXIgb3duIHdvcmtpbmdEaXJlY3Rvcnkgb3Jcblx0XHRcdC8vIGF1dG9BcHByb3ZlIGNvbmZpZy4gV2l0aG91dCBpbmhlcml0YW5jZSBmcm9tIHRoZSBwYXJlbnQsIGV2ZXJ5XG5cdFx0XHQvLyB0b29sIGNhbGwgaW5zaWRlIGEgc3ViYWdlbnQgKGV2ZW4gYSByZWFkIGluIHRoZSB3b3Jrc3BhY2UpIHdvdWxkXG5cdFx0XHQvLyBzdXJmYWNlIGEgY29uZmlybWF0aW9uIGRpYWxvZy5cblx0XHRcdHNldHVwU2Vzc2lvbihVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gUGFyZW50IHRhc2sgdG9vbCBzcGF3bnMgYSBzdWJhZ2VudC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0gfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLXBhcmVudCcsIGFnZW50TmFtZTogJ2hlbHBlcicsIGFnZW50RGlzcGxheU5hbWU6ICdIZWxwZXInLCBhZ2VudERlc2NyaXB0aW9uOiAnSGVscHMnIH0pO1xuXG5cdFx0XHQvLyBJbm5lciB0b29sIGluc2lkZSB0aGUgc3ViYWdlbnQgcmVxdWVzdHMgcGVybWlzc2lvbiB0byByZWFkIGEgZmlsZVxuXHRcdFx0Ly8gaW5zaWRlIHRoZSBwYXJlbnQgd29ya3NwYWNlLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItcmVhZC0xJywgdG9vbE5hbWU6ICdyZWFkJywgZGlzcGxheU5hbWU6ICdSZWFkJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXJlYWQtMScsIGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci1yZWFkLTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWQgc3JjL2FwcC50cycsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAncmVhZCcsIHBlcm1pc3Npb25QYXRoOiAnL3dvcmtzcGFjZS9zcmMvYXBwLnRzJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMubGVuZ3RoID4gMCB8fCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICdpbm5lci1yZWFkLTEnLCBhcHByb3ZlZDogdHJ1ZSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9uLWxldmVsIGF1dG9BcHByb3ZlIG9uIHRoZSBwYXJlbnQgaXMgaW5oZXJpdGVkIGJ5IHRvb2xzIGluIHN1YmFnZW50IHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBTZXQgdGhlIHBhcmVudCBzZXNzaW9uIHRvIFwiQnlwYXNzIEFwcHJvdmFsc1wiIHZpYSBzZXNzaW9uIGNvbmZpZy5cblx0XHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhdXRvQXBwcm92ZToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0dGl0bGU6ICdBcHByb3ZhbHMnLFxuXHRcdFx0XHRcdFx0XHRlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10sXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRcdFx0XHRcdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0gfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLXBhcmVudCcsIGFnZW50TmFtZTogJ2hlbHBlcicsIGFnZW50RGlzcGxheU5hbWU6ICdIZWxwZXInLCBhZ2VudERlc2NyaXB0aW9uOiAnSGVscHMnIH0pO1xuXG5cdFx0XHQvLyBJbm5lciB3cml0ZSBvdXRzaWRlIHRoZSB3b3Jrc3BhY2Ugd291bGQgbm9ybWFsbHkgTk9UIGF1dG8tYXBwcm92ZSxcblx0XHRcdC8vIGJ1dCBzZXNzaW9uLWxldmVsIGF1dG9BcHByb3ZlIG9uIHRoZSBwYXJlbnQgbXVzdCBhcHBseS5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXdyaXRlLTEnLCB0b29sTmFtZTogJ3dyaXRlJywgZGlzcGxheU5hbWU6ICdXcml0ZScsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci13cml0ZS0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSBmaWxlJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci13cml0ZS0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSAvdG1wL2ZvbycsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy90bXAvZm9vJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMubGVuZ3RoID4gMCB8fCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICdpbm5lci13cml0ZS0xJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gaW5wdXROZWVkZWQgcHJvZHVjdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3Nlc3Npb24gaW5wdXROZWVkZWQgcHJvZHVjdGlvbicsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIHNlc3Npb25JbnB1dE5lZWRlZCgpIHtcblx0XHRcdHJldHVybiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LmlucHV0TmVlZGVkID8/IFtdO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNlc3Npb25TdGF0dXMoKSB7XG5cdFx0XHRyZXR1cm4gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5zdGF0dXM7XG5cdFx0fVxuXG5cdFx0dGVzdCgnY2hhdCBpbnB1dCByZXF1ZXN0IG1pcnJvcnMgaXRzIHVucmVzb2x2ZWQgcmVzcG9uc2UgcGFydCBhbmQgaXMgcmVtb3ZlZCBvbiBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsXG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0XHRxdWVzdGlvbnM6IFt7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0LCBpZDogJ3F1ZXN0aW9uLTEnLCBtZXNzYWdlOiAnV2hpY2ggdmFsdWU/JyB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0QW5zd2VyQ2hhbmdlZCxcblx0XHRcdFx0cmVxdWVzdElkOiAncmVxLTEnLFxuXHRcdFx0XHRxdWVzdGlvbklkOiAncXVlc3Rpb24tMScsXG5cdFx0XHRcdGFuc3dlcjoge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5EcmFmdCxcblx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6ICdkcmFmdCB2YWx1ZScgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwcm9kdWNlZCA9IHNlc3Npb25JbnB1dE5lZWRlZCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9kdWNlZC5tYXAociA9PiAoe1xuXHRcdFx0XHRraW5kOiByLmtpbmQsXG5cdFx0XHRcdGNoYXQ6IHIuY2hhdCxcblx0XHRcdFx0cmVxdWVzdDogci5raW5kID09PSBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5DaGF0SW5wdXQgPyByLnJlcXVlc3QgOiB1bmRlZmluZWQsXG5cdFx0XHR9KSksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLkNoYXRJbnB1dCxcblx0XHRcdFx0XHRjaGF0OiBkZWZhdWx0Q2hhdFVyaSxcblx0XHRcdFx0XHRyZXF1ZXN0OiB7XG5cdFx0XHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0XHRcdHF1ZXN0aW9uczogW3sga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsIGlkOiAncXVlc3Rpb24tMScsIG1lc3NhZ2U6ICdXaGljaCB2YWx1ZT8nIH1dLFxuXHRcdFx0XHRcdFx0YW5zd2Vyczoge1xuXHRcdFx0XHRcdFx0XHQncXVlc3Rpb24tMSc6IHtcblx0XHRcdFx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuRHJhZnQsXG5cdFx0XHRcdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnZHJhZnQgdmFsdWUnIH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdyZXEtMScsXG5cdFx0XHRcdHJlc3BvbnNlOiBTZXNzaW9uSW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbklucHV0TmVlZGVkKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2VwdGVkIGFzay11c2VyIGlucHV0IGVtaXRzIHRlbGVtZXRyeSBmcm9tIHN5bmNocm9uaXplZCBhbnN3ZXIgc3RhdGUnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCxcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdGlkOiAncmVxLTEnLFxuXHRcdFx0XHRcdHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkFza1VzZXIsXG5cdFx0XHRcdFx0cXVlc3Rpb25zOiBbeyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCwgaWQ6ICdxdWVzdGlvbi0xJywgbWVzc2FnZTogJ1doaWNoIHZhbHVlPycgfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dEFuc3dlckNoYW5nZWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogJ3JlcS0xJyxcblx0XHRcdFx0cXVlc3Rpb25JZDogJ3F1ZXN0aW9uLTEnLFxuXHRcdFx0XHRhbnN3ZXI6IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ2Fuc3dlcicgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAyIH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdyZXEtMScsXG5cdFx0XHRcdHJlc3BvbnNlOiBTZXNzaW9uSW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LFxuXHRcdFx0fSwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDMgfSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50ID0gdGVsZW1ldHJ5U2VydmljZS5ldmVudHMuZmluZChldmVudCA9PiBldmVudC5ldmVudE5hbWUgPT09ICdhc2tRdWVzdGlvbnNUb29sSW52b2tlZCcpO1xuXHRcdFx0Y29uc3QgZGF0YSA9IGV2ZW50Py5kYXRhIGFzIElBZ2VudEhvc3RBc2tRdWVzdGlvbnNUb29sSW52b2tlZEV2ZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudCAmJiB7XG5cdFx0XHRcdGV2ZW50TmFtZTogZXZlbnQuZXZlbnROYW1lLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0Li4uZGF0YSxcblx0XHRcdFx0XHRkdXJhdGlvbjogdHlwZW9mIGRhdGE/LmR1cmF0aW9uLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRldmVudE5hbWU6ICdhc2tRdWVzdGlvbnNUb29sSW52b2tlZCcsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHF1ZXN0aW9uQ291bnQ6IDEsXG5cdFx0XHRcdFx0YW5zd2VyZWRDb3VudDogMSxcblx0XHRcdFx0XHRza2lwcGVkQ291bnQ6IDAsXG5cdFx0XHRcdFx0ZnJlZVRleHRDb3VudDogMSxcblx0XHRcdFx0XHRyZWNvbW1lbmRlZEF2YWlsYWJsZUNvdW50OiAwLFxuXHRcdFx0XHRcdHJlY29tbWVuZGVkU2VsZWN0ZWRDb3VudDogMCxcblx0XHRcdFx0XHRkdXJhdGlvbjogJ251bWJlcicsXG5cdFx0XHRcdFx0cHJvdmlkZXI6IGFnZW50LmlkLFxuXHRcdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSksXG5cdFx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjaGF0IHRydW5jYXRpb24gY2xlYXJzIHBlbmRpbmcgYXNrLXVzZXIgdGVsZW1ldHJ5JywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCByZXF1ZXN0OiBDaGF0SW5wdXRSZXF1ZXN0ID0ge1xuXHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0cHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuQXNrVXNlcixcblx0XHRcdFx0cXVlc3Rpb25zOiBbeyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCwgaWQ6ICdxdWVzdGlvbi0xJywgbWVzc2FnZTogJ1doaWNoIHZhbHVlPycgfV0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0XHRyZXF1ZXN0LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdHN0YXJ0VHVybigndHVybi0yJyk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsXG5cdFx0XHRcdHJlcXVlc3QsXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZCxcblx0XHRcdFx0cmVxdWVzdElkOiByZXF1ZXN0LmlkLFxuXHRcdFx0XHRyZXNwb25zZTogU2Vzc2lvbklucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBldmVudHMgPSB0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cy5maWx0ZXIoZXZlbnQgPT4gZXZlbnQuZXZlbnROYW1lID09PSAnYXNrUXVlc3Rpb25zVG9vbEludm9rZWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChldmVudCA9PiAoZXZlbnQuZGF0YSBhcyBJQWdlbnRIb3N0QXNrUXVlc3Rpb25zVG9vbEludm9rZWRFdmVudCkucmVxdWVzdElkKSwgWyd0dXJuLTInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjaGF0IGlucHV0IHJlcXVlc3Qgd2l0aG91dCBhbiBhY3RpdmUgdHVybiBpcyBub3QgbWlycm9yZWQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0XHRyZXF1ZXN0OiB7IGlkOiAncmVxLTEnLCBxdWVzdGlvbnM6IFtdIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uSW5wdXROZWVkZWQoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9vbCBjb25maXJtYXRpb24gaXMgcHJvZHVjZWQgd2hpbGUgcGVuZGluZyBhbmQgcmVtb3ZlZCBvbmNlIGNvbmZpcm1lZCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLCBjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHBlbmRpbmcgPSBzZXNzaW9uSW5wdXROZWVkZWQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBlbmRpbmcubWFwKHIgPT4gKHsga2luZDogci5raW5kLCBjaGF0OiByLmNoYXQsIHRvb2xDYWxsSWQ6IHIua2luZCA9PT0gU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENvbmZpcm1hdGlvbiA/IHIudG9vbENhbGwudG9vbENhbGxJZCA6IHVuZGVmaW5lZCB9KSksXG5cdFx0XHRcdFt7IGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDb25maXJtYXRpb24sIGNoYXQ6IGRlZmF1bHRDaGF0VXJpLCB0b29sQ2FsbElkOiAndGMtMScgfV0sXG5cdFx0XHQpO1xuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgYXBwcm92ZWQ6IHRydWUsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25JbnB1dE5lZWRlZCgpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGllbnQgdG9vbCBleGVjdXRpb24gaXMgcHJvZHVjZWQgd2hpbGUgcnVubmluZyBhbmQgcmVtb3ZlZCBvbmNlIGNvbXBsZXRlJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNsaWVudCcsIHRvb2xOYW1lOiAndG9vbFNlYXJjaCcsIGRpc3BsYXlOYW1lOiAnU2VhcmNoIGZvciBUb29scycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtMScgfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1NlYXJjaGluZycsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJ1bm5pbmcgPSBzZXNzaW9uSW5wdXROZWVkZWQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJ1bm5pbmcubWFwKHIgPT4gKHsga2luZDogci5raW5kLCBjaGF0OiByLmNoYXQsIGNsaWVudElkOiByLmtpbmQgPT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24gPyByLmNsaWVudElkIDogdW5kZWZpbmVkIH0pKSxcblx0XHRcdFx0W3sga2luZDogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENsaWVudEV4ZWN1dGlvbiwgY2hhdDogZGVmYXVsdENoYXRVcmksIGNsaWVudElkOiAnY2xpZW50LTEnIH1dLFxuXHRcdFx0KTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQnLCByZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ1NlYXJjaGVkJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbklucHV0TmVlZGVkKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dG8tYXBwcm92ZWQgdG9vbCBjYWxsIHN0aWxsIHN1cmZhY2VzIGl0cyBjbGllbnQgZXhlY3V0aW9uIHdpdGhvdXQgZmxhZ2dpbmcgaW5wdXQgbmVlZGVkJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHQvLyBBdXRvLWFwcHJvdmVkIGNhbGxzIGZsb3cgdGhyb3VnaCBQZW5kaW5nQ29uZmlybWF0aW9uIHRoZW4gUnVubmluZyBidXQgbmV2ZXIgYmxvY2sgdGhlIHVzZXIuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWF1dG8nLCB0b29sTmFtZTogJ2Jyb3dzZXJfbmF2aWdhdGUnLCBkaXNwbGF5TmFtZTogJ05hdmlnYXRlIEJyb3dzZXInLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHRcdF9tZXRhOiB7IGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYXV0bycsIGludm9jYXRpb25NZXNzYWdlOiAnTmF2aWdhdGUnLCBjb25maXJtYXRpb25UaXRsZTogJ05hdmlnYXRlJyxcblx0XHRcdFx0X21ldGE6IHsgYXV0b0FwcHJvdmVCeVNldHRpbmc6IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uSW5wdXROZWVkZWQoKSwgW10sICdubyBjb25maXJtYXRpb24gZW50cnkgd2hpbGUgUGVuZGluZ0NvbmZpcm1hdGlvbicpO1xuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1hdXRvJywgYXBwcm92ZWQ6IHRydWUsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uU2V0dGluZyxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGUgY2xpZW50IHN0aWxsIGhhcyB0byBydW4gdGhlIGNhbGwsIHNvIGl0IG11c3QgYmUgZGlzY292ZXJhYmxlXG5cdFx0XHQvLyBmcm9tIHRoZSBzZXNzaW9uIGNoYW5uZWwgXHUyMDE0IGJ1dCBpdCBpcyBub3QgYSB1c2VyIHByb21wdCwgc28gdGhlXG5cdFx0XHQvLyBzZXNzaW9uIG11c3Qgbm90IHByZXNlbnQgYXMgXCJpbnB1dCBuZWVkZWRcIi5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlc3Npb25JbnB1dE5lZWRlZCgpLm1hcChyID0+ICh7IGtpbmQ6IHIua2luZCwgY2xpZW50SWQ6IHIua2luZCA9PT0gU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENsaWVudEV4ZWN1dGlvbiA/IHIuY2xpZW50SWQgOiB1bmRlZmluZWQgfSkpLFxuXHRcdFx0XHRbeyBraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ2xpZW50RXhlY3V0aW9uLCBjbGllbnRJZDogJ2NsaWVudC0xJyB9XSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvblN0YXR1cygpLCBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsICdhdXRvLWFwcHJvdmVkIGNsaWVudCBleGVjdXRpb24gbXVzdCBub3QgcHJlc2VudCBhcyBpbnB1dCBuZWVkZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dG8tYXBwcm92ZWQgdG9vbCBzdGlsbCBzdXJmYWNlcyBhIGdlbnVpbmUgcmVzdWx0IGNvbmZpcm1hdGlvbicsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0Ly8gVGhlIGF1dG8tYXBwcm92ZWQgcGFyYW1ldGVyIGdhdGUgaXMgc3VwcHJlc3NlZCwgYnV0IGEgcG9zdC1leGVjdXRpb24gcmVzdWx0IGdhdGUgaXMgYSBnZW51aW5lIHByb21wdC5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYXV0by1yZXN1bHQnLCB0b29sTmFtZTogJ2Jyb3dzZXJfbmF2aWdhdGUnLCBkaXNwbGF5TmFtZTogJ05hdmlnYXRlIEJyb3dzZXInLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHRcdF9tZXRhOiB7IGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYXV0by1yZXN1bHQnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ05hdmlnYXRlJywgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYXV0by1yZXN1bHQnLCByZXF1aXJlc1Jlc3VsdENvbmZpcm1hdGlvbjogdHJ1ZSxcblx0XHRcdFx0cmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdOYXZpZ2F0ZWQnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c2Vzc2lvbklucHV0TmVlZGVkKCkubWFwKHIgPT4gKHsga2luZDogci5raW5kLCB0b29sQ2FsbElkOiByLmtpbmQgPT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDb25maXJtYXRpb24gPyByLnRvb2xDYWxsLnRvb2xDYWxsSWQgOiB1bmRlZmluZWQgfSkpLFxuXHRcdFx0XHRbeyBraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ29uZmlybWF0aW9uLCB0b29sQ2FsbElkOiAndGMtYXV0by1yZXN1bHQnIH1dLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ01DUCB0b29sIGF1dGhlbnRpY2F0aW9uIGlzIHByb2R1Y2VkIHdoaWxlIGF1dGggaXMgcmVxdWlyZWQgYW5kIHJlbW92ZWQgb25jZSByZXNvbHZlZCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tY3AnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2dldF9maWxlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdHZXQgRmlsZScsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkOiAnbWNwLTEnIH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWNwJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdHZXR0aW5nIGZpbGUnLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQXV0aFJlcXVpcmVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWNwJyxcblx0XHRcdFx0YXV0aDoge1xuXHRcdFx0XHRcdHJlYXNvbjogTWNwQXV0aFJlcXVpcmVkUmVhc29uLkluc3VmZmljaWVudFNjb3BlLFxuXHRcdFx0XHRcdHJlc291cmNlOiB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlcXVpcmVkU2NvcGVzOiBbJ3JlcG8nXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwZW5kaW5nID0gc2Vzc2lvbklucHV0TmVlZGVkKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW1jcCcsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdDYW5jZWxsZWQgdG9vbCBjYWxsJyxcblx0XHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiAnTUNQIGF1dGhlbnRpY2F0aW9uIHdhcyBjYW5jZWxsZWQnLCBjb2RlOiAnY2FuY2VsbGVkJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwZW5kaW5nOiBwZW5kaW5nLm1hcChyZXF1ZXN0ID0+ICh7XG5cdFx0XHRcdFx0a2luZDogcmVxdWVzdC5raW5kLFxuXHRcdFx0XHRcdGNoYXQ6IHJlcXVlc3QuY2hhdCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiByZXF1ZXN0LmtpbmQgPT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xBdXRoZW50aWNhdGlvbiA/IHJlcXVlc3QudG9vbENhbGwudG9vbENhbGxJZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRyZXNvbHZlZDogc2Vzc2lvbklucHV0TmVlZGVkKCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHBlbmRpbmc6IFt7XG5cdFx0XHRcdFx0a2luZDogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbEF1dGhlbnRpY2F0aW9uLFxuXHRcdFx0XHRcdGNoYXQ6IGRlZmF1bHRDaGF0VXJpLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tY3AnLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0cmVzb2x2ZWQ6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbmRpbmcgdGhlIHR1cm4gY2xlYXJzIHRoZSBjaGF0XFwncyBvdXRzdGFuZGluZyByZXF1ZXN0cycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0XHRyZXF1ZXN0OiB7IGlkOiAncmVxLTEnLCBxdWVzdGlvbnM6IFtdIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uSW5wdXROZWVkZWQoKS5sZW5ndGgsIDEpO1xuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbklucHV0TmVlZGVkKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgYmxvY2tlciBpbnNpZGUgYSBzdWJhZ2VudCBpcyBwcm9kdWNlZCBhZ2FpbnN0IHRoZSBzdWJhZ2VudCBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtcGFyZW50JywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdEZWxlZ2F0ZSBUYXNrJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJyB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtaW5uZXInLCB0b29sTmFtZTogJ3dyaXRlJywgZGlzcGxheU5hbWU6ICdXcml0ZScgfSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1pbm5lcicsIGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgZmlsZScsIGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgZmlsZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdWJhZ2VudFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLXBhcmVudCcpO1xuXHRcdFx0Y29uc3QgcHJvZHVjZWQgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gc2Vzc2lvbklucHV0TmVlZGVkKCkuZmluZChyID0+IHIua2luZCA9PT0gU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENvbmZpcm1hdGlvbik7XG5cdFx0XHRcdHJldHVybiBlbnRyeT8ua2luZCA9PT0gU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENvbmZpcm1hdGlvbiA/IGVudHJ5IDogdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjaGF0OiBwcm9kdWNlZC5jaGF0LCB0b29sQ2FsbElkOiBwcm9kdWNlZC50b29sQ2FsbC50b29sQ2FsbElkIH0sIHsgY2hhdDogc3ViYWdlbnRVcmksIHRvb2xDYWxsSWQ6ICd0Yy1pbm5lcicgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbiBwZXJtaXNzaW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnc2Vzc2lvbiBwZXJtaXNzaW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Rvb2xfcmVhZHkgYWN0aW9uIGluY2x1ZGVzIGNvbmZpcm1hdGlvbiBvcHRpb25zIHdoZW4gY29uZmlybWF0aW9uIGlzIG5lZWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZXJtLTEnLCB0b29sTmFtZTogJ0N1c3RvbVRvb2wnLCBkaXNwbGF5TmFtZTogJ0N1c3RvbSBUb29sJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVybS0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGN1c3RvbSB0b29sJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBlcm0tMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIGN1c3RvbSB0b29sJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gY3VzdG9tIHRvb2wnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJywgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcyA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3QgZm91bmQgPSBzPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtcGVybS0xJ1xuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gZm91bmQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgZm91bmQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uID8gcyA6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdGMgPSBzdGF0ZSEuYWN0aXZlVHVybiEucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1wZXJtLTEnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRjICYmIHRjLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsICd0b29sIGNhbGwgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGMudG9vbENhbGwuc3RhdHVzLCBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uKTtcblx0XHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHRjLnRvb2xDYWxsLm9wdGlvbnMpLCAnb3B0aW9ucyBzaG91bGQgYmUgYW4gYXJyYXknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGMudG9vbENhbGwub3B0aW9ucyEubWFwKG8gPT4gby5pZCksIFsnYWxsb3ctc2Vzc2lvbicsICdhbGxvdy1vbmNlJywgJ3NraXAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDaGF0VG9vbENhbGxDb25maXJtZWQgd2l0aCBhbGxvdy1zZXNzaW9uIGFkZHMgdG9vbCB0byBzZXNzaW9uIHBlcm1pc3Npb25zJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0XHR2YWx1ZXM6IHt9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScsIGRlZmF1bHRDaGF0VXJpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZXJtLTInLCB0b29sTmFtZTogJ0N1c3RvbVRvb2wnLCBkaXNwbGF5TmFtZTogJ0N1c3RvbSBUb29sJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVybS0yJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGN1c3RvbSB0b29sJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBlcm0tMicsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIGN1c3RvbSB0b29sJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gY3VzdG9tIHRvb2wnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJywgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZXJtLTInLFxuXHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0Y29uZmlybWVkOiAndXNlci1hY3Rpb24nIGFzIGNvbnN0LFxuXHRcdFx0XHRzZWxlY3RlZE9wdGlvbklkOiAnYWxsb3ctc2Vzc2lvbicsXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVkU3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR1cGRhdGVkU3RhdGUhLmNvbmZpZyEudmFsdWVzLnBlcm1pc3Npb25zLFxuXHRcdFx0XHR7IGFsbG93OiBbJ0N1c3RvbVRvb2wnXSwgZGVueTogW10gfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJzZXF1ZW50IHRvb2xfcmVhZHkgZm9yIHNhbWUgdG9vbCBpcyBhdXRvLWFwcHJvdmVkIGFmdGVyIGFsbG93LXNlc3Npb24gcGVybWlzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25Db25maWcoc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdFx0dmFsdWVzOiB7IHBlcm1pc3Npb25zOiB7IGFsbG93OiBbJ0N1c3RvbVRvb2wnXSwgZGVueTogW10gfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBlcm0tMycsIHRvb2xOYW1lOiAnQ3VzdG9tVG9vbCcsIGRpc3BsYXlOYW1lOiAnQ3VzdG9tIFRvb2wnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZXJtLTMnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgY3VzdG9tIHRvb2wnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVybS0zJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gY3VzdG9tIHRvb2wnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBjdXN0b20gdG9vbCcsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnY3VzdG9tLXRvb2wnLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGggPiAwIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW1xuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3RjLXBlcm0tMycsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hbmFnZWQgYXBwcm92YWwgYnlwYXNzZXMgZ2xvYmFsLCBzZXNzaW9uLCBhbmQgcGVyLXRvb2wgYXV0by1hcHByb3ZhbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0XHR2YWx1ZXM6IHtcblx0XHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdhdXRvQXBwcm92ZScsXG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdOiB7IGFsbG93OiBbJ0N1c3RvbVRvb2wnXSwgZGVueTogW10gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tYW5hZ2VkJywgdG9vbE5hbWU6ICdDdXN0b21Ub29sJywgZGlzcGxheU5hbWU6ICdDdXN0b20gVG9vbCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tYW5hZ2VkJywgdG9vbE5hbWU6ICdDdXN0b21Ub29sJywgZGlzcGxheU5hbWU6ICdDdXN0b20gVG9vbCcsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gbWFuYWdlZCBjdXN0b20gdG9vbCcsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIG1hbmFnZWQgY3VzdG9tIHRvb2wnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJyxcblx0XHRcdFx0bWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQ6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdG9vbENhbGwgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0XHRyZXNwb25zZVBhcnQgPT4gcmVzcG9uc2VQYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcmVzcG9uc2VQYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1tYW5hZ2VkJ1xuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gcGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvblxuXHRcdFx0XHRcdD8gcGFydC50b29sQ2FsbFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0dXM6IHRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdFx0b3B0aW9uczogdG9vbENhbGwub3B0aW9ucz8ubWFwKG9wdGlvbiA9PiBvcHRpb24uaWQpLFxuXHRcdFx0XHRyZXNwb25zZXM6IGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRvcHRpb25zOiBbJ2FsbG93LW9uY2UnLCAnc2tpcCddLFxuXHRcdFx0XHRyZXNwb25zZXM6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYW5hZ2VkIGFwcHJvdmFsIGRvZXMgbm90IHBlcnNpc3QgYWxsb3ctc2Vzc2lvbiBmcm9tIHRoZSBjbGllbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRcdHZhbHVlczogeyBwZXJtaXNzaW9uczogeyBhbGxvdzogWydFeGlzdGluZ1Rvb2wnXSwgZGVueTogW10gfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW1hbmFnZWQnLCB0b29sTmFtZTogJ01hbmFnZWRUb29sJywgZGlzcGxheU5hbWU6ICdNYW5hZ2VkIFRvb2wnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWFuYWdlZCcsIHRvb2xOYW1lOiAnTWFuYWdlZFRvb2wnLCBkaXNwbGF5TmFtZTogJ01hbmFnZWQgVG9vbCcsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gbWFuYWdlZCB0b29sJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gbWFuYWdlZCB0b29sJywgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsXG5cdFx0XHRcdG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRcdHJlc3BvbnNlUGFydCA9PiByZXNwb25zZVBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiByZXNwb25zZVBhcnQudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLW1hbmFnZWQnXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHJldHVybiBwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uO1xuXHRcdFx0fSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tYW5hZ2VkJyxcblx0XHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdGNvbmZpcm1lZDogJ3VzZXItYWN0aW9uJyxcblx0XHRcdFx0c2VsZWN0ZWRPcHRpb25JZDogJ2FsbG93LXNlc3Npb24nLFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICd0Yy1tYW5hZ2VkJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5jb25maWc/LnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXSxcblx0XHRcdFx0eyBhbGxvdzogWydFeGlzdGluZ1Rvb2wnXSwgZGVueTogW10gfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJhZ2VudCB0b29sIGNhbGxzIGluaGVyaXQgcGFyZW50IHNlc3Npb24gcGVybWlzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRcdHZhbHVlczogeyBwZXJtaXNzaW9uczogeyBhbGxvdzogWydDdXN0b21Ub29sJ10sIGRlbnk6IFtdIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0YWdlbnROYW1lOiAnaGVscGVyJyxcblx0XHRcdFx0YWdlbnREaXNwbGF5TmFtZTogJ0hlbHBlcicsXG5cdFx0XHRcdGFnZW50RGVzY3JpcHRpb246ICdIZWxwcycsXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItcGVybS0xJywgdG9vbE5hbWU6ICdDdXN0b21Ub29sJywgZGlzcGxheU5hbWU6ICdDdXN0b20gVG9vbCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci1wZXJtLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgY3VzdG9tIHRvb2wnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItcGVybS0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gY3VzdG9tIHRvb2wnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBjdXN0b20gdG9vbCcsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnY3VzdG9tLXRvb2wnLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGggPiAwIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW1xuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ2lubmVyLXBlcm0tMScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBGb3J3YXJkaW5nIGludG8gSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2NoYW5nZXNldCBmb3J3YXJkZXJzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3RhbGUgdG9vbCBjb21wbGV0aW9uIGRvZXMgbm90IGF0dHJpYnV0ZSBlZGl0cyB0byB0aGUgYWN0aXZlIHR1cm4nLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0yJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMTowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnY29udGludWUnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlc2V0cyA9IG5ldyBGYWtlQ2hhbmdlc2V0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgY2hhbmdlc2V0cyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobG9jYWxTaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdzdGFsZS10b29sJyxcblx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnV3JvdGUgZmlsZScsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJyB9IH0sXG5cdFx0XHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0b29sQ2FsbEVkaXRzOiBjaGFuZ2VzZXRzLnRvb2xDYWxsRWRpdHMsXG5cdFx0XHRcdGFjdGl2ZVR1cm5JZDogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShkZWZhdWx0Q2hhdFVyaSk/LmFjdGl2ZVR1cm4/LmlkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0b29sQ2FsbEVkaXRzOiBbXSxcblx0XHRcdFx0YWN0aXZlVHVybklkOiAndHVybi0yJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncG9zdC10b29sQ2FsbENvbXBsZXRlIGVkaXRzIGZpcmUgb25Ub29sQ2FsbEVkaXRzQXBwbGllZCBvbmNlJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRzID0gbmV3IEZha2VDaGFuZ2VzZXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCksXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LCB1bmRlZmluZWQsIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBjaGFuZ2VzZXRzKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsb2NhbFNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyB0b29sX3N0YXJ0ICsgdG9vbF9yZWFkeSArIHRvb2xfY29tcGxldGUgd2l0aCBhIHJlY29yZGVkIGZpbGUgZWRpdC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZWRpdC0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1lZGl0LTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1lZGl0LTEnLFxuXHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICd3cm90ZScsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJyB9IH0sXG5cdFx0XHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlc2V0cy50b29sQ2FsbEVkaXRzLCBbeyBzZXNzaW9uOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHR1cm5JZDogJ3R1cm4tMScgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHVybiBjb21wbGV0ZSBmaXJlcyBvblR1cm5Db21wbGV0ZSBvbmNlIHdpdGggdGhlIHJpZ2h0IHR1cm4gaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdGNvbnN0IGNoYW5nZXNldHMgPSBuZXcgRmFrZUNoYW5nZXNldFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGxvY2FsU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGNoYW5nZXNldHMpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxvY2FsU2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBgX3J1blR1cm5Db21wbGV0ZVNpZGVFZmZlY3RzYCBub3cgZGVmZXJzIHRoZVxuXHRcdFx0Ly8gYGNoYW5nZXNldHMub25UdXJuQ29tcGxldGVgIGNhbGwgYmVoaW5kIHRoZSBjaGVja3BvaW50IGNhcHR1cmVcblx0XHRcdC8vIHByb21pc2UgKGBjYXB0dXJlVHVybkNoZWNrcG9pbnQoLi4uKS50aGVuKC4uLilgKS4gWWllbGQgYVxuXHRcdFx0Ly8gbWljcm90YXNrIHNvIHRoZSByZXNvbHZlZCBwcm9taXNlJ3MgYC50aGVuYCBjb250aW51YXRpb25cblx0XHRcdC8vIHJ1bnMgYmVmb3JlIHdlIGFzc2VydC5cblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXNldHMudHVybkNvbXBsZXRlcywgW3sgc2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLCB0dXJuSWQ6ICd0dXJuLTEnIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3R1cm4gY29tcGxldGUgcGFzc2VzIHRoZSByZXNvbHZlZCB3b3JraW5nIGRpcmVjdG9yaWVzIHRvIHRoZSBjaGVja3BvaW50IGNhcHR1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLmZpbGUoJy93ZCcpLnRvU3RyaW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24od29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBjYXB0dXJlczogeyB0dXJuSWQ6IHN0cmluZzsgd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRcdGNvbnN0IGNoZWNrcG9pbnRzOiBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgPSB7XG5cdFx0XHRcdC4uLk5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0XHRjYXB0dXJlVHVybkNoZWNrcG9pbnQ6IGFzeW5jIChfc2Vzc2lvbiwgX2NoYXQsIHR1cm5JZCwgd29ya2luZ0RpcmVjdG9yaWVzKSA9PiB7XG5cdFx0XHRcdFx0Y2FwdHVyZXMucHVzaCh7IHR1cm5JZCwgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3JpZXM/Lm1hcCh3ID0+IHcudG9TdHJpbmcoKSkgfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgbmV3IEZha2VDaGFuZ2VzZXRTZXJ2aWNlKCksIHVuZGVmaW5lZCwgY2hlY2twb2ludHMpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxvY2FsU2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FwdHVyZXMsIFt7IHR1cm5JZDogJ3R1cm4tMScsIHdvcmtpbmdEaXJlY3RvcmllczogW3dvcmtpbmdEaXJlY3RvcnldIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb3ZpZGVyIGVycm9yIGtlZXBzIHRoZSB0dXJuIHN0YXJ0IHVudGlsIGNvbXBsZXRpb24gY2FwdHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IGNhcHR1cmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0bGV0IGRpc2NhcmRDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBjaGVja3BvaW50czogSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlID0ge1xuXHRcdFx0XHQuLi5OVUxMX0NIRUNLUE9JTlRfU0VSVklDRSxcblx0XHRcdFx0Y2FwdHVyZVR1cm5DaGVja3BvaW50OiBhc3luYyAoKSA9PiB7IGNhcHR1cmVkLmNvbXBsZXRlKCk7IH0sXG5cdFx0XHRcdGRpc2NhcmRUdXJuU3RhcnRDaGVja3BvaW50OiBhc3luYyAoKSA9PiB7IGRpc2NhcmRDb3VudCsrOyB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIG5ldyBGYWtlQ2hhbmdlc2V0U2VydmljZSgpLCB1bmRlZmluZWQsIGNoZWNrcG9pbnRzKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsb2NhbFNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvciwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMCwgZXJyb3I6IHsgZXJyb3JUeXBlOiAndGVzdCcsIG1lc3NhZ2U6ICdmYWlsZWQnIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwIH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGNhcHR1cmVkLnA7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjYXJkQ291bnQsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGVybWluYWwgcHJvdmlkZXIgZXJyb3IgY2FwdHVyZXMgdGhlIGVuZCBjaGVja3BvaW50IHdpdGhvdXQgY29tcGxldGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IGNhcHR1cmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgY2hlY2twb2ludHM6IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSA9IHtcblx0XHRcdFx0Li4uTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsXG5cdFx0XHRcdGNhcHR1cmVUdXJuQ2hlY2twb2ludDogYXN5bmMgKCkgPT4geyBjYXB0dXJlZC5jb21wbGV0ZSgpOyB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIG5ldyBGYWtlQ2hhbmdlc2V0U2VydmljZSgpLCB1bmRlZmluZWQsIGNoZWNrcG9pbnRzKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsb2NhbFNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvciwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMCwgZXJyb3I6IHsgZXJyb3JUeXBlOiAndGVybWluYWwnLCBtZXNzYWdlOiAnZmFpbGVkJyB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgY2FwdHVyZWQucDtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NoYXQgdHJ1bmNhdGlvbiBkaXNjYXJkcyBwZW5kaW5nIHR1cm4gc3RhcnRzIGZvciB0aGF0IGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGRpc2NhcmRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IGNoZWNrcG9pbnRzOiBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgPSB7XG5cdFx0XHRcdC4uLk5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0XHRkaXNjYXJkQ2hhdFR1cm5TdGFydENoZWNrcG9pbnRzOiBhc3luYyAoc2Vzc2lvbiwgY2hhdCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZXNzaW9uOiBzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IGNoYXQudG9TdHJpbmcoKSB9LCB7XG5cdFx0XHRcdFx0XHRzZXNzaW9uOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRjaGF0OiBkZWZhdWx0Q2hhdFVyaSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRkaXNjYXJkZWQuY29tcGxldGUoKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2NhbFNpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCksXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LCB1bmRlZmluZWQsIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBuZXcgRmFrZUNoYW5nZXNldFNlcnZpY2UoKSwgdW5kZWZpbmVkLCBjaGVja3BvaW50cyk7XG5cblx0XHRcdGxvY2FsU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCxcblx0XHRcdFx0dHVybklkOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGRpc2NhcmRlZC5wO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2hhdFRydW5jYXRlZCBmaXJlcyBvblNlc3Npb25UcnVuY2F0ZWQgb25jZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRzID0gbmV3IEZha2VDaGFuZ2VzZXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCksXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LCB1bmRlZmluZWQsIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBjaGFuZ2VzZXRzKTtcblxuXHRcdFx0bG9jYWxTaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlc2V0cy50cnVuY2F0ZXMsIFtzZXNzaW9uVXJpLnRvU3RyaW5nKCldKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydW5jYXRpbmcgYSBjaGF0IGZvcndhcmRzIHRoYXQgY2hhdCB0byB0aGUgYWdlbnQgKGRlZmF1bHQgYW5kIHBlZXIpJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICdwZWVyLTEnKTtcblxuXHRcdFx0Ly8gUGVlciBjaGF0OiB0aGUgY2hhdCBVUkkgaXMgZm9yd2FyZGVkIHNvIHRoZSBhZ2VudCB0YXJnZXRzIHRoYXRcblx0XHRcdC8vIGNoYXQncyBvd24gYmFja2luZyByYXRoZXIgdGhhbiB0aGUgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdC5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihwZWVyQ2hhdFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUcnVuY2F0ZWQsIHR1cm5JZDogJ3R1cm4tcGVlcicgfSk7XG5cdFx0XHRjb25zdCBwZWVyQ2FsbCA9IGFnZW50LnRydW5jYXRlQ2hhdENhbGxzLmF0KC0xKTtcblxuXHRcdFx0Ly8gRGVmYXVsdCBjaGF0OiBmb3J3YXJkZWQgYXMgdGhlIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQgVVJJLlxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCwgdHVybklkOiAndHVybi1kZWZhdWx0JyB9KTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDYWxsID0gYWdlbnQudHJ1bmNhdGVDaGF0Q2FsbHMuYXQoLTEpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cGVlclR1cm5JZDogcGVlckNhbGw/LnR1cm5JZCxcblx0XHRcdFx0cGVlckNoYXQ6IHBlZXJDYWxsPy5jaGF0LnRvU3RyaW5nKCksXG5cdFx0XHRcdGRlZmF1bHRUdXJuSWQ6IGRlZmF1bHRDYWxsPy50dXJuSWQsXG5cdFx0XHRcdGRlZmF1bHRDaGF0OiBkZWZhdWx0Q2FsbD8uY2hhdC50b1N0cmluZygpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwZWVyVHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0cGVlckNoYXQ6IHBlZXJDaGF0VXJpLFxuXHRcdFx0XHRkZWZhdWx0VHVybklkOiAndHVybi1kZWZhdWx0Jyxcblx0XHRcdFx0ZGVmYXVsdENoYXQ6IGRlZmF1bHRDaGF0VXJpLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLGNBQW1DLDJCQUEyQiwwQkFBa0Q7QUFDekgsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBeUIsZ0JBQWdCLDZCQUE2QixtQkFBbUIsdUJBQXVCLGlCQUFpQiwrQkFBK0I7QUFDaEssU0FBUyxZQUE0QiwwQkFBbUY7QUFDeEgsU0FBUyxzQkFBc0IsY0FBYyxxQkFBcUIsc0JBQXNCLDBCQUEw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QUM7QUFFRCxTQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLG1CQUFhO0FBQ2IsWUFBTSxjQUFjLGFBQWEsV0FBVyxTQUFTLEdBQUcsUUFBUTtBQUloRSxrQkFBWSxhQUFhLGFBQWEsRUFBRSxNQUFNLFdBQVcsZUFBZSxRQUFRLFlBQVksQ0FBQztBQUM3RixZQUFNLFdBQVcsTUFBTSxrQkFBa0IsR0FBRyxFQUFFO0FBRzlDLGtCQUFZLGFBQWEsZ0JBQWdCLEVBQUUsTUFBTSxXQUFXLGVBQWUsUUFBUSxlQUFlLENBQUM7QUFDbkcsWUFBTSxjQUFjLE1BQU0sa0JBQWtCLEdBQUcsRUFBRTtBQUVqRCxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFlBQVksVUFBVTtBQUFBLFFBQ3RCLFVBQVUsVUFBVSxLQUFLLFNBQVM7QUFBQSxRQUNsQyxlQUFlLGFBQWE7QUFBQSxRQUM1QixhQUFhLGFBQWEsS0FBSyxTQUFTO0FBQUEsTUFDekMsR0FBRztBQUFBLFFBQ0YsWUFBWTtBQUFBLFFBQ1osVUFBVTtBQUFBLFFBQ1YsZUFBZTtBQUFBLFFBQ2YsYUFBYTtBQUFBLE1BQ2QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVGLENBQUM7IiwKICAibmFtZXMiOiBbImVudmVsb3BlIiwgImFjdGlvbiIsICJwYXJ0IiwgImV2ZW50Il0KfQo=
