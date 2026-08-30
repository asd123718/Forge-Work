import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../../platform/commands/common/commands.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../../platform/actions/common/actions.js";
import { AgentHostAllowSignedOutWhenUsableSettingId } from "../../../../../../platform/agentHost/common/agentService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IsSessionsWindowContext } from "../../../../../common/contextkeys.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { ChatSubmitAction, ExecuteHandoffActionId, GetHandoffsActionId, OpenModelPickerAction, registerChatExecuteActions } from "../../../browser/actions/chatExecuteActions.js";
import { AgentSessionProviders } from "../../../browser/agentSessions/agentSessions.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { IChatModeService } from "../../../common/chatModes.js";
import { Target } from "../../../common/promptSyntax/promptTypes.js";
import { MockChatWidgetService } from "../widget/mockChatWidget.js";
import { MockChatModeService } from "../../common/mockChatModeService.js";
async function runCommandAsync(handler, ...args) {
  return await handler(...args);
}
function createMockMode(overrides) {
  return {
    name: constObservable(overrides.id),
    label: constObservable(overrides.id),
    icon: constObservable(void 0),
    description: constObservable(void 0),
    isBuiltin: overrides.isBuiltin ?? false,
    target: constObservable(Target.Undefined),
    ...overrides
  };
}
suite("GetHandoffsAction", () => {
  const store = new DisposableStore();
  let instantiationService;
  let chatExecuteActions;
  suiteSetup(() => {
    chatExecuteActions = registerChatExecuteActions();
  });
  test("shows Copilot Agent Host models in the signed-out Agents welcome view", () => {
    const item = MenuRegistry.getMenuItems(MenuId.ChatInput).find((candidate) => isIMenuItem(candidate) && candidate.command.id === OpenModelPickerAction.ID);
    assert.ok(item?.when);
    const evaluate = (values) => item.when.evaluate({
      getValue: (key) => values[key]
    });
    const context = {
      [ChatContextKeys.location.key]: ChatAgentLocation.Chat,
      [ChatContextKeys.inAgentSessionsWelcome.key]: true,
      [ChatContextKeys.agentSessionType.key]: AgentSessionProviders.AgentHostCopilot,
      [IsSessionsWindowContext.key]: true
    };
    assert.deepStrictEqual({
      enabled: evaluate({ ...context, [`config.${AgentHostAllowSignedOutWhenUsableSettingId}`]: true }),
      disabled: evaluate({ ...context, [`config.${AgentHostAllowSignedOutWhenUsableSettingId}`]: false }),
      editorWindow: evaluate({ ...context, [IsSessionsWindowContext.key]: false, [`config.${AgentHostAllowSignedOutWhenUsableSettingId}`]: true }),
      claude: evaluate({ ...context, [ChatContextKeys.agentSessionType.key]: AgentSessionProviders.AgentHostClaude, [`config.${AgentHostAllowSignedOutWhenUsableSettingId}`]: true })
    }, {
      enabled: true,
      disabled: false,
      editorWindow: false,
      claude: false
    });
  });
  suiteTeardown(() => {
    chatExecuteActions.dispose();
  });
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should return all modes when no sourceCustomAgent is specified", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    const planMode = createMockMode({
      id: "plan",
      kind: ChatModeKind.Agent,
      handOffs: observableValue("handOffs", [
        { agent: "implement", label: "Start", prompt: "go" }
      ])
    });
    instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));
    const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].name, "ask");
    assert.strictEqual(result[0].handoffs.length, 0);
    assert.strictEqual(result[1].name, "plan");
    assert.strictEqual(result[1].handoffs.length, 1);
  });
  test("should filter by sourceCustomAgent (case-insensitive)", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    const planMode = createMockMode({
      id: "plan",
      kind: ChatModeKind.Agent,
      handOffs: observableValue("handOffs", [
        { agent: "implement", label: "Start", prompt: "go" }
      ])
    });
    instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));
    const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { sourceCustomAgent: "Plan" });
    assert.deepStrictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "plan");
    assert.strictEqual(result[0].handoffs.length, 1);
  });
  test("should return empty array for non-matching sourceCustomAgent", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [] }));
    const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { sourceCustomAgent: "nonexistent" });
    assert.deepStrictEqual(result, []);
  });
});
suite("ExecuteHandoffAction", () => {
  const store = new DisposableStore();
  let instantiationService;
  let chatExecuteActions;
  suiteSetup(() => {
    chatExecuteActions = registerChatExecuteActions();
  });
  suiteTeardown(() => {
    chatExecuteActions.dispose();
  });
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  const testHandoffs = [
    { agent: "implement", label: "Start Implementation", prompt: "Implement the plan", send: true },
    { agent: "agent", label: "Open in Editor", prompt: "Open it" }
  ];
  const planMode = createMockMode({
    id: "plan",
    kind: ChatModeKind.Agent,
    handOffs: observableValue("handOffs", testHandoffs)
  });
  function createMockWidget(currentMode, chatModes) {
    const executeHandoffCalls = [];
    const widget = {
      input: {
        currentModeObs: constObservable(currentMode),
        currentChatModesObs: constObservable(chatModes)
      },
      executeHandoff: async (handoff) => {
        executeHandoffCalls.push(handoff);
      }
    };
    return { widget, executeHandoffCalls };
  }
  test("should return error when neither id nor label is provided", async () => {
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, {});
    assert.deepStrictEqual(result, { success: false, error: "Either id or label is required" });
  });
  test("should return error when no widget is found", async () => {
    instantiationService.set(IChatWidgetService, new MockChatWidgetService());
    instantiationService.set(IChatModeService, new MockChatModeService());
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "implement:start-implementation" });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("No chat widget found"));
  });
  test("should fall back to lastFocusedWidget when sessionResource is omitted", async () => {
    const chatModeService = new MockChatModeService();
    const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "implement:start-implementation" });
    assert.deepStrictEqual(result, { success: true, targetMode: "implement" });
    assert.strictEqual(executeHandoffCalls.length, 1);
    assert.strictEqual(executeHandoffCalls[0].label, "Start Implementation");
  });
  test("should resolve widget by sessionResource", async () => {
    const chatModeService = new MockChatModeService({ builtin: [], custom: [planMode] });
    const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const sessionUri = URI.parse("test://session/1");
    const mockWidgetService = new class extends MockChatWidgetService {
      getWidgetBySessionResource(resource) {
        return resource.toString() === sessionUri.toString() ? widget : void 0;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, {
      id: "implement:start-implementation",
      sessionResource: sessionUri.toString()
    });
    assert.deepStrictEqual(result, { success: true, targetMode: "implement" });
    assert.strictEqual(executeHandoffCalls.length, 1);
  });
  test("should match by id (primary)", async () => {
    const chatModeService = new MockChatModeService();
    const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "agent:open-in-editor" });
    assert.deepStrictEqual(result, { success: true, targetMode: "agent" });
    assert.strictEqual(executeHandoffCalls[0].label, "Open in Editor");
  });
  test("should fall back to label match when id is not provided", async () => {
    const chatModeService = new MockChatModeService();
    const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { label: "start implementation" });
    assert.deepStrictEqual(result, { success: true, targetMode: "implement" });
    assert.strictEqual(executeHandoffCalls[0].prompt, "Implement the plan");
  });
  test("should return error for non-matching identifier", async () => {
    const chatModeService = new MockChatModeService();
    const { widget } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "nonexistent:thing" });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("nonexistent:thing"));
  });
  test("should resolve sourceCustomAgent to look up handoffs from a different mode", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    const modeService = new MockChatModeService({ builtin: [askMode], custom: [planMode] });
    const { widget, executeHandoffCalls } = createMockWidget(askMode, await modeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, modeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, {
      id: "implement:start-implementation",
      sourceCustomAgent: "plan"
    });
    assert.deepStrictEqual(result, { success: true, targetMode: "implement" });
    assert.strictEqual(executeHandoffCalls.length, 1);
  });
  test("should return error when source mode has no handoffs", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    const chatModeService = new MockChatModeService({ builtin: [askMode], custom: [] });
    const { widget } = createMockWidget(askMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "implement:start-implementation" });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("No handoffs available"));
  });
});
suite("SwitchToNextPinnedModelAction", () => {
  const store = new DisposableStore();
  let instantiationService;
  let chatExecuteActions;
  suiteSetup(() => {
    chatExecuteActions = registerChatExecuteActions();
  });
  suiteTeardown(() => {
    chatExecuteActions.dispose();
  });
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("invokes switchToNextPinnedModel on the last focused widget", async () => {
    let switchCalls = 0;
    const mockWidget = {
      input: {
        switchToNextPinnedModel: () => {
          switchCalls++;
        }
      }
    };
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = mockWidget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    const handler = CommandsRegistry.getCommand("workbench.action.chat.switchToNextPinnedModel")?.handler;
    assert.ok(handler);
    await runCommandAsync(handler, instantiationService);
    assert.strictEqual(switchCalls, 1);
  });
  test("is a no-op when there is no focused widget", async () => {
    instantiationService.set(IChatWidgetService, new MockChatWidgetService());
    const handler = CommandsRegistry.getCommand("workbench.action.chat.switchToNextPinnedModel")?.handler;
    assert.ok(handler);
    await runCommandAsync(handler, instantiationService);
  });
});
suite("ChatSubmitAction", () => {
  const store = new DisposableStore();
  let instantiationService;
  let chatExecuteActions;
  suiteSetup(() => {
    chatExecuteActions = registerChatExecuteActions();
  });
  suiteTeardown(() => {
    chatExecuteActions.dispose();
  });
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes acceptInputOptions to the widget", async () => {
    let acceptedOptions;
    const widget = {
      input: {
        pendingDelegationTarget: void 0
      },
      acceptInput: async (_query, options) => {
        acceptedOptions = options;
        return void 0;
      }
    };
    instantiationService.set(ITelemetryService, NullTelemetryService);
    instantiationService.set(IChatWidgetService, new MockChatWidgetService());
    const handler = CommandsRegistry.getCommand(ChatSubmitAction.ID)?.handler;
    assert.ok(handler);
    await runCommandAsync(handler, instantiationService, {
      widget,
      acceptInputOptions: { cancelCurrentRequest: true }
    });
    assert.deepStrictEqual(acceptedOptions, { cancelCurrentRequest: true });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRFeGVjdXRlQWN0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElNZW51SXRlbSwgaXNJTWVudUl0ZW0sIE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5VmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IHR5cGUgSUNoYXRBY2NlcHRJbnB1dE9wdGlvbnMsIElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFN1Ym1pdEFjdGlvbiwgRXhlY3V0ZUhhbmRvZmZBY3Rpb25JZCwgR2V0SGFuZG9mZnNBY3Rpb25JZCwgT3Blbk1vZGVsUGlja2VyQWN0aW9uLCByZWdpc3RlckNoYXRFeGVjdXRlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9jaGF0RXhlY3V0ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZSwgSUNoYXRNb2RlcywgSUNoYXRNb2RlU2VydmljZSwgSUN1c3RvbUFnZW50SW5mbyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgSUhhbmRPZmYgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi93aWRnZXQvbW9ja0NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2NrQ2hhdE1vZGVTZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIElFeGVjdXRlSGFuZG9mZlJlc3VsdCB7XG5cdHN1Y2Nlc3M6IGJvb2xlYW47XG5cdHRhcmdldE1vZGU/OiBzdHJpbmc7XG5cdGVycm9yPzogc3RyaW5nO1xufVxuXG5cbmFzeW5jIGZ1bmN0aW9uIHJ1bkNvbW1hbmRBc3luYzxUPihoYW5kbGVyOiBGdW5jdGlvbiwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxUPiB7XG5cdHJldHVybiBhd2FpdCBoYW5kbGVyKC4uLmFyZ3MpIGFzIHVua25vd24gYXMgVDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja01vZGUob3ZlcnJpZGVzOiBQYXJ0aWFsPElDaGF0TW9kZT4gJiB7IGlkOiBzdHJpbmc7IGtpbmQ6IENoYXRNb2RlS2luZCB9KTogSUNoYXRNb2RlIHtcblx0cmV0dXJuIHtcblx0XHRuYW1lOiBjb25zdE9ic2VydmFibGUob3ZlcnJpZGVzLmlkKSxcblx0XHRsYWJlbDogY29uc3RPYnNlcnZhYmxlKG92ZXJyaWRlcy5pZCksXG5cdFx0aWNvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0ZGVzY3JpcHRpb246IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGlzQnVpbHRpbjogb3ZlcnJpZGVzLmlzQnVpbHRpbiA/PyBmYWxzZSxcblx0XHR0YXJnZXQ6IGNvbnN0T2JzZXJ2YWJsZShUYXJnZXQuVW5kZWZpbmVkKSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH0gYXMgSUNoYXRNb2RlO1xufVxuXG5zdWl0ZSgnR2V0SGFuZG9mZnNBY3Rpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRsZXQgY2hhdEV4ZWN1dGVBY3Rpb25zOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHN1aXRlU2V0dXAoKCkgPT4ge1xuXHRcdGNoYXRFeGVjdXRlQWN0aW9ucyA9IHJlZ2lzdGVyQ2hhdEV4ZWN1dGVBY3Rpb25zKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIENvcGlsb3QgQWdlbnQgSG9zdCBtb2RlbHMgaW4gdGhlIHNpZ25lZC1vdXQgQWdlbnRzIHdlbGNvbWUgdmlldycsICgpID0+IHtcblx0XHRjb25zdCBpdGVtID0gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51SWQuQ2hhdElucHV0KVxuXHRcdFx0LmZpbmQoKGNhbmRpZGF0ZSk6IGNhbmRpZGF0ZSBpcyBJTWVudUl0ZW0gPT4gaXNJTWVudUl0ZW0oY2FuZGlkYXRlKSAmJiBjYW5kaWRhdGUuY29tbWFuZC5pZCA9PT0gT3Blbk1vZGVsUGlja2VyQWN0aW9uLklEKTtcblx0XHRhc3NlcnQub2soaXRlbT8ud2hlbik7XG5cblx0XHRjb25zdCBldmFsdWF0ZSA9ICh2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIENvbnRleHRLZXlWYWx1ZT4pID0+IGl0ZW0ud2hlbiEuZXZhbHVhdGUoe1xuXHRcdFx0Z2V0VmFsdWU6IDxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlID0gQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZykgPT4gdmFsdWVzW2tleV0gYXMgVCxcblx0XHR9KTtcblx0XHRjb25zdCBjb250ZXh0ID0ge1xuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5rZXldOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5pbkFnZW50U2Vzc2lvbnNXZWxjb21lLmtleV06IHRydWUsXG5cdFx0XHRbQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUua2V5XTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0XHRbSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQua2V5XTogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlbmFibGVkOiBldmFsdWF0ZSh7IC4uLmNvbnRleHQsIFtgY29uZmlnLiR7QWdlbnRIb3N0QWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlU2V0dGluZ0lkfWBdOiB0cnVlIH0pLFxuXHRcdFx0ZGlzYWJsZWQ6IGV2YWx1YXRlKHsgLi4uY29udGV4dCwgW2Bjb25maWcuJHtBZ2VudEhvc3RBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVTZXR0aW5nSWR9YF06IGZhbHNlIH0pLFxuXHRcdFx0ZWRpdG9yV2luZG93OiBldmFsdWF0ZSh7IC4uLmNvbnRleHQsIFtJc1Nlc3Npb25zV2luZG93Q29udGV4dC5rZXldOiBmYWxzZSwgW2Bjb25maWcuJHtBZ2VudEhvc3RBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVTZXR0aW5nSWR9YF06IHRydWUgfSksXG5cdFx0XHRjbGF1ZGU6IGV2YWx1YXRlKHsgLi4uY29udGV4dCwgW0NoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmtleV06IEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDbGF1ZGUsIFtgY29uZmlnLiR7QWdlbnRIb3N0QWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlU2V0dGluZ0lkfWBdOiB0cnVlIH0pLFxuXHRcdH0sIHtcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRkaXNhYmxlZDogZmFsc2UsXG5cdFx0XHRlZGl0b3JXaW5kb3c6IGZhbHNlLFxuXHRcdFx0Y2xhdWRlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGVUZWFyZG93bigoKSA9PiB7XG5cdFx0Y2hhdEV4ZWN1dGVBY3Rpb25zLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzdG9yZS5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIGFsbCBtb2RlcyB3aGVuIG5vIHNvdXJjZUN1c3RvbUFnZW50IGlzIHNwZWNpZmllZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhc2tNb2RlID0gY3JlYXRlTW9ja01vZGUoeyBpZDogJ2FzaycsIGtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssIGlzQnVpbHRpbjogdHJ1ZSB9KTtcblx0XHRjb25zdCBwbGFuTW9kZSA9IGNyZWF0ZU1vY2tNb2RlKHtcblx0XHRcdGlkOiAncGxhbicsXG5cdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRoYW5kT2Zmczogb2JzZXJ2YWJsZVZhbHVlKCdoYW5kT2ZmcycsIFtcblx0XHRcdFx0eyBhZ2VudDogJ2ltcGxlbWVudCcsIGxhYmVsOiAnU3RhcnQnLCBwcm9tcHQ6ICdnbycgfSBzYXRpc2ZpZXMgSUhhbmRPZmYsXG5cdFx0XHRdKSxcblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdE1vZGVTZXJ2aWNlLCBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSh7IGJ1aWx0aW46IFthc2tNb2RlXSwgY3VzdG9tOiBbcGxhbk1vZGVdIH0pKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoR2V0SGFuZG9mZnNBY3Rpb25JZCk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuQ29tbWFuZEFzeW5jPElDdXN0b21BZ2VudEluZm9bXT4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm5hbWUsICdhc2snKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmhhbmRvZmZzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS5uYW1lLCAncGxhbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0uaGFuZG9mZnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSBzb3VyY2VDdXN0b21BZ2VudCAoY2FzZS1pbnNlbnNpdGl2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXNrTW9kZSA9IGNyZWF0ZU1vY2tNb2RlKHsgaWQ6ICdhc2snLCBraW5kOiBDaGF0TW9kZUtpbmQuQXNrLCBpc0J1aWx0aW46IHRydWUgfSk7XG5cdFx0Y29uc3QgcGxhbk1vZGUgPSBjcmVhdGVNb2NrTW9kZSh7XG5cdFx0XHRpZDogJ3BsYW4nLFxuXHRcdFx0a2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0aGFuZE9mZnM6IG9ic2VydmFibGVWYWx1ZSgnaGFuZE9mZnMnLCBbXG5cdFx0XHRcdHsgYWdlbnQ6ICdpbXBsZW1lbnQnLCBsYWJlbDogJ1N0YXJ0JywgcHJvbXB0OiAnZ28nIH0gc2F0aXNmaWVzIElIYW5kT2ZmLFxuXHRcdFx0XSksXG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRNb2RlU2VydmljZSwgbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoeyBidWlsdGluOiBbYXNrTW9kZV0sIGN1c3RvbTogW3BsYW5Nb2RlXSB9KSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEdldEhhbmRvZmZzQWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkNvbW1hbmRBc3luYzxJQ3VzdG9tQWdlbnRJbmZvW10+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IHNvdXJjZUN1c3RvbUFnZW50OiAnUGxhbicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm5hbWUsICdwbGFuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5oYW5kb2Zmcy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIGVtcHR5IGFycmF5IGZvciBub24tbWF0Y2hpbmcgc291cmNlQ3VzdG9tQWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXNrTW9kZSA9IGNyZWF0ZU1vY2tNb2RlKHsgaWQ6ICdhc2snLCBraW5kOiBDaGF0TW9kZUtpbmQuQXNrLCBpc0J1aWx0aW46IHRydWUgfSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRNb2RlU2VydmljZSwgbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoeyBidWlsdGluOiBbYXNrTW9kZV0sIGN1c3RvbTogW10gfSkpO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChHZXRIYW5kb2Zmc0FjdGlvbklkKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Db21tYW5kQXN5bmM8SUN1c3RvbUFnZW50SW5mb1tdPihoYW5kbGVyLCBpbnN0YW50aWF0aW9uU2VydmljZSwgeyBzb3VyY2VDdXN0b21BZ2VudDogJ25vbmV4aXN0ZW50JyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnRXhlY3V0ZUhhbmRvZmZBY3Rpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRsZXQgY2hhdEV4ZWN1dGVBY3Rpb25zOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHN1aXRlU2V0dXAoKCkgPT4ge1xuXHRcdGNoYXRFeGVjdXRlQWN0aW9ucyA9IHJlZ2lzdGVyQ2hhdEV4ZWN1dGVBY3Rpb25zKCk7XG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oKCkgPT4ge1xuXHRcdGNoYXRFeGVjdXRlQWN0aW9ucy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgdGVzdEhhbmRvZmZzOiBJSGFuZE9mZltdID0gW1xuXHRcdHsgYWdlbnQ6ICdpbXBsZW1lbnQnLCBsYWJlbDogJ1N0YXJ0IEltcGxlbWVudGF0aW9uJywgcHJvbXB0OiAnSW1wbGVtZW50IHRoZSBwbGFuJywgc2VuZDogdHJ1ZSB9LFxuXHRcdHsgYWdlbnQ6ICdhZ2VudCcsIGxhYmVsOiAnT3BlbiBpbiBFZGl0b3InLCBwcm9tcHQ6ICdPcGVuIGl0JyB9LFxuXHRdO1xuXG5cdGNvbnN0IHBsYW5Nb2RlID0gY3JlYXRlTW9ja01vZGUoe1xuXHRcdGlkOiAncGxhbicsXG5cdFx0a2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdGhhbmRPZmZzOiBvYnNlcnZhYmxlVmFsdWUoJ2hhbmRPZmZzJywgdGVzdEhhbmRvZmZzKSxcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1dpZGdldChjdXJyZW50TW9kZTogSUNoYXRNb2RlLCBjaGF0TW9kZXM6IElDaGF0TW9kZXMpOiB7IHdpZGdldDogUGFydGlhbDxJQ2hhdFdpZGdldD47IGV4ZWN1dGVIYW5kb2ZmQ2FsbHM6IElIYW5kT2ZmW10gfSB7XG5cdFx0Y29uc3QgZXhlY3V0ZUhhbmRvZmZDYWxsczogSUhhbmRPZmZbXSA9IFtdO1xuXHRcdGNvbnN0IHdpZGdldDogUGFydGlhbDxJQ2hhdFdpZGdldD4gPSB7XG5cdFx0XHRpbnB1dDoge1xuXHRcdFx0XHRjdXJyZW50TW9kZU9iczogY29uc3RPYnNlcnZhYmxlKGN1cnJlbnRNb2RlKSxcblx0XHRcdFx0Y3VycmVudENoYXRNb2Rlc09iczogY29uc3RPYnNlcnZhYmxlKGNoYXRNb2RlcyksXG5cdFx0XHR9IGFzIElDaGF0V2lkZ2V0WydpbnB1dCddLFxuXHRcdFx0ZXhlY3V0ZUhhbmRvZmY6IGFzeW5jIChoYW5kb2ZmOiBJSGFuZE9mZikgPT4ge1xuXHRcdFx0XHRleGVjdXRlSGFuZG9mZkNhbGxzLnB1c2goaGFuZG9mZik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0cmV0dXJuIHsgd2lkZ2V0LCBleGVjdXRlSGFuZG9mZkNhbGxzIH07XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIGVycm9yIHdoZW4gbmVpdGhlciBpZCBub3IgbGFiZWwgaXMgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChFeGVjdXRlSGFuZG9mZkFjdGlvbklkKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Db21tYW5kQXN5bmM8SUV4ZWN1dGVIYW5kb2ZmUmVzdWx0PihoYW5kbGVyLCBpbnN0YW50aWF0aW9uU2VydmljZSwge30pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0VpdGhlciBpZCBvciBsYWJlbCBpcyByZXF1aXJlZCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gZXJyb3Igd2hlbiBubyB3aWRnZXQgaXMgZm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IE1vY2tDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRNb2RlU2VydmljZSwgbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEV4ZWN1dGVIYW5kb2ZmQWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkNvbW1hbmRBc3luYzxJRXhlY3V0ZUhhbmRvZmZSZXN1bHQ+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IGlkOiAnaW1wbGVtZW50OnN0YXJ0LWltcGxlbWVudGF0aW9uJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmVycm9yPy5pbmNsdWRlcygnTm8gY2hhdCB3aWRnZXQgZm91bmQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmYWxsIGJhY2sgdG8gbGFzdEZvY3VzZWRXaWRnZXQgd2hlbiBzZXNzaW9uUmVzb3VyY2UgaXMgb21pdHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0TW9kZVNlcnZpY2UgPSBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBleGVjdXRlSGFuZG9mZkNhbGxzIH0gPSBjcmVhdGVNb2NrV2lkZ2V0KHBsYW5Nb2RlLCBhd2FpdCBjaGF0TW9kZVNlcnZpY2UuZ2V0TG9jYWxNb2RlcygpKTtcblxuXHRcdGNvbnN0IG1vY2tXaWRnZXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RGb2N1c2VkV2lkZ2V0ID0gd2lkZ2V0IGFzIElDaGF0V2lkZ2V0O1xuXHRcdH07XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRXaWRnZXRTZXJ2aWNlLCBtb2NrV2lkZ2V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0TW9kZVNlcnZpY2UsIGNoYXRNb2RlU2VydmljZSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEV4ZWN1dGVIYW5kb2ZmQWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkNvbW1hbmRBc3luYzxJRXhlY3V0ZUhhbmRvZmZSZXN1bHQ+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IGlkOiAnaW1wbGVtZW50OnN0YXJ0LWltcGxlbWVudGF0aW9uJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBzdWNjZXNzOiB0cnVlLCB0YXJnZXRNb2RlOiAnaW1wbGVtZW50JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZUhhbmRvZmZDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlSGFuZG9mZkNhbGxzWzBdLmxhYmVsLCAnU3RhcnQgSW1wbGVtZW50YXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJlc29sdmUgd2lkZ2V0IGJ5IHNlc3Npb25SZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0TW9kZVNlcnZpY2UgPSBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSh7IGJ1aWx0aW46IFtdLCBjdXN0b206IFtwbGFuTW9kZV0gfSk7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIGV4ZWN1dGVIYW5kb2ZmQ2FsbHMgfSA9IGNyZWF0ZU1vY2tXaWRnZXQocGxhbk1vZGUsIGF3YWl0IGNoYXRNb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCkpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLzEnKTtcblxuXHRcdGNvbnN0IG1vY2tXaWRnZXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHJlc291cmNlOiBVUkkpIHtcblx0XHRcdFx0cmV0dXJuIHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb25VcmkudG9TdHJpbmcoKSA/IHdpZGdldCBhcyBJQ2hhdFdpZGdldCA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0V2lkZ2V0U2VydmljZSwgbW9ja1dpZGdldFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdE1vZGVTZXJ2aWNlLCBjaGF0TW9kZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChFeGVjdXRlSGFuZG9mZkFjdGlvbklkKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Db21tYW5kQXN5bmM8SUV4ZWN1dGVIYW5kb2ZmUmVzdWx0PihoYW5kbGVyLCBpbnN0YW50aWF0aW9uU2VydmljZSwge1xuXHRcdFx0aWQ6ICdpbXBsZW1lbnQ6c3RhcnQtaW1wbGVtZW50YXRpb24nLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgc3VjY2VzczogdHJ1ZSwgdGFyZ2V0TW9kZTogJ2ltcGxlbWVudCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVIYW5kb2ZmQ2FsbHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG1hdGNoIGJ5IGlkIChwcmltYXJ5KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0TW9kZVNlcnZpY2UgPSBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBleGVjdXRlSGFuZG9mZkNhbGxzIH0gPSBjcmVhdGVNb2NrV2lkZ2V0KHBsYW5Nb2RlLCBhd2FpdCBjaGF0TW9kZVNlcnZpY2UuZ2V0TG9jYWxNb2RlcygpKTtcblxuXHRcdGNvbnN0IG1vY2tXaWRnZXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RGb2N1c2VkV2lkZ2V0ID0gd2lkZ2V0IGFzIElDaGF0V2lkZ2V0O1xuXHRcdH07XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRXaWRnZXRTZXJ2aWNlLCBtb2NrV2lkZ2V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0TW9kZVNlcnZpY2UsIGNoYXRNb2RlU2VydmljZSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEV4ZWN1dGVIYW5kb2ZmQWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkNvbW1hbmRBc3luYzxJRXhlY3V0ZUhhbmRvZmZSZXN1bHQ+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IGlkOiAnYWdlbnQ6b3Blbi1pbi1lZGl0b3InIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHN1Y2Nlc3M6IHRydWUsIHRhcmdldE1vZGU6ICdhZ2VudCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVIYW5kb2ZmQ2FsbHNbMF0ubGFiZWwsICdPcGVuIGluIEVkaXRvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmFsbCBiYWNrIHRvIGxhYmVsIG1hdGNoIHdoZW4gaWQgaXMgbm90IHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRNb2RlU2VydmljZSA9IG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIGV4ZWN1dGVIYW5kb2ZmQ2FsbHMgfSA9IGNyZWF0ZU1vY2tXaWRnZXQocGxhbk1vZGUsIGF3YWl0IGNoYXRNb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCkpO1xuXG5cdFx0Y29uc3QgbW9ja1dpZGdldFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBNb2NrQ2hhdFdpZGdldFNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFzdEZvY3VzZWRXaWRnZXQgPSB3aWRnZXQgYXMgSUNoYXRXaWRnZXQ7XG5cdFx0fTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdFdpZGdldFNlcnZpY2UsIG1vY2tXaWRnZXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRNb2RlU2VydmljZSwgY2hhdE1vZGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoRXhlY3V0ZUhhbmRvZmZBY3Rpb25JZCk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuQ29tbWFuZEFzeW5jPElFeGVjdXRlSGFuZG9mZlJlc3VsdD4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgbGFiZWw6ICdzdGFydCBpbXBsZW1lbnRhdGlvbicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgc3VjY2VzczogdHJ1ZSwgdGFyZ2V0TW9kZTogJ2ltcGxlbWVudCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVIYW5kb2ZmQ2FsbHNbMF0ucHJvbXB0LCAnSW1wbGVtZW50IHRoZSBwbGFuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gZXJyb3IgZm9yIG5vbi1tYXRjaGluZyBpZGVudGlmaWVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRNb2RlU2VydmljZSA9IG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyB3aWRnZXQgfSA9IGNyZWF0ZU1vY2tXaWRnZXQocGxhbk1vZGUsIGF3YWl0IGNoYXRNb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCkpO1xuXG5cdFx0Y29uc3QgbW9ja1dpZGdldFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBNb2NrQ2hhdFdpZGdldFNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFzdEZvY3VzZWRXaWRnZXQgPSB3aWRnZXQgYXMgSUNoYXRXaWRnZXQ7XG5cdFx0fTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdFdpZGdldFNlcnZpY2UsIG1vY2tXaWRnZXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRNb2RlU2VydmljZSwgY2hhdE1vZGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoRXhlY3V0ZUhhbmRvZmZBY3Rpb25JZCk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuQ29tbWFuZEFzeW5jPElFeGVjdXRlSGFuZG9mZlJlc3VsdD4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgaWQ6ICdub25leGlzdGVudDp0aGluZycgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5lcnJvcj8uaW5jbHVkZXMoJ25vbmV4aXN0ZW50OnRoaW5nJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBzb3VyY2VDdXN0b21BZ2VudCB0byBsb29rIHVwIGhhbmRvZmZzIGZyb20gYSBkaWZmZXJlbnQgbW9kZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhc2tNb2RlID0gY3JlYXRlTW9ja01vZGUoeyBpZDogJ2FzaycsIGtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssIGlzQnVpbHRpbjogdHJ1ZSB9KTtcblx0XHRjb25zdCBtb2RlU2VydmljZSA9IG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKHsgYnVpbHRpbjogW2Fza01vZGVdLCBjdXN0b206IFtwbGFuTW9kZV0gfSk7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIGV4ZWN1dGVIYW5kb2ZmQ2FsbHMgfSA9IGNyZWF0ZU1vY2tXaWRnZXQoYXNrTW9kZSwgYXdhaXQgbW9kZVNlcnZpY2UuZ2V0TG9jYWxNb2RlcygpKTsgLy8gd2lkZ2V0IGlzIGluIFwiYXNrXCIgbW9kZSAobm8gaGFuZG9mZnMpXG5cblx0XHRjb25zdCBtb2NrV2lkZ2V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIE1vY2tDaGF0V2lkZ2V0U2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBsYXN0Rm9jdXNlZFdpZGdldCA9IHdpZGdldCBhcyBJQ2hhdFdpZGdldDtcblx0XHR9O1xuXG5cdFx0Ly8gVGhlIHBsYW4gbW9kZSBoYXMgaGFuZG9mZnM7IHNvdXJjZUN1c3RvbUFnZW50IG92ZXJyaWRlcyB0aGUgd2lkZ2V0J3MgY3VycmVudCBtb2RlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0V2lkZ2V0U2VydmljZSwgbW9ja1dpZGdldFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdE1vZGVTZXJ2aWNlLCBtb2RlU2VydmljZSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEV4ZWN1dGVIYW5kb2ZmQWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkNvbW1hbmRBc3luYzxJRXhlY3V0ZUhhbmRvZmZSZXN1bHQ+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ2ltcGxlbWVudDpzdGFydC1pbXBsZW1lbnRhdGlvbicsXG5cdFx0XHRzb3VyY2VDdXN0b21BZ2VudDogJ3BsYW4nLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHN1Y2Nlc3M6IHRydWUsIHRhcmdldE1vZGU6ICdpbXBsZW1lbnQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlSGFuZG9mZkNhbGxzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gZXJyb3Igd2hlbiBzb3VyY2UgbW9kZSBoYXMgbm8gaGFuZG9mZnMnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBhc2tNb2RlID0gY3JlYXRlTW9ja01vZGUoeyBpZDogJ2FzaycsIGtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssIGlzQnVpbHRpbjogdHJ1ZSB9KTtcblx0XHRjb25zdCBjaGF0TW9kZVNlcnZpY2UgPSBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSh7IGJ1aWx0aW46IFthc2tNb2RlXSwgY3VzdG9tOiBbXSB9KTtcblx0XHRjb25zdCB7IHdpZGdldCB9ID0gY3JlYXRlTW9ja1dpZGdldChhc2tNb2RlLCBhd2FpdCBjaGF0TW9kZVNlcnZpY2UuZ2V0TG9jYWxNb2RlcygpKTsgLy8gd2lkZ2V0IGlzIGluIFwiYXNrXCIgbW9kZSAobm8gaGFuZG9mZnMpXG5cblx0XHRjb25zdCBtb2NrV2lkZ2V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIE1vY2tDaGF0V2lkZ2V0U2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBsYXN0Rm9jdXNlZFdpZGdldCA9IHdpZGdldCBhcyBJQ2hhdFdpZGdldDtcblx0XHR9O1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0V2lkZ2V0U2VydmljZSwgbW9ja1dpZGdldFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdE1vZGVTZXJ2aWNlLCBjaGF0TW9kZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChFeGVjdXRlSGFuZG9mZkFjdGlvbklkKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Db21tYW5kQXN5bmM8SUV4ZWN1dGVIYW5kb2ZmUmVzdWx0PihoYW5kbGVyLCBpbnN0YW50aWF0aW9uU2VydmljZSwgeyBpZDogJ2ltcGxlbWVudDpzdGFydC1pbXBsZW1lbnRhdGlvbicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5lcnJvcj8uaW5jbHVkZXMoJ05vIGhhbmRvZmZzIGF2YWlsYWJsZScpKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1N3aXRjaFRvTmV4dFBpbm5lZE1vZGVsQWN0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0bGV0IGNoYXRFeGVjdXRlQWN0aW9uczogRGlzcG9zYWJsZVN0b3JlO1xuXHRzdWl0ZVNldHVwKCgpID0+IHtcblx0XHRjaGF0RXhlY3V0ZUFjdGlvbnMgPSByZWdpc3RlckNoYXRFeGVjdXRlQWN0aW9ucygpO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKCgpID0+IHtcblx0XHRjaGF0RXhlY3V0ZUFjdGlvbnMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ludm9rZXMgc3dpdGNoVG9OZXh0UGlubmVkTW9kZWwgb24gdGhlIGxhc3QgZm9jdXNlZCB3aWRnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHN3aXRjaENhbGxzID0gMDtcblx0XHRjb25zdCBtb2NrV2lkZ2V0ID0ge1xuXHRcdFx0aW5wdXQ6IHtcblx0XHRcdFx0c3dpdGNoVG9OZXh0UGlubmVkTW9kZWw6ICgpID0+IHtcblx0XHRcdFx0XHRzd2l0Y2hDYWxscysrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0O1xuXG5cdFx0Y29uc3QgbW9ja1dpZGdldFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBNb2NrQ2hhdFdpZGdldFNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFzdEZvY3VzZWRXaWRnZXQgPSBtb2NrV2lkZ2V0O1xuXHRcdH07XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRXaWRnZXRTZXJ2aWNlLCBtb2NrV2lkZ2V0U2VydmljZSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3dpdGNoVG9OZXh0UGlubmVkTW9kZWwnKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlcik7XG5cblx0XHRhd2FpdCBydW5Db21tYW5kQXN5bmM8dm9pZD4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzd2l0Y2hDYWxscywgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzIGEgbm8tb3Agd2hlbiB0aGVyZSBpcyBubyBmb2N1c2VkIHdpZGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnN3aXRjaFRvTmV4dFBpbm5lZE1vZGVsJyk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0YXdhaXQgcnVuQ29tbWFuZEFzeW5jPHZvaWQ+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NoYXRTdWJtaXRBY3Rpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRsZXQgY2hhdEV4ZWN1dGVBY3Rpb25zOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHN1aXRlU2V0dXAoKCkgPT4ge1xuXHRcdGNoYXRFeGVjdXRlQWN0aW9ucyA9IHJlZ2lzdGVyQ2hhdEV4ZWN1dGVBY3Rpb25zKCk7XG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oKCkgPT4ge1xuXHRcdGNoYXRFeGVjdXRlQWN0aW9ucy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGFzc2VzIGFjY2VwdElucHV0T3B0aW9ucyB0byB0aGUgd2lkZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhY2NlcHRlZE9wdGlvbnM6IHVua25vd247XG5cdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0aW5wdXQ6IHtcblx0XHRcdFx0cGVuZGluZ0RlbGVnYXRpb25UYXJnZXQ6IHVuZGVmaW5lZCxcblx0XHRcdH0gYXMgSUNoYXRXaWRnZXRbJ2lucHV0J10sXG5cdFx0XHRhY2NlcHRJbnB1dDogYXN5bmMgKF9xdWVyeTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBJQ2hhdEFjY2VwdElucHV0T3B0aW9ucyB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRhY2NlcHRlZE9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9IHNhdGlzZmllcyBQYXJ0aWFsPElDaGF0V2lkZ2V0PjtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdFdpZGdldFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFdpZGdldFNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKENoYXRTdWJtaXRBY3Rpb24uSUQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGF3YWl0IHJ1bkNvbW1hbmRBc3luYzx2b2lkPihoYW5kbGVyLCBpbnN0YW50aWF0aW9uU2VydmljZSwge1xuXHRcdFx0d2lkZ2V0OiB3aWRnZXQgYXMgSUNoYXRXaWRnZXQsXG5cdFx0XHRhY2NlcHRJbnB1dE9wdGlvbnM6IHsgY2FuY2VsQ3VycmVudFJlcXVlc3Q6IHRydWUgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWNjZXB0ZWRPcHRpb25zLCB7IGNhbmNlbEN1cnJl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
