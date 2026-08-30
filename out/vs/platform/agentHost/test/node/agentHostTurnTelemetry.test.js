import assert from "assert";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { TelemetryTrustedValue } from "../../../telemetry/common/telemetryUtils.js";
import { createAgentModelByokMeta } from "../../common/agentModelByokMeta.js";
import { getTelemetryChatSessionId } from "../../common/agentTelemetryCorrelation.js";
import { AgentSession } from "../../common/agent.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from "../../common/agentHostTelemetry.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildDefaultChatUri, buildSubagentChatUri, MessageKind, PendingMessageKind, ResponsePartKind, SessionStatus } from "../../common/state/sessionState.js";
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from "../../common/agentHostCheckpointService.js";
import { IAgentHostTerminalManager } from "../../node/agentHostTerminalManager.js";
import { AgentHostLocalTurns } from "../../node/agentHostLocalTurns.js";
import { AgentHostTelemetryService } from "../../node/agentHostTelemetryService.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { IAgentHostChangesetService } from "../../common/agentHostChangesetService.js";
import { AgentSideEffects } from "../../node/agentSideEffects.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { createNullSessionDataService } from "../common/sessionTestHelpers.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { MockAgent } from "./mockAgent.js";
import { TestAgentHostTerminalManager } from "./testAgentHostTerminalManager.js";
class FakeChangesetService {
  registerStaticChangesets() {
  }
  restoreStaticChangeset() {
  }
  parsePersistedStaticChangesets() {
    return {};
  }
  applyPersistedStaticChangesets() {
  }
  restorePersistedStaticChangesets() {
    return {};
  }
  persistChangesSummary() {
  }
  isStaticChangesetComputeActive() {
    return false;
  }
  getListMetadataKeys() {
    return void 0;
  }
  computeListEntryChanges() {
    return void 0;
  }
  refreshChangesetCatalog() {
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
    return `${session}/x`;
  }
  async computeCompareTurnsChangeset(session) {
    return `${session}/y`;
  }
  onToolCallEditsApplied() {
  }
  onTurnComplete() {
  }
  onSessionTruncated() {
  }
}
class CapturingTelemetryService {
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
  publicLogError2(eventName, data) {
    this.events.push({ eventName, data });
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite("AgentSideEffects \u2014 turn tracker telemetry", () => {
  const disposables = new DisposableStore();
  let stateManager;
  let agent;
  let sideEffects;
  let telemetry;
  const sessionUri = AgentSession.uri("mock", "session-1");
  const sessionKey = sessionUri.toString();
  const defaultChatUri = buildDefaultChatUri(sessionUri);
  function setupSession(ready = true, workingDirectories) {
    stateManager.createSession({
      resource: sessionKey,
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...workingDirectories ? { workingDirectories } : {}
    });
    if (ready) {
      stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
    }
  }
  function setSessionConfig(values) {
    stateManager.setSessionConfig(sessionKey, {
      schema: {
        type: "object",
        properties: {
          [SessionConfigKey.AutoApprove]: { type: "string", title: "Approvals", enum: ["default", "autoApprove", "autopilot"], default: "default" },
          [SessionConfigKey.Mode]: { type: "string", title: "Mode", enum: ["interactive", "plan", "autopilot"], default: "interactive" }
        }
      },
      values: {
        ...values.autoApprove === void 0 ? {} : { [SessionConfigKey.AutoApprove]: values.autoApprove },
        ...values.mode === void 0 ? {} : { [SessionConfigKey.Mode]: values.mode }
      }
    });
  }
  function startTurn(turnId, text = "hello", modelId, chatUri = defaultChatUri, clientContext) {
    const action = {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text, origin: { kind: MessageKind.User }, model: modelId ? { id: modelId } : void 0 }
    };
    stateManager.dispatchClientAction(chatUri, action, { clientId: "test", clientSeq: 1 });
    sideEffects.handleAction(chatUri, action, "test", clientContext);
  }
  function fire(action, chatUri = defaultChatUri) {
    agent.fireProgress({ kind: "action", resource: URI.parse(chatUri), action });
  }
  function completedEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.turnCompleted");
  }
  function capturedModel(data) {
    const model = data.model;
    return model instanceof TelemetryTrustedValue ? { trusted: true, value: model.value } : { trusted: false, value: model };
  }
  function failedEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.turnFailed");
  }
  setup(() => {
    agent = new MockAgent();
    disposables.add(toDisposable(() => agent.dispose()));
    stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const agentList = observableValue("agents", [agent]);
    telemetry = new CapturingTelemetryService();
    const logService = new NullLogService();
    const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const telemetryService = disposables.add(new AgentHostTelemetryService(telemetry));
    const sessionDataService = createNullSessionDataService();
    const customizationEnablementService = {
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
    const instantiationService = disposables.add(new InstantiationService(
      new ServiceCollection(
        [ILogService, logService],
        [IAgentConfigurationService, configService],
        [IAgentHostChangesetService, new FakeChangesetService()],
        [IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
        [ITelemetryService, telemetryService],
        [IAgentHostTerminalManager, disposables.add(new TestAgentHostTerminalManager())],
        [ISessionDataService, sessionDataService]
      ),
      /*strict*/
      true
    ));
    sideEffects = disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, customizationEnablementService, {
      getAgent: () => agent,
      agents: agentList,
      sessionDataService,
      localTurns: new AgentHostLocalTurns(sessionDataService, logService),
      onTurnComplete: () => {
      }
    }));
    disposables.add(sideEffects.registerProgressListener(agent));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("emits turnCompleted with timing and turn-start context on success", () => {
    setupSession();
    agent.setModels([{ provider: "mock", id: "gpt-5.5", name: "GPT 5.5", supportsVision: false }]);
    setSessionConfig({ autoApprove: "autopilot", mode: "interactive" });
    startTurn("turn-1", "hello", "gpt-5.5");
    fire({ type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "p1", content: "hi" } });
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    const data = events[0].data;
    assert.strictEqual(data.provider, "mock");
    assert.strictEqual(data.agentSessionId, "session-1");
    assert.strictEqual(data.chatSessionId, getTelemetryChatSessionId(defaultChatUri));
    assert.strictEqual(data.turnId, "turn-1");
    assert.strictEqual(data.result, "success");
    assert.deepStrictEqual(capturedModel(data), { trusted: true, value: "gpt-5.5" });
    assert.strictEqual(data.modelSelectionKind, "explicit");
    assert.strictEqual(data.permissionLevel, "autopilot");
    assert.strictEqual(data.isSubagentSession, false);
    assert.strictEqual(data.isBYOK, false);
    assert.strictEqual(data.interactionMode, "interactive");
    assert.strictEqual(typeof data.totalTime, "number");
    assert.strictEqual(typeof data.timeToFirstProgress, "number");
    assert.strictEqual(data.isMultiRoot, false);
    assert.strictEqual(data.folderCount, 0);
  });
  test("attributes completed and failed turns to the initiating client identity", () => {
    setupSession();
    const clientContext = {
      clientType: AgentHostClientType.EditorWindow,
      connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
      transportKind: AgentHostTransportKind.MessagePort,
      hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
      machineId: "client-machine-id",
      devDeviceId: "client-dev-device-id"
    };
    startTurn("t-client", "hello", void 0, defaultChatUri, clientContext);
    fire({ type: ActionType.ChatError, turnId: "t-client", duration: 100, error: { errorType: "providerFailed", message: "failed" } });
    assert.deepStrictEqual([completedEvents()[0], failedEvents()[0]].map((event) => {
      const data = event.data;
      return {
        eventName: event.eventName,
        initiatorClientType: data.initiatorClientType,
        initiatorConnectionKind: data.initiatorConnectionKind,
        initiatorTransportKind: data.initiatorTransportKind,
        hostLaunchKind: data.hostLaunchKind,
        initiatorMachineId: data.initiatorMachineId,
        initiatorDevDeviceId: data.initiatorDevDeviceId
      };
    }), [{
      eventName: "agentHost.turnCompleted",
      initiatorClientType: "editor_window",
      initiatorConnectionKind: "remote_extension_host",
      initiatorTransportKind: "message_port",
      hostLaunchKind: "vscode_main_process",
      initiatorMachineId: "client-machine-id",
      initiatorDevDeviceId: "client-dev-device-id"
    }, {
      eventName: "agentHost.turnFailed",
      initiatorClientType: "editor_window",
      initiatorConnectionKind: "remote_extension_host",
      initiatorTransportKind: "message_port",
      hostLaunchKind: "vscode_main_process",
      initiatorMachineId: "client-machine-id",
      initiatorDevDeviceId: "client-dev-device-id"
    }]);
  });
  test("emits turnCompleted with the multi-root working-directory shape", () => {
    setupSession(true, ["file:///work/app", "file:///work/api"]);
    startTurn("turn-mr", "hello");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-mr", duration: 1e3 });
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    const data = events[0].data;
    assert.strictEqual(data.isMultiRoot, true);
    assert.strictEqual(data.folderCount, 2);
  });
  test("uses generic model values for BYOK and unknown selections", () => {
    setupSession();
    agent.setModels([{
      provider: "mock",
      id: "openrouter/private-model",
      name: "Private Model",
      supportsVision: false,
      _meta: createAgentModelByokMeta("openrouter/private-model")
    }]);
    startTurn("turn-byok", "hello", "openrouter/private-model");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-byok", duration: 1e3 });
    startTurn("turn-unknown", "hello", "unadvertised/private-model");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-unknown", duration: 1e3 });
    assert.deepStrictEqual(completedEvents().map((event) => {
      const data = event.data;
      return { model: data.model, modelSelectionKind: data.modelSelectionKind, isBYOK: data.isBYOK };
    }), [
      { model: "byokModel", modelSelectionKind: "explicit", isBYOK: true },
      { model: "unknown", modelSelectionKind: "explicit", isBYOK: false }
    ]);
  });
  test("uses the resolved usage model while preserving Auto selection", () => {
    setupSession();
    agent.setModels([
      { provider: "mock", id: "auto", name: "Auto", supportsVision: false },
      { provider: "mock", id: "gpt-5.5", name: "GPT 5.5", supportsVision: false }
    ]);
    startTurn("turn-auto", "hello", "auto");
    fire({ type: ActionType.ChatUsage, turnId: "turn-auto", usage: { model: "gpt-5.5" } });
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-auto", duration: 1e3 });
    const data = completedEvents()[0].data;
    assert.deepStrictEqual({
      model: capturedModel(data),
      modelSelectionKind: data.modelSelectionKind
    }, {
      model: { trusted: true, value: "gpt-5.5" },
      modelSelectionKind: "auto"
    });
  });
  test("timeToFirstProgress is undefined when no visible progress arrives before completion", () => {
    setupSession();
    startTurn("turn-1");
    fire({ type: ActionType.ChatUsage, turnId: "turn-1", usage: { inputTokens: 1, outputTokens: 1 } });
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    const data = completedEvents()[0].data;
    assert.strictEqual(data.timeToFirstProgress, void 0);
  });
  test("emits result=cancelled on ChatTurnCancelled", () => {
    setupSession();
    startTurn("turn-1", "hello", "auto");
    fire({ type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
    const data = completedEvents()[0].data;
    assert.deepStrictEqual({
      model: capturedModel(data),
      result: data.result,
      modelSelectionKind: data.modelSelectionKind
    }, { model: { trusted: true, value: "auto" }, result: "cancelled", modelSelectionKind: "auto" });
  });
  test("emits result=error on ChatError", () => {
    setupSession();
    startTurn("turn-1");
    fire({ type: ActionType.ChatError, turnId: "turn-1", duration: 1e3, error: { errorType: "oops", message: "fail" } });
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data.result, "error");
    assert.strictEqual(events[0].data.errorType, "oops");
  });
  test("correlates turn failure with chat and provider request identifiers", () => {
    setupSession();
    startTurn("turn-1");
    fire({
      type: ActionType.ChatError,
      turnId: "turn-1",
      duration: 1e3,
      error: {
        errorType: "quota",
        message: "quota exceeded",
        _meta: {
          chatError: {
            fetchError: {
              requestId: "provider-request-id",
              serverRequestId: "service-request-id"
            }
          }
        }
      }
    });
    assert.deepStrictEqual(failedEvents().map((event) => {
      const data = event.data;
      return {
        agentSessionId: data.agentSessionId,
        chatSessionId: data.chatSessionId,
        isSubagentSession: data.isSubagentSession,
        turnId: data.turnId,
        providerCallId: data.providerCallId,
        serviceRequestId: data.serviceRequestId
      };
    }), [{
      agentSessionId: "session-1",
      chatSessionId: getTelemetryChatSessionId(defaultChatUri),
      isSubagentSession: false,
      turnId: "turn-1",
      providerCallId: "provider-request-id",
      serviceRequestId: "service-request-id"
    }]);
  });
  test("reports subagent completion and failure without collapsing the chat identity", () => {
    setupSession();
    const subagentChatUri = buildSubagentChatUri(sessionUri, "tool-call-1");
    stateManager.addChat(sessionKey, subagentChatUri);
    startTurn("subagent-complete", "hello", void 0, subagentChatUri);
    fire({ type: ActionType.ChatTurnComplete, turnId: "subagent-complete", duration: 1e3 }, subagentChatUri);
    startTurn("subagent-failed", "hello", void 0, subagentChatUri);
    fire({ type: ActionType.ChatError, turnId: "subagent-failed", duration: 1e3, error: { errorType: "oops", message: "fail" } }, subagentChatUri);
    assert.deepStrictEqual({
      completed: completedEvents().map((event) => {
        const data = event.data;
        return { turnId: data.turnId, agentSessionId: data.agentSessionId, chatSessionId: data.chatSessionId, isSubagentSession: data.isSubagentSession };
      }),
      failed: failedEvents().map((event) => {
        const data = event.data;
        return { turnId: data.turnId, agentSessionId: data.agentSessionId, chatSessionId: data.chatSessionId, isSubagentSession: data.isSubagentSession };
      })
    }, {
      completed: [
        { turnId: "subagent-complete", agentSessionId: "session-1", chatSessionId: getTelemetryChatSessionId(subagentChatUri), isSubagentSession: true },
        { turnId: "subagent-failed", agentSessionId: "session-1", chatSessionId: getTelemetryChatSessionId(subagentChatUri), isSubagentSession: true }
      ],
      failed: [
        { turnId: "subagent-failed", agentSessionId: "session-1", chatSessionId: getTelemetryChatSessionId(subagentChatUri), isSubagentSession: true }
      ]
    });
  });
  test("emits a single turnCompleted per turn even when followed by duplicate completions", () => {
    setupSession();
    startTurn("turn-1");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    assert.strictEqual(completedEvents().length, 1);
  });
  test("captures permissionLevel at turnStarted, not later mid-turn changes", () => {
    setupSession();
    setSessionConfig({ autoApprove: "default" });
    startTurn("turn-1");
    setSessionConfig({ autoApprove: "autopilot" });
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    const data = completedEvents()[0].data;
    assert.strictEqual(data.permissionLevel, "default");
  });
  test("reports all interaction modes", () => {
    setupSession();
    for (const mode of ["interactive", "plan", "autopilot"]) {
      setSessionConfig({ mode });
      startTurn(`turn-${mode}`);
      fire({ type: ActionType.ChatTurnComplete, turnId: `turn-${mode}`, duration: 1e3 });
    }
    assert.deepStrictEqual(completedEvents().map((event) => event.data.interactionMode), ["interactive", "plan", "autopilot"]);
  });
  test("captures interactionMode at turnStarted, not later mid-turn changes", () => {
    setupSession();
    setSessionConfig({ mode: "plan" });
    startTurn("turn-1");
    setSessionConfig({ mode: "autopilot" });
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    assert.strictEqual(completedEvents()[0].data.interactionMode, "plan");
  });
  test("model and permissionLevel are undefined when never set", () => {
    setupSession();
    startTurn("turn-1");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    const data = completedEvents()[0].data;
    assert.strictEqual(data.model, void 0);
    assert.strictEqual(data.modelSelectionKind, "default");
    assert.strictEqual(data.permissionLevel, void 0);
    assert.strictEqual(data.isBYOK, void 0);
    assert.strictEqual(data.interactionMode, void 0);
  });
  test("emits result=cancelled when the client cancels a turn (no agent progress signal)", async () => {
    setupSession();
    startTurn("turn-1");
    sideEffects.handleAction(defaultChatUri, {
      type: ActionType.ChatTurnCancelled,
      turnId: "turn-1",
      duration: 1e3
    });
    await new Promise((r) => setTimeout(r, 10));
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data.result, "cancelled");
  });
  test("emits result=error when a direct sendMessage rejects", async () => {
    setupSession();
    agent.sendMessage = async () => {
      throw new Error("boom");
    };
    startTurn("turn-1");
    await new Promise((r) => setTimeout(r, 10));
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data.result, "error");
    assert.strictEqual(events[0].data.errorType, "sendFailed");
    assert.deepStrictEqual(failedEvents().map((event) => {
      const data = event.data;
      return {
        failureStage: data.failureStage,
        errorType: data.errorType,
        errorName: data.errorName,
        msg: data.msg,
        hasStack: typeof data.callstack === "string"
      };
    }), [{
      failureStage: "sendMessage",
      errorType: "sendFailed",
      errorName: "Error",
      msg: "Error: boom",
      hasStack: true
    }]);
  });
  test("fails the turn when model selection rejects instead of sending with a stale model", async () => {
    setupSession(false);
    agent.changeModel = async () => {
      throw new Error("unknown model");
    };
    startTurn("turn-1", "hello", "missing-model");
    await new Promise((r) => setTimeout(r, 10));
    const completed = completedEvents()[0].data;
    const failed = failedEvents()[0].data;
    assert.deepStrictEqual({
      completed: { result: completed.result, errorType: completed.errorType, failureStage: completed.failureStage },
      failed: { errorType: failed.errorType, failureStage: failed.failureStage, msg: failed.msg },
      creationErrorType: stateManager.getSessionState(sessionKey)?.creationError?.errorType,
      sendMessageCalls: agent.sendMessageCalls.length
    }, {
      completed: { result: "error", errorType: "modelSelectionFailed", failureStage: "modelSelection" },
      failed: { errorType: "modelSelectionFailed", failureStage: "modelSelection", msg: "Error: unknown model" },
      creationErrorType: "modelSelectionFailed",
      sendMessageCalls: 0
    });
  });
  test("emits result=error when a queued sendMessage rejects", async () => {
    setupSession();
    agent.sendMessage = async () => {
      throw new Error("boom");
    };
    const setAction = {
      type: ActionType.ChatPendingMessageSet,
      kind: PendingMessageKind.Queued,
      id: "q-err",
      message: { text: "queued message", origin: { kind: MessageKind.User } }
    };
    stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
    sideEffects.handleAction(defaultChatUri, setAction);
    await new Promise((r) => setTimeout(r, 10));
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data.result, "error");
  });
  test("captures interactionMode for queued turns", () => {
    setupSession();
    setSessionConfig({ mode: "autopilot" });
    const setAction = {
      type: ActionType.ChatPendingMessageSet,
      kind: PendingMessageKind.Queued,
      id: "q-mode",
      message: { text: "queued message", origin: { kind: MessageKind.User } }
    };
    stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
    sideEffects.handleAction(defaultChatUri, setAction);
    const turnId = stateManager.getActiveTurnId(defaultChatUri);
    assert.ok(turnId);
    setSessionConfig({ mode: "interactive" });
    fire({ type: ActionType.ChatTurnComplete, turnId, duration: 1e3 });
    assert.strictEqual(completedEvents()[0].data.interactionMode, "autopilot");
  });
  test("emits a single turnCompleted when both the client cancel and a follow-up agent signal arrive", () => {
    setupSession();
    startTurn("turn-1");
    sideEffects.handleAction(defaultChatUri, {
      type: ActionType.ChatTurnCancelled,
      turnId: "turn-1",
      duration: 1e3
    });
    fire({ type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
    assert.strictEqual(completedEvents().length, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RUdXJuVGVsZW1ldHJ5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWdlbnRNb2RlbEJ5b2tNZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50TW9kZWxCeW9rTWV0YS5qcyc7XG5pbXBvcnQgeyBnZXRUZWxlbWV0cnlDaGF0U2Vzc2lvbklkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50VGVsZW1ldHJ5Q29ycmVsYXRpb24uanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uLCBJQWdlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLCBBZ2VudEhvc3RMYXVuY2hLaW5kLCBBZ2VudEhvc3RUcmFuc3BvcnRLaW5kLCB0eXBlIElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgdHlwZSB7IFNlc3Npb25Nb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdEFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBidWlsZFN1YmFnZW50Q2hhdFVyaSwgTWVzc2FnZUtpbmQsIFBlbmRpbmdNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TG9jYWxUdXJucyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0TG9jYWxUdXJucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTaWRlRWZmZWN0cyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRTaWRlRWZmZWN0cy5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQWdlbnQgfSBmcm9tICcuL21vY2tBZ2VudC5qcyc7XG5pbXBvcnQgeyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIH0gZnJvbSAnLi90ZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcblxuY2xhc3MgRmFrZUNoYW5nZXNldFNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWdpc3RlclN0YXRpY0NoYW5nZXNldHMoKTogdm9pZCB7IH1cblx0cmVzdG9yZVN0YXRpY0NoYW5nZXNldCgpOiB2b2lkIHsgfVxuXHRwYXJzZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoKTogeyBzZXNzaW9uPzogdW5kZWZpbmVkIH0geyByZXR1cm4ge307IH1cblx0YXBwbHlQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKCk6IHZvaWQgeyB9XG5cdHJlc3RvcmVQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKCk6IHsgc2Vzc2lvbj86IHVuZGVmaW5lZCB9IHsgcmV0dXJuIHt9OyB9XG5cdHBlcnNpc3RDaGFuZ2VzU3VtbWFyeSgpOiB2b2lkIHsgfVxuXHRpc1N0YXRpY0NoYW5nZXNldENvbXB1dGVBY3RpdmUoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRnZXRMaXN0TWV0YWRhdGFLZXlzKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGNvbXB1dGVMaXN0RW50cnlDaGFuZ2VzKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdHJlZnJlc2hDaGFuZ2VzZXRDYXRhbG9nKCk6IHZvaWQgeyB9XG5cdHJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQoKTogdm9pZCB7IH1cblx0cmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoKTogdm9pZCB7IH1cblx0b25Xb3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlKCk6IHZvaWQgeyB9XG5cdHJlY29tcHV0ZVN1YnNjcmliZWRDaGFuZ2VzZXRzKCk6IHZvaWQgeyB9XG5cdG9uU2Vzc2lvbkRpc3Bvc2VkKCk6IHZvaWQgeyB9XG5cdGFzeW5jIGNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gYCR7c2Vzc2lvbn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYDsgfVxuXHRhc3luYyBjb21wdXRlVHVybkNoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gYCR7c2Vzc2lvbn0veGA7IH1cblx0YXN5bmMgY29tcHV0ZUNvbXBhcmVUdXJuc0NoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gYCR7c2Vzc2lvbn0veWA7IH1cblx0b25Ub29sQ2FsbEVkaXRzQXBwbGllZCgpOiB2b2lkIHsgfVxuXHRvblR1cm5Db21wbGV0ZSgpOiB2b2lkIHsgfVxuXHRvblNlc3Npb25UcnVuY2F0ZWQoKTogdm9pZCB7IH1cbn1cblxuY2xhc3MgQ2FwdHVyaW5nVGVsZW1ldHJ5U2VydmljZSBpbXBsZW1lbnRzIElUZWxlbWV0cnlTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHRlbGVtZXRyeUxldmVsID0gVGVsZW1ldHJ5TGV2ZWwuVVNBR0U7XG5cdHJlYWRvbmx5IHNlc3Npb25JZCA9ICd0ZXN0LXNlc3Npb24nO1xuXHRyZWFkb25seSBtYWNoaW5lSWQgPSAndGVzdC1tYWNoaW5lJztcblx0cmVhZG9ubHkgc3FtSWQgPSAndGVzdC1zcW0nO1xuXHRyZWFkb25seSBkZXZEZXZpY2VJZCA9ICd0ZXN0LWRldi1kZXZpY2UnO1xuXHRyZWFkb25seSBmaXJzdFNlc3Npb25EYXRlID0gJ3Rlc3QtZmlyc3Qtc2Vzc2lvbi1kYXRlJztcblx0cmVhZG9ubHkgc2VuZEVycm9yVGVsZW1ldHJ5ID0gZmFsc2U7XG5cdHJlYWRvbmx5IGV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W10gPSBbXTtcblxuXHRwdWJsaWNMb2coKTogdm9pZCB7IH1cblx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHR9XG5cdHB1YmxpY0xvZ0Vycm9yKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZ0Vycm9yMihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHR9XG5cdHNldEV4cGVyaW1lbnRQcm9wZXJ0eSgpOiB2b2lkIHsgfVxuXHRzZXRDb21tb25Qcm9wZXJ0eSgpOiB2b2lkIHsgfVxufVxuXG4vKipcbiAqIEludGVncmF0aW9uIHRlc3RzIGNvdmVyaW5nIHRoZSB7QGxpbmsgQWdlbnRIb3N0VHVyblRyYWNrZXJ9IGFzIGl0IGlzXG4gKiBkcml2ZW4gdGhyb3VnaCB7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30uIFRoZXNlIHRlc3RzIGludGVudGlvbmFsbHlcbiAqIGV4ZXJjaXNlIHRoZSBmdWxsIHdpcmluZyAodHVybi1zdGFydGVkIHJvdXRpbmcsIHByb2dyZXNzIGRpc3BhdGNoLFxuICogdHVybi1jb21wbGV0ZS9jYW5jZWwvZXJyb3IgcGF0aHMpIHNvIHRoYXQgd2UgY292ZXIgYm90aCB0aGUgdHJhY2tlclxuICogYW5kIGl0cyBpbnRlZ3JhdGlvbiB3aXRoIHRoZSBzaWRlLWVmZmVjdCBkaXNwYXRjaCBpbiBvbmUgcGxhY2UuXG4gKi9cbnN1aXRlKCdBZ2VudFNpZGVFZmZlY3RzIFx1MjAxNCB0dXJuIHRyYWNrZXIgdGVsZW1ldHJ5JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdGxldCBhZ2VudDogTW9ja0FnZW50O1xuXHRsZXQgc2lkZUVmZmVjdHM6IEFnZW50U2lkZUVmZmVjdHM7XG5cdGxldCB0ZWxlbWV0cnk6IENhcHR1cmluZ1RlbGVtZXRyeVNlcnZpY2U7XG5cblx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJyk7XG5cdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRmdW5jdGlvbiBzZXR1cFNlc3Npb24ocmVhZHkgPSB0cnVlLCB3b3JraW5nRGlyZWN0b3JpZXM/OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uS2V5LFxuXHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0Li4uKHdvcmtpbmdEaXJlY3RvcmllcyA/IHsgd29ya2luZ0RpcmVjdG9yaWVzIH0gOiB7fSksXG5cdFx0fSk7XG5cdFx0aWYgKHJlYWR5KSB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbktleSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSB9KTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBzZXRTZXNzaW9uQ29uZmlnKHZhbHVlczogeyBhdXRvQXBwcm92ZT86IHN0cmluZzsgbW9kZT86IFNlc3Npb25Nb2RlIH0pOiB2b2lkIHtcblx0XHQvLyBFc3RhYmxpc2ggY29uZmlnIG9uIHRoZSBhdXRob3JpdGF0aXZlIHNlc3Npb24gc3RhdGUgdmlhIHRoZSBzdGF0ZVxuXHRcdC8vIG1hbmFnZXIgQVBJLiBNdXRhdGluZyB0aGUgb2JqZWN0IHJldHVybmVkIGJ5IGBnZXRTZXNzaW9uU3RhdGVgIHdvdWxkXG5cdFx0Ly8gc3RyYW5kIHRoZSBjaGFuZ2Ugb24gYSBkZXRhY2hlZCBjb21wb3NpdGUgY29weSAoc2Vzc2lvbiBtZXJnZWQgd2l0aFxuXHRcdC8vIGl0cyBkZWZhdWx0IGNoYXQpLiBgYWdlbnRTZXJ2aWNlYCByZWdpc3RlcnMgdGhlIHNjaGVtYSBhdCBzZXNzaW9uXG5cdFx0Ly8gY3JlYXRpb24gdGltZTsgdGVzdHMgYnlwYXNzIHRoYXQgd2lyaW5nIHdpdGggdGhpcyBkaXJlY3Qgc2V0LlxuXHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25LZXksIHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBcHByb3ZhbHMnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10sIGRlZmF1bHQ6ICdkZWZhdWx0JyB9LFxuXHRcdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ01vZGUnLCBlbnVtOiBbJ2ludGVyYWN0aXZlJywgJ3BsYW4nLCAnYXV0b3BpbG90J10sIGRlZmF1bHQ6ICdpbnRlcmFjdGl2ZScgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHtcblx0XHRcdFx0Li4uKHZhbHVlcy5hdXRvQXBwcm92ZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogdmFsdWVzLmF1dG9BcHByb3ZlIH0pLFxuXHRcdFx0XHQuLi4odmFsdWVzLm1vZGUgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogdmFsdWVzLm1vZGUgfSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RhcnRUdXJuKHR1cm5JZDogc3RyaW5nLCB0ZXh0ID0gJ2hlbGxvJywgbW9kZWxJZD86IHN0cmluZywgY2hhdFVyaSA9IGRlZmF1bHRDaGF0VXJpLCBjbGllbnRDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIG1vZGVsOiBtb2RlbElkID8geyBpZDogbW9kZWxJZCB9IDogdW5kZWZpbmVkIH0sXG5cdFx0fTtcblx0XHQvLyBEaXNwYXRjaCBpbnRvIHRoZSBzdGF0ZSBtYW5hZ2VyIHNvIGBnZXRBY3RpdmVUdXJuSWRgIHJldHVybnMgdGhlXG5cdFx0Ly8gYWN0aXZlIHR1cm4gKHRoZSBwcm9ncmVzcy1saXN0ZW5lciBwYXRoIHJlbGllcyBvbiB0aGlzKSBhbmQgdGhlblxuXHRcdC8vIGludm9rZSBgaGFuZGxlQWN0aW9uYCBzbyB0aGUgc2lkZS1lZmZlY3QgKHdoaWNoIGNhbGxzXG5cdFx0Ly8gYGFnZW50LnNlbmRNZXNzYWdlYCBhbmQgYHR1cm5UcmFja2VyLnR1cm5TdGFydGVkYCkgcnVucy5cblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oY2hhdFVyaSwgYWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oY2hhdFVyaSwgYWN0aW9uLCAndGVzdCcsIGNsaWVudENvbnRleHQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlyZShhY3Rpb246IENoYXRBY3Rpb24sIGNoYXRVcmkgPSBkZWZhdWx0Q2hhdFVyaSk6IHZvaWQge1xuXHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGNoYXRVcmkpLCBhY3Rpb24gfSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjb21wbGV0ZWRFdmVudHMoKTogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W10ge1xuXHRcdHJldHVybiB0ZWxlbWV0cnkuZXZlbnRzLmZpbHRlcihlID0+IGUuZXZlbnROYW1lID09PSAnYWdlbnRIb3N0LnR1cm5Db21wbGV0ZWQnKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNhcHR1cmVkTW9kZWwoZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB7IHRydXN0ZWQ6IGJvb2xlYW47IHZhbHVlOiB1bmtub3duIH0ge1xuXHRcdGNvbnN0IG1vZGVsID0gZGF0YS5tb2RlbDtcblx0XHRyZXR1cm4gbW9kZWwgaW5zdGFuY2VvZiBUZWxlbWV0cnlUcnVzdGVkVmFsdWUgPyB7IHRydXN0ZWQ6IHRydWUsIHZhbHVlOiBtb2RlbC52YWx1ZSB9IDogeyB0cnVzdGVkOiBmYWxzZSwgdmFsdWU6IG1vZGVsIH07XG5cdH1cblxuXHRmdW5jdGlvbiBmYWlsZWRFdmVudHMoKTogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W10ge1xuXHRcdHJldHVybiB0ZWxlbWV0cnkuZXZlbnRzLmZpbHRlcihlID0+IGUuZXZlbnROYW1lID09PSAnYWdlbnRIb3N0LnR1cm5GYWlsZWQnKTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRhZ2VudCA9IG5ldyBNb2NrQWdlbnQoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgYWdlbnRMaXN0ID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFtdPignYWdlbnRzJywgW2FnZW50XSk7XG5cdFx0dGVsZW1ldHJ5ID0gbmV3IENhcHR1cmluZ1RlbGVtZXRyeVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UodGVsZW1ldHJ5KSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZTogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0aW5pdGlhbGl6ZVNlc3Npb246IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdGdldFdvcmtpbmdEaXJlY3RvcnlTdGF0ZTogKCkgPT4gKHsga2luZDogJ3dvcmtzcGFjZWxlc3MnIH0pLFxuXHRcdFx0cmVzb2x2ZTogKCkgPT4gKHsga2luZDogJ3Jlc29sdmVkJywgZW5hYmxlbWVudDogW10sIGVuYWJsZWQ6IHRydWUsIHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ3dvcmtzcGFjZWxlc3MnIH0gfSksXG5cdFx0XHRhcHBseUNsaWVudEdsb2JhbEVuYWJsZW1lbnQ6ICgpID0+ICh7IGtpbmQ6ICdyZXNvbHZlZCcsIGVuYWJsZW1lbnQ6IFtdLCBlbmFibGVkOiB0cnVlLCB3b3JraW5nRGlyZWN0b3J5OiB7IGtpbmQ6ICd3b3Jrc3BhY2VsZXNzJyB9IH0pLFxuXHRcdFx0cmVwbGFjZUVuYWJsZW1lbnQ6ICgpID0+ICh7IGtpbmQ6ICdyZXNvbHZlZCcsIGVuYWJsZW1lbnQ6IFtdLCBlbmFibGVkOiB0cnVlLCB3b3JraW5nRGlyZWN0b3J5OiB7IGtpbmQ6ICd3b3Jrc3BhY2VsZXNzJyB9IH0pLFxuXHRcdFx0c2V0RW5hYmxlbWVudDogKCkgPT4gKHsga2luZDogJ3Jlc29sdmVkJywgZW5hYmxlbWVudDogW10sIGVuYWJsZWQ6IHRydWUsIHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ3dvcmtzcGFjZWxlc3MnIH0gfSksXG5cdFx0XHR3aGVuSWRsZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nU2VydmljZSwgbG9nU2VydmljZV0sXG5cdFx0XHRbSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLCBuZXcgRmFrZUNoYW5nZXNldFNlcnZpY2UoKV0sXG5cdFx0XHRbSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRV0sXG5cdFx0XHRbSVRlbGVtZXRyeVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKV0sXG5cdFx0XHRbSVNlc3Npb25EYXRhU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlXSxcblx0XHQpLCAvKnN0cmljdCovIHRydWUpKTtcblx0XHRzaWRlRWZmZWN0cyA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNpZGVFZmZlY3RzLCBzdGF0ZU1hbmFnZXIsIGN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSwge1xuXHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRsb2NhbFR1cm5zOiBuZXcgQWdlbnRIb3N0TG9jYWxUdXJucyhzZXNzaW9uRGF0YVNlcnZpY2UsIGxvZ1NlcnZpY2UpLFxuXHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHR9KSk7XG5cdFx0Ly8gV2lyZSB0aGUgYWdlbnQncyBwcm9ncmVzcyBzaWduYWxzIHRocm91Z2ggc2lkZS1lZmZlY3RzICh0aGlzIGlzIGhvd1xuXHRcdC8vIHByb2dyZXNzIGFjdGlvbnMgcmVhY2ggdGhlIHN0YXRlIG1hbmFnZXIgaW4gcHJvZHVjdGlvbikuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2VtaXRzIHR1cm5Db21wbGV0ZWQgd2l0aCB0aW1pbmcgYW5kIHR1cm4tc3RhcnQgY29udGV4dCBvbiBzdWNjZXNzJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdGFnZW50LnNldE1vZGVscyhbeyBwcm92aWRlcjogJ21vY2snLCBpZDogJ2dwdC01LjUnLCBuYW1lOiAnR1BUIDUuNScsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9XSk7XG5cdFx0c2V0U2Vzc2lvbkNvbmZpZyh7IGF1dG9BcHByb3ZlOiAnYXV0b3BpbG90JywgbW9kZTogJ2ludGVyYWN0aXZlJyB9KTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tMScsICdoZWxsbycsICdncHQtNS41Jyk7XG5cblx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCBwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncDEnLCBjb250ZW50OiAnaGknIH0gfSk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRjb25zdCBldmVudHMgPSBjb21wbGV0ZWRFdmVudHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgZGF0YSA9IGV2ZW50c1swXS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnByb3ZpZGVyLCAnbW9jaycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmFnZW50U2Vzc2lvbklkLCAnc2Vzc2lvbi0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuY2hhdFNlc3Npb25JZCwgZ2V0VGVsZW1ldHJ5Q2hhdFNlc3Npb25JZChkZWZhdWx0Q2hhdFVyaSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnR1cm5JZCwgJ3R1cm4tMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnJlc3VsdCwgJ3N1Y2Nlc3MnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhcHR1cmVkTW9kZWwoZGF0YSksIHsgdHJ1c3RlZDogdHJ1ZSwgdmFsdWU6ICdncHQtNS41JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5tb2RlbFNlbGVjdGlvbktpbmQsICdleHBsaWNpdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnBlcm1pc3Npb25MZXZlbCwgJ2F1dG9waWxvdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmlzU3ViYWdlbnRTZXNzaW9uLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuaXNCWU9LLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuaW50ZXJhY3Rpb25Nb2RlLCAnaW50ZXJhY3RpdmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGRhdGEudG90YWxUaW1lLCAnbnVtYmVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBkYXRhLnRpbWVUb0ZpcnN0UHJvZ3Jlc3MsICdudW1iZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5pc011bHRpUm9vdCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmZvbGRlckNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYXR0cmlidXRlcyBjb21wbGV0ZWQgYW5kIGZhaWxlZCB0dXJucyB0byB0aGUgaW5pdGlhdGluZyBjbGllbnQgaWRlbnRpdHknLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0Y29uc3QgY2xpZW50Q29udGV4dDogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgPSB7XG5cdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyxcblx0XHRcdGNvbm5lY3Rpb25LaW5kOiBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZC5SZW1vdGVFeHRlbnNpb25Ib3N0LFxuXHRcdFx0dHJhbnNwb3J0S2luZDogQWdlbnRIb3N0VHJhbnNwb3J0S2luZC5NZXNzYWdlUG9ydCxcblx0XHRcdGhvc3RMYXVuY2hLaW5kOiBBZ2VudEhvc3RMYXVuY2hLaW5kLlZTQ29kZU1haW5Qcm9jZXNzLFxuXHRcdFx0bWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0ZGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0fTtcblx0XHRzdGFydFR1cm4oJ3QtY2xpZW50JywgJ2hlbGxvJywgdW5kZWZpbmVkLCBkZWZhdWx0Q2hhdFVyaSwgY2xpZW50Q29udGV4dCk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLCB0dXJuSWQ6ICd0LWNsaWVudCcsIGR1cmF0aW9uOiAxMDAsIGVycm9yOiB7IGVycm9yVHlwZTogJ3Byb3ZpZGVyRmFpbGVkJywgbWVzc2FnZTogJ2ZhaWxlZCcgfSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2NvbXBsZXRlZEV2ZW50cygpWzBdLCBmYWlsZWRFdmVudHMoKVswXV0ubWFwKGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBldmVudC5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXZlbnROYW1lOiBldmVudC5ldmVudE5hbWUsXG5cdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6IGRhdGEuaW5pdGlhdG9yQ2xpZW50VHlwZSxcblx0XHRcdFx0aW5pdGlhdG9yQ29ubmVjdGlvbktpbmQ6IGRhdGEuaW5pdGlhdG9yQ29ubmVjdGlvbktpbmQsXG5cdFx0XHRcdGluaXRpYXRvclRyYW5zcG9ydEtpbmQ6IGRhdGEuaW5pdGlhdG9yVHJhbnNwb3J0S2luZCxcblx0XHRcdFx0aG9zdExhdW5jaEtpbmQ6IGRhdGEuaG9zdExhdW5jaEtpbmQsXG5cdFx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogZGF0YS5pbml0aWF0b3JNYWNoaW5lSWQsXG5cdFx0XHRcdGluaXRpYXRvckRldkRldmljZUlkOiBkYXRhLmluaXRpYXRvckRldkRldmljZUlkLFxuXHRcdFx0fTtcblx0XHR9KSwgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2FnZW50SG9zdC50dXJuQ29tcGxldGVkJyxcblx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdlZGl0b3Jfd2luZG93Jyxcblx0XHRcdGluaXRpYXRvckNvbm5lY3Rpb25LaW5kOiAncmVtb3RlX2V4dGVuc2lvbl9ob3N0Jyxcblx0XHRcdGluaXRpYXRvclRyYW5zcG9ydEtpbmQ6ICdtZXNzYWdlX3BvcnQnLFxuXHRcdFx0aG9zdExhdW5jaEtpbmQ6ICd2c2NvZGVfbWFpbl9wcm9jZXNzJyxcblx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdGluaXRpYXRvckRldkRldmljZUlkOiAnY2xpZW50LWRldi1kZXZpY2UtaWQnLFxuXHRcdH0sIHtcblx0XHRcdGV2ZW50TmFtZTogJ2FnZW50SG9zdC50dXJuRmFpbGVkJyxcblx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdlZGl0b3Jfd2luZG93Jyxcblx0XHRcdGluaXRpYXRvckNvbm5lY3Rpb25LaW5kOiAncmVtb3RlX2V4dGVuc2lvbl9ob3N0Jyxcblx0XHRcdGluaXRpYXRvclRyYW5zcG9ydEtpbmQ6ICdtZXNzYWdlX3BvcnQnLFxuXHRcdFx0aG9zdExhdW5jaEtpbmQ6ICd2c2NvZGVfbWFpbl9wcm9jZXNzJyxcblx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdGluaXRpYXRvckRldkRldmljZUlkOiAnY2xpZW50LWRldi1kZXZpY2UtaWQnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgdHVybkNvbXBsZXRlZCB3aXRoIHRoZSBtdWx0aS1yb290IHdvcmtpbmctZGlyZWN0b3J5IHNoYXBlJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbih0cnVlLCBbJ2ZpbGU6Ly8vd29yay9hcHAnLCAnZmlsZTovLy93b3JrL2FwaSddKTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tbXInLCAnaGVsbG8nKTtcblxuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tbXInLCBkdXJhdGlvbjogMTAwMCB9KTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGNvbXBsZXRlZEV2ZW50cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBkYXRhID0gZXZlbnRzWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuaXNNdWx0aVJvb3QsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmZvbGRlckNvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBnZW5lcmljIG1vZGVsIHZhbHVlcyBmb3IgQllPSyBhbmQgdW5rbm93biBzZWxlY3Rpb25zJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdGFnZW50LnNldE1vZGVscyhbe1xuXHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdGlkOiAnb3BlbnJvdXRlci9wcml2YXRlLW1vZGVsJyxcblx0XHRcdG5hbWU6ICdQcml2YXRlIE1vZGVsJyxcblx0XHRcdHN1cHBvcnRzVmlzaW9uOiBmYWxzZSxcblx0XHRcdF9tZXRhOiBjcmVhdGVBZ2VudE1vZGVsQnlva01ldGEoJ29wZW5yb3V0ZXIvcHJpdmF0ZS1tb2RlbCcpLFxuXHRcdH1dKTtcblxuXHRcdHN0YXJ0VHVybigndHVybi1ieW9rJywgJ2hlbGxvJywgJ29wZW5yb3V0ZXIvcHJpdmF0ZS1tb2RlbCcpO1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tYnlvaycsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXHRcdHN0YXJ0VHVybigndHVybi11bmtub3duJywgJ2hlbGxvJywgJ3VuYWR2ZXJ0aXNlZC9wcml2YXRlLW1vZGVsJyk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi11bmtub3duJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXBsZXRlZEV2ZW50cygpLm1hcChldmVudCA9PiB7XG5cdFx0XHRjb25zdCBkYXRhID0gZXZlbnQuZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdHJldHVybiB7IG1vZGVsOiBkYXRhLm1vZGVsLCBtb2RlbFNlbGVjdGlvbktpbmQ6IGRhdGEubW9kZWxTZWxlY3Rpb25LaW5kLCBpc0JZT0s6IGRhdGEuaXNCWU9LIH07XG5cdFx0fSksIFtcblx0XHRcdHsgbW9kZWw6ICdieW9rTW9kZWwnLCBtb2RlbFNlbGVjdGlvbktpbmQ6ICdleHBsaWNpdCcsIGlzQllPSzogdHJ1ZSB9LFxuXHRcdFx0eyBtb2RlbDogJ3Vua25vd24nLCBtb2RlbFNlbGVjdGlvbktpbmQ6ICdleHBsaWNpdCcsIGlzQllPSzogZmFsc2UgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgcmVzb2x2ZWQgdXNhZ2UgbW9kZWwgd2hpbGUgcHJlc2VydmluZyBBdXRvIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRhZ2VudC5zZXRNb2RlbHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ21vY2snLCBpZDogJ2F1dG8nLCBuYW1lOiAnQXV0bycsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9LFxuXHRcdFx0eyBwcm92aWRlcjogJ21vY2snLCBpZDogJ2dwdC01LjUnLCBuYW1lOiAnR1BUIDUuNScsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9LFxuXHRcdF0pO1xuXHRcdHN0YXJ0VHVybigndHVybi1hdXRvJywgJ2hlbGxvJywgJ2F1dG8nKTtcblxuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSwgdHVybklkOiAndHVybi1hdXRvJywgdXNhZ2U6IHsgbW9kZWw6ICdncHQtNS41JyB9IH0pO1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tYXV0bycsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXG5cdFx0Y29uc3QgZGF0YSA9IGNvbXBsZXRlZEV2ZW50cygpWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbDogY2FwdHVyZWRNb2RlbChkYXRhKSxcblx0XHRcdG1vZGVsU2VsZWN0aW9uS2luZDogZGF0YS5tb2RlbFNlbGVjdGlvbktpbmQsXG5cdFx0fSwge1xuXHRcdFx0bW9kZWw6IHsgdHJ1c3RlZDogdHJ1ZSwgdmFsdWU6ICdncHQtNS41JyB9LFxuXHRcdFx0bW9kZWxTZWxlY3Rpb25LaW5kOiAnYXV0bycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RpbWVUb0ZpcnN0UHJvZ3Jlc3MgaXMgdW5kZWZpbmVkIHdoZW4gbm8gdmlzaWJsZSBwcm9ncmVzcyBhcnJpdmVzIGJlZm9yZSBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHQvLyBVc2FnZSBpcyBub3QgYSBcInZpc2libGUgcHJvZ3Jlc3NcIiBhY3Rpb24gXHUyMDE0IGl0IHNob3VsZCBub3QgbWFyayBmaXJzdCBwcm9ncmVzcy5cblx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsIHR1cm5JZDogJ3R1cm4tMScsIHVzYWdlOiB7IGlucHV0VG9rZW5zOiAxLCBvdXRwdXRUb2tlbnM6IDEgfSB9KTtcblx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9KTtcblxuXHRcdGNvbnN0IGRhdGEgPSBjb21wbGV0ZWRFdmVudHMoKVswXS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnRpbWVUb0ZpcnN0UHJvZ3Jlc3MsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIHJlc3VsdD1jYW5jZWxsZWQgb24gQ2hhdFR1cm5DYW5jZWxsZWQnLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnLCAnaGVsbG8nLCAnYXV0bycpO1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9KTtcblxuXHRcdGNvbnN0IGRhdGEgPSBjb21wbGV0ZWRFdmVudHMoKVswXS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW9kZWw6IGNhcHR1cmVkTW9kZWwoZGF0YSksXG5cdFx0XHRyZXN1bHQ6IGRhdGEucmVzdWx0LFxuXHRcdFx0bW9kZWxTZWxlY3Rpb25LaW5kOiBkYXRhLm1vZGVsU2VsZWN0aW9uS2luZCxcblx0XHR9LCB7IG1vZGVsOiB7IHRydXN0ZWQ6IHRydWUsIHZhbHVlOiAnYXV0bycgfSwgcmVzdWx0OiAnY2FuY2VsbGVkJywgbW9kZWxTZWxlY3Rpb25LaW5kOiAnYXV0bycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIHJlc3VsdD1lcnJvciBvbiBDaGF0RXJyb3InLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwLCBlcnJvcjogeyBlcnJvclR5cGU6ICdvb3BzJywgbWVzc2FnZTogJ2ZhaWwnIH0gfSk7XG5cblx0XHRjb25zdCBldmVudHMgPSBjb21wbGV0ZWRFdmVudHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChldmVudHNbMF0uZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikucmVzdWx0LCAnZXJyb3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGV2ZW50c1swXS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5lcnJvclR5cGUsICdvb3BzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcnJlbGF0ZXMgdHVybiBmYWlsdXJlIHdpdGggY2hhdCBhbmQgcHJvdmlkZXIgcmVxdWVzdCBpZGVudGlmaWVycycsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdGZpcmUoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRlcnJvclR5cGU6ICdxdW90YScsXG5cdFx0XHRcdG1lc3NhZ2U6ICdxdW90YSBleGNlZWRlZCcsXG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0Y2hhdEVycm9yOiB7XG5cdFx0XHRcdFx0XHRmZXRjaEVycm9yOiB7XG5cdFx0XHRcdFx0XHRcdHJlcXVlc3RJZDogJ3Byb3ZpZGVyLXJlcXVlc3QtaWQnLFxuXHRcdFx0XHRcdFx0XHRzZXJ2ZXJSZXF1ZXN0SWQ6ICdzZXJ2aWNlLXJlcXVlc3QtaWQnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmFpbGVkRXZlbnRzKCkubWFwKGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBldmVudC5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YWdlbnRTZXNzaW9uSWQ6IGRhdGEuYWdlbnRTZXNzaW9uSWQsXG5cdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IGRhdGEuY2hhdFNlc3Npb25JZCxcblx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGRhdGEuaXNTdWJhZ2VudFNlc3Npb24sXG5cdFx0XHRcdHR1cm5JZDogZGF0YS50dXJuSWQsXG5cdFx0XHRcdHByb3ZpZGVyQ2FsbElkOiBkYXRhLnByb3ZpZGVyQ2FsbElkLFxuXHRcdFx0XHRzZXJ2aWNlUmVxdWVzdElkOiBkYXRhLnNlcnZpY2VSZXF1ZXN0SWQsXG5cdFx0XHR9O1xuXHRcdH0pLCBbe1xuXHRcdFx0YWdlbnRTZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0Y2hhdFNlc3Npb25JZDogZ2V0VGVsZW1ldHJ5Q2hhdFNlc3Npb25JZChkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0cHJvdmlkZXJDYWxsSWQ6ICdwcm92aWRlci1yZXF1ZXN0LWlkJyxcblx0XHRcdHNlcnZpY2VSZXF1ZXN0SWQ6ICdzZXJ2aWNlLXJlcXVlc3QtaWQnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBzdWJhZ2VudCBjb21wbGV0aW9uIGFuZCBmYWlsdXJlIHdpdGhvdXQgY29sbGFwc2luZyB0aGUgY2hhdCBpZGVudGl0eScsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRjb25zdCBzdWJhZ2VudENoYXRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLCAndG9vbC1jYWxsLTEnKTtcblx0XHRzdGF0ZU1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uS2V5LCBzdWJhZ2VudENoYXRVcmkpO1xuXG5cdFx0c3RhcnRUdXJuKCdzdWJhZ2VudC1jb21wbGV0ZScsICdoZWxsbycsIHVuZGVmaW5lZCwgc3ViYWdlbnRDaGF0VXJpKTtcblx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICdzdWJhZ2VudC1jb21wbGV0ZScsIGR1cmF0aW9uOiAxMDAwIH0sIHN1YmFnZW50Q2hhdFVyaSk7XG5cdFx0c3RhcnRUdXJuKCdzdWJhZ2VudC1mYWlsZWQnLCAnaGVsbG8nLCB1bmRlZmluZWQsIHN1YmFnZW50Q2hhdFVyaSk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLCB0dXJuSWQ6ICdzdWJhZ2VudC1mYWlsZWQnLCBkdXJhdGlvbjogMTAwMCwgZXJyb3I6IHsgZXJyb3JUeXBlOiAnb29wcycsIG1lc3NhZ2U6ICdmYWlsJyB9IH0sIHN1YmFnZW50Q2hhdFVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXBsZXRlZDogY29tcGxldGVkRXZlbnRzKCkubWFwKGV2ZW50ID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGV2ZW50LmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRcdHJldHVybiB7IHR1cm5JZDogZGF0YS50dXJuSWQsIGFnZW50U2Vzc2lvbklkOiBkYXRhLmFnZW50U2Vzc2lvbklkLCBjaGF0U2Vzc2lvbklkOiBkYXRhLmNoYXRTZXNzaW9uSWQsIGlzU3ViYWdlbnRTZXNzaW9uOiBkYXRhLmlzU3ViYWdlbnRTZXNzaW9uIH07XG5cdFx0XHR9KSxcblx0XHRcdGZhaWxlZDogZmFpbGVkRXZlbnRzKCkubWFwKGV2ZW50ID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGV2ZW50LmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRcdHJldHVybiB7IHR1cm5JZDogZGF0YS50dXJuSWQsIGFnZW50U2Vzc2lvbklkOiBkYXRhLmFnZW50U2Vzc2lvbklkLCBjaGF0U2Vzc2lvbklkOiBkYXRhLmNoYXRTZXNzaW9uSWQsIGlzU3ViYWdlbnRTZXNzaW9uOiBkYXRhLmlzU3ViYWdlbnRTZXNzaW9uIH07XG5cdFx0XHR9KSxcblx0XHR9LCB7XG5cdFx0XHRjb21wbGV0ZWQ6IFtcblx0XHRcdFx0eyB0dXJuSWQ6ICdzdWJhZ2VudC1jb21wbGV0ZScsIGFnZW50U2Vzc2lvbklkOiAnc2Vzc2lvbi0xJywgY2hhdFNlc3Npb25JZDogZ2V0VGVsZW1ldHJ5Q2hhdFNlc3Npb25JZChzdWJhZ2VudENoYXRVcmkpLCBpc1N1YmFnZW50U2Vzc2lvbjogdHJ1ZSB9LFxuXHRcdFx0XHR7IHR1cm5JZDogJ3N1YmFnZW50LWZhaWxlZCcsIGFnZW50U2Vzc2lvbklkOiAnc2Vzc2lvbi0xJywgY2hhdFNlc3Npb25JZDogZ2V0VGVsZW1ldHJ5Q2hhdFNlc3Npb25JZChzdWJhZ2VudENoYXRVcmkpLCBpc1N1YmFnZW50U2Vzc2lvbjogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHRcdGZhaWxlZDogW1xuXHRcdFx0XHR7IHR1cm5JZDogJ3N1YmFnZW50LWZhaWxlZCcsIGFnZW50U2Vzc2lvbklkOiAnc2Vzc2lvbi0xJywgY2hhdFNlc3Npb25JZDogZ2V0VGVsZW1ldHJ5Q2hhdFNlc3Npb25JZChzdWJhZ2VudENoYXRVcmkpLCBpc1N1YmFnZW50U2Vzc2lvbjogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgYSBzaW5nbGUgdHVybkNvbXBsZXRlZCBwZXIgdHVybiBldmVuIHdoZW4gZm9sbG93ZWQgYnkgZHVwbGljYXRlIGNvbXBsZXRpb25zJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cdFx0Ly8gQSBkdXBsaWNhdGUgdHVybi1jb21wbGV0ZSBzaG91bGQgbm90IHByb2R1Y2UgYSBzZWNvbmQgdGVsZW1ldHJ5IGV2ZW50IGJlY2F1c2UgdGhlIHRyYWNrZXJcblx0XHQvLyBkcm9wcyBpdHMgcGVyLXR1cm4gc3RhdGUgb24gdGhlIGZpcnN0IGNvbXBsZXRpb24uXG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGVkRXZlbnRzKCkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnY2FwdHVyZXMgcGVybWlzc2lvbkxldmVsIGF0IHR1cm5TdGFydGVkLCBub3QgbGF0ZXIgbWlkLXR1cm4gY2hhbmdlcycsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzZXRTZXNzaW9uQ29uZmlnKHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0Ly8gQ2hhbmdlIGNvbmZpZyBtaWQtdHVybiBcdTIwMTQgc2hvdWxkIG5vdCBhZmZlY3QgdGhlIHJlY29yZGVkIGV2ZW50LlxuXHRcdHNldFNlc3Npb25Db25maWcoeyBhdXRvQXBwcm92ZTogJ2F1dG9waWxvdCcgfSk7XG5cblx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9KTtcblxuXHRcdGNvbnN0IGRhdGEgPSBjb21wbGV0ZWRFdmVudHMoKVswXS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnBlcm1pc3Npb25MZXZlbCwgJ2RlZmF1bHQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBhbGwgaW50ZXJhY3Rpb24gbW9kZXMnLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRmb3IgKGNvbnN0IG1vZGUgb2YgWydpbnRlcmFjdGl2ZScsICdwbGFuJywgJ2F1dG9waWxvdCddIGFzIGNvbnN0KSB7XG5cdFx0XHRzZXRTZXNzaW9uQ29uZmlnKHsgbW9kZSB9KTtcblx0XHRcdHN0YXJ0VHVybihgdHVybi0ke21vZGV9YCk7XG5cdFx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6IGB0dXJuLSR7bW9kZX1gLCBkdXJhdGlvbjogMTAwMCB9KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXBsZXRlZEV2ZW50cygpLm1hcChldmVudCA9PiAoZXZlbnQuZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuaW50ZXJhY3Rpb25Nb2RlKSwgWydpbnRlcmFjdGl2ZScsICdwbGFuJywgJ2F1dG9waWxvdCddKTtcblx0fSk7XG5cblx0dGVzdCgnY2FwdHVyZXMgaW50ZXJhY3Rpb25Nb2RlIGF0IHR1cm5TdGFydGVkLCBub3QgbGF0ZXIgbWlkLXR1cm4gY2hhbmdlcycsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzZXRTZXNzaW9uQ29uZmlnKHsgbW9kZTogJ3BsYW4nIH0pO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRzZXRTZXNzaW9uQ29uZmlnKHsgbW9kZTogJ2F1dG9waWxvdCcgfSk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNvbXBsZXRlZEV2ZW50cygpWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmludGVyYWN0aW9uTW9kZSwgJ3BsYW4nKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgYW5kIHBlcm1pc3Npb25MZXZlbCBhcmUgdW5kZWZpbmVkIHdoZW4gbmV2ZXIgc2V0JywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRjb25zdCBkYXRhID0gY29tcGxldGVkRXZlbnRzKClbMF0uZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5tb2RlbCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5tb2RlbFNlbGVjdGlvbktpbmQsICdkZWZhdWx0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEucGVybWlzc2lvbkxldmVsLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmlzQllPSywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5pbnRlcmFjdGlvbk1vZGUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdC8vIFRoZSB0ZXN0cyBiZWxvdyBjb3ZlciBjb21wbGV0aW9uIHBhdGhzIHRoYXQgYnlwYXNzIHRoZSBhZ2VudC1wcm9ncmVzc1xuXHQvLyBzaWduYWwgZmxvdyAoYF9kaXNwYXRjaEFjdGlvbkZvclNlc3Npb25gKSBcdTIwMTQgY2xpZW50LWluaXRpYXRlZCBjYW5jZWxcblx0Ly8gYW5kIGBzZW5kTWVzc2FnZWAgcmVqZWN0aW9uIGJvdGggZGlzcGF0Y2ggdGhlaXIgdGVybWluYWwgYWN0aW9uXG5cdC8vIGRpcmVjdGx5IHRocm91Z2ggdGhlIHN0YXRlIG1hbmFnZXIuXG5cblx0dGVzdCgnZW1pdHMgcmVzdWx0PWNhbmNlbGxlZCB3aGVuIHRoZSBjbGllbnQgY2FuY2VscyBhIHR1cm4gKG5vIGFnZW50IHByb2dyZXNzIHNpZ25hbCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHR9KTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0Y29uc3QgZXZlbnRzID0gY29tcGxldGVkRXZlbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXZlbnRzWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnJlc3VsdCwgJ2NhbmNlbGxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyByZXN1bHQ9ZXJyb3Igd2hlbiBhIGRpcmVjdCBzZW5kTWVzc2FnZSByZWplY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdGFnZW50LnNlbmRNZXNzYWdlID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTsgfTtcblxuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGNvbXBsZXRlZEV2ZW50cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGV2ZW50c1swXS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5yZXN1bHQsICdlcnJvcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXZlbnRzWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmVycm9yVHlwZSwgJ3NlbmRGYWlsZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZhaWxlZEV2ZW50cygpLm1hcChldmVudCA9PiB7XG5cdFx0XHRjb25zdCBkYXRhID0gZXZlbnQuZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGZhaWx1cmVTdGFnZTogZGF0YS5mYWlsdXJlU3RhZ2UsXG5cdFx0XHRcdGVycm9yVHlwZTogZGF0YS5lcnJvclR5cGUsXG5cdFx0XHRcdGVycm9yTmFtZTogZGF0YS5lcnJvck5hbWUsXG5cdFx0XHRcdG1zZzogZGF0YS5tc2csXG5cdFx0XHRcdGhhc1N0YWNrOiB0eXBlb2YgZGF0YS5jYWxsc3RhY2sgPT09ICdzdHJpbmcnLFxuXHRcdFx0fTtcblx0XHR9KSwgW3tcblx0XHRcdGZhaWx1cmVTdGFnZTogJ3NlbmRNZXNzYWdlJyxcblx0XHRcdGVycm9yVHlwZTogJ3NlbmRGYWlsZWQnLFxuXHRcdFx0ZXJyb3JOYW1lOiAnRXJyb3InLFxuXHRcdFx0bXNnOiAnRXJyb3I6IGJvb20nLFxuXHRcdFx0aGFzU3RhY2s6IHRydWUsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlscyB0aGUgdHVybiB3aGVuIG1vZGVsIHNlbGVjdGlvbiByZWplY3RzIGluc3RlYWQgb2Ygc2VuZGluZyB3aXRoIGEgc3RhbGUgbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKGZhbHNlKTtcblx0XHRhZ2VudC5jaGFuZ2VNb2RlbCA9IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCd1bmtub3duIG1vZGVsJyk7IH07XG5cblx0XHRzdGFydFR1cm4oJ3R1cm4tMScsICdoZWxsbycsICdtaXNzaW5nLW1vZGVsJyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7XG5cblx0XHRjb25zdCBjb21wbGV0ZWQgPSBjb21wbGV0ZWRFdmVudHMoKVswXS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGNvbnN0IGZhaWxlZCA9IGZhaWxlZEV2ZW50cygpWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wbGV0ZWQ6IHsgcmVzdWx0OiBjb21wbGV0ZWQucmVzdWx0LCBlcnJvclR5cGU6IGNvbXBsZXRlZC5lcnJvclR5cGUsIGZhaWx1cmVTdGFnZTogY29tcGxldGVkLmZhaWx1cmVTdGFnZSB9LFxuXHRcdFx0ZmFpbGVkOiB7IGVycm9yVHlwZTogZmFpbGVkLmVycm9yVHlwZSwgZmFpbHVyZVN0YWdlOiBmYWlsZWQuZmFpbHVyZVN0YWdlLCBtc2c6IGZhaWxlZC5tc2cgfSxcblx0XHRcdGNyZWF0aW9uRXJyb3JUeXBlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXkpPy5jcmVhdGlvbkVycm9yPy5lcnJvclR5cGUsXG5cdFx0XHRzZW5kTWVzc2FnZUNhbGxzOiBhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRjb21wbGV0ZWQ6IHsgcmVzdWx0OiAnZXJyb3InLCBlcnJvclR5cGU6ICdtb2RlbFNlbGVjdGlvbkZhaWxlZCcsIGZhaWx1cmVTdGFnZTogJ21vZGVsU2VsZWN0aW9uJyB9LFxuXHRcdFx0ZmFpbGVkOiB7IGVycm9yVHlwZTogJ21vZGVsU2VsZWN0aW9uRmFpbGVkJywgZmFpbHVyZVN0YWdlOiAnbW9kZWxTZWxlY3Rpb24nLCBtc2c6ICdFcnJvcjogdW5rbm93biBtb2RlbCcgfSxcblx0XHRcdGNyZWF0aW9uRXJyb3JUeXBlOiAnbW9kZWxTZWxlY3Rpb25GYWlsZWQnLFxuXHRcdFx0c2VuZE1lc3NhZ2VDYWxsczogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgcmVzdWx0PWVycm9yIHdoZW4gYSBxdWV1ZWQgc2VuZE1lc3NhZ2UgcmVqZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRhZ2VudC5zZW5kTWVzc2FnZSA9IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdib29tJyk7IH07XG5cblx0XHRjb25zdCBzZXRBY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCxcblx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRpZDogJ3EtZXJyJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3F1ZXVlZCBtZXNzYWdlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH07XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0Y29uc3QgZXZlbnRzID0gY29tcGxldGVkRXZlbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXZlbnRzWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnJlc3VsdCwgJ2Vycm9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcHR1cmVzIGludGVyYWN0aW9uTW9kZSBmb3IgcXVldWVkIHR1cm5zJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHNldFNlc3Npb25Db25maWcoeyBtb2RlOiAnYXV0b3BpbG90JyB9KTtcblxuXHRcdGNvbnN0IHNldEFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0LFxuXHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdGlkOiAncS1tb2RlJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3F1ZXVlZCBtZXNzYWdlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH07XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uKTtcblx0XHRjb25zdCB0dXJuSWQgPSBzdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKGRlZmF1bHRDaGF0VXJpKTtcblx0XHRhc3NlcnQub2sodHVybklkKTtcblxuXHRcdHNldFNlc3Npb25Db25maWcoeyBtb2RlOiAnaW50ZXJhY3RpdmUnIH0pO1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZCwgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNvbXBsZXRlZEV2ZW50cygpWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmludGVyYWN0aW9uTW9kZSwgJ2F1dG9waWxvdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBhIHNpbmdsZSB0dXJuQ29tcGxldGVkIHdoZW4gYm90aCB0aGUgY2xpZW50IGNhbmNlbCBhbmQgYSBmb2xsb3ctdXAgYWdlbnQgc2lnbmFsIGFycml2ZScsICgpID0+IHtcblx0XHQvLyBTb21lIGFnZW50cyBlbWl0IGEgYENoYXRUdXJuQ2FuY2VsbGVkYCBzaWduYWwgaW4gcmVzcG9uc2UgdG9cblx0XHQvLyBgYWJvcnRTZXNzaW9uYDsgdGhlIHRyYWNrZXIgbXVzdCBkZWR1cCBhY3Jvc3MgdGhlIGNsaWVudC1jYW5jZWxcblx0XHQvLyBwYXRoIGFuZCB0aGUgYWdlbnQtcHJvZ3Jlc3Mgc2lnbmFsIHBhdGguXG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHR9KTtcblx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGVkRXZlbnRzKCkubGVuZ3RoLCAxKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtB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
