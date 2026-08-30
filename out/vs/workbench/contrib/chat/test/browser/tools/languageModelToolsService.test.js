import * as assert from "assert";
import { Barrier } from "../../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { CancellationError, isCancellationError } from "../../../../../../base/common/errors.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../../platform/contextkey/browser/contextKeyService.js";
import { ContextKeyEqualsExpr, ContextKeyExpr, IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../../../../platform/dialogs/test/common/testDialogService.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { ConfirmationOptionKind } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { LanguageModelToolsService } from "../../../browser/tools/languageModelToolsService.js";
import { IChatToolRiskAssessmentService, ToolRiskLevel } from "../../../browser/tools/chatToolRiskAssessmentService.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../common/constants.js";
import { SpecedToolAliases, isToolResultInputOutputDetails, ToolDataSource, ToolAndToolSetEnablementMap } from "../../../common/tools/languageModelToolsService.js";
import { MockChatService } from "../../common/chatService/mockChatService.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { CopilotChatSettingId, CopilotToolId } from "../../../common/tools/copilotToolIds.js";
import { ILanguageModelToolsConfirmationService } from "../../../common/tools/languageModelToolsConfirmationService.js";
import { MockLanguageModelToolsConfirmationService } from "../../common/tools/mockLanguageModelToolsConfirmationService.js";
import { IToolResultCompressor } from "../../../common/tools/toolResultCompressor.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
const noopToolResultCompressor = {
  _serviceBrand: void 0,
  registerFilter: () => {
  },
  registerCache: () => {
  },
  maybeCompress: () => void 0
};
class TestAccessibilitySignalService {
  constructor() {
    this.signalPlayedCalls = [];
  }
  async playSignal(signal, options) {
    this.signalPlayedCalls.push({ signal, options });
  }
  reset() {
    this.signalPlayedCalls = [];
  }
}
class TestTelemetryService {
  constructor() {
    this.events = [];
  }
  publicLog2(eventName, data) {
    this.events.push({ eventName, data });
  }
  reset() {
    this.events = [];
  }
}
class CountingDialogService extends TestDialogService {
  constructor() {
    super(...arguments);
    this.confirmCalls = 0;
  }
  confirm(confirmation) {
    this.confirmCalls++;
    return super.confirm(confirmation);
  }
}
class TestChatToolRiskAssessmentService {
  constructor() {
    this.enabled = false;
    this.assessment = void 0;
    this.assessError = void 0;
    /** Invoked synchronously at the start of {@link assess} so tests can cancel mid-flight. */
    this.onAssess = void 0;
    this.assessCalls = [];
  }
  isEnabled() {
    return this.enabled;
  }
  getCached() {
    return void 0;
  }
  async assess(tool, parameters, _token, kind, options) {
    this.assessCalls.push({ toolId: tool.id, parameters, kind });
    this.onAssess?.();
    if (!options?.ignoreEnablement && !this.enabled) {
      return void 0;
    }
    if (this.assessError) {
      throw this.assessError;
    }
    return this.assessment;
  }
}
function registerToolForTest(service, store, id, impl, data) {
  const toolData = {
    id,
    modelDescription: data?.modelDescription ?? "Test Tool",
    displayName: data?.displayName ?? "Test Tool",
    source: ToolDataSource.Internal,
    ...data
  };
  store.add(service.registerTool(toolData, impl));
  return {
    id,
    makeDto: (parameters, context, callId = "1") => ({
      callId,
      toolId: id,
      tokenBudget: 100,
      parameters,
      context: context ? {
        sessionResource: LocalChatSessionUri.forSession(context.sessionId)
      } : void 0
    })
  };
}
function stubGetSession(chatService, sessionId, options) {
  const requestId = options?.requestId ?? "requestId";
  const capture = options?.capture;
  const fakeModel = {
    sessionId,
    sessionResource: LocalChatSessionUri.forSession(sessionId),
    getRequests: () => [{ id: requestId, modelId: "test-model", modeInfo: options?.modeInfo }]
  };
  chatService.addSession(fakeModel);
  chatService.appendProgress = (request, progress) => {
    if (capture) {
      capture.invocation = progress;
    }
  };
  return fakeModel;
}
async function waitForPublishedInvocation(capture, tries = 10) {
  for (let i = 0; i < tries && !capture.invocation; i++) {
    await Promise.resolve();
  }
  return capture.invocation;
}
function createTestToolsService(store, options) {
  const configurationService = new TestConfigurationService();
  configurationService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
  options?.configureServices?.(configurationService);
  const instaService = workbenchInstantiationService({
    contextKeyService: () => store.add(new ContextKeyService(configurationService)),
    configurationService: () => configurationService
  }, store);
  const contextKeyService = instaService.get(IContextKeyService);
  const chatService = new MockChatService();
  instaService.stub(IChatService, chatService);
  instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
  instaService.stub(IToolResultCompressor, noopToolResultCompressor);
  const riskAssessmentService = new TestChatToolRiskAssessmentService();
  instaService.stub(IChatToolRiskAssessmentService, riskAssessmentService);
  if (options?.accessibilityService) {
    instaService.stub(IAccessibilityService, options.accessibilityService);
  }
  if (options?.accessibilitySignalService) {
    instaService.stub(IAccessibilitySignalService, options.accessibilitySignalService);
  }
  if (options?.telemetryService) {
    instaService.stub(ITelemetryService, options.telemetryService);
  }
  if (options?.commandService) {
    instaService.stub(ICommandService, options.commandService);
  }
  if (options?.dialogService) {
    instaService.stub(IDialogService, options.dialogService);
  }
  const service = store.add(instaService.createInstance(LanguageModelToolsService));
  return { configurationService, chatService, service, contextKeyService, riskAssessmentService };
}
function setupRiskGateTool(setup2, store, opts) {
  const withConfirmation = opts?.withConfirmation ?? true;
  const permissionLevel = opts?.permissionLevel ?? ChatPermissionLevel.Autopilot;
  const advancedEnabled = opts?.advancedEnabled ?? true;
  const toolId = opts?.toolId ?? "riskGateTool";
  setup2.configurationService.setUserConfiguration(ChatConfiguration.AutopilotAdvancedEnabled, advancedEnabled);
  setup2.configurationService.setUserConfiguration("chat.tools.global.autoApprove", false);
  let invoked = false;
  const tool = registerToolForTest(setup2.service, store, toolId, {
    prepareToolInvocation: async () => withConfirmation ? { confirmationMessages: { title: "Confirm?", message: "Proceed?" } } : {},
    invoke: async () => {
      invoked = true;
      return { content: [{ kind: "text", value: "ran" }] };
    }
  });
  const sessionId = "riskGateSession";
  stubGetSession(setup2.chatService, sessionId, { requestId: "req-risk", modeInfo: { permissionLevel } });
  return {
    invoke: (token = CancellationToken.None) => setup2.service.invokeTool(tool.makeDto({ x: 1 }, { sessionId }), async () => 0, token),
    wasInvoked: () => invoked
  };
}
suite("LanguageModelToolsService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let contextKeyService;
  let service;
  let chatService;
  let configurationService;
  setup(() => {
    const setup2 = createTestToolsService(store);
    configurationService = setup2.configurationService;
    chatService = setup2.chatService;
    service = setup2.service;
    contextKeyService = setup2.contextKeyService;
  });
  function setupToolsForTest(service2, store2) {
    const tool1 = {
      id: "tool1",
      toolReferenceName: "tool1RefName",
      modelDescription: "Test Tool 1",
      displayName: "Tool1 Display Name",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    store2.add(service2.registerToolData(tool1));
    const tool2 = {
      id: "tool2",
      modelDescription: "Test Tool 2",
      displayName: "Tool2 Display Name",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    store2.add(service2.registerToolData(tool2));
    const extTool1 = {
      id: "extTool1",
      toolReferenceName: "extTool1RefName",
      modelDescription: "Test Extension Tool 1",
      displayName: "ExtTool1 Display Name",
      source: { type: "extension", label: "My Extension", extensionId: new ExtensionIdentifier("my.extension") },
      canBeReferencedInPrompt: true
    };
    store2.add(service2.registerToolData(extTool1));
    const internalToolSetTool1 = {
      id: "internalToolSetTool1",
      toolReferenceName: "internalToolSetTool1RefName",
      modelDescription: "Test Internal Tool Set 1",
      displayName: "InternalToolSet1 Display Name",
      source: ToolDataSource.Internal
    };
    store2.add(service2.registerToolData(internalToolSetTool1));
    const internalToolSet = store2.add(service2.createToolSet(
      ToolDataSource.Internal,
      "internalToolSet",
      "internalToolSetRefName",
      { description: "Test Set" }
    ));
    store2.add(internalToolSet.addTool(internalToolSetTool1));
    const userToolSet = store2.add(service2.createToolSet(
      { type: "user", label: "User", file: URI.file("/test/userToolSet.json") },
      "userToolSet",
      "userToolSetRefName",
      { description: "Test Set" }
    ));
    store2.add(userToolSet.addTool(tool2));
    const mcpDataSource = { type: "mcp", label: "My MCP Server", serverLabel: "MCP Server", instructions: void 0, collectionId: "testMCPCollection", definitionId: "testMCPDefId" };
    const mcpTool1 = {
      id: "mcpTool1",
      toolReferenceName: "mcpTool1RefName",
      modelDescription: "Test MCP Tool 1",
      displayName: "McpTool1 Display Name",
      source: mcpDataSource,
      canBeReferencedInPrompt: true
    };
    store2.add(service2.registerToolData(mcpTool1));
    const mcpToolSet = store2.add(service2.createToolSet(
      mcpDataSource,
      "mcpToolSet",
      "mcpToolSetRefName",
      { description: "MCP Test ToolSet" }
    ));
    store2.add(mcpToolSet.addTool(mcpTool1));
  }
  test("registerToolData", () => {
    const toolData = {
      id: "testTool",
      modelDescription: "Test Tool",
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    const disposable = service.registerToolData(toolData);
    assert.strictEqual(service.getTool("testTool")?.id, "testTool");
    disposable.dispose();
    assert.strictEqual(service.getTool("testTool"), void 0);
  });
  test("registerToolImplementation", () => {
    const toolData = {
      id: "testTool",
      modelDescription: "Test Tool",
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolData));
    const toolImpl = {
      invoke: async () => ({ content: [{ kind: "text", value: "result" }] })
    };
    store.add(service.registerToolImplementation("testTool", toolImpl));
    assert.strictEqual(service.getTool("testTool")?.id, "testTool");
  });
  test("getTools", () => {
    contextKeyService.createKey("testKey", true);
    const toolData1 = {
      id: "testTool1",
      modelDescription: "Test Tool 1",
      when: ContextKeyEqualsExpr.create("testKey", false),
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    const toolData2 = {
      id: "testTool2",
      modelDescription: "Test Tool 2",
      when: ContextKeyEqualsExpr.create("testKey", true),
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    const toolData3 = {
      id: "testTool3",
      modelDescription: "Test Tool 3",
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolData1));
    store.add(service.registerToolData(toolData2));
    store.add(service.registerToolData(toolData3));
    const tools = Array.from(service.getTools(void 0));
    assert.strictEqual(tools.length, 2);
    assert.strictEqual(tools[0].id, "testTool2");
    assert.strictEqual(tools[1].id, "testTool3");
  });
  test("getToolByName", () => {
    contextKeyService.createKey("testKey", true);
    const toolData1 = {
      id: "testTool1",
      toolReferenceName: "testTool1",
      modelDescription: "Test Tool 1",
      when: ContextKeyEqualsExpr.create("testKey", false),
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    const toolData2 = {
      id: "testTool2",
      toolReferenceName: "testTool2",
      modelDescription: "Test Tool 2",
      when: ContextKeyEqualsExpr.create("testKey", true),
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    const toolData3 = {
      id: "testTool3",
      toolReferenceName: "testTool3",
      modelDescription: "Test Tool 3",
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolData1));
    store.add(service.registerToolData(toolData2));
    store.add(service.registerToolData(toolData3));
    assert.strictEqual(service.getToolByName("testTool1")?.id, "testTool1");
    assert.strictEqual(service.getToolByName("testTool2")?.id, "testTool2");
    assert.strictEqual(service.getToolByName("testTool3")?.id, "testTool3");
  });
  test("invokeTool", async () => {
    const toolData = {
      id: "testTool",
      modelDescription: "Test Tool",
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolData));
    const toolImpl = {
      invoke: async (invocation) => {
        assert.strictEqual(invocation.callId, "1");
        assert.strictEqual(invocation.toolId, "testTool");
        assert.deepStrictEqual(invocation.parameters, { a: 1 });
        return { content: [{ kind: "text", value: "result" }] };
      }
    };
    store.add(service.registerToolImplementation("testTool", toolImpl));
    const dto = {
      callId: "1",
      toolId: "testTool",
      tokenBudget: 100,
      parameters: {
        a: 1
      },
      context: void 0
    };
    const result = await service.invokeTool(dto, async () => 0, CancellationToken.None);
    assert.strictEqual(result.content[0].value, "result");
  });
  test("invokeTool uses re-registered implementation after prepareToolInvocation", async () => {
    const toolData = {
      id: "reRegisteredTool",
      modelDescription: "Re-registered Tool",
      displayName: "Re-registered Tool",
      source: ToolDataSource.Internal
    };
    const registration = store.add(service.registerTool(toolData, {
      prepareToolInvocation: async () => {
        registration.dispose();
        store.add(service.registerTool(toolData, {
          invoke: async () => ({ content: [{ kind: "text", value: "replacement result" }] })
        }));
        return void 0;
      },
      invoke: async () => ({ content: [{ kind: "text", value: "stale result" }] })
    }));
    const result = await service.invokeTool({
      callId: "1",
      toolId: toolData.id,
      tokenBudget: 100,
      parameters: {},
      context: void 0
    }, async () => 0, CancellationToken.None);
    assert.strictEqual(result.content[0].value, "replacement result");
  });
  test("invokeTool reports a tool removed during prepareToolInvocation as not contributed", async () => {
    const toolData = {
      id: "removedTool",
      modelDescription: "Removed Tool",
      displayName: "Removed Tool",
      source: ToolDataSource.Internal
    };
    const registration = store.add(service.registerTool(toolData, {
      prepareToolInvocation: async () => {
        registration.dispose();
        return void 0;
      },
      invoke: async () => ({ content: [{ kind: "text", value: "stale result" }] })
    }));
    await assert.rejects(service.invokeTool({
      callId: "1",
      toolId: toolData.id,
      tokenBudget: 100,
      parameters: {},
      context: void 0
    }, async () => 0, CancellationToken.None), /Tool removedTool was not contributed/);
  });
  test("invocation parameters are overridden by input toolSpecificData", async () => {
    const rawInput = { b: 2 };
    const tool = registerToolForTest(service, store, "testToolInputOverride", {
      prepareToolInvocation: async () => ({
        toolSpecificData: { kind: "input", rawInput },
        confirmationMessages: {
          title: "a",
          message: "b"
        }
      }),
      invoke: async (invocation) => {
        assert.deepStrictEqual(invocation.parameters, rawInput);
        assert.strictEqual(invocation.toolSpecificData, void 0);
        return { content: [{ kind: "text", value: "ok" }] };
      }
    });
    const sessionId = "sessionId";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "requestId-io", capture });
    const dto = tool.makeDto({ a: 1 }, { sessionId });
    const invokeP = service.invokeTool(dto, async () => 0, CancellationToken.None);
    const published = await waitForPublishedInvocation(capture);
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await invokeP;
    assert.strictEqual(result.content[0].value, "ok");
  });
  test("chat invocation injects input toolSpecificData for confirmation when alwaysDisplayInputOutput", async () => {
    const toolData = {
      id: "testToolDisplayIO",
      modelDescription: "Test Tool",
      displayName: "Test Tool",
      source: ToolDataSource.Internal,
      alwaysDisplayInputOutput: true
    };
    const tool = registerToolForTest(service, store, "testToolDisplayIO", {
      prepareToolInvocation: async () => ({
        confirmationMessages: { title: "Confirm", message: "Proceed?" }
      }),
      invoke: async () => ({ content: [{ kind: "text", value: "done" }] })
    }, toolData);
    const sessionId = "sessionId-io";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "requestId-io", capture });
    const dto = tool.makeDto({ a: 1 }, { sessionId });
    const invokeP = service.invokeTool(dto, async () => 0, CancellationToken.None);
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published, "expected ChatToolInvocation to be published");
    assert.strictEqual(published.toolId, tool.id);
    assert.strictEqual(published.toolSpecificData?.kind, "input");
    assert.deepStrictEqual(published.toolSpecificData?.rawInput, dto.parameters);
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await invokeP;
    assert.strictEqual(result.content[0].value, "done");
  });
  test("chat invocation waits for user confirmation before invoking", async () => {
    const toolData = {
      id: "testToolConfirm",
      modelDescription: "Test Tool",
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    let invoked = false;
    const tool = registerToolForTest(service, store, toolData.id, {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Confirm", message: "Go?" } }),
      invoke: async () => {
        invoked = true;
        return { content: [{ kind: "text", value: "ran" }] };
      }
    }, toolData);
    const sessionId = "sessionId-confirm";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "requestId-confirm", capture });
    const dto = tool.makeDto({ x: 1 }, { sessionId });
    const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published, "expected ChatToolInvocation to be published");
    assert.strictEqual(invoked, false, "invoke should not run before confirmation");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await promise;
    assert.strictEqual(invoked, true, "invoke should have run after confirmation");
    assert.strictEqual(result.content[0].value, "ran");
  });
  test("selectedCustomButton is passed to tool invoke when user selects a custom button", async () => {
    let receivedInvocation;
    const tool = registerToolForTest(service, store, "testToolCustomButton", {
      prepareToolInvocation: async () => ({
        confirmationMessages: {
          title: "Confirm",
          message: "Pick an option",
          customOptions: [
            { id: "Option A", label: "Option A", kind: ConfirmationOptionKind.Approve },
            { id: "Option B", label: "Option B", kind: ConfirmationOptionKind.Deny }
          ],
          allowAutoConfirm: false
        }
      }),
      invoke: async (invocation) => {
        receivedInvocation = invocation;
        return { content: [{ kind: "text", value: invocation.selectedCustomButton ?? "none" }] };
      }
    });
    const sessionId = "sessionId-custom-btn";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "requestId-custom-btn", capture });
    const dto = tool.makeDto({ x: 1 }, { sessionId });
    const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published, "expected ChatToolInvocation to be published");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction, selectedButton: "Option A" });
    const result = await promise;
    assert.strictEqual(receivedInvocation?.selectedCustomButton, "Option A");
    assert.strictEqual(result.content[0].value, "Option A");
  });
  test("selectedCustomButton is not set when user confirms without custom button", async () => {
    let receivedInvocation;
    const tool = registerToolForTest(service, store, "testToolNoCustomBtn", {
      prepareToolInvocation: async () => ({
        confirmationMessages: { title: "Confirm", message: "Go?" }
      }),
      invoke: async (invocation) => {
        receivedInvocation = invocation;
        return { content: [{ kind: "text", value: "ok" }] };
      }
    });
    const sessionId = "sessionId-no-custom-btn";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "requestId-no-custom-btn", capture });
    const dto = tool.makeDto({ x: 1 }, { sessionId });
    const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published);
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await promise;
    assert.strictEqual(receivedInvocation?.selectedCustomButton, void 0);
    assert.strictEqual(result.content[0].value, "ok");
  });
  test("confirmationMessages with customOptions disables allowAutoConfirm", async () => {
    const tool = registerToolForTest(service, store, "testToolCustomBtnNoAuto", {
      prepareToolInvocation: async () => ({
        confirmationMessages: {
          title: "Confirm",
          message: "Choose",
          customOptions: [
            { id: "Yes", label: "Yes", kind: ConfirmationOptionKind.Approve },
            { id: "No", label: "No", kind: ConfirmationOptionKind.Deny }
          ],
          allowAutoConfirm: false
        }
      }),
      invoke: async () => ({ content: [{ kind: "text", value: "done" }] })
    });
    const sessionId = "sessionId-custom-noauto";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "requestId-custom-noauto", capture });
    const dto = tool.makeDto({ x: 1 }, { sessionId });
    const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published, "expected ChatToolInvocation to be published");
    assert.deepStrictEqual(published.confirmationMessages?.customOptions?.map((o) => o.label), ["Yes", "No"]);
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction, selectedButton: "Yes" });
    await promise;
  });
  test("skipping modified-files confirmation returns the shared skip message and does not invoke the tool", async () => {
    let invoked = false;
    const tool = registerToolForTest(service, store, "testModifiedFilesConfirmationSkip", {
      prepareToolInvocation: async () => ({
        confirmationMessages: {
          title: "Confirm",
          message: "Choose",
          allowAutoConfirm: false
        },
        toolSpecificData: {
          kind: "modifiedFilesConfirmation",
          options: ["Copy Changes", "Move Changes"],
          modifiedFiles: [{
            uri: URI.parse("file:///workspace/file1.ts")
          }]
        }
      }),
      invoke: async () => {
        invoked = true;
        return { content: [{ kind: "text", value: "should not run" }] };
      }
    });
    const sessionId = "sessionId-modified-files-skip";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "requestId-modified-files-skip", capture });
    const dto = tool.makeDto({ x: 1 }, { sessionId });
    const promise = service.invokeTool(dto, async () => 0, CancellationToken.None);
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published, "expected ChatToolInvocation to be published");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.Skipped });
    const result = await promise;
    assert.strictEqual(invoked, false);
    assert.deepStrictEqual(result.content, [{
      kind: "text",
      value: "The user chose to skip the tool call, they want to proceed without running it"
    }]);
  });
  test("cancel tool call", async () => {
    const toolBarrier = new Barrier();
    const tool = registerToolForTest(service, store, "testTool", {
      invoke: async (invocation, countTokens, progress, cancelToken) => {
        assert.strictEqual(invocation.callId, "1");
        assert.strictEqual(invocation.toolId, "testTool");
        assert.deepStrictEqual(invocation.parameters, { a: 1 });
        await toolBarrier.wait();
        if (cancelToken.isCancellationRequested) {
          throw new CancellationError();
        } else {
          throw new Error("Tool call should be cancelled");
        }
      }
    });
    const sessionId = "sessionId";
    const requestId = "requestId";
    const dto = tool.makeDto({ a: 1 }, { sessionId });
    stubGetSession(chatService, sessionId, { requestId });
    const toolPromise = service.invokeTool(dto, async () => 0, CancellationToken.None);
    service.cancelToolCallsForRequest(requestId);
    toolBarrier.open();
    await assert.rejects(toolPromise, (err) => {
      return isCancellationError(err);
    }, "Expected tool call to be cancelled");
  });
  test("rejects tool invocation for cancelled request id", async () => {
    let invoked = false;
    const tool = registerToolForTest(service, store, "testTool", {
      invoke: async () => {
        invoked = true;
        return { content: [{ kind: "text", value: "done" }] };
      }
    });
    const sessionId = "sessionId-cancelled-request";
    const requestId = "requestId-cancelled-request";
    const fakeModel = {
      sessionId,
      sessionResource: LocalChatSessionUri.forSession(sessionId),
      getRequests: () => [{
        id: requestId,
        modelId: "test-model",
        response: { isCanceled: true }
      }]
    };
    chatService.addSession(fakeModel);
    const dto = {
      ...tool.makeDto({ a: 1 }, { sessionId }),
      chatRequestId: requestId
    };
    await assert.rejects(service.invokeTool(dto, async () => 0, CancellationToken.None), (err) => {
      return isCancellationError(err);
    }, "Expected tool invocation to be rejected for cancelled request id");
    assert.strictEqual(invoked, false, "Tool implementation should not run after request cancellation");
  });
  test("toFullReferenceNames", () => {
    setupToolsForTest(service, store);
    const tool1 = service.getToolByFullReferenceName("tool1RefName");
    const extTool1 = service.getToolByFullReferenceName("my.extension/extTool1RefName");
    const mcpToolSet = service.getToolByFullReferenceName("mcpToolSetRefName/*");
    const mcpTool1 = service.getToolByFullReferenceName("mcpToolSetRefName/mcpTool1RefName");
    const internalToolSet = service.getToolByFullReferenceName("internalToolSetRefName");
    const internalTool = service.getToolByFullReferenceName("internalToolSetRefName/internalToolSetTool1RefName");
    const userToolSet = service.getToolSet("userToolSet");
    const unknownTool = { id: "unregisteredTool", toolReferenceName: "unregisteredToolRefName", modelDescription: "Unregistered Tool", displayName: "Unregistered Tool", source: ToolDataSource.Internal, canBeReferencedInPrompt: true };
    const unknownToolSet = service.createToolSet(ToolDataSource.Internal, "unknownToolSet", "unknownToolSetRefName", { description: "Unknown Test Set" });
    unknownToolSet.dispose();
    assert.ok(tool1);
    assert.ok(extTool1);
    assert.ok(mcpTool1);
    assert.ok(mcpToolSet);
    assert.ok(internalToolSet);
    assert.ok(internalTool);
    assert.ok(userToolSet);
    {
      const map = ToolAndToolSetEnablementMap.fromEntries([[tool1, true], [extTool1, true], [mcpToolSet, true], [mcpTool1, true]]);
      const fullReferenceNames = service.toFullReferenceNames(map);
      const expectedFullReferenceNames = ["tool1RefName", "my.extension/extTool1RefName", "mcpToolSetRefName/*"];
      assert.deepStrictEqual(fullReferenceNames.sort(), expectedFullReferenceNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
    {
      const map = ToolAndToolSetEnablementMap.fromEntries([[tool1, true], [userToolSet, true], [internalToolSet, false], [internalTool, true]]);
      const fullReferenceNames = service.toFullReferenceNames(map);
      const expectedFullReferenceNames = ["tool1RefName", "internalToolSetRefName/internalToolSetTool1RefName"];
      assert.deepStrictEqual(fullReferenceNames.sort(), expectedFullReferenceNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
    {
      const map = ToolAndToolSetEnablementMap.fromEntries([[unknownTool, true], [unknownToolSet, true], [internalToolSet, true], [internalTool, true]]);
      const fullReferenceNames = service.toFullReferenceNames(map);
      const expectedFullReferenceNames = ["internalToolSetRefName"];
      assert.deepStrictEqual(fullReferenceNames.sort(), expectedFullReferenceNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
  });
  test("getFullReferenceName returns qualified names for tools and tool sets", () => {
    setupToolsForTest(service, store);
    const extTool1 = service.getToolByFullReferenceName("my.extension/extTool1RefName");
    const mcpToolSet = service.getToolByFullReferenceName("mcpToolSetRefName/*");
    const mcpTool1 = service.getToolByFullReferenceName("mcpToolSetRefName/mcpTool1RefName");
    const internalToolSet = service.getToolByFullReferenceName("internalToolSetRefName");
    const internalTool = service.getToolByFullReferenceName("internalToolSetRefName/internalToolSetTool1RefName");
    assert.ok(extTool1);
    assert.ok(mcpToolSet);
    assert.ok(mcpTool1);
    assert.ok(internalToolSet);
    assert.ok(internalTool);
    assert.strictEqual(service.getFullReferenceName(extTool1), "my.extension/extTool1RefName");
    assert.strictEqual(service.getFullReferenceName(mcpToolSet), "mcpToolSetRefName/*");
    assert.strictEqual(service.getFullReferenceName(mcpTool1), "mcpToolSetRefName/mcpTool1RefName");
    assert.strictEqual(service.getFullReferenceName(internalToolSet), "internalToolSetRefName");
    assert.strictEqual(service.getFullReferenceName(internalTool), "internalToolSetRefName/internalToolSetTool1RefName");
    for (const item of [extTool1, mcpToolSet, mcpTool1, internalToolSet, internalTool]) {
      assert.strictEqual(service.getToolByFullReferenceName(service.getFullReferenceName(item)), item);
    }
  });
  test("toToolAndToolSetEnablementMap", () => {
    setupToolsForTest(service, store);
    const allFullReferenceNames = [
      "tool1RefName",
      "Tool2 Display Name",
      "my.extension/extTool1RefName",
      "mcpToolSetRefName/*",
      "mcpToolSetRefName/mcpTool1RefName",
      "internalToolSetRefName",
      "internalToolSetRefName/internalToolSetTool1RefName",
      "vscode",
      "execute",
      "read",
      "agent"
    ];
    const numOfTools = allFullReferenceNames.length + 1;
    const tool1 = service.getToolByFullReferenceName("tool1RefName");
    const tool2 = service.getToolByFullReferenceName("Tool2 Display Name");
    const extTool1 = service.getToolByFullReferenceName("my.extension/extTool1RefName");
    const mcpToolSet = service.getToolByFullReferenceName("mcpToolSetRefName/*");
    const mcpTool1 = service.getToolByFullReferenceName("mcpToolSetRefName/mcpTool1RefName");
    const internalToolSet = service.getToolByFullReferenceName("internalToolSetRefName");
    const internalTool = service.getToolByFullReferenceName("internalToolSetRefName/internalToolSetTool1RefName");
    const userToolSet = service.getToolSet("userToolSet");
    const vscodeToolSet = service.getToolSet("vscode");
    const executeToolSet = service.getToolSet("execute");
    const readToolSet = service.getToolSet("read");
    const agentToolSet = service.getToolSet("agent");
    assert.ok(tool1);
    assert.ok(tool2);
    assert.ok(extTool1);
    assert.ok(mcpTool1);
    assert.ok(mcpToolSet);
    assert.ok(internalToolSet);
    assert.ok(internalTool);
    assert.ok(userToolSet);
    assert.ok(vscodeToolSet);
    assert.ok(executeToolSet);
    assert.ok(readToolSet);
    assert.ok(agentToolSet);
    {
      const fullReferenceNames = ["tool1RefName"];
      const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, void 0);
      assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
      assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 1, "Expected 1 tool to be enabled");
      assert.strictEqual(result1.get(tool1), true, "tool1 should be enabled");
      const fullReferenceNames1 = service.toFullReferenceNames(result1);
      assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
    {
      const fullReferenceNames = ["my.extension/extTool1RefName", "mcpToolSetRefName/*", "internalToolSetRefName/internalToolSetTool1RefName"];
      const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, void 0);
      assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
      assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 4, "Expected 4 tools to be enabled");
      assert.strictEqual(result1.get(extTool1), true, "extTool1 should be enabled");
      assert.strictEqual(result1.get(mcpToolSet), true, "mcpToolSet should be enabled");
      assert.strictEqual(result1.get(mcpTool1), true, "mcpTool1 should be enabled because the set is enabled");
      assert.strictEqual(result1.get(internalTool), true, "internalTool should be enabled because the set is enabled");
      const fullReferenceNames1 = service.toFullReferenceNames(result1);
      assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), "toFullReferenceNames should return the expected names");
    }
    {
      const result1 = service.toToolAndToolSetEnablementMap(allFullReferenceNames, void 0);
      assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
      assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 12, "Expected 12 tools to be enabled");
      const fullReferenceNames1 = service.toFullReferenceNames(result1);
      const expectedFullReferenceNames = ["tool1RefName", "Tool2 Display Name", "my.extension/extTool1RefName", "mcpToolSetRefName/*", "internalToolSetRefName", "vscode", "execute", "read", "agent"];
      assert.deepStrictEqual(fullReferenceNames1.sort(), expectedFullReferenceNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
    {
      const fullReferenceNames = [];
      const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, void 0);
      assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
      assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 0, "Expected 0 tools to be enabled");
      const fullReferenceNames1 = service.toFullReferenceNames(result1);
      assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
    {
      const fullReferenceNames = ["unknownToolRefName"];
      const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, void 0);
      assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
      assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 0, "Expected 0 tools to be enabled");
      const fullReferenceNames1 = service.toFullReferenceNames(result1);
      assert.deepStrictEqual(fullReferenceNames1.sort(), [], "toFullReferenceNames should return no enabled names");
    }
    {
      const fullReferenceNames = ["extTool1RefName", "mcpToolSetRefName", "internalToolSetTool1RefName"];
      const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, void 0);
      assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
      assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 4, "Expected 4 tools to be enabled");
      assert.strictEqual(result1.get(extTool1), true, "extTool1 should be enabled");
      assert.strictEqual(result1.get(mcpToolSet), true, "mcpToolSet should be enabled");
      assert.strictEqual(result1.get(mcpTool1), true, "mcpTool1 should be enabled because the set is enabled");
      assert.strictEqual(result1.get(internalTool), true, "internalTool should be enabled");
      const fullReferenceNames1 = service.toFullReferenceNames(result1);
      const expectedFullReferenceNames = ["my.extension/extTool1RefName", "mcpToolSetRefName/*", "internalToolSetRefName/internalToolSetTool1RefName"];
      assert.deepStrictEqual(fullReferenceNames1.sort(), expectedFullReferenceNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
    {
      const fullReferenceNames = ["Tool2 Display Name"];
      const result1 = service.toToolAndToolSetEnablementMap(fullReferenceNames, void 0);
      assert.strictEqual(result1.size, numOfTools, `Expected ${numOfTools} tools and tool sets`);
      assert.strictEqual([...result1.entries()].filter(([_, enabled]) => enabled).length, 2, "Expected 1 tool and user tool set to be enabled");
      assert.strictEqual(result1.get(tool2), true, "tool2 should be enabled");
      assert.strictEqual(result1.get(userToolSet), true, "userToolSet should be enabled");
      const fullReferenceNames1 = service.toFullReferenceNames(result1);
      assert.deepStrictEqual(fullReferenceNames1.sort(), fullReferenceNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
  });
  test("toToolAndToolSetEnablementMap with extension tool", () => {
    const toolData1 = {
      id: "tool1",
      toolReferenceName: "refTool1",
      modelDescription: "Test Tool 1",
      displayName: "Test Tool 1",
      source: { type: "extension", label: "My Extension", extensionId: new ExtensionIdentifier("My.extension") },
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(toolData1));
    const enabledNames = [toolData1].map((t) => service.getFullReferenceName(t));
    const result = service.toToolAndToolSetEnablementMap(enabledNames, void 0);
    assert.strictEqual(result.get(toolData1), true, "individual tool should be enabled");
    const fullReferenceNames = service.toFullReferenceNames(result);
    assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), "toFullReferenceNames should return the original enabled names");
  });
  test("toToolAndToolSetEnablementMap with tool sets", () => {
    const toolData1 = {
      id: "tool1",
      toolReferenceName: "refTool1",
      modelDescription: "Test Tool 1",
      displayName: "Test Tool 1",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    const toolData2 = {
      id: "tool2",
      modelDescription: "Test Tool 2",
      displayName: "Test Tool 2",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(toolData1));
    store.add(service.registerToolData(toolData2));
    const toolSet = store.add(service.createToolSet(
      ToolDataSource.Internal,
      "testToolSet",
      "refToolSet",
      { description: "Test Tool Set" }
    ));
    const toolSetTool1 = {
      id: "toolSetTool1",
      modelDescription: "Tool Set Tool 1",
      displayName: "Tool Set Tool 1",
      source: ToolDataSource.Internal
    };
    const toolSetTool2 = {
      id: "toolSetTool2",
      modelDescription: "Tool Set Tool 2",
      displayName: "Tool Set Tool 2",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolSetTool1));
    store.add(service.registerToolData(toolSetTool2));
    store.add(toolSet.addTool(toolSetTool1));
    store.add(toolSet.addTool(toolSetTool2));
    const enabledNames = [toolSet, toolData1].map((t) => service.getFullReferenceName(t));
    const result = service.toToolAndToolSetEnablementMap(enabledNames, void 0);
    assert.strictEqual(result.get(toolData1), true, "individual tool should be enabled");
    assert.strictEqual(result.get(toolData2), false);
    assert.strictEqual(result.get(toolSet), true, "tool set should be enabled");
    assert.strictEqual(result.get(toolSetTool1), true, "tool set tool 1 should be enabled");
    assert.strictEqual(result.get(toolSetTool2), true, "tool set tool 2 should be enabled");
    const fullReferenceNames = service.toFullReferenceNames(result);
    assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), "toFullReferenceNames should return the original enabled names");
  });
  test("toFullReferenceNames does not emit a tool set when a member tool is unchecked", () => {
    const toolSet = store.add(service.createToolSet(
      ToolDataSource.Internal,
      "testToolSet",
      "refToolSet",
      { description: "Test Tool Set" }
    ));
    const toolSetTool1 = {
      id: "toolSetTool1",
      toolReferenceName: "toolSetTool1Ref",
      modelDescription: "Tool Set Tool 1",
      displayName: "Tool Set Tool 1",
      source: ToolDataSource.Internal
    };
    const toolSetTool2 = {
      id: "toolSetTool2",
      toolReferenceName: "toolSetTool2Ref",
      modelDescription: "Tool Set Tool 2",
      displayName: "Tool Set Tool 2",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolSetTool1));
    store.add(service.registerToolData(toolSetTool2));
    store.add(toolSet.addTool(toolSetTool1));
    store.add(toolSet.addTool(toolSetTool2));
    const selection = service.toToolAndToolSetEnablementMap(["refToolSet", "toolSetTool1Ref"], void 0);
    const fullReferenceNames = service.toFullReferenceNames(selection);
    assert.deepStrictEqual(fullReferenceNames, [service.getFullReferenceName(toolSet)]);
  });
  test("toToolAndToolSetEnablementMap with non-existent tool names", () => {
    const toolData = {
      id: "tool1",
      toolReferenceName: "refTool1",
      modelDescription: "Test Tool 1",
      displayName: "Test Tool 1",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(toolData));
    const unregisteredToolData = {
      id: "toolX",
      toolReferenceName: "refToolX",
      modelDescription: "Test Tool X",
      displayName: "Test Tool X",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    const enabledNames = [toolData, unregisteredToolData].map((t) => service.getFullReferenceName(t));
    const result = service.toToolAndToolSetEnablementMap(enabledNames, void 0);
    assert.strictEqual(result.get(toolData), true, "existing tool should be enabled");
    assert.strictEqual(result.get(unregisteredToolData), void 0, "non-existent tool should not be in result");
    const fullReferenceNames = service.toFullReferenceNames(result);
    const expectedNames = [service.getFullReferenceName(toolData)];
    assert.deepStrictEqual(fullReferenceNames.sort(), expectedNames.sort(), "toFullReferenceNames should return the original enabled names");
  });
  test("toToolAndToolSetEnablementMap with legacy names", () => {
    const toolWithLegacy = {
      id: "newTool",
      toolReferenceName: "newToolRef",
      modelDescription: "New Tool",
      displayName: "New Tool",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true,
      legacyToolReferenceFullNames: ["oldToolName", "deprecatedToolName"]
    };
    store.add(service.registerToolData(toolWithLegacy));
    const toolSetWithLegacy = store.add(service.createToolSet(
      ToolDataSource.Internal,
      "newToolSet",
      "newToolSetRef",
      { description: "New Tool Set", legacyFullNames: ["oldToolSet", "deprecatedToolSet"] }
    ));
    const toolInSet = {
      id: "toolInSet",
      toolReferenceName: "toolInSetRef",
      modelDescription: "Tool In Set",
      displayName: "Tool In Set",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolInSet));
    store.add(toolSetWithLegacy.addTool(toolInSet));
    {
      const result = service.toToolAndToolSetEnablementMap(["oldToolName"], void 0);
      assert.strictEqual(result.get(toolWithLegacy), true, "tool should be enabled via legacy name");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames, ["newToolRef"], "should return current full reference name, not legacy");
    }
    {
      const result = service.toToolAndToolSetEnablementMap(["deprecatedToolName"], void 0);
      assert.strictEqual(result.get(toolWithLegacy), true, "tool should be enabled via another legacy name");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames, ["newToolRef"], "should return current full reference name, not legacy");
    }
    {
      const result = service.toToolAndToolSetEnablementMap(["oldToolSet"], void 0);
      assert.strictEqual(result.get(toolSetWithLegacy), true, "toolset should be enabled via legacy name");
      assert.strictEqual(result.get(toolInSet), true, "tool in set should be enabled when set is enabled via legacy name");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames, ["newToolSetRef"], "should return current full reference name, not legacy");
    }
    {
      const result = service.toToolAndToolSetEnablementMap(["deprecatedToolSet"], void 0);
      assert.strictEqual(result.get(toolSetWithLegacy), true, "toolset should be enabled via another legacy name");
      assert.strictEqual(result.get(toolInSet), true, "tool in set should be enabled when set is enabled via legacy name");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames, ["newToolSetRef"], "should return current full reference name, not legacy");
    }
    {
      const result = service.toToolAndToolSetEnablementMap(["newToolRef", "oldToolSet"], void 0);
      assert.strictEqual(result.get(toolWithLegacy), true, "tool should be enabled via current name");
      assert.strictEqual(result.get(toolSetWithLegacy), true, "toolset should be enabled via legacy name");
      assert.strictEqual(result.get(toolInSet), true, "tool in set should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames.sort(), ["newToolRef", "newToolSetRef"].sort(), "should return current full reference names");
    }
    {
      const result = service.toToolAndToolSetEnablementMap(["newToolRef", "oldToolName", "deprecatedToolName"], void 0);
      assert.strictEqual(result.get(toolWithLegacy), true, "tool should be enabled (redundant legacy names should not cause issues)");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames, ["newToolRef"], "should return single current full reference name");
    }
  });
  test("toToolAndToolSetEnablementMap with orphaned toolset in legacy names", () => {
    const toolWithOrphanedToolSet = {
      id: "migratedTool",
      toolReferenceName: "newToolRef",
      modelDescription: "Migrated Tool",
      displayName: "Migrated Tool",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true,
      legacyToolReferenceFullNames: ["oldToolSet/oldToolName"]
    };
    store.add(service.registerToolData(toolWithOrphanedToolSet));
    {
      const result = service.toToolAndToolSetEnablementMap(["oldToolSet/oldToolName"], void 0);
      assert.strictEqual(result.get(toolWithOrphanedToolSet), true, "tool should be enabled via full legacy name");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames, ["newToolRef"], "should return current full reference name");
    }
    {
      const result = service.toToolAndToolSetEnablementMap(["oldToolSet"], void 0);
      assert.strictEqual(result.get(toolWithOrphanedToolSet), true, "tool should be enabled via orphaned toolset name");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames, ["newToolRef"], "should return current full reference name");
    }
    const anotherToolFromOrphanedSet = {
      id: "anotherMigratedTool",
      toolReferenceName: "anotherNewToolRef",
      modelDescription: "Another Migrated Tool",
      displayName: "Another Migrated Tool",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true,
      legacyToolReferenceFullNames: ["oldToolSet/anotherOldToolName"]
    };
    store.add(service.registerToolData(anotherToolFromOrphanedSet));
    {
      const result = service.toToolAndToolSetEnablementMap(["oldToolSet"], void 0);
      assert.strictEqual(result.get(toolWithOrphanedToolSet), true, "first tool should be enabled via orphaned toolset name");
      assert.strictEqual(result.get(anotherToolFromOrphanedSet), true, "second tool should also be enabled via orphaned toolset name");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames.sort(), ["newToolRef", "anotherNewToolRef"].sort(), "should return both current full reference names");
    }
    const unrelatedTool = {
      id: "unrelatedTool",
      toolReferenceName: "unrelatedToolRef",
      modelDescription: "Unrelated Tool",
      displayName: "Unrelated Tool",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true,
      legacyToolReferenceFullNames: ["differentToolSet/oldName"]
    };
    store.add(service.registerToolData(unrelatedTool));
    {
      const result = service.toToolAndToolSetEnablementMap(["oldToolSet"], void 0);
      assert.strictEqual(result.get(toolWithOrphanedToolSet), true, "tool from oldToolSet should be enabled");
      assert.strictEqual(result.get(anotherToolFromOrphanedSet), true, "another tool from oldToolSet should be enabled");
      assert.strictEqual(result.get(unrelatedTool), false, "tool from different toolset should NOT be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames.sort(), ["newToolRef", "anotherNewToolRef"].sort(), "should only return tools from oldToolSet");
    }
    const newToolSetWithSameName = store.add(service.createToolSet(
      ToolDataSource.Internal,
      "recreatedToolSet",
      "oldToolSet",
      // Same name as the orphaned toolset
      { description: "Recreated Tool Set" }
    ));
    const toolInRecreatedSet = {
      id: "toolInRecreatedSet",
      toolReferenceName: "toolInRecreatedSetRef",
      modelDescription: "Tool In Recreated Set",
      displayName: "Tool In Recreated Set",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolInRecreatedSet));
    store.add(newToolSetWithSameName.addTool(toolInRecreatedSet));
    {
      const result = service.toToolAndToolSetEnablementMap(["oldToolSet"], void 0);
      assert.strictEqual(result.get(newToolSetWithSameName), true, "recreated toolset should be enabled");
      assert.strictEqual(result.get(toolInRecreatedSet), true, "tool in recreated set should be enabled");
      assert.strictEqual(result.get(toolWithOrphanedToolSet), true, "tool with legacy toolset should still be enabled");
      assert.strictEqual(result.get(anotherToolFromOrphanedSet), true, "another tool with legacy toolset should still be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames.sort(), ["oldToolSet", "newToolRef", "anotherNewToolRef"].sort(), "should return toolset and individual tools");
    }
  });
  test("toToolAndToolSetEnablementMap map Github to VSCode tools", () => {
    const runInTerminalToolData = {
      id: "runInTerminalId",
      toolReferenceName: "runInTerminal",
      modelDescription: "runInTerminal Description",
      displayName: "runInTerminal displayName",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: false
    };
    store.add(service.registerToolData(runInTerminalToolData));
    store.add(service.executeToolSet.addTool(runInTerminalToolData));
    const runSubagentToolData = {
      id: "runSubagentId",
      toolReferenceName: "runSubagent",
      modelDescription: "runSubagent Description",
      displayName: "runSubagent displayName",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: false
    };
    store.add(service.registerToolData(runSubagentToolData));
    store.add(service.agentToolSet.addTool(runSubagentToolData));
    const githubMcpDataSource = { type: "mcp", label: "Github", serverLabel: "Github MCP Server", instructions: void 0, collectionId: "githubMCPCollection", definitionId: "githubMCPDefId" };
    const githubMcpTool1 = {
      id: "create_branch",
      toolReferenceName: "create_branch",
      modelDescription: "Test Github MCP Tool 1",
      displayName: "Create Branch",
      source: githubMcpDataSource,
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(githubMcpTool1));
    const githubMcpToolSet = store.add(service.createToolSet(
      githubMcpDataSource,
      "githubMcpToolSet",
      "github/github-mcp-server",
      { description: "Github MCP Test ToolSet" }
    ));
    store.add(githubMcpToolSet.addTool(githubMcpTool1));
    assert.equal(githubMcpToolSet.referenceName, "github", "github/github-mcp-server will be normalized to github");
    const playwrightMcpDataSource = { type: "mcp", label: "playwright", serverLabel: "playwright MCP Server", instructions: void 0, collectionId: "playwrightMCPCollection", definitionId: "playwrightMCPDefId" };
    const playwrightMcpTool1 = {
      id: "browser_click",
      toolReferenceName: "browser_click",
      modelDescription: "Test playwright MCP Tool 1",
      displayName: "Create Branch",
      source: playwrightMcpDataSource,
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(playwrightMcpTool1));
    const playwrightMcpToolSet = store.add(service.createToolSet(
      playwrightMcpDataSource,
      "playwrightMcpToolSet",
      "microsoft/playwright-mcp",
      { description: "playwright MCP Test ToolSet" }
    ));
    store.add(playwrightMcpToolSet.addTool(playwrightMcpTool1));
    const deprecated = service.getDeprecatedFullReferenceNames();
    const deprecatesTo = (key) => {
      const values = deprecated.get(key);
      return values ? Array.from(values).sort() : void 0;
    };
    assert.equal(playwrightMcpToolSet.referenceName, "playwright", "microsoft/playwright-mcp will be normalized to playwright");
    {
      const toolNames = ["custom-agent", "shell"];
      const result = service.toToolAndToolSetEnablementMap(toolNames, void 0);
      assert.strictEqual(result.get(service.executeToolSet), true, "execute should be enabled");
      assert.strictEqual(result.get(service.agentToolSet), true, "agent should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result).sort();
      assert.deepStrictEqual(fullReferenceNames, [SpecedToolAliases.agent, SpecedToolAliases.execute].sort(), "toFullReferenceNames should return the VS Code tool names");
      assert.deepStrictEqual(toolNames.map((name) => service.getToolByFullReferenceName(name)), [service.agentToolSet, service.executeToolSet]);
      assert.deepStrictEqual(deprecatesTo("custom-agent"), [SpecedToolAliases.agent], "customAgent should map to agent");
      assert.deepStrictEqual(deprecatesTo("shell"), [SpecedToolAliases.execute], "shell is now execute");
    }
    {
      const toolNames = ["github/*", "playwright/*"];
      const result = service.toToolAndToolSetEnablementMap(toolNames, void 0);
      assert.strictEqual(result.get(githubMcpToolSet), true, "githubMcpToolSet should be enabled");
      assert.strictEqual(result.get(playwrightMcpToolSet), true, "playwrightMcpToolSet should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result).sort();
      assert.deepStrictEqual(fullReferenceNames, ["github/*", "playwright/*"], "toFullReferenceNames should return the VS Code tool names");
      assert.deepStrictEqual(toolNames.map((name) => service.getToolByFullReferenceName(name)), [githubMcpToolSet, playwrightMcpToolSet]);
      assert.deepStrictEqual(deprecatesTo("github/*"), void 0, "github/* is fine");
      assert.deepStrictEqual(deprecatesTo("playwright/*"), void 0, "playwright/* is fine");
    }
    {
      const toolNames = ["github/create_branch", "playwright/browser_click"];
      const result = service.toToolAndToolSetEnablementMap(toolNames, void 0);
      assert.strictEqual(result.get(githubMcpTool1), true, "githubMcpTool1 should be enabled");
      assert.strictEqual(result.get(playwrightMcpTool1), true, "playwrightMcpTool1 should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result).sort();
      assert.deepStrictEqual(fullReferenceNames, ["github/create_branch", "playwright/browser_click"], "toFullReferenceNames should return the speced names");
      assert.deepStrictEqual(toolNames.map((name) => service.getToolByFullReferenceName(name)), [githubMcpTool1, playwrightMcpTool1]);
      assert.deepStrictEqual(deprecatesTo("github/create_branch"), void 0, "github/create_branch is fine");
      assert.deepStrictEqual(deprecatesTo("playwright/browser_click"), void 0, "playwright/browser_click is fine");
    }
    {
      const toolNames = ["github/github-mcp-server/*", "microsoft/playwright-mcp/*"];
      const result = service.toToolAndToolSetEnablementMap(toolNames, void 0);
      assert.strictEqual(result.get(githubMcpToolSet), true, "githubMcpToolSet should be enabled");
      assert.strictEqual(result.get(playwrightMcpToolSet), true, "playwrightMcpToolSet should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result).sort();
      assert.deepStrictEqual(fullReferenceNames, ["github/*", "playwright/*"], "toFullReferenceNames should return the speced names");
      assert.deepStrictEqual(toolNames.map((name) => service.getToolByFullReferenceName(name)), [githubMcpToolSet, playwrightMcpToolSet]);
      assert.deepStrictEqual(deprecatesTo("github/github-mcp-server/*"), ["github/*"]);
      assert.deepStrictEqual(deprecatesTo("microsoft/playwright-mcp/*"), ["playwright/*"]);
    }
    {
      const toolNames = ["github/github-mcp-server/create_branch", "microsoft/playwright-mcp/browser_click"];
      const result = service.toToolAndToolSetEnablementMap(toolNames, void 0);
      assert.strictEqual(result.get(githubMcpTool1), true, "githubMcpTool1 should be enabled");
      assert.strictEqual(result.get(playwrightMcpTool1), true, "playwrightMcpTool1 should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result).sort();
      assert.deepStrictEqual(fullReferenceNames, ["github/create_branch", "playwright/browser_click"], "toFullReferenceNames should return the speced names");
      assert.deepStrictEqual(toolNames.map((name) => service.getToolByFullReferenceName(name)), [githubMcpTool1, playwrightMcpTool1]);
      assert.deepStrictEqual(deprecatesTo("github/github-mcp-server/create_branch"), ["github/create_branch"]);
      assert.deepStrictEqual(deprecatesTo("microsoft/playwright-mcp/browser_click"), ["playwright/browser_click"]);
    }
    {
      const toolNames = ["io.github.github/github-mcp-server/*", "com.microsoft/playwright-mcp/*"];
      const result = service.toToolAndToolSetEnablementMap(toolNames, void 0);
      assert.strictEqual(result.get(githubMcpToolSet), true, "githubMcpToolSet should be enabled");
      assert.strictEqual(result.get(playwrightMcpToolSet), true, "playwrightMcpToolSet should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result).sort();
      assert.deepStrictEqual(fullReferenceNames, ["github/*", "playwright/*"], "toFullReferenceNames should return the speced names");
      assert.deepStrictEqual(toolNames.map((name) => service.getToolByFullReferenceName(name)), [githubMcpToolSet, playwrightMcpToolSet]);
      assert.deepStrictEqual(deprecatesTo("io.github.github/github-mcp-server/*"), ["github/*"]);
      assert.deepStrictEqual(deprecatesTo("com.microsoft/playwright-mcp/*"), ["playwright/*"]);
    }
    {
      const toolNames = ["io.github.github/github-mcp-server/create_branch", "com.microsoft/playwright-mcp/browser_click"];
      const result = service.toToolAndToolSetEnablementMap(toolNames, void 0);
      assert.strictEqual(result.get(githubMcpTool1), true, "githubMcpTool1 should be enabled");
      assert.strictEqual(result.get(playwrightMcpTool1), true, "playwrightMcpTool1 should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result).sort();
      assert.deepStrictEqual(fullReferenceNames, ["github/create_branch", "playwright/browser_click"], "toFullReferenceNames should return the speced names");
      assert.deepStrictEqual(toolNames.map((name) => service.getToolByFullReferenceName(name)), [githubMcpTool1, playwrightMcpTool1]);
      assert.deepStrictEqual(deprecatesTo("io.github.github/github-mcp-server/create_branch"), ["github/create_branch"]);
      assert.deepStrictEqual(deprecatesTo("com.microsoft/playwright-mcp/browser_click"), ["playwright/browser_click"]);
    }
    {
      const toolNames = ["github-mcp-server/create_branch"];
      const result = service.toToolAndToolSetEnablementMap(toolNames, void 0);
      assert.strictEqual(result.get(githubMcpTool1), true, "githubMcpTool1 should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result).sort();
      assert.deepStrictEqual(fullReferenceNames, ["github/create_branch"], "toFullReferenceNames should return the VS Code tool names");
      assert.deepStrictEqual(toolNames.map((name) => service.getToolByFullReferenceName(name)), [githubMcpTool1]);
      assert.deepStrictEqual(deprecatesTo("github-mcp-server/create_branch"), ["github/create_branch"]);
    }
  });
  test("accessibility signal for tool confirmation", async () => {
    const testAccessibilityService = new class extends TestAccessibilityService {
      isScreenReaderOptimized() {
        return true;
      }
    }();
    const testAccessibilitySignalService = new TestAccessibilitySignalService();
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      accessibilityService: testAccessibilityService,
      accessibilitySignalService: testAccessibilitySignalService,
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", false);
        config.setUserConfiguration("accessibility.signals.chatUserActionRequired", { sound: "auto", announcement: "auto" });
      }
    });
    const toolData = {
      id: "testAccessibilityTool",
      modelDescription: "Test Accessibility Tool",
      displayName: "Test Accessibility Tool",
      source: ToolDataSource.Internal
    };
    const tool = registerToolForTest(testService, store, toolData.id, {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Accessibility Test", message: "Testing accessibility signal" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "executed" }] })
    }, toolData);
    const sessionId = "sessionId-accessibility";
    const capture = {};
    stubGetSession(testChatService, sessionId, { requestId: "requestId-accessibility", capture });
    const dto = tool.makeDto({ param: "value" }, { sessionId });
    const promise = testService.invokeTool(dto, async () => 0, CancellationToken.None);
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published, "expected ChatToolInvocation to be published");
    assert.ok(published.confirmationMessages, "should have confirmation messages");
    assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 1, "accessibility signal should have been played once");
    const signalCall = testAccessibilitySignalService.signalPlayedCalls[0];
    assert.strictEqual(signalCall.signal, AccessibilitySignal.chatUserActionRequired, "correct signal should be played");
    assert.ok(signalCall.options?.customAlertMessage.includes("Accessibility Test"), "alert message should include tool title");
    assert.ok(signalCall.options?.customAlertMessage.includes("Chat confirmation required"), "alert message should include confirmation text");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await promise;
    assert.strictEqual(result.content[0].value, "executed");
  });
  test("accessibility signal respects autoApprove configuration", async () => {
    const testAccessibilityService = new class extends TestAccessibilityService {
      isScreenReaderOptimized() {
        return true;
      }
    }();
    const testAccessibilitySignalService = new TestAccessibilitySignalService();
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      accessibilityService: testAccessibilityService,
      accessibilitySignalService: testAccessibilitySignalService,
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", true);
        config.setUserConfiguration("accessibility.signals.chatUserActionRequired", { sound: "auto", announcement: "auto" });
      }
    });
    const toolData = {
      id: "testAutoApproveTool",
      modelDescription: "Test Auto Approve Tool",
      displayName: "Test Auto Approve Tool",
      source: ToolDataSource.Internal
    };
    const tool = registerToolForTest(testService, store, toolData.id, {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Auto Approve Test", message: "Testing auto approve" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "auto approved" }] })
    }, toolData);
    const sessionId = "sessionId-auto-approve";
    const capture = {};
    stubGetSession(testChatService, sessionId, { requestId: "requestId-auto-approve", capture });
    const dto = tool.makeDto({ config: "test" }, { sessionId });
    const result = await testService.invokeTool(dto, async () => 0, CancellationToken.None);
    assert.strictEqual(result.content[0].value, "auto approved");
    assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 0, "accessibility signal should not be played when auto-approve is enabled");
  });
  test("autopilot permission level bypasses global auto-approve check", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", false);
      }
    });
    const tool = registerToolForTest(testService, store, "autopilotTool", {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Confirm?", message: "Should be auto-approved by autopilot" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "autopilot approved" }] })
    });
    const sessionId = "test-autopilot";
    stubGetSession(testChatService, sessionId, {
      requestId: "req1",
      modeInfo: { permissionLevel: ChatPermissionLevel.Autopilot }
    });
    const result = await testService.invokeTool(
      tool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].value, "autopilot approved");
  });
  test("autopilot finds correct request by chatRequestId", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", false);
      }
    });
    const tool = registerToolForTest(testService, store, "autopilotIdTool", {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Confirm?", message: "Test" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "found by id" }] })
    });
    const sessionId = "test-autopilot-id";
    const fakeModel = {
      sessionId,
      sessionResource: LocalChatSessionUri.forSession(sessionId),
      getRequests: () => [
        { id: "req-old", modelId: "test-model", modeInfo: void 0 },
        { id: "req-autopilot", modelId: "test-model", modeInfo: { permissionLevel: ChatPermissionLevel.Autopilot } }
      ]
    };
    testChatService.addSession(fakeModel);
    const dto = tool.makeDto({ test: 1 }, { sessionId });
    dto.chatRequestId = "req-autopilot";
    const result = await testService.invokeTool(dto, async () => 0, CancellationToken.None);
    assert.strictEqual(result.content[0].value, "found by id");
  });
  test("autopilot auto-approves terminal tool with confirmation messages", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", false);
      }
    });
    const tool = registerToolForTest(testService, store, "terminalTool", {
      prepareToolInvocation: async () => ({
        confirmationMessages: {
          title: "Run shell command?",
          message: "echo hello"
        },
        toolSpecificData: {
          kind: "terminal",
          terminalToolSessionId: "test",
          terminalCommandId: "cmd-1",
          commandLine: { original: "echo hello" },
          language: "sh"
        }
      }),
      invoke: async () => ({ content: [{ kind: "text", value: "terminal executed" }] })
    });
    const sessionId = "test-autopilot-terminal";
    stubGetSession(testChatService, sessionId, {
      requestId: "req1",
      modeInfo: { permissionLevel: ChatPermissionLevel.Autopilot }
    });
    const result = await testService.invokeTool(
      tool.makeDto({ command: "echo hello", explanation: "test", goal: "test", isBackground: false }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].value, "terminal executed");
  });
  test("autopilot risk gate skips a tool assessed as high-risk (red)", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "Deletes source files irreversibly." };
    const t = setupRiskGateTool(setup2, store);
    const result = await t.invoke();
    assert.deepStrictEqual(
      {
        invoked: t.wasInvoked(),
        assessCalls: setup2.riskAssessmentService.assessCalls.length,
        mentionsRisk: String(result.content[0].value).includes("Deletes source files irreversibly.")
      },
      { invoked: false, assessCalls: 1, mentionsRisk: true }
    );
  });
  test("autopilot risk gate allows a low-risk (green) tool call", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Green, explanation: "Reads a file." };
    const t = setupRiskGateTool(setup2, store);
    const result = await t.invoke();
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), assessCalls: setup2.riskAssessmentService.assessCalls.length, value: result.content[0].value },
      { invoked: true, assessCalls: 1, value: "ran" }
    );
  });
  test("autopilot risk gate allows a medium-risk (orange) tool call (red-only threshold)", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Orange, explanation: "Edits a file." };
    const t = setupRiskGateTool(setup2, store);
    const result = await t.invoke();
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), assessCalls: setup2.riskAssessmentService.assessCalls.length, value: result.content[0].value },
      { invoked: true, assessCalls: 1, value: "ran" }
    );
  });
  test("autopilot risk gate fails open when the classifier returns no assessment", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = void 0;
    const t = setupRiskGateTool(setup2, store);
    const result = await t.invoke();
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), assessCalls: setup2.riskAssessmentService.assessCalls.length, value: result.content[0].value },
      { invoked: true, assessCalls: 1, value: "ran" }
    );
  });
  test("autopilot risk gate fails open when the classifier throws", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessError = new Error("network down");
    const t = setupRiskGateTool(setup2, store);
    const result = await t.invoke();
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), value: result.content[0].value },
      { invoked: true, value: "ran" }
    );
  });
  test("autopilot risk gate does not assess tool calls that have no confirmation", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "should not matter" };
    const t = setupRiskGateTool(setup2, store, { withConfirmation: false });
    const result = await t.invoke();
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), assessCalls: setup2.riskAssessmentService.assessCalls.length, value: result.content[0].value },
      { invoked: true, assessCalls: 0, value: "ran" }
    );
  });
  test("autopilot risk gate classifies a terminal command even when it has no confirmation", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "Force-pushes main, overwriting history." };
    const t = setupRiskGateTool(setup2, store, { withConfirmation: false, toolId: "run_in_terminal" });
    const result = await t.invoke();
    assert.deepStrictEqual(
      {
        invoked: t.wasInvoked(),
        assessCalls: setup2.riskAssessmentService.assessCalls.length,
        isRiskMessage: String(result.content[0].value).startsWith("Autopilot skipped this tool call")
      },
      { invoked: false, assessCalls: 1, isRiskMessage: true }
    );
  });
  test("autopilot risk gate runs a non-red terminal command that has no confirmation", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Orange, explanation: "Installs a package." };
    const t = setupRiskGateTool(setup2, store, { withConfirmation: false, toolId: "run_in_terminal" });
    const result = await t.invoke();
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), assessCalls: setup2.riskAssessmentService.assessCalls.length, value: result.content[0].value },
      { invoked: true, assessCalls: 1, value: "ran" }
    );
  });
  test("autopilot risk gate classifies a fetch web page call even when it has no confirmation", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "Sends workspace secrets to an untrusted host." };
    const t = setupRiskGateTool(setup2, store, { withConfirmation: false, toolId: "vscode_fetchWebPage_internal" });
    const result = await t.invoke();
    assert.deepStrictEqual(
      {
        invoked: t.wasInvoked(),
        assessCalls: setup2.riskAssessmentService.assessCalls.length,
        isRiskMessage: String(result.content[0].value).startsWith("Autopilot skipped this tool call")
      },
      { invoked: false, assessCalls: 1, isRiskMessage: true }
    );
  });
  test("autopilot risk gate runs a non-red fetch web page call that has no confirmation", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Green, explanation: "Fetches public documentation." };
    const t = setupRiskGateTool(setup2, store, { withConfirmation: false, toolId: "copilot_fetchWebPage" });
    const result = await t.invoke();
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), assessCalls: setup2.riskAssessmentService.assessCalls.length, value: result.content[0].value },
      { invoked: true, assessCalls: 1, value: "ran" }
    );
  });
  test("autopilot risk gate is inert when Advanced Autopilot is disabled", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "should not matter" };
    const t = setupRiskGateTool(setup2, store, { advancedEnabled: false });
    const result = await t.invoke();
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), assessCalls: setup2.riskAssessmentService.assessCalls.length, value: result.content[0].value },
      { invoked: true, assessCalls: 0, value: "ran" }
    );
  });
  test("autopilot risk gate does not apply at the plain Auto-Approve level", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "should not matter" };
    const t = setupRiskGateTool(setup2, store, { permissionLevel: ChatPermissionLevel.AutoApprove });
    const result = await t.invoke();
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), assessCalls: setup2.riskAssessmentService.assessCalls.length, value: result.content[0].value },
      { invoked: true, assessCalls: 0, value: "ran" }
    );
  });
  test("autopilot risk gate runs even when the risk assessment badge setting is disabled", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = false;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "Deletes source files irreversibly." };
    const t = setupRiskGateTool(setup2, store);
    const result = await t.invoke();
    assert.deepStrictEqual(
      {
        invoked: t.wasInvoked(),
        assessCalls: setup2.riskAssessmentService.assessCalls.length,
        isRiskMessage: String(result.content[0].value).startsWith("Autopilot skipped this tool call")
      },
      { invoked: false, assessCalls: 1, isRiskMessage: true }
    );
  });
  test("autopilot risk gate skips on red even when the classifier explanation is empty", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "" };
    const t = setupRiskGateTool(setup2, store);
    const result = await t.invoke();
    assert.deepStrictEqual(
      {
        invoked: t.wasInvoked(),
        assessCalls: setup2.riskAssessmentService.assessCalls.length,
        isRiskMessage: String(result.content[0].value).startsWith("Autopilot skipped this tool call"),
        isUserSkipMessage: String(result.content[0].value).includes("The user chose to skip")
      },
      { invoked: false, assessCalls: 1, isRiskMessage: true, isUserSkipMessage: false }
    );
  });
  test("autopilot risk gate does not skip when cancelled during assessment", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "Deletes source files irreversibly." };
    const t = setupRiskGateTool(setup2, store);
    const cts = store.add(new CancellationTokenSource());
    setup2.riskAssessmentService.onAssess = () => cts.cancel();
    await assert.rejects(() => t.invoke(cts.token), (err) => isCancellationError(err));
    assert.deepStrictEqual(
      { invoked: t.wasInvoked(), assessCalls: setup2.riskAssessmentService.assessCalls.length },
      { invoked: false, assessCalls: 1 }
    );
  });
  test("autopilot risk gate surfaces an info note to the user when it skips a high-risk tool", async () => {
    const setup2 = createTestToolsService(store);
    setup2.riskAssessmentService.enabled = true;
    setup2.riskAssessmentService.assessment = { risk: ToolRiskLevel.Red, explanation: "Deletes source files irreversibly." };
    const t = setupRiskGateTool(setup2, store);
    const progresses = [];
    setup2.chatService.appendProgress = (_request, progress) => {
      progresses.push(progress);
    };
    await t.invoke();
    const info = progresses.find((p) => p.kind === "info");
    assert.deepStrictEqual(
      {
        hasInfo: !!info,
        mentionsRisk: !!info && info.content.value.includes("Deletes source files irreversibly.")
      },
      { hasInfo: true, mentionsRisk: true }
    );
  });
  test("bypass approvals auto-approves terminal tool with confirmation messages", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", false);
      }
    });
    const tool = registerToolForTest(testService, store, "terminalToolBypass", {
      prepareToolInvocation: async () => ({
        confirmationMessages: {
          title: "Run shell command?",
          message: "ls -la"
        },
        toolSpecificData: {
          kind: "terminal",
          terminalToolSessionId: "test",
          terminalCommandId: "cmd-2",
          commandLine: { original: "ls -la" },
          language: "sh"
        }
      }),
      invoke: async () => ({ content: [{ kind: "text", value: "bypass executed" }] })
    });
    const sessionId = "test-bypass-terminal";
    stubGetSession(testChatService, sessionId, {
      requestId: "req1",
      modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove }
    });
    const result = await testService.invokeTool(
      tool.makeDto({ command: "ls -la", explanation: "test", goal: "test", isBackground: false }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].value, "bypass executed");
  });
  test("bypass approvals does not auto-approve tools in toolIdsThatCannotBeAutoApproved for CLI sessions", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", false);
      }
    });
    registerToolForTest(testService, store, "vscode_get_modified_files_confirmation", {
      prepareToolInvocation: async () => ({
        confirmationMessages: {
          title: "Uncommitted Changes",
          message: "Should these changes be included?"
        }
      }),
      invoke: async () => ({ content: [{ kind: "text", value: "confirmed" }] })
    });
    const sessionId = "test-bypass-no-auto-confirm";
    const cliSessionResource = URI.from({
      scheme: LocalChatSessionUri.scheme,
      authority: "copilotcli",
      path: "/" + sessionId
    });
    const capture = {};
    const fakeModel = {
      sessionId,
      sessionResource: cliSessionResource,
      getRequests: () => [{ id: "req1", modelId: "test-model", modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } }]
    };
    testChatService.addSession(fakeModel);
    testChatService.appendProgress = (_request, progress) => {
      capture.invocation = progress;
    };
    const resultPromise = testService.invokeTool(
      {
        callId: "1",
        toolId: "vscode_get_modified_files_confirmation",
        tokenBudget: 100,
        parameters: { test: true },
        context: { sessionResource: cliSessionResource }
      },
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published?.confirmationMessages, "tool in toolIdsThatCannotBeAutoApproved should require confirmation for CLI sessions even with Bypass Approvals");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await resultPromise;
    assert.strictEqual(result.content[0].value, "confirmed");
  });
  test("bypass approvals auto-approves tools in toolIdsThatCannotBeAutoApproved for local sessions", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", false);
      }
    });
    const tool = registerToolForTest(testService, store, "vscode_get_modified_files_confirmation", {
      prepareToolInvocation: async () => ({
        confirmationMessages: {
          title: "Uncommitted Changes",
          message: "Should these changes be included?"
        }
      }),
      invoke: async () => ({ content: [{ kind: "text", value: "auto approved for local" }] })
    });
    const sessionId = "test-bypass-local-auto-confirm";
    stubGetSession(testChatService, sessionId, {
      requestId: "req1",
      modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove }
    });
    const result = await testService.invokeTool(
      tool.makeDto({ test: true }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].value, "auto approved for local");
  });
  test("shouldAutoConfirm with basic configuration", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", true);
      }
    });
    const autoTool = registerToolForTest(testService, store, "autoTool", {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Test", message: "Should auto-approve" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "auto approved" }] })
    });
    const sessionId = "test-basic-config";
    stubGetSession(testChatService, sessionId, { requestId: "req1" });
    const result = await testService.invokeTool(
      autoTool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].value, "auto approved");
  });
  test("shouldAutoConfirm with per-tool configuration object", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", {
          "approvedTool": true,
          "deniedTool": false
        });
      }
    });
    const approvedTool = registerToolForTest(testService, store, "approvedTool", {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Test", message: "Should auto-approve" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "approved" }] })
    });
    const sessionId = "test-per-tool";
    stubGetSession(testChatService, sessionId, { requestId: "req1" });
    const approvedResult = await testService.invokeTool(
      approvedTool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(approvedResult.content[0].value, "approved");
    const unspecifiedTool = registerToolForTest(testService, store, "unspecifiedTool", {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Test", message: "Should require confirmation" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "unspecified" }] })
    });
    const capture = {};
    stubGetSession(testChatService, sessionId + "2", { requestId: "req2", capture });
    const unspecifiedPromise = testService.invokeTool(
      unspecifiedTool.makeDto({ test: 2 }, { sessionId: sessionId + "2" }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published?.confirmationMessages, "unspecified tool should require confirmation");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const unspecifiedResult = await unspecifiedPromise;
    assert.strictEqual(unspecifiedResult.content[0].value, "unspecified");
  });
  test("eligibleForAutoApproval setting controls tool eligibility", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
          "eligibleToolRef": true,
          "ineligibleToolRef": false
        });
      }
    });
    const eligibleTool = registerToolForTest(testService, store, "eligibleTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "eligible tool ran" }] })
    }, {
      toolReferenceName: "eligibleToolRef"
    });
    const sessionId = "test-eligible";
    stubGetSession(testChatService, sessionId, { requestId: "req1" });
    const eligibleResult = await testService.invokeTool(
      eligibleTool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(eligibleResult.content[0].value, "eligible tool ran");
    const ineligibleTool = registerToolForTest(testService, store, "ineligibleTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "ineligible requires confirmation" }] })
    }, {
      toolReferenceName: "ineligibleToolRef"
    });
    const capture = {};
    stubGetSession(testChatService, sessionId + "2", { requestId: "req2", capture });
    const ineligiblePromise = testService.invokeTool(
      ineligibleTool.makeDto({ test: 2 }, { sessionId: sessionId + "2" }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published?.confirmationMessages, "ineligible tool should require confirmation");
    assert.ok(published?.confirmationMessages?.title, "should have default confirmation title");
    assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, "should not allow auto confirm");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const ineligibleResult = await ineligiblePromise;
    assert.strictEqual(ineligibleResult.content[0].value, "ineligible requires confirmation");
    const unspecifiedTool = registerToolForTest(testService, store, "unspecifiedTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "unspecified defaults to eligible" }] })
    }, {
      toolReferenceName: "unspecifiedToolRef"
    });
    const unspecifiedResult = await testService.invokeTool(
      unspecifiedTool.makeDto({ test: 3 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(unspecifiedResult.content[0].value, "unspecified defaults to eligible");
  });
  test("tool content formatting with alwaysDisplayInputOutput", async () => {
    const toolData = {
      id: "formatTool",
      modelDescription: "Format Test Tool",
      displayName: "Format Test Tool",
      source: ToolDataSource.Internal,
      alwaysDisplayInputOutput: true
    };
    const tool = registerToolForTest(service, store, toolData.id, {
      prepareToolInvocation: async () => ({}),
      invoke: async (invocation) => ({
        content: [
          { kind: "text", value: "Text result" },
          { kind: "data", value: { data: VSBuffer.fromByteArray([1, 2, 3]), mimeType: "application/octet-stream" } }
        ]
      })
    }, toolData);
    const input = { a: 1, b: "test", c: [1, 2, 3] };
    const result = await service.invokeTool(
      tool.makeDto(input),
      async () => 0,
      CancellationToken.None
    );
    assert.ok(result.toolResultDetails, "should have toolResultDetails");
    const details = result.toolResultDetails;
    assert.ok(isToolResultInputOutputDetails(details));
    const expectedInputJson = JSON.stringify(input, void 0, 2);
    assert.strictEqual(details.input, expectedInputJson, "input should be formatted JSON");
    assert.strictEqual(details.output.length, 2, "should have 2 output items");
    const textOutput = details.output[0];
    assert.strictEqual(textOutput.type, "embed");
    assert.strictEqual(textOutput.isText, true);
    assert.strictEqual(textOutput.value, "Text result");
    const dataOutput = details.output[1];
    assert.strictEqual(dataOutput.type, "embed");
    assert.strictEqual(dataOutput.mimeType, "application/octet-stream");
    assert.strictEqual(dataOutput.value, "AQID");
  });
  test("tool error handling and telemetry", async () => {
    const testTelemetryService = new TestTelemetryService();
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      telemetryService: testTelemetryService
    });
    const successTool = registerToolForTest(testService, store, "successTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "success" }] })
    });
    const sessionId = "telemetry-test";
    stubGetSession(testChatService, sessionId, { requestId: "req1" });
    await testService.invokeTool(
      successTool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    const successEvents = testTelemetryService.events.filter((e) => e.eventName === "languageModelToolInvoked");
    assert.strictEqual(successEvents.length, 1, "should have success telemetry event");
    assert.strictEqual(successEvents[0].data.result, "success");
    assert.strictEqual(successEvents[0].data.toolId, "successTool");
    assert.strictEqual(successEvents[0].data.chatSessionId, sessionId);
    testTelemetryService.reset();
    const errorTool = registerToolForTest(testService, store, "errorTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => {
        throw new Error("Tool error");
      }
    });
    stubGetSession(testChatService, sessionId + "2", { requestId: "req2" });
    try {
      await testService.invokeTool(
        errorTool.makeDto({ test: 2 }, { sessionId: sessionId + "2" }),
        async () => 0,
        CancellationToken.None
      );
      assert.fail("Should have thrown");
    } catch (err) {
    }
    const errorEvents = testTelemetryService.events.filter((e) => e.eventName === "languageModelToolInvoked");
    assert.strictEqual(errorEvents.length, 1, "should have error telemetry event");
    assert.strictEqual(errorEvents[0].data.result, "error");
    assert.strictEqual(errorEvents[0].data.toolId, "errorTool");
  });
  test("call tracking and cleanup", async () => {
    const sessionId = "tracking-session";
    const requestId = "tracking-request";
    stubGetSession(chatService, sessionId, { requestId });
    assert.doesNotThrow(() => {
      service.cancelToolCallsForRequest(requestId);
    }, "cancelToolCallsForRequest should not throw");
    assert.doesNotThrow(() => {
      service.cancelToolCallsForRequest("non-existent-request");
    }, "cancelToolCallsForRequest with non-existent ID should not throw");
  });
  test("accessibility signal with different settings combinations", async () => {
    const testAccessibilitySignalService = new TestAccessibilitySignalService();
    const testConfigService1 = new TestConfigurationService();
    testConfigService1.setUserConfiguration("chat.tools.global.autoApprove", false);
    testConfigService1.setUserConfiguration("accessibility.signals.chatUserActionRequired", { sound: "on", announcement: "off" });
    const testAccessibilityService1 = new class extends TestAccessibilityService {
      isScreenReaderOptimized() {
        return false;
      }
    }();
    const instaService1 = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(testConfigService1)),
      configurationService: () => testConfigService1
    }, store);
    instaService1.stub(IChatService, chatService);
    instaService1.stub(IAccessibilityService, testAccessibilityService1);
    instaService1.stub(IAccessibilitySignalService, testAccessibilitySignalService);
    instaService1.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
    instaService1.stub(IToolResultCompressor, noopToolResultCompressor);
    const testService1 = store.add(instaService1.createInstance(LanguageModelToolsService));
    const tool1 = registerToolForTest(testService1, store, "soundOnlyTool", {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Sound Test", message: "Testing sound only" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "executed" }] })
    });
    const sessionId1 = "sound-test";
    const capture1 = {};
    stubGetSession(chatService, sessionId1, { requestId: "req1", capture: capture1 });
    const promise1 = testService1.invokeTool(tool1.makeDto({ test: 1 }, { sessionId: sessionId1 }), async () => 0, CancellationToken.None);
    const published1 = await waitForPublishedInvocation(capture1);
    assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 1, "sound should be played when sound=on");
    const call1 = testAccessibilitySignalService.signalPlayedCalls[0];
    assert.strictEqual(call1.options?.modality, void 0, "should use default modality for sound");
    IChatToolInvocation.confirmWith(published1, { type: ToolConfirmKind.UserAction });
    await promise1;
    testAccessibilitySignalService.reset();
    const testConfigService2 = new TestConfigurationService();
    testConfigService2.setUserConfiguration("chat.tools.global.autoApprove", false);
    testConfigService2.setUserConfiguration("accessibility.signals.chatUserActionRequired", { sound: "auto", announcement: "auto" });
    const testAccessibilityService2 = new class extends TestAccessibilityService {
      isScreenReaderOptimized() {
        return true;
      }
    }();
    const instaService2 = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(testConfigService2)),
      configurationService: () => testConfigService2
    }, store);
    instaService2.stub(IChatService, chatService);
    instaService2.stub(IAccessibilityService, testAccessibilityService2);
    instaService2.stub(IAccessibilitySignalService, testAccessibilitySignalService);
    instaService2.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
    instaService2.stub(IToolResultCompressor, noopToolResultCompressor);
    const testService2 = store.add(instaService2.createInstance(LanguageModelToolsService));
    const tool2 = registerToolForTest(testService2, store, "autoScreenReaderTool", {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Auto Test", message: "Testing auto with screen reader" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "executed" }] })
    });
    const sessionId2 = "auto-sr-test";
    const capture2 = {};
    stubGetSession(chatService, sessionId2, { requestId: "req2", capture: capture2 });
    const promise2 = testService2.invokeTool(tool2.makeDto({ test: 2 }, { sessionId: sessionId2 }), async () => 0, CancellationToken.None);
    const published2 = await waitForPublishedInvocation(capture2);
    assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 1, "signal should be played with screen reader optimization");
    const call2 = testAccessibilitySignalService.signalPlayedCalls[0];
    assert.ok(call2.options?.customAlertMessage, "should have custom alert message");
    assert.strictEqual(call2.options?.userGesture, true, "should mark as user gesture");
    IChatToolInvocation.confirmWith(published2, { type: ToolConfirmKind.UserAction });
    await promise2;
    testAccessibilitySignalService.reset();
    const testConfigService3 = new TestConfigurationService();
    testConfigService3.setUserConfiguration("chat.tools.global.autoApprove", false);
    testConfigService3.setUserConfiguration("accessibility.signals.chatUserActionRequired", { sound: "off", announcement: "off" });
    const testAccessibilityService3 = new class extends TestAccessibilityService {
      isScreenReaderOptimized() {
        return true;
      }
    }();
    const instaService3 = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(testConfigService3)),
      configurationService: () => testConfigService3
    }, store);
    instaService3.stub(IChatService, chatService);
    instaService3.stub(IAccessibilityService, testAccessibilityService3);
    instaService3.stub(IAccessibilitySignalService, testAccessibilitySignalService);
    instaService3.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
    instaService3.stub(IToolResultCompressor, noopToolResultCompressor);
    const testService3 = store.add(instaService3.createInstance(LanguageModelToolsService));
    const tool3 = registerToolForTest(testService3, store, "offTool", {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Off Test", message: "Testing off settings" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "executed" }] })
    });
    const sessionId3 = "off-test";
    const capture3 = {};
    stubGetSession(chatService, sessionId3, { requestId: "req3", capture: capture3 });
    const promise3 = testService3.invokeTool(tool3.makeDto({ test: 3 }, { sessionId: sessionId3 }), async () => 0, CancellationToken.None);
    const published3 = await waitForPublishedInvocation(capture3);
    assert.strictEqual(testAccessibilitySignalService.signalPlayedCalls.length, 0, "no signal should be played when both sound and announcement are off");
    IChatToolInvocation.confirmWith(published3, { type: ToolConfirmKind.UserAction });
    await promise3;
  });
  test("createToolSet and getToolSet", () => {
    const toolSet = store.add(service.createToolSet(
      ToolDataSource.Internal,
      "testToolSetId",
      "testToolSetName",
      { icon: void 0, description: "Test tool set" }
    ));
    const retrieved = service.getToolSet("testToolSetId");
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, "testToolSetId");
    assert.strictEqual(retrieved.referenceName, "testToolSetName");
    assert.strictEqual(service.getToolSet("nonExistentId"), void 0);
    toolSet.dispose();
    assert.strictEqual(service.getToolSet("testToolSetId"), void 0);
  });
  test("getToolSetByName", () => {
    store.add(service.createToolSet(
      ToolDataSource.Internal,
      "toolSet1",
      "refName1"
    ));
    store.add(service.createToolSet(
      ToolDataSource.Internal,
      "toolSet2",
      "refName2"
    ));
    assert.strictEqual(service.getToolSetByName("refName1")?.id, "toolSet1");
    assert.strictEqual(service.getToolSetByName("refName2")?.id, "toolSet2");
    assert.strictEqual(service.getToolSetByName("nonExistentName"), void 0);
  });
  test("getTools with includeDisabled parameter", () => {
    contextKeyService.createKey("testKey", false);
    const disabledTool = {
      id: "disabledTool",
      modelDescription: "Disabled Tool",
      displayName: "Disabled Tool",
      source: ToolDataSource.Internal,
      when: ContextKeyEqualsExpr.create("testKey", true)
      // Will be disabled since testKey is false
    };
    const enabledTool = {
      id: "enabledTool",
      modelDescription: "Enabled Tool",
      displayName: "Enabled Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(disabledTool));
    store.add(service.registerToolData(enabledTool));
    const enabledTools = Array.from(service.getTools(void 0));
    assert.strictEqual(enabledTools.length, 1, "Should only return enabled tools");
    assert.strictEqual(enabledTools[0].id, "enabledTool");
    const allTools = Array.from(service.getAllToolsIncludingDisabled());
    assert.strictEqual(allTools.length, 2, "getAllToolsIncludingDisabled should return all tools");
  });
  test("tool registration duplicate error", () => {
    const toolData = {
      id: "duplicateTool",
      modelDescription: "Duplicate Tool",
      displayName: "Duplicate Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolData));
    assert.throws(() => {
      service.registerToolData(toolData);
    }, /Tool "duplicateTool" is already registered/);
  });
  test("tool implementation registration without data throws", () => {
    const toolImpl = {
      invoke: async () => ({ content: [] })
    };
    assert.throws(() => {
      service.registerToolImplementation("nonExistentTool", toolImpl);
    }, /Tool "nonExistentTool" was not contributed/);
  });
  test("tool implementation duplicate registration throws", () => {
    const toolData = {
      id: "testTool",
      modelDescription: "Test Tool",
      displayName: "Test Tool",
      source: ToolDataSource.Internal
    };
    const toolImpl1 = {
      invoke: async () => ({ content: [] })
    };
    const toolImpl2 = {
      invoke: async () => ({ content: [] })
    };
    store.add(service.registerToolData(toolData));
    store.add(service.registerToolImplementation("testTool", toolImpl1));
    assert.throws(() => {
      service.registerToolImplementation("testTool", toolImpl2);
    }, /Tool "testTool" already has an implementation/);
  });
  test("invokeTool with unknown tool throws", async () => {
    const dto = {
      callId: "1",
      toolId: "unknownTool",
      tokenBudget: 100,
      parameters: {},
      context: void 0
    };
    await assert.rejects(
      service.invokeTool(dto, async () => 0, CancellationToken.None),
      /Tool unknownTool was not contributed/
    );
  });
  test("invokeTool without implementation activates extension and throws if still not found", async () => {
    const toolData = {
      id: "extensionActivationTool",
      modelDescription: "Extension Tool",
      displayName: "Extension Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(toolData));
    const dto = {
      callId: "1",
      toolId: "extensionActivationTool",
      tokenBudget: 100,
      parameters: {},
      context: void 0
    };
    await assert.rejects(
      service.invokeTool(dto, async () => 0, CancellationToken.None),
      /Tool extensionActivationTool does not have an implementation registered/
    );
  });
  test("invokeTool without context (non-chat scenario)", async () => {
    const tool = registerToolForTest(service, store, "nonChatTool", {
      invoke: async (invocation) => {
        assert.strictEqual(invocation.context, void 0);
        return { content: [{ kind: "text", value: "non-chat result" }] };
      }
    });
    const dto = tool.makeDto({ test: 1 });
    const result = await service.invokeTool(dto, async () => 0, CancellationToken.None);
    assert.strictEqual(result.content[0].value, "non-chat result");
  });
  test("invokeTool with unknown chat session throws", async () => {
    const tool = registerToolForTest(service, store, "unknownSessionTool", {
      invoke: async () => ({ content: [{ kind: "text", value: "should not reach" }] })
    });
    const dto = tool.makeDto({ test: 1 }, { sessionId: "unknownSession" });
    let threwError = false;
    try {
      await service.invokeTool(dto, async () => 0, CancellationToken.None);
    } catch (err) {
      threwError = true;
      assert.ok(
        err instanceof Error && (err.message.includes("Tool called for unknown chat session") || err.message.includes("getRequests is not a function")),
        `Unexpected error: ${err.message}`
      );
    }
    assert.strictEqual(threwError, true, "Should have thrown an error");
  });
  test("tool error with alwaysDisplayInputOutput includes details", async () => {
    const toolData = {
      id: "errorToolWithIO",
      modelDescription: "Error Tool With IO",
      displayName: "Error Tool With IO",
      source: ToolDataSource.Internal,
      alwaysDisplayInputOutput: true
    };
    const tool = registerToolForTest(service, store, toolData.id, {
      invoke: async () => {
        throw new Error("Tool execution failed");
      }
    }, toolData);
    const input = { param: "testValue" };
    try {
      await service.invokeTool(
        tool.makeDto(input),
        async () => 0,
        CancellationToken.None
      );
      assert.fail("Should have thrown");
    } catch (err) {
      assert.strictEqual(err.message, "Tool execution failed");
    }
  });
  test("context key changes trigger tool updates", async () => {
    let changeEventFired = false;
    const disposable = service.onDidChangeTools(() => {
      changeEventFired = true;
    });
    store.add(disposable);
    contextKeyService.createKey("dynamicKey", false);
    const toolData = {
      id: "contextTool",
      modelDescription: "Context Tool",
      displayName: "Context Tool",
      source: ToolDataSource.Internal,
      when: ContextKeyEqualsExpr.create("dynamicKey", true)
    };
    store.add(service.registerToolData(toolData));
    contextKeyService.createKey("dynamicKey", true);
    service.flushToolUpdates();
    assert.strictEqual(changeEventFired, true, "onDidChangeTools should fire when context keys change");
  });
  test("configuration changes trigger tool updates", async () => {
    let changeEventFired = false;
    const disposable = service.onDidChangeTools(() => {
      changeEventFired = true;
    });
    store.add(disposable);
    configurationService.setUserConfiguration("chat.extensionTools.enabled", false);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: () => true,
      affectedKeys: /* @__PURE__ */ new Set(["chat.extensionTools.enabled"]),
      change: null,
      source: ConfigurationTarget.USER
    });
    service.flushToolUpdates();
    assert.strictEqual(changeEventFired, true, "onDidChangeTools should fire when configuration changes");
  });
  test("toToolAndToolSetEnablementMap with MCP toolset enables contained tools", () => {
    const mcpToolSet = store.add(service.createToolSet(
      { type: "mcp", label: "testServer", serverLabel: "testServer", instructions: void 0, collectionId: "testCollection", definitionId: "testDef" },
      "mcpSet",
      "mcpSetRef"
    ));
    const mcpTool = {
      id: "mcpTool",
      modelDescription: "MCP Tool",
      displayName: "MCP Tool",
      source: { type: "mcp", label: "testServer", serverLabel: "testServer", instructions: void 0, collectionId: "testCollection", definitionId: "testDef" },
      canBeReferencedInPrompt: true,
      toolReferenceName: "mcpToolRef"
    };
    store.add(service.registerToolData(mcpTool));
    store.add(mcpToolSet.addTool(mcpTool));
    {
      const enabledNames = [mcpToolSet].map((t) => service.getFullReferenceName(t));
      const result = service.toToolAndToolSetEnablementMap(enabledNames, void 0);
      assert.strictEqual(result.get(mcpToolSet), true, "MCP toolset should be enabled");
      assert.strictEqual(result.get(mcpTool), true, "MCP tool should be enabled when its toolset is enabled");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
    {
      const enabledNames = [mcpTool].map((t) => service.getFullReferenceName(t, mcpToolSet));
      const result = service.toToolAndToolSetEnablementMap(enabledNames, void 0);
      assert.strictEqual(result.get(mcpToolSet), false, "MCP toolset should be disabled");
      assert.strictEqual(result.get(mcpTool), true, "MCP tool should be enabled");
      const fullReferenceNames = service.toFullReferenceNames(result);
      assert.deepStrictEqual(fullReferenceNames.sort(), enabledNames.sort(), "toFullReferenceNames should return the original enabled names");
    }
  });
  test("shouldAutoConfirm with workspace-specific tool configuration", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration("chat.tools.global.autoApprove", { "workspaceTool": true });
      }
    });
    const workspaceTool = registerToolForTest(testService, store, "workspaceTool", {
      prepareToolInvocation: async () => ({ confirmationMessages: { title: "Test", message: "Workspace tool" } }),
      invoke: async () => ({ content: [{ kind: "text", value: "workspace result" }] })
    }, { runsInWorkspace: true });
    const sessionId = "workspace-test";
    stubGetSession(testChatService, sessionId, { requestId: "req1" });
    const result = await testService.invokeTool(
      workspaceTool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].value, "workspace result");
  });
  test("getFullReferenceNames", () => {
    setupToolsForTest(service, store);
    const fullReferenceNames = Array.from(service.getFullReferenceNames()).sort();
    const expectedNames = [
      "tool1RefName",
      "Tool2 Display Name",
      "my.extension/extTool1RefName",
      "mcpToolSetRefName/*",
      "mcpToolSetRefName/mcpTool1RefName",
      "internalToolSetRefName",
      "internalToolSetRefName/internalToolSetTool1RefName",
      "vscode",
      "execute",
      "read",
      "agent"
    ].sort();
    assert.deepStrictEqual(fullReferenceNames, expectedNames, "getFullReferenceNames should return correct full reference names");
  });
  test("getDeprecatedFullReferenceNames", () => {
    setupToolsForTest(service, store);
    const deprecatedNames = service.getDeprecatedFullReferenceNames();
    assert.deepStrictEqual(deprecatedNames.get("internalToolSetTool1RefName"), /* @__PURE__ */ new Set(["internalToolSetRefName/internalToolSetTool1RefName"]));
    assert.strictEqual(deprecatedNames.get("internalToolSetRefName"), void 0);
    assert.deepStrictEqual(deprecatedNames.get("extTool1RefName"), /* @__PURE__ */ new Set(["my.extension/extTool1RefName"]));
    assert.deepStrictEqual(deprecatedNames.get("mcpToolSetRefName"), /* @__PURE__ */ new Set(["mcpToolSetRefName/*"]));
    assert.deepStrictEqual(deprecatedNames.get("mcpTool1RefName"), /* @__PURE__ */ new Set(["mcpToolSetRefName/mcpTool1RefName"]));
    assert.strictEqual(deprecatedNames.get("Tool2 Display Name"), void 0);
    assert.strictEqual(deprecatedNames.get("tool1RefName"), void 0);
    assert.strictEqual(deprecatedNames.get("userToolSetRefName"), void 0);
  });
  test("getDeprecatedFullReferenceNames includes namespaced legacy names for tools in toolsets", () => {
    const toolWithLegacy = {
      id: "myNewBrowser",
      toolReferenceName: "openIntegratedBrowser",
      legacyToolReferenceFullNames: ["openSimpleBrowser"],
      modelDescription: "Open browser",
      displayName: "Open Integrated Browser",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(toolWithLegacy));
    store.add(service.vscodeToolSet.addTool(toolWithLegacy));
    const deprecated = service.getDeprecatedFullReferenceNames();
    assert.deepStrictEqual(deprecated.get("openSimpleBrowser"), /* @__PURE__ */ new Set(["vscode/openIntegratedBrowser"]));
    assert.deepStrictEqual(deprecated.get("vscode/openSimpleBrowser"), /* @__PURE__ */ new Set(["vscode/openIntegratedBrowser"]));
  });
  test("getToolByFullReferenceName", () => {
    setupToolsForTest(service, store);
    const tool1 = service.getToolByFullReferenceName("tool1RefName");
    assert.ok(tool1);
    assert.strictEqual(tool1.id, "tool1");
    const tool2 = service.getToolByFullReferenceName("Tool2 Display Name");
    assert.ok(tool2);
    assert.strictEqual(tool2.id, "tool2");
    const extTool = service.getToolByFullReferenceName("my.extension/extTool1RefName");
    assert.ok(extTool);
    assert.strictEqual(extTool.id, "extTool1");
    const mcpTool = service.getToolByFullReferenceName("mcpToolSetRefName/mcpTool1RefName");
    assert.ok(mcpTool);
    assert.strictEqual(mcpTool.id, "mcpTool1");
    const mcpToolSet = service.getToolByFullReferenceName("mcpToolSetRefName/*");
    assert.ok(mcpToolSet);
    assert.strictEqual(mcpToolSet.id, "mcpToolSet");
    const internalToolSet = service.getToolByFullReferenceName("internalToolSetRefName/internalToolSetTool1RefName");
    assert.ok(internalToolSet);
    assert.strictEqual(internalToolSet.id, "internalToolSetTool1");
    const toolInSet = service.getToolByFullReferenceName("internalToolSetRefName");
    assert.ok(toolInSet);
    assert.strictEqual(toolInSet.id, "internalToolSet");
  });
  test("eligibleForAutoApproval setting can be configured via policy", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
          "toolA": true,
          "toolB": false
        });
      }
    });
    const toolA = registerToolForTest(testService, store, "toolA", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "toolA executed" }] })
    }, {
      toolReferenceName: "toolA"
    });
    const toolB = registerToolForTest(testService, store, "toolB", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "toolB executed" }] })
    }, {
      toolReferenceName: "toolB"
    });
    const sessionId = "test-policy";
    stubGetSession(testChatService, sessionId, { requestId: "req1" });
    const resultA = await testService.invokeTool(
      toolA.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(resultA.content[0].value, "toolA executed");
    const capture = {};
    stubGetSession(testChatService, sessionId + "2", { requestId: "req2", capture });
    const promiseB = testService.invokeTool(
      toolB.makeDto({ test: 2 }, { sessionId: sessionId + "2" }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published?.confirmationMessages, "toolB should require confirmation due to policy");
    assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, "should not allow auto confirm");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const resultB = await promiseB;
    assert.strictEqual(resultB.content[0].value, "toolB executed");
  });
  test("eligibleForAutoApproval with legacy tool reference names - eligible", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
          "oldToolName": true
          // Using legacy name
        });
      }
    });
    const renamedTool = registerToolForTest(testService, store, "renamedTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "tool executed via legacy name" }] })
    }, {
      toolReferenceName: "newToolName",
      legacyToolReferenceFullNames: ["oldToolName"]
    });
    const sessionId = "test-legacy-eligible";
    stubGetSession(testChatService, sessionId, { requestId: "req1" });
    const result = await testService.invokeTool(
      renamedTool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].value, "tool executed via legacy name");
  });
  test("eligibleForAutoApproval with legacy tool reference names - ineligible", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
          "deprecatedToolName": false
          // Using legacy name
        });
      }
    });
    const renamedTool = registerToolForTest(testService, store, "renamedTool2", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "tool requires confirmation" }] })
    }, {
      toolReferenceName: "modernToolName",
      legacyToolReferenceFullNames: ["deprecatedToolName"]
    });
    const sessionId = "test-legacy-ineligible";
    const capture = {};
    stubGetSession(testChatService, sessionId, { requestId: "req1", capture });
    const promise = testService.invokeTool(
      renamedTool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published?.confirmationMessages, "tool should require confirmation when legacy name is ineligible");
    assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, "should not allow auto confirm");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await promise;
    assert.strictEqual(result.content[0].value, "tool requires confirmation");
  });
  test("eligibleForAutoApproval with multiple legacy names", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
          "secondLegacyName": true
          // Using the second legacy name
        });
      }
    });
    const multiLegacyTool = registerToolForTest(testService, store, "multiLegacyTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "multi legacy executed" }] })
    }, {
      toolReferenceName: "currentToolName",
      legacyToolReferenceFullNames: ["firstLegacyName", "secondLegacyName", "thirdLegacyName"]
    });
    const sessionId = "test-multi-legacy";
    stubGetSession(testChatService, sessionId, { requestId: "req1" });
    const result = await testService.invokeTool(
      multiLegacyTool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].value, "multi legacy executed");
  });
  test("eligibleForAutoApproval current name takes precedence over legacy names", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
          "currentName": false,
          // Current name says ineligible
          "oldName": true
          // Legacy name says eligible
        });
      }
    });
    const tool = registerToolForTest(testService, store, "precedenceTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "precedence test" }] })
    }, {
      toolReferenceName: "currentName",
      legacyToolReferenceFullNames: ["oldName"]
    });
    const sessionId = "test-precedence";
    const capture = {};
    stubGetSession(testChatService, sessionId, { requestId: "req1", capture });
    const promise = testService.invokeTool(
      tool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published?.confirmationMessages, "current name should take precedence over legacy name");
    assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, "should not allow auto confirm");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await promise;
    assert.strictEqual(result.content[0].value, "precedence test");
  });
  test("eligibleForAutoApproval with legacy full reference names from toolsets", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
          "oldToolSet/oldToolName": false
          // Legacy full reference name from old toolset
        });
      }
    });
    const migratedTool = registerToolForTest(testService, store, "migratedTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "migrated tool" }] })
    }, {
      toolReferenceName: "standaloneToolName",
      legacyToolReferenceFullNames: ["oldToolSet/oldToolName"]
    });
    const sessionId = "test-fullReferenceName-legacy";
    const capture = {};
    stubGetSession(testChatService, sessionId, { requestId: "req1", capture });
    const promise = testService.invokeTool(
      migratedTool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published?.confirmationMessages, "tool should be ineligible via legacy full reference name");
    assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, "should not allow auto confirm");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await promise;
    assert.strictEqual(result.content[0].value, "migrated tool");
  });
  test("eligibleForAutoApproval mixed current and legacy names", async () => {
    const { service: testService, chatService: testChatService } = createTestToolsService(store, {
      configureServices: (config) => {
        config.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
          "modernTool": true,
          // Current name
          "legacyToolOld": false,
          // Legacy name
          "unchangedTool": true
          // Tool that never changed
        });
      }
    });
    const tool1 = registerToolForTest(testService, store, "tool1", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "modern executed" }] })
    }, {
      toolReferenceName: "modernTool"
    });
    const tool2 = registerToolForTest(testService, store, "tool2", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "legacy needs confirmation" }] })
    }, {
      toolReferenceName: "legacyToolNew",
      legacyToolReferenceFullNames: ["legacyToolOld"]
    });
    const tool3 = registerToolForTest(testService, store, "tool3", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "unchanged executed" }] })
    }, {
      toolReferenceName: "unchangedTool"
    });
    const sessionId = "test-mixed";
    stubGetSession(testChatService, sessionId, { requestId: "req1" });
    const result1 = await testService.invokeTool(
      tool1.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result1.content[0].value, "modern executed");
    const capture2 = {};
    stubGetSession(testChatService, sessionId + "2", { requestId: "req2", capture: capture2 });
    const promise2 = testService.invokeTool(
      tool2.makeDto({ test: 2 }, { sessionId: sessionId + "2" }),
      async () => 0,
      CancellationToken.None
    );
    const published2 = await waitForPublishedInvocation(capture2);
    assert.ok(published2?.confirmationMessages, "tool2 should require confirmation via legacy name");
    IChatToolInvocation.confirmWith(published2, { type: ToolConfirmKind.UserAction });
    const result2 = await promise2;
    assert.strictEqual(result2.content[0].value, "legacy needs confirmation");
    const result3 = await testService.invokeTool(
      tool3.makeDto({ test: 3 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    assert.strictEqual(result3.content[0].value, "unchanged executed");
  });
  test("eligibleForAutoApproval with namespaced legacy names - full tool name eligible", async () => {
    const testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
      "gitTools/gitCommit": true
    });
    const instaService = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
      configurationService: () => testConfigService
    }, store);
    instaService.stub(IChatService, chatService);
    instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
    instaService.stub(IToolResultCompressor, noopToolResultCompressor);
    const testService = store.add(instaService.createInstance(LanguageModelToolsService));
    const tool = registerToolForTest(testService, store, "gitCommitTool", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "commit executed" }] })
    }, {
      toolReferenceName: "commit",
      legacyToolReferenceFullNames: ["gitTools/gitCommit"]
    });
    const sessionId = "test-extension-prefix";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "req1" });
    const result = await testService.invokeTool(
      tool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.strictEqual(published, void 0, "tool should not require confirmation when legacy trimmed name is eligible");
    assert.strictEqual(result.content[0].value, "commit executed");
  });
  test("eligibleForAutoApproval with namespaced and renamed toolname - just last segment eligible", async () => {
    const testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
      "gitCommit": true
    });
    const instaService = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
      configurationService: () => testConfigService
    }, store);
    instaService.stub(IChatService, chatService);
    instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
    instaService.stub(IToolResultCompressor, noopToolResultCompressor);
    const testService = store.add(instaService.createInstance(LanguageModelToolsService));
    const tool = registerToolForTest(testService, store, "gitCommitTool2", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "commit executed" }] })
    }, {
      toolReferenceName: "commit",
      legacyToolReferenceFullNames: ["gitTools/gitCommit"]
    });
    const sessionId = "test-renamed-prefix";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "req1" });
    const result = await testService.invokeTool(
      tool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.strictEqual(published, void 0, "tool should not require confirmation when legacy trimmed name is eligible");
    assert.strictEqual(result.content[0].value, "commit executed");
  });
  test("eligibleForAutoApproval with namespaced legacy names - full tool name ineligible", async () => {
    const testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
      "gitTools/gitCommit": false
    });
    const instaService = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
      configurationService: () => testConfigService
    }, store);
    instaService.stub(IChatService, chatService);
    instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
    instaService.stub(IToolResultCompressor, noopToolResultCompressor);
    const testService = store.add(instaService.createInstance(LanguageModelToolsService));
    const tool = registerToolForTest(testService, store, "gitCommitTool3", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "commit blocked" }] })
    }, {
      toolReferenceName: "commit",
      legacyToolReferenceFullNames: ["something/random", "gitTools/bar", "gitTools/gitCommit"]
    });
    const sessionId = "test-extension-prefix-blocked";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "req1", capture });
    const promise = testService.invokeTool(
      tool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published?.confirmationMessages, "tool should require confirmation when legacy full name is ineligible");
    assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, "should not allow auto confirm");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await promise;
    assert.strictEqual(result.content[0].value, "commit blocked");
  });
  test("eligibleForAutoApproval with namespaced and renamed toolname - just last segment ineligible", async () => {
    const testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(ChatConfiguration.EligibleForAutoApproval, {
      "gitCommit": false
    });
    const instaService = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(testConfigService)),
      configurationService: () => testConfigService
    }, store);
    instaService.stub(IChatService, chatService);
    instaService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
    instaService.stub(IToolResultCompressor, noopToolResultCompressor);
    const testService = store.add(instaService.createInstance(LanguageModelToolsService));
    const tool = registerToolForTest(testService, store, "gitCommitTool4", {
      prepareToolInvocation: async () => ({}),
      invoke: async () => ({ content: [{ kind: "text", value: "commit blocked" }] })
    }, {
      toolReferenceName: "commit",
      legacyToolReferenceFullNames: ["something/random", "gitTools/bar", "gitTools/gitCommit"]
    });
    const sessionId = "test-renamed-prefix-blocked";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId: "req1", capture });
    const promise = testService.invokeTool(
      tool.makeDto({ test: 1 }, { sessionId }),
      async () => 0,
      CancellationToken.None
    );
    const published = await waitForPublishedInvocation(capture);
    assert.ok(published?.confirmationMessages, "tool should require confirmation when legacy trimmed name is ineligible");
    assert.strictEqual(published?.confirmationMessages?.allowAutoConfirm, false, "should not allow auto confirm");
    IChatToolInvocation.confirmWith(published, { type: ToolConfirmKind.UserAction });
    const result = await promise;
    assert.strictEqual(result.content[0].value, "commit blocked");
  });
  test("beginToolCall creates streaming tool invocation", () => {
    const tool = registerToolForTest(service, store, "streamingTool", {
      invoke: async () => ({ content: [{ kind: "text", value: "result" }] }),
      handleToolStream: async () => ({ invocationMessage: "Processing..." })
    });
    const sessionId = "streaming-session";
    const requestId = "streaming-request";
    stubGetSession(chatService, sessionId, { requestId });
    const invocation = service.beginToolCall({
      toolCallId: "call-123",
      toolId: tool.id,
      chatRequestId: requestId,
      sessionResource: LocalChatSessionUri.forSession(sessionId)
    });
    assert.ok(invocation, "beginToolCall should return an invocation");
    assert.strictEqual(invocation.toolId, tool.id);
  });
  test("beginToolCall returns undefined for unknown tool", () => {
    const invocation = service.beginToolCall({
      toolCallId: "call-unknown",
      toolId: "nonExistentTool"
    });
    assert.strictEqual(invocation, void 0, "beginToolCall should return undefined for unknown tools");
  });
  test("beginToolCall returns undefined for tool without handleToolStream", () => {
    const tool = registerToolForTest(service, store, "noStreamTool", {
      invoke: async () => ({ content: [{ kind: "text", value: "result" }] })
    });
    const invocation = service.beginToolCall({
      toolCallId: "call-no-stream",
      toolId: tool.id
    });
    assert.strictEqual(invocation, void 0, "beginToolCall should return undefined when tool lacks handleToolStream");
  });
  test("beginToolCall with force creates invocation even without handleToolStream", () => {
    const tool = registerToolForTest(service, store, "forceStreamTool", {
      invoke: async () => ({ content: [{ kind: "text", value: "result" }] })
    });
    const invocation = service.beginToolCall({
      toolCallId: "call-force",
      toolId: tool.id,
      force: true
    });
    assert.ok(invocation, "beginToolCall with force should return an invocation");
    assert.strictEqual(invocation.toolId, tool.id);
  });
  test("updateToolStream calls handleToolStream on tool implementation", async () => {
    let handleToolStreamCalled = false;
    let receivedRawInput;
    const tool = registerToolForTest(service, store, "streamHandlerTool", {
      invoke: async () => ({ content: [{ kind: "text", value: "result" }] }),
      handleToolStream: async (context) => {
        handleToolStreamCalled = true;
        receivedRawInput = context.rawInput;
        return { invocationMessage: "Processing..." };
      }
    });
    const sessionId = "stream-handler-session";
    const requestId = "stream-handler-request";
    stubGetSession(chatService, sessionId, { requestId });
    const invocation = service.beginToolCall({
      toolCallId: "call-stream",
      toolId: tool.id,
      chatRequestId: requestId,
      sessionResource: LocalChatSessionUri.forSession(sessionId)
    });
    assert.ok(invocation, "should create invocation");
    const partialInput = { partial: "data" };
    await service.updateToolStream("call-stream", partialInput, CancellationToken.None);
    assert.strictEqual(handleToolStreamCalled, true, "handleToolStream should be called");
    assert.deepStrictEqual(receivedRawInput, partialInput, "should receive the partial input");
  });
  test("updateToolStream does nothing for unknown tool call", async () => {
    await service.updateToolStream("unknown-call-id", { data: "test" }, CancellationToken.None);
  });
  test("toToolAndToolSetEnablementMap with model metadata filters tools", () => {
    const gpt4ToolDef = {
      id: "gpt4Tool",
      toolReferenceName: "gpt4ToolRef",
      modelDescription: "GPT-4 Tool",
      displayName: "GPT-4 Tool",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true,
      models: [{ family: "gpt-4" }]
    };
    const anyModelToolDef = {
      id: "anyModelTool",
      toolReferenceName: "anyModelToolRef",
      modelDescription: "Any Model Tool",
      displayName: "Any Model Tool",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    const claudeToolDef = {
      id: "claudeTool",
      toolReferenceName: "claudeToolRef",
      modelDescription: "Claude Tool",
      displayName: "Claude Tool",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true,
      models: [{ family: "claude-3" }]
    };
    store.add(service.registerToolData(gpt4ToolDef));
    store.add(service.registerToolData(anyModelToolDef));
    store.add(service.registerToolData(claudeToolDef));
    const gpt4Tool = service.getTool("gpt4Tool");
    const anyModelTool = service.getTool("anyModelTool");
    const claudeTool = service.getTool("claudeTool");
    assert.ok(gpt4Tool && anyModelTool && claudeTool, "tools should be registered");
    const modelMetadata = { id: "gpt-4-turbo", vendor: "openai", family: "gpt-4", version: "1.0" };
    const enabledNames = ["gpt4ToolRef", "anyModelToolRef", "claudeToolRef"];
    const result = service.toToolAndToolSetEnablementMap(enabledNames, modelMetadata);
    assert.strictEqual(result.get(gpt4Tool), true, "gpt4Tool should be enabled");
    assert.strictEqual(result.get(anyModelTool), true, "anyModelTool should be enabled");
    assert.strictEqual(result.has(claudeTool), false, "claudeTool should be filtered out by model");
  });
  test("gpt-5.5 readFile setting controls Copilot read tool availability", () => {
    const readTool = {
      id: CopilotToolId.ReadFile,
      toolReferenceName: "readFile",
      modelDescription: "Read File Tool",
      displayName: "Read File",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(readTool));
    store.add(service.readToolSet.addTool(readTool));
    const gpt55Model = { id: "gpt-5.5", vendor: "copilot", family: "gpt-5.5", version: "1.0" };
    configurationService.setUserConfiguration(CopilotChatSettingId.Gpt55ReadFileToolEnabled, false);
    const disabledTools = Array.from(service.getTools(gpt55Model));
    assert.ok(!disabledTools.some((tool) => tool.id === CopilotToolId.ReadFile), "readFile should not be returned from getTools when disabled for gpt-5.5");
    const disabledReadToolSet = Array.from(service.getToolSetsForModel(gpt55Model)).find((toolSet) => toolSet.id === "read");
    assert.ok(disabledReadToolSet, "read tool set should exist");
    assert.ok(!Array.from(disabledReadToolSet.getTools()).some((tool) => tool.id === CopilotToolId.ReadFile), "readFile should not be included as a read tool-set member when disabled for gpt-5.5");
    const disabledEnablementMap = service.toToolAndToolSetEnablementMap(["read/readFile"], gpt55Model);
    assert.strictEqual(disabledEnablementMap.has(readTool), false, "readFile should not be included in explicit enablement maps when disabled for gpt-5.5");
    configurationService.setUserConfiguration(CopilotChatSettingId.Gpt55ReadFileToolEnabled, true);
    const enabledTools = Array.from(service.getTools(gpt55Model));
    assert.ok(enabledTools.some((tool) => tool.id === CopilotToolId.ReadFile), "readFile should be returned from getTools when enabled for gpt-5.5");
    const enabledReadToolSet = Array.from(service.getToolSetsForModel(gpt55Model)).find((toolSet) => toolSet.id === "read");
    assert.ok(enabledReadToolSet, "read tool set should exist");
    assert.ok(Array.from(enabledReadToolSet.getTools()).some((tool) => tool.id === CopilotToolId.ReadFile), "readFile should be included as a read tool-set member when enabled for gpt-5.5");
    const enabledEnablementMap = service.toToolAndToolSetEnablementMap(["read/readFile"], gpt55Model);
    assert.strictEqual(enabledEnablementMap.get(readTool), true, "readFile should be included in explicit enablement maps when enabled for gpt-5.5");
  });
  test("observeTools returns tools filtered by context", async () => {
    return runWithFakedTimers({}, async () => {
      contextKeyService.createKey("featureEnabled", true);
      const enabledTool = {
        id: "enabledObsTool",
        modelDescription: "Enabled Tool",
        displayName: "Enabled Tool",
        source: ToolDataSource.Internal,
        when: ContextKeyEqualsExpr.create("featureEnabled", true)
      };
      const disabledTool = {
        id: "disabledObsTool",
        modelDescription: "Disabled Tool",
        displayName: "Disabled Tool",
        source: ToolDataSource.Internal,
        when: ContextKeyEqualsExpr.create("featureEnabled", false)
      };
      store.add(service.registerToolData(enabledTool));
      store.add(service.registerToolData(disabledTool));
      const toolsObs = service.observeTools(void 0);
      const tools = toolsObs.get();
      assert.strictEqual(tools.length, 1, "should only include enabled tool");
      assert.strictEqual(tools[0].id, "enabledObsTool");
    });
  });
  test("invokeTool with chatStreamToolCallId correlates with pending streaming call", async () => {
    const tool = registerToolForTest(service, store, "correlatedTool", {
      invoke: async () => ({ content: [{ kind: "text", value: "correlated result" }] }),
      handleToolStream: async () => ({ invocationMessage: "Processing..." })
    });
    const sessionId = "correlated-session";
    const requestId = "correlated-request";
    const capture = {};
    stubGetSession(chatService, sessionId, { requestId, capture });
    const streamingInvocation = service.beginToolCall({
      toolCallId: "stream-call-id",
      toolId: tool.id,
      chatRequestId: requestId,
      sessionResource: LocalChatSessionUri.forSession(sessionId)
    });
    assert.ok(streamingInvocation, "should create streaming invocation");
    const dto = {
      callId: "different-call-id",
      toolId: tool.id,
      tokenBudget: 100,
      parameters: { test: 1 },
      context: {
        sessionResource: LocalChatSessionUri.forSession(sessionId)
      },
      chatStreamToolCallId: "stream-call-id"
      // This should correlate
    };
    const result = await service.invokeTool(dto, async () => 0, CancellationToken.None);
    assert.strictEqual(result.content[0].value, "correlated result");
  });
  test("getAllToolsIncludingDisabled returns tools regardless of when clause", () => {
    contextKeyService.createKey("featureFlag", false);
    const enabledTool = {
      id: "enabledTool",
      modelDescription: "Enabled Tool",
      displayName: "Enabled Tool",
      source: ToolDataSource.Internal
    };
    const disabledTool = {
      id: "disabledTool",
      modelDescription: "Disabled Tool",
      displayName: "Disabled Tool",
      source: ToolDataSource.Internal,
      when: ContextKeyEqualsExpr.create("featureFlag", true)
      // Will be disabled
    };
    store.add(service.registerToolData(enabledTool));
    store.add(service.registerToolData(disabledTool));
    const allTools = Array.from(service.getAllToolsIncludingDisabled());
    assert.strictEqual(allTools.length, 2, "getAllToolsIncludingDisabled should return all tools");
    assert.ok(allTools.some((t) => t.id === "enabledTool"), "should include enabled tool");
    assert.ok(allTools.some((t) => t.id === "disabledTool"), "should include disabled tool");
    const enabledTools = Array.from(service.getTools(void 0));
    assert.strictEqual(enabledTools.length, 1, "getTools should only return matching tools");
    assert.strictEqual(enabledTools[0].id, "enabledTool");
  });
  test("getTools filters by model id using models property", () => {
    const gpt4Tool = {
      id: "gpt4Tool",
      modelDescription: "GPT-4 Tool",
      displayName: "GPT-4 Tool",
      source: ToolDataSource.Internal,
      models: [{ id: "gpt-4-turbo" }]
    };
    const claudeTool = {
      id: "claudeTool",
      modelDescription: "Claude Tool",
      displayName: "Claude Tool",
      source: ToolDataSource.Internal,
      models: [{ id: "claude-3-opus" }]
    };
    const universalTool = {
      id: "universalTool",
      modelDescription: "Universal Tool",
      displayName: "Universal Tool",
      source: ToolDataSource.Internal
      // No models - available for all models
    };
    store.add(service.registerToolData(gpt4Tool));
    store.add(service.registerToolData(claudeTool));
    store.add(service.registerToolData(universalTool));
    const modelMetadata = { id: "gpt-4-turbo", vendor: "openai", family: "gpt-4", version: "1.0" };
    const tools = Array.from(service.getTools(modelMetadata));
    assert.strictEqual(tools.length, 2, "should return 2 tools");
    assert.ok(tools.some((t) => t.id === "gpt4Tool"), "should include GPT-4 tool");
    assert.ok(tools.some((t) => t.id === "universalTool"), "should include universal tool");
    assert.ok(!tools.some((t) => t.id === "claudeTool"), "should NOT include Claude tool");
  });
  test("getTools filters by model vendor using models property", () => {
    const anthropicTool = {
      id: "anthropicTool",
      modelDescription: "Anthropic Tool",
      displayName: "Anthropic Tool",
      source: ToolDataSource.Internal,
      models: [{ vendor: "anthropic" }]
    };
    const openaiTool = {
      id: "openaiTool",
      modelDescription: "OpenAI Tool",
      displayName: "OpenAI Tool",
      source: ToolDataSource.Internal,
      models: [{ vendor: "openai" }]
    };
    store.add(service.registerToolData(anthropicTool));
    store.add(service.registerToolData(openaiTool));
    const modelMetadata = { id: "claude-3", vendor: "anthropic", family: "claude-3", version: "1.0" };
    const tools = Array.from(service.getTools(modelMetadata));
    assert.strictEqual(tools.length, 1, "should return 1 tool");
    assert.strictEqual(tools[0].id, "anthropicTool", "should include Anthropic tool");
  });
  test("getTools filters by model family using models property", () => {
    const gpt4FamilyTool = {
      id: "gpt4FamilyTool",
      modelDescription: "GPT-4 Family Tool",
      displayName: "GPT-4 Family Tool",
      source: ToolDataSource.Internal,
      models: [{ family: "gpt-4" }]
    };
    const gpt35FamilyTool = {
      id: "gpt35FamilyTool",
      modelDescription: "GPT-3.5 Family Tool",
      displayName: "GPT-3.5 Family Tool",
      source: ToolDataSource.Internal,
      models: [{ family: "gpt-3.5" }]
    };
    store.add(service.registerToolData(gpt4FamilyTool));
    store.add(service.registerToolData(gpt35FamilyTool));
    const modelMetadata = { id: "gpt-4-turbo", vendor: "openai", family: "gpt-4", version: "1.0" };
    const tools = Array.from(service.getTools(modelMetadata));
    assert.strictEqual(tools.length, 1, "should return 1 tool");
    assert.strictEqual(tools[0].id, "gpt4FamilyTool", "should include GPT-4 family tool");
  });
  test("getTools with undefined model skips model filtering", () => {
    const gpt4Tool = {
      id: "gpt4Tool",
      modelDescription: "GPT-4 Tool",
      displayName: "GPT-4 Tool",
      source: ToolDataSource.Internal,
      models: [{ id: "gpt-4-turbo" }]
    };
    const claudeTool = {
      id: "claudeTool",
      modelDescription: "Claude Tool",
      displayName: "Claude Tool",
      source: ToolDataSource.Internal,
      models: [{ id: "claude-3-opus" }]
    };
    store.add(service.registerToolData(gpt4Tool));
    store.add(service.registerToolData(claudeTool));
    const tools = Array.from(service.getTools(void 0));
    assert.strictEqual(tools.length, 2, "should return all tools when model is undefined");
    assert.ok(tools.some((t) => t.id === "gpt4Tool"), "should include GPT-4 tool");
    assert.ok(tools.some((t) => t.id === "claudeTool"), "should include Claude tool");
  });
  test("getTool returns tool regardless of when clause", () => {
    contextKeyService.createKey("someFlag", false);
    const disabledTool = {
      id: "disabledLookupTool",
      modelDescription: "Disabled Lookup Tool",
      displayName: "Disabled Lookup Tool",
      source: ToolDataSource.Internal,
      when: ContextKeyEqualsExpr.create("someFlag", true)
      // Disabled
    };
    store.add(service.registerToolData(disabledTool));
    const tool = service.getTool("disabledLookupTool");
    assert.ok(tool, "getTool should return tool even when disabled");
    assert.strictEqual(tool.id, "disabledLookupTool");
  });
  test("getToolByName returns tool regardless of when clause", () => {
    contextKeyService.createKey("anotherFlag", false);
    const disabledTool = {
      id: "disabledNamedTool",
      toolReferenceName: "disabledNamedToolRef",
      modelDescription: "Disabled Named Tool",
      displayName: "Disabled Named Tool",
      source: ToolDataSource.Internal,
      when: ContextKeyEqualsExpr.create("anotherFlag", true)
      // Disabled
    };
    store.add(service.registerToolData(disabledTool));
    const tool = service.getToolByName("disabledNamedToolRef");
    assert.ok(tool, "getToolByName should return tool even when disabled");
    assert.strictEqual(tool.id, "disabledNamedTool");
  });
  test("IToolData models property stores selector information", () => {
    const toolWithModels = {
      id: "modelSpecificTool",
      modelDescription: "Model Specific Tool",
      displayName: "Model Specific Tool",
      source: ToolDataSource.Internal,
      models: [
        { vendor: "openai", family: "gpt-4" },
        { vendor: "anthropic", family: "claude-3" }
      ]
    };
    store.add(service.registerToolData(toolWithModels));
    const tool = service.getTool("modelSpecificTool");
    assert.ok(tool, "tool should be registered");
    assert.ok(tool.models, "tool should have models property");
    assert.strictEqual(tool.models.length, 2, "tool should have 2 model selectors");
    assert.deepStrictEqual(tool.models[0], { vendor: "openai", family: "gpt-4" });
    assert.deepStrictEqual(tool.models[1], { vendor: "anthropic", family: "claude-3" });
  });
  test("tools with extension tools disabled setting are filtered", () => {
    const extensionTool = {
      id: "extensionTool",
      modelDescription: "Extension Tool",
      displayName: "Extension Tool",
      source: { type: "extension", label: "Test Extension", extensionId: new ExtensionIdentifier("test.extension") }
    };
    store.add(service.registerToolData(extensionTool));
    let tools = Array.from(service.getTools(void 0));
    assert.ok(tools.some((t) => t.id === "extensionTool"), "extension tool should be included when enabled");
    configurationService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, false);
    tools = Array.from(service.getTools(void 0));
    assert.ok(!tools.some((t) => t.id === "extensionTool"), "extension tool should be excluded when disabled");
    configurationService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
  });
  test("observeTools changes when context key changes", () => {
    const testCtxKey = contextKeyService.createKey("dynamicTestKey", "value1");
    const tool1 = {
      id: "dynamicTool1",
      modelDescription: "Dynamic Tool 1",
      displayName: "Dynamic Tool 1",
      source: ToolDataSource.Internal,
      when: ContextKeyEqualsExpr.create("dynamicTestKey", "value1")
    };
    const tool2 = {
      id: "dynamicTool2",
      modelDescription: "Dynamic Tool 2",
      displayName: "Dynamic Tool 2",
      source: ToolDataSource.Internal,
      when: ContextKeyEqualsExpr.create("dynamicTestKey", "value2")
    };
    store.add(service.registerToolData(tool1));
    store.add(service.registerToolData(tool2));
    const toolsObs = service.observeTools(void 0);
    let tools = toolsObs.get();
    assert.strictEqual(tools.length, 1, "should have 1 tool initially");
    assert.strictEqual(tools[0].id, "dynamicTool1", "should be dynamicTool1");
    testCtxKey.set("value2");
    service.flushToolUpdates();
    tools = toolsObs.get();
    assert.strictEqual(tools.length, 1, "should have 1 tool after change");
    assert.strictEqual(tools[0].id, "dynamicTool2", "should be dynamicTool2 after context change");
  });
  test("isPermitted allows tools in permitted toolsets when agent mode is disabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const readTool = {
      id: "readToolInSet",
      toolReferenceName: "readToolRef",
      modelDescription: "Read Tool in Set",
      displayName: "Read Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(readTool));
    store.add(service.readToolSet.addTool(readTool));
    const standaloneTool = {
      id: "standaloneTool",
      toolReferenceName: "standaloneRef",
      modelDescription: "Standalone Tool",
      displayName: "Standalone Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(standaloneTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(toolIds.includes("readToolInSet"), "Tool in read toolset should be permitted when agent mode is disabled");
    assert.ok(!toolIds.includes("standaloneTool"), "Standalone tool not in permitted toolset should NOT be permitted when agent mode is disabled");
  });
  test("isPermitted allows all tools when agent mode is enabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, true);
    const readTool = {
      id: "readToolEnabled",
      toolReferenceName: "readToolEnabledRef",
      modelDescription: "Read Tool",
      displayName: "Read Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(readTool));
    store.add(service.readToolSet.addTool(readTool));
    const standaloneTool = {
      id: "standaloneToolEnabled",
      toolReferenceName: "standaloneEnabledRef",
      modelDescription: "Standalone Tool",
      displayName: "Standalone Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(standaloneTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(toolIds.includes("readToolEnabled"), "Tool in read toolset should be permitted when agent mode is enabled");
    assert.ok(toolIds.includes("standaloneToolEnabled"), "Standalone tool should be permitted when agent mode is enabled");
  });
  test("isPermitted filters toolsets when agent mode is disabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const customToolSet = store.add(service.createToolSet(
      ToolDataSource.Internal,
      "customToolSet",
      "customToolSetRef",
      { description: "Custom Tool Set" }
    ));
    const customTool = {
      id: "customToolInSet",
      toolReferenceName: "customToolRef",
      modelDescription: "Custom Tool",
      displayName: "Custom Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(customTool));
    store.add(customToolSet.addTool(customTool));
    const toolSets = Array.from(service.toolSets.get());
    const toolSetIds = Array.from(toolSets).map((ts) => ts.id);
    assert.ok(toolSetIds.includes("read"), "read toolset should be permitted when agent mode is disabled");
    assert.ok(!toolSetIds.includes("customToolSet"), "custom toolset should NOT be permitted when agent mode is disabled");
  });
  test("isPermitted allows execute toolset tools when agent mode is enabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, true);
    const executeTool = {
      id: "executeToolInSet",
      toolReferenceName: "executeToolRef",
      modelDescription: "Execute Tool",
      displayName: "Execute Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(executeTool));
    store.add(service.executeToolSet.addTool(executeTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(toolIds.includes("executeToolInSet"), "Tool in execute toolset should be permitted when agent mode is enabled");
  });
  test("isPermitted blocks execute toolset tools when agent mode is disabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const executeTool = {
      id: "executeToolBlocked",
      toolReferenceName: "executeToolBlockedRef",
      modelDescription: "Execute Tool",
      displayName: "Execute Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(executeTool));
    store.add(service.executeToolSet.addTool(executeTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(!toolIds.includes("executeToolBlocked"), "Tool in execute toolset should NOT be permitted when agent mode is disabled");
  });
  test("isPermitted allows search toolset tools when agent mode is disabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const searchToolSet = store.add(service.createToolSet(
      ToolDataSource.Internal,
      "search",
      SpecedToolAliases.search,
      { description: "Search Tool Set" }
    ));
    const searchTool = {
      id: "searchToolInSet",
      toolReferenceName: "searchToolRef",
      modelDescription: "Search Tool",
      displayName: "Search Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(searchTool));
    store.add(searchToolSet.addTool(searchTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(toolIds.includes("searchToolInSet"), "Tool in search toolset should be permitted when agent mode is disabled");
  });
  test("isPermitted allows web toolset tools when agent mode is disabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const webToolSet = store.add(service.createToolSet(
      ToolDataSource.Internal,
      "web",
      SpecedToolAliases.web,
      { description: "Web Tool Set" }
    ));
    const webTool = {
      id: "webToolInSet",
      toolReferenceName: "webToolRef",
      modelDescription: "Web Tool",
      displayName: "Web Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(webTool));
    store.add(webToolSet.addTool(webTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(toolIds.includes("webToolInSet"), "Tool in web toolset should be permitted when agent mode is disabled");
  });
  test("isPermitted allows vscode_fetchWebPage_internal special case when agent mode is disabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const fetchTool = {
      id: "vscode_fetchWebPage_internal",
      toolReferenceName: "fetchWebPage",
      modelDescription: "Fetch Web Page",
      displayName: "Fetch Web Page",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(fetchTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(toolIds.includes("vscode_fetchWebPage_internal"), "vscode_fetchWebPage_internal should be permitted as special case when agent mode is disabled");
  });
  test("isPermitted blocks extension tools not in permitted toolsets when agent mode is disabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const extensionTool = {
      id: "extensionToolBlocked",
      toolReferenceName: "extensionToolRef",
      modelDescription: "Extension Tool",
      displayName: "Extension Tool",
      source: { type: "extension", label: "Test Extension", extensionId: new ExtensionIdentifier("test.extension") },
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(extensionTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(!toolIds.includes("extensionToolBlocked"), "Extension tool not in permitted toolset should NOT be permitted when agent mode is disabled");
  });
  test("isPermitted blocks MCP tools not in permitted toolsets when agent mode is disabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const mcpToolSet = store.add(service.createToolSet(
      { type: "mcp", label: "Test MCP", serverLabel: "Test MCP Server", instructions: void 0, collectionId: "testMcp", definitionId: "testMcpDef" },
      "mcpToolSetBlocked",
      "mcpToolSetBlockedRef",
      { description: "MCP Tool Set" }
    ));
    const mcpTool = {
      id: "mcpToolBlocked",
      toolReferenceName: "mcpToolRef",
      modelDescription: "MCP Tool",
      displayName: "MCP Tool",
      source: { type: "mcp", label: "Test MCP", serverLabel: "Test MCP Server", instructions: void 0, collectionId: "testMcp", definitionId: "testMcpDef" },
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(mcpTool));
    store.add(mcpToolSet.addTool(mcpTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(!toolIds.includes("mcpToolBlocked"), "MCP tool should NOT be permitted when agent mode is disabled");
    const toolSets = Array.from(service.toolSets.get());
    const toolSetIds = Array.from(toolSets).map((ts) => ts.id);
    assert.ok(!toolSetIds.includes("mcpToolSetBlocked"), "MCP toolset should NOT be permitted when agent mode is disabled");
  });
  test("isPermitted blocks agent toolset tools when agent mode is disabled", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const agentTool = {
      id: "agentToolBlocked",
      toolReferenceName: "agentToolBlockedRef",
      modelDescription: "Agent Tool",
      displayName: "Agent Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(agentTool));
    store.add(service.agentToolSet.addTool(agentTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(!toolIds.includes("agentToolBlocked"), "Tool in agent toolset should NOT be permitted when agent mode is disabled");
    const toolSets = Array.from(service.toolSets.get());
    const toolSetIds = Array.from(toolSets).map((ts) => ts.id);
    assert.ok(!toolSetIds.includes("agent"), "agent toolset should NOT be permitted when agent mode is disabled");
  });
  test("isPermitted includes tool in multiple toolsets if one is permitted", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const multiSetTool = {
      id: "multiSetTool",
      toolReferenceName: "multiSetToolRef",
      modelDescription: "Multi Set Tool",
      displayName: "Multi Set Tool",
      source: ToolDataSource.Internal
    };
    store.add(service.registerToolData(multiSetTool));
    store.add(service.readToolSet.addTool(multiSetTool));
    const customToolSet = store.add(service.createToolSet(
      ToolDataSource.Internal,
      "customMultiSet",
      "customMultiSetRef",
      { description: "Custom Multi Set" }
    ));
    store.add(customToolSet.addTool(multiSetTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(toolIds.includes("multiSetTool"), "Tool should be permitted if it belongs to at least one permitted toolset");
  });
  test("isPermitted allows internal tools with canBeReferencedInPrompt=false when agent mode is disabled (issue #292935)", () => {
    configurationService.setUserConfiguration(ChatConfiguration.AgentEnabled, false);
    const infrastructureTool = {
      id: "infrastructureToolInternal",
      toolReferenceName: "infrastructureToolRef",
      modelDescription: "Infrastructure Tool",
      displayName: "Infrastructure Tool",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: false
    };
    store.add(service.registerToolData(infrastructureTool));
    const referencableTool = {
      id: "referencableTool",
      toolReferenceName: "referencableToolRef",
      modelDescription: "Referencable Tool",
      displayName: "Referencable Tool",
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: true
    };
    store.add(service.registerToolData(referencableTool));
    const undefinedTool = {
      id: "undefinedTool",
      toolReferenceName: "undefinedToolRef",
      modelDescription: "Undefined Tool",
      displayName: "Undefined Tool",
      source: ToolDataSource.Internal
      // canBeReferencedInPrompt is undefined
    };
    store.add(service.registerToolData(undefinedTool));
    const tools = Array.from(service.getTools(void 0));
    const toolIds = tools.map((t) => t.id);
    assert.ok(toolIds.includes("infrastructureToolInternal"), "Internal infrastructure tool with canBeReferencedInPrompt=false should be permitted when agent mode is disabled");
    assert.ok(!toolIds.includes("referencableTool"), "Internal tool with canBeReferencedInPrompt=true should NOT be permitted when agent mode is disabled");
    assert.ok(!toolIds.includes("undefinedTool"), "Internal tool with canBeReferencedInPrompt=undefined should NOT be permitted when agent mode is disabled");
  });
  suite("ToolSet when clause filtering (issue #291154)", () => {
    test("ToolSet.getTools filters tools by when clause", () => {
      contextKeyService.createKey("testFeatureEnabled", false);
      const toolWithWhenTrue = {
        id: "toolWithWhenTrue",
        modelDescription: "Tool with when true",
        displayName: "Tool with when true",
        source: ToolDataSource.Internal,
        when: ContextKeyEqualsExpr.create("testFeatureEnabled", true)
      };
      const toolWithWhenFalse = {
        id: "toolWithWhenFalse",
        modelDescription: "Tool with when false",
        displayName: "Tool with when false",
        source: ToolDataSource.Internal,
        when: ContextKeyEqualsExpr.create("testFeatureEnabled", false)
      };
      const toolWithoutWhen = {
        id: "toolWithoutWhen",
        modelDescription: "Tool without when",
        displayName: "Tool without when",
        source: ToolDataSource.Internal
      };
      const testToolSet = store.add(service.createToolSet(
        ToolDataSource.Internal,
        "testToolSet",
        "testToolSetRef",
        { description: "Test Tool Set" }
      ));
      store.add(service.registerToolData(toolWithWhenTrue));
      store.add(service.registerToolData(toolWithWhenFalse));
      store.add(service.registerToolData(toolWithoutWhen));
      store.add(testToolSet.addTool(toolWithWhenTrue));
      store.add(testToolSet.addTool(toolWithWhenFalse));
      store.add(testToolSet.addTool(toolWithoutWhen));
      const tools = Array.from(testToolSet.getTools());
      const toolIds = tools.map((t) => t.id);
      assert.ok(toolIds.includes("toolWithWhenFalse"), "Tool with when=false should be in tool set when context key is false");
      assert.ok(toolIds.includes("toolWithoutWhen"), "Tool without when clause should be in tool set");
      assert.ok(!toolIds.includes("toolWithWhenTrue"), "Tool with when=true should NOT be in tool set when context key is false");
    });
    test("ToolSet.getTools updates when context key changes", () => {
      const testKey = contextKeyService.createKey("dynamicTestKey", "value1");
      const toolWithValue1 = {
        id: "toolWithValue1",
        modelDescription: "Tool with value1",
        displayName: "Tool with value1",
        source: ToolDataSource.Internal,
        when: ContextKeyEqualsExpr.create("dynamicTestKey", "value1")
      };
      const toolWithValue2 = {
        id: "toolWithValue2",
        modelDescription: "Tool with value2",
        displayName: "Tool with value2",
        source: ToolDataSource.Internal,
        when: ContextKeyEqualsExpr.create("dynamicTestKey", "value2")
      };
      const dynamicToolSet = store.add(service.createToolSet(
        ToolDataSource.Internal,
        "dynamicToolSet",
        "dynamicToolSetRef",
        { description: "Dynamic Tool Set" }
      ));
      store.add(service.registerToolData(toolWithValue1));
      store.add(service.registerToolData(toolWithValue2));
      store.add(dynamicToolSet.addTool(toolWithValue1));
      store.add(dynamicToolSet.addTool(toolWithValue2));
      let tools = Array.from(dynamicToolSet.getTools());
      let toolIds = tools.map((t) => t.id);
      assert.strictEqual(tools.length, 1, "Should have 1 tool initially");
      assert.strictEqual(toolIds[0], "toolWithValue1", "Should be toolWithValue1");
      testKey.set("value2");
      service.flushToolUpdates();
      tools = Array.from(dynamicToolSet.getTools());
      toolIds = tools.map((t) => t.id);
      assert.strictEqual(tools.length, 1, "Should have 1 tool after change");
      assert.strictEqual(toolIds[0], "toolWithValue2", "Should be toolWithValue2 after context change");
    });
    test("ToolSet.getTools with complex when expressions", () => {
      contextKeyService.createKey("featureA", true);
      contextKeyService.createKey("featureB", false);
      contextKeyService.createKey("featureC", true);
      const toolWithAnd = {
        id: "toolWithAnd",
        modelDescription: "Tool with AND expression",
        displayName: "Tool with AND",
        source: ToolDataSource.Internal,
        when: ContextKeyExpr.and(
          ContextKeyExpr.has("featureA"),
          ContextKeyExpr.has("featureC")
        )
      };
      const toolWithOr = {
        id: "toolWithOr",
        modelDescription: "Tool with OR expression",
        displayName: "Tool with OR",
        source: ToolDataSource.Internal,
        when: ContextKeyExpr.or(
          ContextKeyExpr.has("featureA"),
          ContextKeyExpr.has("featureC")
        )
      };
      const toolWithNot = {
        id: "toolWithNot",
        modelDescription: "Tool with NOT expression",
        displayName: "Tool with NOT",
        source: ToolDataSource.Internal,
        when: ContextKeyExpr.not("featureB")
      };
      const complexToolSet = store.add(service.createToolSet(
        ToolDataSource.Internal,
        "complexToolSet",
        "complexToolSetRef",
        { description: "Complex Tool Set" }
      ));
      store.add(service.registerToolData(toolWithAnd));
      store.add(service.registerToolData(toolWithOr));
      store.add(service.registerToolData(toolWithNot));
      store.add(complexToolSet.addTool(toolWithAnd));
      store.add(complexToolSet.addTool(toolWithOr));
      store.add(complexToolSet.addTool(toolWithNot));
      const tools = Array.from(complexToolSet.getTools());
      const toolIds = tools.map((t) => t.id);
      assert.ok(toolIds.includes("toolWithAnd"), "Tool with AND should be in tool set (has(featureA) AND has(featureC) = true)");
      assert.ok(toolIds.includes("toolWithOr"), "Tool with OR should be in tool set (has(featureA) OR has(featureC) = true)");
      assert.ok(toolIds.includes("toolWithNot"), "Tool with NOT should be in tool set (NOT has(featureB) = true)");
    });
    test("ToolSet.getTools filters nested tool sets by when clause", () => {
      contextKeyService.createKey("nestedFeature", false);
      const parentTool = {
        id: "parentTool",
        modelDescription: "Parent Tool",
        displayName: "Parent Tool",
        source: ToolDataSource.Internal
      };
      const childToolWithWhen = {
        id: "childToolWithWhen",
        modelDescription: "Child Tool with When",
        displayName: "Child Tool with When",
        source: ToolDataSource.Internal,
        when: ContextKeyEqualsExpr.create("nestedFeature", true)
      };
      const childToolWithoutWhen = {
        id: "childToolWithoutWhen",
        modelDescription: "Child Tool without When",
        displayName: "Child Tool without When",
        source: ToolDataSource.Internal
      };
      const parentToolSet = store.add(service.createToolSet(
        ToolDataSource.Internal,
        "parentToolSet",
        "parentToolSetRef",
        { description: "Parent Tool Set" }
      ));
      const childToolSet = store.add(service.createToolSet(
        ToolDataSource.Internal,
        "childToolSet",
        "childToolSetRef",
        { description: "Child Tool Set" }
      ));
      store.add(service.registerToolData(parentTool));
      store.add(service.registerToolData(childToolWithWhen));
      store.add(service.registerToolData(childToolWithoutWhen));
      store.add(parentToolSet.addTool(parentTool));
      store.add(parentToolSet.addToolSet(childToolSet));
      store.add(childToolSet.addTool(childToolWithWhen));
      store.add(childToolSet.addTool(childToolWithoutWhen));
      const tools = Array.from(parentToolSet.getTools());
      const toolIds = tools.map((t) => t.id);
      assert.ok(toolIds.includes("parentTool"), "Parent tool should be in tool set");
      assert.ok(toolIds.includes("childToolWithoutWhen"), "Child tool without when should be in tool set");
      assert.ok(!toolIds.includes("childToolWithWhen"), "Child tool with when=true should NOT be in tool set when context key is false");
    });
  });
  suite("preToolUse hooks", () => {
    let hookService;
    let hookChatService;
    setup(() => {
      const setup2 = createTestToolsService(store);
      hookService = setup2.service;
      hookChatService = setup2.chatService;
    });
    test("when hook denies, tool returns error and creates cancelled invocation", async () => {
      const tool = registerToolForTest(hookService, store, "hookDenyTool", {
        invoke: async () => ({ content: [{ kind: "text", value: "should not run" }] })
      });
      const capture = {};
      stubGetSession(hookChatService, "hook-test", { requestId: "req1", capture });
      const dto = tool.makeDto({ test: 1 }, { sessionId: "hook-test" });
      dto.preToolUseResult = {
        permissionDecision: "deny",
        permissionDecisionReason: "Destructive operations require approval"
      };
      const result = await hookService.invokeTool(
        dto,
        async () => 0,
        CancellationToken.None
      );
      assert.ok(result.toolResultError);
      assert.ok(result.toolResultError.includes("Destructive operations require approval"));
      assert.strictEqual(result.content[0].kind, "text");
      assert.ok(result.content[0].value.includes("Tool execution denied"));
      const invocation = await waitForPublishedInvocation(capture);
      assert.ok(invocation);
      const state = invocation.state.get();
      assert.strictEqual(state.type, IChatToolInvocation.StateKind.Cancelled);
      if (state.type === IChatToolInvocation.StateKind.Cancelled) {
        assert.strictEqual(state.reason, ToolConfirmKind.Denied);
        assert.strictEqual(state.reasonMessage, "Denied by PreToolUse hook: Destructive operations require approval");
      }
    });
    test("when hook allows, tool executes normally", async () => {
      const tool = registerToolForTest(hookService, store, "hookAllowTool", {
        invoke: async () => ({ content: [{ kind: "text", value: "success" }] })
      });
      const capture = {};
      stubGetSession(hookChatService, "hook-test-allow", { requestId: "req1", capture });
      const dto = tool.makeDto({ test: 1 }, { sessionId: "hook-test-allow" });
      dto.preToolUseResult = {
        permissionDecision: "allow"
      };
      const result = await hookService.invokeTool(
        dto,
        async () => 0,
        CancellationToken.None
      );
      assert.strictEqual(result.content[0].kind, "text");
      assert.strictEqual(result.content[0].value, "success");
      assert.ok(!result.toolResultError);
    });
    test("when hook returns undefined, tool executes normally", async () => {
      const tool = registerToolForTest(hookService, store, "hookUndefinedTool", {
        invoke: async () => ({ content: [{ kind: "text", value: "success" }] })
      });
      stubGetSession(hookChatService, "hook-test-undefined", { requestId: "req1" });
      const result = await hookService.invokeTool(
        tool.makeDto({ test: 1 }, { sessionId: "hook-test-undefined" }),
        async () => 0,
        CancellationToken.None
      );
      assert.strictEqual(result.content[0].kind, "text");
      assert.strictEqual(result.content[0].value, "success");
    });
    test("when hook denies, tool invoke is never called", async () => {
      let invokeCalled = false;
      const tool = registerToolForTest(hookService, store, "hookNeverInvokeTool", {
        invoke: async () => {
          invokeCalled = true;
          return { content: [{ kind: "text", value: "should not run" }] };
        }
      });
      const capture = {};
      stubGetSession(hookChatService, "hook-test-no-invoke", { requestId: "req1", capture });
      const dto = tool.makeDto({ test: 1 }, { sessionId: "hook-test-no-invoke" });
      dto.preToolUseResult = {
        permissionDecision: "deny",
        permissionDecisionReason: "Operation not allowed"
      };
      await hookService.invokeTool(
        dto,
        async () => 0,
        CancellationToken.None
      );
      assert.strictEqual(invokeCalled, false, "Tool invoke should not be called when hook denies");
    });
    test("when hook returns ask, tool is not auto-approved", async () => {
      let invokeCompleted = false;
      const tool = registerToolForTest(hookService, store, "hookAskTool", {
        invoke: async () => {
          invokeCompleted = true;
          return { content: [{ kind: "text", value: "success" }] };
        },
        prepareToolInvocation: async () => ({
          confirmationMessages: {
            title: "Confirm this action?",
            message: "This tool requires confirmation",
            allowAutoConfirm: true
          }
        })
      });
      const capture = {};
      stubGetSession(hookChatService, "hook-test-ask", { requestId: "req1", capture });
      const dto = tool.makeDto({ test: 1 }, { sessionId: "hook-test-ask" });
      dto.preToolUseResult = {
        permissionDecision: "ask",
        permissionDecisionReason: "Requires user confirmation"
      };
      const invokePromise = hookService.invokeTool(
        dto,
        async () => 0,
        CancellationToken.None
      );
      const invocation = await waitForPublishedInvocation(capture);
      assert.ok(invocation, "Tool invocation should be created");
      const state = invocation.state.get();
      assert.strictEqual(
        state.type,
        IChatToolInvocation.StateKind.WaitingForConfirmation,
        "Tool should be waiting for confirmation when hook returns ask"
      );
      IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
      await invokePromise;
      assert.strictEqual(invokeCompleted, true, "Tool should complete after confirmation");
    });
    test("when hook returns allow, tool is auto-approved", async () => {
      let invokeCompleted = false;
      const tool = registerToolForTest(hookService, store, "hookAutoApproveTool", {
        invoke: async () => {
          invokeCompleted = true;
          return { content: [{ kind: "text", value: "success" }] };
        },
        prepareToolInvocation: async () => ({
          confirmationMessages: {
            title: "Confirm this action?",
            message: "This tool would normally require confirmation",
            allowAutoConfirm: true
          }
        })
      });
      const capture = {};
      stubGetSession(hookChatService, "hook-test-auto-approve", { requestId: "req1", capture });
      const dto = tool.makeDto({ test: 1 }, { sessionId: "hook-test-auto-approve" });
      dto.preToolUseResult = {
        permissionDecision: "allow"
      };
      const result = await hookService.invokeTool(
        dto,
        async () => 0,
        CancellationToken.None
      );
      assert.strictEqual(invokeCompleted, true, "Tool should complete immediately when hook allows");
      assert.strictEqual(result.content[0].kind, "text");
      assert.strictEqual(result.content[0].value, "success");
    });
    test("when hook returns updatedInput, tool is invoked with replaced parameters", async () => {
      let receivedParameters;
      const tool = registerToolForTest(hookService, store, "hookUpdatedInputTool", {
        invoke: async (dto2) => {
          receivedParameters = dto2.parameters;
          return { content: [{ kind: "text", value: "done" }] };
        },
        prepareToolInvocation: async () => ({
          confirmationMessages: {
            title: "Confirm?",
            message: "Confirm action",
            allowAutoConfirm: true
          }
        })
      });
      stubGetSession(hookChatService, "hook-test-updated-input", { requestId: "req1" });
      const dto = tool.makeDto({ originalCommand: "rm -rf /" }, { sessionId: "hook-test-updated-input" });
      dto.preToolUseResult = {
        permissionDecision: "allow",
        updatedInput: { safeCommand: "echo hello" }
      };
      await hookService.invokeTool(
        dto,
        async () => 0,
        CancellationToken.None
      );
      assert.deepStrictEqual(receivedParameters, { safeCommand: "echo hello" });
    });
    test("when hook returns updatedInput that fails schema validation, original parameters are kept", async () => {
      const mockCommandService = {
        executeCommand: async (commandId) => {
          if (commandId === "json.validate") {
            return [{ message: 'Missing required property "command"', range: [{ line: 0, character: 0 }, { line: 0, character: 1 }], severity: "Error" }];
          }
          return void 0;
        }
      };
      const setup2 = createTestToolsService(store, {
        commandService: mockCommandService
      });
      let receivedParameters;
      const tool = registerToolForTest(setup2.service, store, "hookValidationFailTool", {
        invoke: async (dto2) => {
          receivedParameters = dto2.parameters;
          return { content: [{ kind: "text", value: "done" }] };
        },
        prepareToolInvocation: async () => ({
          confirmationMessages: {
            title: "Confirm?",
            message: "Confirm action",
            allowAutoConfirm: true
          }
        })
      }, {
        inputSchema: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"]
        }
      });
      stubGetSession(setup2.chatService, "hook-test-validation-fail", { requestId: "req1" });
      const dto = tool.makeDto({ command: "original" }, { sessionId: "hook-test-validation-fail" });
      dto.preToolUseResult = {
        permissionDecision: "allow",
        updatedInput: { invalidField: "wrong" }
      };
      await setup2.service.invokeTool(
        dto,
        async () => 0,
        CancellationToken.None
      );
      assert.deepStrictEqual(receivedParameters, { command: "original" });
    });
    test("when hook returns updatedInput that passes schema validation, parameters are replaced", async () => {
      const mockCommandService = {
        executeCommand: async (commandId) => {
          if (commandId === "json.validate") {
            return [];
          }
          return void 0;
        }
      };
      const setup2 = createTestToolsService(store, {
        commandService: mockCommandService
      });
      let receivedParameters;
      const tool = registerToolForTest(setup2.service, store, "hookValidationPassTool", {
        invoke: async (dto2) => {
          receivedParameters = dto2.parameters;
          return { content: [{ kind: "text", value: "done" }] };
        },
        prepareToolInvocation: async () => ({
          confirmationMessages: {
            title: "Confirm?",
            message: "Confirm action",
            allowAutoConfirm: true
          }
        })
      }, {
        inputSchema: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"]
        }
      });
      stubGetSession(setup2.chatService, "hook-test-validation-pass", { requestId: "req1" });
      const dto = tool.makeDto({ command: "original" }, { sessionId: "hook-test-validation-pass" });
      dto.preToolUseResult = {
        permissionDecision: "allow",
        updatedInput: { command: "safe-command" }
      };
      await setup2.service.invokeTool(
        dto,
        async () => 0,
        CancellationToken.None
      );
      assert.deepStrictEqual(receivedParameters, { command: "safe-command" });
    });
  });
  suite("preApproved (out-of-band auto-approval)", () => {
    let preApprovedService;
    let preApprovedChatService;
    setup(() => {
      const setup2 = createTestToolsService(store);
      preApprovedService = setup2.service;
      preApprovedChatService = setup2.chatService;
    });
    test("a confirmable tool with dto.preApproved never enters WaitingForConfirmation", async () => {
      let invokeCompleted = false;
      const tool = registerToolForTest(preApprovedService, store, "preApprovedTool", {
        invoke: async () => {
          invokeCompleted = true;
          return { content: [{ kind: "text", value: "success" }] };
        },
        prepareToolInvocation: async () => ({
          confirmationMessages: {
            title: "Confirm this action?",
            message: "This tool would normally require confirmation",
            allowAutoConfirm: true
          }
        })
      });
      const capture = {};
      stubGetSession(preApprovedChatService, "pre-approved", { requestId: "req1", capture });
      const dto = tool.makeDto({ test: 1 }, { sessionId: "pre-approved" });
      dto.preApproved = { type: ToolConfirmKind.Setting, id: "autoApprove" };
      const invokePromise = preApprovedService.invokeTool(dto, async () => 0, CancellationToken.None);
      const invocation = await waitForPublishedInvocation(capture);
      const publishedState = invocation.state.get().type;
      if (publishedState === IChatToolInvocation.StateKind.WaitingForConfirmation) {
        IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
      }
      const result = await invokePromise;
      assert.deepStrictEqual(
        {
          invokeCompleted,
          value: result.content[0].value,
          publishedWaitingForConfirmation: publishedState === IChatToolInvocation.StateKind.WaitingForConfirmation
        },
        {
          invokeCompleted: true,
          value: "success",
          publishedWaitingForConfirmation: false
        }
      );
    });
    test("dto.preApproved does not override a preToolUse hook that returned ask", async () => {
      const tool = registerToolForTest(preApprovedService, store, "preApprovedAskTool", {
        invoke: async () => ({ content: [{ kind: "text", value: "success" }] }),
        prepareToolInvocation: async () => ({
          confirmationMessages: {
            title: "Confirm this action?",
            message: "This tool requires confirmation",
            allowAutoConfirm: true
          }
        })
      });
      const capture = {};
      stubGetSession(preApprovedChatService, "pre-approved-ask", { requestId: "req1", capture });
      const dto = tool.makeDto({ test: 1 }, { sessionId: "pre-approved-ask" });
      dto.preApproved = { type: ToolConfirmKind.Setting, id: "autoApprove" };
      dto.preToolUseResult = { permissionDecision: "ask", permissionDecisionReason: "Requires user confirmation" };
      const invokePromise = preApprovedService.invokeTool(dto, async () => 0, CancellationToken.None);
      const invocation = await waitForPublishedInvocation(capture);
      assert.strictEqual(
        invocation.state.get().type,
        IChatToolInvocation.StateKind.WaitingForConfirmation,
        "preApproved must not override an explicit hook ask"
      );
      IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
      await invokePromise;
    });
    test("a headless confirmable tool with dto.preApproved does not show a dialog", async () => {
      const dialogService = new CountingDialogService({ confirmed: true });
      const setup2 = createTestToolsService(store, { dialogService });
      let invokeCompleted = false;
      const tool = registerToolForTest(setup2.service, store, "headlessPreApprovedTool", {
        invoke: async () => {
          invokeCompleted = true;
          return { content: [{ kind: "text", value: "success" }] };
        },
        prepareToolInvocation: async () => ({
          confirmationMessages: {
            title: "Confirm this action?",
            message: "This tool would normally require confirmation",
            allowAutoConfirm: true
          }
        })
      });
      const dto = tool.makeDto({ test: 1 });
      dto.preApproved = { type: ToolConfirmKind.Setting, id: "autoApprove" };
      const result = await setup2.service.invokeTool(dto, async () => 0, CancellationToken.None);
      assert.deepStrictEqual({
        invokeCompleted,
        value: result.content[0].value,
        confirmCalls: dialogService.confirmCalls
      }, {
        invokeCompleted: true,
        value: "success",
        confirmCalls: 0
      });
    });
    test("a headless preToolUse hook ask overrides dto.preApproved", async () => {
      const dialogService = new CountingDialogService({ confirmed: true });
      const setup2 = createTestToolsService(store, { dialogService });
      const tool = registerToolForTest(setup2.service, store, "headlessPreApprovedAskTool", {
        invoke: async () => ({ content: [{ kind: "text", value: "success" }] }),
        prepareToolInvocation: async () => ({
          confirmationMessages: {
            title: "Confirm this action?",
            message: "This tool requires confirmation",
            allowAutoConfirm: true
          }
        })
      });
      const dto = tool.makeDto({ test: 1 });
      dto.preApproved = { type: ToolConfirmKind.Setting, id: "autoApprove" };
      dto.preToolUseResult = { permissionDecision: "ask", permissionDecisionReason: "Requires user confirmation" };
      await setup2.service.invokeTool(dto, async () => 0, CancellationToken.None);
      assert.strictEqual(dialogService.confirmCalls, 1);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHRvb2xzXFxsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEJhcnJpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L3Rlc3QvY29tbW9uL3Rlc3RBY2Nlc3NpYmlsaXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFcXVhbHNFeHByLCBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlybWF0aW9uLCBJQ29uZmlybWF0aW9uUmVzdWx0LCBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgVGVzdERpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL3Rlc3QvY29tbW9uL3Rlc3REaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbmZpcm1hdGlvbk9wdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLCBJVG9vbFJpc2tBc3Nlc3NtZW50LCBUb29sUmlza0xldmVsLCBUb29sUmlza1Byb21wdEtpbmQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rvb2xzL2NoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCwgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCBJQ2hhdFByb2dyZXNzLCBJQ2hhdEluZm9NZXNzYWdlLCBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFNwZWNlZFRvb2xBbGlhc2VzLCBpc1Rvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMsIElUb29sRGF0YSwgSVRvb2xJbXBsLCBJVG9vbEludm9jYXRpb24sIFRvb2xEYXRhU291cmNlLCBJVG9vbFJlc3VsdFRleHRQYXJ0LCBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvbW9ja0NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRUb29sSW52b2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0VG9vbEludm9jYXRpb24uanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IENvcGlsb3RDaGF0U2V0dGluZ0lkLCBDb3BpbG90VG9vbElkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2NvcGlsb3RUb29sSWRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbW9ja0xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRvb2xSZXN1bHRDb21wcmVzc29yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL3Rvb2xSZXN1bHRDb21wcmVzc29yLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5cbi8vIC0tLSBUZXN0IGhlbHBlcnMgdG8gcmVkdWNlIHJlcGV0aXRpb24gYW5kIGltcHJvdmUgcmVhZGFiaWxpdHkgLS0tXG5cbmNvbnN0IG5vb3BUb29sUmVzdWx0Q29tcHJlc3NvcjogSVRvb2xSZXN1bHRDb21wcmVzc29yID0ge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdHJlZ2lzdGVyRmlsdGVyOiAoKSA9PiB7IH0sXG5cdHJlZ2lzdGVyQ2FjaGU6ICgpID0+IHsgfSxcblx0bWF5YmVDb21wcmVzczogKCkgPT4gdW5kZWZpbmVkLFxufTtcblxuY2xhc3MgVGVzdEFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIGltcGxlbWVudHMgUGFydGlhbDxJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U+IHtcblx0cHVibGljIHNpZ25hbFBsYXllZENhbGxzOiB7IHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbDsgb3B0aW9ucz86IGFueSB9W10gPSBbXTtcblxuXHRhc3luYyBwbGF5U2lnbmFsKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgb3B0aW9ucz86IGFueSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2lnbmFsUGxheWVkQ2FsbHMucHVzaCh7IHNpZ25hbCwgb3B0aW9ucyB9KTtcblx0fVxuXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMuc2lnbmFsUGxheWVkQ2FsbHMgPSBbXTtcblx0fVxufVxuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBpbXBsZW1lbnRzIFBhcnRpYWw8SVRlbGVtZXRyeVNlcnZpY2U+IHtcblx0cHVibGljIGV2ZW50czogQXJyYXk8eyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogYW55IH0+ID0gW107XG5cblx0cHVibGljTG9nMjxFIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgYW55PiwgVCBleHRlbmRzIFJlY29yZDxzdHJpbmcsIGFueT4+KGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogRSk6IHZvaWQge1xuXHRcdHRoaXMuZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdH1cblxuXHRyZXNldCgpIHtcblx0XHR0aGlzLmV2ZW50cyA9IFtdO1xuXHR9XG59XG5cbmNsYXNzIENvdW50aW5nRGlhbG9nU2VydmljZSBleHRlbmRzIFRlc3REaWFsb2dTZXJ2aWNlIHtcblx0Y29uZmlybUNhbGxzID0gMDtcblxuXHRvdmVycmlkZSBjb25maXJtKGNvbmZpcm1hdGlvbjogSUNvbmZpcm1hdGlvbik6IFByb21pc2U8SUNvbmZpcm1hdGlvblJlc3VsdD4ge1xuXHRcdHRoaXMuY29uZmlybUNhbGxzKys7XG5cdFx0cmV0dXJuIHN1cGVyLmNvbmZpcm0oY29uZmlybWF0aW9uKTtcblx0fVxufVxuXG4vKipcbiAqIENvbmZpZ3VyYWJsZSBzdHViIGZvciB7QGxpbmsgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlfS4gYGVuYWJsZWRgIG1vZGVscyB0aGVcbiAqIGBjaGF0LnRvb2xzLnJpc2tBc3Nlc3NtZW50LmVuYWJsZWRgIGNvbmZpcm1hdGlvbi1iYWRnZSBzZXR0aW5nOyB0ZXN0cyB0aGF0IGV4ZXJjaXNlIHRoZVxuICogZ2F0ZSBzZXQgYGFzc2Vzc21lbnRgLCBgYXNzZXNzRXJyb3JgLCBvciBgb25Bc3Nlc3NgIGFuZCBpbnNwZWN0IGBhc3Nlc3NDYWxsc2AuIE5vdGUgdGhlXG4gKiBBdXRvcGlsb3QgZ2F0ZSBpcyBpbmRlcGVuZGVudCBvZiBgZW5hYmxlZGAgKGl0IHBhc3NlcyBgaWdub3JlRW5hYmxlbWVudGApLCBzbyB0aGUgZ2F0ZSdzXG4gKiBvcHQtaW4gaXMgZHJpdmVuIGJ5IEFkdmFuY2VkIEF1dG9waWxvdCwgbm90IHRoaXMgZmllbGQuXG4gKi9cbmNsYXNzIFRlc3RDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSBpbXBsZW1lbnRzIElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBlbmFibGVkID0gZmFsc2U7XG5cdHB1YmxpYyBhc3Nlc3NtZW50OiBJVG9vbFJpc2tBc3Nlc3NtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwdWJsaWMgYXNzZXNzRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHQvKiogSW52b2tlZCBzeW5jaHJvbm91c2x5IGF0IHRoZSBzdGFydCBvZiB7QGxpbmsgYXNzZXNzfSBzbyB0ZXN0cyBjYW4gY2FuY2VsIG1pZC1mbGlnaHQuICovXG5cdHB1YmxpYyBvbkFzc2VzczogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgYXNzZXNzQ2FsbHM6IHsgdG9vbElkOiBzdHJpbmc7IHBhcmFtZXRlcnM6IHVua25vd247IGtpbmQ/OiBUb29sUmlza1Byb21wdEtpbmQgfVtdID0gW107XG5cblx0aXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVuYWJsZWQ7XG5cdH1cblxuXHRnZXRDYWNoZWQoKTogSVRvb2xSaXNrQXNzZXNzbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGFzc2Vzcyh0b29sOiBJVG9vbERhdGEsIHBhcmFtZXRlcnM6IHVua25vd24sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGtpbmQ/OiBUb29sUmlza1Byb21wdEtpbmQsIG9wdGlvbnM/OiB7IGlnbm9yZUVuYWJsZW1lbnQ/OiBib29sZWFuIH0pOiBQcm9taXNlPElUb29sUmlza0Fzc2Vzc21lbnQgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmFzc2Vzc0NhbGxzLnB1c2goeyB0b29sSWQ6IHRvb2wuaWQsIHBhcmFtZXRlcnMsIGtpbmQgfSk7XG5cdFx0dGhpcy5vbkFzc2Vzcz8uKCk7XG5cdFx0Ly8gTWlycm9yIHRoZSByZWFsIHNlcnZpY2U6IGhvbm9yIHRoZSBiYWRnZSBzZXR0aW5nIHVubGVzcyB0aGUgY2FsbGVyIG9wdHMgb3V0LlxuXHRcdGlmICghb3B0aW9ucz8uaWdub3JlRW5hYmxlbWVudCAmJiAhdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5hc3Nlc3NFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5hc3Nlc3NFcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuYXNzZXNzbWVudDtcblx0fVxufVxuXG5mdW5jdGlvbiByZWdpc3RlclRvb2xGb3JUZXN0KHNlcnZpY2U6IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHN0b3JlOiBhbnksIGlkOiBzdHJpbmcsIGltcGw6IElUb29sSW1wbCwgZGF0YT86IFBhcnRpYWw8SVRvb2xEYXRhPikge1xuXHRjb25zdCB0b29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRcdGlkLFxuXHRcdG1vZGVsRGVzY3JpcHRpb246IGRhdGE/Lm1vZGVsRGVzY3JpcHRpb24gPz8gJ1Rlc3QgVG9vbCcsXG5cdFx0ZGlzcGxheU5hbWU6IGRhdGE/LmRpc3BsYXlOYW1lID8/ICdUZXN0IFRvb2wnLFxuXHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0Li4uZGF0YSxcblx0fTtcblx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sKHRvb2xEYXRhLCBpbXBsKSk7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0bWFrZUR0bzogKHBhcmFtZXRlcnM6IGFueSwgY29udGV4dD86IHsgc2Vzc2lvbklkOiBzdHJpbmcgfSwgY2FsbElkOiBzdHJpbmcgPSAnMScpOiBJVG9vbEludm9jYXRpb24gPT4gKHtcblx0XHRcdGNhbGxJZCxcblx0XHRcdHRvb2xJZDogaWQsXG5cdFx0XHR0b2tlbkJ1ZGdldDogMTAwLFxuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdGNvbnRleHQ6IGNvbnRleHQgPyB7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKGNvbnRleHQuc2Vzc2lvbklkKSxcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0fSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHN0dWJHZXRTZXNzaW9uKGNoYXRTZXJ2aWNlOiBNb2NrQ2hhdFNlcnZpY2UsIHNlc3Npb25JZDogc3RyaW5nLCBvcHRpb25zPzogeyByZXF1ZXN0SWQ/OiBzdHJpbmc7IGNhcHR1cmU/OiB7IGludm9jYXRpb24/OiBhbnkgfTsgbW9kZUluZm8/OiB7IHBlcm1pc3Npb25MZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWwgfSB9KTogSUNoYXRNb2RlbCB7XG5cdGNvbnN0IHJlcXVlc3RJZCA9IG9wdGlvbnM/LnJlcXVlc3RJZCA/PyAncmVxdWVzdElkJztcblx0Y29uc3QgY2FwdHVyZSA9IG9wdGlvbnM/LmNhcHR1cmU7XG5cdGNvbnN0IGZha2VNb2RlbCA9IHtcblx0XHRzZXNzaW9uSWQsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKSxcblx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3sgaWQ6IHJlcXVlc3RJZCwgbW9kZWxJZDogJ3Rlc3QtbW9kZWwnLCBtb2RlSW5mbzogb3B0aW9ucz8ubW9kZUluZm8gfV0sXG5cdH0gYXMgQ2hhdE1vZGVsO1xuXHRjaGF0U2VydmljZS5hZGRTZXNzaW9uKGZha2VNb2RlbCk7XG5cdGNoYXRTZXJ2aWNlLmFwcGVuZFByb2dyZXNzID0gKHJlcXVlc3QsIHByb2dyZXNzKSA9PiB7XG5cdFx0aWYgKGNhcHR1cmUpIHsgY2FwdHVyZS5pbnZvY2F0aW9uID0gcHJvZ3Jlc3M7IH1cblx0fTtcblxuXHRyZXR1cm4gZmFrZU1vZGVsO1xufVxuXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yUHVibGlzaGVkSW52b2NhdGlvbihjYXB0dXJlOiB7IGludm9jYXRpb24/OiBhbnkgfSwgdHJpZXMgPSAxMCk6IFByb21pc2U8Q2hhdFRvb2xJbnZvY2F0aW9uPiB7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgdHJpZXMgJiYgIWNhcHR1cmUuaW52b2NhdGlvbjsgaSsrKSB7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblx0cmV0dXJuIGNhcHR1cmUuaW52b2NhdGlvbjtcbn1cblxuaW50ZXJmYWNlIFRlc3RUb29sc1NlcnZpY2VTZXR1cCB7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGNoYXRTZXJ2aWNlOiBNb2NrQ2hhdFNlcnZpY2U7XG5cdHNlcnZpY2U6IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U7XG5cdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHJpc2tBc3Nlc3NtZW50U2VydmljZTogVGVzdENoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlO1xufVxuXG5pbnRlcmZhY2UgVGVzdFRvb2xzU2VydmljZU9wdGlvbnMge1xuXHRhY2Nlc3NpYmlsaXR5U2VydmljZT86IElBY2Nlc3NpYmlsaXR5U2VydmljZTtcblx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U/OiBQYXJ0aWFsPElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZT47XG5cdHRlbGVtZXRyeVNlcnZpY2U/OiBQYXJ0aWFsPElUZWxlbWV0cnlTZXJ2aWNlPjtcblx0Y29tbWFuZFNlcnZpY2U/OiBQYXJ0aWFsPElDb21tYW5kU2VydmljZT47XG5cdGRpYWxvZ1NlcnZpY2U/OiBJRGlhbG9nU2VydmljZTtcblx0LyoqIENhbGxlZCBhZnRlciBjb25maWd1cmF0aW9uU2VydmljZSBpcyBjcmVhdGVkIGJ1dCBiZWZvcmUgdGhlIHNlcnZpY2UgaXMgaW5zdGFudGlhdGVkICovXG5cdGNvbmZpZ3VyZVNlcnZpY2VzPzogKGNvbmZpZzogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKSA9PiB2b2lkO1xufVxuXG4vKipcbiAqIEhlbHBlciB0byBjcmVhdGUgYSBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHdpdGggYWxsIGNvbW1vbiB0ZXN0IHN0dWJzLlxuICogUmVkdWNlcyBib2lsZXJwbGF0ZSB3aGVuIHRlc3RzIG5lZWQgY3VzdG9tIHNlcnZpY2UgY29uZmlndXJhdGlvbnMuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmU6IFJldHVyblR5cGU8dHlwZW9mIGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZT4sIG9wdGlvbnM/OiBUZXN0VG9vbHNTZXJ2aWNlT3B0aW9ucyk6IFRlc3RUb29sc1NlcnZpY2VTZXR1cCB7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5FeHRlbnNpb25Ub29sc0VuYWJsZWQsIHRydWUpO1xuXG5cdC8vIEFsbG93IHRlc3RzIHRvIGNvbmZpZ3VyZSBiZWZvcmUgc2VydmljZSBjcmVhdGlvblxuXHRvcHRpb25zPy5jb25maWd1cmVTZXJ2aWNlcz8uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRjb25zdCBpbnN0YVNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0Y29udGV4dEtleVNlcnZpY2U6ICgpID0+IHN0b3JlLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UoY29uZmlndXJhdGlvblNlcnZpY2UpKSxcblx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gY29uZmlndXJhdGlvblNlcnZpY2Vcblx0fSwgc3RvcmUpO1xuXHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGluc3RhU2VydmljZS5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0Y29uc3QgY2hhdFNlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXJ2aWNlKCk7XG5cdGluc3RhU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgY2hhdFNlcnZpY2UpO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSwgbmV3IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlKCkpO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJVG9vbFJlc3VsdENvbXByZXNzb3IsIG5vb3BUb29sUmVzdWx0Q29tcHJlc3Nvcik7XG5cdGNvbnN0IHJpc2tBc3Nlc3NtZW50U2VydmljZSA9IG5ldyBUZXN0Q2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UoKTtcblx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLCByaXNrQXNzZXNzbWVudFNlcnZpY2UpO1xuXG5cdGlmIChvcHRpb25zPy5hY2Nlc3NpYmlsaXR5U2VydmljZSkge1xuXHRcdGluc3RhU2VydmljZS5zdHViKElBY2Nlc3NpYmlsaXR5U2VydmljZSwgb3B0aW9ucy5hY2Nlc3NpYmlsaXR5U2VydmljZSk7XG5cdH1cblx0aWYgKG9wdGlvbnM/LmFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKSB7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLCBvcHRpb25zLmFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIGFzIHVua25vd24gYXMgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKTtcblx0fVxuXHRpZiAob3B0aW9ucz8udGVsZW1ldHJ5U2VydmljZSkge1xuXHRcdGluc3RhU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBvcHRpb25zLnRlbGVtZXRyeVNlcnZpY2UpO1xuXHR9XG5cdGlmIChvcHRpb25zPy5jb21tYW5kU2VydmljZSkge1xuXHRcdGluc3RhU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgb3B0aW9ucy5jb21tYW5kU2VydmljZSBhcyBJQ29tbWFuZFNlcnZpY2UpO1xuXHR9XG5cdGlmIChvcHRpb25zPy5kaWFsb2dTZXJ2aWNlKSB7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSURpYWxvZ1NlcnZpY2UsIG9wdGlvbnMuZGlhbG9nU2VydmljZSk7XG5cdH1cblxuXHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKSk7XG5cdHJldHVybiB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2VydmljZSwgc2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHJpc2tBc3Nlc3NtZW50U2VydmljZSB9O1xufVxuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGNvbmZpcm1hYmxlIHRvb2wgaW4gYW4gQXV0b3BpbG90IHNlc3Npb24gZm9yIGV4ZXJjaXNpbmcgdGhlIEF1dG9waWxvdCByaXNrXG4gKiBnYXRlLiBFbmFibGVzIEFkdmFuY2VkIEF1dG9waWxvdCwgcmVnaXN0ZXJzIGEgdG9vbCB3aG9zZSBgcHJlcGFyZVRvb2xJbnZvY2F0aW9uYFxuICogb3B0aW9uYWxseSByZXR1cm5zIGNvbmZpcm1hdGlvbiBtZXNzYWdlcywgc3RhbXBzIHRoZSBzZXNzaW9uIHdpdGggdGhlIGdpdmVuIHBlcm1pc3Npb25cbiAqIGxldmVsLCBhbmQgcmV0dXJucyBhbiBgaW52b2tlKClgIHBsdXMgYSBgd2FzSW52b2tlZCgpYCBmbGFnIGZvciB0aGUgdG9vbCdzIGBpbnZva2VgLlxuICovXG5mdW5jdGlvbiBzZXR1cFJpc2tHYXRlVG9vbChcblx0c2V0dXA6IFRlc3RUb29sc1NlcnZpY2VTZXR1cCxcblx0c3RvcmU6IGFueSxcblx0b3B0cz86IHsgd2l0aENvbmZpcm1hdGlvbj86IGJvb2xlYW47IHBlcm1pc3Npb25MZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWw7IGFkdmFuY2VkRW5hYmxlZD86IGJvb2xlYW47IHRvb2xJZD86IHN0cmluZyB9LFxuKTogeyBpbnZva2U6ICh0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPHsgY29udGVudDogeyB2YWx1ZTogc3RyaW5nIH1bXSB9Pjsgd2FzSW52b2tlZDogKCkgPT4gYm9vbGVhbiB9IHtcblx0Y29uc3Qgd2l0aENvbmZpcm1hdGlvbiA9IG9wdHM/LndpdGhDb25maXJtYXRpb24gPz8gdHJ1ZTtcblx0Y29uc3QgcGVybWlzc2lvbkxldmVsID0gb3B0cz8ucGVybWlzc2lvbkxldmVsID8/IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90O1xuXHRjb25zdCBhZHZhbmNlZEVuYWJsZWQgPSBvcHRzPy5hZHZhbmNlZEVuYWJsZWQgPz8gdHJ1ZTtcblx0Y29uc3QgdG9vbElkID0gb3B0cz8udG9vbElkID8/ICdyaXNrR2F0ZVRvb2wnO1xuXG5cdHNldHVwLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkF1dG9waWxvdEFkdmFuY2VkRW5hYmxlZCwgYWR2YW5jZWRFbmFibGVkKTtcblx0c2V0dXAuY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlJywgZmFsc2UpO1xuXG5cdGxldCBpbnZva2VkID0gZmFsc2U7XG5cdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHNldHVwLnNlcnZpY2UsIHN0b3JlLCB0b29sSWQsIHtcblx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh3aXRoQ29uZmlybWF0aW9uID8geyBjb25maXJtYXRpb25NZXNzYWdlczogeyB0aXRsZTogJ0NvbmZpcm0/JywgbWVzc2FnZTogJ1Byb2NlZWQ/JyB9IH0gOiB7fSksXG5cdFx0aW52b2tlOiBhc3luYyAoKSA9PiB7IGludm9rZWQgPSB0cnVlOyByZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAncmFuJyB9XSB9OyB9LFxuXHR9KTtcblxuXHRjb25zdCBzZXNzaW9uSWQgPSAncmlza0dhdGVTZXNzaW9uJztcblx0c3R1YkdldFNlc3Npb24oc2V0dXAuY2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXEtcmlzaycsIG1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbCB9IH0pO1xuXG5cdHJldHVybiB7XG5cdFx0aW52b2tlOiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgPT4gc2V0dXAuc2VydmljZS5pbnZva2VUb29sKHRvb2wubWFrZUR0byh7IHg6IDEgfSwgeyBzZXNzaW9uSWQgfSksIGFzeW5jICgpID0+IDAsIHRva2VuKSBhcyBQcm9taXNlPHsgY29udGVudDogeyB2YWx1ZTogc3RyaW5nIH1bXSB9Pixcblx0XHR3YXNJbnZva2VkOiAoKSA9PiBpbnZva2VkLFxuXHR9O1xufVxuXG5zdWl0ZSgnTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0bGV0IHNlcnZpY2U6IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U7XG5cdGxldCBjaGF0U2VydmljZTogTW9ja0NoYXRTZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dXAgPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IHNldHVwLmNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdGNoYXRTZXJ2aWNlID0gc2V0dXAuY2hhdFNlcnZpY2U7XG5cdFx0c2VydmljZSA9IHNldHVwLnNlcnZpY2U7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UgPSBzZXR1cC5jb250ZXh0S2V5U2VydmljZTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gc2V0dXBUb29sc0ZvclRlc3Qoc2VydmljZTogTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgc3RvcmU6IGFueSkge1xuXG5cdFx0Ly8gQ3JlYXRlIGEgdmFyaWV0eSBvZiB0b29scyBhbmQgdG9vbCBzZXRzIGZvciB0ZXN0aW5nXG5cdFx0Ly8gU29tZSB3aXRoIHRvb2xSZWZlcmVuY2VOYW1lLCBzb21lIHdpdGhvdXQsIHNvbWUgZnJvbSBleHRlbnNpb25zLCBtY3AgYW5kIHVzZXIgZGVmaW5lZFxuXG5cdFx0Y29uc3QgdG9vbDE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndG9vbDEnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0b29sMVJlZk5hbWUnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAxJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVG9vbDEgRGlzcGxheSBOYW1lJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbDEpKTtcblxuXHRcdGNvbnN0IHRvb2wyOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rvb2wyJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMicsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1Rvb2wyIERpc3BsYXkgTmFtZScsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2wyKSk7XG5cblx0XHQvKiogRXh0ZW5zaW9uIFRvb2wgMSAqL1xuXG5cdFx0Y29uc3QgZXh0VG9vbDE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZXh0VG9vbDEnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdleHRUb29sMVJlZk5hbWUnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgRXh0ZW5zaW9uIFRvb2wgMScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0V4dFRvb2wxIERpc3BsYXkgTmFtZScsXG5cdFx0XHRzb3VyY2U6IHsgdHlwZTogJ2V4dGVuc2lvbicsIGxhYmVsOiAnTXkgRXh0ZW5zaW9uJywgZXh0ZW5zaW9uSWQ6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdteS5leHRlbnNpb24nKSB9LFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGV4dFRvb2wxKSk7XG5cblx0XHQvKiogSW50ZXJuYWwgVG9vbCBTZXQgd2l0aCBpbnRlcm5hbFRvb2xTZXRUb29sMSAqL1xuXG5cdFx0Y29uc3QgaW50ZXJuYWxUb29sU2V0VG9vbDE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnaW50ZXJuYWxUb29sU2V0VG9vbDEnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdpbnRlcm5hbFRvb2xTZXRUb29sMVJlZk5hbWUnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgSW50ZXJuYWwgVG9vbCBTZXQgMScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0ludGVybmFsVG9vbFNldDEgRGlzcGxheSBOYW1lJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGludGVybmFsVG9vbFNldFRvb2wxKSk7XG5cblx0XHRjb25zdCBpbnRlcm5hbFRvb2xTZXQgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHQnaW50ZXJuYWxUb29sU2V0Jyxcblx0XHRcdCdpbnRlcm5hbFRvb2xTZXRSZWZOYW1lJyxcblx0XHRcdHsgZGVzY3JpcHRpb246ICdUZXN0IFNldCcgfVxuXHRcdCkpO1xuXHRcdHN0b3JlLmFkZChpbnRlcm5hbFRvb2xTZXQuYWRkVG9vbChpbnRlcm5hbFRvb2xTZXRUb29sMSkpO1xuXG5cdFx0LyoqIFVzZXIgVG9vbCBTZXQgd2l0aCB0b29sMSAqL1xuXG5cdFx0Y29uc3QgdXNlclRvb2xTZXQgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0eyB0eXBlOiAndXNlcicsIGxhYmVsOiAnVXNlcicsIGZpbGU6IFVSSS5maWxlKCcvdGVzdC91c2VyVG9vbFNldC5qc29uJykgfSxcblx0XHRcdCd1c2VyVG9vbFNldCcsXG5cdFx0XHQndXNlclRvb2xTZXRSZWZOYW1lJyxcblx0XHRcdHsgZGVzY3JpcHRpb246ICdUZXN0IFNldCcgfVxuXHRcdCkpO1xuXHRcdHN0b3JlLmFkZCh1c2VyVG9vbFNldC5hZGRUb29sKHRvb2wyKSk7XG5cblx0XHQvKiogTUNQIHRvb2wgaW4gYSBNQ1AgdG9vbCBzZXQgKi9cblxuXHRcdGNvbnN0IG1jcERhdGFTb3VyY2U6IFRvb2xEYXRhU291cmNlID0geyB0eXBlOiAnbWNwJywgbGFiZWw6ICdNeSBNQ1AgU2VydmVyJywgc2VydmVyTGFiZWw6ICdNQ1AgU2VydmVyJywgaW5zdHJ1Y3Rpb25zOiB1bmRlZmluZWQsIGNvbGxlY3Rpb25JZDogJ3Rlc3RNQ1BDb2xsZWN0aW9uJywgZGVmaW5pdGlvbklkOiAndGVzdE1DUERlZklkJyB9O1xuXHRcdGNvbnN0IG1jcFRvb2wxOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ21jcFRvb2wxJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnbWNwVG9vbDFSZWZOYW1lJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IE1DUCBUb29sIDEnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdNY3BUb29sMSBEaXNwbGF5IE5hbWUnLFxuXHRcdFx0c291cmNlOiBtY3BEYXRhU291cmNlLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKG1jcFRvb2wxKSk7XG5cblx0XHRjb25zdCBtY3BUb29sU2V0ID0gc3RvcmUuYWRkKHNlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdG1jcERhdGFTb3VyY2UsXG5cdFx0XHQnbWNwVG9vbFNldCcsXG5cdFx0XHQnbWNwVG9vbFNldFJlZk5hbWUnLFxuXHRcdFx0eyBkZXNjcmlwdGlvbjogJ01DUCBUZXN0IFRvb2xTZXQnIH1cblx0XHQpKTtcblx0XHRzdG9yZS5hZGQobWNwVG9vbFNldC5hZGRUb29sKG1jcFRvb2wxKSk7XG5cdH1cblxuXG5cdHRlc3QoJ3JlZ2lzdGVyVG9vbERhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndGVzdFRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRUb29sKCd0ZXN0VG9vbCcpPy5pZCwgJ3Rlc3RUb29sJyk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0VG9vbCgndGVzdFRvb2wnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0ZXJUb29sSW1wbGVtZW50YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndGVzdFRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xEYXRhKSk7XG5cblx0XHRjb25zdCB0b29sSW1wbDogSVRvb2xJbXBsID0ge1xuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAncmVzdWx0JyB9XSB9KSxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sSW1wbGVtZW50YXRpb24oJ3Rlc3RUb29sJywgdG9vbEltcGwpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRUb29sKCd0ZXN0VG9vbCcpPy5pZCwgJ3Rlc3RUb29sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvb2xzJywgKCkgPT4ge1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgndGVzdEtleScsIHRydWUpO1xuXHRcdGNvbnN0IHRvb2xEYXRhMTogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd0ZXN0VG9vbDEnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAxJyxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFcXVhbHNFeHByLmNyZWF0ZSgndGVzdEtleScsIGZhbHNlKSxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRvb2xEYXRhMjogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd0ZXN0VG9vbDInLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAyJyxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFcXVhbHNFeHByLmNyZWF0ZSgndGVzdEtleScsIHRydWUpLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdG9vbERhdGEzOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rlc3RUb29sMycsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBUb29sIDMnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YTEpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xEYXRhMikpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGEzKSk7XG5cblx0XHRjb25zdCB0b29scyA9IEFycmF5LmZyb20oc2VydmljZS5nZXRUb29scyh1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHNbMF0uaWQsICd0ZXN0VG9vbDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHNbMV0uaWQsICd0ZXN0VG9vbDMnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9vbEJ5TmFtZScsICgpID0+IHtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ3Rlc3RLZXknLCB0cnVlKTtcblx0XHRjb25zdCB0b29sRGF0YTE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndGVzdFRvb2wxJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndGVzdFRvb2wxJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMScsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXF1YWxzRXhwci5jcmVhdGUoJ3Rlc3RLZXknLCBmYWxzZSksXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRjb25zdCB0b29sRGF0YTI6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndGVzdFRvb2wyJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndGVzdFRvb2wyJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMicsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXF1YWxzRXhwci5jcmVhdGUoJ3Rlc3RLZXknLCB0cnVlKSxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRvb2xEYXRhMzogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd0ZXN0VG9vbDMnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0ZXN0VG9vbDMnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAzJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGExKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YTIpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xEYXRhMykpO1xuXG5cdFx0Ly8gZ2V0VG9vbEJ5TmFtZSBzZWFyY2hlcyBhbGwgdG9vbHMgcmVnYXJkbGVzcyBvZiB3aGVuIGNsYXVzZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFRvb2xCeU5hbWUoJ3Rlc3RUb29sMScpPy5pZCwgJ3Rlc3RUb29sMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFRvb2xCeU5hbWUoJ3Rlc3RUb29sMicpPy5pZCwgJ3Rlc3RUb29sMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFRvb2xCeU5hbWUoJ3Rlc3RUb29sMycpPy5pZCwgJ3Rlc3RUb29sMycpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZva2VUb29sJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rlc3RUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YSkpO1xuXG5cdFx0Y29uc3QgdG9vbEltcGw6IElUb29sSW1wbCA9IHtcblx0XHRcdGludm9rZTogYXN5bmMgKGludm9jYXRpb24pID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24uY2FsbElkLCAnMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sSWQsICd0ZXN0VG9vbCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGludm9jYXRpb24ucGFyYW1ldGVycywgeyBhOiAxIH0pO1xuXHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAncmVzdWx0JyB9XSB9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xJbXBsZW1lbnRhdGlvbigndGVzdFRvb2wnLCB0b29sSW1wbCkpO1xuXG5cdFx0Y29uc3QgZHRvOiBJVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRjYWxsSWQ6ICcxJyxcblx0XHRcdHRvb2xJZDogJ3Rlc3RUb29sJyxcblx0XHRcdHRva2VuQnVkZ2V0OiAxMDAsXG5cdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdGE6IDFcblx0XHRcdH0sXG5cdFx0XHRjb250ZXh0OiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ3Jlc3VsdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZva2VUb29sIHVzZXMgcmUtcmVnaXN0ZXJlZCBpbXBsZW1lbnRhdGlvbiBhZnRlciBwcmVwYXJlVG9vbEludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAncmVSZWdpc3RlcmVkVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnUmUtcmVnaXN0ZXJlZCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUmUtcmVnaXN0ZXJlZCBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbCh0b29sRGF0YSwge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbCh0b29sRGF0YSwge1xuXHRcdFx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3JlcGxhY2VtZW50IHJlc3VsdCcgfV0gfSksXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdzdGFsZSByZXN1bHQnIH1dIH0pLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaW52b2tlVG9vbCh7XG5cdFx0XHRjYWxsSWQ6ICcxJyxcblx0XHRcdHRvb2xJZDogdG9vbERhdGEuaWQsXG5cdFx0XHR0b2tlbkJ1ZGdldDogMTAwLFxuXHRcdFx0cGFyYW1ldGVyczoge30sXG5cdFx0XHRjb250ZXh0OiB1bmRlZmluZWQsXG5cdFx0fSwgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdyZXBsYWNlbWVudCByZXN1bHQnKTtcblx0fSk7XG5cblx0dGVzdCgnaW52b2tlVG9vbCByZXBvcnRzIGEgdG9vbCByZW1vdmVkIGR1cmluZyBwcmVwYXJlVG9vbEludm9jYXRpb24gYXMgbm90IGNvbnRyaWJ1dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3JlbW92ZWRUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdSZW1vdmVkIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdSZW1vdmVkIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gc3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sKHRvb2xEYXRhLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdzdGFsZSByZXN1bHQnIH1dIH0pLFxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHNlcnZpY2UuaW52b2tlVG9vbCh7XG5cdFx0XHRjYWxsSWQ6ICcxJyxcblx0XHRcdHRvb2xJZDogdG9vbERhdGEuaWQsXG5cdFx0XHR0b2tlbkJ1ZGdldDogMTAwLFxuXHRcdFx0cGFyYW1ldGVyczoge30sXG5cdFx0XHRjb250ZXh0OiB1bmRlZmluZWQsXG5cdFx0fSwgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIC9Ub29sIHJlbW92ZWRUb29sIHdhcyBub3QgY29udHJpYnV0ZWQvKTtcblx0fSk7XG5cblx0dGVzdCgnaW52b2NhdGlvbiBwYXJhbWV0ZXJzIGFyZSBvdmVycmlkZGVuIGJ5IGlucHV0IHRvb2xTcGVjaWZpY0RhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmF3SW5wdXQgPSB7IGI6IDIgfTtcblx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdChzZXJ2aWNlLCBzdG9yZSwgJ3Rlc3RUb29sSW5wdXRPdmVycmlkZScsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogeyBraW5kOiAnaW5wdXQnLCByYXdJbnB1dCB9IHNhdGlzZmllcyBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdHRpdGxlOiAnYScsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ2InLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKGludm9jYXRpb24pID0+IHtcblx0XHRcdFx0Ly8gVGhlIHNlcnZpY2Ugc2hvdWxkIHJlcGxhY2UgcGFyYW1ldGVycyB3aXRoIHJhd0lucHV0IGFuZCBzdHJpcCB0b29sU3BlY2lmaWNEYXRhXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi5wYXJhbWV0ZXJzLCByYXdJbnB1dCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdvaycgfV0gfTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAnc2Vzc2lvbklkJztcblx0XHRjb25zdCBjYXB0dXJlOiB7IGludm9jYXRpb24/OiBhbnkgfSA9IHt9O1xuXHRcdHN0dWJHZXRTZXNzaW9uKGNoYXRTZXJ2aWNlLCBzZXNzaW9uSWQsIHsgcmVxdWVzdElkOiAncmVxdWVzdElkLWlvJywgY2FwdHVyZSB9KTtcblx0XHRjb25zdCBkdG8gPSB0b29sLm1ha2VEdG8oeyBhOiAxIH0sIHsgc2Vzc2lvbklkIH0pO1xuXG5cdFx0Y29uc3QgaW52b2tlUCA9IHNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlZCA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgocHVibGlzaGVkLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZVA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnb2snKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhdCBpbnZvY2F0aW9uIGluamVjdHMgaW5wdXQgdG9vbFNwZWNpZmljRGF0YSBmb3IgY29uZmlybWF0aW9uIHdoZW4gYWx3YXlzRGlzcGxheUlucHV0T3V0cHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rlc3RUb29sRGlzcGxheUlPJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGFsd2F5c0Rpc3BsYXlJbnB1dE91dHB1dDogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3Qoc2VydmljZSwgc3RvcmUsICd0ZXN0VG9vbERpc3BsYXlJTycsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdDb25maXJtJywgbWVzc2FnZTogJ1Byb2NlZWQ/JyB9XG5cdFx0XHR9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ2RvbmUnIH1dIH0pLFxuXHRcdH0sIHRvb2xEYXRhKTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdzZXNzaW9uSWQtaW8nO1xuXHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24oY2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXF1ZXN0SWQtaW8nLCBjYXB0dXJlIH0pO1xuXG5cdFx0Y29uc3QgZHRvID0gdG9vbC5tYWtlRHRvKHsgYTogMSB9LCB7IHNlc3Npb25JZCB9KTtcblxuXHRcdGNvbnN0IGludm9rZVAgPSBzZXJ2aWNlLmludm9rZVRvb2woZHRvLCBhc3luYyAoKSA9PiAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBwdWJsaXNoZWQgPSBhd2FpdCB3YWl0Rm9yUHVibGlzaGVkSW52b2NhdGlvbihjYXB0dXJlKTtcblx0XHRhc3NlcnQub2socHVibGlzaGVkLCAnZXhwZWN0ZWQgQ2hhdFRvb2xJbnZvY2F0aW9uIHRvIGJlIHB1Ymxpc2hlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwdWJsaXNoZWQudG9vbElkLCB0b29sLmlkKTtcblx0XHQvLyBUaGUgc2VydmljZSBzaG91bGQgaGF2ZSBpbmplY3RlZCBpbnB1dCB0b29sU3BlY2lmaWNEYXRhIHdpdGggdGhlIHJhdyBwYXJhbWV0ZXJzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB1Ymxpc2hlZC50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAnaW5wdXQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHB1Ymxpc2hlZC50b29sU3BlY2lmaWNEYXRhPy5yYXdJbnB1dCwgZHRvLnBhcmFtZXRlcnMpO1xuXG5cdFx0Ly8gQ29uZmlybSB0byBsZXQgaW52b2tlIHByb2NlZWRcblx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHB1Ymxpc2hlZCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2VQO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ2RvbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhdCBpbnZvY2F0aW9uIHdhaXRzIGZvciB1c2VyIGNvbmZpcm1hdGlvbiBiZWZvcmUgaW52b2tpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndGVzdFRvb2xDb25maXJtJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0bGV0IGludm9rZWQgPSBmYWxzZTtcblx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdChzZXJ2aWNlLCBzdG9yZSwgdG9vbERhdGEuaWQsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHsgY29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdDb25maXJtJywgbWVzc2FnZTogJ0dvPycgfSB9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpbnZva2VkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3JhbicgfV0gfTtcblx0XHRcdH0sXG5cdFx0fSwgdG9vbERhdGEpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Nlc3Npb25JZC1jb25maXJtJztcblx0XHRjb25zdCBjYXB0dXJlOiB7IGludm9jYXRpb24/OiBhbnkgfSA9IHt9O1xuXHRcdHN0dWJHZXRTZXNzaW9uKGNoYXRTZXJ2aWNlLCBzZXNzaW9uSWQsIHsgcmVxdWVzdElkOiAncmVxdWVzdElkLWNvbmZpcm0nLCBjYXB0dXJlIH0pO1xuXG5cdFx0Y29uc3QgZHRvID0gdG9vbC5tYWtlRHRvKHsgeDogMSB9LCB7IHNlc3Npb25JZCB9KTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSBzZXJ2aWNlLmludm9rZVRvb2woZHRvLCBhc3luYyAoKSA9PiAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBwdWJsaXNoZWQgPSBhd2FpdCB3YWl0Rm9yUHVibGlzaGVkSW52b2NhdGlvbihjYXB0dXJlKTtcblx0XHRhc3NlcnQub2socHVibGlzaGVkLCAnZXhwZWN0ZWQgQ2hhdFRvb2xJbnZvY2F0aW9uIHRvIGJlIHB1Ymxpc2hlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZva2VkLCBmYWxzZSwgJ2ludm9rZSBzaG91bGQgbm90IHJ1biBiZWZvcmUgY29uZmlybWF0aW9uJyk7XG5cblx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHB1Ymxpc2hlZCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZva2VkLCB0cnVlLCAnaW52b2tlIHNob3VsZCBoYXZlIHJ1biBhZnRlciBjb25maXJtYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdyYW4nKTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0ZWRDdXN0b21CdXR0b24gaXMgcGFzc2VkIHRvIHRvb2wgaW52b2tlIHdoZW4gdXNlciBzZWxlY3RzIGEgY3VzdG9tIGJ1dHRvbicsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcmVjZWl2ZWRJbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3Qoc2VydmljZSwgc3RvcmUsICd0ZXN0VG9vbEN1c3RvbUJ1dHRvbicsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0XHR0aXRsZTogJ0NvbmZpcm0nLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdQaWNrIGFuIG9wdGlvbicsXG5cdFx0XHRcdFx0Y3VzdG9tT3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ09wdGlvbiBBJywgbGFiZWw6ICdPcHRpb24gQScsIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuQXBwcm92ZSB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ09wdGlvbiBCJywgbGFiZWw6ICdPcHRpb24gQicsIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuRGVueSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0YWxsb3dBdXRvQ29uZmlybTogZmFsc2UsXG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoaW52b2NhdGlvbikgPT4ge1xuXHRcdFx0XHRyZWNlaXZlZEludm9jYXRpb24gPSBpbnZvY2F0aW9uO1xuXHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBpbnZvY2F0aW9uLnNlbGVjdGVkQ3VzdG9tQnV0dG9uID8/ICdub25lJyB9XSB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdzZXNzaW9uSWQtY3VzdG9tLWJ0bic7XG5cdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogYW55IH0gPSB7fTtcblx0XHRzdHViR2V0U2Vzc2lvbihjaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZDogJ3JlcXVlc3RJZC1jdXN0b20tYnRuJywgY2FwdHVyZSB9KTtcblxuXHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IHg6IDEgfSwgeyBzZXNzaW9uSWQgfSk7XG5cblx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5pbnZva2VUb29sKGR0bywgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcHVibGlzaGVkID0gYXdhaXQgd2FpdEZvclB1Ymxpc2hlZEludm9jYXRpb24oY2FwdHVyZSk7XG5cdFx0YXNzZXJ0Lm9rKHB1Ymxpc2hlZCwgJ2V4cGVjdGVkIENoYXRUb29sSW52b2NhdGlvbiB0byBiZSBwdWJsaXNoZWQnKTtcblxuXHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgocHVibGlzaGVkLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uLCBzZWxlY3RlZEJ1dHRvbjogJ09wdGlvbiBBJyB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZEludm9jYXRpb24/LnNlbGVjdGVkQ3VzdG9tQnV0dG9uLCAnT3B0aW9uIEEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdPcHRpb24gQScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxlY3RlZEN1c3RvbUJ1dHRvbiBpcyBub3Qgc2V0IHdoZW4gdXNlciBjb25maXJtcyB3aXRob3V0IGN1c3RvbSBidXR0b24nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlY2VpdmVkSW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHNlcnZpY2UsIHN0b3JlLCAndGVzdFRvb2xOb0N1c3RvbUJ0bicsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdDb25maXJtJywgbWVzc2FnZTogJ0dvPycgfVxuXHRcdFx0fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jIChpbnZvY2F0aW9uKSA9PiB7XG5cdFx0XHRcdHJlY2VpdmVkSW52b2NhdGlvbiA9IGludm9jYXRpb247XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdvaycgfV0gfTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAnc2Vzc2lvbklkLW5vLWN1c3RvbS1idG4nO1xuXHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24oY2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXF1ZXN0SWQtbm8tY3VzdG9tLWJ0bicsIGNhcHR1cmUgfSk7XG5cblx0XHRjb25zdCBkdG8gPSB0b29sLm1ha2VEdG8oeyB4OiAxIH0sIHsgc2Vzc2lvbklkIH0pO1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlZCA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXHRcdGFzc2VydC5vayhwdWJsaXNoZWQpO1xuXG5cdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwdWJsaXNoZWQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjZWl2ZWRJbnZvY2F0aW9uPy5zZWxlY3RlZEN1c3RvbUJ1dHRvbiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdvaycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maXJtYXRpb25NZXNzYWdlcyB3aXRoIGN1c3RvbU9wdGlvbnMgZGlzYWJsZXMgYWxsb3dBdXRvQ29uZmlybScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdChzZXJ2aWNlLCBzdG9yZSwgJ3Rlc3RUb29sQ3VzdG9tQnRuTm9BdXRvJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdHRpdGxlOiAnQ29uZmlybScsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ0Nob29zZScsXG5cdFx0XHRcdFx0Y3VzdG9tT3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ1llcycsIGxhYmVsOiAnWWVzJywga2luZDogQ29uZmlybWF0aW9uT3B0aW9uS2luZC5BcHByb3ZlIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnTm8nLCBsYWJlbDogJ05vJywga2luZDogQ29uZmlybWF0aW9uT3B0aW9uS2luZC5EZW55IH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdkb25lJyB9XSB9KSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdzZXNzaW9uSWQtY3VzdG9tLW5vYXV0byc7XG5cdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogYW55IH0gPSB7fTtcblx0XHRzdHViR2V0U2Vzc2lvbihjaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZDogJ3JlcXVlc3RJZC1jdXN0b20tbm9hdXRvJywgY2FwdHVyZSB9KTtcblxuXHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IHg6IDEgfSwgeyBzZXNzaW9uSWQgfSk7XG5cblx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5pbnZva2VUb29sKGR0bywgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcHVibGlzaGVkID0gYXdhaXQgd2FpdEZvclB1Ymxpc2hlZEludm9jYXRpb24oY2FwdHVyZSk7XG5cdFx0YXNzZXJ0Lm9rKHB1Ymxpc2hlZCwgJ2V4cGVjdGVkIENoYXRUb29sSW52b2NhdGlvbiB0byBiZSBwdWJsaXNoZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHB1Ymxpc2hlZC5jb25maXJtYXRpb25NZXNzYWdlcz8uY3VzdG9tT3B0aW9ucz8ubWFwKG8gPT4gby5sYWJlbCksIFsnWWVzJywgJ05vJ10pO1xuXG5cdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwdWJsaXNoZWQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24sIHNlbGVjdGVkQnV0dG9uOiAnWWVzJyB9KTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcGluZyBtb2RpZmllZC1maWxlcyBjb25maXJtYXRpb24gcmV0dXJucyB0aGUgc2hhcmVkIHNraXAgbWVzc2FnZSBhbmQgZG9lcyBub3QgaW52b2tlIHRoZSB0b29sJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBpbnZva2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3Qoc2VydmljZSwgc3RvcmUsICd0ZXN0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblNraXAnLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdFx0dGl0bGU6ICdDb25maXJtJyxcblx0XHRcdFx0XHRtZXNzYWdlOiAnQ2hvb3NlJyxcblx0XHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdtb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbJ0NvcHkgQ2hhbmdlcycsICdNb3ZlIENoYW5nZXMnXSxcblx0XHRcdFx0XHRtb2RpZmllZEZpbGVzOiBbe1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL2ZpbGUxLnRzJylcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpbnZva2VkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3Nob3VsZCBub3QgcnVuJyB9XSB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdzZXNzaW9uSWQtbW9kaWZpZWQtZmlsZXMtc2tpcCc7XG5cdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogYW55IH0gPSB7fTtcblx0XHRzdHViR2V0U2Vzc2lvbihjaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZDogJ3JlcXVlc3RJZC1tb2RpZmllZC1maWxlcy1za2lwJywgY2FwdHVyZSB9KTtcblxuXHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IHg6IDEgfSwgeyBzZXNzaW9uSWQgfSk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlZCA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXHRcdGFzc2VydC5vayhwdWJsaXNoZWQsICdleHBlY3RlZCBDaGF0VG9vbEludm9jYXRpb24gdG8gYmUgcHVibGlzaGVkJyk7XG5cblx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHB1Ymxpc2hlZCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9rZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50LCBbe1xuXHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0dmFsdWU6ICdUaGUgdXNlciBjaG9zZSB0byBza2lwIHRoZSB0b29sIGNhbGwsIHRoZXkgd2FudCB0byBwcm9jZWVkIHdpdGhvdXQgcnVubmluZyBpdCdcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbCB0b29sIGNhbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbEJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHNlcnZpY2UsIHN0b3JlLCAndGVzdFRvb2wnLCB7XG5cdFx0XHRpbnZva2U6IGFzeW5jIChpbnZvY2F0aW9uLCBjb3VudFRva2VucywgcHJvZ3Jlc3MsIGNhbmNlbFRva2VuKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLmNhbGxJZCwgJzEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbElkLCAndGVzdFRvb2wnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnZvY2F0aW9uLnBhcmFtZXRlcnMsIHsgYTogMSB9KTtcblx0XHRcdFx0YXdhaXQgdG9vbEJhcnJpZXIud2FpdCgpO1xuXHRcdFx0XHRpZiAoY2FuY2VsVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rvb2wgY2FsbCBzaG91bGQgYmUgY2FuY2VsbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdzZXNzaW9uSWQnO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9ICdyZXF1ZXN0SWQnO1xuXHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IGE6IDEgfSwgeyBzZXNzaW9uSWQgfSk7XG5cdFx0c3R1YkdldFNlc3Npb24oY2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQgfSk7XG5cdFx0Y29uc3QgdG9vbFByb21pc2UgPSBzZXJ2aWNlLmludm9rZVRvb2woZHRvLCBhc3luYyAoKSA9PiAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRzZXJ2aWNlLmNhbmNlbFRvb2xDYWxsc0ZvclJlcXVlc3QocmVxdWVzdElkKTtcblx0XHR0b29sQmFycmllci5vcGVuKCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHModG9vbFByb21pc2UsIGVyciA9PiB7XG5cdFx0XHRyZXR1cm4gaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpO1xuXHRcdH0sICdFeHBlY3RlZCB0b29sIGNhbGwgdG8gYmUgY2FuY2VsbGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgdG9vbCBpbnZvY2F0aW9uIGZvciBjYW5jZWxsZWQgcmVxdWVzdCBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgaW52b2tlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHNlcnZpY2UsIHN0b3JlLCAndGVzdFRvb2wnLCB7XG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0aW52b2tlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdkb25lJyB9XSB9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Nlc3Npb25JZC1jYW5jZWxsZWQtcmVxdWVzdCc7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gJ3JlcXVlc3RJZC1jYW5jZWxsZWQtcmVxdWVzdCc7XG5cdFx0Y29uc3QgZmFrZU1vZGVsID0ge1xuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKSxcblx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbe1xuXHRcdFx0XHRpZDogcmVxdWVzdElkLFxuXHRcdFx0XHRtb2RlbElkOiAndGVzdC1tb2RlbCcsXG5cdFx0XHRcdHJlc3BvbnNlOiB7IGlzQ2FuY2VsZWQ6IHRydWUgfSxcblx0XHRcdH1dLFxuXHRcdH0gYXMgQ2hhdE1vZGVsO1xuXHRcdGNoYXRTZXJ2aWNlLmFkZFNlc3Npb24oZmFrZU1vZGVsKTtcblxuXHRcdGNvbnN0IGR0bzogSVRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0Li4udG9vbC5tYWtlRHRvKHsgYTogMSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGNoYXRSZXF1ZXN0SWQ6IHJlcXVlc3RJZCxcblx0XHR9O1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoc2VydmljZS5pbnZva2VUb29sKGR0bywgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIGVyciA9PiB7XG5cdFx0XHRyZXR1cm4gaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpO1xuXHRcdH0sICdFeHBlY3RlZCB0b29sIGludm9jYXRpb24gdG8gYmUgcmVqZWN0ZWQgZm9yIGNhbmNlbGxlZCByZXF1ZXN0IGlkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2tlZCwgZmFsc2UsICdUb29sIGltcGxlbWVudGF0aW9uIHNob3VsZCBub3QgcnVuIGFmdGVyIHJlcXVlc3QgY2FuY2VsbGF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRnVsbFJlZmVyZW5jZU5hbWVzJywgKCkgPT4ge1xuXHRcdHNldHVwVG9vbHNGb3JUZXN0KHNlcnZpY2UsIHN0b3JlKTtcblxuXHRcdGNvbnN0IHRvb2wxID0gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSgndG9vbDFSZWZOYW1lJyk7XG5cdFx0Y29uc3QgZXh0VG9vbDEgPSBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKCdteS5leHRlbnNpb24vZXh0VG9vbDFSZWZOYW1lJyk7XG5cdFx0Y29uc3QgbWNwVG9vbFNldCA9IHNlcnZpY2UuZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUoJ21jcFRvb2xTZXRSZWZOYW1lLyonKTtcblx0XHRjb25zdCBtY3BUb29sMSA9IHNlcnZpY2UuZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUoJ21jcFRvb2xTZXRSZWZOYW1lL21jcFRvb2wxUmVmTmFtZScpO1xuXHRcdGNvbnN0IGludGVybmFsVG9vbFNldCA9IHNlcnZpY2UuZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUoJ2ludGVybmFsVG9vbFNldFJlZk5hbWUnKTtcblx0XHRjb25zdCBpbnRlcm5hbFRvb2wgPSBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKCdpbnRlcm5hbFRvb2xTZXRSZWZOYW1lL2ludGVybmFsVG9vbFNldFRvb2wxUmVmTmFtZScpO1xuXHRcdGNvbnN0IHVzZXJUb29sU2V0ID0gc2VydmljZS5nZXRUb29sU2V0KCd1c2VyVG9vbFNldCcpO1xuXHRcdGNvbnN0IHVua25vd25Ub29sID0geyBpZDogJ3VucmVnaXN0ZXJlZFRvb2wnLCB0b29sUmVmZXJlbmNlTmFtZTogJ3VucmVnaXN0ZXJlZFRvb2xSZWZOYW1lJywgbW9kZWxEZXNjcmlwdGlvbjogJ1VucmVnaXN0ZXJlZCBUb29sJywgZGlzcGxheU5hbWU6ICdVbnJlZ2lzdGVyZWQgVG9vbCcsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlIH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRjb25zdCB1bmtub3duVG9vbFNldCA9IHNlcnZpY2UuY3JlYXRlVG9vbFNldChUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgJ3Vua25vd25Ub29sU2V0JywgJ3Vua25vd25Ub29sU2V0UmVmTmFtZScsIHsgZGVzY3JpcHRpb246ICdVbmtub3duIFRlc3QgU2V0JyB9KTtcblx0XHR1bmtub3duVG9vbFNldC5kaXNwb3NlKCk7IC8vIHVucmVnaXN0ZXIgdGhlIHNldFxuXHRcdGFzc2VydC5vayh0b29sMSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dFRvb2wxKTtcblx0XHRhc3NlcnQub2sobWNwVG9vbDEpO1xuXHRcdGFzc2VydC5vayhtY3BUb29sU2V0KTtcblx0XHRhc3NlcnQub2soaW50ZXJuYWxUb29sU2V0KTtcblx0XHRhc3NlcnQub2soaW50ZXJuYWxUb29sKTtcblx0XHRhc3NlcnQub2sodXNlclRvb2xTZXQpO1xuXG5cdFx0Ly8gVGVzdCB3aXRoIHNvbWUgZW5hYmxlZCB0b29sXG5cdFx0e1xuXHRcdFx0Ly8gY3JlYXRpbmcgYSBtYXAgYnkgaGFuZCBpcyBhIG5vLWdvLCB3ZSBqdXN0IGRvIGl0IGZvciB0aGlzIHRlc3Rcblx0XHRcdGNvbnN0IG1hcCA9IFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbW3Rvb2wxLCB0cnVlXSwgW2V4dFRvb2wxLCB0cnVlXSwgW21jcFRvb2xTZXQsIHRydWVdLCBbbWNwVG9vbDEsIHRydWVdXSk7XG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKG1hcCk7XG5cdFx0XHRjb25zdCBleHBlY3RlZEZ1bGxSZWZlcmVuY2VOYW1lcyA9IFsndG9vbDFSZWZOYW1lJywgJ215LmV4dGVuc2lvbi9leHRUb29sMVJlZk5hbWUnLCAnbWNwVG9vbFNldFJlZk5hbWUvKiddO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMuc29ydCgpLCBleHBlY3RlZEZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksICd0b0Z1bGxSZWZlcmVuY2VOYW1lcyBzaG91bGQgcmV0dXJuIHRoZSBvcmlnaW5hbCBlbmFibGVkIG5hbWVzJyk7XG5cdFx0fVxuXHRcdC8vIFRlc3Qgd2l0aCB1c2VyIGRhdGFcblx0XHR7XG5cdFx0XHQvLyBjcmVhdGluZyBhIG1hcCBieSBoYW5kIGlzIGEgbm8tZ28sIHdlIGp1c3QgZG8gaXQgZm9yIHRoaXMgdGVzdFxuXHRcdFx0Y29uc3QgbWFwID0gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtbdG9vbDEsIHRydWVdLCBbdXNlclRvb2xTZXQsIHRydWVdLCBbaW50ZXJuYWxUb29sU2V0LCBmYWxzZV0sIFtpbnRlcm5hbFRvb2wsIHRydWVdXSk7XG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKG1hcCk7XG5cdFx0XHRjb25zdCBleHBlY3RlZEZ1bGxSZWZlcmVuY2VOYW1lcyA9IFsndG9vbDFSZWZOYW1lJywgJ2ludGVybmFsVG9vbFNldFJlZk5hbWUvaW50ZXJuYWxUb29sU2V0VG9vbDFSZWZOYW1lJ107XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksIGV4cGVjdGVkRnVsbFJlZmVyZW5jZU5hbWVzLnNvcnQoKSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIG9yaWdpbmFsIGVuYWJsZWQgbmFtZXMnKTtcblx0XHR9XG5cdFx0Ly8gVGVzdCB3aXRoIHVua25vd24gdG9vbCBhbmQgdG9vbCBzZXRcblx0XHR7XG5cdFx0XHQvLyBjcmVhdGluZyBhIG1hcCBieSBoYW5kIGlzIGEgbm8tZ28sIHdlIGp1c3QgZG8gaXQgZm9yIHRoaXMgdGVzdFxuXHRcdFx0Y29uc3QgbWFwID0gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtbdW5rbm93blRvb2wsIHRydWVdLCBbdW5rbm93blRvb2xTZXQsIHRydWVdLCBbaW50ZXJuYWxUb29sU2V0LCB0cnVlXSwgW2ludGVybmFsVG9vbCwgdHJ1ZV1dKTtcblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMobWFwKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkRnVsbFJlZmVyZW5jZU5hbWVzID0gWydpbnRlcm5hbFRvb2xTZXRSZWZOYW1lJ107XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksIGV4cGVjdGVkRnVsbFJlZmVyZW5jZU5hbWVzLnNvcnQoKSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIG9yaWdpbmFsIGVuYWJsZWQgbmFtZXMnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEZ1bGxSZWZlcmVuY2VOYW1lIHJldHVybnMgcXVhbGlmaWVkIG5hbWVzIGZvciB0b29scyBhbmQgdG9vbCBzZXRzJywgKCkgPT4ge1xuXHRcdHNldHVwVG9vbHNGb3JUZXN0KHNlcnZpY2UsIHN0b3JlKTtcblxuXHRcdGNvbnN0IGV4dFRvb2wxID0gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSgnbXkuZXh0ZW5zaW9uL2V4dFRvb2wxUmVmTmFtZScpO1xuXHRcdGNvbnN0IG1jcFRvb2xTZXQgPSBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKCdtY3BUb29sU2V0UmVmTmFtZS8qJyk7XG5cdFx0Y29uc3QgbWNwVG9vbDEgPSBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKCdtY3BUb29sU2V0UmVmTmFtZS9tY3BUb29sMVJlZk5hbWUnKTtcblx0XHRjb25zdCBpbnRlcm5hbFRvb2xTZXQgPSBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKCdpbnRlcm5hbFRvb2xTZXRSZWZOYW1lJyk7XG5cdFx0Y29uc3QgaW50ZXJuYWxUb29sID0gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSgnaW50ZXJuYWxUb29sU2V0UmVmTmFtZS9pbnRlcm5hbFRvb2xTZXRUb29sMVJlZk5hbWUnKTtcblx0XHRhc3NlcnQub2soZXh0VG9vbDEpO1xuXHRcdGFzc2VydC5vayhtY3BUb29sU2V0KTtcblx0XHRhc3NlcnQub2sobWNwVG9vbDEpO1xuXHRcdGFzc2VydC5vayhpbnRlcm5hbFRvb2xTZXQpO1xuXHRcdGFzc2VydC5vayhpbnRlcm5hbFRvb2wpO1xuXG5cdFx0Ly8gVG9vbHMgYW5kIHRvb2wgc2V0cyByZXNvbHZlIGJhY2sgdG8gdGhlaXIgcXVhbGlmaWVkIGZ1bGwgcmVmZXJlbmNlIG5hbWVzLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKGV4dFRvb2wxKSwgJ215LmV4dGVuc2lvbi9leHRUb29sMVJlZk5hbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZShtY3BUb29sU2V0KSwgJ21jcFRvb2xTZXRSZWZOYW1lLyonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZShtY3BUb29sMSksICdtY3BUb29sU2V0UmVmTmFtZS9tY3BUb29sMVJlZk5hbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZShpbnRlcm5hbFRvb2xTZXQpLCAnaW50ZXJuYWxUb29sU2V0UmVmTmFtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKGludGVybmFsVG9vbCksICdpbnRlcm5hbFRvb2xTZXRSZWZOYW1lL2ludGVybmFsVG9vbFNldFRvb2wxUmVmTmFtZScpO1xuXG5cdFx0Ly8gUm91bmQtdHJpcDogdGhlIHByb2R1Y2VkIGZ1bGwgcmVmZXJlbmNlIG5hbWUgcmVzb2x2ZXMgYmFjayB0byB0aGUgc2FtZSBpdGVtLlxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBbZXh0VG9vbDEsIG1jcFRvb2xTZXQsIG1jcFRvb2wxLCBpbnRlcm5hbFRvb2xTZXQsIGludGVybmFsVG9vbF0pIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKHNlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWUoaXRlbSkpLCBpdGVtKTtcblx0XHR9XG5cdH0pO1xuXG5cblx0dGVzdCgndG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAnLCAoKSA9PiB7XG5cdFx0c2V0dXBUb29sc0ZvclRlc3Qoc2VydmljZSwgc3RvcmUpO1xuXG5cdFx0Y29uc3QgYWxsRnVsbFJlZmVyZW5jZU5hbWVzID0gW1xuXHRcdFx0J3Rvb2wxUmVmTmFtZScsXG5cdFx0XHQnVG9vbDIgRGlzcGxheSBOYW1lJyxcblx0XHRcdCdteS5leHRlbnNpb24vZXh0VG9vbDFSZWZOYW1lJyxcblx0XHRcdCdtY3BUb29sU2V0UmVmTmFtZS8qJyxcblx0XHRcdCdtY3BUb29sU2V0UmVmTmFtZS9tY3BUb29sMVJlZk5hbWUnLFxuXHRcdFx0J2ludGVybmFsVG9vbFNldFJlZk5hbWUnLFxuXHRcdFx0J2ludGVybmFsVG9vbFNldFJlZk5hbWUvaW50ZXJuYWxUb29sU2V0VG9vbDFSZWZOYW1lJyxcblx0XHRcdCd2c2NvZGUnLFxuXHRcdFx0J2V4ZWN1dGUnLFxuXHRcdFx0J3JlYWQnLFxuXHRcdFx0J2FnZW50J1xuXHRcdF07XG5cdFx0Y29uc3QgbnVtT2ZUb29scyA9IGFsbEZ1bGxSZWZlcmVuY2VOYW1lcy5sZW5ndGggKyAxOyAvLyArMSBmb3IgdXNlclRvb2xTZXQgd2hpY2ggaGFzIG5vIGZ1bGwgcmVmZXJlbmNlIG5hbWUgYnV0IGlzIGEgdG9vbCBzZXRcblxuXHRcdGNvbnN0IHRvb2wxID0gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSgndG9vbDFSZWZOYW1lJyk7XG5cdFx0Y29uc3QgdG9vbDIgPSBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKCdUb29sMiBEaXNwbGF5IE5hbWUnKTtcblx0XHRjb25zdCBleHRUb29sMSA9IHNlcnZpY2UuZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUoJ215LmV4dGVuc2lvbi9leHRUb29sMVJlZk5hbWUnKTtcblx0XHRjb25zdCBtY3BUb29sU2V0ID0gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSgnbWNwVG9vbFNldFJlZk5hbWUvKicpO1xuXHRcdGNvbnN0IG1jcFRvb2wxID0gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSgnbWNwVG9vbFNldFJlZk5hbWUvbWNwVG9vbDFSZWZOYW1lJyk7XG5cdFx0Y29uc3QgaW50ZXJuYWxUb29sU2V0ID0gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSgnaW50ZXJuYWxUb29sU2V0UmVmTmFtZScpO1xuXHRcdGNvbnN0IGludGVybmFsVG9vbCA9IHNlcnZpY2UuZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUoJ2ludGVybmFsVG9vbFNldFJlZk5hbWUvaW50ZXJuYWxUb29sU2V0VG9vbDFSZWZOYW1lJyk7XG5cdFx0Y29uc3QgdXNlclRvb2xTZXQgPSBzZXJ2aWNlLmdldFRvb2xTZXQoJ3VzZXJUb29sU2V0Jyk7XG5cdFx0Y29uc3QgdnNjb2RlVG9vbFNldCA9IHNlcnZpY2UuZ2V0VG9vbFNldCgndnNjb2RlJyk7XG5cdFx0Y29uc3QgZXhlY3V0ZVRvb2xTZXQgPSBzZXJ2aWNlLmdldFRvb2xTZXQoJ2V4ZWN1dGUnKTtcblx0XHRjb25zdCByZWFkVG9vbFNldCA9IHNlcnZpY2UuZ2V0VG9vbFNldCgncmVhZCcpO1xuXHRcdGNvbnN0IGFnZW50VG9vbFNldCA9IHNlcnZpY2UuZ2V0VG9vbFNldCgnYWdlbnQnKTtcblx0XHRhc3NlcnQub2sodG9vbDEpO1xuXHRcdGFzc2VydC5vayh0b29sMik7XG5cdFx0YXNzZXJ0Lm9rKGV4dFRvb2wxKTtcblx0XHRhc3NlcnQub2sobWNwVG9vbDEpO1xuXHRcdGFzc2VydC5vayhtY3BUb29sU2V0KTtcblx0XHRhc3NlcnQub2soaW50ZXJuYWxUb29sU2V0KTtcblx0XHRhc3NlcnQub2soaW50ZXJuYWxUb29sKTtcblx0XHRhc3NlcnQub2sodXNlclRvb2xTZXQpO1xuXHRcdGFzc2VydC5vayh2c2NvZGVUb29sU2V0KTtcblx0XHRhc3NlcnQub2soZXhlY3V0ZVRvb2xTZXQpO1xuXHRcdGFzc2VydC5vayhyZWFkVG9vbFNldCk7XG5cdFx0YXNzZXJ0Lm9rKGFnZW50VG9vbFNldCk7XG5cdFx0Ly8gVGVzdCB3aXRoIGVuYWJsZWQgdG9vbFxuXHRcdHtcblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IFsndG9vbDFSZWZOYW1lJ107XG5cdFx0XHRjb25zdCByZXN1bHQxID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChmdWxsUmVmZXJlbmNlTmFtZXMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5zaXplLCBudW1PZlRvb2xzLCBgRXhwZWN0ZWQgJHtudW1PZlRvb2xzfSB0b29scyBhbmQgdG9vbCBzZXRzYCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoWy4uLnJlc3VsdDEuZW50cmllcygpXS5maWx0ZXIoKFtfLCBlbmFibGVkXSkgPT4gZW5hYmxlZCkubGVuZ3RoLCAxLCAnRXhwZWN0ZWQgMSB0b29sIHRvIGJlIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLmdldCh0b29sMSksIHRydWUsICd0b29sMSBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMxID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzMS5zb3J0KCksIGZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksICd0b0Z1bGxSZWZlcmVuY2VOYW1lcyBzaG91bGQgcmV0dXJuIHRoZSBvcmlnaW5hbCBlbmFibGVkIG5hbWVzJyk7XG5cblx0XHR9XG5cdFx0Ly8gVGVzdCB3aXRoIG11bHRpcGxlIGVuYWJsZWQgdG9vbHNcblx0XHR7XG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBbJ215LmV4dGVuc2lvbi9leHRUb29sMVJlZk5hbWUnLCAnbWNwVG9vbFNldFJlZk5hbWUvKicsICdpbnRlcm5hbFRvb2xTZXRSZWZOYW1lL2ludGVybmFsVG9vbFNldFRvb2wxUmVmTmFtZSddO1xuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoZnVsbFJlZmVyZW5jZU5hbWVzLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuc2l6ZSwgbnVtT2ZUb29scywgYEV4cGVjdGVkICR7bnVtT2ZUb29sc30gdG9vbHMgYW5kIHRvb2wgc2V0c2ApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFsuLi5yZXN1bHQxLmVudHJpZXMoKV0uZmlsdGVyKChbXywgZW5hYmxlZF0pID0+IGVuYWJsZWQpLmxlbmd0aCwgNCwgJ0V4cGVjdGVkIDQgdG9vbHMgdG8gYmUgZW5hYmxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuZ2V0KGV4dFRvb2wxKSwgdHJ1ZSwgJ2V4dFRvb2wxIHNob3VsZCBiZSBlbmFibGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5nZXQobWNwVG9vbFNldCksIHRydWUsICdtY3BUb29sU2V0IHNob3VsZCBiZSBlbmFibGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5nZXQobWNwVG9vbDEpLCB0cnVlLCAnbWNwVG9vbDEgc2hvdWxkIGJlIGVuYWJsZWQgYmVjYXVzZSB0aGUgc2V0IGlzIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLmdldChpbnRlcm5hbFRvb2wpLCB0cnVlLCAnaW50ZXJuYWxUb29sIHNob3VsZCBiZSBlbmFibGVkIGJlY2F1c2UgdGhlIHNldCBpcyBlbmFibGVkJyk7XG5cblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lczEgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMxLnNvcnQoKSwgZnVsbFJlZmVyZW5jZU5hbWVzLnNvcnQoKSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIGV4cGVjdGVkIG5hbWVzJyk7XG5cdFx0fVxuXHRcdC8vIFRlc3Qgd2l0aCBhbGwgZW5hYmxlZCB0b29scywgcmVkdW5kYW50IG5hbWVzXG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoYWxsRnVsbFJlZmVyZW5jZU5hbWVzLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuc2l6ZSwgbnVtT2ZUb29scywgYEV4cGVjdGVkICR7bnVtT2ZUb29sc30gdG9vbHMgYW5kIHRvb2wgc2V0c2ApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFsuLi5yZXN1bHQxLmVudHJpZXMoKV0uZmlsdGVyKChbXywgZW5hYmxlZF0pID0+IGVuYWJsZWQpLmxlbmd0aCwgMTIsICdFeHBlY3RlZCAxMiB0b29scyB0byBiZSBlbmFibGVkJyk7IC8vICs0IGluY2x1ZGluZyB0aGUgdnNjb2RlLCBleGVjdXRlLCByZWFkLCBhZ2VudCB0b29sc2V0c1xuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMxID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQxKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkRnVsbFJlZmVyZW5jZU5hbWVzID0gWyd0b29sMVJlZk5hbWUnLCAnVG9vbDIgRGlzcGxheSBOYW1lJywgJ215LmV4dGVuc2lvbi9leHRUb29sMVJlZk5hbWUnLCAnbWNwVG9vbFNldFJlZk5hbWUvKicsICdpbnRlcm5hbFRvb2xTZXRSZWZOYW1lJywgJ3ZzY29kZScsICdleGVjdXRlJywgJ3JlYWQnLCAnYWdlbnQnXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzMS5zb3J0KCksIGV4cGVjdGVkRnVsbFJlZmVyZW5jZU5hbWVzLnNvcnQoKSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIG9yaWdpbmFsIGVuYWJsZWQgbmFtZXMnKTtcblx0XHR9XG5cdFx0Ly8gVGVzdCB3aXRoIG5vIGVuYWJsZWQgdG9vbHNcblx0XHR7XG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCByZXN1bHQxID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChmdWxsUmVmZXJlbmNlTmFtZXMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5zaXplLCBudW1PZlRvb2xzLCBgRXhwZWN0ZWQgJHtudW1PZlRvb2xzfSB0b29scyBhbmQgdG9vbCBzZXRzYCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoWy4uLnJlc3VsdDEuZW50cmllcygpXS5maWx0ZXIoKFtfLCBlbmFibGVkXSkgPT4gZW5hYmxlZCkubGVuZ3RoLCAwLCAnRXhwZWN0ZWQgMCB0b29scyB0byBiZSBlbmFibGVkJyk7XG5cblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lczEgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMxLnNvcnQoKSwgZnVsbFJlZmVyZW5jZU5hbWVzLnNvcnQoKSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIG9yaWdpbmFsIGVuYWJsZWQgbmFtZXMnKTtcblx0XHR9XG5cdFx0Ly8gVGVzdCB3aXRoIHVua25vd24gdG9vbFxuXHRcdHtcblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lczogc3RyaW5nW10gPSBbJ3Vua25vd25Ub29sUmVmTmFtZSddO1xuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoZnVsbFJlZmVyZW5jZU5hbWVzLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuc2l6ZSwgbnVtT2ZUb29scywgYEV4cGVjdGVkICR7bnVtT2ZUb29sc30gdG9vbHMgYW5kIHRvb2wgc2V0c2ApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFsuLi5yZXN1bHQxLmVudHJpZXMoKV0uZmlsdGVyKChbXywgZW5hYmxlZF0pID0+IGVuYWJsZWQpLmxlbmd0aCwgMCwgJ0V4cGVjdGVkIDAgdG9vbHMgdG8gYmUgZW5hYmxlZCcpO1xuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMxID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzMS5zb3J0KCksIFtdLCAndG9GdWxsUmVmZXJlbmNlTmFtZXMgc2hvdWxkIHJldHVybiBubyBlbmFibGVkIG5hbWVzJyk7XG5cdFx0fVxuXHRcdC8vIFRlc3Qgd2l0aCBsZWdhY3kgdG9vbCBuYW1lc1xuXHRcdHtcblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lczogc3RyaW5nW10gPSBbJ2V4dFRvb2wxUmVmTmFtZScsICdtY3BUb29sU2V0UmVmTmFtZScsICdpbnRlcm5hbFRvb2xTZXRUb29sMVJlZk5hbWUnXTtcblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBzZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKGZ1bGxSZWZlcmVuY2VOYW1lcywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLnNpemUsIG51bU9mVG9vbHMsIGBFeHBlY3RlZCAke251bU9mVG9vbHN9IHRvb2xzIGFuZCB0b29sIHNldHNgKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChbLi4ucmVzdWx0MS5lbnRyaWVzKCldLmZpbHRlcigoW18sIGVuYWJsZWRdKSA9PiBlbmFibGVkKS5sZW5ndGgsIDQsICdFeHBlY3RlZCA0IHRvb2xzIHRvIGJlIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLmdldChleHRUb29sMSksIHRydWUsICdleHRUb29sMSBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuZ2V0KG1jcFRvb2xTZXQpLCB0cnVlLCAnbWNwVG9vbFNldCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuZ2V0KG1jcFRvb2wxKSwgdHJ1ZSwgJ21jcFRvb2wxIHNob3VsZCBiZSBlbmFibGVkIGJlY2F1c2UgdGhlIHNldCBpcyBlbmFibGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5nZXQoaW50ZXJuYWxUb29sKSwgdHJ1ZSwgJ2ludGVybmFsVG9vbCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMxID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQxKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkRnVsbFJlZmVyZW5jZU5hbWVzOiBzdHJpbmdbXSA9IFsnbXkuZXh0ZW5zaW9uL2V4dFRvb2wxUmVmTmFtZScsICdtY3BUb29sU2V0UmVmTmFtZS8qJywgJ2ludGVybmFsVG9vbFNldFJlZk5hbWUvaW50ZXJuYWxUb29sU2V0VG9vbDFSZWZOYW1lJ107XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lczEuc29ydCgpLCBleHBlY3RlZEZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksICd0b0Z1bGxSZWZlcmVuY2VOYW1lcyBzaG91bGQgcmV0dXJuIHRoZSBvcmlnaW5hbCBlbmFibGVkIG5hbWVzJyk7XG5cdFx0fVxuXHRcdC8vIFRlc3Qgd2l0aCB0b29sIGluIHVzZXIgdG9vbCBzZXRcblx0XHR7XG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBbJ1Rvb2wyIERpc3BsYXkgTmFtZSddO1xuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoZnVsbFJlZmVyZW5jZU5hbWVzLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuc2l6ZSwgbnVtT2ZUb29scywgYEV4cGVjdGVkICR7bnVtT2ZUb29sc30gdG9vbHMgYW5kIHRvb2wgc2V0c2ApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFsuLi5yZXN1bHQxLmVudHJpZXMoKV0uZmlsdGVyKChbXywgZW5hYmxlZF0pID0+IGVuYWJsZWQpLmxlbmd0aCwgMiwgJ0V4cGVjdGVkIDEgdG9vbCBhbmQgdXNlciB0b29sIHNldCB0byBiZSBlbmFibGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5nZXQodG9vbDIpLCB0cnVlLCAndG9vbDIgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLmdldCh1c2VyVG9vbFNldCksIHRydWUsICd1c2VyVG9vbFNldCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMxID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzMS5zb3J0KCksIGZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksICd0b0Z1bGxSZWZlcmVuY2VOYW1lcyBzaG91bGQgcmV0dXJuIHRoZSBvcmlnaW5hbCBlbmFibGVkIG5hbWVzJyk7XG5cblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3RvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwIHdpdGggZXh0ZW5zaW9uIHRvb2wnLCAoKSA9PiB7XG5cdFx0Ly8gUmVnaXN0ZXIgaW5kaXZpZHVhbCB0b29sc1xuXHRcdGNvbnN0IHRvb2xEYXRhMTogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd0b29sMScsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3JlZlRvb2wxJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCAxJyxcblx0XHRcdHNvdXJjZTogeyB0eXBlOiAnZXh0ZW5zaW9uJywgbGFiZWw6ICdNeSBFeHRlbnNpb24nLCBleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ015LmV4dGVuc2lvbicpIH0sXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YTEpKTtcblxuXHRcdC8vIFRlc3QgZW5hYmxpbmcgdGhlIHRvb2wgc2V0XG5cdFx0Y29uc3QgZW5hYmxlZE5hbWVzID0gW3Rvb2xEYXRhMV0ubWFwKHQgPT4gc2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZSh0KSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChlbmFibGVkTmFtZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCh0b29sRGF0YTEpLCB0cnVlLCAnaW5kaXZpZHVhbCB0b29sIHNob3VsZCBiZSBlbmFibGVkJyk7XG5cblx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMuc29ydCgpLCBlbmFibGVkTmFtZXMuc29ydCgpLCAndG9GdWxsUmVmZXJlbmNlTmFtZXMgc2hvdWxkIHJldHVybiB0aGUgb3JpZ2luYWwgZW5hYmxlZCBuYW1lcycpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCB3aXRoIHRvb2wgc2V0cycsICgpID0+IHtcblx0XHQvLyBSZWdpc3RlciBpbmRpdmlkdWFsIHRvb2xzXG5cdFx0Y29uc3QgdG9vbERhdGExOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rvb2wxJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAncmVmVG9vbDEnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAxJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sIDEnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdH07XG5cblx0XHRjb25zdCB0b29sRGF0YTI6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndG9vbDInLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAyJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sIDInLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xEYXRhMSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGEyKSk7XG5cblx0XHQvLyBDcmVhdGUgYSB0b29sIHNldFxuXHRcdGNvbnN0IHRvb2xTZXQgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHQndGVzdFRvb2xTZXQnLFxuXHRcdFx0J3JlZlRvb2xTZXQnLFxuXHRcdFx0eyBkZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCBTZXQnIH1cblx0XHQpKTtcblxuXHRcdC8vIEFkZCB0b29scyB0byB0aGUgdG9vbCBzZXRcblx0XHRjb25zdCB0b29sU2V0VG9vbDE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndG9vbFNldFRvb2wxJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUb29sIFNldCBUb29sIDEnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUb29sIFNldCBUb29sIDEnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdG9vbFNldFRvb2wyOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rvb2xTZXRUb29sMicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVG9vbCBTZXQgVG9vbCAyJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVG9vbCBTZXQgVG9vbCAyJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbFNldFRvb2wxKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sU2V0VG9vbDIpKTtcblx0XHRzdG9yZS5hZGQodG9vbFNldC5hZGRUb29sKHRvb2xTZXRUb29sMSkpO1xuXHRcdHN0b3JlLmFkZCh0b29sU2V0LmFkZFRvb2wodG9vbFNldFRvb2wyKSk7XG5cblx0XHQvLyBUZXN0IGVuYWJsaW5nIHRoZSB0b29sIHNldFxuXHRcdGNvbnN0IGVuYWJsZWROYW1lcyA9IFt0b29sU2V0LCB0b29sRGF0YTFdLm1hcCh0ID0+IHNlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWUodCkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoZW5hYmxlZE5hbWVzLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbERhdGExKSwgdHJ1ZSwgJ2luZGl2aWR1YWwgdG9vbCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHRvb2xEYXRhMiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCh0b29sU2V0KSwgdHJ1ZSwgJ3Rvb2wgc2V0IHNob3VsZCBiZSBlbmFibGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbFNldFRvb2wxKSwgdHJ1ZSwgJ3Rvb2wgc2V0IHRvb2wgMSBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHRvb2xTZXRUb29sMiksIHRydWUsICd0b29sIHNldCB0b29sIDIgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblxuXHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMocmVzdWx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksIGVuYWJsZWROYW1lcy5zb3J0KCksICd0b0Z1bGxSZWZlcmVuY2VOYW1lcyBzaG91bGQgcmV0dXJuIHRoZSBvcmlnaW5hbCBlbmFibGVkIG5hbWVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIGRvZXMgbm90IGVtaXQgYSB0b29sIHNldCB3aGVuIGEgbWVtYmVyIHRvb2wgaXMgdW5jaGVja2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xTZXQgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHQndGVzdFRvb2xTZXQnLFxuXHRcdFx0J3JlZlRvb2xTZXQnLFxuXHRcdFx0eyBkZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCBTZXQnIH1cblx0XHQpKTtcblxuXHRcdGNvbnN0IHRvb2xTZXRUb29sMTogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd0b29sU2V0VG9vbDEnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0b29sU2V0VG9vbDFSZWYnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rvb2wgU2V0IFRvb2wgMScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1Rvb2wgU2V0IFRvb2wgMScsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRjb25zdCB0b29sU2V0VG9vbDI6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndG9vbFNldFRvb2wyJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndG9vbFNldFRvb2wyUmVmJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUb29sIFNldCBUb29sIDInLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUb29sIFNldCBUb29sIDInLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sU2V0VG9vbDEpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xTZXRUb29sMikpO1xuXHRcdHN0b3JlLmFkZCh0b29sU2V0LmFkZFRvb2wodG9vbFNldFRvb2wxKSk7XG5cdFx0c3RvcmUuYWRkKHRvb2xTZXQuYWRkVG9vbCh0b29sU2V0VG9vbDIpKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoWydyZWZUb29sU2V0JywgJ3Rvb2xTZXRUb29sMVJlZiddLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgZnVsbFJlZmVyZW5jZU5hbWVzID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhzZWxlY3Rpb24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzLCBbc2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZSh0b29sU2V0KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCB3aXRoIG5vbi1leGlzdGVudCB0b29sIG5hbWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rvb2wxJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAncmVmVG9vbDEnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAxJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sIDEnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xEYXRhKSk7XG5cblx0XHRjb25zdCB1bnJlZ2lzdGVyZWRUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd0b29sWCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3JlZlRvb2xYJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgWCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCBYJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0Ly8gVGVzdCB3aXRoIG5vbi1leGlzdGVudCB0b29sIG5hbWVzXG5cdFx0Y29uc3QgZW5hYmxlZE5hbWVzID0gW3Rvb2xEYXRhLCB1bnJlZ2lzdGVyZWRUb29sRGF0YV0ubWFwKHQgPT4gc2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZSh0KSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChlbmFibGVkTmFtZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCh0b29sRGF0YSksIHRydWUsICdleGlzdGluZyB0b29sIHNob3VsZCBiZSBlbmFibGVkJyk7XG5cdFx0Ly8gTm9uLWV4aXN0ZW50IHRvb2xzIHNob3VsZCBub3QgYXBwZWFyIGluIHRoZSByZXN1bHQgbWFwXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodW5yZWdpc3RlcmVkVG9vbERhdGEpLCB1bmRlZmluZWQsICdub24tZXhpc3RlbnQgdG9vbCBzaG91bGQgbm90IGJlIGluIHJlc3VsdCcpO1xuXG5cdFx0Y29uc3QgZnVsbFJlZmVyZW5jZU5hbWVzID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQpO1xuXHRcdGNvbnN0IGV4cGVjdGVkTmFtZXMgPSBbc2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZSh0b29sRGF0YSldOyAvLyBPbmx5IHRoZSBleGlzdGluZyB0b29sXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMuc29ydCgpLCBleHBlY3RlZE5hbWVzLnNvcnQoKSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIG9yaWdpbmFsIGVuYWJsZWQgbmFtZXMnKTtcblxuXHR9KTtcblxuXG5cdHRlc3QoJ3RvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwIHdpdGggbGVnYWN5IG5hbWVzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgdGhhdCBsZWdhY3kgdG9vbCByZWZlcmVuY2UgbmFtZXMgYW5kIGxlZ2FjeSB0b29sc2V0IG5hbWVzIHdvcmsgY29ycmVjdGx5XG5cblx0XHQvLyBDcmVhdGUgYSB0b29sIHdpdGggbGVnYWN5IHJlZmVyZW5jZSBuYW1lc1xuXHRcdGNvbnN0IHRvb2xXaXRoTGVnYWN5OiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ25ld1Rvb2wnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICduZXdUb29sUmVmJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdOZXcgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ05ldyBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnb2xkVG9vbE5hbWUnLCAnZGVwcmVjYXRlZFRvb2xOYW1lJ11cblx0XHR9O1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbFdpdGhMZWdhY3kpKTtcblxuXHRcdC8vIENyZWF0ZSBhIHRvb2wgc2V0IHdpdGggbGVnYWN5IG5hbWVzXG5cdFx0Y29uc3QgdG9vbFNldFdpdGhMZWdhY3kgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHQnbmV3VG9vbFNldCcsXG5cdFx0XHQnbmV3VG9vbFNldFJlZicsXG5cdFx0XHR7IGRlc2NyaXB0aW9uOiAnTmV3IFRvb2wgU2V0JywgbGVnYWN5RnVsbE5hbWVzOiBbJ29sZFRvb2xTZXQnLCAnZGVwcmVjYXRlZFRvb2xTZXQnXSB9XG5cdFx0KSk7XG5cblx0XHQvLyBDcmVhdGUgYSB0b29sIGluIHRoZSB0b29sc2V0XG5cdFx0Y29uc3QgdG9vbEluU2V0OiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rvb2xJblNldCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3Rvb2xJblNldFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVG9vbCBJbiBTZXQnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUb29sIEluIFNldCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sSW5TZXQpKTtcblx0XHRzdG9yZS5hZGQodG9vbFNldFdpdGhMZWdhY3kuYWRkVG9vbCh0b29sSW5TZXQpKTtcblxuXHRcdC8vIFRlc3QgMTogVXNpbmcgbGVnYWN5IHRvb2wgcmVmZXJlbmNlIG5hbWUgc2hvdWxkIGVuYWJsZSB0aGUgdG9vbFxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoWydvbGRUb29sTmFtZSddLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbFdpdGhMZWdhY3kpLCB0cnVlLCAndG9vbCBzaG91bGQgYmUgZW5hYmxlZCB2aWEgbGVnYWN5IG5hbWUnKTtcblxuXHRcdFx0Y29uc3QgZnVsbFJlZmVyZW5jZU5hbWVzID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMsIFsnbmV3VG9vbFJlZiddLCAnc2hvdWxkIHJldHVybiBjdXJyZW50IGZ1bGwgcmVmZXJlbmNlIG5hbWUsIG5vdCBsZWdhY3knKTtcblx0XHR9XG5cblx0XHQvLyBUZXN0IDI6IFVzaW5nIGFub3RoZXIgbGVnYWN5IHRvb2wgcmVmZXJlbmNlIG5hbWUgc2hvdWxkIGFsc28gd29ya1xuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoWydkZXByZWNhdGVkVG9vbE5hbWUnXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHRvb2xXaXRoTGVnYWN5KSwgdHJ1ZSwgJ3Rvb2wgc2hvdWxkIGJlIGVuYWJsZWQgdmlhIGFub3RoZXIgbGVnYWN5IG5hbWUnKTtcblxuXHRcdFx0Y29uc3QgZnVsbFJlZmVyZW5jZU5hbWVzID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMsIFsnbmV3VG9vbFJlZiddLCAnc2hvdWxkIHJldHVybiBjdXJyZW50IGZ1bGwgcmVmZXJlbmNlIG5hbWUsIG5vdCBsZWdhY3knKTtcblx0XHR9XG5cblx0XHQvLyBUZXN0IDM6IFVzaW5nIGxlZ2FjeSB0b29sc2V0IG5hbWUgc2hvdWxkIGVuYWJsZSB0aGUgZW50aXJlIHRvb2xzZXRcblx0XHR7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKFsnb2xkVG9vbFNldCddLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbFNldFdpdGhMZWdhY3kpLCB0cnVlLCAndG9vbHNldCBzaG91bGQgYmUgZW5hYmxlZCB2aWEgbGVnYWN5IG5hbWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHRvb2xJblNldCksIHRydWUsICd0b29sIGluIHNldCBzaG91bGQgYmUgZW5hYmxlZCB3aGVuIHNldCBpcyBlbmFibGVkIHZpYSBsZWdhY3kgbmFtZScpO1xuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcywgWyduZXdUb29sU2V0UmVmJ10sICdzaG91bGQgcmV0dXJuIGN1cnJlbnQgZnVsbCByZWZlcmVuY2UgbmFtZSwgbm90IGxlZ2FjeScpO1xuXHRcdH1cblxuXHRcdC8vIFRlc3QgNDogVXNpbmcgZGVwcmVjYXRlZCB0b29sc2V0IG5hbWUgc2hvdWxkIGFsc28gd29ya1xuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoWydkZXByZWNhdGVkVG9vbFNldCddLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbFNldFdpdGhMZWdhY3kpLCB0cnVlLCAndG9vbHNldCBzaG91bGQgYmUgZW5hYmxlZCB2aWEgYW5vdGhlciBsZWdhY3kgbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbEluU2V0KSwgdHJ1ZSwgJ3Rvb2wgaW4gc2V0IHNob3VsZCBiZSBlbmFibGVkIHdoZW4gc2V0IGlzIGVuYWJsZWQgdmlhIGxlZ2FjeSBuYW1lJyk7XG5cblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMocmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzLCBbJ25ld1Rvb2xTZXRSZWYnXSwgJ3Nob3VsZCByZXR1cm4gY3VycmVudCBmdWxsIHJlZmVyZW5jZSBuYW1lLCBub3QgbGVnYWN5Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVzdCA1OiBNaXggb2YgY3VycmVudCBhbmQgbGVnYWN5IG5hbWVzXG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChbJ25ld1Rvb2xSZWYnLCAnb2xkVG9vbFNldCddLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbFdpdGhMZWdhY3kpLCB0cnVlLCAndG9vbCBzaG91bGQgYmUgZW5hYmxlZCB2aWEgY3VycmVudCBuYW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCh0b29sU2V0V2l0aExlZ2FjeSksIHRydWUsICd0b29sc2V0IHNob3VsZCBiZSBlbmFibGVkIHZpYSBsZWdhY3kgbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbEluU2V0KSwgdHJ1ZSwgJ3Rvb2wgaW4gc2V0IHNob3VsZCBiZSBlbmFibGVkJyk7XG5cblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMocmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzLnNvcnQoKSwgWyduZXdUb29sUmVmJywgJ25ld1Rvb2xTZXRSZWYnXS5zb3J0KCksICdzaG91bGQgcmV0dXJuIGN1cnJlbnQgZnVsbCByZWZlcmVuY2UgbmFtZXMnKTtcblx0XHR9XG5cblx0XHQvLyBUZXN0IDY6IFVzaW5nIGxlZ2FjeSBuYW1lcyBhbmQgY3VycmVudCBuYW1lcyB0b2dldGhlciAocmVkdW5kYW50IGJ1dCBzaG91bGQgd29yaylcblx0XHR7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKFsnbmV3VG9vbFJlZicsICdvbGRUb29sTmFtZScsICdkZXByZWNhdGVkVG9vbE5hbWUnXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHRvb2xXaXRoTGVnYWN5KSwgdHJ1ZSwgJ3Rvb2wgc2hvdWxkIGJlIGVuYWJsZWQgKHJlZHVuZGFudCBsZWdhY3kgbmFtZXMgc2hvdWxkIG5vdCBjYXVzZSBpc3N1ZXMpJyk7XG5cblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMocmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzLCBbJ25ld1Rvb2xSZWYnXSwgJ3Nob3VsZCByZXR1cm4gc2luZ2xlIGN1cnJlbnQgZnVsbCByZWZlcmVuY2UgbmFtZScpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAgd2l0aCBvcnBoYW5lZCB0b29sc2V0IGluIGxlZ2FjeSBuYW1lcycsICgpID0+IHtcblx0XHQvLyBUZXN0IHRoYXQgd2hlbiBhIHRvb2wgaGFzIGEgbGVnYWN5IG5hbWUgd2l0aCBhIHRvb2xzZXQgcHJlZml4LCBidXQgdGhhdCB0b29sc2V0IG5vIGxvbmdlciBleGlzdHMsXG5cdFx0Ly8gd2UgY2FuIGVuYWJsZSB0aGUgdG9vbCBieSBlaXRoZXIgdGhlIGZ1bGwgbGVnYWN5IG5hbWUgT1IganVzdCB0aGUgb3JwaGFuZWQgdG9vbHNldCBuYW1lXG5cblx0XHQvLyBDcmVhdGUgYSB0b29sIHRoYXQgdXNlZCB0byBiZSBpbiAnb2xkVG9vbFNldC9vbGRUb29sTmFtZScgYnV0IG5vdyBpcyBqdXN0ICduZXdUb29sUmVmJ1xuXHRcdGNvbnN0IHRvb2xXaXRoT3JwaGFuZWRUb29sU2V0OiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ21pZ3JhdGVkVG9vbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ25ld1Rvb2xSZWYnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ01pZ3JhdGVkIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdNaWdyYXRlZCBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnb2xkVG9vbFNldC9vbGRUb29sTmFtZSddXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xXaXRoT3JwaGFuZWRUb29sU2V0KSk7XG5cblx0XHQvLyBUZXN0IDE6IFVzaW5nIHRoZSBmdWxsIGxlZ2FjeSBuYW1lIHNob3VsZCBlbmFibGUgdGhlIHRvb2xcblx0XHR7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKFsnb2xkVG9vbFNldC9vbGRUb29sTmFtZSddLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbFdpdGhPcnBoYW5lZFRvb2xTZXQpLCB0cnVlLCAndG9vbCBzaG91bGQgYmUgZW5hYmxlZCB2aWEgZnVsbCBsZWdhY3kgbmFtZScpO1xuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcywgWyduZXdUb29sUmVmJ10sICdzaG91bGQgcmV0dXJuIGN1cnJlbnQgZnVsbCByZWZlcmVuY2UgbmFtZScpO1xuXHRcdH1cblxuXHRcdC8vIFRlc3QgMjogVXNpbmcganVzdCB0aGUgb3JwaGFuZWQgdG9vbHNldCBuYW1lIHNob3VsZCBhbHNvIGVuYWJsZSB0aGUgdG9vbFxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoWydvbGRUb29sU2V0J10sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCh0b29sV2l0aE9ycGhhbmVkVG9vbFNldCksIHRydWUsICd0b29sIHNob3VsZCBiZSBlbmFibGVkIHZpYSBvcnBoYW5lZCB0b29sc2V0IG5hbWUnKTtcblxuXHRcdFx0Y29uc3QgZnVsbFJlZmVyZW5jZU5hbWVzID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMsIFsnbmV3VG9vbFJlZiddLCAnc2hvdWxkIHJldHVybiBjdXJyZW50IGZ1bGwgcmVmZXJlbmNlIG5hbWUnKTtcblx0XHR9XG5cblx0XHQvLyBUZXN0IDM6IE11bHRpcGxlIHRvb2xzIGZyb20gdGhlIHNhbWUgb3JwaGFuZWQgdG9vbHNldFxuXHRcdGNvbnN0IGFub3RoZXJUb29sRnJvbU9ycGhhbmVkU2V0OiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2Fub3RoZXJNaWdyYXRlZFRvb2wnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdhbm90aGVyTmV3VG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQW5vdGhlciBNaWdyYXRlZCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnQW5vdGhlciBNaWdyYXRlZCBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnb2xkVG9vbFNldC9hbm90aGVyT2xkVG9vbE5hbWUnXVxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShhbm90aGVyVG9vbEZyb21PcnBoYW5lZFNldCkpO1xuXG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChbJ29sZFRvb2xTZXQnXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHRvb2xXaXRoT3JwaGFuZWRUb29sU2V0KSwgdHJ1ZSwgJ2ZpcnN0IHRvb2wgc2hvdWxkIGJlIGVuYWJsZWQgdmlhIG9ycGhhbmVkIHRvb2xzZXQgbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoYW5vdGhlclRvb2xGcm9tT3JwaGFuZWRTZXQpLCB0cnVlLCAnc2Vjb25kIHRvb2wgc2hvdWxkIGFsc28gYmUgZW5hYmxlZCB2aWEgb3JwaGFuZWQgdG9vbHNldCBuYW1lJyk7XG5cblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMocmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzLnNvcnQoKSwgWyduZXdUb29sUmVmJywgJ2Fub3RoZXJOZXdUb29sUmVmJ10uc29ydCgpLCAnc2hvdWxkIHJldHVybiBib3RoIGN1cnJlbnQgZnVsbCByZWZlcmVuY2UgbmFtZXMnKTtcblx0XHR9XG5cblx0XHQvLyBUZXN0IDQ6IE9ycGhhbmVkIHRvb2xzZXQgbmFtZSBzaG91bGQgTk9UIGVuYWJsZSB0b29scyB0aGF0IHdlcmVuJ3QgaW4gdGhhdCB0b29sc2V0XG5cdFx0Y29uc3QgdW5yZWxhdGVkVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd1bnJlbGF0ZWRUb29sJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndW5yZWxhdGVkVG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVW5yZWxhdGVkIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdVbnJlbGF0ZWQgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ2RpZmZlcmVudFRvb2xTZXQvb2xkTmFtZSddXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHVucmVsYXRlZFRvb2wpKTtcblxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoWydvbGRUb29sU2V0J10sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCh0b29sV2l0aE9ycGhhbmVkVG9vbFNldCksIHRydWUsICd0b29sIGZyb20gb2xkVG9vbFNldCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoYW5vdGhlclRvb2xGcm9tT3JwaGFuZWRTZXQpLCB0cnVlLCAnYW5vdGhlciB0b29sIGZyb20gb2xkVG9vbFNldCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodW5yZWxhdGVkVG9vbCksIGZhbHNlLCAndG9vbCBmcm9tIGRpZmZlcmVudCB0b29sc2V0IHNob3VsZCBOT1QgYmUgZW5hYmxlZCcpO1xuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksIFsnbmV3VG9vbFJlZicsICdhbm90aGVyTmV3VG9vbFJlZiddLnNvcnQoKSwgJ3Nob3VsZCBvbmx5IHJldHVybiB0b29scyBmcm9tIG9sZFRvb2xTZXQnKTtcblx0XHR9XG5cblx0XHQvLyBUZXN0IDU6IElmIGEgdG9vbHNldCB3aXRoIHRoZSBzYW1lIG5hbWUgZXhpc3RzLCBpdCBzaG91bGQgdGFrZSBwcmVjZWRlbmNlIG92ZXIgb3JwaGFuZWQgdG9vbHNldCBtYXBwaW5nXG5cdFx0Y29uc3QgbmV3VG9vbFNldFdpdGhTYW1lTmFtZSA9IHN0b3JlLmFkZChzZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdCdyZWNyZWF0ZWRUb29sU2V0Jyxcblx0XHRcdCdvbGRUb29sU2V0JywgIC8vIFNhbWUgbmFtZSBhcyB0aGUgb3JwaGFuZWQgdG9vbHNldFxuXHRcdFx0eyBkZXNjcmlwdGlvbjogJ1JlY3JlYXRlZCBUb29sIFNldCcgfVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgdG9vbEluUmVjcmVhdGVkU2V0OiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rvb2xJblJlY3JlYXRlZFNldCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3Rvb2xJblJlY3JlYXRlZFNldFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVG9vbCBJbiBSZWNyZWF0ZWQgU2V0Jyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVG9vbCBJbiBSZWNyZWF0ZWQgU2V0Jyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xJblJlY3JlYXRlZFNldCkpO1xuXHRcdHN0b3JlLmFkZChuZXdUb29sU2V0V2l0aFNhbWVOYW1lLmFkZFRvb2wodG9vbEluUmVjcmVhdGVkU2V0KSk7XG5cblx0XHR7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKFsnb2xkVG9vbFNldCddLCB1bmRlZmluZWQpO1xuXHRcdFx0Ly8gTm93ICdvbGRUb29sU2V0JyBzaG91bGQgZW5hYmxlIEJPVEggdGhlIHJlY3JlYXRlZCB0b29sc2V0IEFORCB0aGUgdG9vbHMgd2l0aCBsZWdhY3kgbmFtZXMgcG9pbnRpbmcgdG8gb2xkVG9vbFNldFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQobmV3VG9vbFNldFdpdGhTYW1lTmFtZSksIHRydWUsICdyZWNyZWF0ZWQgdG9vbHNldCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbEluUmVjcmVhdGVkU2V0KSwgdHJ1ZSwgJ3Rvb2wgaW4gcmVjcmVhdGVkIHNldCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdFx0Ly8gVGhlIHRvb2xzIHdpdGggbGVnYWN5IHRvb2xzZXQgbmFtZXMgc2hvdWxkIEFMU08gYmUgZW5hYmxlZCBiZWNhdXNlIHRoZWlyIGxlZ2FjeSBuYW1lcyBtYXRjaFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQodG9vbFdpdGhPcnBoYW5lZFRvb2xTZXQpLCB0cnVlLCAndG9vbCB3aXRoIGxlZ2FjeSB0b29sc2V0IHNob3VsZCBzdGlsbCBiZSBlbmFibGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldChhbm90aGVyVG9vbEZyb21PcnBoYW5lZFNldCksIHRydWUsICdhbm90aGVyIHRvb2wgd2l0aCBsZWdhY3kgdG9vbHNldCBzaG91bGQgc3RpbGwgYmUgZW5hYmxlZCcpO1xuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdCk7XG5cdFx0XHQvLyBTaG91bGQgcmV0dXJuIHRoZSB0b29sc2V0IG5hbWUgcGx1cyB0aGUgaW5kaXZpZHVhbCB0b29scyB0aGF0IHdlcmUgZW5hYmxlZCB2aWEgbGVnYWN5IG5hbWVzXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksIFsnb2xkVG9vbFNldCcsICduZXdUb29sUmVmJywgJ2Fub3RoZXJOZXdUb29sUmVmJ10uc29ydCgpLCAnc2hvdWxkIHJldHVybiB0b29sc2V0IGFuZCBpbmRpdmlkdWFsIHRvb2xzJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd0b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCBtYXAgR2l0aHViIHRvIFZTQ29kZSB0b29scycsICgpID0+IHtcblx0XHRjb25zdCBydW5JblRlcm1pbmFsVG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAncnVuSW5UZXJtaW5hbElkJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAncnVuSW5UZXJtaW5hbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAncnVuSW5UZXJtaW5hbCBEZXNjcmlwdGlvbicsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ3J1bkluVGVybWluYWwgZGlzcGxheU5hbWUnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiBmYWxzZSxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShydW5JblRlcm1pbmFsVG9vbERhdGEpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5leGVjdXRlVG9vbFNldC5hZGRUb29sKHJ1bkluVGVybWluYWxUb29sRGF0YSkpO1xuXG5cblx0XHRjb25zdCBydW5TdWJhZ2VudFRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3J1blN1YmFnZW50SWQnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdydW5TdWJhZ2VudCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAncnVuU3ViYWdlbnQgRGVzY3JpcHRpb24nLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdydW5TdWJhZ2VudCBkaXNwbGF5TmFtZScsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHJ1blN1YmFnZW50VG9vbERhdGEpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5hZ2VudFRvb2xTZXQuYWRkVG9vbChydW5TdWJhZ2VudFRvb2xEYXRhKSk7XG5cblx0XHRjb25zdCBnaXRodWJNY3BEYXRhU291cmNlOiBUb29sRGF0YVNvdXJjZSA9IHsgdHlwZTogJ21jcCcsIGxhYmVsOiAnR2l0aHViJywgc2VydmVyTGFiZWw6ICdHaXRodWIgTUNQIFNlcnZlcicsIGluc3RydWN0aW9uczogdW5kZWZpbmVkLCBjb2xsZWN0aW9uSWQ6ICdnaXRodWJNQ1BDb2xsZWN0aW9uJywgZGVmaW5pdGlvbklkOiAnZ2l0aHViTUNQRGVmSWQnIH07XG5cdFx0Y29uc3QgZ2l0aHViTWNwVG9vbDE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnY3JlYXRlX2JyYW5jaCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2NyZWF0ZV9icmFuY2gnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgR2l0aHViIE1DUCBUb29sIDEnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdDcmVhdGUgQnJhbmNoJyxcblx0XHRcdHNvdXJjZTogZ2l0aHViTWNwRGF0YVNvdXJjZSxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShnaXRodWJNY3BUb29sMSkpO1xuXG5cdFx0Y29uc3QgZ2l0aHViTWNwVG9vbFNldCA9IHN0b3JlLmFkZChzZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRnaXRodWJNY3BEYXRhU291cmNlLFxuXHRcdFx0J2dpdGh1Yk1jcFRvb2xTZXQnLFxuXHRcdFx0J2dpdGh1Yi9naXRodWItbWNwLXNlcnZlcicsXG5cdFx0XHR7IGRlc2NyaXB0aW9uOiAnR2l0aHViIE1DUCBUZXN0IFRvb2xTZXQnIH1cblx0XHQpKTtcblx0XHRzdG9yZS5hZGQoZ2l0aHViTWNwVG9vbFNldC5hZGRUb29sKGdpdGh1Yk1jcFRvb2wxKSk7XG5cblx0XHRhc3NlcnQuZXF1YWwoZ2l0aHViTWNwVG9vbFNldC5yZWZlcmVuY2VOYW1lLCAnZ2l0aHViJywgJ2dpdGh1Yi9naXRodWItbWNwLXNlcnZlciB3aWxsIGJlIG5vcm1hbGl6ZWQgdG8gZ2l0aHViJyk7XG5cblx0XHRjb25zdCBwbGF5d3JpZ2h0TWNwRGF0YVNvdXJjZTogVG9vbERhdGFTb3VyY2UgPSB7IHR5cGU6ICdtY3AnLCBsYWJlbDogJ3BsYXl3cmlnaHQnLCBzZXJ2ZXJMYWJlbDogJ3BsYXl3cmlnaHQgTUNQIFNlcnZlcicsIGluc3RydWN0aW9uczogdW5kZWZpbmVkLCBjb2xsZWN0aW9uSWQ6ICdwbGF5d3JpZ2h0TUNQQ29sbGVjdGlvbicsIGRlZmluaXRpb25JZDogJ3BsYXl3cmlnaHRNQ1BEZWZJZCcgfTtcblx0XHRjb25zdCBwbGF5d3JpZ2h0TWNwVG9vbDE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnYnJvd3Nlcl9jbGljaycsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2Jyb3dzZXJfY2xpY2snLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgcGxheXdyaWdodCBNQ1AgVG9vbCAxJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnQ3JlYXRlIEJyYW5jaCcsXG5cdFx0XHRzb3VyY2U6IHBsYXl3cmlnaHRNY3BEYXRhU291cmNlLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHBsYXl3cmlnaHRNY3BUb29sMSkpO1xuXG5cdFx0Y29uc3QgcGxheXdyaWdodE1jcFRvb2xTZXQgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0cGxheXdyaWdodE1jcERhdGFTb3VyY2UsXG5cdFx0XHQncGxheXdyaWdodE1jcFRvb2xTZXQnLFxuXHRcdFx0J21pY3Jvc29mdC9wbGF5d3JpZ2h0LW1jcCcsXG5cdFx0XHR7IGRlc2NyaXB0aW9uOiAncGxheXdyaWdodCBNQ1AgVGVzdCBUb29sU2V0JyB9XG5cdFx0KSk7XG5cdFx0c3RvcmUuYWRkKHBsYXl3cmlnaHRNY3BUb29sU2V0LmFkZFRvb2wocGxheXdyaWdodE1jcFRvb2wxKSk7XG5cblx0XHRjb25zdCBkZXByZWNhdGVkID0gc2VydmljZS5nZXREZXByZWNhdGVkRnVsbFJlZmVyZW5jZU5hbWVzKCk7XG5cdFx0Y29uc3QgZGVwcmVjYXRlc1RvID0gKGtleTogc3RyaW5nKTogc3RyaW5nW10gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWVzID0gZGVwcmVjYXRlZC5nZXQoa2V5KTtcblx0XHRcdHJldHVybiB2YWx1ZXMgPyBBcnJheS5mcm9tKHZhbHVlcykuc29ydCgpIDogdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRhc3NlcnQuZXF1YWwocGxheXdyaWdodE1jcFRvb2xTZXQucmVmZXJlbmNlTmFtZSwgJ3BsYXl3cmlnaHQnLCAnbWljcm9zb2Z0L3BsYXl3cmlnaHQtbWNwIHdpbGwgYmUgbm9ybWFsaXplZCB0byBwbGF5d3JpZ2h0Jyk7XG5cblx0XHR7XG5cdFx0XHRjb25zdCB0b29sTmFtZXMgPSBbJ2N1c3RvbS1hZ2VudCcsICdzaGVsbCddO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCh0b29sTmFtZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHNlcnZpY2UuZXhlY3V0ZVRvb2xTZXQpLCB0cnVlLCAnZXhlY3V0ZSBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoc2VydmljZS5hZ2VudFRvb2xTZXQpLCB0cnVlLCAnYWdlbnQgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblxuXHRcdFx0Y29uc3QgZnVsbFJlZmVyZW5jZU5hbWVzID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQpLnNvcnQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzLCBbU3BlY2VkVG9vbEFsaWFzZXMuYWdlbnQsIFNwZWNlZFRvb2xBbGlhc2VzLmV4ZWN1dGVdLnNvcnQoKSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIFZTIENvZGUgdG9vbCBuYW1lcycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xOYW1lcy5tYXAobmFtZSA9PiBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKG5hbWUpKSwgW3NlcnZpY2UuYWdlbnRUb29sU2V0LCBzZXJ2aWNlLmV4ZWN1dGVUb29sU2V0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVwcmVjYXRlc1RvKCdjdXN0b20tYWdlbnQnKSwgW1NwZWNlZFRvb2xBbGlhc2VzLmFnZW50XSwgJ2N1c3RvbUFnZW50IHNob3VsZCBtYXAgdG8gYWdlbnQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVwcmVjYXRlc1RvKCdzaGVsbCcpLCBbU3BlY2VkVG9vbEFsaWFzZXMuZXhlY3V0ZV0sICdzaGVsbCBpcyBub3cgZXhlY3V0ZScpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCB0b29sTmFtZXMgPSBbJ2dpdGh1Yi8qJywgJ3BsYXl3cmlnaHQvKiddO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCh0b29sTmFtZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KGdpdGh1Yk1jcFRvb2xTZXQpLCB0cnVlLCAnZ2l0aHViTWNwVG9vbFNldCBzaG91bGQgYmUgZW5hYmxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQocGxheXdyaWdodE1jcFRvb2xTZXQpLCB0cnVlLCAncGxheXdyaWdodE1jcFRvb2xTZXQgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMocmVzdWx0KS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcywgWydnaXRodWIvKicsICdwbGF5d3JpZ2h0LyonXSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIFZTIENvZGUgdG9vbCBuYW1lcycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xOYW1lcy5tYXAobmFtZSA9PiBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKG5hbWUpKSwgW2dpdGh1Yk1jcFRvb2xTZXQsIHBsYXl3cmlnaHRNY3BUb29sU2V0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVwcmVjYXRlc1RvKCdnaXRodWIvKicpLCB1bmRlZmluZWQsICdnaXRodWIvKiBpcyBmaW5lJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlcHJlY2F0ZXNUbygncGxheXdyaWdodC8qJyksIHVuZGVmaW5lZCwgJ3BsYXl3cmlnaHQvKiBpcyBmaW5lJyk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Ly8gdGhlIHNwZWNlZCBuYW1lcyBzaG91bGQgd29yayBhbmQgbm90IGJlIGFsdGVyZWRcblx0XHRcdGNvbnN0IHRvb2xOYW1lcyA9IFsnZ2l0aHViL2NyZWF0ZV9icmFuY2gnLCAncGxheXdyaWdodC9icm93c2VyX2NsaWNrJ107XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKHRvb2xOYW1lcywgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoZ2l0aHViTWNwVG9vbDEpLCB0cnVlLCAnZ2l0aHViTWNwVG9vbDEgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHBsYXl3cmlnaHRNY3BUb29sMSksIHRydWUsICdwbGF5d3JpZ2h0TWNwVG9vbDEgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMocmVzdWx0KS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcywgWydnaXRodWIvY3JlYXRlX2JyYW5jaCcsICdwbGF5d3JpZ2h0L2Jyb3dzZXJfY2xpY2snXSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIHNwZWNlZCBuYW1lcycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xOYW1lcy5tYXAobmFtZSA9PiBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKG5hbWUpKSwgW2dpdGh1Yk1jcFRvb2wxLCBwbGF5d3JpZ2h0TWNwVG9vbDFdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXByZWNhdGVzVG8oJ2dpdGh1Yi9jcmVhdGVfYnJhbmNoJyksIHVuZGVmaW5lZCwgJ2dpdGh1Yi9jcmVhdGVfYnJhbmNoIGlzIGZpbmUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVwcmVjYXRlc1RvKCdwbGF5d3JpZ2h0L2Jyb3dzZXJfY2xpY2snKSwgdW5kZWZpbmVkLCAncGxheXdyaWdodC9icm93c2VyX2NsaWNrIGlzIGZpbmUnKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHQvLyB1c2luZyB0aGUgb2xkIE1DUCBmdWxsIG5hbWVzIHNob3VsZCBhbHNvIHdvcmtcblx0XHRcdGNvbnN0IHRvb2xOYW1lcyA9IFsnZ2l0aHViL2dpdGh1Yi1tY3Atc2VydmVyLyonLCAnbWljcm9zb2Z0L3BsYXl3cmlnaHQtbWNwLyonXTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAodG9vbE5hbWVzLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldChnaXRodWJNY3BUb29sU2V0KSwgdHJ1ZSwgJ2dpdGh1Yk1jcFRvb2xTZXQgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHBsYXl3cmlnaHRNY3BUb29sU2V0KSwgdHJ1ZSwgJ3BsYXl3cmlnaHRNY3BUb29sU2V0IHNob3VsZCBiZSBlbmFibGVkJyk7XG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdCkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMsIFsnZ2l0aHViLyonLCAncGxheXdyaWdodC8qJ10sICd0b0Z1bGxSZWZlcmVuY2VOYW1lcyBzaG91bGQgcmV0dXJuIHRoZSBzcGVjZWQgbmFtZXMnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29sTmFtZXMubWFwKG5hbWUgPT4gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZShuYW1lKSksIFtnaXRodWJNY3BUb29sU2V0LCBwbGF5d3JpZ2h0TWNwVG9vbFNldF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlcHJlY2F0ZXNUbygnZ2l0aHViL2dpdGh1Yi1tY3Atc2VydmVyLyonKSwgWydnaXRodWIvKiddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVwcmVjYXRlc1RvKCdtaWNyb3NvZnQvcGxheXdyaWdodC1tY3AvKicpLCBbJ3BsYXl3cmlnaHQvKiddKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Ly8gdXNpbmcgdGhlIG9sZCBNQ1AgZnVsbCBuYW1lcyBzaG91bGQgYWxzbyB3b3JrXG5cdFx0XHRjb25zdCB0b29sTmFtZXMgPSBbJ2dpdGh1Yi9naXRodWItbWNwLXNlcnZlci9jcmVhdGVfYnJhbmNoJywgJ21pY3Jvc29mdC9wbGF5d3JpZ2h0LW1jcC9icm93c2VyX2NsaWNrJ107XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKHRvb2xOYW1lcywgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoZ2l0aHViTWNwVG9vbDEpLCB0cnVlLCAnZ2l0aHViTWNwVG9vbDEgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHBsYXl3cmlnaHRNY3BUb29sMSksIHRydWUsICdwbGF5d3JpZ2h0TWNwVG9vbDEgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMocmVzdWx0KS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcywgWydnaXRodWIvY3JlYXRlX2JyYW5jaCcsICdwbGF5d3JpZ2h0L2Jyb3dzZXJfY2xpY2snXSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIHNwZWNlZCBuYW1lcycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xOYW1lcy5tYXAobmFtZSA9PiBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKG5hbWUpKSwgW2dpdGh1Yk1jcFRvb2wxLCBwbGF5d3JpZ2h0TWNwVG9vbDFdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXByZWNhdGVzVG8oJ2dpdGh1Yi9naXRodWItbWNwLXNlcnZlci9jcmVhdGVfYnJhbmNoJyksIFsnZ2l0aHViL2NyZWF0ZV9icmFuY2gnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlcHJlY2F0ZXNUbygnbWljcm9zb2Z0L3BsYXl3cmlnaHQtbWNwL2Jyb3dzZXJfY2xpY2snKSwgWydwbGF5d3JpZ2h0L2Jyb3dzZXJfY2xpY2snXSk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Ly8gdXNpbmcgdGhlIGxhdGVzdCBNQ1AgZnVsbCBuYW1lcyBzaG91bGQgYWxzbyB3b3JrXG5cdFx0XHRjb25zdCB0b29sTmFtZXMgPSBbJ2lvLmdpdGh1Yi5naXRodWIvZ2l0aHViLW1jcC1zZXJ2ZXIvKicsICdjb20ubWljcm9zb2Z0L3BsYXl3cmlnaHQtbWNwLyonXTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAodG9vbE5hbWVzLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldChnaXRodWJNY3BUb29sU2V0KSwgdHJ1ZSwgJ2dpdGh1Yk1jcFRvb2xTZXQgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHBsYXl3cmlnaHRNY3BUb29sU2V0KSwgdHJ1ZSwgJ3BsYXl3cmlnaHRNY3BUb29sU2V0IHNob3VsZCBiZSBlbmFibGVkJyk7XG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdCkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMsIFsnZ2l0aHViLyonLCAncGxheXdyaWdodC8qJ10sICd0b0Z1bGxSZWZlcmVuY2VOYW1lcyBzaG91bGQgcmV0dXJuIHRoZSBzcGVjZWQgbmFtZXMnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29sTmFtZXMubWFwKG5hbWUgPT4gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZShuYW1lKSksIFtnaXRodWJNY3BUb29sU2V0LCBwbGF5d3JpZ2h0TWNwVG9vbFNldF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlcHJlY2F0ZXNUbygnaW8uZ2l0aHViLmdpdGh1Yi9naXRodWItbWNwLXNlcnZlci8qJyksIFsnZ2l0aHViLyonXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlcHJlY2F0ZXNUbygnY29tLm1pY3Jvc29mdC9wbGF5d3JpZ2h0LW1jcC8qJyksIFsncGxheXdyaWdodC8qJ10pO1xuXHRcdH1cblxuXHRcdHtcblx0XHRcdC8vIHVzaW5nIHRoZSBsYXRlc3QgTUNQIGZ1bGwgbmFtZXMgc2hvdWxkIGFsc28gd29ya1xuXHRcdFx0Y29uc3QgdG9vbE5hbWVzID0gWydpby5naXRodWIuZ2l0aHViL2dpdGh1Yi1tY3Atc2VydmVyL2NyZWF0ZV9icmFuY2gnLCAnY29tLm1pY3Jvc29mdC9wbGF5d3JpZ2h0LW1jcC9icm93c2VyX2NsaWNrJ107XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKHRvb2xOYW1lcywgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoZ2l0aHViTWNwVG9vbDEpLCB0cnVlLCAnZ2l0aHViTWNwVG9vbDEgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KHBsYXl3cmlnaHRNY3BUb29sMSksIHRydWUsICdwbGF5d3JpZ2h0TWNwVG9vbDEgc2hvdWxkIGJlIGVuYWJsZWQnKTtcblx0XHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IHNlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMocmVzdWx0KS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcywgWydnaXRodWIvY3JlYXRlX2JyYW5jaCcsICdwbGF5d3JpZ2h0L2Jyb3dzZXJfY2xpY2snXSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIHNwZWNlZCBuYW1lcycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xOYW1lcy5tYXAobmFtZSA9PiBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKG5hbWUpKSwgW2dpdGh1Yk1jcFRvb2wxLCBwbGF5d3JpZ2h0TWNwVG9vbDFdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXByZWNhdGVzVG8oJ2lvLmdpdGh1Yi5naXRodWIvZ2l0aHViLW1jcC1zZXJ2ZXIvY3JlYXRlX2JyYW5jaCcpLCBbJ2dpdGh1Yi9jcmVhdGVfYnJhbmNoJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXByZWNhdGVzVG8oJ2NvbS5taWNyb3NvZnQvcGxheXdyaWdodC1tY3AvYnJvd3Nlcl9jbGljaycpLCBbJ3BsYXl3cmlnaHQvYnJvd3Nlcl9jbGljayddKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHQvLyB1c2luZyB0aGUgb2xkIE1DUCBmdWxsIG5hbWVzIHNob3VsZCBhbHNvIHdvcmtcblx0XHRcdGNvbnN0IHRvb2xOYW1lcyA9IFsnZ2l0aHViLW1jcC1zZXJ2ZXIvY3JlYXRlX2JyYW5jaCddO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCh0b29sTmFtZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KGdpdGh1Yk1jcFRvb2wxKSwgdHJ1ZSwgJ2dpdGh1Yk1jcFRvb2wxIHNob3VsZCBiZSBlbmFibGVkJyk7XG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdCkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMsIFsnZ2l0aHViL2NyZWF0ZV9icmFuY2gnXSwgJ3RvRnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gdGhlIFZTIENvZGUgdG9vbCBuYW1lcycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xOYW1lcy5tYXAobmFtZSA9PiBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKG5hbWUpKSwgW2dpdGh1Yk1jcFRvb2wxXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVwcmVjYXRlc1RvKCdnaXRodWItbWNwLXNlcnZlci9jcmVhdGVfYnJhbmNoJyksIFsnZ2l0aHViL2NyZWF0ZV9icmFuY2gnXSk7XG5cdFx0fVxuXG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2Vzc2liaWxpdHkgc2lnbmFsIGZvciB0b29sIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBDcmVhdGUgYSB0ZXN0IGFjY2Vzc2liaWxpdHkgc2VydmljZSB0aGF0IHNpbXVsYXRlcyBzY3JlZW4gcmVhZGVyIGJlaW5nIGVuYWJsZWRcblx0XHRjb25zdCB0ZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdFx0fSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgdGVzdCBhY2Nlc3NpYmlsaXR5IHNpZ25hbCBzZXJ2aWNlIHRoYXQgdHJhY2tzIGNhbGxzXG5cdFx0Y29uc3QgdGVzdEFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gbmV3IFRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgeyBzZXJ2aWNlOiB0ZXN0U2VydmljZSwgY2hhdFNlcnZpY2U6IHRlc3RDaGF0U2VydmljZSB9ID0gY3JlYXRlVGVzdFRvb2xzU2VydmljZShzdG9yZSwge1xuXHRcdFx0YWNjZXNzaWJpbGl0eVNlcnZpY2U6IHRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiB0ZXN0QWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmVTZXJ2aWNlczogY29uZmlnID0+IHtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScsIGZhbHNlKTtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCcsIHsgc291bmQ6ICdhdXRvJywgYW5ub3VuY2VtZW50OiAnYXV0bycgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0b29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd0ZXN0QWNjZXNzaWJpbGl0eVRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgQWNjZXNzaWJpbGl0eSBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBBY2Nlc3NpYmlsaXR5IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCB0b29sRGF0YS5pZCwge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoeyBjb25maXJtYXRpb25NZXNzYWdlczogeyB0aXRsZTogJ0FjY2Vzc2liaWxpdHkgVGVzdCcsIG1lc3NhZ2U6ICdUZXN0aW5nIGFjY2Vzc2liaWxpdHkgc2lnbmFsJyB9IH0pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnZXhlY3V0ZWQnIH1dIH0pLFxuXHRcdH0sIHRvb2xEYXRhKTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdzZXNzaW9uSWQtYWNjZXNzaWJpbGl0eSc7XG5cdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogYW55IH0gPSB7fTtcblx0XHRzdHViR2V0U2Vzc2lvbih0ZXN0Q2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXF1ZXN0SWQtYWNjZXNzaWJpbGl0eScsIGNhcHR1cmUgfSk7XG5cblx0XHRjb25zdCBkdG8gPSB0b29sLm1ha2VEdG8oeyBwYXJhbTogJ3ZhbHVlJyB9LCB7IHNlc3Npb25JZCB9KTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSB0ZXN0U2VydmljZS5pbnZva2VUb29sKGR0bywgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcHVibGlzaGVkID0gYXdhaXQgd2FpdEZvclB1Ymxpc2hlZEludm9jYXRpb24oY2FwdHVyZSk7XG5cblx0XHRhc3NlcnQub2socHVibGlzaGVkLCAnZXhwZWN0ZWQgQ2hhdFRvb2xJbnZvY2F0aW9uIHRvIGJlIHB1Ymxpc2hlZCcpO1xuXHRcdGFzc2VydC5vayhwdWJsaXNoZWQuY29uZmlybWF0aW9uTWVzc2FnZXMsICdzaG91bGQgaGF2ZSBjb25maXJtYXRpb24gbWVzc2FnZXMnKTtcblxuXHRcdC8vIFRoZSBhY2Nlc3NpYmlsaXR5IHNpZ25hbCBzaG91bGQgaGF2ZSBiZWVuIHBsYXllZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2Uuc2lnbmFsUGxheWVkQ2FsbHMubGVuZ3RoLCAxLCAnYWNjZXNzaWJpbGl0eSBzaWduYWwgc2hvdWxkIGhhdmUgYmVlbiBwbGF5ZWQgb25jZScpO1xuXHRcdGNvbnN0IHNpZ25hbENhbGwgPSB0ZXN0QWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2Uuc2lnbmFsUGxheWVkQ2FsbHNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpZ25hbENhbGwuc2lnbmFsLCBBY2Nlc3NpYmlsaXR5U2lnbmFsLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQsICdjb3JyZWN0IHNpZ25hbCBzaG91bGQgYmUgcGxheWVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHNpZ25hbENhbGwub3B0aW9ucz8uY3VzdG9tQWxlcnRNZXNzYWdlLmluY2x1ZGVzKCdBY2Nlc3NpYmlsaXR5IFRlc3QnKSwgJ2FsZXJ0IG1lc3NhZ2Ugc2hvdWxkIGluY2x1ZGUgdG9vbCB0aXRsZScpO1xuXHRcdGFzc2VydC5vayhzaWduYWxDYWxsLm9wdGlvbnM/LmN1c3RvbUFsZXJ0TWVzc2FnZS5pbmNsdWRlcygnQ2hhdCBjb25maXJtYXRpb24gcmVxdWlyZWQnKSwgJ2FsZXJ0IG1lc3NhZ2Ugc2hvdWxkIGluY2x1ZGUgY29uZmlybWF0aW9uIHRleHQnKTtcblxuXHRcdC8vIENvbXBsZXRlIHRoZSBpbnZvY2F0aW9uXG5cdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwdWJsaXNoZWQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdleGVjdXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2Nlc3NpYmlsaXR5IHNpZ25hbCByZXNwZWN0cyBhdXRvQXBwcm92ZSBjb25maWd1cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIENyZWF0ZSBhIHRlc3QgYWNjZXNzaWJpbGl0eSBzZXJ2aWNlIHRoYXQgc2ltdWxhdGVzIHNjcmVlbiByZWFkZXIgYmVpbmcgZW5hYmxlZFxuXHRcdGNvbnN0IHRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSBpc1NjcmVlblJlYWRlck9wdGltaXplZCgpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0XHR9KCk7XG5cblx0XHQvLyBDcmVhdGUgYSB0ZXN0IGFjY2Vzc2liaWxpdHkgc2lnbmFsIHNlcnZpY2UgdGhhdCB0cmFja3MgY2FsbHNcblx0XHRjb25zdCB0ZXN0QWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgPSBuZXcgVGVzdEFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2U6IHRlc3RTZXJ2aWNlLCBjaGF0U2VydmljZTogdGVzdENoYXRTZXJ2aWNlIH0gPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlLCB7XG5cdFx0XHRhY2Nlc3NpYmlsaXR5U2VydmljZTogdGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IHRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlJywgdHJ1ZSk7XG5cdFx0XHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQnLCB7IHNvdW5kOiAnYXV0bycsIGFubm91bmNlbWVudDogJ2F1dG8nIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndGVzdEF1dG9BcHByb3ZlVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBBdXRvIEFwcHJvdmUgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgQXV0byBBcHByb3ZlIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCB0b29sRGF0YS5pZCwge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoeyBjb25maXJtYXRpb25NZXNzYWdlczogeyB0aXRsZTogJ0F1dG8gQXBwcm92ZSBUZXN0JywgbWVzc2FnZTogJ1Rlc3RpbmcgYXV0byBhcHByb3ZlJyB9IH0pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnYXV0byBhcHByb3ZlZCcgfV0gfSksXG5cdFx0fSwgdG9vbERhdGEpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Nlc3Npb25JZC1hdXRvLWFwcHJvdmUnO1xuXHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24odGVzdENoYXRTZXJ2aWNlLCBzZXNzaW9uSWQsIHsgcmVxdWVzdElkOiAncmVxdWVzdElkLWF1dG8tYXBwcm92ZScsIGNhcHR1cmUgfSk7XG5cblx0XHRjb25zdCBkdG8gPSB0b29sLm1ha2VEdG8oeyBjb25maWc6ICd0ZXN0JyB9LCB7IHNlc3Npb25JZCB9KTtcblxuXHRcdC8vIFdoZW4gYXV0by1hcHByb3ZlIGlzIGVuYWJsZWQsIHRvb2wgc2hvdWxkIGNvbXBsZXRlIHdpdGhvdXQgdXNlciBpbnRlcnZlbnRpb25cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0U2VydmljZS5pbnZva2VUb29sKGR0bywgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIHRvb2wgY29tcGxldGVkIGFuZCBubyBhY2Nlc3NpYmlsaXR5IHNpZ25hbCB3YXMgcGxheWVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnYXV0byBhcHByb3ZlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2Uuc2lnbmFsUGxheWVkQ2FsbHMubGVuZ3RoLCAwLCAnYWNjZXNzaWJpbGl0eSBzaWduYWwgc2hvdWxkIG5vdCBiZSBwbGF5ZWQgd2hlbiBhdXRvLWFwcHJvdmUgaXMgZW5hYmxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvcGlsb3QgcGVybWlzc2lvbiBsZXZlbCBieXBhc3NlcyBnbG9iYWwgYXV0by1hcHByb3ZlIGNoZWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFdoZW4gYXV0b3BpbG90IGlzIG9uLCB0b29scyBzaG91bGQgYXV0by1hcHByb3ZlIHdpdGhvdXQgbmVlZGluZyBnbG9iYWwgYXV0by1hcHByb3ZlIGVuYWJsZWRcblx0XHRjb25zdCB7IHNlcnZpY2U6IHRlc3RTZXJ2aWNlLCBjaGF0U2VydmljZTogdGVzdENoYXRTZXJ2aWNlIH0gPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlLCB7XG5cdFx0XHRjb25maWd1cmVTZXJ2aWNlczogY29uZmlnID0+IHtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScsIGZhbHNlKTsgLy8gR2xvYmFsIE9GRlxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAnYXV0b3BpbG90VG9vbCcsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHsgY29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdDb25maXJtPycsIG1lc3NhZ2U6ICdTaG91bGQgYmUgYXV0by1hcHByb3ZlZCBieSBhdXRvcGlsb3QnIH0gfSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdhdXRvcGlsb3QgYXBwcm92ZWQnIH1dIH0pXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1hdXRvcGlsb3QnO1xuXHRcdHN0dWJHZXRTZXNzaW9uKHRlc3RDaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdG1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QgfSxcblx0XHR9KTtcblxuXHRcdC8vIFRvb2wgc2hvdWxkIGJlIGF1dG8tYXBwcm92ZWQgZXZlbiB0aG91Z2ggZ2xvYmFsIGF1dG8tYXBwcm92ZSBpcyBvZmZcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0U2VydmljZS5pbnZva2VUb29sKFxuXHRcdFx0dG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdhdXRvcGlsb3QgYXBwcm92ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b3BpbG90IGZpbmRzIGNvcnJlY3QgcmVxdWVzdCBieSBjaGF0UmVxdWVzdElkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFdoZW4gY2hhdFJlcXVlc3RJZCBpcyBwcm92aWRlZCwgdGhlIGV4YWN0IHJlcXVlc3Qgc2hvdWxkIGJlIG1hdGNoZWRcblx0XHRjb25zdCB7IHNlcnZpY2U6IHRlc3RTZXJ2aWNlLCBjaGF0U2VydmljZTogdGVzdENoYXRTZXJ2aWNlIH0gPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlLCB7XG5cdFx0XHRjb25maWd1cmVTZXJ2aWNlczogY29uZmlnID0+IHtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ2F1dG9waWxvdElkVG9vbCcsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHsgY29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdDb25maXJtPycsIG1lc3NhZ2U6ICdUZXN0JyB9IH0pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnZm91bmQgYnkgaWQnIH1dIH0pXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1hdXRvcGlsb3QtaWQnO1xuXHRcdGNvbnN0IGZha2VNb2RlbCA9IHtcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCksXG5cdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW1xuXHRcdFx0XHR7IGlkOiAncmVxLW9sZCcsIG1vZGVsSWQ6ICd0ZXN0LW1vZGVsJywgbW9kZUluZm86IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGlkOiAncmVxLWF1dG9waWxvdCcsIG1vZGVsSWQ6ICd0ZXN0LW1vZGVsJywgbW9kZUluZm86IHsgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCB9IH0sXG5cdFx0XHRdLFxuXHRcdH0gYXMgQ2hhdE1vZGVsO1xuXHRcdHRlc3RDaGF0U2VydmljZS5hZGRTZXNzaW9uKGZha2VNb2RlbCk7XG5cblx0XHRjb25zdCBkdG8gPSB0b29sLm1ha2VEdG8oeyB0ZXN0OiAxIH0sIHsgc2Vzc2lvbklkIH0pO1xuXHRcdGR0by5jaGF0UmVxdWVzdElkID0gJ3JlcS1hdXRvcGlsb3QnO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdFNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ2ZvdW5kIGJ5IGlkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9waWxvdCBhdXRvLWFwcHJvdmVzIHRlcm1pbmFsIHRvb2wgd2l0aCBjb25maXJtYXRpb24gbWVzc2FnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGVybWluYWwgdG9vbHMgYWx3YXlzIHJldHVybiBjb25maXJtYXRpb25NZXNzYWdlcyB3aGVuIHRoZWlyIG93biBhdXRvLWFwcHJvdmUgaXMgb2ZmLlxuXHRcdC8vIEluIGF1dG9waWxvdCBtb2RlLCBzaG91bGRBdXRvQ29uZmlybSBzaG91bGQgc3RpbGwgYXV0by1hcHByb3ZlIHRoZSB0b29sLlxuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlJywgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAndGVybWluYWxUb29sJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdHRpdGxlOiAnUnVuIHNoZWxsIGNvbW1hbmQ/Jyxcblx0XHRcdFx0XHRtZXNzYWdlOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAndGVybWluYWwnIGFzIGNvbnN0LFxuXHRcdFx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZDogJ3Rlc3QnLFxuXHRcdFx0XHRcdHRlcm1pbmFsQ29tbWFuZElkOiAnY21kLTEnLFxuXHRcdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnZWNobyBoZWxsbycgfSxcblx0XHRcdFx0XHRsYW5ndWFnZTogJ3NoJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAndGVybWluYWwgZXhlY3V0ZWQnIH1dIH0pXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1hdXRvcGlsb3QtdGVybWluYWwnO1xuXHRcdHN0dWJHZXRTZXNzaW9uKHRlc3RDaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdG1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QgfSxcblx0XHR9KTtcblxuXHRcdC8vIFRlcm1pbmFsIHRvb2wgc2hvdWxkIGJlIGF1dG8tYXBwcm92ZWQgYnkgYXV0b3BpbG90IGV2ZW4gd2l0aG91dCB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgZW5hYmxlZFxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR0b29sLm1ha2VEdG8oeyBjb21tYW5kOiAnZWNobyBoZWxsbycsIGV4cGxhbmF0aW9uOiAndGVzdCcsIGdvYWw6ICd0ZXN0JywgaXNCYWNrZ3JvdW5kOiBmYWxzZSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICd0ZXJtaW5hbCBleGVjdXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvcGlsb3QgcmlzayBnYXRlIHNraXBzIGEgdG9vbCBhc3Nlc3NlZCBhcyBoaWdoLXJpc2sgKHJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dXAgPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlKTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuZW5hYmxlZCA9IHRydWU7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc21lbnQgPSB7IHJpc2s6IFRvb2xSaXNrTGV2ZWwuUmVkLCBleHBsYW5hdGlvbjogJ0RlbGV0ZXMgc291cmNlIGZpbGVzIGlycmV2ZXJzaWJseS4nIH07XG5cdFx0Y29uc3QgdCA9IHNldHVwUmlza0dhdGVUb29sKHNldHVwLCBzdG9yZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0Lmludm9rZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0aW52b2tlZDogdC53YXNJbnZva2VkKCksXG5cdFx0XHRcdGFzc2Vzc0NhbGxzOiBzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzQ2FsbHMubGVuZ3RoLFxuXHRcdFx0XHRtZW50aW9uc1Jpc2s6IFN0cmluZyhyZXN1bHQuY29udGVudFswXS52YWx1ZSkuaW5jbHVkZXMoJ0RlbGV0ZXMgc291cmNlIGZpbGVzIGlycmV2ZXJzaWJseS4nKSxcblx0XHRcdH0sXG5cdFx0XHR7IGludm9rZWQ6IGZhbHNlLCBhc3Nlc3NDYWxsczogMSwgbWVudGlvbnNSaXNrOiB0cnVlIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b3BpbG90IHJpc2sgZ2F0ZSBhbGxvd3MgYSBsb3ctcmlzayAoZ3JlZW4pIHRvb2wgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUpO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5lbmFibGVkID0gdHJ1ZTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzbWVudCA9IHsgcmlzazogVG9vbFJpc2tMZXZlbC5HcmVlbiwgZXhwbGFuYXRpb246ICdSZWFkcyBhIGZpbGUuJyB9O1xuXHRcdGNvbnN0IHQgPSBzZXR1cFJpc2tHYXRlVG9vbChzZXR1cCwgc3RvcmUpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdC5pbnZva2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGludm9rZWQ6IHQud2FzSW52b2tlZCgpLCBhc3Nlc3NDYWxsczogc2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc0NhbGxzLmxlbmd0aCwgdmFsdWU6IHJlc3VsdC5jb250ZW50WzBdLnZhbHVlIH0sXG5cdFx0XHR7IGludm9rZWQ6IHRydWUsIGFzc2Vzc0NhbGxzOiAxLCB2YWx1ZTogJ3JhbicgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvcGlsb3QgcmlzayBnYXRlIGFsbG93cyBhIG1lZGl1bS1yaXNrIChvcmFuZ2UpIHRvb2wgY2FsbCAocmVkLW9ubHkgdGhyZXNob2xkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUpO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5lbmFibGVkID0gdHJ1ZTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzbWVudCA9IHsgcmlzazogVG9vbFJpc2tMZXZlbC5PcmFuZ2UsIGV4cGxhbmF0aW9uOiAnRWRpdHMgYSBmaWxlLicgfTtcblx0XHRjb25zdCB0ID0gc2V0dXBSaXNrR2F0ZVRvb2woc2V0dXAsIHN0b3JlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuaW52b2tlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBpbnZva2VkOiB0Lndhc0ludm9rZWQoKSwgYXNzZXNzQ2FsbHM6IHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5hc3Nlc3NDYWxscy5sZW5ndGgsIHZhbHVlOiByZXN1bHQuY29udGVudFswXS52YWx1ZSB9LFxuXHRcdFx0eyBpbnZva2VkOiB0cnVlLCBhc3Nlc3NDYWxsczogMSwgdmFsdWU6ICdyYW4nIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b3BpbG90IHJpc2sgZ2F0ZSBmYWlscyBvcGVuIHdoZW4gdGhlIGNsYXNzaWZpZXIgcmV0dXJucyBubyBhc3Nlc3NtZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNldHVwID0gY3JlYXRlVGVzdFRvb2xzU2VydmljZShzdG9yZSk7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5hc3Nlc3NtZW50ID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHQgPSBzZXR1cFJpc2tHYXRlVG9vbChzZXR1cCwgc3RvcmUpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdC5pbnZva2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGludm9rZWQ6IHQud2FzSW52b2tlZCgpLCBhc3Nlc3NDYWxsczogc2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc0NhbGxzLmxlbmd0aCwgdmFsdWU6IHJlc3VsdC5jb250ZW50WzBdLnZhbHVlIH0sXG5cdFx0XHR7IGludm9rZWQ6IHRydWUsIGFzc2Vzc0NhbGxzOiAxLCB2YWx1ZTogJ3JhbicgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvcGlsb3QgcmlzayBnYXRlIGZhaWxzIG9wZW4gd2hlbiB0aGUgY2xhc3NpZmllciB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dXAgPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlKTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuZW5hYmxlZCA9IHRydWU7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc0Vycm9yID0gbmV3IEVycm9yKCduZXR3b3JrIGRvd24nKTtcblx0XHRjb25zdCB0ID0gc2V0dXBSaXNrR2F0ZVRvb2woc2V0dXAsIHN0b3JlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuaW52b2tlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBpbnZva2VkOiB0Lndhc0ludm9rZWQoKSwgdmFsdWU6IHJlc3VsdC5jb250ZW50WzBdLnZhbHVlIH0sXG5cdFx0XHR7IGludm9rZWQ6IHRydWUsIHZhbHVlOiAncmFuJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9waWxvdCByaXNrIGdhdGUgZG9lcyBub3QgYXNzZXNzIHRvb2wgY2FsbHMgdGhhdCBoYXZlIG5vIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUpO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5lbmFibGVkID0gdHJ1ZTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzbWVudCA9IHsgcmlzazogVG9vbFJpc2tMZXZlbC5SZWQsIGV4cGxhbmF0aW9uOiAnc2hvdWxkIG5vdCBtYXR0ZXInIH07XG5cdFx0Y29uc3QgdCA9IHNldHVwUmlza0dhdGVUb29sKHNldHVwLCBzdG9yZSwgeyB3aXRoQ29uZmlybWF0aW9uOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuaW52b2tlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBpbnZva2VkOiB0Lndhc0ludm9rZWQoKSwgYXNzZXNzQ2FsbHM6IHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5hc3Nlc3NDYWxscy5sZW5ndGgsIHZhbHVlOiByZXN1bHQuY29udGVudFswXS52YWx1ZSB9LFxuXHRcdFx0eyBpbnZva2VkOiB0cnVlLCBhc3Nlc3NDYWxsczogMCwgdmFsdWU6ICdyYW4nIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b3BpbG90IHJpc2sgZ2F0ZSBjbGFzc2lmaWVzIGEgdGVybWluYWwgY29tbWFuZCBldmVuIHdoZW4gaXQgaGFzIG5vIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBydW5faW5fdGVybWluYWwgc3VwcHJlc3NlcyBpdHMgb3duIGNvbmZpcm1hdGlvbiB1bmRlciBhdXRvLWFwcHJvdmUgc2Vzc2lvbnMsIHNvIHRoZVxuXHRcdC8vIGdhdGUgbXVzdCBjbGFzc2lmeSBpdCBhbnl3YXk7IGEgcmVkIGNvbW1hbmQgaXMgc2tpcHBlZCBkZXNwaXRlIHRoZSBtaXNzaW5nIGNvbmZpcm1hdGlvbi5cblx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUpO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5lbmFibGVkID0gdHJ1ZTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzbWVudCA9IHsgcmlzazogVG9vbFJpc2tMZXZlbC5SZWQsIGV4cGxhbmF0aW9uOiAnRm9yY2UtcHVzaGVzIG1haW4sIG92ZXJ3cml0aW5nIGhpc3RvcnkuJyB9O1xuXHRcdGNvbnN0IHQgPSBzZXR1cFJpc2tHYXRlVG9vbChzZXR1cCwgc3RvcmUsIHsgd2l0aENvbmZpcm1hdGlvbjogZmFsc2UsIHRvb2xJZDogJ3J1bl9pbl90ZXJtaW5hbCcgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0Lmludm9rZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0aW52b2tlZDogdC53YXNJbnZva2VkKCksXG5cdFx0XHRcdGFzc2Vzc0NhbGxzOiBzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzQ2FsbHMubGVuZ3RoLFxuXHRcdFx0XHRpc1Jpc2tNZXNzYWdlOiBTdHJpbmcocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUpLnN0YXJ0c1dpdGgoJ0F1dG9waWxvdCBza2lwcGVkIHRoaXMgdG9vbCBjYWxsJyksXG5cdFx0XHR9LFxuXHRcdFx0eyBpbnZva2VkOiBmYWxzZSwgYXNzZXNzQ2FsbHM6IDEsIGlzUmlza01lc3NhZ2U6IHRydWUgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvcGlsb3QgcmlzayBnYXRlIHJ1bnMgYSBub24tcmVkIHRlcm1pbmFsIGNvbW1hbmQgdGhhdCBoYXMgbm8gY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgdGVybWluYWwgY29tbWFuZCBpcyBhbHdheXMgY2xhc3NpZmllZCBpbiBBdXRvcGlsb3QsIGJ1dCBhIG5vbi1yZWQgdmVyZGljdCBzdGlsbCBydW5zLlxuXHRcdGNvbnN0IHNldHVwID0gY3JlYXRlVGVzdFRvb2xzU2VydmljZShzdG9yZSk7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5hc3Nlc3NtZW50ID0geyByaXNrOiBUb29sUmlza0xldmVsLk9yYW5nZSwgZXhwbGFuYXRpb246ICdJbnN0YWxscyBhIHBhY2thZ2UuJyB9O1xuXHRcdGNvbnN0IHQgPSBzZXR1cFJpc2tHYXRlVG9vbChzZXR1cCwgc3RvcmUsIHsgd2l0aENvbmZpcm1hdGlvbjogZmFsc2UsIHRvb2xJZDogJ3J1bl9pbl90ZXJtaW5hbCcgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0Lmludm9rZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgaW52b2tlZDogdC53YXNJbnZva2VkKCksIGFzc2Vzc0NhbGxzOiBzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzQ2FsbHMubGVuZ3RoLCB2YWx1ZTogcmVzdWx0LmNvbnRlbnRbMF0udmFsdWUgfSxcblx0XHRcdHsgaW52b2tlZDogdHJ1ZSwgYXNzZXNzQ2FsbHM6IDEsIHZhbHVlOiAncmFuJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9waWxvdCByaXNrIGdhdGUgY2xhc3NpZmllcyBhIGZldGNoIHdlYiBwYWdlIGNhbGwgZXZlbiB3aGVuIGl0IGhhcyBubyBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRmV0Y2ggd2ViIHBhZ2UgdG9vbHMgYXV0by1hcHByb3ZlIHRoZW1zZWx2ZXMgKFVSTCBpbiB0aGUgcHJvbXB0IC8gdHJ1c3RlZCBkb21haW4pIGFuZCBzb1xuXHRcdC8vIHN1cmZhY2Ugbm8gY29uZmlybWF0aW9uOyB0aGUgZ2F0ZSBtdXN0IGNsYXNzaWZ5IHRoZW0gYW55d2F5IHNvIGEgZGFuZ2Vyb3VzIFVSTCAoZS5nLiBvbmVcblx0XHQvLyBpbmplY3RlZCBpbnRvIHRoZSBwcm9tcHQgdG8gZXhmaWx0cmF0ZSBzZWNyZXRzKSBpcyBzdGlsbCBza2lwcGVkIHdoZW4gYXNzZXNzZWQgcmVkLlxuXHRcdGNvbnN0IHNldHVwID0gY3JlYXRlVGVzdFRvb2xzU2VydmljZShzdG9yZSk7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5hc3Nlc3NtZW50ID0geyByaXNrOiBUb29sUmlza0xldmVsLlJlZCwgZXhwbGFuYXRpb246ICdTZW5kcyB3b3Jrc3BhY2Ugc2VjcmV0cyB0byBhbiB1bnRydXN0ZWQgaG9zdC4nIH07XG5cdFx0Y29uc3QgdCA9IHNldHVwUmlza0dhdGVUb29sKHNldHVwLCBzdG9yZSwgeyB3aXRoQ29uZmlybWF0aW9uOiBmYWxzZSwgdG9vbElkOiAndnNjb2RlX2ZldGNoV2ViUGFnZV9pbnRlcm5hbCcgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0Lmludm9rZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0aW52b2tlZDogdC53YXNJbnZva2VkKCksXG5cdFx0XHRcdGFzc2Vzc0NhbGxzOiBzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzQ2FsbHMubGVuZ3RoLFxuXHRcdFx0XHRpc1Jpc2tNZXNzYWdlOiBTdHJpbmcocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUpLnN0YXJ0c1dpdGgoJ0F1dG9waWxvdCBza2lwcGVkIHRoaXMgdG9vbCBjYWxsJyksXG5cdFx0XHR9LFxuXHRcdFx0eyBpbnZva2VkOiBmYWxzZSwgYXNzZXNzQ2FsbHM6IDEsIGlzUmlza01lc3NhZ2U6IHRydWUgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvcGlsb3QgcmlzayBnYXRlIHJ1bnMgYSBub24tcmVkIGZldGNoIHdlYiBwYWdlIGNhbGwgdGhhdCBoYXMgbm8gY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgZmV0Y2ggaXMgYWx3YXlzIGNsYXNzaWZpZWQgaW4gQXV0b3BpbG90LCBidXQgYSBub24tcmVkIHZlcmRpY3Qgc3RpbGwgcnVucy5cblx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUpO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5lbmFibGVkID0gdHJ1ZTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzbWVudCA9IHsgcmlzazogVG9vbFJpc2tMZXZlbC5HcmVlbiwgZXhwbGFuYXRpb246ICdGZXRjaGVzIHB1YmxpYyBkb2N1bWVudGF0aW9uLicgfTtcblx0XHRjb25zdCB0ID0gc2V0dXBSaXNrR2F0ZVRvb2woc2V0dXAsIHN0b3JlLCB7IHdpdGhDb25maXJtYXRpb246IGZhbHNlLCB0b29sSWQ6ICdjb3BpbG90X2ZldGNoV2ViUGFnZScgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0Lmludm9rZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgaW52b2tlZDogdC53YXNJbnZva2VkKCksIGFzc2Vzc0NhbGxzOiBzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzQ2FsbHMubGVuZ3RoLCB2YWx1ZTogcmVzdWx0LmNvbnRlbnRbMF0udmFsdWUgfSxcblx0XHRcdHsgaW52b2tlZDogdHJ1ZSwgYXNzZXNzQ2FsbHM6IDEsIHZhbHVlOiAncmFuJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9waWxvdCByaXNrIGdhdGUgaXMgaW5lcnQgd2hlbiBBZHZhbmNlZCBBdXRvcGlsb3QgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dXAgPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlKTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuZW5hYmxlZCA9IHRydWU7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc21lbnQgPSB7IHJpc2s6IFRvb2xSaXNrTGV2ZWwuUmVkLCBleHBsYW5hdGlvbjogJ3Nob3VsZCBub3QgbWF0dGVyJyB9O1xuXHRcdGNvbnN0IHQgPSBzZXR1cFJpc2tHYXRlVG9vbChzZXR1cCwgc3RvcmUsIHsgYWR2YW5jZWRFbmFibGVkOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuaW52b2tlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBpbnZva2VkOiB0Lndhc0ludm9rZWQoKSwgYXNzZXNzQ2FsbHM6IHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5hc3Nlc3NDYWxscy5sZW5ndGgsIHZhbHVlOiByZXN1bHQuY29udGVudFswXS52YWx1ZSB9LFxuXHRcdFx0eyBpbnZva2VkOiB0cnVlLCBhc3Nlc3NDYWxsczogMCwgdmFsdWU6ICdyYW4nIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b3BpbG90IHJpc2sgZ2F0ZSBkb2VzIG5vdCBhcHBseSBhdCB0aGUgcGxhaW4gQXV0by1BcHByb3ZlIGxldmVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNldHVwID0gY3JlYXRlVGVzdFRvb2xzU2VydmljZShzdG9yZSk7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5hc3Nlc3NtZW50ID0geyByaXNrOiBUb29sUmlza0xldmVsLlJlZCwgZXhwbGFuYXRpb246ICdzaG91bGQgbm90IG1hdHRlcicgfTtcblx0XHRjb25zdCB0ID0gc2V0dXBSaXNrR2F0ZVRvb2woc2V0dXAsIHN0b3JlLCB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuaW52b2tlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBpbnZva2VkOiB0Lndhc0ludm9rZWQoKSwgYXNzZXNzQ2FsbHM6IHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5hc3Nlc3NDYWxscy5sZW5ndGgsIHZhbHVlOiByZXN1bHQuY29udGVudFswXS52YWx1ZSB9LFxuXHRcdFx0eyBpbnZva2VkOiB0cnVlLCBhc3Nlc3NDYWxsczogMCwgdmFsdWU6ICdyYW4nIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b3BpbG90IHJpc2sgZ2F0ZSBydW5zIGV2ZW4gd2hlbiB0aGUgcmlzayBhc3Nlc3NtZW50IGJhZGdlIHNldHRpbmcgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhlIGdhdGUgaXMgaW5kZXBlbmRlbnQgb2YgY2hhdC50b29scy5yaXNrQXNzZXNzbWVudC5lbmFibGVkICh3aGljaCBvbmx5IGNvbnRyb2xzIHRoZVxuXHRcdC8vIGNvbmZpcm1hdGlvbiByaXNrIGJhZGdlKTogYSByZWQgdmVyZGljdCBzdGlsbCBza2lwcyB0aGUgY2FsbC4gQWxzbyB2ZXJpZmllcyB0aGUgZ2F0ZVxuXHRcdC8vIHBhc3NlcyBpZ25vcmVFbmFibGVtZW50IFx1MjAxNCB3aXRob3V0IGl0IHRoZSBzdHViIHdvdWxkIHJldHVybiB1bmRlZmluZWQgYW5kIHRoZSB0b29sIHdvdWxkIHJ1bi5cblx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUpO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5lbmFibGVkID0gZmFsc2U7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc21lbnQgPSB7IHJpc2s6IFRvb2xSaXNrTGV2ZWwuUmVkLCBleHBsYW5hdGlvbjogJ0RlbGV0ZXMgc291cmNlIGZpbGVzIGlycmV2ZXJzaWJseS4nIH07XG5cdFx0Y29uc3QgdCA9IHNldHVwUmlza0dhdGVUb29sKHNldHVwLCBzdG9yZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0Lmludm9rZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0aW52b2tlZDogdC53YXNJbnZva2VkKCksXG5cdFx0XHRcdGFzc2Vzc0NhbGxzOiBzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuYXNzZXNzQ2FsbHMubGVuZ3RoLFxuXHRcdFx0XHRpc1Jpc2tNZXNzYWdlOiBTdHJpbmcocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUpLnN0YXJ0c1dpdGgoJ0F1dG9waWxvdCBza2lwcGVkIHRoaXMgdG9vbCBjYWxsJyksXG5cdFx0XHR9LFxuXHRcdFx0eyBpbnZva2VkOiBmYWxzZSwgYXNzZXNzQ2FsbHM6IDEsIGlzUmlza01lc3NhZ2U6IHRydWUgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvcGlsb3QgcmlzayBnYXRlIHNraXBzIG9uIHJlZCBldmVuIHdoZW4gdGhlIGNsYXNzaWZpZXIgZXhwbGFuYXRpb24gaXMgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dXAgPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlKTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuZW5hYmxlZCA9IHRydWU7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc21lbnQgPSB7IHJpc2s6IFRvb2xSaXNrTGV2ZWwuUmVkLCBleHBsYW5hdGlvbjogJycgfTtcblx0XHRjb25zdCB0ID0gc2V0dXBSaXNrR2F0ZVRvb2woc2V0dXAsIHN0b3JlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHQuaW52b2tlKCk7XG5cblx0XHQvLyBUaGUgc2tpcCBtdXN0IHN0aWxsIHJlYWQgYXMgYW4gYXV0b21hdGVkIHJpc2stc2tpcCwgbmV2ZXIgdGhlIHVzZXItc2tpcCBmYWxsYmFjayBtZXNzYWdlLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGludm9rZWQ6IHQud2FzSW52b2tlZCgpLFxuXHRcdFx0XHRhc3Nlc3NDYWxsczogc2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc0NhbGxzLmxlbmd0aCxcblx0XHRcdFx0aXNSaXNrTWVzc2FnZTogU3RyaW5nKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlKS5zdGFydHNXaXRoKCdBdXRvcGlsb3Qgc2tpcHBlZCB0aGlzIHRvb2wgY2FsbCcpLFxuXHRcdFx0XHRpc1VzZXJTa2lwTWVzc2FnZTogU3RyaW5nKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlKS5pbmNsdWRlcygnVGhlIHVzZXIgY2hvc2UgdG8gc2tpcCcpLFxuXHRcdFx0fSxcblx0XHRcdHsgaW52b2tlZDogZmFsc2UsIGFzc2Vzc0NhbGxzOiAxLCBpc1Jpc2tNZXNzYWdlOiB0cnVlLCBpc1VzZXJTa2lwTWVzc2FnZTogZmFsc2UgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvcGlsb3QgcmlzayBnYXRlIGRvZXMgbm90IHNraXAgd2hlbiBjYW5jZWxsZWQgZHVyaW5nIGFzc2Vzc21lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dXAgPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlKTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuZW5hYmxlZCA9IHRydWU7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc21lbnQgPSB7IHJpc2s6IFRvb2xSaXNrTGV2ZWwuUmVkLCBleHBsYW5hdGlvbjogJ0RlbGV0ZXMgc291cmNlIGZpbGVzIGlycmV2ZXJzaWJseS4nIH07XG5cdFx0Y29uc3QgdCA9IHNldHVwUmlza0dhdGVUb29sKHNldHVwLCBzdG9yZSk7XG5cblx0XHQvLyBDYW5jZWwgc3luY2hyb25vdXNseSB3aGlsZSB0aGUgY2xhc3NpZmllciBpcyBydW5uaW5nOiB0aGUgZ2F0ZSBtdXN0IGFiYW5kb24gdGhlXG5cdFx0Ly8gYXNzZXNzbWVudCBhbmQgcHJvcGFnYXRlIGNhbmNlbGxhdGlvbiByYXRoZXIgdGhhbiBtYXNrIGl0IGFzIGEgcmlzay1za2lwIHJlc3VsdC5cblx0XHRjb25zdCBjdHMgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdHNldHVwLnJpc2tBc3Nlc3NtZW50U2VydmljZS5vbkFzc2VzcyA9ICgpID0+IGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHQuaW52b2tlKGN0cy50b2tlbiksIGVyciA9PiBpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGludm9rZWQ6IHQud2FzSW52b2tlZCgpLCBhc3Nlc3NDYWxsczogc2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc0NhbGxzLmxlbmd0aCB9LFxuXHRcdFx0eyBpbnZva2VkOiBmYWxzZSwgYXNzZXNzQ2FsbHM6IDEgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvcGlsb3QgcmlzayBnYXRlIHN1cmZhY2VzIGFuIGluZm8gbm90ZSB0byB0aGUgdXNlciB3aGVuIGl0IHNraXBzIGEgaGlnaC1yaXNrIHRvb2wnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dXAgPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlKTtcblx0XHRzZXR1cC5yaXNrQXNzZXNzbWVudFNlcnZpY2UuZW5hYmxlZCA9IHRydWU7XG5cdFx0c2V0dXAucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmFzc2Vzc21lbnQgPSB7IHJpc2s6IFRvb2xSaXNrTGV2ZWwuUmVkLCBleHBsYW5hdGlvbjogJ0RlbGV0ZXMgc291cmNlIGZpbGVzIGlycmV2ZXJzaWJseS4nIH07XG5cdFx0Y29uc3QgdCA9IHNldHVwUmlza0dhdGVUb29sKHNldHVwLCBzdG9yZSk7XG5cblx0XHQvLyBUaGUgdG9vbCBpbnZvY2F0aW9uIHBhcnQgaGlkZXMgaXRzZWxmIGFmdGVyIGNvbXBsZXRpb24sIHNvIHRoZSByZWFzb24gaXMgc3VyZmFjZWRcblx0XHQvLyBhcyBhIHNlcGFyYXRlIGluZm8gbm90ZSBhcHBlbmRlZCB0byB0aGUgcmVzcG9uc2Ugc3RyZWFtLlxuXHRcdGNvbnN0IHByb2dyZXNzZXM6IElDaGF0UHJvZ3Jlc3NbXSA9IFtdO1xuXHRcdHNldHVwLmNoYXRTZXJ2aWNlLmFwcGVuZFByb2dyZXNzID0gKF9yZXF1ZXN0LCBwcm9ncmVzcykgPT4geyBwcm9ncmVzc2VzLnB1c2gocHJvZ3Jlc3MpOyB9O1xuXG5cdFx0YXdhaXQgdC5pbnZva2UoKTtcblxuXHRcdGNvbnN0IGluZm8gPSBwcm9ncmVzc2VzLmZpbmQoKHApOiBwIGlzIElDaGF0SW5mb01lc3NhZ2UgPT4gcC5raW5kID09PSAnaW5mbycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGhhc0luZm86ICEhaW5mbyxcblx0XHRcdFx0bWVudGlvbnNSaXNrOiAhIWluZm8gJiYgaW5mby5jb250ZW50LnZhbHVlLmluY2x1ZGVzKCdEZWxldGVzIHNvdXJjZSBmaWxlcyBpcnJldmVyc2libHkuJyksXG5cdFx0XHR9LFxuXHRcdFx0eyBoYXNJbmZvOiB0cnVlLCBtZW50aW9uc1Jpc2s6IHRydWUgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdieXBhc3MgYXBwcm92YWxzIGF1dG8tYXBwcm92ZXMgdGVybWluYWwgdG9vbCB3aXRoIGNvbmZpcm1hdGlvbiBtZXNzYWdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2U6IHRlc3RTZXJ2aWNlLCBjaGF0U2VydmljZTogdGVzdENoYXRTZXJ2aWNlIH0gPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlLCB7XG5cdFx0XHRjb25maWd1cmVTZXJ2aWNlczogY29uZmlnID0+IHtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ3Rlcm1pbmFsVG9vbEJ5cGFzcycsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0XHR0aXRsZTogJ1J1biBzaGVsbCBjb21tYW5kPycsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ2xzIC1sYScsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAndGVybWluYWwnIGFzIGNvbnN0LFxuXHRcdFx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZDogJ3Rlc3QnLFxuXHRcdFx0XHRcdHRlcm1pbmFsQ29tbWFuZElkOiAnY21kLTInLFxuXHRcdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnbHMgLWxhJyB9LFxuXHRcdFx0XHRcdGxhbmd1YWdlOiAnc2gnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdieXBhc3MgZXhlY3V0ZWQnIH1dIH0pXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1ieXBhc3MtdGVybWluYWwnO1xuXHRcdHN0dWJHZXRTZXNzaW9uKHRlc3RDaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdG1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdFNlcnZpY2UuaW52b2tlVG9vbChcblx0XHRcdHRvb2wubWFrZUR0byh7IGNvbW1hbmQ6ICdscyAtbGEnLCBleHBsYW5hdGlvbjogJ3Rlc3QnLCBnb2FsOiAndGVzdCcsIGlzQmFja2dyb3VuZDogZmFsc2UgfSwgeyBzZXNzaW9uSWQgfSksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnYnlwYXNzIGV4ZWN1dGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J5cGFzcyBhcHByb3ZhbHMgZG9lcyBub3QgYXV0by1hcHByb3ZlIHRvb2xzIGluIHRvb2xJZHNUaGF0Q2Fubm90QmVBdXRvQXBwcm92ZWQgZm9yIENMSSBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2U6IHRlc3RTZXJ2aWNlLCBjaGF0U2VydmljZTogdGVzdENoYXRTZXJ2aWNlIH0gPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlLCB7XG5cdFx0XHRjb25maWd1cmVTZXJ2aWNlczogY29uZmlnID0+IHtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFJlZ2lzdGVyIGEgdG9vbCB3aXRoIHRoZSBJRCB0aGF0IHNob3VsZCBuZXZlciBiZSBhdXRvLWFwcHJvdmVkXG5cdFx0cmVnaXN0ZXJUb29sRm9yVGVzdCh0ZXN0U2VydmljZSwgc3RvcmUsICd2c2NvZGVfZ2V0X21vZGlmaWVkX2ZpbGVzX2NvbmZpcm1hdGlvbicsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0XHR0aXRsZTogJ1VuY29tbWl0dGVkIENoYW5nZXMnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdTaG91bGQgdGhlc2UgY2hhbmdlcyBiZSBpbmNsdWRlZD8nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdjb25maXJtZWQnIH1dIH0pXG5cdFx0fSk7XG5cblx0XHQvLyBDcmVhdGUgYSBDTEkgc2Vzc2lvbiBVUkkgKGF1dGhvcml0eSA9ICdjb3BpbG90Y2xpJyBpbnN0ZWFkIG9mICdsb2NhbCcpXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtYnlwYXNzLW5vLWF1dG8tY29uZmlybSc7XG5cdFx0Y29uc3QgY2xpU2Vzc2lvblJlc291cmNlID0gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiBMb2NhbENoYXRTZXNzaW9uVXJpLnNjaGVtZSxcblx0XHRcdGF1dGhvcml0eTogJ2NvcGlsb3RjbGknLFxuXHRcdFx0cGF0aDogJy8nICsgc2Vzc2lvbklkXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjYXB0dXJlOiB7IGludm9jYXRpb24/OiBhbnkgfSA9IHt9O1xuXHRcdGNvbnN0IGZha2VNb2RlbCA9IHtcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogY2xpU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7IGlkOiAncmVxMScsIG1vZGVsSWQ6ICd0ZXN0LW1vZGVsJywgbW9kZUluZm86IHsgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlIH0gfV0sXG5cdFx0fSBhcyBDaGF0TW9kZWw7XG5cdFx0dGVzdENoYXRTZXJ2aWNlLmFkZFNlc3Npb24oZmFrZU1vZGVsKTtcblx0XHR0ZXN0Q2hhdFNlcnZpY2UuYXBwZW5kUHJvZ3Jlc3MgPSAoX3JlcXVlc3QsIHByb2dyZXNzKSA9PiB7XG5cdFx0XHRjYXB0dXJlLmludm9jYXRpb24gPSBwcm9ncmVzcztcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR7XG5cdFx0XHRcdGNhbGxJZDogJzEnLFxuXHRcdFx0XHR0b29sSWQ6ICd2c2NvZGVfZ2V0X21vZGlmaWVkX2ZpbGVzX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdHRva2VuQnVkZ2V0OiAxMDAsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgdGVzdDogdHJ1ZSB9LFxuXHRcdFx0XHRjb250ZXh0OiB7IHNlc3Npb25SZXNvdXJjZTogY2xpU2Vzc2lvblJlc291cmNlIH0sXG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0Ly8gVGhlIHRvb2wgc2hvdWxkIE5PVCBiZSBhdXRvLWFwcHJvdmVkIGZvciBDTEkgc2Vzc2lvbnMgXHUyMDE0IGl0IG11c3Qgc2hvdyBjb25maXJtYXRpb24gVUlcblx0XHRjb25zdCBwdWJsaXNoZWQgPSBhd2FpdCB3YWl0Rm9yUHVibGlzaGVkSW52b2NhdGlvbihjYXB0dXJlKTtcblx0XHRhc3NlcnQub2socHVibGlzaGVkPy5jb25maXJtYXRpb25NZXNzYWdlcywgJ3Rvb2wgaW4gdG9vbElkc1RoYXRDYW5ub3RCZUF1dG9BcHByb3ZlZCBzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gZm9yIENMSSBzZXNzaW9ucyBldmVuIHdpdGggQnlwYXNzIEFwcHJvdmFscycpO1xuXG5cdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwdWJsaXNoZWQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdjb25maXJtZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnYnlwYXNzIGFwcHJvdmFscyBhdXRvLWFwcHJvdmVzIHRvb2xzIGluIHRvb2xJZHNUaGF0Q2Fubm90QmVBdXRvQXBwcm92ZWQgZm9yIGxvY2FsIHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlJywgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgYSB0b29sIHdpdGggdGhlIElEIHRoYXQgY2Fubm90IGJlIGF1dG8tYXBwcm92ZWQgZm9yIENMSVxuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ3ZzY29kZV9nZXRfbW9kaWZpZWRfZmlsZXNfY29uZmlybWF0aW9uJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdHRpdGxlOiAnVW5jb21taXR0ZWQgQ2hhbmdlcycsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ1Nob3VsZCB0aGVzZSBjaGFuZ2VzIGJlIGluY2x1ZGVkPycsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ2F1dG8gYXBwcm92ZWQgZm9yIGxvY2FsJyB9XSB9KVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtYnlwYXNzLWxvY2FsLWF1dG8tY29uZmlybSc7XG5cdFx0c3R1YkdldFNlc3Npb24odGVzdENoYXRTZXJ2aWNlLCBzZXNzaW9uSWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0bW9kZUluZm86IHsgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlIH0sXG5cdFx0fSk7XG5cblx0XHQvLyBGb3IgbG9jYWwgc2Vzc2lvbnMsIEJ5cGFzcyBBcHByb3ZhbHMgc2hvdWxkIGF1dG8tYXBwcm92ZSBldmVuIHRoZXNlIHRvb2xzXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdFNlcnZpY2UuaW52b2tlVG9vbChcblx0XHRcdHRvb2wubWFrZUR0byh7IHRlc3Q6IHRydWUgfSwgeyBzZXNzaW9uSWQgfSksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnYXV0byBhcHByb3ZlZCBmb3IgbG9jYWwnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkQXV0b0NvbmZpcm0gd2l0aCBiYXNpYyBjb25maWd1cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRlc3QgYmFzaWMgc2hvdWxkQXV0b0NvbmZpcm0gYmVoYXZpb3Igd2l0aCBzaW1wbGUgY29uZmlndXJhdGlvblxuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlJywgdHJ1ZSk7IC8vIEdsb2JhbCBlbmFibGVkXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBSZWdpc3RlciBhIHRvb2wgdGhhdCBzaG91bGQgYmUgYXV0by1hcHByb3ZlZFxuXHRcdGNvbnN0IGF1dG9Ub29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdCh0ZXN0U2VydmljZSwgc3RvcmUsICdhdXRvVG9vbCcsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHsgY29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdUZXN0JywgbWVzc2FnZTogJ1Nob3VsZCBhdXRvLWFwcHJvdmUnIH0gfSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdhdXRvIGFwcHJvdmVkJyB9XSB9KVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtYmFzaWMtY29uZmlnJztcblx0XHRzdHViR2V0U2Vzc2lvbih0ZXN0Q2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXExJyB9KTtcblxuXHRcdC8vIFRvb2wgc2hvdWxkIGJlIGF1dG8tYXBwcm92ZWQgKGdsb2JhbCBjb25maWcgPSB0cnVlKVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRhdXRvVG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdhdXRvIGFwcHJvdmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZEF1dG9Db25maXJtIHdpdGggcGVyLXRvb2wgY29uZmlndXJhdGlvbiBvYmplY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBwZXItdG9vbCBjb25maWd1cmF0aW9uOiB7IHRvb2xJZDogdHJ1ZS9mYWxzZSB9XG5cdFx0Y29uc3QgeyBzZXJ2aWNlOiB0ZXN0U2VydmljZSwgY2hhdFNlcnZpY2U6IHRlc3RDaGF0U2VydmljZSB9ID0gY3JlYXRlVGVzdFRvb2xzU2VydmljZShzdG9yZSwge1xuXHRcdFx0Y29uZmlndXJlU2VydmljZXM6IGNvbmZpZyA9PiB7XG5cdFx0XHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmUnLCB7XG5cdFx0XHRcdFx0J2FwcHJvdmVkVG9vbCc6IHRydWUsXG5cdFx0XHRcdFx0J2RlbmllZFRvb2wnOiBmYWxzZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFRvb2wgZXhwbGljaXRseSBhcHByb3ZlZFxuXHRcdGNvbnN0IGFwcHJvdmVkVG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAnYXBwcm92ZWRUb29sJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoeyBjb25maXJtYXRpb25NZXNzYWdlczogeyB0aXRsZTogJ1Rlc3QnLCBtZXNzYWdlOiAnU2hvdWxkIGF1dG8tYXBwcm92ZScgfSB9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ2FwcHJvdmVkJyB9XSB9KVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtcGVyLXRvb2wnO1xuXHRcdHN0dWJHZXRTZXNzaW9uKHRlc3RDaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZDogJ3JlcTEnIH0pO1xuXG5cdFx0Ly8gQXBwcm92ZWQgdG9vbCBzaG91bGQgYXV0by1hcHByb3ZlXG5cdFx0Y29uc3QgYXBwcm92ZWRSZXN1bHQgPSBhd2FpdCB0ZXN0U2VydmljZS5pbnZva2VUb29sKFxuXHRcdFx0YXBwcm92ZWRUb29sLm1ha2VEdG8oeyB0ZXN0OiAxIH0sIHsgc2Vzc2lvbklkIH0pLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3ZlZFJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnYXBwcm92ZWQnKTtcblxuXHRcdC8vIFRlc3QgdGhhdCBub24tc3BlY2lmaWVkIHRvb2xzIHJlcXVpcmUgY29uZmlybWF0aW9uIChkZWZhdWx0IGJlaGF2aW9yKVxuXHRcdGNvbnN0IHVuc3BlY2lmaWVkVG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAndW5zcGVjaWZpZWRUb29sJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoeyBjb25maXJtYXRpb25NZXNzYWdlczogeyB0aXRsZTogJ1Rlc3QnLCBtZXNzYWdlOiAnU2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uJyB9IH0pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAndW5zcGVjaWZpZWQnIH1dIH0pXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjYXB0dXJlOiB7IGludm9jYXRpb24/OiBhbnkgfSA9IHt9O1xuXHRcdHN0dWJHZXRTZXNzaW9uKHRlc3RDaGF0U2VydmljZSwgc2Vzc2lvbklkICsgJzInLCB7IHJlcXVlc3RJZDogJ3JlcTInLCBjYXB0dXJlIH0pO1xuXHRcdGNvbnN0IHVuc3BlY2lmaWVkUHJvbWlzZSA9IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR1bnNwZWNpZmllZFRvb2wubWFrZUR0byh7IHRlc3Q6IDIgfSwgeyBzZXNzaW9uSWQ6IHNlc3Npb25JZCArICcyJyB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRjb25zdCBwdWJsaXNoZWQgPSBhd2FpdCB3YWl0Rm9yUHVibGlzaGVkSW52b2NhdGlvbihjYXB0dXJlKTtcblx0XHRhc3NlcnQub2socHVibGlzaGVkPy5jb25maXJtYXRpb25NZXNzYWdlcywgJ3Vuc3BlY2lmaWVkIHRvb2wgc2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uJyk7XG5cblx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHB1Ymxpc2hlZCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRjb25zdCB1bnNwZWNpZmllZFJlc3VsdCA9IGF3YWl0IHVuc3BlY2lmaWVkUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zcGVjaWZpZWRSZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ3Vuc3BlY2lmaWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWdpYmxlRm9yQXV0b0FwcHJvdmFsIHNldHRpbmcgY29udHJvbHMgdG9vbCBlbGlnaWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUZXN0IHRoZSBuZXcgZWxpZ2libGVGb3JBdXRvQXBwcm92YWwgc2V0dGluZ1xuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWwsIHtcblx0XHRcdFx0XHQnZWxpZ2libGVUb29sUmVmJzogdHJ1ZSxcblx0XHRcdFx0XHQnaW5lbGlnaWJsZVRvb2xSZWYnOiBmYWxzZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFRvb2wgZXhwbGljaXRseSBtYXJrZWQgYXMgZWxpZ2libGUgKHVzaW5nIHRvb2xSZWZlcmVuY2VOYW1lKSAtIG5vIGNvbmZpcm1hdGlvbiBuZWVkZWRcblx0XHRjb25zdCBlbGlnaWJsZVRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ2VsaWdpYmxlVG9vbCcsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHt9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ2VsaWdpYmxlIHRvb2wgcmFuJyB9XSB9KVxuXHRcdH0sIHtcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnZWxpZ2libGVUb29sUmVmJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtZWxpZ2libGUnO1xuXHRcdHN0dWJHZXRTZXNzaW9uKHRlc3RDaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZDogJ3JlcTEnIH0pO1xuXG5cdFx0Ly8gRWxpZ2libGUgdG9vbCBzaG91bGQgbm90IGdldCBkZWZhdWx0IGNvbmZpcm1hdGlvbiBtZXNzYWdlcyBpbmplY3RlZFxuXHRcdGNvbnN0IGVsaWdpYmxlUmVzdWx0ID0gYXdhaXQgdGVzdFNlcnZpY2UuaW52b2tlVG9vbChcblx0XHRcdGVsaWdpYmxlVG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxpZ2libGVSZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ2VsaWdpYmxlIHRvb2wgcmFuJyk7XG5cblx0XHQvLyBUb29sIGV4cGxpY2l0bHkgbWFya2VkIGFzIGluZWxpZ2libGUgKHVzaW5nIHRvb2xSZWZlcmVuY2VOYW1lKSAtIG11c3QgcmVxdWlyZSBjb25maXJtYXRpb25cblx0XHRjb25zdCBpbmVsaWdpYmxlVG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAnaW5lbGlnaWJsZVRvb2wnLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdpbmVsaWdpYmxlIHJlcXVpcmVzIGNvbmZpcm1hdGlvbicgfV0gfSlcblx0XHR9LCB7XG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2luZWxpZ2libGVUb29sUmVmJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogYW55IH0gPSB7fTtcblx0XHRzdHViR2V0U2Vzc2lvbih0ZXN0Q2hhdFNlcnZpY2UsIHNlc3Npb25JZCArICcyJywgeyByZXF1ZXN0SWQ6ICdyZXEyJywgY2FwdHVyZSB9KTtcblx0XHRjb25zdCBpbmVsaWdpYmxlUHJvbWlzZSA9IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRpbmVsaWdpYmxlVG9vbC5tYWtlRHRvKHsgdGVzdDogMiB9LCB7IHNlc3Npb25JZDogc2Vzc2lvbklkICsgJzInIH0pLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlZCA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXHRcdGFzc2VydC5vayhwdWJsaXNoZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAnaW5lbGlnaWJsZSB0b29sIHNob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbicpO1xuXHRcdGFzc2VydC5vayhwdWJsaXNoZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSwgJ3Nob3VsZCBoYXZlIGRlZmF1bHQgY29uZmlybWF0aW9uIHRpdGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB1Ymxpc2hlZD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LmFsbG93QXV0b0NvbmZpcm0sIGZhbHNlLCAnc2hvdWxkIG5vdCBhbGxvdyBhdXRvIGNvbmZpcm0nKTtcblxuXHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgocHVibGlzaGVkLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHRcdGNvbnN0IGluZWxpZ2libGVSZXN1bHQgPSBhd2FpdCBpbmVsaWdpYmxlUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5lbGlnaWJsZVJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnaW5lbGlnaWJsZSByZXF1aXJlcyBjb25maXJtYXRpb24nKTtcblxuXHRcdC8vIFRvb2wgbm90IHNwZWNpZmllZCBzaG91bGQgZGVmYXVsdCB0byBlbGlnaWJsZSAtIG5vIGNvbmZpcm1hdGlvbiBuZWVkZWRcblx0XHRjb25zdCB1bnNwZWNpZmllZFRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ3Vuc3BlY2lmaWVkVG9vbCcsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHt9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3Vuc3BlY2lmaWVkIGRlZmF1bHRzIHRvIGVsaWdpYmxlJyB9XSB9KVxuXHRcdH0sIHtcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndW5zcGVjaWZpZWRUb29sUmVmJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdW5zcGVjaWZpZWRSZXN1bHQgPSBhd2FpdCB0ZXN0U2VydmljZS5pbnZva2VUb29sKFxuXHRcdFx0dW5zcGVjaWZpZWRUb29sLm1ha2VEdG8oeyB0ZXN0OiAzIH0sIHsgc2Vzc2lvbklkIH0pLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnNwZWNpZmllZFJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAndW5zcGVjaWZpZWQgZGVmYXVsdHMgdG8gZWxpZ2libGUnKTtcblx0fSk7XG5cblx0dGVzdCgndG9vbCBjb250ZW50IGZvcm1hdHRpbmcgd2l0aCBhbHdheXNEaXNwbGF5SW5wdXRPdXRwdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBlbnN1cmVUb29sRGV0YWlscywgZm9ybWF0VG9vbElucHV0LCBhbmQgdG9vbFJlc3VsdFRvSU9cblx0XHRjb25zdCB0b29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdmb3JtYXRUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdGb3JtYXQgVGVzdCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRm9ybWF0IFRlc3QgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0YWx3YXlzRGlzcGxheUlucHV0T3V0cHV0OiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHNlcnZpY2UsIHN0b3JlLCB0b29sRGF0YS5pZCwge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoaW52b2NhdGlvbikgPT4gKHtcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsga2luZDogJ3RleHQnLCB2YWx1ZTogJ1RleHQgcmVzdWx0JyB9LFxuXHRcdFx0XHRcdHsga2luZDogJ2RhdGEnLCB2YWx1ZTogeyBkYXRhOiBWU0J1ZmZlci5mcm9tQnl0ZUFycmF5KFsxLCAyLCAzXSksIG1pbWVUeXBlOiAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJyB9IH1cblx0XHRcdFx0XVxuXHRcdFx0fSlcblx0XHR9LCB0b29sRGF0YSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IHsgYTogMSwgYjogJ3Rlc3QnLCBjOiBbMSwgMiwgM10gfTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR0b29sLm1ha2VEdG8oaW5wdXQpLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0Ly8gU2hvdWxkIGhhdmUgdG9vbCByZXN1bHQgZGV0YWlscyBiZWNhdXNlIGFsd2F5c0Rpc3BsYXlJbnB1dE91dHB1dCA9IHRydWVcblx0XHRhc3NlcnQub2socmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzLCAnc2hvdWxkIGhhdmUgdG9vbFJlc3VsdERldGFpbHMnKTtcblx0XHRjb25zdCBkZXRhaWxzID0gcmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzO1xuXHRcdGFzc2VydC5vayhpc1Rvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMoZGV0YWlscykpO1xuXG5cdFx0Ly8gVGVzdCBmb3JtYXRUb29sSW5wdXQgLSBzaG91bGQgYmUgZm9ybWF0dGVkIEpTT05cblx0XHRjb25zdCBleHBlY3RlZElucHV0SnNvbiA9IEpTT04uc3RyaW5naWZ5KGlucHV0LCB1bmRlZmluZWQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLmlucHV0LCBleHBlY3RlZElucHV0SnNvbiwgJ2lucHV0IHNob3VsZCBiZSBmb3JtYXR0ZWQgSlNPTicpO1xuXG5cdFx0Ly8gVGVzdCB0b29sUmVzdWx0VG9JTyAtIHNob3VsZCBjb252ZXJ0IGRpZmZlcmVudCBjb250ZW50IHR5cGVzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGFpbHMub3V0cHV0Lmxlbmd0aCwgMiwgJ3Nob3VsZCBoYXZlIDIgb3V0cHV0IGl0ZW1zJyk7XG5cblx0XHQvLyBUZXh0IGNvbnRlbnRcblx0XHRjb25zdCB0ZXh0T3V0cHV0ID0gZGV0YWlscy5vdXRwdXRbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRPdXRwdXQudHlwZSwgJ2VtYmVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRPdXRwdXQuaXNUZXh0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE91dHB1dC52YWx1ZSwgJ1RleHQgcmVzdWx0Jyk7XG5cblx0XHQvLyBEYXRhIGNvbnRlbnQgKGJhc2U2NCBlbmNvZGVkKVxuXHRcdGNvbnN0IGRhdGFPdXRwdXQgPSBkZXRhaWxzLm91dHB1dFsxXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YU91dHB1dC50eXBlLCAnZW1iZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YU91dHB1dC5taW1lVHlwZSwgJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhT3V0cHV0LnZhbHVlLCAnQVFJRCcpOyAvLyBiYXNlNjQgb2YgWzEsMiwzXVxuXHR9KTtcblxuXHR0ZXN0KCd0b29sIGVycm9yIGhhbmRsaW5nIGFuZCB0ZWxlbWV0cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2U6IHRlc3RUZWxlbWV0cnlTZXJ2aWNlXG5cdFx0fSk7XG5cblx0XHQvLyBUZXN0IHN1Y2Nlc3NmdWwgaW52b2NhdGlvbiB0ZWxlbWV0cnlcblx0XHRjb25zdCBzdWNjZXNzVG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAnc3VjY2Vzc1Rvb2wnLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdzdWNjZXNzJyB9XSB9KVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3RlbGVtZXRyeS10ZXN0Jztcblx0XHRzdHViR2V0U2Vzc2lvbih0ZXN0Q2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXExJyB9KTtcblxuXHRcdGF3YWl0IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRzdWNjZXNzVG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdC8vIENoZWNrIHN1Y2Nlc3MgdGVsZW1ldHJ5XG5cdFx0Y29uc3Qgc3VjY2Vzc0V2ZW50cyA9IHRlc3RUZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cy5maWx0ZXIoZSA9PiBlLmV2ZW50TmFtZSA9PT0gJ2xhbmd1YWdlTW9kZWxUb29sSW52b2tlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWNjZXNzRXZlbnRzLmxlbmd0aCwgMSwgJ3Nob3VsZCBoYXZlIHN1Y2Nlc3MgdGVsZW1ldHJ5IGV2ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Y2Nlc3NFdmVudHNbMF0uZGF0YS5yZXN1bHQsICdzdWNjZXNzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Y2Nlc3NFdmVudHNbMF0uZGF0YS50b29sSWQsICdzdWNjZXNzVG9vbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWNjZXNzRXZlbnRzWzBdLmRhdGEuY2hhdFNlc3Npb25JZCwgc2Vzc2lvbklkKTtcblxuXHRcdHRlc3RUZWxlbWV0cnlTZXJ2aWNlLnJlc2V0KCk7XG5cblx0XHQvLyBUZXN0IGVycm9yIHRlbGVtZXRyeVxuXHRcdGNvbnN0IGVycm9yVG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAnZXJyb3JUb29sJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignVG9vbCBlcnJvcicpOyB9XG5cdFx0fSk7XG5cblx0XHRzdHViR2V0U2Vzc2lvbih0ZXN0Q2hhdFNlcnZpY2UsIHNlc3Npb25JZCArICcyJywgeyByZXF1ZXN0SWQ6ICdyZXEyJyB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0U2VydmljZS5pbnZva2VUb29sKFxuXHRcdFx0XHRlcnJvclRvb2wubWFrZUR0byh7IHRlc3Q6IDIgfSwgeyBzZXNzaW9uSWQ6IHNlc3Npb25JZCArICcyJyB9KSxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgaGF2ZSB0aHJvd24nKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIEV4cGVjdGVkXG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZXJyb3IgdGVsZW1ldHJ5XG5cdFx0Y29uc3QgZXJyb3JFdmVudHMgPSB0ZXN0VGVsZW1ldHJ5U2VydmljZS5ldmVudHMuZmlsdGVyKGUgPT4gZS5ldmVudE5hbWUgPT09ICdsYW5ndWFnZU1vZGVsVG9vbEludm9rZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JFdmVudHMubGVuZ3RoLCAxLCAnc2hvdWxkIGhhdmUgZXJyb3IgdGVsZW1ldHJ5IGV2ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yRXZlbnRzWzBdLmRhdGEucmVzdWx0LCAnZXJyb3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JFdmVudHNbMF0uZGF0YS50b29sSWQsICdlcnJvclRvb2wnKTtcblx0fSk7XG5cblx0dGVzdCgnY2FsbCB0cmFja2luZyBhbmQgY2xlYW51cCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUZXN0IHRoYXQgY2FuY2VsVG9vbENhbGxzRm9yUmVxdWVzdCBtZXRob2QgZXhpc3RzIGFuZCBjYW4gYmUgY2FsbGVkXG5cdFx0Ly8gKFRoZSBkZXRhaWxlZCBjYW5jZWxsYXRpb24gYmVoYXZpb3IgaXMgYWxyZWFkeSB0ZXN0ZWQgaW4gXCJjYW5jZWwgdG9vbCBjYWxsXCIgdGVzdClcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndHJhY2tpbmctc2Vzc2lvbic7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gJ3RyYWNraW5nLXJlcXVlc3QnO1xuXHRcdHN0dWJHZXRTZXNzaW9uKGNoYXRTZXJ2aWNlLCBzZXNzaW9uSWQsIHsgcmVxdWVzdElkIH0pO1xuXG5cdFx0Ly8gSnVzdCB2ZXJpZnkgdGhlIG1ldGhvZCBleGlzdHMgYW5kIGRvZXNuJ3QgdGhyb3dcblx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdHNlcnZpY2UuY2FuY2VsVG9vbENhbGxzRm9yUmVxdWVzdChyZXF1ZXN0SWQpO1xuXHRcdH0sICdjYW5jZWxUb29sQ2FsbHNGb3JSZXF1ZXN0IHNob3VsZCBub3QgdGhyb3cnKTtcblxuXHRcdC8vIFZlcmlmeSBjYWxsaW5nIHdpdGggbm9uLWV4aXN0ZW50IHJlcXVlc3QgSUQgZG9lc24ndCB0aHJvd1xuXHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0c2VydmljZS5jYW5jZWxUb29sQ2FsbHNGb3JSZXF1ZXN0KCdub24tZXhpc3RlbnQtcmVxdWVzdCcpO1xuXHRcdH0sICdjYW5jZWxUb29sQ2FsbHNGb3JSZXF1ZXN0IHdpdGggbm9uLWV4aXN0ZW50IElEIHNob3VsZCBub3QgdGhyb3cnKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXNzaWJpbGl0eSBzaWduYWwgd2l0aCBkaWZmZXJlbnQgc2V0dGluZ3MgY29tYmluYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSA9IG5ldyBUZXN0QWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UoKTtcblxuXHRcdC8vIFRlc3QgY2FzZSAxOiBTb3VuZCBlbmFibGVkLCBhbm5vdW5jZW1lbnQgZGlzYWJsZWQsIHNjcmVlbiByZWFkZXIgb2ZmXG5cdFx0Y29uc3QgdGVzdENvbmZpZ1NlcnZpY2UxID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlMS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmUnLCBmYWxzZSk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2UxLnNldFVzZXJDb25maWd1cmF0aW9uKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCcsIHsgc291bmQ6ICdvbicsIGFubm91bmNlbWVudDogJ29mZicgfSk7XG5cblx0XHRjb25zdCB0ZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UxID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHR9KCk7XG5cblx0XHRjb25zdCBpbnN0YVNlcnZpY2UxID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6ICgpID0+IHN0b3JlLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UodGVzdENvbmZpZ1NlcnZpY2UxKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gdGVzdENvbmZpZ1NlcnZpY2UxXG5cdFx0fSwgc3RvcmUpO1xuXHRcdGluc3RhU2VydmljZTEuc3R1YihJQ2hhdFNlcnZpY2UsIGNoYXRTZXJ2aWNlKTtcblx0XHRpbnN0YVNlcnZpY2UxLnN0dWIoSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLCB0ZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UxKTtcblx0XHRpbnN0YVNlcnZpY2UxLnN0dWIoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLCB0ZXN0QWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgYXMgdW5rbm93biBhcyBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXHRcdGluc3RhU2VydmljZTEuc3R1YihJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSwgbmV3IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhU2VydmljZTEuc3R1YihJVG9vbFJlc3VsdENvbXByZXNzb3IsIG5vb3BUb29sUmVzdWx0Q29tcHJlc3Nvcik7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UxID0gc3RvcmUuYWRkKGluc3RhU2VydmljZTEuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgdG9vbDEgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlMSwgc3RvcmUsICdzb3VuZE9ubHlUb29sJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoeyBjb25maXJtYXRpb25NZXNzYWdlczogeyB0aXRsZTogJ1NvdW5kIFRlc3QnLCBtZXNzYWdlOiAnVGVzdGluZyBzb3VuZCBvbmx5JyB9IH0pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnZXhlY3V0ZWQnIH1dIH0pXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQxID0gJ3NvdW5kLXRlc3QnO1xuXHRcdGNvbnN0IGNhcHR1cmUxOiB7IGludm9jYXRpb24/OiBhbnkgfSA9IHt9O1xuXHRcdHN0dWJHZXRTZXNzaW9uKGNoYXRTZXJ2aWNlLCBzZXNzaW9uSWQxLCB7IHJlcXVlc3RJZDogJ3JlcTEnLCBjYXB0dXJlOiBjYXB0dXJlMSB9KTtcblxuXHRcdGNvbnN0IHByb21pc2UxID0gdGVzdFNlcnZpY2UxLmludm9rZVRvb2wodG9vbDEubWFrZUR0byh7IHRlc3Q6IDEgfSwgeyBzZXNzaW9uSWQ6IHNlc3Npb25JZDEgfSksIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlZDEgPSBhd2FpdCB3YWl0Rm9yUHVibGlzaGVkSW52b2NhdGlvbihjYXB0dXJlMSk7XG5cblx0XHQvLyBTaWduYWwgc2hvdWxkIGJlIHBsYXllZCAoc291bmQ9b24sIG5vIHNjcmVlbiByZWFkZXIgcmVxdWlyZW1lbnQpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5zaWduYWxQbGF5ZWRDYWxscy5sZW5ndGgsIDEsICdzb3VuZCBzaG91bGQgYmUgcGxheWVkIHdoZW4gc291bmQ9b24nKTtcblx0XHRjb25zdCBjYWxsMSA9IHRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5zaWduYWxQbGF5ZWRDYWxsc1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbDEub3B0aW9ucz8ubW9kYWxpdHksIHVuZGVmaW5lZCwgJ3Nob3VsZCB1c2UgZGVmYXVsdCBtb2RhbGl0eSBmb3Igc291bmQnKTtcblxuXHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgocHVibGlzaGVkMSwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRhd2FpdCBwcm9taXNlMTtcblxuXHRcdHRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5yZXNldCgpO1xuXG5cdFx0Ly8gVGVzdCBjYXNlIDI6IFNvdW5kIGF1dG8sIGFubm91bmNlbWVudCBhdXRvLCBzY3JlZW4gcmVhZGVyIG9uXG5cdFx0Y29uc3QgdGVzdENvbmZpZ1NlcnZpY2UyID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlMi5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmUnLCBmYWxzZSk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2UyLnNldFVzZXJDb25maWd1cmF0aW9uKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCcsIHsgc291bmQ6ICdhdXRvJywgYW5ub3VuY2VtZW50OiAnYXV0bycgfSk7XG5cblx0XHRjb25zdCB0ZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRcdH0oKTtcblxuXHRcdGNvbnN0IGluc3RhU2VydmljZTIgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogKCkgPT4gc3RvcmUuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZSh0ZXN0Q29uZmlnU2VydmljZTIpKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiB0ZXN0Q29uZmlnU2VydmljZTJcblx0XHR9LCBzdG9yZSk7XG5cdFx0aW5zdGFTZXJ2aWNlMi5zdHViKElDaGF0U2VydmljZSwgY2hhdFNlcnZpY2UpO1xuXHRcdGluc3RhU2VydmljZTIuc3R1YihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIHRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZTIpO1xuXHRcdGluc3RhU2VydmljZTIuc3R1YihJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsIHRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBhcyB1bmtub3duIGFzIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSk7XG5cdFx0aW5zdGFTZXJ2aWNlMi5zdHViKElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLCBuZXcgTW9ja0xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFTZXJ2aWNlMi5zdHViKElUb29sUmVzdWx0Q29tcHJlc3Nvciwgbm9vcFRvb2xSZXN1bHRDb21wcmVzc29yKTtcblx0XHRjb25zdCB0ZXN0U2VydmljZTIgPSBzdG9yZS5hZGQoaW5zdGFTZXJ2aWNlMi5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCB0b29sMiA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UyLCBzdG9yZSwgJ2F1dG9TY3JlZW5SZWFkZXJUb29sJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoeyBjb25maXJtYXRpb25NZXNzYWdlczogeyB0aXRsZTogJ0F1dG8gVGVzdCcsIG1lc3NhZ2U6ICdUZXN0aW5nIGF1dG8gd2l0aCBzY3JlZW4gcmVhZGVyJyB9IH0pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnZXhlY3V0ZWQnIH1dIH0pXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQyID0gJ2F1dG8tc3ItdGVzdCc7XG5cdFx0Y29uc3QgY2FwdHVyZTI6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24oY2hhdFNlcnZpY2UsIHNlc3Npb25JZDIsIHsgcmVxdWVzdElkOiAncmVxMicsIGNhcHR1cmU6IGNhcHR1cmUyIH0pO1xuXG5cdFx0Y29uc3QgcHJvbWlzZTIgPSB0ZXN0U2VydmljZTIuaW52b2tlVG9vbCh0b29sMi5tYWtlRHRvKHsgdGVzdDogMiB9LCB7IHNlc3Npb25JZDogc2Vzc2lvbklkMiB9KSwgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcHVibGlzaGVkMiA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUyKTtcblxuXHRcdC8vIFNpZ25hbCBzaG91bGQgYmUgcGxheWVkIChib3RoIHNvdW5kIGFuZCBhbm5vdW5jZW1lbnQgZW5hYmxlZCBmb3Igc2NyZWVuIHJlYWRlcilcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnNpZ25hbFBsYXllZENhbGxzLmxlbmd0aCwgMSwgJ3NpZ25hbCBzaG91bGQgYmUgcGxheWVkIHdpdGggc2NyZWVuIHJlYWRlciBvcHRpbWl6YXRpb24nKTtcblx0XHRjb25zdCBjYWxsMiA9IHRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5zaWduYWxQbGF5ZWRDYWxsc1swXTtcblx0XHRhc3NlcnQub2soY2FsbDIub3B0aW9ucz8uY3VzdG9tQWxlcnRNZXNzYWdlLCAnc2hvdWxkIGhhdmUgY3VzdG9tIGFsZXJ0IG1lc3NhZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbDIub3B0aW9ucz8udXNlckdlc3R1cmUsIHRydWUsICdzaG91bGQgbWFyayBhcyB1c2VyIGdlc3R1cmUnKTtcblxuXHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgocHVibGlzaGVkMiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRhd2FpdCBwcm9taXNlMjtcblxuXHRcdHRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5yZXNldCgpO1xuXG5cdFx0Ly8gVGVzdCBjYXNlIDM6IFNvdW5kIG9mZiwgYW5ub3VuY2VtZW50IG9mZiAtIG5vIHNpZ25hbFxuXHRcdGNvbnN0IHRlc3RDb25maWdTZXJ2aWNlMyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZTMuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlJywgZmFsc2UpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlMy5zZXRVc2VyQ29uZmlndXJhdGlvbignYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQnLCB7IHNvdW5kOiAnb2ZmJywgYW5ub3VuY2VtZW50OiAnb2ZmJyB9KTtcblxuXHRcdGNvbnN0IHRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZTMgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdFx0fSgpO1xuXG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlMyA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiAoKSA9PiBzdG9yZS5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKHRlc3RDb25maWdTZXJ2aWNlMykpLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IHRlc3RDb25maWdTZXJ2aWNlM1xuXHRcdH0sIHN0b3JlKTtcblx0XHRpbnN0YVNlcnZpY2UzLnN0dWIoSUNoYXRTZXJ2aWNlLCBjaGF0U2VydmljZSk7XG5cdFx0aW5zdGFTZXJ2aWNlMy5zdHViKElBY2Nlc3NpYmlsaXR5U2VydmljZSwgdGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlMyk7XG5cdFx0aW5zdGFTZXJ2aWNlMy5zdHViKElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSwgdGVzdEFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIGFzIHVua25vd24gYXMgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKTtcblx0XHRpbnN0YVNlcnZpY2UzLnN0dWIoSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UsIG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YVNlcnZpY2UzLnN0dWIoSVRvb2xSZXN1bHRDb21wcmVzc29yLCBub29wVG9vbFJlc3VsdENvbXByZXNzb3IpO1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlMyA9IHN0b3JlLmFkZChpbnN0YVNlcnZpY2UzLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHRvb2wzID0gcmVnaXN0ZXJUb29sRm9yVGVzdCh0ZXN0U2VydmljZTMsIHN0b3JlLCAnb2ZmVG9vbCcsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHsgY29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdPZmYgVGVzdCcsIG1lc3NhZ2U6ICdUZXN0aW5nIG9mZiBzZXR0aW5ncycgfSB9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ2V4ZWN1dGVkJyB9XSB9KVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkMyA9ICdvZmYtdGVzdCc7XG5cdFx0Y29uc3QgY2FwdHVyZTM6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24oY2hhdFNlcnZpY2UsIHNlc3Npb25JZDMsIHsgcmVxdWVzdElkOiAncmVxMycsIGNhcHR1cmU6IGNhcHR1cmUzIH0pO1xuXG5cdFx0Y29uc3QgcHJvbWlzZTMgPSB0ZXN0U2VydmljZTMuaW52b2tlVG9vbCh0b29sMy5tYWtlRHRvKHsgdGVzdDogMyB9LCB7IHNlc3Npb25JZDogc2Vzc2lvbklkMyB9KSwgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcHVibGlzaGVkMyA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUzKTtcblxuXHRcdC8vIE5vIHNpZ25hbCBzaG91bGQgYmUgcGxheWVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5zaWduYWxQbGF5ZWRDYWxscy5sZW5ndGgsIDAsICdubyBzaWduYWwgc2hvdWxkIGJlIHBsYXllZCB3aGVuIGJvdGggc291bmQgYW5kIGFubm91bmNlbWVudCBhcmUgb2ZmJyk7XG5cblx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHB1Ymxpc2hlZDMsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0YXdhaXQgcHJvbWlzZTM7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVRvb2xTZXQgYW5kIGdldFRvb2xTZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbFNldCA9IHN0b3JlLmFkZChzZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdCd0ZXN0VG9vbFNldElkJyxcblx0XHRcdCd0ZXN0VG9vbFNldE5hbWUnLFxuXHRcdFx0eyBpY29uOiB1bmRlZmluZWQsIGRlc2NyaXB0aW9uOiAnVGVzdCB0b29sIHNldCcgfVxuXHRcdCkpO1xuXG5cdFx0Ly8gU2hvdWxkIGJlIGFibGUgdG8gcmV0cmlldmUgYnkgSURcblx0XHRjb25zdCByZXRyaWV2ZWQgPSBzZXJ2aWNlLmdldFRvb2xTZXQoJ3Rlc3RUb29sU2V0SWQnKTtcblx0XHRhc3NlcnQub2socmV0cmlldmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV0cmlldmVkLmlkLCAndGVzdFRvb2xTZXRJZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXRyaWV2ZWQucmVmZXJlbmNlTmFtZSwgJ3Rlc3RUb29sU2V0TmFtZScpO1xuXG5cdFx0Ly8gU2hvdWxkIG5vdCBmaW5kIG5vbi1leGlzdGVudCB0b29sIHNldFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFRvb2xTZXQoJ25vbkV4aXN0ZW50SWQnKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIERpc3Bvc2Ugc2hvdWxkIHJlbW92ZSBpdFxuXHRcdHRvb2xTZXQuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFRvb2xTZXQoJ3Rlc3RUb29sU2V0SWQnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9vbFNldEJ5TmFtZScsICgpID0+IHtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHQndG9vbFNldDEnLFxuXHRcdFx0J3JlZk5hbWUxJ1xuXHRcdCkpO1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0J3Rvb2xTZXQyJyxcblx0XHRcdCdyZWZOYW1lMidcblx0XHQpKTtcblxuXHRcdC8vIFNob3VsZCBmaW5kIGJ5IHJlZmVyZW5jZSBuYW1lXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0VG9vbFNldEJ5TmFtZSgncmVmTmFtZTEnKT8uaWQsICd0b29sU2V0MScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFRvb2xTZXRCeU5hbWUoJ3JlZk5hbWUyJyk/LmlkLCAndG9vbFNldDInKTtcblxuXHRcdC8vIFNob3VsZCBub3QgZmluZCBub24tZXhpc3RlbnQgbmFtZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFRvb2xTZXRCeU5hbWUoJ25vbkV4aXN0ZW50TmFtZScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUb29scyB3aXRoIGluY2x1ZGVEaXNhYmxlZCBwYXJhbWV0ZXInLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCB0aGUgaW5jbHVkZURpc2FibGVkIHBhcmFtZXRlciBiZWhhdmlvciB3aXRoIGNvbnRleHQga2V5c1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgndGVzdEtleScsIGZhbHNlKTtcblx0XHRjb25zdCBkaXNhYmxlZFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZGlzYWJsZWRUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdEaXNhYmxlZCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRGlzYWJsZWQgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKCd0ZXN0S2V5JywgdHJ1ZSksIC8vIFdpbGwgYmUgZGlzYWJsZWQgc2luY2UgdGVzdEtleSBpcyBmYWxzZVxuXHRcdH07XG5cblx0XHRjb25zdCBlbmFibGVkVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdlbmFibGVkVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnRW5hYmxlZCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRW5hYmxlZCBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZGlzYWJsZWRUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShlbmFibGVkVG9vbCkpO1xuXG5cdFx0Y29uc3QgZW5hYmxlZFRvb2xzID0gQXJyYXkuZnJvbShzZXJ2aWNlLmdldFRvb2xzKHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkVG9vbHMubGVuZ3RoLCAxLCAnU2hvdWxkIG9ubHkgcmV0dXJuIGVuYWJsZWQgdG9vbHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZFRvb2xzWzBdLmlkLCAnZW5hYmxlZFRvb2wnKTtcblxuXHRcdGNvbnN0IGFsbFRvb2xzID0gQXJyYXkuZnJvbShzZXJ2aWNlLmdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFsbFRvb2xzLmxlbmd0aCwgMiwgJ2dldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQgc2hvdWxkIHJldHVybiBhbGwgdG9vbHMnKTtcblx0fSk7XG5cblx0dGVzdCgndG9vbCByZWdpc3RyYXRpb24gZHVwbGljYXRlIGVycm9yJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2R1cGxpY2F0ZVRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0R1cGxpY2F0ZSBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRHVwbGljYXRlIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Ly8gRmlyc3QgcmVnaXN0cmF0aW9uIHNob3VsZCBzdWNjZWVkXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YSkpO1xuXG5cdFx0Ly8gU2Vjb25kIHJlZ2lzdHJhdGlvbiBzaG91bGQgdGhyb3dcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YSk7XG5cdFx0fSwgL1Rvb2wgXCJkdXBsaWNhdGVUb29sXCIgaXMgYWxyZWFkeSByZWdpc3RlcmVkLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rvb2wgaW1wbGVtZW50YXRpb24gcmVnaXN0cmF0aW9uIHdpdGhvdXQgZGF0YSB0aHJvd3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbEltcGw6IElUb29sSW1wbCA9IHtcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW10gfSksXG5cdFx0fTtcblxuXHRcdC8vIFNob3VsZCB0aHJvdyB3aGVuIHJlZ2lzdGVyaW5nIGltcGxlbWVudGF0aW9uIGZvciBub24tZXhpc3RlbnQgdG9vbFxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclRvb2xJbXBsZW1lbnRhdGlvbignbm9uRXhpc3RlbnRUb29sJywgdG9vbEltcGwpO1xuXHRcdH0sIC9Ub29sIFwibm9uRXhpc3RlbnRUb29sXCIgd2FzIG5vdCBjb250cmlidXRlZC8pO1xuXHR9KTtcblxuXHR0ZXN0KCd0b29sIGltcGxlbWVudGF0aW9uIGR1cGxpY2F0ZSByZWdpc3RyYXRpb24gdGhyb3dzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3Rlc3RUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdG9vbEltcGwxOiBJVG9vbEltcGwgPSB7XG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFtdIH0pLFxuXHRcdH07XG5cblx0XHRjb25zdCB0b29sSW1wbDI6IElUb29sSW1wbCA9IHtcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW10gfSksXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGEpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xJbXBsZW1lbnRhdGlvbigndGVzdFRvb2wnLCB0b29sSW1wbDEpKTtcblxuXHRcdC8vIFNlY29uZCBpbXBsZW1lbnRhdGlvbiBzaG91bGQgdGhyb3dcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJUb29sSW1wbGVtZW50YXRpb24oJ3Rlc3RUb29sJywgdG9vbEltcGwyKTtcblx0XHR9LCAvVG9vbCBcInRlc3RUb29sXCIgYWxyZWFkeSBoYXMgYW4gaW1wbGVtZW50YXRpb24vKTtcblx0fSk7XG5cblx0dGVzdCgnaW52b2tlVG9vbCB3aXRoIHVua25vd24gdG9vbCB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZHRvOiBJVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRjYWxsSWQ6ICcxJyxcblx0XHRcdHRvb2xJZDogJ3Vua25vd25Ub29sJyxcblx0XHRcdHRva2VuQnVkZ2V0OiAxMDAsXG5cdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHRcdGNvbnRleHQ6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRzZXJ2aWNlLmludm9rZVRvb2woZHRvLCBhc3luYyAoKSA9PiAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdC9Ub29sIHVua25vd25Ub29sIHdhcyBub3QgY29udHJpYnV0ZWQvXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW52b2tlVG9vbCB3aXRob3V0IGltcGxlbWVudGF0aW9uIGFjdGl2YXRlcyBleHRlbnNpb24gYW5kIHRocm93cyBpZiBzdGlsbCBub3QgZm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZXh0ZW5zaW9uQWN0aXZhdGlvblRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0V4dGVuc2lvbiBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRXh0ZW5zaW9uIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sRGF0YSkpO1xuXG5cdFx0Y29uc3QgZHRvOiBJVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRjYWxsSWQ6ICcxJyxcblx0XHRcdHRvb2xJZDogJ2V4dGVuc2lvbkFjdGl2YXRpb25Ub29sJyxcblx0XHRcdHRva2VuQnVkZ2V0OiAxMDAsXG5cdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHRcdGNvbnRleHQ6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0Ly8gU2hvdWxkIHRocm93IGFmdGVyIGF0dGVtcHRpbmcgZXh0ZW5zaW9uIGFjdGl2YXRpb25cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdHNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0L1Rvb2wgZXh0ZW5zaW9uQWN0aXZhdGlvblRvb2wgZG9lcyBub3QgaGF2ZSBhbiBpbXBsZW1lbnRhdGlvbiByZWdpc3RlcmVkL1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludm9rZVRvb2wgd2l0aG91dCBjb250ZXh0IChub24tY2hhdCBzY2VuYXJpbyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3Qoc2VydmljZSwgc3RvcmUsICdub25DaGF0VG9vbCcsIHtcblx0XHRcdGludm9rZTogYXN5bmMgKGludm9jYXRpb24pID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24uY29udGV4dCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ25vbi1jaGF0IHJlc3VsdCcgfV0gfTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IHRlc3Q6IDEgfSk7IC8vIE5vIGNvbnRleHRcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ25vbi1jaGF0IHJlc3VsdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZva2VUb29sIHdpdGggdW5rbm93biBjaGF0IHNlc3Npb24gdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHNlcnZpY2UsIHN0b3JlLCAndW5rbm93blNlc3Npb25Ub29sJywge1xuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnc2hvdWxkIG5vdCByZWFjaCcgfV0gfSlcblx0XHR9KTtcblxuXHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IHRlc3Q6IDEgfSwgeyBzZXNzaW9uSWQ6ICd1bmtub3duU2Vzc2lvbicgfSk7XG5cblx0XHQvLyBUZXN0IHRoYXQgaXQgdGhyb3dzLCByZWdhcmRsZXNzIG9mIGV4YWN0IGVycm9yIG1lc3NhZ2Vcblx0XHRsZXQgdGhyZXdFcnJvciA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVRvb2woZHRvLCBhc3luYyAoKSA9PiAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRocmV3RXJyb3IgPSB0cnVlO1xuXHRcdFx0Ly8gVmVyaWZ5IGl0J3Mgb25lIG9mIHRoZSBleHBlY3RlZCBlcnJvciB0eXBlc1xuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRlcnIgaW5zdGFuY2VvZiBFcnJvciAmJiAoXG5cdFx0XHRcdFx0ZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ1Rvb2wgY2FsbGVkIGZvciB1bmtub3duIGNoYXQgc2Vzc2lvbicpIHx8XG5cdFx0XHRcdFx0ZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ2dldFJlcXVlc3RzIGlzIG5vdCBhIGZ1bmN0aW9uJylcblx0XHRcdFx0KSxcblx0XHRcdFx0YFVuZXhwZWN0ZWQgZXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmV3RXJyb3IsIHRydWUsICdTaG91bGQgaGF2ZSB0aHJvd24gYW4gZXJyb3InKTtcblx0fSk7XG5cblx0dGVzdCgndG9vbCBlcnJvciB3aXRoIGFsd2F5c0Rpc3BsYXlJbnB1dE91dHB1dCBpbmNsdWRlcyBkZXRhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2Vycm9yVG9vbFdpdGhJTycsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnRXJyb3IgVG9vbCBXaXRoIElPJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRXJyb3IgVG9vbCBXaXRoIElPJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRhbHdheXNEaXNwbGF5SW5wdXRPdXRwdXQ6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3Qoc2VydmljZSwgc3RvcmUsIHRvb2xEYXRhLmlkLCB7XG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdUb29sIGV4ZWN1dGlvbiBmYWlsZWQnKTsgfVxuXHRcdH0sIHRvb2xEYXRhKTtcblxuXHRcdGNvbnN0IGlucHV0ID0geyBwYXJhbTogJ3Rlc3RWYWx1ZScgfTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRcdHRvb2wubWFrZUR0byhpbnB1dCksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGhhdmUgdGhyb3duJyk7XG5cdFx0fSBjYXRjaCAoZXJyOiBhbnkpIHtcblx0XHRcdC8vIFRoZSBlcnJvciBzaG91bGQgYnViYmxlIHVwLCBidXQgd2UgbmVlZCB0byBjaGVjayBpZiB0b29sUmVzdWx0RXJyb3IgaXMgc2V0XG5cdFx0XHQvLyBUaGlzIHRlc3RzIHRoZSBpbnRlcm5hbCBlcnJvciBoYW5kbGluZyBwYXRoXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyLm1lc3NhZ2UsICdUb29sIGV4ZWN1dGlvbiBmYWlsZWQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRleHQga2V5IGNoYW5nZXMgdHJpZ2dlciB0b29sIHVwZGF0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNoYW5nZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2VydmljZS5vbkRpZENoYW5nZVRvb2xzKCgpID0+IHtcblx0XHRcdGNoYW5nZUV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdH0pO1xuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlKTtcblxuXHRcdC8vIENyZWF0ZSBhIHRvb2wgd2l0aCBhIGNvbnRleHQga2V5IGRlcGVuZGVuY3lcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ2R5bmFtaWNLZXknLCBmYWxzZSk7XG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnY29udGV4dFRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0NvbnRleHQgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0NvbnRleHQgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKCdkeW5hbWljS2V5JywgdHJ1ZSksXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGEpKTtcblxuXHRcdC8vIENoYW5nZSB0aGUgY29udGV4dCBrZXkgdmFsdWVcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ2R5bmFtaWNLZXknLCB0cnVlKTtcblxuXHRcdHNlcnZpY2UuZmx1c2hUb29sVXBkYXRlcygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50RmlyZWQsIHRydWUsICdvbkRpZENoYW5nZVRvb2xzIHNob3VsZCBmaXJlIHdoZW4gY29udGV4dCBrZXlzIGNoYW5nZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmF0aW9uIGNoYW5nZXMgdHJpZ2dlciB0b29sIHVwZGF0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNoYW5nZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2VydmljZS5vbkRpZENoYW5nZVRvb2xzKCgpID0+IHtcblx0XHRcdGNoYW5nZUV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdH0pO1xuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlKTtcblxuXHRcdC8vIENoYW5nZSB0aGUgY29ycmVjdCBjb25maWd1cmF0aW9uIGtleVxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmV4dGVuc2lvblRvb2xzLmVuYWJsZWQnLCBmYWxzZSk7XG5cdFx0Ly8gRmlyZSB0aGUgY29uZmlndXJhdGlvbiBjaGFuZ2UgZXZlbnQgbWFudWFsbHlcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246ICgpID0+IHRydWUsXG5cdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoWydjaGF0LmV4dGVuc2lvblRvb2xzLmVuYWJsZWQnXSksXG5cdFx0XHRjaGFuZ2U6IG51bGwhLFxuXHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJcblx0XHR9IHNhdGlzZmllcyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTtcblxuXHRcdHNlcnZpY2UuZmx1c2hUb29sVXBkYXRlcygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50RmlyZWQsIHRydWUsICdvbkRpZENoYW5nZVRvb2xzIHNob3VsZCBmaXJlIHdoZW4gY29uZmlndXJhdGlvbiBjaGFuZ2VzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwIHdpdGggTUNQIHRvb2xzZXQgZW5hYmxlcyBjb250YWluZWQgdG9vbHMnLCAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIE1DUCB0b29sc2V0XG5cdFx0Y29uc3QgbWNwVG9vbFNldCA9IHN0b3JlLmFkZChzZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHR7IHR5cGU6ICdtY3AnLCBsYWJlbDogJ3Rlc3RTZXJ2ZXInLCBzZXJ2ZXJMYWJlbDogJ3Rlc3RTZXJ2ZXInLCBpbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCwgY29sbGVjdGlvbklkOiAndGVzdENvbGxlY3Rpb24nLCBkZWZpbml0aW9uSWQ6ICd0ZXN0RGVmJyB9LFxuXHRcdFx0J21jcFNldCcsXG5cdFx0XHQnbWNwU2V0UmVmJ1xuXHRcdCkpO1xuXG5cdFx0Y29uc3QgbWNwVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdtY3BUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdNQ1AgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ01DUCBUb29sJyxcblx0XHRcdHNvdXJjZTogeyB0eXBlOiAnbWNwJywgbGFiZWw6ICd0ZXN0U2VydmVyJywgc2VydmVyTGFiZWw6ICd0ZXN0U2VydmVyJywgaW5zdHJ1Y3Rpb25zOiB1bmRlZmluZWQsIGNvbGxlY3Rpb25JZDogJ3Rlc3RDb2xsZWN0aW9uJywgZGVmaW5pdGlvbklkOiAndGVzdERlZicgfSxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdtY3BUb29sUmVmJ1xuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKG1jcFRvb2wpKTtcblx0XHRzdG9yZS5hZGQobWNwVG9vbFNldC5hZGRUb29sKG1jcFRvb2wpKTtcblxuXHRcdC8vIEVuYWJsZSB0aGUgTUNQIHRvb2xzZXRcblx0XHR7XG5cdFx0XHRjb25zdCBlbmFibGVkTmFtZXMgPSBbbWNwVG9vbFNldF0ubWFwKHQgPT4gc2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZSh0KSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKGVuYWJsZWROYW1lcywgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQobWNwVG9vbFNldCksIHRydWUsICdNQ1AgdG9vbHNldCBzaG91bGQgYmUgZW5hYmxlZCcpOyAvLyBFbnN1cmUgdGhlIHRvb2xzZXQgaXMgaW4gdGhlIG1hcFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQobWNwVG9vbCksIHRydWUsICdNQ1AgdG9vbCBzaG91bGQgYmUgZW5hYmxlZCB3aGVuIGl0cyB0b29sc2V0IGlzIGVuYWJsZWQnKTsgLy8gRW5zdXJlIHRoZSB0b29sIGlzIGluIHRoZSBtYXBcblxuXHRcdFx0Y29uc3QgZnVsbFJlZmVyZW5jZU5hbWVzID0gc2VydmljZS50b0Z1bGxSZWZlcmVuY2VOYW1lcyhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmdWxsUmVmZXJlbmNlTmFtZXMuc29ydCgpLCBlbmFibGVkTmFtZXMuc29ydCgpLCAndG9GdWxsUmVmZXJlbmNlTmFtZXMgc2hvdWxkIHJldHVybiB0aGUgb3JpZ2luYWwgZW5hYmxlZCBuYW1lcycpO1xuXHRcdH1cblx0XHQvLyBFbmFibGUgYSB0b29sIGZyb20gdGhlIE1DUCB0b29sc2V0XG5cdFx0e1xuXHRcdFx0Y29uc3QgZW5hYmxlZE5hbWVzID0gW21jcFRvb2xdLm1hcCh0ID0+IHNlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWUodCwgbWNwVG9vbFNldCkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChlbmFibGVkTmFtZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KG1jcFRvb2xTZXQpLCBmYWxzZSwgJ01DUCB0b29sc2V0IHNob3VsZCBiZSBkaXNhYmxlZCcpOyAvLyBFbnN1cmUgdGhlIHRvb2xzZXQgaXMgaW4gdGhlIG1hcFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQobWNwVG9vbCksIHRydWUsICdNQ1AgdG9vbCBzaG91bGQgYmUgZW5hYmxlZCcpOyAvLyBFbnN1cmUgdGhlIHRvb2wgaXMgaW4gdGhlIG1hcFxuXG5cdFx0XHRjb25zdCBmdWxsUmVmZXJlbmNlTmFtZXMgPSBzZXJ2aWNlLnRvRnVsbFJlZmVyZW5jZU5hbWVzKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZ1bGxSZWZlcmVuY2VOYW1lcy5zb3J0KCksIGVuYWJsZWROYW1lcy5zb3J0KCksICd0b0Z1bGxSZWZlcmVuY2VOYW1lcyBzaG91bGQgcmV0dXJuIHRoZSBvcmlnaW5hbCBlbmFibGVkIG5hbWVzJyk7XG5cdFx0fVxuXG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZEF1dG9Db25maXJtIHdpdGggd29ya3NwYWNlLXNwZWNpZmljIHRvb2wgY29uZmlndXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2U6IHRlc3RTZXJ2aWNlLCBjaGF0U2VydmljZTogdGVzdENoYXRTZXJ2aWNlIH0gPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlLCB7XG5cdFx0XHRjb25maWd1cmVTZXJ2aWNlczogY29uZmlnID0+IHtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScsIHsgJ3dvcmtzcGFjZVRvb2wnOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlVG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAnd29ya3NwYWNlVG9vbCcsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHsgY29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdUZXN0JywgbWVzc2FnZTogJ1dvcmtzcGFjZSB0b29sJyB9IH0pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnd29ya3NwYWNlIHJlc3VsdCcgfV0gfSlcblx0XHR9LCB7IHJ1bnNJbldvcmtzcGFjZTogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICd3b3Jrc3BhY2UtdGVzdCc7XG5cdFx0c3R1YkdldFNlc3Npb24odGVzdENoYXRTZXJ2aWNlLCBzZXNzaW9uSWQsIHsgcmVxdWVzdElkOiAncmVxMScgfSk7XG5cblx0XHQvLyBTaG91bGQgYXV0by1hcHByb3ZlIGJhc2VkIG9uIHVzZXIgY29uZmlndXJhdGlvblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR3b3Jrc3BhY2VUb29sLm1ha2VEdG8oeyB0ZXN0OiAxIH0sIHsgc2Vzc2lvbklkIH0pLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ3dvcmtzcGFjZSByZXN1bHQnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RnVsbFJlZmVyZW5jZU5hbWVzJywgKCkgPT4ge1xuXHRcdHNldHVwVG9vbHNGb3JUZXN0KHNlcnZpY2UsIHN0b3JlKTtcblxuXHRcdGNvbnN0IGZ1bGxSZWZlcmVuY2VOYW1lcyA9IEFycmF5LmZyb20oc2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZXMoKSkuc29ydCgpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWROYW1lcyA9IFtcblx0XHRcdCd0b29sMVJlZk5hbWUnLFxuXHRcdFx0J1Rvb2wyIERpc3BsYXkgTmFtZScsXG5cdFx0XHQnbXkuZXh0ZW5zaW9uL2V4dFRvb2wxUmVmTmFtZScsXG5cdFx0XHQnbWNwVG9vbFNldFJlZk5hbWUvKicsXG5cdFx0XHQnbWNwVG9vbFNldFJlZk5hbWUvbWNwVG9vbDFSZWZOYW1lJyxcblx0XHRcdCdpbnRlcm5hbFRvb2xTZXRSZWZOYW1lJyxcblx0XHRcdCdpbnRlcm5hbFRvb2xTZXRSZWZOYW1lL2ludGVybmFsVG9vbFNldFRvb2wxUmVmTmFtZScsXG5cdFx0XHQndnNjb2RlJyxcblx0XHRcdCdleGVjdXRlJyxcblx0XHRcdCdyZWFkJyxcblx0XHRcdCdhZ2VudCdcblx0XHRdLnNvcnQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnVsbFJlZmVyZW5jZU5hbWVzLCBleHBlY3RlZE5hbWVzLCAnZ2V0RnVsbFJlZmVyZW5jZU5hbWVzIHNob3VsZCByZXR1cm4gY29ycmVjdCBmdWxsIHJlZmVyZW5jZSBuYW1lcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXREZXByZWNhdGVkRnVsbFJlZmVyZW5jZU5hbWVzJywgKCkgPT4ge1xuXHRcdHNldHVwVG9vbHNGb3JUZXN0KHNlcnZpY2UsIHN0b3JlKTtcblxuXHRcdGNvbnN0IGRlcHJlY2F0ZWROYW1lcyA9IHNlcnZpY2UuZ2V0RGVwcmVjYXRlZEZ1bGxSZWZlcmVuY2VOYW1lcygpO1xuXG5cdFx0Ly8gVG9vbHMgaW4gaW50ZXJuYWwgdG9vbCBzZXRzIHNob3VsZCBoYXZlIHRoZWlyIGZ1bGwgcmVmZXJlbmNlIG5hbWVzIHdpdGggdG9vbHNldCBwcmVmaXgsIHRvb2xzIHNldHMga2VlcCB0aGVpciBuYW1lXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXByZWNhdGVkTmFtZXMuZ2V0KCdpbnRlcm5hbFRvb2xTZXRUb29sMVJlZk5hbWUnKSwgbmV3IFNldChbJ2ludGVybmFsVG9vbFNldFJlZk5hbWUvaW50ZXJuYWxUb29sU2V0VG9vbDFSZWZOYW1lJ10pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVwcmVjYXRlZE5hbWVzLmdldCgnaW50ZXJuYWxUb29sU2V0UmVmTmFtZScpLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gRm9yIGV4dGVuc2lvbiB0b29scywgdGhlIGZ1bGwgcmVmZXJlbmNlIG5hbWUgaW5jbHVkZXMgdGhlIGV4dGVuc2lvbiBJRFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVwcmVjYXRlZE5hbWVzLmdldCgnZXh0VG9vbDFSZWZOYW1lJyksIG5ldyBTZXQoWydteS5leHRlbnNpb24vZXh0VG9vbDFSZWZOYW1lJ10pKTtcblxuXHRcdC8vIEZvciBNQ1AgdG9vbCBzZXRzLCB0aGUgZnVsbCByZWZlcmVuY2UgbmFtZSBpbmNsdWRlcyB0aGUgLyogc3VmZml4XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXByZWNhdGVkTmFtZXMuZ2V0KCdtY3BUb29sU2V0UmVmTmFtZScpLCBuZXcgU2V0KFsnbWNwVG9vbFNldFJlZk5hbWUvKiddKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXByZWNhdGVkTmFtZXMuZ2V0KCdtY3BUb29sMVJlZk5hbWUnKSwgbmV3IFNldChbJ21jcFRvb2xTZXRSZWZOYW1lL21jcFRvb2wxUmVmTmFtZSddKSk7XG5cblx0XHQvLyBJbnRlcm5hbCB0b29sIHNldHMgYW5kIHVzZXIgdG9vbHMgc2V0cyBhbmQgdG9vbHMgd2l0aG91dCBuYW1lc3BhY2UgY2hhbmdlcyBzaG91bGQgbm90IGFwcGVhclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXByZWNhdGVkTmFtZXMuZ2V0KCdUb29sMiBEaXNwbGF5IE5hbWUnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVwcmVjYXRlZE5hbWVzLmdldCgndG9vbDFSZWZOYW1lJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlcHJlY2F0ZWROYW1lcy5nZXQoJ3VzZXJUb29sU2V0UmVmTmFtZScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXREZXByZWNhdGVkRnVsbFJlZmVyZW5jZU5hbWVzIGluY2x1ZGVzIG5hbWVzcGFjZWQgbGVnYWN5IG5hbWVzIGZvciB0b29scyBpbiB0b29sc2V0cycsICgpID0+IHtcblx0XHQvLyBXaGVuIGEgdG9vbCBpcyBpbiBhIHRvb2xzZXQgYW5kIGhhcyBsZWdhY3kgbmFtZXMsIHRoZSBkZXByZWNhdGVkIG5hbWVzIG1hcFxuXHRcdC8vIHNob3VsZCBhbHNvIGluY2x1ZGUgdGhlIG5hbWVzcGFjZWQgZm9ybSAoZS5nLiAndnNjb2RlL29sZE5hbWUnIFx1MjE5MiAndnNjb2RlL25ld05hbWUnKVxuXHRcdGNvbnN0IHRvb2xXaXRoTGVnYWN5OiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ215TmV3QnJvd3NlcicsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ29wZW5JbnRlZ3JhdGVkQnJvd3NlcicsXG5cdFx0XHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ29wZW5TaW1wbGVCcm93c2VyJ10sXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnT3BlbiBicm93c2VyJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnT3BlbiBJbnRlZ3JhdGVkIEJyb3dzZXInLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sV2l0aExlZ2FjeSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnZzY29kZVRvb2xTZXQuYWRkVG9vbCh0b29sV2l0aExlZ2FjeSkpO1xuXG5cdFx0Y29uc3QgZGVwcmVjYXRlZCA9IHNlcnZpY2UuZ2V0RGVwcmVjYXRlZEZ1bGxSZWZlcmVuY2VOYW1lcygpO1xuXG5cdFx0Ly8gVGhlIHNpbXBsZSBsZWdhY3kgbmFtZSBzaG91bGQgbWFwIHRvIHRoZSBmdWxsIHJlZmVyZW5jZSBuYW1lXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXByZWNhdGVkLmdldCgnb3BlblNpbXBsZUJyb3dzZXInKSwgbmV3IFNldChbJ3ZzY29kZS9vcGVuSW50ZWdyYXRlZEJyb3dzZXInXSkpO1xuXG5cdFx0Ly8gVGhlIG5hbWVzcGFjZWQgbGVnYWN5IG5hbWUgc2hvdWxkIGFsc28gbWFwIHRvIHRoZSBmdWxsIHJlZmVyZW5jZSBuYW1lXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXByZWNhdGVkLmdldCgndnNjb2RlL29wZW5TaW1wbGVCcm93c2VyJyksIG5ldyBTZXQoWyd2c2NvZGUvb3BlbkludGVncmF0ZWRCcm93c2VyJ10pKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUnLCAoKSA9PiB7XG5cdFx0c2V0dXBUb29sc0ZvclRlc3Qoc2VydmljZSwgc3RvcmUpO1xuXG5cdFx0Ly8gVGVzdCBmaW5kaW5nIHRvb2xzIGJ5IHRoZWlyIGZ1bGwgcmVmZXJlbmNlIG5hbWVzXG5cdFx0Y29uc3QgdG9vbDEgPSBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKCd0b29sMVJlZk5hbWUnKTtcblx0XHRhc3NlcnQub2sodG9vbDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sMS5pZCwgJ3Rvb2wxJyk7XG5cblx0XHRjb25zdCB0b29sMiA9IHNlcnZpY2UuZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUoJ1Rvb2wyIERpc3BsYXkgTmFtZScpO1xuXHRcdGFzc2VydC5vayh0b29sMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2wyLmlkLCAndG9vbDInKTtcblxuXHRcdGNvbnN0IGV4dFRvb2wgPSBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKCdteS5leHRlbnNpb24vZXh0VG9vbDFSZWZOYW1lJyk7XG5cdFx0YXNzZXJ0Lm9rKGV4dFRvb2wpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRUb29sLmlkLCAnZXh0VG9vbDEnKTtcblxuXHRcdGNvbnN0IG1jcFRvb2wgPSBzZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKCdtY3BUb29sU2V0UmVmTmFtZS9tY3BUb29sMVJlZk5hbWUnKTtcblx0XHRhc3NlcnQub2sobWNwVG9vbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1jcFRvb2wuaWQsICdtY3BUb29sMScpO1xuXG5cblx0XHRjb25zdCBtY3BUb29sU2V0ID0gc2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSgnbWNwVG9vbFNldFJlZk5hbWUvKicpO1xuXHRcdGFzc2VydC5vayhtY3BUb29sU2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWNwVG9vbFNldC5pZCwgJ21jcFRvb2xTZXQnKTtcblxuXHRcdGNvbnN0IGludGVybmFsVG9vbFNldCA9IHNlcnZpY2UuZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUoJ2ludGVybmFsVG9vbFNldFJlZk5hbWUvaW50ZXJuYWxUb29sU2V0VG9vbDFSZWZOYW1lJyk7XG5cdFx0YXNzZXJ0Lm9rKGludGVybmFsVG9vbFNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludGVybmFsVG9vbFNldC5pZCwgJ2ludGVybmFsVG9vbFNldFRvb2wxJyk7XG5cblx0XHQvLyBUZXN0IGZpbmRpbmcgdG9vbHMgd2l0aGluIHRvb2wgc2V0c1xuXHRcdGNvbnN0IHRvb2xJblNldCA9IHNlcnZpY2UuZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUoJ2ludGVybmFsVG9vbFNldFJlZk5hbWUnKTtcblx0XHRhc3NlcnQub2sodG9vbEluU2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbEluU2V0IS5pZCwgJ2ludGVybmFsVG9vbFNldCcpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWdpYmxlRm9yQXV0b0FwcHJvdmFsIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgdmlhIHBvbGljeScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUZXN0IHRoYXQgcG9saWN5IGNvbmZpZ3VyYXRpb24gd29ya3MgZm9yIGVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsXG5cdFx0Ly8gUG9saWN5IHZhbHVlcyBzaG91bGQgYmUgSlNPTiBzdHJpbmdzIGZvciBvYmplY3QtdHlwZSBzZXR0aW5nc1xuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHQvLyBTaW11bGF0ZSBwb2xpY3kgY29uZmlndXJhdGlvbiAod291bGQgY29tZSBmcm9tIHBvbGljeSBmaWxlKVxuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWwsIHtcblx0XHRcdFx0XHQndG9vbEEnOiB0cnVlLFxuXHRcdFx0XHRcdCd0b29sQic6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gVG9vbCBBIGlzIGVsaWdpYmxlICh0cnVlIGluIHBvbGljeSlcblx0XHRjb25zdCB0b29sQSA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAndG9vbEEnLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICd0b29sQSBleGVjdXRlZCcgfV0gfSlcblx0XHR9LCB7XG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3Rvb2xBJ1xuXHRcdH0pO1xuXG5cdFx0Ly8gVG9vbCBCIGlzIGluZWxpZ2libGUgKGZhbHNlIGluIHBvbGljeSlcblx0XHRjb25zdCB0b29sQiA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAndG9vbEInLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICd0b29sQiBleGVjdXRlZCcgfV0gfSlcblx0XHR9LCB7XG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3Rvb2xCJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtcG9saWN5Jztcblx0XHRzdHViR2V0U2Vzc2lvbih0ZXN0Q2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXExJyB9KTtcblxuXHRcdC8vIFRvb2wgQSBzaG91bGQgZXhlY3V0ZSB3aXRob3V0IGNvbmZpcm1hdGlvbiAoZWxpZ2libGUpXG5cdFx0Y29uc3QgcmVzdWx0QSA9IGF3YWl0IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR0b29sQS5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0QS5jb250ZW50WzBdLnZhbHVlLCAndG9vbEEgZXhlY3V0ZWQnKTtcblxuXHRcdC8vIFRvb2wgQiBzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gKGluZWxpZ2libGUpXG5cdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogYW55IH0gPSB7fTtcblx0XHRzdHViR2V0U2Vzc2lvbih0ZXN0Q2hhdFNlcnZpY2UsIHNlc3Npb25JZCArICcyJywgeyByZXF1ZXN0SWQ6ICdyZXEyJywgY2FwdHVyZSB9KTtcblx0XHRjb25zdCBwcm9taXNlQiA9IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR0b29sQi5tYWtlRHRvKHsgdGVzdDogMiB9LCB7IHNlc3Npb25JZDogc2Vzc2lvbklkICsgJzInIH0pLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlZCA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXHRcdGFzc2VydC5vayhwdWJsaXNoZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAndG9vbEIgc2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uIGR1ZSB0byBwb2xpY3knKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHVibGlzaGVkPy5jb25maXJtYXRpb25NZXNzYWdlcz8uYWxsb3dBdXRvQ29uZmlybSwgZmFsc2UsICdzaG91bGQgbm90IGFsbG93IGF1dG8gY29uZmlybScpO1xuXG5cdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwdWJsaXNoZWQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0QiA9IGF3YWl0IHByb21pc2VCO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRCLmNvbnRlbnRbMF0udmFsdWUsICd0b29sQiBleGVjdXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGlnaWJsZUZvckF1dG9BcHByb3ZhbCB3aXRoIGxlZ2FjeSB0b29sIHJlZmVyZW5jZSBuYW1lcyAtIGVsaWdpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRlc3QgYmFja3dhcmRzIGNvbXBhdGliaWxpdHk6IGNvbmZpZ3VyaW5nIGEgbGVnYWN5IG5hbWUgYXMgZWxpZ2libGUgc2hvdWxkIHdvcmtcblx0XHRjb25zdCB7IHNlcnZpY2U6IHRlc3RTZXJ2aWNlLCBjaGF0U2VydmljZTogdGVzdENoYXRTZXJ2aWNlIH0gPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlLCB7XG5cdFx0XHRjb25maWd1cmVTZXJ2aWNlczogY29uZmlnID0+IHtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsLCB7XG5cdFx0XHRcdFx0J29sZFRvb2xOYW1lJzogdHJ1ZSAgLy8gVXNpbmcgbGVnYWN5IG5hbWVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBUb29sIGhhcyBiZWVuIHJlbmFtZWQgYnV0IGhhcyBsZWdhY3kgbmFtZVxuXHRcdGNvbnN0IHJlbmFtZWRUb29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdCh0ZXN0U2VydmljZSwgc3RvcmUsICdyZW5hbWVkVG9vbCcsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHt9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3Rvb2wgZXhlY3V0ZWQgdmlhIGxlZ2FjeSBuYW1lJyB9XSB9KVxuXHRcdH0sIHtcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnbmV3VG9vbE5hbWUnLFxuXHRcdFx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydvbGRUb29sTmFtZSddXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1sZWdhY3ktZWxpZ2libGUnO1xuXHRcdHN0dWJHZXRTZXNzaW9uKHRlc3RDaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZDogJ3JlcTEnIH0pO1xuXG5cdFx0Ly8gVG9vbCBzaG91bGQgYmUgZWxpZ2libGUgZXZlbiB0aG91Z2ggd2UgY29uZmlndXJlZCB0aGUgbGVnYWN5IG5hbWVcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0U2VydmljZS5pbnZva2VUb29sKFxuXHRcdFx0cmVuYW1lZFRvb2wubWFrZUR0byh7IHRlc3Q6IDEgfSwgeyBzZXNzaW9uSWQgfSksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAndG9vbCBleGVjdXRlZCB2aWEgbGVnYWN5IG5hbWUnKTtcblx0fSk7XG5cblx0dGVzdCgnZWxpZ2libGVGb3JBdXRvQXBwcm92YWwgd2l0aCBsZWdhY3kgdG9vbCByZWZlcmVuY2UgbmFtZXMgLSBpbmVsaWdpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRlc3QgYmFja3dhcmRzIGNvbXBhdGliaWxpdHk6IGNvbmZpZ3VyaW5nIGEgbGVnYWN5IG5hbWUgYXMgaW5lbGlnaWJsZSBzaG91bGQgd29ya1xuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWwsIHtcblx0XHRcdFx0XHQnZGVwcmVjYXRlZFRvb2xOYW1lJzogZmFsc2UgIC8vIFVzaW5nIGxlZ2FjeSBuYW1lXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gVG9vbCBoYXMgYmVlbiByZW5hbWVkIGJ1dCBoYXMgbGVnYWN5IG5hbWVcblx0XHRjb25zdCByZW5hbWVkVG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAncmVuYW1lZFRvb2wyJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAndG9vbCByZXF1aXJlcyBjb25maXJtYXRpb24nIH1dIH0pXG5cdFx0fSwge1xuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdtb2Rlcm5Ub29sTmFtZScsXG5cdFx0XHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ2RlcHJlY2F0ZWRUb29sTmFtZSddXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1sZWdhY3ktaW5lbGlnaWJsZSc7XG5cdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogYW55IH0gPSB7fTtcblx0XHRzdHViR2V0U2Vzc2lvbih0ZXN0Q2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXExJywgY2FwdHVyZSB9KTtcblxuXHRcdC8vIFRvb2wgc2hvdWxkIGJlIGluZWxpZ2libGUgYW5kIHJlcXVpcmUgY29uZmlybWF0aW9uXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRyZW5hbWVkVG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRjb25zdCBwdWJsaXNoZWQgPSBhd2FpdCB3YWl0Rm9yUHVibGlzaGVkSW52b2NhdGlvbihjYXB0dXJlKTtcblx0XHRhc3NlcnQub2socHVibGlzaGVkPy5jb25maXJtYXRpb25NZXNzYWdlcywgJ3Rvb2wgc2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uIHdoZW4gbGVnYWN5IG5hbWUgaXMgaW5lbGlnaWJsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwdWJsaXNoZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hbGxvd0F1dG9Db25maXJtLCBmYWxzZSwgJ3Nob3VsZCBub3QgYWxsb3cgYXV0byBjb25maXJtJyk7XG5cblx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHB1Ymxpc2hlZCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ3Rvb2wgcmVxdWlyZXMgY29uZmlybWF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWdpYmxlRm9yQXV0b0FwcHJvdmFsIHdpdGggbXVsdGlwbGUgbGVnYWN5IG5hbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRlc3QgdGhhdCBhbnkgb2YgdGhlIGxlZ2FjeSBuYW1lcyBjYW4gYmUgdXNlZCBpbiB0aGUgY29uZmlndXJhdGlvblxuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWwsIHtcblx0XHRcdFx0XHQnc2Vjb25kTGVnYWN5TmFtZSc6IHRydWUgIC8vIFVzaW5nIHRoZSBzZWNvbmQgbGVnYWN5IG5hbWVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBUb29sIGhhcyBtdWx0aXBsZSBsZWdhY3kgbmFtZXNcblx0XHRjb25zdCBtdWx0aUxlZ2FjeVRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ211bHRpTGVnYWN5VG9vbCcsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHt9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ211bHRpIGxlZ2FjeSBleGVjdXRlZCcgfV0gfSlcblx0XHR9LCB7XG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2N1cnJlbnRUb29sTmFtZScsXG5cdFx0XHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ2ZpcnN0TGVnYWN5TmFtZScsICdzZWNvbmRMZWdhY3lOYW1lJywgJ3RoaXJkTGVnYWN5TmFtZSddXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1tdWx0aS1sZWdhY3knO1xuXHRcdHN0dWJHZXRTZXNzaW9uKHRlc3RDaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZDogJ3JlcTEnIH0pO1xuXG5cdFx0Ly8gVG9vbCBzaG91bGQgYmUgZWxpZ2libGUgdmlhIHNlY29uZCBsZWdhY3kgbmFtZVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRtdWx0aUxlZ2FjeVRvb2wubWFrZUR0byh7IHRlc3Q6IDEgfSwgeyBzZXNzaW9uSWQgfSksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnbXVsdGkgbGVnYWN5IGV4ZWN1dGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWdpYmxlRm9yQXV0b0FwcHJvdmFsIGN1cnJlbnQgbmFtZSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgbGVnYWN5IG5hbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRlc3QgZm9yd2FyZCBjb21wYXRpYmlsaXR5OiBjdXJyZW50IG5hbWUgaW4gY29uZmlnIHNob3VsZCB0YWtlIHByZWNlZGVuY2Vcblx0XHRjb25zdCB7IHNlcnZpY2U6IHRlc3RTZXJ2aWNlLCBjaGF0U2VydmljZTogdGVzdENoYXRTZXJ2aWNlIH0gPSBjcmVhdGVUZXN0VG9vbHNTZXJ2aWNlKHN0b3JlLCB7XG5cdFx0XHRjb25maWd1cmVTZXJ2aWNlczogY29uZmlnID0+IHtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsLCB7XG5cdFx0XHRcdFx0J2N1cnJlbnROYW1lJzogZmFsc2UsICAgICAgLy8gQ3VycmVudCBuYW1lIHNheXMgaW5lbGlnaWJsZVxuXHRcdFx0XHRcdCdvbGROYW1lJzogdHJ1ZSAgICAgICAgICAgLy8gTGVnYWN5IG5hbWUgc2F5cyBlbGlnaWJsZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ3ByZWNlZGVuY2VUb29sJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAncHJlY2VkZW5jZSB0ZXN0JyB9XSB9KVxuXHRcdH0sIHtcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnY3VycmVudE5hbWUnLFxuXHRcdFx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydvbGROYW1lJ11cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LXByZWNlZGVuY2UnO1xuXHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24odGVzdENoYXRTZXJ2aWNlLCBzZXNzaW9uSWQsIHsgcmVxdWVzdElkOiAncmVxMScsIGNhcHR1cmUgfSk7XG5cblx0XHQvLyBDdXJyZW50IG5hbWUgc2hvdWxkIHRha2UgcHJlY2VkZW5jZSwgc28gdG9vbCBzaG91bGQgYmUgaW5lbGlnaWJsZVxuXHRcdGNvbnN0IHByb21pc2UgPSB0ZXN0U2VydmljZS5pbnZva2VUb29sKFxuXHRcdFx0dG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRjb25zdCBwdWJsaXNoZWQgPSBhd2FpdCB3YWl0Rm9yUHVibGlzaGVkSW52b2NhdGlvbihjYXB0dXJlKTtcblx0XHRhc3NlcnQub2socHVibGlzaGVkPy5jb25maXJtYXRpb25NZXNzYWdlcywgJ2N1cnJlbnQgbmFtZSBzaG91bGQgdGFrZSBwcmVjZWRlbmNlIG92ZXIgbGVnYWN5IG5hbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHVibGlzaGVkPy5jb25maXJtYXRpb25NZXNzYWdlcz8uYWxsb3dBdXRvQ29uZmlybSwgZmFsc2UsICdzaG91bGQgbm90IGFsbG93IGF1dG8gY29uZmlybScpO1xuXG5cdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwdWJsaXNoZWQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdwcmVjZWRlbmNlIHRlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnZWxpZ2libGVGb3JBdXRvQXBwcm92YWwgd2l0aCBsZWdhY3kgZnVsbCByZWZlcmVuY2UgbmFtZXMgZnJvbSB0b29sc2V0cycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUZXN0IGxlZ2FjeSBuYW1lcyB0aGF0IGluY2x1ZGUgdG9vbHNldCBwcmVmaXhlcyAoZS5nLiwgJ29sZFRvb2xTZXQvb2xkVG9vbE5hbWUnKVxuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWwsIHtcblx0XHRcdFx0XHQnb2xkVG9vbFNldC9vbGRUb29sTmFtZSc6IGZhbHNlICAvLyBMZWdhY3kgZnVsbCByZWZlcmVuY2UgbmFtZSBmcm9tIG9sZCB0b29sc2V0XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gVG9vbCB3YXMgaW4gYW4gb2xkIHRvb2xzZXQgYnV0IG5vdyBzdGFuZGFsb25lXG5cdFx0Y29uc3QgbWlncmF0ZWRUb29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdCh0ZXN0U2VydmljZSwgc3RvcmUsICdtaWdyYXRlZFRvb2wnLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdtaWdyYXRlZCB0b29sJyB9XSB9KVxuXHRcdH0sIHtcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnc3RhbmRhbG9uZVRvb2xOYW1lJyxcblx0XHRcdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnb2xkVG9vbFNldC9vbGRUb29sTmFtZSddXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1mdWxsUmVmZXJlbmNlTmFtZS1sZWdhY3knO1xuXHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24odGVzdENoYXRTZXJ2aWNlLCBzZXNzaW9uSWQsIHsgcmVxdWVzdElkOiAncmVxMScsIGNhcHR1cmUgfSk7XG5cblx0XHQvLyBUb29sIHNob3VsZCBiZSBpbmVsaWdpYmxlIGJhc2VkIG9uIGxlZ2FjeSBmdWxsIHJlZmVyZW5jZSBuYW1lXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRtaWdyYXRlZFRvb2wubWFrZUR0byh7IHRlc3Q6IDEgfSwgeyBzZXNzaW9uSWQgfSksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0Y29uc3QgcHVibGlzaGVkID0gYXdhaXQgd2FpdEZvclB1Ymxpc2hlZEludm9jYXRpb24oY2FwdHVyZSk7XG5cdFx0YXNzZXJ0Lm9rKHB1Ymxpc2hlZD8uY29uZmlybWF0aW9uTWVzc2FnZXMsICd0b29sIHNob3VsZCBiZSBpbmVsaWdpYmxlIHZpYSBsZWdhY3kgZnVsbCByZWZlcmVuY2UgbmFtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwdWJsaXNoZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hbGxvd0F1dG9Db25maXJtLCBmYWxzZSwgJ3Nob3VsZCBub3QgYWxsb3cgYXV0byBjb25maXJtJyk7XG5cblx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHB1Ymxpc2hlZCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ21pZ3JhdGVkIHRvb2wnKTtcblx0fSk7XG5cblx0dGVzdCgnZWxpZ2libGVGb3JBdXRvQXBwcm92YWwgbWl4ZWQgY3VycmVudCBhbmQgbGVnYWN5IG5hbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRlc3QgcmVhbGlzdGljIG1pZ3JhdGlvbiBzY2VuYXJpbyB3aXRoIG1peGVkIGN1cnJlbnQgYW5kIGxlZ2FjeSBuYW1lc1xuXHRcdGNvbnN0IHsgc2VydmljZTogdGVzdFNlcnZpY2UsIGNoYXRTZXJ2aWNlOiB0ZXN0Q2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdGNvbmZpZ3VyZVNlcnZpY2VzOiBjb25maWcgPT4ge1xuXHRcdFx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWwsIHtcblx0XHRcdFx0XHQnbW9kZXJuVG9vbCc6IHRydWUsICAgICAgICAgICAvLyBDdXJyZW50IG5hbWVcblx0XHRcdFx0XHQnbGVnYWN5VG9vbE9sZCc6IGZhbHNlLCAgICAgIC8vIExlZ2FjeSBuYW1lXG5cdFx0XHRcdFx0J3VuY2hhbmdlZFRvb2wnOiB0cnVlICAgICAgICAvLyBUb29sIHRoYXQgbmV2ZXIgY2hhbmdlZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIE1vZGVybiB0b29sIHdpdGggY3VycmVudCBuYW1lXG5cdFx0Y29uc3QgdG9vbDEgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ3Rvb2wxJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnbW9kZXJuIGV4ZWN1dGVkJyB9XSB9KVxuXHRcdH0sIHtcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnbW9kZXJuVG9vbCdcblx0XHR9KTtcblxuXHRcdC8vIFJlbmFtZWQgdG9vbCB3aXRoIGxlZ2FjeSBuYW1lXG5cdFx0Y29uc3QgdG9vbDIgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ3Rvb2wyJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnbGVnYWN5IG5lZWRzIGNvbmZpcm1hdGlvbicgfV0gfSlcblx0XHR9LCB7XG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2xlZ2FjeVRvb2xOZXcnLFxuXHRcdFx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydsZWdhY3lUb29sT2xkJ11cblx0XHR9KTtcblxuXHRcdC8vIFVuY2hhbmdlZCB0b29sXG5cdFx0Y29uc3QgdG9vbDMgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ3Rvb2wzJywge1xuXHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAndW5jaGFuZ2VkIGV4ZWN1dGVkJyB9XSB9KVxuXHRcdH0sIHtcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndW5jaGFuZ2VkVG9vbCdcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LW1peGVkJztcblx0XHRzdHViR2V0U2Vzc2lvbih0ZXN0Q2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXExJyB9KTtcblxuXHRcdC8vIFRvb2wgMSBzaG91bGQgYmUgZWxpZ2libGUgKGN1cnJlbnQgbmFtZSlcblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgdGVzdFNlcnZpY2UuaW52b2tlVG9vbChcblx0XHRcdHRvb2wxLm1ha2VEdG8oeyB0ZXN0OiAxIH0sIHsgc2Vzc2lvbklkIH0pLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLmNvbnRlbnRbMF0udmFsdWUsICdtb2Rlcm4gZXhlY3V0ZWQnKTtcblxuXHRcdC8vIFRvb2wgMiBzaG91bGQgYmUgaW5lbGlnaWJsZSAobGVnYWN5IG5hbWUpXG5cdFx0Y29uc3QgY2FwdHVyZTI6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24odGVzdENoYXRTZXJ2aWNlLCBzZXNzaW9uSWQgKyAnMicsIHsgcmVxdWVzdElkOiAncmVxMicsIGNhcHR1cmU6IGNhcHR1cmUyIH0pO1xuXHRcdGNvbnN0IHByb21pc2UyID0gdGVzdFNlcnZpY2UuaW52b2tlVG9vbChcblx0XHRcdHRvb2wyLm1ha2VEdG8oeyB0ZXN0OiAyIH0sIHsgc2Vzc2lvbklkOiBzZXNzaW9uSWQgKyAnMicgfSksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0Y29uc3QgcHVibGlzaGVkMiA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUyKTtcblx0XHRhc3NlcnQub2socHVibGlzaGVkMj8uY29uZmlybWF0aW9uTWVzc2FnZXMsICd0b29sMiBzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gdmlhIGxlZ2FjeSBuYW1lJyk7XG5cblx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHB1Ymxpc2hlZDIsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0MiA9IGF3YWl0IHByb21pc2UyO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmNvbnRlbnRbMF0udmFsdWUsICdsZWdhY3kgbmVlZHMgY29uZmlybWF0aW9uJyk7XG5cblx0XHQvLyBUb29sIDMgc2hvdWxkIGJlIGVsaWdpYmxlICh1bmNoYW5nZWQpXG5cdFx0Y29uc3QgcmVzdWx0MyA9IGF3YWl0IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR0b29sMy5tYWtlRHRvKHsgdGVzdDogMyB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0My5jb250ZW50WzBdLnZhbHVlLCAndW5jaGFuZ2VkIGV4ZWN1dGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWdpYmxlRm9yQXV0b0FwcHJvdmFsIHdpdGggbmFtZXNwYWNlZCBsZWdhY3kgbmFtZXMgLSBmdWxsIHRvb2wgbmFtZSBlbGlnaWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0Q29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5FbGlnaWJsZUZvckF1dG9BcHByb3ZhbCwge1xuXHRcdFx0J2dpdFRvb2xzL2dpdENvbW1pdCc6IHRydWVcblx0XHR9KTtcblxuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiAoKSA9PiBzdG9yZS5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKHRlc3RDb25maWdTZXJ2aWNlKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gdGVzdENvbmZpZ1NlcnZpY2Vcblx0XHR9LCBzdG9yZSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBjaGF0U2VydmljZSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UsIG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJVG9vbFJlc3VsdENvbXByZXNzb3IsIG5vb3BUb29sUmVzdWx0Q29tcHJlc3Nvcik7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHRlc3RTZXJ2aWNlLCBzdG9yZSwgJ2dpdENvbW1pdFRvb2wnLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdjb21taXQgZXhlY3V0ZWQnIH1dIH0pXG5cdFx0fSwge1xuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdjb21taXQnLFxuXHRcdFx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydnaXRUb29scy9naXRDb21taXQnXVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtZXh0ZW5zaW9uLXByZWZpeCc7XG5cdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogYW55IH0gPSB7fTtcblx0XHRzdHViR2V0U2Vzc2lvbihjaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZDogJ3JlcTEnIH0pO1xuXG5cdFx0Ly8gVG9vbCBzaG91bGQgYmUgZWxpZ2libGUgdmlhIGxlZ2FjeSBleHRlbnNpb24tcHJlZml4ZWQgbmFtZVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR0b29sLm1ha2VEdG8oeyB0ZXN0OiAxIH0sIHsgc2Vzc2lvbklkIH0pLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0Y29uc3QgcHVibGlzaGVkID0gYXdhaXQgd2FpdEZvclB1Ymxpc2hlZEludm9jYXRpb24oY2FwdHVyZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB1Ymxpc2hlZCwgdW5kZWZpbmVkLCAndG9vbCBzaG91bGQgbm90IHJlcXVpcmUgY29uZmlybWF0aW9uIHdoZW4gbGVnYWN5IHRyaW1tZWQgbmFtZSBpcyBlbGlnaWJsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ2NvbW1pdCBleGVjdXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGlnaWJsZUZvckF1dG9BcHByb3ZhbCB3aXRoIG5hbWVzcGFjZWQgYW5kIHJlbmFtZWQgdG9vbG5hbWUgLSBqdXN0IGxhc3Qgc2VnbWVudCBlbGlnaWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0Q29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5FbGlnaWJsZUZvckF1dG9BcHByb3ZhbCwge1xuXHRcdFx0J2dpdENvbW1pdCc6IHRydWVcblx0XHR9KTtcblxuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiAoKSA9PiBzdG9yZS5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKHRlc3RDb25maWdTZXJ2aWNlKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gdGVzdENvbmZpZ1NlcnZpY2Vcblx0XHR9LCBzdG9yZSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBjaGF0U2VydmljZSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UsIG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJVG9vbFJlc3VsdENvbXByZXNzb3IsIG5vb3BUb29sUmVzdWx0Q29tcHJlc3Nvcik7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdC8vIFRvb2wgdGhhdCB3YXMgcHJldmlvdXNseSBuYW1lc3BhY2VkIHVuZGVyIGV4dGVuc2lvbiBidXQgaXMgbm93IGludGVybmFsXG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAnZ2l0Q29tbWl0VG9vbDInLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdjb21taXQgZXhlY3V0ZWQnIH1dIH0pXG5cdFx0fSwge1xuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdjb21taXQnLFxuXHRcdFx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydnaXRUb29scy9naXRDb21taXQnXVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtcmVuYW1lZC1wcmVmaXgnO1xuXHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24oY2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQ6ICdyZXExJyB9KTtcblxuXHRcdC8vIFRvb2wgc2hvdWxkIGJlIGVsaWdpYmxlIHZpYSBsZWdhY3kgZXh0ZW5zaW9uLXByZWZpeGVkIG5hbWVcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0U2VydmljZS5pbnZva2VUb29sKFxuXHRcdFx0dG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZCB9KSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdGNvbnN0IHB1Ymxpc2hlZCA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwdWJsaXNoZWQsIHVuZGVmaW5lZCwgJ3Rvb2wgc2hvdWxkIG5vdCByZXF1aXJlIGNvbmZpcm1hdGlvbiB3aGVuIGxlZ2FjeSB0cmltbWVkIG5hbWUgaXMgZWxpZ2libGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdjb21taXQgZXhlY3V0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZWxpZ2libGVGb3JBdXRvQXBwcm92YWwgd2l0aCBuYW1lc3BhY2VkIGxlZ2FjeSBuYW1lcyAtIGZ1bGwgdG9vbCBuYW1lIGluZWxpZ2libGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdENvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWwsIHtcblx0XHRcdCdnaXRUb29scy9naXRDb21taXQnOiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6ICgpID0+IHN0b3JlLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UodGVzdENvbmZpZ1NlcnZpY2UpKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiB0ZXN0Q29uZmlnU2VydmljZVxuXHRcdH0sIHN0b3JlKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIGNoYXRTZXJ2aWNlKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSwgbmV3IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElUb29sUmVzdWx0Q29tcHJlc3Nvciwgbm9vcFRvb2xSZXN1bHRDb21wcmVzc29yKTtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IHN0b3JlLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSkpO1xuXG5cdFx0Ly8gVG9vbCB0aGF0IHdhcyBwcmV2aW91c2x5IG5hbWVzcGFjZWQgdW5kZXIgZXh0ZW5zaW9uIGJ1dCBpcyBub3cgaW50ZXJuYWxcblx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdCh0ZXN0U2VydmljZSwgc3RvcmUsICdnaXRDb21taXRUb29sMycsIHtcblx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHt9KSxcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ2NvbW1pdCBibG9ja2VkJyB9XSB9KVxuXHRcdH0sIHtcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnY29tbWl0Jyxcblx0XHRcdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnc29tZXRoaW5nL3JhbmRvbScsICdnaXRUb29scy9iYXInLCAnZ2l0VG9vbHMvZ2l0Q29tbWl0J11cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LWV4dGVuc2lvbi1wcmVmaXgtYmxvY2tlZCc7XG5cdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogYW55IH0gPSB7fTtcblx0XHRzdHViR2V0U2Vzc2lvbihjaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZDogJ3JlcTEnLCBjYXB0dXJlIH0pO1xuXG5cdFx0Ly8gVG9vbCBzaG91bGQgYmUgaW5lbGlnaWJsZSB2aWEgbGVnYWN5IGV4dGVuc2lvbi1wcmVmaXhlZCBuYW1lXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR0b29sLm1ha2VEdG8oeyB0ZXN0OiAxIH0sIHsgc2Vzc2lvbklkIH0pLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlZCA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXHRcdGFzc2VydC5vayhwdWJsaXNoZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAndG9vbCBzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gd2hlbiBsZWdhY3kgZnVsbCBuYW1lIGlzIGluZWxpZ2libGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHVibGlzaGVkPy5jb25maXJtYXRpb25NZXNzYWdlcz8uYWxsb3dBdXRvQ29uZmlybSwgZmFsc2UsICdzaG91bGQgbm90IGFsbG93IGF1dG8gY29uZmlybScpO1xuXG5cdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwdWJsaXNoZWQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdjb21taXQgYmxvY2tlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGlnaWJsZUZvckF1dG9BcHByb3ZhbCB3aXRoIG5hbWVzcGFjZWQgYW5kIHJlbmFtZWQgdG9vbG5hbWUgLSBqdXN0IGxhc3Qgc2VnbWVudCBpbmVsaWdpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RDb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsLCB7XG5cdFx0XHQnZ2l0Q29tbWl0JzogZmFsc2Vcblx0XHR9KTtcblxuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiAoKSA9PiBzdG9yZS5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKHRlc3RDb25maWdTZXJ2aWNlKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gdGVzdENvbmZpZ1NlcnZpY2Vcblx0XHR9LCBzdG9yZSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBjaGF0U2VydmljZSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UsIG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJVG9vbFJlc3VsdENvbXByZXNzb3IsIG5vb3BUb29sUmVzdWx0Q29tcHJlc3Nvcik7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdC8vIFRvb2wgdGhhdCB3YXMgcHJldmlvdXNseSBuYW1lc3BhY2VkIHVuZGVyIGV4dGVuc2lvbiBidXQgaXMgbm93IGludGVybmFsXG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QodGVzdFNlcnZpY2UsIHN0b3JlLCAnZ2l0Q29tbWl0VG9vbDQnLCB7XG5cdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7fSksXG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdjb21taXQgYmxvY2tlZCcgfV0gfSlcblx0XHR9LCB7XG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2NvbW1pdCcsXG5cdFx0XHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ3NvbWV0aGluZy9yYW5kb20nLCAnZ2l0VG9vbHMvYmFyJywgJ2dpdFRvb2xzL2dpdENvbW1pdCddXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1yZW5hbWVkLXByZWZpeC1ibG9ja2VkJztcblx0XHRjb25zdCBjYXB0dXJlOiB7IGludm9jYXRpb24/OiBhbnkgfSA9IHt9O1xuXHRcdHN0dWJHZXRTZXNzaW9uKGNoYXRTZXJ2aWNlLCBzZXNzaW9uSWQsIHsgcmVxdWVzdElkOiAncmVxMScsIGNhcHR1cmUgfSk7XG5cblx0XHQvLyBUb29sIHNob3VsZCBiZSBpbmVsaWdpYmxlIHZpYSB0cmltbWVkIGxlZ2FjeSBuYW1lXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRlc3RTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHR0b29sLm1ha2VEdG8oeyB0ZXN0OiAxIH0sIHsgc2Vzc2lvbklkIH0pLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlZCA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXHRcdGFzc2VydC5vayhwdWJsaXNoZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAndG9vbCBzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gd2hlbiBsZWdhY3kgdHJpbW1lZCBuYW1lIGlzIGluZWxpZ2libGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHVibGlzaGVkPy5jb25maXJtYXRpb25NZXNzYWdlcz8uYWxsb3dBdXRvQ29uZmlybSwgZmFsc2UsICdzaG91bGQgbm90IGFsbG93IGF1dG8gY29uZmlybScpO1xuXG5cdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwdWJsaXNoZWQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdjb21taXQgYmxvY2tlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdiZWdpblRvb2xDYWxsIGNyZWF0ZXMgc3RyZWFtaW5nIHRvb2wgaW52b2NhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdChzZXJ2aWNlLCBzdG9yZSwgJ3N0cmVhbWluZ1Rvb2wnLCB7XG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdyZXN1bHQnIH1dIH0pLFxuXHRcdFx0aGFuZGxlVG9vbFN0cmVhbTogYXN5bmMgKCkgPT4gKHsgaW52b2NhdGlvbk1lc3NhZ2U6ICdQcm9jZXNzaW5nLi4uJyB9KSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdzdHJlYW1pbmctc2Vzc2lvbic7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gJ3N0cmVhbWluZy1yZXF1ZXN0Jztcblx0XHRzdHViR2V0U2Vzc2lvbihjaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZCB9KTtcblxuXHRcdGNvbnN0IGludm9jYXRpb24gPSBzZXJ2aWNlLmJlZ2luVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtMTIzJyxcblx0XHRcdHRvb2xJZDogdG9vbC5pZCxcblx0XHRcdGNoYXRSZXF1ZXN0SWQ6IHJlcXVlc3RJZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCksXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2soaW52b2NhdGlvbiwgJ2JlZ2luVG9vbENhbGwgc2hvdWxkIHJldHVybiBhbiBpbnZvY2F0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbElkLCB0b29sLmlkKTtcblx0fSk7XG5cblx0dGVzdCgnYmVnaW5Ub29sQ2FsbCByZXR1cm5zIHVuZGVmaW5lZCBmb3IgdW5rbm93biB0b29sJywgKCkgPT4ge1xuXHRcdGNvbnN0IGludm9jYXRpb24gPSBzZXJ2aWNlLmJlZ2luVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtdW5rbm93bicsXG5cdFx0XHR0b29sSWQ6ICdub25FeGlzdGVudFRvb2wnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24sIHVuZGVmaW5lZCwgJ2JlZ2luVG9vbENhbGwgc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIHVua25vd24gdG9vbHMnKTtcblx0fSk7XG5cblx0dGVzdCgnYmVnaW5Ub29sQ2FsbCByZXR1cm5zIHVuZGVmaW5lZCBmb3IgdG9vbCB3aXRob3V0IGhhbmRsZVRvb2xTdHJlYW0nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3Qoc2VydmljZSwgc3RvcmUsICdub1N0cmVhbVRvb2wnLCB7XG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdyZXN1bHQnIH1dIH0pLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbiA9IHNlcnZpY2UuYmVnaW5Ub29sQ2FsbCh7XG5cdFx0XHR0b29sQ2FsbElkOiAnY2FsbC1uby1zdHJlYW0nLFxuXHRcdFx0dG9vbElkOiB0b29sLmlkLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24sIHVuZGVmaW5lZCwgJ2JlZ2luVG9vbENhbGwgc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiB0b29sIGxhY2tzIGhhbmRsZVRvb2xTdHJlYW0nKTtcblx0fSk7XG5cblx0dGVzdCgnYmVnaW5Ub29sQ2FsbCB3aXRoIGZvcmNlIGNyZWF0ZXMgaW52b2NhdGlvbiBldmVuIHdpdGhvdXQgaGFuZGxlVG9vbFN0cmVhbScsICgpID0+IHtcblx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdChzZXJ2aWNlLCBzdG9yZSwgJ2ZvcmNlU3RyZWFtVG9vbCcsIHtcblx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3Jlc3VsdCcgfV0gfSksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uID0gc2VydmljZS5iZWdpblRvb2xDYWxsKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLWZvcmNlJyxcblx0XHRcdHRvb2xJZDogdG9vbC5pZCxcblx0XHRcdGZvcmNlOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGludm9jYXRpb24sICdiZWdpblRvb2xDYWxsIHdpdGggZm9yY2Ugc2hvdWxkIHJldHVybiBhbiBpbnZvY2F0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbElkLCB0b29sLmlkKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVG9vbFN0cmVhbSBjYWxscyBoYW5kbGVUb29sU3RyZWFtIG9uIHRvb2wgaW1wbGVtZW50YXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGhhbmRsZVRvb2xTdHJlYW1DYWxsZWQgPSBmYWxzZTtcblx0XHRsZXQgcmVjZWl2ZWRSYXdJbnB1dDogdW5rbm93bjtcblxuXHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHNlcnZpY2UsIHN0b3JlLCAnc3RyZWFtSGFuZGxlclRvb2wnLCB7XG5cdFx0XHRpbnZva2U6IGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdyZXN1bHQnIH1dIH0pLFxuXHRcdFx0aGFuZGxlVG9vbFN0cmVhbTogYXN5bmMgKGNvbnRleHQpID0+IHtcblx0XHRcdFx0aGFuZGxlVG9vbFN0cmVhbUNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdHJlY2VpdmVkUmF3SW5wdXQgPSBjb250ZXh0LnJhd0lucHV0O1xuXHRcdFx0XHRyZXR1cm4geyBpbnZvY2F0aW9uTWVzc2FnZTogJ1Byb2Nlc3NpbmcuLi4nIH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3N0cmVhbS1oYW5kbGVyLXNlc3Npb24nO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9ICdzdHJlYW0taGFuZGxlci1yZXF1ZXN0Jztcblx0XHRzdHViR2V0U2Vzc2lvbihjaGF0U2VydmljZSwgc2Vzc2lvbklkLCB7IHJlcXVlc3RJZCB9KTtcblxuXHRcdGNvbnN0IGludm9jYXRpb24gPSBzZXJ2aWNlLmJlZ2luVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtc3RyZWFtJyxcblx0XHRcdHRvb2xJZDogdG9vbC5pZCxcblx0XHRcdGNoYXRSZXF1ZXN0SWQ6IHJlcXVlc3RJZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCksXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2soaW52b2NhdGlvbiwgJ3Nob3VsZCBjcmVhdGUgaW52b2NhdGlvbicpO1xuXG5cdFx0Ly8gVXBkYXRlIHRoZSBzdHJlYW0gd2l0aCBwYXJ0aWFsIGlucHV0XG5cdFx0Y29uc3QgcGFydGlhbElucHV0ID0geyBwYXJ0aWFsOiAnZGF0YScgfTtcblx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZVRvb2xTdHJlYW0oJ2NhbGwtc3RyZWFtJywgcGFydGlhbElucHV0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYW5kbGVUb29sU3RyZWFtQ2FsbGVkLCB0cnVlLCAnaGFuZGxlVG9vbFN0cmVhbSBzaG91bGQgYmUgY2FsbGVkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZFJhd0lucHV0LCBwYXJ0aWFsSW5wdXQsICdzaG91bGQgcmVjZWl2ZSB0aGUgcGFydGlhbCBpbnB1dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVUb29sU3RyZWFtIGRvZXMgbm90aGluZyBmb3IgdW5rbm93biB0b29sIGNhbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2hvdWxkIG5vdCB0aHJvd1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlVG9vbFN0cmVhbSgndW5rbm93bi1jYWxsLWlkJywgeyBkYXRhOiAndGVzdCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwIHdpdGggbW9kZWwgbWV0YWRhdGEgZmlsdGVycyB0b29scycsICgpID0+IHtcblx0XHQvLyBUaGlzIHRlc3QgdmVyaWZpZXMgdGhhdCB3aGVuIGEgdG9vbCdzIG1vZGVscyBzZWxlY3RvciBtYXRjaGVzIHRoZSBwcm92aWRlZCBtb2RlbCxcblx0XHQvLyBpdCdzIGluY2x1ZGVkIGluIHRoZSBlbmFibGVtZW50IG1hcC5cblxuXHRcdC8vIFRvb2wgdGhhdCByZXF1aXJlcyBncHQtNCBmYW1pbHkgKG1hdGNoZXMgcHJvdmlkZWQgbW9kZWwpXG5cdFx0Y29uc3QgZ3B0NFRvb2xEZWY6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZ3B0NFRvb2wnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdncHQ0VG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnR1BULTQgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0dQVC00IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0bW9kZWxzOiBbeyBmYW1pbHk6ICdncHQtNCcgfV0sXG5cdFx0fTtcblxuXHRcdC8vIFRvb2wgd2l0aCBubyBtb2RlbHMgc2VsZWN0b3IgKGF2YWlsYWJsZSBmb3IgYWxsIG1vZGVscylcblx0XHRjb25zdCBhbnlNb2RlbFRvb2xEZWY6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnYW55TW9kZWxUb29sJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnYW55TW9kZWxUb29sUmVmJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdBbnkgTW9kZWwgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0FueSBNb2RlbCBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0Ly8gVG9vbCB0aGF0IHJlcXVpcmVzIGNsYXVkZSBmYW1pbHkgKHdvbid0IG1hdGNoKVxuXHRcdGNvbnN0IGNsYXVkZVRvb2xEZWY6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnY2xhdWRlVG9vbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2NsYXVkZVRvb2xSZWYnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0NsYXVkZSBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnQ2xhdWRlIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0bW9kZWxzOiBbeyBmYW1pbHk6ICdjbGF1ZGUtMycgfV0sXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZ3B0NFRvb2xEZWYpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGFueU1vZGVsVG9vbERlZikpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoY2xhdWRlVG9vbERlZikpO1xuXG5cdFx0Ly8gR2V0IHRoZSB0b29scyBmcm9tIHRoZSBzZXJ2aWNlXG5cdFx0Y29uc3QgZ3B0NFRvb2wgPSBzZXJ2aWNlLmdldFRvb2woJ2dwdDRUb29sJyk7XG5cdFx0Y29uc3QgYW55TW9kZWxUb29sID0gc2VydmljZS5nZXRUb29sKCdhbnlNb2RlbFRvb2wnKTtcblx0XHRjb25zdCBjbGF1ZGVUb29sID0gc2VydmljZS5nZXRUb29sKCdjbGF1ZGVUb29sJyk7XG5cdFx0YXNzZXJ0Lm9rKGdwdDRUb29sICYmIGFueU1vZGVsVG9vbCAmJiBjbGF1ZGVUb29sLCAndG9vbHMgc2hvdWxkIGJlIHJlZ2lzdGVyZWQnKTtcblxuXHRcdC8vIFByb3ZpZGUgbW9kZWwgbWV0YWRhdGEgZm9yIGdwdC00IGZhbWlseVxuXHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSB7IGlkOiAnZ3B0LTQtdHVyYm8nLCB2ZW5kb3I6ICdvcGVuYWknLCBmYW1pbHk6ICdncHQtNCcsIHZlcnNpb246ICcxLjAnIH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgZW5hYmxlZE5hbWVzID0gWydncHQ0VG9vbFJlZicsICdhbnlNb2RlbFRvb2xSZWYnLCAnY2xhdWRlVG9vbFJlZiddO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoZW5hYmxlZE5hbWVzLCBtb2RlbE1ldGFkYXRhKTtcblxuXHRcdC8vIGdwdDRUb29sIHNob3VsZCBiZSBlbmFibGVkIChtb2RlbCBtYXRjaGVzKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KGdwdDRUb29sKSwgdHJ1ZSwgJ2dwdDRUb29sIHNob3VsZCBiZSBlbmFibGVkJyk7XG5cdFx0Ly8gYW55TW9kZWxUb29sIHNob3VsZCBiZSBlbmFibGVkIChubyBtb2RlbCByZXN0cmljdGlvbilcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldChhbnlNb2RlbFRvb2wpLCB0cnVlLCAnYW55TW9kZWxUb29sIHNob3VsZCBiZSBlbmFibGVkJyk7XG5cdFx0Ly8gY2xhdWRlVG9vbCBzaG91bGQgTk9UIGJlIGluIHRoZSBlbmFibGVtZW50IG1hcCAoZmlsdGVyZWQgb3V0IGJ5IG1vZGVsKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaGFzKGNsYXVkZVRvb2wpLCBmYWxzZSwgJ2NsYXVkZVRvb2wgc2hvdWxkIGJlIGZpbHRlcmVkIG91dCBieSBtb2RlbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdncHQtNS41IHJlYWRGaWxlIHNldHRpbmcgY29udHJvbHMgQ29waWxvdCByZWFkIHRvb2wgYXZhaWxhYmlsaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlYWRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogQ29waWxvdFRvb2xJZC5SZWFkRmlsZSxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAncmVhZEZpbGUnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1JlYWQgRmlsZSBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUmVhZCBGaWxlJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEocmVhZFRvb2wpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWFkVG9vbFNldC5hZGRUb29sKHJlYWRUb29sKSk7XG5cblx0XHRjb25zdCBncHQ1NU1vZGVsID0geyBpZDogJ2dwdC01LjUnLCB2ZW5kb3I6ICdjb3BpbG90JywgZmFtaWx5OiAnZ3B0LTUuNScsIHZlcnNpb246ICcxLjAnIH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDb3BpbG90Q2hhdFNldHRpbmdJZC5HcHQ1NVJlYWRGaWxlVG9vbEVuYWJsZWQsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGRpc2FibGVkVG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHMoZ3B0NTVNb2RlbCkpO1xuXHRcdGFzc2VydC5vayghZGlzYWJsZWRUb29scy5zb21lKHRvb2wgPT4gdG9vbC5pZCA9PT0gQ29waWxvdFRvb2xJZC5SZWFkRmlsZSksICdyZWFkRmlsZSBzaG91bGQgbm90IGJlIHJldHVybmVkIGZyb20gZ2V0VG9vbHMgd2hlbiBkaXNhYmxlZCBmb3IgZ3B0LTUuNScpO1xuXG5cdFx0Y29uc3QgZGlzYWJsZWRSZWFkVG9vbFNldCA9IEFycmF5LmZyb20oc2VydmljZS5nZXRUb29sU2V0c0Zvck1vZGVsKGdwdDU1TW9kZWwpKS5maW5kKHRvb2xTZXQgPT4gdG9vbFNldC5pZCA9PT0gJ3JlYWQnKTtcblx0XHRhc3NlcnQub2soZGlzYWJsZWRSZWFkVG9vbFNldCwgJ3JlYWQgdG9vbCBzZXQgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKCFBcnJheS5mcm9tKGRpc2FibGVkUmVhZFRvb2xTZXQuZ2V0VG9vbHMoKSkuc29tZSh0b29sID0+IHRvb2wuaWQgPT09IENvcGlsb3RUb29sSWQuUmVhZEZpbGUpLCAncmVhZEZpbGUgc2hvdWxkIG5vdCBiZSBpbmNsdWRlZCBhcyBhIHJlYWQgdG9vbC1zZXQgbWVtYmVyIHdoZW4gZGlzYWJsZWQgZm9yIGdwdC01LjUnKTtcblxuXHRcdGNvbnN0IGRpc2FibGVkRW5hYmxlbWVudE1hcCA9IHNlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoWydyZWFkL3JlYWRGaWxlJ10sIGdwdDU1TW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNhYmxlZEVuYWJsZW1lbnRNYXAuaGFzKHJlYWRUb29sKSwgZmFsc2UsICdyZWFkRmlsZSBzaG91bGQgbm90IGJlIGluY2x1ZGVkIGluIGV4cGxpY2l0IGVuYWJsZW1lbnQgbWFwcyB3aGVuIGRpc2FibGVkIGZvciBncHQtNS41Jyk7XG5cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDb3BpbG90Q2hhdFNldHRpbmdJZC5HcHQ1NVJlYWRGaWxlVG9vbEVuYWJsZWQsIHRydWUpO1xuXG5cdFx0Y29uc3QgZW5hYmxlZFRvb2xzID0gQXJyYXkuZnJvbShzZXJ2aWNlLmdldFRvb2xzKGdwdDU1TW9kZWwpKTtcblx0XHRhc3NlcnQub2soZW5hYmxlZFRvb2xzLnNvbWUodG9vbCA9PiB0b29sLmlkID09PSBDb3BpbG90VG9vbElkLlJlYWRGaWxlKSwgJ3JlYWRGaWxlIHNob3VsZCBiZSByZXR1cm5lZCBmcm9tIGdldFRvb2xzIHdoZW4gZW5hYmxlZCBmb3IgZ3B0LTUuNScpO1xuXG5cdFx0Y29uc3QgZW5hYmxlZFJlYWRUb29sU2V0ID0gQXJyYXkuZnJvbShzZXJ2aWNlLmdldFRvb2xTZXRzRm9yTW9kZWwoZ3B0NTVNb2RlbCkpLmZpbmQodG9vbFNldCA9PiB0b29sU2V0LmlkID09PSAncmVhZCcpO1xuXHRcdGFzc2VydC5vayhlbmFibGVkUmVhZFRvb2xTZXQsICdyZWFkIHRvb2wgc2V0IHNob3VsZCBleGlzdCcpO1xuXHRcdGFzc2VydC5vayhBcnJheS5mcm9tKGVuYWJsZWRSZWFkVG9vbFNldC5nZXRUb29scygpKS5zb21lKHRvb2wgPT4gdG9vbC5pZCA9PT0gQ29waWxvdFRvb2xJZC5SZWFkRmlsZSksICdyZWFkRmlsZSBzaG91bGQgYmUgaW5jbHVkZWQgYXMgYSByZWFkIHRvb2wtc2V0IG1lbWJlciB3aGVuIGVuYWJsZWQgZm9yIGdwdC01LjUnKTtcblxuXHRcdGNvbnN0IGVuYWJsZWRFbmFibGVtZW50TWFwID0gc2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChbJ3JlYWQvcmVhZEZpbGUnXSwgZ3B0NTVNb2RlbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWRFbmFibGVtZW50TWFwLmdldChyZWFkVG9vbCksIHRydWUsICdyZWFkRmlsZSBzaG91bGQgYmUgaW5jbHVkZWQgaW4gZXhwbGljaXQgZW5hYmxlbWVudCBtYXBzIHdoZW4gZW5hYmxlZCBmb3IgZ3B0LTUuNScpO1xuXHR9KTtcblxuXHR0ZXN0KCdvYnNlcnZlVG9vbHMgcmV0dXJucyB0b29scyBmaWx0ZXJlZCBieSBjb250ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnZmVhdHVyZUVuYWJsZWQnLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgZW5hYmxlZFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICdlbmFibGVkT2JzVG9vbCcsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdFbmFibGVkIFRvb2wnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0VuYWJsZWQgVG9vbCcsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFcXVhbHNFeHByLmNyZWF0ZSgnZmVhdHVyZUVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRpc2FibGVkVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0XHRpZDogJ2Rpc2FibGVkT2JzVG9vbCcsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdEaXNhYmxlZCBUb29sJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdEaXNhYmxlZCBUb29sJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKCdmZWF0dXJlRW5hYmxlZCcsIGZhbHNlKSxcblx0XHRcdH07XG5cblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZW5hYmxlZFRvb2wpKTtcblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZGlzYWJsZWRUb29sKSk7XG5cblx0XHRcdGNvbnN0IHRvb2xzT2JzID0gc2VydmljZS5vYnNlcnZlVG9vbHModW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gUmVhZCBjdXJyZW50IHZhbHVlIGRpcmVjdGx5XG5cdFx0XHRjb25zdCB0b29scyA9IHRvb2xzT2JzLmdldCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHMubGVuZ3RoLCAxLCAnc2hvdWxkIG9ubHkgaW5jbHVkZSBlbmFibGVkIHRvb2wnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sc1swXS5pZCwgJ2VuYWJsZWRPYnNUb29sJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludm9rZVRvb2wgd2l0aCBjaGF0U3RyZWFtVG9vbENhbGxJZCBjb3JyZWxhdGVzIHdpdGggcGVuZGluZyBzdHJlYW1pbmcgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdChzZXJ2aWNlLCBzdG9yZSwgJ2NvcnJlbGF0ZWRUb29sJywge1xuXHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnY29ycmVsYXRlZCByZXN1bHQnIH1dIH0pLFxuXHRcdFx0aGFuZGxlVG9vbFN0cmVhbTogYXN5bmMgKCkgPT4gKHsgaW52b2NhdGlvbk1lc3NhZ2U6ICdQcm9jZXNzaW5nLi4uJyB9KSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdjb3JyZWxhdGVkLXNlc3Npb24nO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9ICdjb3JyZWxhdGVkLXJlcXVlc3QnO1xuXHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IGFueSB9ID0ge307XG5cdFx0c3R1YkdldFNlc3Npb24oY2hhdFNlcnZpY2UsIHNlc3Npb25JZCwgeyByZXF1ZXN0SWQsIGNhcHR1cmUgfSk7XG5cblx0XHQvLyBTdGFydCBhIHN0cmVhbWluZyB0b29sIGNhbGxcblx0XHRjb25zdCBzdHJlYW1pbmdJbnZvY2F0aW9uID0gc2VydmljZS5iZWdpblRvb2xDYWxsKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICdzdHJlYW0tY2FsbC1pZCcsXG5cdFx0XHR0b29sSWQ6IHRvb2wuaWQsXG5cdFx0XHRjaGF0UmVxdWVzdElkOiByZXF1ZXN0SWQsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihzZXNzaW9uSWQpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHN0cmVhbWluZ0ludm9jYXRpb24sICdzaG91bGQgY3JlYXRlIHN0cmVhbWluZyBpbnZvY2F0aW9uJyk7XG5cblx0XHQvLyBOb3cgaW52b2tlIHRoZSB0b29sIHdpdGggYSBkaWZmZXJlbnQgY2FsbElkIGJ1dCBtYXRjaGluZyBjaGF0U3RyZWFtVG9vbENhbGxJZFxuXHRcdGNvbnN0IGR0bzogSVRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0Y2FsbElkOiAnZGlmZmVyZW50LWNhbGwtaWQnLFxuXHRcdFx0dG9vbElkOiB0b29sLmlkLFxuXHRcdFx0dG9rZW5CdWRnZXQ6IDEwMCxcblx0XHRcdHBhcmFtZXRlcnM6IHsgdGVzdDogMSB9LFxuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihzZXNzaW9uSWQpLFxuXHRcdFx0fSxcblx0XHRcdGNoYXRTdHJlYW1Ub29sQ2FsbElkOiAnc3RyZWFtLWNhbGwtaWQnLCAvLyBUaGlzIHNob3VsZCBjb3JyZWxhdGVcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5pbnZva2VUb29sKGR0bywgYXN5bmMgKCkgPT4gMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnY29ycmVsYXRlZCByZXN1bHQnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QWxsVG9vbHNJbmNsdWRpbmdEaXNhYmxlZCByZXR1cm5zIHRvb2xzIHJlZ2FyZGxlc3Mgb2Ygd2hlbiBjbGF1c2UnLCAoKSA9PiB7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdmZWF0dXJlRmxhZycsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGVuYWJsZWRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2VuYWJsZWRUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdFbmFibGVkIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdFbmFibGVkIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGlzYWJsZWRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2Rpc2FibGVkVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnRGlzYWJsZWQgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0Rpc2FibGVkIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFcXVhbHNFeHByLmNyZWF0ZSgnZmVhdHVyZUZsYWcnLCB0cnVlKSwgLy8gV2lsbCBiZSBkaXNhYmxlZFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGVuYWJsZWRUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShkaXNhYmxlZFRvb2wpKTtcblxuXHRcdC8vIGdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQgc2hvdWxkIHJldHVybiBib3RoIHRvb2xzXG5cdFx0Y29uc3QgYWxsVG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0QWxsVG9vbHNJbmNsdWRpbmdEaXNhYmxlZCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWxsVG9vbHMubGVuZ3RoLCAyLCAnZ2V0QWxsVG9vbHNJbmNsdWRpbmdEaXNhYmxlZCBzaG91bGQgcmV0dXJuIGFsbCB0b29scycpO1xuXHRcdGFzc2VydC5vayhhbGxUb29scy5zb21lKHQgPT4gdC5pZCA9PT0gJ2VuYWJsZWRUb29sJyksICdzaG91bGQgaW5jbHVkZSBlbmFibGVkIHRvb2wnKTtcblx0XHRhc3NlcnQub2soYWxsVG9vbHMuc29tZSh0ID0+IHQuaWQgPT09ICdkaXNhYmxlZFRvb2wnKSwgJ3Nob3VsZCBpbmNsdWRlIGRpc2FibGVkIHRvb2wnKTtcblxuXHRcdC8vIGdldFRvb2xzIHNob3VsZCBvbmx5IHJldHVybiB0b29scyBtYXRjaGluZyB3aGVuIGNsYXVzZVxuXHRcdGNvbnN0IGVuYWJsZWRUb29scyA9IEFycmF5LmZyb20oc2VydmljZS5nZXRUb29scyh1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZFRvb2xzLmxlbmd0aCwgMSwgJ2dldFRvb2xzIHNob3VsZCBvbmx5IHJldHVybiBtYXRjaGluZyB0b29scycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkVG9vbHNbMF0uaWQsICdlbmFibGVkVG9vbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUb29scyBmaWx0ZXJzIGJ5IG1vZGVsIGlkIHVzaW5nIG1vZGVscyBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRjb25zdCBncHQ0VG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdncHQ0VG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnR1BULTQgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0dQVC00IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdG1vZGVsczogW3sgaWQ6ICdncHQtNC10dXJibycgfV0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGNsYXVkZVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnY2xhdWRlVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQ2xhdWRlIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdDbGF1ZGUgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0bW9kZWxzOiBbeyBpZDogJ2NsYXVkZS0zLW9wdXMnIH1dLFxuXHRcdH07XG5cblx0XHRjb25zdCB1bml2ZXJzYWxUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3VuaXZlcnNhbFRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1VuaXZlcnNhbCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnVW5pdmVyc2FsIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdC8vIE5vIG1vZGVscyAtIGF2YWlsYWJsZSBmb3IgYWxsIG1vZGVsc1xuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGdwdDRUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShjbGF1ZGVUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh1bml2ZXJzYWxUb29sKSk7XG5cblx0XHQvLyBNb2NrIG1vZGVsIG1ldGFkYXRhIHdpdGggaWQgJ2dwdC00LXR1cmJvJ1xuXHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSB7IGlkOiAnZ3B0LTQtdHVyYm8nLCB2ZW5kb3I6ICdvcGVuYWknLCBmYW1pbHk6ICdncHQtNCcsIHZlcnNpb246ICcxLjAnIH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgdG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHMobW9kZWxNZXRhZGF0YSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xzLmxlbmd0aCwgMiwgJ3Nob3VsZCByZXR1cm4gMiB0b29scycpO1xuXHRcdGFzc2VydC5vayh0b29scy5zb21lKHQgPT4gdC5pZCA9PT0gJ2dwdDRUb29sJyksICdzaG91bGQgaW5jbHVkZSBHUFQtNCB0b29sJyk7XG5cdFx0YXNzZXJ0Lm9rKHRvb2xzLnNvbWUodCA9PiB0LmlkID09PSAndW5pdmVyc2FsVG9vbCcpLCAnc2hvdWxkIGluY2x1ZGUgdW5pdmVyc2FsIHRvb2wnKTtcblx0XHRhc3NlcnQub2soIXRvb2xzLnNvbWUodCA9PiB0LmlkID09PSAnY2xhdWRlVG9vbCcpLCAnc2hvdWxkIE5PVCBpbmNsdWRlIENsYXVkZSB0b29sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvb2xzIGZpbHRlcnMgYnkgbW9kZWwgdmVuZG9yIHVzaW5nIG1vZGVscyBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRjb25zdCBhbnRocm9waWNUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2FudGhyb3BpY1Rvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0FudGhyb3BpYyBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnQW50aHJvcGljIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdG1vZGVsczogW3sgdmVuZG9yOiAnYW50aHJvcGljJyB9XSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgb3BlbmFpVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdvcGVuYWlUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdPcGVuQUkgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ09wZW5BSSBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRtb2RlbHM6IFt7IHZlbmRvcjogJ29wZW5haScgfV0sXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoYW50aHJvcGljVG9vbCkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEob3BlbmFpVG9vbCkpO1xuXG5cdFx0Ly8gTW9jayBtb2RlbCBtZXRhZGF0YSB3aXRoIHZlbmRvciAnYW50aHJvcGljJ1xuXHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSB7IGlkOiAnY2xhdWRlLTMnLCB2ZW5kb3I6ICdhbnRocm9waWMnLCBmYW1pbHk6ICdjbGF1ZGUtMycsIHZlcnNpb246ICcxLjAnIH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgdG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHMobW9kZWxNZXRhZGF0YSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xzLmxlbmd0aCwgMSwgJ3Nob3VsZCByZXR1cm4gMSB0b29sJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xzWzBdLmlkLCAnYW50aHJvcGljVG9vbCcsICdzaG91bGQgaW5jbHVkZSBBbnRocm9waWMgdG9vbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUb29scyBmaWx0ZXJzIGJ5IG1vZGVsIGZhbWlseSB1c2luZyBtb2RlbHMgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3B0NEZhbWlseVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZ3B0NEZhbWlseVRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0dQVC00IEZhbWlseSBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnR1BULTQgRmFtaWx5IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdG1vZGVsczogW3sgZmFtaWx5OiAnZ3B0LTQnIH1dLFxuXHRcdH07XG5cblx0XHRjb25zdCBncHQzNUZhbWlseVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZ3B0MzVGYW1pbHlUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdHUFQtMy41IEZhbWlseSBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnR1BULTMuNSBGYW1pbHkgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0bW9kZWxzOiBbeyBmYW1pbHk6ICdncHQtMy41JyB9XSxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShncHQ0RmFtaWx5VG9vbCkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZ3B0MzVGYW1pbHlUb29sKSk7XG5cblx0XHQvLyBNb2NrIG1vZGVsIG1ldGFkYXRhIHdpdGggZmFtaWx5ICdncHQtNCdcblx0XHRjb25zdCBtb2RlbE1ldGFkYXRhID0geyBpZDogJ2dwdC00LXR1cmJvJywgdmVuZG9yOiAnb3BlbmFpJywgZmFtaWx5OiAnZ3B0LTQnLCB2ZXJzaW9uOiAnMS4wJyB9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhO1xuXHRcdGNvbnN0IHRvb2xzID0gQXJyYXkuZnJvbShzZXJ2aWNlLmdldFRvb2xzKG1vZGVsTWV0YWRhdGEpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29scy5sZW5ndGgsIDEsICdzaG91bGQgcmV0dXJuIDEgdG9vbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sc1swXS5pZCwgJ2dwdDRGYW1pbHlUb29sJywgJ3Nob3VsZCBpbmNsdWRlIEdQVC00IGZhbWlseSB0b29sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvb2xzIHdpdGggdW5kZWZpbmVkIG1vZGVsIHNraXBzIG1vZGVsIGZpbHRlcmluZycsICgpID0+IHtcblx0XHRjb25zdCBncHQ0VG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdncHQ0VG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnR1BULTQgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0dQVC00IFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdG1vZGVsczogW3sgaWQ6ICdncHQtNC10dXJibycgfV0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGNsYXVkZVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnY2xhdWRlVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQ2xhdWRlIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdDbGF1ZGUgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0bW9kZWxzOiBbeyBpZDogJ2NsYXVkZS0zLW9wdXMnIH1dLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGdwdDRUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShjbGF1ZGVUb29sKSk7XG5cblx0XHQvLyBXaGVuIG1vZGVsIGlzIHVuZGVmaW5lZCwgYWxsIHRvb2xzIHNob3VsZCBiZSByZXR1cm5lZCAobW9kZWwgZmlsdGVyaW5nIHNraXBwZWQpXG5cdFx0Y29uc3QgdG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHModW5kZWZpbmVkKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHMubGVuZ3RoLCAyLCAnc2hvdWxkIHJldHVybiBhbGwgdG9vbHMgd2hlbiBtb2RlbCBpcyB1bmRlZmluZWQnKTtcblx0XHRhc3NlcnQub2sodG9vbHMuc29tZSh0ID0+IHQuaWQgPT09ICdncHQ0VG9vbCcpLCAnc2hvdWxkIGluY2x1ZGUgR1BULTQgdG9vbCcpO1xuXHRcdGFzc2VydC5vayh0b29scy5zb21lKHQgPT4gdC5pZCA9PT0gJ2NsYXVkZVRvb2wnKSwgJ3Nob3VsZCBpbmNsdWRlIENsYXVkZSB0b29sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvb2wgcmV0dXJucyB0b29sIHJlZ2FyZGxlc3Mgb2Ygd2hlbiBjbGF1c2UnLCAoKSA9PiB7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdzb21lRmxhZycsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGRpc2FibGVkVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdkaXNhYmxlZExvb2t1cFRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0Rpc2FibGVkIExvb2t1cCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRGlzYWJsZWQgTG9va3VwIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFcXVhbHNFeHByLmNyZWF0ZSgnc29tZUZsYWcnLCB0cnVlKSwgLy8gRGlzYWJsZWRcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShkaXNhYmxlZFRvb2wpKTtcblxuXHRcdC8vIGdldFRvb2wgc2hvdWxkIHN0aWxsIGZpbmQgdGhlIHRvb2wgYnkgSURcblx0XHRjb25zdCB0b29sID0gc2VydmljZS5nZXRUb29sKCdkaXNhYmxlZExvb2t1cFRvb2wnKTtcblx0XHRhc3NlcnQub2sodG9vbCwgJ2dldFRvb2wgc2hvdWxkIHJldHVybiB0b29sIGV2ZW4gd2hlbiBkaXNhYmxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sLmlkLCAnZGlzYWJsZWRMb29rdXBUb29sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvb2xCeU5hbWUgcmV0dXJucyB0b29sIHJlZ2FyZGxlc3Mgb2Ygd2hlbiBjbGF1c2UnLCAoKSA9PiB7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdhbm90aGVyRmxhZycsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGRpc2FibGVkVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdkaXNhYmxlZE5hbWVkVG9vbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2Rpc2FibGVkTmFtZWRUb29sUmVmJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdEaXNhYmxlZCBOYW1lZCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRGlzYWJsZWQgTmFtZWQgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKCdhbm90aGVyRmxhZycsIHRydWUpLCAvLyBEaXNhYmxlZFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGRpc2FibGVkVG9vbCkpO1xuXG5cdFx0Ly8gZ2V0VG9vbEJ5TmFtZSBzaG91bGQgc3RpbGwgZmluZCB0aGUgdG9vbCBieSByZWZlcmVuY2UgbmFtZVxuXHRcdGNvbnN0IHRvb2wgPSBzZXJ2aWNlLmdldFRvb2xCeU5hbWUoJ2Rpc2FibGVkTmFtZWRUb29sUmVmJyk7XG5cdFx0YXNzZXJ0Lm9rKHRvb2wsICdnZXRUb29sQnlOYW1lIHNob3VsZCByZXR1cm4gdG9vbCBldmVuIHdoZW4gZGlzYWJsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbC5pZCwgJ2Rpc2FibGVkTmFtZWRUb29sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0lUb29sRGF0YSBtb2RlbHMgcHJvcGVydHkgc3RvcmVzIHNlbGVjdG9yIGluZm9ybWF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xXaXRoTW9kZWxzOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ21vZGVsU3BlY2lmaWNUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdNb2RlbCBTcGVjaWZpYyBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnTW9kZWwgU3BlY2lmaWMgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0bW9kZWxzOiBbXG5cdFx0XHRcdHsgdmVuZG9yOiAnb3BlbmFpJywgZmFtaWx5OiAnZ3B0LTQnIH0sXG5cdFx0XHRcdHsgdmVuZG9yOiAnYW50aHJvcGljJywgZmFtaWx5OiAnY2xhdWRlLTMnIH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xXaXRoTW9kZWxzKSk7XG5cblx0XHRjb25zdCB0b29sID0gc2VydmljZS5nZXRUb29sKCdtb2RlbFNwZWNpZmljVG9vbCcpO1xuXHRcdGFzc2VydC5vayh0b29sLCAndG9vbCBzaG91bGQgYmUgcmVnaXN0ZXJlZCcpO1xuXHRcdGFzc2VydC5vayh0b29sLm1vZGVscywgJ3Rvb2wgc2hvdWxkIGhhdmUgbW9kZWxzIHByb3BlcnR5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2wubW9kZWxzLmxlbmd0aCwgMiwgJ3Rvb2wgc2hvdWxkIGhhdmUgMiBtb2RlbCBzZWxlY3RvcnMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2wubW9kZWxzWzBdLCB7IHZlbmRvcjogJ29wZW5haScsIGZhbWlseTogJ2dwdC00JyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2wubW9kZWxzWzFdLCB7IHZlbmRvcjogJ2FudGhyb3BpYycsIGZhbWlseTogJ2NsYXVkZS0zJyB9KTtcblx0fSk7XG5cblx0dGVzdCgndG9vbHMgd2l0aCBleHRlbnNpb24gdG9vbHMgZGlzYWJsZWQgc2V0dGluZyBhcmUgZmlsdGVyZWQnLCAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIGEgdG9vbCBmcm9tIGFuIGV4dGVuc2lvblxuXHRcdGNvbnN0IGV4dGVuc2lvblRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZXh0ZW5zaW9uVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnRXh0ZW5zaW9uIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdFeHRlbnNpb24gVG9vbCcsXG5cdFx0XHRzb3VyY2U6IHsgdHlwZTogJ2V4dGVuc2lvbicsIGxhYmVsOiAnVGVzdCBFeHRlbnNpb24nLCBleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QuZXh0ZW5zaW9uJykgfSxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShleHRlbnNpb25Ub29sKSk7XG5cblx0XHQvLyBXaXRoIGV4dGVuc2lvbiB0b29scyBlbmFibGVkIChkZWZhdWx0IGluIHNldHVwKVxuXHRcdGxldCB0b29scyA9IEFycmF5LmZyb20oc2VydmljZS5nZXRUb29scyh1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQub2sodG9vbHMuc29tZSh0ID0+IHQuaWQgPT09ICdleHRlbnNpb25Ub29sJyksICdleHRlbnNpb24gdG9vbCBzaG91bGQgYmUgaW5jbHVkZWQgd2hlbiBlbmFibGVkJyk7XG5cblx0XHQvLyBEaXNhYmxlIGV4dGVuc2lvbiB0b29sc1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkV4dGVuc2lvblRvb2xzRW5hYmxlZCwgZmFsc2UpO1xuXG5cdFx0dG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHModW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0Lm9rKCF0b29scy5zb21lKHQgPT4gdC5pZCA9PT0gJ2V4dGVuc2lvblRvb2wnKSwgJ2V4dGVuc2lvbiB0b29sIHNob3VsZCBiZSBleGNsdWRlZCB3aGVuIGRpc2FibGVkJyk7XG5cblx0XHQvLyBSZS1lbmFibGUgZm9yIGNsZWFudXBcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5FeHRlbnNpb25Ub29sc0VuYWJsZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdvYnNlcnZlVG9vbHMgY2hhbmdlcyB3aGVuIGNvbnRleHQga2V5IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdEN0eEtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxzdHJpbmc+KCdkeW5hbWljVGVzdEtleScsICd2YWx1ZTEnKTtcblxuXHRcdGNvbnN0IHRvb2wxOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2R5bmFtaWNUb29sMScsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnRHluYW1pYyBUb29sIDEnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdEeW5hbWljIFRvb2wgMScsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKCdkeW5hbWljVGVzdEtleScsICd2YWx1ZTEnKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdG9vbDI6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZHluYW1pY1Rvb2wyJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdEeW5hbWljIFRvb2wgMicsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0R5bmFtaWMgVG9vbCAyJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXF1YWxzRXhwci5jcmVhdGUoJ2R5bmFtaWNUZXN0S2V5JywgJ3ZhbHVlMicpLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2wxKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sMikpO1xuXG5cdFx0Y29uc3QgdG9vbHNPYnMgPSBzZXJ2aWNlLm9ic2VydmVUb29scyh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gSW5pdGlhbCBzdGF0ZTogdmFsdWUxIG1hdGNoZXMgdG9vbDFcblx0XHRsZXQgdG9vbHMgPSB0b29sc09icy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHMubGVuZ3RoLCAxLCAnc2hvdWxkIGhhdmUgMSB0b29sIGluaXRpYWxseScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sc1swXS5pZCwgJ2R5bmFtaWNUb29sMScsICdzaG91bGQgYmUgZHluYW1pY1Rvb2wxJyk7XG5cblx0XHQvLyBDaGFuZ2UgY29udGV4dCBrZXkgdG8gdmFsdWUyXG5cdFx0dGVzdEN0eEtleS5zZXQoJ3ZhbHVlMicpO1xuXG5cdFx0c2VydmljZS5mbHVzaFRvb2xVcGRhdGVzKCk7XG5cblx0XHQvLyBOb3cgdG9vbDIgc2hvdWxkIGJlIGF2YWlsYWJsZVxuXHRcdHRvb2xzID0gdG9vbHNPYnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xzLmxlbmd0aCwgMSwgJ3Nob3VsZCBoYXZlIDEgdG9vbCBhZnRlciBjaGFuZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHNbMF0uaWQsICdkeW5hbWljVG9vbDInLCAnc2hvdWxkIGJlIGR5bmFtaWNUb29sMiBhZnRlciBjb250ZXh0IGNoYW5nZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1Blcm1pdHRlZCBhbGxvd3MgdG9vbHMgaW4gcGVybWl0dGVkIHRvb2xzZXRzIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHQvLyBEaXNhYmxlIGFnZW50IG1vZGVcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQsIGZhbHNlKTtcblxuXHRcdC8vIENyZWF0ZSB0b29sIGluIHRoZSAncmVhZCcgdG9vbHNldCAocGVybWl0dGVkKVxuXHRcdGNvbnN0IHJlYWRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3JlYWRUb29sSW5TZXQnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdyZWFkVG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnUmVhZCBUb29sIGluIFNldCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1JlYWQgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShyZWFkVG9vbCkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlYWRUb29sU2V0LmFkZFRvb2wocmVhZFRvb2wpKTtcblxuXHRcdC8vIENyZWF0ZSBzdGFuZGFsb25lIHRvb2wgbm90IGluIGFueSBwZXJtaXR0ZWQgdG9vbHNldFxuXHRcdGNvbnN0IHN0YW5kYWxvbmVUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3N0YW5kYWxvbmVUb29sJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnc3RhbmRhbG9uZVJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnU3RhbmRhbG9uZSBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnU3RhbmRhbG9uZSBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHN0YW5kYWxvbmVUb29sKSk7XG5cblx0XHQvLyBHZXQgdG9vbHMgLSBzaG91bGQgaW5jbHVkZSB0aGUgdG9vbCBpbiB0aGUgcmVhZCB0b29sc2V0IGJ1dCBub3QgdGhlIHN0YW5kYWxvbmUgdG9vbFxuXHRcdGNvbnN0IHRvb2xzID0gQXJyYXkuZnJvbShzZXJ2aWNlLmdldFRvb2xzKHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xJZHMgPSB0b29scy5tYXAodCA9PiB0LmlkKTtcblxuXHRcdGFzc2VydC5vayh0b29sSWRzLmluY2x1ZGVzKCdyZWFkVG9vbEluU2V0JyksICdUb29sIGluIHJlYWQgdG9vbHNldCBzaG91bGQgYmUgcGVybWl0dGVkIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZCcpO1xuXHRcdGFzc2VydC5vayghdG9vbElkcy5pbmNsdWRlcygnc3RhbmRhbG9uZVRvb2wnKSwgJ1N0YW5kYWxvbmUgdG9vbCBub3QgaW4gcGVybWl0dGVkIHRvb2xzZXQgc2hvdWxkIE5PVCBiZSBwZXJtaXR0ZWQgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzUGVybWl0dGVkIGFsbG93cyBhbGwgdG9vbHMgd2hlbiBhZ2VudCBtb2RlIGlzIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Ly8gRW5hYmxlIGFnZW50IG1vZGUgKGRlZmF1bHQpXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkLCB0cnVlKTtcblxuXHRcdC8vIENyZWF0ZSB0b29sIGluIHRoZSAncmVhZCcgdG9vbHNldFxuXHRcdGNvbnN0IHJlYWRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3JlYWRUb29sRW5hYmxlZCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3JlYWRUb29sRW5hYmxlZFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnUmVhZCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUmVhZCBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHJlYWRUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVhZFRvb2xTZXQuYWRkVG9vbChyZWFkVG9vbCkpO1xuXG5cdFx0Ly8gQ3JlYXRlIHN0YW5kYWxvbmUgdG9vbCBub3QgaW4gYW55IHBlcm1pdHRlZCB0b29sc2V0XG5cdFx0Y29uc3Qgc3RhbmRhbG9uZVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnc3RhbmRhbG9uZVRvb2xFbmFibGVkJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnc3RhbmRhbG9uZUVuYWJsZWRSZWYnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1N0YW5kYWxvbmUgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1N0YW5kYWxvbmUgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShzdGFuZGFsb25lVG9vbCkpO1xuXG5cdFx0Ly8gR2V0IHRvb2xzIC0gYm90aCBzaG91bGQgYmUgYXZhaWxhYmxlIHdoZW4gYWdlbnQgbW9kZSBpcyBlbmFibGVkXG5cdFx0Y29uc3QgdG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHModW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbElkcyA9IHRvb2xzLm1hcCh0ID0+IHQuaWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHRvb2xJZHMuaW5jbHVkZXMoJ3JlYWRUb29sRW5hYmxlZCcpLCAnVG9vbCBpbiByZWFkIHRvb2xzZXQgc2hvdWxkIGJlIHBlcm1pdHRlZCB3aGVuIGFnZW50IG1vZGUgaXMgZW5hYmxlZCcpO1xuXHRcdGFzc2VydC5vayh0b29sSWRzLmluY2x1ZGVzKCdzdGFuZGFsb25lVG9vbEVuYWJsZWQnKSwgJ1N0YW5kYWxvbmUgdG9vbCBzaG91bGQgYmUgcGVybWl0dGVkIHdoZW4gYWdlbnQgbW9kZSBpcyBlbmFibGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzUGVybWl0dGVkIGZpbHRlcnMgdG9vbHNldHMgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdC8vIERpc2FibGUgYWdlbnQgbW9kZVxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCwgZmFsc2UpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgY3VzdG9tIGludGVybmFsIHRvb2xzZXQgdGhhdCBpcyBOT1QgaW4gdGhlIHBlcm1pdHRlZCBsaXN0XG5cdFx0Y29uc3QgY3VzdG9tVG9vbFNldCA9IHN0b3JlLmFkZChzZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdCdjdXN0b21Ub29sU2V0Jyxcblx0XHRcdCdjdXN0b21Ub29sU2V0UmVmJyxcblx0XHRcdHsgZGVzY3JpcHRpb246ICdDdXN0b20gVG9vbCBTZXQnIH1cblx0XHQpKTtcblxuXHRcdGNvbnN0IGN1c3RvbVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnY3VzdG9tVG9vbEluU2V0Jyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnY3VzdG9tVG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQ3VzdG9tIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdDdXN0b20gVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShjdXN0b21Ub29sKSk7XG5cdFx0c3RvcmUuYWRkKGN1c3RvbVRvb2xTZXQuYWRkVG9vbChjdXN0b21Ub29sKSk7XG5cblx0XHQvLyBHZXQgdG9vbHNldHMgLSByZWFkL3NlYXJjaC93ZWIgc2hvdWxkIGJlIGF2YWlsYWJsZSwgY3VzdG9tIHNob3VsZCBub3Rcblx0XHRjb25zdCB0b29sU2V0cyA9IEFycmF5LmZyb20oc2VydmljZS50b29sU2V0cy5nZXQoKSk7XG5cdFx0Y29uc3QgdG9vbFNldElkcyA9IEFycmF5LmZyb20odG9vbFNldHMpLm1hcCh0cyA9PiB0cy5pZCk7XG5cblx0XHRhc3NlcnQub2sodG9vbFNldElkcy5pbmNsdWRlcygncmVhZCcpLCAncmVhZCB0b29sc2V0IHNob3VsZCBiZSBwZXJtaXR0ZWQgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKCF0b29sU2V0SWRzLmluY2x1ZGVzKCdjdXN0b21Ub29sU2V0JyksICdjdXN0b20gdG9vbHNldCBzaG91bGQgTk9UIGJlIHBlcm1pdHRlZCB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaXNQZXJtaXR0ZWQgYWxsb3dzIGV4ZWN1dGUgdG9vbHNldCB0b29scyB3aGVuIGFnZW50IG1vZGUgaXMgZW5hYmxlZCcsICgpID0+IHtcblx0XHQvLyBFbmFibGUgYWdlbnQgbW9kZVxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCwgdHJ1ZSk7XG5cblx0XHQvLyBDcmVhdGUgdG9vbCBpbiB0aGUgJ2V4ZWN1dGUnIHRvb2xzZXQgKG9ubHkgcGVybWl0dGVkIHdoZW4gYWdlbnQgbW9kZSBpcyBlbmFibGVkKVxuXHRcdGNvbnN0IGV4ZWN1dGVUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2V4ZWN1dGVUb29sSW5TZXQnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdleGVjdXRlVG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnRXhlY3V0ZSBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRXhlY3V0ZSBUb29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGV4ZWN1dGVUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UuZXhlY3V0ZVRvb2xTZXQuYWRkVG9vbChleGVjdXRlVG9vbCkpO1xuXG5cdFx0Ly8gR2V0IHRvb2xzIC0gZXhlY3V0ZSB0b29sIHNob3VsZCBiZSBhdmFpbGFibGUgd2hlbiBhZ2VudCBtb2RlIGlzIGVuYWJsZWRcblx0XHRjb25zdCB0b29scyA9IEFycmF5LmZyb20oc2VydmljZS5nZXRUb29scyh1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0b29sSWRzID0gdG9vbHMubWFwKHQgPT4gdC5pZCk7XG5cblx0XHRhc3NlcnQub2sodG9vbElkcy5pbmNsdWRlcygnZXhlY3V0ZVRvb2xJblNldCcpLCAnVG9vbCBpbiBleGVjdXRlIHRvb2xzZXQgc2hvdWxkIGJlIHBlcm1pdHRlZCB3aGVuIGFnZW50IG1vZGUgaXMgZW5hYmxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1Blcm1pdHRlZCBibG9ja3MgZXhlY3V0ZSB0b29sc2V0IHRvb2xzIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHQvLyBEaXNhYmxlIGFnZW50IG1vZGVcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQsIGZhbHNlKTtcblxuXHRcdC8vIENyZWF0ZSB0b29sIGluIHRoZSAnZXhlY3V0ZScgdG9vbHNldCAoTk9UIHBlcm1pdHRlZCB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQpXG5cdFx0Y29uc3QgZXhlY3V0ZVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZXhlY3V0ZVRvb2xCbG9ja2VkJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnZXhlY3V0ZVRvb2xCbG9ja2VkUmVmJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdFeGVjdXRlIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdFeGVjdXRlIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZXhlY3V0ZVRvb2wpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5leGVjdXRlVG9vbFNldC5hZGRUb29sKGV4ZWN1dGVUb29sKSk7XG5cblx0XHQvLyBHZXQgdG9vbHMgLSBleGVjdXRlIHRvb2wgc2hvdWxkIE5PVCBiZSBhdmFpbGFibGUgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkXG5cdFx0Y29uc3QgdG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHModW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbElkcyA9IHRvb2xzLm1hcCh0ID0+IHQuaWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKCF0b29sSWRzLmluY2x1ZGVzKCdleGVjdXRlVG9vbEJsb2NrZWQnKSwgJ1Rvb2wgaW4gZXhlY3V0ZSB0b29sc2V0IHNob3VsZCBOT1QgYmUgcGVybWl0dGVkIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1Blcm1pdHRlZCBhbGxvd3Mgc2VhcmNoIHRvb2xzZXQgdG9vbHMgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdC8vIERpc2FibGUgYWdlbnQgbW9kZVxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCwgZmFsc2UpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgJ3NlYXJjaCcgdG9vbHNldCAocGVybWl0dGVkIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZClcblx0XHRjb25zdCBzZWFyY2hUb29sU2V0ID0gc3RvcmUuYWRkKHNlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0J3NlYXJjaCcsXG5cdFx0XHRTcGVjZWRUb29sQWxpYXNlcy5zZWFyY2gsXG5cdFx0XHR7IGRlc2NyaXB0aW9uOiAnU2VhcmNoIFRvb2wgU2V0JyB9XG5cdFx0KSk7XG5cblx0XHRjb25zdCBzZWFyY2hUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3NlYXJjaFRvb2xJblNldCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3NlYXJjaFRvb2xSZWYnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1NlYXJjaCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnU2VhcmNoIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoc2VhcmNoVG9vbCkpO1xuXHRcdHN0b3JlLmFkZChzZWFyY2hUb29sU2V0LmFkZFRvb2woc2VhcmNoVG9vbCkpO1xuXG5cdFx0Ly8gR2V0IHRvb2xzIC0gc2VhcmNoIHRvb2wgc2hvdWxkIGJlIGF2YWlsYWJsZSB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWRcblx0XHRjb25zdCB0b29scyA9IEFycmF5LmZyb20oc2VydmljZS5nZXRUb29scyh1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0b29sSWRzID0gdG9vbHMubWFwKHQgPT4gdC5pZCk7XG5cblx0XHRhc3NlcnQub2sodG9vbElkcy5pbmNsdWRlcygnc2VhcmNoVG9vbEluU2V0JyksICdUb29sIGluIHNlYXJjaCB0b29sc2V0IHNob3VsZCBiZSBwZXJtaXR0ZWQgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzUGVybWl0dGVkIGFsbG93cyB3ZWIgdG9vbHNldCB0b29scyB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Ly8gRGlzYWJsZSBhZ2VudCBtb2RlXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkLCBmYWxzZSk7XG5cblx0XHQvLyBDcmVhdGUgYSAnd2ViJyB0b29sc2V0IChwZXJtaXR0ZWQgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkKVxuXHRcdGNvbnN0IHdlYlRvb2xTZXQgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHQnd2ViJyxcblx0XHRcdFNwZWNlZFRvb2xBbGlhc2VzLndlYixcblx0XHRcdHsgZGVzY3JpcHRpb246ICdXZWIgVG9vbCBTZXQnIH1cblx0XHQpKTtcblxuXHRcdGNvbnN0IHdlYlRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnd2ViVG9vbEluU2V0Jyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnd2ViVG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnV2ViIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdXZWIgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh3ZWJUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHdlYlRvb2xTZXQuYWRkVG9vbCh3ZWJUb29sKSk7XG5cblx0XHQvLyBHZXQgdG9vbHMgLSB3ZWIgdG9vbCBzaG91bGQgYmUgYXZhaWxhYmxlIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZFxuXHRcdGNvbnN0IHRvb2xzID0gQXJyYXkuZnJvbShzZXJ2aWNlLmdldFRvb2xzKHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xJZHMgPSB0b29scy5tYXAodCA9PiB0LmlkKTtcblxuXHRcdGFzc2VydC5vayh0b29sSWRzLmluY2x1ZGVzKCd3ZWJUb29sSW5TZXQnKSwgJ1Rvb2wgaW4gd2ViIHRvb2xzZXQgc2hvdWxkIGJlIHBlcm1pdHRlZCB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaXNQZXJtaXR0ZWQgYWxsb3dzIHZzY29kZV9mZXRjaFdlYlBhZ2VfaW50ZXJuYWwgc3BlY2lhbCBjYXNlIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHQvLyBEaXNhYmxlIGFnZW50IG1vZGVcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQsIGZhbHNlKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHRoZSBzcGVjaWFsLWNhc2VkIGZldGNoIHRvb2wgKG5vdCBhZGRlZCB0byBhbnkgdG9vbHNldClcblx0XHRjb25zdCBmZXRjaFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndnNjb2RlX2ZldGNoV2ViUGFnZV9pbnRlcm5hbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2ZldGNoV2ViUGFnZScsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnRmV0Y2ggV2ViIFBhZ2UnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdGZXRjaCBXZWIgUGFnZScsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShmZXRjaFRvb2wpKTtcblxuXHRcdC8vIEdldCB0b29scyAtIHRoaXMgc3BlY2lhbCB0b29sIHNob3VsZCBiZSBhdmFpbGFibGUgZXZlbiB3aGVuIG5vdCBpbiBhIHRvb2xzZXRcblx0XHRjb25zdCB0b29scyA9IEFycmF5LmZyb20oc2VydmljZS5nZXRUb29scyh1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0b29sSWRzID0gdG9vbHMubWFwKHQgPT4gdC5pZCk7XG5cblx0XHRhc3NlcnQub2sodG9vbElkcy5pbmNsdWRlcygndnNjb2RlX2ZldGNoV2ViUGFnZV9pbnRlcm5hbCcpLCAndnNjb2RlX2ZldGNoV2ViUGFnZV9pbnRlcm5hbCBzaG91bGQgYmUgcGVybWl0dGVkIGFzIHNwZWNpYWwgY2FzZSB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaXNQZXJtaXR0ZWQgYmxvY2tzIGV4dGVuc2lvbiB0b29scyBub3QgaW4gcGVybWl0dGVkIHRvb2xzZXRzIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHQvLyBEaXNhYmxlIGFnZW50IG1vZGVcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQsIGZhbHNlKTtcblxuXHRcdC8vIENyZWF0ZSBleHRlbnNpb24gdG9vbCBub3QgaW4gYW55IHBlcm1pdHRlZCB0b29sc2V0XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdleHRlbnNpb25Ub29sQmxvY2tlZCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2V4dGVuc2lvblRvb2xSZWYnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0V4dGVuc2lvbiBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRXh0ZW5zaW9uIFRvb2wnLFxuXHRcdFx0c291cmNlOiB7IHR5cGU6ICdleHRlbnNpb24nLCBsYWJlbDogJ1Rlc3QgRXh0ZW5zaW9uJywgZXh0ZW5zaW9uSWQ6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dGVuc2lvbicpIH0sXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZXh0ZW5zaW9uVG9vbCkpO1xuXG5cdFx0Ly8gR2V0IHRvb2xzIC0gZXh0ZW5zaW9uIHRvb2wgc2hvdWxkIE5PVCBiZSBhdmFpbGFibGUgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkXG5cdFx0Y29uc3QgdG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHModW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbElkcyA9IHRvb2xzLm1hcCh0ID0+IHQuaWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKCF0b29sSWRzLmluY2x1ZGVzKCdleHRlbnNpb25Ub29sQmxvY2tlZCcpLCAnRXh0ZW5zaW9uIHRvb2wgbm90IGluIHBlcm1pdHRlZCB0b29sc2V0IHNob3VsZCBOT1QgYmUgcGVybWl0dGVkIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1Blcm1pdHRlZCBibG9ja3MgTUNQIHRvb2xzIG5vdCBpbiBwZXJtaXR0ZWQgdG9vbHNldHMgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdC8vIERpc2FibGUgYWdlbnQgbW9kZVxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCwgZmFsc2UpO1xuXG5cdFx0Ly8gQ3JlYXRlIE1DUCB0b29sc2V0IChub3QgaW4gcGVybWl0dGVkIGxpc3QpXG5cdFx0Y29uc3QgbWNwVG9vbFNldCA9IHN0b3JlLmFkZChzZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHR7IHR5cGU6ICdtY3AnLCBsYWJlbDogJ1Rlc3QgTUNQJywgc2VydmVyTGFiZWw6ICdUZXN0IE1DUCBTZXJ2ZXInLCBpbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCwgY29sbGVjdGlvbklkOiAndGVzdE1jcCcsIGRlZmluaXRpb25JZDogJ3Rlc3RNY3BEZWYnIH0sXG5cdFx0XHQnbWNwVG9vbFNldEJsb2NrZWQnLFxuXHRcdFx0J21jcFRvb2xTZXRCbG9ja2VkUmVmJyxcblx0XHRcdHsgZGVzY3JpcHRpb246ICdNQ1AgVG9vbCBTZXQnIH1cblx0XHQpKTtcblxuXHRcdGNvbnN0IG1jcFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnbWNwVG9vbEJsb2NrZWQnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdtY3BUb29sUmVmJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdNQ1AgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ01DUCBUb29sJyxcblx0XHRcdHNvdXJjZTogeyB0eXBlOiAnbWNwJywgbGFiZWw6ICdUZXN0IE1DUCcsIHNlcnZlckxhYmVsOiAnVGVzdCBNQ1AgU2VydmVyJywgaW5zdHJ1Y3Rpb25zOiB1bmRlZmluZWQsIGNvbGxlY3Rpb25JZDogJ3Rlc3RNY3AnLCBkZWZpbml0aW9uSWQ6ICd0ZXN0TWNwRGVmJyB9LFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKG1jcFRvb2wpKTtcblx0XHRzdG9yZS5hZGQobWNwVG9vbFNldC5hZGRUb29sKG1jcFRvb2wpKTtcblxuXHRcdC8vIEdldCB0b29scyAtIE1DUCB0b29sIHNob3VsZCBOT1QgYmUgYXZhaWxhYmxlIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZFxuXHRcdGNvbnN0IHRvb2xzID0gQXJyYXkuZnJvbShzZXJ2aWNlLmdldFRvb2xzKHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xJZHMgPSB0b29scy5tYXAodCA9PiB0LmlkKTtcblxuXHRcdGFzc2VydC5vayghdG9vbElkcy5pbmNsdWRlcygnbWNwVG9vbEJsb2NrZWQnKSwgJ01DUCB0b29sIHNob3VsZCBOT1QgYmUgcGVybWl0dGVkIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZCcpO1xuXG5cdFx0Ly8gR2V0IHRvb2xzZXRzIC0gTUNQIHRvb2xzZXQgc2hvdWxkIE5PVCBiZSBhdmFpbGFibGVcblx0XHRjb25zdCB0b29sU2V0cyA9IEFycmF5LmZyb20oc2VydmljZS50b29sU2V0cy5nZXQoKSk7XG5cdFx0Y29uc3QgdG9vbFNldElkcyA9IEFycmF5LmZyb20odG9vbFNldHMpLm1hcCh0cyA9PiB0cy5pZCk7XG5cblx0XHRhc3NlcnQub2soIXRvb2xTZXRJZHMuaW5jbHVkZXMoJ21jcFRvb2xTZXRCbG9ja2VkJyksICdNQ1AgdG9vbHNldCBzaG91bGQgTk9UIGJlIHBlcm1pdHRlZCB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaXNQZXJtaXR0ZWQgYmxvY2tzIGFnZW50IHRvb2xzZXQgdG9vbHMgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdC8vIERpc2FibGUgYWdlbnQgbW9kZVxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCwgZmFsc2UpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRvb2wgaW4gdGhlICdhZ2VudCcgdG9vbHNldCAoTk9UIHBlcm1pdHRlZCB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQpXG5cdFx0Y29uc3QgYWdlbnRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2FnZW50VG9vbEJsb2NrZWQnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdhZ2VudFRvb2xCbG9ja2VkUmVmJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdBZ2VudCBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnQWdlbnQgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShhZ2VudFRvb2wpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5hZ2VudFRvb2xTZXQuYWRkVG9vbChhZ2VudFRvb2wpKTtcblxuXHRcdC8vIEdldCB0b29scyAtIGFnZW50IHRvb2wgc2hvdWxkIE5PVCBiZSBhdmFpbGFibGUgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkXG5cdFx0Y29uc3QgdG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHModW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbElkcyA9IHRvb2xzLm1hcCh0ID0+IHQuaWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKCF0b29sSWRzLmluY2x1ZGVzKCdhZ2VudFRvb2xCbG9ja2VkJyksICdUb29sIGluIGFnZW50IHRvb2xzZXQgc2hvdWxkIE5PVCBiZSBwZXJtaXR0ZWQgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJyk7XG5cblx0XHQvLyBHZXQgdG9vbHNldHMgLSBhZ2VudCB0b29sc2V0IHNob3VsZCBOT1QgYmUgYXZhaWxhYmxlXG5cdFx0Y29uc3QgdG9vbFNldHMgPSBBcnJheS5mcm9tKHNlcnZpY2UudG9vbFNldHMuZ2V0KCkpO1xuXHRcdGNvbnN0IHRvb2xTZXRJZHMgPSBBcnJheS5mcm9tKHRvb2xTZXRzKS5tYXAodHMgPT4gdHMuaWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKCF0b29sU2V0SWRzLmluY2x1ZGVzKCdhZ2VudCcpLCAnYWdlbnQgdG9vbHNldCBzaG91bGQgTk9UIGJlIHBlcm1pdHRlZCB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaXNQZXJtaXR0ZWQgaW5jbHVkZXMgdG9vbCBpbiBtdWx0aXBsZSB0b29sc2V0cyBpZiBvbmUgaXMgcGVybWl0dGVkJywgKCkgPT4ge1xuXHRcdC8vIERpc2FibGUgYWdlbnQgbW9kZVxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCwgZmFsc2UpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgdG9vbCB0aGF0IGlzIGFkZGVkIHRvIGJvdGggYSBwZXJtaXR0ZWQgdG9vbHNldCAocmVhZCkgYW5kIGEgbm9uLXBlcm1pdHRlZCB0b29sc2V0XG5cdFx0Y29uc3QgbXVsdGlTZXRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ211bHRpU2V0VG9vbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ211bHRpU2V0VG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnTXVsdGkgU2V0IFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdNdWx0aSBTZXQgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShtdWx0aVNldFRvb2wpKTtcblxuXHRcdC8vIEFkZCB0byByZWFkIHRvb2xzZXQgKHBlcm1pdHRlZClcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWFkVG9vbFNldC5hZGRUb29sKG11bHRpU2V0VG9vbCkpO1xuXG5cdFx0Ly8gQWxzbyBjcmVhdGUgYW5kIGFkZCB0byBhIG5vbi1wZXJtaXR0ZWQgdG9vbHNldFxuXHRcdGNvbnN0IGN1c3RvbVRvb2xTZXQgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHQnY3VzdG9tTXVsdGlTZXQnLFxuXHRcdFx0J2N1c3RvbU11bHRpU2V0UmVmJyxcblx0XHRcdHsgZGVzY3JpcHRpb246ICdDdXN0b20gTXVsdGkgU2V0JyB9XG5cdFx0KSk7XG5cdFx0c3RvcmUuYWRkKGN1c3RvbVRvb2xTZXQuYWRkVG9vbChtdWx0aVNldFRvb2wpKTtcblxuXHRcdC8vIEdldCB0b29scyAtIHRvb2wgc2hvdWxkIGJlIGF2YWlsYWJsZSBiZWNhdXNlIGl0J3MgaW4gdGhlICdyZWFkJyB0b29sc2V0XG5cdFx0Y29uc3QgdG9vbHMgPSBBcnJheS5mcm9tKHNlcnZpY2UuZ2V0VG9vbHModW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbElkcyA9IHRvb2xzLm1hcCh0ID0+IHQuaWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHRvb2xJZHMuaW5jbHVkZXMoJ211bHRpU2V0VG9vbCcpLCAnVG9vbCBzaG91bGQgYmUgcGVybWl0dGVkIGlmIGl0IGJlbG9uZ3MgdG8gYXQgbGVhc3Qgb25lIHBlcm1pdHRlZCB0b29sc2V0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzUGVybWl0dGVkIGFsbG93cyBpbnRlcm5hbCB0b29scyB3aXRoIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0PWZhbHNlIHdoZW4gYWdlbnQgbW9kZSBpcyBkaXNhYmxlZCAoaXNzdWUgIzI5MjkzNSknLCAoKSA9PiB7XG5cdFx0Ly8gRGlzYWJsZSBhZ2VudCBtb2RlXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkLCBmYWxzZSk7XG5cblx0XHQvLyBDcmVhdGUgaW50ZXJuYWwgaW5mcmFzdHJ1Y3R1cmUgdG9vbCB0aGF0IGV4cGxpY2l0bHkgY2Fubm90IGJlIHJlZmVyZW5jZWQgaW4gcHJvbXB0c1xuXHRcdGNvbnN0IGluZnJhc3RydWN0dXJlVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdpbmZyYXN0cnVjdHVyZVRvb2xJbnRlcm5hbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2luZnJhc3RydWN0dXJlVG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnSW5mcmFzdHJ1Y3R1cmUgVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0luZnJhc3RydWN0dXJlIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiBmYWxzZSxcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoaW5mcmFzdHJ1Y3R1cmVUb29sKSk7XG5cblx0XHQvLyBDcmVhdGUgaW50ZXJuYWwgdG9vbCB3aXRoIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0PXRydWUgKHNob3VsZCBiZSBibG9ja2VkKVxuXHRcdGNvbnN0IHJlZmVyZW5jYWJsZVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAncmVmZXJlbmNhYmxlVG9vbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3JlZmVyZW5jYWJsZVRvb2xSZWYnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1JlZmVyZW5jYWJsZSBUb29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUmVmZXJlbmNhYmxlIFRvb2wnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShyZWZlcmVuY2FibGVUb29sKSk7XG5cblx0XHQvLyBDcmVhdGUgaW50ZXJuYWwgdG9vbCB3aXRoIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0PXVuZGVmaW5lZCAoc2hvdWxkIGJlIGJsb2NrZWQpXG5cdFx0Y29uc3QgdW5kZWZpbmVkVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd1bmRlZmluZWRUb29sJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndW5kZWZpbmVkVG9vbFJlZicsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVW5kZWZpbmVkIFRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdVbmRlZmluZWQgVG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0Ly8gY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQgaXMgdW5kZWZpbmVkXG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHVuZGVmaW5lZFRvb2wpKTtcblxuXHRcdC8vIEdldCB0b29scyAtIG9ubHkgdGhlIGluZnJhc3RydWN0dXJlIHRvb2wgc2hvdWxkIGJlIGF2YWlsYWJsZVxuXHRcdGNvbnN0IHRvb2xzID0gQXJyYXkuZnJvbShzZXJ2aWNlLmdldFRvb2xzKHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xJZHMgPSB0b29scy5tYXAodCA9PiB0LmlkKTtcblxuXHRcdGFzc2VydC5vayh0b29sSWRzLmluY2x1ZGVzKCdpbmZyYXN0cnVjdHVyZVRvb2xJbnRlcm5hbCcpLCAnSW50ZXJuYWwgaW5mcmFzdHJ1Y3R1cmUgdG9vbCB3aXRoIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0PWZhbHNlIHNob3VsZCBiZSBwZXJtaXR0ZWQgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKCF0b29sSWRzLmluY2x1ZGVzKCdyZWZlcmVuY2FibGVUb29sJyksICdJbnRlcm5hbCB0b29sIHdpdGggY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ9dHJ1ZSBzaG91bGQgTk9UIGJlIHBlcm1pdHRlZCB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQnKTtcblx0XHRhc3NlcnQub2soIXRvb2xJZHMuaW5jbHVkZXMoJ3VuZGVmaW5lZFRvb2wnKSwgJ0ludGVybmFsIHRvb2wgd2l0aCBjYW5CZVJlZmVyZW5jZWRJblByb21wdD11bmRlZmluZWQgc2hvdWxkIE5PVCBiZSBwZXJtaXR0ZWQgd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUb29sU2V0IHdoZW4gY2xhdXNlIGZpbHRlcmluZyAoaXNzdWUgIzI5MTE1NCknLCAoKSA9PiB7XG5cdFx0dGVzdCgnVG9vbFNldC5nZXRUb29scyBmaWx0ZXJzIHRvb2xzIGJ5IHdoZW4gY2xhdXNlJywgKCkgPT4ge1xuXHRcdFx0Ly8gQ3JlYXRlIGEgY29udGV4dCBrZXkgZm9yIHRlc3Rpbmdcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgndGVzdEZlYXR1cmVFbmFibGVkJywgZmFsc2UpO1xuXG5cdFx0XHQvLyBDcmVhdGUgdG9vbHMgd2l0aCBkaWZmZXJlbnQgd2hlbiBjbGF1c2VzXG5cdFx0XHRjb25zdCB0b29sV2l0aFdoZW5UcnVlOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAndG9vbFdpdGhXaGVuVHJ1ZScsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUb29sIHdpdGggd2hlbiB0cnVlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUb29sIHdpdGggd2hlbiB0cnVlJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKCd0ZXN0RmVhdHVyZUVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xXaXRoV2hlbkZhbHNlOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAndG9vbFdpdGhXaGVuRmFsc2UnLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVG9vbCB3aXRoIHdoZW4gZmFsc2UnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rvb2wgd2l0aCB3aGVuIGZhbHNlJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKCd0ZXN0RmVhdHVyZUVuYWJsZWQnLCBmYWxzZSksXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sV2l0aG91dFdoZW46IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICd0b29sV2l0aG91dFdoZW4nLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVG9vbCB3aXRob3V0IHdoZW4nLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rvb2wgd2l0aG91dCB3aGVuJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdH07XG5cblx0XHRcdC8vIENyZWF0ZSBhIHRvb2wgc2V0IGFuZCBhZGQgdGhlIHRvb2xzXG5cdFx0XHRjb25zdCB0ZXN0VG9vbFNldCA9IHN0b3JlLmFkZChzZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRcdFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0XHQndGVzdFRvb2xTZXQnLFxuXHRcdFx0XHQndGVzdFRvb2xTZXRSZWYnLFxuXHRcdFx0XHR7IGRlc2NyaXB0aW9uOiAnVGVzdCBUb29sIFNldCcgfVxuXHRcdFx0KSk7XG5cblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbFdpdGhXaGVuVHJ1ZSkpO1xuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sV2l0aFdoZW5GYWxzZSkpO1xuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sV2l0aG91dFdoZW4pKTtcblxuXHRcdFx0c3RvcmUuYWRkKHRlc3RUb29sU2V0LmFkZFRvb2wodG9vbFdpdGhXaGVuVHJ1ZSkpO1xuXHRcdFx0c3RvcmUuYWRkKHRlc3RUb29sU2V0LmFkZFRvb2wodG9vbFdpdGhXaGVuRmFsc2UpKTtcblx0XHRcdHN0b3JlLmFkZCh0ZXN0VG9vbFNldC5hZGRUb29sKHRvb2xXaXRob3V0V2hlbikpO1xuXG5cdFx0XHQvLyBHZXQgdG9vbHMgZnJvbSB0aGUgdG9vbCBzZXRcblx0XHRcdGNvbnN0IHRvb2xzID0gQXJyYXkuZnJvbSh0ZXN0VG9vbFNldC5nZXRUb29scygpKTtcblx0XHRcdGNvbnN0IHRvb2xJZHMgPSB0b29scy5tYXAodCA9PiB0LmlkKTtcblxuXHRcdFx0Ly8gU2luY2UgdGVzdEZlYXR1cmVFbmFibGVkIGlzIGZhbHNlLCBvbmx5IHRvb2xzIHdpdGggd2hlbj1mYWxzZSBvciBubyB3aGVuIGNsYXVzZSBzaG91bGQgYmUgYXZhaWxhYmxlXG5cdFx0XHRhc3NlcnQub2sodG9vbElkcy5pbmNsdWRlcygndG9vbFdpdGhXaGVuRmFsc2UnKSwgJ1Rvb2wgd2l0aCB3aGVuPWZhbHNlIHNob3VsZCBiZSBpbiB0b29sIHNldCB3aGVuIGNvbnRleHQga2V5IGlzIGZhbHNlJyk7XG5cdFx0XHRhc3NlcnQub2sodG9vbElkcy5pbmNsdWRlcygndG9vbFdpdGhvdXRXaGVuJyksICdUb29sIHdpdGhvdXQgd2hlbiBjbGF1c2Ugc2hvdWxkIGJlIGluIHRvb2wgc2V0Jyk7XG5cdFx0XHRhc3NlcnQub2soIXRvb2xJZHMuaW5jbHVkZXMoJ3Rvb2xXaXRoV2hlblRydWUnKSwgJ1Rvb2wgd2l0aCB3aGVuPXRydWUgc2hvdWxkIE5PVCBiZSBpbiB0b29sIHNldCB3aGVuIGNvbnRleHQga2V5IGlzIGZhbHNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdUb29sU2V0LmdldFRvb2xzIHVwZGF0ZXMgd2hlbiBjb250ZXh0IGtleSBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdFx0Ly8gQ3JlYXRlIGEgY29udGV4dCBrZXkgZm9yIHRlc3Rpbmdcblx0XHRcdGNvbnN0IHRlc3RLZXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8c3RyaW5nPignZHluYW1pY1Rlc3RLZXknLCAndmFsdWUxJyk7XG5cblx0XHRcdC8vIENyZWF0ZSB0b29scyB3aXRoIHdoZW4gY2xhdXNlc1xuXHRcdFx0Y29uc3QgdG9vbFdpdGhWYWx1ZTE6IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICd0b29sV2l0aFZhbHVlMScsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUb29sIHdpdGggdmFsdWUxJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUb29sIHdpdGggdmFsdWUxJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKCdkeW5hbWljVGVzdEtleScsICd2YWx1ZTEnKSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xXaXRoVmFsdWUyOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAndG9vbFdpdGhWYWx1ZTInLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVG9vbCB3aXRoIHZhbHVlMicsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVG9vbCB3aXRoIHZhbHVlMicsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFcXVhbHNFeHByLmNyZWF0ZSgnZHluYW1pY1Rlc3RLZXknLCAndmFsdWUyJyksXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBDcmVhdGUgYSB0b29sIHNldCBhbmQgYWRkIHRoZSB0b29sc1xuXHRcdFx0Y29uc3QgZHluYW1pY1Rvb2xTZXQgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0XHRUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0J2R5bmFtaWNUb29sU2V0Jyxcblx0XHRcdFx0J2R5bmFtaWNUb29sU2V0UmVmJyxcblx0XHRcdFx0eyBkZXNjcmlwdGlvbjogJ0R5bmFtaWMgVG9vbCBTZXQnIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xXaXRoVmFsdWUxKSk7XG5cdFx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xXaXRoVmFsdWUyKSk7XG5cblx0XHRcdHN0b3JlLmFkZChkeW5hbWljVG9vbFNldC5hZGRUb29sKHRvb2xXaXRoVmFsdWUxKSk7XG5cdFx0XHRzdG9yZS5hZGQoZHluYW1pY1Rvb2xTZXQuYWRkVG9vbCh0b29sV2l0aFZhbHVlMikpO1xuXG5cdFx0XHQvLyBJbml0aWFsIHN0YXRlOiB2YWx1ZTEgaXMgc2V0XG5cdFx0XHRsZXQgdG9vbHMgPSBBcnJheS5mcm9tKGR5bmFtaWNUb29sU2V0LmdldFRvb2xzKCkpO1xuXHRcdFx0bGV0IHRvb2xJZHMgPSB0b29scy5tYXAodCA9PiB0LmlkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xzLmxlbmd0aCwgMSwgJ1Nob3VsZCBoYXZlIDEgdG9vbCBpbml0aWFsbHknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sSWRzWzBdLCAndG9vbFdpdGhWYWx1ZTEnLCAnU2hvdWxkIGJlIHRvb2xXaXRoVmFsdWUxJyk7XG5cblx0XHRcdC8vIENoYW5nZSBjb250ZXh0IGtleSB0byB2YWx1ZTJcblx0XHRcdHRlc3RLZXkuc2V0KCd2YWx1ZTInKTtcblxuXHRcdFx0c2VydmljZS5mbHVzaFRvb2xVcGRhdGVzKCk7XG5cblx0XHRcdC8vIE5vdyB0b29sV2l0aFZhbHVlMiBzaG91bGQgYmUgYXZhaWxhYmxlXG5cdFx0XHR0b29scyA9IEFycmF5LmZyb20oZHluYW1pY1Rvb2xTZXQuZ2V0VG9vbHMoKSk7XG5cdFx0XHR0b29sSWRzID0gdG9vbHMubWFwKHQgPT4gdC5pZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29scy5sZW5ndGgsIDEsICdTaG91bGQgaGF2ZSAxIHRvb2wgYWZ0ZXIgY2hhbmdlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbElkc1swXSwgJ3Rvb2xXaXRoVmFsdWUyJywgJ1Nob3VsZCBiZSB0b29sV2l0aFZhbHVlMiBhZnRlciBjb250ZXh0IGNoYW5nZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnVG9vbFNldC5nZXRUb29scyB3aXRoIGNvbXBsZXggd2hlbiBleHByZXNzaW9ucycsICgpID0+IHtcblx0XHRcdC8vIENyZWF0ZSBtdWx0aXBsZSBjb250ZXh0IGtleXMgZm9yIHRlc3RpbmcgY29tcGxleCBleHByZXNzaW9uc1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdmZWF0dXJlQScsIHRydWUpO1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdmZWF0dXJlQicsIGZhbHNlKTtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnZmVhdHVyZUMnLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgdG9vbFdpdGhBbmQ6IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICd0b29sV2l0aEFuZCcsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUb29sIHdpdGggQU5EIGV4cHJlc3Npb24nLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rvb2wgd2l0aCBBTkQnLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdmZWF0dXJlQScpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnZmVhdHVyZUMnKVxuXHRcdFx0XHQpLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdG9vbFdpdGhPcjogSVRvb2xEYXRhID0ge1xuXHRcdFx0XHRpZDogJ3Rvb2xXaXRoT3InLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVG9vbCB3aXRoIE9SIGV4cHJlc3Npb24nLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rvb2wgd2l0aCBPUicsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnZmVhdHVyZUEnKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2ZlYXR1cmVDJylcblx0XHRcdFx0KSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xXaXRoTm90OiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAndG9vbFdpdGhOb3QnLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVG9vbCB3aXRoIE5PVCBleHByZXNzaW9uJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUb29sIHdpdGggTk9UJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIubm90KCdmZWF0dXJlQicpLFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgdG9vbCBzZXQgYW5kIGFkZCB0aGUgdG9vbHNcblx0XHRcdGNvbnN0IGNvbXBsZXhUb29sU2V0ID0gc3RvcmUuYWRkKHNlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFx0VG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdCdjb21wbGV4VG9vbFNldCcsXG5cdFx0XHRcdCdjb21wbGV4VG9vbFNldFJlZicsXG5cdFx0XHRcdHsgZGVzY3JpcHRpb246ICdDb21wbGV4IFRvb2wgU2V0JyB9XG5cdFx0XHQpKTtcblxuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sV2l0aEFuZCkpO1xuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sV2l0aE9yKSk7XG5cdFx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xXaXRoTm90KSk7XG5cblx0XHRcdHN0b3JlLmFkZChjb21wbGV4VG9vbFNldC5hZGRUb29sKHRvb2xXaXRoQW5kKSk7XG5cdFx0XHRzdG9yZS5hZGQoY29tcGxleFRvb2xTZXQuYWRkVG9vbCh0b29sV2l0aE9yKSk7XG5cdFx0XHRzdG9yZS5hZGQoY29tcGxleFRvb2xTZXQuYWRkVG9vbCh0b29sV2l0aE5vdCkpO1xuXG5cdFx0XHQvLyBHZXQgdG9vbHMgZnJvbSB0aGUgdG9vbCBzZXRcblx0XHRcdGNvbnN0IHRvb2xzID0gQXJyYXkuZnJvbShjb21wbGV4VG9vbFNldC5nZXRUb29scygpKTtcblx0XHRcdGNvbnN0IHRvb2xJZHMgPSB0b29scy5tYXAodCA9PiB0LmlkKTtcblxuXHRcdFx0Ly8gZmVhdHVyZUE9dHJ1ZSwgZmVhdHVyZUI9ZmFsc2UsIGZlYXR1cmVDPXRydWVcblx0XHRcdC8vIHRvb2xXaXRoQW5kOiBoYXMoJ2ZlYXR1cmVBJykgQU5EIGhhcygnZmVhdHVyZUMnKSA9IHRydWVcblx0XHRcdC8vIHRvb2xXaXRoT3I6IGhhcygnZmVhdHVyZUEnKSBPUiBoYXMoJ2ZlYXR1cmVDJykgPSB0cnVlXG5cdFx0XHQvLyB0b29sV2l0aE5vdDogTk9UIGhhcygnZmVhdHVyZUInKSA9IHRydWVcblx0XHRcdGFzc2VydC5vayh0b29sSWRzLmluY2x1ZGVzKCd0b29sV2l0aEFuZCcpLCAnVG9vbCB3aXRoIEFORCBzaG91bGQgYmUgaW4gdG9vbCBzZXQgKGhhcyhmZWF0dXJlQSkgQU5EIGhhcyhmZWF0dXJlQykgPSB0cnVlKScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xJZHMuaW5jbHVkZXMoJ3Rvb2xXaXRoT3InKSwgJ1Rvb2wgd2l0aCBPUiBzaG91bGQgYmUgaW4gdG9vbCBzZXQgKGhhcyhmZWF0dXJlQSkgT1IgaGFzKGZlYXR1cmVDKSA9IHRydWUpJyk7XG5cdFx0XHRhc3NlcnQub2sodG9vbElkcy5pbmNsdWRlcygndG9vbFdpdGhOb3QnKSwgJ1Rvb2wgd2l0aCBOT1Qgc2hvdWxkIGJlIGluIHRvb2wgc2V0IChOT1QgaGFzKGZlYXR1cmVCKSA9IHRydWUpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdUb29sU2V0LmdldFRvb2xzIGZpbHRlcnMgbmVzdGVkIHRvb2wgc2V0cyBieSB3aGVuIGNsYXVzZScsICgpID0+IHtcblx0XHRcdC8vIENyZWF0ZSBhIGNvbnRleHQga2V5IGZvciB0ZXN0aW5nXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ25lc3RlZEZlYXR1cmUnLCBmYWxzZSk7XG5cblx0XHRcdC8vIENyZWF0ZSB0b29scyBpbiBwYXJlbnQgdG9vbCBzZXRcblx0XHRcdGNvbnN0IHBhcmVudFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICdwYXJlbnRUb29sJyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1BhcmVudCBUb29sJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdQYXJlbnQgVG9vbCcsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBDcmVhdGUgdG9vbHMgaW4gY2hpbGQgdG9vbCBzZXQgd2l0aCB3aGVuIGNsYXVzZVxuXHRcdFx0Y29uc3QgY2hpbGRUb29sV2l0aFdoZW46IElUb29sRGF0YSA9IHtcblx0XHRcdFx0aWQ6ICdjaGlsZFRvb2xXaXRoV2hlbicsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdDaGlsZCBUb29sIHdpdGggV2hlbicsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnQ2hpbGQgVG9vbCB3aXRoIFdoZW4nLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXF1YWxzRXhwci5jcmVhdGUoJ25lc3RlZEZlYXR1cmUnLCB0cnVlKSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGNoaWxkVG9vbFdpdGhvdXRXaGVuOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAnY2hpbGRUb29sV2l0aG91dFdoZW4nLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQ2hpbGQgVG9vbCB3aXRob3V0IFdoZW4nLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0NoaWxkIFRvb2wgd2l0aG91dCBXaGVuJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdH07XG5cblx0XHRcdC8vIENyZWF0ZSBwYXJlbnQgdG9vbCBzZXRcblx0XHRcdGNvbnN0IHBhcmVudFRvb2xTZXQgPSBzdG9yZS5hZGQoc2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0XHRUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0J3BhcmVudFRvb2xTZXQnLFxuXHRcdFx0XHQncGFyZW50VG9vbFNldFJlZicsXG5cdFx0XHRcdHsgZGVzY3JpcHRpb246ICdQYXJlbnQgVG9vbCBTZXQnIH1cblx0XHRcdCkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgY2hpbGQgdG9vbCBzZXRcblx0XHRcdGNvbnN0IGNoaWxkVG9vbFNldCA9IHN0b3JlLmFkZChzZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRcdFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0XHQnY2hpbGRUb29sU2V0Jyxcblx0XHRcdFx0J2NoaWxkVG9vbFNldFJlZicsXG5cdFx0XHRcdHsgZGVzY3JpcHRpb246ICdDaGlsZCBUb29sIFNldCcgfVxuXHRcdFx0KSk7XG5cblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEocGFyZW50VG9vbCkpO1xuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShjaGlsZFRvb2xXaXRoV2hlbikpO1xuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShjaGlsZFRvb2xXaXRob3V0V2hlbikpO1xuXG5cdFx0XHRzdG9yZS5hZGQocGFyZW50VG9vbFNldC5hZGRUb29sKHBhcmVudFRvb2wpKTtcblx0XHRcdHN0b3JlLmFkZChwYXJlbnRUb29sU2V0LmFkZFRvb2xTZXQoY2hpbGRUb29sU2V0KSk7XG5cdFx0XHRzdG9yZS5hZGQoY2hpbGRUb29sU2V0LmFkZFRvb2woY2hpbGRUb29sV2l0aFdoZW4pKTtcblx0XHRcdHN0b3JlLmFkZChjaGlsZFRvb2xTZXQuYWRkVG9vbChjaGlsZFRvb2xXaXRob3V0V2hlbikpO1xuXG5cdFx0XHQvLyBHZXQgdG9vbHMgZnJvbSB0aGUgcGFyZW50IHRvb2wgc2V0XG5cdFx0XHRjb25zdCB0b29scyA9IEFycmF5LmZyb20ocGFyZW50VG9vbFNldC5nZXRUb29scygpKTtcblx0XHRcdGNvbnN0IHRvb2xJZHMgPSB0b29scy5tYXAodCA9PiB0LmlkKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGluY2x1ZGUgcGFyZW50IHRvb2wsIGNoaWxkIHRvb2wgd2l0aG91dCB3aGVuLCBidXQgbm90IGNoaWxkIHRvb2wgd2l0aCB3aGVuXG5cdFx0XHRhc3NlcnQub2sodG9vbElkcy5pbmNsdWRlcygncGFyZW50VG9vbCcpLCAnUGFyZW50IHRvb2wgc2hvdWxkIGJlIGluIHRvb2wgc2V0Jyk7XG5cdFx0XHRhc3NlcnQub2sodG9vbElkcy5pbmNsdWRlcygnY2hpbGRUb29sV2l0aG91dFdoZW4nKSwgJ0NoaWxkIHRvb2wgd2l0aG91dCB3aGVuIHNob3VsZCBiZSBpbiB0b29sIHNldCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCF0b29sSWRzLmluY2x1ZGVzKCdjaGlsZFRvb2xXaXRoV2hlbicpLCAnQ2hpbGQgdG9vbCB3aXRoIHdoZW49dHJ1ZSBzaG91bGQgTk9UIGJlIGluIHRvb2wgc2V0IHdoZW4gY29udGV4dCBrZXkgaXMgZmFsc2UnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3ByZVRvb2xVc2UgaG9va3MnLCAoKSA9PiB7XG5cdFx0bGV0IGhvb2tTZXJ2aWNlOiBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlO1xuXHRcdGxldCBob29rQ2hhdFNlcnZpY2U6IE1vY2tDaGF0U2VydmljZTtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGNvbnN0IHNldHVwID0gY3JlYXRlVGVzdFRvb2xzU2VydmljZShzdG9yZSk7XG5cdFx0XHRob29rU2VydmljZSA9IHNldHVwLnNlcnZpY2U7XG5cdFx0XHRob29rQ2hhdFNlcnZpY2UgPSBzZXR1cC5jaGF0U2VydmljZTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3doZW4gaG9vayBkZW5pZXMsIHRvb2wgcmV0dXJucyBlcnJvciBhbmQgY3JlYXRlcyBjYW5jZWxsZWQgaW52b2NhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KGhvb2tTZXJ2aWNlLCBzdG9yZSwgJ2hvb2tEZW55VG9vbCcsIHtcblx0XHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnc2hvdWxkIG5vdCBydW4nIH1dIH0pXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogQ2hhdFRvb2xJbnZvY2F0aW9uIH0gPSB7fTtcblx0XHRcdHN0dWJHZXRTZXNzaW9uKGhvb2tDaGF0U2VydmljZSwgJ2hvb2stdGVzdCcsIHsgcmVxdWVzdElkOiAncmVxMScsIGNhcHR1cmUgfSk7XG5cblx0XHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IHRlc3Q6IDEgfSwgeyBzZXNzaW9uSWQ6ICdob29rLXRlc3QnIH0pO1xuXHRcdFx0ZHRvLnByZVRvb2xVc2VSZXN1bHQgPSB7XG5cdFx0XHRcdHBlcm1pc3Npb25EZWNpc2lvbjogJ2RlbnknLFxuXHRcdFx0XHRwZXJtaXNzaW9uRGVjaXNpb25SZWFzb246ICdEZXN0cnVjdGl2ZSBvcGVyYXRpb25zIHJlcXVpcmUgYXBwcm92YWwnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaG9va1NlcnZpY2UuaW52b2tlVG9vbChcblx0XHRcdFx0ZHRvLFxuXHRcdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBWZXJpZnkgZXJyb3IgcmVzdWx0IHJldHVybmVkXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnRvb2xSZXN1bHRFcnJvcik7XG5cdFx0XHRhc3NlcnQub2soKHJlc3VsdC50b29sUmVzdWx0RXJyb3IgYXMgc3RyaW5nKS5pbmNsdWRlcygnRGVzdHJ1Y3RpdmUgb3BlcmF0aW9ucyByZXF1aXJlIGFwcHJvdmFsJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICd0ZXh0Jyk7XG5cdFx0XHRhc3NlcnQub2soKHJlc3VsdC5jb250ZW50WzBdIGFzIElUb29sUmVzdWx0VGV4dFBhcnQpLnZhbHVlLmluY2x1ZGVzKCdUb29sIGV4ZWN1dGlvbiBkZW5pZWQnKSk7XG5cblx0XHRcdC8vIFZlcmlmeSBhIGNhbmNlbGxlZCBpbnZvY2F0aW9uIHdhcyBjcmVhdGVkXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gYXdhaXQgd2FpdEZvclB1Ymxpc2hlZEludm9jYXRpb24oY2FwdHVyZSk7XG5cdFx0XHRhc3NlcnQub2soaW52b2NhdGlvbik7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudHlwZSwgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKTtcblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnJlYXNvbiwgVG9vbENvbmZpcm1LaW5kLkRlbmllZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5yZWFzb25NZXNzYWdlLCAnRGVuaWVkIGJ5IFByZVRvb2xVc2UgaG9vazogRGVzdHJ1Y3RpdmUgb3BlcmF0aW9ucyByZXF1aXJlIGFwcHJvdmFsJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aGVuIGhvb2sgYWxsb3dzLCB0b29sIGV4ZWN1dGVzIG5vcm1hbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QoaG9va1NlcnZpY2UsIHN0b3JlLCAnaG9va0FsbG93VG9vbCcsIHtcblx0XHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnc3VjY2VzcycgfV0gfSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjYXB0dXJlOiB7IGludm9jYXRpb24/OiBDaGF0VG9vbEludm9jYXRpb24gfSA9IHt9O1xuXHRcdFx0c3R1YkdldFNlc3Npb24oaG9va0NoYXRTZXJ2aWNlLCAnaG9vay10ZXN0LWFsbG93JywgeyByZXF1ZXN0SWQ6ICdyZXExJywgY2FwdHVyZSB9KTtcblxuXHRcdFx0Y29uc3QgZHRvID0gdG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZDogJ2hvb2stdGVzdC1hbGxvdycgfSk7XG5cdFx0XHRkdG8ucHJlVG9vbFVzZVJlc3VsdCA9IHtcblx0XHRcdFx0cGVybWlzc2lvbkRlY2lzaW9uOiAnYWxsb3cnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaG9va1NlcnZpY2UuaW52b2tlVG9vbChcblx0XHRcdFx0ZHRvLFxuXHRcdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LmNvbnRlbnRbMF0gYXMgSVRvb2xSZXN1bHRUZXh0UGFydCkudmFsdWUsICdzdWNjZXNzJyk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC50b29sUmVzdWx0RXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2hlbiBob29rIHJldHVybnMgdW5kZWZpbmVkLCB0b29sIGV4ZWN1dGVzIG5vcm1hbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QoaG9va1NlcnZpY2UsIHN0b3JlLCAnaG9va1VuZGVmaW5lZFRvb2wnLCB7XG5cdFx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3N1Y2Nlc3MnIH1dIH0pXG5cdFx0XHR9KTtcblxuXHRcdFx0c3R1YkdldFNlc3Npb24oaG9va0NoYXRTZXJ2aWNlLCAnaG9vay10ZXN0LXVuZGVmaW5lZCcsIHsgcmVxdWVzdElkOiAncmVxMScgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhvb2tTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRcdHRvb2wubWFrZUR0byh7IHRlc3Q6IDEgfSwgeyBzZXNzaW9uSWQ6ICdob29rLXRlc3QtdW5kZWZpbmVkJyB9KSxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICd0ZXh0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdC5jb250ZW50WzBdIGFzIElUb29sUmVzdWx0VGV4dFBhcnQpLnZhbHVlLCAnc3VjY2VzcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2hlbiBob29rIGRlbmllcywgdG9vbCBpbnZva2UgaXMgbmV2ZXIgY2FsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGludm9rZUNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QoaG9va1NlcnZpY2UsIHN0b3JlLCAnaG9va05ldmVySW52b2tlVG9vbCcsIHtcblx0XHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aW52b2tlQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnc2hvdWxkIG5vdCBydW4nIH1dIH07XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjYXB0dXJlOiB7IGludm9jYXRpb24/OiB1bmtub3duIH0gPSB7fTtcblx0XHRcdHN0dWJHZXRTZXNzaW9uKGhvb2tDaGF0U2VydmljZSwgJ2hvb2stdGVzdC1uby1pbnZva2UnLCB7IHJlcXVlc3RJZDogJ3JlcTEnLCBjYXB0dXJlIH0pO1xuXG5cdFx0XHRjb25zdCBkdG8gPSB0b29sLm1ha2VEdG8oeyB0ZXN0OiAxIH0sIHsgc2Vzc2lvbklkOiAnaG9vay10ZXN0LW5vLWludm9rZScgfSk7XG5cdFx0XHRkdG8ucHJlVG9vbFVzZVJlc3VsdCA9IHtcblx0XHRcdFx0cGVybWlzc2lvbkRlY2lzaW9uOiAnZGVueScsXG5cdFx0XHRcdHBlcm1pc3Npb25EZWNpc2lvblJlYXNvbjogJ09wZXJhdGlvbiBub3QgYWxsb3dlZCcsXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBob29rU2VydmljZS5pbnZva2VUb29sKFxuXHRcdFx0XHRkdG8sXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZva2VDYWxsZWQsIGZhbHNlLCAnVG9vbCBpbnZva2Ugc2hvdWxkIG5vdCBiZSBjYWxsZWQgd2hlbiBob29rIGRlbmllcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2hlbiBob29rIHJldHVybnMgYXNrLCB0b29sIGlzIG5vdCBhdXRvLWFwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGludm9rZUNvbXBsZXRlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QoaG9va1NlcnZpY2UsIHN0b3JlLCAnaG9va0Fza1Rvb2wnLCB7XG5cdFx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGludm9rZUNvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3N1Y2Nlc3MnIH1dIH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdFx0dGl0bGU6ICdDb25maXJtIHRoaXMgYWN0aW9uPycsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnVGhpcyB0b29sIHJlcXVpcmVzIGNvbmZpcm1hdGlvbicsXG5cdFx0XHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IENoYXRUb29sSW52b2NhdGlvbiB9ID0ge307XG5cdFx0XHRzdHViR2V0U2Vzc2lvbihob29rQ2hhdFNlcnZpY2UsICdob29rLXRlc3QtYXNrJywgeyByZXF1ZXN0SWQ6ICdyZXExJywgY2FwdHVyZSB9KTtcblxuXHRcdFx0Y29uc3QgZHRvID0gdG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZDogJ2hvb2stdGVzdC1hc2snIH0pO1xuXHRcdFx0ZHRvLnByZVRvb2xVc2VSZXN1bHQgPSB7XG5cdFx0XHRcdHBlcm1pc3Npb25EZWNpc2lvbjogJ2FzaycsXG5cdFx0XHRcdHBlcm1pc3Npb25EZWNpc2lvblJlYXNvbjogJ1JlcXVpcmVzIHVzZXIgY29uZmlybWF0aW9uJyxcblx0XHRcdH07XG5cblx0XHRcdC8vIFN0YXJ0IGludm9jYXRpb24gLSBpdCBzaG91bGQgd2FpdCBmb3IgY29uZmlybWF0aW9uXG5cdFx0XHRjb25zdCBpbnZva2VQcm9taXNlID0gaG9va1NlcnZpY2UuaW52b2tlVG9vbChcblx0XHRcdFx0ZHRvLFxuXHRcdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gYXdhaXQgd2FpdEZvclB1Ymxpc2hlZEludm9jYXRpb24oY2FwdHVyZSk7XG5cdFx0XHRhc3NlcnQub2soaW52b2NhdGlvbiwgJ1Rvb2wgaW52b2NhdGlvbiBzaG91bGQgYmUgY3JlYXRlZCcpO1xuXG5cdFx0XHQvLyBDaGVjayB0aGF0IHRoZSB0b29sIGlzIHdhaXRpbmcgZm9yIGNvbmZpcm1hdGlvbiAobm90IGF1dG8tYXBwcm92ZWQpXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudHlwZSwgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0J1Rvb2wgc2hvdWxkIGJlIHdhaXRpbmcgZm9yIGNvbmZpcm1hdGlvbiB3aGVuIGhvb2sgcmV0dXJucyBhc2snKTtcblxuXHRcdFx0Ly8gQ29uZmlybSB0aGUgdG9vbCB0byBsZXQgdGhlIHRlc3QgY29tcGxldGVcblx0XHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgoaW52b2NhdGlvbiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRcdGF3YWl0IGludm9rZVByb21pc2U7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZva2VDb21wbGV0ZWQsIHRydWUsICdUb29sIHNob3VsZCBjb21wbGV0ZSBhZnRlciBjb25maXJtYXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3doZW4gaG9vayByZXR1cm5zIGFsbG93LCB0b29sIGlzIGF1dG8tYXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgaW52b2tlQ29tcGxldGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdChob29rU2VydmljZSwgc3RvcmUsICdob29rQXV0b0FwcHJvdmVUb29sJywge1xuXHRcdFx0XHRpbnZva2U6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpbnZva2VDb21wbGV0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdzdWNjZXNzJyB9XSB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0XHRcdHRpdGxlOiAnQ29uZmlybSB0aGlzIGFjdGlvbj8nLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogJ1RoaXMgdG9vbCB3b3VsZCBub3JtYWxseSByZXF1aXJlIGNvbmZpcm1hdGlvbicsXG5cdFx0XHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IENoYXRUb29sSW52b2NhdGlvbiB9ID0ge307XG5cdFx0XHRzdHViR2V0U2Vzc2lvbihob29rQ2hhdFNlcnZpY2UsICdob29rLXRlc3QtYXV0by1hcHByb3ZlJywgeyByZXF1ZXN0SWQ6ICdyZXExJywgY2FwdHVyZSB9KTtcblxuXHRcdFx0Y29uc3QgZHRvID0gdG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9LCB7IHNlc3Npb25JZDogJ2hvb2stdGVzdC1hdXRvLWFwcHJvdmUnIH0pO1xuXHRcdFx0ZHRvLnByZVRvb2xVc2VSZXN1bHQgPSB7XG5cdFx0XHRcdHBlcm1pc3Npb25EZWNpc2lvbjogJ2FsbG93Jyxcblx0XHRcdH07XG5cblx0XHRcdC8vIEludm9rZSB0aGUgdG9vbCAtIGl0IHNob3VsZCBhdXRvLWFwcHJvdmUgZHVlIHRvIGhvb2tcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhvb2tTZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRcdGR0byxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVG9vbCBzaG91bGQgaGF2ZSBjb21wbGV0ZWQgd2l0aG91dCB3YWl0aW5nIGZvciBjb25maXJtYXRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZva2VDb21wbGV0ZWQsIHRydWUsICdUb29sIHNob3VsZCBjb21wbGV0ZSBpbW1lZGlhdGVseSB3aGVuIGhvb2sgYWxsb3dzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LmNvbnRlbnRbMF0gYXMgSVRvb2xSZXN1bHRUZXh0UGFydCkudmFsdWUsICdzdWNjZXNzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aGVuIGhvb2sgcmV0dXJucyB1cGRhdGVkSW5wdXQsIHRvb2wgaXMgaW52b2tlZCB3aXRoIHJlcGxhY2VkIHBhcmFtZXRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgcmVjZWl2ZWRQYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdChob29rU2VydmljZSwgc3RvcmUsICdob29rVXBkYXRlZElucHV0VG9vbCcsIHtcblx0XHRcdFx0aW52b2tlOiBhc3luYyAoZHRvKSA9PiB7XG5cdFx0XHRcdFx0cmVjZWl2ZWRQYXJhbWV0ZXJzID0gZHRvLnBhcmFtZXRlcnM7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ2RvbmUnIH1dIH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdFx0dGl0bGU6ICdDb25maXJtPycsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnQ29uZmlybSBhY3Rpb24nLFxuXHRcdFx0XHRcdFx0YWxsb3dBdXRvQ29uZmlybTogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSlcblx0XHRcdH0pO1xuXG5cdFx0XHRzdHViR2V0U2Vzc2lvbihob29rQ2hhdFNlcnZpY2UsICdob29rLXRlc3QtdXBkYXRlZC1pbnB1dCcsIHsgcmVxdWVzdElkOiAncmVxMScgfSk7XG5cblx0XHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IG9yaWdpbmFsQ29tbWFuZDogJ3JtIC1yZiAvJyB9LCB7IHNlc3Npb25JZDogJ2hvb2stdGVzdC11cGRhdGVkLWlucHV0JyB9KTtcblx0XHRcdGR0by5wcmVUb29sVXNlUmVzdWx0ID0ge1xuXHRcdFx0XHRwZXJtaXNzaW9uRGVjaXNpb246ICdhbGxvdycsXG5cdFx0XHRcdHVwZGF0ZWRJbnB1dDogeyBzYWZlQ29tbWFuZDogJ2VjaG8gaGVsbG8nIH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBob29rU2VydmljZS5pbnZva2VUb29sKFxuXHRcdFx0XHRkdG8sXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjZWl2ZWRQYXJhbWV0ZXJzLCB7IHNhZmVDb21tYW5kOiAnZWNobyBoZWxsbycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aGVuIGhvb2sgcmV0dXJucyB1cGRhdGVkSW5wdXQgdGhhdCBmYWlscyBzY2hlbWEgdmFsaWRhdGlvbiwgb3JpZ2luYWwgcGFyYW1ldGVycyBhcmUga2VwdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tDb21tYW5kU2VydmljZSA9IHtcblx0XHRcdFx0ZXhlY3V0ZUNvbW1hbmQ6IGFzeW5jIChjb21tYW5kSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGlmIChjb21tYW5kSWQgPT09ICdqc29uLnZhbGlkYXRlJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFt7IG1lc3NhZ2U6ICdNaXNzaW5nIHJlcXVpcmVkIHByb3BlcnR5IFwiY29tbWFuZFwiJywgcmFuZ2U6IFt7IGxpbmU6IDAsIGNoYXJhY3RlcjogMCB9LCB7IGxpbmU6IDAsIGNoYXJhY3RlcjogMSB9XSwgc2V2ZXJpdHk6ICdFcnJvcicgfV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHNldHVwID0gY3JlYXRlVGVzdFRvb2xzU2VydmljZShzdG9yZSwge1xuXHRcdFx0XHRjb21tYW5kU2VydmljZTogbW9ja0NvbW1hbmRTZXJ2aWNlIGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgcmVjZWl2ZWRQYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCB0b29sID0gcmVnaXN0ZXJUb29sRm9yVGVzdChzZXR1cC5zZXJ2aWNlLCBzdG9yZSwgJ2hvb2tWYWxpZGF0aW9uRmFpbFRvb2wnLCB7XG5cdFx0XHRcdGludm9rZTogYXN5bmMgKGR0bykgPT4ge1xuXHRcdFx0XHRcdHJlY2VpdmVkUGFyYW1ldGVycyA9IGR0by5wYXJhbWV0ZXJzO1xuXHRcdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdkb25lJyB9XSB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0XHRcdHRpdGxlOiAnQ29uZmlybT8nLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogJ0NvbmZpcm0gYWN0aW9uJyxcblx0XHRcdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczogeyBjb21tYW5kOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJ10sXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRzdHViR2V0U2Vzc2lvbihzZXR1cC5jaGF0U2VydmljZSwgJ2hvb2stdGVzdC12YWxpZGF0aW9uLWZhaWwnLCB7IHJlcXVlc3RJZDogJ3JlcTEnIH0pO1xuXG5cdFx0XHRjb25zdCBkdG8gPSB0b29sLm1ha2VEdG8oeyBjb21tYW5kOiAnb3JpZ2luYWwnIH0sIHsgc2Vzc2lvbklkOiAnaG9vay10ZXN0LXZhbGlkYXRpb24tZmFpbCcgfSk7XG5cdFx0XHRkdG8ucHJlVG9vbFVzZVJlc3VsdCA9IHtcblx0XHRcdFx0cGVybWlzc2lvbkRlY2lzaW9uOiAnYWxsb3cnLFxuXHRcdFx0XHR1cGRhdGVkSW5wdXQ6IHsgaW52YWxpZEZpZWxkOiAnd3JvbmcnIH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBzZXR1cC5zZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRcdGR0byxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gT3JpZ2luYWwgcGFyYW1ldGVycyBzaG91bGQgYmUga2VwdCBzaW5jZSB2YWxpZGF0aW9uIGZhaWxlZFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZFBhcmFtZXRlcnMsIHsgY29tbWFuZDogJ29yaWdpbmFsJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3doZW4gaG9vayByZXR1cm5zIHVwZGF0ZWRJbnB1dCB0aGF0IHBhc3NlcyBzY2hlbWEgdmFsaWRhdGlvbiwgcGFyYW1ldGVycyBhcmUgcmVwbGFjZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrQ29tbWFuZFNlcnZpY2UgPSB7XG5cdFx0XHRcdGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoY29tbWFuZElkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRpZiAoY29tbWFuZElkID09PSAnanNvbi52YWxpZGF0ZScpIHtcblx0XHRcdFx0XHRcdHJldHVybiBbXTsgLy8gbm8gZGlhZ25vc3RpY3MgPSB2YWxpZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdFx0Y29tbWFuZFNlcnZpY2U6IG1vY2tDb21tYW5kU2VydmljZSBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0bGV0IHJlY2VpdmVkUGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgYW55PiB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3Qoc2V0dXAuc2VydmljZSwgc3RvcmUsICdob29rVmFsaWRhdGlvblBhc3NUb29sJywge1xuXHRcdFx0XHRpbnZva2U6IGFzeW5jIChkdG8pID0+IHtcblx0XHRcdFx0XHRyZWNlaXZlZFBhcmFtZXRlcnMgPSBkdG8ucGFyYW1ldGVycztcblx0XHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnZG9uZScgfV0gfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdFx0XHR0aXRsZTogJ0NvbmZpcm0/Jyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6ICdDb25maXJtIGFjdGlvbicsXG5cdFx0XHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHsgY29tbWFuZDogeyB0eXBlOiAnc3RyaW5nJyB9IH0sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnY29tbWFuZCddLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0c3R1YkdldFNlc3Npb24oc2V0dXAuY2hhdFNlcnZpY2UsICdob29rLXRlc3QtdmFsaWRhdGlvbi1wYXNzJywgeyByZXF1ZXN0SWQ6ICdyZXExJyB9KTtcblxuXHRcdFx0Y29uc3QgZHRvID0gdG9vbC5tYWtlRHRvKHsgY29tbWFuZDogJ29yaWdpbmFsJyB9LCB7IHNlc3Npb25JZDogJ2hvb2stdGVzdC12YWxpZGF0aW9uLXBhc3MnIH0pO1xuXHRcdFx0ZHRvLnByZVRvb2xVc2VSZXN1bHQgPSB7XG5cdFx0XHRcdHBlcm1pc3Npb25EZWNpc2lvbjogJ2FsbG93Jyxcblx0XHRcdFx0dXBkYXRlZElucHV0OiB7IGNvbW1hbmQ6ICdzYWZlLWNvbW1hbmQnIH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBzZXR1cC5zZXJ2aWNlLmludm9rZVRvb2woXG5cdFx0XHRcdGR0byxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVXBkYXRlZCBwYXJhbWV0ZXJzIHNob3VsZCBiZSBhcHBsaWVkIHNpbmNlIHZhbGlkYXRpb24gcGFzc2VkXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY2VpdmVkUGFyYW1ldGVycywgeyBjb21tYW5kOiAnc2FmZS1jb21tYW5kJyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3ByZUFwcHJvdmVkIChvdXQtb2YtYmFuZCBhdXRvLWFwcHJvdmFsKScsICgpID0+IHtcblx0XHRsZXQgcHJlQXBwcm92ZWRTZXJ2aWNlOiBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlO1xuXHRcdGxldCBwcmVBcHByb3ZlZENoYXRTZXJ2aWNlOiBNb2NrQ2hhdFNlcnZpY2U7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUpO1xuXHRcdFx0cHJlQXBwcm92ZWRTZXJ2aWNlID0gc2V0dXAuc2VydmljZTtcblx0XHRcdHByZUFwcHJvdmVkQ2hhdFNlcnZpY2UgPSBzZXR1cC5jaGF0U2VydmljZTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgY29uZmlybWFibGUgdG9vbCB3aXRoIGR0by5wcmVBcHByb3ZlZCBuZXZlciBlbnRlcnMgV2FpdGluZ0ZvckNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBpbnZva2VDb21wbGV0ZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHByZUFwcHJvdmVkU2VydmljZSwgc3RvcmUsICdwcmVBcHByb3ZlZFRvb2wnLCB7XG5cdFx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGludm9rZUNvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3N1Y2Nlc3MnIH1dIH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdFx0dGl0bGU6ICdDb25maXJtIHRoaXMgYWN0aW9uPycsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnVGhpcyB0b29sIHdvdWxkIG5vcm1hbGx5IHJlcXVpcmUgY29uZmlybWF0aW9uJyxcblx0XHRcdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY2FwdHVyZTogeyBpbnZvY2F0aW9uPzogQ2hhdFRvb2xJbnZvY2F0aW9uIH0gPSB7fTtcblx0XHRcdHN0dWJHZXRTZXNzaW9uKHByZUFwcHJvdmVkQ2hhdFNlcnZpY2UsICdwcmUtYXBwcm92ZWQnLCB7IHJlcXVlc3RJZDogJ3JlcTEnLCBjYXB0dXJlIH0pO1xuXG5cdFx0XHRjb25zdCBkdG8gPSB0b29sLm1ha2VEdG8oeyB0ZXN0OiAxIH0sIHsgc2Vzc2lvbklkOiAncHJlLWFwcHJvdmVkJyB9KTtcblx0XHRcdGR0by5wcmVBcHByb3ZlZCA9IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNldHRpbmcsIGlkOiAnYXV0b0FwcHJvdmUnIH07XG5cblx0XHRcdC8vIFN0YXJ0IHRoZSBpbnZvY2F0aW9uIHdpdGhvdXQgYXdhaXRpbmcgc28gdGhlIHN0YXRlIGF0IHB1Ymxpc2ggdGltZSBpc1xuXHRcdFx0Ly8gb2JzZXJ2YWJsZTogYW4gYXV0by1hcHByb3ZlZCBjYWxsIG11c3QgYmUgcHVibGlzaGVkIGFscmVhZHkgZXhlY3V0aW5nXG5cdFx0XHQvLyBhbmQgbXVzdCBuZXZlciBzdXJmYWNlIGEgY29uZmlybWF0aW9uIHByb21wdCAod2hpY2ggd291bGQgZmxpY2tlclxuXHRcdFx0Ly8gXCJuZWVkcyBpbnB1dFwiIGluIHRoZSBzZXNzaW9ucyBsaXN0KS5cblx0XHRcdGNvbnN0IGludm9rZVByb21pc2UgPSBwcmVBcHByb3ZlZFNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXHRcdFx0Y29uc3QgcHVibGlzaGVkU3RhdGUgPSBpbnZvY2F0aW9uLnN0YXRlLmdldCgpLnR5cGU7XG5cblx0XHRcdC8vIElmIHRoZSBmaXggcmVncmVzc2VkLCB0aGUgY2FsbCB3b3VsZCBiZSBzdHVjayBhd2FpdGluZyBjb25maXJtYXRpb247XG5cdFx0XHQvLyBjb25maXJtIGl0IHNvIHRoZSBwcm9taXNlIHJlc29sdmVzIGFuZCB0aGUgYXNzZXJ0aW9uIGJlbG93IChyYXRoZXJcblx0XHRcdC8vIHRoYW4gYSB0ZXN0IHRpbWVvdXQpIHJlcG9ydHMgdGhlIGZhaWx1cmUuXG5cdFx0XHRpZiAocHVibGlzaGVkU3RhdGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChpbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlUHJvbWlzZTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGludm9rZUNvbXBsZXRlZCxcblx0XHRcdFx0XHR2YWx1ZTogKHJlc3VsdC5jb250ZW50WzBdIGFzIElUb29sUmVzdWx0VGV4dFBhcnQpLnZhbHVlLFxuXHRcdFx0XHRcdHB1Ymxpc2hlZFdhaXRpbmdGb3JDb25maXJtYXRpb246IHB1Ymxpc2hlZFN0YXRlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW52b2tlQ29tcGxldGVkOiB0cnVlLFxuXHRcdFx0XHRcdHZhbHVlOiAnc3VjY2VzcycsXG5cdFx0XHRcdFx0cHVibGlzaGVkV2FpdGluZ0ZvckNvbmZpcm1hdGlvbjogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHRvLnByZUFwcHJvdmVkIGRvZXMgbm90IG92ZXJyaWRlIGEgcHJlVG9vbFVzZSBob29rIHRoYXQgcmV0dXJuZWQgYXNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbCA9IHJlZ2lzdGVyVG9vbEZvclRlc3QocHJlQXBwcm92ZWRTZXJ2aWNlLCBzdG9yZSwgJ3ByZUFwcHJvdmVkQXNrVG9vbCcsIHtcblx0XHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnc3VjY2VzcycgfV0gfSksXG5cdFx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdFx0dGl0bGU6ICdDb25maXJtIHRoaXMgYWN0aW9uPycsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnVGhpcyB0b29sIHJlcXVpcmVzIGNvbmZpcm1hdGlvbicsXG5cdFx0XHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNhcHR1cmU6IHsgaW52b2NhdGlvbj86IENoYXRUb29sSW52b2NhdGlvbiB9ID0ge307XG5cdFx0XHRzdHViR2V0U2Vzc2lvbihwcmVBcHByb3ZlZENoYXRTZXJ2aWNlLCAncHJlLWFwcHJvdmVkLWFzaycsIHsgcmVxdWVzdElkOiAncmVxMScsIGNhcHR1cmUgfSk7XG5cblx0XHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IHRlc3Q6IDEgfSwgeyBzZXNzaW9uSWQ6ICdwcmUtYXBwcm92ZWQtYXNrJyB9KTtcblx0XHRcdGR0by5wcmVBcHByb3ZlZCA9IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNldHRpbmcsIGlkOiAnYXV0b0FwcHJvdmUnIH07XG5cdFx0XHRkdG8ucHJlVG9vbFVzZVJlc3VsdCA9IHsgcGVybWlzc2lvbkRlY2lzaW9uOiAnYXNrJywgcGVybWlzc2lvbkRlY2lzaW9uUmVhc29uOiAnUmVxdWlyZXMgdXNlciBjb25maXJtYXRpb24nIH07XG5cblx0XHRcdGNvbnN0IGludm9rZVByb21pc2UgPSBwcmVBcHByb3ZlZFNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IGF3YWl0IHdhaXRGb3JQdWJsaXNoZWRJbnZvY2F0aW9uKGNhcHR1cmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHQncHJlQXBwcm92ZWQgbXVzdCBub3Qgb3ZlcnJpZGUgYW4gZXhwbGljaXQgaG9vayBhc2snKTtcblxuXHRcdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChpbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHRcdFx0YXdhaXQgaW52b2tlUHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgaGVhZGxlc3MgY29uZmlybWFibGUgdG9vbCB3aXRoIGR0by5wcmVBcHByb3ZlZCBkb2VzIG5vdCBzaG93IGEgZGlhbG9nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IG5ldyBDb3VudGluZ0RpYWxvZ1NlcnZpY2UoeyBjb25maXJtZWQ6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHsgZGlhbG9nU2VydmljZSB9KTtcblx0XHRcdGxldCBpbnZva2VDb21wbGV0ZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHNldHVwLnNlcnZpY2UsIHN0b3JlLCAnaGVhZGxlc3NQcmVBcHByb3ZlZFRvb2wnLCB7XG5cdFx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGludm9rZUNvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3N1Y2Nlc3MnIH1dIH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByZXBhcmVUb29sSW52b2NhdGlvbjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdFx0dGl0bGU6ICdDb25maXJtIHRoaXMgYWN0aW9uPycsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnVGhpcyB0b29sIHdvdWxkIG5vcm1hbGx5IHJlcXVpcmUgY29uZmlybWF0aW9uJyxcblx0XHRcdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGR0byA9IHRvb2wubWFrZUR0byh7IHRlc3Q6IDEgfSk7XG5cdFx0XHRkdG8ucHJlQXBwcm92ZWQgPSB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5TZXR0aW5nLCBpZDogJ2F1dG9BcHByb3ZlJyB9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXR1cC5zZXJ2aWNlLmludm9rZVRvb2woZHRvLCBhc3luYyAoKSA9PiAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGludm9rZUNvbXBsZXRlZCxcblx0XHRcdFx0dmFsdWU6IChyZXN1bHQuY29udGVudFswXSBhcyBJVG9vbFJlc3VsdFRleHRQYXJ0KS52YWx1ZSxcblx0XHRcdFx0Y29uZmlybUNhbGxzOiBkaWFsb2dTZXJ2aWNlLmNvbmZpcm1DYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0aW52b2tlQ29tcGxldGVkOiB0cnVlLFxuXHRcdFx0XHR2YWx1ZTogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRjb25maXJtQ2FsbHM6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgaGVhZGxlc3MgcHJlVG9vbFVzZSBob29rIGFzayBvdmVycmlkZXMgZHRvLnByZUFwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IG5ldyBDb3VudGluZ0RpYWxvZ1NlcnZpY2UoeyBjb25maXJtZWQ6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBzZXR1cCA9IGNyZWF0ZVRlc3RUb29sc1NlcnZpY2Uoc3RvcmUsIHsgZGlhbG9nU2VydmljZSB9KTtcblx0XHRcdGNvbnN0IHRvb2wgPSByZWdpc3RlclRvb2xGb3JUZXN0KHNldHVwLnNlcnZpY2UsIHN0b3JlLCAnaGVhZGxlc3NQcmVBcHByb3ZlZEFza1Rvb2wnLCB7XG5cdFx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3N1Y2Nlc3MnIH1dIH0pLFxuXHRcdFx0XHRwcmVwYXJlVG9vbEludm9jYXRpb246IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0XHRcdHRpdGxlOiAnQ29uZmlybSB0aGlzIGFjdGlvbj8nLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogJ1RoaXMgdG9vbCByZXF1aXJlcyBjb25maXJtYXRpb24nLFxuXHRcdFx0XHRcdFx0YWxsb3dBdXRvQ29uZmlybTogdHJ1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZHRvID0gdG9vbC5tYWtlRHRvKHsgdGVzdDogMSB9KTtcblx0XHRcdGR0by5wcmVBcHByb3ZlZCA9IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNldHRpbmcsIGlkOiAnYXV0b0FwcHJvdmUnIH07XG5cdFx0XHRkdG8ucHJlVG9vbFVzZVJlc3VsdCA9IHsgcGVybWlzc2lvbkRlY2lzaW9uOiAnYXNrJywgcGVybWlzc2lvbkRlY2lzaW9uUmVhc29uOiAnUmVxdWlyZXMgdXNlciBjb25maXJtYXRpb24nIH07XG5cblx0XHRcdGF3YWl0IHNldHVwLnNlcnZpY2UuaW52b2tlVG9vbChkdG8sIGFzeW5jICgpID0+IDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlhbG9nU2VydmljZS5jb25maXJtQ2FsbHMsIDEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxtQkFBbUIsMkJBQTJCO0FBQ3ZELFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBc0Q7QUFDL0QsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0IsZ0JBQWdCLDBCQUEwQjtBQUN6RSxTQUE2QyxzQkFBc0I7QUFDbkUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQ0FBcUM7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QU8sVUFBVSxDQUFDLEVBQUU7QUFBQSxRQUNyRSx1QkFBdUIsYUFBYTtBQUFBLFVBQ25DLHNCQUFzQjtBQUFBLFlBQ3JCLE9BQU87QUFBQSxZQUNQLFNBQVM7QUFBQSxZQUNULGtCQUFrQjtBQUFBLFVBQ25CO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sTUFBTSxLQUFLLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQztBQUNwQyxVQUFJLGNBQWMsRUFBRSxNQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNyRSxVQUFJLG1CQUFtQixFQUFFLG9CQUFvQixPQUFPLDBCQUEwQiw2QkFBNkI7QUFFM0csWUFBTUEsT0FBTSxRQUFRLFdBQVcsS0FBSyxZQUFZLEdBQUcsa0JBQWtCLElBQUk7QUFFekUsYUFBTyxZQUFZLGNBQWMsY0FBYyxDQUFDO0FBQUEsSUFDakQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInNldHVwIiwgInNlcnZpY2UiLCAic3RvcmUiLCAiZHRvIl0KfQo=
