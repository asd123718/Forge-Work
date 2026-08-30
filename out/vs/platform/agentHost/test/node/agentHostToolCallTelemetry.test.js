import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/virtualScheduling/runWithFakedTimers.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { TelemetryTrustedValue } from "../../../telemetry/common/telemetryUtils.js";
import { AgentSession } from "../../common/agent.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from "../../common/agentHostTelemetry.js";
import { SessionInputRequestKind } from "../../common/state/protocol/state.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildDefaultChatUri, MessageKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType } from "../../common/state/sessionState.js";
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
  refreshBranchChangeset() {
  }
  refreshSessionChangeset() {
  }
  refreshChangesetCatalog() {
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
  publicLogError2() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite("AgentSideEffects \u2014 tool call telemetry", () => {
  const disposables = new DisposableStore();
  let stateManager;
  let agent;
  let sideEffects;
  let telemetry;
  const sessionUri = AgentSession.uri("mock", "session-1");
  const sessionKey = sessionUri.toString();
  const defaultChatUri = buildDefaultChatUri(sessionUri);
  function setupSession() {
    stateManager.createSession({
      resource: sessionKey,
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
  }
  function startTurn(turnId, text = "hello", modelId, clientContext) {
    const action = {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text, origin: { kind: MessageKind.User }, model: modelId ? { id: modelId } : void 0 }
    };
    stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
    sideEffects.handleAction(defaultChatUri, action, "test", clientContext);
  }
  function fire(action) {
    agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action });
  }
  function toolStart(turnId, toolCallId, toolName, contributor) {
    fire({ type: ActionType.ChatToolCallStart, turnId, toolCallId, toolName, displayName: toolName, contributor });
  }
  function toolComplete(turnId, toolCallId, result) {
    fire({ type: ActionType.ChatToolCallComplete, turnId, toolCallId, result });
  }
  function completeTurn(turnId) {
    fire({ type: ActionType.ChatTurnComplete, turnId, duration: 1e3 });
  }
  function toolEvents() {
    return telemetry.events.filter((e) => e.eventName === "languageModelToolInvoked").map((e) => {
      const data = e.data;
      return {
        eventName: e.eventName,
        data: {
          ...data,
          invocationTimeMs: data.invocationTimeMs === void 0 ? void 0 : typeof data.invocationTimeMs === "number" && data.invocationTimeMs >= 0,
          model: data.model instanceof TelemetryTrustedValue ? { trusted: true, value: data.model.value } : data.model
        }
      };
    });
  }
  function stalledEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.toolCallStalled").map((e) => {
      const data = e.data;
      return {
        eventName: e.eventName,
        data: { ...data, stalledTimeMs: typeof data.stalledTimeMs === "number" && data.stalledTimeMs >= 0 }
      };
    });
  }
  function stalledCompletionEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.stalledToolCallCompleted").map((e) => {
      const data = e.data;
      return {
        eventName: e.eventName,
        data: {
          ...data,
          totalTimeMs: typeof data.totalTimeMs === "number" && data.totalTimeMs >= 0,
          timeAfterStallMs: typeof data.timeAfterStallMs === "number" && data.timeAfterStallMs >= 0
        }
      };
    });
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
  test("emits a successful agent-host tool invocation", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-1", "bash");
    fire({
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "run",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    toolComplete("turn-1", "tc-1", { success: true, pastTenseMessage: "ran" });
    completeTurn("turn-1");
    assert.deepStrictEqual(toolEvents(), [{
      eventName: "languageModelToolInvoked",
      data: {
        result: "success",
        chatSessionId: sessionKey,
        toolId: "bash",
        toolExtensionId: void 0,
        toolSourceKind: "agentHost",
        toolCallId: "tc-1",
        provider: "mock",
        invocationTimeMs: true,
        resultSizeInCharacters: 41,
        turnId: "turn-1",
        model: void 0
      }
    }]);
  });
  test("attributes tool telemetry to the initiating turn client", () => {
    setupSession();
    const clientContext = {
      clientType: AgentHostClientType.EditorWindow,
      connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
      transportKind: AgentHostTransportKind.MessagePort,
      hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
      machineId: "client-machine-id",
      devDeviceId: "client-dev-device-id"
    };
    startTurn("turn-client", "hello", "model-a", clientContext);
    toolStart("turn-client", "tool-client", "grep");
    toolComplete("turn-client", "tool-client", { success: true, pastTenseMessage: "searched" });
    completeTurn("turn-client");
    const event = toolEvents()[0];
    assert.deepStrictEqual({
      initiatorClientType: event.data.initiatorClientType,
      initiatorConnectionKind: event.data.initiatorConnectionKind,
      initiatorTransportKind: event.data.initiatorTransportKind,
      hostLaunchKind: event.data.hostLaunchKind,
      initiatorMachineId: event.data.initiatorMachineId,
      initiatorDevDeviceId: event.data.initiatorDevDeviceId
    }, {
      initiatorClientType: "editor_window",
      initiatorConnectionKind: "remote_extension_host",
      initiatorTransportKind: "message_port",
      hostLaunchKind: "vscode_main_process",
      initiatorMachineId: "client-machine-id",
      initiatorDevDeviceId: "client-dev-device-id"
    });
  });
  test("emits userCancelled with mcp source kind for a denied mcp tool", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-mcp", "lookup", { kind: ToolCallContributorKind.MCP, customizationId: "c1" });
    toolComplete("turn-1", "tc-mcp", { success: false, pastTenseMessage: "denied", error: { message: "denied", code: "denied" } });
    completeTurn("turn-1");
    assert.deepStrictEqual(toolEvents(), [{
      eventName: "languageModelToolInvoked",
      data: {
        result: "userCancelled",
        chatSessionId: sessionKey,
        toolId: "lookup",
        toolExtensionId: void 0,
        toolSourceKind: "mcp",
        toolCallId: "tc-mcp",
        provider: "mock",
        invocationTimeMs: void 0,
        resultSizeInCharacters: 90,
        turnId: "turn-1",
        model: void 0
      }
    }]);
  });
  test("emits client source kind for a client-contributed tool", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-client", "run_tests", { kind: ToolCallContributorKind.Client, clientId: "client-1" });
    fire({
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-client",
      invocationMessage: "run tests",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    toolComplete("turn-1", "tc-client", { success: true, pastTenseMessage: "ran tests" });
    completeTurn("turn-1");
    assert.deepStrictEqual(toolEvents(), [{
      eventName: "languageModelToolInvoked",
      data: {
        result: "success",
        chatSessionId: sessionKey,
        toolId: "run_tests",
        toolExtensionId: void 0,
        toolSourceKind: "client",
        toolCallId: "tc-client",
        provider: "mock",
        invocationTimeMs: true,
        resultSizeInCharacters: 47,
        turnId: "turn-1",
        model: void 0
      }
    }]);
  });
  test("uses the resolved usage model for an in-flight tool call", () => {
    setupSession();
    agent.setModels([
      { provider: "mock", id: "auto", name: "Auto", supportsVision: false },
      { provider: "mock", id: "gpt-5.5", name: "GPT 5.5", supportsVision: false }
    ]);
    startTurn("turn-1", "hello", "auto");
    toolStart("turn-1", "tc-model", "read_file");
    fire({ type: ActionType.ChatUsage, turnId: "turn-1", usage: { model: "gpt-5.5" } });
    toolComplete("turn-1", "tc-model", { success: true, pastTenseMessage: "read file" });
    assert.deepStrictEqual(toolEvents()[0].data, {
      result: "success",
      chatSessionId: sessionKey,
      toolId: "read_file",
      toolExtensionId: void 0,
      toolSourceKind: "agentHost",
      toolCallId: "tc-model",
      invocationTimeMs: void 0,
      provider: "mock",
      resultSizeInCharacters: 47,
      turnId: "turn-1",
      model: { trusted: true, value: "gpt-5.5" }
    });
  });
  test("uses a resolved usage model received before the tool call starts", () => {
    setupSession();
    agent.setModels([{ provider: "mock", id: "gpt-5.5", name: "GPT 5.5", supportsVision: false }]);
    startTurn("turn-1");
    fire({ type: ActionType.ChatUsage, turnId: "turn-1", usage: { model: "gpt-5.5" } });
    toolStart("turn-1", "tc-model", "read_file");
    toolComplete("turn-1", "tc-model", { success: true, pastTenseMessage: "read file" });
    assert.deepStrictEqual(toolEvents()[0].data.model, { trusted: true, value: "gpt-5.5" });
  });
  test("waits for a resolved usage model received after tool completion", () => {
    setupSession();
    agent.setModels([{ provider: "mock", id: "claude-sonnet", name: "Claude Sonnet", supportsVision: false }]);
    startTurn("turn-1");
    toolStart("turn-1", "tc-model", "read_file");
    toolComplete("turn-1", "tc-model", { success: true, pastTenseMessage: "read file" });
    assert.strictEqual(toolEvents().length, 0);
    fire({ type: ActionType.ChatUsage, turnId: "turn-1", usage: { model: "claude-sonnet" } });
    assert.deepStrictEqual(toolEvents()[0].data.model, { trusted: true, value: "claude-sonnet" });
  });
  test("includes result content in the serialized result size", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-read", "read_file");
    toolComplete("turn-1", "tc-read", {
      success: true,
      pastTenseMessage: "read files",
      content: [{ type: ToolResultContentType.Text, text: "alpha\nbeta" }]
    });
    completeTurn("turn-1");
    assert.deepStrictEqual(toolEvents()[0].data.resultSizeInCharacters, 97);
  });
  test("only accepts contributor refinements that preserve execution ownership", async () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-mcp-ready", "lookup");
    agent.fireProgress({
      kind: "pending_confirmation",
      chat: URI.parse(defaultChatUri),
      state: {
        status: ToolCallStatus.PendingConfirmation,
        toolCallId: "tc-mcp-ready",
        toolName: "lookup",
        displayName: "Lookup",
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
        invocationMessage: "Looking up metadata",
        toolInput: "{}"
      }
    });
    toolStart("turn-1", "tc-late-client", "run_tests");
    agent.fireProgress({
      kind: "pending_confirmation",
      chat: URI.parse(defaultChatUri),
      state: {
        status: ToolCallStatus.PendingConfirmation,
        toolCallId: "tc-late-client",
        toolName: "run_tests",
        displayName: "Run Tests",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        invocationMessage: "Running tests",
        toolInput: "{}"
      }
    });
    await timeout(0);
    toolComplete("turn-1", "tc-mcp-ready", { success: true, pastTenseMessage: "looked up metadata" });
    toolComplete("turn-1", "tc-late-client", { success: true, pastTenseMessage: "ran tests" });
    completeTurn("turn-1");
    assert.deepStrictEqual(toolEvents().map((event) => event.data.toolSourceKind), ["mcp", "agentHost"]);
  });
  test("excludes pending confirmation time from invocation timing", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-confirm-timing", "write");
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-confirm-timing",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      await timeout(1e4);
      const confirmed = {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-confirm-timing",
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      };
      stateManager.dispatchClientAction(defaultChatUri, confirmed, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, confirmed);
      await timeout(25);
      toolComplete("turn-1", "tc-confirm-timing", { success: true, pastTenseMessage: "wrote file" });
      completeTurn("turn-1");
    });
    const event = telemetry.events.find((event2) => event2.eventName === "languageModelToolInvoked");
    const invocationTimeMs = event?.data?.invocationTimeMs;
    assert.deepStrictEqual({
      isMeasured: typeof invocationTimeMs === "number",
      excludesConfirmationDelay: typeof invocationTimeMs === "number" && invocationTimeMs < 1e3
    }, {
      isMeasured: true,
      excludesConfirmationDelay: true
    });
  });
  test("emits error for a failure without a cancellation code", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-err", "bash");
    toolComplete("turn-1", "tc-err", { success: false, pastTenseMessage: "boom", error: { message: "boom" } });
    completeTurn("turn-1");
    assert.strictEqual(toolEvents()[0].data.result, "error");
  });
  test("emits a single event when a tool completion is duplicated", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-dup", "bash");
    toolComplete("turn-1", "tc-dup", { success: true, pastTenseMessage: "ran" });
    toolComplete("turn-1", "tc-dup", { success: true, pastTenseMessage: "ran" });
    completeTurn("turn-1");
    assert.strictEqual(toolEvents().length, 1);
  });
  test("drops an in-flight tool call when the turn is cancelled before completion", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-inflight", "bash");
    fire({ type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
    toolComplete("turn-1", "tc-inflight", { success: true, pastTenseMessage: "ran" });
    assert.strictEqual(toolEvents().length, 0);
  });
  test("emits once when a tool confirmation remains blocked", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-confirm", "write");
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-confirm",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-confirm",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      await timeout(5 * 60 * 1e3);
    });
    assert.deepStrictEqual(stalledEvents(), [{
      eventName: "agentHost.toolCallStalled",
      data: {
        provider: "mock",
        agentSessionId: "session-1",
        isSubagentSession: false,
        blockerKind: SessionInputRequestKind.ToolConfirmation,
        toolId: "write",
        toolSourceKind: "agentHost",
        stalledTimeMs: true
      }
    }]);
  });
  test("replaces confirmation tracking with client execution tracking", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-client-stall", "run_tests", { kind: ToolCallContributorKind.Client, clientId: "client-1" });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-client-stall",
        invocationMessage: "Run tests",
        confirmationTitle: "Run tests"
      });
      fire({
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-client-stall",
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      });
      await timeout(5 * 60 * 1e3);
    });
    assert.deepStrictEqual(stalledEvents().map((e) => e.data.blockerKind), [SessionInputRequestKind.ToolClientExecution]);
  });
  test("does not emit after a client tool completes or its turn is cancelled", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-complete", "run_tests", { kind: ToolCallContributorKind.Client, clientId: "client-1" });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-complete",
        invocationMessage: "Run tests",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      toolComplete("turn-1", "tc-complete", { success: true, pastTenseMessage: "ran tests" });
      toolStart("turn-1", "tc-cancel", "write");
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-cancel",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      fire({ type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
      await timeout(5 * 60 * 1e3);
    });
    assert.deepStrictEqual(stalledEvents(), []);
    assert.deepStrictEqual(stalledCompletionEvents(), []);
  });
  test("emits when a stalled client tool later completes", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-recovered", "run_tests", { kind: ToolCallContributorKind.Client, clientId: "client-1" });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-recovered",
        invocationMessage: "Run tests",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(5 * 60 * 1e3);
      toolComplete("turn-1", "tc-recovered", { success: true, pastTenseMessage: "ran tests" });
    });
    assert.deepStrictEqual(stalledCompletionEvents(), [{
      eventName: "agentHost.stalledToolCallCompleted",
      data: {
        provider: "mock",
        agentSessionId: "session-1",
        isSubagentSession: false,
        blockerKind: SessionInputRequestKind.ToolClientExecution,
        toolId: "run_tests",
        toolSourceKind: "client",
        result: "success",
        totalTimeMs: true,
        timeAfterStallMs: true
      }
    }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RUb29sQ2FsbFRlbGVtZXRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3ZpcnR1YWxTY2hlZHVsaW5nL3J1bldpdGhGYWtlZFRpbWVycy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIElBZ2VudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvbktpbmQsIEFnZW50SG9zdExhdW5jaEtpbmQsIEFnZW50SG9zdFRyYW5zcG9ydEtpbmQsIHR5cGUgSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdEFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBNZXNzYWdlS2luZCwgU2Vzc2lvblN0YXR1cywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCB0eXBlIFRvb2xDYWxsQ29udHJpYnV0b3IsIHR5cGUgVG9vbENhbGxSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdExvY2FsVHVybnMgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdExvY2FsVHVybnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2lkZUVmZmVjdHMgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50U2lkZUVmZmVjdHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0FnZW50IH0gZnJvbSAnLi9tb2NrQWdlbnQuanMnO1xuaW1wb3J0IHsgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4vdGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5cbmNsYXNzIEZha2VDaGFuZ2VzZXRTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKCk6IHZvaWQgeyB9XG5cdHJlc3RvcmVTdGF0aWNDaGFuZ2VzZXQoKTogdm9pZCB7IH1cblx0cGFyc2VQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKCk6IHsgc2Vzc2lvbj86IHVuZGVmaW5lZCB9IHsgcmV0dXJuIHt9OyB9XG5cdGFwcGx5UGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cygpOiB2b2lkIHsgfVxuXHRyZXN0b3JlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cygpOiB7IHNlc3Npb24/OiB1bmRlZmluZWQgfSB7IHJldHVybiB7fTsgfVxuXHRwZXJzaXN0Q2hhbmdlc1N1bW1hcnkoKTogdm9pZCB7IH1cblx0aXNTdGF0aWNDaGFuZ2VzZXRDb21wdXRlQWN0aXZlKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Z2V0TGlzdE1ldGFkYXRhS2V5cygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRjb21wdXRlTGlzdEVudHJ5Q2hhbmdlcygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRyZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KCk6IHZvaWQgeyB9XG5cdHJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KCk6IHZvaWQgeyB9XG5cdHJlZnJlc2hDaGFuZ2VzZXRDYXRhbG9nKCk6IHZvaWQgeyB9XG5cdG9uV29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZSgpOiB2b2lkIHsgfVxuXHRyZWNvbXB1dGVTdWJzY3JpYmVkQ2hhbmdlc2V0cygpOiB2b2lkIHsgfVxuXHRvblNlc3Npb25EaXNwb3NlZCgpOiB2b2lkIHsgfVxuXHRhc3luYyBjb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7IH1cblx0YXN5bmMgY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L3hgOyB9XG5cdGFzeW5jIGNvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L3lgOyB9XG5cdG9uVG9vbENhbGxFZGl0c0FwcGxpZWQoKTogdm9pZCB7IH1cblx0b25UdXJuQ29tcGxldGUoKTogdm9pZCB7IH1cblx0b25TZXNzaW9uVHJ1bmNhdGVkKCk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIENhcHR1cmluZ1RlbGVtZXRyeVNlcnZpY2UgaW1wbGVtZW50cyBJVGVsZW1ldHJ5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRyZWFkb25seSBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uJztcblx0cmVhZG9ubHkgbWFjaGluZUlkID0gJ3Rlc3QtbWFjaGluZSc7XG5cdHJlYWRvbmx5IHNxbUlkID0gJ3Rlc3Qtc3FtJztcblx0cmVhZG9ubHkgZGV2RGV2aWNlSWQgPSAndGVzdC1kZXYtZGV2aWNlJztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZSA9ICd0ZXN0LWZpcnN0LXNlc3Npb24tZGF0ZSc7XG5cdHJlYWRvbmx5IHNlbmRFcnJvclRlbGVtZXRyeSA9IGZhbHNlO1xuXHRyZWFkb25seSBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IHVua25vd24gfVtdID0gW107XG5cblx0cHVibGljTG9nKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZzIoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0fVxuXHRwdWJsaWNMb2dFcnJvcigpOiB2b2lkIHsgfVxuXHRwdWJsaWNMb2dFcnJvcjIoKTogdm9pZCB7IH1cblx0c2V0RXhwZXJpbWVudFByb3BlcnR5KCk6IHZvaWQgeyB9XG5cdHNldENvbW1vblByb3BlcnR5KCk6IHZvaWQgeyB9XG59XG5cbi8qKlxuICogSW50ZWdyYXRpb24gdGVzdHMgY292ZXJpbmcgdGhlIHtAbGluayBBZ2VudEhvc3RUb29sQ2FsbFRyYWNrZXJ9IGFzIGl0IGlzXG4gKiBkcml2ZW4gdGhyb3VnaCB7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30uIFRoZXNlIGV4ZXJjaXNlIHRoZSBmdWxsIHdpcmluZ1xuICogKHRvb2wtY2FsbCBzdGFydCBzdGFtcGluZywgY29tcGxldGlvbiBlbWlzc2lvbiwgZGVkdXAgYW5kIHRoZSBpbi1mbGlnaHRcbiAqIGxlYWsgZ3VhcmQpIHNvIHdlIGNvdmVyIGJvdGggdGhlIHRyYWNrZXIgYW5kIGl0cyBpbnRlZ3JhdGlvbiB3aXRoIHRoZVxuICogc2lkZS1lZmZlY3QgZGlzcGF0Y2ggaW4gb25lIHBsYWNlLlxuICovXG5zdWl0ZSgnQWdlbnRTaWRlRWZmZWN0cyBcdTIwMTQgdG9vbCBjYWxsIHRlbGVtZXRyeScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXHRsZXQgYWdlbnQ6IE1vY2tBZ2VudDtcblx0bGV0IHNpZGVFZmZlY3RzOiBBZ2VudFNpZGVFZmZlY3RzO1xuXHRsZXQgdGVsZW1ldHJ5OiBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlO1xuXG5cdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpO1xuXHRjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cblx0ZnVuY3Rpb24gc2V0dXBTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uS2V5LFxuXHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdH0pO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uS2V5LCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5IH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RhcnRUdXJuKHR1cm5JZDogc3RyaW5nLCB0ZXh0ID0gJ2hlbGxvJywgbW9kZWxJZD86IHN0cmluZywgY2xpZW50Q29udGV4dD86IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0KTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBtb2RlbDogbW9kZWxJZCA/IHsgaWQ6IG1vZGVsSWQgfSA6IHVuZGVmaW5lZCB9LFxuXHRcdH07XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uLCAndGVzdCcsIGNsaWVudENvbnRleHQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlyZShhY3Rpb246IENoYXRBY3Rpb24pOiB2b2lkIHtcblx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbiB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvb2xTdGFydCh0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCBjb250cmlidXRvcj86IFRvb2xDYWxsQ29udHJpYnV0b3IpOiB2b2lkIHtcblx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkLCB0b29sQ2FsbElkLCB0b29sTmFtZSwgZGlzcGxheU5hbWU6IHRvb2xOYW1lLCBjb250cmlidXRvciB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvb2xDb21wbGV0ZSh0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCByZXN1bHQ6IFRvb2xDYWxsUmVzdWx0KTogdm9pZCB7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZCwgdG9vbENhbGxJZCwgcmVzdWx0IH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gY29tcGxldGVUdXJuKHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkLCBkdXJhdGlvbjogMTAwMCB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvb2xFdmVudHMoKTogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfVtdIHtcblx0XHRyZXR1cm4gdGVsZW1ldHJ5LmV2ZW50c1xuXHRcdFx0LmZpbHRlcihlID0+IGUuZXZlbnROYW1lID09PSAnbGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkJylcblx0XHRcdC5tYXAoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBlLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXZlbnROYW1lOiBlLmV2ZW50TmFtZSxcblx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHQuLi5kYXRhLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvblRpbWVNczogZGF0YS5pbnZvY2F0aW9uVGltZU1zID09PSB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0OiB0eXBlb2YgZGF0YS5pbnZvY2F0aW9uVGltZU1zID09PSAnbnVtYmVyJyAmJiBkYXRhLmludm9jYXRpb25UaW1lTXMgPj0gMCxcblx0XHRcdFx0XHRcdG1vZGVsOiBkYXRhLm1vZGVsIGluc3RhbmNlb2YgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlID8geyB0cnVzdGVkOiB0cnVlLCB2YWx1ZTogZGF0YS5tb2RlbC52YWx1ZSB9IDogZGF0YS5tb2RlbCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzdGFsbGVkRXZlbnRzKCk6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSB7XG5cdFx0cmV0dXJuIHRlbGVtZXRyeS5ldmVudHNcblx0XHRcdC5maWx0ZXIoZSA9PiBlLmV2ZW50TmFtZSA9PT0gJ2FnZW50SG9zdC50b29sQ2FsbFN0YWxsZWQnKVxuXHRcdFx0Lm1hcChlID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGUuZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRldmVudE5hbWU6IGUuZXZlbnROYW1lLFxuXHRcdFx0XHRcdGRhdGE6IHsgLi4uZGF0YSwgc3RhbGxlZFRpbWVNczogdHlwZW9mIGRhdGEuc3RhbGxlZFRpbWVNcyA9PT0gJ251bWJlcicgJiYgZGF0YS5zdGFsbGVkVGltZU1zID49IDAgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RhbGxlZENvbXBsZXRpb25FdmVudHMoKTogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfVtdIHtcblx0XHRyZXR1cm4gdGVsZW1ldHJ5LmV2ZW50c1xuXHRcdFx0LmZpbHRlcihlID0+IGUuZXZlbnROYW1lID09PSAnYWdlbnRIb3N0LnN0YWxsZWRUb29sQ2FsbENvbXBsZXRlZCcpXG5cdFx0XHQubWFwKGUgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gZS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV2ZW50TmFtZTogZS5ldmVudE5hbWUsXG5cdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0Li4uZGF0YSxcblx0XHRcdFx0XHRcdHRvdGFsVGltZU1zOiB0eXBlb2YgZGF0YS50b3RhbFRpbWVNcyA9PT0gJ251bWJlcicgJiYgZGF0YS50b3RhbFRpbWVNcyA+PSAwLFxuXHRcdFx0XHRcdFx0dGltZUFmdGVyU3RhbGxNczogdHlwZW9mIGRhdGEudGltZUFmdGVyU3RhbGxNcyA9PT0gJ251bWJlcicgJiYgZGF0YS50aW1lQWZ0ZXJTdGFsbE1zID49IDAsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0c3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBhZ2VudExpc3QgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50W10+KCdhZ2VudHMnLCBbYWdlbnRdKTtcblx0XHR0ZWxlbWV0cnkgPSBuZXcgQ2FwdHVyaW5nVGVsZW1ldHJ5U2VydmljZSgpO1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSh0ZWxlbWV0cnkpKTtcblx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRpbml0aWFsaXplU2Vzc2lvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0Z2V0V29ya2luZ0RpcmVjdG9yeVN0YXRlOiAoKSA9PiAoeyBraW5kOiAnd29ya3NwYWNlbGVzcycgfSksXG5cdFx0XHRyZXNvbHZlOiAoKSA9PiAoeyBraW5kOiAncmVzb2x2ZWQnLCBlbmFibGVtZW50OiBbXSwgZW5hYmxlZDogdHJ1ZSwgd29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnd29ya3NwYWNlbGVzcycgfSB9KSxcblx0XHRcdGFwcGx5Q2xpZW50R2xvYmFsRW5hYmxlbWVudDogKCkgPT4gKHsga2luZDogJ3Jlc29sdmVkJywgZW5hYmxlbWVudDogW10sIGVuYWJsZWQ6IHRydWUsIHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ3dvcmtzcGFjZWxlc3MnIH0gfSksXG5cdFx0XHRyZXBsYWNlRW5hYmxlbWVudDogKCkgPT4gKHsga2luZDogJ3Jlc29sdmVkJywgZW5hYmxlbWVudDogW10sIGVuYWJsZWQ6IHRydWUsIHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ3dvcmtzcGFjZWxlc3MnIH0gfSksXG5cdFx0XHRzZXRFbmFibGVtZW50OiAoKSA9PiAoeyBraW5kOiAncmVzb2x2ZWQnLCBlbmFibGVtZW50OiBbXSwgZW5hYmxlZDogdHJ1ZSwgd29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnd29ya3NwYWNlbGVzcycgfSB9KSxcblx0XHRcdHdoZW5JZGxlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlXSxcblx0XHRcdFtJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnU2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UsIG5ldyBGYWtlQ2hhbmdlc2V0U2VydmljZSgpXSxcblx0XHRcdFtJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFXSxcblx0XHRcdFtJVGVsZW1ldHJ5U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCkpXSxcblx0XHRcdFtJU2Vzc2lvbkRhdGFTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2VdLFxuXHRcdCksIC8qc3RyaWN0Ki8gdHJ1ZSkpO1xuXHRcdHNpZGVFZmZlY3RzID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2lkZUVmZmVjdHMsIHN0YXRlTWFuYWdlciwgY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLCB7XG5cdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdHNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdGxvY2FsVHVybnM6IG5ldyBBZ2VudEhvc3RMb2NhbFR1cm5zKHNlc3Npb25EYXRhU2VydmljZSwgbG9nU2VydmljZSksXG5cdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1pdHMgYSBzdWNjZXNzZnVsIGFnZW50LWhvc3QgdG9vbCBpbnZvY2F0aW9uJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy0xJywgJ2Jhc2gnKTtcblx0XHRmaXJlKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdydW4nLFxuXHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0fSk7XG5cdFx0dG9vbENvbXBsZXRlKCd0dXJuLTEnLCAndGMtMScsIHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ3JhbicgfSk7XG5cdFx0Y29tcGxldGVUdXJuKCd0dXJuLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbEV2ZW50cygpLCBbe1xuXHRcdFx0ZXZlbnROYW1lOiAnbGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkJyxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IHNlc3Npb25LZXksXG5cdFx0XHRcdHRvb2xJZDogJ2Jhc2gnLFxuXHRcdFx0XHR0b29sRXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6ICdhZ2VudEhvc3QnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdGludm9jYXRpb25UaW1lTXM6IHRydWUsXG5cdFx0XHRcdHJlc3VsdFNpemVJbkNoYXJhY3RlcnM6IDQxLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dHJpYnV0ZXMgdG9vbCB0ZWxlbWV0cnkgdG8gdGhlIGluaXRpYXRpbmcgdHVybiBjbGllbnQnLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0Y29uc3QgY2xpZW50Q29udGV4dDogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgPSB7XG5cdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyxcblx0XHRcdGNvbm5lY3Rpb25LaW5kOiBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZC5SZW1vdGVFeHRlbnNpb25Ib3N0LFxuXHRcdFx0dHJhbnNwb3J0S2luZDogQWdlbnRIb3N0VHJhbnNwb3J0S2luZC5NZXNzYWdlUG9ydCxcblx0XHRcdGhvc3RMYXVuY2hLaW5kOiBBZ2VudEhvc3RMYXVuY2hLaW5kLlZTQ29kZU1haW5Qcm9jZXNzLFxuXHRcdFx0bWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0ZGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0fTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tY2xpZW50JywgJ2hlbGxvJywgJ21vZGVsLWEnLCBjbGllbnRDb250ZXh0KTtcblx0XHR0b29sU3RhcnQoJ3R1cm4tY2xpZW50JywgJ3Rvb2wtY2xpZW50JywgJ2dyZXAnKTtcblx0XHR0b29sQ29tcGxldGUoJ3R1cm4tY2xpZW50JywgJ3Rvb2wtY2xpZW50JywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnc2VhcmNoZWQnIH0pO1xuXHRcdGNvbXBsZXRlVHVybigndHVybi1jbGllbnQnKTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gdG9vbEV2ZW50cygpWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogZXZlbnQuZGF0YS5pbml0aWF0b3JDbGllbnRUeXBlLFxuXHRcdFx0aW5pdGlhdG9yQ29ubmVjdGlvbktpbmQ6IGV2ZW50LmRhdGEuaW5pdGlhdG9yQ29ubmVjdGlvbktpbmQsXG5cdFx0XHRpbml0aWF0b3JUcmFuc3BvcnRLaW5kOiBldmVudC5kYXRhLmluaXRpYXRvclRyYW5zcG9ydEtpbmQsXG5cdFx0XHRob3N0TGF1bmNoS2luZDogZXZlbnQuZGF0YS5ob3N0TGF1bmNoS2luZCxcblx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogZXZlbnQuZGF0YS5pbml0aWF0b3JNYWNoaW5lSWQsXG5cdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogZXZlbnQuZGF0YS5pbml0aWF0b3JEZXZEZXZpY2VJZCxcblx0XHR9LCB7XG5cdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnZWRpdG9yX3dpbmRvdycsXG5cdFx0XHRpbml0aWF0b3JDb25uZWN0aW9uS2luZDogJ3JlbW90ZV9leHRlbnNpb25faG9zdCcsXG5cdFx0XHRpbml0aWF0b3JUcmFuc3BvcnRLaW5kOiAnbWVzc2FnZV9wb3J0Jyxcblx0XHRcdGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX21haW5fcHJvY2VzcycsXG5cdFx0XHRpbml0aWF0b3JNYWNoaW5lSWQ6ICdjbGllbnQtbWFjaGluZS1pZCcsXG5cdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgdXNlckNhbmNlbGxlZCB3aXRoIG1jcCBzb3VyY2Uga2luZCBmb3IgYSBkZW5pZWQgbWNwIHRvb2wnLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLW1jcCcsICdsb29rdXAnLCB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkOiAnYzEnIH0pO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLW1jcCcsIHsgc3VjY2VzczogZmFsc2UsIHBhc3RUZW5zZU1lc3NhZ2U6ICdkZW5pZWQnLCBlcnJvcjogeyBtZXNzYWdlOiAnZGVuaWVkJywgY29kZTogJ2RlbmllZCcgfSB9KTtcblx0XHRjb21wbGV0ZVR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29sRXZlbnRzKCksIFt7XG5cdFx0XHRldmVudE5hbWU6ICdsYW5ndWFnZU1vZGVsVG9vbEludm9rZWQnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRyZXN1bHQ6ICd1c2VyQ2FuY2VsbGVkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25JZDogc2Vzc2lvbktleSxcblx0XHRcdFx0dG9vbElkOiAnbG9va3VwJyxcblx0XHRcdFx0dG9vbEV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xTb3VyY2VLaW5kOiAnbWNwJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW1jcCcsXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdGludm9jYXRpb25UaW1lTXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzdWx0U2l6ZUluQ2hhcmFjdGVyczogOTAsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdG1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgY2xpZW50IHNvdXJjZSBraW5kIGZvciBhIGNsaWVudC1jb250cmlidXRlZCB0b29sJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1jbGllbnQnLCAncnVuX3Rlc3RzJywgeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0pO1xuXHRcdGZpcmUoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtY2xpZW50Jyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAncnVuIHRlc3RzJyxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0pO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLWNsaWVudCcsIHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ3JhbiB0ZXN0cycgfSk7XG5cdFx0Y29tcGxldGVUdXJuKCd0dXJuLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbEV2ZW50cygpLCBbe1xuXHRcdFx0ZXZlbnROYW1lOiAnbGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkJyxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IHNlc3Npb25LZXksXG5cdFx0XHRcdHRvb2xJZDogJ3J1bl90ZXN0cycsXG5cdFx0XHRcdHRvb2xFeHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sU291cmNlS2luZDogJ2NsaWVudCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQnLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uVGltZU1zOiB0cnVlLFxuXHRcdFx0XHRyZXN1bHRTaXplSW5DaGFyYWN0ZXJzOiA0Nyxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSByZXNvbHZlZCB1c2FnZSBtb2RlbCBmb3IgYW4gaW4tZmxpZ2h0IHRvb2wgY2FsbCcsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRhZ2VudC5zZXRNb2RlbHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ21vY2snLCBpZDogJ2F1dG8nLCBuYW1lOiAnQXV0bycsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9LFxuXHRcdFx0eyBwcm92aWRlcjogJ21vY2snLCBpZDogJ2dwdC01LjUnLCBuYW1lOiAnR1BUIDUuNScsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9LFxuXHRcdF0pO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJywgJ2hlbGxvJywgJ2F1dG8nKTtcblxuXHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLW1vZGVsJywgJ3JlYWRfZmlsZScpO1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSwgdHVybklkOiAndHVybi0xJywgdXNhZ2U6IHsgbW9kZWw6ICdncHQtNS41JyB9IH0pO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLW1vZGVsJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmVhZCBmaWxlJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbEV2ZW50cygpWzBdLmRhdGEsIHtcblx0XHRcdHJlc3VsdDogJ3N1Y2Nlc3MnLFxuXHRcdFx0Y2hhdFNlc3Npb25JZDogc2Vzc2lvbktleSxcblx0XHRcdHRvb2xJZDogJ3JlYWRfZmlsZScsXG5cdFx0XHR0b29sRXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHRvb2xTb3VyY2VLaW5kOiAnYWdlbnRIb3N0Jyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tb2RlbCcsXG5cdFx0XHRpbnZvY2F0aW9uVGltZU1zOiB1bmRlZmluZWQsXG5cdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0cmVzdWx0U2l6ZUluQ2hhcmFjdGVyczogNDcsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0bW9kZWw6IHsgdHJ1c3RlZDogdHJ1ZSwgdmFsdWU6ICdncHQtNS41JyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGEgcmVzb2x2ZWQgdXNhZ2UgbW9kZWwgcmVjZWl2ZWQgYmVmb3JlIHRoZSB0b29sIGNhbGwgc3RhcnRzJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdGFnZW50LnNldE1vZGVscyhbeyBwcm92aWRlcjogJ21vY2snLCBpZDogJ2dwdC01LjUnLCBuYW1lOiAnR1BUIDUuNScsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9XSk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSwgdHVybklkOiAndHVybi0xJywgdXNhZ2U6IHsgbW9kZWw6ICdncHQtNS41JyB9IH0pO1xuXHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLW1vZGVsJywgJ3JlYWRfZmlsZScpO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLW1vZGVsJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmVhZCBmaWxlJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbEV2ZW50cygpWzBdLmRhdGEubW9kZWwsIHsgdHJ1c3RlZDogdHJ1ZSwgdmFsdWU6ICdncHQtNS41JyB9KTtcblx0fSk7XG5cblx0dGVzdCgnd2FpdHMgZm9yIGEgcmVzb2x2ZWQgdXNhZ2UgbW9kZWwgcmVjZWl2ZWQgYWZ0ZXIgdG9vbCBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdGFnZW50LnNldE1vZGVscyhbeyBwcm92aWRlcjogJ21vY2snLCBpZDogJ2NsYXVkZS1zb25uZXQnLCBuYW1lOiAnQ2xhdWRlIFNvbm5ldCcsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9XSk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLW1vZGVsJywgJ3JlYWRfZmlsZScpO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLW1vZGVsJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmVhZCBmaWxlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbEV2ZW50cygpLmxlbmd0aCwgMCk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLCB0dXJuSWQ6ICd0dXJuLTEnLCB1c2FnZTogeyBtb2RlbDogJ2NsYXVkZS1zb25uZXQnIH0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xFdmVudHMoKVswXS5kYXRhLm1vZGVsLCB7IHRydXN0ZWQ6IHRydWUsIHZhbHVlOiAnY2xhdWRlLXNvbm5ldCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIHJlc3VsdCBjb250ZW50IGluIHRoZSBzZXJpYWxpemVkIHJlc3VsdCBzaXplJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1yZWFkJywgJ3JlYWRfZmlsZScpO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLXJlYWQnLCB7XG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ3JlYWQgZmlsZXMnLFxuXHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdhbHBoYVxcbmJldGEnIH1dLFxuXHRcdH0pO1xuXHRcdGNvbXBsZXRlVHVybigndHVybi0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xFdmVudHMoKVswXS5kYXRhLnJlc3VsdFNpemVJbkNoYXJhY3RlcnMsIDk3KTtcblx0fSk7XG5cblx0dGVzdCgnb25seSBhY2NlcHRzIGNvbnRyaWJ1dG9yIHJlZmluZW1lbnRzIHRoYXQgcHJlc2VydmUgZXhlY3V0aW9uIG93bmVyc2hpcCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0dG9vbFN0YXJ0KCd0dXJuLTEnLCAndGMtbWNwLXJlYWR5JywgJ2xvb2t1cCcpO1xuXHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLFxuXHRcdFx0Y2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW1jcC1yZWFkeScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnbG9va3VwJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdMb29rdXAnLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ21jcC0xJyB9LFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0xvb2tpbmcgdXAgbWV0YWRhdGEnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7fScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLWxhdGUtY2xpZW50JywgJ3J1bl90ZXN0cycpO1xuXHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLFxuXHRcdFx0Y2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWxhdGUtY2xpZW50Jyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5fdGVzdHMnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUZXN0cycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtMScgfSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3RzJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLW1jcC1yZWFkeScsIHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ2xvb2tlZCB1cCBtZXRhZGF0YScgfSk7XG5cdFx0dG9vbENvbXBsZXRlKCd0dXJuLTEnLCAndGMtbGF0ZS1jbGllbnQnLCB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdyYW4gdGVzdHMnIH0pO1xuXHRcdGNvbXBsZXRlVHVybigndHVybi0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xFdmVudHMoKS5tYXAoZXZlbnQgPT4gZXZlbnQuZGF0YS50b29sU291cmNlS2luZCksIFsnbWNwJywgJ2FnZW50SG9zdCddKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgcGVuZGluZyBjb25maXJtYXRpb24gdGltZSBmcm9tIGludm9jYXRpb24gdGltaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0dG9vbFN0YXJ0KCd0dXJuLTEnLCAndGMtY29uZmlybS10aW1pbmcnLCAnd3JpdGUnKTtcblx0XHRcdGZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY29uZmlybS10aW1pbmcnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwXzAwMCk7XG5cblx0XHRcdGNvbnN0IGNvbmZpcm1lZDogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jb25maXJtLXRpbWluZycsXG5cdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBjb25maXJtZWQsIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAyIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBjb25maXJtZWQpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgyNSk7XG5cdFx0XHR0b29sQ29tcGxldGUoJ3R1cm4tMScsICd0Yy1jb25maXJtLXRpbWluZycsIHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ3dyb3RlIGZpbGUnIH0pO1xuXHRcdFx0Y29tcGxldGVUdXJuKCd0dXJuLTEnKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gdGVsZW1ldHJ5LmV2ZW50cy5maW5kKGV2ZW50ID0+IGV2ZW50LmV2ZW50TmFtZSA9PT0gJ2xhbmd1YWdlTW9kZWxUb29sSW52b2tlZCcpO1xuXHRcdGNvbnN0IGludm9jYXRpb25UaW1lTXMgPSAoZXZlbnQ/LmRhdGEgYXMgeyBpbnZvY2F0aW9uVGltZU1zPzogbnVtYmVyIH0gfCB1bmRlZmluZWQpPy5pbnZvY2F0aW9uVGltZU1zO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNNZWFzdXJlZDogdHlwZW9mIGludm9jYXRpb25UaW1lTXMgPT09ICdudW1iZXInLFxuXHRcdFx0ZXhjbHVkZXNDb25maXJtYXRpb25EZWxheTogdHlwZW9mIGludm9jYXRpb25UaW1lTXMgPT09ICdudW1iZXInICYmIGludm9jYXRpb25UaW1lTXMgPCAxMDAwLFxuXHRcdH0sIHtcblx0XHRcdGlzTWVhc3VyZWQ6IHRydWUsXG5cdFx0XHRleGNsdWRlc0NvbmZpcm1hdGlvbkRlbGF5OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBlcnJvciBmb3IgYSBmYWlsdXJlIHdpdGhvdXQgYSBjYW5jZWxsYXRpb24gY29kZScsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0dG9vbFN0YXJ0KCd0dXJuLTEnLCAndGMtZXJyJywgJ2Jhc2gnKTtcblx0XHR0b29sQ29tcGxldGUoJ3R1cm4tMScsICd0Yy1lcnInLCB7IHN1Y2Nlc3M6IGZhbHNlLCBwYXN0VGVuc2VNZXNzYWdlOiAnYm9vbScsIGVycm9yOiB7IG1lc3NhZ2U6ICdib29tJyB9IH0pO1xuXHRcdGNvbXBsZXRlVHVybigndHVybi0xJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbEV2ZW50cygpWzBdLmRhdGEucmVzdWx0LCAnZXJyb3InKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgYSBzaW5nbGUgZXZlbnQgd2hlbiBhIHRvb2wgY29tcGxldGlvbiBpcyBkdXBsaWNhdGVkJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1kdXAnLCAnYmFzaCcpO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLWR1cCcsIHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ3JhbicgfSk7XG5cdFx0dG9vbENvbXBsZXRlKCd0dXJuLTEnLCAndGMtZHVwJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuJyB9KTtcblx0XHRjb21wbGV0ZVR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xFdmVudHMoKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBhbiBpbi1mbGlnaHQgdG9vbCBjYWxsIHdoZW4gdGhlIHR1cm4gaXMgY2FuY2VsbGVkIGJlZm9yZSBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1pbmZsaWdodCcsICdiYXNoJyk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXHRcdC8vIEEgbGF0ZSBjb21wbGV0aW9uIGFmdGVyIHRoZSB0dXJuIGVuZGVkIG11c3Qgbm90IGVtaXQ6IHRoZSBzdGFydCBlbnRyeVxuXHRcdC8vIHdhcyBjbGVhcmVkLCBzbyB0aGVyZSBpcyBubyB0aW1pbmcgdG8gcmVwb3J0LlxuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLWluZmxpZ2h0JywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sRXZlbnRzKCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgb25jZSB3aGVuIGEgdG9vbCBjb25maXJtYXRpb24gcmVtYWlucyBibG9ja2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1jb25maXJtJywgJ3dyaXRlJyk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNvbmZpcm0nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0fSk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNvbmZpcm0nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoNSAqIDYwICogMTAwMCk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YWxsZWRFdmVudHMoKSwgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2FnZW50SG9zdC50b29sQ2FsbFN0YWxsZWQnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0YmxvY2tlcktpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDb25maXJtYXRpb24sXG5cdFx0XHRcdHRvb2xJZDogJ3dyaXRlJyxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6ICdhZ2VudEhvc3QnLFxuXHRcdFx0XHRzdGFsbGVkVGltZU1zOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIGNvbmZpcm1hdGlvbiB0cmFja2luZyB3aXRoIGNsaWVudCBleGVjdXRpb24gdHJhY2tpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLWNsaWVudC1zdGFsbCcsICdydW5fdGVzdHMnLCB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtMScgfSk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNsaWVudC1zdGFsbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIHRlc3RzJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gdGVzdHMnLFxuXHRcdFx0fSk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQtc3RhbGwnLFxuXHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoNSAqIDYwICogMTAwMCk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YWxsZWRFdmVudHMoKS5tYXAoZSA9PiBlLmRhdGEuYmxvY2tlcktpbmQpLCBbU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENsaWVudEV4ZWN1dGlvbl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBlbWl0IGFmdGVyIGEgY2xpZW50IHRvb2wgY29tcGxldGVzIG9yIGl0cyB0dXJuIGlzIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0dG9vbFN0YXJ0KCd0dXJuLTEnLCAndGMtY29tcGxldGUnLCAncnVuX3Rlc3RzJywgeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0pO1xuXHRcdFx0ZmlyZSh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jb21wbGV0ZScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIHRlc3RzJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLWNvbXBsZXRlJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuIHRlc3RzJyB9KTtcblxuXHRcdFx0dG9vbFN0YXJ0KCd0dXJuLTEnLCAndGMtY2FuY2VsJywgJ3dyaXRlJyk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNhbmNlbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgZmlsZScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgZmlsZScsXG5cdFx0XHR9KTtcblx0XHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9KTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCg1ICogNjAgKiAxMDAwKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhbGxlZEV2ZW50cygpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGFsbGVkQ29tcGxldGlvbkV2ZW50cygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIHdoZW4gYSBzdGFsbGVkIGNsaWVudCB0b29sIGxhdGVyIGNvbXBsZXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0dG9vbFN0YXJ0KCd0dXJuLTEnLCAndGMtcmVjb3ZlcmVkJywgJ3J1bl90ZXN0cycsIHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9KTtcblx0XHRcdGZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVjb3ZlcmVkJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gdGVzdHMnLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUgKiA2MCAqIDEwMDApO1xuXHRcdFx0dG9vbENvbXBsZXRlKCd0dXJuLTEnLCAndGMtcmVjb3ZlcmVkJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuIHRlc3RzJyB9KTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhbGxlZENvbXBsZXRpb25FdmVudHMoKSwgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2FnZW50SG9zdC5zdGFsbGVkVG9vbENhbGxDb21wbGV0ZWQnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0YmxvY2tlcktpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24sXG5cdFx0XHRcdHRvb2xJZDogJ3J1bl90ZXN0cycsXG5cdFx0XHRcdHRvb2xTb3VyY2VLaW5kOiAnY2xpZW50Jyxcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdHRvdGFsVGltZU1zOiB0cnVlLFxuXHRcdFx0XHR0aW1lQWZ0ZXJTdGFsbE1zOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsK0JBQStCLHFCQUFxQiw4QkFBcUU7QUFDbEksU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQkFBbUM7QUFDNUMsU0FBUyxxQkFBcUIsYUFBYSxlQUFlLDRCQUE0Qix5QkFBeUIsZ0JBQWdCLDZCQUE0RTtBQUMzTSxTQUFTLDZCQUE2QiwrQkFBK0I7QUFDckUsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywyQkFBMkIsa0NBQWtDO0FBQ3RFLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0NBQW9DO0FBRTdDLE1BQU0scUJBQTJEO0FBQUEsRUFFaEUsMkJBQWlDO0FBQUEsRUFBRTtBQUFBLEVBQ25DLHlCQUErQjtBQUFBLEVBQUU7QUFBQSxFQUNqQyxpQ0FBMEQ7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFDdkUsaUNBQXVDO0FBQUEsRUFBRTtBQUFBLEVBQ3pDLG1DQUE0RDtBQUFFLFdBQU8sQ0FBQztB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
