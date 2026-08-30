import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { sortCustomizationEnablement, withCustomizationEnablement } from "../../common/customizationEnablement.js";
import { changesetReducer, chatReducer, sessionReducer } from "../../common/state/protocol/reducers.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ChangesetStatus, ChangesetOperationStatus, CustomizationLoadStatus, MessageKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputRequestPurpose, ChatInputResponseKind, ChatOriginKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ResponsePartKind, ToolCallStatus, TurnState } from "../../common/state/sessionState.js";
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, ToolCallContributorKind } from "../../common/state/protocol/state.js";
function makeSession() {
  return {
    provider: "copilot",
    title: "Test",
    status: SessionStatus.Idle,
    project: { uri: "file:///test-project", displayName: "Test Project" },
    lifecycle: SessionLifecycle.Ready,
    activeClients: [],
    chats: []
  };
}
function makeChat() {
  const now = new Date(Date.now()).toISOString();
  return {
    resource: "ahp-chat://test",
    title: "Test",
    status: SessionStatus.Idle,
    modifiedAt: now,
    origin: { kind: ChatOriginKind.User },
    turns: [],
    activeTurn: void 0
  };
}
function withActiveTurnAndToolCall(state) {
  state = chatReducer(state, {
    type: ActionType.ChatTurnStarted,
    turnId: "turn-1",
    startedAt: "2025-01-01T00:00:00.000Z",
    message: { text: "hello", origin: { kind: MessageKind.User } }
  });
  state = chatReducer(state, {
    type: ActionType.ChatToolCallStart,
    turnId: "turn-1",
    toolCallId: "tc-1",
    toolName: "readFile",
    displayName: "Read File"
  });
  return state;
}
suite("chatReducer \u2013 summaryStatus with tool call confirmations and input requests", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("preserves turn start timestamp and duration after completion", () => {
    let state = chatReducer(makeChat(), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    const activeStartedAt = state.activeTurn?.startedAt;
    state = chatReducer(state, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-1",
      duration: 15e4
    });
    assert.deepStrictEqual({
      activeStartedAt,
      completedStartedAt: state.turns[0].startedAt,
      duration: state.turns[0].duration
    }, {
      activeStartedAt: "2025-01-01T00:00:00.000Z",
      completedStartedAt: "2025-01-01T00:00:00.000Z",
      duration: 15e4
    });
  });
  test("clamps negative terminal duration", () => {
    const active = chatReducer(makeChat(), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    const afterNegativeDuration = chatReducer(active, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-1",
      duration: -5
    });
    assert.deepStrictEqual(afterNegativeDuration.turns[0], {
      id: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      duration: 0,
      message: { text: "hello", origin: { kind: MessageKind.User } },
      responseParts: [],
      usage: void 0,
      state: TurnState.Complete,
      error: void 0
    });
  });
  test("Chat status is InputNeeded when a tool call is PendingConfirmation", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      toolInput: "/foo.ts"
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
  });
  test("Chat status is InputNeeded when a tool call is PendingResultConfirmation", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file",
      toolInput: "/foo.ts",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallComplete,
      turnId: "turn-1",
      toolCallId: "tc-1",
      requiresResultConfirmation: true,
      result: {
        success: true,
        pastTenseMessage: "Read file"
      }
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
  });
  test("SessionStatus transitions from InputNeeded to InProgress when tool call is confirmed", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      toolInput: "/foo.ts"
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
    state = chatReducer(state, {
      type: ActionType.ChatToolCallConfirmed,
      turnId: "turn-1",
      toolCallId: "tc-1",
      approved: true,
      confirmed: ToolCallConfirmationReason.UserAction
    });
    assert.strictEqual(state.status, SessionStatus.InProgress);
  });
  test("Chat status is InputNeeded with an unresolved input request response part", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatInputRequested,
      request: {
        id: "req-1",
        purpose: ChatInputRequestPurpose.AskUser,
        message: "What is your name?",
        questions: [{
          kind: ChatInputQuestionKind.Text,
          id: "q-1",
          message: "What is your name?",
          required: true
        }]
      }
    });
    assert.deepStrictEqual({
      status: state.status,
      responsePart: state.activeTurn?.responseParts.at(-1)
    }, {
      status: SessionStatus.InputNeeded,
      responsePart: {
        kind: ResponsePartKind.InputRequest,
        request: {
          id: "req-1",
          purpose: ChatInputRequestPurpose.AskUser,
          message: "What is your name?",
          questions: [{
            kind: ChatInputQuestionKind.Text,
            id: "q-1",
            message: "What is your name?",
            required: true
          }]
        }
      }
    });
  });
  test("ChatInputRequested replacement preserves purpose and synchronized answers through completion", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatInputRequested,
      request: {
        id: "req-1",
        purpose: ChatInputRequestPurpose.AskUser,
        questions: [{ kind: ChatInputQuestionKind.Text, id: "q-1", message: "First?" }]
      }
    });
    state = chatReducer(state, {
      type: ActionType.ChatInputAnswerChanged,
      requestId: "req-1",
      questionId: "q-1",
      answer: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "answer" } }
    });
    state = chatReducer(state, {
      type: ActionType.ChatInputRequested,
      request: {
        id: "req-1",
        purpose: ChatInputRequestPurpose.AskUser,
        questions: [{ kind: ChatInputQuestionKind.Text, id: "q-1", message: "Updated?" }]
      }
    });
    state = chatReducer(state, {
      type: ActionType.ChatInputCompleted,
      requestId: "req-1",
      response: ChatInputResponseKind.Accept
    });
    assert.deepStrictEqual(state.activeTurn?.responseParts.at(-1), {
      kind: ResponsePartKind.InputRequest,
      request: {
        id: "req-1",
        purpose: ChatInputRequestPurpose.AskUser,
        questions: [{ kind: ChatInputQuestionKind.Text, id: "q-1", message: "Updated?" }],
        answers: {
          "q-1": { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "answer" } }
        }
      },
      response: ChatInputResponseKind.Accept
    });
  });
  test("ChatInputRequested without an active turn is ignored", () => {
    const state = chatReducer(makeChat(), {
      type: ActionType.ChatInputRequested,
      request: { id: "req-1", questions: [] }
    });
    assert.deepStrictEqual({
      status: state.status,
      activeTurn: state.activeTurn
    }, {
      status: SessionStatus.Idle,
      activeTurn: void 0
    });
  });
  test("SessionStatus transitions from InputNeeded to InProgress after ChatInputCompleted", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatInputRequested,
      request: {
        id: "req-1",
        purpose: ChatInputRequestPurpose.AskUser,
        message: "What is your name?",
        questions: [{
          kind: ChatInputQuestionKind.Text,
          id: "q-1",
          message: "What is your name?",
          required: true
        }]
      }
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
    state = chatReducer(state, {
      type: ActionType.ChatInputCompleted,
      requestId: "req-1",
      response: ChatInputResponseKind.Accept,
      answers: { "q-1": { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "Alice" } } }
    });
    assert.deepStrictEqual({
      status: state.status,
      responsePart: state.activeTurn?.responseParts.at(-1)
    }, {
      status: SessionStatus.InProgress,
      responsePart: {
        kind: ResponsePartKind.InputRequest,
        request: {
          id: "req-1",
          purpose: ChatInputRequestPurpose.AskUser,
          message: "What is your name?",
          questions: [{
            kind: ChatInputQuestionKind.Text,
            id: "q-1",
            message: "What is your name?",
            required: true
          }],
          answers: {
            "q-1": {
              state: ChatInputAnswerState.Submitted,
              value: { kind: ChatInputAnswerValueKind.Text, value: "Alice" }
            }
          }
        },
        response: ChatInputResponseKind.Accept
      }
    });
  });
  test("Tool call transition to PendingConfirmation updates chat status to InputNeeded", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    assert.strictEqual(state.status, SessionStatus.InProgress);
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      toolInput: "/foo.ts"
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
  });
  test("ChatToolCallReady preserves action metadata on pending and running tool calls", () => {
    const state = withActiveTurnAndToolCall(makeChat());
    const pending = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      toolInput: "/foo.ts",
      _meta: { autoApproveBySetting: true }
    });
    const running = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file",
      toolInput: "/foo.ts",
      confirmed: ToolCallConfirmationReason.NotNeeded,
      _meta: { autoApproveBySetting: true }
    });
    const getToolCall = (s) => {
      const part = s.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === "tc-1");
      assert.ok(part?.kind === ResponsePartKind.ToolCall);
      return part.toolCall;
    };
    assert.deepStrictEqual([
      { status: getToolCall(pending).status, meta: getToolCall(pending)._meta },
      { status: getToolCall(running).status, meta: getToolCall(running)._meta }
    ], [
      { status: ToolCallStatus.PendingConfirmation, meta: { autoApproveBySetting: true } },
      { status: ToolCallStatus.Running, meta: { autoApproveBySetting: true } }
    ]);
  });
  test("ChatToolCallDelta can update the invocation message without exposing partial input", () => {
    let state = chatReducer(makeChat(), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tc-1",
      toolName: "edit",
      displayName: "Edit File"
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallDelta,
      turnId: "turn-1",
      toolCallId: "tc-1",
      content: "",
      invocationMessage: "Replacing 2 lines with 3 lines"
    });
    const part = state.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall);
    assert.ok(part?.kind === ResponsePartKind.ToolCall);
    assert.deepStrictEqual({
      invocationMessage: part.toolCall.status === ToolCallStatus.Streaming ? part.toolCall.invocationMessage : void 0,
      partialInput: part.toolCall.status === ToolCallStatus.Streaming ? part.toolCall.partialInput : void 0
    }, {
      invocationMessage: "Replacing 2 lines with 3 lines",
      partialInput: ""
    });
  });
  test("ChatToolCallReady replaces provisional contributor and intention", () => {
    let state = chatReducer(makeChat(), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tc-1",
      toolName: "mcp_tool",
      displayName: "MCP Tool",
      intention: "Query"
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
      intention: "Query project metadata",
      invocationMessage: "Querying project metadata",
      toolInput: '{"query":"metadata"}',
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    const part = state.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall);
    assert.ok(part?.kind === ResponsePartKind.ToolCall);
    assert.deepStrictEqual({
      status: part.toolCall.status,
      contributor: part.toolCall.contributor,
      intention: part.toolCall.intention
    }, {
      status: ToolCallStatus.Running,
      contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
      intention: "Query project metadata"
    });
  });
  test("ChatToolCallReady cannot change client execution ownership", () => {
    const readyContributor = (startContributor, contributor) => {
      let state = chatReducer(makeChat(), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      state = chatReducer(state, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-1",
        toolName: "tool",
        displayName: "Tool",
        contributor: startContributor
      });
      state = chatReducer(state, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-1",
        contributor,
        invocationMessage: "Running tool",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const part = state.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall);
      assert.ok(part?.kind === ResponsePartKind.ToolCall);
      return part.toolCall.contributor;
    };
    assert.deepStrictEqual([
      readyContributor(void 0, { kind: ToolCallContributorKind.Client, clientId: "client-1" }),
      readyContributor(
        { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
        { kind: ToolCallContributorKind.Client, clientId: "client-1" }
      ),
      readyContributor(
        { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        { kind: ToolCallContributorKind.Client, clientId: "client-2" }
      ),
      readyContributor(
        { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        { kind: ToolCallContributorKind.Client, clientId: "client-1" }
      )
    ], [
      void 0,
      { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
      { kind: ToolCallContributorKind.Client, clientId: "client-1" },
      { kind: ToolCallContributorKind.Client, clientId: "client-1" }
    ]);
  });
  test("ChatToolCallReady updates an asynchronous judge result on a pending confirmation", () => {
    const loading = chatReducer(withActiveTurnAndToolCall(makeChat()), {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      confirmationTitle: "Read file",
      toolInput: "/foo.ts",
      riskAssessment: {
        kind: ToolCallRiskAssessmentKind.Judge,
        status: ToolCallRiskAssessmentStatus.Loading
      }
    });
    const complete = chatReducer(loading, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      riskAssessment: {
        kind: ToolCallRiskAssessmentKind.Judge,
        status: ToolCallRiskAssessmentStatus.Complete,
        reason: "This reads a sensitive file.",
        safety: 0.2
      }
    });
    const part = complete.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === "tc-1");
    assert.ok(part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation);
    assert.deepStrictEqual({
      confirmationTitle: part.toolCall.confirmationTitle,
      toolInput: part.toolCall.toolInput,
      riskAssessment: part.toolCall.riskAssessment
    }, {
      confirmationTitle: "Read file",
      toolInput: "/foo.ts",
      riskAssessment: {
        kind: ToolCallRiskAssessmentKind.Judge,
        status: ToolCallRiskAssessmentStatus.Complete,
        reason: "This reads a sensitive file.",
        safety: 0.2
      }
    });
  });
});
suite("changesetReducer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const ready = { status: ChangesetStatus.Ready, files: [] };
  const fileA = { id: "file:///a.ts", edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 1, removed: 0 } } };
  const fileARenamed = { id: "file:///a.ts", edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 5, removed: 0 } } };
  test("ChangesetFileSet appends a new file", () => {
    const next = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    assert.deepStrictEqual(next.files, [fileA]);
  });
  test("ChangesetFileSet replaces an existing file by id (upsert)", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetFileSet, file: fileARenamed });
    assert.deepStrictEqual(next.files, [fileARenamed]);
  });
  test("ChangesetFileRemoved removes by id", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetFileRemoved, fileId: fileA.id });
    assert.deepStrictEqual(next.files, []);
  });
  test("ChangesetFileRemoved is a no-op for an unknown id", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetFileRemoved, fileId: "file:///nope.ts" });
    assert.strictEqual(next, seeded);
  });
  test("ChangesetStatusChanged \u2192 Error attaches the error", () => {
    const err = { errorType: "computeFailed", message: "boom" };
    const next = changesetReducer(ready, { type: ActionType.ChangesetStatusChanged, status: ChangesetStatus.Error, error: err });
    assert.deepStrictEqual({ status: next.status, error: next.error }, { status: ChangesetStatus.Error, error: err });
  });
  test("ChangesetStatusChanged \u2192 Ready strips a previous error", () => {
    const errored = { status: ChangesetStatus.Error, error: { errorType: "x", message: "y" }, files: [fileA] };
    const next = changesetReducer(errored, { type: ActionType.ChangesetStatusChanged, status: ChangesetStatus.Ready });
    assert.deepStrictEqual({ status: next.status, error: next.error, files: next.files }, { status: ChangesetStatus.Ready, error: void 0, files: [fileA] });
  });
  test("ChangesetOperationsChanged with array replaces operations", () => {
    const ops = [{ id: "stage", label: "Stage", scopes: [], status: ChangesetOperationStatus.Idle }];
    const next = changesetReducer(ready, { type: ActionType.ChangesetOperationsChanged, operations: ops });
    assert.deepStrictEqual(next.operations, ops);
  });
  test("ChangesetOperationsChanged with undefined strips operations", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetOperationsChanged, operations: [{ id: "stage", label: "Stage", scopes: [], status: ChangesetOperationStatus.Idle }] });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetOperationsChanged, operations: void 0 });
    assert.strictEqual(next.operations, void 0);
  });
  test("ChangesetCleared empties files", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetCleared });
    assert.deepStrictEqual(next.files, []);
  });
  test("ChangesetCleared is a no-op when files are already empty", () => {
    const next = changesetReducer(ready, { type: ActionType.ChangesetCleared });
    assert.strictEqual(next, ready);
  });
});
suite("sessionReducer \u2013 SessionCustomizationUpdated", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const agentA = { type: CustomizationType.Agent, id: "file:///plugin-a/agents/helper.md", uri: "file:///plugin-a/agents/helper.md", name: "helper" };
  const agentB = { type: CustomizationType.Agent, id: "file:///plugin-a/agents/reviewer.md", uri: "file:///plugin-a/agents/reviewer.md", name: "reviewer", description: "reviews code" };
  function pluginA(extra = {}) {
    return {
      type: CustomizationType.Plugin,
      id: "file:///plugin-a",
      uri: "file:///plugin-a",
      name: "Plugin A",
      ...extra
    };
  }
  test("insert: appends a new top-level customization with its children", () => {
    const customization = pluginA({ load: { kind: CustomizationLoadStatus.Loaded }, children: [agentA, agentB] });
    const state = sessionReducer(makeSession(), {
      type: ActionType.SessionCustomizationUpdated,
      customization
    });
    assert.deepStrictEqual(state.customizations, [customization]);
  });
  test("update: replaces the matching entry entirely", () => {
    const initial = pluginA({ load: { kind: CustomizationLoadStatus.Loading }, children: [agentA] });
    const seeded = sessionReducer(makeSession(), {
      type: ActionType.SessionCustomizationUpdated,
      customization: initial
    });
    const updated = pluginA({ load: { kind: CustomizationLoadStatus.Loaded }, children: [agentB] });
    const next = sessionReducer(seeded, {
      type: ActionType.SessionCustomizationUpdated,
      customization: updated
    });
    assert.deepStrictEqual(next.customizations, [updated]);
  });
});
suite("customization enablement", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("sorts stably and replaces decisions for one scope", () => {
    const workspaceFirst = { kind: CustomizationEnablementKind.Workspace, uri: "file:///one", enabled: false };
    const workspaceSecond = { kind: CustomizationEnablementKind.Workspace, uri: "file:///two", enabled: true };
    const global = { kind: CustomizationEnablementKind.Global, enabled: false };
    const session = { kind: CustomizationEnablementKind.Session, enabled: true };
    assert.deepStrictEqual(
      withCustomizationEnablement([workspaceFirst, global, workspaceSecond, session], CustomizationEnablementKind.Workspace, { kind: CustomizationEnablementKind.Workspace, uri: "file:///three", enabled: false }),
      [session, { kind: CustomizationEnablementKind.Workspace, uri: "file:///three", enabled: false }, global]
    );
    assert.deepStrictEqual(
      sortCustomizationEnablement([workspaceFirst, global, workspaceSecond, session]),
      [session, workspaceFirst, workspaceSecond, global]
    );
  });
  test("replaces enablement for plugins and MCP servers while retaining child enablement transitions", () => {
    const plugin = {
      type: CustomizationType.Plugin,
      id: "plugin",
      uri: "file:///plugin",
      name: "Plugin",
      children: [{
        type: CustomizationType.Agent,
        id: "agent",
        uri: "file:///plugin/agent.md",
        name: "Agent"
      }]
    };
    const mcp = {
      type: CustomizationType.McpServer,
      id: "mcp",
      uri: "file:///mcp.json",
      name: "MCP",
      state: { kind: McpServerStatus.Stopped }
    };
    const seeded = { ...makeSession(), customizations: [plugin, mcp] };
    const withSet = sessionReducer(seeded, {
      type: ActionType.SessionCustomizationToggled,
      id: "plugin",
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
    });
    const withMcpSet = sessionReducer(withSet, {
      type: ActionType.SessionCustomizationToggled,
      id: "mcp",
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
    });
    const withChange = sessionReducer(withMcpSet, {
      type: ActionType.SessionCustomizationToggled,
      id: "plugin",
      enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }]
    });
    const withMcpChange = sessionReducer(withChange, {
      type: ActionType.SessionCustomizationToggled,
      id: "mcp",
      enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }]
    });
    const withClear = sessionReducer(withMcpChange, {
      type: ActionType.SessionCustomizationToggled,
      id: "plugin",
      enablement: []
    });
    const withMcpClear = sessionReducer(withClear, {
      type: ActionType.SessionCustomizationToggled,
      id: "mcp",
      enablement: []
    });
    const withChildSet = sessionReducer(withMcpClear, {
      type: ActionType.SessionCustomizationToggled,
      id: "agent",
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
    });
    const withChildClear = sessionReducer(withChildSet, {
      type: ActionType.SessionCustomizationToggled,
      id: "agent",
      enablement: []
    });
    assert.deepStrictEqual([
      withSet.customizations,
      withMcpSet.customizations,
      withChange.customizations,
      withMcpChange.customizations,
      withClear.customizations,
      withMcpClear.customizations,
      withChildSet.customizations,
      withChildClear.customizations
    ], [
      [{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }, mcp],
      [{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }, { ...mcp, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }],
      [{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }] }, { ...mcp, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }],
      [{ ...plugin, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }] }, { ...mcp, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }] }],
      [plugin, { ...mcp, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }] }],
      [plugin, mcp],
      [{ ...plugin, children: [{ ...plugin.children[0], enabled: false }] }, mcp],
      [{ ...plugin, children: [{ ...plugin.children[0], enabled: true }] }, mcp]
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxyZWR1Y2Vycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBzb3J0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQsIHdpdGhDdXN0b21pemF0aW9uRW5hYmxlbWVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBjaGFuZ2VzZXRSZWR1Y2VyLCBjaGF0UmVkdWNlciwgc2Vzc2lvblJlZHVjZXIgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvcmVkdWNlcnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzZXRTdGF0dXMsIENoYW5nZXNldE9wZXJhdGlvblN0YXR1cywgQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMsIE1lc3NhZ2VLaW5kLCBDaGF0SW5wdXRBbnN3ZXJTdGF0ZSwgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIENoYXRPcmlnaW5LaW5kLCBTZXNzaW9uTGlmZWN5Y2xlLCBTZXNzaW9uU3RhdHVzLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxSaXNrQXNzZXNzbWVudEtpbmQsIFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMsIFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsU3RhdHVzLCBUdXJuU3RhdGUsIHR5cGUgQWdlbnRDdXN0b21pemF0aW9uLCB0eXBlIENoYW5nZXNldFN0YXRlLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBDaGF0U3RhdGUsIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJTdGF0dXMsIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCB0eXBlIFRvb2xDYWxsQ29udHJpYnV0b3IgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuXG5mdW5jdGlvbiBtYWtlU2Vzc2lvbigpOiBTZXNzaW9uU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdGNoYXRzOiBbXSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZUNoYXQoKTogQ2hhdFN0YXRlIHtcblx0Y29uc3Qgbm93ID0gbmV3IERhdGUoRGF0ZS5ub3coKSkudG9JU09TdHJpbmcoKTtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZTogJ2FocC1jaGF0Oi8vdGVzdCcsXG5cdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRtb2RpZmllZEF0OiBub3csXG5cdFx0b3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlVzZXIgfSxcblx0XHR0dXJuczogW10sXG5cdFx0YWN0aXZlVHVybjogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB3aXRoQWN0aXZlVHVybkFuZFRvb2xDYWxsKHN0YXRlOiBDaGF0U3RhdGUpOiBDaGF0U3RhdGUge1xuXHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHR9KTtcblx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0dHVybklkOiAndHVybi0xJyxcblx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0dG9vbE5hbWU6ICdyZWFkRmlsZScsXG5cdFx0ZGlzcGxheU5hbWU6ICdSZWFkIEZpbGUnLFxuXHR9KTtcblx0cmV0dXJuIHN0YXRlO1xufVxuXG5zdWl0ZSgnY2hhdFJlZHVjZXIgXHUyMDEzIHN1bW1hcnlTdGF0dXMgd2l0aCB0b29sIGNhbGwgY29uZmlybWF0aW9ucyBhbmQgaW5wdXQgcmVxdWVzdHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncHJlc2VydmVzIHR1cm4gc3RhcnQgdGltZXN0YW1wIGFuZCBkdXJhdGlvbiBhZnRlciBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZSA9IGNoYXRSZWR1Y2VyKG1ha2VDaGF0KCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3RpdmVTdGFydGVkQXQgPSBzdGF0ZS5hY3RpdmVUdXJuPy5zdGFydGVkQXQ7XG5cdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdGR1cmF0aW9uOiAxNTBfMDAwLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY3RpdmVTdGFydGVkQXQsXG5cdFx0XHRjb21wbGV0ZWRTdGFydGVkQXQ6IHN0YXRlLnR1cm5zWzBdLnN0YXJ0ZWRBdCxcblx0XHRcdGR1cmF0aW9uOiBzdGF0ZS50dXJuc1swXS5kdXJhdGlvbixcblx0XHR9LCB7XG5cdFx0XHRhY3RpdmVTdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0Y29tcGxldGVkU3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdGR1cmF0aW9uOiAxNTBfMDAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGFtcHMgbmVnYXRpdmUgdGVybWluYWwgZHVyYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0aXZlID0gY2hhdFJlZHVjZXIobWFrZUNoYXQoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFmdGVyTmVnYXRpdmVEdXJhdGlvbiA9IGNoYXRSZWR1Y2VyKGFjdGl2ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdGR1cmF0aW9uOiAtNSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWZ0ZXJOZWdhdGl2ZUR1cmF0aW9uLnR1cm5zWzBdLCB7XG5cdFx0XHRpZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0ZHVyYXRpb246IDAsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0IHN0YXR1cyBpcyBJbnB1dE5lZWRlZCB3aGVuIGEgdG9vbCBjYWxsIGlzIFBlbmRpbmdDb25maXJtYXRpb24nLCAoKSA9PiB7XG5cdFx0bGV0IHN0YXRlID0gd2l0aEFjdGl2ZVR1cm5BbmRUb29sQ2FsbChtYWtlQ2hhdCgpKTtcblxuXHRcdC8vIFRyYW5zaXRpb24gdG8gUGVuZGluZ0NvbmZpcm1hdGlvbiAobm8gYGNvbmZpcm1lZGAgZmllbGQpXG5cdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWQgZmlsZT8nLFxuXHRcdFx0dG9vbElucHV0OiAnL2Zvby50cycsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuc3RhdHVzLCBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkKTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhdCBzdGF0dXMgaXMgSW5wdXROZWVkZWQgd2hlbiBhIHRvb2wgY2FsbCBpcyBQZW5kaW5nUmVzdWx0Q29uZmlybWF0aW9uJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZSA9IHdpdGhBY3RpdmVUdXJuQW5kVG9vbENhbGwobWFrZUNoYXQoKSk7XG5cblx0XHQvLyBUcmFuc2l0aW9uIHRvIFJ1bm5pbmcgZmlyc3Rcblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlJyxcblx0XHRcdHRvb2xJbnB1dDogJy9mb28udHMnLFxuXHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0fSk7XG5cblx0XHQvLyBUaGVuIGNvbXBsZXRlIHdpdGggcmVxdWlyZXNSZXN1bHRDb25maXJtYXRpb25cblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdHJlcXVpcmVzUmVzdWx0Q29uZmlybWF0aW9uOiB0cnVlLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSZWFkIGZpbGUnXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXR1cywgU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Nlc3Npb25TdGF0dXMgdHJhbnNpdGlvbnMgZnJvbSBJbnB1dE5lZWRlZCB0byBJblByb2dyZXNzIHdoZW4gdG9vbCBjYWxsIGlzIGNvbmZpcm1lZCcsICgpID0+IHtcblx0XHRsZXQgc3RhdGUgPSB3aXRoQWN0aXZlVHVybkFuZFRvb2xDYWxsKG1ha2VDaGF0KCkpO1xuXG5cdFx0Ly8gVHJhbnNpdGlvbiB0byBQZW5kaW5nQ29uZmlybWF0aW9uXG5cdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWQgZmlsZT8nLFxuXHRcdFx0dG9vbElucHV0OiAnL2Zvby50cycsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXR1cywgU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZCk7XG5cblx0XHQvLyBDb25maXJtIGl0XG5cdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuc3RhdHVzLCBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0IHN0YXR1cyBpcyBJbnB1dE5lZWRlZCB3aXRoIGFuIHVucmVzb2x2ZWQgaW5wdXQgcmVxdWVzdCByZXNwb25zZSBwYXJ0JywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZSA9IHdpdGhBY3RpdmVUdXJuQW5kVG9vbENhbGwobWFrZUNoYXQoKSk7XG5cblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCxcblx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0aWQ6ICdyZXEtMScsXG5cdFx0XHRcdHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkFza1VzZXIsXG5cdFx0XHRcdG1lc3NhZ2U6ICdXaGF0IGlzIHlvdXIgbmFtZT8nLFxuXHRcdFx0XHRxdWVzdGlvbnM6IFt7XG5cdFx0XHRcdFx0a2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsXG5cdFx0XHRcdFx0aWQ6ICdxLTEnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdXaGF0IGlzIHlvdXIgbmFtZT8nLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiB0cnVlXG5cdFx0XHRcdH1dXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0dXM6IHN0YXRlLnN0YXR1cyxcblx0XHRcdHJlc3BvbnNlUGFydDogc3RhdGUuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5hdCgtMSksXG5cdFx0fSwge1xuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkLFxuXHRcdFx0cmVzcG9uc2VQYXJ0OiB7XG5cdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0LFxuXHRcdFx0XHRyZXF1ZXN0OiB7XG5cdFx0XHRcdFx0aWQ6ICdyZXEtMScsXG5cdFx0XHRcdFx0cHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuQXNrVXNlcixcblx0XHRcdFx0XHRtZXNzYWdlOiAnV2hhdCBpcyB5b3VyIG5hbWU/Jyxcblx0XHRcdFx0XHRxdWVzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCxcblx0XHRcdFx0XHRcdGlkOiAncS0xJyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6ICdXaGF0IGlzIHlvdXIgbmFtZT8nLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0SW5wdXRSZXF1ZXN0ZWQgcmVwbGFjZW1lbnQgcHJlc2VydmVzIHB1cnBvc2UgYW5kIHN5bmNocm9uaXplZCBhbnN3ZXJzIHRocm91Z2ggY29tcGxldGlvbicsICgpID0+IHtcblx0XHRsZXQgc3RhdGUgPSB3aXRoQWN0aXZlVHVybkFuZFRvb2xDYWxsKG1ha2VDaGF0KCkpO1xuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0cHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuQXNrVXNlcixcblx0XHRcdFx0cXVlc3Rpb25zOiBbeyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCwgaWQ6ICdxLTEnLCBtZXNzYWdlOiAnRmlyc3Q/JyB9XSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRBbnN3ZXJDaGFuZ2VkLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxLTEnLFxuXHRcdFx0cXVlc3Rpb25JZDogJ3EtMScsXG5cdFx0XHRhbnN3ZXI6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnYW5zd2VyJyB9IH0sXG5cdFx0fSk7XG5cdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsXG5cdFx0XHRyZXF1ZXN0OiB7XG5cdFx0XHRcdGlkOiAncmVxLTEnLFxuXHRcdFx0XHRwdXJwb3NlOiBDaGF0SW5wdXRSZXF1ZXN0UHVycG9zZS5Bc2tVc2VyLFxuXHRcdFx0XHRxdWVzdGlvbnM6IFt7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0LCBpZDogJ3EtMScsIG1lc3NhZ2U6ICdVcGRhdGVkPycgfV0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxLTEnLFxuXHRcdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuYXQoLTEpLCB7XG5cdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLklucHV0UmVxdWVzdCxcblx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0aWQ6ICdyZXEtMScsXG5cdFx0XHRcdHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkFza1VzZXIsXG5cdFx0XHRcdHF1ZXN0aW9uczogW3sga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsIGlkOiAncS0xJywgbWVzc2FnZTogJ1VwZGF0ZWQ/JyB9XSxcblx0XHRcdFx0YW5zd2Vyczoge1xuXHRcdFx0XHRcdCdxLTEnOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ2Fuc3dlcicgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0SW5wdXRSZXF1ZXN0ZWQgd2l0aG91dCBhbiBhY3RpdmUgdHVybiBpcyBpZ25vcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY2hhdFJlZHVjZXIobWFrZUNoYXQoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsXG5cdFx0XHRyZXF1ZXN0OiB7IGlkOiAncmVxLTEnLCBxdWVzdGlvbnM6IFtdIH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogc3RhdGUuc3RhdHVzLFxuXHRcdFx0YWN0aXZlVHVybjogc3RhdGUuYWN0aXZlVHVybixcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGFjdGl2ZVR1cm46IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU2Vzc2lvblN0YXR1cyB0cmFuc2l0aW9ucyBmcm9tIElucHV0TmVlZGVkIHRvIEluUHJvZ3Jlc3MgYWZ0ZXIgQ2hhdElucHV0Q29tcGxldGVkJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZSA9IHdpdGhBY3RpdmVUdXJuQW5kVG9vbENhbGwobWFrZUNoYXQoKSk7XG5cblx0XHQvLyBBZGQgYW4gaW5wdXQgcmVxdWVzdFxuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0cHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuQXNrVXNlcixcblx0XHRcdFx0bWVzc2FnZTogJ1doYXQgaXMgeW91ciBuYW1lPycsXG5cdFx0XHRcdHF1ZXN0aW9uczogW3tcblx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCxcblx0XHRcdFx0XHRpZDogJ3EtMScsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ1doYXQgaXMgeW91ciBuYW1lPycsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IHRydWVcblx0XHRcdFx0fV1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXR1cywgU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZCk7XG5cblx0XHQvLyBDb21wbGV0ZSB0aGUgaW5wdXQgcmVxdWVzdFxuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxLTEnLFxuXHRcdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0XHRhbnN3ZXJzOiB7ICdxLTEnOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ0FsaWNlJyB9IH0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBzdGF0ZS5zdGF0dXMsXG5cdFx0XHRyZXNwb25zZVBhcnQ6IHN0YXRlLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuYXQoLTEpLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLFxuXHRcdFx0cmVzcG9uc2VQYXJ0OiB7XG5cdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0LFxuXHRcdFx0XHRyZXF1ZXN0OiB7XG5cdFx0XHRcdFx0aWQ6ICdyZXEtMScsXG5cdFx0XHRcdFx0cHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuQXNrVXNlcixcblx0XHRcdFx0XHRtZXNzYWdlOiAnV2hhdCBpcyB5b3VyIG5hbWU/Jyxcblx0XHRcdFx0XHRxdWVzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCxcblx0XHRcdFx0XHRcdGlkOiAncS0xJyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6ICdXaGF0IGlzIHlvdXIgbmFtZT8nLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0YW5zd2Vyczoge1xuXHRcdFx0XHRcdFx0J3EtMSc6IHtcblx0XHRcdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnQWxpY2UnIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnVG9vbCBjYWxsIHRyYW5zaXRpb24gdG8gUGVuZGluZ0NvbmZpcm1hdGlvbiB1cGRhdGVzIGNoYXQgc3RhdHVzIHRvIElucHV0TmVlZGVkJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZSA9IHdpdGhBY3RpdmVUdXJuQW5kVG9vbENhbGwobWFrZUNoYXQoKSk7XG5cblx0XHQvLyBBZnRlciBDaGF0VG9vbENhbGxTdGFydCwgc3RhdHVzIHNob3VsZCBiZSBJblByb2dyZXNzICh0b29sIGlzIFN0cmVhbWluZylcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuc3RhdHVzLCBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXG5cdFx0Ly8gVHJhbnNpdGlvbiB0byBQZW5kaW5nQ29uZmlybWF0aW9uIHZpYSBDaGF0VG9vbENhbGxSZWFkeSAobm8gY29uZmlybWVkKVxuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIGZpbGU/Jyxcblx0XHRcdHRvb2xJbnB1dDogJy9mb28udHMnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXR1cywgU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYXRUb29sQ2FsbFJlYWR5IHByZXNlcnZlcyBhY3Rpb24gbWV0YWRhdGEgb24gcGVuZGluZyBhbmQgcnVubmluZyB0b29sIGNhbGxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gd2l0aEFjdGl2ZVR1cm5BbmRUb29sQ2FsbChtYWtlQ2hhdCgpKTtcblx0XHRjb25zdCBwZW5kaW5nID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIGZpbGU/Jyxcblx0XHRcdHRvb2xJbnB1dDogJy9mb28udHMnLFxuXHRcdFx0X21ldGE6IHsgYXV0b0FwcHJvdmVCeVNldHRpbmc6IHRydWUgfSxcblx0XHR9KTtcblx0XHRjb25zdCBydW5uaW5nID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIGZpbGUnLFxuXHRcdFx0dG9vbElucHV0OiAnL2Zvby50cycsXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdF9tZXRhOiB7IGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBnZXRUb29sQ2FsbCA9IChzOiBDaGF0U3RhdGUpID0+IHtcblx0XHRcdGNvbnN0IHBhcnQgPSBzLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy0xJyk7XG5cdFx0XHRhc3NlcnQub2socGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRyZXR1cm4gcGFydC50b29sQ2FsbDtcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0eyBzdGF0dXM6IGdldFRvb2xDYWxsKHBlbmRpbmcpLnN0YXR1cywgbWV0YTogZ2V0VG9vbENhbGwocGVuZGluZykuX21ldGEgfSxcblx0XHRcdHsgc3RhdHVzOiBnZXRUb29sQ2FsbChydW5uaW5nKS5zdGF0dXMsIG1ldGE6IGdldFRvb2xDYWxsKHJ1bm5pbmcpLl9tZXRhIH0sXG5cdFx0XSwgW1xuXHRcdFx0eyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sIG1ldGE6IHsgYXV0b0FwcHJvdmVCeVNldHRpbmc6IHRydWUgfSB9LFxuXHRcdFx0eyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsIG1ldGE6IHsgYXV0b0FwcHJvdmVCeVNldHRpbmc6IHRydWUgfSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0VG9vbENhbGxEZWx0YSBjYW4gdXBkYXRlIHRoZSBpbnZvY2F0aW9uIG1lc3NhZ2Ugd2l0aG91dCBleHBvc2luZyBwYXJ0aWFsIGlucHV0JywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZSA9IGNoYXRSZWR1Y2VyKG1ha2VDaGF0KCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0VkaXQgRmlsZScsXG5cdFx0fSk7XG5cdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVwbGFjaW5nIDIgbGluZXMgd2l0aCAzIGxpbmVzJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBhcnQgPSBzdGF0ZS5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdGFzc2VydC5vayhwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nID8gcGFydC50b29sQ2FsbC5pbnZvY2F0aW9uTWVzc2FnZSA6IHVuZGVmaW5lZCxcblx0XHRcdHBhcnRpYWxJbnB1dDogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyA/IHBhcnQudG9vbENhbGwucGFydGlhbElucHV0IDogdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVwbGFjaW5nIDIgbGluZXMgd2l0aCAzIGxpbmVzJyxcblx0XHRcdHBhcnRpYWxJbnB1dDogJycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYXRUb29sQ2FsbFJlYWR5IHJlcGxhY2VzIHByb3Zpc2lvbmFsIGNvbnRyaWJ1dG9yIGFuZCBpbnRlbnRpb24nLCAoKSA9PiB7XG5cdFx0bGV0IHN0YXRlID0gY2hhdFJlZHVjZXIobWFrZUNoYXQoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdtY3BfdG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ01DUCBUb29sJyxcblx0XHRcdGludGVudGlvbjogJ1F1ZXJ5Jyxcblx0XHR9KTtcblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkOiAnbWNwLTEnIH0sXG5cdFx0XHRpbnRlbnRpb246ICdRdWVyeSBwcm9qZWN0IG1ldGFkYXRhJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUXVlcnlpbmcgcHJvamVjdCBtZXRhZGF0YScsXG5cdFx0XHR0b29sSW5wdXQ6ICd7XCJxdWVyeVwiOlwibWV0YWRhdGFcIn0nLFxuXHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwYXJ0ID0gc3RhdGUuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQub2socGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0dXM6IHBhcnQudG9vbENhbGwuc3RhdHVzLFxuXHRcdFx0Y29udHJpYnV0b3I6IHBhcnQudG9vbENhbGwuY29udHJpYnV0b3IsXG5cdFx0XHRpbnRlbnRpb246IHBhcnQudG9vbENhbGwuaW50ZW50aW9uLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkOiAnbWNwLTEnIH0sXG5cdFx0XHRpbnRlbnRpb246ICdRdWVyeSBwcm9qZWN0IG1ldGFkYXRhJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhdFRvb2xDYWxsUmVhZHkgY2Fubm90IGNoYW5nZSBjbGllbnQgZXhlY3V0aW9uIG93bmVyc2hpcCcsICgpID0+IHtcblx0XHRjb25zdCByZWFkeUNvbnRyaWJ1dG9yID0gKHN0YXJ0Q29udHJpYnV0b3I6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQsIGNvbnRyaWJ1dG9yOiBUb29sQ2FsbENvbnRyaWJ1dG9yKSA9PiB7XG5cdFx0XHRsZXQgc3RhdGUgPSBjaGF0UmVkdWNlcihtYWtlQ2hhdCgpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAndG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVG9vbCcsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiBzdGFydENvbnRyaWJ1dG9yLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0Y29udHJpYnV0b3IsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0b29sJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZS5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0cmV0dXJuIHBhcnQudG9vbENhbGwuY29udHJpYnV0b3I7XG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cmVhZHlDb250cmlidXRvcih1bmRlZmluZWQsIHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9KSxcblx0XHRcdHJlYWR5Q29udHJpYnV0b3IoXG5cdFx0XHRcdHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6ICdtY3AtMScgfSxcblx0XHRcdFx0eyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHQpLFxuXHRcdFx0cmVhZHlDb250cmlidXRvcihcblx0XHRcdFx0eyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHRcdHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0yJyB9LFxuXHRcdFx0KSxcblx0XHRcdHJlYWR5Q29udHJpYnV0b3IoXG5cdFx0XHRcdHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtMScgfSxcblx0XHRcdCksXG5cdFx0XSwgW1xuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0eyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ21jcC0xJyB9LFxuXHRcdFx0eyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHR7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtMScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhdFRvb2xDYWxsUmVhZHkgdXBkYXRlcyBhbiBhc3luY2hyb25vdXMganVkZ2UgcmVzdWx0IG9uIGEgcGVuZGluZyBjb25maXJtYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9hZGluZyA9IGNoYXRSZWR1Y2VyKHdpdGhBY3RpdmVUdXJuQW5kVG9vbENhbGwobWFrZUNoYXQoKSksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIGZpbGU/Jyxcblx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUmVhZCBmaWxlJyxcblx0XHRcdHRvb2xJbnB1dDogJy9mb28udHMnLFxuXHRcdFx0cmlza0Fzc2Vzc21lbnQ6IHtcblx0XHRcdFx0a2luZDogVG9vbENhbGxSaXNrQXNzZXNzbWVudEtpbmQuSnVkZ2UsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cy5Mb2FkaW5nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IGNoYXRSZWR1Y2VyKGxvYWRpbmcsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIGZpbGU/Jyxcblx0XHRcdHJpc2tBc3Nlc3NtZW50OiB7XG5cdFx0XHRcdGtpbmQ6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRLaW5kLkp1ZGdlLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMuQ29tcGxldGUsXG5cdFx0XHRcdHJlYXNvbjogJ1RoaXMgcmVhZHMgYSBzZW5zaXRpdmUgZmlsZS4nLFxuXHRcdFx0XHRzYWZldHk6IDAuMixcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGFydCA9IGNvbXBsZXRlLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy0xJyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb25maXJtYXRpb25UaXRsZTogcGFydC50b29sQ2FsbC5jb25maXJtYXRpb25UaXRsZSxcblx0XHRcdHRvb2xJbnB1dDogcGFydC50b29sQ2FsbC50b29sSW5wdXQsXG5cdFx0XHRyaXNrQXNzZXNzbWVudDogcGFydC50b29sQ2FsbC5yaXNrQXNzZXNzbWVudCxcblx0XHR9LCB7XG5cdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1JlYWQgZmlsZScsXG5cdFx0XHR0b29sSW5wdXQ6ICcvZm9vLnRzJyxcblx0XHRcdHJpc2tBc3Nlc3NtZW50OiB7XG5cdFx0XHRcdGtpbmQ6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRLaW5kLkp1ZGdlLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMuQ29tcGxldGUsXG5cdFx0XHRcdHJlYXNvbjogJ1RoaXMgcmVhZHMgYSBzZW5zaXRpdmUgZmlsZS4nLFxuXHRcdFx0XHRzYWZldHk6IDAuMixcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjaGFuZ2VzZXRSZWR1Y2VyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHJlYWR5OiBDaGFuZ2VzZXRTdGF0ZSA9IHsgc3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksIGZpbGVzOiBbXSB9O1xuXHRjb25zdCBmaWxlQSA9IHsgaWQ6ICdmaWxlOi8vL2EudHMnLCBlZGl0OiB7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy9hLnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSB9IH07XG5cdGNvbnN0IGZpbGVBUmVuYW1lZCA9IHsgaWQ6ICdmaWxlOi8vL2EudHMnLCBlZGl0OiB7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy9hLnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDUsIHJlbW92ZWQ6IDAgfSB9IH07XG5cblx0dGVzdCgnQ2hhbmdlc2V0RmlsZVNldCBhcHBlbmRzIGEgbmV3IGZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmV4dCA9IGNoYW5nZXNldFJlZHVjZXIocmVhZHksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlU2V0LCBmaWxlOiBmaWxlQSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5leHQuZmlsZXMsIFtmaWxlQV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2VzZXRGaWxlU2V0IHJlcGxhY2VzIGFuIGV4aXN0aW5nIGZpbGUgYnkgaWQgKHVwc2VydCknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VlZGVkID0gY2hhbmdlc2V0UmVkdWNlcihyZWFkeSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsIGZpbGU6IGZpbGVBIH0pO1xuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHNlZWRlZCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsIGZpbGU6IGZpbGVBUmVuYW1lZCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5leHQuZmlsZXMsIFtmaWxlQVJlbmFtZWRdKTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhbmdlc2V0RmlsZVJlbW92ZWQgcmVtb3ZlcyBieSBpZCcsICgpID0+IHtcblx0XHRjb25zdCBzZWVkZWQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHJlYWR5LCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCwgZmlsZTogZmlsZUEgfSk7XG5cdFx0Y29uc3QgbmV4dCA9IGNoYW5nZXNldFJlZHVjZXIoc2VlZGVkLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVJlbW92ZWQsIGZpbGVJZDogZmlsZUEuaWQgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXh0LmZpbGVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZXNldEZpbGVSZW1vdmVkIGlzIGEgbm8tb3AgZm9yIGFuIHVua25vd24gaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VlZGVkID0gY2hhbmdlc2V0UmVkdWNlcihyZWFkeSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsIGZpbGU6IGZpbGVBIH0pO1xuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHNlZWRlZCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVSZW1vdmVkLCBmaWxlSWQ6ICdmaWxlOi8vL25vcGUudHMnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXh0LCBzZWVkZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkIFx1MjE5MiBFcnJvciBhdHRhY2hlcyB0aGUgZXJyb3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXJyID0geyBlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJywgbWVzc2FnZTogJ2Jvb20nIH07XG5cdFx0Y29uc3QgbmV4dCA9IGNoYW5nZXNldFJlZHVjZXIocmVhZHksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLCBzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvciwgZXJyb3I6IGVyciB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3RhdHVzOiBuZXh0LnN0YXR1cywgZXJyb3I6IG5leHQuZXJyb3IgfSwgeyBzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvciwgZXJyb3I6IGVyciB9KTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCBcdTIxOTIgUmVhZHkgc3RyaXBzIGEgcHJldmlvdXMgZXJyb3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXJyb3JlZDogQ2hhbmdlc2V0U3RhdGUgPSB7IHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLCBlcnJvcjogeyBlcnJvclR5cGU6ICd4JywgbWVzc2FnZTogJ3knIH0sIGZpbGVzOiBbZmlsZUFdIH07XG5cdFx0Y29uc3QgbmV4dCA9IGNoYW5nZXNldFJlZHVjZXIoZXJyb3JlZCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsIHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzdGF0dXM6IG5leHQuc3RhdHVzLCBlcnJvcjogbmV4dC5lcnJvciwgZmlsZXM6IG5leHQuZmlsZXMgfSwgeyBzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSwgZXJyb3I6IHVuZGVmaW5lZCwgZmlsZXM6IFtmaWxlQV0gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZXNldE9wZXJhdGlvbnNDaGFuZ2VkIHdpdGggYXJyYXkgcmVwbGFjZXMgb3BlcmF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBvcHMgPSBbeyBpZDogJ3N0YWdlJywgbGFiZWw6ICdTdGFnZScsIHNjb3BlczogW10sIHN0YXR1czogQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLklkbGUgfV07XG5cdFx0Y29uc3QgbmV4dCA9IGNoYW5nZXNldFJlZHVjZXIocmVhZHksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRPcGVyYXRpb25zQ2hhbmdlZCwgb3BlcmF0aW9uczogb3BzIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV4dC5vcGVyYXRpb25zLCBvcHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2VzZXRPcGVyYXRpb25zQ2hhbmdlZCB3aXRoIHVuZGVmaW5lZCBzdHJpcHMgb3BlcmF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzZWVkZWQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHJlYWR5LCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0T3BlcmF0aW9uc0NoYW5nZWQsIG9wZXJhdGlvbnM6IFt7IGlkOiAnc3RhZ2UnLCBsYWJlbDogJ1N0YWdlJywgc2NvcGVzOiBbXSwgc3RhdHVzOiBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuSWRsZSB9XSB9KTtcblx0XHRjb25zdCBuZXh0ID0gY2hhbmdlc2V0UmVkdWNlcihzZWVkZWQsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRPcGVyYXRpb25zQ2hhbmdlZCwgb3BlcmF0aW9uczogdW5kZWZpbmVkIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXh0Lm9wZXJhdGlvbnMsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZXNldENsZWFyZWQgZW1wdGllcyBmaWxlcycsICgpID0+IHtcblx0XHRjb25zdCBzZWVkZWQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHJlYWR5LCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCwgZmlsZTogZmlsZUEgfSk7XG5cdFx0Y29uc3QgbmV4dCA9IGNoYW5nZXNldFJlZHVjZXIoc2VlZGVkLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0Q2xlYXJlZCwgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXh0LmZpbGVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZXNldENsZWFyZWQgaXMgYSBuby1vcCB3aGVuIGZpbGVzIGFyZSBhbHJlYWR5IGVtcHR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHJlYWR5LCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0Q2xlYXJlZCwgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5leHQsIHJlYWR5KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Nlc3Npb25SZWR1Y2VyIFx1MjAxMyBTZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgYWdlbnRBOiBBZ2VudEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2ZpbGU6Ly8vcGx1Z2luLWEvYWdlbnRzL2hlbHBlci5tZCcsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWEvYWdlbnRzL2hlbHBlci5tZCcsIG5hbWU6ICdoZWxwZXInIH07XG5cdGNvbnN0IGFnZW50QjogQWdlbnRDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdmaWxlOi8vL3BsdWdpbi1hL2FnZW50cy9yZXZpZXdlci5tZCcsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWEvYWdlbnRzL3Jldmlld2VyLm1kJywgbmFtZTogJ3Jldmlld2VyJywgZGVzY3JpcHRpb246ICdyZXZpZXdzIGNvZGUnIH07XG5cblx0ZnVuY3Rpb24gcGx1Z2luQShleHRyYTogUGFydGlhbDxQbHVnaW5DdXN0b21pemF0aW9uPiA9IHt9KTogQ3VzdG9taXphdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdGlkOiAnZmlsZTovLy9wbHVnaW4tYScsXG5cdFx0XHR1cmk6ICdmaWxlOi8vL3BsdWdpbi1hJyxcblx0XHRcdG5hbWU6ICdQbHVnaW4gQScsXG5cdFx0XHQuLi5leHRyYSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnaW5zZXJ0OiBhcHBlbmRzIGEgbmV3IHRvcC1sZXZlbCBjdXN0b21pemF0aW9uIHdpdGggaXRzIGNoaWxkcmVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb24gPSBwbHVnaW5BKHsgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSwgY2hpbGRyZW46IFthZ2VudEEsIGFnZW50Ql0gfSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzZXNzaW9uUmVkdWNlcihtYWtlU2Vzc2lvbigpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCxcblx0XHRcdGN1c3RvbWl6YXRpb24sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmN1c3RvbWl6YXRpb25zLCBbY3VzdG9taXphdGlvbl0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGU6IHJlcGxhY2VzIHRoZSBtYXRjaGluZyBlbnRyeSBlbnRpcmVseScsICgpID0+IHtcblx0XHRjb25zdCBpbml0aWFsID0gcGx1Z2luQSh7IGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGluZyB9LCBjaGlsZHJlbjogW2FnZW50QV0gfSk7XG5cdFx0Y29uc3Qgc2VlZGVkID0gc2Vzc2lvblJlZHVjZXIobWFrZVNlc3Npb24oKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsXG5cdFx0XHRjdXN0b21pemF0aW9uOiBpbml0aWFsLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHVwZGF0ZWQgPSBwbHVnaW5BKHsgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSwgY2hpbGRyZW46IFthZ2VudEJdIH0pO1xuXHRcdGNvbnN0IG5leHQgPSBzZXNzaW9uUmVkdWNlcihzZWVkZWQsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkLFxuXHRcdFx0Y3VzdG9taXphdGlvbjogdXBkYXRlZCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV4dC5jdXN0b21pemF0aW9ucywgW3VwZGF0ZWRdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2N1c3RvbWl6YXRpb24gZW5hYmxlbWVudCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzb3J0cyBzdGFibHkgYW5kIHJlcGxhY2VzIGRlY2lzaW9ucyBmb3Igb25lIHNjb3BlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZpcnN0ID0geyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6ICdmaWxlOi8vL29uZScsIGVuYWJsZWQ6IGZhbHNlIH0gYXMgY29uc3Q7XG5cdFx0Y29uc3Qgd29ya3NwYWNlU2Vjb25kID0geyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6ICdmaWxlOi8vL3R3bycsIGVuYWJsZWQ6IHRydWUgfSBhcyBjb25zdDtcblx0XHRjb25zdCBnbG9iYWwgPSB7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH0gYXMgY29uc3Q7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IHRydWUgfSBhcyBjb25zdDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR3aXRoQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQoW3dvcmtzcGFjZUZpcnN0LCBnbG9iYWwsIHdvcmtzcGFjZVNlY29uZCwgc2Vzc2lvbl0sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiAnZmlsZTovLy90aHJlZScsIGVuYWJsZWQ6IGZhbHNlIH0pLFxuXHRcdFx0W3Nlc3Npb24sIHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiAnZmlsZTovLy90aHJlZScsIGVuYWJsZWQ6IGZhbHNlIH0sIGdsb2JhbF0sXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c29ydEN1c3RvbWl6YXRpb25FbmFibGVtZW50KFt3b3Jrc3BhY2VGaXJzdCwgZ2xvYmFsLCB3b3Jrc3BhY2VTZWNvbmQsIHNlc3Npb25dKSxcblx0XHRcdFtzZXNzaW9uLCB3b3Jrc3BhY2VGaXJzdCwgd29ya3NwYWNlU2Vjb25kLCBnbG9iYWxdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIGVuYWJsZW1lbnQgZm9yIHBsdWdpbnMgYW5kIE1DUCBzZXJ2ZXJzIHdoaWxlIHJldGFpbmluZyBjaGlsZCBlbmFibGVtZW50IHRyYW5zaXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpbjogUGx1Z2luQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdGlkOiAncGx1Z2luJyxcblx0XHRcdHVyaTogJ2ZpbGU6Ly8vcGx1Z2luJyxcblx0XHRcdG5hbWU6ICdQbHVnaW4nLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LFxuXHRcdFx0XHRpZDogJ2FnZW50Jyxcblx0XHRcdFx0dXJpOiAnZmlsZTovLy9wbHVnaW4vYWdlbnQubWQnLFxuXHRcdFx0XHRuYW1lOiAnQWdlbnQnLFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRjb25zdCBtY3AgPSB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRpZDogJ21jcCcsXG5cdFx0XHR1cmk6ICdmaWxlOi8vL21jcC5qc29uJyxcblx0XHRcdG5hbWU6ICdNQ1AnLFxuXHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0b3BwZWQgfSxcblx0XHR9IGFzIGNvbnN0O1xuXHRcdGNvbnN0IHNlZWRlZCA9IHsgLi4ubWFrZVNlc3Npb24oKSwgY3VzdG9taXphdGlvbnM6IFtwbHVnaW4sIG1jcF0gfTtcblx0XHRjb25zdCB3aXRoU2V0ID0gc2Vzc2lvblJlZHVjZXIoc2VlZGVkLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZCxcblx0XHRcdGlkOiAncGx1Z2luJyxcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHdpdGhNY3BTZXQgPSBzZXNzaW9uUmVkdWNlcih3aXRoU2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZCxcblx0XHRcdGlkOiAnbWNwJyxcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHdpdGhDaGFuZ2UgPSBzZXNzaW9uUmVkdWNlcih3aXRoTWNwU2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZCxcblx0XHRcdGlkOiAncGx1Z2luJyxcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBlbmFibGVkOiB0cnVlIH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHdpdGhNY3BDaGFuZ2UgPSBzZXNzaW9uUmVkdWNlcih3aXRoQ2hhbmdlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZCxcblx0XHRcdGlkOiAnbWNwJyxcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBlbmFibGVkOiB0cnVlIH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHdpdGhDbGVhciA9IHNlc3Npb25SZWR1Y2VyKHdpdGhNY3BDaGFuZ2UsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25Ub2dnbGVkLFxuXHRcdFx0aWQ6ICdwbHVnaW4nLFxuXHRcdFx0ZW5hYmxlbWVudDogW10sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgd2l0aE1jcENsZWFyID0gc2Vzc2lvblJlZHVjZXIod2l0aENsZWFyLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZCxcblx0XHRcdGlkOiAnbWNwJyxcblx0XHRcdGVuYWJsZW1lbnQ6IFtdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHdpdGhDaGlsZFNldCA9IHNlc3Npb25SZWR1Y2VyKHdpdGhNY3BDbGVhciwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblRvZ2dsZWQsXG5cdFx0XHRpZDogJ2FnZW50Jyxcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHdpdGhDaGlsZENsZWFyID0gc2Vzc2lvblJlZHVjZXIod2l0aENoaWxkU2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZCxcblx0XHRcdGlkOiAnYWdlbnQnLFxuXHRcdFx0ZW5hYmxlbWVudDogW10sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHdpdGhTZXQuY3VzdG9taXphdGlvbnMsXG5cdFx0XHR3aXRoTWNwU2V0LmN1c3RvbWl6YXRpb25zLFxuXHRcdFx0d2l0aENoYW5nZS5jdXN0b21pemF0aW9ucyxcblx0XHRcdHdpdGhNY3BDaGFuZ2UuY3VzdG9taXphdGlvbnMsXG5cdFx0XHR3aXRoQ2xlYXIuY3VzdG9taXphdGlvbnMsXG5cdFx0XHR3aXRoTWNwQ2xlYXIuY3VzdG9taXphdGlvbnMsXG5cdFx0XHR3aXRoQ2hpbGRTZXQuY3VzdG9taXphdGlvbnMsXG5cdFx0XHR3aXRoQ2hpbGRDbGVhci5jdXN0b21pemF0aW9ucyxcblx0XHRdLCBbXG5cdFx0XHRbeyAuLi5wbHVnaW4sIGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dIH0sIG1jcF0sXG5cdFx0XHRbeyAuLi5wbHVnaW4sIGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dIH0sIHsgLi4ubWNwLCBlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9XSB9XSxcblx0XHRcdFt7IC4uLnBsdWdpbiwgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IHRydWUgfV0gfSwgeyAuLi5tY3AsIGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dIH1dLFxuXHRcdFx0W3sgLi4ucGx1Z2luLCBlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZW5hYmxlZDogdHJ1ZSB9XSB9LCB7IC4uLm1jcCwgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IHRydWUgfV0gfV0sXG5cdFx0XHRbcGx1Z2luLCB7IC4uLm1jcCwgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IHRydWUgfV0gfV0sXG5cdFx0XHRbcGx1Z2luLCBtY3BdLFxuXHRcdFx0W3sgLi4ucGx1Z2luLCBjaGlsZHJlbjogW3sgLi4ucGx1Z2luLmNoaWxkcmVuIVswXSwgZW5hYmxlZDogZmFsc2UgfV0gfSwgbWNwXSxcblx0XHRcdFt7IC4uLnBsdWdpbiwgY2hpbGRyZW46IFt7IC4uLnBsdWdpbi5jaGlsZHJlbiFbMF0sIGVuYWJsZWQ6IHRydWUgfV0gfSwgbWNwXSxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2QixtQ0FBbUM7QUFDekUsU0FBUyxrQkFBa0IsYUFBYSxzQkFBc0I7QUFDOUQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUIsMEJBQTBCLHlCQUF5QixhQUFhLHNCQUFzQiwwQkFBMEIsdUJBQXVCLHlCQUF5Qix1QkFBdUIsZ0JBQWdCLGtCQUFrQixlQUFlLDRCQUE0Qiw0QkFBNEIsOEJBQThCLGtCQUFrQixnQkFBZ0IsaUJBQWdKO0FBQzFnQixTQUFTLDZCQUE2QixtQkFBbUIsaUJBQWlCLCtCQUF5RDtBQUVuSSxTQUFTLGNBQTRCO0FBQ3BDLFNBQU87QUFBQSxJQUNOLFVBQVU7QUFBQSxJQUNWLE9BQU87QUFBQSxJQUNQLFFBQVEsY0FBYztBQUFBLElBQ3RCLFNBQVMsRUFBRSxLQUFLLHdCQUF3QixhQUFhLGVBQWU7QUFBQSxJQUNwRSxXQUFXLGlCQUFpQjtBQUFBLElBQzVCLGVBQWUsQ0FBQztBQUFBLElBQ2hCLE9BQU8sQ0FBQztBQUFBLEVBQ1Q7QUFDRDtBQUVBLFNBQVMsV0FBc0I7QUFDOUIsUUFBTSxNQUFNLElBQUksS0FBSyxLQUFLLElBQUksQ0FBQyxFQUFFLFlBQVk7QUFDN0MsU0FBTztBQUFBLElBQ04sVUFBVTtBQUFBLElBQ1YsT0FBTztBQUFBLElBQ1AsUUFBUSxjQUFjO0FBQUEsSUFDdEIsWUFBWTtBQUFBLElBQ1osUUFBUSxFQUFFLE1BQU0sZUFBZSxLQUFLO0FBQUEsSUFDcEMsT0FBTyxDQUFD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
