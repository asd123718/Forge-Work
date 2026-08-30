import { mockObject } from "../../../../../../base/test/common/mock.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Event } from "../../../../../../base/common/event.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IExtensionService, nullExtensionDescription } from "../../../../../services/extensions/common/extensions.js";
import { TestExtensionService, TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatRequestParser } from "../../../common/requestParser/chatRequestParser.js";
import { ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, getPromptText } from "../../../common/requestParser/chatParserTypes.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSlashCommandService } from "../../../common/participants/chatSlashCommands.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { IChatVariablesService } from "../../../common/attachments/chatVariables.js";
import { chatReferenceVariableEntryId, toChatReferenceDynamicVariableValue } from "../../../common/attachments/chatVariableEntries.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { ToolAndToolSetEnablementMap, ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
import { MockChatService } from "../chatService/mockChatService.js";
import { MockChatVariablesService } from "../mockChatVariables.js";
import { MockPromptsService } from "../promptSyntax/service/mockPromptsService.js";
import assert from "assert";
const testSessionUri = LocalChatSessionUri.forSession("test-session");
suite("ChatRequestParser", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let parser;
  let variableService;
  setup(async () => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
    instantiationService.stub(IPromptsService, testDisposables.add(new MockPromptsService()));
    variableService = new MockChatVariablesService();
    instantiationService.stub(IChatVariablesService, variableService);
  });
  test("plain text", async () => {
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "test");
    await assertSnapshot(result);
  });
  test("plain text with newlines", async () => {
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "line 1\nline 2\r\nline 3";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("inline attachment reference only preserves reference metadata", () => {
    const text = "compare #attachment:design.png here";
    variableService.setDynamicVariables(testSessionUri, [{
      id: "image-1",
      fullName: "design.png",
      range: new Range(1, 9, 1, 31),
      isAttachmentReference: true,
      data: void 0
    }]);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, text);
    const part = result.parts.find((part2) => part2 instanceof ChatRequestDynamicVariablePart);
    const entry = part?.toVariableEntry();
    assert.deepStrictEqual({
      kind: entry?.kind,
      id: entry?.id,
      name: entry?.name,
      range: entry?.range && { start: entry.range.start, endExclusive: entry.range.endExclusive },
      value: entry?.value,
      fullName: entry?.fullName,
      hasAttachment: part ? Object.hasOwn(part, "attachment") : void 0,
      isAttachmentReference: part?.isAttachmentReference
    }, {
      kind: "generic",
      id: "image-1",
      name: "attachment:design.png",
      range: { start: 8, endExclusive: 30 },
      value: void 0,
      fullName: "design.png",
      hasAttachment: false,
      isAttachmentReference: true
    });
  });
  test("multi-word #chat reference preserves its range through toVariableEntry", () => {
    const chatResource = URI.parse("ahp-chat://chat-2/base64session");
    const text = "what did I ask about in #chat:circuit-breaker testing coverage summary ?";
    const tokenStart = text.indexOf("#chat:");
    const tokenEnd = tokenStart + "#chat:circuit-breaker testing coverage summary".length;
    variableService.setDynamicVariables(testSessionUri, [{
      id: chatReferenceVariableEntryId(chatResource, "turn-5"),
      fullName: "circuit-breaker testing coverage summary",
      range: new Range(1, tokenStart + 1, 1, tokenEnd + 1),
      data: toChatReferenceDynamicVariableValue(chatResource, "turn-5")
    }]);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, text);
    const part = result.parts.find((part2) => part2 instanceof ChatRequestDynamicVariablePart);
    const entry = part?.toVariableEntry();
    assert.deepStrictEqual({
      kind: entry?.kind,
      range: entry?.range && { start: entry.range.start, endExclusive: entry.range.endExclusive }
    }, {
      kind: "chatReference",
      range: { start: tokenStart, endExclusive: tokenEnd }
    });
  });
  test("slash in text", async () => {
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "can we add a new file for an Express router to handle the / route";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("slash command", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/fix this";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("invalid slash command", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/explain this";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("multiple slash commands", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/fix /fix";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("slash command not first", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "Hello /fix";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("slash command after whitespace", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "    /fix   keep indentation";
    const result = parser.parseChatRequest(testSessionUri, text);
    assert.deepStrictEqual({
      parts: result.parts.map((part) => ({
        kind: part.kind,
        range: part.range ? { start: part.range.start, endExclusive: part.range.endExclusive } : void 0
      })),
      promptText: getPromptText(result)
    }, {
      parts: [
        { kind: "text", range: { start: 0, endExclusive: 4 } },
        { kind: "slash", range: { start: 4, endExclusive: 8 } },
        { kind: "text", range: { start: 8, endExclusive: 27 } }
      ],
      promptText: { message: "/fix   keep indentation", diff: 4 }
    });
  });
  test("prompt slash command", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "    /prompt";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("prompt slash command after text", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "handle the / route and the request of /search-option";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("prompt slash command after slash", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/ route and the request of /search-option";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("prompt slash command with numbers", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/001-sample this is a test";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("prompt subcommand via space form resolves to colon-named prompt", () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.returns(true);
    promptsService.hasPromptSlashCommand.callsFake((name) => name === "chronicle:tips");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "/chronicle tips show me insights");
    const slashPart = result.parts.find((part) => part.kind === "prompt");
    assert.deepStrictEqual({
      kinds: result.parts.map((part) => part.kind),
      kind: slashPart?.kind,
      name: slashPart?.name,
      text: slashPart?.text,
      trailing: result.parts[result.parts.length - 1]?.text
    }, {
      kinds: ["prompt", "text"],
      kind: "prompt",
      name: "chronicle:tips",
      text: "/chronicle tips",
      trailing: " show me insights"
    });
  });
  test("prompt subcommand via colon form is unchanged", () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.returns(true);
    promptsService.hasPromptSlashCommand.callsFake((name) => name === "chronicle:tips");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "/chronicle:tips show me insights");
    const slashPart = result.parts.find((part) => part.kind === "prompt");
    assert.deepStrictEqual({
      kinds: result.parts.map((part) => part.kind),
      kind: slashPart?.kind,
      name: slashPart?.name,
      text: slashPart?.text,
      trailing: result.parts[result.parts.length - 1]?.text
    }, {
      kinds: ["prompt", "text"],
      kind: "prompt",
      name: "chronicle:tips",
      text: "/chronicle:tips",
      trailing: " show me insights"
    });
  });
  test("space form does not extend when no `<cmd>:<sub>` matches", () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.returns(true);
    promptsService.hasPromptSlashCommand.returns(false);
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "/nonexistent tips");
    const slashPart = result.parts.find((part) => part.kind === "prompt");
    assert.deepStrictEqual({
      kinds: result.parts.map((part) => part.kind),
      name: slashPart?.name,
      text: slashPart?.text,
      trailing: result.parts[result.parts.length - 1]?.text
    }, {
      kinds: ["prompt", "text"],
      name: "nonexistent",
      text: "/nonexistent",
      trailing: " tips"
    });
  });
  const getAgentWithSlashCommands = (slashCommands) => {
    return { id: "agent", name: "agent", extensionId: nullExtensionDescription.identifier, extensionVersion: void 0, publisherDisplayName: "", extensionDisplayName: "", extensionPublisherId: "", locations: [ChatAgentLocation.Chat], modes: [ChatModeKind.Ask], metadata: {}, slashCommands, disambiguation: [] };
  };
  test("agent host: forcedAgent + supportsPromptAttachments revives /skill as prompt slash part", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.callsFake((command) => command === "skill");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const forcedAgent = { ...getAgentWithSlashCommands([]), capabilities: { supportsPromptAttachments: true } };
    const result = parser.parseChatRequestWithReferences(
      [],
      ToolAndToolSetEnablementMap.fromEntries([]),
      "/skill plan run a quick plan",
      ChatAgentLocation.Chat,
      { sessionType: "agent-host-copilot", forcedAgent, attachmentCapabilities: forcedAgent.capabilities }
    );
    await assertSnapshot(result);
  });
  test("agent host: forcedAgent does not fall back to default agent subcommand", () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getDefaultAgent.returns(getAgentWithSlashCommands([{ name: "compact", description: "" }]));
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.callsFake((command) => command === "compact");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const forcedAgent = { ...getAgentWithSlashCommands([]), capabilities: { supportsPromptAttachments: true } };
    const result = parser.parseChatRequestWithReferences(
      [],
      ToolAndToolSetEnablementMap.fromEntries([]),
      "/compact",
      ChatAgentLocation.Chat,
      { sessionType: "agent-host-copilot", forcedAgent, attachmentCapabilities: forcedAgent.capabilities, mode: ChatModeKind.Agent }
    );
    assert.deepStrictEqual({
      hasSubcommand: result.parts.some((part) => part.kind === ChatRequestAgentSubcommandPart.Kind),
      message: getPromptText(result).message
    }, { hasSubcommand: false, message: "/compact" });
  });
  test("agent host: missing forcedAgent still revives /skill via no-agent branch", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.callsFake((command) => command === "skill");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequestWithReferences(
      [],
      ToolAndToolSetEnablementMap.fromEntries([]),
      "/skill plan run a quick plan",
      ChatAgentLocation.Chat,
      { sessionType: "agent-host-copilot" }
    );
    await assertSnapshot(result);
  });
  test("default agent subcommand still applies when no agent is selected", () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getDefaultAgent.returns(getAgentWithSlashCommands([{ name: "compact", description: "" }]));
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "/compact", ChatAgentLocation.Chat, { mode: ChatModeKind.Agent });
    assert.deepStrictEqual({
      kinds: result.parts.map((part) => part.kind),
      message: getPromptText(result).message
    }, { kinds: [ChatRequestAgentSubcommandPart.Kind], message: "" });
  });
  test("agent with subcommand after text", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent Please do /subCommand thanks");
    await assertSnapshot(result);
  });
  test("agents, subCommand", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /subCommand Please do thanks");
    await assertSnapshot(result);
  });
  test("agent but edit mode", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent hello", void 0, { mode: ChatModeKind.Edit });
    await assertSnapshot(result);
  });
  test("agent with question mark", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent? Are you there");
    await assertSnapshot(result);
  });
  test("agent and subcommand with leading whitespace", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "    \r\n	   @agent \r\n	   /subCommand Thanks");
    await assertSnapshot(result);
  });
  test("agent and subcommand after newline", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "    \n@agent\n/subCommand Thanks");
    await assertSnapshot(result);
  });
  test("agent not first", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "Hello Mr. @agent");
    await assertSnapshot(result);
  });
  test("agents and tools and multiline", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    variableService.setSelectedToolAndToolSets(testSessionUri, ToolAndToolSetEnablementMap.fromEntries([
      [{ id: "get_selection", toolReferenceName: "selection", canBeReferencedInPrompt: true, displayName: "", modelDescription: "", source: ToolDataSource.Internal }, true],
      [{ id: "get_debugConsole", toolReferenceName: "debugConsole", canBeReferencedInPrompt: true, displayName: "", modelDescription: "", source: ToolDataSource.Internal }, true]
    ]));
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /subCommand \nPlease do with #selection\nand #debugConsole");
    await assertSnapshot(result);
  });
  test("agents and tools and multiline, part2", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    variableService.setSelectedToolAndToolSets(testSessionUri, ToolAndToolSetEnablementMap.fromEntries([
      [{ id: "get_selection", toolReferenceName: "selection", canBeReferencedInPrompt: true, displayName: "", modelDescription: "", source: ToolDataSource.Internal }, true],
      [{ id: "get_debugConsole", toolReferenceName: "debugConsole", canBeReferencedInPrompt: true, displayName: "", modelDescription: "", source: ToolDataSource.Internal }, true]
    ]));
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent Please \ndo /subCommand with #selection\nand #debugConsole");
    await assertSnapshot(result);
  });
  test("prompt slash command with agent and supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /myPrompt do something", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: true }
    });
    await assertSnapshot(result);
  });
  test("prompt slash command with agent but no supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /myPrompt do something", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: false }
    });
    await assertSnapshot(result);
  });
  test("agent subcommand still takes priority with supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /subCommand do something", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: true }
    });
    await assertSnapshot(result);
  });
  test("slash command with agent and supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /fix this", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: true }
    });
    await assertSnapshot(result);
  });
  test("silent slash command with agent and no supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "clear", silent: true }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /clear", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: false }
    });
    await assertSnapshot(result);
  });
  test("non-silent slash command with agent and no supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /fix this", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: false }
    });
    await assertSnapshot(result);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccmVxdWVzdFBhcnNlclxcY2hhdFJlcXVlc3RQYXJzZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1vY2tPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgYXNzZXJ0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3NuYXBzaG90LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlc3RFeHRlbnNpb25TZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50U2VydmljZSwgSUNoYXRBZ2VudENvbW1hbmQsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFBhcnNlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRSZXF1ZXN0UGFyc2VyLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCwgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0LCBnZXRQcm9tcHRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZhcmlhYmxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBjaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeUlkLCB0b0NoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElUb29sRGF0YSwgVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLCBUb29sRGF0YVNvdXJjZSwgVG9vbFNldCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRWYXJpYWJsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vbW9ja0NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgTW9ja1Byb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vcHJvbXB0U3ludGF4L3NlcnZpY2UvbW9ja1Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcblxuY29uc3QgdGVzdFNlc3Npb25VcmkgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Rlc3Qtc2Vzc2lvbicpO1xuXG5zdWl0ZSgnQ2hhdFJlcXVlc3RQYXJzZXInLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgcGFyc2VyOiBDaGF0UmVxdWVzdFBhcnNlcjtcblxuXHRsZXQgdmFyaWFibGVTZXJ2aWNlOiBNb2NrQ2hhdFZhcmlhYmxlc1NlcnZpY2U7XG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwgbmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50U2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCkpKTtcblxuXHRcdHZhcmlhYmxlU2VydmljZSA9IG5ldyBNb2NrQ2hhdFZhcmlhYmxlc1NlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0VmFyaWFibGVzU2VydmljZSwgdmFyaWFibGVTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVzdCgncGxhaW4gdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICd0ZXN0Jyk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgncGxhaW4gdGV4dCB3aXRoIG5ld2xpbmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCB0ZXh0ID0gJ2xpbmUgMVxcbmxpbmUgMlxcclxcbmxpbmUgMyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubGluZSBhdHRhY2htZW50IHJlZmVyZW5jZSBvbmx5IHByZXNlcnZlcyByZWZlcmVuY2UgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICdjb21wYXJlICNhdHRhY2htZW50OmRlc2lnbi5wbmcgaGVyZSc7XG5cdFx0dmFyaWFibGVTZXJ2aWNlLnNldER5bmFtaWNWYXJpYWJsZXModGVzdFNlc3Npb25VcmksIFt7XG5cdFx0XHRpZDogJ2ltYWdlLTEnLFxuXHRcdFx0ZnVsbE5hbWU6ICdkZXNpZ24ucG5nJyxcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgOSwgMSwgMzEpLFxuXHRcdFx0aXNBdHRhY2htZW50UmVmZXJlbmNlOiB0cnVlLFxuXHRcdFx0ZGF0YTogdW5kZWZpbmVkLFxuXHRcdH1dKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdFx0Y29uc3QgcGFydCA9IHJlc3VsdC5wYXJ0cy5maW5kKChwYXJ0KTogcGFydCBpcyBDaGF0UmVxdWVzdER5bmFtaWNWYXJpYWJsZVBhcnQgPT4gcGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0RHluYW1pY1ZhcmlhYmxlUGFydCk7XG5cdFx0Y29uc3QgZW50cnkgPSBwYXJ0Py50b1ZhcmlhYmxlRW50cnkoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZDogZW50cnk/LmtpbmQsXG5cdFx0XHRpZDogZW50cnk/LmlkLFxuXHRcdFx0bmFtZTogZW50cnk/Lm5hbWUsXG5cdFx0XHRyYW5nZTogZW50cnk/LnJhbmdlICYmIHsgc3RhcnQ6IGVudHJ5LnJhbmdlLnN0YXJ0LCBlbmRFeGNsdXNpdmU6IGVudHJ5LnJhbmdlLmVuZEV4Y2x1c2l2ZSB9LFxuXHRcdFx0dmFsdWU6IGVudHJ5Py52YWx1ZSxcblx0XHRcdGZ1bGxOYW1lOiBlbnRyeT8uZnVsbE5hbWUsXG5cdFx0XHRoYXNBdHRhY2htZW50OiBwYXJ0ID8gT2JqZWN0Lmhhc093bihwYXJ0LCAnYXR0YWNobWVudCcpIDogdW5kZWZpbmVkLFxuXHRcdFx0aXNBdHRhY2htZW50UmVmZXJlbmNlOiBwYXJ0Py5pc0F0dGFjaG1lbnRSZWZlcmVuY2UsXG5cdFx0fSwge1xuXHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0aWQ6ICdpbWFnZS0xJyxcblx0XHRcdG5hbWU6ICdhdHRhY2htZW50OmRlc2lnbi5wbmcnLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IDgsIGVuZEV4Y2x1c2l2ZTogMzAgfSxcblx0XHRcdHZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRmdWxsTmFtZTogJ2Rlc2lnbi5wbmcnLFxuXHRcdFx0aGFzQXR0YWNobWVudDogZmFsc2UsXG5cdFx0XHRpc0F0dGFjaG1lbnRSZWZlcmVuY2U6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLXdvcmQgI2NoYXQgcmVmZXJlbmNlIHByZXNlcnZlcyBpdHMgcmFuZ2UgdGhyb3VnaCB0b1ZhcmlhYmxlRW50cnknLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIHJlZmVyZW5jZSBjYXJyaWVzIHRoZSBvcGFxdWUgYmFja2VuZCBjaGF0IFVSSSB2ZXJiYXRpbS5cblx0XHRjb25zdCBjaGF0UmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FocC1jaGF0Oi8vY2hhdC0yL2Jhc2U2NHNlc3Npb24nKTtcblx0XHRjb25zdCB0ZXh0ID0gJ3doYXQgZGlkIEkgYXNrIGFib3V0IGluICNjaGF0OmNpcmN1aXQtYnJlYWtlciB0ZXN0aW5nIGNvdmVyYWdlIHN1bW1hcnkgPyc7XG5cdFx0Y29uc3QgdG9rZW5TdGFydCA9IHRleHQuaW5kZXhPZignI2NoYXQ6Jyk7XG5cdFx0Y29uc3QgdG9rZW5FbmQgPSB0b2tlblN0YXJ0ICsgJyNjaGF0OmNpcmN1aXQtYnJlYWtlciB0ZXN0aW5nIGNvdmVyYWdlIHN1bW1hcnknLmxlbmd0aDtcblx0XHR2YXJpYWJsZVNlcnZpY2Uuc2V0RHluYW1pY1ZhcmlhYmxlcyh0ZXN0U2Vzc2lvblVyaSwgW3tcblx0XHRcdGlkOiBjaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeUlkKGNoYXRSZXNvdXJjZSwgJ3R1cm4tNScpLFxuXHRcdFx0ZnVsbE5hbWU6ICdjaXJjdWl0LWJyZWFrZXIgdGVzdGluZyBjb3ZlcmFnZSBzdW1tYXJ5Jyxcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgdG9rZW5TdGFydCArIDEsIDEsIHRva2VuRW5kICsgMSksXG5cdFx0XHRkYXRhOiB0b0NoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZShjaGF0UmVzb3VyY2UsICd0dXJuLTUnKSxcblx0XHR9XSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHRcdGNvbnN0IHBhcnQgPSByZXN1bHQucGFydHMuZmluZCgocGFydCk6IHBhcnQgaXMgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0ID0+IHBhcnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdER5bmFtaWNWYXJpYWJsZVBhcnQpO1xuXHRcdGNvbnN0IGVudHJ5ID0gcGFydD8udG9WYXJpYWJsZUVudHJ5KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGtpbmQ6IGVudHJ5Py5raW5kLFxuXHRcdFx0cmFuZ2U6IGVudHJ5Py5yYW5nZSAmJiB7IHN0YXJ0OiBlbnRyeS5yYW5nZS5zdGFydCwgZW5kRXhjbHVzaXZlOiBlbnRyeS5yYW5nZS5lbmRFeGNsdXNpdmUgfSxcblx0XHR9LCB7XG5cdFx0XHRraW5kOiAnY2hhdFJlZmVyZW5jZScsXG5cdFx0XHRyYW5nZTogeyBzdGFydDogdG9rZW5TdGFydCwgZW5kRXhjbHVzaXZlOiB0b2tlbkVuZCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzbGFzaCBpbiB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCB0ZXh0ID0gJ2NhbiB3ZSBhZGQgYSBuZXcgZmlsZSBmb3IgYW4gRXhwcmVzcyByb3V0ZXIgdG8gaGFuZGxlIHRoZSAvIHJvdXRlJztcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2xhc2ggY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFt7IGNvbW1hbmQ6ICdmaXgnIH1dKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgdGV4dCA9ICcvZml4IHRoaXMnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIHNsYXNoIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbeyBjb21tYW5kOiAnZml4JyB9XSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHRleHQgPSAnL2V4cGxhaW4gdGhpcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHNsYXNoIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW3sgY29tbWFuZDogJ2ZpeCcgfV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCB0ZXh0ID0gJy9maXggL2ZpeCc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NsYXNoIGNvbW1hbmQgbm90IGZpcnN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW3sgY29tbWFuZDogJ2ZpeCcgfV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCB0ZXh0ID0gJ0hlbGxvIC9maXgnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbGFzaCBjb21tYW5kIGFmdGVyIHdoaXRlc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbeyBjb21tYW5kOiAnZml4JyB9XSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHRleHQgPSAnICAgIC9maXggICBrZWVwIGluZGVudGF0aW9uJztcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwYXJ0czogcmVzdWx0LnBhcnRzLm1hcChwYXJ0ID0+ICh7XG5cdFx0XHRcdGtpbmQ6IHBhcnQua2luZCxcblx0XHRcdFx0cmFuZ2U6IHBhcnQucmFuZ2UgPyB7IHN0YXJ0OiBwYXJ0LnJhbmdlLnN0YXJ0LCBlbmRFeGNsdXNpdmU6IHBhcnQucmFuZ2UuZW5kRXhjbHVzaXZlIH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9KSksXG5cdFx0XHRwcm9tcHRUZXh0OiBnZXRQcm9tcHRUZXh0KHJlc3VsdCksXG5cdFx0fSwge1xuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiAndGV4dCcsIHJhbmdlOiB7IHN0YXJ0OiAwLCBlbmRFeGNsdXNpdmU6IDQgfSB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdzbGFzaCcsIHJhbmdlOiB7IHN0YXJ0OiA0LCBlbmRFeGNsdXNpdmU6IDggfSB9LFxuXHRcdFx0XHR7IGtpbmQ6ICd0ZXh0JywgcmFuZ2U6IHsgc3RhcnQ6IDgsIGVuZEV4Y2x1c2l2ZTogMjcgfSB9LFxuXHRcdFx0XSxcblx0XHRcdHByb21wdFRleHQ6IHsgbWVzc2FnZTogJy9maXggICBrZWVwIGluZGVudGF0aW9uJywgZGlmZjogNCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tcHQgc2xhc2ggY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFt7IGNvbW1hbmQ6ICdmaXgnIH1dKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0U2xhc2hDb21tYW5kU2VydmljZS5pc1ZhbGlkU2xhc2hDb21tYW5kTmFtZS5jYWxsc0Zha2UoKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0cmV0dXJuICEhY29tbWFuZC5tYXRjaCgvXltcXHdfXFwtXFwuXSskLyk7XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHRleHQgPSAnICAgIC9wcm9tcHQnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tcHQgc2xhc2ggY29tbWFuZCBhZnRlciB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW3sgY29tbWFuZDogJ2ZpeCcgfV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElQcm9tcHRzU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlLmlzVmFsaWRTbGFzaENvbW1hbmROYW1lLmNhbGxzRmFrZSgoY29tbWFuZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4gISFjb21tYW5kLm1hdGNoKC9eW1xcd19cXC1cXC5dKyQvKTtcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgcHJvbXB0U2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgdGV4dCA9ICdoYW5kbGUgdGhlIC8gcm91dGUgYW5kIHRoZSByZXF1ZXN0IG9mIC9zZWFyY2gtb3B0aW9uJztcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJvbXB0IHNsYXNoIGNvbW1hbmQgYWZ0ZXIgc2xhc2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbeyBjb21tYW5kOiAnZml4JyB9XSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJvbXB0U2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiAhIWNvbW1hbmQubWF0Y2goL15bXFx3X1xcLVxcLl0rJC8pO1xuXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHRleHQgPSAnLyByb3V0ZSBhbmQgdGhlIHJlcXVlc3Qgb2YgL3NlYXJjaC1vcHRpb24nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tcHQgc2xhc2ggY29tbWFuZCB3aXRoIG51bWJlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbeyBjb21tYW5kOiAnZml4JyB9XSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJvbXB0U2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiAhIWNvbW1hbmQubWF0Y2goL15bXFx3X1xcLVxcLl0rJC8pO1xuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCB0ZXh0ID0gJy8wMDEtc2FtcGxlIHRoaXMgaXMgYSB0ZXN0Jztcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJvbXB0IHN1YmNvbW1hbmQgdmlhIHNwYWNlIGZvcm0gcmVzb2x2ZXMgdG8gY29sb24tbmFtZWQgcHJvbXB0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW10pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUucmV0dXJucyh0cnVlKTtcblx0XHRwcm9tcHRzU2VydmljZS5oYXNQcm9tcHRTbGFzaENvbW1hbmQuY2FsbHNGYWtlKChuYW1lOiBzdHJpbmcpID0+IG5hbWUgPT09ICdjaHJvbmljbGU6dGlwcycpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICcvY2hyb25pY2xlIHRpcHMgc2hvdyBtZSBpbnNpZ2h0cycpO1xuXG5cdFx0Y29uc3Qgc2xhc2hQYXJ0ID0gcmVzdWx0LnBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09ICdwcm9tcHQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGtpbmRzOiByZXN1bHQucGFydHMubWFwKHBhcnQgPT4gcGFydC5raW5kKSxcblx0XHRcdGtpbmQ6IHNsYXNoUGFydD8ua2luZCxcblx0XHRcdG5hbWU6IChzbGFzaFBhcnQgYXMgeyBuYW1lPzogc3RyaW5nIH0gfCB1bmRlZmluZWQpPy5uYW1lLFxuXHRcdFx0dGV4dDogc2xhc2hQYXJ0Py50ZXh0LFxuXHRcdFx0dHJhaWxpbmc6IHJlc3VsdC5wYXJ0c1tyZXN1bHQucGFydHMubGVuZ3RoIC0gMV0/LnRleHQsXG5cdFx0fSwge1xuXHRcdFx0a2luZHM6IFsncHJvbXB0JywgJ3RleHQnXSxcblx0XHRcdGtpbmQ6ICdwcm9tcHQnLFxuXHRcdFx0bmFtZTogJ2Nocm9uaWNsZTp0aXBzJyxcblx0XHRcdHRleHQ6ICcvY2hyb25pY2xlIHRpcHMnLFxuXHRcdFx0dHJhaWxpbmc6ICcgc2hvdyBtZSBpbnNpZ2h0cycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21wdCBzdWJjb21tYW5kIHZpYSBjb2xvbiBmb3JtIGlzIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdHNTZXJ2aWNlLmlzVmFsaWRTbGFzaENvbW1hbmROYW1lLnJldHVybnModHJ1ZSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaGFzUHJvbXB0U2xhc2hDb21tYW5kLmNhbGxzRmFrZSgobmFtZTogc3RyaW5nKSA9PiBuYW1lID09PSAnY2hyb25pY2xlOnRpcHMnKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgcHJvbXB0c1NlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnL2Nocm9uaWNsZTp0aXBzIHNob3cgbWUgaW5zaWdodHMnKTtcblxuXHRcdGNvbnN0IHNsYXNoUGFydCA9IHJlc3VsdC5wYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSAncHJvbXB0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRraW5kczogcmVzdWx0LnBhcnRzLm1hcChwYXJ0ID0+IHBhcnQua2luZCksXG5cdFx0XHRraW5kOiBzbGFzaFBhcnQ/LmtpbmQsXG5cdFx0XHRuYW1lOiAoc2xhc2hQYXJ0IGFzIHsgbmFtZT86IHN0cmluZyB9IHwgdW5kZWZpbmVkKT8ubmFtZSxcblx0XHRcdHRleHQ6IHNsYXNoUGFydD8udGV4dCxcblx0XHRcdHRyYWlsaW5nOiByZXN1bHQucGFydHNbcmVzdWx0LnBhcnRzLmxlbmd0aCAtIDFdPy50ZXh0LFxuXHRcdH0sIHtcblx0XHRcdGtpbmRzOiBbJ3Byb21wdCcsICd0ZXh0J10sXG5cdFx0XHRraW5kOiAncHJvbXB0Jyxcblx0XHRcdG5hbWU6ICdjaHJvbmljbGU6dGlwcycsXG5cdFx0XHR0ZXh0OiAnL2Nocm9uaWNsZTp0aXBzJyxcblx0XHRcdHRyYWlsaW5nOiAnIHNob3cgbWUgaW5zaWdodHMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzcGFjZSBmb3JtIGRvZXMgbm90IGV4dGVuZCB3aGVuIG5vIGA8Y21kPjo8c3ViPmAgbWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdHNTZXJ2aWNlLmlzVmFsaWRTbGFzaENvbW1hbmROYW1lLnJldHVybnModHJ1ZSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaGFzUHJvbXB0U2xhc2hDb21tYW5kLnJldHVybnMoZmFsc2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICcvbm9uZXhpc3RlbnQgdGlwcycpO1xuXG5cdFx0Y29uc3Qgc2xhc2hQYXJ0ID0gcmVzdWx0LnBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09ICdwcm9tcHQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGtpbmRzOiByZXN1bHQucGFydHMubWFwKHBhcnQgPT4gcGFydC5raW5kKSxcblx0XHRcdG5hbWU6IChzbGFzaFBhcnQgYXMgeyBuYW1lPzogc3RyaW5nIH0gfCB1bmRlZmluZWQpPy5uYW1lLFxuXHRcdFx0dGV4dDogc2xhc2hQYXJ0Py50ZXh0LFxuXHRcdFx0dHJhaWxpbmc6IHJlc3VsdC5wYXJ0c1tyZXN1bHQucGFydHMubGVuZ3RoIC0gMV0/LnRleHQsXG5cdFx0fSwge1xuXHRcdFx0a2luZHM6IFsncHJvbXB0JywgJ3RleHQnXSxcblx0XHRcdG5hbWU6ICdub25leGlzdGVudCcsXG5cdFx0XHR0ZXh0OiAnL25vbmV4aXN0ZW50Jyxcblx0XHRcdHRyYWlsaW5nOiAnIHRpcHMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyB0ZXN0KCd2YXJpYWJsZXMnLCBhc3luYyAoKSA9PiB7XG5cdC8vIFx0dmFyU2VydmljZS5oYXNWYXJpYWJsZS5yZXR1cm5zKHRydWUpO1xuXHQvLyBcdHZhclNlcnZpY2UuZ2V0VmFyaWFibGUucmV0dXJucyh7IGlkOiAnY29waWxvdC5zZWxlY3Rpb24nIH0pO1xuXG5cdC8vIFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHQvLyBcdGNvbnN0IHRleHQgPSAnV2hhdCBkb2VzICNzZWxlY3Rpb24gbWVhbj8nO1xuXHQvLyBcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0Ly8gXHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHQvLyB9KTtcblxuXHQvLyB0ZXN0KCd2YXJpYWJsZSB3aXRoIHF1ZXN0aW9uIG1hcmsnLCBhc3luYyAoKSA9PiB7XG5cdC8vIFx0dmFyU2VydmljZS5oYXNWYXJpYWJsZS5yZXR1cm5zKHRydWUpO1xuXHQvLyBcdHZhclNlcnZpY2UuZ2V0VmFyaWFibGUucmV0dXJucyh7IGlkOiAnY29waWxvdC5zZWxlY3Rpb24nIH0pO1xuXG5cdC8vIFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHQvLyBcdGNvbnN0IHRleHQgPSAnV2hhdCBpcyAjc2VsZWN0aW9uPyc7XG5cdC8vIFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHQvLyBcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdC8vIH0pO1xuXG5cdC8vIHRlc3QoJ2ludmFsaWQgdmFyaWFibGVzJywgYXN5bmMgKCkgPT4ge1xuXHQvLyBcdHZhclNlcnZpY2UuaGFzVmFyaWFibGUucmV0dXJucyhmYWxzZSk7XG5cblx0Ly8gXHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdC8vIFx0Y29uc3QgdGV4dCA9ICdXaGF0IGRvZXMgI3NlbGVjdGlvbiBtZWFuPyc7XG5cdC8vIFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHQvLyBcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdC8vIH0pO1xuXG5cdGNvbnN0IGdldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMgPSAoc2xhc2hDb21tYW5kczogSUNoYXRBZ2VudENvbW1hbmRbXSkgPT4ge1xuXHRcdHJldHVybiB7IGlkOiAnYWdlbnQnLCBuYW1lOiAnYWdlbnQnLCBleHRlbnNpb25JZDogbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvblZlcnNpb246IHVuZGVmaW5lZCwgcHVibGlzaGVyRGlzcGxheU5hbWU6ICcnLCBleHRlbnNpb25EaXNwbGF5TmFtZTogJycsIGV4dGVuc2lvblB1Ymxpc2hlcklkOiAnJywgbG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sIG1vZGVzOiBbQ2hhdE1vZGVLaW5kLkFza10sIG1ldGFkYXRhOiB7fSwgc2xhc2hDb21tYW5kcywgZGlzYW1iaWd1YXRpb246IFtdIH0gc2F0aXNmaWVzIElDaGF0QWdlbnREYXRhO1xuXHR9O1xuXG5cdHRlc3QoJ2FnZW50IGhvc3Q6IGZvcmNlZEFnZW50ICsgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50cyByZXZpdmVzIC9za2lsbCBhcyBwcm9tcHQgc2xhc2ggcGFydCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBNaXJyb3JzIHdoYXQgQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIuX3BhcnNlUHJvbXB0Rm9ySGlzdG9yeSBkb2VzXG5cdFx0Ly8gd2hlbiByZXN0b3JpbmcgYSBzZXNzaW9uOiBwYXNzIGZvcmNlZEFnZW50ICsgY2FwYWJpbGl0aWVzICsgYW5cblx0XHQvLyBlbXB0eSByZWZlcmVuY2VzL3Rvb2xzIG1hcCBhbmQgZXhwZWN0IGEgQ2hhdFJlcXVlc3RTbGFzaFByb21wdFBhcnRcblx0XHQvLyBmb3IgL3NraWxsIDxuYW1lPi5cblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdHNTZXJ2aWNlLmlzVmFsaWRTbGFzaENvbW1hbmROYW1lLmNhbGxzRmFrZSgoY29tbWFuZDogc3RyaW5nKSA9PiBjb21tYW5kID09PSAnc2tpbGwnKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgcHJvbXB0c1NlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IGZvcmNlZEFnZW50ID0geyAuLi5nZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFtdKSwgY2FwYWJpbGl0aWVzOiB7IHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM6IHRydWUgfSB9IHNhdGlzZmllcyBJQ2hhdEFnZW50RGF0YTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdFdpdGhSZWZlcmVuY2VzKFxuXHRcdFx0W10sXG5cdFx0XHRUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW10pLFxuXHRcdFx0Jy9za2lsbCBwbGFuIHJ1biBhIHF1aWNrIHBsYW4nLFxuXHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHsgc2Vzc2lvblR5cGU6ICdhZ2VudC1ob3N0LWNvcGlsb3QnLCBmb3JjZWRBZ2VudCwgYXR0YWNobWVudENhcGFiaWxpdGllczogZm9yY2VkQWdlbnQuY2FwYWJpbGl0aWVzIH0sXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCBob3N0OiBmb3JjZWRBZ2VudCBkb2VzIG5vdCBmYWxsIGJhY2sgdG8gZGVmYXVsdCBhZ2VudCBzdWJjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXREZWZhdWx0QWdlbnQucmV0dXJucyhnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdjb21wYWN0JywgZGVzY3JpcHRpb246ICcnIH1dKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdHNTZXJ2aWNlLmlzVmFsaWRTbGFzaENvbW1hbmROYW1lLmNhbGxzRmFrZSgoY29tbWFuZDogc3RyaW5nKSA9PiBjb21tYW5kID09PSAnY29tcGFjdCcpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgZm9yY2VkQWdlbnQgPSB7IC4uLmdldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW10pLCBjYXBhYmlsaXRpZXM6IHsgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czogdHJ1ZSB9IH0gc2F0aXNmaWVzIElDaGF0QWdlbnREYXRhO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0V2l0aFJlZmVyZW5jZXMoXG5cdFx0XHRbXSxcblx0XHRcdFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbXSksXG5cdFx0XHQnL2NvbXBhY3QnLFxuXHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHsgc2Vzc2lvblR5cGU6ICdhZ2VudC1ob3N0LWNvcGlsb3QnLCBmb3JjZWRBZ2VudCwgYXR0YWNobWVudENhcGFiaWxpdGllczogZm9yY2VkQWdlbnQuY2FwYWJpbGl0aWVzLCBtb2RlOiBDaGF0TW9kZUtpbmQuQWdlbnQgfSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNTdWJjb21tYW5kOiByZXN1bHQucGFydHMuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0LktpbmQpLFxuXHRcdFx0bWVzc2FnZTogZ2V0UHJvbXB0VGV4dChyZXN1bHQpLm1lc3NhZ2UsXG5cdFx0fSwgeyBoYXNTdWJjb21tYW5kOiBmYWxzZSwgbWVzc2FnZTogJy9jb21wYWN0JyB9KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgaG9zdDogbWlzc2luZyBmb3JjZWRBZ2VudCBzdGlsbCByZXZpdmVzIC9za2lsbCB2aWEgbm8tYWdlbnQgYnJhbmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW10pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IGNvbW1hbmQgPT09ICdza2lsbCcpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3RXaXRoUmVmZXJlbmNlcyhcblx0XHRcdFtdLFxuXHRcdFx0VG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtdKSxcblx0XHRcdCcvc2tpbGwgcGxhbiBydW4gYSBxdWljayBwbGFuJyxcblx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHR7IHNlc3Npb25UeXBlOiAnYWdlbnQtaG9zdC1jb3BpbG90JyB9LFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVmYXVsdCBhZ2VudCBzdWJjb21tYW5kIHN0aWxsIGFwcGxpZXMgd2hlbiBubyBhZ2VudCBpcyBzZWxlY3RlZCcsICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0RGVmYXVsdEFnZW50LnJldHVybnMoZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnY29tcGFjdCcsIGRlc2NyaXB0aW9uOiAnJyB9XSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnL2NvbXBhY3QnLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCB7IG1vZGU6IENoYXRNb2RlS2luZC5BZ2VudCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZHM6IHJlc3VsdC5wYXJ0cy5tYXAocGFydCA9PiBwYXJ0LmtpbmQpLFxuXHRcdFx0bWVzc2FnZTogZ2V0UHJvbXB0VGV4dChyZXN1bHQpLm1lc3NhZ2UsXG5cdFx0fSwgeyBraW5kczogW0NoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydC5LaW5kXSwgbWVzc2FnZTogJycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50IHdpdGggc3ViY29tbWFuZCBhZnRlciB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnc3ViQ29tbWFuZCcsIGRlc2NyaXB0aW9uOiAnJyB9XSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ0BhZ2VudCBQbGVhc2UgZG8gL3N1YkNvbW1hbmQgdGhhbmtzJyk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnRzLCBzdWJDb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnc3ViQ29tbWFuZCcsIGRlc2NyaXB0aW9uOiAnJyB9XSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ0BhZ2VudCAvc3ViQ29tbWFuZCBQbGVhc2UgZG8gdGhhbmtzJyk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgYnV0IGVkaXQgbW9kZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0QWdlbnRzQnlOYW1lLnJldHVybnMoW2dldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW10pXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICdAYWdlbnQgaGVsbG8nLCB1bmRlZmluZWQsIHsgbW9kZTogQ2hhdE1vZGVLaW5kLkVkaXQgfSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgd2l0aCBxdWVzdGlvbiBtYXJrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnc3ViQ29tbWFuZCcsIGRlc2NyaXB0aW9uOiAnJyB9XSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ0BhZ2VudD8gQXJlIHlvdSB0aGVyZScpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50IGFuZCBzdWJjb21tYW5kIHdpdGggbGVhZGluZyB3aGl0ZXNwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnc3ViQ29tbWFuZCcsIGRlc2NyaXB0aW9uOiAnJyB9XSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJyAgICBcXHJcXG5cXHQgICBAYWdlbnQgXFxyXFxuXFx0ICAgL3N1YkNvbW1hbmQgVGhhbmtzJyk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgYW5kIHN1YmNvbW1hbmQgYWZ0ZXIgbmV3bGluZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0QWdlbnRzQnlOYW1lLnJldHVybnMoW2dldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW3sgbmFtZTogJ3N1YkNvbW1hbmQnLCBkZXNjcmlwdGlvbjogJycgfV0pXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICcgICAgXFxuQGFnZW50XFxuL3N1YkNvbW1hbmQgVGhhbmtzJyk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgbm90IGZpcnN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnc3ViQ29tbWFuZCcsIGRlc2NyaXB0aW9uOiAnJyB9XSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ0hlbGxvIE1yLiBAYWdlbnQnKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudHMgYW5kIHRvb2xzIGFuZCBtdWx0aWxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0dmFyaWFibGVTZXJ2aWNlLnNldFNlbGVjdGVkVG9vbEFuZFRvb2xTZXRzKHRlc3RTZXNzaW9uVXJpLCBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW1xuXHRcdFx0W3sgaWQ6ICdnZXRfc2VsZWN0aW9uJywgdG9vbFJlZmVyZW5jZU5hbWU6ICdzZWxlY3Rpb24nLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgZGlzcGxheU5hbWU6ICcnLCBtb2RlbERlc2NyaXB0aW9uOiAnJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCB9LCB0cnVlXSxcblx0XHRcdFt7IGlkOiAnZ2V0X2RlYnVnQ29uc29sZScsIHRvb2xSZWZlcmVuY2VOYW1lOiAnZGVidWdDb25zb2xlJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIGRpc3BsYXlOYW1lOiAnJywgbW9kZWxEZXNjcmlwdGlvbjogJycsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwgfSwgdHJ1ZV1cblx0XHRdIHNhdGlzZmllcyBbSVRvb2xEYXRhIHwgVG9vbFNldCwgYm9vbGVhbl1bXSkpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnQGFnZW50IC9zdWJDb21tYW5kIFxcblBsZWFzZSBkbyB3aXRoICNzZWxlY3Rpb25cXG5hbmQgI2RlYnVnQ29uc29sZScpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50cyBhbmQgdG9vbHMgYW5kIG11bHRpbGluZSwgcGFydDInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0dmFyaWFibGVTZXJ2aWNlLnNldFNlbGVjdGVkVG9vbEFuZFRvb2xTZXRzKHRlc3RTZXNzaW9uVXJpLCBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW1xuXHRcdFx0W3sgaWQ6ICdnZXRfc2VsZWN0aW9uJywgdG9vbFJlZmVyZW5jZU5hbWU6ICdzZWxlY3Rpb24nLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgZGlzcGxheU5hbWU6ICcnLCBtb2RlbERlc2NyaXB0aW9uOiAnJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCB9LCB0cnVlXSxcblx0XHRcdFt7IGlkOiAnZ2V0X2RlYnVnQ29uc29sZScsIHRvb2xSZWZlcmVuY2VOYW1lOiAnZGVidWdDb25zb2xlJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIGRpc3BsYXlOYW1lOiAnJywgbW9kZWxEZXNjcmlwdGlvbjogJycsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwgfSwgdHJ1ZV1cblx0XHRdIHNhdGlzZmllcyBbSVRvb2xEYXRhIHwgVG9vbFNldCwgYm9vbGVhbl1bXSkpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnQGFnZW50IFBsZWFzZSBcXG5kbyAvc3ViQ29tbWFuZCB3aXRoICNzZWxlY3Rpb25cXG5hbmQgI2RlYnVnQ29uc29sZScpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21wdCBzbGFzaCBjb21tYW5kIHdpdGggYWdlbnQgYW5kIHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJvbXB0U2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiAhIWNvbW1hbmQubWF0Y2goL15bXFx3X1xcLVxcLl0rJC8pO1xuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ0BhZ2VudCAvbXlQcm9tcHQgZG8gc29tZXRoaW5nJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB7IHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM6IHRydWUgfVxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21wdCBzbGFzaCBjb21tYW5kIHdpdGggYWdlbnQgYnV0IG5vIHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJvbXB0U2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiAhIWNvbW1hbmQubWF0Y2goL15bXFx3X1xcLVxcLl0rJC8pO1xuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ0BhZ2VudCAvbXlQcm9tcHQgZG8gc29tZXRoaW5nJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB7IHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM6IGZhbHNlIH1cblx0XHR9KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCBzdWJjb21tYW5kIHN0aWxsIHRha2VzIHByaW9yaXR5IHdpdGggc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0QWdlbnRzQnlOYW1lLnJldHVybnMoW2dldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW3sgbmFtZTogJ3N1YkNvbW1hbmQnLCBkZXNjcmlwdGlvbjogJycgfV0pXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0U2xhc2hDb21tYW5kU2VydmljZS5pc1ZhbGlkU2xhc2hDb21tYW5kTmFtZS5jYWxsc0Zha2UoKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0cmV0dXJuICEhY29tbWFuZC5tYXRjaCgvXltcXHdfXFwtXFwuXSskLyk7XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnQGFnZW50IC9zdWJDb21tYW5kIGRvIHNvbWV0aGluZycsIHVuZGVmaW5lZCwge1xuXHRcdFx0YXR0YWNobWVudENhcGFiaWxpdGllczogeyBzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzOiB0cnVlIH1cblx0XHR9KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbGFzaCBjb21tYW5kIHdpdGggYWdlbnQgYW5kIHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbeyBjb21tYW5kOiAnZml4JyB9XSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnQGFnZW50IC9maXggdGhpcycsIHVuZGVmaW5lZCwge1xuXHRcdFx0YXR0YWNobWVudENhcGFiaWxpdGllczogeyBzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzOiB0cnVlIH1cblx0XHR9KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaWxlbnQgc2xhc2ggY29tbWFuZCB3aXRoIGFnZW50IGFuZCBubyBzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnc3ViQ29tbWFuZCcsIGRlc2NyaXB0aW9uOiAnJyB9XSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW3sgY29tbWFuZDogJ2NsZWFyJywgc2lsZW50OiB0cnVlIH1dKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICdAYWdlbnQgL2NsZWFyJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB7IHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM6IGZhbHNlIH1cblx0XHR9KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdub24tc2lsZW50IHNsYXNoIGNvbW1hbmQgd2l0aCBhZ2VudCBhbmQgbm8gc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0QWdlbnRzQnlOYW1lLnJldHVybnMoW2dldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW3sgbmFtZTogJ3N1YkNvbW1hbmQnLCBkZXNjcmlwdGlvbjogJycgfV0pXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFt7IGNvbW1hbmQ6ICdmaXgnIH1dKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICdAYWdlbnQgL2ZpeCB0aGlzJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB7IHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM6IGZhbHNlIH1cblx0XHR9KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixTQUFTLGFBQWE7QUFDdEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQixnQ0FBZ0M7QUFDNUQsU0FBUyxzQkFBc0IsMEJBQTBCO0FBQ3pELFNBQVMsa0JBQXFELHlCQUF5QjtBQUN2RixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQyxnQ0FBZ0MscUJBQXFCO0FBQzlGLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCLDJDQUEyQztBQUNsRixTQUFTLG1CQUFtQixvQkFBb0I7QUFDaEQsU0FBb0IsNkJBQTZCLHNCQUErQjtBQUNoRixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxPQUFPLFlBQVk7QUFFbkIsTUFBTSxpQkFBaUIsb0JBQW9CLFdBQVcsY0FBYztBQUVwRSxNQUFNLHFCQUFxQixNQUFNO0FBQ2hD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
