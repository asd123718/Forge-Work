import assert from "assert";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { ICommandService, CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IWorkbenchAssignmentService } from "../../../../services/assignment/common/assignmentService.js";
import { NullWorkbenchAssignmentService } from "../../../../services/assignment/test/common/nullAssignmentService.js";
import { IChatWidgetService } from "../../browser/chat.js";
import { ChatTipService, CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND, CREATE_AGENT_TRACKING_COMMAND, CREATE_PROMPT_TRACKING_COMMAND, CREATE_SKILL_TRACKING_COMMAND, FORK_CONVERSATION_TRACKING_COMMAND, TipEligibilityTracker } from "../../browser/chatTipService.js";
import { AgentInstructionFileType, IPromptsService, PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { URI } from "../../../../../base/common/uri.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { storeSelectedModel } from "../../common/chatSelectedModel.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { MockLanguageModelToolsService } from "../common/tools/mockLanguageModelToolsService.js";
import { ChatTipTier, TIP_CATALOG, extractCommandIds } from "../../browser/chatTipCatalog.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { TestChatEntitlementService } from "../../../../test/common/workbenchTestServices.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { MockChatService } from "../common/chatService/mockChatService.js";
import { CreateSlashCommandsUsageTracker } from "../../browser/createSlashCommandsUsageTracker.js";
import { ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart } from "../../common/requestParser/chatParserTypes.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { localChatSessionType } from "../../common/chatSessionsService.js";
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, GENERATE_PROMPT_COMMAND_ID } from "../../browser/actions/chatActions.js";
class MockContextKeyServiceWithRulesMatching extends MockContextKeyService {
  contextMatchesRules(rules) {
    return rules.evaluate({ getValue: (key) => this.getContextKeyValue(key) });
  }
}
class TrackingConfigurationService extends TestConfigurationService {
  updateValue(key, value, arg3) {
    this.lastUpdateKey = key;
    this.lastUpdateValue = value;
    this.lastUpdateTarget = arg3;
    return Promise.resolve(void 0);
  }
}
suite("ChatTipService", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let contextKeyService;
  let configurationService;
  let commandExecutedEmitter;
  let storageService;
  let mockInstructionFiles;
  let mockPromptInstructionFiles;
  let chatEntitlementService;
  let currentChatModes;
  let catalogCommandRegistrations;
  function registerCatalogCommands() {
    const registrations = /* @__PURE__ */ new Map();
    for (const tip of TIP_CATALOG) {
      const message = tip.buildMessage({
        keybindingService: { lookupKeybinding: () => void 0 },
        experimentalTipMessages: /* @__PURE__ */ new Map()
      }).value;
      for (const commandId of extractCommandIds(message)) {
        if (registrations.has(commandId) || CommandsRegistry.getCommand(commandId)) {
          continue;
        }
        const registration = CommandsRegistry.registerCommand(commandId, () => {
        });
        registrations.set(commandId, registration);
        testDisposables.add(registration);
      }
    }
    return registrations;
  }
  function createProductService(hasCopilot) {
    return {
      _serviceBrand: void 0,
      defaultChatAgent: hasCopilot ? { chatExtensionId: "github.copilot-chat" } : void 0
    };
  }
  function createService(hasCopilot = true, tipsEnabled = true) {
    instantiationService.stub(IProductService, createProductService(hasCopilot));
    configurationService.setUserConfiguration("chat.tips.enabled", tipsEnabled);
    return testDisposables.add(instantiationService.createInstance(ChatTipService));
  }
  function createMockTip(overrides) {
    const { message, ...rest } = overrides;
    return {
      tier: ChatTipTier.Qol,
      ...rest,
      buildMessage: () => new MarkdownString(message ?? "test")
    };
  }
  function createMockMode(overrides) {
    const { name = overrides.id, ...rest } = overrides;
    return {
      name: constObservable(name),
      label: constObservable(name),
      icon: constObservable(void 0),
      description: constObservable(void 0),
      isBuiltin: rest.isBuiltin ?? false,
      ...rest
    };
  }
  function createMockChatModes(builtin, custom) {
    return {
      onDidChange: Event.None,
      builtin,
      custom,
      findModeById: (id) => builtin.find((mode) => mode.id === id) ?? custom.find((mode) => mode.id === id),
      findModeByName: (name) => builtin.find((mode) => mode.name.get() === name) ?? custom.find((mode) => mode.name.get() === name),
      waitForPendingUpdates: async () => {
      }
    };
  }
  setup(() => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    contextKeyService = new MockContextKeyServiceWithRulesMatching();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 1);
    configurationService = new TestConfigurationService();
    commandExecutedEmitter = testDisposables.add(new Emitter());
    storageService = testDisposables.add(new InMemoryStorageService());
    mockInstructionFiles = [];
    mockPromptInstructionFiles = [];
    instantiationService.stub(IContextKeyService, contextKeyService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IStorageService, storageService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ICommandService, {
      onDidExecuteCommand: commandExecutedEmitter.event,
      onWillExecuteCommand: testDisposables.add(new Emitter()).event
    });
    instantiationService.stub(IPromptsService, {
      listAgentInstructions: async () => mockInstructionFiles,
      listPromptFiles: async () => mockPromptInstructionFiles,
      onDidChangeCustomAgents: Event.None
    });
    instantiationService.stub(ILanguageModelToolsService, testDisposables.add(new MockLanguageModelToolsService()));
    chatEntitlementService = new TestChatEntitlementService();
    chatEntitlementService.entitlement = ChatEntitlement.Available;
    instantiationService.stub(IChatEntitlementService, chatEntitlementService);
    instantiationService.stub(IChatService, new MockChatService());
    currentChatModes = createMockChatModes([], [createMockMode({ id: "plan", name: "Plan" })]);
    const widget = {
      scopedContextKeyService: contextKeyService,
      input: {
        currentChatModesObs: {
          get: () => currentChatModes
        }
      }
    };
    instantiationService.stub(IChatWidgetService, {
      _serviceBrand: void 0,
      lastFocusedWidget: void 0,
      onDidAddWidget: Event.None,
      onDidChangeWidgetVisibility: Event.None,
      onDidBackgroundSession: Event.None,
      onDidChangeFocusedWidget: Event.None,
      onDidChangeFocusedSession: Event.None,
      reveal: async () => true,
      revealWidget: async () => void 0,
      getAllWidgets: () => [widget],
      getWidgetByInputUri: () => void 0,
      getWidgetBySessionResource: () => void 0,
      getWidgetsByLocations: () => [],
      openSession: async () => void 0,
      register: () => Disposable.None
    });
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IKeybindingService, {
      lookupKeybinding: () => void 0
    });
    instantiationService.stub(IWorkbenchAssignmentService, new NullWorkbenchAssignmentService());
    catalogCommandRegistrations = registerCatalogCommands();
  });
  test("returns a welcome tip", () => {
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip, "Should return a welcome tip");
    assert.ok(tip.id.startsWith("tip."), "Tip should have a valid ID");
    assert.ok(tip.content.value.length > 0, "Tip should have content");
  });
  test("uses descriptive titles for tip command links", () => {
    for (const tip of TIP_CATALOG) {
      const markdown = tip.buildMessage({
        keybindingService: {
          lookupKeybinding: () => void 0
        },
        experimentalTipMessages: /* @__PURE__ */ new Map()
      }).value;
      const commandLinkRegex = /\[[^\]]+\]\((command:[^)]+)\)/g;
      let match;
      while ((match = commandLinkRegex.exec(markdown)) !== null) {
        assert.ok(/\s"[^"]+"$/.test(match[1]), `Expected command link in ${tip.id} to include a descriptive title: ${match[0]}`);
      }
    }
  });
  test("records # file reference usage for attach files tip eligibility", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    createService();
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-attach-file"),
      message: {
        text: "what does #file:README.md say",
        parts: [new ChatRequestDynamicVariablePart(
          new OffsetRange(10, 26),
          new Range(1, 11, 1, 27),
          "#file:README.md",
          "file",
          void 0,
          URI.file("/workspace/README.md"),
          void 0,
          void 0,
          true,
          false
        )]
      }
    });
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes("chat.tips.attachFiles.referenceUsed"));
  });
  test("records only matching create tip usage for submitted create command", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    createService();
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-create-prompt"),
      message: {
        text: "/create-prompt scaffold a reusable prompt",
        parts: []
      }
    });
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(CREATE_PROMPT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_SKILL_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(FORK_CONVERSATION_TRACKING_COMMAND));
  });
  test("records init tip usage for submitted /init command", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    createService();
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-init"),
      message: {
        text: "/init",
        parts: []
      }
    });
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_PROMPT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_SKILL_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(FORK_CONVERSATION_TRACKING_COMMAND));
  });
  test("hides shown slash tip after submitted slash command without clicking tip link", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    let tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    for (let i = 0; i < TIP_CATALOG.length && tip?.id !== "tip.init"; i++) {
      tip = service.navigateToNextTip();
    }
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.init", "Expected to navigate to the init tip before submitting /init");
    let didHide = false;
    testDisposables.add(service.onDidHideTip(() => didHide = true));
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-advance-init"),
      message: {
        text: "/init",
        parts: []
      }
    });
    assert.ok(didHide, "Expected slash tip to hide after submitting /init");
    assert.notStrictEqual(service.getWelcomeTip(contextKeyService)?.id, "tip.init", "Expected init tip to stay excluded after slash usage");
  });
  test("removes slash tip from rotation after submitted slash command via eligibility tracking", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    let tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    for (let i = 0; i < TIP_CATALOG.length && tip?.id !== "tip.init"; i++) {
      tip = service.navigateToNextTip();
    }
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.init");
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-rotate-init"),
      message: {
        text: "/init",
        parts: []
      }
    });
    for (let i = 0; i < TIP_CATALOG.length; i++) {
      tip = service.navigateToNextTip();
      if (!tip) {
        break;
      }
      assert.notStrictEqual(tip.id, "tip.init", "Expected init tip to be removed from tip rotation");
    }
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND), "Expected slash usage to be tracked in executed command exclusions");
  });
  test("removes slash tip from rotation when slash usage is recorded before input transformation", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    let tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    for (let i = 0; i < TIP_CATALOG.length && tip?.id !== "tip.init"; i++) {
      tip = service.navigateToNextTip();
    }
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.init");
    service.recordSlashCommandUsage("init");
    for (let i = 0; i < TIP_CATALOG.length; i++) {
      tip = service.navigateToNextTip();
      if (!tip) {
        break;
      }
      assert.notStrictEqual(tip.id, "tip.init", "Expected init tip to be removed from tip rotation");
    }
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND), "Expected slash usage to be tracked in executed command exclusions");
  });
  test("records fork tip usage for submitted /fork command", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    createService();
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-fork"),
      message: {
        text: "/fork",
        parts: []
      }
    });
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(FORK_CONVERSATION_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_PROMPT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_SKILL_TRACKING_COMMAND));
  });
  test("returns Auto switch tip when current model is gpt-4.1", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "gpt-4.1");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.switchToAuto");
    assert.ok(tip.content.value.includes("GPT-4.1"));
  });
  test("does not return Auto switch tip when current model is not gpt-4.1", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.notStrictEqual(tip.id, "tip.switchToAuto");
  });
  test("does not return Auto switch tip when current model context key is empty and no fallback is available", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.notStrictEqual(tip.id, "tip.switchToAuto");
  });
  test("returns Auto switch tip when current model is persisted and context key is empty", () => {
    storeSelectedModel(storageService, ChatAgentLocation.Chat, void 0, "copilot/gpt-4.1-2025-04-14");
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.switchToAuto");
  });
  test("returns Auto switch tip when current model is versioned gpt-4.1", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "gpt-4.1-2025-04-14");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.switchToAuto");
  });
  test("switching models advances away from gpt-4.1 tip", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "gpt-4.1");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    assert.strictEqual(firstTip.id, "tip.switchToAuto");
    const switchedContextKeyService = new MockContextKeyServiceWithRulesMatching();
    switchedContextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 1);
    switchedContextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const nextTip = service.getWelcomeTip(switchedContextKeyService);
    assert.ok(nextTip);
    assert.notStrictEqual(nextTip.id, "tip.switchToAuto");
  });
  test("returns same welcome tip on rerender", () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1);
    const tip2 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip2);
    assert.strictEqual(tip1.id, tip2.id, "Should return same tip for stable rerender");
    assert.strictEqual(tip1.content.value, tip2.content.value);
  });
  test("returns undefined when Copilot is not enabled", () => {
    const service = createService(
      /* hasCopilot */
      false
    );
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when Copilot is not enabled");
  });
  test("returns undefined when user is signed out", () => {
    chatEntitlementService.entitlement = ChatEntitlement.Unknown;
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when the user is signed out");
  });
  test("returns undefined when tips setting is disabled", () => {
    const service = createService(
      /* hasCopilot */
      true,
      /* tipsEnabled */
      false
    );
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when tips setting is disabled");
  });
  test("returns undefined when location is terminal", () => {
    const service = createService();
    const terminalContextKeyService = new MockContextKeyServiceWithRulesMatching();
    terminalContextKeyService.createKey(ChatContextKeys.location.key, ChatAgentLocation.Terminal);
    const tip = service.getWelcomeTip(terminalContextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip in terminal inline chat");
  });
  test("returns undefined when location is editor inline", () => {
    const service = createService();
    const editorContextKeyService = new MockContextKeyServiceWithRulesMatching();
    editorContextKeyService.createKey(ChatContextKeys.location.key, ChatAgentLocation.EditorInline);
    const tip = service.getWelcomeTip(editorContextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip in editor inline chat");
  });
  test("returns a tip when foreground session count is exactly one", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 1);
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip, "Should return a tip when exactly one foreground chat session is visible");
  });
  test("returns undefined when foreground session count is zero", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 0);
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when no foreground chat sessions are visible");
  });
  test("returns a tip for the Agents new-session composer when foreground session count is zero", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 0);
    contextKeyService.createKey(IsSessionsWindowContext.key, true);
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip, "Should return a tip for the Agents new-session composer");
  });
  test("returns undefined when foreground session count is greater than one", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 2);
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when multiple foreground chat sessions are visible");
  });
  test("dismissTip excludes the dismissed tip and allows a new one", () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1);
    service.dismissTip();
    const tip2 = service.getWelcomeTip(contextKeyService);
    if (tip2) {
      assert.notStrictEqual(tip1.id, tip2.id, "Dismissed tip should not be shown again");
    }
  });
  test("dismissTip keeps navigation context for next tip traversal", () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1);
    service.dismissTip();
    const tip2 = service.navigateToNextTip();
    if (tip2) {
      assert.notStrictEqual(tip1.id, tip2.id, "Dismissed tip should not be returned by next navigation");
    }
  });
  test("dismissTipForSession hides tips until resetSession", () => {
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    service.dismissTipForSession();
    assert.strictEqual(service.getWelcomeTip(contextKeyService), void 0, "Tips should stay hidden for the current session after dismissing");
    service.resetSession();
    assert.ok(service.getWelcomeTip(contextKeyService), "Tips should reappear after resetting the session");
  });
  test("navigateToNextTip keeps foundational tips before QoL tips", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    assert.strictEqual(firstTip.id, "tip.planMode");
    const secondTip = service.navigateToNextTip();
    assert.ok(secondTip);
    assert.strictEqual(secondTip.id, "tip.createAgent", "Expected next tip to remain in foundational tips before QoL tips");
  });
  test("navigateToPreviousTip follows reverse of preferred order", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    assert.strictEqual(firstTip.id, "tip.planMode");
    const secondTip = service.navigateToNextTip();
    assert.ok(secondTip);
    assert.strictEqual(secondTip.id, "tip.createAgent");
    const previousTip = service.navigateToPreviousTip();
    assert.ok(previousTip);
    assert.strictEqual(previousTip.id, "tip.planMode", "Expected previous tip to reverse the preferred ordering");
  });
  test("excludes a tip whose command is not registered", () => {
    catalogCommandRegistrations.get("workbench.action.chat.open").dispose();
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    assertTipNeverShown(service, "tip.planMode");
  });
  test("getNextEligibleTip returns next tip even when only one remains", async () => {
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1, "Should have an initial tip");
    const tip2 = service.navigateToNextTip();
    assert.ok(tip2, "Should have a second tip");
    assert.notStrictEqual(tip1.id, tip2.id, "Second tip should be different");
    const dismissedIds = /* @__PURE__ */ new Set();
    dismissedIds.add(tip2.id);
    service.dismissTip();
    let nextTip = service.getNextEligibleTip();
    while (nextTip && !dismissedIds.has(nextTip.id)) {
      if (nextTip.id === tip1.id) {
        break;
      }
      dismissedIds.add(nextTip.id);
      service.dismissTip();
      nextTip = service.getNextEligibleTip();
    }
    assert.ok(nextTip, "getNextEligibleTip should return the last remaining eligible tip");
  });
  test("getNextEligibleTip returns undefined when all tips are dismissed", async () => {
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      service.dismissTip();
    }
    const nextTip = service.getNextEligibleTip();
    assert.strictEqual(nextTip, void 0, "getNextEligibleTip should return undefined when all tips are dismissed");
  });
  test("getNextEligibleTip keeps preferred onboarding order after dismissing plan tip", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    assert.strictEqual(firstTip.id, "tip.planMode");
    service.dismissTip();
    const secondTip = service.getNextEligibleTip();
    assert.ok(secondTip);
    assert.strictEqual(secondTip.id, "tip.createAgent", "Expected next tip to follow preferred onboarding order before QoL tips");
  });
  test("getNextEligibleTip picks next relative to current tip after dismissing from middle of order", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    const secondTip = service.navigateToNextTip();
    assert.ok(secondTip);
    const expectedNextAfterSecond = service.navigateToNextTip();
    assert.ok(expectedNextAfterSecond, "Expected at least three tips to validate relative ordering");
    const backToSecond = service.navigateToPreviousTip();
    assert.ok(backToSecond);
    assert.strictEqual(backToSecond.id, secondTip.id);
    service.dismissTip();
    const actualNext = service.getNextEligibleTip();
    assert.ok(actualNext);
    assert.strictEqual(actualNext.id, expectedNextAfterSecond.id, "Expected getNextEligibleTip to advance relative to current tip rather than restart from top priority tip");
  });
  test("dismissTip fires onDidDismissTip event", () => {
    const service = createService();
    service.getWelcomeTip(contextKeyService);
    let fired = false;
    testDisposables.add(service.onDidDismissTip(() => {
      fired = true;
    }));
    service.dismissTip();
    assert.ok(fired, "onDidDismissTip should fire");
  });
  test("disableTips fires onDidDisableTips event", async () => {
    const service = createService();
    service.getWelcomeTip(contextKeyService);
    let fired = false;
    testDisposables.add(service.onDidDisableTips(() => {
      fired = true;
    }));
    await service.disableTips();
    assert.ok(fired, "onDidDisableTips should fire");
  });
  test("disableTips writes to application settings target", async () => {
    const trackingConfigurationService = new TrackingConfigurationService();
    configurationService = trackingConfigurationService;
    instantiationService.stub(IConfigurationService, configurationService);
    const service = createService();
    await service.disableTips();
    assert.strictEqual(trackingConfigurationService.lastUpdateKey, "chat.tips.enabled");
    assert.strictEqual(trackingConfigurationService.lastUpdateValue, false);
    assert.strictEqual(trackingConfigurationService.lastUpdateTarget, ConfigurationTarget.APPLICATION);
  });
  test("disableTips resets state so re-enabling works", async () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1);
    await service.disableTips();
    configurationService.setUserConfiguration("chat.tips.enabled", true);
    const tip2 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip2, "Should return a tip after disabling and re-enabling");
  });
  test("dismissed tips stay dismissed after disabling and re-enabling tips", async () => {
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      service.dismissTip();
    }
    assert.strictEqual(service.getWelcomeTip(contextKeyService), void 0, "No tip should remain once all tips are dismissed");
    await service.disableTips();
    configurationService.setUserConfiguration("chat.tips.enabled", true);
    assert.strictEqual(service.getWelcomeTip(contextKeyService), void 0, "Dismissed tips should remain dismissed after re-enabling tips");
  });
  test("clearDismissedTips restores tip visibility", () => {
    const service = createService();
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      service.dismissTip();
    }
    assert.strictEqual(service.getWelcomeTip(contextKeyService), void 0, "No tip should remain once all tips are dismissed");
    service.clearDismissedTips();
    assert.ok(service.getWelcomeTip(contextKeyService), "A tip should be visible again after clearing dismissed tips");
  });
  test("migrates dismissed tips from profile to application storage", () => {
    storageService.store("chat.tip.dismissed", JSON.stringify(["tip.switchToAuto"]), StorageScope.PROFILE, StorageTarget.MACHINE);
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "gpt-4.1");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.notStrictEqual(tip.id, "tip.switchToAuto", "Should honor profile-stored dismissed tip id");
    assert.ok(storageService.get("chat.tip.dismissed", StorageScope.APPLICATION), "Expected dismissed tips to migrate to application storage");
  });
  test("tip.undoChanges describes where to find restore checkpoint", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const tip = findTipById(service, "tip.undoChanges");
    assert.ok(tip);
    assert.ok(tip.content.value.includes("Hover a previous request"));
    assert.ok(tip.content.value.includes("Restore Checkpoint"));
  });
  test("tip.mermaid uses sentence punctuation in display text", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const tip = findTipById(service, "tip.mermaid");
    assert.ok(tip);
    assert.ok(tip.content.value.includes("flow chart. It can render Mermaid diagrams directly in chat."));
    assert.ok(!tip.content.value.includes("flow chart; it can render Mermaid diagrams directly in chat."));
  });
  function createMockPromptsService(agentInstructions = [], promptInstructions = [], options) {
    return {
      listAgentInstructions: async () => agentInstructions,
      listPromptFiles: options?.listPromptFiles ?? (async (_type) => promptInstructions),
      onDidChangeCustomAgents: options?.onDidChangeCustomAgents ?? Event.None
    };
  }
  function createMockToolsService() {
    return testDisposables.add(new MockLanguageModelToolsService());
  }
  test("excludes tip.undoChanges when restore checkpoint command has been executed", () => {
    const tip = createMockTip({
      id: "tip.undoChanges",
      excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint"]
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before command is executed");
    commandExecutedEmitter.fire({ commandId: "workbench.action.chat.restoreCheckpoint", args: [] });
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after command is executed");
  });
  test("persists executed command exclusions in application storage", () => {
    const tip = createMockTip({
      id: "tip.undoChanges",
      excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint"]
    });
    testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    commandExecutedEmitter.fire({ commandId: "workbench.action.chat.restoreCheckpoint", args: [] });
    assert.ok(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION), "Expected executed command exclusions in application storage");
    assert.strictEqual(storageService.get("chat.tips.executedCommands", StorageScope.PROFILE), void 0, "Did not expect executed command exclusions in profile storage");
    assert.strictEqual(storageService.get("chat.tips.executedCommands", StorageScope.WORKSPACE), void 0, "Did not expect executed command exclusions in workspace storage");
  });
  test("migrates executed command exclusions from profile to application storage", () => {
    const tip = createMockTip({
      id: "tip.undoChanges",
      excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint"]
    });
    storageService.store("chat.tips.executedCommands", JSON.stringify(["workbench.action.chat.restoreCheckpoint"]), StorageScope.PROFILE, StorageTarget.MACHINE);
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should honor profile-stored exclusions");
    assert.ok(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION), "Expected migrated exclusion data in application storage");
  });
  test("excludes tip.customInstructions when copilot-instructions.md exists in workspace", async () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([{ uri: { path: "/.github/copilot-instructions.md" }, realPath: void 0, type: AgentInstructionFileType.copilotInstructionsMd }]),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded when copilot-instructions.md exists");
  });
  test("does not exclude tip.customInstructions when only AGENTS.md exists", async () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([{ uri: { path: "/AGENTS.md" }, realPath: void 0, type: AgentInstructionFileType.agentsMd }]),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded when only AGENTS.md exists");
  });
  test("excludes tip.customInstructions when .instructions.md files exist in workspace", async () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([], [{ uri: URI.file("/.github/instructions/coding.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions }]),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded when .instructions.md files exist");
  });
  test("does not exclude tip.customInstructions when no instruction files exist", async () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded when no instruction files exist");
  });
  test("excludes tip.customInstructions when generate instructions command has been executed", () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenCommandsExecuted: [GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID]
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before command is executed");
    commandExecutedEmitter.fire({ commandId: GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, args: [] });
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after generate instructions command is executed");
  });
  test("excludes tip.agentMode when agent mode has been used in workspace", () => {
    const tip = createMockTip({
      id: "tip.agentMode",
      excludeWhenModesUsed: [ChatModeKind.Agent]
    });
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before mode is recorded");
    tracker.recordCurrentMode(contextKeyService);
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after agent mode has been recorded");
  });
  test("excludes tip.planMode when Plan mode has been used in workspace", () => {
    const tip = createMockTip({
      id: "tip.planMode",
      excludeWhenModesUsed: ["Plan"]
    });
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Plan");
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before mode is recorded");
    tracker.recordCurrentMode(contextKeyService);
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after Plan mode has been recorded");
  });
  test("excludes tip.planMode when open plan command has been executed", () => {
    const tip = createMockTip({
      id: "tip.planMode",
      excludeWhenCommandsExecuted: ["workbench.action.chat.openPlan"]
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before command is executed");
    commandExecutedEmitter.fire({ commandId: "workbench.action.chat.openPlan", args: [] });
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after open plan command is executed");
  });
  test("persists command exclusions to workspace storage across tracker instances", () => {
    const tip = createMockTip({
      id: "tip.undoChanges",
      excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint"]
    });
    const tracker1 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    commandExecutedEmitter.fire({ commandId: "workbench.action.chat.restoreCheckpoint", args: [] });
    assert.strictEqual(tracker1.isExcluded(tip), true);
    const tracker2 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker2.isExcluded(tip), true, "New tracker should read persisted exclusion from workspace storage");
  });
  test("persists mode exclusions to workspace storage across tracker instances", () => {
    const tip = createMockTip({
      id: "tip.agentMode",
      excludeWhenModesUsed: [ChatModeKind.Agent]
    });
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    const tracker1 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    tracker1.recordCurrentMode(contextKeyService);
    assert.strictEqual(tracker1.isExcluded(tip), true);
    const tracker2 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker2.isExcluded(tip), true, "New tracker should read persisted mode exclusion from workspace storage");
  });
  test("prioritizes foundational tips over QoL tips when both are eligible", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.planMode", "Expected foundational tip to be prioritized before eligible QoL tips");
  });
  test("excludes tip.planMode when Plan mode is not available in the current widget", () => {
    currentChatModes = createMockChatModes([], []);
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    assertTipNeverShown(service, "tip.planMode");
  });
  test("tip.planMode uses the stable open chat command", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    const tip = findTipById(service, "tip.planMode");
    assert.ok(tip);
    assert.ok(tip.enabledCommands?.includes("workbench.action.chat.open"));
    assert.ok(!tip.enabledCommands?.includes("workbench.action.chat.openPlan"));
  });
  test("prioritizes preferred onboarding tips in requested order", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const seen = [];
    for (let i = 0; i < 3; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      assert.ok(tip);
      seen.push(tip.id);
      service.dismissTip();
    }
    assert.deepStrictEqual(seen, ["tip.planMode", "tip.createAgent", "tip.createSkill"]);
  });
  test("randomizes QoL tips when no foundational tips are eligible", () => {
    const service = createService();
    const modeKindKey = contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const modeNameKey = contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Plan");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, "cloud");
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const originalRandom = Math.random;
    try {
      Math.random = () => 0;
      const firstTip = service.getWelcomeTip(contextKeyService);
      service.resetSession();
      Math.random = () => 0.9999;
      const secondTip = service.getWelcomeTip(contextKeyService);
      assert.ok(firstTip);
      assert.ok(secondTip);
      assert.notStrictEqual(firstTip.id, secondTip.id, "Expected different QoL tips for different random values");
      assert.notStrictEqual(firstTip.id, "tip.planMode");
      assert.notStrictEqual(secondTip.id, "tip.planMode");
    } finally {
      Math.random = originalRandom;
      modeKindKey.set(ChatModeKind.Agent);
      modeNameKey.set("Plan");
    }
  });
  test("resetSession reevaluates foundational tips for the next chat session", () => {
    const service = createService();
    const modeKindKey = contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const modeNameKey = contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Plan");
    const sessionTypeKey = contextKeyService.createKey(ChatContextKeys.chatSessionType.key, "cloud");
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const originalRandom = Math.random;
    try {
      Math.random = () => 0.9999;
      const qolTip = service.getWelcomeTip(contextKeyService);
      assert.ok(qolTip);
      assert.notStrictEqual(qolTip.id, "tip.planMode");
      service.resetSession();
      modeNameKey.set("Agent");
      sessionTypeKey.set(localChatSessionType);
      const foundationalTip = service.getWelcomeTip(contextKeyService);
      assert.ok(foundationalTip);
      assert.strictEqual(foundationalTip.id, "tip.createAgent", "Expected foundational ordering to restart on new chat session");
    } finally {
      Math.random = originalRandom;
      modeKindKey.set(ChatModeKind.Agent);
    }
  });
  test("resetSession allows a new welcome tip", () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1, "Should get a welcome tip");
    service.resetSession();
    const tip2 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip2, "Should get a welcome tip after resetSession");
  });
  test("Plan tip is excluded after switching to Plan mode during stable rerender", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const modeNameKey = contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    assert.ok(findTipById(service, "tip.planMode"), "Plan tip should be shown when in Agent mode");
    modeNameKey.set("Plan");
    const rerenderTip = service.getWelcomeTip(contextKeyService);
    assert.ok(!rerenderTip || rerenderTip.id !== "tip.planMode", "Plan tip should not be shown after switching to Plan mode");
    service.resetSession();
    modeNameKey.set("Agent");
    assertTipNeverShown(service, "tip.planMode");
  });
  test("excludes tip when tracked tool has been invoked", () => {
    const mockToolsService = createMockToolsService();
    const tip = createMockTip({
      id: "tip.mermaid",
      excludeWhenToolsInvoked: ["renderMermaidDiagram"]
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      mockToolsService,
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before tool is invoked");
    mockToolsService.fireOnDidInvokeTool({ toolId: "renderMermaidDiagram", sessionResource: void 0, requestId: void 0, subagentInvocationId: void 0 });
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after tool is invoked");
  });
  test("persists tool exclusions to workspace storage across tracker instances", () => {
    const mockToolsService = createMockToolsService();
    const tip = createMockTip({
      id: "tip.subagents",
      excludeWhenToolsInvoked: ["runSubagent"]
    });
    const tracker1 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      mockToolsService,
      new NullLogService()
    ));
    mockToolsService.fireOnDidInvokeTool({ toolId: "runSubagent", sessionResource: void 0, requestId: void 0, subagentInvocationId: void 0 });
    assert.strictEqual(tracker1.isExcluded(tip), true);
    const tracker2 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker2.isExcluded(tip), true, "New tracker should read persisted tool exclusion from workspace storage");
  });
  test("excludes tip.skill when skill files exist in workspace", async () => {
    const tip = createMockTip({
      id: "tip.skill",
      excludeWhenPromptFilesExist: { promptType: PromptsType.skill }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([], [{ uri: URI.file("/.github/skills/my-skill.skill.md"), storage: PromptsStorage.local, type: PromptsType.skill }]),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded when skill files exist");
  });
  test("does not exclude tip.skill when no skill files exist", async () => {
    const tip = createMockTip({
      id: "tip.skill",
      excludeWhenPromptFilesExist: { promptType: PromptsType.skill }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded when no skill files exist");
  });
  test("shows all create slash command tips in local chat sessions", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    const expectedCreateTips = /* @__PURE__ */ new Set(["tip.init", "tip.createPrompt", "tip.createAgent", "tip.createSkill"]);
    const seenCreateTips = /* @__PURE__ */ new Set();
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      if (expectedCreateTips.has(tip.id)) {
        seenCreateTips.add(tip.id);
        if (seenCreateTips.size === expectedCreateTips.size) {
          break;
        }
      }
      service.dismissTip();
    }
    assert.deepStrictEqual([...seenCreateTips].sort(), [...expectedCreateTips].sort());
  });
  test("does not show create slash command tips in non-local chat sessions", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, "cloud");
    const createTipIds = /* @__PURE__ */ new Set(["tip.init", "tip.createPrompt", "tip.createAgent", "tip.createSkill"]);
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      assert.ok(!createTipIds.has(tip.id), "Should not show create slash command tips in non-local sessions");
      service.dismissTip();
    }
  });
  test("does not show create prompt tip when create prompt was already used", () => {
    storageService.store("chat.tips.executedCommands", JSON.stringify([CREATE_PROMPT_TRACKING_COMMAND]), StorageScope.APPLICATION, StorageTarget.MACHINE);
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      assert.notStrictEqual(tip.id, "tip.createPrompt", "Should not show tip.createPrompt when create-prompt was used");
      service.dismissTip();
    }
  });
  function findTipById(service, tipId, ckService = contextKeyService) {
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(ckService);
      if (!tip) {
        return void 0;
      }
      if (tip.id === tipId) {
        return tip;
      }
      service.dismissTip();
    }
    return void 0;
  }
  function assertTipNeverShown(service, tipId, ckService = contextKeyService) {
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(ckService);
      if (!tip) {
        break;
      }
      assert.notStrictEqual(tip.id, tipId, `${tipId} should not be shown`);
      service.dismissTip();
    }
  }
  for (const { tipId, settingKey } of [
    { tipId: "tip.thinkingPhrases", settingKey: "chat.agent.thinking.phrases" }
  ]) {
    test(`shows ${tipId} with correct setting link when setting is at default`, async () => {
      const service = createService();
      contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
      await new Promise((r) => queueMicrotask(r));
      const tip = findTipById(service, tipId);
      assert.ok(tip, `Should show ${tipId} when setting is at default`);
      assert.ok(tip.content.value.includes(settingKey), `Tip should reference ${settingKey}`);
      assert.ok(tip.enabledCommands?.includes("workbench.action.openSettings"), "Tip should enable the openSettings command");
    });
    test(`excludes ${tipId} when setting has been changed from default`, async () => {
      configurationService.setUserConfiguration(settingKey, "changed");
      const service = createService();
      contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
      await new Promise((r) => queueMicrotask(r));
      assertTipNeverShown(service, tipId);
    });
  }
  for (const tipId of [
    "tip.thinkingPhrases"
  ]) {
    test(`dismisses ${tipId} after clicking its settings link`, async () => {
      const service = createService();
      contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
      await new Promise((r) => queueMicrotask(r));
      const tip = findTipById(service, tipId);
      assert.ok(tip, `Should show ${tipId} before command click`);
      let dismissed = false;
      testDisposables.add(service.onDidDismissTip(() => {
        dismissed = true;
      }));
      commandExecutedEmitter.fire({ commandId: "workbench.action.openSettings", args: [] });
      assert.strictEqual(dismissed, true, `${tipId} should dismiss when its settings command is clicked`);
      assert.notStrictEqual(service.getWelcomeTip(contextKeyService)?.id, tipId, `${tipId} should not be shown again after actioning its command link`);
      const nextService = createService();
      assertTipNeverShown(nextService, tipId);
    });
  }
  for (const tipId of [
    "tip.autoAcceptDelay",
    "tip.codeActions"
  ]) {
    test(`excludes ${tipId} in the Agents window`, async () => {
      const service = createService();
      contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
      contextKeyService.createKey(IsSessionsWindowContext.key, true);
      await new Promise((r) => queueMicrotask(r));
      assertTipNeverShown(service, tipId);
    });
    test(`shows ${tipId} outside the Agents window`, async () => {
      const service = createService();
      contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
      contextKeyService.createKey(IsSessionsWindowContext.key, false);
      await new Promise((r) => queueMicrotask(r));
      const tip = findTipById(service, tipId);
      assert.ok(tip, `Should show ${tipId} outside the Agents window`);
    });
  }
  test("dismisses createPrompt tip after clicking its command link", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    const tip = findTipById(service, "tip.createPrompt");
    assert.ok(tip, "Should show tip.createPrompt before command click");
    assert.ok(tip.enabledCommands?.includes(GENERATE_PROMPT_COMMAND_ID), "Tip should enable the create prompt command");
    commandExecutedEmitter.fire({ commandId: GENERATE_PROMPT_COMMAND_ID, args: [] });
    assert.notStrictEqual(service.getWelcomeTip(contextKeyService)?.id, "tip.createPrompt", "tip.createPrompt should not be shown again after actioning its command link");
    const nextService = createService();
    assertTipNeverShown(nextService, "tip.createPrompt");
  });
  test("logs telemetry when tip is shown", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    const shownEvents = events.filter((e) => e.data.action === "shown");
    assert.strictEqual(shownEvents.length, 1, "Should log exactly one shown event");
    assert.strictEqual(shownEvents[0].eventName, "chatTip");
    assert.strictEqual(shownEvents[0].data.tipId, tip.id);
  });
  test("logs telemetry when tip is dismissed", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    service.dismissTip();
    const dismissEvents = events.filter((e) => e.data.action === "dismissed");
    assert.strictEqual(dismissEvents.length, 1, "Should log exactly one dismissed event");
    assert.strictEqual(dismissEvents[0].data.tipId, tip.id);
  });
  test("logs telemetry when navigating tips", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    const nextTip = service.navigateToNextTip();
    assert.ok(nextTip);
    const navigateEvents = events.filter((e) => e.data.action === "navigateNext");
    assert.strictEqual(navigateEvents.length, 1, "Should log one navigateNext event");
    assert.strictEqual(navigateEvents[0].data.tipId, tip.id, "navigateNext should log the tip being navigated away from");
    const shownEvents = events.filter((e) => e.data.action === "shown");
    assert.strictEqual(shownEvents.length, 2, "Should log shown for initial and navigated tip");
    assert.strictEqual(shownEvents[1].data.tipId, nextTip.id);
  });
  test("logs telemetry when tip command is clicked", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    if (tip.enabledCommands?.length) {
      commandExecutedEmitter.fire({ commandId: tip.enabledCommands[0], args: [] });
      const clickEvents = events.filter((e) => e.data.action === "commandClicked");
      assert.strictEqual(clickEvents.length, 1, "Should log one commandClicked event");
      assert.strictEqual(clickEvents[0].data.tipId, tip.id);
      assert.strictEqual(clickEvents[0].data.commandId, tip.enabledCommands[0]);
    } else {
      assert.fail("Tip has no enabled commands; cannot test command click telemetry");
    }
  });
  test("logs telemetry when tip is hidden", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    service.hideTip();
    const hiddenEvents = events.filter((e) => e.data.action === "hidden");
    assert.strictEqual(hiddenEvents.length, 1, "Should log one hidden event");
    assert.strictEqual(hiddenEvents[0].data.tipId, tip.id);
  });
  test("logs telemetry when tips are disabled", async () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    await service.disableTips();
    const disabledEvents = events.filter((e) => e.data.action === "disabled");
    assert.strictEqual(disabledEvents.length, 1, "Should log one disabled event");
    assert.strictEqual(disabledEvents[0].data.tipId, tip.id);
  });
  test("thinking phrases ever-modified seed checks workspaceValue", () => {
    const workspaceConfigService = new TestConfigurationService();
    const originalInspect = workspaceConfigService.inspect.bind(workspaceConfigService);
    workspaceConfigService.inspect = (key, overrides) => {
      if (key === "chat.agent.thinking.phrases") {
        return { ...originalInspect(key, overrides), userValue: void 0, userLocalValue: void 0, workspaceValue: "compact" };
      }
      return originalInspect(key, overrides);
    };
    configurationService = workspaceConfigService;
    instantiationService.stub(IConfigurationService, configurationService);
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    assertTipNeverShown(service, "tip.thinkingPhrases");
  });
  test("does not show tip.thinkingPhrases when previous modification is persisted", () => {
    storageService.store("chat.tip.thinkingPhrasesEverModified", true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    assertTipNeverShown(service, "tip.thinkingPhrases");
  });
  test("re-checks agent file exclusion when onDidChangeCustomAgents fires", async () => {
    const agentChangeEmitter = testDisposables.add(new Emitter());
    let agentFiles = [];
    const tip = createMockTip({
      id: "tip.customAgent",
      excludeWhenPromptFilesExist: { promptType: PromptsType.agent, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([], [], {
        onDidChangeCustomAgents: agentChangeEmitter.event,
        listPromptFiles: async () => agentFiles
      }),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded after initial check finds no files");
    agentFiles = [{ uri: URI.file("/.github/agents/my-agent.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent }];
    agentChangeEmitter.fire();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after onDidChangeCustomAgents fires and agent files exist");
  });
  test("refreshPromptFileExclusions re-checks instruction files after startup", async () => {
    let instructionFiles = [];
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([], [], {
        listPromptFiles: async () => instructionFiles
      }),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded after initial check finds no files");
    instructionFiles = [{ uri: URI.file("/.github/instructions/coding.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions }];
    tracker.refreshPromptFileExclusions();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after refresh finds instruction files");
  });
  test("does not throw when submitted while stored context key service has been disposed", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    const originalContextMatchesRules = contextKeyService.contextMatchesRules.bind(contextKeyService);
    contextKeyService.contextMatchesRules = () => {
      throw new Error("AbstractContextKeyService has been disposed");
    };
    try {
      assert.doesNotThrow(() => submitRequestEmitter.fire({
        chatSessionResource: URI.parse("chat:session-disposed"),
        message: { text: "hello", parts: [] }
      }));
    } finally {
      contextKeyService.contextMatchesRules = originalContextMatchesRules;
    }
  });
});
suite("CreateSlashCommandsUsageTracker", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let storageService;
  let contextKeyService;
  let submitRequestEmitter;
  let sessions;
  setup(() => {
    storageService = testDisposables.add(new InMemoryStorageService());
    contextKeyService = new MockContextKeyService();
    submitRequestEmitter = testDisposables.add(new Emitter());
    sessions = /* @__PURE__ */ new Map();
  });
  function createMockChatServiceForTracker() {
    return {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: (resource) => sessions.get(resource.toString())
    };
  }
  function createTracker(chatService) {
    return testDisposables.add(new CreateSlashCommandsUsageTracker(
      chatService ?? createMockChatServiceForTracker(),
      storageService,
      () => contextKeyService
    ));
  }
  test("syncContextKey sets context key to false when storage is empty", () => {
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
    assert.strictEqual(value, false, "Context key should be false when no create commands have been used");
  });
  test("syncContextKey sets context key to true when storage has recorded usage", () => {
    storageService.store("chat.tips.usedCreateSlashCommands", true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
    assert.strictEqual(value, true, "Context key should be true when create commands have been used");
  });
  test("detects create-instructions slash command via text fallback", () => {
    const sessionResource = URI.parse("chat:session1");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: {
          text: "/create-instructions test",
          parts: []
        }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
    assert.strictEqual(value, true, "Context key should be true after /create-instructions is used");
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      true,
      "Storage should persist the create slash command usage"
    );
  });
  test("detects create-prompt slash command via text fallback", () => {
    const sessionResource = URI.parse("chat:session2");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: {
          text: "/create-prompt my-prompt",
          parts: []
        }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      true,
      "Storage should persist the create-prompt usage"
    );
  });
  test("detects create-agent slash command via parsed part", () => {
    const sessionResource = URI.parse("chat:session3");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: {
          text: "/create-agent test",
          parts: [
            new ChatRequestSlashCommandPart(
              new OffsetRange(0, 13),
              new Range(1, 1, 1, 14),
              { command: "create-agent", detail: "", locations: [] }
            )
          ]
        }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      true,
      "Storage should persist when create-agent slash command part is detected"
    );
  });
  test("detects create command from submitted message payload when session has no last request", () => {
    const sessionResource = URI.parse("chat:session-payload");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    submitRequestEmitter.fire({
      chatSessionResource: sessionResource,
      message: {
        text: "/create-prompt payload-test",
        parts: []
      }
    });
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      true,
      "Storage should persist usage detected from submitted message payload"
    );
  });
  test("does not mark used for non-create slash commands", () => {
    const sessionResource = URI.parse("chat:session4");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: {
          text: "/help test",
          parts: []
        }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
    assert.strictEqual(value, false, "Context key should remain false for non-create slash commands");
  });
  test("does not mark used when session has no last request", () => {
    const sessionResource = URI.parse("chat:session5");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), { lastRequest: void 0 });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      false,
      "Should not mark used when there is no last request"
    );
  });
  test("only marks used once even with multiple create commands", () => {
    const sessionResource = URI.parse("chat:session6");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: { text: "/create-skill test", parts: [] }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false), true);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: { text: "/create-prompt test", parts: [] }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false), true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRUaXBTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElDb21tYW5kRXZlbnQsIElDb21tYW5kU2VydmljZSwgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvdGVzdC9jb21tb24vbnVsbEFzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFRpcFNlcnZpY2UsIENSRUFURV9BR0VOVF9JTlNUUlVDVElPTlNfVFJBQ0tJTkdfQ09NTUFORCwgQ1JFQVRFX0FHRU5UX1RSQUNLSU5HX0NPTU1BTkQsIENSRUFURV9QUk9NUFRfVFJBQ0tJTkdfQ09NTUFORCwgQ1JFQVRFX1NLSUxMX1RSQUNLSU5HX0NPTU1BTkQsIEZPUktfQ09OVkVSU0FUSU9OX1RSQUNLSU5HX0NPTU1BTkQsIElDaGF0VGlwLCBJVGlwRGVmaW5pdGlvbiwgVGlwRWxpZ2liaWxpdHlUcmFja2VyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jaGF0VGlwU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGUsIElDaGF0TW9kZXMgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZSwgSVByb21wdFBhdGgsIElQcm9tcHRzU2VydmljZSwgSUFnZW50SW5zdHJ1Y3Rpb25GaWxlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IHN0b3JlU2VsZWN0ZWRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VsZWN0ZWRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90b29scy9tb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0VGlwVGllciwgVElQX0NBVEFMT0csIGV4dHJhY3RDb21tYW5kSWRzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jaGF0VGlwQ2F0YWxvZy5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTZXJ2aWNlL21vY2tDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0RHluYW1pY1ZhcmlhYmxlUGFydCwgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0LCBJUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgR0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsIEdFTkVSQVRFX1BST01QVF9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcblxuY2xhc3MgTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmcgZXh0ZW5kcyBNb2NrQ29udGV4dEtleVNlcnZpY2Uge1xuXHRvdmVycmlkZSBjb250ZXh0TWF0Y2hlc1J1bGVzKHJ1bGVzOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBydWxlcy5ldmFsdWF0ZSh7IGdldFZhbHVlOiAoa2V5OiBzdHJpbmcpID0+IHRoaXMuZ2V0Q29udGV4dEtleVZhbHVlKGtleSkgfSk7XG5cdH1cbn1cblxuY2xhc3MgVHJhY2tpbmdDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdHB1YmxpYyBsYXN0VXBkYXRlVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgbGFzdFVwZGF0ZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgbGFzdFVwZGF0ZVZhbHVlOiB1bmtub3duO1xuXG5cdG92ZXJyaWRlIHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgYXJnMz86IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxhc3RVcGRhdGVLZXkgPSBrZXk7XG5cdFx0dGhpcy5sYXN0VXBkYXRlVmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLmxhc3RVcGRhdGVUYXJnZXQgPSBhcmczIGFzIENvbmZpZ3VyYXRpb25UYXJnZXQgfCB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG59XG5cbnN1aXRlKCdDaGF0VGlwU2VydmljZScsICgpID0+IHtcblx0Y29uc3QgdGVzdERpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBjb250ZXh0S2V5U2VydmljZTogTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmc7XG5cdGxldCBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29tbWFuZEV4ZWN1dGVkRW1pdHRlcjogRW1pdHRlcjxJQ29tbWFuZEV2ZW50Pjtcblx0bGV0IHN0b3JhZ2VTZXJ2aWNlOiBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlO1xuXHRsZXQgbW9ja0luc3RydWN0aW9uRmlsZXM6IElBZ2VudEluc3RydWN0aW9uRmlsZVtdO1xuXHRsZXQgbW9ja1Byb21wdEluc3RydWN0aW9uRmlsZXM6IElQcm9tcHRQYXRoW107XG5cdGxldCBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBUZXN0Q2hhdEVudGl0bGVtZW50U2VydmljZTtcblx0bGV0IGN1cnJlbnRDaGF0TW9kZXM6IElDaGF0TW9kZXM7XG5cdGxldCBjYXRhbG9nQ29tbWFuZFJlZ2lzdHJhdGlvbnM6IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGV2ZXJ5IGBjb21tYW5kOmAgbGluayByZWZlcmVuY2VkIGJ5IHRoZSByZWFsIHtAbGluayBUSVBfQ0FUQUxPR30gc28gdGhhdCB0aXBzIGFyZVxuXHQgKiBjb25zaWRlcmVkIGVsaWdpYmxlLCBzaW11bGF0aW5nIGEgcnVubmluZyB3b3JrYmVuY2ggd2hlcmUgdGhlc2UgY29tbWFuZHMgZXhpc3QuIFJldHVybnMgYSBtYXBcblx0ICoga2V5ZWQgYnkgY29tbWFuZCBpZCBzbyBpbmRpdmlkdWFsIHJlZ2lzdHJhdGlvbnMgY2FuIGJlIGRpc3Bvc2VkIHRvIHNpbXVsYXRlIGEgbWlzc2luZyBjb21tYW5kLlxuXHQgKi9cblx0ZnVuY3Rpb24gcmVnaXN0ZXJDYXRhbG9nQ29tbWFuZHMoKTogTWFwPHN0cmluZywgSURpc3Bvc2FibGU+IHtcblx0XHRjb25zdCByZWdpc3RyYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpO1xuXHRcdGZvciAoY29uc3QgdGlwIG9mIFRJUF9DQVRBTE9HKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gdGlwLmJ1aWxkTWVzc2FnZSh7XG5cdFx0XHRcdGtleWJpbmRpbmdTZXJ2aWNlOiB7IGxvb2t1cEtleWJpbmRpbmc6ICgpID0+IHVuZGVmaW5lZCB9IGFzIFBhcnRpYWw8SUtleWJpbmRpbmdTZXJ2aWNlPiBhcyBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0XHRcdGV4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzOiBuZXcgTWFwKCksXG5cdFx0XHR9KS52YWx1ZTtcblx0XHRcdGZvciAoY29uc3QgY29tbWFuZElkIG9mIGV4dHJhY3RDb21tYW5kSWRzKG1lc3NhZ2UpKSB7XG5cdFx0XHRcdGlmIChyZWdpc3RyYXRpb25zLmhhcyhjb21tYW5kSWQpIHx8IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChjb21tYW5kSWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoY29tbWFuZElkLCAoKSA9PiB7IH0pO1xuXHRcdFx0XHRyZWdpc3RyYXRpb25zLnNldChjb21tYW5kSWQsIHJlZ2lzdHJhdGlvbik7XG5cdFx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQocmVnaXN0cmF0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlZ2lzdHJhdGlvbnM7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVQcm9kdWN0U2VydmljZShoYXNDb3BpbG90OiBib29sZWFuKTogSVByb2R1Y3RTZXJ2aWNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0ZGVmYXVsdENoYXRBZ2VudDogaGFzQ29waWxvdCA/IHsgY2hhdEV4dGVuc2lvbklkOiAnZ2l0aHViLmNvcGlsb3QtY2hhdCcgfSA6IHVuZGVmaW5lZCxcblx0XHR9IGFzIElQcm9kdWN0U2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2UoaGFzQ29waWxvdDogYm9vbGVhbiA9IHRydWUsIHRpcHNFbmFibGVkOiBib29sZWFuID0gdHJ1ZSk6IENoYXRUaXBTZXJ2aWNlIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9kdWN0U2VydmljZSwgY3JlYXRlUHJvZHVjdFNlcnZpY2UoaGFzQ29waWxvdCkpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LnRpcHMuZW5hYmxlZCcsIHRpcHNFbmFibGVkKTtcblx0XHRyZXR1cm4gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VGlwU2VydmljZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBtb2NrIElUaXBEZWZpbml0aW9uIHdpdGggYSBidWlsZE1lc3NhZ2UgZnVuY3Rpb24uXG5cdCAqIFRlc3RzIGNhbiBwcm92aWRlIGFueSBJVGlwRGVmaW5pdGlvbiBwcm9wZXJ0aWVzIGV4Y2VwdCBidWlsZE1lc3NhZ2UuXG5cdCAqL1xuXHRmdW5jdGlvbiBjcmVhdGVNb2NrVGlwKG92ZXJyaWRlczogT21pdDxQYXJ0aWFsPElUaXBEZWZpbml0aW9uPiwgJ2J1aWxkTWVzc2FnZSc+ICYgUGljazxJVGlwRGVmaW5pdGlvbiwgJ2lkJz4gJiB7IG1lc3NhZ2U/OiBzdHJpbmcgfSk6IElUaXBEZWZpbml0aW9uIHtcblx0XHRjb25zdCB7IG1lc3NhZ2UsIC4uLnJlc3QgfSA9IG92ZXJyaWRlcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGllcjogQ2hhdFRpcFRpZXIuUW9sLFxuXHRcdFx0Li4ucmVzdCxcblx0XHRcdGJ1aWxkTWVzc2FnZTogKCkgPT4gbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UgPz8gJ3Rlc3QnKSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja01vZGUob3ZlcnJpZGVzOiBPbWl0PFBhcnRpYWw8SUNoYXRNb2RlPiwgJ25hbWUnIHwgJ2xhYmVsJyB8ICdpY29uJyB8ICdkZXNjcmlwdGlvbic+ICYgeyBpZDogc3RyaW5nOyBuYW1lPzogc3RyaW5nIH0pOiBJQ2hhdE1vZGUge1xuXHRcdGNvbnN0IHsgbmFtZSA9IG92ZXJyaWRlcy5pZCwgLi4ucmVzdCB9ID0gb3ZlcnJpZGVzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBjb25zdE9ic2VydmFibGUobmFtZSksXG5cdFx0XHRsYWJlbDogY29uc3RPYnNlcnZhYmxlKG5hbWUpLFxuXHRcdFx0aWNvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0XHRkZXNjcmlwdGlvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0XHRpc0J1aWx0aW46IHJlc3QuaXNCdWlsdGluID8/IGZhbHNlLFxuXHRcdFx0Li4ucmVzdCxcblx0XHR9IGFzIElDaGF0TW9kZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tDaGF0TW9kZXMoYnVpbHRpbjogcmVhZG9ubHkgSUNoYXRNb2RlW10sIGN1c3RvbTogcmVhZG9ubHkgSUNoYXRNb2RlW10pOiBJQ2hhdE1vZGVzIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRidWlsdGluLFxuXHRcdFx0Y3VzdG9tLFxuXHRcdFx0ZmluZE1vZGVCeUlkOiBpZCA9PiBidWlsdGluLmZpbmQobW9kZSA9PiBtb2RlLmlkID09PSBpZCkgPz8gY3VzdG9tLmZpbmQobW9kZSA9PiBtb2RlLmlkID09PSBpZCksXG5cdFx0XHRmaW5kTW9kZUJ5TmFtZTogbmFtZSA9PiBidWlsdGluLmZpbmQobW9kZSA9PiBtb2RlLm5hbWUuZ2V0KCkgPT09IG5hbWUpID8/IGN1c3RvbS5maW5kKG1vZGUgPT4gbW9kZS5uYW1lLmdldCgpID09PSBuYW1lKSxcblx0XHRcdHdhaXRGb3JQZW5kaW5nVXBkYXRlczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH07XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UgPSBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmcoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQua2V5LCAxKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb21tYW5kRXhlY3V0ZWRFbWl0dGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJQ29tbWFuZEV2ZW50PigpKTtcblx0XHRzdG9yYWdlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0bW9ja0luc3RydWN0aW9uRmlsZXMgPSBbXTtcblx0XHRtb2NrUHJvbXB0SW5zdHJ1Y3Rpb25GaWxlcyA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwge1xuXHRcdFx0b25EaWRFeGVjdXRlQ29tbWFuZDogY29tbWFuZEV4ZWN1dGVkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uV2lsbEV4ZWN1dGVDb21tYW5kOiB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElDb21tYW5kRXZlbnQ+KCkpLmV2ZW50LFxuXHRcdH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHtcblx0XHRcdGxpc3RBZ2VudEluc3RydWN0aW9uczogYXN5bmMgKCkgPT4gbW9ja0luc3RydWN0aW9uRmlsZXMsXG5cdFx0XHRsaXN0UHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IG1vY2tQcm9tcHRJbnN0cnVjdGlvbkZpbGVzLFxuXHRcdFx0b25EaWRDaGFuZ2VDdXN0b21BZ2VudHM6IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyBQYXJ0aWFsPElQcm9tcHRzU2VydmljZT4gYXMgSVByb21wdHNTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKSk7XG5cdFx0Y2hhdEVudGl0bGVtZW50U2VydmljZSA9IG5ldyBUZXN0Q2hhdEVudGl0bGVtZW50U2VydmljZSgpO1xuXHRcdGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuQXZhaWxhYmxlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIGNoYXRFbnRpdGxlbWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGN1cnJlbnRDaGF0TW9kZXMgPSBjcmVhdGVNb2NrQ2hhdE1vZGVzKFtdLCBbY3JlYXRlTW9ja01vZGUoeyBpZDogJ3BsYW4nLCBuYW1lOiAnUGxhbicgfSldKTtcblx0XHRjb25zdCB3aWRnZXQgPSB7XG5cdFx0XHRzY29wZWRDb250ZXh0S2V5U2VydmljZTogY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRpbnB1dDoge1xuXHRcdFx0XHRjdXJyZW50Q2hhdE1vZGVzT2JzOiB7XG5cdFx0XHRcdFx0Z2V0OiAoKSA9PiBjdXJyZW50Q2hhdE1vZGVzLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGxhc3RGb2N1c2VkV2lkZ2V0OiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZEFkZFdpZGdldDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQ2hhbmdlV2lkZ2V0VmlzaWJpbGl0eTogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQmFja2dyb3VuZFNlc3Npb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZENoYW5nZUZvY3VzZWRXaWRnZXQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZENoYW5nZUZvY3VzZWRTZXNzaW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0cmV2ZWFsOiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdFx0cmV2ZWFsV2lkZ2V0OiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRnZXRBbGxXaWRnZXRzOiAoKSA9PiBbd2lkZ2V0XSxcblx0XHRcdGdldFdpZGdldEJ5SW5wdXRVcmk6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRnZXRXaWRnZXRzQnlMb2NhdGlvbnM6ICgpID0+IFtdLFxuXHRcdFx0b3BlblNlc3Npb246IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHJlZ2lzdGVyOiAoKSA9PiBEaXNwb3NhYmxlLk5vbmUsXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUtleWJpbmRpbmdTZXJ2aWNlLCB7XG5cdFx0XHRsb29rdXBLZXliaW5kaW5nOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyBQYXJ0aWFsPElLZXliaW5kaW5nU2VydmljZT4gYXMgSUtleWJpbmRpbmdTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSwgbmV3IE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSgpKTtcblx0XHRjYXRhbG9nQ29tbWFuZFJlZ2lzdHJhdGlvbnMgPSByZWdpc3RlckNhdGFsb2dDb21tYW5kcygpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGEgd2VsY29tZSB0aXAnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcCwgJ1Nob3VsZCByZXR1cm4gYSB3ZWxjb21lIHRpcCcpO1xuXHRcdGFzc2VydC5vayh0aXAuaWQuc3RhcnRzV2l0aCgndGlwLicpLCAnVGlwIHNob3VsZCBoYXZlIGEgdmFsaWQgSUQnKTtcblx0XHRhc3NlcnQub2sodGlwLmNvbnRlbnQudmFsdWUubGVuZ3RoID4gMCwgJ1RpcCBzaG91bGQgaGF2ZSBjb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgZGVzY3JpcHRpdmUgdGl0bGVzIGZvciB0aXAgY29tbWFuZCBsaW5rcycsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IHRpcCBvZiBUSVBfQ0FUQUxPRykge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB0aXAuYnVpbGRNZXNzYWdlKHtcblx0XHRcdFx0a2V5YmluZGluZ1NlcnZpY2U6IHtcblx0XHRcdFx0XHRsb29rdXBLZXliaW5kaW5nOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdH0gYXMgUGFydGlhbDxJS2V5YmluZGluZ1NlcnZpY2U+IGFzIElLZXliaW5kaW5nU2VydmljZSxcblx0XHRcdFx0ZXhwZXJpbWVudGFsVGlwTWVzc2FnZXM6IG5ldyBNYXAoKSxcblx0XHRcdH0pLnZhbHVlO1xuXG5cdFx0XHRjb25zdCBjb21tYW5kTGlua1JlZ2V4ID0gL1xcW1teXFxdXStcXF1cXCgoY29tbWFuZDpbXildKylcXCkvZztcblx0XHRcdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHRcdHdoaWxlICgobWF0Y2ggPSBjb21tYW5kTGlua1JlZ2V4LmV4ZWMobWFya2Rvd24pKSAhPT0gbnVsbCkge1xuXHRcdFx0XHRhc3NlcnQub2soL1xcc1wiW15cIl0rXCIkLy50ZXN0KG1hdGNoWzFdKSwgYEV4cGVjdGVkIGNvbW1hbmQgbGluayBpbiAke3RpcC5pZH0gdG8gaW5jbHVkZSBhIGRlc2NyaXB0aXZlIHRpdGxlOiAke21hdGNoWzBdfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVjb3JkcyAjIGZpbGUgcmVmZXJlbmNlIHVzYWdlIGZvciBhdHRhY2ggZmlsZXMgdGlwIGVsaWdpYmlsaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1Ym1pdFJlcXVlc3RFbWl0dGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgbWVzc2FnZT86IElQYXJzZWRDaGF0UmVxdWVzdCB9PigpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdFx0b25EaWRTdWJtaXRSZXF1ZXN0OiBzdWJtaXRSZXF1ZXN0RW1pdHRlci5ldmVudCxcblx0XHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRTZXJ2aWNlPiBhcyBJQ2hhdFNlcnZpY2UpO1xuXG5cdFx0Y3JlYXRlU2VydmljZSgpO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQ6c2Vzc2lvbi1hdHRhY2gtZmlsZScpLFxuXHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHR0ZXh0OiAnd2hhdCBkb2VzICNmaWxlOlJFQURNRS5tZCBzYXknLFxuXHRcdFx0XHRwYXJ0czogW25ldyBDaGF0UmVxdWVzdER5bmFtaWNWYXJpYWJsZVBhcnQoXG5cdFx0XHRcdFx0bmV3IE9mZnNldFJhbmdlKDEwLCAyNiksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDExLCAxLCAyNyksXG5cdFx0XHRcdFx0JyNmaWxlOlJFQURNRS5tZCcsXG5cdFx0XHRcdFx0J2ZpbGUnLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRVUkkuZmlsZSgnL3dvcmtzcGFjZS9SRUFETUUubWQnKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdCldLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV4ZWN1dGVkQ29tbWFuZHMgPSBKU09OLnBhcnNlKHN0b3JhZ2VTZXJ2aWNlLmdldCgnY2hhdC50aXBzLmV4ZWN1dGVkQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pID8/ICdbXScpIGFzIHN0cmluZ1tdO1xuXHRcdGFzc2VydC5vayhleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKCdjaGF0LnRpcHMuYXR0YWNoRmlsZXMucmVmZXJlbmNlVXNlZCcpKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkcyBvbmx5IG1hdGNoaW5nIGNyZWF0ZSB0aXAgdXNhZ2UgZm9yIHN1Ym1pdHRlZCBjcmVhdGUgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBzdWJtaXRSZXF1ZXN0RW1pdHRlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkk7IHJlYWRvbmx5IG1lc3NhZ2U/OiBJUGFyc2VkQ2hhdFJlcXVlc3QgfT4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRcdG9uRGlkU3VibWl0UmVxdWVzdDogc3VibWl0UmVxdWVzdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyBQYXJ0aWFsPElDaGF0U2VydmljZT4gYXMgSUNoYXRTZXJ2aWNlKTtcblxuXHRcdGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoe1xuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24tY3JlYXRlLXByb21wdCcpLFxuXHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHR0ZXh0OiAnL2NyZWF0ZS1wcm9tcHQgc2NhZmZvbGQgYSByZXVzYWJsZSBwcm9tcHQnLFxuXHRcdFx0XHRwYXJ0czogW10sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXhlY3V0ZWRDb21tYW5kcyA9IEpTT04ucGFyc2Uoc3RvcmFnZVNlcnZpY2UuZ2V0KCdjaGF0LnRpcHMuZXhlY3V0ZWRDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgPz8gJ1tdJykgYXMgc3RyaW5nW107XG5cdFx0YXNzZXJ0Lm9rKGV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX1BST01QVF9UUkFDS0lOR19DT01NQU5EKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKENSRUFURV9BR0VOVF9JTlNUUlVDVElPTlNfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfQUdFTlRfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfU0tJTExfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhGT1JLX0NPTlZFUlNBVElPTl9UUkFDS0lOR19DT01NQU5EKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZHMgaW5pdCB0aXAgdXNhZ2UgZm9yIHN1Ym1pdHRlZCAvaW5pdCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1Ym1pdFJlcXVlc3RFbWl0dGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgbWVzc2FnZT86IElQYXJzZWRDaGF0UmVxdWVzdCB9PigpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdFx0b25EaWRTdWJtaXRSZXF1ZXN0OiBzdWJtaXRSZXF1ZXN0RW1pdHRlci5ldmVudCxcblx0XHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRTZXJ2aWNlPiBhcyBJQ2hhdFNlcnZpY2UpO1xuXG5cdFx0Y3JlYXRlU2VydmljZSgpO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQ6c2Vzc2lvbi1pbml0JyksXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHRleHQ6ICcvaW5pdCcsXG5cdFx0XHRcdHBhcnRzOiBbXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBleGVjdXRlZENvbW1hbmRzID0gSlNPTi5wYXJzZShzdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQudGlwcy5leGVjdXRlZENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSA/PyAnW10nKSBhcyBzdHJpbmdbXTtcblx0XHRhc3NlcnQub2soZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX1RSQUNLSU5HX0NPTU1BTkQpKTtcblx0XHRhc3NlcnQub2soIWV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX1BST01QVF9UUkFDS0lOR19DT01NQU5EKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKENSRUFURV9BR0VOVF9UUkFDS0lOR19DT01NQU5EKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKENSRUFURV9TS0lMTF9UUkFDS0lOR19DT01NQU5EKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKEZPUktfQ09OVkVSU0FUSU9OX1RSQUNLSU5HX0NPTU1BTkQpKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdoaWRlcyBzaG93biBzbGFzaCB0aXAgYWZ0ZXIgc3VibWl0dGVkIHNsYXNoIGNvbW1hbmQgd2l0aG91dCBjbGlja2luZyB0aXAgbGluaycsICgpID0+IHtcblx0XHRjb25zdCBzdWJtaXRSZXF1ZXN0RW1pdHRlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkk7IHJlYWRvbmx5IG1lc3NhZ2U/OiBJUGFyc2VkQ2hhdFJlcXVlc3QgfT4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRcdG9uRGlkU3VibWl0UmVxdWVzdDogc3VibWl0UmVxdWVzdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyBQYXJ0aWFsPElDaGF0U2VydmljZT4gYXMgSUNoYXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUua2V5LCBsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cblx0XHRsZXQgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgVElQX0NBVEFMT0cubGVuZ3RoICYmIHRpcD8uaWQgIT09ICd0aXAuaW5pdCc7IGkrKykge1xuXHRcdFx0dGlwID0gc2VydmljZS5uYXZpZ2F0ZVRvTmV4dFRpcCgpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayh0aXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXAuaWQsICd0aXAuaW5pdCcsICdFeHBlY3RlZCB0byBuYXZpZ2F0ZSB0byB0aGUgaW5pdCB0aXAgYmVmb3JlIHN1Ym1pdHRpbmcgL2luaXQnKTtcblxuXHRcdGxldCBkaWRIaWRlID0gZmFsc2U7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkSGlkZVRpcCgoKSA9PiBkaWRIaWRlID0gdHJ1ZSkpO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQ6c2Vzc2lvbi1hZHZhbmNlLWluaXQnKSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0dGV4dDogJy9pbml0Jyxcblx0XHRcdFx0cGFydHM6IFtdLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5vayhkaWRIaWRlLCAnRXhwZWN0ZWQgc2xhc2ggdGlwIHRvIGhpZGUgYWZ0ZXIgc3VibWl0dGluZyAvaW5pdCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpPy5pZCwgJ3RpcC5pbml0JywgJ0V4cGVjdGVkIGluaXQgdGlwIHRvIHN0YXkgZXhjbHVkZWQgYWZ0ZXIgc2xhc2ggdXNhZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyBzbGFzaCB0aXAgZnJvbSByb3RhdGlvbiBhZnRlciBzdWJtaXR0ZWQgc2xhc2ggY29tbWFuZCB2aWEgZWxpZ2liaWxpdHkgdHJhY2tpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VibWl0UmVxdWVzdEVtaXR0ZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJOyByZWFkb25seSBtZXNzYWdlPzogSVBhcnNlZENoYXRSZXF1ZXN0IH0+KCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZFN1Ym1pdFJlcXVlc3Q6IHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmV2ZW50LFxuXHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgUGFydGlhbDxJQ2hhdFNlcnZpY2U+IGFzIElDaGF0U2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXG5cdFx0bGV0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IFRJUF9DQVRBTE9HLmxlbmd0aCAmJiB0aXA/LmlkICE9PSAndGlwLmluaXQnOyBpKyspIHtcblx0XHRcdHRpcCA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLmlkLCAndGlwLmluaXQnKTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoe1xuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24tcm90YXRlLWluaXQnKSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0dGV4dDogJy9pbml0Jyxcblx0XHRcdFx0cGFydHM6IFtdLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgVElQX0NBVEFMT0cubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRpcCA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHRcdGlmICghdGlwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRpcC5pZCwgJ3RpcC5pbml0JywgJ0V4cGVjdGVkIGluaXQgdGlwIHRvIGJlIHJlbW92ZWQgZnJvbSB0aXAgcm90YXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBleGVjdXRlZENvbW1hbmRzID0gSlNPTi5wYXJzZShzdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQudGlwcy5leGVjdXRlZENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSA/PyAnW10nKSBhcyBzdHJpbmdbXTtcblx0XHRhc3NlcnQub2soZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX1RSQUNLSU5HX0NPTU1BTkQpLCAnRXhwZWN0ZWQgc2xhc2ggdXNhZ2UgdG8gYmUgdHJhY2tlZCBpbiBleGVjdXRlZCBjb21tYW5kIGV4Y2x1c2lvbnMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyBzbGFzaCB0aXAgZnJvbSByb3RhdGlvbiB3aGVuIHNsYXNoIHVzYWdlIGlzIHJlY29yZGVkIGJlZm9yZSBpbnB1dCB0cmFuc2Zvcm1hdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXG5cdFx0bGV0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IFRJUF9DQVRBTE9HLmxlbmd0aCAmJiB0aXA/LmlkICE9PSAndGlwLmluaXQnOyBpKyspIHtcblx0XHRcdHRpcCA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLmlkLCAndGlwLmluaXQnKTtcblxuXHRcdHNlcnZpY2UucmVjb3JkU2xhc2hDb21tYW5kVXNhZ2UoJ2luaXQnKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgVElQX0NBVEFMT0cubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRpcCA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHRcdGlmICghdGlwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRpcC5pZCwgJ3RpcC5pbml0JywgJ0V4cGVjdGVkIGluaXQgdGlwIHRvIGJlIHJlbW92ZWQgZnJvbSB0aXAgcm90YXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBleGVjdXRlZENvbW1hbmRzID0gSlNPTi5wYXJzZShzdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQudGlwcy5leGVjdXRlZENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSA/PyAnW10nKSBhcyBzdHJpbmdbXTtcblx0XHRhc3NlcnQub2soZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX1RSQUNLSU5HX0NPTU1BTkQpLCAnRXhwZWN0ZWQgc2xhc2ggdXNhZ2UgdG8gYmUgdHJhY2tlZCBpbiBleGVjdXRlZCBjb21tYW5kIGV4Y2x1c2lvbnMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkcyBmb3JrIHRpcCB1c2FnZSBmb3Igc3VibWl0dGVkIC9mb3JrIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VibWl0UmVxdWVzdEVtaXR0ZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJOyByZWFkb25seSBtZXNzYWdlPzogSVBhcnNlZENoYXRSZXF1ZXN0IH0+KCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZFN1Ym1pdFJlcXVlc3Q6IHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmV2ZW50LFxuXHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgUGFydGlhbDxJQ2hhdFNlcnZpY2U+IGFzIElDaGF0U2VydmljZSk7XG5cblx0XHRjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRzdWJtaXRSZXF1ZXN0RW1pdHRlci5maXJlKHtcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdDpzZXNzaW9uLWZvcmsnKSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0dGV4dDogJy9mb3JrJyxcblx0XHRcdFx0cGFydHM6IFtdLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV4ZWN1dGVkQ29tbWFuZHMgPSBKU09OLnBhcnNlKHN0b3JhZ2VTZXJ2aWNlLmdldCgnY2hhdC50aXBzLmV4ZWN1dGVkQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pID8/ICdbXScpIGFzIHN0cmluZ1tdO1xuXHRcdGFzc2VydC5vayhleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKEZPUktfQ09OVkVSU0FUSU9OX1RSQUNLSU5HX0NPTU1BTkQpKTtcblx0XHRhc3NlcnQub2soIWV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19UUkFDS0lOR19DT01NQU5EKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKENSRUFURV9QUk9NUFRfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfQUdFTlRfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfU0tJTExfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIEF1dG8gc3dpdGNoIHRpcCB3aGVuIGN1cnJlbnQgbW9kZWwgaXMgZ3B0LTQuMScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnZ3B0LTQuMScpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5vayh0aXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXAuaWQsICd0aXAuc3dpdGNoVG9BdXRvJyk7XG5cdFx0YXNzZXJ0Lm9rKHRpcC5jb250ZW50LnZhbHVlLmluY2x1ZGVzKCdHUFQtNC4xJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXR1cm4gQXV0byBzd2l0Y2ggdGlwIHdoZW4gY3VycmVudCBtb2RlbCBpcyBub3QgZ3B0LTQuMScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnYXV0bycpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5vayh0aXApO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0aXAuaWQsICd0aXAuc3dpdGNoVG9BdXRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldHVybiBBdXRvIHN3aXRjaCB0aXAgd2hlbiBjdXJyZW50IG1vZGVsIGNvbnRleHQga2V5IGlzIGVtcHR5IGFuZCBubyBmYWxsYmFjayBpcyBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJycpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5vayh0aXApO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0aXAuaWQsICd0aXAuc3dpdGNoVG9BdXRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgQXV0byBzd2l0Y2ggdGlwIHdoZW4gY3VycmVudCBtb2RlbCBpcyBwZXJzaXN0ZWQgYW5kIGNvbnRleHQga2V5IGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdHN0b3JlU2VsZWN0ZWRNb2RlbChzdG9yYWdlU2VydmljZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgdW5kZWZpbmVkLCAnY29waWxvdC9ncHQtNC4xLTIwMjUtMDQtMTQnKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnJyk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcC5pZCwgJ3RpcC5zd2l0Y2hUb0F1dG8nKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBBdXRvIHN3aXRjaCB0aXAgd2hlbiBjdXJyZW50IG1vZGVsIGlzIHZlcnNpb25lZCBncHQtNC4xJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5rZXksICdncHQtNC4xLTIwMjUtMDQtMTQnKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLmlkLCAndGlwLnN3aXRjaFRvQXV0bycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzd2l0Y2hpbmcgbW9kZWxzIGFkdmFuY2VzIGF3YXkgZnJvbSBncHQtNC4xIHRpcCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnZ3B0LTQuMScpO1xuXG5cdFx0Y29uc3QgZmlyc3RUaXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayhmaXJzdFRpcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0VGlwLmlkLCAndGlwLnN3aXRjaFRvQXV0bycpO1xuXG5cdFx0Y29uc3Qgc3dpdGNoZWRDb250ZXh0S2V5U2VydmljZSA9IG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2VXaXRoUnVsZXNNYXRjaGluZygpO1xuXHRcdHN3aXRjaGVkQ29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5mb3JlZ3JvdW5kU2Vzc2lvbkNvdW50LmtleSwgMSk7XG5cdFx0c3dpdGNoZWRDb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJ2F1dG8nKTtcblx0XHRjb25zdCBuZXh0VGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKHN3aXRjaGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKG5leHRUaXApO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChuZXh0VGlwLmlkLCAndGlwLnN3aXRjaFRvQXV0bycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHNhbWUgd2VsY29tZSB0aXAgb24gcmVyZW5kZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHRpcDEgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXAxKTtcblxuXHRcdGNvbnN0IHRpcDIgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwMS5pZCwgdGlwMi5pZCwgJ1Nob3VsZCByZXR1cm4gc2FtZSB0aXAgZm9yIHN0YWJsZSByZXJlbmRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXAxLmNvbnRlbnQudmFsdWUsIHRpcDIuY29udGVudC52YWx1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gQ29waWxvdCBpcyBub3QgZW5hYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgvKiBoYXNDb3BpbG90ICovIGZhbHNlKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcCwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCByZXR1cm4gYSB0aXAgd2hlbiBDb3BpbG90IGlzIG5vdCBlbmFibGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdXNlciBpcyBzaWduZWQgb3V0JywgKCkgPT4ge1xuXHRcdGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuVW5rbm93bjtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLCB1bmRlZmluZWQsICdTaG91bGQgbm90IHJldHVybiBhIHRpcCB3aGVuIHRoZSB1c2VyIGlzIHNpZ25lZCBvdXQnKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiB0aXBzIHNldHRpbmcgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoLyogaGFzQ29waWxvdCAqLyB0cnVlLCAvKiB0aXBzRW5hYmxlZCAqLyBmYWxzZSk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXAsIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3QgcmV0dXJuIGEgdGlwIHdoZW4gdGlwcyBzZXR0aW5nIGlzIGRpc2FibGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbG9jYXRpb24gaXMgdGVybWluYWwnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsQ29udGV4dEtleVNlcnZpY2UgPSBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmcoKTtcblx0XHR0ZXJtaW5hbENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMubG9jYXRpb24ua2V5LCBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAodGVybWluYWxDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcCwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCByZXR1cm4gYSB0aXAgaW4gdGVybWluYWwgaW5saW5lIGNoYXQnKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBsb2NhdGlvbiBpcyBlZGl0b3IgaW5saW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBlZGl0b3JDb250ZXh0S2V5U2VydmljZSA9IG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2VXaXRoUnVsZXNNYXRjaGluZygpO1xuXHRcdGVkaXRvckNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMubG9jYXRpb24ua2V5LCBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGVkaXRvckNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLCB1bmRlZmluZWQsICdTaG91bGQgbm90IHJldHVybiBhIHRpcCBpbiBlZGl0b3IgaW5saW5lIGNoYXQnKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhIHRpcCB3aGVuIGZvcmVncm91bmQgc2Vzc2lvbiBjb3VudCBpcyBleGFjdGx5IG9uZScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudC5rZXksIDEpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwLCAnU2hvdWxkIHJldHVybiBhIHRpcCB3aGVuIGV4YWN0bHkgb25lIGZvcmVncm91bmQgY2hhdCBzZXNzaW9uIGlzIHZpc2libGUnKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBmb3JlZ3JvdW5kIHNlc3Npb24gY291bnQgaXMgemVybycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudC5rZXksIDApO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLCB1bmRlZmluZWQsICdTaG91bGQgbm90IHJldHVybiBhIHRpcCB3aGVuIG5vIGZvcmVncm91bmQgY2hhdCBzZXNzaW9ucyBhcmUgdmlzaWJsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGEgdGlwIGZvciB0aGUgQWdlbnRzIG5ldy1zZXNzaW9uIGNvbXBvc2VyIHdoZW4gZm9yZWdyb3VuZCBzZXNzaW9uIGNvdW50IGlzIHplcm8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQua2V5LCAwKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQua2V5LCB0cnVlKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcCwgJ1Nob3VsZCByZXR1cm4gYSB0aXAgZm9yIHRoZSBBZ2VudHMgbmV3LXNlc3Npb24gY29tcG9zZXInKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBmb3JlZ3JvdW5kIHNlc3Npb24gY291bnQgaXMgZ3JlYXRlciB0aGFuIG9uZScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudC5rZXksIDIpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLCB1bmRlZmluZWQsICdTaG91bGQgbm90IHJldHVybiBhIHRpcCB3aGVuIG11bHRpcGxlIGZvcmVncm91bmQgY2hhdCBzZXNzaW9ucyBhcmUgdmlzaWJsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNtaXNzVGlwIGV4Y2x1ZGVzIHRoZSBkaXNtaXNzZWQgdGlwIGFuZCBhbGxvd3MgYSBuZXcgb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB0aXAxID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwMSk7XG5cblx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblxuXHRcdGNvbnN0IHRpcDIgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmICh0aXAyKSB7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGlwMS5pZCwgdGlwMi5pZCwgJ0Rpc21pc3NlZCB0aXAgc2hvdWxkIG5vdCBiZSBzaG93biBhZ2FpbicpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZGlzbWlzc1RpcCBrZWVwcyBuYXZpZ2F0aW9uIGNvbnRleHQgZm9yIG5leHQgdGlwIHRyYXZlcnNhbCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgdGlwMSA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcDEpO1xuXG5cdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cblx0XHRjb25zdCB0aXAyID0gc2VydmljZS5uYXZpZ2F0ZVRvTmV4dFRpcCgpO1xuXHRcdGlmICh0aXAyKSB7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGlwMS5pZCwgdGlwMi5pZCwgJ0Rpc21pc3NlZCB0aXAgc2hvdWxkIG5vdCBiZSByZXR1cm5lZCBieSBuZXh0IG5hdmlnYXRpb24nKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NUaXBGb3JTZXNzaW9uIGhpZGVzIHRpcHMgdW50aWwgcmVzZXRTZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0c2VydmljZS5kaXNtaXNzVGlwRm9yU2Vzc2lvbigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSksIHVuZGVmaW5lZCwgJ1RpcHMgc2hvdWxkIHN0YXkgaGlkZGVuIGZvciB0aGUgY3VycmVudCBzZXNzaW9uIGFmdGVyIGRpc21pc3NpbmcnKTtcblxuXHRcdHNlcnZpY2UucmVzZXRTZXNzaW9uKCk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSksICdUaXBzIHNob3VsZCByZWFwcGVhciBhZnRlciByZXNldHRpbmcgdGhlIHNlc3Npb24nKTtcblx0fSk7XG5cblx0dGVzdCgnbmF2aWdhdGVUb05leHRUaXAga2VlcHMgZm91bmRhdGlvbmFsIHRpcHMgYmVmb3JlIFFvTCB0aXBzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmtleSwgJ0FnZW50Jyk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUua2V5LCBsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5rZXksICdhdXRvJyk7XG5cblx0XHRjb25zdCBmaXJzdFRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKGZpcnN0VGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RUaXAuaWQsICd0aXAucGxhbk1vZGUnKTtcblxuXHRcdGNvbnN0IHNlY29uZFRpcCA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHRhc3NlcnQub2soc2Vjb25kVGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kVGlwLmlkLCAndGlwLmNyZWF0ZUFnZW50JywgJ0V4cGVjdGVkIG5leHQgdGlwIHRvIHJlbWFpbiBpbiBmb3VuZGF0aW9uYWwgdGlwcyBiZWZvcmUgUW9MIHRpcHMnKTtcblx0fSk7XG5cblx0dGVzdCgnbmF2aWdhdGVUb1ByZXZpb3VzVGlwIGZvbGxvd3MgcmV2ZXJzZSBvZiBwcmVmZXJyZWQgb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnQWdlbnQnKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJ2F1dG8nKTtcblxuXHRcdGNvbnN0IGZpcnN0VGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2soZmlyc3RUaXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFRpcC5pZCwgJ3RpcC5wbGFuTW9kZScpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kVGlwID0gc2VydmljZS5uYXZpZ2F0ZVRvTmV4dFRpcCgpO1xuXHRcdGFzc2VydC5vayhzZWNvbmRUaXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmRUaXAuaWQsICd0aXAuY3JlYXRlQWdlbnQnKTtcblxuXHRcdGNvbnN0IHByZXZpb3VzVGlwID0gc2VydmljZS5uYXZpZ2F0ZVRvUHJldmlvdXNUaXAoKTtcblx0XHRhc3NlcnQub2socHJldmlvdXNUaXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aW91c1RpcC5pZCwgJ3RpcC5wbGFuTW9kZScsICdFeHBlY3RlZCBwcmV2aW91cyB0aXAgdG8gcmV2ZXJzZSB0aGUgcHJlZmVycmVkIG9yZGVyaW5nJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIGEgdGlwIHdob3NlIGNvbW1hbmQgaXMgbm90IHJlZ2lzdGVyZWQnLCAoKSA9PiB7XG5cdFx0Y2F0YWxvZ0NvbW1hbmRSZWdpc3RyYXRpb25zLmdldCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nKSEuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnQWdlbnQnKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJ2F1dG8nKTtcblxuXHRcdGFzc2VydFRpcE5ldmVyU2hvd24oc2VydmljZSwgJ3RpcC5wbGFuTW9kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXROZXh0RWxpZ2libGVUaXAgcmV0dXJucyBuZXh0IHRpcCBldmVuIHdoZW4gb25seSBvbmUgcmVtYWlucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Ly8gRmx1c2ggbWljcm90YXNrIHF1ZXVlIHNvIGFzeW5jIGZpbGUtY2hlY2sgZXhjbHVzaW9ucyByZXNvbHZlXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiBxdWV1ZU1pY3JvdGFzayhyKSk7XG5cblx0XHQvLyBHZXQgdGhlIGluaXRpYWwgdGlwXG5cdFx0Y29uc3QgdGlwMSA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcDEsICdTaG91bGQgaGF2ZSBhbiBpbml0aWFsIHRpcCcpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gbmV4dCB0aXBcblx0XHRjb25zdCB0aXAyID0gc2VydmljZS5uYXZpZ2F0ZVRvTmV4dFRpcCgpO1xuXHRcdGFzc2VydC5vayh0aXAyLCAnU2hvdWxkIGhhdmUgYSBzZWNvbmQgdGlwJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRpcDEuaWQsIHRpcDIuaWQsICdTZWNvbmQgdGlwIHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcblxuXHRcdC8vIERpc21pc3MgYWxsIHRpcHMgZXhjZXB0IHRpcDEgYnkgZGlzbWlzc2luZyBjdXJyZW50IHRpcCBhbmQgdXNpbmcgZ2V0TmV4dEVsaWdpYmxlVGlwXG5cdFx0Y29uc3QgZGlzbWlzc2VkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0ZGlzbWlzc2VkSWRzLmFkZCh0aXAyLmlkKTtcblx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblxuXHRcdC8vIEtlZXAgZGlzbWlzc2luZyB1bnRpbCB3ZSBjYW4ndCBnZXQgYW55IG1vcmUgdGlwc1xuXHRcdGxldCBuZXh0VGlwID0gc2VydmljZS5nZXROZXh0RWxpZ2libGVUaXAoKTtcblx0XHR3aGlsZSAobmV4dFRpcCAmJiAhZGlzbWlzc2VkSWRzLmhhcyhuZXh0VGlwLmlkKSkge1xuXHRcdFx0aWYgKG5leHRUaXAuaWQgPT09IHRpcDEuaWQpIHtcblx0XHRcdFx0Ly8gV2UgZm91bmQgdGlwMSBhZ2FpbiAtIHRoaXMgaXMgdGhlIGV4cGVjdGVkIGJlaGF2aW9yIChidWcgZml4IHZlcmlmaWNhdGlvbilcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRkaXNtaXNzZWRJZHMuYWRkKG5leHRUaXAuaWQpO1xuXHRcdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cdFx0XHRuZXh0VGlwID0gc2VydmljZS5nZXROZXh0RWxpZ2libGVUaXAoKTtcblx0XHR9XG5cblx0XHQvLyBUaGUga2V5IGFzc2VydGlvbjogZ2V0TmV4dEVsaWdpYmxlVGlwIHNob3VsZCByZXR1cm4gdGlwMSBldmVuIGlmIGl0J3MgdGhlIG9ubHkgb25lIGxlZnRcblx0XHRhc3NlcnQub2sobmV4dFRpcCwgJ2dldE5leHRFbGlnaWJsZVRpcCBzaG91bGQgcmV0dXJuIHRoZSBsYXN0IHJlbWFpbmluZyBlbGlnaWJsZSB0aXAnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TmV4dEVsaWdpYmxlVGlwIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gYWxsIHRpcHMgYXJlIGRpc21pc3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Ly8gRmx1c2ggbWljcm90YXNrIHF1ZXVlIHNvIGFzeW5jIGZpbGUtY2hlY2sgZXhjbHVzaW9ucyByZXNvbHZlXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiBxdWV1ZU1pY3JvdGFzayhyKSk7XG5cblx0XHQvLyBEaXNtaXNzIGFsbCB0aXBzXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDA7IGkrKykge1xuXHRcdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGlmICghdGlwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQWZ0ZXIgZGlzbWlzc2luZyBhbGwsIGdldE5leHRFbGlnaWJsZVRpcCBzaG91bGQgcmV0dXJuIHVuZGVmaW5lZFxuXHRcdGNvbnN0IG5leHRUaXAgPSBzZXJ2aWNlLmdldE5leHRFbGlnaWJsZVRpcCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXh0VGlwLCB1bmRlZmluZWQsICdnZXROZXh0RWxpZ2libGVUaXAgc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBhbGwgdGlwcyBhcmUgZGlzbWlzc2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE5leHRFbGlnaWJsZVRpcCBrZWVwcyBwcmVmZXJyZWQgb25ib2FyZGluZyBvcmRlciBhZnRlciBkaXNtaXNzaW5nIHBsYW4gdGlwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmtleSwgJ0FnZW50Jyk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUua2V5LCBsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5rZXksICdhdXRvJyk7XG5cblx0XHRjb25zdCBmaXJzdFRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKGZpcnN0VGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RUaXAuaWQsICd0aXAucGxhbk1vZGUnKTtcblxuXHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXHRcdGNvbnN0IHNlY29uZFRpcCA9IHNlcnZpY2UuZ2V0TmV4dEVsaWdpYmxlVGlwKCk7XG5cdFx0YXNzZXJ0Lm9rKHNlY29uZFRpcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZFRpcC5pZCwgJ3RpcC5jcmVhdGVBZ2VudCcsICdFeHBlY3RlZCBuZXh0IHRpcCB0byBmb2xsb3cgcHJlZmVycmVkIG9uYm9hcmRpbmcgb3JkZXIgYmVmb3JlIFFvTCB0aXBzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE5leHRFbGlnaWJsZVRpcCBwaWNrcyBuZXh0IHJlbGF0aXZlIHRvIGN1cnJlbnQgdGlwIGFmdGVyIGRpc21pc3NpbmcgZnJvbSBtaWRkbGUgb2Ygb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnQWdlbnQnKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJ2F1dG8nKTtcblxuXHRcdGNvbnN0IGZpcnN0VGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2soZmlyc3RUaXApO1xuXG5cdFx0Y29uc3Qgc2Vjb25kVGlwID0gc2VydmljZS5uYXZpZ2F0ZVRvTmV4dFRpcCgpO1xuXHRcdGFzc2VydC5vayhzZWNvbmRUaXApO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWROZXh0QWZ0ZXJTZWNvbmQgPSBzZXJ2aWNlLm5hdmlnYXRlVG9OZXh0VGlwKCk7XG5cdFx0YXNzZXJ0Lm9rKGV4cGVjdGVkTmV4dEFmdGVyU2Vjb25kLCAnRXhwZWN0ZWQgYXQgbGVhc3QgdGhyZWUgdGlwcyB0byB2YWxpZGF0ZSByZWxhdGl2ZSBvcmRlcmluZycpO1xuXG5cdFx0Y29uc3QgYmFja1RvU2Vjb25kID0gc2VydmljZS5uYXZpZ2F0ZVRvUHJldmlvdXNUaXAoKTtcblx0XHRhc3NlcnQub2soYmFja1RvU2Vjb25kKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja1RvU2Vjb25kLmlkLCBzZWNvbmRUaXAuaWQpO1xuXG5cdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cdFx0Y29uc3QgYWN0dWFsTmV4dCA9IHNlcnZpY2UuZ2V0TmV4dEVsaWdpYmxlVGlwKCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbE5leHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxOZXh0LmlkLCBleHBlY3RlZE5leHRBZnRlclNlY29uZC5pZCwgJ0V4cGVjdGVkIGdldE5leHRFbGlnaWJsZVRpcCB0byBhZHZhbmNlIHJlbGF0aXZlIHRvIGN1cnJlbnQgdGlwIHJhdGhlciB0aGFuIHJlc3RhcnQgZnJvbSB0b3AgcHJpb3JpdHkgdGlwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NUaXAgZmlyZXMgb25EaWREaXNtaXNzVGlwIGV2ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0bGV0IGZpcmVkID0gZmFsc2U7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkRGlzbWlzc1RpcCgoKSA9PiB7IGZpcmVkID0gdHJ1ZTsgfSkpO1xuXHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXG5cdFx0YXNzZXJ0Lm9rKGZpcmVkLCAnb25EaWREaXNtaXNzVGlwIHNob3VsZCBmaXJlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2FibGVUaXBzIGZpcmVzIG9uRGlkRGlzYWJsZVRpcHMgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRsZXQgZmlyZWQgPSBmYWxzZTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWREaXNhYmxlVGlwcygoKSA9PiB7IGZpcmVkID0gdHJ1ZTsgfSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZGlzYWJsZVRpcHMoKTtcblxuXHRcdGFzc2VydC5vayhmaXJlZCwgJ29uRGlkRGlzYWJsZVRpcHMgc2hvdWxkIGZpcmUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZVRpcHMgd3JpdGVzIHRvIGFwcGxpY2F0aW9uIHNldHRpbmdzIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFja2luZ0NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRyYWNraW5nQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IHRyYWNraW5nQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRpc2FibGVUaXBzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tpbmdDb25maWd1cmF0aW9uU2VydmljZS5sYXN0VXBkYXRlS2V5LCAnY2hhdC50aXBzLmVuYWJsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tpbmdDb25maWd1cmF0aW9uU2VydmljZS5sYXN0VXBkYXRlVmFsdWUsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tpbmdDb25maWd1cmF0aW9uU2VydmljZS5sYXN0VXBkYXRlVGFyZ2V0LCBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZVRpcHMgcmVzZXRzIHN0YXRlIHNvIHJlLWVuYWJsaW5nIHdvcmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB0aXAxID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwMSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRpc2FibGVUaXBzKCk7XG5cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC50aXBzLmVuYWJsZWQnLCB0cnVlKTtcblxuXHRcdGNvbnN0IHRpcDIgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXAyLCAnU2hvdWxkIHJldHVybiBhIHRpcCBhZnRlciBkaXNhYmxpbmcgYW5kIHJlLWVuYWJsaW5nJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NlZCB0aXBzIHN0YXkgZGlzbWlzc2VkIGFmdGVyIGRpc2FibGluZyBhbmQgcmUtZW5hYmxpbmcgdGlwcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Ly8gRmx1c2ggbWljcm90YXNrIHF1ZXVlIHNvIGFzeW5jIGZpbGUtY2hlY2sgZXhjbHVzaW9ucyByZXNvbHZlIGJlZm9yZVxuXHRcdC8vIHdlIHN0YXJ0IGRpc21pc3NpbmcgdGlwcyAob3RoZXJ3aXNlIGV4Y2x1ZGVVbnRpbENoZWNrZWQgdGlwcyBhcmVcblx0XHQvLyB0ZW1wb3JhcmlseSBleGNsdWRlZCBhbmQgbmV2ZXIgZ2V0IGRpc21pc3NlZCBpbiB0aGUgbG9vcCBiZWxvdykuXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiBxdWV1ZU1pY3JvdGFzayhyKSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0aWYgKCF0aXApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpLCB1bmRlZmluZWQsICdObyB0aXAgc2hvdWxkIHJlbWFpbiBvbmNlIGFsbCB0aXBzIGFyZSBkaXNtaXNzZWQnKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZGlzYWJsZVRpcHMoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC50aXBzLmVuYWJsZWQnLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpLCB1bmRlZmluZWQsICdEaXNtaXNzZWQgdGlwcyBzaG91bGQgcmVtYWluIGRpc21pc3NlZCBhZnRlciByZS1lbmFibGluZyB0aXBzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyRGlzbWlzc2VkVGlwcyByZXN0b3JlcyB0aXAgdmlzaWJpbGl0eScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDA7IGkrKykge1xuXHRcdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGlmICghdGlwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKSwgdW5kZWZpbmVkLCAnTm8gdGlwIHNob3VsZCByZW1haW4gb25jZSBhbGwgdGlwcyBhcmUgZGlzbWlzc2VkJyk7XG5cblx0XHRzZXJ2aWNlLmNsZWFyRGlzbWlzc2VkVGlwcygpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSksICdBIHRpcCBzaG91bGQgYmUgdmlzaWJsZSBhZ2FpbiBhZnRlciBjbGVhcmluZyBkaXNtaXNzZWQgdGlwcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdtaWdyYXRlcyBkaXNtaXNzZWQgdGlwcyBmcm9tIHByb2ZpbGUgdG8gYXBwbGljYXRpb24gc3RvcmFnZScsICgpID0+IHtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2hhdC50aXAuZGlzbWlzc2VkJywgSlNPTi5zdHJpbmdpZnkoWyd0aXAuc3dpdGNoVG9BdXRvJ10pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnZ3B0LTQuMScpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5vayh0aXApO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0aXAuaWQsICd0aXAuc3dpdGNoVG9BdXRvJywgJ1Nob3VsZCBob25vciBwcm9maWxlLXN0b3JlZCBkaXNtaXNzZWQgdGlwIGlkJyk7XG5cdFx0YXNzZXJ0Lm9rKHN0b3JhZ2VTZXJ2aWNlLmdldCgnY2hhdC50aXAuZGlzbWlzc2VkJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSwgJ0V4cGVjdGVkIGRpc21pc3NlZCB0aXBzIHRvIG1pZ3JhdGUgdG8gYXBwbGljYXRpb24gc3RvcmFnZScpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aXAudW5kb0NoYW5nZXMgZGVzY3JpYmVzIHdoZXJlIHRvIGZpbmQgcmVzdG9yZSBjaGVja3BvaW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUua2V5LCBsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXG5cdFx0Y29uc3QgdGlwID0gZmluZFRpcEJ5SWQoc2VydmljZSwgJ3RpcC51bmRvQ2hhbmdlcycpO1xuXG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cdFx0YXNzZXJ0Lm9rKHRpcC5jb250ZW50LnZhbHVlLmluY2x1ZGVzKCdIb3ZlciBhIHByZXZpb3VzIHJlcXVlc3QnKSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcC5jb250ZW50LnZhbHVlLmluY2x1ZGVzKCdSZXN0b3JlIENoZWNrcG9pbnQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RpcC5tZXJtYWlkIHVzZXMgc2VudGVuY2UgcHVuY3R1YXRpb24gaW4gZGlzcGxheSB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXG5cdFx0Y29uc3QgdGlwID0gZmluZFRpcEJ5SWQoc2VydmljZSwgJ3RpcC5tZXJtYWlkJyk7XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQub2sodGlwLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ2Zsb3cgY2hhcnQuIEl0IGNhbiByZW5kZXIgTWVybWFpZCBkaWFncmFtcyBkaXJlY3RseSBpbiBjaGF0LicpKTtcblx0XHRhc3NlcnQub2soIXRpcC5jb250ZW50LnZhbHVlLmluY2x1ZGVzKCdmbG93IGNoYXJ0OyBpdCBjYW4gcmVuZGVyIE1lcm1haWQgZGlhZ3JhbXMgZGlyZWN0bHkgaW4gY2hhdC4nKSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZShcblx0XHRhZ2VudEluc3RydWN0aW9uczogSUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10gPSBbXSxcblx0XHRwcm9tcHRJbnN0cnVjdGlvbnM6IElQcm9tcHRQYXRoW10gPSBbXSxcblx0XHRvcHRpb25zPzogeyBvbkRpZENoYW5nZUN1c3RvbUFnZW50cz86IEV2ZW50PHZvaWQ+OyBsaXN0UHJvbXB0RmlsZXM/OiAoX3R5cGU6IFByb21wdHNUeXBlKSA9PiBQcm9taXNlPHJlYWRvbmx5IElQcm9tcHRQYXRoW10+IH0sXG5cdCk6IFBhcnRpYWw8SVByb21wdHNTZXJ2aWNlPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxpc3RBZ2VudEluc3RydWN0aW9uczogYXN5bmMgKCkgPT4gYWdlbnRJbnN0cnVjdGlvbnMsXG5cdFx0XHRsaXN0UHJvbXB0RmlsZXM6IG9wdGlvbnM/Lmxpc3RQcm9tcHRGaWxlcyA/PyAoYXN5bmMgKF90eXBlOiBQcm9tcHRzVHlwZSkgPT4gcHJvbXB0SW5zdHJ1Y3Rpb25zKSxcblx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzOiBvcHRpb25zPy5vbkRpZENoYW5nZUN1c3RvbUFnZW50cyA/PyBFdmVudC5Ob25lLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCk6IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UoKSk7XG5cdH1cblxuXHR0ZXN0KCdleGNsdWRlcyB0aXAudW5kb0NoYW5nZXMgd2hlbiByZXN0b3JlIGNoZWNrcG9pbnQgY29tbWFuZCBoYXMgYmVlbiBleGVjdXRlZCcsICgpID0+IHtcblx0XHRjb25zdCB0aXAgPSBjcmVhdGVNb2NrVGlwKHtcblx0XHRcdGlkOiAndGlwLnVuZG9DaGFuZ2VzJyxcblx0XHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogWyd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzdG9yZUNoZWNrcG9pbnQnXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogY29tbWFuZEV4ZWN1dGVkRW1pdHRlci5ldmVudCwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgZmFsc2UsICdTaG91bGQgbm90IGJlIGV4Y2x1ZGVkIGJlZm9yZSBjb21tYW5kIGlzIGV4ZWN1dGVkJyk7XG5cblx0XHRjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmZpcmUoeyBjb21tYW5kSWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzdG9yZUNoZWNrcG9pbnQnLCBhcmdzOiBbXSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ1Nob3VsZCBiZSBleGNsdWRlZCBhZnRlciBjb21tYW5kIGlzIGV4ZWN1dGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIGV4ZWN1dGVkIGNvbW1hbmQgZXhjbHVzaW9ucyBpbiBhcHBsaWNhdGlvbiBzdG9yYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAudW5kb0NoYW5nZXMnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZXN0b3JlQ2hlY2twb2ludCddLFxuXHRcdH0pO1xuXG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZXZlbnQsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmZpcmUoeyBjb21tYW5kSWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzdG9yZUNoZWNrcG9pbnQnLCBhcmdzOiBbXSB9KTtcblxuXHRcdGFzc2VydC5vayhzdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQudGlwcy5leGVjdXRlZENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSwgJ0V4cGVjdGVkIGV4ZWN1dGVkIGNvbW1hbmQgZXhjbHVzaW9ucyBpbiBhcHBsaWNhdGlvbiBzdG9yYWdlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmdldCgnY2hhdC50aXBzLmV4ZWN1dGVkQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSksIHVuZGVmaW5lZCwgJ0RpZCBub3QgZXhwZWN0IGV4ZWN1dGVkIGNvbW1hbmQgZXhjbHVzaW9ucyBpbiBwcm9maWxlIHN0b3JhZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmFnZVNlcnZpY2UuZ2V0KCdjaGF0LnRpcHMuZXhlY3V0ZWRDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpLCB1bmRlZmluZWQsICdEaWQgbm90IGV4cGVjdCBleGVjdXRlZCBjb21tYW5kIGV4Y2x1c2lvbnMgaW4gd29ya3NwYWNlIHN0b3JhZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgnbWlncmF0ZXMgZXhlY3V0ZWQgY29tbWFuZCBleGNsdXNpb25zIGZyb20gcHJvZmlsZSB0byBhcHBsaWNhdGlvbiBzdG9yYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAudW5kb0NoYW5nZXMnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZXN0b3JlQ2hlY2twb2ludCddLFxuXHRcdH0pO1xuXG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2NoYXQudGlwcy5leGVjdXRlZENvbW1hbmRzJywgSlNPTi5zdHJpbmdpZnkoWyd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzdG9yZUNoZWNrcG9pbnQnXSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmV2ZW50LCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnU2hvdWxkIGhvbm9yIHByb2ZpbGUtc3RvcmVkIGV4Y2x1c2lvbnMnKTtcblx0XHRhc3NlcnQub2soc3RvcmFnZVNlcnZpY2UuZ2V0KCdjaGF0LnRpcHMuZXhlY3V0ZWRDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiksICdFeHBlY3RlZCBtaWdyYXRlZCBleGNsdXNpb24gZGF0YSBpbiBhcHBsaWNhdGlvbiBzdG9yYWdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRpcC5jdXN0b21JbnN0cnVjdGlvbnMgd2hlbiBjb3BpbG90LWluc3RydWN0aW9ucy5tZCBleGlzdHMgaW4gd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuY3VzdG9tSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdGV4Y2x1ZGVXaGVuUHJvbXB0RmlsZXNFeGlzdDogeyBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGFnZW50RmlsZVR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5jb3BpbG90SW5zdHJ1Y3Rpb25zTWQsIGV4Y2x1ZGVVbnRpbENoZWNrZWQ6IHRydWUgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoW3sgdXJpOiB7IHBhdGg6ICcvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcgfSwgcmVhbFBhdGg6IHVuZGVmaW5lZCwgdHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCB9IGFzIElBZ2VudEluc3RydWN0aW9uRmlsZV0pIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIGFzeW5jIGZpbGUgY2hlY2sgdG8gY29tcGxldGVcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnU2hvdWxkIGJlIGV4Y2x1ZGVkIHdoZW4gY29waWxvdC1pbnN0cnVjdGlvbnMubWQgZXhpc3RzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGV4Y2x1ZGUgdGlwLmN1c3RvbUluc3RydWN0aW9ucyB3aGVuIG9ubHkgQUdFTlRTLm1kIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0aXAgPSBjcmVhdGVNb2NrVGlwKHtcblx0XHRcdGlkOiAndGlwLmN1c3RvbUluc3RydWN0aW9ucycsXG5cdFx0XHRleGNsdWRlV2hlblByb21wdEZpbGVzRXhpc3Q6IHsgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBhZ2VudEZpbGVUeXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuY29waWxvdEluc3RydWN0aW9uc01kLCBleGNsdWRlVW50aWxDaGVja2VkOiB0cnVlIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKFt7IHVyaTogeyBwYXRoOiAnL0FHRU5UUy5tZCcgfSwgcmVhbFBhdGg6IHVuZGVmaW5lZCwgdHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmFnZW50c01kIH0gYXMgSUFnZW50SW5zdHJ1Y3Rpb25GaWxlXSkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgYXN5bmMgZmlsZSBjaGVjayB0byBjb21wbGV0ZVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBleGNsdWRlZCB3aGVuIG9ubHkgQUdFTlRTLm1kIGV4aXN0cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyB0aXAuY3VzdG9tSW5zdHJ1Y3Rpb25zIHdoZW4gLmluc3RydWN0aW9ucy5tZCBmaWxlcyBleGlzdCBpbiB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5jdXN0b21JbnN0cnVjdGlvbnMnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Qcm9tcHRGaWxlc0V4aXN0OiB7IHByb21wdFR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgYWdlbnRGaWxlVHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCwgZXhjbHVkZVVudGlsQ2hlY2tlZDogdHJ1ZSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZShbXSwgW3sgdXJpOiBVUkkuZmlsZSgnLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2NvZGluZy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgYXN5bmMgZmlsZSBjaGVjayB0byBjb21wbGV0ZVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIHRydWUsICdTaG91bGQgYmUgZXhjbHVkZWQgd2hlbiAuaW5zdHJ1Y3Rpb25zLm1kIGZpbGVzIGV4aXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGV4Y2x1ZGUgdGlwLmN1c3RvbUluc3RydWN0aW9ucyB3aGVuIG5vIGluc3RydWN0aW9uIGZpbGVzIGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuY3VzdG9tSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdGV4Y2x1ZGVXaGVuUHJvbXB0RmlsZXNFeGlzdDogeyBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGFnZW50RmlsZVR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5jb3BpbG90SW5zdHJ1Y3Rpb25zTWQsIGV4Y2x1ZGVVbnRpbENoZWNrZWQ6IHRydWUgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBhc3luYyBmaWxlIGNoZWNrIHRvIGNvbXBsZXRlXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgZmFsc2UsICdTaG91bGQgbm90IGJlIGV4Y2x1ZGVkIHdoZW4gbm8gaW5zdHJ1Y3Rpb24gZmlsZXMgZXhpc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgdGlwLmN1c3RvbUluc3RydWN0aW9ucyB3aGVuIGdlbmVyYXRlIGluc3RydWN0aW9ucyBjb21tYW5kIGhhcyBiZWVuIGV4ZWN1dGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuY3VzdG9tSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogW0dFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lEXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogY29tbWFuZEV4ZWN1dGVkRW1pdHRlci5ldmVudCwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgZmFsc2UsICdTaG91bGQgbm90IGJlIGV4Y2x1ZGVkIGJlZm9yZSBjb21tYW5kIGlzIGV4ZWN1dGVkJyk7XG5cblx0XHRjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmZpcmUoeyBjb21tYW5kSWQ6IEdFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lELCBhcmdzOiBbXSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ1Nob3VsZCBiZSBleGNsdWRlZCBhZnRlciBnZW5lcmF0ZSBpbnN0cnVjdGlvbnMgY29tbWFuZCBpcyBleGVjdXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyB0aXAuYWdlbnRNb2RlIHdoZW4gYWdlbnQgbW9kZSBoYXMgYmVlbiB1c2VkIGluIHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCB0aXAgPSBjcmVhdGVNb2NrVGlwKHtcblx0XHRcdGlkOiAndGlwLmFnZW50TW9kZScsXG5cdFx0XHRleGNsdWRlV2hlbk1vZGVzVXNlZDogW0NoYXRNb2RlS2luZC5BZ2VudF0sXG5cdFx0fSk7XG5cblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnQWdlbnQnKTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgZmFsc2UsICdTaG91bGQgbm90IGJlIGV4Y2x1ZGVkIGJlZm9yZSBtb2RlIGlzIHJlY29yZGVkJyk7XG5cblx0XHR0cmFja2VyLnJlY29yZEN1cnJlbnRNb2RlKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ1Nob3VsZCBiZSBleGNsdWRlZCBhZnRlciBhZ2VudCBtb2RlIGhhcyBiZWVuIHJlY29yZGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRpcC5wbGFuTW9kZSB3aGVuIFBsYW4gbW9kZSBoYXMgYmVlbiB1c2VkIGluIHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCB0aXAgPSBjcmVhdGVNb2NrVGlwKHtcblx0XHRcdGlkOiAndGlwLnBsYW5Nb2RlJyxcblx0XHRcdGV4Y2x1ZGVXaGVuTW9kZXNVc2VkOiBbJ1BsYW4nXSxcblx0XHR9KTtcblxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5rZXksICdQbGFuJyk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBleGNsdWRlZCBiZWZvcmUgbW9kZSBpcyByZWNvcmRlZCcpO1xuXG5cdFx0dHJhY2tlci5yZWNvcmRDdXJyZW50TW9kZShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIHRydWUsICdTaG91bGQgYmUgZXhjbHVkZWQgYWZ0ZXIgUGxhbiBtb2RlIGhhcyBiZWVuIHJlY29yZGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRpcC5wbGFuTW9kZSB3aGVuIG9wZW4gcGxhbiBjb21tYW5kIGhhcyBiZWVuIGV4ZWN1dGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAucGxhbk1vZGUnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuUGxhbiddLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmV2ZW50LCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCBmYWxzZSwgJ1Nob3VsZCBub3QgYmUgZXhjbHVkZWQgYmVmb3JlIGNvbW1hbmQgaXMgZXhlY3V0ZWQnKTtcblxuXHRcdGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZSh7IGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuUGxhbicsIGFyZ3M6IFtdIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnU2hvdWxkIGJlIGV4Y2x1ZGVkIGFmdGVyIG9wZW4gcGxhbiBjb21tYW5kIGlzIGV4ZWN1dGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIGNvbW1hbmQgZXhjbHVzaW9ucyB0byB3b3Jrc3BhY2Ugc3RvcmFnZSBhY3Jvc3MgdHJhY2tlciBpbnN0YW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC51bmRvQ2hhbmdlcycsXG5cdFx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc3RvcmVDaGVja3BvaW50J10sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFja2VyMSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmV2ZW50LCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0Y29tbWFuZEV4ZWN1dGVkRW1pdHRlci5maXJlKHsgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc3RvcmVDaGVja3BvaW50JywgYXJnczogW10gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIxLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSk7XG5cblx0XHQvLyBTZWNvbmQgdHJhY2tlciByZWFkcyBmcm9tIHN0b3JhZ2UgXHUyMDE0IHNob3VsZCBiZSBleGNsdWRlZCBpbW1lZGlhdGVseVxuXHRcdGNvbnN0IHRyYWNrZXIyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlcjIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnTmV3IHRyYWNrZXIgc2hvdWxkIHJlYWQgcGVyc2lzdGVkIGV4Y2x1c2lvbiBmcm9tIHdvcmtzcGFjZSBzdG9yYWdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIG1vZGUgZXhjbHVzaW9ucyB0byB3b3Jrc3BhY2Ugc3RvcmFnZSBhY3Jvc3MgdHJhY2tlciBpbnN0YW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5hZ2VudE1vZGUnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Nb2Rlc1VzZWQ6IFtDaGF0TW9kZUtpbmQuQWdlbnRdLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmtleSwgJ0FnZW50Jyk7XG5cblx0XHRjb25zdCB0cmFja2VyMSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0dHJhY2tlcjEucmVjb3JkQ3VycmVudE1vZGUoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyMS5pc0V4Y2x1ZGVkKHRpcCksIHRydWUpO1xuXG5cdFx0Ly8gU2Vjb25kIHRyYWNrZXIgcmVhZHMgZnJvbSBzdG9yYWdlIFx1MjAxNCBzaG91bGQgYmUgZXhjbHVkZWQgaW1tZWRpYXRlbHlcblx0XHRjb25zdCB0cmFja2VyMiA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ05ldyB0cmFja2VyIHNob3VsZCByZWFkIHBlcnNpc3RlZCBtb2RlIGV4Y2x1c2lvbiBmcm9tIHdvcmtzcGFjZSBzdG9yYWdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW9yaXRpemVzIGZvdW5kYXRpb25hbCB0aXBzIG92ZXIgUW9MIHRpcHMgd2hlbiBib3RoIGFyZSBlbGlnaWJsZScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5rZXksICdBZ2VudCcpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5vayh0aXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXAuaWQsICd0aXAucGxhbk1vZGUnLCAnRXhwZWN0ZWQgZm91bmRhdGlvbmFsIHRpcCB0byBiZSBwcmlvcml0aXplZCBiZWZvcmUgZWxpZ2libGUgUW9MIHRpcHMnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgdGlwLnBsYW5Nb2RlIHdoZW4gUGxhbiBtb2RlIGlzIG5vdCBhdmFpbGFibGUgaW4gdGhlIGN1cnJlbnQgd2lkZ2V0JywgKCkgPT4ge1xuXHRcdGN1cnJlbnRDaGF0TW9kZXMgPSBjcmVhdGVNb2NrQ2hhdE1vZGVzKFtdLCBbXSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnQWdlbnQnKTtcblxuXHRcdGFzc2VydFRpcE5ldmVyU2hvd24oc2VydmljZSwgJ3RpcC5wbGFuTW9kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aXAucGxhbk1vZGUgdXNlcyB0aGUgc3RhYmxlIG9wZW4gY2hhdCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmtleSwgJ0FnZW50Jyk7XG5cblx0XHRjb25zdCB0aXAgPSBmaW5kVGlwQnlJZChzZXJ2aWNlLCAndGlwLnBsYW5Nb2RlJyk7XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQub2sodGlwLmVuYWJsZWRDb21tYW5kcz8uaW5jbHVkZXMoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuJykpO1xuXHRcdGFzc2VydC5vayghdGlwLmVuYWJsZWRDb21tYW5kcz8uaW5jbHVkZXMoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuUGxhbicpKTtcblx0fSk7XG5cblx0dGVzdCgncHJpb3JpdGl6ZXMgcHJlZmVycmVkIG9uYm9hcmRpbmcgdGlwcyBpbiByZXF1ZXN0ZWQgb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnQWdlbnQnKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJ2F1dG8nKTtcblxuXHRcdGNvbnN0IHNlZW46IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcblx0XHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRcdHNlZW4ucHVzaCh0aXAuaWQpO1xuXHRcdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWVuLCBbJ3RpcC5wbGFuTW9kZScsICd0aXAuY3JlYXRlQWdlbnQnLCAndGlwLmNyZWF0ZVNraWxsJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb21pemVzIFFvTCB0aXBzIHdoZW4gbm8gZm91bmRhdGlvbmFsIHRpcHMgYXJlIGVsaWdpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbW9kZUtpbmRLZXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29uc3QgbW9kZU5hbWVLZXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8c3RyaW5nPihDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmtleSwgJ1BsYW4nKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksICdjbG91ZCcpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnYXV0bycpO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxSYW5kb20gPSBNYXRoLnJhbmRvbTtcblx0XHR0cnkge1xuXHRcdFx0TWF0aC5yYW5kb20gPSAoKSA9PiAwO1xuXHRcdFx0Y29uc3QgZmlyc3RUaXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0XHRzZXJ2aWNlLnJlc2V0U2Vzc2lvbigpO1xuXG5cdFx0XHRNYXRoLnJhbmRvbSA9ICgpID0+IDAuOTk5OTtcblx0XHRcdGNvbnN0IHNlY29uZFRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5vayhmaXJzdFRpcCk7XG5cdFx0XHRhc3NlcnQub2soc2Vjb25kVGlwKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChmaXJzdFRpcC5pZCwgc2Vjb25kVGlwLmlkLCAnRXhwZWN0ZWQgZGlmZmVyZW50IFFvTCB0aXBzIGZvciBkaWZmZXJlbnQgcmFuZG9tIHZhbHVlcycpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZpcnN0VGlwLmlkLCAndGlwLnBsYW5Nb2RlJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc2Vjb25kVGlwLmlkLCAndGlwLnBsYW5Nb2RlJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdE1hdGgucmFuZG9tID0gb3JpZ2luYWxSYW5kb207XG5cdFx0XHRtb2RlS2luZEtleS5zZXQoQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRcdG1vZGVOYW1lS2V5LnNldCgnUGxhbicpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVzZXRTZXNzaW9uIHJlZXZhbHVhdGVzIGZvdW5kYXRpb25hbCB0aXBzIGZvciB0aGUgbmV4dCBjaGF0IHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBtb2RlS2luZEtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRjb25zdCBtb2RlTmFtZUtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxzdHJpbmc+KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnUGxhbicpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlS2V5ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PHN0cmluZz4oQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksICdjbG91ZCcpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnYXV0bycpO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxSYW5kb20gPSBNYXRoLnJhbmRvbTtcblx0XHR0cnkge1xuXHRcdFx0TWF0aC5yYW5kb20gPSAoKSA9PiAwLjk5OTk7XG5cdFx0XHRjb25zdCBxb2xUaXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHFvbFRpcCk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocW9sVGlwLmlkLCAndGlwLnBsYW5Nb2RlJyk7XG5cblx0XHRcdHNlcnZpY2UucmVzZXRTZXNzaW9uKCk7XG5cdFx0XHRtb2RlTmFtZUtleS5zZXQoJ0FnZW50Jyk7XG5cdFx0XHRzZXNzaW9uVHlwZUtleS5zZXQobG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXG5cdFx0XHRjb25zdCBmb3VuZGF0aW9uYWxUaXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZvdW5kYXRpb25hbFRpcCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRhdGlvbmFsVGlwLmlkLCAndGlwLmNyZWF0ZUFnZW50JywgJ0V4cGVjdGVkIGZvdW5kYXRpb25hbCBvcmRlcmluZyB0byByZXN0YXJ0IG9uIG5ldyBjaGF0IHNlc3Npb24nKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0TWF0aC5yYW5kb20gPSBvcmlnaW5hbFJhbmRvbTtcblx0XHRcdG1vZGVLaW5kS2V5LnNldChDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVzZXRTZXNzaW9uIGFsbG93cyBhIG5ldyB3ZWxjb21lIHRpcCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgdGlwMSA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcDEsICdTaG91bGQgZ2V0IGEgd2VsY29tZSB0aXAnKTtcblxuXHRcdHNlcnZpY2UucmVzZXRTZXNzaW9uKCk7XG5cblx0XHRjb25zdCB0aXAyID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwMiwgJ1Nob3VsZCBnZXQgYSB3ZWxjb21lIHRpcCBhZnRlciByZXNldFNlc3Npb24nKTtcblx0fSk7XG5cblx0dGVzdCgnUGxhbiB0aXAgaXMgZXhjbHVkZWQgYWZ0ZXIgc3dpdGNoaW5nIHRvIFBsYW4gbW9kZSBkdXJpbmcgc3RhYmxlIHJlcmVuZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Ly8gU3RhcnQgaW4gQWdlbnQgbW9kZSBcdTIwMTQgUGxhbiB0aXAgc2hvdWxkIGJlIGVsaWdpYmxlXG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGNvbnN0IG1vZGVOYW1lS2V5ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PHN0cmluZz4oQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5rZXksICdBZ2VudCcpO1xuXG5cdFx0YXNzZXJ0Lm9rKGZpbmRUaXBCeUlkKHNlcnZpY2UsICd0aXAucGxhbk1vZGUnKSwgJ1BsYW4gdGlwIHNob3VsZCBiZSBzaG93biB3aGVuIGluIEFnZW50IG1vZGUnKTtcblxuXHRcdC8vIFNpbXVsYXRlIHVzZXIgc3dpdGNoaW5nIHRvIFBsYW4gbW9kZSAoY29udGV4dCBrZXlzIHVwZGF0ZSwgd2lkZ2V0IHJlcmVuZGVycylcblx0XHRtb2RlTmFtZUtleS5zZXQoJ1BsYW4nKTtcblxuXHRcdC8vIFN0YWJsZSByZXJlbmRlciBcdTIwMTQgZ2V0V2VsY29tZVRpcCBpcyBjYWxsZWQgYWdhaW4gd2l0aG91dCByZXNldFNlc3Npb25cblx0XHRjb25zdCByZXJlbmRlclRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXJlbmRlclRpcCB8fCByZXJlbmRlclRpcC5pZCAhPT0gJ3RpcC5wbGFuTW9kZScsICdQbGFuIHRpcCBzaG91bGQgbm90IGJlIHNob3duIGFmdGVyIHN3aXRjaGluZyB0byBQbGFuIG1vZGUnKTtcblxuXHRcdC8vIE5ldyBzZXNzaW9uIGluIEFnZW50IG1vZGUgXHUyMDE0IFBsYW4gdGlwIG11c3QgTk9UIHJlYXBwZWFyXG5cdFx0c2VydmljZS5yZXNldFNlc3Npb24oKTtcblx0XHRtb2RlTmFtZUtleS5zZXQoJ0FnZW50Jyk7XG5cblx0XHRhc3NlcnRUaXBOZXZlclNob3duKHNlcnZpY2UsICd0aXAucGxhbk1vZGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgdGlwIHdoZW4gdHJhY2tlZCB0b29sIGhhcyBiZWVuIGludm9rZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9ja1Rvb2xzU2VydmljZSA9IGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKTtcblx0XHRjb25zdCB0aXAgPSBjcmVhdGVNb2NrVGlwKHtcblx0XHRcdGlkOiAndGlwLm1lcm1haWQnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Ub29sc0ludm9rZWQ6IFsncmVuZGVyTWVybWFpZERpYWdyYW0nXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRtb2NrVG9vbHNTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBleGNsdWRlZCBiZWZvcmUgdG9vbCBpcyBpbnZva2VkJyk7XG5cblx0XHRtb2NrVG9vbHNTZXJ2aWNlLmZpcmVPbkRpZEludm9rZVRvb2woeyB0b29sSWQ6ICdyZW5kZXJNZXJtYWlkRGlhZ3JhbScsIHNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkLCByZXF1ZXN0SWQ6IHVuZGVmaW5lZCwgc3ViYWdlbnRJbnZvY2F0aW9uSWQ6IHVuZGVmaW5lZCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ1Nob3VsZCBiZSBleGNsdWRlZCBhZnRlciB0b29sIGlzIGludm9rZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdHMgdG9vbCBleGNsdXNpb25zIHRvIHdvcmtzcGFjZSBzdG9yYWdlIGFjcm9zcyB0cmFja2VyIGluc3RhbmNlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2NrVG9vbHNTZXJ2aWNlID0gY3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpO1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuc3ViYWdlbnRzJyxcblx0XHRcdGV4Y2x1ZGVXaGVuVG9vbHNJbnZva2VkOiBbJ3J1blN1YmFnZW50J10sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFja2VyMSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdG1vY2tUb29sc1NlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdG1vY2tUb29sc1NlcnZpY2UuZmlyZU9uRGlkSW52b2tlVG9vbCh7IHRvb2xJZDogJ3J1blN1YmFnZW50Jywgc2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQsIHJlcXVlc3RJZDogdW5kZWZpbmVkLCBzdWJhZ2VudEludm9jYXRpb25JZDogdW5kZWZpbmVkIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyMS5pc0V4Y2x1ZGVkKHRpcCksIHRydWUpO1xuXG5cdFx0Ly8gU2Vjb25kIHRyYWNrZXIgcmVhZHMgZnJvbSBzdG9yYWdlIFx1MjAxNCBzaG91bGQgYmUgZXhjbHVkZWQgaW1tZWRpYXRlbHlcblx0XHRjb25zdCB0cmFja2VyMiA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ05ldyB0cmFja2VyIHNob3VsZCByZWFkIHBlcnNpc3RlZCB0b29sIGV4Y2x1c2lvbiBmcm9tIHdvcmtzcGFjZSBzdG9yYWdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRpcC5za2lsbCB3aGVuIHNraWxsIGZpbGVzIGV4aXN0IGluIHdvcmtzcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0aXAgPSBjcmVhdGVNb2NrVGlwKHtcblx0XHRcdGlkOiAndGlwLnNraWxsJyxcblx0XHRcdGV4Y2x1ZGVXaGVuUHJvbXB0RmlsZXNFeGlzdDogeyBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZShbXSwgW3sgdXJpOiBVUkkuZmlsZSgnLy5naXRodWIvc2tpbGxzL215LXNraWxsLnNraWxsLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9XSkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgYXN5bmMgZmlsZSBjaGVjayB0byBjb21wbGV0ZVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIHRydWUsICdTaG91bGQgYmUgZXhjbHVkZWQgd2hlbiBza2lsbCBmaWxlcyBleGlzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBleGNsdWRlIHRpcC5za2lsbCB3aGVuIG5vIHNraWxsIGZpbGVzIGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuc2tpbGwnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Qcm9tcHRGaWxlc0V4aXN0OiB7IHByb21wdFR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgYXN5bmMgZmlsZSBjaGVjayB0byBjb21wbGV0ZVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBleGNsdWRlZCB3aGVuIG5vIHNraWxsIGZpbGVzIGV4aXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIGFsbCBjcmVhdGUgc2xhc2ggY29tbWFuZCB0aXBzIGluIGxvY2FsIGNoYXQgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkQ3JlYXRlVGlwcyA9IG5ldyBTZXQoWyd0aXAuaW5pdCcsICd0aXAuY3JlYXRlUHJvbXB0JywgJ3RpcC5jcmVhdGVBZ2VudCcsICd0aXAuY3JlYXRlU2tpbGwnXSk7XG5cdFx0Y29uc3Qgc2VlbkNyZWF0ZVRpcHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0aWYgKCF0aXApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXhwZWN0ZWRDcmVhdGVUaXBzLmhhcyh0aXAuaWQpKSB7XG5cdFx0XHRcdHNlZW5DcmVhdGVUaXBzLmFkZCh0aXAuaWQpO1xuXHRcdFx0XHRpZiAoc2VlbkNyZWF0ZVRpcHMuc2l6ZSA9PT0gZXhwZWN0ZWRDcmVhdGVUaXBzLnNpemUpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2VlbkNyZWF0ZVRpcHNdLnNvcnQoKSwgWy4uLmV4cGVjdGVkQ3JlYXRlVGlwc10uc29ydCgpKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc2hvdyBjcmVhdGUgc2xhc2ggY29tbWFuZCB0aXBzIGluIG5vbi1sb2NhbCBjaGF0IHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUua2V5LCAnY2xvdWQnKTtcblx0XHRjb25zdCBjcmVhdGVUaXBJZHMgPSBuZXcgU2V0KFsndGlwLmluaXQnLCAndGlwLmNyZWF0ZVByb21wdCcsICd0aXAuY3JlYXRlQWdlbnQnLCAndGlwLmNyZWF0ZVNraWxsJ10pO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDA7IGkrKykge1xuXHRcdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGlmICghdGlwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0Lm9rKCFjcmVhdGVUaXBJZHMuaGFzKHRpcC5pZCksICdTaG91bGQgbm90IHNob3cgY3JlYXRlIHNsYXNoIGNvbW1hbmQgdGlwcyBpbiBub24tbG9jYWwgc2Vzc2lvbnMnKTtcblx0XHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc2hvdyBjcmVhdGUgcHJvbXB0IHRpcCB3aGVuIGNyZWF0ZSBwcm9tcHQgd2FzIGFscmVhZHkgdXNlZCcsICgpID0+IHtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2hhdC50aXBzLmV4ZWN1dGVkQ29tbWFuZHMnLCBKU09OLnN0cmluZ2lmeShbQ1JFQVRFX1BST01QVF9UUkFDS0lOR19DT01NQU5EXSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDA7IGkrKykge1xuXHRcdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGlmICghdGlwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRpcC5pZCwgJ3RpcC5jcmVhdGVQcm9tcHQnLCAnU2hvdWxkIG5vdCBzaG93IHRpcC5jcmVhdGVQcm9tcHQgd2hlbiBjcmVhdGUtcHJvbXB0IHdhcyB1c2VkJyk7XG5cdFx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblx0XHR9XG5cdH0pO1xuXG5cblx0ZnVuY3Rpb24gZmluZFRpcEJ5SWQoc2VydmljZTogQ2hhdFRpcFNlcnZpY2UsIHRpcElkOiBzdHJpbmcsIGNrU2VydmljZTogTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmcgPSBjb250ZXh0S2V5U2VydmljZSk6IElDaGF0VGlwIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY2tTZXJ2aWNlKTtcblx0XHRcdGlmICghdGlwKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGlwLmlkID09PSB0aXBJZCkge1xuXHRcdFx0XHRyZXR1cm4gdGlwO1xuXHRcdFx0fVxuXHRcdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRUaXBOZXZlclNob3duKHNlcnZpY2U6IENoYXRUaXBTZXJ2aWNlLCB0aXBJZDogc3RyaW5nLCBja1NlcnZpY2U6IE1vY2tDb250ZXh0S2V5U2VydmljZVdpdGhSdWxlc01hdGNoaW5nID0gY29udGV4dEtleVNlcnZpY2UpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY2tTZXJ2aWNlKTtcblx0XHRcdGlmICghdGlwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRpcC5pZCwgdGlwSWQsIGAke3RpcElkfSBzaG91bGQgbm90IGJlIHNob3duYCk7XG5cdFx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblx0XHR9XG5cdH1cblxuXHRmb3IgKGNvbnN0IHsgdGlwSWQsIHNldHRpbmdLZXkgfSBvZiBbXG5cdFx0eyB0aXBJZDogJ3RpcC50aGlua2luZ1BocmFzZXMnLCBzZXR0aW5nS2V5OiAnY2hhdC5hZ2VudC50aGlua2luZy5waHJhc2VzJyB9LFxuXHRdKSB7XG5cdFx0dGVzdChgc2hvd3MgJHt0aXBJZH0gd2l0aCBjb3JyZWN0IHNldHRpbmcgbGluayB3aGVuIHNldHRpbmcgaXMgYXQgZGVmYXVsdGAsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHF1ZXVlTWljcm90YXNrKHIpKTtcblxuXHRcdFx0Y29uc3QgdGlwID0gZmluZFRpcEJ5SWQoc2VydmljZSwgdGlwSWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpcCwgYFNob3VsZCBzaG93ICR7dGlwSWR9IHdoZW4gc2V0dGluZyBpcyBhdCBkZWZhdWx0YCk7XG5cdFx0XHRhc3NlcnQub2sodGlwLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoc2V0dGluZ0tleSksIGBUaXAgc2hvdWxkIHJlZmVyZW5jZSAke3NldHRpbmdLZXl9YCk7XG5cdFx0XHRhc3NlcnQub2sodGlwLmVuYWJsZWRDb21tYW5kcz8uaW5jbHVkZXMoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJyksICdUaXAgc2hvdWxkIGVuYWJsZSB0aGUgb3BlblNldHRpbmdzIGNvbW1hbmQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoYGV4Y2x1ZGVzICR7dGlwSWR9IHdoZW4gc2V0dGluZyBoYXMgYmVlbiBjaGFuZ2VkIGZyb20gZGVmYXVsdGAsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKHNldHRpbmdLZXksICdjaGFuZ2VkJyk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiBxdWV1ZU1pY3JvdGFzayhyKSk7XG5cblx0XHRcdGFzc2VydFRpcE5ldmVyU2hvd24oc2VydmljZSwgdGlwSWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0Zm9yIChjb25zdCB0aXBJZCBvZiBbXG5cdFx0J3RpcC50aGlua2luZ1BocmFzZXMnLFxuXHRdKSB7XG5cdFx0dGVzdChgZGlzbWlzc2VzICR7dGlwSWR9IGFmdGVyIGNsaWNraW5nIGl0cyBzZXR0aW5ncyBsaW5rYCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gcXVldWVNaWNyb3Rhc2socikpO1xuXG5cdFx0XHRjb25zdCB0aXAgPSBmaW5kVGlwQnlJZChzZXJ2aWNlLCB0aXBJZCk7XG5cdFx0XHRhc3NlcnQub2sodGlwLCBgU2hvdWxkIHNob3cgJHt0aXBJZH0gYmVmb3JlIGNvbW1hbmQgY2xpY2tgKTtcblxuXHRcdFx0bGV0IGRpc21pc3NlZCA9IGZhbHNlO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkRGlzbWlzc1RpcCgoKSA9PiB7XG5cdFx0XHRcdGRpc21pc3NlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZSh7IGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgYXJnczogW10gfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNtaXNzZWQsIHRydWUsIGAke3RpcElkfSBzaG91bGQgZGlzbWlzcyB3aGVuIGl0cyBzZXR0aW5ncyBjb21tYW5kIGlzIGNsaWNrZWRgKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpPy5pZCwgdGlwSWQsIGAke3RpcElkfSBzaG91bGQgbm90IGJlIHNob3duIGFnYWluIGFmdGVyIGFjdGlvbmluZyBpdHMgY29tbWFuZCBsaW5rYCk7XG5cblx0XHRcdGNvbnN0IG5leHRTZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0YXNzZXJ0VGlwTmV2ZXJTaG93bihuZXh0U2VydmljZSwgdGlwSWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0Zm9yIChjb25zdCB0aXBJZCBvZiBbXG5cdFx0J3RpcC5hdXRvQWNjZXB0RGVsYXknLFxuXHRcdCd0aXAuY29kZUFjdGlvbnMnLFxuXHRdKSB7XG5cdFx0dGVzdChgZXhjbHVkZXMgJHt0aXBJZH0gaW4gdGhlIEFnZW50cyB3aW5kb3dgLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LmtleSwgdHJ1ZSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHF1ZXVlTWljcm90YXNrKHIpKTtcblxuXHRcdFx0YXNzZXJ0VGlwTmV2ZXJTaG93bihzZXJ2aWNlLCB0aXBJZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KGBzaG93cyAke3RpcElkfSBvdXRzaWRlIHRoZSBBZ2VudHMgd2luZG93YCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShJc1Nlc3Npb25zV2luZG93Q29udGV4dC5rZXksIGZhbHNlKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gcXVldWVNaWNyb3Rhc2socikpO1xuXG5cdFx0XHRjb25zdCB0aXAgPSBmaW5kVGlwQnlJZChzZXJ2aWNlLCB0aXBJZCk7XG5cdFx0XHRhc3NlcnQub2sodGlwLCBgU2hvdWxkIHNob3cgJHt0aXBJZH0gb3V0c2lkZSB0aGUgQWdlbnRzIHdpbmRvd2ApO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnZGlzbWlzc2VzIGNyZWF0ZVByb21wdCB0aXAgYWZ0ZXIgY2xpY2tpbmcgaXRzIGNvbW1hbmQgbGluaycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXG5cdFx0Y29uc3QgdGlwID0gZmluZFRpcEJ5SWQoc2VydmljZSwgJ3RpcC5jcmVhdGVQcm9tcHQnKTtcblx0XHRhc3NlcnQub2sodGlwLCAnU2hvdWxkIHNob3cgdGlwLmNyZWF0ZVByb21wdCBiZWZvcmUgY29tbWFuZCBjbGljaycpO1xuXHRcdGFzc2VydC5vayh0aXAuZW5hYmxlZENvbW1hbmRzPy5pbmNsdWRlcyhHRU5FUkFURV9QUk9NUFRfQ09NTUFORF9JRCksICdUaXAgc2hvdWxkIGVuYWJsZSB0aGUgY3JlYXRlIHByb21wdCBjb21tYW5kJyk7XG5cblx0XHRjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmZpcmUoeyBjb21tYW5kSWQ6IEdFTkVSQVRFX1BST01QVF9DT01NQU5EX0lELCBhcmdzOiBbXSB9KTtcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpPy5pZCwgJ3RpcC5jcmVhdGVQcm9tcHQnLCAndGlwLmNyZWF0ZVByb21wdCBzaG91bGQgbm90IGJlIHNob3duIGFnYWluIGFmdGVyIGFjdGlvbmluZyBpdHMgY29tbWFuZCBsaW5rJyk7XG5cblx0XHRjb25zdCBuZXh0U2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhc3NlcnRUaXBOZXZlclNob3duKG5leHRTZXJ2aWNlLCAndGlwLmNyZWF0ZVByb21wdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2dzIHRlbGVtZXRyeSB3aGVuIHRpcCBpcyBzaG93bicsICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdC4uLk51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJVGVsZW1ldHJ5U2VydmljZT4gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0Y29uc3Qgc2hvd25FdmVudHMgPSBldmVudHMuZmlsdGVyKGUgPT4gZS5kYXRhLmFjdGlvbiA9PT0gJ3Nob3duJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3duRXZlbnRzLmxlbmd0aCwgMSwgJ1Nob3VsZCBsb2cgZXhhY3RseSBvbmUgc2hvd24gZXZlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvd25FdmVudHNbMF0uZXZlbnROYW1lLCAnY2hhdFRpcCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG93bkV2ZW50c1swXS5kYXRhLnRpcElkLCB0aXAuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2dzIHRlbGVtZXRyeSB3aGVuIHRpcCBpcyBkaXNtaXNzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiB7IGV2ZW50TmFtZTogc3RyaW5nOyBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9W10gPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHQuLi5OdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHRcdFx0fSxcblx0XHR9IGFzIFBhcnRpYWw8SVRlbGVtZXRyeVNlcnZpY2U+IGFzIElUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwKTtcblxuXHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXG5cdFx0Y29uc3QgZGlzbWlzc0V2ZW50cyA9IGV2ZW50cy5maWx0ZXIoZSA9PiBlLmRhdGEuYWN0aW9uID09PSAnZGlzbWlzc2VkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc21pc3NFdmVudHMubGVuZ3RoLCAxLCAnU2hvdWxkIGxvZyBleGFjdGx5IG9uZSBkaXNtaXNzZWQgZXZlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzbWlzc0V2ZW50c1swXS5kYXRhLnRpcElkLCB0aXAuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2dzIHRlbGVtZXRyeSB3aGVuIG5hdmlnYXRpbmcgdGlwcycsICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdC4uLk51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJVGVsZW1ldHJ5U2VydmljZT4gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0Y29uc3QgbmV4dFRpcCA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHRhc3NlcnQub2sobmV4dFRpcCk7XG5cblx0XHRjb25zdCBuYXZpZ2F0ZUV2ZW50cyA9IGV2ZW50cy5maWx0ZXIoZSA9PiBlLmRhdGEuYWN0aW9uID09PSAnbmF2aWdhdGVOZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRlRXZlbnRzLmxlbmd0aCwgMSwgJ1Nob3VsZCBsb2cgb25lIG5hdmlnYXRlTmV4dCBldmVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0ZUV2ZW50c1swXS5kYXRhLnRpcElkLCB0aXAuaWQsICduYXZpZ2F0ZU5leHQgc2hvdWxkIGxvZyB0aGUgdGlwIGJlaW5nIG5hdmlnYXRlZCBhd2F5IGZyb20nKTtcblxuXHRcdGNvbnN0IHNob3duRXZlbnRzID0gZXZlbnRzLmZpbHRlcihlID0+IGUuZGF0YS5hY3Rpb24gPT09ICdzaG93bicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG93bkV2ZW50cy5sZW5ndGgsIDIsICdTaG91bGQgbG9nIHNob3duIGZvciBpbml0aWFsIGFuZCBuYXZpZ2F0ZWQgdGlwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3duRXZlbnRzWzFdLmRhdGEudGlwSWQsIG5leHRUaXAuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2dzIHRlbGVtZXRyeSB3aGVuIHRpcCBjb21tYW5kIGlzIGNsaWNrZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiB7IGV2ZW50TmFtZTogc3RyaW5nOyBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9W10gPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHQuLi5OdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHRcdFx0fSxcblx0XHR9IGFzIFBhcnRpYWw8SVRlbGVtZXRyeVNlcnZpY2U+IGFzIElUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwKTtcblxuXHRcdGlmICh0aXAuZW5hYmxlZENvbW1hbmRzPy5sZW5ndGgpIHtcblx0XHRcdGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZSh7IGNvbW1hbmRJZDogdGlwLmVuYWJsZWRDb21tYW5kc1swXSwgYXJnczogW10gfSk7XG5cblx0XHRcdGNvbnN0IGNsaWNrRXZlbnRzID0gZXZlbnRzLmZpbHRlcihlID0+IGUuZGF0YS5hY3Rpb24gPT09ICdjb21tYW5kQ2xpY2tlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWNrRXZlbnRzLmxlbmd0aCwgMSwgJ1Nob3VsZCBsb2cgb25lIGNvbW1hbmRDbGlja2VkIGV2ZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpY2tFdmVudHNbMF0uZGF0YS50aXBJZCwgdGlwLmlkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGlja0V2ZW50c1swXS5kYXRhLmNvbW1hbmRJZCwgdGlwLmVuYWJsZWRDb21tYW5kc1swXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCdUaXAgaGFzIG5vIGVuYWJsZWQgY29tbWFuZHM7IGNhbm5vdCB0ZXN0IGNvbW1hbmQgY2xpY2sgdGVsZW1ldHJ5Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdsb2dzIHRlbGVtZXRyeSB3aGVuIHRpcCBpcyBoaWRkZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiB7IGV2ZW50TmFtZTogc3RyaW5nOyBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9W10gPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHQuLi5OdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHRcdFx0fSxcblx0XHR9IGFzIFBhcnRpYWw8SVRlbGVtZXRyeVNlcnZpY2U+IGFzIElUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwKTtcblxuXHRcdHNlcnZpY2UuaGlkZVRpcCgpO1xuXG5cdFx0Y29uc3QgaGlkZGVuRXZlbnRzID0gZXZlbnRzLmZpbHRlcihlID0+IGUuZGF0YS5hY3Rpb24gPT09ICdoaWRkZW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlkZGVuRXZlbnRzLmxlbmd0aCwgMSwgJ1Nob3VsZCBsb2cgb25lIGhpZGRlbiBldmVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaWRkZW5FdmVudHNbMF0uZGF0YS50aXBJZCwgdGlwLmlkKTtcblx0fSk7XG5cblx0dGVzdCgnbG9ncyB0ZWxlbWV0cnkgd2hlbiB0aXBzIGFyZSBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdC4uLk51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJVGVsZW1ldHJ5U2VydmljZT4gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kaXNhYmxlVGlwcygpO1xuXG5cdFx0Y29uc3QgZGlzYWJsZWRFdmVudHMgPSBldmVudHMuZmlsdGVyKGUgPT4gZS5kYXRhLmFjdGlvbiA9PT0gJ2Rpc2FibGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2FibGVkRXZlbnRzLmxlbmd0aCwgMSwgJ1Nob3VsZCBsb2cgb25lIGRpc2FibGVkIGV2ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2FibGVkRXZlbnRzWzBdLmRhdGEudGlwSWQsIHRpcC5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoaW5raW5nIHBocmFzZXMgZXZlci1tb2RpZmllZCBzZWVkIGNoZWNrcyB3b3Jrc3BhY2VWYWx1ZScsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IG9yaWdpbmFsSW5zcGVjdCA9IHdvcmtzcGFjZUNvbmZpZ1NlcnZpY2UuaW5zcGVjdC5iaW5kKHdvcmtzcGFjZUNvbmZpZ1NlcnZpY2UpO1xuXHRcdHdvcmtzcGFjZUNvbmZpZ1NlcnZpY2UuaW5zcGVjdCA9IDxUPihrZXk6IHN0cmluZywgb3ZlcnJpZGVzPzogYW55KSA9PiB7XG5cdFx0XHRpZiAoa2V5ID09PSAnY2hhdC5hZ2VudC50aGlua2luZy5waHJhc2VzJykge1xuXHRcdFx0XHRyZXR1cm4geyAuLi5vcmlnaW5hbEluc3BlY3Qoa2V5LCBvdmVycmlkZXMpLCB1c2VyVmFsdWU6IHVuZGVmaW5lZCwgdXNlckxvY2FsVmFsdWU6IHVuZGVmaW5lZCwgd29ya3NwYWNlVmFsdWU6ICdjb21wYWN0JyB9IGFzIHVua25vd24gYXMgVDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBvcmlnaW5hbEluc3BlY3Qoa2V5LCBvdmVycmlkZXMpO1xuXHRcdH07XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSB3b3Jrc3BhY2VDb25maWdTZXJ2aWNlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblxuXHRcdGFzc2VydFRpcE5ldmVyU2hvd24oc2VydmljZSwgJ3RpcC50aGlua2luZ1BocmFzZXMnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc2hvdyB0aXAudGhpbmtpbmdQaHJhc2VzIHdoZW4gcHJldmlvdXMgbW9kaWZpY2F0aW9uIGlzIHBlcnNpc3RlZCcsICgpID0+IHtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2hhdC50aXAudGhpbmtpbmdQaHJhc2VzRXZlck1vZGlmaWVkJywgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cblx0XHRhc3NlcnRUaXBOZXZlclNob3duKHNlcnZpY2UsICd0aXAudGhpbmtpbmdQaHJhc2VzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLWNoZWNrcyBhZ2VudCBmaWxlIGV4Y2x1c2lvbiB3aGVuIG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzIGZpcmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50Q2hhbmdlRW1pdHRlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0bGV0IGFnZW50RmlsZXM6IElQcm9tcHRQYXRoW10gPSBbXTtcblxuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuY3VzdG9tQWdlbnQnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Qcm9tcHRGaWxlc0V4aXN0OiB7IHByb21wdFR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBleGNsdWRlVW50aWxDaGVja2VkOiB0cnVlIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKFtdLCBbXSwge1xuXHRcdFx0XHRvbkRpZENoYW5nZUN1c3RvbUFnZW50czogYWdlbnRDaGFuZ2VFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRsaXN0UHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IGFnZW50RmlsZXMsXG5cdFx0XHR9KSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdC8vIEluaXRpYWwgY2hlY2s6IG5vIGFnZW50IGZpbGVzLCBidXQgZXhjbHVkZVVudGlsQ2hlY2tlZCBtZWFucyBleGNsdWRlZCBmaXJzdFxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCBmYWxzZSwgJ1Nob3VsZCBub3QgYmUgZXhjbHVkZWQgYWZ0ZXIgaW5pdGlhbCBjaGVjayBmaW5kcyBubyBmaWxlcycpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYWdlbnQgZmlsZXMgYXBwZWFyaW5nXG5cdFx0YWdlbnRGaWxlcyA9IFt7IHVyaTogVVJJLmZpbGUoJy8uZ2l0aHViL2FnZW50cy9teS1hZ2VudC5hZ2VudC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQgfV07XG5cdFx0YWdlbnRDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnU2hvdWxkIGJlIGV4Y2x1ZGVkIGFmdGVyIG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzIGZpcmVzIGFuZCBhZ2VudCBmaWxlcyBleGlzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoUHJvbXB0RmlsZUV4Y2x1c2lvbnMgcmUtY2hlY2tzIGluc3RydWN0aW9uIGZpbGVzIGFmdGVyIHN0YXJ0dXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGluc3RydWN0aW9uRmlsZXM6IElQcm9tcHRQYXRoW10gPSBbXTtcblxuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuY3VzdG9tSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdGV4Y2x1ZGVXaGVuUHJvbXB0RmlsZXNFeGlzdDogeyBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGFnZW50RmlsZVR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5jb3BpbG90SW5zdHJ1Y3Rpb25zTWQsIGV4Y2x1ZGVVbnRpbENoZWNrZWQ6IHRydWUgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoW10sIFtdLCB7XG5cdFx0XHRcdGxpc3RQcm9tcHRGaWxlczogYXN5bmMgKCkgPT4gaW5zdHJ1Y3Rpb25GaWxlcyxcblx0XHRcdH0pIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBleGNsdWRlZCBhZnRlciBpbml0aWFsIGNoZWNrIGZpbmRzIG5vIGZpbGVzJyk7XG5cblx0XHRpbnN0cnVjdGlvbkZpbGVzID0gW3sgdXJpOiBVUkkuZmlsZSgnLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2NvZGluZy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XTtcblx0XHR0cmFja2VyLnJlZnJlc2hQcm9tcHRGaWxlRXhjbHVzaW9ucygpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIHRydWUsICdTaG91bGQgYmUgZXhjbHVkZWQgYWZ0ZXIgcmVmcmVzaCBmaW5kcyBpbnN0cnVjdGlvbiBmaWxlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB0aHJvdyB3aGVuIHN1Ym1pdHRlZCB3aGlsZSBzdG9yZWQgY29udGV4dCBrZXkgc2VydmljZSBoYXMgYmVlbiBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdWJtaXRSZXF1ZXN0RW1pdHRlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkk7IHJlYWRvbmx5IG1lc3NhZ2U/OiBJUGFyc2VkQ2hhdFJlcXVlc3QgfT4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRcdG9uRGlkU3VibWl0UmVxdWVzdDogc3VibWl0UmVxdWVzdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyBQYXJ0aWFsPElDaGF0U2VydmljZT4gYXMgSUNoYXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHQvLyBBY3F1aXJlIGEgdGlwIHNvIHRoZSBzZXJ2aWNlIHN0YXNoZXMgdGhlIChzY29wZWQpIGNvbnRleHQga2V5IHNlcnZpY2UuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSBvd25pbmcgY2hhdCB3aWRnZXQgYmVpbmcgdG9ybiBkb3duLCB3aGljaCBkaXNwb3NlcyBpdHNcblx0XHQvLyBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZS4gU3Vic2VxdWVudCBjb250ZXh0TWF0Y2hlc1J1bGVzIGNhbGxzIHRoZW5cblx0XHQvLyB0aHJvdyBcIkFic3RyYWN0Q29udGV4dEtleVNlcnZpY2UgaGFzIGJlZW4gZGlzcG9zZWRcIi5cblx0XHRjb25zdCBvcmlnaW5hbENvbnRleHRNYXRjaGVzUnVsZXMgPSBjb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzLmJpbmQoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMgPSAoKSA9PiB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Fic3RyYWN0Q29udGV4dEtleVNlcnZpY2UgaGFzIGJlZW4gZGlzcG9zZWQnKTtcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4gc3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdDpzZXNzaW9uLWRpc3Bvc2VkJyksXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgcGFydHM6IFtdIH0sXG5cdFx0XHR9KSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMgPSBvcmlnaW5hbENvbnRleHRNYXRjaGVzUnVsZXM7XG5cdFx0fVxuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdDcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyJywgKCkgPT4ge1xuXHRjb25zdCB0ZXN0RGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgc3RvcmFnZVNlcnZpY2U6IEluTWVtb3J5U3RvcmFnZVNlcnZpY2U7XG5cdGxldCBjb250ZXh0S2V5U2VydmljZTogTW9ja0NvbnRleHRLZXlTZXJ2aWNlO1xuXHRsZXQgc3VibWl0UmVxdWVzdEVtaXR0ZXI6IEVtaXR0ZXI8eyByZWFkb25seSBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkk7IHJlYWRvbmx5IG1lc3NhZ2U/OiBJUGFyc2VkQ2hhdFJlcXVlc3QgfT47XG5cdGxldCBzZXNzaW9uczogTWFwPHN0cmluZywgeyBsYXN0UmVxdWVzdDogeyBtZXNzYWdlOiB7IHRleHQ6IHN0cmluZzsgcGFydHM6IHJlYWRvbmx5IHsga2luZDogc3RyaW5nIH1bXSB9IH0gfCB1bmRlZmluZWQgfT47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb250ZXh0S2V5U2VydmljZSA9IG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKTtcblx0XHRzdWJtaXRSZXF1ZXN0RW1pdHRlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkk7IHJlYWRvbmx5IG1lc3NhZ2U/OiBJUGFyc2VkQ2hhdFJlcXVlc3QgfT4oKSk7XG5cdFx0c2Vzc2lvbnMgPSBuZXcgTWFwKCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tDaGF0U2VydmljZUZvclRyYWNrZXIoKTogSUNoYXRTZXJ2aWNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRTdWJtaXRSZXF1ZXN0OiBzdWJtaXRSZXF1ZXN0RW1pdHRlci5ldmVudCxcblx0XHRcdGdldFNlc3Npb246IChyZXNvdXJjZTogVVJJKSA9PiBzZXNzaW9ucy5nZXQocmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0fSBhcyBQYXJ0aWFsPElDaGF0U2VydmljZT4gYXMgSUNoYXRTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVHJhY2tlcihjaGF0U2VydmljZT86IElDaGF0U2VydmljZSk6IENyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIge1xuXHRcdHJldHVybiB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBDcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyKFxuXHRcdFx0Y2hhdFNlcnZpY2UgPz8gY3JlYXRlTW9ja0NoYXRTZXJ2aWNlRm9yVHJhY2tlcigpLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHQoKSA9PiBjb250ZXh0S2V5U2VydmljZSxcblx0XHQpKTtcblx0fVxuXG5cdHRlc3QoJ3N5bmNDb250ZXh0S2V5IHNldHMgY29udGV4dCBrZXkgdG8gZmFsc2Ugd2hlbiBzdG9yYWdlIGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYWNrZXIgPSBjcmVhdGVUcmFja2VyKCk7XG5cdFx0dHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShDaGF0Q29udGV4dEtleXMuaGFzVXNlZENyZWF0ZVNsYXNoQ29tbWFuZHMua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIGZhbHNlLCAnQ29udGV4dCBrZXkgc2hvdWxkIGJlIGZhbHNlIHdoZW4gbm8gY3JlYXRlIGNvbW1hbmRzIGhhdmUgYmVlbiB1c2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmNDb250ZXh0S2V5IHNldHMgY29udGV4dCBrZXkgdG8gdHJ1ZSB3aGVuIHN0b3JhZ2UgaGFzIHJlY29yZGVkIHVzYWdlJywgKCkgPT4ge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGF0LnRpcHMudXNlZENyZWF0ZVNsYXNoQ29tbWFuZHMnLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3QgdHJhY2tlciA9IGNyZWF0ZVRyYWNrZXIoKTtcblx0XHR0cmFja2VyLnN5bmNDb250ZXh0S2V5KGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKENoYXRDb250ZXh0S2V5cy5oYXNVc2VkQ3JlYXRlU2xhc2hDb21tYW5kcy5rZXkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgdHJ1ZSwgJ0NvbnRleHQga2V5IHNob3VsZCBiZSB0cnVlIHdoZW4gY3JlYXRlIGNvbW1hbmRzIGhhdmUgYmVlbiB1c2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdHMgY3JlYXRlLWluc3RydWN0aW9ucyBzbGFzaCBjb21tYW5kIHZpYSB0ZXh0IGZhbGxiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdDpzZXNzaW9uMScpO1xuXHRcdGNvbnN0IHRyYWNrZXIgPSBjcmVhdGVUcmFja2VyKCk7XG5cdFx0dHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHtcblx0XHRcdGxhc3RSZXF1ZXN0OiB7XG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiAnL2NyZWF0ZS1pbnN0cnVjdGlvbnMgdGVzdCcsXG5cdFx0XHRcdFx0cGFydHM6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoeyBjaGF0U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UgfSk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShDaGF0Q29udGV4dEtleXMuaGFzVXNlZENyZWF0ZVNsYXNoQ29tbWFuZHMua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIHRydWUsICdDb250ZXh0IGtleSBzaG91bGQgYmUgdHJ1ZSBhZnRlciAvY3JlYXRlLWluc3RydWN0aW9ucyBpcyB1c2VkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignY2hhdC50aXBzLnVzZWRDcmVhdGVTbGFzaENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSksXG5cdFx0XHR0cnVlLFxuXHRcdFx0J1N0b3JhZ2Ugc2hvdWxkIHBlcnNpc3QgdGhlIGNyZWF0ZSBzbGFzaCBjb21tYW5kIHVzYWdlJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIGNyZWF0ZS1wcm9tcHQgc2xhc2ggY29tbWFuZCB2aWEgdGV4dCBmYWxsYmFjaycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQ6c2Vzc2lvbjInKTtcblx0XHRjb25zdCB0cmFja2VyID0gY3JlYXRlVHJhY2tlcigpO1xuXHRcdHRyYWNrZXIuc3luY0NvbnRleHRLZXkoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0c2Vzc2lvbnMuc2V0KHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCB7XG5cdFx0XHRsYXN0UmVxdWVzdDoge1xuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJy9jcmVhdGUtcHJvbXB0IG15LXByb21wdCcsXG5cdFx0XHRcdFx0cGFydHM6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoeyBjaGF0U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdjaGF0LnRpcHMudXNlZENyZWF0ZVNsYXNoQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSxcblx0XHRcdHRydWUsXG5cdFx0XHQnU3RvcmFnZSBzaG91bGQgcGVyc2lzdCB0aGUgY3JlYXRlLXByb21wdCB1c2FnZScsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBjcmVhdGUtYWdlbnQgc2xhc2ggY29tbWFuZCB2aWEgcGFyc2VkIHBhcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24zJyk7XG5cdFx0Y29uc3QgdHJhY2tlciA9IGNyZWF0ZVRyYWNrZXIoKTtcblx0XHR0cmFja2VyLnN5bmNDb250ZXh0S2V5KGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHNlc3Npb25zLnNldChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwge1xuXHRcdFx0bGFzdFJlcXVlc3Q6IHtcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICcvY3JlYXRlLWFnZW50IHRlc3QnLFxuXHRcdFx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdFx0XHRuZXcgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0KFxuXHRcdFx0XHRcdFx0XHRuZXcgT2Zmc2V0UmFuZ2UoMCwgMTMpLFxuXHRcdFx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMTQpLFxuXHRcdFx0XHRcdFx0XHR7IGNvbW1hbmQ6ICdjcmVhdGUtYWdlbnQnLCBkZXRhaWw6ICcnLCBsb2NhdGlvbnM6IFtdIH0sXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7IGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2NoYXQudGlwcy51c2VkQ3JlYXRlU2xhc2hDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCdTdG9yYWdlIHNob3VsZCBwZXJzaXN0IHdoZW4gY3JlYXRlLWFnZW50IHNsYXNoIGNvbW1hbmQgcGFydCBpcyBkZXRlY3RlZCcsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBjcmVhdGUgY29tbWFuZCBmcm9tIHN1Ym1pdHRlZCBtZXNzYWdlIHBheWxvYWQgd2hlbiBzZXNzaW9uIGhhcyBubyBsYXN0IHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24tcGF5bG9hZCcpO1xuXHRcdGNvbnN0IHRyYWNrZXIgPSBjcmVhdGVUcmFja2VyKCk7XG5cdFx0dHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRzdWJtaXRSZXF1ZXN0RW1pdHRlci5maXJlKHtcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0dGV4dDogJy9jcmVhdGUtcHJvbXB0IHBheWxvYWQtdGVzdCcsXG5cdFx0XHRcdHBhcnRzOiBbXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdjaGF0LnRpcHMudXNlZENyZWF0ZVNsYXNoQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSxcblx0XHRcdHRydWUsXG5cdFx0XHQnU3RvcmFnZSBzaG91bGQgcGVyc2lzdCB1c2FnZSBkZXRlY3RlZCBmcm9tIHN1Ym1pdHRlZCBtZXNzYWdlIHBheWxvYWQnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IG1hcmsgdXNlZCBmb3Igbm9uLWNyZWF0ZSBzbGFzaCBjb21tYW5kcycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQ6c2Vzc2lvbjQnKTtcblx0XHRjb25zdCB0cmFja2VyID0gY3JlYXRlVHJhY2tlcigpO1xuXHRcdHRyYWNrZXIuc3luY0NvbnRleHRLZXkoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0c2Vzc2lvbnMuc2V0KHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCB7XG5cdFx0XHRsYXN0UmVxdWVzdDoge1xuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJy9oZWxwIHRlc3QnLFxuXHRcdFx0XHRcdHBhcnRzOiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRzdWJtaXRSZXF1ZXN0RW1pdHRlci5maXJlKHsgY2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlIH0pO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoQ2hhdENvbnRleHRLZXlzLmhhc1VzZWRDcmVhdGVTbGFzaENvbW1hbmRzLmtleSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCBmYWxzZSwgJ0NvbnRleHQga2V5IHNob3VsZCByZW1haW4gZmFsc2UgZm9yIG5vbi1jcmVhdGUgc2xhc2ggY29tbWFuZHMnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgbWFyayB1c2VkIHdoZW4gc2Vzc2lvbiBoYXMgbm8gbGFzdCByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdDpzZXNzaW9uNScpO1xuXHRcdGNvbnN0IHRyYWNrZXIgPSBjcmVhdGVUcmFja2VyKCk7XG5cdFx0dHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHsgbGFzdFJlcXVlc3Q6IHVuZGVmaW5lZCB9KTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoeyBjaGF0U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdjaGF0LnRpcHMudXNlZENyZWF0ZVNsYXNoQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0J1Nob3VsZCBub3QgbWFyayB1c2VkIHdoZW4gdGhlcmUgaXMgbm8gbGFzdCByZXF1ZXN0Jyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmx5IG1hcmtzIHVzZWQgb25jZSBldmVuIHdpdGggbXVsdGlwbGUgY3JlYXRlIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdDpzZXNzaW9uNicpO1xuXHRcdGNvbnN0IHRyYWNrZXIgPSBjcmVhdGVUcmFja2VyKCk7XG5cdFx0dHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHtcblx0XHRcdGxhc3RSZXF1ZXN0OiB7XG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJy9jcmVhdGUtc2tpbGwgdGVzdCcsIHBhcnRzOiBbXSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoeyBjaGF0U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2NoYXQudGlwcy51c2VkQ3JlYXRlU2xhc2hDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpLCB0cnVlKTtcblxuXHRcdC8vIEZpcmUgYWdhaW4gXHUyMDE0IHNob3VsZCBiZSBhIG5vLW9wXG5cdFx0c2Vzc2lvbnMuc2V0KHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCB7XG5cdFx0XHRsYXN0UmVxdWVzdDoge1xuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcvY3JlYXRlLXByb21wdCB0ZXN0JywgcGFydHM6IFtdIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7IGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignY2hhdC50aXBzLnVzZWRDcmVhdGVTbGFzaENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSksIHRydWUpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FB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
