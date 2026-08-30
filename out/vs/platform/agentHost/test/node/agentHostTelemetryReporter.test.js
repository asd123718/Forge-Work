import assert from "assert";
import * as zlib from "zlib";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { hash } from "../../../../base/common/hash.js";
import { TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { createUnknownAgentHostClientTelemetryContext } from "../../common/agentHostTelemetry.js";
import { AgentSession } from "../../common/agent.js";
import { getTelemetryChatSessionId } from "../../common/agentTelemetryCorrelation.js";
import { buildSubagentChatUri } from "../../common/state/sessionState.js";
import { AgentHostTelemetryReporter } from "../../node/agentHostTelemetryReporter.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { ActionType } from "../../common/state/sessionActions.js";
class TestRestrictedTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.USAGE;
    this.sendErrorTelemetry = true;
    this.sessionId = "sessionId";
    this.machineId = "machineId";
    this.sqmId = "sqmId";
    this.devDeviceId = "devDeviceId";
    this.firstSessionDate = "firstSessionDate";
    this.enhancedEvents = [];
    this.enhancedMeasurements = [];
    this.internalEvents = [];
    this.githubStandardEvents = [];
    this.standardEvents = [];
  }
  publicLog() {
  }
  publicLogError() {
  }
  publicLog2(eventName, data) {
    this.standardEvents.push({ eventName, data });
  }
  publicLogError2() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
  sendGHTelemetryEvent(eventName, properties) {
    this.githubStandardEvents.push({ eventName, properties });
  }
  sendEnhancedGHTelemetryEvent(eventName, properties, measurements) {
    this.enhancedEvents.push({ eventName, properties });
    this.enhancedMeasurements.push(measurements);
  }
  sendEnhancedGHTelemetryEventForContext(_context, eventName, properties) {
    this.enhancedEvents.push({ eventName, properties });
  }
  sendInternalMSFTTelemetryEvent(eventName, properties, _measurements) {
    this.internalEvents.push({ eventName, properties });
  }
  sendInternalMSFTTelemetryEventForContext(_context, eventName, properties) {
    this.internalEvents.push({ eventName, properties });
  }
  setCopilotTrackingId() {
  }
  setRestrictedTelemetryEndpoint() {
  }
  setRestrictedTelemetryEnabled() {
  }
  setInternalTelemetryContext() {
  }
}
suite("AgentHostTelemetryReporter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = "agent-session://copilot/abc";
  const tools = [{ name: "grep" }, { name: "edit" }];
  test("userMessageSent normalizes the chat URI to its session in standard GH telemetry", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    const chat = buildSubagentChatUri(session, "tool-call-1");
    reporter.userMessageSent("copilot", "client-1", createUnknownAgentHostClientTelemetryContext(AgentHostClientType.AgentsWindow), chat, "turn-1", void 0, "direct", void 0);
    assert.deepStrictEqual(service.githubStandardEvents, [{
      eventName: "agentHost.userMessageSent",
      properties: {
        provider: "copilot",
        initiatorClientType: "agents_window",
        conversationId: AgentSession.id(session),
        turnId: "turn-1"
      }
    }]);
  });
  test("userMessageSent includes only provided initiating client telemetry identity", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.userMessageSent("copilot", "client-1", {
      ...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.AgentsWindow),
      machineId: "client-machine-id",
      devDeviceId: "client-dev-device-id"
    }, session, "turn-1", void 0, "direct", void 0);
    reporter.userMessageSent("copilot", "client-2", createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow), session, "turn-2", void 0, "direct", void 0);
    assert.deepStrictEqual(service.standardEvents.map((event) => ({
      initiatorMachineId: event.data?.initiatorMachineId,
      initiatorDevDeviceId: event.data?.initiatorDevDeviceId
    })), [{
      initiatorMachineId: "client-machine-id",
      initiatorDevDeviceId: "client-dev-device-id"
    }, {
      initiatorMachineId: void 0,
      initiatorDevDeviceId: void 0
    }]);
  });
  test("executionModeChanged attributes a client-originated mode change", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.executionModeChanged("copilot", session, "interactive", "plan", 2, {
      ...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow),
      machineId: "client-machine-id",
      devDeviceId: "client-dev-device-id"
    });
    assert.deepStrictEqual(service.standardEvents.map((event) => ({
      eventName: event.eventName,
      initiatorClientType: event.data?.initiatorClientType,
      initiatorMachineId: event.data?.initiatorMachineId,
      initiatorDevDeviceId: event.data?.initiatorDevDeviceId
    })), [{
      eventName: "agentHost.executionModeChanged",
      initiatorClientType: "editor_window",
      initiatorMachineId: "client-machine-id",
      initiatorDevDeviceId: "client-dev-device-id"
    }]);
  });
  test("assistantMessageReceived emits request.options.tools keyed on the client request id, and no-ops without one or without tools", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, void 0, tools);
    await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, "client-1", []);
    await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, "client-1", tools);
    assert.deepStrictEqual(service.enhancedEvents, [{
      eventName: "request.options.tools",
      properties: {
        headerRequestId: "client-1",
        conversationId: AgentSession.id(session),
        initiatorClientType: "agents_window",
        messagesJson: JSON.stringify(tools),
        messagesJSONChunk: zlib.gzipSync(Buffer.from(JSON.stringify(tools), "utf8")).toString("base64")
      }
    }]);
  });
  test("userMessageText emits conversation.messageText (source=user) to enhanced + internal, and no-ops on empty content", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.userMessageText(session, AgentHostClientType.EditorWindow, "", 3);
    await reporter.userMessageText(session, AgentHostClientType.EditorWindow, "hello agent", 3);
    const expected = {
      eventName: "conversation.messageText",
      properties: {
        source: "user",
        conversationId: AgentSession.id(session),
        initiatorClientType: "editor_window",
        turnIndex: "3",
        messageText: "hello agent"
      }
    };
    assert.deepStrictEqual(service.enhancedEvents, [expected]);
    assert.deepStrictEqual(service.internalEvents, [expected]);
  });
  test("modelMessageText emits conversation.messageText (source=model) with headerRequestId, and no-ops on empty content", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.modelMessageText(session, AgentHostClientType.AgentsWindow, "", 3, "client-1");
    await reporter.modelMessageText(session, AgentHostClientType.AgentsWindow, "sure, here you go", 3, "client-1");
    const expected = {
      eventName: "conversation.messageText",
      properties: {
        source: "model",
        conversationId: AgentSession.id(session),
        initiatorClientType: "agents_window",
        turnIndex: "3",
        headerRequestId: "client-1",
        messageText: "sure, here you go"
      }
    };
    assert.deepStrictEqual(service.enhancedEvents, [expected]);
    assert.deepStrictEqual(service.internalEvents, [expected]);
  });
  test("toolCallDetails emits standard and restricted aggregates whenever tools were available, and no-ops when none were", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.toolCallDetails({
      provider: "copilot",
      session,
      turnId: "a1b2c3d4-0000-4000-8000-000000000000",
      clientType: AgentHostClientType.Unknown,
      model: "gpt-x",
      responseType: "success",
      toolCounts: {},
      availableTools: [],
      turnIndex: 2,
      turnDuration: 1200,
      messageCharLen: 11,
      numRequests: 1,
      totalToolCalls: 0,
      parallelToolCallRounds: 0,
      parallelToolCallsTotal: 0
    });
    await reporter.toolCallDetails({
      provider: "copilot",
      session,
      turnId: "a1b2c3d4-0000-4000-8000-000000000000",
      clientType: AgentHostClientType.EditorWindow,
      model: "gpt-x",
      responseType: "success",
      clientContext: { ...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow), machineId: "client-machine-id", devDeviceId: "client-dev-device-id" },
      toolCounts: {},
      availableTools: ["grep", "edit"],
      turnIndex: 2,
      turnDuration: 1200,
      messageCharLen: 11,
      numRequests: 1,
      totalToolCalls: 0,
      parallelToolCallRounds: 0,
      parallelToolCallsTotal: 0
    });
    await reporter.toolCallDetails({
      provider: "copilot",
      session,
      turnId: "a1b2c3d4-0000-4000-8000-000000000000",
      clientType: AgentHostClientType.AgentsWindow,
      model: "gpt-x",
      responseType: "cancelled",
      toolCounts: { grep: 2, edit: 1 },
      availableTools: ["grep", "edit"],
      turnIndex: 3,
      turnDuration: 2400,
      messageCharLen: void 0,
      numRequests: 2,
      totalToolCalls: 3,
      parallelToolCallRounds: 1,
      parallelToolCallsTotal: 2
    });
    assert.deepStrictEqual(service.standardEvents, [{
      eventName: "toolCallDetails",
      data: {
        initiatorClientType: "editor_window",
        initiatorMachineId: "client-machine-id",
        initiatorDevDeviceId: "client-dev-device-id",
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        conversationId: AgentSession.id(session),
        requestId: "a1b2c3d4-0000-4000-8000-000000000000",
        responseType: "success",
        toolCounts: JSON.stringify({}),
        model: "gpt-x",
        numRequests: 1,
        turnIndex: 2,
        turnDuration: 1200,
        messageCharLen: 11,
        availableToolCount: 2,
        totalToolCalls: 0,
        parallelToolCallRounds: 0,
        parallelToolCallsTotal: 0
      }
    }, {
      eventName: "toolCallDetails",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        conversationId: AgentSession.id(session),
        requestId: "a1b2c3d4-0000-4000-8000-000000000000",
        responseType: "cancelled",
        toolCounts: JSON.stringify({ grep: 2, edit: 1 }),
        model: "gpt-x",
        numRequests: 2,
        turnIndex: 3,
        turnDuration: 2400,
        messageCharLen: void 0,
        availableToolCount: 2,
        totalToolCalls: 3,
        parallelToolCallRounds: 1,
        parallelToolCallsTotal: 2
      }
    }]);
    assert.deepStrictEqual(service.enhancedEvents, [{
      eventName: "toolCallDetailsExternal",
      properties: {
        conversationId: AgentSession.id(session),
        requestId: "a1b2c3d4-0000-4000-8000-000000000000",
        messageId: "a1b2c3d4-0000-4000-8000-000000000000",
        initiatorClientType: "editor_window",
        responseType: "success",
        model: "gpt-x",
        toolCounts: JSON.stringify({}),
        availableTools: JSON.stringify(["grep", "edit"])
      }
    }, {
      eventName: "toolCallDetailsExternal",
      properties: {
        conversationId: AgentSession.id(session),
        requestId: "a1b2c3d4-0000-4000-8000-000000000000",
        messageId: "a1b2c3d4-0000-4000-8000-000000000000",
        initiatorClientType: "agents_window",
        responseType: "cancelled",
        model: "gpt-x",
        toolCounts: JSON.stringify({ grep: 2, edit: 1 }),
        availableTools: JSON.stringify(["grep", "edit"])
      }
    }]);
    assert.strictEqual(service.internalEvents.length, 2);
    assert.strictEqual(service.internalEvents[0].eventName, "toolCallDetailsInternal");
    assert.strictEqual(service.internalEvents[1].eventName, "toolCallDetailsInternal");
  });
  test("toolApproval emits chat.toolApproval with AH discriminators and reason mapping", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.toolApproval({
      provider: "copilot",
      session,
      turnId: "turn-1",
      toolId: "grep",
      toolSourceKind: "internal",
      confirmKind: "confirmationNotNeeded",
      confirmationNotNeededReason: "auto-approve-all",
      requestUnsandboxedExecution: void 0
    });
    reporter.toolApproval({
      provider: "copilot",
      session,
      turnId: "turn-2",
      clientContext: { ...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow), machineId: "client-machine-id", devDeviceId: "client-dev-device-id" },
      toolId: "bash",
      toolSourceKind: "internal",
      confirmKind: "userAction",
      confirmationNotNeededReason: void 0,
      requestUnsandboxedExecution: true
    });
    reporter.toolApproval({
      provider: "copilot",
      session,
      turnId: "turn-3",
      toolId: "my-mcp-tool",
      toolSourceKind: "mcp",
      confirmKind: "denied",
      confirmationNotNeededReason: void 0,
      requestUnsandboxedExecution: void 0
    });
    assert.deepStrictEqual(service.standardEvents, [{
      eventName: "chat.toolApproval",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        chatSessionId: AgentSession.id(session),
        requestId: "turn-1",
        toolId: "grep",
        toolExtensionId: void 0,
        toolSourceKind: "internal",
        confirmKind: "confirmationNotNeeded",
        settingId: void 0,
        lmServiceScope: void 0,
        customButtonKind: void 0,
        confirmationNotNeededReason: "auto-approve-all",
        sandboxWrapped: void 0,
        requestUnsandboxedExecution: void 0
      }
    }, {
      eventName: "chat.toolApproval",
      data: {
        initiatorClientType: "editor_window",
        initiatorMachineId: "client-machine-id",
        initiatorDevDeviceId: "client-dev-device-id",
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        chatSessionId: AgentSession.id(session),
        requestId: "turn-2",
        toolId: "bash",
        toolExtensionId: void 0,
        toolSourceKind: "internal",
        confirmKind: "userAction",
        settingId: void 0,
        lmServiceScope: void 0,
        customButtonKind: void 0,
        confirmationNotNeededReason: void 0,
        sandboxWrapped: void 0,
        requestUnsandboxedExecution: true
      }
    }, {
      eventName: "chat.toolApproval",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        chatSessionId: AgentSession.id(session),
        requestId: "turn-3",
        toolId: "my-mcp-tool",
        toolExtensionId: void 0,
        toolSourceKind: "mcp",
        confirmKind: "denied",
        settingId: void 0,
        lmServiceScope: void 0,
        customButtonKind: void 0,
        confirmationNotNeededReason: void 0,
        sandboxWrapped: void 0,
        requestUnsandboxedExecution: void 0
      }
    }]);
  });
  test("turnHung emits bounded last activity categories", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.turnHung({
      provider: "copilot",
      session,
      turnId: "turn-1",
      hangReason: "stalledAfterProgress",
      hadAnyProgress: true,
      lastActivityKind: ActionType.ChatToolCallDelta,
      blockedOn: void 0,
      toolId: void 0,
      toolSourceKind: void 0,
      inFlightToolCallCount: 0,
      quietTimeMs: 1e3,
      turnElapsedMs: 2e3,
      model: void 0,
      modelTelemetryKind: void 0,
      modelSelectionKind: "default",
      permissionLevel: void 0
    });
    reporter.turnHung({
      provider: "copilot",
      session,
      turnId: "turn-2",
      hangReason: "stalledAfterProgress",
      hadAnyProgress: true,
      lastActivityKind: "custom/path/value",
      blockedOn: void 0,
      toolId: void 0,
      toolSourceKind: void 0,
      inFlightToolCallCount: 0,
      quietTimeMs: 1e3,
      turnElapsedMs: 2e3,
      model: void 0,
      modelTelemetryKind: void 0,
      modelSelectionKind: "default",
      permissionLevel: void 0
    });
    assert.deepStrictEqual(service.standardEvents, [{
      eventName: "agentHost.turnHung",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        chatSessionId: getTelemetryChatSessionId(session),
        isSubagentSession: false,
        turnId: "turn-1",
        hangReason: "stalledAfterProgress",
        isExpected: false,
        hadAnyProgress: true,
        lastActivityKind: "chat.toolCallDelta",
        blockedOn: void 0,
        toolId: void 0,
        toolSourceKind: void 0,
        inFlightToolCallCount: 0,
        quietTimeMs: 1e3,
        turnElapsedMs: 2e3,
        model: void 0,
        modelSelectionKind: "default",
        permissionLevel: void 0
      }
    }, {
      eventName: "agentHost.turnHung",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        chatSessionId: getTelemetryChatSessionId(session),
        isSubagentSession: false,
        turnId: "turn-2",
        hangReason: "stalledAfterProgress",
        isExpected: false,
        hadAnyProgress: true,
        lastActivityKind: "other",
        blockedOn: void 0,
        toolId: void 0,
        toolSourceKind: void 0,
        inFlightToolCallCount: 0,
        quietTimeMs: 1e3,
        turnElapsedMs: 2e3,
        model: void 0,
        modelSelectionKind: "default",
        permissionLevel: void 0
      }
    }]);
  });
  test("autoModeRouterDecision maps authoritative SDK router fields and score shapes without deriving values", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.autoModeRouterDecision({
      session,
      turnId: "turn-hydra",
      clientType: AgentHostClientType.EditorWindow,
      chosenModel: "gpt-5",
      predictedLabel: "high",
      confidence: 0.9,
      candidateModels: ["gpt-5", "gpt-4.1"],
      categoryScores: { reasoning: 0.8, code_gen: 0.7, debugging: 0.6, tool_use: 0.5 },
      routingMethod: "hydra",
      availableModels: ["gpt-5", "gpt-4.1", "gpt-5-mini"],
      fallback: false,
      fallbackReason: "not-needed",
      stickyOverride: true,
      routerLatencyMs: 25,
      endToEndLatencyMs: 40,
      chosenShortfall: 0.05,
      hasImage: true
    });
    reporter.autoModeRouterDecision({
      session,
      turnId: "turn-binary",
      clientType: AgentHostClientType.AgentsWindow,
      chosenModel: "gpt-4.1",
      predictedLabel: "no_reasoning",
      confidence: void 0,
      candidateModels: void 0,
      categoryScores: { needs_reasoning: 0.2, no_reasoning: 0.8 },
      routingMethod: void 0,
      availableModels: void 0,
      fallback: void 0,
      fallbackReason: void 0,
      stickyOverride: void 0,
      routerLatencyMs: void 0,
      endToEndLatencyMs: void 0,
      chosenShortfall: void 0,
      hasImage: void 0
    });
    assert.deepStrictEqual({ events: service.enhancedEvents, measurements: service.enhancedMeasurements }, {
      events: [{
        eventName: "automode.routerDecisionRestricted",
        properties: {
          conversationId: AgentSession.id(session),
          vscodeRequestId: "turn-hydra",
          initiatorClientType: "editor_window",
          predictedLabel: "high",
          routingMethod: "hydra",
          fallback: "false",
          fallbackReason: "not-needed",
          candidateModel: "gpt-5",
          chosenModel: "gpt-5",
          candidateModels: JSON.stringify(["gpt-5", "gpt-4.1"]),
          availableModels: JSON.stringify(["gpt-5", "gpt-4.1", "gpt-5-mini"]),
          stickyOverrideStr: "true",
          hasImage: "true",
          hydraScores: JSON.stringify({ reasoning: 0.8, code_gen: 0.7, debugging: 0.6, tool_use: 0.5 })
        }
      }, {
        eventName: "automode.routerDecisionRestricted",
        properties: {
          conversationId: AgentSession.id(session),
          vscodeRequestId: "turn-binary",
          initiatorClientType: "agents_window",
          predictedLabel: "no_reasoning",
          candidateModel: "",
          chosenModel: "gpt-4.1",
          candidateModels: JSON.stringify([]),
          binaryScores: JSON.stringify({ needs_reasoning: 0.2, no_reasoning: 0.8 })
        }
      }],
      measurements: [{ confidence: 0.9, latencyMs: 25, e2eLatencyMs: 40, stickyOverride: 1, chosenShortfall: 0.05 }, { scoreNeedsReasoning: 0.2, scoreNoReasoning: 0.8 }]
    });
  });
  test("skillContentRead emits plaintext skill metadata to enhanced + internal, maps plugin identity + hashes content, and no-ops without a name", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.skillContentRead({ clientType: AgentHostClientType.Unknown, name: "", path: "/skills/x/SKILL.md", content: "body", source: "project", pluginName: void 0, pluginVersion: void 0 });
    reporter.skillContentRead({
      clientType: AgentHostClientType.AgentsWindow,
      name: "pdf",
      path: "/plugins/pdf/SKILL.md",
      content: "skill body",
      source: "plugin",
      pluginName: "pdf-plugin",
      pluginVersion: "1.2.3"
    });
    const expected = {
      eventName: "skillContentRead",
      properties: {
        initiatorClientType: "agents_window",
        skillName: "pdf",
        skillPath: "/plugins/pdf/SKILL.md",
        skillExtensionId: "pdf-plugin",
        skillExtensionVersion: "1.2.3",
        skillStorage: "plugin",
        skillContentHash: String(hash("skill body"))
      }
    };
    assert.deepStrictEqual({
      standard: service.githubStandardEvents,
      enhanced: service.enhancedEvents,
      internal: service.internalEvents
    }, {
      standard: [{
        eventName: "skillContentRead",
        properties: {
          initiatorClientType: "agents_window",
          skillNameHash: String(hash("pdf")),
          skillExtensionIdHash: String(hash("pdf-plugin")),
          skillExtensionVersion: "1.2.3",
          skillStorage: "plugin",
          skillContentHash: String(hash("skill body"))
        }
      }],
      enhanced: [expected],
      internal: [expected]
    });
  });
  test("repoInfo gates collection and multiplexes sink-specific properties", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.reportRepoInfo({
      restrictedTelemetryEnabled: true,
      trackingId: "tracking-id",
      telemetryEndpoint: "https://telemetry.example/telemetry",
      isInternal: true,
      userName: "octocat",
      isVscodeTeamMember: true
    }, {
      telemetryMessageId: "turn-1",
      clientType: AgentHostClientType.EditorWindow,
      location: "begin",
      remoteUrl: "https://github.com/microsoft/vscode",
      repoId: "microsoft/vscode",
      repoType: "github",
      headCommitHash: "abc",
      headBranchName: "feature",
      fileRelativePaths: JSON.stringify(["src/a.ts"]),
      diffsJSON: "x".repeat(8193),
      result: "success",
      isActiveRepository: "true",
      workspaceFileCount: 10,
      changedFileCount: 1,
      diffSizeBytes: 8193
    });
    assert.deepStrictEqual({
      enhanced: service.enhancedEvents[0],
      internal: service.internalEvents[0]
    }, {
      enhanced: {
        eventName: "request.repoInfo",
        properties: {
          initiatorClientType: "editor_window",
          remoteUrl: "https://github.com/microsoft/vscode",
          repoId: "microsoft/vscode",
          repoType: "github",
          headCommitHash: "abc",
          headBranchName: "feature",
          fileRelativePaths: JSON.stringify(["src/a.ts"]),
          diffsJSON: "x".repeat(8192),
          diffsJSONChunk: zlib.gzipSync(Buffer.from("x".repeat(8193), "utf8")).toString("base64"),
          result: "success",
          isActiveRepository: "true",
          location: "begin",
          telemetryMessageId: "turn-1"
        }
      },
      internal: {
        eventName: "request.repoInfo",
        properties: {
          initiatorClientType: "editor_window",
          remoteUrl: "https://github.com/microsoft/vscode",
          repoId: "microsoft/vscode",
          repoType: "github",
          headCommitHash: "abc",
          diffsJSON: "x".repeat(8192),
          diffsJSONChunk: zlib.gzipSync(Buffer.from("x".repeat(8193), "utf8")).toString("base64"),
          result: "success",
          isActiveRepository: "true",
          location: "begin",
          telemetryMessageId: "turn-1"
        }
      }
    });
  });
  test("skillContentRead drops the version when no plugin name is known, matching the extension", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.skillContentRead({ clientType: AgentHostClientType.EditorWindow, name: "local", path: "/skills/local/SKILL.md", content: "c", source: "project", pluginName: void 0, pluginVersion: "9.9.9" });
    assert.strictEqual(service.enhancedEvents.length, 1);
    assert.strictEqual(service.enhancedEvents[0].properties?.skillExtensionId, "");
    assert.strictEqual(service.enhancedEvents[0].properties?.skillExtensionVersion, "");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgemxpYiBmcm9tICd6bGliJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeURhdGEsIElUZWxlbWV0cnlTZXJ2aWNlLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGNyZWF0ZVVua25vd25BZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgZ2V0VGVsZW1ldHJ5Q2hhdFNlc3Npb25JZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFRlbGVtZXRyeUNvcnJlbGF0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbERlZmluaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgYnVpbGRTdWJhZ2VudENoYXRVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RJbnRlcm5hbFRlbGVtZXRyeUNvbnRleHQsIElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5LCBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQsIFRlbGVtZXRyeU1lYXN1cmVtZW50cywgVGVsZW1ldHJ5UHJvcHMgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcblxuaW50ZXJmYWNlIElSZXN0cmljdGVkQ2FsbCB7XG5cdGV2ZW50TmFtZTogc3RyaW5nO1xuXHRwcm9wZXJ0aWVzOiBUZWxlbWV0cnlQcm9wcyB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlIGltcGxlbWVudHMgSVRlbGVtZXRyeVNlcnZpY2UsIElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5IHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0dGVsZW1ldHJ5TGV2ZWwgPSBUZWxlbWV0cnlMZXZlbC5VU0FHRTtcblx0c2VuZEVycm9yVGVsZW1ldHJ5ID0gdHJ1ZTtcblx0c2Vzc2lvbklkID0gJ3Nlc3Npb25JZCc7XG5cdG1hY2hpbmVJZCA9ICdtYWNoaW5lSWQnO1xuXHRzcW1JZCA9ICdzcW1JZCc7XG5cdGRldkRldmljZUlkID0gJ2RldkRldmljZUlkJztcblx0Zmlyc3RTZXNzaW9uRGF0ZSA9ICdmaXJzdFNlc3Npb25EYXRlJztcblxuXHRyZWFkb25seSBlbmhhbmNlZEV2ZW50czogSVJlc3RyaWN0ZWRDYWxsW10gPSBbXTtcblx0cmVhZG9ubHkgZW5oYW5jZWRNZWFzdXJlbWVudHM6IEFycmF5PFRlbGVtZXRyeU1lYXN1cmVtZW50cyB8IHVuZGVmaW5lZD4gPSBbXTtcblx0cmVhZG9ubHkgaW50ZXJuYWxFdmVudHM6IElSZXN0cmljdGVkQ2FsbFtdID0gW107XG5cdHJlYWRvbmx5IGdpdGh1YlN0YW5kYXJkRXZlbnRzOiBJUmVzdHJpY3RlZENhbGxbXSA9IFtdO1xuXHRyZWFkb25seSBzdGFuZGFyZEV2ZW50czogQXJyYXk8eyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogSVRlbGVtZXRyeURhdGEgfCB1bmRlZmluZWQgfT4gPSBbXTtcblxuXHRwdWJsaWNMb2coKTogdm9pZCB7IH1cblx0cHVibGljTG9nRXJyb3IoKTogdm9pZCB7IH1cblx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IElUZWxlbWV0cnlEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5zdGFuZGFyZEV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHR9XG5cdHB1YmxpY0xvZ0Vycm9yMigpOiB2b2lkIHsgfVxuXHRzZXRFeHBlcmltZW50UHJvcGVydHkoKTogdm9pZCB7IH1cblx0c2V0Q29tbW9uUHJvcGVydHkoKTogdm9pZCB7IH1cblxuXHRzZW5kR0hUZWxlbWV0cnlFdmVudChldmVudE5hbWU6IHN0cmluZywgcHJvcGVydGllcz86IFRlbGVtZXRyeVByb3BzKTogdm9pZCB7XG5cdFx0dGhpcy5naXRodWJTdGFuZGFyZEV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBwcm9wZXJ0aWVzIH0pO1xuXHR9XG5cdHNlbmRFbmhhbmNlZEdIVGVsZW1ldHJ5RXZlbnQoZXZlbnROYW1lOiBzdHJpbmcsIHByb3BlcnRpZXM/OiBUZWxlbWV0cnlQcm9wcywgbWVhc3VyZW1lbnRzPzogVGVsZW1ldHJ5TWVhc3VyZW1lbnRzKTogdm9pZCB7XG5cdFx0dGhpcy5lbmhhbmNlZEV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBwcm9wZXJ0aWVzIH0pO1xuXHRcdHRoaXMuZW5oYW5jZWRNZWFzdXJlbWVudHMucHVzaChtZWFzdXJlbWVudHMpO1xuXHR9XG5cdHNlbmRFbmhhbmNlZEdIVGVsZW1ldHJ5RXZlbnRGb3JDb250ZXh0KF9jb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQsIGV2ZW50TmFtZTogc3RyaW5nLCBwcm9wZXJ0aWVzPzogVGVsZW1ldHJ5UHJvcHMpOiB2b2lkIHtcblx0XHR0aGlzLmVuaGFuY2VkRXZlbnRzLnB1c2goeyBldmVudE5hbWUsIHByb3BlcnRpZXMgfSk7XG5cdH1cblx0c2VuZEludGVybmFsTVNGVFRlbGVtZXRyeUV2ZW50KGV2ZW50TmFtZTogc3RyaW5nLCBwcm9wZXJ0aWVzPzogVGVsZW1ldHJ5UHJvcHMsIF9tZWFzdXJlbWVudHM/OiBUZWxlbWV0cnlNZWFzdXJlbWVudHMpOiB2b2lkIHtcblx0XHR0aGlzLmludGVybmFsRXZlbnRzLnB1c2goeyBldmVudE5hbWUsIHByb3BlcnRpZXMgfSk7XG5cdH1cblx0c2VuZEludGVybmFsTVNGVFRlbGVtZXRyeUV2ZW50Rm9yQ29udGV4dChfY29udGV4dDogSUFnZW50SG9zdEludGVybmFsVGVsZW1ldHJ5Q29udGV4dCwgZXZlbnROYW1lOiBzdHJpbmcsIHByb3BlcnRpZXM/OiBUZWxlbWV0cnlQcm9wcyk6IHZvaWQge1xuXHRcdHRoaXMuaW50ZXJuYWxFdmVudHMucHVzaCh7IGV2ZW50TmFtZSwgcHJvcGVydGllcyB9KTtcblx0fVxuXHRzZXRDb3BpbG90VHJhY2tpbmdJZCgpOiB2b2lkIHsgfVxuXHRzZXRSZXN0cmljdGVkVGVsZW1ldHJ5RW5kcG9pbnQoKTogdm9pZCB7IH1cblx0c2V0UmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQoKTogdm9pZCB7IH1cblx0c2V0SW50ZXJuYWxUZWxlbWV0cnlDb250ZXh0KCk6IHZvaWQgeyB9XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2Vzc2lvbiA9ICdhZ2VudC1zZXNzaW9uOi8vY29waWxvdC9hYmMnO1xuXHRjb25zdCB0b29sczogVG9vbERlZmluaXRpb25bXSA9IFt7IG5hbWU6ICdncmVwJyB9LCB7IG5hbWU6ICdlZGl0JyB9XTtcblxuXHR0ZXN0KCd1c2VyTWVzc2FnZVNlbnQgbm9ybWFsaXplcyB0aGUgY2hhdCBVUkkgdG8gaXRzIHNlc3Npb24gaW4gc3RhbmRhcmQgR0ggdGVsZW1ldHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIoc2VydmljZSk7XG5cdFx0Y29uc3QgY2hhdCA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb24sICd0b29sLWNhbGwtMScpO1xuXG5cdFx0cmVwb3J0ZXIudXNlck1lc3NhZ2VTZW50KCdjb3BpbG90JywgJ2NsaWVudC0xJywgY3JlYXRlVW5rbm93bkFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQoQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3cpLCBjaGF0LCAndHVybi0xJywgdW5kZWZpbmVkLCAnZGlyZWN0JywgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5naXRodWJTdGFuZGFyZEV2ZW50cywgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2FnZW50SG9zdC51c2VyTWVzc2FnZVNlbnQnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndXNlck1lc3NhZ2VTZW50IGluY2x1ZGVzIG9ubHkgcHJvdmlkZWQgaW5pdGlhdGluZyBjbGllbnQgdGVsZW1ldHJ5IGlkZW50aXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIoc2VydmljZSk7XG5cblx0XHRyZXBvcnRlci51c2VyTWVzc2FnZVNlbnQoJ2NvcGlsb3QnLCAnY2xpZW50LTEnLCB7XG5cdFx0XHQuLi5jcmVhdGVVbmtub3duQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChBZ2VudEhvc3RDbGllbnRUeXBlLkFnZW50c1dpbmRvdyksXG5cdFx0XHRtYWNoaW5lSWQ6ICdjbGllbnQtbWFjaGluZS1pZCcsXG5cdFx0XHRkZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHR9LCBzZXNzaW9uLCAndHVybi0xJywgdW5kZWZpbmVkLCAnZGlyZWN0JywgdW5kZWZpbmVkKTtcblx0XHRyZXBvcnRlci51c2VyTWVzc2FnZVNlbnQoJ2NvcGlsb3QnLCAnY2xpZW50LTInLCBjcmVhdGVVbmtub3duQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyksIHNlc3Npb24sICd0dXJuLTInLCB1bmRlZmluZWQsICdkaXJlY3QnLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnN0YW5kYXJkRXZlbnRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiBldmVudC5kYXRhPy5pbml0aWF0b3JNYWNoaW5lSWQsXG5cdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogZXZlbnQuZGF0YT8uaW5pdGlhdG9yRGV2RGV2aWNlSWQsXG5cdFx0fSkpLCBbe1xuXHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0aW5pdGlhdG9yRGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0fSwge1xuXHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogdW5kZWZpbmVkLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZXhlY3V0aW9uTW9kZUNoYW5nZWQgYXR0cmlidXRlcyBhIGNsaWVudC1vcmlnaW5hdGVkIG1vZGUgY2hhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIoc2VydmljZSk7XG5cblx0XHRyZXBvcnRlci5leGVjdXRpb25Nb2RlQ2hhbmdlZCgnY29waWxvdCcsIHNlc3Npb24sICdpbnRlcmFjdGl2ZScsICdwbGFuJywgMiwge1xuXHRcdFx0Li4uY3JlYXRlVW5rbm93bkFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQoQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3cpLFxuXHRcdFx0bWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0ZGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhbmRhcmRFdmVudHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRldmVudE5hbWU6IGV2ZW50LmV2ZW50TmFtZSxcblx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6IGV2ZW50LmRhdGE/LmluaXRpYXRvckNsaWVudFR5cGUsXG5cdFx0XHRpbml0aWF0b3JNYWNoaW5lSWQ6IGV2ZW50LmRhdGE/LmluaXRpYXRvck1hY2hpbmVJZCxcblx0XHRcdGluaXRpYXRvckRldkRldmljZUlkOiBldmVudC5kYXRhPy5pbml0aWF0b3JEZXZEZXZpY2VJZCxcblx0XHR9KSksIFt7XG5cdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QuZXhlY3V0aW9uTW9kZUNoYW5nZWQnLFxuXHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ2VkaXRvcl93aW5kb3cnLFxuXHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0aW5pdGlhdG9yRGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhc3Npc3RhbnRNZXNzYWdlUmVjZWl2ZWQgZW1pdHMgcmVxdWVzdC5vcHRpb25zLnRvb2xzIGtleWVkIG9uIHRoZSBjbGllbnQgcmVxdWVzdCBpZCwgYW5kIG5vLW9wcyB3aXRob3V0IG9uZSBvciB3aXRob3V0IHRvb2xzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIoc2VydmljZSk7XG5cblx0XHRhd2FpdCByZXBvcnRlci5hc3Npc3RhbnRNZXNzYWdlUmVjZWl2ZWQoc2Vzc2lvbiwgQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csIHVuZGVmaW5lZCwgdG9vbHMpOyAvLyBkcm9wcGVkOiBubyBjbGllbnQgcmVxdWVzdCBpZFxuXHRcdGF3YWl0IHJlcG9ydGVyLmFzc2lzdGFudE1lc3NhZ2VSZWNlaXZlZChzZXNzaW9uLCBBZ2VudEhvc3RDbGllbnRUeXBlLkFnZW50c1dpbmRvdywgJ2NsaWVudC0xJywgW10pOyAvLyBkcm9wcGVkOiBubyB0b29sc1xuXHRcdGF3YWl0IHJlcG9ydGVyLmFzc2lzdGFudE1lc3NhZ2VSZWNlaXZlZChzZXNzaW9uLCBBZ2VudEhvc3RDbGllbnRUeXBlLkFnZW50c1dpbmRvdywgJ2NsaWVudC0xJywgdG9vbHMpOyAvLyBlbWl0dGVkXG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZW5oYW5jZWRFdmVudHMsIFt7XG5cdFx0XHRldmVudE5hbWU6ICdyZXF1ZXN0Lm9wdGlvbnMudG9vbHMnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRoZWFkZXJSZXF1ZXN0SWQ6ICdjbGllbnQtMScsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdhZ2VudHNfd2luZG93Jyxcblx0XHRcdFx0bWVzc2FnZXNKc29uOiBKU09OLnN0cmluZ2lmeSh0b29scyksXG5cdFx0XHRcdG1lc3NhZ2VzSlNPTkNodW5rOiB6bGliLmd6aXBTeW5jKEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHRvb2xzKSwgJ3V0ZjgnKSkudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXJNZXNzYWdlVGV4dCBlbWl0cyBjb252ZXJzYXRpb24ubWVzc2FnZVRleHQgKHNvdXJjZT11c2VyKSB0byBlbmhhbmNlZCArIGludGVybmFsLCBhbmQgbm8tb3BzIG9uIGVtcHR5IGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UmVzdHJpY3RlZFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcihzZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHJlcG9ydGVyLnVzZXJNZXNzYWdlVGV4dChzZXNzaW9uLCBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdywgJycsIDMpOyAvLyBkcm9wcGVkOiBubyBjb250ZW50XG5cdFx0YXdhaXQgcmVwb3J0ZXIudXNlck1lc3NhZ2VUZXh0KHNlc3Npb24sIEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LCAnaGVsbG8gYWdlbnQnLCAzKTsgLy8gZW1pdHRlZFxuXG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IElSZXN0cmljdGVkQ2FsbCA9IHtcblx0XHRcdGV2ZW50TmFtZTogJ2NvbnZlcnNhdGlvbi5tZXNzYWdlVGV4dCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHNvdXJjZTogJ3VzZXInLFxuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnZWRpdG9yX3dpbmRvdycsXG5cdFx0XHRcdHR1cm5JbmRleDogJzMnLFxuXHRcdFx0XHRtZXNzYWdlVGV4dDogJ2hlbGxvIGFnZW50Jyxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZW5oYW5jZWRFdmVudHMsIFtleHBlY3RlZF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5pbnRlcm5hbEV2ZW50cywgW2V4cGVjdGVkXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsTWVzc2FnZVRleHQgZW1pdHMgY29udmVyc2F0aW9uLm1lc3NhZ2VUZXh0IChzb3VyY2U9bW9kZWwpIHdpdGggaGVhZGVyUmVxdWVzdElkLCBhbmQgbm8tb3BzIG9uIGVtcHR5IGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UmVzdHJpY3RlZFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcihzZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHJlcG9ydGVyLm1vZGVsTWVzc2FnZVRleHQoc2Vzc2lvbiwgQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csICcnLCAzLCAnY2xpZW50LTEnKTsgLy8gZHJvcHBlZDogbm8gY29udGVudFxuXHRcdGF3YWl0IHJlcG9ydGVyLm1vZGVsTWVzc2FnZVRleHQoc2Vzc2lvbiwgQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csICdzdXJlLCBoZXJlIHlvdSBnbycsIDMsICdjbGllbnQtMScpOyAvLyBlbWl0dGVkXG5cblx0XHRjb25zdCBleHBlY3RlZDogSVJlc3RyaWN0ZWRDYWxsID0ge1xuXHRcdFx0ZXZlbnROYW1lOiAnY29udmVyc2F0aW9uLm1lc3NhZ2VUZXh0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0c291cmNlOiAnbW9kZWwnLFxuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdHR1cm5JbmRleDogJzMnLFxuXHRcdFx0XHRoZWFkZXJSZXF1ZXN0SWQ6ICdjbGllbnQtMScsXG5cdFx0XHRcdG1lc3NhZ2VUZXh0OiAnc3VyZSwgaGVyZSB5b3UgZ28nLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5lbmhhbmNlZEV2ZW50cywgW2V4cGVjdGVkXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmludGVybmFsRXZlbnRzLCBbZXhwZWN0ZWRdKTtcblx0fSk7XG5cblx0dGVzdCgndG9vbENhbGxEZXRhaWxzIGVtaXRzIHN0YW5kYXJkIGFuZCByZXN0cmljdGVkIGFnZ3JlZ2F0ZXMgd2hlbmV2ZXIgdG9vbHMgd2VyZSBhdmFpbGFibGUsIGFuZCBuby1vcHMgd2hlbiBub25lIHdlcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UmVzdHJpY3RlZFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcihzZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHJlcG9ydGVyLnRvb2xDYWxsRGV0YWlscyh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLCBzZXNzaW9uLCB0dXJuSWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLCBjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sIG1vZGVsOiAnZ3B0LXgnLCByZXNwb25zZVR5cGU6ICdzdWNjZXNzJyxcblx0XHRcdHRvb2xDb3VudHM6IHt9LCBhdmFpbGFibGVUb29sczogW10sXG5cdFx0XHR0dXJuSW5kZXg6IDIsIHR1cm5EdXJhdGlvbjogMTIwMCwgbWVzc2FnZUNoYXJMZW46IDExLFxuXHRcdFx0bnVtUmVxdWVzdHM6IDEsIHRvdGFsVG9vbENhbGxzOiAwLCBwYXJhbGxlbFRvb2xDYWxsUm91bmRzOiAwLCBwYXJhbGxlbFRvb2xDYWxsc1RvdGFsOiAwLFxuXHRcdH0pOyAvLyBkcm9wcGVkOiBubyB0b29scyB3ZXJlIGF2YWlsYWJsZVxuXHRcdGF3YWl0IHJlcG9ydGVyLnRvb2xDYWxsRGV0YWlscyh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLCBzZXNzaW9uLCB0dXJuSWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLCBjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdywgbW9kZWw6ICdncHQteCcsIHJlc3BvbnNlVHlwZTogJ3N1Y2Nlc3MnLFxuXHRcdFx0Y2xpZW50Q29udGV4dDogeyAuLi5jcmVhdGVVbmtub3duQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyksIG1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJywgZGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcgfSxcblx0XHRcdHRvb2xDb3VudHM6IHt9LCBhdmFpbGFibGVUb29sczogWydncmVwJywgJ2VkaXQnXSxcblx0XHRcdHR1cm5JbmRleDogMiwgdHVybkR1cmF0aW9uOiAxMjAwLCBtZXNzYWdlQ2hhckxlbjogMTEsXG5cdFx0XHRudW1SZXF1ZXN0czogMSwgdG90YWxUb29sQ2FsbHM6IDAsIHBhcmFsbGVsVG9vbENhbGxSb3VuZHM6IDAsIHBhcmFsbGVsVG9vbENhbGxzVG90YWw6IDAsXG5cdFx0fSk7IC8vIGVtaXR0ZWQ6IHRvb2xzIGF2YWlsYWJsZSwgZXZlbiB0aG91Z2ggbm8gdG9vbCBjYWxscyB3ZXJlIG1hZGVcblx0XHRhd2FpdCByZXBvcnRlci50b29sQ2FsbERldGFpbHMoe1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jywgc2Vzc2lvbiwgdHVybklkOiAnYTFiMmMzZDQtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAwJywgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csIG1vZGVsOiAnZ3B0LXgnLCByZXNwb25zZVR5cGU6ICdjYW5jZWxsZWQnLFxuXHRcdFx0dG9vbENvdW50czogeyBncmVwOiAyLCBlZGl0OiAxIH0sIGF2YWlsYWJsZVRvb2xzOiBbJ2dyZXAnLCAnZWRpdCddLFxuXHRcdFx0dHVybkluZGV4OiAzLCB0dXJuRHVyYXRpb246IDI0MDAsIG1lc3NhZ2VDaGFyTGVuOiB1bmRlZmluZWQsXG5cdFx0XHRudW1SZXF1ZXN0czogMiwgdG90YWxUb29sQ2FsbHM6IDMsIHBhcmFsbGVsVG9vbENhbGxSb3VuZHM6IDEsIHBhcmFsbGVsVG9vbENhbGxzVG90YWw6IDIsXG5cdFx0fSk7IC8vIGVtaXR0ZWRcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5zdGFuZGFyZEV2ZW50cywgW3tcblx0XHRcdGV2ZW50TmFtZTogJ3Rvb2xDYWxsRGV0YWlscycsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdlZGl0b3Jfd2luZG93Jyxcblx0XHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0YWdlbnRTZXNzaW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSxcblx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGZhbHNlLFxuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLFxuXHRcdFx0XHRyZXNwb25zZVR5cGU6ICdzdWNjZXNzJyxcblx0XHRcdFx0dG9vbENvdW50czogSlNPTi5zdHJpbmdpZnkoe30pLFxuXHRcdFx0XHRtb2RlbDogJ2dwdC14Jyxcblx0XHRcdFx0bnVtUmVxdWVzdHM6IDEsXG5cdFx0XHRcdHR1cm5JbmRleDogMixcblx0XHRcdFx0dHVybkR1cmF0aW9uOiAxMjAwLFxuXHRcdFx0XHRtZXNzYWdlQ2hhckxlbjogMTEsXG5cdFx0XHRcdGF2YWlsYWJsZVRvb2xDb3VudDogMixcblx0XHRcdFx0dG90YWxUb29sQ2FsbHM6IDAsXG5cdFx0XHRcdHBhcmFsbGVsVG9vbENhbGxSb3VuZHM6IDAsXG5cdFx0XHRcdHBhcmFsbGVsVG9vbENhbGxzVG90YWw6IDAsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGV2ZW50TmFtZTogJ3Rvb2xDYWxsRGV0YWlscycsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSxcblx0XHRcdFx0cmVxdWVzdElkOiAnYTFiMmMzZDQtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAwJyxcblx0XHRcdFx0cmVzcG9uc2VUeXBlOiAnY2FuY2VsbGVkJyxcblx0XHRcdFx0dG9vbENvdW50czogSlNPTi5zdHJpbmdpZnkoeyBncmVwOiAyLCBlZGl0OiAxIH0pLFxuXHRcdFx0XHRtb2RlbDogJ2dwdC14Jyxcblx0XHRcdFx0bnVtUmVxdWVzdHM6IDIsXG5cdFx0XHRcdHR1cm5JbmRleDogMyxcblx0XHRcdFx0dHVybkR1cmF0aW9uOiAyNDAwLFxuXHRcdFx0XHRtZXNzYWdlQ2hhckxlbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRhdmFpbGFibGVUb29sQ291bnQ6IDIsXG5cdFx0XHRcdHRvdGFsVG9vbENhbGxzOiAzLFxuXHRcdFx0XHRwYXJhbGxlbFRvb2xDYWxsUm91bmRzOiAxLFxuXHRcdFx0XHRwYXJhbGxlbFRvb2xDYWxsc1RvdGFsOiAyLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZW5oYW5jZWRFdmVudHMsIFt7XG5cdFx0XHRldmVudE5hbWU6ICd0b29sQ2FsbERldGFpbHNFeHRlcm5hbCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdHJlcXVlc3RJZDogJ2ExYjJjM2Q0LTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMCcsXG5cdFx0XHRcdG1lc3NhZ2VJZDogJ2ExYjJjM2Q0LTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMCcsXG5cdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdlZGl0b3Jfd2luZG93Jyxcblx0XHRcdFx0cmVzcG9uc2VUeXBlOiAnc3VjY2VzcycsXG5cdFx0XHRcdG1vZGVsOiAnZ3B0LXgnLFxuXHRcdFx0XHR0b29sQ291bnRzOiBKU09OLnN0cmluZ2lmeSh7fSksXG5cdFx0XHRcdGF2YWlsYWJsZVRvb2xzOiBKU09OLnN0cmluZ2lmeShbJ2dyZXAnLCAnZWRpdCddKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnROYW1lOiAndG9vbENhbGxEZXRhaWxzRXh0ZXJuYWwnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLFxuXHRcdFx0XHRtZXNzYWdlSWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLFxuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdHJlc3BvbnNlVHlwZTogJ2NhbmNlbGxlZCcsXG5cdFx0XHRcdG1vZGVsOiAnZ3B0LXgnLFxuXHRcdFx0XHR0b29sQ291bnRzOiBKU09OLnN0cmluZ2lmeSh7IGdyZXA6IDIsIGVkaXQ6IDEgfSksXG5cdFx0XHRcdGF2YWlsYWJsZVRvb2xzOiBKU09OLnN0cmluZ2lmeShbJ2dyZXAnLCAnZWRpdCddKSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmludGVybmFsRXZlbnRzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaW50ZXJuYWxFdmVudHNbMF0uZXZlbnROYW1lLCAndG9vbENhbGxEZXRhaWxzSW50ZXJuYWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pbnRlcm5hbEV2ZW50c1sxXS5ldmVudE5hbWUsICd0b29sQ2FsbERldGFpbHNJbnRlcm5hbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b29sQXBwcm92YWwgZW1pdHMgY2hhdC50b29sQXBwcm92YWwgd2l0aCBBSCBkaXNjcmltaW5hdG9ycyBhbmQgcmVhc29uIG1hcHBpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UmVzdHJpY3RlZFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcihzZXJ2aWNlKTtcblxuXHRcdHJlcG9ydGVyLnRvb2xBcHByb3ZhbCh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLCBzZXNzaW9uLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbElkOiAnZ3JlcCcsIHRvb2xTb3VyY2VLaW5kOiAnaW50ZXJuYWwnLFxuXHRcdFx0Y29uZmlybUtpbmQ6ICdjb25maXJtYXRpb25Ob3ROZWVkZWQnLFxuXHRcdFx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uOiAnYXV0by1hcHByb3ZlLWFsbCcsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRyZXBvcnRlci50b29sQXBwcm92YWwoe1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jywgc2Vzc2lvbiwgdHVybklkOiAndHVybi0yJyxcblx0XHRcdGNsaWVudENvbnRleHQ6IHsgLi4uY3JlYXRlVW5rbm93bkFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQoQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3cpLCBtYWNoaW5lSWQ6ICdjbGllbnQtbWFjaGluZS1pZCcsIGRldkRldmljZUlkOiAnY2xpZW50LWRldi1kZXZpY2UtaWQnIH0sXG5cdFx0XHR0b29sSWQ6ICdiYXNoJywgdG9vbFNvdXJjZUtpbmQ6ICdpbnRlcm5hbCcsXG5cdFx0XHRjb25maXJtS2luZDogJ3VzZXJBY3Rpb24nLFxuXHRcdFx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHRydWUsXG5cdFx0fSk7XG5cdFx0cmVwb3J0ZXIudG9vbEFwcHJvdmFsKHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsIHNlc3Npb24sIHR1cm5JZDogJ3R1cm4tMycsXG5cdFx0XHR0b29sSWQ6ICdteS1tY3AtdG9vbCcsIHRvb2xTb3VyY2VLaW5kOiAnbWNwJyxcblx0XHRcdGNvbmZpcm1LaW5kOiAnZGVuaWVkJyxcblx0XHRcdGNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbjogdW5kZWZpbmVkLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhbmRhcmRFdmVudHMsIFt7XG5cdFx0XHRldmVudE5hbWU6ICdjaGF0LnRvb2xBcHByb3ZhbCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0Y2hhdFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sSWQ6ICdncmVwJyxcblx0XHRcdFx0dG9vbEV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xTb3VyY2VLaW5kOiAnaW50ZXJuYWwnLFxuXHRcdFx0XHRjb25maXJtS2luZDogJ2NvbmZpcm1hdGlvbk5vdE5lZWRlZCcsXG5cdFx0XHRcdHNldHRpbmdJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsbVNlcnZpY2VTY29wZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRjdXN0b21CdXR0b25LaW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbjogJ2F1dG8tYXBwcm92ZS1hbGwnLFxuXHRcdFx0XHRzYW5kYm94V3JhcHBlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnROYW1lOiAnY2hhdC50b29sQXBwcm92YWwnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnZWRpdG9yX3dpbmRvdycsXG5cdFx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0aW5pdGlhdG9yRGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0Y2hhdFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLTInLFxuXHRcdFx0XHR0b29sSWQ6ICdiYXNoJyxcblx0XHRcdFx0dG9vbEV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xTb3VyY2VLaW5kOiAnaW50ZXJuYWwnLFxuXHRcdFx0XHRjb25maXJtS2luZDogJ3VzZXJBY3Rpb24nLFxuXHRcdFx0XHRzZXR0aW5nSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bG1TZXJ2aWNlU2NvcGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y3VzdG9tQnV0dG9uS2luZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb246IHVuZGVmaW5lZCxcblx0XHRcdFx0c2FuZGJveFdyYXBwZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRldmVudE5hbWU6ICdjaGF0LnRvb2xBcHByb3ZhbCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0Y2hhdFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLTMnLFxuXHRcdFx0XHR0b29sSWQ6ICdteS1tY3AtdG9vbCcsXG5cdFx0XHRcdHRvb2xFeHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sU291cmNlS2luZDogJ21jcCcsXG5cdFx0XHRcdGNvbmZpcm1LaW5kOiAnZGVuaWVkJyxcblx0XHRcdFx0c2V0dGluZ0lkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxtU2VydmljZVNjb3BlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGN1c3RvbUJ1dHRvbktpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNhbmRib3hXcmFwcGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm5IdW5nIGVtaXRzIGJvdW5kZWQgbGFzdCBhY3Rpdml0eSBjYXRlZ29yaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIoc2VydmljZSk7XG5cblx0XHRyZXBvcnRlci50dXJuSHVuZyh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRoYW5nUmVhc29uOiAnc3RhbGxlZEFmdGVyUHJvZ3Jlc3MnLFxuXHRcdFx0aGFkQW55UHJvZ3Jlc3M6IHRydWUsXG5cdFx0XHRsYXN0QWN0aXZpdHlLaW5kOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0YmxvY2tlZE9uOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHRvb2xTb3VyY2VLaW5kOiB1bmRlZmluZWQsXG5cdFx0XHRpbkZsaWdodFRvb2xDYWxsQ291bnQ6IDAsXG5cdFx0XHRxdWlldFRpbWVNczogMTAwMCxcblx0XHRcdHR1cm5FbGFwc2VkTXM6IDIwMDAsXG5cdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0bW9kZWxUZWxlbWV0cnlLaW5kOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlbFNlbGVjdGlvbktpbmQ6ICdkZWZhdWx0Jyxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdHJlcG9ydGVyLnR1cm5IdW5nKHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0dHVybklkOiAndHVybi0yJyxcblx0XHRcdGhhbmdSZWFzb246ICdzdGFsbGVkQWZ0ZXJQcm9ncmVzcycsXG5cdFx0XHRoYWRBbnlQcm9ncmVzczogdHJ1ZSxcblx0XHRcdGxhc3RBY3Rpdml0eUtpbmQ6ICdjdXN0b20vcGF0aC92YWx1ZScsXG5cdFx0XHRibG9ja2VkT246IHVuZGVmaW5lZCxcblx0XHRcdHRvb2xJZDogdW5kZWZpbmVkLFxuXHRcdFx0dG9vbFNvdXJjZUtpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGluRmxpZ2h0VG9vbENhbGxDb3VudDogMCxcblx0XHRcdHF1aWV0VGltZU1zOiAxMDAwLFxuXHRcdFx0dHVybkVsYXBzZWRNczogMjAwMCxcblx0XHRcdG1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlbFRlbGVtZXRyeUtpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdG1vZGVsU2VsZWN0aW9uS2luZDogJ2RlZmF1bHQnLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhbmRhcmRFdmVudHMsIFt7XG5cdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QudHVybkh1bmcnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRhZ2VudFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRjaGF0U2Vzc2lvbklkOiBnZXRUZWxlbWV0cnlDaGF0U2Vzc2lvbklkKHNlc3Npb24pLFxuXHRcdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGhhbmdSZWFzb246ICdzdGFsbGVkQWZ0ZXJQcm9ncmVzcycsXG5cdFx0XHRcdGlzRXhwZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRoYWRBbnlQcm9ncmVzczogdHJ1ZSxcblx0XHRcdFx0bGFzdEFjdGl2aXR5S2luZDogJ2NoYXQudG9vbENhbGxEZWx0YScsXG5cdFx0XHRcdGJsb2NrZWRPbjogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5GbGlnaHRUb29sQ2FsbENvdW50OiAwLFxuXHRcdFx0XHRxdWlldFRpbWVNczogMTAwMCxcblx0XHRcdFx0dHVybkVsYXBzZWRNczogMjAwMCxcblx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZWxTZWxlY3Rpb25LaW5kOiAnZGVmYXVsdCcsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QudHVybkh1bmcnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRhZ2VudFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRjaGF0U2Vzc2lvbklkOiBnZXRUZWxlbWV0cnlDaGF0U2Vzc2lvbklkKHNlc3Npb24pLFxuXHRcdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHRcdGhhbmdSZWFzb246ICdzdGFsbGVkQWZ0ZXJQcm9ncmVzcycsXG5cdFx0XHRcdGlzRXhwZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRoYWRBbnlQcm9ncmVzczogdHJ1ZSxcblx0XHRcdFx0bGFzdEFjdGl2aXR5S2luZDogJ290aGVyJyxcblx0XHRcdFx0YmxvY2tlZE9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sU291cmNlS2luZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbkZsaWdodFRvb2xDYWxsQ291bnQ6IDAsXG5cdFx0XHRcdHF1aWV0VGltZU1zOiAxMDAwLFxuXHRcdFx0XHR0dXJuRWxhcHNlZE1zOiAyMDAwLFxuXHRcdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlbFNlbGVjdGlvbktpbmQ6ICdkZWZhdWx0Jyxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b01vZGVSb3V0ZXJEZWNpc2lvbiBtYXBzIGF1dGhvcml0YXRpdmUgU0RLIHJvdXRlciBmaWVsZHMgYW5kIHNjb3JlIHNoYXBlcyB3aXRob3V0IGRlcml2aW5nIHZhbHVlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RSZXN0cmljdGVkVGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlcG9ydGVyID0gbmV3IEFnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyKHNlcnZpY2UpO1xuXG5cdFx0cmVwb3J0ZXIuYXV0b01vZGVSb3V0ZXJEZWNpc2lvbih7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0dHVybklkOiAndHVybi1oeWRyYScsXG5cdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyxcblx0XHRcdGNob3Nlbk1vZGVsOiAnZ3B0LTUnLFxuXHRcdFx0cHJlZGljdGVkTGFiZWw6ICdoaWdoJyxcblx0XHRcdGNvbmZpZGVuY2U6IDAuOSxcblx0XHRcdGNhbmRpZGF0ZU1vZGVsczogWydncHQtNScsICdncHQtNC4xJ10sXG5cdFx0XHRjYXRlZ29yeVNjb3JlczogeyByZWFzb25pbmc6IDAuOCwgY29kZV9nZW46IDAuNywgZGVidWdnaW5nOiAwLjYsIHRvb2xfdXNlOiAwLjUgfSxcblx0XHRcdHJvdXRpbmdNZXRob2Q6ICdoeWRyYScsXG5cdFx0XHRhdmFpbGFibGVNb2RlbHM6IFsnZ3B0LTUnLCAnZ3B0LTQuMScsICdncHQtNS1taW5pJ10sXG5cdFx0XHRmYWxsYmFjazogZmFsc2UsXG5cdFx0XHRmYWxsYmFja1JlYXNvbjogJ25vdC1uZWVkZWQnLFxuXHRcdFx0c3RpY2t5T3ZlcnJpZGU6IHRydWUsXG5cdFx0XHRyb3V0ZXJMYXRlbmN5TXM6IDI1LFxuXHRcdFx0ZW5kVG9FbmRMYXRlbmN5TXM6IDQwLFxuXHRcdFx0Y2hvc2VuU2hvcnRmYWxsOiAwLjA1LFxuXHRcdFx0aGFzSW1hZ2U6IHRydWUsXG5cdFx0fSk7XG5cdFx0cmVwb3J0ZXIuYXV0b01vZGVSb3V0ZXJEZWNpc2lvbih7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0dHVybklkOiAndHVybi1iaW5hcnknLFxuXHRcdFx0Y2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csXG5cdFx0XHRjaG9zZW5Nb2RlbDogJ2dwdC00LjEnLFxuXHRcdFx0cHJlZGljdGVkTGFiZWw6ICdub19yZWFzb25pbmcnLFxuXHRcdFx0Y29uZmlkZW5jZTogdW5kZWZpbmVkLFxuXHRcdFx0Y2FuZGlkYXRlTW9kZWxzOiB1bmRlZmluZWQsXG5cdFx0XHRjYXRlZ29yeVNjb3JlczogeyBuZWVkc19yZWFzb25pbmc6IDAuMiwgbm9fcmVhc29uaW5nOiAwLjggfSxcblx0XHRcdHJvdXRpbmdNZXRob2Q6IHVuZGVmaW5lZCxcblx0XHRcdGF2YWlsYWJsZU1vZGVsczogdW5kZWZpbmVkLFxuXHRcdFx0ZmFsbGJhY2s6IHVuZGVmaW5lZCxcblx0XHRcdGZhbGxiYWNrUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRzdGlja3lPdmVycmlkZTogdW5kZWZpbmVkLFxuXHRcdFx0cm91dGVyTGF0ZW5jeU1zOiB1bmRlZmluZWQsXG5cdFx0XHRlbmRUb0VuZExhdGVuY3lNczogdW5kZWZpbmVkLFxuXHRcdFx0Y2hvc2VuU2hvcnRmYWxsOiB1bmRlZmluZWQsXG5cdFx0XHRoYXNJbWFnZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGV2ZW50czogc2VydmljZS5lbmhhbmNlZEV2ZW50cywgbWVhc3VyZW1lbnRzOiBzZXJ2aWNlLmVuaGFuY2VkTWVhc3VyZW1lbnRzIH0sIHtcblx0XHRcdGV2ZW50czogW3tcblx0XHRcdFx0ZXZlbnROYW1lOiAnYXV0b21vZGUucm91dGVyRGVjaXNpb25SZXN0cmljdGVkJyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdFx0dnNjb2RlUmVxdWVzdElkOiAndHVybi1oeWRyYScsXG5cdFx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ2VkaXRvcl93aW5kb3cnLFxuXHRcdFx0XHRcdHByZWRpY3RlZExhYmVsOiAnaGlnaCcsXG5cdFx0XHRcdFx0cm91dGluZ01ldGhvZDogJ2h5ZHJhJyxcblx0XHRcdFx0XHRmYWxsYmFjazogJ2ZhbHNlJyxcblx0XHRcdFx0XHRmYWxsYmFja1JlYXNvbjogJ25vdC1uZWVkZWQnLFxuXHRcdFx0XHRcdGNhbmRpZGF0ZU1vZGVsOiAnZ3B0LTUnLFxuXHRcdFx0XHRcdGNob3Nlbk1vZGVsOiAnZ3B0LTUnLFxuXHRcdFx0XHRcdGNhbmRpZGF0ZU1vZGVsczogSlNPTi5zdHJpbmdpZnkoWydncHQtNScsICdncHQtNC4xJ10pLFxuXHRcdFx0XHRcdGF2YWlsYWJsZU1vZGVsczogSlNPTi5zdHJpbmdpZnkoWydncHQtNScsICdncHQtNC4xJywgJ2dwdC01LW1pbmknXSksXG5cdFx0XHRcdFx0c3RpY2t5T3ZlcnJpZGVTdHI6ICd0cnVlJyxcblx0XHRcdFx0XHRoYXNJbWFnZTogJ3RydWUnLFxuXHRcdFx0XHRcdGh5ZHJhU2NvcmVzOiBKU09OLnN0cmluZ2lmeSh7IHJlYXNvbmluZzogMC44LCBjb2RlX2dlbjogMC43LCBkZWJ1Z2dpbmc6IDAuNiwgdG9vbF91c2U6IDAuNSB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZXZlbnROYW1lOiAnYXV0b21vZGUucm91dGVyRGVjaXNpb25SZXN0cmljdGVkJyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdFx0dnNjb2RlUmVxdWVzdElkOiAndHVybi1iaW5hcnknLFxuXHRcdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdhZ2VudHNfd2luZG93Jyxcblx0XHRcdFx0XHRwcmVkaWN0ZWRMYWJlbDogJ25vX3JlYXNvbmluZycsXG5cdFx0XHRcdFx0Y2FuZGlkYXRlTW9kZWw6ICcnLFxuXHRcdFx0XHRcdGNob3Nlbk1vZGVsOiAnZ3B0LTQuMScsXG5cdFx0XHRcdFx0Y2FuZGlkYXRlTW9kZWxzOiBKU09OLnN0cmluZ2lmeShbXSksXG5cdFx0XHRcdFx0YmluYXJ5U2NvcmVzOiBKU09OLnN0cmluZ2lmeSh7IG5lZWRzX3JlYXNvbmluZzogMC4yLCBub19yZWFzb25pbmc6IDAuOCB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdFx0bWVhc3VyZW1lbnRzOiBbeyBjb25maWRlbmNlOiAwLjksIGxhdGVuY3lNczogMjUsIGUyZUxhdGVuY3lNczogNDAsIHN0aWNreU92ZXJyaWRlOiAxLCBjaG9zZW5TaG9ydGZhbGw6IDAuMDUgfSwgeyBzY29yZU5lZWRzUmVhc29uaW5nOiAwLjIsIHNjb3JlTm9SZWFzb25pbmc6IDAuOCB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2tpbGxDb250ZW50UmVhZCBlbWl0cyBwbGFpbnRleHQgc2tpbGwgbWV0YWRhdGEgdG8gZW5oYW5jZWQgKyBpbnRlcm5hbCwgbWFwcyBwbHVnaW4gaWRlbnRpdHkgKyBoYXNoZXMgY29udGVudCwgYW5kIG5vLW9wcyB3aXRob3V0IGEgbmFtZScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RSZXN0cmljdGVkVGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlcG9ydGVyID0gbmV3IEFnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyKHNlcnZpY2UpO1xuXG5cdFx0cmVwb3J0ZXIuc2tpbGxDb250ZW50UmVhZCh7IGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93biwgbmFtZTogJycsIHBhdGg6ICcvc2tpbGxzL3gvU0tJTEwubWQnLCBjb250ZW50OiAnYm9keScsIHNvdXJjZTogJ3Byb2plY3QnLCBwbHVnaW5OYW1lOiB1bmRlZmluZWQsIHBsdWdpblZlcnNpb246IHVuZGVmaW5lZCB9KTsgLy8gZHJvcHBlZDogbm8gbmFtZVxuXHRcdHJlcG9ydGVyLnNraWxsQ29udGVudFJlYWQoe1xuXHRcdFx0Y2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csXG5cdFx0XHRuYW1lOiAncGRmJywgcGF0aDogJy9wbHVnaW5zL3BkZi9TS0lMTC5tZCcsIGNvbnRlbnQ6ICdza2lsbCBib2R5Jyxcblx0XHRcdHNvdXJjZTogJ3BsdWdpbicsIHBsdWdpbk5hbWU6ICdwZGYtcGx1Z2luJywgcGx1Z2luVmVyc2lvbjogJzEuMi4zJyxcblx0XHR9KTsgLy8gZW1pdHRlZFxuXG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IElSZXN0cmljdGVkQ2FsbCA9IHtcblx0XHRcdGV2ZW50TmFtZTogJ3NraWxsQ29udGVudFJlYWQnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdHNraWxsTmFtZTogJ3BkZicsXG5cdFx0XHRcdHNraWxsUGF0aDogJy9wbHVnaW5zL3BkZi9TS0lMTC5tZCcsXG5cdFx0XHRcdHNraWxsRXh0ZW5zaW9uSWQ6ICdwZGYtcGx1Z2luJyxcblx0XHRcdFx0c2tpbGxFeHRlbnNpb25WZXJzaW9uOiAnMS4yLjMnLFxuXHRcdFx0XHRza2lsbFN0b3JhZ2U6ICdwbHVnaW4nLFxuXHRcdFx0XHRza2lsbENvbnRlbnRIYXNoOiBTdHJpbmcoaGFzaCgnc2tpbGwgYm9keScpKSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YW5kYXJkOiBzZXJ2aWNlLmdpdGh1YlN0YW5kYXJkRXZlbnRzLFxuXHRcdFx0ZW5oYW5jZWQ6IHNlcnZpY2UuZW5oYW5jZWRFdmVudHMsXG5cdFx0XHRpbnRlcm5hbDogc2VydmljZS5pbnRlcm5hbEV2ZW50cyxcblx0XHR9LCB7XG5cdFx0XHRzdGFuZGFyZDogW3tcblx0XHRcdFx0ZXZlbnROYW1lOiAnc2tpbGxDb250ZW50UmVhZCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdFx0c2tpbGxOYW1lSGFzaDogU3RyaW5nKGhhc2goJ3BkZicpKSxcblx0XHRcdFx0XHRza2lsbEV4dGVuc2lvbklkSGFzaDogU3RyaW5nKGhhc2goJ3BkZi1wbHVnaW4nKSksXG5cdFx0XHRcdFx0c2tpbGxFeHRlbnNpb25WZXJzaW9uOiAnMS4yLjMnLFxuXHRcdFx0XHRcdHNraWxsU3RvcmFnZTogJ3BsdWdpbicsXG5cdFx0XHRcdFx0c2tpbGxDb250ZW50SGFzaDogU3RyaW5nKGhhc2goJ3NraWxsIGJvZHknKSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHRcdGVuaGFuY2VkOiBbZXhwZWN0ZWRdLFxuXHRcdFx0aW50ZXJuYWw6IFtleHBlY3RlZF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9JbmZvIGdhdGVzIGNvbGxlY3Rpb24gYW5kIG11bHRpcGxleGVzIHNpbmstc3BlY2lmaWMgcHJvcGVydGllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RSZXN0cmljdGVkVGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlcG9ydGVyID0gbmV3IEFnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyKHNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgcmVwb3J0ZXIucmVwb3J0UmVwb0luZm8oe1xuXHRcdFx0cmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IHRydWUsXG5cdFx0XHR0cmFja2luZ0lkOiAndHJhY2tpbmctaWQnLFxuXHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQ6ICdodHRwczovL3RlbGVtZXRyeS5leGFtcGxlL3RlbGVtZXRyeScsXG5cdFx0XHRpc0ludGVybmFsOiB0cnVlLFxuXHRcdFx0dXNlck5hbWU6ICdvY3RvY2F0Jyxcblx0XHRcdGlzVnNjb2RlVGVhbU1lbWJlcjogdHJ1ZSxcblx0XHR9LCB7XG5cdFx0XHR0ZWxlbWV0cnlNZXNzYWdlSWQ6ICd0dXJuLTEnLFxuXHRcdFx0Y2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3csXG5cdFx0XHRsb2NhdGlvbjogJ2JlZ2luJyxcblx0XHRcdHJlbW90ZVVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJyxcblx0XHRcdHJlcG9JZDogJ21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0cmVwb1R5cGU6ICdnaXRodWInLFxuXHRcdFx0aGVhZENvbW1pdEhhc2g6ICdhYmMnLFxuXHRcdFx0aGVhZEJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiBKU09OLnN0cmluZ2lmeShbJ3NyYy9hLnRzJ10pLFxuXHRcdFx0ZGlmZnNKU09OOiAneCcucmVwZWF0KDgxOTMpLFxuXHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRpc0FjdGl2ZVJlcG9zaXRvcnk6ICd0cnVlJyxcblx0XHRcdHdvcmtzcGFjZUZpbGVDb3VudDogMTAsXG5cdFx0XHRjaGFuZ2VkRmlsZUNvdW50OiAxLFxuXHRcdFx0ZGlmZlNpemVCeXRlczogODE5Myxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZW5oYW5jZWQ6IHNlcnZpY2UuZW5oYW5jZWRFdmVudHNbMF0sXG5cdFx0XHRpbnRlcm5hbDogc2VydmljZS5pbnRlcm5hbEV2ZW50c1swXSxcblx0XHR9LCB7XG5cdFx0XHRlbmhhbmNlZDoge1xuXHRcdFx0XHRldmVudE5hbWU6ICdyZXF1ZXN0LnJlcG9JbmZvJyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdlZGl0b3Jfd2luZG93Jyxcblx0XHRcdFx0XHRyZW1vdGVVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdFx0cmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdFx0cmVwb1R5cGU6ICdnaXRodWInLFxuXHRcdFx0XHRcdGhlYWRDb21taXRIYXNoOiAnYWJjJyxcblx0XHRcdFx0XHRoZWFkQnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiBKU09OLnN0cmluZ2lmeShbJ3NyYy9hLnRzJ10pLFxuXHRcdFx0XHRcdGRpZmZzSlNPTjogJ3gnLnJlcGVhdCg4MTkyKSxcblx0XHRcdFx0XHRkaWZmc0pTT05DaHVuazogemxpYi5nemlwU3luYyhCdWZmZXIuZnJvbSgneCcucmVwZWF0KDgxOTMpLCAndXRmOCcpKS50b1N0cmluZygnYmFzZTY0JyksXG5cdFx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdFx0aXNBY3RpdmVSZXBvc2l0b3J5OiAndHJ1ZScsXG5cdFx0XHRcdFx0bG9jYXRpb246ICdiZWdpbicsXG5cdFx0XHRcdFx0dGVsZW1ldHJ5TWVzc2FnZUlkOiAndHVybi0xJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRpbnRlcm5hbDoge1xuXHRcdFx0XHRldmVudE5hbWU6ICdyZXF1ZXN0LnJlcG9JbmZvJyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdlZGl0b3Jfd2luZG93Jyxcblx0XHRcdFx0XHRyZW1vdGVVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdFx0cmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdFx0cmVwb1R5cGU6ICdnaXRodWInLFxuXHRcdFx0XHRcdGhlYWRDb21taXRIYXNoOiAnYWJjJyxcblx0XHRcdFx0XHRkaWZmc0pTT046ICd4Jy5yZXBlYXQoODE5MiksXG5cdFx0XHRcdFx0ZGlmZnNKU09OQ2h1bms6IHpsaWIuZ3ppcFN5bmMoQnVmZmVyLmZyb20oJ3gnLnJlcGVhdCg4MTkzKSwgJ3V0ZjgnKSkudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuXHRcdFx0XHRcdHJlc3VsdDogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRcdGlzQWN0aXZlUmVwb3NpdG9yeTogJ3RydWUnLFxuXHRcdFx0XHRcdGxvY2F0aW9uOiAnYmVnaW4nLFxuXHRcdFx0XHRcdHRlbGVtZXRyeU1lc3NhZ2VJZDogJ3R1cm4tMScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lsbENvbnRlbnRSZWFkIGRyb3BzIHRoZSB2ZXJzaW9uIHdoZW4gbm8gcGx1Z2luIG5hbWUgaXMga25vd24sIG1hdGNoaW5nIHRoZSBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UmVzdHJpY3RlZFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcihzZXJ2aWNlKTtcblxuXHRcdHJlcG9ydGVyLnNraWxsQ29udGVudFJlYWQoeyBjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdywgbmFtZTogJ2xvY2FsJywgcGF0aDogJy9za2lsbHMvbG9jYWwvU0tJTEwubWQnLCBjb250ZW50OiAnYycsIHNvdXJjZTogJ3Byb2plY3QnLCBwbHVnaW5OYW1lOiB1bmRlZmluZWQsIHBsdWdpblZlcnNpb246ICc5LjkuOScgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5lbmhhbmNlZEV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmVuaGFuY2VkRXZlbnRzWzBdLnByb3BlcnRpZXM/LnNraWxsRXh0ZW5zaW9uSWQsICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5lbmhhbmNlZEV2ZW50c1swXS5wcm9wZXJ0aWVzPy5za2lsbEV4dGVuc2lvblZlcnNpb24sICcnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFVBQVU7QUFDdEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxZQUFZO0FBQ3JCLFNBQTRDLHNCQUFzQjtBQUNsRSxTQUFTLG9EQUFvRDtBQUM3RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlDQUFpQztBQUUxQyxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQjtBQU8zQixNQUFNLCtCQUEyRjtBQUFBLEVBQWpHO0FBR0MsMEJBQWlCLGVBQWU7QUFDaEMsOEJBQXFCO0FBQ3JCLHFCQUFZO0FBQ1oscUJBQVk7QUFDWixpQkFBUTtBQUNSLHVCQUFjO0FBQ2QsNEJBQW1CO0FBRW5CLFNBQVMsaUJBQW9DLENBQUM7QUFDOUMsU0FBUyx1QkFBaUUsQ0FBQztBQUMzRSxTQUFTLGlCQUFvQyxDQUFDO0FBQzlDLFNBQVMsdUJBQTBDLENBQUM7QUFDcEQsU0FBUyxpQkFBaUYsQ0FBQztBQUFBO0FBQUEsRUFFM0YsWUFBa0I7QUFBQSxFQUFFO0FBQUEsRUFDcEIsaUJBQXVCO0FBQUEsRUFBRTtBQUFBLEVBQ3pCLFdBQVcsV0FBbUIsTUFBNkI7QUFDMUQsU0FBSyxlQUFlLEtBQUssRUFBRSxXQUFXLEtBQUssQ0FBQztBQUFBLEVBQzdDO0FBQUEsRUFDQSxrQkFBd0I7QUFBQSxFQUFFO0FBQUEsRUFDMUIsd0JBQThCO0FBQUEsRUFBRTtBQUFBLEVBQ2hDLG9CQUEwQjtBQUFBLEVBQUU7QUFBQSxFQUU1QixxQkFBcUIsV0FBbUIsWUFBbUM7QUFDMUUs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
