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
import { getTelemetryChatSessionId } from "../../common/agentTelemetryCorrelation.js";
import { AgentSession } from "../../common/agent.js";
import { SessionInputRequestKind } from "../../common/state/protocol/state.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildDefaultChatUri, ChatInputQuestionKind, MessageKind, ResponsePartKind, SessionStatus, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallContributorKind } from "../../common/state/sessionState.js";
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from "../../common/agentHostCheckpointService.js";
import { IAgentHostTerminalManager } from "../../node/agentHostTerminalManager.js";
import { AgentHostLocalTurns } from "../../node/agentHostLocalTurns.js";
import { AgentHostTelemetryService } from "../../node/agentHostTelemetryService.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { IAgentHostChangesetService } from "../../common/agentHostChangesetService.js";
import { AgentSideEffects } from "../../node/agentSideEffects.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { TURN_ACTIVITY_NONE, TURN_HANG_THRESHOLD_MS } from "../../node/agentHostTurnTracker.js";
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
suite("AgentSideEffects \u2014 turn hang telemetry", () => {
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
  function startTurn(turnId) {
    const action = {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    };
    stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
    sideEffects.handleAction(defaultChatUri, action);
  }
  function fire(action) {
    agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action });
  }
  function responsePart(turnId) {
    fire({ type: ActionType.ChatResponsePart, turnId, part: { kind: ResponsePartKind.Markdown, id: "p1", content: "" } });
  }
  function delta(turnId, content) {
    fire({ type: ActionType.ChatDelta, turnId, partId: "p1", content });
  }
  function hangEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.turnHung").map((e) => {
      const data = e.data;
      return {
        eventName: e.eventName,
        data: {
          ...data,
          quietTimeMs: typeof data.quietTimeMs === "number" && data.quietTimeMs >= TURN_HANG_THRESHOLD_MS,
          turnElapsedMs: typeof data.turnElapsedMs === "number" && data.turnElapsedMs >= TURN_HANG_THRESHOLD_MS
        }
      };
    });
  }
  function hangRecoveryEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.hungTurnCompleted").map((e) => {
      const data = e.data;
      return {
        eventName: e.eventName,
        data: {
          ...data,
          totalTimeMs: typeof data.totalTimeMs === "number" && data.totalTimeMs >= 0,
          timeAfterHangMs: typeof data.timeAfterHangMs === "number" && data.timeAfterHangMs >= 0
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
    const customizationEnablementService = { onDidChange: Event.None };
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
  test("reports noProgress for a turn that starts and is never heard from again", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-lost");
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents(), [{
      eventName: "agentHost.turnHung",
      data: {
        provider: "mock",
        agentSessionId: "session-1",
        chatSessionId: getTelemetryChatSessionId(defaultChatUri),
        isSubagentSession: false,
        turnId: "turn-lost",
        hangReason: "noProgress",
        isExpected: false,
        hadAnyProgress: false,
        lastActivityKind: TURN_ACTIVITY_NONE,
        blockedOn: void 0,
        toolId: void 0,
        toolSourceKind: void 0,
        inFlightToolCallCount: 0,
        quietTimeMs: true,
        turnElapsedMs: true,
        model: void 0,
        modelSelectionKind: "default",
        permissionLevel: void 0
      }
    }]);
  });
  test("reports stalledAfterProgress once a turn goes quiet after streaming", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-stalled");
      responsePart("turn-stalled");
      delta("turn-stalled", "thinking");
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      hangReason: e.data.hangReason,
      isExpected: e.data.isExpected,
      hadAnyProgress: e.data.hadAnyProgress,
      lastActivityKind: e.data.lastActivityKind
    })), [{
      hangReason: "stalledAfterProgress",
      isExpected: false,
      hadAnyProgress: true,
      lastActivityKind: "chat.delta"
    }]);
  });
  test("does not report while activity keeps arriving inside the threshold", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-busy");
      responsePart("turn-busy");
      for (let i = 0; i < 10; i++) {
        await timeout(TURN_HANG_THRESHOLD_MS - 1e3);
        delta("turn-busy", `chunk-${i}`);
      }
      fire({ type: ActionType.ChatTurnComplete, turnId: "turn-busy", duration: 1e3 });
    });
    assert.deepStrictEqual({ hangs: hangEvents(), recoveries: hangRecoveryEvents() }, { hangs: [], recoveries: [] });
  });
  test("tags a turn blocked on a tool confirmation as an expected wait on the user", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-confirm");
      fire({
        type: ActionType.ChatToolCallStart,
        turnId: "turn-confirm",
        toolCallId: "tc-confirm",
        toolName: "write",
        displayName: "write"
      });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-confirm",
        toolCallId: "tc-confirm",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      hangReason: e.data.hangReason,
      isExpected: e.data.isExpected,
      blockedOn: e.data.blockedOn,
      toolId: e.data.toolId,
      toolSourceKind: e.data.toolSourceKind,
      inFlightToolCallCount: e.data.inFlightToolCallCount
    })), [{
      hangReason: "waitingOnUser",
      isExpected: true,
      blockedOn: SessionInputRequestKind.ToolConfirmation,
      toolId: "write",
      toolSourceKind: "agentHost",
      inFlightToolCallCount: 1
    }]);
  });
  test("tags a silent long-running tool call as runningTool, then reports a real stall once it completes", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-tool");
      fire({
        type: ActionType.ChatToolCallStart,
        turnId: "turn-tool",
        toolCallId: "tc-slow",
        toolName: "bash",
        displayName: "bash"
      });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-tool",
        toolCallId: "tc-slow",
        invocationMessage: "Run build",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(TURN_HANG_THRESHOLD_MS);
      fire({ type: ActionType.ChatToolCallComplete, turnId: "turn-tool", toolCallId: "tc-slow", result: { success: true, pastTenseMessage: "built" } });
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      hangReason: e.data.hangReason,
      isExpected: e.data.isExpected,
      toolId: e.data.toolId,
      toolSourceKind: e.data.toolSourceKind,
      inFlightToolCallCount: e.data.inFlightToolCallCount
    })), [
      // The agent-host tool is named even though it never entered the
      // session input queue, which is what `toolCallStalled` cannot see.
      { hangReason: "runningTool", isExpected: true, toolId: "bash", toolSourceKind: "agentHost", inFlightToolCallCount: 1 },
      { hangReason: "stalledAfterProgress", isExpected: false, toolId: void 0, toolSourceKind: void 0, inFlightToolCallCount: 0 }
    ]);
  });
  test("reports each hang reason at most once no matter how long the turn stays quiet", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-forever");
      await timeout(10 * TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => e.data.hangReason), ["noProgress"]);
  });
  test("reports the paired recovery event when a hung turn later completes", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-recovered");
      await timeout(TURN_HANG_THRESHOLD_MS);
      fire({ type: ActionType.ChatTurnComplete, turnId: "turn-recovered", duration: 1e3 });
    });
    assert.deepStrictEqual(hangRecoveryEvents(), [{
      eventName: "agentHost.hungTurnCompleted",
      data: {
        provider: "mock",
        agentSessionId: "session-1",
        chatSessionId: getTelemetryChatSessionId(defaultChatUri),
        isSubagentSession: false,
        turnId: "turn-recovered",
        hangReason: "noProgress",
        result: "success",
        hangReportCount: 1,
        totalTimeMs: true,
        timeAfterHangMs: true
      }
    }]);
  });
  test("does not report a recovery event for a turn that never hung", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-quick");
      responsePart("turn-quick");
      delta("turn-quick", "hi");
      fire({ type: ActionType.ChatTurnComplete, turnId: "turn-quick", duration: 1e3 });
      await timeout(2 * TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual({ hangs: hangEvents(), recoveries: hangRecoveryEvents() }, { hangs: [], recoveries: [] });
  });
  test("does not report a turn that a truncation removed from the chat", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-truncated");
      const truncate = { type: ActionType.ChatTruncated };
      stateManager.dispatchClientAction(defaultChatUri, truncate, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, truncate);
      await timeout(10 * TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual({ hangs: hangEvents(), recoveries: hangRecoveryEvents() }, { hangs: [], recoveries: [] });
  });
  test("keeps watching a turn after the user answers a confirmation it had hung on", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-answered");
      fire({
        type: ActionType.ChatToolCallStart,
        turnId: "turn-answered",
        toolCallId: "tc-answered",
        toolName: "write",
        displayName: "write"
      });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-answered",
        toolCallId: "tc-answered",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      await timeout(TURN_HANG_THRESHOLD_MS);
      const confirmed = {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-answered",
        toolCallId: "tc-answered",
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      };
      stateManager.dispatchClientAction(defaultChatUri, confirmed, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, confirmed);
      fire({ type: ActionType.ChatToolCallComplete, turnId: "turn-answered", toolCallId: "tc-answered", result: { success: true, pastTenseMessage: "wrote file" } });
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({ hangReason: e.data.hangReason, isExpected: e.data.isExpected })), [
      { hangReason: "waitingOnUser", isExpected: true },
      { hangReason: "stalledAfterProgress", isExpected: false }
    ]);
  });
  test("tags a client-executed tool as runningTool, not as a wait on the user", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-client");
      fire({
        type: ActionType.ChatToolCallStart,
        turnId: "turn-client",
        toolCallId: "tc-client",
        toolName: "run_tests",
        displayName: "run_tests",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" }
      });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-client",
        toolCallId: "tc-client",
        invocationMessage: "Run tests",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      hangReason: e.data.hangReason,
      isExpected: e.data.isExpected,
      blockedOn: e.data.blockedOn,
      toolId: e.data.toolId,
      toolSourceKind: e.data.toolSourceKind,
      inFlightToolCallCount: e.data.inFlightToolCallCount
    })), [{
      hangReason: "runningTool",
      isExpected: true,
      blockedOn: void 0,
      toolId: "run_tests",
      toolSourceKind: "client",
      inFlightToolCallCount: 1
    }]);
  });
  test("names the longest-running tool when several are in flight", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-parallel");
      fire({ type: ActionType.ChatToolCallStart, turnId: "turn-parallel", toolCallId: "tc-a", toolName: "bash", displayName: "bash" });
      fire({ type: ActionType.ChatToolCallStart, turnId: "turn-parallel", toolCallId: "tc-b", toolName: "read_file", displayName: "read_file" });
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      toolId: e.data.toolId,
      inFlightToolCallCount: e.data.inFlightToolCallCount
    })), [{ toolId: "bash", inFlightToolCallCount: 2 }]);
  });
  test("refines the tool source kind when tool metadata arrives after the start", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-refined");
      fire({ type: ActionType.ChatToolCallStart, turnId: "turn-refined", toolCallId: "tc-refined", toolName: "lookup", displayName: "lookup" });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-refined",
        toolCallId: "tc-refined",
        invocationMessage: "Look up metadata",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "c1" }
      });
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      toolId: e.data.toolId,
      toolSourceKind: e.data.toolSourceKind
    })), [{ toolId: "lookup", toolSourceKind: "mcp" }]);
  });
  test("names the tool the blocker gates, not another tool that happens to be running", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-mixed");
      fire({ type: ActionType.ChatToolCallStart, turnId: "turn-mixed", toolCallId: "tc-running", toolName: "bash", displayName: "bash" });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-mixed",
        toolCallId: "tc-running",
        invocationMessage: "Run build",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      fire({ type: ActionType.ChatToolCallStart, turnId: "turn-mixed", toolCallId: "tc-gated", toolName: "write", displayName: "write" });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-mixed",
        toolCallId: "tc-gated",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      hangReason: e.data.hangReason,
      toolId: e.data.toolId,
      inFlightToolCallCount: e.data.inFlightToolCallCount
    })), [{
      hangReason: "waitingOnUser",
      toolId: "write",
      inFlightToolCallCount: 2
    }]);
  });
  test("leaves the tool unnamed when the user is reviewing a completed result", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-result");
      fire({
        type: ActionType.ChatToolCallStart,
        turnId: "turn-result",
        toolCallId: "tc-result",
        toolName: "write",
        displayName: "write"
      });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-result",
        toolCallId: "tc-result",
        invocationMessage: "Write file",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      fire({
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-result",
        toolCallId: "tc-result",
        result: { success: true, pastTenseMessage: "wrote file" },
        requiresResultConfirmation: true
      });
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      hangReason: e.data.hangReason,
      blockedOn: e.data.blockedOn,
      toolId: e.data.toolId,
      toolSourceKind: e.data.toolSourceKind,
      inFlightToolCallCount: e.data.inFlightToolCallCount
    })), [{
      hangReason: "waitingOnUser",
      blockedOn: SessionInputRequestKind.ToolConfirmation,
      toolId: void 0,
      toolSourceKind: void 0,
      inFlightToolCallCount: 0
    }]);
  });
  test("leaves the tool unnamed when the turn is blocked on an elicitation", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-elicit");
      fire({
        type: ActionType.ChatInputRequested,
        request: {
          id: "req-1",
          message: "Which environment should I deploy to?",
          questions: [{ id: "q1", kind: ChatInputQuestionKind.Text, message: "Environment" }]
        }
      });
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      hangReason: e.data.hangReason,
      blockedOn: e.data.blockedOn,
      toolId: e.data.toolId,
      toolSourceKind: e.data.toolSourceKind,
      inFlightToolCallCount: e.data.inFlightToolCallCount
    })), [{
      hangReason: "waitingOnUser",
      blockedOn: SessionInputRequestKind.ChatInput,
      toolId: void 0,
      toolSourceKind: void 0,
      inFlightToolCallCount: 0
    }]);
  });
  test("reports a real stall when the agent goes quiet after a denied confirmation", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-denied");
      fire({
        type: ActionType.ChatToolCallStart,
        turnId: "turn-denied",
        toolCallId: "tc-denied",
        toolName: "write",
        displayName: "write"
      });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-denied",
        toolCallId: "tc-denied",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      const denied = {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-denied",
        toolCallId: "tc-denied",
        approved: false,
        reason: ToolCallCancellationReason.Denied
      };
      stateManager.dispatchClientAction(defaultChatUri, denied, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, denied);
      await timeout(TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual(hangEvents().map((e) => ({
      hangReason: e.data.hangReason,
      isExpected: e.data.isExpected,
      inFlightToolCallCount: e.data.inFlightToolCallCount
    })), [{
      hangReason: "stalledAfterProgress",
      isExpected: false,
      inFlightToolCallCount: 0
    }]);
  });
  test("does not report after a turn is cancelled or its session is torn down", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-cancelled");
      fire({ type: ActionType.ChatTurnCancelled, turnId: "turn-cancelled", duration: 1e3 });
      startTurn("turn-cleared");
      sideEffects.clearChannelTelemetry(defaultChatUri);
      await timeout(10 * TURN_HANG_THRESHOLD_MS);
    });
    assert.deepStrictEqual({ hangs: hangEvents(), recoveries: hangRecoveryEvents() }, { hangs: [], recoveries: [] });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RUdXJuSGFuZ1RlbGVtZXRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3ZpcnR1YWxTY2hlZHVsaW5nL3J1bldpdGhGYWtlZFRpbWVycy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZ2V0VGVsZW1ldHJ5Q2hhdFNlc3Npb25JZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFRlbGVtZXRyeUNvcnJlbGF0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgSUFnZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdEFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBTZXNzaW9uU3RhdHVzLCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RMb2NhbFR1cm5zIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RMb2NhbFR1cm5zLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNpZGVFZmZlY3RzIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudFNpZGVFZmZlY3RzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IFRVUk5fQUNUSVZJVFlfTk9ORSwgVFVSTl9IQU5HX1RIUkVTSE9MRF9NUyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VHVyblRyYWNrZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0FnZW50IH0gZnJvbSAnLi9tb2NrQWdlbnQuanMnO1xuaW1wb3J0IHsgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4vdGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5cbmNsYXNzIEZha2VDaGFuZ2VzZXRTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKCk6IHZvaWQgeyB9XG5cdHJlc3RvcmVTdGF0aWNDaGFuZ2VzZXQoKTogdm9pZCB7IH1cblx0cGFyc2VQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKCk6IHsgc2Vzc2lvbj86IHVuZGVmaW5lZCB9IHsgcmV0dXJuIHt9OyB9XG5cdGFwcGx5UGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cygpOiB2b2lkIHsgfVxuXHRyZXN0b3JlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cygpOiB7IHNlc3Npb24/OiB1bmRlZmluZWQgfSB7IHJldHVybiB7fTsgfVxuXHRwZXJzaXN0Q2hhbmdlc1N1bW1hcnkoKTogdm9pZCB7IH1cblx0aXNTdGF0aWNDaGFuZ2VzZXRDb21wdXRlQWN0aXZlKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Z2V0TGlzdE1ldGFkYXRhS2V5cygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRjb21wdXRlTGlzdEVudHJ5Q2hhbmdlcygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRyZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KCk6IHZvaWQgeyB9XG5cdHJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KCk6IHZvaWQgeyB9XG5cdHJlZnJlc2hDaGFuZ2VzZXRDYXRhbG9nKCk6IHZvaWQgeyB9XG5cdG9uV29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZSgpOiB2b2lkIHsgfVxuXHRyZWNvbXB1dGVTdWJzY3JpYmVkQ2hhbmdlc2V0cygpOiB2b2lkIHsgfVxuXHRvblNlc3Npb25EaXNwb3NlZCgpOiB2b2lkIHsgfVxuXHRhc3luYyBjb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7IH1cblx0YXN5bmMgY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L3hgOyB9XG5cdGFzeW5jIGNvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L3lgOyB9XG5cdG9uVG9vbENhbGxFZGl0c0FwcGxpZWQoKTogdm9pZCB7IH1cblx0b25UdXJuQ29tcGxldGUoKTogdm9pZCB7IH1cblx0b25TZXNzaW9uVHJ1bmNhdGVkKCk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIENhcHR1cmluZ1RlbGVtZXRyeVNlcnZpY2UgaW1wbGVtZW50cyBJVGVsZW1ldHJ5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRyZWFkb25seSBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uJztcblx0cmVhZG9ubHkgbWFjaGluZUlkID0gJ3Rlc3QtbWFjaGluZSc7XG5cdHJlYWRvbmx5IHNxbUlkID0gJ3Rlc3Qtc3FtJztcblx0cmVhZG9ubHkgZGV2RGV2aWNlSWQgPSAndGVzdC1kZXYtZGV2aWNlJztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZSA9ICd0ZXN0LWZpcnN0LXNlc3Npb24tZGF0ZSc7XG5cdHJlYWRvbmx5IHNlbmRFcnJvclRlbGVtZXRyeSA9IGZhbHNlO1xuXHRyZWFkb25seSBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IHVua25vd24gfVtdID0gW107XG5cblx0cHVibGljTG9nKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZzIoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0fVxuXHRwdWJsaWNMb2dFcnJvcigpOiB2b2lkIHsgfVxuXHRwdWJsaWNMb2dFcnJvcjIoKTogdm9pZCB7IH1cblx0c2V0RXhwZXJpbWVudFByb3BlcnR5KCk6IHZvaWQgeyB9XG5cdHNldENvbW1vblByb3BlcnR5KCk6IHZvaWQgeyB9XG59XG5cbi8qKlxuICogSW50ZWdyYXRpb24gdGVzdHMgZm9yIHRoZSB0dXJuIGhhbmcgd2F0Y2hkb2cgb3duZWQgYnlcbiAqIHtAbGluayBBZ2VudEhvc3RUdXJuVHJhY2tlcn0sIGRyaXZlbiB0aHJvdWdoIHtAbGluayBBZ2VudFNpZGVFZmZlY3RzfSBzbyB0aGVcbiAqIGFjdGl2aXR5LCBibG9ja2VyIGFuZCB0b29sLWNhbGwgc2lnbmFscyBhcmUgZXhlcmNpc2VkIHRocm91Z2ggdGhlaXIgcmVhbFxuICogd2lyaW5nIHJhdGhlciB0aGFuIGJ5IGNhbGxpbmcgdGhlIHRyYWNrZXIgZGlyZWN0bHkuXG4gKi9cbnN1aXRlKCdBZ2VudFNpZGVFZmZlY3RzIFx1MjAxNCB0dXJuIGhhbmcgdGVsZW1ldHJ5JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdGxldCBhZ2VudDogTW9ja0FnZW50O1xuXHRsZXQgc2lkZUVmZmVjdHM6IEFnZW50U2lkZUVmZmVjdHM7XG5cdGxldCB0ZWxlbWV0cnk6IENhcHR1cmluZ1RlbGVtZXRyeVNlcnZpY2U7XG5cblx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJyk7XG5cdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRmdW5jdGlvbiBzZXR1cFNlc3Npb24oKTogdm9pZCB7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb25LZXksXG5cdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0fSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25LZXksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzdGFydFR1cm4odHVybklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9O1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cdH1cblxuXHRmdW5jdGlvbiBmaXJlKGFjdGlvbjogQ2hhdEFjdGlvbik6IHZvaWQge1xuXHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uIH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVzcG9uc2VQYXJ0KHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkLCBwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncDEnLCBjb250ZW50OiAnJyB9IH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gZGVsdGEodHVybklkOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXREZWx0YSwgdHVybklkLCBwYXJ0SWQ6ICdwMScsIGNvbnRlbnQgfSk7XG5cdH1cblxuXHQvKiogTm9ybWFsaXplcyB0aGUgbm9uLWRldGVybWluaXN0aWMgdGltaW5nIGZpZWxkcyB0byBib29sZWFucyBmb3Igc25hcHNob3R0aW5nLiAqL1xuXHRmdW5jdGlvbiBoYW5nRXZlbnRzKCk6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSB7XG5cdFx0cmV0dXJuIHRlbGVtZXRyeS5ldmVudHNcblx0XHRcdC5maWx0ZXIoZSA9PiBlLmV2ZW50TmFtZSA9PT0gJ2FnZW50SG9zdC50dXJuSHVuZycpXG5cdFx0XHQubWFwKGUgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gZS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV2ZW50TmFtZTogZS5ldmVudE5hbWUsXG5cdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0Li4uZGF0YSxcblx0XHRcdFx0XHRcdHF1aWV0VGltZU1zOiB0eXBlb2YgZGF0YS5xdWlldFRpbWVNcyA9PT0gJ251bWJlcicgJiYgZGF0YS5xdWlldFRpbWVNcyA+PSBUVVJOX0hBTkdfVEhSRVNIT0xEX01TLFxuXHRcdFx0XHRcdFx0dHVybkVsYXBzZWRNczogdHlwZW9mIGRhdGEudHVybkVsYXBzZWRNcyA9PT0gJ251bWJlcicgJiYgZGF0YS50dXJuRWxhcHNlZE1zID49IFRVUk5fSEFOR19USFJFU0hPTERfTVMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gaGFuZ1JlY292ZXJ5RXZlbnRzKCk6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSB7XG5cdFx0cmV0dXJuIHRlbGVtZXRyeS5ldmVudHNcblx0XHRcdC5maWx0ZXIoZSA9PiBlLmV2ZW50TmFtZSA9PT0gJ2FnZW50SG9zdC5odW5nVHVybkNvbXBsZXRlZCcpXG5cdFx0XHQubWFwKGUgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gZS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV2ZW50TmFtZTogZS5ldmVudE5hbWUsXG5cdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0Li4uZGF0YSxcblx0XHRcdFx0XHRcdHRvdGFsVGltZU1zOiB0eXBlb2YgZGF0YS50b3RhbFRpbWVNcyA9PT0gJ251bWJlcicgJiYgZGF0YS50b3RhbFRpbWVNcyA+PSAwLFxuXHRcdFx0XHRcdFx0dGltZUFmdGVySGFuZ01zOiB0eXBlb2YgZGF0YS50aW1lQWZ0ZXJIYW5nTXMgPT09ICdudW1iZXInICYmIGRhdGEudGltZUFmdGVySGFuZ01zID49IDAsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0c3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBhZ2VudExpc3QgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50W10+KCdhZ2VudHMnLCBbYWdlbnRdKTtcblx0XHR0ZWxlbWV0cnkgPSBuZXcgQ2FwdHVyaW5nVGVsZW1ldHJ5U2VydmljZSgpO1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSh0ZWxlbWV0cnkpKTtcblx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlID0geyBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9IGFzIElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2U7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nU2VydmljZSwgbG9nU2VydmljZV0sXG5cdFx0XHRbSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLCBuZXcgRmFrZUNoYW5nZXNldFNlcnZpY2UoKV0sXG5cdFx0XHRbSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRV0sXG5cdFx0XHRbSVRlbGVtZXRyeVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKV0sXG5cdFx0XHRbSVNlc3Npb25EYXRhU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlXSxcblx0XHQpLCAvKnN0cmljdCovIHRydWUpKTtcblx0XHRzaWRlRWZmZWN0cyA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNpZGVFZmZlY3RzLCBzdGF0ZU1hbmFnZXIsIGN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSwge1xuXHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRsb2NhbFR1cm5zOiBuZXcgQWdlbnRIb3N0TG9jYWxUdXJucyhzZXNzaW9uRGF0YVNlcnZpY2UsIGxvZ1NlcnZpY2UpLFxuXHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlcG9ydHMgbm9Qcm9ncmVzcyBmb3IgYSB0dXJuIHRoYXQgc3RhcnRzIGFuZCBpcyBuZXZlciBoZWFyZCBmcm9tIGFnYWluJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tbG9zdCcpO1xuXHRcdFx0YXdhaXQgdGltZW91dChUVVJOX0hBTkdfVEhSRVNIT0xEX01TKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaGFuZ0V2ZW50cygpLCBbe1xuXHRcdFx0ZXZlbnROYW1lOiAnYWdlbnRIb3N0LnR1cm5IdW5nJyxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0YWdlbnRTZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvbklkOiBnZXRUZWxlbWV0cnlDaGF0U2Vzc2lvbklkKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGZhbHNlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWxvc3QnLFxuXHRcdFx0XHRoYW5nUmVhc29uOiAnbm9Qcm9ncmVzcycsXG5cdFx0XHRcdGlzRXhwZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRoYWRBbnlQcm9ncmVzczogZmFsc2UsXG5cdFx0XHRcdGxhc3RBY3Rpdml0eUtpbmQ6IFRVUk5fQUNUSVZJVFlfTk9ORSxcblx0XHRcdFx0YmxvY2tlZE9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sU291cmNlS2luZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbkZsaWdodFRvb2xDYWxsQ291bnQ6IDAsXG5cdFx0XHRcdHF1aWV0VGltZU1zOiB0cnVlLFxuXHRcdFx0XHR0dXJuRWxhcHNlZE1zOiB0cnVlLFxuXHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlbFNlbGVjdGlvbktpbmQ6ICdkZWZhdWx0Jyxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBzdGFsbGVkQWZ0ZXJQcm9ncmVzcyBvbmNlIGEgdHVybiBnb2VzIHF1aWV0IGFmdGVyIHN0cmVhbWluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLXN0YWxsZWQnKTtcblx0XHRcdHJlc3BvbnNlUGFydCgndHVybi1zdGFsbGVkJyk7XG5cdFx0XHRkZWx0YSgndHVybi1zdGFsbGVkJywgJ3RoaW5raW5nJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KFRVUk5fSEFOR19USFJFU0hPTERfTVMpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYW5nRXZlbnRzKCkubWFwKGUgPT4gKHtcblx0XHRcdGhhbmdSZWFzb246IGUuZGF0YS5oYW5nUmVhc29uLFxuXHRcdFx0aXNFeHBlY3RlZDogZS5kYXRhLmlzRXhwZWN0ZWQsXG5cdFx0XHRoYWRBbnlQcm9ncmVzczogZS5kYXRhLmhhZEFueVByb2dyZXNzLFxuXHRcdFx0bGFzdEFjdGl2aXR5S2luZDogZS5kYXRhLmxhc3RBY3Rpdml0eUtpbmQsXG5cdFx0fSkpLCBbe1xuXHRcdFx0aGFuZ1JlYXNvbjogJ3N0YWxsZWRBZnRlclByb2dyZXNzJyxcblx0XHRcdGlzRXhwZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0aGFkQW55UHJvZ3Jlc3M6IHRydWUsXG5cdFx0XHRsYXN0QWN0aXZpdHlLaW5kOiAnY2hhdC5kZWx0YScsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXBvcnQgd2hpbGUgYWN0aXZpdHkga2VlcHMgYXJyaXZpbmcgaW5zaWRlIHRoZSB0aHJlc2hvbGQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi1idXN5Jyk7XG5cdFx0XHRyZXNwb25zZVBhcnQoJ3R1cm4tYnVzeScpO1xuXHRcdFx0Ly8gVGVuIHdpbmRvd3MnIHdvcnRoIG9mIGVsYXBzZWQgdGltZSwgYnV0IG5ldmVyIGEgZnVsbCBxdWlldCB3aW5kb3cuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dChUVVJOX0hBTkdfVEhSRVNIT0xEX01TIC0gMTAwMCk7XG5cdFx0XHRcdGRlbHRhKCd0dXJuLWJ1c3knLCBgY2h1bmstJHtpfWApO1xuXHRcdFx0fVxuXHRcdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi1idXN5JywgZHVyYXRpb246IDEwMDAgfSk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFuZ3M6IGhhbmdFdmVudHMoKSwgcmVjb3ZlcmllczogaGFuZ1JlY292ZXJ5RXZlbnRzKCkgfSwgeyBoYW5nczogW10sIHJlY292ZXJpZXM6IFtdIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0YWdzIGEgdHVybiBibG9ja2VkIG9uIGEgdG9vbCBjb25maXJtYXRpb24gYXMgYW4gZXhwZWN0ZWQgd2FpdCBvbiB0aGUgdXNlcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLWNvbmZpcm0nKTtcblx0XHRcdGZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWNvbmZpcm0nLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY29uZmlybScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnd3JpdGUnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ3dyaXRlJyxcblx0XHRcdH0pO1xuXHRcdFx0ZmlyZSh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tY29uZmlybScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jb25maXJtJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSBmaWxlJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdXcml0ZSBmaWxlJyxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dChUVVJOX0hBTkdfVEhSRVNIT0xEX01TKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaGFuZ0V2ZW50cygpLm1hcChlID0+ICh7XG5cdFx0XHRoYW5nUmVhc29uOiBlLmRhdGEuaGFuZ1JlYXNvbixcblx0XHRcdGlzRXhwZWN0ZWQ6IGUuZGF0YS5pc0V4cGVjdGVkLFxuXHRcdFx0YmxvY2tlZE9uOiBlLmRhdGEuYmxvY2tlZE9uLFxuXHRcdFx0dG9vbElkOiBlLmRhdGEudG9vbElkLFxuXHRcdFx0dG9vbFNvdXJjZUtpbmQ6IGUuZGF0YS50b29sU291cmNlS2luZCxcblx0XHRcdGluRmxpZ2h0VG9vbENhbGxDb3VudDogZS5kYXRhLmluRmxpZ2h0VG9vbENhbGxDb3VudCxcblx0XHR9KSksIFt7XG5cdFx0XHRoYW5nUmVhc29uOiAnd2FpdGluZ09uVXNlcicsXG5cdFx0XHRpc0V4cGVjdGVkOiB0cnVlLFxuXHRcdFx0YmxvY2tlZE9uOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ29uZmlybWF0aW9uLFxuXHRcdFx0dG9vbElkOiAnd3JpdGUnLFxuXHRcdFx0dG9vbFNvdXJjZUtpbmQ6ICdhZ2VudEhvc3QnLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiAxLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndGFncyBhIHNpbGVudCBsb25nLXJ1bm5pbmcgdG9vbCBjYWxsIGFzIHJ1bm5pbmdUb29sLCB0aGVuIHJlcG9ydHMgYSByZWFsIHN0YWxsIG9uY2UgaXQgY29tcGxldGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tdG9vbCcpO1xuXHRcdFx0ZmlyZSh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tdG9vbCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zbG93Jyxcblx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdiYXNoJyxcblx0XHRcdH0pO1xuXHRcdFx0ZmlyZSh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tdG9vbCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zbG93Jyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gYnVpbGQnLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dChUVVJOX0hBTkdfVEhSRVNIT0xEX01TKTtcblxuXHRcdFx0Ly8gVGhlIHRvb2wgZmluYWxseSByZXR1cm5zLCBidXQgdGhlIGFnZW50IGxvb3AgbmV2ZXIgcGlja3MgdGhlIHR1cm5cblx0XHRcdC8vIGJhY2sgdXAgXHUyMDE0IHRoZSBzZWNvbmQgcmVwb3J0IGRpc3Rpbmd1aXNoZXMgdGhhdCBmcm9tIHRoZSBmaXJzdC5cblx0XHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLXRvb2wnLCB0b29sQ2FsbElkOiAndGMtc2xvdycsIHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnYnVpbHQnIH0gfSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KFRVUk5fSEFOR19USFJFU0hPTERfTVMpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYW5nRXZlbnRzKCkubWFwKGUgPT4gKHtcblx0XHRcdGhhbmdSZWFzb246IGUuZGF0YS5oYW5nUmVhc29uLFxuXHRcdFx0aXNFeHBlY3RlZDogZS5kYXRhLmlzRXhwZWN0ZWQsXG5cdFx0XHR0b29sSWQ6IGUuZGF0YS50b29sSWQsXG5cdFx0XHR0b29sU291cmNlS2luZDogZS5kYXRhLnRvb2xTb3VyY2VLaW5kLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiBlLmRhdGEuaW5GbGlnaHRUb29sQ2FsbENvdW50LFxuXHRcdH0pKSwgW1xuXHRcdFx0Ly8gVGhlIGFnZW50LWhvc3QgdG9vbCBpcyBuYW1lZCBldmVuIHRob3VnaCBpdCBuZXZlciBlbnRlcmVkIHRoZVxuXHRcdFx0Ly8gc2Vzc2lvbiBpbnB1dCBxdWV1ZSwgd2hpY2ggaXMgd2hhdCBgdG9vbENhbGxTdGFsbGVkYCBjYW5ub3Qgc2VlLlxuXHRcdFx0eyBoYW5nUmVhc29uOiAncnVubmluZ1Rvb2wnLCBpc0V4cGVjdGVkOiB0cnVlLCB0b29sSWQ6ICdiYXNoJywgdG9vbFNvdXJjZUtpbmQ6ICdhZ2VudEhvc3QnLCBpbkZsaWdodFRvb2xDYWxsQ291bnQ6IDEgfSxcblx0XHRcdHsgaGFuZ1JlYXNvbjogJ3N0YWxsZWRBZnRlclByb2dyZXNzJywgaXNFeHBlY3RlZDogZmFsc2UsIHRvb2xJZDogdW5kZWZpbmVkLCB0b29sU291cmNlS2luZDogdW5kZWZpbmVkLCBpbkZsaWdodFRvb2xDYWxsQ291bnQ6IDAgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBlYWNoIGhhbmcgcmVhc29uIGF0IG1vc3Qgb25jZSBubyBtYXR0ZXIgaG93IGxvbmcgdGhlIHR1cm4gc3RheXMgcXVpZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi1mb3JldmVyJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwICogVFVSTl9IQU5HX1RIUkVTSE9MRF9NUyk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmdFdmVudHMoKS5tYXAoZSA9PiBlLmRhdGEuaGFuZ1JlYXNvbiksIFsnbm9Qcm9ncmVzcyddKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyB0aGUgcGFpcmVkIHJlY292ZXJ5IGV2ZW50IHdoZW4gYSBodW5nIHR1cm4gbGF0ZXIgY29tcGxldGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tcmVjb3ZlcmVkJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KFRVUk5fSEFOR19USFJFU0hPTERfTVMpO1xuXHRcdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi1yZWNvdmVyZWQnLCBkdXJhdGlvbjogMTAwMCB9KTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaGFuZ1JlY292ZXJ5RXZlbnRzKCksIFt7XG5cdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QuaHVuZ1R1cm5Db21wbGV0ZWQnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IGdldFRlbGVtZXRyeUNoYXRTZXNzaW9uSWQoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcmVjb3ZlcmVkJyxcblx0XHRcdFx0aGFuZ1JlYXNvbjogJ25vUHJvZ3Jlc3MnLFxuXHRcdFx0XHRyZXN1bHQ6ICdzdWNjZXNzJyxcblx0XHRcdFx0aGFuZ1JlcG9ydENvdW50OiAxLFxuXHRcdFx0XHR0b3RhbFRpbWVNczogdHJ1ZSxcblx0XHRcdFx0dGltZUFmdGVySGFuZ01zOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlcG9ydCBhIHJlY292ZXJ5IGV2ZW50IGZvciBhIHR1cm4gdGhhdCBuZXZlciBodW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tcXVpY2snKTtcblx0XHRcdHJlc3BvbnNlUGFydCgndHVybi1xdWljaycpO1xuXHRcdFx0ZGVsdGEoJ3R1cm4tcXVpY2snLCAnaGknKTtcblx0XHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tcXVpY2snLCBkdXJhdGlvbjogMTAwMCB9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMiAqIFRVUk5fSEFOR19USFJFU0hPTERfTVMpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhbmdzOiBoYW5nRXZlbnRzKCksIHJlY292ZXJpZXM6IGhhbmdSZWNvdmVyeUV2ZW50cygpIH0sIHsgaGFuZ3M6IFtdLCByZWNvdmVyaWVzOiBbXSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVwb3J0IGEgdHVybiB0aGF0IGEgdHJ1bmNhdGlvbiByZW1vdmVkIGZyb20gdGhlIGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi10cnVuY2F0ZWQnKTtcblxuXHRcdFx0Ly8gT21pdHRpbmcgYHR1cm5JZGAgY2xlYXJzIGV2ZXJ5IHR1cm4gaW5jbHVkaW5nIHRoZSBhY3RpdmUgb25lLlxuXHRcdFx0Y29uc3QgdHJ1bmNhdGU6IENoYXRBY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCB9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB0cnVuY2F0ZSwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDIgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHRydW5jYXRlKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxMCAqIFRVUk5fSEFOR19USFJFU0hPTERfTVMpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhbmdzOiBoYW5nRXZlbnRzKCksIHJlY292ZXJpZXM6IGhhbmdSZWNvdmVyeUV2ZW50cygpIH0sIHsgaGFuZ3M6IFtdLCByZWNvdmVyaWVzOiBbXSB9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgd2F0Y2hpbmcgYSB0dXJuIGFmdGVyIHRoZSB1c2VyIGFuc3dlcnMgYSBjb25maXJtYXRpb24gaXQgaGFkIGh1bmcgb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi1hbnN3ZXJlZCcpO1xuXHRcdFx0ZmlyZSh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tYW5zd2VyZWQnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYW5zd2VyZWQnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3dyaXRlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICd3cml0ZScsXG5cdFx0XHR9KTtcblx0XHRcdGZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWFuc3dlcmVkJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWFuc3dlcmVkJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSBmaWxlJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdXcml0ZSBmaWxlJyxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dChUVVJOX0hBTkdfVEhSRVNIT0xEX01TKTtcblxuXHRcdFx0Y29uc3QgY29uZmlybWVkOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1hbnN3ZXJlZCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1hbnN3ZXJlZCcsXG5cdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBjb25maXJtZWQsIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAyIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBjb25maXJtZWQpO1xuXHRcdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tYW5zd2VyZWQnLCB0b29sQ2FsbElkOiAndGMtYW5zd2VyZWQnLCByZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ3dyb3RlIGZpbGUnIH0gfSk7XG5cblx0XHRcdC8vIFRoZSB0b29sIGlzIGRvbmUgYW5kIG5vdGhpbmcgaXMgYmxvY2tpbmcsIGJ1dCB0aGUgYWdlbnQgbG9vcFxuXHRcdFx0Ly8gbmV2ZXIgcGlja3MgdGhlIHR1cm4gYmFjayB1cC5cblx0XHRcdGF3YWl0IHRpbWVvdXQoVFVSTl9IQU5HX1RIUkVTSE9MRF9NUyk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmdFdmVudHMoKS5tYXAoZSA9PiAoeyBoYW5nUmVhc29uOiBlLmRhdGEuaGFuZ1JlYXNvbiwgaXNFeHBlY3RlZDogZS5kYXRhLmlzRXhwZWN0ZWQgfSkpLCBbXG5cdFx0XHR7IGhhbmdSZWFzb246ICd3YWl0aW5nT25Vc2VyJywgaXNFeHBlY3RlZDogdHJ1ZSB9LFxuXHRcdFx0eyBoYW5nUmVhc29uOiAnc3RhbGxlZEFmdGVyUHJvZ3Jlc3MnLCBpc0V4cGVjdGVkOiBmYWxzZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0YWdzIGEgY2xpZW50LWV4ZWN1dGVkIHRvb2wgYXMgcnVubmluZ1Rvb2wsIG5vdCBhcyBhIHdhaXQgb24gdGhlIHVzZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi1jbGllbnQnKTtcblx0XHRcdGZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWNsaWVudCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1bl90ZXN0cycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAncnVuX3Rlc3RzJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBDb25maXJtYXRpb24gaXMgbm90IG5lZWRlZCwgc28gdGhlIGNhbGwgZ29lcyBzdHJhaWdodCB0byBydW5uaW5nXG5cdFx0XHQvLyBhbmQgaXMgc3VyZmFjZWQgYXMgYSBgdG9vbENsaWVudEV4ZWN1dGlvbmAgaW5wdXQgcmVxdWVzdC4gVGhhdCBpc1xuXHRcdFx0Ly8gZGVsZWdhdGVkIHdvcmssIG5vdCBhIHByb21wdCBcdTIwMTQgdGhlIHR1cm4gaXMgbm90IHdhaXRpbmcgb24gYSBodW1hbi5cblx0XHRcdGZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWNsaWVudCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biB0ZXN0cycsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KFRVUk5fSEFOR19USFJFU0hPTERfTVMpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYW5nRXZlbnRzKCkubWFwKGUgPT4gKHtcblx0XHRcdGhhbmdSZWFzb246IGUuZGF0YS5oYW5nUmVhc29uLFxuXHRcdFx0aXNFeHBlY3RlZDogZS5kYXRhLmlzRXhwZWN0ZWQsXG5cdFx0XHRibG9ja2VkT246IGUuZGF0YS5ibG9ja2VkT24sXG5cdFx0XHR0b29sSWQ6IGUuZGF0YS50b29sSWQsXG5cdFx0XHR0b29sU291cmNlS2luZDogZS5kYXRhLnRvb2xTb3VyY2VLaW5kLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiBlLmRhdGEuaW5GbGlnaHRUb29sQ2FsbENvdW50LFxuXHRcdH0pKSwgW3tcblx0XHRcdGhhbmdSZWFzb246ICdydW5uaW5nVG9vbCcsXG5cdFx0XHRpc0V4cGVjdGVkOiB0cnVlLFxuXHRcdFx0YmxvY2tlZE9uOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sSWQ6ICdydW5fdGVzdHMnLFxuXHRcdFx0dG9vbFNvdXJjZUtpbmQ6ICdjbGllbnQnLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiAxLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnbmFtZXMgdGhlIGxvbmdlc3QtcnVubmluZyB0b29sIHdoZW4gc2V2ZXJhbCBhcmUgaW4gZmxpZ2h0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tcGFyYWxsZWwnKTtcblx0XHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLXBhcmFsbGVsJywgdG9vbENhbGxJZDogJ3RjLWEnLCB0b29sTmFtZTogJ2Jhc2gnLCBkaXNwbGF5TmFtZTogJ2Jhc2gnIH0pO1xuXHRcdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tcGFyYWxsZWwnLCB0b29sQ2FsbElkOiAndGMtYicsIHRvb2xOYW1lOiAncmVhZF9maWxlJywgZGlzcGxheU5hbWU6ICdyZWFkX2ZpbGUnIH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dChUVVJOX0hBTkdfVEhSRVNIT0xEX01TKTtcblx0XHR9KTtcblxuXHRcdC8vIGB0b29sSWRgIGlzIGEgYmVzdCBndWVzcyBhbW9uZyBwYXJhbGxlbCBjYWxsczsgYGluRmxpZ2h0VG9vbENhbGxDb3VudGBcblx0XHQvLyBhYm92ZSBvbmUgaXMgdGhlIHNpZ25hbCB0aGF0IGF0dHJpYnV0aW9uIGlzIGFtYmlndW91cy5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmdFdmVudHMoKS5tYXAoZSA9PiAoe1xuXHRcdFx0dG9vbElkOiBlLmRhdGEudG9vbElkLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiBlLmRhdGEuaW5GbGlnaHRUb29sQ2FsbENvdW50LFxuXHRcdH0pKSwgW3sgdG9vbElkOiAnYmFzaCcsIGluRmxpZ2h0VG9vbENhbGxDb3VudDogMiB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZmluZXMgdGhlIHRvb2wgc291cmNlIGtpbmQgd2hlbiB0b29sIG1ldGFkYXRhIGFycml2ZXMgYWZ0ZXIgdGhlIHN0YXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tcmVmaW5lZCcpO1xuXHRcdFx0Ly8gVGhlIHN0YXJ0IHNpZ25hbCBjYXJyaWVzIG5vIGNvbnRyaWJ1dG9yOyBgcmVhZHlgIHN1cHBsaWVzIGl0LlxuXHRcdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tcmVmaW5lZCcsIHRvb2xDYWxsSWQ6ICd0Yy1yZWZpbmVkJywgdG9vbE5hbWU6ICdsb29rdXAnLCBkaXNwbGF5TmFtZTogJ2xvb2t1cCcgfSk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi1yZWZpbmVkJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlZmluZWQnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0xvb2sgdXAgbWV0YWRhdGEnLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6ICdjMScgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dChUVVJOX0hBTkdfVEhSRVNIT0xEX01TKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaGFuZ0V2ZW50cygpLm1hcChlID0+ICh7XG5cdFx0XHR0b29sSWQ6IGUuZGF0YS50b29sSWQsXG5cdFx0XHR0b29sU291cmNlS2luZDogZS5kYXRhLnRvb2xTb3VyY2VLaW5kLFxuXHRcdH0pKSwgW3sgdG9vbElkOiAnbG9va3VwJywgdG9vbFNvdXJjZUtpbmQ6ICdtY3AnIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnbmFtZXMgdGhlIHRvb2wgdGhlIGJsb2NrZXIgZ2F0ZXMsIG5vdCBhbm90aGVyIHRvb2wgdGhhdCBoYXBwZW5zIHRvIGJlIHJ1bm5pbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi1taXhlZCcpO1xuXHRcdFx0Ly8gQSBsb25nLXJ1bm5pbmcgdG9vbCBzdGFydHMgZmlyc3QsIHNvIGl0IGlzIHRoZSBlYXJsaWVzdCBlbnRyeSBpblxuXHRcdFx0Ly8gdGhlIGluLWZsaWdodCBzZXQuLi5cblx0XHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLW1peGVkJywgdG9vbENhbGxJZDogJ3RjLXJ1bm5pbmcnLCB0b29sTmFtZTogJ2Jhc2gnLCBkaXNwbGF5TmFtZTogJ2Jhc2gnIH0pO1xuXHRcdFx0ZmlyZSh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tbWl4ZWQnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcnVubmluZycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIGJ1aWxkJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdC8vIC4uLmJ1dCBhIHNlY29uZCB0b29sIGlzIHdoYXQgYWN0dWFsbHkgYmxvY2tzIG9uIHRoZSB1c2VyLCBzbyB0aGF0XG5cdFx0XHQvLyBpcyB0aGUgb25lIHRoZSByZXBvcnQgbXVzdCBuYW1lLlxuXHRcdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tbWl4ZWQnLCB0b29sQ2FsbElkOiAndGMtZ2F0ZWQnLCB0b29sTmFtZTogJ3dyaXRlJywgZGlzcGxheU5hbWU6ICd3cml0ZScgfSk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi1taXhlZCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1nYXRlZCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgZmlsZScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgZmlsZScsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoVFVSTl9IQU5HX1RIUkVTSE9MRF9NUyk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmdFdmVudHMoKS5tYXAoZSA9PiAoe1xuXHRcdFx0aGFuZ1JlYXNvbjogZS5kYXRhLmhhbmdSZWFzb24sXG5cdFx0XHR0b29sSWQ6IGUuZGF0YS50b29sSWQsXG5cdFx0XHRpbkZsaWdodFRvb2xDYWxsQ291bnQ6IGUuZGF0YS5pbkZsaWdodFRvb2xDYWxsQ291bnQsXG5cdFx0fSkpLCBbe1xuXHRcdFx0aGFuZ1JlYXNvbjogJ3dhaXRpbmdPblVzZXInLFxuXHRcdFx0dG9vbElkOiAnd3JpdGUnLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiAyLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHRoZSB0b29sIHVubmFtZWQgd2hlbiB0aGUgdXNlciBpcyByZXZpZXdpbmcgYSBjb21wbGV0ZWQgcmVzdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tcmVzdWx0Jyk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi1yZXN1bHQnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVzdWx0Jyxcblx0XHRcdFx0dG9vbE5hbWU6ICd3cml0ZScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnd3JpdGUnLFxuXHRcdFx0fSk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi1yZXN1bHQnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVzdWx0Jyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSBmaWxlJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdC8vIFRoZSB0b29sIHJhbiB0byBjb21wbGV0aW9uIGFuZCBpcyBub3cgYXdhaXRpbmcgKnJlc3VsdCogcmV2aWV3LCBzb1xuXHRcdFx0Ly8gaXQgaGFzIGxlZnQgdGhlIGluLWZsaWdodCBzZXQuIFRoZSB0dXJuIHdhaXRzIG9uIHRoZSB1c2VyIHJlYWRpbmdcblx0XHRcdC8vIGEgcmVzdWx0LCBub3Qgb24gYSB0b29sIFx1MjAxNCBgdG9vbElkYCBpcyBkZWxpYmVyYXRlbHkgdW5kZWZpbmVkLlxuXHRcdFx0ZmlyZSh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcmVzdWx0Jyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlc3VsdCcsXG5cdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnd3JvdGUgZmlsZScgfSxcblx0XHRcdFx0cmVxdWlyZXNSZXN1bHRDb25maXJtYXRpb246IHRydWUsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoVFVSTl9IQU5HX1RIUkVTSE9MRF9NUyk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmdFdmVudHMoKS5tYXAoZSA9PiAoe1xuXHRcdFx0aGFuZ1JlYXNvbjogZS5kYXRhLmhhbmdSZWFzb24sXG5cdFx0XHRibG9ja2VkT246IGUuZGF0YS5ibG9ja2VkT24sXG5cdFx0XHR0b29sSWQ6IGUuZGF0YS50b29sSWQsXG5cdFx0XHR0b29sU291cmNlS2luZDogZS5kYXRhLnRvb2xTb3VyY2VLaW5kLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiBlLmRhdGEuaW5GbGlnaHRUb29sQ2FsbENvdW50LFxuXHRcdH0pKSwgW3tcblx0XHRcdGhhbmdSZWFzb246ICd3YWl0aW5nT25Vc2VyJyxcblx0XHRcdGJsb2NrZWRPbjogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENvbmZpcm1hdGlvbixcblx0XHRcdHRvb2xJZDogdW5kZWZpbmVkLFxuXHRcdFx0dG9vbFNvdXJjZUtpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGluRmxpZ2h0VG9vbENhbGxDb3VudDogMCxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyB0aGUgdG9vbCB1bm5hbWVkIHdoZW4gdGhlIHR1cm4gaXMgYmxvY2tlZCBvbiBhbiBlbGljaXRhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLWVsaWNpdCcpO1xuXHRcdFx0Ly8gQW4gZWxpY2l0YXRpb24gaXMgbm90IGF0dGFjaGVkIHRvIGFueSB0b29sIGNhbGwgYXQgYWxsLCBhbmQgdGhlXG5cdFx0XHQvLyBhY3Rpb24gY2FycmllcyBubyBgdHVybklkYCBcdTIwMTQgdGhlIGJsb2NrZXIgcmVzb2x2ZXMgdG8gdGhlIGNoYXQnc1xuXHRcdFx0Ly8gYWN0aXZlIHR1cm4gdmlhIHRoZSBmYWxsYmFjayBpbiBgX3NldFNlc3Npb25JbnB1dE5lZWRlZGAuXG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsXG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0XHRtZXNzYWdlOiAnV2hpY2ggZW52aXJvbm1lbnQgc2hvdWxkIEkgZGVwbG95IHRvPycsXG5cdFx0XHRcdFx0cXVlc3Rpb25zOiBbeyBpZDogJ3ExJywga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsIG1lc3NhZ2U6ICdFbnZpcm9ubWVudCcgfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoVFVSTl9IQU5HX1RIUkVTSE9MRF9NUyk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmdFdmVudHMoKS5tYXAoZSA9PiAoe1xuXHRcdFx0aGFuZ1JlYXNvbjogZS5kYXRhLmhhbmdSZWFzb24sXG5cdFx0XHRibG9ja2VkT246IGUuZGF0YS5ibG9ja2VkT24sXG5cdFx0XHR0b29sSWQ6IGUuZGF0YS50b29sSWQsXG5cdFx0XHR0b29sU291cmNlS2luZDogZS5kYXRhLnRvb2xTb3VyY2VLaW5kLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiBlLmRhdGEuaW5GbGlnaHRUb29sQ2FsbENvdW50LFxuXHRcdH0pKSwgW3tcblx0XHRcdGhhbmdSZWFzb246ICd3YWl0aW5nT25Vc2VyJyxcblx0XHRcdGJsb2NrZWRPbjogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuQ2hhdElucHV0LFxuXHRcdFx0dG9vbElkOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sU291cmNlS2luZDogdW5kZWZpbmVkLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiAwLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBhIHJlYWwgc3RhbGwgd2hlbiB0aGUgYWdlbnQgZ29lcyBxdWlldCBhZnRlciBhIGRlbmllZCBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi1kZW5pZWQnKTtcblx0XHRcdGZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWRlbmllZCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1kZW5pZWQnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3dyaXRlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICd3cml0ZScsXG5cdFx0XHR9KTtcblx0XHRcdGZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWRlbmllZCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1kZW5pZWQnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIERlbmlhbCBpcyB0ZXJtaW5hbCBcdTIwMTQgbm8gYENoYXRUb29sQ2FsbENvbXBsZXRlYCBmb2xsb3dzLCBzbyB0aGVcblx0XHRcdC8vIHRvb2wgbXVzdCBub3Qgc3RheSBpbiB0aGUgdHVybidzIGluLWZsaWdodCBzZXQuXG5cdFx0XHRjb25zdCBkZW5pZWQ6IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWRlbmllZCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1kZW5pZWQnLFxuXHRcdFx0XHRhcHByb3ZlZDogZmFsc2UsXG5cdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uRGVuaWVkLFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgZGVuaWVkLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMiB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgZGVuaWVkKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dChUVVJOX0hBTkdfVEhSRVNIT0xEX01TKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaGFuZ0V2ZW50cygpLm1hcChlID0+ICh7XG5cdFx0XHRoYW5nUmVhc29uOiBlLmRhdGEuaGFuZ1JlYXNvbixcblx0XHRcdGlzRXhwZWN0ZWQ6IGUuZGF0YS5pc0V4cGVjdGVkLFxuXHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiBlLmRhdGEuaW5GbGlnaHRUb29sQ2FsbENvdW50LFxuXHRcdH0pKSwgW3tcblx0XHRcdGhhbmdSZWFzb246ICdzdGFsbGVkQWZ0ZXJQcm9ncmVzcycsXG5cdFx0XHRpc0V4cGVjdGVkOiBmYWxzZSxcblx0XHRcdGluRmxpZ2h0VG9vbENhbGxDb3VudDogMCxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlcG9ydCBhZnRlciBhIHR1cm4gaXMgY2FuY2VsbGVkIG9yIGl0cyBzZXNzaW9uIGlzIHRvcm4gZG93bicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLWNhbmNlbGxlZCcpO1xuXHRcdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsIHR1cm5JZDogJ3R1cm4tY2FuY2VsbGVkJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRcdHN0YXJ0VHVybigndHVybi1jbGVhcmVkJyk7XG5cdFx0XHRzaWRlRWZmZWN0cy5jbGVhckNoYW5uZWxUZWxlbWV0cnkoZGVmYXVsdENoYXRVcmkpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwICogVFVSTl9IQU5HX1RIUkVTSE9MRF9NUyk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFuZ3M6IGhhbmdFdmVudHMoKSwgcmVjb3ZlcmllczogaGFuZ1JlY292ZXJ5RXZlbnRzKCkgfSwg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
